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
  waterPlane, balustrade, tree, palm, loft, circleRing
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng } from '../core/MathUtil.js';
import {
  roomShell, remapUV, bench, planter, plaque, signPanel, pipework, ventFan,
  roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { glassBalustrade as glassCourtRail } from '../world/BuildKit.js';

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
      transparent: true, opacity: 0.94, normalMap: set.normalMap, envMapIntensity: 1.55
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
      color: 0x39482b, roughness: 0.92, exterior: true, flatShading: true
    });
    const treeMat = M.surface('courtTree', 'foliage', {
      repeat: 2, roughness: 0.9, exterior: true, wind: true
    });

    const kerbMat = M.surface('courtKerb', 'limestone', {
      repeat: 3, roughness: 0.62, exterior: true, color: 0xe2dac6
    });
    const rillMat = M.glass('courtRill', {
      color: 0xbcd2d4, opacity: 0.5, roughness: 0.04, metalness: 0.1,
      side: THREE.FrontSide, envMapIntensity: 0.9
    });
    const palmMat = M.surface('courtPalm', 'foliage', {
      repeat: 1, roughness: 0.86, exterior: true, wind: true,
      side: THREE.DoubleSide, color: 0xcfd8b4
    });

    const lawns = [], hedges = [], kerbs = [], rills = [];
    const treeXs = [];
    const palmXs = [];
    const r = rng(606);
    for (const q of COURT.quadrants) {
      const g = new THREE.PlaneGeometry(q.w, q.d);
      g.rotateX(-Math.PI / 2);
      lawns.push(xform(g, { pos: [q.x, 0.44, q.z] }));

      /* A dressed stone kerb holds the planting off the paving — without it
         the lawn is a green rectangle laid on grey, which is what a parterre
         must never look like. */
      const KW = 1.4, kx = q.w / 2 + KW / 2, kz = q.d / 2 + KW / 2;
      kerbs.push(box(q.w + KW * 2, 0.66, KW, [q.x, 0.33, q.z - kz]));
      kerbs.push(box(q.w + KW * 2, 0.66, KW, [q.x, 0.33, q.z + kz]));
      kerbs.push(box(KW, 0.66, q.d, [q.x - kx, 0.33, q.z]));
      kerbs.push(box(KW, 0.66, q.d, [q.x + kx, 0.33, q.z]));

      // Clipped hedge border, set inside the kerb.
      hedges.push(box(q.w, 0.85, 0.9, [q.x, 0.85, q.z - q.d / 2]));
      hedges.push(box(q.w, 0.85, 0.9, [q.x, 0.85, q.z + q.d / 2]));
      hedges.push(box(0.9, 0.85, q.d, [q.x - q.w / 2, 0.85, q.z]));
      hedges.push(box(0.9, 0.85, q.d, [q.x + q.w / 2, 0.85, q.z]));
      // A formal cross of paths splits each quadrant into four.
      hedges.push(box(q.w - 2, 0.6, 0.7, [q.x, 0.68, q.z]));

      /* An irrigation rill runs the length of each quadrant on the axis,
         sunk between two stone cheeks — the water that makes the garden
         possible, shown rather than hidden. */
      rills.push(box(1.7, 0.05, q.d - 3, [q.x, 0.52, q.z]));
      kerbs.push(box(0.55, 0.5, q.d - 3, [q.x - 1.12, 0.42, q.z]));
      kerbs.push(box(0.55, 0.5, q.d - 3, [q.x + 1.12, 0.42, q.z]));

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
      /* A palm at each corner of the parterre, marking the crossings. */
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          palmXs.push({
            pos: [q.x + sx * (q.w / 2 + 3.4), 0.4, q.z + sz * (q.d / 2 + 3.4)],
            rot: [0, r() * TAU, 0], scale: 0.9 + r() * 0.25
          });
        }
      }
    }
    this.shell.add(mesh(mergeGeometries(kerbs), kerbMat, { name: 'CourtKerbs', cast: true, receive: true }));
    this.shell.add(mesh(mergeGeometries(rills), rillMat, { name: 'CourtRills', renderOrder: 3 }));
    this.shell.add(instance(palm(3030, 1.0), palmMat, palmXs, {
      name: 'CourtPalms', castShadow: true, receiveShadow: true
    }));
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
      side: THREE.DoubleSide, envMapIntensity: 1.44
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
      side: THREE.DoubleSide, envMapIntensity: 1.55
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

