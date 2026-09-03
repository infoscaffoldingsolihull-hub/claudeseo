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
import { TAU, lerp, clamp, smoothstep, rng } from '../core/MathUtil.js';
import {
  roomShell, remapUV, seatPod, lowTable, chair, bench, workstation, stool,
  curvedBar, planter, plaque, elevatorDoors, swingDoor, tunedMassDamper,
  roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { tree } from '../world/BuildKit.js';

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

/* ==================================================================== */
/* Phase 4 — interiors (Section D.3)                                    */
/*                                                                      */
/* Halo Walkway Interior · Ring-Level Sky Gardens · Observation Lounge · */
/* Typical Ring Floor Interior · Seismic Joint Viewing Gallery          */
/* ==================================================================== */

Object.assign(RingDeck.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;

    this.palette = {
      terrazzo: M.surface('ringTerrazzo', 'terrazzo', { repeat: 14, roughness: 0.26 }),
      glassFloor: M.glass('ringGlassFloor', {
        color: 0xb6d6e4, opacity: 0.3, roughness: 0.04, side: THREE.DoubleSide, exterior: false
      }),
      glass: M.glass('ringGlassInt', { color: 0xd2e8f0, opacity: 0.18, roughness: 0.05, exterior: false }),
      metal: M.surface('ringIntMetal', 'brushedMetal', { repeat: 4, roughness: 0.26, metalness: 0.8 }),
      marble: M.surface('ringIntMarble', 'marble', { repeat: 8, roughness: 0.12 }),
      timber: M.surface('ringIntTimber', 'paintedTimber', { repeat: 2, roughness: 0.6, color: 0xd8c6a8 }),
      leather: M.solid('ringLeather', { color: 0x8f5a3c, roughness: 0.55 }),
      foliage: M.surface('ringFoliage', 'foliage', { repeat: 3, roughness: 0.9 }),
      ceiling: M.solid('ringCeilingMat', { color: 0xdfe2e6, roughness: 0.8 }),
      dark: M.solid('ringDarkMat', { color: 0x2b3038, roughness: 0.5, metalness: 0.5 })
    };
    this.palette.ribGlow = M.solid('ringRibGlow', {
      color: 0x1c2430, roughness: 0.4, emissive: 0x9fd4ff, emissiveIntensity: 2.6
    });
    this.palette.warmGlow = M.solid('ringWarmGlow', {
      color: 0x30281c, roughness: 0.4, emissive: 0xffcf95, emissiveIntensity: 2.4
    });
    M.registerInteriorPalette(this.palette);

    this.roomHaloWalkway(A);
    this.roomSkyGardens(A);
    this.roomObservationLounge(A);
    this.roomTypicalRingFloor(A);
    this.roomDamperGallery(A);
  },

  /* ---------------- Halo Walkway Interior ---------------- */

  /** "A full circular glass-floored corridor; underfoot, illuminated steel
      ribs are visible through the glass in a radial terrazzo setting." */
  roomHaloWalkway(A) {
    const P = this.palette;
    const y = RING.haloLevel;
    const room = this.room({
      name: 'Halo Walkway Interior', level: 'L44',
      center: [0, y + 2, 0], size: [180, 8, 180],
      acoustic: A.GLASS_ATRIUM, range: 220
    });

    room.lazy((r) => {
      const inner = this.haloOutline(2.4);
      const outer = this.haloOutline(2.4 + RING.haloWidth);

      /* A radial terrazzo band on the inner half, structural glass on the
         outer half — the "glass panels in a radial terrazzo setting". */
      const build = (a, b, uvY0, uvY1) => {
        const pos = [], uvs = [], idx = [];
        for (let i = 0; i <= 96; i++) {
          const k = i % 96;
          pos.push(a[k][0], y + 0.05, a[k][1]);
          pos.push(b[k][0], y + 0.05, b[k][1]);
          uvs.push(i / 5, uvY0, i / 5, uvY1);
        }
        for (let i = 0; i < 96; i++) {
          const p = i * 2;
          idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      };
      const mid = this.haloOutline(2.4 + RING.haloWidth * 0.45);
      r.group.add(mesh(build(inner, mid, 0, 0.45), P.terrazzo, {
        name: 'RadialTerrazzo', receive: true
      }));
      r.group.add(mesh(build(mid, outer, 0.45, 1), P.glassFloor, {
        name: 'StructuralGlassPanels', renderOrder: 5
      }));

      /* Prop 1 — illuminated steel ribs read through the glass underfoot. */
      const ribs = [];
      for (let i = 0; i < 96; i += 2) {
        const a = this.haloOutline(2.2)[i], b = this.haloOutline(2.4 + RING.haloWidth + 0.2)[i];
        const m = member([a[0], y - 0.32, a[1]], [b[0], y - 0.32, b[1]], 0.14, 0.16);
        if (m) ribs.push(m);
      }
      const ribMesh = mesh(mergeGeometries(ribs.filter(Boolean)), P.ribGlow, { name: 'UnderfloorRibs' });
      r.group.add(ribMesh);
      const lights = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const p = this.haloOutline(2.4 + RING.haloWidth / 2)[Math.round((i / 6) * 96) % 96];
        lights.push(roomLight(r, 0x9fd4ff, 22, 30, [p[0], y - 0.1, p[1]]));
      }
      r.addProp({
        name: 'Under-floor rib lighting',
        update() {
          // A slow travelling pulse around the ring.
          const t = performance.now() * 0.0006;
          P.ribGlow.emissiveIntensity = 2.2 + Math.sin(t) * 0.7;
          for (let i = 0; i < lights.length; i++) {
            lights[i].intensity = 18 + Math.sin(t * 2 + i * 1.05) * 8;
          }
        }
      });

      /* The corridor's inner wall and ceiling. */
      const wallPos = [], wallUv = [], wallIdx = [];
      for (let i = 0; i <= 96; i++) {
        const k = i % 96;
        wallPos.push(inner[k][0], y + 0.05, inner[k][1]);
        wallPos.push(inner[k][0], y + 3.4, inner[k][1]);
        wallUv.push(i / 4, 0, i / 4, 1);
      }
      for (let i = 0; i < 96; i++) {
        const p = i * 2;
        wallIdx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
      const wall = new THREE.BufferGeometry();
      wall.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
      wall.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
      wall.setIndex(wallIdx);
      wall.computeVertexNormals();
      r.group.add(mesh(wall, P.metal, { name: 'WalkwayInnerWall', receive: true }));

      /* Prop 2 — an interpretive rail of plaques around the walkway. */
      const plaques = [];
      for (let i = 0; i < 12; i++) {
        const p = inner[Math.round((i / 12) * 96) % 96];
        plaques.push({ pos: [p[0] * 1.01, y, p[1] * 1.01], rot: [0, -Math.atan2(p[1], p[0]), 0] });
      }
      const plaqueMesh = instance(plaque(0.8, 0.5, 0.95), P.metal, plaques, { name: 'WalkwayPlaques' });
      r.group.add(plaqueMesh);
      r.addProp({
        name: 'Walkway plaques',
        update() {
          P.warmGlow.emissiveIntensity = 2.2 + Math.sin(performance.now() * 0.0005) * 0.3;
        }
      });

      /* Prop 3 — bench seating at the four cardinal viewing bays. */
      const benches = [];
      for (let i = 0; i < 4; i++) {
        const idx = Math.round((i / 4) * 96) % 96;
        const p = mid[idx];
        benches.push({ pos: [p[0], y + 0.05, p[1]], rot: [0, -Math.atan2(p[1], p[0]), 0] });
      }
      r.group.add(instance(bench(2.4, 0.45), P.timber, benches, { name: 'WalkwayBenches', castShadow: true }));
      const bayLights = benches.map(b => roomLight(r, 0xffd9b0, 16, 18, [b.pos[0], y + 2.6, b.pos[2]]));
      r.addProp({
        name: 'Viewing-bay lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00045) * 0.1;
          for (const l of bayLights) l.intensity = 16 * k;
        }
      });
    });
  },

  /* ---------------- Ring-Level Sky Gardens ---------------- */

  roomSkyGardens(A) {
    const P = this.palette;
    const room = this.room({
      name: 'Ring-Level Sky Gardens', level: 'L36–L46',
      center: [0, RING.discCentreY - 14, 0], size: [96, 34, 96],
      acoustic: A.GLASS_ATRIUM, range: 200
    });

    room.lazy((r) => {
      const floors = [], planters = [], leaves = [], trunks = [];
      const skylights = [];
      for (let gi = 0; gi < RING.gardenAngles.length; gi++) {
        const a = RING.gardenAngles[gi];
        const y = RING.discCentreY - 26 + gi * 9;
        const plan = this.discPlan(y);
        const rad = Math.min(plan.zHalf, 40) * 0.62;
        const cxp = Math.cos(a) * rad * 0.5, czp = Math.sin(a) * plan.zHalf * 0.55;

        const g = new THREE.CircleGeometry(9, 28);
        g.rotateX(-Math.PI / 2);
        remapUV(g, 'xz', 0.1);
        floors.push(xform(g, { pos: [cxp, y + 0.06, czp] }));

        /* Skylight well above each garden. */
        const well = new THREE.CylinderGeometry(6.4, 8.2, 9, 24, 1, true);
        skylights.push(xform(well, { pos: [cxp, y + 9, czp] }));

        /* Full-height planting under the skylight. */
        for (let i = 0; i < 10; i++) {
          const aa = (i / 10) * TAU;
          const rr2 = 3.4 + (i % 3) * 1.6;
          const e = { pos: [cxp + Math.cos(aa) * rr2, y, czp + Math.sin(aa) * rr2], rot: [0, aa, 0] };
          planters.push(e);
          leaves.push(e);
        }
        for (let i = 0; i < 4; i++) {
          const aa = (i / 4) * TAU + 0.6;
          trunks.push({ pos: [cxp + Math.cos(aa) * 6.2, y, czp + Math.sin(aa) * 6.2], scale: 0.7 });
        }
        roomLight(r, 0xe6f0ff, 40, 26, [cxp, y + 7, czp]);
      }
      r.group.add(mesh(mergeGeometries(floors), P.terrazzo, { name: 'SkyGardenFloors', receive: true }));
      r.group.add(mesh(mergeGeometries(skylights), P.glass, { name: 'SkylightWells', renderOrder: 4 }));
      const pl = planter(2.0, 0.8, 0.6);
      r.group.add(instance(pl.tub, P.metal, planters, { name: 'GardenTroughs' }));
      const foliageMesh = instance(pl.foliage, P.foliage, leaves, { name: 'GardenPlanting', castShadow: true });
      r.group.add(foliageMesh);
      r.group.add(instance(tree(3131, 1.1), P.foliage, trunks, { name: 'GardenTrees', castShadow: true }));

      /* Prop 1 — the planting stirs in the conditioned air. */
      r.addProp({
        name: 'Sky-garden planting',
        update() { foliageMesh.rotation.y = Math.sin(performance.now() * 0.0004) * 0.006; }
      });

      /* Prop 2 — trickling water channels through each garden. */
      const chanMat = this.materials.glass('ringChannelWater', {
        color: 0x2f6070, opacity: 0.8, roughness: 0.05, metalness: 0.2, exterior: false
      });
      const chans = [];
      for (let gi = 0; gi < RING.gardenAngles.length; gi++) {
        const a = RING.gardenAngles[gi];
        const y = RING.discCentreY - 26 + gi * 9;
        const plan = this.discPlan(y);
        const rad = Math.min(plan.zHalf, 40) * 0.62;
        const cxp = Math.cos(a) * rad * 0.5, czp = Math.sin(a) * plan.zHalf * 0.55;
        const g = new THREE.PlaneGeometry(1.1, 15);
        g.rotateX(-Math.PI / 2);
        chans.push(xform(g, { pos: [cxp, y + 0.1, czp], rot: [0, a, 0] }));
      }
      const chanMesh = mesh(mergeGeometries(chans), chanMat, { name: 'GardenWaterChannels', renderOrder: 3 });
      r.group.add(chanMesh);
      r.addProp({
        name: 'Water channels',
        update() {
          const k = 0.72 + Math.sin(performance.now() * 0.0013) * 0.08;
          chanMat.opacity = k;
        }
      });

      /* Prop 3 — bench seating whose lighting warms and cools. */
      const benches = [];
      for (let gi = 0; gi < RING.gardenAngles.length; gi++) {
        const a = RING.gardenAngles[gi];
        const y = RING.discCentreY - 26 + gi * 9;
        const plan = this.discPlan(y);
        const rad = Math.min(plan.zHalf, 40) * 0.62;
        const cxp = Math.cos(a) * rad * 0.5, czp = Math.sin(a) * plan.zHalf * 0.55;
        for (let i = 0; i < 3; i++) {
          const aa = (i / 3) * TAU;
          benches.push({ pos: [cxp + Math.cos(aa) * 7.4, y + 0.06, czp + Math.sin(aa) * 7.4], rot: [0, -aa, 0] });
        }
      }
      r.group.add(instance(bench(2.0, 0.44), P.timber, benches, { name: 'GardenBenches', castShadow: true }));
      const gl = r.lights.slice();
      r.addProp({
        name: 'Sky-garden daylight wash',
        update() {
          const k = 0.85 + Math.sin(performance.now() * 0.00028) * 0.15;
          for (const l of gl) l.intensity = 40 * k;
        }
      });
    });
  },

  /* ---------------- Observation Lounge ---------------- */

  roomObservationLounge(A) {
    const P = this.palette;
    const y = RING.discCentreY + 34;
    const plan = this.discPlan(y);
    const room = this.room({
      name: 'Observation Lounge', level: 'L52',
      center: [0, y + 2.5, 0], size: [plan.xHalf * 2 + 4, 8, plan.zHalf * 2 + 4],
      acoustic: A.PADDED_LOUNGE, range: 180
    });

    room.lazy((r) => {
      const ring = roundedRectRing(plan.xHalf - 1, plan.zHalf - 1, Math.min(plan.xHalf, plan.zHalf) * 0.9, 40);
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();

      const floor = new THREE.ShapeGeometry(shape, 4);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.07);
      r.group.add(mesh(xform(floor, { pos: [0, y + 0.06, 0] }), P.terrazzo, {
        name: 'LoungeFloor', receive: true
      }));
      const ceil = new THREE.ShapeGeometry(shape, 4);
      ceil.rotateX(Math.PI / 2);
      remapUV(ceil, 'xz', 0.1);
      r.group.add(mesh(xform(ceil, { pos: [0, y + 4.4, 0] }), P.ceiling, { name: 'LoungeCeiling' }));

      /* Radial rib ceiling pattern (D.3). */
      const cribs = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * TAU;
        const m = member([0, y + 4.28, 0],
          [Math.cos(a) * (plan.xHalf - 1), y + 4.28, Math.sin(a) * (plan.zHalf - 1)], 0.12, 0.16);
        if (m) cribs.push(m);
      }
      r.group.add(mesh(mergeGeometries(cribs.filter(Boolean)), P.metal, { name: 'RadialRibCeiling' }));

      /* Prop 1 — the curved bar, back-lit. */
      r.group.add(mesh(curvedBar(9.5, Math.PI * 0.85, 1.12, 0.95, 30), P.marble, {
        name: 'CurvedBar', pos: [0, y + 0.06, 0], cast: true
      }));
      const backBar = [];
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI * 0.42 + (i / 26) * Math.PI * 0.85;
        backBar.push(box(0.9, 2.4, 0.3, [Math.cos(a) * 11.6, y + 1.3, Math.sin(a) * 11.6], [0, -a, 0]));
      }
      const backBarMesh = mesh(mergeGeometries(backBar), P.warmGlow, { name: 'BackBarGlow' });
      r.group.add(backBarMesh);
      const barLight = roomLight(r, 0xffc98a, 44, 30, [0, y + 2.6, 0]);
      r.addProp({
        name: 'Bar back-lighting',
        update() {
          const k = 1 + Math.sin(performance.now() * 0.0006) * 0.16;
          P.warmGlow.emissiveIntensity = 2.2 * k;
          barLight.intensity = 40 * k;
        }
      });

      /* Prop 2 — stools and lounge seating at the 360° glazing. */
      const stools = [], pods = [], tbls = [];
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI * 0.42 + (i / 16) * Math.PI * 0.85;
        stools.push({ pos: [Math.cos(a) * 8.2, y + 0.06, Math.sin(a) * 8.2], rot: [0, -a, 0] });
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const rx = (plan.xHalf - 4.5), rz = (plan.zHalf - 4.5);
        pods.push({ pos: [Math.cos(a) * rx, y + 0.06, Math.sin(a) * rz], rot: [0, -a + Math.PI, 0] });
        if (i % 2 === 0) tbls.push({ pos: [Math.cos(a) * (rx - 1.9), y + 0.06, Math.sin(a) * (rz - 1.9)] });
      }
      r.group.add(instance(stool(0.78, 0.2), P.metal, stools, { name: 'BarStools', castShadow: true }));
      r.group.add(instance(seatPod(1.05, 1.0, 0.8), P.leather, pods, { name: 'LoungeSeating', castShadow: true }));
      r.group.add(instance(lowTable(0.55, 0.44), P.marble, tbls, { name: 'LoungeTables', castShadow: true }));
      const podLights = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        podLights.push(roomLight(r, 0xffd6ab, 20, 26, [Math.cos(a) * 12, y + 3.6, Math.sin(a) * 14]));
      }
      r.addProp({
        name: 'Lounge accent lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00037) * 0.1;
          for (const l of podLights) l.intensity = 20 * k;
        }
      });

      /* Prop 3 — a slowly turning orrery sculpture over the bar. */
      const orrery = new THREE.Group();
      orrery.name = 'LoungeOrrery';
      const rings = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.TorusGeometry(1.4 + i * 0.7, 0.05, 6, 34);
        rings.push(xform(g, { rot: [i * 0.5, i * 0.9, i * 0.3] }));
      }
      orrery.add(mesh(mergeGeometries(rings), P.metal, { name: 'OrreryRings' }));
      orrery.add(mesh(new THREE.SphereGeometry(0.5, 14, 10), P.warmGlow, { name: 'OrreryCore' }));
      orrery.position.set(0, y + 3.2, 0);
      r.group.add(orrery);
      r.addProp({
        name: 'Orrery sculpture',
        update(dt) { orrery.rotation.y += dt * 0.12; orrery.rotation.x += dt * 0.04; }
      });
    });
  },

  /* ---------------- Typical Ring Floor Interior ---------------- */

  roomTypicalRingFloor(A) {
    const P = this.palette;
    const y = RING.discCentreY - 4;
    const plan = this.discPlan(y);
    const room = this.room({
      name: 'Typical Ring Floor Interior', level: 'L41',
      center: [0, y + 2.2, 0], size: [plan.xHalf * 2 + 4, 6, plan.zHalf * 2 + 4],
      acoustic: A.PADDED_LOUNGE, range: 170
    });

    room.lazy((r) => {
      const outer = roundedRectRing(plan.xHalf - 1.2, plan.zHalf - 1.2, Math.min(plan.xHalf, plan.zHalf) * 0.9, 40);
      const shape = new THREE.Shape();
      shape.moveTo(outer[0][0], outer[0][1]);
      for (let k = 1; k < outer.length; k++) shape.lineTo(outer[k][0], outer[k][1]);
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, RING.discInner, 0, TAU, true);
      shape.holes.push(hole);

      const floor = new THREE.ShapeGeometry(shape, 4);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.06);
      r.group.add(mesh(xform(floor, { pos: [0, y + 0.06, 0] }), P.terrazzo, {
        name: 'RingFloorFinish', receive: true
      }));
      const ceil = new THREE.ShapeGeometry(shape, 4);
      ceil.rotateX(Math.PI / 2);
      remapUV(ceil, 'xz', 0.1);
      r.group.add(mesh(xform(ceil, { pos: [0, y + 3.6, 0] }), P.ceiling, { name: 'RingFloorCeiling' }));

      /* The central service core the floor wraps. */
      r.group.add(mesh(
        loft(() => circleRing(RING.discInner, 32), [y, y + 3.6], { capTop: false }),
        P.metal, { name: 'ServiceCoreWall', receive: true }
      ));

      /* Workstations arranged radially around the core. */
      const desks = [], chairs = [];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        const rx = plan.xHalf * 0.62, rz = plan.zHalf * 0.62;
        desks.push({ pos: [Math.cos(a) * rx, y + 0.06, Math.sin(a) * rz], rot: [0, -a, 0] });
        chairs.push({ pos: [Math.cos(a) * (rx - 1.2), y + 0.06, Math.sin(a) * (rz - 1.2)], rot: [0, -a + Math.PI, 0] });
      }
      r.group.add(instance(workstation(), P.metal, desks, { name: 'RingWorkstations', castShadow: true }));
      r.group.add(instance(chair(0.5, 0.9), P.leather, chairs, { name: 'RingChairs', castShadow: true }));

      /* Prop 1 — core lift doors. */
      const lifts = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.3;
        const d = elevatorDoors(2.0, 2.6, { period: 11 + i * 1.9 });
        const gL = d.geometry.clone(); gL.scale(-1, 1, 1);
        d.left.geometry = gL; d.left.material = P.metal;
        d.right.geometry = d.geometry; d.right.material = P.metal;
        d.group.position.set(Math.cos(a) * (RING.discInner + 0.15), y + 0.06, Math.sin(a) * (RING.discInner + 0.15));
        d.group.rotation.y = -a;
        r.group.add(d.group);
        lifts.push(d);
      }
      r.addProp({ name: 'Core lifts', update: (dt) => { for (const l of lifts) l.update(dt); } });

      /* Prop 2 — a perimeter cove that follows the curve. */
      const cove = [];
      for (let i = 0; i < outer.length; i += 2) {
        const a = outer[i], b = outer[(i + 2) % outer.length];
        const m = member([a[0] * 0.96, y + 3.4, a[1] * 0.96], [b[0] * 0.96, y + 3.4, b[1] * 0.96], 0.09, 0.09);
        if (m) cove.push(m);
      }
      r.group.add(mesh(mergeGeometries(cove.filter(Boolean)), P.ribGlow, { name: 'PerimeterCove' }));
      const cl = [roomLight(r, 0xdce8f4, 34, 44, [0, y + 3.0, 22]),
        roomLight(r, 0xdce8f4, 34, 44, [0, y + 3.0, -22])];
      r.addProp({
        name: 'Perimeter cove',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00031) * 0.1;
          for (const l of cl) l.intensity = 34 * k;
        }
      });

      /* Prop 3 — a meeting-room door on the core. */
      const door = swingDoor(1.1, 2.3);
      door.pivot.add(mesh(door.geometry, P.timber, { name: 'DoorLeaf' }));
      door.pivot.position.set(RING.discInner + 0.2, y + 0.06, 4);
      door.pivot.rotation.y = -Math.PI / 2;
      r.group.add(door.pivot);
      r.addProp({ name: 'Meeting-room door', update: (dt) => door.update(dt) });
    });
  },

  /* ---------------- Seismic Joint Viewing Gallery ---------------- */

  /** "A glass viewing panel at the ring/tower structural joint reveals the
      seismic damper mechanism, with an informational plaque — a deliberate
      engineering-education moment." */
  roomDamperGallery(A) {
    const P = this.palette;
    const y = RING.base + 2.0;
    const a = RING.damperAngle;
    const plan = this.discPlan(y + 2);
    const cxp = Math.cos(a) * (plan.xHalf * 0.8);
    const czp = Math.sin(a) * (plan.zHalf * 0.8);
    const room = this.room({
      name: 'Seismic Joint Viewing Gallery', level: 'L31',
      center: [cxp, y + 2.4, czp], size: [26, 8, 26],
      acoustic: A.MACHINE_ROOM, range: 150
    });

    room.lazy((r) => {
      const g = new THREE.Group();
      g.position.set(cxp, y, czp);
      g.rotation.y = -a;
      r.group.add(g);

      const shell = roomShell(18, 4.6, 12, { open: ['+x'] });
      g.add(mesh(mergeGeometries(shell.floor), P.terrazzo, { name: 'GalleryFloor', receive: true }));
      g.add(mesh(mergeGeometries(shell.walls), P.dark, { name: 'GalleryWalls', receive: true }));
      g.add(mesh(mergeGeometries(shell.ceiling), P.dark, { name: 'GalleryCeiling' }));

      /* The glass viewing panel onto the joint. */
      g.add(mesh(box(0.12, 3.0, 10.0, [8.9, 1.7, 0]), P.glass, {
        name: 'DamperViewingPanel', renderOrder: 4
      }));
      g.add(mesh(mergeGeometries([
        box(0.34, 3.4, 0.34, [8.9, 1.7, -5.1]),
        box(0.34, 3.4, 0.34, [8.9, 1.7, 5.1]),
        box(0.34, 0.34, 10.4, [8.9, 3.3, 0]),
        box(0.34, 0.34, 10.4, [8.9, 0.15, 0])
      ]), P.metal, { name: 'PanelFrame' }));

      /**
       * Prop 1 — the damper assembly itself, on show behind the glass.
       * D.3's modelling note: a simplified but recognisable assembly (large
       * suspended mass plus visible bracing), a visual and educational
       * element, not a working physics simulation.
       */
      const rig = new THREE.Group();
      rig.name = 'DamperRig';
      rig.position.set(13.5, 3.2, 0);
      g.add(rig);
      const arm = new THREE.Group();
      rig.add(arm);
      arm.add(mesh(mergeGeometries([
        cyl(0.3, 0.3, 5.4, 12, [0, -2.7, 0]),
        cyl(0.55, 0.55, 0.5, 12, [0, -5.4, 0])
      ]), P.metal, { name: 'DamperHanger' }));
      arm.add(mesh(new THREE.SphereGeometry(1.5, 20, 14).translate(0, -6.6, 0), P.metal, {
        name: 'DamperMass', cast: true
      }));
      /* Visible bracing and viscous dampers around the mass. */
      const brace = [];
      for (let i = 0; i < 4; i++) {
        const aa = (i / 4) * TAU;
        brace.push(member([Math.cos(aa) * 3.2, -1.0, Math.sin(aa) * 3.2],
          [Math.cos(aa) * 1.2, -6.0, Math.sin(aa) * 1.2], 0.16, 0.16));
        brace.push(cyl(0.22, 0.22, 2.4, 10, [Math.cos(aa) * 2.4, -6.2, Math.sin(aa) * 2.4], [0, -aa, Math.PI / 2.6]));
      }
      rig.add(mesh(mergeGeometries(brace.filter(Boolean)), P.dark, { name: 'DamperBracing' }));
      r.addProp({
        name: 'Seismic damper',
        update(dt, t) {
          const p = performance.now() * 0.001;
          arm.rotation.z = Math.sin(p * 0.42) * 0.075 + Math.sin(p * 0.17) * 0.03;
          arm.rotation.x = Math.cos(p * 0.33) * 0.06;
        }
      });

      /* Prop 2 — a focused spotlight on the mechanism (D.3's lighting note). */
      const spot = new THREE.SpotLight(0xfff0d8, 300, 40, 0.5, 0.6, 2);
      spot.position.set(9.5, 4.2, 0);
      spot.target.position.set(14, -3.4, 0);
      g.add(spot, spot.target);
      r.lights.push(spot);
      r.addProp({
        name: 'Damper spotlight',
        update() { spot.intensity = 260 + Math.sin(performance.now() * 0.0008) * 55; }
      });

      /* Prop 3 — the informational plaques, warm-lit. */
      const plaques = [];
      for (let i = 0; i < 3; i++) plaques.push({ pos: [2 + i * 3, 0, -4.4], rot: [0, 0.3, 0] });
      g.add(instance(plaque(1.0, 0.62, 1.0), P.metal, plaques, { name: 'GalleryPlaques' }));
      g.add(mesh(box(5.6, 0.9, 0.08, [4, 2.9, -5.9]), P.warmGlow, { name: 'GallerySignBoard' }));
      const gl = roomLight(r, 0xffd5a4, 24, 22, [4, 3.4, -3]);
      g.add(gl);
      r.lights.push(gl);
      r.addProp({
        name: 'Interpretation lighting',
        update() { gl.intensity = 22 + Math.sin(performance.now() * 0.0006) * 5; }
      });
    });
  }
});
