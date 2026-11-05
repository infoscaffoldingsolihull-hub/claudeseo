import { el, kpi, button, table, tabs, pill, select, slider, fmtPKR, fmtIndex, indexClass, confirmModal } from '../dom.js';
import {
  C, chartBox, legend, ganttChart, networkChart, networkKey, bellCurve, barChart, lineChart, dayTicks, shortDate,
  section, card, hookCard, animOnce, dl,
} from '../charts.js';
import { normalCdf, inverseNormal, pertDuration, pertSigma } from '../../pm/cpm.js';

/**
 * Schedule & CPM (Week 5): activity list with FS/SS/FF/SF links and lags,
 * baseline-vs-forecast Gantt, activity-on-node network with the critical path,
 * PERT probability, crashing & fast-tracking, and resource smoothing — all
 * read live from the Project and acting through its public methods.
 */

const TABS = [
  { id: 'gantt', label: 'Gantt', icon: 'gantt' },
  { id: 'network', label: 'Network (AON)', icon: 'fork' },
  { id: 'activities', label: 'Activity list', icon: 'table' },
  { id: 'pert', label: 'PERT', icon: 'dice' },
  { id: 'compress', label: 'Crash & fast-track', icon: 'shuffle' },
  { id: 'level', label: 'Resource levelling', icon: 'people' },
];

const M = 1e6;

function fOff(p) {
  return Number.isFinite(p.forecastDay) ? p.forecastDay : p.day;
}

/** Live CPM figures for a task in absolute project days. */
function timing(p, t) {
  const st = p.state.get(t.id);
  const bn = p.baseline.nodes.get(t.id) || {};
  const fn = (p.forecast && p.forecast.nodes.get(t.id)) || bn;
  const off = p.forecast ? fOff(p) : 0;
  const done = st.pct >= 1;
  const start = st.actualStart !== null && st.actualStart !== undefined ? st.actualStart : off + fn.es;
  const finish = done && st.actualFinish !== null ? st.actualFinish : Math.max(start, off + fn.ef);
  return {
    st, bn, fn, done, start, finish,
    es: off + fn.es, ef: off + fn.ef, ls: off + fn.ls, lf: off + fn.lf, tf: fn.totalFloat, ff: fn.freeFloat,
    critical: !done && !!fn.critical,
  };
}

function linkText(l) {
  const lag = l.lag ? (l.lag > 0 ? `+${l.lag}` : `${l.lag}`) : '';
  return `${l.id} ${l.type || 'FS'}${lag}`;
}

function pct(v) {
  return `${Math.round((v || 0) * 100)}%`;
}

