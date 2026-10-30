import { getDownloadURL, ref } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import { storage } from "../../lib/firebase";
import { listenWorks } from "./workRemote";
import type { WorkDoc } from "./workRemote";
import { localStore, workSync } from "./workServices";
import type { LocalWork } from "./workTypes";

export interface WorkListItem {
  id: string;
  title: string;
  /** null while the cloud has not stamped a just-saved work yet. */
  updatedAtMs: number | null;
  previewUrl: string | null;
  /** The newest version is on this device but not in the cloud yet. */
  localOnly: boolean;
}

type Remote = { id: string; data: WorkDoc }[];

/**
 * The person's saved works, newest first: the cloud list (which also works offline from the
 * Firestore cache) plus works that so far exist only on this device. Previews come from the
 * device when it has the work, otherwise from Storage.
 */
export function useWorks(uid: string | null): WorkListItem[] {
  const [remote, setRemote] = useState<Remote>([]);
  const [local, setLocal] = useState<LocalWork[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uid) return;
    return listenWorks(uid, setRemote, () => undefined);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const refresh = () => {
      localStore.listWorks(uid).then(
        (works) => alive && setLocal(works),
        () => undefined,
      );
    };
    refresh();
    const off = workSync.onChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [uid]);

  const items = useMemo<Omit<WorkListItem, "previewUrl">[]>(() => {
    const byId = new Map<string, Omit<WorkListItem, "previewUrl">>();
    for (const { id, data } of remote) {
      byId.set(id, {
        id,
        title: data.title,
        updatedAtMs: data.updatedAt?.toMillis() ?? null,
        localOnly: false,
      });
    }
    for (const w of local) {
      const pending = w.syncedAtMs !== w.savedAtMs;
      const known = byId.get(w.workId);
      if (!known || (pending && w.savedAtMs > (known.updatedAtMs ?? 0))) {
        byId.set(w.workId, { id: w.workId, title: w.meta.title, updatedAtMs: w.savedAtMs, localOnly: pending });
      }
    }
    // A work the cloud has not stamped yet was saved a moment ago: first.
    return [...byId.values()].sort((a, b) => (b.updatedAtMs ?? Infinity) - (a.updatedAtMs ?? Infinity));
  }, [remote, local]);

  // Preview images: object URLs for the device's copies, download URLs for the rest.
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const next: Record<string, string> = {};
    const jobs: Promise<void>[] = [];
    for (const w of local) {
      const url = URL.createObjectURL(w.preview);
      made.push(url);
      next[w.workId] = url;
    }
    for (const { id, data } of remote) {
      if (next[id]) continue;
      jobs.push(
        getDownloadURL(ref(storage, data.previewPath)).then(
          (url) => {
            next[id] = url;
          },
          () => undefined,
        ),
      );
    }
    void Promise.all(jobs).then(() => {
      if (alive) setUrls(next);
    });
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [remote, local]);

  return useMemo(() => items.map((item) => ({ ...item, previewUrl: urls[item.id] ?? null })), [items, urls]);
}
