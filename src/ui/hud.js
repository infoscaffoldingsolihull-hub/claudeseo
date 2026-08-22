import { el, svg, clear, fmtPct, indexClass } from './dom.js';
import { icon } from './panels.js';

/**
 * The heads-up layer: mode switch, live project metrics, the event ticker,
 * Hemiunu's advisory panel, the point-of-interest codex, mission tracker,
 * compass, toasts, the renderer statistics overlay and the help card.
 */

const MODES = [
  { id: 'archaeologist', label: 'Archaeologist', key: '1', hint: 'Walk the plateau and the chambers' },
  { id: 'manager', label: 'Project Manager', key: '2', hint: 'Orbit the site and run the project' },
  { id: 'tour', label: 'Tour Guide', key: '3', hint: 'Guided presentation mode' },
  { id: 'drone', label: 'Drone', key: '4', hint: 'Free cinematic flight' },
];

const SPEEDS = [
  { label: 'Paused', value: 0 },
  { label: '×1', value: 1 },
  { label: '×10', value: 10 },
  { label: '×40', value: 40 },
  { label: '×150', value: 150 },
];

export class HUD {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.project = sim.project;
    this.toasts = [];
    this.lastEventDay = -1;
    this.eventCount = 0;

    this._buildTopBar();
    this._buildOverlays();
    this._buildAdvisor();
    this._buildCodex();
  }

  /* --------------------------------------------------------------- top bar */

  _buildTopBar() {
    this.modeButtons = new Map();
    const modeSwitch = el('div', { class: 'mode-switch' });
    for (const m of MODES) {
      const b = el('button', { class: 'mode-btn', title: m.hint, onclick: () => this.sim.setMode(m.id) }, [
        el('span', { text: m.label }),
        el('kbd', { text: m.key }),
      ]);
      this.modeButtons.set(m.id, b);
      modeSwitch.appendChild(b);
    }

    this.metricNodes = {};
    const metrics = el('div', { class: 'hud-metrics' });
    const addMetric = (id, label) => {
      const value = el('b', { text: '—' });
      const box = el('div', { class: 'metric' }, [value, el('span', { text: label })]);
      this.metricNodes[id] = { box, value };
      metrics.appendChild(box);
      return box;
    };
    addMetric('date', 'Regnal date');
    addMetric('progress', 'Complete');
    addMetric('spi', 'SPI');
    addMetric('cpi', 'CPI');
    addMetric('clock', 'Site time');

    this.speedIndex = 2;
    this.speedButton = el('button', { class: 'mode-btn', title: 'Simulation speed (Space to pause, +/− to change)', onclick: () => this.cycleSpeed() }, [
      el('span', { text: SPEEDS[this.speedIndex].label }),
    ]);

    this.topBar = el('div', { class: 'hud-top' }, [
      el('div', { class: 'brand' }, [
        svg('svg', { viewBox: '0 0 32 24', width: 30, height: 22 }, [
          svg('polygon', { points: '16,2 30,22 2,22', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
          svg('polygon', { points: '16,2 16,22 2,22', fill: 'currentColor', opacity: 0.18 }),
        ]),
        el('div', {}, [el('span', { text: 'DIGITAL GIZA' }), el('small', { text: 'Project Management Simulator' })]),
      ]),
      modeSwitch,
      el('div', { class: 'hud-spacer' }),
      el('div', { class: 'mode-switch' }, [
        this.speedButton,
        el('button', { class: 'mode-btn', title: 'Advisor (H)', onclick: () => this.toggleAdvisor() }, [icon('advisor', 15), el('span', { text: 'Hemiunu' })]),
        el('button', { class: 'mode-btn', title: 'Renderer statistics (F)', onclick: () => this.toggleStats() }, [icon('stats', 15)]),
        el('button', { class: 'mode-btn', title: 'Help & controls (?)', onclick: () => this.toggleHelp() }, [icon('help', 15)]),
      ]),
      metrics,
    ]);
    this.root.appendChild(this.topBar);
  }

  /* -------------------------------------------------------------- overlays */

  _buildOverlays() {
    this.ticker = el('div', { class: 'ticker' });
    this.reticle = el('div', { class: 'reticle' });
    this.poiPrompt = el('div', { class: 'poi-prompt' });
    this.toastStack = el('div', { class: 'toast-stack' });
    this.statsHud = el('div', { class: 'stats-hud' });
    this.compass = el('div', { class: 'compass' }, [(this.compassStrip = el('div', { class: 'compass-strip' }))]);
    this.missionHud = el('div', { class: 'mission-hud' });
    this.narration = el('div', { class: 'narration' });
    this.tourProgress = el('div', { class: 'tour-progress' });
    this.cinebarTop = el('div', { class: 'cinebar top' });
    this.cinebarBottom = el('div', { class: 'cinebar bottom' });
    this.helpOverlay = this._buildHelp();

    for (const node of [
      this.ticker, this.reticle, this.poiPrompt, this.toastStack, this.statsHud,
      this.compass, this.missionHud, this.narration, this.tourProgress,
      this.cinebarTop, this.cinebarBottom, this.helpOverlay,
    ]) {
      this.root.appendChild(node);
    }

    // Compass strip: one label every 15 degrees.
    const labels = [];
    for (let deg = -180; deg <= 540; deg += 15) {
      const d = ((deg % 360) + 360) % 360;
      const cardinal = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
      labels.push(el('span', { class: cardinal ? 'card' : '', text: cardinal || (d % 30 === 0 ? String(d) : '·') }));
    }
    for (const l of labels) this.compassStrip.appendChild(l);
  }

  _buildHelp() {
    const keys = [
      ['W A S D', 'Move'],
      ['Mouse', 'Look'],
      ['Shift', 'Sprint / boost'],
      ['Ctrl / C', 'Crouch'],
      ['Space', 'Jump / ascend'],
      ['Q', 'Descend (drone)'],
      ['E', 'Interact / enter'],
      ['F', 'Renderer statistics'],
      ['H', 'Hemiunu, the AI advisor'],
      ['M', 'Map / mission panel'],
      ['1 2 3 4', 'Switch game mode'],
      ['Tab', 'Open the dashboard'],
      ['Esc', 'Close panel / release mouse'],
      ['P', 'Pause the simulation'],
      ['+ / −', 'Simulation speed'],
      ['[ / ]', 'Time of day'],
      ['← / →', 'Tour: previous / next beat'],
      ['G', 'Toggle the construction ramp'],
      ['N', 'Toggle night'],
      ['?', 'This card'],
    ];
    const card = el('div', { class: 'help-card' }, [
      el('h2', { text: 'DIGITAL GIZA' }),
      el('p', { class: 'note', text:
        'An interactive digital twin of the Giza Necropolis in 2560 BCE, wrapped around a full PMBOK-aligned simulation of ' +
        'the construction of the Great Pyramid. Walk it, fly it, or manage it.' }),
      el('h3', { class: 'section', text: 'Controls' }),
      el('div', { class: 'keys' }, keys.map(([k, d]) => el('div', {}, [el('kbd', { text: k }), el('span', { text: d })]))),
      el('h3', { class: 'section', text: 'The four modes' }),
      el('div', { class: 'grid c2' }, MODES.map((m) => el('div', { class: 'kpi' }, [
        el('div', { class: 'label', text: m.label }),
        el('div', { class: 'foot', text: m.hint }),
      ]))),
      el('h3', { class: 'section', text: 'Presenting this' }),
      el('p', { class: 'note', html:
        'Press <kbd>3</kbd> for Tour Guide mode: a scripted camera tour with narration, driven with the arrow keys, ' +
        'designed to run on a projector. Append <em>?quality=high</em> to the URL to pin the graphics tier if you know ' +
        'the machine. Everything runs offline from this single file.' }),
      el('div', { class: 'row', style: { marginTop: '16px' } }, [
        el('button', { class: 'action', text: 'Close', onclick: () => this.toggleHelp(false) }),
      ]),
    ]);
    return el('div', { class: 'help-overlay', onclick: (e) => { if (e.target === this.helpOverlay) this.toggleHelp(false); } }, [card]);
  }

  /* -------------------------------------------------------------- advisor */

  _buildAdvisor() {
    this.advisorBody = el('div', { class: 'advisor-body' });
    this.advisorPanel = el('div', { class: 'advisor' }, [
      el('div', { class: 'advisor-head' }, [
        el('div', { class: 'advisor-face' }, [icon('advisor', 22)]),
        el('div', {}, [
          el('b', { text: 'Hemiunu' }),
          el('span', { text: 'Overseer of all the King’s Works' }),
        ]),
        el('div', { class: 'grow', style: { flex: 1 } }),
        el('button', { class: 'panel-close', text: '✕', onclick: () => this.toggleAdvisor(false) }),
      ]),
      this.advisorBody,
    ]);
    this.root.appendChild(this.advisorPanel);
  }

  toggleAdvisor(force) {
    const open = force === undefined ? !this.advisorPanel.classList.contains('open') : force;
    this.advisorPanel.classList.toggle('open', open);
    if (open) this.refreshAdvisor();
  }

  refreshAdvisor() {
    const advice = this.sim.advisor.analyse();
    const body = clear(this.advisorBody);
    body.appendChild(el('p', { class: 'note', style: { marginTop: 0 }, text: this.sim.advisor.headline() }));
    for (const a of advice) {
      body.appendChild(el('div', { class: `advice ${a.severity}` }, [
        el('b', { text: a.title }),
        el('span', { class: 'why', text: a.why }),
        el('span', { class: 'rec', text: `→ ${a.recommendation}` }),
        a.impact ? el('span', { class: 'why', style: { display: 'block', marginTop: '3px' }, text: a.impact }) : null,
        a.action ? el('div', { style: { marginTop: '6px' } }, [
          el('button', { class: 'action', text: 'Apply recommendation', onclick: () => this.applyAction(a.action) }),
        ]) : null,
      ]));
    }
  }

  applyAction(action) {
    const p = this.project;
    if (action.type === 'staffing') {
      p.setStaffing(action.resource, action.value);
      this.toast(`${p.resourceById.get(action.resource).name} set to ${action.value.toLocaleString()}`, 'good');
    } else if (action.type === 'risk') {
      p.respondToRisk(action.risk, action.strategy);
      this.toast(`${action.risk} response set to ${action.strategy}`, 'good');
    } else if (action.type === 'inspection') {
      p.setInspectionLevel(action.value);
      this.toast(`Inspection level raised to ${action.value.toFixed(2)}`, 'good');
    } else if (action.type === 'crash' && action.plan) {
      for (const c of action.plan) p.crashActivity(c.id, c.crashDays);
      this.toast('Crash plan applied to the critical path', 'good');
    }
    this.refreshAdvisor();
    if (this.sim.dashboard.openId) this.sim.dashboard.render();
  }

  /* ---------------------------------------------------------------- codex */

  _buildCodex() {
    this.codexBody = el('div', { class: 'codex-body' });
    this.codex = el('div', { class: 'codex' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: 'Site Codex' }),
        el('div', { class: 'grow', style: { flex: 1 } }),
        el('button', { class: 'panel-close', text: '✕', onclick: () => this.closeCodex() }),
      ]),
      this.codexBody,
    ]);
    this.root.appendChild(this.codex);
  }

  showCodex(poi) {
    const body = clear(this.codexBody);
    body.appendChild(el('h4', { text: poi.name }));
    body.appendChild(el('p', { text: poi.text }));
    if (poi.pm) body.appendChild(el('div', { class: 'codex-pm', html: `<b>Project management:</b> ${poi.pm}` }));
    this.codex.classList.add('open');
  }

  closeCodex() {
    this.codex.classList.remove('open');
  }

  /* --------------------------------------------------------------- toasts */

  toast(text, kind = '') {
    const node = el('div', { class: `toast ${kind}`, text });
    this.toastStack.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity 400ms';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 420);
    }, 3200);
  }

  /* ------------------------------------------------------------ narration */

  showNarration(title, text, pmNote) {
    const n = clear(this.narration);
    n.appendChild(el('h3', { text: title }));
    n.appendChild(el('p', { text }));
    if (pmNote) n.appendChild(el('div', { class: 'pm-note', text: pmNote }));
    this.narration.classList.add('show');
  }

  hideNarration() {
    this.narration.classList.remove('show');
  }

  setTourProgress(index, total) {
    const p = clear(this.tourProgress);
    for (let i = 0; i < total; i++) p.appendChild(el('i', { class: i <= index ? 'done' : '' }));
  }

  setCinematic(on) {
    document.body.classList.toggle('cinematic', on);
    if (!on) {
      this.hideNarration();
      clear(this.tourProgress);
    }
  }

  /* --------------------------------------------------------------- toggles */

  toggleStats(force) {
    const on = force === undefined ? !this.statsHud.classList.contains('show') : force;
    this.statsHud.classList.toggle('show', on);
  }

  toggleHelp(force) {
    const on = force === undefined ? !this.helpOverlay.classList.contains('open') : force;
    this.helpOverlay.classList.toggle('open', on);
    if (on) this.sim.input.exitPointerLock();
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.applySpeed();
  }

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.applySpeed();
  }

  applySpeed() {
    const s = SPEEDS[this.speedIndex];
    this.sim.simulationSpeed = s.value;
    clear(this.speedButton).appendChild(el('span', { text: s.label }));
    this.speedButton.classList.toggle('active', s.value > 0);
  }

  /* ---------------------------------------------------------------- update */

  update(dt) {
    const p = this.project;
    const s = p.snapshot();

    for (const [id, button] of this.modeButtons) button.classList.toggle('active', id === this.sim.mode);

    const m = this.metricNodes;
    m.date.value.textContent = `Y${s.date.regnalYear}`;
    m.date.box.querySelector('span').textContent = `${s.date.month} ${s.date.day} · ${s.date.season.name.split(' — ')[0]}`;
    m.progress.value.textContent = fmtPct(s.progress, 1);
    // Both indices are meaningless in the first weeks; don't cry wolf.
    const settled = s.progress > 0.015;
    m.spi.value.textContent = settled ? s.spi.toFixed(2) : '—';
    m.spi.box.className = `metric ${settled ? indexClass(s.spi) : ''}`;
    m.cpi.value.textContent = settled ? s.cpi.toFixed(2) : '—';
    m.cpi.box.className = `metric ${settled ? indexClass(s.cpi) : ''}`;
    m.clock.value.textContent = this.sim.world.sky.clockString();

    // Event ticker. The events array is capped, so its length saturates —
    // track the monotonic serial instead.
    if (p.eventSerial !== this.eventCount) {
      this.eventCount = p.eventSerial;
      const latest = p.events[0];
      if (latest && latest.serial !== this.lastRenderedEvent) {
        this.lastRenderedEvent = latest.serial;
        const node = el('div', { class: `event ${latest.kind}` }, [
          el('div', {}, [el('span', { class: 'when', text: latest.date.label }), el('b', { text: latest.title })]),
          el('div', { text: latest.detail }),
        ]);
        this.ticker.appendChild(node);
        while (this.ticker.children.length > 4) this.ticker.removeChild(this.ticker.firstChild);
        setTimeout(() => {
          node.style.transition = 'opacity 600ms';
          node.style.opacity = '0';
          setTimeout(() => node.remove(), 620);
        }, 9000);
        if (latest.kind === 'risk') this.toast(latest.title, 'bad');
      }
    }

    // Mission tracker.
    const mission = p.activeMission;
    // The mission card lives where the dashboard opens, so it yields to it.
    const missionVisible = mission && this.sim.mode !== 'tour' && !this.sim.dashboard.openId;
    if (missionVisible) {
      this.missionHud.classList.add('show');
      if (this._missionId !== mission.id || this._missionTick !== mission.objectives.filter((o) => o.done).length) {
        this._missionId = mission.id;
        this._missionTick = mission.objectives.filter((o) => o.done).length;
        const node = clear(this.missionHud);
        node.appendChild(el('h4', { text: `${mission.id} · ${mission.name}` }));
        node.appendChild(el('div', { class: 'brief', text: mission.brief }));
        for (const o of mission.objectives) {
          node.appendChild(el('div', { class: `objective ${o.done ? 'done' : ''}` }, [el('span', { class: 'box' }), el('span', { text: o.text })]));
        }
      }
    } else {
      this.missionHud.classList.remove('show');
    }

    // Compass and reticle for first-person modes.
    const fp = this.sim.mode === 'archaeologist';
    this.reticle.classList.toggle('show', fp);
    this.compass.classList.toggle('show', fp || this.sim.mode === 'drone');
    if (this.compass.classList.contains('show')) {
      const yaw = fp ? this.sim.walker.yaw : this.sim.drone.yaw;
      const deg = ((-yaw * 180) / Math.PI) % 360;
      this.compassStrip.style.transform = `translateX(${-deg * (40 / 15) - 40 * 12 + 130}px)`;
    }

    // Renderer statistics.
    if (this.statsHud.classList.contains('show')) {
      const st = this.sim.engine.stats;
      this.statsHud.innerHTML =
        `<b>${st.fps.toFixed(0)}</b> fps &nbsp; ${st.tier}<br>` +
        `${st.calls} draw calls<br>${st.triangles.toLocaleString()} triangles<br>` +
        `${st.geometries} geometries · ${st.textures} textures<br>` +
        `${this.sim.world.pyramids.khufu.totalInstances.toLocaleString()} block instances<br>` +
        `${(2.3e6).toLocaleString()} conceptual blocks`;
    }
  }

  /** Enter/exit prompt shown when the player is near the pyramid entrance. */
  setPrompt(text) {
    if (!text) {
      this.poiPrompt.classList.remove('show');
      return;
    }
    this.poiPrompt.innerHTML = `<kbd>E</kbd>${text}`;
    this.poiPrompt.classList.add('show');
  }
}

export { MODES, SPEEDS };
