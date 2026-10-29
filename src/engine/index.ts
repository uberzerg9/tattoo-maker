import { Engine } from "./Engine";
import type { EngineOptions, TattooEngine } from "./types";

export function createEngine(options: EngineOptions = {}): TattooEngine {
  return new Engine(options);
}

export * from "./constants";
export type { Hit } from "./hit";
export * from "./types";
export { bundledPresets, parsePresets } from "./presets";
export type { PresetBundle, CartridgePreset } from "./presets";
export * from "./view";
