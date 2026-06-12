// <circle cx cy r> and <ellipse cx cy rx ry>. Always closed.
//
// Fixed N = 64 segments — fine for anything up to a few cm diameter.
// Larger arcs should switch to an adaptive sample density tied to curvature.

const N = 64;

export function flattenCircle(el) {
  const cx = parseFloat(el.getAttribute('cx')) || 0;
  const cy = parseFloat(el.getAttribute('cy')) || 0;
  const r  = parseFloat(el.getAttribute('r'))  || 0;
  return sampleEllipse(cx, cy, r, r);
}

export function flattenEllipse(el) {
  const cx = parseFloat(el.getAttribute('cx')) || 0;
  const cy = parseFloat(el.getAttribute('cy')) || 0;
  const rx = parseFloat(el.getAttribute('rx')) || 0;
  const ry = parseFloat(el.getAttribute('ry')) || 0;
  return sampleEllipse(cx, cy, rx, ry);
}

function sampleEllipse(cx, cy, rx, ry) {
  if (rx <= 0 || ry <= 0) return [];
  const pts = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts[i] = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  }
  return [{ points: pts, closed: true }];
}
