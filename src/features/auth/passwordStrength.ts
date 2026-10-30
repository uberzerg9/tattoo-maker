export const MIN_PASSWORD_LENGTH = 8;

export type StrengthStep = 0 | 1 | 2 | 3 | 4;
export type StrengthName = "weak" | "ok" | "good" | "strong";

/**
 * Four steps, one for each thing a password has: eight or more characters, a digit, an
 * upper-case letter, a symbol. The step is how many of them it has.
 */
export function passwordStrength(password: string): StrengthStep {
  let steps = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) steps++;
  if (/[0-9]/.test(password)) steps++;
  if (/[A-Z]/.test(password)) steps++;
  if (/[^A-Za-z0-9]/.test(password)) steps++;
  return steps as StrengthStep;
}

/** The name shown next to the meter; null for an empty password. */
export function strengthName(step: StrengthStep, password: string): StrengthName | null {
  if (password.length === 0) return null;
  return (["weak", "weak", "ok", "good", "strong"] as const)[step];
}

/** A password is accepted from eight characters, whatever its strength. */
export const isPasswordAcceptable = (password: string) => password.length >= MIN_PASSWORD_LENGTH;
