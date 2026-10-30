import { useState } from "react";
import { useTranslation } from "react-i18next";
import { APPLE_SIGN_IN } from "../../lib/features";
import { authErrorKey } from "./authErrors";
import type { AuthErrorKey } from "./authErrors";
import { signInWithApple, signInWithGoogle } from "./authService";

/** "Continue with Google / Apple". Apple stays disabled until its developer setup exists. */
export function ProviderButtons({ keep, disabled, onError }: { keep: boolean; disabled: boolean; onError: (key: AuthErrorKey | null) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async (signIn: (keep: boolean) => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await signIn(keep);
      // Signed in: the route guards move on (to the Workspace, or to choosing a username).
    } catch (error) {
      onError(authErrorKey(error, "provider"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="providers">
      <button type="button" className="provider" disabled={disabled || busy} onClick={() => void run(signInWithGoogle)}>
        {t("auth.common.google")}
      </button>
      <button
        type="button"
        className="provider"
        disabled={!APPLE_SIGN_IN || disabled || busy}
        title={APPLE_SIGN_IN ? undefined : t("auth.common.appleSoon")}
        onClick={() => void run(signInWithApple)}
      >
        {t("auth.common.apple")}
      </button>
    </div>
  );
}
