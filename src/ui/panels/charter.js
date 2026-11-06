import {el, kpi, button, pill, slider, select, fmtPKR, fmtPct, fmtIndex, confirmModal} from '../dom.js';
import { C, chartBox, legend, barChart, hbarChart, shortDate, money, section, card, animOnce, dl, table } from '../charts.js';
import { fact, hasFact, factSource } from '../../core/facts.js';

/**
 * Project Charter (Weeks 1–3): purpose and justification, SMART objectives,
 * high-level scope, milestones, summary budget, success criteria, a
 * transparent (simulated) business case with NPV / IRR / payback, the
 * verified facts box, and the sponsor's Gate G0 sign-off.
 */

const FACT_KEYS = [
  ['Airport', ['airport.name', 'airport.city']],
  ['Codes', ['airport.iata', 'airport.icao']],
  ['Runway', ['runway.designators', 'runway.length', 'runway.width']],
  ['Elevation & climate', ['airport.elevation', 'airport.climate']],
  ['History', ['history.closed1998', 'history.reopened2008', 'history.lastFlight2013']],
  ['Revival (proposed)', ['revival.proposal', 'revival.uses']],
  ['Constraints reported', ['constraints.encroachment', 'constraints.landOwnership']],
  ['Organisations', ['org.operator', 'org.regulator']],
];

const SCENARIOS = { low: { label: 'Low demand (−30 %)', f: 0.7 }, central: { label: 'Central case', f: 1 }, high: { label: 'High demand (+25 %)', f: 1.25 } };

