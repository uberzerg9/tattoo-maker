#version 300 es
precision highp float;

// Reduces the ink and trauma buffers (2048 x 1536) to 64 x 48 cells of 32 x 32 texels.
// Per cell: red = texels with ink above the inked density, green = of those, texels whose
// trauma is above the overwork threshold. Counts, so they stay exact in half floats.

uniform sampler2D u_inkTotal; // r: density of all ink
uniform sampler2D u_trauma;   // r: trauma
uniform float u_inked;        // density above which a texel counts as inked
uniform float u_overwork;     // trauma above which a texel is overworked

out vec4 outColor;

const int BLOCK = 32;

void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * BLOCK;
  float inked = 0.0;
  float over = 0.0;
  for (int y = 0; y < BLOCK; y++) {
    for (int x = 0; x < BLOCK; x++) {
      ivec2 p = base + ivec2(x, y);
      if (texelFetch(u_inkTotal, p, 0).r > u_inked) {
        inked += 1.0;
        if (texelFetch(u_trauma, p, 0).r > u_overwork) over += 1.0;
      }
    }
  }
  outColor = vec4(inked, over, 0.0, 1.0);
}
