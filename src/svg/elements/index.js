// Dispatcher: given an SVG element, return its polylines.
//
// One handler per element type — adding a new one is purely additive
// (no edits to other files). HANDLERS is the registry; isFlattenable
// is what flatten.js checks before recursing.

import { flattenPath } from './path.js';
import { flattenPolyline, flattenPolygon } from './polyline.js';
import { flattenLine } from './line.js';
import { flattenRect } from './rect.js';
import { flattenCircle, flattenEllipse } from './circle.js';

const HANDLERS = {
  path: flattenPath,
  polyline: flattenPolyline,
  polygon: flattenPolygon,
  line: flattenLine,
  rect: flattenRect,
  circle: flattenCircle,
  ellipse: flattenEllipse,
};

export function flattenElement(el) {
  const handler = HANDLERS[el.tagName.toLowerCase()];
  if (!handler) return [];
  try {
    return handler(el);
  } catch (err) {
    console.warn(`Failed to flatten <${el.tagName}>:`, err);
    return [];
  }
}

export function isFlattenable(tagName) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, tagName.toLowerCase());
}
