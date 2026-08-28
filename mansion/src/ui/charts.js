/**
 * Every chart in the dashboard, hand-written as SVG.
 *
 * Colour is spent where it does work and nowhere else:
 *
 *   - three series (planned value, earned value, actual cost) use a
 *     categorical set validated all-pairs against this dark surface — worst
 *     pair ΔE 9.4 under simulated deuteranopia, 20.9 under normal vision;
 *   - four x-ray systems use a second validated all-pairs set;
 *   - everything with more identities than that — nine control accounts,
 *     sixty-one work packages, twelve phases — is identified by its *name*,
 *     because past about seven simultaneous colour classes no palette can keep
 *     them apart, and a row label always can.
 *
 * Magnitude charts therefore use one accent and let length carry the value;
 * the critical path uses the reserved status red and also says "critical" in
 * the row. Grid lines are solid and recessive, never dashed. Every chart with
 * two or more series carries a legend, and the tables under the panels are the
 * accessible reading of the same numbers.
 */
import { svgEl, el, fill } from './dom.js';

/** The validated palette. See the file comment for how it was arrived at. */
export const VIZ = {
  /** Planned value, earned value, actual cost. Validated all-pairs, dark. */
  series: ['#3987e5', '#199e70', '#d95926'],
  seriesNames: ['Planned value', 'Earned value', 'Actual cost'],
  /** Substructure, frame, masonry, services. Validated all-pairs, dark. */
  layers: ['#7a4bd8', '#0ba5cb', '#cb7e0b', '#cb0b65'],
  accent: '#d8b678',
  accentSoft: 'rgba(216, 182, 120, 0.28)',
  good: '#62c08b',
  warn: '#e0a94f',
  bad: '#e0705f',
  critical: '#e0574a',
  grid: 'rgba(255, 255, 255, 0.07)',
  axis: 'rgba(255, 255, 255, 0.16)',
  ink: '#eef1f6',
  ink2: '#b3bccb',
  ink3: '#7d879a',
  surface: '#171c27',
};

const PAD = { top: 16, right: 74, bottom: 30, left: 62 };

function frame(width, height) {
  return svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
}

function text(x, y, value, opts = {}) {
  return svgEl('text', {
    x, y,
    fill: opts.fill || VIZ.ink3,
    'font-size': opts.size || 10.5,
    'font-family': 'inherit',
    'text-anchor': opts.anchor || 'start',
    'dominant-baseline': opts.baseline || 'auto',
    'font-weight': opts.weight || 400,
    opacity: opts.opacity,
  }, String(value));
}

function line(x1, y1, x2, y2, stroke, width = 1) {
  return svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'shape-rendering': 'crispEdges' });
}

/** A legend row. Always present when a chart carries two or more series. */
export function legend(entries) {
  return el('div', { class: 'legend' }, entries.map((entry) => el('span', {}, [
    el('span', {
      style: {
        width: '10px', height: '10px', 'border-radius': '2px',
        background: entry.colour, display: 'inline-block',
      },
    }),
    entry.label,
  ])));
}

/**
 * The earned-value S-curve: three series against days, with a crosshair and a
 * tooltip, direct end-labels and a marker at today.
 */
