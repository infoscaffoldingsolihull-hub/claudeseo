/**
 * The live construction site: the tower crane, the workforce, the scaffold,
 * the excavator and the compound.
 *
 * Everything in this module is driven by the same programme as the building
 * itself.  Nothing here is on a timer that runs regardless of the schedule:
 *
 *   - the crane is erected during package P4 (*Boundary wall, crane base &
 *     scaffolding*), climbs as the frame climbs, and is dismantled when the
 *     façade package E4 finishes;
 *   - the scaffold erects with the masonry, and is struck from the top down as
 *     the façade completes, because you cannot clad a wall you have already
 *     taken the scaffold off;
 *   - the excavator and the spoil heap exist between the start of the bulk
 *     excavation and the backfill;
 *   - the workforce is not decoration.  Its size is `siteHeadcount` — the
 *     head count the resource model derives from each active package's budget,
 *     duration, crew rate and labour content — and each figure is posted to a
 *     zone that belongs to a package that is actually in progress on the day
 *     you are looking at.  Scrub to a curing lag and the site empties, because
 *     on that day nothing is being earned.
 *
 * So the masons laying brick on day 300 are laying it because E1 is 40 per
 * cent complete on day 300 and the masonry pool has thirty-one people on it.
 *
 * The plant is deliberately not solid.  A timeline scrub can move a crane or
 * strike a scaffold while you are standing where it used to be, and being
 * sealed inside a lattice mast you cannot see out of is a worse failure than
 * being able to walk through one.
 */
import * as THREE from 'three';
import { createSurfaceBuilder, subtractRects } from './build.js';
import { setReveal } from './materials.js';
import { PLOT, SHELL, GARAGE, PORTICO, LEVELS, ROOF, SITE_LEVEL,
  FOOTPRINT_HOLES, FORMATION_LEVEL } from './plan.js';
import { packageProgress, activePackages, siteHeadcount } from '../pm/project.js';
import { clamp, mix, smoothstep, hash2 } from '../engine/rng.js';

/** Where the tower crane stands, and how big it is. */
const CRANE = {
  x: 12.8, z: -11.2,
  padTop: SITE_LEVEL + 0.55,
  mastLow: 15.0,      // erected height, before the frame starts
  mastHigh: 26.0,     // after the roof slab is cast
  mastWidth: 1.7,
  jib: 26.0,
  counterJib: 9.0,
  travelClear: 3.2,   // how far above the work face the load is carried
  cycleSeconds: 27,
};

/** The site compound: cabins, stockpiles and the batching area. */
const COMPOUND = { x0: -16.2, x1: -10.7, z0: -12.6, z1: -4.2 };

/** Where the crane picks its loads from. */
const STOCKPILE = { x: -13.4, z: -6.2 };

/**
 * Zones the workforce is posted to, by work package.
 *
 * `rect` is the plan area, `y` the level the gang stands on, `task` how they
 * are animated and `edge` whether they work at the perimeter of the rect (a
 * mason builds a wall, so he stands on the wall line) or anywhere within it.
 */
const WORKER_ZONES = {
  P2: { rect: { x0: -14, x1: 14, z0: -13, z1: 13 }, y: SITE_LEVEL, task: 'work', edge: false },
  P3: { rect: { x0: -16, x1: -11, z0: -12, z1: -4 }, y: SITE_LEVEL, task: 'carry', edge: false },
  P4: { rect: { x0: -16.4, x1: 16.4, z0: -14.4, z1: 14.4 }, y: SITE_LEVEL, task: 'lay', edge: true },
  S1: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: -2.9, task: 'work', edge: false },
  S2: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: -3.0, task: 'work', edge: false },
  S3: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: -3.0, task: 'work', edge: false },
  S4: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: -3.0, task: 'carry', edge: false },
  S5: { rect: { x0: -9.6, x1: 9.6, z0: -12.6, z1: 2.6 }, y: -3.0, task: 'lay', edge: true },
  S6: { rect: { x0: -9.6, x1: 9.6, z0: -12.6, z1: 2.6 }, y: -3.0, task: 'work', edge: true },
  S7: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: -0.30, task: 'work', edge: false },
  F1: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: true },
  F2: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 3.70, task: 'work', edge: false },
  F3: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: true },
  F4: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 7.30, task: 'work', edge: false },
  F5: { rect: { x0: -2, x1: 3.5, z0: -7, z1: -2 }, y: 0, task: 'work', edge: false },
  F6: { rect: { x0: PORTICO.x0, x1: PORTICO.x1, z0: PORTICO.z0, z1: PORTICO.z1 }, y: 0, task: 'lay', edge: false },
  F7: { rect: { x0: -8, x1: 8, z0: -11, z1: 1 }, y: ROOF.level, task: 'lay', edge: true },
  E1: { rect: { x0: -9.6, x1: 9.6, z0: -12.6, z1: 2.6 }, y: 0, task: 'lay', edge: true },
  E2: { rect: { x0: -9.6, x1: 9.6, z0: -12.6, z1: 2.6 }, y: 4, task: 'lay', edge: true },
  E3: { rect: { x0: -8, x1: 8, z0: -11, z1: 1 }, y: ROOF.level, task: 'work', edge: false },
  E4: { rect: { x0: -10.9, x1: 10.9, z0: -13.9, z1: 3.9 }, y: 0, task: 'lay', edge: true, scaffold: true },
  E5: { rect: { x0: -10.9, x1: 10.9, z0: -13.9, z1: 3.9 }, y: 0, task: 'lay', edge: true, scaffold: true },
  E6: { rect: { x0: -9.8, x1: 9.8, z0: -12.8, z1: 2.8 }, y: 0, task: 'work', edge: true, scaffold: true },
  E7: { rect: { x0: -5, x1: 5, z0: 1, z1: 3.4 }, y: 0, task: 'work', edge: false },
  M1: { rect: { x0: -8, x1: 8, z0: -11, z1: 1 }, y: -3.0, task: 'work', edge: false },
  M2: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: true },
  M3: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: true },
  M4: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: false },
  M5: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: false },
  M6: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: false },
  M7: { rect: { x0: -8, x1: 8, z0: -11, z1: 1 }, y: ROOF.level, task: 'work', edge: false },
  I1: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: true },
  I2: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: false },
  I3: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: false },
  I4: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: false },
  I5: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: false },
  I6: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'carry', edge: false },
  I7: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: true },
  I8: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: true },
  I9: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 4, task: 'work', edge: false },
  I10: { rect: { x0: -10, x1: -2, z0: -7, z1: -2 }, y: 0, task: 'work', edge: false },
  L1: { rect: { x0: -8, x1: 8, z0: 4, z1: 12 }, y: SITE_LEVEL, task: 'lay', edge: false },
  L2: { rect: { x0: -15, x1: 15, z0: 4, z1: 13 }, y: SITE_LEVEL, task: 'work', edge: false },
  L3: { rect: { x0: -15, x1: 15, z0: 4, z1: 13 }, y: SITE_LEVEL, task: 'work', edge: false },
  L4: { rect: { x0: 11, x1: 16, z0: -6, z1: 4 }, y: SITE_LEVEL, task: 'lay', edge: false },
  L5: { rect: { x0: -2.5, x1: 2.5, z0: 6.5, z1: 9.5 }, y: SITE_LEVEL, task: 'lay', edge: false },
  L6: { rect: { x0: -14, x1: 14, z0: 4, z1: 13 }, y: SITE_LEVEL, task: 'work', edge: false },
  L7: { rect: { x0: -4, x1: 4, z0: 12, z1: 14.6 }, y: SITE_LEVEL, task: 'lay', edge: false },
  H2: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: false },
  H3: { rect: { x0: -9, x1: 9, z0: -12, z1: 2 }, y: 0, task: 'work', edge: false },
};

