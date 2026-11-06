import { el, kpi, button, table, tabs, pill, select, field, fmtPKR, fmtPct, fmtIndex, indexClass, confirmModal } from '../dom.js';
import { C, chartBox, legend, barChart, shortDate, money, section, card, animOnce, dl } from '../charts.js';
import { CCB_MEMBERS, tallyVotes } from '../../pm/change.js';

/**
 * Integrated Change Control (Week 6): raise a change request, analyse its
 * impact on scope, time, cost, risk and quality, collect CCB votes, approve or
 * reject, implement and re-baseline; change, issue and decision logs; the
 * variance analysis table per control account; the phase-close checklist.
 */

const TABS = [
  { id: 'ccb', label: 'Change control board', icon: 'shuffle' },
  { id: 'variance', label: 'Variance analysis', icon: 'stats' },
  { id: 'logs', label: 'Issue & decision logs', icon: 'table' },
  { id: 'close', label: 'Close phase', icon: 'flagCheck' },
];
const STEPS = ['Raised', 'Analysed', 'Approved', 'Implemented'];
const TITLE_ID = 'cr-title-input';

const RAISERS = ['Project Director', 'S09', 'S16', 'S10', 'S03', 'S02', 'S01'];

export const PANEL_CONTROL = {
  id: 'control',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'ccb';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const open = p.changes.filter((c) => ['Raised', 'Analysed', 'Approved'].includes(c.status));
    const e = p.evm();
    body.appendChild(el('p', { class: 'lede', text: 'Every change to the baselines goes through integrated change control: record it, analyse the impact on every constraint, let the change control board decide, then implement and re-baseline. Nothing is “just a small tweak”.' }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Open changes', value: String(open.length), foot: `${p.changes.length} raised in total`, cls: open.length > 3 ? 'warn' : '' }),
      kpi({ label: 'Approved / rejected', value: `${p.changes.filter((c) => ['Approved', 'Implemented'].includes(c.status)).length} / ${p.changes.filter((c) => c.status === 'Rejected').length}` }),
      kpi({ label: 'Baseline version', value: `v${p.baselineVersion}`, foot: `BAC ${fmtPKR(p.bac)}` }),
      kpi({ label: 'CPI · SPI', value: `${fmtIndex(e.cpi)} · ${fmtIndex(e.spi)}`, cls: indexClass(Math.min(e.cpi, e.spi)) }),
      kpi({ label: 'Open issues', value: String(p.issues.filter((i) => i.status === 'Open').length), foot: `${p.decisionLog.length} decisions logged` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ ccb, variance, logs, close })[s.tab](dash, pane, p);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · the board chair is the sponsor` })]));
  },
};

/** Focus the CR title input (called by the shell and the HUD "Raise Change Request" button). */
PANEL_CONTROL.focusChangeForm = (dash) => {
  const go = () => {
    const input = document.getElementById(TITLE_ID);
    if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); return true; }
    return false;
  };
  const s = dash.stateFor('control');
  if (dash.openId !== 'control') dash.open('control');
  if (s.tab !== 'ccb') { s.tab = 'ccb'; dash.rerender(); }
  return go();
};

/* ----------------------------------------------------------------- CCB */

function stepper(c) {
  const idx = c.status === 'Rejected' ? 2 : STEPS.indexOf(c.status);
  return el('div', { class: 'stepper' }, STEPS.map((st, i) => el('span', { class: c.status === 'Rejected' && i === 2 ? 'rej' : i < idx ? 'done' : i === idx ? 'now' : '', text: c.status === 'Rejected' && i === 2 ? 'Rejected' : st })));
}

function ccb(dash, pane, p) {
  const s = dash.state;
  if (!s.sel || !p.changes.find((c) => c.id === s.sel)) { const o = p.changes.find((c) => ['Raised', 'Analysed', 'Approved'].includes(c.status)) || p.changes[p.changes.length - 1]; s.sel = o ? o.id : null; }
  const list = p.changes.slice().reverse();
  pane.appendChild(el('div', { class: 'pm-grid c12', style: { alignItems: 'start' } }, [
    el('div', {}, [raiseForm(dash, p), section('Change log', `${list.length}`), el('div', { class: 'cr-list' }, list.length ? list.map((c) => el('button', { type: 'button', class: `cr-item ${c.id === s.sel ? 'active' : ''}`, onclick: () => { s.sel = c.id; dash.rerender(); } }, [
      el('b', { text: c.id }), el('span', { class: 't', text: c.title }), pill(c.status, c.status === 'Rejected' ? 'bad' : c.status === 'Implemented' || c.status === 'Approved' ? 'ok' : 'warn'),
      el('small', { text: `${shortDate(p.startDate, c.day)} · ${(p.stakeholderById.get(c.raisedBy) || { role: c.raisedBy }).role}` }),
    ])) : [el('div', { class: 'pm-empty', text: 'No change requests yet. Raise one above, or wait for stakeholders to ask.' })])]),
    s.sel ? detail(dash, p, p.changes.find((c) => c.id === s.sel)) : el('div', { class: 'pm-empty', text: 'Select a change request to analyse it.' }),
  ]));
}

function raiseForm(dash, p) {
  const s = dash.state;
  const title = el('input', { type: 'text', id: TITLE_ID, placeholder: 'e.g. Add a fifth boarding bridge', maxlength: 90 });
  const desc = el('textarea', { rows: 3, placeholder: 'What is asked for, and why?', maxlength: 400 });
  const who = select(RAISERS.map((r) => ({ value: r, label: p.stakeholderById.get(r) ? p.stakeholderById.get(r).role : r })), 'Project Director', () => {});
  const wbsSel = select([{ value: '', label: 'No specific work package' }, ...p.tasks.filter((t) => !t.milestone && p.state.get(t.id).pct < 1).map((t) => ({ value: t.id, label: `${t.code} ${t.name}` }))], '', () => {});
  const days = el('input', { type: 'number', min: 0, max: 365, step: 1, value: 10 });
  const cost = el('input', { type: 'number', min: 0, max: 20000, step: 10, value: 100 });
  const submit = () => {
    if (!title.value.trim()) { dash.sim.toast('Give the change request a title first.', 'warn'); title.focus(); return; }
    const cr = p.raiseChange({ title: title.value.trim(), description: desc.value.trim(), raisedBy: who.value, wbs: wbsSel.value || null, impact: { days: Number(days.value) || 0, cost: (Number(cost.value) || 0) * 1e6 }, merit: 0.5 });
    if (dash.sim.bus) dash.sim.bus.emit('change:raised', { change: cr });
    dash.sim.toast(`${cr.id} raised — now analyse its impact`, 'good');
    s.sel = cr.id;
    dash.rerender();
  };
  return card('Raise a change request', [
    field('Title', title), field('Description', desc), field('Raised by', who), field('Affected work package', wbsSel),
    el('div', { class: 'pm-grid c2' }, [field('Estimated days added', days), field('Estimated cost (PKR m)', cost)]),
    el('div', { class: 'row actions-row' }, [button('Submit request', submit, { kind: 'primary', icon: 'check' })]),
  ], { sub: 'Step 1 — record and log' });
}

function detail(dash, p, c) {
  const analysed = c.status !== 'Raised';
  const tally = tallyVotes(c.votes);
  const decided = ['Approved', 'Rejected', 'Implemented'].includes(c.status);
  const imp = c.impact;
  const who = p.stakeholderById.get(c.raisedBy);
  const redo = () => dash.rerender();
  const parts = [
    stepper(c),
    el('p', { text: c.description || '—' }),
    dl([['Raised by', who ? who.role : c.raisedBy], ['Raised on', p.dateLabel(c.day)], ['Work package', c.wbs ? `${c.wbs} ${p.taskById.get(c.wbs).name}` : 'programme-wide']]),
    section('Impact analysis'),
    el('div', { class: 'impact-grid' }, [
      ['Scope', imp.scope ? String(imp.scope).slice(0, 80) : '—'], ['Time', `${imp.days} d${analysed && imp.scheduleDays !== undefined ? ` (→ +${imp.scheduleDays} d on finish after ${imp.float} d float)` : ''}`],
      ['Cost', fmtPKR(imp.cost) + (analysed && imp.costRatio !== undefined ? ` (${fmtPct(imp.costRatio, 2)} of BAC)` : '')], ['Risk', `${imp.risk >= 0 ? '+' : ''}${Math.round(imp.risk * 100)}%`], ['Quality', `${imp.quality >= 0 ? '+' : ''}${Math.round(imp.quality * 100)}%`],
    ].map(([k, v]) => el('div', {}, [el('b', { text: k }), el('span', { text: v })]))),
  ];
  if (!analysed) parts.push(button('Analyse impact & call a vote', () => { p.analyseChange(c.id); redo(); }, { kind: 'primary', icon: 'stats' }));
  else {
    parts.push(section('Board vote', `${tally.approve} approve · ${tally.reject} reject${tally.quorum ? '' : ' · no quorum'}`));
    parts.push(el('div', { class: 'vote-grid' }, CCB_MEMBERS.flatMap((m) => {
      const v = c.votes[m.role];
      const lock = !['Raised', 'Analysed'].includes(c.status);
      const mk = (val, label) => el('button', { type: 'button', class: `${v === val ? `on ${val}` : ''}`, disabled: lock, onclick: () => { p.voteChange(c.id, m.role, val === 'approve'); redo(); } }, [label]);
      return [el('div', { class: 'role' }, [m.role, el('small', { text: `lens: ${m.lens}${m.chair ? ' · chair' : ''}` })]), el('span', { class: 'pm-note', text: v ? v : 'not voted' }), el('span', { class: 'seg' }, [mk('approve', 'Approve'), mk('reject', 'Reject')])];
    })));
    parts.push(el('p', { class: 'pm-note', text: tally.quorum ? `Board outcome: ${tally.decision}${tally.approve === tally.reject ? ' (chair’s vote breaks the tie)' : ''}.` : 'A majority of members must vote to reach quorum.' }));
  }
  const acts = [];
  if (['Raised', 'Analysed'].includes(c.status) && analysed) {
    acts.push(button('Approve', async () => {
      const ok = await confirmModal(`Approve ${c.id}?`, `${c.title}\n+${imp.days} days, ${fmtPKR(imp.cost)} from the management reserve. It will be implemented and the baselines re-set.`, { okLabel: 'Approve' });
      if (!ok) return;
      p.decideChange(c.id, true, 'CCB (chair, as sponsor)');
      if (dash.sim.bus) dash.sim.bus.emit('change:decided', { change: c });
      dash.sim.toast(`${c.id} approved`, 'good'); redo();
    }, { kind: 'good', icon: 'check' }));
    acts.push(button('Reject', async () => {
      const ok = await confirmModal(`Reject ${c.id}?`, 'The requester is told why, and the decision is recorded in the decision log.', { okLabel: 'Reject', danger: true });
      if (!ok) return;
      p.decideChange(c.id, false, 'CCB (chair, as sponsor)');
      if (dash.sim.bus) dash.sim.bus.emit('change:decided', { change: c });
      dash.sim.toast(`${c.id} rejected`, 'warn'); redo();
    }, { kind: 'danger', icon: 'close' }));
  }
  if (c.status === 'Approved') acts.push(button('Implement & re-baseline', () => { p.implementChange(c.id); dash.sim.toast(`${c.id} implemented — baseline v${p.baselineVersion}`, 'good'); redo(); }, { kind: 'primary', icon: 'save' }));
  if (c.wbs) acts.push(button('Show in 3D', () => dash.sim.select(c.wbs), { icon: 'eye', kind: 'ghost' }));
  if (acts.length) parts.push(el('div', { class: 'row actions-row' }, acts));
  if (decided) parts.push(el('p', { class: 'pm-note', text: `${c.status}${c.decisionDay !== null ? ` on ${p.dateLabel(c.decisionDay)}` : ''}${c.decidedBy ? ` by ${c.decidedBy}` : ''}${c.implementedDay ? ` · implemented ${p.dateLabel(c.implementedDay)} (baseline v${p.baselineVersion})` : ''}.` }));
  return card(`${c.id} · ${c.title}`, parts, { cls: 'accent' });
}

/* ------------------------------------------------------------- variance */

function variance(dash, pane, p) {
  const rows = p.summaries.map((sm) => {
    const kids = p.tasks.filter((t) => t.summaryId === sm.id);
    const pv = kids.reduce((a, t) => a + p.plannedValueOf(t.id), 0);
    const ev = kids.reduce((a, t) => a + p.state.get(t.id).pct * t.budget, 0);
    const ac = kids.reduce((a, t) => a + p.state.get(t.id).actualCost, 0);
    const budget = kids.reduce((a, t) => a + t.budget, 0);
    const cpi = ac > 0 ? ev / ac : 1;
    return { id: sm.id, name: sm.name, budget, pv, ev, ac, sv: ev - pv, cv: ev - ac, svp: pv ? (ev - pv) / pv : 0, cvp: ev ? (ev - ac) / ev : 0, eac: cpi > 0 ? budget / cpi : budget };
  });
  pane.appendChild(chartBox(barChart({
    width: 1040, height: 280, label: 'Schedule and cost variance by control account', categories: rows.map((r) => r.id),
    series: [{ label: 'SV (EV − PV)', values: rows.map((r) => r.sv), color: C.c2 }, { label: 'CV (EV − AC)', values: rows.map((r) => r.cv), color: C.c1 }],
    barTitle: (i, si, v) => `${rows[i].id} ${rows[i].name} — ${si ? 'CV' : 'SV'}: ${fmtPKR(v)}`, animate: animOnce(dash, 'var'), yFormat: (v) => money(v),
  }), { minWidth: 700, legend: legend([{ label: 'SV = EV − PV', color: C.c2 }, { label: 'CV = EV − AC', color: C.c1 }]), caption: 'Below zero = behind schedule / over budget. Variances beyond ±5 % need a written explanation and a corrective action.' }));
  const cls = (v, th) => (Math.abs(v) < th ? '' : v < 0 ? 'pm-neg' : 'pm-pos');
  pane.appendChild(table([
    { key: 'id', label: 'WBS' }, { key: 'name', label: 'Control account' },
    { key: 'pv', label: 'PV', num: true, format: (v) => money(v) }, { key: 'ev', label: 'EV', num: true, format: (v) => money(v) }, { key: 'ac', label: 'AC', num: true, format: (v) => money(v) },
    { key: 'sv', label: 'SV', num: true, format: (v) => el('span', { class: `pm-mono ${cls(v, 1)}`, text: money(v) }) }, { key: 'svp', label: 'SV %', num: true, format: (v) => el('span', { class: cls(v, 0.05), text: fmtPct(v, 1) }) },
    { key: 'cv', label: 'CV', num: true, format: (v) => el('span', { class: `pm-mono ${cls(v, 1)}`, text: money(v) }) }, { key: 'cvp', label: 'CV %', num: true, format: (v) => el('span', { class: cls(v, 0.05), text: fmtPct(v, 1) }) },
    { key: 'eac', label: 'EAC', num: true, format: (v) => money(v) },
    { key: 'cvp', label: 'Action', format: (v, r) => (Math.abs(v) > 0.05 || Math.abs(r.svp) > 0.05 ? pill('Explain & act', 'warn') : pill('Within threshold', 'ok')) },
  ], rows, { dense: true, sortable: true }));
  pane.appendChild(el('p', { class: 'pm-note', text: 'PKR. EAC per account uses its own CPI (BAC ÷ CPI). Variance analysis asks why, whether it will persist, and what to change — that is the input to the next change request.' }));
}

/* ----------------------------------------------------------------- logs */

function logs(dash, pane, p) {
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Issue log', [table([
      { key: 'id', label: 'ID' }, { key: 'day', label: 'Day', format: (v) => shortDate(p.startDate, v) }, { key: 'title', label: 'Issue' }, { key: 'owner', label: 'Owner' },
      { key: 'status', label: 'Status', format: (v) => pill(v, v === 'Open' ? 'warn' : 'ok') },
    ], p.issues, { dense: true, maxRows: 15, empty: 'No issues yet — risks that occur become issues.' })], { sub: `${p.issues.filter((i) => i.status === 'Open').length} open` }),
    card('Decision log', [table([
      { key: 'id', label: 'ID' }, { key: 'day', label: 'Date', format: (v) => shortDate(p.startDate, v) }, { key: 'title', label: 'Decision' }, { key: 'owner', label: 'By' },
    ], p.decisionLog, { dense: true, maxRows: 15, empty: 'Decisions you make — risk responses, crashing, gates, CCB — are recorded here.' })]),
  ]));
  pane.appendChild(card('Lessons captured so far', [table([
    { key: 'id', label: 'ID' }, { key: 'category', label: 'Category' }, { key: 'title', label: 'Lesson' }, { key: 'detail', label: 'Detail' },
  ], p.lessons, { dense: true, maxRows: 10, empty: 'Lessons are captured as events occur.' })]));
}

/* ---------------------------------------------------------------- close */

function close(dash, pane, p) {
  const st = (id) => p.state.get(id).pct;
  const g = (id) => p.gateById.get(id).status === 'approved';
  const openCr = p.changes.filter((c) => ['Raised', 'Analysed', 'Approved'].includes(c.status)).length;
  const openIss = p.issues.filter((i) => i.status === 'Open').length;
  const openNcr = p.ncrs.filter((n) => n.status === 'Open').length;
  const items = [
    ['Phase deliverables complete and accepted', p.tasks.filter((t) => !t.milestone && st(t.id) >= 1).length === p.tasks.filter((t) => !t.milestone).length, `${p.tasks.filter((t) => !t.milestone && st(t.id) >= 1).length} of ${p.tasks.filter((t) => !t.milestone).length} work packages`],
    ['All change requests decided and implemented', openCr === 0, `${openCr} open`],
    ['Issues resolved or transferred to the operator', openIss === 0, `${openIss} open`],
    ['Non-conformance reports closed', openNcr === 0, `${openNcr} open`],
    ['Stage gate criteria met', p.gates.every((x) => x.status === 'approved'), `${p.gates.filter((x) => x.status === 'approved').length} of ${p.gates.length} gates approved`],
    ['Contracts closed, final accounts agreed', p.procurement.every((x) => x.status === 'Closed'), `${p.procurement.filter((x) => x.status === 'Closed').length} of ${p.procurement.length} packages closed`],
    ['Lessons learned captured', p.lessons.length >= 5, `${p.lessons.length} lessons`],
    ['Benefits handed to the operator (gate G4)', g('G4'), g('G4') ? 'approved' : 'pending'],
  ];
  pane.appendChild(card('Close-phase checklist', [el('ul', { class: 'check-list' }, items.map(([t, ok, note]) => el('li', { class: ok ? 'ok' : '' }, [el('span', {}, [t, el('small', { class: 'muted', text: `  — ${note}` })])])))], { sub: 'Phase or project closure is an integrated-change-control process too' }));
  pane.appendChild(el('div', { class: 'gate-row' }, p.gates.map((x) => el('div', { class: `gate-card ${x.status}` }, [
    el('h5', {}, [`${x.id}`, pill(x.status, x.status === 'approved' ? 'ok' : x.status === 'ready' ? 'gold' : 'muted')]),
    el('div', { class: 'pm-note', style: { margin: 0 }, text: x.name }),
    el('ul', { class: 'pm-note' }, x.criteria.map((c) => el('li', { text: c }))),
    x.status === 'ready' ? button('Approve gate', () => { const r = p.approveGate(x.id); dash.sim.toast(r.message, r.ok ? 'good' : 'warn'); dash.rerender(); }, { small: true, kind: 'primary' }) : el('div', { class: 'pm-note', text: x.status === 'approved' ? `Approved ${shortDate(p.startDate, x.day)}` : `Baseline ${shortDate(p.startDate, x.baselineDay)}` }),
  ]))));
  pane.appendChild(el('div', { class: 'row actions-row' }, [button('Open Closing & Lessons', () => dash.open('closing'), { icon: 'flagCheck', kind: 'ghost' })]));
}
