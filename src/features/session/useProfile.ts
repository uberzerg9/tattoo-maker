import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";

/** "Test Tattooer" → "TT". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export interface ProfileStats {
  sessions: number;
  hours: number;
  avgDeviationMm: number;
  streakDays: number;
}

export interface Profile {
  name?: string;
  username?: string;
  level?: "never" | "fake" | "apprentice";
  language?: "en" | "ru" | "ro";
  settings?: { skinTone?: string; machineHz?: number; units?: string; panelLayout?: unknown };
  stats?: ProfileStats;
}

/** Live users/{uid} document; the statistics in it are written by the Cloud Function. */
export function useProfile(uid: string | null): Profile | null {
  const [loaded, setLoaded] = useState<{ uid: string; profile: Profile | null } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => setLoaded({ uid, profile: (snap.data() as Profile | undefined) ?? null }),
      () => setLoaded({ uid, profile: null }),
    );
  }, [uid]);
  return loaded && loaded.uid === uid ? loaded.profile : null;
}
