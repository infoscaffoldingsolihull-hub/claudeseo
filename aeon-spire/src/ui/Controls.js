/**
 * AEON SPIRE — camera and input (E.6).
 *
 * Implements the complete E.6 control table. Two camera modes:
 *
 *   walk — the viewer is 1.7 m tall, gravity holds them to whatever floor
 *          is beneath them, and the floor is resolved analytically from the
 *          site plan plus the interior rooms rather than by ray-casting a
 *          400 000-triangle scene every frame.
 *   fly  — free movement, Q/E for altitude, Shift for a fast traverse.
 *
 * Pointer lock is used for look; a drag fallback keeps the project usable
 * where pointer lock is unavailable (some embedded viewers, and the
 * headless harness).
 */

import * as THREE from 'three';
import { CANAL, COURT, ANNEX, OBSERVATORY, SITE, LEVELS, ZONE_PRESETS } from '../world/SitePlan.js';
import { clamp, lerp, damp, TAU, DEG } from '../core/MathUtil.js';

const EYE_HEIGHT = 1.7;

export class Controls {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement
   * @param {object} app the AeonSpire instance — actions are routed to it
   */
  constructor(camera, domElement, app) {
    this.camera = camera;
    this.dom = domElement;
    this.app = app;

    this.mode = 'fly';                    // 'walk' | 'fly'
    this.enabled = true;
    this.locked = false;
    this.dragging = false;

    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;

    this.velocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.grounded = false;

    this.walkSpeed = 6.2;
    this.walkSprint = 14;
    this.flySpeed = 42;
    this.flySprint = 190;
    this.gravity = 22;

    this.keys = new Set();
    this.footstepTimer = 0;

    /* Camera transitions between presets are eased, not teleported. */
    this.transition = null;

    this._bind();
    this.syncFromCamera();
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  syncFromCamera() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(clamp(dir.y, -1, 1));
  }

