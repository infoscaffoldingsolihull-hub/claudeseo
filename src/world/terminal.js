import * as THREE from 'three';
import { MASTERPLAN } from './layout.js';
import { GeoBuilder, ProgressiveMesh, InstancedSet, layered, labelTexture } from './props.js';
import { STANDS } from './airfield.js';

/**
 * The new passenger terminal (simulated concept): a long glass hall under a
 * scalloped metal roof, crowned by a double row of "mangho" windcatchers whose
 * open faces carry pierced Ajrak screens — the Hyderabad windcatcher turned
 * into an architectural signature. Built in phases 7.2 → 7.9 and fully
 * enterable: check-in islands, security lanes, departure lounge with FIDS,
 * baggage reclaim, jet bridges to the contact stands.
 */

const T = MASTERPLAN.terminal;
const X0 = T.x0; const X1 = T.x1; const Z0 = T.z0; const Z1 = T.z1;
const FY = 0.3;            // finished floor level
const RH = 19.5;           // underside of roof structure
const COL_X = [-588, -564, -540, -516, -492];
const COL_Z = [];
for (let z = -162; z <= 162.01; z += 18) COL_Z.push(z);
const ISLANDS = [-135, -99, -63, -27];
const LANES = [-135, -99, -63, -27, 9, 45];
const DOORS = [-117, -63, -9, 117];        // landside entrances (last = arrivals exit)
const ARR_Z = 80;                           // departures | arrivals partition
const KIOSKS = [-117, -45, 27];
const CAROUSELS = [108, 146];
const CONTACT = STANDS.filter((s) => s.contact);
/** Upper floor of the boarding bridges (the gate stairs climb to it). */
const BRIDGE_Y = 3.05;
/** Gate door / stair centre line for a contact stand. */
const gateZ = (st) => st.z + 14;
const gateNo = (st) => st.index + 1;
const DOOR_W = 3.0;                         // landside sliding leaf width (gap = 2 leaves)
const GATE_HW = 1.3;                        // half width of a gate door / stair
/** Parts of [a, b] outside the excluded [lo, hi] intervals. */
function spans(a, b, cuts) {
  const out = [];
  let cur = a;
  for (const [lo, hi] of cuts.slice().sort((p, q) => p[0] - q[0])) {
    if (hi <= cur || lo >= b) continue;
    if (lo > cur) out.push([cur, lo]);
    cur = Math.max(cur, hi);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

function roofY(z) {
  const t = ((z + 180) / 18) % 1;
  return 20.6 + 1.5 * Math.sin(Math.PI * t);
}

export class Terminal {
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.M;
    this.collision = ctx.collision;
    this.group = new THREE.Group();
    this.group.name = 'terminal';
    ctx.scene.add(this.group);
    this.elements = [];
    this.disposables = [];
    this.pois = [];
    this.lightFields = [];
    this.col = {};
    this.p = {};

    this.glass = this.M.glass.clone();
    this.glass.emissive = new THREE.Color(0xffd7a0);
    this.glass.emissiveIntensity = 0;
    if (ctx.envMap) this.glass.envMap = ctx.envMap;
    this.glassSide = this.glass.clone();
    this.glassSide.side = THREE.DoubleSide;
    this.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.66).multiplyScalar(2.2) });
    this.lamp.toneMapped = false;
    this.windGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.25), transparent: true, opacity: 0 });
    this.floorMat = layered(this.M.tile, 3);
    this.disposables.push(this.glass, this.glassSide, this.lamp, this.windGlow, this.floorMat);

    this._foundations();
    this._steel();
    this._roof();
    this._glazing();
    this._interior();
    this._fids();
    this._bridges();
    this._doors();
    this._passport();
    this._gates();
    this._pois();
  }

  _add(o) { this.group.add(o); return o; }
  _prog(b, m, name, shadows = true) {
    const pm = new ProgressiveMesh(b, m, { shadows, name });
    this._add(pm.mesh); this.disposables.push(pm); return pm;
  }
  _box(x0, y0, z0, x1, y1, z1, key) {
    if (!this.collision) return;
    (this.col[key] = this.col[key] || []).push(this.collision.addBox(x0, y0, z0, x1, y1, z1, `terminal-${key}`));
  }
  _enable(key, on) { if (this.collision && this.col[key]) this.collision.setDisabled(this.col[key], !on); }

  _el(id, name, box, apply, extra = {}) {
    this.elements.push({ id, name, box: new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4], box[5])), apply, kind: 'building', ...extra });
  }

  /* --------------------------------------------------------- 7.2 foundations */

  _foundations() {
    const pad = new GeoBuilder();
    pad.quad(X0 - 20, Z0 - 20, X1 + 10, Z1 + 20, 0.02, 0x9c8466);
    this.pad = new THREE.Mesh(pad.build(), layered(this.M.soilCut, 1, this.ctx.layerCache));
    this.pad.receiveShadow = true;
    this._add(this.pad);
    const caps = new GeoBuilder();
    for (const z of COL_Z) {
      for (const x of COL_X) caps.box(3.2, 1.0, 3.2, x, -0.6, z, 0xa8a49c);
      caps.box(X1 - X0 - 4, 0.5, 1.0, (X0 + X1) / 2, -0.15, z, 0x9e9a92);
      caps.mark();
    }
    this.caps = this._prog(caps, this.M.paintMap, 'terminal-pilecaps', false);
    const slab = new GeoBuilder();
    for (let z = Z0; z < Z1 - 0.01; z += 17) {
      const ze = Math.min(z + 17, Z1);
      slab.box(X1 - X0, FY - 0.05, ze - z, (X0 + X1) / 2, 0, (z + ze) / 2, 0xbdb8ae);
      slab.mark();
    }
    this.slab = this._prog(slab, this.M.paintMap, 'terminal-slab', false);
    this._box(X0, 0, Z0, X1, FY, Z1, 'slab');
    this._el('7.2', 'Terminal foundations, piles & ground slab', [X0, 0, Z0, X1, 1.5, Z1], (p) => {
      this.p['7.2'] = p;
      this.pad.visible = p > 0;
      this.caps.setProgress(Math.min(1, p * 1.6));
      this.slab.setProgress(Math.max(0, (p - 0.4) / 0.6));
      this._enable('slab', p > 0.6);
    }, { kind: 'building', surface: 'concrete', front: (p) => ({ x: (X0 + X1) / 2, z: Z0 + (Z1 - Z0) * p, radius: 60, kind: 'building' }) });
  }

  /* ------------------------------------------------------------ 7.3 steel */

  _steel() {
    const b = new GeoBuilder();
    const steel = 0xe9ebee;
    for (const z of COL_Z) {
      for (const x of COL_X) {
        b.cyl(0.42, 15.5, x, FY, z, steel, 10);
        // Tree column: four branches to the roof girders.
        for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) b.beam(x, FY + 15.5, z, x + dx, RH, z + dz, 0.28, steel);
        b.cyl(0.7, 0.5, x, FY + 15.2, z, steel, 10);
      }
      b.box(X1 - X0 + 22, 1.1, 0.6, (X0 + X1) / 2 - 4, RH - 0.2, z, 0xdfe2e6);
      b.mark();
    }
    for (const x of [...COL_X, -612, -476]) b.box(0.45, 0.8, Z1 - Z0 + 18, x, RH, 0, 0xdfe2e6);
    b.mark();
    this.steel = this._prog(b, this.M.paintMetal, 'terminal-steel');
    for (const z of COL_Z) for (const x of COL_X) this._box(x - 0.45, FY, z - 0.45, x + 0.45, RH, z + 0.45, 'cols');
    this._el('7.3', 'Terminal structural steel frame', [X0 - 16, 0, Z0 - 9, X1 + 4, RH + 1, Z1 + 9], (p) => {
      this.p['7.3'] = p;
      this.steel.setProgress(p);
      this._enable('cols', p > 0.3);
    }, { kind: 'building', front: (p) => ({ x: (X0 + X1) / 2, z: Z0 + (Z1 - Z0) * p, radius: 60, kind: 'building' }) });
  }

  /* ------------------------------------------------------------- 7.4 roof */

  _roof() {
    const top = new GeoBuilder(); const soffit = new GeoBuilder(); const fascia = new GeoBuilder();
    const xa = X0 - 16; const xb = X1 + 8;
    const mtx = new THREE.Matrix4();
    for (let zb = -180; zb < 180 - 0.01; zb += 18) {
      const g = new THREE.PlaneGeometry(xb - xa, 18, 1, 8);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i) + zb + 9;
        pos.setXYZ(i, pos.getX(i) + (xa + xb) / 2, roofY(Math.min(z, zb + 17.999)) + 1.0, z);
      }
      g.computeVertexNormals();
      top.add(g, mtx, 0xffffff);
      const s = g.clone();
      const sp = s.attributes.position;
      for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) - 1.2);
      // flip winding for the underside
      const idx = s.index.array;
      for (let i = 0; i < idx.length; i += 3) { const t2 = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t2; }
      s.computeVertexNormals();
      soffit.add(s, mtx, 0xe0c39a);
      g.dispose(); s.dispose();
      // Fascia: landside & airside edges follow the scallop.
      for (let k = 0; k < 8; k++) {
        const z0 = zb + (k * 18) / 8; const z1 = zb + ((k + 1) * 18) / 8;
        const y0 = roofY(z0) - 0.2; const y1 = roofY(Math.min(z1, zb + 17.999)) - 0.2;
        for (const x of [xa, xb]) {
          fascia.boxR(0.4, 1.4, z1 - z0, x, (y0 + y1) / 2 + 0.6, (z0 + z1) / 2, 0xf1efe9, Math.atan2(y1 - y0, z1 - z0), 0, 0);
        }
      }
      top.mark(); soffit.mark(); fascia.mark();
    }
    this.roofMat = this.M.roofMetal.clone();
    this.roofMat.color = new THREE.Color(0xf3eee4);
    this.roofMat.metalness = Math.min(this.roofMat.metalness, 0.45);
    if (this.ctx.envMap && !this.roofMat.envMap) this.roofMat.envMap = this.ctx.envMap;
    this.disposables.push(this.roofMat);
    this.roofTop = this._prog(top, this.roofMat, 'terminal-roof', true);
    this.roofSoffit = this._prog(soffit, this.M.paint, 'terminal-soffit', false);
    this.roofFascia = this._prog(fascia, this.M.paint, 'terminal-fascia', true);

    // Mangho windcatchers (open faces towards the prevailing south-westerly → world +Z).
    const mb = new GeoBuilder(); const screens = new GeoBuilder(); const glow = new GeoBuilder({ worldUV: false });
    const sand = 0xd9b98e; const cap = 0xa8794c;
    const plane = new THREE.PlaneGeometry(1, 1);
    const q = new THREE.Quaternion(); const ps = new THREE.Vector3(); const sc = new THREE.Vector3();
    this.manghos = [];
    for (const z of [-135, -81, -27, 27, 81, 135]) {
      for (const x of [-580, -506]) {
        const w = 9; const h0 = 18; const h1 = 36;
        mb.box(w, h1 - h0, 0.8, x, h0, z - w / 2 + 0.4, sand);        // back
        mb.box(0.8, h1 - h0, w, x - w / 2 + 0.4, h0, z, sand);         // sides
        mb.box(0.8, h1 - h0, w, x + w / 2 - 0.4, h0, z, sand);
        mb.box(w, 6, 0.8, x, h0, z + w / 2 - 0.4, sand);               // low front parapet
        mb.box(w + 0.6, 0.9, w + 0.6, x, h0 + 6.5, z, 0x9b1b30);       // Ajrak-red band
        mb.boxR(w + 1.2, 0.7, w * 1.3, x, h1 + 1.4, z - 0.3, cap, 0.42, 0, 0); // sloping cap, high at the back
        for (const s2 of [-1, 1]) mb.box(0.5, h1 - h0 - 7.5, 0.5, x + s2 * (w / 2 - 1.2), h0 + 7.5, z + w / 2 - 0.4, cap);
        mb.mark();
        q.identity();
        ps.set(x, (h0 + 7.4 + h1) / 2, z + w / 2 - 0.3);
        sc.set(w - 1.6, h1 - h0 - 7.4, 1);
        screens.add(plane, new THREE.Matrix4().compose(ps, q, sc), 0xffffff);
        ps.z -= 1.0;
        glow.add(plane, new THREE.Matrix4().compose(ps, q, sc), 0xffffff);
        screens.mark(); glow.mark();
        this.manghos.push({ x, z });
      }
    }
    plane.dispose();
    this.manghoMesh = this._prog(mb, this.M.paintMap, 'manghos', true);
    this.manghoScreens = this._prog(screens, this.M.ajrakScreen, 'mangho-screens', false);
    this.manghoGlow = this._prog(glow, this.windGlow, 'mangho-glow', false);

    // Landside name board on the roof fascia.
    const tex = labelTexture('HYDERABAD', { w: 1024, h: 128, bg: null, fg: '#f4efe4', font: 'bold 104px sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(64, 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    sign.material.color.setScalar(1.3);
    sign.position.set(xa - 0.4, roofY(0) - 3.6, 0);
    sign.rotation.y = -Math.PI / 2;
    this.nameSign = this._add(sign);
    this.disposables.push(tex, sign.material, sign.geometry);

    this._el('7.4', 'Terminal roof & mangho windcatchers', [xa, RH - 1, -180, xb, 38, 180], (p) => {
      this.p['7.4'] = p;
      this.roofTop.setProgress(p); this.roofSoffit.setProgress(p); this.roofFascia.setProgress(p);
      const m = Math.max(0, (p - 0.35) / 0.65);
      this.manghoMesh.setProgress(m); this.manghoScreens.setProgress(m > 0.98 ? 1 : m * 0.8); this.manghoGlow.setProgress(m);
      this.nameSign.visible = p >= 0.999;
    }, { kind: 'building', front: (p) => ({ x: (X0 + X1) / 2, z: -180 + 360 * p, radius: 70, kind: 'building' }) });
  }

  /* ---------------------------------------------------------- 7.5 glazing */

  _glazing() {
    const g = new GeoBuilder({ worldUV: false }); const mul = new GeoBuilder(); const scr = new GeoBuilder();
    const ends = new GeoBuilder();
    const frame = 0x3a3f46;
    const plane = new THREE.PlaneGeometry(1, 1);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const ps = new THREE.Vector3(); const sc = new THREE.Vector3();
    const qX = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const bay = 17;
    for (let z = Z0; z < Z1 - 0.01; z += bay) {
      const ze = Math.min(z + bay, Z1); const zc = (z + ze) / 2; const len = ze - z;
      for (const x of [X0, X1]) {
        g.add(plane, m4.compose(ps.set(x, (FY + RH) / 2, zc), qX, sc.set(len, RH - FY, 1)), 0xffffff);
        // Mullions and transoms stop at the sliding doors (landside entrances, airside door, gate doors).
        const gaps = x === X0 ? DOORS.map((d) => [d - DOOR_W - 0.2, d + DOOR_W + 0.2]) : [[-2.2, 2.2], ...CONTACT.map((st) => [gateZ(st) - GATE_HW - 0.2, gateZ(st) + GATE_HW + 0.2])];
        for (let k = 0; k <= len; k += 2.833) {
          const zm = z + k;
          if (!gaps.some(([lo, hi]) => zm > lo && zm < hi)) mul.box(0.16, RH - FY, 0.3, x, FY, zm, frame);
        }
        for (const y of [FY + 0.1, 3.5, 7.8, 12.1, 16.4, RH - 0.3]) {
          const cut = (x === X0 && y < 3.8) || (x === X1 && y < 6) ? gaps : [];
          for (const [a, b] of spans(z, ze, cut)) mul.box(0.3, 0.16, b - a, x, y, (a + b) / 2, frame);
        }
      }
      // Pierced Ajrak brise-soleil in front of the landside glass.
      scr.add(plane, m4.compose(ps.set(X0 - 2.2, 13.8, zc), qX, sc.set(len - 0.4, 9.6, 1)), 0xffffff);
      mul.box(0.25, 0.25, len, X0 - 2.2, 18.7, zc, 0x9b1b30);
      mul.box(0.25, 0.25, len, X0 - 2.2, 8.9, zc, 0x9b1b30);
      g.mark(); mul.mark(); scr.mark();
    }
    // Doors: dark frames + canopies on the landside.
    for (const z of DOORS) {
      mul.box(0.5, 3.6, 0.3, X0 - 0.1, FY, z - 3, frame); mul.box(0.5, 3.6, 0.3, X0 - 0.1, FY, z + 3, frame);
      mul.box(0.6, 0.4, 6.3, X0 - 0.1, FY + 3.4, z, frame);
      mul.box(5, 0.35, 8, X0 - 2.5, 4.4, z, 0x9b1b30);
    }
    mul.mark();
    // End walls: solid plaster below with an Ajrak-red band, glass above.
    for (const z of [Z0, Z1]) {
      ends.box(X1 - X0, 6.5, 0.6, (X0 + X1) / 2, FY, z, 0xe9e1d2);
      ends.box(X1 - X0, 0.8, 0.7, (X0 + X1) / 2, FY + 6.5, z, 0x9b1b30);
      g.add(plane, m4.compose(ps.set((X0 + X1) / 2, (FY + 7.3 + RH) / 2, z), q.identity(), sc.set(X1 - X0, RH - FY - 7.3, 1)), 0xffffff);
    }
    ends.mark(); g.mark();
    plane.dispose();
    this.glazing = this._prog(g, this.glassSide, 'terminal-glazing', false);
    this.mullions = this._prog(mul, this.M.paintMetal, 'terminal-mullions', true);
    this.endWalls = this._prog(ends, this.M.paintMap, 'terminal-endwalls', true);
    const ajrak = this.M.ajrakScreen;
    this.screens = this._prog(scr, ajrak, 'terminal-ajrak-screens', true);
    // Collision: facades with door gaps; an airside door at z = 0 leads to the apron.
    const wall = (x, za, zb) => this._box(x - 0.3, FY, za, x + 0.3, RH, zb, 'walls');
    let zc = Z0;
    for (const d of DOORS) { wall(X0, zc, d - 3); zc = d + 3; }
    wall(X0, zc, Z1);
    // Airside: the ground-floor apron door at z = 0 and, one storey up, a gate door per boarding bridge.
    for (const [a, b] of spans(Z0, Z1, [[-2, 2], ...CONTACT.map((st) => [gateZ(st) - GATE_HW, gateZ(st) + GATE_HW])])) wall(X1, a, b);
    for (const st of CONTACT) {
      const zg = gateZ(st);
      this._box(X1 - 0.3, FY, zg - GATE_HW, X1 + 0.3, BRIDGE_Y, zg + GATE_HW, 'walls');
      this._box(X1 - 0.3, BRIDGE_Y + 2.65, zg - GATE_HW, X1 + 0.3, RH, zg + GATE_HW, 'walls');
    }
    this._box(X1 - 0.3, FY + 3.1, -2, X1 + 0.3, RH, 2, 'walls');
    this._box(X0, FY, Z0 - 0.3, X1, RH, Z0 + 0.3, 'walls');
    this._box(X0, FY, Z1 - 0.3, X1, RH, Z1 + 0.3, 'walls');
    this._el('7.5', 'Terminal glazing, facades & Ajrak screens', [X0 - 3, 0, Z0, X1 + 1, RH, Z1], (p) => {
      this.p['7.5'] = p;
      this.mullions.setProgress(Math.min(1, p * 1.3));
      this.glazing.setProgress(Math.max(0, p * 1.3 - 0.3));
      this.screens.setProgress(Math.max(0, p * 1.5 - 0.5));
      this.endWalls.setProgress(p > 0.5 ? 1 : 0);
      this._enable('walls', p > 0.6);
    }, { kind: 'building', front: (p) => ({ x: X0 - 10, z: Z0 + (Z1 - Z0) * p, radius: 40, kind: 'building' }) });
  }

  /* --------------------------------------------------------- 7.7 fit-out */

  _interior() {
    const groups = [];
    const G = (threshold, name, mat, build, colKey) => {
      const b = new GeoBuilder();
      build(b);
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = name;
      mesh.visible = false;
      this._add(mesh);
      this.disposables.push(mesh.geometry);
      groups.push({ threshold, mesh, colKey });
      return mesh;
    };
    // Floor finish (terrazzo-like tile) with an Ajrak-red inlay runner.
    const floor = new GeoBuilder();
    floor.quad(X0 + 0.3, Z0 + 0.3, X1 - 0.3, Z1 - 0.3, FY + 0.005, 0xffffff);
    const floorMesh = new THREE.Mesh(floor.build(), this.floorMat);
    floorMesh.receiveShadow = true; floorMesh.visible = false;
    this._add(floorMesh); this.disposables.push(floorMesh.geometry);
    groups.push({ threshold: 0.05, mesh: floorMesh });
    G(0.08, 'floor-inlays', layered(this.M.paint, 5, this.ctx.layerCache), (b) => {
      b.quad(X0 + 6, -168, X0 + 8, ARR_Z - 2, FY + 0.01, 0x9b1b30);
      b.quad(-548, -168, -546, ARR_Z - 2, FY + 0.01, 0x2b3a8c);
      for (const z of ISLANDS) b.quad(-592, z - 6.5, -566, z + 6.5, FY + 0.01, 0xc9bca6);
    });

    const crimson = 0x9b1b30; const indigo = 0x24317a; const sandstone = 0xd9c3a0; const steelC = 0x9aa1aa; const desk = 0xe9e4da; const black = 0x23262b;
    // Check-in islands.
    G(0.2, 'checkin', this.M.paint, (b) => {
      for (const z of ISLANDS) {
        b.box(16, 3.2, 1.2, -577, FY, z, crimson);               // back screen
        b.box(16, 0.6, 1.25, -577, FY + 3.2, z, 0xf2ead8);       // light box band
        b.box(16, 0.55, 1.0, -577, FY, z - 1.4, 0x55595f);       // bag belts
        b.box(16, 0.55, 1.0, -577, FY, z + 1.4, 0x55595f);
        for (let x = -584; x <= -570; x += 2.33) {
          for (const s of [-1, 1]) {
            b.box(1.8, 1.05, 0.8, x, FY, z + s * 2.5, desk);
            b.box(0.5, 0.35, 0.05, x, FY + 1.1, z + s * 2.2, black);
            b.box(0.6, 0.06, 0.6, x + 0.6, FY + 0.55, z + s * 1.4, 0x888888); // scale plate
          }
        }
        // queue posts
        for (let x = -590; x <= -566; x += 2) for (const s of [-1, 1]) b.cyl(0.05, 1.0, x, FY, z + s * 6, steelC, 6);
      }
    }, 'checkin');
    for (const z of ISLANDS) this._box(-585.5, FY, z - 3, -568.5, FY + 3.8, z + 3, 'checkin');

    // Security lanes.
    G(0.35, 'security', this.M.paint, (b) => {
      let zc = Z0;
      for (const z of LANES) {
        b.box(0.12, 2.4, z - 0.6 - zc, -552, FY, (zc + z - 0.6) / 2, 0x6f8090);
        b.box(0.22, 0.12, z - 0.6 - zc, -552, FY + 2.4, (zc + z - 0.6) / 2, steelC);
        zc = z + 0.6;
        // archway
        b.box(0.2, 2.3, 0.25, -552, FY, z - 0.65, 0xd8d8d8); b.box(0.2, 2.3, 0.25, -552, FY, z + 0.65, 0xd8d8d8);
        b.box(0.3, 0.3, 1.6, -552, FY + 2.3, z, 0xd8d8d8);
        // X-ray tunnel + rollers + divest table
        b.box(4.2, 1.6, 1.2, -557.5, FY, z - 2.4, 0xcfd3d8);
        b.box(0.1, 1.3, 1.0, -555.4, FY + 0.15, z - 2.4, 0x111111);
        b.box(5.5, 0.85, 1.0, -563, FY, z - 2.4, steelC);
        b.box(5.5, 0.85, 1.0, -548, FY, z - 2.4, steelC);
        b.box(0.5, 0.5, 0.05, -557.5, FY + 1.8, z - 1.7, 0x2a6a9a);
        // body scanner booth
        b.box(1.6, 2.4, 1.6, -549, FY, z + 2.2, 0xe2e6ea);
      }
      b.box(0.12, 2.4, ARR_Z - zc, -552, FY, (zc + ARR_Z) / 2, 0x6f8090);
      // overhead "Security" fascia
      b.box(0.4, 1.2, ARR_Z - Z0, -552, 4.5, (Z0 + ARR_Z) / 2, indigo);
    }, 'security');
    {
      let zc = Z0;
      for (const z of LANES) { this._box(-552.3, FY, zc, -551.7, FY + 2.5, z - 0.6, 'security'); zc = z + 0.6; this._box(-560, FY, z - 3, -545.3, FY + 1.6, z - 1.8, 'security'); }
      this._box(-552.3, FY, zc, -551.7, FY + 2.5, ARR_Z, 'security');
    }

    // Departure lounge: seating banks, retail/café islands, gate desks, planters.
    const seatRows = [-532, -527, -500, -495];
    G(0.5, 'lounge', this.M.paint, (b) => {
      for (const x of seatRows) {
        const facing = (x === -532 || x === -500) ? -1 : 1;
        for (let z = -164; z < ARR_Z - 12; z += 11) {
          for (let k = 0; k < 4; k++) {
            const sz = z + k * 2.2 + 1.1;
            b.box(0.75, 0.08, 2.0, x, FY + 0.42, sz, indigo);
            b.box(0.08, 0.55, 2.0, x + facing * 0.38, FY + 0.48, sz, indigo);
            b.box(0.06, 0.42, 0.06, x, FY, sz - 0.9, steelC); b.box(0.06, 0.42, 0.06, x, FY, sz + 0.9, steelC);
          }
          b.box(0.12, 0.1, 8.8, x, FY + 0.32, z + 4.4, steelC);
        }
      }
      for (const z of KIOSKS) {
        b.box(9, 1.1, 6, -516, FY, z, sandstone);
        b.box(9.4, 0.12, 6.4, -516, FY + 1.1, z, 0x5a3a28);
        b.box(0.4, 3.4, 0.4, -520, FY, z - 2.6, crimson); b.box(0.4, 3.4, 0.4, -512, FY, z + 2.6, crimson);
        b.box(10, 0.6, 7, -516, FY + 3.4, z, crimson);
        for (let k = -1; k <= 1; k++) b.cyl(0.3, 0.75, -516 + k * 3, FY + 1.22, z + 1.5, 0xf2ead8, 8);
      }
      for (const st of STANDS) {
        if (!st.contact) continue;
        b.box(1.2, 1.05, 3.5, -485, FY, st.z + 10, desk);
        b.box(0.1, 2.2, 3.0, -483.2, FY, st.z + 10, crimson);
      }
      for (const z of [-152, -82, -10, 58]) {
        b.cyl(1.4, 0.8, -516, FY, z, 0xb08a60, 12);
        b.cyl(1.2, 0.6, -516, FY + 0.8, z, 0x4d6b2f, 10, 0.6);
      }
    }, 'lounge');
    for (const x of seatRows) for (let z = -164; z < ARR_Z - 12; z += 11) this._box(x - 0.45, FY, z, x + 0.45, FY + 1.0, z + 8.8, 'lounge');
    this.seatBanks = [];
    for (const x of seatRows) {
      const facing = (x === -532 || x === -500) ? -1 : 1;
      for (let z = -164; z < ARR_Z - 12; z += 11) this.seatBanks.push({ x, z0: z, z1: z + 8.8, facing, seats: [0, 1, 2, 3].map((k) => z + k * 2.2 + 1.1) });
    }
    for (const z of KIOSKS) this._box(-520.5, FY, z - 3, -511.5, FY + 1.2, z + 3, 'lounge');

    // Arrivals: partition, carousels, bags.
    G(0.8, 'arrivals', this.M.paint, (b) => {
      b.box(X1 - X0 - 14, 3.0, 0.15, (X0 + X1) / 2 + 7, FY, ARR_Z, 0x8fa6b6);
      b.box(X1 - X0, 0.5, 0.3, (X0 + X1) / 2, FY + 3.0, ARR_Z, indigo);
      for (const z of CAROUSELS) {
        b.box(34, 0.9, 1.6, -545, FY, z, 0xb7bcc3);
        b.box(34, 0.45, 2.0, -545, FY, z - 1.9, 0x3b3e43);
        b.box(34, 0.45, 2.0, -545, FY, z + 1.9, 0x3b3e43);
        b.cyl(2.9, 0.45, -562, FY, z, 0x3b3e43, 16);
        b.cyl(2.9, 0.45, -528, FY, z, 0x3b3e43, 16);
        b.box(34, 0.08, 0.15, -545, FY + 0.5, z - 2.95, steelC);
        b.box(34, 0.08, 0.15, -545, FY + 0.5, z + 2.95, steelC);
        b.box(6, 3.5, 2.4, -524, FY, z, 0xcfd3d8);
        for (let k = 0; k < 16; k++) {
          const along = -560 + k * 2.1;
          const side = k % 3 === 0 ? -1 : 1;
          const col = [0x1c1c1c, 0x6b1f2a, 0x22305e, 0x4a4f52, 0x8a6b3a][k % 5];
          b.box(0.7, 0.45, 0.45, along, FY + 0.45, z + side * 1.9, col);
        }
      }
    }, 'arrivals');
    this._box(-586, FY, ARR_Z - 0.2, X1, FY + 3.4, ARR_Z + 0.2, 'arrivals');
    for (const z of CAROUSELS) this._box(-565, FY, z - 3, -521, FY + 1.0, z + 3, 'arrivals');

    // Lighting, signage and wayfinding.
    G(0.9, 'lights', this.lamp, (b) => {
      for (let x = -594; x <= -486; x += 12) b.box(0.6, 0.15, Z1 - Z0 - 8, x, RH - 1.5, 0, 0xffffff);
    });
    G(0.9, 'wayfinding', this.M.paint, (b) => {
      for (const z of [-140, -60, 20]) b.box(0.2, 1.0, 6, -560, 6.5, z, 0x1f2a6e);
      b.box(0.2, 1.2, 10, X0 + 1, 6.5, 117, 0x1f2a6e);
    });
    this.fitout = groups;
    this._el('7.7', 'Terminal fit-out & passenger systems', [X0, 0, Z0, X1, 8, Z1], (p) => {
      this.p['7.7'] = p;
      for (const g of groups) {
        const on = p >= g.threshold;
        g.mesh.visible = on;
        if (g.colKey) this._enable(g.colKey, on);
      }
      if (this.fidsMeshes) for (const m of this.fidsMeshes) m.visible = p >= 0.65;
    }, { kind: 'building', front: () => ({ x: -540, z: -40, radius: 70, kind: 'building' }) });
  }

  /* ------------------------------------------------------------------ FIDS */

  _fids() {
    this.fidsCanvas = document.createElement('canvas');
    this.fidsCanvas.width = 1024; this.fidsCanvas.height = 512;
    this.arrCanvas = document.createElement('canvas');
    this.arrCanvas.width = 1024; this.arrCanvas.height = 512;
    this.fidsTex = new THREE.CanvasTexture(this.fidsCanvas);
    this.arrTex = new THREE.CanvasTexture(this.arrCanvas);
    for (const t of [this.fidsTex, this.arrTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
    const mk = (tex) => { const m = new THREE.MeshBasicMaterial({ map: tex }); m.color.setScalar(1.25); m.toneMapped = false; return m; };
    this.fidsMat = mk(this.fidsTex); this.arrMat = mk(this.arrTex);
    this.disposables.push(this.fidsTex, this.arrTex, this.fidsMat, this.arrMat);
    const dep = new GeoBuilder({ worldUV: false }); const arr = new GeoBuilder({ worldUV: false }); const housing = new GeoBuilder();
    const plane = new THREE.PlaneGeometry(1, 1);
    const m4 = new THREE.Matrix4(); const ps = new THREE.Vector3(); const sc = new THREE.Vector3();
    const screen = (target, x, y, z, ry, w, h) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
      const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      target.add(plane, m4.compose(ps.set(x + n.x * 0.09, y, z + n.z * 0.09), q, sc.set(w, h, 1)), 0xffffff);
      const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry + Math.PI, 0));
      target.add(plane, m4.compose(ps.set(x - n.x * 0.09, y, z - n.z * 0.09), qb, sc.set(w, h, 1)), 0xffffff);
      housing.boxR(Math.abs(n.z) > 0.5 ? w + 0.3 : 0.15, h + 0.3, Math.abs(n.z) > 0.5 ? 0.15 : w + 0.3, x, y, z, 0x1b1d21);
    };
    // Lounge totems and a big board over the security line.
    for (const z of [-152, -82, -10]) {
      housing.box(0.5, 2.6, 0.5, -516, FY, z + 4, 0x1b1d21);
      screen(dep, -516, FY + 3.6, z + 4, Math.PI / 2, 3.2, 1.6);
    }
    screen(dep, -553, 6.6, -110, -Math.PI / 2, 8, 4);
    screen(dep, -553, 6.6, -20, -Math.PI / 2, 8, 4);
    screen(dep, -594, 5.2, -45, Math.PI / 2, 6, 3);
    screen(arr, -575, 4.6, 127, 0, 6, 3);
    screen(arr, -510, 4.6, 127, 0, 6, 3);
    plane.dispose();
    const a = new THREE.Mesh(dep.build(), this.fidsMat); const b = new THREE.Mesh(arr.build(), this.arrMat);
    const h = new THREE.Mesh(housing.build(), this.M.paint);
    for (const m of [a, b, h]) { m.visible = false; this._add(m); this.disposables.push(m.geometry); }
    this.fidsMeshes = [a, b, h];
    this.updateFids(null, { hour: 10, operational: false });
  }

  /**
   * Redraw the flight information displays. `rows` may be strings or
   * { time, flight, dest|from, gate|belt, status } objects (live sim data);
   * without rows a simulated schedule is drawn.
   */
  updateFids(rows, info = {}) {
    const hour = info.hour === undefined ? 10 : info.hour;
    const op = !!info.operational;
    const names = ['Sindhu Air', 'Mehran Wings', 'Kirthar Sky', 'Indus Link', 'Ajrak Air'];
    const codes = ['SDU', 'MHW', 'KTS', 'IDL', 'AJR'];
    const dests = ['Karachi', 'Lahore', 'Islamabad', 'Dubai', 'Jeddah', 'Muscat', 'Doha', 'Quetta', 'Multan', 'Riyadh'];
    const gen = (arrivals) => {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const m = Math.floor(hour * 60) + i * 35 + (arrivals ? 12 : 0);
        const hh = Math.floor((m / 60) % 24); const mm = Math.floor(m % 60 / 5) * 5;
        const k = (Math.floor(m / 35) * 7 + (arrivals ? 3 : 0)) % names.length;
        const status = !op ? 'TRIAL' : i === 0 ? (arrivals ? 'LANDED' : 'BOARDING') : i === 1 ? (arrivals ? 'APPROACH' : 'GATE OPEN') : i === 4 && hour > 15 ? 'DELAYED' : 'ON TIME';
        out.push({ time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, flight: `${codes[k]} ${100 + ((m * 7) % 800)}`, dest: dests[(Math.floor(m / 35) * 3 + (arrivals ? 5 : 0)) % dests.length], gate: arrivals ? `B${1 + (i % 2)}` : `${3 + (i % 4)}`, status });
      }
      return out;
    };
    const depRows = Array.isArray(rows) && rows.length ? rows : gen(false);
    const arrRows = Array.isArray(info.arrivals) && info.arrivals.length ? info.arrivals : gen(true);
    this._drawBoard(this.fidsCanvas, op ? 'DEPARTURES' : 'DEPARTURES — TRIAL OPERATIONS', depRows, 'GATE');
    this._drawBoard(this.arrCanvas, op ? 'ARRIVALS' : 'ARRIVALS — TRIAL OPERATIONS', arrRows, 'BELT');
    this.fidsTex.needsUpdate = true; this.arrTex.needsUpdate = true;
  }

  _drawBoard(canvas, title, rows, gateLabel) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width; const H = canvas.height;
    ctx.fillStyle = '#0b1230'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9b1b30'; ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = '#f4efe4'; ctx.font = 'bold 38px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(title, 24, 34);
    ctx.font = '22px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('HDD · simulated', W - 20, 34); ctx.textAlign = 'left';
    const cols = [24, 150, 330, 640, 760];
    ctx.fillStyle = '#9aa3b8'; ctx.font = 'bold 22px sans-serif';
    ['TIME', 'FLIGHT', 'DESTINATION', gateLabel, 'REMARKS'].forEach((h, i) => ctx.fillText(h, cols[i], 88));
    ctx.font = 'bold 30px monospace';
    rows.slice(0, 9).forEach((r, i) => {
      const y = 128 + i * 42;
      if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, y - 20, W, 42); }
      if (typeof r === 'string') { ctx.fillStyle = '#ffd34d'; ctx.fillText(r.slice(0, 60), cols[0], y); return; }
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(String(r.time || ''), cols[0], y);
      ctx.fillText(String(r.flight || ''), cols[1], y);
      ctx.fillStyle = '#f4f6ff';
      ctx.fillText(String(r.dest || r.from || '').toUpperCase().slice(0, 16), cols[2], y);
      ctx.fillText(String(r.gate || r.belt || ''), cols[3], y);
      const st = String(r.status || '');
      ctx.fillStyle = /DELAY|CANCEL/.test(st) ? '#ff6b5a' : /BOARD|LANDED|GATE/.test(st) ? '#3ddc84' : '#f4f6ff';
      ctx.fillText(st.slice(0, 12), cols[4], y);
    });
  }

  /* ------------------------------------------------------- 7.9 jet bridges */

  _bridges() {
    const b = new GeoBuilder();
    const light = 0xd5d9de; const dark = 0x2f3640;
    this.bridgeBoxes = [];
    for (const st of STANDS.filter((s) => s.contact)) {
      const rz = st.z + 14; const rx = -471;
      const dx = st.noseX + 6.5; const dz = st.z + 3.2;
      b.box(9, 3.2, 3.4, X1 + 4.5 - 0.1, 3.0, rz, light);              // fixed link
      b.box(9, 0.5, 3.6, X1 + 4.5 - 0.1, 5.9, rz, dark);
      b.cyl(0.6, 3.0, rx, 0, rz, 0x8e959c, 10);                         // rotunda column
      b.cyl(2.3, 3.6, rx, 2.9, rz, light, 16);
      const L = Math.hypot(dx - rx, dz - rz);
      const ry = Math.atan2(dx - rx, dz - rz);
      const mx = (rx + dx) / 2; const mz = (rz + dz) / 2;
      b.boxR(3.0, 3.0, L - 2, mx, 4.5, mz, light, 0, ry, 0);
      b.boxR(3.1, 0.7, L - 2, mx, 5.2, mz, dark, 0, ry, 0);
      const lx = rx + (dx - rx) * 0.72; const lz = rz + (dz - rz) * 0.72;
      b.box(0.5, 3.0, 0.5, lx - 1, 0, lz, 0x8e959c); b.box(0.5, 3.0, 0.5, lx + 1, 0, lz, 0x8e959c);
      b.box(3.2, 0.6, 1.2, lx, 0.3, lz, 0x30343a);
      b.cylH(0.45, 0.4, lx - 1.4, 0.45, lz, 0x1a1a1a, 'x', 10); b.cylH(0.45, 0.4, lx + 1.4, 0.45, lz, 0x1a1a1a, 'x', 10);
      b.boxR(4.0, 3.4, 3.2, dx - Math.sin(ry) * 1.2, 4.5, dz - Math.cos(ry) * 1.2, 0xc4c9cf, 0, ry, 0);
      b.boxR(4.2, 0.3, 0.9, dx - Math.sin(ry) * 0.2, 3.0, dz - Math.cos(ry) * 0.2, 0x30343a, 0, ry, 0);
      b.mark();
      this.bridgeBoxes.push(new THREE.Box3(new THREE.Vector3(Math.min(rx, dx) - 3, 2.5, Math.min(rz, dz) - 3), new THREE.Vector3(Math.max(rx, dx) + 3, 7, Math.max(rz, dz) + 3)));
    }
    this.bridges = this._prog(b, this.M.paintMetal, 'jet-bridges', true);
    this._el('7.9', 'Passenger boarding bridges (4)', [-482, 0, STANDS[2].z - 2, -440, 7, STANDS[5].z + 18], (p) => {
      this.p['7.9'] = p;
      this.bridges.setProgress(p);
      const done = p >= 0.999;
      if (this.bridgeLiner) for (const m of this.bridgeLiner) m.visible = done;
      this._enable('bridgeWalk', done);
    },
      { kind: 'building', front: (p) => { const s = STANDS[2 + Math.min(3, Math.floor(p * 4))]; return { x: -462, z: s.z + 8, radius: 25, kind: 'building' }; } });
  }

  /* ------------------------------------------------- sliding glass doors */

  /**
   * Automatic sliding doors: a pair of framed glass leaves per opening. They
   * open with E (sim.interact → toggleDoor), stay open while someone stands in
   * the threshold, and close again after a few seconds. While a door is shut
   * its opening is a solid collider; open, the collider is switched off.
   */
  _doors() {
    this.doors = [];
    this.doorGroup = new THREE.Group();
    this.doorGroup.name = 'terminal-doors';
    this._add(this.doorGroup);
    this.doorFrameMat = this.M.paintMetal;
    this.doorGlass = this.glass.clone();
    this.doorGlass.side = THREE.DoubleSide;
    this.disposables.push(this.doorGlass);
    const leafCache = new Map();
    const leafGeo = (w, h) => {
      const key = `${w}x${h}`;
      if (leafCache.has(key)) return leafCache.get(key);
      const b = new GeoBuilder();
      const f = 0x2e333a;
      b.box(0.08, h, 0.08, 0, 0, -w / 2 + 0.04, f); b.box(0.08, h, 0.08, 0, 0, w / 2 - 0.04, f);
      b.box(0.08, 0.16, w, 0, 0, 0, f); b.box(0.08, 0.1, w, 0, h - 0.1, 0, f);
      // Manifestation band: Ajrak-red squares at eye level (safety marking on full-height glass).
      for (let z = -w / 2 + 0.16; z < w / 2 - 0.1; z += 0.15) b.box(0.075, 0.055, 0.055, 0, 1.45, z, 0x9b1b30);
      for (let z = -w / 2 + 0.235; z < w / 2 - 0.1; z += 0.15) b.box(0.075, 0.03, 0.03, 0, 1.0, z, 0xc9a227);
      const frame = b.build();
      const glass = new THREE.BoxGeometry(0.025, h - 0.26, w - 0.16);
      glass.translate(0, 0.16 + (h - 0.26) / 2, 0);
      const out = { frame, glass };
      leafCache.set(key, out);
      this.disposables.push(frame, glass);
      return out;
    };
    const make = ({ id, name, x, zc, y0, w, h, kind, built }) => {
      const g = leafGeo(w, h);
      const leaves = [-1, 1].map((side) => {
        const leaf = new THREE.Group();
        const fr = new THREE.Mesh(g.frame, this.doorFrameMat); fr.castShadow = true;
        const gl = new THREE.Mesh(g.glass, this.doorGlass);
        leaf.add(fr, gl);
        leaf.position.set(x, y0, zc + side * w / 2);
        leaf.userData.side = side;
        this.doorGroup.add(leaf);
        return leaf;
      });
      const door = { id, name, kind, x, zc, y0, w, h, open: 0, target: 0, timer: 0, leaves, built, solid: null, key: `door-${id}` };
      this._box(x - 0.18, y0, zc - w, x + 0.18, y0 + h, zc + w, door.key);
      door.item = {
        id: `door-${id}`, kind: 'door', name, position: new THREE.Vector3(x, y0 + 1.5, zc), radius: 3.8, vtol: 2.2,
        get prompt() { return door.target > 0.5 ? `Close the ${kind === 'gate' ? 'gate door' : 'doors'}` : `Open the ${kind === 'gate' ? 'gate door' : kind === 'land' ? 'entrance doors' : 'apron doors'}`; },
        available: () => door.built(),
        action: (sim) => this.toggleDoor(id, sim),
      };
      this.doors.push(door);
      return door;
    };
    const glazed = () => (this.p['7.5'] || 0) > 0.6;
    DOORS.forEach((z, i) => make({ id: `land-${i + 1}`, name: i === DOORS.length - 1 ? 'Arrivals exit doors' : `Departures entrance ${i + 1}`, x: X0 - 0.05, zc: z, y0: FY, w: DOOR_W, h: 3.4, kind: 'land', built: glazed }));
    make({ id: 'apron', name: 'Airside apron doors', x: X1 + 0.05, zc: 0, y0: FY, w: 2.0, h: 2.8, kind: 'air', built: glazed });
    for (const st of CONTACT) {
      make({ id: `gate-${gateNo(st)}`, name: `Gate ${gateNo(st)} door`, x: X1 - 0.08, zc: gateZ(st), y0: BRIDGE_Y, w: GATE_HW, h: 2.6, kind: 'gate', built: () => glazed() && (this.p['7.9'] || 0) >= 0.999 && (this.p['7.7'] || 0) >= 0.5 });
    }
    this.interactables = this.doors.map((d) => d.item);
    // Header for the apron door (the landside doors already have frames and canopies).
    const hb = new GeoBuilder();
    hb.box(0.5, 0.35, 4.6, X1 + 0.05, FY + 2.8, 0, 0x2e333a);
    hb.box(0.4, 3.2, 0.3, X1 + 0.05, FY, -2.15, 0x2e333a); hb.box(0.4, 3.2, 0.3, X1 + 0.05, FY, 2.15, 0x2e333a);
    for (const st of CONTACT) {
      const zg = gateZ(st);
      hb.box(0.5, 0.3, GATE_HW * 2 + 0.5, X1 - 0.08, BRIDGE_Y + 2.6, zg, 0x2e333a);
      hb.box(0.4, 2.9, 0.25, X1 - 0.08, BRIDGE_Y, zg - GATE_HW - 0.12, 0x2e333a); hb.box(0.4, 2.9, 0.25, X1 - 0.08, BRIDGE_Y, zg + GATE_HW + 0.12, 0x2e333a);
    }
    this.doorHeaders = new THREE.Mesh(hb.build(), this.M.paintMetal);
    this.doorHeaders.castShadow = true;
    this.doorGroup.add(this.doorHeaders);
    this.disposables.push(this.doorHeaders.geometry);
  }

  doorById(id) { return this.doors.find((d) => d.id === id || d.item.id === id) || null; }

  /** Open (with a hold time) or close a door. Returns the new target state (true = opening). */
  toggleDoor(id, sim = null, force = null) {
    const d = this.doorById(id);
    if (!d || !d.built()) return null;
    const open = force === null ? d.target < 0.5 : !!force;
    d.target = open ? 1 : 0;
    d.timer = open ? 7 : 0;
    const a = sim && sim.audio;
    if (a && a.ui) a.ui(open ? 'open' : 'close');
    else if (this.onDoorSound) this.onDoorSound(open ? 'open' : 'close');
    return open;
  }

  openDoor(id, sim = null) { return this.toggleDoor(id, sim, true); }

  _updateDoors(dt, camera) {
    if (!this.doors) return;
    const cam = camera && camera.position;
    for (const d of this.doors) {
      const built = d.built();
      for (const l of d.leaves) l.visible = built;
      if (!built) {
        d.open = 0; d.target = 0;
        if (d.solid !== false) { this._enable(d.key, false); d.solid = false; }
        continue;
      }
      // Someone in the threshold (camera within a metre or so of the opening) holds it open.
      const near = cam && Math.abs(cam.x - d.x) < 1.4 && Math.abs(cam.z - d.zc) < d.w + 0.4 && cam.y > d.y0 - 0.5 && cam.y < d.y0 + d.h + 1;
      if (d.target > 0.5) {
        d.timer -= dt;
        if (near) d.timer = Math.max(d.timer, 1.5);
        if (d.timer <= 0) {
          d.target = 0;
          if (this.onDoorSound && cam && Math.hypot(cam.x - d.x, cam.z - d.zc) < 30) this.onDoorSound('close');
        }
      }
      const k = d.target > d.open ? 1.5 : 1.1;
      const prev = d.open;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * k);
      if (d.open !== prev || d.solid === null) {
        const e = d.open * d.open * (3 - 2 * d.open);
        for (const l of d.leaves) l.position.z = d.zc + l.userData.side * (d.w / 2 + e * d.w * 0.92);
      }
      const solid = d.open < 0.55;
      if (solid !== d.solid) { this._enable(d.key, solid); d.solid = solid; }
    }
  }

  /* ------------------------------------------------- passport control */

  _passport() {
    this.booths = [];
    const b = new GeoBuilder();
    const zs = [-47, -43, -39];
    zs.forEach((z, i) => {
      const x = -560.3;
      b.box(1.8, 1.15, 2.4, x, FY, z, 0xe9e1d2);                 // counter body
      b.box(1.9, 0.08, 2.5, x, FY + 1.15, z, 0x5a3a28);           // walnut top
      b.box(0.08, 0.9, 2.4, x - 0.9, FY + 1.23, z, 0xbcd3dc);     // glass screen (tinted panel)
      b.box(1.8, 2.5, 0.12, x, FY, z - 1.2, 0x24317a);            // indigo side walls
      b.box(1.8, 2.5, 0.12, x, FY, z + 1.2, 0x24317a);
      b.box(2.0, 0.18, 2.6, x, FY + 2.5, z, 0x9b1b30);            // crimson canopy
      b.box(0.5, 0.32, 0.06, x - 0.45, FY + 1.23, z + 0.5, 0x15171b);  // monitor
      b.box(0.3, 0.1, 0.35, x - 0.62, FY + 1.23, z - 0.3, 0x2b2f36);   // passport reader
      b.box(0.05, 0.05, 0.05, x - 0.62, FY + 1.33, z - 0.3, 0x2ee67a);
      b.box(0.5, 0.06, 0.06, x - 0.45, FY + 1.6, z, 0x2ee67a);    // green "open" light bar
      // Queue line with posts on the landside.
      for (let k = 0; k < 4; k++) b.cyl(0.05, 1.0, x - 3.2 - k * 1.5, FY, z + 1.6, 0x9aa1aa, 6);
      this.booths.push({ n: i + 1, z, position: new THREE.Vector3(x - 1.0, FY + 1.25, z), stand: new THREE.Vector3(x - 1.9, FY, z) });
    });
    const mesh = new THREE.Mesh(b.build(), this.M.paint);
    mesh.receiveShadow = true; mesh.visible = false; mesh.name = 'passport-booths';
    this._add(mesh); this.disposables.push(mesh.geometry);
    for (const z of zs) this._box(-561.2, FY, z - 1.26, -559.4, FY + 2.6, z + 1.26, 'passport');
    const tex = labelTexture('PASSPORT CONTROL', { w: 1024, h: 128, bg: '#1f2a6e', fg: '#f4efe4', font: 'bold 76px sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.875), new THREE.MeshBasicMaterial({ map: tex }));
    sign.material.color.setScalar(1.15);
    sign.position.set(-561.4, FY + 3.5, -43); sign.rotation.y = -Math.PI / 2; sign.visible = false;
    this._add(sign); this.disposables.push(tex, sign.material, sign.geometry);
    this.fitout.push({ threshold: 0.35, mesh, colKey: 'passport' }, { threshold: 0.35, mesh: sign });
  }

  /* ------------------------------------- gate stairs & bridge interiors */

  _gates() {
    this.gates = [];
    const st = new GeoBuilder();
    const liner = new GeoBuilder();
    const lamps = new GeoBuilder();
    const carpet = 0x3a4256; const wallC = 0xdfe1e4; const ceil = 0xf1f1ef; const frame = 0x8c939b;
    const steps = 11; const run = 0.95; const xTop = -482.2; const xBase = xTop - steps * run;
    const rise = (BRIDGE_Y - FY) / steps;
    for (const s of CONTACT) {
      const zg = gateZ(s);
      // Stair: solid treads (stone) with yellow nosings, glass balustrade on steel posts.
      for (let i = 1; i <= steps; i++) {
        const x0 = xBase + (i - 1) * run;
        st.box(xTop - x0, rise * i - 0.0, GATE_HW * 2, (x0 + xTop) / 2, FY, zg, i % 2 ? 0xc7c2b8 : 0xbdb8ae);
        st.box(0.06, 0.012, GATE_HW * 2, x0 + 0.03, FY + rise * i, zg, 0xd6a21e);
        this._box(x0, FY, zg - GATE_HW, xTop, FY + rise * i, zg + GATE_HW, 'gateStairs');
      }
      st.box(X1 - xTop, BRIDGE_Y - FY, GATE_HW * 2, (xTop + X1) / 2, FY, zg, 0xc7c2b8);
      this._box(xTop, FY, zg - GATE_HW, X1, BRIDGE_Y, zg + GATE_HW, 'gateStairs');
      for (const side of [-1, 1]) {
        const zr = zg + side * (GATE_HW + 0.05);
        st.beam(xBase, FY + 1.05, zr, xTop, BRIDGE_Y + 1.05, zr, 0.06, 0xd8dce0);
        st.beam(xTop, BRIDGE_Y + 1.05, zr, X1 - 0.3, BRIDGE_Y + 1.05, zr, 0.06, 0xd8dce0);
        for (let x = xBase + 0.3; x < X1; x += 1.6) {
          const top = x < xTop ? FY + rise * (1 + Math.floor((x - xBase) / run)) : BRIDGE_Y;
          st.box(0.05, 1.05, 0.05, x, top, zr, frame);
        }
        st.beam(xBase, FY + 0.5, zr, xTop, BRIDGE_Y + 0.5, zr, 0.03, 0xb7c9d0);
        this._box(xBase, FY, zr - 0.06, X1, BRIDGE_Y + 1.1, zr + 0.06, 'gateStairs');
      }
      // Gate number board above the desk.
      // Bridge interior (liner): the outer shell is single-sided, so the walk-through
      // surfaces are separate thin boxes with a glazed band between dado and frieze.
      const rx = -471; const rz = zg;
      const dx = s.noseX + 6.5; const dz = s.z + 3.2;
      const H = 2.7;
      const run2 = (ax, az, bx, bz, hw, glazed) => {
        const L = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / L; const uz = (bz - az) / L;
        const ry = Math.atan2(ux, uz);
        const mx = (ax + bx) / 2; const mz = (az + bz) / 2;
        liner.boxR(hw * 2, 0.05, L, mx, BRIDGE_Y - 0.025, mz, carpet, 0, ry, 0);
        liner.boxR(hw * 2, 0.05, L, mx, BRIDGE_Y + H, mz, ceil, 0, ry, 0);
        lamps.boxR(0.32, 0.03, L - 0.6, mx, BRIDGE_Y + H - 0.04, mz, 0xffffff, 0, ry, 0);
        for (const side of [-1, 1]) {
          const px = mx + uz * side * hw; const pz = mz - ux * side * hw;
          if (glazed) {
            liner.boxR(0.05, 0.9, L, px, BRIDGE_Y + 0.45, pz, wallC, 0, ry, 0);
            liner.boxR(0.05, 0.5, L, px, BRIDGE_Y + H - 0.25, pz, wallC, 0, ry, 0);
            liner.boxR(0.07, 0.07, L, px, BRIDGE_Y + 0.92, pz, frame, 0, ry, 0);
            for (let k = 0; k <= L; k += 1.6) liner.boxR(0.07, 1.3, 0.07, px + ux * (k - L / 2), BRIDGE_Y + 1.55, pz + uz * (k - L / 2), frame, 0, ry, 0);
          } else liner.boxR(0.05, H, L, px, BRIDGE_Y + H / 2, pz, wallC, 0, ry, 0);
          // Collision: posts every 0.4 m along each wall.
          for (let k = 0.2; k < L; k += 0.4) {
            const qx = ax + ux * k + uz * side * (hw + 0.12); const qz = az + uz * k - ux * side * (hw + 0.12);
            this._box(qx - 0.16, BRIDGE_Y, qz - 0.16, qx + 0.16, BRIDGE_Y + 2.6, qz + 0.16, 'bridgeWalk');
          }
        }
        return { ux, uz, L };
      };
      run2(X1 + 0.1, rz, rx - 2.0, rz, 1.5, false);
      const tun = run2(rx + ((dx - rx) / Math.hypot(dx - rx, dz - rz)) * 2.0, rz + ((dz - rz) / Math.hypot(dx - rx, dz - rz)) * 2.0, dx, dz, 1.4, true);
      // Rotunda: floor disc + wall panels with two openings.
      liner.cyl(2.25, 0.05, rx, BRIDGE_Y - 0.05, rz, carpet, 18);
      liner.cyl(2.25, 0.05, rx, BRIDGE_Y + H, rz, ceil, 18);
      const openA = Math.PI; const openB = Math.atan2(tun.uz, tun.ux);
      const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        if (angDist(a, openA) < 0.72 || angDist(a, openB) < 0.72) continue;
        const px = rx + Math.cos(a) * 2.2; const pz = rz + Math.sin(a) * 2.2;
        liner.boxR(0.6, H, 0.05, px, BRIDGE_Y + H / 2, pz, wallC, 0, -a + Math.PI / 2, 0);
        this._box(px - 0.22, BRIDGE_Y, pz - 0.22, px + 0.22, BRIDGE_Y + 2.6, pz + 0.22, 'bridgeWalk');
      }
      // Floors (AABBs at the upper level: nothing on the apron is that tall).
      this._box(X1, BRIDGE_Y - 0.3, rz - 1.5, rx, BRIDGE_Y, rz + 1.5, 'bridgeWalk');
      this._box(rx - 2.3, BRIDGE_Y - 0.3, rz - 2.3, rx + 2.3, BRIDGE_Y, rz + 2.3, 'bridgeWalk');
      this._box(Math.min(rx, dx) - 0.6, BRIDGE_Y - 0.3, Math.min(rz, dz) - 0.6, Math.max(rx, dx) + 0.6, BRIDGE_Y, Math.max(rz, dz) + 0.6, 'bridgeWalk');
      // Cab: a short floor from the bridge head to the aircraft door (sill ≈ 2.85 m) with side rails.
      const doorX = s.noseX + 6.3; const doorZ = s.z + 2.0;
      liner.box(2.4, 0.05, dz - doorZ + 0.6, doorX, BRIDGE_Y - 0.05, (dz + doorZ) / 2 + 0.2, carpet);
      this._box(doorX - 1.2, BRIDGE_Y - 0.3, doorZ - 0.1, doorX + 1.2, BRIDGE_Y, dz + 0.8, 'bridgeWalk');
      for (const side of [-1, 1]) {
        liner.box(0.06, 2.4, dz - doorZ + 0.6, doorX + side * 1.25, BRIDGE_Y, (dz + doorZ) / 2 + 0.2, 0x30343a);
        this._box(doorX + side * 1.25 - 0.1, BRIDGE_Y, doorZ - 0.1, doorX + side * 1.25 + 0.1, BRIDGE_Y + 2.4, dz + 0.4, 'bridgeWalk');
      }
      this.gates.push({
        n: gateNo(s), stand: s, z: zg,
        desk: new THREE.Vector3(-485.6, FY + 1.15, s.z + 10),
        deskStand: new THREE.Vector3(-487.4, FY, s.z + 10),
        stairBase: new THREE.Vector3(xBase - 1.0, FY, zg),
        stairTop: new THREE.Vector3(xTop + 0.5, BRIDGE_Y, zg),
        doorId: `gate-${gateNo(s)}`,
        rotunda: new THREE.Vector3(rx, BRIDGE_Y, rz),
        head: new THREE.Vector3(dx, BRIDGE_Y, dz),
        aircraftDoor: new THREE.Vector3(doorX, BRIDGE_Y, doorZ),
      });
    }
    const stairs = new THREE.Mesh(st.build(), this.M.paint);
    stairs.receiveShadow = true; stairs.castShadow = true; stairs.visible = false; stairs.name = 'gate-stairs';
    this._add(stairs); this.disposables.push(stairs.geometry);
    this.fitout.push({ threshold: 0.5, mesh: stairs, colKey: 'gateStairs' });
    // Gate number boards above the desks.
    for (const s of CONTACT) {
      const tex = labelTexture(`GATE ${gateNo(s)}`, { w: 512, h: 128, bg: '#1f2a6e', fg: '#ffd34d', font: 'bold 84px sans-serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
      m.material.color.setScalar(1.2);
      m.position.set(-484.0, FY + 3.3, s.z + 10); m.rotation.y = -Math.PI / 2; m.visible = false;
      this._add(m); this.disposables.push(tex, m.material, m.geometry);
      this.fitout.push({ threshold: 0.5, mesh: m });
    }
    const linerMesh = new THREE.Mesh(liner.build(), this.M.paint);
    linerMesh.receiveShadow = true; linerMesh.name = 'bridge-interiors';
    const lampMesh = new THREE.Mesh(lamps.build(), this.lamp);
    lampMesh.name = 'bridge-lamps';
    for (const m of [linerMesh, lampMesh]) { m.visible = false; this._add(m); this.disposables.push(m.geometry); }
    this.bridgeLiner = [linerMesh, lampMesh];
  }

  /** Where the journey and the interaction system find desks, booths, lanes, gates, screens and seats. */
  get spots() {
    if (this._spots) return this._spots;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this._spots = {
      checkin: ISLANDS.flatMap((z, i) => [-1, 1].map((side) => ({
        island: 'ABCD'[i], side, z: z + side * 2.9, segment: [-584, z + side * 2.9, -570, z + side * 2.9], y: FY + 1.15,
        stand: V(-577, FY, z + side * 3.6),
      }))),
      booths: this.booths,
      lanes: LANES.map((z, i) => ({ n: i + 1, z, segment: [-565, z - 1.85, -560.6, z - 1.85], y: FY + 1.0, stand: V(-562.5, FY, z - 1.0), arch: V(-552, FY, z) })),
      gates: this.gates,
      fids: [
        ...[-152, -82, -10].flatMap((z) => [V(-516.2, FY + 3.6, z + 4), V(-515.8, FY + 3.6, z + 4)]),
        V(-553.2, 6.6, -110), V(-553.2, 6.6, -20), V(-593.8, 5.2, -45),
      ],
      seatBanks: this.seatBanks || [],
    };
    return this._spots;
  }

  fitoutReady(level = 0.9) { return (this.p['7.7'] || 0) >= level && (this.p['7.5'] || 0) > 0.6; }

  /* ------------------------------------------------------------------ POIs */

  _pois() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.pois.push(
      { id: 'poi-terminal-checkin', name: 'Check-in islands', wbsId: '7.7', position: V(-594, FY + 1.7, -81), radius: 10,
        text: 'Four check-in islands of 14 desks each with weigh-scales and bag belts feed the baggage system. Fit-out (WBS 7.7) follows the building envelope; desks, belts and IT are tested in operational readiness trials (ORAT).' },
      { id: 'poi-terminal-security', name: 'Security screening lanes', wbsId: '7.7', position: V(-558, FY + 1.7, -45), radius: 9,
        text: 'Six screening lanes: divest tables, X-ray tunnels, walk-through archways and body scanners. Lane throughput is a key benefit metric the operations mode measures.' },
      { id: 'poi-terminal-lounge', name: 'Departure lounge & FIDS', wbsId: '7.7', position: V(-512, FY + 1.7, -82), radius: 12,
        text: 'The departure lounge under the scalloped roof. The flight information displays redraw live from the simulation every few seconds (simulated airlines and schedule).' },
      { id: 'poi-terminal-baggage', name: 'Baggage reclaim', wbsId: '7.7', position: V(-575, FY + 1.7, 127), radius: 12,
        text: 'Two reclaim carousels fed from the airside baggage hall. Systems integration and testing of the baggage handling system is a classic critical-path risk in terminal projects.' },
      { id: 'poi-terminal-mangho', name: 'Mangho windcatchers', wbsId: '7.4', position: V(-604, FY + 1.7, 27), radius: 14,
        text: 'Hyderabad was once famous for its roof-top "mangho" windcatchers facing the cool south-westerly breeze. The concept roof re-uses the idea for passive ventilation, with pierced Ajrak-pattern screens on the open faces.' },
      { id: 'poi-jet-bridge', name: 'Passenger boarding bridge', wbsId: '7.9', position: V(-476, FY + 1.7, STANDS[3].z + 18), radius: 12,
        text: 'Four apron-drive boarding bridges serve the central contact stands; the remaining stands are remote, served by bus and stairs.' },
    );
  }

  /* -------------------------------------------------------------- runtime */

  contains(pos) {
    return (this.p['7.4'] || 0) >= 0.5 && pos.x > X0 && pos.x < X1 && pos.z > Z0 && pos.z < Z1 && pos.y < RH;
  }

  onBridge(pos) {
    if (!(this.p['7.9'] > 0)) return false;
    return this.bridgeBoxes.some((b) => b.containsPoint(pos));
  }

  setOperational(on) { this.operational = on; }

  update(dt, t, env) {
    this._updateDoors(dt, env.camera);
    const fit = this.p['7.7'] || 0;
    const lit = env.lights * (fit >= 0.9 ? 1 : fit > 0.3 ? 0.35 : 0);
    this.glass.emissiveIntensity = this.glassSide.emissiveIntensity = lit * 0.55;
    this.windGlow.opacity = env.lights * ((this.p['7.4'] || 0) >= 1 ? 0.9 : 0);
    this.windGlow.color.setRGB(1.6, 0.85, 0.35).multiplyScalar(0.6 + 0.4 * env.lights);
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    if (this.pad) this.pad.geometry.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
