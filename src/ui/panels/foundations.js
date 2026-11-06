import { el, kpi, button, tabs, pill, slider, fmtPKR, confirmModal, icon } from '../dom.js';
import { section, card, table, legend } from '../charts.js';
import { bubbleMatrix, radarChart, K } from '../charts2.js';
import { fact } from '../../core/facts.js';

/**
 * foundations — PM Foundations (Week 1, CLO1): projects vs operations, programme and
 * portfolio, PMO types (with a real effect on the project), the PM role and
 * competences, EEFs and OPAs for Hyderabad, and the major frameworks.
 */

const TABS = [
  { id: 'basics', label: 'Project · programme · portfolio', icon: 'tree' },
  { id: 'portfolio', label: 'Portfolio view', icon: 'target' },
  { id: 'pmo', label: 'PMO type', icon: 'flag' },
  { id: 'role', label: 'PM role', icon: 'people' },
  { id: 'eef', label: 'EEFs & OPAs', icon: 'layers' },
  { id: 'frameworks', label: 'Frameworks', icon: 'book' },
];

/* ------------------------------------------------------------ basics */

const VS = [
  ['Purpose', 'Deliver a unique result and then close', 'Sustain the business and repeat the same outputs'],
  ['Duration', 'Temporary — has a start and an end', 'Ongoing — no planned end'],
  ['Output', 'Unique product, service or result', 'Repetitive products or services'],
  ['Change', 'Drives change: a new capability appears', 'Maintains the status quo, improves in small steps'],
  ['Management', 'Plan, baseline, control, close', 'Run, monitor, optimise'],
  ['At HDD', 'Extending the runway, building the terminal and tower', 'Handling flights, security, fuel, maintenance once open'],
];
const SORT = [
  ['Extend and strengthen the runway pavement', 'project', 'A unique, time-bound build.'],
  ['Hand baggage screening every morning', 'ops', 'Repetitive service once the airport runs.'],
  ['Commission the instrument landing system', 'project', 'One-off installation with acceptance tests.'],
  ['Refuel arriving aircraft', 'ops', 'Routine, continuous service delivery.'],
  ['Relocate encroaching structures from the corridor', 'project', 'Temporary effort with a defined result.'],
  ['Sweep the apron after each turnaround', 'ops', 'Recurring housekeeping.'],
  ['Replace the terminal air-conditioning plant', 'project', 'A defined upgrade with a start and a finish.'],
  ['Publish the daily flight information display', 'ops', 'Routine, repeated output.'],
];

