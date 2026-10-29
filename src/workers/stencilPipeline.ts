import type cvImport from "@techstark/opencv-js";
import { CSS_PX_PER_MM } from "../engine/constants";

/** The initialised OpenCV.js module. */
export type CV = Awaited<typeof cvImport>;

export interface GrayImage {
  /** 8-bit grey, row by row; 255 is paper. */
  data: Uint8Array;
  width: number;
  height: number;
}

export interface StencilParams {
  /** 0–255: how dark a pixel must be to count as a line. Higher means less noise and shading. */
  threshold: number;
  /** Line weight of the stencil in CSS px at 100% zoom (so 1 px = 0.31 mm on the skin). */
  lineWeightPx: number;
  /** Drop filled areas and shading, keep thin lines. */
  removeFills: boolean;
  /** Height of the stencil on the skin, mm. */
  heightMm: number;
  /** Raster resolution: the engine buffer's 10.24 for the real thing, less for live previews. */
  texelsPerMm: number;
  /** The distance field costs a second transform; previews skip it. */
  withDistance: boolean;
}

export interface StencilResult {
  width: number;
  height: number;
  /** One byte per texel, 255 on a stencil line, 0 elsewhere. */
  mask: Uint8Array;
  /** Distance to the nearest line centre in mm, per texel; null when not requested. */
  distanceMm: Float32Array | null;
  widthMm: number;
  heightMm: number;
}

/** Distance reported when the sketch has no line at all. */
export const NO_LINE_DISTANCE_MM = 1000;

/** [tune] Features wider than this are fills, not lines. */
const FILL_KERNEL_MM = 3;
/**
 * [tune] Hatching is lines closer than HATCH_GAP_MM: closing fills the gaps between them. Where
 * more than HATCH_FILL_SHARE of a HATCH_WINDOW_MM window is such filled-in gap it is shading.
 * Hatching close enough to be nearly solid at that raster has no gaps left, so a window that
 * is mostly line counts too. A single line, even a thick one, fills nothing and covers under
 * a fifth of the window, and two contours 1.5 mm apart fill about a quarter, so outlines survive.
 */
const HATCH_GAP_MM = 2;
const HATCH_WINDOW_MM = 5;
const HATCH_FILL_SHARE = 0.35;
/**
 * [tune] Shading covers an area; a crowd of outlines where petals cross does not. A dense patch
 * narrower than this is a junction and is kept. Wrongly deleting part of an outline is worse than
 * leaving a little hatching, so only areas this wide count as shading.
 */
const HATCH_MIN_REGION_MM = 12;
/** Stripes of flagged area this close together count as one region. */
const HATCH_MERGE_MM = 4;
/** How far past a hatched area its edge lines are removed too. */
const HATCH_EDGE_MM = 3;
/** Hatching is a millimetre-scale feature, so it is found at this coarser raster (much faster). */
const HATCH_TEXELS_PER_MM = 2.56;

/** [tune] Dust smaller than this is not a line. */
const MIN_COMPONENT_MM2 = 0.15;

const odd = (n: number) => Math.max(3, Math.round(n) | 1);

/** RGBA → grey, with transparent pixels counted as white paper. */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = rgba[p + 3]! / 255;
    const g = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
    gray[i] = Math.round(g * a + 255 * (1 - a));
  }
  return gray;
}

/**
 * Turns a sketch into a stencil: crisp uniform-width lines plus a distance field measured from
 * their centres, at the engine's texel size. Every OpenCV matrix is freed before returning.
 */
