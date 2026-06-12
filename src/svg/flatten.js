// Walk an SVG DOM and flatten every drawable element into polylines + metadata.
//
// Returns:
//   {
//     polylines: [[{x,y}, ...], ...],         // points in SVG root coords
//     metadata:  [{closed, fill, stroke}, ...], // parallel array, same indices
//     viewBox:   {minX, minY, width, height}
//   }
//
// The two parallel arrays keep the geometry pipeline (optimize/canvas) free of
// style concerns — they only see point arrays. The hatch pipeline reads
// metadata to decide which closed polygons to fill.
//
// SVG style inheritance is implemented by walking up the parent chain when
// looking up fill/stroke. CSS-style attribute via style="fill:red" is also
// supported.

import { flattenElement, isFlattenable } from './elements/index.js';
import { getSvgViewBox } from './load.js';
import { applyToPoint, fromSVGMatrix } from '../geometry/transform.js';

const SKIP_TAGS = new Set([
  'defs', 'metadata', 'title', 'desc', 'style', 'clipPath', 'mask', 'symbol',
]);

let hiddenHost = null;
function ensureHost() {
  if (hiddenHost) return hiddenHost;
  hiddenHost = document.createElement('div');
  hiddenHost.setAttribute('aria-hidden', 'true');
  hiddenHost.style.cssText =
    'position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(hiddenHost);
  return hiddenHost;
}

export function flattenSvg(svgEl) {
  const host = ensureHost();
  const live = svgEl.cloneNode(true);
  host.appendChild(live);

  const polylines = [];
  const metadata = [];
  try {
    walk(live, polylines, metadata);
  } finally {
    host.removeChild(live);
  }
  return {
    polylines,
    metadata,
    viewBox: getSvgViewBox(svgEl),
  };
}

function walk(node, polylines, metadata) {
  if (node.nodeType !== 1) return;
  const tag = node.tagName?.toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return;

  if (isFlattenable(tag)) {
    const ctm = getCTMToSvg(node);
    const fill = inheritStyle(node, 'fill');
    const stroke = inheritStyle(node, 'stroke');

    for (const pl of flattenElement(node)) {
      if (pl.points.length < 2) continue;
      const pts = ctm ? pl.points.map(p => applyToPoint(ctm, p)) : pl.points;
      polylines.push(pts);
      metadata.push({ closed: pl.closed, fill, stroke });
    }
  }

  for (const child of node.children) walk(child, polylines, metadata);
}

function getCTMToSvg(el) {
  try { return fromSVGMatrix(el.getCTM()); }
  catch { return null; }
}

// SVG style inheritance: walk up the parent chain, checking both direct
// attributes and inline style="...". Returns null if neither is set anywhere
// in the chain — the caller decides what default to apply.
function inheritStyle(el, name) {
  let node = el;
  while (node && node.nodeType === 1) {
    const direct = node.getAttribute?.(name);
    if (direct != null && direct !== '') return direct;
    const style = node.getAttribute?.('style') || '';
    const m = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'));
    if (m) return m[1].trim();
    node = node.parentNode;
  }
  return null;
}
