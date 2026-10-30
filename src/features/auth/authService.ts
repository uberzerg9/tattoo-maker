import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { assertWritable } from "../../lib/features";
import { auth, db } from "../../lib/firebase";

export type ExperienceLevel = "never" | "fake" | "apprentice";
export type AppLanguage = "en" | "ru" | "ro";

export interface ProfileInput {
  name: string;
  /** Already normalised: lower case, no @. */
  username: string;
  level: ExperienceLevel;
  language: AppLanguage;
}

/** Someone else already has the username. The account stays; the person picks another name. */
export class UsernameTakenError extends Error {
  readonly code = "username-taken";
}

/** "Keep me logged in" decides where the session is remembered: on this device, or until the tab closes. */
async function remember(keep: boolean): Promise<void> {
  await setPersistence(auth, keep ? browserLocalPersistence : browserSessionPersistence);
}

/** The account only; the profile and the username come next (claimProfile). */
export async function createAccount(email: string, password: string): Promise<User> {
  await remember(true);
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return user;
}

/**
 * Takes the username and creates users/{uid} in one transaction, so two people can never end up
 * with the same name. Throws UsernameTakenError when it is taken; nothing is written then.
 */
export async function claimProfile(uid: string, input: ProfileInput): Promise<void> {
  assertWritable();
  await runTransaction(db, async (tx) => {
    const nameRef = doc(db, "usernames", input.username);
    if ((await tx.get(nameRef)).exists()) throw new UsernameTakenError(input.username);
    tx.set(nameRef, { uid });
    tx.set(doc(db, "users", uid), {
      name: input.name.trim(),
      username: input.username,
      level: input.level,
      language: input.language,
      createdAt: serverTimestamp(),
      settings: { skinTone: "t2", machineHz: 85, units: "cm" },
    });
  });
}

export function sendVerification(user: User): Promise<void> {
  return sendEmailVerification(user);
}

export async function signInWithEmail(email: string, password: string, keep: boolean): Promise<void> {
  await remember(keep);
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInWithGoogle(keep: boolean): Promise<void> {
  await remember(keep);
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithApple(keep: boolean): Promise<void> {
  await remember(keep);
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  await signInWithPopup(auth, provider);
}

export function sendReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email.trim());
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}
