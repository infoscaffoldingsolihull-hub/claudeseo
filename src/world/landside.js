import * as THREE from 'three';
import { makeRng } from '../engine/noise.js';
import { MASTERPLAN } from './layout.js';
import { terrainHeight } from './terrain.js';
import { GeoBuilder, ProgressiveMesh, InstancedSet, LightField, Vegetation, layered, labelTexture } from './props.js';

/**
 * Landside and support facilities: forecourt and canopy, multi-row car park,
 * the dual-carriageway access road to the city with street lighting, the
 * cargo shed, fuel farm, ARFF fire station, 132/11 kV substation, solar PV
 * plant, water works, landscaping — and the existing (closed) 1960s-style
 * terminal and apron that the programme replaces.
 */

const MP = MASTERPLAN;
const LS = MP.landside;

function carGeometry() {
  const b = new GeoBuilder({ worldUV: false });
  b.box(4.3, 0.72, 1.75, 0, 0.3, 0, 0xffffff);
  b.box(2.3, 0.6, 1.58, -0.2, 1.02, 0, 0x1d242c);
  b.box(0.6, 0.6, 1.8, -1.35, 0, 0, 0x151515);
  b.box(0.6, 0.6, 1.8, 1.35, 0, 0, 0x151515);
  return b.build();
}

