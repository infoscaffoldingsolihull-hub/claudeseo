/**
 * Keyboard, mouse, pointer lock and touch.
 *
 * Two rules shape this module:
 *
 *   1. Every action is edge-triggered *or* level-triggered on purpose.
 *      Movement reads `isDown`; opening a door reads `pressed`, which is true
 *      for exactly one frame.  Mixing the two is how a door ends up flapping
 *      sixty times a second.
 *   2. Keys are read from `event.code`, the physical key, so WASD works on an
 *      AZERTY or QWERTZ keyboard without the player having to think about it.
 *
 * Anything typed into a form control is never treated as a game key, so the
 * search box in the bill of quantities cannot teleport the camera.
 */

export function createInput(target) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const listeners = new Map();

  const mouse = { dx: 0, dy: 0, wheel: 0, x: 0, y: 0, inside: false };
  const touch = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, active: false };
  let clicks = 0;
  let locked = false;
  let enabled = true;

  function emit(name, payload) {
    const list = listeners.get(name);
    if (list) for (const fn of list) fn(payload);
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function onKeyDown(event) {
    if (!enabled) return;
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
    const code = event.code;
    if (!down.has(code)) pressed.add(code);
    down.add(code);
    emit('key', { code, event });
    // Stop the browser scrolling the page out from under the canvas.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const code = event.code;
    down.delete(code);
    released.add(code);
  }

  function onBlur() {
    down.clear();
    touch.moveX = 0;
    touch.moveY = 0;
    touch.lookX = 0;
    touch.lookY = 0;
  }

  function onMouseMove(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (locked) {
      mouse.dx += event.movementX || 0;
      mouse.dy += event.movementY || 0;
    }
  }

  function onWheel(event) {
    if (!enabled) return;
    mouse.wheel += Math.sign(event.deltaY);
    event.preventDefault();
  }

  function onPointerDown(event) {
    if (!enabled) return;
    if (event.button === 0) clicks += 1;
  }

  function onLockChange() {
    locked = document.pointerLockElement === target;
    emit('lockchange', locked);
    if (!locked) {
      mouse.dx = 0;
      mouse.dy = 0;
    }
  }

  function onLockError() {
    locked = false;
    emit('lockchange', false);
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  /* ------------------------------------------------------------- touch --- */
  // Left half of the screen drives movement, right half drives the look.
  const sticks = new Map();

  function onTouchStart(event) {
    if (!enabled) return;
    for (const t of event.changedTouches) {
      const left = t.clientX < window.innerWidth * 0.5;
      sticks.set(t.identifier, { left, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY });
    }
    touch.active = true;
    emit('touchstart', event);
  }

  function onTouchMove(event) {
    if (!enabled) return;
    for (const t of event.changedTouches) {
      const s = sticks.get(t.identifier);
      if (!s) continue;
      s.x = t.clientX;
      s.y = t.clientY;
    }
    updateTouchAxes();
    if (sticks.size) event.preventDefault();
  }

  function onTouchEnd(event) {
    for (const t of event.changedTouches) sticks.delete(t.identifier);
    updateTouchAxes();
    if (sticks.size === 0) {
      touch.active = false;
      touch.moveX = 0;
      touch.moveY = 0;
    }
  }

  function updateTouchAxes() {
    let mx = 0;
    let my = 0;
    let lx = 0;
    let ly = 0;
    const radius = 78;
    for (const s of sticks.values()) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      if (s.left) {
        mx = Math.max(-1, Math.min(1, dx / radius));
        my = Math.max(-1, Math.min(1, dy / radius));
      } else {
        lx += dx;
        ly += dy;
        s.ox = s.x;
        s.oy = s.y;
      }
    }
    touch.moveX = mx;
    touch.moveY = my;
    touch.lookX += lx;
    touch.lookY += ly;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  target.addEventListener('touchstart', onTouchStart, { passive: false });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd);
  target.addEventListener('touchcancel', onTouchEnd);

  const api = {
    get locked() { return locked; },
    get touchActive() { return touch.active; },
    mouse,
    touch,

    /** True while the key is held. */
    isDown: (code) => down.has(code),

    /** True for exactly one frame, on the transition to down. */
    wasPressed: (code) => pressed.has(code),

    /** True for exactly one frame, on the transition to up. */
    wasReleased: (code) => released.has(code),

    /** Consume a queued left click; returns true at most once per click. */
    takeClick() {
      if (clicks > 0) { clicks -= 1; return true; }
      return false;
    },

    /** Accumulated mouse delta since the last call, then reset. */
    takeMouseDelta() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    },

    /** Accumulated touch look delta since the last call, then reset. */
    takeTouchLook() {
      const d = { dx: touch.lookX, dy: touch.lookY };
      touch.lookX = 0;
      touch.lookY = 0;
      return d;
    },

    takeWheel() {
      const w = mouse.wheel;
      mouse.wheel = 0;
      return w;
    },

    requestLock() {
      if (locked) return;
      const promise = target.requestPointerLock && target.requestPointerLock();
      // Chrome returns a promise; an unhandled rejection here is a console
      // error, and this application ships with zero of those.
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    },

    exitLock() {
      if (document.exitPointerLock) document.exitPointerLock();
    },

    setEnabled(value) {
      enabled = !!value;
      if (!enabled) onBlur();
    },

    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
      return () => {
        const current = listeners.get(name) || [];
        const i = current.indexOf(fn);
        if (i >= 0) current.splice(i, 1);
      };
    },

    /** Clear the edge-triggered sets. Call once at the very end of a frame. */
    endFrame() {
      pressed.clear();
      released.clear();
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchEnd);
      listeners.clear();
    },
  };
  return api;
}
