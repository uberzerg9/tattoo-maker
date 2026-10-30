/** Encodes preview pixels as WebP; browsers that cannot encode WebP give PNG, and the blob's type says so. */
export async function encodePreview(pixels: { width: number; height: number; data: Uint8ClampedArray }): Promise<Blob> {
  const canvas = new OffscreenCanvas(pixels.width, pixels.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the preview");
  ctx.putImageData(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height), 0, 0);
  return canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
}