export function sCurve(project, day, opts = {}) {
  const width = opts.width || 720;
  const height = opts.height || 260;
  const horizon = project.horizon;
  const plot = {
    x0: PAD.left, x1: width - PAD.right,
    y0: PAD.top, y1: height - PAD.bottom,
  };
  const maxValue = Math.max(
    project.pv.value[horizon], project.evAc.value[horizon], project.evAc.cost[horizon],
  ) * 1.04;

  const sx = (d) => plot.x0 + (d / horizon) * (plot.x1 - plot.x0);
  const sy = (v) => plot.y1 - (v / maxValue) * (plot.y1 - plot.y0);

  const svg = frame(width, height);
  const nodes = [];

  // Grid: solid, recessive, five bands.
  for (let i = 0; i <= 4; i += 1) {
    const v = (maxValue * i) / 4;
    const y = sy(v);
    nodes.push(line(plot.x0, y, plot.x1, y, VIZ.grid, 1));
    nodes.push(text(plot.x0 - 8, y + 3, `${(v / 1e7).toFixed(1)}`, { anchor: 'end' }));
  }
  nodes.push(text(plot.x0 - 8, plot.y0 - 5, 'crore', { anchor: 'end', size: 9.5 }));
  for (let i = 0; i <= 4; i += 1) {
    const d = Math.round((horizon * i) / 4);
    nodes.push(text(sx(d), plot.y1 + 15, `Day ${d}`, { anchor: i === 0 ? 'start' : (i === 4 ? 'end' : 'middle') }));
  }
  nodes.push(line(plot.x0, plot.y1, plot.x1, plot.y1, VIZ.axis, 1));

  const seriesData = [
    { values: project.pv.value, colour: VIZ.series[0], label: 'Planned' },
    { values: project.evAc.value, colour: VIZ.series[1], label: 'Earned' },
    { values: project.evAc.cost, colour: VIZ.series[2], label: 'Actual' },
  ];

  for (const s of seriesData) {
    const points = [];
    const step = Math.max(1, Math.round(horizon / 180));
    for (let d = 0; d <= horizon; d += step) points.push(`${sx(d).toFixed(1)},${sy(s.values[d]).toFixed(1)}`);
    points.push(`${sx(horizon).toFixed(1)},${sy(s.values[horizon]).toFixed(1)}`);
    nodes.push(svgEl('polyline', {
      points: points.join(' '),
      fill: 'none',
      stroke: s.colour,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }));
    // Direct end-label: three series, so each is named at its own end.
    nodes.push(text(plot.x1 + 7, sy(s.values[horizon]) + 3, s.label, { fill: s.colour, size: 10.5, weight: 600 }));
  }

  // Today.
  const dx = sx(day);
  nodes.push(line(dx, plot.y0, dx, plot.y1, VIZ.accentSoft, 1));
  nodes.push(text(dx, plot.y0 - 4, `Day ${day}`, { anchor: 'middle', fill: VIZ.accent, size: 10 }));
  for (const s of seriesData) {
    nodes.push(svgEl('circle', {
      cx: dx, cy: sy(s.values[day]), r: 4,
      fill: s.colour, stroke: VIZ.surface, 'stroke-width': 2,
    }));
  }

  for (const node of nodes) svg.appendChild(node);

  // Hover layer: a crosshair and a tooltip, because reading a value off a
  // curve by eye is not reading it.
  const wrap = el('div', { class: 'chartwrap', style: { position: 'relative' } }, [svg]);
  const tip = el('div', { class: 'charttip', hidden: true });
  wrap.appendChild(tip);
  const cursor = svgEl('line', {
    x1: 0, y1: plot.y0, x2: 0, y2: plot.y1,
    stroke: VIZ.ink3, 'stroke-width': 1, opacity: 0,
  });
  svg.appendChild(cursor);

  svg.addEventListener('mousemove', (event) => {
    const rect = svg.getBoundingClientRect();
    const scale = width / rect.width;
    const x = (event.clientX - rect.left) * scale;
    if (x < plot.x0 || x > plot.x1) { cursor.setAttribute('opacity', 0); tip.hidden = true; return; }
    const d = Math.round(((x - plot.x0) / (plot.x1 - plot.x0)) * horizon);
    cursor.setAttribute('x1', sx(d));
    cursor.setAttribute('x2', sx(d));
    cursor.setAttribute('opacity', 0.5);
    fill(tip, [
      el('b', { text: `Day ${d}` }),
      ...seriesData.map((s) => el('span', {}, [
        el('i', { style: { background: s.colour } }),
        `${s.label} `,
        el('b', { text: `${(s.values[d] / 1e7).toFixed(2)} cr` }),
      ])),
    ]);
    tip.hidden = false;
    tip.style.left = `${Math.min(rect.width - 150, (sx(d) / scale) + 12)}px`;
    tip.style.top = '10px';
  });
  svg.addEventListener('mouseleave', () => { cursor.setAttribute('opacity', 0); tip.hidden = true; });

  wrap.appendChild(legend(seriesData.map((s) => ({ colour: s.colour, label: `${s.label} value` }))));
  return wrap;
}

