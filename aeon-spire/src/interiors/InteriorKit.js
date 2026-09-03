/**
 * AEON SPIRE — interior kit.
 *
 * Reusable rooms, furniture, fixtures and animated props shared by all
 * seven zones' Section D interiors. Everything returns geometry (for
 * merging) or a small object exposing `update(dt, t)` (for animated props),
 * so a room can be assembled cheaply and still feel inhabited — D.8 asks
 * for 2–3 interactive or animated props in every interior.
 */

import * as THREE from 'three';
import {
  mergeGeometries, xform, box, cyl, mesh, instance, member, tube,
  balustrade, glassBalustrade, spiralStair, stairRun, loft, circleRing,
  roundedRectRing, surfaceGrid
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng, smoothstep } from '../core/MathUtil.js';

/* ------------------------------------------------------------------ */
/* Room shells                                                         */
/* ------------------------------------------------------------------ */

/**
 * A rectangular room shell seen from the inside: floor, ceiling and four
 * walls with their normals turned inward. Openings are punched by omitting
 * walls listed in `open` ('+x', '-x', '+z', '-z', 'ceiling', 'floor').
 */
export function roomShell(w, h, d, { open = [], center = [0, 0, 0] } = {}) {
  const parts = { floor: [], ceiling: [], walls: [] };
  const [cx, cy, cz] = center;
  const hw = w / 2, hd = d / 2;

  if (!open.includes('floor')) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    remapUV(g, 'xz', 0.18);
    parts.floor.push(xform(g, { pos: [cx, cy, cz] }));
  }
  if (!open.includes('ceiling')) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(Math.PI / 2);
    remapUV(g, 'xz', 0.18);
    parts.ceiling.push(xform(g, { pos: [cx, cy + h, cz] }));
  }
  const wall = (ww, rot, pos) => {
    const g = new THREE.PlaneGeometry(ww, h);
    g.translate(0, h / 2, 0);
    xform(g, { pos, rot: [0, rot, 0] });
    remapUV(g, 'xy', 0.2);
    return g;
  };
  if (!open.includes('-z')) parts.walls.push(wall(w, 0, [cx, cy, cz - hd]));
  if (!open.includes('+z')) parts.walls.push(wall(w, Math.PI, [cx, cy, cz + hd]));
  if (!open.includes('-x')) parts.walls.push(wall(d, Math.PI / 2, [cx - hw, cy, cz]));
  if (!open.includes('+x')) parts.walls.push(wall(d, -Math.PI / 2, [cx + hw, cy, cz]));
  return parts;
}

/** Rewrite a geometry's UVs from world position so tiling reads at scale. */
export function remapUV(geo, plane = 'xz', scale = 0.2) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (plane === 'xz') uv.setXY(i, x * scale, z * scale);
    else if (plane === 'xy') uv.setXY(i, x * scale, y * scale);
    else uv.setXY(i, z * scale, y * scale);
  }
  uv.needsUpdate = true;
  return geo;
}

