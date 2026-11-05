import { el, kpi, button, table, tabs, pill, select, slider, fmtPKR, fmtPct, confirmModal } from '../dom.js';
import {
  C, chartBox, legend, controlChart, histogramChart, scatterChart, paretoChart, fishboneChart, hbarChart, barChart, shortDate, section, card, animOnce, dl,
} from '../charts.js';
import { imr, westernElectric, capability, pareto } from '../../pm/quality.js';
import { fact } from '../../core/facts.js';

/**
 * Quality Management (Week 7): quality plan and standards, QA audits, Shewhart
 * control charts (I-chart, Western Electric rules) for concrete strength,
 * compaction, friction and roughness, histogram and capability, scatter,
 * Pareto, Ishikawa fishbone for the top defect, check sheet, cost of quality,
 * NCR register and the inspection-level lever.
 */

const TABS = [
  { id: 'spc', label: 'Control charts', icon: 'gauge' },
  { id: 'tools', label: 'Pareto · fishbone · check sheet', icon: 'stats' },
  { id: 'plan', label: 'Plan · audits · cost of quality', icon: 'shield' },
  { id: 'ncr', label: 'NCR register', icon: 'ncr' },
];

const PLAN = {
  concrete: { method: 'Cube / cylinder crushing at 28 days', freq: '1 set per 50 m³ poured', std: 'ASTM C39 cylinder test; ICAO Annex 14 pavement design strength', who: 'Materials engineer (site laboratory)' },
  compaction: { method: 'Nuclear density gauge vs laboratory maximum dry density', freq: 'Every 500 m² per layer', std: 'Project specification §3 (earthworks); Proctor (MDD) reference', who: 'Geotechnical engineer' },
  friction: { method: 'Continuous friction measuring equipment at 65 km/h', freq: 'Each new surface + every 6 months in service', std: 'ICAO Annex 14 / Doc 9137 Part 2 (surface friction)', who: 'Airside quality engineer' },
  roughness: { method: 'Inertial profilometer → International Roughness Index', freq: 'Each lane-km of new surfacing', std: 'ASTM E1926 (IRI computation)', who: 'Pavement specialist (independent engineer)' },
};

const SIX_M = ['Manpower', 'Machine', 'Method', 'Material', 'Measurement', 'Mother nature'];
const CAUSES = {
  Compaction: [['Roller operators rotated without briefing', 'Night shift fatigue'], ['Roller vibration set too low', 'Too few passes per lift'], ['Lift thicker than 200 mm', 'No trial strip for new borrow'], ['Moisture far from optimum', 'Silty borrow pit material'], ['Gauge not calibrated weekly', 'Test spots chosen by crew'], ['Monsoon wetting of open layers', 'Heat dries surface before rolling']],
  'Concrete strength': [['Unskilled batching crew', 'Water added at the pour'], ['Batch plant scale drift', 'Mixer drum worn'], ['Curing blankets removed early', 'Cold joints between pours'], ['Cement from a new supplier', 'Aggregate with excess fines'], ['Cubes cured on site, not in tank', 'Capping errors at the lab'], ['42 °C days accelerate setting', 'Dust contaminates aggregate']],
  'Surface texture': [['Paver operator new to grooving', 'Inconsistent screed control'], ['Grooving saw blade wear', 'Paver speed variation'], ['Grooves cut before cure', 'Rubber deposits not removed'], ['Polished aggregate', 'Bitumen bleeding in heat'], ['Friction tester tyre pressure', 'Wet-film depth not controlled'], ['Heat softening of binder', 'Dust on the surface']],
  'Ride quality': [['String-line set-out errors', 'Joints made by hand'], ['Paver stops and restarts', 'Uneven truck supply'], ['No automatic grade control', 'Longitudinal joint not matched'], ['Mix temperature segregation', 'Base course not trimmed'], ['Profilometer not validated', 'IRI computed on short sections'], ['Heat-induced rutting', 'Settlement after monsoon']],
  Workmanship: [['Supervisor span of control too wide', 'Piece-rate incentives'], ['Wrong tools on site', 'Equipment shared between gangs'], ['Method statements not briefed', 'No first-off inspection'], ['Substitute materials without approval', 'Damaged materials used'], ['Inspection & test plan hold points skipped', 'Snag lists not closed'], ['Heat-stress breaks cut short', 'Dust storms interrupt work']],
  Documentation: [['Document controller overloaded', 'Engineers skip transmittals'], ['Two document systems in use', 'No version locking'], ['Late as-built mark-ups', 'Approvals by e-mail only'], ['Supplier data sheets missing', 'Translations incomplete'], ['No audit of the register', 'Wrong revision checked'], ['Site office power cuts', 'Records damaged by dust and damp']],
};
function causesFor(cat) {
  const c = CAUSES[cat] || [['Training gaps', 'Supervision'], ['Equipment condition', 'Calibration'], [`${cat} procedure unclear`, 'No first-article check'], ['Supplier quality', 'Storage and handling'], ['Test method', 'Sampling plan'], ['Heat, dust, monsoon', 'Night work']];
  return SIX_M.map((name, i) => ({ name, causes: c[i] }));
}