function basics(dash, pane) {
  const p = dash.project;
  const s = dash.state;
  if (!s.sort) s.sort = {};
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Project vs operations', [
      table(['', 'Project', 'Operations'], VS.map(([a, b, c]) => [el('b', { text: a }), b, c]), { dense: true }),
    ]),
    card('Sort it: project or operations?', [
      el('p', { class: 'pm-note', text: 'Decide whether each airport activity is a project or part of operations. You get the reason straight away.' }),
      el('div', { class: 'cp-sort' }, SORT.map(([text, answer, why], i) => {
        const chosen = s.sort[i];
        return el('div', { class: `cp-sort-row ${chosen ? (chosen === answer ? 'right' : 'wrong') : ''}` }, [
          el('div', { class: 'cp-sort-q', text }),
          el('div', { class: 'row nowrap' }, [
            button('Project', () => { s.sort[i] = 'project'; dash.rerender(); }, { small: true, kind: chosen === 'project' ? 'primary' : 'ghost' }),
            button('Operations', () => { s.sort[i] = 'ops'; dash.rerender(); }, { small: true, kind: chosen === 'ops' ? 'primary' : 'ghost' }),
          ]),
          chosen ? el('div', { class: 'cp-sort-why', role: 'status', text: `${chosen === answer ? 'Correct. ' : `Not quite — it is ${answer === 'ops' ? 'operations' : 'a project'}. `}${why}` }) : null,
        ]);
      })),
      el('div', { class: 'pm-note', text: `Score: ${Object.entries(s.sort).filter(([i, v]) => SORT[i][1] === v).length} of ${SORT.length}` }),
    ]),
  ]));
  pane.appendChild(section('Programme and portfolio', 'how HDD sits in the organisation'));
  const budgets = new Map();
  for (const t of p.tasks) budgets.set(t.summaryId, (budgets.get(t.summaryId) || 0) + (t.budget || 0));
  const pkgs = p.summaries.map((x) => ({ ...x, b: budgets.get(x.id) || 0 }));
  const max = Math.max(...pkgs.map((x) => x.b), 1);
  pane.appendChild(el('div', { class: 'cp-tiers' }, [
    el('div', { class: 'cp-tier t1' }, [el('b', { text: 'Portfolio' }), el('span', { text: `${fact('org.operator')} (operator) — all its aviation investments, chosen to fit strategy and capacity (simulated portfolio)` })]),
    el('div', { class: 'cp-tier t2' }, [el('b', { text: 'Programme' }), el('span', { text: 'Hyderabad Airport Revival & Expansion Programme — coordinated components that together deliver benefits no single one could' })]),
    el('div', { class: 'cp-tier t3' }, [
      el('b', { text: 'Projects / work packages' }),
      el('div', { class: 'cp-pkgs' }, pkgs.map((x) => el('button', { type: 'button', class: 'cp-pkg', title: `${x.name} — ${fmtPKR(x.b)}`, onclick: () => dash.open('scope') }, [
        el('span', { class: 'cp-pkg-dot', style: { background: x.color || 'var(--c2)' } }),
        el('span', { class: 'cp-pkg-n', text: `${x.code} ${x.name}` }),
        el('span', { class: 'cp-pkg-bar' }, [el('i', { style: { width: `${(x.b / max) * 100}%` } })]),
        el('small', { text: fmtPKR(x.b) }),
      ]))),
    ]),
  ]));
  pane.appendChild(el('p', { class: 'pm-note', html: '<b>Rule of thumb:</b> a <i>portfolio</i> asks “are we doing the right things?”, a <i>programme</i> asks “are we realising the combined benefits?”, a <i>project</i> asks “are we delivering the output on time, on budget and to quality?”. Package budgets are simulated; click a package to see its scope.' }));
}

/* --------------------------------------------------------- portfolio */

const CRIT = [
  { id: 'fit', label: 'Strategic fit', w: 30, good: true },
  { id: 'ben', label: 'Benefit', w: 25, good: true },
  { id: 'risk', label: 'Risk (low is good)', w: 20, good: false },
  { id: 'cost', label: 'Cost (low is good)', w: 15, good: false },
  { id: 'urg', label: 'Urgency', w: 10, good: true },
];
const SINDH = [
  { id: 'HDD', short: 'HDD', name: 'Hyderabad Airport Revival & Expansion', fit: 5, ben: 4, risk: 3, cost: 4, urg: 4, budget: 0, mine: true },
  { id: 'A', short: 'A', name: 'Sukkur apron rehabilitation (sim)', fit: 3, ben: 3, risk: 2, cost: 2, urg: 3, budget: 2.6e9 },
  { id: 'B', short: 'B', name: 'Nawabshah terminal refit (sim)', fit: 3, ben: 2, risk: 2, cost: 2, urg: 2, budget: 1.9e9 },
  { id: 'C', short: 'C', name: 'Karachi cargo apron expansion (sim)', fit: 4, ben: 5, risk: 4, cost: 5, urg: 3, budget: 9.4e9 },
  { id: 'D', short: 'D', name: 'Thar regional airstrip (sim)', fit: 2, ben: 2, risk: 4, cost: 3, urg: 2, budget: 3.8e9 },
  { id: 'E', short: 'E', name: 'Sindh ATC radar renewal (sim)', fit: 5, ben: 3, risk: 3, cost: 3, urg: 5, budget: 4.2e9 },
  { id: 'F', short: 'F', name: 'Moenjodaro heritage airstrip (sim)', fit: 2, ben: 3, risk: 2, cost: 1, urg: 1, budget: 0.9e9 },
];
const score = (pr, w) => {
  let sum = 0; let tot = 0;
  for (const c of CRIT) {
    const v = c.good ? pr[c.id] : 6 - pr[c.id];
    sum += v * (w[c.id] ?? c.w); tot += (w[c.id] ?? c.w) * 5;
  }
  return tot ? (sum / tot) * 100 : 0;
};

