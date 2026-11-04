import * as THREE from 'three';
import { hollowRoom, gableRoof, scaleUvByWorldSize, box } from './geobuild.js';
import { PYRAMIDS, KHAFRE_INTERIOR, MENKAURE_INTERIOR } from './layout.js';

/**
 * The interiors of Khafre's and Menkaure's pyramids.
 *
 * Khufu's interior is built by InteriorSystem itself, in coordinates that
 * happen to be world coordinates because Khufu sits at the origin.  The other
 * two pyramids stand hundreds of metres away, so this module works in a local
 * frame - X east of the pyramid's own axis, Y above its base course, Z north-
 * negative - and TombBuilder maps that frame into the shared interior scene.
 *
 * All three interiors live in one scene: they are far enough apart that the
 * fog closes long before one is visible from another, and a single scene keeps
 * one collision world, one torch budget and one set of merged draw calls.
 */

const DEG = Math.PI / 180;

/**
 * Geometry helper bound to one pyramid's local frame.
 *
 * Every method takes local coordinates and pushes world-space geometry into
 * the caller's material buckets, so the tomb builders below read as a
 * description of the monument rather than as coordinate arithmetic.
 */
export class TombBuilder {
  constructor(ctx) {
    const p = ctx.pyramid;
    this.pyramid = p;
    this.ox = p.x;
    this.oy = p.baseY;
    this.oz = p.z;
    this.site = ctx.site;
    this.parts = ctx.parts;
    this.colliders = ctx.colliders;
    this.torchSites = ctx.torchSites;
    this.nodes = ctx.nodes;
    this.viewpoints = ctx.viewpoints;
    this.relics = ctx.relics;
    this.wall = ctx.wall || 1.1;
    this.slope = (ctx.passageAngleDeg || 26.5) * DEG;
    this.passageWidth = ctx.passageWidth || 1.05;
    this.passageHeight = ctx.passageHeight || 1.2;
  }

  /** Z of the pyramid's north face at a given height above the base. */
  faceZ(height) {
    const p = this.pyramid;
    return -(p.baseLength / 2) * (1 - height / p.designHeight);
  }

  world(lx, ly, lz) {
    return new THREE.Vector3(this.ox + lx, this.oy + ly, this.oz + lz);
  }

  /** Axis-aligned box in the local frame. */
  part(bucket, w, h, d, lx, ly, lz) {
    this.parts[bucket].push(box(w, h, d, this.ox + lx, this.oy + ly, this.oz + lz));
    return this;
  }

