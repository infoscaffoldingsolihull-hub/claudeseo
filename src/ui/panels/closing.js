import { el, kpi, button, tabs, pill, field, select, fmtPKR, fmtPct, bar, confirmModal } from '../dom.js';
import { C, chartBox, section, card, dl, table, hookCard } from '../charts.js';
import { scoreRing, printNode, store, csvCell } from '../charts3.js';
import { fact } from '../../core/facts.js';

/**
 * Closing & Lessons (Weeks 6 / 15): final acceptance, handover checklist,
 * contract closure, lessons-learned register, archive, benefits realisation,
 * close-out report (printable), scorecard and certificate.
 */

const TABS = [
  { id: 'accept', label: 'Acceptance & handover', icon: 'flagCheck' },
  { id: 'contracts', label: 'Contracts & archive', icon: 'truck' },
  { id: 'lessons', label: 'Lessons learned', icon: 'book' },
  { id: 'report', label: 'Close-out report', icon: 'scroll' },
  { id: 'score', label: 'Scorecard & certificate', icon: 'star' },
];

const KEY = 'hdd-closing-checks-v1';
const CATEGORIES = ['General', 'Scope', 'Schedule', 'Cost', 'Quality', 'Risk', 'Safety', 'Procurement', 'Stakeholders', 'Governance', 'Team'];

function checks() { return store.get(KEY, {}) || {}; }
function setCheck(p, id, on) { const c = checks(); const k = `${p.seed}:${id}`; if (on) c[k] = true; else delete c[k]; store.set(KEY, c); }
function isChecked(p, id) { return !!checks()[`${p.seed}:${id}`]; }

