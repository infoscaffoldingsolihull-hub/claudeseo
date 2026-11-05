import { el, svg } from './dom.js';

/**
 * Hand-written SVG charts for the PM panels (no charting library).
 *
 * Line / S-curve, bar & stacked bar (with a cumulative or overlay line),
 * histogram + cumulative curve, Gantt, activity-on-node network, 5×5
 * probability–impact heat map, tornado, Shewhart control chart, Pareto,
 * Ishikawa fishbone, decision tree, scatter with regression, waterfall and a
 * normal (PERT) bell curve.
 *
 * Colours come from CSS custom properties (`--c1…--c8`, `--pv`, `--ev`, `--ac`,
 * `--forecast`, `--critical`, `--good`, `--warn`, `--bad`), so `body.cb-safe`
 * swaps the whole chart palette to Okabe–Ito without re-rendering. Every mark
 * carries a <title> tooltip. Entry animations only run when `animate` is set and
 * are disabled globally by `body.reduced-motion`. Charts sit in a `.chart-scroll`
 * box that scrolls horizontally on phones instead of squashing the drawing.
 */

export const C = {
  pv: 'var(--pv)', ev: 'var(--ev)', ac: 'var(--ac)', fc: 'var(--forecast)', crit: 'var(--critical)',
  c1: 'var(--c1)', c2: 'var(--c2)', c3: 'var(--c3)', c4: 'var(--c4)', c5: 'var(--c5)', c6: 'var(--c6)', c7: 'var(--c7)', c8: 'var(--c8)',
  good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)',
  brass: 'var(--brass)', indigo: 'var(--indigo-hi)',
};
export const SERIES = [C.c1, C.c2, C.c4, C.c3, C.c5, C.c6, C.c7, C.c8];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

/* ------------------------------------------------------------- helpers */

const f1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const pts = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
const st = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}:${v}`).join(';');

function title(text) {
  return text ? svg('title', { text: String(text) }) : null;
}

/** Root <svg> with a viewBox, accessible label and the chart class. */
export function frame(width, height, label, cls = '') {
  return svg('svg', {
    class: `chart ${cls}`.trim(), viewBox: `0 0 ${width} ${height}`, width, height,
    role: 'img', 'aria-label': label || 'Chart', preserveAspectRatio: 'xMidYMid meet',
  }, [label ? svg('title', { text: label }) : null]);
}

/** Wrap a chart so it scrolls sideways on narrow screens (min-width keeps it legible). */
export function chartBox(node, { minWidth = 560, legend: leg = null, caption = null, cls = '' } = {}) {
  node.style.minWidth = `${minWidth}px`;
  return el('figure', { class: `chart-box ${cls}`.trim() }, [
    leg,
    el('div', { class: 'chart-scroll', tabindex: '0', 'aria-label': 'Chart (scrolls sideways on small screens)' }, [node]),
    caption ? el('figcaption', { class: 'chart-cap', text: caption }) : null,
  ]);
}

/** Legend row: [{ label, color, dash?, shape?: 'line'|'box'|'dot'|'diamond' }]. */
export function legend(items) {
  return el('div', { class: 'ch-legend', role: 'list' }, items.filter(Boolean).map((i) => {
    const shape = i.shape || (i.dash ? 'line' : 'box');
    const sw = svg('svg', { width: 22, height: 12, viewBox: '0 0 22 12', 'aria-hidden': 'true' }, [
      shape === 'line' ? svg('line', { x1: 1, y1: 6, x2: 21, y2: 6, style: st({ stroke: i.color, 'stroke-width': 2.4, 'stroke-dasharray': i.dash || '' }) })
        : shape === 'dot' ? svg('circle', { cx: 11, cy: 6, r: 4, style: st({ fill: i.color }) })
          : shape === 'diamond' ? svg('path', { d: 'M11 1l5 5-5 5-5-5z', style: st({ fill: i.color }) })
            : svg('rect', { x: 3, y: 2, width: 16, height: 8, rx: 2, style: st({ fill: i.color, opacity: i.opacity || 1 }) }),
    ]);
    return el('span', { role: 'listitem', title: i.title || null }, [sw, el('span', { text: i.label })]);
  }));
}

/** "Nice" axis: rounded min/max and a step of 1, 2, 2.5 or 5 × 10ⁿ. */
export function niceScale(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { max = min + (Math.abs(min) || 1); }
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { min: lo, max: hi, step, ticks };
}

/** Calendar ticks for project-day axes: [{ v: day, label }]. */
export function dayTicks(startDate, d0, d1, maxTicks = 8) {
  const start = startDate instanceof Date ? startDate.getTime() : Number(startDate);
  const span = Math.max(1, d1 - d0);
  const monthsPer = [1, 2, 3, 6, 12, 24].find((m) => span / (30.44 * m) <= maxTicks) || 24;
  const out = [];
  const first = new Date(start + d0 * DAY_MS);
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  m = Math.ceil(m / monthsPer) * monthsPer;
  for (let guard = 0; guard < 400; guard++) {
    while (m >= 12) { m -= 12; y += 1; }
    const day = Math.round((Date.UTC(y, m, 1) - start) / DAY_MS);
    if (day > d1) break;
    if (day >= d0) out.push({ v: day, label: monthsPer >= 12 ? String(y) : `${MONTHS[m]} ’${String(y).slice(2)}` });
    m += monthsPer;
  }
  return out;
}

export function shortDate(startDate, day) {
  const d = new Date((startDate instanceof Date ? startDate.getTime() : Number(startDate)) + Math.round(day) * DAY_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Compact money for axes: 12.4 bn · 350 m. */
export function money(v, digits = 1) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 0 : digits)} bn`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)} m`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)} k`;
  return `${s}${a.toFixed(0)}`;
}

function axisText(x, y, text, anchor = 'middle', cls = 'ch-tick') {
  return svg('text', { x: f1(x), y: f1(y), 'text-anchor': anchor, class: cls, text: String(text) });
}

function gridY(g, ticks, X0, X1, Y, fmt, right = false) {
  for (const v of ticks) {
    const y = Y(v);
    g.appendChild(svg('line', { x1: X0, x2: X1, y1: f1(y), y2: f1(y), class: v === 0 ? 'ch-zero' : 'ch-grid' }));
    g.appendChild(axisText(right ? X1 + 6 : X0 - 6, y + 3.5, fmt(v), right ? 'start' : 'end'));
  }
}

function gridX(g, ticks, Y0, Y1, X, fmt) {
  for (const t of ticks) {
    const x = X(t.v);
    g.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: Y0, y2: Y1, class: 'ch-grid ch-gridx' }));
    g.appendChild(axisText(x, Y1 + 15, t.label !== undefined ? t.label : fmt(t.v)));
  }
}

function drawCls(animate, dashed) {
  return animate ? (dashed ? 'anim-fade' : 'anim-draw') : '';
}

/* ------------------------------------------------------------ line chart */

/**
 * Multi-series line / area chart (S-curves, burndown, funding, MC S-curve).
 * opts: { width, height, label, series:[{ label, points:[[x,y]], color, width, dash, area, step, dots, opacity }],
 *   xDomain, yDomain, xTicks:[{v,label}], xFormat, yFormat, yLabel, xLabel,
 *   vlines:[{ x, label, color, dash }], hlines:[{ y, label, color, dash }], bands:[{ x0, x1, color, label }],
 *   marks:[{ x, y, label, color, r, shape }], animate, pad }
 */
