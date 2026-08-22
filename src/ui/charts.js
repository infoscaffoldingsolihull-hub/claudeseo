import { svg, el, fmtNum } from './dom.js';

/**
 * Every chart the dashboard draws, in hand-written SVG.
 *
 * No charting library: an earned-value S-curve, a Gantt with the critical path
 * and its dependency arrows, an activity-on-node CPM diagram, a probability /
 * impact risk matrix, a resource histogram, statistical process-control charts,
 * the Monte Carlo distribution with its cumulative curve, a tornado sensitivity
 * plot, and the stakeholder power-interest grid.
 */

const COLORS = {
  pv: '#7ea6c9',
  ev: '#4e9a5a',
  ac: '#c1503c',
  eac: '#d4a92f',
  grid: 'rgba(236,224,198,0.09)',
  axis: 'rgba(236,224,198,0.24)',
  text: 'rgba(184,171,144,0.9)',
  critical: '#c1503c',
  normal: '#7e93a8',
  done: '#4e9a5a',
  gold: '#d4a92f',
  lapis: '#2f6fa8',
};

function axes(w, h, pad, xTicks, yTicks) {
  const g = svg('g', {});
  for (const t of yTicks) {
    const y = pad.t + (1 - t.v) * (h - pad.t - pad.b);
    g.appendChild(svg('line', { x1: pad.l, y1: y, x2: w - pad.r, y2: y, class: 'grid-line' }));
    g.appendChild(svg('text', { x: pad.l - 6, y: y + 3, 'text-anchor': 'end', text: t.label }));
  }
  for (const t of xTicks) {
    const x = pad.l + t.v * (w - pad.l - pad.r);
    g.appendChild(svg('line', { x1: x, y1: pad.t, x2: x, y2: h - pad.b, class: 'grid-line' }));
    g.appendChild(svg('text', { x, y: h - pad.b + 13, 'text-anchor': 'middle', text: t.label }));
  }
  g.appendChild(svg('line', { x1: pad.l, y1: h - pad.b, x2: w - pad.r, y2: h - pad.b, class: 'axis' }));
  g.appendChild(svg('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: h - pad.b, class: 'axis' }));
  return g;
}

function polyline(points, color, width = 2, dash = null) {
  return svg('polyline', {
    points: points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    'stroke-dasharray': dash,
  });
}

/* ------------------------------------------------------- EVM S-curve */

export function evmChart(project, { width = 800, height = 300 } = {}) {
  const pad = { l: 54, r: 16, t: 14, b: 26 };
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none' });
  const history = project.evmHistory;
  const horizon = Math.max(project.baselineDuration, project.forecastFinish || 0, project.day) * 1.02;
  const maxValue = Math.max(project.bac, project.eac.typical, project.ac) * 1.05;

  const X = (day) => pad.l + (day / horizon) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / maxValue) * (height - pad.t - pad.b);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: f, label: fmtNum(f * maxValue) }));
  const xTicks = [];
  const years = Math.ceil(horizon / 365);
  const stepYears = years > 12 ? 4 : years > 6 ? 2 : 1;
  for (let y = 0; y <= years; y += stepYears) xTicks.push({ v: (y * 365) / horizon, label: `yr ${y}` });
  root.appendChild(axes(width, height, pad, xTicks, yTicks));

  // Full baseline PV curve, sampled.
  const pvPts = [];
  for (let d = 0; d <= project.baselineDuration; d += Math.max(1, Math.round(project.baselineDuration / 220))) {
    pvPts.push([X(d), Y(project.plannedValueAt(d))]);
  }
  pvPts.push([X(project.baselineDuration), Y(project.bac)]);
  root.appendChild(polyline(pvPts, COLORS.pv, 2, '5 4'));

  if (history.length > 1) {
    root.appendChild(polyline(history.map((h) => [X(h.day), Y(h.ev)]), COLORS.ev, 2.4));
    root.appendChild(polyline(history.map((h) => [X(h.day), Y(h.ac)]), COLORS.ac, 2.4));
    // EAC projection from today to the forecast finish.
    const last = history[history.length - 1];
    root.appendChild(
      polyline(
        [
          [X(last.day), Y(last.ac)],
          [X(project.forecastFinish || project.baselineDuration), Y(project.eac.typical)],
        ],
        COLORS.eac,
        1.8,
        '3 4'
      )
    );
  }

  // BAC and today markers.
  root.appendChild(svg('line', { x1: pad.l, y1: Y(project.bac), x2: width - pad.r, y2: Y(project.bac), stroke: COLORS.gold, 'stroke-width': 1, 'stroke-dasharray': '2 5', opacity: 0.6 }));
  root.appendChild(svg('text', { x: width - pad.r - 2, y: Y(project.bac) - 5, 'text-anchor': 'end', fill: COLORS.gold, text: `BAC ${fmtNum(project.bac)}` }));
  root.appendChild(svg('line', { x1: X(project.day), y1: pad.t, x2: X(project.day), y2: height - pad.b, stroke: '#ece0c6', 'stroke-width': 1, opacity: 0.5 }));
  root.appendChild(svg('text', { x: X(project.day) + 4, y: pad.t + 10, fill: '#ece0c6', text: 'today' }));
  return root;
}

