/**
 * AEON SPIRE — scene assembly.
 *
 * Builds the site, instantiates the seven zones of Section C and owns the
 * per-frame dispatch. Keeping this separate from main.js means the zone set
 * can be reordered or extended without touching the bootstrap.
 */

import * as THREE from 'three';
import { SITE, CANAL, COURT, ANNEX, ZONE_PRESETS } from '../world/SitePlan.js';
import { Room, InteriorManager, ACOUSTIC } from '../world/Rooms.js';
import { mergeGeometries, xform, box, cyl, mesh, instance, tree, palm } from '../world/BuildKit.js';
import { TAU, rng, clamp, lerp } from '../core/MathUtil.js';
import { ValueNoise } from '../core/Noise.js';

/** Terrain relief field — shared so the ground and the hills agree. */
const noiseField = new ValueNoise(90210);

import { CanalConcourse } from '../zones/CanalConcourse.js';
import { SailAtrium } from '../zones/SailAtrium.js';
import { RingDeck } from '../zones/RingDeck.js';
import { SpireCrown } from '../zones/SpireCrown.js';
import { LeaningObservatory } from '../zones/LeaningObservatory.js';
import { ReflectionCourt } from '../zones/ReflectionCourt.js';
import { WonderAnnex } from '../zones/WonderAnnex.js';

const ZONE_CLASSES = [
  CanalConcourse, SailAtrium, RingDeck, SpireCrown,
  LeaningObservatory, ReflectionCourt, WonderAnnex
];

export class SceneManager {
  /**
   * @param {THREE.Scene} scene
   * @param {MaterialLibrary} materials
   * @param {object} opts { tier, onProgress }
   */
  constructor(scene, materials, { tier, onProgress = () => {} } = {}) {
    this.scene = scene;
    this.materials = materials;
    this.tier = tier;
    this.onProgress = onProgress;

    this.interiors = new InteriorManager({ range: tier ? tier.interiorRange : 190 });
    this.zones = [];
    this.byId = new Map();

    this.ctx = {
      scene, materials,
      interiors: this.interiors,
      tier,
      RoomClasses: { Room, ACOUSTIC }
    };
  }

  build() {
    this.onProgress(0.36, 'Grading the site…');
    this.buildSite();

    const n = ZONE_CLASSES.length;
    for (let i = 0; i < n; i++) {
      const Z = ZONE_CLASSES[i];
      const zone = new Z(this.ctx);
      this.onProgress(0.40 + (i / n) * 0.42, 'Building ' + zone.name + '…');
      zone.build();
      this.scene.add(zone.group);
      this.zones.push(zone);
      this.byId.set(zone.id, zone);
    }

    // World bounding boxes for tilted zones must be recomputed once the
    // whole graph exists, or the Leaning Observatory's rooms would be
    // tested against untilted boxes.
    this.scene.updateMatrixWorld(true);
    for (const r of this.interiors.rooms) {
      if (r._needsWorldBox) {
        const g = r._needsWorldBox;
        const c = r.center.clone().applyMatrix4(g.matrixWorld);
        r.center.copy(c);
        // The tilt is only 8°, so an axis-aligned box grown slightly is a
        // perfectly good proximity volume and stays cheap to test.
        r.size.multiplyScalar(1.12);
        r.box.setFromCenterAndSize(r.center, r.size);
        r._needsWorldBox = null;
      }
    }

    this.onProgress(0.84, 'Planting the grounds…');
    this.buildLandscape();
    return this;
  }

