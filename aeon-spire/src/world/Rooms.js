/**
 * AEON SPIRE — interior rooms, culling and acoustics.
 *
 * Implements the cross-cutting requirements in D.8:
 *   • distance / room-based culling — detail meshes only exist on the GPU's
 *     work list when the camera is inside or near their room, while a
 *     low-poly shell stays visible from afar;
 *   • per-room acoustic character, published to the audio system so it can
 *     swap convolver impulse responses (stone hall vs glass atrium vs
 *     padded lounge) rather than using one global reverb;
 *   • a registry of interactive / animated props so every interior can be
 *     checked against the "2–3 animated props" rule.
 */

import * as THREE from 'three';

/** Acoustic profiles referenced by AudioManager's convolver bank. */
export const ACOUSTIC = {
  STONE_VAULT: 'stoneVault',     // barrel-vaulted canal halls
  GLASS_ATRIUM: 'glassAtrium',   // tall glazed volumes
  PADDED_LOUNGE: 'paddedLounge', // carpeted offices, lounges
  MARBLE_HALL: 'marbleHall',     // sky lobbies, observatory
  MACHINE_ROOM: 'machineRoom',   // damper chambers, plant
  OPEN_AIR: 'openAir',           // exterior
  SHOW_HALL: 'showHall'          // pavilions, arcade
};

let ROOM_ID = 0;

export class Room {
  /**
   * @param {object} opts
   * @param {string} opts.name  the name used in Section D
   * @param {string} opts.zone  owning zone id
   * @param {number[]} opts.center [x,y,z]
   * @param {number[]} opts.size   [w,h,d] of the room's bounding volume
   * @param {string} opts.acoustic one of ACOUSTIC
   * @param {number} opts.range    distance at which detail is built/shown
   */
  constructor({ name, zone, center, size, acoustic = ACOUSTIC.GLASS_ATRIUM, range = 150, level = '' }) {
    this.id = ++ROOM_ID;
    this.name = name;
    this.zone = zone;
    this.level = level;
    this.acoustic = acoustic;
    this.range = range;
    this.center = new THREE.Vector3(center[0], center[1], center[2]);
    this.size = new THREE.Vector3(size[0], size[1], size[2]);
    this.box = new THREE.Box3().setFromCenterAndSize(this.center, this.size);
    /** Detail geometry, shown only when the camera is near. */
    this.group = new THREE.Group();
    this.group.name = 'Room:' + name;
    this.group.visible = false;
    /** Lights belonging to this room, disabled while it is culled. */
    this.lights = [];
    /** Animated / interactive props: { name, update(dt, t), toggle?() }. */
    this.props = [];
    this.visible = false;
    this.occupied = false;
    /** Optional deferred builder, run the first time the room is approached. */
    this._builder = null;
    this._built = true;
  }

  /** Defer the room's contents until the camera first comes within range. */
  lazy(builder) {
    this._builder = builder;
    this._built = false;
    return this;
  }

  addProp(prop) { this.props.push(prop); return prop; }

  /** Distance from a point to this room's bounding box (0 when inside). */
  distanceTo(p) {
    return Math.sqrt(this.box.distanceToPoint(p) ** 2);
  }

  contains(p) { return this.box.containsPoint(p); }

  setVisible(v) {
    if (this.visible === v) return;
    this.visible = v;
    this.group.visible = v;
    for (const l of this.lights) l.visible = v;
  }

  update(dt, t) {
    if (!this.visible) return;
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (p.update) p.update(dt, t);
    }
  }
}

/**
 * Owns every Room in the project and decides, each frame, which are close
 * enough to be worth drawing. Also reports the room the camera currently
 * occupies so the HUD can name it and the audio system can pick a reverb.
 */
export class InteriorManager {
  constructor({ range = 190 } = {}) {
    this.rooms = [];
    this.range = range;
    this.current = null;
    this.previous = null;
    this._acc = 0;
    this._interval = 0.12;    // re-evaluate ~8× a second, not every frame
    this.visibleCount = 0;
    this.onRoomChange = null;
  }

  add(room) { this.rooms.push(room); return room; }

  byName(name) { return this.rooms.find(r => r.name === name); }
  byZone(zone) { return this.rooms.filter(r => r.zone === zone); }

  /**
   * Force every room built and visible, and keep them that way — used by
   * the QA walkthrough, which must exercise interiors the camera never
   * approaches. Without the latch, the next distance evaluation would
   * simply hide them again.
   */
  revealAll(latch = true) {
    this.forceAll = latch;
    for (const r of this.rooms) { this._ensureBuilt(r); r.setVisible(true); }
    this.visibleCount = this.rooms.length;
    return this.rooms.length;
  }

  /** Release the QA latch and return to normal distance-based culling. */
  releaseAll() { this.forceAll = false; }

  _ensureBuilt(room) {
    if (room._built) return;
    room._built = true;
    try {
      room._builder(room);
    } catch (err) {
      console.error('Failed to build room', room.name, err);
    }
    room._builder = null;
  }

  update(dt, cameraPos) {
    // Props animate every frame for rooms that are already visible…
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (r.visible) r.update(dt, 0);
    }

    // …but visibility is re-evaluated on a slower cadence.
    this._acc += dt;
    if (this._acc < this._interval) return;
    this._acc = 0;

    if (this.forceAll) {
      // Still track which room the camera occupies, but leave all visible.
      let occ = null;
      for (const r of this.rooms) { r.occupied = r.contains(cameraPos); if (r.occupied) occ = r; }
      if (occ !== this.current) {
        this.previous = this.current; this.current = occ;
        if (this.onRoomChange) this.onRoomChange(occ, this.previous);
      }
      return;
    }

    let occupied = null;
    let bestD = Infinity;
    this.visibleCount = 0;

    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      const d = r.distanceTo(cameraPos);
      const limit = Math.min(r.range, this.range);
      const want = d < limit;
      if (want) this._ensureBuilt(r);
      r.setVisible(want);
      if (want) this.visibleCount++;
      r.occupied = r.contains(cameraPos);
      if (r.occupied && d <= bestD) { bestD = d; occupied = r; }
    }

    if (occupied !== this.current) {
      this.previous = this.current;
      this.current = occupied;
      if (this.onRoomChange) this.onRoomChange(occupied, this.previous);
    }
  }

  /** Every named interior space, for the QA report and the HUD index. */
  manifest() {
    return this.rooms.map(r => ({
      zone: r.zone, name: r.name, level: r.level, acoustic: r.acoustic,
      props: r.props.length, built: r._built
    }));
  }
}
