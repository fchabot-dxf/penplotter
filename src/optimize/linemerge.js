// linemerge — join polylines whose endpoints touch (within tolerance) so
// the pen doesn't lift/drop between contiguous strokes.
//
// M2 TODO: implement. Algorithm:
//   1. Build a hash of endpoint positions (snap to a grid of `tolerance`)
//   2. For each polyline, check whether its start or end matches another
//      polyline's end or start in the hash
//   3. Greedily concatenate matches (reverse one polyline if needed)
//   4. Repeat until no more merges possible
//
// For M1 this is a pass-through.

export function linemerge(polylines, _tolerance = 0.1) {
  return polylines;
}
