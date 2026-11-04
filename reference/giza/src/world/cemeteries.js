import * as THREE from 'three';
import { makeRng } from '../engine/noise.js';
import { mergeGeometries, box, batteredBox, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight } from './terrain.js';
import {
  CEMETERIES, NAMED_TOMBS, BUILDERS_QUARTERS, ROCK_TOMBS,
  TEMPLES, CAUSEWAYS, QUEENS_PYRAMIDS, BOAT_PITS,
} from './layout.js';

/**
 * The private necropolis: everything on the site plan that is not a pyramid,
 * a temple or the Sphinx.
 *
 * Giza is mostly *this* - two great fields of mastabas laid out in streets on
 * the survey grid, the rock-cut tombs in the quarry faces, the workmen's
 * galleries, and the handful of individually famous tombs.  Without them the
 * plateau reads as three pyramids in an empty desert, which is the one thing
 * the real place has never been.
 *
 * Everything merges into one mesh per material.  Colliders are registered per
 * building rather than per field, so the streets between them are walkable.
 */

/** A mastaba: a battered rectangular block with a recessed false door east. */
function mastabaGeometry(w, d, h, rng) {
  const parts = [];
  const batter = 0.82;
  parts.push(batteredBox(w, w * batter, d, d * batter, h, 0, 0, 0));
  // The offering niches in the east face, which is where the cult happened.
  const niches = Math.max(1, Math.round(d / 14));
  for (let i = 0; i < niches; i++) {
    const nz = ((i + 0.5) / niches - 0.5) * d * 0.72;
    parts.push(box(0.9, h * 0.62, 2.0, w / 2 - 0.2, h * 0.31, nz));
    parts.push(box(0.5, h * 0.44, 1.1, w / 2 + 0.1, h * 0.22, nz));
  }
  // A rubble-and-plaster cap, weathered off along one edge.
  if (rng() < 0.45) parts.push(box(w * 0.7, 0.5, d * 0.8, (rng() - 0.5) * w * 0.2, h + 0.2, 0));
  return mergeGeometries(parts);
}