/**
 * Horizontal magnitude bars. One accent: identity comes from the row label,
 * which is exactly what a label is for.
 */
export function barsH(rows, opts = {}) {
  const width = opts.width || 720;
  const rowH = opts.rowH || 24;
  const labelW = opts.labelW || 210;
  const height = rows.length * rowH + 26;
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const x0 = labelW;
  const x1 = width - (opts.valueW || 110);

  const svg = frame(width, height);
  rows.forEach((r, i) => {
    const y = i * rowH + 8;
    const w = (Math.abs(r.value) / max) * (x1 - x0);
    svg.appendChild(text(labelW - 10, y + rowH * 0.52, r.label, { anchor: 'end', fill: VIZ.ink2, size: 11.5 }));
    svg.appendChild(svgEl('rect', {
      x: x0, y: y + 4, width: Math.max(1.5, w), height: rowH - 12,
      rx: 4, fill: r.colour || VIZ.accent, opacity: r.dim ? 0.42 : 0.9,
    }, [svgEl('title', {}, `${r.label}: ${r.display || r.value}`)]));
    svg.appendChild(text(x1 + 8, y + rowH * 0.52, r.display !== undefined ? r.display : r.value, {
      fill: VIZ.ink, size: 11, weight: 500,
    }));
    if (r.sub) svg.appendChild(text(x0 + 6, y + rowH * 0.52, r.sub, { fill: 'rgba(10,13,20,0.75)', size: 10 }));
  });
  svg.appendChild(line(x0, 6, x0, height - 18, VIZ.axis, 1));
  return el('div', { class: 'chartwrap' }, [svg]);
}

/**
 * The Gantt. Baseline bar behind, as-built bar in front, critical activities in
 * the reserved status red — and the row also says "critical", so the colour is
 * never the only carrier.
 */
export function gantt(project, rows, day, opts = {}) {
  const width = opts.width || 760;
  const rowH = 17;
  const labelW = 226;
  const height = rows.length * rowH + 34;
  const horizon = project.horizon;
  const x0 = labelW;
  const x1 = width - 16;
  const sx = (d) => x0 + (d / horizon) * (x1 - x0);

  const svg = frame(width, height);
  for (let i = 0; i <= 4; i += 1) {
    const d = Math.round((horizon * i) / 4);
    svg.appendChild(line(sx(d), 16, sx(d), height - 18, VIZ.grid, 1));
    svg.appendChild(text(sx(d), 11, `Day ${d}`, { anchor: i === 4 ? 'end' : (i === 0 ? 'start' : 'middle') }));
  }

  rows.forEach((r, i) => {
    const y = i * rowH + 20;
    svg.appendChild(text(labelW - 10, y + rowH * 0.62, r.label, {
      anchor: 'end', fill: r.critical ? VIZ.critical : VIZ.ink2, size: 10.5,
      weight: r.critical ? 600 : 400,
    }));
    // Baseline behind.
    svg.appendChild(svgEl('rect', {
      x: sx(r.baseStart), y: y + 3, width: Math.max(2, sx(r.baseFinish) - sx(r.baseStart)),
      height: rowH - 9, rx: 3, fill: 'rgba(255,255,255,0.10)',
    }, [svgEl('title', {}, `${r.label} — baseline days ${Math.round(r.baseStart)}–${Math.round(r.baseFinish)}`)]));
    // As-built in front, with a 2 px surface gap so the two never merge.
    svg.appendChild(svgEl('rect', {
      x: sx(r.start), y: y + 5, width: Math.max(2, sx(r.finish) - sx(r.start)),
      height: rowH - 13, rx: 3,
      fill: r.critical ? VIZ.critical : VIZ.accent,
      opacity: r.done ? 0.95 : 0.72,
    }, [svgEl('title', {},
      `${r.label} — as built days ${Math.round(r.start)}–${Math.round(r.finish)}` +
      `${r.critical ? ' (critical path)' : `, total float ${Math.round(r.float)} d`}`)]));
  });

  const dx = sx(day);
  svg.appendChild(line(dx, 16, dx, height - 18, VIZ.accent, 1));
  return el('div', { class: 'chartwrap' }, [svg]);
}

