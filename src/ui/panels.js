import { el, clear, icon, t, tl, relabel, setLanguage } from './dom.js';
import { PANEL_COURSE } from './panels/course.js';
import { PANEL_FOUNDATIONS } from './panels/foundations.js';
import { PANEL_LIFECYCLE } from './panels/lifecycle.js';
import { PANEL_CHARTER } from './panels/charter.js';
import { PANEL_APPROACH } from './panels/approach.js';
import { PANEL_SCOPE } from './panels/scope.js';
import { PANEL_SCHEDULE } from './panels/schedule.js';
import { PANEL_COST } from './panels/cost.js';
import { PANEL_QUALITY } from './panels/quality.js';
import { PANEL_RISK } from './panels/risk.js';
import { PANEL_PROCUREMENT } from './panels/procurement.js';
import { PANEL_TEAM } from './panels/team.js';
import { PANEL_STAKEHOLDERS } from './panels/stakeholders.js';
import { PANEL_MSPROJECT } from './panels/msproject.js';
import { PANEL_CONTROL } from './panels/control.js';
import { PANEL_FORECAST } from './panels/forecast.js';
import { PANEL_AGILE } from './panels/agile.js';
import { PANEL_AIPM } from './panels/aipm.js';
import { PANEL_OPERATIONS } from './panels/operations.js';
import { PANEL_MISSIONS } from './panels/missions.js';
import { PANEL_CLOSING } from './panels/closing.js';
import { PANEL_CASES } from './panels/cases.js';
import { PANEL_ASSESS } from './panels/assess.js';
import { PANEL_PRESENT } from './panels/present.js';
import { PANEL_SESSION } from './panels/session.js';

/**
 * The dashboard shell: a left rail grouped by course flow, and one panel
 * container that hosts whichever panel module is open.
 *
 * Panel modules (src/ui/panels/<id>.js) export
 *   const PANEL_<ID> = { id, render(dash, body, head), onOpen?(dash), onClose?(dash), tick?(dash),
 *                        autoRefresh?: boolean, count?(dash) (assess), focusChangeForm?(dash) (control) }
 * and receive `dash` — this Dashboard — with `sim`, `project`, `state`, `spec`,
 * `rerender()`, `tag()`, `simBadge()`, `open()`, `close()`.
 */

export const GROUPS = [
  { id: 'foundations', key: 'group.foundations', weeks: 'Weeks 1–3' },
  { id: 'plan', key: 'group.plan', weeks: 'Weeks 4–9' },
  { id: 'deliver', key: 'group.deliver', weeks: 'Weeks 10–12' },
  { id: 'close', key: 'group.close', weeks: 'Weeks 13–15' },
  { id: 'system', key: 'group.system', weeks: '' },
];

const ALL = ['CLO1', 'CLO2', 'CLO3'];