export class CemeterySystem {
  constructor(scene, textures, quality, collision) {
    this.group = new THREE.Group();
    this.group.name = 'cemeteries';
    scene.add(this.group);
    this.collision = collision;
    this.rng = makeRng(5501);
    this.points = [];
    this.torchSites = [];

    const lime = textures.limestone();
    const mud = textures.mudbrick();
    const aniso = Math.min(quality.settings.anisotropy, quality.maxAnisotropy);
    for (const set of [lime, mud]) for (const t of Object.values(set)) t.anisotropy = aniso;

    this.materials = {
      mastaba: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        color: 0xbdb096, roughness: 1, metalness: 0,
      }),
      dressed: new THREE.MeshStandardMaterial({
        map: lime.map, normalMap: lime.normalMap, roughnessMap: lime.roughnessMap,
        color: 0xd2c8ae, roughness: 0.88, metalness: 0,
      }),
      mud: new THREE.MeshStandardMaterial({
        map: mud.map, normalMap: mud.normalMap, roughnessMap: mud.roughnessMap,
        color: 0xa8917a, roughness: 1, metalness: 0,
      }),
      dark: new THREE.MeshBasicMaterial({ color: 0x0a0806, fog: true }),
    };

    this.buckets = { mastaba: [], dressed: [], mud: [], dark: [] };
    this._buildFields();
    this._buildNamedTombs();
    this._buildBuildersQuarters();
    this._buildRockTombs();

    for (const [key, parts] of Object.entries(this.buckets)) {
      if (!parts.length) continue;
      const geo = mergeGeometries(parts);
      if (key !== 'dark') scaleUvByWorldSize(geo, 2.8);
      const mesh = new THREE.Mesh(geo, this.materials[key]);
      mesh.name = `cemetery-${key}`;
      mesh.castShadow = key !== 'dark';
      mesh.receiveShadow = key !== 'dark';
      this.group.add(mesh);
    }
  }

  /**
   * Is this plot already spoken for?
   *
   * The cemeteries are laid out on a grid over ground that already carries
   * temples, causeways, queens' pyramids and boat pits.  A mastaba dropped on
   * top of one of those does not just look wrong: one of them landed squarely
   * in the gateway of Khufu's mortuary temple and sealed it.  Anything that
   * clashes simply loses its plot, which is also what happened on the real
   * plateau.
   */
  _occupied(cx, cz, w, d) {
    const clash = (ox, oz, ow, od, margin) =>
      Math.abs(cx - ox) < (w + ow) / 2 + margin && Math.abs(cz - oz) < (d + od) / 2 + margin;
    for (const t of Object.values(TEMPLES)) {
      // A generous margin on the east, which is where every temple gate is.
      if (clash(t.x + 8, t.z, t.w + 30, t.d + 14, 2)) return true;
    }
    for (const q of QUEENS_PYRAMIDS) {
      if (clash(q.x, q.z, q.baseLength, q.baseLength, 8)) return true;
    }
    for (const b of BOAT_PITS) {
      if (clash(b.x, b.z, b.w, b.d, 8)) return true;
    }
    for (const c of CAUSEWAYS) {
      // Distance from the plot centre to the causeway's line segment.
      const [x0, z0] = c.from;
      const [x1, z1] = c.to;
      const vx = x1 - x0;
      const vz = z1 - z0;
      const len2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((cx - x0) * vx + (cz - z0) * vz) / len2));
      const dist = Math.hypot(cx - (x0 + vx * t), cz - (z0 + vz * t));
      if (dist < c.width / 2 + Math.max(w, d) / 2 + 6) return true;
    }
    return false;
  }

  /** Register a building as solid, sunk into whatever the ground is doing. */
  _solid(x, y, z, w, h, d, tag) {
    this.collision.addCenteredBox(x, y + h / 2 - 0.6, z, w, h + 1.2, d, tag);
  }

  /**
   * The two mastaba fields, set out in streets.  The grid is deliberately
   * regular - that is the striking thing about the Western Cemetery on the
   * plan - but every tomb varies in size, and the streets stay clear so the
   * whole field can be walked.
   */
  _buildFields() {
    const rng = this.rng;
    for (const field of CEMETERIES) {
      const cellW = field.w / field.cols;
      const cellD = field.d / field.rows;
      for (let r = 0; r < field.rows; r++) {
        for (let c = 0; c < field.cols; c++) {
          if (rng() < 0.12) continue;                 // gaps and unfinished plots
          const cx = field.x - field.w / 2 + cellW * (c + 0.5);
          const cz = field.z - field.d / 2 + cellD * (r + 0.5);
          // Streets: the tomb takes about two thirds of its plot.
          const w = cellW * (0.44 + rng() * 0.18);
          const d = cellD * (0.5 + rng() * 0.2);
          const h = 3.6 + rng() * 3.4;
          if (this._occupied(cx, cz, w, d)) continue;
          const y = terrainHeight(cx, cz);
          const geo = mastabaGeometry(w, d, h, rng);
          geo.translate(cx, y, cz);
          this.buckets.mastaba.push(geo);
          this._solid(cx, y, cz, w, h, d, `mastaba-${field.id}`);
        }
      }
      this.points.push({
        id: `poi-${field.id}-cemetery`,
        name: field.name,
        position: [field.x, terrainHeight(field.x, field.z - field.d / 2 - 24) + 3, field.z - field.d / 2 - 24],
        look: [field.x, 4, field.z],
        category: 'monument',
        text:
          `${field.note} Every plot was allocated, surveyed and built to a standard: the streets run ` +
          'true to the pyramid’s own north, and the tombs are graded by rank as you move away from ' +
          'the king. It is a cemetery laid out like a housing scheme, because that is what it was.',
        pm: 'Work package 8.1 — the private cemeteries were a deliverable of the same programme.',
      });
    }
  }

  /** The tombs that get their own name on the plan. */
  _buildNamedTombs() {
    for (const t of NAMED_TOMBS) {
      const y = terrainHeight(t.x, t.z);
      if (t.stepped) {
        // Khentkawes: a rock knoll cased as a two-stepped block.
        this.buckets.dressed.push(
          (() => { const g = batteredBox(t.w, t.w * 0.9, t.d, t.d * 0.9, t.h * 0.62, 0, 0, 0); g.translate(t.x, y, t.z); return g; })(),
          (() => { const g = batteredBox(t.w * 0.62, t.w * 0.56, t.d * 0.62, t.d * 0.56, t.h * 0.38, 0, 0, 0); g.translate(t.x, y + t.h * 0.62, t.z); return g; })()
        );
        this._solid(t.x, y, t.z, t.w, t.h * 0.62, t.d, t.id);
        this._solid(t.x, y + t.h * 0.62, t.z, t.w * 0.62, t.h * 0.38, t.d * 0.62, t.id);
      } else if (t.shaft) {
        // Hetepheres: a low kerb round the mouth of a 27 m shaft.
        for (const [ox, oz, sw, sd] of [
          [-t.w / 2, 0, 1.2, t.d], [t.w / 2, 0, 1.2, t.d],
          [0, -t.d / 2, t.w, 1.2], [0, t.d / 2, t.w, 1.2],
        ]) {
          this.buckets.dressed.push(box(sw, t.h, sd, t.x + ox, y + t.h / 2, t.z + oz));
          this._solid(t.x + ox, y, t.z + oz, sw, t.h, sd, t.id);
        }
        this.buckets.dark.push(box(t.w - 2.4, 0.4, t.d - 2.4, t.x, y + 0.2, t.z));
      } else {
        const geo = mastabaGeometry(t.w, t.d, t.h, this.rng);
        geo.translate(t.x, y, t.z);
        this.buckets.mastaba.push(geo);
        // The offering chapel: a real room, with a way in from the east.
        if (t.chapel) {
          const cw = 4.6;
          const cd = 9.0;
          const ch = 3.0;
          const cx = t.x + t.w / 2 + cw / 2 - 0.4;
          this.buckets.dressed.push(
            box(cw + 1.6, 0.5, cd + 1.6, cx, y + ch + 0.25, t.z),
            box(0.8, ch, cd + 1.6, cx - cw / 2 - 0.4, y + ch / 2, t.z),
            box(cw + 1.6, ch, 0.8, cx, y + ch / 2, t.z - cd / 2 - 0.4),
            box(cw + 1.6, ch, 0.8, cx, y + ch / 2, t.z + cd / 2 + 0.4),
            box(0.8, ch, (cd + 1.6 - 1.6) / 2, cx + cw / 2 + 0.4, y + ch / 2, t.z - cd / 4 - 0.6),
            box(0.8, ch, (cd + 1.6 - 1.6) / 2, cx + cw / 2 + 0.4, y + ch / 2, t.z + cd / 4 + 0.6)
          );
          for (const [bx, bz, bw, bd] of [
            [cx - cw / 2 - 0.4, t.z, 0.8, cd + 1.6],
            [cx, t.z - cd / 2 - 0.4, cw + 1.6, 0.8],
            [cx, t.z + cd / 2 + 0.4, cw + 1.6, 0.8],
            [cx + cw / 2 + 0.4, t.z - cd / 4 - 0.6, 0.8, cd / 2],
            [cx + cw / 2 + 0.4, t.z + cd / 4 + 0.6, 0.8, cd / 2],
          ]) this._solid(bx, y, bz, bw, ch, bd, `${t.id}-chapel`);
          this.collision.addCenteredBox(cx, y + ch + 0.5, t.z, cw + 1.6, 0.6, cd + 1.6, `${t.id}-roof`);
          this.torchSites.push({ x: cx + cw / 2 + 1.8, y: y + 0.2, z: t.z - 2.0, scale: 0.9 });
          this.torchSites.push({ x: cx + cw / 2 + 1.8, y: y + 0.2, z: t.z + 2.0, scale: 0.9 });
          this.chapel = { x: cx, y, z: t.z, w: cw, d: cd, h: ch };
        }
        this._solid(t.x, y, t.z, t.w, t.h, t.d, t.id);
      }
      this.points.push({
        id: `poi-${t.id}`,
        name: t.name,
        position: [t.x + t.w / 2 + 10, y + 3, t.z],
        look: [t.x, y + t.h / 2, t.z],
        category: 'monument',
        text: t.text,
        pm: t.pm,
      });
    }
  }

  /** Long galleries for the rotating crews, behind the western wall. */
  _buildBuildersQuarters() {
    const q = BUILDERS_QUARTERS;
    const pitch = q.d / q.galleries;
    for (let i = 0; i < q.galleries; i++) {
      const gz = q.z - q.d / 2 + pitch * (i + 0.5);
      const y = terrainHeight(q.x, gz);
      // Two mud-brick walls and a light roof: a gallery, open at the east end.
      for (const side of [-1, 1]) {
        this.buckets.mud.push(box(q.w, 2.6, 0.9, q.x, y + 1.3, gz + side * (pitch / 2 - 0.5)));
        this._solid(q.x, y, gz + side * (pitch / 2 - 0.5), q.w, 2.6, 0.9, 'gallery');
      }
      this.buckets.mud.push(box(q.w * 0.72, 0.4, pitch - 1.0, q.x - q.w * 0.14, y + 2.8, gz));
      this.collision.addCenteredBox(q.x - q.w * 0.14, y + 3.0, gz, q.w * 0.72, 0.5, pitch - 1.0, 'gallery-roof');
    }
    const wy = terrainHeight(q.x - q.w / 2 - 8, q.z);
    this.buckets.mud.push(box(1.8, 4.2, q.d + 16, q.x - q.w / 2 - 8, wy + 2.1, q.z));
    this._solid(q.x - q.w / 2 - 8, wy, q.z, 1.8, 4.2, q.d + 16, 'quarters-wall');
    this.points.push({
      id: 'poi-builders-quarters',
      name: BUILDERS_QUARTERS.name,
      position: [q.x + q.w / 2 + 14, terrainHeight(q.x + q.w / 2 + 14, q.z) + 3, q.z],
      look: [q.x, 4, q.z],
      category: 'logistics',
      text:
        'Barrack galleries for the crews on rotation: sleeping platforms down each side, an open end, ' +
        'a roof of poles and matting. Each gallery held perhaps forty men — a phyle, the unit the whole ' +
        'workforce was organised in, and the unit the gang names in the relieving chambers belong to.',
      pm: 'Work packages 4.1–4.4 — accommodation is a hard constraint on how many people you can field.',
    });
  }

  /** Tomb façades cut into the quarry escarpments. */
  _buildRockTombs() {
    const rng = this.rng;
    for (const row of ROCK_TOMBS) {
      for (let i = 0; i < row.count; i++) {
        const off = (i - (row.count - 1) / 2) * row.spacing;
        const x = row.axis === 'z' ? row.x : row.x + off;
        const z = row.axis === 'z' ? row.z + off : row.z;
        const y = terrainHeight(x, z);
        const w = 4.2 + rng() * 2.4;
        const h = 3.0 + rng() * 1.4;
        const face = row.face;
        // A dressed façade set into the rock, with a dark doorway.
        const nx = row.axis === 'z' ? face * 1.2 : 0;
        const nz = row.axis === 'z' ? 0 : face * 1.2;
        this.buckets.dressed.push(
          box(row.axis === 'z' ? 2.4 : w, h + 1.4, row.axis === 'z' ? w : 2.4, x + nx, y + (h + 1.4) / 2, z + nz)
        );
        this.buckets.dark.push(
          box(row.axis === 'z' ? 0.5 : 1.3, h * 0.62, row.axis === 'z' ? 1.3 : 0.5,
            x + nx * 1.6, y + h * 0.31, z + nz * 1.6)
        );
        this._solid(x + nx, y, z + nz, row.axis === 'z' ? 2.4 : w, h + 1.4, row.axis === 'z' ? w : 2.4, 'rock-tomb');
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