export function lineChart(opts) {
  const W = opts.width || 880;
  const H = opts.height || 300;
  const pad = { l: 66, r: 24, t: 18, b: 34, ...(opts.pad || {}) };
  const root = frame(W, H, opts.label);
  const all = opts.series.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  for (const v of opts.vlines || []) xs.push(v.x);
  for (const h of opts.hlines || []) ys.push(h.y);
  for (const m of opts.marks || []) { xs.push(m.x); ys.push(m.y); }
  const xd = opts.xDomain || [Math.min(...xs), Math.max(...xs)];
  const ysc = niceScale(opts.yDomain ? opts.yDomain[0] : Math.min(0, ...ys), opts.yDomain ? opts.yDomain[1] : Math.max(...ys), opts.yTicks || 5);
  const yd = opts.yDomain && opts.yExact ? opts.yDomain : [ysc.min, ysc.max];
  const X = (v) => pad.l + ((v - xd[0]) / ((xd[1] - xd[0]) || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yd[0]) / ((yd[1] - yd[0]) || 1)) * (H - pad.t - pad.b);
  const g = svg('g', { class: 'ch-axes' });
  const yfmt = opts.yFormat || ((v) => money(v));
  gridY(g, opts.yExact ? niceScale(yd[0], yd[1], opts.yTicks || 5).ticks.filter((v) => v >= yd[0] - 1e-9 && v <= yd[1] + 1e-9) : ysc.ticks, pad.l, W - pad.r, Y, yfmt);
  const xt = opts.xTicks || niceScale(xd[0], xd[1], 6).ticks.filter((v) => v >= xd[0] && v <= xd[1]).map((v) => ({ v }));
  gridX(g, xt, pad.t, H - pad.b, X, opts.xFormat || ((v) => String(Math.round(v))));
  g.appendChild(svg('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: H - pad.b, class: 'ch-axis' }));
  g.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: 'ch-axis' }));
  if (opts.yLabel) g.appendChild(svg('text', { x: 14, y: pad.t + (H - pad.t - pad.b) / 2, class: 'ch-axlabel', transform: `rotate(-90 14 ${pad.t + (H - pad.t - pad.b) / 2})`, 'text-anchor': 'middle', text: opts.yLabel }));
  if (opts.xLabel) g.appendChild(svg('text', { x: pad.l + (W - pad.l - pad.r) / 2, y: H - 2, class: 'ch-axlabel', 'text-anchor': 'middle', text: opts.xLabel }));
  root.appendChild(g);
  for (const b of opts.bands || []) {
    root.appendChild(svg('rect', { x: f1(X(b.x0)), y: pad.t, width: f1(Math.max(0, X(b.x1) - X(b.x0))), height: H - pad.t - pad.b, style: st({ fill: b.color || C.warn, opacity: b.opacity || 0.08 }) }, [title(b.label)]));
  }
  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  root.appendChild(svg('defs', {}, [svg('clipPath', { id: clipId }, [svg('rect', { x: pad.l, y: pad.t - 4, width: W - pad.l - pad.r + 2, height: H - pad.t - pad.b + 8 })])]));
  const plot = svg('g', { 'clip-path': `url(#${clipId})` });
  opts.series.forEach((s, si) => {
    if (!s.points.length) return;
    let p = s.points.map(([x, y]) => [X(x), Y(y)]);
    if (s.step) {
      const q = [];
      p.forEach((pt, i) => { if (i) q.push([pt[0], p[i - 1][1]]); q.push(pt); });
      p = q;
    }
    const color = s.color || SERIES[si % SERIES.length];
    if (s.area) {
      const base = Y(Math.max(yd[0], Math.min(yd[1], s.areaBase || 0)));
      plot.appendChild(svg('path', {
        d: `M${f1(p[0][0])},${f1(base)} L${pts(p).replace(/ /g, ' L')} L${f1(p[p.length - 1][0])},${f1(base)} Z`,
        class: opts.animate ? 'anim-fade' : '', style: st({ fill: color, opacity: s.areaOpacity || 0.14 }),
      }, [title(s.label)]));
    }
    if (s.line !== false) {
      plot.appendChild(svg('polyline', {
        points: pts(p), fill: 'none', pathLength: s.dash ? null : 1, class: `ch-line ${drawCls(opts.animate, s.dash)}`.trim(),
        style: st({ stroke: color, 'stroke-width': s.width || 2.4, 'stroke-dasharray': s.dash || '', opacity: s.opacity || '', 'animation-delay': opts.animate ? `${si * 0.12}s` : '' }),
      }, [title(s.label)]));
    }
    if (s.dots) for (const [x, y] of s.points) plot.appendChild(svg('circle', { cx: f1(X(x)), cy: f1(Y(y)), r: 2.6, style: st({ fill: color }) }, [title(`${s.label}: ${yfmt(y)}`)]));
  });
  root.appendChild(plot);
  for (const h of opts.hlines || []) {
    const y = Y(h.y);
    root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: f1(y), y2: f1(y), class: 'ch-ref', style: st({ stroke: h.color || C.brass, 'stroke-dasharray': h.dash || '6 5' }) }, [title(h.label)]));
    if (h.label) root.appendChild(svg('text', { x: W - pad.r - 4, y: f1(y - 5), 'text-anchor': 'end', class: 'ch-reflabel', style: st({ fill: h.color || C.brass }), text: h.label }));
  }
  (opts.vlines || []).forEach((v, i) => {
    const x = X(v.x);
    root.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: pad.t, y2: H - pad.b, class: 'ch-ref', style: st({ stroke: v.color || C.ink, 'stroke-dasharray': v.dash || '3 4' }) }, [title(v.label)]));
    if (v.label) {
      const right = x > W - pad.r - 110;
      root.appendChild(svg('text', { x: f1(right ? x - 5 : x + 5), y: pad.t + 11 + (i % 3) * 13, 'text-anchor': right ? 'end' : 'start', class: 'ch-reflabel', style: st({ fill: v.color || C.ink }), text: v.label }));
    }
  });
  for (const m of opts.marks || []) {
    const x = X(m.x);
    const y = Y(m.y);
    const r = m.r || 5;
    root.appendChild(m.shape === 'diamond'
      ? svg('path', { d: `M${f1(x)} ${f1(y - r)}l${r} ${r}-${r} ${r}-${r}-${r}z`, class: 'ch-mark', style: st({ fill: m.color || C.brass }) }, [title(m.label)])
      : svg('circle', { cx: f1(x), cy: f1(y), r, class: 'ch-mark', style: st({ fill: m.color || C.brass }) }, [title(m.label)]));
    if (m.text) root.appendChild(svg('text', { x: f1(x + r + 4), y: f1(y - r - 2), class: 'ch-reflabel', style: st({ fill: m.color || C.brass }), text: m.text }));
  }
  return root;
}

/* ------------------------------------------------------------- bar chart */

/**
 * Vertical bars: grouped or stacked, negatives allowed, optional overlay line
 * (own right-hand axis, e.g. cumulative %), optional reference lines.
 * opts: { width, height, label, categories:[..], series:[{ label, color, values }], stacked,
 *   yFormat, line:{ label, color, values, max, format, right:true, dots }, hlines:[{ y, label, color, right }],
 *   onBar(i), highlight:Set|fn(i), animate, rotate, valueLabels, barTitle(i, si, v) }
 */
