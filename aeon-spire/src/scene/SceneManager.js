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
import { mergeGeometries, xform, box, mesh, instance, tree } from '../world/BuildKit.js';
import { TAU, rng } from '../core/MathUtil.js';

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

  /** The ground plane, plaza and approach roads. */
  buildSite() {
    const M = this.materials;

    /* Distant terrain, as a ring so it never intrudes on the campus. */
    const farMat = M.solid('siteFar', { color: 0x5f6357, roughness: 0.96, exterior: true });
    const far = new THREE.RingGeometry(SITE.plazaRadius - 2, SITE.extent / 2, 64, 2);
    far.rotateX(-Math.PI / 2);
    this.scene.add(mesh(xform(far, { pos: [0, -0.4, 0] }), farMat, {
      name: 'DistantGround', receive: true
    }));

    /* The paved campus plaza: an annulus, because the canal ring is a void
       in the ground plane and a filled disc would roof the water over. */
    const plazaMat = M.surface('sitePlaza', 'paving', {
      repeat: 110, roughness: 0.7, exterior: true, color: 0xa9a79f
    });
    const plaza = new THREE.RingGeometry(CANAL.outerRadius + 1.6, SITE.plazaRadius, 96, 8);
    plaza.rotateX(-Math.PI / 2);
    const uv = plaza.attributes.uv, pos = plaza.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.012, pos.getZ(i) * 0.012);
    this.scene.add(mesh(xform(plaza, { pos: [0, CANAL.copingLevel - 0.02, 0] }), plazaMat, {
      name: 'CampusPlaza', receive: true
    }));
    this.plaza = plazaMat;
  }

  /** Street trees, planters and the approach avenue. */
  buildLandscape() {
    const M = this.materials;
    const treeMat = M.surface('siteTree', 'foliage', {
      repeat: 2, roughness: 0.9, exterior: true, wind: true
    });
    const r = rng(4321);
    const xs = [];

    // An avenue of trees ringing the canal terrace.
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU + 0.03;
      const rad = CANAL.outerRadius + 46 + (i % 2) * 14;
      xs.push({
        pos: [Math.cos(a) * rad, 0.6, Math.sin(a) * rad],
        rot: [0, r() * TAU, 0], scale: 0.9 + r() * 0.5
      });
    }
    // Scattered planting across the outer plaza.
    for (let i = 0; i < 90; i++) {
      const a = r() * TAU;
      const rad = SITE.plazaRadius * (0.62 + r() * 0.36);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      // Keep clear of the court's formal axis and the annex pavilions.
      if (z > COURT.startZ - 40 && Math.abs(x) < COURT.halfWidth + 10) continue;
      if (x < -180 && z > -180 && z < 320) continue;
      xs.push({ pos: [x, 0.5, z], rot: [0, r() * TAU, 0], scale: 0.8 + r() * 0.7 });
    }
    this.scene.add(instance(tree(1717, 1.0), treeMat, xs, {
      name: 'SiteTrees', castShadow: true, receiveShadow: true
    }));
    this.treeCount = xs.length;
  }

  update(dt, t, cameraPos) {
    for (let i = 0; i < this.zones.length; i++) this.zones[i].update(dt, t, cameraPos);
    this.interiors.update(dt, cameraPos);
  }

  zone(id) { return this.byId.get(id); }

  /** Every named interior space, for QA and the HUD. */
  manifest() { return this.interiors.manifest(); }
}
