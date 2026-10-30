import { useSyncExternalStore } from "react";
import { currentConsent, setConsent, subscribeConsent } from "../../lib/consent";
import type { ConsentChoice } from "../../lib/consent";

/** The analytics cookie choice and a way to change it; re-renders when it changes anywhere in the app. */
export function useConsent(): { choice: ConsentChoice | null; choose: (choice: ConsentChoice) => void } {
  const choice = useSyncExternalStore(subscribeConsent, currentConsent, () => null);
  return { choice, choose: setConsent };
}
