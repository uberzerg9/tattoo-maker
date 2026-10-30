import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { UnsupportedReason } from "../../engine/types";
import { LegalFooter } from "../legal/LegalFooter";
import { signOutUser } from "../auth/authService";
import "./unsupported.css";

/** Full-page answer for browsers that cannot run the engine. The Profile still works without WebGL, so it stays reachable. */
export function UnsupportedScreen({ reason }: { reason: UnsupportedReason }) {
  const { t } = useTranslation();
  return (
    <div className="unsupported-screen" role="alert" data-testid="unsupported-screen" data-reason={reason}>
      <section className="unsupported-card" aria-labelledby="unsupported-title">
        <div className="unsupported-card__head">
          <h1 id="unsupported-title" className="unsupported-card__title">
            {t("unsupported.title")}
          </h1>
        </div>
        <div className="unsupported-card__body">
          <p className="unsupported-card__lead">{t(`unsupported.reason.${reason}`)}</p>
          <h2 className="unsupported-card__h2">{t("unsupported.tryTitle")}</h2>
          <ul className="unsupported-card__list">
            <li>{t("unsupported.try.browser")}</li>
            <li>{t("unsupported.try.acceleration")}</li>
            <li>{t("unsupported.try.drivers")}</li>
          </ul>
          <p className="unsupported-card__code">{t("unsupported.details", { reason })}</p>
          <div className="unsupported-card__actions">
            <Link to="/profile" className="btn btn--lg btn--raised btn--lime">
              {t("unsupported.profile")}
            </Link>
            <button type="button" className="btn btn--lg btn--white" onClick={() => void signOutUser()}>
              {t("unsupported.logout")}
            </button>
          </div>
        </div>
        <LegalFooter />
      </section>
    </div>
  );
}
