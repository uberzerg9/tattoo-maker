import { useCallback, useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { useAuth } from "./authContext";
import { authErrorKey } from "./authErrors";
import type { AuthErrorKey } from "./authErrors";
import { sendVerification } from "./authService";
import { RESEND_COOLDOWN_MS, cooldownSecondsLeft } from "./cooldown";

/** How often a waiting banner asks the server whether the link has been clicked. */
const POLL_MS = 15_000;

export type VerificationMessage = { kind: "sent" } | { kind: "notYet" } | { kind: "error"; key: AuthErrorKey };

/**
 * State of the "verify your email" banner: shown while a password account's email is not
 * verified. It rechecks when the tab gets focus back and every so often, and the resend button
 * waits out a cooldown after each send.
 */
export function useEmailVerification() {
  const { user, refreshUser, version } = useAuth();
  // `version` changes when the user object was reloaded in place.
  void version;
  const needsVerification = Boolean(user && !user.emailVerified && user.providerData.some((p) => p.providerId === "password"));
  const email = user?.email ?? "";

  // The first email goes out at sign-up, so a resend has to wait from the moment the banner first shows.
  const [sentAt, setSentAt] = useState<number | null>(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<VerificationMessage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needsVerification) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void refreshUser().catch(() => undefined), POLL_MS);
    const onFocus = () => void refreshUser().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [needsVerification, refreshUser]);

  const secondsLeft = cooldownSecondsLeft(sentAt, now, RESEND_COOLDOWN_MS);

  const resend = useCallback(async () => {
    if (!user || busy || cooldownSecondsLeft(sentAt, Date.now()) > 0) return;
    setBusy(true);
    try {
      await sendVerification(user);
      setSentAt(Date.now());
      setNow(Date.now());
      setMessage({ kind: "sent" });
    } catch (error) {
      setMessage({ kind: "error", key: authErrorKey(error, "verify") ?? "unknown" });
      // Firebase says "too many requests" when it has refused: wait out the cooldown before the next try.
      if (authErrorKey(error, "verify") === "tooManyRequests") setSentAt(Date.now());
    } finally {
      setBusy(false);
    }
  }, [user, busy, sentAt]);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      await refreshUser();
      if (!auth.currentUser?.emailVerified) setMessage({ kind: "notYet" });
    } catch (error) {
      setMessage({ kind: "error", key: authErrorKey(error, "verify") ?? "unknown" });
    } finally {
      setBusy(false);
    }
  }, [refreshUser]);

  return { needsVerification, email, secondsLeft, message, busy, resend, check };
}
