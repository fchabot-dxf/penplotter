// linesort — reorder polylines greedy nearest-neighbor so the pen doesn't
// fly back and forth across the page.
//
// M2 TODO: implement. Algorithm:
//   1. Start at `opts.start` (typically the origin)
//   2. Find the polyline whose start (or end, if reversal is allowed) is
//      closest to the current position
//   3. Move to it, optionally reverse, repeat
//
// Allow-reverse usually halves total travel for line art.
// For M1 this is a pass-through.

export function linesort(polylines, _opts = {}) {
  return polylines;
}
