import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useConsent } from "./useConsent";
import "./consent.css";

/** Asks once whether analytics cookies are allowed. Both answers look the same; the choice is kept and can be changed in the Profile. */
export function ConsentBanner() {
  const { t } = useTranslation();
  const { choice, choose } = useConsent();
  if (choice !== null) return null;

  return (
    <section className="consent" role="region" aria-labelledby="consent-title">
      <h2 id="consent-title" className="consent__title">
        {t("consent.title")}
      </h2>
      <p className="consent__text">
        {t("consent.text")}{" "}
        <Link to="/privacy" className="consent__link">
          {t("consent.privacy")}
        </Link>
      </p>
      <div className="consent__actions">
        <button type="button" className="btn btn--white consent__btn" onClick={() => choose("denied")}>
          {t("consent.reject")}
        </button>
        <button type="button" className="btn btn--white consent__btn" onClick={() => choose("granted")}>
          {t("consent.accept")}
        </button>
      </div>
    </section>
  );
}
