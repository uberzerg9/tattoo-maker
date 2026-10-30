/** Where an error came from; the same Firebase code can deserve a different message. */
export type AuthContext = "login" | "signup" | "reset" | "provider" | "verify" | "account";

export type AuthErrorKey =
  | "invalidCredentials"
  | "emailInUse"
  | "weakPassword"
  | "invalidEmail"
  | "wrongPassword"
  | "emailTaken"
  | "reauthNeeded"
  | "deleteFailed"
  | "tooManyRequests"
  | "network"
  | "popupBlocked"
  | "provider"
  | "unknown";

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.replace(/^auth\//, "") : "";
};

/** Codes that mean the person gave a wrong email or password, or no such account: all look the same. */
const CREDENTIAL_CODES = new Set(["invalid-credential", "wrong-password", "user-not-found", "invalid-login-credentials", "user-disabled", "missing-password"]);

/** The sign-in window was closed or replaced by the person: nothing to say. */
const CANCEL_CODES = new Set(["popup-closed-by-user", "cancelled-popup-request", "user-cancelled"]);

/**
 * The message key for an error, or null when there is nothing to show. A wrong password and
 * an unknown email are the same message, so a login form does not tell anyone whether an
 * account exists.
 */
export function authErrorKey(error: unknown, context: AuthContext): AuthErrorKey | null {
  const code = codeOf(error);
  if (code === "network-request-failed") return "network";
  if (code === "too-many-requests") return "tooManyRequests";
  if (CANCEL_CODES.has(code)) return null;

  switch (context) {
    case "login":
      if (CREDENTIAL_CODES.has(code) || code === "invalid-email") return "invalidCredentials";
      return "unknown";
    case "signup":
      if (code === "email-already-in-use") return "emailInUse";
      if (code === "weak-password") return "weakPassword";
      if (code === "invalid-email") return "invalidEmail";
      return "unknown";
    case "reset":
      if (code === "invalid-email") return "invalidEmail";
      return "unknown";
    case "provider":
      if (code === "popup-blocked") return "popupBlocked";
      return "provider";
    case "verify":
      return "unknown";
    case "account":
      // Changing the email or password, or deleting the account, after asking for the password again.
      if (CREDENTIAL_CODES.has(code)) return "wrongPassword";
      if (code === "email-already-in-use") return "emailTaken";
      if (code === "weak-password") return "weakPassword";
      if (code === "invalid-email") return "invalidEmail";
      // The session can also have been ended elsewhere, for example by opening the link that changes the email.
      if (code === "requires-recent-login" || code === "user-token-expired" || code === "invalid-user-token" || code === "user-mismatch") return "reauthNeeded";
      return "unknown";
  }
}

/**
 * Whether a failed password reset should still be answered with the normal "if an account
 * exists, we sent a link" message. Only problems that say nothing about the account are shown.
 */
export function resetFailureIsSilent(error: unknown): boolean {
  const code = codeOf(error);
  return !["invalid-email", "network-request-failed", "too-many-requests"].includes(code);
}
