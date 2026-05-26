// Full G-code file for a single toolpath: header + per-polyline blocks
// + footer. Coordinates flip Y so SVG (Y-down) maps to machine (Y-up).

import { header } from "./header.js";
import { pathBlock } from "./path.js";
import { footer } from "./footer.js";

export function renderGcode(polylines, opts) {
    const settings = { flipY: true, docH: opts.docH || 200, ...opts };
    const parts = [header(settings)];
    if (opts.label) parts.push(`(--- ${opts.label} ---)\n`);
    for (const poly of polylines) parts.push(pathBlock(poly, settings));
    parts.push(footer(settings));
    return parts.join("");
}