export function barChart(opts) {
  const W = opts.width || 880;
  const H = opts.height || 280;
  const n = opts.categories.length;
  const pad = { l: 66, r: opts.line && opts.line.right !== false ? 50 : 18, t: 18, b: opts.rotate ? 70 : 38, ...(opts.pad || {}) };
  const root = frame(W, H, opts.label);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    if (opts.stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of opts.series) { const v = s.values[i] || 0; if (v >= 0) pos += v; else neg += v; }
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    } else for (const s of opts.series) { hi = Math.max(hi, s.values[i] || 0); lo = Math.min(lo, s.values[i] || 0); }
  }
  for (const h of opts.hlines || []) if (!h.right) { hi = Math.max(hi, h.y); lo = Math.min(lo, h.y); }
  if (opts.line && opts.line.right === false) for (const v of opts.line.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  const sc = niceScale(lo, hi, opts.yTicks || 5);
  const Y = (v) => pad.t + (1 - (v - sc.min) / ((sc.max - sc.min) || 1)) * (H - pad.t - pad.b);
  const band = (W - pad.l - pad.r) / Math.max(1, n);
  const gap = band * (opts.gap === undefined ? 0.22 : opts.gap);
  const g = svg('g', { class: 'ch-axes' });
  const yfmt = opts.yFormat || ((v) => money(v));
  gridY(g, sc.ticks, pad.l, W - pad.r, Y, yfmt);
  g.appendChild(svg('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: H - pad.b, class: 'ch-axis' }));
  const every = Math.max(1, Math.ceil(n / (opts.maxLabels || 24)));
  opts.categories.forEach((c, i) => {
    if (i % every) return;
    const x = pad.l + band * (i + 0.5);
    const y = H - pad.b + 15;
    g.appendChild(opts.rotate
      ? svg('text', { x: f1(x), y: f1(y - 4), class: 'ch-tick', 'text-anchor': 'end', transform: `rotate(-35 ${f1(x)} ${f1(y - 4)})`, text: String(c) })
      : axisText(x, y, c));
  });
  root.appendChild(g);
  const bars = svg('g', {});
  const hl = (i) => (typeof opts.highlight === 'function' ? opts.highlight(i) : opts.highlight ? opts.highlight.has(i) : false);
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    const ns = opts.series.length;
    opts.series.forEach((s, si) => {
      const v = s.values[i] || 0;
      if (!v && opts.stacked) return;
      let x;
      let w;
      let y0;
      let y1;
      if (opts.stacked) {
        x = pad.l + band * i + gap / 2; w = band - gap;
        if (v >= 0) { y0 = Y(pos); y1 = Y(pos + v); pos += v; } else { y0 = Y(neg); y1 = Y(neg + v); neg += v; }
      } else {
        w = (band - gap) / ns; x = pad.l + band * i + gap / 2 + si * w;
        y0 = Y(0); y1 = Y(v);
      }
      const color = (s.colors && s.colors[i]) || s.color || SERIES[si % SERIES.length];
      const r = svg('rect', {
        x: f1(x), y: f1(Math.min(y0, y1)), width: f1(Math.max(0.5, w - (opts.stacked ? 0 : 1))), height: f1(Math.max(0.5, Math.abs(y1 - y0))), rx: opts.stacked ? 0 : 2,
        class: `ch-bar ${opts.animate ? (v >= 0 ? 'anim-grow' : 'anim-grow-down') : ''} ${hl(i) ? 'hl' : ''} ${opts.onBar ? 'clickable' : ''}`.replace(/\s+/g, ' ').trim(),
        style: st({ fill: color, opacity: s.opacity || '', 'animation-delay': opts.animate ? `${Math.min(0.6, i * 0.02)}s` : '' }),
      }, [title(opts.barTitle ? opts.barTitle(i, si, v) : `${opts.categories[i]} — ${s.label}: ${yfmt(v)}`)]);
      if (opts.onBar) {
        r.setAttribute('tabindex', '0');
        r.addEventListener('click', () => opts.onBar(i, si));
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onBar(i, si); } });
      }
      bars.appendChild(r);
      if (opts.valueLabels && !opts.stacked) bars.appendChild(axisText(x + w / 2, Math.min(y0, y1) - 4, yfmt(v), 'middle', 'ch-vlabel'));
    });
    if (opts.valueLabels && opts.stacked && pos) bars.appendChild(axisText(pad.l + band * (i + 0.5), Y(pos) - 4, yfmt(pos), 'middle', 'ch-vlabel'));
  }
  root.appendChild(bars);
  root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: f1(Y(0)), y2: f1(Y(0)), class: 'ch-axis' }));
  if (opts.line) {
    const L = opts.line;
    const max = L.max === undefined ? Math.max(...L.values) : L.max;
    const min = L.min === undefined ? 0 : L.min;
    const YL = L.right === false ? Y : (v) => pad.t + (1 - (v - min) / ((max - min) || 1)) * (H - pad.t - pad.b);
    const lp = L.values.map((v, i) => [pad.l + band * (i + 0.5), YL(v)]);
    if (L.right !== false) {
      const lf = L.format || ((v) => `${Math.round(v)}%`);
      for (const t of niceScale(min, max, 4).ticks.filter((v) => v <= max + 1e-9)) root.appendChild(axisText(W - pad.r + 6, YL(t) + 3.5, lf(t), 'start'));
    }
    root.appendChild(svg('polyline', { points: pts(lp), fill: 'none', pathLength: 1, class: `ch-line ${drawCls(opts.animate)}`.trim(), style: st({ stroke: L.color || C.brass, 'stroke-width': 2.4 }) }, [title(L.label)]));
    lp.forEach(([x, y], i) => root.appendChild(svg('circle', { cx: f1(x), cy: f1(y), r: 3.2, style: st({ fill: L.color || C.brass }) }, [title(`${opts.categories[i]} — ${L.label}: ${(L.format || ((v) => `${v.toFixed(1)}%`))(L.values[i])}`)])));
    for (const h of opts.hlines || []) {
      if (!h.right) continue;
      const y = YL(h.y);
      root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: f1(y), y2: f1(y), class: 'ch-ref', style: st({ stroke: h.color || C.warn, 'stroke-dasharray': '6 5' }) }, [title(h.label)]));
      root.appendChild(svg('text', { x: W - pad.r - 4, y: f1(y - 5), 'text-anchor': 'end', class: 'ch-reflabel', style: st({ fill: h.color || C.warn }), text: h.label }));
    }
  }
  for (const h of opts.hlines || []) {
    if (h.right) continue;
    const y = Y(h.y);
    root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: f1(y), y2: f1(y), class: 'ch-ref', style: st({ stroke: h.color || C.brass, 'stroke-dasharray': h.dash || '6 5' }) }, [title(h.label)]));
    if (h.label) root.appendChild(svg('text', { x: W - pad.r - 4, y: f1(y - 5), 'text-anchor': 'end', class: 'ch-reflabel', style: st({ fill: h.color || C.brass }), text: h.label }));
  }
  return root;
}

/* ------------------------------------------------- horizontal bar (list) */

/** Horizontal bars with labels on the left: rows [{ label, value, color?, title? , sub? }]. */
export function hbarChart(opts) {
  const rows = opts.rows;
  const rowH = opts.rowHeight || 26;
  const labelW = opts.labelWidth || 220;
  const W = opts.width || 760;
  const H = rows.length * rowH + 30;
  const root = frame(W, H, opts.label);
  const min = Math.min(0, ...rows.map((r) => r.value));
  const max = Math.max(0, ...rows.map((r) => r.value), opts.max || 0);
  const sc = niceScale(min, max, 5);
  const X = (v) => labelW + ((v - sc.min) / ((sc.max - sc.min) || 1)) * (W - labelW - 60);
  const fmt = opts.format || ((v) => money(v));
  for (const t of sc.ticks) {
    root.appendChild(svg('line', { x1: f1(X(t)), x2: f1(X(t)), y1: 4, y2: H - 22, class: t === 0 ? 'ch-zero' : 'ch-grid' }));
    root.appendChild(axisText(X(t), H - 8, fmt(t)));
  }
  rows.forEach((r, i) => {
    const y = 6 + i * rowH;
    root.appendChild(svg('text', { x: labelW - 8, y: y + rowH / 2 + 1, 'text-anchor': 'end', class: 'ch-rowlabel', text: r.label }, [title(r.title || r.label)]));
    const x0 = X(Math.min(0, r.value));
    const w = Math.abs(X(r.value) - X(0));
    root.appendChild(svg('rect', {
      x: f1(x0), y: y + 4, width: f1(Math.max(1, w)), height: rowH - 9, rx: 3,
      class: `ch-bar ${opts.animate ? 'anim-growx' : ''}`.trim(), style: st({ fill: r.color || C.c2, 'animation-delay': opts.animate ? `${i * 0.03}s` : '', 'transform-origin': r.value < 0 ? 'right' : 'left' }),
    }, [title(r.title || `${r.label}: ${fmt(r.value)}`)]));
    root.appendChild(svg('text', { x: f1(r.value < 0 ? x0 - 5 : x0 + w + 5), y: y + rowH / 2 + 1, 'text-anchor': r.value < 0 ? 'end' : 'start', class: 'ch-vlabel', text: r.text || fmt(r.value) }));
  });
  return root;
}

/* ------------------------------------------------------------- histogram */

/**
 * Histogram with optional cumulative curve (right axis %), value-space markers.
 * opts: { bins:{ min, width, counts }, color, cumulative, vlines:[{ x, label, color }], xFormat, label, width, height, unitLabel, shade:{ x0, x1, color } }
 */
export function histogramChart(opts) {
  const W = opts.width || 880;
  const H = opts.height || 280;
  const pad = { l: 56, r: opts.cumulative ? 50 : 20, t: 22, b: 36 };
  const { min, width, counts } = opts.bins;
  const n = counts.length;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const maxC = Math.max(1, ...counts);
  let x0 = min;
  let x1 = min + width * n;
  for (const v of opts.vlines || []) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); }
  const span = x1 - x0 || 1;
  x0 -= span * 0.02; x1 += span * 0.02;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const ysc = niceScale(0, maxC, 4);
  const Y = (c) => pad.t + (1 - c / ysc.max) * (H - pad.t - pad.b);
  const root = frame(W, H, opts.label);
  const g = svg('g', { class: 'ch-axes' });
  gridY(g, ysc.ticks, pad.l, W - pad.r, Y, (v) => String(Math.round(v)));
  const xt = niceScale(x0, x1, 7).ticks.filter((v) => v >= x0 && v <= x1).map((v) => ({ v, label: (opts.xFormat || String)(v) }));
  gridX(g, opts.xTicks || xt, pad.t, H - pad.b, X, opts.xFormat || String);
  g.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: 'ch-axis' }));
  root.appendChild(g);
  if (opts.shade) root.appendChild(svg('rect', { x: f1(X(opts.shade.x0)), y: pad.t, width: f1(Math.max(0, X(opts.shade.x1) - X(opts.shade.x0))), height: H - pad.t - pad.b, style: st({ fill: opts.shade.color || C.good, opacity: 0.08 }) }, [title(opts.shade.label)]));
  const fmt = opts.xFormat || ((v) => v.toFixed(1));
  counts.forEach((c, i) => {
    const a = min + i * width;
    const b = a + width;
    const col = typeof opts.color === 'function' ? opts.color(a, b) : opts.color || C.c2;
    root.appendChild(svg('rect', {
      x: f1(X(a) + 0.5), y: f1(Y(c)), width: f1(Math.max(0.5, X(b) - X(a) - 1)), height: f1(Math.max(0, Y(0) - Y(c))),
      class: `ch-bar ${opts.animate ? 'anim-grow' : ''}`.trim(), style: st({ fill: col, 'animation-delay': opts.animate ? `${i * 0.012}s` : '' }),
    }, [title(`${fmt(a)} – ${fmt(b)}: ${c} (${((c / total) * 100).toFixed(1)}%)`)]));
  });
  if (opts.cumulative) {
    let cum = 0;
    const cp = [[X(min), Y(0)]];
    const YC = (p) => pad.t + (1 - p) * (H - pad.t - pad.b);
    cp[0][1] = YC(0);
    counts.forEach((c, i) => { cum += c; cp.push([X(min + (i + 1) * width), YC(cum / total)]); });
    root.appendChild(svg('polyline', { points: pts(cp), fill: 'none', pathLength: 1, class: `ch-line ${drawCls(opts.animate)}`.trim(), style: st({ stroke: C.brass, 'stroke-width': 2.4 }) }, [title('Cumulative probability')]));
    for (const p of [0, 0.25, 0.5, 0.75, 1]) root.appendChild(axisText(W - pad.r + 6, YC(p) + 3.5, `${p * 100}%`, 'start'));
  }
  if (opts.curve) {
    root.appendChild(svg('polyline', { points: pts(opts.curve.map(([x, c]) => [X(x), Y(c)])), fill: 'none', class: 'ch-line', style: st({ stroke: C.brass, 'stroke-width': 2, 'stroke-dasharray': '5 4' }) }, [title(opts.curveLabel || 'Fitted normal curve')]));
  }
  (opts.vlines || []).forEach((v, i) => {
    const x = X(v.x);
    root.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: pad.t - 6, y2: H - pad.b, class: 'ch-ref', style: st({ stroke: v.color || C.ink, 'stroke-dasharray': v.dash || '4 4' }) }, [title(v.label)]));
    const right = x > W - pad.r - 120;
    root.appendChild(svg('text', { x: f1(right ? x - 4 : x + 4), y: pad.t + 6 + (i % 4) * 12, 'text-anchor': right ? 'end' : 'start', class: 'ch-reflabel', style: st({ fill: v.color || C.ink }), text: v.label }));
  });
  if (opts.unitLabel) root.appendChild(svg('text', { x: pad.l + (W - pad.l - pad.r) / 2, y: H - 2, class: 'ch-axlabel', 'text-anchor': 'middle', text: opts.unitLabel }));
  return root;
}

