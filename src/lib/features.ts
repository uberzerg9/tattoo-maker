/**
 * Sign in with Apple needs an Apple Developer setup (Services ID, key) that does not exist yet.
 * The button is shown but disabled until `VITE_FEATURE_APPLE_SIGNIN=true` is set.
 */
export const APPLE_SIGN_IN = import.meta.env.VITE_FEATURE_APPLE_SIGNIN === "true";

/**
 * Preview-channel builds run against the real project, so they must not change anything in it:
 * `VITE_DISABLE_WRITES=true` switches off every Firestore, Storage and Cloud Function write (and the sign-up and account
 * changes that would create or alter real accounts). A function, not a constant, so tests can switch it per case.
 */
export const writesDisabled = (): boolean => import.meta.env.VITE_DISABLE_WRITES === "true";

export class WritesDisabledError extends Error {
  constructor() {
    super("Writes are disabled in this preview build");
    this.name = "WritesDisabledError";
  }
}

/** Put at the start of anything that writes: throws in a preview build, so nothing is sent. */
export function assertWritable(): void {
  if (writesDisabled()) throw new WritesDisabledError();
}
