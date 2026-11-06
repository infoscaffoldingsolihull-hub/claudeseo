import {el, kpi, button, tabs, pill, bar, fmtPKR, fmtPct, confirmModal} from '../dom.js';
import { shortDate, section, card, dl, table } from '../charts.js';
import { fact } from '../../core/facts.js';

/**
 * Scope & WBS (Week 4): requirements collection (stakeholder interview
 * cards), the requirements traceability matrix, scope statement, an
 * interactive WBS with %-complete roll-up and WBS dictionary (with "Show in
 * 3D"), scope validation (formal acceptance of finished deliverables) and
 * scope control (scope-creep change requests).
 */

const TABS = [
  { id: 'wbs', label: 'WBS & dictionary', icon: 'tree' },
  { id: 'req', label: 'Requirements & RTM', icon: 'table' },
  { id: 'statement', label: 'Scope statement', icon: 'scroll' },
  { id: 'validate', label: 'Validate & control', icon: 'check' },
];

/* Formal acceptance records (scope validation), kept per project instance. */
const ACCEPTED = new WeakMap();
function accepted(p) {
  if (!ACCEPTED.has(p)) ACCEPTED.set(p, new Map());
  return ACCEPTED.get(p);
}

const QUOTES = {
  S01: 'We need a programme the board can defend: opened on time, inside the envelope, and certifiable first time.',
  S02: 'Nothing opens until every Annex 14 requirement is evidenced — friction, lighting, strip, rescue and firefighting.',
  S03: 'Jobs for local people and a resettlement that is seen to be fair.',
  S05: 'Your access road and utilities must fit the city master plan.',
  S06: 'Daily flights and a cargo shed — our members have waited long enough.',
  S07: 'Keep the dust and night noise down, and hire from the neighbourhood.',
  S08: 'Compensation before demolition, and somewhere to go.',
  S09: 'Give us the runway length for full payload in June, stands for wide-bodies and common-use check-in.',
  S10: 'A cold chain so mangoes leave the same day they are picked.',
  S14: 'Shade, water and rest breaks in May and June — and wages on time.',
  S16: 'Reliable flights, short queues, prayer rooms and step-free access.',
};

function rollup(p, ids) {
  const kids = ids.map((id) => p.taskById.get(id)).filter((t) => t && !t.milestone);
  const b = kids.reduce((a, t) => a + t.budget, 0) || 1;
  return kids.reduce((a, t) => a + t.budget * p.state.get(t.id).pct, 0) / b;
}

