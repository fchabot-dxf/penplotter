// Hatch pipeline: given the parsed SVG polylines + parallel metadata, find
// closed polygons that have an actual fill color and emit hatch lines for
// each one.
//
// Returns an array of new polylines (the hatch strokes), to be concatenated
// with the outline polylines before plotting.

import { scanlineHatch } from './scanline.js';

// "no fill" values per SVG spec + practical interpretations.
const NO_FILL = new Set(['none', 'transparent', '']);

export function hatchFills(polylines, metadata, params) {
  const {
    enabled = false,
    angle = 45,
    spacing = 1,
    inset = 0,
  } = params;

  if (!enabled) return [];

  const out = [];
  for (let i = 0; i < polylines.length; i++) {
    const meta = metadata[i];
    if (!meta || !meta.closed) continue;
    if (!hasRealFill(meta.fill)) continue;

    const segs = scanlineHatch(polylines[i], { angle, spacing, inset });
    for (const s of segs) out.push(s);
  }
  return out;
}

function hasRealFill(fill) {
  if (fill == null) return false;
  const v = String(fill).trim().toLowerCase();
  return v.length > 0 && !NO_FILL.has(v);
}
