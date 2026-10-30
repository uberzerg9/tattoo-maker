import { useTranslation } from "react-i18next";
import { writesDisabled } from "../../lib/features";
import "./preview.css";

/** Shown on preview-channel builds (VITE_DISABLE_WRITES=true): nothing is saved there. */
export function PreviewBadge() {
  const { t } = useTranslation();
  if (!writesDisabled()) return null;
  return (
    <div className="preview-badge" role="note" data-testid="preview-badge">
      {t("preview.badge")}
    </div>
  );
}
