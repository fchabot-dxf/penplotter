// Flatten an arbitrary SVG <path d="..."> into a polyline by sampling
// the rendered path geometry via an off-screen SVG element. This handles
// every command browsers natively support (M/L/C/Q/S/T/A/Z, absolute and
// relative). Output sample density: ~0.4 mm steps — fine enough that
// downstream linesimplify can pull it back without visible quality loss.

const SVG_NS = "http://www.w3.org/2000/svg";
const SAMPLE_STEP = 0.4;

let _probe = null;
function probe() {
    if (_probe) return _probe;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.style.position = "absolute";
    svg.style.width = svg.style.height = "0";
    svg.style.visibility = "hidden";
    const p = document.createElementNS(SVG_NS, "path");
    svg.appendChild(p);
    document.body.appendChild(svg);
    _probe = p;
    return _probe;
}

export function fromPath(s) {
    const p = probe();
    p.setAttribute("d", s.d);
    let total;
    try { total = p.getTotalLength(); } catch { return null; }
    if (!total) return null;
    const n = Math.max(2, Math.ceil(total / SAMPLE_STEP));
    const out = [];
    for (let i = 0; i <= n; i++) {
        const pt = p.getPointAtLength((i / n) * total);
        out.push([pt.x, pt.y]);
    }
    return out;
}
