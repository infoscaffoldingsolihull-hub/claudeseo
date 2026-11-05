import * as THREE from 'three';
import { makeRng } from '../engine/noise.js';
import { MASTERPLAN, RUNWAY } from './layout.js';
import { GeoBuilder, ProgressiveMesh, InstancedSet, LightField, coneGeometry, barrierGeometry, labelTexture, whiteColors } from './props.js';

/**
 * Construction site dressing driven by the WBS: tower cranes on the terminal
 * and tower, the concrete/asphalt batch plant, site offices and laydown yard
 * (WBS 2.6 site establishment), stockpiles, barriers and fencing around
 * active fronts, paving/earthmoving plant parked at each work front and
 * mobile light towers that switch on at night.
 */

const MP = MASTERPLAN;
const YEL = 0xf2b418;

function craneParts() {
  const mast = new GeoBuilder({ worldUV: false });
  const H = 52; const w = 1.8;
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]]) mast.box(0.22, H, 0.22, x, 0, z, YEL);
  for (let y = 0; y < H; y += 3) {
    mast.box(w, 0.12, 0.12, 0, y, -w / 2, YEL); mast.box(w, 0.12, 0.12, 0, y, w / 2, YEL);
    mast.box(0.12, 0.12, w, -w / 2, y, 0, YEL); mast.box(0.12, 0.12, w, w / 2, y, 0, YEL);
    mast.beam(-w / 2, y, -w / 2, w / 2, y + 3, -w / 2, 0.08, YEL); mast.beam(w / 2, y, w / 2, -w / 2, y + 3, w / 2, 0.08, YEL);
    mast.beam(-w / 2, y, w / 2, -w / 2, y + 3, -w / 2, 0.08, YEL); mast.beam(w / 2, y, -w / 2, w / 2, y + 3, w / 2, 0.08, YEL);
  }
  mast.box(5, 1.2, 5, 0, -1.1, 0, 0x8a8a84);
  const jib = new GeoBuilder({ worldUV: false });
  const L = 56; const C = 16;
  jib.box(3, 1.6, 3, 0, 0, 0, YEL);                                  // slewing unit
  jib.box(2.2, 2.4, 2.0, 1.6, 0.2, 2.2, 0xe8e8e8);                    // cab
  jib.box(2.0, 1.2, 0.05, 1.6, 1.0, 3.21, 0x2f4656);
  for (const s of [-1, 1]) {
    jib.box(L, 0.18, 0.18, L / 2, 1.6, s * 0.7, YEL);
    jib.box(C, 0.18, 0.18, -C / 2, 1.6, s * 0.7, YEL);
  }
  jib.box(L, 0.18, 0.18, L / 2, 3.0, 0, YEL);
  for (let x = 0; x < L; x += 2.5) {
    jib.beam(x, 1.6, -0.7, x + 1.25, 3.0, 0, 0.08, YEL); jib.beam(x + 1.25, 3.0, 0, x + 2.5, 1.6, 0.7, 0.08, YEL);
    jib.box(0.08, 0.08, 1.4, x, 1.6, 0, YEL);
  }
  jib.box(C, 0.3, 2.2, -C / 2, 1.5, 0, YEL);
  for (let k = 0; k < 4; k++) jib.box(1.2, 2.6, 2.4, -C + 1 + k * 1.3, -1.0, 0, 0x9a9a92);
  for (const [ax, az] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) jib.beam(ax, 1.6, az, 0, 8.5, 0, 0.18, YEL);
  jib.beam(0, 8.5, 0, L * 0.7, 3.1, 0, 0.06, 0xcccccc);
  jib.beam(0, 8.5, 0, -C + 1, 1.8, 0, 0.06, 0xcccccc);
  // Trolley, cable and hook block (static in the jib frame).
  jib.box(1.6, 0.6, 1.6, 34, 1.0, 0, 0x555555);
  jib.box(0.05, 26, 0.05, 33.8, -25, 0, 0x333333); jib.box(0.05, 26, 0.05, 34.2, -25, 0, 0x333333);
  jib.box(0.9, 1.0, 0.6, 34, -26, 0, 0xd02010);
  jib.box(3.5, 0.15, 3.5, 34, -29.5, 0, 0x7a5a3a);
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) jib.beam(34, -26.5, 0, 34 + dx, -29.4, dz, 0.03, 0x333333);
  return { mast: mast.build(), jib: jib.build(), height: H };
}

