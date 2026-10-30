const keyOf = (uid: string) => `tt.onboarding.${uid}`;

/** Whether this person has finished or skipped the tour on this device. Storage may be blocked: then it counts as seen, so a broken browser never nags. */
export function hasSeenOnboarding(uid: string): boolean {
  try {
    return window.localStorage.getItem(keyOf(uid)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(uid: string): void {
  try {
    window.localStorage.setItem(keyOf(uid), "1");
  } catch {
    // Nothing to remember it with; hasSeenOnboarding already says "seen" in that case.
  }
}