  /** Box in a passage's tilted frame, as interior.js does for Khufu. */
  _tilted(w, h, d, lx, ly, lz, rx, cx, cy, cz) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeRotationX(rx);
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
    m.setPosition(cx + v.x, cy + v.y, cz + v.z);
    g.applyMatrix4(m);
    return g;
  }

  /**
   * A straight passage from (y0,z0) to (y1,z1) in the plane x = lx.
   *
   * The shell is four slabs in the tilted frame; collision is a staircase of
   * axis-aligned boxes, because the player's collider is axis-aligned and a
   * tilted floor would either catch or drop them.  Steps of 0.9 m sit inside
   * the 0.55 m interior step height once the slope is 26.5 degrees.
   */
  passage(bucket, lx, y0, z0, y1, z1, width, height, opts = {}) {
    const thickness = opts.thickness || this.wall;
    // Thin slabs: see the note in interior.js. Stacked passages otherwise
    // fill each other's corridors.
    const floorSlab = opts.floorSlab || 0.9;
    const ceilingSlab = opts.ceilingSlab || 0.6;
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    if (len < 1e-4) return this;
    const rx = -Math.atan2(dy, dz);
    const cx = this.ox + lx;
    const cy = this.oy + (y0 + y1) / 2;
    const cz = this.oz + (z0 + z1) / 2;
    const list = this.parts[bucket];

    list.push(this._tilted(width + thickness * 2, thickness, len, 0, -thickness / 2, 0, rx, cx, cy, cz));
    list.push(this._tilted(width + thickness * 2, thickness, len, 0, height + thickness / 2, 0, rx, cx, cy, cz));
    list.push(this._tilted(thickness, height, len, -width / 2 - thickness / 2, height / 2, 0, rx, cx, cy, cz));
    list.push(this._tilted(thickness, height, len, width / 2 + thickness / 2, height / 2, 0, rx, cx, cy, cz));

    const steps = Math.max(2, Math.ceil(Math.abs(dz) / 0.9));
    for (let i = 0; i < steps; i++) {
      const zA = this.oz + z0 + dz * (i / steps);
      const zB = this.oz + z0 + dz * ((i + 1) / steps);
      const yA = this.oy + y0 + dy * (i / steps);
      const yB = this.oy + y0 + dy * ((i + 1) / steps);
      const yFloor = Math.min(yA, yB);
      const yCeil = Math.max(yA, yB) + height;
      this.colliders.push({
        minX: cx - width / 2, maxX: cx + width / 2,
        minY: yFloor - floorSlab, maxY: yFloor,
        minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB), tag: 'passage-floor',
      });
      this.colliders.push({
        minX: cx - width / 2, maxX: cx + width / 2,
        minY: yCeil, maxY: yCeil + ceilingSlab,
        minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB), tag: 'passage-ceiling',
      });
    }
    // Stepped side walls: see the note in interior.js.
    for (let i = 0; i < steps; i++) {
      const zA = this.oz + z0 + dz * (i / steps);
      const zB = this.oz + z0 + dz * ((i + 1) / steps);
      const yA = this.oy + y0 + dy * (i / steps);
      const yB = this.oy + y0 + dy * ((i + 1) / steps);
      for (const side of [-1, 1]) {
        this.colliders.push({
          minX: side < 0 ? cx - width / 2 - thickness : cx + width / 2,
          maxX: side < 0 ? cx - width / 2 : cx + width / 2 + thickness,
          minY: Math.min(yA, yB) - 0.4,
          maxY: Math.max(yA, yB) + height + 0.4,
          minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB),
          tag: 'passage-wall',
        });
      }
    }
    return this;
  }

  /** Rectangular room with doorways, plus its collision shell. */
  room(bucket, lx, floorY, lz, w, d, h, openings = [], opts = {}) {
    const thickness = opts.thickness || this.wall;
    const cx = this.ox + lx;
    const cy = this.oy + floorY;
    const cz = this.oz + lz;
    const geo = hollowRoom(w, d, h, thickness, openings, opts);
    geo.translate(cx, cy, cz);
    scaleUvByWorldSize(geo, opts.uvUnit || 2.0);
    this.parts[bucket].push(geo);

    const hw = w / 2;
    const hd = d / 2;
    this.colliders.push({
      minX: cx - hw - thickness, maxX: cx + hw + thickness,
      minY: cy - 3, maxY: cy,
      minZ: cz - hd - thickness, maxZ: cz + hd + thickness, tag: 'room-floor',
    });
    if (opts.ceiling !== false) {
      this.colliders.push({
        minX: cx - hw - thickness, maxX: cx + hw + thickness,
        minY: cy + h, maxY: cy + h + 2,
        minZ: cz - hd - thickness, maxZ: cz + hd + thickness, tag: 'room-ceiling',
      });
    }
    const segmentsFor = (half, wallId) => {
      const holes = openings
        .filter((o) => o.wall === wallId)
        .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2])
        .sort((p, q) => p[0] - q[0]);
      const segs = [];
      let cursor = -half;
      for (const [a, b] of holes) {
        if (a > cursor) segs.push([cursor, a]);
        cursor = Math.max(cursor, b);
      }
      if (cursor < half) segs.push([cursor, half]);
      return segs;
    };
    for (const [wallId, horizontal] of [['n', true], ['s', true], ['w', false], ['e', false]]) {
      const half = horizontal ? hw : hd;
      for (const [a, b] of segmentsFor(half, wallId)) {
        if (horizontal) {
          const z = wallId === 'n' ? cz - hd - thickness : cz + hd;
          this.colliders.push({
            minX: cx + a, maxX: cx + b, minY: cy, maxY: cy + h + 1,
            minZ: z, maxZ: z + thickness, tag: 'room-wall',
          });
        } else {
          const x = wallId === 'w' ? cx - hw - thickness : cx + hw;
          this.colliders.push({
            minX: x, maxX: x + thickness, minY: cy, maxY: cy + h + 1,
            minZ: cz + a, maxZ: cz + b, tag: 'room-wall',
          });
        }
      }
    }
    return this;
  }

  /** Saddle roof over a room, as over Khafre's burial chamber. */
  gable(bucket, lx, ly, lz, w, d, rise) {
    const geo = gableRoof(w + this.wall * 2, d + this.wall * 2, rise, 0.95);
    geo.translate(this.ox + lx, this.oy + ly, this.oz + lz);
    scaleUvByWorldSize(geo, 1.8);
    this.parts[bucket].push(geo);
    this.colliders.push({
      minX: this.ox + lx - w / 2 - this.wall, maxX: this.ox + lx + w / 2 + this.wall,
      minY: this.oy + ly + rise - 0.4, maxY: this.oy + ly + rise + 1.6,
      minZ: this.oz + lz - d / 2 - this.wall, maxZ: this.oz + lz + d / 2 + this.wall,
      tag: 'gable',
    });
    return this;
  }

  torch(lx, ly, lz, scale = 0.8) {
    this.torchSites.push({ x: this.ox + lx, y: this.oy + ly, z: this.oz + lz, scale });
    return this;
  }

  /** Torches at a fixed spacing along a sloping run. */
  lineTorches(lx, y0, z0, y1, z1, spacing = 8) {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const n = Math.max(1, Math.floor(len / spacing));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      this.torch(lx + (i % 2 === 0 ? 0.42 : -0.42), y0 + (y1 - y0) * t + 0.78, z0 + (z1 - z0) * t, 0.55);
    }
    return this;
  }

  node(name, lx, ly, lz) {
    this.nodes[`${this.site}.${name}`] = this.world(lx, ly, lz);
    return this;
  }

  viewpoint(name, lx, ly, lz, yaw) {
    this.viewpoints[`${this.site}.${name}`] = { position: this.world(lx, ly, lz), yaw };
    return this;
  }
}