/** A deterministic point in a rectangle, or on its perimeter. */
function zoneStation(zone, seed) {
  const { rect, edge } = zone;
  const a = hash2(seed * 3 + 1, 17);
  const b = hash2(seed * 5 + 7, 41);
  if (!edge) {
    return {
      x: mix(rect.x0 + 0.6, rect.x1 - 0.6, a),
      z: mix(rect.z0 + 0.6, rect.z1 - 0.6, b),
      yaw: b * Math.PI * 2,
    };
  }
  // On the perimeter: walk `a` around the rectangle and face inwards, which
  // is what puts a bricklayer on the wall line rather than in the room.
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const perimeter = 2 * (w + d);
  let t = a * perimeter;
  const inset = 0.55;
  if (t < w) return { x: rect.x0 + t, z: rect.z0 + inset, yaw: Math.PI };
  t -= w;
  if (t < d) return { x: rect.x1 - inset, z: rect.z0 + t, yaw: -Math.PI / 2 };
  t -= d;
  if (t < w) return { x: rect.x1 - t, z: rect.z1 - inset, yaw: 0 };
  t -= w;
  return { x: rect.x0 + inset, z: rect.z1 - t, yaw: Math.PI / 2 };
}

/** A square lattice mast: four legs, horizontal ties and cross bracing. */
function latticeMast(b, cx, cz, base, top, width, member) {
  const h = width / 2;
  const legs = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [ox, oz] of legs) {
    b.box(cx + ox - member, base, cz + oz - member, cx + ox + member, top, cz + oz + member);
  }
  const bay = 1.9;
  for (let y = base; y <= top + 1e-6; y += bay) {
    for (let i = 0; i < 4; i += 1) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 4];
      b.box(cx + Math.min(ax, bx) - member, y - member, cz + Math.min(az, bz) - member,
        cx + Math.max(ax, bx) + member, y + member, cz + Math.max(az, bz) + member);
    }
    // One diagonal per face per bay, alternating hand so the mast reads as a
    // braced tower rather than as a ladder.
    const yTop = Math.min(top, y + bay);
    if (yTop - y < 0.3) continue;
    const steps = 4;
    for (let i = 0; i < 4; i += 1) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 4];
      const flip = (Math.round(y / bay) + i) % 2 === 0;
      for (let s = 0; s < steps; s += 1) {
        const t = (s + 0.5) / steps;
        const px = mix(flip ? ax : bx, flip ? bx : ax, t);
        const pz = mix(flip ? az : bz, flip ? bz : az, t);
        const py = mix(y, yTop, t);
        b.box(cx + px - member, py - (yTop - y) / (steps * 2) - member, cz + pz - member,
          cx + px + member, py + (yTop - y) / (steps * 2) + member, cz + pz + member);
      }
    }
  }
}

/** A horizontal lattice boom, built along +X from the origin. */
function latticeBoom(b, length, depth, member, taper = 0.55) {
  const bay = 2.0;
  for (let i = 0; i * bay < length; i += 1) {
    const x0 = i * bay;
    const x1 = Math.min(length, x0 + bay);
    const d0 = depth * mix(1, taper, x0 / length) / 2;
    const d1 = depth * mix(1, taper, x1 / length) / 2;
    // Top and bottom chords, and the two side chords.
    for (const s of [-1, 1]) {
      b.box(x0, -d0, s * d0 - member, x1, -d0 + member * 2, s * d0 + member);
      b.box(x0, d0 - member * 2, s * d0 - member, x1, d0, s * d0 + member);
      // Diagonal in the vertical plane.
      const steps = 3;
      for (let k = 0; k < steps; k += 1) {
        const t = (k + 0.5) / steps;
        const px = mix(x0, x1, t);
        const py = mix(-d0, d1, (k % 2 === 0) ? t : 1 - t);
        b.box(px - member, py - member * 2, s * d0 - member, px + member, py + member * 2, s * d0 + member);
      }
    }
    // Cross ties.
    b.box(x0 - member, -d0, -d0, x0 + member, -d0 + member * 2, d0);
    b.box(x0 - member, d0 - member * 2, -d0, x0 + member, d0, d0);
  }
}

/**
 * Where the crane's hook is on its cycle.
 *
 * A tower crane cycle is: slew and trolley out to the stockpile, lower, hook
 * on, hoist, slew to the work face, trolley in, lower, release, hoist clear.
 * `u` runs 0..1 over one cycle and the track below is that sequence, so the
 * load only exists between hooking on and letting go.
 */
function craneCycle(u, pick, place, travelY) {
  const seg = (a, b) => clamp((u - a) / (b - a), 0, 1);
  let from = pick;
  let to = pick;
  let t = 0;
  let hook = travelY;
  let loaded = false;
  if (u < 0.10) {                       // lower onto the stack
    hook = mix(travelY, pick.y, smoothstep(0, 1, seg(0.00, 0.10)));
  } else if (u < 0.16) {                // hook on
    hook = pick.y;
  } else if (u < 0.28) {                // hoist
    hook = mix(pick.y, travelY, smoothstep(0, 1, seg(0.16, 0.28)));
    loaded = true;
  } else if (u < 0.52) {                // slew and trolley to the work face
    from = pick; to = place; t = smoothstep(0, 1, seg(0.28, 0.52));
    loaded = true;
  } else if (u < 0.64) {                // lower into place
    from = place; to = place; t = 1;
    hook = mix(travelY, place.y, smoothstep(0, 1, seg(0.52, 0.64)));
    loaded = true;
  } else if (u < 0.70) {                // land and release
    from = place; to = place; t = 1;
    hook = place.y;
    loaded = u < 0.68;
  } else if (u < 0.82) {                // hoist clear, empty
    from = place; to = place; t = 1;
    hook = mix(place.y, travelY, smoothstep(0, 1, seg(0.70, 0.82)));
  } else {                              // slew back
    from = place; to = pick; t = smoothstep(0, 1, seg(0.82, 1.00));
  }
  // Interpolate the slew the short way round, so the jib never spins 300°.
  let delta = to.angle - from.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return {
    angle: from.angle + delta * t,
    radius: mix(from.radius, to.radius, t),
    hook,
    loaded,
  };
}