/** An annular room shell, for the Halo Walkway and ring floors. */
export function annularShell(rIn, rOut, h, { y = 0, seg = 72, floor = true, ceiling = true } = {}) {
  const parts = { floor: [], ceiling: [], walls: [] };
  if (floor) {
    const g = new THREE.RingGeometry(rIn, rOut, seg, 1);
    g.rotateX(-Math.PI / 2);
    remapUV(g, 'xz', 0.12);
    parts.floor.push(xform(g, { pos: [0, y, 0] }));
  }
  if (ceiling) {
    const g = new THREE.RingGeometry(rIn, rOut, seg, 1);
    g.rotateX(Math.PI / 2);
    remapUV(g, 'xz', 0.12);
    parts.ceiling.push(xform(g, { pos: [0, y + h, 0] }));
  }
  parts.walls.push(loft(() => circleRing(rIn, seg), [y, y + h], { capTop: false }));
  parts.walls.push(loft(() => circleRing(rOut, seg), [y, y + h], { capTop: false }));
  return parts;
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

/** A low lounge chair / seating pod. */
export function seatPod(w = 0.95, d = 0.9, h = 0.78) {
  return mergeGeometries([
    box(w, 0.16, d, [0, 0.42, 0]),                       // cushion
    box(w, h * 0.52, 0.16, [0, 0.42 + h * 0.26, -d / 2 + 0.08]), // back
    box(0.14, 0.34, 0.14, [-w / 2 + 0.12, 0.17, -d / 2 + 0.14]),
    box(0.14, 0.34, 0.14, [w / 2 - 0.12, 0.17, -d / 2 + 0.14]),
    box(0.14, 0.34, 0.14, [-w / 2 + 0.12, 0.17, d / 2 - 0.14]),
    box(0.14, 0.34, 0.14, [w / 2 - 0.12, 0.17, d / 2 - 0.14])
  ]);
}

/** A three-seat sofa. */
export function sofa(w = 2.4, d = 0.95) {
  return mergeGeometries([
    box(w, 0.34, d, [0, 0.35, 0]),
    box(w, 0.62, 0.2, [0, 0.72, -d / 2 + 0.1]),
    box(0.2, 0.5, d, [-w / 2 + 0.1, 0.62, 0]),
    box(0.2, 0.5, d, [w / 2 - 0.1, 0.62, 0]),
    box(w - 0.2, 0.18, d - 0.2, [0, 0.14, 0])
  ]);
}

/** A round low table. */
export function lowTable(r = 0.55, h = 0.42) {
  return mergeGeometries([
    cyl(r, r, 0.07, 18, [0, h, 0]),
    cyl(0.09, 0.09, h, 10, [0, h / 2, 0]),
    cyl(r * 0.55, r * 0.55, 0.05, 16, [0, 0.025, 0])
  ]);
}

/** A rectangular table with four legs. */
export function table(w = 1.6, d = 0.8, h = 0.74, legR = 0.05) {
  const parts = [box(w, 0.06, d, [0, h, 0])];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(cyl(legR, legR, h, 8, [sx * (w / 2 - 0.12), h / 2, sz * (d / 2 - 0.1)]));
  }
  return mergeGeometries(parts);
}

/** A simple stacking chair. */
export function chair(w = 0.46, h = 0.86) {
  const parts = [box(w, 0.05, w, [0, 0.45, 0]), box(w, h - 0.5, 0.05, [0, 0.45 + (h - 0.5) / 2, -w / 2 + 0.03])];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(box(0.04, 0.45, 0.04, [sx * (w / 2 - 0.05), 0.225, sz * (w / 2 - 0.05)]));
  }
  return mergeGeometries(parts);
}

/** A bench, for gardens and galleries. */
export function bench(w = 2.0, h = 0.46) {
  const parts = [box(w, 0.09, 0.46, [0, h, 0])];
  for (const sx of [-1, 1]) parts.push(box(0.12, h, 0.42, [sx * (w / 2 - 0.22), h / 2, 0]));
  return mergeGeometries(parts);
}

/** A backlit reception desk (D.2's onyx desk). */
export function receptionDesk(w = 6.4, d = 1.1, h = 1.08) {
  return mergeGeometries([
    box(w, h, d, [0, h / 2, 0]),
    box(w + 0.24, 0.07, d + 0.22, [0, h + 0.035, 0]),
    box(w - 0.5, 0.12, 0.5, [0, h - 0.35, -d / 2 - 0.2])   // return counter
  ]);
}