/** The 25 panels, in rail order (course flow). */
export const PANELS = [
  { id: 'course', group: 'foundations', title: 'Course Map', sub: '15 weeks, three CLOs, and where each lives in the simulator', icon: 'map', week: 1, clo: ALL, domain: 'Course design', wide: true, file: 'panels/course.js' },
  { id: 'foundations', group: 'foundations', title: 'PM Foundations', sub: 'Projects, programmes, portfolios and the twelve principles', icon: 'book', week: 1, clo: ['CLO1'], domain: 'Principles', wide: false, file: 'panels/foundations.js' },
  { id: 'lifecycle', group: 'foundations', title: 'Life Cycle & Gates', sub: 'Phases, stage gates and process groups as focus areas', icon: 'cycle', week: 2, clo: ['CLO1'], domain: 'Development Approach & Life Cycle', wide: true, file: 'panels/lifecycle.js' },
  { id: 'charter', group: 'foundations', title: 'Project Charter', sub: 'Business case, objectives, success criteria and authority', icon: 'scroll', week: 3, clo: ['CLO1', 'CLO2'], domain: 'Initiating · Integration', wide: false, file: 'panels/charter.js' },
  { id: 'approach', group: 'foundations', title: 'Development Approach', sub: 'Predictive, agile or hybrid — tailoring for an airport', icon: 'fork', week: 3, clo: ['CLO1'], domain: 'Development Approach & Life Cycle', wide: false, file: 'panels/approach.js' },
  { id: 'scope', group: 'plan', title: 'Scope & WBS', sub: 'Requirements, work breakdown structure and WBS dictionary', icon: 'tree', week: 4, clo: ['CLO2'], domain: 'Planning · Scope', wide: true, file: 'panels/scope.js' },
  { id: 'schedule', group: 'plan', title: 'Schedule & CPM', sub: 'Gantt, network diagram, PERT and the critical path', icon: 'gantt', week: 5, clo: ['CLO2'], domain: 'Planning · Schedule', wide: true, file: 'panels/schedule.js' },
  { id: 'cost', group: 'plan', title: 'Cost & Earned Value', sub: 'Budget, S-curve, PV · EV · AC, CPI, SPI and EAC', icon: 'coins', week: 6, clo: ['CLO2', 'CLO3'], domain: 'Measurement · Cost', wide: true, file: 'panels/cost.js' },
  { id: 'quality', group: 'plan', title: 'Quality Management', sub: 'Control charts, NCRs, Pareto and cost of quality', icon: 'gauge', week: 7, clo: ['CLO2'], domain: 'Delivery · Quality', wide: true, file: 'panels/quality.js' },
  { id: 'risk', group: 'plan', title: 'Risk Register', sub: 'Probability × impact, EMV, decision trees and responses', icon: 'warning', week: 7, clo: ['CLO2', 'CLO3'], domain: 'Uncertainty', wide: true, file: 'panels/risk.js' },
  { id: 'procurement', group: 'plan', title: 'Procurement', sub: 'Make-or-buy, contract types, bid evaluation and claims', icon: 'truck', week: 8, clo: ['CLO2'], domain: 'Planning · Procurement', wide: true, file: 'panels/procurement.js' },
  { id: 'team', group: 'plan', title: 'Team & Resources', sub: 'Staffing, histograms, levelling and RACI', icon: 'people', week: 8, clo: ['CLO2'], domain: 'Team', wide: true, file: 'panels/team.js' },
  { id: 'stakeholders', group: 'plan', title: 'Stakeholders', sub: 'Power–interest, salience, engagement and communications', icon: 'target', week: 9, clo: ['CLO2', 'CLO3'], domain: 'Stakeholders', wide: true, file: 'panels/stakeholders.js' },
  { id: 'msproject', group: 'plan', title: 'MS Project & Exports', sub: 'MSPDI XML, CSV round-trip and tool workflow', icon: 'table', week: 9, clo: ['CLO2'], domain: 'Planning · Tools', wide: false, file: 'panels/msproject.js' },
  { id: 'control', group: 'deliver', title: 'Integrated Change Control', sub: 'Change requests, CCB votes, gates and baselines', icon: 'shuffle', week: 10, clo: ['CLO3'], domain: 'Measurement · Integration', wide: true, file: 'panels/control.js' },
  { id: 'forecast', group: 'deliver', title: 'Monte Carlo Forecast', sub: 'Probabilistic finish and cost, tornado sensitivity', icon: 'dice', week: 10, clo: ['CLO3'], domain: 'Uncertainty · Measurement', wide: true, file: 'panels/forecast.js' },
  { id: 'agile', group: 'deliver', title: 'Agile Delivery', sub: 'Backlog, sprints, Kanban board and burndown', icon: 'sprint', week: 11, clo: ['CLO2', 'CLO3'], domain: 'Development Approach · Delivery', wide: true, file: 'panels/agile.js' },
  { id: 'aipm', group: 'deliver', title: 'AI in Project Management', sub: 'MEHRAN, predictive analytics and responsible AI', icon: 'spark', week: 12, clo: ['CLO3'], domain: 'Project Work', wide: false, file: 'panels/aipm.js' },
  { id: 'operations', group: 'deliver', title: 'Operations & Benefits', sub: 'Handover, live airside KPIs and benefits realisation', icon: 'plane', week: 12, clo: ['CLO3'], domain: 'Delivery · Benefits', wide: true, file: 'panels/operations.js' },
  { id: 'missions', group: 'deliver', title: 'Missions', sub: 'Objectives, XP, badges and scorecard', icon: 'flag', week: null, clo: ALL, domain: 'Project Work', wide: false, file: 'panels/missions.js' },
  { id: 'closing', group: 'close', title: 'Closing & Lessons', sub: 'Acceptance, close-out report and lessons learned', icon: 'flagCheck', week: 13, clo: ['CLO3'], domain: 'Closing · Integration', wide: false, file: 'panels/closing.js' },
  { id: 'cases', group: 'close', title: 'Case Studies', sub: 'Airport and megaproject cases to compare against', icon: 'case', week: 14, clo: ['CLO1', 'CLO3'], domain: 'Principles', wide: true, file: 'panels/cases.js' },
  { id: 'assess', group: 'close', title: 'Assessment & Quiz', sub: 'Weekly quizzes mapped to CLOs and domains', icon: 'quiz', week: 15, clo: ALL, domain: 'Assessment', wide: true, file: 'panels/assess.js' },
  { id: 'present', group: 'close', title: 'Present & Report', sub: 'Status report, stand-up and conference presenter', icon: 'present', week: 15, clo: ['CLO3'], domain: 'Measurement · Communications', wide: true, file: 'panels/present.js' },
  { id: 'session', group: 'system', title: 'Session & Settings', sub: 'Save, load, export, graphics, audio and accessibility', icon: 'gear', week: null, clo: [], domain: 'System', wide: true, file: 'panels/session.js' },
];

