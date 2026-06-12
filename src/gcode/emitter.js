// Convert optimized polylines into a G-code string.
//
// Per polyline:
//   - rapid (G0) to its start point with pen at safe Z
//   - lower pen (G1 Z = penDownZ)
//   - optional dwell so ink can start flowing
//   - linear feed (G1) through remaining points at drawFeed
//   - raise pen back to penUpZ
// At end: park at origin, M30.
//
// Naive in M1 — no modal coalescing, full XY on every move, comment per stroke.
// Optimization (linemerge / linesort / linesimplify) happens BEFORE the emitter;
// the emitter just translates geometry to G-code one polyline at a time.

import { formatCoord as fmt } from '../util/format.js';
import { buildHeader } from './header.js';
import { buildFooter } from './footer.js';
import { DEFAULTS } from './ddcs.js';

export function emit(polylines, params = {}, meta = {}) {
  const p = { ...DEFAULTS, ...params };
  const lines = [buildHeader(p, meta), ''];

  for (let i = 0; i < polylines.length; i++) {
    const pl = polylines[i];
    if (pl.length < 2) continue;

    lines.push(`(stroke ${i + 1}/${polylines.length}, ${pl.length} pts)`);
    // Rapid to start with pen up
    lines.push(`G0 X${fmt(pl[0].x)} Y${fmt(pl[0].y)} F${p.rapidFeed}`);
    // Lower pen
    lines.push(`G1 Z${fmt(p.penDownZ)} F${p.penDropFeed}`);
    if (p.dwellAfterDown > 0) {
      lines.push(`G4 P${fmt(p.dwellAfterDown)}`);
    }
    // Draw
    for (let j = 1; j < pl.length; j++) {
      lines.push(`G1 X${fmt(pl[j].x)} Y${fmt(pl[j].y)} F${p.drawFeed}`);
    }
    // Raise pen
    lines.push(`G0 Z${fmt(p.penUpZ)} F${p.penLiftFeed}`);
    lines.push('');
  }

  lines.push(buildFooter(p));
  return lines.join('\n');
}