/* ------------------------------------------------------------------ Gantt */

/**
 * Gantt chart. rows: [{ id, code, label, level, summary, milestone, critical, done,
 *   bStart, bFinish (baseline), start, finish (actual/forecast), pct, color, expanded }]
 * opts: { startDate, horizon:[d0,d1], today, rowHeight, labelWidth, onRow(row), onToggle(row), animate, selected }
 */
export function ganttChart(rows, opts) {
  const rowH = opts.rowHeight || 22;
  const labelW = opts.labelWidth || 270;
  const W = opts.width || 1180;
  const top = 30;
  const H = top + rows.length * rowH + 8;
  const [d0, d1] = opts.horizon;
  const X = (d) => labelW + ((d - d0) / ((d1 - d0) || 1)) * (W - labelW - 14);
  const root = frame(W, H, opts.label || 'Gantt chart', 'gantt');
  const g = svg('g', { class: 'ch-axes' });
  for (const t of dayTicks(opts.startDate, d0, d1, 14)) {
    const x = X(t.v);
    g.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: top - 6, y2: H, class: 'ch-grid ch-gridx' }));
    g.appendChild(axisText(x, 14, t.label));
  }
  root.appendChild(g);
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const row = svg('g', { class: `g-row ${r.summary ? 'summary' : ''} ${r.critical ? 'critical' : ''} ${opts.selected === r.id ? 'selected' : ''}`.replace(/\s+/g, ' ').trim() });
    if (i % 2 === 0) row.appendChild(svg('rect', { x: 0, y, width: W, height: rowH, class: 'g-stripe' }));
    const indent = r.level ? 18 : 4;
    const tx = svg('text', { x: indent + (r.summary ? 14 : 0), y: y + rowH / 2 + 4, class: `g-label ${r.summary ? 'g-sum' : ''}`, text: `${r.code ? `${r.code}  ` : ''}${r.label}`.slice(0, 44) }, [title(`${r.code} ${r.label}`)]);
    if (r.summary && opts.onToggle) {
      row.appendChild(svg('text', { x: indent, y: y + rowH / 2 + 4, class: 'g-caret', text: r.expanded ? '▾' : '▸' }));
    }
    row.appendChild(tx);
    const clickable = r.summary ? opts.onToggle : opts.onRow;
    if (clickable) {
      const hit = svg('rect', { x: 0, y, width: labelW, height: rowH, class: 'g-hit', tabindex: '0', role: 'button', 'aria-label': `${r.code} ${r.label}` });
      hit.addEventListener('click', () => clickable(r));
      hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickable(r); } });
      row.appendChild(hit);
    }
    const tip = `${r.code} ${r.label}\nBaseline ${shortDate(opts.startDate, r.bStart)} → ${shortDate(opts.startDate, r.bFinish)}\n${r.done ? 'Actual' : 'Forecast'} ${shortDate(opts.startDate, r.start)} → ${shortDate(opts.startDate, r.finish)}\n${Math.round((r.pct || 0) * 100)}% complete${r.critical ? ' · CRITICAL' : ''}${Number.isFinite(r.tf) ? ` · total float ${Math.round(r.tf)} d` : ''}`;
    if (r.milestone) {
      const bx = X(r.bFinish);
      row.appendChild(svg('path', { d: `M${f1(bx)} ${y + 4}l6 7-6 7-6-7z`, class: 'g-ms-base' }, [title(tip)]));
      const x = X(r.finish);
      row.appendChild(svg('path', { d: `M${f1(x)} ${y + 3}l8 8-8 8-8-8z`, class: `g-ms ${r.done ? 'done' : ''} ${r.critical ? 'crit' : ''}`.trim(), style: st({ fill: r.done ? C.good : r.critical ? C.crit : C.brass }) }, [title(tip)]));
    } else {
      const bx0 = X(r.bStart);
      const bx1 = X(r.bFinish);
      row.appendChild(svg('rect', { x: f1(bx0), y: y + rowH - 7, width: f1(Math.max(1, bx1 - bx0)), height: 4, rx: 1.5, class: 'g-base' }, [title(tip)]));
      const x0 = X(r.start);
      const x1 = X(r.finish);
      const bh = r.summary ? 7 : 10;
      const by = y + (r.summary ? 5 : 3);
      const color = r.critical ? C.crit : r.color || C.c2;
      const anim = opts.animate ? 'anim-growx' : '';
      row.appendChild(svg('rect', { x: f1(x0), y: by, width: f1(Math.max(2, x1 - x0)), height: bh, rx: r.summary ? 1 : 3, class: `g-bar ${anim}`.trim(), style: st({ fill: color, opacity: r.summary ? 0.85 : 0.36, 'animation-delay': opts.animate ? `${Math.min(0.5, i * 0.012)}s` : '' }) }, [title(tip)]));
      if (r.pct > 0) row.appendChild(svg('rect', { x: f1(x0), y: by, width: f1(Math.max(1.5, (x1 - x0) * Math.min(1, r.pct))), height: bh, rx: r.summary ? 1 : 3, class: `g-prog ${anim}`.trim(), style: st({ fill: color }) }, [title(tip)]));
      if (r.summary) {
        row.appendChild(svg('path', { d: `M${f1(x0)} ${by}v${bh + 4}l4-4z M${f1(x1)} ${by}v${bh + 4}l-4-4z`, style: st({ fill: color }) }));
      }
      if (!r.summary && x1 - x0 > 0 && r.critical) row.appendChild(svg('text', { x: f1(x1 + 4), y: y + rowH / 2 + 3, class: 'g-tag', text: 'CP' }));
    }
    root.appendChild(row);
  });
  if (Number.isFinite(opts.today)) {
    const x = X(opts.today);
    root.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: top - 10, y2: H, class: 'g-today' }, [title(`Today — ${shortDate(opts.startDate, opts.today)}`)]));
    root.appendChild(svg('text', { x: f1(x + 4), y: top - 2, class: 'g-todaylabel', text: 'Today' }));
  }
  if (Number.isFinite(opts.baselineFinish)) {
    const x = X(opts.baselineFinish);
    root.appendChild(svg('line', { x1: f1(x), x2: f1(x), y1: top - 10, y2: H, class: 'ch-ref', style: st({ stroke: C.brass, 'stroke-dasharray': '2 5' }) }, [title(`Baseline finish — ${shortDate(opts.startDate, opts.baselineFinish)}`)]));
  }
  return root;
}

/* -------------------------------------------------- AON network diagram */

/**
 * Activity-on-node diagram. nodes: [{ id, code, name, dur, es, ef, ls, lf, tf, ff, critical, done, pct, preds:[{ id, type, lag }] }]
 * Layout 'snake' (a chain wrapped into rows) or 'layered' (longest-path columns).
 */
