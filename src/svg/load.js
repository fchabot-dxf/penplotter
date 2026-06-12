// Parse an SVG file or text string into a live DOM element. The returned
// <svg> element is detached; flatten.js attaches it to a hidden host before
// measuring path geometry.

export function parseSvgText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('Invalid SVG: ' + err.textContent.slice(0, 200));
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element is not <svg>');
  }
  return svg;
}

export async function loadSvgFile(file) {
  const text = await file.text();
  return parseSvgText(text);
}

export function getSvgViewBox(svg) {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const [minX, minY, width, height] = vb.split(/[\s,]+/).map(Number);
    return { minX, minY, width, height };
  }
  // Fall back to width/height if no viewBox.
  const w = parseFloat(svg.getAttribute('width')) || 100;
  const h = parseFloat(svg.getAttribute('height')) || 100;
  return { minX: 0, minY: 0, width: w, height: h };
}
