#version 300 es
precision highp float;

// Debug dots: one instance per hit, drawn as a small disc at its centre.

// #include viewTransform

in vec2 a_corner; // 0..1
in vec2 a_hit;    // sheet mm, per instance
in float a_dev;   // distance to the stencil in mm, -1 where there was none

uniform float u_pxPerMm;
uniform float u_radiusPx; // disc radius, sheet px
uniform float u_quadScale; // quad half-size in radii, leaves room for anti-aliasing

out vec2 v_offset; // -u_quadScale .. u_quadScale, in radii
flat out float v_dev;

void main() {
  v_offset = (a_corner * 2.0 - 1.0) * u_quadScale;
  v_dev = a_dev;
  gl_Position = sheetToClip(a_hit * u_pxPerMm + v_offset * u_radiusPx);
}
