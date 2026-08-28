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

  const scratch = [];

  /** Candidate box indices overlapping an XZ rectangle. */
  function candidates(minX, minZ, maxX, maxZ) {
    if (dirty) build();
    scratch.length = 0;
    if (!grid) return scratch;
    const c0 = Math.max(0, Math.floor((minX - originX) / cellSize));
    const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cellSize));
    const r0 = Math.max(0, Math.floor((minZ - originZ) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / cellSize));
    if (c1 < c0 || r1 < r0) return scratch;
    // A small set is faster to de-duplicate with a marker array than a Set.
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const list = grid[r * cols + c];
        if (!list) continue;
        for (const i of list) if (!scratch.includes(i)) scratch.push(i);
      }
    }
    return scratch;
  }

  function overlaps(box, minX, minY, minZ, maxX, maxY, maxZ) {
    return box.enabled &&
      box.maxX > minX && box.minX < maxX &&
      box.maxY > minY && box.minY < maxY &&
      box.maxZ > minZ && box.minZ < maxZ;
  }

  /** Resolve one horizontal axis of motion. Returns true if it hit something. */
  function resolveHorizontal(pos, axis, radius, height, moved) {
    const minX = pos.x - radius;
    const maxX = pos.x + radius;
    const minZ = pos.z - radius;
    const maxZ = pos.z + radius;
    const minY = pos.y + 0.02; // ignore the floor we are standing on
    const maxY = pos.y + height;
    const list = candidates(minX, minZ, maxX, maxZ);
    let hit = false;
    for (const i of list) {
      const b = boxes[i];
      if (!overlaps(b, minX, minY, minZ, maxX, maxY, maxZ)) continue;
      hit = true;
      if (axis === 'x') {
        if (moved > 0) pos.x = b.minX - radius - 1e-4;
        else if (moved < 0) pos.x = b.maxX + radius + 1e-4;
      } else if (moved > 0) pos.z = b.minZ - radius - 1e-4;
      else if (moved < 0) pos.z = b.maxZ + radius + 1e-4;
      // Re-measure after the push so a second box in the same frame is
      // resolved against the corrected position, not the original one.
      return hit ? resolveHorizontalAgain(pos, axis, radius, height, moved, i) : hit;
    }
    return hit;
  }

  /** One extra settle pass, skipping the box we just resolved against. */
  function resolveHorizontalAgain(pos, axis, radius, height, moved, skip) {
    const minX = pos.x - radius;
    const maxX = pos.x + radius;
    const minZ = pos.z - radius;
    const maxZ = pos.z + radius;
    const minY = pos.y + 0.02;
    const maxY = pos.y + height;
    const list = candidates(minX, minZ, maxX, maxZ);
    for (const i of list) {
      if (i === skip) continue;
      const b = boxes[i];
      if (!overlaps(b, minX, minY, minZ, maxX, maxY, maxZ)) continue;
      if (axis === 'x') {
        if (moved > 0) pos.x = b.minX - radius - 1e-4;
        else if (moved < 0) pos.x = b.maxX + radius + 1e-4;
      } else if (moved > 0) pos.z = b.minZ - radius - 1e-4;
      else if (moved < 0) pos.z = b.maxZ + radius + 1e-4;
    }
    return true;
  }

  /** Is the walker's box clear at this position? */
  function isClear(pos, radius, height) {
    const minX = pos.x - radius;
    const maxX = pos.x + radius;
    const minZ = pos.z - radius;
    const maxZ = pos.z + radius;
    const minY = pos.y + 0.02;
    const maxY = pos.y + height;
    const list = candidates(minX, minZ, maxX, maxZ);
    for (const i of list) {
      if (overlaps(boxes[i], minX, minY, minZ, maxX, maxY, maxZ)) return false;
    }
    return true;
  }

  /**
   * The highest surface under a point that the walker could stand on.
   * `ceiling` bounds the search so a first-floor slab does not capture a
   * player standing on the ground floor.
   */
  function groundAt(x, z, ceiling, radius = 0.28) {
    const list = candidates(x - radius, z - radius, x + radius, z + radius);
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
      pos[axis] += amount;
      if (resolveHorizontal(pos, axis, radius, height, amount)) {
        // Blocked. Try again from a stepped-up position: this is what makes
        // stair treads, kerbs and thresholds walkable instead of walls.
        const stepped = { x: pos.x, y: pos.y + stepHeight, z: pos.z };
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
    const dy = delta.y;
    if (dy !== 0 || steppedUp) {
      pos.y += dy;
      const minX = pos.x - radius;
      const maxX = pos.x + radius;
      const minZ = pos.z - radius;
      const maxZ = pos.z + radius;
      const list = candidates(minX, minZ, maxX, maxZ);
      for (const i of list) {
        const b = boxes[i];
        if (!overlaps(b, minX, pos.y, minZ, maxX, pos.y + height, maxZ)) continue;
        if (dy <= 0) {
          // Falling or settling: land on top of the box.
          pos.y = b.maxY;
          grounded = true;
        } else {
          // Rising: bump the head on the underside.
          pos.y = b.minY - height - 1e-4;
        }
      }
    }

    // Settle: if we are within a hair of a surface, treat it as ground. This
    // stops the tiny sub-millimetre bouncing that otherwise shows up as a
    // jittering camera when standing still.
    if (!grounded) {
      const floor = groundAt(pos.x, pos.z, pos.y + 0.08, radius);
      if (Number.isFinite(floor) && pos.y - floor < 0.06 && pos.y - floor > -0.06) {
        pos.y = floor;
        grounded = true;
      }
    }

    return { grounded, hitWall, steppedUp };
  }

  return {
    add,
    addBox,
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
