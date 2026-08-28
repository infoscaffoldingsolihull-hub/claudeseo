/**
 * Picking, prompting and close inspection.
 *
 * Everything you can look at is registered here with a hotspot, the meshes to
 * raycast against, and the bill-of-quantities line that paid for it.  Each
 * frame the module:
 *
 *   1. filters the register down to the handful of things within reach —
 *      a distance test on a static hotspot, not a raycast,
 *   2. casts one ray from the centre of the screen at that handful,
 *   3. falls back to the nearest thing in front of you if the ray misses,
 *      because a door handle is a small target and being made to pixel-hunt
 *      for it is not an architectural experience.
 *
 * Inspection flies the camera to a framed pose, holds it while the card is
 * open, and flies back to exactly where you were standing. The card's cost is
 * read out of the same bill of quantities the dashboard totals, so a door's
 * price on screen and the project's budget can never disagree.
 */
import * as THREE from 'three';
import { BOQ_BY_ID, RATES, lineCost, formatPKR, formatPKRExact } from '../pm/rates.js';
import { PKG_BY_ID, CA_BY_ID } from '../pm/model.js';
import { ROOM_BY_ID } from './plan.js';
import { clamp } from '../engine/rng.js';

/** Reach, in metres, for the crosshair prompt. */
const REACH = 3.6;
const AIM_REACH = 4.6;

/** Everything the inspect card needs to know about a bill-of-quantities line. */
export function boqInfo(boqId) {
  const line = BOQ_BY_ID.get(boqId);
  if (!line) return null;
  const rate = RATES[line.rate];
  const total = lineCost(line);
  const pkg = PKG_BY_ID.get(line.pkg);
  const account = pkg ? CA_BY_ID.get(pkg.ca) : null;
  return {
    line,
    rate,
    total,
    unit: rate.unit,
    unitCost: rate.pkr,
    quantity: line.qty,
    // What one of these costs: a per-unit rate for a counted item, the whole
    // line for a lump sum or an area measured in bulk.
    each: rate.unit === 'each' ? rate.pkr : total / Math.max(1, line.qty),
    countable: rate.unit === 'each',
    pkg,
    account,
    note: rate.note,
    label: line.label,
  };
}

