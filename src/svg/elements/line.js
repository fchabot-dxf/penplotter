// <line x1 y1 x2 y2>. Always open.

export function flattenLine(el) {
  const x1 = parseFloat(el.getAttribute('x1')) || 0;
  const y1 = parseFloat(el.getAttribute('y1')) || 0;
  const x2 = parseFloat(el.getAttribute('x2')) || 0;
  const y2 = parseFloat(el.getAttribute('y2')) || 0;
  return [{
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    closed: false,
  }];
}
