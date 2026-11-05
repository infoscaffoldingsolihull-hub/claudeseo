import * as THREE from 'three';
import { makeRng } from '../engine/noise.js';
import { RUNWAY, MASTERPLAN } from './layout.js';
import { GeoBuilder, ProgressiveMesh, InstancedSet, LightField, layered, labelTexture } from './props.js';

/**
 * Airside: the existing (worn) runway, the simulated extension and widening
 * built layer by layer, markings (ICAO Annex 14 style), taxiways, apron,
 * stands, AGL, navaids, perimeter wall and the encroachment pockets.
 *
 * Vertical stacking of coplanar pavements is resolved with polygon-offset
 * levels (layered()), so every layer stays crisp from the walk camera to the
 * 2 km overview. Physical heights are tiny (cm) so nothing floats.
 */

const R = RUNWAY;
const MP = MASTERPLAN;
const THR02 = R.extensionEndZ;         // final RWY 02 threshold (south)
const THR20 = R.threshold20Z;          // RWY 20 threshold (north)
const DISP20 = THR20 - 120;            // pavement end (displaced-threshold area)
const PAD20 = DISP20 - 60;             // blast pad end (north)
const PAD02 = THR02 + R.blastPadLength;
const HW = R.targetWidth / 2;          // 22.5
const OHW = R.existingWidth / 2;       // 15
const SHW = HW + R.shoulderWidth;      // 30
const TWX = MP.parallelTaxiway.x;
const TWW = MP.parallelTaxiway.width;

const Y = { earth: 0.03, sub: 0.07, base: 0.1, old: 0.1, oldMark: 0.11, top: 0.13, mark: 0.145 };

/** Stand geometry shared with A4 traffic (nose-in, nose towards the terminal, −X). */
export const STANDS = (() => {
  const a = MP.apron;
  const out = [];
  for (let i = 0; i < MP.stands; i++) {
    const z = a.z0 + ((i + 0.5) * (a.z1 - a.z0)) / MP.stands;
    out.push({
      id: `S${i + 1}`, index: i, x: -452, z, noseX: -452,
      yaw: Math.PI / 2,                          // rotation.y for a model whose nose points −Z
      heading: new THREE.Vector3(-1, 0, 0),
      taxilaneX: -325,
      contact: i >= 2 && i < 2 + MP.jetBridges,  // central stands get jet bridges
    });
  }
  return out;
})();

export const TAXILANE_X = -325;