export function buildConstruction(ctx) {
  const { scene, materials, project, quality } = ctx;

  const root = new THREE.Group();
  root.name = 'construction';
  scene.add(root);

  const tier = quality && quality.tier ? quality.tier : { name: 'high' };
  const maxWorkers = tier.name === 'low' ? 20 : (tier.name === 'medium' ? 34 : 48);

  /* ------------------------------------------------------------- the crane */
  const craneGroup = new THREE.Group();
  craneGroup.name = 'crane';
  root.add(craneGroup);

  const padB = createSurfaceBuilder(1.6);
  padB.box(CRANE.x - 2.4, SITE_LEVEL - 0.4, CRANE.z - 2.4, CRANE.x + 2.4, CRANE.padTop, CRANE.z + 2.4);
  const padMat = materials.make('concrete');
  const padMesh = new THREE.Mesh(padB.build(), padMat);
  padMesh.name = 'crane:base';
  padMesh.castShadow = true;
  padMesh.receiveShadow = true;
  craneGroup.add(padMesh);

  const mastB = createSurfaceBuilder(1.2);
  latticeMast(mastB, CRANE.x, CRANE.z, CRANE.padTop, CRANE.mastHigh, CRANE.mastWidth, 0.075);
  const mastMat = materials.make('craneSteel');
  const mastMesh = new THREE.Mesh(mastB.build(), mastMat);
  mastMesh.name = 'crane:mast';
  mastMesh.castShadow = true;
  craneGroup.add(mastMesh);

  // The turret carries the jib, the counter-jib, the machinery deck and the
  // cab, and is the only part that slews.
  const turret = new THREE.Group();
  turret.name = 'crane:turret';
  craneGroup.add(turret);

  const turretB = createSurfaceBuilder(1.2);
  // Slewing ring and the A-frame over it.
  turretB.box(-1.0, -0.55, -1.0, 1.0, 0, 1.0);
  turretB.box(-0.12, 0, -0.9, 0.12, 3.4, -0.55);
  turretB.box(-0.12, 0, 0.55, 0.12, 3.4, 0.9);
  turretB.box(-0.16, 3.2, -0.9, 0.16, 3.4, 0.9);
  latticeBoom(turretB, CRANE.jib, 1.55, 0.065);
  // Counter-jib, machinery deck and counterweight blocks.
  turretB.box(-CRANE.counterJib, -0.55, -0.62, 0, -0.20, 0.62);
  turretB.box(-CRANE.counterJib, -0.20, -0.62, -CRANE.counterJib + 3.0, 0.85, 0.62);
  turretB.box(-CRANE.counterJib + 3.2, -0.20, -0.55, -CRANE.counterJib + 5.6, 0.55, 0.55);
  // Pendant ties from the A-frame to the jib and the counter-jib.
  for (const [x0, x1] of [[0.2, CRANE.jib * 0.55], [CRANE.jib * 0.55, CRANE.jib - 0.5]]) {
    const y0 = 3.3 - (x0 / CRANE.jib) * 2.4;
    const y1 = 3.3 - (x1 / CRANE.jib) * 3.0;
    const steps = 6;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      turretB.box(mix(x0, x1, t0), mix(y0, y1, t0) - 0.05, -0.05,
        mix(x0, x1, t1), mix(y0, y1, t1) + 0.05, 0.05);
    }
  }
  // The operator's cab, hung under the A-frame.
  turretB.box(0.9, -1.9, -0.72, 2.3, -0.35, 0.72);
  const turretMat = materials.make('craneSteel');
  const turretMesh = new THREE.Mesh(turretB.build(), turretMat);
  turretMesh.name = 'crane:jib';
  turretMesh.castShadow = true;
  turret.add(turretMesh);

  // Trolley, hoist rope, hook block and the load, all hung from the jib.
  const trolley = new THREE.Group();
  turret.add(trolley);
  const trolleyB = createSurfaceBuilder(0.8);
  trolleyB.box(-0.42, -0.62, -0.34, 0.42, -0.20, 0.34);
  const trolleyMesh = new THREE.Mesh(trolleyB.build(), materials.make('steel'));
  trolleyMesh.name = 'crane:trolley';
  trolley.add(trolleyMesh);

  const ropeGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
  ropeGeo.translate(0, -0.5, 0);   // pivot at the top, so scale.y is the drop
  const ropeMesh = new THREE.Mesh(ropeGeo, materials.make('steel', { colour: 0x50565f }));
  ropeMesh.name = 'crane:rope';
  ropeMesh.position.y = -0.62;
  trolley.add(ropeMesh);

  const hookGroup = new THREE.Group();
  trolley.add(hookGroup);
  const hookB = createSurfaceBuilder(0.6);
  hookB.box(-0.28, -0.10, -0.16, 0.28, 0.32, 0.16);
  hookB.box(-0.06, -0.62, -0.06, 0.06, -0.10, 0.06);
  hookB.box(-0.06, -0.72, -0.06, 0.22, -0.62, 0.06);
  const hookMesh = new THREE.Mesh(hookB.build(), materials.make('steel'));
  hookMesh.name = 'crane:hook';
  hookGroup.add(hookMesh);

  // The load: a banded pallet of facing brick, which is what a crane on a
  // masonry job spends its day lifting.
  const loadB = createSurfaceBuilder(0.5);
  loadB.box(-0.62, -1.62, -0.46, 0.62, -0.78, 0.46);
  const loadMesh = new THREE.Mesh(loadB.build(), materials.make('brick'));
  loadMesh.name = 'crane:load';
  loadMesh.castShadow = true;
  hookGroup.add(loadMesh);

  /* -------------------------------------------------------- the scaffold -- */
  // Tube and fitting around the elevations, standards at 2.0 m, four lifts,
  // boarded at every lift, stopping short of the portico and the garage.
  const scaffoldGroup = new THREE.Group();
  root.add(scaffoldGroup);
  const scafOffset = 0.95;
  const scafLift = 2.0;
  const scafTop = ROOF.parapetTop + 1.0;
  const tubeB = createSurfaceBuilder(1.0);
  const boardB = createSurfaceBuilder(1.0);
  {
    const x0 = SHELL.x0 - scafOffset;
    const x1 = SHELL.x1 + scafOffset;
    const z0 = SHELL.z0 - scafOffset;
    const z1 = SHELL.z1 + scafOffset;
    const runs = [
      { fixed: 'z', at: z0, from: x0, to: x1, out: -1 },
      { fixed: 'z', at: z1, from: x0, to: x1, out: 1 },
      { fixed: 'x', at: x0, from: z0, to: z1, out: -1 },
      { fixed: 'x', at: x1, from: z0, to: z1, out: 1 },
    ];
    const blocked = (x, z) => (
      // The portico is a two-storey order — no scaffold across its face; the
      // garage roof is only 3.5 m up, so the west run stops at its flank.
      (x > PORTICO.x0 - 0.8 && x < PORTICO.x1 + 0.8 && z > PORTICO.z0 - 1.6)
      || (x < GARAGE.x1 + 0.6 && z > GARAGE.z0 - 0.8 && z < GARAGE.z1 + 0.8)
    );
    for (const run of runs) {
      const span = run.to - run.from;
      const bays = Math.max(1, Math.round(span / 2.0));
      for (let i = 0; i <= bays; i += 1) {
        const t = run.from + (span * i) / bays;
        const px = run.fixed === 'z' ? t : run.at;
        const pz = run.fixed === 'z' ? run.at : t;
        if (blocked(px, pz)) continue;
        // Two standards per bay: an inner and an outer board width apart.
        for (const off of [-0.32, 0.32]) {
          const sx = run.fixed === 'z' ? px : px + off * run.out;
          const sz = run.fixed === 'z' ? pz + off * run.out : pz;
          tubeB.box(sx - 0.026, SITE_LEVEL, sz - 0.026, sx + 0.026, scafTop, sz + 0.026);
        }
        // Transom across the bay.
        for (let lift = 1; lift * scafLift < scafTop; lift += 1) {
          const y = SITE_LEVEL + lift * scafLift;
          if (run.fixed === 'z') tubeB.box(px - 0.026, y - 0.026, pz - 0.36, px + 0.026, y + 0.026, pz + 0.36);
          else tubeB.box(px - 0.36, y - 0.026, pz - 0.026, px + 0.36, y + 0.026, pz + 0.026);
        }
      }
      // Ledgers and boards, run bay by bay so a blocked bay leaves a gap.
      for (let i = 0; i < bays; i += 1) {
        const ta = run.from + (span * i) / bays;
        const tb = run.from + (span * (i + 1)) / bays;
        const ax = run.fixed === 'z' ? ta : run.at;
        const az = run.fixed === 'z' ? run.at : ta;
        const bx = run.fixed === 'z' ? tb : run.at;
        const bz = run.fixed === 'z' ? run.at : tb;
        if (blocked(ax, az) || blocked(bx, bz)) continue;
        for (let lift = 1; lift * scafLift < scafTop; lift += 1) {
          const y = SITE_LEVEL + lift * scafLift;
          for (const off of [-0.32, 0.32]) {
            if (run.fixed === 'z') {
              const zz = az + off * run.out;
              tubeB.box(ax, y - 0.026, zz - 0.026, bx, y + 0.026, zz + 0.026);
            } else {
              const xx = ax + off * run.out;
              tubeB.box(xx - 0.026, y - 0.026, az, xx + 0.026, y + 0.026, bz);
            }
          }
          // Guard rail one metre over the boards.
          if (run.fixed === 'z') {
            const zz = az + 0.36 * run.out;
            tubeB.box(ax, y + 0.94, zz - 0.026, bx, y + 0.99, zz + 0.026);
            boardB.box(ax, y + 0.03, az - 0.34, bx, y + 0.08, az + 0.34);
          } else {
            const xx = ax + 0.36 * run.out;
            tubeB.box(xx - 0.026, y + 0.94, az, xx + 0.026, y + 0.99, bz);
            boardB.box(ax - 0.34, y + 0.03, az, ax + 0.34, y + 0.08, bz);
          }
        }
      }
    }
  }
  const scafTubeMat = materials.make('steel', { colour: 0x9aa1a8 });
  const scafBoardMat = materials.make('plywood');
  const scafTubeMesh = new THREE.Mesh(tubeB.build(), scafTubeMat);
  scafTubeMesh.name = 'scaffold:tubes';
  const scafBoardMesh = new THREE.Mesh(boardB.build(), scafBoardMat);
  scafBoardMesh.name = 'scaffold:boards';
  scafBoardMesh.castShadow = tier.name !== 'low';
  scaffoldGroup.add(scafTubeMesh, scafBoardMesh);

  /* -------------------------------------------------- excavation & spoil -- */
  const digGroup = new THREE.Group();
  root.add(digGroup);
  const spoilB = createSurfaceBuilder(2.4);
  for (let i = 0; i < 5; i += 1) {
    const cx = -8 + i * 4.0;
    const cz = -14.0 + hash2(i, 3) * 0.5;
    const h = 1.1 + hash2(i, 9) * 0.7;
    // Each heap is a short stack of shrinking boxes — an angle of repose,
    // roughly, and cheaper than a cone.
    for (let s = 0; s < 4; s += 1) {
      const k = s / 4;
      const r = mix(2.3, 0.4, k);
      spoilB.box(cx - r, SITE_LEVEL + h * k, cz - r * 0.8, cx + r, SITE_LEVEL + h * (k + 0.25), cz + r * 0.8);
    }
  }
  const spoilMesh = new THREE.Mesh(spoilB.build(), materials.make('soil'));
  spoilMesh.name = 'site:spoil';
  spoilMesh.receiveShadow = true;
  spoilMesh.castShadow = true;
  digGroup.add(spoilMesh);

  // A tracked excavator, with a boom that works.
  const excavator = new THREE.Group();
  excavator.position.set(-3.4, SITE_LEVEL, -7.5);
  excavator.rotation.y = 0.6;
  digGroup.add(excavator);
  const trackB = createSurfaceBuilder(0.9);
  for (const s of [-1, 1]) trackB.box(-1.9, 0, s * 0.95 - 0.32, 1.9, 0.72, s * 0.95 + 0.32);
  const trackMesh = new THREE.Mesh(trackB.build(), materials.make('steel', { colour: 0x3c4046 }));
  trackMesh.name = 'plant:tracks';
  excavator.add(trackMesh);
  const houseGroup = new THREE.Group();
  houseGroup.position.y = 0.72;
  excavator.add(houseGroup);
  const houseB = createSurfaceBuilder(0.9);
  houseB.box(-1.7, 0, -1.05, 1.1, 1.15, 1.05);
  houseB.box(-0.1, 0, -0.85, 1.25, 1.85, 0.85);
  const houseMesh = new THREE.Mesh(houseB.build(), materials.make('paintedSteel'));
  houseMesh.name = 'plant:excavator';
  houseMesh.castShadow = true;
  houseGroup.add(houseMesh);
  const boomPivot = new THREE.Group();
  boomPivot.position.set(1.1, 0.6, 0);
  houseGroup.add(boomPivot);
  const boomB = createSurfaceBuilder(0.9);
  boomB.box(0, -0.20, -0.20, 3.1, 0.22, 0.20);
  const boomMesh = new THREE.Mesh(boomB.build(), materials.make('paintedSteel'));
  boomMesh.name = 'plant:boom';
  boomMesh.castShadow = true;
  boomPivot.add(boomMesh);
  const dipperPivot = new THREE.Group();
  dipperPivot.position.set(3.1, 0, 0);
  boomPivot.add(dipperPivot);
  const dipperB = createSurfaceBuilder(0.9);
  dipperB.box(0, -0.16, -0.16, 2.0, 0.16, 0.16);
  dipperB.box(1.85, -0.75, -0.42, 2.55, -0.05, 0.42);
  const dipperMesh = new THREE.Mesh(dipperB.build(), materials.make('paintedSteel'));
  dipperMesh.name = 'plant:dipper';
  dipperMesh.castShadow = true;
  dipperPivot.add(dipperMesh);

  /* --------------------------------------------------- the working site -- */
  // A building site is not a lawn.  From site clearance until the hardscape
  // goes in, the plot is compacted earth, laid over the ground element so that
  // the landscape packages can simply take it away again.
  // The overlay is cut around the building exactly as the ground beneath it
  // is — both take their holes from the same list in the plan, so the earth
  // can never read as sliced where the two meet.
  const groundB = createSurfaceBuilder(3.2);
  const plotRect = { x0: PLOT.x0 + 0.15, z0: PLOT.z0 + 0.15, x1: PLOT.x1 - 0.15, z1: PLOT.z1 - 0.15 };
  for (const r of subtractRects(plotRect, FOOTPRINT_HOLES)) {
    groundB.box(r.x0, SITE_LEVEL + 0.004, r.z0, r.x1, SITE_LEVEL + 0.022, r.z1);
  }
  const siteGroundMesh = new THREE.Mesh(groundB.build(), materials.make('soil'));
  siteGroundMesh.name = 'site:workingGround';
  siteGroundMesh.receiveShadow = true;
  root.add(siteGroundMesh);

  // Before the dig, the footprint is undisturbed turf.
  const capB = createSurfaceBuilder(3.2);
  for (const hole of FOOTPRINT_HOLES) {
    capB.box(hole.x0, SITE_LEVEL - 0.8, hole.z0, hole.x1, SITE_LEVEL, hole.z1);
  }
  const capTurfMesh = new THREE.Mesh(capB.build(), materials.make('grass', { colour: 0x79855a }));
  capTurfMesh.name = 'site:untouchedGround';
  capTurfMesh.receiveShadow = true;
  root.add(capTurfMesh);

  /**
   * The dig, modelled as the earth that is *still there* rather than as a hole.
   *
   * A hole cannot be revealed: cut the top off a box and you are looking at
   * the inside of a box, which is to say at nothing, and the sky shows through
   * the floor.  So the excavation is a stack of thin lifts filling the
   * footprint, and the reveal plane takes the lifts away from the top down as
   * the package earns value — every stage has a real ground surface to stand
   * on, because the lift under the plane still has its own top face.
   *
   * The cut face of the surrounding ground is the same plane read the other
   * way round: the earth keeps what is *below* it, the face keeps what is
   * *above* it, so the two always meet exactly at the formation of the day.
   */
  const LIFT = 0.2;
  const pitEarthB = createSurfaceBuilder(2.2);
  const pitFaceB = createSurfaceBuilder(2.2);
  {
    const hole = FOOTPRINT_HOLES[0];
    const t = 0.30;
    for (let y = FORMATION_LEVEL; y < SITE_LEVEL - 1e-6; y += LIFT) {
      pitEarthB.box(hole.x0 + t, y, hole.z0 + t, hole.x1 - t, Math.min(SITE_LEVEL, y + LIFT), hole.z1 - t);
    }
    // The exposed sides, a ring one shoring-board thick.
    pitFaceB.box(hole.x0, FORMATION_LEVEL, hole.z0, hole.x0 + t, SITE_LEVEL, hole.z1);
    pitFaceB.box(hole.x1 - t, FORMATION_LEVEL, hole.z0, hole.x1, SITE_LEVEL, hole.z1);
    pitFaceB.box(hole.x0 + t, FORMATION_LEVEL, hole.z0, hole.x1 - t, SITE_LEVEL, hole.z0 + t);
    pitFaceB.box(hole.x0 + t, FORMATION_LEVEL, hole.z1 - t, hole.x1 - t, SITE_LEVEL, hole.z1);
  }
  const pitEarthMat = materials.make('soil');
  const pitFaceMat = materials.make('soil', { colour: 0xd8cbb8 });
  // The garage and the portico are not dug to basement depth, so their
  // cut-outs are simply stripped ground until their own slabs are cast.
  const shallowB = createSurfaceBuilder(3.2);
  for (const hole of FOOTPRINT_HOLES.slice(1)) {
    shallowB.box(hole.x0, SITE_LEVEL - 0.8, hole.z0, hole.x1, SITE_LEVEL, hole.z1);
  }
  const shallowMesh = new THREE.Mesh(shallowB.build(), materials.make('soil'));
  shallowMesh.name = 'site:strippedGround';
  shallowMesh.receiveShadow = true;
  root.add(shallowMesh);

  const pitEarthMesh = new THREE.Mesh(pitEarthB.build(), pitEarthMat);
  pitEarthMesh.name = 'site:excavation';
  pitEarthMesh.receiveShadow = true;
  const pitFaceMesh = new THREE.Mesh(pitFaceB.build(), pitFaceMat);
  pitFaceMesh.name = 'site:excavationFace';
  pitFaceMesh.receiveShadow = true;
  root.add(pitEarthMesh, pitFaceMesh);

  /* ------------------------------------------------------- the compound -- */
  const compoundGroup = new THREE.Group();
  root.add(compoundGroup);
  const hutB = createSurfaceBuilder(1.4);
  const steelB = createSurfaceBuilder(1.0);
  const brickB = createSurfaceBuilder(0.5);
  const heapB = createSurfaceBuilder(2.0);
  {
    // Two site cabins: the agent's office and a store, on bearers.
    for (let i = 0; i < 2; i += 1) {
      const x = COMPOUND.x0 + 0.6;
      const z = COMPOUND.z0 + 0.8 + i * 4.0;
      hutB.box(x, SITE_LEVEL + 0.18, z, x + 4.4, SITE_LEVEL + 2.72, z + 2.6);
      hutB.box(x - 0.12, SITE_LEVEL + 2.72, z - 0.12, x + 4.52, SITE_LEVEL + 2.90, z + 2.72);
      steelB.box(x + 0.2, SITE_LEVEL, z + 0.2, x + 0.5, SITE_LEVEL + 0.18, z + 2.4);
      steelB.box(x + 3.9, SITE_LEVEL, z + 0.2, x + 4.2, SITE_LEVEL + 0.18, z + 2.4);
      // Window band and a door, as shallow reveals in the cladding.
      steelB.box(x + 0.7, SITE_LEVEL + 1.30, z + 2.60, x + 2.5, SITE_LEVEL + 2.10, z + 2.66);
      steelB.box(x + 3.0, SITE_LEVEL + 0.20, z + 2.60, x + 3.9, SITE_LEVEL + 2.30, z + 2.66);
    }
    // A water tank on a stand, and the batching area.
    steelB.box(COMPOUND.x1 - 2.4, SITE_LEVEL, COMPOUND.z1 - 2.2, COMPOUND.x1 - 2.2, SITE_LEVEL + 2.4, COMPOUND.z1 - 2.0);
    steelB.box(COMPOUND.x1 - 0.6, SITE_LEVEL, COMPOUND.z1 - 2.2, COMPOUND.x1 - 0.4, SITE_LEVEL + 2.4, COMPOUND.z1 - 2.0);
    steelB.box(COMPOUND.x1 - 2.4, SITE_LEVEL, COMPOUND.z1 - 0.6, COMPOUND.x1 - 2.2, SITE_LEVEL + 2.4, COMPOUND.z1 - 0.4);
    steelB.box(COMPOUND.x1 - 0.6, SITE_LEVEL, COMPOUND.z1 - 0.6, COMPOUND.x1 - 0.4, SITE_LEVEL + 2.4, COMPOUND.z1 - 0.4);
    hutB.box(COMPOUND.x1 - 2.6, SITE_LEVEL + 2.4, COMPOUND.z1 - 2.4, COMPOUND.x1 - 0.2, SITE_LEVEL + 3.9, COMPOUND.z1 - 0.2);

    // Reinforcement bundles.
    for (let i = 0; i < 6; i += 1) {
      const z = COMPOUND.z0 + 5.4 + (i % 3) * 0.28;
      const y = SITE_LEVEL + 0.10 + Math.floor(i / 3) * 0.26;
      steelB.box(COMPOUND.x1 - 4.6, y, z, COMPOUND.x1 - 0.6, y + 0.24, z + 0.24);
    }
    // Brick stacks, banded the way they arrive on a pallet.
    for (let i = 0; i < 4; i += 1) {
      const x = STOCKPILE.x - 1.6 + (i % 2) * 1.9;
      const z = STOCKPILE.z - 1.0 + Math.floor(i / 2) * 1.6;
      brickB.box(x, SITE_LEVEL, z, x + 1.5, SITE_LEVEL + 1.05, z + 1.15);
    }
    // Sand and aggregate.
    for (let i = 0; i < 2; i += 1) {
      const cx = COMPOUND.x0 + 2.2 + i * 2.6;
      const cz = COMPOUND.z1 - 1.6;
      for (let s = 0; s < 4; s += 1) {
        const k = s / 4;
        const r = mix(1.5, 0.28, k);
        heapB.box(cx - r, SITE_LEVEL + 1.35 * k, cz - r, cx + r, SITE_LEVEL + 1.35 * (k + 0.25), cz + r);
      }
    }
  }
  const hutMesh = new THREE.Mesh(hutB.build(), materials.make('plywood'));
  hutMesh.name = 'site:cabins';
  hutMesh.castShadow = true;
  const compSteelMesh = new THREE.Mesh(steelB.build(), materials.make('steel', { colour: 0x7d848c }));
  compSteelMesh.name = 'site:steelStore';
  const compBrickMesh = new THREE.Mesh(brickB.build(), materials.make('brick'));
  compBrickMesh.name = 'site:brickStacks';
  compBrickMesh.castShadow = true;
  const compHeapMesh = new THREE.Mesh(heapB.build(), materials.make('gravel'));
  compHeapMesh.name = 'site:aggregate';
  compoundGroup.add(hutMesh, compSteelMesh, compBrickMesh, compHeapMesh);

  /* -------------------------------------------------------- the workforce */
  // Three instanced meshes make a figure: the body, the hi-vis over it, and
  // one arm that swings from the shoulder.  A fourth carries whatever is in
  // the worker's hand.  Four draw calls for the whole site.
  const bodyB = createSurfaceBuilder(0.5);
  bodyB.box(-0.19, 0, -0.10, -0.03, 0.80, 0.10);
  bodyB.box(0.03, 0, -0.10, 0.19, 0.80, 0.10);
  bodyB.box(-0.21, 0.80, -0.13, 0.21, 1.36, 0.13);
  bodyB.box(-0.10, 1.36, -0.10, 0.10, 1.55, 0.10);
  const vestB = createSurfaceBuilder(0.5);
  vestB.box(-0.23, 0.86, -0.15, 0.23, 1.30, 0.15);
  vestB.box(-0.13, 1.53, -0.13, 0.13, 1.65, 0.13);
  const armB = createSurfaceBuilder(0.5);
  armB.box(-0.055, -0.58, -0.055, 0.055, 0.03, 0.055);   // pivot at the shoulder
  const handB = createSurfaceBuilder(0.4);
  handB.box(-0.11, -0.05, -0.06, 0.11, 0.05, 0.06);

  const bodyMesh = new THREE.InstancedMesh(bodyB.build(), materials.make('workwear'), maxWorkers);
  const vestMesh = new THREE.InstancedMesh(vestB.build(), materials.make('hiVis'), maxWorkers);
  const armMesh = new THREE.InstancedMesh(armB.build(), materials.make('skin'), maxWorkers);
  const handMesh = new THREE.InstancedMesh(handB.build(), materials.make('brick'), maxWorkers);
  for (const m of [bodyMesh, vestMesh, armMesh, handMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    root.add(m);
  }
  bodyMesh.name = 'site:workforce';
  vestMesh.name = 'site:workforceVests';
  armMesh.name = 'site:workforceArms';
  handMesh.name = 'site:workforceLoads';
  bodyMesh.castShadow = tier.name !== 'low';
  vestMesh.castShadow = tier.name !== 'low';

  /** One posted worker. Re-posted only when the day changes. */
  const workers = [];
  for (let i = 0; i < maxWorkers; i += 1) {
    workers.push({ x: 0, y: 0, z: 0, yaw: 0, task: 'work', phase: 0, rate: 1, reach: 0 });
  }
  let workerCount = 0;

  /* ------------------------------------------------------------- day state */
  let day = project.horizon;
  let elapsed = 0;
  let xrayOn = false;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const mat4 = new THREE.Matrix4();
  const euler = new THREE.Euler();

  /** The state the whole module derives from the day. */
  const state = {
    craneUp: false,
    mastTop: CRANE.mastLow,
    workFace: { x: 0, y: 0, z: -5 },
    scaffold: 0,      // 0 none, else the height erected
    striking: 0,      // height struck from the ground up, once the façade is done
    compound: false,
    formation: SITE_LEVEL,
    digging: false,
    spoil: false,
    headcount: 0,
  };

  function progress(id) { return packageProgress(project, id, day); }

  /** Post the workforce for a day: who is on site, and where they stand. */
  function deploy() {
    const active = activePackages(project, day).filter((a) => WORKER_ZONES[a.id]);
    state.headcount = siteHeadcount(project, day);
    if (!active.length) { workerCount = 0; return; }
    // The resource model derives head count from a package's budget, and a
    // package whose cost is nearly all material — the raft's reinforcement is
    // bought under the pour that follows it — can round to nought assigned
    // while it is plainly in progress. A package in progress has people on it,
    // so the floor here is two figures per active package: the histogram in
    // the dashboard stays the model's number, and the site is never deserted
    // on a day when something is being earned.
    const derived = Math.round(state.headcount * 0.42);
    const head = clamp(Math.max(derived, active.length * 2), 1, maxWorkers);
    // Share the figures out in proportion to each package's crew size, so the
    // gang you can see is the gang the resource histogram is charging for.
    const weights = active.map((a) => Math.max(0.25, 1 - Math.abs(a.progress - 0.5)));
    const total = weights.reduce((s, w) => s + w, 0);
    let index = 0;
    for (let i = 0; i < active.length && index < head; i += 1) {
      const share = Math.max(1, Math.round((head * weights[i]) / total));
      const zone = WORKER_ZONES[active[i].id];
      for (let k = 0; k < share && index < head; k += 1) {
        const st = zoneStation(zone, index * 13 + i * 101 + 7);
        const w = workers[index];
        w.x = st.x; w.z = st.z; w.yaw = st.yaw;
        w.y = zone.scaffold
          // Façade trades work off the scaffold, so they are at lift level.
          ? SITE_LEVEL + scafLift * (1 + Math.floor(hash2(index, 21) * 4))
          : zone.y;
        w.task = zone.task;
        w.rate = 0.72 + hash2(index, 5) * 0.7;
        w.phase = hash2(index, 11);
        w.reach = 0.9 + hash2(index, 31) * 0.6;
        index += 1;
      }
    }
    workerCount = index;
  }

  /** The level the crane is currently serving. */
  function workFaceFor() {
    const roof = progress('F4');
    const first = progress('F2');
    const ground = progress('S7');
    if (progress('E4') > 0.02 || progress('E2') > 0.02) return { x: -1.5, y: LEVELS[2].floor + 0.4, z: -5 };
    if (roof > 0.02) return { x: 0.5, y: ROOF.level + 0.4, z: -4 };
    if (first > 0.02) return { x: -1.0, y: LEVELS[2].floor + 0.4, z: -6 };
    if (ground > 0.02) return { x: 1.0, y: LEVELS[1].floor + 0.4, z: -5 };
    return { x: 0, y: LEVELS[0].floor + 0.6, z: -5 };
  }

  function applyDay(nextDay) {
    day = nextDay;

    // The crane: erected in the second half of P4, struck once the façade is
    // complete. The mast climbs with the frame.
    const erect = progress('P4');
    const facade = progress('E4');
    state.craneUp = erect > 0.45 && facade < 0.995;
    const frame = Math.max(progress('F1'), progress('F2'), progress('F3'), progress('F4'));
    state.mastTop = mix(CRANE.mastLow, CRANE.mastHigh, smoothstep(0, 1, frame));
    craneGroup.visible = state.craneUp && !xrayOn;
    if (state.craneUp) {
      setReveal(mastMat, [0, 1, 0], state.mastTop);
      turret.position.set(CRANE.x, state.mastTop, CRANE.z);
    }
    state.workFace = workFaceFor();

    // The scaffold goes up with the ground floor masonry and comes down from
    // the top as the façade finishes.
    const masonry = Math.max(progress('E1'), progress('E2'));
    const strike = clamp((facade - 0.86) / 0.14, 0, 1);
    state.scaffold = masonry > 0.03 && facade < 0.999 ? mix(SITE_LEVEL, scafTop, smoothstep(0, 1, Math.min(1, masonry * 1.25))) : 0;
    scaffoldGroup.visible = state.scaffold > 0 && !xrayOn;
    if (scaffoldGroup.visible) {
      if (strike <= 0) {
        for (const m of [scafTubeMat, scafBoardMat]) setReveal(m, [0, 1, 0], state.scaffold);
      } else {
        // Struck from the ground up: keep only what is above the strike line.
        for (const m of [scafTubeMat, scafBoardMat]) setReveal(m, [0, -1, 0], -mix(SITE_LEVEL, scafTop, strike));
      }
    }

    // Excavation, and the spoil that stays until the backfill.
    state.digging = progress('S1') > 0.02 && progress('S2') < 0.35;
    state.spoil = progress('S1') > 0.02 && progress('S6') < 0.85;
    digGroup.visible = (state.digging || state.spoil) && !xrayOn;
    excavator.visible = state.digging;
    spoilMesh.visible = state.spoil;

    // Bare working ground, from site clearance until the hardscape starts.
    const cleared = progress('P2');
    const dig = progress('S1');
    siteGroundMesh.visible = cleared > 0.25 && progress('L1') < 0.15 && !xrayOn;

    // The footprint: turf until the site is cleared, then earth that the
    // excavation takes away lift by lift.
    capTurfMesh.visible = cleared <= 0.25 && !xrayOn;
    const open = cleared > 0.25 && progress('S7') < 0.6 && !xrayOn;
    pitEarthMesh.visible = open;
    pitFaceMesh.visible = open;
    shallowMesh.visible = open;
    // Stop the plane at the top of the lowest lift: cut below it and that
    // lift loses the top face that *is* the formation, and the sky shows
    // through the bottom of the hole.
    state.formation = mix(SITE_LEVEL, FORMATION_LEVEL + LIFT, smoothstep(0, 1, Math.min(1, dig * 1.1)));
    if (open) {
      setReveal(pitEarthMat, [0, 1, 0], state.formation);
      setReveal(pitFaceMat, [0, -1, 0], -state.formation);
    }
    // The machine works off the formation of the day, so it goes down with
    // the dig instead of hovering over it.
    excavator.position.y = state.formation;

    // The compound is up from the day the site office goes in until the
    // builders' clean.
    state.compound = progress('P3') > 0.15 && progress('H3') < 0.75;
    compoundGroup.visible = state.compound && !xrayOn;

    deploy();
    for (const m of [bodyMesh, vestMesh, armMesh, handMesh]) {
      m.count = workerCount;
      // An instanced mesh with no instances is still a node the renderer walks
      // and a draw call some paths still issue, so an empty site is hidden
      // rather than merely emptied.
      m.visible = workerCount > 0 && !xrayOn;
    }
  }

  function setXrayMode(on) {
    xrayOn = !!on;
    // The x-ray is about the building's own systems: the plant would only be
    // noise across it.
    for (const g of [craneGroup, scaffoldGroup, digGroup, compoundGroup]) {
      if (g.visible && xrayOn) g.visible = false;
    }
    for (const m of [bodyMesh, vestMesh, armMesh, handMesh]) m.visible = workerCount > 0 && !xrayOn;
    if (xrayOn) {
      for (const m of [siteGroundMesh, capTurfMesh, pitEarthMesh, pitFaceMesh, shallowMesh]) m.visible = false;
    }
    if (!xrayOn) applyDay(day);
  }

  /** Animate the crane's duty cycle and the gangs. */
  function update(dt) {
    elapsed += dt;

    if (craneGroup.visible) {
      const toAngle = (x, z) => -Math.atan2(z - CRANE.z, x - CRANE.x);
      const toRadius = (x, z) => clamp(Math.hypot(x - CRANE.x, z - CRANE.z), 5.0, CRANE.jib - 1.5);
      const pick = {
        angle: toAngle(STOCKPILE.x, STOCKPILE.z),
        radius: toRadius(STOCKPILE.x, STOCKPILE.z),
        y: SITE_LEVEL + 1.3,
      };
      const place = {
        angle: toAngle(state.workFace.x, state.workFace.z),
        radius: toRadius(state.workFace.x, state.workFace.z),
        y: state.workFace.y + 1.4,
      };
      const travelY = Math.max(pick.y, place.y) + CRANE.travelClear;
      const u = (elapsed % CRANE.cycleSeconds) / CRANE.cycleSeconds;
      const c = craneCycle(u, pick, place, travelY);
      turret.rotation.y = c.angle;
      trolley.position.x = c.radius;
      const drop = Math.max(0.4, state.mastTop - c.hook - 0.62);
      ropeMesh.scale.y = drop;
      hookGroup.position.y = -0.62 - drop;
      loadMesh.visible = c.loaded;
    }

    if (state.digging && excavator.visible) {
      // Dig, swing, dump: about eight seconds, which is what a 20-tonne
      // machine takes on a basement dig in this ground.
      const u = (elapsed % 8.4) / 8.4;
      houseGroup.rotation.y = 0.6 + Math.sin(u * Math.PI * 2) * 0.85;
      boomPivot.rotation.z = -0.28 + Math.sin(u * Math.PI * 2 + 1.1) * 0.30;
      dipperPivot.rotation.z = -0.75 + Math.sin(u * Math.PI * 2 + 2.4) * 0.55;
    }

    if (!workerCount) return;
    for (let i = 0; i < workerCount; i += 1) {
      const w = workers[i];
      const t = (elapsed * w.rate + w.phase * 9.7);
      let bob = 0;
      let swing = 0;
      let carry = false;
      let x = w.x;
      let z = w.z;
      if (w.task === 'lay') {
        // Down to the stack, up to the course: a bricklayer's cycle is about
        // two and a half seconds a brick, and the brick is only in the hand on
        // the way up.
        const u = (t / 2.6) % 1;
        swing = mix(-0.35, -2.35, smoothstep(0, 1, u < 0.5 ? u * 2 : (1 - u) * 2));
        bob = Math.sin(u * Math.PI * 2) * 0.035;
        carry = u < 0.5;
      } else if (w.task === 'carry') {
        // A short beat between the stockpile and the face, with the load up.
        const u = (t / 7.0) % 1;
        const leg = u < 0.5 ? u * 2 : (1 - u) * 2;
        x = mix(w.x, w.x + Math.sin(w.yaw + 1.2) * 2.6, leg);
        z = mix(w.z, w.z + Math.cos(w.yaw + 1.2) * 2.6, leg);
        swing = -2.55;
        bob = Math.abs(Math.sin(t * 4.4)) * 0.05;
        carry = true;
      } else {
        swing = -1.1 + Math.sin(t * 2.9) * 0.75;
        bob = Math.sin(t * 2.9) * 0.03;
      }

      euler.set(0, w.yaw, 0);
      quat.setFromEuler(euler);
      pos.set(x, w.y + bob, z);
      scl.set(1, 1, 1);
      mat4.compose(pos, quat, scl);
      bodyMesh.setMatrixAt(i, mat4);
      vestMesh.setMatrixAt(i, mat4);

      // The arm hangs off the shoulder, on the side the worker is facing.
      const shoulderX = Math.cos(w.yaw) * 0.0 + Math.sin(w.yaw) * 0.0;
      euler.set(swing, w.yaw, 0, 'YXZ');
      quat.setFromEuler(euler);
      pos.set(x + shoulderX, w.y + bob + 1.30, z);
      mat4.compose(pos, quat, scl);
      armMesh.setMatrixAt(i, mat4);

      // Whatever is in the hand, at the end of the arm.
      const hx = Math.sin(w.yaw) * Math.sin(-swing) * 0.58;
      const hz = Math.cos(w.yaw) * Math.sin(-swing) * 0.58;
      pos.set(x + hx, w.y + bob + 1.30 - Math.cos(swing) * 0.58, z + hz);
      euler.set(0, w.yaw, 0);
      quat.setFromEuler(euler);
      scl.set(carry ? 1 : 0.0001, carry ? 1 : 0.0001, carry ? 1 : 0.0001);
      mat4.compose(pos, quat, scl);
      handMesh.setMatrixAt(i, mat4);
    }
    scl.set(1, 1, 1);
    bodyMesh.instanceMatrix.needsUpdate = true;
    vestMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    handMesh.instanceMatrix.needsUpdate = true;
  }

  /** What the HUD says about the site on this day. */
  function report() {
    return {
      headcount: Math.round(state.headcount),
      onScreen: workerCount,
      crane: state.craneUp,
      scaffold: state.scaffold > 0,
      excavating: state.digging,
      compound: state.compound,
    };
  }

  applyDay(day);

  return {
    /** No revealable elements: the plant is not paid for by a work package. */
    elements: [],
    root,
    applyDay,
    update,
    setXray: setXrayMode,
    report,
    dispose() {
      scene.remove(root);
    },
  };
}
