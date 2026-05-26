// Public surface for the in-browser vpype port. Anything outside the
// vpype/ directory should import from here, not from individual files.

export { shapeToPolyline } from "./polylines/index.js";
export { linemerge, linesort, linesimplify, optimize } from "./optimize/index.js";
export { renderGcode } from "./gcode/render.js";
export { buildZip } from "./zip/index.js";
export {
    flattenToolpath,
    optimizePolylines,
    toolpathToPolylines,
    toolpathToGcode,
} from "./pipeline.js";
