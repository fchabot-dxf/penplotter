// Emit G-code for a single polyline:
//   G0 X Y       — rapid to start (pen still up)
//   G1 Z<down> F — plunge pen
//   G1 X Y F     — draw line(s)
//   ...
//   G1 Z<up>   F — lift pen
//
// Coordinates use 3 decimal mm. X & Y always emitted (DDCS M350 doesn't
// trust modal axis suppression — matches the Fusion post's forceXYZ).

export function pathBlock(points, { penUpZ, penDownZ, drawFeed, zFeed, flipY, docH }) {
    if (!points || points.length < 2) return "";
    const y = flipY ? (v) => (docH - v) : (v) => v;
    const lines = [];
    const [x0, y0] = points[0];
    lines.push(`G0 X${x0.toFixed(3)} Y${y(y0).toFixed(3)} (rapid to stroke start)`);
    lines.push(`G1 Z${penDownZ.toFixed(3)} F${zFeed} (pen down)`);
    for (let i = 1; i < points.length; i++) {
        const [x, yi] = points[i];
        lines.push(`G1 X${x.toFixed(3)} Y${y(yi).toFixed(3)} F${drawFeed}`);
    }
    lines.push(`G1 Z${penUpZ.toFixed(3)} F${zFeed} (pen up)`);
    return lines.join("\n") + "\n";
}
