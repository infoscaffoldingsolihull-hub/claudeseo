import {
  el, svg, clear, icon, t, tl, relabel, setLanguage, fmtPct, fmtIndex, fmtPKR, indexClass, humanize, pill, bar, button,
  openModal, modalCount, closeTopModal, field, select,
} from './dom.js';
import { KEY_BINDINGS } from './panels/session.js';
import { RUNWAY } from '../world/layout.js';

/**
 * The heads-up layer of SKY GATEWAY HYDERABAD ("Indus Night").
 *
 * Top bar (brand, five modes, speed, MEHRAN, XP, stats/sound/help), the
 * instrument strip (date, phase, % complete, SPI, CPI, budget-burn gauge,
 * quality, weather, clock), compass, event ticker, toasts, POI reticle/prompt
 * and card, PM-mode selection card, mission tracker, narration + letterbox +
 * tour bar, decision cards, approval/generic modals, drone FPV HUD, operations
 * KPI strip, renderer stats, help card and confetti. Every read of project /
 * game / AI state is guarded so the HUD never throws on partial data.
 */

export const SPEEDS = [0, 1, 10, 50, 200];
const SPEED_LABELS = ['Paused', '×1', '×10', '×50', '×200'];

export const MODES = [
  { id: 'inspector', key: '1', icon: 'walk', hint: 'Walk the site, enter the terminal and tower, inspect work (E)' },
  { id: 'manager', key: '2', icon: 'layers', hint: 'Orbit the airfield, pick work packages, run the project' },
  { id: 'tour', key: '3', icon: 'present', hint: 'Narrated cinematic tour for lectures and conferences' },
  { id: 'drone', key: '4', icon: 'drone', hint: 'Free flight with an FPV HUD, photo mode and orbit-cam' },
  { id: 'ops', key: '5', icon: 'planeUp', hint: 'Live airside operations after handover (O)' },
];

const PHASES = ['initiating', 'planning', 'executing', 'monitoring', 'closing'];

/**
 * Trade-off convention (src/game/decisions.js): every dimension is scored from
 * the project's point of view, so + is favourable and − unfavourable
 * (time +1 = faster, cost −1 = dearer, risk +1 = less exposure).
 */
const POLARITY = { time: 1, cost: 1, risk: 1, quality: 1, stakeholders: 1, safety: 1, scope: 1 };
const TRADE_ICON = { time: 'gantt', cost: 'coins', quality: 'gauge', risk: 'warning', stakeholders: 'people', safety: 'shield', scope: 'tree' };

const safe = (fn, dflt) => {
  try {
    const v = fn();
    return v === undefined || v === null ? dflt : v;
  } catch {
    return dflt;
  }
};

