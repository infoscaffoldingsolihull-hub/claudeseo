import * as THREE from 'three';
import { makeRng, lerp, clamp } from '../engine/noise.js';
import { mergeGeometries, box, batteredBox, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight } from './terrain.js';
import { QUARRY, VILLAGE, HARBOUR, GRANITE_YARD, NILE, PYRAMIDS } from './layout.js';

/**
 * The living construction site: the quarry, the harbour and its barge fleet,
 * the granite receiving yard, the stone stockpiles beside the ramp, and
 * Heit el-Ghurab - the workers' town whose excavation rewrote what we know
 * about how the pyramid was actually resourced.
 */

/* -------------------------------------------------------------- quarry */

function quarryGeometry(rng) {
  const parts = [];
  const w = QUARRY.w;
  const d = QUARRY.d;

  // Extraction channels: the separation trenches cut around each block.
  const rows = 7;
  const cols = 9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.45) continue;
      const x = lerp(-w / 2 + 16, w / 2 - 16, c / (cols - 1));
      const z = lerp(-d / 2 + 16, d / 2 - 16, r / (rows - 1));
      const bench = Math.floor((r / rows) * 3);
      const y = bench * 3.6;
      // A block still attached on one face, ready to be split free.
      const bw = 2.2 + rng() * 1.4;
      const bh = 1.1 + rng() * 0.6;
      const bd = 1.3 + rng() * 0.7;
      parts.push(box(bw, bh, bd, x, y + bh / 2, z, rng() * 0.1 - 0.05));
      // Channel walls either side.
      parts.push(box(bw + 2.4, bh * 0.85, 0.5, x, y + bh * 0.42, z - bd / 2 - 0.7));
      parts.push(box(0.5, bh * 0.85, bd + 1.4, x - bw / 2 - 0.7, y + bh * 0.42, z));
    }
  }

  // Haulage ramp climbing out of the quarry to the north-west.
  const rampSegs = 12;
  for (let i = 0; i < rampSegs; i++) {
    const t = i / rampSegs;
    const y = lerp(0, QUARRY.depth + 1.5, t);
    const x = lerp(-w / 2 + 6, -w / 2 - 34, t);
    parts.push(box(26, Math.max(1.2, y), 16, x, y / 2, -d / 2 + 30));
  }

  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 1.8);
  return geo;
}

/* ------------------------------------------------------------- village */

function mudbrickBuilding(w, d, h, rng, { roof = true, courtyard = false } = {}) {
  const parts = [];
  const th = 0.55;
  parts.push(box(w, h, th, 0, h / 2, -d / 2));
  parts.push(box(w, h, th, 0, h / 2, d / 2));
  parts.push(box(th, h, d, -w / 2, h / 2, 0));
  // Doorway on the east wall.
  const gate = 1.1;
  const seg = (d - gate) / 2;
  parts.push(box(th, h, seg, w / 2, h / 2, -(gate + seg) / 2));
  parts.push(box(th, h, seg, w / 2, h / 2, (gate + seg) / 2));
  parts.push(box(th, h - 1.9, gate, w / 2, h - (h - 1.9) / 2, 0));
  if (roof && !courtyard) parts.push(box(w + 0.3, 0.28, d + 0.3, 0, h + 0.14, 0));
  // Roof beams poking out, as they do in mud-brick construction.
  const beams = Math.max(2, Math.round(d / 1.5));
  for (let i = 0; i < beams; i++) {
    const z = lerp(-d / 2 + 0.5, d / 2 - 0.5, i / (beams - 1 || 1));
    parts.push(box(w + 0.9, 0.14, 0.14, 0, h - 0.22, z));
  }
  return mergeGeometries(parts);
}

