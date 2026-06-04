// Nested copies of the shape, shrinking inward by `spacing` each step.
//
// rect + ellipse get exact inward offsets (they're convex, so a closed-form
// inset is clean). Polygon shapes (polyline, path) can be concave — an "L",
// a star — where a naive per-vertex offset self-intersects and tangles. For
// those we delegate to Clipper's polygon offsetting (see ../clip.js), which
// produces clean mitred rings, handles concavity, and splits into separate
// rings when an arm pinches off.

import { ELLIPSE_SEGMENTS, makePolylineShape, closedPolygonFor } from "./utils.js";
import { offsetRings } from "../clip.js";

const MAX_ITERATIONS = 500;

// `offset` sets where the first ring sits relative to the shape edge:
// ring i is inset by offset + i·spacing, starting at i = 0. So offset 0
// draws the first ring ON the outline; a negative offset starts the rings
// outside it (overdraw/bleed); a positive offset insets them.
export function generate(shape, { spacing = 2, offset = 0 } = {}) {
    spacing = Math.max(0.1, spacing);

    if (shape.type === "rect") {
        const out = [];
        for (let i = 0; i <= MAX_ITERATIONS; i++) {
            const inset = offset + i * spacing;
            const nw = shape.w - inset * 2;
            const nh = shape.h - inset * 2;
            if (nw <= 0 || nh <= 0) { if (inset > 0) break; else continue; }
            const x = shape.x + inset, y = shape.y + inset;
            out.push(makePolylineShape([
                [x, y], [x + nw, y],
                [x + nw, y + nh], [x, y + nh],
                [x, y],
            ]));
        }
        return out;
    }

    if (shape.type === "ellipse") {
        const out = [];
        for (let i = 0; i <= MAX_ITERATIONS; i++) {
            const rx = shape.rx - (offset + i * spacing);
            const ry = shape.ry - (offset + i * spacing);
            if (rx <= spacing * 0.5 || ry <= spacing * 0.5) break;
            const pts = [];
            for (let k = 0; k <= ELLIPSE_SEGMENTS; k++) {
                const t = (k / ELLIPSE_SEGMENTS) * Math.PI * 2;
                pts.push([shape.cx + Math.cos(t) * rx, shape.cy + Math.sin(t) * ry]);
            }
            out.push(makePolylineShape(pts));
        }
        return out;
    }

    if (shape.type === "polyline" || shape.type === "path") {
        const polygon = closedPolygonFor(shape);
        if (!polygon || polygon.length < 4) return [];
        return offsetRings(polygon, spacing, offset, MAX_ITERATIONS)
            .map(makePolylineShape);
    }

    return [];
}
