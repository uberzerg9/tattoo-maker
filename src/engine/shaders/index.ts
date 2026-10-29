import hitFragRaw from "./hit.frag.glsl?raw";
import hitVertRaw from "./hit.vert.glsl?raw";
import markerFragRaw from "./marker.frag.glsl?raw";
import sheetFragRaw from "./sheet.frag.glsl?raw";
import sheetVertRaw from "./sheet.vert.glsl?raw";
import stampFragRaw from "./stamp.frag.glsl?raw";
import stampVertRaw from "./stamp.vert.glsl?raw";
import skinFragRaw from "./skin.frag.glsl?raw";
import skinVertRaw from "./skin.vert.glsl?raw";
import traumaFragRaw from "./trauma.frag.glsl?raw";
import viewTransform from "./viewTransform.glsl?raw";

/** Splices shared GLSL into a shader at its `// #include viewTransform` line. */
const withViewTransform = (src: string) =>
  src.replace("// #include viewTransform", viewTransform);

export const sheetVert = withViewTransform(sheetVertRaw);
export const sheetFrag = sheetFragRaw;
export const markerFrag = markerFragRaw;
export const hitVert = withViewTransform(hitVertRaw);
export const hitFrag = hitFragRaw;
export const stampVert = stampVertRaw;
export const stampFrag = stampFragRaw;
export const traumaFrag = traumaFragRaw;
export const skinVert = skinVertRaw;
export const skinFrag = skinFragRaw;