function plantGeometries() {
  const paver = new GeoBuilder({ worldUV: false });
  paver.box(3.2, 1.4, 6.0, 0, 0.5, 0, YEL); paver.box(3.4, 0.6, 2.2, 0, 1.9, -1.6, 0x333333);
  paver.box(3.8, 1.0, 1.4, 0, 1.0, 3.4, 0x666666); paver.box(1.6, 1.6, 1.4, 0, 1.9, 0.8, 0xe8e8e8);
  paver.box(2.2, 0.1, 2.0, 0, 3.6, 0.8, YEL);
  for (const z of [-2.2, 1.6]) paver.box(3.4, 0.7, 1.5, 0, 0, z, 0x1a1a1a);
  const roller = new GeoBuilder({ worldUV: false });
  roller.box(1.9, 1.6, 2.6, 0, 0.6, 0, YEL); roller.box(1.6, 1.3, 1.4, 0, 2.2, 0.2, 0x2f4656);
  roller.box(1.8, 0.1, 1.7, 0, 3.5, 0.2, YEL);
  roller.cylH(0.7, 2.1, 0, 0.7, -1.9, 0x8a8a8a, 'x', 14); roller.cylH(0.7, 2.1, 0, 0.7, 1.9, 0x8a8a8a, 'x', 14);
  const truck = new GeoBuilder({ worldUV: false });
  truck.box(2.5, 1.0, 8.0, 0, 0.9, 0, 0x333333); truck.box(2.5, 2.2, 2.2, 0, 1.4, -2.8, 0xd65a10);
  truck.box(2.3, 0.9, 0.05, 0, 2.4, -3.91, 0x2f4656);
  truck.box(2.5, 1.8, 5.2, 0, 1.8, 1.2, 0xc8c2b6); truck.box(2.3, 0.3, 4.8, 0, 3.3, 1.2, 0x8a6a4a);
  for (const z of [-2.8, 0.6, 2.4]) for (const s of [-1, 1]) truck.cylH(0.55, 0.45, s * 1.15, 0.55, z, 0x151515, 'x', 10);
  const exc = new GeoBuilder({ worldUV: false });
  exc.box(3.0, 0.9, 4.6, 0, 0, 0, 0x2a2a2a); exc.box(2.8, 1.4, 3.6, 0, 0.9, 0.3, YEL);
  exc.box(1.2, 1.4, 1.4, -0.7, 2.3, -0.6, 0xe8e8e8);
  exc.beam(0.4, 2.0, -1.2, 0.4, 5.2, -4.6, 0.5, YEL); exc.beam(0.4, 5.2, -4.6, 0.4, 1.6, -7.4, 0.4, YEL);
  exc.box(1.4, 1.0, 1.0, 0.4, 0.6, -7.6, 0x555555);
  const tower = new GeoBuilder({ worldUV: false });
  tower.box(1.4, 1.0, 2.4, 0, 0.4, 0, 0xe8e0d0); tower.cyl(0.1, 7.5, 0, 1.4, 0, 0x9a9a9a, 6);
  tower.box(2.2, 0.8, 0.3, 0, 8.6, 0, 0x2a2a2a);
  for (const s of [-1, 1]) tower.cylH(0.3, 0.2, s * 0.7, 0.3, 0.8, 0x151515, 'x', 8);
  return { paver: paver.build(), roller: roller.build(), truck: truck.build(), exc: exc.build(), tower: tower.build() };
}

export class Construction {
  constructor(ctx, { showPlant = true } = {}) {
    this.ctx = ctx;
    this.M = ctx.M;
    this.group = new THREE.Group();
    this.group.name = 'construction';
    ctx.scene.add(this.group);
    this.elements = [];
    this.disposables = [];
    this.lightFields = [];
    this.pois = [];
    this.showPlant = showPlant;
    this.rng = makeRng(611);
    this._cranes();
    this._site();
    this._temporary();
    this._plant();
  }

