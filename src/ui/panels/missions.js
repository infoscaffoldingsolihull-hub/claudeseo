import { el, kpi, button, tabs, pill, bar, field, icon } from '../dom.js';
import { section, card, table } from '../charts.js';
import { radarChart, K } from '../charts2.js';
import { LEVELS } from '../../game/scoring.js';

/**
 * missions — Missions (all weeks). The campaign missions with live objective progress,
 * XP and levels (Junior PM to Programme Director), badges, the closure scorecard and the
 * local leaderboard, all read from sim.game.
 */

const TABS = [
  { id: 'missions', label: 'Missions', icon: 'flag' },
  { id: 'progress', label: 'XP, levels & badges', icon: 'star' },
  { id: 'scorecard', label: 'Scorecard', icon: 'gauge' },
  { id: 'board', label: 'Leaderboard', icon: 'people' },
];
const FILTERS = [['all', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['locked', 'Locked'], ['failed', 'Failed']];
const PHASE = { initiating: 'Initiating', planning: 'Planning', executing: 'Executing', monitoring: 'Monitoring & Controlling', closing: 'Closing' };
const STATUS_TONE = { completed: 'ok', active: 'gold', locked: 'muted', failed: 'bad' };

function game(dash) { return dash.sim.game; }
function safe(fn, d) { try { const v = fn(); return v === undefined ? d : v; } catch { return d; } }

function missionCard(dash, m, coach) {
  const s = dash.state;
  const done = m.objectives.filter((o) => o.done).length;
  const open = m.objectives.find((o) => !o.done);
  const hintIdx = s.hints && s.hints[m.id] !== undefined ? s.hints[m.id] : -1;
  return el('article', { class: `cp-mission ${m.status}` }, [
    el('header', { class: 'cp-mission-h' }, [
      el('span', { class: 'cp-mission-id', text: m.id }),
      el('h4', { text: m.name }),
      pill(m.status === 'completed' ? 'Completed' : m.status === 'locked' ? 'Locked' : m.status === 'failed' ? 'Failed' : 'Active', STATUS_TONE[m.status] || 'muted'),
    ]),
    el('div', { class: 'row' }, [
      ...m.clo.map((c) => pill(c, 'clo')), pill(PHASE[m.phase] || m.phase, 'indigo'), m.week ? pill(`Week ${m.week}`, 'muted') : null,
      el('span', { class: 'grow' }), el('b', { class: 'cp-xp', text: `+${m.xp} XP` }),
    ]),
    el('p', { class: 'cp-brief', text: m.brief }),
    el('ul', { class: 'cp-obj' }, m.objectives.map((o) => el('li', { class: o.done ? 'done' : '' }, [
      el('span', { class: 'cp-tick' }, [o.done ? icon('check', 13) : null]), el('span', { text: o.text }),
    ]))),
    el('div', { class: 'cp-obj-bar' }, [bar(done / m.objectives.length, m.status === 'completed' ? 'ok' : '', `${m.name} objectives`), el('small', { text: `${done}/${m.objectives.length} objectives` })]),
    m.status === 'active' ? el('div', { class: 'cp-coach' }, [
      coach && coach.next ? el('div', { class: 'pm-note' }, [el('b', { text: 'Next: ' }), coach.next]) : open ? el('div', { class: 'pm-note' }, [el('b', { text: 'Next: ' }), open.text]) : null,
      hintIdx >= 0 ? el('div', { class: 'cp-hint', role: 'status', text: m.hints[Math.min(hintIdx, m.hints.length - 1)] }) : null,
      button(hintIdx < 0 ? 'Coach me' : hintIdx + 1 < m.hints.length ? 'Another hint' : 'Repeat hint', () => {
        s.hints = s.hints || {};
        s.hints[m.id] = Math.min(m.hints.length - 1, hintIdx + 1 < m.hints.length ? hintIdx + 1 : hintIdx);
        dash.rerender();
      }, { small: true, kind: 'ghost', icon: 'spark' }),
    ]) : m.status === 'failed' ? el('div', { class: 'cp-hint', text: m.hints[m.hints.length - 1] }) : m.status === 'locked' ? el('small', { class: 'muted', text: `Unlocks in the ${PHASE[m.phase] || m.phase} focus area.` }) : null,
  ]);
}

function missionsView(dash, pane) {
  const g = game(dash);
  const s = dash.state;
  const f = s.filter || (g.missions.some((m) => m.status === 'active') ? 'active' : 'all');
  const coaching = safe(() => g.coaching(), []);
  const done = g.missions.filter((m) => m.status === 'completed').length;
  pane.appendChild(el('div', { class: 'pm-toolbar' }, [
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter missions' }, FILTERS.map(([id, label]) => {
      const n = id === 'all' ? g.missions.length : g.missions.filter((m) => m.status === id).length;
      return button(`${label} ${n}`, () => { s.filter = id; dash.rerender(); }, { small: true, kind: f === id ? 'primary' : 'ghost' });
    })),
    el('span', { class: 'grow' }),
    el('small', { class: 'muted', text: `${done} of ${g.missions.length} completed` }),
  ]));
  const list = g.missions.filter((m) => f === 'all' || m.status === f);
  if (!list.length) pane.appendChild(el('p', { class: 'pm-empty', text: 'No missions in this filter yet — advance the project to unlock more.' }));
  pane.appendChild(el('div', { class: 'cp-missions' }, list.map((m) => missionCard(dash, m, coaching.find((c) => c.mission === m.id)))));
}