function npv(rate, flows) {
  return flows.reduce((a, cf, t) => a + cf / Math.pow(1 + rate, t), 0);
}
function irr(flows) {
  let lo = -0.9;
  let hi = 1;
  if (npv(lo, flows) * npv(hi, flows) > 0) return NaN;
  for (let k = 0; k < 120; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo, flows) * npv(mid, flows) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Simulated economic appraisal built from the live cost baseline. */
function businessCase(p, { rate, scenario, benefit, opex }) {
  const y0 = p.startDate.getUTCFullYear();
  const D = p.baselineDuration;
  const openYear = p.date(D).getUTCFullYear();
  const dayOf = (y) => Math.max(0, Math.min(D, Math.round((Date.UTC(y, 0, 1) - p.startDate.getTime()) / 86400000)));
  const capexTotal = p.bac + p.contingencyReserve;
  const years = [];
  const horizonEnd = openYear + 25;
  const base = p.benefits && p.benefits.businessCaseTarget ? p.benefits.businessCaseTarget.annualPax : 1.5e6;
  for (let y = y0; y <= horizonEnd; y++) {
    const capex = y <= openYear ? (p.plannedValueAt(dayOf(y + 1)) - p.plannedValueAt(dayOf(y))) * (capexTotal / p.bac) : 0;
    const k = y - openYear;
    const ramp = k <= 0 ? 0 : k === 1 ? 0.45 : k === 2 ? 0.7 : k === 3 ? 0.88 : Math.pow(1.03, k - 3);
    const pax = base * scenario * ramp;
    const benefits = pax * benefit;
    const cost = k > 0 ? opex : 0;
    years.push({ year: y, capex, pax, benefits, opex: cost, net: benefits - cost - capex });
  }
  const flows = years.map((r) => r.net);
  const value = npv(rate, flows);
  const r = irr(flows);
  let cum = 0;
  let dcum = 0;
  let payback = null;
  let dpayback = null;
  years.forEach((row, t) => {
    cum += row.net;
    dcum += row.net / Math.pow(1 + rate, t);
    row.cum = cum;
    row.dcum = dcum;
    if (payback === null && cum >= 0 && t > 0 && row.year > openYear) payback = row.year;
    if (dpayback === null && dcum >= 0 && t > 0 && row.year > openYear) dpayback = row.year;
  });
  const pvB = years.reduce((a, row, t) => a + row.benefits / Math.pow(1 + rate, t), 0);
  const pvC = years.reduce((a, row, t) => a + (row.capex + row.opex) / Math.pow(1 + rate, t), 0);
  return { years, npv: value, irr: r, payback, dpayback, bcr: pvC ? pvB / pvC : NaN, openYear, capexTotal };
}

export const PANEL_CHARTER = {
  id: 'charter',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const g0 = p.gateById.get('G0');
    const e = p.evm();
    // ---- title block
    body.appendChild(el('div', { class: 'pm-card accent' }, [
      el('div', { class: 'row between', style: { flexWrap: 'wrap', gap: '0.6rem' } }, [
        el('div', {}, [
          el('div', { class: 'hook-kicker', text: `Project charter · ${p.info.code}` }),
          el('h4', { style: { margin: '0.15rem 0 0.2rem', fontSize: '1.15rem', fontFamily: 'var(--font-display)', color: 'var(--ink-strong)' }, text: p.info.name }),
          el('div', { class: 'pm-note', style: { margin: 0 }, text: `${fact('airport.name')} · ${fact('airport.city')} · ${fact('airport.iata')} / ${fact('airport.icao')}` }),
        ]),
        pill(g0.status === 'approved' ? `Approved ${shortDate(p.startDate, g0.day)}` : g0.status === 'ready' ? 'Awaiting sponsor signature' : 'Draft — in preparation', g0.status === 'approved' ? 'ok' : g0.status === 'ready' ? 'gold' : 'muted'),
      ]),
      dl([
        ['Sponsor', p.info.sponsor.replace(/^Sponsor: /, '')],
        ['Project manager', 'Project Director (authorised to apply organisational resources once G0 is approved)'],
        ['Start · baseline finish', `${p.dateLabel(0)} → ${p.dateLabel(p.baselineDuration)} (${p.baselineDuration} days)`],
        ['Approach', `${p.approach[0].toUpperCase()}${p.approach.slice(1)} — predictive civil works, Scrum for terminal IT`],
        ['Authority', 'PD may approve changes ≤ PKR 50 m and ≤ 10 days float; larger changes go to the change control board'],
      ]),
    ]));
    // ---- purpose + facts
    body.appendChild(el('div', { class: 'pm-grid c21', style: { marginTop: '0.8rem' } }, [
      card('Purpose & justification', [
        el('p', { text: `The aerodrome serving ${fact('airport.city')} (${fact('airport.type').toLowerCase()}, operated by the ${fact('org.operator')}) has no regular commercial service. In this scenario the programme revives and expands it so it can take scheduled domestic and regional flights and serve as a diversion airport — the uses reported for the real proposal.` }),
        el('p', { text: `Real-world context (see the verified facts box): ${fact('history.closed1998').toLowerCase()}; ${fact('history.reopened2008').toLowerCase()}; ${fact('history.lastFlight2013').toLowerCase()}. ${fact('revival.proposal')}.` }),
        el('p', { class: 'pm-note', text: 'Everything else in this charter — budget, dates, organisation, targets — is a simulated teaching scenario, not an announced project.' }),
        section('SMART objectives'),
        smartTable(p, e),
      ]),
      factsBox(),
    ]));
    // ---- scope, milestones
    body.appendChild(el('div', { class: 'pm-grid c2', style: { marginTop: '0.8rem' } }, [
      card('High-level scope', [
        el('b', { text: 'In scope' }),
        el('ul', {}, p.summaries.map((sm) => el('li', {}, [`${sm.code} ${sm.name}`]))),
        el('b', { text: 'Out of scope' }),
        el('ul', {}, ['Off-airport road and utility networks beyond the boundary', 'Airline operations, route development and fares', 'Resettlement compensation policy (owned by the provincial government)', 'Ground-handling concessions and retail leasing'].map((x) => el('li', { text: x }))),
      ]),
      card('Summary milestones', [table([
        { key: 'id', label: 'ID' }, { key: 'name', label: 'Milestone' },
        { key: 'baselineDay', label: 'Baseline', format: (v) => shortDate(p.startDate, v) },
        { key: 'f', label: 'Forecast / actual', format: (v, r) => el('span', { class: r.late > 10 ? 'pm-neg' : r.late > 0 ? 'pm-warn' : '', text: shortDate(p.startDate, v) }) },
        { key: 'done', label: '', format: (v) => (v ? pill('Done', 'ok') : '') },
      ], p.milestones.map((ms) => {
        const st = p.state.get(ms.id);
        const fn = p.forecast && p.forecast.nodes.get(ms.id);
        const f = st.actualFinish !== null ? st.actualFinish : fn ? (Number.isFinite(p.forecastDay) ? p.forecastDay : p.day) + fn.ef : ms.baselineDay;
        return { ...ms, f, late: f - ms.baselineDay, done: st.pct >= 1 };
      }), { dense: true })]),
    ]));
    // ---- budget summary
    const total = p.bac + p.contingencyReserve + p.managementReserve;
    body.appendChild(section('Summary budget', 'PKR bn · simulated'));
    body.appendChild(el('div', { class: 'pm-grid c21' }, [
      chartBox(hbarChart({
        width: 760, labelWidth: 290, label: 'Summary budget by WBS level 1', animate: animOnce(dash, 'budget'),
        rows: [
          ...p.summaries.map((sm) => ({ label: `${sm.code} ${sm.name}`, value: sm.budget, color: 'var(--c2)', text: `${(sm.budget / 1e9).toFixed(2)} bn` })),
          { label: 'Contingency reserve', value: p.contingencyReserve, color: 'var(--warn)', text: `${(p.contingencyReserve / 1e9).toFixed(2)} bn` },
          { label: 'Management reserve', value: p.managementReserve, color: 'var(--c6)', text: `${(p.managementReserve / 1e9).toFixed(2)} bn` },
        ],
      }), { minWidth: 600 }),
      card('Budget authority', [dl([
        ['Work packages (BAC)', fmtPKR(p.bac)], ['+ Contingency reserve', fmtPKR(p.contingencyReserve)], ['= Cost baseline', fmtPKR(p.bac + p.contingencyReserve)],
        ['+ Management reserve', fmtPKR(p.managementReserve)], ['= Total authorised budget', el('b', { text: fmtPKR(total) })],
      ]), el('p', { class: 'pm-note', text: 'The charter authorises a summary budget only; the detailed cost baseline is approved at Gate G1.' })]),
    ]));
    // ---- business case
    body.appendChild(section('Business case — NPV, IRR and payback', 'simulated economic appraisal, computed live'));
    body.appendChild(businessCasePane(dash, p));
    // ---- success criteria & risks
    const top = p.risks.filter((r) => r.kind === 'threat').sort((a, b) => b.score - a.score || a.emv - b.emv).slice(0, 5);
    body.appendChild(el('div', { class: 'pm-grid c2', style: { marginTop: '0.8rem' } }, [
      card('Success criteria', [el('ul', { class: 'check-list' }, [
        crit('Aerodrome certificate granted and the airport opened to scheduled traffic', p.gateById.get('G3').status === 'approved'),
        crit('Delivered for no more than the authorised budget (EAC ≤ cost baseline)', e.eac.cpi <= p.bac + p.contingencyReserve, true),
        crit('Opened within 90 days of the baseline date (P80 commitment)', p.scheduleVarianceDays <= 90, true),
        crit('Zero fatalities; lost-time injury rate below the industry benchmark', p.safety >= 0.85, true),
        crit('Business-case benefits: 36 aircraft movements and 4,200 passengers a day within a year of opening', p.benefits.movementsPerDay >= 36),
        crit('Key stakeholders satisfied (weighted satisfaction ≥ 70 %)', p.stakeholderSatisfaction >= 0.7, true),
      ])]),
      card('High-level risks & constraints', [
        el('ul', {}, top.map((r) => el('li', {}, [el('b', { class: 'pm-mono', text: `${r.id} ` }), `${r.title} — P×I ${r.score}`]))),
        el('b', { text: 'Constraints' }),
        el('ul', {}, [el('li', { text: `${fact('constraints.encroachment')} (per press reports).` }), el('li', { text: `${fact('constraints.landOwnership')} (per press reports).` }), el('li', { text: 'The existing runway must stay usable for diversions during phased works (simulated assumption).' })]),
      ]),
    ]));
    // ---- sign-off
    body.appendChild(section('Sponsor sign-off — Gate G0'));
    body.appendChild(signoff(dash, p, g0));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Real facts are cited in the facts box; every other figure is simulated.' })]));
  },
};

