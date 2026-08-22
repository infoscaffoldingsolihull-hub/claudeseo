/**
 * Minimal DOM and SVG builders.
 *
 * The dashboard is a real application UI — trees, tables, Gantt charts,
 * network diagrams — but it ships inside a single HTML file with no framework,
 * so these two functions are the whole rendering library.
 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Compact number formatting for a dashboard that shows millions of deben. */
export function fmtNum(v, digits = 0) {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(digits);
}

export function fmtDays(v) {
  if (!Number.isFinite(v)) return '—';
  const n = Math.round(v);
  if (Math.abs(n) >= 730) return `${(n / 365).toFixed(1)} yr`;
  return `${n} d`;
}

export function fmtPct(v, digits = 0) {
  return `${(v * 100).toFixed(digits)}%`;
}

/** Classify an index around 1.0 for colour coding. */
export function indexClass(v, warn = 0.95, bad = 0.9) {
  if (v >= warn) return 'good';
  if (v >= bad) return 'warn';
  return 'bad';
}
