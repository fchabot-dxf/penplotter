// <rect x y width height>. Always closed (5-point polyline, last == first).
// Rounded corners (rx/ry) not handled in v0 — add when an SVG in the wild
// actually uses them.

export function flattenRect(el) {
  const x = parseFloat(el.getAttribute('x')) || 0;
  const y = parseFloat(el.getAttribute('y')) || 0;
  const w = parseFloat(el.getAttribute('width')) || 0;
  const h = parseFloat(el.getAttribute('height')) || 0;
  if (w === 0 || h === 0) return [];
  return [{
    points: [
      { x: x,     y: y     },
      { x: x + w, y: y     },
      { x: x + w, y: y + h },
      { x: x,     y: y + h },
      { x: x,     y: y     },
    ],
    closed: true,
  }];
}
