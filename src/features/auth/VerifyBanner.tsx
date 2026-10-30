import { useTranslation } from "react-i18next";
import { useEmailVerification } from "./useEmailVerification";
import "./auth.css";

/** "Verify your email" strip for the Workspace, shown until the link in the email has been used. */
export function VerifyBanner() {
  const { t } = useTranslation();
  const { needsVerification, email, secondsLeft, message, busy, resend, check } = useEmailVerification();
  if (!needsVerification) return null;

  let note: string | null = null;
  if (message?.kind === "sent") note = t("auth.verify.sent");
  else if (message?.kind === "notYet") note = t("auth.verify.notYet");
  else if (message?.kind === "error") note = t(`auth.errors.${message.key}`);

  return (
    <div className="verify-banner" role="region" aria-label={t("auth.verify.region")} data-testid="verify-banner">
      <span className="verify-banner__text">{t("auth.verify.text", { email })}</span>
      <button type="button" className="btn btn--yellow" disabled={busy || secondsLeft > 0} onClick={() => void resend()}>
        {secondsLeft > 0 ? t("auth.verify.resendIn", { seconds: secondsLeft }) : t("auth.verify.resend")}
      </button>
      <button type="button" className="btn btn--white" disabled={busy} onClick={() => void check()}>
        {t("auth.verify.check")}
      </button>
      {note && (
        <span className="verify-banner__note" role="status">
          {note}
        </span>
      )}
    </div>
  );
}
