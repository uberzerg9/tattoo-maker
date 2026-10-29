import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

initializeApp();
setGlobalOptions({ region: "europe-west3", maxInstances: 10 });
const db = getFirestore();

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const onSessionCreated = onDocumentCreated(
  "users/{uid}/sessions/{sid}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const userRef = db.doc(`users/${event.params.uid}`);

    await db.runTransaction(async (tx) => {
      const session = await tx.get(snap.ref);
      if (session.get("counted")) return; // событие может прийти дважды

      const s = session.data()!;
      const user = await tx.get(userRef);
      const st = user.get("stats") ?? {
        sessions: 0,
        hours: 0,
        avgDeviationMm: 0,
        streakDays: 0,
        lastDay: null,
      };

      const start = s.startedAt.toMillis();
      const n = st.sessions + 1;
      const today = dayOf(start);
      const yesterday = dayOf(start - 864e5);
      const streak =
        st.lastDay === today
          ? st.streakDays
          : st.lastDay === yesterday
            ? st.streakDays + 1
            : 1;

      tx.update(userRef, {
        stats: {
          sessions: n,
          hours: st.hours + (s.endedAt.toMillis() - start) / 36e5,
          avgDeviationMm: (st.avgDeviationMm * st.sessions + s.deviationMm) / n,
          streakDays: streak,
          lastDay: today,
        },
      });
      tx.update(snap.ref, { counted: true });
    });
  },
);

export const deleteAccount = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");
  const user = await db.doc(`users/${uid}`).get();
  const username = user.get("username");
  await db.recursiveDelete(db.doc(`users/${uid}`));
  if (username) await db.doc(`usernames/${username}`).delete();
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${uid}/` });
  await getAuth().deleteUser(uid);
});
