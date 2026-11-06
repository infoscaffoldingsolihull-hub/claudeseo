import { el, kpi, button, tabs, pill, select, slider, field, fmtPKR, fmtPct, bar, confirmModal } from '../dom.js';
import { C, chartBox, legend, lineChart, barChart, section, card, dl, table, hookCard } from '../charts.js';
import { riskShareChart } from '../charts3.js';
import { CONTRACT_TYPES, DEFAULT_WEIGHTS, contractOutcome, makeOrBuy, pointOfTotalAssumption } from '../../pm/procurement.js';

/**
 * Procurement (Week 11): procurement management plan, make-or-buy, the six
 * contract types and who carries the cost risk, RFP → evaluation → award with
 * adjustable weights, contract administration (payments, claims, variations,
 * vendor performance) and procurement closure.
 */

const TABS = [
  { id: 'plan', label: 'Plan & make-or-buy', icon: 'truck' },
  { id: 'types', label: 'Contract types', icon: 'scroll' },
  { id: 'award', label: 'RFP & award', icon: 'target' },
  { id: 'admin', label: 'Administration', icon: 'coins' },
  { id: 'closure', label: 'Closure', icon: 'flagCheck' },
];

const STAGES = ['Planned', 'RFP', 'Evaluating', 'Awarded', 'Delivering', 'Closed'];
const M = 1e6;
const mm = (v) => `${Math.round(v / M).toLocaleString('en-US')} m`;
const STATUS_CLS = { Planned: 'muted', RFP: 'info', Evaluating: 'gold', Awarded: 'indigo', Delivering: 'ok', Closed: 'muted' };

/* Teaching notes on the six contract types (PMBOK procurement / contract types). */
const TYPE_INFO = {
  FFP: { buyer: 0, fee: 'Seller’s profit is whatever is left of the fixed price', risk: 'Seller carries all cost risk; buyer carries scope-change risk.', use: 'Well-defined scope: standard supply, drainage, landside works.' },
  FPIF: { buyer: 0.8, fee: 'Target fee + share of savings, price ceiling', risk: 'Shared up to the point of total assumption (PTA); seller bears everything above the ceiling.', use: 'Mostly defined works with some uncertainty: pavements, support facilities.' },
  CPFF: { buyer: 1, fee: 'Fixed fee regardless of cost', risk: 'Buyer carries cost risk; seller’s fee does not rise with cost.', use: 'Scope still evolving: design, supervision, advisory services.' },
  CPIF: { buyer: 0.8, fee: 'Target fee, adjusted by an agreed sharing ratio', risk: 'Costs shared by ratio (e.g. 80/20); fee has a floor and a cap.', use: 'Large, complex work where the buyer wants cost discipline: the terminal.' },
  CPAF: { buyer: 0.95, fee: 'Base fee + award fee decided by the buyer’s judgement', risk: 'Buyer carries cost risk; award fee rewards performance on cost, schedule, quality.', use: 'Subjective outcomes: ATC tower and systems integration.' },
  'T&M': { buyer: 1, fee: 'Hourly rate × hours + materials, often with a not-to-exceed cap', risk: 'Buyer carries productivity risk; a cap limits exposure.', use: 'Short or uncertain effort: agile IT teams, survey support.' },
};

/* Last RFP weights per package, kept for the session. */
function weightsFor(s, pk) {
  if (!s.weights) s.weights = {};
  if (!s.weights[pk.id]) s.weights[pk.id] = { ...DEFAULT_WEIGHTS };
  return s.weights[pk.id];
}