  /**
   * The ground: a tessellated, gently undulating terrain rather than a flat
   * grey plate. The first version was a single unlit-looking disc, which is
   * what made every building on it read as a box sitting on nothing.
   */
  buildSite() {
    const M = this.materials;

    /* --- Distant terrain: a large annulus with real relief and material ---
       This was a CircleGeometry, which is a triangle fan: 97 vertices, all
       but one of them on the rim. Every line of displacement below was
       being applied to a mesh that had no interior vertices to displace,
       which is why the desert read as a flat brown plate. A ring with 72
       radial divisions gives the relief somewhere to happen, and vertex
       colours give the ground large-scale variation — sand drifts, gravel
       pans, scrub — that a 43 m texture tile can never provide. --- */
    const farMat = M.surface('siteFar', 'siteGround', {
      repeat: 140, roughness: 0.97, exterior: true, color: 0xffffff
    });
    farMat.vertexColors = true;
    const far = new THREE.RingGeometry(2, SITE.extent / 2, 168, 72);
    far.rotateX(-Math.PI / 2);
    {
      const pos = far.attributes.position;
      const uv = far.attributes.uv;
      const n = noiseField;
      const col = new Float32Array(pos.count * 3);
      const SAND = [0.76, 0.68, 0.51];
      const GRAVEL = [0.55, 0.53, 0.46];
      const PAN = [0.85, 0.82, 0.72];
      const SCRUB = [0.42, 0.42, 0.31];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        // Flat where the campus sits, rolling beyond it.
        const k = clamp((r - SITE.plazaRadius) / 900, 0, 1);
        const dune = n.fbm(x * 0.0016 + 40, z * 0.0016 + 40, 5) - 0.5;
        const ripple = n.fbm(x * 0.011 + 7, z * 0.011 + 7, 3) - 0.5;
        pos.setY(i, -0.6 + dune * 150 * k * k + ripple * 5.5 * k);
        uv.setXY(i, x * 0.0025, z * 0.0025);

        /* Two independent fields decide the surface: one broad (which
           basin you are in), one fine (whether scrub has taken hold). */
        const broad = n.fbm(x * 0.00085 - 11, z * 0.00085 - 11, 4);
        const fine = n.fbm(x * 0.0065 + 91, z * 0.0065 + 91, 3);
        let c = broad < 0.44 ? SAND : (broad < 0.62 ? GRAVEL : PAN);
        const g = clamp((fine - 0.56) * 4.5, 0, 1) * clamp(k * 2.2, 0, 1);
        const near = 1 - clamp((r - SITE.plazaRadius) / 260, 0, 1);
        for (let j = 0; j < 3; j++) {
          // Blend toward scrub where the fine field is high, and toward the
          // paved campus tone as the ground approaches the plaza edge.
          const v = c[j] * (1 - g) + SCRUB[j] * g;
          col[i * 3 + j] = v * (1 - near * 0.45) + PAN[j] * near * 0.45;
        }
      }
      far.setAttribute('color', new THREE.BufferAttribute(col, 3));
      far.computeVertexNormals();
    }
    this.scene.add(mesh(far, farMat, { name: 'DistantGround', receive: true }));

