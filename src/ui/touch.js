import { el, icon } from './dom.js';

/**
 * On-screen controls for phones and tablets.
 *
 * A virtual stick that draws itself wherever the left thumb lands (the input
 * manager does the maths), drag-to-look and pinch-to-zoom on the right, a pad
 * of per-mode action buttons, and a utility strip (previous/next mode, speed,
 * dashboard, MEHRAN). Movement buttons drive the simulation through the same
 * key codes the keyboard uses (`InputManager.setVirtualKey`); actions that
 * main.js handles on keydown (inspect, photo, tour beats) call `sim` directly.
 *
 * The layer stays hidden until the device reports touch or a finger lands on
 * the canvas, so mouse users never see it. T (or Settings) forces it.
 */

const ORDER = ['inspector', 'manager', 'tour', 'drone', 'ops'];

/** Per-mode buttons. `hold`: key held while pressed · `toggle`: latch · `run(sim)`: direct action. */
const BUTTONS = {
  inspector: [
    { id: 'jump', label: 'Jump', code: 'Space', hold: true, icon: 'up' },
    { id: 'sprint', label: 'Sprint', code: 'ShiftLeft', hold: true, icon: 'next' },
    { id: 'crouch', label: 'Crouch', code: 'ControlLeft', toggle: true, icon: 'down' },
    { id: 'use', label: 'Inspect', icon: 'eye', run: (sim) => sim.interact && sim.interact() },
  ],
  manager: [
    { id: 'zin', label: 'Zoom in', code: 'KeyE', hold: true, icon: 'up' },
    { id: 'zout', label: 'Zoom out', code: 'KeyQ', hold: true, icon: 'down' },
    { id: 'dash', label: 'Panels', icon: 'menu', run: (sim) => sim.dashboard && sim.dashboard.toggle(sim.dashboard.openId || 'charter') },
  ],
  drone: [
    { id: 'up', label: 'Rise', code: 'Space', hold: true, icon: 'up' },
    { id: 'down', label: 'Dive', code: 'KeyQ', hold: true, icon: 'down' },
    { id: 'boost', label: 'Boost', code: 'ShiftLeft', hold: true, icon: 'next' },
    { id: 'photo', label: 'Photo', icon: 'camera', run: (sim) => (sim.photoMode ? sim.capturePNG && sim.capturePNG() : sim.setPhotoMode && sim.setPhotoMode(true)) },
  ],
  tour: [
    { id: 'prev', label: 'Previous', icon: 'prev', run: (sim) => sim.tour && sim.tour.previous && sim.tour.previous() },
    { id: 'next', label: 'Next', icon: 'next', run: (sim) => sim.tour && sim.tour.next && sim.tour.next() },
  ],
  ops: [
    { id: 'zin', label: 'Zoom in', code: 'KeyE', hold: true, icon: 'up' },
    { id: 'zout', label: 'Zoom out', code: 'KeyQ', hold: true, icon: 'down' },
    { id: 'tower', label: 'KPIs', icon: 'tower', run: (sim) => sim.dashboard && sim.dashboard.toggle('operations') },
  ],
};

export class TouchControls {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.input = sim.input;
    this.mode = null;
    this.enabled = false;
    this.forced = false;
    this.buttons = [];

    this.layer = el('div', { class: 'touch-layer', 'aria-label': 'Touch controls' });
    this.stick = el('div', { class: 'touch-stick', 'aria-hidden': 'true' }, [el('i', { class: 'touch-knob' })]);
    this.knob = this.stick.firstChild;
    this.pad = el('div', { class: 'touch-pad', role: 'group', 'aria-label': 'Actions' });
    this.utility = el('div', { class: 'touch-utility', role: 'group', 'aria-label': 'Mode and speed' });
    this.hint = el('div', { class: 'touch-hint', text: 'Left thumb to move · drag the right side to look · pinch to zoom' });
    this.layer.append(this.stick, this.pad, this.utility, this.hint);
    root.appendChild(this.layer);

