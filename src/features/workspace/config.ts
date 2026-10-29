import type {
  CartridgeId,
  InkCapId,
  RenderMode,
  TraumaLevel,
} from "../../engine/types";

export type { CartridgeId, InkCapId, RenderMode, TraumaLevel };

export type PanelId = "carts" | "caps" | "machine" | "skin" | "stencil";
export type SkinToneId = "t1" | "t2" | "t3" | "t4" | "t5" | "t6";
export type Tool = "needle" | "hand";
export type LanguageId = "en" | "ru" | "ro";

export interface PanelPosition {
  side: "left" | "right";
  x: number;
  y: number;
}

export const PANEL_IDS: PanelId[] = [
  "carts",
  "caps",
  "machine",
  "skin",
  "stencil",
];

export const DEFAULT_PANEL_POSITIONS: Record<PanelId, PanelPosition> = {
  carts: { side: "left", x: 24, y: 86 },
  caps: { side: "left", x: 24, y: 456 },
  machine: { side: "right", x: 24, y: 86 },
  skin: { side: "right", x: 24, y: 352 },
  stencil: { side: "right", x: 24, y: 512 },
};

/** The sheet must keep at least this much overlap with the stage (CSS px from each stage edge). */
export const PAN_VISIBLE_MARGIN_PX = 120;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;
export const ROTATE_STEP_DEG = 15;
export const ROTATE_WHEEL_STEP_DEG = 5;

export const MACHINE_HZ_MIN = 50;
export const MACHINE_HZ_MAX = 150;
export const MACHINE_HZ_STEP = 5;
export const MACHINE_HZ_DEFAULT = 85;
export const MACHINE_HZ_SHADING = 80;
export const MACHINE_HZ_LINING = 120;

export const STENCIL_OPACITY_MIN = 10;
export const STENCIL_OPACITY_MAX = 100;
export const STENCIL_OPACITY_STEP = 5;

export const CARTRIDGES: { id: CartridgeId; needles: number; group: string }[] =
  [
    { id: "rl-3", needles: 3, group: "RL" },
    { id: "rl-7", needles: 7, group: "RL" },
    { id: "rs-9", needles: 9, group: "RS" },
    { id: "m1-7", needles: 7, group: "M1" },
    { id: "rm-15", needles: 15, group: "RM" },
  ];

export const INK_CAP_IDS: InkCapId[] = ["black", "g60", "g30", "g10", "white"];
export const SKIN_TONE_IDS: SkinToneId[] = ["t1", "t2", "t3", "t4", "t5", "t6"];

export const LANGUAGES: { id: LanguageId; code: string; native: string }[] = [
  { id: "en", code: "EN", native: "English" },
  { id: "ru", code: "RU", native: "Русский" },
  { id: "ro", code: "RO", native: "Română" },
];