export const PANEL_PROCUREMENT = {
  id: 'procurement',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'plan';
    if (!s.pkg || !p.procurement.some((x) => x.id === s.pkg)) s.pkg = p.procurement[0].id;
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const awarded = p.procurement.filter((x) => x.vendor);
    const committed = awarded.reduce((a, x) => a + x.awardedValue + x.variations.reduce((b, v) => b + v.value, 0), 0);
    const paid = awarded.reduce((a, x) => a + x.paid, 0);
    const openClaims = p.procurement.reduce((a, x) => a + x.claims.filter((c) => c.status !== 'Settled').length, 0);
    const perf = awarded.length ? awarded.reduce((a, x) => a + x.performance, 0) / awarded.length : 0;
    body.appendChild(el('p', { class: 'lede', text: `${p.procurement.length} procurement packages cover the programme. Decide what to make and what to buy, choose a contract type that shares risk sensibly, score bids against weighted criteria, then administer each contract until its final account is agreed.` }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Awarded', value: `${awarded.length} / ${p.procurement.length}`, foot: `${p.procurement.filter((x) => x.status === 'Closed').length} closed` }),
      kpi({ label: 'Committed value', value: fmtPKR(committed), foot: 'awards + variations' }),
      kpi({ label: 'Paid to date', value: fmtPKR(paid), foot: `${fmtPKR(awarded.reduce((a, x) => a + x.retention, 0))} retention held` }),
      kpi({ label: 'Open claims', value: String(openClaims), foot: 'submitted or under assessment', cls: openClaims > 2 ? 'warn' : '' }),
      kpi({ label: 'Vendor performance', value: awarded.length ? perf.toFixed(2) : '—', foot: '1.00 = as bid', cls: awarded.length && perf < 0.95 ? 'warn' : awarded.length ? 'good' : '' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ plan, types, award, admin, closure })[s.tab](dash, pane, p, s);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 11', title: 'AstraZeneca and the pandemic — contracts under uncertainty',
      text: 'Buying vaccine doses before approval meant sharing risk with suppliers in unusual ways. Which contract type in this panel comes closest, and who carried the risk?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · vendors are fictional; prices and bids are simulated` })]));
  },
};

function pkgPicker(p, s, dash, filter = null) {
  const list = filter ? p.procurement.filter(filter) : p.procurement;
  if (!list.some((x) => x.id === s.pkg) && list.length) s.pkg = list[0].id;
  return select(list.map((x) => ({ value: x.id, label: `${x.id} · ${x.name}` })), s.pkg, (v) => { s.pkg = v; dash.rerender(); }, { 'aria-label': 'Procurement package', class: 'pkg-pick' });
}

function stepper(pk) {
  const idx = STAGES.indexOf(pk.status);
  return el('div', { class: 'stepper', role: 'list', 'aria-label': `Procurement stage: ${pk.status}` }, STAGES.map((st, i) =>
    el('span', { role: 'listitem', class: i < idx ? 'done' : i === idx ? 'now' : '' }, [st])));
}

/* ------------------------------------------------------------------ plan */

function plan(dash, pane, p, s) {
  pane.appendChild(card('Procurement management plan', [
    el('p', { text: 'The plan states which work is bought, how vendors are found and chosen, which contract type applies and when each step must happen so that supply arrives before it is needed.' }),
    dl([
      ['Approach', 'Competitive RFP for every package; weighted scoring of price, technical, experience and schedule; award by the procurement board.'],
      ['Lead times', 'Supply packages carry a delivery lead time after award (switchgear, bridges, AGL, baggage system).'],
      ['Constraints', 'Funding releases per year, import dependence for bitumen and electronics, and monsoon windows.'],
      ['Control', 'Monthly payments less 5 % retention; claims assessed within 30 and settled within 60 days; changes through the CCB.'],
    ]),
  ], { cls: 'flat' }));

  pane.appendChild(section('Package schedule', 'click a row to select'));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Package' },
    { key: 'contractType', label: 'Type', format: (v) => pill(v, 'gold', CONTRACT_TYPES[v]) },
    { key: 'kind', label: 'Kind' },
    { key: 'estimate', label: 'Estimate', num: true, format: (v) => fmtPKR(v) },
    { key: 'rfp', label: 'RFP', num: true, format: (v) => p.dateLabel(v).slice(4) },
    { key: 'awardDay', label: 'Award', num: true, format: (v) => p.dateLabel(v).slice(4) },
    { key: 'status', label: 'Status', format: (v) => pill(v, STATUS_CLS[v] || '') },
  ], p.procurement.map((x) => ({ id: x.id, name: x.name, contractType: x.contractType, kind: x.kind, estimate: x.estimate, rfp: x.plan.rfpDay, awardDay: x.awardDay === null ? x.plan.awardDay : x.awardDay, status: x.status })), {
    dense: true, sortable: true, onRow: (r) => { s.pkg = r.id; dash.rerender(); }, selected: (r) => r.id === s.pkg,
  }));

  const pk = p.procurement.find((x) => x.id === s.pkg);
  pane.appendChild(section('Make or buy', 'the selected package'));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [el('label', { class: 'inline' }, ['Package', pkgPicker(p, s, dash)])]));
  const mob = pk.makeOrBuy;
  const max = Math.max(mob.make, mob.buy);
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card(`${pk.id} · ${pk.name}`, [
      el('div', { class: 'mob-row' }, [el('span', { text: 'Make in-house' }), bar(mob.make / max, 'bad'), el('b', { text: fmtPKR(mob.make) })]),
      el('div', { class: 'mob-row' }, [el('span', { text: 'Buy from the market' }), bar(mob.buy / max, 'good'), el('b', { text: fmtPKR(mob.buy) })]),
      el('p', {}, [pill(`Decision: ${mob.decision}`, mob.decision === 'Buy' ? 'ok' : 'warn'), ` ${mob.rationale}`]),
      el('p', { class: 'pm-note', text: `Contract type ${pk.contractType} (${CONTRACT_TYPES[pk.contractType]}). Lead time ${pk.leadTime} days; required by ${p.dateLabel(pk.plan.requiredBy)}.` }),
    ]),
    makeBuyCalculator(s),
  ]));
}

