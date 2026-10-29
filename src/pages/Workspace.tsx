import { Suspense, lazy, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store/workspaceStore";
import { DEBUG } from "../lib/debug";
import { BottomToolbar } from "../features/workspace/BottomToolbar";
import { FeedbackStrip } from "../features/workspace/FeedbackStrip";
import { DebugOverlay } from "../features/workspace/DebugOverlay";
import { Stage } from "../features/workspace/Stage";
import { TopBar } from "../features/workspace/TopBar";
import { useDipShortcut } from "../features/workspace/useDipShortcut";
import { useEngine } from "../features/workspace/useEngine";
import { CartridgesPanel } from "../features/panels/CartridgesPanel";
import { InkCapsPanel } from "../features/panels/InkCapsPanel";
import { MachinePanel } from "../features/panels/MachinePanel";
import { SkinPanel } from "../features/panels/SkinPanel";
import { StencilPanel } from "../features/panels/StencilPanel";
import "../features/workspace/workspace.css";

// The dialog, and the OpenCV worker behind it, load only when it is first opened.
const StencilDialog = lazy(() => import("../features/stencil/StencilDialog"));

export default function Workspace() {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useEngine(canvasRef);
  useDipShortcut();
  const stencilDialogOpen = useWorkspaceStore((s) => s.stencilDialog.open);

  return (
    <div className="workspace" lang={i18n.resolvedLanguage}>
      <Stage canvasRef={canvasRef} engineRef={engineRef} />
      <TopBar />
      <CartridgesPanel />
      <InkCapsPanel />
      <MachinePanel />
      <SkinPanel />
      <StencilPanel />
      {/* Empty state until the engine emits `score` events (Stage 3). */}
      <FeedbackStrip passes={0} deviationMm={0} traumaLevel="low" />
      <div className="nav-hint">{t("workspace.toolbar.navHint")}</div>
      <BottomToolbar />
      {DEBUG && <DebugOverlay engineRef={engineRef} />}
      {stencilDialogOpen && (
        <Suspense fallback={null}>
          <StencilDialog engineRef={engineRef} />
        </Suspense>
      )}
    </div>
  );
}
