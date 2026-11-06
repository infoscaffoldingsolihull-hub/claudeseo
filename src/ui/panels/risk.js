import {el, kpi, button, tabs, pill, select, fmtPKR, fmtPct, confirmModal} from '../dom.js';
import {  C, chartBox, legend, heatMap, lineChart, decisionTreeChart, dayTicks, shortDate, section, card, hookCard, animOnce, dl, table } from '../charts.js';
import { decisionTree, ratingBand, THREAT_STRATEGIES, OPPORTUNITY_STRATEGIES } from '../../pm/risk.js';

/**
 * Risk Register (Week 10): risk management plan, identification prompt
 * lists (PESTLE / TECOP) and the RBS, twin 5×5 probability–impact matrices,
 * the register with signed EMV, threat and opportunity responses, a
 * decision tree rolled back with risk.js, risk burndown and reserve drawdown,
 * owners and triggers.
 */

const TABS = [
  { id: 'register', label: 'Register & matrix', icon: 'warning' },
  { id: 'identify', label: 'Plan & identify', icon: 'tree' },
  { id: 'quant', label: 'EMV & decision tree', icon: 'fork' },
  { id: 'monitor', label: 'Burndown & reserves', icon: 'stats' },
];

const M = 1e6;
const m = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.round(Math.abs(v) / M).toLocaleString('en-US')} m`;
const ACTIVE = new Set(['Open', 'Occurred', 'Escalated']);

const PESTLE = [
  ['Political', 'Federal / provincial funding, policy shifts, security', ['Financial', 'Security', 'Regulatory'], 'Will the development budget be released on time after an election?'],
  ['Economic', 'Currency, commodities, contractor market', ['Economic', 'Commercial', 'Procurement'], 'What if the rupee falls 10 % during the bitumen import window?'],
  ['Social', 'Land, community, workforce welfare', ['Social', 'Resources', 'Health & safety'], 'Who uses the land in the extension corridor today?'],
  ['Technological', 'Design, integration, ground conditions, IT', ['Technical', 'Infrastructure', 'Scope'], 'Can the AGL, ILS and IT systems be integrated and tested in time?'],
  ['Legal', 'Titles, contracts, third parties', ['Legal', 'Third party'], 'Is every parcel’s title verified before notification?'],
  ['Environmental', 'Monsoon, dust, heat, wildlife', ['Environmental', 'Safety'], 'Which works are exposed in July–September?'],
];
const TECOP = [
  ['Technical', ['Technical', 'Infrastructure', 'Scope']],
  ['Environmental', ['Environmental']],
  ['Commercial', ['Economic', 'Commercial', 'Procurement', 'Financial', 'Third party']],
  ['Operational', ['Safety', 'Health & safety', 'Resources', 'Security']],
  ['Political', ['Legal', 'Regulatory', 'Social']],
];

/* Reserve / exposure samples, recorded once per simulated day while the app runs. */
const SAMPLES = new WeakMap();
function record(p) {
  if (!SAMPLES.has(p)) SAMPLES.set(p, []);
  const arr = SAMPLES.get(p);
  const last = arr[arr.length - 1];
  if (!last || last.day !== p.day) arr.push({ day: p.day, cr: p.contingencyRemaining, mr: p.managementRemaining, exp: p.riskExposure });
  if (arr.length > 3000) arr.splice(0, arr.length - 3000);
  return arr;
}
function ensureRecorder(dash) {
  const sim = dash.sim;
  if (sim.__a6bRiskRec || !sim.bus) return;
  sim.__a6bRiskRec = true;
  sim.bus.on('project:day', () => { if (sim.project) record(sim.project); });
  sim.bus.on('project:new', () => { if (sim.project) record(sim.project); });
}

export const PANEL_RISK = {
  id: 'risk',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    ensureRecorder(dash);
    record(p);
    if (!s.tab) s.tab = 'register';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const threats = p.risks.filter((r) => r.kind === 'threat');
    const opps = p.risks.filter((r) => r.kind === 'opportunity');
    const oppEmv = opps.filter((r) => ACTIVE.has(r.status)).reduce((a, r) => a + r.emv, 0);
    body.appendChild(el('p', { class: 'lede', text: `${p.risks.length} risks are registered — ${threats.length} threats and ${opps.length} opportunities. Expected monetary value (EMV = P × I) is signed: threats negative, opportunities positive. Their sum sized the ${fmtPKR(p.contingencyReserve)} contingency reserve.` }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Threat exposure', value: m(-p.riskExposure), foot: 'Σ EMV of open threats', cls: 'bad' }),
      kpi({ label: 'Opportunity EMV', value: m(oppEmv), foot: `${opps.filter((r) => ACTIVE.has(r.status)).length} open opportunities`, cls: 'good' }),
      kpi({ label: 'Open · occurred · escalated', value: `${p.risks.filter((r) => r.status === 'Open').length} · ${p.risks.filter((r) => r.status === 'Occurred').length} · ${p.risks.filter((r) => r.status === 'Escalated').length}`, foot: `${p.realisedRisks} threat events so far` }),
      kpi({ label: 'High-rated (P×I ≥ 15)', value: String(p.risks.filter((r) => ACTIVE.has(r.status) && r.score >= 15).length), foot: `${p.risks.filter((r) => ACTIVE.has(r.status) && r.score >= 8 && r.score < 15).length} medium`, cls: 'warn' }),
      kpi({ label: 'Contingency left', value: fmtPKR(p.contingencyRemaining), foot: `${fmtPct(p.contingencyRemaining / Math.max(1, p.contingencyReserve))} of reserve`, cls: p.contingencyRemaining < 0.3 * p.contingencyReserve ? 'bad' : 'good' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ register, identify, quant, monitor })[s.tab](dash, pane, p);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 10', title: 'AstraZeneca and the pandemic — risk at global scale',
      text: 'A vaccine programme compressed years into months by accepting financial risk (manufacturing at risk before approval) to exploit an opportunity. Which response strategies do you recognise from this register?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · scores use the 5×5 scale in the risk management plan` })]));
  },
};