function makeBuyCalculator(s) {
  if (!s.mb) s.mb = { fixed: 120, make: 1.2, buy: 2.0, qty: 150 };
  const box = el('div');
  const draw = () => {
    box.replaceChildren();
    const r = makeOrBuy({ makeFixed: s.mb.fixed, makeUnit: s.mb.make, buyUnit: s.mb.buy, quantity: s.mb.qty });
    const qMax = Math.max(s.mb.qty * 1.6, Number.isFinite(r.breakEven) ? r.breakEven * 1.6 : 0, 10);
    const pts = (f) => [0, qMax / 2, qMax].map((q) => [q, f(q)]);
    box.appendChild(chartBox(lineChart({
      width: 520, height: 230, label: 'Make versus buy cost by quantity',
      series: [{ label: 'Make (fixed + unit × q)', points: pts((q) => s.mb.fixed + s.mb.make * q), color: C.bad, width: 2.4 }, { label: 'Buy (price × q)', points: pts((q) => s.mb.buy * q), color: C.good, width: 2.4 }],
      xDomain: [0, qMax], yFormat: (v) => `${Math.round(v)}`, xFormat: (v) => `${Math.round(v)}`, xLabel: 'Quantity (units)', yLabel: 'Cost (PKR m)',
      vlines: [{ x: s.mb.qty, label: `Need: ${s.mb.qty}`, color: C.brass }],
      marks: Number.isFinite(r.breakEven) && r.breakEven <= qMax ? [{ x: r.breakEven, y: s.mb.fixed + s.mb.make * r.breakEven, label: `Break-even ${r.breakEven.toFixed(0)} units`, text: `q* = ${r.breakEven.toFixed(0)}`, color: C.ink, shape: 'diamond' }] : [],
    }), { minWidth: 360, legend: legend([{ label: 'Make', color: C.bad, shape: 'line' }, { label: 'Buy', color: C.good, shape: 'line' }]) }));
    box.appendChild(el('p', {}, [pill(`${r.decision} is cheaper`, r.decision === 'Buy' ? 'ok' : 'warn'), ` Make ${r.makeCost.toFixed(0)} m vs buy ${r.buyCost.toFixed(0)} m for ${s.mb.qty} units. Break-even quantity q* = fixed ÷ (buy − make unit cost) = ${Number.isFinite(r.breakEven) ? r.breakEven.toFixed(0) : 'never'}.`]));
  };
  const ctl = (label, key, min, max, step, fmt) => field(label, slider(min, max, step, s.mb[key], (v) => { s.mb[key] = v; draw(); }, fmt));
  const node = card('Break-even calculator', [
    el('p', { class: 'pm-note', text: 'Make costs a fixed set-up plus a unit cost; buying costs a price per unit. Change the inputs to see where the lines cross. Figures are illustrative (PKR m).' }),
    el('div', { class: 'mb-controls' }, [
      ctl('Fixed set-up (make)', 'fixed', 0, 400, 10, (v) => `${v} m`),
      ctl('Unit cost (make)', 'make', 0.2, 4, 0.1, (v) => `${v.toFixed(1)} m`),
      ctl('Unit price (buy)', 'buy', 0.2, 4, 0.1, (v) => `${v.toFixed(1)} m`),
      ctl('Quantity needed', 'qty', 10, 400, 10, (v) => `${v}`),
    ]),
    box,
  ]);
  draw();
  return node;
}

