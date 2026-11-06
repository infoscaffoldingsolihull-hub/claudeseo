import { el, kpi, button, tabs, pill, bar, select, slider, openModal, icon } from '../dom.js';
import { section, card, table, legend } from '../charts.js';
import { burndownChart, burnupChart, velocityChart, kanbanBoard, K } from '../charts2.js';
import { velocityStats, releaseForecast } from '../../pm/agile.js';

/**
 * agile — Agile Delivery (Week 3, CLO1/2). Product backlog and sprint planning for the
 * terminal IT stream, a Scrum board and a Kanban board with WIP limits (drag-and-drop
 * plus move buttons), burndown / burn-up / velocity charts and the ceremonies log.
 * Keyboard: B opens this panel (handled by the shell).
 */

const TABS = [
  { id: 'board', label: 'Boards', icon: 'sprint' },
  { id: 'backlog', label: 'Backlog & planning', icon: 'table' },
  { id: 'charts', label: 'Burndown & velocity', icon: 'stats' },
  { id: 'ceremonies', label: 'Ceremonies', icon: 'people' },
];
const SCRUM_COLS = [{ id: 'todo', label: 'Sprint to do' }, { id: 'doing', label: 'Doing' }, { id: 'review', label: 'Review' }, { id: 'done', label: 'Done' }];
const CEREMONY_TONE = { 'Sprint planning': 'info', 'Sprint review': 'ok', Retrospective: 'gold', 'Daily stand-up': 'muted' };

const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

function forecastVelocity(ag) {
  return ag.velocity.length ? velocityStats(ag.velocity).average3 : ag.plannedVelocity;
}

function boardView(dash, pane) {
  const p = dash.project;
  const ag = p.agile;
  const s = dash.state;
  const mode = s.mode || 'scrum';
  const sp = ag.currentSprint;
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Board type' }, [
      button('Scrum board', () => { s.mode = 'scrum'; dash.rerender(); }, { kind: mode === 'scrum' ? 'primary' : 'ghost', small: true, icon: 'sprint' }),
      button('Kanban board', () => { s.mode = 'kanban'; dash.rerender(); }, { kind: mode === 'kanban' ? 'primary' : 'ghost', small: true, icon: 'table' }),
    ]),
    el('span', { class: 'grow' }),
    el('label', { class: 'inline' }, ['Doing limit', slider(1, 8, 1, ag.wip.doing, (v) => { ag.wip.doing = v; }, (v) => String(v), { 'aria-label': 'WIP limit for Doing' })]),
    el('label', { class: 'inline' }, ['Review limit', slider(1, 5, 1, ag.wip.review, (v) => { ag.wip.review = v; }, (v) => String(v), { 'aria-label': 'WIP limit for Review' })]),
  ]));
  if (p.approach === 'predictive') {
    pane.appendChild(el('div', { class: 'callout warn' }, [icon('warning', 16), el('div', {}, [el('b', { text: 'Predictive approach in use.' }), el('p', { text: 'Terminal IT follows the baseline; stories are marked done as the schedule element progresses and no sprints run. Switch to hybrid in the Development Approach panel to see the boards move.' })])]));
  } else if (!sp) {
    pane.appendChild(el('div', { class: 'callout' }, [icon('sprint', 16), el('div', {}, [el('b', { text: 'No sprint is running.' }), el('p', { text: `Sprints start automatically while the terminal IT work is active (sprint length ${ag.sprintLength} days). Plan the next sprint on the Backlog tab; until a sprint runs, only moves back to the backlog are accepted.` })])]));
  }
  let cards;
  let columns;
  const toCard = (st) => ({
    id: st.id, column: st.status, title: st.title, points: st.points, locked: st.status === 'done',
    meta: `${st.epicName || st.epic} · priority ${st.priority}`, progress: st.status === 'done' ? 1 : Math.min(1, (st.effort || 0) / st.points),
    tone: st.status === 'done' ? 'done' : st.status === 'review' ? 'review' : '',
  });
  if (mode === 'scrum') {
    columns = SCRUM_COLS.map((c) => ({ ...c, wip: ag.wip[c.id] }));
    cards = sp ? ag.backlog.filter((x) => x.sprint === sp.n && x.status !== 'backlog').map(toCard) : [];
  } else {
    columns = [{ id: 'backlog', label: 'Backlog (top 8)' }, { id: 'todo', label: 'To do' }, { id: 'doing', label: 'Doing', wip: ag.wip.doing }, { id: 'review', label: 'Review', wip: ag.wip.review }, { id: 'done', label: 'Done (latest 10)' }];
    cards = [
      ...ag.backlog.filter((x) => x.status === 'backlog').sort((a, b) => a.priority - b.priority).slice(0, 8),
      ...ag.backlog.filter((x) => ['todo', 'doing', 'review'].includes(x.status)),
      ...ag.backlog.filter((x) => x.status === 'done').sort((a, b) => (b.doneDay || 0) - (a.doneDay || 0)).slice(0, 10),
    ].map(toCard);
  }
  pane.appendChild(el('p', { class: 'pm-note', text: mode === 'scrum'
    ? `Scrum: the board belongs to the sprint${sp ? ` ${sp.n} (day ${Math.max(0, p.day - sp.startDay)} of ${ag.sprintLength}) — goal: ${sp.goal}` : ''}. Drag a card to the next column, or use the arrow buttons. Moving to Done needs a fully built story in Review (Definition of Done).`
    : 'Kanban: continuous flow with explicit WIP limits and no sprint boundary. Columns turn amber when full and red when over the limit — finish work before starting more.' }));
  pane.appendChild(kanbanBoard({
    columns, cards, label: mode === 'scrum' ? 'Scrum board' : 'Kanban board',
    onMove: (id, to) => {
      const res = p.agileMove(id, to);
      dash.sim.toast && dash.sim.toast(res.message, res.ok ? 'good' : 'warn');
      if (res.ok) setTimeout(() => dash.rerender(), 0);
      return res;
    },
  }));
  pane.appendChild(el('p', { class: 'pm-note', text: 'Tip: the team also pulls work automatically each day at its velocity, so cards advance by themselves while the simulation runs — your moves are interventions (for example to unblock review).' }));
}

