// Pen-up (travel) move overlays — drawn dashed/light so plot order and
// wasted travel are visible at a glance. The dashed lines connect the end
// of polyline N to the start of polyline N+1, which is exactly when the
// pen lifts and flies in the emitted G-code.

export function drawTravelMoves(ctx, polylines, opts = {}) {
  if (polylines.length < 2) return;
  const {
    strokeStyle = 'rgba(10, 132, 255, 0.5)',
    lineWidth = 0.5,
    dash = [4, 4],
  } = opts;

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 1; i < polylines.length; i++) {
    const prev = polylines[i - 1];
    const cur = polylines[i];
    if (!prev.length || !cur.length) continue;
    const a = prev[prev.length - 1];
    const b = cur[0];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}
