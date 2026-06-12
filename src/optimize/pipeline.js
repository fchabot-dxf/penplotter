// Compose the three optimization passes with per-pass configuration.

import { linemerge } from './linemerge.js';
import { linesort } from './linesort.js';
import { linesimplify } from './linesimplify.js';

export function optimize(polylines, opts = {}) {
  const {
    merge = true,
    mergeTol = 0.1,
    sort = true,
    sortStart = { x: 0, y: 0 },
    simplify = true,
    simplifyTol = 0.05,
  } = opts;

  let out = polylines;
  if (merge)    out = linemerge(out, mergeTol);
  if (sort)     out = linesort(out, { start: sortStart });
  if (simplify) out = linesimplify(out, simplifyTol);
  return out;
}