function portfolio(dash, pane) {
  const s = dash.state;
  const p = dash.project;
  if (!s.w) s.w = Object.fromEntries(CRIT.map((c) => [c.id, c.w]));
  const list = SINDH.map((x) => ({ ...x, budget: x.mine ? p.bac : x.budget }));
  const scored = list.map((x) => ({ ...x, score: score(x, s.w) })).sort((a, b) => b.score - a.score);
  const maxB = Math.max(...list.map((x) => x.budget));
  const pts = list.map((x) => ({
    id: x.id, short: x.short, label: x.name, x: ((x.fit + x.ben) / 2 - 1) / 4, y: ((6 - x.risk) + (6 - x.cost)) / 2 / 5 - 0.1,
    r: x.budget / maxB, color: x.mine ? K.c1 : K.c2, mine: x.mine, title: `${x.name}: ${fmtPKR(x.budget)}`,
  }));
  pane.appendChild(el('p', { class: 'lede', text: 'The portfolio board has limited funds. Tune the criteria weights; the scoring table and bubble chart re-rank the (simulated) Sindh aviation projects live. Value = strategic fit and benefit; feasibility = low risk and low cost.' }));
  const ctrl = el('div', { class: 'cp-weights' }, CRIT.map((c) => el('label', { class: 'cp-w' }, [
    el('span', { text: c.label }),
    slider(0, 50, 5, s.w[c.id], (v, commit) => { s.w[c.id] = v; if (commit) dash.rerender(); }, (v) => `${v}%`, { 'aria-label': `${c.label} weight` }),
  ])));
  pane.appendChild(card('Criteria weights', [ctrl], { sub: 'Weights are relative; they are normalised in the score.' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Value vs feasibility', [
      bubbleMatrix({
        points: pts, xLabel: 'Value → (strategic fit + benefit)', yLabel: 'Feasibility →', label: 'Portfolio bubble chart', width: 520, height: 330,
        quadrants: ['Hard but valuable', 'Do first', 'Drop or defer', 'Quick wins'],
        onSelect: (pt) => { s.sel = pt.id; dash.rerender(); },
      }),
      legend([{ label: 'This programme', color: K.c1, shape: 'dot' }, { label: 'Other simulated projects', color: K.c2, shape: 'dot' }, { label: 'Bubble size = budget', color: K.muted, shape: 'dot' }]),
    ].map((n) => (n.classList && n.classList.contains('c2-chart') ? el('div', { class: 'chart-scroll' }, [n]) : n)), { cls: 'cp-chart' }),
    card('Prioritisation scoring', [
      table([
        { label: '#', key: 'rank', num: true },
        { label: 'Project', key: 'name', format: (v, r) => el('span', { class: r.mine ? 'cp-mine' : '' }, [`${r.short} · ${v}`]) },
        { label: 'Budget', key: 'budget', num: true, format: (v) => fmtPKR(v) },
        { label: 'Score', key: 'score', num: true, format: (v) => v.toFixed(0) },
      ], scored.map((x, i) => ({ ...x, rank: i + 1 })), { dense: true, onRow: (r) => { s.sel = r.id; dash.rerender(); }, selected: (r) => r.id === s.sel }),
      s.sel ? (() => {
        const x = list.find((q) => q.id === s.sel);
        return el('div', { class: 'cp-detail' }, [
          el('b', { text: x.name }),
          el('div', { class: 'cp-scores' }, CRIT.map((c) => el('span', { class: 'cp-sc' }, [c.label.split(' (')[0], el('i', { text: String(x[c.id]) })]))),
          el('small', { text: x.mine ? 'Scores for this programme are the instructor-set baseline; its budget is the live baseline from the plan.' : 'Scores and budget are simulated for teaching.' }),
        ]);
      })() : el('p', { class: 'pm-note', text: 'Click a row or bubble for the criteria scores (1 = low, 5 = high).' }),
    ]),
  ]));
  const mine = scored.findIndex((x) => x.mine) + 1;
  pane.appendChild(el('div', { class: `callout ${mine <= 2 ? 'good' : 'warn'}` }, [icon('flag', 16), el('div', {}, [
    el('b', { text: `The programme ranks #${mine} of ${scored.length} on your weights.` }),
    el('p', { text: mine <= 2 ? 'It is funded first. In the real world the portfolio board re-scores whenever strategy, risk or capacity changes.' : 'Change the weights to see how sensitive the ranking is — a portfolio decision is as much about criteria as about data.' }),
  ])]));
}

