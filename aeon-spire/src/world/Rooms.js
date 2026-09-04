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
    /** Optional deferred builder, run once by the interior streamer. */
    this._builder = null;
    this._built = true;
    /** Streaming state: textures uploaded, shaders compiled, safe to show. */
    this._texDone = false;
    this._ready = true;
  }

  /** Defer the room's contents until the camera first comes within range. */
  lazy(builder) {
    this._builder = builder;
    this._built = false;
    this._ready = false;
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
    /* The room's own lights are authoring data, not renderables — the
       LightPool copies them into the slots the renderer actually sees. They
       stay invisible so they never enter the light gather and never move the
       shader cache key. */
    for (const l of this.lights) l.visible = false;
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
 * A fixed pool of interior lights.
 *
 * This exists because of how three.js keys shader programs. The cache key
 * includes the number of point lights, spot lights and shadow-casting lights
 * gathered from the scene — so the moment a room's lights become visible, the
 * signature changes and *every material currently on screen* needs a new
 * program. Walking into a room was therefore linking twenty-odd shaders in
 * the frame it happened, which is where the multi-second freezes came from:
 * not from the room's own geometry, but from the light count moving.
 *
 * So room lights are never rendered. They stay in the room's group as the
 * authoring representation — positioned by the scene graph, animated by the
 * room's props — but permanently invisible, which keeps them out of the
 * gather. Each frame the nearest few are copied into this pool, whose lights
 * are always present and always visible. Unused slots sit at zero intensity.
 * The signature is then constant for the life of the page and nothing is ever
 * recompiled.
 */
export class LightPool {
  constructor(scene, { points = 8, spots = 4 } = {}) {
    this.scene = scene;
    this.points = [];
    this.spots = [];
    for (let i = 0; i < points; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 2);
      l.name = 'PoolPoint' + i;
      l.castShadow = false;
      scene.add(l);
      this.points.push(l);
    }
    for (let i = 0; i < spots; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 40, 0.5, 0.5, 2);
      l.name = 'PoolSpot' + i;
      l.castShadow = false;
      scene.add(l, l.target);
      this.spots.push(l);
    }
    this._p = new THREE.Vector3();
  }

  /**
   * Copy the highest-priority room lights into the pool.
   * @param {Array} defs candidate lights, already ordered by priority
   */
  apply(defs) {
    let pi = 0, si = 0;
    for (let i = 0; i < defs.length; i++) {
      const src = defs[i];
      if (src.isSpotLight) {
        if (si >= this.spots.length) continue;
        const dst = this.spots[si++];
        src.getWorldPosition(dst.position);
        src.target.getWorldPosition(dst.target.position);
        dst.color.copy(src.color);
        dst.intensity = src.intensity;
        dst.distance = src.distance;
        dst.decay = src.decay;
        dst.angle = src.angle;
        dst.penumbra = src.penumbra;
      } else {
        if (pi >= this.points.length) continue;
        const dst = this.points[pi++];
        src.getWorldPosition(dst.position);
        dst.color.copy(src.color);
        dst.intensity = src.intensity;
        dst.distance = src.distance;
        dst.decay = src.decay;
      }
    }
    for (; pi < this.points.length; pi++) this.points[pi].intensity = 0;
    for (; si < this.spots.length; si++) this.spots[si].intensity = 0;
  }
}

/** Material slots that hold a texture, for the upload warm-up pass. */
const TEX_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap',
  'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap'
];

/** Meshes whose programs are compiled per streaming step. */
const COMPILE_BATCH = 1;
/** A streaming step longer than this earns the streamer a rest. */
const STEP_BUDGET_MS = 120;
/** How long to stand down after an over-budget step. */
const COOLDOWN_S = 0.75;