  _add(o) { this.group.add(o); return o; }

  _cranes() {
    const parts = craneParts();
    this.disposables.push(parts.mast, parts.jib);
    this.cranes = [];
    this.craneLights = new LightField('crane-obstacle', { minPx: 2 });
    const sites = [
      { x: -470, z: -95, group: 'terminal', phase: 0 }, { x: -612, z: 70, group: 'terminal', phase: 2.1 },
      { x: -538, z: -446, group: 'tower', phase: 4.0 },
    ];
    for (const s of sites) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      const mast = new THREE.Mesh(parts.mast, this.M.paintMetal);
      mast.castShadow = true;
      const jib = new THREE.Mesh(parts.jib, this.M.paintMetal);
      jib.castShadow = true;
      jib.position.y = parts.height;
      g.add(mast, jib);
      g.visible = false;
      this._add(g);
      this.cranes.push({ ...s, g, jib });
      this.craneLights.add(s.x, parts.height + 9, s.z, new THREE.Color(6, 0.3, 0.2), 0.6, 2, s.phase);
    }
    this.craneLights.finalize(this.group);
    this.lightFields.push({ field: this.craneLights, kind: 'obstacle', id: null });
  }

  _site() {
    const S = MP.site;
    const b = new GeoBuilder(); const o = new GeoBuilder(); const l = new GeoBuilder();
    // Batch plant.
    const bx = S.batchPlant.x; const bz = S.batchPlant.z;
    b.box(70, 0.2, 60, bx, 0, bz, 0x9d978a);
    for (let k = 0; k < 3; k++) {
      const x = bx - 12 + k * 6;
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) b.box(0.3, 6, 0.3, x + dx, 0, bz - 10 + dz, 0x8a8f94);
      b.cyl(2.4, 3, x, 6, bz - 10, 0xd8d8d2, 12, 0.2);
      b.cyl(2.4, 12, x, 9, bz - 10, k === 1 ? 0xe8e8e2 : 0xd8d8d2, 14);
      b.cyl(2.5, 0.6, x, 21, bz - 10, 0x2b3a8c, 14);
    }
    b.box(8, 14, 8, bx + 8, 0, bz - 4, 0xd8d4c8); b.box(8.6, 0.6, 8.6, bx + 8, 14, bz - 4, 0x2b3a8c);
    b.box(10, 3, 4, bx + 8, 4, bz - 4, 0x777777);
    b.beam(bx + 8, 13, bz - 2, bx + 8, 1.5, bz + 22, 1.4, 0x8a8f94);
    for (let k = 0; k < 4; k++) {
      const x = bx - 18 + k * 9;
      b.box(0.4, 3, 9, x - 4.4, 0, bz + 22, 0xb8b0a0); b.box(0.4, 3, 9, x + 4.4, 0, bz + 22, 0xb8b0a0);
    }
    b.cyl(3, 4, bx + 26, 0, bz - 14, 0x3a6aa0, 12);
    b.box(6, 3, 3, bx + 24, 0, bz + 4, 0xe8e2d6);
    b.mark();
    const heaps = [];
    for (let k = 0; k < 4; k++) heaps.push({ x: bx - 18 + k * 9, y: 0, z: bz + 23, sx: 4, sy: 3.2, sz: 4, color: [0xb8aa90, 0x8a8478, 0x6a6a68, 0xc8b898][k] });
    // Site offices: portacabins, car park, flags.
    const ox = S.offices.x; const oz = S.offices.z;
    o.box(80, 0.15, 50, ox, 0, oz, 0xa69e90);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const x = ox - 24 + c * 12.5; const z = oz - 12 + r * 9;
        o.box(12, 2.8, 3, x, 0.15, z, 0xf2f2ee); o.box(12, 0.25, 3.05, x, 2.2, z, 0x2b3a8c);
        for (let k = -4; k <= 4; k += 2.6) o.box(1.0, 0.8, 0.05, x + k, 1.2, z - 1.53, 0x3c5866);
        if (r === 0 && c < 3) { o.box(12, 2.8, 3, x, 2.95, z, 0xf2f2ee); o.box(12, 0.25, 3.05, x, 5.0, z, 0x2b3a8c); }
      }
    }
    for (let k = 0; k < 3; k++) { o.cyl(0.08, 9, ox - 30 + k * 3, 0, oz - 22, 0xdddddd, 6); o.box(0.05, 1.2, 1.9, ox - 30 + k * 3, 7.6, oz - 21, [0x01411c, 0x9b1b30, 0x2b3a8c][k]); }
    o.box(8, 3, 0.2, ox + 30, 0.15, oz - 24, 0x1f2a6e);
    o.mark();
    // Laydown yard.
    const L = S.laydown;
    l.box(L.x1 - L.x0, 0.12, L.z1 - L.z0, (L.x0 + L.x1) / 2, 0, (L.z0 + L.z1) / 2, 0x8f877a);
    const rng = this.rng;
    for (let i = 0; i < 6; i++) {
      const x = L.x0 + 20 + i * 22; const z = L.z0 + 25;
      for (let k = 0; k < 6; k++) l.cylH(0.6, 12, x, 0.7 + Math.floor(k / 3) * 1.1, z + (k % 3) * 1.25, i % 2 ? 0x3a3a3a : 0x8a6a3a, 'x', 10);
    }
    for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) l.box(2.2, 1.6, 2.2, L.x0 + 16 + i * 16, 0.12 + k * 0, L.z0 + 70 + k * 3, 0xb0aca2);
    for (let i = 0; i < 10; i++) l.box(12, 0.5, 1.6, L.x0 + 30 + (i % 5) * 16, 0.12 + Math.floor(i / 5) * 0.5, L.z0 + 110, 0x7a4a2a);
    for (let i = 0; i < 6; i++) { const x = L.x0 + 25 + i * 18; l.cylH(1.2, 0.9, x, 1.32, L.z0 + 150, 0x9a7a4a, 'z', 14); l.cylH(0.5, 1.0, x, 1.32, L.z0 + 150, 0x333333, 'z', 10); }
    for (let i = 0; i < 12; i++) l.box(1.2, 1.0 + rng() * 0.6, 1.0, L.x0 + 20 + rng() * 120, 0.12, L.z0 + 165 + rng() * 25, 0x9a7a5a);
    l.mark();
    this.batch = this._mesh(b, 'batch-plant', true);
    this.offices = this._mesh(o, 'site-offices', true);
    this.laydown = this._mesh(l, 'laydown-yard', true);
    const cone = whiteColors(new THREE.ConeGeometry(1, 1, 12, 1));
    cone.translate(0, 0.5, 0);
    this.batchHeaps = new InstancedSet(cone, this.M.paint, heaps, { name: 'batch-heaps' });
    this._add(this.batchHeaps.mesh); this.disposables.push(this.batchHeaps);
    const signTex = labelTexture('PROJECT SITE OFFICE · SIMULATED', { w: 512, h: 64, bg: '#1f2a6e', fg: '#f4efe4', font: 'bold 30px sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.0), new THREE.MeshStandardMaterial({ map: signTex }));
    sign.position.set(ox + 30, 2.2, oz - 24.15); sign.rotation.y = Math.PI;
    this.offices.add(sign);
    this.disposables.push(signTex, sign.geometry, sign.material);

    this.elements.push({
      id: '2.6', name: 'Site establishment: offices, batch plant, laydown', kind: 'building',
      box: new THREE.Box3(new THREE.Vector3(ox - 40, 0, oz - 25), new THREE.Vector3(L.x1, 22, L.z1)),
      apply: (p) => { this._p26 = p; this._applySite(); },
      front: () => ({ x: ox, z: oz, radius: 50, kind: 'building' }),
      pickBoxes: [[ox - 40, 0, oz - 25, ox + 40, 6, oz + 25], [bx - 35, 0, bz - 30, bx + 35, 22, bz + 30], [L.x0, 0, L.z0, L.x1, 4, L.z1]],
    });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.pois.push(
      { id: 'poi-batch-plant', name: 'Batch plant', wbsId: '2.6', position: V(bx - 26, 1.7, bz + 8), radius: 20,
        text: 'On-site batching of concrete and asphalt keeps haul times short in the Sindh heat. Mix designs, temperature and slump/density tests feed the quality control charts.' },
      { id: 'poi-site-office', name: 'Project site office', wbsId: '2.6', position: V(ox, 1.7, oz - 28), radius: 18,
        text: 'The project management office on site: daily stand-ups, look-ahead planning, HSE inductions and the change-control board meet here (simulated).' },
    );
  }

  _mesh(b, name, shadows) {
    const m = new THREE.Mesh(b.build(), this.M.paintMap);
    m.castShadow = shadows; m.receiveShadow = true; m.name = name; m.visible = false;
    this._add(m); this.disposables.push(m.geometry);
    return m;
  }

  _temporary() {
    // Stockpiles along the extension (soil) and aggregate heaps.
    const cone = whiteColors(new THREE.ConeGeometry(1, 1, 10, 1));
    cone.translate(0, 0.5, 0);
    const soil = []; const agg = [];
    const z0 = RUNWAY.extensionStartZ;
    for (let z = z0 + 120; z < RUNWAY.extensionEndZ; z += 140) {
      for (const s of [-1, 1]) {
        soil.push({ x: s * 115 + (this.rng() - 0.5) * 10, y: 0, z: z + (this.rng() - 0.5) * 30, sx: 12 + this.rng() * 6, sy: 4 + this.rng() * 2, sz: 12 + this.rng() * 6, color: 0x9a7650 });
        agg.push({ x: s * 100, y: 0, z: z + 60, sx: 8, sy: 3.5, sz: 8, color: s > 0 ? 0x8f8a80 : 0x6f6c68 });
      }
    }
    this.soilHeaps = new InstancedSet(cone, this.M.paint, soil, { name: 'soil-stockpiles' });
    this.aggHeaps = new InstancedSet(cone.clone(), this.M.paint, agg, { name: 'aggregate-stockpiles' });
    for (const s of [this.soilHeaps, this.aggHeaps]) { this._add(s.mesh); this.disposables.push(s); s.setProgress(0); }
    // Barriers along both sides of the extension corridor.
    const bars = [];
    for (let z = z0 + 2; z < RUNWAY.extensionEndZ + 120; z += 3.2) for (const s of [-1, 1]) bars.push({ x: s * 92, y: 0, z, ry: Math.PI / 2 });
    this.barriers = new InstancedSet(barrierGeometry(), this.M.paint, bars, { name: 'extension-barriers', shadows: false });
    this._add(this.barriers.mesh); this.disposables.push(this.barriers);
    this.barrierTotal = bars.length;
    // Hoarding around the terminal & tower sites.
    const h = new GeoBuilder();
    const T = MP.terminal;
    const ring = (x0, z0, x1, z1) => {
      for (const [ax, az, bx2, bz2] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
        const L = Math.hypot(bx2 - ax, bz2 - az);
        for (let s = 0; s < L; s += 4) {
          const x = ax + ((bx2 - ax) * s) / L; const z = az + ((bz2 - az) * s) / L;
          h.cyl(0.05, 2.0, x, 0, z, 0x777777, 5);
        }
        h.beam(ax, 1.0, az, bx2, 1.0, bz2, 0.05, 0xff6a10);
        h.beam(ax, 1.9, az, bx2, 1.9, bz2, 0.05, 0xff6a10);
        h.beam(ax, 1.45, az, bx2, 1.45, bz2, 0.03, 0xff6a10);
      }
    };
    ring(T.x0 - 26, T.z0 - 26, T.x1 + 12, T.z1 + 26);
    h.mark();
    ring(MP.tower.x - 22, MP.tower.z - 22, MP.tower.x + 22, MP.tower.z + 22);
    h.mark();
    this.hoarding = new ProgressiveMesh(h, this.M.paint, { shadows: false, name: 'site-hoarding' });
    this._add(this.hoarding.mesh); this.disposables.push(this.hoarding);
    this.hoardingTerminal = false; this.hoardingTower = false;
    // Cones around active paving fronts (re-placed per state).
    this.coneGeo = coneGeometry();
    this.cones = new THREE.InstancedMesh(this.coneGeo, this.M.paint, 160);
    this.cones.count = 0; this.cones.name = 'cones';
    this._add(this.cones);
    this.disposables.push(this.coneGeo, { dispose: () => this.cones.dispose() });
  }

  _plant() {
    const g = plantGeometries();
    this.plantGeo = g;
    for (const k of Object.keys(g)) this.disposables.push(g[k]);
    this.plantSets = [];
    const mk = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, this.M.paintMetal, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.castShadow = true; m.receiveShadow = true;
      this._add(m); this.disposables.push({ dispose: () => m.dispose() });
      return m;
    };
    this.pavers = mk(g.paver, 6); this.rollers = mk(g.roller, 12); this.trucks = mk(g.truck, 12); this.excs = mk(g.exc, 6); this.towers = mk(g.tower, 10);
    this.workLights = new LightField('work-lights', { minPx: 2, maxPx: 30 });
    for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) this.workLights.add(0, -1000, 0, new THREE.Color(4.6, 4.4, 4.0), 0.5);
    this.workLights.finalize(this.group);
    this.lightFields.push({ field: this.workLights, kind: 'work', id: null });
    this.slots = [];
  }

  /** Re-place everything that depends on the project state. */
  setState(state, world) {
    this.state = state;
    const pct = state.pct || {};
    const g = (id) => Math.max(0, Math.min(1, Number(pct[id]) || 0));
    const active = (id) => (state.activeIds || []).includes(id) || (g(id) > 0.001 && g(id) < 0.999);
    // Cranes.
    const term = (g('7.2') > 0.2 && g('7.5') < 0.98) || active('7.3') || active('7.4');
    const tow = (g('6.3') > 0.02 && g('6.4') < 0.95) || active('6.3') || active('6.4');
    for (const c of this.cranes) c.g.visible = c.group === 'terminal' ? term : tow;
    this.craneLights.setProgress(1);
    this._craneOn = this.cranes.map((c) => c.g.visible);
    // Temporary works.
    this.soilHeaps.setProgress(active('3.2') ? 1 - g('3.2') * 0.5 : 0);
    this.aggHeaps.setProgress(active('3.3') || active('3.4') ? 1 : 0);
    const extActive = ['3.2', '3.3', '3.4', '3.5', '3.9'].some(active);
    const front = Math.max(g('3.2'), 0.05);
    this.barriers.setProgress(extActive ? Math.min(1, front + 0.1) : 0);
    this.hoardingTerminal = g('7.2') > 0 && g('7.5') < 0.95;
    this.hoardingTower = g('6.3') > 0 && g('6.4') < 0.95;
    this.hoarding.setProgress(this.hoardingTerminal ? (this.hoardingTower ? 1 : 0.5) : 0);
    if (!this.hoardingTerminal && this.hoardingTower) {
      this.hoarding.setProgress(1);
      this.hoarding.geometry.setDrawRange(this.hoarding.marks[0], this.hoarding.marks[1] - this.hoarding.marks[0]);
      this.hoarding.progress = -1;
    }
    this._applySite();

    // Plant at fronts.
    const fronts = world ? world._fronts() : [];
    this.slots = [];
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3(1, 1, 1);
    let np = 0; let nr = 0; let nt = 0; let ne = 0; let nl = 0; let nc = 0;
    const put = (mesh, idx, x, z, ry, slot) => {
      q.setFromEuler(new THREE.Euler(0, ry, 0));
      m.compose(p.set(x, 0.12, z), q, s);
      mesh.setMatrixAt(idx, m);
      if (slot) this.slots.push({ mesh, idx, x, z, ry, ...slot });
    };
    const lightsAttr = this.workLights.geometry.attributes.position;
    for (const f of fronts) {
      if (!this.showPlant) break;
      const pave = f.kind === 'paving'; const earth = f.kind === 'earthworks';
      if (pave && np < 6) {
        put(this.pavers, np++, f.x, f.z, 0, { kind: 'paver', amp: 0, speed: 0 });
        for (let k = 0; k < 2 && nr < 12; k++) put(this.rollers, nr++, f.x + (k ? 3.5 : -3.5), f.z + 14 + k * 6, 0, { kind: 'roller', amp: 6, speed: 0.35 + k * 0.1, phase: k * 2 });
        if (nt < 12) put(this.trucks, nt++, f.x + 6, f.z - 14, Math.PI, { kind: 'truck', amp: 0, speed: 0 });
      } else if (earth && ne < 6) {
        put(this.excs, ne++, f.x - 6, f.z, 0.6, { kind: 'exc', amp: 0.5, speed: 0.6, swing: true });
        if (nt < 12) put(this.trucks, nt++, f.x + 5, f.z - 8, 0.3, { kind: 'truck', amp: 0, speed: 0 });
        if (nr < 12) put(this.rollers, nr++, f.x + 12, f.z + 10, 0, { kind: 'roller', amp: 8, speed: 0.3 });
      }
      if ((pave || earth || f.kind === 'building') && nl < 10) {
        const lx = f.x + (f.kind === 'building' ? f.radius * 0.6 : 18); const lz = f.z + 6;
        put(this.towers, nl, lx, lz, 0, null);
        for (let k = 0; k < 4; k++) lightsAttr.setXYZ(nl * 4 + k, lx - 0.75 + k * 0.5, 8.9, lz - 0.2);
        nl++;
      }
      if (pave && nc < 150) {
        for (let k = 0; k < 10 && nc < 160; k++) {
          q.identity();
          m.compose(p.set(f.x + (k % 2 ? 26 : -26), 0.12, f.z - 40 + k * 8), q, s);
          this.cones.setMatrixAt(nc++, m);
        }
      }
    }
    for (let i = nl * 4; i < lightsAttr.count; i++) lightsAttr.setXYZ(i, 0, -1000, 0);
    lightsAttr.needsUpdate = true;
    this.workLights.geometry.computeBoundingSphere();
    this.pavers.count = np; this.rollers.count = nr; this.trucks.count = nt; this.excs.count = ne; this.towers.count = nl; this.cones.count = nc;
    for (const mesh of [this.pavers, this.rollers, this.trucks, this.excs, this.towers, this.cones]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    this._nl = nl;
  }

  _applySite() {
    const p = this._p26 || 0;
    const pct = (this.state && this.state.pct) || {};
    const done = (id) => (Number(pct[id]) || 0) >= 0.999;
    const demob = (this.state && this.state.phase === 'closing') || (done('3.5') && done('3.6') && done('4.3') && done('7.7') && done('9.1'));
    this.offices.visible = p > 0.15 && !demob;
    this.batch.visible = p > 0.45 && !demob;
    this.batchHeaps.setProgress(p > 0.45 && !demob ? 1 : 0);
    this.laydown.visible = p > 0.7 && !demob;
  }

  update(dt, t, env) {
    if (this.cranes) {
      this.cranes.forEach((c, i) => {
        if (!c.g.visible) return;
        c.jib.rotation.y = c.phase + Math.sin(t * 0.05 + c.phase) * 1.4 + t * 0.01;
      });
    }
    for (const sl of this.slots) {
      if (!sl.amp) continue;
      const off = Math.sin(t * sl.speed + (sl.phase || 0)) * sl.amp;
      const ry = sl.swing ? sl.ry + off : sl.ry;
      const dz = sl.swing ? 0 : off;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(sl.x, 0.12, sl.z + dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
      sl.mesh.setMatrixAt(sl.idx, m);
      sl.mesh.instanceMatrix.needsUpdate = true;
    }
    this.workLights.setProgress(this._nl ? 1 : 0);
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    for (const lf of this.lightFields) lf.field.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
