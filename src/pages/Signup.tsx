import { writesDisabled } from "../lib/features";
import { track } from "../lib/analytics";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { AuthLayout, BoltSticker, MachineSticker, StarSticker } from "../features/auth/AuthLayout";
import { useAuth } from "../features/auth/authContext";
import { authErrorKey } from "../features/auth/authErrors";
import type { AuthErrorKey } from "../features/auth/authErrors";
import { UsernameTakenError, claimProfile, createAccount, sendVerification } from "../features/auth/authService";
import type { AppLanguage, ExperienceLevel } from "../features/auth/authService";
import { ChipGroup, PasswordField, StrengthMeter, TextField } from "../features/auth/fields";
import { isPasswordAcceptable } from "../features/auth/passwordStrength";
import { isPlausibleEmail, isValidName, isValidUsername, normalizeUsername } from "../features/auth/username";
import { LANGUAGES } from "../features/workspace/config";
import type { LanguageId } from "../features/workspace/config";

type FieldKey = "name" | "username" | "email" | "password";
type FieldErrors = Partial<Record<FieldKey, string>>;

const LEVELS: ExperienceLevel[] = ["never", "fake", "apprentice"];

function SignupHero() {
  const { t } = useTranslation();
  const bullets = ["b1", "b2", "b3"] as const;
  return (
    <>
      <div className="auth__stickers" aria-hidden="true">
        <span className="auth__pill auth__pill--yellow signup-pill">{t("auth.signup.sticker")}</span>
        <StarSticker fill="#C8FF2E" label={t("auth.stickers.new")} className="sticker--signup-star" />
        <BoltSticker fill="#FF4FB0" className="sticker--signup-bolt" />
        <MachineSticker fill="#C9B8FF" className="sticker--signup-machine" />
      </div>
      <div className="auth__hero-text">
        <h1 className="auth__logo auth__logo--signup">
          {t("auth.signup.heroA")}
          <br />
          <span className="auth__logo-accent">{t("auth.signup.heroB")}</span>
          <br />
          {t("auth.signup.heroC")}
        </h1>
        <ul className="auth__bullets">
          {bullets.map((b) => (
            <li key={b}>{t(`auth.signup.${b}`)}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Sign up, and the same form for finishing a profile: after Google, or after "username taken".
 * Once an account exists (`user`), only the profile fields remain; the account is never created twice.
 */
export default function Signup() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const finishing = user !== null;

  const [name, setName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<ExperienceLevel>("never");
  const [language, setLanguage] = useState<AppLanguage>((i18n.resolvedLanguage as AppLanguage) ?? "en");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  const pickLanguage = (id: LanguageId) => {
    setLanguage(id);
    void i18n.changeLanguage(id);
  };

  const validate = (): FieldErrors => {
    const found: FieldErrors = {};
    if (!isValidName(name)) found.name = t("auth.errors.nameRequired");
    if (!isValidUsername(normalizeUsername(username))) found.username = t("auth.errors.usernameInvalid");
    if (!finishing) {
      if (!isPlausibleEmail(email)) found.email = t("auth.errors.invalidEmail");
      if (!isPasswordAcceptable(password)) found.password = t("auth.errors.passwordShort");
    }
    return found;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      let account = user;
      if (!account) {
        account = await createAccount(email, password);
        // The first send is at sign-up; the banner offers a resend with a cooldown.
        void sendVerification(account).catch(() => undefined);
      }
      await claimProfile(account.uid, { name, username: normalizeUsername(username), level, language });
      const provider = account.providerData[0]?.providerId;
      track.signUp({ method: provider === "google.com" ? "google" : provider === "apple.com" ? "apple" : "email", level, language });
      // The profile now exists: the route guard moves on to the Workspace.
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        setErrors({ username: t("auth.errors.usernameTaken") });
      } else {
        setFormError(authErrorKey(err, "signup") ?? "unknown");
      }
      setBusy(false);
    }
  };

  return (
    <AuthLayout hero={<SignupHero />}>
      <section className="auth-card auth-card--signup" aria-labelledby="signup-title">
        <div className="auth-card__head auth-card__head--pink">
          <h2 id="signup-title" className="auth-card__title">
            {finishing ? t("auth.complete.title") : t("auth.signup.title")}
          </h2>
          {!finishing && <span className="auth-card__badge">{t("auth.signup.badge")}</span>}
        </div>
        <form className="auth-card__form" onSubmit={(e) => void submit(e)} noValidate>
          {finishing && (
            <p className="form-note" data-testid="complete-intro">
              {errors.username === t("auth.errors.usernameTaken")
                ? t("auth.complete.taken")
                : t("auth.complete.intro", { email: user?.email ?? "" })}
            </p>
          )}
          <div className="field-pair">
            <TextField
              label={t("auth.signup.name")}
              name="name"
              autoComplete="name"
              placeholder={t("auth.signup.namePlaceholder")}
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t("auth.signup.username")}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("auth.signup.usernamePlaceholder")}
              value={username}
              error={errors.username}
              hint={t("auth.signup.usernameHint")}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          {!finishing && (
            <>
              <TextField
                label={t("auth.common.email")}
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t("auth.common.emailPlaceholder")}
                value={email}
                error={errors.email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="field-stack">
                <PasswordField
                  label={t("auth.common.password")}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder={t("auth.signup.passwordPlaceholder")}
                  value={password}
                  error={errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <StrengthMeter password={password} />
              </div>
            </>
          )}
          <ChipGroup
            variant="pill"
            label={t("auth.signup.level")}
            value={level}
            options={LEVELS.map((id) => ({ id, label: t(`auth.signup.levels.${id}`) }))}
            onChange={setLevel}
          />
          <ChipGroup
            variant="square"
            label={t("auth.signup.language")}
            value={language}
            options={LANGUAGES.map((l) => ({ id: l.id, label: l.native }))}
            onChange={pickLanguage}
          />
          <label className="check check--top">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              <Trans
                i18nKey="auth.signup.agree"
                components={{
                  terms: <a href="/terms" target="_blank" rel="noreferrer" />,
                  privacy: <a href="/privacy" target="_blank" rel="noreferrer" />,
                }}
              />
            </span>
          </label>
          {writesDisabled() && (
            <p className="form-note" data-testid="signup-disabled">
              {t("preview.signupDisabled")}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              {t(`auth.errors.${formError}`)}
            </p>
          )}
          <button type="submit" className="auth-submit auth-submit--lime" disabled={!terms || busy || writesDisabled()}>
            {busy ? t("auth.signup.busy") : finishing ? t("auth.complete.submit") : t("auth.signup.submit")}
          </button>
          {!finishing && (
            <p className="auth-switch">
              {t("auth.signup.already")}{" "}
              <Link to="/login" className="auth-switch__link">
                {t("auth.signup.login")}
              </Link>
            </p>
          )}
        </form>
      </section>
    </AuthLayout>
  );
}