/**
 * Owns every Room in the project and decides, each frame, which are close
 * enough to be worth drawing. Also reports the room the camera currently
 * occupies so the HUD can name it and the audio system can pick a reverb.
 *
 * ## Why this streams
 *
 * The first version built a room's contents the moment the camera came
 * within range, synchronously, inside the frame that crossed the threshold —
 * and it could do that for several rooms in the same tick. Building the
 * geometry is the cheap half (a few hundred ms across all 31 rooms); the
 * expensive half is what happens on the *first render* of the result, when
 * the driver compiles a shader program for every new material and uploads
 * every new texture. Measured while flying into the Canal Concourse, that
 * produced single frames of 27, 19, 16 and 12 seconds. A browser calls that
 * an unresponsive page and may kill the WebGL context, which is exactly the
 * "hangs and crashes near buildings" this replaces.
 *
 * So nothing is ever built on demand. Every room is streamed in over the
 * frames after load, nearest first, and each one goes through four stages —
 * build, upload its textures, compile its shaders (asynchronously, off the
 * critical path), then become eligible to show. At most one step runs per
 * frame, and none runs on a frame that was already slow. A room is only
 * made visible once it is fully warm, so no frame ever pays a compile.
 */
export class InteriorManager {
  constructor({ range = 190 } = {}) {
    this.rooms = [];
    this.range = range;
    this.current = null;
    this.previous = null;
    this._acc = 0;
    this._interval = 0.12;    // re-evaluate ~8x a second, not every frame
    this.visibleCount = 0;
    this.onRoomChange = null;

    /* Streaming. `_pending` is the work list, kept in nearest-first order. */
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.postfx = null;
    this.pool = null;
    this._lit = [];
    this._pending = [];
    this._compiling = 0;
    this._cooldown = 0;
    this._starved = 0;
    this._sortAcc = 0;
    this.readyCount = 0;
    /** Rooms stay visible out to this multiple of their show range, so a
        camera hovering on the threshold does not flicker them. */
    this.hysteresis = 1.25;
  }

  add(room) { this.rooms.push(room); return room; }

  byName(name) { return this.rooms.find(r => r.name === name); }
  byZone(zone) { return this.rooms.filter(r => r.zone === zone); }

  /**
   * Hand the streamer what it needs to warm shaders and textures. Without
   * this it still works — it just falls back to marking rooms ready as soon
   * as they are built, which is the old, hitching behaviour.
   */
  attach(renderer, scene, camera, postfx = null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.postfx = postfx;
    if (!this.pool) this.pool = new LightPool(scene);
    /* Where KHR_parallel_shader_compile is missing, the driver links a
       program lazily and does the real work the first time it is drawn with
       — so compileAsync alone leaves the stall exactly where it was. Those
       drivers get an extra stage: a one-pixel render that forces the
       compile at a moment we are budgeting for. */
    try {
      const gl = renderer.getContext();
      this.deferredCompile = !gl.getExtension('KHR_parallel_shader_compile');
    } catch (err) {
      this.deferredCompile = true;
    }
    this._pending = this.rooms.filter(r => !r._ready);
    return this;
  }

