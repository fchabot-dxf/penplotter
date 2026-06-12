// linesimplify — Douglas-Peucker on each polyline to drop redundant points
// without visibly changing the curve.
//
// M2 TODO: implement. Algorithm is the classic recursive D-P:
//   - Find the point farthest from the line segment between the polyline's
//     first and last point
//   - If that distance < tolerance, keep just the endpoints
//   - Otherwise split at that point and recurse on the two halves
//
// For M1 this is a pass-through.

export function linesimplify(polylines, _tolerance = 0.05) {
  return polylines;
}
