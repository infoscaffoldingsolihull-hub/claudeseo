import * as THREE from 'three';
import { RUNWAY, MASTERPLAN } from './layout.js';
import { AIRCRAFT_TYPES, AIRLINE_LIVERIES, CARGO_LIVERY, setLightClock, disposeAircraftCache } from './aircraft.js';

/**
 * Operations mode — an ATC-lite traffic simulation (all flights simulated).
 *
 *   const t = new Traffic(scene, { quality, materials, layout, createAircraft, fleet? })
 *   t.start(project) · t.stop() · t.update(dt, ctx) · t.kpis() · t.audioState(cameraPos) · t.active
 *   t.setWind(dirDegTrue, speedKt) · t.fidsRows() · t.fidsArrivals() · t.dispose()
 *
 * The simulated wind picks the active runway (land on 02 → roll towards −Z,
 * on 20 → towards +Z). Arrivals are spawned 11 km out on a 3° glide path,
 * flare, touch down (tyre smoke), roll out, vacate by the rapid exit or a
 * connector, taxi along the parallel taxiway and apron taxilane to a free
 * stand, park and turn round (the vehicle fleet's GSE drives in), push back,
 * taxi to the holding point, line up (back-tracking when the extension is not
 * built), take off and climb out.
 *
 * Separation: one aircraft owns the runway at a time (landing clearance at
 * 2.5 km, go-around if it is still occupied at 1.2 km); departures line up
 * only with no arrival inside 6.5 km; taxiing aircraft brake for anything in
 * their forward corridor; every taxi flow is one-way for the runway in use, so
 * nose-to-nose conflicts cannot arise. Runway changes wait for a traffic gap.
 *
 * Time: aircraft move in real time; turnarounds are compressed (~18×), so
 * one simulated hour of operations stands for one airport day in the benefit
 * figures sent to `project.recordOperations()`.
 */

const DEG = Math.PI / 180;
const GLIDE = Math.tan(3 * DEG);
const SPAWN_DIST = 11000;
const TURN_COMPRESSION = 18;
const TAXI_SPEED = 11;
const HOLD_X = -90;
const TAU = Math.PI * 2;

/* ================================================================ paths */

/** A dense ground path with per-sample heading and a braking-aware speed limit. */
class GroundPath {
  constructor(xz, vStraight = TAXI_SPEED, aLat = 0.9, decel = 0.9) {
    const n = xz.length / 2;
    this.n = n;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.s = new Float32Array(n);
    this.h = new Float32Array(n);
    this.v = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.x[i] = xz[i * 2]; this.z[i] = xz[i * 2 + 1]; }
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      this.h[i] = Math.atan2(this.x[b] - this.x[a], this.z[b] - this.z[a]);
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3);
      const b = Math.min(n - 1, i + 3);
      const ds = this.s[b] - this.s[a];
      let dh = this.h[b] - this.h[a];
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const k = ds > 0.01 ? Math.abs(dh) / ds : 0;
      this.v[i] = Math.min(vStraight, Math.sqrt(aLat / Math.max(k, 1e-5)));
    }
    for (let i = n - 2; i >= 0; i--) {
      const ds = this.s[i + 1] - this.s[i];
      this.v[i] = Math.min(this.v[i], Math.sqrt(this.v[i + 1] * this.v[i + 1] + 2 * decel * ds));
    }
    this.length = this.s[n - 1];
    this.cursor = 0;
    this.decel = decel;
  }

  /** Cap the speed limit where cap(x, z) says so, then redo the braking pass. */
  cap(fn) {
    for (let i = 0; i < this.n; i++) this.v[i] = Math.min(this.v[i], fn(this.x[i], this.z[i]));
    for (let i = this.n - 2; i >= 0; i--) {
      const ds = this.s[i + 1] - this.s[i];
      this.v[i] = Math.min(this.v[i], Math.sqrt(this.v[i + 1] * this.v[i + 1] + 2 * this.decel * ds));
    }
    return this;
  }

  /** Sample at distance s → writes out.x, out.z, out.h, out.v (cursor-based, no allocation). */
  sample(s, out) {
    const S = this.s;
    let i = Math.min(this.cursor, this.n - 2);
    while (i > 0 && S[i] > s) i--;
    while (i < this.n - 2 && S[i + 1] < s) i++;
    this.cursor = i;
    const seg = S[i + 1] - S[i];
    const t = seg > 1e-6 ? Math.max(0, Math.min(1, (s - S[i]) / seg)) : 0;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    let dh = this.h[i + 1] - this.h[i];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    out.h = this.h[i] + dh * t;
    out.v = this.v[i] + (this.v[i + 1] - this.v[i]) * t;
    return out;
  }
}

/**
 * Build dense points from control points [x, z, filletRadius?]. Corners are
 * rounded with circular fillets (radius clamped to the adjoining legs).
 */
function filletPoints(ctrl, step = 2) {
  const out = [];
  const push = (x, z) => {
    const n = out.length;
    if (n >= 2 && Math.hypot(out[n - 2] - x, out[n - 1] - z) < 0.05) return;
    out.push(x, z);
  };
  const line = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az);
    const k = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= k; i++) push(ax + ((bx - ax) * i) / k, az + ((bz - az) * i) / k);
  };
  if (ctrl.length < 2) { for (const c of ctrl) push(c[0], c[1]); return out; }
  let cx = ctrl[0][0];
  let cz = ctrl[0][1];
  for (let i = 1; i < ctrl.length - 1; i++) {
    const [px, pz, r = 0] = ctrl[i];
    const [nx, nz] = ctrl[i + 1];
    const ax = px - ctrl[i - 1][0];
    const az = pz - ctrl[i - 1][1];
    const bx = nx - px;
    const bz = nz - pz;
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) continue;
    const ux = ax / la; const uz = az / la;
    const vx = bx / lb; const vz = bz / lb;
    const dot = Math.max(-1, Math.min(1, ux * vx + uz * vz));
    const theta = Math.acos(dot);
    if (r <= 0 || theta < 0.02) { line(cx, cz, px, pz); cx = px; cz = pz; continue; }
    let t = r * Math.tan(theta / 2);
    t = Math.min(t, 0.48 * la, 0.48 * lb);
    const reff = t / Math.tan(theta / 2);
    const sx = px - ux * t; const sz = pz - uz * t;
    line(cx, cz, sx, sz);
    const sign = ux * vz - uz * vx < 0 ? -1 : 1;
    // arc centre: u rotated 90° towards the inside of the turn
    const cX = sx - uz * sign * reff;
    const cZ = sz + ux * sign * reff;
    const phi0 = Math.atan2(sz - cZ, sx - cX);
    const sweep = sign * theta;
    const k = Math.max(2, Math.ceil((reff * theta) / step));
    for (let j = 1; j <= k; j++) {
      const ph = phi0 + sweep * (j / k);
      push(cX + Math.cos(ph) * reff, cZ + Math.sin(ph) * reff);
    }
    cx = px + vx * t; cz = pz + vz * t;
  }
  const last = ctrl[ctrl.length - 1];
  line(cx, cz, last[0], last[1]);
  return out;
}

