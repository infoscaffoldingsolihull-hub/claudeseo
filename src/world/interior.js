import * as THREE from 'three';
import { makeRng, lerp, clamp } from '../engine/noise.js';
import { mergeGeometries, box, hollowRoom, gableRoof, scaleUvByWorldSize } from './geobuild.js';
import { KHUFU_INTERIOR, PYRAMIDS } from './layout.js';
import { RelicKit } from './relics.js';
import { buildKhafre, buildMenkaure } from './tombs.js';

/**
 * The interiors of all three great pyramids.
 *
 * The Great Pyramid is built here at survey dimensions: everything lies in a
 * single vertical plane 7.29 m east of the north-south axis - the same plane
 * as the original entrance - exactly as Petrie found it.  Passages are 1.05 m
 * wide and 1.20 m high, so the player has to stoop; the Grand Gallery opens
 * out to 8.74 m; the King's Chamber is red granite with five relieving
 * chambers stacked above it.  Khafre's and Menkaure's interiors are built by
 * ./tombs.js into the same buckets.
 *
 * All of it is one scene, separate from the plateau.  Only one of the two is
 * ever rendered, which keeps both draw-call counts low and lets the interior
 * run its own fog, torchlight and dust.  The three tombs are hundreds of
 * metres apart, so the fog closes long before one could be seen from another.
 */

const K = KHUFU_INTERIOR;
const SLOPE = (K.passageAngleDeg * Math.PI) / 180;
const AXIS_X = K.entrance.x;                 // 7.29 m east of the pyramid axis
const PW = K.passageWidth;
const PH = K.passageHeight;
const WALL = 1.1;

/** North face Z at a given height on the pyramid's slope. */
function faceZ(height) {
  const p = PYRAMIDS.khufu;
  return -(p.baseLength / 2) * (1 - height / p.designHeight);
}

/** A box placed in a passage's local frame, then tilted and translated. */
function tiltedPart(w, h, d, lx, ly, lz, rx, cx, cy, cz) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeRotationX(rx);
  const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
  m.setPosition(cx + v.x, cy + v.y, cz + v.z);
  g.applyMatrix4(m);
  return g;
}

/**
 * Build a straight passage between two points in the x = AXIS_X plane.
 * Returns the shell geometry; collision is added as a staircase of AABBs so
 * the player can actually walk the 26.5-degree slope.
 */
function buildPassage(parts, colliders, y0, z0, y1, z1, width, height, opts = {}) {
  const { thickness = WALL, x = AXIS_X, rail = 0 } = opts;
  const dz = z1 - z0;
  const dy = y1 - y0;
  const len = Math.hypot(dz, dy);
  const rx = -Math.atan2(dy, dz);      // +Z with -Y => positive tilt
  const cx = x;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;

  parts.push(tiltedPart(width + thickness * 2, thickness, len, 0, -thickness / 2, 0, rx, cx, cy, cz));
  parts.push(tiltedPart(width + thickness * 2, thickness, len, 0, height + thickness / 2, 0, rx, cx, cy, cz));
  parts.push(tiltedPart(thickness, height, len, -width / 2 - thickness / 2, height / 2, 0, rx, cx, cy, cz));
  parts.push(tiltedPart(thickness, height, len, width / 2 + thickness / 2, height / 2, 0, rx, cx, cy, cz));
  if (rail > 0) {
    parts.push(tiltedPart(width * 0.24, rail, len, -width / 2 + width * 0.12, rail / 2, 0, rx, cx, cy, cz));
    parts.push(tiltedPart(width * 0.24, rail, len, width / 2 - width * 0.12, rail / 2, 0, rx, cx, cy, cz));
  }

  // ---- collision: floor steps plus the two vertical side walls ----
  const steps = Math.max(2, Math.ceil(Math.abs(dz) / 0.9));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const zA = z0 + dz * t0;
    const zB = z0 + dz * t1;
    const yFloor = Math.min(y0 + dy * t0, y0 + dy * t1);
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: yFloor - 3.0,
      maxY: yFloor,
      minZ: Math.min(zA, zB),
      maxZ: Math.max(zA, zB),
      tag: 'passage-floor',
    });
    const yCeil = Math.max(y0 + dy * t0, y0 + dy * t1) + height;
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: yCeil,
      maxY: yCeil + 2.0,
      minZ: Math.min(zA, zB),
      maxZ: Math.max(zA, zB),
      tag: 'passage-ceiling',
    });
  }
  const yLo = Math.min(y0, y1) - 1;
  const yHi = Math.max(y0, y1) + height + 1;
  for (const side of [-1, 1]) {
    colliders.push({
      minX: side < 0 ? x - width / 2 - thickness : x + width / 2,
      maxX: side < 0 ? x - width / 2 : x + width / 2 + thickness,
      minY: yLo,
      maxY: yHi,
      minZ: Math.min(z0, z1),
      maxZ: Math.max(z0, z1),
      tag: 'passage-wall',
    });
  }
  return { len, rx };
}

