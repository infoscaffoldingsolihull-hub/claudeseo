/**
 * Small DOM and SVG builders.
 *
 * Everything on screen is built from these rather than from innerHTML with
 * interpolated strings: the bill of quantities carries names and notes that
 * come from data, and building nodes instead of parsing markup means a stray
 * angle bracket in a material description can never become an element.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Element lookup by id.
 *
 * Shared rather than redeclared per module: the single-file build flattens
 * every module into one scope, so two modules each declaring their own `$`
 * would silently shadow one another. The build refuses to proceed if they do.
 */
export const byId = (id) => document.getElementById(id);

/**
 * el('div', { class: 'x', onclick: fn }, [child, 'text'])
 *
 * Attributes: `class`, `text`, `html` (only for literals this module owns),
 * `style` as an object, `on*` for listeners, anything else set as an
 * attribute. `null` and `undefined` children are skipped.
 */
export function el(tag, props = null, children = null) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendAll(node, children);
  return node;
}

/** The SVG-namespaced equivalent. */
export function svgEl(tag, props = null, children = null) {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props, true);
  appendAll(node, children);
  return node;
}

function applyProps(node, props, isSvg) {
  if (!props) return;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const prop of Object.keys(value)) node.style.setProperty(prop, value[prop]);
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const prop of Object.keys(value)) node.dataset[prop] = value[prop];
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      if (isSvg) node.setAttribute('class', value);
      else node.className = value;
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
}

function appendAll(node, children) {
  if (children === null || children === undefined) return;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'object' && child.nodeType
      ? child
      : document.createTextNode(String(child)));
  }
}

/** Empty a node. */
export function clear(node) {
  if (!node) return node;
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Replace a node's contents in one go. */
export function fill(node, children) {
  clear(node);
  appendAll(node, children);
  return node;
}

/** A labelled statistic for the top bar. */
export function stat(label, value, tone) {
  return el('span', { class: `stat${tone ? ` ${tone}` : ''}` }, [
    `${label} `, el('b', { text: value }),
  ]);
}

/** A definition row for the inspect card. */
export function row(term, value) {
  return [el('dt', { text: term }), el('dd', { text: value })];
}

/** A progress bar. */
export function bar(fraction, tone) {
  return el('div', { class: `bar${tone ? ` ${tone}` : ''}` }, [
    el('i', { style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` } }),
  ]);
}

/** A coloured square, for control-account keys. */
export function swatch(colour) {
  return el('span', { class: 'swatch', style: { background: colour } });
}

/** Format a percentage the way the panels want it. */
export function pct(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Format an index like SPI or CPI, with a tone for the caller to use. */
export function indexTone(value, goodAbove = 0.98, badBelow = 0.94) {
  if (value >= goodAbove) return 'good';
  if (value < badBelow) return 'bad';
  return 'warn';
}
