export type Rgb = readonly [number, number, number];

/** "#e6c3a7" → [230, 195, 167]. Falls back to white for anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGBA pixels of stencil lines in `line` colour over `skin`, from a 0–255 line mask. */
export function paintPreview(mask: Uint8Array, skin: Rgb, line: Rgb): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(mask.length * 4));
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const t = mask[i]! / 255;
    out[p] = skin[0] + (line[0] - skin[0]) * t;
    out[p + 1] = skin[1] + (line[1] - skin[1]) * t;
    out[p + 2] = skin[2] + (line[2] - skin[2]) * t;
    out[p + 3] = 255;
  }
  return out;
}
