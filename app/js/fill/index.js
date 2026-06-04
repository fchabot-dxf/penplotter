// Fill-pattern registry + the public expandLayerWithFill API.
// Add a new pattern by creating a sibling module exporting `generate(shape, opts)`
// and registering it in PATTERNS below — UI dropdown picks it up automatically.

import * as hatch from "./hatch.js";
import * as crosshatch from "./crosshatch.js";
import * as zigzag from "./zigzag.js";
import * as concentric from "./concentric.js";
import * as stipple from "./stipple.js";
import * as dots from "./dots.js";
import { closedPolygonFor, makePolylineShape } from "./utils.js";
import { insetPolygon } from "../clip.js";

/** Registered fill patterns, keyed by id. */
export const PATTERNS = {
    hatch,
    crosshatch,
    zigzag,
    concentric,
    stipple,
    dots,
};

/** Pattern ids in display order. "none" is added at the head by the UI. */
export const FILL_PATTERNS = ["none", ...Object.keys(PATTERNS)];

/** UI metadata: which options apply to each pattern (so the panel can
 *  hide irrelevant inputs). */
export const PATTERN_OPTIONS = {
    none:       [],
    hatch:      ["angle", "spacing", "offset"],
    crosshatch: ["angle", "spacing", "offset"],
    zigzag:     ["angle", "spacing", "offset"],
    concentric: ["spacing", "offset"],
    stipple:    ["spacing", "offset"],
    dots:       ["spacing", "offset"],
};

/** Return the export-time shape list for `layer`: the user's drawn shapes
 *  plus generated fill geometry. */
export function expandLayerWithFill(layer) {
    const out = [...layer.shapes];
    const fill = layer.fill;
    if (!fill || fill.pattern === "none") return out;

    const pattern = PATTERNS[fill.pattern];
    if (!pattern) return out;

    const off = +fill.offset || 0;
    const opts = {
        angle: +fill.angle || 0,
        spacing: Math.max(0.1, +fill.spacing || 2),
        offset: off,
    };
    for (const shape of layer.shapes) {
        // `offset` is universal: concentric applies it to its ring schedule;
        // every other pattern insets/bleeds the fill REGION first (positive =
        // inset from the edge, negative = bleed outward to cover corners) and
        // then fills the offset polygon.
        if (off !== 0 && fill.pattern !== "concentric") {
            const poly = closedPolygonFor(shape);
            if (poly) {
                for (const ring of insetPolygon(poly, off)) {
                    const region = makePolylineShape(ring);
                    for (const extra of pattern.generate(region, { ...opts, offset: 0 })) out.push(extra);
                }
                continue;
            }
        }
        for (const extra of pattern.generate(shape, opts)) {
            out.push(extra);
        }
    }
    return out;
}
