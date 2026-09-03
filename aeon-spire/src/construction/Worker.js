/**
 * AEON SPIRE — site workers (E.7).
 *
 * E.7 allows simple low-poly figures with three animation loops, or even
 * instanced billboards if performance demands it. This takes the middle
 * road that looks best for the cost: a low-poly figure whose limbs are
 * separate instanced meshes, animated by writing matrices directly.
 *
 * One InstancedMesh per body part means a hundred workers cost six draw
 * calls, and each still walks, works or stands idle on its own cycle.
 */

import * as THREE from 'three';
import { mergeGeometries, xform, box, cyl, mesh, instance } from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng } from '../core/MathUtil.js';

const STATE = { IDLE: 0, WALK: 1, WORK: 2 };

export class WorkerCrew {
  /**
   * @param {MaterialLibrary} materials
   * @param {number} count how many figures
   * @param {object} opts { seed, area, hiVis }
   */
  constructor(materials, count = 60, { seed = 1, bounds = null } = {}) {
    this.count = count;
    this.group = new THREE.Group();
    this.group.name = 'WorkerCrew';
    this.r = rng(seed);
    this.time = 0;

    const vest = materials.solid('workerVest', {
      color: 0xe8a022, roughness: 0.75, exterior: true, noClip: true
    });
    const helmet = materials.solid('workerHelmet', {
      color: 0xe8e2d0, roughness: 0.5, exterior: true, noClip: true
    });
    const limb = materials.solid('workerLimb', {
      color: 0x3a4250, roughness: 0.8, exterior: true, noClip: true
    });

    /* Body parts, each centred on its own pivot so the matrices below read
       clearly: torso at the hips, arms at the shoulder, legs at the hip. */
    const torsoGeo = mergeGeometries([
      box(0.44, 0.62, 0.26, [0, 0.31, 0]),
      box(0.5, 0.16, 0.3, [0, 0.5, 0])            // the hi-vis band
    ]);
    const headGeo = mergeGeometries([
      box(0.2, 0.22, 0.2, [0, 0.11, 0]),
      cyl(0.16, 0.17, 0.1, 10, [0, 0.26, 0]),      // hard hat
      box(0.22, 0.05, 0.1, [0, 0.22, 0.13])
    ]);
    const armGeo = box(0.11, 0.5, 0.11, [0, -0.25, 0]);
    const legGeo = box(0.14, 0.55, 0.14, [0, -0.275, 0]);

    this.parts = {
      torso: instance(torsoGeo, vest, this._blank(count), { name: 'WorkerTorsos', castShadow: true }),
      head: instance(headGeo, helmet, this._blank(count), { name: 'WorkerHeads', castShadow: true }),
      armL: instance(armGeo, limb, this._blank(count), { name: 'WorkerArmsL' }),
      armR: instance(armGeo, limb, this._blank(count), { name: 'WorkerArmsR' }),
      legL: instance(legGeo, limb, this._blank(count), { name: 'WorkerLegsL' }),
      legR: instance(legGeo, limb, this._blank(count), { name: 'WorkerLegsR' })
    };
    for (const p of Object.values(this.parts)) {
      p.frustumCulled = false;
      this.group.add(p);
    }

    /* Per-worker state. */
    this.workers = [];
    for (let i = 0; i < count; i++) {
      this.workers.push({
        home: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
        yaw: this.r() * TAU,
        state: STATE.IDLE,
        phase: this.r() * TAU,
        speed: 1.1 + this.r() * 0.9,
        timer: this.r() * 6,
        scale: 0.94 + this.r() * 0.14,
        active: false
      });
    }

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  _blank(n) {
    const xs = [];
    for (let i = 0; i < n; i++) xs.push({ pos: [0, -500, 0] });
    return xs;
  }

  /**
   * Place the crew. `zones` is a list of { x, z, radius, kind } work areas;
   * workers are distributed between them and roam within their own patch.
   */
  deploy(zones) {
    this.zones = zones;
    for (let i = 0; i < this.count; i++) {
      const w = this.workers[i];
      const zone = zones[i % zones.length];
      const a = this.r() * TAU;
      const rad = Math.sqrt(this.r()) * zone.radius;
      w.home.set(zone.x + Math.cos(a) * rad, zone.y || 0, zone.z + Math.sin(a) * rad);
      w.pos.copy(w.home);
      w.target.copy(w.home);
      w.zone = zone;
      w.state = this.r() < 0.4 ? STATE.WORK : (this.r() < 0.6 ? STATE.WALK : STATE.IDLE);
    }
  }

  /**
   * @param {number} dt
   * @param {number} activity 0 → nobody on site, 1 → full crew
   */
  update(dt, activity = 1) {
    this.time += dt;
    const live = Math.round(this.count * clamp(activity, 0, 1));
    const m = this._m, q = this._q, e = this._e, v = this._v, s = this._s;

    for (let i = 0; i < this.count; i++) {
      const w = this.workers[i];
      const on = i < live;
      if (!on) {
        // Park unused workers far below the scene rather than resizing the
        // instanced buffers every frame.
        m.makeTranslation(0, -500, 0);
        for (const p of Object.values(this.parts)) p.setMatrixAt(i, m);
        continue;
      }

      /* --- Simple three-state behaviour loop --- */
      w.timer -= dt;
      if (w.timer <= 0) {
        const roll = this.r();
        if (roll < 0.42) {
          w.state = STATE.WORK;
          w.timer = 3 + this.r() * 6;
        } else if (roll < 0.78) {
          w.state = STATE.WALK;
          w.timer = 2.5 + this.r() * 4;
          const a = this.r() * TAU;
          const rad = Math.sqrt(this.r()) * (w.zone ? w.zone.radius : 12);
          w.target.set(
            (w.zone ? w.zone.x : 0) + Math.cos(a) * rad,
            w.home.y,
            (w.zone ? w.zone.z : 0) + Math.sin(a) * rad
          );
        } else {
          w.state = STATE.IDLE;
          w.timer = 2 + this.r() * 4;
        }
      }

      let stride = 0;
      if (w.state === STATE.WALK) {
        v.subVectors(w.target, w.pos);
        v.y = 0;
        const d = v.length();
        if (d > 0.35) {
          v.divideScalar(d);
          w.pos.addScaledVector(v, w.speed * dt);
          w.yaw = Math.atan2(v.x, v.z);
          stride = 1;
        } else {
          w.state = STATE.IDLE;
          w.timer = 1 + this.r() * 3;
        }
      }

      const t = this.time * (w.state === STATE.WALK ? 6.2 : 2.0) + w.phase;
      const bob = w.state === STATE.WALK ? Math.abs(Math.sin(t)) * 0.06 : 0;
      const baseY = w.pos.y + bob;
      const sc = w.scale;

      e.set(0, w.yaw, 0);
      q.setFromEuler(e);
      s.setScalar(sc);

      /* Torso */
      v.set(w.pos.x, baseY + 0.55 * sc, w.pos.z);
      m.compose(v, q, s);
      this.parts.torso.setMatrixAt(i, m);

      /* Head */
      const headNod = w.state === STATE.WORK ? Math.sin(t * 1.6) * 0.12 : 0;
      e.set(headNod, w.yaw, 0);
      q.setFromEuler(e);
      v.set(w.pos.x, baseY + 1.17 * sc, w.pos.z);
      m.compose(v, q, s);
      this.parts.head.setMatrixAt(i, m);
      e.set(0, w.yaw, 0);
      q.setFromEuler(e);

      /* Arms: swing when walking, work in front of the body when working. */
      const swing = stride ? Math.sin(t) * 0.75 : 0;
      const workArm = w.state === STATE.WORK ? -1.15 + Math.sin(t * 2.4) * 0.45 : 0;
      const shoulderY = baseY + 1.05 * sc;
      const cy = Math.cos(w.yaw), sy = Math.sin(w.yaw);
      for (const [key, side] of [['armL', -1], ['armR', 1]]) {
        e.set(w.state === STATE.WORK ? workArm : swing * side, w.yaw, side * 0.12);
        q.setFromEuler(e);
        v.set(w.pos.x + cy * side * 0.28 * sc, shoulderY, w.pos.z - sy * side * 0.28 * sc);
        m.compose(v, q, s);
        this.parts[key].setMatrixAt(i, m);
      }
      e.set(0, w.yaw, 0);
      q.setFromEuler(e);

      /* Legs */
      const hipY = baseY + 0.55 * sc;
      for (const [key, side] of [['legL', -1], ['legR', 1]]) {
        e.set(stride ? Math.sin(t + (side > 0 ? Math.PI : 0)) * 0.62 : 0, w.yaw, 0);
        q.setFromEuler(e);
        v.set(w.pos.x + cy * side * 0.12 * sc, hipY, w.pos.z - sy * side * 0.12 * sc);
        m.compose(v, q, s);
        this.parts[key].setMatrixAt(i, m);
      }
      e.set(0, w.yaw, 0);
      q.setFromEuler(e);
    }

    for (const p of Object.values(this.parts)) p.instanceMatrix.needsUpdate = true;
    this.group.visible = activity > 0.02;
    this.liveCount = live;
  }

  dispose() {
    for (const p of Object.values(this.parts)) {
      p.geometry.dispose();
    }
  }
}
