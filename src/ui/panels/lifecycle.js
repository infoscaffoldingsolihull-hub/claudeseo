import { el, kpi, button, tabs, pill, bar, icon } from '../dom.js';
import { section, card, table } from '../charts.js';
import { chevronFlow, radarChart, gaugeChart, K } from '../charts2.js';

/**
 * lifecycle — Life Cycle & Gates (Week 2, CLO1). The five PMBOK 8 focus areas as a
 * navigator tied to project.phase, the five stage gates (approve via approveGate), the
 * panels that belong to each focus area, and the seven performance domains with live
 * indicators. PMBOK counts used here: 5 focus areas, 6 principles, 7 performance domains.
 */

const AREAS = [
  {
    id: 'initiating', label: 'Initiating', sub: 'Why and who', phase: ['initiating'],
    text: 'Define the need and the value: build the business case, authorise the work through a charter, and identify the people who will shape or be shaped by the project.',
    outputs: ['Business case and benefits', 'Project charter and sponsor authority', 'Stakeholder register', 'High-level scope, budget and milestones'],
    panels: ['charter', 'foundations', 'stakeholders', 'approach'], gates: ['G0'], clo: 'CLO1',
  },
  {
    id: 'planning', label: 'Planning', sub: 'What, when, how much', phase: ['planning'],
    text: 'Progressively elaborate scope, schedule, cost, quality, risk, resources, procurement and communications into a baseline the sponsor approves.',
    outputs: ['Scope baseline: statement, WBS, dictionary', 'Schedule baseline and critical path', 'Cost baseline and reserves', 'Risk, quality, procurement and communications plans'],
    panels: ['scope', 'schedule', 'cost', 'risk', 'quality', 'procurement', 'team', 'msproject'], gates: ['G1'], clo: 'CLO2',
  },
  {
    id: 'executing', label: 'Executing', sub: 'Do the work', phase: ['executing'],
    text: 'Direct and manage the work to the plan: build the deliverables, lead the team, run sprints on the IT stream, manage vendors and engage stakeholders.',
    outputs: ['Deliverables (runway, terminal, tower, IT)', 'Work performance data', 'Change requests and issues', 'Team and vendor management records'],
    panels: ['agile', 'team', 'procurement', 'quality', 'stakeholders'], gates: ['G2'], clo: 'CLO2',
  },
  {
    id: 'monitoring', label: 'Monitoring & Controlling', sub: 'Measure and steer', phase: ['monitoring'],
    text: 'Track, review and regulate progress and performance. It runs alongside every other focus area; in this simulator the project also enters a final certification and handover stretch.',
    outputs: ['Earned value and variance analysis', 'Forecasts (EAC, Monte Carlo)', 'Approved change decisions', 'Certification, trials and acceptance'],
    panels: ['control', 'forecast', 'cost', 'risk', 'operations', 'present'], gates: ['G3', 'G4'], clo: 'CLO3',
  },
  {
    id: 'closing', label: 'Closing', sub: 'Hand over and learn', phase: ['closing'],
    text: 'Formally complete the work: obtain acceptance, transfer to operations, release resources, close contracts and capture lessons learned.',
    outputs: ['Final acceptance and handover', 'Closed contracts and records', 'Lessons-learned register', 'Benefits handover to the operator'],
    panels: ['closing', 'operations', 'cases', 'assess'], gates: ['G4'], clo: 'CLO3',
  },
];
const ORDER = ['initiating', 'planning', 'executing', 'monitoring', 'closing'];
const TITLES = {
  charter: 'Charter', foundations: 'Foundations', stakeholders: 'Stakeholders', approach: 'Approach', scope: 'Scope & WBS', schedule: 'Schedule', cost: 'Cost & EVM',
  risk: 'Risk', quality: 'Quality', procurement: 'Procurement', team: 'Team', msproject: 'MS Project', agile: 'Agile', control: 'Change Control',
  forecast: 'Monte Carlo', operations: 'Operations', present: 'Present', closing: 'Closing', cases: 'Cases', assess: 'Quiz',
};
const TABS = [
  { id: 'focus', label: 'Focus areas', icon: 'cycle' },
  { id: 'gates', label: 'Stage gates', icon: 'flagCheck' },
  { id: 'domains', label: 'Principles & domains', icon: 'target' },
];