export function networkChart(nodes, opts = {}) {
  const bw = 156;
  const bh = 76;
  const gx = opts.gapX || 46;
  const gy = opts.gapY || 30;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = new Map();
  let cols = 0;
  let rowsN = 0;
  if (opts.layout === 'snake') {
    const per = opts.perRow || 6;
    nodes.forEach((n, i) => {
      const r = Math.floor(i / per);
      let c = i % per;
      if (r % 2 === 1) c = per - 1 - c;
      pos.set(n.id, { c, r });
      cols = Math.max(cols, c + 1); rowsN = Math.max(rowsN, r + 1);
    });
  } else {
    const rank = new Map();
    for (const n of nodes) {
      let k = 0;
      for (const p of n.preds || []) if (rank.has(p.id)) k = Math.max(k, rank.get(p.id) + 1);
      rank.set(n.id, k);
    }
    const colCount = new Map();
    for (const n of nodes) {
      const c = rank.get(n.id);
      const r = colCount.get(c) || 0;
      colCount.set(c, r + 1);
      pos.set(n.id, { c, r });
      cols = Math.max(cols, c + 1); rowsN = Math.max(rowsN, r + 1);
    }
  }
  const W = 20 + cols * (bw + gx);
  const H = 20 + rowsN * (bh + gy);
  const root = frame(W, H, opts.label || 'Activity-on-node network diagram', 'network');
  const defs = svg('defs', {}, [
    svg('marker', { id: 'nw-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [svg('path', { d: 'M0 0L10 5L0 10z', class: 'nw-arrowhead' })]),
    svg('marker', { id: 'nw-arrow-c', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [svg('path', { d: 'M0 0L10 5L0 10z', class: 'nw-arrowhead crit' })]),
  ]);
  root.appendChild(defs);
  const P = (id) => { const p = pos.get(id); return { x: 10 + p.c * (bw + gx), y: 10 + p.r * (bh + gy) }; };
  const edges = svg('g', { class: 'nw-edges' });
  for (const n of nodes) {
    for (const l of n.preds || []) {
      if (!byId.has(l.id)) continue;
      const a = P(l.id);
      const b = P(n.id);
      const crit = n.critical && byId.get(l.id).critical;
      const type = l.type || 'FS';
      const fromRight = type === 'FS' || type === 'FF';
      const toRight = type === 'FF' || type === 'SF';
      const sx = fromRight ? a.x + bw : a.x;
      const sy = a.y + bh / 2;
      const ex = toRight ? b.x + bw : b.x;
      const ey = b.y + bh / 2;
      let d;
      if (Math.abs(sy - ey) < 1 && ex > sx) d = `M${sx} ${sy}L${ex - 1} ${ey}`;
      else {
        const dx = Math.max(24, Math.abs(ex - sx) / 2);
        const c1 = fromRight ? sx + dx : sx - dx;
        const c2 = toRight ? ex + dx : ex - dx;
        d = `M${sx} ${sy}C${c1} ${sy} ${c2} ${ey} ${ex} ${ey}`;
      }
      const lbl = type !== 'FS' || l.lag ? `${type}${l.lag ? (l.lag > 0 ? `+${l.lag}` : l.lag) : ''}` : '';
      edges.appendChild(svg('path', { d, class: `nw-edge ${crit ? 'crit' : ''}`.trim(), 'marker-end': `url(#${crit ? 'nw-arrow-c' : 'nw-arrow'})` }, [title(`${l.id} → ${n.id} ${type}${l.lag ? ` lag ${l.lag} d` : ''}`)]));
      if (lbl) edges.appendChild(svg('text', { x: f1((sx + ex) / 2), y: f1((sy + ey) / 2 - 5), class: 'nw-link', 'text-anchor': 'middle', text: lbl }));
    }
  }
  root.appendChild(edges);
  const r0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '—');
  nodes.forEach((n, i) => {
    const { x, y } = P(n.id);
    const g = svg('g', { class: `nw-node ${n.critical ? 'crit' : ''} ${n.done ? 'done' : ''} ${opts.selected === n.id ? 'selected' : ''} ${opts.animate ? 'anim-fade' : ''}`.replace(/\s+/g, ' ').trim(), transform: `translate(${x} ${y})`, style: opts.animate ? st({ 'animation-delay': `${Math.min(0.8, i * 0.03)}s` }) : null, tabindex: opts.onNode ? '0' : null, role: opts.onNode ? 'button' : null });
    g.appendChild(svg('rect', { width: bw, height: bh, rx: 6, class: 'nw-box' }));
    g.appendChild(svg('line', { x1: 0, x2: bw, y1: 22, y2: 22, class: 'nw-div' }));
    g.appendChild(svg('line', { x1: 0, x2: bw, y1: bh - 22, y2: bh - 22, class: 'nw-div' }));
    for (const fx of [bw / 3, (2 * bw) / 3]) {
      g.appendChild(svg('line', { x1: fx, x2: fx, y1: 0, y2: 22, class: 'nw-div' }));
      g.appendChild(svg('line', { x1: fx, x2: fx, y1: bh - 22, y2: bh, class: 'nw-div' }));
    }
    const cell = (cx, cy, v, cls = 'nw-num') => g.appendChild(svg('text', { x: cx, y: cy, 'text-anchor': 'middle', class: cls, text: v }));
    cell(bw / 6, 15, r0(n.es)); cell(bw / 2, 15, `${r0(n.dur)} d`); cell((5 * bw) / 6, 15, r0(n.ef));
    cell(bw / 6, bh - 7, r0(n.ls)); cell(bw / 2, bh - 7, `TF ${r0(n.tf)}`, `nw-num ${n.tf <= 0.5 ? 'zero' : ''}`); cell((5 * bw) / 6, bh - 7, r0(n.lf));
    g.appendChild(svg('text', { x: bw / 2, y: 36, 'text-anchor': 'middle', class: 'nw-code', text: n.code }));
    g.appendChild(svg('text', { x: bw / 2, y: 49, 'text-anchor': 'middle', class: 'nw-name', text: n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name }));
    if (n.pct > 0) g.appendChild(svg('rect', { x: 6, y: bh - 26, width: f1((bw - 12) * Math.min(1, n.pct)), height: 2.5, class: 'nw-pct' }));
    g.appendChild(title(`${n.code} ${n.name}\nES ${r0(n.es)} · EF ${r0(n.ef)} · LS ${r0(n.ls)} · LF ${r0(n.lf)}\nTotal float ${r0(n.tf)} d · free float ${r0(n.ff)} d · ${Math.round((n.pct || 0) * 100)}% complete`));
    if (opts.onNode) {
      g.addEventListener('click', () => opts.onNode(n));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onNode(n); } });
    }
    root.appendChild(g);
  });
  return root;
}

/** Small key explaining the AON box layout. */
export function networkKey() {
  const root = frame(220, 92, 'How to read a node');
  const g = svg('g', { transform: 'translate(30 8)', class: 'nw-node' });
  const bw = 156;
  const bh = 76;
  g.appendChild(svg('rect', { width: bw, height: bh, rx: 6, class: 'nw-box' }));
  for (const [y1, y2] of [[22, 22], [bh - 22, bh - 22]]) g.appendChild(svg('line', { x1: 0, x2: bw, y1, y2, class: 'nw-div' }));
  for (const fx of [bw / 3, (2 * bw) / 3]) { g.appendChild(svg('line', { x1: fx, x2: fx, y1: 0, y2: 22, class: 'nw-div' })); g.appendChild(svg('line', { x1: fx, x2: fx, y1: bh - 22, y2: bh, class: 'nw-div' })); }
  const t = (x, y, s, c = 'nw-num') => g.appendChild(svg('text', { x, y, 'text-anchor': 'middle', class: c, text: s }));
  t(bw / 6, 15, 'ES'); t(bw / 2, 15, 'Dur'); t((5 * bw) / 6, 15, 'EF');
  t(bw / 2, 36, 'WBS code', 'nw-code'); t(bw / 2, 49, 'Activity name', 'nw-name');
  t(bw / 6, bh - 7, 'LS'); t(bw / 2, bh - 7, 'TF'); t((5 * bw) / 6, bh - 7, 'LF');
  root.appendChild(g);
  return root;
}

/* -------------------------------------------------------------- heat map */

/**
 * 5×5 probability × impact matrix. cells(p, i) → { count, ids, emv }.
 * opts: { mirror (opportunity: impact axis right-to-left), onCell(p,i), selected:{p,i}, label, kind }
 */
