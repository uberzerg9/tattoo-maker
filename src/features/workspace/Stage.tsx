import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { SHEET_CSS_PX, isInsideSheet, screenToSheetMm } from "../../engine";
import type { TattooEngine } from "../../engine";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { StencilHandles } from "../stencil/StencilHandles";
import { Stickers } from "./Stickers";
import { ROTATE_WHEEL_STEP_DEG } from "./config";

interface PanState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Receives the pointer events of a stroke while the needle tool is active. */
  engineRef: RefObject<TattooEngine | null>;
}

const WHEEL_ZOOM_SPEED = 0.006;
const WHEEL_DELTA_LIMIT = 60;

/** Pan / zoom / rotate surface. The engine draws the skin sheet into the canvas. */
export function Stage({ canvasRef, engineRef }: StageProps) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const pan = useRef<PanState | null>(null);
  /** Pointer id of the stroke in progress, if any. */
  const drawing = useRef<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const tool = useWorkspaceStore((s) => s.tool);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const offsetX = useWorkspaceStore((s) => s.offsetX);
  const offsetY = useWorkspaceStore((s) => s.offsetY);
  const rotation = useWorkspaceStore((s) => s.rotation);
  const engineError = useWorkspaceStore((s) => s.engineError);

  // The pan limits depend on the stage size.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const report = () =>
      useWorkspaceStore
        .getState()
        .setStageSize(el.clientWidth, el.clientHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // React registers wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useWorkspaceStore.getState();
      if (e.ctrlKey || e.metaKey) {
        const d = Math.max(
          -WHEEL_DELTA_LIMIT,
          Math.min(WHEEL_DELTA_LIMIT, e.deltaY),
        );
        s.setZoom(s.zoom * Math.exp(-d * WHEEL_ZOOM_SPEED));
      } else if (e.altKey) {
        s.setRotation(
          s.rotation +
            (e.deltaY < 0 ? -ROTATE_WHEEL_STEP_DEG : ROTATE_WHEEL_STEP_DEG),
        );
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        s.setOffset(s.offsetX - dx, s.offsetY - dy);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const isOnSheet = (e: PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const mm = screenToSheetMm(
      e.clientX - rect.left,
      e.clientY - rect.top,
      { zoom, offsetX, offsetY, rotationDeg: rotation },
      { width: rect.width, height: rect.height },
    );
    return isInsideSheet(mm);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (tool === "needle" && isOnSheet(e)) {
      if (e.button === 0) {
        drawing.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        engineRef.current?.pointer(e.nativeEvent);
      }
      return;
    }
    pan.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetX,
      originY: offsetY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drawing.current === e.pointerId) {
      engineRef.current?.pointer(e.nativeEvent);
      return;
    }
    const p = pan.current;
    if (!p) return;
    useWorkspaceStore
      .getState()
      .setOffset(
        p.originX + e.clientX - p.startX,
        p.originY + e.clientY - p.startY,
      );
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drawing.current === e.pointerId) {
      drawing.current = null;
      engineRef.current?.pointer(e.nativeEvent);
      return;
    }
    pan.current = null;
    setIsPanning(false);
  };

  // The label follows the sheet with the same transform the engine applies.
  const labelFrame: CSSProperties = {
    transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${zoom})`,
    transition: isPanning ? "none" : undefined,
  };

  const className = [
    "stage",
    tool === "hand" && "stage--hand",
    isPanning && "stage--panning",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={stageRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <Stickers />
      <canvas ref={canvasRef} className="stage__canvas" />
      <StencilHandles />
      <div
        className="sheet"
        style={
          {
            ...labelFrame,
            "--sheet-w": `${SHEET_CSS_PX.width}px`,
            "--sheet-h": `${SHEET_CSS_PX.height}px`,
          } as CSSProperties
        }
      >
        <div className="sheet__label">{t("workspace.sheet.label")}</div>
      </div>
      {engineError && (
        <div className="unsupported" role="alert">
          <h2 className="unsupported__title">
            {t("workspace.unsupported.title")}
          </h2>
          <p className="unsupported__hint">{t("workspace.unsupported.hint")}</p>
        </div>
      )}
    </div>
  );
}