    this._buildUtility();
    this.setMode(sim.mode);
    if (this.input) {
      this.input.onTouchUsed = () => this.setEnabled(true);
      if (this.input.hasTouch) this.setEnabled(true);
    }
    this._hintUntil = 14;
  }

  _buildUtility() {
    const mk = (glyph, label, onclick, cls = '') => el('button', { type: 'button', class: `touch-util ${cls}`.trim(), title: label, 'aria-label': label, onclick }, [icon(glyph, 17)]);
    this.speedLabel = el('span', { class: 'touch-speed', text: '×10' });
    const speedBtn = el('button', { type: 'button', class: 'touch-util wide', title: 'Simulation speed', 'aria-label': 'Simulation speed', onclick: () => this.sim.hud && this.sim.hud.cycleSpeed && this.sim.hud.cycleSpeed() }, [icon('play', 15), this.speedLabel]);
    this.utility.append(
      mk('prev', 'Previous mode', () => this._cycleMode(-1)),
      mk('next', 'Next mode', () => this._cycleMode(1)),
      speedBtn,
      mk('menu', 'Dashboard', () => this.sim.dashboard && this.sim.dashboard.toggle(this.sim.dashboard.openId || 'charter')),
      mk('chat', 'MEHRAN', () => this.sim.chat && this.sim.chat.toggle && this.sim.chat.toggle()),
    );
  }

  _cycleMode(step) {
    if (this.sim.hud && this.sim.hud.cycleMode) {
      this.sim.hud.cycleMode(step);
      return;
    }
    const i = ORDER.indexOf(this.sim.mode);
    if (this.sim.setMode) this.sim.setMode(ORDER[(i + step + ORDER.length) % ORDER.length]);
  }

  setEnabled(on) {
    on = !!on;
    if (this.enabled === on) return;
    this.enabled = on;
    this.layer.classList.toggle('on', on);
    document.body.classList.toggle('touch-mode', on);
    if (!on) this._releaseAll();
  }

  /** Force the layer on or off (T key, Settings, QA). Returns the new state. */
  toggle() {
    this.forced = !this.enabled;
    this.setEnabled(this.forced);
    return this.enabled;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this._releaseAll();
    this.pad.replaceChildren();
    this.buttons = [];
    for (const spec of BUTTONS[mode] || []) {
      const node = el('button', { type: 'button', class: 'touch-btn', 'aria-label': spec.label, dataset: { id: spec.id } }, [
        icon(spec.icon, 22),
        el('span', { text: spec.label }),
      ]);
      const press = (ev) => {
        ev.preventDefault();
        if (spec.run) {
          spec.run(this.sim);
          node.classList.add('hit');
          setTimeout(() => node.classList.remove('hit'), 160);
          return;
        }
        if (spec.toggle) {
          const on = !node.classList.contains('held');
          node.classList.toggle('held', on);
          node.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (this.input) this.input.setVirtualKey(spec.code, on);
          return;
        }
        node.classList.add('held');
        if (this.input) this.input.setVirtualKey(spec.code, true);
      };
      const release = (ev) => {
        if (spec.run || spec.toggle) return;
        if (ev && ev.cancelable) ev.preventDefault();
        node.classList.remove('held');
        if (this.input) this.input.setVirtualKey(spec.code, false);
      };
      node.addEventListener('touchstart', press, { passive: false });
      node.addEventListener('touchend', release, { passive: false });
      node.addEventListener('touchcancel', release, { passive: false });
      node.addEventListener('mousedown', press);
      node.addEventListener('mouseup', release);
      node.addEventListener('mouseleave', release);
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') press(e); });
      node.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') release(e); });
      if (spec.code) node.dataset.code = spec.code;
      this.pad.appendChild(node);
      this.buttons.push({ spec, node });
    }
  }

  _releaseAll() {
    for (const b of this.buttons || []) {
      b.node.classList.remove('held');
      if (b.spec.code && this.input) this.input.setVirtualKey(b.spec.code, false);
    }
  }

  /** Follow the stick, keep the speed label current, dim while a panel or the tour owns the screen. */
  update(dt = 0) {
    if (!this.enabled) return;
    if (this._hintUntil > 0) {
      if (this.input && this.input.stick && this.input.stick.active) this._hintUntil = Math.min(this._hintUntil, 1.4);
      this._hintUntil -= dt;
      this.hint.style.display = this._hintUntil > 0 ? 'block' : 'none';
      this.hint.style.opacity = Math.min(1, this._hintUntil / 1.4).toFixed(2);
    }
    if (this.mode !== this.sim.mode) this.setMode(this.sim.mode);
    const s = this.input && this.input.stick;
    if (s) {
      this.stick.classList.toggle('on', !!s.active);
      if (s.active) {
        this.stick.style.transform = `translate(${s.baseX - 68}px, ${s.baseY - 68}px)`;
        this.knob.style.transform = `translate(${s.knobX - s.baseX}px, ${s.knobY - s.baseY}px)`;
      }
    }
    const v = this.sim.simulationSpeed;
    const label = v ? `×${v}` : '❚❚';
    if (this.speedLabel.textContent !== label) this.speedLabel.textContent = label;
    const busy = !!(this.sim.dashboard && this.sim.dashboard.openId);
    this.layer.classList.toggle('dim', busy);
    this.layer.classList.toggle('stickless', this.sim.mode === 'tour');
  }

  dispose() {
    this._releaseAll();
    this.layer.remove();
    document.body.classList.remove('touch-mode');
  }
}