export const PANEL_SCHEDULE = {
  id: 'schedule',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'gantt';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const snap = p.snapshot();
    const e = p.evm();
    const fp = p.forecastPert || p.pert;
    const crit = p.forecast ? p.forecast.criticalPath.filter((id) => !p.taskById.get(id).milestone).length : 0;
    body.appendChild(el('p', { class: 'lede', text: `The critical path is the longest chain of dependent work: any slip on it moves the finish. Baseline v${p.baselineVersion} finishes ${p.dateLabel(p.baselineDuration)}; the live forecast (re-computed every 14 days or on demand) says ${p.dateLabel(p.forecastFinish)}.` }));
    const svd = snap.scheduleVarianceDays;
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Baseline finish', value: shortDate(p.startDate, p.baselineDuration), foot: `${p.baselineDuration} days · v${p.baselineVersion}` }),
      kpi({ label: 'Forecast finish', value: shortDate(p.startDate, p.forecastFinish), foot: `${svd > 0 ? '+' : ''}${Math.round(svd)} d vs baseline`, cls: svd > 10 ? 'bad' : svd > 0 ? 'warn' : 'good' }),
      kpi({ label: 'SPI · SPI(t)', value: `${fmtIndex(e.spi)} · ${fmtIndex(e.spit)}`, foot: `SV(t) ${e.svt >= 0 ? '+' : ''}${Math.round(e.svt)} d (earned schedule)`, cls: indexClass(e.spit) }),
      kpi({ label: 'P(on time) — PERT', value: pct(fp.probability !== undefined ? fp.probability : fp.probabilityBy(p.baselineDuration)), foot: `σ path = ${Math.round(fp.sigma)} d`, cls: (fp.probability || 0) >= 0.5 ? 'good' : 'warn' }),
      kpi({ label: 'Critical activities', value: String(crit), foot: `${p.tasks.filter((t) => !t.milestone).length} activities · ${p.milestones.length} milestones` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [
      tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); }),
      el('div', { class: 'grow' }),
      button('Re-forecast now', () => { const r = p.reforecast(); dash.sim.toast(`Forecast finish ${p.dateLabel(r.forecastFinish)} (${r.scheduleVarianceDays >= 0 ? '+' : ''}${r.scheduleVarianceDays} d)`, r.scheduleVarianceDays > 0 ? 'warn' : 'good'); dash.rerender(); }, { icon: 'cycle', small: true, kind: 'ghost', title: 'Recompute the forecast CPM from today' }),
    ]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ gantt, network, activities, pert, compress, level })[s.tab](dash, pane, p);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 5', title: 'British Columbia Transportation — schedule under public scrutiny',
      text: 'How a public transport programme used critical-path scheduling and earned-value reporting to defend its delivery dates. Compare their float management with the one you see here.',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · day ${p.day} · forecast computed on day ${fOff(p)}` })]));
  },
};

/* ---------------------------------------------------------------- Gantt */

function gantt(dash, pane, p) {
  const s = dash.state;
  if (!s.gExp) {
    s.gExp = {};
    for (const sm of p.summaries) s.gExp[sm.id] = p.tasks.some((t) => t.summaryId === sm.id && timing(p, t).critical);
  }
  const rows = [];
  const critOnly = !!s.critOnly;
  for (const sm of p.summaries) {
    const kids = p.tasks.filter((t) => t.summaryId === sm.id);
    const tk = kids.map((t) => ({ t, x: timing(p, t) }));
    const budget = kids.reduce((a, t) => a + t.budget, 0) || 1;
    const prog = kids.reduce((a, t) => a + t.budget * p.state.get(t.id).pct, 0) / budget;
    const anyCrit = tk.some((k) => k.x.critical);
    if (critOnly && !anyCrit) continue;
    rows.push({
      id: `S${sm.id}`, sid: sm.id, code: sm.code, label: sm.name, summary: true, level: 0, expanded: !!s.gExp[sm.id],
      bStart: sm.baselineStart, bFinish: sm.baselineFinish,
      start: Math.min(...tk.map((k) => k.x.start)), finish: Math.max(...tk.map((k) => k.x.finish)),
      pct: prog, critical: anyCrit, color: prog >= 1 ? 'var(--good)' : 'var(--c2)', done: prog >= 1,
    });
    if (!s.gExp[sm.id]) continue;
    for (const { t, x } of tk) {
      if (critOnly && !x.critical) continue;
      rows.push({
        id: t.id, code: t.code, label: t.name, level: 1, milestone: t.milestone, critical: x.critical, done: x.done,
        bStart: x.bn.es, bFinish: x.bn.ef, start: x.start, finish: x.finish, pct: x.st.pct, tf: x.tf, color: x.done ? 'var(--good)' : 'var(--c2)',
      });
    }
  }
  const horizon = [0, Math.max(p.baselineDuration, p.forecastFinish) + 30];
  const toggleAll = (on) => { for (const sm of p.summaries) s.gExp[sm.id] = on; dash.rerender(); };
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    button('Expand all', () => toggleAll(true), { small: true, kind: 'ghost' }),
    button('Collapse all', () => toggleAll(false), { small: true, kind: 'ghost' }),
    button(critOnly ? 'Show all work' : 'Critical path only', () => { s.critOnly = !critOnly; dash.rerender(); }, { small: true, kind: critOnly ? 'primary' : 'ghost', icon: 'warning' }),
    el('span', { class: 'pm-note', text: 'Click a summary to expand it; click an activity for its CPM data and to find it in 3D.' }),
  ]));
  const chart = ganttChart(rows, {
    startDate: p.startDate, horizon, today: p.day, baselineFinish: p.baselineDuration, selected: s.sel,
    animate: animOnce(dash, `gantt-${critOnly}`), width: 1180,
    onToggle: (r) => { s.gExp[r.sid] = !s.gExp[r.sid]; dash.rerender(); },
    onRow: (r) => { s.sel = r.id; if (dash.sim.select) dash.sim.select(r.id); dash.rerender(); },
  });
  pane.appendChild(chartBox(chart, {
    minWidth: 900, cls: 'tall',
    legend: legend([
      { label: 'Forecast / actual (filled = % complete)', color: 'var(--c2)' },
      { label: 'Critical path', color: C.crit },
      { label: 'Baseline', color: 'rgba(154,163,184,.7)' },
      { label: 'Milestone', color: C.brass, shape: 'diamond' },
      { label: 'Today', color: 'var(--amber)', shape: 'line' },
      { label: 'Baseline finish', color: C.brass, shape: 'line', dash: '2 4' },
    ]),
    caption: 'Thin grey bars are the approved baseline; coloured bars are actual dates for finished work and the live CPM forecast for the rest. “CP” marks zero-float activities.',
  }));
  if (s.sel && p.taskById.has(s.sel)) pane.appendChild(detail(dash, p, p.taskById.get(s.sel)));
}

function detail(dash, p, t) {
  const x = timing(p, t);
  const d = t.dictionary || {};
  return card(`${t.code} · ${t.name}`, [
    el('div', { class: 'pm-grid c2' }, [
      dl([
        ['Status', `${pct(x.st.pct)} complete${x.done ? ' (finished)' : x.st.actualStart !== null ? ' (in progress)' : ''}`],
        ['Duration (PERT)', `${t.duration} d  ·  O ${t.o} / M ${t.m} / P ${t.p}`],
        ['Baseline', `${shortDate(p.startDate, x.bn.es)} → ${shortDate(p.startDate, x.bn.ef)}`],
        [x.done ? 'Actual' : 'Forecast', `${shortDate(p.startDate, x.start)} → ${shortDate(p.startDate, x.finish)}`],
        ['ES · EF · LS · LF', `${Math.round(x.es)} · ${Math.round(x.ef)} · ${Math.round(x.ls)} · ${Math.round(x.lf)}`],
        ['Total / free float', `${Math.round(x.tf)} d / ${Math.round(x.ff)} d${x.critical ? ' — critical' : ''}`],
      ]),
      dl([
        ['Predecessors', t.predecessors.length ? t.predecessors.map(linkText).join(', ') : 'none (start activity)'],
        ['Budget', fmtPKR(t.budget)],
        ['Crash', t.milestone ? '—' : `${t.crashDuration} d for ${fmtPKR(t.crashCost)} (slope ${fmtPKR(t.costSlope)}/d)`],
        ['Owner', d.owner || '—'],
        ['Delivery', t.delivery],
        ['Acceptance', d.acceptance || '—'],
      ]),
    ]),
    el('div', { class: 'row actions-row' }, [
      button('Show in 3D', () => { dash.sim.select(t.id); if (dash.sim.toast) dash.sim.toast(`${t.code} highlighted in the 3D site`, 'good'); }, { icon: 'eye', small: true }),
      button('Close', () => { dash.state.sel = null; dash.rerender(); }, { small: true, kind: 'ghost' }),
    ]),
  ], { cls: 'accent', sub: d.description || '' });
}

/* -------------------------------------------------------------- network */

function network(dash, pane, p) {
  const s = dash.state;
  const scope = s.nScope || 'cp';
  const basis = s.nBasis || 'forecast';
  let ids;
  if (scope === 'cp') {
    ids = (basis === 'forecast' && p.forecast ? p.forecast.criticalPath : p.baseline.criticalPath).slice();
    if (!ids.length) ids = p.baseline.criticalPath.slice();
  } else ids = p.tasks.filter((t) => t.summaryId === scope).map((t) => t.id);
  const set = new Set(ids);
  const nodes = ids.map((id) => {
    const t = p.taskById.get(id);
    const x = timing(p, t);
    const useB = basis === 'baseline';
    const n = useB ? x.bn : null;
    return {
      id, code: t.code, name: t.name, dur: useB ? t.duration : x.fn.duration, pct: x.st.pct, done: x.done,
      es: useB ? n.es : x.es, ef: useB ? n.ef : x.ef, ls: useB ? n.ls : x.ls, lf: useB ? n.lf : x.lf,
      tf: useB ? n.totalFloat : x.tf, ff: useB ? n.freeFloat : x.ff, critical: useB ? n.critical : x.critical,
      preds: t.predecessors.filter((l) => set.has(l.id)),
    };
  });
  if (scope !== 'cp') {
    const order = new Map(p.baseline.order.map((id, i) => [id, i]));
    nodes.sort((a, b) => order.get(a.id) - order.get(b.id));
  } else nodes.sort((a, b) => a.es - b.es || a.ef - b.ef);
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Show ', select([{ value: 'cp', label: 'Critical path (zero float)' }, ...p.summaries.map((sm) => ({ value: sm.id, label: `${sm.code} ${sm.name}` }))], scope, (v) => { s.nScope = v; dash.rerender(); })]),
    el('label', { class: 'inline' }, ['Dates ', select([{ value: 'forecast', label: 'Live forecast' }, { value: 'baseline', label: 'Baseline' }], basis, (v) => { s.nBasis = v; dash.rerender(); })]),
    el('span', { class: 'pm-note', text: 'Numbers are project days from 04 Jan 2027. Link labels show SS/FF/SF types and lags (negative = lead).' }),
  ]));
  const chart = networkChart(nodes, {
    layout: scope === 'cp' ? 'snake' : 'layered', perRow: 6, selected: s.sel, animate: animOnce(dash, `net-${scope}-${basis}`),
    label: scope === 'cp' ? 'Critical path network' : `Network for WBS ${scope}`,
    onNode: (n) => { s.sel = n.id; if (dash.sim.select) dash.sim.select(n.id); dash.rerender(); },
  });
  pane.appendChild(chartBox(chart, { minWidth: Number(chart.getAttribute('width')), cls: 'tall', caption: `${nodes.length} activities · red boxes and arrows are critical · the green bar under the name is % complete · scroll sideways for the whole chain` }));
  pane.appendChild(el('div', { class: 'pm-grid c12', style: { alignItems: 'center' } }, [
    chartBox(networkKey(), { minWidth: 200 }),
    el('p', { class: 'pm-note', html: '<b>Forward pass</b>: ES = latest constraint from the predecessors (FS: EF<sub>pred</sub> + lag; SS: ES<sub>pred</sub> + lag; FF: EF<sub>pred</sub> + lag − dur; SF: ES<sub>pred</sub> + lag − dur), EF = ES + duration.<br><b>Backward pass</b>: LF = earliest constraint from the successors, LS = LF − duration.<br><b>Total float</b> TF = LS − ES (slack before the project finish moves); <b>free float</b> = slack before the earliest successor moves. TF = 0 ⇒ critical.' }),
  ]));
  if (s.sel && p.taskById.has(s.sel)) pane.appendChild(detail(dash, p, p.taskById.get(s.sel)));
}

/* --------------------------------------------------------- activity list */

function activities(dash, pane, p) {
  const s = dash.state;
  const filt = s.aFilter || 'all';
  const list = p.tasks.filter((t) => filt === 'all' || (filt === 'crit' ? timing(p, t).critical : filt === 'links' ? t.predecessors.some((l) => (l.type || 'FS') !== 'FS' || l.lag) : t.summaryId === filt));
  const rows = list.map((t) => {
    const x = timing(p, t);
    return {
      id: t.id, code: t.code, name: t.name, dur: t.duration, omp: t.milestone ? '—' : `${t.o}/${t.m}/${t.p}`,
      preds: t.predecessors.map(linkText).join(', ') || '—', es: Math.round(x.es), ef: Math.round(x.ef), tf: Math.round(x.tf), ff: Math.round(x.ff),
      pct: x.st.pct, critical: x.critical, done: x.done, active: x.st.actualStart !== null && !x.done, milestone: t.milestone,
    };
  });
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Filter ', select([
      { value: 'all', label: `All (${p.tasks.length})` }, { value: 'crit', label: 'Critical only' }, { value: 'links', label: 'SS / FF / SF links & lags' },
      ...p.summaries.map((sm) => ({ value: sm.id, label: `${sm.code} ${sm.name}` })),
    ], filt, (v) => { s.aFilter = v; dash.rerender(); })]),
    el('span', { class: 'pm-note', text: 'FS finish-to-start · SS start-to-start · FF finish-to-finish · SF start-to-finish; +n = lag, −n = lead. Click a row to highlight it in 3D.' }),
  ]));
  pane.appendChild(table([
    { key: 'code', label: 'WBS' },
    { key: 'name', label: 'Activity', format: (v, r) => (r.milestone ? el('span', {}, ['◆ ', v]) : v) },
    { key: 'dur', label: 'Dur', num: true },
    { key: 'omp', label: 'O/M/P', title: 'Optimistic / most likely / pessimistic (days)' },
    { key: 'preds', label: 'Predecessors (type + lag)', format: (v) => el('span', { class: 'pm-mono small', text: v }) },
    { key: 'es', label: 'ES', num: true }, { key: 'ef', label: 'EF', num: true },
    { key: 'tf', label: 'TF', num: true, cls: (v, r) => (r.critical ? 'pm-neg' : '') }, { key: 'ff', label: 'FF', num: true },
    { key: 'pct', label: '%', num: true, format: (v) => pct(v) },
    { key: 'critical', label: 'Status', format: (v, r) => (r.done ? pill('Done', 'ok') : v ? pill('Critical', 'bad') : r.active ? pill('Active', 'info') : pill('Planned', 'muted')) },
  ], rows, { sortable: true, dense: true, rowClass: (r) => (r.critical ? 'critical' : ''), selected: (r) => r.id === s.sel, onRow: (r) => { s.sel = r.id; if (dash.sim.select) dash.sim.select(r.id); dash.rerender(); } }));
  if (s.sel && p.taskById.has(s.sel)) pane.appendChild(detail(dash, p, p.taskById.get(s.sel)));
}

/* ------------------------------------------------------------------- PERT */

function pert(dash, pane, p) {
  const s = dash.state;
  const basis = s.pBasis || 'baseline';
  const live = basis === 'forecast' && p.forecastPert;
  const mean = live ? fOff(p) + p.forecastPert.mean : p.pert.mean;
  const sigma = live ? p.forecastPert.sigma : p.pert.sigma;
  const lo = Math.round(mean - 3 * sigma);
  const hi = Math.round(mean + 3 * sigma);
  if (!Number.isFinite(s.pTarget) || s.pTarget < lo || s.pTarget > hi) s.pTarget = Math.max(lo, Math.min(hi, p.baselineDuration));
  const target = s.pTarget;
  const z = sigma > 0 ? (target - mean) / sigma : 0;
  const prob = normalCdf(z);
  const out = el('div', { class: 'grid c4 pm-kpis' });
  const fill = () => {
    out.replaceChildren(
      kpi({ label: 'Target finish', value: shortDate(p.startDate, s.pTarget), foot: `day ${s.pTarget}` }),
      kpi({ label: 'z = (T − μ) / σ', value: (sigma > 0 ? (s.pTarget - mean) / sigma : 0).toFixed(2), foot: `μ = ${Math.round(mean)} d · σ = ${sigma.toFixed(1)} d` }),
      kpi({ label: 'P(finish ≤ target)', value: pct(normalCdf(sigma > 0 ? (s.pTarget - mean) / sigma : 0)), cls: normalCdf(sigma > 0 ? (s.pTarget - mean) / sigma : 0) >= 0.8 ? 'good' : normalCdf(sigma > 0 ? (s.pTarget - mean) / sigma : 0) >= 0.5 ? 'warn' : 'bad', foot: 'Φ(z), normal approximation (CLT)' }),
      kpi({ label: 'P80 commitment date', value: shortDate(p.startDate, mean + inverseNormal(0.8) * sigma), foot: `μ + 0.84σ = day ${Math.round(mean + inverseNormal(0.8) * sigma)}` }),
    );
  };
  fill();
  const chartHost = el('div');
  const drawChart = (anim) => {
    chartHost.replaceChildren(chartBox(bellCurve(mean, sigma, s.pTarget, {
      animate: anim, targetLabel: `Target ${shortDate(p.startDate, s.pTarget)}`,
      xTicks: dayTicks(p.startDate, mean - 4 * sigma, mean + 4 * sigma, 8), vlines: [{ x: p.baselineDuration, label: 'Baseline finish', color: C.brass, dash: '2 4' }],
    }), { minWidth: 600, legend: legend([{ label: `Shaded area = P(finish ≤ target) = ${pct(normalCdf(sigma > 0 ? (s.pTarget - mean) / sigma : 0))}`, color: C.good, opacity: 0.4 }, { label: 'Normal PDF of the project duration', color: 'var(--c2)', shape: 'line' }]) }));
  };
  drawChart(animOnce(dash, `pert-${basis}`));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Basis ', select([{ value: 'baseline', label: 'Baseline plan' }, { value: 'forecast', label: 'Live forecast (remaining work)' }], basis, (v) => { s.pBasis = v; s.pTarget = NaN; dash.rerender(); })]),
    el('label', { class: 'inline' }, ['Target date ', slider(lo, hi, 1, target, (v) => { s.pTarget = v; fill(); drawChart(false); }, (v) => shortDate(p.startDate, v), { 'aria-label': 'Target finish day' })]),
  ]));
  pane.appendChild(out);
  pane.appendChild(chartHost);
  const path = (live ? (p.forecast.drivingPath || p.forecast.criticalPath) : (p.baseline.drivingPath || p.baseline.criticalPath)).map((id) => p.taskById.get(id)).filter((t) => t && !t.milestone);
  let sumVar = 0;
  let sumTe = 0;
  const rows = path.map((t) => {
    const te = pertDuration(t.o, t.m, t.p);
    const sg = pertSigma(t.o, t.p);
    sumVar += sg * sg; sumTe += te;
    return { code: t.code, name: t.name, o: t.o, m: t.m, p: t.p, te: te.toFixed(1), sg: sg.toFixed(2), v: (sg * sg).toFixed(1) };
  });
  rows.push({ code: 'Σ', name: 'Driving path (activities only; lags and gate reviews add fixed days)', o: '', m: '', p: '', te: sumTe.toFixed(0), sg: Math.sqrt(sumVar).toFixed(2), v: sumVar.toFixed(1) });
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Driving-path activities — three-point estimates', [table([
      { key: 'code', label: 'WBS' }, { key: 'name', label: 'Activity' }, { key: 'o', label: 'O', num: true }, { key: 'm', label: 'M', num: true }, { key: 'p', label: 'P', num: true },
      { key: 'te', label: 'tₑ = (O+4M+P)/6', num: true }, { key: 'sg', label: 'σ = (P−O)/6', num: true }, { key: 'v', label: 'σ²', num: true },
    ], rows, { dense: true })]),
    card('Confidence → commitment date', [
      table(['Confidence', 'z', 'Day', 'Date'], [0.5, 0.8, 0.9, 0.95].map((q) => {
        const zz = inverseNormal(q);
        const d = mean + zz * sigma;
        return [`P${Math.round(q * 100)}`, zz.toFixed(2), Math.round(d), shortDate(p.startDate, d)];
      }), { dense: true }),
      el('p', { class: 'pm-note', html: `Project σ = √Σσ² along the driving path = <b>${sigma.toFixed(1)} d</b>. PERT ignores <b>merge bias</b> where near-critical paths join (M07 has 21 predecessors), so it is optimistic — the Monte Carlo panel samples every path.` }),
      button('Open Monte Carlo forecast', () => dash.open('forecast'), { small: true, kind: 'ghost', icon: 'dice' }),
    ]),
  ]));
}

/* ------------------------------------------------------- crash & fast-track */

function compress(dash, pane, p) {
  const s = dash.state;
  const svd = Math.max(0, Math.round(p.scheduleVarianceDays));
  if (!Number.isFinite(s.cDays)) s.cDays = Math.max(10, Math.min(60, svd || 20));
  const key = `${p.day}|${p.baselineVersion}|${p.crashedDays}|${s.cDays}`;
  if (!s.cCache || s.cCache.key !== key) {
    const plan = p.crashPlan(s.cDays);
    const curve = [];
    for (let d = 0; d <= Math.max(10, s.cDays); d += Math.max(1, Math.round(Math.max(10, s.cDays) / 12))) {
      const pl = d === s.cDays ? plan : p.crashPlan(d);
      curve.push([p.forecastFinish - pl.recovered, pl.addedCost]);
    }
    s.cCache = { key, plan, curve };
  }
  const { plan, curve } = s.cCache;
  const rows = [...plan].sort((a, b) => a.slope - b.slope);
  pane.appendChild(el('p', { class: 'pm-note', html: '<b>Crashing</b> adds resources to critical activities in <b>cost-slope order</b> (slope = (crash cost − normal cost) / (normal − crash duration)), re-running CPM after every day bought because the critical path can shift. <b>Fast-tracking</b> overlaps a finish-to-start link: no direct cost, but rework risk rises.' }));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Days to recover ', slider(1, 90, 1, s.cDays, (v, commit) => { if (commit) { s.cDays = v; dash.rerender(); } }, (v) => `${v} d`, { 'aria-label': 'Days to recover' })]),
    el('span', { class: 'pm-note', text: `Current forecast variance: ${p.scheduleVarianceDays >= 0 ? '+' : ''}${Math.round(p.scheduleVarianceDays)} d` }),
  ]));
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Days recovered', value: `${plan.recovered} d`, foot: plan.shortfall ? `shortfall ${plan.shortfall} d (no more crash capacity)` : 'target met', cls: plan.shortfall ? 'warn' : 'good' }),
    kpi({ label: 'Added cost', value: fmtPKR(plan.addedCost), foot: 'drawn from management reserve' }),
    kpi({ label: 'Average cost per day', value: plan.recovered ? fmtPKR(plan.addedCost / plan.recovered) : '—', foot: `${plan.length} activities crashed` }),
    kpi({ label: 'Management reserve left', value: fmtPKR(p.managementRemaining), foot: `of ${fmtPKR(p.managementReserve)}`, cls: p.managementRemaining < plan.addedCost ? 'bad' : '' }),
  ]));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Crash plan (cost-slope order)', [
      table([
        { key: 'id', label: 'WBS' }, { key: 'name', label: 'Activity' }, { key: 'days', label: 'Days', num: true, format: (v) => Math.round(v) },
        { key: 'slope', label: 'Slope / day', num: true, format: (v) => fmtPKR(v) }, { key: 'cost', label: 'Cost', num: true, format: (v) => fmtPKR(v) },
      ], rows, { dense: true, empty: 'No crashable critical activity — the critical path is already at crash duration or complete.' }),
      el('div', { class: 'row actions-row' }, [
        button(`Apply crash plan (${plan.recovered} d)`, async () => {
          const ok = await confirmModal('Apply crash plan?', `Crash ${plan.length} activities to recover ${plan.recovered} days for ${fmtPKR(plan.addedCost)} from the management reserve. Crashing raises quality pressure on the crashed work.`, { okLabel: 'Apply' });
          if (!ok) return;
          const r = p.applyCrashPlan(s.cDays);
          dash.sim.toast(`Crash plan applied: forecast finish ${p.dateLabel(r.forecastFinish)} for ${fmtPKR(r.cost)}`, 'good');
          s.cCache = null;
          dash.rerender();
        }, { kind: 'primary', icon: 'check', disabled: !plan.length }),
      ]),
    ]),
    card('Time–cost trade-off', [chartBox(lineChart({
      width: 560, height: 260, label: 'Project time-cost trade-off curve',
      series: [{ label: 'Crash cost vs finish', points: curve.slice().sort((a, b) => a[0] - b[0]), color: C.crit, dots: true }],
      xFormat: (v) => shortDate(p.startDate, v).slice(3), yFormat: (v) => money(v), xLabel: 'Forecast finish', yLabel: 'Added crash cost (PKR)',
      vlines: [{ x: p.baselineDuration, label: 'Baseline', color: C.brass }], animate: animOnce(dash, 'tc'),
    }), { minWidth: 460, caption: 'Each point re-runs the iterative crash algorithm for more days. The curve steepens as cheap slopes are used up.' })]),
  ]));
  // single-activity crash & fast-track candidates
  const live = p.tasks.filter((t) => !t.milestone && p.state.get(t.id).pct < 1);
  const critLive = live.filter((t) => timing(p, t).critical);
  const crashRows = critLive.map((t) => {
    const st = p.state.get(t.id);
    const cap = Math.max(0, (t.duration - t.crashDuration) * (st.remainingWork / Math.max(1, t.duration)));
    return { id: t.id, name: t.name, rem: st.remainingWork, cap, slope: t.costSlope };
  }).filter((r) => r.cap >= 1).sort((a, b) => a.slope - b.slope);
  const ftRows = live.filter((t) => p.state.get(t.id).actualStart === null && t.predecessors.some((l) => (l.type || 'FS') === 'FS' && (l.lag || 0) >= 0 && p.taskById.get(l.id) && !p.taskById.get(l.id).milestone && p.state.get(l.id).pct < 1))
    .map((t) => ({ id: t.id, name: t.name, crit: timing(p, t).critical, tf: timing(p, t).tf, preds: t.predecessors.filter((l) => (l.type || 'FS') === 'FS').map((l) => l.id).join(', ') }))
    .sort((a, b) => a.tf - b.tf).slice(0, 12);
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Crash one critical activity', [table([
      { key: 'id', label: 'WBS' }, { key: 'name', label: 'Activity' }, { key: 'rem', label: 'Remaining', num: true, format: (v) => `${Math.round(v)} d` },
      { key: 'cap', label: 'Capacity', num: true, format: (v) => `${Math.floor(v)} d` }, { key: 'slope', label: 'Slope / d', num: true, format: (v) => fmtPKR(v) },
      { key: 'id', label: '', format: (v, r) => button(`Crash ${Math.min(5, Math.floor(r.cap))} d`, () => {
        const res = p.crashActivity(v, Math.min(5, Math.floor(r.cap)));
        dash.sim.toast(res.ok ? `${v} crashed by ${Math.round(res.days)} d for ${fmtPKR(res.cost)}` : res.message, res.ok ? 'good' : 'warn');
        s.cCache = null; dash.rerender();
      }, { small: true }) },
    ], crashRows, { dense: true, empty: 'No critical activity has crash capacity left.' })]),
    card('Fast-track (overlap a finish-to-start link)', [table([
      { key: 'id', label: 'WBS' }, { key: 'name', label: 'Activity' }, { key: 'preds', label: 'FS from' },
      { key: 'tf', label: 'TF', num: true, format: (v, r) => (r.crit ? pill('0 · CP', 'bad') : `${Math.round(v)} d`) },
      { key: 'id', label: '', format: (v) => button('Fast-track', async () => {
        const ok = await confirmModal(`Fast-track ${v}?`, 'The driving finish-to-start link becomes a lead of 30 % of the shorter duration. No direct cost, but rework risk R26 rises by 5 percentage points.', { okLabel: 'Fast-track' });
        if (!ok) return;
        const res = p.fastTrack(v);
        dash.sim.toast(res.ok ? `${res.message} Forecast ${res.daysSaved >= 0 ? 'gains' : 'loses'} ${Math.abs(res.daysSaved)} d.` : res.message, res.ok ? (res.daysSaved > 0 ? 'good' : 'warn') : 'warn');
        s.cCache = null; dash.rerender();
      }, { small: true, kind: 'ghost' }) },
    ], ftRows, { dense: true, empty: 'No unstarted activity with an open finish-to-start predecessor.' }),
    el('p', { class: 'pm-note', text: 'Fast-tracking only saves time when the overlapped link is on the critical path — try a non-critical one and watch the forecast not move.' })]),
  ]));
}

function money(v) {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)} bn` : `${Math.round(v / M)} m`;
}

