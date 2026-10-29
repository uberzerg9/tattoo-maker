import { describe, expect, it } from "vitest";
import { BLACK_INK_RGB, INK_TONE, WHITE_INK_RGB, inkTransmittance } from "./ink";
import { blackFloor, emptyDensities, exactDensities, inkedColor, stampInk } from "./inkModel";

const SKIN = [0.9, 0.76, 0.65] as const;
const [BLACK, G60, G30, G10, WHITE] = [0, 1, 2, 3, 4];
const luminance = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

/** Many dots of one ink on one texel, as a long stroke or a held needle would do. */
function paint(c: number[], level: number, amount: number, dots: number) {
  for (let i = 0; i < dots; i++) stampInk(c, level, amount);
  return c;
}

describe("why premultiplied over-blending of a tone colour is not enough", () => {
  // The straightforward model: dst = src + dst * (1 - srcAlpha), colour premultiplied.
  function overBlendGreyOnBlack(dots: number, alpha: number) {
    let r = BLACK_INK_RGB[0]; // premultiplied colour of saturated black: density 1
    let a = 1;
    const grey = inkTransmittance(G30)[0];
    for (let i = 0; i < dots; i++) {
      r = grey * alpha + r * (1 - alpha);
      a = alpha + a * (1 - alpha);
    }
    return r / a;
  }

  it("lightens the black it is painted over, converging on the grey", () => {
    const after = overBlendGreyOnBlack(60, 0.1);
    expect(after).toBeGreaterThan(BLACK_INK_RGB[0] + 0.4);
    expect(after).toBeCloseTo(inkTransmittance(G30)[0], 1);
  });
});

describe("cumulative ink levels", () => {
  it("one ink alone behaves like the usual saturating blend", () => {
    const c = emptyDensities();
    stampInk(c, BLACK, 0.2);
    expect(c.slice(BLACK)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    stampInk(c, BLACK, 0.2);
    expect(c[0]).toBeCloseTo(0.36, 9); // 0.2 + 0.2 * 0.8
  });

  it("never exceeds full density, however many dots land", () => {
    for (const level of [BLACK, G60, G30, G10, WHITE]) {
      const c = paint(emptyDensities(), level, 0.175, 5000);
      for (const v of c) expect(v).toBeLessThanOrEqual(1);
      expect(c[4]).toBeCloseTo(1, 6);
    }
  });

  it("keeps channels ordered: darker levels never exceed lighter ones", () => {
    const c = emptyDensities();
    for (const [level, amount, n] of [[G30, 0.1, 20], [BLACK, 0.15, 10], [G10, 0.2, 30], [WHITE, 0.1, 5], [G60, 0.1, 40]] as const) {
      paint(c, level, amount, n);
      for (let m = 1; m < c.length; m++) expect(c[m]!).toBeGreaterThanOrEqual(c[m - 1]! - 1e-12);
    }
  });

  it("an empty texel shows the skin untouched", () => {
    expect(inkedColor(SKIN, emptyDensities())).toEqual([...SKIN]);
  });

  it("black reaches the black floor and never goes past it", () => {
    const c = paint(emptyDensities(), BLACK, 0.17, 5000);
    const color = inkedColor(SKIN, c);
    const floor = blackFloor(SKIN);
    color.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(floor[i]! - 1e-9);
      expect(v).toBeCloseTo(floor[i]!, 3);
    });
  });

  it("repeated passes darken without ever going past black", () => {
    const c = emptyDensities();
    let prev = luminance(SKIN);
    const floor = luminance(blackFloor(SKIN));
    for (let pass = 0; pass < 12; pass++) {
      paint(c, BLACK, 0.17, 10);
      const l = luminance(inkedColor(SKIN, c));
      expect(l).toBeLessThan(prev);
      expect(l).toBeGreaterThanOrEqual(floor - 1e-9);
      prev = l;
    }
  });
});

