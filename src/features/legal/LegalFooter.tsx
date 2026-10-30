import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { clearConsent } from "../../lib/consent";
import "./legal.css";

/** Terms, Privacy and a way back to the cookie banner. `onDark` is for pages whose background is the dark grip tape. */
export function LegalFooter({ onDark = false }: { onDark?: boolean }) {
  const { t } = useTranslation();
  return (
    <nav className={`legal-footer${onDark ? " legal-footer--on-dark" : ""}`} aria-label={t("legal.footer.label")}>
      <Link to="/terms">{t("legal.footer.terms")}</Link>
      <Link to="/privacy">{t("legal.footer.privacy")}</Link>
      <button type="button" className="legal-footer__link" onClick={clearConsent}>
        {t("legal.footer.cookies")}
      </button>
    </nav>
  );
}