/* ------------------------------------------------------------------ Khafre */

/**
 * Khafre: two entrances on the north, a single long horizontal passage, and a
 * burial chamber cut into the bedrock with a gabled limestone roof.  Simpler
 * than Khufu's, and the plan Belzoni forced his way into in March 1818.
 */
export function buildKhafre(ctx) {
  const K = KHAFRE_INTERIOR;
  const b = new TombBuilder({
    ...ctx,
    site: 'khafre',
    pyramid: PYRAMIDS.khafre,
    passageAngleDeg: K.passageAngleDeg,
    passageWidth: K.passageWidth,
    passageHeight: K.passageHeight,
  });
  const relics = ctx.relics;
  const rng = ctx.rng;
  const PW = K.passageWidth;
  const PH = K.passageHeight;
  const slope = K.passageAngleDeg * DEG;
  const axis = K.upperEntrance.x;

  // ---- upper entrance, 11.54 m up the north face, granite-lined ----
  const entryY = K.upperEntrance.y;
  const entryZ = b.faceZ(entryY);
  b.passage('granite', axis, entryY, entryZ - 2.6, entryY, entryZ + 1.8, PW, PH);
  b.node('entrance', axis, entryY, entryZ - 0.9);
  b.viewpoint('entrance', axis, entryY, entryZ - 0.9, Math.PI);

  // ---- descending passage down to the horizontal run ----
  const horizY = K.horizontalY;
  const descLen = (entryY - horizY) / Math.sin(slope);
  const descEndZ = entryZ + 1.8 + descLen * Math.cos(slope);
  b.passage('granite', axis, entryY, entryZ + 1.8, horizY, descEndZ, PW, PH);
  b.lineTorches(axis, entryY, entryZ + 1.8, horizY, descEndZ, 8);
  b.node('descending', axis, entryY - 5, entryZ + 12);
  b.viewpoint('descending', axis, (entryY + horizY) / 2, (entryZ + descEndZ) / 2, Math.PI);

  // ---- the long horizontal passage to the chamber ----
  const bc = K.burialChamber;
  const chamberZ = 0;                       // the chamber sits on the pyramid's axis
  const chamberNorthZ = chamberZ - bc.d / 2;
  b.passage('limestone', axis, horizY, descEndZ, horizY, chamberNorthZ - 2.2, PW, PH);
  b.lineTorches(axis, horizY, descEndZ, horizY, chamberNorthZ - 2.2, 9);
  // The last few metres step down and widen into the chamber's doorway.
  b.passage('limestone', axis, horizY, chamberNorthZ - 2.2, bc.floorY, chamberNorthZ, PW, PH + 0.7);

  // ---- the burial chamber ----
  b.room('limestone', axis, bc.floorY, chamberZ, bc.w, bc.d, bc.wallH,
    [{ wall: 'n', offset: 0, width: PW, height: PH + 0.7, sill: 0 }],
    { ceiling: false, uvUnit: 1.8 });
  b.gable('limestone', axis, bc.floorY + bc.wallH, chamberZ, bc.w, bc.d, bc.apexH - bc.wallH);
  b.node('burialChamber', axis, bc.floorY, chamberZ);
  b.viewpoint('burialChamber', axis + bc.w / 2 - 2.4, bc.floorY, chamberZ, Math.PI * 0.5);
  for (const side of [-1, 1]) {
    b.torch(axis + side * (bc.w / 2 - 3.6), bc.floorY + 2.1, chamberZ - bc.d / 2 + 0.6, 1.0);
    b.torch(axis + side * (bc.w / 2 - 3.6), bc.floorY + 2.1, chamberZ + bc.d / 2 - 0.6, 1.0);
  }

  const wx = b.ox + axis;
  const wy = b.oy + bc.floorY;
  const wz = b.oz + chamberZ;

  // The granite sarcophagus, sunk to its lip in the chamber floor at the west
  // end - Belzoni found it empty but for cattle bone and an Arabic inscription.
  const sar = K.sarcophagus;
  const sx = wx - bc.w / 2 + 2.4;
  const sunk = 0.42;
  for (const g of [
    box(sar.w, sar.h - sunk, 0.16, sx, wy + (sar.h - sunk) / 2, wz - sar.d / 2),
    box(sar.w, sar.h - sunk, 0.16, sx, wy + (sar.h - sunk) / 2, wz + sar.d / 2),
    box(0.16, sar.h - sunk, sar.d, sx - sar.w / 2, wy + (sar.h - sunk) / 2, wz),
    box(0.16, sar.h - sunk, sar.d, sx + sar.w / 2, wy + (sar.h - sunk) / 2, wz),
    box(sar.w, 0.12, sar.d, sx, wy - sunk + 0.06, wz),
  ]) ctx.parts.granite.push(g);
  ctx.colliders.push({
    minX: sx - sar.w / 2 - 0.1, maxX: sx + sar.w / 2 + 0.1,
    minY: wy, maxY: wy + sar.h - sunk,
    minZ: wz - sar.d / 2 - 0.1, maxZ: wz + sar.d / 2 + 0.1, tag: 'sarcophagus',
  });
  relics.brokenLid(sx + 2.3, wy, wz + 0.2, 0.18, sar.w, sar.d + 0.2);
  relics.relic({
    id: 'relic-khafre-sarcophagus',
    name: 'Khafre’s Sarcophagus',
    site: 'khafre',
    x: sx, y: wy + 1.3, z: wz,
    text:
      'Polished Aswan granite, sunk to its lip in the chamber floor so that it could never be dragged ' +
      'out. Belzoni broke in on 2 March 1818 and found it open, empty, and already inscribed by earlier ' +
      'visitors — the tomb had been robbed more than two thousand years before him.',
    pm: 'Work package 6.5 — the burial chamber. Placing the box before roofing is an irreversible sequence.',
  });

  // Belzoni's own graffito on the south wall, and the register above it.
  relics.glyphPanel(wx - 2.0, wy + 1.4, wz + bc.d / 2 - 0.06, 5.2, 1.7, 's', { tile: 2.2 });
  relics.glyphPanel(wx + 3.4, wy + 1.5, wz - bc.d / 2 + 0.06, 4.2, 1.6, 'n', { tile: 2.2, painted: true });
  relics.cartouche(wx - bc.w / 2 + 0.9, wy + 2.1, wz - 1.1, 1.2, 'e');
  relics.cartouche(wx - bc.w / 2 + 0.9, wy + 2.1, wz + 1.1, 1.2, 'e');
  relics.relic({
    id: 'relic-khafre-graffito',
    name: 'Belzoni’s Graffito',
    site: 'khafre',
    x: wx - 2.0, y: wy + 1.8, z: wz + bc.d / 2 - 0.4,
    text:
      `Painted in lamp-black on the south wall: “${K.graffito}”. Giovanni Belzoni — circus strongman, ` +
      'hydraulic engineer, then excavator — cut through 30 m of masonry on a hunch about where the ' +
      'passage had to be. He was right, and the graffito is still there.',
    pm: 'A reminder that the record of a project outlives the project: document your closure.',
  });

  // Grave goods, gathered at the east end where the chamber is widest.
  relics.offeringTable(wx + bc.w / 2 - 2.4, wy, wz - 0.9, Math.PI * 0.5, { site: 'khafre' });
  relics.canopicChest(wx + bc.w / 2 - 2.2, wy, wz + 1.3, Math.PI * 0.5, { site: 'khafre' });
  relics.jarCluster(wx + bc.w / 2 - 4.2, wy, wz + 1.7, 0, 5, rng);
  relics.kaStatue(wx - 1.2, wy, wz + bc.d / 2 - 1.0, Math.PI, {
    site: 'khafre',
    name: 'Ka-Statue of Khafre',
    text:
      'The seated diorite Khafre from the valley temple is the finest sculpture of the Old Kingdom: ' +
      'Horus as a falcon folds his wings around the back of the king’s head. This is its double, left ' +
      'where the ka could reach it.',
  });

  // ---- the lower entrance, out in the pavement north of the pyramid ----
  const lowY = 0;
  const lowZ = b.faceZ(0) - K.lowerEntrance.groundOffset;
  const lowFloorY = -4.6;
  const lowDescLen = (lowY - lowFloorY) / Math.sin(slope);
  const lowDescEndZ = lowZ + 1.4 + lowDescLen * Math.cos(slope);
  b.passage('rough', axis, lowY, lowZ - 1.6, lowY, lowZ + 1.4, PW, PH);
  b.passage('rough', axis, lowY, lowZ + 1.4, lowFloorY, lowDescEndZ, PW, PH);
  b.node('lowerEntrance', axis, lowY, lowZ - 0.6);
  b.viewpoint('lowerEntrance', axis, lowY, lowZ - 0.6, Math.PI);

  // Horizontal run south, past the subsidiary chamber, then up to the main passage.
  const sub = K.subsidiaryChamber;
  const subCenterZ = lowDescEndZ + 12;
  // The passage runs through the chamber rather than past it. It used to sit
  // to one side with its doorway in a wall the passage never reached, so there
  // was no way into it at all.
  b.passage('rough', axis, lowFloorY, lowDescEndZ, lowFloorY, subCenterZ - sub.d / 2, PW, PH);
  b.room('rough', axis, lowFloorY, subCenterZ, sub.w, sub.d, sub.h, [
    { wall: 'n', offset: 0, width: PW, height: PH, sill: 0 },
    { wall: 's', offset: 0, width: PW, height: PH, sill: 0 },
  ], { uvUnit: 2.2 });
  b.passage('rough', axis, lowFloorY, subCenterZ + sub.d / 2, lowFloorY, subCenterZ + sub.d / 2 + 6, PW, PH);
  b.node('subsidiary', axis, lowFloorY, subCenterZ);
  b.viewpoint('subsidiary', axis + sub.w / 2 - 1.6, lowFloorY, subCenterZ, Math.PI * 0.5);
  b.torch(axis - sub.w / 2 + 0.8, lowFloorY + 1.7, subCenterZ - 1.0, 0.75);
  b.torch(axis + sub.w / 2 - 0.8, lowFloorY + 1.7, subCenterZ + 1.0, 0.75);
  b.lineTorches(axis, lowFloorY, lowDescEndZ, lowFloorY, subCenterZ - sub.d / 2, 9);

  // The ascending link that joins the lower system to the main horizontal passage.
  const joinZ = subCenterZ + sub.d / 2 + 6;
  const riseLen = (horizY - lowFloorY) / Math.sin(slope);
  b.passage('rough', axis, lowFloorY, joinZ, horizY, joinZ + riseLen * Math.cos(slope), PW, PH);

  relics.toolCache(b.ox + axis - sub.w / 2 + 1.6, b.oy + lowFloorY, b.oz + subCenterZ + 0.6, 0.3, {
    site: 'khafre',
    id: 'relic-khafre-tools',
  });

  return b;
}

