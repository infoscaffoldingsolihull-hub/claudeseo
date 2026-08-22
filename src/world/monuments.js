import * as THREE from 'three';
import { makeRng, lerp } from '../engine/noise.js';
import { mergeGeometries, box, batteredBox, squarePillar, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight } from './terrain.js';
import { SPHINX, TEMPLES, CAUSEWAYS, BOAT_PITS, PYRAMIDS } from './layout.js';

/**
 * The Sphinx, the temples and the causeways.
 *
 * These are reconstructions, not scans: block layouts follow the published
 * plans (Lehner's Sphinx survey, Hoelscher on the Khafre valley temple) at the
 * level of detail that reads correctly from the ground and from the air.
 */

/**
 * Hor-em-akhet, carved in place from a knoll of Mokattam limestone left
 * standing in Khafre's quarry.  73 m long, 20 m high, facing due east.
 */
function sphinxGeometry() {
  const rng = makeRng(7300);
  const L = SPHINX.length;
  const W = SPHINX.width;
  const parts = [];

  // ---- rump and haunches (west end) ----
  parts.push(box(22, 13.5, W, -L / 2 + 11, 6.75, 0));
  parts.push(box(9, 6.0, W * 0.86, -L / 2 + 1.5, 3.0, 0));
  for (const side of [-1, 1]) {
    // Rear legs folded under the body.
    parts.push(box(19, 5.4, 4.6, -L / 2 + 15, 2.7, side * (W / 2 - 2.6)));
  }

  // ---- torso, narrowing and rising toward the chest ----
  const torsoSegs = 8;
  for (let i = 0; i < torsoSegs; i++) {
    const t = i / torsoSegs;
    const x = lerp(-L / 2 + 21, L / 2 - 27, t);
    const w = lerp(21, 15.6, t);
    const h = lerp(12.6, 15.4, t);
    parts.push(box((L - 48) / torsoSegs + 0.6, h, w, x, h / 2 - 0.4, 0));
  }

  // ---- chest and shoulders ----
  parts.push(box(11, 16.4, 15.2, L / 2 - 24, 8.2, 0));
  parts.push(box(7.5, 12.4, 17.6, L / 2 - 20, 6.2, 0));

  // ---- forelegs and paws reaching east ----
  for (const side of [-1, 1]) {
    parts.push(box(26, 4.4, 4.9, L / 2 - 13, 2.2, side * 5.4));
    parts.push(box(6.2, 3.4, 5.6, L / 2 - 1.6, 1.7, side * 5.4));
    // Toes.
    for (let t = 0; t < 3; t++) {
      parts.push(box(2.6, 2.1, 1.35, L / 2 - 0.4, 1.05, side * (5.4 - 1.6 + t * 1.6)));
    }
  }
  // The stela of Thutmose IV between the paws.
  parts.push(box(0.9, 3.6, 2.3, L / 2 - 6.5, 1.8, 0));

  // ---- neck ----
  parts.push(box(6.4, 6.6, 8.2, L / 2 - 22.5, 15.6, 0));

  // ---- head with the nemes headdress ----
  const headY = 15.2;
  parts.push(batteredBox(9.4, 8.0, 8.6, 7.2, 6.4, L / 2 - 22.0, headY, 0));
  // Nemes lappets falling over the shoulders.
  for (const side of [-1, 1]) {
    parts.push(batteredBox(6.0, 4.6, 3.0, 2.2, 7.4, L / 2 - 23.6, headY - 1.0, side * 5.1));
  }
  // Headcloth back flap.
  parts.push(batteredBox(7.0, 5.2, 4.2, 3.0, 5.6, L / 2 - 25.4, headY + 0.4, 0));
  // Brow, and the uraeus above it.
  parts.push(box(1.1, 1.2, 7.0, L / 2 - 17.9, headY + 4.4, 0));
  parts.push(box(0.8, 1.5, 0.8, L / 2 - 17.9, headY + 5.4, 0));
  // Face plane, chin and the broken nose left as a shallow scar.
  parts.push(box(1.4, 4.6, 6.0, L / 2 - 17.6, headY + 1.6, 0));
  parts.push(box(1.0, 1.4, 3.4, L / 2 - 17.7, headY - 0.6, 0));
  // Ceremonial beard fragment.
  parts.push(box(1.3, 2.6, 2.0, L / 2 - 18.0, headY - 2.4, 0));

  // Weathering: nudge every block slightly so the silhouette is not machined.
  const geo = mergeGeometries(parts);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = (rng() - 0.5) * 0.42;
    pos.setXYZ(i, x + n, y + n * 0.5, z + n);
  }
  geo.computeVertexNormals();
  scaleUvByWorldSize(geo, 3.2);
  return geo;
}