function villageGeometry(rng) {
  const parts = [];
  const W = VILLAGE.w;
  const D = VILLAGE.d;

  // Four gallery blocks: long dormitory buildings in parallel rows.
  const galleries = 4;
  for (let g = 0; g < galleries; g++) {
    const gz = lerp(-D / 2 + 26, D / 2 - 26, g / (galleries - 1));
    const gw = W * 0.62;
    const gd = 9.5;
    const cells = 11;
    for (let c = 0; c < cells; c++) {
      const cx = lerp(-gw / 2, gw / 2, c / (cells - 1));
      const geo = mudbrickBuilding(gw / cells - 0.35, gd, 2.8 + rng() * 0.3, rng);
      geo.translate(cx, 0, gz);
      parts.push(geo);
    }
    // Colonnaded portico along the front of each gallery.
    for (let c = 0; c < cells + 1; c++) {
      const cx = lerp(-gw / 2 - 1, gw / 2 + 1, c / cells);
      parts.push(box(0.32, 2.5, 0.32, cx, 1.25, gz + gd / 2 + 1.6));
    }
    parts.push(box(gw + 3, 0.24, 3.4, 0, 2.6, gz + gd / 2 + 1.6));
  }

  // Bakery and brewery compound with conical bread ovens.
  const bx = W / 2 - 40;
  const bz = -D / 2 + 32;
  parts.push(mudbrickBuilding(22, 16, 3.2, rng, { courtyard: true }).translate(bx, 0, bz));
  for (let i = 0; i < 10; i++) {
    const ox = bx - 8 + (i % 5) * 4;
    const oz = bz - 4 + Math.floor(i / 5) * 6;
    parts.push(box(1.5, 1.15, 1.5, ox, 0.58, oz));
    parts.push(box(1.05, 0.7, 1.05, ox, 1.5, oz));
    parts.push(box(0.55, 0.4, 0.55, ox, 2.05, oz));
  }

  // Copper workshop and the royal administrative building.
  parts.push(mudbrickBuilding(18, 13, 3.6, rng).translate(-W / 2 + 30, 0, D / 2 - 26));
  parts.push(mudbrickBuilding(26, 18, 4.2, rng).translate(-W / 2 + 34, 0, -D / 2 + 30));

  // Enclosure wall with a single gate on the west.
  const th = 0.9;
  const h = 3.4;
  parts.push(box(W, h, th, 0, h / 2, -D / 2 - 6));
  parts.push(box(W, h, th, 0, h / 2, D / 2 + 6));
  parts.push(box(th, h, D + 12, W / 2 + 6, h / 2, 0));
  const gate = 6;
  const seg = (D + 12 - gate) / 2;
  parts.push(box(th, h, seg, -W / 2 - 6, h / 2, -(gate + seg) / 2));
  parts.push(box(th, h, seg, -W / 2 - 6, h / 2, (gate + seg) / 2));

  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 1.6);
  return geo;
}

/** The Wall of the Crow: a 200 m limestone wall separating town from necropolis. */
function wallOfTheCrowGeometry() {
  const parts = [];
  const len = 196;
  const h = 10;
  const gate = 7.2;
  const seg = (len - gate) / 2;
  parts.push(batteredBox(9.6, 7.2, seg, seg, h, 0, 0, -(gate + seg) / 2));
  parts.push(batteredBox(9.6, 7.2, seg, seg, h, 0, 0, (gate + seg) / 2));
  // Lintel over the gate.
  parts.push(box(9.6, 2.4, gate + 1.2, 0, h - 1.2, 0));
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 2.6);
  return geo;
}

/* -------------------------------------------------------------- boats */

/**
 * Nile cargo barge.  Old Kingdom stone barges were broad, shallow, papyriform
 * craft steered with quarter rudders and towed by rowing boats.
 */
function bargeGeometry(length, beam, cargo) {
  const parts = [];
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const taper = Math.sin(Math.PI * t);
    const w = beam * (0.35 + taper * 0.65);
    const x = lerp(-length / 2, length / 2, t);
    const sheer = Math.pow(Math.abs(t - 0.5) * 2, 2.2) * length * 0.055;
    parts.push(box(length / segs + 0.15, 1.5, w, x, 0.75 + sheer * 0.5, 0));
    // Gunwale.
    for (const side of [-1, 1]) {
      parts.push(box(length / segs + 0.15, 0.34, 0.3, x, 1.62 + sheer, side * (w / 2 - 0.15)));
    }
  }
  // Papyriform prow and stern finials.
  for (const end of [-1, 1]) {
    parts.push(box(1.6, 2.4, 0.9, end * (length / 2 + 0.4), 2.3, 0));
    parts.push(box(0.9, 1.0, 0.7, end * (length / 2 + 0.9), 3.4, 0));
  }
  // Deck.
  parts.push(box(length * 0.82, 0.22, beam * 0.8, 0, 1.55, 0));
  // Steering oars aft.
  for (const side of [-1, 1]) {
    parts.push(box(0.22, 0.22, 5.0, -length / 2 + 3, 1.9, side * (beam / 2 + 0.4)));
    parts.push(box(0.16, 1.5, 1.1, -length / 2 + 3, 0.9, side * (beam / 2 + 2.6)));
  }
  if (cargo) {
    parts.push(box(cargo.w, cargo.h, cargo.d, cargo.x || 0, 1.66 + cargo.h / 2, 0));
  }
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 1.1);
  return geo;
}