function crit(text, ok, live = false) {
  return el('li', { class: ok ? (live ? 'part' : 'ok') : '' }, [el('span', {}, [text, live ? el('small', { class: 'muted', text: ok ? '  — on track today' : '  — at risk today' }) : null])]);
}

function smartTable(p, e) {
  const sum = (id) => {
    const kids = p.tasks.filter((t) => t.summaryId === id);
    const b = kids.reduce((a, t) => a + t.budget, 0) || 1;
    return kids.reduce((a, t) => a + t.budget * p.state.get(t.id).pct, 0) / b;
  };
  const ms = (id) => shortDate(p.startDate, (p.milestones.find((m) => m.id === id) || {}).baselineDay || 0);
  const rows = [
    ['Runway', 'Extend and rehabilitate runway 02/20 to 3,505 m, Code E, friction μ ≥ 0.60, IRI ≤ 2.0', 'Declared distances published; friction & profile tests passed', `by ${ms('M06')} (M06)`, fmtPct(sum('3'))],
    ['Terminal', 'New terminal for 1,200 peak-hour passengers at IATA optimum level of service', 'Capacity trial at 1,200 pax/h', `by ${ms('M07')} (G2)`, fmtPct(sum('7'))],
    ['Certification', 'Aerodrome certificate from the regulator', 'Certificate issued; aerodrome manual & SMS accepted', `by ${ms('M09')} (G3)`, p.gateById.get('G3').status === 'approved' ? 'Done' : 'Pending'],
    ['Cost', 'Deliver within the cost baseline', 'CPI ≥ 0.95 at every gate; EAC ≤ cost baseline', 'each gate', `CPI ${fmtIndex(e.cpi)}`],
    ['Benefits', '36 movements and 4,200 passengers per day', 'Operations data 12 months after opening', `by ${ms('M10')} + 1 yr`, `${Math.round(p.benefits.movementsPerDay || 0)} mvts/day`],
  ];
  return table(['Objective', 'Specific', 'Measurable', 'Time-bound', 'Today'], rows, { dense: true });
}

