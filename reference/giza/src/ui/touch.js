import { el } from './dom.js';

/**
 * On-screen controls for phones and tablets.
 *
 * Three things live here: a virtual stick that draws itself wherever the left
 * thumb lands, a pad of action buttons on the right, and a small set of
 * layout rules that keep the pad out of the way when a dashboard panel is
 * open.  Buttons drive the simulation through the same key codes the keyboard
 * uses - `InputManager.setVirtualKey` - so nothing downstream has to know
 * whether the player is on a desk or a train.
 *
 * The layer stays hidden until either the device reports a coarse pointer or
 * a finger actually touches the canvas, so a mouse user never sees it.
 */

/** Buttons shown per mode. `hold` keys stay down while pressed. */
const BUTTONS = {
  archaeologist: [
    { id: 'jump', label: 'Jump', code: 'Space', hold: true, glyph: '⤒' },
    { id: 'run', label: 'Run', code: 'ShiftLeft', hold: true, glyph: '»' },
    { id: 'crouch', label: 'Crouch', code: 'KeyC', hold: true, toggle: true, glyph: '⤓' },
    { id: 'use', label: 'Enter', code: 'KeyE', tap: true, glyph: '⏎' },
  ],
  drone: [
    { id: 'up', label: 'Rise', code: 'Space', hold: true, glyph: '⤒' },
    { id: 'down', label: 'Dive', code: 'KeyQ', hold: true, glyph: '⤓' },
    { id: 'run', label: 'Boost', code: 'ShiftLeft', hold: true, glyph: '»' },
  ],
  manager: [
    { id: 'use', label: 'Inspect', code: 'KeyE', tap: true, glyph: '⏎' },
  ],
  tour: [],
};

export class TouchControls {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.input = sim.input;
    this.mode = null;
    this.enabled = false;
    this.forced = false;

    this.layer = el('div', { class: 'touch-layer' });
    this.stick = el('div', { class: 'touch-stick' }, [el('i', { class: 'touch-knob' })]);
    this.knob = this.stick.firstChild;
    this.pad = el('div', { class: 'touch-pad' });
    this.utility = el('div', { class: 'touch-utility' });
    this.hint = el('div', {
      class: 'touch-hint',
      text: 'Left thumb to move · drag the right side to look · pinch to zoom',
    });
    this.layer.append(this.stick, this.pad, this.utility, this.hint);
    root.appendChild(this.layer);

    this._buildUtility();
    this.setMode(sim.mode);

    // Reveal the moment a finger lands, even on a device we could not sniff.
    this.input.onTouchUsed = () => this.setEnabled(true);
    if (this.input.hasTouch) this.setEnabled(true);
    this._hintUntil = 14;
  }

  _buildUtility() {
    const mk = (label, title, onclick) =>
      el('button', { class: 'touch-util', title, type: 'button', onclick }, [label]);
    this.utility.append(
      mk('◀', 'Previous mode', () => this._cycleMode(-1)),
      mk('▶', 'Next mode', () => this._cycleMode(1)),
      mk('⏱', 'Simulation speed', () => this.sim.hud.cycleSpeed())
    );
  }

  _cycleMode(step) {
    const order = ['archaeologist', 'manager', 'tour', 'drone'];
    const i = order.indexOf(this.sim.mode);
    this.sim.setMode(order[(i + step + order.length) % order.length]);
  }

  setEnabled(on) {
    if (this.enabled === on) return;
    this.enabled = on;
    this.layer.classList.toggle('on', on);
    document.body.classList.toggle('touch-mode', on);
  }

  /** Force the layer on or off from the settings panel or a QA hook. */
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
      const node = el('button', { class: 'touch-btn', type: 'button', 'aria-label': spec.label }, [
        el('b', { text: spec.glyph }),
        el('span', { text: spec.label }),
      ]);
      const press = (ev) => {
        ev.preventDefault();
        if (spec.tap) {
          this.input.tapVirtualKey(spec.code);
          node.classList.add('hit');
          setTimeout(() => node.classList.remove('hit'), 160);
          return;
        }
        if (spec.toggle) {
          const on = !node.classList.contains('held');
          node.classList.toggle('held', on);
          this.input.setVirtualKey(spec.code, on);
          return;
        }
        node.classList.add('held');
        this.input.setVirtualKey(spec.code, true);
      };
      const release = (ev) => {
        if (spec.tap || spec.toggle) return;
        if (ev) ev.preventDefault();
        node.classList.remove('held');
        this.input.setVirtualKey(spec.code, false);
      };
      node.addEventListener('touchstart', press, { passive: false });
      node.addEventListener('touchend', release, { passive: false });
      node.addEventListener('touchcancel', release, { passive: false });
      node.addEventListener('mousedown', press);
      node.addEventListener('mouseup', release);
      node.addEventListener('mouseleave', release);
      node.dataset.code = spec.code;
      this.pad.appendChild(node);
      this.buttons.push({ spec, node });
    }
  }

  _releaseAll() {
    for (const b of this.buttons || []) {
      b.node.classList.remove('held');
      this.input.setVirtualKey(b.spec.code, false);
    }
  }

  /** Follow the stick and hide the pad while a dashboard panel is open. */
  update(dt = 0) {
    if (!this.enabled) return;
    if (this._hintUntil > 0) {
      // The hint retires as soon as the player has moved, or after a while.
      if (this.input.stick.active) this._hintUntil = Math.min(this._hintUntil, 1.4);
      this._hintUntil -= dt;
      this.hint.style.display = this._hintUntil > 0 ? 'block' : 'none';
      this.hint.style.opacity = Math.min(1, this._hintUntil / 1.4).toFixed(2);
    }
    if (this.mode !== this.sim.mode) this.setMode(this.sim.mode);
    const s = this.input.stick;
    this.stick.classList.toggle('on', s.active);
    if (s.active) {
      this.stick.style.transform = `translate(${s.baseX - 68}px, ${s.baseY - 68}px)`;
      this.knob.style.transform = `translate(${s.knobX - s.baseX}px, ${s.knobY - s.baseY}px)`;
    }
    const busy = !!this.sim.dashboard.openId || this.sim.mode === 'tour';
    this.layer.classList.toggle('dim', busy);
  }

  dispose() {
    this._releaseAll();
    this.layer.remove();
    document.body.classList.remove('touch-mode');
  }
}
