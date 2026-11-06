import { el, kpi, button, tabs, pill, bar, icon } from '../dom.js';
import { section, card } from '../charts.js';
import COURSE from '../../data/course.json' with { type: 'json' };

/**
 * course — Course Map (all weeks). The 15-week matrix from course.json: every week
 * links to its panels, 3D mechanic, missions, quiz set and tour beat; CLO1–3 and the
 * five course objectives list the simulator features that serve them; the outline is
 * instructor-editable (kept in localStorage) and flagged as derived.
 */

const OUTLINE_KEY = 'hdd.course.outline.v1';
const TABS = [
  { id: 'matrix', label: 'Weekly matrix', icon: 'table' },
  { id: 'outcomes', label: 'CLOs & objectives', icon: 'target' },
  { id: 'outline', label: 'Outline (editable)', icon: 'scroll' },
];
const TITLES = {
  course: 'Course Map', foundations: 'PM Foundations', lifecycle: 'Life Cycle & Gates', charter: 'Project Charter', approach: 'Development Approach',
  scope: 'Scope & WBS', schedule: 'Schedule & CPM', cost: 'Cost & EVM', quality: 'Quality', risk: 'Risk Register', procurement: 'Procurement',
  team: 'Team & Resources', stakeholders: 'Stakeholders', msproject: 'MS Project', control: 'Change Control', forecast: 'Monte Carlo',
  agile: 'Agile Delivery', aipm: 'AI in PM', operations: 'Operations', missions: 'Missions', closing: 'Closing', cases: 'Case Studies',
  assess: 'Quiz', present: 'Present', session: 'Session',
};

const num = (s) => parseInt(String(s).replace(/\D+/g, ''), 10);

function readOutline() {
  try { return window.localStorage.getItem(OUTLINE_KEY); } catch { return null; }
}
function writeOutline(text) {
  try {
    if (text === null) window.localStorage.removeItem(OUTLINE_KEY);
    else window.localStorage.setItem(OUTLINE_KEY, text);
    return true;
  } catch { return false; }
}
function derivedOutline() {
  return COURSE.weeks.map((w) => `Week ${w.week} — ${w.topic}`).join('\n');
}

/** Per-week progress from missions, quiz sets and panels opened. */
function weekProgress(dash, w) {
  const game = dash.sim.game || {};
  const missions = game.missions || [];
  const track = game.track || {};
  const parts = [];
  const mine = (w.missions || []).map((id) => missions.find((m) => m.id === id)).filter(Boolean);
  const mDone = mine.filter((m) => m.status === 'completed').length;
  if (mine.length) parts.push(mDone / mine.length);
  const quiz = track.quiz || {};
  const key = Object.keys(quiz).find((k) => num(k) === num(w.quizSet));
  const q = key ? quiz[key] : null;
  parts.push(q && q.total ? Math.min(1, q.best / q.total) : 0);
  const seen = new Set(track.panels || []);
  const pans = w.panels || [];
  const pSeen = pans.filter((p) => seen.has(p) || p === dash.openId).length;
  if (pans.length) parts.push(pSeen / pans.length);
  const value = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  return { value, mDone, mTotal: mine.length, quiz: q, pSeen, pTotal: pans.length, seen };
}

function startTour(dash, beatId) {
  const sim = dash.sim;
  const idx = sim.tour && sim.tour.beats ? sim.tour.beats.findIndex((b) => b.id === beatId) : -1;
  if (idx < 0) { sim.toast && sim.toast('That tour beat is not available.', 'warn'); return; }
  dash.close();
  sim.setMode('tour');
  sim.tour.goTo(idx);
}

function panelChip(dash, id, seen) {
  return el('button', {
    type: 'button', class: `cp-chip ${seen ? 'seen' : ''}`.trim(), title: `Open ${TITLES[id] || id}${seen ? ' (visited)' : ''}`,
    onclick: () => dash.open(id),
  }, [seen ? icon('check', 11) : null, el('span', { text: TITLES[id] || id })]);
}