/* --------------------------------------------------------------- PMO */

const PMO = {
  supportive: {
    label: 'Supportive PMO', control: 'Low', blurb: 'A consultative hub: templates, good practice, training and lessons. Projects choose whether to use them.',
    pros: 'Happy teams, flexible, low overhead', cons: 'Variable quality; weak early warning',
    effect: { welfare: 0.02, satisfaction: 0.01, quality: -0.01, cost: 4 }, effectText: 'welfare +2 pts, stakeholders +1 pt, quality −1 pt, PKR 4 m overhead',
  },
  controlling: {
    label: 'Controlling PMO', control: 'Moderate', blurb: 'Supports and requires compliance: adopt the frameworks, forms, reporting and governance it prescribes.',
    pros: 'Consistent reporting and quality', cons: 'Some paperwork; teams feel monitored',
    effect: { quality: 0.02, cost: 8, satisfaction: -0.005 }, effectText: 'quality +2 pts, stakeholders −0.5 pt, PKR 8 m overhead',
  },
  directive: {
    label: 'Directive PMO', control: 'High', blurb: 'Takes control by directly managing projects; PMs report to the PMO and it owns delivery.',
    pros: 'Strong safety and quality control', cons: 'High overhead; less team autonomy',
    effect: { quality: 0.03, safety: 0.02, welfare: -0.02, cost: 15 }, effectText: 'quality +3 pts, safety +2 pts, welfare −2 pts, PKR 15 m overhead',
  },
};

function pmo(dash, pane) {
  const p = dash.project;
  const cur = p.pmoType || null;
  pane.appendChild(el('p', { class: 'lede', text: 'A project management office (PMO) standardises governance and shares resources, methods and tools. The type you choose sets how much control it exerts over projects — and changes how this programme performs. The first time you choose a type its effect is applied once (cycling does not stack).' }));
  pane.appendChild(el('div', { class: 'pm-grid c3' }, Object.entries(PMO).map(([id, t]) => card(t.label, [
    el('div', { class: 'row' }, [pill(`Control: ${t.control}`, id === 'directive' ? 'bad' : id === 'controlling' ? 'warn' : 'ok'), cur === id ? pill('Current', 'gold') : null]),
    el('p', { text: t.blurb }),
    el('ul', { class: 'cp-feat' }, [el('li', { text: `Strength: ${t.pros}` }), el('li', { text: `Trade-off: ${t.cons}` })]),
    el('p', { class: 'pm-note', html: `<b>Effect here:</b> ${t.effectText}` }),
    button(cur === id ? 'In place' : 'Adopt this PMO', async () => {
      const ok = await confirmModal(`Adopt a ${t.label}?`, `${t.blurb} Effect on this programme: ${t.effectText}. ${p.pmoApplied && p.pmoApplied[id] ? 'This effect was already applied earlier and will not stack.' : ''}`, { okLabel: 'Adopt' });
      if (!ok) return;
      p.pmoApplied = p.pmoApplied || {};
      if (!p.pmoApplied[id]) { p.pmoApplied[id] = true; if (p.applyEffect) p.applyEffect(t.effect, `PMO type: ${t.label}`); }
      p.pmoType = id;
      dash.sim.toast && dash.sim.toast(`${t.label} adopted`, 'good');
      dash.rerender();
    }, { kind: cur === id ? 'ghost' : 'primary', disabled: cur === id }),
  ], { cls: cur === id ? 'accent' : '' }))));
  pane.appendChild(section('PMO functions', 'what a PMO does for the airport programme'));
  pane.appendChild(table(['Function', 'At HDD'], [
    ['Governance & reporting', 'Monthly status packs, stage-gate readiness reviews (see Life Cycle & Gates)'],
    ['Methodology & templates', 'Charter, WBS dictionary, risk register and change-request forms used by every package'],
    ['Resource & portfolio coordination', 'Shared survey crews, plant and specialist engineers across packages'],
    ['Training & lessons learned', 'Lessons register carried into the next Sindh aviation project'],
  ], { dense: true }));
}

