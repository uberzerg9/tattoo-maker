import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { auth, db } from "../../lib/firebase";
import { AuthContext } from "./authContext";
import type { AuthState } from "./authContext";

type Session = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

/** Who is signed in, and whether they have a profile yet. Wrap the routes in it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [profileOf, setProfileOf] = useState<{ uid: string; exists: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setSession(user ? { status: "signedIn", user } : { status: "signedOut" });
      }),
    [],
  );

  const uid = session.status === "signedIn" ? session.user.uid : null;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => setProfileOf({ uid, exists: snap.exists() }),
      // Unreadable is treated as missing: the person is sent to finish their profile, where a real error shows.
      () => setProfileOf({ uid, exists: false }),
    );
  }, [uid]);

  const refreshUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    await user.reload();
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo<AuthState>(() => {
    const user = session.status === "signedIn" ? session.user : null;
    const profile: AuthState["profile"] = !user || profileOf?.uid !== user.uid ? "loading" : profileOf.exists ? "ready" : "missing";
    return { status: session.status, user, profile, version, refreshUser };
  }, [session, profileOf, version, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
