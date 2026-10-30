import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TattooEngine } from "../../engine";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { applyStencil, cancelPlacement } from "./placementActions";
import "./placementBar.css";

/**
 * Shown while a stencil is being placed: what to do, and the two buttons that work without a keyboard.
 * The keyboard does the same (usePlacementKeys): Enter or Space applies, Escape cancels.
 */
export function PlacementBar({ engineRef }: { engineRef: RefObject<TattooEngine | null> }) {
  const { t } = useTranslation();
  const placing = useWorkspaceStore((s) => s.stencilSize !== null && !s.stencilLocked && !s.stencilDialog.open);
  if (!placing) return null;

  return (
    <div className="placement-bar" role="group" aria-label={t("workspace.placing.label")} data-testid="placement-bar">
      <p className="placement-bar__hint">
        {t("workspace.placing.hint")} <span className="placement-bar__keys">{t("workspace.placing.keys")}</span>
      </p>
      <div className="placement-bar__actions">
        <button type="button" className="btn btn--white" data-testid="placement-cancel" onClick={() => cancelPlacement(engineRef.current)}>
          {t("workspace.placing.cancel")}
        </button>
        <button type="button" className="btn btn--lime btn--raised" data-testid="placement-apply" onClick={() => applyStencil(engineRef.current)}>
          {t("workspace.placing.apply")}
        </button>
      </div>
    </div>
  );
}
