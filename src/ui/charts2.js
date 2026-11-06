import { el, svg } from './dom.js';

/**
 * Hand-written SVG / DOM helpers for the course panels (no chart library).
 *
 *  burndownChart · burnupChart · velocityChart  — agile flow charts
 *  gaugeChart · radarChart · bubbleMatrix · sparkline — comparison visuals
 *  chevronFlow — clickable process ribbon (focus areas, life cycle)
 *  kanbanBoard — column layout with drag-and-drop AND button moves (keyboard-safe)
 *
 * Colours come from CSS custom properties (`--c1…--c8`, `--good`, `--warn`, `--bad`
 * …) so `body.cb-safe` swaps the palette without re-rendering. Every mark has a
 * <title> tooltip. Motion is CSS-only and switched off by `body.reduced-motion`.
 */

export const K = {
  c1: 'var(--c1)', c2: 'var(--c2)', c3: 'var(--c3)', c4: 'var(--c4)', c5: 'var(--c5)', c6: 'var(--c6)', c7: 'var(--c7)',
  good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', ink: 'var(--ink)', muted: 'var(--muted)',
  faint: 'var(--faint)', brass: 'var(--brass)', indigo: 'var(--indigo-hi)',
};

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const tt = (text) => svg('title', { text: String(text) });

function root(W, H, label, cls = '') {
  return svg('svg', {
    class: `c2-chart ${cls}`.trim(), viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
    'aria-label': label || 'Chart', preserveAspectRatio: 'xMidYMid meet',
  }, [tt(label || 'Chart')]);
}

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function axes(g, { X0, X1, Y0, Y1, yMax, yTicks = 4, yFmt = (v) => String(Math.round(v)) }) {
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    const y = Y1 - ((Y1 - Y0) * i) / yTicks;
    g.appendChild(svg('line', { x1: X0, x2: X1, y1: r1(y), y2: r1(y), class: i === 0 ? 'c2-base' : 'c2-grid' }));
    g.appendChild(svg('text', { x: X0 - 6, y: r1(y + 3.5), 'text-anchor': 'end', class: 'c2-tick', text: yFmt(v) }));
  }
}

function polyline(points, cls, color, dash) {
  return svg('polyline', { points: points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' '), class: `c2-line ${cls || ''}`.trim(), style: `stroke:${color};${dash ? `stroke-dasharray:${dash};` : ''}` });
}

/* ------------------------------------------------------------ burndown */

/**
 * Sprint burndown: ideal vs actual remaining points.
 * points: [{ day, remaining|null, ideal }] (agileBurndown output), startDay for axis labels.
 */
export function burndownChart({ points = [], width = 640, height = 260, label = 'Sprint burndown', todayDay = null } = {}) {
  const W = width; const H = height; const P = { l: 46, r: 16, t: 14, b: 32 };
  const s = root(W, H, label);
  const n = Math.max(1, points.length - 1);
  const maxV = niceMax(Math.max(1, ...points.map((p) => Math.max(p.ideal || 0, p.remaining ?? 0))));
  const X = (i) => P.l + (i / n) * (W - P.l - P.r);
  const Y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const g = svg('g');
  axes(g, { X0: P.l, X1: W - P.r, Y0: P.t, Y1: H - P.b, yMax: maxV });
  points.forEach((p, i) => { if (i % Math.max(1, Math.round(n / 7)) === 0 || i === n) g.appendChild(svg('text', { x: r1(X(i)), y: H - P.b + 16, 'text-anchor': 'middle', class: 'c2-tick', text: `d${i}` })); });
  g.appendChild(svg('text', { x: W - P.r, y: H - 4, 'text-anchor': 'end', class: 'c2-tick', text: 'sprint day' }));
  s.appendChild(g);
  const ideal = points.map((p, i) => [X(i), Y(p.ideal || 0)]);
  s.appendChild(polyline(ideal, 'ideal', K.muted, '5 4'));
  const actual = points.map((p, i) => (p.remaining === null || p.remaining === undefined ? null : [X(i), Y(p.remaining), p, i])).filter(Boolean);
  if (actual.length > 1) {
    s.appendChild(svg('polygon', { points: [...actual.map(([x, y]) => `${r1(x)},${r1(y)}`), `${r1(actual[actual.length - 1][0])},${r1(H - P.b)}`, `${r1(actual[0][0])},${r1(H - P.b)}`].join(' '), class: 'c2-area', style: `fill:${K.c4}` }));
    s.appendChild(polyline(actual, 'actual', K.c4));
  }
  for (const [x, y, p, i] of actual) {
    const behind = p.remaining > (p.ideal || 0) + 0.5;
    s.appendChild(svg('circle', { cx: r1(x), cy: r1(y), r: 3.2, class: 'c2-dot', style: `fill:${behind ? K.warn : K.c4}` }, [tt(`Day ${i}: ${p.remaining} pts remaining (ideal ${(p.ideal || 0).toFixed(1)})`)]));
  }
  if (todayDay !== null && actual.length) {
    const last = actual[actual.length - 1];
    s.appendChild(svg('text', { x: r1(last[0]), y: r1(last[1] - 9), 'text-anchor': 'middle', class: 'c2-note', text: `${last[2].remaining} pts left` }));
  }
  return s;
}