/** A curved bar with a footrail (D.3's Observation Lounge). */
export function curvedBar(radius, arc, h = 1.1, depth = 0.9, seg = 24) {
  const parts = [];
  for (let i = 0; i < seg; i++) {
    const a0 = -arc / 2 + (i / seg) * arc, a1 = -arc / 2 + ((i + 1) / seg) * arc;
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const m = member(p(a0, radius, h / 2), p(a1, radius, h / 2), depth, h);
    if (m) parts.push(m);
    const top = member(p(a0, radius, h + 0.04), p(a1, radius, h + 0.04), depth + 0.3, 0.08);
    if (top) parts.push(top);
    const rail = tube(p(a0, radius - depth / 2 - 0.4, 0.16), p(a1, radius - depth / 2 - 0.4, 0.16), 0.035, 6);
    if (rail) parts.push(rail);
  }
  return mergeGeometries(parts.filter(Boolean));
}

/** A bar stool. */
export function stool(h = 0.76, r = 0.19) {
  return mergeGeometries([
    cyl(r, r, 0.07, 14, [0, h, 0]),
    cyl(0.045, 0.045, h, 8, [0, h / 2, 0]),
    cyl(r * 0.9, r * 0.9, 0.04, 14, [0, 0.02, 0]),
    new THREE.TorusGeometry(r * 0.7, 0.02, 6, 14).rotateX(Math.PI / 2).translate(0, 0.24, 0)
  ]);
}

/** An open-plan workstation: desk, screen, task chair footprint. */
export function workstation() {
  return mergeGeometries([
    box(1.5, 0.05, 0.75, [0, 0.73, 0]),
    box(0.06, 0.72, 0.06, [-0.68, 0.36, -0.3]),
    box(0.06, 0.72, 0.06, [0.68, 0.36, -0.3]),
    box(0.06, 0.72, 0.06, [-0.68, 0.36, 0.3]),
    box(0.06, 0.72, 0.06, [0.68, 0.36, 0.3]),
    box(0.56, 0.34, 0.03, [0, 0.96, -0.28]),               // screen
    cyl(0.09, 0.09, 0.12, 10, [0, 0.81, -0.28])
  ]);
}

/** A hotel-suite bed. */
export function bed(w = 1.7, d = 2.1) {
  return mergeGeometries([
    box(w, 0.34, d, [0, 0.32, 0]),
    box(w, 0.2, d, [0, 0.56, 0]),
    box(w + 0.2, 0.9, 0.12, [0, 0.72, -d / 2 - 0.05]),
    box(w * 0.4, 0.12, 0.42, [-w * 0.24, 0.7, -d / 2 + 0.34]),
    box(w * 0.4, 0.12, 0.42, [w * 0.24, 0.7, -d / 2 + 0.34])
  ]);
}

/** A planting trough with a foliage mass. */
export function planter(w = 2.4, d = 0.7, h = 0.55) {
  return {
    tub: mergeGeometries([
      box(w, h, d, [0, h / 2, 0]),
      box(w - 0.16, 0.1, d - 0.16, [0, h - 0.04, 0])
    ]),
    foliage: mergeGeometries([
      box(w - 0.3, 0.5, d - 0.24, [0, h + 0.2, 0]),
      box(w * 0.5, 0.9, d * 0.6, [-w * 0.2, h + 0.5, 0]),
      box(w * 0.4, 1.3, d * 0.5, [w * 0.24, h + 0.7, 0])
    ])
  };
}

/** An informational plaque on a stand — the engineering-education device. */
export function plaque(w = 0.9, h = 0.6, standH = 1.0) {
  return mergeGeometries([
    box(w, h, 0.05, [0, standH + h / 2, 0], [-0.35, 0, 0]),
    cyl(0.05, 0.07, standH, 8, [0, standH / 2, 0]),
    cyl(0.22, 0.24, 0.05, 12, [0, 0.025, 0])
  ]);
}

/** A wall-mounted sign panel. */
export function signPanel(w = 2.2, h = 0.7) {
  return box(w, h, 0.06, [0, 0, 0]);
}

/* ------------------------------------------------------------------ */
/* Lighting fixtures                                                   */
/* ------------------------------------------------------------------ */

