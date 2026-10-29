import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { SKIN_TONE_IDS } from "../workspace/config";
import { FloatingPanel } from "./FloatingPanel";

export function SkinPanel() {
  const { t } = useTranslation();
  const skinTone = useWorkspaceStore((s) => s.skinTone);
  const setSkinTone = useWorkspaceStore((s) => s.setSkinTone);

  return (
    <FloatingPanel
      id="skin"
      title={t("workspace.skin.title")}
      badge={t(`workspace.skin.names.${skinTone}`)}
      bodyClassName="panel__body--skin"
    >
      <span className="panel-label">{t("workspace.skin.tone")}</span>
      <div className="tone-grid">
        {SKIN_TONE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="tone"
            aria-label={t(`workspace.skin.names.${id}`)}
            aria-pressed={id === skinTone}
            style={{ "--tone-color": `var(--skin-${id})` } as CSSProperties}
            onClick={() => setSkinTone(id)}
          />
        ))}
      </div>
    </FloatingPanel>
  );
}
