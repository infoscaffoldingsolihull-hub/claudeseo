import * as THREE from 'three';
import { mergeGeometries } from './aircraft.js';
import { LIMB, SLOT, tagPart, pbox, createCrowdMaterial, crowdAttributes, setColor, crowdRng } from './workers.js';
import { MASTERPLAN } from './layout.js';

/**
 * Terminal crowd: departing passengers walk door → check-in queue → desk
 * (bag dropped) → security lane → lounge seat or café → gate; arriving
 * passengers walk gate → baggage carousel (bag collected) → landside exit.
 * Clothing draws on Sindh: shalwar kameez in whites, creams and pastels,
 * ajrak shawls in madder red and indigo, embroidered Sindhi topis.
 *
 *   new PassengerCrowd(scene, quality, layout?)
 *   crowd.setActive(bool)               // also driven by setActivity({ operational })
 *   crowd.update(dt, camera | { camera })
 *   crowd.dispose()
 *
 * One InstancedMesh for people and one for wheeled bags; nothing is updated
 * or drawn when the camera is far from the terminal.
 */

const T = MASTERPLAN.terminal;
const FY = 0.3;
const DOORS = [-117, -63, -9];
const EXIT = { x: T.x0 + 1, z: 117 };
const ISLANDS = [-135, -99, -63, -27];
const LANES = [-135, -99, -63, -27, 9, 45];
const ARR_Z = 80;
const CAROUSELS = [108, 146];
const SEAT_BANKS = [{ x: -532, face: 1, aisle: -529.5 }, { x: -527, face: -1, aisle: -529.5 }, { x: -500, face: 1, aisle: -497.5 }, { x: -495, face: -1, aisle: -497.5 }];
const KIOSKS = [-117, -45, 27];
const PLANTERS = [-152, -82, -10, 58];

const KAMEEZ = [0xf2efe6, 0xe8dcc4, 0xd9e4ea, 0xc9d8c2, 0xe9d2d6, 0x9fb6c8, 0x6f7d5a, 0x7a2232, 0x2b3a6b, 0xb8a27a, 0xf4f4f2, 0x8a5a7a, 0xd8b04a, 0x4a6a6a];
const SHALWAR = [0xf2efe6, 0xe8dcc4, 0xd8d2c4, 0x2f3440, 0xf4f4f2, 0xc8c0b0];
const SHAWLS = [0x8e1a2e, 0x23317a, 0x8e1a2e, 0x1d2550, 0xb03a2a, 0xd9a21c, 0x2f6b3a];
const TOPI = [0x9b1b30, 0x23317a, 0x2a2a2a, 0x7a5a1a];
const HAIR = 0x16110e;
const BAGS = [0x1c1c1c, 0x6b1f2a, 0x22305e, 0x4a4f52, 0x8a6b3a, 0x2f5a3a, 0x9a9da2];

