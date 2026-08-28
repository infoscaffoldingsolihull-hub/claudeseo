/**
 * Camera control: four modes plus a focus override.
 *
 *   walk       first-person, collided, with gravity, stepping and head bob
 *   orbit      turntable around a target, for looking at the whole site
 *   drone      free six-degree-of-freedom flight
 *   cinematic  a scripted keyframe player, used by the guided tours
 *
 * On top of those sits a *focus* override: the close-inspection camera flies
 * to a framed pose, holds it while the info card is open, and flies back to
 * exactly where the player was standing.  Focus is a separate concept from
 * mode precisely so that pressing E in the middle of a guided tour does not
 * destroy the tour's position.
 */
import * as THREE from 'three';
import { clamp } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = -19.0;
const TERMINAL = -32.0;

export const WALK = {
  radius: 0.30,
  standHeight: 1.80,
  crouchHeight: 1.22,
  eyeRatio: 0.935,
  walkSpeed: 3.1,
  runSpeed: 5.9,
  crouchSpeed: 1.55,
  accel: 14.0,
  stepHeight: 0.44,
};

export function createControls(camera, input, collision) {
  const state = {
    mode: 'walk',
    yaw: 0,
    pitch: 0,
    sensitivity: 0.0021,
    invertY: false,
    // walk
    position: new THREE.Vector3(0, 0, -22),
    velocity: new THREE.Vector3(),
    grounded: false,
    crouching: false,
    bob: 0,
    bobAmount: 0,
    // orbit
    orbitTarget: new THREE.Vector3(0, 4, 4),
    orbitDistance: 46,
    orbitAzimuth: Math.PI,
    orbitElevation: 0.42,
    // drone
    dronePosition: new THREE.Vector3(0, 22, -44),
    droneSpeed: 12,
    // cinematic
    cine: null,
    cineTime: 0,
    cinePlaying: false,
    cineSpeed: 1,
    // focus override
    focus: null,
  };

  const tmpForward = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpDelta = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpTarget = new THREE.Vector3();
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  /** Apply yaw/pitch to the camera's orientation. */
  function applyLook() {
    tmpEuler.set(state.pitch, state.yaw, 0, 'YXZ');
    tmpQuat.setFromEuler(tmpEuler);
    camera.quaternion.copy(tmpQuat);
  }

  /** Mouse and touch look, shared by walk and drone. */
  function readLook(dt) {
    let dx = 0;
    let dy = 0;
    if (input.locked) {
      const d = input.takeMouseDelta();
      dx += d.dx;
      dy += d.dy;
    }
    const t = input.takeTouchLook();
    dx += t.dx * 1.35;
    dy += t.dy * 1.35;
    // Arrow keys give a keyboard-only player a full look control.
    const keyRate = 1.9 * dt / state.sensitivity;
    if (input.isDown('ArrowLeft')) dx -= keyRate;
    if (input.isDown('ArrowRight')) dx += keyRate;
    if (input.isDown('ArrowUp')) dy -= keyRate;
    if (input.isDown('ArrowDown')) dy += keyRate;

    state.yaw -= dx * state.sensitivity;
    state.pitch -= dy * state.sensitivity * (state.invertY ? -1 : 1);
    state.pitch = clamp(state.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    // Keep yaw bounded so it never loses float precision in a long session.
    if (state.yaw > Math.PI) state.yaw -= Math.PI * 2;
    if (state.yaw < -Math.PI) state.yaw += Math.PI * 2;
  }

  /** Movement input on the horizontal plane, in camera space. */
  function readMove() {
    let x = 0;
    let z = 0;
    if (input.isDown('KeyW')) z += 1;
    if (input.isDown('KeyS')) z -= 1;
    if (input.isDown('KeyA')) x -= 1;
    if (input.isDown('KeyD')) x += 1;
    x += input.touch.moveX;
    z -= input.touch.moveY;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  function updateWalk(dt) {
    readLook(dt);
    applyLook();

    const wantCrouch = input.isDown('KeyC') || input.isDown('ControlLeft');
    // Only stand back up if there is room to do so.
    if (state.crouching && !wantCrouch) {
      const test = { x: state.position.x, y: state.position.y, z: state.position.z };
      if (collision.isClear(test, WALK.radius, WALK.standHeight)) state.crouching = false;
    } else {
      state.crouching = wantCrouch;
    }
    const activeHeight = state.crouching ? WALK.crouchHeight : WALK.standHeight;

    const move = readMove();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = state.crouching ? WALK.crouchSpeed : (running ? WALK.runSpeed : WALK.walkSpeed);

    tmpForward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    tmpRight.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    tmpDelta.set(0, 0, 0)
      .addScaledVector(tmpForward, move.z)
      .addScaledVector(tmpRight, move.x);
    if (tmpDelta.lengthSq() > 1e-8) tmpDelta.normalize().multiplyScalar(speed);

    // Horizontal velocity eases toward the target, so starting and stopping
    // has weight instead of snapping.
    const blend = 1 - Math.exp(-WALK.accel * dt);
    state.velocity.x += (tmpDelta.x - state.velocity.x) * blend;
    state.velocity.z += (tmpDelta.z - state.velocity.z) * blend;

    state.velocity.y = Math.max(TERMINAL, state.velocity.y + GRAVITY * dt);

    const delta = {
      x: state.velocity.x * dt,
      y: state.velocity.y * dt,
      z: state.velocity.z * dt,
    };
    const result = collision.moveWalker(state.position, delta, WALK.radius, activeHeight, WALK.stepHeight);
    state.grounded = result.grounded;
    if (result.grounded && state.velocity.y < 0) state.velocity.y = 0;
    if (result.hitWall) {
      // Bleed the velocity we could not spend, so we do not accelerate into a
      // wall and then rocket sideways when it ends.
      state.velocity.x *= 0.4;
      state.velocity.z *= 0.4;
    }

    // Head bob, proportional to actual ground speed.
    const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    const targetBob = state.grounded ? clamp(groundSpeed / WALK.runSpeed, 0, 1) : 0;
    state.bobAmount += (targetBob - state.bobAmount) * Math.min(1, dt * 8);
    state.bob += dt * groundSpeed * 1.9;
    const bobY = Math.sin(state.bob * 2) * 0.032 * state.bobAmount;
    const bobX = Math.cos(state.bob) * 0.021 * state.bobAmount;

    const eye = activeHeight * WALK.eyeRatio;
    camera.position.set(
      state.position.x + bobX * Math.cos(state.yaw),
      state.position.y + eye + bobY,
      state.position.z - bobX * Math.sin(state.yaw),
    );
  }

  function updateOrbit(dt) {
    // Dragging with the mouse rotates; the arrow keys do the same job for a
    // keyboard-only player.
    let dx = 0;
    let dy = 0;
    if (input.locked) {
      const d = input.takeMouseDelta();
      dx += d.dx;
      dy += d.dy;
    }
    const t = input.takeTouchLook();
    dx += t.dx;
    dy += t.dy;
    const keyRate = 1.4 * dt / 0.004;
    if (input.isDown('ArrowLeft')) dx -= keyRate;
    if (input.isDown('ArrowRight')) dx += keyRate;
    if (input.isDown('ArrowUp')) dy -= keyRate;
    if (input.isDown('ArrowDown')) dy += keyRate;

    state.orbitAzimuth -= dx * 0.004;
    state.orbitElevation = clamp(state.orbitElevation - dy * 0.004, 0.04, 1.48);

    // The wheel zooms; Minus / Equal do the same job for a keyboard-only
    // player. E is reserved for interaction in every mode, so it is never a
    // camera key.
    const wheel = input.takeWheel();
    if (wheel) state.orbitDistance = clamp(state.orbitDistance * (1 + wheel * 0.12), 9, 190);
    if (input.isDown('Equal')) state.orbitDistance = clamp(state.orbitDistance * (1 - dt * 0.9), 9, 190);
    if (input.isDown('Minus')) state.orbitDistance = clamp(state.orbitDistance * (1 + dt * 0.9), 9, 190);

    // Pan the target across the site.
    const move = readMove();
    if (move.x || move.z) {
      const pan = state.orbitDistance * 0.28 * dt;
      const fwd = new THREE.Vector3(-Math.sin(state.orbitAzimuth), 0, -Math.cos(state.orbitAzimuth));
      const right = new THREE.Vector3(Math.cos(state.orbitAzimuth), 0, -Math.sin(state.orbitAzimuth));
      state.orbitTarget.addScaledVector(fwd, move.z * pan).addScaledVector(right, move.x * pan);
      state.orbitTarget.x = clamp(state.orbitTarget.x, -70, 70);
      state.orbitTarget.z = clamp(state.orbitTarget.z, -70, 70);
    }

    const cosEl = Math.cos(state.orbitElevation);
    camera.position.set(
      state.orbitTarget.x + Math.sin(state.orbitAzimuth) * cosEl * state.orbitDistance,
      state.orbitTarget.y + Math.sin(state.orbitElevation) * state.orbitDistance,
      state.orbitTarget.z + Math.cos(state.orbitAzimuth) * cosEl * state.orbitDistance,
    );
    camera.lookAt(state.orbitTarget);
    tmpEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    state.yaw = tmpEuler.y;
    state.pitch = tmpEuler.x;
  }

  function updateDrone(dt) {
    readLook(dt);
    applyLook();

    const move = readMove();
    let up = 0;
    if (input.isDown('Space')) up += 1;
    if (input.isDown('KeyC') || input.isDown('ControlLeft')) up -= 1;
    const boost = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) ? 3.0 : 1.0;

    const wheel = input.takeWheel();
    if (wheel) state.droneSpeed = clamp(state.droneSpeed * (1 - wheel * 0.14), 2, 70);

    camera.getWorldDirection(tmpForward);
    tmpRight.crossVectors(tmpForward, UP).normalize();
    const speed = state.droneSpeed * boost * dt;
    state.dronePosition
      .addScaledVector(tmpForward, move.z * speed)
      .addScaledVector(tmpRight, move.x * speed)
      .addScaledVector(UP, up * speed);
    state.dronePosition.y = clamp(state.dronePosition.y, 0.6, 220);
    state.dronePosition.x = clamp(state.dronePosition.x, -180, 180);
    state.dronePosition.z = clamp(state.dronePosition.z, -180, 180);
    camera.position.copy(state.dronePosition);
  }

  /** Catmull-Rom through the keyframe positions, clamped at the ends. */
  function sampleSpline(points, t) {
    const n = points.length;
    if (n === 0) return new THREE.Vector3();
    if (n === 1) return points[0].clone();
    const scaled = clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(scaled));
    const f = scaled - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const f2 = f * f;
    const f3 = f2 * f;
    return new THREE.Vector3(
      0.5 * ((2 * p1.x) + (-p0.x + p2.x) * f + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3),
      0.5 * ((2 * p1.y) + (-p0.y + p2.y) * f + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3),
      0.5 * ((2 * p1.z) + (-p0.z + p2.z) * f + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * f2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * f3),
    );
  }

  function updateCinematic(dt) {
    const cine = state.cine;
    if (!cine || !cine.beats.length) return;
    if (state.cinePlaying) state.cineTime += dt * state.cineSpeed;
    const total = cine.total;
    if (state.cineTime >= total) {
      state.cineTime = total;
      state.cinePlaying = false;
      if (cine.onEnd) cine.onEnd();
    }

    // Which beat are we in, and how far through it?
    let acc = 0;
    let index = 0;
    for (let i = 0; i < cine.beats.length; i += 1) {
      const d = cine.beats[i].duration;
      if (state.cineTime <= acc + d || i === cine.beats.length - 1) { index = i; break; }
      acc += d;
    }
    const beat = cine.beats[index];
    const local = clamp((state.cineTime - acc) / Math.max(0.001, beat.duration), 0, 1);
    // Smootherstep within the beat so each move eases in and out.
    const eased = local * local * local * (local * (local * 6 - 15) + 10);
    const global = (index + eased) / Math.max(1, cine.beats.length - 1);

    const pos = sampleSpline(cine.positions, cine.beats.length > 1 ? global : 0);
    const look = sampleSpline(cine.targets, cine.beats.length > 1 ? global : 0);
    camera.position.copy(pos);
    camera.lookAt(look);
    if (cine.currentBeat !== index) {
      cine.currentBeat = index;
      if (cine.onBeat) cine.onBeat(index, beat);
    }
  }

  /** Focus override — the close-inspection camera. */
  function updateFocus(dt) {
    const f = state.focus;
    f.time += dt;
    const t = clamp(f.time / f.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    if (f.releasing) {
      camera.position.lerpVectors(f.pose.position, f.from.position, eased);
      tmpTarget.lerpVectors(f.pose.target, f.from.target, eased);
    } else {
      camera.position.lerpVectors(f.from.position, f.pose.position, eased);
      tmpTarget.lerpVectors(f.from.target, f.pose.target, eased);
    }
    camera.lookAt(tmpTarget);
    if (t >= 1 && f.releasing) {
      state.focus = null;
      // Hand orientation back to the underlying mode without a jump.
      tmpEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      state.yaw = tmpEuler.y;
      state.pitch = tmpEuler.x;
      input.takeMouseDelta();
    }
  }

  const api = {
    state,
    camera,

    get mode() { return state.mode; },
    get focused() { return !!state.focus && !state.focus.releasing; },
    get transitioning() { return !!state.focus; },

    setMode(mode, opts = {}) {
      if (!['walk', 'orbit', 'drone', 'cinematic'].includes(mode)) return false;
      const previous = state.mode;
      state.mode = mode;
      if (mode === 'drone' && previous !== 'drone') {
        state.dronePosition.copy(camera.position);
        if (opts.position) state.dronePosition.copy(opts.position);
      }
      if (mode === 'orbit' && previous !== 'orbit') {
        if (opts.target) state.orbitTarget.copy(opts.target);
        if (opts.distance) state.orbitDistance = opts.distance;
      }
      if (mode === 'walk' && previous !== 'walk' && opts.position) {
        state.position.copy(opts.position);
        state.velocity.set(0, 0, 0);
      }
      if (mode === 'walk') {
        tmpEuler.setFromQuaternion(camera.quaternion, 'YXZ');
        state.yaw = tmpEuler.y;
        state.pitch = clamp(tmpEuler.x, -1.2, 1.2);
      }
      input.takeMouseDelta();
      return true;
    },

    /** Teleport the walker (used by the room jump list and the tours). */
    placeWalker(position, yaw) {
      state.position.set(position.x, position.y, position.z);
      state.velocity.set(0, 0, 0);
      if (yaw !== undefined) state.yaw = yaw;
      state.pitch = 0;
      if (state.mode === 'walk') applyLook();
    },

    /** Frame an object: fly to `pose` and hold until released. */
    focusOn(position, target, duration = 0.55) {
      const from = {
        position: camera.position.clone(),
        target: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3)),
      };
      state.focus = {
        from,
        pose: { position: position.clone(), target: target.clone() },
        time: 0,
        duration: Math.max(0.05, duration),
        releasing: false,
      };
    },

    releaseFocus(duration = 0.45) {
      if (!state.focus) return;
      // Fly back along the same path, from wherever we currently are.
      state.focus.from = {
        position: state.focus.from.position.clone(),
        target: state.focus.from.target.clone(),
      };
      state.focus.pose = {
        position: camera.position.clone(),
        target: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3)),
      };
      state.focus.time = 0;
      state.focus.duration = Math.max(0.05, duration);
      state.focus.releasing = true;
    },

    /** Load a cinematic script. `beats` is [{ position, target, duration }]. */
    setCinematic(script) {
      if (!script || !script.beats || !script.beats.length) {
        state.cine = null;
        return;
      }
      const beats = script.beats;
      state.cine = {
        beats,
        positions: beats.map((b) => new THREE.Vector3().copy(b.position)),
        targets: beats.map((b) => new THREE.Vector3().copy(b.target)),
        total: beats.reduce((s, b) => s + b.duration, 0),
        onBeat: script.onBeat || null,
        onEnd: script.onEnd || null,
        currentBeat: -1,
      };
      state.cineTime = 0;
      state.cinePlaying = true;
    },

    get cinematicProgress() {
      return state.cine ? clamp(state.cineTime / Math.max(0.001, state.cine.total), 0, 1) : 0;
    },
    get cinematicBeat() { return state.cine ? state.cine.currentBeat : -1; },
    get cinematicPlaying() { return state.cinePlaying; },
    setCinematicPlaying(value) { state.cinePlaying = !!value; },
    setCinematicSpeed(value) { state.cineSpeed = clamp(value, 0.25, 4); },
    seekCinematicBeat(index) {
      if (!state.cine) return;
      const i = clamp(index, 0, state.cine.beats.length - 1);
      let acc = 0;
      for (let k = 0; k < i; k += 1) acc += state.cine.beats[k].duration;
      state.cineTime = acc;
      state.cine.currentBeat = -1;
    },

    update(dt) {
      const step = Math.min(dt, 0.05);
      if (state.focus) {
        updateFocus(step);
        return;
      }
      switch (state.mode) {
        case 'orbit': updateOrbit(step); break;
        case 'drone': updateDrone(step); break;
        case 'cinematic': updateCinematic(step); break;
        default: updateWalk(step); break;
      }
    },
  };

  return api;
}
