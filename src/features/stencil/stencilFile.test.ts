import { describe, expect, it } from "vitest";
import { MAX_SKETCH_BYTES, SketchError, checkSketchFile, sketchType } from "./stencilFile";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("sketchType", () => {
  it("accepts PNG, JPEG and WEBP by their MIME type", () => {
    expect(sketchType(file("a.png", "image/png"))).toBe("image/png");
    expect(sketchType(file("a.jpg", "image/jpeg"))).toBe("image/jpeg");
    expect(sketchType(file("a.webp", "image/webp"))).toBe("image/webp");
  });

  it("falls back to the extension when the browser gives no type", () => {
    expect(sketchType(file("Sketch.PNG", ""))).toBe("image/png");
    expect(sketchType(file("sketch.jpeg", ""))).toBe("image/jpeg");
  });

  it("rejects everything else, including a lying extension", () => {
    expect(sketchType(file("a.gif", "image/gif"))).toBeNull();
    expect(sketchType(file("a.pdf", "application/pdf"))).toBeNull();
    expect(sketchType(file("a.png", "text/plain"))).toBeNull();
    expect(sketchType(file("noextension", ""))).toBeNull();
  });
});

describe("checkSketchFile", () => {
  it("accepts a normal sketch, and one exactly at the limit", () => {
    expect(() => checkSketchFile(file("a.png", "image/png", 500_000))).not.toThrow();
    expect(() => checkSketchFile(file("a.png", "image/png", MAX_SKETCH_BYTES))).not.toThrow();
  });

  it("rejects files over 10 MB", () => {
    try {
      checkSketchFile(file("big.png", "image/png", MAX_SKETCH_BYTES + 1));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SketchError);
      expect((e as SketchError).code).toBe("size");
    }
  });

  it("rejects the wrong type before looking at the size", () => {
    try {
      checkSketchFile(file("big.gif", "image/gif", MAX_SKETCH_BYTES + 1));
      expect.unreachable();
    } catch (e) {
      expect((e as SketchError).code).toBe("type");
    }
  });
});
