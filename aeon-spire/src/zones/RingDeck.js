/**
 * ZONE 3 — THE RING DECK (L31 … L55)
 *
 * Concept borrowed from the disc form of Aldar HQ, combined with a
 * cantilevered sky-ring: the tower swells into a circular disc volume, and a
 * glass-bottomed halo walkway is cantilevered clear of the facade all the
 * way around. Structurally it is a perimeter truss ring carried on raker
 * columns, with seismic dampers at the ring-to-tower joint (Section C).
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { RING, SAIL, SPIRE, LEVELS } from '../world/SitePlan.js';

/** The crown's base half-width, so the shaft meets Zone 4 without a step. */
const SPIRE_BASE_HALF = SPIRE.baseHalf;
import {
  mergeGeometries, xform, box, cyl, circleRing, roundedRectRing, loft, mesh,
  instance, member, tube, circularTruss, balustrade, glassBalustrade
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, smoothstep } from '../core/MathUtil.js';

export class RingDeck extends Zone {
  constructor(ctx) {
    super('ring', 'The Ring Deck', ctx);
    this.appearsAtMilestone = 6;
  }

  get radius() { return RING.haloRadius + 30; }

  /**
   * Plan outline of the disc at world height y.
   *
   * The disc is a coin standing on edge: circular when seen along +X, and
   * only `discThickHalf` deep in X. `zHalf` therefore follows the circle's
   * chord at that height, while `xHalf` is nearly constant and rounds off
   * near the rim so the edge reads as a machined disc rather than a slab.
   */
  discPlan(y) {
    const dy = (y - RING.discCentreY) / RING.discRadius;
    const k = Math.max(0, 1 - dy * dy);
    const zHalf = RING.discRadius * Math.sqrt(k);
    const xHalf = RING.discThickHalf * Math.pow(k, 0.22);
    return { xHalf: Math.max(xHalf, 0.35), zHalf: Math.max(zHalf, 0.35) };
  }

  /** Half-depth of the disc in X at height y (used by the halo and truss). */
  discRadiusAt(y) { return this.discPlan(y).zHalf; }

  massing() {
    const M = this.materials;

    /* --- The disc volume --- */
    const skinMat = M.surface('ringSkin', 'brushedMetal', {
      repeat: 14, roughness: 0.34, metalness: 0.68, exterior: true, color: 0xc6cdd6
    });
    const heights = [];
    const n = 40;
    // Inset the extreme top and bottom slightly so the caps are not degenerate.
    for (let i = 0; i <= n; i++) {
      heights.push(lerp(RING.base + 0.6, RING.top - 0.6, i / n));
    }
    const disc = loft((t, y) => {
      const p = this.discPlan(y);
      return roundedRectRing(p.xHalf, p.zHalf, Math.min(p.xHalf, p.zHalf) * 0.95, 44);
    }, heights, { capTop: true, capBottom: true, uvScale: 0.03 });
    this.shell.add(mesh(disc, skinMat, { name: 'RingDisc', cast: true, receive: true }));

    /* --- The tower shaft continues through the disc, waisted where it
       passes through so the disc's faces stay clear. Without the waist the
       shaft is wider than the disc is thick and reads as a black band
       painted across it. --- */
    const coreMat = M.surface('ringCore', 'brushedMetal', {
      repeat: 10, roughness: 0.32, metalness: 0.7, exterior: true, color: 0xb4bcc6
    });
    const waist = 17.5;
    const shaftHeights = [];
    const sn = 22;
    for (let i = 0; i <= sn; i++) shaftHeights.push(lerp(RING.base - 3, RING.top + 3, i / sn));
    this.shell.add(mesh(
      loft((t, y) => {
        // Cosine waist: full width at both ends, narrowest at the disc's centre.
        const k = Math.sin(Math.PI * clamp((y - (RING.base - 3)) / ((RING.top + 3) - (RING.base - 3)), 0, 1));
        const endX = lerp(SAIL.topHalfX, SPIRE_BASE_HALF, t);
        const endZ = lerp(SAIL.topHalfZ, SPIRE_BASE_HALF * 0.86, t);
        const hx = lerp(endX, waist, Math.pow(k, 0.7));
        const hz = lerp(endZ, waist * 0.94, Math.pow(k, 0.7));
        return roundedRectRing(hx, hz, Math.min(hx, hz) * 0.4, 30);
      }, shaftHeights, { capTop: true, uvScale: [0.03, 0.02] }),
      coreMat, { name: 'RingCoreShaft', cast: true, receive: true }
    ));

    /* --- Floor plates inside the disc --- */
    const slabMat = M.solid('ringSlab', { color: 0x9aa0a8, roughness: 0.78, exterior: true });
    const slabs = [];
    for (const lvl of RING.floors) {
      const t = (lvl - 31) / 24;
      const y = lerp(RING.base + 3, RING.top - 3, t);
      const p = this.discPlan(y);
      if (p.zHalf < RING.discInner + 3) continue;
      const outer = roundedRectRing(p.xHalf - 0.9, p.zHalf - 0.9, Math.min(p.xHalf, p.zHalf) * 0.9, 32);
      const shape = new THREE.Shape();
      shape.moveTo(outer[0][0], outer[0][1]);
      for (let k = 1; k < outer.length; k++) shape.lineTo(outer[k][0], outer[k][1]);
      shape.closePath();
      const hole = new THREE.Path();
      const hr = RING.discInner;
      hole.absarc(0, 0, Math.min(hr, p.xHalf - 2.5), 0, TAU, true);
      if (p.xHalf - 2.5 > 4) shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2);
      slabs.push(xform(g, { pos: [0, y, 0] }));
    }
    this.shell.add(mesh(mergeGeometries(slabs), slabMat, { name: 'RingFloorPlates', receive: true }));

