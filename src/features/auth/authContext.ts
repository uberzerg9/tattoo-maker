import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

export interface AuthState {
  /** loading until Firebase has said whether anyone is signed in. */
  status: "loading" | "signedOut" | "signedIn";
  user: User | null;
  /** Whether users/{uid} exists: missing for a new Google account, or a sign-up whose username was taken. */
  profile: "loading" | "missing" | "ready";
  /** Bumped when the user object changed in place (emailVerified after a reload). */
  version: number;
  /** Reloads the user from the server, so emailVerified is current. */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth needs an AuthProvider");
  return value;
}
