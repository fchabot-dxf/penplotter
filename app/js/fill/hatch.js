// Parallel lines at a given angle, `spacing` mm apart.
// Returns an array of shape objects (lines).

import { closedPolygonFor, rotateForHatch, edgeCrossings, makeLineShape } from "./utils.js";

export function generate(shape, { angle = 45, spacing = 2 } = {}) {
    const poly = closedPolygonFor(shape);
    if (!poly) return [];
    const segs = scanlineHatch(poly, angle, spacing);
    return segs.map(([a, b]) => makeLineShape(a, b));
}

/** Compute parallel-line segments inside the polygon. Exported so zigzag
 *  can reuse the underlying scanline data. */
export function scanlineHatch(polygon, angleDeg, spacing) {
    const { rotated, unrot } = rotateForHatch(polygon, angleDeg);
    let minY = Infinity, maxY = -Infinity;
    for (const p of rotated) {
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    }
    const segments = [];
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
        const xs = edgeCrossings(rotated, y);
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            segments.push([unrot([xs[i], y]), unrot([xs[i + 1], y])]);
        }
    }
    return segments;
}