  /**
   * Force every room built, warm and visible, and keep them that way — used
   * by the QA walkthrough, which must exercise interiors the camera never
   * approaches. Without the latch, the next distance evaluation would simply
   * hide them again.
   */
  revealAll(latch = true) {
    this.forceAll = latch;
    for (const r of this.rooms) {
      this._ensureBuilt(r);
      this._uploadTextures(r, Infinity);
      r._ready = true;
      r.setVisible(true);
    }
    this._pending.length = 0;
    this.visibleCount = this.rooms.length;
    this.readyCount = this.rooms.length;
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

    /* Interior furniture is taken out of the sun's shadow map.
     *
     * The room lights are point and spot lights that do not cast, so the
     * only thing an interior mesh's castShadow feeds is the directional
     * sun — which is a 340 m frustum aimed at the ground outside, where a
     * chair on level 42 contributes nothing anyone can see. It costs
     * plenty, though: a shadow-map draw every frame, and, because
     * renderer.compile() warms the colour pass but not the depth pass, a
     * depth-program link in the frame the room is first drawn. That link
     * was a 22-second frame on its own. */
    room.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });

    /* And take the room's own lights out of the renderer's gather for good.
       setVisible() does this too, but only when visibility actually changes,
       so doing it once at build time closes the gap for any path that shows
       a room without going through a transition. */
    for (const l of room.lights) l.visible = false;
  }

  /**
   * Push this room's textures to the GPU. Returns the number uploaded, so
   * the caller can stop after a budget: mipmap generation for a 512px set is
   * cheap individually and painful a dozen at a time. Three a frame keeps
   * the step under a millisecond on hardware and bounded even without it.
   */
  _uploadTextures(room, budget = 3) {
    const r = this.renderer;
    if (!r || !r.initTexture) { room._texDone = true; return 0; }
    const seen = room._texSeen || (room._texSeen = new Set());
    let n = 0;
    let done = true;
    room.group.traverse((o) => {
      if (n >= budget) { done = false; return; }
      const mat = o.material;
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      for (const m of list) {
        for (const k of TEX_SLOTS) {
          const t = m[k];
          if (!t || !t.isTexture || seen.has(t)) continue;
          seen.add(t);
          try { r.initTexture(t); } catch (e) { /* driver said no; the draw will retry */ }
          if (++n >= budget) { done = false; return; }
        }
      }
    });
    if (done) room._texDone = true;
    return n;
  }

  /**
   * Collect the room's drawable meshes once, so the compile stage can work
   * through them a few at a time instead of all at once.
   */
  _meshesOf(room) {
    if (room._meshes) return room._meshes;
    const out = [];
    room.group.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) out.push(o);
    });
    room._meshes = out;
    room._meshCursor = 0;
    return out;
  }

  /**
   * Compile the shader programs for the next few of the room's meshes.
   *
   * `compileAsync` only behaves asynchronously where the driver supports
   * `KHR_parallel_shader_compile`; everywhere else `compile()` links the
   * programs on the calling thread and the promise merely reports when they
   * are usable. Handing it a whole room therefore still risked a
   * multi-second frame on the machines that need help most. So it gets a
   * proxy holding a handful of the room's meshes at a time — the cost per
   * frame is bounded by the batch size, not by how much furniture the room
   * happens to have.
   *
   * The proxy is never rendered and never parented, so borrowing the meshes
   * for the duration of the call does not disturb the scene graph.
   */
  _compileBatch(room) {
    const meshes = this._meshesOf(room);
    const r = this.renderer;
    if (!r || !r.compileAsync || !this.scene || !this.camera || !meshes.length) {
      return this._markReady(room);
    }
    const from = room._meshCursor;
    if (from >= meshes.length) {
      return this.deferredCompile ? this._warmDraw(room) : this._markReady(room);
    }

    const proxy = this._proxy || (this._proxy = new THREE.Object3D());
    proxy.children = meshes.slice(from, from + COMPILE_BATCH);
    room._meshCursor = from + proxy.children.length;

    this._compiling++;
    const done = () => {
      this._compiling--;
      proxy.children = [];
    };
    let p;
    try {
      /* Compile in the scene pass's renderer state, or the warmed programs
         are variants the real render will never use. */
      p = this.postfx
        ? this.postfx.scenePassState(() => r.compileAsync(proxy, this.camera, this.scene))
        : r.compileAsync(proxy, this.camera, this.scene);
    } catch (err) {
      done();
      return this._markReady(room);
    }
    p.then(done, done);
    return false;
  }

  /**
   * Draw the room once into a single pixel, so a driver that defers its
   * shader compilation to first use does that work now — on a frame the
   * streamer is pacing — rather than in the frame the room appears.
   */
  _warmDraw(room) {
    const r = this.renderer;
    if (!r || !this.scene || !this.camera) return this._markReady(room);
    if (!this._warmRT) {
      this._warmRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    }
    const wasVisible = room.group.visible;
    const prevRT = r.getRenderTarget();
    room.group.visible = true;
    const draw = () => {
      r.setRenderTarget(this._warmRT);
      r.render(this.scene, this.camera);
    };
    try {
      if (this.postfx) this.postfx.scenePassState(draw); else draw();
    } catch (err) {
      // A driver refusing the warm draw is not fatal; the room still shows.
    } finally {
      room.group.visible = wasVisible;
      r.setRenderTarget(prevRT);
      r.info.reset();
    }
    return this._markReady(room);
  }

  _markReady(room) {
    room._ready = true;
    room._meshes = null;
    const i = this._pending.indexOf(room);
    if (i >= 0) this._pending.splice(i, 1);
    this.readyCount++;
    return true;
  }

  /**
   * One step of streaming work, at most. Called every frame; does nothing on
   * a frame that already ran long, so the streamer can never be the reason a
   * hitch becomes a stall.
   */
  _pump(dt) {
    if (this.forceAll || this._compiling > 0) return;
    /* Skip frames that already ran long — but not forever. On a machine
       that never reaches 20 fps the streamer would otherwise stall
       permanently and no interior would ever appear, so a stalled queue
       forces a step through every couple of seconds regardless. */
    this._starved = dt > 0.05 ? this._starved + dt : 0;
    if (dt > 0.05 && this._starved < 2.0) return;
    if (this._starved >= 2.0) this._starved = 0;
    /* Back off after an expensive step. Program linking costs wildly
       different amounts on different drivers — tens of milliseconds on a
       discrete GPU, whole seconds on a software rasteriser — so rather than
       guess, the streamer times itself and rests when it has been costly.
       Interiors then arrive later on a weak machine instead of locking it. */
    if (this._cooldown > 0) { this._cooldown -= dt; return; }
    const room = this._pending[0];
    if (!room) return;

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    if (!room._built) this._ensureBuilt(room);
    else if (!room._texDone) this._uploadTextures(room);
    else this._compileBatch(room);
    const spent = t0 ? (performance.now() - t0) : 0;
    if (spent > STEP_BUDGET_MS) this._cooldown = COOLDOWN_S;
  }

  /** Keep the work list in nearest-first order so the streamer stays ahead. */
  _reprioritise(cameraPos) {
    if (this._pending.length < 2) return;
    for (const r of this._pending) r._d = r.distanceTo(cameraPos);
    this._pending.sort((a, b) => a._d - b._d);
  }

  /**
   * Choose which room lights the pool should carry this frame: the room the
   * camera is standing in first, then the nearest visible rooms. Props have
   * already run, so the intensities copied are this frame's.
   */
  _feedPool(cameraPos) {
    if (!this.pool) return;
    const lit = this._lit;
    lit.length = 0;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (!r.visible || !r.lights.length) continue;
      const rank = r.occupied ? -1 : r.distanceTo(cameraPos);
      for (let k = 0; k < r.lights.length; k++) {
        const l = r.lights[k];
        if (l.intensity > 0) { l._rank = rank; lit.push(l); }
      }
    }
    if (lit.length > 1) lit.sort((a, b) => a._rank - b._rank);
    this.pool.apply(lit);
  }

  update(dt, cameraPos) {
    // Props animate every frame for rooms that are already visible…
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (r.visible) r.update(dt, 0);
    }

    // …the pool picks up whatever they did to the lights…
    this._feedPool(cameraPos);

    // …one step of streaming work happens every frame…
    this._pump(dt);

    // …but visibility is re-evaluated on a slower cadence.
    this._acc += dt;
    if (this._acc < this._interval) return;
    this._acc = 0;

    this._sortAcc += this._interval;
    if (this._sortAcc > 1.0) { this._sortAcc = 0; this._reprioritise(cameraPos); }

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
      const inside = r.contains(cameraPos);
      /* Show inside `limit`, keep showing out to `limit * hysteresis`. */
      const want = r._ready && (inside || d < (r.visible ? limit * this.hysteresis : limit));
      if (want) this.visibleCount++;
      r.setVisible(want);
      r.occupied = inside;
      if (inside && d <= bestD) { bestD = d; occupied = r; }

      /* Standing inside a room that is not warm yet is the one case worth a
         hitch: an empty shell around you is worse than a stutter. Jump it to
         the head of the queue and let the next few pumps finish it. */
      if (inside && !r._ready) {
        const j = this._pending.indexOf(r);
        if (j > 0) { this._pending.splice(j, 1); this._pending.unshift(r); }
      }
    }

    if (occupied !== this.current) {
      this.previous = this.current;
      this.current = occupied;
      if (this.onRoomChange) this.onRoomChange(occupied, this.previous);
    }
  }

  /** How far through the interior stream we are, 0..1 — for the HUD. */
  get streamProgress() {
    return this.rooms.length ? this.readyCount / this.rooms.length : 1;
  }

  /** Every named interior space, for the QA report and the HUD index. */
  manifest() {
    return this.rooms.map(r => ({
      zone: r.zone, name: r.name, level: r.level, acoustic: r.acoustic,
      props: r.props.length, built: r._built
    }));
  }
}
