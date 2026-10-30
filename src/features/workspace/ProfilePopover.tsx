import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useAuthUser } from "../session/useAuthUser";
import { initialsOf, useProfile } from "../session/useProfile";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useWorks } from "../works/useWorks";
import { setLanguage } from "../profile/profileService";
import { LANGUAGES } from "./config";

/** Shown until a profile has loaded (or when nobody is signed in). */
const PLACEHOLDER_NAME = "…";

export function ProfilePopover({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const user = useAuthUser();
  const profile = useProfile(user?.uid ?? null);
  const name = profile?.name ?? PLACEHOLDER_NAME;
  const sessions = profile?.stats?.sessions ?? 0;
  const works = useWorks(user?.uid ?? null);
  const currentWorkId = useWorkspaceStore((s) => s.workId);
  const requestWork = useWorkspaceStore((s) => s.requestWork);

  return (
    <section aria-label={t("workspace.profile.open")} className="profile">
      <div className="profile__header">
        <h2 className="profile__title">{t("workspace.profile.title")}</h2>
        <button
          type="button"
          className="panel__toggle"
          aria-label={t("workspace.profile.close")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="profile__body">
        <div className="profile__who">
          <div className="profile__avatar">{profile?.name ? initialsOf(profile.name) : "•"}</div>
          <div className="profile__who-text">
            <span className="profile__name">{name}</span>
            <span className="profile__level">
              {t("workspace.profile.level", { count: sessions })}
            </span>
          </div>
        </div>
        <div className="profile__works">
          <span id="profile-works-label" className="profile__lang-label">
            {t("workspace.profile.works.title")}
          </span>
          {works.length === 0 ? (
            <p className="profile__note">{t("workspace.profile.works.empty")}</p>
          ) : (
            <ul className="works" aria-labelledby="profile-works-label">
              {works.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="work-row"
                    aria-current={w.id === currentWorkId}
                    aria-label={t("workspace.profile.works.open", { title: w.title })}
                    data-testid="work-row"
                    onClick={() => {
                      requestWork({ kind: "open", id: w.id });
                      onClose();
                    }}
                  >
                    {w.previewUrl ? (
                      <img className="work-row__preview" src={w.previewUrl} alt="" data-testid="work-preview" />
                    ) : (
                      <span className="work-row__preview" />
                    )}
                    <span className="work-row__text">
                      <span className="work-row__title">{w.title}</span>
                      <span className="work-row__meta">
                        {w.localOnly
                          ? t("workspace.profile.works.localOnly")
                          : w.updatedAtMs !== null && t("workspace.profile.works.updated", { date: format.dateTime(w.updatedAtMs) })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="profile__lang">
          <span id="profile-lang-label" className="profile__lang-label">
            {t("workspace.profile.language")}
          </span>
          <div
            role="group"
            aria-labelledby="profile-lang-label"
            className="profile__lang-list"
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                className="lang-option"
                aria-pressed={l.id === i18n.resolvedLanguage}
                onClick={() => void setLanguage(user?.uid ?? null, l.id)}
              >
                <span>{l.native}</span>
                <span className="lang-option__code">{l.code}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="profile__note">{t("workspace.profile.note")}</p>
        <div className="panel-grid-2">
          <Link to="/profile" className="btn btn--lg btn--raised btn--lime">
            {t("workspace.profile.view")}
          </Link>
          <button type="button" className="btn btn--lg btn--white" onClick={() => requestWork({ kind: "logout" })}>
            {t("workspace.profile.logout")}
          </button>
        </div>
      </div>
    </section>
  );
}
