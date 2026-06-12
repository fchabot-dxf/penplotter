// 2D affine transform stored as {a, b, c, d, e, f} — matches the SVG transform
// matrix convention:
//
//   [a c e]   [x]
//   [b d f] * [y]
//   [0 0 1]   [1]
//
// We parse SVG <g transform="..."> chains via the browser's getCTM() and
// convert into this shape so polylines come out in the SVG user-coordinate
// system regardless of how nested the source is.

export function identity() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function multiply(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function applyToPoint(m, p) {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

export function translate(tx, ty) {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx, sy = sx) {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotate(deg) {
  const r = deg * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

// Convert a browser SVGMatrix into our flat shape.
export function fromSVGMatrix(svgMatrix) {
  if (!svgMatrix) return null;
  return {
    a: svgMatrix.a, b: svgMatrix.b,
    c: svgMatrix.c, d: svgMatrix.d,
    e: svgMatrix.e, f: svgMatrix.f,
  };
}
