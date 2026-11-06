import { el, kpi, button, tabs, pill, slider, bar, confirmModal, fmtPKR, icon } from '../dom.js';
import { section, card, table, legend } from '../charts.js';
import { K } from '../charts2.js';
import { Project } from '../../pm/project.js';

/**
 * approach — Development Approach (Week 3, CLO1). Predictive, Agile or Hybrid for the
 * HDD programme: comparison, a tailoring questionnaire with a recommendation, the
 * per-package delivery split, and a what-if that runs all three approaches on the
 * current seed (an unmanaged run of the real engine).
 */

const APPROACHES = {
  predictive: {
    label: 'Predictive', tag: 'Plan-driven', icon: 'gantt',
    text: 'Define scope, schedule and cost up front, then execute and control against the baseline. Change goes through formal control.',
    cols: ['Detailed up-front plan', 'Baseline + change control', 'Feedback at stage gates', 'Single big-bang delivery'],
  },
  agile: {
    label: 'Agile', tag: 'Adaptive', icon: 'sprint',
    text: 'Deliver in short timeboxed increments from a prioritised backlog; scope flexes to protect time and cost; feedback every sprint.',
    cols: ['Vision + backlog, plan per sprint', 'Reprioritise the backlog', 'Feedback every sprint', 'Frequent increments'],
  },
  hybrid: {
    label: 'Hybrid', tag: 'Tailored', icon: 'fork',
    text: 'Combine them: plan-driven for the physical, safety-critical works; agile for software and systems where requirements are discovered.',
    cols: ['Baseline for civil works, backlog for IT', 'Formal for capital works, backlog for IT', 'Gates + sprint reviews', 'Phased handover'],
  },
};
const ROWS = ['Planning', 'Handling change', 'Feedback', 'Delivery'];
const TABS = [
  { id: 'choose', label: 'Choose & compare', icon: 'fork' },
  { id: 'tailor', label: 'Tailoring workshop', icon: 'gauge' },
  { id: 'whatif', label: 'What-if run', icon: 'stats' },
];
const FACTORS = [
  { id: 'stab', label: 'Requirements are stable and well understood', p: 1, def: 4, note: 'High favours predictive' },
  { id: 'safe', label: 'Safety / regulatory rigour (certification, ICAO-style compliance)', p: 1, def: 5, note: 'High favours predictive' },
  { id: 'phys', label: 'Work is physical and hard to rework (concrete, asphalt, steel)', p: 1, def: 4, note: 'High favours predictive' },
  { id: 'disc', label: 'Needs are discovered by using early versions', p: -1, def: 3, note: 'High favours agile' },
  { id: 'incr', label: 'Value can be released in small increments', p: -1, def: 3, note: 'High favours agile' },
  { id: 'avail', label: 'Users and sponsor can give frequent feedback', p: -1, def: 3, note: 'High favours agile' },
];

function applyApproach(dash, id) {
  const sim = dash.sim;
  const p = dash.project;
  if (id === p.approach) return;
  if (typeof p.setApproach === 'function') {
    const res = p.setApproach(id);
    sim.toast && sim.toast((res && res.message) || `Approach set to ${APPROACHES[id].label}`, 'good');
    dash.rerender();
    return;
  }
  const lost = p.day > 0;
  confirmModal(`Switch to the ${APPROACHES[id].label} approach?`,
    `The approach shapes how the work packages are generated (which elements run as sprints), so the programme restarts with the same seed (${p.seed}) and difficulty.${lost ? ` You will lose the ${p.day} days of progress made so far — save a slot first if you want to return.` : ''}`,
    { okLabel: 'Restart with this approach', danger: lost }).then((ok) => {
    if (!ok) return;
    sim.newProject({ seed: p.seed, difficulty: p.difficulty, approach: id });
    sim.toast && sim.toast(`New programme: ${APPROACHES[id].label} approach`, 'good');
    dash.state.sel = undefined;
  });
}