/* --------------------------------------------------------------- Menkaure */

/**
 * Menkaure: the smallest of the three and the most elaborate inside - a
 * panelled chamber that is the only decorated room in any Giza pyramid, six
 * niches whose purpose is still argued over, and a granite burial chamber
 * roofed with a barrel vault cut from the underside of paired slabs.
 */
export function buildMenkaure(ctx) {
  const M = MENKAURE_INTERIOR;
  const b = new TombBuilder({
    ...ctx,
    site: 'menkaure',
    pyramid: PYRAMIDS.menkaure,
    passageAngleDeg: M.passageAngleDeg,
    passageWidth: M.passageWidth,
    passageHeight: M.passageHeight,
  });
  const relics = ctx.relics;
  const rng = ctx.rng;
  const PW = M.passageWidth;
  const PH = M.passageHeight;
  const slope = M.passageAngleDeg * DEG;
  const axis = M.entrance.x;

  // ---- entrance and descending passage ----
  const entryY = M.entrance.y;
  const entryZ = b.faceZ(entryY);
  const pan = M.panelledChamber;
  b.passage('granite', axis, entryY, entryZ - 2.4, entryY, entryZ + 1.6, PW, PH);
  b.node('entrance', axis, entryY, entryZ - 0.9);
  b.viewpoint('entrance', axis, entryY, entryZ - 0.9, Math.PI);

  const descLen = (entryY - pan.floorY) / Math.sin(slope);
  const descEndZ = entryZ + 1.6 + descLen * Math.cos(slope);
  b.passage('granite', axis, entryY, entryZ + 1.6, pan.floorY, descEndZ, PW, PH);
  b.lineTorches(axis, entryY, entryZ + 1.6, pan.floorY, descEndZ, 8);
  b.viewpoint('descending', axis, (entryY + pan.floorY) / 2, (entryZ + descEndZ) / 2, Math.PI);

  // ---- the panelled chamber ----
  const panZ = descEndZ + pan.d / 2 + 0.3;
  b.room('dressed', axis, pan.floorY, panZ, pan.w, pan.d, pan.h,
    [
      { wall: 'n', offset: 0, width: PW, height: PH, sill: 0 },
      { wall: 's', offset: 0, width: PW, height: PH, sill: 0 },
    ], { uvUnit: 1.4 });
  b.node('panelledChamber', axis, pan.floorY, panZ);
  b.viewpoint('panelledChamber', axis, pan.floorY, panZ - pan.d / 2 + 0.9, Math.PI);
  b.torch(axis - pan.w / 2 + 0.5, pan.floorY + 1.8, panZ, 0.7);
  b.torch(axis + pan.w / 2 - 0.5, pan.floorY + 1.8, panZ, 0.7);

  const pwx = b.ox + axis;
  const pwy = b.oy + pan.floorY;
  const pwz = b.oz + panZ;
  // The palace-façade panelling this chamber is named for, on both side walls.
  relics.panelling(pwx - pan.w / 2 + 0.08, pwy, pwz, pan.d - 0.3, pan.h - 0.4, 'e', 4);
  relics.panelling(pwx + pan.w / 2 - 0.08, pwy, pwz, pan.d - 0.3, pan.h - 0.4, 'w', 4);
  relics.starCeiling(pwx, pwy + pan.h - 0.06, pwz, pan.w - 0.2, pan.d - 0.2, rng);
  relics.relic({
    id: 'relic-menkaure-panelling',
    name: 'The Panelled Chamber',
    site: 'menkaure',
    x: pwx, y: pwy + 1.7, z: pwz,
    text:
      'Carved with the recessed niching of a palace façade — the only decoration in the interior of any ' +
      'Giza pyramid. The pattern imitates the mud-brick and matting front of an archaic royal enclosure: ' +
      'the tomb as the king’s house, rendered in stone.',
    pm: 'Work package 6.3 — a late scope addition, and the only decorative package in the WBS.',
  });

  // ---- horizontal passage with its three portcullis slabs ----
  const main = M.mainChamber;
  const mainZ = panZ + pan.d / 2 + 7.4;
  const mainNorthZ = mainZ - main.d / 2;
  b.passage('granite', axis, pan.floorY, panZ + pan.d / 2, pan.floorY, mainNorthZ - 2.4, PW, PH + 0.5);
  for (let i = 0; i < M.portcullisCount; i++) {
    const pz = panZ + pan.d / 2 + 1.6 + i * 1.5;
    // Raised in their grooves, as they are today: the slabs were lowered on
    // the day of the funeral and later smashed through by robbers.
    b.part('granite', PW + 0.5, 1.35, 0.34, axis, pan.floorY + PH + 0.42, pz);
    b.part('granite', 0.3, 1.8, 0.4, axis - PW / 2 - 0.28, pan.floorY, pz);
    b.part('granite', 0.3, 1.8, 0.4, axis + PW / 2 + 0.28, pan.floorY, pz);
  }
  // The last stretch steps down into the main chamber.
  b.passage('granite', axis, pan.floorY, mainNorthZ - 2.4, main.floorY, mainNorthZ, PW, PH + 0.5);

  // ---- the main (ante) chamber, running east-west ----
  const nicheLx = axis + 4.2;
  const burLx = axis - 4.6;
  b.room('dressed', axis, main.floorY, mainZ, main.w, main.d, main.h,
    [
      { wall: 'n', offset: 0, width: PW, height: PH + 0.5, sill: 0 },
      // The stair down to the niches, and the descent to the burial chamber.
      { wall: 's', offset: nicheLx - axis, width: PW, height: PH + 0.4, sill: 0 },
      { wall: 's', offset: burLx - axis, width: PW, height: PH + 0.4, sill: 0 },
    ], { uvUnit: 1.7 });
  b.node('mainChamber', axis, main.floorY, mainZ);
  b.viewpoint('mainChamber', axis + main.w / 2 - 2.4, main.floorY, mainZ, Math.PI * 0.5);
  for (const side of [-1, 1]) {
    b.torch(axis + side * (main.w / 2 - 1.1), main.floorY + 2.0, mainZ - 1.1, 0.95);
    b.torch(axis + side * (main.w / 2 - 1.1), main.floorY + 2.0, mainZ + 1.1, 0.95);
  }
  b.torch(axis, main.floorY + 2.0, mainZ + 1.2, 0.8);

  const mwx = b.ox + axis;
  const mwy = b.oy + main.floorY;
  const mwz = b.oz + mainZ;
  relics.glyphPanel(mwx - 3.6, mwy + 1.4, mwz - main.d / 2 + 0.05, 4.4, 1.7, 'n', { tile: 2.2, painted: true });
  relics.glyphPanel(mwx + 3.8, mwy + 1.4, mwz + main.d / 2 - 0.05, 4.0, 1.7, 's', { tile: 2.2 });
  relics.falseDoor(mwx + main.w / 2 - 0.12, mwy, mwz, 2.9, 'w', {
    site: 'menkaure',
    id: 'relic-menkaure-false-door',
    name: 'False Door of Menkaure',
    text:
      'Not a door but a threshold: carved so the ka can pass out to take the offerings laid before it, ' +
      'and back again. The drum across the top imitates the rolled-up reed mat of a real doorway.',
    pm: 'Work package 8.4 — the interface between the tomb and the mortuary cult that had to keep running.',
  });
  relics.modelBoat(mwx - main.w / 2 + 3.0, mwy, mwz - main.d / 2 + 1.1, 0, { site: 'menkaure' });
  relics.anubisShrine(mwx - 1.4, mwy, mwz + main.d / 2 - 0.9, Math.PI, { site: 'menkaure' });
  relics.jarCluster(mwx + 1.8, mwy, mwz + main.d / 2 - 0.7, Math.PI, 6, rng);

  // ---- the six niches, reached by a stair down from the main chamber ----
  const nic = M.nicheChamber;
  const nicheZ = mainZ + main.d / 2 + 5.0;
  b.passage('rough', nicheLx, main.floorY, mainZ + main.d / 2, nic.floorY, nicheZ - nic.d / 2, PW, PH + 0.4);
  b.room('rough', nicheLx, nic.floorY, nicheZ, nic.w, nic.d, nic.h,
    [{ wall: 'n', offset: 0, width: PW, height: PH + 0.4, sill: 0 }], { uvUnit: 1.5 });
  b.node('nicheChamber', nicheLx, nic.floorY, nicheZ);
  b.viewpoint('nicheChamber', nicheLx - nic.w / 2 + 1.2, nic.floorY, nicheZ, -Math.PI * 0.5);
  b.torch(nicheLx - nic.w / 2 + 0.4, nic.floorY + 1.7, nicheZ, 0.65);
  b.torch(nicheLx + nic.w / 2 - 0.4, nic.floorY + 1.7, nicheZ, 0.65);
  // Four niches in the east wall, two in the north: cut but never used.
  const nwx = b.ox + nicheLx;
  const nwy = b.oy + nic.floorY;
  const nwz = b.oz + nicheZ;
  for (let i = 0; i < 4; i++) {
    const nz = nwz - nic.d / 2 + 0.5 + i * ((nic.d - 1.0) / 3);
    ctx.parts.rough.push(box(0.9, 1.55, 0.62, nwx + nic.w / 2 + 0.2, nwy + 0.78, nz));
  }
  for (let i = 0; i < 2; i++) {
    const nx = nwx - 1.0 + i * 2.0;
    ctx.parts.rough.push(box(0.62, 1.55, 0.9, nx, nwy + 0.78, nwz - nic.d / 2 - 0.2));
  }
  relics.relic({
    id: 'relic-menkaure-niches',
    name: 'The Six Niches',
    site: 'menkaure',
    x: nwx, y: nwy + 1.6, z: nwz,
    text:
      'Six cuttings, four in one wall and two in another, finished to a standard nothing else down here ' +
      'reaches. Storage for canopic equipment, emplacements for statues of the royal women, or an ' +
      'abandoned change of plan — the argument has run for a century and a half.',
    pm: 'The clearest surviving evidence of undocumented scope change anywhere on the plateau.',
  });
  relics.stela(nwx - nic.w / 2 + 0.8, nwy, nwz + 0.4, Math.PI * 0.5, {
    site: 'menkaure',
    id: 'relic-menkaure-stela',
    name: 'Foundation Stela',
    height: 1.7,
    text:
      'The founding record: the king’s Horus name, the year of the count, and the name of the pyramid — ' +
      '“Menkaure is Divine”. The Egyptians dated by cattle counts, not regnal years, which is why the ' +
      'chronology of this dynasty is still argued about.',
  });

  // ---- the granite burial chamber under a barrel vault ----
  const bur = M.burialChamber;
  const burStartZ = mainZ + main.d / 2;
  const burCz = burStartZ + 7.4 + bur.d / 2;
  b.passage('granite', burLx, main.floorY, burStartZ, bur.floorY, burCz - bur.d / 2, PW, PH + 0.4);
  b.room('granite', burLx, bur.floorY, burCz, bur.w, bur.d, bur.h,
    [{ wall: 'n', offset: 0, width: PW, height: PH + 0.4, sill: 0 }],
    { ceiling: false, uvUnit: 1.4 });
  b.node('burialChamber', burLx, bur.floorY, burCz);
  b.viewpoint('burialChamber', burLx + bur.w / 2 - 1.5, bur.floorY, burCz, Math.PI * 0.5);
  b.torch(burLx - bur.w / 2 + 0.5, bur.floorY + 2.0, burCz - 0.7, 0.9);
  b.torch(burLx + bur.w / 2 - 0.5, bur.floorY + 2.0, burCz + 0.7, 0.9);

  // The vault: paired slabs laid as a gable, then hollowed underneath to a
  // half-round. Approximated as stepped courses closing to a curve.
  const bwx = b.ox + burLx;
  const bwy = b.oy + bur.floorY;
  const bwz = b.oz + burCz;
  const vaultSteps = 7;
  for (let i = 0; i < vaultSteps; i++) {
    const t = (i + 0.5) / vaultSteps;
    const half = (bur.w / 2 + 0.4) * Math.cos((t * Math.PI) / 2);
    const yy = bwy + bur.h + (bur.w / 2) * Math.sin((t * Math.PI) / 2) * 0.62;
    const thick = (bur.w / 2) * 0.62 / vaultSteps + 0.16;
    ctx.parts.granite.push(box((half + 0.9) * 2, thick, bur.d + 1.8, bwx, yy, bwz));
  }
  ctx.colliders.push({
    minX: bwx - bur.w / 2 - 0.5, maxX: bwx + bur.w / 2 + 0.5,
    minY: bwy + bur.h - 0.2, maxY: bwy + bur.h + 2.4,
    minZ: bwz - bur.d / 2 - 0.5, maxZ: bwz + bur.d / 2 + 0.5, tag: 'vault',
  });

  // The emplacement where the basalt sarcophagus stood until 1838.
  const sar = M.sarcophagus;
  ctx.parts.granite.push(
    box(sar.w + 0.5, 0.14, sar.d + 0.5, bwx - bur.w / 2 + 1.9, bwy + 0.07, bwz)
  );
  relics.relic({
    id: 'relic-menkaure-sarcophagus',
    name: 'The Empty Emplacement',
    site: 'menkaure',
    x: bwx - bur.w / 2 + 1.9, y: bwy + 1.1, z: bwz,
    text:
      'The basalt sarcophagus that stood here was carved with the same palace-façade panelling as the ' +
      'chamber above. It was shipped for the British Museum in 1838 aboard the Beatrice, which went ' +
      'down off Cartagena. It is still on the sea floor.',
    pm: 'Transport risk realised after handover — the one failure mode the register never closes.',
  });
  relics.offeringTable(bwx + bur.w / 2 - 1.6, bwy, bwz - 0.3, -Math.PI * 0.5, {
    site: 'menkaure',
    id: 'relic-menkaure-offering',
  });
  relics.glyphPanel(bwx, bwy + 1.4, bwz + bur.d / 2 - 0.06, 4.6, 1.6, 's', { tile: 2.0, painted: true });

  return b;
}
