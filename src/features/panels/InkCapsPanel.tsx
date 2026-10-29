import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { INK_CAP_IDS } from "../workspace/config";
import { FloatingPanel } from "./FloatingPanel";

export function InkCapsPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const inkCap = useWorkspaceStore((s) => s.inkCap);
  const capLevels = useWorkspaceStore((s) => s.capLevels);
  const cartridgeInk = useWorkspaceStore((s) => s.cartridgeInk);
  const setInkCap = useWorkspaceStore((s) => s.setInkCap);
  const dip = useWorkspaceStore((s) => s.dip);
  const selectedEmpty = capLevels[inkCap] <= 0;

  return (
    <FloatingPanel
      id="caps"
      title={t("workspace.caps.title")}
      badge={t(`workspace.caps.names.${inkCap}`)}
      bodyClassName="panel__body--caps"
    >
      <div className="caps-grid">
        {INK_CAP_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={capLevels[id] <= 0 ? "cap cap--empty" : "cap"}
            aria-label={t(`workspace.caps.names.${id}`)}
            aria-pressed={id === inkCap}
            onClick={() => setInkCap(id)}
          >
            <span className="cap__swatch" style={{ "--cap-color": `var(--cap-${id})` } as CSSProperties} />
            <span
              className="cap__level"
              role="meter"
              aria-label={t("workspace.caps.capLevel", { cap: t(`workspace.caps.names.${id}`) })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(capLevels[id])}
            >
              <span className="cap__level-fill" style={{ width: `${capLevels[id]}%` }} />
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--lg btn--raised btn--blue btn--dip"
        disabled={selectedEmpty}
        aria-keyshortcuts="Control+D Meta+D"
        onClick={dip}
      >
        {t("workspace.caps.dip")}
      </button>
      {selectedEmpty && (
        <p className="panel-hint" role="status">
          {t("workspace.caps.empty")}
        </p>
      )}
      <div className="meter">
        <div className="meter__head">
          <span>{t("workspace.caps.inkLeft")}</span>
          <span className="meter__value">{format.percent(cartridgeInk)}</span>
        </div>
        <div
          className="meter__track"
          role="meter"
          aria-label={t("workspace.caps.inkLeft")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(cartridgeInk)}
        >
          <div className="meter__fill" style={{ width: `${cartridgeInk}%` }} />
        </div>
      </div>
    </FloatingPanel>
  );
}
