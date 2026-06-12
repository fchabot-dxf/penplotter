// Map model-space coordinates onto a canvas, fit-to-content with margin.
// No pan/zoom in v0 — the editor will add that. The plotter just shows
// the whole drawing scaled to fit.

import { fromPolylines, width as bw, height as bh } from '../geometry/bbox.js';

export function fitToCanvas(canvas, polylines, margin = 20) {
  const bb = fromPolylines(polylines);
  if (!bb) return null;
  const sx = (canvas.width - margin * 2) / Math.max(bw(bb), 1e-6);
  const sy = (canvas.height - margin * 2) / Math.max(bh(bb), 1e-6);
  const s = Math.min(sx, sy);
  const tx = margin - bb.minX * s;
  const ty = margin - bb.minY * s;
  return { s, tx, ty, bb };
}

export function applyTransform(ctx, vt) {
  ctx.setTransform(vt.s, 0, 0, vt.s, vt.tx, vt.ty);
}