export function evmLegend() {
  return el('div', { class: 'legend' }, [
    el('span', { html: `<i style="background:${COLORS.pv}"></i>PV — planned value` }),
    el('span', { html: `<i style="background:${COLORS.ev}"></i>EV — earned value` }),
    el('span', { html: `<i style="background:${COLORS.ac}"></i>AC — actual cost` }),
    el('span', { html: `<i style="background:${COLORS.eac}"></i>EAC projection` }),
  ]);
}

/* ------------------------------------------------------------- Gantt */

export function ganttChart(project, { rowHeight = 19, labelWidth = 250 } = {}) {
  const tasks = project.tasks;
  const horizon = Math.max(project.baselineDuration, project.forecastFinish || 0, project.day) * 1.02;
  const width = Math.max(900, labelWidth + 620);
  const height = tasks.length * rowHeight + 44;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height });
  const X = (d) => labelWidth + (d / horizon) * (width - labelWidth - 16);

  // Year grid.
  const years = Math.ceil(horizon / 365);
  for (let y = 0; y <= years; y++) {
    const x = X(y * 365);
    root.appendChild(svg('line', { x1: x, y1: 20, x2: x, y2: height - 8, class: 'grid-line' }));
    root.appendChild(svg('text', { x, y: 13, 'text-anchor': 'middle', text: `yr ${y}` }));
  }

  tasks.forEach((task, i) => {
    const y = 26 + i * rowHeight;
    const base = project.baseline.nodes.get(task.id);
    const st = project.state.get(task.id);
    const critical = base.critical;

    root.appendChild(
      svg('text', {
        x: 4, y: y + rowHeight * 0.62, text: `${task.code}  ${task.name}`,
        fill: critical ? COLORS.critical : COLORS.text,
        'font-size': 10,
      })
    );
    // Baseline bar.
    root.appendChild(
      svg('rect', {
        x: X(base.es), y: y + 3, width: Math.max(2, X(base.ef) - X(base.es)), height: rowHeight - 9,
        rx: 2, fill: critical ? 'rgba(193,80,60,0.30)' : 'rgba(126,147,168,0.26)',
        stroke: critical ? 'rgba(193,80,60,0.7)' : 'rgba(126,147,168,0.5)', 'stroke-width': 0.8,
      })
    );
    // Total float.
    if (base.totalFloat > 1) {
      root.appendChild(
        svg('line', {
          x1: X(base.ef), y1: y + rowHeight / 2 - 1, x2: X(base.lf), y2: y + rowHeight / 2 - 1,
          stroke: 'rgba(236,224,198,0.28)', 'stroke-width': 1, 'stroke-dasharray': '2 2',
        })
      );
    }
    // Actual progress.
    if (st.actualStart !== null) {
      const end = st.actualFinish !== null ? st.actualFinish : project.day;
      root.appendChild(
        svg('rect', {
          x: X(st.actualStart), y: y + 6, width: Math.max(2, X(end) - X(st.actualStart)), height: rowHeight - 15,
          rx: 1.5, fill: st.pct >= 1 ? COLORS.done : COLORS.gold, opacity: 0.92,
        })
      );
    }
  });

  const todayX = X(project.day);
  root.appendChild(svg('line', { x1: todayX, y1: 18, x2: todayX, y2: height - 8, stroke: '#ece0c6', 'stroke-width': 1.2, opacity: 0.75 }));
  return root;
}