function factsBox() {
  const items = [];
  for (const [label, keys] of FACT_KEYS) {
    const vals = keys.filter(hasFact);
    if (!vals.length) continue;
    const src = factSource(vals[0]);
    items.push(el('li', {}, [
      el('b', { text: `${label}: ` }), vals.map((k) => fact(k)).join(' · '),
      el('span', { class: 'src', text: `Source: ${src.url.replace(/^https?:\/\//, '')} (retrieved ${src.retrieved}${src.confidence !== 'high' ? `, ${src.confidence} confidence` : ''})` }),
    ]));
  }
  return el('aside', { class: 'facts-box' }, [el('h4', { text: 'Verified facts' }), el('ul', {}, items), el('p', { class: 'pm-note', text: 'Revival details are a proposal “per press reports”, not an approved project.' })]);
}

function businessCasePane(dash, p) {
  const s = dash.state;
  if (!Number.isFinite(s.rate)) s.rate = 0.1;
  if (!s.scen) s.scen = 'central';
  if (!Number.isFinite(s.ben)) s.ben = 9500;
  if (!Number.isFinite(s.opex)) s.opex = 1.6e9;
  const host = el('div');
  const draw = (anim) => {
    const bc = businessCase(p, { rate: s.rate, scenario: SCENARIOS[s.scen].f, benefit: s.ben, opex: s.opex });
    const yrs = bc.years;
    host.replaceChildren(
      el('div', { class: 'grid c5 pm-kpis' }, [
        kpi({ label: `NPV @ ${(s.rate * 100).toFixed(1)}%`, value: fmtPKR(bc.npv), cls: bc.npv >= 0 ? 'good' : 'bad', foot: 'Σ CFₜ ÷ (1 + r)ᵗ' }),
        kpi({ label: 'IRR', value: Number.isFinite(bc.irr) ? `${(bc.irr * 100).toFixed(1)}%` : '—', cls: bc.irr >= s.rate ? 'good' : 'bad', foot: 'r where NPV = 0 (bisection)' }),
        kpi({ label: 'Benefit–cost ratio', value: Number.isFinite(bc.bcr) ? bc.bcr.toFixed(2) : '—', cls: bc.bcr >= 1.5 ? 'good' : bc.bcr >= 1 ? 'warn' : 'bad', foot: 'PV benefits ÷ PV costs (target ≥ 1.5)' }),
        kpi({ label: 'Payback', value: bc.payback ? String(bc.payback) : 'beyond horizon', foot: `${bc.payback ? bc.payback - bc.openYear : '—'} yrs after opening (undiscounted)` }),
        kpi({ label: 'Discounted payback', value: bc.dpayback ? String(bc.dpayback) : 'beyond horizon', foot: `opening year ${bc.openYear}` }),
      ]),
      chartBox(barChart({
        width: 1000, height: 280, label: 'Business-case cash flows', categories: yrs.map((r) => `’${String(r.year).slice(2)}`), animate: anim,
        series: [{ label: 'Net cash flow', values: yrs.map((r) => r.net), colors: yrs.map((r) => (r.net < 0 ? 'var(--bad)' : 'var(--good)')) }],
        line: { label: 'Cumulative discounted cash flow', values: yrs.map((r) => r.dcum), right: false, color: C.brass, format: (v) => money(v) },
        hlines: [{ y: 0, label: '', color: 'rgba(232,228,216,.4)', dash: '' }], yFormat: (v) => money(v),
        barTitle: (i) => `${yrs[i].year}: capex ${money(-yrs[i].capex)}, benefits ${money(yrs[i].benefits)}, O&M ${money(-yrs[i].opex)} → net ${money(yrs[i].net)}`,
      }), { minWidth: 720, legend: legend([{ label: 'Construction (capex incl. contingency)', color: 'var(--bad)' }, { label: 'Net operating benefit', color: 'var(--good)' }, { label: 'Cumulative discounted cash flow', color: C.brass, shape: 'line' }]) }),
    );
  };
  draw(animOnce(dash, 'bc'));
  const controls = el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Discount rate ', slider(0.04, 0.16, 0.005, s.rate, (v) => { s.rate = v; draw(false); }, (v) => `${(v * 100).toFixed(1)}%`, { 'aria-label': 'Discount rate' })]),
    el('label', { class: 'inline' }, ['Demand ', select(Object.entries(SCENARIOS).map(([k, v]) => ({ value: k, label: v.label })), s.scen, (v) => { s.scen = v; draw(false); })]),
    el('label', { class: 'inline' }, ['Net benefit per passenger ', slider(4000, 16000, 250, s.ben, (v) => { s.ben = v; draw(false); }, (v) => `PKR ${v.toLocaleString('en-US')}`, { 'aria-label': 'Net economic benefit per passenger' })]),
  ]);
  return el('div', {}, [
    controls, host,
    el('div', { class: 'pm-grid c2' }, [
      card('Assumptions (all simulated)', [dl([
        ['Capital cost', 'Cost baseline (BAC + contingency) phased by the baseline PV curve'],
        ['Demand', '1.5 m passengers a year at maturity; ramp 45 % → 70 % → 88 % → 100 %, then +3 % a year'],
        ['Benefit', 'Economic benefit per passenger: aeronautical and commercial revenue, travel-time savings vs the drive to Karachi'],
        ['Operations', `${fmtPKR(s.opex)} a year O&M from the first full year`],
        ['Horizon', '25 years of operation, no residual value (conservative)'],
      ])]),
      card('How to read it', [
        el('p', { text: 'NPV > 0 at the hurdle rate and IRR above it mean the programme creates value; BCR ≥ 1.5 is the endorsement threshold in WBS 1.1. Push the discount rate up or demand down and watch the decision change — that is the sensitivity analysis the sponsor asks for before signing.' }),
        el('p', { class: 'pm-note', text: 'Payback ignores the time value of money; discounted payback does not. Both ignore cash flows after the payback year — NPV does not.' }),
      ]),
    ]),
  ]);
}

