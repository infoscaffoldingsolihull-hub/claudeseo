/**
 * AEON SPIRE — cranes (E.7).
 *
 * Three kinds, matching the milestones that call for them:
 *   tower    — the workhorse of milestones 4-6: mast, slewing jib,
 *              travelling trolley, hook block on a payout hoist rope.
 *   crawler  — milestone 5's steel erection: tracked base, luffing lattice
 *              boom, hook.
 *   climbing — milestone 7's self-jacking crane, which rises with the spire
 *              and carries the topping-out flag.
 *
 * Each returns a group plus an `update(dt, t, activity)` that slews, trolleys
 * and hoists on independent cycles, so a site full of cranes never looks
 * like one animation played several times.
 */

import * as THREE from 'three';
import {
  mergeGeometries, xform, box, cyl, mesh, member, tube, flag
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng, smoothstep } from '../core/MathUtil.js';

/** A square lattice mast section, `h` tall with `w` face width. */
function latticeMast(w, h, bays) {
  const parts = [];
  const half = w / 2;
  const legs = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [x, z] of legs) parts.push(cyl(0.11, 0.11, h, 6, [x, h / 2, z]));
  const dy = h / bays;
  for (let b = 0; b <= bays; b++) {
    const y = b * dy;
    for (let i = 0; i < 4; i++) {
      const a = legs[i], c = legs[(i + 1) % 4];
      const m = member([a[0], y, a[1]], [c[0], y, c[1]], 0.07, 0.07);
      if (m) parts.push(m);
      if (b < bays) {
        const d = member([a[0], y, a[1]], [c[0], y + dy, c[1]], 0.055, 0.055);
        if (d) parts.push(d);
      }
    }
  }
  return mergeGeometries(parts.filter(Boolean));
}

/** A lattice jib of length `len`, tapering in depth. */
function latticeJib(len, depth0, depth1, bays) {
  const parts = [];
  const at = (t) => {
    const d = lerp(depth0, depth1, t) / 2;
    return [[d, d], [-d, d], [-d, -d], [d, -d]];
  };
  for (let b = 0; b < bays; b++) {
    const t0 = b / bays, t1 = (b + 1) / bays;
    const p0 = at(t0), p1 = at(t1);
    const x0 = t0 * len, x1 = t1 * len;
    for (let i = 0; i < 4; i++) {
      const c0 = member([x0, p0[i][0], p0[i][1]], [x1, p1[i][0], p1[i][1]], 0.07, 0.07);
      if (c0) parts.push(c0);
      const j = (i + 1) % 4;
      const r0 = member([x0, p0[i][0], p0[i][1]], [x0, p0[j][0], p0[j][1]], 0.05, 0.05);
      if (r0) parts.push(r0);
      const d0 = member([x0, p0[i][0], p0[i][1]], [x1, p1[j][0], p1[j][1]], 0.045, 0.045);
      if (d0) parts.push(d0);
    }
  }
  return mergeGeometries(parts.filter(Boolean));
}

/**
 * A tower crane.
 * @returns {{group, update, setHeight, hookGroup}}
 */
