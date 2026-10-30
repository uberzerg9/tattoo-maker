import { useEffect } from "react";
import type { RefObject } from "react";
import { shallow } from "zustand/shallow";
import { createEngine } from "../../engine";
import type { TattooEngine } from "../../engine";
import { DEBUG, DEBUG_TUNING } from "../../lib/debug";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type { SkinToneId } from "./config";

/** Skin tone hex from the design token, so tokens.css stays the single source. */
function skinHex(id: SkinToneId): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--skin-${id}`)
    .trim();
}

/**
 * Creates the engine once per mount, pushes the store state into it and keeps it in sync.
 * UI state stays in the store; engine events flow back into it.
 */
export function useEngine(canvasRef: RefObject<HTMLCanvasElement | null>, engineRef: RefObject<TattooEngine | null>) {

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const store = useWorkspaceStore;
    store.getState().setEngineError(null);
    const engine = createEngine({ debug: DEBUG, tuning: DEBUG_TUNING });
    engineRef.current = engine;
    // Debug sessions only: lets browser tests drive the engine directly.
    if (DEBUG) (window as unknown as { __tattoo?: TattooEngine }).__tattoo = engine;

    const offUnsupported = engine.on("unsupported", (reason) =>
      store.getState().setEngineError(reason),
    );
    // Engine → store: the engine owns the ink and the UI only shows it (0–1 → percent, to 0.1).
    // Subscribed before mount so the initial state reaches the store.
    const percent = (v: number) => Math.round(v * 1000) / 10;
    const offInkLevel = engine.on("inkLevel", (level) =>
      store.getState().setInkState({ cartridgeInk: percent(level) }),
    );
    const offCapLevels = engine.on("capLevels", (caps) =>
      store.getState().setInkState({
        capLevels: {
          black: percent(caps.black),
          g60: percent(caps.g60),
          g30: percent(caps.g30),
          g10: percent(caps.g10),
          white: percent(caps.white),
        },
      }),
    );
    const offScore = engine.on("score", (score) => store.getState().setScore(score));
    const offUndoSteps = engine.on("undoSteps", (steps) => store.getState().setUndoSteps(steps));
    const offDirty = engine.on("dirty", (dirty) => {
      if (!store.getState().workLoading || !dirty) store.getState().setDirty(dirty);
    });
    const offStencilLocked = engine.on("stencilLocked", (locked) =>
      store.getState().setStencilLocked(locked),
    );
    engine.mount(canvas);
    store.getState().setEngineReady(true);

    const s = store.getState();
    engine.setCartridge(s.cartridge);
    engine.setInk(s.inkCap);
    engine.setMachineHz(s.machineHz);
    engine.setSkinTone(skinHex(s.skinTone));
    engine.setView({
      zoom: s.zoom,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
      rotationDeg: s.rotation,
    });
    engine.setRenderMode(s.renderMode);
    engine.setStencilVisibility(s.stencilVisible, s.stencilOpacity / 100);

    const unsubscribe = [
      store.subscribe(
        (st) => st.cartridge,
        (v) => engine.setCartridge(v),
      ),
      store.subscribe(
        (st) => st.inkCap,
        (v) => engine.setInk(v),
      ),
      store.subscribe(
        (st) => st.machineHz,
        (v) => engine.setMachineHz(v),
      ),
      store.subscribe(
        (st) => st.skinTone,
        (v) => engine.setSkinTone(skinHex(v)),
      ),
      store.subscribe(
        (st) => st.renderMode,
        (v) => engine.setRenderMode(v),
      ),
      store.subscribe(
        (st) => st.dipCount,
        () => engine.dip(),
      ),
      store.subscribe(
        (st) => st.undoCount,
        () => engine.undo(),
      ),
      store.subscribe(
        (st) => st.stencilPlacement,
        (v) => engine.setStencilPlacement(v),
      ),
      store.subscribe(
        (st) => ({
          zoom: st.zoom,
          offsetX: st.offsetX,
          offsetY: st.offsetY,
          rotationDeg: st.rotation,
        }),
        (v) => engine.setView(v),
        { equalityFn: shallow },
      ),
      store.subscribe(
        (st) => ({ visible: st.stencilVisible, opacity: st.stencilOpacity }),
        (v) => engine.setStencilVisibility(v.visible, v.opacity / 100),
        { equalityFn: shallow },
      ),
    ];

    return () => {
      unsubscribe.forEach((off) => off());
      offUnsupported();
      offInkLevel();
      offCapLevels();
      offStencilLocked();
      offUndoSteps();
      offDirty();
      store.getState().setEngineReady(false);
      offScore();
      // The ref keeps the destroyed engine: the session hook still reads its score as the page unmounts.
      engine.destroy();
    };
  }, [canvasRef, engineRef]);

  return engineRef;
}