function signoff(dash, p, g0) {
  const t = p.taskById.get(g0.milestone);
  const crits = g0.criteria.map((c, i) => {
    const pred = t.predecessors[i] || t.predecessors[0];
    const ids = (c.match(/\(([\d.]+)\)/) || [])[1];
    const st = p.state.get(ids && p.state.has(ids) ? ids : pred.id);
    return el('li', { class: st.pct >= 1 ? 'ok' : st.pct > 0 ? 'part' : '' }, [`${c} — ${Math.round(st.pct * 100)}%`]);
  });
  const approve = async () => {
    const ok = await confirmModal('Approve the project charter?', 'As sponsor you formally authorise the project, name the project director and release the summary budget. Gate G0 moves the programme into planning.', { okLabel: 'Sign & approve G0' });
    if (!ok) return;
    const r = p.approveGate('G0');
    dash.sim.toast(r.message, r.ok ? 'good' : 'warn');
    if (r.ok && dash.sim.confetti) dash.sim.confetti();
    dash.rerender();
  };
  const right = g0.status === 'approved'
    ? el('div', {}, [el('div', { class: 'sig', text: 'Programme Board' }), el('div', { class: 'pm-note', text: `Approved by ${g0.approvedBy} on ${p.dateLabel(g0.day)}` })])
    : el('div', {}, [
      button(g0.status === 'ready' ? 'Sponsor: sign & approve Gate G0' : 'Approve Gate G0', approve, { kind: g0.status === 'ready' ? 'primary' : '', icon: 'check' }),
      el('div', { class: 'pm-note', text: g0.status === 'ready' ? `Ready since ${p.dateLabel(g0.readyDay)} — every day of delay holds up planning.` : `Not ready yet: the business case and charter must be complete (baseline ${p.dateLabel(g0.baselineDay)}).` }),
    ]);
  return el('div', { class: 'signoff' }, [
    el('div', {}, [el('b', { text: `${g0.id} · ${g0.name}` }), el('ul', { class: 'check-list' }, crits)]),
    right,
  ]);
}
