// Fill-pattern generation for closed shapes. Adds the fill geometry as
// additional shapes on the layer at export/preview time — does NOT mutate
// the user's drawn shapes.
//
// Patterns:
//   none        — no fill, just the outline
//   hatch       — parallel lines at angle, spacing apart
//   crosshatch  — two hatches, perpendicular
//   zigzag      — joined hatch into one polyline (convex shapes; fewer pen lifts)
//   concentric  — nested copies shrinking inward (rect & ellipse only in v1)
//   stipple     — dots, density = 1/spacing²
//
// Supported shapes: rect, ellipse, closed polyline.
// Open polylines, lines, arbitrary paths → passed through with no fill.

const ELLIPSE_SEGMENTS = 96;

export const FILL_PATTERNS = ["none", "hatch", "crosshatch", "zigzag", "concentric", "stipple"];

export function expandLayerWithFill(layer) {
    const out = [...layer.shapes];
    const fill = layer.fill;
    if (!fill || fill.pattern === "none") return out;
    const spacing = Math.max(0.1, +fill.spacing || 2);
    const angle = +fill.angle || 0;

    for (const shape of layer.shapes) {
        const extras = fillShape(shape, fill.pattern, angle, spacing);
        for (const s of extras) out.push(s);
    }
    return out;
}

function fillShape(shape, pattern, angle, spacing) {
    switch (pattern) {
        case "hatch":      return hatchShape(shape, angle, spacing);
        case "crosshatch": return hatchShape(shape, angle, spacing).concat(hatchShape(shape, angle + 90, spacing));
        case "zigzag":     return zigzagShape(shape, angle, spacing);
        case "concentric": return concentricShape(shape, spacing);
        case "stipple":    return stippleShape(shape, spacing);
    }
    return [];
}

// ---------- shape → polygon helper ----------

function closedPolygonFor(s) {
    switch (s.type) {
        case "rect":
            return [
                [s.x, s.y], [s.x + s.w, s.y],
                [s.x + s.w, s.y + s.h], [s.x, s.y + s.h],
                [s.x, s.y],
            ];
        case "ellipse": {
            const pts = [];
            for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
                const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
                pts.push([s.cx + Math.cos(t) * s.rx, s.cy + Math.sin(t) * s.ry]);
            }
            return pts;
        }
        case "polyline": {
            const pts = s.points;
            if (pts.length < 3) return null;
            const a = pts[0], b = pts[pts.length - 1];
            const closed = Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.001;
            return closed ? pts.map(p => [p[0], p[1]]) : null;
        }
    }
    return null;
}

// ---------- hatch ----------

function hatchShape(shape, angleDeg, spacing) {
    const poly = closedPolygonFor(shape);
    if (!poly) return [];
    const segs = scanlineHatch(poly, angleDeg, spacing);
    return segs.map(([a, b]) => makeLineShape(a, b));
}

function scanlineHatch(polygon, angleDeg, spacing) {
    const angle = angleDeg * Math.PI / 180;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const rot = polygon.map(p => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos]);

    let minY = Infinity, maxY = -Infinity;
    for (const p of rot) {
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    }

    const cosB = Math.cos(angle), sinB = Math.sin(angle);
    const unrot = (p) => [p[0] * cosB - p[1] * sinB, p[0] * sinB + p[1] * cosB];

    const segments = [];
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
        const xs = edgeCrossings(rot, y);
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            segments.push([unrot([xs[i], y]), unrot([xs[i + 1], y])]);
        }
    }
    return segments;
}

function edgeCrossings(rot, y) {
    const xs = [];
    for (let i = 0; i < rot.length - 1; i++) {
        const [ax, ay] = rot[i];
        const [bx, by] = rot[i + 1];
        if ((ay > y) === (by > y)) continue;
        const t = (y - ay) / (by - ay);
        xs.push(ax + t * (bx - ax));
    }
    return xs;
}

// ---------- zigzag (connected hatch — convex shapes give one polyline) ----------

function zigzagShape(shape, angleDeg, spacing) {
    const poly = closedPolygonFor(shape);
    if (!poly) return [];
    const segs = scanlineHatch(poly, angleDeg, spacing);
    if (!segs.length) return [];
    // Group by scanline (segments at the same Y in rotated space land here
    // in scanlineHatch order). For convex polygons there's one segment per
    // scanline → easy zigzag. For concave we fall back to plain hatch.
    const oneSegPerScan = segs.every((s, i, arr) =>
        i === 0 || Math.abs(s[0][1] - arr[i - 1][0][1]) > 0.0001 // crude check
    );
    if (!oneSegPerScan) return segs.map(([a, b]) => makeLineShape(a, b));

    const pts = [];
    for (let i = 0; i < segs.length; i++) {
        const [a, b] = segs[i];
        // Alternate direction so consecutive segments connect end-to-end.
        if (i % 2 === 0) { pts.push(a, b); } else { pts.push(b, a); }
    }
    return [{ id: fillId(), type: "polyline", points: pts }];
}

// ---------- concentric ----------

function concentricShape(shape, spacing) {
    const out = [];
    if (shape.type === "rect") {
        let { x, y, w, h } = shape;
        let i = 0;
        while (w > spacing && h > spacing) {
            const inset = (i + 1) * spacing;
            const nw = shape.w - inset * 2;
            const nh = shape.h - inset * 2;
            if (nw <= 0 || nh <= 0) break;
            out.push({
                id: fillId(), type: "polyline",
                points: [
                    [shape.x + inset, shape.y + inset],
                    [shape.x + inset + nw, shape.y + inset],
                    [shape.x + inset + nw, shape.y + inset + nh],
                    [shape.x + inset, shape.y + inset + nh],
                    [shape.x + inset, shape.y + inset],
                ],
            });
            i++;
            if (i > 500) break; // safety
        }
    } else if (shape.type === "ellipse") {
        let i = 1;
        while (true) {
            const rx = shape.rx - i * spacing;
            const ry = shape.ry - i * spacing;
            if (rx <= spacing * 0.5 || ry <= spacing * 0.5) break;
            const pts = [];
            for (let k = 0; k <= ELLIPSE_SEGMENTS; k++) {
                const t = (k / ELLIPSE_SEGMENTS) * Math.PI * 2;
                pts.push([shape.cx + Math.cos(t) * rx, shape.cy + Math.sin(t) * ry]);
            }
            out.push({ id: fillId(), type: "polyline", points: pts });
            i++;
            if (i > 500) break;
        }
    }
    // Polygon concentric (true inward offset) skipped in v1.
    return out;
}

// ---------- stipple (dots) ----------

function stippleShape(shape, spacing) {
    const poly = closedPolygonFor(shape);
    if (!poly) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }
    const out = [];
    // Offset every other row by spacing/2 for tighter packing.
    let rowIdx = 0;
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
        const xOff = (rowIdx++ % 2) * spacing * 0.5;
        for (let x = minX + spacing * 0.5 + xOff; x < maxX; x += spacing) {
            if (!pointInPolygon([x, y], poly)) continue;
            // Each dot = a 0.1mm line segment (DDCS/vpype both treat it as a stroke).
            out.push(makeLineShape([x, y], [x + 0.1, y]));
        }
    }
    return out;
}

function pointInPolygon(point, poly) {
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length - 1; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        const intersect = ((yi > py) !== (yj > py))
            && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ---------- helpers ----------

let _fillCounter = 0;
function fillId() { return "fill_" + (++_fillCounter); }

function makeLineShape(a, b) {
    return { id: fillId(), type: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
}