const unit = (v, d = 0) => (Number.isFinite(v) ? (v > 1.5 ? v / 100 : v) : d);
const clamp = (v) => Math.max(0, Math.min(1, v));

function areaState(p, a) {
  const cur = ORDER.indexOf(p.finished ? 'closing' : p.phase);
  const i = ORDER.indexOf(a.id);
  return i < cur ? 'done' : i === cur ? 'current' : 'next';
}

function gateRow(dash, g, showApprove = true) {
  const p = dash.project;
  const st = g.status;
  const tone = st === 'approved' ? 'ok' : st === 'ready' ? 'warn' : 'muted';
  return el('div', { class: `cp-gate ${st}` }, [
    el('div', { class: 'cp-gate-h' }, [
      el('b', { text: `${g.id} · ${g.name}` }),
      pill(st === 'approved' ? `Approved day ${g.day}` : st === 'ready' ? 'Ready for approval' : 'Not ready', tone),
    ]),
    el('ul', { class: 'cp-feat' }, g.criteria.map((c) => el('li', { text: c }))),
    el('div', { class: 'row' }, [
      el('small', { class: 'muted', text: `Baseline day ${g.baselineDay}${g.status === 'approved' && g.day !== null ? ` · actual ${g.day} (${g.day - g.baselineDay >= 0 ? '+' : ''}${g.day - g.baselineDay} d)` : ` · today ${p.day}`}` }),
      showApprove && st !== 'approved' ? button('Approve gate', () => {
        const res = p.approveGate(g.id);
        dash.sim.toast && dash.sim.toast(res.message || (res.ok ? `${g.id} approved` : `${g.id} not approved`), res.ok ? 'good' : 'warn');
        dash.state.gateMsg = res.message || '';
        dash.rerender();
      }, { small: true, kind: st === 'ready' ? 'primary' : 'ghost', icon: 'check' }) : null,
    ]),
  ]);
}

function focus(dash, pane) {
  const p = dash.project;
  const s = dash.state;
  const curId = p.finished ? 'closing' : p.phase;
  const sel = s.area || curId;
  const flow = chevronFlow(AREAS.map((a) => ({
    id: a.id, label: a.label, sub: a.sub, state: areaState(p, a),
    badge: a.gates.map((g) => g).join('·'), title: `${a.label} — gates ${a.gates.join(', ')}`,
  })), sel, (id) => { s.area = id; dash.rerender(); });
  pane.appendChild(flow);
  const a = AREAS.find((x) => x.id === sel);
  const isCur = sel === curId;
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card(`${a.label}${isCur ? ' — current' : ''}`, [
      el('p', { text: a.text }),
      el('div', { class: 'pm-note' }, [el('b', { text: 'Typical outputs' })]),
      el('ul', { class: 'cp-feat' }, a.outputs.map((o) => el('li', { text: o }))),
      el('div', { class: 'pm-note' }, [el('b', { text: 'Panels for this focus area' })]),
      el('div', { class: 'cp-chips' }, a.panels.map((id) => el('button', { type: 'button', class: 'cp-chip', onclick: () => dash.open(id) }, [TITLES[id] || id]))),
    ], { cls: 'accent', extra: pill(a.clo, 'clo') }),
    card('Gates in this focus area', a.gates.map((id) => gateRow(dash, p.gateById.get(id)))),
  ]));
  pane.appendChild(el('div', { class: 'callout' }, [icon('cycle', 16), el('div', {}, [
    el('b', { text: 'Focus areas are not strict phases.' }),
    el('p', { text: 'Planning continues through delivery (rolling-wave), monitoring and controlling runs the whole time, and an agile stream such as terminal IT cycles through plan–do–review every two weeks inside the executing area.' }),
  ])]));
}

function timeline(p) {
  const total = Math.max(1, p.baselineDuration);
  const pos = (d) => `${clamp(d / total) * 100}%`;
  return el('div', { class: 'cp-gtl', role: 'img', 'aria-label': 'Stage-gate timeline against the baseline' }, [
    el('div', { class: 'cp-gtl-line' }),
    el('div', { class: 'cp-gtl-now', style: { left: pos(p.day) }, title: `Today: day ${p.day}` }, [el('span', { text: `Day ${p.day}` })]),
    ...p.gates.map((g) => el('div', { class: `cp-gtl-g ${g.status}`, style: { left: pos(g.baselineDay) }, title: `${g.id} ${g.name} — baseline day ${g.baselineDay}` }, [
      el('i'), el('span', { text: g.id }),
    ])),
  ]);
}

