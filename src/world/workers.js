import * as THREE from 'three';
import { mergeGeometries } from './aircraft.js';

/**
 * Construction workforce: one InstancedMesh (one draw call) of hard-hatted,
 * hi-vis-vested workers. Limbs are animated in the vertex shader from a
 * per-instance gait (walk / work / sit), so the CPU only writes root
 * matrices. The same crowd shader drives the terminal passengers.
 *
 *   new WorkerCrowd(scene, quality, layout?)
 *   crowd.setActivity({ fronts:[{ wbsId, x, z, radius, kind }], workforce 0..1, operational })
 *   crowd.update(dt, { groundAt?, camera? })
 *   crowd.dispose()
 */

/* ======================================================= crowd kit (shared) */

export const LIMB = { BODY: 0, LEG_L: 1, LEG_R: 2, ARM_L: 3, ARM_R: 4 };
/** Colour slots resolved per instance in the shader. */
export const SLOT = { FIXED: 0, A: 1, B: 2, C: 3, SKIN: 4, D: 5 };

/** Tag a geometry with limb id, pivot height and colour slot (+ a fixed colour for SLOT.FIXED). */
export function tagPart(geometry, limb, pivotY, slot, color = 0xffffff) {
  const n = geometry.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('aLimb', new THREE.BufferAttribute(new Float32Array(n).fill(limb), 1));
  geometry.setAttribute('aPivotY', new THREE.BufferAttribute(new Float32Array(n).fill(pivotY), 1));
  geometry.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry;
}