/** A wrought-iron lantern pendant (D.1). */
export function lanternPendant(dropLength = 1.4) {
  return {
    body: mergeGeometries([
      cyl(0.02, 0.02, dropLength, 6, [0, -dropLength / 2, 0]),
      cyl(0.2, 0.09, 0.22, 8, [0, -dropLength - 0.11, 0]),
      box(0.03, 0.34, 0.03, [-0.14, -dropLength - 0.4, 0]),
      box(0.03, 0.34, 0.03, [0.14, -dropLength - 0.4, 0]),
      box(0.03, 0.34, 0.03, [0, -dropLength - 0.4, -0.14]),
      box(0.03, 0.34, 0.03, [0, -dropLength - 0.4, 0.14])
    ]),
    glass: box(0.26, 0.32, 0.26, [0, -dropLength - 0.4, 0])
  };
}

/** A linear cove-light strip. */
export function coveStrip(length, width = 0.12) {
  return box(length, 0.06, width, [0, 0, 0]);
}

/** A recessed downlight disc. */
export function downlight(r = 0.13) {
  return cyl(r, r, 0.05, 12, [0, 0, 0]);
}

/* ------------------------------------------------------------------ */
/* Animated & interactive props                                        */
/* ------------------------------------------------------------------ */

/**
 * A pair of lift doors that cycle open and closed, with a chime callback.
 * Returns { group, update }.
 */
export function elevatorDoors(width = 1.9, height = 2.4, { period = 11, onChime = null } = {}) {
  const group = new THREE.Group();
  group.name = 'ElevatorDoors';
  const leaf = new THREE.Group();
  const left = new THREE.Mesh();
  const right = new THREE.Mesh();
  left.name = 'LeafL'; right.name = 'LeafR';
  group.add(left, right);
  let t = Math.random() * period;
  let chimed = false;
  return {
    group, left, right, width, height,
    geometry: box(width / 2, height, 0.09, [width / 4, height / 2, 0]),
    update(dt) {
      t += dt;
      const c = t % period;
      // Closed → open over 1.2s, hold 3s, close over 1.2s, hold.
      let k = 0;
      if (c < 1.2) k = smoothstep(c / 1.2);
      else if (c < 4.2) k = 1;
      else if (c < 5.4) k = 1 - smoothstep((c - 4.2) / 1.2);
      if (c < 0.1 && !chimed) { chimed = true; if (onChime) onChime(); }
      if (c > 1) chimed = false;
      left.position.x = -k * width * 0.48;
      right.position.x = k * width * 0.48;
    }
  };
}

/** A hinged door that swings open when approached. Returns { pivot, update }. */
export function swingDoor(width = 1.0, height = 2.3, { period = 9 } = {}) {
  const pivot = new THREE.Group();
  pivot.name = 'SwingDoor';
  let t = Math.random() * period;
  return {
    pivot,
    geometry: box(width, height, 0.06, [width / 2, height / 2, 0]),
    update(dt) {
      t += dt;
      const c = t % period;
      let k = 0;
      if (c < 1.4) k = smoothstep(c / 1.4);
      else if (c < 3.6) k = 1;
      else if (c < 5.0) k = 1 - smoothstep((c - 3.6) / 1.4);
      pivot.rotation.y = -k * 1.35;
    }
  };
}

/** A rotating display plinth (D.7's concept-vehicle turntable). */
export function rotatingPlinth(radius = 6.4, height = 0.9, rpm = 1.4) {
  const turntable = new THREE.Group();
  turntable.name = 'RotatingPlinth';
  return {
    turntable,
    base: mergeGeometries([
      cyl(radius, radius + 0.35, height, 40, [0, height / 2, 0]),
      cyl(radius + 0.5, radius + 0.5, 0.14, 40, [0, 0.07, 0])
    ]),
    update(dt) { turntable.rotation.y += (rpm * TAU / 60) * dt; }
  };
}

/**
 * A hydraulic levelling plinth (D.5). The lounge furniture stands on these,
 * and they visibly adjust — with the whir the spec asks for — because the
 * annex is genuinely tilted 8°.
 */