function backlogView(dash, pane) {
  const p = dash.project;
  const ag = p.agile;
  const s = dash.state;
  if (!s.pick) s.pick = new Set();
  const ready = ag.backlog.filter((x) => x.status === 'backlog').sort((a, b) => a.priority - b.priority);
  for (const id of [...s.pick]) if (!ready.some((x) => x.id === id)) s.pick.delete(id);
  const fv = forecastVelocity(ag);
  const picked = ready.filter((x) => s.pick.has(x.id));
  const pts = sum(picked, (x) => x.points - (x.effort || 0));
  const ratio = fv ? pts / fv : 0;
  const total = ag.totalPoints;
  const done = sum(ag.backlog.filter((x) => x.status === 'done'), (x) => x.points);
  const epics = {};
  for (const x of ag.backlog) { const e = epics[x.epic] || (epics[x.epic] = { name: x.epicName || x.epic, pts: 0, done: 0, n: 0 }); e.pts += x.points; e.n += 1; if (x.status === 'done') e.done += x.points; }
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Sprint planning', [
      el('p', { class: 'pm-note', text: `Forecast velocity ${fv.toFixed(1)} points (${ag.velocity.length ? 'average of the last three sprints — “yesterday’s weather”' : 'release plan, no sprint finished yet'}). Pick stories in priority order until the load matches the forecast.` }),
      el('div', { class: 'cp-load' }, [
        bar(Math.min(1, ratio), ratio > 1.2 ? 'bad' : ratio > 1 ? 'warn' : 'ok', 'Planned load versus forecast velocity'),
        el('b', { text: `${pts.toFixed(1)} pts selected · ${Math.round(ratio * 100)}% of forecast` }),
      ]),
      el('div', { class: 'row actions-row' }, [
        button('Suggest by priority', () => {
          s.pick = new Set(); let acc = 0;
          for (const x of ready) { const r = x.points - (x.effort || 0); if (acc >= fv) break; if (acc + r > fv && fv - acc < r / 2) continue; s.pick.add(x.id); acc += r; }
          dash.rerender();
        }, { icon: 'spark', kind: 'ghost' }),
        button('Clear', () => { s.pick = new Set(); dash.rerender(); }, { kind: 'ghost' }),
        button('Plan next sprint', () => {
          const res = p.agilePlanSprint([...s.pick]);
          dash.sim.toast && dash.sim.toast(res.message, res.ok ? (res.points > res.forecast * 1.2 ? 'warn' : 'good') : 'warn');
          s.planMsg = res.message;
          dash.rerender();
        }, { kind: 'primary', icon: 'check', disabled: !picked.length }),
      ]),
      s.planMsg ? el('div', { class: 'pm-note', role: 'status', text: s.planMsg }) : null,
      ag.nextPlan && ag.nextPlan.length ? el('div', { class: 'pm-note', text: `Queued for the next sprint: ${ag.nextPlan.join(', ')}` }) : null,
    ], { cls: 'accent' }),
    card('Release progress', [
      el('div', { class: 'cp-bignum' }, [el('b', { text: `${done} / ${total}` }), el('small', { text: 'points accepted' })]),
      bar(total ? done / total : 0, 'ok', 'Release points accepted'),
      el('div', { class: 'cp-epics' }, Object.values(epics).map((e) => el('div', { class: 'cp-epic' }, [
        el('span', { text: e.name }), bar(e.pts ? e.done / e.pts : 0, '', `${e.name} progress`), el('small', { text: `${e.done}/${e.pts}` }),
      ]))),
    ]),
  ]));
  pane.appendChild(section('Product backlog', `${ready.length} ready · ${ag.backlog.length} stories · ordered by priority`));
  pane.appendChild(table([
    { label: '', key: 'sel', format: (v, r) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': `Select ${r.id} for the next sprint`, checked: s.pick.has(r.id), disabled: r.status !== 'backlog' ? true : null });
      cb.addEventListener('change', () => { if (cb.checked) s.pick.add(r.id); else s.pick.delete(r.id); dash.rerender(); });
      return cb;
    } },
    { label: 'ID', key: 'id' },
    { label: 'User story', key: 'title' },
    { label: 'Epic', key: 'epicName' },
    { label: 'Pts', key: 'points', num: true },
    { label: 'Pri', key: 'priority', num: true },
    { label: 'Status', key: 'status', format: (v) => pill(v, v === 'done' ? 'ok' : v === 'backlog' ? 'muted' : 'info') },
  ], [...ag.backlog].sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.priority - b.priority).map((x) => ({ ...x, sel: '' })), { dense: true, sortable: true, maxRows: 60 }));
}

