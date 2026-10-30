import { Suspense, lazy, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../store/workspaceStore";
import { DEBUG } from "../lib/debug";
import { BottomToolbar } from "../features/workspace/BottomToolbar";
import { FeedbackStrip } from "../features/workspace/FeedbackStrip";
import { DebugOverlay } from "../features/workspace/DebugOverlay";
import { Stage } from "../features/workspace/Stage";
import { TopBar } from "../features/workspace/TopBar";
import { VerifyBanner } from "../features/auth/VerifyBanner";
import { useDipShortcut } from "../features/workspace/useDipShortcut";
import { useUndoShortcut } from "../features/workspace/useUndoShortcut";
import { useWorkspaceEvents } from "../features/analytics/useWorkspaceEvents";
import { PlacementBar } from "../features/stencil/PlacementBar";
import { usePlacementKeys } from "../features/stencil/usePlacementKeys";
import { OnboardingTips } from "../features/onboarding/OnboardingTips";
import { UnsupportedScreen } from "../features/support/UnsupportedScreen";
import { useSession } from "../features/session/useSession";
import { useEngine } from "../features/workspace/useEngine";
import { useWorkPersistence } from "../features/works/useWorkPersistence";
import type { TattooEngine } from "../engine";
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
  const engineRef = useRef<TattooEngine | null>(null);
  // Before useEngine: the last save on leaving has to read the sheet before the engine is destroyed.
  useWorkPersistence(engineRef);
  useEngine(canvasRef, engineRef);
  useDipShortcut();
  useUndoShortcut();
  const stencilDialogOpen = useWorkspaceStore((s) => s.stencilDialog.open);
  const score = useWorkspaceStore((s) => s.score);
  useSession(engineRef);
  useWorkspaceEvents();
  usePlacementKeys(engineRef);
  const engineError = useWorkspaceStore((s) => s.engineError);

  // The probe before loading passed but the engine still could not start (for example no renderable float target).
  if (engineError) return <UnsupportedScreen reason={engineError} />;

  return (
    <div className="workspace" lang={i18n.resolvedLanguage}>
      <Stage canvasRef={canvasRef} engineRef={engineRef} />
      <TopBar />
      <VerifyBanner />
      <CartridgesPanel />
      <InkCapsPanel />
      <MachinePanel />
      <SkinPanel />
      <StencilPanel />
      <div className="nav-hint">{t("workspace.toolbar.navHint")}</div>
      <div className="bottom-bar">
        <PlacementBar engineRef={engineRef} />
        <FeedbackStrip passes={score.passes} deviationMm={score.deviationMm} traumaLevel={score.traumaLevel} />
        <BottomToolbar />
      </div>
      <OnboardingTips />
      {DEBUG && <DebugOverlay engineRef={engineRef} />}
      {stencilDialogOpen && (
        <Suspense fallback={null}>
          <StencilDialog engineRef={engineRef} />
        </Suspense>
      )}
    </div>
  );
}