/* ------------------------------------- activity-on-node CPM network */

export function networkDiagram(project, { boxW = 132, boxH = 54, gapX = 34, gapY = 18 } = {}) {
  const nodes = project.baseline.nodes;
  // Rank by longest path from the start so predecessors are always to the left.
  const rank = new Map();
  for (const id of project.baseline.order) {
    const node = nodes.get(id);
    let r = 0;
    for (const link of node.predecessors) {
      const pr = rank.get(link.id);
      if (pr !== undefined) r = Math.max(r, pr + 1);
    }
    rank.set(id, r);
  }
  const columns = new Map();
  for (const [id, r] of rank) {
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r).push(id);
  }
  const maxRank = Math.max(...rank.values());
  const maxRows = Math.max(...[...columns.values()].map((c) => c.length));
  const width = (maxRank + 1) * (boxW + gapX) + gapX;
  const height = maxRows * (boxH + gapY) + gapY + 18;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height });

  const pos = new Map();
  for (const [r, ids] of columns) {
    ids.forEach((id, i) => {
      pos.set(id, { x: gapX + r * (boxW + gapX), y: gapY + i * (boxH + gapY) });
    });
  }

  // Arrows first so boxes sit on top.
  const defs = svg('defs', {}, [
    svg('marker', { id: 'giza-arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, [
      svg('path', { d: 'M0,0 L8,4 L0,8 z', fill: 'rgba(236,224,198,0.5)' }),
    ]),
    svg('marker', { id: 'giza-arrow-crit', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, [
      svg('path', { d: 'M0,0 L8,4 L0,8 z', fill: COLORS.critical }),
    ]),
  ]);
  root.appendChild(defs);

  for (const [id, node] of nodes) {
    const to = pos.get(id);
    for (const link of node.predecessors) {
      const from = pos.get(link.id);
      if (!from) continue;
      const critical = node.critical && nodes.get(link.id).critical;
      const x1 = from.x + boxW;
      const y1 = from.y + boxH / 2;
      const x2 = to.x;
      const y2 = to.y + boxH / 2;
      const mx = (x1 + x2) / 2;
      root.appendChild(
        svg('path', {
          d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
          fill: 'none',
          stroke: critical ? COLORS.critical : 'rgba(236,224,198,0.26)',
          'stroke-width': critical ? 1.8 : 1,
          'marker-end': `url(#${critical ? 'giza-arrow-crit' : 'giza-arrow'})`,
        })
      );
      if (link.type !== 'FS' || link.lag) {
        root.appendChild(
          svg('text', {
            x: mx, y: (y1 + y2) / 2 - 3, 'text-anchor': 'middle', 'font-size': 8,
            fill: 'rgba(184,171,144,0.7)',
            text: `${link.type}${link.lag ? (link.lag > 0 ? `+${link.lag}` : link.lag) : ''}`,
          })
        );
      }
    }
  }

  for (const [id, node] of nodes) {
    const task = project.taskById.get(id);
    const p = pos.get(id);
    const st = project.state.get(id);
    const g = svg('g', { transform: `translate(${p.x},${p.y})` });
    g.appendChild(
      svg('rect', {
        width: boxW, height: boxH, rx: 4,
        fill: node.critical ? 'rgba(193,80,60,0.16)' : 'rgba(236,224,198,0.05)',
        stroke: node.critical ? COLORS.critical : 'rgba(236,224,198,0.2)',
        'stroke-width': node.critical ? 1.4 : 1,
      })
    );
    g.appendChild(svg('line', { x1: 0, y1: 15, x2: boxW, y2: 15, stroke: 'rgba(236,224,198,0.16)' }));
    g.appendChild(svg('line', { x1: 0, y1: boxH - 15, x2: boxW, y2: boxH - 15, stroke: 'rgba(236,224,198,0.16)' }));
    g.appendChild(svg('text', { x: 4, y: 11, 'font-size': 8.5, fill: COLORS.gold, text: `ES ${Math.round(node.es)}` }));
    g.appendChild(svg('text', { x: boxW - 4, y: 11, 'font-size': 8.5, 'text-anchor': 'end', fill: COLORS.gold, text: `EF ${Math.round(node.ef)}` }));
    g.appendChild(svg('text', { x: boxW / 2, y: 27, 'font-size': 9.5, 'text-anchor': 'middle', fill: '#ece0c6', text: task.code }));
    g.appendChild(
      svg('text', {
        x: boxW / 2, y: 38, 'font-size': 8, 'text-anchor': 'middle', fill: COLORS.text,
        text: task.name.length > 24 ? `${task.name.slice(0, 23)}…` : task.name,
      })
    );
    g.appendChild(svg('text', { x: 4, y: boxH - 4, 'font-size': 8.5, fill: COLORS.text, text: `LS ${Math.round(node.ls)}` }));
    g.appendChild(svg('text', { x: boxW / 2, y: boxH - 4, 'font-size': 8.5, 'text-anchor': 'middle', fill: node.critical ? COLORS.critical : COLORS.text, text: `TF ${Math.round(node.totalFloat)}` }));
    g.appendChild(svg('text', { x: boxW - 4, y: boxH - 4, 'font-size': 8.5, 'text-anchor': 'end', fill: COLORS.text, text: `LF ${Math.round(node.lf)}` }));
    if (st.pct > 0) {
      g.appendChild(svg('rect', { x: 0, y: boxH - 2, width: boxW * Math.min(1, st.pct), height: 2, fill: st.pct >= 1 ? COLORS.done : COLORS.gold }));
    }
    root.appendChild(g);
  }
  return root;
}