function chartsView(dash, pane) {
  const p = dash.project;
  const ag = p.agile;
  const s = dash.state;
  const vs = velocityStats(ag.velocity);
  const remaining = sum(ag.backlog.filter((x) => x.status !== 'done'), (x) => x.points);
  const fv = forecastVelocity(ag);
  const rf = releaseForecast(remaining, fv, ag.sprintLength, p.day);
  if (!ag.sprints.length) {
    pane.appendChild(el('div', { class: 'cp-empty' }, [icon('stats', 22), el('b', { text: 'No sprint data yet' }), el('p', { text: 'Run the simulation (speed ×10 or faster) until the terminal IT stream starts. The first sprint opens automatically; burndown, burn-up and velocity charts fill in as days pass.' })]));
    return;
  }
  const sel = s.sprintN && ag.sprints.some((x) => x.n === s.sprintN) ? s.sprintN : (ag.currentSprint || ag.sprints[ag.sprints.length - 1]).n;
  const sprint = ag.sprints.find((x) => x.n === sel);
  const pts = p.agileBurndown(sel);
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Last velocity', value: `${vs.last.toFixed(1)} pts`, foot: `3-sprint avg ${vs.average3.toFixed(1)}` }),
    kpi({ label: 'Planned velocity', value: `${ag.plannedVelocity.toFixed(1)} pts`, foot: `mean so far ${vs.mean.toFixed(1)}`, cls: vs.average3 && vs.average3 < ag.plannedVelocity * 0.8 ? 'warn' : 'good' }),
    kpi({ label: 'Remaining scope', value: `${remaining.toFixed(0)} pts`, foot: `${ag.backlog.filter((x) => x.status !== 'done').length} stories` }),
    kpi({ label: 'Release forecast', value: Number.isFinite(rf.sprints) ? `${rf.sprints} sprints` : 'No velocity', foot: Number.isFinite(rf.finishDay) ? `≈ ${p.dateLabel(Math.round(rf.finishDay))}` : 'run a sprint first' }),
  ]));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card(`Sprint ${sel} burndown`, [
      el('div', { class: 'pm-toolbar' }, [select(ag.sprints.map((x) => ({ value: x.n, label: `Sprint ${x.n}${x === ag.currentSprint ? ' (current)' : ''}` })), sel, (v) => { s.sprintN = Number(v); dash.rerender(); }, { 'aria-label': 'Choose sprint' }), el('small', { class: 'muted', text: `${sprint.goal}` })]),
      el('div', { class: 'cp-fig' }, [burndownChart({ points: pts, label: `Sprint ${sel} burndown`, todayDay: p.day })]),
      legend([{ label: 'Ideal', color: K.muted, dash: '5 4' }, { label: 'Actual remaining', color: K.c4 }, { label: 'Behind ideal', color: K.warn, shape: 'dot' }]),
      el('p', { class: 'pm-note', text: 'Below the ideal line = ahead of plan. A flat line means work is stuck in review or blocked by a WIP limit; a sudden drop is a batch accepted at the review.' }),
    ]),
    card('Release burn-up', [
      el('div', { class: 'cp-fig' }, [burnupChart({ sprints: p.agileReleaseBurnup(), scope: ag.totalPoints, velocity: fv, plannedSprints: ag.plannedSprints, label: 'Release burn-up' })]),
      legend([{ label: 'Accepted points', color: K.c4 }, { label: 'Total scope', color: K.c1 }, { label: 'Plan', color: K.muted, dash: '5 4' }, { label: 'Forecast', color: K.c2, dash: '3 4' }]),
      el('p', { class: 'pm-note', text: 'Burn-up shows scope changes honestly: when approved change requests add points, the gold scope line steps up instead of hiding the work.' }),
    ]),
  ]));
  pane.appendChild(card('Velocity by sprint', [
    el('div', { class: 'cp-fig' }, [velocityChart({ sprints: ag.sprints.filter((x) => x !== ag.currentSprint), planned: ag.plannedVelocity, label: 'Velocity by sprint' })]),
    legend([{ label: 'Committed', color: K.muted, shape: 'box' }, { label: 'Accepted', color: K.c4 }, { label: 'Accepted (below 90% of commitment)', color: K.warn }, { label: '3-sprint average', color: K.c2, dash: '1' }, { label: 'Plan', color: K.c1, dash: '5 4' }]),
    el('p', { class: 'pm-note', text: 'Velocity is a planning tool for the team, not a performance target: compare a team with itself, forecast with the last three sprints, and never use it to rank teams.' }),
  ]));
}