    /* --- Horizon relief: noise-displaced, heavily squashed domes in three
       depth bands. Cones read as a child's drawing of mountains; a distorted
       dome reads as land. --- */
    const hillMat = M.surface('siteHills', 'siteGround', {
      repeat: 60, roughness: 0.99, exterior: true, color: 0x8b8f79
    });
    const hills = [];
    const hr = rng(2024);
    const bands = [
      { dist: 1500, n: 44, w: 260, h: 90, jitter: 340 },
      { dist: 2350, n: 38, w: 420, h: 170, jitter: 520 },
      { dist: 3300, n: 30, w: 620, h: 260, jitter: 700 }
    ];
    for (const band of bands) {
      for (let i = 0; i < band.n; i++) {
        const a = (i / band.n) * TAU + (hr() - 0.5) * 0.14;
        const dist = band.dist + (hr() - 0.5) * band.jitter;
        const w = band.w * (0.55 + hr() * 1.1);
        const h = band.h * (0.4 + hr() * 1.2);
        const g = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2);
        const pos = g.attributes.position;
        const seed = Math.floor(hr() * 999);
        for (let k = 0; k < pos.count; k++) {
          const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          const d2 = noiseField.fbm(x * 1.7 + seed, z * 1.7 + seed, 4);
          const f = 0.62 + d2 * 0.8;
          pos.setXYZ(k, x * f, y * (0.5 + d2 * 0.9), z * f);
        }
        g.computeVertexNormals();
        g.scale(w, h, w * (0.6 + hr() * 0.8));
        hills.push(xform(g, {
          pos: [Math.cos(a) * dist, -24, Math.sin(a) * dist],
          rot: [0, hr() * TAU, 0]
        }));
      }
    }
    this.scene.add(mesh(mergeGeometries(hills), hillMat, {
      name: 'HorizonRelief', receive: true
    }));

    /* --- The paved campus plaza: an annulus, because the canal ring is a
       void in the ground plane and a filled disc would roof the water over --- */
    const plazaMat = M.surface('sitePlaza', 'paving', {
      repeat: 150, roughness: 0.68, exterior: true, color: 0xb4b0a6
    });
    const plaza = new THREE.RingGeometry(CANAL.outerRadius + 1.6, SITE.plazaRadius, 128, 24);
    plaza.rotateX(-Math.PI / 2);
    {
      const uv = plaza.attributes.uv, pos = plaza.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.012, pos.getZ(i) * 0.012);
    }
    this.scene.add(mesh(xform(plaza, { pos: [0, CANAL.copingLevel - 0.02, 0] }), plazaMat, {
      name: 'CampusPlaza', receive: true
    }));
    this.plaza = plazaMat;

    /* --- Radial paving bands and an inlaid compass, so the plaza has a
       geometry of its own instead of reading as a blank sheet --- */
    const inlayMat = M.solid('plazaInlay', {
      color: 0xd8d2c2, roughness: 0.5, exterior: true
    });
    const inlay = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const r0 = CANAL.outerRadius + 6, r1 = SITE.plazaRadius - 8;
      inlay.push(box(r1 - r0, 0.05, i % 6 === 0 ? 2.4 : 0.9,
        [Math.cos(a) * (r0 + r1) / 2, CANAL.copingLevel + 0.03, Math.sin(a) * (r0 + r1) / 2],
        [0, -a, 0]));
    }
    for (const rad of [CANAL.outerRadius + 40, CANAL.outerRadius + 130, SITE.plazaRadius - 30]) {
      const ring = new THREE.RingGeometry(rad - 0.7, rad + 0.7, 128, 1);
      ring.rotateX(-Math.PI / 2);
      inlay.push(xform(ring, { pos: [0, CANAL.copingLevel + 0.03, 0] }));
    }
    this.scene.add(mesh(mergeGeometries(inlay), inlayMat, {
      name: 'PlazaInlay', receive: true
    }));

    /* --- Approach causeways on the cardinal axes --- */
    const roadMat = M.surface('siteApproach', 'paving', {
      repeat: 40, roughness: 0.72, exterior: true, color: 0x8e8c86
    });
    const roads = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const r0 = SITE.plazaRadius - 10, r1 = SITE.plazaRadius + 620;
      roads.push(box(r1 - r0, 0.5, 34,
        [Math.cos(a) * (r0 + r1) / 2, CANAL.copingLevel - 0.2, Math.sin(a) * (r0 + r1) / 2],
        [0, -a, 0]));
    }
    this.scene.add(mesh(mergeGeometries(roads), roadMat, {
      name: 'ApproachCauseways', receive: true
    }));
  }

  /** Street planting: date palms on the avenues, broadleaf in the groves. */
  buildLandscape() {
    const M = this.materials;
    const treeMat = M.surface('siteTree', 'foliage', {
      repeat: 2, roughness: 0.9, exterior: true, wind: true
    });
    /* Fronds are single strips, so they need both faces drawn. */
    const palmMat = M.surface('sitePalm', 'foliage', {
      repeat: 1, roughness: 0.86, exterior: true, wind: true,
      side: THREE.DoubleSide, color: 0xcfd8b4
    });
    const trunkMat = M.surface('sitePalmTrunk', 'vaultStone', {
      repeat: 2, roughness: 0.86, exterior: true, color: 0xa08a68
    });
    const r = rng(4321);
    const palms = [];
    const trees = [];

    /* A double avenue of palms ringing the canal terrace. */
    for (let i = 0; i < 76; i++) {
      const a = (i / 76) * TAU + 0.03;
      const rad = CANAL.outerRadius + 44 + (i % 2) * 15;
      palms.push({
        pos: [Math.cos(a) * rad, 0.6, Math.sin(a) * rad],
        rot: [0, r() * TAU, 0], scale: 0.85 + r() * 0.4
      });
    }
    /* Palms lining the four approach causeways, so the axes read from the
       air as avenues rather than as bare strips of tarmac. */
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * TAU + Math.PI / 4;
      for (let i = 0; i < 14; i++) {
        const d = SITE.plazaRadius + 20 + i * 42;
        for (const side of [-1, 1]) {
          palms.push({
            pos: [Math.cos(a) * d - Math.sin(a) * side * 24, 0.5,
                  Math.sin(a) * d + Math.cos(a) * side * 24],
            rot: [0, r() * TAU, 0], scale: 0.8 + r() * 0.35
          });
        }
      }
    }
    /* Scattered groves across the outer plaza — broadleaf, for shade. */
    for (let i = 0; i < 96; i++) {
      const a = r() * TAU;
      const rad = SITE.plazaRadius * (0.62 + r() * 0.36);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      // Keep clear of the court's formal axis and the annex pavilions.
      if (z > COURT.startZ - 40 && Math.abs(x) < COURT.halfWidth + 10) continue;
      if (x < -180 && z > -180 && z < 320) continue;
      (r() < 0.42 ? palms : trees).push({
        pos: [x, 0.5, z], rot: [0, r() * TAU, 0], scale: 0.8 + r() * 0.7
      });
    }

    this.landscape = instance(tree(1717, 1.0), treeMat, trees, {
      name: 'SiteTrees', castShadow: true, receiveShadow: true
    });
    this.scene.add(this.landscape);

    /* Three palm cultivars so the avenue is not a row of clones. */
    this.palms = [];
    for (let v = 0; v < 3; v++) {
      const share = palms.filter((_, i) => i % 3 === v);
      if (!share.length) continue;
      const m = instance(palm(4100 + v * 37, 1.0), palmMat, share, {
        name: 'SitePalms_' + v, castShadow: true, receiveShadow: true
      });
      this.palms.push(m);
      this.scene.add(m);
    }
    this.palmTrunkMat = trunkMat;
    this.treeCount = trees.length + palms.length;
  }

  update(dt, t, cameraPos) {
    for (let i = 0; i < this.zones.length; i++) this.zones[i].update(dt, t, cameraPos);
    this.interiors.update(dt, cameraPos);
  }

  zone(id) { return this.byId.get(id); }

  /** Every named interior space, for QA and the HUD. */
  manifest() { return this.interiors.manifest(); }
}