/* -------------------------------------------------------- risk matrix */

export function riskMatrix(project, { size = 340 } = {}) {
  const pad = 34;
  const cell = (size - pad) / 5;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const impactBands = [12000, 26000, 42000, 62000, 1e9];
  const probBands = [0.08, 0.16, 0.25, 0.35, 1];

  for (let i = 0; i < 5; i++) {
    for (let p = 0; p < 5; p++) {
      const score = (i + 1) * (p + 1);
      const hue = score >= 16 ? '193,80,60' : score >= 9 ? '224,165,46' : '78,154,90';
      root.appendChild(
        svg('rect', {
          x: pad + i * cell, y: pad + (4 - p) * cell, width: cell - 1, height: cell - 1,
          fill: `rgba(${hue},${0.08 + (score / 25) * 0.22})`, stroke: 'rgba(236,224,198,0.08)',
        })
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    root.appendChild(svg('text', { x: pad + i * cell + cell / 2, y: size - 6, 'text-anchor': 'middle', text: ['VL', 'L', 'M', 'H', 'VH'][i] }));
    root.appendChild(svg('text', { x: pad - 6, y: pad + (4 - i) * cell + cell / 2 + 3, 'text-anchor': 'end', text: ['VL', 'L', 'M', 'H', 'VH'][i] }));
  }
  root.appendChild(svg('text', { x: size / 2, y: size - 20, 'text-anchor': 'middle', fill: COLORS.text, text: 'IMPACT →' }));
  root.appendChild(svg('text', { x: 10, y: size / 2, 'text-anchor': 'middle', fill: COLORS.text, transform: `rotate(-90 10 ${size / 2})`, text: 'PROBABILITY →' }));

  const occupied = new Map();
  for (const risk of project.risks) {
    const i = impactBands.findIndex((b) => risk.costImpact <= b);
    const p = probBands.findIndex((b) => risk.currentProbability <= b);
    const key = `${i},${p}`;
    const n = occupied.get(key) || 0;
    occupied.set(key, n + 1);
    const ox = (n % 3) * 15 - 15;
    const oy = Math.floor(n / 3) * 15 - 8;
    const cx = pad + i * cell + cell / 2 + ox;
    const cy = pad + (4 - p) * cell + cell / 2 + oy;
    const realised = risk.occurrences > 0;
    root.appendChild(
      svg('circle', {
        cx, cy, r: 9,
        fill: realised ? 'rgba(193,80,60,0.85)' : 'rgba(47,111,168,0.7)',
        stroke: realised ? '#f0b0a4' : '#9fc3e8', 'stroke-width': 1,
      })
    );
    root.appendChild(svg('text', { x: cx, y: cy + 3, 'text-anchor': 'middle', 'font-size': 7.5, fill: '#fff', text: risk.id.replace('R-', '') }));
    root.appendChild(svg('title', { text: `${risk.id} ${risk.name}` }));
  }
  return root;
}

/* -------------------------------------------------- resource histogram */

export function resourceHistogram(project, resourceId, { width = 780, height = 170 } = {}) {
  const pad = { l: 50, r: 14, t: 12, b: 22 };
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}` });
  const profile = project.resourceProfile.get(resourceId);
  const resource = project.resourceById.get(resourceId);
  if (!profile || !resource) return root;
  const horizon = profile.length;
  const maxV = Math.max(resource.capacity, ...profile) * 1.05;
  const X = (d) => pad.l + (d / horizon) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / maxV) * (height - pad.t - pad.b);

  const yTicks = [0, 0.5, 1].map((f) => ({ v: f, label: fmtNum(f * maxV) }));
  const years = Math.ceil(horizon / 365);
  const step = years > 12 ? 4 : 2;
  const xTicks = [];
  for (let y = 0; y <= years; y += step) xTicks.push({ v: (y * 365) / horizon, label: `yr ${y}` });
  root.appendChild(axes(width, height, pad, xTicks, yTicks));

  const step2 = Math.max(1, Math.round(horizon / 320));
  const pts = [[X(0), Y(0)]];
  for (let d = 0; d < horizon; d += step2) pts.push([X(d), Y(profile[d])]);
  pts.push([X(horizon), Y(0)]);
  root.appendChild(svg('polygon', { points: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), fill: 'rgba(47,111,168,0.32)', stroke: COLORS.lapis, 'stroke-width': 1.2 }));

  root.appendChild(svg('line', { x1: pad.l, y1: Y(resource.assigned), x2: width - pad.r, y2: Y(resource.assigned), stroke: COLORS.gold, 'stroke-width': 1.6 }));
  root.appendChild(svg('text', { x: width - pad.r - 2, y: Y(resource.assigned) - 4, 'text-anchor': 'end', fill: COLORS.gold, text: `assigned ${resource.assigned.toLocaleString()}` }));
  root.appendChild(svg('line', { x1: pad.l, y1: Y(resource.capacity), x2: width - pad.r, y2: Y(resource.capacity), stroke: COLORS.critical, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.7 }));
  root.appendChild(svg('text', { x: width - pad.r - 2, y: Y(resource.capacity) - 4, 'text-anchor': 'end', fill: COLORS.critical, text: `capacity ${resource.capacity.toLocaleString()}` }));
  root.appendChild(svg('line', { x1: X(project.day), y1: pad.t, x2: X(project.day), y2: height - pad.b, stroke: '#ece0c6', opacity: 0.5 }));
  return root;
}

/* --------------------------------------------------- SPC control chart */

export function controlChart(project, metric, { width = 380, height = 160 } = {}) {
  const pad = { l: 44, r: 12, t: 12, b: 20 };
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}` });
  const samples = project.qualitySamples.filter((s) => s.metric === metric).slice(-60);
  if (!samples.length) {
    root.appendChild(svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', fill: COLORS.text, text: 'no samples yet' }));
    return root;
  }
  const target = samples[0].target;
  const ucl = samples[0].ucl;
  const maxV = Math.max(ucl * 1.15, ...samples.map((s) => s.value)) * 1.02;
  const X = (i) => pad.l + (i / Math.max(1, samples.length - 1)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / maxV) * (height - pad.t - pad.b);

  root.appendChild(axes(width, height, pad, [], [0, 0.5, 1].map((f) => ({ v: f, label: (f * maxV).toFixed(1) }))));
  root.appendChild(svg('line', { x1: pad.l, y1: Y(ucl), x2: width - pad.r, y2: Y(ucl), stroke: COLORS.critical, 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }));
  root.appendChild(svg('text', { x: width - pad.r - 2, y: Y(ucl) - 3, 'text-anchor': 'end', fill: COLORS.critical, text: 'UCL / tolerance' }));
  root.appendChild(svg('line', { x1: pad.l, y1: Y(target), x2: width - pad.r, y2: Y(target), stroke: COLORS.done, 'stroke-dasharray': '2 4', 'stroke-width': 1 }));
  root.appendChild(svg('text', { x: width - pad.r - 2, y: Y(target) - 3, 'text-anchor': 'end', fill: COLORS.done, text: 'target' }));
  root.appendChild(polyline(samples.map((s, i) => [X(i), Y(s.value)]), COLORS.gold, 1.6));
  samples.forEach((s, i) => {
    root.appendChild(svg('circle', { cx: X(i), cy: Y(s.value), r: 2.6, fill: s.value > ucl ? COLORS.critical : COLORS.gold }));
  });
  return root;
}

