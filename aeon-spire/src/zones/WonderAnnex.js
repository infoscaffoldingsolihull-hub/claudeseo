/**
 * ZONE 7 — THE WONDER ANNEX (low-rise entertainment cluster)
 *
 * Three pavilions and a show plaza. Section A's IP-safety rule governs this
 * zone above all others: the motorsport pavilion is a generic aerodynamic
 * speed form with an unbranded concept-vehicle silhouette, the block
 * pavilion uses generic oversized modular blocks in primary colours, and the
 * promenade is an original themed street. No marque, logo or character
 * appears anywhere.
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { ANNEX } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, mesh, instance, member, tube,
  surfaceGrid, thicken, waterPlane, balustrade, loft, circleRing, flag
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng, smoothstep } from '../core/MathUtil.js';
import {
  roomShell, remapUV, table, chair, bench, stool, planter, plaque, signPanel,
  rotatingPlinth, simulatorPod, conceptVehicle, tieredSeating, blockSeat,
  roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { glassBalustrade as glassAnnexRail } from '../world/BuildKit.js';

export class WonderAnnex extends Zone {
  constructor(ctx) {
    super('annex', 'The Wonder Annex', ctx);
    this.appearsAtMilestone = 9;
  }

  get radius() { return 300; }

  massing() {
    this.buildMotorsportPavilion();
    this.buildBlockPavilion();
    this.buildPromenade();
    this.buildShowPlaza();
  }

  /**
   * A curved "speed form": a low, teardrop shell whose roof sweeps from a
   * high leading edge down to a long tail. Built as a parametric surface so
   * the curvature is genuine rather than a chamfered box.
   */
  buildMotorsportPavilion() {
    const M = this.materials;
    const P = ANNEX.motorsport;

    const shellMat = M.surface('motorShell', 'brushedMetal', {
      repeat: 6, roughness: 0.24, metalness: 0.78, exterior: true, color: 0xc2c7cd
    });
    const glassMat = M.glass('motorGlass', {
      color: 0x233240, opacity: 0.42, roughness: 0.06, metalness: 0.3
    });

    /* The shell: u sweeps along the length, v wraps over the section. */
    const shell = surfaceGrid((u, v, o) => {
      const zLocal = (u - 0.5) * P.d;
      // Plan half-width tapers to a point at the tail.
      const halfW = (P.w / 2) * Math.pow(Math.sin(Math.PI * Math.min(u * 1.12, 1)), 0.62);
      // Section: a half-ellipse whose height peaks forward of centre.
      const hMax = P.h * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(u, 0.78)));
      const a = v * Math.PI;
      const x = Math.cos(a) * halfW;
      const y = Math.sin(a) * hMax;
      o.set(x, y, zLocal);
    }, 46, 20, { uvScale: [8, 3] });
    shell.rotateY(P.rot);
    shell.translate(P.x, 0.2, P.z);
    const shellMesh = mesh(shell, shellMat, { name: 'MotorsportShell', cast: true, receive: true });
    shellMesh.material.side = THREE.DoubleSide;
    this.shell.add(shellMesh);

    /* A continuous glazed band cut into the flank. */
    const band = surfaceGrid((u, v, o) => {
      const zLocal = (u - 0.5) * P.d * 0.86;
      const halfW = (P.w / 2) * Math.pow(Math.sin(Math.PI * Math.min(u * 1.12, 1)), 0.62) * 1.004;
      const hMax = P.h * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(u, 0.78)));
      const a = lerp(0.10, 0.30, v) * Math.PI;
      o.set(Math.cos(a) * halfW, Math.sin(a) * hMax, zLocal);
    }, 40, 4, { uvScale: [6, 1] });
    const band2 = band.clone();
    band2.scale(-1, 1, 1);
    const glazing = mergeGeometries([band, band2]);
    glazing.rotateY(P.rot);
    glazing.translate(P.x, 0.2, P.z);
    this.shell.add(mesh(glazing, glassMat, { name: 'MotorsportGlazing', renderOrder: 4 }));

    /* Plinth apron. */
    const apronMat = M.surface('motorApron', 'paving', {
      repeat: 12, roughness: 0.6, exterior: true, color: 0x8f939a
    });
    const apron = new THREE.CircleGeometry(P.w * 0.78, 40);
    apron.rotateX(-Math.PI / 2);
    apron.scale(1, 1, 0.72);
    this.shell.add(mesh(xform(apron, { pos: [P.x, 0.08, P.z], rot: [0, P.rot, 0] }), apronMat, {
      name: 'MotorsportApron', receive: true
    }));
  }

  /**
   * The modular-block creative pavilion. Oversized generic blocks — a
   * rounded stud on top of a rectangular body — stacked into the facade.
   */
  buildBlockPavilion() {
    const M = this.materials;
    const P = ANNEX.blocks;

    /* One reusable block: body + four studs. */
    const unit = 5.2;
    const blockGeo = (w, d) => {
      const parts = [box(unit * w - 0.22, unit * 0.62, unit * d - 0.22, [0, unit * 0.31, 0])];
      for (let i = 0; i < w; i++) {
        for (let k = 0; k < d; k++) {
          parts.push(cyl(unit * 0.17, unit * 0.17, unit * 0.14, 12, [
            (i - (w - 1) / 2) * unit, unit * 0.69, (k - (d - 1) / 2) * unit
          ]));
        }
      }
      return mergeGeometries(parts);
    };
    const geo2x2 = blockGeo(2, 2);
    const geo2x1 = blockGeo(2, 1);
    const geo1x1 = blockGeo(1, 1);

    const palette = [
      { key: 'blockRed', hex: 0xd8352a }, { key: 'blockBlue', hex: 0x1f63c4 },
      { key: 'blockYellow', hex: 0xf0b400 }, { key: 'blockGreen', hex: 0x2f9c46 },
      { key: 'blockWhite', hex: 0xe8e6e0 }
    ];
    const mats = palette.map(p => M.surface(p.key, 'primaryResin', {
      repeat: 1, roughness: 0.34, exterior: true, opts: { hex: p.hex }, color: 0xffffff
    }));

    const r = rng(1212);
    const buckets = palette.map(() => ({ big: [], mid: [], small: [] }));

    /* Stack the walls out of blocks, leaving a doorway on the +Z face. */
    const cols = Math.round(P.w / unit);
    const rowsH = Math.round(P.h / (unit * 0.72));
    for (let side = 0; side < 4; side++) {
      const ang = side * Math.PI / 2;
      const nx = Math.cos(ang), nz = Math.sin(ang);
      for (let row = 0; row < rowsH; row++) {
        const y = row * unit * 0.72;
        const stagger = (row % 2) * unit * 0.5;
        for (let c = 0; c < cols; c++) {
          const along = (c - (cols - 1) / 2) * unit + stagger;
          if (Math.abs(along) > P.w / 2 - unit * 0.4) continue;
          // Doorway on the +Z face.
          if (side === 1 && Math.abs(along) < unit * 1.6 && row < 3) continue;
          // Window punches.
          if (row > 1 && row < rowsH - 1 && (c + row) % 5 === 0) continue;
          const px = P.x + nx * (P.w / 2) - nz * along;
          const pz = P.z + nz * (P.d / 2) + nx * along;
          const pick = Math.floor(r() * palette.length) % palette.length;
          const size = r();
          const b = buckets[pick];
          const entry = { pos: [px, y, pz], rot: [0, -ang, 0] };
          if (size > 0.72) b.big.push(entry);
          else if (size > 0.36) b.mid.push(entry);
          else b.small.push(entry);
        }
      }
    }
    for (let i = 0; i < palette.length; i++) {
      const b = buckets[i];
      if (b.big.length) this.shell.add(instance(geo2x2, mats[i], b.big, { name: 'Block2x2_' + i, castShadow: true, receiveShadow: true }));
      if (b.mid.length) this.shell.add(instance(geo2x1, mats[i], b.mid, { name: 'Block2x1_' + i, castShadow: true, receiveShadow: true }));
      if (b.small.length) this.shell.add(instance(geo1x1, mats[i], b.small, { name: 'Block1x1_' + i, castShadow: true, receiveShadow: true }));
    }

    /* Roof and floor slabs. */
    const slabMat = M.solid('blockSlab', { color: 0xd9d6cf, roughness: 0.7, exterior: true });
    this.shell.add(mesh(mergeGeometries([
      box(P.w + 2.4, 0.8, P.d + 2.4, [P.x, P.h + 0.4, P.z]),
      box(P.w + 3.2, 0.5, P.d + 3.2, [P.x, 0.15, P.z])
    ]), slabMat, { name: 'BlockPavilionSlabs', cast: true, receive: true }));

    /* A big skylight so the maker space reads as daylit. */
    const glass = M.glass('blockSkylight', { color: 0xd6e6ee, opacity: 0.2, roughness: 0.08 });
    this.shell.add(mesh(box(P.w * 0.5, 0.2, P.d * 0.5, [P.x, P.h + 0.85, P.z]), glass, {
      name: 'BlockSkylight', renderOrder: 4
    }));
  }

  /**
   * The themed promenade: a straight arcade street under a full glass
   * barrel vault, with shopfronts along both sides and a tiered gallery at
   * the plaza end.
   */
  buildPromenade() {
    const M = this.materials;
    const P = ANNEX.promenade;
    const halfL = P.length / 2, halfW = P.width / 2;

    /* Shopfront blocks either side. */
    const wallMat = M.surface('promWall', 'plaster', {
      repeat: 12, roughness: 0.8, exterior: true, color: 0xe3d9c6
    });
    const walls = [];
    for (const side of [-1, 1]) {
      walls.push(box(3.2, P.height - 3, P.length, [P.x + side * (halfW + 1.6), (P.height - 3) / 2, P.z]));
      // Cornice.
      walls.push(box(4.4, 0.9, P.length + 1.2, [P.x + side * (halfW + 1.6), P.height - 3 + 0.45, P.z]));
    }
    // End walls with a large opening.
    walls.push(box(P.width + 6.4, 2.2, 1.4, [P.x, P.height - 2.4, P.z - halfL]));
    walls.push(box(P.width + 6.4, 2.2, 1.4, [P.x, P.height - 2.4, P.z + halfL]));
    this.shell.add(mesh(mergeGeometries(walls), wallMat, { name: 'PromenadeWalls', cast: true, receive: true }));

    /* Glass barrel vault. */
    const vault = surfaceGrid((u, v, o) => {
      const z = P.z + (u - 0.5) * P.length;
      const a = v * Math.PI;
      o.set(P.x + Math.cos(a) * (halfW + 1.6), (P.height - 3) + Math.sin(a) * 5.6, z);
    }, 40, 16, { uvScale: [10, 2] });
    const glassMat = M.glass('promVault', {
      color: 0xd2e4ec, opacity: 0.2, roughness: 0.07, metalness: 0.08, side: THREE.DoubleSide
    });
    this.shell.add(mesh(vault, glassMat, { name: 'PromenadeVault', renderOrder: 4 }));

    /* Vault ribs — the barrel vault's structure, at regular bays. */
    const steelMat = M.surface('promSteel', 'paintedSteel', {
      repeat: 2, roughness: 0.42, metalness: 0.66, exterior: true, color: 0x9aa0a8,
      opts: { hex: 0x8d939b }
    });
    const ribs = [];
    for (let b = 0; b <= 14; b++) {
      const z = P.z - halfL + (b / 14) * P.length;
      const seg = 14;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
        ribs.push(member(
          [P.x + Math.cos(a0) * (halfW + 1.6), (P.height - 3) + Math.sin(a0) * 5.6, z],
          [P.x + Math.cos(a1) * (halfW + 1.6), (P.height - 3) + Math.sin(a1) * 5.6, z],
          0.22, 0.3));
      }
    }
    // Longitudinal purlins.
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      ribs.push(member(
        [P.x + Math.cos(a) * (halfW + 1.6), (P.height - 3) + Math.sin(a) * 5.6, P.z - halfL],
        [P.x + Math.cos(a) * (halfW + 1.6), (P.height - 3) + Math.sin(a) * 5.6, P.z + halfL],
        0.14, 0.14));
    }
    this.shell.add(mesh(mergeGeometries(ribs.filter(Boolean)), steelMat, {
      name: 'PromenadeVaultRibs', cast: true
    }));

    /* Street floor. */
    const tileMat = M.surface('promFloor', 'promenadeTile', {
      repeat: 14, roughness: 0.36, exterior: true
    });
    const floor = new THREE.PlaneGeometry(P.width + 3, P.length);
    floor.rotateX(-Math.PI / 2);
    this.shell.add(mesh(xform(floor, { pos: [P.x, 0.12, P.z] }), tileMat, {
      name: 'PromenadeFloor', receive: true
    }));
  }

  /**
   * The show plaza: a circular basin with fountain jets and a light rig,
   * overlooked by the promenade's tiered gallery. The nightly
   * light-and-water show animates here.
   */
  buildShowPlaza() {
    const M = this.materials;
    const S = ANNEX.showPlaza;

    const paveMat = M.surface('plazaPaving', 'paving', {
      repeat: 22, roughness: 0.62, exterior: true, color: 0xb9b6ae
    });
    const ring = new THREE.RingGeometry(S.basinRadius, S.radius + 26, 64, 2);
    ring.rotateX(-Math.PI / 2);
    this.shell.add(mesh(xform(ring, { pos: [S.x, 0.1, S.z] }), paveMat, {
      name: 'ShowPlazaPaving', receive: true
    }));

    /* Basin coping and water. */
    const stoneMat = M.surface('plazaCoping', 'limestone', {
      repeat: 8, roughness: 0.6, exterior: true, color: 0xd8d2c4
    });
    this.shell.add(mesh(
      loft(() => circleRing(S.basinRadius + 1.2, 64), [-0.2, 0.75], { capTop: true }),
      stoneMat, { name: 'ShowBasinCoping', cast: true, receive: true }
    ));

    const set = M.tex.get('waterNormal');
    const uniforms = { uTime: { value: 0 }, uRipple: { value: 0.6 } };
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x16323d, roughness: 0.06, metalness: 0.28,
      transparent: true, opacity: 0.9, normalMap: set.normalMap, envMapIntensity: 1.55
    });
    waterMat.normalScale = new THREE.Vector2(0.6, 0.6);
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uRipple = uniforms.uRipple;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uRipple;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float rr = length(position.xz);
          transformed.y += sin(rr * 1.4 - uTime * 3.0) * 0.05 * uRipple;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uRipple;')
        .replace('#include <normal_fragment_maps>', `
          vec3 mn = texture2D(normalMap, vNormalMapUv * 2.0 + vec2(uTime * 0.01, uTime * 0.013)).xyz * 2.0 - 1.0;
          mn.xy *= normalScale * (0.5 + uRipple);
          normal = normalize(tbn * normalize(mn));`);
    };
    waterMat.customProgramCacheKey = () => 'aeon-showwater';
    this.showWaterMaterial = waterMat;
    this.showWaterUniforms = uniforms;

    const g = new THREE.CircleGeometry(S.basinRadius, 64, 0, TAU);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.03, pos.getZ(i) * 0.03);
    this.shell.add(mesh(xform(g, { pos: [S.x, S.waterLevel, S.z] }), waterMat, {
      name: 'ShowBasinWater', renderOrder: 2
    }));

    this.addAnimator((dt, t) => { uniforms.uTime.value = t; });

    /* Flag masts dressing the plaza edge — wind-reactive (E.4). */
    const flagMat = M.solid('plazaFlag', {
      color: 0xd8d3c6, roughness: 0.86, side: THREE.DoubleSide, exterior: true, wind: true
    });
    const flagGeo = flag(11, 3.0);
    const fx = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      fx.push({ pos: [S.x + Math.cos(a) * (S.radius + 16), 0.2, S.z + Math.sin(a) * (S.radius + 16)], rot: [0, a, 0] });
    }
    this.shell.add(instance(flagGeo, flagMat, fx, { name: 'PlazaFlags', castShadow: true }));
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(WonderAnnex.prototype, {

  facade() {
    this.buildShopfronts();
    this.buildShowRig();
    this.buildMotorsportPortal();
  },

  /** Warm-lit shopfronts lining the promenade street (D.7). */
  buildShopfronts() {
    const M = this.materials;
    const P = ANNEX.promenade;
    const glassMat = M.glass('shopGlass', {
      color: 0xd8e4ea, opacity: 0.28, roughness: 0.07, metalness: 0.05
    });
    const glowMat = M.solid('shopGlow', {
      color: 0x3a3025, roughness: 0.6, emissive: 0xffca7a, emissiveIntensity: 0.35
    });
    M.registerNightEmissive(glowMat, 2.8);
    const frameMat = M.surface('shopFrame', 'paintedTimber', {
      repeat: 1, roughness: 0.6, exterior: true
    });

    const glass = [], glow = [], frames = [];
    const bays = 12;
    for (const side of [-1, 1]) {
      const x = P.x + side * (P.width / 2 + 0.1);
      for (let i = 0; i < bays; i++) {
        const z = P.z - P.length / 2 + (i + 0.5) * (P.length / bays);
        glass.push(box(0.16, 4.2, 8.4, [x, 2.6, z]));
        glow.push(box(0.3, 0.34, 8.0, [x - side * 0.25, 5.0, z]));   // fascia light
        frames.push(box(0.5, 5.4, 0.55, [x, 2.7, z - (P.length / bays) / 2]));
        frames.push(box(0.5, 5.4, 0.55, [x, 2.7, z + (P.length / bays) / 2]));
        frames.push(box(0.6, 0.6, P.length / bays, [x, 5.5, z]));
      }
    }
    this.shell.add(mesh(mergeGeometries(glass), glassMat, { name: 'ShopfrontGlass', renderOrder: 4 }));
    this.shell.add(mesh(mergeGeometries(glow), glowMat, { name: 'ShopfrontFascias' }));
    this.shell.add(mesh(mergeGeometries(frames), frameMat, { name: 'ShopfrontFrames', cast: true }));
  },

  /**
   * The show plaza's lighting rig: a ring of masts carrying colour-changing
   * fixtures, plus the fountain jets they light. The show itself is driven
   * in Phase 9's completion milestone and at night.
   */
  buildShowRig() {
    const M = this.materials;
    const S = ANNEX.showPlaza;
    const mastMat = M.solid('showMast', { color: 0x2b2e33, roughness: 0.5, metalness: 0.7, exterior: true });
    const headMat = M.solid('showHead', {
      color: 0x14161a, roughness: 0.4, metalness: 0.5,
      emissive: 0x3366ff, emissiveIntensity: 0.0
    });
    this.showHeadMaterial = headMat;

    const mastGeo = mergeGeometries([
      cyl(0.16, 0.24, 9.0, 8, [0, 4.5, 0]),
      box(1.2, 0.3, 0.6, [0, 9.1, 0])
    ]);
    const headGeo = new THREE.SphereGeometry(0.42, 10, 8);
    headGeo.translate(0, 9.25, 0);

    const xs = [];
    this.showMasts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const p = [S.x + Math.cos(a) * (S.basinRadius + 5.5), 0.2, S.z + Math.sin(a) * (S.basinRadius + 5.5)];
      xs.push({ pos: p, rot: [0, -a, 0] });
      this.showMasts.push({ pos: p, angle: a });
    }
    this.shell.add(instance(mastGeo, mastMat, xs, { name: 'ShowMasts', castShadow: true }));
    this.shell.add(instance(headGeo, headMat, xs, { name: 'ShowLightHeads' }));

    /* The water jets themselves. */
    const spriteSet = M.tex.get('glowSprite');
    const jetMat = new THREE.PointsMaterial({
      size: 1.5, map: spriteSet.map, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe8ff
    });
    const rings = 3, perRing = 16, per = 14;
    const jets = [];
    for (let r = 1; r <= rings; r++) {
      for (let i = 0; i < perRing; i++) {
        const a = (i / perRing) * TAU + r * 0.2;
        const rad = (r / rings) * S.basinRadius * 0.8;
        jets.push([S.x + Math.cos(a) * rad, S.waterLevel, S.z + Math.sin(a) * rad, rad / S.basinRadius]);
      }
    }
    const N = jets.length * per;
    const pos = new Float32Array(N * 3);
    const st = [];
    for (let j = 0; j < jets.length; j++) {
      for (let k = 0; k < per; k++) {
        st.push({ jet: j, t: Math.random() * 2.2 });
        const i = j * per + k;
        pos[i * 3] = jets[j][0]; pos[i * 3 + 1] = jets[j][1]; pos[i * 3 + 2] = jets[j][2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, jetMat);
    pts.name = 'ShowFountainJets';
    pts.frustumCulled = false;
    this.detail.add(pts);
    this.showJets = { geo, st, jets, N, material: jetMat };

    /* Show intensity swells and falls; Phase 9 and night mode drive it harder. */
    this.showIntensity = 0.35;
    this.addAnimator((dt, t) => {
      const a = geo.attributes.position;
      const swell = 0.5 + 0.5 * Math.sin(t * 0.35);
      const power = this.showIntensity * (0.6 + swell * 0.9);
      for (let i = 0; i < N; i++) {
        const s = st[i];
        s.t += dt;
        const life = 2.2;
        if (s.t > life) s.t -= life;
        const j = jets[s.jet];
        const vy = (7 + 12 * power) * (0.5 + j[3] * 0.9);
        const tt = s.t;
        const y = j[1] + vy * tt - 4.9 * tt * tt;
        a.setXYZ(i, j[0], Math.max(j[1], y), j[2]);
      }
      a.needsUpdate = true;
      jetMat.opacity = 0.25 + power * 0.45;
      headMat.emissiveIntensity = power * 2.6;
      headMat.emissive.setHSL((t * 0.06) % 1, 0.75, 0.55);
    });
  },

  /** The motorsport pavilion's glazed entrance portal. */
  buildMotorsportPortal() {
    const M = this.materials;
    const P = ANNEX.motorsport;
    const glassMat = M.glass('motorPortalGlass', {
      color: 0x9fc0d4, opacity: 0.3, roughness: 0.06, metalness: 0.1
    });
    const frameMat = M.surface('motorPortalFrame', 'brushedMetal', {
      repeat: 2, roughness: 0.26, metalness: 0.82, exterior: true, color: 0xd4dae1
    });
    const g = new THREE.Group();
    g.name = 'MotorsportPortal';
    g.position.set(P.x, 0, P.z);
    g.rotation.y = P.rot;
    // The nose of the teardrop is the entrance.
    const zEnd = -P.d / 2 + 2;
    g.add(mesh(box(13, 6.4, 0.3, [0, 3.2, zEnd]), glassMat, { name: 'PortalGlass', renderOrder: 4 }));
    const frames = [];
    for (let i = -3; i <= 3; i++) frames.push(box(0.3, 6.6, 0.6, [i * 2.1, 3.3, zEnd]));
    frames.push(box(14, 0.6, 0.8, [0, 6.7, zEnd]));
    frames.push(box(16, 0.5, 5.0, [0, 7.6, zEnd - 2.2]));   // entrance canopy
    g.add(mesh(mergeGeometries(frames), frameMat, { name: 'PortalFrames', cast: true }));
    this.shell.add(g);
  }
});

/* ==================================================================== */
/* Phase 4 — interiors (Section D.7)                                    */
/*                                                                      */
/* Motorsport Pavilion Interior · Modular Block Pavilion Interior ·     */
/* Themed Promenade Arcade                                              */
/*                                                                      */
/* Section A's IP rule governs this zone: every vehicle, block and shop */
/* form here is generic and unbranded.                                  */
/* ==================================================================== */

Object.assign(WonderAnnex.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;

    this.palette = {
      gloss: M.surface('annexGloss', 'glossResin', { repeat: 8, roughness: 0.07, metalness: 0.1 }),
      tile: M.surface('annexTile', 'promenadeTile', { repeat: 10, roughness: 0.3 }),
      metal: M.surface('annexMetal', 'brushedMetal', { repeat: 3, roughness: 0.26, metalness: 0.82 }),
      dark: M.solid('annexDark', { color: 0x14171c, roughness: 0.5, metalness: 0.4 }),
      silver: M.solid('annexSilver', { color: 0xc4cad2, roughness: 0.18, metalness: 0.9 }),
      red: M.solid('annexRed', { color: 0xb8231c, roughness: 0.3, metalness: 0.2 }),
      glass: M.glass('annexGlassInt', { color: 0xd6e8f0, opacity: 0.2, roughness: 0.05, exterior: false }),
      plaster: M.surface('annexPlaster', 'plaster', { repeat: 6, roughness: 0.84, color: 0xf0e6d2 }),
      timber: M.surface('annexTimber', 'paintedTimber', { repeat: 2, roughness: 0.62, color: 0xd6c4a4 })
    };
    /* Primary-colour resin floors and blocks for the maker pavilion. */
    for (const [key, hex] of [['pRed', 0xd8352a], ['pBlue', 0x1f63c4], ['pYellow', 0xf0b400],
                              ['pGreen', 0x2f9c46], ['pWhite', 0xe8e6e0]]) {
      this.palette[key] = M.surface('annexInt_' + key, 'primaryResin', {
        repeat: 4, roughness: 0.32, opts: { hex }
      });
    }
    this.palette.stageWarm = M.solid('annexStageWarm', {
      color: 0x2a1a12, roughness: 0.4, emissive: 0xff7a3a, emissiveIntensity: 2.4
    });
    this.palette.stageCool = M.solid('annexStageCool', {
      color: 0x101a26, roughness: 0.4, emissive: 0x66b0ff, emissiveIntensity: 2.4
    });
    this.palette.shopGlow = M.solid('annexShopGlow', {
      color: 0x352a1c, roughness: 0.5, emissive: 0xffc27a, emissiveIntensity: 2.2
    });
    this.palette.brightWhite = M.solid('annexBrightWhite', {
      color: 0x2a2c30, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 2.0
    });
    M.registerInteriorPalette(this.palette);

    this.roomMotorsportInterior(A);
    this.roomBlockPavilionInterior(A);
    this.roomPromenadeArcade(A);
  },

  /* ---------------- Motorsport Pavilion Interior ---------------- */

  /** "A dramatic curved, aerodynamic-form ceiling with sweeping stage-style
      lighting over a central rotating display plinth (a generic, unbranded
      concept vehicle) and a row of simulator pods." */
  roomMotorsportInterior(A) {
    const P = this.palette;
    const M = ANNEX.motorsport;
    const room = this.room({
      name: 'Motorsport Pavilion Interior', level: 'Ground',
      center: [M.x, 8, M.z], size: [M.w + 6, 24, M.d + 6],
      acoustic: A.SHOW_HALL, range: 170
    });

    room.lazy((r) => {
      const g = new THREE.Group();
      g.position.set(M.x, 0, M.z);
      g.rotation.y = M.rot;
      r.group.add(g);

      /* Dark glossy resin display floor — reflective, for dramatic lighting. */
      const floor = new THREE.PlaneGeometry(M.w * 0.92, M.d * 0.9, 1, 1);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.06);
      g.add(mesh(xform(floor, { pos: [0, 0.22, 0] }), P.gloss, {
        name: 'GlossResinFloor', receive: true
      }));

      /* The curved aerodynamic-form ceiling, read from inside. */
      const ceiling = surfaceGrid((u, v, o) => {
        const zLocal = (u - 0.5) * (M.d - 4);
        const halfW = ((M.w - 6) / 2) * Math.pow(Math.sin(Math.PI * Math.min(u * 1.12, 1)), 0.62);
        const hMax = (M.h - 2.4) * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(u, 0.78)));
        const a = v * Math.PI;
        o.set(Math.cos(a) * halfW, 0.6 + Math.sin(a) * hMax, zLocal);
      }, 34, 16, { flip: true, uvScale: [6, 2] });
      g.add(mesh(ceiling, P.dark, { name: 'AerodynamicCeiling', receive: true }));

      /* Structural ribs following the shell's curvature. */
      const ribs = [];
      for (let b = 1; b < 11; b++) {
        const u = b / 11;
        const zLocal = (u - 0.5) * (M.d - 4);
        const halfW = ((M.w - 6) / 2) * Math.pow(Math.sin(Math.PI * Math.min(u * 1.12, 1)), 0.62);
        const hMax = (M.h - 2.4) * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(u, 0.78)));
        const seg = 12;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
          const m = member(
            [Math.cos(a0) * halfW * 0.98, 0.6 + Math.sin(a0) * hMax * 0.98, zLocal],
            [Math.cos(a1) * halfW * 0.98, 0.6 + Math.sin(a1) * hMax * 0.98, zLocal], 0.16, 0.24);
          if (m) ribs.push(m);
        }
      }
      g.add(mesh(mergeGeometries(ribs.filter(Boolean)), P.metal, { name: 'CeilingRibs', cast: true }));

      /**
       * Prop 1 — the central rotating display plinth carrying a generic,
       * unbranded concept-vehicle silhouette.
       */
      const rp = rotatingPlinth(6.0, 0.85, 1.6);
      const plinthHolder = new THREE.Group();
      plinthHolder.position.set(0, 0.22, 4);
      plinthHolder.add(mesh(rp.base, P.metal, { name: 'PlinthBase', cast: true }));
      plinthHolder.add(rp.turntable);
      const car = conceptVehicle();
      rp.turntable.position.y = 0.85;
      rp.turntable.add(mesh(car.body, P.silver, { name: 'ConceptVehicleBody', cast: true }));
      rp.turntable.add(mesh(car.canopy, P.glass, { name: 'ConceptVehicleCanopy', renderOrder: 4 }));
      g.add(plinthHolder);
      r.addProp({ name: 'Rotating display plinth', update: (dt) => rp.update(dt) });

      /* Prop 2 — sweeping stage-style lighting in red, black and silver. */
      const rigHeight = M.h - 4.0;
      const heads = [];
      const headGroups = [];
      for (let i = 0; i < 8; i++) {
        const x = -14 + (i % 4) * 9.3;
        const z = i < 4 ? -8 : 16;
        const yoke = new THREE.Group();
        yoke.position.set(x, rigHeight, z);
        yoke.add(mesh(mergeGeometries([
          box(0.7, 0.5, 0.7, [0, 0.3, 0]),
          cyl(0.28, 0.28, 0.9, 10, [0, -0.2, 0], [Math.PI / 2, 0, 0])
        ]), P.dark, { name: 'FixtureYoke' }));
        const lensMat = i % 2 ? P.stageWarm : P.stageCool;
        yoke.add(mesh(cyl(0.24, 0.3, 0.16, 12, [0, -0.55, 0]), lensMat, { name: 'FixtureLens' }));
        g.add(yoke);
        const spot = new THREE.SpotLight(i % 2 ? 0xff7a3a : 0x66b0ff, 260, 46, 0.32, 0.5, 2);
        spot.position.set(x, rigHeight - 0.6, z);
        spot.target.position.set(0, 0.5, 4);
        g.add(spot, spot.target);
        r.lights.push(spot);
        headGroups.push({ yoke, spot, phase: i * 0.78, warm: i % 2 === 1 });
      }
      /* Truss carrying the rig. */
      const truss = [];
      for (const z of [-8, 16]) {
        truss.push(member([-18, rigHeight + 0.9, z], [18, rigHeight + 0.9, z], 0.2, 0.2));
        truss.push(member([-18, rigHeight + 1.7, z], [18, rigHeight + 1.7, z], 0.2, 0.2));
        for (let i = 0; i <= 12; i++) {
          const x = -18 + i * 3;
          truss.push(member([x, rigHeight + 0.9, z], [x, rigHeight + 1.7, z], 0.1, 0.1));
        }
      }
      g.add(mesh(mergeGeometries(truss.filter(Boolean)), P.metal, { name: 'LightingTruss', cast: true }));
      r.addProp({
        name: 'Sweeping stage lighting',
        update() {
          const t = performance.now() * 0.001;
          for (const h of headGroups) {
            const sweep = Math.sin(t * 0.55 + h.phase);
            h.yoke.rotation.z = sweep * 0.55;
            h.yoke.rotation.x = Math.cos(t * 0.4 + h.phase) * 0.28;
            h.spot.target.position.set(sweep * 12, 0.5, 4 + Math.cos(t * 0.4 + h.phase) * 8);
            h.spot.intensity = 180 + Math.abs(sweep) * 160;
          }
          P.stageWarm.emissiveIntensity = 2.0 + Math.sin(t * 1.3) * 0.8;
          P.stageCool.emissiveIntensity = 2.0 + Math.cos(t * 1.1) * 0.8;
        }
      });

      /* Prop 3 — the row of simulator pods, rocking on their motion bases. */
      const pods = [];
      for (let i = 0; i < ANNEX.simulatorPods; i++) {
        const x = -18 + i * 9;
        const sp = simulatorPod();
        const holder = new THREE.Group();
        holder.position.set(x, 0.22, -18);
        holder.add(mesh(sp.base, P.dark, { name: 'PodBase' }));
        sp.rocker.position.y = 0.6;
        sp.rocker.add(mesh(sp.shell, i % 2 ? P.red : P.silver, { name: 'PodShell', cast: true }));
        holder.add(sp.rocker);
        g.add(holder);
        pods.push(sp);
      }
      r.addProp({
        name: 'Simulator pods',
        update(dt) { const t = performance.now() * 0.001; for (const p of pods) p.update(dt, t); }
      });

      /* Barrier rail around the display, and ambient fill. */
      const railPts = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * TAU;
        railPts.push([Math.cos(a) * 8.4, 0.22, 4 + Math.sin(a) * 8.4]);
      }
      g.add(mesh(balustrade(railPts, 0.95, 3, 0.035, 0.05), P.metal, { name: 'DisplayBarrier' }));
      roomLight(r, 0x8fa8c0, 22, 60, [M.x, 10, M.z]);
    });
  },

  /* ---------------- Modular Block Pavilion Interior ---------------- */

  /** "Oversized colorful block-shaped elements as literal feature-wall
      building blocks, in a playful primary-color palette with interactive
      maker tables." */
  roomBlockPavilionInterior(A) {
    const P = this.palette;
    const B = ANNEX.blocks;
    const room = this.room({
      name: 'Modular Block Pavilion Interior', level: 'Ground',
      center: [B.x, B.h / 2, B.z], size: [B.w, B.h + 4, B.d],
      acoustic: A.SHOW_HALL, range: 160
    });

    room.lazy((r) => {
      /* Bright poured-resin floor, quartered in primary colours. */
      const quads = [
        { m: P.pRed, x: -1, z: -1 }, { m: P.pBlue, x: 1, z: -1 },
        { m: P.pYellow, x: -1, z: 1 }, { m: P.pGreen, x: 1, z: 1 }
      ];
      for (const q of quads) {
        const f = new THREE.PlaneGeometry(B.w / 2 - 1.6, B.d / 2 - 1.6);
        f.rotateX(-Math.PI / 2);
        remapUV(f, 'xz', 0.07);
        r.group.add(mesh(xform(f, { pos: [B.x + q.x * B.w / 4, 0.46, B.z + q.z * B.d / 4] }), q.m, {
          name: 'ResinFloorQuad', receive: true
        }));
      }

      /* Interior feature walls of oversized modular blocks. */
      const unit = 2.4;
      const seatGeo = blockSeat(unit, 2, 1);
      const wallGeo = blockSeat(unit, 2, 1);
      const buckets = { pRed: [], pBlue: [], pYellow: [], pGreen: [], pWhite: [] };
      const keys = Object.keys(buckets);
      const rr = rng(6060);
      for (let side = 0; side < 4; side++) {
        const ang = side * Math.PI / 2;
        const nx = Math.cos(ang), nz = Math.sin(ang);
        for (let row = 0; row < 5; row++) {
          for (let c = -5; c <= 5; c++) {
            if (rr() > 0.62) continue;
            const along = c * unit * 2;
            if (Math.abs(along) > B.w / 2 - unit * 2) continue;
            const px = B.x + nx * (B.w / 2 - 1.4) - nz * along;
            const pz = B.z + nz * (B.d / 2 - 1.4) + nx * along;
            buckets[keys[Math.floor(rr() * keys.length) % keys.length]].push({
              pos: [px, 0.46 + row * unit * 0.72, pz], rot: [0, -ang, 0]
            });
          }
        }
      }
      for (const k of keys) {
        if (buckets[k].length) {
          r.group.add(instance(wallGeo, P[k], buckets[k], {
            name: 'FeatureWallBlocks_' + k, castShadow: true, receiveShadow: true
          }));
        }
      }

      /* Prop 1 — interactive maker tables whose work surfaces light up. */
      const tables = [];
      const tableTops = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const px = B.x + Math.cos(a) * 14, pz = B.z + Math.sin(a) * 14;
        r.group.add(mesh(table(2.4, 1.2, 0.78, 0.07), P.timber, {
          name: 'MakerTable', pos: [px, 0.46, pz], rot: [0, -a, 0], cast: true
        }));
        const topMat = this.materials.solid('annexMakerTop' + i, {
          color: 0x1a1e24, roughness: 0.3, emissive: 0x88ddff, emissiveIntensity: 1.2
        });
        this.materials.registerInterior(topMat);
        const top = mesh(box(2.0, 0.04, 0.9, [px, 1.27, pz], [0, -a, 0]), topMat, { name: 'MakerSurface' });
        r.group.add(top);
        tableTops.push(topMat);
        /* Stools around each table. */
        const st = [];
        for (let k = 0; k < 4; k++) {
          const aa = (k / 4) * TAU;
          st.push({ pos: [px + Math.cos(aa) * 1.7, 0.46, pz + Math.sin(aa) * 1.7] });
        }
        r.group.add(instance(stool(0.62, 0.18), P[keys[i % keys.length]], st, {
          name: 'MakerStools', castShadow: true
        }));
        tables.push({ topMat, phase: i * 1.1 });
      }
      r.addProp({
        name: 'Interactive maker tables',
        update() {
          const t = performance.now() * 0.001;
          for (const tb of tables) {
            tb.topMat.emissiveIntensity = 0.7 + Math.abs(Math.sin(t * 0.8 + tb.phase)) * 1.1;
            tb.topMat.emissive.setHSL((t * 0.05 + tb.phase * 0.1) % 1, 0.6, 0.6);
          }
        }
      });

      /* Prop 2 — stacked block seating that visitors rearrange; the stack
         shuffles slowly to suggest it is being used. */
      const seatXs = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.35;
        seatXs.push({ pos: [B.x + Math.cos(a) * 22, 0.46, B.z + Math.sin(a) * 22], rot: [0, -a, 0] });
      }
      const seatMesh = instance(seatGeo, P.pYellow, seatXs, {
        name: 'BlockSeating', castShadow: true, receiveShadow: true
      });
      r.group.add(seatMesh);
      const seatMtx = new THREE.Matrix4();
      const seatQ = new THREE.Quaternion();
      const seatE = new THREE.Euler();
      const seatV = new THREE.Vector3();
      const seatS = new THREE.Vector3(1, 1, 1);
      r.addProp({
        name: 'Block seating',
        update() {
          const t = performance.now() * 0.001;
          for (let i = 0; i < seatXs.length; i++) {
            const s = seatXs[i];
            seatV.set(s.pos[0], s.pos[1] + Math.max(0, Math.sin(t * 0.3 + i)) * 0.5, s.pos[2]);
            seatE.set(0, s.rot[1] + Math.sin(t * 0.2 + i) * 0.25, 0);
            seatQ.setFromEuler(seatE);
            seatMtx.compose(seatV, seatQ, seatS);
            seatMesh.setMatrixAt(i, seatMtx);
          }
          seatMesh.instanceMatrix.needsUpdate = true;
        }
      });

      /* Prop 3 — bright even primary-colour lighting under the skylight. */
      const panels = [];
      for (let i = 0; i < 9; i++) {
        const px = B.x + ((i % 3) - 1) * 12, pz = B.z + (Math.floor(i / 3) - 1) * 12;
        panels.push(box(6.0, 0.14, 6.0, [px, B.h - 1.2, pz]));
      }
      r.group.add(mesh(mergeGeometries(panels), P.brightWhite, { name: 'SkylightDiffusers' }));
      const bright = [
        roomLight(r, 0xffffff, 62, 50, [B.x, B.h - 3, B.z]),
        roomLight(r, 0xffe8c0, 26, 34, [B.x - 16, B.h - 6, B.z - 16]),
        roomLight(r, 0xd8ecff, 26, 34, [B.x + 16, B.h - 6, B.z + 16])
      ];
      r.addProp({
        name: 'Skylight diffusers',
        update() {
          const k = 0.92 + Math.sin(performance.now() * 0.0003) * 0.08;
          bright[0].intensity = 62 * k;
          P.brightWhite.emissiveIntensity = 1.8 * k;
        }
      });
    });
  },

  /* ---------------- Themed Promenade Arcade ---------------- */

  /** "A full glass barrel-vault roof, warm-lit shopfronts, and a tiered
      viewing gallery overlooking the exterior light-and-water show plaza." */
  roomPromenadeArcade(A) {
    const P = this.palette;
    const Pr = ANNEX.promenade;
    const S = ANNEX.showPlaza;
    const room = this.room({
      name: 'Themed Promenade Arcade', level: 'Ground',
      center: [Pr.x, 8, Pr.z], size: [Pr.width + 20, 24, Pr.length + 20],
      acoustic: A.SHOW_HALL, range: 190
    });

    room.lazy((r) => {
      const halfL = Pr.length / 2, halfW = Pr.width / 2;

      /* Patterned tile street inside the arcade. */
      const floor = new THREE.PlaneGeometry(Pr.width, Pr.length);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.08);
      r.group.add(mesh(xform(floor, { pos: [Pr.x, 0.18, Pr.z] }), P.tile, {
        name: 'ArcadeTileFloor', receive: true
      }));

      /* Shopfront interiors: lit display cases behind the glazing. */
      const cases = [], displays = [], fascias = [];
      const bays = 12;
      for (const side of [-1, 1]) {
        const x = Pr.x + side * (halfW - 0.6);
        for (let i = 0; i < bays; i++) {
          const z = Pr.z - halfL + (i + 0.5) * (Pr.length / bays);
          cases.push(box(1.6, 2.6, 6.4, [x + side * 0.9, 1.5, z]));
          displays.push(box(0.9, 0.06, 5.6, [x + side * 0.5, 1.1, z]));
          displays.push(box(0.9, 0.06, 5.6, [x + side * 0.5, 1.9, z]));
          fascias.push(box(0.34, 0.5, 7.0, [x - side * 0.1, 4.3, z]));
        }
      }
      r.group.add(mesh(mergeGeometries(cases), P.plaster, { name: 'ShopfrontCases', receive: true }));
      r.group.add(mesh(mergeGeometries(displays), P.timber, { name: 'DisplayShelves' }));
      const fasciaMesh = mesh(mergeGeometries(fascias), P.shopGlow, { name: 'ShopfrontFascias' });
      r.group.add(fasciaMesh);

      /* Prop 1 — warm shopfront lighting that varies bay to bay. */
      const shopLights = [];
      for (let i = 0; i < 6; i++) {
        const z = Pr.z - halfL + (i + 0.5) * (Pr.length / 6);
        shopLights.push(roomLight(r, 0xffc98a, 24, 26, [Pr.x - halfW + 2, 3.6, z]));
        shopLights.push(roomLight(r, 0xffc98a, 24, 26, [Pr.x + halfW - 2, 3.6, z]));
      }
      r.addProp({
        name: 'Shopfront lighting',
        update() {
          const t = performance.now() * 0.001;
          for (let i = 0; i < shopLights.length; i++) {
            shopLights[i].intensity = 20 + Math.sin(t * 0.4 + i * 0.9) * 5;
          }
          P.shopGlow.emissiveIntensity = 2.0 + Math.sin(t * 0.5) * 0.35;
        }
      });

      /**
       * Prop 2 — the tiered viewing gallery at the plaza end, overlooking
       * the light-and-water show, with a show-facing spotlight rig.
       */
      const galleryZ = Pr.z - halfL - 6;
      const gal = new THREE.Group();
      gal.position.set(Pr.x, 0.18, galleryZ);
      // Face the gallery toward the show plaza.
      gal.rotation.y = Math.atan2(S.x - Pr.x, S.z - galleryZ);
      gal.add(mesh(tieredSeating(Pr.width + 6, 5, 0.55, 1.3), P.plaster, {
        name: 'TieredGallery', cast: true, receive: true
      }));
      const galRail = [];
      for (let i = 0; i <= 12; i++) galRail.push([-(Pr.width + 6) / 2 + i * (Pr.width + 6) / 12, 2.85, 1.0]);
      gal.add(mesh(glassAnnexRail(galRail, 1.1), P.glass, { name: 'GalleryGuard', renderOrder: 4 }));
      r.group.add(gal);

      const showSpots = [];
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 5.5;
        const yoke = new THREE.Group();
        yoke.position.set(off, 6.4, 1.4);
        yoke.add(mesh(mergeGeometries([
          box(0.6, 0.44, 0.6, [0, 0.26, 0]),
          cyl(0.22, 0.26, 0.7, 10, [0, -0.2, 0], [Math.PI / 2, 0, 0])
        ]), P.dark, { name: 'ShowFixture' }));
        yoke.add(mesh(cyl(0.2, 0.26, 0.14, 12, [0, -0.5, 0]), P.stageCool, { name: 'ShowLens' }));
        gal.add(yoke);
        const sp = new THREE.SpotLight(0x88c8ff, 200, 90, 0.3, 0.55, 2);
        sp.position.set(off, 6.0, 1.4);
        sp.target.position.set(off * 2, 0, -40);
        gal.add(sp, sp.target);
        r.lights.push(sp);
        showSpots.push({ yoke, sp, phase: i * 1.2 });
      }
      /* The rig's supporting gantry. */
      const gantry = [];
      gantry.push(member([-(Pr.width + 6) / 2, 7.0, 1.4], [(Pr.width + 6) / 2, 7.0, 1.4], 0.22, 0.22));
      for (let i = 0; i <= 6; i++) {
        const x = -(Pr.width + 6) / 2 + i * (Pr.width + 6) / 6;
        gantry.push(member([x, 7.0, 1.4], [x, 0.2, 1.4], 0.16, 0.16));
      }
      gal.add(mesh(mergeGeometries(gantry.filter(Boolean)), P.metal, { name: 'ShowGantry', cast: true }));

      const annexZone = this;
      r.addProp({
        name: 'Show-facing spotlight rig',
        update() {
          const t = performance.now() * 0.001;
          const power = annexZone.showIntensity ?? 0.35;
          for (const s of showSpots) {
            const sweep = Math.sin(t * 0.45 + s.phase);
            s.yoke.rotation.z = sweep * 0.42;
            s.sp.target.position.x = sweep * 30;
            s.sp.intensity = (120 + Math.abs(sweep) * 120) * (0.5 + power);
            s.sp.color.setHSL((t * 0.05 + s.phase * 0.08) % 1, 0.65, 0.62);
          }
          P.stageCool.emissiveIntensity = 1.8 + power * 1.6;
        }
      });

      /* Prop 3 — the glazed barrel vault read from inside, with its ribs and
         a slow drift of light along the purlins. */
      const vaultInner = surfaceGrid((u, v, o) => {
        const z = Pr.z + (u - 0.5) * Pr.length;
        const a = v * Math.PI;
        o.set(Pr.x + Math.cos(a) * (halfW + 1.4), (Pr.height - 3) + Math.sin(a) * 5.4, z);
      }, 30, 12, { flip: true, uvScale: [8, 2] });
      r.group.add(mesh(vaultInner, P.glass, { name: 'BarrelVaultInner', renderOrder: 3 }));
      const purlins = [];
      for (let i = 1; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        const m = member(
          [Pr.x + Math.cos(a) * (halfW + 1.3), (Pr.height - 3) + Math.sin(a) * 5.3, Pr.z - halfL],
          [Pr.x + Math.cos(a) * (halfW + 1.3), (Pr.height - 3) + Math.sin(a) * 5.3, Pr.z + halfL],
          0.1, 0.1);
        if (m) purlins.push(m);
      }
      const purlinMesh = mesh(mergeGeometries(purlins.filter(Boolean)), P.brightWhite, {
        name: 'VaultPurlinLights'
      });
      r.group.add(purlinMesh);
      const vaultLights = [];
      for (let i = 0; i < 4; i++) {
        vaultLights.push(roomLight(r, 0xe8f0ff, 22, 40,
          [Pr.x, Pr.height + 1, Pr.z - halfL + (i + 0.5) * (Pr.length / 4)]));
      }
      r.addProp({
        name: 'Barrel-vault lighting',
        update() {
          const t = performance.now() * 0.0007;
          for (let i = 0; i < vaultLights.length; i++) {
            vaultLights[i].intensity = 16 + Math.max(0, Math.sin(t - i * 0.8)) * 12;
          }
        }
      });

      /* Crowd-scale dressing: planters and benches down the street. */
      const pl = planter(1.8, 0.7, 0.55);
      const tubs = [], leaves = [], benches = [];
      for (let i = 0; i < 8; i++) {
        const z = Pr.z - halfL + (i + 0.5) * (Pr.length / 8);
        for (const side of [-1, 1]) {
          const e = { pos: [Pr.x + side * (halfW - 5), 0.18, z], rot: [0, Math.PI / 2, 0] };
          tubs.push(e); leaves.push(e);
        }
        if (i % 2 === 0) benches.push({ pos: [Pr.x, 0.18, z], rot: [0, Math.PI / 2, 0] });
      }
      r.group.add(instance(pl.tub, P.timber, tubs, { name: 'ArcadePlanters' }));
      r.group.add(instance(pl.foliage,
        this.materials.surface('annexIntFoliage', 'foliage', { repeat: 2, roughness: 0.9 }),
        leaves, { name: 'ArcadePlanting', castShadow: true }));
      r.group.add(instance(bench(2.2, 0.44), P.timber, benches, { name: 'ArcadeBenches', castShadow: true }));
    });
  }
});
