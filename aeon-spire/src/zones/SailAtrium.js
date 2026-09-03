/**
 * ZONE 2 — THE SAIL ATRIUM (L4 … L30)
 *
 * Concept borrowed from the Burj Al Arab: an asymmetric sail-shaped
 * double-skin glass facade drawn over a full-height atrium, carried on a
 * steel diagrid exoskeleton, with suspended sky-bridges crossing the void
 * and a cascading water feature at its foot.
 *
 * The sail is a genuinely doubly-curved parametric surface (not a decal on
 * a box): its outward bulge peaks at mid-height and falls to nothing at the
 * two vertical edges, which is what gives the silhouette its tension.
 */

import * as THREE from 'three';
import { Zone } from './Zone.js';
import { SAIL, LEVELS } from '../world/SitePlan.js';
import {
  mergeGeometries, xform, box, cyl, roundedRectRing, loft, mesh, instance,
  member, tube, surfaceGrid, thicken, diagrid, balustrade, glassBalustrade
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, smoothstep, rng } from '../core/MathUtil.js';
import {
  roomShell, remapUV, seatPod, sofa, lowTable, table, chair, bench, workstation,
  bed, receptionDesk, planter, plaque, elevatorDoors, swingDoor, waterWall,
  starlightCeiling, glassTreadStair, roomLight, roomSpot
} from '../interiors/InteriorKit.js';
import { glassBalustrade as glassRailSail } from '../world/BuildKit.js';

export class SailAtrium extends Zone {
  constructor(ctx) {
    super('sail', 'The Sail Atrium', ctx);
    this.appearsAtMilestone = 4;
  }

  get radius() { return 120; }

  /** Tower plan at normalised height t (0 at L4, 1 at L30). */
  shaftPlan(t) {
    const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t));
    const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t));
    return roundedRectRing(hx, hz, Math.min(hx, hz) * 0.36, 40);
  }

  /**
   * The sail skin. u runs across the chord (0…1), v runs up the height.
   * The surface springs from the tower's +X face and bulges outward, its
   * offset peaking near two-thirds height so the form leans forward.
   */
  sailPoint(u, v, out) {
    const y = lerp(SAIL.base, SAIL.top, v);
    const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(v));
    // Chord narrows slightly with height, matching the shaft's taper.
    const chord = lerp(SAIL.sailChord, SAIL.sailChord * 0.72, v);
    const z = (u - 0.5) * chord;
    // Bulge: zero at both vertical edges, maximum on the centreline.
    const across = Math.cos((u - 0.5) * Math.PI);
    const up = Math.sin(Math.pow(v, 0.82) * Math.PI * 0.94);
    const offset = SAIL.sailMaxOffset * Math.pow(Math.max(across, 0), 0.7) * up;
    out.set(hx * 0.55 + offset, y, z);
    return out;
  }

  massing() {
    const M = this.materials;

    /* --- The tower shaft: a lofted, tapering rounded-rectangle volume --- */
    const shaftMat = M.surface('sailShaft', 'polishedConcrete', {
      repeat: 10, roughness: 0.52, metalness: 0.1, exterior: true, color: 0xb9bec6
    });
    const heights = [];
    for (let i = 0; i <= 26; i++) heights.push(lerp(SAIL.base, SAIL.top, i / 26));
    const shaft = loft((t) => this.shaftPlan(t), heights, { capTop: true, uvScale: 0.045 });
    this.shell.add(mesh(shaft, shaftMat, { name: 'SailShaft', cast: true, receive: true }));

    /* --- The sail skin itself --- */
    const nu = 34, nv = 26;
    const skin = surfaceGrid((u, v, o) => this.sailPoint(u, v, o), nu, nv, { uvScale: [6, 12] });
    const skinMat = M.glass('sailSkin', {
      color: 0xcfe2ee, opacity: 0.30, roughness: 0.045, metalness: 0.12,
      side: THREE.DoubleSide, envMapIntensity: 2.6
    });
    const skinMesh = mesh(skin, skinMat, { name: 'SailSkin', renderOrder: 4 });
    this.shell.add(skinMesh);
    this.sailSkin = skinMesh;

    /* --- Podium-to-sail transition: the atrium's glazed end walls --- */
    this.buildAtriumEnclosure();

    /* --- Floor plates: the occupied ring around the atrium void --- */
    this.buildFloorPlates();
  }

  /** Glazed end walls closing the atrium between the shaft and the sail. */
  buildAtriumEnclosure() {
    const M = this.materials;
    const mat = M.glass('sailEndWall', {
      color: 0xbcd4e2, opacity: 0.22, roughness: 0.06, metalness: 0.1
    });
    const v3 = new THREE.Vector3();
    const parts = [];
    for (const edge of [0, 1]) {
      const g = surfaceGrid((u, v, o) => {
        // Interpolate between the shaft's +X face and the sail's edge.
        this.sailPoint(edge, v, v3);
        const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(v));
        const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(v));
        const sx = hx * 0.2;
        const sz = (edge === 0 ? -1 : 1) * hz;
        o.set(lerp(sx, v3.x, u), v3.y, lerp(sz, v3.z, u));
      }, 12, 26, { uvScale: [3, 10] });
      parts.push(g);
    }
    this.shell.add(mesh(mergeGeometries(parts), mat, { name: 'SailEndWalls', renderOrder: 3 }));
  }

  /**
   * Occupied floor plates. They wrap the atrium void, so each plate is a
   * plan outline with a rectangular hole punched through it.
   */
  buildFloorPlates() {
    const M = this.materials;
    const slabMat = M.solid('sailSlab', { color: 0x9aa0a8, roughness: 0.78, exterior: true });
    const parts = [];
    const n = 26;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const y = lerp(SAIL.base, SAIL.top, t);
      const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t));
      const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t));
      const shape = new THREE.Shape();
      const ring = roundedRectRing(hx, hz, Math.min(hx, hz) * 0.36, 28);
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();
      // The atrium void, shrinking with the tower.
      const ax = SAIL.atriumHalfX * lerp(1, 0.78, t);
      const az = SAIL.atriumHalfZ * lerp(1, 0.78, t);
      const hole = new THREE.Path();
      hole.moveTo(-ax * 0.15, -az);
      hole.lineTo(ax, -az);
      hole.lineTo(ax, az);
      hole.lineTo(-ax * 0.15, az);
      hole.closePath();
      shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.62, bevelEnabled: false, curveSegments: 4 });
      g.rotateX(-Math.PI / 2);
      xform(g, { pos: [0, y, 0] });
      parts.push(g);
    }
    this.shell.add(mesh(mergeGeometries(parts), slabMat, { name: 'SailFloorPlates', cast: true, receive: true }));
  }
}