function recommendation(vals) {
  let pred = 0; let agi = 0; let tp = 0; let ta = 0;
  for (const f of FACTORS) {
    const v = vals[f.id];
    if (f.p > 0) { pred += v; tp += 5; } else { agi += v; ta += 5; }
  }
  const P = pred / tp; const A = agi / ta;
  const diff = P - A;
  const id = diff > 0.28 ? 'predictive' : diff < -0.28 ? 'agile' : 'hybrid';
  return { P, A, id };
}

function choose(dash, pane) {
  const p = dash.project;
  const s = dash.state;
  const sel = s.sel || p.approach;
  pane.appendChild(el('div', { class: 'cp-approaches', role: 'radiogroup', 'aria-label': 'Development approach' }, Object.entries(APPROACHES).map(([id, a]) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': sel === id ? 'true' : 'false', class: `cp-ap ${sel === id ? 'sel' : ''} ${p.approach === id ? 'cur' : ''}`.trim(),
    onclick: () => { s.sel = id; dash.rerender(); },
  }, [
    el('div', { class: 'cp-ap-h' }, [icon(a.icon, 20), el('b', { text: a.label }), pill(a.tag, id === 'hybrid' ? 'gold' : 'muted'), p.approach === id ? pill('In use', 'ok') : null]),
    el('p', { text: a.text }),
  ]))));
  const a = APPROACHES[sel];
  const agileTasks = p.tasks.filter((t) => t.delivery === 'agile');
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card(`${a.label} at a glance`, [
      table(['Dimension', a.label], ROWS.map((r, i) => [r, a.cols[i]]), { dense: true }),
      el('p', { class: 'pm-note', text: sel === 'hybrid' ? 'Default for this programme: runway, terminal and tower are safety-critical and certified — plan them. The terminal IT stream is discovered with users — run it in sprints.' : sel === 'predictive' ? 'Every package, including IT, follows the baseline. Cheap to govern; slow to react when IT needs change.' : 'Everything is run as backlog and sprints. Fast feedback, but concrete and certification work cannot be incrementally re-planned without rework.' }),
      sel === p.approach ? el('div', { class: 'callout good' }, [icon('check', 16), el('span', { text: `${a.label} is the approach in use. ${agileTasks.length ? `${agileTasks.length} elements run as sprints.` : 'No elements run as sprints.'}` })])
        : button(`Apply ${a.label}`, () => applyApproach(dash, sel), { kind: 'primary', icon: 'check' }),
    ]),
    card('Side-by-side', [
      table(['', 'Predictive', 'Agile', 'Hybrid'], [
        ['Best when', 'Stable scope, heavy regulation', 'Uncertain, evolving needs', 'Mixed work in one programme'],
        ['Scope', 'Fixed, change-controlled', 'Flexible, time/cost fixed', 'Fixed core, flexible edge'],
        ['Cost certainty', 'High', 'Lower early', 'Medium'],
        ['Customer involvement', 'Gates and milestones', 'Continuous', 'Both'],
        ['Main risk', 'Late discovery', 'Scope creep, weak governance', 'Complexity of two systems'],
        ['At HDD', 'Runway, terminal fabric', 'Terminal IT stream', 'Whole programme'],
      ], { dense: true }),
    ]),
  ]));
  pane.appendChild(section('Delivery split in the live plan', 'work packages by delivery mode'));
  const by = new Map();
  for (const t of p.tasks) {
    const e = by.get(t.summaryId) || { id: t.summaryId, pred: 0, agi: 0 };
    if (t.delivery === 'agile') e.agi += 1; else e.pred += 1;
    by.set(t.summaryId, e);
  }
  pane.appendChild(el('div', { class: 'cp-split' }, p.summaries.map((sm) => {
    const e = by.get(sm.id) || { pred: 0, agi: 0 };
    const tot = e.pred + e.agi || 1;
    return el('div', { class: 'cp-split-row' }, [
      el('span', { class: 'cp-split-n', text: `${sm.code} ${sm.name}` }),
      el('span', { class: 'cp-split-bar', title: `${e.pred} predictive, ${e.agi} agile` }, [el('i', { class: 'pred', style: { width: `${(e.pred / tot) * 100}%` } }), el('i', { class: 'agi', style: { width: `${(e.agi / tot) * 100}%` } })]),
      el('small', { text: e.agi ? `${e.agi} agile · ${e.pred} predictive` : `${e.pred} predictive` }),
    ]);
  })));
  pane.appendChild(legend([{ label: 'Predictive', color: K.c2 }, { label: 'Agile (sprints)', color: K.c4 }]));
  pane.appendChild(el('div', { class: 'row actions-row' }, [button('Open Agile Delivery', () => dash.open('agile'), { icon: 'sprint' }), button('Open Life Cycle & Gates', () => dash.open('lifecycle'), { icon: 'cycle', kind: 'ghost' })]));
}

