import * as THREE from 'three';
import { CollisionWorld } from './collision.js';
import { SkySystem } from '../engine/sky.js';
import { WeatherSystem } from '../engine/weather.js';
import { WORLD_LINKS, MASTERPLAN, RUNWAY, GEO } from './layout.js';
import { TerrainSystem, terrainHeight } from './terrain.js';
import { Airfield, STANDS, TAXILANE_X } from './airfield.js';
import { WorldMaterials, DustPuffs, BirdFlock } from './props.js';
/*@IMPORTS@*/

/**
 * World — everything that exists in 3D at Hyderabad Airport (HDD / OPKD),
 * kept in step with the project simulation.
 *
 * Subsystems register "elements" keyed by WBS id (layout.WORLD_LINKS). Each
 * element knows its planned footprint (for picking, highlight, heat-map
 * overlay and camera focus), how to show itself at a given % complete, and
 * where its work front is (for vehicles and workers).
 *
 * Vehicle/crowd/traffic systems (A4) are optional: pass them as
 * `options.systems` or via World.registerSystems({...}) — every call into them
 * is guarded so the world never fails because one of them is missing.
 */

const FRIENDLY = {
  '2.3': 'Encroachment clearance', '2.4': 'Perimeter wall & fence', '2.6': 'Site establishment',
};

const TIER_COUNTS = {
  low: { trees: 650, scrub: 2600, city: 1700, cars: 90 },
  medium: { trees: 1200, scrub: 5200, city: 3200, cars: 160 },
  high: { trees: 2000, scrub: 9000, city: 5200, cars: 240 },
  ultra: { trees: 2800, scrub: 14000, city: 8000, cars: 320 },
};

function mergeMaterials(engineLib, fallback) {
  if (!engineLib) return fallback;
  const out = Object.create(fallback);
  for (const key of ['asphaltOld', 'asphaltNew', 'concrete', 'concreteApron', 'glass', 'roofMetal', 'sand', 'soilCut', 'soilFill',
    'gravelSubbase', 'crushedBase', 'dryGrass', 'markingWhite', 'markingYellow', 'ajrakScreen', 'tile', 'plaster']) {
    const v = engineLib[key];
    if (v && v.isMaterial) out[key] = v;
  }
  for (const fn of ['paintedSteel', 'emissive']) {
    if (typeof engineLib[fn] === 'function') out[fn] = (...a) => { try { return engineLib[fn](...a) || fallback[fn](...a); } catch (e) { return fallback[fn](...a); } };
  }
  out.setWetness = (w) => {
    fallback.setWetness(w);
    if (typeof engineLib.setWetness === 'function') { try { engineLib.setWetness(w); } catch (e) { /* engine optional */ } }
  };
  return out;
}

export class World {
  constructor(engine, textures, { onProgress = () => {}, systems = null, materials = null } = {}) {
    this.engine = engine;
    this.textures = textures;
    this.quality = engine.quality;
    this.onProgress = onProgress;
    this.scene = new THREE.Scene();
    this.scene.name = 'hdd-world';
    this.collision = new CollisionWorld(terrainHeight);
    this.pointsOfInterest = [];
    this.operations = null;
    this.elements = new Map();
    this.layerCache = new Map();
    this.systemsIn = systems || World._systems || {};
    this.materialsIn = materials || engine.materials || null;
    this.fidsSource = null;
    this.towerCabView = null;
    this._time = 0;
    this._fidsTimer = 0;
    this._selected = null;
    this._overlayKind = null;
    this.state = { pct: {}, workforce: 0, phase: 'initiating', operational: false, activeIds: [] };
    const tier = this.quality && this.quality.tier ? this.quality.tier : 'medium';
    const s = (this.quality && this.quality.settings) || {};
    const d = TIER_COUNTS[tier] || TIER_COUNTS.medium;
    this.counts = {
      trees: s.treeCount || Math.round(d.trees),
      scrub: s.scrubCount || d.scrub,
      city: s.cityBlocks || d.city,
      cars: s.carCount || d.cars,
      birds: s.birdCount ? Math.min(60, s.birdCount) : 30,
    };
  }

  static registerSystems(systems) { World._systems = { ...(World._systems || {}), ...systems }; }