export function levelingPlinth(radius = 0.44, height = 0.34, tiltRad = 0) {
  const platform = new THREE.Group();
  platform.name = 'LevelingPlinth';
  let t = Math.random() * 14;
  let lastAdjusting = false;
  return {
    platform,
    tiltRad,
    body: mergeGeometries([
      cyl(radius, radius + 0.06, height * 0.5, 16, [0, height * 0.25, 0]),
      cyl(radius * 0.55, radius * 0.55, height * 0.6, 12, [0, height * 0.6, 0]),
      cyl(radius * 0.95, radius * 0.95, 0.06, 16, [0, height * 0.92, 0])
    ]),
    /** True on the frames where the plinth is actively moving (drives audio). */
    adjusting: false,
    update(dt) {
      t += dt;
      const c = t % 14;
      // Settle to level, then a small correction every cycle.
      const wobble = c < 1.6 ? Math.sin(c * 6.0) * (1 - c / 1.6) * 0.055 : 0;
      const adjusting = c < 1.6;
      this.adjusting = adjusting;
      // Counter-rotate against the annex's tilt so the top stays level.
      platform.rotation.z = -tiltRad + wobble;
      platform.position.y = adjusting ? Math.sin(c * 4.2) * 0.012 : 0;
      lastAdjusting = adjusting;
    }
  };
}

/**
 * A cascading water wall: a scrolling emissive/normal sheet down a slate
 * face, with a splash basin (D.2).
 */
export function waterWall(width, height, material) {
  const g = new THREE.PlaneGeometry(width, height, 1, 12);
  g.translate(0, height / 2, 0);
  const m = new THREE.Mesh(g, material);
  m.name = 'CascadingWaterWall';
  return m;
}

/**
 * The tuned mass damper: a large suspended polished sphere on cables that
 * sways slowly, behind glass (D.4). Educational, not a physics simulation.
 */
export function tunedMassDamper(radius = 4.2, cableLength = 12) {
  const pivot = new THREE.Group();
  pivot.name = 'TunedMassDamper';
  const cables = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const t = tube(
      [Math.cos(a) * radius * 0.7, 0, Math.sin(a) * radius * 0.7],
      [Math.cos(a) * radius * 0.7, -cableLength + radius, Math.sin(a) * radius * 0.7],
      0.09, 6);
    if (t) cables.push(t);
  }
  return {
    pivot,
    cables: mergeGeometries(cables),
    sphere: new THREE.SphereGeometry(radius, 24, 18).translate(0, -cableLength, 0),
    update(dt, t) {
      // A slow two-axis sway, as a real TMD responds to building drift.
      pivot.rotation.z = Math.sin(t * 0.31) * 0.045 + Math.sin(t * 0.11) * 0.02;
      pivot.rotation.x = Math.cos(t * 0.27) * 0.038;
    }
  };
}

/** A simulator pod: an enclosed shell on a motion base that pitches gently. */
export function simulatorPod() {
  const rocker = new THREE.Group();
  rocker.name = 'SimulatorPod';
  const phase = Math.random() * TAU;
  return {
    rocker,
    shell: mergeGeometries([
      cyl(1.05, 1.25, 2.4, 14, [0, 1.3, 0], [Math.PI / 2, 0, 0]),
      box(1.6, 0.2, 2.6, [0, 0.4, 0]),
      box(0.9, 1.0, 0.12, [0, 1.5, -1.25])
    ]),
    base: mergeGeometries([
      cyl(0.9, 1.1, 0.4, 12, [0, 0.2, 0]),
      cyl(0.22, 0.22, 0.5, 8, [0, 0.55, 0])
    ]),
    update(dt, t) {
      rocker.rotation.x = Math.sin(t * 1.7 + phase) * 0.09;
      rocker.rotation.z = Math.sin(t * 1.1 + phase * 1.7) * 0.07;
    }
  };
}

/**
 * A generic, unbranded concept-vehicle silhouette. Section A forbids any
 * real marque's design, so this is a pure aerodynamic form: a low canopy on
 * a wedge body with covered wheels.
 */
