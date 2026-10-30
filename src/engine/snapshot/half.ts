const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE half-float bits of a float32 (round to nearest even). */
export function floatToHalf(value: number): number {
  f32[0] = value;
  const x = u32[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  const mant = x & 0x7fffff;

  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // inf, nan
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // overflow to inf
  if (e <= 0) {
    if (e < -10) return sign; // underflow to zero
    // subnormal half
    const m = (mant | 0x800000) >>> (1 - e);
    const round = (m & 0x1fff) > 0x1000 || ((m & 0x1fff) === 0x1000 && (m & 0x2000) !== 0) ? 1 : 0;
    return sign | ((m >>> 13) + round);
  }
  let half = sign | (e << 10) | (mant >>> 13);
  const rest = mant & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && (half & 1) !== 0)) half++; // carries into the exponent correctly
  return half;
}

/** The float32 a half-float's bits stand for. */
export function halfToFloat(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exp = (half >>> 10) & 0x1f;
  const mant = half & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 0x1f) return mant ? Number.NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

/** Converts float32 values to half-float bits, optionally keeping only one channel of each `stride`. */
export function floatsToHalves(src: Float32Array, out: Uint16Array, outOffset = 0, stride = 1, channel = 0): void {
  const n = Math.floor(src.length / stride);
  for (let i = 0; i < n; i++) out[outOffset + i] = floatToHalf(src[i * stride + channel]!);
}