/* -------------------------------------------------------------- role */

const COMP = [
  ['Leadership', 'Vision, motivation, decisions under pressure', 0.7],
  ['Technical PM', 'Planning, estimating, EVM, risk, quality', 0.8],
  ['Strategic & business', 'Benefits, business case, portfolio fit', 0.6],
  ['Communication', 'Negotiation, reporting, stakeholder dialogue', 0.75],
  ['Ethics & integrity', 'Honesty, fairness, safety, compliance', 0.9],
  ['Adaptability', 'Tailoring, agile mindset, resilience', 0.65],
];

function role(dash, pane) {
  const s = dash.state;
  if (!s.me) s.me = COMP.map(() => 3);
  const axes = COMP.map((c, i) => ({ label: c[0], value: s.me[i] / 5, target: c[2] }));
  pane.appendChild(el('p', { class: 'lede', text: 'The project manager is the person assigned by the organisation to lead the team and achieve the objectives — a leader, integrator and communicator, not a scheduler. Rate yourself 1–5; the radar compares you with the profile this airport programme needs (simulated benchmark).' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Competence self-assessment', COMP.map((c, i) => el('div', { class: 'cp-w' }, [
      el('span', {}, [el('b', { text: c[0] }), el('small', { text: ` ${c[1]}` })]),
      slider(1, 5, 1, s.me[i], (v, commit) => { s.me[i] = v; if (commit) dash.rerender(); }, (v) => String(v), { 'aria-label': `${c[0]} self-rating` }),
    ]))),
    card('You vs the programme profile', [
      el('div', { class: 'cp-radar' }, [radarChart({ axes, size: 330, label: 'Competence radar: you versus the programme needs' })]),
      legend([{ label: 'You', color: K.c4 }, { label: 'Programme needs (sim)', color: K.c1, dash: '4 3' }]),
      el('p', { class: 'pm-note', text: (() => {
        const gaps = axes.map((a) => ({ l: a.label, d: a.target - a.value })).sort((a, b) => b.d - a.d);
        return gaps[0].d > 0.05 ? `Largest gap: ${gaps[0].l}. Missions and decision cards in the simulator exercise it — watch for them.` : 'You meet or exceed every part of the profile — now test it under pressure in the missions.';
      })() }),
    ]),
  ]));
  pane.appendChild(section('Where the PM works', 'responsibilities across the life cycle'));
  pane.appendChild(el('div', { class: 'pm-grid c4' }, [
    ['Initiating', 'Frames the business case, helps write and gain approval of the charter, identifies stakeholders.', 'charter'],
    ['Planning', 'Leads scope, schedule, cost, risk and procurement planning to a baseline.', 'scope'],
    ['Executing & controlling', 'Directs the team, measures performance, controls change, reports to the sponsor.', 'control'],
    ['Closing', 'Obtains acceptance, hands over to operations, captures lessons.', 'closing'],
  ].map(([t, d, id]) => card(t, [el('p', { text: d }), button('Open panel', () => dash.open(id), { small: true, kind: 'ghost' })]))));
}

/* ----------------------------------------------------------- EEF / OPA */