/* ------------------------------------------------------------- burnup */

/** Release burn-up: cumulative done vs total scope, with a dashed velocity projection. */
export function burnupChart({ sprints = [], scope = 0, velocity = 0, plannedSprints = 0, width = 640, height = 260, label = 'Release burn-up' } = {}) {
  const W = width; const H = height; const P = { l: 52, r: 16, t: 14, b: 32 };
  const s = root(W, H, label);
  const remaining = Math.max(0, scope - (sprints.length ? sprints[sprints.length - 1].done : 0));
  const extra = velocity > 0 ? Math.min(30, Math.ceil(remaining / velocity)) : 0;
  const total = Math.max(sprints.length + extra, plannedSprints, 4);
  const maxV = niceMax(scope * 1.08 || 1);
  const X = (i) => P.l + (i / total) * (W - P.l - P.r);
  const Y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const g = svg('g');
  axes(g, { X0: P.l, X1: W - P.r, Y0: P.t, Y1: H - P.b, yMax: maxV, yFmt: (v) => String(Math.round(v)) });
  for (let i = 0; i <= total; i += Math.max(1, Math.ceil(total / 10))) g.appendChild(svg('text', { x: r1(X(i)), y: H - P.b + 16, 'text-anchor': 'middle', class: 'c2-tick', text: i === 0 ? '0' : `S${i}` }));
  s.appendChild(g);
  s.appendChild(polyline([[X(0), Y(scope)], [X(total), Y(scope)]], 'scope', K.c1));
  s.appendChild(svg('text', { x: W - P.r, y: r1(Y(scope) - 5), 'text-anchor': 'end', class: 'c2-note', text: `Scope ${scope} pts` }));
  if (plannedSprints > 0 && scope > 0) s.appendChild(polyline([[X(0), Y(0)], [X(plannedSprints), Y(scope)]], 'plan', K.muted, '5 4'));
  const done = [[X(0), Y(0)], ...sprints.map((p, i) => [X(i + 1), Y(p.done)])];
  if (done.length > 1) {
    s.appendChild(svg('polygon', { points: [...done.map(([x, y]) => `${r1(x)},${r1(y)}`), `${r1(done[done.length - 1][0])},${r1(H - P.b)}`, `${r1(done[0][0])},${r1(H - P.b)}`].join(' '), class: 'c2-area', style: `fill:${K.c4}` }));
    s.appendChild(polyline(done, 'done', K.c4));
  }
  sprints.forEach((p, i) => s.appendChild(svg('circle', { cx: r1(X(i + 1)), cy: r1(Y(p.done)), r: 3.2, class: 'c2-dot', style: `fill:${K.c4}` }, [tt(`Sprint ${p.sprint || i + 1}: ${p.done} of ${scope} points accepted`)])));
  if (extra > 0 && sprints.length) {
    const last = done[done.length - 1];
    const endI = sprints.length + extra;
    s.appendChild(polyline([last, [X(endI), Y(scope)]], 'forecast', K.c2, '3 4'));
    s.appendChild(svg('text', { x: r1(X(endI)), y: r1(Y(scope) + 15), 'text-anchor': 'end', class: 'c2-note', text: `Forecast: sprint ${endI} at ${velocity.toFixed(1)} pts/sprint` }));
  }
  return s;
}

