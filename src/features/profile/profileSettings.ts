import { MACHINE_HZ_MAX, MACHINE_HZ_MIN, MACHINE_HZ_STEP, SKIN_TONE_IDS } from "../workspace/config";
import type { SkinToneId } from "../workspace/config";
import { isUnits } from "../workspace/units";
import type { Units } from "../workspace/units";

/** What a new work starts with. Stored as users/{uid}.settings. */
export interface WorkspaceDefaults {
  skinTone: SkinToneId;
  machineHz: number;
  units: Units;
}

/** Same as the sign-up writes (claimProfile) and the Workspace starts with. */
export const DEFAULT_SETTINGS: WorkspaceDefaults = { skinTone: "t2", machineHz: 85, units: "cm" };

const isTone = (v: unknown): v is SkinToneId => typeof v === "string" && (SKIN_TONE_IDS as string[]).includes(v);

/** Snaps a speed to the machine's range and step. */
export function clampHz(value: number): number {
  const snapped = Math.round(value / MACHINE_HZ_STEP) * MACHINE_HZ_STEP;
  return Math.min(MACHINE_HZ_MAX, Math.max(MACHINE_HZ_MIN, snapped));
}

/** Reads settings from a profile document; anything missing or invalid is the default. */
export function sanitizeSettings(raw: unknown): WorkspaceDefaults {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    skinTone: isTone(r.skinTone) ? r.skinTone : DEFAULT_SETTINGS.skinTone,
    machineHz: typeof r.machineHz === "number" && Number.isFinite(r.machineHz) ? clampHz(r.machineHz) : DEFAULT_SETTINGS.machineHz,
    units: isUnits(r.units) ? r.units : DEFAULT_SETTINGS.units,
  };
}