/** Rectangular room: shell geometry + collision walls with a doorway gap. */
function buildRoom(parts, colliders, cx, floorY, cz, w, d, h, openings, opts = {}) {
  const thickness = opts.thickness || WALL;
  const geo = hollowRoom(w, d, h, thickness, openings, opts);
  geo.translate(cx, floorY, cz);
  scaleUvByWorldSize(geo, opts.uvUnit || 2.0);
  parts.push(geo);

  const hw = w / 2;
  const hd = d / 2;
  // Floor and ceiling.
  colliders.push({ minX: cx - hw - thickness, maxX: cx + hw + thickness, minY: floorY - 3, maxY: floorY, minZ: cz - hd - thickness, maxZ: cz + hd + thickness, tag: 'room-floor' });
  if (opts.ceiling !== false) {
    colliders.push({ minX: cx - hw - thickness, maxX: cx + hw + thickness, minY: floorY + h, maxY: floorY + h + 2, minZ: cz - hd - thickness, maxZ: cz + hd + thickness, tag: 'room-ceiling' });
  }
  // Walls, split around any opening.
  const wallSegments = (axisMin, axisMax, wall) => {
    const holes = openings.filter((o) => o.wall === wall).map((o) => [o.offset - o.width / 2, o.offset + o.width / 2]);
    const segs = [];
    let cursor = axisMin;
    for (const [a, b] of holes.sort((p, q) => p[0] - q[0])) {
      if (a > cursor) segs.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < axisMax) segs.push([cursor, axisMax]);
    return segs;
  };
  for (const [wall, horizontal] of [['n', true], ['s', true], ['w', false], ['e', false]]) {
    const half = horizontal ? hw : hd;
    for (const [a, b] of wallSegments(-half, half, wall)) {
      if (horizontal) {
        const z = wall === 'n' ? cz - hd - thickness : cz + hd;
        colliders.push({ minX: cx + a, maxX: cx + b, minY: floorY, maxY: floorY + h + 1, minZ: z, maxZ: z + thickness, tag: 'room-wall' });
      } else {
        const x = wall === 'w' ? cx - hw - thickness : cx + hw;
        colliders.push({ minX: x, maxX: x + thickness, minY: floorY, maxY: floorY + h + 1, minZ: cz + a, maxZ: cz + b, tag: 'room-wall' });
      }
    }
  }
}

export class InteriorSystem {
  constructor(textures, quality) {
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x0a0806, 0.016);
    this.colliders = [];
    this.torchSites = [];
    this.rng = makeRng(1899);

    const lime = textures.limestone();
    const gran = textures.graniteAshlar();
    const cas = textures.limestoneAshlar();
    const glyphs = textures.hieroglyphs();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    for (const set of [lime, gran, cas]) for (const t of Object.values(set)) t.anisotropy = aniso;