export const PANEL_CLOSING = {
  id: 'closing',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'accept';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const snap = p.snapshot();
    const gatesDone = p.gates.filter((g) => g.status === 'approved').length;
    const closed = p.procurement.filter((x) => x.status === 'Closed').length;
    body.appendChild(el('p', { class: 'lede', text: p.finished
      ? 'The programme has finished. Close it properly: confirm acceptance, hand the airport to the operator, close the contracts, capture what was learned, archive the records and issue the close-out report.'
      : 'Closing is planned from day one. Use this panel to see how ready the programme is to close, rehearse the handover checklist, and capture lessons as they happen — the full close-out report completes when the programme finishes.' }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Programme status', value: p.finished ? 'Complete' : 'In progress', foot: `${fmtPct(snap.progress, 0)} complete · day ${p.day}`, cls: p.finished ? 'good' : '' }),
      kpi({ label: 'Gates approved', value: `${gatesDone} / ${p.gates.length}` }),
      kpi({ label: 'Contracts closed', value: `${closed} / ${p.procurement.length}` }),
      kpi({ label: 'Lessons captured', value: String(p.lessons.length), foot: 'register entries' }),
      kpi({ label: 'Benefits realised', value: p.benefits && p.benefits.realisation !== undefined ? fmtPct(p.benefits.realisation, 0) : 'Not yet', foot: 'from Operations mode' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ accept, contracts, lessons, report, score })[s.tab](dash, pane, p, s);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 15', title: 'AstraZeneca and the pandemic — lessons that outlive the project',
      text: 'The case ends with what the organisation carried forward. Which of your lessons are about the project, and which about how the organisation works?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · ${fact('airport.name')} (${fact('airport.iata')}) scenario is simulated` })]));
  },
};

/* --------------------------------------------------------------- accept */

function accept(dash, pane, p, s) {
  const snap = p.snapshot();
  const reqVerified = p.requirements.filter((r) => r.status === 'Verified').length;
  const g = (id) => p.gateById.get(id);
  const auto = [
    { id: 'a1', text: 'All work packages complete (100 %)', ok: p.finished, detail: `${fmtPct(snap.progress, 1)} complete` },
    { id: 'a2', text: 'Operational readiness and certification gate (G3) approved', ok: g('G3') && g('G3').status === 'approved', detail: g('G3') ? g('G3').status : 'unknown' },
    { id: 'a3', text: 'Handover and closure gate (G4) approved', ok: g('G4') && g('G4').status === 'approved', detail: g('G4') ? g('G4').status : 'unknown' },
    { id: 'a4', text: 'Requirements verified against acceptance tests', ok: reqVerified === p.requirements.length, detail: `${reqVerified} / ${p.requirements.length} verified` },
    { id: 'a5', text: 'No open non-conformance reports', ok: snap.openNcrs === 0, detail: `${snap.openNcrs} open` },
    { id: 'a6', text: 'No open issues and no pending change requests', ok: snap.openIssues === 0 && snap.openChanges === 0, detail: `${snap.openIssues} issues · ${snap.openChanges} changes` },
    { id: 'a7', text: 'All contracts closed with a final account', ok: p.procurement.every((x) => x.status === 'Closed'), detail: `${p.procurement.filter((x) => x.status === 'Closed').length} / ${p.procurement.length}` },
  ];
  const manual = [
    ['m1', 'Final acceptance certificate signed by the sponsor'],
    ['m2', 'Operating manuals, as-built drawings and warranties handed to the operator'],
    ['m3', 'Operator staff trained and shadowing completed (ORAT)'],
    ['m4', 'Regulator’s aerodrome certificate received'],
    ['m5', 'Spares, tools and keys transferred; site demobilised and restored'],
    ['m6', 'Team released with performance feedback; recognition event held'],
  ];
  const okCount = auto.filter((a) => a.ok).length;
  const manCount = manual.filter(([id]) => isChecked(p, id)).length;
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Acceptance — checked from live data', [
      bar(okCount / auto.length, okCount === auto.length ? 'good' : ''),
      el('ul', { class: 'check-list live' }, auto.map((a) => el('li', { class: a.ok ? 'ok' : 'todo' }, [el('span', { class: 'ck', 'aria-hidden': 'true', text: a.ok ? '✓' : '○' }), el('span', { text: a.text }), el('small', { text: a.detail })]))),
      el('p', { class: 'pm-note', text: `${okCount} of ${auto.length} conditions met.` }),
    ]),
    card('Transition and handover — your sign-off', [
      bar(manCount / manual.length, manCount === manual.length ? 'good' : ''),
      el('ul', { class: 'check-list' }, manual.map(([id, text]) => el('li', {}, [el('label', { class: 'ck-row' }, [(() => {
        const cb = el('input', { type: 'checkbox', checked: isChecked(p, id), 'aria-label': text });
        cb.addEventListener('change', () => { setCheck(p, id, cb.checked); dash.rerender(); });
        return cb;
      })(), el('span', { text })])]))),
      el('p', { class: 'pm-note', text: `${manCount} of ${manual.length} signed off (saved in this browser).` }),
    ]),
  ]));
  pane.appendChild(section('Gate record'));
  pane.appendChild(table([{ key: 'id', label: 'Gate' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Status', format: (v) => pill(v, v === 'approved' ? 'ok' : v === 'ready' ? 'gold' : 'muted') }, { key: 'day', label: 'Date', format: (v) => (v === null || v === undefined ? '—' : p.dateLabel(v)) }, { key: 'approvedBy', label: 'Approved by', format: (v) => v || '—' }], p.gates, { dense: true }));
  const handover = p.benefits;
  pane.appendChild(card('Benefits realisation — link to Operations mode', [
    el('p', { text: 'Closing the project does not close the case for it. Benefits are only realised once the airport operates. Run Operations mode after handover to measure movements, passengers and punctuality against the business case.' }),
    handover && handover.realisation !== undefined
      ? dl([['Realisation', fmtPct(handover.realisation, 0)], ['Movements / day', `${Math.round(handover.movementsPerDay)} (target ${handover.businessCaseTarget.movementsPerDay})`], ['Passengers / day', `${Math.round(handover.paxPerDay)} (target ${handover.businessCaseTarget.paxPerDay})`], ['On-time performance', `${Math.round(handover.onTimePct)} % (target ${handover.businessCaseTarget.onTimePct} %)`]])
      : el('p', { class: 'pm-note', text: 'No operations data has been recorded yet.' }),
    el('div', { class: 'row' }, [button('Enter Operations mode', () => dash.sim.setMode('ops'), { icon: 'plane', kind: 'primary', small: true }), button('Open Operations panel', () => dash.open('operations'), { small: true, kind: 'ghost' })]),
  ], { cls: 'flat' }));
}

/* ------------------------------------------------------------ contracts */

function contracts(dash, pane, p) {
  const archive = [
    ['r1', 'Charter, baselines and approved change log'],
    ['r2', 'Risk register with realised risks and responses'],
    ['r3', 'Decision, issue and lessons-learned logs'],
    ['r4', 'Contracts, final accounts and vendor performance records'],
    ['r5', 'Quality records: tests, NCRs and audit reports'],
    ['r6', 'Stakeholder register and communications log'],
    ['r7', 'As-built drawings and certification evidence'],
  ];
  const closed = p.procurement.filter((x) => x.status === 'Closed');
  pane.appendChild(el('div', { class: 'grid c3 pm-kpis' }, [
    kpi({ label: 'Contracts closed', value: `${closed.length} / ${p.procurement.length}` }),
    kpi({ label: 'Retention released', value: fmtPKR(closed.reduce((a, x) => a + x.retention, 0)) }),
    kpi({ label: 'Open claims', value: String(p.procurement.reduce((a, x) => a + x.claims.filter((c) => c.status !== 'Settled').length, 0)), cls: 'warn' }),
  ]));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Contract' }, { key: 'vendor', label: 'Vendor', format: (v) => v || '—' },
    { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Closed' ? 'ok' : v === 'Delivering' ? 'info' : 'muted') },
    { key: 'claims', label: 'Open claims', num: true },
    { key: 'final', label: 'Final account', num: true, format: (v) => (v ? fmtPKR(v) : '—') },
  ], p.procurement.map((x) => ({ id: x.id, name: x.name, vendor: x.vendor, status: x.status, claims: x.claims.filter((c) => c.status !== 'Settled').length, final: x.finalAccount ? x.finalAccount.buyerPays : 0 })), { dense: true, onRow: () => dash.open('procurement') }));
  pane.appendChild(card('Archive project records', [
    el('p', { text: 'Organisational process assets grow from archived records. Tick what has been filed, then export a complete archive of this project.' }),
    el('ul', { class: 'check-list' }, archive.map(([id, text]) => el('li', {}, [el('label', { class: 'ck-row' }, [(() => {
      const cb = el('input', { type: 'checkbox', checked: isChecked(p, id), 'aria-label': text });
      cb.addEventListener('change', () => { setCheck(p, id, cb.checked); dash.rerender(); });
      return cb;
    })(), el('span', { text })])]))),
    el('div', { class: 'row' }, [
      button('Export project archive (JSON)', () => dash.sim.download(`HDD_project_archive_day${p.day}.json`, 'application/json', JSON.stringify(p.serialise())), { icon: 'export', kind: 'primary' }),
      button('Export lessons (CSV)', () => exportLessons(dash, p), { icon: 'export', kind: 'ghost' }),
    ]),
  ], { cls: 'flat' }));
}

/* -------------------------------------------------------------- lessons */

function exportLessons(dash, p) {
  const lines = [['ID', 'Day', 'Category', 'Title', 'Detail', 'Owner', 'Status'].join(',')];
  for (const l of p.lessons) lines.push([l.id, l.day, l.category, l.title, l.detail, l.owner, l.status].map(csvCell).join(','));
  dash.sim.download(`HDD_lessons_learned_day${p.day}.csv`, 'text/csv', `${lines.join('\n')}\n`);
}

function lessons(dash, pane, p, s) {
  if (!s.draft) s.draft = { title: '', detail: '', category: 'General' };
  if (s.editing === undefined) s.editing = null;
  const title = el('input', { type: 'text', maxlength: 100, value: s.draft.title, placeholder: 'What did we learn? (one line)', 'aria-label': 'Lesson title' });
  const detail = el('textarea', { rows: 3, maxlength: 600, placeholder: 'What happened, why it mattered, and what to do next time.', 'aria-label': 'Lesson detail' });
  detail.value = s.draft.detail;
  title.addEventListener('input', () => { s.draft.title = title.value; });
  detail.addEventListener('input', () => { s.draft.detail = detail.value; });
  const cat = select(CATEGORIES.map((c) => ({ value: c, label: c })), s.draft.category, (v) => { s.draft.category = v; });
  pane.appendChild(card('Add a lesson', [
    el('div', { class: 'lesson-form' }, [field('Title', title), field('Category', cat), field('Detail', detail)]),
    el('div', { class: 'row' }, [button('Add to register', () => {
      if (!s.draft.title.trim()) { dash.sim.toast('Give the lesson a title', 'warn'); title.focus(); return; }
      p.addLesson({ title: s.draft.title.trim(), detail: s.draft.detail.trim(), category: s.draft.category, owner: 'Project Manager' });
      s.draft = { title: '', detail: '', category: s.draft.category };
      dash.sim.toast('Lesson recorded', 'good');
      dash.rerender();
    }, { kind: 'primary', icon: 'book' }), button('Export register (CSV)', () => exportLessons(dash, p), { kind: 'ghost', icon: 'export', small: true })]),
  ], { cls: 'accent', sub: 'Lessons seeded by the simulation appear below as events happen. Edit any entry to refine it.' }));
  pane.appendChild(section(`Lessons-learned register (${p.lessons.length})`));
  if (!p.lessons.length) {
    pane.appendChild(el('div', { class: 'pm-empty', text: 'No lessons yet. The simulation records a lesson when a notable event happens (a first incident, a late gate decision, a heavy rain delay). Run the project forward or add your own above.' }));
    return;
  }
  pane.appendChild(el('div', { class: 'lesson-list' }, p.lessons.map((l) => {
    const editing = s.editing === l.id;
    if (editing) {
      const t = el('input', { type: 'text', value: l.title, maxlength: 100, 'aria-label': 'Edit title' });
      const d = el('textarea', { rows: 3, maxlength: 600, 'aria-label': 'Edit detail' });
      d.value = l.detail;
      return el('div', { class: 'lesson edit' }, [t, d, el('div', { class: 'row' }, [
        button('Save', () => { l.title = t.value.trim() || l.title; l.detail = d.value.trim(); l.status = 'Refined'; s.editing = null; dash.rerender(); }, { small: true, kind: 'primary' }),
        button('Cancel', () => { s.editing = null; dash.rerender(); }, { small: true, kind: 'ghost' }),
      ])]);
    }
    return el('div', { class: 'lesson' }, [
      el('div', { class: 'lesson-head' }, [pill(l.category || 'General', 'gold'), el('b', { text: l.title }), el('span', { class: 'grow' }), el('small', { class: 'muted', text: `${l.id} · day ${l.day} · ${l.owner}` }), pill(l.status, l.status === 'Refined' ? 'ok' : 'muted')]),
      el('p', { text: l.detail || 'No detail recorded.' }),
      el('div', { class: 'row' }, [button('Edit', () => { s.editing = l.id; dash.rerender(); }, { small: true, kind: 'ghost' })]),
    ]);
  })));
}

/* --------------------------------------------------------------- report */

export function buildCloseoutNode(p, r) {
  const sec = (h, rows) => el('section', { class: 'rep-sec' }, [el('h3', { text: h }), ...rows]);
  const kv = (rows) => el('dl', { class: 'rep-kv' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })]));
  return el('article', { class: 'closeout' }, [
    el('header', { class: 'rep-head' }, [el('h2', { text: r.title }), el('p', { text: `${r.status} · day ${r.day} · ${r.dateLabel} · ${r.simulated}` })]),
    sec('1. Schedule', [kv([
      ['Baseline duration', `${r.schedule.baselineDuration} days`], ['Actual / forecast', `${r.status === 'Completed' ? r.schedule.actualDuration : Math.round(r.schedule.forecastFinish)} days`],
      ['Variance', `${r.schedule.varianceDays > 0 ? '+' : ''}${Math.round(r.schedule.varianceDays)} days`], ['Schedule performance index (time)', r.schedule.spit.toFixed(2)],
    ]), el('p', { class: 'rep-note', text: `Milestones: ${r.schedule.milestones.map((m) => `${m.name} (baseline day ${m.baselineDay}${m.actualDay !== null && m.actualDay !== undefined ? `, actual ${m.actualDay}` : ''})`).join('; ')}.` })]),
    sec('2. Cost', [kv([
      ['Budget at completion', fmtPKR(r.cost.bac)], ['Actual cost', fmtPKR(r.cost.ac)], ['Earned value', fmtPKR(r.cost.ev)], ['CPI', r.cost.cpi.toFixed(2)],
      ['Estimate at completion', fmtPKR(r.cost.eac)], ['Variance at completion', fmtPKR(r.cost.vac)], ['Contingency used', fmtPKR(r.cost.contingencyUsed)], ['Management reserve used', fmtPKR(r.cost.managementReserveUsed)],
    ])]),
    sec('3. Scope and changes', [kv([['Requirements verified', `${r.scope.requirementsVerified} / ${r.scope.requirements}`], ['Changes implemented', r.scope.changesApproved], ['Changes rejected', r.scope.changesRejected], ['Baseline version', `v${r.scope.baselineVersion}`]])]),
    sec('4. Quality and safety', [kv([['Quality index', fmtPct(r.quality.index, 0)], ['Non-conformance reports', r.quality.ncrs], ['Safety index', fmtPct(r.safety.index, 0)], ['Incidents', r.safety.incidents]]),
      el('p', { class: 'rep-note', text: `Top defect categories: ${r.quality.pareto.map((x) => `${x.category || x.name || x.label} (${x.count || x.value})`).join(', ') || 'none recorded'}.` })]),
    sec('5. Risk', [kv([['Threats that occurred', r.risk.realisedThreats], ['Opportunities realised', r.risk.realisedOpportunities]]), el('p', { class: 'rep-note', text: r.risk.occurred.length ? `Risks that occurred: ${r.risk.occurred.map((x) => `${x.id} ${x.title} ×${x.times}`).join('; ')}.` : 'No registered risk occurred.' })]),
    sec('6. Stakeholders', [kv([['Weighted satisfaction', fmtPct(r.stakeholders.satisfaction, 0)]]), el('p', { class: 'rep-note', text: r.stakeholders.belowDesired.length ? `Still below desired engagement: ${r.stakeholders.belowDesired.join('; ')}.` : 'All stakeholders reached their desired engagement level.' })]),
    sec('7. Procurement', [table([{ key: 'id', label: 'ID' }, { key: 'name', label: 'Package' }, { key: 'type', label: 'Type' }, { key: 'vendor', label: 'Vendor', format: (v) => v || '—' }, { key: 'status', label: 'Status' }, { key: 'claims', label: 'Claims', num: true }], r.procurement, { dense: true })]),
    sec('8. Benefits', [kv([['Realisation', r.benefits.realisation !== undefined ? fmtPct(r.benefits.realisation, 0) : 'Not yet measured'], ['Operations samples', r.benefits.samples]])]),
    sec('9. Lessons learned', [r.lessons.length ? el('ul', {}, r.lessons.map((l) => el('li', { text: `${l.title} (${l.category})` }))) : el('p', { class: 'rep-note', text: 'No lessons recorded.' })]),
    sec('10. Acceptance', [el('p', { text: r.acceptance })]),
  ]);
}

