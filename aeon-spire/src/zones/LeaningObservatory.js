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
import { TAU, DEG, lerp, clamp, rng } from '../core/MathUtil.js';
import {
  roomShell, remapUV, seatPod, sofa, lowTable, chair, bench, planter, plaque,
  signPanel, swingDoor, levelingPlinth, roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { flag } from '../world/BuildKit.js';

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

/* ==================================================================== */
/* Phase 4 — interiors (Section D.5)                                    */
/*                                                                      */
/* Entry Hall · Spiral Marble Stair · Tilt-Corrected Visitor Lounge ·   */
/* Rooftop Tilted Terrace                                               */
/*                                                                      */
/* Every room below is parented inside the tilted group, so the 8° lean */
/* is a genuine consequence of the annex's rotation (D.5's binding      */
/* modelling note) rather than something faked per object.              */
/* ==================================================================== */

Object.assign(LeaningObservatory.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;
    const tilt = OBSERVATORY.tiltDegrees * DEG;

    this.palette = {
      marble: M.surface('obsMarble', 'marble', { repeat: 6, roughness: 0.11, metalness: 0.04 }),
      plaster: M.surface('obsPlaster', 'plaster', { repeat: 5, roughness: 0.86, color: 0xf4ecdb }),
      limestone: M.surface('obsIntStone', 'limestone', { repeat: 6, roughness: 0.5 }),
      brass: M.solid('obsBrass', { color: 0xc9a04b, roughness: 0.26, metalness: 0.9 }),
      steel: M.surface('obsSteel', 'brushedMetal', { repeat: 3, roughness: 0.3, metalness: 0.8 }),
      deck: M.surface('obsDeck', 'paintedTimber', { repeat: 3, roughness: 0.62, color: 0xd9c9a8 }),
      fabric: M.solid('obsFabric', { color: 0x8a5f4a, roughness: 0.7 }),
      glass: M.glass('obsGlassInt', { color: 0xd6e8f0, opacity: 0.2, roughness: 0.06, exterior: false }),
      dark: M.solid('obsDark', { color: 0x30343b, roughness: 0.5, metalness: 0.4 })
    };
    this.palette.warmGlow = M.solid('obsWarmGlow', {
      color: 0x352c1e, roughness: 0.4, emissive: 0xffc98a, emissiveIntensity: 2.6
    });
    M.registerInteriorPalette(this.palette);
    this.tiltRad = tilt;

    this.roomEntryHall(A);
    this.roomSpiralStair(A);
    this.roomVisitorLounge(A);
    this.roomRooftopTerrace(A);
  },

  /* ---------------- Entry Hall ---------------- */

  /** "A concentric-ring floor pattern reads as subtly skewed because of the
      annex's genuine 8° lean — a deliberate, playful acknowledgment." */
  roomEntryHall(A) {
    const P = this.palette;
    const R = OBSERVATORY.radius;
    const room = this.room({
      name: 'Entry Hall', level: 'Ground',
      center: [0, 2.6, 0], size: [R * 2, 6, R * 2],
      acoustic: A.MARBLE_HALL, range: 110
    });

    room.lazy((r) => {
      const floor = new THREE.CircleGeometry(R - 0.6, 40);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.09);
      r.group.add(mesh(xform(floor, { pos: [0, 0.06, 0] }), P.marble, {
        name: 'MarbleFloor', receive: true
      }));

      /* The concentric-ring inlay. It is drawn perfectly true in the annex's
         own frame; the tilt is what makes it read as "off" to a visitor. */
      const inlay = [];
      for (let i = 1; i <= 7; i++) {
        const rad = (i / 7) * (R - 1.4);
        const g = new THREE.RingGeometry(rad - 0.09, rad + 0.09, 60);
        g.rotateX(-Math.PI / 2);
        inlay.push(xform(g, { pos: [0, 0.1, 0] }));
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        inlay.push(box(0.12, 0.02, R - 1.6, [Math.cos(a) * (R - 1.6) / 2, 0.1, Math.sin(a) * (R - 1.6) / 2], [0, -a, 0]));
      }
      r.group.add(mesh(mergeGeometries(inlay), P.brass, { name: 'ConcentricRingInlay' }));

      /* Plastered walls and a coffered soffit. */
      r.group.add(mesh(
        loft(() => circleRing(R - 0.5, 40), [0, 5.6], { capTop: false }),
        P.plaster, { name: 'HallWalls', receive: true }
      ));
      const soffit = new THREE.CircleGeometry(R - 0.5, 40);
      soffit.rotateX(Math.PI / 2);
      remapUV(soffit, 'xz', 0.12);
      r.group.add(mesh(xform(soffit, { pos: [0, 5.7, 0] }), P.plaster, { name: 'HallSoffit' }));

      /* Prop 1 — a plumb-bob hanging dead vertical in world space, which is
         the clearest possible demonstration that the building is what leans. */
      const plumb = new THREE.Group();
      plumb.name = 'PlumbLine';
      plumb.position.set(0, 5.5, 0);
      const wire = mesh(cyl(0.012, 0.012, 4.0, 5, [0, -2.0, 0]), P.dark, { name: 'PlumbWire' });
      const bob = mesh(mergeGeometries([
        cyl(0.11, 0.02, 0.3, 10, [0, -4.15, 0]),
        cyl(0.11, 0.11, 0.16, 10, [0, -3.92, 0])
      ]), P.brass, { name: 'PlumbBob' });
      plumb.add(wire, bob);
      r.group.add(plumb);
      const tiltRad = this.tiltRad;
      r.addProp({
        name: 'Plumb line',
        update() {
          // Counter-rotate so the line hangs truly vertical despite the tilt.
          plumb.rotation.z = -tiltRad;
          plumb.rotation.x = Math.sin(performance.now() * 0.0007) * 0.006;
        }
      });

      /* Prop 2 — the entrance doors. */
      const a = OBSERVATORY.tiltAzimuth + Math.PI;
      const door = swingDoor(1.5, 2.9);
      door.pivot.add(mesh(door.geometry, P.deck, { name: 'DoorLeaf' }));
      door.pivot.position.set(Math.cos(a) * (R - 0.8) - Math.sin(a) * 0.8, 0.06, Math.sin(a) * (R - 0.8) + Math.cos(a) * 0.8);
      door.pivot.rotation.y = -a + Math.PI / 2;
      r.group.add(door.pivot);
      r.addProp({ name: 'Entrance door', update: (dt) => door.update(dt) });

      /* Prop 3 — an interpretation panel on the lean, warm-lit. */
      r.group.add(mesh(signPanel(3.0, 0.9), P.warmGlow, {
        name: 'TiltInterpretationPanel',
        pos: [Math.cos(a + 2.2) * (R - 0.9), 2.3, Math.sin(a + 2.2) * (R - 0.9)],
        rot: [0, -(a + 2.2) + Math.PI / 2, 0]
      }));
      const plaques = [];
      for (let i = 0; i < 3; i++) {
        const aa = a + 1.4 + i * 0.55;
        plaques.push({ pos: [Math.cos(aa) * (R - 3.2), 0.06, Math.sin(aa) * (R - 3.2)], rot: [0, -aa + Math.PI, 0] });
      }
      r.group.add(instance(plaque(0.9, 0.55, 0.95), P.steel, plaques, { name: 'EntryPlaques' }));
      const hallLight = roomLight(r, 0xffd9ac, 44, 30, [0, 4.4, 0]);
      const panelLight = roomLight(r, 0xffe0b4, 16, 12,
        [Math.cos(a + 2.2) * (R - 3), 2.8, Math.sin(a + 2.2) * (R - 3)]);
      r.addProp({
        name: 'Entry hall lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.0004) * 0.1;
          hallLight.intensity = 44 * k;
          panelLight.intensity = 16 * k;
        }
      });
    });
  },

  /* ---------------- Spiral Marble Stair ---------------- */

  /** "A brass-railed marble spiral stair winds upward past walls that expose
      the post-tensioned cable anchor points as a visible architectural
      feature." */
  roomSpiralStair(A) {
    const P = this.palette;
    const R = OBSERVATORY.radius;
    const yTop = OBSERVATORY.height - 4;
    const room = this.room({
      name: 'Spiral Marble Stair', level: 'Ground → L5',
      center: [0, yTop / 2 + 3, 0], size: [R * 2, yTop, R * 2],
      acoustic: A.MARBLE_HALL, range: 110
    });

    room.lazy((r) => {
      const turns = 3.2;
      const stair = spiralStair(1.5, R - 3.4, 6.2, yTop, turns, 18, 0.16);
      r.group.add(mesh(stair, P.marble, { name: 'MarbleSpiralStair', cast: true, receive: true }));

      /* Brass balustrade following the helix. */
      const total = Math.round(turns * 18);
      const rail = [];
      for (let i = 0; i <= total; i++) {
        const t = (i / total) * turns * TAU;
        const y = 6.2 + (i / total) * (yTop - 6.2);
        rail.push([Math.cos(t) * (R - 3.6), y, Math.sin(t) * (R - 3.6)]);
      }
      r.group.add(mesh(balustrade(rail, 1.0, 2, 0.028, 0.05), P.brass, {
        name: 'BrassStairRail', cast: true
      }));

      /* Prop 1 — the exposed cable-anchor feature wall. The anchors are the
         engineering answer to the lean, so the interior shows them off. */
      const anchors = [];
      const heads = [];
      for (let i = 0; i < OBSERVATORY.anchorCount; i++) {
        const spread = Math.PI * 1.05;
        const a = OBSERVATORY.tiltAzimuth + Math.PI / 2 - spread / 2 +
          (i / (OBSERVATORY.anchorCount - 1)) * spread;
        const y = OBSERVATORY.height * 0.82;
        // Anchor plate, lock-off nut and the strand bundle disappearing into
        // the wall — a recognisable post-tensioning assembly.
        anchors.push(box(1.4, 1.4, 0.35, [Math.cos(a) * (R - 0.6), y, Math.sin(a) * (R - 0.6)], [0, -a + Math.PI / 2, 0]));
        anchors.push(cyl(0.34, 0.34, 0.5, 10, [Math.cos(a) * (R - 1.0), y, Math.sin(a) * (R - 1.0)], [0, -a, Math.PI / 2]));
        for (let k = 0; k < 6; k++) {
          const off = (k - 2.5) * 0.11;
          anchors.push(cyl(0.035, 0.035, 1.6,
            5, [Math.cos(a) * (R - 1.4) - Math.sin(a) * off, y + off * 0.6, Math.sin(a) * (R - 1.4) + Math.cos(a) * off],
            [0, -a, Math.PI / 2]));
        }
        heads.push({ pos: [Math.cos(a) * (R - 0.75), y, Math.sin(a) * (R - 0.75)], rot: [0, -a + Math.PI / 2, 0] });
      }
      r.group.add(mesh(mergeGeometries(anchors), P.steel, {
        name: 'CableAnchorFeatureWall', cast: true
      }));
      const anchorSpot = roomSpot(r, 0xfff0d0, 260, 40,
        [0, OBSERVATORY.height * 0.62, 0],
        [Math.cos(OBSERVATORY.tiltAzimuth + Math.PI / 2) * R, OBSERVATORY.height * 0.82,
         Math.sin(OBSERVATORY.tiltAzimuth + Math.PI / 2) * R], 0.85, 0.6);
      r.addProp({
        name: 'Cable-anchor feature lighting',
        update() { anchorSpot.intensity = 230 + Math.sin(performance.now() * 0.00065) * 55; }
      });

      /* Prop 2 — warm accent lighting that climbs with the stair. */
      const strip = [];
      for (let i = 0; i < total; i += 2) {
        const t0 = (i / total) * turns * TAU, t1 = ((i + 2) / total) * turns * TAU;
        const y0 = 6.2 + (i / total) * (yTop - 6.2), y1 = 6.2 + ((i + 2) / total) * (yTop - 6.2);
        const m = member(
          [Math.cos(t0) * (R - 3.9), y0 - 0.18, Math.sin(t0) * (R - 3.9)],
          [Math.cos(t1) * (R - 3.9), y1 - 0.18, Math.sin(t1) * (R - 3.9)], 0.07, 0.07);
        if (m) strip.push(m);
      }
      r.group.add(mesh(mergeGeometries(strip.filter(Boolean)), P.warmGlow, { name: 'StairAccentStrip' }));
      const climbLights = [];
      for (let i = 0; i < 4; i++) {
        climbLights.push(roomLight(r, 0xffcf9c, 20, 22, [0, 8 + i * 7, 0]));
      }
      r.addProp({
        name: 'Stair accent lighting',
        update() {
          const t = performance.now() * 0.0009;
          for (let i = 0; i < climbLights.length; i++) {
            climbLights[i].intensity = 15 + Math.max(0, Math.sin(t - i * 0.8)) * 12;
          }
        }
      });

      /* Prop 3 — a landing door at mid-height. */
      const door = swingDoor(1.1, 2.3, { period: 12 });
      door.pivot.add(mesh(door.geometry, P.deck, { name: 'DoorLeaf' }));
      door.pivot.position.set(R - 2.4, 6.2 + (yTop - 6.2) * 0.5, 0);
      door.pivot.rotation.y = -Math.PI / 2;
      r.group.add(door.pivot);
      r.addProp({ name: 'Landing door', update: (dt) => door.update(dt) });
    });
  },

  /* ---------------- Tilt-Corrected Visitor Lounge ---------------- */

  /** "The Visitor Lounge furniture sits on hydraulic-leveling plinths, with
      signage explaining the auto-leveling response to the tilt." */
  roomVisitorLounge(A) {
    const P = this.palette;
    const R = OBSERVATORY.radius;
    const y = OBSERVATORY.storeyHeight * 4;
    const room = this.room({
      name: 'Tilt-Corrected Visitor Lounge', level: 'L4',
      center: [0, y + 3, 0], size: [R * 2, 6.4, R * 2],
      acoustic: A.PADDED_LOUNGE, range: 110
    });

    room.lazy((r) => {
      /* Levelled decking: the deck itself is counter-rotated against the
         annex's tilt, which is exactly what the brief describes. */
      const deckGroup = new THREE.Group();
      deckGroup.name = 'LevelledDeck';
      deckGroup.position.set(0, y + 0.42, 0);
      deckGroup.rotation.z = -this.tiltRad;
      r.group.add(deckGroup);

      const deck = new THREE.CircleGeometry(R - 2.6, 36);
      deck.rotateX(-Math.PI / 2);
      remapUV(deck, 'xz', 0.16);
      deckGroup.add(mesh(deck, P.deck, { name: 'LevelledDecking', receive: true }));
      deckGroup.add(mesh(
        loft(() => circleRing(R - 2.6, 36), [-0.42, 0], { capTop: false }),
        P.steel, { name: 'DeckEdge' }
      ));

      /* Walls and soffit stay with the building, so the mismatch between the
         level deck and the leaning wall is visible and deliberate. */
      r.group.add(mesh(
        loft(() => circleRing(R - 0.5, 36), [y, y + 5.8], { capTop: false }),
        P.plaster, { name: 'LoungeWalls', receive: true }
      ));
      const soffit = new THREE.CircleGeometry(R - 0.5, 36);
      soffit.rotateX(Math.PI / 2);
      remapUV(soffit, 'xz', 0.12);
      r.group.add(mesh(xform(soffit, { pos: [0, y + 5.9, 0] }), P.plaster, { name: 'LoungeSoffit' }));

      /**
       * Prop 1 — the hydraulic levelling plinths. Each carries a piece of
       * lounge furniture and visibly adjusts on a cycle, with the mechanical
       * whir the spec asks for handed to the audio system.
       */
      const plinths = [];
      const seatMat = P.fabric;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * (R - 6.2), pz = Math.sin(a) * (R - 6.2);
        const lp = levelingPlinth(0.72, 0.42, this.tiltRad);
        const holder = new THREE.Group();
        holder.position.set(px, y, pz);
        holder.add(mesh(lp.body, P.steel, { name: 'PlinthBody' }));
        holder.add(lp.platform);
        lp.platform.add(mesh(i % 2 ? sofa(2.0, 0.9) : seatPod(1.1, 1.0, 0.84), seatMat, {
          name: 'LoungeFurniture', cast: true
        }));
        lp.platform.position.y = 0.42;
        lp.platform.rotation.y = -a + Math.PI;
        r.group.add(holder);
        plinths.push(lp);
      }
      this.levelingPlinths = plinths;
      r.addProp({
        name: 'Hydraulic levelling plinths',
        update(dt) { for (const p of plinths) p.update(dt); }
      });

      /* Prop 2 — the explanatory signage the brief quotes verbatim. */
      const signGroup = new THREE.Group();
      signGroup.position.set(0, y + 2.6, -(R - 1.0));
      signGroup.add(mesh(signPanel(4.2, 1.1), P.warmGlow, { name: 'AutoLevelSign' }));
      signGroup.add(mesh(box(4.4, 0.1, 0.12, [0, -0.66, 0.02]), P.brass, { name: 'SignRail' }));
      r.group.add(signGroup);
      const signLight = roomLight(r, 0xffdcb0, 20, 16, [0, y + 3.4, -(R - 3.2)]);
      r.addProp({
        name: 'Signage lighting',
        update() { signLight.intensity = 18 + Math.sin(performance.now() * 0.0006) * 4; }
      });

      /* Prop 3 — an even wash of lounge lighting on a slow breathing cycle. */
      const ring = [];
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
        const m = member(
          [Math.cos(a0) * (R - 2.0), y + 5.6, Math.sin(a0) * (R - 2.0)],
          [Math.cos(a1) * (R - 2.0), y + 5.6, Math.sin(a1) * (R - 2.0)], 0.09, 0.09);
        if (m) ring.push(m);
      }
      r.group.add(mesh(mergeGeometries(ring.filter(Boolean)), P.warmGlow, { name: 'LoungeCoveRing' }));
      const washLights = [
        roomLight(r, 0xffdcb4, 30, 26, [0, y + 4.4, 0]),
        roomLight(r, 0xffd0a0, 18, 20, [R * 0.45, y + 3.2, 0]),
        roomLight(r, 0xffd0a0, 18, 20, [-R * 0.45, y + 3.2, 0])
      ];
      r.addProp({
        name: 'Lounge wash lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00033) * 0.1;
          washLights[0].intensity = 30 * k;
          washLights[1].intensity = 18 * k;
          washLights[2].intensity = 18 * k;
        }
      });

      /* Low tables sit on the levelled deck, not on plinths. */
      const tbls = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        tbls.push({ pos: [Math.cos(a) * (R - 8.4), 0, Math.sin(a) * (R - 8.4)] });
      }
      deckGroup.add(instance(lowTable(0.5, 0.42), P.marble, tbls, { name: 'LoungeTables', castShadow: true }));
    });
  },

  /* ---------------- Rooftop Tilted Terrace ---------------- */

  /** "The Rooftop Terrace deliberately leaves the lean uncorrected so
      visitors feel it underfoot." */
  roomRooftopTerrace(A) {
    const P = this.palette;
    const R = OBSERVATORY.radius;
    const y = OBSERVATORY.height + 1.0;
    const room = this.room({
      name: 'Rooftop Tilted Terrace', level: 'Roof',
      center: [0, y + 1.5, 0], size: [R * 2 + 4, 6, R * 2 + 4],
      acoustic: A.OPEN_AIR, range: 130
    });

    room.lazy((r) => {
      /* Terrace paving laid true to the leaning structure — uncorrected. */
      const pav = [];
      for (let i = 0; i < 8; i++) {
        const rad = (i / 8) * (R - 1.2);
        const g = new THREE.RingGeometry(rad, rad + (R - 1.2) / 8 - 0.08, 40, 1);
        g.rotateX(-Math.PI / 2);
        remapUV(g, 'xz', 0.18);
        pav.push(xform(g, { pos: [0, y + 0.04, 0] }));
      }
      r.group.add(mesh(mergeGeometries(pav), P.limestone, { name: 'TerracePaving', receive: true }));

      /* Prop 1 — a spirit level embedded in the terrace, its bubble sitting
         hard against one end. The joke is the point. */
      const level = new THREE.Group();
      level.name = 'TerraceSpiritLevel';
      level.position.set(0, y + 0.16, 0);
      level.add(mesh(box(3.2, 0.22, 0.42, [0, 0, 0]), P.brass, { name: 'LevelBody' }));
      const vial = mesh(cyl(0.13, 0.13, 2.2, 12, [0, 0.13, 0], [0, 0, Math.PI / 2]), P.glass, {
        name: 'LevelVial', renderOrder: 4
      });
      level.add(vial);
      const bubbleMat = this.materials.solid('obsBubble', {
        color: 0x2b3a2a, roughness: 0.3, emissive: 0x7fe08a, emissiveIntensity: 1.4
      });
      this.materials.registerInterior(bubbleMat);
      const bubble = mesh(new THREE.SphereGeometry(0.115, 12, 8), bubbleMat, { name: 'LevelBubble' });
      level.add(bubble);
      r.group.add(level);
      const tiltRad = this.tiltRad;
      r.addProp({
        name: 'Terrace spirit level',
        update() {
          // The bubble seeks true horizontal, so on an 8° deck it parks at one end.
          const drift = Math.sin(performance.now() * 0.0009) * 0.04;
          bubble.position.set(-Math.sin(tiltRad) * 1.0 + drift, 0.13, 0);
        }
      });

      /* Prop 2 — coin-operated viewing telescopes that pan across the campus. */
      const scopes = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const g = new THREE.Group();
        g.position.set(Math.cos(a) * (R - 3.0), y + 0.06, Math.sin(a) * (R - 3.0));
        g.add(mesh(mergeGeometries([
          cyl(0.09, 0.13, 1.25, 10, [0, 0.62, 0]),
          cyl(0.3, 0.3, 0.08, 12, [0, 0.04, 0])
        ]), P.dark, { name: 'ScopeStand' }));
        const head = new THREE.Group();
        head.position.y = 1.28;
        head.add(mesh(mergeGeometries([
          cyl(0.15, 0.19, 0.9, 12, [0, 0, 0], [Math.PI / 2, 0, 0]),
          cyl(0.1, 0.1, 0.24, 10, [0, 0, -0.52], [Math.PI / 2, 0, 0])
        ]), P.steel, { name: 'ScopeBarrel' }));
        g.add(head);
        r.group.add(g);
        scopes.push({ head, phase: i * 1.4 });
      }
      r.addProp({
        name: 'Viewing telescopes',
        update() {
          const t = performance.now() * 0.001;
          for (const s of scopes) {
            s.head.rotation.y = Math.sin(t * 0.24 + s.phase) * 0.9;
            s.head.rotation.x = Math.sin(t * 0.17 + s.phase) * 0.18 - 0.1;
          }
        }
      });

      /* Prop 3 — a wind-stirred pennant on the terrace mast. */
      const flagMat = this.materials.solid('obsTerraceFlag', {
        color: 0xd8d2c4, roughness: 0.85, side: THREE.DoubleSide, wind: true
      });
      r.group.add(mesh(flag(7.5, 2.2), flagMat, {
        name: 'TerracePennant', pos: [0, y + 0.06, 0], cast: true
      }));
      const terraceLights = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        terraceLights.push(roomLight(r, 0xffd2a0, 12, 14,
          [Math.cos(a) * (R - 1.8), y + 0.9, Math.sin(a) * (R - 1.8)]));
      }
      r.addProp({
        name: 'Terrace edge lighting',
        update() {
          const k = 0.85 + Math.sin(performance.now() * 0.0005) * 0.15;
          for (const l of terraceLights) l.intensity = 12 * k;
        }
      });
    });
  }
});