const ITEMS = [
  { t: 'Hot desert climate (Köppen BWh)', a: 'eef', why: 'An environment you cannot change; it shapes working hours and materials.', real: () => fact('airport.climate') },
  { t: 'Monsoon rain and dust-storm season', a: 'eef', why: 'External conditions constraining outdoor works (simulated weather model).', sim: true },
  { t: 'Land encroachment around the airport', a: 'eef', why: 'External physical and social condition.', real: () => fact('constraints.encroachment') },
  { t: 'Land ownership disputes', a: 'eef', why: 'Legal and tenure environment beyond project control.', real: () => fact('constraints.landOwnership') },
  { t: 'Civil aviation regulator requirements', a: 'eef', why: 'Government and industry standards the project must satisfy.', real: () => `Regulator: ${fact('org.regulator')}` },
  { t: 'Contractor market conditions and price inflation', a: 'eef', why: 'Marketplace conditions outside the organisation.', sim: true },
  { t: 'Standard charter and WBS templates', a: 'opa', why: 'Internal assets: processes, templates and policies of the performing organisation.', sim: true },
  { t: 'Lessons-learned repository from earlier airport works', a: 'opa', why: 'Organisational knowledge base.', sim: true },
  { t: 'Approved vendor list and bid evaluation procedure', a: 'opa', why: 'Procurement policies and procedures of the organisation.', sim: true },
  { t: 'Earned-value reporting procedure', a: 'opa', why: 'Prescribed monitoring and reporting process.', sim: true },
  { t: 'Organisational culture and risk appetite of the operator', a: 'eef', why: 'Internal EEF: culture and structure shape how work gets done (EEFs can be internal or external).', real: () => `Operator: ${fact('org.operator')}` },
  { t: 'Historical cost data from runway works', a: 'opa', why: 'Organisational process asset: historical information.', sim: true },
];

function eef(dash, pane) {
  const s = dash.state;
  if (!s.eef) s.eef = {};
  const right = ITEMS.filter((it, i) => s.eef[i] === it.a).length;
  const done = Object.keys(s.eef).length;
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Environmental factors vs process assets', [
      el('p', { text: 'Enterprise environmental factors (EEFs) are conditions outside the team’s control that influence the project — climate, regulations, culture, market. Organisational process assets (OPAs) are the organisation’s own plans, processes, policies, templates and knowledge bases that the team can reuse.' }),
      el('p', { class: 'pm-note', html: '<b>Test:</b> if the team can pick it up from the organisation’s library and adapt it, it is an OPA. If it is a condition the project must live with, it is an EEF.' }),
      el('div', { class: 'row' }, [pill(`${right} / ${ITEMS.length} correct`, right === ITEMS.length ? 'ok' : 'gold'), pill(`${done} answered`, 'muted'), button('Reset', () => { s.eef = {}; dash.rerender(); }, { small: true, kind: 'ghost' })]),
    ]),
    card('Hyderabad EEFs at a glance', [
      table(['Factor', 'Detail'], [
        ['Location', fact('airport.city')],
        ['Climate', fact('airport.climate')],
        ['Elevation', fact('airport.elevation')],
        ['Operator', fact('org.operator')],
        ['Regulator', fact('org.regulator')],
        ['Constraint', fact('constraints.encroachment')],
        ['Constraint', fact('constraints.landOwnership')],
      ], { dense: true }),
      el('small', { class: 'muted', text: 'Verified facts from the project fact base; each is also a source of risk in the register.' }),
    ]),
  ]));
  pane.appendChild(section('Classify each item', 'EEF or OPA?'));
  pane.appendChild(el('div', { class: 'cp-items' }, ITEMS.map((it, i) => {
    const ch = s.eef[i];
    const cls = ch ? (ch === it.a ? 'right' : 'wrong') : '';
    return el('div', { class: `cp-item ${cls}` }, [
      el('div', { class: 'cp-item-t' }, [it.t, it.sim ? pill('simulated', 'muted') : pill('verified', 'ok')]),
      el('div', { class: 'row nowrap' }, [
        button('EEF', () => { s.eef[i] = 'eef'; dash.rerender(); }, { small: true, kind: ch === 'eef' ? 'primary' : 'ghost' }),
        button('OPA', () => { s.eef[i] = 'opa'; dash.rerender(); }, { small: true, kind: ch === 'opa' ? 'primary' : 'ghost' }),
      ]),
      ch ? el('div', { class: 'cp-item-why', role: 'status', text: `${ch === it.a ? 'Correct' : `It is an ${it.a.toUpperCase()}`} — ${it.why}${it.real ? ` ${it.real()}.` : ''}` }) : null,
    ]);
  })));
}

