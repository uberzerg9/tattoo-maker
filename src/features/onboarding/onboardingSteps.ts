/** The first-run tips, in order. `target` is what the tip points at; the words are in `onboarding.<id>`. */
export const ONBOARDING_STEPS = [
  { id: "cartridge", target: ".panel--carts" },
  { id: "dip", target: ".btn--dip" },
  { id: "stencil", target: ".panel--stencil" },
  { id: "draw", target: ".sheet" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
