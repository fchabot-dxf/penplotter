// Flatten an SVG <path> into one or more polylines.
//
// We delegate curve sampling to the browser's getPointAtLength rather than
// parse the "d" attribute manually. Pros: handles every curve type the browser
// handles (cubic, quadratic, arc) for free; matches what would actually plot.
// Cons: the path element must be attached to a live document to be measurable
// — flatten.js handles that with a hidden host container.
//
// We split on M (moveto) commands so a path with multiple subpaths becomes
// multiple polylines (separate strokes the pen should lift between).
//
// Closure is determined per-subpath: explicit `Z`/`z` in the substring, OR
// the sampled endpoints already coincide. When Z is present but the sampled
// endpoints don't quite match, we append an explicit closing point so hatching
// sees a proper closed polygon.

export function flattenPath(pathEl, tolerance = 0.25) {
  const d = pathEl.getAttribute('d') || '';
  const subpaths = splitSubpaths(d);
  if (subpaths.length === 0) return [];

  const polylines = [];
  const parent = pathEl.parentNode;
  if (!parent) return [];

  for (const sub of subpaths) {
    const probe = pathEl.cloneNode(false);
    probe.setAttribute('d', sub);
    parent.appendChild(probe);
    try {
      const pts = samplePath(probe, tolerance);
      if (pts.length >= 2) {
        const hasZ = /[Zz]/.test(sub);
        const coincide = endpointsMatch(pts);
        const closed = hasZ || coincide;
        if (closed && !coincide) {
          pts.push({ x: pts[0].x, y: pts[0].y });
        }
        polylines.push({ points: pts, closed });
      }
    } finally {
      parent.removeChild(probe);
    }
  }
  return polylines;
}

function endpointsMatch(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  return Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
}

function splitSubpaths(d) {
  return d.match(/[Mm][^Mm]*/g) || [];
}

function samplePath(pathEl, tolerance) {
  let total;
  try { total = pathEl.getTotalLength(); }
  catch { return []; }
  if (!Number.isFinite(total) || total === 0) return [];

  const steps = Math.max(2, Math.ceil(total / tolerance));
  const pts = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const p = pathEl.getPointAtLength((i / steps) * total);
    pts[i] = { x: p.x, y: p.y };
  }
  return pts;
}
