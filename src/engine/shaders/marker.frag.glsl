#version 300 es
precision highp float;

// Debug marker: a magenta ring and cross at a sheet position, drawn through the same
// vertex transform as the sheet. If it sits under the cursor, view.ts and the shader agree.

in vec2 v_local;

uniform vec2 u_marker; // sheet px
uniform float u_zoom;

out vec4 outColor;

void main() {
  vec2 d = (v_local - u_marker) * u_zoom; // screen px
  float ring = 1.0 - smoothstep(0.5, 1.5, abs(length(d) - 8.0));
  float cross = (1.0 - smoothstep(0.5, 1.5, min(abs(d.x), abs(d.y)))) * step(max(abs(d.x), abs(d.y)), 14.0);
  float a = max(ring, cross);
  outColor = vec4(a, 0.0, a, a);
}