export function createInteraction(ctx) {
  const { camera, controls, world, input } = ctx;
  const register = [];
  const nearby = [];

  let aimed = null;
  let inspected = null;
  const listeners = { prompt: [], inspect: [] };

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const toItem = new THREE.Vector3();

  function emit(name, payload) {
    for (const fn of listeners[name]) fn(payload);
  }

  /**
   * Add interactables. Each must carry `hotspot` and `bounds`; `meshes` is
   * optional and only used to tell whether the thing is currently in the
   * world.
   */
  function add(items) {
    for (const item of items) {
      if (!item.bounds) item.bounds = boundsFromHotspot(item);
      register.push(item);
    }
  }

  /** A default box around an object, from its hotspot and stated size. */
  function boundsFromHotspot(item) {
    const d = item.dimensions || [0.8, 0.8, 0.8];
    const half = new THREE.Vector3(
      Math.max(0.12, d[0] / 2),
      Math.max(0.12, d[1] / 2),
      Math.max(0.12, (d[2] || d[0]) / 2),
    );
    return {
      min: item.hotspot.clone().sub(half),
      max: item.hotspot.clone().add(half),
    };
  }

  /** Is this item currently in the world at all? */
  function isLive(item) {
    if (item.installed === false) return false;
    const mesh = item.meshes && item.meshes[0];
    if (!mesh) return true;
    let node = mesh;
    while (node) {
      if (node.visible === false) return false;
      node = node.parent;
    }
    return true;
  }

  /**
   * Ray against an axis-aligned box, slab method.
   * Returns the entry distance, or −1 for a miss.
   */
  function rayBox(origin, dir, min, max, limit) {
    let tmin = 0;
    let tmax = limit;
    const axes = ['x', 'y', 'z'];
    for (let i = 0; i < 3; i += 1) {
      const a = axes[i];
      const inv = 1 / dir[a];
      let t1 = (min[a] - origin[a]) * inv;
      let t2 = (max[a] - origin[a]) * inv;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmax < tmin) return -1;
    }
    return tmin;
  }

  /**
   * Pick what the player is looking at.
   *
   * Interactables are picked by ray against their own bounding box rather than
   * against their triangles: it is exact enough for objects this size, it
   * needs no extra meshes in the scene — which is what lets a room's furniture
   * merge into two draw calls — and it costs a few dozen arithmetic operations
   * instead of a mesh traversal.
   */
  function pick() {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    nearby.length = 0;
    for (const item of register) {
      const d = camPos.distanceTo(item.hotspot);
      if (d > AIM_REACH + (item.reach || 0)) continue;
      if (!isLive(item)) continue;
      toItem.copy(item.hotspot).sub(camPos).normalize();
      // Only things roughly in front of the camera are candidates.
      if (toItem.dot(camDir) < 0.15) continue;
      nearby.push({ item, distance: d, facing: toItem.dot(camDir) });
    }
    if (!nearby.length) return null;

    // How far is the nearest wall? Anything behind it is not in view.
    const wallAt = world.collision
      ? world.collision.raycastDistance(camPos, camDir, AIM_REACH, null)
      : AIM_REACH;

    let best = null;
    for (const entry of nearby) {
      const item = entry.item;
      if (!item.bounds) continue;
      const t = rayBox(camPos, camDir, item.bounds.min, item.bounds.max, AIM_REACH);
      if (t < 0) continue;
      // A door is its own occluder; never let it hide itself.
      const clear = item.occluderTag
        ? world.collision.raycastDistance(camPos, camDir, AIM_REACH, item.occluderTag)
        : wallAt;
      if (t > clear + 0.25) continue;
      if (!best || t < best.t) best = { item, t };
    }
    if (best) return best.item;

    // Otherwise take the closest thing you are clearly facing, so a door
    // handle does not have to be pixel-hunted.
    let fallback = null;
    for (const entry of nearby) {
      if (entry.distance > REACH || entry.facing < 0.93) continue;
      const clear = entry.item.occluderTag
        ? world.collision.raycastDistance(camPos, camDir, AIM_REACH, entry.item.occluderTag)
        : wallAt;
      if (entry.distance > clear + 0.4) continue;
      if (!fallback || entry.distance < fallback.distance) fallback = entry;
    }
    return fallback ? fallback.item : null;
  }

  /** Frame an object for the inspection camera. */
  function focusPose(item) {
    const size = item.dimensions
      ? Math.max(item.dimensions[0], item.dimensions[1], item.dimensions[2] || 0)
      : 1.4;
    const distance = clamp(size * 1.35 + 0.75, 1.15, 4.4);
    const normal = item.normal ? item.normal.clone() : new THREE.Vector3(0, 0, 1);
    // Approach from whichever side the player is already on.
    camera.getWorldPosition(camPos);
    const toCamera = camPos.clone().sub(item.hotspot);
    if (normal.dot(toCamera) < 0) normal.negate();
    const position = item.hotspot.clone()
      .addScaledVector(normal, distance)
      .add(new THREE.Vector3(0, size * 0.14, 0));
    return { position, target: item.hotspot.clone() };
  }

  function inspect(item) {
    if (!item) return false;
    inspected = item;
    const pose = focusPose(item);
    controls.focusOn(pose.position, pose.target, 0.5);
    if (world.setHighlightPackage) world.setHighlightPackage(item.pkg || null);
    emit('inspect', describe(item));
    return true;
  }

  function release() {
    if (!inspected) return false;
    inspected = null;
    controls.releaseFocus(0.42);
    if (world.setHighlightPackage) world.setHighlightPackage(null);
    emit('inspect', null);
    return true;
  }

  /** Everything the card shows about one object. */
  function describe(item) {
    const info = item.boq ? boqInfo(item.boq) : null;
    const room = item.room ? ROOM_BY_ID.get(item.room) : null;
    const pkg = item.pkg ? PKG_BY_ID.get(item.pkg) : null;
    const account = pkg ? CA_BY_ID.get(pkg.ca) : null;
    const dims = item.dimensions;
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      room: room ? room.name : (item.roomName || null),
      material: item.material,
      dimensions: dims
        ? `${dims[0].toFixed(2)} × ${dims[1].toFixed(2)}${dims[2] ? ` × ${dims[2].toFixed(2)}` : ''} m`
        : null,
      note: item.note || (info ? info.note : ''),
      cost: info ? info.each : (item.costPKR || 0),
      costLabel: info
        ? (info.countable
          ? `${formatPKR(info.each)} each`
          : `${formatPKR(info.each)} per ${info.unit}`)
        : (item.costPKR ? formatPKR(item.costPKR) : 'Not separately measured'),
      costExact: info ? formatPKRExact(info.each) : formatPKRExact(item.costPKR || 0),
      boqLabel: info ? info.label : null,
      boqQuantity: info ? `${info.quantity} ${info.unit}` : null,
      boqTotal: info ? formatPKR(info.total) : null,
      rateNote: info ? info.note : null,
      pkg: pkg ? `${pkg.code} ${pkg.name}` : null,
      pkgId: item.pkg || null,
      account: account ? account.name : null,
      accountColour: account ? account.colour : '#d8b678',
      openable: typeof item.toggle === 'function',
      open: item.open !== undefined ? item.open > 0.5 : false,
      verb: item.verb || ['Open', 'Close'],
    };
  }

  let lastPromptId = null;

  function update() {
    if (inspected) {
      aimed = null;
      return;
    }
    aimed = pick();
    const id = aimed ? aimed.id : null;
    if (id !== lastPromptId) {
      lastPromptId = id;
      emit('prompt', aimed ? describe(aimed) : null);
    }
  }

  /** The primary action: operate what can be operated, inspect what cannot. */
  function activate() {
    if (inspected) {
      release();
      return true;
    }
    if (!aimed) return false;
    if (typeof aimed.toggle === 'function') {
      const opened = aimed.toggle();
      emit('prompt', describe(aimed));
      return opened;
    }
    return inspect(aimed);
  }

  /** The secondary action: always inspect. */
  function examine() {
    if (inspected) {
      release();
      return true;
    }
    return aimed ? inspect(aimed) : false;
  }

  return {
    add,
    update,
    activate,
    examine,
    inspect,
    release,
    describe,
    boqInfo,
    get aimed() { return aimed; },
    get inspecting() { return inspected; },
    get count() { return register.length; },
    get items() { return register; },
    byId(id) { return register.find((i) => i.id === id) || null; },
    on(name, fn) {
      if (listeners[name]) listeners[name].push(fn);
      return () => {
        const list = listeners[name];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
  };
}
