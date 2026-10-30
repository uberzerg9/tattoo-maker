import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { TattooEngine } from "../../engine";
import { track } from "../../lib/analytics";
import { auth } from "../../lib/firebase";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { buildSession } from "./session";
import { writeSession } from "./sessionService";

/**
 * Writes a practice session when the person saves or leaves the Workspace. A session covers the
 * strokes since the last one; saving starts the next. Nothing is written without a signed-in
 * user, without strokes, or without a measured deviation.
 */
export function useSession(engineRef: RefObject<TattooEngine | null>) {
  const startedAt = useRef(new Date());

  const end = useCallback(() => {
    const engine = engineRef.current;
    const uid = auth.currentUser?.uid;
    if (!engine || !uid) return;
    const endedAt = new Date();
    const session = buildSession(engine.sessionScore(), { workId: useWorkspaceStore.getState().workId, startedAt: startedAt.current, endedAt });
    if (!session) return;
    track.sessionEnd({
      duration_s: Math.round((endedAt.getTime() - startedAt.current.getTime()) / 1000),
      deviation_mm: Math.round(session.deviationMm * 100) / 100,
      trauma_level: session.traumaLevel,
    });
    // Firestore's persistent cache keeps the write if the page goes away before it is sent.
    writeSession(uid, session).catch(() => undefined);
    engine.startSession();
    startedAt.current = endedAt;
  }, [engineRef]);

  useEffect(() => useWorkspaceStore.subscribe((s) => s.saveCount, end), [end]);
  // Asked for just before the person switches to another work.
  useEffect(() => useWorkspaceStore.subscribe((s) => s.sessionFlushCount, end), [end]);

  useEffect(() => {
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      end(); // leaving the Workspace
    };
  }, [end]);
}
