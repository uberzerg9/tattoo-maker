import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { assertWritable } from "../../lib/features";
import { functions } from "../../lib/firebase";

export type SignInMethod = "password" | "google" | "apple";

/** How the person signs in: decides how they are asked for proof before a sensitive change. */
export function signInMethod(user: User): SignInMethod {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes("password")) return "password";
  if (ids.includes("google.com")) return "google";
  return "apple";
}

/**
 * Proves it is still the same person: the password again, or the provider's own window. Firebase
 * only lets recently signed-in users change the email or password or delete the account.
 */
export async function reauthenticate(user: User, password: string): Promise<void> {
  switch (signInMethod(user)) {
    case "password":
      if (!user.email) throw new Error("This account has no email");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      return;
    case "google":
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      return;
    case "apple":
      await reauthenticateWithPopup(user, new OAuthProvider("apple.com"));
      return;
  }
}

/** Sends a link to the new address; the email only changes once it has been used. */
export function requestEmailChange(user: User, newEmail: string): Promise<void> {
  return verifyBeforeUpdateEmail(user, newEmail.trim());
}

export function changePassword(user: User, newPassword: string): Promise<void> {
  return updatePassword(user, newPassword);
}

/** Cloud Function: deletes the profile and everything under it, the username, the Storage files and the sign-in. */
export async function deleteAccountOnServer(): Promise<void> {
  assertWritable();
  await httpsCallable(functions, "deleteAccount")();
}