/* ----------------------------------------------------------------- types */

function types(dash, pane, p, s) {
  if (!s.type) s.type = 'FPIF';
  if (!s.cost) s.cost = 100;
  const rows = Object.keys(CONTRACT_TYPES).map((t) => ({ type: t, label: CONTRACT_TYPES[t], buyer: TYPE_INFO[t].buyer, fee: TYPE_INFO[t].fee }));
  const count = (t) => p.procurement.filter((x) => x.contractType === t).length;
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Who bears the cost risk?', [
      chartBox(riskShareChart(rows, { selected: s.type, onSelect: (t) => { s.type = t; dash.rerender(); } }), { minWidth: 600, caption: 'Share of a cost overrun carried by the seller (left, red) and the buyer (right, blue). Click a row to explore it.' }),
    ]),
    card(`${s.type} — ${CONTRACT_TYPES[s.type]}`, [
      dl([['Risk', TYPE_INFO[s.type].risk], ['Fee', TYPE_INFO[s.type].fee], ['Typical use', TYPE_INFO[s.type].use], ['In this programme', `${count(s.type)} package${count(s.type) === 1 ? '' : 's'}`]]),
    ], { cls: 'accent' }),
  ]));

  pane.appendChild(section('Cost-outcome simulator', 'what the buyer pays when actual cost moves'));
  const target = 1000; // PKR m target cost
  const params = {
    FFP: { price: 1100 }, FPIF: { targetCost: target, targetFee: 100, buyerShare: 0.8, ceiling: 1300 },
    CPFF: { fee: 80 }, CPIF: { targetCost: target, targetFee: 100, buyerShare: 0.8, minFee: 40, maxFee: 160 },
    CPAF: { baseFee: 40, awardPool: 80, awardScore: 0.75 }, 'T&M': { hours: 0, rate: 0, materials: 0, nte: 1400 },
  };
  const outcome = (t, cost) => {
    const base = { type: t, actualCost: cost, ...params[t] };
    if (t === 'T&M') { base.hours = cost / 1.0; base.rate = 1.0; base.materials = 0; }
    return contractOutcome(base);
  };
  const xs = [];
  for (let c = 700; c <= 1500; c += 50) xs.push(c);
  const colors = { FFP: C.c1, FPIF: C.c2, CPFF: C.c3, CPIF: C.c4, CPAF: C.c6, 'T&M': C.c7 };
  const readout = el('div', { class: 'cost-readout' });
  const fill = () => {
    const cost = target * s.cost / 100;
    const o = outcome(s.type, cost);
    readout.replaceChildren(
      kpi({ label: 'Actual cost', value: `${Math.round(cost)} m`, foot: `${s.cost} % of the ${target} m target` }),
      kpi({ label: 'Buyer pays', value: `${Math.round(o.buyerPays)} m`, foot: o.capped ? 'capped at ceiling / NTE' : 'price + fee', cls: o.buyerPays > 1.2 * target ? 'warn' : '' }),
      kpi({ label: 'Seller profit', value: `${Math.round(o.sellerProfit)} m`, foot: o.sellerProfit < 0 ? 'seller makes a loss' : 'fee or margin', cls: o.sellerProfit < 0 ? 'bad' : 'good' }),
      kpi({ label: 'Point of total assumption', value: s.type === 'FPIF' ? `${Math.round(pointOfTotalAssumption({ targetCost: target, targetFee: 100, ceiling: 1300, buyerShare: 0.8 }))} m` : '—', foot: s.type === 'FPIF' ? 'PTA = target cost + (ceiling − target price) ÷ buyer share' : 'FPIF only' }),
    );
  };
  fill();
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Contract', select(Object.keys(CONTRACT_TYPES).map((t) => ({ value: t, label: t })), s.type, (v) => { s.type = v; dash.rerender(); })]),
    el('label', { class: 'inline' }, ['Actual cost', slider(70, 150, 5, s.cost, (v) => { s.cost = v; fill(); }, (v) => `${v} % of target`)]),
  ]));
  pane.appendChild(readout);
  pane.appendChild(chartBox(lineChart({
    width: 880, height: 300, label: 'Buyer payment by actual cost for each contract type',
    series: Object.keys(CONTRACT_TYPES).map((t) => ({ label: t, points: xs.map((c) => [c, outcome(t, c).buyerPays]), color: colors[t], width: t === s.type ? 3.4 : 1.8, opacity: t === s.type ? 1 : 0.65 })),
    xDomain: [700, 1500], yFormat: (v) => `${Math.round(v)}`, xFormat: (v) => `${Math.round(v)}`, xLabel: 'Actual cost to the seller (PKR m)', yLabel: 'Buyer pays (PKR m)',
    vlines: [{ x: target, label: 'Target cost', color: C.muted }],
  }), { legend: legend(Object.keys(CONTRACT_TYPES).map((t) => ({ label: t, color: colors[t], shape: 'line' }))), caption: 'A flat line means the buyer is protected from overruns (FFP); a line of slope 1 means the buyer pays every rupee of overrun (cost-plus). FPIF and CPIF bend in between.' }));
}