function standup(dash) {
  let text = 'Yesterday the team progressed the stories in Doing; today the focus is clearing Review; blockers are limited by the WIP limits.';
  try { if (dash.sim.ai && dash.sim.ai.standup) text = dash.sim.ai.standup(); } catch { /* keep fallback */ }
  openModal({ title: 'Daily stand-up', icon: 'people', body: [el('p', { class: 'cp-pre', text }), el('small', { class: 'muted', text: 'Three questions: what did I finish, what will I do next, what blocks me? Fifteen minutes, standing.' })], actions: [{ label: 'Close', kind: 'primary' }] });
}

const GUIDE = [
  ['Sprint planning', 'Start of sprint · up to 4 h for 2 weeks', 'Product owner and developers agree the sprint goal and pull stories from the top of the backlog to match forecast velocity.'],
  ['Daily stand-up', 'Every day · 15 min', 'Developers inspect progress to the sprint goal and re-plan the next 24 hours; blockers surface here.'],
  ['Sprint review', 'End of sprint · up to 2 h', 'The team shows the working increment; stakeholders and the product owner accept stories and adapt the backlog.'],
  ['Retrospective', 'After review · up to 1.5 h', 'The team inspects how it worked and agrees one or two improvements for the next sprint.'],
];

function ceremoniesView(dash, pane) {
  const p = dash.project;
  const ag = p.agile;
  pane.appendChild(el('div', { class: 'pm-grid c4' }, GUIDE.map(([k, when, what]) => card(k, [
    pill(CEREMONY_TONE[k] ? when : when, CEREMONY_TONE[k] || 'muted'), el('p', { text: what }),
    k === 'Daily stand-up' ? button('Hold stand-up', () => standup(dash), { small: true, icon: 'play' }) : null,
  ]))));
  pane.appendChild(el('p', { class: 'pm-note', text: 'Timeboxes follow the common Scrum convention for a two-week sprint (scaled down for shorter ones).' }));
  pane.appendChild(section('Ceremonies log', `${ag.ceremonies.length} recorded by the simulation`));
  pane.appendChild(table(['Day', 'Date', 'Ceremony', 'Outcome'], ag.ceremonies.slice(0, 40).map((c) => [c.day, p.dateLabel(c.day), pill(c.kind, CEREMONY_TONE[c.kind] || 'muted'), c.note]), { dense: true, empty: 'Ceremonies appear once the first sprint starts.' }));
}