/** A distribution with percentile markers. One series, so no legend. */
export function histogram(mc, opts = {}) {
  const width = opts.width || 720;
  const height = opts.height || 210;
  const plot = { x0: 46, x1: width - 18, y0: 14, y1: height - 34 };
  const max = Math.max(...mc.histogram);
  const n = mc.histogram.length;
  const bw = (plot.x1 - plot.x0) / n;

  const svg = frame(width, height);
  mc.histogram.forEach((count, i) => {
    const h = (count / max) * (plot.y1 - plot.y0);
    const day = mc.histLo + mc.histWidth * (i + 0.5);
    svg.appendChild(svgEl('rect', {
      // A 2 px gap between bars keeps them separate without a border.
      x: plot.x0 + i * bw + 1, y: plot.y1 - h, width: Math.max(1, bw - 2), height: Math.max(0.5, h),
      rx: 2, fill: VIZ.accent, opacity: 0.62,
    }, [svgEl('title', {}, `${count} of ${mc.iterations} runs finished near day ${Math.round(day)}`)]));
  });
  svg.appendChild(line(plot.x0, plot.y1, plot.x1, plot.y1, VIZ.axis, 1));

  const sx = (d) => plot.x0 + ((d - mc.histLo) / Math.max(1e-9, mc.max - mc.histLo)) * (plot.x1 - plot.x0);
  const marks = [
    { day: mc.p10, label: 'P10', colour: VIZ.good },
    { day: mc.p50, label: 'P50', colour: VIZ.ink2 },
    { day: mc.p80, label: 'P80', colour: VIZ.warn },
    { day: mc.p90, label: 'P90', colour: VIZ.bad },
    { day: mc.baselineFinish, label: 'Baseline', colour: VIZ.series[0] },
  ];
  for (const m of marks) {
    const x = sx(m.day);
    if (x < plot.x0 || x > plot.x1) continue;
    svg.appendChild(line(x, plot.y0, x, plot.y1, m.colour, 1.5));
    svg.appendChild(text(x, plot.y0 - 2, m.label, { anchor: 'middle', fill: m.colour, size: 10, weight: 600 }));
    svg.appendChild(text(x, plot.y1 + 14, String(Math.round(m.day)), { anchor: 'middle', size: 10 }));
  }
  svg.appendChild(text(plot.x0, height - 6, 'Completion day', { size: 10 }));
  return el('div', { class: 'chartwrap' }, [svg]);
}

/** A tornado: one measure, signed, so the two poles are a diverging pair. */
export function tornado(entries, opts = {}) {
  const width = opts.width || 720;
  const rowH = 20;
  const labelW = 250;
  const height = entries.length * rowH + 24;
  const mid = labelW + (width - labelW - 60) / 2;
  const halfW = (width - labelW - 70) / 2;
  const max = Math.max(0.001, ...entries.map((e) => Math.abs(e.value)));

  const svg = frame(width, height);
  svg.appendChild(line(mid, 12, mid, height - 12, VIZ.axis, 1));
  entries.forEach((e, i) => {
    const y = i * rowH + 12;
    const w = (Math.abs(e.value) / max) * halfW;
    const positive = e.value >= 0;
    svg.appendChild(text(labelW - 10, y + rowH * 0.55, e.label, { anchor: 'end', fill: VIZ.ink2, size: 10.5 }));
    svg.appendChild(svgEl('rect', {
      x: positive ? mid : mid - w, y: y + 3, width: Math.max(1.5, w), height: rowH - 10, rx: 3,
      fill: positive ? VIZ.bad : VIZ.good, opacity: 0.85,
    }, [svgEl('title', {}, `${e.label}: correlation ${e.value.toFixed(2)}`)]));
    svg.appendChild(text(positive ? mid + w + 7 : mid - w - 7, y + rowH * 0.55, e.value.toFixed(2), {
      anchor: positive ? 'start' : 'end', fill: VIZ.ink, size: 10.5,
    }));
  });
  return el('div', { class: 'chartwrap' }, [svg]);
}

