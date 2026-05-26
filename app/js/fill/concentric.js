// Nested copies of the shape, shrinking inward by `spacing` each step.
//
// rect + ellipse get exact inward offsets. Polygon shapes (polyline,
// path) flatten to a closed polygon and shrink via a per-vertex
// inward-offset along each vertex's angle bisector.

import { ELLIPSE_SEGMENTS, makePolylineShape, closedPolygonFor, polygonBounds } from "./utils.js";

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

    if (shape.type === "polyline" || shape.type === "path") {
        const polygon = closedPolygonFor(shape);
        if (!polygon || polygon.length < 4) return [];
        // For sampled paths the per-sample vertex offset is noisy at
        // the corners. Decimating to the actual corner vertices first
        // gives clean inward miters.
        const simplified = simplifyByAngle(polygon, 8 /* degrees */);
        if (simplified.length < 4) return [];

        const b = polygonBounds(simplified);
        const maxInset = Math.min(b.maxX - b.minX, b.maxY - b.minY) / 2;
        const out = [];
        let current = simplified;
        for (let i = 1; i <= MAX_ITERATIONS; i++) {
            if (i * spacing >= maxInset) break;
            const next = offsetPolygonInward(current, spacing);
            if (!next || next.length < 4) break;
            const a = Math.abs(signedArea(next));
            if (a < 0.5) break;
            out.push(makePolylineShape(next));
            current = next;
        }
        return out;
    }

    return [];
}

/** Drop sample points that don't change the polygon's direction by more
 *  than `angleDeg` — leaves only the meaningful corner vertices, so
 *  the offset doesn't accumulate roundoff from hundreds of near-collinear
 *  samples. */
function simplifyByAngle(poly, angleDeg) {
    const n = poly.length - 1;
    if (n < 3) return poly;
    const cosThresh = Math.cos(angleDeg * Math.PI / 180);
    const keep = [];
    for (let i = 0; i < n; i++) {
        const prev = poly[(i - 1 + n) % n];
        const curr = poly[i];
        const next = poly[(i + 1) % n];
        const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1];
        const e2x = next[0] - curr[0], e2y = next[1] - curr[1];
        const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
        if (l1 < 1e-6 || l2 < 1e-6) continue;
        const dot = (e1x * e2x + e1y * e2y) / (l1 * l2);
        // dot < cosThresh means direction changed by MORE than angleDeg.
        if (dot < cosThresh) keep.push(curr);
    }
    if (keep.length < 3) return poly;
    keep.push([keep[0][0], keep[0][1]]); // close
    return keep;
}

/** Offset a closed polygon inward by `dist` along each vertex's angle
 *  bisector. Last vertex must equal first.
 *
 *  Winding: in screen coords (y-down) the shoelace formula returns
 *  positive area for a visually-CW polygon walked in source order.
 *  Inward normal of edge (ex,ey) for a CW polygon is (-ey, ex)/|e|.
 *  CCW polygon flips the sign. */
function offsetPolygonInward(poly, dist) {
    const area = signedArea(poly);
    if (area === 0) return null;
    const sign = area > 0 ? 1 : -1;

    const n = poly.length - 1;
    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = poly[(i - 1 + n) % n];
        const curr = poly[i];
        const next = poly[(i + 1) % n];

        const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1];
        const e2x = next[0] - curr[0], e2y = next[1] - curr[1];
        const l1 = Math.hypot(e1x, e1y) || 1;
        const l2 = Math.hypot(e2x, e2y) || 1;
        const n1x = -e1y / l1 * sign, n1y = e1x / l1 * sign;
        const n2x = -e2y / l2 * sign, n2y = e2x / l2 * sign;

        let bx = n1x + n2x, by = n1y + n2y;
        const bl = Math.hypot(bx, by);
        if (bl < 1e-6) {
            bx = n1x; by = n1y;
        } else {
            bx /= bl; by /= bl;
        }
        const dot = Math.abs(n1x * bx + n1y * by);
        const miter = dist / Math.max(0.2, dot);
        // Bevel sharp corners (miter cap = 3x dist) instead of letting
        // them shoot off into a spike that crosses the opposite side
        // of the polygon.
        const clamped = Math.min(miter, dist * 3);
        out.push([curr[0] + bx * clamped, curr[1] + by * clamped]);
    }
    out.push([out[0][0], out[0][1]]);
    return out;
}

function signedArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length - 1; i++) {
        a += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1];
    }
    return a / 2;
}
