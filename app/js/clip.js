// Shared geometry helpers built on the vendored Clipper library
// (Angus Johnson's polygon clipping/offsetting, Vatti algorithm).
//
// Clipper works in integer coordinates, so everything is scaled by
// CLIP_SCALE on the way in and divided back out on the way out. These
// helpers are deliberately generic — concentric fill uses offsetRings()
// today, but outline insets, clipping a hatch to its shape, and boolean
// combines can all reuse ClipperLib + toClipper/fromClipper.

import ClipperLib from "./vendor/clipper.js";

export { ClipperLib };

// 1000 → sub-micron precision for mm-scale artwork; well within the
// 2^53 integer-coordinate budget for any plausible plot size.
export const CLIP_SCALE = 1000;

/** [[x,y],…] → Clipper path [{X,Y},…], dropping a duplicate closing point. */
export function toClipper(points) {
    const path = points.map(p => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) }));
    if (path.length > 1) {
        const a = path[0], b = path[path.length - 1];
        if (a.X === b.X && a.Y === b.Y) path.pop();
    }
    return path;
}

/** Clipper path → [[x,y],…] in source units, explicitly closed. */
export function fromClipper(path) {
    const pts = path.map(pt => [pt.X / CLIP_SCALE, pt.Y / CLIP_SCALE]);
    if (pts.length) pts.push([pts[0][0], pts[0][1]]);
    return pts;
}

/** Nested inward offsets of a closed polygon. Ring i is inset by
 *  `offset + i*spacing`. Returns an array of closed point-rings — more
 *  than one per step when the shape pinches and splits. Robust on concave
 *  shapes (mitred corners, no self-intersection) where a naive per-vertex
 *  offset tangles.
 *
 *  @param polygon  [[x,y],…] closed or open ring
 *  @param spacing  gap between rings (source units, e.g. mm)
 *  @param offset   extra inset before the first ring
 *  @param maxRings safety cap on iterations */
export function offsetRings(polygon, spacing, offset = 0, maxRings = 500) {
    const path = toClipper(polygon);
    if (path.length < 3) return [];

    // Normalise to positive orientation so a negative delta always shrinks
    // inward regardless of the source path's winding.
    if (!ClipperLib.Clipper.Orientation(path)) path.reverse();

    const co = new ClipperLib.ClipperOffset(2 /* miterLimit */, 0.25 * CLIP_SCALE);
    co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);

    const rings = [];
    for (let i = 1; i <= maxRings; i++) {
        const delta = -(offset + i * spacing) * CLIP_SCALE;
        const sol = new ClipperLib.Paths();
        co.Execute(sol, delta);
        if (!sol.length) break;
        for (const ring of sol) {
            if (ring.length >= 3) rings.push(fromClipper(ring));
        }
    }
    return rings;
}
