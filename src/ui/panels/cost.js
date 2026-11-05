import { el, kpi, button, table, tabs, pill, select, fmtPKR, fmtIndex, fmtPct, indexClass } from '../dom.js';
import {
  C, chartBox, legend, lineChart, barChart, hbarChart, waterfallChart, dayTicks, shortDate, money, section, card, animOnce, dl,
} from '../charts.js';

/**
 * Cost & Earned Value (Week 6/9): estimating methods with worked numbers,
 * the cost baseline with contingency and management reserve, funding-limit
 * reconciliation, the PV/EV/AC S-curve with an EAC projection, every EVM
 * formula with its live value, and cost breakdowns by WBS and cost type.
 */

const TABS = [
  { id: 'evm', label: 'Earned value', icon: 'stats' },
  { id: 'baseline', label: 'Cost baseline & funding', icon: 'coins' },
  { id: 'estimate', label: 'Estimating methods', icon: 'table' },
  { id: 'breakdown', label: 'Breakdown', icon: 'layers' },
];

const bn = (v, d = 2) => (Number.isFinite(v) ? (v / 1e9).toFixed(d) : '—');
const sgn = (v, d = 2) => `${v >= 0 ? '+' : '−'}${bn(Math.abs(v), d)}`;

export const PANEL_COST = {
  id: 'cost',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'evm';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const e = p.evm();
    body.appendChild(el('p', { class: 'lede', text: `Budget at completion is ${fmtPKR(p.bac)} across ${p.summaries.length} control accounts. Earned value compares what was planned (PV), what was achieved (EV) and what it cost (AC) — the three numbers every status report starts from.` }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'BAC', value: fmtPKR(p.bac), foot: `baseline v${p.baselineVersion}` }),
      kpi({ label: 'EV / PV / AC', value: `${bn(e.ev, 1)} / ${bn(e.pv, 1)} / ${bn(e.ac, 1)}`, foot: 'PKR bn' }),
      kpi({ label: 'CPI · SPI', value: `${fmtIndex(e.cpi)} · ${fmtIndex(e.spi)}`, foot: `CV ${sgn(e.cv)} bn · SV ${sgn(e.sv)} bn`, cls: indexClass(Math.min(e.cpi, e.spi)) }),
      kpi({ label: 'EAC (BAC ÷ CPI)', value: fmtPKR(e.eac.cpi), foot: `VAC ${sgn(e.vac)} bn · TCPI ${fmtIndex(e.tcpi.bac)}`, cls: e.vac < 0 ? (e.vac < -0.05 * p.bac ? 'bad' : 'warn') : 'good' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ evm, baseline, estimate, breakdown })[s.tab](dash, pane, p, e);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · EVM recorded weekly (${p.evmHistory.length} points)` })]));
  },
};

/* ------------------------------------------------------------------ EVM */

function evm(dash, pane, p, e) {
  const hist = p.evmHistory.slice();
  if (!hist.length || hist[hist.length - 1].day !== p.day) hist.push({ day: p.day, pv: e.pv, ev: e.ev, ac: e.ac });
  const D = p.baselineDuration;
  const pv = [];
  const step = Math.max(1, Math.round(D / 160));
  for (let d = 0; d <= D; d += step) pv.push([d, p.plannedValueAt(d)]);
  pv.push([D, p.plannedValueAt(D)]);
  const ff = Math.max(p.forecastFinish, D);
  const horizon = [0, Math.max(D, ff, p.day) + 40];
  const eacLine = [[p.day, e.ac], [ff, e.eac.cpi]];
  const evProj = [[p.day, e.ev], [ff, p.bac]];
  pane.appendChild(chartBox(lineChart({
    width: 1000, height: 330, label: 'Earned value S-curve', xDomain: horizon,
    series: [
      { label: 'PV — planned value (baseline)', points: pv, color: C.pv, width: 2.2, area: true, areaOpacity: 0.07 },
      { label: 'EV — earned value', points: hist.map((h) => [h.day, h.ev]), color: C.ev, width: 3 },
      { label: 'AC — actual cost', points: hist.map((h) => [h.day, h.ac]), color: C.ac, width: 3 },
      { label: 'EAC projection (BAC ÷ CPI)', points: eacLine, color: C.ac, width: 2, dash: '6 5' },
      { label: 'EV to completion (forecast)', points: evProj, color: C.ev, width: 2, dash: '2 5' },
    ],
    xTicks: dayTicks(p.startDate, horizon[0], horizon[1], 9), yFormat: (v) => money(v),
    hlines: [{ y: p.bac, label: `BAC ${bn(p.bac, 1)} bn`, color: C.brass }, { y: e.eac.cpi, label: `EAC ${bn(e.eac.cpi, 1)} bn`, color: C.ac, dash: '3 4' }],
    vlines: [{ x: p.day, label: 'Today', color: 'var(--amber)', dash: '' }, { x: D, label: 'Baseline finish', color: C.brass }, ...(ff > D + 3 ? [{ x: ff, label: 'Forecast finish', color: C.ac }] : [])],
    marks: [{ x: p.day, y: e.ev, color: C.ev, label: `EV ${bn(e.ev)} bn` }, { x: p.day, y: e.ac, color: C.ac, label: `AC ${bn(e.ac)} bn` }, { x: p.day, y: e.pv, color: C.pv, label: `PV ${bn(e.pv)} bn` }],
    animate: animOnce(dash, 'scurve'), yLabel: 'PKR (cumulative)',
  }), {
    minWidth: 700,
    legend: legend([
      { label: 'PV', color: C.pv, shape: 'line' }, { label: 'EV', color: C.ev, shape: 'line' }, { label: 'AC', color: C.ac, shape: 'line' },
      { label: 'EAC projection', color: C.ac, shape: 'line', dash: '6 5' }, { label: 'BAC', color: C.brass, shape: 'line', dash: '6 5' },
    ]),
    caption: 'EV below PV = behind schedule; AC above EV = over budget. The dashed red line runs from today’s AC to the EAC at the forecast finish.',
  }));
  pane.appendChild(section('Every EVM formula — live', 'PMBOK / PMI Practice Standard for EVM, earned schedule (Lipke)'));
  pane.appendChild(evmTable(p, e));
}

function evmTable(p, e) {
  const g = (label) => ({ group: label });
  const at = p.day;
  const ieac = e.spit > 0 ? p.baselineDuration / e.spit : NaN;
  const rows = [
    g('Status (PKR bn)'),
    { m: 'BAC', f: 'Σ work-package budgets', v: bn(p.bac), x: `${p.summaries.length} control accounts, ${p.tasks.filter((t) => !t.milestone).length} work packages` },
    { m: 'PV', f: 'Σ budget × planned % at status date', v: bn(e.pv), x: `${fmtPct(e.pv / p.bac, 1)} of the work was scheduled by today` },
    { m: 'EV', f: 'Σ budget × actual % complete', v: bn(e.ev), x: `${fmtPct(e.percentComplete, 1)} of the work is done` },
    { m: 'AC', f: 'Σ actual cost incurred', v: bn(e.ac), x: `${fmtPct(e.percentSpent, 1)} of BAC spent` },
    g('Variances'),
    { m: 'SV', f: `EV − PV = ${bn(e.ev)} − ${bn(e.pv)}`, v: sgn(e.sv), cls: e.sv >= 0 ? 'pm-pos' : 'pm-neg', x: e.sv >= 0 ? 'Ahead of plan in value terms' : 'Less work earned than planned' },
    { m: 'CV', f: `EV − AC = ${bn(e.ev)} − ${bn(e.ac)}`, v: sgn(e.cv), cls: e.cv >= 0 ? 'pm-pos' : 'pm-neg', x: e.cv >= 0 ? 'Under budget for work done' : 'Work done cost more than budgeted' },
    { m: 'SV %', f: 'SV ÷ PV', v: fmtPct(e.svPct, 1), x: '±5 % threshold triggers a variance explanation' },
    { m: 'CV %', f: 'CV ÷ EV', v: fmtPct(e.cvPct, 1), x: '±5 % threshold triggers a variance explanation' },
    g('Performance indices'),
    { m: 'SPI', f: `EV ÷ PV = ${bn(e.ev)} ÷ ${bn(e.pv)}`, v: fmtIndex(e.spi), cls: indexClass(e.spi) === 'good' ? 'pm-pos' : 'pm-neg', x: `Earning PKR ${e.spi.toFixed(2)} of work per rupee planned` },
    { m: 'CPI', f: `EV ÷ AC = ${bn(e.ev)} ÷ ${bn(e.ac)}`, v: fmtIndex(e.cpi), cls: indexClass(e.cpi) === 'good' ? 'pm-pos' : 'pm-neg', x: `Getting PKR ${e.cpi.toFixed(2)} of value per rupee spent` },
    g('Estimate at completion (four methods)'),
    { m: 'EAC₁ typical', f: `BAC ÷ CPI = ${bn(p.bac)} ÷ ${e.cpi.toFixed(3)}`, v: bn(e.eac.cpi), x: 'Past cost performance continues (the default)' },
    { m: 'EAC₂ atypical', f: `AC + (BAC − EV) = ${bn(e.ac)} + ${bn(p.bac - e.ev)}`, v: bn(e.eac.atBudget), x: 'Variance was a one-off; rest goes to plan' },
    { m: 'EAC₃ composite', f: `AC + (BAC − EV) ÷ (CPI × SPI)`, v: bn(e.eac.composite), x: `Cost and schedule both drive the remainder (CPI×SPI = ${(e.cpi * e.spi).toFixed(3)})` },
    { m: 'EAC₄ bottom-up', f: 'AC + bottom-up ETC (re-estimate)', v: bn(e.eac.bottomUp), x: 'Remaining materials at today’s prices + remaining labour days' },
    { m: 'ETC', f: `EAC − AC = ${bn(e.eac.cpi)} − ${bn(e.ac)}`, v: bn(e.etc), x: `Bottom-up ETC: ${bn(e.etcs.bottomUp)} · composite: ${bn(e.etcs.composite)}` },
    { m: 'VAC', f: `BAC − EAC = ${bn(p.bac)} − ${bn(e.eac.cpi)}`, v: sgn(e.vac), cls: e.vac >= 0 ? 'pm-pos' : 'pm-neg', x: `Range across methods ${sgn(Math.min(...Object.values(e.vacs)))} … ${sgn(Math.max(...Object.values(e.vacs)))} bn` },
    g('To-complete performance index'),
    { m: 'TCPI (BAC)', f: `(BAC − EV) ÷ (BAC − AC) = ${bn(p.bac - e.ev)} ÷ ${bn(p.bac - e.ac)}`, v: fmtIndex(e.tcpi.bac, 3), cls: e.tcpi.bac > 1.1 ? 'pm-neg' : e.tcpi.bac > 1 ? 'pm-warn' : 'pm-pos', x: e.tcpi.bac > 1.1 ? 'Unrealistic to finish within BAC — re-baseline the EAC' : e.tcpi.bac > 1 ? 'Remaining work must be done more efficiently than so far' : 'BAC is achievable at current efficiency' },
    { m: 'TCPI (EAC)', f: `(BAC − EV) ÷ (EAC − AC)`, v: fmtIndex(e.tcpi.eac, 3), x: 'Efficiency needed to hit the approved EAC' },
    g('Earned schedule (time-based)'),
    { m: 'ES', f: 'C + (EV − PV_C) ÷ (PV_C+1 − PV_C)', v: `${e.es.toFixed(1)} d`, x: `Today’s EV was planned for ${shortDate(p.startDate, e.es)}` },
    { m: 'SV(t)', f: `ES − AT = ${e.es.toFixed(1)} − ${at}`, v: `${e.svt >= 0 ? '+' : ''}${e.svt.toFixed(1)} d`, cls: e.svt >= 0 ? 'pm-pos' : 'pm-neg', x: 'Schedule variance in days (does not decay to 0 at the end, unlike SV)' },
    { m: 'SPI(t)', f: `ES ÷ AT = ${e.es.toFixed(1)} ÷ ${at}`, v: fmtIndex(e.spit, 3), cls: e.spit >= 0.95 ? 'pm-pos' : 'pm-neg', x: 'Time efficiency' },
    { m: 'IEAC(t)', f: `PD ÷ SPI(t) = ${p.baselineDuration} ÷ ${e.spit.toFixed(3)}`, v: Number.isFinite(ieac) ? `${Math.round(ieac)} d` : '—', x: Number.isFinite(ieac) ? `Independent finish estimate ${shortDate(p.startDate, ieac)} (CPM forecast ${shortDate(p.startDate, p.forecastFinish)})` : '' },
  ];
  return table([
    { key: 'm', label: 'Measure', format: (v, r) => (r.group ? r.group : el('b', { text: v })) },
    { key: 'f', label: 'Formula (with live numbers)', format: (v, r) => (r.group ? '' : el('span', { class: 'formula', text: v })) },
    { key: 'v', label: 'Value', num: true, format: (v, r) => (r.group ? '' : el('span', { class: `pm-mono ${r.cls || ''}`, text: v })) },
    { key: 'x', label: 'Interpretation', cls: 'interp', format: (v, r) => (r.group ? '' : v) },
  ], rows, { rowClass: (r) => (r.group ? 'group' : ''), dense: true });
}

/* ------------------------------------------------------ baseline & funding */

function baseline(dash, pane, p, e) {
  const steps = p.summaries.map((sm) => ({ label: `${sm.code} ${sm.name.replace(/ \(.*\)/, '')}`, value: sm.budget, color: 'var(--c1)' }));
  steps.push({ label: 'BAC (performance baseline)', total: true, color: 'var(--c2)' });
  steps.push({ label: 'Contingency reserve', value: p.contingencyReserve, color: 'var(--warn)' });
  steps.push({ label: 'Cost baseline', total: true, color: 'var(--c7)' });
  steps.push({ label: 'Management reserve', value: p.managementReserve, color: 'var(--c6)' });
  steps.push({ label: 'Project budget', total: true, color: 'var(--c4)' });
  const total = p.bac + p.contingencyReserve + p.managementReserve;
  pane.appendChild(el('div', { class: 'pm-grid c4 pm-kpis' }, [
    kpi({ label: 'Cost baseline', value: fmtPKR(p.bac + p.contingencyReserve), foot: 'BAC + contingency reserve' }),
    kpi({ label: 'Project budget', value: fmtPKR(total), foot: 'cost baseline + management reserve' }),
    kpi({ label: 'Contingency left', value: fmtPKR(p.contingencyRemaining), foot: `${fmtPct(p.contingencyRemaining / Math.max(1, p.contingencyReserve))} of ${fmtPKR(p.contingencyReserve)} (known-unknowns)`, cls: p.contingencyRemaining < 0.25 * p.contingencyReserve ? 'bad' : p.contingencyRemaining < 0.5 * p.contingencyReserve ? 'warn' : 'good' }),
    kpi({ label: 'Management reserve left', value: fmtPKR(p.managementRemaining), foot: `${fmtPct(p.managementRemaining / Math.max(1, p.managementReserve))} of ${fmtPKR(p.managementReserve)} (unknown-unknowns)`, cls: p.managementRemaining < 0.25 * p.managementReserve ? 'bad' : '' }),
  ]));
  pane.appendChild(chartBox(waterfallChart(steps, { width: 1080, height: 320, label: 'Cost baseline build-up', animate: animOnce(dash, 'wf') }), {
    minWidth: 900,
    caption: 'Work-package estimates roll up to control accounts (WBS level 1) and the BAC; the contingency reserve (sized from the EMV of identified threats) completes the cost baseline; the management reserve sits outside the baseline and needs sponsor approval to use.',
  }));
  // funding reconciliation
  const D = p.baselineDuration;
  const pvPts = [];
  for (let d = 0; d <= D; d += Math.max(1, Math.round(D / 150))) pvPts.push([d, p.plannedValueAt(d) + p.contingencyReserve * (d / D)]);
  const fund = [];
  let prevEnd = 0;
  const yearEnd = (y) => Math.round((Date.UTC(y + 1, 0, 1) - p.startDate.getTime()) / 86400000);
  for (const f of p.fundingLimits) {
    const end = Math.min(yearEnd(f.year), D + 60);
    fund.push([prevEnd, f.limit], [end, f.limit]);
    prevEnd = end;
  }
  const hist = p.evmHistory.map((h) => [h.day, h.ac]);
  hist.push([p.day, p.ac]);
  pane.appendChild(section('Funding-limit reconciliation', 'cumulative spend must stay under each year’s funding ceiling'));
  const rows = p.fundingLimits.map((f) => {
    const end = Math.min(yearEnd(f.year), D);
    const need = p.plannedValueAt(end) + p.contingencyReserve * (end / D);
    const acAt = end <= p.day ? (p.evmHistory.filter((h) => h.day <= end).slice(-1)[0] || { ac: 0 }).ac : null;
    return { year: f.year, limit: f.limit, pv: need, head: f.limit - need, ac: acAt };
  });
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    chartBox(lineChart({
      width: 720, height: 290, label: 'Funding limit vs planned spending', xDomain: [0, D + 60],
      series: [
        { label: 'Funding limit (cumulative ceiling)', points: fund, color: C.warn, width: 2.4, step: false },
        { label: 'Cost baseline (PV + contingency, cumulative)', points: pvPts, color: C.pv, width: 2.2 },
        { label: 'Actual cost', points: hist, color: C.ac, width: 2.8 },
      ],
      xTicks: dayTicks(p.startDate, 0, D + 60, 6), vlines: [{ x: p.day, label: 'Today', color: 'var(--amber)', dash: '' }], animate: animOnce(dash, 'fund'),
    }), { minWidth: 520, legend: legend([{ label: 'Funding ceiling', color: C.warn, shape: 'line' }, { label: 'Cost baseline', color: C.pv, shape: 'line' }, { label: 'AC', color: C.ac, shape: 'line' }]) }),
    card('Year-by-year reconciliation', [table([
      { key: 'year', label: 'Year' }, { key: 'limit', label: 'Ceiling', num: true, format: (v) => bn(v) },
      { key: 'pv', label: 'Planned', num: true, format: (v) => bn(v) }, { key: 'head', label: 'Headroom', num: true, format: (v) => el('span', { class: v >= 0 ? 'pm-pos' : 'pm-neg', text: sgn(v) }) },
      { key: 'ac', label: 'Actual', num: true, format: (v, r) => (v === null ? '—' : el('span', { class: v > r.limit ? 'pm-neg' : '', text: bn(v) })) },
    ], rows, { dense: true }), el('p', { class: 'pm-note', text: 'PKR bn. Where planned spending would breach a ceiling, the schedule is re-sequenced (work moved within float) or the sponsor requests a funding re-phase — a classic integration trade-off.' })]),
  ]));
  pane.appendChild(section('Reserve drawdown'));
  const used = { risk: p.costBreakdown.risk, quality: p.costBreakdown.quality, claims: p.costBreakdown.claims, crash: p.costBreakdown.crash, management: p.costBreakdown.management };
  const changes = p.changes.filter((c) => c.status === 'Implemented').reduce((a, c) => a + c.impact.cost, 0);
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Contingency reserve (inside the cost baseline)', [
      bar2(p.contingencyReserve - p.contingencyRemaining, p.contingencyReserve, 'var(--warn)'),
      dl([['Reserve', fmtPKR(p.contingencyReserve)], ['Drawn for realised risks', fmtPKR(used.risk)], ['Drawn for rework (quality)', fmtPKR(used.quality)], ['Drawn for contractor claims', fmtPKR(used.claims)], ['Remaining', fmtPKR(p.contingencyRemaining)]]),
    ]),
    card('Management reserve (outside the baseline)', [
      bar2(p.managementReserve - p.managementRemaining, p.managementReserve, 'var(--c6)'),
      dl([['Reserve', fmtPKR(p.managementReserve)], ['Approved change requests', fmtPKR(changes)], ['Crashing', fmtPKR(used.crash)], ['Risk responses & management actions', fmtPKR(used.management)], ['Remaining', fmtPKR(p.managementRemaining)]]),
    ]),
  ]));
}

function bar2(usedV, total, color) {
  const f = Math.max(0, Math.min(1, usedV / Math.max(1, total)));
  return el('div', { class: 'bar', style: { height: '10px', margin: '0.2rem 0 0.6rem' }, role: 'progressbar', 'aria-valuenow': Math.round(f * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, title: `${Math.round(f * 100)}% drawn` }, [el('i', { style: { width: `${f * 100}%`, background: color } })]);
}

/* ------------------------------------------------------------ estimating */

function estimate(dash, pane, p) {
  const s = dash.state;
  const rw = p.summaries.find((x) => x.id === '3');
  const term = p.summaries.find((x) => x.id === '7');
  // Analogous: a simulated reference project scaled for size and escalation.
  const ref = { cost: 8.1e9, length: 2800, year: 2022 };
  const ourLen = 3505;
  const esc = 0.11;
  const years = 2027 - ref.year;
  const analog = ref.cost * (ourLen / ref.length) * Math.pow(1 + esc, years);
  // Parametric: terminal floor area × unit rate (both simulated, editable).
  if (!Number.isFinite(s.area)) s.area = 22000;
  if (!Number.isFinite(s.rate)) s.rate = 380000;
  const param = s.area * s.rate;
  const anaDiff = (analog - rw.budget) / rw.budget;
  const parDiff = (param - term.budget) / term.budget;
  const paramOut = el('span', { class: 'pm-mono', text: fmtPKR(param) });
  const paramDiff = el('span', { class: Math.abs(parDiff) < 0.15 ? 'pm-pos' : 'pm-warn', text: `${parDiff >= 0 ? '+' : ''}${(parDiff * 100).toFixed(0)}%` });
  const num = (v, min, max, stepV, on) => {
    const i = el('input', { type: 'number', min, max, step: stepV, value: v, style: { width: '8rem' } });
    i.addEventListener('input', () => { const x = Number(i.value); if (Number.isFinite(x) && x > 0) on(x); });
    return i;
  };
  const upd = () => {
    const v = s.area * s.rate;
    const d = (v - term.budget) / term.budget;
    paramOut.textContent = fmtPKR(v);
    paramDiff.textContent = `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%`;
    paramDiff.className = Math.abs(d) < 0.15 ? 'pm-pos' : 'pm-warn';
  };
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Analogous (top-down)', [
      el('p', { text: 'Scale the actual cost of a similar past project. Fast and cheap, accuracy only ±25–50 % — used for the business case and charter.' }),
      dl([
        ['Reference', `Runway rehabilitation & extension, ${ref.length.toLocaleString('en-US')} m, completed ${ref.year}: ${fmtPKR(ref.cost)} (simulated reference)`],
        ['Size factor', `${ourLen.toLocaleString('en-US')} m ÷ ${ref.length.toLocaleString('en-US')} m = ${(ourLen / ref.length).toFixed(3)}`],
        ['Escalation', `(1 + ${esc * 100}%)^${years} = ${Math.pow(1 + esc, years).toFixed(3)}`],
        ['Estimate', el('b', { class: 'pm-mono', text: `${bn(ref.cost)} × ${(ourLen / ref.length).toFixed(3)} × ${Math.pow(1 + esc, years).toFixed(3)} = ${fmtPKR(analog)}` })],
        ['Bottom-up (WBS 3)', `${fmtPKR(rw.budget)} → analogous is ${anaDiff >= 0 ? '+' : ''}${(anaDiff * 100).toFixed(0)}%`],
      ]),
    ], { sub: 'Rough order of magnitude' }),
    card('Parametric', [
      el('p', { text: 'A statistical cost-estimating relationship: quantity × unit rate. Try other area or rate assumptions — the estimate updates as you type.' }),
      el('div', { class: 'pm-toolbar' }, [
        el('label', { class: 'inline' }, ['Terminal GFA (m²) ', num(s.area, 5000, 80000, 500, (x) => { s.area = x; upd(); })]),
        el('label', { class: 'inline' }, ['Rate (PKR / m²) ', num(s.rate, 50000, 1200000, 5000, (x) => { s.rate = x; upd(); })]),
      ]),
      dl([['Estimate', paramOut], ['Bottom-up (WBS 7)', fmtPKR(term.budget)], ['Difference', paramDiff]]),
      el('p', { class: 'pm-note', text: 'Area and unit rate are simulated planning assumptions, not published figures.' }),
    ], { sub: 'Cost-estimating relationship' }),
  ]));
  // bottom-up
  if (!s.buSum) s.buSum = '3';
  const sm = p.summaries.find((x) => x.id === s.buSum) || p.summaries[0];
  const leaves = p.tasks.filter((t) => t.summaryId === sm.id && !t.milestone);
  const rows = leaves.map((t) => ({ code: t.code, name: t.name, dur: t.duration, lab: t.labourBudget, mat: t.materialBudget, total: t.budget }));
  rows.push({ code: 'Σ', name: `Control account ${sm.code}`, dur: '', lab: leaves.reduce((a, t) => a + t.labourBudget, 0), mat: leaves.reduce((a, t) => a + t.materialBudget, 0), total: leaves.reduce((a, t) => a + t.budget, 0) });
  // three-point
  if (!s.tpTask || !p.taskById.has(s.tpTask)) s.tpTask = '3.5';
  const t = p.taskById.get(s.tpTask);
  const cost = (d) => t.materialBudget + t.dailyLabour * d;
  const cO = cost(t.o);
  const cM = cost(t.m);
  const cP = cost(t.p);
  const tri = (cO + cM + cP) / 3;
  const beta = (cO + 4 * cM + cP) / 6;
  const sd = (cP - cO) / 6;
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Bottom-up', [
      el('div', { class: 'pm-toolbar' }, [el('label', { class: 'inline' }, ['Control account ', select(p.summaries.map((x) => ({ value: x.id, label: `${x.code} ${x.name}` })), s.buSum, (v) => { s.buSum = v; dash.rerender(); })])]),
      table([
        { key: 'code', label: 'WBS' }, { key: 'name', label: 'Work package' }, { key: 'dur', label: 'Days', num: true },
        { key: 'lab', label: 'Labour', num: true, format: (v) => money(v) }, { key: 'mat', label: 'Materials & plant', num: true, format: (v) => money(v) }, { key: 'total', label: 'Estimate', num: true, format: (v) => money(v) },
      ], rows, { dense: true, rowClass: (r) => (r.code === 'Σ' ? 'group' : '') }),
      el('p', { class: 'pm-note', text: 'Labour = crew × day rate × PERT duration; materials and plant make up the rest. Most accurate (−5 %/+10 %), but needs a complete WBS.' }),
    ], { sub: 'Roll up work-package estimates' }),
    card('Three-point (PERT / triangular)', [
      el('div', { class: 'pm-toolbar' }, [el('label', { class: 'inline' }, ['Work package ', select(p.tasks.filter((x) => !x.milestone).map((x) => ({ value: x.id, label: `${x.code} ${x.name}` })), s.tpTask, (v) => { s.tpTask = v; dash.rerender(); })])]),
      table(['Scenario', 'Duration', 'Cost'], [
        ['Optimistic (O)', `${t.o} d`, fmtPKR(cO)], ['Most likely (M)', `${t.m} d`, fmtPKR(cM)], ['Pessimistic (P)', `${t.p} d`, fmtPKR(cP)],
      ], { dense: true }),
      dl([
        ['Triangular', el('span', { class: 'formula', text: `(O + M + P) ÷ 3 = ${fmtPKR(tri)}` })],
        ['Beta / PERT', el('span', { class: 'formula', text: `(O + 4M + P) ÷ 6 = ${fmtPKR(beta)}` })],
        ['σ', el('span', { class: 'formula', text: `(P − O) ÷ 6 = ${fmtPKR(sd)}` })],
        ['≈ 68 % range', `${fmtPKR(beta - sd)} – ${fmtPKR(beta + sd)}`],
        ['≈ 95 % range', `${fmtPKR(beta - 2 * sd)} – ${fmtPKR(beta + 2 * sd)}`],
        ['Baseline budget', fmtPKR(t.budget)],
      ]),
    ], { sub: 'Uncertainty-weighted estimate' }),
  ]));
}

/* ------------------------------------------------------------- breakdown */

function breakdown(dash, pane, p) {
  const rows = p.summaries.map((sm) => {
    const kids = p.tasks.filter((t) => t.summaryId === sm.id);
    const budget = kids.reduce((a, t) => a + t.budget, 0);
    const pv = kids.reduce((a, t) => a + p.plannedValueOf(t.id), 0);
    const ev = kids.reduce((a, t) => a + p.state.get(t.id).pct * t.budget, 0);
    const ac = kids.reduce((a, t) => a + p.state.get(t.id).actualCost, 0);
    return { id: sm.id, name: sm.name, budget, pv, ev, ac, cpi: ac > 0 ? ev / ac : NaN, spi: pv > 0 ? ev / pv : NaN };
  });
  pane.appendChild(chartBox(barChart({
    width: 1080, height: 300, label: 'Budget, PV, EV and AC by control account', categories: rows.map((r) => `${r.id}`),
    series: [
      { label: 'Budget (BAC)', values: rows.map((r) => r.budget), color: 'rgba(154,163,184,.45)' },
      { label: 'PV', values: rows.map((r) => r.pv), color: C.pv },
      { label: 'EV', values: rows.map((r) => r.ev), color: C.ev },
      { label: 'AC', values: rows.map((r) => r.ac), color: C.ac },
    ],
    barTitle: (i, si, v) => `${rows[i].id} ${rows[i].name} — ${['Budget', 'PV', 'EV', 'AC'][si]}: ${fmtPKR(v)}`,
    animate: animOnce(dash, 'brk'), gap: 0.18,
  }), { minWidth: 760, legend: legend([{ label: 'Budget', color: 'rgba(154,163,184,.6)' }, { label: 'PV', color: C.pv }, { label: 'EV', color: C.ev }, { label: 'AC', color: C.ac }]), caption: 'Numbers on the axis are WBS level-1 codes; hover a bar for the package name and value.' }));
  const cb = p.costBreakdown;
  const types = [
    ['Labour', cb.labour, 'var(--c2)'], ['Materials & plant', cb.material, 'var(--c1)'], ['Risk events', cb.risk, 'var(--bad)'],
    ['Rework (quality)', cb.quality, 'var(--c6)'], ['Crashing', cb.crash, 'var(--c3)'], ['Management actions', cb.management, 'var(--c7)'],
    ['Contractor claims', cb.claims, 'var(--warn)'], ['Idle labour (inside labour)', cb.idle, 'var(--muted)'],
  ];
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Cost performance by control account', [table([
      { key: 'id', label: 'WBS' }, { key: 'name', label: 'Control account' },
      { key: 'budget', label: 'Budget', num: true, format: (v) => bn(v) }, { key: 'ev', label: 'EV', num: true, format: (v) => bn(v) }, { key: 'ac', label: 'AC', num: true, format: (v) => bn(v) },
      { key: 'cpi', label: 'CPI', num: true, format: (v) => (Number.isFinite(v) ? el('span', { class: indexClass(v) === 'good' ? 'pm-pos' : indexClass(v) === 'warn' ? 'pm-warn' : 'pm-neg', text: v.toFixed(2) }) : '—') },
      { key: 'spi', label: 'SPI', num: true, format: (v) => (Number.isFinite(v) ? el('span', { class: indexClass(v) === 'good' ? 'pm-pos' : indexClass(v) === 'warn' ? 'pm-warn' : 'pm-neg', text: v.toFixed(2) }) : '—') },
    ], rows, { dense: true, sortable: true })], { sub: 'PKR bn' }),
    card('Actual cost by cost type', [chartBox(hbarChart({
      width: 560, label: 'Actual cost by type', rows: types.map(([label, value, color]) => ({ label, value, color, text: fmtPKR(value) })), labelWidth: 170, animate: animOnce(dash, 'types'),
    }), { minWidth: 440 }), el('p', { class: 'pm-note', text: `Total AC ${fmtPKR(p.ac)}. Risk, rework and claims draw the contingency reserve first; crashing and management actions draw the management reserve.` })]),
  ]));
}
