import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { clampPlacement, defaultPlacement } from "../engine/stencil";
import type { StencilSize } from "../engine/stencil";
import type { StencilPlacement, UnsupportedReason } from "../engine/types";
import { clampOffset } from "../features/workspace/viewClamp";
import {
  DEFAULT_PANEL_POSITIONS,
  MACHINE_HZ_DEFAULT,
  MACHINE_HZ_MAX,
  MACHINE_HZ_MIN,
  PANEL_IDS,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../features/workspace/config";
import type {
  CartridgeId,
  InkCapId,
  PanelId,
  PanelPosition,
  RenderMode,
  SkinToneId,
  Tool,
} from "../features/workspace/config";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const stageOf = (s: { stageWidth: number; stageHeight: number }) => ({
  width: s.stageWidth,
  height: s.stageHeight,
});

function allPanels<T>(value: T): Record<PanelId, T> {
  return Object.fromEntries(PANEL_IDS.map((id) => [id, value])) as Record<
    PanelId,
    T
  >;
}

const FIRST_PANEL_Z = 11;
const initialPanelZ = Object.fromEntries(
  PANEL_IDS.map((id, i) => [id, FIRST_PANEL_Z + i]),
) as Record<PanelId, number>;

interface WorkspaceState {
  cartridge: CartridgeId;
  inkCap: InkCapId;
  machineHz: number;
  renderMode: RenderMode;
  tool: Tool;
  skinTone: SkinToneId;
  stencilVisible: boolean;
  stencilOpacity: number;
  /** Name of the uploaded stencil source, null until the user uploads one. */
  stencilFileName: string | null;
  /** Object URL of the sketch behind the current stencil, for the panel thumbnail. */
  stencilThumbUrl: string | null;
  /** Size of the current stencil at scale 1, mm; null while there is none. */
  stencilSize: StencilSize | null;
  stencilPlacement: StencilPlacement;
  /** The first stroke after a transfer locks the stencil in place. */
  stencilLocked: boolean;
  /** The Stencil transfer dialog; `file` is a sketch that was dropped or picked to start it. */
  stencilDialog: { open: boolean; file: File | null };

  /** Ink left in each cap and in the cartridge, 0–100. */
  capLevels: Record<InkCapId, number>;
  cartridgeInk: number;
  /** Bumped by dip(); useEngine turns each bump into engine.dip(). */
  dipCount: number;

  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;

  panelPositions: Record<PanelId, PanelPosition>;
  panelOpen: Record<PanelId, boolean>;
  panelZ: Record<PanelId, number>;
  topZ: number;

  /** Stage size in CSS px, reported by the Stage; the pan limits depend on it. */
  stageWidth: number;
  stageHeight: number;

  /** Set when the engine cannot run in this browser. */
  engineError: UnsupportedReason | null;

  setEngineError: (reason: UnsupportedReason | null) => void;
  /** Engine → store: ink in the current cartridge and in the caps, as 0–100. */
  setInkState: (state: { cartridgeInk?: number; capLevels?: Record<InkCapId, number> }) => void;
  dip: () => void;
  setStageSize: (width: number, height: number) => void;
  setCartridge: (id: CartridgeId) => void;
  setInkCap: (id: InkCapId) => void;
  setMachineHz: (hz: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setTool: (tool: Tool) => void;
  setSkinTone: (id: SkinToneId) => void;
  toggleStencil: () => void;
  openStencilDialog: (file?: File | null) => void;
  closeStencilDialog: () => void;
  /** A stencil was put on the skin: remember its sketch and start it centred and unlocked. */
  stencilTransferred: (info: { fileName: string; thumbUrl: string; size: StencilSize }) => void;
  setStencilPlacement: (placement: StencilPlacement) => void;
  setStencilLocked: (locked: boolean) => void;
  setStencilOpacity: (pct: number) => void;

  setZoom: (zoom: number) => void;
  setOffset: (x: number, y: number) => void;
  setRotation: (deg: number) => void;
  resetView: () => void;

  movePanel: (id: PanelId, x: number, y: number) => void;
  togglePanel: (id: PanelId) => void;
  raisePanel: (id: PanelId) => void;
  resetLayout: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  subscribeWithSelector((set) => ({
    cartridge: "m1-7",
    inkCap: "black",
    machineHz: MACHINE_HZ_DEFAULT,
    renderMode: "fresh",
    tool: "needle",
    skinTone: "t2",
    stencilVisible: true,
    stencilOpacity: 60,
    stencilFileName: null,
    stencilThumbUrl: null,
    stencilSize: null,
    stencilPlacement: defaultPlacement(),
    stencilLocked: false,
    stencilDialog: { open: false, file: null },

    capLevels: { black: 100, g60: 100, g30: 100, g10: 100, white: 100 },
    cartridgeInk: 100,
    dipCount: 0,

    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,

    panelPositions: { ...DEFAULT_PANEL_POSITIONS },
    panelOpen: allPanels(true),
    panelZ: initialPanelZ,
    topZ: FIRST_PANEL_Z + PANEL_IDS.length - 1,

    stageWidth: 1280,
    stageHeight: 720,
    engineError: null,

    setEngineError: (engineError) => set({ engineError }),
    setInkState: (state) =>
      set((s) => ({
        cartridgeInk: state.cartridgeInk ?? s.cartridgeInk,
        capLevels: state.capLevels ?? s.capLevels,
      })),
    dip: () => set((s) => ({ dipCount: s.dipCount + 1 })),
    setStageSize: (stageWidth, stageHeight) =>
      set((s) => ({
        stageWidth,
        stageHeight,
        ...clampOffset(s.offsetX, s.offsetY, s.zoom, s.rotation, {
          width: stageWidth,
          height: stageHeight,
        }),
      })),
    setCartridge: (cartridge) => set({ cartridge }),
    setInkCap: (inkCap) => set({ inkCap }),
    setMachineHz: (hz) =>
      set({ machineHz: clamp(hz, MACHINE_HZ_MIN, MACHINE_HZ_MAX) }),
    setRenderMode: (renderMode) => set({ renderMode }),
    setTool: (tool) => set({ tool }),
    setSkinTone: (skinTone) => set({ skinTone }),
    toggleStencil: () => set((s) => ({ stencilVisible: !s.stencilVisible })),
    openStencilDialog: (file = null) => set({ stencilDialog: { open: true, file } }),
    closeStencilDialog: () => set({ stencilDialog: { open: false, file: null } }),
    stencilTransferred: ({ fileName, thumbUrl, size }) =>
      set((s) => {
        if (s.stencilThumbUrl) URL.revokeObjectURL(s.stencilThumbUrl);
        return {
          stencilFileName: fileName,
          stencilThumbUrl: thumbUrl,
          stencilSize: size,
          stencilPlacement: clampPlacement(defaultPlacement(), size),
          stencilLocked: false,
        };
      }),
    setStencilPlacement: (placement) =>
      set((s) => ({
        stencilPlacement: s.stencilSize ? clampPlacement(placement, s.stencilSize) : placement,
      })),
    setStencilLocked: (stencilLocked) => set({ stencilLocked }),
    setStencilOpacity: (stencilOpacity) => set({ stencilOpacity }),

    setZoom: (value) =>
      set((s) => {
        const zoom = clamp(Math.round(value * 100) / 100, ZOOM_MIN, ZOOM_MAX);
        return {
          zoom,
          ...clampOffset(s.offsetX, s.offsetY, zoom, s.rotation, stageOf(s)),
        };
      }),
    setOffset: (x, y) =>
      set((s) => clampOffset(x, y, s.zoom, s.rotation, stageOf(s))),
    setRotation: (deg) =>
      set((s) => {
        let rotation = ((Math.round(deg) % 360) + 360) % 360;
        if (rotation > 180) rotation -= 360;
        return {
          rotation,
          ...clampOffset(s.offsetX, s.offsetY, s.zoom, rotation, stageOf(s)),
        };
      }),
    resetView: () => set({ zoom: 1, offsetX: 0, offsetY: 0 }),

    movePanel: (id, x, y) =>
      set((s) => ({
        panelPositions: {
          ...s.panelPositions,
          [id]: {
            ...s.panelPositions[id],
            x: Math.max(0, x),
            y: Math.max(0, y),
          },
        },
      })),
    togglePanel: (id) =>
      set((s) => ({ panelOpen: { ...s.panelOpen, [id]: !s.panelOpen[id] } })),
    raisePanel: (id) =>
      set((s) => {
        const topZ = s.topZ + 1;
        return { topZ, panelZ: { ...s.panelZ, [id]: topZ } };
      }),
    resetLayout: () =>
      set({
        panelPositions: { ...DEFAULT_PANEL_POSITIONS },
        panelOpen: allPanels(true),
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
      }),
  })),
);
