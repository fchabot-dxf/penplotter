// G-code header: program setup at the top of the file.
//
// Deliberately NOT emitted:
//   G28 — homing isn't configured on the Ultimate Bee
//   G10 — broken on DDCS
//
// Operator is expected to have set XY zero at the paper origin and Z zero
// at the paper surface before running this file.

export function buildHeader(params, meta = {}) {
  const lines = [];
  if (meta.title) lines.push(`(${meta.title})`);
  lines.push(`(Generated ${new Date().toISOString()})`);
  lines.push(`(Pen-up Z: ${params.penUpZ}  Pen-down Z: ${params.penDownZ})`);
  lines.push(`(Draw feed: ${params.drawFeed}  Rapid: ${params.rapidFeed})`);
  lines.push('');
  lines.push('G21          ; millimeters');
  lines.push('G90          ; absolute positioning');
  lines.push('G94          ; feed in units/minute');
  lines.push(`G0 Z${params.penUpZ} F${params.penLiftFeed}     ; pen up to safe height`);
  return lines.join('\n');
}