    this.materials = {
      limestone: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        normalScale: new THREE.Vector2(1.1, 1.1), color: 0xbfae8c, roughness: 0.95, metalness: 0,
      }),
      dressed: new THREE.MeshStandardMaterial({
        map: cas.map, normalMap: cas.normalMap, roughnessMap: cas.roughnessMap,
        normalScale: new THREE.Vector2(1.0, 1.0), color: 0xd8ceb4, roughness: 0.62, metalness: 0,
      }),
      granite: new THREE.MeshStandardMaterial({
        map: gran.map, normalMap: gran.normalMap, roughnessMap: gran.roughnessMap,
        normalScale: new THREE.Vector2(0.9, 0.9), color: 0xffffff, roughness: 0.42, metalness: 0.04,
      }),
      rough: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        normalScale: new THREE.Vector2(2.2, 2.2), color: 0x8d7f66, roughness: 1, metalness: 0,
      }),
      glyphs: new THREE.MeshStandardMaterial({ map: glyphs, roughness: 0.85, metalness: 0 }),
    };

    this.nodes = {};
    this.viewpoints = {};
    this.parts = { limestone: [], dressed: [], granite: [], rough: [] };
    this.relics = new RelicKit(textures, quality);

    this._build();
    this._decorateKhufu();

    // Khufu's own nodes are unprefixed for historical reasons; give every one
    // of them a site-qualified alias so all three tombs address alike.
    for (const key of Object.keys(this.nodes)) this.nodes[`khufu.${key}`] = this.nodes[key];
    for (const key of Object.keys(this.viewpoints)) this.viewpoints[`khufu.${key}`] = this.viewpoints[key];

    const ctx = {
      parts: this.parts,
      colliders: this.colliders,
      torchSites: this.torchSites,
      nodes: this.nodes,
      viewpoints: this.viewpoints,
      relics: this.relics,
      rng: this.rng,
    };
    buildKhafre(ctx);
    buildMenkaure(ctx);

    this._assemble();
    this.relics.finish(this.scene);
    for (const c of this.relics.colliders) this.colliders.push(c);
    this._buildSites();
    this._buildLighting();
  }

  /** Where the player arrives, and which way they face, for each tomb. */
  _buildSites() {
    this.sites = {
      khufu: {
        id: 'khufu',
        name: PYRAMIDS.khufu.name,
        entry: this.nodes.entrance.clone(),
        yaw: Math.PI,
      },
      khafre: {
        id: 'khafre',
        name: PYRAMIDS.khafre.name,
        entry: this.nodes['khafre.entrance'].clone(),
        yaw: Math.PI,
      },
      menkaure: {
        id: 'menkaure',
        name: PYRAMIDS.menkaure.name,
        entry: this.nodes['menkaure.entrance'].clone(),
        yaw: Math.PI,
      },
    };
    // Two of the ways in are second doors into a tomb that already has one,
    // so they get their own arrival point rather than the site's default.
    this.sites.khufuMamun = {
      id: 'khufuMamun',
      site: 'khufu',
      name: 'Great Pyramid — al-Ma’mun’s tunnel',
      entry: this.nodes.mamun.clone(),
      yaw: Math.PI,
    };
    // The lower entrance of Khafre is a second way into the same tomb.
    this.sites.khafreLower = {
      id: 'khafreLower',
      site: 'khafre',
      name: `${PYRAMIDS.khafre.name} — lower entrance`,
      entry: this.nodes['khafre.lowerEntrance'].clone(),
      yaw: Math.PI,
    };
  }

  /** Points of interest contributed by the relics, for the codex. */
  get relicPoints() {
    return this.relics.relics;
  }

  _build() {
    const lime = this.parts.limestone;
    const dressed = this.parts.dressed;
    const granite = this.parts.granite;
    const rough = this.parts.rough;
    const colliders = this.colliders;

    // ---------------------------------------------------------- entrance
    const entryY = K.entrance.y;
    const entryZ = faceZ(entryY);
    this.entrancePoint = new THREE.Vector3(AXIS_X, entryY, entryZ + 2.2);
    this.nodes.entrance = this.entrancePoint.clone();

    // A short level vestibule behind the face, then the descending passage.
    buildPassage(dressed, colliders, entryY, entryZ - 3.0, entryY, entryZ + 1.6, PW, PH);

    // ------------------------------------------------- descending passage
    const descLen = K.descendingLength;
    const descEndY = entryY - descLen * Math.sin(SLOPE);
    const descEndZ = entryZ + 1.6 + descLen * Math.cos(SLOPE);
    buildPassage(lime, colliders, entryY, entryZ + 1.6, descEndY, descEndZ, PW, PH);
    this.nodes.descending = new THREE.Vector3(AXIS_X, entryY - 12, entryZ + 1.6 + 24);
    this.viewpoints.descending = { position: this.nodes.descending.clone(), yaw: Math.PI };
    this.viewpoints.entrance = { position: this.entrancePoint.clone(), yaw: Math.PI };

    // Junction with the ascending passage, 28.2 m down the slope.
    const jT = 28.2 / descLen;
    const junctionY = lerp(entryY, descEndY, jT);
    const junctionZ = lerp(entryZ + 1.6, descEndZ, jT);

    // ---------------------------------------------- subterranean chamber
    const sub = K.subterranean;
    const subLevelZ = descEndZ + 8.84;
    buildPassage(rough, colliders, descEndY, descEndZ, descEndY, subLevelZ, PW, PH);
    const subCenterZ = subLevelZ + sub.d / 2 + 0.4;
    buildRoom(
      rough, colliders, AXIS_X, descEndY - 0.9, subCenterZ, sub.w, sub.d, sub.h,
      [{ wall: 'n', offset: 0, width: PW, height: PH, sill: 0.9 }],
      { uvUnit: 2.4 }
    );
    this.nodes.subterranean = new THREE.Vector3(AXIS_X, descEndY - 0.9, subCenterZ);
    this.viewpoints.subterranean = {
      position: new THREE.Vector3(AXIS_X - 4.5, descEndY - 0.9, subCenterZ - 2.0),
      yaw: Math.PI * 0.75,
    };
    // The unfinished pit and the dead-end southern shaft Petrie recorded.
    rough.push(box(2.2, 3.0, 2.4, AXIS_X + 2.4, descEndY - 2.4, subCenterZ + 0.6));
    buildPassage(rough, colliders, descEndY - 0.9, subCenterZ + sub.d / 2, descEndY - 0.9, subCenterZ + sub.d / 2 + 16, 0.75, 0.85);
    this.torchSites.push({ x: AXIS_X - sub.w / 2 + 1.2, y: descEndY + 0.6, z: subCenterZ - 1.5, scale: 0.85 });
    this.torchSites.push({ x: AXIS_X + sub.w / 2 - 1.2, y: descEndY + 0.6, z: subCenterZ + 1.5, scale: 0.85 });

    // -------------------------------------------------- ascending passage
    const ascLen = K.ascendingLength;
    const ascEndY = junctionY + ascLen * Math.sin(SLOPE);
    const ascEndZ = junctionZ + ascLen * Math.cos(SLOPE);
    buildPassage(lime, colliders, junctionY, junctionZ, ascEndY, ascEndZ, PW, PH);
    this.nodes.ascending = new THREE.Vector3(AXIS_X, junctionY + 8, junctionZ + 16);
    // The granite plugs that sealed it, still in place at the lower end.
    granite.push(box(PW * 0.96, PH * 0.92, 3.4, AXIS_X, junctionY + 0.62, junctionZ + 1.9));

    // ------------------------------------------------------ queen's chamber
    const qc = K.queensChamber;
    const horizY = ascEndY;
    const qcNorthWallZ = -qc.d / 2;
    buildPassage(lime, colliders, horizY, ascEndZ, horizY, qcNorthWallZ - 5.6, PW, PH);
    // The last stretch steps down to the chamber floor.
    buildPassage(lime, colliders, horizY, qcNorthWallZ - 5.6, qc.floorY, qcNorthWallZ - 4.6, PW, PH + 0.6);
    buildPassage(lime, colliders, qc.floorY, qcNorthWallZ - 4.6, qc.floorY, qcNorthWallZ, PW, PH + 0.6);

    buildRoom(
      dressed, colliders, AXIS_X, qc.floorY, 0, qc.w, qc.d, qc.wallH,
      [{ wall: 'n', offset: 0, width: PW, height: PH + 0.6, sill: 0 }],
      { ceiling: false, uvUnit: 1.6 }
    );
    const gable = gableRoof(qc.w + WALL * 2, qc.d + WALL * 2, qc.apexH - qc.wallH, 0.9);
    gable.translate(AXIS_X, qc.floorY + qc.wallH, 0);
    scaleUvByWorldSize(gable, 1.6);
    dressed.push(gable);
    colliders.push({
      minX: AXIS_X - qc.w / 2 - WALL, maxX: AXIS_X + qc.w / 2 + WALL,
      minY: qc.floorY + qc.apexH - 0.4, maxY: qc.floorY + qc.apexH + 1.6,
      minZ: -qc.d / 2 - WALL, maxZ: qc.d / 2 + WALL, tag: 'gable',
    });
    // The corbelled niche in the east wall.
    for (let i = 0; i < 5; i++) {
      const inset = i * 0.26;
      dressed.push(box(0.5, 0.62, 1.55 - inset * 2, AXIS_X + qc.w / 2 - 0.25, qc.floorY + 0.31 + i * 0.62, 0.9));
    }
    this.nodes.queensChamber = new THREE.Vector3(AXIS_X, qc.floorY, 0);
    this.viewpoints.queensChamber = {
      position: new THREE.Vector3(AXIS_X - 1.2, qc.floorY, -1.4),
      yaw: Math.PI * 0.85,
    };
    this.torchSites.push({ x: AXIS_X - qc.w / 2 + 0.9, y: qc.floorY + 1.9, z: -1.4, scale: 0.8 });
    this.torchSites.push({ x: AXIS_X + qc.w / 2 - 0.9, y: qc.floorY + 1.9, z: 1.4, scale: 0.8 });

    // Queen's Chamber shafts - sealed at both ends, cut 13 cm inside the wall.
    this._addShaft(lime, AXIS_X, qc.floorY + 2.3, -qc.d / 2, -1, 39, 8.6);
    this._addShaft(lime, AXIS_X, qc.floorY + 2.3, qc.d / 2, 1, 39, 8.6);

    // ------------------------------------------------------ grand gallery
    const gg = K.grandGallery;
    const ggStartY = ascEndY;
    const ggStartZ = ascEndZ;
    const ggEndY = ggStartY + gg.length * Math.sin(SLOPE);
    const ggEndZ = ggStartZ + gg.length * Math.cos(SLOPE);
    this._buildGrandGallery(dressed, colliders, ggStartY, ggStartZ, ggEndY, ggEndZ, gg);
    this.nodes.grandGallery = new THREE.Vector3(AXIS_X, ggStartY + 8, ggStartZ + 16);
    this.viewpoints.grandGallery = {
      position: new THREE.Vector3(AXIS_X, ggStartY + 2.6, ggStartZ + 5.2),
      yaw: Math.PI,
    };
    this.viewpoints.grandGalleryTop = {
      position: new THREE.Vector3(AXIS_X, ggEndY - 1.2, ggEndZ - 2.4),
      yaw: 0,
    };

    // ------------------------------------------------- antechamber + king's
    const kc = K.kingsChamber;
    const stepY = ggEndY + 0.9;
    const anteZ = ggEndZ + 1.5;
    dressed.push(box(gg.bottomWidth + 2.2, 0.9, 1.8, AXIS_X, ggEndY + 0.45, ggEndZ + 0.6));
    buildRoom(
      granite, colliders, AXIS_X, stepY, anteZ, K.antechamber.w, K.antechamber.d, K.antechamber.h,
      [
        { wall: 'n', offset: 0, width: PW, height: 1.5, sill: 0 },
        { wall: 's', offset: 0, width: PW, height: 1.5, sill: 0 },
      ],
      { uvUnit: 1.4 }
    );
    // Three portcullis slabs in their grooves, raised clear of the passage.
    for (let i = 0; i < 3; i++) {
      granite.push(box(1.6, 1.5, 0.42, AXIS_X, stepY + K.antechamber.h - 0.75, anteZ - 0.5 + i * 0.5));
    }

    const kcNorthZ = anteZ + K.antechamber.d / 2 + WALL;
    const kcCenterZ = kcNorthZ + kc.d / 2;
    buildPassage(granite, colliders, stepY, anteZ + K.antechamber.d / 2, stepY, kcNorthZ, PW, 1.5);
    buildRoom(
      granite, colliders, AXIS_X, kc.floorY, kcCenterZ, kc.w, kc.d, kc.h,
      [{ wall: 'n', offset: 0, width: PW, height: 1.5, sill: 0 }],
      { uvUnit: 1.8 }
    );
    this.nodes.kingsChamber = new THREE.Vector3(AXIS_X, kc.floorY, kcCenterZ);
    this.viewpoints.kingsChamber = {
      position: new THREE.Vector3(AXIS_X + kc.w / 2 - 1.4, kc.floorY, kcCenterZ - 0.2),
      yaw: Math.PI * 0.5,
    };

    // The lidless granite sarcophagus at the west end.
    const sar = K.sarcophagus;
    const sx = AXIS_X - kc.w / 2 + 1.9;
    granite.push(box(sar.w, 0.14, sar.d, sx, kc.floorY + 0.07, kcCenterZ));
    granite.push(box(sar.w, sar.h, 0.13, sx, kc.floorY + sar.h / 2, kcCenterZ - sar.d / 2));
    granite.push(box(sar.w, sar.h, 0.13, sx, kc.floorY + sar.h / 2, kcCenterZ + sar.d / 2));
    granite.push(box(0.13, sar.h, sar.d, sx - sar.w / 2, kc.floorY + sar.h / 2, kcCenterZ));
    granite.push(box(0.13, sar.h, sar.d, sx + sar.w / 2, kc.floorY + sar.h / 2, kcCenterZ));
    colliders.push({
      minX: sx - sar.w / 2 - 0.1, maxX: sx + sar.w / 2 + 0.1,
      minY: kc.floorY, maxY: kc.floorY + sar.h,
      minZ: kcCenterZ - sar.d / 2 - 0.1, maxZ: kcCenterZ + sar.d / 2 + 0.1,
      tag: 'sarcophagus',
    });

    this.torchSites.push({ x: AXIS_X - kc.w / 2 + 0.9, y: kc.floorY + 2.2, z: kcCenterZ - 1.7, scale: 1.0 });
    this.torchSites.push({ x: AXIS_X + kc.w / 2 - 0.9, y: kc.floorY + 2.2, z: kcCenterZ - 1.7, scale: 1.0 });
    this.torchSites.push({ x: AXIS_X - kc.w / 2 + 0.9, y: kc.floorY + 2.2, z: kcCenterZ + 1.7, scale: 1.0 });
    this.torchSites.push({ x: AXIS_X + kc.w / 2 - 0.9, y: kc.floorY + 2.2, z: kcCenterZ + 1.7, scale: 1.0 });

    // King's Chamber shafts, which do reach the outside.
    this._addShaft(granite, AXIS_X - 2.2, kc.floorY + 0.9, kcCenterZ - kc.d / 2, -1, 32.6, 60);
    this._addShaft(granite, AXIS_X - 2.2, kc.floorY + 0.9, kcCenterZ + kc.d / 2, 1, 45.0, 53);

    // ------------------------------------------------- relieving chambers
    this._buildRelievingChambers(granite, lime, colliders, kc, kcCenterZ, ggEndY, ggEndZ);

    // --------------------------------------------- al-Ma'mun's forced tunnel
    const mamunY = 7.0;
    const mamunZ = faceZ(mamunY);
    buildPassage(rough, colliders, mamunY, mamunZ, junctionY - 0.1, junctionZ - 1.2, 1.5, 2.0, { thickness: 1.4 });
    this.nodes.mamun = new THREE.Vector3(AXIS_X, mamunY, mamunZ + 4);
    this.torchSites.push({ x: AXIS_X, y: mamunY + 1.5, z: mamunZ + 6, scale: 0.8 });

    // Torches every 9 m along the main descending and ascending runs.
    this._lineTorches(entryY, entryZ + 3, descEndY, descEndZ, 9);
    this._lineTorches(junctionY, junctionZ, ascEndY, ascEndZ, 8);
    this._lineTorches(horizY, ascEndZ, horizY, qcNorthWallZ - 6, 9);
    this._lineTorches(ggStartY, ggStartZ, ggEndY, ggEndZ, 7);

    // Daylight spilling in at the two entrances.
    this._addDaylight(AXIS_X, entryY + PH / 2, entryZ - 2.4, PW, PH);
    this._addDaylight(AXIS_X, mamunY + 1.0, mamunZ - 0.6, 1.5, 2.0);
  }

  /**
   * Merge every bucket once all three tombs have contributed to it.  Four
   * meshes carry the whole of Giza's underground, which is what keeps the
   * interior at ten draw calls.
   */
  _assemble() {
    this._addMesh(mergeGeometries(this.parts.limestone), this.materials.limestone, 'interior-limestone');
    this._addMesh(mergeGeometries(this.parts.dressed), this.materials.dressed, 'interior-dressed');
    this._addMesh(mergeGeometries(this.parts.granite), this.materials.granite, 'interior-granite');
    this._addMesh(mergeGeometries(this.parts.rough), this.materials.rough, 'interior-rough');
    this._buildShaftMouths();

    // Daylight at the mouths of the other three ways in.
    for (const [key, w, h] of [
      ['khafre.entrance', KHUFU_INTERIOR.passageWidth, KHUFU_INTERIOR.passageHeight],
      ['khafre.lowerEntrance', KHUFU_INTERIOR.passageWidth, KHUFU_INTERIOR.passageHeight],
      ['menkaure.entrance', KHUFU_INTERIOR.passageWidth, KHUFU_INTERIOR.passageHeight],
    ]) {
      const n = this.nodes[key];
      if (n) this._addDaylight(n.x, n.y + h / 2, n.z - 4.2, w, h);
    }
  }

  /**
   * Furnish the Great Pyramid.
   *
   * A deliberate point of accuracy: unlike every later royal tomb, Khufu's
   * chambers carry no decoration at all.  The only inscriptions in the whole
   * monument are the red-ochre gang marks daubed on the blocks of the
   * relieving chambers before they were sealed - which nobody was ever meant
   * to see.  Those are here, in the one place they belong, and the grave goods
   * are the ones the burial would have held.
   */
  _decorateKhufu() {
    const R = this.relics;
    const rng = this.rng;
    const kc = this.nodes.kingsChamber;
    const qc = this.nodes.queensChamber;
    const sub = this.nodes.subterranean;
    const dav = this.nodes.davison;
    const K2 = K.kingsChamber;

    // ---- King's Chamber: bare granite, an open box, and the masons' kit ----
    R.brokenLid(AXIS_X - K2.w / 2 + 4.6, kc.y, kc.z + 0.4, 0.12, K.sarcophagus.w, K.sarcophagus.d);
    R.toolCache(AXIS_X + K2.w / 2 - 1.7, kc.y, kc.z + 1.5, -Math.PI * 0.5, {
      site: 'khufu',
      id: 'relic-khufu-tools',
    });
    R.relic({
      id: 'relic-khufu-bare-walls',
      name: 'The Undecorated Chamber',
      site: 'khufu',
      x: AXIS_X, y: kc.y + 1.7, z: kc.z - 1.6,
      text:
        'Not one hieroglyph. Every later royal tomb is covered in text — the Pyramid Texts begin in ' +
        'Unas’s pyramid three centuries after this — but Khufu’s chambers are bare polished granite, ' +
        'joints so fine you cannot slide a blade into them. Whatever the builders believed was doing the ' +
        'work here, it was not writing.',
      pm: 'Work package 6.5 — the specification was surface finish, not decoration. Know what you are buying.',
    });

    // ---- the relieving chambers: the only writing in the pyramid ----
    if (dav) {
      R.glyphPanel(AXIS_X - 2.6, dav.y + 0.55, dav.z - K2.d / 2 - 0.5, 3.4, 0.85, 's', { tile: 1.5, painted: true });
      R.glyphPanel(AXIS_X + 1.9, dav.y + 0.5, dav.z + K2.d / 2 + 0.5, 2.8, 0.8, 'n', { tile: 1.5, painted: true });
      R.cartouche(AXIS_X - 0.2, dav.y + 0.7, dav.z - K2.d / 2 - 0.46, 0.8, 's');
      R.relic({
        id: 'relic-khufu-gang-marks',
        name: 'The Gang Marks',
        site: 'khufu',
        x: AXIS_X - 1.2, y: dav.y + 0.7, z: dav.z - K2.d / 2 - 0.2,
        text:
          'Daubed in red ochre on blocks that were about to be walled in for ever: quarry dates, levelling ' +
          'lines, and the names of the work gangs. One of them reads “the gang: How powerful is the White ' +
          'Crown of Khnum-Khufu”. It is the only place in the pyramid the king’s name appears, and it was ' +
          'written by the crew, not for the crew.',
        pm: 'Work package 6.6 — relieving chambers. The site record survived because nobody curated it.',
      });
    }

    // ---- Queen's Chamber: the niche, and the goods the ka would draw on ----
    if (qc) {
      R.kaStatue(AXIS_X + K.queensChamber.w / 2 - 0.75, qc.y, qc.z + 0.9, -Math.PI * 0.5, {
        site: 'khufu',
        scale: 0.62,
        id: 'relic-khufu-ka',
        name: 'The Statue in the Niche',
        text:
          'The corbelled niche in the east wall was cut for something and then abandoned half-finished. ' +
          'The usual reading is a serdab: a sealed cell holding a ka-statue, with a slot for the incense ' +
          'to reach it. What actually stood here, if anything, nobody knows.',
      });
      R.offeringTable(AXIS_X - K.queensChamber.w / 2 + 1.1, qc.y, qc.z - 1.3, Math.PI * 0.5, { site: 'khufu' });
      R.canopicChest(AXIS_X - K.queensChamber.w / 2 + 1.2, qc.y, qc.z + 1.2, Math.PI * 0.5, { site: 'khufu' });
      R.jarCluster(AXIS_X + 0.4, qc.y, qc.z + K.queensChamber.d / 2 - 0.6, Math.PI, 4, rng);
      R.modelBoat(AXIS_X - 0.6, qc.y, qc.z - K.queensChamber.d / 2 + 1.0, 0, { site: 'khufu' });
    }

    // ---- the subterranean chamber: abandoned mid-cut ----
    if (sub) {
      R.jarCluster(sub.x - 4.6, sub.y, sub.z - 2.2, 0, 4, rng);
      R.stela(sub.x - 5.4, sub.y, sub.z + 1.6, Math.PI * 0.5, {
        site: 'khufu',
        id: 'relic-khufu-abandoned',
        name: 'The Abandoned Chamber',
        height: 1.6,
        text:
          'The first plan put the burial chamber down here, in the bedrock. The floor was left as a ' +
          'jagged half-cut trench and the crews were moved up into the masonry instead. Two more chambers ' +
          'were begun and changed before the King’s Chamber was settled on.',
        pm: 'Work package 6.1 — two full changes of design mid-build, and the schedule absorbed both.',
      });
      R.toolCache(sub.x + 3.8, sub.y, sub.z - 1.4, Math.PI, { site: 'khufu', id: 'relic-khufu-sub-tools' });
    }
  }

  _addMesh(geometry, material, name) {
    if (!geometry || geometry.attributes.position.count === 0) return null;
    // One texture tile per 2.6 m gives two ~1.3 m courses of ashlar, which is
    // the real course height of the King's Chamber granite.
    scaleUvByWorldSize(geometry, 2.6);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = name;
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * Narrow square shaft rising away from a chamber wall.
   *
   * The lining starts a little way inside the masonry so that from the chamber
   * you see a clean square opening, not the ends of four slabs poking through
   * the wall face.
   */
  _addShaft(parts, x, y, z, dirZ, angleDeg, length) {
    const a = (angleDeg * Math.PI) / 180;
    const inset = 0.55;
    const usable = length - inset;
    const dz = Math.cos(a) * usable * dirZ;
    const dy = Math.sin(a) * usable;
    const s = K.shaftDiameter;
    // Push the whole lining `inset` metres along its own axis, into the wall.
    const startZ = z + Math.cos(a) * inset * dirZ;
    const startY = y + Math.sin(a) * inset;
    const cx = x;
    const cy = startY + dy / 2;
    const cz = startZ + dz / 2;
    const rx = -Math.atan2(dy, dz);
    const len = Math.hypot(dy, dz);
    for (const [ox, oy] of [[-s, 0], [s, 0], [0, -s], [0, s]]) {
      parts.push(tiltedPart(ox ? 0.22 : s * 2 + 0.44, oy ? 0.22 : s * 2, len, ox, oy + s, 0, rx, cx, cy, cz));
    }
    // A dark recess at the mouth so the opening reads as a hole in the wall.
    if (!this.shaftMouths) this.shaftMouths = [];
    this.shaftMouths.push({ x, y: y + s, z: z + Math.cos(a) * 0.12 * dirZ, size: s * 2.1 });
  }

  /** Dark inset panels marking the four air-shaft openings. */
  _buildShaftMouths() {
    if (!this.shaftMouths) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x070604, fog: true });
    const parts = [];
    for (const m of this.shaftMouths) {
      parts.push(box(m.size, m.size, 0.12, m.x, m.y, m.z));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.name = 'shaft-mouths';
    this.scene.add(mesh);
    this.materials.shaftMouth = mat;
  }

  /**
   * The Grand Gallery: 46.7 m of corbelled hall, its walls stepping inward in
   * seven courses from 2.06 m at the floor to 1.04 m at the roof, with the
   * side ramps that probably carried the counterweight system.
   */
  _buildGrandGallery(parts, colliders, y0, z0, y1, z1, gg) {
    const dz = z1 - z0;
    const dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    const rx = -Math.atan2(dy, dz);
    const cx = AXIS_X;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const courses = gg.corbels;
    const stepH = gg.height / courses;
    const inset = (gg.bottomWidth - gg.topWidth) / 2 / courses;

    parts.push(tiltedPart(gg.bottomWidth + 3.0, 1.2, len, 0, -0.6, 0, rx, cx, cy, cz));
    for (let i = 0; i < courses; i++) {
      const ly = i * stepH;
      const w = gg.bottomWidth - inset * 2 * i;
      for (const side of [-1, 1]) {
        parts.push(tiltedPart(1.4 + inset, stepH, len, side * (w / 2 + (1.4 + inset) / 2), ly + stepH / 2, 0, rx, cx, cy, cz));
      }
    }
    parts.push(tiltedPart(gg.topWidth + 2.8, 1.0, len, 0, gg.height + 0.5, 0, rx, cx, cy, cz));

    // Side ramps flanking the central trough, built as 27 blocks so the 26
    // famous slots between them are real gaps rather than applied decoration.
    const rampW = (gg.bottomWidth - 1.05) / 2;
    const blocks = 27;
    const slot = 0.42;
    const blockLen = (len - slot * (blocks - 1)) / blocks;
    for (const side of [-1, 1]) {
      for (let i = 0; i < blocks; i++) {
        const lz = -len / 2 + blockLen / 2 + i * (blockLen + slot);
        parts.push(tiltedPart(rampW, 0.6, blockLen, side * (gg.bottomWidth / 2 - rampW / 2), 0.3, lz, rx, cx, cy, cz));
      }
      // The continuous plinth the ramp blocks sit on.
      parts.push(tiltedPart(rampW, 0.22, len, side * (gg.bottomWidth / 2 - rampW / 2), 0.11, 0, rx, cx, cy, cz));
    }

    // Collision: stepped floor in the central trough plus vertical side walls.
    const steps = Math.max(6, Math.ceil(Math.abs(dz) / 0.9));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const zA = z0 + dz * t0;
      const zB = z0 + dz * t1;
      const yFloor = Math.min(y0 + dy * t0, y0 + dy * t1);
      colliders.push({
        minX: cx - 0.53, maxX: cx + 0.53,
        minY: yFloor - 3.0, maxY: yFloor,
        minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB), tag: 'gallery-floor',
      });
      // The raised ramps are walkable ledges either side.
      for (const side of [-1, 1]) {
        colliders.push({
          minX: cx + side * 0.53, maxX: cx + side * (0.53 + rampW),
          minY: yFloor - 3.0, maxY: yFloor + 0.6,
          minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB), tag: 'gallery-ramp',
        });
      }
    }
    for (const side of [-1, 1]) {
      colliders.push({
        minX: side < 0 ? cx - gg.bottomWidth / 2 - 1.6 : cx + gg.bottomWidth / 2,
        maxX: side < 0 ? cx - gg.bottomWidth / 2 : cx + gg.bottomWidth / 2 + 1.6,
        minY: Math.min(y0, y1) - 1, maxY: Math.max(y0, y1) + gg.height + 2,
        minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), tag: 'gallery-wall',
      });
    }
  }

  /**
   * Five relieving chambers of granite beams above the King's Chamber, the
   * topmost roofed with a limestone gable.  Davison's Chamber (the lowest) is
   * reached by the crawl from the top of the Grand Gallery, as it was in 1765.
   */
  _buildRelievingChambers(granite, lime, colliders, kc, kcCenterZ, ggEndY, ggEndZ) {
    let y = kc.floorY + kc.h + 1.1;
    const w = kc.w + 1.6;
    const d = kc.d + 1.2;
    for (let i = 0; i < K.reliefChambers; i++) {
      const gap = i === 0 ? 1.1 : lerp(0.9, 1.5, i / 4);
      // Floor beams of the chamber.
      const beams = 9;
      for (let b = 0; b < beams; b++) {
        const bz = lerp(kcCenterZ - d / 2 + d / beams / 2, kcCenterZ + d / 2 - d / beams / 2, b / (beams - 1));
        granite.push(box(w, 0.95, d / beams - 0.05, AXIS_X, y - 0.48, bz));
      }
      // Side walls.
      for (const side of [-1, 1]) {
        granite.push(box(1.0, gap, d, AXIS_X + side * (w / 2 + 0.5), y + gap / 2, kcCenterZ));
      }
      granite.push(box(w + 2, gap, 1.0, AXIS_X, y + gap / 2, kcCenterZ - d / 2 - 0.5));
      granite.push(box(w + 2, gap, 1.0, AXIS_X, y + gap / 2, kcCenterZ + d / 2 + 0.5));
      colliders.push({ minX: AXIS_X - w / 2, maxX: AXIS_X + w / 2, minY: y - 1.0, maxY: y, minZ: kcCenterZ - d / 2, maxZ: kcCenterZ + d / 2, tag: 'relief-floor' });
      for (const side of [-1, 1]) {
        colliders.push({
          minX: side < 0 ? AXIS_X - w / 2 - 1 : AXIS_X + w / 2, maxX: side < 0 ? AXIS_X - w / 2 : AXIS_X + w / 2 + 1,
          minY: y, maxY: y + gap + 1, minZ: kcCenterZ - d / 2 - 1, maxZ: kcCenterZ + d / 2 + 1, tag: 'relief-wall',
        });
      }
      if (i === K.reliefChambers - 1) {
        const roof = gableRoof(w + 3.2, d + 2.4, 3.4, 1.1);
        roof.translate(AXIS_X, y + gap, kcCenterZ);
        lime.push(roof);
        colliders.push({ minX: AXIS_X - w / 2, maxX: AXIS_X + w / 2, minY: y + gap + 3.2, maxY: y + gap + 5, minZ: kcCenterZ - d / 2, maxZ: kcCenterZ + d / 2, tag: 'relief-roof' });
      }
      if (i === 0) this.nodes.davison = new THREE.Vector3(AXIS_X, y, kcCenterZ);
      y += gap + 0.95;
    }

    // Crawl from the south-east top of the Grand Gallery into Davison's Chamber.
    const davisonY = kc.floorY + kc.h + 1.1;
    const parts = [];
    buildPassage(parts, colliders, ggEndY + 6.4, ggEndZ - 0.6, davisonY, kcCenterZ - kc.d / 2 - 1.4, 0.9, 0.95, { x: AXIS_X + 1.6 });
    for (const g of parts) lime.push(g);
    this.torchSites.push({ x: AXIS_X, y: davisonY + 0.5, z: kcCenterZ, scale: 0.6 });
  }

  _lineTorches(y0, z0, y1, z1, spacing) {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const n = Math.max(1, Math.floor(len / spacing));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      this.torchSites.push({
        x: AXIS_X + (i % 2 === 0 ? 0.42 : -0.42),
        y: lerp(y0, y1, t) + 0.78,
        z: lerp(z0, z1, t),
        scale: 0.55,
      });
    }
  }

  /** A glowing plane at an opening so the way out is always visible. */
  _addDaylight(x, y, z, w, h) {
    const geo = new THREE.PlaneGeometry(w * 1.4, h * 1.4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe7bd,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    if (!this.daylights) this.daylights = [];
    this.daylights.push(mat);
    const light = new THREE.PointLight(0xffe0b0, 14, 30, 2);
    light.position.set(x, y, z + 2);
    this.scene.add(light);
  }

  _buildLighting() {
    this.ambient = new THREE.AmbientLight(0x8a7f6c, 0.34);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x5a4a32, 0x201810, 0.38);
    this.scene.add(this.hemi);
    // A soft lamp that follows the player so the near walls never go pure black.
    this.headLamp = new THREE.PointLight(0xffb877, 2.4, 17, 2.0);
    this.scene.add(this.headLamp);

    // Chamber fill: torches alone give beautiful but unreadable contrast, so
    // each large space gets one wide, soft, warm source at its centre.
    this.fillLights = [];
    for (const [key, intensity, range] of [
      ['kingsChamber', 7.0, 26],
      ['queensChamber', 4.6, 18],
      ['subterranean', 4.2, 22],
      ['grandGallery', 6.0, 34],
      ['davison', 2.4, 14],
      // Small chambers need much less than the King's Chamber: the same
      // intensity in a 3 m room blows straight through the tone mapping and
      // the walls come back as flat orange.
      ['khafre.burialChamber', 5.4, 30],
      ['khafre.subsidiary', 2.4, 16],
      ['menkaure.panelledChamber', 1.9, 10],
      ['menkaure.mainChamber', 4.6, 26],
      ['menkaure.nicheChamber', 1.7, 11],
      ['menkaure.burialChamber', 2.4, 13],
    ]) {
      const node = this.nodes[key];
      if (!node) continue;
      const light = new THREE.PointLight(0xf2ddc0, intensity, range, 1.35);
      light.position.copy(node).add(new THREE.Vector3(0, 2.6, 0));
      this.scene.add(light);
      this.fillLights.push(light);
    }
  }

  /** Copy the interior colliders into a collision world. */
  registerCollision(collision) {
    for (const c of this.colliders) {
      collision.addBox(c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, c.tag);
    }
  }

  update(dt, cameraPosition, sky) {
    this.headLamp.position.copy(cameraPosition);
    if (this.daylights && sky) {
      const day = clamp(sky.state.dayFactor * 1.2, 0.05, 1);
      for (const m of this.daylights) m.opacity = 0.25 + day * 0.72;
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
    this.relics.dispose();
  }
}
