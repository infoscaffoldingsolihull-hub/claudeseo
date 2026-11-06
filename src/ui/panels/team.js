import { el, kpi, button, tabs, pill, select, slider, field, toggle, fmtPct, bar } from '../dom.js';
import { C, chartBox, legend, lineChart, barChart, section, card, dl, table, hookCard } from '../charts.js';
import { orgChart, tuckmanChart, TUCKMAN } from '../charts3.js';

/**
 * Team & Resources (Week 12): resource management plan, org chart, RACI,
 * acquiring / developing / managing the team (training, Tuckman stages,
 * conflict resolution, motivation, safety), resource histogram, levelling and
 * utilisation.
 */

const TABS = [
  { id: 'plan', label: 'Plan & organisation', icon: 'people' },
  { id: 'raci', label: 'RACI matrix', icon: 'table' },
  { id: 'develop', label: 'Develop & manage', icon: 'spark' },
  { id: 'resources', label: 'Histogram & levelling', icon: 'stats' },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* Per-project team log (training, conflicts) — plain JS, survives re-renders. */
const TEAM = new WeakMap();
function team(p) {
  if (!TEAM.has(p)) TEAM.set(p, { cooldown: {}, training: 0, log: [], conflictIndex: 0, resolved: {}, balance: 0, pending: [] });
  return TEAM.get(p);
}
function ensureHook(dash) {
  const sim = dash.sim;
  if (sim.__a6c2TeamHook || !sim.bus) return;
  sim.__a6c2TeamHook = true;
  sim.bus.on('project:day', () => {
    const p = sim.project;
    if (!p) return;
    const t = team(p);
    const due = t.pending.filter((x) => p.day >= x.day);
    if (!due.length) return;
    t.pending = t.pending.filter((x) => p.day < x.day);
    for (const d of due) {
      const r = p.applyEffect(d.effect, d.source);
      t.log.unshift({ day: p.day, text: `${d.source}: ${r.applied.join('; ')}` });
    }
  });
}

const RACI_NEXT = { '': 'R', R: 'A', A: 'C', C: 'I', I: '' };
const RACI_NAME = { R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' };

const CONFLICTS = [
  {
    id: 'access', title: 'Apron access window', who: 'Civil crews vs AGL technicians',
    text: 'Both crews need the same apron bay for the next fortnight. The civil foreman wants to finish paving first; the AGL lead says cable ducts must go in before the asphalt.',
    best: 'collaborate', why: 'Both sides hold part of the answer (sequence the duct trenching just ahead of the paving). A problem-solving approach produces a durable plan and builds trust.',
  },
  {
    id: 'design', title: 'Constructability dispute', who: 'Design consultant vs main contractor',
    text: 'The contractor says a terminal connection detail cannot be built as drawn. The consultant insists the design is compliant and will not reissue drawings.',
    best: 'collaborate', why: 'A joint workshop on the detail resolves a technical disagreement with facts. Forcing leaves a compliance risk; compromising on a structural detail would be unsafe.',
  },
  {
    id: 'overtime', title: 'Overtime and rest', who: 'Site labour vs supervisors',
    text: 'Supervisors push 12-hour shifts to recover lost days during heat. Crews report fatigue and two near-misses this week.',
    best: 'compromise', why: 'Safety is non-negotiable, but the schedule matters too. A balanced rota with an extra shift and rest breaks gives something to each side.',
  },
  {
    id: 'scope', title: 'Scope creep from the airlines', who: 'IT team vs airline operators',
    text: 'An airline delegate keeps requesting extra screens in the departures system mid-sprint. The Scrum team is overloaded and the Product Owner is unsure how to answer.',
    best: 'force', why: 'The change process exists for this. A firm “this goes to the backlog and the CCB” is a legitimate directing response; accommodating every request would break the sprint.',
  },
  {
    id: 'blame', title: 'Quality blame game', who: 'QA inspectors vs works supervisors',
    text: 'After a failed compaction test each side blames the other. Meetings are heated and nobody is documenting the root cause.',
    best: 'collaborate', why: 'Root-cause problems need joint fact-finding. Smoothing over or withdrawing leaves the defect source unfixed.',
  },
];

const MODES = {
  collaborate: { label: 'Collaborate / problem-solve', icon: 'people', effect: { welfare: 0.03, quality: 0.01, cost: 2 }, text: 'Win-win: both sides’ concerns are integrated into one solution. Takes time but lasts.' },
  compromise: { label: 'Compromise', icon: 'fork', effect: { welfare: 0.012, cost: 1 }, text: 'Each side gives something up. Quick and workable, but nobody is fully satisfied.' },
  smooth: { label: 'Smooth / accommodate', icon: 'spark', effect: { welfare: 0.01 }, later: { delay: 25, effect: { welfare: -0.025, days: 2 }, text: 'the disagreement resurfaced and cost time' }, text: 'Emphasise common ground. Calms things now, but the underlying issue remains.' },
  force: { label: 'Force / direct', icon: 'flag', effect: { welfare: -0.025, days: -1, stakeholder: { id: 'S14', d: -0.03 } }, text: 'One view wins by authority. Fast and sometimes necessary; damages relationships.' },
  withdraw: { label: 'Withdraw / avoid', icon: 'close', effect: { welfare: -0.015, days: 2 }, later: { delay: 20, effect: { welfare: -0.03, days: 3 }, text: 'the avoided conflict escalated' }, text: 'Postpone or ignore. Sensible only when the issue is trivial or emotions need to cool.' },
};

const ACTIONS = [
  { id: 'training', label: 'Technical & teamwork training', icon: 'book', cooldown: 45, cost: 12, effect: { welfare: 0.02, quality: 0.01 }, text: 'Builds skills and cohesion; improves quality and morale.' },
  { id: 'teambuilding', label: 'Team-building day', icon: 'people', cooldown: 30, cost: 6, effect: { welfare: 0.03 }, text: 'Strengthens trust across contractor and owner teams.' },
  { id: 'recognition', label: 'Recognition & rewards', icon: 'star', cooldown: 21, cost: 3, effect: { welfare: 0.02, stakeholder: { id: 'S14', d: 0.03 } }, text: 'Recognises achievement; lifts site-labour satisfaction.' },
  { id: 'safety', label: 'Safety stand-down & toolbox talks', icon: 'gauge', cooldown: 30, cost: 8, effect: { safety: 0.05, welfare: 0.01, days: 1 }, text: 'Costs a day of production but raises the safety index.' },
];

/* Team development stage derived from the live project state. */
function tuckman(p) {
  const t = team(p);
  const e = p.evm();
  const welfare = p.welfare;
  const maturity = clamp01(0.35 * welfare + 0.15 * p.safety + 0.25 * Math.min(1, p.day / 500) + 0.15 * Math.min(1, t.training / 4) + 0.1 * clamp01(0.5 + t.balance / 6) - (e.spi < 0.85 ? 0.08 : 0) - Math.min(0.1, p.recentIncidents * 0.03));
  let stage;
  let progress;
  if (p.finished || p.phase === 'closing') { stage = 4; progress = 0.5; } else if (p.day < 60) { stage = 0; progress = p.day / 60; } else if (maturity < 0.56) { stage = 1; progress = maturity / 0.56; } else if (maturity < 0.7) { stage = 2; progress = (maturity - 0.56) / 0.14; } else { stage = 3; progress = Math.min(1, (maturity - 0.7) / 0.2); }
  return { stage, progress, maturity };
}

export const PANEL_TEAM = {
  id: 'team',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    ensureHook(dash);
    if (!s.tab) s.tab = 'plan';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const people = p.resources.filter((r) => r.kind === 'people');
    const assigned = people.reduce((a, r) => a + r.assigned, 0);
    const required = people.reduce((a, r) => a + r.required, 0);
    const tk = tuckman(p);
    body.appendChild(el('p', { class: 'lede', text: 'People deliver the programme. Plan the resources and roles, assign accountability, grow the team through its stages, resolve conflict in a way that fits the situation, and keep the workforce safe and staffed to the level the schedule needs.' }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'People on site', value: assigned.toLocaleString('en-US'), foot: `${required.toLocaleString('en-US')} required today` }),
      kpi({ label: 'Peak plan', value: p.peakPeople.toLocaleString('en-US'), foot: 'baseline resource histogram' }),
      kpi({ label: 'Welfare · morale', value: fmtPct(p.welfare, 0), foot: 'workforce index', cls: p.welfare < 0.65 ? 'warn' : 'good' }),
      kpi({ label: 'Safety index', value: fmtPct(p.safety, 0), foot: `${p.incidents} incident${p.incidents === 1 ? '' : 's'} so far`, cls: p.safety < 0.8 ? 'warn' : 'good' }),
      kpi({ label: 'Team stage', value: TUCKMAN[tk.stage].name, foot: `maturity ${Math.round(tk.maturity * 100)} %` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ plan, raci, develop, resources })[s.tab](dash, pane, p, s);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 5', title: 'British Columbia Transportation — people on a large programme',
      text: 'Large public programmes succeed or fail on governance and team behaviour as much as on scheduling. Which of the team stages and conflict modes below would you expect to see?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · crews, rates and events are simulated` })]));
  },
};

/* ------------------------------------------------------------------- plan */

function orgNodes(p) {
  const load = {};
  for (const row of p.raci.rows) for (const [role, v] of Object.entries(row.cells)) if (v === 'R' || v === 'A') load[role] = (load[role] || 0) + 1;
  const peak = Math.max(1, ...Object.values(load));
  const L = (r) => (load[r] ? load[r] / peak : 0);
  const sub = (r) => (load[r] ? `${load[r]} R/A assignments` : 'support role');
  const owners = [...new Set(p.summaries.map((x) => x.owner).filter(Boolean))];
  const works = owners.filter((o) => !['Project Director', 'ORAT Manager', 'Product Owner (Terminal IT)'].includes(o));
  const nodes = [
    { id: 'sponsor', parent: null, label: 'Sponsor (PAA)', sub: sub('Sponsor (PAA)'), kind: 'internal', load: L('Sponsor (PAA)') },
    { id: 'reg', parent: 'sponsor', label: 'Regulator (PCAA)', sub: 'oversight, dotted line', kind: 'external', dotted: true },
    { id: 'pd', parent: 'sponsor', label: 'Project Director', sub: sub('Project Director'), kind: 'internal', load: L('Project Director') },
    { id: 'g-control', parent: 'pd', label: 'Planning & control', kind: 'group' },
    { id: 'pmo', parent: 'g-control', label: 'PMO Lead', sub: sub('PMO Lead'), kind: 'role', load: L('PMO Lead') },
    { id: 'fin', parent: 'g-control', label: 'Finance Controller', sub: sub('Finance Controller'), kind: 'role', load: L('Finance Controller') },
    { id: 'hse', parent: 'g-control', label: 'HSE Manager', sub: sub('HSE Manager'), kind: 'role', load: L('HSE Manager') },
    { id: 'g-works', parent: 'pd', label: 'Works delivery', kind: 'group' },
    ...works.map((o, i) => ({ id: `w${i}`, parent: 'g-works', label: o, kind: 'role', sub: 'package owner' })),
    { id: 'g-sys', parent: 'pd', label: 'Systems & readiness', kind: 'group' },
    { id: 'po', parent: 'g-sys', label: 'Product Owner (IT)', sub: sub('Product Owner (IT)'), kind: 'role', load: L('Product Owner (IT)') },
    { id: 'orat', parent: 'g-sys', label: 'ORAT Manager', sub: sub('ORAT Manager'), kind: 'role', load: L('ORAT Manager') },
    { id: 'g-ext', parent: 'pd', label: 'Contracted partners', kind: 'group' },
    { id: 'dc', parent: 'g-ext', label: 'Design Consultant', sub: sub('Design Consultant'), kind: 'external', load: L('Design Consultant') },
    { id: 'mc', parent: 'g-ext', label: 'Main Contractor', sub: sub('Main Contractor'), kind: 'external', load: L('Main Contractor') },
  ];
  return nodes;
}

function plan(dash, pane, p, s) {
  pane.appendChild(card('Resource management plan', [
    el('p', { text: 'The plan answers four questions: which resources are needed and when; how they are acquired; how the team is developed and managed; and how resources are released.' }),
    dl([
      ['Identify', `${p.resources.length} resource pools (${p.resources.filter((r) => r.kind === 'people').length} people, ${p.resources.filter((r) => r.kind !== 'people').length} equipment) drive the baseline histogram, derived from each work package’s crew.`],
      ['Acquire', 'Design and PMO staff from the owner and consultant; civil, electrical and AGL crews through the main contractor; specialist plant through supply contracts.'],
      ['Develop', 'Induction and technical training, team-building and recognition — see “Develop & manage”.'],
      ['Manage', 'Weekly staffing against demand, safety stand-downs, conflict resolution and levelling; auto-staffing follows the levelled plan.'],
      ['Release', 'Crews are demobilised as packages close; lessons and performance appraisals are recorded.'],
    ]),
  ], { cls: 'flat' }));
  pane.appendChild(section('Organisation chart', 'bar under a role shows its R/A workload from the RACI matrix'));
  if (!s.org) s.org = null;
  const nodes = orgNodes(p);
  pane.appendChild(chartBox(orgChart(nodes, { selected: s.org, onSelect: (id) => { s.org = id; dash.rerender(); } }), { minWidth: 640, caption: 'Hover or click a box. Dotted lines are oversight relationships; red outlines are external parties.' }));
  if (s.org) {
    const n = nodes.find((x) => x.id === s.org);
    if (n) {
      const rows = p.raci.rows.filter((r) => ['R', 'A'].includes(r.cells[n.label]));
      pane.appendChild(card(n.label, [
        rows.length ? el('p', { text: `Responsible or accountable for: ${rows.map((r) => `${r.deliverable} (${r.cells[n.label]})`).join('; ')}.` }) : el('p', { class: 'pm-note', text: 'This box groups roles or owns a work-package family; see the RACI tab for deliverable-level assignments.' }),
      ], { cls: 'flat' }));
    }
  }
}

/* ------------------------------------------------------------------- RACI */

function raci(dash, pane, p, s) {
  const { roles, rows } = p.raci;
  const issues = rows.map((r) => {
    const v = Object.values(r.cells);
    const a = v.filter((x) => x === 'A').length;
    const rr = v.filter((x) => x === 'R').length;
    return { a, r: rr, ok: a === 1 && rr >= 1 };
  });
  const bad = issues.filter((x) => !x.ok).length;
  pane.appendChild(el('p', { class: 'pm-note', text: 'Click a cell to cycle R → A → C → I → blank. A sound RACI has exactly one Accountable (A) and at least one Responsible (R) on every row. Too many A’s or R’s on one role signals overload.' }));
  pane.appendChild(el('div', { class: 'row' }, [
    bad ? pill(`${bad} row${bad === 1 ? '' : 's'} need attention`, 'warn') : pill('Every row has one A and at least one R', 'ok'),
    ...['R', 'A', 'C', 'I'].map((k) => el('span', { class: `raci-key c-${k}` }, [el('b', { text: k }), ` ${RACI_NAME[k]}`])),
  ]));
  const head = el('tr', {}, [el('th', { text: 'Deliverable', scope: 'col' }), ...roles.map((r) => el('th', { class: 'raci-role', scope: 'col', title: r }, [el('span', { text: r })])), el('th', { text: 'Check', scope: 'col' })]);
  const bodyRows = rows.map((row, i) => el('tr', { class: issues[i].ok ? '' : 'raci-bad' }, [
    el('th', { scope: 'row', class: 'raci-deliv', text: row.deliverable }),
    ...roles.map((role) => {
      const v = row.cells[role] || '';
      return el('td', { class: 'raci-cell-td' }, [el('button', {
        type: 'button', class: `raci-cell c-${v || 'x'}`, title: `${row.deliverable} · ${role}: ${v ? RACI_NAME[v] : 'not involved'}`, 'aria-label': `${row.deliverable}, ${role}: ${v || 'blank'}`,
        onclick: () => { row.cells[role] = RACI_NEXT[v]; dash.rerender(); },
      }, [v || '·'])]);
    }),
    el('td', { class: 'raci-check' }, [issues[i].ok ? pill('OK', 'ok') : pill(issues[i].a === 0 ? 'No A' : issues[i].a > 1 ? 'Many A' : 'No R', 'warn')]),
  ]));
  pane.appendChild(el('div', { class: 'table-wrap raci-wrap' }, [el('table', { class: 'data raci' }, [el('thead', {}, [head]), el('tbody', {}, bodyRows)])]));
  const load = roles.map((role) => ({ role, n: rows.filter((r) => r.cells[role] === 'R' || r.cells[role] === 'A').length }));
  pane.appendChild(section('Role workload', 'count of R and A assignments'));
  pane.appendChild(chartBox(barChart({
    width: 860, height: 220, label: 'RACI workload per role', categories: load.map((l) => l.role.replace(/\s*\(.*\)/, '')), series: [{ label: 'R + A assignments', color: C.c2, values: load.map((l) => l.n) }], valueLabels: true, rotate: true,
  }), { minWidth: 600 }));
  pane.appendChild(el('div', { class: 'row' }, [button('Download RACI (CSV)', () => {
    const lines = [['Deliverable', ...roles].join(',')];
    for (const r of rows) lines.push([`"${r.deliverable.replace(/"/g, '""')}"`, ...roles.map((x) => r.cells[x] || '')].join(','));
    dash.sim.download(`HDD_RACI_day${p.day}.csv`, 'text/csv', `${lines.join('\n')}\n`);
  }, { icon: 'export', small: true })]));
}

/* ---------------------------------------------------------------- develop */

function develop(dash, pane, p, s) {
  const t = team(p);
  const tk = tuckman(p);
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Tuckman team development', [
      chartBox(tuckmanChart(tk.stage, tk.progress), { minWidth: 520 }),
      el('p', {}, [pill(TUCKMAN[tk.stage].name, 'gold'), ` ${TUCKMAN[tk.stage].text}`]),
      el('p', { class: 'pm-note', text: 'The marker moves with the live project: welfare and safety, time spent together, training, how conflicts were handled, schedule pressure and incidents.' }),
    ]),
    card('What drives the stage?', [
      ...[['Welfare', p.welfare], ['Safety', p.safety], ['Time together', Math.min(1, p.day / 500)], ['Training', Math.min(1, t.training / 4)], ['Conflict handling', clamp01(0.5 + t.balance / 6)]].map(([l, v]) =>
        el('div', { class: 'drv-row' }, [el('span', { text: l }), bar(v, v > 0.7 ? 'good' : v > 0.45 ? '' : 'bad'), el('b', { text: fmtPct(v, 0) })])),
      el('p', { class: 'pm-note', text: `Team maturity ${Math.round(tk.maturity * 100)} % — below 56 % storming, 56–70 % norming, above 70 % performing.` }),
    ], { cls: 'accent' }),
  ]));

  pane.appendChild(section('Develop and recognise the team', 'each action costs money and has a cooling-off period'));
  pane.appendChild(el('div', { class: 'act-grid' }, ACTIONS.map((a) => {
    const last = t.cooldown[a.id];
    const wait = last === undefined ? 0 : Math.max(0, last + a.cooldown - p.day);
    return el('div', { class: 'act-card' }, [
      el('div', { class: 'act-head' }, [el('b', { text: a.label }), pill(`PKR ${a.cost} m`, 'muted')]),
      el('p', { class: 'pm-note', text: a.text }),
      button(wait ? `Available in ${wait} d` : 'Do it', () => {
        const r = p.applyEffect({ ...a.effect, cost: a.cost }, a.label);
        t.cooldown[a.id] = p.day;
        if (a.id === 'training') t.training += 1;
        t.log.unshift({ day: p.day, text: `${a.label}: ${r.applied.join('; ')}` });
        dash.sim.toast(`${a.label}: ${r.applied.join(', ')}`, 'good');
        dash.rerender();
      }, { small: true, kind: 'primary', disabled: wait > 0, icon: a.icon }),
    ]);
  })));

  pane.appendChild(section('Manage conflict', 'choose a resolution style'));
  const sc = CONFLICTS[t.conflictIndex % CONFLICTS.length];
  const done = t.resolved[sc.id + ':' + t.conflictIndex];
  pane.appendChild(card(`${sc.title} — ${sc.who}`, [
    el('p', { text: sc.text }),
    done
      ? el('div', { class: `callout ${done.mode === sc.best ? 'good' : done.mode === 'compromise' || done.mode === 'smooth' ? 'warn' : 'bad'}` }, [el('div', {}, [
        el('b', { text: `You chose ${MODES[done.mode].label}. ` }), `${done.result} `, el('br'), el('i', { text: `Most effective here: ${MODES[sc.best].label}. ${sc.why}` }),
      ])])
      : el('div', { class: 'mode-grid' }, Object.entries(MODES).map(([id, m]) => el('button', {
        type: 'button', class: 'mode-btn', onclick: () => resolveConflict(dash, p, t, sc, id),
      }, [el('b', { text: m.label }), el('small', { text: m.text })]))),
    done ? el('div', { class: 'row' }, [button('Next situation', () => { t.conflictIndex += 1; dash.rerender(); }, { small: true, kind: 'ghost' })]) : null,
  ], { cls: 'flat', sub: 'Thomas–Kilmann conflict-handling styles: there is no universal best, but each has typical consequences.' }));

  if (t.log.length) {
    pane.appendChild(section('Team log'));
    pane.appendChild(table([{ key: 'day', label: 'Day', num: true }, { key: 'text', label: 'Action and effect' }], t.log.slice(0, 8), { dense: true }));
  }
  pane.appendChild(card('Motivation and recognition', [
    el('p', { text: 'Maslow’s hierarchy (safety and belonging before esteem) and Herzberg’s hygiene factors (pay, conditions, safety) explain why the safety stand-down and team-building actions protect morale, while recognition and training act as motivators.' }),
  ], { cls: 'flat' }));
}