/** A tear-drop 180° turn on a runway or taxiway of half-width ≥ r (centre-line x0, apex at zU, travelling `dir`). */
function uTurnPoints(x0, zU, dir, r, lead = 30, step = 1.5) {
  const out = [];
  const ss = (u) => u * u * (3 - 2 * u);
  const k1 = Math.ceil(lead / step);
  for (let i = 0; i <= k1; i++) { const u = i / k1; out.push(x0 + r * ss(u), zU - dir * lead * (1 - u)); }
  const k2 = Math.ceil((Math.PI * r) / step);
  for (let i = 1; i <= k2; i++) { const ph = (i / k2) * Math.PI; out.push(x0 + r * Math.cos(ph), zU + dir * r * Math.sin(ph)); }
  for (let i = 1; i <= k1; i++) { const u = i / k1; out.push(x0 - r * (1 - ss(u)), zU - dir * lead * u); }
  return out;
}

/** Concatenate point lists (dropping duplicated joints). */
function joinPts(...lists) {
  const out = [];
  for (const l of lists) {
    for (let i = 0; i < l.length; i += 2) {
      const n = out.length;
      if (n >= 2 && Math.hypot(out[n - 2] - l[i], out[n - 1] - l[i + 1]) < 0.3) continue;
      out.push(l[i], l[i + 1]);
    }
  }
  return out;
}

/* ============================================================ smoke puffs */