/** append() that skips null/false children (Element.append would print "null"). */
function put(node, ...kids) {
  for (const k of kids) if (k !== null && k !== undefined && k !== false) node.append(k);
  return node;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

function clockText(hour) {
  if (!Number.isFinite(hour)) return '—';
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function cardinal(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export class HUD {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.speedIndex = 2;
    this._metricTimer = 1;
    this._slowTimer = 1;
    this._statsTimer = 0;
    this._logQueue = [];
    this._recentToasts = new Map();
    this._decision = null;
    this._decisionQueue = [];
    this._poiId = null;
    this._selectionId = null;
    this._lastDronePos = null;
    this._droneSpeed = 0;
    this._geofence = false;
    setLanguage(safe(() => sim.settings.get('language'), 'en'));

    this.layer = el('div', { class: 'hud' });
    root.appendChild(this.layer);

    this._buildTopBar();
    this._buildInstruments();
    this._buildOverlays();
    this._buildCards();
    this._buildDrone();
    this._buildCinematic();
    this.helpOverlay = this._buildHelp();
    this.layer.appendChild(this.helpOverlay);
    this._bindBus();
    this._bindKeys();
    this.refreshSound();
  }

  get project() {
    return this.sim.project;
  }

  /* ================================================================ build */

  _buildTopBar() {
    const logo = svg('svg', { class: 'brand-mark', viewBox: '0 0 40 40', width: 34, height: 34, 'aria-hidden': 'true' }, [
      svg('rect', { x: 1, y: 1, width: 38, height: 38, rx: 9, fill: 'url(#bm-g)', stroke: 'rgba(201,162,39,.55)' }),
      svg('defs', {}, [svg('linearGradient', { id: 'bm-g', x1: 0, y1: 0, x2: 1, y2: 1 }, [
        svg('stop', { offset: 0, 'stop-color': '#2b3a8c' }), svg('stop', { offset: 1, 'stop-color': '#9b1b30' }),
      ])]),
      // Hyderabad's windcatcher (manghō) over a runway in perspective.
      svg('path', { d: 'M15 22V11l10-4v15z', fill: 'none', stroke: '#e6c65a', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
      svg('path', { d: 'M15 11l10-4', stroke: '#f4f6ff', 'stroke-width': 1.6 }),
      svg('path', { d: 'M17 35l2.4-11h1.2L23 35', fill: 'none', stroke: '#f4f6ff', 'stroke-width': 1.3 }),
      svg('path', { d: 'M20 26v2 M20 30v2.4', stroke: '#e6c65a', 'stroke-width': 1 }),
      svg('path', { d: 'M8 35h24', stroke: 'rgba(244,246,255,.35)', 'stroke-width': 1 }),
    ]);
    const brand = el('div', { class: 'brand', title: 'SKY GATEWAY HYDERABAD — HDD · OPKD' }, [
      logo,
      el('div', { class: 'brand-text' }, [
        el('b', { 'data-i18n': 'brand.title', dir: 'auto', text: t('brand.title') }),
        el('small', { text: 'HDD · OPKD · PM Simulator' }),
      ]),
    ]);

    this.modeButtons = new Map();
    const modes = el('div', { class: 'seg modes', role: 'group', 'aria-label': 'Mode' });
    for (const m of MODES) {
      const b = el('button', {
        type: 'button', class: 'seg-btn mode-btn', title: `${m.hint} (${m.key})`, 'aria-pressed': 'false', dataset: { mode: m.id },
        onclick: () => this.sim.setMode && this.sim.setMode(m.id),
      }, [icon(m.icon, 16), tl(`mode.${m.id}`, 'span', { class: 'lbl' }), el('kbd', { text: m.key })]);
      this.modeButtons.set(m.id, b);
      modes.appendChild(b);
    }
    this.modeArrows = el('div', { class: 'mode-arrows' }, [
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous mode', title: 'Previous mode', onclick: () => this.cycleMode(-1) }, [icon('prev', 16)]),
      (this.modeLabel = el('span', { class: 'mode-now', dir: 'auto' })),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next mode', title: 'Next mode', onclick: () => this.cycleMode(1) }, [icon('next', 16)]),
    ]);

    this.speedButtons = [];
    const speed = el('div', { class: 'seg speed', role: 'radiogroup', 'aria-label': 'Simulation speed (project days per second)' });
    SPEEDS.forEach((v, i) => {
      const b = el('button', {
        type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false',
        title: i === 0 ? 'Pause the project clock (P)' : `${v} project day${v > 1 ? 's' : ''} per second (+/−)`,
        'aria-label': i === 0 ? t('speed.paused') : `${v} days per second`,
        onclick: () => this.setSpeedIndex(i),
      }, [i === 0 ? icon('pause', 14) : el('span', { text: SPEED_LABELS[i] })]);
      this.speedButtons.push(b);
      speed.appendChild(b);
    });
    this.speedCycle = el('button', { type: 'button', class: 'seg-btn speed-cycle', 'aria-label': 'Cycle simulation speed', title: 'Simulation speed', onclick: () => this.cycleSpeed() }, [
      icon('play', 14), (this.speedCycleText = el('span', { text: '×10' })),
    ]);

    this.aiLight = el('i', { class: 'ai-light', 'aria-hidden': 'true' });
    this.aiButton = el('button', {
      type: 'button', class: 'pill-btn mehran', 'aria-expanded': 'false', title: 'MEHRAN — AI project manager (H)',
      onclick: () => { const c = this.sim.chat; if (c && c.toggle) c.toggle(); },
    }, [icon('chat', 16), tl('hud.mehran', 'span', { class: 'lbl' }), this.aiLight]);

    this.xpChip = el('button', { type: 'button', class: 'xp-chip', title: 'Level and experience — open Missions (M)', onclick: () => this.sim.dashboard && this.sim.dashboard.toggle('missions') }, [
      icon('star', 14),
      (this.xpLevel = el('b', { text: 'Lv 1' })),
      (this.xpName = el('span', { class: 'xp-name', text: '' })),
      (this.xpBar = el('span', { class: 'xp-bar' }, [el('i')])),
    ]);

    this.statsButton = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Renderer statistics (F)', title: 'Renderer statistics (F)', 'aria-pressed': 'false', onclick: () => this.toggleStats() }, [icon('stats', 17)]);
    this.soundButton = el('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'Sound (K)', title: 'Sound on/off (K)',
      onclick: () => {
        const a = this.sim.audio;
        if (!a) return;
        if (a.resume) a.resume();
        if (a.toggleMute) a.toggleMute();
        safe(() => this.sim.settings.set('audio.muted', !!a.muted));
        this.refreshSound();
      },
    }, [icon('sound', 17)]);
    this.helpButton = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Help and controls (?)', title: 'Help and controls (?)', onclick: () => this.toggleHelp() }, [icon('help', 17)]);

    this.topBar = el('header', { class: 'hud-top', role: 'banner' }, [
      brand, modes, this.modeArrows, el('div', { class: 'hud-spacer' }), speed, this.speedCycle, this.aiButton, this.xpChip,
      el('div', { class: 'tool-btns' }, [this.statsButton, this.soundButton, this.helpButton]),
    ]);
    this.layer.appendChild(this.topBar);
  }

  _buildInstruments() {
    this.metrics = {};
    const metric = (id, labelKey, extra = null, cls = '') => {
      const value = el('b', { class: 'm-val', text: '—' });
      const label = tl(labelKey, 'span', { class: 'm-lbl' });
      const box = el('div', { class: `metric ${cls}`.trim(), dataset: { metric: id } }, [extra, el('div', { class: 'm-txt' }, [value, label])]);
      this.metrics[id] = { box, value, label };
      return box;
    };

    this.phasePips = el('span', { class: 'phase-pips', 'aria-hidden': 'true' }, PHASES.map((p) => el('i', { title: t(`phase.${p}`) })));
    this.ring = svg('svg', { class: 'ring', viewBox: '0 0 36 36', width: 30, height: 30, 'aria-hidden': 'true' }, [
      svg('circle', { cx: 18, cy: 18, r: 15, class: 'ring-bg' }),
      (this.ringArc = svg('circle', { cx: 18, cy: 18, r: 15, class: 'ring-fg', 'stroke-dasharray': '0 94.25', transform: 'rotate(-90 18 18)' })),
    ]);
    // Semicircle gauge: burn arc (AC/BAC) with a brass tick at earned % (EV/BAC).
    this.gauge = svg('svg', { class: 'gauge', viewBox: '0 0 44 26', width: 40, height: 24, 'aria-hidden': 'true' }, [
      svg('path', { d: 'M4 22a18 18 0 0 1 36 0', class: 'gauge-bg' }),
      (this.gaugeArc = svg('path', { d: 'M4 22a18 18 0 0 1 36 0', class: 'gauge-fg', 'stroke-dasharray': '0 56.6', pathLength: 56.6 })),
      (this.gaugeTick = svg('line', { x1: 22, y1: 2, x2: 22, y2: 8, class: 'gauge-tick' })),
    ]);
    this.weatherIcon = el('span', { class: 'wx-ico' }, [icon('sun', 20)]);

    this.instruments = el('div', { class: 'instruments', role: 'group', 'aria-label': 'Project instruments' }, [
      metric('date', 'metric.date', icon('gantt', 16, { class: 'm-ico' })),
      metric('phase', 'metric.phase', this.phasePips),
      metric('progress', 'metric.progress', this.ring),
      metric('spi', 'metric.spi', null, 'idx'),
      metric('cpi', 'metric.cpi', null, 'idx'),
      metric('burn', 'metric.burn', this.gauge),
      metric('quality', 'metric.quality', icon('gauge', 16, { class: 'm-ico' })),
      metric('weather', 'metric.weather', this.weatherIcon),
      metric('clock', 'metric.clock', icon('sun', 16, { class: 'm-ico clock-ico' })),
    ]);
    this.layer.appendChild(this.instruments);
  }

  _buildOverlays() {
    // Compass strip — one mark every 15° of TRUE heading.
    this.compassStrip = el('div', { class: 'compass-strip' });
    for (let deg = -180; deg <= 540; deg += 15) {
      const d = ((deg % 360) + 360) % 360;
      const c = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
      this.compassStrip.appendChild(el('span', { class: c ? 'card' : d % 30 === 0 ? 'deg' : 'tick', text: c || (d % 30 === 0 ? String(d).padStart(3, '0') : '·') }));
    }
    this.compassRead = el('b', { class: 'compass-read', text: '000°' });
    this.compass = el('div', { class: 'compass', 'aria-hidden': 'true' }, [this.compassStrip, this.compassRead]);

    this.ticker = el('div', { class: 'ticker', role: 'log', 'aria-label': 'Project events', 'aria-live': 'off' });
    this.toastStack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    this.reticle = el('div', { class: 'reticle', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('i')]);
    this.poiPrompt = el('div', { class: 'poi-prompt', role: 'status' });
    this.statsHud = el('div', { class: 'stats-hud', 'aria-live': 'off' });
    this.opsStrip = el('div', { class: 'ops-strip', role: 'group', 'aria-label': 'Operations KPIs' });
    this.simBadgeNode = el('div', { class: 'sim-watermark', title: 'Budgets, schedules, vendors, airlines and events are simulated for teaching. Real-world facts are cited in facts.json.' }, [
      icon('layers', 12), tl('hud.sim'),
    ]);
    this.xpFloat = el('div', { class: 'xp-float', 'aria-hidden': 'true' });
    this.confettiCanvas = el('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    for (const n of [this.compass, this.ticker, this.reticle, this.poiPrompt, this.statsHud, this.opsStrip, this.simBadgeNode, this.xpFloat, this.confettiCanvas, this.toastStack]) {
      this.layer.appendChild(n);
    }
  }

  _buildCards() {
    this.stack = el('aside', { class: 'card-stack', 'aria-label': 'Context cards' });
    this.poiCard = el('section', { class: 'hud-card poi-card', role: 'dialog', 'aria-label': 'Point of interest' });
    this.selCard = el('section', { class: 'hud-card sel-card', role: 'dialog', 'aria-label': 'Selected work package' });
    this.missionHud = el('section', { class: 'hud-card mission-hud', 'aria-label': 'Active mission' });
    this.stack.append(this.poiCard, this.selCard, this.missionHud);
    this.layer.appendChild(this.stack);
    this.decisionLayer = el('div', { class: 'decision-layer' });
    this.layer.appendChild(this.decisionLayer);
  }

  _buildDrone() {
    const corner = (c) => el('i', { class: `fpv-corner ${c}` });
    this.droneAlt = el('b', { text: '0' });
    this.droneSpd = el('b', { text: '0' });
    this.droneHdg = el('b', { text: '000°' });
    this.droneBatt = el('span', { class: 'batt' }, [el('i')]);
    this.droneBattText = el('b', { text: '100%' });
    this.geofence = el('div', { class: 'geofence', role: 'alert' }, [icon('warning', 18), el('span', { text: 'GEOFENCE — active runway. Climb above 150 m AGL or move 400 m clear of the centreline.' })]);
    this.droneHud = el('div', { class: 'drone-hud', 'aria-hidden': 'true' }, [
      corner('tl'), corner('tr'), corner('bl'), corner('br'),
      el('div', { class: 'fpv-cross' }, [el('i'), el('i')]),
      el('div', { class: 'fpv-left' }, [el('small', { text: 'ALT AGL' }), this.droneAlt, el('small', { text: 'm' })]),
      el('div', { class: 'fpv-right' }, [el('small', { text: 'SPEED' }), this.droneSpd, el('small', { text: 'km/h' })]),
      el('div', { class: 'fpv-top' }, [el('small', { text: 'TRUE HDG' }), this.droneHdg]),
      el('div', { class: 'fpv-bottom' }, [
        el('span', { class: 'rec' }, [el('i'), 'REC']),
        el('span', { class: 'fpv-batt' }, [icon('battery', 16), this.droneBatt, this.droneBattText]),
        el('span', { class: 'fpv-keys', text: 'Space/Q climb · Shift boost · X photo · G orbit selection' }),
      ]),
      this.geofence,
    ]);
    this.layer.appendChild(this.droneHud);
  }

  _buildCinematic() {
    this.cinebarTop = el('div', { class: 'cinebar top', 'aria-hidden': 'true' });
    this.cinebarBottom = el('div', { class: 'cinebar bottom', 'aria-hidden': 'true' });
    this.narration = el('div', { class: 'narration', role: 'region', 'aria-live': 'polite', 'aria-label': 'Tour narration' });
    this.tourBar = el('div', { class: 'tour-bar', role: 'group', 'aria-label': 'Tour progress' });
    this.layer.append(this.cinebarTop, this.cinebarBottom, this.narration, this.tourBar);
  }

  _buildHelp() {
    const touchKeys = [
      ['Left thumb', 'Virtual stick — appears wherever you press'],
      ['Right side', 'Drag to look'],
      ['Two fingers', 'Pinch to zoom (Project Manager, Operations, Drone)'],
      ['◀ ▶', 'Previous / next mode'],
      ['⏱', 'Simulation speed'],
      ['Action pad', 'Jump · Crouch · Sprint · Inspect · Rise · Dive · Photo · Tour beats'],
    ];
    const card = el('div', { class: 'help-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-title', tabindex: '-1' }, [
      el('div', { class: 'help-head' }, [
        el('div', {}, [
          el('h2', { id: 'help-title', text: 'SKY GATEWAY HYDERABAD' }),
          el('p', { class: 'muted', text: 'A 3D project-management simulator of the Hyderabad Airport (HDD · OPKD) revival and expansion programme. Walk it, fly it, manage it — then hand it over to operations.' }),
        ]),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close help', onclick: () => this.toggleHelp(false) }, [icon('close', 18)]),
      ]),
      el('section', { class: 'help-keys' }, [
        el('h3', { class: 'section', text: 'Keyboard' }),
        el('div', { class: 'keys' }, KEY_BINDINGS.map(([k, d]) => el('div', {}, [el('kbd', { text: k }), el('span', { text: d })]))),
      ]),
      el('section', { class: 'help-touch' }, [
        el('h3', { class: 'section', text: 'Phone & tablet' }),
        el('div', { class: 'keys' }, touchKeys.map(([k, d]) => el('div', {}, [el('kbd', { text: k }), el('span', { text: d })]))),
      ]),
      el('h3', { class: 'section', text: 'Five modes' }),
      el('div', { class: 'mode-cards' }, MODES.map((m) => el('button', {
        type: 'button', class: 'mode-card', onclick: () => { this.toggleHelp(false); if (this.sim.setMode) this.sim.setMode(m.id); },
      }, [icon(m.icon, 22), el('b', { 'data-i18n': `mode.${m.id}`, dir: 'auto', text: t(`mode.${m.id}`) }), el('kbd', { text: m.key }), el('span', { text: m.hint })]))),
      el('h3', { class: 'section', text: 'Presenting' }),
      el('p', { class: 'note', text: 'Press 3 for the narrated tour and drive it with ← →. Turn on Conference mode (Session & Settings → Accessibility) for projector-sized type. Photo mode (X in Drone) hides every overlay. Everything runs offline from this single file; simulated data is badged.' }),
      el('div', { class: 'row end' }, [button('Close', () => this.toggleHelp(false), { kind: 'primary' })]),
    ]);
    return el('div', { class: 'help-overlay', onclick: (e) => { if (e.target === this.helpOverlay) this.toggleHelp(false); } }, [card]);
  }

  /* ================================================================= bus */

  _bindBus() {
    const bus = this.sim.bus;
    if (!bus) return;
    bus.on('project:log', ({ entry } = {}) => { if (entry) this._logQueue.push(entry); if (this._logQueue.length > 40) this._logQueue.splice(0, this._logQueue.length - 40); });
    bus.on('project:new', () => {
      clear(this.ticker);
      this._logQueue = [];
      this.closeCards();
      this._metricTimer = 1;
    });
    // The game director toasts milestones, missions and badges itself; the HUD adds the celebration.
    bus.on('mission:completed', () => { if (this.sim.confetti) this.sim.confetti(); });
    bus.on('xp:gained', ({ amount, reason } = {}) => this._floatXp(amount, reason));
    bus.on('mode:changed', () => { this._metricTimer = 1; this._refreshModes(); });
    bus.on('overlay:changed', () => this._refreshOverlayButtons());
    bus.on('selection:changed', ({ id } = {}) => { if (!id && this._selectionId) this._hideCard(this.selCard); });
    bus.on('settings:changed', ({ path } = {}) => {
      if (path === 'language' || path === '*') {
        setLanguage(safe(() => this.sim.settings.get('language'), 'en'));
        relabel(this.layer);
        this._refreshModes();
      }
      if (path === 'accessibility.captions') this.narration.classList.toggle('no-captions', !safe(() => this.sim.settings.get('accessibility.captions'), true));
    });
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this._decision || modalCount()) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= (this._decision.event.options || []).length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._choose(n - 1);
      }
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.isHelpOpen()) {
        const f = [...this.helpOverlay.querySelectorAll('button')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }

  /* ============================================================== toasts */

  toast(text, kind = '') {
    if (!text) return;
    const now = performance.now();
    const last = this._recentToasts.get(text);
    if (last && now - last < 1500) return;
    this._recentToasts.set(text, now);
    if (this._recentToasts.size > 30) this._recentToasts.clear();
    const glyph = { good: 'check', warn: 'warning', bad: 'warning' }[kind] || 'planeUp';
    const node = el('div', { class: `toast ${kind}`.trim() }, [icon(glyph, 15), el('span', { dir: 'auto', text: String(text) })]);
    this.toastStack.appendChild(node);
    while (this.toastStack.children.length > (document.body.classList.contains("panel-open") ? 2 : 3)) this.toastStack.removeChild(this.toastStack.firstChild);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 380);
    }, kind === 'bad' ? 5200 : 3600);
  }

  /* ================================================================ modes */

  cycleMode(step) {
    const ids = MODES.map((m) => m.id);
    let i = ids.indexOf(this.sim.mode);
    for (let k = 0; k < ids.length; k++) {
      i = (i + step + ids.length) % ids.length;
      if (ids[i] !== 'ops' || safe(() => this.sim.operationsUnlocked, false)) break;
    }
    if (this.sim.setMode) this.sim.setMode(ids[i]);
  }

  _refreshModes() {
    const mode = this.sim.mode;
    const unlocked = safe(() => this.sim.operationsUnlocked, false);
    for (const [id, b] of this.modeButtons) {
      b.classList.toggle('active', id === mode);
      b.setAttribute('aria-pressed', id === mode ? 'true' : 'false');
      if (id === 'ops') {
        b.classList.toggle('locked', !unlocked);
        b.title = unlocked ? `${MODES[4].hint}` : 'Operations unlocks at handover (WBS 12.2). Instructor role can preview it.';
      }
    }
    this.modeLabel.textContent = t(`mode.${mode}`);
    document.body.dataset.mode = mode || '';
  }

  /* ================================================================ speed */

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, Number(i) || 0));
    this.sim.simulationSpeed = SPEEDS[this.speedIndex];
    this.applySpeed();
  }

  cycleSpeed() {
    this.setSpeedIndex((this.speedIndex + 1) % SPEEDS.length);
  }

  /** Sync the control to `sim.simulationSpeed` (main.setSpeed calls this). */
  applySpeed() {
    const v = Number(this.sim.simulationSpeed) || 0;
    let best = 0;
    SPEEDS.forEach((s, i) => { if (Math.abs(s - v) < Math.abs(SPEEDS[best] - v)) best = i; });
    this.speedIndex = best;
    this.speedButtons.forEach((b, i) => {
      b.classList.toggle('active', i === best);
      b.setAttribute('aria-checked', i === best ? 'true' : 'false');
    });
    this.speedCycleText.textContent = best === 0 ? t('speed.paused') : SPEED_LABELS[best];
    document.body.classList.toggle('sim-paused', best === 0);
  }

  /* ============================================================= toggles */

  refreshSound() {
    const muted = !!safe(() => this.sim.audio.muted, false);
    clear(this.soundButton).appendChild(icon(muted ? 'mute' : 'sound', 17));
    this.soundButton.classList.toggle('muted', muted);
    this.soundButton.title = muted ? 'Sound is off (K)' : 'Sound is on (K)';
    this.soundButton.setAttribute('aria-label', this.soundButton.title);
    this.soundButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  toggleStats(force) {
    const on = force === undefined ? !this.statsHud.classList.contains('show') : !!force;
    this.statsHud.classList.toggle('show', on);
    this.statsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.statsButton.classList.toggle('active', on);
    this._statsTimer = 1;
  }

  toggleHelp(force) {
    const on = force === undefined ? !this.isHelpOpen() : !!force;
    if (on === this.isHelpOpen()) return;
    this.helpOverlay.classList.toggle('open', on);
    if (on) {
      this._helpReturn = document.activeElement;
      safe(() => this.sim.input.exitPointerLock());
      const c = this.helpOverlay.querySelector('.help-card');
      setTimeout(() => c && c.focus(), 0);
    } else if (this._helpReturn && this._helpReturn.focus && document.contains(this._helpReturn)) {
      this._helpReturn.focus({ preventScroll: true });
    }
  }

  isHelpOpen() {
    return this.helpOverlay.classList.contains('open');
  }

  /* ============================================================== update */

  update(dt = 0.016) {
    this._metricTimer += dt;
    this._slowTimer += dt;
    const mode = this.sim.mode;
    if (this._metricTimer >= 0.16) {
      this._metricTimer = 0;
      this._updateMetrics();
      this._flushTicker();
    }
    if (this._slowTimer >= 0.5) {
      this._slowTimer = 0;
      this._refreshModes();
      this._updateAi();
      this._updateXp();
      this._updateMission();
      this._updateOps(mode === 'ops');
      if (this._poiId && this.poiCard.classList.contains('show')) this._updatePoiLive();
    }
    const fp = mode === 'inspector';
    this.reticle.classList.toggle('show', fp);
    const showCompass = fp || mode === 'drone';
    this.compass.classList.toggle('show', showCompass);
    if (showCompass) {
      const h = safe(() => this.sim.heading(), 0);
      const w = this.compass.clientWidth || 300;
      this.compassStrip.style.transform = `translateX(${(w / 2 - ((h + 180) * 2.4 + 18)).toFixed(1)}px)`;
      this.compassRead.textContent = `${String(Math.round(h) % 360).padStart(3, '0')}° ${cardinal(h)}`;
    }
    this._updateDrone(dt, mode === 'drone');
    if (this.statsHud.classList.contains('show')) {
      this._statsTimer += dt;
      if (this._statsTimer > 0.25) {
        this._statsTimer = 0;
        this._updateStats();
      }
    }
  }

  _updateMetrics() {
    const p = this.project;
    const s = safe(() => p.snapshot(), {}) || {};
    const m = this.metrics;
    const day = Number.isFinite(s.day) ? s.day : safe(() => p.day, 0);
    m.date.value.textContent = s.dateLabel || safe(() => p.dateLabel(day), `Day ${day}`);
    m.date.box.title = `Project day ${day}`;

    const phase = String(s.phase || safe(() => p.phase, 'initiating')).toLowerCase();
    const pi = Math.max(0, PHASES.findIndex((x) => phase.startsWith(x.slice(0, 5))));
    m.phase.value.textContent = t(`phase.${PHASES[pi]}`, humanize(phase));
    [...this.phasePips.children].forEach((pip, i) => { pip.className = i < pi ? 'done' : i === pi ? 'now' : ''; });

    const prog = num(s.progress);
    m.progress.value.textContent = Number.isFinite(prog) ? fmtPct(prog, 1) : '—';
    this.ringArc.setAttribute('stroke-dasharray', `${(Math.max(0, Math.min(1, prog || 0)) * 94.25).toFixed(2)} 94.25`);

    const settled = (prog || 0) > 0.01;
    for (const k of ['spi', 'cpi']) {
      const v = num(s[k]);
      m[k].value.textContent = settled && Number.isFinite(v) ? fmtIndex(v) : '—';
      m[k].box.className = `metric idx ${settled ? indexClass(v) : ''}`.trim();
      m[k].box.title = k === 'spi' ? 'Schedule performance index = EV / PV' : 'Cost performance index = EV / AC';
    }

    const burn = Number.isFinite(num(s.budgetBurn)) ? s.budgetBurn : (Number.isFinite(num(s.ac)) && s.bac ? s.ac / s.bac : NaN);
    m.burn.value.textContent = Number.isFinite(burn) ? fmtPct(burn, 1) : '—';
    const bf = Math.max(0, Math.min(1, burn || 0));
    this.gaugeArc.setAttribute('stroke-dasharray', `${(bf * 56.6).toFixed(2)} 56.6`);
    const ang = Math.PI * (1 - Math.max(0, Math.min(1, prog || 0)));
    const cx = 22 + Math.cos(ang) * 18;
    const cy = 22 - Math.sin(ang) * 18;
    this.gaugeTick.setAttribute('x1', (22 + Math.cos(ang) * 13).toFixed(2));
    this.gaugeTick.setAttribute('y1', (22 - Math.sin(ang) * 13).toFixed(2));
    this.gaugeTick.setAttribute('x2', (cx + Math.cos(ang) * 3).toFixed(2));
    this.gaugeTick.setAttribute('y2', (cy - Math.sin(ang) * 3).toFixed(2));
    const over = Number.isFinite(burn) && settled ? burn - (prog || 0) : 0;
    m.burn.box.className = `metric ${over > 0.08 ? 'bad' : over > 0.03 ? 'warn' : settled ? 'good' : ''}`.trim();
    m.burn.box.title = `Actual cost ${fmtPKR(s.ac)} of ${fmtPKR(s.bac)} (BAC). Tick = work earned (${fmtPct(prog || 0, 1)}).`;

    let q = num(s.qualityIndex);
    if (Number.isFinite(q) && q > 1.5) q /= 100;
    m.quality.value.textContent = Number.isFinite(q) ? fmtPct(q, 0) : '—';
    m.quality.box.className = `metric ${Number.isFinite(q) ? indexClass(q, 0.9, 0.8) : ''}`.trim();

    // Show the weather that is on screen: the project's weather normally drives the
    // scene, but the tour and previews can override it; then the scene wins.
    const pw = (s.weather && typeof s.weather === 'object' ? s.weather : null) || safe(() => p.weather, null) || {};
    const ws = safe(() => this.sim.world.weather.state, null);
    const w = ws && ws.kind && ws.kind !== pw.kind ? { ...ws, workFactor: undefined } : pw.kind ? pw : (ws || {});
    const kind = typeof s.weather === 'string' ? s.weather : w.kind || 'clear';
    const night = safe(() => this.sim.world.sky.state.nightFactor, 0) > 0.5;
    const wxIcon = kind === 'clear' && night ? 'night' : { clear: 'sun', haze: 'haze', dust: 'dust', rain: 'rain', fog: 'fog', heat: 'heat' }[kind] || 'sun';
    if (this._wxIcon !== wxIcon) {
      this._wxIcon = wxIcon;
      clear(this.weatherIcon).appendChild(icon(wxIcon, 20));
      this.weatherIcon.dataset.kind = kind;
    }
    m.weather.value.textContent = w.label || humanize(kind);
    const wf = num(w.workFactor);
    m.weather.box.title = Number.isFinite(wf) ? `${w.label || humanize(kind)} — site productivity ${fmtPct(wf, 0)}` : humanize(kind);
    m.weather.box.className = `metric ${['dust', 'heat', 'rain'].includes(kind) && (w.intensity || 0) > 0.45 ? 'warn' : ''}`.trim();

    const hour = safe(() => this.sim.world.sky.hour, NaN);
    m.clock.value.textContent = `${clockText(hour)} PKT`;
  }

  _flushTicker() {
    if (!this._logQueue.length) return;
    const batch = this._logQueue.splice(0).slice(-4);
    let toasted = false;
    for (const e of batch) {
      const day = Number.isFinite(e.day) ? e.day : 0;
      const when = safe(() => this.project.dateLabel(day), `Day ${day}`);
      const node = el('div', { class: `event ${e.kind || 'info'}` }, [
        el('div', { class: 'ev-head' }, [el('span', { class: 'when', text: when }), el('b', { dir: 'auto', text: e.title || humanize(e.kind || 'event') })]),
        e.detail ? el('div', { class: 'ev-detail', text: e.detail }) : null,
      ]);
      this.ticker.appendChild(node);
      if (!toasted && (e.kind === 'risk' || e.kind === 'bad')) {
        toasted = true;
        this.toast(e.title, 'bad');
      }
      setTimeout(() => { node.classList.add('leaving'); setTimeout(() => node.remove(), 600); }, 9000);
    }
    while (this.ticker.children.length > 4) this.ticker.removeChild(this.ticker.firstChild);
  }

  _updateAi() {
    const status = safe(() => this.sim.ai.status, 'offline');
    this.aiLight.className = `ai-light ${status}`;
    const label = { live: 'live model connected', fallback: 'live model unavailable — offline fallback', offline: 'offline expert system' }[status] || status;
    this.aiButton.title = `MEHRAN — AI project manager (H) · ${label}`;
    this.aiButton.setAttribute('aria-label', `MEHRAN, ${label}`);
    this.aiButton.setAttribute('aria-expanded', safe(() => this.sim.chat.isOpen, false) ? 'true' : 'false');
  }

  _updateXp() {
    const g = this.sim.game;
    if (!g) return;
    const level = Number.isFinite(g.level) ? g.level : 1;
    this.xpLevel.textContent = `Lv ${level}`;
    this.xpName.textContent = g.levelName || '';
    let frac = num(g.levelProgress);
    if (!Number.isFinite(frac)) frac = num(safe(() => g.levelInfo.progress, NaN));
    if (!Number.isFinite(frac) && Number.isFinite(g.nextLevelXp)) {
      const base = Number.isFinite(g.levelXp) ? g.levelXp : 0;
      frac = (g.xp - base) / Math.max(1, g.nextLevelXp - base);
    }
    this.xpBar.style.display = Number.isFinite(frac) ? '' : 'none';
    if (Number.isFinite(frac)) this.xpBar.firstChild.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.xpChip.title = `Level ${level}${g.levelName ? ` · ${g.levelName}` : ''} · ${Math.round(g.xp || 0).toLocaleString('en-US')} XP — open Missions (M)`;
  }

  _floatXp(amount, reason) {
    if (!Number.isFinite(amount) || amount === 0) return;
    const n = el('span', { text: `${amount > 0 ? '+' : ''}${amount} XP${reason ? ` · ${reason}` : ''}` });
    this.xpFloat.appendChild(n);
    setTimeout(() => n.remove(), 2200);
    this._updateXp();
  }

  _updateMission() {
    const g = this.sim.game;
    const list = g && Array.isArray(g.missions) ? g.missions : [];
    const mission = (g && g.activeMission) || list.find((m) => m && m.status === 'active') || null;
    const visible = !!mission && this.sim.mode !== 'tour' && !(this.sim.dashboard && this.sim.dashboard.openId);
    this.missionHud.classList.toggle('show', visible);
    if (!visible) return;
    const objs = Array.isArray(mission.objectives) ? mission.objectives : [];
    const done = (o) => !!(o.done || o.complete || o.status === 'done');
    const sig = `${mission.id}:${objs.map((o) => (done(o) ? 1 : 0)).join('')}`;
    if (sig === this._missionSig) return;
    this._missionSig = sig;
    const n = objs.filter(done).length;
    put(clear(this.missionHud), 
      el('div', { class: 'card-eyebrow' }, [icon('flag', 13), el('span', { text: `Mission ${mission.id || ''}` }), mission.clo ? pill([].concat(mission.clo).join(' '), 'clo') : null, el('em', { text: `${n}/${objs.length}` })]),
      el('h4', { dir: 'auto', text: mission.name || 'Mission' }),
      mission.brief ? el('p', { class: 'brief', text: mission.brief }) : null,
      el('ul', { class: 'objectives' }, objs.map((o) => el('li', { class: done(o) ? 'done' : '' }, [el('i', { class: 'box' }, done(o) ? [icon('check', 11)] : []), el('span', { text: o.text || String(o.id) })]))),
      bar(objs.length ? n / objs.length : 0, 'ok', 'Mission progress'),
    );
  }

  _updateOps(on) {
    this.opsStrip.classList.toggle('show', on);
    if (!on) return;
    const ops = safe(() => this.sim.world.operations, null);
    const k = safe(() => ops.kpis(), null);
    clear(this.opsStrip);
    this.opsStrip.appendChild(el('span', { class: 'ops-title' }, [icon('tower', 16), el('b', { text: 'Airside operations' }), el('small', { text: 'simulated' })]));
    if (!k || typeof k !== 'object' || !Object.keys(k).length) {
      this.opsStrip.appendChild(el('span', { class: 'ops-kpi' }, [el('b', { text: ops ? 'Starting' : 'Standby' }), el('small', { text: 'Traffic simulation' })]));
      return;
    }
    for (const [key, v] of Object.entries(k).slice(0, 7)) {
      let text;
      if (typeof v === 'number') {
        if (/pct|percent|rate|onTime|ratio|util/i.test(key) && v <= 1.0001) text = fmtPct(v, 0);
        else text = Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1);
      } else if (typeof v === 'string') text = v;
      else continue;
      this.opsStrip.appendChild(el('span', { class: 'ops-kpi' }, [el('b', { text }), el('small', { text: humanize(key) })]));
    }
  }

  _updateStats() {
    const st = safe(() => this.sim.engine.stats, {}) || {};
    const mem = safe(() => performance.memory.usedJSHeapSize, null);
    put(clear(this.statsHud), 
      el('div', {}, [el('b', { text: Number.isFinite(st.fps) ? st.fps.toFixed(0) : '—' }), ' fps · ', String(st.tier || '—')]),
      el('div', { text: `${(st.calls || 0).toLocaleString('en-US')} draw calls` }),
      el('div', { text: `${(st.triangles || 0).toLocaleString('en-US')} triangles` }),
      el('div', { text: `${st.geometries || 0} geometries · ${st.textures || 0} textures` }),
      el('div', { text: `${st.programs || 0} shader programs` }),
      mem ? el('div', { text: `${(mem / 1048576).toFixed(0)} MB JS heap` }) : null,
    );
  }

  _updateDrone(dt, on) {
    this.droneHud.classList.toggle('show', on);
    document.body.classList.toggle('fpv', on);
    if (!on) {
      this._lastDronePos = null;
      return;
    }
    const pos = safe(() => this.sim.drone.position, null) || safe(() => this.sim.engine.camera.position, null);
    if (!pos) return;
    const ground = safe(() => this.sim.world.collision.groundAt(pos.x, pos.z, 400), 0);
    const agl = pos.y - (Number.isFinite(ground) ? ground : 0);
    this.droneAlt.textContent = Math.max(0, agl).toFixed(0);
    if (this._lastDronePos && dt > 0) {
      const d = Math.hypot(pos.x - this._lastDronePos.x, pos.y - this._lastDronePos.y, pos.z - this._lastDronePos.z);
      this._droneSpeed += ((d / dt) * 3.6 - this._droneSpeed) * Math.min(1, dt * 4);
    }
    this._lastDronePos = { x: pos.x, y: pos.y, z: pos.z };
    this.droneSpd.textContent = Math.max(0, this._droneSpeed).toFixed(0);
    const h = safe(() => this.sim.heading(), 0);
    this.droneHdg.textContent = `${String(Math.round(h) % 360).padStart(3, '0')}° ${cardinal(h)}`;
    const batt = Math.max(0, Math.min(1, safe(() => this.sim.droneBattery, 1)));
    this.droneBatt.firstChild.style.width = `${batt * 100}%`;
    this.droneBatt.className = `batt ${batt < 0.15 ? 'bad' : batt < 0.35 ? 'warn' : ''}`.trim();
    this.droneBattText.textContent = `${Math.round(batt * 100)}%`;
    this._geoTimer = (this._geoTimer || 0) + dt;
    if (this._geoTimer > 0.5) {
      this._geoTimer = 0;
      const operational = !!safe(() => this.project.worldState().operational, false) || this.sim.mode === 'ops';
      const z0 = RUNWAY.threshold20Z;
      const z1 = RUNWAY.extensionEndZ;
      const dz = pos.z < z0 ? z0 - pos.z : pos.z > z1 ? pos.z - z1 : 0;
      const dist = Math.hypot(pos.x, dz);
      this._geofence = operational && dist < 400 && agl < 150;
      this.geofence.classList.toggle('show', this._geofence);
    }
  }

  /* ========================================================= POI & cards */

  setPrompt(text) {
    if (!text) {
      if (this._promptText) {
        this._promptText = null;
        this.poiPrompt.classList.remove('show');
      }
      return;
    }
    if (text === this._promptText) return;
    this._promptText = text;
    clear(this.poiPrompt).append(el('kbd', { text: 'E' }), el('span', { dir: 'auto', text: String(text).replace(/^Press E to /i, '') }));
    this.poiPrompt.classList.add('show');
  }

  _task(id) {
    const p = this.project || {};
    return safe(() => p.taskById.get(id), null) || safe(() => p.tasks.find((x) => x.id === id), null) || safe(() => p.summaries.find((x) => x.id === id), null);
  }

  _wbsStatus(id) {
    const p = this.project || {};
    const task = this._task(id);
    let pct = num(safe(() => p.worldState().pct[id], NaN));
    if (!Number.isFinite(pct)) pct = num(safe(() => p.state.get(id).pct, NaN));
    if (Number.isFinite(pct) && pct > 1.0001) pct /= 100;
    // A summary element (e.g. '3') owns every leaf task whose summaryId matches.
    const kids = new Set([id, ...safe(() => p.tasks.filter((x) => x.summaryId === id).map((x) => x.id), [])]);
    const match = (x) => !!x && [x.task, x.taskId, x.wbs, x.wbsId].some((v) => v && kids.has(v));
    const open = (x) => !/closed|resolved|done|rejected|implemented/i.test(String(x.status || ''));
    const ncrs = safe(() => (p.ncrs || p.quality.ncrs).filter((x) => match(x) && open(x)), []);
    const changes = safe(() => p.changes.filter((x) => match(x) && open(x)), []);
    // Open issues on the element: its open NCRs, open change requests and any issue logged against it.
    const issues = [...ncrs, ...changes, ...safe(() => p.issues.filter((x) => match(x) && open(x)), [])];
    return { task, pct, ncrs, issues };
  }

  showPoi(poi) {
    if (!poi) return;
    this._poiId = poi.id;
    this._poi = poi;
    const wbs = poi.wbsId || null;
    const st = wbs ? this._wbsStatus(wbs) : { task: null, pct: NaN, ncrs: [], issues: [] };
    const card = clear(this.poiCard);
    put(card, 
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-ico' }, [icon('eye', 18)]),
        el('div', { class: 'card-titles' }, [
          el('div', { class: 'card-eyebrow' }, [el('span', { text: 'Site inspection' }), wbs ? pill(`WBS ${st.task && st.task.code ? st.task.code : wbs}`, 'gold') : null]),
          el('h3', { dir: 'auto', text: poi.name || 'Point of interest' }),
        ]),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close card', onclick: () => this._hideCard(this.poiCard) }, [icon('close', 15)]),
      ]),
      (this._poiLive = el('div', { class: 'poi-live' })),
      poi.text ? el('p', { class: 'card-text', text: poi.text }) : null,
      poi.pm ? el('p', { class: 'card-pm', text: poi.pm }) : null,
      el('div', { class: 'row card-actions' }, [
        button('Raise NCR / Change Request', () => this.raiseChangeFor(wbs, poi.name), { kind: 'primary', icon: 'ncr', small: true }),
        wbs ? button('Open in dashboard', () => { if (this.sim.select) this.sim.select(wbs); if (this.sim.dashboard) this.sim.dashboard.open('scope'); }, { kind: 'ghost', icon: 'tree', small: true }) : null,
      ]),
    );
    this._updatePoiLive();
    this._showCard(this.poiCard);
    safe(() => this.sim.input.exitPointerLock());
  }

  _updatePoiLive() {
    const poi = this._poi;
    if (!poi || !this._poiLive) return;
    const wbs = poi.wbsId;
    const live = clear(this._poiLive);
    if (!wbs) {
      live.appendChild(el('div', { class: 'muted small', text: 'Landmark — not tied to a single work package.' }));
      return;
    }
    const st = this._wbsStatus(wbs);
    const q = st.ncrs.length ? pill(`${st.ncrs.length} open NCR${st.ncrs.length > 1 ? 's' : ''}`, 'bad') : pill('Conforming', 'ok');
    put(live, 
      el('div', { class: 'mini-kpis' }, [
        el('div', {}, [el('small', { text: 'Complete' }), el('b', { text: Number.isFinite(st.pct) ? fmtPct(st.pct, 0) : '—' })]),
        el('div', {}, [el('small', { text: 'Quality' }), q]),
        el('div', {}, [el('small', { text: 'Open issues' }), el('b', { class: st.issues.length ? 'warn' : '', text: String(st.issues.length) })]),
      ]),
      bar(st.pct || 0, (st.pct || 0) >= 1 ? 'ok' : '', 'Percent complete'),
    );
  }

  /** NCR / change-request form for a WBS element (POI card, selection card). */
  raiseChangeFor(wbsId, name) {
    const p = this.project;
    if (!p || typeof p.raiseChange !== 'function') {
      this.toast('The change register is not available yet in this build.', 'warn');
      return;
    }
    const st = { type: 'ncr' };
    const desc = el('textarea', { rows: 3, placeholder: 'What did you observe? What should change?' });
    desc.value = `Observed during site inspection of ${name || wbsId || 'the works'}.`;
    const titleIn = el('input', { type: 'text', value: `NCR — ${name || wbsId || 'site observation'}` });
    this.modal({
      title: 'Raise NCR / Change Request', icon: 'ncr',
      body: [
        el('p', { class: 'muted', text: 'Non-conformance reports and change requests enter integrated change control: impact analysis, a CCB vote, then implementation.' }),
        field('Type', select([{ value: 'ncr', label: 'Non-conformance report (quality)' }, { value: 'cr', label: 'Change request (scope / schedule / cost)' }], st.type, (v) => {
          st.type = v;
          titleIn.value = `${v === 'ncr' ? 'NCR' : 'CR'} — ${name || wbsId || 'site observation'}`;
        })),
        field('Title', titleIn),
        field('Description', desc),
        wbsId ? el('div', { class: 'row' }, [pill(`WBS ${wbsId}`, 'gold'), pill('Raised by: Site Inspector', 'muted')]) : null,
      ],
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Raise', kind: 'primary', icon: 'ncr',
          onClick: () => {
            const isNcr = st.type === 'ncr';
            const change = safe(() => p.raiseChange({
              title: titleIn.value.trim() || 'Site observation',
              description: desc.value.trim(),
              raisedBy: isNcr ? 'Site Inspector' : 'Project Manager',
              wbs: wbsId || undefined,
              impact: isNcr ? { quality: 1 } : undefined,
            }), null);
            if (change && this.sim.bus) this.sim.bus.emit('change:raised', { change });
            this.toast(change ? `${change.id || 'Request'} raised — open Integrated Change Control (C) to analyse it` : 'The change could not be raised', change ? 'good' : 'bad');
            if (this.sim.dashboard && this.sim.dashboard.openId === 'control') this.sim.dashboard.rerender();
          },
        },
      ],
    });
  }

  showSelection(wbsId) {
    if (!wbsId) {
      this._hideCard(this.selCard);
      return;
    }
    this._selectionId = wbsId;
    const p = this.project || {};
    const task = this._task(wbsId);
    const st = this._wbsStatus(wbsId);
    const dict = (task && task.dictionary) || {};
    const node = safe(() => p.forecast.nodes.get(wbsId), null) || safe(() => p.baseline.nodes.get(wbsId), null);
    let budget = num(task && task.budget);
    let actual = num(safe(() => p.state.get(wbsId).actualCost, NaN));
    if (!Number.isFinite(budget)) {
      const kids = safe(() => p.tasks.filter((x) => x.summaryId === wbsId), []);
      if (kids.length) {
        budget = kids.reduce((a, k) => a + (num(k.budget) || 0), 0);
        actual = kids.reduce((a, k) => a + (num(safe(() => p.state.get(k.id).actualCost, 0)) || 0), 0);
      }
    }
    const ev = Number.isFinite(budget) && Number.isFinite(st.pct) ? budget * st.pct : NaN;
    const cv = Number.isFinite(ev) && Number.isFinite(actual) ? ev - actual : NaN;
    const float = num(node && node.totalFloat);
    const critical = !!(node && node.critical) || safe(() => p.baseline.criticalPath.includes(wbsId), false);
    const overlay = this.sim.overlay;
    this.overlayButtons = [];
    const ovBtn = (kind, label) => {
      const b = el('button', {
        type: 'button', class: `chip-btn ${overlay === kind ? 'active' : ''}`.trim(), 'aria-pressed': overlay === kind ? 'true' : 'false', dataset: { ov: kind || 'none' },
        onclick: () => { if (this.sim.setOverlay) this.sim.setOverlay(this.sim.overlay === kind ? null : kind); },
      }, [label]);
      this.overlayButtons.push(b);
      return b;
    };
    put(clear(this.selCard), 
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-ico', style: task && task.color ? { color: task.color } : null }, [icon('tree', 18)]),
        el('div', { class: 'card-titles' }, [
          el('div', { class: 'card-eyebrow' }, [el('span', { text: 'Work package' }), pill(`WBS ${(task && task.code) || wbsId}`, 'gold'), critical ? pill('Critical', 'bad') : null, task && task.delivery ? pill(task.delivery, 'indigo') : null]),
          el('h3', { dir: 'auto', text: (task && task.name) || `WBS ${wbsId}` }),
        ]),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close card', onclick: () => { this._hideCard(this.selCard); if (this.sim.select) this.sim.select(null); } }, [icon('close', 15)]),
      ]),
      dict.description ? el('p', { class: 'card-text', text: dict.description }) : null,
      el('div', { class: 'mini-kpis four' }, [
        el('div', {}, [el('small', { text: 'Complete' }), el('b', { text: Number.isFinite(st.pct) ? fmtPct(st.pct, 0) : '—' })]),
        el('div', {}, [el('small', { text: 'Total float' }), el('b', { class: Number.isFinite(float) ? (float <= 0 ? 'bad' : float < 10 ? 'warn' : 'good') : '', text: Number.isFinite(float) ? `${Math.round(float)} d` : '—' })]),
        el('div', {}, [el('small', { text: 'Cost variance' }), el('b', { class: Number.isFinite(cv) ? (cv < 0 ? 'bad' : 'good') : '', text: Number.isFinite(cv) ? fmtPKR(cv, 2) : '—' })]),
        el('div', {}, [el('small', { text: 'Budget' }), el('b', { text: Number.isFinite(budget) ? fmtPKR(budget, 2) : '—' })]),
      ]),
      bar(st.pct || 0, critical ? 'bad' : '', 'Percent complete'),
      el('dl', { class: 'dict' }, [
        dict.owner ? [el('dt', { text: 'Owner' }), el('dd', { text: dict.owner })] : null,
        Array.isArray(dict.deliverables) && dict.deliverables.length ? [el('dt', { text: 'Deliverables' }), el('dd', { text: dict.deliverables.slice(0, 3).join(' · ') })] : null,
        dict.acceptance ? [el('dt', { text: 'Acceptance' }), el('dd', { text: dict.acceptance })] : null,
        [el('dt', { text: 'Quality' }), el('dd', {}, [st.ncrs.length ? pill(`${st.ncrs.length} open NCR`, 'bad') : pill('Conforming', 'ok'), ' ', st.issues.length ? pill(`${st.issues.length} issue${st.issues.length > 1 ? 's' : ''}`, 'warn') : null])],
      ].flat().filter(Boolean)),
      el('div', { class: 'overlay-row', role: 'group', 'aria-label': 'Heat-map overlay' }, [
        el('small', { text: 'Heat map' }), ovBtn('sv', 'Schedule'), ovBtn('cv', 'Cost'), ovBtn('risk', 'Risk'), ovBtn('load', 'Load'),
      ]),
      el('div', { class: 'row card-actions' }, [
        button('Open in Scope', () => this.sim.dashboard && this.sim.dashboard.open('scope'), { kind: 'ghost', icon: 'tree', small: true }),
        button('Raise CR', () => this.raiseChangeFor(wbsId, task && task.name), { kind: 'ghost', icon: 'ncr', small: true }),
        button('Orbit-cam', () => this.sim.orbitSelected && this.sim.orbitSelected(), { kind: 'ghost', icon: 'orbit', small: true, title: 'Fly the drone around this element (G in Drone mode)' }),
      ]),
    );
    this._showCard(this.selCard);
  }

  _refreshOverlayButtons() {
    for (const b of this.overlayButtons || []) {
      const on = b.dataset.ov === this.sim.overlay;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  _showCard(card) {
    card.classList.add('show');
  }

  _hideCard(card) {
    card.classList.remove('show');
    if (card === this.poiCard) { this._poiId = null; this._poi = null; }
    if (card === this.selCard) this._selectionId = null;
  }

  /** Close the POI and selection cards, and any decision card the game has already resolved. */
  closeCards() {
    this._hideCard(this.poiCard);
    this._hideCard(this.selCard);
    this._dropDecision();
  }

  /* ========================================================== narration */

  showNarration(opts = {}, text, lesson) {
    const o = typeof opts === 'string' ? { title: opts, text, lesson } : opts || {};
    const captions = safe(() => this.sim.settings.get('accessibility.captions'), true) !== false;
    this.narration.classList.toggle('no-captions', !captions);
    const clos = [].concat(o.clo || []).filter(Boolean);
    put(clear(this.narration), 
      el('div', { class: 'narr-eyebrow' }, [
        o.phase ? el('span', { text: t(`phase.${String(o.phase).toLowerCase()}`, humanize(o.phase)) }) : null,
        ...clos.map((c) => pill(c, 'clo')),
      ]),
      el('h3', { dir: 'auto', text: o.title || '' }),
      o.text ? el('p', { class: 'caption', dir: 'auto', text: o.text }) : null,
      o.lesson ? el('div', { class: 'lesson' }, [icon('book', 15), el('span', { dir: 'auto', text: o.lesson })]) : null,
    );
    this.narration.classList.add('show');
  }

  hideNarration() {
    this.narration.classList.remove('show');
  }

  setTourProgress(index, total) {
    const n = Math.max(0, Number(total) || 0);
    const i = Math.max(0, Math.min(n - 1, Number(index) || 0));
    const tour = this.sim.tour;
    put(clear(this.tourBar), 
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous beat', title: 'Previous (←)', onclick: () => tour && tour.previous && tour.previous() }, [icon('prev', 16)]),
      el('div', { class: 'tour-track' }, Array.from({ length: n }, (_, k) => el('button', {
        type: 'button', class: k < i ? 'done' : k === i ? 'now' : '', 'aria-label': `Go to beat ${k + 1}`, title: `Beat ${k + 1}`,
        onclick: () => tour && tour.goTo && tour.goTo(k),
      }))),
      el('span', { class: 'tour-count', text: n ? `${i + 1} / ${n}` : '' }),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next beat', title: 'Next (→)', onclick: () => tour && tour.next && tour.next() }, [icon('next', 16)]),
      el('button', { type: 'button', class: 'pill-btn small', title: 'Leave the tour (2)', onclick: () => this.sim.setMode && this.sim.setMode('manager') }, [icon('close', 13), el('span', { text: 'Exit tour' })]),
    );
    this.tourBar.classList.toggle('show', n > 0);
  }

  setCinematic(on) {
    document.body.classList.toggle('cinematic', !!on);
    if (!on) {
      this.hideNarration();
      clear(this.tourBar);
      this.tourBar.classList.remove('show');
    }
  }

  /* ========================================================== decisions */

  _tradeChip(dim, v) {
    const pol = POLARITY[dim] === undefined ? 0 : POLARITY[dim];
    let sign = 0;
    let text = '';
    if (typeof v === 'number' && Number.isFinite(v)) {
      sign = Math.sign(v);
      const a = Math.abs(v);
      const arrow = sign > 0 ? '+' : sign < 0 ? '−' : '±';
      if (a === 0) text = '±0';
      else if (a <= 3 && Number.isInteger(a)) text = arrow.repeat(a);
      else if (dim === 'cost' && a >= 1000) text = `${arrow} ${fmtPKR(v, 2)}`;
      else if (dim === 'time') text = `${arrow} ${Math.round(a)} d`;
      else if (a < 1) text = `${arrow} ${Math.round(a * 100)}%`;
      else text = `${arrow} ${a.toFixed(a < 10 ? 1 : 0)}`;
      if (a === 0) return null;
    } else if (typeof v === 'string') {
      text = v;
      sign = /^\s*[+▲↑]/.test(v) ? 1 : /^\s*[-−▼↓]/.test(v) ? -1 : 0;
    } else return null;
    const good = sign * pol;
    const cls = good > 0 ? 'good' : good < 0 ? 'bad' : 'neutral';
    return el('span', { class: `trade ${cls}`, title: `${humanize(dim)}: ${text} (${cls === 'good' ? 'favourable' : cls === 'bad' ? 'unfavourable' : 'neutral'})` }, [
      icon(TRADE_ICON[dim] || 'target', 12), el('span', { class: 'trade-dim', text: humanize(dim) }), el('b', { text }),
    ]);
  }

  showDecision(event, onChoose) {
    if (!event) return;
    if (this._decision) {
      this._decisionQueue.push([event, onChoose]);
      return;
    }
    const options = Array.isArray(event.options) ? event.options.slice(0, 4) : [];
    this._decision = { event, onChoose };
    safe(() => this.sim.input.exitPointerLock());
    const day = safe(() => this.project.day, 0);
    const optionNodes = options.map((o, i) => el('button', {
      type: 'button', class: 'decision-opt', onclick: () => this._choose(i), 'aria-label': `Option ${i + 1}: ${o.label}`,
    }, [
      el('span', { class: 'opt-key', text: String(i + 1) }),
      el('span', { class: 'opt-body' }, [
        el('b', { dir: 'auto', text: o.label || `Option ${i + 1}` }),
        o.detail || o.description ? el('small', { text: o.detail || o.description }) : null,
        o.summary ? el('span', { class: 'visually-hidden', text: `Trade-off: ${o.summary}` }) : null,
        el('span', { class: 'trades' }, Object.entries(o.tradeoff || {}).map(([k, v]) => this._tradeChip(k, v)).filter(Boolean)),
      ]),
    ]));
    const card = el('div', { class: 'decision-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'decision-title', 'aria-describedby': 'decision-text' }, [
      el('div', { class: 'decision-head' }, [
        el('span', { class: 'decision-badge' }, [icon('warning', 16), el('span', { text: 'Decision required' })]),
        ...[].concat(event.clo || []).filter(Boolean).map((c) => pill(c, 'clo')),
        event.domain ? pill(event.domain, 'domain') : null,
        el('span', { class: 'grow' }),
        el('span', { class: 'muted small', text: safe(() => this.project.dateLabel(day), `Day ${day}`) }),
      ]),
      el('h2', { id: 'decision-title', dir: 'auto', text: event.title || 'Decision' }),
      el('p', { id: 'decision-text', class: 'decision-text', dir: 'auto', text: event.text || '' }),
      el('div', { class: `decision-opts n${options.length}` }, optionNodes),
      el('div', { class: 'decision-foot' }, [
        icon('pause', 13),
        el('span', { text: 'The project clock is paused until you decide. Press 1–' + options.length + ' or click an option. Chips show the trade-off: green favourable, red unfavourable.' }),
      ]),
    ]);
    clear(this.decisionLayer).appendChild(el('div', { class: 'decision-backdrop' }, [card]));
    this.decisionLayer.classList.add('show');
    setTimeout(() => { if (optionNodes[0]) optionNodes[0].focus({ preventScroll: true }); }, 0);
  }

  _choose(i) {
    const d = this._decision;
    if (!d) return;
    this._decision = null;
    this.decisionLayer.classList.remove('show');
    clear(this.decisionLayer);
    try {
      if (d.onChoose) d.onChoose(i);
    } catch (err) {
      console.error('[hud] decision handler failed', err);
    }
    this._nextDecision();
  }

  _nextDecision() {
    if (this._decision) return;
    const next = this._decisionQueue.shift();
    if (next) this.showDecision(next[0], next[1]);
  }

  /** Close the decision card without choosing (the game resolved it, e.g. QA autoResolve). */
  _dropDecision() {
    if (!this._decision) return;
    this._decision = null;
    this.decisionLayer.classList.remove('show');
    clear(this.decisionLayer);
    setTimeout(() => this._nextDecision(), 0);
  }

  blocking() {
    return !!this._decision;
  }

  /* ============================================================== modals */

  modal(opts = {}) {
    safe(() => this.sim.input.exitPointerLock());
    return openModal(opts);
  }

  modalOpen() {
    return modalCount() > 0 || !!this._decision;
  }

  closeModal() {
    return closeTopModal(null);
  }

  /** Human-in-the-loop approval for AI actions and CCB decisions. Resolves true only on Approve. */
  requestApproval({ title, detail, onApprove, onReject } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const finish = (ok) => {
        if (answered) return;
        answered = true;
        try {
          if (ok && onApprove) onApprove();
          if (!ok && onReject) onReject();
        } catch (err) {
          console.error('[hud] approval handler failed', err);
        }
        resolve(ok);
      };
      const detailNode = detail instanceof Node ? detail : el('p', { class: 'approval-detail', dir: 'auto', text: detail ? String(detail) : '' });
      this.modal({
        title: title || 'Approve this action?', icon: 'shield', kind: 'approval',
        body: [
          el('div', { class: 'approval-who' }, [icon('chat', 15), el('span', { text: 'Human-in-the-loop check — nothing changes unless you approve. You remain accountable for the decision.' })]),
          detailNode,
        ],
        actions: [
          { label: t('action.reject'), kind: 'ghost', onClick: () => finish(false) },
          { label: t('action.approve'), kind: 'primary', icon: 'check', onClick: () => finish(true) },
        ],
        onClose: () => finish(false),
      });
    });
  }

  /* ============================================================ confetti */

  confetti() {
    if (document.body.classList.contains('reduced-motion') || safe(() => this.sim.settings.get('accessibility.reducedMotion'), false)) return;
    const c = this.confettiCanvas;
    const w = (c.width = window.innerWidth);
    const h = (c.height = window.innerHeight);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const colours = ['#c9a227', '#e6c65a', '#9b1b30', '#d63a55', '#5468d4', '#f4f6ff', '#3ddc84'];
    const parts = Array.from({ length: 170 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.32,
      vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
      r: 3 + Math.random() * 5, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.4,
      c: colours[(Math.random() * colours.length) | 0], shape: Math.random() < 0.3 ? 1 : 0,
    }));
    c.classList.add('show');
    const t0 = performance.now();
    const step = (now) => {
      const age = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / 3);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.5, 0, 6.28); ctx.fill(); } else ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
        ctx.restore();
      }
      if (age < 3.2) requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, w, h); c.classList.remove('show'); }
    };
    requestAnimationFrame(step);
  }

  dispose() {
    this.layer.remove();
  }
}