function report(dash, pane, p, s) {
  const r = p.closeProject();
  if (!p.finished) pane.appendChild(el('div', { class: 'callout warn' }, [el('div', {}, [el('b', { text: 'Draft close-out. ' }), 'The programme is still running, so this is a progress snapshot; the final report and acceptance statement complete when the last milestone is reached.'])]));
  pane.appendChild(el('div', { class: 'row' }, [
    button('Print / save as PDF', () => printNode(buildCloseoutNode(p, r), `${r.title}`), { kind: 'primary', icon: 'present' }),
    button('Download JSON', () => dash.sim.download(`HDD_closeout_day${p.day}.json`, 'application/json', JSON.stringify(r, null, 1)), { kind: 'ghost', icon: 'export', small: true }),
  ]));
  pane.appendChild(el('div', { class: 'report-sheet' }, [buildCloseoutNode(p, r)]));
}

/* ---------------------------------------------------------------- score */

export function certificateNode(cert) {
  return el('div', { class: 'certificate' }, [
    el('div', { class: 'cert-border' }, [
      el('div', { class: 'cert-kicker', text: 'SKY GATEWAY HYDERABAD' }),
      el('h2', { text: 'Certificate of Achievement' }),
      el('p', { class: 'cert-sub', text: cert.subtitle }),
      el('div', { class: 'cert-name', text: cert.studentName }),
      el('p', { class: 'cert-text', text: `has completed the project-management simulation, reaching the rank of ${cert.level} with an overall grade of ${cert.grade} (${cert.overall} / 100).` }),
      el('div', { class: 'cert-clos' }, Object.entries(cert.byClo).map(([k, v]) => el('div', {}, [el('b', { text: String(v) }), el('small', { text: k })]))),
      el('p', { class: 'cert-badges', text: cert.badges.length ? `Badges: ${cert.badges.join(' · ')}` : 'No badges earned yet.' }),
      el('div', { class: 'cert-foot' }, [el('span', { text: `Issued ${cert.issued}` }), el('span', { text: `Seed ${cert.seed} · ${cert.difficulty} · ${cert.approach} · day ${cert.projectDay}` })]),
      el('p', { class: 'cert-note', text: cert.note }),
    ]),
  ]);
}