function matrix(dash, pane) {
  const sim = dash.sim;
  const beats = (sim.tour && sim.tour.beats) || [];
  const proj = dash.project;
  const currentWeek = Math.min(15, Math.max(1, Math.floor(((proj ? proj.day : 0) / Math.max(1, proj ? proj.baselineDuration : 1)) * 15) + 1));
  const head = el('div', { class: 'cp-week cp-week-head', role: 'row' }, ['Wk', 'Topic & 3D mechanic', 'Panels', 'Missions · quiz', 'Tour beat', 'CLO · PMBOK 8 domain', 'Progress'].map((h) => el('div', { role: 'columnheader', text: h })));
  const list = el('div', { class: 'cp-weeks', role: 'table', 'aria-label': 'Fifteen-week course matrix' }, [head]);
  const open = dash.state.openWeek;
  for (const w of COURSE.weeks) {
    const pr = weekProgress(dash, w);
    const beat = beats.find((b) => b.id === w.tourBeat);
    const row = el('div', { class: `cp-week ${open === w.week ? 'open' : ''} ${w.week === dash.state.focusWeek ? 'focus' : ''}`.trim(), role: 'row' }, [
      el('div', { class: 'cp-wk', role: 'cell' }, [el('b', { text: String(w.week) }), w.week === currentWeek ? el('small', { text: 'now' }) : null]),
      el('div', { class: 'cp-topic', role: 'cell' }, [
        el('div', { class: 'cp-topic-t', text: w.topic }),
        el('div', { class: 'cp-mech' }, [icon('layers', 12), el('span', { text: w.mechanic })]),
      ]),
      el('div', { class: 'cp-chips', role: 'cell' }, w.panels.map((p) => panelChip(dash, p, pr.seen.has(p)))),
      el('div', { class: 'cp-mq', role: 'cell' }, [
        el('button', { type: 'button', class: 'cp-link', onclick: () => dash.open('missions'), title: 'Open Missions' }, [`${(w.missions || []).join(' · ') || '—'}`]),
        el('button', { type: 'button', class: 'cp-link', onclick: () => dash.open('assess'), title: 'Open the quiz' }, [`Quiz ${w.quizSet}${pr.quiz && pr.quiz.total ? ` · ${pr.quiz.best}/${pr.quiz.total}` : ''}`]),
      ]),
      el('div', { role: 'cell' }, [
        el('button', { type: 'button', class: 'action ghost small cp-tourbtn', onclick: () => startTour(dash, w.tourBeat), title: beat ? `Start the tour at “${beat.title}”` : 'Start tour' }, [icon('play', 12), el('span', { text: beat ? beat.title : w.tourBeat })]),
      ]),
      el('div', { class: 'cp-tags', role: 'cell' }, [...w.clo.map((c) => pill(c, 'clo')), el('small', { text: w.domain })]),
      el('div', { class: 'cp-prog', role: 'cell' }, [
        bar(pr.value, pr.value >= 0.99 ? 'ok' : '', `Week ${w.week} progress`),
        el('small', { text: `${Math.round(pr.value * 100)}% · ${pr.mDone}/${pr.mTotal} missions · ${pr.pSeen}/${pr.pTotal} panels` }),
      ]),
    ]);
    list.appendChild(row);
  }
  pane.appendChild(list);
  pane.appendChild(el('p', { class: 'pm-note', text: 'Progress per week = average of missions completed, best quiz score for the week’s set, and panels opened. “Now” marks the week that matches the project clock (the 15 course weeks are spread evenly over the baseline duration).' }));
}

function featureChips(dash, feats) {
  const out = [];
  for (const f of feats) {
    const [kind, rest] = f.includes(':') ? [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)] : ['', f];
    if (kind === 'panels') out.push(...rest.split(',').map((p) => panelChip(dash, p.trim(), false)));
    else if (kind === 'missions') out.push(el('button', { type: 'button', class: 'cp-chip', onclick: () => dash.open('missions'), title: 'Open Missions' }, [`Missions ${rest.split(',').join(' ')}`]));
    else if (kind === 'quiz') out.push(el('button', { type: 'button', class: 'cp-chip', onclick: () => dash.open('assess'), title: 'Open the quiz' }, [`Quiz ${rest}`]));
    else if (kind === 'tour') out.push(...rest.split(',').map((b) => el('button', { type: 'button', class: 'cp-chip tour', onclick: () => startTour(dash, b.trim()), title: 'Start the tour here' }, [icon('play', 10), `${b.trim()}`])));
    else out.push(el('span', { class: 'cp-chip plain', text: kind ? `${kind}: ${rest}` : rest }));
  }
  return el('div', { class: 'cp-chips' }, out);
}

function outcomes(dash, pane) {
  const game = dash.sim.game || {};
  const done = new Set((game.missions || []).filter((m) => m.status === 'completed').map((m) => m.id));
  pane.appendChild(section('Course learning outcomes', COURSE.textbook));
  const grid = el('div', { class: 'pm-grid c3' });
  for (const c of COURSE.clos) {
    const ms = (c.features.find((f) => f.startsWith('missions:')) || '').replace('missions:', '').split(',').filter(Boolean);
    const frac = ms.length ? ms.filter((m) => done.has(m)).length / ms.length : 0;
    grid.appendChild(card(c.id, [
      el('p', { text: c.text }),
      el('div', { class: 'cp-prog' }, [bar(frac, frac >= 0.99 ? 'ok' : '', `${c.id} mission progress`), el('small', { text: `${ms.filter((m) => done.has(m)).length}/${ms.length} linked missions complete` })]),
      featureChips(dash, c.features),
    ], { cls: 'accent' }));
  }
  pane.appendChild(grid);
  pane.appendChild(section('Course objectives', 'five objectives, each served by named features'));
  const objs = el('div', { class: 'pm-grid c2' });
  for (const o of COURSE.objectives) {
    objs.appendChild(card(`${o.id} · ${o.clo.join(', ')}`, [
      el('p', { text: o.text }),
      el('ul', { class: 'cp-feat' }, o.features.map((f) => el('li', { text: f }))),
    ]));
  }
  pane.appendChild(objs);
}