const MODULES = {
  course: PANEL_COURSE, foundations: PANEL_FOUNDATIONS, lifecycle: PANEL_LIFECYCLE, charter: PANEL_CHARTER,
  approach: PANEL_APPROACH, scope: PANEL_SCOPE, schedule: PANEL_SCHEDULE, cost: PANEL_COST, quality: PANEL_QUALITY,
  risk: PANEL_RISK, procurement: PANEL_PROCUREMENT, team: PANEL_TEAM, stakeholders: PANEL_STAKEHOLDERS,
  msproject: PANEL_MSPROJECT, control: PANEL_CONTROL, forecast: PANEL_FORECAST, agile: PANEL_AGILE, aipm: PANEL_AIPM,
  operations: PANEL_OPERATIONS, missions: PANEL_MISSIONS, closing: PANEL_CLOSING, cases: PANEL_CASES,
  assess: PANEL_ASSESS, present: PANEL_PRESENT, session: PANEL_SESSION,
};

const CLO_TEXT = {
  CLO1: 'CLO1 — explain project-management concepts, principles and life cycles',
  CLO2: 'CLO2 — apply planning tools: scope, schedule, cost, quality, risk, procurement and stakeholders',
  CLO3: 'CLO3 — monitor, control, forecast and communicate project performance',
};

export class Dashboard {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.openId = null;
    this.states = {};
    this.registry = PANELS;
    this._lastInteraction = -1e9;
    this._pointerDown = false;
    this._sinceRender = 0;
    this._sinceTick = 0;
    this._sinceBadges = 1;
    this._renderedDay = -1;
    this._tagUsed = false;
    setLanguage(sim.settings?.get?.('language'));

    this._buildRail();
    this._buildPanel();

