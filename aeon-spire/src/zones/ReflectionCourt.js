/**
 * ZONE 6 — THE REFLECTION COURT & PYRAMID PAVILION (ground level)
 *
 * Concept borrowed from the axial symmetry of the Taj Mahal complex and the
 * pure geometry of the Giza pyramids: a mirror-symmetrical reflecting pool
 * and four planted quadrants leading to a glass-and-stone pyramid that
 * houses the campus sustainability core — geothermal exchange, a solar
 * chimney and the rainwater cistern.
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { COURT } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, mesh, instance, member, tube,
  waterPlane, balustrade, tree, loft, circleRing
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng } from '../core/MathUtil.js';

export class ReflectionCourt extends Zone {
  constructor(ctx) {
    super('court', 'Reflection Court & Pyramid Pavilion', ctx);
    this.appearsAtMilestone = 9;
  }

  get radius() { return 260; }

  massing() {
    this.buildCourtFloor();
    this.buildPool();
    this.buildGardens();
    this.buildPyramid();
    this.buildHalls();
  }

  /** The paved court, its white inlay bands and the perimeter walls. */
  buildCourtFloor() {
    const M = this.materials;
    const paveMat = M.surface('courtPaving', 'paving', {
      repeat: 34, roughness: 0.66, exterior: true, color: 0xdad3c4
    });
    /* The court is paved as a shape with the reflecting pool punched out of
       it — otherwise the paving would simply cover the water. */
    const shape = new THREE.Shape();
    shape.moveTo(-COURT.halfWidth, COURT.startZ);
    shape.lineTo(COURT.halfWidth, COURT.startZ);
    shape.lineTo(COURT.halfWidth, COURT.endZ);
    shape.lineTo(-COURT.halfWidth, COURT.endZ);
    shape.closePath();
    const poolHole = new THREE.Path();
    const ph = COURT.poolHalfX;
    poolHole.moveTo(-ph, COURT.poolStartZ);
    poolHole.lineTo(-ph, COURT.poolEndZ);
    poolHole.lineTo(ph, COURT.poolEndZ);
    poolHole.lineTo(ph, COURT.poolStartZ);
    poolHole.closePath();
    shape.holes.push(poolHole);
    const g = new THREE.ShapeGeometry(shape, 2);
    // ShapeGeometry lies in XY; rotate it into the ground plane.
    g.rotateX(-Math.PI / 2);
    const guv = g.attributes.uv, gpos = g.attributes.position;
    for (let i = 0; i < guv.count; i++) guv.setXY(i, gpos.getX(i) * 0.03, gpos.getZ(i) * 0.03);
    this.shell.add(mesh(xform(g, { pos: [0, 0.36, 0] }), paveMat, {
      name: 'CourtPaving', receive: true
    }));

    /* White inlay bands on the axis of symmetry — the device that makes the
       court read as deliberately, mirror-symmetrically composed. */
    const inlayMat = M.solid('courtInlay', { color: 0xf1ece1, roughness: 0.42, exterior: true });
    const inlays = [];
    for (const side of [-1, 1]) {
      inlays.push(box(1.1, 0.06, COURT.endZ - COURT.startZ - 12,
        [side * (COURT.poolHalfX + 5.5), 0.41, (COURT.startZ + COURT.endZ) / 2]));
      inlays.push(box(1.1, 0.06, COURT.endZ - COURT.startZ - 12,
        [side * (COURT.poolHalfX + 34), 0.41, (COURT.startZ + COURT.endZ) / 2]));
    }
    for (let i = 0; i < 7; i++) {
      const z = lerp(COURT.startZ + 14, COURT.endZ - 26, i / 6);
      if (z < COURT.poolStartZ - 3 || z > COURT.poolEndZ + 3)
        inlays.push(box(COURT.halfWidth * 1.72, 0.06, 1.1, [0, 0.41, z]));
    }
    this.shell.add(mesh(mergeGeometries(inlays), inlayMat, { name: 'CourtInlay', receive: true }));

    /* Low perimeter wall enclosing the court. */
    const wallMat = M.surface('courtWall', 'limestone', {
      repeat: 20, roughness: 0.66, exterior: true, color: 0xe2dccd
    });
    const walls = [];
    for (const side of [-1, 1]) {
      walls.push(box(1.6, 2.4, COURT.endZ - COURT.startZ,
        [side * COURT.halfWidth, 1.5, (COURT.startZ + COURT.endZ) / 2]));
    }
    walls.push(box(COURT.halfWidth * 2, 2.4, 1.6, [0, 1.5, COURT.endZ]));
    this.shell.add(mesh(mergeGeometries(walls), wallMat, { name: 'CourtWalls', cast: true, receive: true }));
  }

  /** The central reflecting pool, with its own rippling water material. */
  buildPool() {
    const M = this.materials;
    const stone = M.surface('poolCoping', 'limestone', {
      repeat: 8, roughness: 0.6, exterior: true, color: 0xece6d8
    });
    const len = COURT.poolEndZ - COURT.poolStartZ;
    const midZ = (COURT.poolStartZ + COURT.poolEndZ) / 2;

    const coping = [];
    for (const side of [-1, 1]) {
      coping.push(box(1.8, 0.9, len + 3.6, [side * (COURT.poolHalfX + 0.9), 0.2, midZ]));
    }
    coping.push(box(COURT.poolHalfX * 2 + 3.6, 0.9, 1.8, [0, 0.2, COURT.poolStartZ - 0.9]));
    coping.push(box(COURT.poolHalfX * 2 + 3.6, 0.9, 1.8, [0, 0.2, COURT.poolEndZ + 0.9]));
    // Basin.
    coping.push(box(COURT.poolHalfX * 2, 0.4, len, [0, -1.4, midZ]));
    this.shell.add(mesh(mergeGeometries(coping), stone, { name: 'PoolCoping', cast: true, receive: true }));

    const set = M.tex.get('waterNormal');
    const uniforms = { uTime: { value: 0 }, uRipple: { value: 0.25 } };
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e3d4a, roughness: 0.045, metalness: 0.3,
      transparent: true, opacity: 0.94, normalMap: set.normalMap, envMapIntensity: 3.0
    });
    mat.normalScale = new THREE.Vector2(0.35, 0.35);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uRipple = uniforms.uRipple;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uRipple;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.y += sin(position.x * 0.7 + uTime * 0.9) * 0.018 * uRipple
                         + sin(position.z * 0.55 - uTime * 0.7) * 0.022 * uRipple;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uRipple;')
        .replace('#include <normal_fragment_maps>', `
          vec3 mn = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.006, uTime * 0.004)).xyz * 2.0 - 1.0;
          mn.xy *= normalScale * (0.35 + uRipple * 1.2);
          normal = normalize(tbn * normalize(mn));`);
    };
    mat.customProgramCacheKey = () => 'aeon-poolwater';
    this.poolMaterial = mat;
    this.poolUniforms = uniforms;

    const water = mesh(
      xform(waterPlane(COURT.poolHalfX * 2 - 0.4, len - 0.4, 40), { pos: [0, COURT.poolLevel, midZ] }),
      mat, { name: 'ReflectingPool', renderOrder: 2 }
    );
    this.shell.add(water);
    this.addAnimator((dt, t) => { uniforms.uTime.value = t; });
  }

  /** Four symmetrical planted quadrants with clipped hedging and trees. */
  buildGardens() {
    const M = this.materials;
    const lawnMat = M.surface('courtLawn', 'lawn', { repeat: 10, roughness: 0.94, exterior: true });
    const hedgeMat = M.solid('courtHedge', {
      color: 0x2c5c2c, roughness: 0.92, exterior: true, flatShading: true
    });
    const treeMat = M.surface('courtTree', 'foliage', {
      repeat: 2, roughness: 0.9, exterior: true, wind: true
    });

    const lawns = [], hedges = [];
    const treeXs = [];
    const r = rng(606);
    for (const q of COURT.quadrants) {
      const g = new THREE.PlaneGeometry(q.w, q.d);
      g.rotateX(-Math.PI / 2);
      lawns.push(xform(g, { pos: [q.x, 0.44, q.z] }));
      // Clipped hedge border.
      hedges.push(box(q.w, 0.85, 0.9, [q.x, 0.8, q.z - q.d / 2]));
      hedges.push(box(q.w, 0.85, 0.9, [q.x, 0.8, q.z + q.d / 2]));
      hedges.push(box(0.9, 0.85, q.d, [q.x - q.w / 2, 0.8, q.z]));
      hedges.push(box(0.9, 0.85, q.d, [q.x + q.w / 2, 0.8, q.z]));
      // A formal cross of paths splits each quadrant into four.
      hedges.push(box(q.w - 2, 0.6, 0.7, [q.x, 0.68, q.z]));
      // Trees on a regular grid — symmetry is the point of this court.
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 4; k++) {
          treeXs.push({
            pos: [q.x - q.w / 2 + 8 + i * ((q.w - 16) / 2), 0.4, q.z - q.d / 2 + 10 + k * ((q.d - 20) / 3)],
            rot: [0, r() * TAU, 0],
            scale: 0.85 + r() * 0.3
          });
        }
      }
    }
    this.shell.add(mesh(mergeGeometries(lawns), lawnMat, { name: 'CourtLawns', receive: true }));
    this.shell.add(mesh(mergeGeometries(hedges), hedgeMat, { name: 'CourtHedges', cast: true, receive: true }));
    this.shell.add(instance(tree(909, 1.0), treeMat, treeXs, {
      name: 'CourtTrees', castShadow: true, receiveShadow: true
    }));
  }

  /**
   * The glass-and-stone pyramid pavilion. A stone plinth and four stone
   * edge-arrises frame four glazed faces on an exposed steel rib cage.
   */
  buildPyramid() {
    const M = this.materials;
    const P = COURT.pyramid;
    const h = P.base / 2;

    /* Stone plinth. */
    const stone = M.surface('pyramidStone', 'limestone', {
      repeat: 10, roughness: 0.62, exterior: true, color: 0xe6dfd0
    });
    this.shell.add(mesh(
      box(P.base + 9, 1.8, P.base + 9, [P.x, 0.9, P.z]),
      stone, { name: 'PyramidPlinth', cast: true, receive: true }
    ));

    /* Glazed faces: four triangles from the plinth to the apex. */
    const glassMat = M.glass('pyramidGlass', {
      color: 0xbfd8e0, opacity: 0.24, roughness: 0.05, metalness: 0.1,
      side: THREE.DoubleSide, envMapIntensity: 2.4
    });
    const apex = new THREE.Vector3(P.x, 1.8 + P.height, P.z);
    const corners = [
      new THREE.Vector3(P.x - h, 1.8, P.z - h),
      new THREE.Vector3(P.x + h, 1.8, P.z - h),
      new THREE.Vector3(P.x + h, 1.8, P.z + h),
      new THREE.Vector3(P.x - h, 1.8, P.z + h)
    ];
    const faceParts = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z
      ], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      faceParts.push(g);
    }
    this.shell.add(mesh(mergeGeometries(faceParts), glassMat, {
      name: 'PyramidGlazing', renderOrder: 4
    }));

    /* Exposed steel rib cage: arrises plus horizontal courses. */
    const steelMat = M.surface('pyramidSteel', 'paintedSteel', {
      repeat: 2, roughness: 0.42, metalness: 0.7, exterior: true, color: 0x8c9299,
      opts: { hex: 0x7d838a }
    });
    const ribs = [];
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      ribs.push(member(c.toArray(), apex.toArray(), 0.5, 0.5));
    }
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      const y = lerp(1.8, apex.y, t);
      const s = h * (1 - t);
      const pts = [
        [P.x - s, y, P.z - s], [P.x + s, y, P.z - s],
        [P.x + s, y, P.z + s], [P.x - s, y, P.z + s]
      ];
      for (let i = 0; i < 4; i++) {
        ribs.push(member(pts[i], pts[(i + 1) % 4], 0.24, 0.24));
      }
      // Mullions between courses.
      for (let i = 0; i < 4; i++) {
        const a = pts[i], b = pts[(i + 1) % 4];
        for (let m = 1; m < 4; m++) {
          const px = lerp(a[0], b[0], m / 4), pz = lerp(a[2], b[2], m / 4);
          const t2 = (k + 1) / 7;
          const y2 = lerp(1.8, apex.y, t2);
          const s2 = h * (1 - t2);
          const cx = P.x + (px - P.x) * (s2 / Math.max(s, 1e-3));
          const cz = P.z + (pz - P.z) * (s2 / Math.max(s, 1e-3));
          ribs.push(member([px, y, pz], [cx, y2, cz], 0.13, 0.13));
        }
      }
    }
    this.shell.add(mesh(mergeGeometries(ribs.filter(Boolean)), steelMat, {
      name: 'PyramidRibCage', cast: true
    }));

    this.pyramidApex = apex;
    this.pyramidCorners = corners;
  }

  /** Flanking single-storey garden halls with clerestory glazing. */
  buildHalls() {
    const M = this.materials;
    const stone = M.surface('hallStone', 'limestone', {
      repeat: 8, roughness: 0.64, exterior: true, color: 0xe0d9ca
    });
    const glass = M.glass('hallClerestory', { color: 0xc8dce4, opacity: 0.22, roughness: 0.07 });

    const walls = [], glazing = [];
    for (const H of COURT.halls) {
      // Solid lower walls with an open colonnade on the court side.
      walls.push(box(H.w, H.h - 2.2, 0.8, [H.x, (H.h - 2.2) / 2, H.z - H.d / 2]));
      walls.push(box(H.w, H.h - 2.2, 0.8, [H.x, (H.h - 2.2) / 2, H.z + H.d / 2]));
      walls.push(box(0.8, H.h - 2.2, H.d, [H.x + Math.sign(H.x) * H.w / 2, (H.h - 2.2) / 2, H.z]));
      walls.push(box(H.w + 2.4, 0.7, H.d + 2.4, [H.x, H.h - 0.35, H.z]));   // roof slab
      walls.push(box(H.w + 1.4, 0.5, H.d + 1.4, [H.x, 0.25, H.z]));          // plinth
      // Clerestory band under the roof.
      glazing.push(box(H.w, 1.9, 0.2, [H.x, H.h - 1.5, H.z - H.d / 2]));
      glazing.push(box(H.w, 1.9, 0.2, [H.x, H.h - 1.5, H.z + H.d / 2]));
      glazing.push(box(0.2, 1.9, H.d, [H.x + Math.sign(H.x) * H.w / 2, H.h - 1.5, H.z]));
      // Court-side colonnade.
      for (let i = 0; i < 6; i++) {
        const z = H.z - H.d / 2 + 5 + i * ((H.d - 10) / 5);
        walls.push(cyl(0.34, 0.4, H.h - 2.2, 10, [H.x - Math.sign(H.x) * H.w / 2, (H.h - 2.2) / 2, z]));
      }
    }
    this.shell.add(mesh(mergeGeometries(walls), stone, { name: 'GardenHalls', cast: true, receive: true }));
    this.shell.add(mesh(mergeGeometries(glazing), glass, { name: 'GardenHallClerestory', renderOrder: 3 }));
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(ReflectionCourt.prototype, {

  facade() {
    this.buildSolarChimney();
    this.buildFountains();
    this.buildCourtLighting();
  },

  /**
   * The solar chimney: a glass tube rising the full height of the pyramid
   * and out through its apex. Section C makes it part of the sustainability
   * core, so it is expressed rather than hidden — you can see the stack from
   * the far end of the court.
   */
  buildSolarChimney() {
    const M = this.materials;
    const P = COURT.pyramid;
    const C = COURT.solarChimney;

    const glassMat = M.glass('chimneyGlass', {
      color: 0xbfe0e8, opacity: 0.2, roughness: 0.05, metalness: 0.05,
      side: THREE.DoubleSide, envMapIntensity: 2.6
    });
    this.shell.add(mesh(
      loft(() => circleRing(C.radius, 24), [1.8, 1.8 + C.top], { capTop: false }),
      glassMat, { name: 'SolarChimneyGlass', renderOrder: 4, pos: [P.x, 0, P.z] }
    ));

    /* The cowl at the top, which is what actually drives the stack effect. */
    const metalMat = M.surface('chimneyCowl', 'brushedMetal', {
      repeat: 2, roughness: 0.3, metalness: 0.82, exterior: true, color: 0xc6ccd4
    });
    const cowl = mergeGeometries([
      cyl(C.radius * 1.9, C.radius * 1.25, 1.1, 20, [P.x, 1.8 + C.top + 1.4, P.z]),
      cyl(C.radius * 1.15, C.radius * 1.15, 2.2, 20, [P.x, 1.8 + C.top + 0.2, P.z], null, true)
    ]);
    this.shell.add(mesh(cowl, metalMat, { name: 'SolarChimneyCowl', cast: true }));

    /**
     * The rising shimmer. D.6's modelling note is explicit: represent the
     * airflow as a drifting particle/shimmer, not a fluid simulation.
     */
    const spriteSet = M.tex.get('glowSprite');
    const shimmerMat = new THREE.PointsMaterial({
      size: 2.4, map: spriteSet.map, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0cc,
      sizeAttenuation: true
    });
    const N = 220;
    const pos = new Float32Array(N * 3);
    const speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * C.radius * 0.8;
      pos[i * 3] = P.x + Math.cos(a) * r;
      pos[i * 3 + 1] = 2 + Math.random() * C.top;
      pos[i * 3 + 2] = P.z + Math.sin(a) * r;
      speed[i] = 1.6 + Math.random() * 2.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, shimmerMat);
    points.name = 'SolarChimneyShimmer';
    points.frustumCulled = false;
    this.detail.add(points);
    this.chimneyShimmer = points;

    this.addAnimator((dt) => {
      const a = geo.attributes.position;
      for (let i = 0; i < N; i++) {
        let y = a.getY(i) + speed[i] * dt;
        if (y > 2 + C.top) {
          y = 2.2;
          const ang = Math.random() * TAU;
          const r = Math.sqrt(Math.random()) * C.radius * 0.8;
          a.setX(i, P.x + Math.cos(ang) * r);
          a.setZ(i, P.z + Math.sin(ang) * r);
        }
        a.setY(i, y);
      }
      a.needsUpdate = true;
    });
  },

  /** Symmetrical fountain jets along the pool's axis. */
  buildFountains() {
    const M = this.materials;
    const spriteSet = M.tex.get('glowSprite');
    const mat = new THREE.PointsMaterial({
      size: 1.1, map: spriteSet.map, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xdff0ff
    });

    const jets = [];
    for (let i = 0; i < 9; i++) {
      const z = lerp(COURT.poolStartZ + 12, COURT.poolEndZ - 12, i / 8);
      jets.push([0, COURT.poolLevel, z]);
    }
    const per = 26;
    const N = jets.length * per;
    const pos = new Float32Array(N * 3);
    const state = [];
    for (let j = 0; j < jets.length; j++) {
      for (let k = 0; k < per; k++) {
        const i = j * per + k;
        state.push({ jet: j, t: Math.random() * 1.6, vy: 5.4 + Math.random() * 1.6, life: 1.6 });
        pos[i * 3] = jets[j][0]; pos[i * 3 + 1] = jets[j][1]; pos[i * 3 + 2] = jets[j][2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, mat);
    pts.name = 'CourtFountainJets';
    pts.frustumCulled = false;
    this.detail.add(pts);

    this.addAnimator((dt) => {
      const a = geo.attributes.position;
      for (let i = 0; i < N; i++) {
        const s = state[i];
        s.t += dt;
        if (s.t > s.life) { s.t = 0; s.vy = 5.4 + Math.random() * 1.6; }
        const j = jets[s.jet];
        const t = s.t;
        a.setXYZ(i,
          j[0] + (i % 7 - 3) * 0.06 * t,
          j[1] + s.vy * t - 4.9 * t * t,
          j[2] + ((i % 5) - 2) * 0.06 * t);
      }
      a.needsUpdate = true;
    });
  },

  /** Bollard lighting along the axis, lit at dusk. */
  buildCourtLighting() {
    const M = this.materials;
    const bodyMat = M.solid('courtBollard', { color: 0x40444a, roughness: 0.5, metalness: 0.5, exterior: true });
    const glowMat = M.solid('courtBollardGlow', {
      color: 0x2a2620, roughness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0
    });
    M.registerNightEmissive(glowMat, 4.0);

    const bodyGeo = cyl(0.16, 0.2, 1.0, 8, [0, 0.5, 0]);
    const glowGeo = cyl(0.17, 0.17, 0.16, 8, [0, 1.02, 0]);
    const xs = [];
    for (let i = 0; i < 26; i++) {
      const z = lerp(COURT.startZ + 8, COURT.endZ - 8, i / 25);
      for (const side of [-1, 1]) {
        xs.push({ pos: [side * (COURT.poolHalfX + 8.5), 0.4, z] });
      }
    }
    this.shell.add(instance(bodyGeo, bodyMat, xs, { name: 'CourtBollards', castShadow: true }));
    this.shell.add(instance(glowGeo, glowMat, xs, { name: 'CourtBollardGlows' }));
  }
});
