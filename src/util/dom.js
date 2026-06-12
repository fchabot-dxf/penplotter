// Tiny DOM helpers. Shape matches bspline/editor/dom.js for consistency, so
// patterns translate cleanly when we build the editor.

export function el(id) {
  return document.getElementById(id);
}

export function query(selector, root = document) {
  return root.querySelector(selector);
}

export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function on(target, event, handler, options) {
  const node = typeof target === 'string' ? el(target) : target;
  if (!node) return null;
  node.addEventListener(event, handler, options);
  return node;
}

export function bindClick(id, handler) {
  return on(id, 'click', handler);
}

export function toggleClass(target, className, condition) {
  const node = typeof target === 'string' ? el(target) : target;
  if (!node) return;
  node.classList.toggle(className, condition);
}

export function createEl(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