/* ---------------------------------------------------- resource levelling */

function level(dash, pane, p) {
  const s = dash.state;
  const res = p.resources;
  if (!s.lRes || !p.resourceById.has(s.lRes)) s.lRes = res.slice().sort((a, b) => b.peakDemand / b.capacity - a.peakDemand / a.capacity)[0].id;
  const r = p.resourceById.get(s.lRes);
  const off = fOff(p);
  const from = p.day;
  const to = Math.max(p.forecastFinish, p.day + 30);
  const bucket = 30;
  const nb = Math.ceil((to - from) / bucket);
  const demand = new Array(nb).fill(0);
  for (const t of p.tasks) {
    const c = t.crew[r.id];
    if (!c) continue;
    const st = p.state.get(t.id);
    if (st.pct >= 1) continue;
    const fn = p.forecast.nodes.get(t.id);
    const a = Math.max(from, off + fn.es);
    const b = Math.max(a, off + fn.ef);
    for (let d = Math.floor(a); d < Math.ceil(b); d++) {
      const k = Math.floor((d - from) / bucket);
      if (k >= 0 && k < nb) demand[k] += c / bucket;
    }
  }
  const cats = demand.map((_, k) => shortDate(p.startDate, from + k * bucket).slice(3));
  pane.appendChild(el('p', { class: 'pm-note', html: '<b>Resource smoothing</b> moves non-critical, unstarted work within its <b>free float</b> to flatten peaks without moving the finish date. <b>Resource levelling</b> (resource-constrained scheduling) may extend the finish when capacity is the binding constraint.' }));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Resource ', select(res.map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` })), s.lRes, (v) => { s.lRes = v; dash.rerender(); })]),
    button('Smooth resources within free float', () => {
      const rep = p.levelResources();
      s.lReport = { ...rep, day: p.day };
      dash.sim.toast(`${rep.shifted.length} activities shifted within free float; finish date protected`, 'good');
      dash.rerender();
    }, { kind: 'primary', icon: 'people' }),
  ]));
  pane.appendChild(chartBox(barChart({
    width: 980, height: 270, label: `${r.name} demand by month`, categories: cats, maxLabels: 16,
    series: [{ label: `${r.name} average daily demand`, values: demand, colors: demand.map((v) => (v > r.capacity ? 'var(--bad)' : 'var(--c2)')) }],
    hlines: [{ y: r.capacity, label: `Capacity ${r.capacity}`, color: C.warn }, { y: r.peakDemand, label: `Baseline peak ${Math.round(r.peakDemand)}`, color: C.brass, dash: '2 4' }],
    yFormat: (v) => String(Math.round(v)), animate: animOnce(dash, `lvl-${s.lRes}`),
  }), { minWidth: 640, legend: legend([{ label: 'Forecast demand (30-day average)', color: 'var(--c2)' }, { label: 'Over capacity', color: 'var(--bad)' }, { label: 'Available capacity', color: C.warn, shape: 'line', dash: '6 5' }]) }));
  const parts = [card('Resource pool — today', [table([
    { key: 'name', label: 'Resource' }, { key: 'unit', label: 'Unit' }, { key: 'capacity', label: 'Capacity', num: true },
    { key: 'assigned', label: 'Assigned', num: true, format: (v) => Math.round(v) }, { key: 'required', label: 'Required', num: true, format: (v) => Math.round(v) },
    { key: 'utilisation', label: 'Utilisation', num: true, format: (v) => pct(v), cls: (v) => (v > 1 ? 'pm-neg' : v > 0.9 ? 'pm-warn' : '') },
  ], res, { dense: true, onRow: (x) => { s.lRes = x.id; dash.rerender(); }, selected: (x) => x.id === s.lRes })])];
  if (s.lReport) {
    parts.push(card(`Smoothing report (day ${s.lReport.day})`, [
      table([
        { key: 'name', label: 'Resource' }, { key: 'capacity', label: 'Capacity', num: true },
        { key: 'peakBefore', label: 'Peak before', num: true, format: (v) => Math.round(v) }, { key: 'peakAfter', label: 'Peak after', num: true, format: (v, row) => el('span', { class: row.peakAfter < row.peakBefore ? 'pm-pos' : '', text: String(Math.round(v)) }) },
      ], s.lReport.resources, { dense: true }),
      el('p', { class: 'pm-note', text: s.lReport.shifted.length ? `Shifted: ${s.lReport.shifted.map((x) => `${x.id} +${x.days} d`).join(', ')}.` : 'No activity had enough free float (≥ 7 d) to improve a peak.' }),
      el('p', { class: 'pm-note', text: s.lReport.method }),
    ]));
  }
  pane.appendChild(el('div', { class: `pm-grid ${parts.length > 1 ? 'c2' : ''}` }, parts));
}
