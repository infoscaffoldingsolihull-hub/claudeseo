import * as THREE from 'three';
import { makeRng, lerp } from '../engine/noise.js';
import { mergeGeometries, box, batteredBox, squarePillar, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight } from './terrain.js';
import { SPHINX, TEMPLES, CAUSEWAYS, BOAT_PITS, PYRAMIDS } from './layout.js';
import { RelicKit } from './relics.js';

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
/**
 * A temple: enclosure walls with one gate, a paved court, and a roofed
 * colonnade around it.
 *
 * Returns colliders alongside the geometry.  Registering the mesh's own
 * bounding box instead - which is what this used to do - turns the whole
 * temple into one solid block, so the court and the colonnade that were
 * modelled here could never be walked into.  Every wall segment, pillar and
 * roof slab is its own box, and the gate is simply the gap left between them.
 */
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
  const colliders = [];
  const hw = w / 2;
  const hd = d / 2;
  const gate = 5.2;

  const solid = (sx, sy, sz, cx, cy, cz) => colliders.push({ x: cx, y: cy, z: cz, w: sx, h: sy, d: sz });

  const wallRun = (len, thick, cx, cz, horizontal, hole) => {
    if (!hole) {
      parts.push(horizontal ? box(len, wallHeight, thick, cx, wallHeight / 2, cz)
                            : box(thick, wallHeight, len, cx, wallHeight / 2, cz));
      if (horizontal) solid(len, wallHeight, thick, cx, wallHeight / 2, cz);
      else solid(thick, wallHeight, len, cx, wallHeight / 2, cz);
      return;
    }
    // The gateway: two wall stubs with a lintel over the gap between them.
    const side = (len - gate) / 2;
    const lintelH = wallHeight - 7.2;
    if (horizontal) {
      parts.push(box(side, wallHeight, thick, cx - (gate + side) / 2, wallHeight / 2, cz));
      parts.push(box(side, wallHeight, thick, cx + (gate + side) / 2, wallHeight / 2, cz));
      parts.push(box(gate, lintelH, thick, cx, wallHeight - lintelH / 2, cz));
      solid(side, wallHeight, thick, cx - (gate + side) / 2, wallHeight / 2, cz);
      solid(side, wallHeight, thick, cx + (gate + side) / 2, wallHeight / 2, cz);
      solid(gate, lintelH, thick, cx, wallHeight - lintelH / 2, cz);
    } else {
      parts.push(box(thick, wallHeight, side, cx, wallHeight / 2, cz - (gate + side) / 2));
      parts.push(box(thick, wallHeight, side, cx, wallHeight / 2, cz + (gate + side) / 2));
      parts.push(box(thick, lintelH, gate, cx, wallHeight - lintelH / 2, cz));
      solid(thick, wallHeight, side, cx, wallHeight / 2, cz - (gate + side) / 2);
      solid(thick, wallHeight, side, cx, wallHeight / 2, cz + (gate + side) / 2);
      solid(thick, lintelH, gate, cx, wallHeight - lintelH / 2, cz);
    }
  };

  wallRun(w, wallThickness, 0, -hd + wallThickness / 2, true, entrance === 'north');
  wallRun(w, wallThickness, 0, hd - wallThickness / 2, true, entrance === 'south');
  wallRun(d - wallThickness * 2, wallThickness, -hw + wallThickness / 2, 0, false, entrance === 'west');
  wallRun(d - wallThickness * 2, wallThickness, hw - wallThickness / 2, 0, false, entrance === 'east');

  // Paved floor, raised a step above the sand outside.
  parts.push(box(w, 0.7, d, 0, -0.35, 0));
  solid(w, 0.7, d, 0, -0.35, 0);

  if (courtyard && pillars > 0) {
    const spanX = w - wallThickness * 2 - 7;
    const spanZ = d - wallThickness * 2 - 7;
    const pillarH = wallHeight - 2.4;
    // The gateway runs through the middle of the court on the entrance axis.
    // An odd pillar count puts one of the colonnade pillars exactly on that
    // centreline and quietly walls the temple up again, so anything standing
    // in the doorway's path is left out.
    const alongX = entrance === 'east' || entrance === 'west';
    const inGateway = (px, pz) =>
      alongX ? Math.abs(pz) < gate / 2 + pillarSize : Math.abs(px) < gate / 2 + pillarSize;
    for (let i = 0; i < pillars; i++) {
      for (const side of [-1, 1]) {
        const t = (i + 0.5) / pillars;
        const ax = lerp(-spanX / 2, spanX / 2, t);
        const az = lerp(-spanZ / 2, spanZ / 2, t);
        for (const [px, pz] of [[ax, side * (spanZ / 2)], [side * (spanX / 2), az]]) {
          if (inGateway(px, pz)) continue;
          parts.push(squarePillar(pillarSize, pillarH, px, 0, pz));
          solid(pillarSize, pillarH, pillarSize, px, pillarH / 2, pz);
        }
      }
    }
    // Roof slabs over the colonnade only, leaving the court open to the sky.
    const roofW = wallThickness + pillarSize + 4;
    const slabs = [
      [w, 1.4, roofW, 0, wallHeight - 0.7, -hd + roofW / 2],
      [w, 1.4, roofW, 0, wallHeight - 0.7, hd - roofW / 2],
      [roofW, 1.4, d - roofW * 2, -hw + roofW / 2, wallHeight - 0.7, 0],
      [roofW, 1.4, d - roofW * 2, hw - roofW / 2, wallHeight - 0.7, 0],
    ];
    for (const [sx, sy, sz, cx, cy, cz] of slabs) {
      parts.push(box(sx, sy, sz, cx, cy, cz));
      solid(sx, sy, sz, cx, cy, cz);
    }
  }

  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 2.6);
  return { geometry: geo, colliders };
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
    this.pennantSites = [];
    this.relics = new RelicKit(textures, quality);
    this.rng = makeRng(7731);

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

  /** Points of interest contributed by the temple furnishings. */
  get relicPoints() {
    return this.relics.relics;
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
    // collide:false - the bounding box of these three walls is the whole
    // quarry, which would seal the Sphinx, its temple and the valley temple
    // inside one solid block. Each wall gets its own collider instead.
    this._add(wallGeo, this.materials.weathered, SPHINX.x, SPHINX.enclosureY, SPHINX.z, 0, 'sphinx-enclosure', false);
    for (const [sx, sz, cx, cz] of [
      [ew * 2 + 8, 4, 0, -ed],
      [ew * 2 + 8, 4, 0, ed],
      [4, ed * 2, -ew, 0],
    ]) {
      this.collision.addCenteredBox(
        SPHINX.x + cx, SPHINX.enclosureY + h / 2, SPHINX.z + cz, sx, h, sz, 'sphinx-enclosure'
      );
    }
  }

  _buildTemples() {
    const t = TEMPLES;
    this.temples = {};

    const build = (key, material, opts) => {
      const spec = t[key];
      const built = templeGeometry(spec, opts);
      // collide:false - the per-part colliders below replace the single
      // whole-mesh box that used to seal the temple shut.
      const mesh = this._add(built.geometry, material, spec.x, spec.y, spec.z, 0, `temple-${key}`, false);
      for (const c of built.colliders) {
        this.collision.addCenteredBox(
          spec.x + c.x, spec.y + c.y, spec.z + c.z, c.w, c.h, c.d, `temple-${key}`
        );
      }
      this.temples[key] = mesh;
      return spec;
    };

    build('sphinxTemple', this.materials.limestone,
      { wallHeight: 10.5, pillars: 5, pillarSize: 2.6, entrance: 'east' });
    // The Khafre valley temple: limestone cores sheathed in Aswan granite.
    build('khafreValley', this.materials.granite,
      { wallHeight: 13, pillars: 4, pillarSize: 3.4, entrance: 'east' });
    build('khafreMortuary', this.materials.limestone,
      { wallHeight: 11.5, pillars: 5, entrance: 'east' });
    build('menkaureMortuary', this.materials.limestone,
      { wallHeight: 9.5, pillars: 3, entrance: 'east' });
    build('khufuValley', this.materials.limestone,
      { wallHeight: 11, pillars: 4, entrance: 'east' });

    // Khufu's mortuary temple: basalt pavement against the pyramid's east face.
    const km = t.khufuMortuary;
    const pave = box(km.w, 0.8, km.d, 0, -0.4, 0);
    scaleUvByWorldSize(pave, 2.0);
    this._add(pave, this.materials.basalt, km.x, km.y, km.z, 0, 'khufu-mortuary-pavement', false);
    build('khufuMortuary', this.materials.limestone,
      { wallHeight: 10.5, pillars: 4, pillarSize: 2.8, entrance: 'east' });

    this._furnishTemples();

    for (const key of Object.keys(this.temples)) {
      const spec = t[key];
      if (!spec) continue;
      // Torches flank every temple gate.
      this.torchSites.push({ x: spec.x + spec.w / 2 + 2.4, y: spec.y + 2.4, z: spec.z - 3.4, scale: 1.1 });
      this.torchSites.push({ x: spec.x + spec.w / 2 + 2.4, y: spec.y + 2.4, z: spec.z + 3.4, scale: 1.1 });
      // Cedar flagstaffs outside them, streaming east on the prevailing wind.
      this.pennantSites.push({ x: spec.x + spec.w / 2 + 5.6, y: spec.y, z: spec.z - 7.2, height: 14.5, yaw: 0 });
      this.pennantSites.push({ x: spec.x + spec.w / 2 + 5.6, y: spec.y, z: spec.z + 7.2, height: 14.5, yaw: 0 });
    }
  }

  /**
   * What is actually inside the temples now that they can be walked into.
   *
   * The gateway runs east-west through the middle of each court, so nothing
   * is placed on that centreline: the way in stays clear.
   */
  _furnishTemples() {
    const t = TEMPLES;
    const R = this.relics;
    const rng = this.rng;

    // ---- Khafre's valley temple: the T-shaped granite hall ----
    const kv = t.khafreValley;
    const inset = kv.w / 2 - 9.5;
    // Twenty-three seated statues of the king stood around this hall. The
    // emplacements are known; the statues mostly are not.
    for (let i = 0; i < 5; i++) {
      const z = kv.z - inset + (i * 2 * inset) / 4;
      if (Math.abs(z - kv.z) < 4.5) continue;         // keep the gate axis clear
      R.kaStatue(kv.x - inset, kv.y, z, Math.PI * 0.5, { scale: 1.15, site: null,
        id: `relic-khafre-valley-statue-${i}`,
        name: 'Seated Khafre',
        text:
          'Twenty-three of these stood around this hall in polished diorite, alabaster and schist. ' +
          'Auguste Mariette found one of them face-down in a well shaft in 1860, intact: Khafre enthroned ' +
          'with Horus folding his wings around the back of the king\u2019s head. It is the finest surviving ' +
          'sculpture of the Old Kingdom.' });
    }
    R.falseDoor(kv.x + 2.0, kv.y, kv.z - kv.d / 2 + 5.4, 3.2, 's', {
      site: null,
      id: 'relic-khafre-valley-door',
      name: 'Sanctuary Door',
      text:
        'Beyond it the causeway climbs 500 m to the mortuary temple and the pyramid. The king\u2019s body ' +
        'came up this way; the offerings came down it every day afterwards, in principle for ever.',
    });
    R.glyphPanel(kv.x - inset - 0.4, kv.y + 2.2, kv.z + kv.d / 2 - 6.0, 7.0, 2.4, 's', { tile: 2.6 });
    R.glyphPanel(kv.x + inset + 0.4, kv.y + 2.2, kv.z - kv.d / 2 + 6.0, 7.0, 2.4, 'n', { tile: 2.6, painted: true });
    R.offeringTable(kv.x - 3.0, kv.y, kv.z + kv.d / 2 - 6.6, 0, { site: null });
    this.torchSites.push({ x: kv.x - inset + 1.6, y: kv.y + 1.2, z: kv.z - 7.0, scale: 1.0 });
    this.torchSites.push({ x: kv.x - inset + 1.6, y: kv.y + 1.2, z: kv.z + 7.0, scale: 1.0 });

    // ---- the Sphinx temple: two sanctuaries, for the rising and setting sun ----
    const st = t.sphinxTemple;
    for (const [side, name] of [[-1, 'Eastern Sanctuary'], [1, 'Western Sanctuary']]) {
      R.stela(st.x + side * (st.w / 2 - 8.0), st.y, st.z + side * 6.5, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, {
        site: null,
        id: `relic-sphinx-${side < 0 ? 'east' : 'west'}`,
        name,
        height: 2.4,
        text:
          'Twin sanctuaries face each other across the court, one for the sun as it rises and one for the ' +
          'sun as it sets. At the equinox, seen from here, the sun goes down on the shoulder of Khafre\u2019s ' +
          'pyramid \u2014 the hieroglyph for “horizon”, built at full size.',
      });
    }
    R.offeringTable(st.x - 4.0, st.y, st.z - st.d / 2 + 6.4, 0, { site: null });
    R.offeringTable(st.x - 4.0, st.y, st.z + st.d / 2 - 6.4, Math.PI, { site: null });

    // ---- mortuary temples: the cult that had to keep running ----
    for (const [key, label] of [
      ['khufuMortuary', 'Khufu'],
      ['khafreMortuary', 'Khafre'],
      ['menkaureMortuary', 'Menkaure'],
    ]) {
      const m = t[key];
      R.falseDoor(m.x - m.w / 2 + 5.0, m.y, m.z + 6.2, 3.0, 'e', {
        site: null,
        id: `relic-${key}-door`,
        name: `False Door of ${label}`,
        text:
          'The mortuary temple is where the offerings were actually made, every day, by a priesthood ' +
          'endowed with land to pay for it. The tomb is the deliverable; this is the maintenance contract.',
        pm: 'Work package 7.x — the operating phase the capital project exists to hand over to.',
      });
      R.offeringTable(m.x - m.w / 2 + 8.2, m.y, m.z + 6.2, -Math.PI * 0.5, { site: null });
      R.jarCluster(m.x - m.w / 2 + 6.4, m.y, m.z - 6.6, 0, 5, rng);
      R.kaStatue(m.x - m.w / 2 + 5.6, m.y, m.z - 9.4, Math.PI * 0.5, { site: null, scale: 0.95,
        id: `relic-${key}-statue`, name: `Ka-Statue of ${label}` });
    }

    // ---- Khufu's valley temple ----
    const kfv = t.khufuValley;
    R.offeringTable(kfv.x - 6.0, kfv.y, kfv.z - 7.2, 0, { site: null });
    R.modelBoat(kfv.x - 8.5, kfv.y, kfv.z + 8.0, Math.PI * 0.5, { site: null,
      id: 'relic-khufu-valley-boat',
      name: 'Boat at the Landing' });
    R.toolCache(kfv.x + 6.0, kfv.y, kfv.z + 9.0, Math.PI, { site: null, id: 'relic-khufu-valley-tools' });

    R.finish(this.group);
    for (const c of R.colliders) {
      this.collision.addBox(c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, c.tag);
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