function score(dash, pane, p, s) {
  const sim = dash.sim;
  let card_ = null;
  try { card_ = sim.game && sim.game.scorecard ? sim.game.scorecard() : null; } catch { card_ = null; }
  if (!card_) { pane.appendChild(el('div', { class: 'pm-empty', text: 'The scorecard is not available yet.' })); return; }
  pane.appendChild(el('div', { class: 'score-top' }, [
    scoreRing(card_.overall / 100, `Grade ${card_.grade}`, { size: 150, display: String(card_.overall), color: 'var(--brass)' }),
    el('div', { class: 'score-clos' }, Object.entries(card_.byClo).map(([k, v]) => el('div', { class: 'score-clo' }, [scoreRing(v / 100, k, { size: 104, color: k === 'CLO1' ? 'var(--c2)' : k === 'CLO2' ? 'var(--c4)' : 'var(--c6)' }), el('small', { text: card_.cloLabels[k] })]))),
  ]));
  pane.appendChild(table([
    { key: 'label', label: 'Measure' }, { key: 'value', label: 'Value', num: true, format: (v) => (Number.isFinite(v) ? v.toFixed(2) : '—') },
    { key: 'score', label: 'Score', num: true, format: (v) => el('div', { class: 'perf-cell' }, [bar(v / 100, v < 40 ? 'bad' : v > 70 ? 'good' : ''), el('span', { text: String(v) })]) },
  ], Object.values(card_.metrics), { dense: true, caption: card_.finished ? 'Final scorecard' : 'Provisional scorecard — the project is still running' }));
  const name = el('input', { type: 'text', maxlength: 60, value: (sim.settings && sim.settings.get('studentName')) || '', placeholder: 'Your name (shown on the certificate)', autocomplete: 'name', 'aria-label': 'Student name' });
  name.addEventListener('change', () => { if (sim.settings) sim.settings.set('studentName', name.value.trim()); dash.rerender(); });
  const cert = sim.game.certificate();
  pane.appendChild(section('Certificate'));
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [field('Student name', name), button('Print certificate', () => printNode(certificateNode(sim.game.certificate()), 'Certificate of Achievement'), { kind: 'primary', icon: 'star' }), el('span', { class: 'muted small', text: card_.finished ? '' : 'Provisional until the project finishes.' })]));
  pane.appendChild(el('div', { class: 'cert-wrap' }, [certificateNode(cert)]));
  void C; void chartBox; void confirmModal;
}