/* --------------------------------------------------------- Monte Carlo */

export function monteCarloChart(result, { width = 760, height = 260 } = {}) {
  const pad = { l: 50, r: 46, t: 14, b: 26 };
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}` });
  const { bins, min, width: binW, counts } = result.histogram;
  const maxCount = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const X = (day) => pad.l + ((day - min) / (bins * binW)) * (width - pad.l - pad.r);
  const Y = (c) => pad.t + (1 - c / maxCount) * (height - pad.t - pad.b);
  const Yc = (f) => pad.t + (1 - f) * (height - pad.t - pad.b);

  const xTicks = [];
  for (let i = 0; i <= 4; i++) {
    const day = min + (bins * binW * i) / 4;
    xTicks.push({ v: i / 4, label: `${(day / 365).toFixed(1)} yr` });
  }
  root.appendChild(axes(width, height, pad, xTicks, [0, 0.5, 1].map((f) => ({ v: f, label: Math.round(f * maxCount) }))));

  counts.forEach((c, i) => {
    const x = X(min + i * binW);
    const w = Math.max(1, X(min + (i + 1) * binW) - x - 1);
    root.appendChild(svg('rect', { x, y: Y(c), width: w, height: height - pad.b - Y(c), fill: 'rgba(47,111,168,0.55)' }));
  });

  let cum = 0;
  const cumPts = [];
  counts.forEach((c, i) => {
    cum += c;
    cumPts.push([X(min + (i + 1) * binW), Yc(cum / total)]);
  });
  root.appendChild(polyline(cumPts, COLORS.gold, 2));
  root.appendChild(svg('text', { x: width - pad.r + 4, y: Yc(1) + 4, fill: COLORS.gold, 'font-size': 9, text: '100%' }));
  root.appendChild(svg('text', { x: width - pad.r + 4, y: Yc(0.5) + 4, fill: COLORS.gold, 'font-size': 9, text: '50%' }));

  for (const [label, day, color] of [
    ['baseline', result.baseline, '#ece0c6'],
    ['P50', result.finish.p50, COLORS.done],
    ['P80', result.finish.p80, COLORS.gold],
    ['P90', result.finish.p90, COLORS.critical],
  ]) {
    if (day < min || day > min + bins * binW) continue;
    const x = X(day);
    root.appendChild(svg('line', { x1: x, y1: pad.t, x2: x, y2: height - pad.b, stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': label === 'baseline' ? '' : '3 3' }));
    root.appendChild(svg('text', { x: x + 3, y: pad.t + 10, fill: color, 'font-size': 9, text: label }));
  }
  return root;
}

export function tornadoChart(result, { width = 700, rowHeight = 20 } = {}) {
  const items = result.tornado.slice(0, 10);
  const height = items.length * rowHeight + 26;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height });
  const labelW = 230;
  const maxR = Math.max(0.05, ...items.map((i) => Math.abs(i.correlation)));
  const mid = labelW + 8;
  const span = width - mid - 60;

  root.appendChild(svg('line', { x1: mid, y1: 16, x2: mid, y2: height - 6, stroke: COLORS.axis }));
  items.forEach((item, i) => {
    const y = 20 + i * rowHeight;
    const w = (Math.abs(item.correlation) / maxR) * span;
    root.appendChild(svg('text', { x: 2, y: y + rowHeight * 0.62, 'font-size': 9.5, fill: COLORS.text, text: `${item.code} ${item.name.length > 30 ? `${item.name.slice(0, 29)}…` : item.name}` }));
    root.appendChild(svg('rect', { x: mid, y: y + 3, width: Math.max(1, w), height: rowHeight - 8, rx: 2, fill: item.correlation > 0 ? 'rgba(193,80,60,0.75)' : 'rgba(78,154,90,0.75)' }));
    root.appendChild(svg('text', { x: mid + w + 6, y: y + rowHeight * 0.62, 'font-size': 9, fill: COLORS.text, text: `r = ${item.correlation.toFixed(2)}` }));
  });
  root.appendChild(svg('text', { x: mid, y: 11, 'font-size': 9, fill: COLORS.text, 'text-anchor': 'middle', text: 'correlation with project finish date' }));
  return root;
}

/* --------------------------------------------------- stakeholder grid */

export function stakeholderGrid(project, { size = 380 } = {}) {
  const pad = 40;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const plot = size - pad - 14;
  const X = (v) => pad + ((v - 1) / 4) * plot;
  const Y = (v) => pad + (1 - (v - 1) / 4) * plot;

  const quadrants = [
    ['Monitor', 'rgba(126,147,168,0.10)', 0, 0],
    ['Keep informed', 'rgba(78,154,90,0.10)', 1, 0],
    ['Keep satisfied', 'rgba(224,165,46,0.10)', 0, 1],
    ['Manage closely', 'rgba(193,80,60,0.14)', 1, 1],
  ];
  for (const [label, fill, qx, qy] of quadrants) {
    root.appendChild(svg('rect', { x: pad + (qx * plot) / 2, y: pad + ((1 - qy) * plot) / 2, width: plot / 2, height: plot / 2, fill, stroke: 'rgba(236,224,198,0.1)' }));
    root.appendChild(
      svg('text', {
        x: pad + (qx * plot) / 2 + plot / 4, y: pad + ((1 - qy) * plot) / 2 + 14,
        'text-anchor': 'middle', 'font-size': 9, fill: 'rgba(184,171,144,0.65)', text: label.toUpperCase(),
      })
    );
  }
  root.appendChild(svg('text', { x: pad + plot / 2, y: size - 6, 'text-anchor': 'middle', fill: COLORS.text, text: 'INTEREST →' }));
  root.appendChild(svg('text', { x: 11, y: pad + plot / 2, 'text-anchor': 'middle', transform: `rotate(-90 11 ${pad + plot / 2})`, fill: COLORS.text, text: 'POWER →' }));

  for (const s of project.stakeholders) {
    const cx = X(s.interest);
    const cy = Y(s.power);
    const colour = s.level >= 4 ? '78,154,90' : s.level === 3 ? '224,165,46' : '193,80,60';
    root.appendChild(svg('circle', { cx, cy, r: 12, fill: `rgba(${colour},0.75)`, stroke: `rgb(${colour})`, 'stroke-width': 1.4 }));
    root.appendChild(svg('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', 'font-size': 9, fill: '#0c0a07', 'font-weight': 700, text: String(s.level) }));
    root.appendChild(
      svg('text', {
        x: cx, y: cy + 25, 'text-anchor': 'middle', 'font-size': 8.5, fill: COLORS.text,
        text: s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name,
      })
    );
  }
  return root;
}

/** Small inline sparkline for the HUD. */
export function sparkline(values, { width = 90, height = 22, color = COLORS.gold } = {}) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
  if (values.length < 2) return root;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - ((v - min) / span) * (height - 3) - 1.5]);
  root.appendChild(polyline(pts, color, 1.4));
  return root;
}

export const CHART_COLORS = COLORS;