/* --------------------------------------------------------------- register */

function register(dash, pane, p) {
  const s = dash.state;
  const cell = (kind) => (pp, ii) => {
    const list = p.risks.filter((r) => r.kind === kind && ACTIVE.has(r.status) && r.pScore === pp && r.iScore === ii);
    return { count: list.length, ids: list.map((r) => `${r.id} ${r.title}`) };
  };
  const onCell = (pp, ii, kind) => {
    const same = s.cell && s.cell.p === pp && s.cell.i === ii && s.cell.kind === kind;
    s.cell = same ? null : { p: pp, i: ii, kind };
    dash.rerender();
  };
  const anim = animOnce(dash, 'hm');
  pane.appendChild(el('div', { class: 'pm-grid c3', style: { alignItems: 'start' } }, [
    chartBox(heatMap({ cells: cell('threat'), kind: 'threat', onCell, selected: s.cell, label: 'Threat probability–impact matrix', size: 320, animate: anim }), { minWidth: 280 }),
    chartBox(heatMap({ cells: cell('opportunity'), kind: 'opportunity', mirror: true, onCell, selected: s.cell, label: 'Opportunity probability–impact matrix', size: 320, animate: anim }), { minWidth: 280 }),
    card('Reading the matrices', [
      el('p', { text: 'Each cell counts active risks by probability (P1–P5) and impact (I1–I5) score; the corner number is P × I. Threats sit left, opportunities are mirrored right, so the most important of both meet in the middle — the PMBOK “double” matrix.' }),
      dl([['High', 'P×I ≥ 15 — respond now, owner reports weekly'], ['Medium', '8 – 14 — respond, watch-list'], ['Low', '< 8 — accept, review monthly']]),
      el('p', { class: 'pm-note', text: s.cell ? `Filtered to ${s.cell.kind}s at P${s.cell.p} × I${s.cell.i}. Click the cell again to clear.` : 'Click a cell to filter the register.' }),
    ], { cls: 'flat' }),
  ]));
  let list = p.risks.slice();
  if (s.cell) list = list.filter((r) => r.kind === s.cell.kind && r.pScore === s.cell.p && r.iScore === s.cell.i && ACTIVE.has(r.status));
  if (s.rbs) list = list.filter((r) => r.rbs.startsWith(s.rbs));
  if (s.kindF && s.kindF !== 'all') list = list.filter((r) => (s.kindF === 'active' ? ACTIVE.has(r.status) : r.kind === s.kindF));
  list.sort((a, b) => b.score - a.score || Math.abs(b.emv) - Math.abs(a.emv));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Show ', select([{ value: 'all', label: 'All risks' }, { value: 'active', label: 'Active only' }, { value: 'threat', label: 'Threats' }, { value: 'opportunity', label: 'Opportunities' }], s.kindF || 'all', (v) => { s.kindF = v; dash.rerender(); })]),
    s.cell || s.rbs ? button('Clear filters', () => { s.cell = null; s.rbs = null; dash.rerender(); }, { small: true, kind: 'ghost' }) : null,
    el('span', { class: 'pm-note', text: `${list.length} shown · click a row to plan a response` }),
  ]));
  pane.appendChild(table([
    { key: 'id', label: 'ID', format: (v) => el('b', { class: 'pm-mono', text: v }) },
    { key: 'title', label: 'Risk' },
    { key: 'category', label: 'Category' },
    { key: 'kind', label: 'Type', format: (v) => pill(v === 'threat' ? 'Threat' : 'Opportunity', v === 'threat' ? 'bad' : 'info') },
    { key: 'probability', label: 'P', num: true, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'score', label: 'P×I', num: true, format: (v, r) => pill(`${r.pScore}×${r.iScore}=${v}`, v >= 15 ? 'bad' : v >= 8 ? 'warn' : 'ok', ratingBand(v)) },
    { key: 'emv', label: 'EMV (PKR)', num: true, format: (v) => el('span', { class: v < 0 ? 'pm-neg pm-mono' : 'pm-pos pm-mono', text: m(v) }) },
    { key: 'response', label: 'Response' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Occurred' ? 'bad' : v === 'Escalated' ? 'gold' : v === 'Open' ? 'info' : 'muted') },
  ], list, { dense: true, sortable: true, selected: (r) => r.id === s.sel, onRow: (r) => { s.sel = s.sel === r.id ? null : r.id; dash.rerender(); } }));
  const tot = list.reduce((a, r) => a + (ACTIVE.has(r.status) ? r.emv : 0), 0);
  pane.appendChild(el('p', { class: 'pm-note', text: `Σ EMV of active risks shown: ${m(tot)} (threats reduce, opportunities add value).` }));
  if (s.sel && p.riskById.has(s.sel)) pane.appendChild(riskDetail(dash, p, p.riskById.get(s.sel)));
}