export class Landside {
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.M;
    this.collision = ctx.collision;
    this.group = new THREE.Group();
    this.group.name = 'landside';
    ctx.scene.add(this.group);
    this.elements = [];
    this.disposables = [];
    this.lightFields = [];
    this.lightPools = [];
    this.pois = [];
    this.col = {};
    this.rng = makeRng(919);
    this.roadMat = layered(Object.assign(this.M.asphaltOld.clone(), { vertexColors: true }), 1, null);
    this.newRoadMat = layered(Object.assign(this.M.asphaltNew.clone(), { vertexColors: true }), 1, null);
    this.lineMat = layered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 4, null);
    this.lawnMat = layered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 2, null);
    this.disposables.push(this.roadMat, this.newRoadMat, this.lineMat, this.lawnMat);
    this.carGeo = carGeometry();
    this.disposables.push(this.carGeo);
    this.street = new LightField('street-lights', { minPx: 1.5, maxPx: 26 });
    this.lightFields.push({ field: this.street, kind: 'street', id: null });

    this._existing();
    this._forecourt();
    this._carPark();
    this._accessRoad();
    this._cargo();
    this._fuelFarm();
    this._arff();
    this._substation();
    this._solar();
    this._waterWorks();
    this._landscaping();
    this.street.finalize(this.group);
  }

  _add(o) { this.group.add(o); return o; }
  _prog(b, m, name, shadows = true) {
    const pm = new ProgressiveMesh(b, m, { shadows, name });
    this._add(pm.mesh); this.disposables.push(pm); return pm;
  }
  _el(id, name, box, apply, extra = {}) {
    this.elements.push({ id, name, box: new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4], box[5])), apply, kind: 'building', ...extra });
  }
  _colBox(key, x0, y0, z0, x1, y1, z1) {
    if (!this.collision) return;
    (this.col[key] = this.col[key] || []).push(this.collision.addBox(x0, y0, z0, x1, y1, z1, key));
  }
  _enable(key, on) { if (this.collision && this.col[key]) this.collision.setDisabled(this.col[key], !on); }
  _poi(id, name, wbsId, x, z, text, radius = 18, y = 1.7) {
    this.pois.push({ id, name, wbsId, position: new THREE.Vector3(x, y, z), radius, text });
  }
  _lamp(x, z, h = 10, arms = [[1, 0]], color = new THREE.Color(4.2, 3.2, 2.0), b) {
    b.cyl(0.14, h, x, 0, z, 0x8d9399, 6, 0.6);
    for (const [ax, az] of arms) {
      b.beam(x, h - 0.3, z, x + ax * 2.2, h, z + az * 2.2, 0.1, 0x8d9399);
      b.box(0.9, 0.18, 0.4, x + ax * 2.4, h - 0.12, z + az * 2.4, 0x2a2d31);
      this.street.add(x + ax * 2.4, h - 0.25, z + az * 2.4, color, 0.55);
    }
  }

  /* ------------------------------------------------ existing (pre-project) */

  _existing() {
    const b = new GeoBuilder();
    const apron = new GeoBuilder();
    apron.quad(-300, -760, -200, -580, 0.06, 0xb8b2a6);
    const am = new THREE.Mesh(apron.build(), layered(Object.assign(this.M.concreteApron.clone(), { vertexColors: true }), 3, this.ctx.layerCache));
    am.receiveShadow = true; this._add(am); this.disposables.push(am.geometry);
    // Old terminal: two storeys, arcade, flat roof, a small rooftop control cab.
    const x0 = -390; const x1 = -312; const z0 = -735; const z1 = -605;
    b.box(x1 - x0, 8, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0xe2d7c2);
    b.box(x1 - x0 + 1, 0.8, z1 - z0 + 1, (x0 + x1) / 2, 8, (z0 + z1) / 2, 0xcbbda5);
    for (let z = z0 + 4; z < z1 - 2; z += 6) {
      b.box(1.0, 3.6, 1.0, x1 + 4, 0, z, 0xe2d7c2);
      b.box(0.15, 2.0, 3.4, x1 + 0.05, 1.2, z + 3, 0x3c4a56);
      b.box(0.15, 1.6, 3.4, x1 + 0.05, 5, z + 3, 0x3c4a56);
      b.box(0.15, 1.6, 3.4, x0 - 0.05, 5, z + 3, 0x3c4a56);
    }
    b.box(4.6, 0.4, z1 - z0, x1 + 2.3, 3.6, (z0 + z1) / 2, 0xcbbda5);
    b.box(10, 4, 10, (x0 + x1) / 2, 8.8, (z0 + z1) / 2, 0xe2d7c2);
    b.box(11, 2.4, 11, (x0 + x1) / 2, 12.8, (z0 + z1) / 2, 0x3c5866);
    b.box(12, 0.5, 12, (x0 + x1) / 2, 15.2, (z0 + z1) / 2, 0x8a7d68);
    b.box(30, 2.2, 0.3, (x0 + x1) / 2, 5.4, z0 - 0.2, 0x7d8d64);
    const om = new THREE.Mesh(b.build(), this.M.paintMap);
    om.castShadow = true; om.receiveShadow = true; om.name = 'old-terminal';
    this._add(om); this.disposables.push(om.geometry);
    this._colBox('old', x0, 0, z0, x1, 15.7, z1);
    this.oldTerminal = om;
    this._poi('poi-old-terminal', 'Existing terminal (closed)', '7.2', x1 + 10, (z0 + z1) / 2,
      'The existing small terminal and apron. Hyderabad\'s scheduled services stopped years ago; the programme builds a new terminal rather than refurbishing this one, which is retained for general aviation and VIP use in the simulated concept.', 20);
  }

  /* ---------------------------------------------------- 9.3 forecourt */

  _forecourt() {
    const f = LS.forecourt;
    const road = new GeoBuilder(); const lines = new GeoBuilder(); const kerb = new GeoBuilder(); const canopy = new GeoBuilder();
    road.quad(f.x0 + 4, f.z0 - 60, f.x1 - 6, f.z1 + 60, 0.05, 0xffffff);
    road.mark();
    for (let z = f.z0 - 60; z < f.z1 + 60; z += 9) {
      for (const x of [f.x0 + 14, f.x0 + 22, f.x0 + 30]) lines.quad(x - 0.08, z, x + 0.08, z + 4.5, 0.07, 0xf0f0ea);
    }
    for (const x of [f.x0 + 4.4, f.x1 - 6.4]) lines.quad(x - 0.1, f.z0 - 60, x + 0.1, f.z1 + 60, 0.07, 0xf0f0ea);
    for (const z of [-117, -63, -9, 117]) for (let k = 0; k < 8; k++) lines.quad(f.x0 + 6 + k * 4.4, z - 2.5, f.x0 + 8.2 + k * 4.4, z + 2.5, 0.072, 0xf0f0ea);
    lines.mark();
    kerb.box(6, 0.15, f.z1 - f.z0 + 120, f.x1 - 3, 0, 0, 0xcfc8bb);
    kerb.box(0.3, 0.18, f.z1 - f.z0 + 120, f.x1 - 6.1, 0, 0, 0x9a948a);
    kerb.box(2.5, 0.18, f.z1 - f.z0 + 80, f.x0 + 18, 0, 0, 0xcfc8bb);
    for (let z = f.z0 - 50; z < f.z1 + 50; z += 6) kerb.cyl(0.12, 0.9, f.x1 - 6.4, 0.15, z, 0x3a3f46, 6);
    kerb.mark();
    for (let z = f.z0 - 40; z <= f.z1 + 40; z += 30) {
      canopy.cyl(0.35, 9, f.x0 + 18, 0.18, z, 0xe9ebee, 10);
      canopy.beam(f.x0 + 18, 8.8, z, f.x0 + 10, 9.4, z, 0.3, 0xe9ebee);
      canopy.beam(f.x0 + 18, 8.8, z, f.x1 - 4, 9.4, z, 0.3, 0xe9ebee);
    }
    canopy.box(f.x1 - f.x0 - 8, 0.45, f.z1 - f.z0 + 90, (f.x0 + f.x1) / 2 + 3, 9.4, 0, 0xf1efe9);
    canopy.box(f.x1 - f.x0 - 8.4, 0.25, f.z1 - f.z0 + 90.4, (f.x0 + f.x1) / 2 + 3, 9.85, 0, 0xdcdad4);
    for (const zz of [f.z0 - 45, f.z1 + 45]) canopy.box(f.x1 - f.x0 - 8, 1.0, 0.5, (f.x0 + f.x1) / 2 + 3, 9.2, zz, 0x9b1b30);
    canopy.box(0.5, 1.0, f.z1 - f.z0 + 90, f.x0 + 4, 9.2, 0, 0x9b1b30);
    canopy.mark();
    this.fcRoad = this._prog(road, this.newRoadMat, 'forecourt-road', false);
    this.fcLines = this._prog(lines, this.lineMat, 'forecourt-lines', false);
    this.fcKerb = this._prog(kerb, this.M.paintMap, 'forecourt-kerb', true);
    this.fcCanopy = this._prog(canopy, this.M.paintMetal, 'forecourt-canopy', true);
    this._colBox('forecourt', f.x1 - 6, 0, f.z0 - 60, f.x1, 0.15, f.z1 + 60);
    for (let z = f.z0 - 40; z <= f.z1 + 40; z += 30) this._colBox('forecourt', f.x0 + 17.6, 0, z - 0.4, f.x0 + 18.4, 9, z + 0.4);
    const lamp = new GeoBuilder();
    for (let z = f.z0 - 50; z <= f.z1 + 50; z += 25) {
      const pool = new THREE.Color(4.4, 4.0, 3.2);
      this.street.add(f.x0 + 10, 9.2, z, pool, 0.5);
      this.street.add(f.x1 - 5, 9.2, z + 12, pool, 0.5);
    }
    lamp.mark();
    this._el('9.3', 'Terminal forecourt, kerbs & canopy', [f.x0, 0, f.z0 - 60, f.x1, 10, f.z1 + 60], (p) => {
      this.fcRoad.setProgress(p); this.fcLines.setProgress(p > 0.6 ? 1 : 0); this.fcKerb.setProgress(p > 0.3 ? 1 : 0); this.fcCanopy.setProgress(p > 0.75 ? 1 : 0);
      this._enable('forecourt', p > 0.3);
      this._p93 = p;
    }, { surface: 'concrete', front: () => ({ x: -625, z: 0, radius: 60, kind: 'paving' }) });
    this._poi('poi-forecourt', 'Terminal forecourt', '9.3', f.x1 - 3, -150,
      'Drop-off kerbs, pedestrian crossings and a canopy for the 45 °C summer sun. Forecourt capacity is sized for peak-hour kerbside dwell, a classic landside planning check.', 16, 1.85);
  }

  /* ------------------------------------------------------- 9.2 car park */

  _carPark() {
    const c = LS.carPark;
    const asph = new GeoBuilder(); const lines = new GeoBuilder(); const isl = new GeoBuilder(); const furn = new GeoBuilder();
    const rng = this.rng;
    const cars = [];
    const palette = [0xf2f2f2, 0xf2f2f2, 0xc0c4c8, 0x9aa0a6, 0x2b2e33, 0x7a1f22, 0x223a6a, 0xd9d3c4, 0x50565c];
    const modW = 19;
    const mods = Math.floor((c.x1 - c.x0) / modW);
    for (let m = 0; m < mods; m++) {
      const xa = c.x0 + m * modW;
      asph.quad(xa, c.z0, xa + modW, c.z1, 0.05, 0xffffff);
      isl.box(1.8, 0.18, c.z1 - c.z0 - 20, xa + 18, 0, (c.z0 + c.z1) / 2, 0xbfb6a6);
      for (let z = c.z0 + 10; z < c.z1 - 10; z += 2.6) {
        for (const x of [xa + 0.2, xa + 11.8]) lines.quad(x, z - 0.06, x + 5, z + 0.06, 0.07, 0xf0f0ea);
      }
      for (let z = c.z0 + 11.3; z < c.z1 - 11; z += 2.6) {
        for (const [x, ry] of [[xa + 2.7, 0], [xa + 14.3, Math.PI]]) {
          if (rng() < 0.62) cars.push({ x, y: 0.05, z, ry: ry + Math.PI / 2 + (rng() - 0.5) * 0.06, color: palette[Math.floor(rng() * palette.length)], order: rng(), m });
        }
      }
      if (m % 2 === 1) {
        // Shade structure with PV over the island rows.
        for (let z = c.z0 + 14; z < c.z1 - 14; z += 16) furn.cyl(0.18, 3.6, xa + 18, 0.18, z, 0xa0a6ac, 6);
        furn.boxR(11, 0.12, c.z1 - c.z0 - 26, xa + 16.5, 3.9, (c.z0 + c.z1) / 2, 0x1d2a44, 0, 0, 0.12);
      }
      for (let z = c.z0 + 20; z < c.z1 - 15; z += 42) this._lamp(xa + 18, z, 11, [[-1, 0], [1, 0]], new THREE.Color(4.4, 3.6, 2.4), furn);
      asph.mark(); lines.mark(); isl.mark(); furn.mark();
    }
    furn.box(4, 3, 3, c.x1 - 6, 0, c.z0 + 4, 0xe2d7c2); furn.box(4.6, 0.3, 3.6, c.x1 - 6, 3, c.z0 + 4, 0x9b1b30);
    furn.box(0.2, 0.2, 6, c.x1 - 2, 1.1, c.z0 + 4, 0xf0d020);
    furn.mark();
    this.cpAsphalt = this._prog(asph, this.newRoadMat, 'carpark-asphalt', false);
    this.cpLines = this._prog(lines, this.lineMat, 'carpark-lines', false);
    this.cpIslands = this._prog(isl, this.M.paintMap, 'carpark-islands', false);
    this.cpFurniture = this._prog(furn, this.M.paintMetal, 'carpark-furniture', true);
    cars.sort((a, b) => a.m - b.m || a.order - b.order);
    this.parked = new InstancedSet(this.carGeo, this.M.paintMetal, cars.slice(0, Math.max(40, this.ctx.counts ? this.ctx.counts.cars * 4 : 600)), { name: 'parked-cars' });
    this._add(this.parked.mesh);
    this.disposables.push({ dispose: () => this.parked.mesh.dispose() });
    this._el('9.2', 'Car park (≈1,700 bays) & PV shade canopies', [c.x0, 0, c.z0, c.x1, 5, c.z1], (p) => {
      this.cpAsphalt.setProgress(p); this.cpLines.setProgress(p); this.cpIslands.setProgress(p); this.cpFurniture.setProgress(p);
      this._p92 = p;
      this._applyCars();
    }, { surface: 'asphalt', front: (p) => ({ x: c.x0 + (c.x1 - c.x0) * p, z: 0, radius: 60, kind: 'paving' }) });
    this._poi('poi-carpark', 'Car park', '9.2', c.x1 - 8, c.z0 + 12,
      'Surface car park with shaded PV canopies over alternate islands. Occupancy here rises once the airport is operational.', 18);
  }

  _applyCars() {
    const p = this._p92 || 0;
    const occ = p >= 1 ? (this._operational ? 1 : 0.18) : 0;
    this.parked.setProgress(occ);
  }

  setOperational(on) { this._operational = on; this._applyCars(); }

  /* ------------------------------------------------- 9.1 access road */

  _accessRoad() {
    const pts = [[-640, -230], [-668, -165], [-760, -110], [-900, -77], [-1500, -261], [-2600, -600], [-3600, -840], [-5200, -900]];
    this.roadPath = pts;
    const road = new GeoBuilder(); const lines = new GeoBuilder(); const kerb = new GeoBuilder();
    const W = 16;
    const step = 20;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L - 0.01; s += step) segs.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L, ax + ((bx - ax) * Math.min(L, s + step)) / L, az + ((bz - az) * Math.min(L, s + step)) / L]);
    }
    let dist = 0;
    for (const [x0, z0, x1, z1] of segs) {
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / L; const nz = (x1 - x0) / L;
      const y0 = terrainHeight(x0, z0) + 0.1; const y1 = terrainHeight(x1, z1) + 0.1;
      const P = (x, y, z, o) => [x + nx * o, y, z + nz * o];
      road.quad3(P(x0, y0, z0, -W / 2), P(x0, y0, z0, W / 2), P(x1, y1, z1, W / 2), P(x1, y1, z1, -W / 2), 0xffffff);
      for (const o of [-W / 2 + 0.5, W / 2 - 0.5]) lines.quad3(P(x0, y0 + 0.01, z0, o - 0.1), P(x0, y0 + 0.01, z0, o + 0.1), P(x1, y1 + 0.01, z1, o + 0.1), P(x1, y1 + 0.01, z1, o - 0.1), 0xf0f0ea);
      if (Math.floor(dist / 10) % 2 === 0) for (const o of [-4.2, 4.2]) lines.quad3(P(x0, y0 + 0.01, z0, o - 0.08), P(x0, y0 + 0.01, z0, o + 0.08), P(x1, y1 + 0.01, z1, o + 0.08), P(x1, y1 + 0.01, z1, o - 0.08), 0xf0f0ea);
      kerb.beam(x0, y0 + 0.12, z0, x1, y1 + 0.12, z1, 0.9, 0xd8d2c4);
      if (Math.floor(dist / step) % 2 === 0) {
        const lx = x0; const lz = z0;
        if (Math.floor(dist / step) % 4 === 0) {
          kerb.cyl(0.13, 10, lx, y0, lz, 0x8d9399, 6, 0.6);
          for (const s of [-1, 1]) {
            kerb.beam(lx, y0 + 9.7, lz, lx + nx * s * 2.6, y0 + 10, lz + nz * s * 2.6, 0.1, 0x8d9399);
            this.street.add(lx + nx * s * 2.8, y0 + 9.75, lz + nz * s * 2.8, new THREE.Color(4.6, 3.3, 1.6), 0.55);
          }
        }
      }
      road.mark(); lines.mark(); kerb.mark();
      dist += L;
    }
    this.arRoad = this._prog(road, this.newRoadMat, 'access-road', false);
    this.arLines = this._prog(lines, this.lineMat, 'access-road-lines', false);
    this.arKerb = this._prog(kerb, this.M.paintMap, 'access-road-median', true);
    this._el('9.1', 'Dual-carriageway access road & street lighting', [-2600, 0, -620, -640, 11, -60], (p) => {
      this.arRoad.setProgress(p); this.arLines.setProgress(p); this.arKerb.setProgress(p);
      this._p91 = p;
    }, { surface: 'asphalt', front: (p) => ({ x: -640 - 1960 * p, z: -230 - 370 * p, radius: 50, kind: 'paving' }),
      pickBoxes: [[-900, 0, -240, -640, 11, -60], [-1700, 0, -380, -900, 11, -40], [-2600, 0, -640, -1700, 11, -240]] });
    this.roadSegs = segs;
  }

  /* ----------------------------------------------- support facilities */

  _cargo() {
    const c = MP.cargo;
    const b = new GeoBuilder();
    const cx = (c.x0 + c.x1) / 2; const cz = (c.z0 + c.z1) / 2; const w = c.x1 - c.x0; const d = c.z1 - c.z0;
    b.box(w + 30, 0.2, d + 20, cx, 0, cz, 0xb6b0a4);
    b.mark();
    b.box(w, 12, d, cx, 0.2, cz, 0xd5d9de);
    b.box(w, 1.4, d, cx, 10.8, cz, 0x2b3a8c);
    for (let k = 0; k < 6; k++) b.boxR(w + 1, 0.3, d / 6, cx, 13.2, c.z0 + (k + 0.5) * (d / 6), 0xa9aeb4, 0.12, 0, 0);
    b.mark();
    for (let z = c.z0 + 8; z < c.z1 - 4; z += 13) {
      b.box(0.3, 6, 8, c.x1 + 0.1, 0.2, z, 0x6f7781);
      b.box(0.3, 4.2, 4, c.x0 - 0.1, 0.2, z, 0x6f7781);
      b.box(3, 1.4, 5, c.x0 - 1.6, 0, z, 0x9a948a);
    }
    b.box(4, 0.4, d, c.x1 + 2, 6.6, cz, 0x2b3a8c);
    b.mark();
    for (let i = 0; i < 18; i++) {
      const x = c.x1 + 8 + (i % 6) * 3.4; const z = c.z0 + 8 + Math.floor(i / 6) * 4.5;
      b.box(3.1, 1.6, 2.4, x, 0.2, z, i % 4 === 0 ? 0xb8bcc0 : 0xd8dce0);
      b.box(3.2, 0.1, 2.5, x, 1.8, z, 0x8a8f94);
    }
    b.mark();
    this.cargo = this._prog(b, this.M.paintMap, 'cargo-shed', true);
    this._colBox('cargo', c.x0, 0, c.z0, c.x1, 14, c.z1);
    this._el('8.1', 'Cargo shed & ULD yard', [c.x0 - 6, 0, c.z0, c.x1 + 30, 14, c.z1], (p) => { this.cargo.setProgress(p); this._enable('cargo', p > 0.5); },
      { front: () => ({ x: cx, z: cz, radius: 60, kind: 'building' }) });
    this._poi('poi-cargo', 'Cargo terminal', '8.1', c.x0 - 8, cz, 'Perishables (mangoes, dates, fish) and general cargo: build-up area, cold rooms and truck docks on the landside, ULD yard on the airside.', 20);
  }

  _fuelFarm() {
    const f = MP.fuelFarm;
    const b = new GeoBuilder();
    const tanks = [];
    for (let i = 0; i < f.tanks; i++) tanks.push([f.x + ((i % 2) - 0.5) * 26, f.z + (Math.floor(i / 2) - 0.5) * 26]);
    const bx0 = f.x - 30; const bx1 = f.x + 30; const bz0 = f.z - 30; const bz1 = f.z + 30;
    b.box(bx1 - bx0, 0.1, bz1 - bz0, f.x, 0, f.z, 0xa69e90);
    b.box(bx1 - bx0, 1.6, 0.6, f.x, 0, bz0, 0xc9c1b2); b.box(bx1 - bx0, 1.6, 0.6, f.x, 0, bz1, 0xc9c1b2);
    b.box(0.6, 1.6, bz1 - bz0, bx0, 0, f.z, 0xc9c1b2); b.box(0.6, 1.6, bz1 - bz0, bx1, 0, f.z, 0xc9c1b2);
    b.mark();
    for (const [x, z] of tanks) {
      b.cyl(f.radius, f.height, x, 0.1, z, 0xf0f0ec, 24);
      b.cyl(f.radius + 0.1, 0.5, x, f.height * 0.5, z, 0x9b1b30, 24);
      b.cyl(f.radius * 0.98, 1.2, x, f.height + 0.1, z, 0xe2e2de, 24, 0.25);
      for (let k = 0; k < 10; k++) {
        const a = k * 0.25; const y = 1 + k * (f.height - 1.5) / 10;
        b.box(0.9, 0.1, 0.9, x + Math.cos(a) * (f.radius + 0.5), y, z + Math.sin(a) * (f.radius + 0.5), 0x6a6f75);
      }
      b.mark();
    }
    b.box(0.5, 0.5, 60, f.x + 34, 1.2, f.z, 0x6a6f75); b.box(40, 0.5, 0.5, f.x + 14, 1.2, f.z + 32, 0x6a6f75);
    b.box(10, 4, 7, f.x + 40, 0, f.z - 20, 0xe2d7c2); b.box(10.6, 0.3, 7.6, f.x + 40, 4, f.z - 20, 0x9b1b30);
    b.box(14, 5, 0.2, f.x + 40, 0, f.z + 8, 0x6a6f75);
    b.mark();
    this.fuel = this._prog(b, this.M.paintMap, 'fuel-farm', true);
    for (const [x, z] of tanks) this._colBox('fuel', x - f.radius, 0, z - f.radius, x + f.radius, f.height, z + f.radius);
    this._el('8.2', 'Aviation fuel farm (4 tanks, hydrant link)', [bx0, 0, bz0, f.x + 46, f.height + 1.5, bz1], (p) => { this.fuel.setProgress(p); this._enable('fuel', p > 0.3); },
      { front: () => ({ x: f.x, z: f.z, radius: 45, kind: 'building' }) });
    this._poi('poi-fuel', 'Fuel farm', '8.2', f.x + 36, f.z, 'Four Jet A-1 tanks in a bunded compound with a pump house and pipe rack to the apron hydrant. Fuel quality control is a hard acceptance criterion before handover.', 18);
  }

  _arff() {
    const a = MP.arff;
    const b = new GeoBuilder();
    const cx = (a.x0 + a.x1) / 2; const cz = (a.z0 + a.z1) / 2; const w = a.x1 - a.x0; const d = a.z1 - a.z0;
    b.box(w + 30, 0.15, d + 10, cx + 10, 0, cz, 0xb6b0a4);
    b.mark();
    b.box(w * 0.55, 7.5, d, a.x0 + w * 0.275, 0.15, cz, 0xeee9df);
    b.box(w * 0.45, 8.5, d, a.x1 - w * 0.225, 0.15, cz, 0xeee9df);
    b.box(w * 0.45 + 0.4, 1.0, d + 0.4, a.x1 - w * 0.225, 8.6, cz, 0xc8102e);
    for (let k = 0; k < 4; k++) {
      const z = a.z0 + 7.5 + k * 15;
      b.box(0.3, 6.2, 11.5, a.x1 + 0.1, 0.15, z, 0x9aa1aa);
      for (let r = 0; r < 6; r++) b.box(0.32, 0.08, 11.5, a.x1 + 0.12, 0.6 + r * 1, z, 0x7e858d);
    }
    // Watch room on top.
    b.box(12, 4, 12, a.x0 + 10, 7.65, cz, 0xeee9df); b.box(12.4, 2.2, 12.4, a.x0 + 10, 9.2, cz, 0x3e5f72);
    b.box(13, 0.4, 13, a.x0 + 10, 11.65, cz, 0xc8102e);
    b.cyl(0.12, 8, a.x0 + 4, 12, cz, 0xcccccc, 6);
    b.mark();
    // Two crash tenders on the apron in front.
    for (const z of [cz - 9, cz + 9]) {
      const x = a.x1 + 10;
      b.box(11, 2.4, 3, x, 0.8, z, 0xd01020); b.box(3, 1.3, 2.9, x - 4, 3.2, z, 0xd01020);
      b.box(2.8, 1.0, 2.7, x - 4, 3.2, z, 0x223040);
      b.box(1.6, 0.4, 0.4, x - 1, 3.4, z, 0xd8d8d8);
      for (const dx of [-3.8, 0, 3.8]) for (const s of [-1, 1]) b.cylH(0.6, 0.4, x + dx, 0.6, z + s * 1.4, 0x151515, 'z', 10);
    }
    b.mark();
    this.arffMesh = this._prog(b, this.M.paintMap, 'arff-station', true);
    this._colBox('arff', a.x0, 0, a.z0, a.x1, 9, a.z1);
    this._el('8.3', 'Aircraft rescue & fire-fighting (ARFF) station', [a.x0, 0, a.z0, a.x1 + 18, 12, a.z1], (p) => { this.arffMesh.setProgress(p); this._enable('arff', p > 0.4); },
      { front: () => ({ x: cx, z: cz, radius: 40, kind: 'building' }) });
    this._poi('poi-arff', 'ARFF fire station', '8.3', a.x1 + 22, cz, 'Rescue and fire-fighting category drives the response-time requirement: crash tenders must reach either runway end within the ICAO response time, which is why the station sits mid-field next to the apron.', 18);
  }

  _substation() {
    const s = MP.substation;
    const b = new GeoBuilder();
    const cx = (s.x0 + s.x1) / 2; const cz = (s.z0 + s.z1) / 2;
    b.box(s.x1 - s.x0, 0.2, s.z1 - s.z0, cx, 0, cz, 0x9a948a);
    for (const [x0, z0, x1, z1] of [[s.x0, s.z0, s.x1, s.z0], [s.x0, s.z1, s.x1, s.z1], [s.x0, s.z0, s.x0, s.z1], [s.x1, s.z0, s.x1, s.z1]]) {
      b.box(Math.max(0.08, x1 - x0), 2.4, Math.max(0.08, z1 - z0), (x0 + x1) / 2, 0, (z0 + z1) / 2, 0x8a9096);
    }
    b.mark();
    for (let k = 0; k < 3; k++) {
      const z = s.z0 + 12 + k * 16;
      b.box(4, 3.2, 3, cx - 6, 0.2, z, 0x6f7a68);
      for (let f = -1.5; f <= 1.5; f += 0.5) b.box(0.08, 2.4, 3.6, cx - 6 + f, 0.6, z, 0x5d6757);
      for (const dz of [-0.8, 0, 0.8]) b.cyl(0.18, 1.6, cx - 6, 3.4, z + dz, 0x9a5a3a, 8);
      b.box(0.3, 8, 0.3, cx + 6, 0.2, z - 3, 0x9aa1aa); b.box(0.3, 8, 0.3, cx + 6, 0.2, z + 3, 0x9aa1aa); b.box(0.3, 0.3, 6.3, cx + 6, 8, z, 0x9aa1aa);
      b.mark();
    }
    b.box(10, 4, 8, s.x0 + 8, 0.2, s.z1 + 8, 0xe2d7c2); b.box(10.6, 0.3, 8.6, s.x0 + 8, 4.2, s.z1 + 8, 0x2b3a8c);
    b.mark();
    this.substation = this._prog(b, this.M.paintMap, 'substation', true);
    this._colBox('sub', s.x0, 0, s.z0, s.x1, 2.4, s.z1);
    this._el('8.4', '132/11 kV substation & standby power', [s.x0, 0, s.z0, s.x1, 9, s.z1 + 12], (p) => { this.substation.setProgress(p); this._enable('sub', p > 0.2); },
      { kind: 'electrical', front: () => ({ x: cx, z: cz, radius: 30, kind: 'electrical' }) });
    this._poi('poi-substation', 'Substation', '8.4', s.x1 + 6, cz, 'Grid intake, transformers and standby generation. AGL needs a secondary supply with a switch-over time measured in seconds; commissioning tests prove it.', 16);
  }

  _solar() {
    const s = MP.solar;
    const rows = s.rows;
    const tableLen = 20;
    const items = [];
    const g = new GeoBuilder({ worldUV: false });
    g.boxR(tableLen, 0.08, 4.4, 0, 1.9, 0, 0x1a2f5a, -0.42, 0, 0);
    for (let k = 0; k < 5; k++) g.box(tableLen, 0.02, 0.03, 0, 1.94 + (k - 2) * 0.82 * Math.sin(0.42), -(k - 2) * 0.82 * Math.cos(0.42) - 0.0, 0xaab4c4);
    for (const x of [-8, 0, 8]) { g.box(0.12, 1.2, 0.12, x, 0, 1.4, 0x9aa1aa); g.box(0.12, 2.5, 0.12, x, 0, -1.4, 0x9aa1aa); }
    const geo = g.build();
    for (let r = 0; r < rows; r++) {
      const z = s.z0 + 15 + r * ((s.z1 - s.z0 - 30) / (rows - 1));
      for (let x = s.x0 + tableLen / 2; x <= s.x1 - tableLen / 2; x += tableLen + 1.2) items.push({ x, y: 0, z, ry: Math.PI });
    }
    this.solarSet = new InstancedSet(geo, this.M.paintMetal, items, { name: 'solar-pv' });
    this._add(this.solarSet.mesh);
    this.disposables.push(this.solarSet);
    const inv = new GeoBuilder();
    for (let r = 0; r < rows; r += 6) {
      const z = s.z0 + 15 + (r + 3) * ((s.z1 - s.z0 - 30) / (rows - 1));
      inv.box(5, 2.6, 2.4, s.x0 - 6, 0, z, 0xe8e2d6);
      inv.mark();
    }
    this.inverters = this._prog(inv, this.M.paintMap, 'solar-inverters', true);
    this._el('8.5', 'Solar PV plant (simulated ~15 MWp)', [s.x0, 0, s.z0, s.x1, 3, s.z1], (p) => { this.solarSet.setProgress(p); this.inverters.setProgress(p); },
      { kind: 'electrical', front: (p) => ({ x: (s.x0 + s.x1) / 2, z: s.z0 + (s.z1 - s.z0) * p, radius: 60, kind: 'electrical' }) });
    this._poi('poi-solar', 'Solar PV plant', '8.5', s.x0 - 10, (s.z0 + s.z1) / 2, 'Rows of fixed-tilt panels face true south. On-site generation is a benefit in the business case (energy cost and carbon); glare studies keep panels clear of the approach paths.', 22);
  }

  _waterWorks() {
    const w = MP.waterWorks;
    const b = new GeoBuilder();
    b.cyl(6, 2, w.x, 0, w.z, 0xbdb6a8, 16);
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [3.5, 3.5], [-3.5, 3.5]]) b.box(0.6, 22, 0.6, w.x + dx, 2, w.z + dz, 0xd8d0c2);
    b.cyl(7, 7, w.x, 24, w.z, 0xeee9df, 20, 0.85);
    b.cyl(7.2, 0.8, w.x, 26.5, w.z, 0x2b3a8c, 20);
    b.box(18, 3, 30, w.x - 22, 0, w.z + 4, 0xb8b0a0);
    b.box(17, 0.2, 29, w.x - 22, 3, w.z + 4, 0x3d5560);
    b.box(10, 4.5, 8, w.x + 4, 0, w.z + 22, 0xe2d7c2); b.box(10.6, 0.3, 8.6, w.x + 4, 4.5, w.z + 22, 0x9b1b30);
    b.mark();
    this.water = this._prog(b, this.M.paintMap, 'water-works', true);
    this._colBox('water', w.x - 6, 0, w.z - 6, w.x + 6, 31, w.z + 6);
    this._el('8.6', 'Water works & elevated tank', [w.x - 32, 0, w.z - 12, w.x + 10, 31, w.z + 27], (p) => { this.water.setProgress(p); this._enable('water', p > 0.3); },
      { fallback: '8.4', kind: 'building', front: () => ({ x: w.x, z: w.z, radius: 30, kind: 'building' }) });
  }

  /* --------------------------------------------------------- 9.4 landscape */

  _landscaping() {
    const rng = makeRng(404);
    const palms = []; const neem = [];
    const f = LS.forecourt; const c = LS.carPark;
    for (let z = f.z0 - 50; z <= f.z1 + 50; z += 14) palms.push({ x: f.x0 + 18, z: z + 7, h: 9 + rng() * 3, ry: rng() * 6.3, order: 0 });
    for (let z = c.z0 + 18; z < c.z1 - 15; z += 22) for (let m = 0; m < 8; m += 2) neem.push({ x: c.x0 + m * 19 + 18, z, h: 6 + rng() * 2.5, ry: rng() * 6.3 });
    const path = this.roadPath;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = path[i]; const [bx, bz] = path[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 10; s < L; s += 28) {
        const x = ax + ((bx - ax) * s) / L; const z = az + ((bz - az) * s) / L;
        const nx = -(bz - az) / L; const nz = (bx - ax) / L;
        for (const o of [-13, 13]) palms.push({ x: x + nx * o, z: z + nz * o, h: 8 + rng() * 4, ry: rng() * 6.3 });
      }
    }
    this.landscapeVeg = new Vegetation(this.group, { palm: palms, neem, kikar: [], scrub: [] }, { seed: 31 });
    const lawn = new GeoBuilder();
    lawn.quad(f.x0 + 16.8, f.z0 - 50, f.x0 + 19.2, f.z1 + 50, 0.2, 0x56653a);
    lawn.quad(c.x1 + 1, c.z0, f.x0 - 1, c.z1, 0.04, 0x5f7040);
    for (const [x, z] of [[-700, -260], [-700, 260], [-620, -300], [-620, 300]]) lawn.quad(x - 18, z - 22, x + 18, z + 22, 0.04, 0x5d6e3e);
    lawn.mark();
    for (let k = 0; k < 40; k++) {
      const x = c.x1 + 2 + rng() * 24; const z = c.z0 + rng() * (c.z1 - c.z0);
      lawn.quad(x - 1.5, z - 1.5, x + 1.5, z + 1.5, 0.05, [0xc8102e, 0xf2b418, 0xe8e0d0][k % 3]);
    }
    lawn.mark();
    this.lawns = this._prog(lawn, this.lawnMat, 'lawns', false);
    this._el('9.4', 'Landscaping: date palms, neem, lawns', [c.x0, 0, -620, f.x1, 12, c.z1 + 60], (p) => {
      this.landscapeVeg.setProgress(p);
      this.lawns.setProgress(p);
    }, { kind: 'landscape', front: (p) => ({ x: -700, z: -200 + 400 * p, radius: 60, kind: 'landscape' }) });
  }

  /* ------------------------------------------------------------- runtime */

  surfaceAt(x, z) {
    const f = LS.forecourt; const c = LS.carPark;
    if (x >= f.x1 - 6 && x <= f.x1 && z >= f.z0 - 60 && z <= f.z1 + 60) return 'concrete';
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 - 60 && z <= f.z1 + 60 && (this._p93 || 0) > 0) return 'asphalt';
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && (this._p92 || 0) > 0) return 'asphalt';
    if (x >= -300 && x <= -200 && z >= -760 && z <= -580) return 'concrete';
    return null;
  }

  update(dt, t, env) {
    if (this._opPrev !== this.ctx.world.state.operational) {
      this._opPrev = this.ctx.world.state.operational;
      this.setOperational(this._opPrev);
    }
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    this.street.dispose();
    if (this.landscapeVeg) this.landscapeVeg.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