export function heatMap(opts) {
  const S = opts.size || 300;
  const pad = { l: 44, t: 24, r: 8, b: 40 };
  const cw = (S - pad.l - pad.r) / 5;
  const ch = cw;
  const W = S;
  const H = pad.t + ch * 5 + pad.b;
  const root = frame(W, H, opts.label || 'Probability–impact matrix', 'heatmap');
  root.appendChild(svg('text', { x: pad.l + cw * 2.5, y: 14, 'text-anchor': 'middle', class: `hm-title ${opts.kind || ''}`, text: opts.heading || (opts.kind === 'opportunity' ? 'Opportunities' : 'Threats') }));
  for (let p = 5; p >= 1; p--) {
    for (let i = 1; i <= 5; i++) {
      const col = opts.mirror ? 5 - i : i - 1;
      const x = pad.l + col * cw;
      const y = pad.t + (5 - p) * ch;
      const score = p * i;
      const band = score >= 15 ? 'high' : score >= 8 ? 'med' : 'low';
      const c = opts.cells(p, i);
      const sel = opts.selected && opts.selected.p === p && opts.selected.i === i && opts.selected.kind === opts.kind;
      const g = svg('g', { class: `hm-cell ${band} ${opts.kind || ''} ${sel ? 'selected' : ''} ${c.count ? 'has' : ''}`.replace(/\s+/g, ' ').trim(), tabindex: '0', role: 'button', 'aria-label': `Probability ${p}, impact ${i}: ${c.count} ${opts.kind || 'risk'}${c.count === 1 ? '' : 's'}` });
      g.appendChild(svg('rect', { x: f1(x + 1.5), y: f1(y + 1.5), width: f1(cw - 3), height: f1(ch - 3), rx: 5 }));
      g.appendChild(svg('text', { x: f1(x + cw - 6), y: f1(y + 13), 'text-anchor': 'end', class: 'hm-score', text: String(score) }));
      if (c.count) g.appendChild(svg('text', { x: f1(x + cw / 2), y: f1(y + ch / 2 + 7), 'text-anchor': 'middle', class: 'hm-count', text: String(c.count) }));
      g.appendChild(title(`P${p} × I${i} = ${score}\n${c.count ? c.ids.join(', ') : 'No risks'}`));
      if (opts.onCell) {
        g.addEventListener('click', () => opts.onCell(p, i, opts.kind));
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onCell(p, i, opts.kind); } });
      }
      root.appendChild(g);
    }
    root.appendChild(axisText(pad.l - 8, pad.t + (5 - p) * ch + ch / 2 + 4, `P${p}`, 'end'));
  }
  for (let i = 1; i <= 5; i++) {
    const col = opts.mirror ? 5 - i : i - 1;
    root.appendChild(axisText(pad.l + col * cw + cw / 2, pad.t + 5 * ch + 15, `I${i}`));
  }
  root.appendChild(svg('text', { x: pad.l + cw * 2.5, y: H - 6, 'text-anchor': 'middle', class: 'ch-axlabel', text: opts.mirror ? '← Impact (benefit)' : 'Impact →' }));
  return root;
}

/* ---------------------------------------------------------------- tornado */

/** Tornado: items [{ label, value (signed), text? }], sorted by |value|. opts: { format, label, max } */
export function tornadoChart(items, opts = {}) {
  const rowH = 24;
  const labelW = opts.labelWidth || 250;
  const W = opts.width || 820;
  const H = items.length * rowH + 34;
  const root = frame(W, H, opts.label || 'Tornado chart');
  const max = opts.max || Math.max(0.05, ...items.map((i) => Math.abs(i.value)));
  const mid = labelW + (W - labelW - 20) / 2;
  const half = (W - labelW - 20) / 2 - 40;
  const X = (v) => mid + (v / max) * half;
  const fmt = opts.format || ((v) => v.toFixed(2));
  for (const t of [-max, -max / 2, 0, max / 2, max]) {
    root.appendChild(svg('line', { x1: f1(X(t)), x2: f1(X(t)), y1: 4, y2: H - 24, class: t === 0 ? 'ch-zero' : 'ch-grid' }));
    root.appendChild(axisText(X(t), H - 10, fmt(t)));
  }
  items.forEach((it, i) => {
    const y = 6 + i * rowH;
    root.appendChild(svg('text', { x: labelW - 8, y: y + rowH / 2 + 2, 'text-anchor': 'end', class: 'ch-rowlabel', text: it.label.length > 38 ? `${it.label.slice(0, 37)}…` : it.label }, [title(it.label)]));
    const x0 = X(Math.min(0, it.value));
    const w = Math.abs(X(it.value) - X(0));
    const col = it.color || (it.value >= 0 ? C.crit : C.good);
    root.appendChild(svg('rect', { x: f1(x0), y: y + 3, width: f1(Math.max(1, w)), height: rowH - 7, rx: 3, class: `ch-bar ${opts.animate ? 'anim-growx' : ''}`.trim(), style: st({ fill: col, 'transform-origin': it.value < 0 ? 'right' : 'left', 'animation-delay': opts.animate ? `${i * 0.04}s` : '' }) }, [title(`${it.label}: ${it.text || fmt(it.value)}`)]));
    root.appendChild(svg('text', { x: f1(it.value >= 0 ? x0 + w + 5 : x0 - 5), y: y + rowH / 2 + 2, 'text-anchor': it.value >= 0 ? 'start' : 'end', class: 'ch-vlabel', text: it.text || fmt(it.value) }));
  });
  return root;
}

/* ------------------------------------------------------- control chart */

/**
 * Individuals control chart. points: [{ y, label }]; limits { cl, ucl, lcl, sigma }; spec { lsl, usl };
 * violations: [{ index, rule }] (Western Electric). opts: { unit, label, format }
 */