/** Box with its base centred at (x, y, z). */
export function pbox(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

const CROWD_VERT_PARS = /* glsl */ `
  attribute float aLimb;
  attribute float aPivotY;
  attribute float aSlot;
  attribute vec4 aGait;     // x stride rate, y amplitude, z phase, w pose (0 walk, 1 work, 2 sit, 3 idle)
  attribute vec3 aColA;
  attribute vec3 aColB;
  attribute vec3 aColC;
  attribute vec4 aColD;     // rgb = slot D colour, a = skin tone 0..1
  uniform float uCrowdTime;
  float crowdSwing() {
    if (aLimb < 0.5) return 0.0;
    float pose = aGait.w;
    float t = uCrowdTime * aGait.x + aGait.z;
    bool leg = aLimb < 2.5;
    float back = (aLimb == 1.0 || aLimb == 4.0) ? 0.0 : 3.14159265;
    if (pose > 1.5 && pose < 2.5) {               // sitting
      return leg ? -1.45 : -0.35 + 0.05 * sin(t * 0.3 + back);
    }
    if (pose > 0.5 && pose < 1.5) {               // working: arms hammer / shovel, legs planted
      if (leg) return 0.0;
      return -0.9 + sin(t + (aLimb == 3.0 ? 0.0 : 0.6)) * aGait.y;
    }
    if (pose > 2.5) {                             // idle: tiny sway
      return leg ? 0.0 : sin(t * 0.4 + back) * 0.06;
    }
    float amp = leg ? aGait.y : aGait.y * 0.6;
    return sin(t + back) * amp;
  }
`;

/**
 * Crowd material: MeshStandardMaterial + limb animation + per-instance colour
 * slots. `time` is the shared { value } uniform the owner advances.
 */
export function createCrowdMaterial(time, { roughness = 0.82 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrowdTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CROWD_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          float sw = crowdSwing();
          float s = sin(sw); float c = cos(sw);
          float ny = objectNormal.y; float nz = objectNormal.z;
          objectNormal.y = ny * c - nz * s;
          objectNormal.z = ny * s + nz * c;
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float sw = crowdSwing();
          float s = sin(sw); float c = cos(sw);
          if (aLimb > 0.5) {
            float dy = transformed.y - aPivotY;
            float dz = transformed.z;
            transformed.y = aPivotY + dy * c - dz * s;
            transformed.z = dy * s + dz * c;
          }
          // working pose: bend at the waist
          if (aGait.w > 0.5 && aGait.w < 1.5 && transformed.y > 0.95) {
            float b = 0.35 + 0.15 * sin(uCrowdTime * aGait.x + aGait.z);
            float dy = transformed.y - 0.95;
            transformed.z += dy * sin(b);
            transformed.y = 0.95 + dy * cos(b);
          }
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        {
          vec3 skin = mix(vec3(0.62, 0.40, 0.26), vec3(0.33, 0.20, 0.12), aColD.a);
          if (aSlot > 0.5 && aSlot < 1.5) vColor.rgb = aColA;
          else if (aSlot > 1.5 && aSlot < 2.5) vColor.rgb = aColB;
          else if (aSlot > 2.5 && aSlot < 3.5) vColor.rgb = aColC;
          else if (aSlot > 3.5 && aSlot < 4.5) vColor.rgb = skin;
          else if (aSlot > 4.5) vColor.rgb = aColD.rgb;
        }`);
  };
  m.customProgramCacheKey = () => 'hdd-crowd-v1';
  return m;
}

/** Allocate the per-instance attributes on a crowd geometry. */
export function crowdAttributes(geometry, capacity) {
  const mk = (size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const attrs = { gait: mk(4), colA: mk(3), colB: mk(3), colC: mk(3), colD: mk(4) };
  geometry.setAttribute('aGait', attrs.gait);
  geometry.setAttribute('aColA', attrs.colA);
  geometry.setAttribute('aColB', attrs.colB);
  geometry.setAttribute('aColC', attrs.colC);
  geometry.setAttribute('aColD', attrs.colD);
  return attrs;
}

export function setColor(attr, i, hex) {
  const c = _c.set(hex);
  attr.array[i * attr.itemSize] = c.r;
  attr.array[i * attr.itemSize + 1] = c.g;
  attr.array[i * attr.itemSize + 2] = c.b;
}
const _c = new THREE.Color();

/** Seeded RNG. */
export function crowdRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ============================================================ worker mesh */

/** A 1.74 m worker: boots, work trousers, shirt, hi-vis vest with reflective tape, hard hat. ~300 tris. */
function workerGeometry() {
  const parts = [];
  const P = (g, limb, piv, slot, col) => parts.push(tagPart(g, limb, piv, slot, col));
  // legs (trousers = slot B is the hat; trousers fixed dark) — pivot at the hip 0.92
  P(pbox(0.16, 0.8, 0.19, -0.1, 0.1, 0), LIMB.LEG_L, 0.92, SLOT.FIXED, 0x2c3340);
  P(pbox(0.16, 0.8, 0.19, 0.1, 0.1, 0), LIMB.LEG_R, 0.92, SLOT.FIXED, 0x2c3340);
  P(pbox(0.17, 0.12, 0.27, -0.1, 0, 0.03), LIMB.LEG_L, 0.92, SLOT.FIXED, 0x2a1e14);
  P(pbox(0.17, 0.12, 0.27, 0.1, 0, 0.03), LIMB.LEG_R, 0.92, SLOT.FIXED, 0x2a1e14);
  P(pbox(0.38, 0.14, 0.22, 0, 0.86, 0), LIMB.BODY, 0, SLOT.FIXED, 0x2c3340);           // pelvis
  P(pbox(0.4, 0.5, 0.22, 0, 1.0, 0), LIMB.BODY, 0, SLOT.C);                             // shirt torso
  P(pbox(0.43, 0.42, 0.25, 0, 1.03, 0), LIMB.BODY, 0, SLOT.A);                          // vest
  P(pbox(0.44, 0.045, 0.26, 0, 1.12, 0), LIMB.BODY, 0, SLOT.FIXED, 0xd9dde2);           // tape
  P(pbox(0.44, 0.045, 0.26, 0, 1.3, 0), LIMB.BODY, 0, SLOT.FIXED, 0xd9dde2);
  P(pbox(0.1, 0.36, 0.05, -0.1, 1.08, 0.12), LIMB.BODY, 0, SLOT.FIXED, 0xd9dde2);       // braces
  P(pbox(0.1, 0.36, 0.05, 0.1, 1.08, 0.12), LIMB.BODY, 0, SLOT.FIXED, 0xd9dde2);
  P(pbox(0.11, 0.08, 0.11, 0, 1.5, 0), LIMB.BODY, 0, SLOT.SKIN);                        // neck
  P(pbox(0.2, 0.22, 0.21, 0, 1.55, 0.01), LIMB.BODY, 0, SLOT.SKIN);                     // head
  P(pbox(0.21, 0.06, 0.08, 0, 1.6, -0.08), LIMB.BODY, 0, SLOT.FIXED, 0x151210);         // hair at back
  const dome = new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.85, 1.12);
  dome.translate(0, 1.73, 0.01);
  P(dome, LIMB.BODY, 0, SLOT.B);
  P(pbox(0.28, 0.025, 0.34, 0, 1.72, 0.03), LIMB.BODY, 0, SLOT.B);                      // brim
  // arms (shirt sleeve + hand), pivot at the shoulder 1.42
  P(pbox(0.11, 0.5, 0.12, -0.27, 0.93, 0), LIMB.ARM_L, 1.42, SLOT.C);
  P(pbox(0.11, 0.5, 0.12, 0.27, 0.93, 0), LIMB.ARM_R, 1.42, SLOT.C);
  P(pbox(0.09, 0.12, 0.1, -0.27, 0.8, 0), LIMB.ARM_L, 1.42, SLOT.SKIN);
  P(pbox(0.09, 0.12, 0.1, 0.27, 0.8, 0), LIMB.ARM_R, 1.42, SLOT.SKIN);
  return mergeGeometries(parts);
}

const VESTS = [0xff7a12, 0xd8f028, 0xff7a12, 0xd8f028, 0xf2c018];
const HATS = [0xf4f4f0, 0xf2c41a, 0xf4f4f0, 0x2c6fd0, 0xf06a12, 0x3a9a4a, 0xf4f4f0];
const SHIRTS = [0x3d5a80, 0x8a7a5a, 0xe8e2d4, 0x5a6a4a, 0x2c3e66, 0x9a4a3a, 0xd8d0c0];

const TAU = Math.PI * 2;

export class WorkerCrowd {
  constructor(scene, quality, layout = null) {
    this.scene = scene;
    this.quality = quality;
    this.layout = layout || {};
    this.groundAt = (layout && layout.groundAt) || null;
    this.time = { value: 0 };
    this.rand = crowdRng(9091);
    const settings = (quality && quality.settings) || {};
    this.capacity = Math.max(24, Math.min(400, settings.workerCount || 90));
    this.geometry = workerGeometry();
    this.attrs = crowdAttributes(this.geometry, this.capacity);
    this.material = createCrowdMaterial(this.time);
    this.material.name = 'hdd:workers';
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'workers';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.agents = [];
    for (let i = 0; i < this.capacity; i++) {
      const r = this.rand;
      setColor(this.attrs.colA, i, VESTS[Math.floor(r() * VESTS.length)]);
      setColor(this.attrs.colB, i, HATS[Math.floor(r() * HATS.length)]);
      setColor(this.attrs.colC, i, SHIRTS[Math.floor(r() * SHIRTS.length)]);
      this.attrs.colD.array[i * 4 + 3] = r();
      this.agents.push({ i, x: 0, z: 0, y: 0, h: 0, tx: 0, tz: 0, front: null, role: 'work', wait: 0, phase: r() * TAU, speed: 1.1 + r() * 0.35, scale: 0.94 + r() * 0.1, pose: 0 });
    }
    for (const k of ['colA', 'colB', 'colC', 'colD']) this.attrs[k].needsUpdate = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._y = new THREE.Vector3(0, 1, 0);
    this.active = 0;
    this._key = '';
  }

  /** Spread the workforce over the active fronts (bigger and building fronts get more hands). */
  setActivity({ fronts = [], workforce = 0, operational = false } = {}) {
    const key = `${fronts.map((f) => f.wbsId).join(',')}|${Math.round(workforce * 10)}|${operational ? 1 : 0}`;
    for (const a of this.agents) {
      if (!a.front) continue;
      const f = fronts.find((ff) => ff.wbsId === a.front.wbsId);
      if (f) { a.front.x = f.x; a.front.z = f.z; a.front.radius = f.radius || 40; }
    }
    if (key === this._key) return;
    this._key = key;
    if (!fronts.length || operational) { this.active = 0; for (const a of this.agents) a.front = null; return; }
    const want = Math.round(this.capacity * (0.3 + 0.7 * Math.max(0, Math.min(1, workforce))));
    const weight = (f) => Math.sqrt(f.radius || 40) * (/build/.test(f.kind) ? 1.6 : /elec/.test(f.kind) ? 0.6 : 1);
    const total = fronts.reduce((s, f) => s + weight(f), 0) || 1;
    let idx = 0;
    for (const f of fronts) {
      const n = Math.max(2, Math.round((want * weight(f)) / total));
      const front = { wbsId: f.wbsId, x: f.x, z: f.z, radius: Math.max(12, f.radius || 40), kind: f.kind || 'building' };
      for (let k = 0; k < n && idx < this.capacity; k++, idx++) {
        const a = this.agents[idx];
        a.front = front;
        const roll = this.rand();
        a.role = roll < 0.55 ? 'work' : roll < 0.85 ? 'walk' : 'chat';
        const ang = this.rand() * TAU;
        const rr = Math.sqrt(this.rand()) * front.radius * 0.7;
        a.x = front.x + Math.cos(ang) * rr;
        a.z = front.z + Math.sin(ang) * rr;
        a.h = this.rand() * TAU;
        a.ox = a.x - front.x; a.oz = a.z - front.z;
        a.tx = a.x; a.tz = a.z;
        a.wait = this.rand() * 4;
        if (a.role === 'chat' && k > 0) {
          const b = this.agents[idx - 1];
          a.ox = b.ox + Math.cos(ang) * 1.1; a.oz = b.oz + Math.sin(ang) * 1.1;
          a.x = front.x + a.ox; a.z = front.z + a.oz;
          a.h = Math.atan2(b.x - a.x, b.z - a.z);
        }
      }
    }
    for (let k = idx; k < this.capacity; k++) this.agents[k].front = null;
    this.active = idx;
  }

  update(dt, ctx = {}) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.time.value += dt;
    const groundAt = (ctx && ctx.groundAt) || this.groundAt;
    const gait = this.attrs.gait.array;
    let count = 0;
    for (let k = 0; k < this.active; k++) {
      const a = this.agents[k];
      const f = a.front;
      if (!f) continue;
      let pose = 1;
      let rate = 5.5;
      let amp = 0.5;
      if (a.role === 'walk') {
        if (a.wait > 0) {
          a.wait -= dt;
          pose = 3; rate = 1; amp = 0;
          if (a.wait <= 0) {
            const ang = this.rand() * TAU;
            const rr = Math.sqrt(this.rand()) * f.radius * 0.8;
            a.ox = Math.cos(ang) * rr; a.oz = Math.sin(ang) * rr;
          }
        } else {
          const tx = f.x + a.ox;
          const tz = f.z + a.oz;
          const dx = tx - a.x;
          const dz = tz - a.z;
          const d = Math.hypot(dx, dz);
          if (d > 60) { a.x = tx; a.z = tz; }
          if (d < 0.4) { a.wait = 2 + this.rand() * 6; } else {
            const want = Math.atan2(dx, dz);
            let e = want - a.h; e = Math.atan2(Math.sin(e), Math.cos(e));
            a.h += e * Math.min(1, dt * 4);
            const step = Math.min(d, a.speed * dt);
            a.x += (dx / d) * step; a.z += (dz / d) * step;
            pose = 0; rate = 7.2 * a.speed / 1.2; amp = 0.55;
          }
        }
      } else if (a.role === 'chat') {
        pose = 3; rate = 1; amp = 0;
        a.x = f.x + a.ox; a.z = f.z + a.oz;
      } else {
        a.x = f.x + a.ox; a.z = f.z + a.oz;
        pose = 1; rate = 4.5 + (a.i % 5) * 0.5; amp = 0.55;
      }
      const y = groundAt ? groundAt(a.x, a.z) || 0 : 0;
      this._q.setFromAxisAngle(this._y, a.h);
      this._p.set(a.x, y, a.z);
      this._s.setScalar(a.scale);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(count, this._m);
      // gait slot is per instance index `count`; colours are per agent index, so keep them aligned
      gait[count * 4] = rate; gait[count * 4 + 1] = amp; gait[count * 4 + 2] = a.phase; gait[count * 4 + 3] = pose;
      count++;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.attrs.gait.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
