import { track } from "../../lib/analytics";
import { useEffect } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TattooEngine } from "../../engine";
import { DEBUG } from "../../lib/debug";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthUser } from "../session/useAuthUser";
import { signOutUser } from "../auth/authService";
import { openWork, saveWork, startNewWork } from "./workActions";
import { localStore, workSync } from "./workServices";

/** How often a changed work is saved by itself. `?debug=1&autosaveMs=2000` shortens it for tests. */
const AUTOSAVE_MS = (DEBUG && Number(new URLSearchParams(window.location.search).get("autosaveMs"))) || 30_000;

const store = useWorkspaceStore;

/**
 * Saving and opening works: SAVE, autosave while there are changes, a final save when the
 * Workspace is left, uploads that were waiting for the network, and the New / Open requests.
 *
 * Call this before useEngine: React runs cleanups in declaration order, and the last save has
 * to read the sheet before the engine is destroyed.
 */
export function useWorkPersistence(engineRef: RefObject<TattooEngine | null>) {
  const { t } = useTranslation();
  const uid = useAuthUser()?.uid ?? null;
  const engineReady = useWorkspaceStore((s) => s.engineReady);

  // The engine is new on every visit, so the work is too: a visit starts on a blank sheet with the
  // person's defaults. A saved work comes back through ?work=<id> or the profile.
  useEffect(() => {
    store.getState().startFreshWork();
  }, []);

  // Status of the uploads → the header indicator.
  useEffect(() => workSync.onStatus((status) => store.getState().setSaveStatus(status)), []);

  // SAVE button.
  useEffect(
    () =>
      store.subscribe(
        (s) => s.saveCount,
        () => {
          const engine = engineRef.current;
          // Only the SAVE button counts for analytics, not the autosave.
          if (engine) void saveWork(engine).then((saved) => saved && track.workSaved({ passes: store.getState().score.passes }));
        },
      ),
    [engineRef],
  );

  // Changes that are not in the engine's own events: the skin tone and the stencil's placement.
  useEffect(() => {
    const markDirty = () => {
      const s = store.getState();
      if (s.workLoading) return;
      // A blank sheet that only had the person's defaults applied is not a change worth saving.
      if (!s.workSaved && !s.sketch && s.score.passes === 0) return;
      s.setDirty(true);
    };
    const offSkin = store.subscribe((s) => s.skinTone, markDirty);
    const offPlacement = store.subscribe((s) => s.stencilPlacement, () => {
      if (store.getState().sketch) markDirty();
    });
    return () => {
      offSkin();
      offPlacement();
    };
  }, []);

  // Autosave, and retrying whatever could not be uploaded.
  useEffect(() => {
    if (!uid) return;
    const flush = async () => {
      try {
        await workSync.flush(await localStore.listWorks(uid));
      } catch {
        // still offline or the device storage is unavailable; the next tick tries again
      }
    };
    const tick = () => {
      const engine = engineRef.current;
      const s = store.getState();
      if (engine && s.dirty && s.saveStatus !== "saving" && !s.workLoading) void saveWork(engine);
      else void flush();
    };
    const timer = window.setInterval(tick, AUTOSAVE_MS);
    window.addEventListener("online", flush);
    void flush();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [uid, engineRef]);

  // Leaving the page or the Workspace: save what has changed. The sheet is read right away, before
  // anything is torn down; the encoding and upload finish in the background (the copy on this device
  // is written first, so even a closing tab keeps what it managed).
  useEffect(() => {
    const leave = () => {
      const engine = engineRef.current;
      if (engine && store.getState().dirty) void saveWork(engine);
    };
    // visibilitychange fires earlier than pagehide when a tab closes, which leaves the encoding more time.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
  }, [engineRef]);

  // New and Open, asked for by the header and the profile.
  useEffect(
    () =>
      store.subscribe(
        (s) => s.workRequest,
        (request) => {
          const engine = engineRef.current;
          if (!request || !engine) return;
          const state = store.getState();
          if (request.kind === "logout") {
            // Save first: once the person is signed out nothing can be written under their name.
            state.requestWork(null);
            void (async () => {
              if (store.getState().dirty) await saveWork(engine);
              store.getState().flushSession();
              await signOutUser();
            })();
            return;
          }
          if (state.dirty && !window.confirm(t("workspace.work.confirmDiscard"))) {
            state.requestWork(null);
            return;
          }
          state.flushSession(); // the session of the work being left is written under its own id
          if (request.kind === "new") {
            startNewWork(engine);
          } else {
            void openWork(engine, request.id).catch(() => window.alert(t("workspace.work.openFailed")));
          }
          state.requestWork(null);
        },
      ),
    [engineRef, t],
  );

  // A reload (or a link) with ?work=<id> opens that work once the engine and the user are there.
  useEffect(() => {
    if (!uid || !engineReady) return;
    const id = new URLSearchParams(window.location.search).get("work");
    const engine = engineRef.current;
    if (!id || !engine || store.getState().workId === id) return;
    void openWork(engine, id).catch(() => window.alert(t("workspace.work.openFailed")));
  }, [uid, engineReady, engineRef, t]);
}
