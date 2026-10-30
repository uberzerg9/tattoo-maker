import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "../../lib/firebase";
import { authErrorKey } from "../auth/authErrors";
import type { AuthErrorKey } from "../auth/authErrors";
import { signOutUser } from "../auth/authService";
import { PasswordField, StrengthMeter, TextField } from "../auth/fields";
import { isPasswordAcceptable } from "../auth/passwordStrength";
import { isPlausibleEmail } from "../auth/username";
import { localStore } from "../works/workServices";
import { changePassword, deleteAccountOnServer, reauthenticate, requestEmailChange, signInMethod } from "./accountService";
import { Modal } from "./Modal";

interface DialogProps {
  onClose: () => void;
}

/** Asks for the password again, or tells the person a provider window will open. */
function ReauthField({ password, onChange, error }: { password: string; onChange: (v: string) => void; error?: string | null }) {
  const { t } = useTranslation();
  const user = auth.currentUser;
  if (!user) return null;
  if (signInMethod(user) !== "password") return <p className="auth-intro">{t("profilePage.reauth.provider")}</p>;
  return (
    <PasswordField
      label={t("profilePage.reauth.password")}
      name="current-password"
      autoComplete="current-password"
      value={password}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Wrong password and the like, as text. */
function ErrorLine({ keyName }: { keyName: AuthErrorKey | null }) {
  const { t } = useTranslation();
  if (!keyName) return null;
  return (
    <p className="form-error" role="alert">
      {t(`auth.errors.${keyName}`)}
    </p>
  );
}

export function RenameDialog({ title, onSave, onClose }: DialogProps & { title: string; onSave: (title: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = value.trim();
    if (clean.length === 0 || clean.length > 120) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSave(clean);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Modal title={t("profilePage.works.renameTitle")} onClose={onClose} busy={busy}>
      <form className="modal__form" onSubmit={(e) => void submit(e)}>
        <TextField label={t("profilePage.works.titleLabel")} value={value} maxLength={120} autoFocus onChange={(e) => setValue(e.target.value)} />
        {failed && (
          <p className="form-error" role="alert">
            {t("profilePage.failed")}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--lg" disabled={busy} onClick={onClose}>
            {t("profilePage.cancel")}
          </button>
          <button type="submit" className="btn btn--lg btn--raised btn--lime" disabled={busy || value.trim().length === 0}>
            {t("profilePage.works.rename")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteWorkDialog({ title, onDelete, onClose }: DialogProps & { title: string; onDelete: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onDelete();
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Modal title={t("profilePage.works.deleteTitle")} onClose={onClose} busy={busy} tone="pink">
      <div className="modal__form">
        <p className="auth-intro">{t("profilePage.works.deleteText", { title })}</p>
        {failed && (
          <p className="form-error" role="alert">
            {t("profilePage.failed")}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--lg" disabled={busy} onClick={onClose} autoFocus>
            {t("profilePage.cancel")}
          </button>
          <button type="button" className="btn btn--lg btn--raised btn--pink" disabled={busy} onClick={() => void confirm()}>
            {t("profilePage.works.delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ChangeEmailDialog({ onClose }: DialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setError(null);
    const invalid = !isPlausibleEmail(email) || email.trim().toLowerCase() === user.email?.toLowerCase();
    setEmailError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      await reauthenticate(user, password);
      await requestEmailChange(user, email);
      setSentTo(email.trim());
    } catch (err) {
      setError(authErrorKey(err, "account") ?? "unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("profilePage.email.title")} onClose={onClose} busy={busy}>
      {sentTo ? (
        <div className="modal__form">
          <p className="form-note" role="status" data-testid="email-change-sent">
            {t("profilePage.email.sent", { email: sentTo })}
          </p>
          <div className="modal__actions">
            <button type="button" className="btn btn--lg btn--raised btn--lime" onClick={onClose}>
              {t("profilePage.close")}
            </button>
          </div>
        </div>
      ) : (
        <form className="modal__form" onSubmit={(e) => void submit(e)} noValidate>
          <p className="auth-intro">{t("profilePage.email.intro")}</p>
          <TextField
            label={t("profilePage.email.newEmail")}
            type="email"
            name="new-email"
            autoComplete="email"
            value={email}
            error={emailError ? t("auth.errors.invalidEmail") : null}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
          <ReauthField password={password} onChange={setPassword} />
          <ErrorLine keyName={error} />
          <div className="modal__actions">
            <button type="button" className="btn btn--lg" disabled={busy} onClick={onClose}>
              {t("profilePage.cancel")}
            </button>
            <button type="submit" className="btn btn--lg btn--raised btn--lime" disabled={busy}>
              {t("profilePage.email.send")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ChangePasswordDialog({ onClose }: DialogProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [shortError, setShortError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setError(null);
    setShortError(!isPasswordAcceptable(next));
    if (!isPasswordAcceptable(next)) return;
    setBusy(true);
    try {
      await reauthenticate(user, current);
      await changePassword(user, next);
      setDone(true);
    } catch (err) {
      setError(authErrorKey(err, "account") ?? "unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("profilePage.password.title")} onClose={onClose} busy={busy}>
      {done ? (
        <div className="modal__form">
          <p className="form-note" role="status" data-testid="password-changed">
            {t("profilePage.password.done")}
          </p>
          <div className="modal__actions">
            <button type="button" className="btn btn--lg btn--raised btn--lime" onClick={onClose}>
              {t("profilePage.close")}
            </button>
          </div>
        </div>
      ) : (
        <form className="modal__form" onSubmit={(e) => void submit(e)} noValidate>
          <ReauthField password={current} onChange={setCurrent} />
          <div className="field-stack">
            <PasswordField
              label={t("profilePage.password.new")}
              name="new-password"
              autoComplete="new-password"
              placeholder={t("auth.signup.passwordPlaceholder")}
              value={next}
              error={shortError ? t("auth.errors.passwordShort") : null}
              onChange={(e) => setNext(e.target.value)}
            />
            <StrengthMeter password={next} />
          </div>
          <ErrorLine keyName={error} />
          <div className="modal__actions">
            <button type="button" className="btn btn--lg" disabled={busy} onClick={onClose}>
              {t("profilePage.cancel")}
            </button>
            <button type="submit" className="btn btn--lg btn--raised btn--lime" disabled={busy}>
              {t("profilePage.password.update")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function DeleteAccountDialog({ onClose, onDeleted }: DialogProps & { onDeleted: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    setBusy(true);
    setError(null);
    try {
      await reauthenticate(user, password);
    } catch (err) {
      setError(authErrorKey(err, "account") ?? "unknown");
      setBusy(false);
      return;
    }
    try {
      await deleteAccountOnServer();
    } catch (e) {
      // The function wants a sign-in from the last five minutes; the re-auth above normally covers that.
      setError((e as { code?: string }).code === "functions/unauthenticated" ? "reauthNeeded" : "deleteFailed");
      setBusy(false);
      return;
    }
    // Gone from the server. Clear this device's copies too, then sign out (the sign-in no longer exists).
    await localStore.deleteUser(uid).catch(() => undefined);
    await signOutUser().catch(() => undefined);
    onDeleted();
  };

  return (
    <Modal title={t("profilePage.delete.title")} onClose={onClose} busy={busy} tone="pink">
      <form className="modal__form" onSubmit={(e) => void submit(e)}>
        <p className="auth-intro" data-testid="delete-account-warning">
          {t("profilePage.delete.warning")}
        </p>
        <ReauthField password={password} onChange={setPassword} />
        <ErrorLine keyName={error} />
        <div className="modal__actions">
          <button type="button" className="btn btn--lg" disabled={busy} onClick={onClose} autoFocus>
            {t("profilePage.cancel")}
          </button>
          <button type="submit" className="btn btn--lg btn--raised btn--danger" disabled={busy}>
            {busy ? t("profilePage.delete.busy") : t("profilePage.delete.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