  _bind() {
    this._onKeyDown = (e) => this.handleKeyDown(e);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => this.handleMouseMove(e);
    this._onPointerDown = (e) => this.handlePointerDown(e);
    this._onPointerUp = () => { this.dragging = false; };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.app.onPointerLockChange) this.app.onPointerLockChange(this.locked);
    };
    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    /* Touch: drag to look, two fingers to move forward. */
    this._touchLast = null;
    this.dom.addEventListener('touchstart', (e) => {
      this._touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY, n: e.touches.length };
    }, { passive: true });
    this.dom.addEventListener('touchmove', (e) => {
      if (!this._touchLast) return;
      const t = e.touches[0];
      this.applyLook((t.clientX - this._touchLast.x) * 2.2, (t.clientY - this._touchLast.y) * 2.2);
      this._touchLast = { x: t.clientX, y: t.clientY, n: e.touches.length };
      if (e.touches.length >= 2) this.keys.add('KeyW'); else this.keys.delete('KeyW');
    }, { passive: true });
    this.dom.addEventListener('touchend', () => {
      this._touchLast = null;
      this.keys.delete('KeyW');
    }, { passive: true });
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */

  handlePointerDown(e) {
    if (e.button !== 0) return;
    if (!this.locked && this.dom.requestPointerLock) {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.dragging = true; });
    }
    this.dragging = true;
  }

  handleMouseMove(e) {
    if (this.locked) this.applyLook(e.movementX || 0, e.movementY || 0);
    else if (this.dragging) this.applyLook(e.movementX || 0, e.movementY || 0);
  }

  applyLook(dx, dy) {
    if (!this.enabled) return;
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = clamp(this.pitch, -89 * DEG, 89 * DEG);
    // Cancel any running preset transition — the viewer has taken over.
    if (this.transition) this.transition = null;
  }

  /**
   * The E.6 key table. Every binding routes to a named action on the app,
   * so the same actions are callable from the HUD and from the QA harness.
   */
  handleKeyDown(e) {
    const app = this.app;
    // Never swallow the browser's own shortcuts.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const code = e.code;
    this.keys.add(code);

    switch (code) {
      /* ---- Movement modifiers are read continuously in update() ---- */
      case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
      case 'KeyQ': case 'KeyE':
      case 'ShiftLeft': case 'ShiftRight':
        return;

      /* ---- F: walk ↔ fly ---- */
      case 'KeyF':
        e.preventDefault();
        app.setCameraMode(this.mode === 'walk' ? 'fly' : 'walk');
        return;

      /* ---- 1–7: zone presets ---- */
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': {
        e.preventDefault();
        const i = Number(code.slice(5)) - 1;
        app.jumpToZone(i);
        return;
      }

      /* ---- Time of day ---- */
      case 'KeyT': e.preventDefault(); app.cycleTimeOfDay(); return;
      case 'KeyG': e.preventDefault(); app.setTimeOfDay('golden'); return;
      case 'KeyN': e.preventDefault(); app.setTimeOfDay('night'); return;

      /* ---- Weather ---- */
      case 'KeyR': e.preventDefault(); app.toggleRain(); return;

      /* ---- Construction mode ---- */
      case 'KeyC': e.preventDefault(); app.toggleConstruction(); return;
      case 'BracketLeft': e.preventDefault(); app.scrubConstruction(-1); return;
      case 'BracketRight': e.preventDefault(); app.scrubConstruction(1); return;
      case 'Space': e.preventDefault(); app.toggleConstructionPlay(); return;

      /* ---- Presentation ---- */
      case 'KeyM': e.preventDefault(); app.toggleAudio(); return;
      case 'KeyH': e.preventDefault(); app.toggleHelp(); return;
      case 'KeyP': e.preventDefault(); app.togglePhotoMode(); return;

      case 'Escape':
        // Esc releases pointer lock. The browser does this itself when
        // locked; this covers the drag fallback too.
        if (document.exitPointerLock) document.exitPointerLock();
        this.dragging = false;
        return;

      default:
        return;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Camera modes and transitions                                        */
  /* ------------------------------------------------------------------ */

  setMode(mode) {
    this.mode = mode === 'walk' ? 'walk' : 'fly';
    if (this.mode === 'walk') {
      // Drop the viewer onto the nearest floor rather than leaving them
      // hovering wherever fly mode left off.
      const floor = this.floorHeight(this.camera.position);
      this.camera.position.y = floor + EYE_HEIGHT;
      this.verticalVelocity = 0;
    }
    return this.mode;
  }

  /** Ease the camera to a new position and look target over `duration`. */
  moveTo(position, lookAt, duration = 1.5) {
    const from = this.camera.position.clone();
    const target = new THREE.Vector3(position[0], position[1], position[2]);
    const look = new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]);

    // Work out the destination yaw/pitch so the blend is on angles, not on
    // a look-at matrix (which would swing wildly through the poles).
    const dir = look.clone().sub(target).normalize();
    const toYaw = Math.atan2(-dir.x, -dir.z);
    const toPitch = Math.asin(clamp(dir.y, -1, 1));

    let dy = (toYaw - this.yaw) % TAU;
    if (dy > Math.PI) dy -= TAU;
    if (dy < -Math.PI) dy += TAU;

    this.transition = {
      from, target,
      fromYaw: this.yaw, dYaw: dy,
      fromPitch: this.pitch, toPitch,
      t: 0, duration: Math.max(0.001, duration)
    };
    return this.transition;
  }

  /** Snap immediately (used by the screenshot tool and QA). */
  snapTo(position, lookAt) {
    this.transition = null;
    this.camera.position.set(position[0], position[1], position[2]);
    this.camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    this.syncFromCamera();
    this.verticalVelocity = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Floor resolution                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * The height of the ground (or the floor of whatever interior the viewer
   * is standing in) at a world position.
   *
   * Solved analytically from the site plan rather than by ray-casting: the
   * campus is a known set of terraces, decks and pools, and an analytic
   * answer is both exact and free, which matters when it is evaluated every
   * frame at 60 Hz.
   */
  floorHeight(pos) {
    const x = pos.x, z = pos.z;

    /* Inside a modelled interior, stand on that room's floor. */
    const rooms = this.app.world ? this.app.world.interiors.rooms : null;
    if (rooms) {
      let best = null;
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        const b = r.box;
        if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
        // Choose the room whose floor is closest below the viewer.
        const f = b.min.y;
        if (f <= pos.y + 2.5 && (best === null || f > best)) best = f;
      }
      if (best !== null) return best;
    }

    const r = Math.hypot(x, z);

    /* Canal ring: dock promenade, water, quay. */
    if (r < CANAL.innerRadius && r > CANAL.innerRadius - 9) return CANAL.quayLevel;
    if (r >= CANAL.innerRadius && r <= CANAL.outerRadius) {
      // Walking on water is not a feature; float at the surface.
      return CANAL.waterLevel + 0.2;
    }

    /* The podium, as a set of stepped terraces inside the canal. */
    if (r < CANAL.innerRadius - 9) {
      const H = CANAL.podiumHalf;
      const ring = Math.max(Math.abs(x), Math.abs(z));       // rough square plan
      if (ring < H - 24) return LEVELS.podiumTop;
      if (ring < H - 14) return LEVELS.L3;
      if (ring < H - 6) return LEVELS.L2;
      if (ring < H) return LEVELS.B1;
      return CANAL.quayLevel;
    }

    /* Reflection Court. */
    if (z > COURT.startZ && z < COURT.endZ && Math.abs(x) < COURT.halfWidth) {
      if (Math.abs(x) < COURT.poolHalfX && z > COURT.poolStartZ && z < COURT.poolEndZ) {
        return COURT.poolLevel + 0.15;
      }
      const P = COURT.pyramid;
      if (Math.abs(x - P.x) < P.base / 2 && Math.abs(z - P.z) < P.base / 2) return 1.9;
      return 0.42;
    }

    /* Wonder Annex pavilions and promenade. */
    const A = ANNEX;
    if (Math.abs(x - A.blocks.x) < A.blocks.w / 2 && Math.abs(z - A.blocks.z) < A.blocks.d / 2) return 0.5;
    if (Math.abs(x - A.promenade.x) < A.promenade.width / 2 + 4 &&
        Math.abs(z - A.promenade.z) < A.promenade.length / 2) return 0.22;
    const dShow = Math.hypot(x - A.showPlaza.x, z - A.showPlaza.z);
    if (dShow < A.showPlaza.basinRadius) return A.showPlaza.waterLevel + 0.15;
    if (dShow < A.showPlaza.radius + 26) return 0.14;
    if (Math.hypot(x - A.motorsport.x, z - A.motorsport.z) < A.motorsport.w * 0.6) return 0.24;

    /* Leaning Observatory apron. */
    if (Math.hypot(x - OBSERVATORY.x, z - OBSERVATORY.z) < OBSERVATORY.radius + 9) return 0.6;

    /* The campus plaza, then the distant ground. */
    if (r < SITE.plazaRadius) return CANAL.copingLevel;
    return -0.4;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt) {
    if (!this.enabled) return;

    /* A preset transition overrides manual movement while it runs. */
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      // Ease in and out so arriving at a viewpoint feels composed.
      const k = tr.t < 0.5 ? 2 * tr.t * tr.t : 1 - Math.pow(-2 * tr.t + 2, 2) / 2;
      this.camera.position.lerpVectors(tr.from, tr.target, k);
      this.yaw = tr.fromYaw + tr.dYaw * k;
      this.pitch = lerp(tr.fromPitch, tr.toPitch, k);
      if (tr.t >= 1) this.transition = null;
      this.applyRotation();
      return;
    }

    const keys = this.keys;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

    /* Movement basis from yaw only, so looking up does not slow you down. */
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let fx = 0, fz = 0;
    if (keys.has('KeyW')) { fx -= sy; fz -= cy; }
    if (keys.has('KeyS')) { fx += sy; fz += cy; }
    if (keys.has('KeyA')) { fx -= cy; fz += sy; }
    if (keys.has('KeyD')) { fx += cy; fz -= sy; }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }

    if (this.mode === 'fly') {
      const speed = sprint ? this.flySprint : this.flySpeed;
      let vy = 0;
      if (keys.has('KeyE')) vy += 1;
      if (keys.has('KeyQ')) vy -= 1;
      // Pitch contributes to forward motion in fly mode, as a viewer expects.
      const pitchLift = Math.sin(this.pitch) * (keys.has('KeyW') ? 1 : keys.has('KeyS') ? -1 : 0);
      const target = new THREE.Vector3(
        fx * speed * Math.cos(this.pitch * (len > 0 ? 1 : 0)),
        (vy + pitchLift) * speed,
        fz * speed * Math.cos(this.pitch * (len > 0 ? 1 : 0))
      );
      this.velocity.x = damp(this.velocity.x, target.x, 9, dt);
      this.velocity.y = damp(this.velocity.y, target.y, 9, dt);
      this.velocity.z = damp(this.velocity.z, target.z, 9, dt);
      this.camera.position.addScaledVector(this.velocity, dt);
      this.grounded = false;
    } else {
      const speed = sprint ? this.walkSprint : this.walkSpeed;
      const target = new THREE.Vector3(fx * speed, 0, fz * speed);
      this.velocity.x = damp(this.velocity.x, target.x, 13, dt);
      this.velocity.z = damp(this.velocity.z, target.z, 13, dt);
      this.camera.position.x += this.velocity.x * dt;
      this.camera.position.z += this.velocity.z * dt;

      /* Gravity and the floor. */
      const floor = this.floorHeight(this.camera.position) + EYE_HEIGHT;
      this.verticalVelocity -= this.gravity * dt;
      this.camera.position.y += this.verticalVelocity * dt;
      if (this.camera.position.y <= floor) {
        // Step up onto low kerbs and stairs rather than being stopped by them.
        this.camera.position.y = floor;
        this.verticalVelocity = 0;
        this.grounded = true;
      } else if (this.camera.position.y > floor + 0.02) {
        this.grounded = false;
      }
      // Jump with Q, as a convenience — E.6 gives Q to descent in fly mode.
      if (this.grounded && keys.has('KeyE')) this.verticalVelocity = 7.4;

      /* Footsteps, keyed to the surface underfoot. */
      const moving = Math.hypot(this.velocity.x, this.velocity.z) > 1.2;
      if (moving && this.grounded) {
        this.footstepTimer -= dt * (sprint ? 2.3 : 1.5);
        if (this.footstepTimer <= 0) {
          this.footstepTimer = 0.52;
          const room = this.app.world ? this.app.world.interiors.current : null;
          const kind = !room ? 'stepStone'
            : room.acoustic === 'paddedLounge' ? 'stepCarpet'
            : room.acoustic === 'machineRoom' ? 'stepMetal' : 'stepStone';
          this.app.audio.play(kind, { gain: 0.5, rate: 0.92 + Math.random() * 0.18 });
        }
      }
    }

    /* Keep the viewer inside the modelled world. */
    const limit = SITE.extent * 0.42;
    this.camera.position.x = clamp(this.camera.position.x, -limit, limit);
    this.camera.position.z = clamp(this.camera.position.z, -limit, limit);
    this.camera.position.y = clamp(this.camera.position.y, -30, 1400);

    this.applyRotation();
  }

  applyRotation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  status() {
    return {
      mode: this.mode,
      locked: this.locked,
      grounded: this.grounded,
      position: this.camera.position.toArray().map(n => +n.toFixed(1)),
      speed: +Math.hypot(this.velocity.x, this.velocity.z).toFixed(1),
      transitioning: !!this.transition
    };
  }
}
