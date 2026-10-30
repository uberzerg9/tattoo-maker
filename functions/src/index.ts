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

// Callables answer only the real app: App Check is enforced everywhere except the local emulator,
// which does not issue App Check tokens.
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

// The sign-in behind a destructive call must be this fresh (the app asks for the password right before).
const MAX_AUTH_AGE_S = 5 * 60;

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

export const deleteAccount = onCall({ enforceAppCheck }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first");
  const authTime = req.auth?.token.auth_time;
  if (typeof authTime !== "number" || Date.now() / 1000 - authTime > MAX_AUTH_AGE_S) {
    throw new HttpsError("unauthenticated", "Sign in again to delete the account");
  }
  const user = await db.doc(`users/${uid}`).get();
  const username = user.get("username");
  await db.recursiveDelete(db.doc(`users/${uid}`));
  if (username) await db.doc(`usernames/${username}`).delete();
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${uid}/` });
  await getAuth().deleteUser(uid);
});