export function conceptVehicle() {
  const body = surfaceGrid((u, v, o) => {
    const z = (u - 0.5) * 4.6;
    const halfW = 0.95 * Math.pow(Math.sin(Math.PI * Math.min(u * 1.15, 1)), 0.45);
    const hMax = 0.52 + 0.42 * Math.sin(Math.PI * Math.pow(u, 0.65));
    const a = v * Math.PI;
    o.set(Math.cos(a) * halfW, 0.28 + Math.sin(a) * hMax, z);
  }, 26, 12);
  const parts = [body];
  // Covered wheel pods.
  for (const sx of [-1, 1]) for (const sz of [-1.45, 1.5]) {
    const w = new THREE.SphereGeometry(0.5, 12, 8);
    w.scale(0.55, 0.72, 1.0);
    parts.push(xform(w, { pos: [sx * 0.92, 0.42, sz] }));
  }
  parts.push(box(2.0, 0.06, 0.5, [0, 0.98, -2.15]));   // rear wing
  return {
    body: mergeGeometries(parts),
    canopy: (() => {
      const g = new THREE.SphereGeometry(0.72, 14, 10, 0, TAU, 0, Math.PI / 2);
      g.scale(0.8, 0.62, 1.5);
      return xform(g, { pos: [0, 0.86, 0.35] });
    })()
  };
}

/**
 * A glass-tread stair with slim steel stringers (D.4's Lattice Stair and
 * D.2's cantilever stair).
 */
export function glassTreadStair(rInner, rOuter, yBottom, yTop, turns, stepsPerTurn = 16) {
  const total = Math.round(turns * stepsPerTurn);
  const treads = [];
  const stringers = [];
  const dy = (yTop - yBottom) / total;
  const dt = (turns * TAU) / total;
  for (let i = 0; i < total; i++) {
    const t = i * dt;
    const y = yBottom + i * dy;
    const w = rOuter - rInner;
    const g = new THREE.BoxGeometry(w, 0.06, (rInner + rOuter) * dt * 0.9);
    xform(g, { pos: [Math.cos(t) * (rInner + w / 2), y, Math.sin(t) * (rInner + w / 2)], rot: [0, -t, 0] });
    treads.push(g);
    if (i > 0) {
      const pt = (i - 1) * dt, py = yBottom + (i - 1) * dy;
      for (const r of [rInner + 0.1, rOuter - 0.1]) {
        const s = member(
          [Math.cos(pt) * r, py - 0.12, Math.sin(pt) * r],
          [Math.cos(t) * r, y - 0.12, Math.sin(t) * r], 0.09, 0.26);
        if (s) stringers.push(s);
      }
    }
  }
  return { treads: mergeGeometries(treads), stringers: mergeGeometries(stringers.filter(Boolean)) };
}

/**
 * A "starlight" fibre-optic ceiling: a field of tiny emissive points that
 * twinkle slowly (D.2's Grand Lobby).
 */
export function starlightCeiling(w, d, y, count, material) {
  const geo = new THREE.SphereGeometry(0.045, 5, 4);
  const r = rng(31);
  const xs = [];
  for (let i = 0; i < count; i++) {
    xs.push({ pos: [(r() - 0.5) * w, y + (r() - 0.5) * 0.35, (r() - 0.5) * d] });
  }
  const m = instance(geo, material, xs, { name: 'StarlightCeiling' });
  let t = 0;
  return {
    mesh: m,
    update(dt) {
      t += dt;
      material.emissiveIntensity = 1.6 + Math.sin(t * 0.9) * 0.35;
    }
  };
}

/**
 * An animated caustic plane. D.1's modelling note: fake caustics with a
 * scrolling noise texture on an emissive plane rather than ray tracing.
 */
export function causticPlane(w, d, material) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.name = 'CausticProjection';
  m.renderOrder = 6;
  return m;
}

