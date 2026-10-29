#version 300 es
precision highp float;

in vec2 v_offset;
in float v_amount;
flat in float v_level;

// Ink is kept as cumulative densities: channel m is the density of ink at least as dark as
// level m. See inkModel.ts for why, and for the CPU reference of this arithmetic.
layout(location = 0) out vec4 outLevels; // levels 0..3: black, grey 60, grey 30, grey 10
layout(location = 1) out vec4 outTotal;   // r: level 4, i.e. all ink including white

void main() {
  float d = length(v_offset);
  // Gaussian falloff: half strength at one radius, so a dot is about one needle wide.
  float falloff = exp(-0.693 * d * d) * (1.0 - smoothstep(1.5, 2.0, d));
  float a = v_amount * falloff;

  // A dot of level j goes into every channel m >= j and leaves the darker channels alone.
  // With blendFunc(ONE, ONE_MINUS_SRC_COLOR) each channel becomes c + a * (1 - c): it
  // saturates towards 1 and can never exceed it.
  vec4 mask = step(vec4(v_level) - 0.25, vec4(0.0, 1.0, 2.0, 3.0));
  outLevels = a * mask;
  outTotal = vec4(a, 0.0, 0.0, 0.0);
}
