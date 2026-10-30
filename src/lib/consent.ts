/** The person's answer to the analytics cookie banner. `null` means they have not answered yet. */
export type ConsentChoice = "granted" | "denied";

const KEY = "tt.analyticsConsent";
const listeners = new Set<() => void>();

/** localStorage can be missing or throw (private windows, blocked site data): then nothing is remembered. */
export function getConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered; the choice still applies for this page view through the listeners.
    memory = choice;
  }
  for (const listener of listeners) listener();
}

let memory: ConsentChoice | null = null;

/** Forgets the answer, so the banner asks again (the footer's "Cookie settings"). */
export function clearConsent(): void {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to remove.
  }
  for (const listener of listeners) listener();
}

/** What is in force now: the stored answer, or the one given on this page when storage is unavailable. */
export function currentConsent(): ConsentChoice | null {
  return getConsent() ?? memory;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
