// Polyline = array of {x,y} points. No class wrapper for the same reason
// as point.js. A "sketch" is an array of polylines, optionally with
// per-polyline metadata stored on a parallel array.

import { distance } from './point.js';

export function length(polyline) {
  let total = 0;
  for (let i = 1; i < polyline.length; i++) {
    total += distance(polyline[i - 1], polyline[i]);
  }
  return total;
}

export function reverse(polyline) {
  return polyline.slice().reverse();
}

export function start(polyline) {
  return polyline[0];
}

export function end(polyline) {
  return polyline[polyline.length - 1];
}

export function totalLength(polylines) {
  let total = 0;
  for (const pl of polylines) total += length(pl);
  return total;
}

export function pointCount(polylines) {
  let total = 0;
  for (const pl of polylines) total += pl.length;
  return total;
}
