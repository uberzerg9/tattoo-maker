#version 300 es
precision highp float;

// One instance per needle dot. Draws a small quad around the dot, in the ink buffer's
// own space: texel (u, v) is sheet position (u * width, v * height), row 0 at the top.

in vec2 a_corner; // 0..1
in vec4 a_dot;    // x, y (sheet mm), radius (mm), amount (ink density at the centre)
in float a_level; // 0 black, 1 grey 60, 2 grey 30, 3 grey 10, 4 white

uniform vec2 u_sheetMm;

out vec2 v_offset; // in dot radii
out float v_amount;
flat out float v_level;

// The soft falloff reaches zero at twice the radius.
const float EXTENT = 2.0;

void main() {
  v_offset = (a_corner * 2.0 - 1.0) * EXTENT;
  v_amount = a_dot.w;
  v_level = a_level;
  vec2 mm = a_dot.xy + v_offset * a_dot.z;
  gl_Position = vec4(mm / u_sheetMm * 2.0 - 1.0, 0.0, 1.0);
}