function riskDetail(dash, p, r) {
  const allowed = r.kind === 'opportunity' ? OPPORTUNITY_STRATEGIES : THREAT_STRATEGIES;
  const planned = new Map(r.strategies.map((x) => [x.strategy, x.action]));
  const respond = async (strategy) => {
    const ok = await confirmModal(`${strategy} ${r.id}?`, `${planned.get(strategy) || describe(strategy, r.kind)}\n\nThis is recorded in the decision log; any response cost is drawn from the management reserve.`, { okLabel: strategy });
    if (!ok) return;
    const res = p.respondToRisk(r.id, strategy);
    dash.sim.toast(res.ok ? `${r.id} → ${strategy}: ${res.message}${res.cost ? ` (${fmtPKR(res.cost)})` : ''}` : res.message, res.ok ? 'good' : 'warn');
    dash.rerender();
  };
  return el('div', { class: 'risk-detail' }, [
    el('div', { class: 'row between' }, [el('h4', { style: { margin: 0 }, text: `${r.id} · ${r.title}` }), pill(r.kind === 'threat' ? 'Threat' : 'Opportunity', r.kind === 'threat' ? 'bad' : 'info')]),
    el('div', { class: 'pm-grid c2' }, [
      dl([
        ['RBS', r.rbs], ['Owner', r.owner], ['Trigger', r.trigger],
        ['Probability', `${Math.round(r.probability * 100)}% now · ${Math.round(r.rawProbability * 100)}% inherent · ${Math.round(r.residual * 100)}% residual target`],
        ['Impact', `${fmtPKR(r.costImpact)} and ${r.daysImpact} days (I${r.iScore})`],
      ]),
      dl([
        ['EMV', el('span', { class: r.emv < 0 ? 'pm-neg pm-mono' : 'pm-pos pm-mono', text: `${m(r.emv)} = ${r.kind === 'threat' ? '−' : ''}${r.probability.toFixed(2)} × ${fmtPKR(r.costImpact * r.impactFactor * r.costShare)}` })],
        ['Current response', `${r.response}${r.status === 'Escalated' ? ' (owned by the programme board)' : ''}`],
        ['Status', `${r.status}${r.occurrences ? ` · occurred ${r.occurrences}× (last ${shortDate(p.startDate, r.lastDay)})` : ''}`],
        ['Work packages', r.affects.join(', ')],
      ]),
    ]),
    el('div', { class: 'strategy-row' }, allowed.map((st) => button(st, () => respond(st), { small: true, kind: st === r.response ? 'primary' : '', title: planned.get(st) || describe(st, r.kind) }))),
    el('ul', { class: 'pm-note' }, allowed.map((st) => el('li', {}, [el('b', { text: `${st}: ` }), planned.get(st) || describe(st, r.kind)]))),
  ]);
}

