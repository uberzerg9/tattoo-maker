import { writesDisabled } from "../lib/features";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFormat } from "../i18n/useFormat";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useAuth } from "../features/auth/authContext";
import { signOutUser } from "../features/auth/authService";
import { TextField } from "../features/auth/fields";
import { isValidName } from "../features/auth/username";
import { signInMethod } from "../features/profile/accountService";
import { ChangeEmailDialog, ChangePasswordDialog, DeleteAccountDialog, DeleteWorkDialog, RenameDialog } from "../features/profile/dialogs";
import { clampHz, sanitizeSettings } from "../features/profile/profileSettings";
import type { WorkspaceDefaults } from "../features/profile/profileSettings";
import { saveSettings, setLanguage } from "../features/profile/profileService";
import { initialsOf, useProfile } from "../features/session/useProfile";
import type { Profile as ProfileDoc } from "../features/session/useProfile";
import { LANGUAGES, MACHINE_HZ_MAX, MACHINE_HZ_MIN, MACHINE_HZ_STEP, SKIN_TONE_IDS } from "../features/workspace/config";
import { fetchWorkDoc } from "../features/works/workRemote";
import { useWorks } from "../features/works/useWorks";
import type { WorkListItem } from "../features/works/useWorks";
import { deleteWork, renameWork } from "../features/works/worksAdmin";
import { LegalFooter } from "../features/legal/LegalFooter";
import { useConsent } from "../features/analytics/useConsent";
import "../features/auth/auth.css";
import "../features/profile/profile.css";

type Dialog = { kind: "email" } | { kind: "password" } | { kind: "deleteAccount" } | { kind: "rename"; work: WorkListItem } | { kind: "deleteWork"; work: WorkListItem };

function Stat({ tone, value, label }: { tone: "lime" | "pink" | "yellow" | "blue"; value: string; label: string }) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