  /** Build the world one step at a time so the loading bar can breathe. */
  async build() {
    const steps = [
      ['Raising the Sindh sky over the Indus plain', () => this._buildSky()],
      ['Surveying the alluvial plain at 41 m above sea level', () => this._buildTerrain()],
      ['Laying runway 02/20 — the existing 2,133 m pavement and the Code E extension', () => this._buildAirfield()],
      /*@STEPS@*/
      ['Wiring airfield lighting, navaids and points of interest', () => this._finalise()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      this.onProgress(i / steps.length, `${label}…`);
      await new Promise((r) => requestAnimationFrame(() => r()));
      fn.call(this);
    }
    this.onProgress(1, 'Hyderabad Airport ready.');
  }

  /* ---------------------------------------------------------------- steps */

  _buildSky() {
    this.sky = new SkySystem(this.scene, { quality: this.quality });
    if (this.sky.setHour) this.sky.setHour(9.5);
    this.M = mergeMaterials(this.materialsIn, new WorldMaterials(this.quality));
    this._fallbackMaterials = Object.getPrototypeOf(this.M) instanceof WorldMaterials ? Object.getPrototypeOf(this.M) : this.M;
    try {
      this.weather = new WeatherSystem(this.scene, this.sky, this.quality, this.M);
    } catch (e) {
      this.weather = { state: { kind: 'clear', intensity: 0, visibility: 1 }, set() {}, update() {}, dispose() {} };
    }
    this._buildEnvironment();
  }

  /** A small gradient environment for glass and metal reflections. */
  _buildEnvironment() {
    try {
      const envScene = new THREE.Scene();
      const geo = new THREE.SphereGeometry(10, 32, 16);
      const cols = [];
      const pos = geo.attributes.position;
      const top = new THREE.Color(0x6d93c4); const hor = new THREE.Color(0xe8dcc4); const gnd = new THREE.Color(0x8a7356);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 10;
        if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 3));
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
      envScene.add(new THREE.Mesh(geo, mat));
      const pm = new THREE.PMREMGenerator(this.engine.renderer);
      this.envRT = pm.fromScene(envScene, 0.02);
      pm.dispose(); geo.dispose(); mat.dispose();
      this.envMap = this.envRT.texture;
      for (const k of ['glass', 'paintMetal', 'roofMetal']) if (this.M[k] && !this.M[k].envMap) { this.M[k].envMap = this.envMap; this.M[k].needsUpdate = true; }
    } catch (e) {
      this.envMap = null;
    }
  }

  _ctx() {
    return { scene: this.scene, M: this.M, quality: this.quality, collision: this.collision, layerCache: this.layerCache, counts: this.counts, envMap: this.envMap, world: this };
  }

  _buildTerrain() {
    this.terrain = new TerrainSystem(this.scene, this.quality);
  }

  _buildAirfield() {
    this.airfield = new Airfield(this._ctx());
    this._register(this.airfield);
  }

  /*@BUILDERS@*/

  _register(system) {
    if (!system) return;
    for (const el of system.elements || []) {
      let e = this.elements.get(el.id);
      if (!e) {
        e = { id: el.id, name: el.name, boxes: [], applies: [], fronts: [], kind: el.kind || 'building', surface: el.surface, fallback: el.fallback, p: -1 };
        this.elements.set(el.id, e);
      }
      if (el.pickBoxes) for (const b of el.pickBoxes) e.boxes.push(new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])));
      else e.boxes.push(el.box.clone());
      e.applies.push(el.apply);
      if (el.front) e.fronts.push(el.front);
      if (el.fallback && !e.fallback) e.fallback = el.fallback;
    }
    if (system.lightFields) (this.lightFields = this.lightFields || []).push(...system.lightFields);
    if (system.lightPools) (this.lightPools = this.lightPools || []).push(...system.lightPools);
    if (system.pois) this.pointsOfInterest.push(...system.pois);
  }

  _finalise() {
    // Dust, birds.
    this.dust = new DustPuffs(this.scene, { capacity: 260 });
    this.birds = new BirdFlock(this.scene, { count: this.counts.birds });
    this._buildPickProxies();
    this._buildHighlight();
    this._buildOverlay();
    this._buildPois();
    this.applyProjectState(this.state, true);
  }

  /* ------------------------------------------------------- picking / UI */

  _buildPickProxies() {
    this.pickGroup = new THREE.Group();
    this._unitBox = new THREE.BoxGeometry(1, 1, 1);
    this._unitBox.translate(0, 0.5, 0);
    this._proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.proxies = [];
    for (const e of this.elements.values()) {
      e.proxies = [];
      for (const b of e.boxes) {
        const m = new THREE.Mesh(this._unitBox, this._proxyMat);
        m.userData.wbsId = e.id;
        m.userData.box = b;
        this.pickGroup.add(m);
        e.proxies.push(m);
        this.proxies.push(m);
      }
      this._updateProxy(e);
    }
  }

  _builtHeight(e, b) {
    const h = b.max.y - b.min.y;
    const p = Math.max(0, e.p);
    return Math.max(1.5, h * (e.kind === 'building' ? Math.max(0.12, p) : 1));
  }

  _updateProxy(e) {
    if (!e.proxies) return;
    for (const m of e.proxies) {
      const b = m.userData.box;
      m.position.set((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
      m.scale.set(Math.max(1, b.max.x - b.min.x), this._builtHeight(e, b), Math.max(1, b.max.z - b.min.z));
      m.updateMatrixWorld(true);
    }
  }

  pick(raycaster) {
    if (!this.proxies) return null;
    const hits = raycaster.intersectObjects(this.proxies, false);
    if (!hits.length) return null;
    const d0 = hits[0].distance;
    const active = new Set(this.state.activeIds || []);
    let best = null; let bestScore = Infinity;
    for (const h of hits) {
      if (h.distance > d0 + Math.max(40, d0 * 0.05)) break;
      const id = h.object.userData.wbsId;
      const e = this.elements.get(id);
      const b = h.object.userData.box;
      const area = (b.max.x - b.min.x) * (b.max.z - b.min.z);
      const working = active.has(id) || (e.p > 0 && e.p < 1);
      const score = Math.log10(area + 10) - (working ? 2 : 0) - (e.p > 0 ? 0.5 : 0);
      if (score < bestScore) { bestScore = score; best = h; }
    }
    if (!best) return null;
    const id = best.object.userData.wbsId;
    const e = this.elements.get(id);
    return { wbsId: id, name: e ? e.name : (FRIENDLY[id] || WORLD_LINKS[id] || id), point: best.point.clone() };
  }

  _buildHighlight() {
    this.highlightGroup = new THREE.Group();
    this.highlightGroup.name = 'highlight';
    this.highlightGroup.visible = false;
    this.scene.add(this.highlightGroup);
    this._edgeGeo = new THREE.EdgesGeometry(this._unitBox);
    this._hlLine = new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, depthTest: false, opacity: 0.95 });
    this._hlFill = new THREE.MeshBasicMaterial({ color: 0xffc23d, transparent: true, opacity: 0.12, depthWrite: false });
  }

  highlight(id) {
    this._selected = id || null;
    const g = this.highlightGroup;
    if (!g) return;
    while (g.children.length) g.remove(g.children[0]);
    const e = id ? this.elements.get(id) : null;
    g.visible = !!e;
    if (!e) return;
    for (const b of e.boxes) {
      const h = this._builtHeight(e, b) + 1;
      const line = new THREE.LineSegments(this._edgeGeo, this._hlLine);
      line.position.set((b.min.x + b.max.x) / 2, b.min.y - 0.2, (b.min.z + b.max.z) / 2);
      line.scale.set(b.max.x - b.min.x + 4, h, b.max.z - b.min.z + 4);
      line.renderOrder = 30;
      const fill = new THREE.Mesh(this._unitBox, this._hlFill);
      fill.position.copy(line.position);
      fill.scale.copy(line.scale);
      fill.renderOrder = 29;
      g.add(line, fill);
    }
  }

  _buildOverlay() {
    const n = Math.max(1, this.proxies.length);
    this._ovMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, color: 0xffffff });
    this.overlayMesh = new THREE.InstancedMesh(this._unitBox, this._ovMat, n);
    this.overlayMesh.name = 'pm-overlay';
    this.overlayMesh.visible = false;
    this.overlayMesh.renderOrder = 28;
    this.overlayMesh.frustumCulled = false;
    this.scene.add(this.overlayMesh);
  }

  setOverlay(kind, valuesById) {
    this._overlayKind = kind || null;
    this._overlayValues = valuesById || null;
    const mesh = this.overlayMesh;
    if (!mesh) return;
    if (!kind || !valuesById) { mesh.visible = false; return; }
    const m = new THREE.Matrix4(); const c = new THREE.Color();
    const red = new THREE.Color(0xe0302a); const amber = new THREE.Color(0xffb000); const green = new THREE.Color(0x3ddc84);
    let i = 0;
    for (const e of this.elements.values()) {
      const v = valuesById[e.id];
      if (v === undefined || v === null || Number.isNaN(v)) continue;
      const t = Math.max(-1, Math.min(1, v));
      if (t < 0) c.copy(amber).lerp(red, -t); else c.copy(amber).lerp(green, t);
      for (const b of e.boxes) {
        if (i >= mesh.instanceMatrix.count) break;
        const h = this._builtHeight(e, b) + 2;
        m.compose(new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y - 0.1, (b.min.z + b.max.z) / 2), new THREE.Quaternion(), new THREE.Vector3(b.max.x - b.min.x + 2, h, b.max.z - b.min.z + 2));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = i > 0;
  }

  elementCentre(id) {
    const e = this.elements.get(id);
    if (!e || !e.boxes.length) return null;
    const box = new THREE.Box3();
    for (const b of e.boxes) box.union(b);
    const c = box.getCenter(new THREE.Vector3());
    c.y = box.min.y + this._builtHeight(e, e.boxes[0]) * 0.5;
    return c;
  }

  /* --------------------------------------------------------------- POIs */

  _buildPois() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const add = (id, name, wbsId, pos, text, extra = {}) => this.pointsOfInterest.push({ id, name, wbsId, position: pos, text, ...extra });
    add('poi-thr02', 'RWY 02 threshold (new)', '3.5', V(-30, 1.7, RUNWAY.extensionEndZ),
      'The simulated 1,372 m southern extension moves the RWY 02 threshold here, giving a 3,505 m Code E runway. Piano keys, designators and the green threshold light bar mark the landing threshold.', { radius: 26 });
    add('poi-thr20', 'RWY 20 threshold & displaced area', '3.9', V(-30, 1.7, RUNWAY.threshold20Z),
      'Runway 20 threshold. The 120 m of pavement north of it is a displaced-threshold area (white arrows) usable for take-off, then a blast pad with yellow chevrons.', { radius: 26 });
    add('poi-extension', 'Extension works front', '3.2', V(-40, 1.7, 1500),
      'Earthworks → granular sub-base → crushed-stone base → asphalt surfacing. Each layer advances south as its WBS element progresses; compaction and density are tested before the next layer is placed.', { radius: 30 });
    add('poi-windsock', 'Windsock', '6.5', V(MASTERPLAN.windsock.x + 4, 1.7, MASTERPLAN.windsock.z),
      'Wind direction and strength for pilots. Runway-in-use (02 or 20) follows the wind; the sock fills and swings with the simulated weather.', { radius: 18 });
    add('poi-awos', 'AWOS weather station', '6.5', V(MASTERPLAN.awos.x - 8, 1.7, MASTERPLAN.awos.z),
      'Automated weather observing system: wind, visibility, temperature, pressure and rain feed the tower and ATIS.', { radius: 18 });
  }

  /* --------------------------------------------------- project state */

  applyProjectState(state = {}, force = false) {
    const pct = (state && state.pct) || {};
    this.state = {
      pct,
      workforce: state.workforce || 0,
      phase: state.phase || 'initiating',
      operational: !!state.operational,
      weather: state.weather || null,
      activeIds: state.activeIds || [],
    };
    if (this.airfield) this.airfield.noteState(pct);
    for (const e of this.elements.values()) {
      let p = pct[e.id];
      if (p === undefined && e.fallback) p = pct[e.fallback];
      p = Math.max(0, Math.min(1, Number(p) || 0));
      if (force || Math.abs(p - e.p) > 1e-4) {
        e.p = p;
        for (const fn of e.applies) { try { fn(p); } catch (err) { console.error(`world: apply ${e.id} failed`, err); } }
        this._updateProxy(e);
      }
    }
    if (this.construction && this.construction.setState) this.construction.setState(this.state, this);
    if (this.terminal && this.terminal.setOperational) this.terminal.setOperational(this.state.operational);
    const fronts = this.construction ? this.workFronts() : this._fronts();
    this._activity = { fronts, workforce: this.state.workforce, operational: this.state.operational };
    for (const sys of [this.vehicles, this.workers, this.passengers, this.operations]) {
      if (sys && typeof sys.setActivity === 'function') { try { sys.setActivity(this._activity); } catch (err) { /* optional system */ } }
    }
    if (this._selected) this.highlight(this._selected);
    if (this._overlayKind) this.setOverlay(this._overlayKind, this._overlayValues);
  }

  /** Active work fronts: [{ wbsId, x, z, radius, kind }]. */
  workFronts() { return this._fronts(); }

  _fronts() {
    const active = new Set(this.state.activeIds || []);
    const out = [];
    for (const e of this.elements.values()) {
      const working = active.has(e.id) || (e.p > 0.001 && e.p < 0.999);
      if (!working || !e.fronts.length) continue;
      const f = e.fronts[0](e.p);
      if (f) out.push({ wbsId: e.id, x: f.x, z: f.z, radius: f.radius || 40, kind: f.kind || e.kind || 'building' });
    }
    return out;
  }

  /* ------------------------------------------------------------- queries */

  interiorAt(pos) {
    if (!pos) return null;
    if (this.terminal && this.terminal.contains && this.terminal.contains(pos)) return 'terminal';
    if (this.tower && this.tower.containsCab && this.tower.containsCab(pos)) return 'tower';
    return null;
  }

  surfaceAt(pos) {
    if (!pos) return 'sand';
    const inside = this.interiorAt(pos);
    if (inside) return 'tile';
    if (this.terminal && this.terminal.onBridge && this.terminal.onBridge(pos)) return 'metal';
    const a = this.airfield ? this.airfield.surfaceAt(pos.x, pos.z) : null;
    if (a) return a;
    const l = this.landside && this.landside.surfaceAt ? this.landside.surfaceAt(pos.x, pos.z) : null;
    return l || 'sand';
  }

  kickDust(x, y, z, strength = 1) {
    if (this.dust) this.dust.emit(x, y, z, strength, this._wind ? this._wind.x * 0.3 : 0, this._wind ? this._wind.z * 0.3 : 0);
  }

  /* -------------------------------------------------------------- update */

  _windVector(t) {
    const ws = (this.weather && this.weather.state) || {};
    let speed = 5 + Math.sin(t * 0.13) * 1.5 + Math.sin(t * 0.71) * 0.8;
    // Prevailing south-westerly (from 225° true) → blowing towards 045° true.
    let toTrue = (45 * Math.PI) / 180 + Math.sin(t * 0.05) * 0.15;
    if (ws.wind && typeof ws.wind === 'object') {
      if (typeof ws.wind.x === 'number' && typeof ws.wind.z === 'number') {
        const sp = ws.wind.speed !== undefined ? ws.wind.speed : Math.hypot(ws.wind.x, ws.wind.z);
        const L = Math.hypot(ws.wind.x, ws.wind.z) || 1;
        return { x: ws.wind.x / L, z: ws.wind.z / L, speed: sp };
      }
      if (typeof ws.wind.speed === 'number') speed = ws.wind.speed;
      if (typeof ws.wind.direction === 'number') toTrue = ws.wind.direction + Math.PI;
    }
    if (typeof ws.windSpeed === 'number') speed = ws.windSpeed;
    if (typeof ws.windDirection === 'number') toTrue = ws.windDirection + Math.PI;
    if (ws.kind === 'dust') speed = Math.max(speed, 9 + (ws.intensity || 0) * 6);
    const a = toTrue - (GEO.northOffsetDeg * Math.PI) / 180;
    return { x: Math.sin(a), z: -Math.cos(a), speed };
  }

  update(dt, camera, elapsed = 0, opts = {}) {
    this._time += dt;
    const t = elapsed || this._time;
    if (this.sky) { this.sky.update(dt); if (this.sky.follow) this.sky.follow(camera); }
    if (this.weather && this.weather.update) this.weather.update(dt, camera);
    const ss = (this.sky && this.sky.state) || {};
    const night = ss.nightFactor !== undefined ? ss.nightFactor : 0;
    const lights = ss.lightsFactor !== undefined ? ss.lightsFactor : Math.min(1, night * 1.3 + Math.max(0, 0.5 - (ss.dayFactor === undefined ? 1 : ss.dayFactor)));
    const ws = (this.weather && this.weather.state) || {};
    const vis = ws.visibility !== undefined ? ws.visibility : 1;
    const lowVis = Math.max(0, Math.min(1, (1 - vis) * 1.2));
    const agl = Math.min(1, Math.max(lights, lowVis * 0.85));
    this._wind = this._windVector(t);
    if (this.M && this.M.setWetness && ws.wetness !== undefined && ws.wetness !== this._lastWet) {
      this._lastWet = ws.wetness; this.M.setWetness(ws.wetness);
      if (this.terrain) this.terrain.setWetness(ws.wetness);
    }

    const r = this.engine.renderer;
    const h = r && r.domElement ? r.domElement.height : 900;
    const pxScale = h / (2 * Math.tan(((camera.fov || 58) * Math.PI) / 360));
    for (const lf of this.lightFields || []) {
      const k = lf.kind === 'airfield' ? agl : lf.kind === 'obstacle' ? Math.max(lights, lowVis) : lights;
      lf.field.update(t, k, pxScale);
    }
    for (const lp of this.lightPools || []) {
      const inst = lp.mesh.userData.installed === undefined ? 1 : lp.mesh.userData.installed;
      lp.mat.opacity = lights * (lp.strength || 0.5) * (inst >= 0.999 ? 1 : 0);
      lp.mesh.visible = lp.mat.opacity > 0.01;
    }
    const env = { wind: this._wind, lights, night, agl, time: t, camera, dt, mode: opts.mode, sky: this.sky, weather: this.weather };
    if (this.airfield) this.airfield.update(dt, t, env);
    for (const sys of [this.terminal, this.tower, this.landside, this.city, this.construction]) if (sys && sys.update) sys.update(dt, t, env);
    if (this.vegetation) this.vegetation.update(dt);
    if (this.dust) {
      this.dust.update(dt, { x: this._wind.x * this._wind.speed * 0.5, z: this._wind.z * this._wind.speed * 0.5 });
      if ((ws.kind === 'dust' || ws.kind === 'heat' || night < 0.2) && Math.random() < dt * (ws.kind === 'dust' ? 0.25 : 0.02)) {
        const a = Math.random() * Math.PI * 2; const d = 300 + Math.random() * 900;
        this.dust.spawnDevil(camera.position.x + Math.cos(a) * d, camera.position.z + Math.sin(a) * d, 10 + Math.random() * 10);
      }
    }
    if (this.birds) this.birds.update(dt, Math.max(0, 1 - night * 1.2));
    if (this._selected && this.highlightGroup) this._hlLine.opacity = 0.55 + 0.4 * Math.sin(t * 4);

    // FIDS refresh from live data.
    this._fidsTimer -= dt;
    if (this._fidsTimer <= 0 && this.terminal && this.terminal.updateFids) {
      this._fidsTimer = 4;
      let rows = null;
      if (typeof this.fidsSource === 'function') { try { rows = this.fidsSource(); } catch (e) { rows = null; } }
      this.terminal.updateFids(rows, { hour: this.sky ? this.sky.hour : 12, operational: this.state.operational, ops: this.operations });
    }

    const ctx = { camera, elapsed: t, dt, mode: opts.mode, operations: !!opts.operations, sky: this.sky, weather: this.weather, world: this, lights, wind: this._wind, groundAt: (x, z) => this.collision.groundAt(x, z) };
    for (const sys of [this.vehicles, this.workers, this.passengers, this.operations]) {
      if (!sys || typeof sys.update !== 'function') continue;
      if (sys === this.operations && !opts.operations && sys.running === false) continue;
      try { sys.update(dt, ctx); } catch (err) {
        if (!sys._hddWarned) { sys._hddWarned = true; console.error('world: subsystem update failed', err); }
      }
    }
  }

  dispose() {
    for (const sys of [this.vehicles, this.workers, this.passengers, this.operations, this.construction, this.city, this.landside,
      this.tower, this.terminal, this.airfield, this.vegetation, this.dust, this.birds, this.terrain, this.weather, this.sky]) {
      if (sys && typeof sys.dispose === 'function') { try { sys.dispose(); } catch (e) { /* keep disposing */ } }
    }
    if (this._fallbackMaterials && this._fallbackMaterials.dispose) this._fallbackMaterials.dispose();
    for (const m of this.layerCache.values()) m.dispose();
    if (this.envRT) this.envRT.dispose();
    for (const g of [this._unitBox, this._edgeGeo]) if (g) g.dispose();
    for (const m of [this._proxyMat, this._hlLine, this._hlFill, this._ovMat]) if (m) m.dispose();
  }
}

export { STANDS, TAXILANE_X };