/* ==================================================================== */
/* Phase 3 — structural & facade detail                                 */
/* ==================================================================== */

Object.assign(SailAtrium.prototype, {

  facade() {
    this.buildCurtainWall();
    this.buildDiagrid();
    this.buildSailMullions();
    this.buildDoubleSkin();
    this.buildSkyBridges();
    this.buildPodiumTransition();
  },

  /**
   * The shaft's curtain wall: a glazed skin just outside the floor plates,
   * carrying an emissive window grid that the time-of-day system switches on
   * at dusk (E.4). Its UVs are scaled so one texture row is one storey.
   */
  buildCurtainWall() {
    const M = this.materials;
    const heights = [];
    for (let i = 0; i <= 26; i++) heights.push(lerp(SAIL.base, SAIL.top, i / 26));
    const skin = loft((t) => {
      const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t)) + 0.22;
      const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t)) + 0.22;
      return roundedRectRing(hx, hz, Math.min(hx, hz) * 0.36, 40);
    }, heights, { capTop: false, uvScale: [0.0165, 0.0087] });

    const mat = M.litFacade('sailCurtainWall', {
      cols: 16, rows: 24, lit: 0.58, seed: 21, color: 0x7f97ad,
      roughness: 0.09, metalness: 0.42, opacity: 0.62, maxEmissive: 2.6
    });
    this.shell.add(mesh(skin, mat, { name: 'SailCurtainWall', renderOrder: 3 }));

    /* Horizontal spandrel bands at every floor line — this is what gives a
       supertall its scale, and it reads even from the far side of the site. */
    const bandMat = M.surface('sailSpandrel', 'brushedMetal', {
      repeat: 30, roughness: 0.26, metalness: 0.78, exterior: true, color: 0xd6dce4, envMapIntensity: 1.5
    });
    const bands = [];
    for (let i = 1; i <= 26; i++) {
      const t = i / 26;
      const y = lerp(SAIL.base, SAIL.top, t);
      const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t)) + 0.34;
      const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t)) + 0.34;
      bands.push(loft(() => roundedRectRing(hx, hz, Math.min(hx, hz) * 0.36, 32),
        [y - 0.55, y + 0.35], { capTop: false, uvScale: 0.06 }));
    }
    this.shell.add(mesh(mergeGeometries(bands), bandMat, { name: 'SailSpandrels', cast: true }));
  },

  /** The bronze steel diagrid exoskeleton wrapping the shaft (Section C). */
  buildDiagrid() {
    const M = this.materials;
    const mat = M.surface('sailDiagrid', 'bronze', {
      repeat: 3, roughness: 0.3, metalness: 0.9, exterior: true, color: 0xffffff, envMapIntensity: 1.6
    });
    const geo = diagrid(
      (t) => {
        const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t)) + 1.05;
        const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t)) + 1.05;
        return roundedRectRing(hx, hz, Math.min(hx, hz) * 0.36, SAIL.diagridBays * 2);
      },
      SAIL.base, SAIL.top, SAIL.diagridBays * 2, SAIL.diagridCourses, 0.78
    );
    this.shell.add(mesh(geo, mat, { name: 'SailDiagrid', cast: true, receive: true }));
    this.diagridMaterial = mat;
  },

  /** Mullion grid following the sail's doubly-curved surface. */
  buildSailMullions() {
    const M = this.materials;
    const mat = M.surface('sailMullion', 'bronze', {
      repeat: 2, roughness: 0.32, metalness: 0.88, exterior: true, color: 0xf0e0c0, envMapIntensity: 1.5
    });
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const parts = [];
    const NU = 13, NV = 11;
    // Vertical mullions.
    for (let iu = 0; iu <= NU; iu++) {
      const u = iu / NU;
      for (let iv = 0; iv < NV; iv++) {
        this.sailPoint(u, iv / NV, a);
        this.sailPoint(u, (iv + 1) / NV, b);
        const m = member(a.toArray(), b.toArray(), 0.42, 0.62);
        if (m) parts.push(m);
      }
    }
    // Horizontal transoms.
    for (let iv = 0; iv <= NV; iv++) {
      const v = iv / NV;
      for (let iu = 0; iu < NU; iu++) {
        this.sailPoint(iu / NU, v, a);
        this.sailPoint((iu + 1) / NU, v, b);
        const m = member(a.toArray(), b.toArray(), 0.3, 0.44);
        if (m) parts.push(m);
      }
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), mat, {
      name: 'SailMullions', cast: true
    }));

    /* The two edge trusses the sail is stretched between — its spine. */
    const edgeMat = M.surface('sailEdgeTruss', 'brushedMetal', {
      repeat: 2, roughness: 0.3, metalness: 0.84, exterior: true, color: 0xc8ced6
    });
    const edges = [];
    for (const u of [0, 1]) {
      for (let iv = 0; iv < 26; iv++) {
        this.sailPoint(u, iv / 26, a);
        this.sailPoint(u, (iv + 1) / 26, b);
        const m = member(a.toArray(), b.toArray(), 1.5, 2.0);
        if (m) edges.push(m);
      }
    }
    this.shell.add(mesh(mergeGeometries(edges.filter(Boolean)), edgeMat, {
      name: 'SailEdgeTrusses', cast: true
    }));
  },

  /**
   * The inner leaf of the double-skin facade, held off the sail by spacer
   * struts. The cavity between the two skins is the point of a double skin:
   * it is a thermal buffer, and here it is genuinely modelled as a gap.
   */
  buildDoubleSkin() {
    const M = this.materials;
    const v = new THREE.Vector3();
    const inner = surfaceGrid((u, vv, o) => {
      this.sailPoint(u, vv, o);
      // Offset inward toward the shaft by a constant cavity depth.
      const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(vv));
      const dir = new THREE.Vector3(o.x - hx * 0.55, 0, 0).normalize();
      o.x -= dir.x * 2.6;
      o.z *= 0.985;
    }, 26, 20, { uvScale: [5, 10] });
    const mat = M.glass('sailInnerSkin', {
      color: 0xa9c8da, opacity: 0.18, roughness: 0.07, metalness: 0.06,
      side: THREE.DoubleSide, envMapIntensity: 1.6
    });
    this.shell.add(mesh(inner, mat, { name: 'SailInnerSkin', renderOrder: 3 }));

    /* Spacer struts bridging the cavity, at every third grid node. */
    const strutMat = M.solid('sailCavityStrut', {
      color: 0x8b8f96, roughness: 0.4, metalness: 0.8, exterior: true
    });
    const a = new THREE.Vector3();
    const parts = [];
    for (let iu = 1; iu < 13; iu += 2) {
      for (let iv = 1; iv < 11; iv += 2) {
        this.sailPoint(iu / 13, iv / 11, a);
        const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(iv / 11));
        const t = tube(a.toArray(), [a.x - 2.6, a.y, a.z * 0.985], 0.11, 5);
        if (t) parts.push(t);
      }
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), strutMat, {
      name: 'SailCavityStruts'
    }));
  },

  /** Suspended sky-bridges crossing the atrium void (Section C, D.2). */
  buildSkyBridges() {
    const M = this.materials;
    const deckMat = M.surface('skyBridgeDeck', 'brushedMetal', {
      repeat: 4, roughness: 0.34, metalness: 0.72, exterior: true, color: 0xb8bfc8
    });
    const glassMat = M.glass('skyBridgeGuard', {
      color: 0xc0dbe8, opacity: 0.22, roughness: 0.06
    });
    const cableMat = M.solid('skyBridgeCable', {
      color: 0x53585f, roughness: 0.35, metalness: 0.92, exterior: true
    });

    const decks = [], guards = [], cables = [];
    this.skyBridges = [];
    for (const lvl of SAIL.bridgeLevels) {
      const t = (lvl - 4) / 26;
      const y = lerp(SAIL.base, SAIL.top, t);
      const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t));
      const ax = SAIL.atriumHalfX * lerp(1, 0.78, t);
      const width = 5.4;
      const x0 = hx * 0.2, x1 = ax + 8;
      decks.push(box(x1 - x0, 0.5, width, [(x0 + x1) / 2, y - 0.25, 0]));
      // Cross beams under the deck.
      for (let i = 0; i < 6; i++) {
        const x = lerp(x0, x1, i / 5);
        decks.push(box(0.5, 0.7, width + 0.6, [x, y - 0.75, 0]));
      }
      // Glass guarding both sides.
      for (const side of [-1, 1]) {
        guards.push(box(x1 - x0, 1.25, 0.08, [(x0 + x1) / 2, y + 0.4, side * width / 2]));
      }
      // Hanger cables up to the sail's edge trusses.
      for (let i = 0; i < 3; i++) {
        const x = lerp(x0 + 3, x1 - 2, i / 2);
        for (const side of [-1, 1]) {
          const c = tube([x, y + 0.2, side * width / 2],
            [x * 0.9, y + 16, side * (width / 2 + 5)], 0.06, 5);
          if (c) cables.push(c);
        }
      }
      this.skyBridges.push({ level: lvl, y, x0, x1, width });
    }
    this.shell.add(mesh(mergeGeometries(decks), deckMat, {
      name: 'SkyBridges', cast: true, receive: true
    }));
    this.shell.add(mesh(mergeGeometries(guards), glassMat, {
      name: 'SkyBridgeGuards', renderOrder: 4
    }));
    this.detail.add(mesh(mergeGeometries(cables.filter(Boolean)), cableMat, {
      name: 'SkyBridgeCables', cast: true
    }));
  },

  /** Where the sail lands on the podium: a glazed base and canopy. */
  buildPodiumTransition() {
    const M = this.materials;
    const canopyMat = M.surface('sailCanopy', 'brushedMetal', {
      repeat: 6, roughness: 0.28, metalness: 0.8, exterior: true, color: 0xc9d0d8
    });
    const parts = [];
    // A cantilevered entrance canopy on the sail side.
    parts.push(box(26, 0.8, 46, [SAIL.baseHalfX * 0.55 + 20, SAIL.base + 3.4, 0]));
    for (let i = -2; i <= 2; i++) {
      const t = tube(
        [SAIL.baseHalfX * 0.55 + 32, SAIL.base + 3.0, i * 10],
        [SAIL.baseHalfX * 0.55 + 4, SAIL.base + 15, i * 10], 0.16, 6);
      if (t) parts.push(t);
    }
    this.shell.add(mesh(mergeGeometries(parts.filter(Boolean)), canopyMat, {
      name: 'SailEntranceCanopy', cast: true, receive: true
    }));
  }
});

