import { Timestamp, addDoc, collection } from "firebase/firestore";
import { writesDisabled } from "../../lib/features";
import { db } from "../../lib/firebase";
import type { SessionRecord } from "./session";

/** Writes users/{uid}/sessions/{id}. The Cloud Function onSessionCreated updates users/{uid}.stats. */
export async function writeSession(uid: string, session: SessionRecord): Promise<void> {
  if (writesDisabled()) return; // a preview records no practice
  await addDoc(collection(db, "users", uid, "sessions"), {
    workId: session.workId,
    startedAt: Timestamp.fromDate(session.startedAt),
    endedAt: Timestamp.fromDate(session.endedAt),
    passes: session.passes,
    deviationMm: session.deviationMm,
    traumaLevel: session.traumaLevel,
  });
}