/** Megalithic temple: battered outer wall, pillared hall, inner sanctuary. */
function templeGeometry(spec, opts = {}) {
  const {
    wallHeight = 12,
    wallThickness = 4.6,
    pillars = 4,
    pillarSize = 2.4,
    entrance = 'east',
    courtyard = true,
  } = opts;
  const w = spec.w;
  const d = spec.d;
  const parts = [];
  const hw = w / 2;
  const hd = d / 2;
  const gate = 5.2;

  const wallRun = (len, thick, cx, cz, horizontal, hole) => {
    if (!hole) {
      parts.push(horizontal ? box(len, wallHeight, thick, cx, wallHeight / 2, cz)
                            : box(thick, wallHeight, len, cx, wallHeight / 2, cz));
      return;
    }
    const side = (len - gate) / 2;
    if (horizontal) {
      parts.push(box(side, wallHeight, thick, cx - (gate + side) / 2, wallHeight / 2, cz));
      parts.push(box(side, wallHeight, thick, cx + (gate + side) / 2, wallHeight / 2, cz));
      parts.push(box(gate, wallHeight - 7.2, thick, cx, wallHeight - (wallHeight - 7.2) / 2, cz));
    } else {
      parts.push(box(thick, wallHeight, side, cx, wallHeight / 2, cz - (gate + side) / 2));
      parts.push(box(thick, wallHeight, side, cx, wallHeight / 2, cz + (gate + side) / 2));
      parts.push(box(thick, wallHeight - 7.2, gate, cx, wallHeight - (wallHeight - 7.2) / 2, cz));
    }
  };

  wallRun(w, wallThickness, 0, -hd + wallThickness / 2, true, entrance === 'north');
  wallRun(w, wallThickness, 0, hd - wallThickness / 2, true, entrance === 'south');
  wallRun(d - wallThickness * 2, wallThickness, -hw + wallThickness / 2, 0, false, entrance === 'west');
  wallRun(d - wallThickness * 2, wallThickness, hw - wallThickness / 2, 0, false, entrance === 'east');

  // Paved floor.
  parts.push(box(w, 0.7, d, 0, -0.35, 0));

  if (courtyard && pillars > 0) {
    const spanX = w - wallThickness * 2 - 7;
    const spanZ = d - wallThickness * 2 - 7;
    for (let i = 0; i < pillars; i++) {
      for (const side of [-1, 1]) {
        const t = (i + 0.5) / pillars;
        parts.push(squarePillar(pillarSize, wallHeight - 2.4, lerp(-spanX / 2, spanX / 2, t), 0, side * (spanZ / 2)));
        parts.push(squarePillar(pillarSize, wallHeight - 2.4, side * (spanX / 2), 0, lerp(-spanZ / 2, spanZ / 2, t)));
      }
    }
    // Roof slabs over the colonnade only, leaving the court open to the sky.
    const roofW = wallThickness + pillarSize + 4;
    parts.push(box(w, 1.4, roofW, 0, wallHeight - 0.7, -hd + roofW / 2));
    parts.push(box(w, 1.4, roofW, 0, wallHeight - 0.7, hd - roofW / 2));
    parts.push(box(roofW, 1.4, d - roofW * 2, -hw + roofW / 2, wallHeight - 0.7, 0));
    parts.push(box(roofW, 1.4, d - roofW * 2, hw - roofW / 2, wallHeight - 0.7, 0));
  }

  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 2.6);
  return geo;
}