/* ----------------------------------------------------------- velocity */

/** Velocity bars per sprint (committed outline vs completed fill) with 3-sprint average and planned velocity lines. */
export function velocityChart({ sprints = [], planned = 0, width = 640, height = 240, label = 'Velocity by sprint' } = {}) {
  const W = width; const H = height; const P = { l: 46, r: 16, t: 14, b: 32 };
  const s = root(W, H, label);
  const maxV = niceMax(Math.max(planned * 1.15, ...sprints.map((p) => Math.max(p.committed || 0, p.completed || 0)), 5));
  const n = Math.max(sprints.length, 4);
  const bw = (W - P.l - P.r) / n;
  const Y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const g = svg('g');
  axes(g, { X0: P.l, X1: W - P.r, Y0: P.t, Y1: H - P.b, yMax: maxV });
  s.appendChild(g);
  sprints.forEach((p, i) => {
    const x = P.l + i * bw + bw * 0.16; const w = bw * 0.68;
    s.appendChild(svg('rect', { x: r1(x), y: r1(Y(p.committed || 0)), width: r1(w), height: r1(H - P.b - Y(p.committed || 0)), class: 'c2-commit', rx: 3 }, [tt(`Sprint ${p.n} committed ${Math.round(p.committed || 0)} pts`)]));
    s.appendChild(svg('rect', { x: r1(x + w * 0.16), y: r1(Y(p.completed || 0)), width: r1(w * 0.68), height: r1(H - P.b - Y(p.completed || 0)), rx: 3, style: `fill:${(p.completed || 0) >= (p.committed || 0) * 0.9 ? K.c4 : K.warn}` }, [tt(`Sprint ${p.n} accepted ${p.completed} pts`)]));
    s.appendChild(svg('text', { x: r1(x + w / 2), y: H - P.b + 16, 'text-anchor': 'middle', class: 'c2-tick', text: `S${p.n}` }));
    s.appendChild(svg('text', { x: r1(x + w / 2), y: r1(Y(Math.max(p.completed || 0, p.committed || 0)) - 5), 'text-anchor': 'middle', class: 'c2-note', text: String(Math.round(p.completed || 0)) }));
  });
  if (planned > 0) {
    s.appendChild(polyline([[P.l, Y(planned)], [W - P.r, Y(planned)]], 'plan', K.c1, '5 4'));
    s.appendChild(svg('text', { x: W - P.r, y: r1(Y(planned) - 5), 'text-anchor': 'end', class: 'c2-note', text: `Plan ${planned.toFixed(1)}` }));
  }
  const avg = sprints.map((p, i) => {
    const w = sprints.slice(Math.max(0, i - 2), i + 1);
    return [P.l + i * bw + bw / 2, Y(w.reduce((a, b) => a + (b.completed || 0), 0) / w.length)];
  });
  if (avg.length > 1) s.appendChild(polyline(avg, 'avg', K.c2));
  return s;
}

/* ------------------------------------------------------------- gauge */

