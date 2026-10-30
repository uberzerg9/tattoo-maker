import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PanelId } from "../workspace/config";
import { useWorkspaceStore } from "../../store/workspaceStore";
import "./panels.css";

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ResizeState {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

/** What a panel can be dragged down to; the CSS minimums are the same. */
const MIN_PANEL_BODY = { width: 220, height: 120 };

interface FloatingPanelProps {
  id: PanelId;
  title: string;
  badge: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function FloatingPanel({ id, title, badge, bodyClassName, children }: FloatingPanelProps) {
  const { t } = useTranslation();
  const position = useWorkspaceStore((s) => s.panelPositions[id]);
  const open = useWorkspaceStore((s) => s.panelOpen[id]);
  const zIndex = useWorkspaceStore((s) => s.panelZ[id]);
  const movePanel = useWorkspaceStore((s) => s.movePanel);
  const togglePanel = useWorkspaceStore((s) => s.togglePanel);
  const raisePanel = useWorkspaceStore((s) => s.raisePanel);
  const drag = useRef<DragState | null>(null);
  const resize = useRef<ResizeState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Set by dragging the corner handle; null until then, so the CSS size applies. */
  const [bodySize, setBodySize] = useState<{ width: number; height: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    raisePanel(id);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    movePanel(id, position.side === "left" ? d.originX + dx : d.originX - dx, d.originY + dy);
  };

  const endDrag = () => {
    drag.current = null;
  };

  // The corner handle replaces the browser's own resize grip, which does not work with a finger.
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;
    e.stopPropagation();
    resize.current = { startX: e.clientX, startY: e.clientY, width: body.offsetWidth, height: body.offsetHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
    raisePanel(id);
  };

  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (!r) return;
    setBodySize({
      width: Math.max(MIN_PANEL_BODY.width, Math.round(r.width + e.clientX - r.startX)),
      height: Math.max(MIN_PANEL_BODY.height, Math.round(r.height + e.clientY - r.startY)),
    });
  };

  const endResize = () => {
    resize.current = null;
  };

  // The safe-area insets keep panels clear of the notch and the home bar when the page runs edge to edge.
  const style: CSSProperties = {
    top: `calc(${position.y}px + env(safe-area-inset-top, 0px))`,
    zIndex,
    ...(position.side === "left"
      ? { left: `calc(${position.x}px + env(safe-area-inset-left, 0px))` }
      : { right: `calc(${position.x}px + env(safe-area-inset-right, 0px))` }),
  };

  return (
    <section aria-label={title} className={`panel panel--${id}`} style={style}>
      <div
        className="panel__header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <h2 className="panel__title">{title}</h2>
        <span className="panel__badge">{badge}</span>
        <button
          type="button"
          className="panel__toggle"
          aria-label={open ? t("workspace.panel.collapse") : t("workspace.panel.expand")}
          aria-expanded={open}
          onClick={() => togglePanel(id)}
        >
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div ref={bodyRef} className={`panel__body ${bodyClassName ?? ""}`} style={bodySize ?? undefined}>
          {children}
        </div>
      )}
      {open && (
        <div
          className="panel__resize"
          aria-hidden="true"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      )}
    </section>
  );
}
