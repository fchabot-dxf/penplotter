// Number formatting for G-code. Trim trailing zeros so the output stays
// compact and human-readable. Default 3 decimals = 1 micron precision,
// which is well below any reasonable CNC's mechanical resolution.

export function formatCoord(n, decimals = 3) {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(decimals);
  // Strip trailing zeros after the decimal point, then a trailing dot.
  return s.replace(/\.?0+$/, '');
}