function passengerGeometry() {
  const parts = [];
  const P = (g, limb, piv, slot, col) => parts.push(tagPart(g, limb, piv, slot, col));
  P(pbox(0.17, 0.82, 0.18, -0.1, 0.08, 0), LIMB.LEG_L, 0.9, SLOT.B);                 // shalwar
  P(pbox(0.17, 0.82, 0.18, 0.1, 0.08, 0), LIMB.LEG_R, 0.9, SLOT.B);
  P(pbox(0.14, 0.09, 0.25, -0.1, 0, 0.03), LIMB.LEG_L, 0.9, SLOT.FIXED, 0x3a2a1c);   // chappals
  P(pbox(0.14, 0.09, 0.25, 0.1, 0.09 - 0.09, 0.03), LIMB.LEG_R, 0.9, SLOT.FIXED, 0x3a2a1c);
  P(pbox(0.44, 0.42, 0.26, 0, 0.52, 0), LIMB.BODY, 0, SLOT.A);                         // kameez skirt (to the knee)
  P(pbox(0.4, 0.58, 0.23, 0, 0.94, 0), LIMB.BODY, 0, SLOT.A);                          // kameez body
  P(pbox(0.46, 0.1, 0.27, 0, 1.36, 0), LIMB.BODY, 0, SLOT.C);                          // shawl over the shoulders
  P(pbox(0.42, 0.62, 0.05, 0, 0.82, -0.14), LIMB.BODY, 0, SLOT.C);                     // shawl falling down the back
  P(pbox(0.12, 0.5, 0.05, -0.15, 0.95, 0.13), LIMB.BODY, 0, SLOT.C);                   // shawl ends at the front
  P(pbox(0.11, 0.08, 0.11, 0, 1.46, 0), LIMB.BODY, 0, SLOT.SKIN);
  P(pbox(0.19, 0.22, 0.2, 0, 1.52, 0.01), LIMB.BODY, 0, SLOT.SKIN);
  P(pbox(0.2, 0.07, 0.21, 0, 1.7, -0.005), LIMB.BODY, 0, SLOT.FIXED, HAIR);
  P(pbox(0.2, 0.18, 0.06, 0, 1.54, -0.09), LIMB.BODY, 0, SLOT.FIXED, HAIR);
  const cap = new THREE.CylinderGeometry(0.105, 0.11, 0.1, 12);
  cap.translate(0, 1.75, 0);
  P(cap, LIMB.BODY, 0, SLOT.D);                                                        // topi (or hair)
  P(pbox(0.1, 0.52, 0.11, -0.26, 0.88, 0), LIMB.ARM_L, 1.38, SLOT.A);
  P(pbox(0.1, 0.52, 0.11, 0.26, 0.88, 0), LIMB.ARM_R, 1.38, SLOT.A);
  P(pbox(0.085, 0.1, 0.09, -0.26, 0.78, 0), LIMB.ARM_L, 1.38, SLOT.SKIN);
  P(pbox(0.085, 0.1, 0.09, 0.26, 0.78, 0), LIMB.ARM_R, 1.38, SLOT.SKIN);
  return mergeGeometries(parts);
}

function bagGeometry() {
  const g = [];
  const b = new THREE.BoxGeometry(0.42, 0.62, 0.26);
  b.translate(0, 0.39, 0);
  g.push(b);
  const h = new THREE.BoxGeometry(0.03, 0.42, 0.03);
  h.translate(0, 0.9, -0.08);
  g.push(h);
  const w = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
  w.rotateZ(Math.PI / 2);
  w.translate(0, 0.05, -0.1);
  g.push(w);
  for (const x of g) if (x.attributes.uv) x.deleteAttribute('uv');
  return mergeGeometries(g);
}

const TAU = Math.PI * 2;
const MAX_WP = 10;