/* ==================================================================== */
/* Phase 4 — interiors (Section D.6)                                    */
/*                                                                      */
/* Pyramid Atrium · Solar Chimney Core · Geothermal & Mechanical        */
/* Viewing Gallery · Garden Court Interior Halls                        */
/* ==================================================================== */

Object.assign(ReflectionCourt.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;

    this.palette = {
      paleStone: M.surface('courtPaleStone', 'limestone', { repeat: 8, roughness: 0.4, color: 0xf2ecdd }),
      inlay: M.solid('courtWhiteInlay', { color: 0xf6f2e8, roughness: 0.32 }),
      steel: M.surface('courtIntSteel', 'paintedSteel', {
        repeat: 2, roughness: 0.4, metalness: 0.66, color: 0xb8bec6, opts: { hex: 0x9aa0a8 }
      }),
      metal: M.surface('courtIntMetal', 'brushedMetal', { repeat: 3, roughness: 0.28, metalness: 0.8 }),
      glass: M.glass('courtGlassInt', { color: 0xd6ecf2, opacity: 0.16, roughness: 0.05, exterior: false }),
      bench: M.surface('courtBenchStone', 'limestone', { repeat: 2, roughness: 0.52, color: 0xe4dccb }),
      dark: M.solid('courtDark', { color: 0x2c3138, roughness: 0.52, metalness: 0.4 }),
      copper: M.solid('courtCopper', { color: 0xa5643a, roughness: 0.36, metalness: 0.82 }),
      foliage: M.surface('courtIntFoliage', 'foliage', { repeat: 3, roughness: 0.9 })
    };
    this.palette.warmGlow = M.solid('courtWarmGlow', {
      color: 0x352c1e, roughness: 0.4, emissive: 0xffce93, emissiveIntensity: 2.2
    });
    this.palette.dataGlow = M.solid('courtDataGlow', {
      color: 0x0c1218, roughness: 0.4, emissive: 0x6fe0c0, emissiveIntensity: 1.4
    });
    M.registerInteriorPalette(this.palette);

    this.roomPyramidAtrium(A);
    this.roomSolarChimneyCore(A);
    this.roomGeothermalGallery(A);
    this.roomGardenHalls(A);
  },

  /* ---------------- Pyramid Atrium ---------------- */

  /** "Inside the glass pyramid, a sunken reflecting basin mirrors the
      exposed steel ribs overhead." */
  roomPyramidAtrium(A) {
    const P = this.palette;
    const Y = COURT.pyramid;
    const room = this.room({
      name: 'Pyramid Atrium', level: 'Ground',
      center: [Y.x, 12, Y.z], size: [Y.base, 26, Y.base],
      acoustic: A.GLASS_ATRIUM, range: 190
    });

    room.lazy((r) => {
      const h = Y.base / 2;

      /* Pale stone floor echoing the exterior pool's white inlay. */
      const floor = new THREE.PlaneGeometry(Y.base - 4, Y.base - 4);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.05);
      r.group.add(mesh(xform(floor, { pos: [Y.x, 1.9, Y.z] }), P.paleStone, {
        name: 'AtriumFloor', receive: true
      }));

      const inlay = [];
      for (let i = 1; i <= 5; i++) {
        const s = (i / 6) * (Y.base - 6);
        inlay.push(box(s, 0.03, 0.28, [Y.x, 1.94, Y.z - s / 2]));
        inlay.push(box(s, 0.03, 0.28, [Y.x, 1.94, Y.z + s / 2]));
        inlay.push(box(0.28, 0.03, s, [Y.x - s / 2, 1.94, Y.z]));
        inlay.push(box(0.28, 0.03, s, [Y.x + s / 2, 1.94, Y.z]));
      }
      r.group.add(mesh(mergeGeometries(inlay), P.inlay, { name: 'AtriumInlay' }));

      /* Prop 1 — the sunken glass-edged reflecting basin. */
      const basinR = 11;
      r.group.add(mesh(mergeGeometries([
        loft(() => circleRing(basinR, 44), [0.5, 1.9], { capTop: false, capBottom: true }),
        loft(() => circleRing(basinR + 0.55, 44), [1.5, 2.05], { capTop: true, capBottom: false })
      ]), P.paleStone, { name: 'SunkenBasin', receive: true }));
      const basinWater = new THREE.CircleGeometry(basinR - 0.15, 44);
      basinWater.rotateX(-Math.PI / 2);
      const wuv = basinWater.attributes.uv, wpos = basinWater.attributes.position;
      for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wpos.getX(i) * 0.06, wpos.getZ(i) * 0.06);
      const basinMat = this.materials.glass('courtBasinWater', {
        color: 0x25505c, opacity: 0.9, roughness: 0.03, metalness: 0.3, exterior: false,
        envMapIntensity: 1.55
      });
      const basinMesh = mesh(xform(basinWater, { pos: [Y.x, 1.35, Y.z] }), basinMat, {
        name: 'BasinWater', renderOrder: 3
      });
      r.group.add(basinMesh);
      r.addProp({
        name: 'Reflecting basin',
        update() {
          const k = 1 + Math.sin(performance.now() * 0.0004) * 0.03;
          basinMesh.scale.set(k, 1, k);
        }
      });

      /* Exposed steel ribs read from inside, mirrored in the basin. */
      const ribs = [];
      const apexY = 1.8 + Y.height;
      for (let i = 0; i < 4; i++) {
        const aC = [[-h, -h], [h, -h], [h, h], [-h, h]][i];
        ribs.push(member([Y.x + aC[0] * 0.94, 2.0, Y.z + aC[1] * 0.94],
          [Y.x, apexY - 1.0, Y.z], 0.42, 0.42));
      }
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const yy = lerp(2.0, apexY - 1.0, t);
        const s = h * 0.94 * (1 - t);
        const pts = [[-s, -s], [s, -s], [s, s], [-s, s]];
        for (let i = 0; i < 4; i++) {
          const a = pts[i], b = pts[(i + 1) % 4];
          ribs.push(member([Y.x + a[0], yy, Y.z + a[1]], [Y.x + b[0], yy, Y.z + b[1]], 0.22, 0.22));
        }
      }
      r.group.add(mesh(mergeGeometries(ribs.filter(Boolean)), P.steel, {
        name: 'ExposedPyramidRibs', cast: true
      }));

      /* Prop 2 — warm accent uplighting that supplements the daylight at dusk. */
      const uplights = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        uplights.push({ pos: [Y.x + Math.cos(a) * (basinR + 3.2), 1.95, Y.z + Math.sin(a) * (basinR + 3.2)] });
      }
      r.group.add(instance(cyl(0.2, 0.2, 0.1, 12, [0, 0.36, 0]), P.warmGlow, uplights, {
        name: 'AtriumUplights'
      }));
      r.group.add(instance(cyl(0.22, 0.26, 0.34, 12, [0, 0.17, 0]), P.metal, uplights, {
        name: 'AtriumUplightHousings'
      }));
      const atriumLights = [
        roomLight(r, 0xfff0d4, 70, 60, [Y.x, 14, Y.z]),
        roomLight(r, 0xffd9a8, 30, 30, [Y.x - 14, 4, Y.z]),
        roomLight(r, 0xffd9a8, 30, 30, [Y.x + 14, 4, Y.z])
      ];
      r.addProp({
        name: 'Atrium accent lighting',
        update() {
          const k = 0.88 + Math.sin(performance.now() * 0.00036) * 0.12;
          atriumLights[1].intensity = 30 * k;
          atriumLights[2].intensity = 30 * k;
        }
      });

      /* Prop 3 — a slowly revolving model of the sustainability core. */
      const model = new THREE.Group();
      model.name = 'SustainabilityModel';
      model.position.set(Y.x + 20, 2.9, Y.z - 18);
      model.add(mesh(cyl(1.6, 1.8, 1.0, 20, [0, -0.5, 0]), P.paleStone, { name: 'ModelPlinth' }));
      const turn = new THREE.Group();
      model.add(turn);
      turn.add(mesh(mergeGeometries([
        cyl(0.3, 0.3, 2.2, 12, [0, 1.1, 0]),
        box(1.6, 0.1, 1.6, [0, 0.06, 0]),
        cyl(0.14, 0.14, 1.4, 8, [0.6, 0.7, 0.4]),
        cyl(0.14, 0.14, 1.0, 8, [-0.55, 0.5, -0.3])
      ]), P.copper, { name: 'ModelCore' }));
      r.group.add(model);
      r.addProp({ name: 'Sustainability model', update: (dt) => { turn.rotation.y += dt * 0.28; } });

      /* Stone benches around the basin. */
      const benches = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        benches.push({ pos: [Y.x + Math.cos(a) * (basinR + 6), 1.95, Y.z + Math.sin(a) * (basinR + 6)], rot: [0, -a, 0] });
      }
      r.group.add(instance(bench(2.6, 0.46), P.bench, benches, { name: 'AtriumBenches', castShadow: true }));
    });
  },

  /* ---------------- Solar Chimney Core ---------------- */

  roomSolarChimneyCore(A) {
    const P = this.palette;
    const Y = COURT.pyramid;
    const C = COURT.solarChimney;
    const room = this.room({
      name: 'Solar Chimney Core', level: 'Ground → 50 m',
      center: [Y.x, C.top / 2 + 2, Y.z], size: [16, C.top, 16],
      acoustic: A.GLASS_ATRIUM, range: 170
    });

    room.lazy((r) => {
      /* The inner glass lining and its spiral of stiffening rings. */
      r.group.add(mesh(
        loft(() => circleRing(C.radius - 0.3, 24), [2.0, 2.0 + C.top], { capTop: false }),
        P.glass, { name: 'ChimneyInnerLining', renderOrder: 4, pos: [Y.x, 0, Y.z] }
      ));
      const rings = [];
      for (let i = 0; i < 14; i++) {
        const y = 2.0 + (i / 14) * C.top;
        const g = new THREE.TorusGeometry(C.radius + 0.1, 0.075, 6, 24);
        g.rotateX(Math.PI / 2);
        rings.push(xform(g, { pos: [Y.x, y, Y.z] }));
      }
      r.group.add(mesh(mergeGeometries(rings), P.metal, { name: 'ChimneyStiffeningRings' }));

      /* The absorber surface at the base — matt black, which is what makes
         the stack effect work. */
      r.group.add(mesh(
        loft(() => circleRing(C.radius + 0.35, 24), [2.0, 8.0], { capTop: false }),
        P.dark, { name: 'ChimneyAbsorber' }
      ));

      /**
       * Prop 1 — the upward shimmer. D.6's modelling note is explicit: a
       * simple upward-drifting particle/shimmer, not a fluid simulation.
       */
      const spriteSet = this.materials.tex.get('glowSprite');
      const shimmerMat = new THREE.PointsMaterial({
        size: 1.5, map: spriteSet.map, transparent: true, opacity: 0.32,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6bc
      });
      const N = 180;
      const pos = new Float32Array(N * 3);
      const sp = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * TAU;
        const rad = Math.sqrt(Math.random()) * (C.radius - 0.6);
        pos[i * 3] = Y.x + Math.cos(a) * rad;
        pos[i * 3 + 1] = 2.4 + Math.random() * C.top;
        pos[i * 3 + 2] = Y.z + Math.sin(a) * rad;
        sp[i] = 2.2 + Math.random() * 3.4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, shimmerMat);
      pts.frustumCulled = false;
      pts.name = 'ChimneyShimmer';
      r.group.add(pts);
      r.addProp({
        name: 'Solar chimney shimmer',
        update(dt) {
          const a = geo.attributes.position;
          for (let i = 0; i < N; i++) {
            let y = a.getY(i) + sp[i] * dt;
            if (y > 2.4 + C.top) {
              y = 2.4;
              const ang = Math.random() * TAU;
              const rad = Math.sqrt(Math.random()) * (C.radius - 0.6);
              a.setX(i, Y.x + Math.cos(ang) * rad);
              a.setZ(i, Y.z + Math.sin(ang) * rad);
            }
            a.setY(i, y);
          }
          a.needsUpdate = true;
        }
      });

      /* Prop 2 — dampers at the base that open and close on a cycle. */
      const dampers = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const g = new THREE.Group();
        g.position.set(Y.x + Math.cos(a) * (C.radius + 0.4), 3.4, Y.z + Math.sin(a) * (C.radius + 0.4));
        g.rotation.y = -a;
        const blades = [];
        for (let k = 0; k < 3; k++) {
          const bl = new THREE.Group();
          bl.position.y = -0.5 + k * 0.5;
          bl.add(mesh(box(1.3, 0.42, 0.05, [0, 0, 0]), P.metal, { name: 'DamperBlade' }));
          g.add(bl);
          blades.push(bl);
        }
        r.group.add(g);
        dampers.push(blades);
      }
      r.addProp({
        name: 'Chimney dampers',
        update() {
          const k = Math.sin(performance.now() * 0.00035) * 0.7;
          for (const set of dampers) for (const b of set) b.rotation.x = k;
        }
      });

      /* Prop 3 — an airflow readout on the chimney base. */
      const boardMat = P.dataGlow;
      r.group.add(mesh(box(2.4, 0.9, 0.08, [Y.x, 4.6, Y.z + C.radius + 0.45]), boardMat, {
        name: 'AirflowReadout'
      }));
      const glow = roomLight(r, 0x9fe8d0, 14, 14, [Y.x, 4.8, Y.z + C.radius + 2]);
      r.addProp({
        name: 'Airflow readout',
        update() {
          const p = performance.now() * 0.001;
          boardMat.emissiveIntensity = 1.1 + Math.abs(Math.sin(p * 0.9)) * 0.6;
          glow.intensity = 12 + Math.sin(p * 0.9) * 3;
        }
      });
    });
  },

  /* ---------------- Geothermal & Mechanical Viewing Gallery ---------------- */

  /** "A viewing gallery looks down over exposed geothermal pipework and heat
      exchangers, with educational signage." */
  roomGeothermalGallery(A) {
    const P = this.palette;
    const Y = COURT.pyramid;
    const room = this.room({
      name: 'Geothermal & Mechanical Viewing Gallery', level: 'B1',
      center: [Y.x, -3.5, Y.z - 22], size: [40, 12, 30],
      acoustic: A.MACHINE_ROOM, range: 160
    });

    room.lazy((r) => {
      const g = new THREE.Group();
      g.position.set(Y.x, 0, Y.z - 22);
      r.group.add(g);

      /* The plant room below, and the gallery deck looking down into it. */
      const shell = roomShell(38, 8, 28, { open: [], center: [0, -8.4, 0] });
      g.add(mesh(mergeGeometries(shell.floor), P.dark, { name: 'PlantRoomFloor', receive: true }));
      g.add(mesh(mergeGeometries(shell.walls), P.dark, { name: 'PlantRoomWalls', receive: true }));

      const deck = new THREE.PlaneGeometry(38, 9);
      deck.rotateX(-Math.PI / 2);
      remapUV(deck, 'xz', 0.16);
      g.add(mesh(xform(deck, { pos: [0, -0.4, -9.5] }), P.paleStone, {
        name: 'GalleryDeck', receive: true
      }));
      const railPts = [];
      for (let i = 0; i <= 18; i++) railPts.push([-19 + i * (38 / 18), -0.4, -5.0]);
      g.add(mesh(glassCourtRail(railPts, 1.15), P.glass, { name: 'GalleryGuard', renderOrder: 4 }));
      g.add(mesh(balustrade(railPts.map(p => [p[0], p[1] + 1.12, p[2]]), 0.05, 2, 0.03, 0.05), P.metal,
        { name: 'GalleryHandrail' }));

      /* Prop 1 — the exposed geothermal pipework and heat exchangers. */
      const pipes = pipework(77, 30, 18);
      const pipeMesh = mesh(xform(pipes, { pos: [0, -8.0, 2] }), P.copper, {
        name: 'GeothermalPipework', cast: true
      });
      g.add(pipeMesh);
      /* Flow indicators travelling along the primary loop. */
      const flowMat = P.dataGlow;
      const flowGeo = new THREE.SphereGeometry(0.16, 8, 6);
      const flowXs = [];
      for (let i = 0; i < 18; i++) flowXs.push({ pos: [-14 + i * 1.6, -6.4, 2 + (i % 3) * 3.5] });
      const flowMesh = instance(flowGeo, flowMat, flowXs, { name: 'FlowIndicators' });
      g.add(flowMesh);
      let ft = 0;
      const mtx = new THREE.Matrix4();
      r.addProp({
        name: 'Geothermal flow',
        update(dt) {
          ft += dt * 3.2;
          for (let i = 0; i < flowXs.length; i++) {
            const x = -15 + ((i * 1.7 + ft) % 30);
            mtx.makeTranslation(x, -6.4 + Math.sin(i) * 1.4, 2 + (i % 3) * 3.5);
            flowMesh.setMatrixAt(i, mtx);
          }
          flowMesh.instanceMatrix.needsUpdate = true;
        }
      });

      /* Prop 2 — circulation pumps whose rotors turn. */
      const pumps = [];
      for (let i = 0; i < 3; i++) {
        const px = -10 + i * 10;
        g.add(mesh(mergeGeometries([
          box(2.0, 1.2, 1.4, [px, -7.6, -4]),
          cyl(0.7, 0.7, 0.9, 14, [px, -6.6, -4])
        ]), P.metal, { name: 'CirculationPump' }));
        const fan = ventFan(0.55, 6);
        fan.rotor.add(mesh(fan.geometry, P.steel, { name: 'PumpRotor' }));
        fan.rotor.position.set(px, -6.05, -4);
        g.add(fan.rotor);
        pumps.push(fan);
      }
      r.addProp({ name: 'Circulation pumps', update: (dt) => { for (const p of pumps) p.update(dt); } });

      /* Prop 3 — educational signage along the gallery rail. */
      const signs = [];
      for (let i = 0; i < 4; i++) {
        signs.push({ pos: [-13 + i * 9, -0.4, -6.4], rot: [0, 0, 0] });
      }
      g.add(instance(plaque(1.2, 0.7, 1.0), P.metal, signs, { name: 'GallerySignage' }));
      g.add(mesh(box(9.0, 1.1, 0.08, [0, 1.9, -13.6]), P.warmGlow, { name: 'GalleryHeaderSign' }));
      const signLight = roomLight(r, 0xffdcb0, 22, 20, [Y.x, -3.0 + 3.0, Y.z - 22 - 10]);
      const plantLight = roomLight(r, 0xbfd4e8, 30, 34, [Y.x, -3.0 - 3, Y.z - 22 + 2]);
      r.addProp({
        name: 'Gallery signage lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00052) * 0.1;
          signLight.intensity = 22 * k;
          plantLight.intensity = 30 * k;
        }
      });
    });
  },

  /* ---------------- Garden Court Interior Halls ---------------- */

  /** "Flanking garden halls have clerestory glazing, stone flooring, and
      quiet water channels underfoot." */
  roomGardenHalls(A) {
    const P = this.palette;
    const room = this.room({
      name: 'Garden Court Interior Halls', level: 'Ground',
      center: [0, 4, COURT.halls[0].z], size: [220, 12, 80],
      acoustic: A.STONE_VAULT, range: 180
    });

    room.lazy((r) => {
      const channelMat = this.materials.glass('courtChannelWater', {
        color: 0x2b5a66, opacity: 0.82, roughness: 0.05, metalness: 0.2, exterior: false
      });
      const floors = [], channels = [], benches = [], colonnades = [], beams = [];
      const lights = [];

      for (const H of COURT.halls) {
        const floor = new THREE.PlaneGeometry(H.w - 1.6, H.d - 1.6);
        floor.rotateX(-Math.PI / 2);
        remapUV(floor, 'xz', 0.12);
        floors.push(xform(floor, { pos: [H.x, 0.56, H.z] }));

        /* Quiet water channels underfoot, running the hall's length. */
        for (const off of [-H.w * 0.28, H.w * 0.28]) {
          const ch = new THREE.PlaneGeometry(1.2, H.d - 8);
          ch.rotateX(-Math.PI / 2);
          const cuv = ch.attributes.uv, cpos = ch.attributes.position;
          for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cpos.getX(i) * 0.2, cpos.getZ(i) * 0.2);
          channels.push(xform(ch, { pos: [H.x + off, 0.62, H.z] }));
          // Channel kerbs.
          floors.push(box(0.3, 0.2, H.d - 8, [H.x + off - 0.75, 0.62, H.z]));
          floors.push(box(0.3, 0.2, H.d - 8, [H.x + off + 0.75, 0.62, H.z]));
        }

        /* Simple stone benches. */
        for (let i = 0; i < 4; i++) {
          const z = H.z - H.d / 2 + 10 + i * ((H.d - 20) / 3);
          benches.push({ pos: [H.x, 0.56, z], rot: [0, 0, 0] });
        }

        /* Interior colonnade and the beams carrying the clerestory. */
        for (let i = 0; i < 6; i++) {
          const z = H.z - H.d / 2 + 5 + i * ((H.d - 10) / 5);
          for (const sx of [-1, 1]) {
            colonnades.push(cyl(0.3, 0.36, H.h - 3.0, 10, [H.x + sx * (H.w * 0.3), 0.56 + (H.h - 3.0) / 2, z]));
          }
          beams.push(box(H.w - 1.4, 0.34, 0.4, [H.x, H.h - 2.3, z]));
        }
        lights.push(roomLight(r, 0xffe2ba, 26, 30, [H.x, H.h - 3.0, H.z]));
        lights.push(roomLight(r, 0xdfeaf5, 18, 24, [H.x, H.h - 1.6, H.z - H.d * 0.3]));
      }

      r.group.add(mesh(mergeGeometries(floors), P.paleStone, { name: 'HallFloors', receive: true }));
      const channelMesh = mesh(mergeGeometries(channels), channelMat, {
        name: 'WaterChannels', renderOrder: 3
      });
      r.group.add(channelMesh);
      r.group.add(mesh(mergeGeometries(colonnades), P.paleStone, {
        name: 'HallColonnade', cast: true, receive: true
      }));
      r.group.add(mesh(mergeGeometries(beams), P.bench, { name: 'ClerestoryBeams', cast: true }));
      r.group.add(instance(bench(2.4, 0.44), P.bench, benches, { name: 'HallBenches', castShadow: true }));

      /* Prop 1 — the channels flow, their surface drifting. */
      r.addProp({
        name: 'Water channels',
        update() {
          const k = 0.74 + Math.sin(performance.now() * 0.0011) * 0.08;
          channelMat.opacity = k;
        }
      });

      /* Prop 2 — daylight through the clerestory, shifting through the day. */
      r.addProp({
        name: 'Clerestory daylight',
        update() {
          const k = 0.85 + Math.sin(performance.now() * 0.0003) * 0.15;
          for (const l of lights) l.intensity = (l.color.b > 0.9 ? 18 : 26) * k;
        }
      });

      /* Prop 3 — planting in the halls that stirs. */
      const pl = planter(2.2, 0.8, 0.6);
      const tubs = [], leaves = [];
      for (const H of COURT.halls) {
        for (let i = 0; i < 5; i++) {
          const z = H.z - H.d / 2 + 8 + i * ((H.d - 16) / 4);
          const e = { pos: [H.x - Math.sign(H.x) * (H.w * 0.34), 0.56, z], rot: [0, Math.PI / 2, 0] };
          tubs.push(e); leaves.push(e);
        }
      }
      r.group.add(instance(pl.tub, P.bench, tubs, { name: 'HallPlanters' }));
      const leafMesh = instance(pl.foliage, P.foliage, leaves, { name: 'HallPlanting', castShadow: true });
      r.group.add(leafMesh);
      r.addProp({
        name: 'Hall planting',
        update() { leafMesh.rotation.y = Math.sin(performance.now() * 0.00045) * 0.008; }
      });
    });
  }
});