export function buildStencil(cv: CV, gray: GrayImage, p: StencilParams): StencilResult {
  const mats: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(m: T): T => {
    mats.push(m);
    return m;
  };
  const texels = p.texelsPerMm;

  try {
    const height = Math.max(8, Math.round(p.heightMm * texels));
    const width = Math.max(8, Math.round((height * gray.width) / gray.height));

    // 1. Resample to the stencil's own raster. No pre-blur: it would wash thin pencil lines out
    //    below the threshold, and the speckle filter below already deals with noise.
    const source = own(cv.matFromArray(gray.height, gray.width, cv.CV_8UC1, gray.data as unknown as number[]));
    const smooth = own(new cv.Mat());
    cv.resize(source, smooth, new cv.Size(width, height), 0, 0, cv.INTER_AREA);

    // 2. Which pixels are lines.
    let lines = own(new cv.Mat());
    if (p.removeFills) {
      // Black-hat keeps dark features narrower than the kernel: thin lines stay, fills and
      // smooth shading are wider than the kernel (or too flat) and vanish.
      const k = odd(FILL_KERNEL_MM * texels);
      const kernel = own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)));
      const blackHat = own(new cv.Mat());
      cv.morphologyEx(smooth, blackHat, cv.MORPH_BLACKHAT, kernel);
      cv.threshold(blackHat, lines, p.threshold - 1, 255, cv.THRESH_BINARY);

      // Hatching survives black-hat as lots of thin lines; find it and drop the lines inside.
      const hatch = findHatching(cv, own, lines, texels);
      const notHatch = own(new cv.Mat());
      cv.bitwise_not(hatch, notHatch);
      const kept = own(new cv.Mat());
      cv.bitwise_and(lines, notHatch, kept);
      lines = kept;
    } else {
      cv.threshold(smooth, lines, 255 - p.threshold, 255, cv.THRESH_BINARY_INV);
    }
    lines = dropSpeckle(cv, own, lines, MIN_COMPONENT_MM2 * texels * texels);

    // 3. The line centres: ridge of the distance transform inside the lines.
    const inside = own(new cv.Mat());
    cv.distanceTransform(lines, inside, cv.DIST_L2, cv.DIST_MASK_5);
    const insideMax = own(new cv.Mat());
    cv.dilate(inside, insideMax, own(cv.Mat.ones(3, 3, cv.CV_8U)));
    const ridge = own(new cv.Mat());
    cv.compare(inside, insideMax, ridge, cv.CMP_GE);
    const isInside = own(new cv.Mat());
    cv.threshold(inside, isInside, 0.5, 255, cv.THRESH_BINARY);
    const isInside8 = own(new cv.Mat());
    isInside.convertTo(isInside8, cv.CV_8U);
    cv.bitwise_and(ridge, isInside8, ridge);

    // 4. The stencil itself: centre lines at the requested weight, so every line is the same width.
    const weightTexels = (p.lineWeightPx / CSS_PX_PER_MM) * texels;
    const d = Math.max(1, 2 * Math.round(weightTexels / 2) + 1);
    let mask = own(new cv.Mat());
    if (d > 1) {
      cv.dilate(ridge, mask, own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(d, d))));
    } else {
      ridge.copyTo(mask);
    }
    if (!p.removeFills) {
      // Fills were asked for: keep them as drawn, on top of the uniform lines.
      const both = own(new cv.Mat());
      cv.bitwise_or(mask, lines, both);
      mask = both;
    }

    // 5. Distance to the nearest line centre, in mm.
    let distanceMm: Float32Array | null = null;
    if (p.withDistance) {
      distanceMm = new Float32Array(width * height);
      if (cv.countNonZero(ridge) === 0) {
        distanceMm.fill(NO_LINE_DISTANCE_MM);
      } else {
        const notRidge = own(new cv.Mat());
        cv.bitwise_not(ridge, notRidge);
        const dist = own(new cv.Mat());
        cv.distanceTransform(notRidge, dist, cv.DIST_L2, cv.DIST_MASK_PRECISE);
        const texelsToMm = 1 / texels;
        const src = dist.data32F;
        for (let i = 0; i < distanceMm.length; i++) distanceMm[i] = src[i]! * texelsToMm;
      }
    }

    return {
      width,
      height,
      mask: new Uint8Array(mask.data),
      distanceMm,
      widthMm: width / texels,
      heightMm: height / texels,
    };
  } finally {
    for (const m of mats) m.delete();
  }
}

