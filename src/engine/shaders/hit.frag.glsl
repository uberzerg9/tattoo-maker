#version 300 es
precision highp float;

in vec2 v_offset;
flat in float v_dev;

uniform float u_byDeviation;   // 1: colour by distance to the stencil
uniform float u_deviationRange; // mm that count as "far": the off-stencil limit

out vec4 outColor;

void main() {
  float a = 1.0 - smoothstep(0.8, 1.0, length(v_offset));
  vec3 color = vec3(0.0, 0.9, 1.0);
  if (u_byDeviation > 0.5) {
    if (v_dev < 0.0) {
      color = vec3(0.55, 0.55, 0.6); // no stencil
    } else {
      // green on the line, yellow halfway, red at the off-stencil limit and beyond
      float t = clamp(v_dev / u_deviationRange, 0.0, 1.0);
      color = mix(mix(vec3(0.1, 0.9, 0.3), vec3(1.0, 0.9, 0.1), smoothstep(0.0, 0.5, t)), vec3(0.95, 0.15, 0.1), smoothstep(0.5, 1.0, t));
    }
  }
  outColor = vec4(color * a, a);
}
