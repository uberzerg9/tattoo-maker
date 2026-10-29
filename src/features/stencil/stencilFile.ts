/** Largest sketch we accept, per SPEC. */
export const MAX_SKETCH_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_SKETCH_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** The stencil raster never needs more than twice the buffer size, so bigger sketches are shrunk. */
const MAX_SKETCH_SIDE_PX = 4096;

export type SketchErrorCode = "type" | "size" | "decode";

export class SketchError extends Error {
  readonly code: SketchErrorCode;
  constructor(code: SketchErrorCode) {
    super(code);
    this.name = "SketchError";
    this.code = code;
  }
}

const EXTENSION_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** The file's image type, from the browser's guess or else its extension. */
export function sketchType(file: Pick<File, "type" | "name">): string | null {
  if ((ACCEPTED_SKETCH_TYPES as readonly string[]).includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type === "" ? (EXTENSION_TYPES[ext] ?? null) : null;
}

/** Throws a SketchError when the file cannot be used. */
export function checkSketchFile(file: Pick<File, "type" | "name" | "size">): void {
  if (sketchType(file) === null) throw new SketchError("type");
  if (file.size > MAX_SKETCH_BYTES) throw new SketchError("size");
}

/** Decodes a sketch, shrinking very large ones. */
export async function decodeSketch(file: File): Promise<ImageBitmap> {
  checkSketchFile(file);
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_SKETCH_SIDE_PX) return bitmap;
    const k = MAX_SKETCH_SIDE_PX / longest;
    const small = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * k),
      resizeHeight: Math.round(bitmap.height * k),
      resizeQuality: "high",
    });
    bitmap.close();
    return small;
  } catch {
    throw new SketchError("decode");
  }
}
