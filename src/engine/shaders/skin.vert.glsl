#version 300 es
precision highp float;

in vec2 a_corner;
out vec2 v_uv;

void main() {
  v_uv = a_corner;
  gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0);
}