/** A processional causeway: raised embankment with parapet walls. */
function causewayGeometry(spec) {
  const [x0, z0] = spec.from;
  const [x1, z1] = spec.to;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(12, Math.round(length / 22));
  const angle = Math.atan2(dx, dz);
  const parts = [];
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const mx = x0 + dx * (t0 + t1) / 2;
    const mz = z0 + dz * (t0 + t1) / 2;
    const ground = terrainHeight(mx, mz);
    const deckY = lerp(terrainHeight(x0, z0), terrainHeight(x1, z1), (t0 + t1) / 2) + 3.2;
    const segLen = length / steps + 1.0;
    const fill = Math.max(1.4, deckY - ground + 1.5);
    // Embankment.
    parts.push(box(spec.width, fill, segLen, mx, deckY - fill / 2, mz, angle));
    // Parapets.
    for (const side of [-1, 1]) {
      const ox = Math.cos(angle) * side * (spec.width / 2 - 0.8);
      const oz = -Math.sin(angle) * side * (spec.width / 2 - 0.8);
      parts.push(box(1.5, 2.4, segLen, mx + ox, deckY + 1.2, mz + oz, angle));
    }
  }
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 3.0);
  return geo;
}

/** Rock-cut boat pit with its limestone covering slabs. */
function boatPitGeometry(pit, capped) {
  const parts = [];
  const wall = 1.2;
  parts.push(box(pit.w + wall * 2, wall, pit.d + wall * 2, 0, -pit.depth - wall / 2, 0));
  parts.push(box(wall, pit.depth, pit.d, -pit.w / 2 - wall / 2, -pit.depth / 2, 0));
  parts.push(box(wall, pit.depth, pit.d, pit.w / 2 + wall / 2, -pit.depth / 2, 0));
  parts.push(box(pit.w, pit.depth, wall, 0, -pit.depth / 2, -pit.d / 2 - wall / 2));
  parts.push(box(pit.w, pit.depth, wall, 0, -pit.depth / 2, pit.d / 2 + wall / 2));
  if (capped) {
    const slabs = Math.round(pit.w / 2.6);
    for (let i = 0; i < slabs; i++) {
      parts.push(box(pit.w / slabs - 0.08, 1.0, pit.d + 1.6, -pit.w / 2 + (i + 0.5) * (pit.w / slabs), 0.5, 0));
    }
  }
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 2.0);
  return geo;
}

