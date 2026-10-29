import type { CartridgeId } from "../types";

export type NeedleLayout = "round-tight" | "round-loose" | "flat-row" | "curved-row";

export interface CartridgePreset {
  group: string;
  needles: number;
  /** Needle point width, mm. */
  needleMm: number;
  layout: NeedleLayout;
  /** Overall width of the needle group, mm. */
  footprintMm: number;
  /** Ink density one needle dot deposits at full depth, 0..1. */
  inkPerHit: number;
  traumaPerHit: number;
  /** Per-needle random offset, ± mm. */
  spreadMm: number;
}

export interface PresetBundle {
  version: number;
  cartridges: Record<CartridgeId, CartridgePreset>;
  ink: { consumptionPerHit: number; fadeBelow: number };
  trauma: { overworkThreshold: number; blowoutDepth: number };
  render: { healedInkFactor: number; healedBlurMm: number; freshRedness: number };
}

export const SUPPORTED_PRESET_VERSION = 1;

export const CARTRIDGE_IDS = ["rl-3", "rl-7", "rs-9", "m1-7", "rm-15"] as const satisfies readonly CartridgeId[];
const LAYOUTS: readonly NeedleLayout[] = ["round-tight", "round-loose", "flat-row", "curved-row"];

export class PresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresetError";
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PresetError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function number(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  integer = false,
): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new PresetError(`${path}.${key} must be a number`);
  if (v < min || v > max) throw new PresetError(`${path}.${key} must be between ${min} and ${max}`);
  if (integer && !Number.isInteger(v)) throw new PresetError(`${path}.${key} must be an integer`);
  return v;
}

/** Validates a cartridge preset file (bundled JSON, or Firestore later) and returns it typed. */
export function parsePresets(json: unknown): PresetBundle {
  const root = record(json, "presets");
  const version = number(root, "version", "presets", 0, Number.MAX_SAFE_INTEGER, true);
  if (version !== SUPPORTED_PRESET_VERSION) {
    throw new PresetError(`presets.version ${version} is not supported (expected ${SUPPORTED_PRESET_VERSION})`);
  }

  const cartridgesIn = record(root.cartridges, "presets.cartridges");
  const cartridges = {} as Record<CartridgeId, CartridgePreset>;
  for (const id of CARTRIDGE_IDS) {
    const path = `presets.cartridges.${id}`;
    const c = record(cartridgesIn[id], path);
    const layout = c.layout;
    if (typeof layout !== "string" || !LAYOUTS.includes(layout as NeedleLayout)) {
      throw new PresetError(`${path}.layout must be one of ${LAYOUTS.join(", ")}`);
    }
    if (typeof c.group !== "string" || c.group === "") throw new PresetError(`${path}.group must be a string`);
    cartridges[id] = {
      group: c.group,
      needles: number(c, "needles", path, 1, 64, true),
      needleMm: number(c, "needleMm", path, 0.01, 2),
      layout: layout as NeedleLayout,
      footprintMm: number(c, "footprintMm", path, 0.01, 20),
      inkPerHit: number(c, "inkPerHit", path, 0, 1),
      traumaPerHit: number(c, "traumaPerHit", path, 0, 1),
      spreadMm: number(c, "spreadMm", path, 0, 1),
    };
  }

  const ink = record(root.ink, "presets.ink");
  const trauma = record(root.trauma, "presets.trauma");
  const render = record(root.render, "presets.render");
  return {
    version,
    cartridges,
    ink: {
      consumptionPerHit: number(ink, "consumptionPerHit", "presets.ink", 0, 1),
      fadeBelow: number(ink, "fadeBelow", "presets.ink", 0, 1),
    },
    trauma: {
      overworkThreshold: number(trauma, "overworkThreshold", "presets.trauma", 0, 1),
      blowoutDepth: number(trauma, "blowoutDepth", "presets.trauma", 0, 1),
    },
    render: {
      healedInkFactor: number(render, "healedInkFactor", "presets.render", 0, 1),
      healedBlurMm: number(render, "healedBlurMm", "presets.render", 0, 5),
      freshRedness: number(render, "freshRedness", "presets.render", 0, 1),
    },
  };
}
