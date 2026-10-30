import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout, BoltSticker, MachineSticker, SmileySticker, StarSticker } from "../features/auth/AuthLayout";
import { authErrorKey } from "../features/auth/authErrors";
import type { AuthErrorKey } from "../features/auth/authErrors";
import { signInWithEmail } from "../features/auth/authService";
import { PasswordField, TextField } from "../features/auth/fields";
import { ProviderButtons } from "../features/auth/ProviderButtons";
import { isPlausibleEmail } from "../features/auth/username";

function LoginHero() {
  const { t } = useTranslation();
  return (
    <>
      <div className="auth__stickers" aria-hidden="true">
        <span className="auth__pill auth__pill--lime login-pill">{t("auth.login.sticker")}</span>
        <StarSticker fill="#FF4FB0" label={t("auth.stickers.ink")} className="sticker--login-star" />
        <SmileySticker className="sticker--login-smile" />
        <MachineSticker fill="#4D6BFF" className="sticker--login-machine" />
        <BoltSticker fill="#C8FF2E" className="sticker--login-bolt" />
      </div>
      <div className="auth__hero-text">
        <h1 className="auth__logo">
          {t("workspace.brand.a")}
          <span className="auth__logo-star">✶</span>
          <br />
          {t("workspace.brand.b")}
        </h1>
        <p className="auth__tagline">{t("auth.login.tagline")}</p>
      </div>
    </>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; password?: boolean }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const missing = { email: !isPlausibleEmail(email), password: password.length === 0 };
    setFieldErrors(missing);
    if (missing.email || missing.password) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password, keep);
    } catch (err) {
      setError(authErrorKey(err, "login") ?? "unknown");
      setBusy(false);
    }
  };

  return (
    <AuthLayout hero={<LoginHero />}>
      <section className="auth-card auth-card--login" aria-labelledby="login-title">
        <div className="auth-card__head auth-card__head--lime">
          <h2 id="login-title" className="auth-card__title">
            {t("auth.login.title")}
          </h2>
        </div>
        <form className="auth-card__form" onSubmit={(e) => void submit(e)} noValidate>
          <TextField
            label={t("auth.common.email")}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t("auth.common.emailPlaceholder")}
            value={email}
            error={fieldErrors.email ? t("auth.errors.invalidEmail") : null}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            label={t("auth.common.password")}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            error={fieldErrors.password ? t("auth.errors.required") : null}
            onChange={(e) => setPassword(e.target.value)}
            action={
              <Link to="/forgot-password" className="auth-link">
                {t("auth.login.forgot")}
              </Link>
            }
          />
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            {t("auth.login.keep")}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {t(`auth.errors.${error}`)}
            </p>
          )}
          <button type="submit" className="auth-submit auth-submit--pink" disabled={busy}>
            {busy ? t("auth.login.busy") : t("auth.login.submit")}
          </button>
          <div className="auth-or">{t("auth.common.or")}</div>
          <ProviderButtons keep={keep} disabled={busy} onError={setError} />
          <p className="auth-switch">
            {t("auth.login.newHere")}{" "}
            <Link to="/signup" className="auth-switch__link">
              {t("auth.login.create")}
            </Link>
          </p>
        </form>
      </section>
    </AuthLayout>
  );
}
