import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout, BoltSticker, StarSticker } from "../features/auth/AuthLayout";
import { authErrorKey, resetFailureIsSilent } from "../features/auth/authErrors";
import type { AuthErrorKey } from "../features/auth/authErrors";
import { sendReset } from "../features/auth/authService";
import { TextField } from "../features/auth/fields";
import { isPlausibleEmail } from "../features/auth/username";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorKey | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isPlausibleEmail(email)) {
      setError("invalidEmail");
      return;
    }
    setBusy(true);
    try {
      await sendReset(email);
      setSentTo(email.trim());
    } catch (err) {
      // Whether the account exists is never shown: only failures that say nothing about it are.
      if (resetFailureIsSilent(err)) setSentTo(email.trim());
      else setError(authErrorKey(err, "reset") ?? "unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      hero={
        <div className="auth__stickers" aria-hidden="true">
          <StarSticker fill="#FFE14D" label={t("auth.stickers.oops")} className="sticker--forgot-star" />
          <BoltSticker fill="#FF4FB0" className="sticker--forgot-bolt" />
        </div>
      }
    >
      <section className="auth-card auth-card--login" aria-labelledby="forgot-title">
        <div className="auth-card__head auth-card__head--yellow">
          <h2 id="forgot-title" className="auth-card__title">
            {t("auth.forgot.title")}
          </h2>
        </div>
        <form className="auth-card__form" onSubmit={(e) => void submit(e)} noValidate>
          {sentTo ? (
            <p className="form-note" role="status" data-testid="reset-sent">
              {t("auth.forgot.sent", { email: sentTo })}
            </p>
          ) : (
            <>
              <p className="auth-intro">{t("auth.forgot.intro")}</p>
              <TextField
                label={t("auth.common.email")}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t("auth.common.emailPlaceholder")}
                value={email}
                error={error === "invalidEmail" ? t("auth.errors.invalidEmail") : null}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && error !== "invalidEmail" && (
                <p className="form-error" role="alert">
                  {t(`auth.errors.${error}`)}
                </p>
              )}
              <button type="submit" className="auth-submit auth-submit--pink" disabled={busy}>
                {t("auth.forgot.submit")}
              </button>
            </>
          )}
          <p className="auth-switch">
            <Link to="/login" className="auth-switch__link">
              {t("auth.forgot.back")}
            </Link>
          </p>
        </form>
      </section>
    </AuthLayout>
  );
}
