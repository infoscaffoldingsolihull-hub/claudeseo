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
import { TAU, rng, lerp, clamp, smoothstep } from '../core/MathUtil.js';
import {
  roomShell, remapUV, seatPod, sofa, lowTable, table, chair, bench,
  receptionDesk, planter, plaque, lanternPendant, elevatorDoors, swingDoor,
  causticPlane, roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { glassBalustrade as glassRail } from '../world/BuildKit.js';

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

/* ==================================================================== */
/* Phase 4 — interiors (Section D.1)                                    */
/*                                                                      */
/* B2 Water Arrival Hall · B1 Market Loggia · L1 Canalside Promenade    */
/* Interior · L2 Mezzanine Overlook · L3 Tower Transfer Lobby           */
/* ==================================================================== */

Object.assign(CanalConcourse.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;

    /* Shared D.1 palette, built once and reused by every room here. */
    const M = this.materials;
    this.palette = {
      limestone: M.surface('intLimestone', 'limestone', { repeat: 8, roughness: 0.42 }),
      brick: M.surface('intBrick', 'brickHerringbone', { repeat: 10, roughness: 0.68 }),
      vault: M.surface('intVaultStone', 'vaultStone', { repeat: 6, roughness: 0.82 }),
      plaster: M.surface('intPlaster', 'plaster', { repeat: 6, roughness: 0.86, color: 0xf2e9d6 }),
      timber: M.surface('intTimber', 'paintedTimber', { repeat: 2, roughness: 0.72 }),
      iron: M.solid('intIron', { color: 0x24262b, roughness: 0.52, metalness: 0.6 }),
      brass: M.solid('intBrass', { color: 0xc9a04b, roughness: 0.28, metalness: 0.9 }),
      marble: M.surface('intMarble', 'marble', { repeat: 6, roughness: 0.14, metalness: 0.05 }),
      glassInt: M.glass('intGlass', { color: 0xd0e4ec, opacity: 0.22, roughness: 0.06, exterior: false })
    };
    this.palette.lampGlow = M.solid('intLampGlow', {
      color: 0x3a2f1e, roughness: 0.4, emissive: 0xffc27a, emissiveIntensity: 2.6
    });
    this.palette.caustic = (() => {
      const set = M.tex.get('caustics');
      const mat = new THREE.MeshBasicMaterial({
        map: set.map, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      });
      mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(3, 3);
      return mat;
    })();

    M.registerInteriorPalette(this.palette);

    this.roomWaterArrivalHall(A);
    this.roomMarketLoggia(A);
    this.roomCanalsidePromenade(A);
    this.roomMezzanineOverlook(A);
    this.roomTransferLobby(A);
  },

  /* ---------------- B2 — Water Arrival Hall ---------------- */

  /**
   * "Arriving by boat, you enter a dim, stone barrel-vaulted hall where
   * rippling canal water throws animated caustic light across the ceiling."
   */
  roomWaterArrivalHall(A) {
    const P = this.palette;
    const y = LEVELS.B2;
    const room = this.room({
      name: 'B2 Water Arrival Hall', level: 'B2',
      center: [0, y + 4.2, 78], size: [46, 9, 40],
      acoustic: A.STONE_VAULT, range: 130
    });

    room.lazy((r) => {
      const shell = roomShell(46, 8.4, 40, { open: ['+z'], center: [0, y, 78] });
      r.group.add(mesh(mergeGeometries(shell.floor), P.limestone, { name: 'Floor', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.walls), P.vault, { name: 'Walls', receive: true }));

      /* Barrel vaults: one extruded arch profile swept along three bays,
         exactly as D.1's modelling note asks. */
      const profile = archShape(13.2, 3.0, 4.6, 0.7);
      const vaultParts = [];
      for (let bay = -1; bay <= 1; bay++) {
        const g = new THREE.ExtrudeGeometry(profile, {
          depth: 38, bevelEnabled: false, curveSegments: 14
        });
        g.rotateY(Math.PI / 2);
        vaultParts.push(xform(g, { pos: [bay * 14.6, y, 78 - 19] }));
      }
      // Transverse arches between the bays.
      for (const x of [-7.3, 7.3]) {
        for (let i = 0; i < 4; i++) {
          const z = 78 - 15 + i * 10;
          const g = new THREE.ExtrudeGeometry(archShape(13.0, 3.0, 4.4, 0.55), {
            depth: 1.1, bevelEnabled: false, curveSegments: 12
          });
          vaultParts.push(xform(g, { pos: [x, y, z] }));
        }
      }
      r.group.add(mesh(mergeGeometries(vaultParts), P.vault, { name: 'BarrelVaults', receive: true }));

      /* Exposed timber tie-beams in muted ochre / venetian red. */
      const beams = [];
      for (let i = 0; i < 7; i++) {
        const z = 78 - 18 + i * 6;
        beams.push(box(44, 0.42, 0.5, [0, y + 5.6, z]));
        beams.push(box(0.4, 0.4, 1.6, [-21.5, y + 5.9, z]));
        beams.push(box(0.4, 0.4, 1.6, [21.5, y + 5.9, z]));
      }
      r.group.add(mesh(mergeGeometries(beams), P.timber, { name: 'TimberTieBeams', cast: true }));

      /* Prop 1 — animated caustics thrown across the vault soffits. */
      const caustic = causticPlane(44, 38, P.caustic);
      caustic.position.set(0, y + 7.3, 78);
      r.group.add(caustic);
      const cm = P.caustic.map;
      r.addProp({
        name: 'Caustic light',
        update(dt) {
          cm.offset.x += dt * 0.021;
          cm.offset.y += dt * 0.013;
          P.caustic.opacity = 0.32 + Math.sin(performance.now() * 0.00042) * 0.12;
        }
      });

      /* Prop 2 — the arrival water: a strip of canal reaching into the hall. */
      const inletMat = this.waterMaterial;
      const inlet = new THREE.PlaneGeometry(18, 22, 12, 12);
      inlet.rotateX(-Math.PI / 2);
      r.group.add(mesh(xform(inlet, { pos: [0, CANAL.waterLevel + 0.15, 88] }), inletMat, {
        name: 'ArrivalInlet', renderOrder: 2
      }));

      /* Stone mooring edge and brass cleats. */
      const edge = [];
      for (const sx of [-1, 1]) edge.push(box(6, 1.0, 22, [sx * 12, y - 0.5, 88]));
      edge.push(box(30, 1.0, 5, [0, y - 0.5, 99]));
      r.group.add(mesh(mergeGeometries(edge), P.limestone, { name: 'MooringEdge', receive: true }));
      const cleatGeo = mergeGeometries([cyl(0.13, 0.15, 0.42, 8, [0, 0.21, 0]),
        cyl(0.09, 0.09, 0.62, 8, [0, 0.46, 0], [Math.PI / 2, 0, 0])]);
      const cleats = [];
      for (let i = 0; i < 8; i++) {
        cleats.push({ pos: [-9 + (i % 4) * 6, y + 0.05, i < 4 ? 80 : 96] });
      }
      r.group.add(instance(cleatGeo, P.brass, cleats, { name: 'BrassCleats' }));

      /* Wrought-iron lantern pendants at ~2700 K. */
      const pend = lanternPendant(1.5);
      const bodies = [], glasses = [];
      for (let i = 0; i < 12; i++) {
        const x = -18 + (i % 4) * 12;
        const z = 78 - 12 + Math.floor(i / 4) * 12;
        bodies.push({ pos: [x, y + 7.0, z] });
        glasses.push({ pos: [x, y + 7.0, z] });
      }
      r.group.add(instance(pend.body, P.iron, bodies, { name: 'LanternIron' }));
      r.group.add(instance(pend.glass, P.lampGlow, glasses, { name: 'LanternGlass' }));
      for (let i = 0; i < 4; i++) {
        roomLight(r, 0xffb877, 26, 26, [-16 + i * 11, y + 4.6, 78]);
      }

      /* Prop 3 — a swing door through to the Market Loggia stair. */
      const door = swingDoor(1.4, 2.6);
      const doorMesh = mesh(door.geometry, P.timber, { name: 'DoorLeaf' });
      door.pivot.add(doorMesh);
      door.pivot.position.set(-6.6, y, 58.3);
      r.group.add(door.pivot);
      r.group.add(mesh(mergeGeometries([
        box(0.3, 2.9, 0.4, [-6.9, y + 1.45, 58.3]),
        box(0.3, 2.9, 0.4, [-4.7, y + 1.45, 58.3]),
        box(2.5, 0.3, 0.4, [-5.8, y + 2.9, 58.3])
      ]), P.limestone, { name: 'DoorSurround' }));
      r.addProp({ name: 'Arrival hall door', update: (dt) => door.update(dt) });
    });
  },

  /* ---------------- B1 — Market Loggia ---------------- */

  /** "The Market Loggia opens into a colonnaded arcade lined with
      striped-awning stalls" — reclaimed herringbone brick underfoot. */
  roomMarketLoggia(A) {
    const P = this.palette;
    const M = this.materials;
    const y = LEVELS.B1;
    const room = this.room({
      name: 'B1 Market Loggia', level: 'B1',
      center: [0, y + 3.2, 40], size: [62, 7, 52],
      acoustic: A.STONE_VAULT, range: 140
    });

    room.lazy((r) => {
      const shell = roomShell(62, 6.2, 52, { open: ['+z'], center: [0, y, 40] });
      r.group.add(mesh(mergeGeometries(shell.floor), P.brick, { name: 'HerringboneFloor', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.walls), P.plaster, { name: 'Walls', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.ceiling), P.vault, { name: 'Ceiling' }));

      /* The colonnade that gives the loggia its name. */
      const colGeo = mergeGeometries([
        cyl(0.42, 0.5, 4.6, 12, [0, 2.3, 0]),
        cyl(0.62, 0.5, 0.36, 12, [0, 4.78, 0]),
        box(1.4, 0.3, 1.4, [0, 5.1, 0]),
        box(1.3, 0.24, 1.3, [0, 0.12, 0])
      ]);
      const cols = [];
      for (let i = 0; i < 8; i++) {
        for (const sx of [-1, 1]) {
          cols.push({ pos: [sx * 17, y, 20 + i * 5.6] });
        }
      }
      r.group.add(instance(colGeo, P.limestone, cols, { name: 'LoggiaColonnade', castShadow: true }));

      /* Cross-vaults springing from the colonnade. */
      const vaults = [];
      const profile = archShape(9.2, 2.6, 3.0, 0.5);
      for (let i = 0; i < 8; i++) {
        const g = new THREE.ExtrudeGeometry(profile, { depth: 4.4, bevelEnabled: false, curveSegments: 10 });
        vaults.push(xform(g, { pos: [0, y + 0.4, 18 + i * 5.6] }));
      }
      r.group.add(mesh(mergeGeometries(vaults), P.vault, { name: 'LoggiaVaults' }));

      /* Prop 1 — striped-awning market stalls with produce crates. */
      const awnA = M.surface('intAwningA', 'awningStripe', {
        repeat: 1, roughness: 0.88, side: THREE.DoubleSide, opts: { a: 0xf6efdd, b: 0xa33f36 }
      });
      const awnB = M.surface('intAwningB', 'awningStripe', {
        repeat: 1, roughness: 0.88, side: THREE.DoubleSide, opts: { a: 0xf6efdd, b: 0x2f6072 }
      });
      const awnGeo = (() => {
        const g = new THREE.PlaneGeometry(3.0, 2.0, 4, 3);
        g.rotateX(-Math.PI / 2.3);
        g.translate(0, 2.4, -0.8);
        return g;
      })();
      const tblGeo = mergeGeometries([
        box(2.8, 0.1, 1.3, [0, 0.92, 0]),
        box(0.1, 0.92, 0.1, [-1.3, 0.46, -0.55]), box(0.1, 0.92, 0.1, [1.3, 0.46, -0.55]),
        box(0.1, 0.92, 0.1, [-1.3, 0.46, 0.55]), box(0.1, 0.92, 0.1, [1.3, 0.46, 0.55]),
        box(0.6, 0.35, 0.5, [-0.8, 1.15, 0]), box(0.55, 0.3, 0.45, [0.7, 1.12, 0.1])
      ]);
      const sA = [], sB = [], tbl = [];
      for (let i = 0; i < 6; i++) {
        for (const sx of [-1, 1]) {
          const e = { pos: [sx * 22, y, 22 + i * 6.6], rot: [0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0] };
          (i % 2 ? sB : sA).push(e);
          tbl.push(e);
        }
      }
      r.group.add(instance(awnGeo, awnA, sA, { name: 'StallAwningsA', castShadow: true }));
      r.group.add(instance(awnGeo, awnB, sB, { name: 'StallAwningsB', castShadow: true }));
      r.group.add(instance(tblGeo, P.timber, tbl, { name: 'StallTables', castShadow: true }));

      /* Prop 2 — uplighting under the vault arches that breathes gently. */
      const upGeo = cyl(0.14, 0.14, 0.06, 10, [0, 0, 0]);
      const ups = [];
      for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) ups.push({ pos: [sx * 16, y + 0.1, 20 + i * 5.6] });
      r.group.add(instance(upGeo, P.lampGlow, ups, { name: 'VaultUplights' }));
      const lights = [];
      for (let i = 0; i < 4; i++) lights.push(roomLight(r, 0xffc98d, 22, 24, [0, y + 4.4, 22 + i * 9]));
      r.addProp({
        name: 'Vault uplighting',
        update(dt, t) {
          const k = 1 + Math.sin(performance.now() * 0.0006) * 0.06;
          for (const l of lights) l.intensity = 22 * k;
        }
      });

      /* Prop 3 — wrought-iron café furniture, some of it occupied-looking. */
      const chGeo = chair(0.44, 0.84);
      const tGeo = lowTable(0.42, 0.68);
      const chairs = [], tables = [];
      const rr = rng(88);
      for (let i = 0; i < 7; i++) {
        const z = 22 + i * 6.2;
        tables.push({ pos: [0, y, z] });
        for (let k = 0; k < 3; k++) {
          const a = rr() * TAU;
          chairs.push({ pos: [Math.cos(a) * 1.0, y, z + Math.sin(a) * 1.0], rot: [0, -a + Math.PI / 2, 0] });
        }
      }
      const chairMesh = instance(chGeo, P.iron, chairs, { name: 'CafeChairs', castShadow: true });
      r.group.add(chairMesh);
      r.group.add(instance(tGeo, P.iron, tables, { name: 'CafeTables', castShadow: true }));

      /* Prop 3 — the stall awnings breathe in the draught off the canal. */
      const awnMeshes = [
        instance(awnGeo, awnA, sA, { name: 'StallAwningsA2' }),
        instance(awnGeo, awnB, sB, { name: 'StallAwningsB2' })
      ];
      r.addProp({
        name: 'Stall awnings',
        update() {
          const k = Math.sin(performance.now() * 0.0016) * 0.02;
          for (const m of [r.group.getObjectByName('StallAwningsA'), r.group.getObjectByName('StallAwningsB')]) {
            if (m) m.rotation.x = k;
          }
        }
      });

      /* Prop 4 — a market shutter that rolls up and down on a slow cycle. */
      const shutter = new THREE.Group();
      shutter.name = 'MarketShutter';
      const shutterMesh = mesh(box(3.2, 2.6, 0.08, [0, -1.3, 0]), P.iron, { name: 'ShutterLeaf' });
      shutter.add(shutterMesh);
      shutter.position.set(-30.6, y + 4.0, 40);
      shutter.rotation.y = Math.PI / 2;
      r.group.add(shutter);
      let st = 0;
      r.addProp({
        name: 'Market shutter',
        update(dt) {
          st += dt;
          const c = st % 16;
          const k = c < 2 ? smoothstep(c / 2) : c < 9 ? 1 : c < 11 ? 1 - smoothstep((c - 9) / 2) : 0;
          shutterMesh.scale.y = Math.max(0.06, 1 - k * 0.92);
        }
      });
    });
  },

  /* ---------------- L1 — Canalside Promenade Interior ---------------- */

  /** "The Canalside Promenade runs along the water's edge with café seating
      under the arches." */
  roomCanalsidePromenade(A) {
    const P = this.palette;
    const y = LEVELS.L1;
    const room = this.room({
      name: 'L1 Canalside Promenade Interior', level: 'L1',
      center: [0, y + 3.0, 66], size: [56, 7, 34],
      acoustic: A.STONE_VAULT, range: 130
    });

    room.lazy((r) => {
      const shell = roomShell(56, 6.0, 34, { open: ['+z'], center: [0, y, 66] });
      r.group.add(mesh(mergeGeometries(shell.floor), P.limestone, { name: 'Floor', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.walls), P.plaster, { name: 'Walls', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.ceiling), P.timber, { name: 'TimberCeiling' }));

      /* Arched openings onto the canal. */
      const arches = [];
      const profile = archShape(4.2, 2.9, 2.1, 0.6);
      for (let i = 0; i < 7; i++) {
        const g = new THREE.ExtrudeGeometry(profile, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
        arches.push(xform(g, { pos: [-21 + i * 7, y, 82.4] }));
      }
      r.group.add(mesh(mergeGeometries(arches), P.limestone, { name: 'PromenadeArches', cast: true }));

      /* Exposed ceiling joists. */
      const joists = [];
      for (let i = 0; i < 14; i++) joists.push(box(54, 0.28, 0.34, [0, y + 5.6, 50 + i * 2.4]));
      r.group.add(mesh(mergeGeometries(joists), P.timber, { name: 'CeilingJoists' }));

      /* Prop 1 — café seating that reads as occupied. */
      const chGeo = chair(0.44, 0.84);
      const tGeo = lowTable(0.46, 0.7);
      const chairs = [], tables = [];
      const rr = rng(191);
      for (let i = 0; i < 8; i++) {
        const x = -21 + i * 6;
        tables.push({ pos: [x, y, 76] });
        const n = 2 + Math.floor(rr() * 2);
        for (let k = 0; k < n; k++) {
          const a = rr() * TAU;
          chairs.push({ pos: [x + Math.cos(a) * 1.05, y, 76 + Math.sin(a) * 1.05], rot: [0, -a + Math.PI / 2, 0] });
        }
      }
      r.group.add(instance(tGeo, P.iron, tables, { name: 'CafeTables', castShadow: true }));
      r.group.add(instance(chGeo, P.iron, chairs, { name: 'CafeChairs', castShadow: true }));

      /* Prop 2 — pendant lanterns along the water's edge that sway a little. */
      const pend = lanternPendant(1.1);
      const bodies = [], glasses = [];
      for (let i = 0; i < 8; i++) bodies.push({ pos: [-21 + i * 6, y + 5.4, 80] });
      for (const b of bodies) glasses.push({ pos: b.pos });
      const ironMesh = instance(pend.body, P.iron, bodies, { name: 'PendantIron' });
      const glassMesh = instance(pend.glass, P.lampGlow, glasses, { name: 'PendantGlass' });
      r.group.add(ironMesh, glassMesh);
      for (let i = 0; i < 3; i++) roomLight(r, 0xffbe84, 20, 22, [-14 + i * 14, y + 4.0, 76]);
      r.addProp({
        name: 'Swaying lanterns',
        update(dt, t) {
          const k = Math.sin(performance.now() * 0.0011) * 0.03;
          ironMesh.rotation.z = k; glassMesh.rotation.z = k;
        }
      });

      /* Prop 3 — a planter run that marks the promenade's edge. */
      const pl = planter(2.6, 0.7, 0.5);
      const tubs = [], leaves = [];
      for (let i = 0; i < 6; i++) { const e = { pos: [-19 + i * 7.6, y, 71] }; tubs.push(e); leaves.push(e); }
      r.group.add(instance(pl.tub, P.limestone, tubs, { name: 'PlanterTubs' }));
      const foliageMesh = instance(pl.foliage,
        this.materials.surface('intFoliage', 'foliage', { repeat: 1, roughness: 0.9 }),
        leaves, { name: 'PlanterFoliage', castShadow: true });
      r.group.add(foliageMesh);

      /* Prop 3 — a café door onto the promenade, and the awning above it. */
      const door = swingDoor(1.2, 2.4);
      door.pivot.add(mesh(door.geometry, P.timber, { name: 'DoorLeaf' }));
      door.pivot.position.set(8.4, y, 49.4);
      r.group.add(door.pivot);
      r.addProp({ name: 'Café door', update: (dt) => door.update(dt) });
    });
  },

  /* ---------------- L2 — Mezzanine Overlook ---------------- */

  /** "A glass-balustraded mezzanine looks back down over the canal." */
  roomMezzanineOverlook(A) {
    const P = this.palette;
    const y = LEVELS.L2;
    const room = this.room({
      name: 'L2 Mezzanine Overlook', level: 'L2',
      center: [0, y + 2.9, 58], size: [48, 6.5, 32],
      acoustic: A.PADDED_LOUNGE, range: 120
    });

    room.lazy((r) => {
      const shell = roomShell(48, 5.8, 32, { open: ['+z'], center: [0, y, 58] });
      r.group.add(mesh(mergeGeometries(shell.floor), P.limestone, { name: 'Floor', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.walls), P.plaster, { name: 'Walls', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.ceiling), P.plaster, { name: 'Ceiling' }));

      /* The glass balustrade the space is named for. */
      const rail = [];
      for (let i = 0; i <= 24; i++) rail.push([-23 + i * (46 / 24), y, 73.6]);
      r.group.add(mesh(glassRail(rail, 1.15), P.glassInt, { name: 'GlassBalustrade', renderOrder: 4 }));
      r.group.add(mesh(balustrade(rail.map(p => [p[0], p[1] + 1.14, p[2]]), 0.05, 3, 0.03, 0.05), P.brass,
        { name: 'BrassHandrail' }));

      /* Lounge terrace furniture. */
      const sofaGeo = sofa(2.2, 0.9);
      const podGeo = seatPod();
      const tblGeo = lowTable(0.55, 0.4);
      const leatherMat = this.materials.solid('intLeatherCream', { color: 0xd9cdb6, roughness: 0.62 });
      const sofas = [], pods = [], tbls = [];
      for (let i = 0; i < 4; i++) {
        const x = -18 + i * 12;
        sofas.push({ pos: [x, y, 62], rot: [0, Math.PI, 0] });
        tbls.push({ pos: [x, y, 64.4] });
        pods.push({ pos: [x - 1.6, y, 66.6], rot: [0, 0.3, 0] });
        pods.push({ pos: [x + 1.6, y, 66.6], rot: [0, -0.3, 0] });
      }
      r.group.add(instance(sofaGeo, leatherMat, sofas, { name: 'LoungeSofas', castShadow: true }));
      r.group.add(instance(podGeo, leatherMat, pods, { name: 'LoungePods', castShadow: true }));
      r.group.add(instance(tblGeo, P.marble, tbls, { name: 'LoungeTables', castShadow: true }));

      /* Prop 1 — cove lighting that dims and lifts with a slow cycle. */
      const cove = [];
      for (const sx of [-1, 1]) cove.push(box(0.14, 0.08, 30, [sx * 23.4, y + 5.3, 58]));
      cove.push(box(46, 0.08, 0.14, [0, y + 5.3, 43.2]));
      const coveMesh = mesh(mergeGeometries(cove), P.lampGlow, { name: 'CoveLighting' });
      r.group.add(coveMesh);
      const lights = [roomLight(r, 0xffd2a0, 26, 30, [-12, y + 4.4, 58]),
        roomLight(r, 0xffd2a0, 26, 30, [12, y + 4.4, 58])];
      r.addProp({
        name: 'Cove lighting cycle',
        update() {
          const k = 0.86 + Math.sin(performance.now() * 0.00035) * 0.14;
          for (const l of lights) l.intensity = 26 * k;
        }
      });

      /* Prop 2 — a caustic wash reflected up onto the mezzanine soffit. */
      const caustic = causticPlane(44, 26, P.caustic);
      caustic.position.set(0, y + 5.5, 64);
      caustic.rotation.x = Math.PI;
      r.group.add(caustic);
      r.addProp({ name: 'Reflected caustics', update: () => {} });

      /* Prop 3 — a service door into the back-of-house. */
      const door = swingDoor(1.1, 2.3);
      door.pivot.add(mesh(door.geometry, P.timber, { name: 'DoorLeaf' }));
      door.pivot.position.set(-16, y, 42.4);
      r.group.add(door.pivot);
      r.addProp({ name: 'Service door', update: (dt) => door.update(dt) });
    });
  },

  /* ---------------- L3 — Tower Transfer Lobby ---------------- */

  /** "The sequence ends at a marble-and-brass Transfer Lobby where the
      canal's rustic warmth gives way to the sleek glass of the Sail Atrium." */
  roomTransferLobby(A) {
    const P = this.palette;
    const y = LEVELS.L3;
    const room = this.room({
      name: 'L3 Tower Transfer Lobby', level: 'L3',
      center: [0, y + 3.0, 20], size: [64, 7, 56],
      acoustic: A.MARBLE_HALL, range: 150
    });

    room.lazy((r) => {
      const shell = roomShell(64, 6.0, 56, { open: [], center: [0, y, 20] });
      r.group.add(mesh(mergeGeometries(shell.floor), P.marble, { name: 'MarbleFloor', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.walls), P.marble, { name: 'MarbleWalls', receive: true }));
      r.group.add(mesh(mergeGeometries(shell.ceiling), P.plaster, { name: 'Ceiling' }));

      /* Brass inlay bands in the marble floor, and a compass medallion. */
      const inlay = [];
      for (let i = 0; i < 5; i++) inlay.push(box(60, 0.02, 0.16, [0, y + 0.03, 0 + i * 10]));
      for (let i = 0; i < 5; i++) inlay.push(box(0.16, 0.02, 52, [-24 + i * 12, y + 0.03, 20]));
      const med = new THREE.RingGeometry(2.6, 3.0, 40);
      med.rotateX(-Math.PI / 2);
      inlay.push(xform(med, { pos: [0, y + 0.035, 20] }));
      const med2 = new THREE.RingGeometry(1.2, 1.4, 40);
      med2.rotateX(-Math.PI / 2);
      inlay.push(xform(med2, { pos: [0, y + 0.035, 20] }));
      r.group.add(mesh(mergeGeometries(inlay), P.brass, { name: 'BrassInlay' }));

      /* Prop 1 — the elevator bank into the Sail Atrium, doors cycling. */
      const bankMat = P.brass;
      const bank = [];
      for (let i = 0; i < 5; i++) {
        const x = -20 + i * 10;
        bank.push(box(2.6, 3.0, 0.3, [x, y + 1.5, -6.2]));
        bank.push(box(3.0, 0.24, 0.42, [x, y + 3.1, -6.2]));
      }
      r.group.add(mesh(mergeGeometries(bank), bankMat, { name: 'ElevatorSurrounds' }));

      const doorGeoCache = elevatorDoors(2.2, 2.8);
      const lifts = [];
      for (let i = 0; i < 5; i++) {
        const x = -20 + i * 10;
        const d = elevatorDoors(2.2, 2.8, { period: 9 + i * 1.3 });
        const gL = d.geometry.clone(); gL.scale(-1, 1, 1);
        d.left.geometry = gL;
        d.left.material = P.brass;
        d.right.geometry = d.geometry;
        d.right.material = P.brass;
        d.group.position.set(x, y, -6.0);
        r.group.add(d.group);
        lifts.push(d);
      }
      r.addProp({
        name: 'Elevator bank',
        update(dt) { for (const l of lifts) l.update(dt); }
      });

      /* Prop 2 — a concierge desk with a brass rail. */
      r.group.add(mesh(receptionDesk(5.4, 1.0, 1.06), P.marble, {
        name: 'ConciergeDesk', pos: [0, y, 32], cast: true
      }));
      r.group.add(mesh(box(5.6, 0.08, 0.08, [0, y + 1.22, 31.4]), P.brass, { name: 'DeskRail' }));

      /* Seating and planting. */
      const leather = this.materials.solid('intLeatherTan', { color: 0xc8b492, roughness: 0.58 });
      const pods = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        pods.push({ pos: [Math.cos(a) * 7, y, 20 + Math.sin(a) * 7], rot: [0, -a + Math.PI / 2, 0] });
      }
      r.group.add(instance(seatPod(1.0, 0.95, 0.8), leather, pods, { name: 'LobbySeating', castShadow: true }));

      /* Prop 3 — a chandelier of suspended brass rods that rotates slowly. */
      const chand = new THREE.Group();
      chand.name = 'BrassChandelier';
      const rods = [];
      const rr = rng(404);
      for (let i = 0; i < 90; i++) {
        const a = rr() * TAU;
        const rad = Math.sqrt(rr()) * 4.2;
        const len = 0.6 + rr() * 2.4;
        rods.push(cyl(0.022, 0.022, len, 5, [Math.cos(a) * rad, -len / 2 - rr() * 1.4, Math.sin(a) * rad]));
      }
      chand.add(mesh(mergeGeometries(rods), P.brass, { name: 'Rods' }));
      chand.add(mesh(cyl(4.4, 4.4, 0.12, 32, [0, 0.1, 0]), P.lampGlow, { name: 'ChandelierPlate' }));
      chand.position.set(0, y + 5.5, 20);
      r.group.add(chand);
      roomLight(r, 0xffe0b8, 60, 40, [0, y + 4.6, 20]);
      roomLight(r, 0xfff0d8, 26, 26, [0, y + 3.0, 32]);
      r.addProp({
        name: 'Brass chandelier',
        update(dt) { chand.rotation.y += dt * 0.045; }
      });
    });
  }
});