/** Tiered gallery seating overlooking a show (D.7). */
export function tieredSeating(width, rows = 4, rise = 0.5, depth = 1.1) {
  const parts = [];
  for (let i = 0; i < rows; i++) {
    parts.push(box(width, rise, depth, [0, rise / 2 + i * rise, -i * depth]));
    parts.push(box(width, 0.08, depth * 0.5, [0, rise * (i + 1) + 0.04, -i * depth + depth * 0.2]));
  }
  return mergeGeometries(parts);
}

/** Oversized modular blocks used as seating and feature walls (D.7). */
export function blockSeat(unit = 1.2, w = 2, d = 1) {
  const parts = [box(unit * w, unit * 0.62, unit * d, [0, unit * 0.31, 0])];
  for (let i = 0; i < w; i++) {
    for (let k = 0; k < d; k++) {
      parts.push(cyl(unit * 0.17, unit * 0.17, unit * 0.14, 10,
        [(i - (w - 1) / 2) * unit, unit * 0.69, (k - (d - 1) / 2) * unit]));
    }
  }
  return mergeGeometries(parts);
}

/** Exposed mechanical pipework for the geothermal gallery (D.6). */
export function pipework(seed = 5, extent = 16, count = 14) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const y = 0.4 + r() * 2.6;
    const z = (r() - 0.5) * extent;
    const rad = 0.12 + r() * 0.22;
    parts.push(cyl(rad, rad, extent * (0.5 + r() * 0.5), 10,
      [(r() - 0.5) * extent * 0.6, y, z], [0, 0, Math.PI / 2]));
    // Flanges and elbows.
    parts.push(cyl(rad * 1.5, rad * 1.5, 0.1, 10, [(r() - 0.5) * extent * 0.5, y, z], [0, 0, Math.PI / 2]));
    if (r() > 0.5) parts.push(cyl(rad, rad, 1.4 + r(), 10, [(r() - 0.5) * extent * 0.5, y + 0.7, z]));
  }
  // Two heat-exchanger vessels.
  for (const sx of [-1, 1]) {
    parts.push(cyl(1.2, 1.2, 3.4, 16, [sx * extent * 0.3, 1.9, extent * 0.32]));
    parts.push(cyl(1.35, 1.35, 0.2, 16, [sx * extent * 0.3, 3.6, extent * 0.32]));
  }
  return mergeGeometries(parts);
}

/** A rotating ventilation fan, for plant rooms and the beacon room. */
export function ventFan(radius = 0.7, blades = 5) {
  const rotor = new THREE.Group();
  rotor.name = 'VentFan';
  const parts = [cyl(radius * 0.2, radius * 0.2, 0.16, 10, [0, 0, 0])];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU;
    const g = box(radius * 0.9, 0.03, radius * 0.34, [Math.cos(a) * radius * 0.5, 0, Math.sin(a) * radius * 0.5], [0.4, -a, 0]);
    parts.push(g);
  }
  return {
    rotor,
    geometry: mergeGeometries(parts),
    housing: cyl(radius * 1.15, radius * 1.15, 0.3, 18, [0, 0, 0], null, true),
    update(dt) { rotor.rotation.y += dt * 5.2; }
  };
}

/** Add a point light that belongs to a room (auto-disabled when culled). */
export function roomLight(room, color, intensity, distance, pos, decay = 2) {
  const l = new THREE.PointLight(color, intensity, distance, decay);
  l.position.set(pos[0], pos[1], pos[2]);
  room.group.add(l);
  room.lights.push(l);
  return l;
}

/** Add a spotlight that belongs to a room. */
export function roomSpot(room, color, intensity, distance, pos, target, angle = 0.6, penumbra = 0.5) {
  const l = new THREE.SpotLight(color, intensity, distance, angle, penumbra, 2);
  l.position.set(pos[0], pos[1], pos[2]);
  l.target.position.set(target[0], target[1], target[2]);
  room.group.add(l, l.target);
  room.lights.push(l);
  return l;
}
