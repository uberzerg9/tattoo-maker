const params = new URLSearchParams(window.location.search);

/** `?debug=1` turns on the engine debug overlay and helpers. */
export const DEBUG = params.get("debug") === "1";

/** Debug-only tuning overrides, for example `?debug=1&dotScale=1.5`. */
export const DEBUG_TUNING = DEBUG
  ? { dotScale: Number(params.get("dotScale")) || undefined }
  : undefined;