const SMOKE_VERT = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float a = clamp(aAge, 0.0, 1.0);
    vAlpha = aAge < 0.0 ? 0.0 : (1.0 - a) * (1.0 - a) * 0.55;
    gl_PointSize = aAge < 0.0 ? 0.0 : min(220.0, aSize * (0.4 + a * 2.6) * uScale / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const SMOKE_FRAG = /* glsl */ `
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = vAlpha * smoothstep(1.0, 0.2, d);
    gl_FragColor = vec4(vec3(0.86, 0.85, 0.83), a);
    #include <fog_fragment>
  }
`;

class Smoke {
  constructor(scene, n = 120) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(-1);
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aAge', this.ageAttr);
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uScale = { value: 900 };
    this.material = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uScale: this.uScale },
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'tyre-smoke';
    this.points.visible = false;
    const sz = new THREE.Vector2();
    this.points.onBeforeRender = (r, s, cam) => { r.getDrawingBufferSize(sz); this.uScale.value = sz.y * 0.5 * cam.projectionMatrix.elements[5]; };
    scene.add(this.points);
    this.cursor = 0;
    this.alive = 0;
  }

  puff(x, y, z, vx, vz, count = 10, size = 4) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 2;
      this.pos[i * 3 + 1] = y + Math.random() * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 2;
      this.vel[i * 3] = vx * 0.25 + (Math.random() - 0.5) * 2;
      this.vel[i * 3 + 1] = 0.6 + Math.random() * 0.9;
      this.vel[i * 3 + 2] = vz * 0.25 + (Math.random() - 0.5) * 2;
      this.age[i] = 0;
      this.life[i] = 2.5 + Math.random() * 2;
      this.size[i] = size * (0.7 + Math.random() * 0.6);
    }
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.alive = this.n;
  }

  update(dt) {
    if (!this.alive) return;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt / this.life[i];
      if (this.age[i] >= 1) { this.age[i] = -1; continue; }
      live++;
      const damp = Math.exp(-dt * 0.9);
      this.vel[i * 3] *= damp; this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.alive = live;
    this.points.visible = live > 0;
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/* ================================================================ traffic */

const DESTS = ['Karachi', 'Lahore', 'Islamabad', 'Dubai', 'Jeddah', 'Muscat', 'Doha', 'Quetta', 'Multan', 'Riyadh', 'Sukkur', 'Abu Dhabi'];

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Traffic {
  constructor(scene, { quality = null, materials = null, layout = null, createAircraft = null, fleet = null, seed = 2027 } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.materials = materials;
    this.layout = layout || {};
    this.createAircraft = createAircraft;
    this.fleet = fleet;
    this.rand = seeded(seed);
    this.group = new THREE.Group();
    this.group.name = 'operations-traffic';
    this.group.visible = false;
    scene.add(this.group);
    this.smoke = new Smoke(this.group);
    this.active = false;
    this.flights = [];
    this.pool = new Map();
    this.time = 0;
    this.nextId = 1;
    this.project = null;
    this._sample = { x: 0, z: 0, h: 0, v: 0 };
    this._turnarounds = [];
    this._kpi = { movements: 0, movementsPerHour: 0, pax: 0, onTimePct: 100, avgTaxiMin: 0, activeRunway: '20', wind: { dir: 215, speed: 9 }, arrivals: 0, departures: 0, goArounds: 0, onStand: 0, airborne: 0 };
    this._audio = { nearest: Infinity, thrust: 0, distance: Infinity, type: null, x: 0, y: 0, z: 0 };
    this.wind = { dir: 215, speed: 9, base: 215, forced: null };
    this.activeRunway = '20';
    this.pendingRunway = null;
    this._recordTimer = 0;
    this._stats = { log: [], pax: 0, taxi: [], onTime: 0, judged: 0, arrivals: 0, departures: 0, goArounds: 0 };
    this._setupGeometry();
  }

  get running() { return this.active; }

  /* -------------------------------------------------------- geometry */
  _setupGeometry() {
    const L = this.layout;
    const MP = L.MASTERPLAN || MASTERPLAN;
    const RW = L.RUNWAY || RUNWAY;
    this.MP = MP;
    this.RW = RW;
    this.twX = MP.parallelTaxiway.x;
    this.TX = L.TAXILANE_X !== undefined ? L.TAXILANE_X : -325;
    const st = L.STANDS && L.STANDS.length ? L.STANDS : Array.from({ length: MP.stands }, (_, i) => ({
      index: i, z: MP.apron.z0 + ((i + 0.5) * (MP.apron.z1 - MP.apron.z0)) / MP.stands, noseX: -452, contact: i >= 2 && i < 2 + MP.jetBridges,
    }));
    this.stands = st.map((s, i) => ({ index: s.index ?? i, id: s.id || `S${i + 1}`, z: s.z, noseX: s.noseX ?? s.x ?? -452, contact: !!s.contact, flight: null }));
    // apron links (A2 marks them at z = ±250)
    this.linkZ = Math.min(250, MP.apron.z1 - 80);
    // rapid exits: A2's centre-line polylines if supplied, else derived from the masterplan
    const ret = [];
    MP.rapidExits.forEach((ex, i) => {
      const dir = Math.sign(ex.toZ - ex.fromZ);
      const pts = (L.rapidExits && L.rapidExits[i]) || [[-20, ex.fromZ - dir * 20], [-40, ex.fromZ + dir * 35], [this.twX + 30, ex.toZ - dir * 45], [this.twX, ex.toZ]];
      ret.push({ kind: 'ret', dir, runwayZ: ex.fromZ, joinZ: ex.toZ, pts });
    });
    this.rets = ret;
  }

  _runwayGeom() {
    const ext = this.extended;
    const north = this.RW.threshold20Z;
    const south = ext ? this.RW.extensionEndZ : this.RW.threshold02Z;
    const d = this.activeRunway === '02' ? -1 : 1;
    const landThr = d < 0 ? south : north;
    const conns = this.MP.connectors.filter((z) => ext || (z > north - 80 && z < south - 30) || z === this.MP.connectors[0]);
    return { ext, north, south, d, landThr, conns, F: -d };
  }

  /* -------------------------------------------------------- lifecycle */
  start(project = null) {
    this.project = project;
    let ext = true;
    try {
      const ws = project && project.worldState ? project.worldState() : null;
      if (ws && ws.pct) ext = (ws.pct['3.5'] === undefined ? 1 : ws.pct['3.5']) >= 0.999;
    } catch (e) { ext = true; }
    this.extended = ext;
    if (this.active) return;
    this.active = true;
    this.group.visible = true;
    this.activeRunway = this._preferredRunway();
    this._arrivalTimer = 20;
    this._populate();
    if (this.fleet && this.fleet.setGseActive) this.fleet.setGseActive(true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.group.visible = false;
    for (const f of this.flights) this._release(f);
    this.flights.length = 0;
    for (const s of this.stands) s.flight = null;
    this._turnarounds.length = 0;
    this.runwayOwner = null;
    const fleet = this._fleet();
    if (fleet) { fleet.setTurnarounds?.(this._turnarounds); fleet.setGseActive?.(false); }
  }

  setActivity({ operational } = {}) { this.operational = !!operational; }

  setWind(dir, speed) {
    this.wind.forced = { dir: ((dir % 360) + 360) % 360, speed: Math.max(0, speed) };
  }

  _fleet() { return this.fleet || (this._ctxWorld && this._ctxWorld.vehicles) || null; }

  /* -------------------------------------------------------- aircraft pool */
  _pickType() {
    const r = this.rand();
    if (!this.extended) return r < 0.62 ? 'narrow' : 'turboprop';
    if (r < 0.46) return 'narrow';
    if (r < 0.7) return 'turboprop';
    if (r < 0.9) return 'wide';
    return 'cargo';
  }

  _pickLivery(type) {
    if (type === 'cargo') return CARGO_LIVERY;
    const pax = AIRLINE_LIVERIES.filter((l) => !l.cargo);
    if (type === 'turboprop') return [pax[2], pax[4], pax[0]][Math.floor(this.rand() * 3)];
    if (type === 'wide') return [pax[1], pax[0], pax[3]][Math.floor(this.rand() * 3)];
    return pax[Math.floor(this.rand() * pax.length)];
  }

  _acquireModel(type, livery) {
    const key = `${type}|${livery.name}`;
    const list = this.pool.get(key);
    if (list && list.length) return list.pop();
    const model = this.createAircraft ? this.createAircraft(type, livery) : null;
    if (!model) return null;
    const rig = new THREE.Group();
    rig.rotation.order = 'YXZ';
    rig.add(model);
    model.position.z = -(model.userData.mainGearZ || 0);
    rig.userData.key = key;
    rig.userData.model = model;
    return rig;
  }

  _release(f) {
    if (!f.rig) return;
    this.group.remove(f.rig);
    const key = f.rig.userData.key;
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key).push(f.rig);
    f.rig = null;
    if (f.stand && f.stand.flight === f) f.stand.flight = null;
    if (this.runwayOwner === f) this.runwayOwner = null;
  }

  _newFlight(type) {
    const livery = this._pickLivery(type);
    const rig = this._acquireModel(type, livery);
    if (!rig) return null;
    const meta = AIRCRAFT_TYPES[type];
    const model = rig.userData.model;
    model.userData.setGear(true);
    model.userData.setLights({ nav: true, beacon: false, strobe: false, landing: false });
    this.group.add(rig);
    const seats = meta.seats;
    const f = {
      id: this.nextId++, type, livery, rig, model, meta,
      callsign: `${livery.code} ${100 + Math.floor(this.rand() * 800)}`,
      dest: DESTS[Math.floor(this.rand() * DESTS.length)],
      from: DESTS[Math.floor(this.rand() * DESTS.length)],
      pax: Math.round(seats * (0.68 + this.rand() * 0.27)),
      mainD: meta.length / 2 - meta.mainGearZ,
      state: 'idle', x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, v: 0, s: 0,
      path: null, reverse: false, stand: null, timer: 0, phase: 0, turnTime: 150,
      thrust: 0, blocked: null, blockedTime: 0, record: null,
      sched: {}, actual: {},
    };
    this.flights.push(f);
    return f;
  }

  _freeStand(type) {
    const free = this.stands.filter((s) => !s.flight);
    if (!free.length) return null;
    // passengers prefer contact stands; freighters the remote ones
    const pref = free.filter((s) => (type === 'cargo' ? !s.contact : s.contact));
    const list = pref.length ? pref : free;
    return list[Math.floor(this.rand() * list.length)];
  }

  /* -------------------------------------------------------- routes */
  _standStopX(stand, f) { return stand.noseX + f.mainD; }

  _arrivalPath(f, stand) {
    const g = this._runwayGeom();
    const { d, F } = g;
    const tw = this.twX;
    const TX = this.TX;
    const zL = -F * this.linkZ;              // arrivals enter the apron at the upstream link
    const aim = f.aimZ;
    const v0 = f.meta.approachSpeed;
    const maxDecel = f.type === 'turboprop' ? 3.0 : f.type === 'narrow' ? 2.7 : 2.5;
    // candidate exits beyond the apron in the roll direction
    const cands = [];
    for (const r of this.rets) if (r.dir === d && d * (r.runwayZ - aim) > 500 && d * (r.joinZ - zL) > 60) cands.push({ kind: 'ret', z: r.runwayZ - d * 130, r, vExit: 16 });
    for (const z of g.conns) if (d * (z - aim) > 650 && d * (z - zL) > 60 && z > g.north - 80 && z < g.south + 10) cands.push({ kind: 'conn', z, vExit: 10 });
    cands.sort((a, b) => d * (a.z - b.z));
    let exit = cands[cands.length - 1];
    const feasible = cands.filter((c) => (v0 * v0 - c.vExit * c.vExit) / (2 * Math.abs(c.z - aim)) <= maxDecel);
    if (feasible.length) exit = feasible.length > 1 && Math.abs(feasible[1].z - feasible[0].z) < 700 && this.rand() < 0.2 ? feasible[1] : feasible[0];
    if (!exit) exit = { kind: 'conn', z: d > 0 ? g.south - 40 : g.north + 40, vExit: 8 };
    const dist = Math.abs(exit.z - aim);
    f.rollDecel = Math.max(1.2, (v0 * v0 - exit.vExit * exit.vExit) / (2 * Math.max(200, dist - (exit.kind === 'ret' ? 60 : 80))));
    f.exitSpeed = exit.vExit;
    f.exitKind = exit.kind;
    let pts;
    if (exit.kind === 'ret') {
      const r = exit.r;
      const ctrl = [[0, aim], [0, r.runwayZ - d * 130, 0]];
      const radii = [200, 160, 160, 45];
      r.pts.forEach((p, i) => ctrl.push([i === 0 ? Math.min(-4, p[0] * 0.3) : p[0], p[1], radii[Math.min(i, 3)]]));
      ctrl.push([tw, r.joinZ + d * 15]);
      const a = filletPoints(ctrl, 2);
      const zU = r.joinZ + d * 60;
      const u = uTurnPoints(tw, zU, d, 9.5, 30);
      const tail = filletPoints([[tw, zU - d * 30], [tw, zL, 32], [TX + 25, zL, 22], ...this._toStand(stand, f, zL, F)], 2);
      pts = joinPts(a, u, tail);
    } else {
      pts = filletPoints([[0, aim], [0, exit.z, 40], [tw, exit.z, 34], [tw, zL, 32], [TX + 25, zL, 22], ...this._toStand(stand, f, zL, F)], 2);
    }
    const heavy = f.type === 'wide' || f.type === 'cargo';
    const tw2 = tw + 6;
    const exitCap = exit.kind === 'ret' ? 16 : 9;
    return new GroundPath(pts, 90, 2.0, 1.4).cap((x) => (x > -8 ? 90 : x > tw2 ? exitCap : heavy ? 10 : TAXI_SPEED));
  }

  /** Control points from the apron link to the stand stop (after [TX+25, zL]). */
  _toStand(stand, f, zL, F) {
    const TX = this.TX;
    const zs = stand.z;
    const stopX = this._standStopX(stand, f);
    if (F * (zs - zL) > 42) return [[TX, zL + F * 30, 22], [TX, zs, 30], [stopX, zs]];
    return [[TX, zs, 22], [stopX, zs]];
  }

  _pushbackPath(f) {
    const g = this._runwayGeom();
    const { F } = g;
    const TX = this.TX;
    const zs = f.stand.z;
    const zD = F * this.linkZ;
    let zE = zs - F * 42;
    if (F * (zD - zE) < 45) zE = zD - F * 45;
    zE = Math.max(this.MP.apron.z0 + 18, Math.min(this.MP.apron.z1 - 18, zE));
    f.pushEndZ = zE;
    return new GroundPath(filletPoints([[this._standStopX(f.stand, f), zs], [TX, zs, 26], [TX, zE]], 1.5), 2.2, 0.4, 0.35);
  }

  _taxiOutPath(f) {
    const g = this._runwayGeom();
    const { d, F } = g;
    const tw = this.twX;
    const TX = this.TX;
    const zD = F * this.linkZ;
    // departure end: the connector nearest the take-off threshold
    const startEnd = d > 0 ? g.north : g.south;
    let zc;
    if (d > 0) zc = this.MP.connectors[0];
    else {
      const southConns = g.conns.filter((z) => z < g.south - 20);
      zc = southConns.length ? Math.max(...southConns) : g.south - 300;
    }
    f.depConnZ = zc;
    f.depStartZ = startEnd;
    const ctrl = [[TX, f.pushEndZ]];
    if (F * (zD - F * 30 - f.pushEndZ) > 10) ctrl.push([TX, zD - F * 30, 30]);
    ctrl.push([TX + 25, zD, 22], [tw, zD, 32], [tw, zc, 38], [HOLD_X, zc]);
    return new GroundPath(filletPoints(ctrl, 2), f.type === 'wide' || f.type === 'cargo' ? 10 : TAXI_SPEED);
  }

  _lineupPath(f) {
    const g = this._runwayGeom();
    const { d } = g;
    const zc = f.depConnZ;
    let pts;
    if (d > 0) {
      const lz = Math.max(zc + 70, g.north + f.mainD + 6);
      pts = filletPoints([[HOLD_X, zc], [0, zc, 32], [0, lz]], 1.5);
      f.rollStartZ = lz;
    } else if (g.south - zc < 160) {
      const lz = Math.min(zc - 70, g.south - f.mainD - 6);
      pts = filletPoints([[HOLD_X, zc], [0, zc, 32], [0, lz]], 1.5);
      f.rollStartZ = lz;
    } else {
      // back-track along the runway and turn on the threshold
      const zU = g.south - 26;
      const a = filletPoints([[HOLD_X, zc], [0, zc, 30], [0, zU - 30]], 2);
      const u = uTurnPoints(0, zU, 1, 12.5, 30);
      pts = joinPts(a, u);
      f.rollStartZ = zU - 30;
      f.backtrack = true;
    }
    return new GroundPath(pts, 9, 0.9, 0.9);
  }

  /* -------------------------------------------------------- spawning */
  _spawnArrival(initialDist = SPAWN_DIST) {
    const type = this._pickType();
    const stand = this._freeStand(type);
    if (!stand) return null;
    const f = this._newFlight(type);
    if (!f) return null;
    const g = this._runwayGeom();
    f.stand = stand;
    stand.flight = f;
    f.d = g.d;
    f.aimZ = g.landThr + g.d * 340;
    f.state = 'approach';
    f.s = initialDist;
    f.v = f.meta.approachSpeed;
    f.thrust = 0.35;
    f.model.userData.setLights({ nav: true, beacon: true, strobe: true, landing: true });
    f.sched.onBlock = this.time + initialDist / f.v + 150;
    this._placeApproach(f);
    return f;
  }

  _populate() {
    // aircraft already on stands, at different points of their turnaround
    const nParked = Math.min(this.stands.length - 2, 5);
    const order = this.stands.slice().sort(() => this.rand() - 0.5);
    for (let k = 0; k < nParked; k++) {
      const stand = order[k];
      const type = this._pickType();
      const f = this._newFlight(type);
      if (!f) break;
      f.stand = stand;
      stand.flight = f;
      this._park(f, true);
      f.phase = k === 0 ? 0.985 : 0.08 + this.rand() * 0.8;
    }
    this._spawnArrival(4200);
    this._arrivalTimer = 70 + this.rand() * 40;
  }

  _park(f, initial = false) {
    const stand = f.stand;
    f.state = 'parked';
    f.x = this._standStopX(stand, f);
    f.z = stand.z;
    f.h = -Math.PI / 2;
    f.y = 0; f.pitch = 0; f.v = 0;
    f.phase = 0;
    f.thrust = 0;
    const base = { narrow: 170, turboprop: 135, wide: 250, cargo: 220 }[f.type] || 170;
    f.turnTime = base * (0.9 + this.rand() * 0.25) + (this.rand() < 0.12 ? 60 : 0);
    f.actual.onBlock = this.time;
    if (initial) f.sched.offBlock = this.time + f.turnTime * (0.9 + this.rand() * 0.2);
    else f.sched.offBlock = (f.sched.onBlock || this.time) + base;
    f.model.userData.setLights({ nav: true, beacon: false, strobe: false, landing: false });
    f.model.userData.setGear(true);
    f.record = { stand: stand.index, x: 0, z: 0, heading: 0, type: f.type, length: f.meta.length, span: f.meta.span, phase: 0, pushing: false, remote: !stand.contact, callsign: f.callsign };
  }

  /* -------------------------------------------------------- runway */
  _preferredRunway() {
    const w = this.wind;
    const h02 = Math.cos((w.dir - 25.5) * DEG);
    return h02 > 0 ? '02' : '20';
  }

  _arrivalsWithin(dist) {
    for (const f of this.flights) if (f.state === 'approach' && f.s < dist) return true;
    return false;
  }

  _runwayBusy() { return !!this.runwayOwner; }

  /* -------------------------------------------------------- update */
  update(dt, ctx = {}) {
    if (!this.active) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.time += dt;
    this._ctxWorld = ctx.world || this._ctxWorld;
    this._groundAt = ctx.groundAt || (this.layout && this.layout.groundAt) || null;
    this._dt = dt;
    if (this.startHour === undefined) this.startHour = ctx.sky && typeof ctx.sky.hour === 'number' ? ctx.sky.hour : 9;
    const night = ctx.night !== undefined ? ctx.night : ctx.lights !== undefined ? ctx.lights : 0;
    setLightClock(ctx.elapsed !== undefined ? ctx.elapsed : this.time, night);
    this._updateWind(dt);

    // runway change once the traffic allows
    const pref = this._preferredRunway();
    const tail = this.wind.speed * Math.cos((this.wind.dir - (this.activeRunway === '02' ? 25.5 : 205.5)) * DEG);
    if (pref !== this.activeRunway && tail < -2) this.pendingRunway = pref;
    if (this.pendingRunway) {
      const busy = this.flights.some((f) => ['approach', 'rollout', 'taxiIn', 'pushback', 'startup', 'taxiOut', 'holding', 'lineup', 'takeoff', 'goaround'].includes(f.state) && !(f.state === 'takeoff' && f.y > 150));
      if (!busy) { this.activeRunway = this.pendingRunway; this.pendingRunway = null; this._arrivalTimer = Math.min(this._arrivalTimer, 15); }
    }

    // arrivals stream
    this._arrivalTimer -= dt;
    const holdingLong = this.flights.some((f) => f.state === 'holding' && f.timer > 35);
    if (this._arrivalTimer <= 0 && !this.pendingRunway) {
      const tooClose = this.flights.some((f) => f.state === 'approach' && f.s > SPAWN_DIST - 7000);
      if (!tooClose && !holdingLong && this._spawnArrival()) this._arrivalTimer = 120 + this.rand() * 110;
      else this._arrivalTimer = 8;
    }

    for (const f of this.flights) this._stepFlight(f, dt);
    this._separate(dt);
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      if (f.state === 'gone') { this._release(f); this.flights.splice(i, 1); }
    }
    for (const f of this.flights) this._applyPose(f);
    this.smoke.update(dt);

    // turnaround records for the GSE
    this._turnarounds.length = 0;
    for (const f of this.flights) {
      if (!f.record) continue;
      const r = f.record;
      // the record carries the aircraft's reference point (fuselage centre), not the main gear
      r.x = f.x - Math.sin(f.h) * f.meta.mainGearZ;
      r.z = f.z - Math.cos(f.h) * f.meta.mainGearZ;
      r.heading = f.h;
      r.phase = f.state === 'parked' ? Math.min(1, f.phase) : 1;
      r.pushing = f.state === 'pushback';
      this._turnarounds.push(r);
    }
    const fleet = this._fleet();
    if (fleet) {
      if (!this._gseOn && fleet.setGseActive) { fleet.setGseActive(true); this._gseOn = true; }
      if (fleet.setTurnarounds) fleet.setTurnarounds(this._turnarounds);
    }

    this._updateKpis(dt);
  }

  _updateWind(dt) {
    const w = this.wind;
    if (w.forced) { w.dir += (w.forced.dir - w.dir) * Math.min(1, dt * 0.2); w.speed += (w.forced.speed - w.speed) * Math.min(1, dt * 0.2); return; }
    // prevailing south-westerly with slow veering; an occasional northerly spell
    const t = this.time;
    const spell = Math.sin(t / 900 - 1.0) > 0.82 ? 1 : 0;
    const base = spell ? 25 : 215;
    w.base += (base - w.base) * Math.min(1, dt * 0.004);
    w.dir = ((w.base + Math.sin(t / 47) * 12 + Math.sin(t / 13.7) * 4) % 360 + 360) % 360;
    w.speed = Math.max(2, 9 + Math.sin(t / 61) * 4 + Math.sin(t / 7.3) * 1.2);
  }

  _placeApproach(f) {
    f.x = 0;
    f.z = f.aimZ - f.d * f.s;
    f.y = f.s * GLIDE;
    f.h = f.d > 0 ? 0 : Math.PI;
    f.pitch = 2.6 * DEG;
  }

  _followPath(f, dt, vTarget, accel = 0.7, decel = 1.4) {
    const p = f.path;
    const smp = p.sample(f.s, this._sample);
    let vLim = Math.min(vTarget, smp.v);
    const remain = p.length - f.s;
    vLim = Math.min(vLim, Math.sqrt(2 * decel * 0.8 * Math.max(0, remain)) + 0.15);
    if (f.blockGap !== undefined && f.blockGap < 1e8) vLim = Math.min(vLim, Math.sqrt(2 * decel * Math.max(0, f.blockGap)));
    if (f.holdAt !== undefined) vLim = Math.min(vLim, Math.sqrt(2 * decel * Math.max(0, f.holdAt - f.s)));
    if (f.v < vLim) f.v = Math.min(vLim, f.v + accel * dt); else f.v = Math.max(vLim, f.v - decel * 1.6 * dt);
    f.s = Math.min(p.length, f.s + f.v * dt);
    p.sample(f.s, smp);
    f.x = smp.x; f.z = smp.z;
    const hh = f.reverse ? smp.h + Math.PI : smp.h;
    f.h = hh;
    return remain - f.v * dt <= 0.05;
  }

  _stepFlight(f, dt) {
    f.timer += dt;
    const ud = f.model.userData;
    switch (f.state) {
      case 'approach': {
        f.s -= f.v * dt;
        // landing clearance
        if (f.s < 2500 && this.runwayOwner !== f) {
          if (!this.runwayOwner || this.runwayOwner.state === 'gone') this.runwayOwner = f;
          else if (f.s < 1200) { this._goAround(f); break; }
        }
        if (f.s > 230) {
          this._placeApproach(f);
        } else {
          // flare
          const k = Math.max(0, f.s / 230);
          f.x = 0;
          f.z = f.aimZ - f.d * f.s;
          f.y = 230 * GLIDE * Math.pow(k, 1.7);
          f.pitch = (2.6 + 3.2 * (1 - k)) * DEG;
          f.v -= dt * 1.2;
        }
        if (f.s <= 0) {
          f.state = 'rollout';
          f.y = 0;
          f.s = 0;
          f.timer = 0;
          f.path = this._arrivalPath(f, f.stand);
          f.reverse = false;
          f.thrust = 0.65;
          this._stats.arrivals++;
          this._logMovement(f.pax);
          const half = f.meta.span * 0.12;
          const sx = Math.sin(f.h + Math.PI / 2) * half;
          const sz = Math.cos(f.h + Math.PI / 2) * half;
          const vx = Math.sin(f.h) * f.v;
          const vz = Math.cos(f.h) * f.v;
          this.smoke.puff(f.x + sx, 0.4, f.z + sz, vx, vz, 9, f.type === 'turboprop' ? 3 : 5);
          this.smoke.puff(f.x - sx, 0.4, f.z - sz, vx, vz, 9, f.type === 'turboprop' ? 3 : 5);
          f.actual.touchdown = this.time;
        }
        break;
      }
      case 'rollout': {
        // derotate onto the nose gear, then brake towards the planned exit speed
        f.pitch = Math.max(0, f.pitch - dt * 2.2 * DEG);
        const decel = f.v > f.exitSpeed ? f.rollDecel : 0;
        f.v = Math.max(f.exitSpeed, f.v - decel * dt);
        if (f.timer > 9) f.thrust = 0.18;
        this._followPath(f, dt, f.v, 0, 3);
        f.v = Math.max(f.v, 0);
        if (f.v <= f.exitSpeed + 0.01) { f.state = 'taxiIn'; ud.setLights({ strobe: false }); }
        break;
      }
      case 'taxiIn': {
        f.thrust = 0.16;
        if (f.x < -75 && this.runwayOwner === f) { this.runwayOwner = null; ud.setLights({ landing: false }); f.actual.vacate = this.time; }
        if (this._followPath(f, dt, 25)) {
          if (this.runwayOwner === f) this.runwayOwner = null;
          this._stats.taxi.push((this.time - (f.actual.vacate || f.actual.touchdown || this.time)) / 60);
          this._judge(f.actual.onBlock = this.time, f.sched.onBlock);
          this._park(f);
        }
        break;
      }
      case 'parked': {
        f.phase += dt / f.turnTime;
        if (f.phase > 0.94) ud.setLights({ beacon: true });
        if (f.phase >= 1 && !this.pendingRunway) {
          f.phase = 1;
          if (this._canPushback(f)) {
            f.state = 'pushback';
            f.path = this._pushbackPath(f);
            f.reverse = true;
            f.s = 0; f.v = 0; f.timer = 0;
            f.actual.offBlock = this.time;
            ud.setLights({ beacon: true });
          }
        }
        break;
      }
      case 'pushback': {
        f.thrust = 0.08;
        if (this._followPath(f, dt, 2.2, 0.3, 0.4)) {
          f.state = 'startup';
          f.timer = 0;
          f.record = null;
          if (f.stand.flight === f) f.stand.flight = null;
          f.stand = null;
        }
        break;
      }
      case 'startup':
        f.thrust = Math.min(0.25, f.timer * 0.03);
        if (f.timer > 9) {
          f.state = 'taxiOut';
          f.path = this._taxiOutPath(f);
          f.reverse = false;
          f.s = 0; f.v = 0; f.timer = 0;
        }
        break;
      case 'taxiOut':
        f.thrust = 0.2;
        if (this._followPath(f, dt, TAXI_SPEED)) { f.state = 'holding'; f.timer = 0; f.v = 0; }
        break;
      case 'holding': {
        f.thrust = 0.12;
        const gap = !this.extended && this.activeRunway === '02' ? 9500 : 6500;
        if (!this._runwayBusy() && !this._arrivalsWithin(gap) && !this.pendingRunway) {
          this.runwayOwner = f;
          f.state = 'lineup';
          f.path = this._lineupPath(f);
          f.s = 0; f.timer = 0;
          f.turn = (this.rand() - 0.5) * 0.5;
          if (f.actual.offBlock) this._stats.taxi.push((this.time - f.actual.offBlock) / 60);
          ud.setLights({ strobe: true, landing: true });
        }
        break;
      }
      case 'lineup':
        f.thrust = 0.22;
        if (this._followPath(f, dt, 8, 0.6, 1.0)) { f.state = 'takeoff'; f.timer = 0; f.v = 0; }
        break;
      case 'takeoff': {
        const d = this.activeRunway === '02' ? -1 : 1;
        f.h = d > 0 ? 0 : Math.PI;
        if (f.timer < 3) { f.thrust = 0.3 + f.timer * 0.2; break; }
        f.thrust = 1;
        const a = f.meta.accel * Math.max(0.55, 1 - f.v / 140);
        f.v += a * dt;
        f.z += d * f.v * dt;
        f.x *= 1 - Math.min(1, dt);
        if (f.v > f.meta.rotateSpeed) f.pitch = Math.min((f.type === 'turboprop' ? 9 : 11) * DEG, f.pitch + dt * 3 * DEG);
        if (f.pitch > 6.5 * DEG) {
          if (!f.airborne) { f.airborne = true; f.actual.takeoff = this.time; this._stats.departures++; this._logMovement(f.pax); this._judge(this.time, f.sched.offBlock + 280); }
          const gamma = Math.min(8.5 * DEG, (f.y + 2) * 0.03 * DEG + 3 * DEG);
          f.y += f.v * Math.sin(gamma) * dt;
          if (f.y > 30) ud.setGear(false);
          if (f.y > 160 && this.runwayOwner === f) { this.runwayOwner = null; ud.setLights({ landing: false }); }
          if (f.y > 400) {
            f.roll += (f.turn - f.roll) * Math.min(1, dt * 0.3);
            f.h += Math.tan(f.roll) * 9.81 / Math.max(60, f.v) * dt;
          }
          if (f.y > 1300 || Math.abs(f.z) > 14000) f.state = 'gone';
        }
        break;
      }
      case 'goaround': {
        f.thrust = 0.95;
        f.v = Math.min(95, f.v + dt * 1.5);
        f.pitch += (12 * DEG - f.pitch) * Math.min(1, dt * 0.6);
        f.y += f.v * Math.sin(Math.min(f.pitch, 7 * DEG)) * dt;
        f.z += f.d * f.v * dt;
        if (f.y > 60) ud.setGear(false);
        if (f.y > 900 || Math.abs(f.z) > 14000) f.state = 'gone';
        break;
      }
      default: break;
    }
  }

  _goAround(f) {
    f.state = 'goaround';
    this._stats.goArounds++;
    if (f.stand && f.stand.flight === f) f.stand.flight = null;
    f.stand = null;
    f.record = null;
    this._arrivalTimer = Math.min(this._arrivalTimer, 60);
  }

  _canPushback(f) {
    // keep the taxilane clear: nothing moving on the lane near this stand, and not too many queued for departure
    const queued = this.flights.filter((o) => o.state === 'pushback' || o.state === 'startup' || o.state === 'taxiOut' || o.state === 'holding').length;
    if (queued >= 3) return false;
    const zs = f.stand.z;
    for (const o of this.flights) {
      if (o === f || o.state === 'parked' || o.state === 'approach' || o.y > 5) continue;
      const nearLane = o.x < -200 && o.x > -440;
      if (nearLane && Math.abs(o.z - zs) < 150) return false;
      if ((o.state === 'pushback' || o.state === 'startup') && Math.abs(o.z - zs) < 200) return false;
    }
    return true;
  }

  /** Forward-corridor braking between ground aircraft. */
  _separate(dt) {
    const fl = this.flights;
    for (const a of fl) {
      a.blockGap = 1e9;
      a.blockedBy = null;
      const moving = a.state === 'taxiIn' || a.state === 'taxiOut' || a.state === 'pushback' || a.state === 'lineup';
      if (!moving) continue;
      const hdg = a.reverse ? a.h + Math.PI : a.h;
      const fx = Math.sin(hdg);
      const fz = Math.cos(hdg);
      for (const b of fl) {
        if (b === a || b.y > 8 || b.state === 'approach' || b.state === 'gone') continue;
        if (a.state === 'taxiIn' && b.state === 'parked' && a.path && a.path.length - a.s < 160) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const fwd = dx * fx + dz * fz;
        if (fwd <= 0) continue;
        const lat = Math.abs(dx * fz - dz * fx);
        const half = (a.meta.length + b.meta.length) / 2;
        if (fwd > half + 160) continue;
        if (lat > (a.meta.span + b.meta.span) * 0.25 + 4) continue;
        const gap = fwd - half - 18;
        if (gap < a.blockGap) { a.blockGap = gap; a.blockedBy = b; }
      }
      // break symmetric stand-offs deterministically
      if (a.blockedBy && a.blockedBy.blockedBy === a && a.id < a.blockedBy.id) { a.blockGap = 1e9; a.blockedBy = null; }
    }
  }

  _applyPose(f) {
    const rig = f.rig;
    if (!rig) return;
    const onGround = f.y <= 0.001;
    const gy = onGround && this._groundAt ? this._groundAt(f.x, f.z) || 0 : 0;
    rig.position.set(f.x, f.y + gy, f.z);
    rig.rotation.set(-f.pitch, f.h, f.roll);
    const props = f.model.userData.parts.props;
    if (props && props.length) {
      const w = f.state === 'parked' && f.phase < 0.94 ? 0 : 6 + f.thrust * 30;
      for (const p of props) p.rotation.z += w * (this._dt || 0.016);
    }
  }

  /* -------------------------------------------------------- KPIs */
  _logMovement(pax) {
    this._stats.log.push(this.time, pax);
    this._stats.pax += pax;
  }

  _judge(actual, scheduled) {
    if (!(scheduled > 0)) return;
    this._stats.judged++;
    if (actual - scheduled <= 240) this._stats.onTime++;
  }

  _updateKpis(dt) {
    const k = this._kpi;
    const S = this._stats;
    // rolling one-hour window
    while (S.log.length && S.log[0] < this.time - 3600) S.log.splice(0, 2);
    const window = Math.max(900, Math.min(3600, this.time));
    const movesWin = S.log.length / 2;
    let paxWin = 0;
    for (let i = 1; i < S.log.length; i += 2) paxWin += S.log[i];
    k.movements = S.arrivals + S.departures;
    k.movementsPerHour = Math.round((movesWin / window) * 3600 * 10) / 10;
    k.pax = S.pax;
    k.onTimePct = S.judged ? Math.round((S.onTime / S.judged) * 1000) / 10 : 100;
    if (S.taxi.length > 40) S.taxi.splice(0, S.taxi.length - 40);
    k.avgTaxiMin = S.taxi.length ? Math.round((S.taxi.reduce((s, v) => s + v, 0) / S.taxi.length) * 10) / 10 : 0;
    k.activeRunway = this.activeRunway;
    k.wind.dir = Math.round(this.wind.dir);
    k.wind.speed = Math.round(this.wind.speed);
    k.arrivals = S.arrivals;
    k.departures = S.departures;
    k.goArounds = S.goArounds;
    let onStand = 0;
    let air = 0;
    for (const f of this.flights) { if (f.state === 'parked') onStand++; if (f.y > 5) air++; }
    k.onStand = onStand;
    k.airborne = air;
    // benefits: one simulated hour of operations ≈ one airport day (turnarounds run ×18 over ~18 operating hours)
    this._recordTimer += dt;
    if (this._recordTimer > 60 && this.time > 300 && this.project && typeof this.project.recordOperations === 'function') {
      this._recordTimer = 0;
      const perDay = (18 / TURN_COMPRESSION);
      try {
        this.project.recordOperations({
          movements: Math.round(k.movementsPerHour * perDay),
          pax: Math.round((paxWin / window) * 3600 * perDay),
          onTimePct: k.onTimePct,
        });
      } catch (e) { /* project API optional */ }
    }
  }

  kpis() { return this._kpi; }

  /** Nearest aircraft and its engine thrust, for jet-spool audio. */
  audioState(cameraPos) {
    const out = this._audio;
    out.nearest = Infinity; out.distance = Infinity; out.thrust = 0; out.type = null;
    if (!this.active || !cameraPos) return out;
    let best = Infinity;
    let score = 0;
    for (const f of this.flights) {
      if (!f.rig || f.state === 'gone') continue;
      const d = Math.hypot(f.x - cameraPos.x, f.y - cameraPos.y, f.z - cameraPos.z);
      // loudness proxy: thrust over distance; report the loudest
      const s = (0.15 + f.thrust) / Math.max(30, d);
      if (s > score) { score = s; best = d; out.thrust = f.thrust; out.type = f.type; out.x = f.x; out.y = f.y; out.z = f.z; }
    }
    out.nearest = best;
    out.distance = best;
    return out;
  }

  /** Live FIDS rows (departures). */
  fidsRows() {
    const rows = [];
    for (const f of this.flights) {
      if (!['parked', 'pushback', 'startup', 'taxiOut', 'holding', 'lineup'].includes(f.state) || f.type === 'cargo') continue;
      const status = f.state === 'parked' ? (f.phase < 0.55 ? 'CHECK-IN' : f.phase < 0.9 ? 'BOARDING' : 'CLOSED') : 'DEPARTED';
      rows.push({ time: this._clock(f.sched.offBlock || this.time), flight: f.callsign, dest: f.dest, gate: f.stand ? f.stand.id : '—', status });
    }
    return rows.slice(0, 9);
  }

  /** Live FIDS rows (arrivals). */
  fidsArrivals() {
    const rows = [];
    for (const f of this.flights) {
      if (!['approach', 'rollout', 'taxiIn', 'parked'].includes(f.state) || f.type === 'cargo') continue;
      if (f.state === 'parked' && f.phase > 0.35) continue;
      const status = f.state === 'approach' ? (f.s < 6000 ? 'FINAL' : 'APPROACH') : f.state === 'parked' ? 'ON STAND' : 'LANDED';
      rows.push({ time: this._clock(f.sched.onBlock || this.time), flight: f.callsign, from: f.from, gate: f.stand ? f.stand.id : '—', status });
    }
    return rows.slice(0, 9);
  }

  _clock(t) {
    const m = Math.floor(((this.startHour || 9) * 60 + (t * TURN_COMPRESSION) / 60) % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  dispose() {
    this.stop();
    for (const list of this.pool.values()) for (const rig of list) rig.userData.model.userData.dispose();
    this.pool.clear();
    this.smoke.dispose();
    this.scene.remove(this.group);
    disposeAircraftCache();
  }
}