export class PassengerCrowd {
  constructor(scene, quality, layout = null) {
    this.scene = scene;
    this.layout = layout || {};
    const tier = (quality && quality.tier) || 'medium';
    const base = { low: 110, medium: 200, high: 300, ultra: 420 }[tier] || 200;
    this.capacity = base;
    this.rand = crowdRng(7171);
    this.time = { value: 0 };
    this.active = false;
    this.visibleFrames = 0;
    this.geometry = passengerGeometry();
    this.attrs = crowdAttributes(this.geometry, this.capacity);
    this.material = createCrowdMaterial(this.time, { roughness: 0.88 });
    this.material.name = 'hdd:passengers';
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'passengers';
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((T.x0 + T.x1) / 2, 2, (T.z0 + T.z1) / 2), Math.hypot(T.x1 - T.x0, T.z1 - T.z0) / 2 + 10);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.bagMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
    this.bagMaterial.name = 'hdd:luggage';
    this.bags = new THREE.InstancedMesh(bagGeometry(), this.bagMaterial, this.capacity);
    this.bags.name = 'luggage';
    this.bags.frustumCulled = true;
    this.bags.boundingSphere = this.mesh.boundingSphere;
    this.bags.visible = false;
    this.bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.bags);
    const bagCol = new THREE.Color();

    this.center = new THREE.Vector3((T.x0 + T.x1) / 2, 4, (T.z0 + T.z1) / 2);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._y = new THREE.Vector3(0, 1, 0);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);

    // service points
    this.desks = [];
    for (const z of ISLANDS) for (const s of [-1, 1]) for (let k = 0; k < 7; k++) this.desks.push({ x: -584 + k * 2.33, z: z + s * 3.6, h: s > 0 ? Math.PI : 0, busy: null, island: z, side: s });
    this.checkQueues = [];
    for (const z of ISLANDS) for (const s of [-1, 1]) this.checkQueues.push({ z: z + s * 4.9, island: z, side: s, list: [] });
    this.secQueues = LANES.map((z) => ({ z, list: [], busy: null }));
    this.seats = [];
    for (const bank of SEAT_BANKS) {
      for (let z0 = -164; z0 < ARR_Z - 12; z0 += 11) {
        for (let k = 0; k < 4; k++) for (const o of [-0.5, 0.5]) this.seats.push({ x: bank.x + bank.face * 0.12, z: z0 + k * 2.2 + 1.1 + o, h: bank.face > 0 ? Math.PI / 2 : -Math.PI / 2, aisle: bank.aisle, z0, busy: null });
      }
    }
    this.gaps = [];
    for (let z0 = -153; z0 < ARR_Z - 12; z0 += 11) {
      const g = z0 - 1.1;
      if (KIOSKS.some((k) => Math.abs(k - g) < 4) || PLANTERS.some((p) => Math.abs(p - g) < 2.2)) continue;
      this.gaps.push(g);
    }
    this.gates = [-123.75, -41.25, 41.25];
    const stands = this.layout.STANDS;
    if (stands && stands.length) {
      const g = stands.filter((s) => s.contact && s.z < ARR_Z - 10).map((s) => s.z);
      if (g.length) this.gates = g;
    }

    this.agents = [];
    for (let i = 0; i < this.capacity; i++) {
      const r = this.rand;
      const female = r() < 0.45;
      const child = r() < 0.08;
      setColor(this.attrs.colA, i, KAMEEZ[Math.floor(r() * KAMEEZ.length)]);
      setColor(this.attrs.colB, i, SHALWAR[Math.floor(r() * SHALWAR.length)]);
      const hasShawl = female || r() < 0.3;
      if (hasShawl) setColor(this.attrs.colC, i, SHAWLS[Math.floor(r() * SHAWLS.length)]);
      else { for (let k = 0; k < 3; k++) this.attrs.colC.array[i * 3 + k] = this.attrs.colA.array[i * 3 + k]; }
      setColor(this.attrs.colD, i, !female && r() < 0.35 ? TOPI[Math.floor(r() * TOPI.length)] : HAIR);
      this.attrs.colD.array[i * 4 + 3] = 0.15 + r() * 0.75;
      this.bags.setColorAt(i, bagCol.set(BAGS[Math.floor(r() * BAGS.length)]));
      this.agents.push({
        i, x: 0, z: 0, h: 0, state: 'off', wp: new Float32Array(MAX_WP * 2), nwp: 0, iwp: 0, wait: 0, bag: false,
        speed: (child ? 1.05 : 1.15) + r() * 0.3, scale: child ? 0.62 + r() * 0.1 : (female ? 0.93 : 0.98) + r() * 0.08,
        phase: r() * TAU, pose: 0, queue: null, slot: -1, desk: null, seat: null, arriving: false,
      });
    }
    for (const k of ['colA', 'colB', 'colC', 'colD']) this.attrs[k].needsUpdate = true;
    if (this.bags.instanceColor) this.bags.instanceColor.needsUpdate = true;
    this._seeded = false;
  }

  setActive(on) {
    this.active = !!on;
    if (this.active && !this._seeded) this._seed();
    if (!this.active) { this.mesh.visible = false; this.bags.visible = false; }
  }

  setActivity({ operational = false } = {}) { this.setActive(operational); }

  /* ---------------------------------------------------------- flow */
  _route(a, ...pts) {
    a.nwp = 0;
    a.iwp = 0;
    for (const [x, z] of pts) { if (a.nwp >= MAX_WP) break; a.wp[a.nwp * 2] = x; a.wp[a.nwp * 2 + 1] = z; a.nwp++; }
  }

  _spawnDeparture(a) {
    const door = DOORS[Math.floor(this.rand() * DOORS.length)];
    a.x = T.x0 + 0.5; a.z = door + (this.rand() - 0.5) * 3; a.h = Math.PI / 2;
    a.bag = this.rand() < 0.75;
    a.arriving = false;
    // the shortest check-in queue
    let best = this.checkQueues[0];
    for (const q of this.checkQueues) if (q.list.length < best.list.length || (q.list.length === best.list.length && this.rand() < 0.3)) best = q;
    a.queue = best;
    best.list.push(a);
    a.state = 'toCheckin';
    this._route(a, [-593, a.z], [-593, best.z]);
  }

  _spawnArrival(a) {
    a.x = T.x1 - 2; a.z = ARR_Z + 12 + this.rand() * 70; a.h = -Math.PI / 2;
    a.bag = false;
    a.arriving = true;
    const c = CAROUSELS[Math.floor(this.rand() * CAROUSELS.length)];
    const side = c === CAROUSELS[0] ? 1 : -1;
    const sz = c + side * (3.4 + this.rand() * 0.6);
    const sx = -558 + this.rand() * 30;
    a.state = 'toCarousel';
    a.target = { x: sx, z: sz, h: side > 0 ? Math.PI : 0 };
    this._route(a, [-506, a.z], [-506, sz], [sx, sz]);
  }

  _seed() {
    this._seeded = true;
    // start the building already busy: people at every stage
    for (let k = 0; k < this.agents.length; k++) {
      const a = this.agents[k];
      const r = this.rand();
      if (r < 0.22) { this._spawnArrival(a); a.x = -506 - this.rand() * 40; a.z = ARR_Z + 14 + this.rand() * 60; a.iwp = 0; this._route(a, [-506, a.z], [a.target.x, a.target.z]); }
      else if (r < 0.45) { this._spawnDeparture(a); a.x = -592; a.z = a.queue.z + (this.rand() - 0.5) * 2; }
      else if (r < 0.85) {
        const seat = this._freeSeat();
        if (seat) { seat.busy = a; a.seat = seat; a.state = 'seated'; a.x = seat.x; a.z = seat.z; a.h = seat.h; a.wait = 20 + this.rand() * 120; a.nwp = 0; }
        else this._spawnDeparture(a);
      } else { a.state = 'off'; a.wait = this.rand() * 30; }
    }
  }

  _freeSeat() {
    for (let tries = 0; tries < 12; tries++) {
      const s = this.seats[Math.floor(this.rand() * this.seats.length)];
      if (!s.busy) return s;
    }
    return null;
  }

  _nearestGap(z) {
    let best = this.gaps[0];
    for (const g of this.gaps) if (Math.abs(g - z) < Math.abs(best - z)) best = g;
    return best;
  }

  /** Called when an agent reaches the end of its waypoints. */
  _arrive(a) {
    switch (a.state) {
      case 'toCheckin': a.state = 'queueCheckin'; break;
      case 'toDesk': a.state = 'atDesk'; a.wait = 18 + this.rand() * 22; a.h = a.desk.h; break;
      case 'toSecurity': a.state = 'queueSecurity'; break;
      case 'toScreen': a.state = 'screening'; a.wait = 5 + this.rand() * 6; break;
      case 'toSeat': a.state = 'seated'; a.h = a.seat.h; a.x = a.seat.x; a.z = a.seat.z; a.wait = 40 + this.rand() * 110; break;
      case 'toKiosk': a.state = 'browsing'; a.wait = 15 + this.rand() * 30; a.h = Math.PI / 2; break;
      case 'toGate': a.state = 'off'; a.wait = 4 + this.rand() * 12; break;
      case 'toCarousel': a.state = 'waitBag'; a.wait = 12 + this.rand() * 40; a.h = a.target.h; break;
      case 'toExit': a.state = 'off'; a.wait = 3 + this.rand() * 10; break;
      default: break;
    }
  }

  _goLounge(a, fromZ) {
    if (this.rand() < 0.22) {
      const k = KIOSKS[Math.floor(this.rand() * KIOSKS.length)];
      a.state = 'toKiosk';
      const gz = this._nearestGap(k);
      this._route(a, [-541, fromZ], [-541, gz], [-524, gz], [-524, k + (this.rand() - 0.5) * 4], [-521.5, k + (this.rand() - 0.5) * 4]);
      return;
    }
    const seat = this._freeSeat();
    if (!seat) { this._goGate(a, fromZ, -541); return; }
    seat.busy = a;
    a.seat = seat;
    a.state = 'toSeat';
    const gz = seat.z0 - 1.1;
    this._route(a, [-541, fromZ], [-541, gz], [seat.aisle, gz], [seat.aisle, seat.z], [seat.x, seat.z]);
  }

  _goGate(a, z, x) {
    const gate = this.gates[Math.floor(this.rand() * this.gates.length)];
    const gz = this._nearestGap(z);
    a.state = 'toGate';
    this._route(a, [x, z], [x, gz], [-489.5, gz], [-489.5, gate + (this.rand() - 0.5) * 3], [T.x1 - 0.5, gate]);
  }

  _step(a, dt) {
    switch (a.state) {
      case 'off':
        a.wait -= dt;
        if (a.wait <= 0) { if (this.rand() < 0.62) this._spawnDeparture(a); else this._spawnArrival(a); }
        return false;
      case 'queueCheckin': {
        const q = a.queue;
        const pos = q.list.indexOf(a);
        const tx = -569.5 - pos * 0.85;
        a.pose = 3;
        this._approach(a, dt, Math.max(-592, tx), q.z, -Math.PI / 2 * 0 + Math.PI / 2 * 1);
        if (pos === 0) {
          const desk = this.desks.find((d) => !d.busy && d.island === q.island && d.side === q.side);
          if (desk) {
            q.list.shift();
            desk.busy = a; a.desk = desk;
            a.state = 'toDesk';
            this._route(a, [desk.x, q.z], [desk.x, desk.z]);
          }
        }
        return true;
      }
      case 'atDesk':
        a.pose = 3;
        a.wait -= dt;
        if (a.wait < 10) a.bag = false;
        if (a.wait <= 0) {
          a.desk.busy = null; a.desk = null;
          let best = this.secQueues[0];
          for (const q of this.secQueues) if (q.list.length < best.list.length) best = q;
          a.queue = best; best.list.push(a);
          a.state = 'toSecurity';
          const out = a.queue.z > a.z ? 1 : -1;
          this._route(a, [a.x, a.z + out * 1.6], [-567.2, a.z + out * 1.6], [-567.2, best.z + 3 + 9]);
        }
        return true;
      case 'queueSecurity': {
        const q = a.queue;
        const pos = q.list.indexOf(a);
        a.pose = 3;
        this._approach(a, dt, -567.2, q.z + 3 + pos * 0.85, Math.PI);
        if (pos === 0 && !q.busy) {
          q.list.shift(); q.busy = a;
          a.state = 'toScreen';
          this._route(a, [-566, q.z], [-552, q.z]);
        }
        return true;
      }
      case 'screening':
        a.pose = 3; a.wait -= dt;
        if (a.wait <= 0) { a.queue.busy = null; a.queue = null; this._goLounge(a, LANES.includes(Math.round(a.z)) ? a.z : a.z); a.wp[0] = -546; a.wp[1] = a.z; }
        return true;
      case 'seated':
        a.pose = 2; a.wait -= dt;
        if (a.wait <= 0) {
          const s = a.seat; s.busy = null; a.seat = null;
          const gate = this.gates[Math.floor(this.rand() * this.gates.length)];
          a.state = 'toGate';
          const gz = s.z0 - 1.1;
          this._route(a, [s.aisle, s.z], [s.aisle, gz], [-489.5, gz], [-489.5, gate], [T.x1 - 0.5, gate]);
        }
        return true;
      case 'browsing':
        a.pose = 3; a.wait -= dt;
        if (a.wait <= 0) this._goGate(a, a.z, -524);
        return true;
      case 'waitBag':
        a.pose = 3; a.wait -= dt;
        if (a.wait <= 0) {
          a.bag = this.rand() < 0.85;
          a.state = 'toExit';
          this._route(a, [a.x, a.z + (a.z > 127 ? -2 : 2)], [-570, 127], [EXIT.x + 3, EXIT.z], [EXIT.x - 0.5, EXIT.z]);
        }
        return true;
      default:
        break;
    }
    // walking along waypoints
    if (a.iwp >= a.nwp) { this._arrive(a); return true; }
    const tx = a.wp[a.iwp * 2];
    const tz = a.wp[a.iwp * 2 + 1];
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) { a.iwp++; return true; }
    const want = Math.atan2(dx, dz);
    let e = want - a.h; e = Math.atan2(Math.sin(e), Math.cos(e));
    a.h += e * Math.min(1, dt * 6);
    const step = Math.min(d, a.speed * dt);
    a.x += (dx / d) * step; a.z += (dz / d) * step;
    a.pose = 0;
    return true;
  }

  _approach(a, dt, tx, tz, h) {
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.08) {
      const step = Math.min(d, a.speed * 0.8 * dt);
      a.x += (dx / d) * step; a.z += (dz / d) * step;
      a.h += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.h), Math.cos(Math.atan2(dx, dz) - a.h)) * Math.min(1, dt * 5);
      a.pose = 0;
    } else a.h += Math.atan2(Math.sin(h - a.h), Math.cos(h - a.h)) * Math.min(1, dt * 3);
  }

  update(dt, cam = null) {
    if (!this.active) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const camera = cam && cam.isCamera ? cam : cam && cam.camera ? cam.camera : null;
    this.time.value += dt;
    // LOD: freeze and hide when the camera is far from the terminal
    const far = camera ? camera.position.distanceTo(this.center) > 900 : false;
    this.mesh.visible = !far;
    this.bags.visible = !far;
    // keep the flow alive while hidden, at a lower tick rate
    if (far) { this._acc = (this._acc || 0) + dt; if (this._acc < 0.5) return; dt = this._acc; this._acc = 0; }
    const gait = this.attrs.gait.array;
    for (const a of this.agents) {
      const live = this._step(a, dt);
      const i = a.i;
      if (!live) { this.mesh.setMatrixAt(i, this._zero); this.bags.setMatrixAt(i, this._zero); continue; }
      if (far) continue;
      const sit = a.pose === 2;
      this._q.setFromAxisAngle(this._y, a.h);
      this._p.set(a.x, FY + (sit ? 0.52 - 0.9 * a.scale : 0), a.z);
      this._s.setScalar(a.scale);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      gait[i * 4] = a.pose === 0 ? 6.8 * a.speed / 1.25 : 1;
      gait[i * 4 + 1] = a.pose === 0 ? 0.5 : 0;
      gait[i * 4 + 2] = a.phase;
      gait[i * 4 + 3] = a.pose;
      if (a.bag) {
        // wheeled bag trails at the right hand
        const c = Math.cos(a.h);
        const s = Math.sin(a.h);
        const bx = a.x + c * 0.42 - s * 0.35;
        const bz = a.z - s * 0.42 - c * 0.35;
        this._p.set(bx, FY, bz);
        this._s.setScalar(1);
        this._m.compose(this._p, this._q, this._s);
        this.bags.setMatrixAt(i, this._m);
      } else this.bags.setMatrixAt(i, this._zero);
    }
    if (far) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.bags.instanceMatrix.needsUpdate = true;
    this.attrs.gait.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh, this.bags);
    this.mesh.dispose();
    this.bags.dispose();
    this.geometry.dispose();
    this.bags.geometry.dispose();
    this.material.dispose();
    this.bagMaterial.dispose();
  }
}
