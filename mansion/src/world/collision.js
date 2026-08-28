/**
 * Axis-aligned collision world with a uniform-grid broad phase.
 *
 * Every solid in the mansion — wall panels, floor slabs, stair treads, kerbs,
 * furniture, a closed door leaf — is registered as an axis-aligned box.  That
 * is not a simplification forced by laziness: the whole building is drawn on a
 * rectilinear plan, so an AABB *is* the exact shape of nearly every solid, and
 * exact collision is what stops a player ever clipping through a wall.
 *
 * Movement is resolved one axis at a time, which is the classic technique and
 * the reason a player sliding along a wall keeps sliding instead of sticking.
 * Stairs work because each tread is its own box and the walker is allowed to
 * step up onto anything within `stepHeight`.
 *
 * Boxes can be enabled and disabled at run time, which is how a door stops
 * being solid the moment it swings open, and how the timeline can make a wall
 * that does not exist yet non-solid.
 */

export function createCollisionWorld(cellSize = 4) {
  const boxes = [];
  let grid = null;
  let originX = 0;
  let originZ = 0;
  let cols = 0;
  let rows = 0;
  let dirty = true;

  /** Register a solid. Returns a handle usable with setEnabled. */
  function add(minX, minY, minZ, maxX, maxY, maxZ, tag = null) {
    const box = {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
      maxZ: Math.max(minZ, maxZ),
      enabled: true,
      tag,
    };
    boxes.push(box);
    dirty = true;
    return boxes.length - 1;
  }

  /** Register a solid from a centre and a size. */
  function addBox(cx, cy, cz, sx, sy, sz, tag = null) {
    return add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag);
  }

  function setEnabled(handle, value) {
    const box = boxes[handle];
    if (box) box.enabled = !!value;
  }

  function isEnabled(handle) {
    const box = boxes[handle];
    return box ? box.enabled : false;
  }

  /** Rebuild the broad-phase grid. Cheap enough to call after bulk changes. */
  function build() {
    if (!boxes.length) {
      grid = null;
      dirty = false;
      return;
    }
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const b of boxes) {
      if (b.minX < minX) minX = b.minX;
      if (b.minZ < minZ) minZ = b.minZ;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxZ > maxZ) maxZ = b.maxZ;
    }
    originX = minX - cellSize;
    originZ = minZ - cellSize;
    cols = Math.max(1, Math.ceil((maxX - originX + cellSize) / cellSize));
    rows = Math.max(1, Math.ceil((maxZ - originZ + cellSize) / cellSize));
    grid = new Array(cols * rows);
    for (let i = 0; i < grid.length; i += 1) grid[i] = null;
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i];
      const c0 = Math.max(0, Math.floor((b.minX - originX) / cellSize));
      const c1 = Math.min(cols - 1, Math.floor((b.maxX - originX) / cellSize));
      const r0 = Math.max(0, Math.floor((b.minZ - originZ) / cellSize));
      const r1 = Math.min(rows - 1, Math.floor((b.maxZ - originZ) / cellSize));
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const k = r * cols + c;
          if (!grid[k]) grid[k] = [];
          grid[k].push(i);
        }
      }
    }
    dirty = false;
  }

  // Each query owns its own buffer: `candidates` is re-entered while a caller
  // is still iterating a previous result, and a single shared scratch array
  // would have one call quietly refill the other's list underneath it.
  const bufA = [];
  const bufB = [];
  const bufC = [];

  /** Candidate box indices overlapping an XZ rectangle, into `out`. */
  function candidates(minX, minZ, maxX, maxZ, out) {
    if (dirty) build();
    out.length = 0;
    if (!grid) return out;
    const c0 = Math.max(0, Math.floor((minX - originX) / cellSize));
    const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cellSize));
    const r0 = Math.max(0, Math.floor((minZ - originZ) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / cellSize));
    if (c1 < c0 || r1 < r0) return out;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const list = grid[r * cols + c];
        if (!list) continue;
        for (const i of list) if (out.indexOf(i) === -1) out.push(i);
      }
    }
    return out;
  }

  function overlaps(box, minX, minY, minZ, maxX, maxY, maxZ) {
    return box.enabled &&
      box.maxX > minX && box.minX < maxX &&
      box.maxY > minY && box.minY < maxY &&
      box.maxZ > minZ && box.minZ < maxZ;
  }

  /** Box indices the walker's body currently intersects, into `out`. */
  function bodyOverlaps(pos, radius, height, out, footClearance = 0.02) {
    const minX = pos.x - radius;
    const maxX = pos.x + radius;
    const minZ = pos.z - radius;
    const maxZ = pos.z + radius;
    const minY = pos.y + footClearance;
    const maxY = pos.y + height;
    const list = candidates(minX, minZ, maxX, maxZ, out);
    let write = 0;
    for (let read = 0; read < list.length; read += 1) {
      const i = list[read];
      if (overlaps(boxes[i], minX, minY, minZ, maxX, maxY, maxZ)) {
        list[write] = i;
        write += 1;
      }
    }
    list.length = write;
    return list;
  }

  /**
   * Push the walker out along one horizontal axis until it is clear.
   *
   * Each pass takes the *most restrictive* of every box it is inside, rather
   * than resolving against them one at a time: resolving one at a time
   * mutates the position mid-loop, which makes the boxes tested afterwards
   * overlap when they should not.
   */
  function resolveAxis(pos, axis, radius, height, moved) {
    let hit = false;
    for (let pass = 0; pass < 4; pass += 1) {
      const list = bodyOverlaps(pos, radius, height, bufA);
      if (!list.length) break;
      hit = true;
      let target = null;
      for (const i of list) {
        const b = boxes[i];
        const edge = moved > 0
          ? (axis === 'x' ? b.minX - radius : b.minZ - radius) - 1e-4
          : (axis === 'x' ? b.maxX + radius : b.maxZ + radius) + 1e-4;
        if (target === null) target = edge;
        else target = moved > 0 ? Math.min(target, edge) : Math.max(target, edge);
      }
      pos[axis] = target;
    }
    return hit;
  }

  /** Is the walker's body clear at this position? */
  function isClear(pos, radius, height) {
    return bodyOverlaps(pos, radius, height, bufB).length === 0;
  }

  /**
   * The highest surface under a point that the walker could stand on.
   * `ceiling` bounds the search, so a first-floor slab does not capture a
   * player standing on the ground floor.
   */
  function groundAt(x, z, ceiling, radius = 0.28) {
    const list = candidates(x - radius, z - radius, x + radius, z + radius, bufC);
    let best = -Infinity;
    for (const i of list) {
      const b = boxes[i];
      if (!b.enabled) continue;
      if (b.maxX <= x - radius || b.minX >= x + radius) continue;
      if (b.maxZ <= z - radius || b.minZ >= z + radius) continue;
      if (b.maxY > ceiling + 1e-4) continue;
      if (b.maxY > best) best = b.maxY;
    }
    return best;
  }

  /**
   * Move a walker by `delta`, resolving against the world.
   *
   * Horizontal motion is resolved one axis at a time, which is what lets a
   * player slide along a wall instead of sticking to it. Vertical motion
   * lands on the highest surface that was *at or below the feet before the
   * move* — the qualification matters: without it, landing on a floor makes
   * the next box in the list overlap, and the walker climbs a storey per
   * frame.
   *
   * @returns { grounded, hitWall, steppedUp }
   */
  function moveWalker(pos, delta, radius, height, stepHeight = 0.42) {
    if (dirty) build();
    let steppedUp = false;
    let hitWall = false;

    /* ------------------------------------------------------- horizontal -- */
    for (const axis of ['x', 'z']) {
      const amount = delta[axis];
      if (!amount) continue;
      const before = pos[axis];
      const beforeY = pos.y;
      pos[axis] = before + amount;
      if (resolveAxis(pos, axis, radius, height, amount)) {
        // Blocked. Try the same move from a stepped-up position: this is what
        // makes stair treads, kerbs and thresholds walkable rather than walls.
        const stepped = { x: pos.x, y: beforeY + stepHeight, z: pos.z };
        stepped[axis] = before + amount;
        if (isClear(stepped, radius, height)) {
          pos[axis] = stepped[axis];
          pos.y = stepped.y;
          steppedUp = true;
        } else {
          hitWall = true;
        }
      }
    }

    /* --------------------------------------------------------- vertical -- */
    let grounded = false;
    const oldY = pos.y;
    const dy = delta.y;
    if (dy !== 0) {
      pos.y = oldY + dy;
      const list = bodyOverlaps(pos, radius, height, bufA);
      if (list.length) {
        if (dy < 0) {
          let landing = -Infinity;
          for (const i of list) {
            const top = boxes[i].maxY;
            if (top <= oldY + 0.02 && top > landing) landing = top;
          }
          if (landing > -Infinity) {
            pos.y = landing;
            grounded = true;
          } else {
            // Already embedded in something: do not sink further into it.
            pos.y = oldY;
          }
        } else {
          let ceiling = Infinity;
          for (const i of list) {
            const under = boxes[i].minY;
            if (under >= oldY + height - 0.02 && under < ceiling) ceiling = under;
          }
          if (ceiling < Infinity) pos.y = ceiling - height - 1e-4;
          else pos.y = oldY;
        }
      }
    }

    // Settle: within a hair of a surface, treat it as ground. Without this the
    // walker bounces by fractions of a millimetre and the camera jitters while
    // standing still. It only ever snaps *down*, never up.
    if (!grounded) {
      const floor = groundAt(pos.x, pos.z, pos.y + 0.06, radius);
      if (Number.isFinite(floor) && pos.y - floor >= -0.001 && pos.y - floor < 0.07) {
        pos.y = floor;
        grounded = true;
      }
    }

    return { grounded, hitWall, steppedUp };
  }

  /**
   * Nearest solid along a ray, ignoring boxes whose tag matches `exclude`.
   *
   * Used by the interaction system to decide whether the thing you are aiming
   * at is actually in view or on the far side of a wall. Slab method; a zero
   * direction component resolves through the infinities correctly because a
   * ray parallel to a slab either misses it entirely or is inside it.
   */
  function raycastDistance(origin, dir, maxDist, exclude) {
    if (dirty) build();
    // Broad phase over the ray's XZ bounding rectangle.
    const ex = origin.x + dir.x * maxDist;
    const ez = origin.z + dir.z * maxDist;
    const list = candidates(
      Math.min(origin.x, ex) - 0.5, Math.min(origin.z, ez) - 0.5,
      Math.max(origin.x, ex) + 0.5, Math.max(origin.z, ez) + 0.5,
      bufC,
    );
    let nearest = maxDist;
    for (const i of list) {
      const b = boxes[i];
      if (!b.enabled) continue;
      if (exclude && b.tag === exclude) continue;
      let tmin = 0;
      let tmax = nearest;
      let miss = false;
      for (const axis of ['x', 'y', 'z']) {
        const lo = axis === 'x' ? b.minX : axis === 'y' ? b.minY : b.minZ;
        const hi = axis === 'x' ? b.maxX : axis === 'y' ? b.maxY : b.maxZ;
        const inv = 1 / dir[axis];
        let t1 = (lo - origin[axis]) * inv;
        let t2 = (hi - origin[axis]) * inv;
        if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmax < tmin) { miss = true; break; }
      }
      if (!miss && tmin < nearest) nearest = tmin;
    }
    return nearest;
  }

  return {
    add,
    addBox,
    raycastDistance,
    setEnabled,
    isEnabled,
    build,
    moveWalker,
    groundAt,
    isClear,
    get count() { return boxes.length; },
    /** For the debug overlay and the test harness. */
    boxes,
    clear() {
      boxes.length = 0;
      grid = null;
      dirty = true;
    },
  };
}