export function controlChart(points, limits, spec, violations, opts = {}) {
  const W = opts.width || 880;
  const H = opts.height || 280;
  const pad = { l: 58, r: 92, t: 16, b: 30 };
  const root = frame(W, H, opts.label || 'Control chart');
  const vals = points.map((p) => p.y);
  const lo = Math.min(...vals, limits.lcl, spec.lsl !== undefined ? spec.lsl : Infinity);
  const hi = Math.max(...vals, limits.ucl, spec.usl !== undefined ? spec.usl : -Infinity);
  const sc = niceScale(lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04, 5);
  const n = Math.max(2, points.length);
  const X = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - sc.min) / ((sc.max - sc.min) || 1)) * (H - pad.t - pad.b);
  const fmt = opts.format || ((v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)));
  const g = svg('g', { class: 'ch-axes' });
  gridY(g, sc.ticks, pad.l, W - pad.r, Y, fmt);
  root.appendChild(g);
  // sigma zones
  const s = limits.sigma;
  for (const [k, op] of [[1, 0.05], [2, 0.035]]) {
    root.appendChild(svg('rect', { x: pad.l, y: f1(Y(limits.cl + (k + 1) * s)), width: W - pad.l - pad.r, height: f1(Math.max(0, Y(limits.cl + k * s) - Y(limits.cl + (k + 1) * s))), style: st({ fill: C.warn, opacity: op }) }));
    root.appendChild(svg('rect', { x: pad.l, y: f1(Y(limits.cl - k * s)), width: W - pad.l - pad.r, height: f1(Math.max(0, Y(limits.cl - (k + 1) * s) - Y(limits.cl - k * s))), style: st({ fill: C.warn, opacity: op }) }));
  }
  const line = (v, cls, label, color) => {
    if (!Number.isFinite(v)) return;
    root.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: f1(Y(v)), y2: f1(Y(v)), class: cls, style: color ? st({ stroke: color }) : null }, [title(`${label} = ${fmt(v)}`)]));
    root.appendChild(svg('text', { x: W - pad.r + 5, y: f1(Y(v) + 4), class: 'cc-lbl', style: color ? st({ fill: color }) : null, text: `${label} ${fmt(v)}` }));
  };
  line(limits.ucl, 'cc-limit', 'UCL', C.bad);
  line(limits.cl, 'cc-cl', 'CL', C.good);
  line(limits.lcl, 'cc-limit', 'LCL', C.bad);
  if (spec.usl !== undefined) line(spec.usl, 'cc-spec', 'USL', C.info);
  if (spec.lsl !== undefined) line(spec.lsl, 'cc-spec', 'LSL', C.info);
  const vio = new Map();
  for (const v of violations || []) { if (!vio.has(v.index)) vio.set(v.index, []); vio.get(v.index).push(v.rule); }
  root.appendChild(svg('polyline', { points: pts(points.map((p, i) => [X(i), Y(p.y)])), fill: 'none', pathLength: 1, class: `cc-line ${drawCls(opts.animate)}`.trim() }));
  points.forEach((p, i) => {
    const rules = vio.get(i);
    const out = spec.usl !== undefined && p.y > spec.usl || spec.lsl !== undefined && p.y < spec.lsl;
    const c = svg('circle', { cx: f1(X(i)), cy: f1(Y(p.y)), r: rules ? 4.6 : 2.8, class: `cc-pt ${rules ? 'vio' : ''} ${out ? 'oos' : ''}`.replace(/\s+/g, ' ').trim() }, [title(`${p.label || `#${i + 1}`}: ${fmt(p.y)} ${opts.unit || ''}${rules ? `\nWestern Electric rule ${[...new Set(rules)].join(', ')}` : ''}${out ? '\nOutside specification' : ''}`)]);
    root.appendChild(c);
    if (rules) root.appendChild(svg('text', { x: f1(X(i)), y: f1(Y(p.y) - 8), 'text-anchor': 'middle', class: 'cc-rule', text: `R${Math.min(...rules)}` }));
  });
  root.appendChild(axisText(pad.l, H - 8, opts.firstLabel || 'oldest', 'start'));
  root.appendChild(axisText(W - pad.r, H - 8, opts.lastLabel || 'latest', 'end'));
  return root;
}

/* ----------------------------------------------------------------- Pareto */

/** Pareto chart from quality.pareto() rows. */
export function paretoChart(rows, opts = {}) {
  return barChart({
    width: opts.width || 880, height: opts.height || 290, label: opts.label || 'Pareto chart of defects',
    categories: rows.map((r) => r.category), rotate: true,
    series: [{ label: 'Defects', values: rows.map((r) => r.count), colors: rows.map((r) => (r.vital ? 'var(--c3)' : 'var(--c2)')) }],
    yFormat: (v) => String(Math.round(v)),
    line: { label: 'Cumulative %', values: rows.map((r) => r.cumulativePct), max: 100, color: C.brass },
    hlines: [{ y: 80, label: '80 % line', right: true, color: C.warn }],
    animate: opts.animate,
    barTitle: (i) => `${rows[i].category}: ${rows[i].count} (${rows[i].pct.toFixed(1)}%, cumulative ${rows[i].cumulativePct.toFixed(1)}%)${rows[i].vital ? ' — vital few' : ''}`,
  });
}

/* -------------------------------------------------------------- fishbone */

/** Ishikawa diagram: effect + bones [{ name, causes:[…] }] (6M → 3 top, 3 bottom). */
export function fishboneChart(effect, bones, opts = {}) {
  const W = opts.width || 980;
  const H = opts.height || 380;
  const spineY = H / 2;
  const headX = W - 190;
  const root = frame(W, H, opts.label || `Fishbone diagram: ${effect}`, 'fishbone');
  root.appendChild(svg('line', { x1: 30, x2: headX, y1: spineY, y2: spineY, class: 'fb-spine' }));
  root.appendChild(svg('path', { d: `M${headX} ${spineY - 34}h170v68h-170z`, class: 'fb-head' }));
  const words = String(effect).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 18) { lines.push(cur.trim()); cur = w; } else cur += ` ${w}`; }
  if (cur.trim()) lines.push(cur.trim());
  lines.slice(0, 3).forEach((l, i) => root.appendChild(svg('text', { x: headX + 85, y: spineY - (lines.length - 1) * 8 + i * 16 + 5, 'text-anchor': 'middle', class: 'fb-effect', text: l })));
  const per = Math.ceil(bones.length / 2);
  const slot = (headX - 60) / per;
  bones.forEach((b, i) => {
    const topSide = i < per;
    const k = topSide ? i : i - per;
    const bx = 70 + k * slot + slot * 0.55;
    const ey = topSide ? 46 : H - 46;
    const sx = bx + (topSide ? 0 : 0);
    const jx = bx + Math.abs(spineY - ey) * 0.45;
    root.appendChild(svg('line', { x1: f1(sx), y1: ey, x2: f1(jx), y2: spineY, class: `fb-bone ${opts.animate ? 'anim-fade' : ''}`.trim() }));
    root.appendChild(svg('text', { x: f1(sx), y: topSide ? ey - 10 : ey + 20, 'text-anchor': 'middle', class: 'fb-cat', text: b.name }));
    b.causes.slice(0, 4).forEach((c, ci) => {
      const t = (ci + 1) / 5;
      const cy = ey + (spineY - ey) * t;
      const cx = sx + (jx - sx) * t;
      root.appendChild(svg('line', { x1: f1(cx - 8), x2: f1(cx), y1: f1(cy), y2: f1(cy), class: 'fb-twig' }));
      root.appendChild(svg('text', { x: f1(cx - 11), y: f1(cy + 4), 'text-anchor': 'end', class: 'fb-cause', text: c.length > 30 ? `${c.slice(0, 29)}…` : c }, [title(c)]));
    });
  });
  return root;
}

/* ---------------------------------------------------------- decision tree */

/**
 * Decision tree drawn left → right. tree: { type:'decision'|'chance'|'outcome', label, value?, cost?,
 * options:[{ label, cost, node }], branches:[{ label, p, node }] }; rolled: result of risk.decisionTree(tree).
 */
export function decisionTreeChart(tree, rolled, opts = {}) {
  const leafH = 46;
  const colW = opts.colW || 230;
  const leaves = (n) => {
    if (!n || n.type === 'outcome' || typeof n === 'number') return 1;
    const kids = n.type === 'decision' ? n.options.map((o) => o.node) : n.branches.map((b) => b.node);
    return kids.reduce((s, k) => s + leaves(k), 0);
  };
  const depth = (n) => (!n || n.type === 'outcome' ? 0 : 1 + Math.max(...(n.type === 'decision' ? n.options.map((o) => depth(o.node)) : n.branches.map((b) => depth(b.node)))));
  const total = leaves(tree);
  const W = 40 + (depth(tree) + 1) * colW + 60;
  const H = total * leafH + 24;
  const root = frame(W, H, opts.label || 'Decision tree');
  const fmt = opts.format || ((v) => money(v));
  const draw = (n, r, x, y0, y1, chosen) => {
    const y = (y0 + y1) / 2;
    if (!n || n.type === 'outcome') {
      root.appendChild(svg('path', { d: `M${x} ${y}l12 -8v16z`, class: 'dt-leaf' }, [title(n && n.label ? n.label : '')]));
      root.appendChild(svg('text', { x: x + 18, y: y + 4, class: `dt-val ${chosen ? 'on' : ''}`, text: fmt(n ? n.value : 0) }));
      return;
    }
    const kids = n.type === 'decision'
      ? n.options.map((o, i) => ({ label: o.label, sub: o.cost ? `cost ${fmt(-o.cost)}` : '', node: o.node, roll: r.options[i], best: r.choice === o.label }))
      : n.branches.map((b, i) => ({ label: b.label, sub: `p = ${b.p.toFixed(2)}`, node: b.node, roll: r.branches[i], best: true }));
    const span = y1 - y0;
    let cursor = y0;
    const cx = x + colW;
    kids.forEach((k) => {
      const h = (leaves(k.node) / leaves(n)) * span;
      const ky = cursor + h / 2;
      const on = chosen && (n.type === 'chance' || k.best);
      root.appendChild(svg('path', { d: `M${x + 12} ${y}L${x + 40} ${f1(ky)}L${cx - 4} ${f1(ky)}`, class: `dt-edge ${on ? 'on' : ''} ${n.type === 'decision' && !k.best ? 'pruned' : ''}`.replace(/\s+/g, ' ').trim() }));
      root.appendChild(svg('text', { x: x + 46, y: f1(ky - 6), class: 'dt-label', text: k.label }));
      if (k.sub) root.appendChild(svg('text', { x: x + 46, y: f1(ky + 13), class: 'dt-sub', text: k.sub }));
      if (n.type === 'decision' && !k.best) root.appendChild(svg('text', { x: cx - 30, y: f1(ky + 4), class: 'dt-prune', text: '//' }));
      draw(k.node, k.roll && k.roll.detail ? k.roll.detail : { value: k.roll ? k.roll.value : 0 }, cx, cursor, cursor + h, on);
      cursor += h;
    });
    if (n.type === 'decision') root.appendChild(svg('rect', { x: x - 10, y: y - 10, width: 22, height: 20, rx: 2, class: 'dt-decision' }, [title(`Decision — best: ${r.choice} (${fmt(r.value)})`)]));
    else root.appendChild(svg('circle', { cx: x + 1, cy: y, r: 11, class: 'dt-chance' }, [title(`Chance node — EMV ${fmt(r.value)}`)]));
    root.appendChild(svg('text', { x: x + 1, y: y - 16, 'text-anchor': 'middle', class: 'dt-emv', text: `${n.type === 'decision' ? 'Best' : 'EMV'} ${fmt(r.value)}` }));
  };
  draw(tree, rolled, 30, 10, H - 10, true);
  return root;
}

/* ---------------------------------------------------------------- scatter */

