import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { SHEET_CSS_PX, SHEET_MM, isInsideSheet, screenToSheetMm } from "../../engine";
import type { TattooEngine } from "../../engine";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { StencilHandles } from "../stencil/StencilHandles";
import { Stickers } from "./Stickers";
import { ROTATE_WHEEL_STEP_DEG, ZOOM_MAX, ZOOM_MIN } from "./config";
import { pinchView } from "./pinch";
import type { PinchStart } from "./pinch";
import { toDisplay } from "./units";

interface PanState {
  /** The pointer that moves the sheet. */
  pointerId: number;
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

/** A finger or pencil or mouse that is down on the stage, in client coordinates. */
interface ActivePointer {
  x: number;
  y: number;
  type: string;
}

interface PinchState {
  /** The two touch pointers that make the pinch. */
  ids: [number, number];
  start: PinchStart;
}

const WHEEL_ZOOM_SPEED = 0.006;
const WHEEL_DELTA_LIMIT = 60;

/** Pan / zoom / rotate surface. The engine draws the skin sheet into the canvas. */
export function Stage({ canvasRef, engineRef }: StageProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const units = useWorkspaceStore((s) => s.units);
  const stageRef = useRef<HTMLDivElement>(null);
  const pan = useRef<PanState | null>(null);
  /** Pointer id of the stroke in progress, if any. */
  const drawing = useRef<number | null>(null);
  /** Every pointer that is down, by id: the touches decide between pan and pinch. */
  const pointers = useRef(new Map<number, ActivePointer>());
  const pinch = useRef<PinchState | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const tool = useWorkspaceStore((s) => s.tool);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const offsetX = useWorkspaceStore((s) => s.offsetX);
  const offsetY = useWorkspaceStore((s) => s.offsetY);
  const rotation = useWorkspaceStore((s) => s.rotation);
  /** A stencil that has not been applied yet: the sheet can be moved and the stencil placed, but nothing is drawn. */
  const placing = useWorkspaceStore((s) => s.stencilSize !== null && !s.stencilLocked);

  // Safari turns a two-finger pinch into a page zoom (gesture events) unless they are cancelled; the stage's own pinch does the job.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const events = ["gesturestart", "gesturechange", "gestureend"];
    for (const name of events) document.addEventListener(name, block, { passive: false });
    return () => {
      for (const name of events) document.removeEventListener(name, block);
    };
  }, []);

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

  const stagePoint = (p: { x: number; y: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: p.x - (rect?.left ?? 0), y: p.y - (rect?.top ?? 0) };
  };

  const touchIds = () => [...pointers.current].filter(([, p]) => p.type === "touch").map(([id]) => id);

  const startPan = (e: PointerEvent<HTMLDivElement>, pointerId = e.pointerId, from = { x: e.clientX, y: e.clientY }) => {
    const s = useWorkspaceStore.getState();
    pan.current = { pointerId, startX: from.x, startY: from.y, originX: s.offsetX, originY: s.offsetY };
    setIsPanning(true);
  };

  /** Two fingers down: zoom and move together, anchored at the midpoint between them. */
  const startPinch = (e: PointerEvent<HTMLDivElement>) => {
    const [first, second] = touchIds();
    if (first === undefined || second === undefined) return;
    // A second finger is never part of a stroke: whatever the first one started is dropped, ink and all.
    if (drawing.current !== null) {
      engineRef.current?.cancelStroke();
      drawing.current = null;
    }
    pan.current = null;
    const s = useWorkspaceStore.getState();
    pinch.current = {
      ids: [first, second],
      start: {
        view: { zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY, rotationDeg: s.rotation },
        a: stagePoint(pointers.current.get(first)!),
        b: stagePoint(pointers.current.get(second)!),
      },
    };
    setIsPanning(true);
    void e;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const type = e.pointerType;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type });

    if (type === "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const touches = touchIds();
      if (touches.length >= 2) {
        if (!pinch.current) startPinch(e);
      } else if (drawing.current === null) {
        // One finger moves the sheet and never draws. (A palm resting beside a pencil stroke is ignored.)
        startPan(e);
      }
      return;
    }

    // Apple Pencil is always the needle; a mouse follows the selected tool.
    const needle = type === "pen" || tool === "needle";
    if (needle && !placing && isOnSheet(e)) {
      if (e.button === 0 || type === "pen") {
        if (type === "pen") pan.current = null; // a pencil that comes down wins over a finger that was panning
        drawing.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        engineRef.current?.pointer(e.nativeEvent);
      }
      return;
    }
    startPan(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const known = pointers.current.get(e.pointerId);
    if (known) {
      known.x = e.clientX;
      known.y = e.clientY;
    }
    const g = pinch.current;
    if (g?.ids.includes(e.pointerId)) {
      const a = pointers.current.get(g.ids[0]);
      const b = pointers.current.get(g.ids[1]);
      if (!a || !b) return;
      const store = useWorkspaceStore.getState();
      const view = pinchView(g.start, stagePoint(a), stagePoint(b), { width: store.stageWidth, height: store.stageHeight }, { minZoom: ZOOM_MIN, maxZoom: ZOOM_MAX });
      store.setView({ zoom: view.zoom, rotation: view.rotationDeg, offsetX: view.offsetX, offsetY: view.offsetY });
      return;
    }
    if (drawing.current === e.pointerId) {
      engineRef.current?.pointer(e.nativeEvent);
      return;
    }
    const p = pan.current;
    if (!p || p.pointerId !== e.pointerId) return;
    useWorkspaceStore.getState().setOffset(p.originX + e.clientX - p.startX, p.originY + e.clientY - p.startY);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (drawing.current === e.pointerId) {
      drawing.current = null;
      engineRef.current?.pointer(e.nativeEvent);
      return;
    }
    const g = pinch.current;
    if (g?.ids.includes(e.pointerId)) {
      pinch.current = null;
      const left = touchIds();
      if (left.length >= 2) startPinch(e); // a third finger takes over
      else if (left.length === 1) {
        // One finger is still down: carry on moving the sheet with it, from where it is now.
        const rest = pointers.current.get(left[0]!)!;
        startPan(e, left[0]!, { x: rest.x, y: rest.y });
      } else setIsPanning(false);
      return;
    }
    if (pan.current?.pointerId === e.pointerId) {
      pan.current = null;
      setIsPanning(false);
    }
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
        <div className="sheet__label">{t("workspace.sheet.label", { w: format.decimal(toDisplay(SHEET_MM.width / 10, units)), h: format.decimal(toDisplay(SHEET_MM.height / 10, units)), unit: t(`workspace.units.${units}`) })}</div>
      </div>
    </div>
  );
}
