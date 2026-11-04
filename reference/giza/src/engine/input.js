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
    /** Where the virtual stick is drawn, in client pixels. */
    this.stick = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, radius: 58 };
    /** True once a finger has actually been used, so the touch pad can appear. */
    this.touchUsed = false;
    this.onTouchUsed = null;
    this.hasTouch =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
        (navigator && navigator.maxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    this._virtualKeys = new Set();
    this._pinchDistance = 0;
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
      this._virtualKeys.clear();
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

  /** The two look-side fingers, if there are exactly two of them. */
  _lookPair() {
    const look = [];
    for (const s of this._sticks.values()) if (!s.left) look.push(s);
    return look.length === 2 ? look : null;
  }

  _touchStart(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      // The stick lives wherever the finger lands in the left third, so there
      // is nothing to aim at - the control comes to the thumb.
      const left = t.clientX < window.innerWidth * 0.4 && !this._hasLeftStick();
      this._sticks.set(t.identifier, { left, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, dx: 0, dy: 0 });
      if (left) {
        this.stick.active = true;
        this.stick.baseX = t.clientX;
        this.stick.baseY = t.clientY;
        this.stick.knobX = t.clientX;
        this.stick.knobY = t.clientY;
      }
    }
    const pair = this._lookPair();
    this._pinchDistance = pair ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
    this.touch.active = true;
    if (!this.touchUsed) {
      this.touchUsed = true;
      if (this.onTouchUsed) this.onTouchUsed();
    }
    e.preventDefault();
  }

  _hasLeftStick() {
    for (const s of this._sticks.values()) if (s.left) return true;
    return false;
  }

  _touchMove(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const s = this._sticks.get(t.identifier);
      if (!s) continue;
      if (s.left) {
        const r = this.stick.radius;
        let dx = t.clientX - s.ox;
        let dy = t.clientY - s.oy;
        const len = Math.hypot(dx, dy);
        if (len > r) {
          // Drag the base along once the thumb runs past the ring.
          s.ox += (dx / len) * (len - r);
          s.oy += (dy / len) * (len - r);
          dx = (dx / len) * r;
          dy = (dy / len) * r;
        }
        this.touch.moveX = dx / r;
        this.touch.moveY = dy / r;
        this.stick.baseX = s.ox;
        this.stick.baseY = s.oy;
        this.stick.knobX = s.ox + dx;
        this.stick.knobY = s.oy + dy;
      } else {
        s.dx = t.clientX - s.x;
        s.dy = t.clientY - s.y;
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }

    // Two fingers on the look side pinch to zoom instead of turning the camera.
    const pair = this._lookPair();
    if (pair) {
      const d = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      if (this._pinchDistance > 0 && Math.abs(d - this._pinchDistance) > 6) {
        this.wheel += d > this._pinchDistance ? -1 : 1;
        this._pinchDistance = d;
      } else if (this._pinchDistance === 0) {
        this._pinchDistance = d;
      }
    } else {
      this._pinchDistance = 0;
      for (const t of e.changedTouches) {
        const s = this._sticks.get(t.identifier);
        if (!s || s.left) continue;
        this.mouseDelta.x += (s.dx || 0) * 1.6;
        this.mouseDelta.y += (s.dy || 0) * 1.6;
      }
    }
    for (const s of this._sticks.values()) {
      s.dx = 0;
      s.dy = 0;
    }
    e.preventDefault();
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      const s = this._sticks.get(t.identifier);
      if (s && s.left) {
        this.touch.moveX = 0;
        this.touch.moveY = 0;
        this.stick.active = false;
      }
      this._sticks.delete(t.identifier);
    }
    this._pinchDistance = 0;
    if (this._sticks.size === 0) this.touch.active = false;
  }

  /**
   * Press or release a key on behalf of an on-screen button.  Virtual keys are
   * tracked separately so a physical key released while a button is held does
   * not clear the button, and vice versa.
   */
  setVirtualKey(code, down) {
    if (down) {
      if (!this.keys.has(code)) this._pressedThisFrame.add(code);
      this._virtualKeys.add(code);
      this.keys.add(code);
    } else {
      this._virtualKeys.delete(code);
      this.keys.delete(code);
    }
  }

  /** Tap a key for exactly one frame - used by momentary on-screen buttons. */
  tapVirtualKey(code) {
    this.setVirtualKey(code, true);
    this._releaseNextFrame = this._releaseNextFrame || new Set();
    this._releaseNextFrame.add(code);
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
    if (this._releaseNextFrame && this._releaseNextFrame.size) {
      for (const code of this._releaseNextFrame) this.setVirtualKey(code, false);
      this._releaseNextFrame.clear();
    }
  }

  dispose() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
  }
}
