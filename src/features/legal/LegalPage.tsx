import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LANGUAGES } from "../workspace/config";
import { setLanguage } from "../profile/profileService";
import { useAuthUser } from "../session/useAuthUser";
import { CONTACT_EMAIL } from "./contact";
import { LegalFooter } from "./LegalFooter";
import { LEGAL_SECTIONS } from "./legalContent";
import type { LegalDoc } from "./legalContent";
import "./legal.css";

/** /terms and /privacy: public pages, so the language can be switched without an account. */
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthUser();
  const values = { email: CONTACT_EMAIL };

  return (
    <div className="legal-page">
      <div className="legal-bar">
        <button type="button" className="btn btn--white" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
          ← {t("legal.back")}
        </button>
        <div role="group" aria-label={t("legal.language")} className="legal-bar__langs">
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" className="btn btn--white" aria-pressed={l.id === i18n.resolvedLanguage} onClick={() => void setLanguage(user?.uid ?? null, l.id)}>
              {l.code}
            </button>
          ))}
        </div>
      </div>

      <article className="legal-card" lang={i18n.resolvedLanguage}>
        <header className="legal-card__head">
          <h1 className="legal-card__title">{t(`legal.${doc}.title`)}</h1>
        </header>
        <div className="legal-card__body">
          <aside className="legal-draft" role="note" data-testid="legal-draft">
            <strong className="legal-draft__title">{t("legal.draftTitle")}</strong>
            <span>{t("legal.draftText")}</span>
          </aside>
          {LEGAL_SECTIONS[doc].map((section) => {
            const base = `legal.${doc}.sections.${section.id}`;
            return (
              <section key={section.id} aria-labelledby={`legal-${section.id}`} className="legal-section">
                <h2 id={`legal-${section.id}`} className="legal-section__title">
                  {t(`${base}.title`)}
                </h2>
                {section.paragraphs.map((p) => (
                  <p key={p}>{t(`${base}.${p}`, values)}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{t(`${base}.${item}`, values)}</li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </article>
      <LegalFooter onDark />
    </div>
  );
}
