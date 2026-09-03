/**
 * AEON SPIRE — site plant and vehicles (E.7).
 *
 * Excavators, pile rigs, mixer and pump trucks, glazing lorries and
 * cherry-pickers. Each builder returns a group and an `update` that drives
 * its own articulation — a boom that digs, a drum that turns, a mast that
 * hammers — plus a path follower so vehicles actually traverse the site
 * rather than idling in place.
 */

import * as THREE from 'three';
import {
  mergeGeometries, xform, box, cyl, mesh, instance, member, tube
} from '../world/BuildKit.js';
import { TAU, lerp, clamp, rng, smoothstep } from '../core/MathUtil.js';

/** Shared chassis parts: a wheeled truck body. */
function truckChassis(cabColour) {
  return {
    body: mergeGeometries([
      box(2.6, 1.1, 8.4, [0, 1.35, 0]),            // chassis rail
      box(2.7, 2.4, 2.6, [0, 2.4, 3.0]),           // cab
      box(2.5, 0.9, 0.4, [0, 1.1, -4.3])           // rear bumper
    ]),
    glass: box(2.4, 1.0, 0.12, [0, 3.0, 4.28]),
    wheels: (() => {
      const w = [];
      for (const sx of [-1, 1]) {
        for (const z of [2.6, -1.6, -3.0]) {
          w.push(cyl(0.85, 0.85, 0.55, 12, [sx * 1.35, 0.85, z], [0, 0, Math.PI / 2]));
        }
      }
      return mergeGeometries(w);
    })()
  };
}