    /* --- The cantilevered halo walkway --- */
    this.buildHalo();

    /* --- Perimeter truss ring on raker columns --- */
    this.buildStructure();
  }

  /**
   * Outline of the halo walkway at its level: the disc's own oval plan
   * pushed outward by a constant offset. A true circle would cantilever
   * 50 m clear of the disc on its thin axis and read as a funnel, whereas
   * an offset outline is what "wraps the tower" actually means here.
   */
  haloOutline(offset, count = 96) {
    const p = this.discPlan(RING.haloLevel);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      // Normalised direction on the disc's ellipse, then pushed out along
      // the outward normal of that ellipse.
      const ex = c * p.xHalf, ez = s * p.zHalf;
      const nx = c / p.xHalf, nz = s / p.zHalf;
      const nl = Math.hypot(nx, nz) || 1;
      pts.push([ex + (nx / nl) * offset, ez + (nz / nl) * offset]);
    }
    return pts;
  }

  /**
   * The halo: a glass-bottomed deck cantilevered clear of the disc on
   * radial ribs, with a diagonal tie back up to the facade so the load path
   * is legible rather than magical.
   */
  buildHalo() {
    const M = this.materials;
    const y = RING.haloLevel;
    const inner = this.haloOutline(2.4);
    const outer = this.haloOutline(2.4 + RING.haloWidth);
    const anchor = this.haloOutline(-0.6);
    const tieTop = (() => {
      const p = this.discPlan(y + 13);
      const pts = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU;
        pts.push([Math.cos(a) * p.xHalf, Math.sin(a) * p.zHalf]);
      }
      return pts;
    })();

    /* Radial ribs and diagonal ties. */
    const ribMat = M.surface('haloRib', 'paintedSteel', {
      repeat: 2, roughness: 0.38, metalness: 0.66, exterior: true, color: 0xe4e8ec,
      opts: { hex: 0xc9ced6 }
    });
    const ribs = [];
    for (let i = 0; i < 96; i += 2) {
      const a0 = anchor[i], o0 = outer[i];
      const m = member([a0[0], y + 0.9, a0[1]], [o0[0], y - 0.05, o0[1]], 0.26, 0.66);
      if (m) ribs.push(m);
      const t = tieTop[i];
      const t2 = tube([o0[0], y - 0.05, o0[1]], [t[0], y + 13, t[1]], 0.075, 5);
      if (t2) ribs.push(t2);
    }
    this.shell.add(mesh(mergeGeometries(ribs.filter(Boolean)), ribMat, {
      name: 'HaloRibs', cast: true
    }));

    /* Circumferential edge beams. */
    const edge = [];
    for (let i = 0; i < 96; i++) {
      const j = (i + 1) % 96;
      edge.push(member([outer[i][0], y - 0.2, outer[i][1]], [outer[j][0], y - 0.2, outer[j][1]], 0.42, 0.85));
      edge.push(member([inner[i][0], y - 0.2, inner[i][1]], [inner[j][0], y - 0.2, inner[j][1]], 0.34, 0.7));
    }
    this.shell.add(mesh(mergeGeometries(edge.filter(Boolean)), ribMat, {
      name: 'HaloEdgeBeams', cast: true
    }));

    /* The structural glass floor, built as a ribbon between the two outlines. */
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= 96; i++) {
      const k = i % 96;
      pos.push(inner[k][0], y + 0.02, inner[k][1]);
      pos.push(outer[k][0], y + 0.02, outer[k][1]);
      uvs.push(i / 8, 0, i / 8, 1);
    }
    for (let i = 0; i < 96; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    floorGeo.setIndex(idx);
    floorGeo.computeVertexNormals();
    const glassMat = M.glass('haloGlassFloor', {
      color: 0xaecfdd, opacity: 0.30, roughness: 0.04, metalness: 0.05,
      side: THREE.DoubleSide, envMapIntensity: 2.0
    });
    this.shell.add(mesh(floorGeo, glassMat, { name: 'HaloGlassFloor', renderOrder: 5 }));

    /* Guarding: a full-height glass balustrade on the outer edge. */
    const guardPts = [];
    for (let i = 0; i <= 96; i++) {
      const k = i % 96;
      guardPts.push([outer[k][0] * 0.998, y, outer[k][1] * 0.998]);
    }
    const guard = M.glass('haloGuard', { color: 0xc4dbe6, opacity: 0.2, roughness: 0.05 });
    this.shell.add(mesh(glassBalustrade(guardPts, 1.45), guard, { name: 'HaloGuard', renderOrder: 5 }));
    const capMat = M.solid('haloHandrail', { color: 0x3c4249, roughness: 0.35, metalness: 0.85, exterior: true });
    this.detail.add(mesh(balustrade(guardPts.map(p => [p[0], p[1] + 1.42, p[2]]), 0.06, 4, 0.03, 0.055),
      capMat, { name: 'HaloHandrail' }));

    this.haloLevel = y;
    this.haloInner = inner;
    this.haloOuter = outer;
  }

  /**
   * Structure: a perimeter truss following the disc's circular rim in
   * elevation, raker columns propping the disc off the tower shaft, and the
   * seismic dampers at the ring-to-tower joint that D.3 puts on show.
   */
  buildStructure() {
    const M = this.materials;
    const steelMat = M.surface('ringSteel', 'paintedSteel', {
      repeat: 3, roughness: 0.44, metalness: 0.68, exterior: true, color: 0xd2d7dd,
      opts: { hex: 0xbfc5cc }
    });

    /* Perimeter truss: two circular chords in the YZ plane at x = ±thick,
       tied by radial webs — the rim of the coin. */
    const rim = [];
    const bays = RING.trussBays;
    const R = RING.discRadius + 0.7;
    const cy = RING.discCentreY;
    const P = (i, x, r) => {
      const a = (i / bays) * TAU;
      return [x, cy + Math.sin(a) * r, Math.cos(a) * r];
    };
    for (let i = 0; i < bays; i++) {
      for (const x of [-RING.discThickHalf * 0.9, RING.discThickHalf * 0.9]) {
        rim.push(member(P(i, x, R), P(i + 1, x, R), 0.55, 0.55));
        rim.push(member(P(i, x, R), P(i, x, R - 4.2), 0.34, 0.34));
        rim.push(member(P(i, x, R - 4.2), P(i + 1, x, R), 0.3, 0.3));
      }
      // Cross ties between the two faces.
      rim.push(member(P(i, -RING.discThickHalf * 0.9, R), P(i, RING.discThickHalf * 0.9, R), 0.32, 0.32));
    }
    this.shell.add(mesh(mergeGeometries(rim.filter(Boolean)), steelMat, {
      name: 'RingPerimeterTruss', cast: true
    }));

    /* Raker columns: inclined props from the tower shaft out to the rim,
       fanning above and below the disc's centreline. */
    const rakers = [];
    for (let i = 0; i < RING.rakerCount; i++) {
      const a = (i / RING.rakerCount) * TAU;
      const up = Math.sin(a) > 0 ? 1 : -1;
      const rimPt = [0, cy + Math.sin(a) * (R - 2), Math.cos(a) * (R - 2)];
      const shaftY = cy + up * 46;
      const shaftPt = [0, shaftY, Math.sign(Math.cos(a)) * SAIL.topHalfZ * 0.9];
      const m = member(shaftPt, rimPt, 0.8, 0.8);
      if (m) rakers.push(m);
    }
    this.shell.add(mesh(mergeGeometries(rakers.filter(Boolean)), steelMat, {
      name: 'RingRakerColumns', cast: true
    }));

    /* The seismic dampers at the ring/tower joint — a visible, countable
       assembly, because D.3 turns this into an engineering-education moment. */
    const damperMat = M.solid('ringDamper', { color: 0x39404a, roughness: 0.4, metalness: 0.85, exterior: true });
    const accentMat = M.solid('ringDamperAccent', { color: 0xd8842f, roughness: 0.5, metalness: 0.3, exterior: true });
    const damperGeo = mergeGeometries([
      cyl(0.55, 0.55, 3.4, 12, [0, 0, 0], [0, 0, Math.PI / 2]),
      cyl(0.78, 0.78, 0.9, 12, [-1.1, 0, 0], [0, 0, Math.PI / 2]),
      cyl(0.78, 0.78, 0.9, 12, [1.1, 0, 0], [0, 0, Math.PI / 2])
    ]);
    const collarGeo = cyl(0.34, 0.34, 1.2, 10, [0, 0, 0], [0, 0, Math.PI / 2]);
    const dxs = [], cxs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const yy = RING.base + 4.0;
      const p = this.discPlan(yy);
      const px = Math.cos(a) * (p.xHalf + 1.6);
      const pz = Math.sin(a) * (p.zHalf + 1.6);
      dxs.push({ pos: [px, yy, pz], rot: [0, -a, 0] });
      cxs.push({ pos: [px, yy, pz], rot: [0, -a, 0] });
    }
    this.shell.add(instance(damperGeo, damperMat, dxs, { name: 'SeismicDampers', castShadow: true }));
    this.detail.add(instance(collarGeo, accentMat, cxs, { name: 'SeismicDamperCollars' }));
    this.damperTransforms = dxs;
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(RingDeck.prototype, {

  facade() {
    this.buildDiscDiagrid();
    this.buildDiscGlazing();
    this.buildRimGlazing();
  },

  /**
   * The circular diagrid on the two disc faces. This is the move that makes
   * the form legible: a coin read end-on is ambiguous, but a coin with a
   * radial-and-concentric structural grid on its face is unmistakably a disc.
   */
  buildDiscDiagrid() {
    const M = this.materials;
    const mat = M.surface('ringDiagrid', 'brushedMetal', {
      repeat: 2, roughness: 0.28, metalness: 0.88, exterior: true,
      color: 0xe8edf2, envMapIntensity: 1.5
    });

    const cy = RING.discCentreY;
    const R = RING.discRadius;
    const rings = 7;
    const spokes = 28;
    const parts = [];

    for (const face of [-1, 1]) {
      const x = face * (RING.discThickHalf + 0.35);
      const P = (ri, si) => {
        const r = (ri / rings) * R;
        const a = (si / spokes) * TAU;
        // A slight twist per ring turns the grid into a true diagrid.
        const tw = (ri / rings) * (TAU / spokes) * 0.5;
        return [x, cy + Math.sin(a + tw) * r, Math.cos(a + tw) * r];
      };
      for (let ri = 1; ri <= rings; ri++) {
        const w = lerp(0.7, 0.34, ri / rings);
        for (let si = 0; si < spokes; si++) {
          // Concentric ring member.
          parts.push(member(P(ri, si), P(ri, si + 1), w * 0.8, w * 0.8));
          // Diagonals both ways, from this ring in to the previous.
          parts.push(member(P(ri, si), P(ri - 1, si + 1), w, w));
          parts.push(member(P(ri, si), P(ri - 1, si - 1), w, w));
        }
      }
      // Hub plate where the grid meets the tower shaft.
      parts.push(cyl(RING.discInner * 0.9, RING.discInner * 0.9, 0.7, 24,
        [x, cy, 0], [0, 0, Math.PI / 2]));
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), mat, {
      name: 'RingDiscDiagrid', cast: true, receive: true
    }));
  },

  /** Glazing behind the face diagrid, with an emissive window grid. */
  buildDiscGlazing() {
    const M = this.materials;
    const mat = M.litFacade('ringDiscGlazing', {
      cols: 20, rows: 20, lit: 0.5, seed: 44, color: 0x8aa2b8,
      roughness: 0.07, metalness: 0.4, opacity: 0.5, maxEmissive: 2.2
    });
    const cy = RING.discCentreY;
    const parts = [];
    for (const face of [-1, 1]) {
      const g = new THREE.CircleGeometry(RING.discRadius - 0.6, 64);
      // CircleGeometry is in XY; rotate its plane to face ±X.
      g.rotateY(face * Math.PI / 2);
      parts.push(xform(g, { pos: [face * (RING.discThickHalf - 0.15), cy, 0] }));
    }
    this.shell.add(mesh(mergeGeometries(parts), mat, {
      name: 'RingDiscGlazing', renderOrder: 3
    }));
  },

  /** Continuous glazing wrapping the disc's rim, between the truss chords. */
  buildRimGlazing() {
    const M = this.materials;
    const mat = M.glass('ringRimGlass', {
      color: 0xb8d2e0, opacity: 0.26, roughness: 0.06, metalness: 0.16,
      side: THREE.DoubleSide, envMapIntensity: 2.2
    });
    const heights = [];
    const n = 30;
    for (let i = 0; i <= n; i++) heights.push(lerp(RING.base + 4, RING.top - 4, i / n));
    const skin = loft((t, y) => {
      const p = this.discPlan(y);
      return roundedRectRing(p.xHalf + 0.25, p.zHalf + 0.25, Math.min(p.xHalf, p.zHalf) * 0.95, 44);
    }, heights, { capTop: false, uvScale: [0.02, 0.02] });
    this.shell.add(mesh(skin, mat, { name: 'RingRimGlazing', renderOrder: 3 }));

    /* Mullions on the rim, at every bay. */
    const mullMat = M.surface('ringRimMullion', 'brushedMetal', {
      repeat: 2, roughness: 0.3, metalness: 0.84, exterior: true, color: 0xd0d6dd
    });
    const parts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      for (let k = 0; k < n; k++) {
        const y0 = heights[k], y1 = heights[k + 1];
        const p0 = this.discPlan(y0), p1 = this.discPlan(y1);
        parts.push(member(
          [Math.cos(a) * (p0.xHalf + 0.5), y0, Math.sin(a) * (p0.zHalf + 0.5)],
          [Math.cos(a) * (p1.xHalf + 0.5), y1, Math.sin(a) * (p1.zHalf + 0.5)],
          0.24, 0.24));
      }
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), mullMat, {
      name: 'RingRimMullions', cast: true
    }));
  }
});