export const PANEL_QUALITY = {
  id: 'quality',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'spc';
    if (!s.metric) s.metric = 'concrete';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const q = p.quality;
    const coq = q.costOfQuality;
    const coqTotal = coq.prevention + coq.appraisal + coq.internalFailure + coq.externalFailure;
    const openN = p.ncrs.filter((n) => n.status === 'Open').length;
    const met = q.metrics[s.metric];
    const vals = met.samples.map((x) => x.value);
    const lim = vals.length >= 2 ? imr(vals) : null;
    const cap = lim ? capability({ mean: lim.mean, sigma: lim.sigma, lsl: met.lsl, usl: met.usl }) : null;
    body.appendChild(el('p', { class: 'lede', text: 'Quality is planned in, assured by audit and controlled by measurement. Every test result below comes from the simulated site laboratory; points outside the control limits, or patterns inside them, are signals to act on before a lot fails.' }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Quality index', value: fmtPct(p.qualityIndex, 0), foot: 'first-pass yield proxy', cls: p.qualityIndex >= 0.9 ? 'good' : p.qualityIndex >= 0.8 ? 'warn' : 'bad' }),
      kpi({ label: 'NCRs open / total', value: `${openN} / ${p.ncrs.length}`, foot: `${p.latentDefects} latent defects escaped`, cls: openN > 3 ? 'warn' : '' }),
      kpi({ label: `Cpk — ${met.name.split(' (')[0].split(' ').slice(0, 2).join(' ')}`, value: cap && Number.isFinite(cap.cpk) ? cap.cpk.toFixed(2) : '—', foot: cap ? `Cp ${cap.cp.toFixed(2)} · n = ${vals.length}` : 'no samples yet', cls: cap ? (cap.cpk >= 1.33 ? 'good' : cap.cpk >= 1 ? 'warn' : 'bad') : '' }),
      kpi({ label: 'Cost of quality', value: fmtPKR(coqTotal), foot: `${fmtPct(coqTotal / Math.max(1, p.ac), 1)} of AC` }),
      kpi({ label: 'Inspection level', value: `${Math.round(p.inspectionLevel * 100)}%`, foot: `detection ≈ ${Math.round(Math.min(0.98, 0.55 + 0.35 * p.inspectionLevel) * 100)}%` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ spc, tools, plan, ncr })[s.tab](dash, pane, p);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · ${Object.values(q.metrics).reduce((a, x) => a + x.samples.length, 0)} test results on file` })]));
  },
};

/* ---------------------------------------------------------- control charts */

function spc(dash, pane, p) {
  const s = dash.state;
  const metrics = p.quality.metrics;
  const met = metrics[s.metric];
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Quality characteristic' }, Object.entries(metrics).map(([k, x]) => el('button', { type: 'button', class: k === s.metric ? 'active' : '', 'aria-pressed': k === s.metric ? 'true' : 'false', onclick: () => { s.metric = k; dash.rerender(); } }, [`${x.name.split(' (')[0]} · ${x.samples.length}`]))),
    el('label', { class: 'inline' }, ['Points ', select([{ value: 40, label: 'Last 40' }, { value: 80, label: 'Last 80' }, { value: 240, label: 'All on file' }], s.nPts || 80, (v) => { s.nPts = Number(v); dash.rerender(); })]),
  ]));
  const samples = met.samples.slice(-(s.nPts || 80));
  if (samples.length < 4) {
    pane.appendChild(el('div', { class: 'pm-empty', text: `No ${met.name.toLowerCase()} results yet — testing starts with the first work package that carries this test (${p.tasks.filter((t) => t.q && t.q.includes(s.metric)).map((t) => t.code).slice(0, 5).join(', ')}). Advance the simulation to see the chart build up.` }));
    return;
  }
  const vals = samples.map((x) => x.value);
  const lim = imr(vals);
  const vio = westernElectric(vals, lim.cl, lim.sigma);
  const cap = capability({ mean: lim.mean, sigma: lim.sigma, lsl: met.lsl, usl: met.usl });
  const dp = met.unit === 'μ' ? 3 : 2;
  pane.appendChild(chartBox(controlChart(samples.map((x) => ({ y: x.value, label: `${shortDate(p.startDate, x.day)} · ${x.task}` })), lim, { lsl: met.lsl, usl: met.usl }, vio, {
    width: 1000, height: 300, unit: met.unit, label: `Individuals control chart — ${met.name}`, format: (v) => v.toFixed(dp), animate: animOnce(dash, `cc-${s.metric}-${s.nPts}`),
    firstLabel: shortDate(p.startDate, samples[0].day), lastLabel: shortDate(p.startDate, samples[samples.length - 1].day),
  }), {
    minWidth: 720,
    legend: legend([
      { label: 'Result', color: 'var(--c2)', shape: 'dot' }, { label: 'Western Electric signal', color: C.warn, shape: 'dot' }, { label: 'Out of specification', color: C.bad, shape: 'dot' },
      { label: 'UCL / LCL = X̄ ± 3·MR̄/1.128', color: C.bad, shape: 'line', dash: '7 4' }, { label: 'Centre line', color: C.good, shape: 'line' }, { label: 'Spec limits', color: C.info, shape: 'line', dash: '2 4' },
    ]),
  }));
  const rules = [1, 2, 3, 4].map((r) => vio.filter((v) => v.rule === r).length);
  const oos = samples.filter((x) => !x.ok).length;
  pane.appendChild(el('div', { class: 'pm-grid c3' }, [
    card('Control limits (I-MR)', [dl([
      ['Centre line X̄', `${lim.cl.toFixed(dp)} ${met.unit}`], ['MR̄', lim.mrBar.toFixed(dp + 1)], ['σ̂ = MR̄ / 1.128', lim.sigma.toFixed(dp + 1)],
      ['UCL / LCL', `${lim.ucl.toFixed(dp)} / ${lim.lcl.toFixed(dp)}`], ['Specification', `LSL ${met.lsl} · target ${met.target} · USL ${met.usl}`],
    ])], { sub: 'Control limits are the voice of the process; spec limits the voice of the customer.' }),
    card('Western Electric rules', [
      table(['Rule', 'Pattern', 'Signals'], [
        ['1', '1 point beyond 3σ', rules[0]], ['2', '2 of 3 beyond 2σ, same side', rules[1]], ['3', '4 of 5 beyond 1σ, same side', rules[2]], ['4', '8 in a row on one side', rules[3]],
      ], { dense: true }),
      el('p', { class: 'pm-note', text: vio.length ? 'Signals mean an assignable cause is likely — investigate before the next lot (it may be crashing, heat or a weak vendor).' : 'No signals: the process shows only common-cause variation. Do not tamper.' }),
    ]),
    card('Capability', [dl([
      ['Cp = (USL − LSL) / 6σ', cap.cp.toFixed(2)], ['Cpk = min(USL − μ, μ − LSL) / 3σ', el('b', { class: cap.cpk >= 1.33 ? 'pm-pos' : cap.cpk >= 1 ? 'pm-warn' : 'pm-neg', text: cap.cpk.toFixed(2) })],
      ['Out of spec', `${oos} of ${samples.length} (${fmtPct(oos / samples.length, 1)})`],
    ]), el('p', { class: 'pm-note', text: cap.cpk >= 1.33 ? 'Capable (Cpk ≥ 1.33).' : cap.cpk >= 1 ? 'Marginal: centre the process or reduce spread.' : 'Not capable: expect rejected lots and rework.' })]),
  ]));
  // histogram
  const bins = 16;
  const lo = Math.min(...vals, met.lsl);
  const hi = Math.max(...vals, met.usl);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const curve = [];
  for (let k = 0; k <= 60; k++) {
    const x = lo + ((hi - lo) * k) / 60;
    curve.push([x, (vals.length * w * Math.exp(-0.5 * ((x - lim.mean) / lim.sigma) ** 2)) / (lim.sigma * Math.sqrt(2 * Math.PI))]);
  }
  // scatter: rework vs CPI per work package
  const pts = p.tasks.filter((t) => !t.milestone && p.state.get(t.id).actualCost > 0 && p.state.get(t.id).pct > 0.05).map((t) => {
    const st = p.state.get(t.id);
    return [st.rework, (st.pct * t.budget) / st.actualCost];
  });
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Histogram & fitted normal', [chartBox(histogramChart({
      bins: { min: lo, width: w, counts }, width: 560, height: 250, label: `Histogram of ${met.name}`, curve,
      color: (a, b) => (b <= met.lsl || a >= met.usl ? 'var(--bad)' : 'var(--c2)'), xFormat: (v) => v.toFixed(dp > 2 ? 2 : 1),
      vlines: [{ x: met.lsl, label: 'LSL', color: C.info }, { x: met.usl, label: 'USL', color: C.info }, { x: met.target, label: 'Target', color: C.good, dash: '' }],
      animate: animOnce(dash, `h-${s.metric}`), unitLabel: met.unit,
    }), { minWidth: 440 })], { sub: 'Shape, centring and spread against the specification' }),
    card('Scatter diagram — rework vs package CPI', [pts.length > 3 ? chartBox(scatterChart(pts, {
      width: 560, height: 250, xLabel: 'Rework days on the package', yLabel: 'Package CPI', xName: 'rework', yName: 'CPI', yFormat: (v) => v.toFixed(2), xFormat: (v) => v.toFixed(0),
    }), { minWidth: 440 }) : el('div', { class: 'pm-empty', text: 'Not enough started work packages yet for a scatter diagram.' }),
    el('p', { class: 'pm-note', text: 'Each dot is a started work package. A negative slope is the cost of poor quality made visible: rework days drive cost overruns. Correlation is not causation — check with the fishbone.' })]),
  ]));
}

/* --------------------------------------------- Pareto, fishbone, check sheet */

function tools(dash, pane, p) {
  const s = dash.state;
  const rows = pareto(p.quality.defects).filter((r) => r.count > 0);
  if (!rows.length) {
    pane.appendChild(el('div', { class: 'pm-empty', text: 'No defects recorded yet. Advance the simulation — defects are logged from inspections as work proceeds.' }));
    return;
  }
  const total = rows.reduce((a, r) => a + r.count, 0);
  pane.appendChild(chartBox(paretoChart(rows, { width: 1000, height: 300, animate: animOnce(dash, 'pareto') }), {
    minWidth: 700,
    legend: legend([{ label: 'Vital few (first 80 %)', color: 'var(--c3)' }, { label: 'Useful many', color: 'var(--c2)' }, { label: 'Cumulative %', color: C.brass, shape: 'line' }, { label: '80 % line', color: C.warn, shape: 'line', dash: '6 5' }]),
    caption: `${total} defects in ${rows.length} categories. The vital few are where a corrective action pays back fastest (the 80/20 rule).`,
  }));
  if (!s.fishCat || !rows.find((r) => r.category === s.fishCat)) s.fishCat = rows[0].category;
  pane.appendChild(section('Cause-and-effect (Ishikawa) diagram', '6M categories'));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Effect ', select(rows.map((r) => ({ value: r.category, label: `${r.category} (${r.count})` })), s.fishCat, (v) => { s.fishCat = v; dash.rerender(); })]),
    el('span', { class: 'pm-note', text: 'Defaults to the top Pareto bar. Candidate causes come from the root-cause workshop (simulated); verify each with data before acting.' }),
  ]));
  pane.appendChild(chartBox(fishboneChart(`${s.fishCat} defects`, causesFor(s.fishCat), { width: 1040, height: 380, animate: animOnce(dash, `fb-${s.fishCat}`) }), { minWidth: 840 }));
  // check sheet
  const metrics = p.quality.metrics;
  const qOf = (d) => Math.floor(d / 91);
  const allDays = Object.values(metrics).flatMap((x) => x.samples.map((y) => y.day));
  const qs = [];
  if (allDays.length) { const q1 = qOf(Math.max(...allDays)); for (let k = Math.max(0, q1 - 5); k <= q1; k++) qs.push(k); }
  const tally = (n) => {
    const shown = Math.min(n, 25);
    const groups = [];
    for (let i = 0; i < Math.floor(shown / 5); i++) groups.push(el('s', { text: '||||' }), ' ');
    if (shown % 5) groups.push('|'.repeat(shown % 5));
    if (n > 25) groups.push(` +${n - 25}`);
    return el('span', { class: 'tally', title: `${n}` }, n ? groups : ['—']);
  };
  const csRows = Object.entries(metrics).map(([k, x]) => {
    const row = { name: x.name.split(' (')[0] };
    for (const qq of qs) {
      const inQ = x.samples.filter((y) => qOf(y.day) === qq);
      row[`q${qq}`] = { fail: inQ.filter((y) => !y.ok).length, n: inQ.length };
    }
    return row;
  });
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Check sheet — failed tests by quarter', [table([
      { key: 'name', label: 'Characteristic' },
      ...qs.map((qq) => ({ key: `q${qq}`, label: `Q${(qq % 4) + 1} ’${String(p.date(qq * 91).getUTCFullYear()).slice(2)}`, format: (v) => el('span', {}, [tally(v.fail), el('small', { class: 'muted', text: ` / ${v.n}` })]) })),
    ], csRows, { dense: true, empty: 'No tests recorded yet.' }), el('p', { class: 'pm-note', text: 'Tally marks (bundles of five) count failed tests; the small number is tests taken. Samples on file: last 240 per characteristic.' })]),
    card('Defect counts', [table([
      { key: 'category', label: 'Category' }, { key: 'count', label: 'Count', num: true }, { key: 'pct', label: '%', num: true, format: (v) => `${v.toFixed(1)}%` },
      { key: 'cumulativePct', label: 'Cum.', num: true, format: (v) => `${v.toFixed(0)}%` }, { key: 'vital', label: '', format: (v) => (v ? pill('vital few', 'bad') : '') },
    ], rows, { dense: true })]),
  ]));
}

/* --------------------------------------------- plan, audits, cost of quality */

function plan(dash, pane, p) {
  const metrics = p.quality.metrics;
  pane.appendChild(card('Quality management plan — critical characteristics', [table([
    { key: 'name', label: 'Characteristic' }, { key: 'unit', label: 'Unit' }, { key: 'target', label: 'Target', num: true }, { key: 'lsl', label: 'LSL', num: true }, { key: 'usl', label: 'USL', num: true },
    { key: 'method', label: 'Test method' }, { key: 'freq', label: 'Frequency' }, { key: 'std', label: 'Reference' }, { key: 'who', label: 'Responsible' },
  ], Object.entries(metrics).map(([k, x]) => ({ ...x, ...PLAN[k] })), { dense: true }),
  el('p', { class: 'pm-note', text: 'Inspection & test plans (ITPs) set hold points that need the engineer’s release before work proceeds; witness points need notice only. Targets and limits are the project specification (simulated).' })]));
  const audits = p.quality.audits;
  const coq = p.quality.costOfQuality;
  const conf = coq.prevention + coq.appraisal;
  const non = coq.internalFailure + coq.externalFailure;
  const s = dash.state;
  const lvlOut = el('div', { class: 'pm-note' });
  const showLvl = (v) => { lvlOut.textContent = `At ${Math.round(v * 100)} %: defect detection ≈ ${Math.round(Math.min(0.98, 0.55 + 0.35 * v) * 100)} %, prevention + appraisal spend scales ×${v.toFixed(2)}; below 100 % more defects escape as latent defects.`; };
  showLvl(p.inspectionLevel);
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Standards & requirements', [el('ul', {}, [
      el('li', {}, [el('b', { text: 'ISO 9001' }), ' — quality management system of the PMO and every main contractor (certified QMS is a tender requirement).']),
      el('li', {}, [el('b', { text: 'ISO 10005' }), ' — guidance for the project quality plan.']),
      el('li', {}, [el('b', { text: 'ICAO Annex 14, Volume I' }), ' — aerodrome design and operations: runway and strip geometry, pavement surface, lighting and markings.']),
      el('li', {}, [el('b', { text: 'ICAO Doc 9137 (Airport Services Manual)' }), ' — friction and pavement surface condition assessment.']),
      el('li', {}, [el('b', { text: `${fact('org.regulator')} aerodrome certification checklist` }), ' — simulated requirement set for this scenario (inspection, aerodrome manual, SMS acceptance).']),
      el('li', {}, [el('b', { text: 'Project specification & ITPs' }), ' — simulated for this scenario.']),
    ])]),
    card('Inspection level', [
      el('p', { text: 'More inspection catches more defects before handover (cheaper internal failure) but costs appraisal money and time. Set the lever and watch the cost of quality and quality index respond.' }),
      slider(0.5, 1.5, 0.05, p.inspectionLevel, (v, commit) => {
        showLvl(v);
        if (commit) {
          p.setInspectionLevel(v);
          dash.sim.toast(`Inspection level set to ${Math.round(v * 100)} % of plan`, 'good');
          s.lvlChanged = true;
          dash.rerender();
        }
      }, (v) => `${Math.round(v * 100)}%`, { 'aria-label': 'Inspection level' }),
      lvlOut,
    ]),
  ]));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Cost of quality', [chartBox(hbarChart({
      width: 560, labelWidth: 200, label: 'Cost of quality', animate: animOnce(dash, 'coq'), rows: [
        { label: 'Prevention (training, ITPs, trials)', value: coq.prevention, color: 'var(--c4)', text: fmtPKR(coq.prevention) },
        { label: 'Appraisal (testing, inspection)', value: coq.appraisal, color: 'var(--c2)', text: fmtPKR(coq.appraisal) },
        { label: 'Internal failure (rework, NCRs)', value: coq.internalFailure, color: 'var(--warn)', text: fmtPKR(coq.internalFailure) },
        { label: 'External failure (after handover)', value: coq.externalFailure, color: 'var(--bad)', text: fmtPKR(coq.externalFailure) },
      ],
    }), { minWidth: 440 }), dl([
      ['Cost of conformance', fmtPKR(conf)], ['Cost of non-conformance', fmtPKR(non)], ['Ratio', non ? `${(conf / non).toFixed(1)} : 1` : '—'],
    ]), el('p', { class: 'pm-note', text: 'Crosby: quality is free — money spent on prevention is repaid many times over in avoided failure. External failure (found by the operator after handover) is the most expensive kind.' })]),
    card('Quality assurance audits', [table([
      { key: 'day', label: 'Date', format: (v) => shortDate(p.startDate, v) }, { key: 'scope', label: 'Audit' },
      { key: 'score', label: 'Score', num: true, format: (v) => el('span', { class: v >= 90 ? 'pm-pos' : v >= 80 ? 'pm-warn' : 'pm-neg', text: String(v) }) }, { key: 'findings', label: 'Findings', num: true },
    ], audits, { dense: true, maxRows: 10, empty: 'The first quarterly QA audit runs on day 90.' }),
    el('p', { class: 'pm-note', text: 'QA audits test the process (are we following the plan?); QC tests the product (does it meet the specification?).' })]),
  ]));
}

/* ------------------------------------------------------------ NCR register */

function ncr(dash, pane, p) {
  const s = dash.state;
  const list = p.ncrs.filter((n) => !s.ncrOpen || n.status === 'Open');
  const byMetric = {};
  for (const n of p.ncrs) byMetric[n.metric] = (byMetric[n.metric] || 0) + 1;
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    button(s.ncrOpen ? 'Show all NCRs' : 'Open NCRs only', () => { s.ncrOpen = !s.ncrOpen; dash.rerender(); }, { small: true, kind: s.ncrOpen ? 'primary' : 'ghost' }),
    button('Raise a change request', () => dash.focusChangeForm(), { small: true, kind: 'ghost', icon: 'shuffle', title: 'Systemic NCRs may need a design or specification change' }),
    el('span', { class: 'pm-note', text: `${p.ncrs.length} NCRs · cost ${fmtPKR(p.ncrs.reduce((a, n) => a + n.cost, 0))} · ${Object.entries(byMetric).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none yet'}` }),
  ]));
  pane.appendChild(table([
    { key: 'id', label: 'NCR', format: (v) => el('b', { class: 'pm-mono', text: v }) }, { key: 'day', label: 'Raised', format: (v) => shortDate(p.startDate, v) },
    { key: 'task', label: 'WBS' }, { key: 'category', label: 'Category' },
    { key: 'value', label: 'Measured', num: true, format: (v, r) => `${v} ${r.unit}` }, { key: 'limit', label: 'Limit', num: true },
    { key: 'disposition', label: 'Disposition' }, { key: 'cost', label: 'Rework cost', num: true, format: (v) => fmtPKR(v) },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Open' ? 'warn' : 'ok') },
    { key: 'task', label: '', format: (v) => button('3D', () => { dash.sim.select(v); dash.sim.toast(`${v} highlighted in the 3D site`, 'good'); }, { small: true, kind: 'ghost', title: 'Show the work package in 3D' }) },
  ], list, { dense: true, sortable: true, empty: 'No non-conformance reports yet — every failed test that the inspection regime catches raises one.' }));
  pane.appendChild(el('p', { class: 'pm-note', text: 'Dispositions: rework (bring to spec), repair (fit for purpose with concession), use-as-is (engineer’s concession), reject/replace. Closed NCRs feed the lessons-learned register.' }));
}