/* -------------------------------------------------------- frameworks */

const FW = [
  ['PMI — PMBOK® Guide, 8th Edition', 'Principle- and domain-based guide', 'Six principles, seven performance domains and five focus areas, usable for predictive, agile and hybrid work. This course’s spine.', 'Broad toolbox; you tailor it', 'lifecycle'],
  ['APM Body of Knowledge', 'Knowledge-area body of knowledge (UK)', 'Describes the knowledge a profession needs across context, people, delivery and interfaces; strong on programmes and governance.', 'Public-sector and programme work in the UK tradition', null],
  ['PRINCE2', 'Process-based method', 'Prescribes principles, themes and a defined stage-by-stage process with clear roles; “management by stages” and exception reporting.', 'Controlled, governed, stage-gated delivery', null],
  ['IPMA ICB', 'Competence-based baseline', 'Focuses on the competence of individuals — people, practice and perspective — and underpins certification of people.', 'Assessing and developing project professionals', null],
  ['ISO 21502', 'International guidance standard', 'Vendor-neutral guidance on project management concepts and processes, aligned with other ISO management standards.', 'Organisations needing a common international reference', null],
];

function frameworks(dash, pane) {
  pane.appendChild(el('p', { class: 'lede', text: 'No framework is “the” answer. They differ in what they standardise — knowledge, process, competence or guidance — and good project managers tailor from several. These are general characterisations for teaching; always consult each publisher’s current edition.' }));
  pane.appendChild(table(['Framework', 'Type', 'Core idea', 'Best fit'], FW.map(([n, t, d, b, id]) => [
    id ? el('button', { type: 'button', class: 'cp-link', onclick: () => dash.open(id) }, [n]) : el('b', { text: n }), t, d, b,
  ]), { class: 'cp-fw' }));
  pane.appendChild(card('Tailoring for HDD', [
    el('p', { text: 'This programme uses PMBOK 8 vocabulary (principles, performance domains, focus areas) but borrows ideas freely: stage gates and exception reporting (PRINCE2 style) for the capital works, agile sprints for terminal IT, a competence view (ICB style) for the team radar, and ISO 21502 as a neutral cross-check for the governance model.' }),
    el('div', { class: 'row' }, [button('Life cycle & gates', () => dash.open('lifecycle'), { icon: 'cycle' }), button('Development approach', () => dash.open('approach'), { icon: 'fork', kind: 'ghost' })]),
  ], { cls: 'accent' }));
}

const VIEWS = { basics, portfolio, pmo, role, eef, frameworks };

export const PANEL_FOUNDATIONS = {
  id: 'foundations',
  autoRefresh: false,
  render(dash, body, head) {
    const s = dash.state;
    const p = dash.project;
    if (!s.tab) s.tab = 'basics';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    body.appendChild(el('p', { class: 'lede', text: `${fact('airport.name')} (${fact('airport.iata')}/${fact('airport.icao')}), ${fact('airport.city')}: ${fact('revival.proposal')}. This panel sets up the vocabulary the rest of the course builds on.` }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Programme budget (BAC)', value: fmtPKR(p.bac), foot: 'simulated baseline' }),
      kpi({ label: 'Planned duration', value: `${p.baselineDuration} days`, foot: `${p.tasks.length} work elements` }),
      kpi({ label: 'PMO type', value: p.pmoType ? PMO[p.pmoType].label : 'Not chosen', foot: 'see the PMO tab', cls: p.pmoType ? 'good' : 'warn' }),
      kpi({ label: 'Approach', value: p.approach[0].toUpperCase() + p.approach.slice(1), foot: 'tailored — see Development Approach' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Verified airport facts come from the fact base; budgets, scores and peer projects are simulated.' })]));
  },
};