/** Removes connected blobs smaller than `minArea` texels. */
function dropSpeckle<T extends { delete(): void }>(
  cv: CV,
  own: (m: T) => T,
  lines: InstanceType<CV["Mat"]>,
  minArea: number,
): InstanceType<CV["Mat"]> {
  const labels = own(new cv.Mat() as unknown as T) as unknown as InstanceType<CV["Mat"]>;
  const stats = own(new cv.Mat() as unknown as T) as unknown as InstanceType<CV["Mat"]>;
  const centroids = own(new cv.Mat() as unknown as T) as unknown as InstanceType<CV["Mat"]>;
  const count = cv.connectedComponentsWithStats(lines, labels, stats, centroids, 8);
  const keep = new Uint8Array(count);
  for (let i = 1; i < count; i++) keep[i] = stats.data32S[i * 5 + 4]! >= minArea ? 1 : 0;

  const out = own(cv.Mat.zeros(lines.rows, lines.cols, cv.CV_8UC1) as unknown as T) as unknown as InstanceType<CV["Mat"]>;
  const label = labels.data32S;
  const data = out.data;
  for (let i = 0; i < label.length; i++) if (keep[label[i]!]) data[i] = 255;
  return out;
}

/** Areas of shading made of close-set lines, as a mask the size of `lines`. */
function findHatching(
  cv: CV,
  own: <T extends { delete(): void }>(m: T) => T,
  lines: InstanceType<CV["Mat"]>,
  texels: number,
): InstanceType<CV["Mat"]> {
  const scale = Math.min(1, HATCH_TEXELS_PER_MM / texels);
  const t = texels * scale;
  const work = own(new cv.Mat());
  if (scale < 1) {
    cv.resize(lines, work, new cv.Size(Math.max(1, Math.round(lines.cols * scale)), Math.max(1, Math.round(lines.rows * scale))), 0, 0, cv.INTER_AREA);
    cv.threshold(work, work, 0, 255, cv.THRESH_BINARY); // any line in the pixel keeps it a line
  } else {
    lines.copyTo(work);
  }

  const gap = odd(HATCH_GAP_MM * t);
  const closed = own(new cv.Mat());
  cv.morphologyEx(work, closed, cv.MORPH_CLOSE, own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(gap, gap))));
  const filled = own(new cv.Mat());
  cv.bitwise_xor(closed, work, filled); // the gaps that closing filled in
  const window = odd(HATCH_WINDOW_MM * t);
  const share = own(new cv.Mat());
  cv.blur(filled, share, new cv.Size(window, window));
  const filledCore = own(new cv.Mat());
  cv.threshold(share, filledCore, HATCH_FILL_SHARE * 255, 255, cv.THRESH_BINARY);
  const cover = own(new cv.Mat());
  cv.blur(work, cover, new cv.Size(window, window));
  const coverCore = own(new cv.Mat());
  cv.threshold(cover, coverCore, HATCH_FILL_SHARE * 255, 255, cv.THRESH_BINARY);
  const core = own(new cv.Mat());
  cv.bitwise_or(filledCore, coverCore, core);
  const merge = odd(HATCH_MERGE_MM * t);
  const merged = own(new cv.Mat());
  cv.morphologyEx(core, merged, cv.MORPH_CLOSE, own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(merge, merge))));
  const region = odd(HATCH_MIN_REGION_MM * t);
  const wide = own(new cv.Mat());
  cv.morphologyEx(merged, wide, cv.MORPH_OPEN, own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(region, region))));
  const reach = odd(HATCH_EDGE_MM * 2 * t);
  const area = own(new cv.Mat());
  cv.dilate(wide, area, own(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(reach, reach))));

  const out = own(new cv.Mat());
  if (scale < 1) cv.resize(area, out, new cv.Size(lines.cols, lines.rows), 0, 0, cv.INTER_NEAREST);
  else area.copyTo(out);
  return out;
}
