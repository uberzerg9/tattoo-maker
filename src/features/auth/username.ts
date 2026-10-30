/** Same pattern as the usernames/{name} rule in firestore.rules. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** What the person typed, as the stored handle: no leading @, no spaces around, lower case. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export const isValidUsername = (handle: string) => USERNAME_PATTERN.test(handle);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A sanity check for the form; the server has the final say. */
export const isPlausibleEmail = (email: string) => EMAIL_PATTERN.test(email.trim());

export const MAX_NAME_LENGTH = 60;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}
