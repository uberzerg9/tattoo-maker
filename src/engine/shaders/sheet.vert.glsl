#version 300 es
precision highp float;

// #include viewTransform

in vec2 a_corner; // 0..1

uniform vec2 u_lo; // quad bounds, sheet px
uniform vec2 u_hi;

out vec2 v_local;

void main() {
  vec2 local = mix(u_lo, u_hi, a_corner);
  v_local = local;
  gl_Position = sheetToClip(local);
}
