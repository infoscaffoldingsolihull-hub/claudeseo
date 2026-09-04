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
import { TAU, lerp, clamp, smoothstep, rng } from '../core/MathUtil.js';
import {
  roomShell, remapUV, seatPod, plaque, elevatorDoors, glassTreadStair,
  tunedMassDamper, ventFan, roomLight, roomSpot
} from '../interiors/InteriorKit.js';

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
    /* A fast initial taper followed by a long, near-parallel mast. A gentle
       power curve here is what made the first version read as a traffic cone
       rather than a spire: it kept the section fat for most of its height.
       Clamped, because a fractional power of a negative t is NaN and would
       silently poison every merged geometry downstream. */
    const k = Math.pow(clamp(t, 0, 1), 0.34);
    return lerp(SPIRE.latticeBase, SPIRE.latticeTip, k);
  }

  massing() {
    const M = this.materials;

    /* --- Occupied crown: tapering rounded-rectangle shaft --- */
    /* Anodised aluminium rainscreen, not chrome. At metalness 0.74 the
       whole crown mirrored the sky and read as one cobalt mass; real
       architectural panels sit nearer 0.4 and keep their own colour. */
    const crownMat = M.surface('crownSkin', 'brushedMetal', {
      repeat: 8, roughness: 0.46, metalness: 0.38, exterior: true,
      color: 0xc3c0b6, envMapIntensity: 0.85
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
      repeat: 2, roughness: 0.36, metalness: 0.7, exterior: true,
      color: 0xc9a468, envMapIntensity: 1.0
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
    const mastMat = M.solid('spireMast', {
      color: 0xa89a86, roughness: 0.42, metalness: 0.55, exterior: true, envMapIntensity: 0.9
    });
    this.shell.add(mesh(
      loft((t) => circleRing(lerp(3.4, 0.6, Math.pow(t, 0.7)), 12), [yBase, yTip - 12], { capTop: true }),
      mastMat, { name: 'SpireMastCore', cast: true }
    ));
  }

  /** Broadcast mast and the beacon light apparatus at the very top. */
  buildBeacon() {
    const M = this.materials;
    const mat = M.surface('beaconStruct', 'brushedMetal', {
      repeat: 1, roughness: 0.38, metalness: 0.66, exterior: true,
      color: 0xc0a478, envMapIntensity: 0.95
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
      repeat: 3, roughness: 0.32, metalness: 0.7, exterior: true,
      color: 0xd6b483, envMapIntensity: 1.0
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
      side: THREE.DoubleSide, envMapIntensity: 1.20
    });
    const yBase = SPIRE.crownTop, yTip = SPIRE.tip;
    const ribs = SPIRE.latticeRibs;
    /* Only the lowest fraction is enclosed. Above that the spire is an open
       mast — which is what keeps the silhouette a needle rather than a cone. */
    const n = 12;
    const top = lerp(yBase, yTip, SPIRE.glazedFraction);
    const heights = [];
    for (let i = 0; i <= n; i++) heights.push(lerp(yBase, top, i / n));
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

/* ==================================================================== */
/* Phase 4 — interiors (Section D.4)                                    */
/*                                                                      */
/* Sky-Lobby Transfer Floor · Lattice Stair / Viewing Gallery ·         */
/* Tuned Mass Damper Chamber · Broadcast & Beacon Room                  */
/* ==================================================================== */

Object.assign(SpireCrown.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;

    this.palette = {
      concrete: M.surface('crownConcrete', 'polishedConcrete', { repeat: 10, roughness: 0.24, metalness: 0.1 }),
      mesh: M.surface('crownMesh', 'expandedMesh', {
        repeat: 4, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide, alphaTest: 0.4
      }),
      metal: M.surface('crownIntMetal', 'brushedMetal', { repeat: 3, roughness: 0.26, metalness: 0.82 }),
      glass: M.glass('crownGlassInt', { color: 0xcfe6f0, opacity: 0.16, roughness: 0.05, exterior: false }),
      dark: M.solid('crownDark', { color: 0x1e232b, roughness: 0.5, metalness: 0.4 }),
      polished: M.solid('crownPolished', { color: 0xd8dde3, roughness: 0.06, metalness: 0.96 }),
      alum: M.solid('crownAlum', { color: 0xa9b0b8, roughness: 0.34, metalness: 0.7 })
    };
    this.palette.ribLed = M.solid('crownRibLed', {
      color: 0x141a24, roughness: 0.4, emissive: 0x8fc4ff, emissiveIntensity: 2.8
    });
    this.palette.strip = M.solid('crownStrip', {
      color: 0x22262c, roughness: 0.5, emissive: 0xe8f2ff, emissiveIntensity: 2.4
    });
    M.registerInteriorPalette(this.palette);

    this.roomSkyLobbyTransfer(A);
    this.roomLatticeStair(A);
    this.roomDamperChamber(A);
    this.roomBeaconRoom(A);
  },

  /* ---------------- Sky-Lobby Transfer Floor (L56) ---------------- */

  roomSkyLobbyTransfer(A) {
    const P = this.palette;
    const y = SPIRE.base;
    const h = this.crownHalf(0);
    const room = this.room({
      name: 'Sky-Lobby Transfer Floor', level: 'L56',
      center: [0, y + 3, 0], size: [h * 2 + 3, 9, h * 1.72 + 3],
      acoustic: A.MARBLE_HALL, range: 170
    });

    room.lazy((r) => {
      const ring = roundedRectRing(h - 1, (h - 1) * 0.86, (h - 1) * 0.42, 30);
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();

      const floor = new THREE.ShapeGeometry(shape, 4);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.08);
      r.group.add(mesh(xform(floor, { pos: [0, y + 0.08, 0] }), P.concrete, {
        name: 'DarkPolishedConcrete', receive: true
      }));
      const ceil = new THREE.ShapeGeometry(shape, 4);
      ceil.rotateX(Math.PI / 2);
      remapUV(ceil, 'xz', 0.1);
      r.group.add(mesh(xform(ceil, { pos: [0, y + 5.2, 0] }), P.dark, { name: 'Ceiling' }));

      /* Exposed lattice ribs, internally lit along their length (D.4). */
      const ribs = [], leds = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        const p0 = [Math.cos(a) * (h - 0.6), y, Math.sin(a) * (h - 0.6) * 0.86];
        const p1 = [Math.cos(a) * (h - 1.4), y + 5.2, Math.sin(a) * (h - 1.4) * 0.86];
        const m = member(p0, p1, 0.42, 0.42);
        if (m) ribs.push(m);
        const l = member(p0, p1, 0.16, 0.16);
        if (l) leds.push(l);
      }
      r.group.add(mesh(mergeGeometries(ribs.filter(Boolean)), P.metal, { name: 'ExposedRibs', cast: true }));
      const ledMesh = mesh(mergeGeometries(leds.filter(Boolean)), P.ribLed, { name: 'RibLEDs' });
      r.group.add(ledMesh);

      /* Prop 1 — rib LEDs that shift tone (D.4: with the time-of-day mode). */
      const ribLights = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ribLights.push(roomLight(r, 0x9fd0ff, 26, 34, [Math.cos(a) * (h - 3), y + 3, Math.sin(a) * (h - 3) * 0.86]));
      }
      this.ribLedMaterial = P.ribLed;
      r.addProp({
        name: 'Rib LED lighting',
        update() {
          const k = 1 + Math.sin(performance.now() * 0.0005) * 0.14;
          P.ribLed.emissiveIntensity = 2.5 * k;
          for (const l of ribLights) l.intensity = 24 * k;
        }
      });

      /* Prop 2 — the express-lift bank that terminates here. */
      const lifts = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const d = elevatorDoors(2.0, 2.6, { period: 13 + i * 2.1 });
        const gL = d.geometry.clone(); gL.scale(-1, 1, 1);
        d.left.geometry = gL; d.left.material = P.metal;
        d.right.geometry = d.geometry; d.right.material = P.metal;
        d.group.position.set(Math.cos(a) * 7, y + 0.08, Math.sin(a) * 6);
        d.group.rotation.y = -a;
        r.group.add(d.group);
        lifts.push(d);
      }
      r.addProp({ name: 'Express lifts', update: (dt) => { for (const l of lifts) l.update(dt); } });

      /* Prop 3 — an altitude readout that ticks. */
      const boardMat = this.materials.solid('crownAltBoard', {
        color: 0x0b0f16, roughness: 0.4, emissive: 0x9fe8ff, emissiveIntensity: 1.4
      });
      this.materials.registerInterior(boardMat);
      const board = mesh(box(4.4, 1.1, 0.1, [0, y + 3.6, -(h - 1.2) * 0.84]), boardMat, {
        name: 'AltitudeReadout'
      });
      r.group.add(board);
      r.addProp({
        name: 'Altitude readout',
        update() {
          const p = performance.now() * 0.001;
          boardMat.emissiveIntensity = 1.2 + (Math.sin(p * 3.1) > 0.9 ? 0.7 : 0);
        }
      });

      /* Seating and a viewing rail at the glazing. */
      const pods = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        pods.push({ pos: [Math.cos(a) * (h - 4), y + 0.08, Math.sin(a) * (h - 4) * 0.86], rot: [0, -a + Math.PI, 0] });
      }
      r.group.add(instance(seatPod(1.0, 0.95, 0.8),
        this.materials.solid('crownSeat', { color: 0x39414c, roughness: 0.6 }), pods,
        { name: 'TransferSeating', castShadow: true }));
    });
  },

  /* ---------------- Lattice Stair / Viewing Gallery ---------------- */

  /** "A glass-tread stair/gallery is suspended within the lattice void,
      giving vertigo-inducing views straight down through the structure." */
  roomLatticeStair(A) {
    const P = this.palette;
    const yBottom = SPIRE.crownTop;
    const yTop = SPIRE.damperY - 12;
    const room = this.room({
      name: 'Lattice Stair / Viewing Gallery', level: 'L88 → spire',
      center: [0, (yBottom + yTop) / 2, 0], size: [30, yTop - yBottom + 10, 30],
      acoustic: A.MACHINE_ROOM, range: 220
    });

    room.lazy((r) => {
      /* Landings at intervals through the lattice void. */
      const landings = [], railParts = [];
      const stairs = { treads: [], stringers: [] };
      const count = 5;
      for (let i = 0; i < count; i++) {
        const y0 = lerp(yBottom, yTop, i / count);
        const y1 = lerp(yBottom, yTop, (i + 1) / count);
        const t0 = (y0 - SPIRE.crownTop) / (SPIRE.tip - SPIRE.crownTop);
        const rad = this.latticeRadius((y0 - SPIRE.crownTop) / (SPIRE.tip - SPIRE.crownTop)) * 0.62;
        const rOut = Math.max(rad, 4.0);
        /* Expanded-metal-mesh gallery flooring (D.4). */
        const g = new THREE.RingGeometry(1.6, rOut, 28, 1);
        g.rotateX(-Math.PI / 2);
        remapUV(g, 'xz', 0.2);
        landings.push(xform(g, { pos: [0, y0, 0] }));

        const s = glassTreadStair(1.8, rOut - 0.4, y0 + 0.1, y1 - 0.1, 1.0, 20);
        stairs.treads.push(s.treads);
        stairs.stringers.push(s.stringers);

        const pts = [];
        for (let k = 0; k <= 28; k++) {
          const a = (k / 28) * TAU;
          pts.push([Math.cos(a) * (rOut - 0.15), y0, Math.sin(a) * (rOut - 0.15)]);
        }
        railParts.push(balustrade(pts, 1.1, 2, 0.03, 0.045));
      }
      r.group.add(mesh(mergeGeometries(landings), P.mesh, { name: 'MeshGalleryFloors', receive: true }));
      r.group.add(mesh(mergeGeometries(stairs.treads), P.glass, {
        name: 'GlassTreads', renderOrder: 4
      }));
      r.group.add(mesh(mergeGeometries(stairs.stringers), P.metal, {
        name: 'SlimSteelStringers', cast: true
      }));
      r.group.add(mesh(mergeGeometries(railParts.filter(Boolean)), P.metal, { name: 'GalleryRails' }));

      /* Prop 1 — the rib LEDs climbing the lattice, brightening with height. */
      const leds = [];
      for (let i = 0; i < SPIRE.latticeRibs; i++) {
        for (let k = 0; k < 12; k++) {
          const t0 = k / 12, t1 = (k + 1) / 12;
          const yy0 = lerp(yBottom, yTop, t0), yy1 = lerp(yBottom, yTop, t1);
          const tt0 = (yy0 - SPIRE.crownTop) / (SPIRE.tip - SPIRE.crownTop);
          const tt1 = (yy1 - SPIRE.crownTop) / (SPIRE.tip - SPIRE.crownTop);
          const a0 = (i / SPIRE.latticeRibs) * TAU + tt0 * 0.34;
          const a1 = (i / SPIRE.latticeRibs) * TAU + tt1 * 0.34;
          const r0 = this.latticeRadius(tt0) * 0.93, r1 = this.latticeRadius(tt1) * 0.93;
          const m = member([Math.cos(a0) * r0, yy0, Math.sin(a0) * r0],
            [Math.cos(a1) * r1, yy1, Math.sin(a1) * r1], 0.14, 0.14);
          if (m) leds.push(m);
        }
      }
      r.group.add(mesh(mergeGeometries(leds.filter(Boolean)), P.ribLed, { name: 'LatticeStairLEDs' }));
      const climbLights = [];
      for (let i = 0; i < count; i++) {
        climbLights.push(roomLight(r, 0x9fd0ff, 22, 30, [0, lerp(yBottom, yTop, i / count) + 2, 0]));
      }
      r.addProp({
        name: 'Lattice LED climb',
        update() {
          const t = performance.now() * 0.0008;
          for (let i = 0; i < climbLights.length; i++) {
            climbLights[i].intensity = 16 + Math.max(0, Math.sin(t - i * 0.7)) * 18;
          }
        }
      });

      /* Prop 2 — an interpretive plaque set at each landing. */
      const plaques = [];
      for (let i = 0; i < count; i++) {
        plaques.push({ pos: [2.6, lerp(yBottom, yTop, i / count), 0], rot: [0, -Math.PI / 2, 0] });
      }
      r.group.add(instance(plaque(0.8, 0.5, 0.9), P.metal, plaques, { name: 'GalleryPlaques' }));
      r.addProp({
        name: 'Gallery plaque lighting',
        update() { P.strip.emissiveIntensity = 2.2 + Math.sin(performance.now() * 0.0006) * 0.4; }
      });

      /* Prop 3 — a maintenance hoist that runs the height of the void. */
      const hoist = new THREE.Group();
      hoist.name = 'LatticeHoist';
      hoist.add(mesh(mergeGeometries([
        box(1.2, 1.6, 1.2, [0, 0.8, 0]),
        box(1.4, 0.12, 1.4, [0, 0.02, 0]),
        cyl(0.05, 0.05, 30, 6, [0, 16, 0])
      ]), P.alum, { name: 'HoistCage' }));
      hoist.position.set(2.4, yBottom, 2.4);
      r.group.add(hoist);
      let ht = 0;
      r.addProp({
        name: 'Maintenance hoist',
        update(dt) {
          ht += dt;
          const k = 0.5 - 0.5 * Math.cos((ht % 34) / 34 * TAU);
          hoist.position.y = lerp(yBottom, yTop - 4, k);
        }
      });
    });
  },

  /* ---------------- Tuned Mass Damper Chamber ---------------- */

  roomDamperChamber(A) {
    const P = this.palette;
    const y = SPIRE.damperY;
    const room = this.room({
      name: 'Tuned Mass Damper Chamber', level: 'Spire, 372 m',
      center: [0, y, 0], size: [26, 34, 26],
      acoustic: A.MACHINE_ROOM, range: 200
    });

    room.lazy((r) => {
      /* Chamber shell: a drum of expanded mesh grating and dark panels. */
      const rad = 8.4;
      const g = new THREE.RingGeometry(2.0, rad, 30, 1);
      g.rotateX(-Math.PI / 2);
      remapUV(g, 'xz', 0.2);
      r.group.add(mesh(xform(g, { pos: [0, y - 12, 0] }), P.mesh, {
        name: 'DamperChamberFloor', receive: true
      }));
      r.group.add(mesh(
        loft(() => circleRing(rad + 0.4, 30), [y - 12, y + 12], { capTop: false }),
        P.dark, { name: 'ChamberWall', receive: true }
      ));

      /* Reinforced glass between the gallery and the mass. */
      r.group.add(mesh(
        loft(() => circleRing(rad - 1.4, 30), [y - 11.6, y - 4], { capTop: false }),
        P.glass, { name: 'ReinforcedGlassScreen', renderOrder: 4 }
      ));

      /**
       * Prop 1 — the damper itself: a massive suspended polished-steel
       * weight, swaying slowly behind the glass.
       */
      const tmd = tunedMassDamper(3.6, 14);
      tmd.pivot.position.set(0, y + 11, 0);
      tmd.pivot.add(mesh(tmd.cables, P.metal, { name: 'DamperCables' }));
      tmd.pivot.add(mesh(tmd.sphere, P.polished, { name: 'DamperMass', cast: true }));
      r.group.add(tmd.pivot);
      r.addProp({
        name: 'Tuned mass damper',
        update(dt) { tmd.update(dt, performance.now() * 0.001); }
      });

      /* Viscous dampers restraining the mass, arranged radially. */
      const restraints = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        restraints.push(cyl(0.3, 0.3, 4.6, 12,
          [Math.cos(a) * 5.6, y - 3.2, Math.sin(a) * 5.6], [0, -a, Math.PI / 2.4]));
        restraints.push(cyl(0.44, 0.44, 0.6, 12, [Math.cos(a) * 7.6, y - 2.0, Math.sin(a) * 7.6], [0, -a, 0]));
      }
      r.group.add(mesh(mergeGeometries(restraints), P.metal, { name: 'ViscousRestraints' }));

      /* Prop 2 — one dramatic spotlight on the damper sphere (D.4). */
      const spot = new THREE.SpotLight(0xffffff, 900, 60, 0.42, 0.55, 2);
      spot.position.set(6.2, y + 8, 4.0);
      spot.target.position.set(0, y - 3, 0);
      r.group.add(spot, spot.target);
      r.lights.push(spot);
      r.addProp({
        name: 'Damper spotlight',
        update() { spot.intensity = 820 + Math.sin(performance.now() * 0.0007) * 140; }
      });

      /* Prop 3 — the explanatory plaques and a status panel that ticks. */
      const plaques = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.5;
        plaques.push({ pos: [Math.cos(a) * (rad - 2.2), y - 12, Math.sin(a) * (rad - 2.2)], rot: [0, -a + Math.PI, 0] });
      }
      r.group.add(instance(plaque(1.0, 0.62, 1.0), P.metal, plaques, { name: 'DamperPlaques' }));
      const panelMat = this.materials.solid('crownDamperPanel', {
        color: 0x0a0f16, roughness: 0.4, emissive: 0x6fe8b0, emissiveIntensity: 1.6
      });
      this.materials.registerInterior(panelMat);
      r.group.add(mesh(box(3.2, 1.2, 0.1, [0, y - 9.4, -(rad - 0.6)]), panelMat, { name: 'DamperStatusPanel' }));
      r.addProp({
        name: 'Damper status panel',
        update() {
          const p = performance.now() * 0.001;
          panelMat.emissiveIntensity = 1.3 + Math.abs(Math.sin(p * 1.1)) * 0.7;
        }
      });
    });
  },

  /* ---------------- Broadcast & Beacon Room ---------------- */

  /** "Utilitarian — brushed aluminium, exposed conduit — dominated by the
      mechanical beacon-light apparatus." */
  roomBeaconRoom(A) {
    const P = this.palette;
    const y = SPIRE.beaconY;
    const room = this.room({
      name: 'Broadcast & Beacon Room', level: 'Spire, 612 m',
      center: [0, y + 3.5, 0], size: [12, 12, 12],
      acoustic: A.MACHINE_ROOM, range: 200
    });

    room.lazy((r) => {
      const rad = 3.0;
      const g = new THREE.CircleGeometry(rad, 20);
      g.rotateX(-Math.PI / 2);
      remapUV(g, 'xz', 0.3);
      r.group.add(mesh(xform(g, { pos: [0, y + 0.06, 0] }), P.mesh, {
        name: 'BeaconRoomFloor', receive: true
      }));
      r.group.add(mesh(
        loft(() => circleRing(rad, 20), [y, y + 6.6], { capTop: true }),
        P.alum, { name: 'BeaconRoomShell', receive: true }
      ));

      /* Exposed conduit runs, as the brief specifies. */
      const conduit = [];
      const rr = rng(919);
      for (let i = 0; i < 14; i++) {
        const a = rr() * TAU;
        const h0 = 0.4 + rr() * 4.4;
        conduit.push(cyl(0.045 + rr() * 0.03, 0.045, 5.4, 6,
          [Math.cos(a) * (rad - 0.16), y + 3.2, Math.sin(a) * (rad - 0.16)]));
        conduit.push(cyl(0.05, 0.05, rad * 1.4, 6,
          [Math.cos(a) * (rad * 0.3), y + h0, Math.sin(a) * (rad * 0.3)], [0, -a, Math.PI / 2]));
      }
      // Junction boxes.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        conduit.push(box(0.34, 0.42, 0.18, [Math.cos(a) * (rad - 0.2), y + 1.6, Math.sin(a) * (rad - 0.2)], [0, -a, 0]));
      }
      r.group.add(mesh(mergeGeometries(conduit), P.metal, { name: 'ExposedConduit' }));

      /* Prop 1 — the beacon mechanism: a rotating optic in a housing. */
      const optic = new THREE.Group();
      optic.name = 'BeaconOptic';
      optic.add(mesh(mergeGeometries([
        cyl(0.9, 0.9, 1.4, 16, [0, 0, 0], null, true),
        box(0.28, 1.4, 1.8, [0.9, 0, 0])
      ]), P.metal, { name: 'OpticBody' }));
      const opticGlow = this.materials.solid('crownBeaconOptic', {
        color: 0x2a0d08, roughness: 0.3, emissive: 0xff5533, emissiveIntensity: 3.0
      });
      this.materials.registerInterior(opticGlow);
      optic.add(mesh(cyl(0.62, 0.62, 1.5, 16, [0, 0, 0]), opticGlow, { name: 'OpticLamp' }));
      optic.position.set(0, y + 4.2, 0);
      r.group.add(optic);
      r.group.add(mesh(mergeGeometries([
        cyl(1.5, 1.5, 0.3, 18, [0, y + 3.2, 0]),
        cyl(0.2, 0.2, 2.6, 8, [0, y + 1.9, 0])
      ]), P.alum, { name: 'BeaconPedestal' }));
      const beaconLight = roomLight(r, 0xff6a44, 90, 30, [0, y + 4.2, 0]);
      r.addProp({
        name: 'Beacon optic',
        update(dt) {
          optic.rotation.y += dt * 1.15;
          const p = (performance.now() * 0.001) % 3;
          const pulse = Math.exp(-Math.pow((p - 0.25) / 0.16, 2)) + Math.exp(-Math.pow((p - 0.75) / 0.16, 2));
          opticGlow.emissiveIntensity = 2.0 + pulse * 6;
          beaconLight.intensity = 40 + pulse * 140;
        }
      });

      /* Prop 2 — a ventilation fan in the wall. */
      const fan = ventFan(0.62, 5);
      fan.rotor.add(mesh(fan.geometry, P.alum, { name: 'FanBlades' }));
      fan.rotor.position.set(0, y + 2.2, -(rad - 0.1));
      fan.rotor.rotation.x = Math.PI / 2;
      r.group.add(fan.rotor);
      r.group.add(mesh(fan.housing, P.metal, {
        name: 'FanHousing', pos: [0, y + 2.2, -(rad - 0.12)], rot: [Math.PI / 2, 0, 0]
      }));
      r.addProp({ name: 'Ventilation fan', update: (dt) => fan.update(dt) });

      /* Prop 3 — utilitarian strip lighting and a rack of blinking gear. */
      const strips = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        strips.push(box(0.1, 0.06, 2.4, [Math.cos(a) * 1.4, y + 6.3, Math.sin(a) * 1.4], [0, -a, 0]));
      }
      r.group.add(mesh(mergeGeometries(strips), P.strip, { name: 'StripLighting' }));
      const rackMat = this.materials.solid('crownRack', {
        color: 0x14181e, roughness: 0.5, emissive: 0x33ff88, emissiveIntensity: 0.9
      });
      this.materials.registerInterior(rackMat);
      const rack = mesh(mergeGeometries([
        box(1.0, 2.0, 0.6, [0, 1.0, 0]),
        box(0.9, 0.08, 0.05, [0, 1.7, 0.32]),
        box(0.9, 0.08, 0.05, [0, 1.4, 0.32]),
        box(0.9, 0.08, 0.05, [0, 1.1, 0.32])
      ]), rackMat, { name: 'BroadcastRack', pos: [1.6, y, 1.2] });
      r.group.add(rack);
      const roomStrip = roomLight(r, 0xe8f2ff, 22, 16, [0, y + 5.6, 0]);
      r.addProp({
        name: 'Broadcast rack',
        update() {
          const p = performance.now() * 0.001;
          rackMat.emissiveIntensity = 0.6 + (Math.sin(p * 7.3) > 0.4 ? 0.8 : 0.1);
          roomStrip.intensity = 22;
        }
      });
    });
  }
});
