// Bottom status bar — polyline count, total length, status text.
// Optionally breaks out hatch vs outline counts when supplied.

import { el } from '../../util/dom.js';
import { totalLength, pointCount } from '../../geometry/polyline.js';

export function setupStatusBar({ rootId }) {
  const root = el(rootId);
  return {
    set(text) { if (root) root.textContent = text; },
    summarize(polylines, breakdown) {
      if (!polylines?.length) {
        this.set('No SVG loaded');
        return;
      }
      const n = polylines.length;
      const pts = pointCount(polylines);
      const len = totalLength(polylines).toFixed(1);
      let suffix = '';
      if (breakdown && (breakdown.hatch || breakdown.outlines)) {
        suffix = `  (${breakdown.outlines} outline · ${breakdown.hatch} hatch)`;
      }
      this.set(`${n} polylines · ${pts} pts · ${len} mm draw length${suffix}`);
    },
  };
}