function describe(st, kind) {
  const T = {
    Avoid: 'Change the plan or method to remove the cause entirely.', Mitigate: 'Reduce probability and/or impact before it happens.',
    Transfer: 'Shift the financial impact to a third party (contract, insurance, bond).', Escalate: 'Outside the project’s authority — hand to the programme board.',
    Accept: 'Acknowledge it; hold contingency (active) or do nothing (passive).',
  };
  const O = {
    Exploit: 'Act to make the opportunity certain.', Enhance: 'Increase its probability or benefit.', Share: 'Partner with whoever can best capture it.',
    Escalate: 'Outside the project’s authority — hand to the programme board.', Accept: 'Take the benefit if it arises; no proactive action.',
  };
  return (kind === 'opportunity' ? O : T)[st] || '';
}

/* ---------------------------------------------------- plan & identification */

function identify(dash, pane, p) {
  const s = dash.state;
  const bac = p.bac;
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Risk management plan (summary)', [
      dl([
        ['Methodology', 'Qualitative P×I screening of every risk; quantitative EMV and Monte Carlo (5,000+ iterations) for the programme'],
        ['Roles', 'Each risk has one named owner (by role); the PMO runs the register; the programme board owns escalated risks'],
        ['Budgeting', `Contingency reserve ${fmtPKR(p.contingencyReserve)} (Σ threat EMV) inside the cost baseline; management reserve ${fmtPKR(p.managementReserve)} (5 % of BAC) outside it`],
        ['Timing', 'Register reviewed fortnightly; triggers checked weekly; full reassessment at each stage gate'],
        ['Appetite', 'Low for safety and certification; moderate for cost; opportunities with BCR > 2 are pursued'],
        ['Reporting', 'Top-10 risks and exposure trend in the monthly sponsor dashboard'],
      ]),
    ]),
    card('Probability & impact definitions', [
      table(['Score', 'Probability', 'Cost impact (of BAC)', 'Schedule impact'], [
        ['1', '< 10 %', `< 0.2 % (< ${fmtPKR(0.002 * bac)})`, '< 10 d'],
        ['2', '10 – 25 %', `0.2 – 0.5 %`, '10 – 19 d'],
        ['3', '25 – 40 %', `0.5 – 1 %`, '20 – 39 d'],
        ['4', '40 – 60 %', `1 – 2.5 %`, '40 – 79 d'],
        ['5', '≥ 60 %', `≥ 2.5 % (≥ ${fmtPKR(0.025 * bac)})`, '≥ 80 d'],
      ], { dense: true }),
      el('p', { class: 'pm-note', text: 'The worse of cost and schedule sets the impact score. Scales are the project’s own (tailored), as PMBOK expects.' }),
    ]),
  ]));
  pane.appendChild(section('Identification — prompt lists'));
  const count = (cats) => p.risks.filter((r) => cats.includes(r.category)).length;
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('PESTLE', [el('div', { class: 'prompt-list' }, PESTLE.map(([name, desc, cats, q]) => el('div', { title: q }, [el('b', {}, [name, el('em', { text: String(count(cats)) })]), el('span', { text: desc }), el('div', { class: 'pm-note', style: { margin: '0.2rem 0 0' }, text: `“${q}”` })])))], { sub: 'Number = risks in the register from that prompt' }),
    card('TECOP', [el('div', { class: 'prompt-list' }, TECOP.map(([name, cats]) => el('div', {}, [el('b', {}, [name, el('em', { text: String(count(cats)) })]), el('span', { text: cats.join(' · ') })]))),
      el('p', { class: 'pm-note', text: 'Other techniques used: assumption & constraint analysis, expert interviews with each work-package owner, lessons from earlier airport projects, SWOT at the business-case stage.' })]),
  ]));
  // RBS tree
  const tree = {};
  for (const r of p.risks) {
    const parts = r.rbs.split(' › ');
    let node = tree;
    let path = '';
    for (const part of parts) {
      path = path ? `${path} › ${part}` : part;
      if (!node[part]) node[part] = { __path: path, __n: 0, __kids: {} };
      node[part].__n += 1;
      node = node[part].__kids;
    }
  }
  const draw = (node) => el('ul', {}, Object.keys(node).sort().map((k) => {
    const n = node[k];
    return el('li', {}, [
      el('button', { type: 'button', class: s.rbs === n.__path ? 'active' : '', onclick: () => { s.rbs = s.rbs === n.__path ? null : n.__path; s.tab = 'register'; s.cell = null; dash.rerender(); } }, [k, el('em', { text: `(${n.__n})` })]),
      Object.keys(n.__kids).length ? draw(n.__kids) : null,
    ]);
  }));
  pane.appendChild(section('Risk breakdown structure (RBS)', 'click a branch to filter the register'));
  pane.appendChild(card(null, [el('div', { class: 'rbs-tree' }, [draw(tree)])]));
}