function initials(role) {
  return role.replace(/\(.*\)/, '').split(/[\s—-]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
}

export const PANEL_SCOPE = {
  id: 'scope',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'wbs';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const leaves = p.tasks.filter((t) => !t.milestone);
    const verified = p.requirements.filter((r) => r.status === 'Verified').length;
    const scopeCRs = p.changes.filter((c) => c.status === 'Implemented');
    body.appendChild(el('p', { class: 'lede', text: 'Scope is defined from requirements, decomposed into the WBS (the 100 % rule: every deliverable appears once, nothing outside it is in scope), described in the WBS dictionary, then validated with the customer and protected by change control.' }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Work packages', value: String(leaves.length), foot: `${p.summaries.length} control accounts · ${p.milestones.length} milestones` }),
      kpi({ label: 'Physical % complete', value: fmtPct(p.bac ? p.ev / p.bac : 0, 1), foot: 'budget-weighted roll-up (EV ÷ BAC)' }),
      kpi({ label: 'Requirements verified', value: `${verified} / ${p.requirements.length}`, foot: `${p.requirements.filter((r) => r.status === 'In progress').length} in progress`, cls: verified === p.requirements.length ? 'good' : '' }),
      kpi({ label: 'Deliverables accepted', value: `${accepted(p).size} / ${leaves.filter((t) => p.state.get(t.id).pct >= 1).length}`, foot: 'formal acceptance of finished work' }),
      kpi({ label: 'Scope baseline', value: `v${p.baselineVersion}`, foot: `${scopeCRs.length} approved scope changes · ${fmtPKR(scopeCRs.reduce((a, c) => a + c.impact.cost, 0))}` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ wbs, req, statement, validate })[s.tab](dash, pane, p);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · scope baseline v${p.baselineVersion}` })]));
  },
};

/* ------------------------------------------------------------------- WBS */

function wbs(dash, pane, p) {
  const s = dash.state;
  if (!s.wsel || !p.taskById.has(s.wsel)) s.wsel = '3.5';
  const crit = new Set(p.forecast ? p.forecast.criticalPath : []);
  const pkgs = p.wbs.map((node) => {
    const ids = node.children.map((c) => c.id);
    const pc = rollup(p, ids);
    const sm = p.summaries.find((x) => x.id === node.id);
    return el('div', { class: 'wbs-pkg' }, [
      el('header', {}, [el('i', { style: { background: node.color } }), el('b', { text: `${node.code} ${node.name}` }), el('span', { text: fmtPct(pc) })]),
      bar(pc, pc >= 1 ? 'ok' : '', `${node.name} ${Math.round(pc * 100)}%`),
      el('div', { class: 'pm-note', style: { margin: '0.1rem 0.6rem 0.3rem', fontSize: '0.74rem' }, text: `${fmtPKR(sm.budget)} · ${sm.owner}` }),
      ...node.children.map((c) => {
        const st = p.state.get(c.id);
        return el('button', {
          type: 'button', class: `wbs-leaf ${s.wsel === c.id ? 'active' : ''} ${crit.has(c.id) ? 'crit' : ''}`.replace(/\s+/g, ' ').trim(),
          title: `${c.code} ${c.name} — ${Math.round(st.pct * 100)}%${crit.has(c.id) ? ' (critical)' : ''}`,
          onclick: () => { s.wsel = c.id; dash.rerender(); },
        }, [el('code', { text: c.code }), el('span', { class: 'nm', text: c.name }), el('span', { class: 'pc', text: `${Math.round(st.pct * 100)}%` }), el('span', {}), el('span', { class: 'wbs-mini' }, [el('i', { style: { width: `${st.pct * 100}%` } })])]);
      }),
    ]);
  });
  const tree = el('div', {}, [
    el('div', { class: 'wbs-root' }, [el('div', {}, [`0  ${p.info.name}`, el('small', { text: `${fmtPct(p.bac ? p.ev / p.bac : 0, 1)} complete · BAC ${fmtPKR(p.bac)}` })])]),
    el('div', { class: 'wbs-tree' }, pkgs),
    el('p', { class: 'pm-note', text: '● = on the forecast critical path. Percentages roll up by budget weight (a PKR 5 bn package at 50 % counts more than a PKR 0.1 bn package at 100 %). Milestones are zero-duration events, not WBS elements.' }),
  ]);
  pane.appendChild(el('div', { class: 'pm-grid c21', style: { alignItems: 'start' } }, [tree, dictionary(dash, p, p.taskById.get(s.wsel))]));
}

function dictionary(dash, p, t) {
  const d = t.dictionary || {};
  const st = p.state.get(t.id);
  const bn = p.baseline.nodes.get(t.id);
  const reqs = p.requirements.filter((r) => r.wbs.includes(t.id));
  return el('div', { style: { position: 'sticky', top: '0' } }, [card(`WBS dictionary — ${t.code}`, [
    el('h4', { style: { margin: '0 0 0.3rem', color: 'var(--ink-strong)' }, text: t.name }),
    el('p', { text: d.description || '' }),
    dl([
      ['Status', `${Math.round(st.pct * 100)}% complete${st.actualStart !== null ? ` · started ${shortDate(p.startDate, st.actualStart)}` : ''}${st.actualFinish !== null ? ` · finished ${shortDate(p.startDate, st.actualFinish)}` : ''}`],
      ['Owner', d.owner || '—'],
      ['Control account', `${t.summaryId} ${p.summaries.find((x) => x.id === t.summaryId).name}`],
      ['Budget', `${fmtPKR(t.budget)} (labour ${fmtPKR(t.labourBudget)})`],
      ['Duration', `${t.duration} d · baseline ${shortDate(p.startDate, bn.es)} → ${shortDate(p.startDate, bn.ef)}`],
      ['Predecessors', t.predecessors.length ? t.predecessors.map((l) => `${l.id} ${l.type}${l.lag ? (l.lag > 0 ? `+${l.lag}` : l.lag) : ''}`).join(', ') : '—'],
      ['Crew', Object.entries(t.crew).map(([k, n]) => `${n} ${(p.resourceById.get(k) || { name: k }).name.toLowerCase()}`).join(', ') || '—'],
      ['Delivery', `${t.delivery}${t.delivery === 'agile' ? ' (Scrum backlog)' : ''}`],
    ]),
    el('b', { text: 'Deliverables' }),
    el('ul', {}, (d.deliverables || []).map((x) => el('li', { text: x }))),
    dl([
      ['Acceptance criteria', d.acceptance || '—'],
      ['Assumptions', d.assumptions || '—'],
      ['Risks', d.risks && d.risks.length ? d.risks.map((id) => `${id} ${p.riskById.get(id).title}`).join('; ') : 'none specific'],
      ['Requirements', reqs.length ? reqs.map((r) => r.id).join(', ') : 'enabling work (no direct requirement)'],
    ]),
    el('div', { class: 'row actions-row' }, [
      button('Show in 3D', () => { dash.sim.select(t.id); dash.sim.toast(`${t.code} ${t.name} highlighted in the 3D site`, 'good'); }, { kind: 'primary', icon: 'eye', small: true }),
      button('Open in schedule', () => { dash.stateFor('schedule').sel = t.id; dash.stateFor('schedule').tab = 'gantt'; dash.open('schedule'); }, { icon: 'gantt', small: true, kind: 'ghost' }),
    ]),
  ], { cls: 'accent' })]);
}

/* -------------------------------------------------------- requirements */

function req(dash, pane, p) {
  const s = dash.state;
  const bySrc = new Map();
  for (const r of p.requirements) { if (!bySrc.has(r.source)) bySrc.set(r.source, []); bySrc.get(r.source).push(r); }
  pane.appendChild(section('Requirements collection — stakeholder interviews', `${bySrc.size} stakeholders interviewed (simulated)`));
  pane.appendChild(el('div', { class: 'interview-grid' }, [...bySrc.entries()].map(([sid, list]) => {
    const st = p.stakeholderById.get(sid);
    return el('article', { class: 'interview' }, [
      el('header', {}, [el('span', { class: 'av', text: initials(st.role) }), el('b', { text: st.role })]),
      el('q', { text: QUOTES[sid] || st.needs }),
      el('ul', {}, list.map((r) => el('li', {}, [el('b', { class: 'pm-mono', text: `${r.id} ` }), r.text]))),
    ]);
  })));
  pane.appendChild(el('p', { class: 'pm-note', text: 'Other techniques used: workshops with airlines and the regulator, benchmarking of comparable regional terminals, document analysis of Annex 14, prototypes for the check-in software (the agile stream).' }));
  pane.appendChild(section('Requirements traceability matrix', 'requirement → source → WBS deliverable → test'));
  const rows = p.rtm();
  pane.appendChild(table([
    { key: 'id', label: 'ID', format: (v) => el('b', { class: 'pm-mono', text: v }) },
    { key: 'text', label: 'Requirement' },
    { key: 'stakeholder', label: 'Source' },
    { key: 'priority', label: 'MoSCoW', format: (v) => pill(v, v === 'Must' ? 'bad' : v === 'Should' ? 'warn' : 'info') },
    { key: 'deliverables', label: 'WBS deliverables', format: (v) => el('div', { class: 'pm-chips' }, v.map((d) => el('span', { class: `tag ${d.pct >= 1 ? 'ok' : d.pct > 0 ? 'info' : 'muted'}`, title: `${d.id} ${d.name}: ${Math.round(d.pct * 100)}%`, text: `${d.id} ${Math.round(d.pct * 100)}%` }))) },
    { key: 'test', label: 'Verification / test' },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Verified' ? 'ok' : v === 'In progress' ? 'info' : 'muted') },
  ], rows, { dense: true, sortable: true, selected: (r) => r.id === s.rq, onRow: (r) => { s.rq = r.id; dash.sim.select(r.wbs[0]); dash.sim.toast(`${r.id} → ${r.wbs.join(', ')} highlighted in 3D`, 'good'); dash.rerender(); } }));
}

/* -------------------------------------------------------- scope statement */

function statement(dash, pane, p) {
  const must = p.requirements.filter((r) => r.priority === 'Must');
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Product scope description', [
      el('p', { text: `A certified, operational domestic and regional airport at ${fact('airport.city')}: runway ${fact('runway.designators')} rehabilitated and extended for Code E aircraft, new taxiways and apron, airfield lighting and a CAT I instrument approach, a new passenger terminal with baggage and common-use IT, support facilities (fire station, fuel, power, water) and landside access.` }),
      el('p', { class: 'pm-note', text: `Existing runway (verified): ${fact('runway.length')} × ${fact('runway.width')}. Extension length, terminal size and every other figure are scenario assumptions.` }),
      el('b', { text: 'Major deliverables' }),
      el('ul', {}, p.summaries.map((sm) => el('li', {}, [`${sm.code} ${sm.name} — `, el('span', { class: 'muted', text: fmtPKR(sm.budget) })]))),
    ]),
    card('Acceptance criteria (from “Must” requirements)', [el('ul', { class: 'check-list' }, must.map((r) => el('li', { class: r.status === 'Verified' ? 'ok' : r.status === 'In progress' ? 'part' : '' }, [`${r.id}: ${r.test}`])))]),
  ]));
  pane.appendChild(el('div', { class: 'pm-grid c3', style: { marginTop: '0.8rem' } }, [
    card('Exclusions', [el('ul', {}, ['Off-airport road widening and city utilities', 'Airline operations, route marketing, fares', 'Compensation policy for resettlement (provincial)', 'Retail and car-park concessions', 'A second runway or cargo terminal (future phase)'].map((x) => el('li', { text: x })))]),
    card('Constraints', [el('ul', {}, [
      el('li', { text: `${fact('constraints.encroachment')} — per press reports.` }), el('li', { text: `${fact('constraints.landOwnership')} — per press reports.` }),
      el('li', { text: `Regulator: ${fact('org.regulator')} certification before opening.` }), el('li', { text: 'Funding released in annual tranches (simulated).' }), el('li', { text: 'Works phased to keep the existing runway available for diversions (simulated).' }),
    ])]),
    card('Assumptions', [el('ul', {}, p.tasks.filter((t) => t.dictionary && t.dictionary.assumptions).slice(0, 6).map((t) => el('li', {}, [el('b', { class: 'pm-mono', text: `${t.code} ` }), t.dictionary.assumptions])))]),
  ]));
}

/* ------------------------------------------------- validation & control */

function validate(dash, pane, p) {
  const acc = accepted(p);
  const done = p.tasks.filter((t) => !t.milestone && p.state.get(t.id).pct >= 1);
  const pending = done.filter((t) => !acc.has(t.id));
  const acceptOne = async (t) => {
    const ok = await confirmModal(`Accept ${t.code}?`, `Acceptance criteria: ${t.dictionary.acceptance}\n\nFormal acceptance by the customer’s representative closes the deliverable; defects found later become warranty claims.`, { okLabel: 'Accept deliverable' });
    if (!ok) return;
    acc.set(t.id, p.day);
    p.log('good', `${t.code} accepted`, `${t.name} formally accepted against its acceptance criteria (scope validation).`);
    dash.sim.toast(`${t.code} ${t.name} accepted`, 'good');
    dash.rerender();
  };
  pane.appendChild(section('Validate scope — formal acceptance', `${pending.length} finished deliverables awaiting acceptance`));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    button(`Accept all ${pending.length} that meet their criteria`, async () => {
      if (!pending.length) return;
      const ok = await confirmModal('Accept all finished deliverables?', `${pending.length} deliverables have completed their inspection and test plans.`, { okLabel: 'Accept all' });
      if (!ok) return;
      for (const t of pending) acc.set(t.id, p.day);
      p.log('good', `${pending.length} deliverables accepted`, 'Batch acceptance after inspection and test records were reviewed.');
      dash.sim.toast(`${pending.length} deliverables accepted`, 'good');
      dash.rerender();
    }, { kind: 'primary', icon: 'check', disabled: !pending.length }),
    el('span', { class: 'pm-note', text: 'Validate scope (customer accepts deliverables) follows control quality (the team checks they are correct).' }),
  ]));
  pane.appendChild(table([
    { key: 'code', label: 'WBS' }, { key: 'name', label: 'Deliverable' },
    { key: 'fin', label: 'Finished', format: (v) => shortDate(p.startDate, v) },
    { key: 'acc', label: 'Acceptance criteria' },
    { key: 'rework', label: 'Rework', num: true, format: (v) => `${v.toFixed(1)} d` },
    { key: 'id', label: 'Status', format: (v, r) => (r.accDay !== undefined ? pill(`Accepted ${shortDate(p.startDate, r.accDay)}`, 'ok') : button('Accept', () => acceptOne(p.taskById.get(v)), { small: true })) },
  ], done.map((t) => ({ id: t.id, code: t.code, name: t.name, fin: p.state.get(t.id).actualFinish, acc: t.dictionary.acceptance, rework: p.state.get(t.id).rework, accDay: acc.get(t.id) })).sort((a, b) => b.fin - a.fin), { dense: true, empty: 'No deliverable is finished yet — advance the simulation.' }));
  // control
  const crs = p.changes.slice().reverse();
  const approvedCost = p.changes.filter((c) => c.status === 'Implemented' || c.status === 'Approved').reduce((a, c) => a + c.impact.cost, 0);
  pane.appendChild(section('Control scope — scope creep', 'every addition goes through integrated change control'));
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Change requests', value: String(p.changes.length), foot: `${p.changes.filter((c) => c.status === 'Rejected').length} rejected` }),
    kpi({ label: 'Approved scope growth', value: fmtPKR(approvedCost), foot: `${fmtPct(approvedCost / p.bac, 1)} of BAC`, cls: approvedCost / p.bac > 0.05 ? 'warn' : '' }),
    kpi({ label: 'Days added', value: `${p.changes.filter((c) => c.status === 'Implemented').reduce((a, c) => a + c.impact.days, 0)} d`, foot: 'to work packages (float may absorb some)' }),
    kpi({ label: 'Baseline versions', value: String(p.baselineVersion), foot: 'each implemented CR re-baselines' }),
  ]));
  pane.appendChild(table([
    { key: 'id', label: 'CR', format: (v) => el('b', { class: 'pm-mono', text: v }) }, { key: 'title', label: 'Requested addition' },
    { key: 'raisedBy', label: 'Raised by', format: (v) => (p.stakeholderById.get(v) ? p.stakeholderById.get(v).role : v) },
    { key: 'wbs', label: 'WBS', format: (v) => v || '—' },
    { key: 'impact', label: 'Impact', format: (v) => `${v.days} d · ${fmtPKR(v.cost)}` },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Implemented' || v === 'Approved' ? 'ok' : v === 'Rejected' ? 'bad' : 'warn') },
  ], crs, { dense: true, empty: 'No change requests yet. Stakeholders will ask for additions as the work becomes visible — that is when scope creep starts.', onRow: () => dash.open('control') }));
  pane.appendChild(el('div', { class: 'row actions-row' }, [
    button('Raise a scope change request', () => dash.focusChangeForm(), { kind: 'primary', icon: 'shuffle' }),
    el('span', { class: 'pm-note', text: 'Gold-plating (adding unrequested features) is scope creep by the team — just as harmful.' }),
  ]));
}
