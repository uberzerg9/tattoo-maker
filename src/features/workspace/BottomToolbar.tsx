import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { ROTATE_STEP_DEG, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./config";
import { HandIcon, NeedleIcon, RotateLeftIcon, RotateRightIcon } from "./icons";

export function BottomToolbar() {
  const { t } = useTranslation();
  const format = useFormat();
  const tool = useWorkspaceStore((s) => s.tool);
  const renderMode = useWorkspaceStore((s) => s.renderMode);
  const stencilVisible = useWorkspaceStore((s) => s.stencilVisible);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const rotation = useWorkspaceStore((s) => s.rotation);
  const setTool = useWorkspaceStore((s) => s.setTool);
  const setRenderMode = useWorkspaceStore((s) => s.setRenderMode);
  const toggleStencil = useWorkspaceStore((s) => s.toggleStencil);
  const setZoom = useWorkspaceStore((s) => s.setZoom);
  const resetView = useWorkspaceStore((s) => s.resetView);
  const setRotation = useWorkspaceStore((s) => s.setRotation);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="icon-btn toolbar__tool"
        aria-label={t("workspace.toolbar.toolNeedle")}
        aria-pressed={tool === "needle"}
        onClick={() => setTool("needle")}
      >
        <NeedleIcon />
      </button>
      <button
        type="button"
        className="icon-btn toolbar__tool"
        aria-label={t("workspace.toolbar.toolHand")}
        aria-pressed={tool === "hand"}
        onClick={() => setTool("hand")}
      >
        <HandIcon />
      </button>
      <div className="toolbar__sep" />
      <button
        type="button"
        className="btn toolbar__seg toolbar__seg--stencil"
        aria-pressed={stencilVisible}
        onClick={toggleStencil}
      >
        {t("workspace.toolbar.stencil")}
      </button>
      <button
        type="button"
        className="btn toolbar__seg"
        aria-pressed={renderMode === "fresh"}
        onClick={() => setRenderMode("fresh")}
      >
        {t("workspace.toolbar.fresh")}
      </button>
      <button
        type="button"
        className="btn toolbar__seg"
        aria-pressed={renderMode === "healed"}
        onClick={() => setRenderMode("healed")}
      >
        {t("workspace.toolbar.healed")}
      </button>
      <div className="toolbar__sep" />
      <button
        type="button"
        className="icon-btn icon-btn--glyph"
        aria-label={t("workspace.toolbar.zoomOut")}
        disabled={zoom <= ZOOM_MIN}
        onClick={() => setZoom(zoom - ZOOM_STEP)}
      >
        −
      </button>
      <button
        type="button"
        className="toolbar__readout toolbar__readout--zoom"
        aria-label={t("workspace.toolbar.zoomReset")}
        onClick={resetView}
      >
        {format.percent(zoom * 100)}
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--glyph"
        aria-label={t("workspace.toolbar.zoomIn")}
        disabled={zoom >= ZOOM_MAX}
        onClick={() => setZoom(zoom + ZOOM_STEP)}
      >
        +
      </button>
      <div className="toolbar__sep" />
      <button
        type="button"
        className="icon-btn"
        aria-label={t("workspace.toolbar.rotLeft")}
        onClick={() => setRotation(rotation - ROTATE_STEP_DEG)}
      >
        <RotateLeftIcon />
      </button>
      <button
        type="button"
        className="toolbar__readout toolbar__readout--rotation"
        aria-label={t("workspace.toolbar.rotReset")}
        onClick={() => setRotation(0)}
      >
        {format.degrees(rotation)}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("workspace.toolbar.rotRight")}
        onClick={() => setRotation(rotation + ROTATE_STEP_DEG)}
      >
        <RotateRightIcon />
      </button>
    </div>
  );
}
