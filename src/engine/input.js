/**
 * Unified input: keyboard, pointer-lock mouse look, wheel, and a touch layer
 * with a virtual stick (left half) plus drag-to-look (right half).
 */
export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.wheel = 0;
    this.pointerLocked = false;
    this.buttons = new Set();
    this.touch = { active: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    this.enabled = true;
    this._pressedThisFrame = new Set();
    this._sticks = new Map();
    this._listeners = [];
    this._captureTargets = new Set();

    this._bind(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (this._isTextTarget(e.target)) return;
      const code = e.code;
      if (!this.keys.has(code)) this._pressedThisFrame.add(code);
      this.keys.add(code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
        e.preventDefault();
      }
    });
    this._bind(window, 'keyup', (e) => this.keys.delete(e.code));
    this._bind(window, 'blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });

    this._lastClientX = 0;
    this._lastClientY = 0;
    this._bind(this.dom, 'mousedown', (e) => {
      this.buttons.add(e.button);
      this._lastClientX = e.clientX;
      this._lastClientY = e.clientY;
    });
    this._bind(window, 'mouseup', (e) => this.buttons.delete(e.button));
    this._bind(window, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.mouseDelta.x += e.movementX || 0;
        this.mouseDelta.y += e.movementY || 0;
      } else if (this.buttons.size > 0) {
        // Not locked: orbit and drone modes look by dragging with a held button.
        this.mouseDelta.x += e.clientX - this._lastClientX;
        this.mouseDelta.y += e.clientY - this._lastClientY;
      }
      this._lastClientX = e.clientX;
      this._lastClientY = e.clientY;
    });
    this._bind(this.dom, 'wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    this._bind(this.dom, 'contextmenu', (e) => e.preventDefault());

    this._bind(document, 'pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      if (!this.pointerLocked) this.mouseDelta.x = this.mouseDelta.y = 0;
    });

    this._bind(this.dom, 'touchstart', (e) => this._touchStart(e), { passive: false });
    this._bind(this.dom, 'touchmove', (e) => this._touchMove(e), { passive: false });
    this._bind(this.dom, 'touchend', (e) => this._touchEnd(e), { passive: false });
    this._bind(this.dom, 'touchcancel', (e) => this._touchEnd(e), { passive: false });
  }

  _bind(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _isTextTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  _touchStart(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const left = t.clientX < window.innerWidth * 0.42;
      this._sticks.set(t.identifier, { left, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY });
    }
    this.touch.active = true;
    e.preventDefault();
  }

  _touchMove(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const s = this._sticks.get(t.identifier);
      if (!s) continue;
      if (s.left) {
        const dx = (t.clientX - s.ox) / 64;
        const dy = (t.clientY - s.oy) / 64;
        this.touch.moveX = Math.max(-1, Math.min(1, dx));
        this.touch.moveY = Math.max(-1, Math.min(1, dy));
      } else {
        this.mouseDelta.x += (t.clientX - s.x) * 1.6;
        this.mouseDelta.y += (t.clientY - s.y) * 1.6;
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }
    e.preventDefault();
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      const s = this._sticks.get(t.identifier);
      if (s && s.left) {
        this.touch.moveX = 0;
        this.touch.moveY = 0;
      }
      this._sticks.delete(t.identifier);
    }
    if (this._sticks.size === 0) this.touch.active = false;
  }

  requestPointerLock() {
    if (this.dom.requestPointerLock) {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True only on the frame the key transitioned to down. */
  pressed(code) {
    return this._pressedThisFrame.has(code);
  }

  /** Movement axes in the range [-1,1]; merges keyboard and touch stick. */
  axes() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyW', 'ArrowUp')) y -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) y += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    x += this.touch.moveX;
    y += this.touch.moveY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Consume the accumulated mouse/touch look delta for this frame. */
  consumeLook() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return d;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this._pressedThisFrame.clear();
  }

  dispose() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
  }
}
