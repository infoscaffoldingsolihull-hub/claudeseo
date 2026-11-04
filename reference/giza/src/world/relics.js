import * as THREE from 'three';
import { mergeGeometries, box } from './geobuild.js';

/**
 * The furnishing kit for the interiors: carved hieroglyphs, painted registers,
 * and the grave goods themselves.
 *
 * Everything here is built from primitives in a local frame, then rotated and
 * dropped into place, and accumulated into one bucket per material.  A whole
 * pyramid's worth of relics therefore costs about a dozen draw calls rather
 * than one per object.
 *
 * Objects that are worth walking over to look at also register a *relic
 * record* - the same shape as a point of interest - so the discovery and codex
 * machinery picks them up with no extra wiring.
 */

/* Pigments actually available to a 4th Dynasty workshop: ochres, Egyptian
 * blue (ground frit), malachite green, gypsum white, carbon black. */
const PALETTE = {
  gold: { color: 0xd4af37, roughness: 0.28, metalness: 0.92 },
  copper: { color: 0xa9613a, roughness: 0.38, metalness: 0.78 },
  alabaster: { color: 0xe6dcc4, roughness: 0.34, metalness: 0 },
  cedar: { color: 0x6b4a2c, roughness: 0.82, metalness: 0 },
  ochre: { color: 0xc98b32, roughness: 0.74, metalness: 0 },
  blue: { color: 0x24578f, roughness: 0.62, metalness: 0 },
  red: { color: 0x9d3a26, roughness: 0.76, metalness: 0 },
  green: { color: 0x3f7a55, roughness: 0.72, metalness: 0 },
  white: { color: 0xe8e0cc, roughness: 0.68, metalness: 0 },
  black: { color: 0x171310, roughness: 0.58, metalness: 0 },
  faience: { color: 0x3fa5a0, roughness: 0.3, metalness: 0.1 },
  granite: { color: 0x6b4a44, roughness: 0.5, metalness: 0.04 },
  linen: { color: 0xd8cdb2, roughness: 0.92, metalness: 0 },
};