/* ------------------------------------------------------------------ award */

function award(dash, pane, p, s) {
  const pk = p.procurement.find((x) => x.id === s.pkg);
  const w = weightsFor(s, pk);
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [el('label', { class: 'inline' }, ['Package', pkgPicker(p, s, dash)]), el('span', { class: 'grow' }), pill(pk.contractType, 'gold', CONTRACT_TYPES[pk.contractType])]));
  pane.appendChild(stepper(pk));
  pane.appendChild(el('p', { class: 'pm-note', text: `Plan: RFP issued ${p.dateLabel(pk.plan.rfpDay)}, evaluation ${p.dateLabel(pk.plan.evaluationDay)}, default award ${p.dateLabel(pk.plan.awardDay)}. If you do not award, the board awards the highest default score on the award day.` }));

  const out = el('div');
  const draw = () => {
    out.replaceChildren();
    const ranked = p.evaluateBids(pk.id, w);
    const lowest = pk.bids.slice().sort((a, b) => a.price - b.price)[0];
    const best = ranked[0];
    out.appendChild(el('div', { class: 'pm-grid c2' }, [
      card('Adjust the evaluation weights', [
        ...[['price', 'Price'], ['technical', 'Technical'], ['experience', 'Experience'], ['schedule', 'Schedule']].map(([k, l]) =>
          field(l, slider(0, 1, 0.05, w[k], (v) => { w[k] = v; draw(); }, (v) => `${Math.round(v * 100)} %`))),
        el('p', { class: 'pm-note', text: `Weights are normalised (total ${Math.round((w.price + w.technical + w.experience + w.schedule) * 100)} %). Price score = lowest price ÷ bid price × 100.` }),
        el('div', { class: 'row' }, [button('Reset to default', () => { Object.assign(w, DEFAULT_WEIGHTS); dash.rerender(); }, { small: true, kind: 'ghost' })]),
      ]),
      card('Ranking', [
        chartBox(barChart({
          width: 520, height: 220, label: 'Weighted bid scores', categories: ranked.map((b) => b.vendor.split(' ').slice(0, 2).join(' ')),
          series: [{ label: 'Weighted score', color: C.c2, values: ranked.map((b) => +b.score.toFixed(1)) }], yFormat: (v) => `${Math.round(v)}`, valueLabels: true, yDomain: [0, 100],
        }), { minWidth: 400 }),
        best.vendor !== lowest.vendor
          ? el('div', { class: 'callout warn' }, [el('div', {}, [el('b', { text: 'The lowest price does not win. ' }), `${lowest.vendor} bids lowest (${fmtPKR(lowest.price)}) but ${best.vendor} scores higher once technical merit, experience and schedule count.`])])
          : el('div', { class: 'callout good' }, [el('div', {}, [el('b', { text: 'Lowest bid and best score agree. ' }), `${best.vendor} leads on both price and weighted value.`])]),
      ]),
    ]));
    out.appendChild(table([
      { key: 'rank', label: '#', num: true }, { key: 'vendor', label: 'Bidder' },
      { key: 'price', label: 'Price', num: true, format: (v) => fmtPKR(v) },
      { key: 'priceScore', label: 'Price score', num: true, format: (v) => v.toFixed(1) },
      { key: 'technical', label: 'Technical', num: true }, { key: 'experience', label: 'Experience', num: true }, { key: 'schedule', label: 'Schedule', num: true },
      { key: 'score', label: 'Weighted', num: true, format: (v) => el('b', { text: v.toFixed(1) }) },
      { key: 'act', label: '', format: (_, r) => (pk.vendor ? (pk.vendor === r.vendor ? pill('Awarded', 'ok') : '') : button('Award', () => doAward(r.vendor), { small: true, kind: 'primary', disabled: pk.status === 'Planned', title: pk.status === 'Planned' ? 'The RFP has not been issued yet' : `Award ${pk.id} to ${r.vendor}` })) },
    ], ranked.map((b, i) => ({ rank: i + 1, ...b })), { dense: true, rowClass: (r) => (r.vendor === pk.vendor ? 'selected' : '') }));
    if (pk.status === 'Planned') out.appendChild(el('div', { class: 'callout' }, [el('div', {}, [`The RFP opens on ${p.dateLabel(pk.plan.rfpDay)}. You can already rehearse the evaluation here; awarding unlocks when bids are invited.`])]));
    if (pk.vendor) out.appendChild(el('div', { class: 'callout good' }, [el('div', {}, [el('b', { text: 'Awarded. ' }), `${pk.vendor} — ${fmtPKR(pk.awardedValue)} on ${p.dateLabel(pk.awardDay)}. Continue in Administration.`])]));
  };
  const doAward = async (vendor) => {
    const ok = await confirmModal(`Award ${pk.id}?`, `Award "${pk.name}" to ${vendor}? The contract becomes binding and the decision is logged.`, { okLabel: 'Award contract' });
    if (!ok) return;
    const r = p.award(pk.id, vendor);
    dash.sim.toast(r.message, r.ok ? 'good' : 'warn');
    dash.rerender();
  };
  draw();
  pane.appendChild(out);
}

