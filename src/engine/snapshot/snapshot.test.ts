import { describe, expect, it } from "vitest";
import { BUFFER_TEXELS } from "../constants";
import { SnapshotError, decodeBuffers, encodeBuffers } from "./format";
import type { RawBuffers } from "./format";
import { floatToHalf, floatsToHalves, halfToFloat } from "./half";

describe("half floats", () => {
  it("every half-float value survives half → float → half", () => {
    for (let h = 0; h < 0x10000; h++) {
      const isNan = (h & 0x7c00) === 0x7c00 && (h & 0x3ff) !== 0;
      if (isNan) {
        expect(Number.isNaN(halfToFloat(h))).toBe(true);
        continue;
      }
      expect(floatToHalf(halfToFloat(h))).toBe(h);
    }
  });

  it("converts known values", () => {
    expect(floatToHalf(0)).toBe(0);
    expect(floatToHalf(1)).toBe(0x3c00);
    expect(floatToHalf(-2)).toBe(0xc000);
    expect(floatToHalf(0.5)).toBe(0x3800);
    expect(floatToHalf(65504)).toBe(0x7bff);
    expect(floatToHalf(1e6)).toBe(0x7c00); // overflow → infinity
    expect(floatToHalf(1e-10)).toBe(0); // underflow → zero
    expect(halfToFloat(0x3c00)).toBe(1);
  });

  it("rounds to nearest even", () => {
    // 1 + 2^-11 is exactly between 1 and the next half (1 + 2^-10): ties go to the even one, 1
    expect(floatToHalf(1 + 2 ** -11)).toBe(0x3c00);
    expect(floatToHalf(1 + 3 * 2 ** -11)).toBe(0x3c02);
  });

  it("keeps one channel of an interleaved array", () => {
    const out = new Uint16Array(2);
    floatsToHalves(new Float32Array([1, 9, 9, 9, 0.5, 9, 9, 9]), out, 0, 4, 0);
    expect([...out]).toEqual([0x3c00, 0x3800]);
  });
});

/** toEqual would build a diff of millions of elements on failure; compare the bytes. */
const same = (a: Uint16Array, b: Uint16Array) =>
  a.length === b.length && Buffer.compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;

function sample(): RawBuffers {
  const n = BUFFER_TEXELS.width * BUFFER_TEXELS.height;
  const levels = new Uint16Array(n * 4);
  const total = new Uint16Array(n);
  const trauma = new Uint16Array(n);
  for (let i = 0; i < n; i += 997) {
    levels[i * 4] = 0x3c00 - (i % 5);
    levels[i * 4 + 3] = i % 0x7bff;
    total[i] = (i * 31) % 0x7bff;
    trauma[i] = 0x4000 + (i % 100);
  }
  return { levels, total, trauma };
}

describe("buffer files", () => {
  it("round-trips bit for bit", async () => {
    const raw = sample();
    const { ink, trauma } = await encodeBuffers(raw);
    const back = await decodeBuffers(ink, trauma);
    expect(same(back.levels, raw.levels)).toBe(true);
    expect(same(back.total, raw.total)).toBe(true);
    expect(same(back.trauma, raw.trauma)).toBe(true);
  });

  it("compresses a mostly empty sheet to a few hundred kilobytes at most", async () => {
    const { ink, trauma } = await encodeBuffers(sample());
    expect(ink.size).toBeLessThan(2 * 1024 * 1024);
    expect(trauma.size).toBeLessThan(1024 * 1024);
  });

  it("rejects a file that is not gzip, one of the wrong kind, and a truncated one", async () => {
    const { ink, trauma } = await encodeBuffers(sample());
    await expect(decodeBuffers(new Blob(["nope"]), trauma)).rejects.toBeInstanceOf(SnapshotError);
    await expect(decodeBuffers(trauma, ink)).rejects.toThrow(/Not a saved ink buffer/);
    await expect(decodeBuffers(ink.slice(0, Math.floor(ink.size / 2)), trauma)).rejects.toThrow();
  });
});
