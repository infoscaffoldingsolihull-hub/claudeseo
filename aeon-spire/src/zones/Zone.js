/**
 * AEON SPIRE — zone base class.
 *
 * A zone owns one of the seven volumes described in Section C. Each zone
 * builds in three passes so the phased build plan in Section F maps
 * directly onto the code:
 *
 *   massing()   — Phase 2: correctly proportioned, correctly positioned volumes
 *   facade()    — Phase 3: structure, glazing and real materials
 *   interiors() — Phase 4: the named rooms of Section D
 *
 * Construction mode (Phase 9) drives `setBuildProgress`, which reveals the
 * zone in step with the 700-day programme.
 */

import * as THREE from 'three';

export class Zone {
  /**
   * @param {string} id
   * @param {string} name
   * @param {object} ctx shared build context { scene, materials, interiors, tier, ... }
   */
  constructor(id, name, ctx) {
    this.id = id;
    this.name = name;
    this.ctx = ctx;
    this.materials = ctx.materials;
    this.interiors = ctx.interiors;

    this.group = new THREE.Group();
    this.group.name = 'Zone:' + name;

    /** Exterior massing + facade — always visible. */
    this.shell = new THREE.Group();
    this.shell.name = id + ':shell';
    this.group.add(this.shell);

    /** Detail that only matters up close (Phase 3 fine members). */
    this.detail = new THREE.Group();
    this.detail.name = id + ':detail';
    this.group.add(this.detail);

    /** Interior rooms are parented here (Phase 4). */
    this.interiorGroup = new THREE.Group();
    this.interiorGroup.name = id + ':interiors';
    this.group.add(this.interiorGroup);

    /** Per-frame animated elements owned by the zone (not room props). */
    this.animators = [];
    /** Milestone index (1–10) at which this zone first appears. */
    this.appearsAtMilestone = 1;
    this.rooms = [];
    this.detailRange = ctx.tier ? ctx.tier.detailRange : 620;
  }

  /** Register a room with the shared InteriorManager and parent its group. */
  room(opts) {
    const { Room } = this.ctx.RoomClasses;
    const r = new Room({ zone: this.id, ...opts });
    this.interiorGroup.add(r.group);
    this.interiors.add(r);
    this.rooms.push(r);
    return r;
  }

  addAnimator(fn) { this.animators.push(fn); return fn; }

  /** Called every frame with (dt, elapsed, cameraPos). */
  update(dt, t, cameraPos) {
    for (let i = 0; i < this.animators.length; i++) this.animators[i](dt, t, cameraPos);
    if (this.detail.children.length) {
      const d = this.group.position.distanceTo(cameraPos);
      this.detail.visible = d < this.detailRange + this.radius;
    }
  }

  /** Rough radius used for detail-range tests; zones override this. */
  get radius() { return 120; }

  /** Phase 2 hook. */
  massing() {}
  /** Phase 3 hook. */
  facade() {}
  /** Phase 4 hook. */
  interiorsPass() {}

  build() {
    this.massing();
    this.facade();
    this.interiorsPass();
    return this;
  }

  /** Construction mode: 0 → not yet built, 1 → complete. */
  setBuildProgress(p) {
    const visible = p > 0.001;
    this.group.visible = visible;
  }
}