function resolveConflict(dash, p, t, sc, modeId) {
  const m = MODES[modeId];
  const fit = modeId === sc.best ? 1.4 : modeId === 'compromise' || modeId === 'smooth' ? 0.8 : 1;
  const effect = {};
  for (const [k, v] of Object.entries(m.effect)) effect[k] = typeof v === 'number' && k !== 'cost' && k !== 'days' ? v * (v > 0 ? fit : 1) : v;
  const r = p.applyEffect(effect, `Conflict: ${sc.title} (${modeId})`);
  if (m.later) t.pending.push({ day: p.day + m.later.delay, effect: m.later.effect, source: `Unresolved conflict: ${sc.title}` });
  t.balance += modeId === sc.best ? 2 : modeId === 'compromise' ? 1 : modeId === 'smooth' ? 0 : -1.5;
  const result = `Effect: ${r.applied.join('; ')}.${m.later ? ` Watch out: in ${m.later.delay} days ${m.later.text}.` : ''}`;
  t.resolved[sc.id + ':' + t.conflictIndex] = { mode: modeId, result };
  t.log.unshift({ day: p.day, text: `${sc.title} — ${MODES[modeId].label}: ${r.applied.join('; ')}` });
  dash.sim.toast(result, modeId === sc.best ? 'good' : 'warn');
  dash.rerender();
}

