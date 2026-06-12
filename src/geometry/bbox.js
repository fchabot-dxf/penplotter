// Axis-aligned bounding box: {minX, minY, maxX, maxY}.

export function fromPoints(points) {
  if (!points.length) return null;
  let minX = points[0].x, maxX = points[0].x;
  let minY = points[0].y, maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    else if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    else if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function fromPolylines(polylines) {
  let bb = null;
  for (const pl of polylines) {
    const next = fromPoints(pl);
    if (!next) continue;
    if (!bb) { bb = next; continue; }
    if (next.minX < bb.minX) bb.minX = next.minX;
    if (next.maxX > bb.maxX) bb.maxX = next.maxX;
    if (next.minY < bb.minY) bb.minY = next.minY;
    if (next.maxY > bb.maxY) bb.maxY = next.maxY;
  }
  return bb;
}

export function width(bb)  { return bb ? bb.maxX - bb.minX : 0; }
export function height(bb) { return bb ? bb.maxY - bb.minY : 0; }

export function expand(bb, padding) {
  if (!bb) return null;
  return {
    minX: bb.minX - padding,
    minY: bb.minY - padding,
    maxX: bb.maxX + padding,
    maxY: bb.maxY + padding,
  };
}