/** Scatter with least-squares line: points [[x,y]]. Returns svg with r² in title. */
export function scatterChart(points, opts = {}) {
  const W = opts.width || 560;
  const H = opts.height || 280;
  const pad = { l: 56, r: 18, t: 16, b: 40 };
  const root = frame(W, H, opts.label || 'Scatter diagram');
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const xsc = niceScale(Math.min(...xs), Math.max(...xs), 5);
  const ysc = niceScale(Math.min(...ys), Math.max(...ys), 5);
  const X = (v) => pad.l + ((v - xsc.min) / ((xsc.max - xsc.min) || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - ysc.min) / ((ysc.max - ysc.min) || 1)) * (H - pad.t - pad.b);
  const g = svg('g', { class: 'ch-axes' });
  gridY(g, ysc.ticks, pad.l, W - pad.r, Y, opts.yFormat || ((v) => v.toFixed(1)));
  gridX(g, xsc.ticks.map((v) => ({ v })), pad.t, H - pad.b, X, opts.xFormat || ((v) => v.toFixed(0)));
  root.appendChild(g);
  for (const [x, y] of points) root.appendChild(svg('circle', { cx: f1(X(x)), cy: f1(Y(y)), r: 3.2, class: 'sc-pt' }, [title(`${opts.xName || 'x'} ${x.toFixed(1)} · ${opts.yName || 'y'} ${y.toFixed(2)}`)]));
  const n = points.length;
  if (n > 2) {
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    if (sxx > 0) {
      const b = sxy / sxx;
      const a = my - b * mx;
      const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
      root.appendChild(svg('line', { x1: f1(X(xsc.min)), y1: f1(Y(a + b * xsc.min)), x2: f1(X(xsc.max)), y2: f1(Y(a + b * xsc.max)), class: 'sc-fit' }, [title(`Least squares: y = ${a.toFixed(2)} + ${b.toFixed(3)}·x; r = ${r.toFixed(2)}`)]));
      root.appendChild(svg('text', { x: W - pad.r - 4, y: pad.t + 12, 'text-anchor': 'end', class: 'ch-reflabel', style: st({ fill: C.brass }), text: `r = ${r.toFixed(2)} · r² = ${(r * r).toFixed(2)}` }));
      root.dataset.r = r.toFixed(3);
    }
  }
  if (opts.xLabel) root.appendChild(svg('text', { x: pad.l + (W - pad.l - pad.r) / 2, y: H - 4, class: 'ch-axlabel', 'text-anchor': 'middle', text: opts.xLabel }));
  if (opts.yLabel) root.appendChild(svg('text', { x: 12, y: H / 2, class: 'ch-axlabel', transform: `rotate(-90 12 ${H / 2})`, 'text-anchor': 'middle', text: opts.yLabel }));
  return root;
}

/* -------------------------------------------------------------- waterfall */

/** Waterfall / build-up: steps [{ label, value, total?:bool, color? }]. */
export function waterfallChart(steps, opts = {}) {
  const W = opts.width || 880;
  const H = opts.height || 280;
  const pad = { l: 66, r: 18, t: 22, b: 58 };
  const root = frame(W, H, opts.label || 'Budget build-up');
  let run = 0;
  const bars = steps.map((s) => {
    if (s.total) { const b = { from: 0, to: run, s }; return b; }
    const b = { from: run, to: run + s.value, s };
    run += s.value;
    return b;
  });
  const sc = niceScale(0, Math.max(...bars.map((b) => Math.max(b.from, b.to))), 5);
  const Y = (v) => pad.t + (1 - v / sc.max) * (H - pad.t - pad.b);
  const band = (W - pad.l - pad.r) / steps.length;
  const g = svg('g', { class: 'ch-axes' });
  gridY(g, sc.ticks, pad.l, W - pad.r, Y, (v) => money(v));
  root.appendChild(g);
  bars.forEach((b, i) => {
    const x = pad.l + band * i + band * 0.16;
    const w = band * 0.68;
    const y0 = Y(Math.max(b.from, b.to));
    const h = Math.max(1, Math.abs(Y(b.from) - Y(b.to)));
    root.appendChild(svg('rect', { x: f1(x), y: f1(y0), width: f1(w), height: f1(h), rx: 2, class: `ch-bar ${opts.animate ? 'anim-fade' : ''}`.trim(), style: st({ fill: b.s.color || (b.s.total ? C.c2 : C.c1), 'animation-delay': opts.animate ? `${i * 0.08}s` : '' }) }, [title(`${b.s.label}: ${money(b.s.total ? b.to : b.s.value, 2)}`)]));
    root.appendChild(axisText(x + w / 2, y0 - 5, b.s.total ? money(b.to, 2) : `+${money(b.s.value, 2)}`, 'middle', 'ch-vlabel'));
    if (i < bars.length - 1 && !steps[i + 1].total) root.appendChild(svg('line', { x1: f1(x + w), x2: f1(x + band), y1: f1(Y(b.s.total ? b.to : b.to)), y2: f1(Y(b.s.total ? b.to : b.to)), class: 'ch-grid' }));
    const words = b.s.label.split(' ');
    const l1 = [];
    let cur = '';
    for (const wd of words) { if ((cur + ' ' + wd).trim().length > 15) { l1.push(cur.trim()); cur = wd; } else cur += ` ${wd}`; }
    l1.push(cur.trim());
    l1.slice(0, 3).forEach((t, k) => root.appendChild(axisText(x + w / 2, H - pad.b + 16 + k * 13, t)));
  });
  return root;
}

/* ------------------------------------------------------------ bell curve */

/** Normal curve N(mean, sigma) with the area ≤ target shaded. opts: { xFormat, label, marks:[{x,label}] } */
export function bellCurve(mean, sigma, target, opts = {}) {
  const s = Math.max(1e-6, sigma);
  const pdf = (x) => Math.exp(-0.5 * ((x - mean) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const lo = mean - 4 * s;
  const hi = mean + 4 * s;
  const curve = [];
  const shade = [];
  for (let k = 0; k <= 160; k++) {
    const x = lo + ((hi - lo) * k) / 160;
    curve.push([x, pdf(x)]);
    if (x <= target) shade.push([x, pdf(x)]);
  }
  if (target > lo && target < hi) shade.push([target, pdf(target)]);
  return lineChart({
    width: opts.width || 880, height: opts.height || 250, label: opts.label || 'Normal distribution of the finish date',
    series: [
      { label: `P(finish ≤ target)`, points: shade.length ? shade : [[lo, 0]], color: C.good, area: true, areaOpacity: 0.3, line: false },
      { label: 'Probability density', points: curve, color: C.c2, width: 2.4 },
    ],
    xDomain: [lo, hi], yDomain: [0, pdf(mean) * 1.08], yExact: true, yFormat: () => '', xTicks: opts.xTicks,
    xFormat: opts.xFormat, vlines: [{ x: mean, label: 'μ', color: C.brass }, { x: target, label: opts.targetLabel || 'Target', color: C.good, dash: '' }, ...(opts.vlines || [])],
    pad: { l: 18 }, animate: opts.animate,
  });
}

/* -------------------------------------------------------------- gauges */

/** Thin stacked meter (HTML): parts [{ value, color, label }] of total. */
export function meter(parts, total, { label = '', height = 12 } = {}) {
  const sum = total || parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return el('div', { class: 'meter', style: { height: `${height}px` }, role: 'img', 'aria-label': label || parts.map((p) => p.label).join(', ') },
    parts.map((p) => el('i', { title: p.label, style: { width: `${Math.max(0, (p.value / sum) * 100)}%`, background: p.color } })));
}

/* ------------------------------------------------- panel layout helpers */

/** Section heading used by every PM panel. */
export function section(text, sub = null) {
  return el('h3', { class: 'section' }, [el('span', { text }), sub ? el('small', { class: 'sec-sub', text: sub }) : null]);
}

/** Content card with an optional heading and right-hand extras. */
export function card(heading, children, { cls = '', extra = null, sub = null } = {}) {
  return el('section', { class: `pm-card ${cls}`.trim() }, [
    heading ? el('header', { class: 'pm-card-head' }, [el('div', {}, [el('h4', { text: heading }), sub ? el('div', { class: 'pm-card-sub', text: sub }) : null]), extra]) : null,
    ...[].concat(children),
  ]);
}

/** Case-study hook card that jumps to the Case Studies panel. */
export function hookCard(dash, { kicker = 'Case study', title: heading, text, cta = 'Open the case' }) {
  return el('aside', { class: 'hook-card' }, [
    el('div', { class: 'hook-kicker', text: kicker }),
    el('h4', { text: heading }),
    el('p', { text }),
    el('button', { type: 'button', class: 'action ghost small', onclick: () => { if (dash.sim.openPanel) dash.sim.openPanel('cases'); else dash.open('cases'); } }, [el('span', { text: `${cta} →` })]),
  ]);
}

/** Returns true the first time a key is seen for this panel (so entry animations play once, not on every live refresh). */
export function animOnce(dash, key) {
  const s = dash.state;
  if (!s.__anim) s.__anim = new Set();
  if (s.__anim.has(key)) return false;
  s.__anim.add(key);
  return !document.body.classList.contains('reduced-motion');
}

/** Labelled definition list: [[term, value], …]. */
export function dl(rows, cls = '') {
  return el('dl', { class: `pm-dl ${cls}`.trim() }, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, [v instanceof Node ? v : String(v)])]));
}