/** Cylinder standing on its base at the origin. */
function cyl(rTop, rBottom, h, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Sphere, optionally squashed, centred at the point given. */
function ball(r, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

export class RelicKit {
  constructor(textures, quality) {
    const glyphTex = textures.hieroglyphs();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    glyphTex.anisotropy = aniso;

    this.materials = {
      // Sunk relief cut into the dressed limestone: the map carries the
      // glyph columns, and a strong normal scale makes them read as carving
      // rather than wallpaper under raking torchlight.
      glyph: new THREE.MeshStandardMaterial({
        map: glyphTex,
        color: 0xd7c8a4,
        roughness: 0.84,
        metalness: 0,
      }),
      glyphPainted: new THREE.MeshStandardMaterial({
        map: glyphTex,
        color: 0xe4cf9c,
        emissive: 0x2a1d0c,
        emissiveIntensity: 0.35,
        roughness: 0.7,
        metalness: 0,
      }),
    };
    for (const [name, spec] of Object.entries(PALETTE)) {
      this.materials[name] = new THREE.MeshStandardMaterial(spec);
    }

    this.buckets = {};
    for (const key of Object.keys(this.materials)) this.buckets[key] = [];

    this.relics = [];
    this.colliders = [];
    this.torchSites = [];
  }

  /**
   * Returns a placement function bound to one local frame.  Artifacts are
   * modelled facing -Z at the origin and then yawed into place, which keeps
   * every builder below readable.
   */
  _at(x, y, z, ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(ry);
    m.setPosition(x, y, z);
    return (bucket, ...geometries) => {
      for (const g of geometries) {
        if (!g) continue;
        g.applyMatrix4(m);
        this.buckets[bucket].push(g);
      }
    };
  }

  /** Register something worth walking over to look at. */
  relic(spec) {
    this.relics.push({
      category: 'relic',
      interior: spec.site,
      site: spec.site,
      position: [spec.x, spec.y, spec.z],
      look: spec.look || [spec.x, spec.y, spec.z],
      ...spec,
    });
    return this;
  }

  /** Solid volume the player should not walk through. */
  solid(x, y, z, w, h, d, tag = 'relic') {
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y, maxY: y + h,
      minZ: z - d / 2, maxZ: z + d / 2,
      tag,
    });
    return this;
  }

  /* ------------------------------------------------------------ carving */

  /**
   * A register of hieroglyphs on a wall face.
   *
   * `facing` is the outward normal of the wall the panel is applied to, so
   * the caller thinks in terms of "the east wall" rather than in yaw angles.
   * The panel stands a couple of centimetres proud of the masonry: enough to
   * clear z-fighting, little enough that it does not read as a hung board.
   */
  glyphPanel(x, y, z, width, height, facing = 'n', opts = {}) {
    const { tile = 2.4, painted = false, proud = 0.02 } = opts;
    const geo = new THREE.PlaneGeometry(width, height);
    // One texture tile per `tile` metres keeps glyphs about 0.3 m tall,
    // which is the height of a monumental register.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (width / tile), uv.getY(i) * (height / tile));
    }
    const yaw = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
    const off = new THREE.Vector3(0, 0, proud).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.setPosition(x + off.x, y + height / 2, z + off.z);
    geo.applyMatrix4(m);
    this.buckets[painted ? 'glyphPainted' : 'glyph'].push(geo);
    return this;
  }

  /**
   * A royal cartouche: the shen ring drawn out into an oval, with the name
   * inside it.  Two of these flanking a doorway is the standard treatment.
   */
  cartouche(x, y, z, height = 1.1, facing = 'n') {
    const yaw = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
    const put = this._at(x, y, z, yaw);
    const w = height * 0.46;
    const r = w / 2;
    const straight = height - w;
    // The ring: two straight sides closed by a half-round at each end.
    const ring = new THREE.TorusGeometry(r, 0.045, 7, 20, Math.PI);
    ring.rotateZ(Math.PI);
    ring.translate(0, -straight / 2, 0.055);
    const ring2 = new THREE.TorusGeometry(r, 0.045, 7, 20, Math.PI);
    ring2.translate(0, straight / 2, 0.055);
    put('gold',
      ring, ring2,
      box(0.09, straight, 0.09, -r, 0, 0.055),
      box(0.09, straight, 0.09, r, 0, 0.055),
      // The bar closing the ring at its foot.
      box(w + 0.2, 0.1, 0.09, 0, -height / 2 - 0.02, 0.055));
    put('glyphPainted', (() => {
      const g = new THREE.PlaneGeometry(w * 0.8, straight * 0.92);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.34, uv.getY(i) * 1.5);
      g.translate(0, 0, 0.05);
      return g;
    })());
    return this;
  }

  /**
   * Palace-façade panelling: the recessed niching that decorates Menkaure's
   * panelled chamber, and the only architectural decoration in any Giza
   * pyramid's interior.
   */
  panelling(x, y, z, width, height, facing = 'n', count = 5) {
    const yaw = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
    const put = this._at(x, y, z, yaw);
    const pitch = width / count;
    for (let i = 0; i < count; i++) {
      const cx = -width / 2 + pitch * (i + 0.5);
      // Each panel is a pair of shallow jambs around a deeper recess.
      put('white',
        box(pitch * 0.16, height, 0.16, cx - pitch * 0.3, height / 2, 0.08),
        box(pitch * 0.16, height, 0.16, cx + pitch * 0.3, height / 2, 0.08),
        box(pitch * 0.44, height * 0.08, 0.2, cx, height * 0.96, 0.1));
    }
    return this;
  }

  /**
   * A star ceiling: the night sky as the Egyptians painted it, deep blue with
   * five-pointed stars.  Painted on the underside, so it faces down.
   */
  starCeiling(x, y, z, width, depth, rng) {
    const field = new THREE.PlaneGeometry(width, depth);
    field.rotateX(Math.PI / 2);
    field.translate(x, y, z);
    this.buckets.blue.push(field);
    const count = Math.max(8, Math.round((width * depth) / 2.2));
    for (let i = 0; i < count; i++) {
      const sx = x + (rng() - 0.5) * width * 0.94;
      const sz = z + (rng() - 0.5) * depth * 0.94;
      const r = 0.11 + rng() * 0.07;
      // A five-pointed star reads well enough as two crossed slivers.
      const a = rng() * Math.PI;
      const s1 = box(r * 2.4, 0.02, r * 0.5, sx, y - 0.02, sz, a);
      const s2 = box(r * 2.4, 0.02, r * 0.5, sx, y - 0.02, sz, a + Math.PI / 2);
      this.buckets.ochre.push(s1, s2);
    }
    return this;
  }

  /**
   * A false door: the threshold the ka crosses to take its offerings.  Jambs,
   * a drum roll imitating the rolled-up reed mat, a lintel and a glyph panel.
   */
  falseDoor(x, y, z, height = 2.6, facing = 'n', opts = {}) {
    const yaw = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
    const put = this._at(x, y, z, yaw);
    const w = height * 0.62;
    put('white',
      box(w, height, 0.34, 0, height / 2, 0.17),
      box(w * 0.62, height * 0.72, 0.2, 0, height * 0.36, 0.3),
      box(w * 0.34, height * 0.5, 0.14, 0, height * 0.25, 0.38));
    // The drum roll over the recess.
    const drum = new THREE.CylinderGeometry(0.09, 0.09, w * 0.34, 10);
    drum.rotateZ(Math.PI / 2);
    drum.translate(0, height * 0.52, 0.42);
    put('white', drum);
    put('red', box(w * 0.34, 0.05, 0.16, 0, height * 0.5 - 0.06, 0.44));
    this.glyphPanelLocal(put, 0, height * 0.62, 0.36, w * 0.5, height * 0.28);
    this.glyphPanelLocal(put, -w * 0.42, height * 0.4, 0.32, 0.18, height * 0.6);
    this.glyphPanelLocal(put, w * 0.42, height * 0.4, 0.32, 0.18, height * 0.6);
    if (opts.name) {
      this.relic({
        id: opts.id || `relic-false-door-${Math.round(x)}-${Math.round(z)}`,
        name: opts.name,
        site: opts.site,
        x, y: y + height * 0.6, z,
        text: opts.text,
        pm: opts.pm,
      });
    }
    return this;
  }

  /** Glyph plane inside an artifact's own local frame. */
  glyphPanelLocal(put, lx, ly, lz, width, height, tile = 0.9) {
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (width / tile), uv.getY(i) * (height / tile));
    }
    g.translate(lx, ly, lz);
    put('glyphPainted', g);
    return this;
  }

  /* ---------------------------------------------------------- artifacts */

  /** Low alabaster offering table, loaded with bread, a haunch and two jars. */
  offeringTable(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    put('alabaster',
      box(1.5, 0.14, 0.92, 0, 0.62, 0),
      box(0.22, 0.62, 0.22, -0.52, 0.31, 0),
      box(0.22, 0.62, 0.22, 0.52, 0.31, 0),
      // The channel and basin cut into the top for the libation.
      box(0.2, 0.05, 0.5, 0, 0.7, 0.2));
    put('linen',
      ball(0.16, -0.34, 0.75, -0.14, 1, 0.55, 1),
      ball(0.15, -0.1, 0.75, -0.18, 1, 0.55, 1),
      ball(0.14, -0.22, 0.82, -0.16, 1, 0.5, 1));
    put('red', ball(0.13, 0.16, 0.76, -0.1, 1.5, 0.7, 1));
    put('alabaster',
      cyl(0.07, 0.09, 0.3, 0.42, 0.69, 0.16, 10),
      cyl(0.07, 0.09, 0.26, 0.58, 0.69, -0.04, 10));
    this.solid(x, y, z, 1.7, 0.78, 1.1, 'offering-table');
    if (opts.site) {
      this.relic({
        id: opts.id || `relic-offering-${Math.round(x)}-${Math.round(z)}`,
        name: opts.name || 'Offering Table',
        site: opts.site,
        x, y: y + 1.0, z,
        text: opts.text ||
          'Alabaster, with a libation channel cut across the top. The offering formula asks that the king ' +
          'be given “a thousand of bread, a thousand of beer, a thousand of oxen and fowl” — the ration ' +
          'the ka draws on for ever.',
        pm: opts.pm || 'Work package 8.4 — funerary equipment. Zero float: the handover date is the funeral.',
      });
    }
    return this;
  }

  /** Canopic chest: alabaster, four compartments, four stopper heads. */
  canopicChest(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    put('alabaster',
      box(0.94, 0.72, 0.94, 0, 0.36, 0),
      box(1.04, 0.1, 1.04, 0, 0.77, 0));
    // The Four Sons of Horus: human, baboon, jackal, falcon.
    const heads = [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]];
    const tints = ['alabaster', 'cedar', 'black', 'ochre'];
    heads.forEach(([hx, hz], i) => {
      put('alabaster', cyl(0.11, 0.13, 0.16, hx, 0.82, hz, 10));
      put(tints[i], ball(0.12, hx, 1.03, hz, 1, 1.15, 1));
      put(tints[i], box(0.2, 0.13, 0.12, hx, 1.0, hz - 0.1));
    });
    this.glyphPanelLocal(put, 0, 0.4, 0.48, 0.76, 0.5, 0.7);
    this.solid(x, y, z, 1.1, 1.1, 1.1, 'canopic');
    this.relic({
      id: opts.id || `relic-canopic-${Math.round(x)}-${Math.round(z)}`,
      name: opts.name || 'Canopic Chest',
      site: opts.site,
      x, y: y + 1.2, z,
      text: opts.text ||
        'Four compartments under four stoppers — the Sons of Horus, who guard the lungs, stomach, ' +
        'intestines and liver. The heart stayed in the body; it had to be weighed.',
      pm: 'Work package 8.4 — funerary equipment, procured in parallel with the chamber fit-out.',
    });
    return this;
  }

  /** A cluster of sealed alabaster and pottery jars against a wall. */
  jarCluster(x, y, z, ry, count = 5, rng = Math.random) {
    const put = this._at(x, y, z, ry);
    for (let i = 0; i < count; i++) {
      const jx = (i - (count - 1) / 2) * 0.36 + (rng() - 0.5) * 0.06;
      const jz = (rng() - 0.5) * 0.22;
      const h = 0.42 + rng() * 0.3;
      const r = 0.13 + rng() * 0.05;
      const mat = rng() < 0.45 ? 'alabaster' : 'red';
      put(mat, cyl(r * 0.55, r, h, jx, 0, jz, 10));
      put(mat, ball(r * 0.62, jx, h + 0.02, jz, 1, 0.7, 1));
      put('linen', cyl(r * 0.6, r * 0.6, 0.05, jx, h + 0.06, jz, 8));
    }
    return this;
  }

  /**
   * A ka-statue: the stone body the spirit inhabits if the mummy is destroyed.
   * Striding pose, nemes headdress, false beard, left foot forward.
   */
  kaStatue(x, y, z, ry, opts = {}) {
    const scale = opts.scale || 1;
    const put = this._at(x, y, z, ry);
    const s = (g) => { g.scale(scale, scale, scale); return g; };
    put('white',
      s(box(0.86, 0.16, 1.1, 0, 0.08, 0.06)),            // plinth
      s(box(0.28, 0.9, 0.32, -0.17, 0.16, -0.14)),        // forward leg
      s(box(0.28, 0.9, 0.32, 0.17, 0.16, 0.16)),          // rear leg
      s(box(0.62, 0.42, 0.4, 0, 1.02, 0)),                // kilt
      s(box(0.56, 0.66, 0.34, 0, 1.4, 0)),                // torso
      s(box(0.14, 0.6, 0.16, -0.33, 1.44, -0.02)),        // arms held at the sides
      s(box(0.14, 0.6, 0.16, 0.33, 1.44, -0.02)),
      s(box(0.2, 0.12, 0.2, 0, 2.06, 0)));                // neck
    put('white', s(ball(0.19, 0, 2.2, 0, 1, 1.15, 1.05)));
    // Nemes: the striped headcloth, lappets falling to the chest.
    put('blue',
      s(box(0.46, 0.3, 0.44, 0, 2.3, 0.02)),
      s(box(0.12, 0.42, 0.2, -0.2, 2.02, -0.14)),
      s(box(0.12, 0.42, 0.2, 0.2, 2.02, -0.14)));
    put('gold',
      s(box(0.46, 0.06, 0.44, 0, 2.46, 0.02)),
      s(box(0.08, 0.2, 0.1, 0, 2.02, -0.2)),              // false beard
      s(box(0.14, 0.1, 0.12, 0, 2.42, -0.22)));           // uraeus
    this.solid(x, y, z, 1.0 * scale, 2.5 * scale, 1.2 * scale, 'statue');
    if (opts.site) {
      this.relic({
        id: opts.id || `relic-ka-${Math.round(x)}-${Math.round(z)}`,
        name: opts.name || 'Ka-Statue',
        site: opts.site,
        x, y: y + 2.2 * scale, z,
        text: opts.text ||
          'Sealed in a serdab with only a narrow slot to see and smell through. If the body failed, the ' +
          'ka could inhabit the stone instead — redundancy engineered into the afterlife.',
        pm: 'Work package 8.4 — sculpture, on the same granite and alabaster supply chain as the chamber.',
      });
    }
    return this;
  }

  /** Gilded shrine with a recumbent Anubis jackal on the lid. */
  anubisShrine(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    put('cedar', box(1.26, 0.62, 0.72, 0, 0.31, 0));
    put('gold',
      box(1.32, 0.08, 0.78, 0, 0.66, 0),
      // Cavetto cornice: the flared top the Egyptians put on every shrine.
      box(1.4, 0.12, 0.86, 0, 0.74, 0),
      box(0.16, 0.34, 0.16, -0.5, 0.0, -0.24),
      box(0.16, 0.34, 0.16, 0.5, 0.0, -0.24));
    // The jackal: long body, upright ears, tail hanging over the edge.
    put('black',
      box(0.28, 0.24, 0.86, 0, 0.8, 0.02),
      box(0.16, 0.14, 0.34, 0, 0.92, -0.44),
      box(0.05, 0.24, 0.06, -0.06, 1.04, -0.5),
      box(0.05, 0.24, 0.06, 0.06, 1.04, -0.5),
      box(0.07, 0.07, 0.4, 0, 0.82, 0.6));
    put('gold', box(0.3, 0.06, 0.2, 0, 0.94, -0.42));
    this.glyphPanelLocal(put, 0, 0.32, 0.37, 1.0, 0.4, 0.8);
    this.solid(x, y, z, 1.5, 1.1, 1.0, 'shrine');
    this.relic({
      id: opts.id || `relic-anubis-${Math.round(x)}-${Math.round(z)}`,
      name: opts.name || 'Shrine of Anubis',
      site: opts.site,
      x, y: y + 1.1, z,
      text: opts.text ||
        'Anubis, “he who is upon his mountain”, keeps the necropolis. The jackal was the animal that ' +
        'actually haunted the desert cemeteries — better to have it as a guardian than as a scavenger.',
      pm: 'Work package 8.4 — funerary equipment.',
    });
    return this;
  }

  /** Cedar model boat: the vessel the king sails with the sun. */
  modelBoat(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    const hull = [];
    // Hull: a shallow crescent, swept up into papyriform prow and stern.
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const lz = (t - 0.5) * 3.4;
      const rise = Math.pow(Math.abs(t - 0.5) * 2, 2.6) * 0.9;
      const w = 0.62 * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.72);
      hull.push(box(w, 0.3 + rise, 0.34, 0, 0.15 + rise / 2, lz));
    }
    put('cedar', ...hull);
    put('cedar',
      box(0.7, 0.06, 0.9, 0, 0.32, 0.1),
      box(0.5, 0.44, 0.66, 0, 0.34, 0.12),
      box(0.12, 0.9, 0.12, 0, 0.3, -0.5));
    put('linen', box(0.56, 0.5, 0.06, 0, 0.42, -0.55));
    // Steering oars over the stern quarter.
    for (const side of [-1, 1]) {
      const oar = box(0.06, 0.06, 1.1, side * 0.3, 0.42, 1.3);
      oar.applyMatrix4(new THREE.Matrix4().makeRotationX(0.3));
      put('cedar', oar, box(0.16, 0.02, 0.4, side * 0.34, 0.12, 1.86));
    }
    this.solid(x, y, z, 1.1, 0.9, 3.6, 'boat');
    this.relic({
      id: opts.id || `relic-boat-${Math.round(x)}-${Math.round(z)}`,
      name: opts.name || 'Model Solar Barque',
      site: opts.site,
      x, y: y + 1.0, z,
      text: opts.text ||
        'A working boat in miniature, cedar from Byblos. The full-size vessel buried on the south side ' +
        'came apart into 1 224 pieces and went back together with rope lashings and no metal at all.',
      pm: 'Work package 8.3 — boat pits. Sealed before handover; no float whatsoever.',
    });
    return this;
  }

  /** A round-topped stela, the standing record of who built and who owns. */
  stela(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    const h = opts.height || 1.9;
    const w = h * 0.56;
    put('white', box(w, h - w / 2, 0.26, 0, (h - w / 2) / 2, 0));
    const top = new THREE.CylinderGeometry(w / 2, w / 2, 0.26, 18, 1, false, 0, Math.PI);
    top.rotateX(Math.PI / 2);
    top.rotateZ(Math.PI);
    top.translate(0, h - w / 2, 0);
    put('white', top);
    put('white', box(w * 1.24, 0.16, 0.42, 0, 0.08, 0));
    this.glyphPanelLocal(put, 0, h * 0.46, 0.14, w * 0.82, h * 0.66, 0.8);
    if (opts.site) {
      this.relic({
        id: opts.id || `relic-stela-${Math.round(x)}-${Math.round(z)}`,
        name: opts.name || 'Inscribed Stela',
        site: opts.site,
        x, y: y + h * 0.7, z,
        text: opts.text,
        pm: opts.pm || 'Work package 8.5 — closure and handover documentation.',
      });
    }
    return this;
  }

  /** The tools that actually cut the stone, laid out on a reed mat. */
  toolCache(x, y, z, ry, opts = {}) {
    const put = this._at(x, y, z, ry);
    put('linen', box(1.5, 0.03, 0.94, 0, 0.015, 0));
    put('copper',
      box(0.05, 0.03, 0.3, -0.5, 0.05, -0.14),
      box(0.05, 0.03, 0.3, -0.4, 0.05, -0.1),
      box(0.05, 0.03, 0.3, -0.3, 0.05, -0.16),
      box(0.09, 0.04, 0.22, -0.42, 0.05, 0.24),
      box(0.28, 0.03, 0.06, 0.5, 0.05, -0.26));
    put('cedar',
      box(0.07, 0.07, 0.42, 0.06, 0.05, 0.0),
      box(0.14, 0.14, 0.14, 0.06, 0.06, -0.26),
      box(0.05, 0.05, 0.9, 0.42, 0.04, 0.16),
      box(0.5, 0.04, 0.05, 0.42, 0.06, 0.16));
    // Dolerite pounders: the hard round stones that shaped the granite.
    put('black',
      ball(0.11, 0.34, 0.11, -0.2),
      ball(0.1, 0.52, 0.1, -0.06),
      ball(0.12, 0.44, 0.12, 0.1));
    this.relic({
      id: opts.id || `relic-tools-${Math.round(x)}-${Math.round(z)}`,
      name: opts.name || 'Masons’ Tool Cache',
      site: opts.site,
      x, y: y + 0.6, z,
      text: opts.text ||
        'Copper chisels, wooden mallets, a plumb-bob square and dolerite pounders. Copper cuts limestone ' +
        'but not granite: granite was bruised away with the dolerite, then ground smooth with quartz sand.',
      pm: 'Work packages 2.x — quarrying and dressing. Tool consumption is a real cost line in the model.',
    });
    return this;
  }

  /** The lid the robbers levered off, left leaning where it fell. */
  brokenLid(x, y, z, ry, w = 2.4, d = 1.1) {
    const put = this._at(x, y, z, ry);
    const slab = box(w * 0.62, 0.22, d, -w * 0.2, 0.11, 0);
    const leaning = box(w * 0.44, 0.22, d, 0, 0, 0);
    leaning.applyMatrix4(
      new THREE.Matrix4().makeRotationZ(-0.55).setPosition(w * 0.3, 0.42, 0)
    );
    put('granite', slab, leaning);
    return this;
  }

  /** Merge every bucket into the scene: about a dozen draw calls in total. */
  finish(scene) {
    this.meshes = [];
    for (const [key, parts] of Object.entries(this.buckets)) {
      if (!parts.length) continue;
      const geo = mergeGeometries(parts);
      if (!geo.attributes.position.count) continue;
      const mesh = new THREE.Mesh(geo, this.materials[key]);
      mesh.name = `relics-${key}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    return this;
  }

  dispose() {
    for (const m of this.meshes || []) m.geometry.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
