// 2D point helpers. Points are plain {x, y} objects throughout the codebase —
// no class wrapper, since polylines are arrays of thousands of points and
// allocating a class instance for each one is wasteful.

export function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceSq(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function equal(a, b, tol = 1e-6) {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function clone(p) {
  return { x: p.x, y: p.y };
}
