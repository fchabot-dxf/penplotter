// Render polylines on a canvas with fit-to-content viewport.
// Y-down (SVG convention) is preserved so what you see matches the SVG;
// the controller handles physical Y orientation via its own settings.

import { drawPolylines } from '../../canvas/renderer.js';
import { drawTravelMoves } from '../../canvas/overlays.js';
import { fitToCanvas, applyTransform } from '../../canvas/viewport.js';

export function setupPreviewCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let lastPolylines = [];
  let lastOpts = {};

  function render(polylines, opts = {}) {
    lastPolylines = polylines || [];
    lastOpts = opts;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (lastPolylines.length === 0) return;

    const vt = fitToCanvas(canvas, lastPolylines, 20);
    if (!vt) return;
    applyTransform(ctx, vt);

    if (opts.showTravel !== false) {
      drawTravelMoves(ctx, lastPolylines, { lineWidth: 0.5 / vt.s });
    }
    drawPolylines(ctx, lastPolylines, {
      lineWidth: 1 / vt.s,
      showOrder: !!opts.showOrder,
    });
  }

  function clear() {
    lastPolylines = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Re-render on resize so the drawing stays fit-to-content.
  const resizeObserver = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      canvas.width = r.width;
      canvas.height = r.height;
      render(lastPolylines, lastOpts);
    }
  });
  resizeObserver.observe(canvas);

  return { render, clear };
}