function tailor(dash, pane) {
  const s = dash.state;
  if (!s.f) s.f = Object.fromEntries(FACTORS.map((f) => [f.id, f.def]));
  const recBox = el('div', { class: 'cp-recbox', 'aria-live': 'polite' });
  const fill = () => {
    const rec = recommendation(s.f);
    const a = APPROACHES[rec.id];
    recBox.replaceChildren(
      el('div', { class: 'cp-rec' }, [el('b', { text: a.label }), pill(a.tag, 'gold')]),
      el('p', { text: a.text }),
      el('div', { class: 'cp-bars' }, [
        el('div', {}, [el('small', { text: `Predictive pull ${Math.round(rec.P * 100)}%` }), bar(rec.P, '', 'Predictive pull')]),
        el('div', {}, [el('small', { text: `Agile pull ${Math.round(rec.A * 100)}%` }), bar(rec.A, 'ok', 'Agile pull')]),
      ]),
    );
  };
  fill();
  pane.appendChild(el('p', { class: 'lede', text: 'Tailoring means fitting the approach to the work, not the other way round. Rate the characteristics of the whole programme; the recommendation moves live. Then try rating just the terminal IT stream instead — the answer changes, which is why hybrid exists.' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Characteristics (1 = low, 5 = high)', FACTORS.map((f) => el('div', { class: 'cp-w' }, [
      el('span', {}, [el('b', { text: f.label }), el('small', { text: ` ${f.note}` })]),
      slider(1, 5, 1, s.f[f.id], (v) => { s.f[f.id] = v; fill(); }, (v) => String(v), { 'aria-label': f.label }),
    ]))),
    card('Recommendation', [
      recBox,
      el('p', { class: 'pm-note', text: 'Rule used: predictive and agile pull are the averages of their factors; a gap above 28 points picks one, otherwise hybrid. A teaching heuristic, not an official PMBOK tool.' }),
      button('Reset to airport defaults', () => { s.f = Object.fromEntries(FACTORS.map((f) => [f.id, f.def])); dash.rerender(); }, { small: true, kind: 'ghost' }),
    ], { cls: 'accent' }),
  ]));
  pane.appendChild(section('Tailoring rationale for HDD'));
  pane.appendChild(table(['Work', 'Mode', 'Why'], [
    ['Runway extension, pavements, AGL', 'Predictive', 'Physical, safety-critical, regulator-certified; rework is expensive.'],
    ['Terminal building and tower fabric', 'Predictive', 'Design-bid-build contracts with fixed scope; stage gates.'],
    ['Landside, utilities, drainage', 'Predictive', 'Dependencies on weather, land and utilities set the critical path.'],
    ['Terminal IT, FIDS, passenger apps', 'Agile', 'Needs discovered with users; value released in increments; backlog reprioritised.'],
    ['Governance, reporting, change control', 'Hybrid', 'Gates and baselines for the board, sprint reviews for the product owner.'],
  ], { dense: true }));
}

const cache = new WeakMap();

function runWhatIf(dash, state, onProgress, done) {
  const p = dash.project;
  const list = ['predictive', 'agile', 'hybrid'];
  const out = [];
  let i = 0;
  const next = () => {
    if (i >= list.length) { done(out); return; }
    const a = list[i++];
    onProgress(a);
    setTimeout(() => {
      try {
        const q = new Project({ seed: p.seed, difficulty: p.difficulty, approach: a });
        let n = 0;
        while (!q.finished && n < 3000) { q.step(); n++; }
        const sn = q.snapshot();
        out.push({ approach: a, finishDay: n, finished: q.finished, spi: sn.spi, cpi: sn.cpi, ac: q.ac, bac: q.bac, agileElements: q.tasks.filter((t) => t.delivery === 'agile').length, sprints: q.agile.sprints.length, velocity: sn.velocity });
      } catch (err) { out.push({ approach: a, error: String(err.message || err) }); }
      next();
    }, 30);
  };
  next();
}

