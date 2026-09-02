/**
 * ZONE 1 — THE CANAL CONCOURSE (B2 … L3)
 *
 * Concept borrowed from Venice: a navigable canal ring around the podium,
 * arched stone footbridges, electric shuttle boats and colonnaded arcades.
 * The canal is not decorative — Section C makes it part of the building's
 * greywater / evaporative-cooling loop, and the podium sits on a
 * reinforced-concrete raft over bored piles because of the high water table.
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { CANAL, LEVELS } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, roundedRectShape, extrudeVertical,
  roundedRectRing, circleRing, loft, mesh, instance, member, tube,
  archShape, sweep, waterAnnulus, balustrade, tree, annulusShape
} from '../world/BuildKit.js';
import { TAU, rng, lerp, clamp } from '../core/MathUtil.js';

export class CanalConcourse extends Zone {
  constructor(ctx) {
    super('canal', 'The Canal Concourse', ctx);
    this.appearsAtMilestone = 3;
    this.waterUniforms = null;
  }

  get radius() { return CANAL.outerRadius + 40; }

  /* ---------------------------------------------------------------- */
  /* Phase 2 — massing                                                 */
  /* ---------------------------------------------------------------- */

  massing() {
    const M = this.materials;
    const H = CANAL.podiumHalf;

    /* --- The podium: three stepped terraces from B2 up to L3 --- */
    const stoneMat = M.surface('podiumStone', 'limestone', {
      repeat: 26, roughness: 0.62, exterior: true
    });
    // Terraces step inward as they rise, so the widest course still clears
    // the canal's inner quay at 114 m.
    const terraces = [
      { half: H, y0: LEVELS.B2, y1: LEVELS.B1, corner: 34 },
      { half: H - 6, y0: LEVELS.B1, y1: LEVELS.L2, corner: 32 },
      { half: H - 14, y0: LEVELS.L2, y1: LEVELS.L3, corner: 30 },
      { half: H - 24, y0: LEVELS.L3, y1: LEVELS.podiumTop, corner: 26 }
    ];
    const podiumParts = [];
    for (const t of terraces) {
      podiumParts.push(loft(
        () => roundedRectRing(t.half, t.half, t.corner, 44),
        [t.y0, t.y1],
        { capTop: true, capBottom: false, uvScale: 0.04 }
      ));
    }
    const podium = mesh(mergeGeometries(podiumParts), stoneMat, {
      name: 'PodiumMass', cast: true, receive: true
    });
    this.shell.add(podium);

    /* --- The canal: bed, retaining walls, dock promenade --- */
    const bedY = CANAL.waterLevel - CANAL.depth;          // -11.2
    const dockY = CANAL.quayLevel;                        //  -7.0
    const copeY = CANAL.copingLevel;                      //   0.3

    const bedMat = M.surface('canalBed', 'vaultStone', { repeat: 30, roughness: 0.94, exterior: true });
    const bedDisc = new THREE.CircleGeometry(CANAL.outerRadius + 2, 96);
    bedDisc.rotateX(-Math.PI / 2);
    const buv = bedDisc.attributes.uv, bpos = bedDisc.attributes.position;
    for (let i = 0; i < buv.count; i++) buv.setXY(i, bpos.getX(i) * 0.05, bpos.getZ(i) * 0.05);
    this.shell.add(mesh(xform(bedDisc, { pos: [0, bedY, 0] }), bedMat, {
      name: 'CanalBed', receive: true
    }));

    const quayMat = M.surface('quayStone', 'vaultStone', { repeat: 24, roughness: 0.88, exterior: true });

    /* Solid ground drum inside the dock, capped at plaza level: this is what
       the podium stands on and what forms the wall behind the dock. */
    const groundDrum = loft(() => circleRing(CANAL.innerRadius - 9, 96),
      [bedY, copeY], { capTop: true, capBottom: false });

    /* The canal's inner face, from the bed up to the dock. Open-topped —
       capping it here is what previously roofed the water over. */
    const innerFace = loft(() => circleRing(CANAL.innerRadius, 96),
      [bedY, dockY], { capTop: false, capBottom: false });

    /* The outer retaining wall, bed to plaza. Also open-topped. */
    const outerFace = loft(() => circleRing(CANAL.outerRadius, 96),
      [bedY, copeY], { capTop: false, capBottom: false });

    this.shell.add(mesh(mergeGeometries([groundDrum, innerFace, outerFace]), quayMat, {
      name: 'CanalQuays', cast: true, receive: true
    }));

    /* The dock promenade: a true annulus at boat level, which is the B2
       Water Arrival level of D.1. */
    const dockMat = M.surface('canalDock', 'limestone', { repeat: 26, roughness: 0.64, exterior: true });
    const dock = new THREE.RingGeometry(CANAL.innerRadius - 9, CANAL.innerRadius, 96, 1);
    dock.rotateX(-Math.PI / 2);
    const duv = dock.attributes.uv, dpos = dock.attributes.position;
    for (let i = 0; i < duv.count; i++) duv.setXY(i, dpos.getX(i) * 0.07, dpos.getZ(i) * 0.07);
    this.shell.add(mesh(xform(dock, { pos: [0, dockY, 0] }), dockMat, {
      name: 'CanalDockPromenade', receive: true
    }));

    /* Coping courses, built as extruded annuli — a capped loft would be a
       solid disc and would bury the canal. */
    const copingMat = M.surface('canalCoping', 'limestone', { repeat: 20, roughness: 0.56, exterior: true });
    const copingParts = [
      xform(extrudeVertical(annulusShape(CANAL.outerRadius - 0.2, CANAL.outerRadius + 1.6, 96), 0.9),
        { pos: [0, copeY - 0.6, 0] }),
      xform(extrudeVertical(annulusShape(CANAL.innerRadius - 1.4, CANAL.innerRadius + 0.2, 96), 0.55),
        { pos: [0, dockY - 0.1, 0] })
    ];
    this.shell.add(mesh(mergeGeometries(copingParts), copingMat, {
      name: 'CanalCoping', cast: true, receive: true
    }));

    /* Stairs down from the plaza to the dock, on the four bridge axes. */
    const stairParts = [];
    for (const ang of CANAL.bridgeAngles) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const y = copeY - (i + 0.5) * ((copeY - dockY) / steps);
        const r = CANAL.innerRadius - 9.5 - i * 0.55;
        stairParts.push(box(7.0, (copeY - dockY) / steps + 0.06, 0.62,
          [ca * r, y, sa * r], [0, -ang, 0]));
      }
    }
    this.shell.add(mesh(mergeGeometries(stairParts), dockMat, {
      name: 'CanalDockStairs', cast: true, receive: true
    }));

    /* --- Canal water --- */
    this.buildWater();

    /* --- Four arched footbridges on the cardinal axes --- */
    this.buildBridges();

    /* --- Mooring piers and shuttle boats --- */
    this.buildPiersAndBoats();

    /* --- Colonnade: the arcade that fronts L1 --- */
    this.buildColonnade();
  }

  /** Canal water: a vertex-rippled surface whose amplitude rises with rain. */
  buildWater() {
    const M = this.materials;
    const set = M.tex.get('waterNormal');
    const uniforms = {
      uTime: { value: 0 },
      uRipple: { value: 0.5 },
      uWind: { value: 0.25 }
    };
    this.waterUniforms = uniforms;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2c5a63,
      roughness: 0.09,
      metalness: 0.16,
      transparent: true,
      opacity: 0.88,
      normalMap: set.normalMap,
      envMapIntensity: 2.4
    });
    mat.normalScale = new THREE.Vector2(0.9, 0.9);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uRipple = uniforms.uRipple;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform float uRipple;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float r = length(position.xz);
          transformed.y += sin(r * 0.9 - uTime * 1.6) * 0.055 * uRipple
                         + sin(position.x * 0.42 + uTime * 1.1) * 0.05 * uRipple
                         + sin(position.z * 0.51 - uTime * 0.9) * 0.045 * uRipple;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', `
          vec2 wuv1 = vNormalMapUv + vec2(uTime * 0.012, uTime * 0.008);
          vec2 wuv2 = vNormalMapUv * 1.7 - vec2(uTime * 0.009, uTime * 0.014);
          vec3 mn = texture2D(normalMap, wuv1).xyz * 2.0 - 1.0;
          mn += texture2D(normalMap, wuv2).xyz * 2.0 - 1.0;
          mn.xy *= normalScale * (0.6 + uRipple * 0.9);
          normal = normalize(tbn * normalize(mn));`)
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform float uRipple;`);
    };
    mat.customProgramCacheKey = () => 'aeon-water';
    this.waterMaterial = mat;

    const geo = waterAnnulus(CANAL.innerRadius + 0.1, CANAL.outerRadius - 0.1, 128, 12);
    const water = mesh(xform(geo, { pos: [0, CANAL.waterLevel, 0] }), mat, {
      name: 'CanalWater', renderOrder: 2
    });
    this.shell.add(water);
    this.water = water;

    this.addAnimator((dt, t) => {
      uniforms.uTime.value = t;
    });
  }

  buildBridges() {
    const M = this.materials;
    const stone = M.surface('bridgeStone', 'limestone', { repeat: 8, roughness: 0.68, exterior: true });
    const railMat = M.solid('bridgeRail', { color: 0x2b2b2e, roughness: 0.48, metalness: 0.7, exterior: true });

    const deckParts = [];
    const railParts = [];
    const span = CANAL.outerRadius - CANAL.innerRadius + 16;
    const rMid = CANAL.midRadius;

    for (const ang of CANAL.bridgeAngles) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const steps = 22;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const r = CANAL.innerRadius - 8 + u * span;
        // A shallow parabolic rise so boats can pass beneath.
        const y = CANAL.copingLevel + 0.4 + Math.sin(u * Math.PI) * CANAL.bridgeRise;
        pts.push([ca * r, y, sa * r]);
      }
      for (let i = 0; i < steps; i++) {
        const a = pts[i], b = pts[i + 1];
        const seg = member(a, b, CANAL.bridgeWidth, 0.62);
        if (seg) {
          // Orient the deck's width across the bridge, not along it.
          deckParts.push(seg);
        }
      }
      // Segmental arch beneath the deck.
      for (let i = 0; i <= steps; i += 1) {
        const u = i / steps;
        const r = CANAL.innerRadius - 8 + u * span;
        const y = CANAL.copingLevel + 0.4 + Math.sin(u * Math.PI) * CANAL.bridgeRise;
        const drop = Math.sin(u * Math.PI) * 2.1;
        if (drop > 0.05) {
          const g = box(CANAL.bridgeWidth * 0.86, drop, span / steps * 1.15,
            [ca * r, y - drop / 2 - 0.3, sa * r], [0, -ang, 0]);
          deckParts.push(g);
        }
      }
      // Balustrades either side.
      for (const side of [-1, 1]) {
        const off = side * CANAL.bridgeWidth * 0.5;
        const rail = pts.map(p => [
          p[0] - sa * off, p[1] + 0.3, p[2] + ca * off
        ]);
        const b = balustrade(rail, 1.02, 2, 0.07, 0.07);
        if (b) railParts.push(b);
      }
    }
    this.shell.add(mesh(mergeGeometries(deckParts), stone, { name: 'CanalBridges', cast: true, receive: true }));
    this.detail.add(mesh(mergeGeometries(railParts), railMat, { name: 'CanalBridgeRails', cast: true }));
  }

  buildPiersAndBoats() {
    const M = this.materials;
    const stone = M.surface('pierStone', 'limestone', { repeat: 4, roughness: 0.72, exterior: true });
    const hullMat = M.surface('boatHull', 'paintedTimber', { repeat: 2, roughness: 0.5, exterior: true });
    const trimMat = M.solid('boatTrim', { color: 0x1d2a33, roughness: 0.42, metalness: 0.3, exterior: true });
    const brass = M.solid('brassCleat', { color: 0xb08d3f, roughness: 0.3, metalness: 0.85, exterior: true });

    /* --- Stone mooring piers projecting into the canal --- */
    const pierParts = [];
    const cleats = [];
    for (const ang of CANAL.pierAngles) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const r = CANAL.innerRadius + 5.0;
      pierParts.push(box(13, 4.0, 7.2, [ca * r, CANAL.waterLevel - 1.2, sa * r], [0, -ang, 0]));
      pierParts.push(box(14.4, 0.55, 8.4, [ca * r, CANAL.waterLevel + 1.0, sa * r], [0, -ang, 0]));
      for (let i = -1; i <= 1; i += 2) {
        cleats.push({ pos: [ca * (r + 4.5) - sa * i * 2.6, CANAL.waterLevel + 1.4, sa * (r + 4.5) + ca * i * 2.6] });
      }
    }
    this.shell.add(mesh(mergeGeometries(pierParts), stone, { name: 'CanalPiers', cast: true, receive: true }));
    const cleatGeo = mergeGeometries([
      cyl(0.14, 0.16, 0.5, 8, [0, 0.25, 0]),
      cyl(0.1, 0.1, 0.72, 8, [0, 0.52, 0], [Math.PI / 2, 0, 0])
    ]);
    this.detail.add(instance(cleatGeo, brass, cleats, { name: 'BrassCleats', castShadow: true }));

    /* --- Timber-hulled electric shuttle boats --- */
    const hullGeo = this.boatHullGeometry();
    const canopyGeo = mergeGeometries([
      box(2.0, 0.12, 4.2, [0, 1.92, 0]),
      cyl(0.05, 0.05, 1.9, 6, [0.9, 0.95, 1.9]),
      cyl(0.05, 0.05, 1.9, 6, [-0.9, 0.95, 1.9]),
      cyl(0.05, 0.05, 1.9, 6, [0.9, 0.95, -1.9]),
      cyl(0.05, 0.05, 1.9, 6, [-0.9, 0.95, -1.9])
    ]);

    const r = rng(7);
    this.boats = [];
    const boatGroup = new THREE.Group();
    boatGroup.name = 'ShuttleBoats';
    for (let i = 0; i < CANAL.boatCount; i++) {
      const g = new THREE.Group();
      g.add(mesh(hullGeo.clone(), hullMat, { name: 'Hull', cast: true }));
      g.add(mesh(canopyGeo.clone(), trimMat, { name: 'Canopy', cast: true }));
      const phase = (i / CANAL.boatCount) * TAU + r() * 0.4;
      g.userData.phase = phase;
      g.userData.speed = 0.026 + r() * 0.012;
      boatGroup.add(g);
      this.boats.push(g);
    }
    this.shell.add(boatGroup);

    // Boats circulate the ring; a gentle roll sells the water.
    this.addAnimator((dt, t) => {
      for (const b of this.boats) {
        const a = b.userData.phase + t * b.userData.speed;
        const rr = CANAL.midRadius + Math.sin(a * 3) * 3.2;
        b.position.set(Math.cos(a) * rr, CANAL.waterLevel + 0.42 + Math.sin(t * 1.3 + a) * 0.09, Math.sin(a) * rr);
        b.rotation.y = -a + Math.PI / 2;
        b.rotation.z = Math.sin(t * 1.1 + a) * 0.035;
      }
    });
  }

  /** A simple lofted timber hull — pointed at both ends, like a canal launch. */
  boatHullGeometry() {
    const sections = [];
    const zs = [-4.6, -3.4, -1.6, 0, 1.6, 3.4, 4.6];
    const widths = [0.12, 0.72, 1.06, 1.14, 1.06, 0.78, 0.16];
    const parts = [];
    for (let i = 0; i < zs.length - 1; i++) {
      const w0 = widths[i], w1 = widths[i + 1];
      const g = new THREE.CylinderGeometry(w1, w0, Math.abs(zs[i + 1] - zs[i]), 8, 1, true);
      g.rotateX(Math.PI / 2);
      g.scale(1, 0.52, 1);
      xform(g, { pos: [0, 0.34, (zs[i] + zs[i + 1]) / 2] });
      parts.push(g);
    }
    parts.push(box(2.1, 0.1, 8.4, [0, 0.62, 0]));   // deck
    parts.push(box(2.2, 0.42, 8.6, [0, 0.86, 0]));  // gunwale
    return mergeGeometries(parts);
  }

  /** Colonnade fronting the L1 Canalside Promenade. */
  buildColonnade() {
    const M = this.materials;
    const stone = M.surface('colonnadeStone', 'limestone', { repeat: 3, roughness: 0.66, exterior: true });
    const R = CANAL.podiumHalf - 3.0;
    const count = 56;
    const colGeo = mergeGeometries([
      cyl(0.52, 0.62, 5.4, 12, [0, 2.7, 0]),
      cyl(0.78, 0.62, 0.42, 12, [0, 5.62, 0]),
      box(1.7, 0.34, 1.7, [0, 5.98, 0]),
      box(1.5, 0.26, 1.5, [0, 0.13, 0])
    ]);
    const xs = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      // Follow the rounded-square podium edge rather than a circle.
      const p = roundedRectRing(R, R, 30, count)[i];
      xs.push({ pos: [p[0], LEVELS.L1 + 0.2, p[1]], rot: [0, -a, 0] });
    }
    this.shell.add(instance(colGeo, stone, xs, { name: 'Colonnade', castShadow: true, receiveShadow: true }));

    // The entablature the colonnade carries.
    this.shell.add(mesh(
      loft(() => roundedRectRing(R + 1.4, R + 1.4, 30, 56), [LEVELS.L1 + 6.2, LEVELS.L2],
        { capTop: true, capBottom: true }),
      stone, { name: 'ColonnadeEntablature', cast: true, receive: true }
    ));
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(CanalConcourse.prototype, {

  facade() {
    this.buildArcade();
    this.buildPodiumGlazing();
    this.buildLanterns();
    this.buildStalls();
  },

  /**
   * The arcade of pointed arches fronting the Market Loggia and the
   * Canalside Promenade. D.1's modelling note asks for one extruded arch
   * profile reused along a path, which is exactly what this does.
   */
  buildArcade() {
    const M = this.materials;
    const stone = M.surface('arcadeStone', 'vaultStone', {
      repeat: 4, roughness: 0.72, exterior: true, color: 0xe4dbc8
    });

    // One arch profile, extruded once and then instanced around the podium.
    const profile = archShape(4.6, 3.4, 2.3, 0.85);
    const archGeo = new THREE.ExtrudeGeometry(profile, {
      depth: 1.6, bevelEnabled: false, curveSegments: 10
    });
    archGeo.translate(0, 0, -0.8);

    const R = CANAL.podiumHalf - 2.2;
    const count = 48;
    const ring = roundedRectRing(R, R, 32, count);
    const xs = [];
    for (let i = 0; i < count; i++) {
      const p = ring[i];
      const a = Math.atan2(p[1], p[0]);
      xs.push({ pos: [p[0], LEVELS.B1, p[1]], rot: [0, -a + Math.PI / 2, 0] });
    }
    this.shell.add(instance(archGeo, stone, xs, {
      name: 'MarketLoggiaArcade', castShadow: true, receiveShadow: true
    }));

    /* A second, taller arcade one level up, at the promenade. */
    const profile2 = archShape(5.4, 3.8, 2.6, 0.9);
    const archGeo2 = new THREE.ExtrudeGeometry(profile2, {
      depth: 1.8, bevelEnabled: false, curveSegments: 10
    });
    archGeo2.translate(0, 0, -0.9);
    const R2 = CANAL.podiumHalf - 8.5;
    const ring2 = roundedRectRing(R2, R2, 30, count);
    const xs2 = [];
    for (let i = 0; i < count; i++) {
      const p = ring2[i];
      const a = Math.atan2(p[1], p[0]);
      xs2.push({ pos: [p[0], LEVELS.L2, p[1]], rot: [0, -a + Math.PI / 2, 0] });
    }
    this.shell.add(instance(archGeo2, stone, xs2, {
      name: 'PromenadeArcade', castShadow: true, receiveShadow: true
    }));
  },

  /** The Tower Transfer Lobby's glazing at L3, where stone gives way to glass. */
  buildPodiumGlazing() {
    const M = this.materials;
    const mat = M.litFacade('podiumGlazing', {
      cols: 22, rows: 6, lit: 0.72, seed: 3, color: 0x93aabd,
      roughness: 0.09, metalness: 0.35, opacity: 0.5, maxEmissive: 2.0
    });
    const R = CANAL.podiumHalf - 23.4;
    const skin = loft(() => roundedRectRing(R, R, 26, 44),
      [LEVELS.L3 + 0.6, LEVELS.podiumTop - 0.6], { capTop: false, uvScale: [0.03, 0.16] });
    this.shell.add(mesh(skin, mat, { name: 'TransferLobbyGlazing', renderOrder: 3 }));

    const frameMat = M.surface('podiumFrame', 'brushedMetal', {
      repeat: 12, roughness: 0.3, metalness: 0.8, exterior: true, color: 0xc2c9d1
    });
    const frames = [];
    for (let i = 0; i < 44; i++) {
      const p = roundedRectRing(R + 0.35, R + 0.35, 26, 44)[i];
      frames.push(box(0.32, LEVELS.podiumTop - LEVELS.L3 - 1.2, 0.5,
        [p[0], (LEVELS.L3 + LEVELS.podiumTop) / 2, p[1]],
        [0, -Math.atan2(p[1], p[0]), 0]));
    }
    this.detail.add(mesh(mergeGeometries(frames), frameMat, { name: 'TransferLobbyMullions' }));
  },

  /**
   * Wrought-iron lantern pendants along the canal edge (D.1). Registered
   * with the night-emissive ramp so they light at dusk.
   */
  buildLanterns() {
    const M = this.materials;
    const ironMat = M.solid('lanternIron', { color: 0x22242a, roughness: 0.55, metalness: 0.6, exterior: true });
    const glowMat = M.solid('lanternGlow', {
      color: 0x3a3020, roughness: 0.4, emissive: 0xffb765, emissiveIntensity: 0.0
    });
    M.registerNightEmissive(glowMat, 4.5);
    this.lanternMaterial = glowMat;

    const postGeo = mergeGeometries([
      cyl(0.07, 0.11, 4.2, 7, [0, 2.1, 0]),
      cyl(0.26, 0.1, 0.34, 8, [0, 4.42, 0]),
      box(0.5, 0.06, 0.5, [0, 4.62, 0])
    ]);
    const lampGeo = new THREE.BoxGeometry(0.34, 0.5, 0.34);
    lampGeo.translate(0, 4.12, 0);

    const posts = [], lamps = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      // Along the plaza-side coping.
      posts.push({ pos: [Math.cos(a) * (CANAL.outerRadius + 3.4), CANAL.copingLevel, Math.sin(a) * (CANAL.outerRadius + 3.4)], rot: [0, -a, 0] });
      // And along the dock below.
      posts.push({ pos: [Math.cos(a) * (CANAL.innerRadius - 3.0), CANAL.quayLevel, Math.sin(a) * (CANAL.innerRadius - 3.0)], rot: [0, -a, 0] });
    }
    for (const p of posts) lamps.push({ pos: p.pos, rot: p.rot });
    this.shell.add(instance(postGeo, ironMat, posts, { name: 'CanalLanternPosts', castShadow: true }));
    this.shell.add(instance(lampGeo, glowMat, lamps, { name: 'CanalLanternGlobes' }));
  },

  /** Canvas-striped market stalls under the loggia arcade (D.1). */
  buildStalls() {
    const M = this.materials;
    const awningA = M.surface('stallAwningA', 'awningStripe', {
      repeat: 1, roughness: 0.88, exterior: true, side: THREE.DoubleSide,
      opts: { a: 0xf2ead7, b: 0x9c3b34 }
    });
    const awningB = M.surface('stallAwningB', 'awningStripe', {
      repeat: 1, roughness: 0.88, exterior: true, side: THREE.DoubleSide,
      opts: { a: 0xf2ead7, b: 0x2f5d6e }
    });
    const timberMat = M.surface('stallTimber', 'paintedTimber', {
      repeat: 1, roughness: 0.72, exterior: true
    });

    const awningGeo = (() => {
      const g = new THREE.PlaneGeometry(3.4, 2.2, 4, 3);
      g.rotateX(-Math.PI / 2.35);
      g.translate(0, 2.5, -0.9);
      return g;
    })();
    const tableGeo = mergeGeometries([
      box(3.2, 0.12, 1.5, [0, 0.95, 0]),
      box(0.12, 0.95, 0.12, [-1.5, 0.48, -0.65]),
      box(0.12, 0.95, 0.12, [1.5, 0.48, -0.65]),
      box(0.12, 0.95, 0.12, [-1.5, 0.48, 0.65]),
      box(0.12, 0.95, 0.12, [1.5, 0.48, 0.65])
    ]);

    const R = CANAL.podiumHalf - 6.0;
    const a1 = [], a2 = [], tables = [];
    const count = 24;
    const ring = roundedRectRing(R, R, 32, count);
    for (let i = 0; i < count; i++) {
      const p = ring[i];
      const rot = [0, -Math.atan2(p[1], p[0]) + Math.PI / 2, 0];
      const entry = { pos: [p[0], LEVELS.B1, p[1]], rot };
      (i % 2 ? a2 : a1).push(entry);
      tables.push(entry);
    }
    this.shell.add(instance(awningGeo, awningA, a1, { name: 'StallAwningsA', castShadow: true }));
    this.shell.add(instance(awningGeo, awningB, a2, { name: 'StallAwningsB', castShadow: true }));
    this.shell.add(instance(tableGeo, timberMat, tables, { name: 'StallTables', castShadow: true }));
  }
});