export class MonumentSystem {
  constructor(scene, textures, quality, collision) {
    this.group = new THREE.Group();
    this.group.name = 'monuments';
    scene.add(this.group);
    this.collision = collision;
    this.torchSites = [];

    const lime = textures.limestone();
    const gran = textures.granite();
    const bas = textures.basalt();
    const plaster = textures.plaster();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    for (const set of [lime, gran, bas, plaster]) {
      for (const t of Object.values(set)) t.anisotropy = aniso;
    }

    this.materials = {
      limestone: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        roughnessMap: lime.roughnessMap,
        color: 0xc9bfa8,
        roughness: 1,
        metalness: 0,
      }),
      weathered: new THREE.MeshStandardMaterial({
        map: lime.map,
        normalMap: lime.normalMap,
        roughnessMap: lime.roughnessMap,
        normalScale: new THREE.Vector2(1.5, 1.5),
        color: 0xb4a892,
        roughness: 1,
        metalness: 0,
      }),
      granite: new THREE.MeshStandardMaterial({
        map: gran.map,
        normalMap: gran.normalMap,
        roughnessMap: gran.roughnessMap,
        roughness: 0.5,
        metalness: 0.04,
      }),
      basalt: new THREE.MeshStandardMaterial({
        map: bas.map,
        normalMap: bas.normalMap,
        roughnessMap: bas.roughnessMap,
        roughness: 0.72,
        metalness: 0,
      }),
      plaster: new THREE.MeshStandardMaterial({
        map: plaster.map,
        normalMap: plaster.normalMap,
        roughnessMap: plaster.roughnessMap,
        color: 0xe4d5b4,
        roughness: 0.9,
        metalness: 0,
      }),
    };

    this._buildSphinx();
    this._buildTemples();
    this._buildCauseways();
    this._buildBoatPits();
    this._buildEnclosureWalls();
  }

  _add(geometry, material, x, y, z, ry = 0, tag = '', collide = true) {
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

  _buildSphinx() {
    const geo = sphinxGeometry();
    this.sphinx = this._add(geo, this.materials.weathered, SPHINX.x, SPHINX.enclosureY, SPHINX.z, 0, 'sphinx', false);
    // Collide with the body mass rather than the exact silhouette.
    this.collision.addCenteredBox(
      SPHINX.x - 6,
      SPHINX.enclosureY + 7,
      SPHINX.z,
      SPHINX.length * 0.82,
      14,
      SPHINX.width,
      'sphinx'
    );
    // Quarried enclosure walls around it.
    const wallParts = [];
    const ew = 82;
    const ed = 54;
    const h = 9.2;
    wallParts.push(box(ew * 2 + 8, h, 4, 0, h / 2, -ed));
    wallParts.push(box(ew * 2 + 8, h, 4, 0, h / 2, ed));
    wallParts.push(box(4, h, ed * 2, -ew, h / 2, 0));
    const wallGeo = mergeGeometries(wallParts);
    scaleUvByWorldSize(wallGeo, 2.4);
    this._add(wallGeo, this.materials.weathered, SPHINX.x, SPHINX.enclosureY, SPHINX.z, 0, 'sphinx-enclosure');
  }

  _buildTemples() {
    const t = TEMPLES;
    this.temples = {};

    this.temples.sphinxTemple = this._add(
      templeGeometry(t.sphinxTemple, { wallHeight: 10.5, pillars: 5, pillarSize: 2.6, entrance: 'east' }),
      this.materials.limestone,
      t.sphinxTemple.x, t.sphinxTemple.y, t.sphinxTemple.z, 0, 'temple-sphinx'
    );

    // The Khafre valley temple: limestone core, Aswan granite sheathing.
    this.temples.khafreValley = this._add(
      templeGeometry(t.khafreValley, { wallHeight: 13, pillars: 4, pillarSize: 3.4, entrance: 'east' }),
      this.materials.granite,
      t.khafreValley.x, t.khafreValley.y, t.khafreValley.z, 0, 'temple-khafre-valley'
    );

    this.temples.khafreMortuary = this._add(
      templeGeometry(t.khafreMortuary, { wallHeight: 11.5, pillars: 5, entrance: 'east' }),
      this.materials.limestone,
      t.khafreMortuary.x, t.khafreMortuary.y, t.khafreMortuary.z, 0, 'temple-khafre-mortuary'
    );

    this.temples.menkaureMortuary = this._add(
      templeGeometry(t.menkaureMortuary, { wallHeight: 9.5, pillars: 3, entrance: 'east' }),
      this.materials.limestone,
      t.menkaureMortuary.x, t.menkaureMortuary.y, t.menkaureMortuary.z, 0, 'temple-menkaure'
    );

    this.temples.khufuValley = this._add(
      templeGeometry(t.khufuValley, { wallHeight: 11, pillars: 4, entrance: 'east' }),
      this.materials.limestone,
      t.khufuValley.x, t.khufuValley.y, t.khufuValley.z, 0, 'temple-khufu-valley'
    );

    // Khufu's mortuary temple: basalt pavement against the pyramid's east face.
    const km = t.khufuMortuary;
    const pave = box(km.w, 0.8, km.d, 0, -0.4, 0);
    scaleUvByWorldSize(pave, 2.0);
    this._add(pave, this.materials.basalt, km.x, km.y, km.z, 0, 'khufu-mortuary-pavement', false);
    this.temples.khufuMortuary = this._add(
      templeGeometry(km, { wallHeight: 10.5, pillars: 4, pillarSize: 2.8, entrance: 'east' }),
      this.materials.limestone,
      km.x, km.y, km.z, 0, 'temple-khufu-mortuary'
    );

    for (const key of Object.keys(this.temples)) {
      const spec = t[key];
      if (!spec) continue;
      // Torches flank every temple gate.
      this.torchSites.push({ x: spec.x + spec.w / 2 + 2.4, y: spec.y + 2.4, z: spec.z - 3.4, scale: 1.1 });
      this.torchSites.push({ x: spec.x + spec.w / 2 + 2.4, y: spec.y + 2.4, z: spec.z + 3.4, scale: 1.1 });
    }
  }

  _buildCauseways() {
    this.causeways = [];
    for (const spec of CAUSEWAYS) {
      const geo = causewayGeometry(spec);
      const mesh = new THREE.Mesh(geo, this.materials.limestone);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = spec.id;
      this.group.add(mesh);
      this.causeways.push(mesh);
      // Walkable deck registered as a chain of boxes.
      const [x0, z0] = spec.from;
      const [x1, z1] = spec.to;
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const mx = lerp(x0, x1, t);
        const mz = lerp(z0, z1, t);
        const deckY = lerp(terrainHeight(x0, z0), terrainHeight(x1, z1), t) + 3.2;
        this.collision.addCenteredBox(
          mx, deckY - 1.0, mz,
          spec.width + 2, 2.0, Math.hypot(x1 - x0, z1 - z0) / steps + 6,
          spec.id
        );
      }
    }
  }

  _buildBoatPits() {
    this.boatPits = [];
    for (let i = 0; i < BOAT_PITS.length; i++) {
      const pit = BOAT_PITS[i];
      const geo = boatPitGeometry(pit, i !== 0);
      const mesh = new THREE.Mesh(geo, this.materials.limestone);
      mesh.position.set(pit.x, 0, pit.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = pit.id;
      this.group.add(mesh);
      this.boatPits.push(mesh);
    }
  }

  /** The temenos wall that ringed the Khufu pyramid court. */
  _buildEnclosureWalls() {
    const k = PYRAMIDS.khufu;
    const half = k.baseLength / 2 + 21;
    const h = 5.6;
    const th = 2.3;
    const parts = [];
    const gate = 9;
    parts.push(box(half * 2, h, th, 0, h / 2, -half));
    parts.push(box(half * 2, h, th, 0, h / 2, half));
    parts.push(box(th, h, half * 2, -half, h / 2, 0));
    // East wall broken by the processional gate onto the mortuary temple.
    const seg = (half * 2 - gate) / 2;
    parts.push(box(th, h, seg, half, h / 2, -(gate + seg) / 2));
    parts.push(box(th, h, seg, half, h / 2, (gate + seg) / 2));
    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 2.4);
    this.enclosure = this._add(geo, this.materials.weathered, k.x, k.baseY, k.z, 0, 'khufu-enclosure', false);
    for (const [x, z] of [[half, -half], [half, half], [-half, -half], [-half, half]]) {
      this.collision.addCenteredBox(k.x + x, k.baseY + h / 2, k.z + z, th * 2, h, th * 2, 'enclosure');
    }
    this.torchSites.push({ x: k.x + half + 1.8, y: k.baseY + 8.4, z: k.z - 5.5, scale: 1.2 });
    this.torchSites.push({ x: k.x + half + 1.8, y: k.baseY + 8.4, z: k.z + 5.5, scale: 1.2 });
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
