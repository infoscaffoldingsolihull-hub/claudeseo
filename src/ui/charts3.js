import { el, svg } from './dom.js';
import { frame, C } from './charts.js';

/**
 * Hand-written SVG helpers for the course panels (procurement, team,
 * stakeholders, closing, present): contract risk-sharing bars, org chart,
 * Tuckman curve, power/interest grid, salience Venn, engagement matrix,
 * communication-channel network, score rings and a tiny Markdown renderer.
 * Colours come from CSS variables so body.cb-safe re-colours everything.
 */

const f1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const tip = (t) => (t ? svg('title', { text: String(t) }) : null);
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1).trimEnd()}…` : String(s));

/** Plain-language trim of a long stakeholder role: "Sponsor — airport owner (PAA)" → "Sponsor". */
export function shortRole(role) {
  return String(role).split(/\s[—–-]\s|\(/)[0].trim();
}

/* ------------------------------------------------ contract risk sharing */

/**
 * Who carries a cost overrun, per contract type. rows: [{ type, label, buyer 0..1, fee, note }].
 * Stacked horizontal bar: seller share (ajrak) vs buyer share (indigo); a diamond marks the fee style.
 */
export function riskShareChart(rows, { selected = null, onSelect = null, width = 760 } = {}) {
  const rowH = 46;
  const H = 40 + rows.length * rowH;
  const padL = 214;
  const padR = 20;
  const root = frame(width, H, 'Contract types: who bears cost risk');
  const bw = width - padL - padR;
  root.appendChild(svg('text', { x: padL, y: 16, class: 'ch-axlabel', text: 'Seller carries the overrun' }));
  root.appendChild(svg('text', { x: width - padR, y: 16, class: 'ch-axlabel', 'text-anchor': 'end', text: 'Buyer carries the overrun' }));
  rows.forEach((r, i) => {
    const y = 28 + i * rowH;
    const sellerW = (1 - r.buyer) * bw;
    const on = selected === r.type;
    const g = svg('g', {
      class: `rs-row ${onSelect ? 'clickable' : ''} ${on ? 'on' : ''}`.trim(),
      tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null, 'aria-label': `${r.type}: buyer carries ${Math.round(r.buyer * 100)} % of an overrun`,
      onclick: onSelect ? () => onSelect(r.type) : null,
      onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.type); } } : null,
    });
    if (on) g.appendChild(svg('rect', { x: 2, y: y - 6, width: width - 4, height: rowH - 4, rx: 8, class: 'rs-hl' }));
    g.appendChild(svg('text', { x: 10, y: y + 15, class: 'rs-type', text: r.type }));
    g.appendChild(svg('text', { x: 10, y: y + 29, class: 'rs-name', text: short(r.label, 30) }));
    g.appendChild(svg('rect', { x: padL, y, width: f1(sellerW), height: 24, class: 'rs-seller' }, [tip(`Seller bears ${Math.round((1 - r.buyer) * 100)} % of any overrun`)]));
    g.appendChild(svg('rect', { x: f1(padL + sellerW), y, width: f1(bw - sellerW), height: 24, class: 'rs-buyer' }, [tip(`Buyer bears ${Math.round(r.buyer * 100)} % of any overrun`)]));
    if (sellerW > 36) g.appendChild(svg('text', { x: padL + sellerW / 2, y: y + 16, 'text-anchor': 'middle', class: 'rs-pct', text: `${Math.round((1 - r.buyer) * 100)} %` }));
    if (r.buyer > 0.06) g.appendChild(svg('text', { x: padL + sellerW + (bw - sellerW) / 2, y: y + 16, 'text-anchor': 'middle', class: 'rs-pct', text: `${Math.round(r.buyer * 100)} %` }));
    g.appendChild(svg('text', { x: padL, y: y + 38, class: 'rs-fee', text: r.fee }));
    root.appendChild(g);
  });
  return root;
}

/* ----------------------------------------------------------- org chart */

/**
 * Left-to-right tidy tree (root on the left, leaves stacked). nodes: [{ id, parent|null, label, sub,
 * kind: 'internal'|'external'|'group'|'role', load 0..1, dotted }]. Parents centre on their children.
 */
export function orgChart(nodes, { width = 900, onSelect = null, selected = null } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, { ...n, kids: [] }]));
  let rootNode = null;
  for (const n of byId.values()) {
    if (n.parent && byId.has(n.parent)) byId.get(n.parent).kids.push(n);
    else if (!n.parent) rootNode = n;
  }
  let leaves = 0;
  const place = (n, depth) => {
    n.depth = depth;
    if (!n.kids.length) { n.slot = leaves; leaves += 1; return; }
    n.kids.forEach((k) => place(k, depth + 1));
    n.slot = (n.kids[0].slot + n.kids[n.kids.length - 1].slot) / 2;
  };
  place(rootNode, 0);
  const maxDepth = Math.max(...[...byId.values()].map((n) => n.depth));
  const rowH = 40;
  const H = 16 + leaves * rowH;
  const colW = (width - 20) / (maxDepth + 1);
  const nodeW = Math.min(212, colW - 26);
  const root = frame(width, H, 'Project organisation chart');
  const X = (n) => 10 + n.depth * colW;
  const Y = (n) => 8 + n.slot * rowH;
  for (const n of byId.values()) {
    for (const k of n.kids) {
      const x1 = X(n) + nodeW; const y1 = Y(n) + 17; const x2 = X(k); const y2 = Y(k) + 17;
      const mid = x1 + (x2 - x1) / 2;
      root.appendChild(svg('path', { d: `M${f1(x1)} ${f1(y1)}H${f1(mid)}V${f1(y2)}H${f1(x2)}`, class: `org-link ${k.dotted ? 'dotted' : ''}` }));
    }
  }
  for (const n of byId.values()) {
    const x = X(n); const y = Y(n);
    const on = selected === n.id;
    const g = svg('g', {
      class: `org-node ${n.kind || 'role'} ${on ? 'on' : ''} ${onSelect ? 'clickable' : ''}`.trim(),
      tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null, 'aria-label': n.label,
      onclick: onSelect ? () => onSelect(n.id) : null,
      onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } } : null,
    }, [tip(`${n.label}${n.sub ? ` — ${n.sub}` : ''}`)]);
    g.appendChild(svg('rect', { x: f1(x), y, width: f1(nodeW), height: 34, rx: 8, class: 'org-box' }));
    if (n.load !== undefined && n.load !== null) {
      g.appendChild(svg('rect', { x: f1(x + 8), y: y + 29, width: f1((nodeW - 16) * Math.min(1, n.load)), height: 2.6, rx: 1.3, class: 'org-load' }));
    }
    const max = Math.floor(nodeW / 6.1);
    g.appendChild(svg('text', { x: f1(x + 10), y: y + (n.sub ? 14 : 21), class: 'org-t', text: short(n.label, max) }));
    if (n.sub) g.appendChild(svg('text', { x: f1(x + 10), y: y + 25, class: 'org-s', text: short(n.sub, Math.floor(nodeW / 5.3)) }));
    root.appendChild(g);
  }
  return root;
}

/* -------------------------------------------------------------- Tuckman */

export const TUCKMAN = [
  { id: 'forming', name: 'Forming', text: 'Polite and uncertain. People look to the project manager for direction; roles and goals are being learned.' },
  { id: 'storming', name: 'Storming', text: 'Competing ideas and friction over roles, priorities and methods. Unresolved conflict stalls the team here.' },
  { id: 'norming', name: 'Norming', text: 'Working agreements form. Trust grows, feedback is accepted and the team starts to self-organise.' },
  { id: 'performing', name: 'Performing', text: 'High trust and autonomy. The team solves problems without escalation and delivers at its best.' },
  { id: 'adjourning', name: 'Adjourning', text: 'Work completes and the team disbands. Recognise contributions, hand over knowledge and release people.' },
];

/** Tuckman curve (performance vs time) with the current stage lit. `stage` is an index 0-4, `progress` 0..1 inside the stage. */
export function tuckmanChart(stage, progress = 0.5, { width = 760 } = {}) {
  const H = 210;
  const padL = 36; const padR = 24; const padT = 24; const padB = 56;
  const w = width - padL - padR;
  const h = H - padT - padB;
  const root = frame(width, H, `Tuckman team development: ${TUCKMAN[stage].name}`);
  const pts = [[0, 0.18], [0.12, 0.3], [0.22, 0.22], [0.34, 0.12], [0.5, 0.45], [0.62, 0.62], [0.74, 0.86], [0.88, 0.9], [0.94, 0.55], [1, 0.2]];
  const sx = (t) => padL + t * w;
  const sy = (v) => padT + (1 - v) * h;
  // smooth path
  const P = pts.map(([t, v]) => [sx(t), sy(v)]);
  let d = `M${f1(P[0][0])} ${f1(P[0][1])}`;
  for (let i = 1; i < P.length; i++) {
    const [x0, y0] = P[i - 1]; const [x1, y1] = P[i]; const cx = (x0 + x1) / 2;
    d += `C${f1(cx)} ${f1(y0)} ${f1(cx)} ${f1(y1)} ${f1(x1)} ${f1(y1)}`;
  }
  const bounds = [0, 0.22, 0.5, 0.88, 1];
  TUCKMAN.forEach((s, i) => {
    const x0 = sx(bounds[i]); const x1 = sx(bounds[i + 1] === undefined ? 1 : bounds[i + 1]);
    const on = i === stage;
    root.appendChild(svg('rect', { x: f1(x0), y: padT - 8, width: f1(x1 - x0), height: h + 16, class: `tk-band ${on ? 'on' : ''}` }, [tip(`${s.name}: ${s.text}`)]));
    root.appendChild(svg('text', { x: f1((x0 + x1) / 2), y: H - 34, 'text-anchor': 'middle', class: `tk-name ${on ? 'on' : ''}`, text: s.name }));
    root.appendChild(svg('text', { x: f1((x0 + x1) / 2), y: H - 18, 'text-anchor': 'middle', class: 'tk-sub', text: ['Orient', 'Conflict', 'Cohere', 'Deliver', 'Release'][i] }));
  });
  root.appendChild(svg('path', { d, class: 'tk-curve' }));
  const t0 = bounds[stage]; const t1 = bounds[stage + 1] === undefined ? 1 : bounds[stage + 1];
  const t = t0 + (t1 - t0) * Math.max(0.05, Math.min(0.95, progress));
  // find y on the polyline at t
  let yv = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) { const a = pts[i - 1]; const b = pts[i]; yv = a[1] + (b[1] - a[1]) * ((t - a[0]) / ((b[0] - a[0]) || 1)); break; }
  }
  root.appendChild(svg('circle', { cx: f1(sx(t)), cy: f1(sy(yv)), r: 9, class: 'tk-now-halo' }));
  root.appendChild(svg('circle', { cx: f1(sx(t)), cy: f1(sy(yv)), r: 5.5, class: 'tk-now' }, [tip('The team is here')]));
  root.appendChild(svg('text', { x: padL - 6, y: padT + 4, 'text-anchor': 'end', class: 'ch-axlabel', text: 'Perf.' }));
  return root;
}

/* ----------------------------------------------- power / interest grid */

const QUAD_COLORS = { 'Manage closely': C.bad, 'Keep satisfied': C.warn, 'Keep informed': C.c2, Monitor: C.muted };

/** Mendelow grid. items: [{ id, label, power, interest, gap, quadrant }]; dots coloured by engagement gap. */
export function powerInterestGrid(items, { selected = null, onSelect = null, width = 520, height = 420 } = {}) {
  const pad = { l: 46, r: 14, t: 16, b: 38 };
  const root = frame(width, height, 'Stakeholder power / interest grid');
  const w = width - pad.l - pad.r; const h = height - pad.t - pad.b;
  const X = (v) => pad.l + v * w; const Y = (v) => pad.t + (1 - v) * h;
  const quad = [
    ['Keep satisfied', 0, 0.5, 0.5, 1], ['Manage closely', 0.5, 0.5, 1, 1],
    ['Monitor', 0, 0, 0.5, 0.5], ['Keep informed', 0.5, 0, 1, 0.5],
  ];
  for (const [name, x0, y0, x1, y1] of quad) {
    root.appendChild(svg('rect', { x: f1(X(x0)), y: f1(Y(y1)), width: f1(X(x1) - X(x0)), height: f1(Y(y0) - Y(y1)), class: 'pi-quad', style: `fill:${QUAD_COLORS[name]};opacity:.07` }));
    root.appendChild(svg('text', { x: f1(X(x0) + 8), y: f1(Y(y1) + 16), class: 'pi-qlabel', text: name }));
  }
  root.appendChild(svg('line', { x1: X(0.5), x2: X(0.5), y1: pad.t, y2: height - pad.b, class: 'ch-axis' }));
  root.appendChild(svg('line', { x1: pad.l, x2: width - pad.r, y1: Y(0.5), y2: Y(0.5), class: 'ch-axis' }));
  root.appendChild(svg('rect', { x: pad.l, y: pad.t, width: w, height: h, fill: 'none', class: 'ch-axis' }));
  root.appendChild(svg('text', { x: pad.l + w / 2, y: height - 6, 'text-anchor': 'middle', class: 'ch-axlabel', text: 'Interest →' }));
  root.appendChild(svg('text', { x: 12, y: pad.t + h / 2, 'text-anchor': 'middle', class: 'ch-axlabel', transform: `rotate(-90 12 ${pad.t + h / 2})`, text: 'Power →' }));
  // simple repulsion so overlapping dots stay readable
  const placed = items.map((it) => ({ ...it, x: X(it.interest), y: Y(it.power) }));
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]; const b = placed[j];
        const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.hypot(dx, dy) || 0.01;
        if (dist < 21) { const push = (21 - dist) / 2; a.x -= (dx / dist) * push; a.y -= (dy / dist) * push; b.x += (dx / dist) * push; b.y += (dy / dist) * push; }
      }
    }
    for (const p of placed) { p.x = Math.max(pad.l + 11, Math.min(width - pad.r - 11, p.x)); p.y = Math.max(pad.t + 11, Math.min(height - pad.b - 11, p.y)); }
  }
  for (const p of placed) {
    const cls = p.gap >= 2 ? 'big' : p.gap === 1 ? 'one' : 'ok';
    const g = svg('g', {
      class: `pi-dot ${cls} ${selected === p.id ? 'on' : ''} ${onSelect ? 'clickable' : ''}`.trim(),
      tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null, 'aria-label': `${p.label}: ${p.quadrant}`,
      onclick: onSelect ? () => onSelect(p.id) : null,
      onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } } : null,
    }, [tip(`${p.id} ${p.label}\nPower ${Math.round(p.power * 100)} · Interest ${Math.round(p.interest * 100)}\n${p.quadrant}${p.gap > 0 ? ` · engagement gap ${p.gap}` : ''}`)]);
    g.appendChild(svg('circle', { cx: f1(p.x), cy: f1(p.y), r: 10, class: 'pi-c' }));
    g.appendChild(svg('text', { x: f1(p.x), y: f1(p.y + 3.6), 'text-anchor': 'middle', class: 'pi-id', text: p.id.replace('S', '') }));
    root.appendChild(g);
  }
  return root;
}

/* ------------------------------------------------------- salience Venn */

const VENN_SPOTS = {
  Dormant: [0.28, 0.2], Discretionary: [0.72, 0.2], Demanding: [0.5, 0.88],
  Dominant: [0.5, 0.18], Dangerous: [0.25, 0.56], Dependent: [0.75, 0.56], Definitive: [0.5, 0.46],
};

/** Mitchell-Agle-Wood salience diagram. groups: { Dormant:[ids], … }. */
export function salienceVenn(groups, { width = 480, height = 400, onSelect = null, selected = null } = {}) {
  const root = frame(width, height, 'Stakeholder salience: power, legitimacy and urgency');
  const R = Math.min(width, height) * 0.285;
  const cs = [
    { cx: width * 0.38, cy: height * 0.36, name: 'Power', cls: 'p' },
    { cx: width * 0.62, cy: height * 0.36, name: 'Legitimacy', cls: 'l' },
    { cx: width * 0.5, cy: height * 0.6, name: 'Urgency', cls: 'u' },
  ];
  for (const c of cs) root.appendChild(svg('circle', { cx: f1(c.cx), cy: f1(c.cy), r: R, class: `sv-circle ${c.cls}` }));
  root.appendChild(svg('text', { x: f1(cs[0].cx - R * 0.62), y: f1(cs[0].cy - R * 0.62), class: 'sv-title', text: 'POWER' }));
  root.appendChild(svg('text', { x: f1(cs[1].cx + R * 0.62), y: f1(cs[1].cy - R * 0.62), 'text-anchor': 'end', class: 'sv-title', text: 'LEGITIMACY' }));
  root.appendChild(svg('text', { x: f1(cs[2].cx), y: f1(cs[2].cy + R + 14), 'text-anchor': 'middle', class: 'sv-title', text: 'URGENCY' }));
  const pos = {
    Dormant: [cs[0].cx - R * 0.55, cs[0].cy - R * 0.1], Discretionary: [cs[1].cx + R * 0.55, cs[1].cy - R * 0.1], Demanding: [cs[2].cx, cs[2].cy + R * 0.55],
    Dominant: [width * 0.5, cs[0].cy - R * 0.3], Dangerous: [cs[0].cx - R * 0.15, cs[2].cy - R * 0.1], Dependent: [cs[1].cx + R * 0.15, cs[2].cy - R * 0.1],
    Definitive: [width * 0.5, (cs[0].cy + cs[2].cy) / 2 - R * 0.05],
  };
  for (const [name, [x, y]] of Object.entries(pos)) {
    const ids = groups[name] || [];
    root.appendChild(svg('text', { x: f1(x), y: f1(y - 8), 'text-anchor': 'middle', class: 'sv-name', text: name }));
    const cols = Math.min(4, Math.max(1, ids.length));
    ids.forEach((id, i) => {
      const cx = x + ((i % cols) - (cols - 1) / 2) * 17;
      const cy = y + 6 + Math.floor(i / cols) * 17;
      root.appendChild(svg('g', {
        class: `sv-dot ${selected === id ? 'on' : ''} ${onSelect ? 'clickable' : ''}`.trim(), tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null,
        onclick: onSelect ? () => onSelect(id) : null,
        onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } } : null,
      }, [tip(`${id} — ${name}`), svg('circle', { cx: f1(cx), cy: f1(cy), r: 8 }), svg('text', { x: f1(cx), y: f1(cy + 3.2), 'text-anchor': 'middle', text: id.replace('S', '') })]));
    });
  }
  return root;
}

/* ------------------------------------------- engagement assessment matrix */

export const ENGAGEMENT = ['Unaware', 'Resistant', 'Neutral', 'Supportive', 'Leading'];

/** rows: [{ id, label, current, desired }]. C = current, D = desired. */
export function engagementMatrix(rows, { width = 860, onSelect = null, selected = null } = {}) {
  const rowH = 27; const padL = 238; const padT = 40; const padR = 16;
  const H = padT + rows.length * rowH + 12;
  const root = frame(width, H, 'Stakeholder engagement assessment matrix');
  const colW = (width - padL - padR) / 5;
  ENGAGEMENT.forEach((name, i) => {
    root.appendChild(svg('text', { x: f1(padL + colW * (i + 0.5)), y: 24, 'text-anchor': 'middle', class: 'ch-axlabel', text: name }));
    root.appendChild(svg('line', { x1: f1(padL + colW * i), x2: f1(padL + colW * i), y1: 32, y2: H - 8, class: 'ch-grid' }));
  });
  root.appendChild(svg('line', { x1: f1(padL + colW * 5), x2: f1(padL + colW * 5), y1: 32, y2: H - 8, class: 'ch-grid' }));
  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    const on = selected === r.id;
    const g = svg('g', {
      class: `em-row ${on ? 'on' : ''} ${onSelect ? 'clickable' : ''}`.trim(), tabindex: onSelect ? 0 : null, role: onSelect ? 'button' : null, 'aria-label': `${r.label}: current ${ENGAGEMENT[r.current - 1]}, desired ${ENGAGEMENT[r.desired - 1]}`,
      onclick: onSelect ? () => onSelect(r.id) : null,
      onkeydown: onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } } : null,
    });
    g.appendChild(svg('rect', { x: 2, y: y - 2, width: width - 4, height: rowH - 2, rx: 6, class: 'em-hl' }));
    g.appendChild(svg('text', { x: 8, y: y + 15, class: 'em-label', text: `${r.id} ${short(r.label, 34)}` }));
    const cx = padL + colW * (r.current - 0.5); const dx = padL + colW * (r.desired - 0.5);
    if (r.desired !== r.current) {
      g.appendChild(svg('line', { x1: f1(cx), x2: f1(dx), y1: y + 11, y2: y + 11, class: `em-arrow ${r.desired > r.current ? 'gap' : 'over'}` }));
    }
    g.appendChild(svg('rect', { x: f1(dx - 11), y: y + 1, width: 22, height: 20, rx: 5, class: 'em-d' }, [tip(`Desired: ${ENGAGEMENT[r.desired - 1]}`)]));
    g.appendChild(svg('text', { x: f1(dx), y: y + 15.5, 'text-anchor': 'middle', class: 'em-dt', text: 'D' }));
    g.appendChild(svg('rect', { x: f1(cx - 11), y: y + 1, width: 22, height: 20, rx: 5, class: `em-c ${r.current >= r.desired ? 'met' : 'short'}` }, [tip(`Current: ${ENGAGEMENT[r.current - 1]}`)]));
    g.appendChild(svg('text', { x: f1(cx), y: y + 15.5, 'text-anchor': 'middle', class: 'em-ct', text: 'C' }));
    root.appendChild(g);
  });
  return root;
}

/* --------------------------------------------- communication channels */

/** n nodes on a circle with every pairwise channel drawn. */
export function channelNetwork(n, { size = 320, highlight = 1 } = {}) {
  const count = Math.max(2, Math.min(40, n));
  const root = frame(size, size, `${count} people have ${(count * (count - 1)) / 2} communication channels`);
  const r = size / 2 - 22; const c = size / 2;
  const pos = Array.from({ length: count }, (_, i) => { const a = (i / count) * Math.PI * 2 - Math.PI / 2; return [c + r * Math.cos(a), c + r * Math.sin(a)]; });
  const g = svg('g', { class: 'cn-edges' });
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      g.appendChild(svg('line', { x1: f1(pos[i][0]), y1: f1(pos[i][1]), x2: f1(pos[j][0]), y2: f1(pos[j][1]), class: `cn-edge ${j === count - 1 && highlight ? 'new' : ''}`, style: `opacity:${Math.max(0.12, Math.min(0.7, 14 / count))}` }));
    }
  }
  root.appendChild(g);
  pos.forEach(([x, y], i) => root.appendChild(svg('circle', { cx: f1(x), cy: f1(y), r: count > 24 ? 3.5 : count > 14 ? 5 : 7, class: `cn-node ${i === count - 1 && highlight ? 'new' : ''}` })));
  root.appendChild(svg('text', { x: c, y: c - 2, 'text-anchor': 'middle', class: 'cn-big', text: String((count * (count - 1)) / 2) }));
  root.appendChild(svg('text', { x: c, y: c + 15, 'text-anchor': 'middle', class: 'cn-small', text: `channels · n = ${count}` }));
  return root;
}

/* --------------------------------------------------------- score ring */

export function scoreRing(value, label, { size = 112, color = 'var(--brass)', display = null } = {}) {
  const r = size / 2 - 9; const c = size / 2; const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const root = svg('svg', { class: 'score-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${label}: ${display || Math.round(v * 100)}` }, [
    svg('circle', { cx: c, cy: c, r, class: 'sr-track' }),
    svg('circle', { cx: c, cy: c, r, class: 'sr-bar', style: `stroke:${color};stroke-dasharray:${f1(circ * v)} ${f1(circ)}`, transform: `rotate(-90 ${c} ${c})` }),
    svg('text', { x: c, y: c + 2, 'text-anchor': 'middle', class: 'sr-val', text: display || String(Math.round(v * 100)) }),
    svg('text', { x: c, y: c + 18, 'text-anchor': 'middle', class: 'sr-lab', text: short(label, 16) }),
  ]);
  return root;
}