/* ------------------------------------------------------- decision tree */

function quant(dash, pane, p) {
  const s = dash.state;
  const cands = p.risks.filter((r) => r.kind === 'threat' && r.strategies.some((x) => x.strategy === 'Mitigate'));
  if (!s.dtRisk || !p.riskById.has(s.dtRisk)) s.dtRisk = cands.find((r) => r.id === 'R03') ? 'R03' : cands[0].id;
  const r = p.riskById.get(s.dtRisk);
  const I = r.costImpact;
  const mitCost = r.responseCost || I * 0.08;
  const tree = {
    type: 'decision', label: 'Response to ' + r.id,
    options: [
      { label: 'Mitigate', cost: mitCost, node: { type: 'chance', branches: [{ label: 'Risk occurs', p: r.residual, node: { type: 'outcome', value: -I * 0.8 } }, { label: 'Does not occur', p: 1 - r.residual, node: { type: 'outcome', value: 0 } }] } },
      { label: 'Transfer (insure)', cost: I * 0.08, node: { type: 'chance', branches: [{ label: 'Risk occurs', p: r.rawProbability, node: { type: 'outcome', value: -I * 0.25 } }, { label: 'Does not occur', p: 1 - r.rawProbability, node: { type: 'outcome', value: 0 } }] } },
      { label: 'Accept', cost: 0, node: { type: 'chance', branches: [{ label: 'Risk occurs', p: r.rawProbability, node: { type: 'outcome', value: -I } }, { label: 'Does not occur', p: 1 - r.rawProbability, node: { type: 'outcome', value: 0 } }] } },
    ],
  };
  const rolled = decisionTree(tree);
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Threat ', select(cands.map((x) => ({ value: x.id, label: `${x.id} ${x.title}` })), s.dtRisk, (v) => { s.dtRisk = v; dash.rerender(); })]),
    el('span', { class: 'pm-note', text: 'Square = decision, circle = chance node. Values roll back right → left: EMV = Σ p × outcome, then subtract each option’s cost and keep the best.' }),
  ]));
  pane.appendChild(chartBox(decisionTreeChart(tree, rolled, { label: `Decision tree for ${r.id}`, format: (v) => m(v) }), { minWidth: 760 }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Roll-back arithmetic', [table(['Option', 'Cost', 'EMV of outcomes', 'Net value'], rolled.options.map((o, i) => {
      const opt = tree.options[i];
      return [o.label === rolled.choice ? el('b', { text: `${o.label} ✓` }) : o.label, m(-(opt.cost || 0)), m(o.detail.value), el('span', { class: o.label === rolled.choice ? 'pm-pos pm-mono' : 'pm-mono', text: m(o.value) })];
    }), { dense: true }),
    el('p', { class: 'pm-note', text: `Best response by expected value: ${rolled.choice} (${m(rolled.value)}). Probabilities and impacts are the register’s live values for ${r.id}; mitigation removes 20 % of impact and drops P to the residual target; insurance leaves a 25 % deductible.` })]),
    card('EMV of the whole register', [
      dl([
        ['Σ threat EMV (active)', m(-p.riskExposure)],
        ['Σ opportunity EMV (active)', m(p.risks.filter((x) => x.kind === 'opportunity' && ACTIVE.has(x.status)).reduce((a, x) => a + x.emv, 0))],
        ['Contingency reserve', fmtPKR(p.contingencyReserve)],
        ['Residual EMV if every threat hits its residual target', m(p.risks.filter((x) => x.kind === 'threat').reduce((a, x) => a + x.residualEmv, 0))],
      ]),
      el('p', { class: 'pm-note', text: 'EMV assumes risk neutrality and independence. A risk-averse sponsor (or correlated risks such as monsoon + utilities) needs the P80 from the Monte Carlo forecast instead.' }),
      button('Open Monte Carlo forecast', () => dash.open('forecast'), { small: true, kind: 'ghost', icon: 'dice' }),
    ]),
  ]));
}