const VIEWS = { board: boardView, backlog: backlogView, charts: chartsView, ceremonies: ceremoniesView };

export const PANEL_AGILE = {
  id: 'agile',
  render(dash, body, head) {
    const p = dash.project;
    const ag = p.agile;
    const s = dash.state;
    if (!s.tab) s.tab = 'board';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const sp = ag.currentSprint;
    const fv = forecastVelocity(ag);
    const doing = ag.backlog.filter((x) => x.status === 'doing').length;
    const done = sum(ag.backlog.filter((x) => x.status === 'done'), (x) => x.points);
    body.appendChild(el('p', { class: 'lede', text: 'Terminal IT (FIDS, passenger systems, airline interfaces) is delivered in two-week sprints from a prioritised backlog. The team’s velocity tells the product owner how much to commit. Press B anywhere to open this panel.' }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Current sprint', value: sp ? `Sprint ${sp.n}` : ag.sprints.length ? 'Between sprints' : 'Not started', foot: sp ? `day ${Math.max(0, p.day - sp.startDay)} of ${ag.sprintLength} · ${Math.round(sp.committed)} pts committed` : `${ag.sprints.length} sprints completed` }),
      kpi({ label: 'Forecast velocity', value: `${fv.toFixed(1)} pts`, foot: `plan ${ag.plannedVelocity.toFixed(1)} pts / sprint`, cls: ag.velocity.length && fv < ag.plannedVelocity * 0.8 ? 'warn' : '' }),
      kpi({ label: 'Points accepted', value: `${done.toFixed(0)} / ${ag.totalPoints.toFixed(0)}`, foot: `${Math.round((done / Math.max(1, ag.totalPoints)) * 100)}% of the release`, cls: 'good' }),
      kpi({ label: 'WIP (Doing)', value: `${doing} / ${ag.wip.doing}`, foot: `Review ${ag.backlog.filter((x) => x.status === 'review').length} / ${ag.wip.review}`, cls: doing >= ag.wip.doing ? 'warn' : '' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `Approach: ${p.approach} · ${ag.mode}` })]));
  },
};