/* ------------------------------------------------------------ sledges */

function sledgeGeometry(load) {
  const parts = [];
  const L = 4.6;
  const W = 2.2;
  for (const side of [-1, 1]) {
    parts.push(box(L, 0.34, 0.34, 0, 0.17, side * (W / 2 - 0.2)));
    parts.push(box(0.5, 0.5, 0.34, L / 2 - 0.1, 0.34, side * (W / 2 - 0.2)));
  }
  for (let i = 0; i < 4; i++) {
    parts.push(box(0.3, 0.22, W, -L / 2 + 0.7 + i * 1.1, 0.45, 0));
  }
  if (load) parts.push(box(load.w, load.h, load.d, 0, 0.56 + load.h / 2, 0));
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 0.9);
  return geo;
}

/* --------------------------------------------------------------- site */

export class SiteSystem {
  constructor(scene, textures, quality, collision) {
    this.group = new THREE.Group();
    this.group.name = 'site';
    scene.add(this.group);
    this.collision = collision;
    this.quality = quality;
    this.torchSites = [];
    this.rng = makeRng(4242);

    const lime = textures.limestone();
    const mud = textures.mudbrick();
    const wood = textures.wood();
    const gran = textures.granite();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    for (const set of [lime, mud, wood, gran]) {
      for (const t of Object.values(set)) t.anisotropy = aniso;
    }

    this.materials = {
      limestone: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        color: 0xcdbb97, roughness: 1, metalness: 0,
      }),
      stockpile: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true,
      }),
      mudbrick: new THREE.MeshStandardMaterial({
        map: mud.map, normalMap: mud.normalMap, roughnessMap: mud.roughnessMap,
        color: 0xc79a6c, roughness: 1, metalness: 0,
      }),
      timber: new THREE.MeshStandardMaterial({
        map: wood.map, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap,
        color: 0xa8834f, roughness: 0.88, metalness: 0,
      }),
      granite: new THREE.MeshStandardMaterial({
        map: gran.map, normalMap: gran.normalMap, roughnessMap: gran.roughnessMap,
        roughness: 0.52, metalness: 0.04,
      }),
    };

    this._buildQuarry();
    this._buildVillage();
    this._buildHarbour();
    this._buildGraniteYard();
    this._buildStockpiles();
  }

  _add(geometry, material, x, y, z, ry = 0, tag = '', collide = false) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = tag;
    this.group.add(mesh);
    if (collide && this.collision) this.collision.addObject3D(mesh, tag);
    return mesh;
  }

  _buildQuarry() {
    const geo = quarryGeometry(this.rng);
    const floorY = terrainHeight(QUARRY.x, QUARRY.z);
    this.quarry = this._add(geo, this.materials.limestone, QUARRY.x, floorY, QUARRY.z, 0, 'quarry');
    // Sledges waiting at the quarry face.
    for (let i = 0; i < 6; i++) {
      const x = QUARRY.x - 60 + i * 18;
      const z = QUARRY.z - QUARRY.d / 2 + 44;
      const y = terrainHeight(x, z);
      const sledge = sledgeGeometry({ w: 2.6, h: 1.2, d: 1.5 });
      this._add(sledge, this.materials.timber, x, y, z, this.rng() * 0.6 - 0.3, 'sledge');
    }
    this.torchSites.push({ x: QUARRY.x - QUARRY.w / 2 - 20, y: terrainHeight(QUARRY.x - QUARRY.w / 2 - 20, QUARRY.z) + 2.4, z: QUARRY.z, scale: 1 });
    this.torchSites.push({ x: QUARRY.x + 40, y: terrainHeight(QUARRY.x + 40, QUARRY.z + 40) + 2.4, z: QUARRY.z + 40, scale: 1 });
  }

  _buildVillage() {
    const y = terrainHeight(VILLAGE.x, VILLAGE.z);
    this.village = this._add(villageGeometry(this.rng), this.materials.mudbrick, VILLAGE.x, y, VILLAGE.z, 0, 'village');
    // Coarse colliders: the enclosure and the gallery blocks.
    const W = VILLAGE.w;
    const D = VILLAGE.d;
    for (let g = 0; g < 4; g++) {
      const gz = VILLAGE.z + lerp(-D / 2 + 26, D / 2 - 26, g / 3);
      this.collision.addCenteredBox(VILLAGE.x, y + 1.5, gz, W * 0.62, 3.0, 9.5, 'village');
    }

    const wx = VILLAGE.x - 40;
    const wz = VILLAGE.z - D / 2 - 62;
    const wy = terrainHeight(wx, wz);
    this.wallOfCrow = this._add(wallOfTheCrowGeometry(), this.materials.limestone, wx, wy, wz, 0, 'wall-of-the-crow');
    this.collision.addCenteredBox(wx, wy + 5, wz - 55, 10, 10, 96, 'wall-of-the-crow');
    this.collision.addCenteredBox(wx, wy + 5, wz + 55, 10, 10, 96, 'wall-of-the-crow');

    for (let i = 0; i < 8; i++) {
      const tx = VILLAGE.x - W / 2 + (i / 7) * W;
      const tz = VILLAGE.z - D / 2 - 8;
      this.torchSites.push({ x: tx, y: terrainHeight(tx, tz) + 2.6, z: tz, scale: 0.9 });
    }
  }

  _buildHarbour() {
    const y = HARBOUR.waterY;
    const parts = [];
    // Stone quay along the western edge of the basin.
    const quayLen = HARBOUR.d + 40;
    parts.push(box(16, 7.5, quayLen, -HARBOUR.w / 2 - 8, 3.75, 0));
    for (let i = 0; i < 9; i++) {
      const z = lerp(-quayLen / 2 + 10, quayLen / 2 - 10, i / 8);
      parts.push(box(1.0, 1.6, 1.0, -HARBOUR.w / 2 - 1.4, 8.3, z));   // mooring posts
    }
    // Slipway ramp up to the causeway level.
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      parts.push(box(22, Math.max(1, 8 + t * 16), 14, -HARBOUR.w / 2 - 26 - t * 26, (8 + t * 16) / 2, -quayLen / 2 + 40));
    }
    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 2.2);
    this.harbour = this._add(geo, this.materials.limestone, HARBOUR.x, y - 3.5, HARBOUR.z, 0, 'harbour', true);

    // Barge fleet: two granite carriers at the quay, two more mid-channel.
    this.barges = [];
    const bargeSpecs = [
      { x: HARBOUR.x - HARBOUR.w / 2 + 22, z: HARBOUR.z - 40, ry: 0, cargo: { w: 8, h: 2.6, d: 3.2 }, granite: true },
      { x: HARBOUR.x - HARBOUR.w / 2 + 22, z: HARBOUR.z + 26, ry: 0.04, cargo: { w: 6, h: 2.2, d: 3.0 }, granite: false },
      { x: HARBOUR.x + 40, z: HARBOUR.z - 10, ry: 0.5, cargo: null, granite: false },
      { x: NILE.x - 120, z: HARBOUR.z + 180, ry: 1.45, cargo: { w: 7, h: 2.4, d: 3.0 }, granite: true },
      { x: NILE.x + 90, z: HARBOUR.z - 320, ry: 1.62, cargo: null, granite: false },
    ];
    for (const spec of bargeSpecs) {
      const hull = bargeGeometry(28, 8.4, null);
      const mesh = this._add(hull, this.materials.timber, spec.x, HARBOUR.waterY - 0.9, spec.z, spec.ry, 'barge');
      this.barges.push({ mesh, phase: this.rng() * Math.PI * 2, baseY: HARBOUR.waterY - 0.9 });
      if (spec.cargo) {
        const load = box(spec.cargo.w, spec.cargo.h, spec.cargo.d, 0, 0, 0);
        scaleUvByWorldSize(load, 1.6);
        const cargoMesh = this._add(
          load,
          spec.granite ? this.materials.granite : this.materials.limestone,
          spec.x, HARBOUR.waterY + 0.9 + spec.cargo.h / 2, spec.z, spec.ry, 'barge-cargo'
        );
        this.barges[this.barges.length - 1].cargo = cargoMesh;
      }
    }

    for (let i = 0; i < 6; i++) {
      const z = HARBOUR.z + lerp(-HARBOUR.d / 2, HARBOUR.d / 2, i / 5);
      this.torchSites.push({ x: HARBOUR.x - HARBOUR.w / 2 - 8, y: HARBOUR.waterY + 5.2, z, scale: 1.1 });
    }
  }

  _buildGraniteYard() {
    const y = terrainHeight(GRANITE_YARD.x, GRANITE_YARD.z);
    const parts = [];
    const rows = 4;
    const cols = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.rng() < 0.25) continue;
        const x = lerp(-GRANITE_YARD.w / 2 + 8, GRANITE_YARD.w / 2 - 8, c / (cols - 1));
        const z = lerp(-GRANITE_YARD.d / 2 + 8, GRANITE_YARD.d / 2 - 8, r / (rows - 1));
        const h = 1.4 + this.rng() * 1.1;
        parts.push(box(5.4 + this.rng() * 2.6, h, 2.2 + this.rng() * 0.9, x, h / 2, z, this.rng() * 0.2 - 0.1));
      }
    }
    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 1.6);
    this.graniteYard = this._add(geo, this.materials.granite, GRANITE_YARD.x, y, GRANITE_YARD.z, 0, 'granite-yard', true);
    this.torchSites.push({ x: GRANITE_YARD.x, y: y + 2.6, z: GRANITE_YARD.z - GRANITE_YARD.d / 2 - 4, scale: 1 });
  }

  /**
   * Dressed blocks stacked beside the ramp, waiting to be placed.  The visible
   * volume of this pile is driven by the simulation's stone inventory, so a
   * supply crisis is visible from the cockpit as well as on the dashboard.
   */
  _buildStockpiles() {
    const k = PYRAMIDS.khufu;
    const rng = this.rng;
    const rows = 5;
    const cols = 22;
    const layers = 3;
    const total = rows * cols * layers;
    const geo = box(2.5, 1.15, 1.5, 0, 0, 0);
    scaleUvByWorldSize(geo, 1.1);
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));

    this.stockpile = new THREE.InstancedMesh(geo, this.materials.stockpile, total);
    const colors = new Float32Array(total * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const originX = k.x - 74;
    const originZ = k.z + 168;
    let i = 0;
    for (let layer = 0; layer < layers; layer++) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = originX + c * 2.75 + layer * 1.2 + (rng() - 0.5) * 0.16;
          const z = originZ + r * 1.75 + layer * 0.6 + (rng() - 0.5) * 0.16;
          const y = terrainHeight(x, z) + 0.6 + layer * 1.18;
          q.setFromEuler(new THREE.Euler(0, (rng() - 0.5) * 0.09, 0));
          p.set(x, y, z);
          m.compose(p, q, s);
          this.stockpile.setMatrixAt(i, m);
          const v = 0.82 + rng() * 0.32;
          colors[i * 3] = v;
          colors[i * 3 + 1] = v * 0.97;
          colors[i * 3 + 2] = v * 0.9;
          i++;
        }
      }
    }
    this.stockpile.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.stockpile.instanceMatrix.needsUpdate = true;
    this.stockpile.castShadow = true;
    this.stockpile.receiveShadow = true;
    this.stockpile.name = 'stone-stockpile';
    this.stockpileCapacity = total;
    this.group.add(this.stockpile);

    // Idle sledges by the stockpile.
    for (let j = 0; j < 5; j++) {
      const x = originX - 9;
      const z = originZ + j * 4.4;
      this._add(sledgeGeometry(null), this.materials.timber, x, terrainHeight(x, z), z, Math.PI / 2 + (rng() - 0.5) * 0.2, 'sledge');
    }
    for (let j = 0; j < 4; j++) {
      const x = originX + j * 22;
      const z = originZ - 8;
      this.torchSites.push({ x, y: terrainHeight(x, z) + 2.4, z, scale: 1 });
    }
  }

  /** 0..1 — how full the dressed-block stockpile appears. */
  setStockpileLevel(fraction) {
    if (!this.stockpile) return;
    this.stockpile.count = Math.round(clamp(fraction, 0, 1) * this.stockpileCapacity);
  }

  update(dt, elapsed) {
    // Barges ride the swell of the basin.
    for (const b of this.barges) {
      const bob = Math.sin(elapsed * 0.55 + b.phase) * 0.16;
      const roll = Math.sin(elapsed * 0.4 + b.phase * 1.7) * 0.014;
      b.mesh.position.y = b.baseY + bob;
      b.mesh.rotation.z = roll;
      if (b.cargo) {
        b.cargo.position.y = b.baseY + 1.8 + bob;
        b.cargo.rotation.z = roll;
      }
    }
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
