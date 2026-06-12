// Draw polylines on a 2D canvas. Pure stateless rendering helpers.

export function drawPolylines(ctx, polylines, opts = {}) {
  const {
    strokeStyle = '#111',
    lineWidth = 1,
    showOrder = false,
  } = opts;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const pl of polylines) {
    if (pl.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pl[0].x, pl[0].y);
    for (let i = 1; i < pl.length; i++) ctx.lineTo(pl[i].x, pl[i].y);
    ctx.stroke();
  }

  if (showOrder) drawOrderLabels(ctx, polylines);
}

function drawOrderLabels(ctx, polylines) {
  ctx.save();
  ctx.fillStyle = '#c33';
  ctx.font = '10px sans-serif';
  ctx.setTransform(1, 0, 0, 1, 0, 0); // labels in pixel space
  for (let i = 0; i < polylines.length; i++) {
    const pt = polylines[i][0];
    if (pt) ctx.fillText(String(i + 1), pt.x + 1, pt.y - 1);
  }
  ctx.restore();
}
