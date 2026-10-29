#version 300 es
precision highp float;

// Skin sheet with rounded corners, border and hard shadow, as in the mockup, plus the ink and
// trauma buffers composited onto the skin. Output is premultiplied alpha.

in vec2 v_local;

uniform sampler2D u_skin;
uniform sampler2D u_ink;      // density of ink at least as dark as: black, grey 60, grey 30, grey 10
uniform sampler2D u_inkTotal; // r: density of all ink, white included
uniform sampler2D u_trauma;   // r: trauma, additive, can exceed 1
uniform vec3 u_inkColor[4];   // how much light each dark ink lets through
uniform vec3 u_whiteInk;
uniform sampler2D u_stencil;  // r: stencil line strength

uniform vec2 u_sheetSize;     // sheet px
uniform vec2 u_bufferSize;    // buffer texels
uniform float u_zoom;
uniform float u_radius;       // corner radius, sheet px
uniform float u_border;
uniform vec2 u_shadowOffset;
uniform float u_shadowAlpha;
uniform vec3 u_borderColor;

uniform float u_healed;           // 0 = fresh, 1 = healed
uniform float u_freshRedness;     // render.freshRedness
uniform float u_redScale;         // 1 / trauma.overworkThreshold: overworked skin is fully red
uniform float u_healedInkFactor;  // render.healedInkFactor
uniform float u_healedBlurTexels; // render.healedBlurMm in texels
uniform float u_overwork;         // trauma.overworkThreshold, for the heatmap
uniform float u_showTrauma;       // debug: raw trauma as a heatmap

uniform float u_stencilOn;        // 1 when a visible stencil is loaded
uniform float u_stencilOpacity;   // 0..1
uniform vec3 u_stencilColor;
uniform vec2 u_sheetMm;
uniform vec2 u_stCenter;          // stencil centre on the sheet, mm
uniform vec2 u_stRot;             // cos, sin of the stencil rotation (clockwise)
uniform float u_stScale;
uniform vec2 u_stSizeMm;          // stencil size at scale 1

out vec4 outColor;

// [tune] How the looks respond. The JSON has the strengths; these shape them.
const vec3 RED_MUL = vec3(1.0, 0.38, 0.34);   // inflamed skin lets less green and blue through
const float TRAUMA_BLUR_LOD = 2.5;            // redness spreads about half a millimetre
const float RED_RESPONSE = 0.6;               // below 1: a single clean pass already shows a little
const float SWELL_MIN_TEXELS = 0.3;           // fresh ink is crisp ...
const float SWELL_MAX_TEXELS = 0.9;           // ... and swells a little where the skin is worked; settled ink is softer still
const float HEALED_DESAT = 0.15;
const float HEALED_LIFT = 0.06;
const float STENCIL_TRAUMA_WIPE = 0.6;        // ENGINE.md §7: the stencil wipes off where worked
const float STENCIL_INK_COVER = 0.9;          // ... and ink laid over it hides it

float roundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Mip level that matches how much the buffer is minified on screen.
float screenLod(vec2 uv) {
  vec2 t = uv * u_bufferSize;
  float d = max(dot(dFdx(t), dFdx(t)), dot(dFdy(t), dFdy(t)));
  return max(0.5 * log2(max(d, 1.0)), 0.0);
}

// Sampling a higher mip level is a cheap blur: about a box of 2 * radius texels.
float blurLod(float radiusTexels) {
  return log2(max(2.0 * radiusTexels, 1.0));
}

// Debug colours: x = trauma / overwork threshold, so yellow marks the threshold.
vec3 heat(float x) {
  vec3 c = vec3(0.05, 0.04, 0.12);
  c = mix(c, vec3(0.10, 0.25, 0.95), smoothstep(0.0, 0.25, x));
  c = mix(c, vec3(0.10, 0.85, 0.35), smoothstep(0.25, 0.5, x));
  c = mix(c, vec3(1.00, 0.90, 0.10), smoothstep(0.5, 1.0, x));
  c = mix(c, vec3(0.90, 0.10, 0.10), smoothstep(1.0, 2.0, x));
  return c;
}

