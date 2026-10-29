import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { LANGUAGES } from "./config";

/** Placeholder until the profile comes from Firestore (Stage 4). */
const MOCK_PROFILE = { name: "[YOUR NAME]", initials: "AS", sessions: 12 };

export function ProfilePopover({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();

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
          <div className="profile__avatar">{MOCK_PROFILE.initials}</div>
          <div className="profile__who-text">
            <span className="profile__name">{MOCK_PROFILE.name}</span>
            <span className="profile__level">
              {t("workspace.profile.level", {
                sessions: format.integer(MOCK_PROFILE.sessions),
              })}
            </span>
          </div>
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
                onClick={() => void i18n.changeLanguage(l.id)}
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
          <Link to="/login" className="btn btn--lg btn--white">
            {t("workspace.profile.logout")}
          </Link>
        </div>
      </div>
    </section>
  );
}
