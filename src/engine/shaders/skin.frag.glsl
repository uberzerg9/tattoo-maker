#version 300 es
precision highp float;

// Procedural practice skin: tone colour with soft mottling and fine pores.
// Texel (u, v) is sheet position (u * width, v * height) in mm, v down.

in vec2 v_uv;

uniform vec3 u_tone;
uniform vec2 u_sizeMm;

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 mm = v_uv * u_sizeMm;
  float fine = valueNoise(mm * 3.0);
  float mid = valueNoise(mm * 0.8 + 17.0);
  float pore = smoothstep(0.86, 1.0, hash(floor(mm * 5.0) + 3.0));
  float shade = (fine - 0.5) * 0.05 + (mid - 0.5) * 0.04 - pore * 0.06;
  outColor = vec4(u_tone * (1.0 + shade), 1.0);
}
