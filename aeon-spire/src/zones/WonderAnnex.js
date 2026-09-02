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
      transparent: true, opacity: 0.9, normalMap: set.normalMap, envMapIntensity: 2.6
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