function textQuadTexture(text, { color = '#ffffff', w = 256, h = 256, font = 'bold 230px sans-serif', sx = 0.55 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, h / 2 + h * 0.04);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rubberTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const ctx = c.getContext('2d');
  const rng = makeRng(77);
  ctx.clearRect(0, 0, 128, 512);
  for (let i = 0; i < 260; i++) {
    const x = 64 + (rng() - 0.5) * (rng() < 0.7 ? 46 : 100);
    const y = rng() * 512;
    const len = 30 + rng() * 140;
    ctx.strokeStyle = `rgba(8,8,8,${0.08 + rng() * 0.22})`;
    ctx.lineWidth = 1 + rng() * 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 3, y + len); ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Add parts sorted by `z` (desc when southFirst) with a mark after each. */
function addSorted(builder, parts, southFirst = true) {
  parts.sort((a, b) => (southFirst ? b.z - a.z : a.z - b.z));
  for (const p of parts) { p.fn(builder); builder.mark(); }
}

export class Airfield {
  /**
   * @param ctx { scene, M (materials), quality, collision, layerCache }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.M = ctx.M;
    this.group = new THREE.Group();
    this.group.name = 'airfield';
    this.scene.add(this.group);
    this.elements = [];
    this.lightFields = [];
    this.disposables = [];
    this.animated = [];
    this.rng = makeRng(2027);
    const M = this.M;
    const L = (m, lvl) => layered(m, lvl, ctx.layerCache);
    this.mat = {
      oldAsphalt: L(Object.assign(M.asphaltOld.clone(), { vertexColors: true }), 4),
      newAsphalt: L(Object.assign(M.asphaltNew.clone(), { vertexColors: true }), 6),
      taxiAsphalt: L(Object.assign(M.asphaltNew.clone(), { vertexColors: true }), 4),
      oldLink: L(Object.assign(M.asphaltOld.clone(), { vertexColors: true }), 3),
      shoulder: L(Object.assign(M.asphaltNew.clone(), { vertexColors: true }), 2),
      apron: L(Object.assign(M.concreteApron.clone(), { vertexColors: true }), 4),
      soilCut: L(M.soilCut, 1), soilFill: L(M.soilFill, 1),
      sub: L(M.gravelSubbase, 2), base: L(M.crushedBase, 3),
      markNew: L(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }), 7),
      markOld: L(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 5),
      service: L(Object.assign(M.asphaltOld.clone(), { vertexColors: true }), 5),
      road: L(Object.assign(M.asphaltOld.clone(), { vertexColors: true }), 1),
      paint: M.paint,
      metal: M.paintMetal,
    };
    for (const k of ['oldAsphalt', 'newAsphalt', 'taxiAsphalt', 'oldLink', 'shoulder', 'apron', 'service', 'road', 'markNew', 'markOld']) this.disposables.push(this.mat[k]);

    this._buildExistingRunway();
    this._buildExtension();
    this._buildOverlayAndWidening();
    this._buildMarkings();
    this._buildBlastPads();
    this._buildTaxiways();
    this._buildApron();
    this._buildDrainage();
    this._buildRunwayLights();
    this._buildApproachLights();
    this._buildPapi();
    this._buildTaxiwayLights();
    this._buildNavaids();
    this._buildWindsocks();
    this.obstacle.finalize(this.group);
    this.lightFields.push({ field: this.obstacle, kind: 'obstacle', id: null, always: true });
    this._buildPerimeter();
    this._buildEncroachments();
  }

  _add(obj) { this.group.add(obj); return obj; }

  _el(id, name, box, apply, extra = {}) {
    const el = { id, name, box: new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4], box[5])), apply, ...extra };
    this.elements.push(el);
    return el;
  }

  _prog(builder, material, name, shadows = false) {
    const pm = new ProgressiveMesh(builder, material, { shadows, receive: true, name });
    this._add(pm.mesh);
    this.disposables.push(pm);
    return pm;
  }

  /* ----------------------------------------------------- existing runway */

  _buildExistingRunway() {
    const b = new GeoBuilder();
    const rng = this.rng;
    // Mosaic of repair panels: the existing pavement has been patched for decades.
    for (let z = THR20; z < R.threshold02Z - 0.01; z += 30) {
      for (let x = -OHW; x < OHW - 0.01; x += 7.5) {
        const r = rng();
        const t = r < 0.08 ? 0.78 : r < 0.16 ? 1.12 : 0.93 + rng() * 0.1;
        b.quad(x, z, x + 7.5, Math.min(z + 30, R.threshold02Z), Y.old, new THREE.Color(t, t, t * 0.98));
      }
    }
    // A short, narrow, old link taxiway to the existing apron.
    const ob = new GeoBuilder();
    ob.quad(-200, -680, -15, -640, Y.old, 0xb8b8b8);
    this.oldLink = new THREE.Mesh(ob.build(), this.mat.oldLink);
    this.oldLink.receiveShadow = true;
    this._add(this.oldLink);
    this.oldRunway = new THREE.Mesh(b.build(), this.mat.oldAsphalt);
    this.oldRunway.receiveShadow = true;
    this.oldRunway.name = 'runway-existing';
    this._add(this.oldRunway);

    // Faded legacy markings (30 m runway).
    const m = new GeoBuilder();
    const faded = new THREE.Color(0.62, 0.62, 0.6);
    for (const [thr, dir] of [[R.threshold02Z, -1], [THR20, 1]]) {
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const x = s * (2.7 + i * 3.6);
          const z0 = thr + dir * 6; const z1 = thr + dir * 36;
          m.quad(x - 0.9, Math.min(z0, z1), x + 0.9, Math.max(z0, z1), Y.oldMark, faded);
        }
      }
      // Aiming point at 250 m.
      for (const s of [-1, 1]) {
        const z0 = thr + dir * 250; const z1 = thr + dir * 295;
        m.quad(s > 0 ? 5 : -11, Math.min(z0, z1), s > 0 ? 11 : -5, Math.max(z0, z1), Y.oldMark, faded);
      }
    }
    for (let z = THR20 + 80; z < R.threshold02Z - 110; z += 50) m.quad(-0.45, z, 0.45, z + 30, Y.oldMark, faded);
    for (const s of [-1, 1]) m.quad(s * 14.55 - 0.45, THR20, s * 14.55 + 0.45, R.threshold02Z, Y.oldMark, faded);
    this.oldMarks = new THREE.Mesh(m.build(), this.mat.markOld);
    this._add(this.oldMarks);

    // Legacy designators.
    this.oldDesignators = this._designators([[R.threshold02Z - 52, '02', false], [THR20 + 52, '20', true]], 0.62, 5, 7.5);

    // Rubber deposits in the old touchdown zones.
    const rt = rubberTexture();
    const rm = layered(new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, color: 0xffffff }), 5);
    this.disposables.push(rt, rm);
    const rb = new GeoBuilder({ worldUV: false });
    const plane = new THREE.PlaneGeometry(22, 600);
    plane.rotateX(-Math.PI / 2);
    const mtx = new THREE.Matrix4();
    for (const zc of [R.threshold02Z - 470, THR20 + 470]) {
      mtx.makeTranslation(0, Y.oldMark + 0.002, zc);
      rb.add(plane, mtx, 0xffffff);
    }
    plane.dispose();
    this.rubber = new THREE.Mesh(rb.build(), rm);
    this.rubber.renderOrder = 2;
    this._add(this.rubber);
  }

  _designators(list, shade, level, size = 9) {
    const meshes = [];
    for (const [z, text, flip] of list) {
      const tex = textQuadTexture(text);
      const mat = layered(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, color: new THREE.Color(shade, shade, shade * 0.98), roughness: 0.7 }), level);
      const g = new THREE.PlaneGeometry(size * 1.1, size);
      g.rotateX(-Math.PI / 2);
      if (flip) g.rotateY(Math.PI);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(0, level >= 7 ? Y.mark : Y.oldMark, z);
      mesh.receiveShadow = true;
      this._add(mesh);
      this.disposables.push(tex, mat, g);
      meshes.push(mesh);
    }
    return meshes;
  }

  /* --------------------------------------------------- extension phases */

  _buildExtension() {
    const z0 = R.extensionStartZ; const z1 = PAD02 + 60;
    const seg = 25;
    // 3.2 earthworks: cut (darker, fresh) and fill (compacted, striped) patchwork.
    const cut = new GeoBuilder(); const fill = new GeoBuilder();
    let k = 0;
    for (let z = z0; z < z1 - 0.01; z += seg) {
      const ze = Math.min(z + seg, z1);
      const isCut = Math.sin(z * 0.004) + Math.sin(z * 0.011) > 0.3;
      for (const [x0, x1] of [[-85, -30], [-30, 30], [30, 85]]) {
        const target = (isCut ^ (x0 > 0 && k % 3 === 0)) ? cut : fill;
        target.quad(x0, z, x1, ze, Y.earth, 0xffffff);
      }
      cut.mark(); fill.mark();
      k++;
    }
    this.earthCut = this._prog(cut, this.mat.soilCut, 'earthworks-cut');
    this.earthFill = this._prog(fill, this.mat.soilFill, 'earthworks-fill');
    this._el('3.2', 'Runway extension — earthworks (cut/fill)', [-85, 0, z0, 85, 2, z1], (p) => {
      this.earthCut.setProgress(p); this.earthFill.setProgress(p);
    }, { surface: 'sand', front: (p) => ({ x: 0, z: z0 + (z1 - z0) * p, radius: 70, kind: 'earthworks' }) });

    const layer = (w, yb, yt, mat, name) => {
      const b = new GeoBuilder();
      for (let z = z0; z < PAD02 - 0.01; z += seg) {
        const ze = Math.min(z + seg, PAD02);
        b.box(w, yt - yb, ze - z, 0, yb, (z + ze) / 2, 0xffffff);
        b.mark();
      }
      return this._prog(b, mat, name);
    };
    this.sub = layer(68, 0.0, Y.sub, this.mat.sub, 'subbase');
    this.base = layer(64, 0.0, Y.base, this.mat.base, 'base');
    this._el('3.3', 'Runway extension — granular sub-base', [-34, 0, z0, 34, 1, PAD02], (p) => this.sub.setProgress(p),
      { surface: 'sand', front: (p) => ({ x: 0, z: z0 + (PAD02 - z0) * p, radius: 50, kind: 'paving' }) });
    this._el('3.4', 'Runway extension — crushed-stone base', [-32, 0, z0, 32, 1, PAD02], (p) => this.base.setProgress(p),
      { surface: 'sand', front: (p) => ({ x: 0, z: z0 + (PAD02 - z0) * p, radius: 50, kind: 'paving' }) });

    const surf = new GeoBuilder();
    for (let z = z0; z < THR02 - 0.01; z += seg) {
      const ze = Math.min(z + seg, THR02);
      surf.quad(-HW, z, HW, ze, Y.top, 0xffffff);
      surf.mark();
    }
    this.surface = this._prog(surf, this.mat.newAsphalt, 'extension-surface');
    this._el('3.5', 'Runway extension — asphalt surfacing', [-HW, 0, z0, HW, 1, THR02], (p) => this.surface.setProgress(p),
      { surface: 'asphalt', front: (p) => ({ x: 0, z: z0 + (THR02 - z0) * p, radius: 45, kind: 'paving' }) });
  }

  _buildOverlayAndWidening() {
    const seg = 30;
    // 3.6 overlay of the existing 2,133 m, paved south → north.
    const ov = new GeoBuilder();
    for (let z = R.threshold02Z; z > THR20 + 0.01; z -= seg) {
      const ze = Math.max(z - seg, THR20);
      ov.quad(-OHW, ze, OHW, z, Y.top, 0xffffff);
      ov.mark();
    }
    this.overlay = this._prog(ov, this.mat.newAsphalt, 'runway-overlay');
    this._el('3.6', 'Existing runway — asphalt overlay', [-OHW, 0, THR20, OHW, 1, R.threshold02Z], (p) => {
      this.overlay.setProgress(p);
      this.rubber.visible = p < 0.95;
    }, { surface: 'asphalt', front: (p) => ({ x: 0, z: R.threshold02Z - (R.threshold02Z - THR20) * p, radius: 45, kind: 'paving' }) });

    // 3.7 widening to 45 m + 7.5 m shoulders over the full length.
    const wb = new GeoBuilder();
    for (let z = THR02; z > DISP20 + 0.01; z -= seg) {
      const ze = Math.max(z - seg, DISP20);
      if (z <= R.threshold02Z + 0.01 && ze >= THR20 - 0.01) {
        wb.quad(-HW, ze, -OHW, z, Y.top, 0xffffff);
        wb.quad(OHW, ze, HW, z, Y.top, 0xffffff);
      }
      const sh = new THREE.Color(0.78, 0.78, 0.76);
      wb.quad(-SHW, ze, -HW, z, Y.top - 0.01, sh);
      wb.quad(HW, ze, SHW, z, Y.top - 0.01, sh);
      wb.mark();
    }
    this.widening = this._prog(wb, this.mat.newAsphalt, 'runway-widening');
    this._el('3.7', 'Runway widening to Code E (45 m + shoulders)', [-SHW, 0, DISP20, SHW, 1, THR02], (p) => {
      this.widening.setProgress(p);
      if (this.oldLights) this.oldLights.setProgress(p > 0.3 ? 0 : 1);
    }, { surface: 'asphalt', front: (p) => ({ x: 26, z: THR02 - (THR02 - DISP20) * p, radius: 40, kind: 'paving' }) });
  }

  /* ----------------------------------------------------------- markings */

  _buildMarkings() {
    const parts = [];
    const W = 0xf4f4ee;
    const q = (x0, z0, x1, z1) => (b) => b.quad(x0, Math.min(z0, z1), x1, Math.max(z0, z1), Y.mark, W);
    const P = (z, fn) => parts.push({ z, fn });
    for (const [thr, dir] of [[THR02, -1], [THR20, 1]]) {
      // Threshold bar + piano keys (12 stripes for 45 m).
      P(thr, q(-HW + 0.5, thr, HW - 0.5, thr + dir * 1.8));
      for (let i = 0; i < 6; i++) {
        for (const s of [-1, 1]) {
          const x = s * (2.7 + i * 3.6);
          P(thr + dir * 20, q(x - 0.9, thr + dir * 6, x + 0.9, thr + dir * 36));
        }
      }
      // Aiming point (400 m) and touchdown-zone markings.
      for (const s of [-1, 1]) {
        const xi = s * 9; const xo = s * 17;
        P(thr + dir * 425, q(Math.min(xi, xo), thr + dir * 400, Math.max(xi, xo), thr + dir * 450));
      }
      const tdz = [[150, 3], [300, 3], [500, 2], [600, 2], [750, 1], [900, 1]];
      for (const [d, n] of tdz) {
        for (const s of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const x0 = s * (9 + k * 3.3); const x1 = s * (9 + k * 3.3 + 1.8);
            P(thr + dir * (d + 11), q(Math.min(x0, x1), thr + dir * d, Math.max(x0, x1), thr + dir * (d + 22.5)));
          }
        }
      }
    }
    // Centreline: 30 m dash / 20 m gap.
    for (let z = THR20 + 75; z < THR02 - 75 - 30; z += 50) P(z + 15, q(-0.45, z, 0.45, z + 30));
    // Edge lines.
    for (let z = THR20; z < THR02 - 0.01; z += 50) {
      const ze = Math.min(z + 50, THR02);
      for (const s of [-1, 1]) P(z + 25, q(s * (HW - 0.45) - 0.45, z, s * (HW - 0.45) + 0.45, ze));
    }
    // Displaced threshold arrows (RWY 20 end) pointing at the threshold.
    for (const zc of [-1090, -1135, -1180]) {
      P(zc, (b) => {
        b.quad(-0.45, zc - 22, 0.45, zc - 3, Y.mark, W);
        b.ribbon([[-4.5, zc - 7], [0, zc], [4.5, zc - 7]], 0.9, Y.mark, W);
      });
      for (const s of [-1, 1]) {
        P(zc, (b) => b.ribbon([[s * 11 - 3, zc - 6], [s * 11, zc], [s * 11 + 3, zc - 6]], 0.9, Y.mark, W));
      }
    }
    const b = new GeoBuilder();
    addSorted(b, parts, true);
    this.markings = this._prog(b, this.mat.markNew, 'runway-markings');
    this.newDesignators = this._designators([[THR02 - 52.5, '02', false], [THR20 + 52.5, '20', true]], 0.95, 7, 9);
    this._el('3.8', 'Runway markings (Annex 14)', [-HW, 0, DISP20, HW, 1, THR02], (p) => {
      this.markings.setProgress(p);
      this.newDesignators[0].visible = p > 0.05;
      this.newDesignators[1].visible = p > 0.95;
      const legacy = p < 0.02 && (this._overlayP || 0) < 0.9;
      this.oldMarks.visible = legacy || (this._overlayP || 0) < 0.98;
      for (const d of this.oldDesignators) d.visible = (this._overlayP || 0) < 0.98;
    }, { surface: 'asphalt', front: (p) => ({ x: 0, z: THR02 - (THR02 - THR20) * p, radius: 40, kind: 'paving' }) });
  }

  _buildBlastPads() {
    const b = new GeoBuilder();
    const m = new GeoBuilder();
    const Yel = 0xf2b418;
    // South blast pad (beyond the new RWY 02 threshold).
    b.quad(-SHW, THR02, SHW, PAD02, Y.top - 0.005, new THREE.Color(0.9, 0.9, 0.88));
    for (let z = THR02 + 15; z < PAD02 - 5; z += 22) m.ribbon([[-26, z + 26], [0, z], [26, z + 26]].filter((p) => p[1] <= PAD02), 1.0, Y.mark, Yel);
    b.mark(); m.mark();
    // North: displaced-threshold pavement + blast pad.
    b.quad(-HW, DISP20, HW, THR20, Y.top, 0xffffff);
    b.quad(-SHW, PAD20, SHW, DISP20, Y.top - 0.005, new THREE.Color(0.9, 0.9, 0.88));
    for (let z = DISP20 - 12; z > PAD20 + 4; z -= 22) m.ribbon([[-26, Math.max(z - 26, PAD20 + 1)], [0, z], [26, Math.max(z - 26, PAD20 + 1)]], 1.0, Y.mark, Yel);
    b.mark(); m.mark();
    this.pads = this._prog(b, this.mat.newAsphalt, 'blast-pads');
    this.chevrons = this._prog(m, this.mat.markNew, 'blast-pad-chevrons');
    this._el('3.9', 'Blast pads & displaced threshold', [-SHW, 0, PAD20, SHW, 1, PAD02], (p) => {
      this.pads.setProgress(p); this.chevrons.setProgress(Math.max(0, p * 1.2 - 0.2));
    }, { surface: 'asphalt', front: (p) => (p < 0.5 ? { x: 0, z: THR02 + 60, radius: 40, kind: 'paving' } : { x: 0, z: DISP20, radius: 40, kind: 'paving' }) });
  }

  /* ----------------------------------------------------------- taxiways */

  _buildTaxiways() {
    const tw = MP.parallelTaxiway;
    const x0 = tw.x - tw.width / 2; const x1 = tw.x + tw.width / 2;
    const seg = 40;
    const b = new GeoBuilder(); const sh = new GeoBuilder(); const mk = new GeoBuilder();
    const Yel = 0xf2b418;
    const tparts = [];
    for (let z = tw.z1; z > tw.z0 + 0.01; z -= seg) {
      const ze = Math.max(z - seg, tw.z0);
      tparts.push({ z, fn: (bb) => bb.quad(x0, ze, x1, z, Y.base + 0.01, 0xffffff) });
    }
    // Right-angle connectors to the runway with corner fillets.
    for (const zc of MP.connectors) {
      tparts.push({ z: zc, fn: (bb) => {
        bb.quad(x1 - 1, zc - tw.width / 2, -OHW, zc + tw.width / 2, Y.base + 0.01, 0xffffff);
        for (const s of [-1, 1]) {
          const ze = zc + s * tw.width / 2;
          bb.quad4([x1, ze], [x1, ze + s * 18], [x1 + 18, ze], [x1 + 18, ze], Y.base + 0.01, 0xffffff);
          bb.quad4([-SHW - 18, ze], [-SHW, ze + s * 18], [-SHW, ze], [-SHW, ze], Y.base + 0.01, 0xffffff);
        }
      } });
    }
    addSorted(b, tparts, true);
    for (let z = tw.z1; z > tw.z0 + 0.01; z -= seg) {
      const ze = Math.max(z - seg, tw.z0);
      const c = new THREE.Color(0.8, 0.8, 0.78);
      sh.quad(x0 - 7.5, ze, x0, z, Y.sub, c);
      sh.quad(x1, ze, x1 + 7.5, z, Y.sub, c);
      sh.mark();
    }
    // Markings: centreline + edge lines + holding points + connector centrelines.
    const mparts = [];
    for (let z = tw.z1; z > tw.z0 + 0.01; z -= seg) {
      const ze = Math.max(z - seg, tw.z0);
      mparts.push({ z, fn: (bb) => {
        bb.quad(tw.x - 0.2, ze, tw.x + 0.2, z, Y.mark, Yel);
        bb.quad(x0 + 0.3, ze, x0 + 0.6, z, Y.mark, Yel);
        bb.quad(x1 - 0.6, ze, x1 - 0.3, z, Y.mark, Yel);
      } });
    }
    for (const zc of MP.connectors) {
      mparts.push({ z: zc, fn: (bb) => {
        bb.ribbon([[tw.x, zc + (zc > 0 ? 30 : -30)], [tw.x + 12, zc + (zc > 0 ? 8 : -8)], [tw.x + 30, zc], [-40, zc], [-10, zc + (zc > 0 ? -25 : 25)], [-2, zc + (zc > 0 ? -60 : 60)]], 0.4, Y.mark, Yel);
        // Runway-holding position (pattern A) at 90 m from the centreline.
        for (let k = 0; k < 4; k++) {
          const x = -90 - k * 0.9;
          if (k < 2) bb.quad(x - 0.15, zc - tw.width / 2 + 1, x + 0.15, zc + tw.width / 2 - 1, Y.mark, Yel);
          else for (let zz = zc - tw.width / 2 + 1; zz < zc + tw.width / 2 - 1; zz += 2) bb.quad(x - 0.15, zz, x + 0.15, zz + 1, Y.mark, Yel);
        }
      } });
    }
    addSorted(mk, mparts, true);
    this.taxiway = this._prog(b, this.mat.taxiAsphalt, 'parallel-taxiway');
    this.taxiShoulders = this._prog(sh, this.mat.shoulder, 'taxiway-shoulders');
    this.taxiMarks = this._prog(mk, this.mat.markNew, 'taxiway-markings');
    this._el('4.1', 'Parallel taxiway & connectors', [x0 - 8, 0, tw.z0, -OHW, 1, tw.z1], (p) => {
      this.taxiway.setProgress(p); this.taxiShoulders.setProgress(p); this.taxiMarks.setProgress(Math.max(0, p * 1.15 - 0.15));
    }, { surface: 'asphalt', front: (p) => ({ x: tw.x, z: tw.z1 - (tw.z1 - tw.z0) * p, radius: 40, kind: 'paving' }) });

    // 4.2 rapid exits (≈30° turn-offs).
    const rb = new GeoBuilder(); const rm = new GeoBuilder();
    this.rapidPaths = [];
    for (const ex of MP.rapidExits) {
      const dir = Math.sign(ex.toZ - ex.fromZ);
      const pts = [[-OHW + 2, ex.fromZ - dir * 20], [-40, ex.fromZ + dir * 35], [tw.x + 30, ex.toZ - dir * 45], [tw.x, ex.toZ]];
      this.rapidPaths.push(pts);
      rb.ribbon(pts, ex.width, Y.base + 0.012, 0xffffff);
      rb.quad4([-SHW, ex.fromZ - dir * 60], [-SHW, ex.fromZ + dir * 10], [-SHW - 25, ex.fromZ + dir * 30], [-SHW - 25, ex.fromZ + dir * 30], Y.base + 0.012, 0xffffff);
      rb.mark();
      rm.ribbon([[0, ex.fromZ - dir * 90], [-6, ex.fromZ - dir * 30], ...pts.slice(1)], 0.4, Y.mark, Yel);
      rm.mark();
    }
    this.rapid = this._prog(rb, this.mat.taxiAsphalt, 'rapid-exits');
    this.rapidMarks = this._prog(rm, this.mat.markNew, 'rapid-exit-markings');
    this._el('4.2', 'Rapid-exit taxiways', [tw.x, 0, -450, -OHW, 1, 720], (p) => { this.rapid.setProgress(p); this.rapidMarks.setProgress(p > 0.9 ? 1 : p * 0.5); },
      { surface: 'asphalt', front: (p) => ({ x: -90, z: p < 0.5 ? -280 : 550, radius: 60, kind: 'paving' }) });
  }

  /* -------------------------------------------------------------- apron */

  _buildApron() {
    const a = MP.apron;
    const tw = MP.parallelTaxiway;
    const b = new GeoBuilder();
    const seg = 60;
    for (let z = a.z0; z < a.z1 - 0.01; z += seg) {
      b.quad(a.x0, z, a.x1, Math.min(z + seg, a.z1), Y.base + 0.01, 0xc4c0b8);
      b.mark();
    }
    for (const zc of [-250, 250]) { b.quad(a.x1 - 1, zc - 22, tw.x - tw.width / 2 + 1, zc + 22, Y.base + 0.01, 0xc4c0b8); b.mark(); }
    this.apron = this._prog(b, this.mat.apron, 'apron');
    this._el('4.3', 'Apron (8 stands)', [a.x0, 0, a.z0, a.x1, 1, a.z1], (p) => this.apron.setProgress(p),
      { surface: 'concrete', front: (p) => ({ x: (a.x0 + a.x1) / 2, z: a.z0 + (a.z1 - a.z0) * p, radius: 80, kind: 'paving' }) });

    // 4.4 stand markings.
    const m = new GeoBuilder();
    const Yel = 0xf2b418; const Red = 0xc8281e; const Wht = 0xf0f0ea;
    this.standLabels = [];
    for (const st of STANDS) {
      const z = st.z;
      const side = z < 0 ? 1 : -1;
      m.ribbon([[TAXILANE_X, z + side * 46], [TAXILANE_X - 8, z + side * 22], [TAXILANE_X - 26, z + side * 4], [TAXILANE_X - 50, z], [st.noseX + 2, z]], 0.3, Y.mark, Yel);
      m.quad(st.noseX - 0.6, z - 3, st.noseX + 0.6, z + 3, Y.mark, Yel);           // stop bar
      for (const dz of [-38, 38]) m.quad(-470, z + dz - 0.15, -300, z + dz + 0.15, Y.mark, Red);  // stand safety lines
      m.quad(-472, z - 38, -470, z + 38, Y.mark, Red);
      for (let x = -470; x < -440; x += 4) m.quad(x, z - 12, x + 2, z - 11.7, Y.mark, Wht);   // equipment restraint dash
      m.mark();
    }
    // Apron taxilane centreline.
    m.quad(TAXILANE_X - 0.15, a.z0, TAXILANE_X + 0.15, a.z1, Y.mark, Yel);
    for (const zc of [-250, 250]) m.ribbon([[TAXILANE_X, zc + (zc > 0 ? -30 : 30)], [TAXILANE_X + 25, zc], [tw.x, zc]], 0.3, Y.mark, Yel);
    m.mark();
    this.standMarks = this._prog(m, this.mat.markNew, 'stand-markings');
    // Stand numbers.
    const nb = new GeoBuilder({ worldUV: false });
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 1024, 128);
      ctx.fillStyle = '#f2b418'; ctx.font = 'bold 100px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) ctx.fillText(String(i + 1), i * 128 + 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const plane = new THREE.PlaneGeometry(5, 5);
    plane.rotateX(-Math.PI / 2);
    plane.rotateY(-Math.PI / 2);
    const uv = plane.attributes.uv;
    const mtx = new THREE.Matrix4();
    for (const st of STANDS) {
      const g = plane.clone();
      const u = g.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setX(i, (st.index + uv.getX(i)) / 8);
      mtx.makeTranslation(-400, Y.mark, st.z);
      nb.add(g, mtx, 0xffffff);
      g.dispose();
    }
    plane.dispose();
    const nm = layered(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), 7);
    this.disposables.push(tex, nm);
    this.standNumbers = new THREE.Mesh(nb.build(), nm);
    this._add(this.standNumbers);
    this._el('4.4', 'Stand & apron markings', [a.x0, 0, a.z0, -300, 1, a.z1], (p) => {
      this.standMarks.setProgress(p); this.standNumbers.visible = p > 0.85;
    }, { surface: 'concrete', front: () => ({ x: -400, z: 0, radius: 120, kind: 'paving' }) });

    // 4.5 floodlight masts.
    const fb = new GeoBuilder();
    this.flood = new LightField('apron-floodlights', { minPx: 2.2, maxPx: 28 });
    const masts = [];
    for (const z of [-300, -150, 0, 150, 300]) masts.push([-238, z]);
    for (const z of [-330, 330]) masts.push([-300, z + (z > 0 ? 8 : -8)]);
    const poolB = new GeoBuilder({ worldUV: false });
    const poolPlane = new THREE.PlaneGeometry(1, 1);
    poolPlane.rotateX(-Math.PI / 2);
    const pm = new THREE.Matrix4();
    for (const [x, z] of masts) {
      fb.cyl(0.55, 30, x, 0, z, 0x9aa0a6, 8, 0.55);
      fb.box(2.2, 0.9, 2.2, x, 0, z, 0x8a8f94);
      fb.box(1.2, 0.3, 6.2, x - 0.6, 29.6, z, 0x6f747a);
      fb.box(2.6, 1.6, 0.3, x - 1, 29.9, z, 0x6f747a);
      for (let i = 0; i < 6; i++) {
        const lz = z - 2.5 + i;
        fb.box(0.7, 0.6, 0.8, x - 1.6, 30.2 + (i % 2) * 0.7, lz, 0x30343a);
        this.flood.add(x - 2.0, 30.3 + (i % 2) * 0.7, lz, new THREE.Color(4.2, 3.7, 2.9), 1.6, 0, 0);
      }
      fb.mark();
      pm.compose(new THREE.Vector3(x - 50, Y.mark + 0.01, z), new THREE.Quaternion(), new THREE.Vector3(130, 1, 120));
      poolB.add(poolPlane, pm, 0xffffff);
    }
    poolPlane.dispose();
    this.floodMasts = this._prog(fb, this.mat.metal, 'floodlight-masts', true);
    this.flood.finalize(this.group);
    this.lightFields.push({ field: this.flood, kind: 'apron', id: '4.5' });
    const poolTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,226,180,0.9)'); g.addColorStop(0.5, 'rgba(255,214,160,0.35)'); g.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.poolMat.polygonOffset = true; this.poolMat.polygonOffsetFactor = -4; this.poolMat.polygonOffsetUnits = -24;
    this.pools = new THREE.Mesh(poolB.build(), this.poolMat);
    this.pools.renderOrder = 3;
    this.pools.visible = false;
    this._add(this.pools);
    this.disposables.push(poolTex, this.poolMat);
    this.lightPools = [{ mesh: this.pools, mat: this.poolMat, id: '4.5', strength: 0.55 }];
    this._el('4.5', 'Apron floodlight masts', [-305, 0, -340, -232, 32, 340], (p) => {
      this.floodMasts.setProgress(p);
      this.flood.setProgress(p);
      this.pools.userData.installed = p;
    }, { kind: 'electrical', front: () => ({ x: -238, z: 0, radius: 60, kind: 'electrical' }) });

    // 4.6 service roads (airside road behind stands + perimeter link).
    const sb = new GeoBuilder();
    sb.quad(-479, a.z0 - 40, -471, a.z1 + 40, Y.mark - 0.004, 0xb0b0b0);
    sb.mark();
    sb.ribbon([[-475, a.z1 + 40], [-470, 400], [-330, 500], [-300, 560]], 8, Y.base, 0xb0b0b0);
    sb.ribbon([[-475, a.z0 - 40], [-500, -380], [-545, -405]], 8, Y.base, 0xb0b0b0);
    sb.mark();
    // Perimeter patrol road inside the wall.
    const Pm = MP.perimeter;
    const ring = [[Pm.x0 + 12, Pm.z0 + 12], [Pm.x1 - 12, Pm.z0 + 12], [Pm.x1 - 12, Pm.z1 - 12], [Pm.x0 + 12, Pm.z1 - 12], [Pm.x0 + 12, Pm.z0 + 12]];
    sb.ribbon(ring, 6, Y.earth, 0x9a9590);
    sb.mark();
    this.serviceRoads = this._prog(sb, this.mat.service, 'service-roads');
    this._el('4.6', 'Airside service & patrol roads', [-545, 0, a.z0 - 40, -300, 1, 560], (p) => this.serviceRoads.setProgress(p),
      { surface: 'asphalt', fallback: '4.3', front: () => ({ x: -475, z: 0, radius: 60, kind: 'paving' }) });
  }

  /* ----------------------------------------------------------- drainage */

  _buildDrainage() {
    const b = new GeoBuilder();
    const w = new GeoBuilder();
    const conc = 0xb9b4aa;
    const cross = [...MP.connectors.map((z) => [z - 16, z + 16]), [-460, -380], [-200, -100], [400, 470], [640, 720], [-690, -630]];
    const blocked = (z) => cross.some(([a, c]) => z > a && z < c);
    const channel = (x, za, zb) => {
      for (let z = za; z < zb; z += 20) {
        if (x < 0 && blocked(z + 10)) continue;
        const ze = Math.min(z + 20, zb);
        b.box(0.5, 0.35, ze - z, x - 1.8, 0, (z + ze) / 2, conc);
        b.box(0.5, 0.35, ze - z, x + 1.8, 0, (z + ze) / 2, conc);
        w.quad(x - 1.55, z, x + 1.55, ze, 0.05, 0xffffff);
      }
      b.mark(); w.mark();
    };
    const zA = -1150; const zB = 2450;
    for (let z = zA; z < zB; z += 300) { channel(95, z, Math.min(z + 300, zB)); channel(-100, z, Math.min(z + 300, zB)); }
    // Cross drain to the outfall.
    const o = MP.drainageOutfall;
    for (let x = 97; x < o.x - 6; x += 20) {
      const xe = Math.min(x + 20, o.x - 6);
      b.box(xe - x, 0.35, 0.5, (x + xe) / 2, 0, o.z - 1.8, conc);
      b.box(xe - x, 0.35, 0.5, (x + xe) / 2, 0, o.z + 1.8, conc);
      w.quad(x, o.z - 1.55, xe, o.z + 1.55, 0.05, 0xffffff);
    }
    // Outfall headwall + riprap apron + settling pond.
    b.box(3, 1.6, 9, o.x - 5, 0, o.z, conc);
    const rng = makeRng(5);
    for (let i = 0; i < 70; i++) b.box(0.6 + rng() * 0.8, 0.3 + rng() * 0.4, 0.6 + rng() * 0.8, o.x + rng() * 22, 0, o.z + (rng() - 0.5) * 16, 0x8d877c, rng() * 3);
    w.quad(o.x + 4, o.z - 22, o.x + 70, o.z + 22, 0.04, 0xffffff);
    b.mark(); w.mark();
    this.drainWalls = this._prog(b, this.M.paintMap, 'drain-walls', true);
    this.waterMat = layered(new THREE.MeshStandardMaterial({ color: 0x3d4a3c, roughness: 0.12, metalness: 0.2 }), 2);
    this.disposables.push(this.waterMat);
    this.drainWater = this._prog(w, this.waterMat, 'drain-water');
    this._el('8.7', 'Storm-water drainage & outfall', [-102, 0, zA, o.x + 70, 2, zB], (p) => { this.drainWalls.setProgress(p); this.drainWater.setProgress(p); },
      { surface: 'concrete', front: (p) => ({ x: 95, z: zA + (zB - zA) * p, radius: 50, kind: 'earthworks' }) });
  }

  /* ---------------------------------------------------------- AGL & lights */

  _buildRunwayLights() {
    // Legacy edge lights on the old 30 m runway (dim, yellowish) — removed by widening.
    this.oldLights = new LightField('old-edge-lights', { minPx: 1.4 });
    for (let z = THR20; z <= R.threshold02Z + 0.1; z += 60) for (const s of [-1, 1]) this.oldLights.add(s * 16, 0.4, z, new THREE.Color(2.4, 2.0, 1.2), 0.35);
    this.oldLights.finalize(this.group);
    this.lightFields.push({ field: this.oldLights, kind: 'airfield', id: null, always: true });

    const f = new LightField('runway-lights', { minPx: 1.7 });
    const pts = [];
    const white = new THREE.Color(4.5, 4.3, 3.9); const red = new THREE.Color(5, 0.3, 0.2); const green = new THREE.Color(0.4, 5, 1.3); const yellow = new THREE.Color(5, 3.6, 0.6);
    const fixtures = new GeoBuilder();
    for (let z = DISP20; z <= THR02 + 0.1; z += 60) {
      for (const s of [-1, 1]) {
        const caution = z < THR20 + 600 ? yellow : white;
        pts.push([s * (HW + 1), 0.45, z, z < THR20 ? red : caution, 0.45]);
      }
    }
    for (let z = THR20 + 15; z < THR02 - 0.1; z += 15) {
      const dEnd = z - THR20;
      const c = dEnd < 300 ? red : dEnd < 900 ? ((Math.round(dEnd / 15) % 2) ? red : white) : white;
      pts.push([0, 0.16, z, c, 0.3]);
    }
    for (let x = -HW + 1; x <= HW - 1; x += 3) {
      pts.push([x, 0.2, THR02 - 1, green, 0.38]);
      pts.push([x, 0.2, THR02 + 2, red, 0.32]);
      pts.push([x, 0.2, THR20 + 1, green, 0.38]);
      pts.push([x, 0.2, DISP20 - 1, red, 0.32]);
    }
    for (let d = 60; d <= 900; d += 60) {
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) pts.push([s * (9 + k * 1.5), 0.16, THR02 - d, white, 0.25]);
    }
    pts.sort((a, b) => b[2] - a[2]);
    for (const p of pts) {
      f.add(p[0], p[1], p[2], p[3], p[4]);
      if (Math.abs(p[0]) > HW) fixtures.cyl(0.08, 0.4, p[0], 0, p[2], 0xe0c020, 6);
    }
    f.finalize(this.group);
    fixtures.mark();
    this.edgeFixtures = this._prog(fixtures, this.M.paint, 'edge-light-fixtures');
    this.runwayLights = f;
    this.lightFields.push({ field: f, kind: 'airfield', id: '5.2' });
    this._el('5.2', 'Runway edge, centreline, TDZ & threshold lights', [-HW - 2, 0, DISP20, HW + 2, 1, THR02 + 3], (p) => {
      f.setProgress(p); this.edgeFixtures.setProgress(p);
    }, { kind: 'electrical', front: (p) => ({ x: HW + 1, z: THR02 - (THR02 - DISP20) * p, radius: 30, kind: 'electrical' }) });
  }

  _buildApproachLights() {
    const f = new LightField('approach-lights', { minPx: 1.8 });
    const frame = new GeoBuilder();
    const white = new THREE.Color(4.6, 4.4, 4.0); const red = new THREE.Color(5, 0.35, 0.2);
    const items = [];
    for (const [thr, dir] of [[THR02, 1], [THR20, -1]]) {
      const len = MP.approachLights.length;
      for (let d = MP.approachLights.spacing; d <= len + 0.1; d += MP.approachLights.spacing) {
        const z = thr + dir * d;
        const onPave = dir < 0 && z > PAD20;
        items.push({ d, z, fn: () => {
          const h = onPave ? 0.2 : 1.2 + d * 0.0015;
          if (!onPave) {
            frame.cyl(0.08, h, 0, 0, z, 0xd8d0b8, 6);
            frame.box(4.4, 0.12, 0.12, 0, h - 0.1, z, 0xd8d0b8);
          }
          for (let k = -2; k <= 2; k++) f.add(k * 1.0, h + 0.1, z, white, 0.4);
          if (Math.abs(d - 300) < 1) {
            if (!onPave) frame.box(30, 0.14, 0.14, 0, h - 0.1, z, 0xd8d0b8);
            for (let k = -15; k <= 15; k += 1.5) if (Math.abs(k) > 3) f.add(k, h + 0.1, z, white, 0.4);
          }
          if (d <= 270 && d >= 30) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) f.add(s * (6 + k * 1.5), h + 0.1, z, red, 0.35);
          if (d >= 300) f.add(0, h + 0.35, z, white, 0.9, 1, (len - d) / len * 0.6);
          frame.mark();
        } });
      }
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.fn();
    f.finalize(this.group);
    this.approachFrames = this._prog(frame, this.M.paint, 'approach-light-frames', true);
    this.approachLights = f;
    this.lightFields.push({ field: f, kind: 'airfield', id: '5.3' });
    this._el('5.3', 'Approach lighting & sequenced flashers', [-16, 0, THR20 - 905, 16, 4, THR02 + 905], (p) => {
      f.setProgress(p); this.approachFrames.setProgress(p);
    }, { kind: 'electrical', front: (p) => ({ x: 0, z: THR02 + 900 * p, radius: 40, kind: 'electrical' }) });
  }

  _buildPapi() {
    const f = new LightField('papi', { minPx: 2.2, maxPx: 30 });
    const b = new GeoBuilder();
    const deg = Math.PI / 180;
    const angles = [3.5, 3.17, 2.83, 2.5];
    const sites = [[THR02 - 380, -1], [THR20 + 380, 1]];
    for (const [z, side] of sites) {
      for (let i = 0; i < 4; i++) {
        const x = side * (HW + 17.5 + i * 9);
        b.box(0.4, 0.5, 0.4, x - 0.6, 0, z, 0x8e8e86);
        b.box(0.4, 0.5, 0.4, x + 0.6, 0, z, 0x8e8e86);
        b.box(2.1, 0.7, 1.0, x, 0.5, z, 0xd9b51e);
        b.box(1.8, 0.4, 0.3, x, 0.75, z + (side < 0 ? 0.55 : -0.55), 0x2a2a2a);
        for (const dx of [-0.5, 0.5]) f.add(x + dx, 0.95, z + (side < 0 ? 0.7 : -0.7), 0xffffff, 0.55, 3, angles[i] * deg);
      }
      b.mark();
    }
    f.finalize(this.group);
    this.papi = f;
    this.papiBoxes = this._prog(b, this.M.paint, 'papi-units', true);
    this.lightFields.push({ field: f, kind: 'airfield', id: '5.4' });
    this._el('5.4', 'PAPI (precision approach path indicators)', [-HW - 50, 0, sites[0][0] - 3, HW + 50, 2, sites[0][0] + 3], (p) => {
      f.setProgress(p); this.papiBoxes.setProgress(p);
    }, { kind: 'electrical', front: () => ({ x: -55, z: sites[0][0], radius: 25, kind: 'electrical' }) });
  }

  _buildTaxiwayLights() {
    const tw = MP.parallelTaxiway;
    const f = new LightField('taxiway-lights', { minPx: 1.5 });
    const blue = new THREE.Color(0.5, 1.2, 5); const green = new THREE.Color(0.4, 5, 1.2); const red = new THREE.Color(5, 0.3, 0.2);
    const pts = [];
    const x0 = tw.x - tw.width / 2 - 1; const x1 = tw.x + tw.width / 2 + 1;
    const nearConn = (z) => MP.connectors.some((c) => Math.abs(z - c) < tw.width / 2 + 4);
    for (let z = tw.z0; z <= tw.z1; z += 30) {
      pts.push([x0, z, blue, 0.32]);
      if (!nearConn(z)) pts.push([x1, z, blue, 0.32]);
      pts.push([tw.x, z + 15, green, 0.24]);
    }
    for (const zc of MP.connectors) {
      for (let x = tw.x + 15; x < -OHW - 10; x += 15) {
        pts.push([x, zc, green, 0.24]);
        pts.push([x, zc - tw.width / 2 - 1, blue, 0.3]);
        pts.push([x, zc + tw.width / 2 + 1, blue, 0.3]);
      }
      for (let zz = zc - tw.width / 2 + 1.5; zz < zc + tw.width / 2 - 1; zz += 3) pts.push([-88, zz, red, 0.3]);
    }
    for (const path of this.rapidPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i]; const [bx, bz] = path[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < L; s += 15) pts.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L, green, 0.24]);
      }
    }
    pts.sort((a, b) => b[1] - a[1]);
    for (const p of pts) f.add(p[0], 0.3, p[1], p[2], p[3]);
    f.finalize(this.group);
    this.taxiLights = f;
    this.lightFields.push({ field: f, kind: 'airfield', id: '5.5' });

    // Signs: mandatory (red, "02-20") and location (black/yellow, "A") at each holding point.
    const mand = labelTexture('02-20', { w: 256, h: 64, bg: '#c8102e', fg: '#ffffff', font: 'bold 46px sans-serif' });
    const loc = labelTexture('A', { w: 64, h: 64, bg: '#111111', fg: '#f2c21b', font: 'bold 48px sans-serif', border: '#f2c21b' });
    const body = new GeoBuilder();
    const faceM = new GeoBuilder({ worldUV: false }); const faceL = new GeoBuilder({ worldUV: false });
    const plane = new THREE.PlaneGeometry(1, 1);
    const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const ps = new THREE.Vector3();
    for (const zc of MP.connectors) {
      const zs = zc - tw.width / 2 - 8;
      body.box(4.6, 1.1, 0.35, -92, 0.15, zs, 0x222222);
      body.box(0.15, 0.2, 0.15, -93.5, 0, zs, 0x777777); body.box(0.15, 0.2, 0.15, -90.5, 0, zs, 0x777777);
      for (const sx of [-1, 1]) {
        const ry = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
        q.setFromEuler(new THREE.Euler(0, ry, 0));
        mtx.compose(ps.set(-92 + sx * 2.31, 0.7, zs), q, sc.set(0.34, 0.9, 1));
        faceM.add(plane, mtx, 0xffffff);
      }
      body.box(0.2, 0.9, 1.4, -92, 0.25, zs + 2.2, 0x222222);
      for (const sx of [-1, 1]) {
        q.setFromEuler(new THREE.Euler(0, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0));
        mtx.compose(ps.set(-92 + sx * 0.11, 0.7, zs + 2.2), q, sc.set(1.2, 0.8, 1));
        faceL.add(plane, mtx, 0xffffff);
      }
      body.mark(); faceM.mark(); faceL.mark();
    }
    plane.dispose();
    const mm = new THREE.MeshStandardMaterial({ map: mand, emissiveMap: mand, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide });
    const lm = new THREE.MeshStandardMaterial({ map: loc, emissiveMap: loc, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide });
    this.signMats = [mm, lm];
    this.disposables.push(mand, loc, mm, lm);
    this.signBodies = this._prog(body, this.M.paint, 'sign-bodies', true);
    this.signFacesM = this._prog(faceM, mm, 'sign-faces-mandatory');
    this.signFacesL = this._prog(faceL, lm, 'sign-faces-location');
    this._el('5.5', 'Taxiway edge/centreline lights, stop bars & signs', [tw.x - 14, 0, tw.z0, -OHW, 2, tw.z1], (p) => {
      f.setProgress(p); this.signBodies.setProgress(p); this.signFacesM.setProgress(p); this.signFacesL.setProgress(p);
    }, { kind: 'electrical', front: (p) => ({ x: tw.x, z: tw.z1 - (tw.z1 - tw.z0) * p, radius: 30, kind: 'electrical' }) });
  }

  /* ------------------------------------------------------------ navaids */

  _buildNavaids() {
    const ils = MP.ils;
    // 6.1 Localiser antenna array beyond the RWY 20 end (serves RWY 02).
    const lb = new GeoBuilder();
    const z = ils.localizerZ;
    lb.box(46, 0.3, 4, 0, 0, z, 0xb8b4ac);
    lb.mark();
    for (let i = 0; i < 16; i++) {
      const x = -21 + i * 2.8;
      lb.box(0.15, 2.6, 0.15, x, 0.3, z, 0xd8d8d8);
      lb.box(0.12, 0.12, 2.2, x, 2.6, z, 0xd8d8d8);
      lb.box(1.4, 0.08, 0.08, x, 2.75, z - 0.9, 0xeeeeee);
      lb.box(1.4, 0.08, 0.08, x, 2.75, z + 0.9, 0xeeeeee);
      lb.mark();
    }
    lb.box(0.12, 0.12, 46, 0, 1.0, z, 0x9a9a9a);
    lb.box(4, 2.8, 3, -34, 0, z + 6, 0xe8e2d6); lb.box(4.4, 0.25, 3.4, -34, 2.8, z + 6, 0x7a2f2a);
    lb.mark();
    this.loc = this._prog(lb, this.M.paint, 'localiser', true);
    this._el('6.1', 'ILS localiser (RWY 02)', [-36, 0, z - 4, 24, 4, z + 9], (p) => this.loc.setProgress(p),
      { kind: 'electrical', front: () => ({ x: 0, z, radius: 30, kind: 'electrical' }) });

    // 6.2 Glide-path antenna abeam the new RWY 02 touchdown zone.
    const gz = THR02 - 320; const gx = ils.glidePathX;
    const gb = new GeoBuilder();
    gb.box(3, 0.4, 3, gx, 0, gz, 0xb8b4ac);
    gb.mark();
    for (let y = 0; y < 15; y += 1.5) {
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) gb.box(0.08, 1.5, 0.08, gx + dx, 0.4 + y, gz + dz, 0xd04020);
      gb.beam(gx - 0.5, 0.4 + y, gz - 0.5, gx + 0.5, 1.9 + y, gz - 0.5, 0.05, 0xf0f0f0);
      gb.mark();
    }
    for (const h of [4, 8, 12]) gb.box(0.4, 1.2, 1.6, gx - 0.9, h, gz, 0xdddddd);
    gb.box(3.2, 2.6, 2.6, gx + 6, 0, gz, 0xe8e2d6); gb.box(3.6, 0.25, 3.0, gx + 6, 2.6, gz, 0x7a2f2a);
    gb.mark();
    this.gp = this._prog(gb, this.M.paint, 'glide-path', true);
    this.obstacle = new LightField('obstacle-lights', { minPx: 2.0 });
    this.obstacle.add(gx, 15.6, gz, new THREE.Color(6, 0.3, 0.2), 0.7, 2, 0.1);
    this._el('6.2', 'ILS glide-path antenna (RWY 02)', [gx - 3, 0, gz - 3, gx + 9, 16, gz + 3], (p) => this.gp.setProgress(p),
      { kind: 'electrical', front: () => ({ x: gx, z: gz, radius: 25, kind: 'electrical' }) });

    // 6.5 AWOS.
    const a = MP.awos;
    const ab = new GeoBuilder();
    ab.box(12, 0.15, 12, a.x, 0, a.z, 0xc8c0b0);
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = [[-6, 0], [6, 0], [0, -6], [0, 6]][i];
      ab.box(dx ? 0.05 : 12, 1.8, dx ? 12 : 0.05, a.x + dx, 0, a.z + dz, 0x8a8a8a);
    }
    ab.mark();
    ab.cyl(0.09, 10, a.x, 0, a.z, 0xd8d8d8, 6);
    ab.box(1.6, 0.06, 0.06, a.x, 9.8, a.z, 0xd8d8d8);
    ab.cyl(0.25, 0.3, a.x + 0.8, 9.85, a.z, 0xeeeeee, 8); ab.box(0.5, 0.05, 0.05, a.x - 0.8, 9.9, a.z, 0x333333);
    ab.box(0.5, 0.6, 0.4, a.x, 2.0, a.z + 0.3, 0xf0f0f0); ab.box(0.6, 0.8, 0.5, a.x + 2.5, 0, a.z + 2, 0xe0e0e0);
    ab.cyl(0.15, 1.0, a.x - 3, 0, a.z - 3, 0x9a9a9a, 8); ab.box(1.6, 1.5, 0.8, a.x + 3, 0, a.z - 3, 0xe8e2d6);
    ab.box(0.05, 1.2, 0.6, a.x, 4, a.z + 0.4, 0x1b2a6e);
    ab.mark();
    this.awos = this._prog(ab, this.M.paint, 'awos', true);
    this.obstacle.add(a.x, 10.3, a.z, new THREE.Color(6, 0.3, 0.2), 0.5, 2, 0.4);
    this._el('6.5', 'Automated weather observing system (AWOS)', [a.x - 6, 0, a.z - 6, a.x + 6, 11, a.z + 6], (p) => this.awos.setProgress(p),
      { kind: 'electrical', front: () => ({ x: a.x, z: a.z, radius: 20, kind: 'electrical' }) });
  }

  _buildWindsocks() {
    this.windsocks = [];
    const sites = [[MP.windsock.x, MP.windsock.z], [MP.windsock.x, THR02 - 260]];
    const pole = new GeoBuilder();
    for (const [x, z] of sites) {
      pole.box(4, 0.25, 4, x, 0, z, 0xbdb6a8);
      pole.cyl(0.12, 6.5, x, 0.25, z, 0xe8e8e8, 8);
      pole.cyl(0.9, 0.08, x, 6.3, z, 0x777777, 12);
    }
    this.socksPole = new THREE.Mesh(pole.build(), this.M.paint);
    this.socksPole.castShadow = true;
    this._add(this.socksPole);
    // The sock: 5 alternating bands, built pointing +Z from a pivot at the hoop.
    const sb = new GeoBuilder({ worldUV: false });
    for (let i = 0; i < 5; i++) {
      const r0 = 0.45 - i * 0.055; const r1 = 0.45 - (i + 1) * 0.055;
      const g = new THREE.CylinderGeometry(r1, r0, 0.74, 14, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 0.37 + i * 0.74);
      sb.add(g, new THREE.Matrix4(), i % 2 ? 0xf4f4f4 : 0xff4a12);
      g.dispose();
    }
    this.sockGeo = sb.build();
    this.sockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.disposables.push(this.sockGeo, this.sockMat);
    const lf = this.obstacle;
    for (const [x, z] of sites) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 6.3, z);
      const sock = new THREE.Mesh(this.sockGeo, this.sockMat);
      sock.castShadow = true;
      pivot.add(sock);
      this._add(pivot);
      this.windsocks.push({ pivot, sock, phase: x * 0.1 + z * 0.01 });
      lf.add(x, 7.1, z, new THREE.Color(6, 0.3, 0.2), 0.45, 0, 0);
    }
  }

  /* ---------------------------------------------------------- perimeter */

  _buildPerimeter() {
    const Pm = MP.perimeter;
    const L = 50;
    const items = [];
    const gateZ = -77;
    const push = (x, z, ry) => {
      if (Math.abs(x - Pm.x0) < 1 && Math.abs(z - gateZ) < 30) return;
      items.push({ x, z, ry });
    };
    for (let x = Pm.x0 + L / 2; x <= Pm.x1; x += L) push(x, Pm.z0, 0);
    for (let z = Pm.z0 + L / 2; z <= Pm.z1; z += L) push(Pm.x1, z, Math.PI / 2);
    for (let x = Pm.x1 - L / 2; x >= Pm.x0; x -= L) push(x, Pm.z1, Math.PI);
    for (let z = Pm.z1 - L / 2; z >= Pm.z0; z -= L) push(Pm.x0, z, -Math.PI / 2);
    const panel2 = new GeoBuilder({ worldUV: false });
    panel2.box(L, 2.6, 0.3, 0, 0, 0, 0xd9d0bf);
    panel2.box(L, 0.15, 0.42, 0, 2.6, 0, 0xc4baa6);
    panel2.box(0.5, 2.9, 0.5, -L / 2, 0, 0, 0xc4baa6);
    panel2.box(L, 0.55, 0.04, 0, 2.75, 0.02, 0x666666);
    panel2.boxR(L, 0.04, 0.4, 0, 3.32, 0.18, 0x666666, 0.6, 0, 0);
    panel2.cylH(0.22, L, 0, 3.6, 0.32, 0x7a7a7a, 'x', 5);
    this.wall = new InstancedSet(panel2.build(), this.M.paintMap, items, { shadows: true, name: 'perimeter-wall' });
    this._add(this.wall.mesh);
    this.disposables.push(this.wall);
    // Watch towers at the corners and the main gate.
    const tb = new GeoBuilder();
    for (const [x, z] of [[Pm.x0, Pm.z0], [Pm.x1, Pm.z0], [Pm.x1, Pm.z1], [Pm.x0, Pm.z1], [Pm.x1, 600], [Pm.x0, 1500]]) {
      tb.box(3, 7, 3, x, 0, z, 0xd2c8b4); tb.box(4.2, 2.2, 4.2, x, 7, z, 0xe8e0d0); tb.box(4.8, 0.3, 4.8, x, 9.2, z, 0x6a3a2a);
      tb.mark();
    }
    tb.box(8, 4.5, 8, Pm.x0 + 6, 0, gateZ - 22, 0xe8e0d0); tb.box(9, 0.4, 9, Pm.x0 + 6, 4.5, gateZ - 22, 0x2b3a8c);
    tb.box(1, 6, 1, Pm.x0, 0, gateZ - 15, 0xc4baa6); tb.box(1, 6, 1, Pm.x0, 0, gateZ + 15, 0xc4baa6);
    tb.box(0.8, 0.8, 30, Pm.x0, 5.4, gateZ, 0x9b1b30);
    tb.box(0.2, 0.2, 13, Pm.x0 - 1, 1, gateZ - 6.5, 0xf0f0f0); tb.box(0.2, 0.2, 13, Pm.x0 - 1, 1, gateZ + 6.5, 0xf0f0f0);
    tb.mark();
    this.towers = this._prog(tb, this.M.paint, 'perimeter-towers', true);
    this.gateZ = gateZ;
    this._wallCollision = [];
    const col = this.ctx.collision;
    if (col) {
      this._wallCollision.push(col.addBox(Pm.x0 - 0.3, 0, Pm.z0, Pm.x0 + 0.3, 3, gateZ - 15));
      this._wallCollision.push(col.addBox(Pm.x0 - 0.3, 0, gateZ + 15, Pm.x0 + 0.3, 3, Pm.z1));
      this._wallCollision.push(col.addBox(Pm.x1 - 0.3, 0, Pm.z0, Pm.x1 + 0.3, 3, Pm.z1));
      this._wallCollision.push(col.addBox(Pm.x0, 0, Pm.z0 - 0.3, Pm.x1, 3, Pm.z0 + 0.3));
      this._wallCollision.push(col.addBox(Pm.x0, 0, Pm.z1 - 0.3, Pm.x1, 3, Pm.z1 + 0.3));
    }
    this._el('2.4', 'Perimeter security wall & fence', [Pm.x0 - 2, 0, Pm.z0 - 2, Pm.x1 + 2, 4, Pm.z1 + 2], (p) => {
      this.wall.setProgress(p);
      this.towers.setProgress(p);
      if (col) col.setDisabled(this._wallCollision, p < 0.98);
    }, { kind: 'building', front: (p) => {
      const n = Math.min(items.length - 1, Math.floor(items.length * p));
      const it = items[Math.max(0, n)];
      return { x: it.x, z: it.z, radius: 40, kind: 'building' };
    }, pickBoxes: [[Pm.x0 - 3, 0, Pm.z0, Pm.x0 + 3, 4, Pm.z1], [Pm.x1 - 3, 0, Pm.z0, Pm.x1 + 3, 4, Pm.z1], [Pm.x0, 0, Pm.z0 - 3, Pm.x1, 4, Pm.z0 + 3], [Pm.x0, 0, Pm.z1 - 3, Pm.x1, 4, Pm.z1 + 3]] });
  }

  _buildEncroachments() {
    const rng = makeRng(23);
    const walls = []; const roofs = []; const yards = [];
    const palette = [0xc9a679, 0xd8c3a0, 0xe8e4da, 0xa9c4c8, 0xbcd0b0, 0xd9b38a, 0xb58e6a];
    for (const pocket of MP.encroachments) {
      const n = Math.round(pocket.r * 0.55);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2; const r = Math.sqrt(rng()) * pocket.r;
        const x = pocket.x + Math.cos(a) * r; const z = pocket.z + Math.sin(a) * r;
        const ry = Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3;
        const w = 3.5 + rng() * 4; const d = 3 + rng() * 3; const h = 2.4 + rng() * 0.8 + (rng() < 0.12 ? 2.8 : 0);
        const order = rng();
        walls.push({ x, y: 0, z, ry, sx: w, sy: h, sz: d, color: palette[Math.floor(rng() * palette.length)], order });
        roofs.push({ x, y: h, z, ry: ry + (rng() - 0.5) * 0.1, sx: w + 0.6, sy: 0.12, sz: d + 0.6, color: rng() < 0.5 ? 0x8a8f94 : 0x6b5440, order });
        if (rng() < 0.4) yards.push({ x: x + Math.cos(ry) * (w / 2 + 2), y: 0, z: z - Math.sin(ry) * (w / 2 + 2), ry, sx: 0.25, sy: 1.6, sz: d + 3, color: 0xb8a080, order });
      }
    }
    const sortFn = (a, b) => a.order - b.order;
    walls.sort(sortFn); roofs.sort(sortFn); yards.sort(sortFn);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const box2 = box.clone(); const box3 = box.clone();
    this.shackWalls = new InstancedSet(box, this.M.paintMap, walls, { name: 'encroachment-walls' });
    this.shackRoofs = new InstancedSet(box2, this.M.paintMetal, roofs, { name: 'encroachment-roofs' });
    this.shackYards = new InstancedSet(box3, this.M.paintMap, yards, { name: 'encroachment-yards' });
    for (const s of [this.shackWalls, this.shackRoofs, this.shackYards]) { this._add(s.mesh); this.disposables.push(s); }
    const e0 = MP.encroachments;
    const xs = e0.map((p) => [p.x - p.r, p.x + p.r]); const zs = e0.map((p) => [p.z - p.r, p.z + p.r]);
    this._el('2.3', 'Encroachment clearance & resettlement', [Math.min(...xs.map((v) => v[0])), 0, Math.min(...zs.map((v) => v[0])), Math.max(...xs.map((v) => v[1])), 6, Math.max(...zs.map((v) => v[1]))], (p) => {
      const left = 1 - p;
      this.shackWalls.setProgress(left); this.shackRoofs.setProgress(left); this.shackYards.setProgress(left);
    }, { kind: 'earthworks', front: (p) => { const k = Math.min(e0.length - 1, Math.floor(p * e0.length)); return { x: e0[k].x, z: e0[k].z, radius: e0[k].r, kind: 'earthworks' }; },
      pickBoxes: e0.map((p) => [p.x - p.r, 0, p.z - p.r, p.x + p.r, 6, p.z + p.r]) });
  }

  /* ------------------------------------------------------------- runtime */

  /** Called by World before element.apply so 3.8 can see the overlay state. */
  noteState(pct) { this._overlayP = pct['3.6'] || 0; }

  surfaceAt(x, z) {
    const a = MP.apron;
    if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return 'concrete';
    if (Math.abs(x) <= SHW && z >= PAD20 && z <= PAD02) {
      if (Math.abs(x) <= OHW && z >= THR20 && z <= R.threshold02Z) return 'asphalt';
      return (this.widening && this.widening.progress > 0) || (this.surface && this.surface.progress > 0) ? 'asphalt' : 'sand';
    }
    const tw = MP.parallelTaxiway;
    if (Math.abs(x - tw.x) <= tw.width / 2 && z >= tw.z0 && z <= tw.z1 && this.taxiway.progress > 0) return 'asphalt';
    return null;
  }

  update(dt, t, env) {
    // Windsocks: point downwind, fill with wind speed.
    const w = env.wind;
    const yaw = Math.atan2(w.x, w.z);
    const fill = Math.min(1, w.speed / 8);
    for (const s of this.windsocks) {
      const flutter = Math.sin(t * 7 + s.phase) * 0.06 * fill + Math.sin(t * 2.3 + s.phase) * 0.04;
      s.pivot.rotation.set(0, yaw + flutter, 0);
      s.sock.rotation.set((1 - fill) * 1.1 + Math.sin(t * 3 + s.phase) * 0.03, 0, 0);
      s.sock.scale.set(1, 1, 0.75 + fill * 0.25);
    }
    const n = env.lights;
    for (const m of this.signMats) m.emissiveIntensity = n * 1.6;
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    for (const lf of this.lightFields) lf.field.dispose();
    if (this.oldRunway) this.oldRunway.geometry.dispose();
    if (this.oldMarks) this.oldMarks.geometry.dispose();
    if (this.rubber) this.rubber.geometry.dispose();
    if (this.oldLink) this.oldLink.geometry.dispose();
    if (this.socksPole) this.socksPole.geometry.dispose();
    if (this.pools) this.pools.geometry.dispose();
    if (this.standNumbers) this.standNumbers.geometry.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
