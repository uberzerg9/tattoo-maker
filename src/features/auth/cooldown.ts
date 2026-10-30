/** How long before the verification email can be sent again. */
export const RESEND_COOLDOWN_MS = 60_000;

/** Whole seconds left of a cooldown that started at `sentAt`; 0 when it is over or never started. */
export function cooldownSecondsLeft(sentAt: number | null, now: number, cooldownMs = RESEND_COOLDOWN_MS): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + cooldownMs - now) / 1000));
}