function gates(dash, pane) {
  const p = dash.project;
  const approved = p.gates.filter((g) => g.status === 'approved').length;
  pane.appendChild(el('p', { class: 'lede', text: 'A stage gate is a governance decision point: the board checks the criteria, then authorises (or refuses) the move to the next stage. Gates become ready when their predecessor work is finished — approving them promptly keeps the schedule moving.' }));
  pane.appendChild(card('Gates on the baseline timeline', [timeline(p), el('div', { class: 'row' }, [pill(`${approved} / ${p.gates.length} approved`, approved === p.gates.length ? 'ok' : 'gold'), pill(`Phase: ${p.phase}`, 'info')])]));
  if (dash.state.gateMsg) pane.appendChild(el('div', { class: 'callout', role: 'status' }, [icon('flag', 16), el('span', { text: dash.state.gateMsg })]));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, p.gates.map((g) => gateRow(dash, g))));
}

function domainData(dash) {
  const p = dash.project;
  let s = {};
  try { s = p.snapshot(); } catch { s = {}; }
  const due = p.gates.filter((g) => g.baselineDay <= p.day);
  const dueOk = due.filter((g) => g.status === 'approved').length;
  const util = p.resources.length ? p.resources.reduce((a, r) => a + (r.utilisation || 0), 0) / p.resources.length : 0;
  const res = Math.min(1, unit(p.welfare, 0.8));
  return [
    { id: 'Governance', value: due.length ? dueOk / due.length : 1, display: `${p.gates.filter((g) => g.status === 'approved').length}/${p.gates.length} gates`, text: `${p.decisionLog.length} decisions logged · ${p.changes.length} change requests`, panel: 'control', q: 'Are decisions made by the right people at the right time?' },
    { id: 'Scope', value: clamp(1 - (s.openChanges || 0) / 8), display: `${Math.round(unit(s.progress) * 100)}% done`, text: `${p.requirements.length} requirements · ${p.tasks.length} work elements · ${s.openChanges || 0} open changes`, panel: 'scope', q: 'Is the work defined, controlled and accepted?' },
    { id: 'Schedule', value: clamp(s.spi || 1), display: `SPI ${(s.spi || 1).toFixed(2)}`, text: `Forecast finish day ${Math.round(s.forecastFinish || 0)} vs baseline ${p.baselineDuration}`, panel: 'schedule', q: 'Will the work finish when promised?' },
    { id: 'Finance', value: clamp(s.cpi || 1), display: `CPI ${(s.cpi || 1).toFixed(2)}`, text: `Spending against a PKR budget; contingency ${Math.round((p.contingencyRemaining / Math.max(1, p.contingencyReserve)) * 100)}% left`, panel: 'cost', q: 'Is value for money being delivered?' },
    { id: 'Stakeholders', value: clamp(unit(s.stakeholderSatisfaction, 0.6)), display: `${Math.round(unit(s.stakeholderSatisfaction, 0.6) * 100)}% satisfied`, text: `${p.stakeholders.length} stakeholders engaged`, panel: 'stakeholders', q: 'Are the right people informed, consulted and supportive?' },
    { id: 'Resources', value: clamp((res + (util > 1 ? 1 / util : 1)) / 2), display: `Welfare ${Math.round(res * 100)}%`, text: `${p.resources.length} resource types · average load ${Math.round(util * 100)}%`, panel: 'team', q: 'Are people, plant and materials available when needed?' },
    { id: 'Risk', value: clamp(1 - (s.riskExposure || 0) / Math.max(1, p.contingencyReserve)), display: `${s.openRisks ?? 0} open`, text: `${s.realisedRisks ?? 0} realised · exposure vs contingency`, panel: 'risk', q: 'Are uncertainties anticipated and handled?' },
  ];
}

