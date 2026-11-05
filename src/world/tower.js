import * as THREE from 'three';
import { MASTERPLAN } from './layout.js';
import { GeoBuilder, ProgressiveMesh, LightField } from './props.js';

/**
 * Air traffic control tower (simulated concept): a lobby/equipment base, a
 * slip-formed tapering shaft (WBS 6.3, rises with progress) and an octagonal
 * glazed cab (WBS 6.4) at 42 m with controller consoles. The cab is
 * walkable; a lift POI at the base door teleports up and back.
 */

const TW = MASTERPLAN.tower;
const CX = TW.x; const CZ = TW.z;
const BASE_H = 6;
const SHAFT_TOP = TW.cabFloor - 4;          // equipment floor below the cab
const CF = TW.cabFloor + 0.3;               // cab finished floor level
const R_IN = TW.cabSize / 2 - 0.4;           // across-flats inner radius of the glass

function radarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#031a14'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(80,255,170,0.55)'; ctx.lineWidth = 2;
  for (let r = 30; r < 128; r += 30) { ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
  const g = ctx.createLinearGradient(128, 128, 240, 60);
  g.addColorStop(0, 'rgba(90,255,180,0.8)'); g.addColorStop(1, 'rgba(90,255,180,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(128, 128); ctx.arc(128, 128, 120, -0.6, -0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd34d';
  for (const [x, y] of [[170, 90], [88, 160], [150, 200], [60, 70]]) { ctx.fillRect(x, y, 5, 5); }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(110, 200); ctx.lineTo(146, 56); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tower {
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.M;
    this.collision = ctx.collision;
    this.group = new THREE.Group();
    this.group.name = 'atc-tower';
    ctx.scene.add(this.group);
    this.elements = [];
    this.disposables = [];
    this.lightFields = [];
    this.pois = [];
    this.col = { shaft: [], cab: [] };
    this.p = { '6.3': 0, '6.4': 0 };

    this._shaft();
    this._cab();
    this._poisBuild();
    this.cabView = {
      position: new THREE.Vector3(CX + 6.2, CF + 1.7, CZ),
      target: new THREE.Vector3(0, 0, -120),
    };
  }

  _add(o) { this.group.add(o); return o; }
  _prog(b, m, name, shadows = true) {
    const pm = new ProgressiveMesh(b, m, { shadows, name });
    this._add(pm.mesh); this.disposables.push(pm); return pm;
  }

  _shaft() {
    const b = new GeoBuilder();
    const white = 0xeee9df; const band = 0x9b1b30;
    // Base: lobby + equipment block, entrance on the airside (+X) face.
    b.box(24, BASE_H, 24, CX, 0, CZ, 0xe6dccb);
    b.box(25, 0.6, 25, CX, BASE_H, CZ, 0xcdbfa8);
    b.box(0.3, 3.2, 5, CX + 12.05, 0, CZ, 0x2f3a48);
    b.box(1.2, 0.3, 7, CX + 12.6, 3.4, CZ, band);
    for (let z = -9; z <= 9; z += 4.5) if (Math.abs(z) > 3) b.box(0.2, 2.2, 2.6, CX + 12.02, 1.6, CZ + z, 0x4a6274);
    b.mark();
    const segs = 16;
    const h = SHAFT_TOP - BASE_H;
    for (let i = 0; i < segs; i++) {
      const y0 = BASE_H + (i * h) / segs; const t0 = i / segs; const t1 = (i + 1) / segs;
      const r = 4.2 - t0 * 0.9;
      b.cyl(r, h / segs, CX, y0, CZ, i % 4 === 3 ? 0xdcd5c8 : white, 12, (4.2 - t1 * 0.9) / r);
      // Glazed lift strip facing the apron.
      b.box(0.3, h / segs - 0.2, 1.4, CX + r - 0.05, y0 + 0.1, CZ, 0x3e5f72);
      b.mark();
    }
    // Equipment floor with louvres, then the cab soffit.
    b.cyl(5.2, 4, CX, SHAFT_TOP, CZ, 0xd8d0c2, 8);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.box(0.1, 2.6, 1.4, CX + Math.cos(a) * 5.25, SHAFT_TOP + 0.7, CZ + Math.sin(a) * 5.25, 0x5a6068, -a);
    }
    b.mark();
    this.shaft = this._prog(b, this.M.paintMap, 'tower-shaft', true);
    // Slip-form deck that climbs with the shaft while it is being cast.
    const sf = new GeoBuilder();
    sf.cyl(6.5, 0.4, 0, 0, 0, 0x8a6a3a, 12);
    sf.cyl(4.6, 2.2, 0, -2.2, 0, 0x6e7276, 12);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; sf.box(0.1, 1.1, 0.1, Math.cos(a) * 6.3, 0.4, Math.sin(a) * 6.3, 0xffb000); }
    sf.cyl(6.4, 0.08, 0, 1.4, 0, 0xffb000, 16);
    this.slipform = new THREE.Mesh(sf.build(), this.M.paint);
    this.slipform.castShadow = true;
    this.slipform.visible = false;
    this._add(this.slipform);
    this.disposables.push(this.slipform.geometry);

    if (this.collision) {
      this.col.shaft.push(this.collision.addBox(CX - 12, 0, CZ - 12, CX + 12, BASE_H + 0.6, CZ + 12, 'tower-base'));
      this.col.shaft.push(this.collision.addBox(CX - 4, BASE_H, CZ - 4, CX + 4, SHAFT_TOP + 4, CZ + 4, 'tower-shaft'));
    }
    this.elements.push({
      id: '6.3', name: 'ATC tower — base & slip-formed shaft', kind: 'building',
      box: new THREE.Box3(new THREE.Vector3(CX - 12, 0, CZ - 12), new THREE.Vector3(CX + 12, SHAFT_TOP + 4, CZ + 12)),
      apply: (p) => {
        this.p['6.3'] = p;
        this.shaft.setProgress(p);
        const top = BASE_H + (SHAFT_TOP - BASE_H) * Math.min(1, Math.max(0, (p - 1 / 18) / (16 / 18)));
        this.slipform.visible = p > 0.06 && p < 0.97;
        this.slipform.position.set(CX, top + 0.3, CZ);
        if (this.collision) this.collision.setDisabled(this.col.shaft, p < 0.06);
        if (this.collision) this.collision.setDisabled([this.col.shaft[1]], p < 0.9);
      },
      front: () => ({ x: CX + 14, z: CZ, radius: 25, kind: 'building' }),
    });
  }

  _cab() {
    const frame = new GeoBuilder(); const glassB = new GeoBuilder({ worldUV: false }); const fit = new GeoBuilder(); const screens = new GeoBuilder({ worldUV: false });
    const steel = 0x3a3f46;
    // Floor slab & soffit.
    frame.cyl(TW.cabSize / 2 + 0.6, 0.6, CX, TW.cabFloor - 0.3, CZ, 0xd8d0c2, 8);
    frame.mark();
    // Glass: 8 outward-leaning panels.
    const n = 8; const yb = CF; const yt = CF + 4.6;
    const rb = R_IN / Math.cos(Math.PI / n); const rt = rb + 0.9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a0 = ((i + 0.5) / n) * Math.PI * 2; const a1 = ((i + 1.5) / n) * Math.PI * 2;
      const p0b = [CX + Math.cos(a0) * rb, yb, CZ + Math.sin(a0) * rb]; const p1b = [CX + Math.cos(a1) * rb, yb, CZ + Math.sin(a1) * rb];
      const p0t = [CX + Math.cos(a0) * rt, yt, CZ + Math.sin(a0) * rt]; const p1t = [CX + Math.cos(a1) * rt, yt, CZ + Math.sin(a1) * rt];
      pts.push(...p0b, ...p1b, ...p1t, ...p0b, ...p1t, ...p0t);
      frame.beam(p0b[0], yb, p0b[2], p0t[0], yt, p0t[2], 0.22, steel);
      frame.beam(p0b[0], yb, p0b[2], p1b[0], yb, p1b[2], 0.25, steel);
      frame.beam(p0t[0], yt, p0t[2], p1t[0], yt, p1t[2], 0.25, steel);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gg.computeVertexNormals();
    const uv = new Float32Array((pts.length / 3) * 2);
    gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    glassB.add(gg, new THREE.Matrix4(), 0xffffff);
    gg.dispose();
    // Roof, parapet, antennas, beacon mast.
    frame.cyl(rt + 0.8, 0.7, CX, yt, CZ, 0xe8e2d6, 8);
    frame.cyl(rt + 0.85, 0.3, CX, yt + 0.7, CZ, 0x9b1b30, 8);
    frame.cyl(0.18, 7, CX, yt + 1, CZ, 0xcfcfcf, 6);
    frame.box(2.2, 0.08, 0.08, CX, yt + 5.5, CZ, 0xcfcfcf);
    frame.cyl(0.6, 0.6, CX + 3, yt + 1, CZ - 2, 0xf2f2f2, 10); frame.cyl(0.9, 0.15, CX + 3, yt + 1.6, CZ - 2, 0xf2f2f2, 10);
    frame.box(1.4, 1.0, 1.0, CX - 3, yt + 1, CZ + 2, 0xbcbcbc);
    frame.mark();
    this.cabFrame = this._prog(frame, this.M.paintMetal, 'tower-cab-frame', true);
    this.cabGlassMat = this.M.glass.clone();
    this.cabGlassMat.side = THREE.DoubleSide;
    this.cabGlassMat.opacity = 0.38;
    this.cabGlassMat.emissive = new THREE.Color(0x9fe0c8);
    this.cabGlassMat.emissiveIntensity = 0;
    if (this.ctx.envMap) this.cabGlassMat.envMap = this.ctx.envMap;
    this.disposables.push(this.cabGlassMat);
    glassB.mark();
    this.cabGlass = this._prog(glassB, this.cabGlassMat, 'tower-cab-glass', false);

    // Interior: tiled floor, core, console ring, chairs.
    fit.cyl(R_IN, 0.05, CX, CF - 0.04, CZ, 0x4a4f58, 8);
    fit.cyl(2.0, 4.5, CX, CF, CZ, 0xe2dcd0, 12);
    fit.box(1.2, 2.3, 0.1, CX - 2.0, CF, CZ, 0x8b9096);
    this.consoleBoxes = [];
    for (let i = 0; i < 8; i++) {
      if (i === 4) continue;  // walkway to the lift door (west)
      const a = (i / 8) * Math.PI * 2;
      const r = 6.3;
      const x = CX + Math.cos(a) * r; const z = CZ + Math.sin(a) * r;
      fit.box(1.0, 0.95, 4.6, x, CF, z, 0x2c3138, -a);
      fit.box(0.2, 0.6, 4.4, x + Math.cos(a) * 0.45, CF + 0.95, z + Math.sin(a) * 0.45, 0x1d2025, -a);
      const cx2 = CX + Math.cos(a) * 5.0; const cz2 = CZ + Math.sin(a) * 5.0;
      fit.cyl(0.28, 0.5, cx2, CF, cz2, 0x222222, 8);
      fit.box(0.55, 0.12, 0.55, cx2, CF + 0.5, cz2, 0x24317a);
      fit.box(0.12, 0.6, 0.55, cx2 - Math.cos(a) * 0.3, CF + 0.6, cz2 - Math.sin(a) * 0.3, 0x24317a, -a);
      this.consoleBoxes.push([x - 1.1, z - 1.1, x + 1.1, z + 1.1]);
      for (const k of [-1.3, 0, 1.3]) {
        const sx = x + Math.cos(a) * 0.3 - Math.sin(a) * k; const sz = z + Math.sin(a) * 0.3 + Math.cos(a) * k;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, -a - Math.PI / 2, 0, 'YXZ'));
        screens.add(new THREE.PlaneGeometry(1.0, 0.55), new THREE.Matrix4().compose(new THREE.Vector3(sx, CF + 1.25, sz), q, new THREE.Vector3(1, 1, 1)), 0xffffff);
      }
    }
    fit.mark(); screens.mark();
    this.cabFit = this._prog(fit, this.M.paint, 'tower-cab-fitout', false);
    this.radarTex = radarTexture();
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.radarTex, side: THREE.DoubleSide });
    this.screenMat.color.setScalar(1.4);
    this.screenMat.toneMapped = false;
    this.disposables.push(this.radarTex, this.screenMat);
    this.cabScreens = this._prog(screens, this.screenMat, 'tower-cab-screens', false);

    this.beacon = new LightField('tower-obstacle', { minPx: 2.2 });
    this.beacon.add(CX, CF + 4.6 + 8.2, CZ, new THREE.Color(6, 0.3, 0.2), 0.9, 2, 0.0);
    this.beacon.add(CX + 5, CF + 5.5, CZ + 5, new THREE.Color(6, 0.3, 0.2), 0.5, 2, 0.5);
    this.beacon.add(CX - 5, CF + 5.5, CZ - 5, new THREE.Color(6, 0.3, 0.2), 0.5, 2, 0.5);
    this.beacon.finalize(this.group);
    this.lightFields.push({ field: this.beacon, kind: 'obstacle', id: '6.4' });

    if (this.collision) {
      const c = this.collision; const L = this.col.cab;
      const R = R_IN;
      L.push(c.addBox(CX - R - 0.6, CF - 0.6, CZ - R - 0.6, CX + R + 0.6, CF, CZ + R + 0.6, 'cab-floor'));
      L.push(c.addBox(CX - R - 0.6, CF, CZ - R - 0.6, CX - R, CF + 4.5, CZ + R + 0.6, 'cab-wall'));
      L.push(c.addBox(CX + R, CF, CZ - R - 0.6, CX + R + 0.6, CF + 4.5, CZ + R + 0.6, 'cab-wall'));
      L.push(c.addBox(CX - R, CF, CZ - R - 0.6, CX + R, CF + 4.5, CZ - R, 'cab-wall'));
      L.push(c.addBox(CX - R, CF, CZ + R, CX + R, CF + 4.5, CZ + R + 0.6, 'cab-wall'));
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        L.push(c.addBox(CX + (sx < 0 ? -R : R - 2.6), CF, CZ + (sz < 0 ? -R : R - 2.6), CX + (sx < 0 ? -R + 2.6 : R), CF + 4.5, CZ + (sz < 0 ? -R + 2.6 : R), 'cab-corner'));
      }
      L.push(c.addBox(CX - 2, CF, CZ - 2, CX + 2, CF + 4.5, CZ + 2, 'cab-core'));
      for (const b of this.consoleBoxes) L.push(c.addBox(b[0], CF, b[1], b[2], CF + 1.0, b[3], 'cab-console'));
      c.setDisabled(L, true);
    }

    this.elements.push({
      id: '6.4', name: 'ATC tower — glazed visual control room (cab)', kind: 'building',
      box: new THREE.Box3(new THREE.Vector3(CX - 9, SHAFT_TOP, CZ - 9), new THREE.Vector3(CX + 9, CF + 13, CZ + 9)),
      apply: (p) => {
        this.p['6.4'] = p;
        const shaftDone = this.p['6.3'] >= 0.98;
        this.cabFrame.setProgress(shaftDone ? Math.min(1, p * 2) : 0);
        this.cabGlass.setProgress(shaftDone && p > 0.45 ? 1 : 0);
        this.cabFit.setProgress(shaftDone && p > 0.7 ? 1 : 0);
        this.cabScreens.setProgress(shaftDone && p > 0.9 ? 1 : 0);
        this.beacon.setProgress(shaftDone && p > 0.5 ? 1 : 0);
        if (this.collision) this.collision.setDisabled(this.col.cab, !(shaftDone && p > 0.45));
        this._updateLift();
      },
      front: () => ({ x: CX + 14, z: CZ + 6, radius: 25, kind: 'building' }),
    });
  }

  get cabReady() { return this.p['6.3'] >= 0.98 && this.p['6.4'] >= 0.45; }

  _poisBuild() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.liftUp = {
      id: 'poi-tower-lift', name: 'Tower lift (ground floor)', wbsId: '6.3', position: V(CX + 14, 1.7, CZ), radius: 6,
      text: 'The tower lift runs up the glazed strip on the shaft to the visual control room at 42 m.',
    };
    this.liftDown = {
      id: 'poi-tower-lift-down', name: 'Tower lift (cab level)', wbsId: '6.4', position: V(CX - 3.2, CF + 1.7, CZ), radius: 2.2,
      text: 'Lift back down to the ground floor.', prompt: 'Press E to take the lift down',
      teleport: { x: CX + 15, y: 0, z: CZ, yaw: -Math.PI / 2 }, teleportLabel: 'Tower ground floor',
    };
    this.cabPoi = {
      id: 'poi-tower-cab', name: 'Visual control room', wbsId: '6.4', position: V(CX + 5.2, CF + 1.7, CZ - 2), radius: 4,
      text: 'The cab gives controllers an unobstructed view of both runway ends, the parallel taxiway and every stand. Consoles carry radar, flight strips and the AGL control panel. Press C-view in Operations mode to watch traffic from here.',
    };
    this.pois.push(this.liftUp, this.liftDown, this.cabPoi);
    this._updateLift();
  }

  _updateLift() {
    if (!this.liftUp) return;
    if (this.cabReady) {
      this.liftUp.prompt = 'Press E to take the lift to the control cab';
      this.liftUp.teleport = { x: CX + 4.2, y: CF, z: CZ, yaw: -Math.PI / 2 };
      this.liftUp.teleportLabel = 'ATC visual control room — 42 m';
    } else {
      this.liftUp.prompt = 'Press E to inspect the tower (lift not yet commissioned)';
      delete this.liftUp.teleport;
    }
  }

  containsCab(pos) {
    return this.cabReady && pos.y > CF - 0.5 && pos.y < CF + 5 && Math.hypot(pos.x - CX, pos.z - CZ) < R_IN + 0.8;
  }

  update(dt, t, env) {
    this.cabGlassMat.emissiveIntensity = env.lights * 0.18;
    this.screenMat.color.setScalar(1.0 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2)));
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    this.beacon.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