/** Semicircular gauge. zones: [{ to, color }] ascending (fractions of max). */
export function gaugeChart({ value = 0, max = 1, target = null, label = '', display = null, zones = null, width = 190, height = 120 } = {}) {
  const W = width; const H = height; const cx = W / 2; const cy = H - 22; const R = Math.min(W / 2 - 10, H - 30); const T = 12;
  const s = root(W, H, `${label}: ${display ?? value}`, 'c2-gauge');
  const ang = (f) => Math.PI * (1 - Math.max(0, Math.min(1, f)));
  const pt = (f, r) => [cx + r * Math.cos(ang(f)), cy - r * Math.sin(ang(f))];
  const arc = (f0, f1, color, cls) => {
    const [x0, y0] = pt(f0, R); const [x1, y1] = pt(f1, R); const [x2, y2] = pt(f1, R - T); const [x3, y3] = pt(f0, R - T);
    return svg('path', { d: `M${r1(x0)} ${r1(y0)} A${R} ${R} 0 0 1 ${r1(x1)} ${r1(y1)} L${r1(x2)} ${r1(y2)} A${R - T} ${R - T} 0 0 0 ${r1(x3)} ${r1(y3)}Z`, class: cls || '', style: color ? `fill:${color}` : '' });
  };
  s.appendChild(arc(0, 1, null, 'c2-gauge-bg'));
  const f = max ? value / max : 0;
  let color = K.c4;
  if (zones) { color = zones[zones.length - 1].color; for (const z of zones) if (f <= z.to) { color = z.color; break; } }
  if (f > 0.002) s.appendChild(arc(0, f, color, 'c2-gauge-fill'));
  if (target !== null && max) {
    const [x0, y0] = pt(target / max, R + 2); const [x1, y1] = pt(target / max, R - T - 2);
    s.appendChild(svg('line', { x1: r1(x0), y1: r1(y0), x2: r1(x1), y2: r1(y1), class: 'c2-target' }, [tt(`Business-case target ${target}`)]));
  }
  s.appendChild(svg('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'c2-gauge-val', text: String(display ?? Math.round(value)) }));
  s.appendChild(svg('text', { x: cx, y: H - 4, 'text-anchor': 'middle', class: 'c2-tick', text: label }));
  return s;
}

/* ------------------------------------------------------------- radar */

/** Radar chart. axes: [{ label, value 0..1, target? 0..1 }]. */
export function radarChart({ axes: ax = [], size = 300, label = 'Radar', fmt = (v) => `${Math.round(v * 100)}%` } = {}) {
  const W = size; const H = size; const cx = W / 2; const cy = H / 2 + 4; const R = size / 2 - 52; const n = ax.length || 1;
  const s = root(W, H, label, 'c2-radar');
  const at = (i, f) => [cx + R * f * Math.sin((2 * Math.PI * i) / n), cy - R * f * Math.cos((2 * Math.PI * i) / n)];
  for (const ring of [0.25, 0.5, 0.75, 1]) s.appendChild(svg('polygon', { points: ax.map((_, i) => at(i, ring).map(r1).join(',')).join(' '), class: 'c2-ring' }));
  ax.forEach((a, i) => {
    const [x, y] = at(i, 1);
    s.appendChild(svg('line', { x1: cx, y1: cy, x2: r1(x), y2: r1(y), class: 'c2-grid' }));
    const [lx, ly] = at(i, 1.2);
    s.appendChild(svg('text', { x: r1(lx), y: r1(ly + 3), 'text-anchor': Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end', class: 'c2-tick', text: a.label }));
  });
  if (ax.some((a) => a.target !== undefined)) s.appendChild(svg('polygon', { points: ax.map((a, i) => at(i, a.target ?? 0).map(r1).join(',')).join(' '), class: 'c2-radar-target' }));
  s.appendChild(svg('polygon', { points: ax.map((a, i) => at(i, Math.max(0.02, Math.min(1, a.value))).map(r1).join(',')).join(' '), class: 'c2-radar-fill' }));
  ax.forEach((a, i) => { const [x, y] = at(i, Math.max(0.02, Math.min(1, a.value))); s.appendChild(svg('circle', { cx: r1(x), cy: r1(y), r: 3.4, class: 'c2-radar-dot' }, [tt(`${a.label}: ${fmt(a.value)}${a.target !== undefined ? ` (target ${fmt(a.target)})` : ''}`)])); });
  return s;
}

/* ------------------------------------------------------ bubble matrix */

/**
 * 2-D bubble matrix (portfolio prioritisation). points: [{ id, label, x 0..1, y 0..1, r 0..1, color, mine }].
 * Quadrant labels: [topLeft, topRight, bottomLeft, bottomRight].
 */
export function bubbleMatrix({ points = [], xLabel = '', yLabel = '', quadrants = [], width = 560, height = 340, label = 'Matrix', onSelect = null } = {}) {
  const W = width; const H = height; const P = { l: 50, r: 16, t: 16, b: 38 };
  const s = root(W, H, label, 'c2-matrix');
  const X = (v) => P.l + v * (W - P.l - P.r);
  const Y = (v) => H - P.b - v * (H - P.t - P.b);
  s.appendChild(svg('rect', { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, class: 'c2-plot' }));
  s.appendChild(svg('line', { x1: X(0.5), x2: X(0.5), y1: P.t, y2: H - P.b, class: 'c2-grid' }));
  s.appendChild(svg('line', { x1: P.l, x2: W - P.r, y1: Y(0.5), y2: Y(0.5), class: 'c2-grid' }));
  const qpos = [[P.l + 8, P.t + 14, 'start'], [W - P.r - 8, P.t + 14, 'end'], [P.l + 8, H - P.b - 8, 'start'], [W - P.r - 8, H - P.b - 8, 'end']];
  quadrants.forEach((q, i) => s.appendChild(svg('text', { x: qpos[i][0], y: qpos[i][1], 'text-anchor': qpos[i][2], class: 'c2-quad', text: q })));
  s.appendChild(svg('text', { x: (P.l + W - P.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'c2-tick', text: xLabel }));
  s.appendChild(svg('text', { x: 12, y: (P.t + H - P.b) / 2, 'text-anchor': 'middle', class: 'c2-tick', transform: `rotate(-90 12 ${(P.t + H - P.b) / 2})`, text: yLabel }));
  const sorted = [...points].sort((a, b) => (b.r || 0) - (a.r || 0));
  for (const p of sorted) {
    const rad = 9 + (p.r || 0.4) * 17;
    const g = svg('g', { class: `c2-bubble ${p.mine ? 'mine' : ''}`, tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null, 'aria-label': p.label, onclick: onSelect ? () => onSelect(p) : null,
      onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); } } : null }, [
      tt(p.title || p.label),
      svg('circle', { cx: r1(X(p.x)), cy: r1(Y(p.y)), r: r1(rad), style: `fill:${p.color || K.c2}` }),
      svg('text', { x: r1(X(p.x)), y: r1(Y(p.y) + 3.5), 'text-anchor': 'middle', class: 'c2-bubble-t', text: p.short || p.id }),
    ]);
    s.appendChild(g);
  }
  return s;
}

/* --------------------------------------------------------- sparkline */

export function sparkline(values, { width = 120, height = 28, color = K.c2, label = 'Trend' } = {}) {
  const s = root(width, height, label, 'c2-spark');
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return s;
  const lo = Math.min(...v); const hi = Math.max(...v);
  s.appendChild(polyline(v.map((x, i) => [2 + (i / (v.length - 1)) * (width - 4), height - 3 - ((x - lo) / ((hi - lo) || 1)) * (height - 6)]), '', color));
  return s;
}

/* ------------------------------------------------------- chevron flow */

/**
 * Clickable process ribbon. steps: [{ id, label, sub, state: 'done'|'current'|'next'|'' , badge }].
 * Renders HTML buttons styled as chevrons (keyboard accessible, wraps on phones).
 */
export function chevronFlow(steps, activeId, onSelect) {
  return el('div', { class: 'c2-flow', role: 'tablist', 'aria-label': 'Process flow' }, steps.map((st, i) =>
    el('button', {
      type: 'button', role: 'tab', class: `c2-chev ${st.state || ''} ${st.id === activeId ? 'sel' : ''}`.trim(), 'aria-selected': st.id === activeId ? 'true' : 'false',
      style: { '--i': i }, title: st.title || st.label, onclick: () => onSelect && onSelect(st.id),
    }, [
      el('span', { class: 'c2-chev-n', text: String(i + 1) }),
      el('span', { class: 'c2-chev-t' }, [el('b', { text: st.label }), st.sub ? el('small', { text: st.sub }) : null]),
      st.badge ? el('em', { class: 'c2-chev-b', text: st.badge }) : null,
    ])));
}

/* ------------------------------------------------------------ kanban */

/**
 * Column board with drag-and-drop and per-card move buttons.
 * cfg: { columns:[{ id, label, wip? }], cards:[{ id, column, title, meta, tone, points }],
 *        canDrop?(card, toColumn) → string|null (reason it is blocked), onMove(cardId, toColumn) → {ok,message}, label }
 */
export function kanbanBoard(cfg) {
  const { columns, cards, onMove, label = 'Board' } = cfg;
  const board = el('div', { class: 'c2-board', role: 'group', 'aria-label': label, style: { '--cols': columns.length } });
  const status = el('div', { class: 'c2-board-status', role: 'status', 'aria-live': 'polite' });
  let dragging = null;
  const move = (id, to) => {
    const res = onMove ? onMove(id, to) : { ok: true };
    if (res && res.message) status.textContent = res.message;
    status.className = `c2-board-status ${res && res.ok === false ? 'bad' : 'good'}`;
    return res;
  };
  columns.forEach((col, ci) => {
    const list = cards.filter((c) => c.column === col.id);
    const over = col.wip !== undefined && list.length > col.wip;
    const full = col.wip !== undefined && list.length >= col.wip;
    const zone = el('div', { class: 'c2-col-body', 'data-col': col.id });
    zone.addEventListener('dragover', (e) => { if (dragging) { e.preventDefault(); zone.classList.add('over'); } });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (dragging) { const id = dragging; dragging = null; move(id, col.id); } });
    for (const c of list) {
      const prev = columns[ci - 1]; const next = columns[ci + 1];
      const card = el('div', { class: `c2-card ${c.tone || ''}`.trim(), draggable: c.locked ? null : 'true', 'data-id': c.id, title: c.title }, [
        el('div', { class: 'c2-card-top' }, [el('b', { text: c.id }), c.points !== undefined ? el('span', { class: 'c2-pts', text: `${c.points} pts` }) : null]),
        el('div', { class: 'c2-card-t', text: c.title }),
        c.meta ? el('div', { class: 'c2-card-m', text: c.meta }) : null,
        c.progress !== undefined ? el('div', { class: 'c2-card-bar' }, [el('i', { style: { width: `${Math.round(c.progress * 100)}%` } })]) : null,
        el('div', { class: 'c2-card-go' }, [
          prev ? el('button', { type: 'button', class: 'c2-mv', 'aria-label': `Move ${c.id} back to ${prev.label}`, title: `Back to ${prev.label}`, onclick: () => move(c.id, prev.id) }, ['←']) : null,
          next ? el('button', { type: 'button', class: 'c2-mv', 'aria-label': `Move ${c.id} forward to ${next.label}`, title: `Forward to ${next.label}`, onclick: () => move(c.id, next.id) }, ['→']) : null,
        ]),
      ]);
      card.addEventListener('dragstart', (e) => { dragging = c.id; card.classList.add('drag'); try { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ } });
      card.addEventListener('dragend', () => { card.classList.remove('drag'); dragging = null; });
      zone.appendChild(card);
    }
    if (!list.length) zone.appendChild(el('div', { class: 'c2-empty', text: 'Empty' }));
    board.appendChild(el('section', { class: `c2-col ${over ? 'over-wip' : full ? 'full' : ''}`.trim(), 'aria-label': col.label }, [
      el('header', { class: 'c2-col-head' }, [
        el('b', { text: col.label }),
        el('span', { class: 'c2-col-n', text: col.wip !== undefined ? `${list.length} / ${col.wip}` : String(list.length), title: col.wip !== undefined ? `WIP limit ${col.wip}` : 'No WIP limit' }),
      ]),
      zone,
    ]));
  });
  return el('div', { class: 'c2-board-wrap' }, [board, status]);
}
