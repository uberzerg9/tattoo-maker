import { useRef } from "react";
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

  const style: CSSProperties = {
    top: position.y,
    zIndex,
    ...(position.side === "left" ? { left: position.x } : { right: position.x }),
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
      {open && <div className={`panel__body ${bodyClassName ?? ""}`}>{children}</div>}
    </section>
  );
}
