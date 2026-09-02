/**
 * ZONE 4 — THE SPIRE CROWN (L56 … L88, then the spire)
 *
 * Concept borrowed from the verticality and rhythm of the tallest cathedral
 * spires — the repetition and the taper, not the ornament. A tapering
 * parametric lattice carries illuminated structural ribs, houses the tuned
 * mass damper and terminates in a broadcast mast and beacon at 700 m.
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { SPIRE, RING, LEVELS } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, roundedRectRing, circleRing, loft, mesh,
  instance, member, tube, balustrade
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, smoothstep } from '../core/MathUtil.js';

export class SpireCrown extends Zone {
  constructor(ctx) {
    super('spire', 'The Spire Crown', ctx);
    this.appearsAtMilestone = 7;
  }

  get radius() { return 90; }

  /** Occupied crown plan half-width at t (0 at L56, 1 at L88). */
  crownHalf(t) { return lerp(SPIRE.baseHalf, SPIRE.topHalf, Math.pow(t, 0.86)); }

  /**
   * Lattice radius at normalised spire height t (0 at L88, 1 at the tip).
   * A power curve keeps the taper reading as a spire rather than a cone.
   */
  latticeRadius(t) {
    return lerp(SPIRE.latticeBase, SPIRE.latticeTip, Math.pow(t, 0.62));
  }

  massing() {
    const M = this.materials;

    /* --- Occupied crown: tapering rounded-rectangle shaft --- */
    const crownMat = M.surface('crownSkin', 'brushedMetal', {
      repeat: 8, roughness: 0.34, metalness: 0.74, exterior: true, color: 0xaeb6c0
    });
    const heights = [];
    const n = 18;
    for (let i = 0; i <= n; i++) heights.push(lerp(SPIRE.base, SPIRE.crownTop, i / n));
    const crown = loft((t) => {
      const h = this.crownHalf(t);
      return roundedRectRing(h, h * 0.86, h * 0.42, 32);
    }, heights, { capTop: false, uvScale: 0.035 });
    this.shell.add(mesh(crown, crownMat, { name: 'CrownShaft', cast: true, receive: true }));

    /* --- Crown floor plates --- */
    const slabMat = M.solid('crownSlab', { color: 0x8f959d, roughness: 0.76, exterior: true });
    const slabs = [];
    for (const lvl of SPIRE.floors) {
      const t = (lvl - 56) / 32;
      const y = lerp(SPIRE.base, SPIRE.crownTop, t);
      const h = this.crownHalf(t) - 0.8;
      const ring = roundedRectRing(h, h * 0.86, h * 0.42, 24);
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      slabs.push(xform(g, { pos: [0, y, 0] }));
    }
    this.shell.add(mesh(mergeGeometries(slabs), slabMat, { name: 'CrownFloorPlates', receive: true }));

    /* --- The lattice spire --- */
    this.buildLattice();

    /* --- Broadcast mast + beacon --- */
    this.buildBeacon();
  }

  /**
   * The parametric lattice: N vertical ribs converging on the mast, tied by
   * horizontal rings and cross-braced between them. Each rib carries an
   * emissive strip so the structure lights itself at night (D.4).
   */
  buildLattice() {
    const M = this.materials;
    const ribMat = M.surface('spireRib', 'brushedMetal', {
      repeat: 2, roughness: 0.3, metalness: 0.82, exterior: true, color: 0xc8ced6
    });
    const glowMat = M.solid('spireRibGlow', {
      color: 0x1a2230, roughness: 0.4, metalness: 0.2,
      emissive: 0x7fb4ff, emissiveIntensity: 0.0, exterior: true
    });
    // Registered so the time-of-day system lights the ribs after dusk.
    M.registerNightEmissive(glowMat, 3.2);
    this.ribGlowMaterial = glowMat;

    const yBase = SPIRE.crownTop;
    const yTip = SPIRE.tip;
    const rings = SPIRE.latticeRings;
    const ribs = SPIRE.latticeRibs;

    const structural = [];
    const glow = [];

    const P = (ribIndex, t) => {
      const r = this.latticeRadius(t);
      // A gentle helical twist keeps the lattice from reading as a plain cone.
      const a = (ribIndex / ribs) * TAU + t * 0.34;
      return [Math.cos(a) * r, lerp(yBase, yTip, t), Math.sin(a) * r];
    };

    for (let i = 0; i < ribs; i++) {
      for (let k = 0; k < rings; k++) {
        const t0 = k / rings, t1 = (k + 1) / rings;
        const w = lerp(1.15, 0.2, t0);
        const a = P(i, t0), b = P(i, t1);
        const m = member(a, b, w, w);
        if (m) structural.push(m);
        // Integrated LED strip running the rib's full length.
        const g = member(
          [a[0] * 1.0, a[1], a[2] * 1.0],
          [b[0] * 1.0, b[1], b[2] * 1.0],
          w * 0.34, w * 0.34
        );
        if (g) glow.push(g);

        // Horizontal ring beam.
        const c = P((i + 1) % ribs, t0);
        const ringBeam = member(a, c, w * 0.5, w * 0.5);
        if (ringBeam) structural.push(ringBeam);

        // Cross bracing (alternating direction by course).
        const d = P((i + 1) % ribs, t1);
        const brace = member(k % 2 === 0 ? a : b, k % 2 === 0 ? d : c, w * 0.34, w * 0.34);
        if (brace) structural.push(brace);
      }
    }
    this.shell.add(mesh(mergeGeometries(structural.filter(Boolean)), ribMat, {
      name: 'SpireLattice', cast: true
    }));
    this.detail.add(mesh(mergeGeometries(glow.filter(Boolean)), glowMat, { name: 'SpireLatticeGlow' }));

    /* Central mast core the ribs converge on. */
    const mastMat = M.solid('spireMast', { color: 0x9aa2ac, roughness: 0.34, metalness: 0.8, exterior: true });
    this.shell.add(mesh(
      loft((t) => circleRing(lerp(3.4, 0.6, Math.pow(t, 0.7)), 12), [yBase, yTip - 12], { capTop: true }),
      mastMat, { name: 'SpireMastCore', cast: true }
    ));
  }

  /** Broadcast mast and the beacon light apparatus at the very top. */
  buildBeacon() {
    const M = this.materials;
    const mat = M.surface('beaconStruct', 'brushedMetal', {
      repeat: 1, roughness: 0.34, metalness: 0.78, exterior: true, color: 0xb4bcc6
    });
    const parts = [];
    const top = SPIRE.tip;

    // Beacon room shell.
    parts.push(cyl(3.2, 4.0, 7.0, 14, [0, SPIRE.beaconY + 3.5, 0]));
    // Antenna array above it.
    parts.push(cyl(0.35, 0.6, top - SPIRE.beaconY - 7, 10, [0, (SPIRE.beaconY + 7 + top) / 2, 0]));
    for (let i = 0; i < 5; i++) {
      const y = SPIRE.beaconY + 12 + i * 14;
      if (y > top - 6) break;
      parts.push(cyl(1.5, 1.5, 0.28, 12, [0, y, 0]));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        parts.push(cyl(0.12, 0.12, 2.6, 6, [Math.cos(a) * 1.4, y + 1.3, Math.sin(a) * 1.4]));
      }
    }
    this.shell.add(mesh(mergeGeometries(parts), mat, { name: 'BroadcastMast', cast: true }));

    /* The aircraft-warning beacon itself: a pulsing emissive lamp. */
    const lampMat = M.solid('beaconLamp', {
      color: 0x2a0b08, roughness: 0.3, metalness: 0.2,
      emissive: 0xff3a22, emissiveIntensity: 2.0
    });
    this.beaconLampMaterial = lampMat;
    const lamp = mesh(new THREE.SphereGeometry(1.5, 14, 10), lampMat, {
      name: 'BeaconLamp', pos: [0, top - 3.0, 0]
    });
    this.shell.add(lamp);
    this.beaconLamp = lamp;

    const light = new THREE.PointLight(0xff4a2a, 0, 420, 2);
    light.position.set(0, top - 3.0, 0);
    this.shell.add(light);
    this.beaconLight = light;

    // A slow double-pulse, as aviation obstruction beacons actually behave.
    this.addAnimator((dt, t) => {
      const cycle = t % 3.0;
      const pulse =
        Math.exp(-Math.pow((cycle - 0.25) / 0.16, 2)) +
        Math.exp(-Math.pow((cycle - 0.75) / 0.16, 2));
      lampMat.emissiveIntensity = 1.0 + pulse * 7.5;
      light.intensity = pulse * 900;
      lamp.scale.setScalar(1 + pulse * 0.14);
    });
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(SpireCrown.prototype, {

  facade() {
    this.buildCrownGlazing();
    this.buildLatticeGlazing();
  },

  /** The occupied crown's curtain wall, with a night-emissive window grid. */
  buildCrownGlazing() {
    const M = this.materials;
    const mat = M.litFacade('crownGlazing', {
      cols: 14, rows: 22, lit: 0.46, seed: 88, color: 0x8fa6bb,
      roughness: 0.08, metalness: 0.44, opacity: 0.56, maxEmissive: 2.4
    });
    const heights = [];
    for (let i = 0; i <= 20; i++) heights.push(lerp(SPIRE.base, SPIRE.crownTop, i / 20));
    const skin = loft((t) => {
      const h = this.crownHalf(t) + 0.2;
      return roundedRectRing(h, h * 0.86, h * 0.42, 32);
    }, heights, { capTop: false, uvScale: [0.022, 0.0105] });
    this.shell.add(mesh(skin, mat, { name: 'CrownGlazing', renderOrder: 3 }));

    /* Vertical fins running the crown's full height — the "rhythm and
       verticality" the brief borrows from cathedral spires. */
    const finMat = M.surface('crownFin', 'brushedMetal', {
      repeat: 3, roughness: 0.26, metalness: 0.84, exterior: true, color: 0xdde3ea
    });
    const parts = [];
    const finCount = 28;
    for (let i = 0; i < finCount; i++) {
      const a = (i / finCount) * TAU;
      for (let k = 0; k < 20; k++) {
        const t0 = k / 20, t1 = (k + 1) / 20;
        const h0 = this.crownHalf(t0) + 0.6, h1 = this.crownHalf(t1) + 0.6;
        parts.push(member(
          [Math.cos(a) * h0, heights[k], Math.sin(a) * h0 * 0.86],
          [Math.cos(a) * h1, heights[k + 1], Math.sin(a) * h1 * 0.86],
          0.34, 0.72));
      }
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), finMat, {
      name: 'CrownFins', cast: true
    }));
  },

  /**
   * Glass panels between the lattice ribs, so the spire reads as an
   * enclosed, climbable volume rather than an open frame — and so the
   * Lattice Stair of D.4 has something to be inside.
   */
  buildLatticeGlazing() {
    const M = this.materials;
    const mat = M.glass('spireLatticeGlass', {
      color: 0xa8c6d8, opacity: 0.17, roughness: 0.07, metalness: 0.1,
      side: THREE.DoubleSide, envMapIntensity: 2.0
    });
    const yBase = SPIRE.crownTop, yTip = SPIRE.tip;
    const ribs = SPIRE.latticeRibs;
    // Only glaze the lower two-thirds; above that the lattice is open mast.
    const n = 16;
    const heights = [];
    for (let i = 0; i <= n; i++) heights.push(lerp(yBase, lerp(yBase, yTip, 0.62), i / n));
    const skin = loft((t, y) => {
      const tt = (y - yBase) / (yTip - yBase);
      const r = this.latticeRadius(tt) * 0.965;
      const pts = [];
      for (let i = 0; i < ribs * 2; i++) {
        const a = (i / (ribs * 2)) * TAU + tt * 0.34;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return pts;
    }, heights, { capTop: false, uvScale: [0.05, 0.02] });
    this.shell.add(mesh(skin, mat, { name: 'SpireLatticeGlazing', renderOrder: 3 }));
  }
});