describe("grey ink", () => {
  it("shows as grey over skin, however long it is painted", () => {
    const c = paint(emptyDensities(), G30, 0.17, 5000);
    const color = inkedColor(SKIN, c);
    const t = inkTransmittance(G30);
    color.forEach((v, i) => expect(v).toBeCloseTo(SKIN[i]! * t[i]!, 3)); // skin × grey, not black
    expect(luminance(color)).toBeGreaterThan(luminance(SKIN) * 0.6);
  });

  it("a lighter grey stays lighter than a darker grey at saturation", () => {
    const lum = (level: number) => luminance(inkedColor(SKIN, paint(emptyDensities(), level, 0.17, 3000)));
    expect(lum(BLACK)).toBeLessThan(lum(G60));
    expect(lum(G60)).toBeLessThan(lum(G30));
    expect(lum(G30)).toBeLessThan(lum(G10));
    expect(lum(G10)).toBeLessThan(luminance(SKIN));
  });

  it("does not lighten black that is already there", () => {
    const c = paint(emptyDensities(), BLACK, 0.17, 300);
    const before = inkedColor(SKIN, c);
    for (const level of [G60, G30, G10, WHITE]) {
      const copy = [...c];
      paint(copy, level, 0.17, 500);
      const after = inkedColor(SKIN, copy);
      after.forEach((v, i) => expect(v).toBeLessThanOrEqual(before[i]! + 1e-9));
      after.forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 6));
    }
  });

  it("does not lighten part-built black either: it only fills the gaps with grey", () => {
    const c = paint(emptyDensities(), BLACK, 0.1, 4); // black at about 34 %
    const blackOnly = luminance(inkedColor(SKIN, c));
    paint(c, G30, 0.1, 40);
    expect(luminance(inkedColor(SKIN, c))).toBeLessThanOrEqual(blackOnly + 1e-9);
    expect(exactDensities(c)[BLACK]).toBeCloseTo(1 - 0.9 ** 4, 9); // the black is exactly as it was
  });

  it("black painted over grey darkens it towards black", () => {
    const c = paint(emptyDensities(), G30, 0.17, 500);
    const grey = luminance(inkedColor(SKIN, c));
    let prev = grey;
    for (let i = 0; i < 6; i++) {
      paint(c, BLACK, 0.17, 8);
      const l = luminance(inkedColor(SKIN, c));
      expect(l).toBeLessThan(prev);
      prev = l;
    }
    paint(c, BLACK, 0.17, 3000);
    const color = inkedColor(SKIN, c);
    blackFloor(SKIN).forEach((v, i) => expect(color[i]).toBeCloseTo(v, 3));
  });

  it("builds a grey from several caps sensibly: mid grey between darker and lighter", () => {
    const c = paint(emptyDensities(), G10, 0.17, 1000);
    paint(c, G60, 0.05, 6); // a little darker grey on top
    const l = luminance(inkedColor(SKIN, c));
    const lightOnly = luminance(inkedColor(SKIN, paint(emptyDensities(), G10, 0.17, 1000)));
    const darkOnly = luminance(inkedColor(SKIN, paint(emptyDensities(), G60, 0.17, 1000)));
    expect(l).toBeLessThan(lightOnly);
    expect(l).toBeGreaterThan(darkOnly);
  });
});

describe("white ink", () => {
  it("lightens bare skin, fully covering it at saturation", () => {
    const c = paint(emptyDensities(), WHITE, 0.17, 3000);
    const color = inkedColor(SKIN, c);
    color.forEach((v, i) => expect(v).toBeCloseTo(WHITE_INK_RGB[i]!, 3));
    expect(luminance(color)).toBeGreaterThan(luminance(SKIN));
  });

  it("is covered by darker ink painted over it", () => {
    const c = paint(emptyDensities(), WHITE, 0.17, 3000);
    paint(c, BLACK, 0.17, 3000);
    const color = inkedColor(SKIN, c);
    blackFloor(SKIN).forEach((v, i) => expect(color[i]).toBeCloseTo(v, 3));
  });

  it("does not lighten dark ink under it", () => {
    const c = paint(emptyDensities(), G30, 0.17, 3000);
    const before = inkedColor(SKIN, c);
    paint(c, WHITE, 0.17, 3000);
    inkedColor(SKIN, c).forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 6));
  });
});

describe("tones", () => {
  it("are consistent with the cap order used for levels", () => {
    expect(INK_TONE.black).toBeLessThan(INK_TONE.g60);
    expect(INK_TONE.g10).toBeLessThan(INK_TONE.white);
  });
});