function progressView(dash, pane) {
  const g = game(dash);
  const info = g.levelInfo || { level: 1, name: 'Junior PM', xp: g.xp, next: 400, nextName: 'Project Engineer', progress: 0 };
  pane.appendChild(card('Career ladder', [
    el('ol', { class: 'cp-ladder', 'aria-label': 'Levels' }, LEVELS.map((l) => el('li', { class: `${g.xp >= l.xp ? 'reached' : ''} ${info.level === l.level ? 'now' : ''}` }, [
      el('span', { class: 'cp-ladder-n', text: String(l.level) }), el('b', { text: l.name }), el('small', { text: `${l.xp} XP` }),
    ]))),
    el('div', { class: 'cp-obj-bar' }, [bar(info.progress, '', 'Progress to the next level'), el('small', { text: info.next ? `${g.xp} / ${info.next} XP — ${info.next - g.xp} more for ${info.nextName}` : `${g.xp} XP — top level reached` })]),
    el('p', { class: 'pm-note', text: 'XP comes from missions, good decision-card choices, milestones, site inspections, change decisions, approved gates and quiz answers. Harder difficulties multiply it.' }),
  ], { cls: 'accent' }));
  const owned = new Set(g.badges.map((b) => b.id));
  pane.appendChild(section('Badges', `${owned.size} of ${g.badgeDefs.length} earned`));
  pane.appendChild(el('div', { class: 'cp-badges' }, g.badgeDefs.map((b) => el('div', { class: `cp-badge ${owned.has(b.id) ? 'got' : ''}`, title: b.text }, [
    el('span', { class: 'cp-badge-i' }, [icon(owned.has(b.id) ? 'star' : 'shield', 22)]),
    el('b', { text: b.name }), el('small', { text: b.text }), pill(b.clo, owned.has(b.id) ? 'clo' : 'muted'),
  ]))));
}