/** A power / interest grid. Points are labelled, so no colour identity. */
export function grid2d(points, opts = {}) {
  const width = opts.width || 520;
  const height = opts.height || 360;
  const plot = { x0: 52, x1: width - 118, y0: 18, y1: height - 40 };
  const sx = (v) => plot.x0 + v * (plot.x1 - plot.x0);
  const sy = (v) => plot.y1 - v * (plot.y1 - plot.y0);

  const svg = frame(width, height);
  svg.appendChild(svgEl('rect', {
    x: plot.x0, y: plot.y0, width: plot.x1 - plot.x0, height: plot.y1 - plot.y0,
    fill: 'rgba(255,255,255,0.022)', stroke: VIZ.grid,
  }));
  svg.appendChild(line(sx(0.5), plot.y0, sx(0.5), plot.y1, VIZ.grid, 1));
  svg.appendChild(line(plot.x0, sy(0.5), plot.x1, sy(0.5), VIZ.grid, 1));
  const quadrants = [
    ['Keep informed', 0.25, 0.25], ['Manage closely', 0.75, 0.75],
    ['Monitor', 0.25, 0.75], ['Keep satisfied', 0.75, 0.25],
  ];
  for (const [label, qx, qy] of quadrants) {
    svg.appendChild(text(sx(qx), sy(qy), label, {
      anchor: 'middle', size: 10, opacity: 0.30, fill: VIZ.ink,
    }));
  }
  for (const p of points) {
    svg.appendChild(svgEl('circle', {
      cx: sx(p.x), cy: sy(p.y), r: 6 + p.weight * 4,
      fill: VIZ.accent, opacity: 0.8, stroke: VIZ.surface, 'stroke-width': 2,
    }, [svgEl('title', {}, `${p.label} — ${p.note}`)]));
    svg.appendChild(text(sx(p.x) + 11, sy(p.y) + 3.5, p.label, { fill: VIZ.ink2, size: 10 }));
  }
  svg.appendChild(text(plot.x0, plot.y1 + 20, 'Interest →', { size: 10 }));
  svg.appendChild(svgEl('text', {
    x: 14, y: (plot.y0 + plot.y1) / 2, fill: VIZ.ink3, 'font-size': 10,
    transform: `rotate(-90 14 ${(plot.y0 + plot.y1) / 2})`, 'text-anchor': 'middle',
  }, 'Power →'));
  return el('div', { class: 'chartwrap' }, [svg]);
}