/* -------------------------------------------------------------- resources */

function resources(dash, pane, p, s) {
  if (!s.res || !p.resourceById.has(s.res)) s.res = p.resources[0].id;
  const r = p.resourceById.get(s.res);
  const prof = p.resourceProfile.get(r.id);
  const weeks = [];
  for (let d = 0; d < prof.length; d += 7) {
    let m = 0;
    for (let k = d; k < Math.min(prof.length, d + 7); k++) m = Math.max(m, prof[k]);
    weeks.push([d, m]);
  }
  const hist = p.resourceHistory.map((h) => [h.day, h.values[r.id] ? h.values[r.id][0] : 0]);
  const req = p.resourceHistory.map((h) => [h.day, h.values[r.id] ? h.values[r.id][1] : 0]);
  const levelled = p.levelReport && p.levelReport.resources.find((x) => x.id === r.id);
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('label', { class: 'inline' }, ['Resource', select(p.resources.map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` })), s.res, (v) => { s.res = v; dash.rerender(); })]),
    el('span', { class: 'grow' }),
    toggle('Auto-staffing', p.autoStaffing, (on) => { p.setAutoStaffing(on); dash.rerender(); }, 'follow the levelled plan'),
  ]));
  const series = [
    { label: 'Baseline demand (weekly peak)', points: weeks, color: C.c2, step: true, area: true, areaOpacity: 0.16, width: 1.8 },
  ];
  if (hist.length > 1) { series.push({ label: 'Assigned', points: hist, color: C.good, width: 2.6 }); series.push({ label: 'Required', points: req, color: C.warn, width: 1.8, dash: '5 4' }); }
  pane.appendChild(chartBox(lineChart({
    width: 900, height: 300, label: `Resource histogram: ${r.name}`, series, xDomain: [0, Math.max(prof.length, 10)], yFormat: (v) => `${Math.round(v).toLocaleString('en-US')}`, yLabel: r.unit, xLabel: 'Project day',
    hlines: [{ y: r.capacity, label: `Capacity ${r.capacity}`, color: C.bad }], vlines: [{ x: p.day, label: 'Today', color: C.brass }],
  }), { legend: legend([{ label: 'Baseline demand', color: C.c2, shape: 'box' }, { label: 'Assigned', color: C.good, shape: 'line' }, { label: 'Required', color: C.warn, shape: 'line', dash: '5 4' }, { label: 'Capacity', color: C.bad, shape: 'line', dash: '6 5' }]), caption: `Peak demand ${r.peakDemand.toLocaleString('en-US')} ${r.unit}; mean ${r.meanDemand.toLocaleString('en-US')}. A tall, spiky histogram means expensive mobilisation — resource smoothing flattens it without moving the finish date.` }));

  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card(`Staffing: ${r.name}`, [
      el('p', { class: 'pm-note', text: `Assigned ${r.assigned.toLocaleString('en-US')} · required ${r.required.toLocaleString('en-US')} · capacity ${r.capacity.toLocaleString('en-US')} ${r.unit}. Under-staffing slows production; over-staffing wastes money.` }),
      field('Assigned', slider(0, r.capacity, Math.max(1, Math.round(r.capacity / 100)), r.assigned, (v, committed) => { if (committed) { p.setStaffing(r.id, v); dash.rerender(); } }, (v) => `${Math.round(v).toLocaleString('en-US')} ${r.unit}`)),
      el('div', { class: 'row' }, [button('Match required level', () => { p.setStaffing(r.id, Math.min(r.capacity, r.required)); dash.rerender(); }, { small: true, kind: 'ghost' })]),
    ]),
    card('Resource levelling', [
      el('p', { text: 'Smoothing shifts non-critical, unstarted activities within their free float to cut peaks. The finish date is protected; critical work is not moved.' }),
      el('div', { class: 'row' }, [button('Smooth resources', () => {
        p.levelReport = p.levelResources();
        dash.sim.toast(`${p.levelReport.shifted.length} activities shifted within float`, p.levelReport.shifted.length ? 'good' : '');
        dash.rerender();
      }, { kind: 'primary', icon: 'shuffle' }), levelled ? pill(`${levelled.peakBefore} → ${levelled.peakAfter} peak`, levelled.peakAfter < levelled.peakBefore ? 'ok' : 'muted') : null]),
      p.levelReport ? el('p', { class: 'pm-note', text: `${p.levelReport.method}. ${p.levelReport.shifted.length} shifted: ${p.levelReport.shifted.slice(0, 5).map((x) => `${x.id} +${x.days}d`).join(', ') || 'none — the plan is already smooth'}.` }) : el('p', { class: 'pm-note', text: 'No levelling run yet in this session.' }),
    ]),
  ]));
  if (p.levelReport) {
    pane.appendChild(table([
      { key: 'name', label: 'Resource' }, { key: 'capacity', label: 'Capacity', num: true }, { key: 'peakBefore', label: 'Peak before', num: true },
      { key: 'peakAfter', label: 'Peak after', num: true, cls: (v, row) => (v < row.peakBefore ? 'pm-pos' : '') },
    ], p.levelReport.resources, { dense: true, caption: 'Latest levelling run (forecast schedule)' }));
  }

  pane.appendChild(section('Utilisation', 'assigned ÷ capacity for every pool'));
  pane.appendChild(table([
    { key: 'name', label: 'Resource' }, { key: 'kind', label: 'Kind' },
    { key: 'assigned', label: 'Assigned', num: true, format: (v) => v.toLocaleString('en-US') },
    { key: 'required', label: 'Required', num: true, format: (v) => v.toLocaleString('en-US') },
    { key: 'capacity', label: 'Capacity', num: true, format: (v) => v.toLocaleString('en-US') },
    { key: 'util', label: 'Utilisation', format: (v) => el('div', { class: 'perf-cell' }, [bar(v, v > 0.9 ? 'bad' : v > 0.6 ? 'good' : ''), el('span', { text: fmtPct(v, 0) })]) },
    { key: 'flag', label: 'Flag', format: (v) => (v === 'short' ? pill('Under-staffed', 'warn') : v === 'idle' ? pill('Idle', 'muted') : pill('OK', 'ok')) },
  ], p.resources.map((x) => ({ id: x.id, name: x.name, kind: x.kind, assigned: x.assigned, required: x.required, capacity: x.capacity, util: x.capacity ? x.assigned / x.capacity : 0, flag: x.required > x.assigned ? 'short' : x.assigned > 0 && x.required === 0 ? 'idle' : 'ok' })), {
    dense: true, onRow: (row) => { s.res = row.id; dash.rerender(); }, selected: (row) => row.id === s.res,
  }));
}