function whatif(dash, pane) {
  const p = dash.project;
  const s = dash.state;
  const key = `${p.seed}|${p.difficulty}`;
  let res = cache.get(dash.sim) && cache.get(dash.sim).key === key ? cache.get(dash.sim).res : null;
  pane.appendChild(el('p', { class: 'lede', text: 'Run the real simulation engine three times on this seed and difficulty — once per approach — with no player decisions and no random decision cards. It is a controlled experiment: what does the approach alone change?' }));
  const status = el('span', { class: 'muted small', role: 'status', text: res ? 'Last run is shown below.' : 'Not run yet.' });
  const run = button(s.running ? 'Running…' : res ? 'Run again' : 'Run the experiment', () => {
    s.running = true;
    runWhatIf(dash, s, (a) => { status.textContent = `Simulating ${APPROACHES[a].label}…`; }, (out) => {
      cache.set(dash.sim, { key, res: out });
      s.running = false;
      dash.rerender();
    });
    run.disabled = true;
  }, { kind: 'primary', icon: 'play', disabled: !!s.running });
  pane.appendChild(el('div', { class: 'row actions-row' }, [run, status]));
  if (res) {
    pane.appendChild(table(['Approach', 'Sprint elements', 'Sprints run', 'Finish (day)', 'SPI', 'CPI', 'Final cost', 'Velocity'], res.map((r) => (r.error ? [APPROACHES[r.approach].label, '—', '—', '—', '—', '—', r.error, '—'] : [
      el('b', { text: APPROACHES[r.approach].label }), r.agileElements, r.sprints, `${r.finishDay}${r.finished ? '' : '+'}`, r.spi.toFixed(2), r.cpi.toFixed(2), fmtPKR(r.ac), r.velocity ? `${r.velocity.toFixed(1)} pts` : '—'])), { dense: true }));
    pane.appendChild(el('div', { class: 'callout' }, [icon('spark', 16), el('div', {}, [
      el('b', { text: 'Reading the result' }),
      el('p', { text: 'The approach changes how the terminal IT stream is delivered (sprint elements, velocity). The capital works — which drive the critical path and most of the cost — are predictive either way, so headline schedule and cost move little. That is the lesson: tailoring is about the right fit per package, not a programme-wide label.' }),
    ])]));
  }
  pane.appendChild(el('p', { class: 'pm-note', text: 'Simulated scenario data — unmanaged baseline runs of the in-browser engine.' }));
}

const VIEWS = { choose, tailor, whatif };

export const PANEL_APPROACH = {
  id: 'approach',
  autoRefresh: false,
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'choose';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    body.appendChild(el('p', { class: 'lede', text: 'Choosing the development approach is a tailoring decision made at the start and revisited at gates. The Hyderabad programme is hybrid by default: predictive for safety-critical civil works, agile for the terminal IT stream.' }));
    const agile = p.tasks.filter((t) => t.delivery === 'agile').length;
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Approach in use', value: APPROACHES[p.approach].label, foot: APPROACHES[p.approach].tag, cls: 'good' }),
      kpi({ label: 'Sprint elements', value: String(agile), foot: `of ${p.tasks.length} work elements` }),
      kpi({ label: 'Sprints so far', value: String(p.agile.sprints.length), foot: `sprint length ${p.agile.sprintLength} days` }),
      kpi({ label: 'Velocity (3-sprint avg)', value: p.agile.velocity.length ? (p.agile.velocity.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, p.agile.velocity.length)).toFixed(1) : '—', foot: `plan ${p.agile.plannedVelocity.toFixed(1)} pts` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Approach comparison is general guidance; figures are simulated.' })]));
  },
};
