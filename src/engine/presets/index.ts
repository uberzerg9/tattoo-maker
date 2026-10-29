import cartridgesJson from "./cartridges.json";
import { parsePresets } from "./schema";

export * from "./schema";

/** Presets shipped with the build. Firestore `cartridgePresets` can override them later. */
export const bundledPresets = parsePresets(cartridgesJson);