void main() {
  vec2 halfSize = u_sheetSize * 0.5;
  vec2 p = v_local - halfSize;
  float aa = 0.75 / u_zoom; // about one screen pixel

  float dBody = roundRect(p, halfSize, u_radius);
  float dShadow = roundRect(p - u_shadowOffset, halfSize, u_radius);

  float body = 1.0 - smoothstep(-aa, aa, dBody);
  float shadow = u_shadowAlpha * (1.0 - smoothstep(-aa, aa, dShadow));
  float skinMask = 1.0 - smoothstep(-aa, aa, dBody + u_border);

  vec2 uv = v_local / u_sheetSize;
  vec3 skin = texture(u_skin, uv).rgb;
  float lodScreen = screenLod(uv);
  bool healed = u_healed > 0.5;

  // The blurred trauma decides how red fresh skin is, how much fresh ink swells and how much of
  // the stencil has been wiped off. Healed looks ignore it, but the stencil stays wiped.
  float trauma = textureLod(u_trauma, uv, max(lodScreen, TRAUMA_BLUR_LOD)).r;
  float redness = 0.0;
  float inkLod;
  float inkScale = 1.0;
  if (healed) {
    inkLod = max(lodScreen, blurLod(u_healedBlurTexels));
    inkScale = u_healedInkFactor;
  } else {
    float worked = smoothstep(0.0, 1.0, pow(clamp(trauma * u_redScale, 0.0, 1.0), RED_RESPONSE));
    redness = u_freshRedness * worked;
    inkLod = max(lodScreen, blurLod(mix(SWELL_MIN_TEXELS, SWELL_MAX_TEXELS, worked)));
  }

  // Ink sits in the skin: multiply-style, so the skin shows through where the ink is thin.
  // The buffer holds cumulative densities; their differences are the density at each level.
  vec4 c = clamp(textureLod(u_ink, uv, inkLod), 0.0, 1.0);
  float total = clamp(textureLod(u_inkTotal, uv, inkLod).r, 0.0, 1.0);
  float e0 = c.x;
  float e1 = max(c.y - c.x, 0.0);
  float e2 = max(c.z - c.y, 0.0);
  float e3 = max(c.w - c.z, 0.0);
  float eWhite = max(total - c.w, 0.0);

  vec3 darkness = e0 * (1.0 - u_inkColor[0]) + e1 * (1.0 - u_inkColor[1])
                + e2 * (1.0 - u_inkColor[2]) + e3 * (1.0 - u_inkColor[3]);
  vec3 base = skin * (1.0 - darkness * inkScale);
  base = mix(base, u_whiteInk, eWhite * inkScale);

  if (healed) {
    // Settled ink is a little greyer, and its darkest tones lift.
    float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
    base = mix(base, vec3(luma), HEALED_DESAT);
    base = mix(base, skin, HEALED_LIFT);
  } else {
    // Multiplied, not mixed towards a red, so black ink stays black in red skin.
    base = mix(base, base * RED_MUL, redness);
  }

  // The stencil: its raster is looked up through the placement (move, rotate, scale).
  vec2 d = (uv * u_sheetMm - u_stCenter) / u_stScale;
  vec2 q = vec2(u_stRot.x * d.x + u_stRot.y * d.y, -u_stRot.y * d.x + u_stRot.x * d.y);
  vec2 stUv = q / u_stSizeMm + 0.5;
  float onStencil = step(0.0, stUv.x) * step(stUv.x, 1.0) * step(0.0, stUv.y) * step(stUv.y, 1.0);
  float line = texture(u_stencil, stUv).r * onStencil;
  float wipe = (1.0 - STENCIL_TRAUMA_WIPE * clamp(trauma, 0.0, 1.0)) * (1.0 - STENCIL_INK_COVER * total);
  base = mix(base, u_stencilColor, line * u_stencilOpacity * u_stencilOn * wipe);

  if (u_showTrauma > 0.5) {
    base = heat(textureLod(u_trauma, uv, lodScreen).r / max(u_overwork, 1e-4));
  }

  vec3 color = mix(u_borderColor, base, skinMask);

  float alpha = body + shadow * (1.0 - body);
  outColor = vec4(color * body, alpha);
}
