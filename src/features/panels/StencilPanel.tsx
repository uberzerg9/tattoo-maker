import { useRef } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import {
  STENCIL_OPACITY_MAX,
  STENCIL_OPACITY_MIN,
  STENCIL_OPACITY_STEP,
} from "../workspace/config";
import { FloatingPanel } from "./FloatingPanel";

export function StencilPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const opacity = useWorkspaceStore((s) => s.stencilOpacity);
  const fileName = useWorkspaceStore((s) => s.stencilFileName);
  const thumbUrl = useWorkspaceStore((s) => s.stencilThumbUrl);
  const setStencilOpacity = useWorkspaceStore((s) => s.setStencilOpacity);
  const openDialog = useWorkspaceStore((s) => s.openStencilDialog);
  const fileInput = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) openDialog(file);
  };

  return (
    <FloatingPanel id="stencil" title={t("workspace.stencil.title")} badge={format.percent(opacity)}>
      <div
        className="stencil-file"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="stencil-file__thumb">
          {thumbUrl && <img src={thumbUrl} alt="" />}
        </div>
        <div className="stencil-file__info">
          {fileName && <span className="stencil-file__name">{fileName}</span>}
          <span className="stencil-file__hint">{t("workspace.stencil.dropHint")}</span>
        </div>
      </div>
      <label className="panel-label" htmlFor="stencil-opacity">
        {t("workspace.stencil.visibility")}
      </label>
      <input
        id="stencil-opacity"
        type="range"
        min={STENCIL_OPACITY_MIN}
        max={STENCIL_OPACITY_MAX}
        step={STENCIL_OPACITY_STEP}
        value={opacity}
        onChange={(e) => setStencilOpacity(Number(e.target.value))}
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        data-testid="panel-sketch-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) openDialog(file);
        }}
      />
      <div className="panel-grid-2">
        <button type="button" className="btn btn--lg" onClick={() => fileInput.current?.click()}>
          {t("workspace.stencil.upload")}
        </button>
        <button type="button" className="btn btn--lg btn--raised btn--pink" onClick={() => openDialog()}>
          {t("workspace.stencil.transfer")}
        </button>
      </div>
    </FloatingPanel>
  );
}
