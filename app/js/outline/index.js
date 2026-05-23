// Outline-style registry + public expandLayerOutline API.
// New style? Drop a sibling module exporting apply(shape, opts) and
// register it in STYLES — the UI picks it up automatically.

import * as normal from "./normal.js";
import * as dashed from "./dashed.js";
import * as jagged from "./jagged.js";

export const STYLES = { normal, dashed, jagged };
export const OUTLINE_STYLES = Object.keys(STYLES);

/** Per-style option metadata for the UI. */
export const STYLE_OPTIONS = {
    normal: [],
    dashed: ["dash_length", "dash_gap"],
    jagged: ["amplitude", "frequency"],
};

/** Apply the active layer's outline style + multi-pass to its drawn shapes.
 *  Returns the replacement shape list (does NOT mutate the layer). */
export function expandLayerOutline(shapes, outline) {
    if (!outline) return shapes;
    const style = STYLES[outline.style || "normal"];
    if (!style) return shapes;

    const passes = Math.max(1, Math.min(10, +outline.passes || 1));
    const out = [];
    for (let pass = 0; pass < passes; pass++) {
        for (const shape of shapes) {
            for (const s of style.apply(shape, outline)) out.push(s);
        }
    }
    return out;
}