/* ---------------------------------------------------- burndown & reserves */

function pctAt(p, id, day) {
  const st = p.state.get(id);
  if (st.actualFinish !== null && st.actualFinish <= day) return 1;
  if (st.actualStart === null || st.actualStart > day) return 0;
  const span = Math.max(1, p.day - st.actualStart);
  return Math.max(0, Math.min(1, st.pct * ((day - st.actualStart) / span)));
}

function monitor(dash, pane, p) {
  const D = p.baselineDuration;
  const threats = p.risks.filter((r) => r.kind === 'threat');
  const planned = [];
  const step = Math.max(7, Math.round(D / 120));
  const exposureAtPlanned = (d) => threats.reduce((a, r) => {
    if (r.recurring) return a + Math.abs(r.emv) * Math.max(0, (D - d) / D);
    const ids = r.taskIds.length ? r.taskIds : [];
    if (!ids.length) return a;
    const rem = ids.reduce((x, id) => {
      const n = p.baseline.nodes.get(id);
      const f = n.ef <= d ? 0 : n.es >= d ? 1 : (n.ef - d) / Math.max(1, n.ef - n.es);
      return x + f;
    }, 0) / ids.length;
    return a + Math.abs(r.emv) * rem;
  }, 0);
  for (let d = 0; d <= D; d += step) planned.push([d, exposureAtPlanned(d)]);
  planned.push([D, 0]);
  const days = p.evmHistory.map((h) => h.day).filter((d) => d <= p.day);
  if (days[days.length - 1] !== p.day) days.push(p.day);
  const actual = days.map((d) => [d, threats.reduce((a, r) => {
    if (r.status === 'Closed' || r.status === 'Expired') return a;
    if (r.recurring) return a + Math.abs(r.emv) * Math.max(0, (Math.max(D, p.forecastFinish) - d) / Math.max(D, p.forecastFinish));
    const ids = r.taskIds;
    if (!ids.length) return a;
    const rem = ids.reduce((x, id) => x + (1 - pctAt(p, id, d)), 0) / ids.length;
    return a + Math.abs(r.emv) * rem;
  }, 0)]);
  const events = p.events.filter((ev) => ev.kind === 'risk').slice(0, 40);
  const marks = events.map((ev) => {
    const near = actual.reduce((b, pt) => (Math.abs(pt[0] - ev.day) < Math.abs(b[0] - ev.day) ? pt : b), actual[0] || [0, 0]);
    return { x: ev.day, y: near[1], color: C.bad, r: 4.5, label: `${shortDate(p.startDate, ev.day)} — ${ev.title}` };
  });
  const H = [0, Math.max(D, p.forecastFinish) + 20];
  pane.appendChild(section('Risk burndown', 'threat exposure (|EMV| × share of exposed work still to do)'));
  pane.appendChild(chartBox(lineChart({
    width: 1000, height: 290, label: 'Risk exposure burndown', xDomain: H,
    series: [
      { label: 'Planned burndown (baseline schedule)', points: planned, color: C.pv, width: 2.2, dash: '6 5', area: false },
      { label: 'Actual exposure', points: actual, color: C.bad, width: 3, area: true, areaOpacity: 0.12 },
    ],
    marks, xTicks: dayTicks(p.startDate, H[0], H[1], 9), vlines: [{ x: p.day, label: 'Today', color: 'var(--amber)', dash: '' }],
    animate: animOnce(dash, 'burn'), yLabel: 'Exposure (PKR)',
  }), { minWidth: 700, legend: legend([{ label: 'Planned', color: C.pv, shape: 'line', dash: '6 5' }, { label: 'Actual exposure', color: C.bad, shape: 'line' }, { label: 'Risk occurred', color: C.bad, shape: 'dot' }]), caption: 'Exposure falls as exposed work is completed and risks expire. A curve above plan means work is late or risks were added — both need a response.' }));
  // reserves
  const samples = record(p);
  const crPlan = planned.map(([d, v]) => [d, p.contingencyReserve * (planned[0][1] ? v / planned[0][1] : 0)]);
  const crAct = [[0, p.contingencyReserve], ...samples.filter((x) => x.day > 0).map((x) => [x.day, x.cr])];
  const mrAct = [[0, p.managementReserve], ...samples.filter((x) => x.day > 0).map((x) => [x.day, x.mr])];
  pane.appendChild(section('Reserve drawdown'));
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    chartBox(lineChart({
      width: 720, height: 270, label: 'Reserve drawdown', xDomain: H,
      series: [
        { label: 'Contingency expected to be released (plan)', points: crPlan, color: C.warn, width: 2, dash: '6 5' },
        { label: 'Contingency remaining', points: crAct, color: C.warn, width: 3, dots: crAct.length < 40 },
        { label: 'Management reserve remaining', points: mrAct, color: C.c6, width: 3, dots: mrAct.length < 40 },
      ],
      xTicks: dayTicks(p.startDate, H[0], H[1], 6), vlines: [{ x: p.day, label: 'Today', color: 'var(--amber)', dash: '' }],
      hlines: [{ y: 0, label: '', color: C.bad }], animate: animOnce(dash, 'res'),
    }), { minWidth: 520, legend: legend([{ label: 'Contingency (plan)', color: C.warn, shape: 'line', dash: '6 5' }, { label: 'Contingency', color: C.warn, shape: 'line' }, { label: 'Management reserve', color: C.c6, shape: 'line' }]), caption: 'Remaining reserves are sampled every simulated day while the simulator runs.' }),
    card('Reserve health', [
      dl([
        ['Contingency', `${fmtPKR(p.contingencyRemaining)} of ${fmtPKR(p.contingencyReserve)}`],
        ['Remaining exposure', fmtPKR(p.riskExposure)],
        ['Coverage', `${(p.contingencyRemaining / Math.max(1, p.riskExposure)).toFixed(2)} × exposure`],
        ['Management reserve', `${fmtPKR(p.managementRemaining)} of ${fmtPKR(p.managementReserve)}`],
      ]),
      el('p', { class: 'pm-note', text: p.contingencyRemaining < p.riskExposure ? 'Coverage below 1.0: remaining contingency does not cover expected exposure — escalate to the sponsor or strengthen responses.' : 'Coverage above 1.0: contingency still covers the expected value of open threats.' }),
    ]),
  ]));
  pane.appendChild(section('Owners & triggers', 'active risks'));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'title', label: 'Risk' }, { key: 'owner', label: 'Owner' }, { key: 'trigger', label: 'Trigger (early-warning sign)' },
    { key: 'lastDay', label: 'Last occurred', format: (v) => (v === null || v === undefined ? '—' : shortDate(p.startDate, v)) },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Occurred' ? 'bad' : v === 'Escalated' ? 'gold' : 'info') },
  ], p.risks.filter((r) => ACTIVE.has(r.status)).sort((a, b) => b.score - a.score), { dense: true, sortable: true }));
}
