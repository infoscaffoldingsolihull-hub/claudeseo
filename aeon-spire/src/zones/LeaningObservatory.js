/**
 * ZONE 5 — THE LEANING OBSERVATORY (detached annex, ground to 40 m)
 *
 * Concept borrowed from the Leaning Tower of Pisa — an intentional 8° lean,
 * declared rather than hidden, and resolved by a specific engineering
 * response: post-tensioned cable anchors and an asymmetric caisson
 * foundation offset against the direction of the tilt.
 *
 * D.5's modelling note is binding here: the tilt is applied as a rotation
 * on the whole annex group, never faked per object. Everything inside
 * therefore leans for real, which is what makes the Entry Hall's floor
 * pattern read as genuinely "off".
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { OBSERVATORY } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, circleRing, loft, mesh, instance,
  member, tube, spiralStair, balustrade, archShape
} from '../world/BuildKit.js';
import { TAU, DEG, lerp, clamp } from '../core/MathUtil.js';

export class LeaningObservatory extends Zone {
  constructor(ctx) {
    super('observatory', 'The Leaning Observatory', ctx);
    this.appearsAtMilestone = 5;

    /* The whole annex hangs off a tilted group. Everything the zone builds
       is parented here, so the 8° lean propagates to the interiors, the
       furniture and the camera presets alike. */
    this.tilted = new THREE.Group();
    this.tilted.name = 'ObservatoryTiltGroup';
    this.tilted.position.set(OBSERVATORY.x, 0, OBSERVATORY.z);
    this.tilted.rotation.set(0, OBSERVATORY.tiltAzimuth, OBSERVATORY.tiltDegrees * DEG, 'YZX');
    this.group.add(this.tilted);

    // Sub-groups mirroring the base class's, but inside the tilt.
    this.tiltShell = new THREE.Group(); this.tiltShell.name = 'observatory:shell';
    this.tiltDetail = new THREE.Group(); this.tiltDetail.name = 'observatory:detail';
    this.tiltInteriors = new THREE.Group(); this.tiltInteriors.name = 'observatory:interiors';
    this.tilted.add(this.tiltShell, this.tiltDetail, this.tiltInteriors);
  }

  get radius() { return OBSERVATORY.anchorRadius + 24; }

  /** Rooms in this zone live inside the tilted group, not the upright one. */
  room(opts) {
    const { Room } = this.ctx.RoomClasses;
    const r = new Room({ zone: this.id, ...opts });
    this.tiltInteriors.add(r.group);
    // The room's world bounding box must account for the tilt, so recompute
    // it from the tilted group's matrix once the graph is settled.
    r._needsWorldBox = this.tilted;
    this.interiors.add(r);
    this.rooms.push(r);
    return r;
  }

  massing() {
    const M = this.materials;
    const R = OBSERVATORY.radius;
    const H = OBSERVATORY.height;

    /* --- Foundation: an asymmetric caisson, offset against the lean --- */
    const concrete = M.surface('obsCaisson', 'polishedConcrete', {
      repeat: 6, roughness: 0.88, exterior: true, color: 0xd8d2c6
    });
    const caisson = new THREE.Group();
    caisson.name = 'AsymmetricCaisson';
    // Built upright in world space — the ground does not lean, the tower does.
    const off = OBSERVATORY.caissonOffset;
    const cx = OBSERVATORY.x + Math.cos(OBSERVATORY.tiltAzimuth + Math.PI / 2) * off;
    const cz = OBSERVATORY.z + Math.sin(OBSERVATORY.tiltAzimuth + Math.PI / 2) * off;
    const parts = [
      cyl(R + 5.5, R + 8.5, 3.2, 26, [cx, -1.4, cz]),
      cyl(R + 2.6, R + 4.2, 1.4, 26, [cx, 0.6, cz])
    ];
    this.shell.add(mesh(mergeGeometries(parts), concrete, {
      name: 'ObservatoryCaisson', cast: true, receive: true
    }));

    /* --- The tilted drum: six storeys of stone arcading --- */
    const stone = M.surface('obsStone', 'limestone', {
      repeat: 9, roughness: 0.6, exterior: true, color: 0xece5d6
    });
    const shellParts = [];
    // Solid core wall.
    shellParts.push(loft(() => circleRing(R, 40), [-2.0, H], { capTop: true, uvScale: 0.06 }));
    this.tiltShell.add(mesh(mergeGeometries(shellParts), stone, {
      name: 'ObservatoryDrum', cast: true, receive: true
    }));

    /* Storey-by-storey arcaded galleries — the tower's rhythm. */
    const arcadeParts = [];
    const colGeo = cyl(0.24, 0.28, 3.5, 8, [0, 1.75, 0]);
    const colXs = [];
    for (let s = 1; s < OBSERVATORY.storeys; s++) {
      const y = s * OBSERVATORY.storeyHeight;
      // Cornice ring.
      arcadeParts.push(loft(() => circleRing(R + 1.05, 40), [y - 0.45, y + 0.2], { capTop: true, capBottom: true }));
      const count = 20;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        colXs.push({ pos: [Math.cos(a) * (R + 0.75), y + 0.2, Math.sin(a) * (R + 0.75)], rot: [0, -a, 0] });
      }
    }
    // Base plinth and top cornice.
    arcadeParts.push(loft(() => circleRing(R + 1.6, 40), [-2.0, 1.2], { capTop: true }));
    arcadeParts.push(loft(() => circleRing(R + 1.3, 40), [H - 1.0, H + 0.9], { capTop: true, capBottom: true }));
    this.tiltShell.add(mesh(mergeGeometries(arcadeParts), stone, {
      name: 'ObservatoryArcades', cast: true, receive: true
    }));
    this.tiltShell.add(instance(colGeo, stone, colXs, {
      name: 'ObservatoryColumns', castShadow: true, receiveShadow: true
    }));

    /* --- Post-tensioned cable anchors: the engineering answer to the lean --- */
    this.buildAnchors();

    /* --- Rooftop tilted terrace --- */
    this.buildTerrace();
  }

  /**
   * Cable anchors run from high on the drum down to ground blocks on the
   * side the tower leans away from. Modelled in world space (upright) with
   * their top ends attached to the tilted drum, so the geometry honestly
   * shows the load path.
   */
  buildAnchors() {
    const M = this.materials;
    const cableMat = M.solid('obsCable', { color: 0x4a4f57, roughness: 0.4, metalness: 0.9, exterior: true });
    const blockMat = M.surface('obsAnchorBlock', 'polishedConcrete', {
      repeat: 2, roughness: 0.9, exterior: true, color: 0xc9c3b8
    });

    const cables = [];
    const blocks = [];
    const attachY = OBSERVATORY.height * 0.82;
    const tiltAxis = new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, OBSERVATORY.tiltAzimuth, OBSERVATORY.tiltDegrees * DEG, 'YZX'));

    for (let i = 0; i < OBSERVATORY.anchorCount; i++) {
      // Anchors cluster on the up-slope side, not evenly around the drum.
      const spread = Math.PI * 1.05;
      const a = OBSERVATORY.tiltAzimuth + Math.PI / 2 - spread / 2 +
        (i / (OBSERVATORY.anchorCount - 1)) * spread;

      const localTop = new THREE.Vector3(
        Math.cos(a) * (OBSERVATORY.radius + 0.6), attachY, Math.sin(a) * (OBSERVATORY.radius + 0.6));
      const worldTop = localTop.clone().applyQuaternion(q)
        .add(new THREE.Vector3(OBSERVATORY.x, 0, OBSERVATORY.z));

      const gx = OBSERVATORY.x + Math.cos(a) * OBSERVATORY.anchorRadius;
      const gz = OBSERVATORY.z + Math.sin(a) * OBSERVATORY.anchorRadius;

      const c = tube(worldTop.toArray(), [gx, 0.9, gz], 0.11, 6);
      if (c) cables.push(c);
      blocks.push(box(3.4, 2.0, 3.4, [gx, 0.5, gz], [0, -a, 0]));
      // Anchor head where the cable meets the drum.
      const head = cyl(0.4, 0.55, 0.9, 10, worldTop.toArray());
      cables.push(head);
    }
    this.shell.add(mesh(mergeGeometries(cables.filter(Boolean)), cableMat, {
      name: 'PostTensionedCables', cast: true
    }));
    this.shell.add(mesh(mergeGeometries(blocks), blockMat, {
      name: 'CableAnchorBlocks', cast: true, receive: true
    }));
  }

  buildTerrace() {
    const M = this.materials;
    const deck = M.surface('obsTerraceDeck', 'paving', {
      repeat: 5, roughness: 0.7, exterior: true, color: 0xd6cfc0
    });
    const R = OBSERVATORY.radius;
    const g = new THREE.CircleGeometry(R - 0.4, 40);
    g.rotateX(-Math.PI / 2);
    this.tiltShell.add(mesh(xform(g, { pos: [0, OBSERVATORY.height + 0.95, 0] }), deck, {
      name: 'RooftopTiltedTerrace', receive: true
    }));

    const railMat = M.solid('obsTerraceRail', { color: 0xb08d3f, roughness: 0.32, metalness: 0.86, exterior: true });
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      pts.push([Math.cos(a) * (R - 0.6), OBSERVATORY.height + 0.95, Math.sin(a) * (R - 0.6)]);
    }
    this.tiltShell.add(mesh(balustrade(pts, 1.1, 2, 0.05, 0.06), railMat, {
      name: 'TerraceBalustrade', cast: true
    }));
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(LeaningObservatory.prototype, {

  facade() {
    this.buildOpenings();
    this.buildEntryPortal();
  },

  /** Arched window openings, one band per storey, following the arcades. */
  buildOpenings() {
    const M = this.materials;
    const glassMat = M.litFacade('obsGlazing', {
      cols: 20, rows: 6, lit: 0.55, seed: 12, color: 0x9fb2c4,
      roughness: 0.1, metalness: 0.2, opacity: 0.5, maxEmissive: 2.2
    });
    const trimMat = M.surface('obsTrim', 'limestone', {
      repeat: 2, roughness: 0.6, exterior: true, color: 0xf0e9da
    });

    const R = OBSERVATORY.radius;
    const glassParts = [];
    const trimParts = [];
    for (let s = 0; s < OBSERVATORY.storeys; s++) {
      const y = 1.6 + s * OBSERVATORY.storeyHeight;
      const count = 12;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + (s % 2) * (Math.PI / count);
        const cx = Math.cos(a), cz = Math.sin(a);
        const g = new THREE.PlaneGeometry(2.6, 3.4);
        glassParts.push(xform(g, { pos: [cx * (R + 0.06), y + 1.9, cz * (R + 0.06)], rot: [0, -a + Math.PI / 2, 0] }));
        // Surround.
        trimParts.push(box(0.34, 3.9, 0.5, [cx * (R + 0.12) - Math.sin(a) * -1.55, y + 1.9, cz * (R + 0.12) + Math.cos(a) * -1.55], [0, -a + Math.PI / 2, 0]));
        trimParts.push(box(0.34, 3.9, 0.5, [cx * (R + 0.12) - Math.sin(a) * 1.55, y + 1.9, cz * (R + 0.12) + Math.cos(a) * 1.55], [0, -a + Math.PI / 2, 0]));
        trimParts.push(box(3.5, 0.42, 0.5, [cx * (R + 0.12), y + 3.9, cz * (R + 0.12)], [0, -a + Math.PI / 2, 0]));
      }
    }
    this.tiltShell.add(mesh(mergeGeometries(glassParts), glassMat, {
      name: 'ObservatoryGlazing', renderOrder: 3
    }));
    this.tiltShell.add(mesh(mergeGeometries(trimParts), trimMat, {
      name: 'ObservatoryWindowTrim', cast: true
    }));
  },

  /** The entrance portal at the base of the tilted drum. */
  buildEntryPortal() {
    const M = this.materials;
    const stone = M.surface('obsPortal', 'limestone', {
      repeat: 2, roughness: 0.58, exterior: true, color: 0xf2ebdc
    });
    const R = OBSERVATORY.radius;
    // Face the portal toward the tower.
    const a = OBSERVATORY.tiltAzimuth + Math.PI;
    const cx = Math.cos(a), cz = Math.sin(a);
    const parts = [];
    const arch = archShape(4.0, 3.0, 2.0, 0.7);
    const g = new THREE.ExtrudeGeometry(arch, { depth: 2.4, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -1.2);
    parts.push(xform(g, { pos: [cx * (R + 0.2), 0, cz * (R + 0.2)], rot: [0, -a + Math.PI / 2, 0] }));
    // Steps up to it.
    for (let i = 0; i < 4; i++) {
      parts.push(box(6.4, 0.28, 1.0,
        [cx * (R + 2.4 + i * 0.9), -0.14 - i * 0.28, cz * (R + 2.4 + i * 0.9)],
        [0, -a + Math.PI / 2, 0]));
    }
    this.tiltShell.add(mesh(mergeGeometries(parts), stone, {
      name: 'ObservatoryEntryPortal', cast: true, receive: true
    }));
  }
});