export function towerCrane(materials, {
  mastHeight = 90, jibLength = 58, counterJib = 20, seed = 1, x = 0, z = 0
} = {}) {
  const steel = materials.solid('craneSteel', {
    color: 0xd8b22c, roughness: 0.52, metalness: 0.45, exterior: true, noClip: true
  });
  const dark = materials.solid('craneDark', {
    color: 0x2c2f34, roughness: 0.5, metalness: 0.6, exterior: true, noClip: true
  });
  const cable = materials.solid('craneCable', {
    color: 0x3a3d42, roughness: 0.4, metalness: 0.8, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'TowerCrane';
  group.position.set(x, 0, z);

  /* Base and mast. The mast is built once at full height and scaled, so a
     crane can grow with the building without rebuilding geometry. */
  group.add(mesh(mergeGeometries([
    box(7.5, 1.2, 7.5, [0, 0.6, 0]),
    box(5.5, 0.8, 5.5, [0, 1.5, 0])
  ]), dark, { name: 'CraneBase', cast: true, receive: true }));

  const mastGeo = latticeMast(2.6, 1, 1);          // unit height, scaled below
  const mastUnit = latticeMast(2.6, 10, 6);
  const mast = mesh(mastUnit, steel, { name: 'CraneMast', cast: true });
  mast.position.y = 1.9;
  group.add(mast);

  /* Everything above the mast slews. */
  const slew = new THREE.Group();
  slew.name = 'CraneSlew';
  group.add(slew);

  slew.add(mesh(mergeGeometries([
    box(3.2, 2.4, 3.2, [0, 1.2, 0]),
    box(2.2, 1.8, 2.6, [-2.4, 1.6, 0])       // operator's cab
  ]), dark, { name: 'CraneCab', cast: true }));

  const jib = latticeJib(jibLength, 1.9, 0.9, Math.round(jibLength / 4));
  slew.add(mesh(xform(jib, { pos: [0, 2.6, 0] }), steel, { name: 'CraneJib', cast: true }));

  const cj = latticeJib(counterJib, 1.9, 1.4, 5);
  cj.scale(-1, 1, 1);
  slew.add(mesh(xform(cj, { pos: [0, 2.6, 0] }), steel, { name: 'CraneCounterJib', cast: true }));
  slew.add(mesh(box(4.2, 1.6, 3.0, [-counterJib + 2, 2.9, 0]), dark, {
    name: 'CraneCounterweight', cast: true
  }));

  /* A-frame and pendant stays — what actually holds a jib up. */
  const aframe = [];
  aframe.push(member([0, 2.6, 0], [0, 10.5, 0], 0.16, 0.16));
  aframe.push(tube([0, 10.5, 0], [jibLength * 0.55, 3.2, 0], 0.05, 5));
  aframe.push(tube([0, 10.5, 0], [jibLength * 0.95, 3.0, 0], 0.05, 5));
  aframe.push(tube([0, 10.5, 0], [-counterJib + 2, 3.2, 0], 0.05, 5));
  slew.add(mesh(mergeGeometries(aframe.filter(Boolean)), cable, { name: 'CraneStays' }));

  /* Trolley and hook block on a payout rope. */
  const trolley = new THREE.Group();
  trolley.name = 'CraneTrolley';
  trolley.add(mesh(box(1.5, 0.7, 1.5, [0, 0, 0]), dark, { name: 'TrolleyBody' }));
  slew.add(trolley);

  const ropeMesh = mesh(cyl(0.035, 0.035, 1, 5, [0, -0.5, 0]), cable, { name: 'HoistRope' });
  trolley.add(ropeMesh);

  const hookGroup = new THREE.Group();
  hookGroup.name = 'HookBlock';
  hookGroup.add(mesh(mergeGeometries([
    box(0.8, 0.9, 0.5, [0, 0, 0]),
    cyl(0.1, 0.1, 0.9, 8, [0, -0.75, 0]),
    new THREE.TorusGeometry(0.28, 0.08, 6, 12).rotateY(Math.PI / 2).translate(0, -1.2, 0)
  ]), dark, { name: 'Hook', cast: true }));
  trolley.add(hookGroup);

  /* A slung load that appears while the crane is lifting. */
  const load = mesh(box(3.2, 0.9, 1.4, [0, -1.9, 0]), steel, { name: 'SlungLoad', cast: true });
  hookGroup.add(load);

  const r = rng(seed);
  const phase = r() * TAU;
  const slewRate = 0.06 + r() * 0.05;
  let cycle = r() * 20;
  let currentHeight = mastHeight;

  const api = {
    group, slew, trolley, hookGroup, mast, load,
    jibLength,
    /** Grow the crane with the building. */
    setHeight(h) {
      currentHeight = Math.max(12, h);
      mast.scale.y = currentHeight / 10;
      slew.position.y = 1.9 + currentHeight;
      return currentHeight;
    },
    update(dt, t, activity = 1) {
      cycle += dt * activity;
      // Slew continuously, but pause at the pick and the set.
      const hold = Math.sin(cycle * 0.35);
      slew.rotation.y = phase + cycle * slewRate * (0.4 + 0.6 * clamp(Math.abs(hold) * 2, 0, 1));
      // Trolley runs in and out along the jib.
      const tr = 0.5 + 0.5 * Math.sin(cycle * 0.22 + phase);
      trolley.position.set(lerp(jibLength * 0.25, jibLength * 0.92, tr), 2.2, 0);
      // Hoist: down to pick, up, across, down to set.
      const raise = 0.5 + 0.5 * Math.sin(cycle * 0.42 + phase * 1.7);
      const drop = lerp(currentHeight * 0.92, 3.5, raise) * clamp(activity, 0.15, 1);
      hookGroup.position.y = -drop;
      ropeMesh.scale.y = Math.max(0.1, drop);
      ropeMesh.position.y = -drop / 2;
      load.visible = raise < 0.65 && activity > 0.2;
      group.visible = activity > 0.02;
    }
  };
  api.setHeight(mastHeight);
  return api;
}

/** A tracked crawler crane with a luffing lattice boom. */
export function crawlerCrane(materials, { boom = 52, seed = 2, x = 0, z = 0, rot = 0 } = {}) {
  const steel = materials.solid('crawlerSteel', {
    color: 0xc94a2a, roughness: 0.55, metalness: 0.4, exterior: true, noClip: true
  });
  const dark = materials.solid('craneDark', {
    color: 0x2c2f34, roughness: 0.5, metalness: 0.6, exterior: true, noClip: true
  });
  const cable = materials.solid('craneCable', {
    color: 0x3a3d42, roughness: 0.4, metalness: 0.8, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'CrawlerCrane';
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  /* Tracks. */
  const tracks = [];
  for (const sx of [-1, 1]) {
    tracks.push(box(3.0, 1.3, 9.0, [sx * 2.9, 0.75, 0]));
    for (let i = 0; i < 7; i++) tracks.push(cyl(0.6, 0.6, 3.1, 10, [sx * 2.9, 0.75, -3.6 + i * 1.2], [0, 0, Math.PI / 2]));
  }
  group.add(mesh(mergeGeometries(tracks), dark, { name: 'Tracks', cast: true, receive: true }));

  /* Slewing superstructure. */
  const slew = new THREE.Group();
  slew.name = 'CrawlerSlew';
  slew.position.y = 1.5;
  group.add(slew);
  slew.add(mesh(mergeGeometries([
    box(5.0, 2.6, 7.4, [0, 1.3, 0]),
    box(2.2, 2.0, 2.4, [2.0, 2.6, 2.2]),        // cab
    box(3.0, 1.6, 2.0, [0, 1.4, -4.0])          // counterweight
  ]), steel, { name: 'Superstructure', cast: true }));

  /* Luffing boom. */
  const luff = new THREE.Group();
  luff.name = 'Boom';
  luff.position.set(0, 2.4, 2.6);
  slew.add(luff);
  const boomGeo = latticeJib(boom, 1.7, 1.0, Math.round(boom / 4));
  boomGeo.rotateZ(Math.PI / 2);
  boomGeo.rotateY(Math.PI / 2);
  luff.add(mesh(boomGeo, steel, { name: 'BoomLattice', cast: true }));

  const ropeMesh = mesh(cyl(0.035, 0.035, 1, 5, [0, -0.5, 0]), cable, { name: 'BoomRope' });
  const hookGroup = new THREE.Group();
  hookGroup.add(mesh(mergeGeometries([
    box(0.7, 0.8, 0.45, [0, 0, 0]),
    cyl(0.09, 0.09, 0.8, 8, [0, -0.7, 0])
  ]), dark, { name: 'Hook', cast: true }));
  const tip = new THREE.Group();
  tip.position.set(0, boom, 0);
  luff.add(tip);
  tip.add(ropeMesh, hookGroup);
  const load = mesh(box(6.5, 0.7, 0.7, [0, -1.4, 0]), steel, { name: 'SteelSection', cast: true });
  hookGroup.add(load);

  const r = rng(seed);
  let cycle = r() * 16;
  const phase = r() * TAU;

  return {
    group, slew, luff, hookGroup,
    update(dt, t, activity = 1) {
      cycle += dt * activity;
      slew.rotation.y = Math.sin(cycle * 0.13 + phase) * 1.1;
      // Luff between 42° and 72° from horizontal.
      luff.rotation.x = -(Math.PI / 2) + lerp(0.73, 1.26, 0.5 + 0.5 * Math.sin(cycle * 0.19 + phase));
      const raise = 0.5 + 0.5 * Math.sin(cycle * 0.4 + phase * 1.3);
      const drop = lerp(boom * 0.75, 4, raise) * clamp(activity, 0.15, 1);
      hookGroup.position.y = -drop;
      ropeMesh.scale.y = Math.max(0.1, drop);
      ropeMesh.position.y = -drop / 2;
      load.visible = raise < 0.6 && activity > 0.2;
      group.visible = activity > 0.02;
    }
  };
}

/**
 * The self-jacking climbing crane of milestone 7, complete with the
 * topping-out flag the brief calls for.
 */
export function climbingCrane(materials, { seed = 3, x = 0, z = 0, mastHeight = 30 } = {}) {
  const crane = towerCrane(materials, {
    mastHeight, jibLength: 34, counterJib: 13, seed, x, z
  });
  crane.group.name = 'ClimbingCrane';

  /* The topping-out flag, flown from the jib tip. Wind-reactive like every
     other flag on the campus. */
  const flagMat = materials.solid('toppingFlag', {
    color: 0xe8e2d4, roughness: 0.85, side: THREE.DoubleSide, exterior: true,
    wind: true, noClip: true
  });
  const pennant = mesh(flag(5.0, 2.4), flagMat, { name: 'ToppingOutFlag', cast: true });
  pennant.position.set(crane.jibLength * 0.9, 3.0, 0);
  crane.slew.add(pennant);
  crane.flag = pennant;
  return crane;
}
