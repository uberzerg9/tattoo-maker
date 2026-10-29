#version 300 es
precision highp float;

in vec2 v_offset;

out vec4 outColor;

void main() {
  float a = 1.0 - smoothstep(0.8, 1.0, length(v_offset));
  outColor = vec4(vec3(0.0, 0.9, 1.0) * a, a);
}