/** A resource histogram: demand against establishment, one pool per row. */
export function resourceBars(rows, opts = {}) {
  const width = opts.width || 720;
  const rowH = 26;
  const labelW = 200;
  const height = rows.length * rowH + 26;
  const x0 = labelW;
  const x1 = width - 96;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.demand, r.size)));

  const svg = frame(width, height);
  rows.forEach((r, i) => {
    const y = i * rowH + 10;
    svg.appendChild(text(labelW - 10, y + 12, r.label, { anchor: 'end', fill: VIZ.ink2, size: 11 }));
    // Establishment as a recessive track, demand as the mark on top.
    svg.appendChild(svgEl('rect', {
      x: x0, y: y + 3, width: (r.size / max) * (x1 - x0), height: rowH - 12,
      rx: 4, fill: 'rgba(255,255,255,0.08)',
    }, [svgEl('title', {}, `${r.label}: establishment ${r.size}`)]));
    svg.appendChild(svgEl('rect', {
      x: x0, y: y + 5, width: Math.max(1.5, (Math.min(r.demand, r.size) / max) * (x1 - x0)), height: rowH - 16,
      rx: 3, fill: r.over > 0 ? VIZ.warn : VIZ.accent, opacity: 0.9,
    }, [svgEl('title', {}, `${r.label}: ${Math.round(r.demand)} assigned of ${r.size}`)]));
    if (r.over > 0) {
      svg.appendChild(svgEl('rect', {
        x: x0 + (r.size / max) * (x1 - x0) + 2, y: y + 5,
        width: Math.max(1.5, (r.over / max) * (x1 - x0)), height: rowH - 16,
        rx: 3, fill: VIZ.bad, opacity: 0.9,
      }, [svgEl('title', {}, `${r.label}: ${r.over} over establishment`)]));
    }
    svg.appendChild(text(x1 + 8, y + 12, r.over > 0 ? `${Math.round(r.demand)} (+${r.over})` : `${Math.round(r.demand)}`, {
      fill: r.over > 0 ? VIZ.bad : VIZ.ink, size: 10.5,
    }));
  });
  return el('div', { class: 'chartwrap' }, [
    svg,
    legend([
      { colour: VIZ.accent, label: 'Assigned' },
      { colour: 'rgba(255,255,255,0.14)', label: 'Establishment' },
      { colour: VIZ.bad, label: 'Over-allocated' },
    ]),
  ]);
}

/** A control chart: samples against a tolerance band. */
export function controlChart(gates, opts = {}) {
  const width = opts.width || 720;
  const height = opts.height || 190;
  const plot = { x0: 44, x1: width - 18, y0: 18, y1: height - 34 };
  const n = gates.length;
  const svg = frame(width, height);

  // Everything is expressed as a fraction of its own tolerance, so ten gates
  // measuring millimetres, psi and per cent can share one axis honestly.
  const sy = (ratio) => plot.y1 - ((ratio + 2) / 4) * (plot.y1 - plot.y0);
  const sx = (i) => plot.x0 + ((i + 0.5) / n) * (plot.x1 - plot.x0);

  svg.appendChild(svgEl('rect', {
    x: plot.x0, y: sy(1), width: plot.x1 - plot.x0, height: sy(-1) - sy(1),
    fill: 'rgba(98,192,139,0.10)',
  }));
  svg.appendChild(line(plot.x0, sy(1), plot.x1, sy(1), VIZ.good, 1));
  svg.appendChild(line(plot.x0, sy(-1), plot.x1, sy(-1), VIZ.good, 1));
  svg.appendChild(line(plot.x0, sy(0), plot.x1, sy(0), VIZ.grid, 1));
  svg.appendChild(text(plot.x0 - 6, sy(1) + 3, '+tol', { anchor: 'end', fill: VIZ.good, size: 9.5 }));
  svg.appendChild(text(plot.x0 - 6, sy(-1) + 3, '−tol', { anchor: 'end', fill: VIZ.good, size: 9.5 }));

  gates.forEach((g, i) => {
    const ratio = Math.max(-2, Math.min(2, (g.measured - g.target) / (g.tolerance || 1)));
    const x = sx(i);
    svg.appendChild(svgEl('circle', {
      cx: x, cy: sy(ratio), r: 5.5,
      fill: g.passed ? VIZ.good : VIZ.bad,
      stroke: VIZ.surface, 'stroke-width': 2,
    }, [svgEl('title', {},
      `${g.id} ${g.name} — measured ${g.measured.toFixed(2)} ${g.unit}, ` +
      `tolerance ±${g.tolerance} ${g.unit} — ${g.passed ? 'passed' : 'rework'}`)]));
    svg.appendChild(text(x, plot.y1 + 14, g.id, { anchor: 'middle', size: 10, fill: g.passed ? VIZ.ink3 : VIZ.bad }));
  });
  return el('div', { class: 'chartwrap' }, [
    svg,
    legend([{ colour: VIZ.good, label: 'Within tolerance' }, { colour: VIZ.bad, label: 'Rework required' }]),
  ]);
}