function scorecardView(dash, pane) {
  const g = game(dash);
  const c = safe(() => g.scorecard(), null);
  if (!c) { pane.appendChild(el('p', { class: 'pm-empty', text: 'The scorecard is not available yet.' })); return; }
  const axes = Object.values(c.metrics).map((m) => ({ label: m.label.replace(/ \(.*\)/, '').replace('performance', 'perf.'), value: m.score / 100, target: 0.8 }));
  pane.appendChild(el('div', { class: 'pm-grid c21' }, [
    card('Closure scorecard (live)', [
      el('div', { class: 'cp-radar' }, [radarChart({ axes, size: 380, label: 'Scorecard radar' })]),
      el('small', { class: 'muted', text: 'Gold dashed ring = 80-point target. Scores are live estimates until the project closes.' }),
    ]),
    card('Grade', [
      el('div', { class: 'cp-grade' }, [el('b', { text: c.grade }), el('small', { text: `${c.overall} / 100` })]),
      ...['CLO1', 'CLO2', 'CLO3'].map((k) => el('div', { class: 'cp-clo' }, [
        el('div', { class: 'row between' }, [pill(k, 'clo'), el('b', { text: String(c.byClo[k]) })]), bar(c.byClo[k] / 100, c.byClo[k] >= 70 ? 'ok' : c.byClo[k] >= 50 ? 'warn' : 'bad', `${k} score`), el('small', { class: 'muted', text: c.cloLabels[k] }),
      ])),
    ], { cls: 'accent' }),
  ]));
  pane.appendChild(table(['Measure', 'Value', 'Score'], Object.values(c.metrics).map((m) => [m.label, Number.isFinite(m.value) ? (m.value > 3 ? m.value.toFixed(0) : m.value.toFixed(2)) : '—', el('span', { class: 'cp-score' }, [bar(m.score / 100, m.score >= 70 ? 'ok' : m.score >= 50 ? 'warn' : 'bad', m.label), el('b', { text: String(m.score) })])]), { dense: true }));
  const coaching = safe(() => g.coaching(), []).filter((x) => x.next);
  if (coaching.length) {
    pane.appendChild(section('Coaching', 'next objective per active mission'));
    pane.appendChild(el('ul', { class: 'cp-feat' }, coaching.slice(0, 6).map((x) => el('li', {}, [el('b', { text: `${x.name}: ` }), x.next]))));
  }
}

function boardView(dash, pane) {
  const g = game(dash);
  const s = dash.state;
  const rows = safe(() => g.leaderboard(), []);
  const p = dash.project;
  const name = s.name !== undefined ? s.name : safe(() => dash.sim.settings.get('studentName'), '') || '';
  const input = el('input', { type: 'text', maxlength: 24, placeholder: 'Your name or team', value: name, 'aria-label': 'Name for the leaderboard' });
  input.addEventListener('input', () => { s.name = input.value; });
  pane.appendChild(el('p', { class: 'lede', text: 'The leaderboard is local to this browser — nothing is uploaded. Score = XP + 25 × overall scorecard. Submit when you finish a run (or any time to bookmark progress).' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Submit this run', [
      el('div', { class: 'cp-submit' }, [
        field('Name', input),
        el('div', { class: 'pm-note', text: `Score now ${g.score} · level ${g.levelName} · day ${p.day} · seed ${p.seed} · ${p.difficulty}` }),
        button('Submit score', () => {
          const top = g.submitScore(input.value || undefined);
          dash.sim.toast && dash.sim.toast(`Score ${g.score} saved locally`, 'good');
          s.last = top.length;
          dash.rerender();
        }, { kind: 'primary', icon: 'flag' }),
      ]),
    ], { cls: 'accent' }),
    card('Top 10 on this device', rows.length ? [table(['#', 'Name', 'Score', 'Grade', 'Level', 'Seed · difficulty'], rows.map((r, i) => [i + 1, r.name, r.score, r.grade, r.level, `${r.seed} · ${r.difficulty}`]), { dense: true })] : [el('p', { class: 'pm-empty', text: 'No scores yet. Be the first.' })]),
  ]));
}

const VIEWS = { missions: missionsView, progress: progressView, scorecard: scorecardView, board: boardView };

export const PANEL_MISSIONS = {
  id: 'missions',
  render(dash, body, head) {
    const g = game(dash);
    const s = dash.state;
    if (!s.tab) s.tab = 'missions';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const info = g.levelInfo || {};
    const card_ = safe(() => g.scorecard(), null);
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Level', value: `Level ${g.level}`, foot: `${g.levelName} · ${g.xp} XP${info.next ? ` · ${info.next - g.xp} to ${info.nextName}` : ''}`, cls: 'good' }),
      kpi({ label: 'Score', value: String(g.score), foot: 'XP + scorecard bonus' }),
      kpi({ label: 'Missions', value: `${g.missions.filter((m) => m.status === 'completed').length} / ${g.missions.length}`, foot: `${g.missions.filter((m) => m.status === 'active').length} active` }),
      kpi({ label: 'Badges · grade', value: `${g.badges.length} / ${g.badgeDefs.length} · ${card_ ? card_.grade : '—'}`, foot: card_ ? `overall ${card_.overall}` : '' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Missions follow the project life cycle; objectives tick automatically as you do the work.' })]));
  },
};
