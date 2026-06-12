// <polyline> = open sequence of points.
// <polygon> = same data, implicitly closed.

export function flattenPolyline(el) {
  const pts = parsePoints(el.getAttribute('points') || '');
  return pts.length >= 2 ? [{ points: pts, closed: false }] : [];
}

export function flattenPolygon(el) {
  const pts = parsePoints(el.getAttribute('points') || '');
  if (pts.length < 2) return [];
  pts.push({ x: pts[0].x, y: pts[0].y }); // close the loop
  return [{ points: pts, closed: true }];
}

function parsePoints(s) {
  const nums = s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}