function outline(dash, pane) {
  const s = dash.state;
  const saved = readOutline();
  const isRole = dash.sim.settings && dash.sim.settings.get && dash.sim.settings.get('role') === 'instructor';
  pane.appendChild(el('div', { class: 'callout warn' }, [icon('warning', 16), el('div', {}, [
    el('b', { text: 'Derived — replace with official outline.' }),
    el('p', { text: `${COURSE.derivedFrom}. Edit the text below to match the university’s approved outline; it is stored only in this browser (localStorage) and never leaves the device.` }),
  ])]));
  const ta = el('textarea', { class: 'cp-outline', rows: 16, spellcheck: 'false', 'aria-label': 'Course outline text', readonly: !isRole && s.locked !== false ? true : null });
  ta.value = s.draft !== undefined ? s.draft : saved !== null ? saved : derivedOutline();
  ta.addEventListener('input', () => { s.draft = ta.value; });
  const status = el('span', { class: 'muted small', role: 'status', text: saved !== null ? 'Showing your saved outline.' : 'Showing the outline derived from the course map.' });
  const edit = el('div', { class: 'row actions-row' });
  const unlock = button(s.locked === false || isRole ? 'Editing enabled' : 'Enable editing (instructor)', () => { s.locked = false; dash.rerender(); }, { icon: 'scroll', kind: 'ghost', disabled: s.locked === false || isRole });
  edit.append(
    unlock,
    button('Save outline', () => {
      const ok = writeOutline(ta.value);
      s.draft = undefined;
      status.textContent = ok ? `Saved ${ta.value.split('\n').filter(Boolean).length} lines to this browser.` : 'Browser storage is blocked — the outline was not saved.';
      dash.sim.toast && dash.sim.toast(ok ? 'Course outline saved' : 'Could not save outline', ok ? 'good' : 'warn');
    }, { kind: 'primary', icon: 'check' }),
    button('Reset to derived', () => { writeOutline(null); s.draft = undefined; dash.rerender(); }, { icon: 'cycle', kind: 'ghost' }),
    status,
  );
  pane.append(ta, edit);
  pane.appendChild(section('Preview'));
  const lines = ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
  pane.appendChild(el('ol', { class: 'cp-preview' }, lines.slice(0, 40).map((l) => el('li', { text: l.replace(/^Week\s*\d+\s*[—:-]\s*/i, '') }))));
}

export const PANEL_COURSE = {
  id: 'course',
  render(dash, body, head) {
    const s = dash.state;
    if (!s.tab) s.tab = 'matrix';
    const game = dash.sim.game || {};
    const missions = game.missions || [];
    const track = game.track || {};
    const weeks = COURSE.weeks.map((w) => weekProgress(dash, w));
    const overall = weeks.reduce((a, b) => a + b.value, 0) / weeks.length;
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    body.appendChild(el('p', { class: 'lede', text: `${COURSE.title}. Fifteen weeks follow ${COURSE.textbook}: every week maps to simulator panels, a 3D mechanic, missions, a weekly quiz set and a guided-tour beat. Click any chip to jump straight there.` }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Course progress', value: `${Math.round(overall * 100)}%`, foot: 'missions · quizzes · panels', cls: overall > 0.5 ? 'good' : '' }),
      kpi({ label: 'Missions complete', value: `${missions.filter((m) => m.status === 'completed').length} / ${missions.length}`, foot: `${missions.filter((m) => m.status === 'active').length} active` }),
      kpi({ label: 'Quiz sets taken', value: `${Object.keys(track.quiz || {}).length} / ${COURSE.weeks.length}`, foot: 'best score counts' }),
      kpi({ label: 'Panels visited', value: `${new Set(track.panels || []).size} / 25`, foot: `Project day ${dash.project ? dash.project.day : 0}` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    if (s.tab === 'matrix') matrix(dash, pane);
    else if (s.tab === 'outcomes') outcomes(dash, pane);
    else outline(dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `Textbook: ${COURSE.textbook}` })]));
  },
};
