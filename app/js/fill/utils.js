// Shared helpers used by every fill pattern.

export const ELLIPSE_SEGMENTS = 96;

let _fillCounter = 0;
export function fillId() { return "fill_" + (++_fillCounter); }

export function makeLineShape(a, b) {
    return { id: fillId(), type: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
}

export function makePolylineShape(points) {
    return { id: fillId(), type: "polyline", points };
}

/** Convert a closed shape to a polygon (last point == first). Returns null
 *  for open / unsupported shapes. */
export function closedPolygonFor(s) {
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
        case "path":
            return samplePath(s.d);
    }
    return null;
}

// Off-screen SVG <path> used to flatten arbitrary path data into a polygon
// via getPointAtLength. Handles M/L/C/Q/A and the Z close command.
let _pathProbe = null;
function samplePath(d) {
    if (!_pathProbe) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.position = "absolute"; svg.style.width = svg.style.height = "0";
        svg.style.visibility = "hidden";
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        svg.appendChild(p);
        document.body.appendChild(svg);
        _pathProbe = p;
    }
    _pathProbe.setAttribute("d", d);
    let total;
    try { total = _pathProbe.getTotalLength(); } catch { return null; }
    if (!total) return null;
    // ~0.4mm sampling — fine enough that hatch lines clip cleanly on most
    // typical artwork without producing huge polygons.
    const step = 0.4;
    const n = Math.max(4, Math.ceil(total / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
        const pt = _pathProbe.getPointAtLength((i / n) * total);
        out.push([pt.x, pt.y]);
    }
    // Force closed (first == last) so the scanline hatch's edge-crossing
    // count works correctly on the final segment.
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.001) out.push([a[0], a[1]]);
    return out;
}

export function polygonBounds(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

export function pointInPolygon(point, poly) {
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

/** Scanline intersection: returns sorted list of x values where horizontal
 *  line y = const intersects polygon edges. */
export function edgeCrossings(rotatedPoly, y) {
    const xs = [];
    for (let i = 0; i < rotatedPoly.length - 1; i++) {
        const [ax, ay] = rotatedPoly[i];
        const [bx, by] = rotatedPoly[i + 1];
        if ((ay > y) === (by > y)) continue;
        const t = (y - ay) / (by - ay);
        xs.push(ax + t * (bx - ax));
    }
    return xs;
}

/** Rotate a polygon by -angle so a hatch direction becomes horizontal.
 *  Returns the rotated polygon plus the inverse rotation function. */
export function rotateForHatch(polygon, angleDeg) {
    const angle = angleDeg * Math.PI / 180;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const cosB = Math.cos(angle), sinB = Math.sin(angle);
    const rotated = polygon.map(p => [
        p[0] * cos - p[1] * sin,
        p[0] * sin + p[1] * cos,
    ]);
    const unrot = (p) => [
        p[0] * cosB - p[1] * sinB,
        p[0] * sinB + p[1] * cosB,
    ];
    return { rotated, unrot };
}
