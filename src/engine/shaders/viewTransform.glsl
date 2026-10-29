// Shared by every pass that draws in sheet space (CSS px at 100% zoom, origin top-left).
// Applies zoom, rotation (clockwise, like CSS) and pan. Keep in sync with sheetMmToScreen() in view.ts.
uniform vec2 u_viewport; // stage size, CSS px
uniform vec2 u_center;   // sheet centre, sheet px
uniform vec2 u_pan;      // CSS px
uniform vec2 u_rot;      // cos, sin
uniform float u_zoom;

vec4 sheetToClip(vec2 local) {
  vec2 d = (local - u_center) * u_zoom;
  vec2 s = u_viewport * 0.5 + u_pan + vec2(u_rot.x * d.x - u_rot.y * d.y, u_rot.y * d.x + u_rot.x * d.y);
  return vec4(s.x / u_viewport.x * 2.0 - 1.0, 1.0 - s.y / u_viewport.y * 2.0, 0.0, 1.0);
}