/** Name and workspace defaults, saved together with SAVE CHANGES. */
function SettingsForm({ uid, profile, onDialog }: { uid: string; profile: ProfileDoc; onDialog: (d: Dialog) => void }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const { user } = useAuth();
  const method = user ? signInMethod(user) : "password";
  const saved = sanitizeSettings(profile.settings);

  const [name, setName] = useState(profile.name ?? "");
  const [defaults, setDefaults] = useState<WorkspaceDefaults>(saved);
  const [nameError, setNameError] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [languageFailed, setLanguageFailed] = useState(false);
  const consent = useConsent();

  const change = <K extends keyof WorkspaceDefaults>(key: K, value: WorkspaceDefaults[K]) => {
    setDefaults((d) => ({ ...d, [key]: value }));
    setState("idle");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(!isValidName(name));
    if (!isValidName(name)) return;
    setState("saving");
    try {
      await saveSettings(uid, { name, ...defaults });
      setState("saved");
    } catch {
      setState("failed");
    }
  };

  const pickLanguage = async (id: (typeof LANGUAGES)[number]["id"]) => {
    setLanguageFailed(false);
    try {
      await setLanguage(uid, id);
    } catch {
      setLanguageFailed(true);
    }
  };

  return (
    <form className="settings" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="settings-title">
      <div className="settings__head">
        <h2 id="settings-title" className="settings__title">
          {t("profilePage.settings.title")}
        </h2>
        <button type="submit" className="btn btn--raised btn--lime" disabled={state === "saving" || writesDisabled()}>
          {t("profilePage.settings.save")}
        </button>
      </div>
      <div className="settings__body">
        <p className="settings__status" role="status" data-testid="settings-status">
          {state === "saved" && t("profilePage.settings.saved")}
          {state === "failed" && t("profilePage.failed")}
        </p>

        <section className="settings__group">
          <h3 className="settings__h3">{t("profilePage.settings.account")}</h3>
          <div className="settings__grid">
            <TextField label={t("auth.signup.name")} name="profile-name" autoComplete="name" value={name} error={nameError ? t("auth.errors.nameRequired") : null} onChange={(e) => { setName(e.target.value); setState("idle"); }} />
            <TextField label={t("auth.common.email")} name="profile-email" type="email" value={user?.email ?? ""} readOnly />
          </div>
          {method === "password" ? (
            <div className="settings__buttons">
              <button type="button" className="btn btn--white" disabled={writesDisabled()} onClick={() => onDialog({ kind: "email" })}>
                {t("profilePage.email.change")}
              </button>
              <button type="button" className="btn btn--white" disabled={writesDisabled()} onClick={() => onDialog({ kind: "password" })}>
                {t("profilePage.password.change")}
              </button>
            </div>
          ) : (
            <p className="field__message">{t("profilePage.settings.providerAccount")}</p>
          )}
        </section>

        <hr className="settings__rule" />
        <section className="settings__group">
          <h3 id="profile-language" className="settings__h3">
            {t("profilePage.settings.language")}
          </h3>
          <div role="group" aria-labelledby="profile-language" className="lang-grid">
            {LANGUAGES.map((l) => (
              <button key={l.id} type="button" className="lang-option" aria-pressed={l.id === i18n.resolvedLanguage} onClick={() => void pickLanguage(l.id)}>
                <span>{l.native}</span>
                <span className="lang-option__code">{l.code}</span>
              </button>
            ))}
          </div>
          <p className="field__message">{t("profilePage.settings.languageNote")}</p>
          {languageFailed && (
            <p className="form-error" role="alert">
              {t("profilePage.failed")}
            </p>
          )}
        </section>

        <hr className="settings__rule" />
        <section className="settings__group">
          <h3 id="profile-analytics" className="settings__h3">
            {t("profilePage.analytics.title")}
          </h3>
          <div role="group" aria-labelledby="profile-analytics" className="segment">
            {(["granted", "denied"] as const).map((c) => (
              <button key={c} type="button" className="segment__option" aria-pressed={consent.choice === c} onClick={() => consent.choose(c)}>
                {t(c === "granted" ? "profilePage.analytics.on" : "profilePage.analytics.off")}
              </button>
            ))}
          </div>
          <p className="field__message">{t("profilePage.analytics.text")}</p>
        </section>

        <hr className="settings__rule" />
        <section className="settings__group">
          <h3 className="settings__h3">{t("profilePage.settings.defaults")}</h3>
          <div className="field">
            <span className="field__label">
              {t("workspace.skin.tone")} · <b>{t(`workspace.skin.names.${defaults.skinTone}`)}</b>
            </span>
            <div className="tone-grid">
              {SKIN_TONE_IDS.map((id) => (
                <button key={id} type="button" className="tone" aria-label={t(`workspace.skin.names.${id}`)} aria-pressed={id === defaults.skinTone} style={{ "--tone-color": `var(--skin-${id})` } as React.CSSProperties} onClick={() => change("skinTone", id)} />
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field__head">
              <label htmlFor="profile-hz">{t("workspace.machine.speed")}</label>
              <span className="settings__value">
                {format.integer(defaults.machineHz)} {t("workspace.machine.hz")}
              </span>
            </div>
            <input id="profile-hz" type="range" min={MACHINE_HZ_MIN} max={MACHINE_HZ_MAX} step={MACHINE_HZ_STEP} value={defaults.machineHz} onChange={(e) => change("machineHz", clampHz(Number(e.target.value)))} />
          </div>
          <div className="field">
            <span id="profile-units" className="field__label">
              {t("profilePage.settings.units")}
            </span>
            <div role="group" aria-labelledby="profile-units" className="segment">
              {(["cm", "in"] as const).map((u) => (
                <button key={u} type="button" className="segment__option" aria-pressed={defaults.units === u} onClick={() => change("units", u)}>
                  {t(`profilePage.settings.unit.${u}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <hr className="settings__rule" />
        <section className="settings__group">
          <h3 className="settings__h3">{t("profilePage.settings.danger")}</h3>
          <div className="settings__buttons">
            <button type="button" className="btn btn--white" onClick={() => void signOutUser()}>
              {t("workspace.profile.logout")}
            </button>
            <button type="button" className="btn btn--danger" disabled={writesDisabled()} onClick={() => onDialog({ kind: "deleteAccount" })}>
              {t("profilePage.delete.button")}
            </button>
          </div>
        </section>
      </div>
    </form>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const profile = useProfile(uid || null);
  const works = useWorks(uid || null);
  const workId = useWorkspaceStore((s) => s.workId);
  const workSaved = useWorkspaceStore((s) => s.workSaved);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const stats = profile?.stats;
  const sessions = stats?.sessions ?? 0;
  const initials = profile?.name ? initialsOf(profile.name) : "";
  const close = () => setDialog(null);

  const removeWork = async (work: WorkListItem) => {
    const doc = await fetchWorkDoc(uid, work.id).catch(() => null);
    await deleteWork(uid, work.id, doc?.sketchId ?? null);
    // The Workspace still remembers this work as its own: forget it so a later save cannot bring it back.
    if (useWorkspaceStore.getState().workId === work.id) useWorkspaceStore.getState().startFreshWork();
  };

  return (
    <div className="profile-page" data-testid="profile-page">
      <header className="profile-bar">
        <span className="profile-bar__brand">
          {t("workspace.brand.a")}
          <span className="topbar__star">✶</span>
          {t("workspace.brand.b")}
        </span>
        <div className="profile-bar__actions">
          <Link to={workSaved ? `/?work=${workId}` : "/"} className="btn btn--lime profile-bar__back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {t("profilePage.back")}
          </Link>
          <button type="button" className="btn" onClick={() => void signOutUser()}>
            {t("workspace.profile.logout")}
          </button>
        </div>
      </header>

      <div className="profile-page__columns">
        <div className="profile-page__left">
          <section className="id-card" aria-label={t("workspace.profile.open")}>
            <div className="id-card__stripe" />
            <div className="id-card__body">
              <div className="id-card__avatar" data-testid="profile-initials">
                {initials}
              </div>
              <div className="id-card__who">
                <h1 className="id-card__name" data-testid="profile-name">
                  {profile?.name ?? ""}
                </h1>
                <span data-testid="profile-username">{profile?.username ? `@${profile.username}` : ""}</span>
              </div>
              {profile?.level && (
                <span className="id-card__level" data-testid="profile-level">
                  {t(`auth.signup.levels.${profile.level}`)}
                </span>
              )}
            </div>
          </section>

          <section aria-labelledby="stats-title" className="profile-section">
            <h2 id="stats-title" className="profile-section__title">
              {t("profilePage.stats.title")}
            </h2>
            <div className="stats" data-testid="profile-stats">
              <Stat tone="lime" value={format.integer(sessions)} label={t("profilePage.stats.sessions", { count: sessions })} />
              <Stat tone="pink" value={format.decimal(stats?.hours ?? 0)} label={t("profilePage.stats.hours")} />
              <Stat tone="yellow" value={sessions > 0 && stats ? format.decimal(stats.avgDeviationMm) : "–"} label={t("profilePage.stats.deviation")} />
              <Stat tone="blue" value={format.integer(stats?.streakDays ?? 0)} label={t("profilePage.stats.streak", { count: stats?.streakDays ?? 0 })} />
            </div>
          </section>

          <section aria-labelledby="works-title" className="profile-section">
            <h2 id="works-title" className="profile-section__title">
              {t("workspace.profile.works.title")}
            </h2>
            {works.length === 0 ? (
              <p className="profile-empty">{t("workspace.profile.works.empty")}</p>
            ) : (
              <ul className="works-grid" data-testid="works-grid">
                {works.map((w) => (
                  <li key={w.id} className="work-card" data-testid="work-card">
                    <button type="button" className="work-card__open" aria-label={t("workspace.profile.works.open", { title: w.title })} onClick={() => void navigate(`/?work=${w.id}`)}>
                      {w.previewUrl ? <img className="work-card__preview" src={w.previewUrl} alt="" /> : <span className="work-card__preview" />}
                      <span className="work-card__title" data-testid="work-title">
                        {w.title}
                      </span>
                      <span className="work-card__meta">{w.localOnly ? t("workspace.profile.works.localOnly") : w.updatedAtMs !== null ? format.dateTime(w.updatedAtMs) : ""}</span>
                    </button>
                    <div className="work-card__actions">
                      <button type="button" className="btn" disabled={writesDisabled()} onClick={() => setDialog({ kind: "rename", work: w })}>
                        {t("profilePage.works.rename")}
                      </button>
                      <button type="button" className="btn btn--white" disabled={writesDisabled()} onClick={() => setDialog({ kind: "deleteWork", work: w })}>
                        {t("profilePage.works.delete")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {profile ? <SettingsForm key={uid} uid={uid} profile={profile} onDialog={setDialog} /> : <div className="settings settings--loading" role="status">{t("auth.splash")}</div>}
      </div>

      <LegalFooter onDark />

      {dialog?.kind === "email" && <ChangeEmailDialog onClose={close} />}
      {dialog?.kind === "password" && <ChangePasswordDialog onClose={close} />}
      {dialog?.kind === "deleteAccount" && <DeleteAccountDialog onClose={close} onDeleted={() => void navigate("/login", { replace: true })} />}
      {dialog?.kind === "rename" && <RenameDialog title={dialog.work.title} onClose={close} onSave={(title) => renameWork(uid, dialog.work.id, title)} />}
      {dialog?.kind === "deleteWork" && <DeleteWorkDialog title={dialog.work.title} onClose={close} onDelete={() => removeWork(dialog.work)} />}
    </div>
  );
}