    const bus = sim.bus;
    if (bus) {
      bus.on('project:new', () => { this.states = {}; if (this.openId) this.rerender(); });
      bus.on('settings:changed', ({ path }) => {
        if (path === 'language' || path === '*') {
          setLanguage(sim.settings.get('language'));
          relabel(this.rail);
          if (this.openId) this._setHead(this.spec);
        }
      });
    }
  }

  /* ---------------------------------------------------------------- build */

  _buildRail() {
    this.rail = el('nav', { class: 'rail', 'aria-label': 'Dashboard panels' });
    this.railToggle = el('button', {
      type: 'button', class: 'rail-toggle', 'aria-expanded': 'false', title: 'Show panel names',
      'aria-label': 'Show panel names', onclick: () => this.setExpanded(!this.rail.classList.contains('expanded')),
    }, [icon('menu', 18), tl('hud.dashboard', 'span', { class: 'rail-label' })]);
    this.rail.appendChild(this.railToggle);
    this.railScroll = el('div', { class: 'rail-scroll', role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': 'Panels by course flow' });
    this.buttons = new Map();
    for (const g of GROUPS) {
      const items = PANELS.filter((p) => p.group === g.id);
      if (!items.length) continue;
      const group = el('div', { class: 'rail-group', role: 'group', 'aria-label': t(g.key) }, [
        el('div', { class: 'rail-group-label', title: g.weeks || null }, [tl(g.key), g.weeks ? el('small', { text: g.weeks }) : null]),
      ]);
      for (const p of items) {
        const b = el('button', {
          type: 'button', class: 'rail-btn', dataset: { panel: p.id }, tabindex: '-1',
          'aria-label': p.title, 'aria-pressed': 'false', 'data-i18n-title': `panel.${p.id}`, title: p.title,
          onclick: () => this.toggle(p.id),
        }, [
          icon(p.icon, 18),
          el('span', { class: 'rail-label' }, [tl(`panel.${p.id}`), p.week ? el('small', { text: `W${p.week}` }) : null]),
          el('span', { class: 'tip', 'aria-hidden': 'true' }, [tl(`panel.${p.id}`), p.week ? el('em', { text: `Week ${p.week}` }) : null]),
          el('span', { class: 'rail-badge', 'aria-hidden': 'true' }),
        ]);
        this.buttons.set(p.id, b);
        group.appendChild(b);
      }
      this.railScroll.appendChild(group);
    }
    const first = this.buttons.values().next().value;
    if (first) first.tabIndex = 0;
    this.railScroll.addEventListener('keydown', (e) => this._railKey(e));
    this.railScroll.addEventListener('focusin', (e) => {
      const b = e.target.closest && e.target.closest('.rail-btn');
      if (!b) return;
      for (const x of this.buttons.values()) x.tabIndex = x === b ? 0 : -1;
    });
    this.rail.appendChild(this.railScroll);
    this.root.appendChild(this.rail);
  }

  _railKey(e) {
    const list = [...this.buttons.values()];
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    let j = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % list.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j >= 0) {
      e.preventDefault();
      e.stopPropagation();
      list[j].focus();
    }
  }

  setExpanded(on) {
    this.rail.classList.toggle('expanded', on);
    document.body.classList.toggle('rail-expanded', on);
    this.railToggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    this.railToggle.title = on ? 'Hide panel names' : 'Show panel names';
  }

  _buildPanel() {
    const jump = el('select', { class: 'panel-jump', 'aria-label': 'Jump to panel' }, PANELS.map((p) => el('option', { value: p.id }, [p.title])));
    jump.addEventListener('change', () => this.open(jump.value));
    this.jump = jump;
    this.headIcon = el('span', { class: 'panel-head-icon', 'aria-hidden': 'true' });
    this.headTitle = el('h2', { id: 'panel-title', dir: 'auto' });
    this.headSub = el('div', { class: 'sub' });
    this.headTags = el('div', { class: 'panel-tags' });
    this.headExtra = el('div', { class: 'panel-head-extra row' });
    this.body = el('div', { class: 'panel-body', tabindex: '-1' });
    this.panel = el('section', { class: 'panel', role: 'region', 'aria-labelledby': 'panel-title', 'aria-hidden': 'true' }, [
      el('header', { class: 'panel-head' }, [
        this.headIcon,
        el('div', { class: 'panel-titles' }, [this.headTitle, this.headSub, this.headTags]),
        el('div', { class: 'grow' }),
        jump,
        this.headExtra,
        el('button', { type: 'button', class: 'icon-btn panel-close', title: 'Close (Esc)', 'aria-label': 'Close panel', onclick: () => this.close() }, [icon('close', 16)]),
      ]),
      this.body,
    ]);
    const mark = () => { this._lastInteraction = performance.now(); };
    this.panel.addEventListener('pointerdown', () => { this._pointerDown = true; mark(); });
    window.addEventListener('pointerup', () => { this._pointerDown = false; });
    for (const ev of ['wheel', 'keydown', 'input', 'pointermove', 'scroll']) this.panel.addEventListener(ev, mark, { passive: true, capture: true });
    this.root.appendChild(this.panel);
  }

  /* ------------------------------------------------------------ public API */

  get panelIds() {
    return PANELS.map((p) => p.id);
  }

  get project() {
    return this.sim.project;
  }

  get spec() {
    return PANELS.find((p) => p.id === this.openId) || null;
  }

  get module() {
    return this.openId ? MODULES[this.openId] : null;
  }

  /** Per-panel scratch object that survives re-renders (reset on a new project). */
  get state() {
    const id = this.openId || '_';
    if (!this.states[id]) this.states[id] = {};
    return this.states[id];
  }

  stateFor(id) {
    if (!this.states[id]) this.states[id] = {};
    return this.states[id];
  }

  toggle(id) {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  open(id) {
    const spec = PANELS.find((p) => p.id === id);
    if (!spec) return false;
    if (this.sim.mode === 'tour' && this.sim.setMode) this.sim.setMode('manager');
    const previous = this.openId;
    if (previous && previous !== id) this._callHook(previous, 'onClose');
    this.openId = id;
    this.panel.classList.add('open');
    this.panel.classList.toggle('wide', !!spec.wide);
    this.panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    this._setHead(spec);
    for (const [pid, b] of this.buttons) {
      b.classList.toggle('active', pid === id);
      b.setAttribute('aria-pressed', pid === id ? 'true' : 'false');
    }
    this.jump.value = id;
    if (window.innerWidth <= 780 && this.rail.classList.contains('expanded')) this.setExpanded(false);
    this.body.scrollTop = 0;
    if (previous !== id) this._callHook(id, 'onOpen');
    this.render();
    if (previous !== id && this.sim.bus) this.sim.bus.emit('panel:opened', { id });
    return true;
  }

  close() {
    const id = this.openId;
    if (!id) return;
    this._callHook(id, 'onClose');
    this.openId = null;
    this.panel.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
    for (const b of this.buttons.values()) {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    }
    if (this.panel.contains(document.activeElement)) {
      const b = this.buttons.get(id);
      if (b) b.focus({ preventScroll: true });
    }
    if (this.sim.bus) this.sim.bus.emit('panel:closed', { id });
  }

  rerender() {
    this.render();
  }

  render() {
    if (!this.openId) return;
    const mod = this.module;
    const scroll = this.body.scrollTop;
    clear(this.body);
    clear(this.headExtra);
    this._tagUsed = false;
    this._renderedDay = this.project ? this.project.day : -1;
    this._sinceRender = 0;
    if (mod && typeof mod.render === 'function') {
      try {
        mod.render(this, this.body, this.headExtra);
      } catch (err) {
        console.error(`[dashboard] panel "${this.openId}" failed to render`, err);
        clear(this.body).appendChild(el('div', { class: 'callout bad' }, [
          el('b', { text: 'This panel hit an error while rendering.' }),
          el('p', { text: String(err && err.message ? err.message : err) }),
        ]));
      }
    }
    this.headTags.style.display = this._tagUsed ? 'none' : '';
    this.body.scrollTop = scroll;
  }

  /** Throttled refresh: panel tick hooks at 4 Hz, re-render on new sim days — never mid-interaction. */
  tick(dt = 0.016) {
    this._sinceBadges += dt;
    if (this._sinceBadges > 1) {
      this._sinceBadges = 0;
      this._updateBadges();
    }
    if (!this.openId) return;
    const mod = this.module;
    this._sinceTick += dt;
    this._sinceRender += dt;
    if (mod && mod.tick && this._sinceTick >= 0.25) {
      this._sinceTick = 0;
      try { mod.tick(this); } catch (err) { console.error(`[dashboard] tick ${this.openId}`, err); }
    }
    if (mod && mod.autoRefresh === false) return;
    const spec = this.spec;
    const interval = spec && spec.wide ? 2.5 : 1.5;
    if (this._sinceRender < interval) return;
    if (!this.project || this.project.day === this._renderedDay) return;
    if (this.interacting()) return;
    this.render();
  }

  /** True while the user is working inside the panel (typing, dragging, scrolling, a focused control). */
  interacting() {
    if (this._pointerDown) return true;
    if (performance.now() - this._lastInteraction < 2000) return true;
    const a = document.activeElement;
    return !!(a && this.panel.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
  }

  /** Standard CLO + PMBOK domain chip row for a panel header. Defaults to the open panel's registry entry. */
  tag(clo, domain) {
    const spec = this.spec || {};
    const clos = clo === undefined || clo === null ? spec.clo || [] : [].concat(clo);
    const dom = domain === undefined || domain === null ? spec.domain : domain;
    this._tagUsed = true;
    this.headTags.style.display = 'none';
    return buildTags(clos, dom, spec.week);
  }

  simBadge(text) {
    return el('span', { class: 'sim-badge', title: 'Budgets, schedules, vendors, people and events in this scenario are simulated for teaching.' }, [
      icon('layers', 12), el('span', { dir: 'auto', text: text || t('hud.sim') }),
    ]);
  }

  /** Number of quiz questions (delegates to the assess panel's optional count()). */
  quizCount() {
    const m = MODULES.assess;
    try {
      if (m && typeof m.count === 'function') return m.count(this);
    } catch { /* fall through */ }
    return null;
  }

  /** Focus the change-request form (delegates to the control panel's optional focusChangeForm()). */
  focusChangeForm() {
    const m = MODULES.control;
    if (this.openId !== 'control') this.open('control');
    try {
      if (m && typeof m.focusChangeForm === 'function') return m.focusChangeForm(this);
    } catch (err) {
      console.error('[dashboard] focusChangeForm', err);
    }
    const first = this.body.querySelector('input, textarea, select, button');
    if (first) first.focus();
    return false;
  }

  /* ------------------------------------------------------------- internals */

  _setHead(spec) {
    clear(this.headIcon).appendChild(icon(spec.icon, 22));
    this.headTitle.textContent = t(`panel.${spec.id}`, spec.title);
    this.headSub.textContent = spec.sub;
    clear(this.headTags).appendChild(buildTags(spec.clo, spec.domain, spec.week));
  }

  _callHook(id, hook) {
    const m = MODULES[id];
    if (m && typeof m[hook] === 'function') {
      try { m[hook](this); } catch (err) { console.error(`[dashboard] ${id}.${hook}`, err); }
    }
  }

  _updateBadges() {
    let s = null;
    try { s = this.project && this.project.snapshot ? this.project.snapshot() : null; } catch { s = null; }
    const set = (id, n, cls = '') => {
      const b = this.buttons.get(id);
      if (!b) return;
      const badge = b.querySelector('.rail-badge');
      const show = Number.isFinite(n) && n > 0;
      badge.textContent = show ? String(Math.min(99, n)) : '';
      badge.className = `rail-badge ${show ? 'on' : ''} ${cls}`.trim();
    };
    set('control', s ? s.openChanges : 0);
    set('risk', s ? s.realisedRisks : 0, 'warn');
    const game = this.sim.game;
    const active = game && Array.isArray(game.missions) ? game.missions.filter((m) => m && m.status === 'active').length : 0;
    set('missions', active, 'info');
  }
}

function buildTags(clos, domain, week) {
  return el('div', { class: 'tagrow', role: 'list', 'aria-label': 'Course outcomes and domain' }, [
    ...(clos || []).map((c) => el('span', { class: 'tag clo', role: 'listitem', title: CLO_TEXT[c] || c, text: c })),
    domain ? el('span', { class: 'tag domain', role: 'listitem', title: 'PMBOK performance domain / focus area', text: domain }) : null,
    week ? el('span', { class: 'tag week', role: 'listitem', title: 'Course week', text: `Week ${week}` }) : null,
  ]);
}

export { buildTags };
