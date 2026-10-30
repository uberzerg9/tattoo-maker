import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { stencilCorners } from "../../engine/stencil";
import type { StencilPlacement } from "../../engine/types";
import { screenToSheetMm, sheetMmToScreen } from "../../engine/view";
import type { Point } from "../../engine/view";
import { useWorkspaceStore } from "../../store/workspaceStore";

type DragKind = "move" | "scale" | "rotate";

interface Drag {
  kind: DragKind;
  start: StencilPlacement;
  startPointer: Point;
  startDistance: number;
  startAngle: number;
}

const ROTATE_HANDLE_OFFSET_PX = 34;
const NUDGE_MM = 1;

/**
 * Handles on a stencil that has not been applied yet: drag the middle to move, a corner to
 * resize, the round handle above it to rotate. Applying the stencil (PlacementBar) removes them.
 */
export function StencilHandles() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const size = useWorkspaceStore((s) => s.stencilSize);
  const placement = useWorkspaceStore((s) => s.stencilPlacement);
  const locked = useWorkspaceStore((s) => s.stencilLocked);
  const visible = useWorkspaceStore((s) => s.stencilVisible);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const offsetX = useWorkspaceStore((s) => s.offsetX);
  const offsetY = useWorkspaceStore((s) => s.offsetY);
  const rotation = useWorkspaceStore((s) => s.rotation);
  const stageWidth = useWorkspaceStore((s) => s.stageWidth);
  const stageHeight = useWorkspaceStore((s) => s.stageHeight);
  const setPlacement = useWorkspaceStore((s) => s.setStencilPlacement);

  if (!size || locked || !visible) return null;

  const view = { zoom, offsetX, offsetY, rotationDeg: rotation };
  const stage = { width: stageWidth, height: stageHeight };
  const toScreen = (p: Point) => sheetMmToScreen(p.x, p.y, view, stage);

  const corners = stencilCorners(placement, size).map(toScreen);
  const centre = toScreen({ x: placement.centerXMm, y: placement.centerYMm });
  const topMid = { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
  const outward = Math.hypot(topMid.x - centre.x, topMid.y - centre.y) || 1;
  const rotateAt = {
    x: topMid.x + ((topMid.x - centre.x) / outward) * ROTATE_HANDLE_OFFSET_PX,
    y: topMid.y + ((topMid.y - centre.y) / outward) * ROTATE_HANDLE_OFFSET_PX,
  };

  const pointerMm = (e: PointerEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return screenToSheetMm(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), view, stage);
  };

  const begin = (kind: DragKind, e: PointerEvent<HTMLElement>) => {
    e.stopPropagation(); // not a stroke, not a pan
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointerMm(e);
    const dx = p.x - placement.centerXMm;
    const dy = p.y - placement.centerYMm;
    drag.current = { kind, start: placement, startPointer: p, startDistance: Math.hypot(dx, dy), startAngle: Math.atan2(dy, dx) };
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const p = pointerMm(e);
    const dx = p.x - d.start.centerXMm;
    const dy = p.y - d.start.centerYMm;
    if (d.kind === "move") {
      setPlacement({ ...d.start, centerXMm: d.start.centerXMm + p.x - d.startPointer.x, centerYMm: d.start.centerYMm + p.y - d.startPointer.y });
    } else if (d.kind === "scale") {
      if (d.startDistance > 0.5) setPlacement({ ...d.start, scale: (d.start.scale * Math.hypot(dx, dy)) / d.startDistance });
    } else {
      setPlacement({ ...d.start, rotationDeg: d.start.rotationDeg + ((Math.atan2(dy, dx) - d.startAngle) * 180) / Math.PI });
    }
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    if (drag.current) e.stopPropagation();
    drag.current = null;
  };

  const nudge = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = (e.shiftKey ? 5 : 1) * NUDGE_MM;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setPlacement({ ...placement, centerXMm: placement.centerXMm + d[0], centerYMm: placement.centerYMm + d[1] });
  };

  const at = (p: Point) => ({ left: p.x, top: p.y });

  return (
    <div ref={containerRef} className="stencil-handles">
      <svg className="stencil-handles__outline" width={stageWidth} height={stageHeight} aria-hidden="true">
        <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} />
        <line x1={topMid.x} y1={topMid.y} x2={rotateAt.x} y2={rotateAt.y} />
      </svg>
      <button type="button" className="stencil-handle stencil-handle--move" style={at(centre)} aria-label={t("workspace.placing.move")} onKeyDown={nudge} onPointerDown={(e) => begin("move", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      {corners.map((c, i) => (
        <button key={i} type="button" className="stencil-handle stencil-handle--scale" style={at(c)} aria-label={t("workspace.placing.scale")} onPointerDown={(e) => begin("scale", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      ))}
      <button type="button" className="stencil-handle stencil-handle--rotate" style={at(rotateAt)} aria-label={t("workspace.placing.rotate")} onPointerDown={(e) => begin("rotate", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>
  );
}