/* ==================================================================== */
/* Phase 4 — interiors (Section D.2)                                    */
/*                                                                      */
/* Grand Lobby · Cascading Water Wall · Suspended Sky-Bridges ·         */
/* Sweeping Cantilever Staircase · Typical Guest/Office Floor ·         */
/* Sky Lobby Transfer                                                   */
/* ==================================================================== */

Object.assign(SailAtrium.prototype, {

  interiorsPass() {
    const A = this.ctx.RoomClasses.ACOUSTIC;
    const M = this.materials;

    this.palette = {
      travertine: M.surface('atrTravertine', 'travertine', { repeat: 10, roughness: 0.14, metalness: 0.04 }),
      marble: M.surface('atrMarble', 'marble', { repeat: 8, roughness: 0.12 }),
      carpet: M.surface('atrCarpet', 'carpetSail', { repeat: 8, roughness: 0.95 }),
      slate: M.surface('atrSlate', 'slate', { repeat: 3, roughness: 0.5 }),
      bronze: M.surface('atrBronze', 'bronze', { repeat: 2, roughness: 0.32, metalness: 0.86 }),
      brass: M.solid('atrBrass', { color: 0xc9a04b, roughness: 0.26, metalness: 0.9 }),
      leather: M.solid('atrLeather', { color: 0xe0d5bf, roughness: 0.6 }),
      metal: M.surface('atrMetal', 'brushedMetal', { repeat: 4, roughness: 0.28, metalness: 0.78 }),
      glass: M.glass('atrGlassInt', { color: 0xd4e8f0, opacity: 0.2, roughness: 0.05, exterior: false }),
      greenWall: M.surface('atrGreenWall', 'foliage', { repeat: 6, roughness: 0.9 }),
      ceiling: M.solid('atrCeiling', { color: 0xe8e4dc, roughness: 0.82 })
    };
    this.palette.onyx = (() => {
      const set = M.tex.get('onyx');
      const mat = new THREE.MeshStandardMaterial({
        map: set.map, emissiveMap: set.emissiveMap, emissive: 0xffffff,
        emissiveIntensity: 1.5, roughness: 0.22, metalness: 0.05
      });
      return mat;
    })();
    this.palette.cove = M.solid('atrCove', {
      color: 0x3a3428, roughness: 0.4, emissive: 0xffd9a8, emissiveIntensity: 2.4
    });
    this.palette.coveCool = M.solid('atrCoveCool', {
      color: 0x2c333a, roughness: 0.4, emissive: 0xdceaff, emissiveIntensity: 2.0
    });
    this.palette.starlight = M.solid('atrStarlight', {
      color: 0x1a1c22, roughness: 0.3, emissive: 0xfff2d0, emissiveIntensity: 1.8
    });
    this.palette.waterSheet = (() => {
      const set = M.tex.get('caustics');
      const mat = new THREE.MeshStandardMaterial({
        color: 0xbfe0ea, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55,
        emissiveMap: set.emissiveMap, emissive: 0x88b8cc, emissiveIntensity: 0.35,
        side: THREE.DoubleSide, depthWrite: false
      });
      mat.emissiveMap.wrapS = mat.emissiveMap.wrapT = THREE.RepeatWrapping;
      mat.emissiveMap.repeat.set(1, 4);
      return mat;
    })();

    M.registerInteriorPalette(this.palette);

    this.roomGrandLobby(A);
    this.roomWaterWall(A);
    this.roomSkyBridges(A);
    this.roomCantileverStair(A);
    this.roomTypicalFloor(A);
    this.roomSkyLobby(A);
  },

  /* ---------------- Grand Lobby (L4–L6, triple height) ---------------- */

  roomGrandLobby(A) {
    const P = this.palette;
    const y = SAIL.base;
    const room = this.room({
      name: 'Grand Lobby', level: 'L4–L6',
      center: [6, y + 8, 0], size: [66, 17, 52],
      acoustic: A.GLASS_ATRIUM, range: 170
    });

    room.lazy((r) => {
      /* Polished travertine floor with the brass medallion of D.2. */
      const floor = new THREE.PlaneGeometry(64, 50);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.06);
      r.group.add(mesh(xform(floor, { pos: [6, y + 0.05, 0] }), P.travertine, {
        name: 'TravertineFloor', receive: true
      }));
      const med = [];
      for (const rad of [[5.2, 5.6], [3.0, 3.2], [1.4, 1.5]]) {
        const g = new THREE.RingGeometry(rad[0], rad[1], 56);
        g.rotateX(-Math.PI / 2);
        med.push(xform(g, { pos: [-11, y + 0.08, 0] }));
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        med.push(box(0.1, 0.02, 2.2, [-11 + Math.cos(a) * 4.2, y + 0.08, Math.sin(a) * 4.2], [0, -a, 0]));
      }
      r.group.add(mesh(mergeGeometries(med), P.brass, { name: 'BrassMedallion' }));

      /* The lobby ceiling, its curve traced by an LED cove. */
      const ceil = new THREE.PlaneGeometry(64, 50);
      ceil.rotateX(Math.PI / 2);
      remapUV(ceil, 'xz', 0.1);
      r.group.add(mesh(xform(ceil, { pos: [6, y + 16, 0] }), P.ceiling, { name: 'LobbyCeiling' }));

      const cove = [];
      for (let i = 0; i < 5; i++) {
        const rad = 8 + i * 5.5;
        const g = new THREE.TorusGeometry(rad, 0.08, 6, 64, Math.PI * 1.25);
        g.rotateX(Math.PI / 2);
        cove.push(xform(g, { pos: [6, y + 15.7 - i * 0.22, 0], rot: [0, -0.6, 0] }));
      }
      const coveMesh = mesh(mergeGeometries(cove), P.cove, { name: 'CoveLighting' });
      r.group.add(coveMesh);

      /* Prop 1 — the backlit onyx reception desk. */
      r.group.add(mesh(receptionDesk(7.2, 1.2, 1.12), P.onyx, {
        name: 'OnyxReceptionDesk', pos: [14, y, -12], cast: true
      }));
      r.group.add(mesh(box(7.5, 0.08, 1.5, [14, y + 1.16, -12]), P.marble, { name: 'DeskTop' }));
      const deskLight = roomLight(r, 0xffcf94, 40, 22, [14, y + 1.6, -12]);
      r.addProp({
        name: 'Onyx desk backlight',
        update() {
          const k = 1.25 + Math.sin(performance.now() * 0.0007) * 0.28;
          P.onyx.emissiveIntensity = k;
          deskLight.intensity = 34 * k;
        }
      });

      /* Prop 2 — the fibre-optic starlight ceiling. */
      const star = starlightCeiling(52, 40, y + 15.2, 240, P.starlight);
      r.group.add(star.mesh);
      r.addProp({ name: 'Starlight ceiling', update: (dt) => star.update(dt) });

      /* Prop 3 — a full-height living green wall that stirs slightly. */
      const gw = new THREE.PlaneGeometry(30, 15, 8, 6);
      remapUV(gw, 'xy', 0.12);
      const gwMesh = mesh(xform(gw, { pos: [6, y + 7.6, -25.4] }), P.greenWall, {
        name: 'LivingGreenWall', receive: true
      });
      r.group.add(gwMesh);
      r.addProp({
        name: 'Living green wall',
        update() {
          // A very slow drift in the planting's scale reads as growth/air movement.
          gwMesh.scale.x = 1 + Math.sin(performance.now() * 0.0004) * 0.004;
        }
      });

      /* Cream leather seating pods around low marble tables. */
      const pods = [], tbls = [];
      const rr = rng(77);
      for (let c = 0; c < 5; c++) {
        const cxp = -14 + c * 12, czp = (c % 2 ? -1 : 1) * 13;
        tbls.push({ pos: [cxp, y, czp] });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + rr() * 0.5;
          pods.push({ pos: [cxp + Math.cos(a) * 1.8, y, czp + Math.sin(a) * 1.8], rot: [0, -a + Math.PI / 2, 0] });
        }
      }
      r.group.add(instance(seatPod(1.05, 1.0, 0.82), P.leather, pods, { name: 'SeatingPods', castShadow: true }));
      r.group.add(instance(lowTable(0.7, 0.42), P.marble, tbls, { name: 'MarbleTables', castShadow: true }));

      /* Exposed bronze diagrid ribs, read from inside through the glazing. */
      const ribs = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const hx = SAIL.baseHalfX - 1.2, hz = SAIL.baseHalfZ - 1.2;
        const p0 = [Math.cos(a) * hx, y + 0.5, Math.sin(a) * hz];
        const p1 = [Math.cos(a + 0.6) * hx, y + 16, Math.sin(a + 0.6) * hz];
        const m = member(p0, p1, 0.5, 0.5);
        if (m) ribs.push(m);
      }
      r.group.add(mesh(mergeGeometries(ribs.filter(Boolean)), P.bronze, {
        name: 'ExposedDiagridRibs', cast: true
      }));

      /* Warm ~3000 K lobby lighting (D.2). */
      roomLight(r, 0xffd6a8, 70, 60, [6, y + 12, 0]);
      roomLight(r, 0xffcd9c, 40, 40, [-14, y + 8, 14]);
      roomLight(r, 0xffcd9c, 40, 40, [24, y + 8, -14]);
    });
  },

  /* ---------------- Cascading Water Wall ---------------- */

  roomWaterWall(A) {
    const P = this.palette;
    const y = SAIL.base;
    const room = this.room({
      name: 'Cascading Water Wall', level: 'L4',
      center: [-20, y + 8, 6], size: [16, 20, 28],
      acoustic: A.GLASS_ATRIUM, range: 140
    });

    room.lazy((r) => {
      /* Textured slate face the water cascades down. */
      const face = new THREE.PlaneGeometry(22, 16, 2, 8);
      remapUV(face, 'xy', 0.12);
      r.group.add(mesh(xform(face, { pos: [-24, y + 8, 6], rot: [0, Math.PI / 2, 0] }), P.slate, {
        name: 'SlateFace', receive: true
      }));

      /* Prop 1 — the falling sheet itself, scrolling downward. */
      const sheet = waterWall(21, 15.6, P.waterSheet);
      sheet.rotation.y = Math.PI / 2;
      sheet.position.set(-23.7, y + 0.2, 6);
      r.group.add(sheet);
      const em = P.waterSheet.emissiveMap;
      r.addProp({
        name: 'Cascading water',
        update(dt) { em.offset.y -= dt * 0.72; }
      });

      /* The reflecting basin it falls into. */
      const basin = [];
      basin.push(box(4.4, 0.7, 24, [-21.6, y + 0.35, 6]));
      basin.push(box(4.0, 0.12, 23.4, [-21.6, y + 0.62, 6]));
      r.group.add(mesh(mergeGeometries(basin), P.marble, { name: 'ReflectingBasin', receive: true }));
      const pool = new THREE.PlaneGeometry(3.6, 23, 6, 16);
      pool.rotateX(-Math.PI / 2);
      const poolMat = this.materials.glass('atrBasinWater', {
        color: 0x2d5a66, opacity: 0.75, roughness: 0.04, metalness: 0.25, exterior: false
      });
      r.group.add(mesh(xform(pool, { pos: [-21.6, y + 0.66, 6] }), poolMat, {
        name: 'BasinWater', renderOrder: 3
      }));

      /* Prop 2 — spray particles at the foot of the cascade. */
      const spriteSet = this.materials.tex.get('glowSprite');
      const sprayMat = new THREE.PointsMaterial({
        size: 0.42, map: spriteSet.map, transparent: true, opacity: 0.34,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0xdff2ff
      });
      const N = 160;
      const pos = new Float32Array(N * 3);
      const st = [];
      for (let i = 0; i < N; i++) {
        st.push({ t: Math.random() * 1.4, z: 6 + (Math.random() - 0.5) * 22, vy: 1.2 + Math.random() * 1.4 });
        pos[i * 3] = -23.2; pos[i * 3 + 1] = y + 0.7; pos[i * 3 + 2] = st[i].z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, sprayMat);
      pts.frustumCulled = false;
      pts.name = 'CascadeSpray';
      r.group.add(pts);
      r.addProp({
        name: 'Cascade spray',
        update(dt) {
          const a = geo.attributes.position;
          for (let i = 0; i < N; i++) {
            const s = st[i];
            s.t += dt;
            if (s.t > 1.4) { s.t = 0; s.z = 6 + (Math.random() - 0.5) * 22; }
            a.setXYZ(i, -23.2 + s.t * 1.1, y + 0.7 + s.vy * s.t - 3.4 * s.t * s.t, s.z);
          }
          a.needsUpdate = true;
        }
      });

      /* Prop 3 — a focused wash light that grazes the slate. */
      const spot = roomSpot(r, 0xbfe4f2, 220, 40, [-19, y + 17, 6], [-24, y + 2, 6], 0.55, 0.7);
      r.addProp({
        name: 'Water-wall wash',
        update() { spot.intensity = 190 + Math.sin(performance.now() * 0.0009) * 45; }
      });
    });
  },

  /* ---------------- Suspended Sky-Bridges ---------------- */

  roomSkyBridges(A) {
    const P = this.palette;
    const lo = lerp(SAIL.base, SAIL.top, (SAIL.bridgeLevels[0] - 4) / 26);
    const hi = lerp(SAIL.base, SAIL.top, (SAIL.bridgeLevels[SAIL.bridgeLevels.length - 1] - 4) / 26);
    const room = this.room({
      name: 'Suspended Sky-Bridges', level: 'L8–L28',
      center: [16, (lo + hi) / 2, 0], size: [58, hi - lo + 12, 34],
      acoustic: A.GLASS_ATRIUM, range: 200
    });

    room.lazy((r) => {
      const decks = [], rails = [], stars = [];
      const bridges = this.skyBridges || [];
      for (const b of bridges) {
        /* Deck finishes: travertine walkway with a brushed-metal nosing. */
        const g = new THREE.PlaneGeometry(b.x1 - b.x0, b.width);
        g.rotateX(-Math.PI / 2);
        remapUV(g, 'xz', 0.2);
        decks.push(xform(g, { pos: [(b.x0 + b.x1) / 2, b.y + 0.02, 0] }));
        for (const side of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            pts.push([lerp(b.x0, b.x1, i / 8), b.y + 1.3, side * b.width / 2]);
          }
          rails.push(balustrade(pts, 0.06, 2, 0.028, 0.045));
        }
        /* Fibre-optic starlight over each crossing. */
        const rr = rng(Math.round(b.y));
        for (let i = 0; i < 40; i++) {
          stars.push({ pos: [lerp(b.x0, b.x1, rr()), b.y + 3.1 + rr() * 0.3, (rr() - 0.5) * b.width] });
        }
      }
      if (decks.length) {
        r.group.add(mesh(mergeGeometries(decks), P.travertine, { name: 'BridgeDecks', receive: true }));
        r.group.add(mesh(mergeGeometries(rails.filter(Boolean)), P.metal, { name: 'BridgeHandrails' }));
      }

      /* Prop 1 — starlight ceilings over the bridges. */
      const starMesh = instance(new THREE.SphereGeometry(0.05, 5, 4), P.starlight, stars, {
        name: 'BridgeStarlight'
      });
      r.group.add(starMesh);
      r.addProp({
        name: 'Sky-bridge starlight',
        update() { P.starlight.emissiveIntensity = 1.6 + Math.sin(performance.now() * 0.0011) * 0.5; }
      });

      /* Prop 2 — planters on the crossings, and the lights over them. */
      const pl = planter(2.2, 0.6, 0.5);
      const tubs = [], leaves = [];
      for (const b of bridges) {
        for (const k of [0.28, 0.72]) {
          const e = { pos: [lerp(b.x0, b.x1, k), b.y, b.width / 2 - 0.5], rot: [0, Math.PI / 2, 0] };
          tubs.push(e); leaves.push(e);
        }
      }
      r.group.add(instance(pl.tub, P.metal, tubs, { name: 'BridgePlanters' }));
      r.group.add(instance(pl.foliage, P.greenWall, leaves, { name: 'BridgePlanting' }));
      const lights = [];
      for (const b of bridges) lights.push(roomLight(r, 0xffdcb4, 24, 26, [(b.x0 + b.x1) / 2, b.y + 3.4, 0]));
      r.addProp({
        name: 'Bridge lighting',
        update() {
          const k = 0.9 + Math.sin(performance.now() * 0.00042) * 0.1;
          for (const l of lights) l.intensity = 24 * k;
        }
      });

      /* Prop 3 — a lift car travelling the atrium void beside the bridges. */
      const car = new THREE.Group();
      car.name = 'AtriumLiftCar';
      car.add(mesh(mergeGeometries([
        box(2.6, 2.9, 2.6, [0, 1.45, 0]),
        box(2.9, 0.16, 2.9, [0, 3.0, 0]),
        box(2.9, 0.16, 2.9, [0, -0.06, 0])
      ]), P.metal, { name: 'CarShell', cast: true }));
      car.add(mesh(box(2.2, 2.3, 2.2, [0, 1.5, 0]), P.glass, { name: 'CarGlass', renderOrder: 4 }));
      car.position.set(30, lo, 12);
      r.group.add(car);
      let ct = 0;
      r.addProp({
        name: 'Atrium lift car',
        update(dt) {
          ct += dt;
          const k = 0.5 - 0.5 * Math.cos((ct % 26) / 26 * TAU);
          car.position.y = lerp(lo - 6, hi + 4, k);
        }
      });
    });
  },

  /* ---------------- Sweeping Cantilever Staircase ---------------- */

  roomCantileverStair(A) {
    const P = this.palette;
    const y = SAIL.base;
    const room = this.room({
      name: 'Sweeping Cantilever Staircase', level: 'L4–L7',
      center: [-4, y + 8, 17], size: [26, 20, 26],
      acoustic: A.MARBLE_HALL, range: 130
    });

    room.lazy((r) => {
      const stair = glassTreadStair(3.6, 6.6, y + 0.4, y + 15.0, 1.35, 22);
      r.group.add(mesh(xform(stair.treads, { pos: [-4, 0, 17] }), P.glass, {
        name: 'GlassTreads', renderOrder: 4
      }));
      r.group.add(mesh(xform(stair.stringers, { pos: [-4, 0, 17] }), P.metal, {
        name: 'SteelStringers', cast: true
      }));

      /* Glass balustrade following the helix. */
      const rail = [];
      const total = Math.round(1.35 * 22);
      for (let i = 0; i <= total; i++) {
        const a = (i / total) * 1.35 * TAU;
        rail.push([-4 + Math.cos(a) * 6.5, y + 0.4 + (i / total) * 14.6, 17 + Math.sin(a) * 6.5]);
      }
      r.group.add(mesh(glassRailSail(rail, 1.05), P.glass, { name: 'StairBalustrade', renderOrder: 4 }));
      r.group.add(mesh(balustrade(rail.map(p => [p[0], p[1] + 1.02, p[2]]), 0.05, 2, 0.028, 0.05), P.brass,
        { name: 'StairHandrail' }));

      /* Prop 1 — a light ribbon that runs up the underside of the flight. */
      const ribbon = [];
      for (let i = 0; i < total; i++) {
        const a0 = (i / total) * 1.35 * TAU, a1 = ((i + 1) / total) * 1.35 * TAU;
        const y0 = y + 0.28 + (i / total) * 14.6, y1 = y + 0.28 + ((i + 1) / total) * 14.6;
        const m = member(
          [-4 + Math.cos(a0) * 5.1, y0, 17 + Math.sin(a0) * 5.1],
          [-4 + Math.cos(a1) * 5.1, y1, 17 + Math.sin(a1) * 5.1], 0.07, 0.07);
        if (m) ribbon.push(m);
      }
      r.group.add(mesh(mergeGeometries(ribbon.filter(Boolean)), P.cove, { name: 'StairLightRibbon' }));
      const l1 = roomLight(r, 0xffd8b0, 30, 26, [-4, y + 7, 17]);
      r.addProp({
        name: 'Stair light ribbon',
        update() {
          const k = 1 + Math.sin(performance.now() * 0.0008) * 0.18;
          P.cove.emissiveIntensity = 2.2 * k;
          l1.intensity = 28 * k;
        }
      });

      /* Prop 2 — a slowly rotating sculpture in the stair's well. */
      const sculpt = new THREE.Group();
      sculpt.name = 'StairSculpture';
      const blades = [];
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        const g = new THREE.TorusGeometry(1.6 + t * 1.2, 0.05, 5, 26, Math.PI * 1.3);
        g.rotateX(Math.PI / 2);
        blades.push(xform(g, { pos: [0, t * 12, 0], rot: [0, t * 4.0, 0.28] }));
      }
      sculpt.add(mesh(mergeGeometries(blades), P.brass, { name: 'SculptureBlades', cast: true }));
      sculpt.position.set(-4, y + 1.2, 17);
      r.group.add(sculpt);
      r.addProp({ name: 'Stair sculpture', update: (dt) => { sculpt.rotation.y += dt * 0.09; } });
    });
  },

  /* ---------------- Typical Guest/Office Floor ---------------- */

  roomTypicalFloor(A) {
    const P = this.palette;
    const lvl = 15;
    const t = (lvl - 4) / 26;
    const y = lerp(SAIL.base, SAIL.top, t);
    const hx = lerp(SAIL.baseHalfX, SAIL.topHalfX, smoothstep(t));
    const hz = lerp(SAIL.baseHalfZ, SAIL.topHalfZ, smoothstep(t));
    const room = this.room({
      name: 'Typical Guest/Office Floor', level: 'L7–L29 (L15 shown)',
      center: [0, y + 2.2, 0], size: [hx * 2 + 2, 6, hz * 2 + 2],
      acoustic: A.PADDED_LOUNGE, range: 150
    });

    room.lazy((r) => {
      /* Carpet whose geometric pattern echoes the sail's curve (D.2). */
      const ring = roundedRectRing(hx - 0.6, hz - 0.6, Math.min(hx, hz) * 0.36, 30);
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();
      const hole = new THREE.Path();
      const ax = SAIL.atriumHalfX * lerp(1, 0.78, t), az = SAIL.atriumHalfZ * lerp(1, 0.78, t);
      hole.moveTo(-ax * 0.15, -az); hole.lineTo(ax, -az); hole.lineTo(ax, az); hole.lineTo(-ax * 0.15, az);
      hole.closePath();
      shape.holes.push(hole);
      const carpet = new THREE.ShapeGeometry(shape, 4);
      carpet.rotateX(-Math.PI / 2);
      remapUV(carpet, 'xz', 0.05);
      r.group.add(mesh(xform(carpet, { pos: [0, y + 0.06, 0] }), P.carpet, {
        name: 'GeometricCarpet', receive: true
      }));

      /* Suspended ceiling with a cooler 4000 K cove. */
      const ceil = new THREE.ShapeGeometry(shape, 4);
      ceil.rotateX(Math.PI / 2);
      remapUV(ceil, 'xz', 0.1);
      r.group.add(mesh(xform(ceil, { pos: [0, y + 3.4, 0] }), P.ceiling, { name: 'Ceiling' }));
      const cove = [];
      for (let i = 0; i < ring.length; i += 2) {
        const a = ring[i], b = ring[(i + 2) % ring.length];
        const m = member([a[0] * 0.94, y + 3.2, a[1] * 0.94], [b[0] * 0.94, y + 3.2, b[1] * 0.94], 0.08, 0.08);
        if (m) cove.push(m);
      }
      r.group.add(mesh(mergeGeometries(cove.filter(Boolean)), P.coveCool, { name: 'CoolCove' }));

      /* Half the floor is offices, half hotel suites — as the brief allows. */
      const desks = [], chairs = [], beds = [], partitions = [];
      const rr = rng(515);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI - Math.PI / 2;
        const rad = Math.min(hx, hz) * 0.74;
        desks.push({ pos: [Math.cos(a) * rad, y, Math.sin(a) * rad], rot: [0, -a, 0] });
        chairs.push({ pos: [Math.cos(a) * (rad - 1.1), y, Math.sin(a) * (rad - 1.1)], rot: [0, -a + Math.PI, 0] });
      }
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + (i / 6) * Math.PI * 0.9;
        const rad = Math.min(hx, hz) * 0.68;
        beds.push({ pos: [Math.cos(a) * rad, y, Math.sin(a) * rad], rot: [0, -a + Math.PI, 0] });
        partitions.push(box(0.16, 3.2, 7.0,
          [Math.cos(a + 0.08) * rad, y + 1.6, Math.sin(a + 0.08) * rad], [0, -a, 0]));
      }
      r.group.add(instance(workstation(), P.metal, desks, { name: 'Workstations', castShadow: true }));
      r.group.add(instance(chair(0.5, 0.9), P.leather, chairs, { name: 'TaskChairs', castShadow: true }));
      r.group.add(instance(bed(1.7, 2.1), P.leather, beds, { name: 'SuiteBeds', castShadow: true }));
      r.group.add(mesh(mergeGeometries(partitions), P.ceiling, { name: 'SuitePartitions', cast: true }));

      /* Prop 1 — daylight-mimicking ceiling lighting that ramps. */
      const lights = [
        roomLight(r, 0xdfe9f5, 34, 42, [0, y + 3.0, 12]),
        roomLight(r, 0xdfe9f5, 34, 42, [0, y + 3.0, -12]),
        roomLight(r, 0xffd9ae, 26, 34, [-14, y + 3.0, 0])
      ];
      r.addProp({
        name: 'Floor lighting',
        update() {
          const k = 0.92 + Math.sin(performance.now() * 0.0003) * 0.08;
          lights[0].intensity = 34 * k; lights[1].intensity = 34 * k;
        }
      });

      /* Prop 2 — a lift lobby with cycling doors. */
      const lift = elevatorDoors(2.0, 2.6, { period: 12 });
      const gL = lift.geometry.clone(); gL.scale(-1, 1, 1);
      lift.left.geometry = gL; lift.left.material = P.metal;
      lift.right.geometry = lift.geometry; lift.right.material = P.metal;
      lift.group.position.set(-hx * 0.1, y, -az - 0.4);
      r.group.add(lift.group);
      r.addProp({ name: 'Floor lift doors', update: (dt) => lift.update(dt) });

      /* Prop 3 — a glazed balustrade onto the atrium void, with a hint of
         movement from the light spilling up it. */
      const railPts = [
        [-ax * 0.15, y, -az], [ax, y, -az], [ax, y, az], [-ax * 0.15, y, az]
      ];
      r.group.add(mesh(glassRailSail(railPts.concat([railPts[0]]), 1.1), P.glass, {
        name: 'AtriumEdgeGuard', renderOrder: 4
      }));
      const edgeLight = roomLight(r, 0xffe3c0, 18, 24, [ax * 0.5, y + 1.2, 0]);
      r.addProp({
        name: 'Atrium edge glow',
        update() { edgeLight.intensity = 16 + Math.sin(performance.now() * 0.0006) * 5; }
      });
    });
  },

  /* ---------------- Sky Lobby Transfer (L30) ---------------- */

  roomSkyLobby(A) {
    const P = this.palette;
    const y = SAIL.top;
    const hx = SAIL.topHalfX, hz = SAIL.topHalfZ;
    const room = this.room({
      name: 'Sky Lobby Transfer', level: 'L30',
      center: [0, y + 4, 0], size: [hx * 2 + 2, 10, hz * 2 + 2],
      acoustic: A.MARBLE_HALL, range: 170
    });

    room.lazy((r) => {
      const ring = roundedRectRing(hx - 0.8, hz - 0.8, Math.min(hx, hz) * 0.36, 32);
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++) shape.lineTo(ring[k][0], ring[k][1]);
      shape.closePath();

      const floor = new THREE.ShapeGeometry(shape, 4);
      floor.rotateX(-Math.PI / 2);
      remapUV(floor, 'xz', 0.05);
      r.group.add(mesh(xform(floor, { pos: [0, y + 0.1, 0] }), P.marble, {
        name: 'SkyLobbyFloor', receive: true
      }));

      /* An oculus straight up into the Ring Deck — the "preview view" of D.2. */
      const oc = new THREE.RingGeometry(7, hx - 2, 48, 1);
      oc.rotateX(Math.PI / 2);
      remapUV(oc, 'xz', 0.1);
      r.group.add(mesh(xform(oc, { pos: [0, y + 7.6, 0] }), P.ceiling, { name: 'SkyLobbyCeiling' }));
      const rim = new THREE.TorusGeometry(7, 0.22, 8, 48);
      rim.rotateX(Math.PI / 2);
      r.group.add(mesh(xform(rim, { pos: [0, y + 7.5, 0] }), P.brass, { name: 'OculusRim' }));

      /* Prop 1 — the oculus light ring, brightening on a slow cycle. */
      const ringLight = new THREE.TorusGeometry(6.6, 0.1, 6, 48);
      ringLight.rotateX(Math.PI / 2);
      r.group.add(mesh(xform(ringLight, { pos: [0, y + 7.3, 0] }), P.cove, { name: 'OculusLightRing' }));
      const ol = roomLight(r, 0xffe6c4, 60, 50, [0, y + 6.4, 0]);
      r.addProp({
        name: 'Oculus light ring',
        update() { ol.intensity = 54 + Math.sin(performance.now() * 0.00055) * 16; }
      });

      /* Prop 2 — the transfer lift bank. */
      const lifts = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const d = elevatorDoors(2.1, 2.7, { period: 10 + i * 1.7 });
        const gL = d.geometry.clone(); gL.scale(-1, 1, 1);
        d.left.geometry = gL; d.left.material = P.brass;
        d.right.geometry = d.geometry; d.right.material = P.brass;
        d.group.position.set(Math.cos(a) * 9, y + 0.1, Math.sin(a) * 9);
        d.group.rotation.y = -a;
        r.group.add(d.group);
        lifts.push(d);
      }
      r.addProp({ name: 'Sky lobby lifts', update: (dt) => { for (const l of lifts) l.update(dt); } });

      /* Prop 3 — a departure board that refreshes. */
      const boardMat = this.materials.solid('atrBoard', {
        color: 0x0d1018, roughness: 0.4, emissive: 0x66ccff, emissiveIntensity: 1.2
      });
      const board = mesh(box(6.0, 1.6, 0.12, [0, y + 4.4, -hz + 2.2]), boardMat, { name: 'DepartureBoard' });
      r.group.add(board);
      r.addProp({
        name: 'Departure board',
        update() {
          const p = performance.now() * 0.001;
          boardMat.emissiveIntensity = 1.0 + (Math.sin(p * 2.6) > 0.86 ? 0.9 : 0) + Math.sin(p * 0.5) * 0.15;
        }
      });

      /* Seating and planting around the transfer floor. */
      const pods = [], tubs = [], leaves = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.4;
        pods.push({ pos: [Math.cos(a) * 16, y + 0.1, Math.sin(a) * 14], rot: [0, -a + Math.PI / 2, 0] });
        const e = { pos: [Math.cos(a + 0.4) * 20, y + 0.1, Math.sin(a + 0.4) * 17], rot: [0, -a, 0] };
        tubs.push(e); leaves.push(e);
      }
      r.group.add(instance(seatPod(1.1, 1.0, 0.84), P.leather, pods, { name: 'SkyLobbySeating', castShadow: true }));
      const pl = planter(2.0, 0.6, 0.5);
      r.group.add(instance(pl.tub, P.marble, tubs, { name: 'SkyLobbyPlanters' }));
      r.group.add(instance(pl.foliage, P.greenWall, leaves, { name: 'SkyLobbyPlanting' }));

      roomLight(r, 0xffe0bc, 52, 60, [0, y + 5.5, 0]);
    });
  }
});
