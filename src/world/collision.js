/**
 * Axis-aligned collision world.
 *
 * The player is a vertical box (radius x height); every solid in the scene is
 * registered as an AABB.  Movement is resolved one axis at a time - the classic
 * technique - which gives reliable sliding along walls, no tunnelling at
 * walking speed, and automatic step-up onto the 0.6-0.7 m limestone courses
 * and temple steps without any ramp geometry.
 *
 * A uniform grid keeps the broad phase at a handful of candidate boxes even
 * with the ~4 000 colliders the full Giza complex registers.
 */

const CELL = 16;

export class CollisionWorld {
  constructor(groundFn) {
    this.groundFn = groundFn || (() => 0);
    this.boxes = [];
    this.grid = new Map();
    this.stepHeight = 0.72;
    this.enabled = true;
  }

  static _key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  /** Register a solid. Bounds are world-space min/max. */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = '') {
    const index = this.boxes.length;
    this.boxes.push({ minX, minY, minZ, maxX, maxY, maxZ, tag });
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = CollisionWorld._key(cx, cz);
        let bucket = this.grid.get(key);
        if (!bucket) {
          bucket = [];
          this.grid.set(key, bucket);
        }
        bucket.push(index);
      }
    }
    return index;
  }

  /** Convenience wrapper: centre + size. */
  addCenteredBox(cx, cy, cz, sx, sy, sz, tag = '') {
    return this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag);
  }

  /** Register the axis-aligned bounds of a mesh (after world matrix update). */
  addObject3D(object, tag = '') {
    object.updateWorldMatrix(true, false);
    const geo = object.geometry;
    if (!geo) return -1;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox.clone().applyMatrix4(object.matrixWorld);
    return this.addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, tag);
  }

  clear() {
    this.boxes.length = 0;
    this.grid.clear();
  }

  _candidates(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = this.grid.get(CollisionWorld._key(cx, cz));
        if (!bucket) continue;
        for (const i of bucket) if (out.indexOf(i) === -1) out.push(i);
      }
    }
    return out;
  }

  /** Highest solid surface at (x,z) at or below `fromY`, terrain included. */
  groundAt(x, z, fromY = Infinity) {
    let best = this.groundFn(x, z);
    const cands = this._candidates(x, z, x, z, this._scratch || (this._scratch = []));
    for (const i of cands) {
      const b = this.boxes[i];
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY > best && b.maxY <= fromY + 0.001) best = b.maxY;
    }
    return best;
  }

  /** True when the point is inside any registered solid. */
  isSolid(x, y, z) {
    const cands = this._candidates(x, z, x, z, this._scratch2 || (this._scratch2 = []));
    for (const i of cands) {
      const b = this.boxes[i];
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  }

  _overlapping(px, py, pz, radius, height, out) {
    const minX = px - radius;
    const maxX = px + radius;
    const minZ = pz - radius;
    const maxZ = pz + radius;
    const minY = py - height;
    const maxY = py;
    const cands = this._candidates(minX, minZ, maxX, maxZ, this._scratch3 || (this._scratch3 = []));
    out.length = 0;
    for (const i of cands) {
      const b = this.boxes[i];
      if (maxX <= b.minX || minX >= b.maxX) continue;
      if (maxZ <= b.minZ || minZ >= b.maxZ) continue;
      if (maxY <= b.minY || minY >= b.maxY) continue;
      out.push(b);
    }
    return out;
  }

  /**
   * Integrate one movement step.  `position` is mutated in place; it is the
   * EYE position, so the collision box spans [y-height, y].
   */
  move(position, delta, radius, height, noGravity = false) {
    if (!this.enabled) {
      position.x += delta.x;
      position.y += delta.y;
      position.z += delta.z;
      return { grounded: false, hitCeiling: false, hitWall: false };
    }

    const hits = this._hits || (this._hits = []);
    let hitWall = false;
    let hitCeiling = false;

    // ---- X ----
    position.x += delta.x;
    this._overlapping(position.x, position.y, position.z, radius, height, hits);
    for (const b of hits) {
      const feet = position.y - height;
      if (b.maxY - feet > 0 && b.maxY - feet <= this.stepHeight && b.maxY < position.y - 0.1) {
        position.y = b.maxY + height;   // step up onto a course
        continue;
      }
      if (delta.x > 0) position.x = Math.min(position.x, b.minX - radius - 0.001);
      else if (delta.x < 0) position.x = Math.max(position.x, b.maxX + radius + 0.001);
      hitWall = true;
    }

    // ---- Z ----
    position.z += delta.z;
    this._overlapping(position.x, position.y, position.z, radius, height, hits);
    for (const b of hits) {
      const feet = position.y - height;
      if (b.maxY - feet > 0 && b.maxY - feet <= this.stepHeight && b.maxY < position.y - 0.1) {
        position.y = b.maxY + height;
        continue;
      }
      if (delta.z > 0) position.z = Math.min(position.z, b.minZ - radius - 0.001);
      else if (delta.z < 0) position.z = Math.max(position.z, b.maxZ + radius + 0.001);
      hitWall = true;
    }

    // ---- Y ----
    position.y += delta.y;
    let grounded = false;
    this._overlapping(position.x, position.y, position.z, radius, height, hits);
    for (const b of hits) {
      // Resolve along whichever face is nearer. Keying off the sign of the
      // vertical velocity alone would launch a standing player through the
      // ceiling of a 1.2 m passage, because the ceiling slab is the box the
      // head is inside while the feet are still falling.
      const feet = position.y - height;
      const fromTop = b.maxY - feet;          // lift needed to stand on the box
      const fromBottom = position.y - b.minY; // drop needed to clear its underside
      if (fromTop <= fromBottom) {
        const target = b.maxY + height;
        if (position.y < target) {
          position.y = target;
          grounded = true;
        }
      } else {
        const target = b.minY;
        if (position.y > target) {
          position.y = target;
          hitCeiling = true;
        }
      }
    }

    if (!noGravity) {
      const terrain = this.groundFn(position.x, position.z) + height;
      if (position.y <= terrain) {
        position.y = terrain;
        grounded = true;
      }
    }

    return { grounded, hitCeiling, hitWall };
  }
}
