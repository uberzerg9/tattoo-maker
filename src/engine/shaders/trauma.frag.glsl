#version 300 es
precision highp float;

// Trauma dot: the same soft falloff as an ink dot. With blendFunc(ONE, ONE) the dots simply
// add up, so a needle that keeps hitting one spot keeps raising the trauma there.

in vec2 v_offset;
in float v_amount;
flat in float v_level; // unused, shared vertex shader

layout(location = 0) out vec4 outTrauma;

void main() {
  float d = length(v_offset);
  float falloff = exp(-0.693 * d * d) * (1.0 - smoothstep(1.5, 2.0, d));
  outTrauma = vec4(v_amount * falloff, 0.0, 0.0, 0.0);
}
