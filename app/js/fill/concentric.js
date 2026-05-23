// Nested copies of the shape, shrinking inward by `spacing` each step.
// v1: rect + ellipse only. Arbitrary polygons need a proper inward-offset
// algorithm (would pull in clipper.js) — skipped for now.

import { ELLIPSE_SEGMENTS, makePolylineShape } from "./utils.js";

const MAX_ITERATIONS = 500;

export function generate(shape, { spacing = 2 } = {}) {
    spacing = Math.max(0.1, spacing);

    if (shape.type === "rect") {
        const out = [];
        for (let i = 1; i <= MAX_ITERATIONS; i++) {
            const inset = i * spacing;
            const nw = shape.w - inset * 2;
            const nh = shape.h - inset * 2;
            if (nw <= 0 || nh <= 0) break;
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
        for (let i = 1; i <= MAX_ITERATIONS; i++) {
            const rx = shape.rx - i * spacing;
            const ry = shape.ry - i * spacing;
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

    // Polygon offset not implemented in v1.
    return [];
}
