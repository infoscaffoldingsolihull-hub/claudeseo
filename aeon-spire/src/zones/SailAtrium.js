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