/* ------------------------------------------------------------------ admin */

function admin(dash, pane, p, s) {
  const awarded = p.procurement.filter((x) => x.vendor);
  if (!awarded.length) {
    pane.appendChild(el('div', { class: 'pm-empty', text: 'No contract has been awarded yet. Award a package in “RFP & award” — or run the simulation until the board awards the first default winners — and its payments, claims and variations appear here.' }));
    return;
  }
  if (!awarded.some((x) => x.id === s.pkg)) s.pkg = awarded[0].id;
  const pk = awarded.find((x) => x.id === s.pkg);
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [el('label', { class: 'inline' }, ['Contract', pkgPicker(p, s, dash, (x) => !!x.vendor)]), el('span', { class: 'grow' }), pill(pk.status, STATUS_CLS[pk.status]), pill(pk.contractType, 'gold', CONTRACT_TYPES[pk.contractType])]));
  pane.appendChild(stepper(pk));
  const varTotal = pk.variations.reduce((a, v) => a + v.value, 0);
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Contract value', value: fmtPKR(pk.awardedValue + varTotal), foot: `${pk.vendor}${varTotal ? ` · variations ${mm(varTotal)}` : ''}` }),
    kpi({ label: 'Delivered', value: fmtPct(pk.delivered, 0), foot: 'earned share of the package' }),
    kpi({ label: 'Paid · retention', value: `${mm(pk.paid)} · ${mm(pk.retention)}`, foot: '5 % retention held until closure' }),
    kpi({ label: 'Vendor performance', value: pk.performance.toFixed(2), foot: pk.performance < 0.95 ? 'below the bid promise' : 'at or above the bid promise', cls: pk.performance < 0.95 ? 'warn' : 'good' }),
  ]));

  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Payments', [
      pk.payments.length
        ? chartBox(barChart({
          width: 520, height: 210, label: 'Monthly payments and cumulative paid', categories: pk.payments.map((x) => `D${x.day}`),
          series: [{ label: 'Net payment (PKR m)', color: C.c2, values: pk.payments.map((x) => Math.round(x.net / M)) }],
          line: { label: 'Cumulative (PKR m)', color: C.brass, values: pk.payments.map((x) => Math.round(x.cumulative / M)) }, yFormat: (v) => `${Math.round(v)}`,
        }), { minWidth: 420 })
        : el('p', { class: 'pm-note', text: 'No certified payment yet: payments are certified every 30 days once work is delivered.' }),
    ]),
    card('Variations', [
      pk.variations.length
        ? table([{ key: 'change', label: 'Change' }, { key: 'day', label: 'Day', num: true }, { key: 'value', label: 'Value', num: true, format: (v) => mm(v) }], pk.variations, { dense: true })
        : el('p', { class: 'pm-note', text: 'No approved variations. A variation is a change to the contract scope; it must go through integrated change control and is added to the contract value when implemented.' }),
      el('div', { class: 'row' }, [button('Request a variation', () => requestVariation(dash, pk), { small: true, icon: 'shuffle', title: 'Raises a change request linked to this package' })]),
    ]),
  ]));

  pane.appendChild(section('Claims', 'submitted → assessed (30 d) → settled (60 d)'));
  pane.appendChild(table([
    { key: 'id', label: 'Claim' }, { key: 'day', label: 'Day', num: true }, { key: 'by', label: 'By' }, { key: 'reason', label: 'Reason' },
    { key: 'amount', label: 'Amount', num: true, format: (v) => mm(v) }, { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Settled' ? 'ok' : v === 'Assessed' ? 'gold' : 'info') },
    { key: 'settled', label: 'Settled', num: true, format: (v) => (v ? mm(v) : '—') },
  ], pk.claims, { dense: true, empty: 'No claims on this contract.' }));
  const form = { amount: 120, reason: 'Delay from late site access' };
  const amount = el('input', { type: 'number', value: form.amount, step: 10, 'aria-label': 'Claim amount in PKR million' });
  const reason = el('input', { type: 'text', value: form.reason, maxlength: 90, 'aria-label': 'Claim reason' });
  pane.appendChild(card('Raise a claim', [
    el('p', { class: 'pm-note', text: 'A positive amount is a contractor claim for extra time or cost; a negative amount is an employer back-charge for defects or delay. Claims settle at a negotiated share of the amount.' }),
    el('div', { class: 'row' }, [field('Amount (PKR m)', amount), field('Reason', reason), button('Submit claim', () => {
      const r = p.raiseClaim(pk.id, Number(amount.value) * M, reason.value.trim() || 'Claim');
      dash.sim.toast(r.message, r.ok ? 'good' : 'warn');
      dash.rerender();
    }, { kind: 'primary', icon: 'scroll' })]),
  ], { cls: 'flat' }));

  pane.appendChild(section('Vendor performance', 'all awarded contracts'));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'vendor', label: 'Vendor' }, { key: 'type', label: 'Type' },
    { key: 'delivered', label: 'Delivered', num: true, format: (v) => el('div', { class: 'perf-cell' }, [bar(v, 'good'), el('span', { text: fmtPct(v, 0) })]) },
    { key: 'performance', label: 'Performance', num: true, format: (v) => pill(v.toFixed(2), v < 0.95 ? 'warn' : 'ok') },
    { key: 'claims', label: 'Open claims', num: true },
  ], awarded.map((x) => ({ id: x.id, vendor: x.vendor, type: x.contractType, delivered: x.delivered, performance: x.performance, claims: x.claims.filter((c) => c.status !== 'Settled').length })), { dense: true, onRow: (r) => { s.pkg = r.id; dash.rerender(); }, selected: (r) => r.id === s.pkg }));
}