function domains(dash, pane) {
  const data = domainData(dash);
  const axes = data.map((d) => ({ label: d.id, value: d.value, target: 0.9 }));
  pane.appendChild(el('p', { class: 'lede', text: 'PMBOK Guide 8th Edition describes the work through six principles that guide behaviour and seven performance domains — areas of focus that are active throughout the life cycle: Governance, Scope, Schedule, Finance, Stakeholders, Resources and Risk. The radar scores each domain from live project indicators (simple health proxies, not official PMBOK metrics).' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Domain health — live', [
      el('div', { class: 'cp-radar' }, [radarChart({ axes, size: 340, label: 'Performance-domain health radar' })]),
      el('small', { class: 'muted', text: 'Gold dashed line = 90% target. Click a domain card to open its panel.' }),
    ]),
    card('Principles in practice', [
      el('p', { text: 'The six principles describe the mindset behind good decisions; they are not steps. Read them in the Guide; in this simulator the same behaviours are what the decision cards, missions and MEHRAN’s coaching reward:' }),
      el('ul', { class: 'cp-feat' }, [
        'Take responsibility for outcomes — own the baseline and the lessons',
        'Engage people early and honestly — stakeholders, team, vendors',
        'Focus on value, not only output — benefits at handover',
        'Tailor the approach to context — predictive, agile or hybrid',
        'Make risk-informed decisions — reserves, responses, escalation',
        'Adapt when evidence changes — control change, re-forecast',
      ].map((t) => el('li', { text: t }))),
      el('small', { class: 'muted', text: 'Paraphrased themes for teaching — consult the PMBOK Guide 8th Edition for the official wording.' }),
    ], { cls: 'accent' }),
  ]));
  pane.appendChild(section('Seven performance domains', 'live indicator per domain'));
  pane.appendChild(el('div', { class: 'pm-grid c4' }, data.map((d) => el('button', { type: 'button', class: 'cp-dom', onclick: () => dash.open(d.panel), title: `Open ${TITLES[d.panel] || d.panel}` }, [
    el('div', { class: 'cp-dom-h' }, [el('b', { text: d.id }), pill(d.display, d.value >= 0.9 ? 'ok' : d.value >= 0.75 ? 'warn' : 'bad')]),
    el('div', { class: 'cp-dom-q', text: d.q }),
    bar(d.value, d.value >= 0.9 ? 'ok' : d.value >= 0.75 ? 'warn' : 'bad', `${d.id} health`),
    el('small', { text: d.text }),
  ]))));
  pane.appendChild(card('Gauges', [el('div', { class: 'cp-gauges' }, [
    gaugeChart({ value: Math.min(2, dash.project.snapshot().spi || 0), max: 1.5, target: 1, label: 'SPI', display: (dash.project.snapshot().spi || 0).toFixed(2), zones: [{ to: 0.6, color: K.bad }, { to: 0.9, color: K.warn }, { to: 1.5, color: K.good }] }),
    gaugeChart({ value: Math.min(2, dash.project.snapshot().cpi || 0), max: 1.5, target: 1, label: 'CPI', display: (dash.project.snapshot().cpi || 0).toFixed(2), zones: [{ to: 0.6, color: K.bad }, { to: 0.9, color: K.warn }, { to: 1.5, color: K.good }] }),
  ])], { sub: 'Schedule and cost performance indices — target 1.00' }));
}

const VIEWS = { focus, gates, domains };

export const PANEL_LIFECYCLE = {
  id: 'lifecycle',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'focus';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const nextGate = p.gates.find((g) => g.status !== 'approved');
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Current focus area', value: AREAS.find((a) => a.id === (p.finished ? 'closing' : p.phase))?.label || p.phase, foot: `Project day ${p.day}`, cls: 'good' }),
      kpi({ label: 'Gates approved', value: `${p.gates.filter((g) => g.status === 'approved').length} / ${p.gates.length}`, foot: nextGate ? `Next: ${nextGate.id} ${nextGate.status === 'ready' ? '— ready' : ''}` : 'All gates passed', cls: nextGate && nextGate.status === 'ready' ? 'warn' : '' }),
      kpi({ label: 'Focus areas · domains', value: '5 · 7', foot: 'PMBOK Guide 8th Edition' }),
      kpi({ label: 'Baseline duration', value: `${p.baselineDuration} days`, foot: `${Math.round((p.day / Math.max(1, p.baselineDuration)) * 100)}% of the clock elapsed` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Gates, dates and indicators are simulated scenario data.' })]));
  },
};