/* ------------------------------------------------------- tiny Markdown */

const esc = (s) => String(s);

function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(el('strong', { text: tok.slice(2, -2) }));
    else if (tok.startsWith('`')) out.push(el('code', { text: tok.slice(1, -1) }));
    else out.push(el('em', { text: tok.slice(1, -1) }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render headings, paragraphs, bullet lists and pipe tables from the MEHRAN status report. */
export function renderMarkdown(md) {
  const root = el('div', { class: 'md' });
  const lines = String(md || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i += 1; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln);
    if (h) { root.appendChild(el(`h${Math.min(5, h[1].length + 1)}`, {}, inline(esc(h[2])))); i += 1; continue; }
    if (/^\|/.test(ln)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !/^\|\s*:?-{2,}/.test(r)).map(cells);
      root.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data dense' }, [
        el('thead', {}, [el('tr', {}, head.map((c) => el('th', {}, inline(c))))]),
        el('tbody', {}, body.map((r) => el('tr', {}, r.map((c) => el('td', {}, inline(c)))))),
      ])]));
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i += 1; }
      root.appendChild(el('ul', {}, items.map((t) => el('li', {}, inline(t)))));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i += 1; }
      root.appendChild(el('ol', {}, items.map((t) => el('li', {}, inline(t)))));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) { para.push(lines[i]); i += 1; }
    root.appendChild(el('p', {}, inline(para.join(' '))));
  }
  return root;
}

/* ---------------------------------------------------- misc small helpers */

/** localStorage with guards (private windows / blocked storage). */
export const store = {
  get(key, fallback = null) {
    try { const v = window.localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

/** Print the given DOM node via the browser print dialog (print CSS shows only #print-sheet). */
export function printNode(node, title = 'Report') {
  const old = document.getElementById('print-sheet');
  if (old) old.remove();
  const sheet = el('div', { id: 'print-sheet', 'aria-hidden': 'true' }, [node]);
  document.body.appendChild(sheet);
  const prevTitle = document.title;
  document.title = title;
  document.body.classList.add('print-mode');
  const done = () => {
    document.body.classList.remove('print-mode');
    document.title = prevTitle;
    sheet.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => {
    try { window.print(); } catch { /* headless */ }
    // some browsers never fire afterprint when print() is a no-op
    setTimeout(() => { if (document.body.classList.contains('print-mode') && !window.__hddKeepPrint) done(); }, 1200);
  }, 60);
}

export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