function requestVariation(dash, pk) {
  const p = dash.project;
  const task = p.taskById.get(pk.packageIds[0]);
  const ch = p.raiseChange({
    title: `Variation — ${pk.name}`, description: `Contract variation requested on ${pk.id} (${pk.vendor}): additional scope agreed with the vendor, to be priced and approved by the CCB.`,
    raisedBy: 'Commercial Manager', impact: { cost: Math.round(pk.awardedValue * 0.02), days: 0 }, wbs: task ? task.id : null, merit: 0.5,
  });
  dash.sim.toast(`${ch.id} raised — decide it in Change Control`, 'good');
  dash.rerender();
}

/* ---------------------------------------------------------------- closure */

function closure(dash, pane, p, s) {
  const closed = p.procurement.filter((x) => x.status === 'Closed');
  const open = p.procurement.length - closed.length;
  pane.appendChild(el('p', { class: 'lede', text: 'Procurement closes package by package: all work accepted, claims settled, retention released and the final account agreed. Lessons go into the register for the next project.' }));
  pane.appendChild(el('div', { class: 'grid c3 pm-kpis' }, [
    kpi({ label: 'Closed packages', value: `${closed.length} / ${p.procurement.length}`, cls: closed.length === p.procurement.length ? 'good' : '' }),
    kpi({ label: 'Still open', value: String(open), foot: 'awaiting delivery or award' }),
    kpi({ label: 'Retention released', value: fmtPKR(closed.reduce((a, x) => a + x.retention, 0)) }),
  ]));
  pane.appendChild(card('Closure checklist (per package)', [
    el('ul', { class: 'check-list' }, [
      'All deliverables inspected and formally accepted',
      'Claims and disputes settled; no open variations',
      'Retention released after the defects period',
      'Final account agreed: contract value, actual cost, fee or profit',
      'Contract records archived with the vendor’s performance rating',
    ].map((t) => el('li', { text: t }))),
  ], { cls: 'flat' }));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Package' }, { key: 'type', label: 'Type' }, { key: 'vendor', label: 'Vendor' },
    { key: 'value', label: 'Contract value', num: true, format: (v) => fmtPKR(v) },
    { key: 'cost', label: 'Actual cost', num: true, format: (v) => fmtPKR(v) },
    { key: 'pays', label: 'Buyer pays', num: true, format: (v) => fmtPKR(v) },
    { key: 'profit', label: 'Seller profit', num: true, format: (v) => fmtPKR(v), cls: (v) => (v < 0 ? 'pm-neg' : 'pm-pos') },
  ], closed.map((x) => ({ id: x.id, name: x.name, type: x.contractType, vendor: x.vendor, value: x.finalAccount.contractValue, cost: x.finalAccount.actualCost, pays: x.finalAccount.buyerPays, profit: x.finalAccount.sellerProfit })),
  { dense: true, empty: 'No package has closed yet. A package closes when all of its work is complete; run the simulation forward to see final accounts.' }));
  const pending = p.procurement.filter((x) => x.status !== 'Closed').slice(0, 6);
  pane.appendChild(section('Next to close'));
  pane.appendChild(el('div', { class: 'pm-chips' }, pending.map((x) => pill(`${x.id} ${x.status}`, STATUS_CLS[x.status], x.name))));
}
