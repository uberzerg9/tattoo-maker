import { describe, expect, it } from "vitest";
import { hexToRgb, paintPreview } from "./stencilPreview";

describe("hexToRgb", () => {
  it("reads six and three digit colours", () => {
    expect(hexToRgb("#e6c3a7")).toEqual([230, 195, 167]);
    expect(hexToRgb(" #fff ")).toEqual([255, 255, 255]);
    expect(hexToRgb("6a3fb5")).toEqual([106, 63, 181]);
  });

  it("falls back to white for nonsense", () => {
    expect(hexToRgb("")).toEqual([255, 255, 255]);
    expect(hexToRgb("#12")).toEqual([255, 255, 255]);
  });
});

describe("paintPreview", () => {
  const skin = [230, 195, 167] as const;
  const line = [106, 63, 181] as const;

  it("shows skin where there is no line and the line colour where there is", () => {
    const px = paintPreview(new Uint8Array([0, 255]), skin, line);
    expect([...px.slice(0, 4)]).toEqual([230, 195, 167, 255]);
    expect([...px.slice(4, 8)]).toEqual([106, 63, 181, 255]);
  });

  it("blends partial coverage and is always opaque", () => {
    const px = paintPreview(new Uint8Array([128]), skin, line);
    expect(px[0]).toBeGreaterThan(106);
    expect(px[0]).toBeLessThan(230);
    expect(px[3]).toBe(255);
  });
});