/** Tracked undercarriage, for excavators and pile rigs. */
function trackedBase() {
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(box(1.3, 1.0, 5.2, [sx * 1.5, 0.6, 0]));
    for (let i = 0; i < 5; i++) parts.push(cyl(0.5, 0.5, 1.35, 10, [sx * 1.5, 0.6, -2.0 + i * 1.0], [0, 0, Math.PI / 2]));
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ */

/** A tracked excavator with a working boom, dipper and bucket. */
export function excavator(materials, { x = 0, z = 0, rot = 0, seed = 1 } = {}) {
  const paint = materials.solid('plantYellow', {
    color: 0xe0a92c, roughness: 0.55, metalness: 0.35, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });
  const glass = materials.glass('plantGlass', {
    color: 0x243244, opacity: 0.5, roughness: 0.1, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'Excavator';
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(mesh(trackedBase(), dark, { name: 'Tracks', cast: true, receive: true }));

  const slew = new THREE.Group();
  slew.position.y = 1.2;
  group.add(slew);
  slew.add(mesh(mergeGeometries([
    box(2.6, 1.5, 4.2, [0, 0.75, -0.4]),
    box(1.5, 1.8, 1.6, [-0.7, 1.6, 1.0]),
    box(1.4, 0.9, 1.2, [0, 0.9, -2.4])
  ]), paint, { name: 'House', cast: true }));
  slew.add(mesh(box(1.3, 1.2, 0.1, [-0.7, 1.7, 1.78]), glass, { name: 'Cab glass' }));

  const boom = new THREE.Group();
  boom.position.set(0.75, 1.0, 1.4);
  slew.add(boom);
  boom.add(mesh(box(0.7, 0.75, 5.2, [0, 0, 2.4]), paint, { name: 'Boom', cast: true }));

  const dipper = new THREE.Group();
  dipper.position.set(0, 0, 4.9);
  boom.add(dipper);
  dipper.add(mesh(box(0.55, 0.6, 3.4, [0, 0, 1.6]), paint, { name: 'Dipper', cast: true }));

  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 3.2);
  dipper.add(bucket);
  bucket.add(mesh(mergeGeometries([
    box(1.5, 1.1, 0.25, [0, -0.35, 0.5]),
    box(1.5, 0.25, 1.2, [0, -0.85, 1.0]),
    box(0.2, 1.1, 1.2, [-0.7, -0.35, 1.0]),
    box(0.2, 1.1, 1.2, [0.7, -0.35, 1.0])
  ]), dark, { name: 'Bucket', cast: true }));

  const r = rng(seed);
  let cy = r() * 12;
  const ph = r() * TAU;

  return {
    group,
    update(dt, t, activity = 1) {
      cy += dt * activity;
      // A dig cycle: swing, reach, curl, lift, swing back, dump.
      const c = (cy * 0.28 + ph) % TAU;
      const swing = Math.sin(c) * 1.15;
      const reach = 0.5 + 0.5 * Math.sin(c * 2 + 0.6);
      slew.rotation.y = swing;
      boom.rotation.x = lerp(-0.55, 0.15, reach);
      dipper.rotation.x = lerp(0.95, -0.15, reach);
      bucket.rotation.x = lerp(-1.5, 0.5, Math.max(0, Math.sin(c * 2 + 1.4)));
      group.visible = activity > 0.02;
    }
  };
}

/** A pile-driving rig: a tracked base, a tall leader and a hammer that drops. */
export function pileRig(materials, { x = 0, z = 0, rot = 0, seed = 2 } = {}) {
  const paint = materials.solid('plantOrange', {
    color: 0xd2622a, roughness: 0.55, metalness: 0.35, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'PileRig';
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(mesh(trackedBase(), dark, { name: 'Tracks', cast: true, receive: true }));
  group.add(mesh(mergeGeometries([
    box(3.0, 2.0, 4.4, [0, 2.2, -0.8]),
    box(1.6, 1.7, 1.6, [-0.8, 3.2, 1.2])
  ]), paint, { name: 'House', cast: true }));

  /* The leader: a tall lattice mast the hammer runs up and down. */
  const leaderH = 22;
  const leader = [];
  for (const sx of [-0.45, 0.45]) {
    for (const sz of [-0.45, 0.45]) leader.push(cyl(0.08, 0.08, leaderH, 6, [sx, leaderH / 2, sz]));
  }
  for (let i = 0; i <= 14; i++) {
    const y = (i / 14) * leaderH;
    leader.push(box(1.0, 0.08, 0.08, [0, y, -0.45]));
    leader.push(box(1.0, 0.08, 0.08, [0, y, 0.45]));
    leader.push(box(0.08, 0.08, 1.0, [-0.45, y, 0]));
  }
  const leaderGroup = new THREE.Group();
  leaderGroup.position.set(0, 1.2, 3.2);
  group.add(leaderGroup);
  leaderGroup.add(mesh(mergeGeometries(leader), paint, { name: 'Leader', cast: true }));
  leaderGroup.add(mesh(tube([0, 2, 0], [0, leaderH, -2.6], 0.09, 5), dark, { name: 'Backstay' }));

  const hammer = mesh(box(1.3, 2.2, 1.3, [0, 0, 0]), dark, { name: 'Hammer', cast: true });
  hammer.position.y = leaderH * 0.75;
  leaderGroup.add(hammer);

  /* The pile itself, driven progressively into the ground. */
  const pile = mesh(cyl(0.42, 0.42, 14, 10, [0, 0, 0]), dark, { name: 'Pile', cast: true });
  pile.position.y = 6;
  leaderGroup.add(pile);

  const r = rng(seed);
  let cy = r() * 8;
  /** Fires on each hammer blow, so the audio layer can strike with it. */
  let onBlow = null;
  let lastPhase = 0;

  return {
    group,
    set onBlow(fn) { onBlow = fn; },
    update(dt, t, activity = 1) {
      cy += dt * activity;
      const beat = (cy * 1.15) % 1;
      // Slow lift, fast drop — the characteristic rhythm of a drop hammer.
      const h = beat < 0.72 ? smoothstep(beat / 0.72) : 1 - ((beat - 0.72) / 0.28) ** 0.6;
      hammer.position.y = lerp(3.2, leaderH * 0.82, h);
      if (lastPhase > beat && onBlow) onBlow();
      lastPhase = beat;
      // Each cycle drives the pile a little further down, then resets.
      const set = ((cy * 0.06) % 1);
      pile.position.y = lerp(7.5, 1.2, set);
      group.visible = activity > 0.02;
    }
  };
}

/** A concrete mixer truck with a turning drum. */
export function mixerTruck(materials, { seed = 3 } = {}) {
  const paint = materials.solid('mixerWhite', {
    color: 0xdcdcd6, roughness: 0.5, metalness: 0.2, exterior: true, noClip: true
  });
  const drumMat = materials.solid('mixerDrum', {
    color: 0xb9482f, roughness: 0.6, metalness: 0.3, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });
  const glass = materials.glass('plantGlass', {
    color: 0x243244, opacity: 0.5, roughness: 0.1, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'MixerTruck';
  const ch = truckChassis();
  group.add(mesh(ch.body, paint, { name: 'Chassis', cast: true }));
  group.add(mesh(ch.glass, glass, { name: 'Windscreen' }));
  group.add(mesh(ch.wheels, dark, { name: 'Wheels', cast: true }));

  const drum = new THREE.Group();
  drum.position.set(0, 3.0, -1.4);
  drum.rotation.z = 0.32;
  group.add(drum);
  drum.add(mesh(mergeGeometries([
    cyl(1.25, 1.55, 3.0, 16, [0, 0, 0], [Math.PI / 2, 0, 0]),
    cyl(0.8, 1.25, 1.4, 16, [0, 0, 1.9], [Math.PI / 2, 0, 0]),
    cyl(1.55, 0.9, 1.6, 16, [0, 0, -2.0], [Math.PI / 2, 0, 0])
  ]), drumMat, { name: 'Drum', cast: true }));
  // Chute.
  group.add(mesh(box(0.8, 0.16, 2.6, [0, 1.9, -4.6], [0.35, 0, 0]), dark, { name: 'Chute' }));

  const r = rng(seed);
  return {
    group,
    update(dt, t, activity = 1) {
      drum.rotation.y += dt * 1.6 * (0.4 + activity);
      group.visible = activity > 0.02;
    }
  };
}

/** A concrete pump truck with a folding placing boom. */
export function pumpTruck(materials, { seed = 4 } = {}) {
  const paint = materials.solid('pumpBlue', {
    color: 0x2f5fa8, roughness: 0.5, metalness: 0.3, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'PumpTruck';
  const ch = truckChassis();
  group.add(mesh(ch.body, paint, { name: 'Chassis', cast: true }));
  group.add(mesh(ch.wheels, dark, { name: 'Wheels', cast: true }));
  // Outriggers.
  const rig = [];
  for (const sx of [-1, 1]) for (const z of [2.4, -3.0]) {
    rig.push(box(0.4, 0.4, 3.4, [sx * 2.4, 0.9, z], [0, Math.PI / 2, 0]));
    rig.push(cyl(0.4, 0.5, 0.9, 8, [sx * 3.6, 0.45, z]));
  }
  group.add(mesh(mergeGeometries(rig), dark, { name: 'Outriggers', cast: true }));

  /* A three-section folding boom. */
  const s1 = new THREE.Group(); s1.position.set(0, 2.9, 1.4); group.add(s1);
  s1.add(mesh(box(0.6, 0.6, 8.0, [0, 0, 4.0]), paint, { name: 'Boom1', cast: true }));
  const s2 = new THREE.Group(); s2.position.set(0, 0, 8.0); s1.add(s2);
  s2.add(mesh(box(0.5, 0.5, 7.0, [0, 0, 3.5]), paint, { name: 'Boom2', cast: true }));
  const s3 = new THREE.Group(); s3.position.set(0, 0, 7.0); s2.add(s3);
  s3.add(mesh(box(0.4, 0.4, 5.5, [0, 0, 2.75]), paint, { name: 'Boom3', cast: true }));
  s3.add(mesh(cyl(0.16, 0.16, 3.2, 8, [0, -1.6, 5.4]), dark, { name: 'PlacingHose' }));

  const r = rng(seed);
  let cy = r() * 10;
  return {
    group, tip: s3,
    update(dt, t, activity = 1) {
      cy += dt * activity;
      s1.rotation.x = -0.9 + Math.sin(cy * 0.19) * 0.22;
      s2.rotation.x = 1.15 + Math.sin(cy * 0.23 + 1.1) * 0.3;
      s3.rotation.x = 0.55 + Math.sin(cy * 0.31 + 2.2) * 0.35;
      group.rotation.y = Math.sin(cy * 0.11) * 0.5;
      group.visible = activity > 0.02;
    }
  };
}

/** A flatbed lorry carrying glazing units or steel. */
export function flatbedTruck(materials, { cargo = 'glass', seed = 5 } = {}) {
  const paint = materials.solid('flatbedGreen', {
    color: 0x3d6b4a, roughness: 0.5, metalness: 0.25, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });
  const glass = materials.glass('cargoGlass', {
    color: 0xa8cfe0, opacity: 0.45, roughness: 0.08, exterior: true, noClip: true
  });
  const steel = materials.solid('cargoSteel', {
    color: 0x8d949c, roughness: 0.45, metalness: 0.7, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'FlatbedTruck';
  const ch = truckChassis();
  group.add(mesh(ch.body, paint, { name: 'Chassis', cast: true }));
  group.add(mesh(ch.wheels, dark, { name: 'Wheels', cast: true }));
  group.add(mesh(box(2.5, 0.16, 6.4, [0, 1.95, -1.4]), dark, { name: 'Deck' }));

  if (cargo === 'glass') {
    // Glazing units travel in A-frame stillages, leaning inward.
    const st = [];
    for (let i = 0; i < 4; i++) {
      st.push(box(0.12, 2.6, 1.6, [0, 3.2, -3.6 + i * 1.7]));
    }
    group.add(mesh(mergeGeometries(st), dark, { name: 'Stillages', cast: true }));
    const panes = [];
    for (let i = 0; i < 4; i++) {
      for (const sx of [-1, 1]) {
        panes.push(box(0.1, 2.4, 1.4, [sx * 0.35, 3.2, -3.6 + i * 1.7], [0, 0, sx * 0.12]));
      }
    }
    group.add(mesh(mergeGeometries(panes), glass, { name: 'GlazingUnits', cast: true }));
  } else {
    const secs = [];
    for (let i = 0; i < 5; i++) secs.push(box(0.45, 0.45, 6.0, [-0.9 + i * 0.45, 2.3, -1.4]));
    for (let i = 0; i < 4; i++) secs.push(box(0.45, 0.45, 6.0, [-0.7 + i * 0.45, 2.75, -1.4]));
    group.add(mesh(mergeGeometries(secs), steel, { name: 'SteelSections', cast: true }));
  }

  return {
    group,
    update(dt, t, activity = 1) { group.visible = activity > 0.02; }
  };
}

/** A cherry-picker with a telescoping boom and a basket. */
export function cherryPicker(materials, { x = 0, z = 0, rot = 0, seed = 6, reach = 26 } = {}) {
  const paint = materials.solid('picker', {
    color: 0xdad13a, roughness: 0.5, metalness: 0.3, exterior: true, noClip: true
  });
  const dark = materials.solid('plantDark', {
    color: 0x2b2e33, roughness: 0.55, metalness: 0.5, exterior: true, noClip: true
  });

  const group = new THREE.Group();
  group.name = 'CherryPicker';
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(mesh(mergeGeometries([
    box(2.4, 0.9, 5.0, [0, 0.75, 0]),
    box(2.6, 0.4, 5.4, [0, 0.3, 0])
  ]), dark, { name: 'Chassis', cast: true, receive: true }));
  for (const sx of [-1, 1]) for (const z0 of [1.8, -1.8]) {
    group.add(mesh(cyl(0.55, 0.55, 0.45, 10, [sx * 1.25, 0.55, z0], [0, 0, Math.PI / 2]), dark, {
      name: 'Wheel'
    }));
  }

  const slew = new THREE.Group();
  slew.position.y = 1.25;
  group.add(slew);
  slew.add(mesh(box(1.8, 0.8, 2.2, [0, 0.4, 0]), paint, { name: 'Turret', cast: true }));

  const boom = new THREE.Group();
  boom.position.set(0, 0.9, 0);
  slew.add(boom);
  const sec1 = mesh(box(0.6, 0.6, 9, [0, 0, 4.5]), paint, { name: 'BoomSection1', cast: true });
  const sec2 = mesh(box(0.45, 0.45, 9, [0, 0, 4.5]), paint, { name: 'BoomSection2', cast: true });
  const tele = new THREE.Group();
  tele.position.z = 8.4;
  boom.add(sec1, tele);
  tele.add(sec2);

  const basket = new THREE.Group();
  basket.position.z = 8.6;
  tele.add(basket);
  basket.add(mesh(mergeGeometries([
    box(1.5, 0.1, 1.0, [0, -0.5, 0]),
    box(1.5, 1.0, 0.08, [0, 0, 0.5]),
    box(1.5, 1.0, 0.08, [0, 0, -0.5]),
    box(0.08, 1.0, 1.0, [0.75, 0, 0]),
    box(0.08, 1.0, 1.0, [-0.75, 0, 0])
  ]), paint, { name: 'Basket', cast: true }));

  const r = rng(seed);
  let cy = r() * 14;
  return {
    group, basket,
    update(dt, t, activity = 1) {
      cy += dt * activity;
      slew.rotation.y = Math.sin(cy * 0.14) * 1.3;
      boom.rotation.x = -lerp(0.35, 1.15, 0.5 + 0.5 * Math.sin(cy * 0.17));
      tele.position.z = lerp(8.4, reach * 0.62, 0.5 + 0.5 * Math.sin(cy * 0.21 + 1.4));
      // Keep the basket level, as a real levelling linkage does.
      basket.rotation.x = -boom.rotation.x;
      group.visible = activity > 0.02;
    }
  };
}

/**
 * Drive a vehicle group along a closed loop of waypoints, facing the way
 * it is going. Used for the haul road traffic across the site.
 */
export function pathFollower(group, waypoints, { speed = 7, offset = 0 } = {}) {
  const pts = waypoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const legs = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = a.distanceTo(b);
    legs.push({ a, b, len, start: total });
    total += len;
  }
  let s = offset * total;
  const tmp = new THREE.Vector3();
  return {
    update(dt, activity = 1) {
      s = (s + speed * dt * clamp(activity, 0, 1.4)) % total;
      let leg = legs[0];
      for (const l of legs) if (s >= l.start) leg = l;
      const u = (s - leg.start) / Math.max(leg.len, 0.001);
      group.position.lerpVectors(leg.a, leg.b, u);
      tmp.subVectors(leg.b, leg.a);
      group.rotation.y = Math.atan2(tmp.x, tmp.z);
    },
    get progress() { return s / total; }
  };
}
