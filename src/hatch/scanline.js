// Scanline hatching for a single closed polygon.
//
// Input:  polygon = closed polyline (last point == first), {angle, spacing, inset}
// Output: array of 2-point polylines (each = one hatch stroke clipped to polygon)
//
// Algorithm:
//   1. Rotate polygon so hatch direction becomes horizontal (-angle).
//   2. For each horizontal scanline y = yMin + spacing/2, +spacing, ...:
//      - find intersections with polygon edges
//      - sort by x
//      - pair (0,1), (2,3), ... — these pairs are "inside" segments
//        (works for simple polygons; the pairing also handles holes when the
//        polygon has nested loops, but we don't generate those here)
//      - shorten each pair by `inset` on both ends so the marker tip stays
//        visually inside the outline
//   3. Rotate the resulting segments back to world space.
//
// The "open at the lower y end, closed at the upper" intersection test handles
// the vertex-on-scanline edge case without double-counting.

export function scanlineHatch(polygon, params) {
  const { angle = 45, spacing = 1, inset = 0 } = params;
  if (polygon.length < 3 || spacing <= 0) return [];

  // World → hatch-space rotation (so hatch lines are horizontal in hatch space).
  const r = -angle * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const rotated = new Array(polygon.length);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;
    rotated[i] = { x: rx, y: ry };
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  if (maxY <= minY) return [];

  const segments = [];
  const yStart = minY + spacing * 0.5;

  for (let y = yStart; y <= maxY; y += spacing) {
    const xs = scanlineIntersections(rotated, y);
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);

    for (let i = 0; i + 1 < xs.length; i += 2) {
      let x0 = xs[i], x1 = xs[i + 1];
      const segLen = x1 - x0;
      if (inset > 0) {
        if (segLen <= 2 * inset) continue; // skip slivers we can't inset
        x0 += inset;
        x1 -= inset;
      }
      segments.push({ x0, x1, y });
    }
  }

  // Hatch-space → world rotation (inverse).
  const cI = Math.cos(-r), sI = Math.sin(-r);
  return segments.map(s => [
    { x: s.x0 * cI - s.y * sI, y: s.x0 * sI + s.y * cI },
    { x: s.x1 * cI - s.y * sI, y: s.x1 * sI + s.y * cI },
  ]);
}

function scanlineIntersections(polygon, y) {
  const xs = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p0 = polygon[i];
    const p1 = polygon[(i + 1) % n];
    if (p0.y === p1.y) continue;          // horizontal edge: doesn't cross
    const yMin = Math.min(p0.y, p1.y);
    const yMax = Math.max(p0.y, p1.y);
    // Half-open interval (yMin, yMax] avoids double-counting at vertices.
    if (y <= yMin || y > yMax) continue;
    const t = (y - p0.y) / (p1.y - p0.y);
    xs.push(p0.x + t * (p1.x - p0.x));
  }
  return xs;
}
