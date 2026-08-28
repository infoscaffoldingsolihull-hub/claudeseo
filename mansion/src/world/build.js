/**
 * Geometry construction primitives.
 *
 * Nearly every solid in the mansion is a box: a wall leaf, a slab, a stair
 * tread, a lintel, a kerb, a worktop.  Rather than create hundreds of
 * BoxGeometry meshes and merge them with a utility that would have to be
 * vendored, this module emits box faces straight into typed arrays and hands
 * back one BufferGeometry per material.  A whole floor of the house ends up
 * as a handful of draw calls.
 *
 * Two decisions worth stating:
 *
 *   - **UVs are world-space.** Every face is textured from its own world
 *     coordinates divided by a metres-per-repeat figure, so a marble slab
 *     joins a marble threshold with the veining continuing across it, and no
 *     mesh ever needs its own `repeat` setting.
 *   - **Openings are made by omission, not subtraction.** A wall with a door
 *     in it is emitted as the pier left of the door, the pier right of it, the
 *     panel under the sill and the panel over the head. There is no CSG, so
 *     there is no CSG failure mode: the geometry is exact by construction and
 *     the collision boxes are the same rectangles.
 */
import * as THREE from 'three';

/**
 * Accumulates box faces into growable arrays and builds one BufferGeometry.
 *
 * `uvScale` is the default metres per texture repeat; individual boxes can
 * override it.
 */
export function createSurfaceBuilder(uvScale = 1) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vertexCount = 0;

  /** One quad, given four corners in winding order and a face normal. */
  function quad(a, b, c, d, nx, ny, nz, u0, v0, u1, v1) {
    const base = vertexCount;
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let i = 0; i < 4; i += 1) normals.push(nx, ny, nz);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertexCount += 4;
  }

  const api = {
    get empty() { return vertexCount === 0; },
    get vertices() { return vertexCount; },

    /**
     * An axis-aligned box from two corners. `scale` overrides the metres per
     * texture repeat; `faces` can omit sides that will never be seen.
     */
    box(x0, y0, z0, x1, y1, z1, scale = uvScale, faces = null) {
      const ax = Math.min(x0, x1); const bx = Math.max(x0, x1);
      const ay = Math.min(y0, y1); const by = Math.max(y0, y1);
      const az = Math.min(z0, z1); const bz = Math.max(z0, z1);
      if (bx - ax < 1e-6 || by - ay < 1e-6 || bz - az < 1e-6) return api;
      const s = 1 / Math.max(1e-6, scale);
      const want = (name) => !faces || faces[name] !== false;

      // +X and −X faces are textured from (z, y).
      if (want('px')) {
        quad([bx, ay, bz], [bx, ay, az], [bx, by, az], [bx, by, bz],
          1, 0, 0, az * s, ay * s, bz * s, by * s);
      }
      if (want('nx')) {
        quad([ax, ay, az], [ax, ay, bz], [ax, by, bz], [ax, by, az],
          -1, 0, 0, az * s, ay * s, bz * s, by * s);
      }
      // +Y and −Y faces are textured from (x, z).
      if (want('py')) {
        quad([ax, by, bz], [bx, by, bz], [bx, by, az], [ax, by, az],
          0, 1, 0, ax * s, az * s, bx * s, bz * s);
      }
      if (want('ny')) {
        quad([ax, ay, az], [bx, ay, az], [bx, ay, bz], [ax, ay, bz],
          0, -1, 0, ax * s, az * s, bx * s, bz * s);
      }
      // +Z and −Z faces are textured from (x, y).
      if (want('pz')) {
        quad([ax, ay, bz], [bx, ay, bz], [bx, by, bz], [ax, by, bz],
          0, 0, 1, ax * s, ay * s, bx * s, by * s);
      }
      if (want('nz')) {
        quad([bx, ay, az], [ax, ay, az], [ax, by, az], [bx, by, az],
          0, 0, -1, ax * s, ay * s, bx * s, by * s);
      }
      return api;
    },

    /** A box from its centre and size. */
    boxAt(cx, cy, cz, sx, sy, sz, scale = uvScale, faces = null) {
      return api.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, scale, faces);
    },

    /**
     * A box rotated about Y. UVs are taken in the box's own local space, so a
     * rotated element still reads as the same material.
     */
    boxRotated(cx, cy, cz, sx, sy, sz, angle, scale = uvScale) {
      const s = 1 / Math.max(1e-6, scale);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hx = sx / 2; const hy = sy / 2; const hz = sz / 2;
      const put = (lx, ly, lz) => [cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos];
      const rot = (nx, nz) => [nx * cos + nz * sin, -nx * sin + nz * cos];

      const [pxn, pzn] = rot(1, 0);
      const [zxn, zzn] = rot(0, 1);
      // +X / −X
      quad(put(hx, -hy, hz), put(hx, -hy, -hz), put(hx, hy, -hz), put(hx, hy, hz),
        pxn, 0, pzn, -hz * s, -hy * s, hz * s, hy * s);
      quad(put(-hx, -hy, -hz), put(-hx, -hy, hz), put(-hx, hy, hz), put(-hx, hy, -hz),
        -pxn, 0, -pzn, -hz * s, -hy * s, hz * s, hy * s);
      // +Y / −Y
      quad(put(-hx, hy, hz), put(hx, hy, hz), put(hx, hy, -hz), put(-hx, hy, -hz),
        0, 1, 0, -hx * s, -hz * s, hx * s, hz * s);
      quad(put(-hx, -hy, -hz), put(hx, -hy, -hz), put(hx, -hy, hz), put(-hx, -hy, hz),
        0, -1, 0, -hx * s, -hz * s, hx * s, hz * s);
      // +Z / −Z
      quad(put(-hx, -hy, hz), put(hx, -hy, hz), put(hx, hy, hz), put(-hx, hy, hz),
        zxn, 0, zzn, -hx * s, -hy * s, hx * s, hy * s);
      quad(put(hx, -hy, -hz), put(-hx, -hy, -hz), put(-hx, hy, -hz), put(hx, hy, -hz),
        -zxn, 0, -zzn, -hx * s, -hy * s, hx * s, hy * s);
      return api;
    },

    /** A horizontal slab with a rectangular hole cut out of it. */
    slabWithHoles(x0, z0, x1, z1, y0, y1, holes, scale = uvScale) {
      const rects = subtractRects({ x0, z0, x1, z1 }, holes);
      for (const r of rects) api.box(r.x0, y0, r.z0, r.x1, y1, r.z1, scale);
      return rects;
    },

    /** A four-sided sloping prism, used for copings, sills and pediments. */
    wedge(x0, z0, x1, z1, yBase, yLow, yHigh, alongX = true, scale = uvScale) {
      // Approximated with a short stack of boxes so it stays one material and
      // keeps exact axis-aligned collision.
      const steps = 5;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const h0 = yLow + (yHigh - yLow) * t0;
        if (alongX) {
          const a = x0 + (x1 - x0) * t0;
          const b = x0 + (x1 - x0) * t1;
          api.box(a, yBase, z0, b, h0, z1, scale);
        } else {
          const a = z0 + (z1 - z0) * t0;
          const b = z0 + (z1 - z0) * t1;
          api.box(x0, yBase, a, x1, h0, b, scale);
        }
      }
      return api;
    },

    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };
  return api;
}

/** Merge a list of [lo, hi] intervals into their union, sorted. */
export function unionIntervals(list, epsilon = 1e-6) {
  const sorted = list.filter(([lo, hi]) => hi - lo > epsilon).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + epsilon) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** Split intervals at a set of coordinates, dropping degenerate results. */
export function splitIntervals(intervals, breakpoints, epsilon = 1e-6) {
  const cuts = Array.from(new Set(breakpoints.map((v) => Math.round(v * 1e4) / 1e4))).sort((a, b) => a - b);
  const out = [];
  for (const [lo, hi] of intervals) {
    let cursor = lo;
    for (const cut of cuts) {
      if (cut <= cursor + epsilon || cut >= hi - epsilon) continue;
      out.push([cursor, cut]);
      cursor = cut;
    }
    if (hi - cursor > epsilon) out.push([cursor, hi]);
  }
  return out;
}

/**
 * The solid pieces of a wall panel once its openings are removed.
 *
 * Returns rectangles in (u, v) where u runs along the wall and v is height.
 * Openings are clipped to the panel, so an opening that straddles a segment
 * boundary is handled correctly by both segments.
 */
export function wallPieces(from, to, y0, y1, openings, epsilon = 1e-5) {
  const pieces = [];
  const relevant = openings
    .map((o) => ({
      u0: Math.max(from, o.u - o.width / 2),
      u1: Math.min(to, o.u + o.width / 2),
      sill: Math.max(y0, o.sill),
      head: Math.min(y1, o.head),
    }))
    .filter((o) => o.u1 - o.u0 > epsilon && o.head - o.sill > epsilon)
    .sort((a, b) => a.u0 - b.u0);

  let cursor = from;
  for (const o of relevant) {
    if (o.u0 - cursor > epsilon) pieces.push({ u0: cursor, u1: o.u0, v0: y0, v1: y1 });
    if (o.sill - y0 > epsilon) pieces.push({ u0: o.u0, u1: o.u1, v0: y0, v1: o.sill });
    if (y1 - o.head > epsilon) pieces.push({ u0: o.u0, u1: o.u1, v0: o.head, v1: y1 });
    cursor = Math.max(cursor, o.u1);
  }
  if (to - cursor > epsilon) pieces.push({ u0: cursor, u1: to, v0: y0, v1: y1 });
  return pieces;
}

/**
 * Subtract a set of rectangles from one rectangle, returning a cover of the
 * remainder. Used for slabs with stairwells and double-height voids in them.
 *
 * The result is a partition into at most four bands per hole, applied
 * iteratively — not minimal, but exact and with no T-junction cracks because
 * every piece is a full rectangle.
 */
export function subtractRects(rect, holes, epsilon = 1e-6) {
  let current = [rect];
  for (const hole of holes || []) {
    const next = [];
    for (const r of current) {
      const ix0 = Math.max(r.x0, hole.x0);
      const ix1 = Math.min(r.x1, hole.x1);
      const iz0 = Math.max(r.z0, hole.z0);
      const iz1 = Math.min(r.z1, hole.z1);
      if (ix1 - ix0 <= epsilon || iz1 - iz0 <= epsilon) {
        next.push(r);
        continue;
      }
      if (iz0 - r.z0 > epsilon) next.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: iz0 });
      if (r.z1 - iz1 > epsilon) next.push({ x0: r.x0, z0: iz1, x1: r.x1, z1: r.z1 });
      if (ix0 - r.x0 > epsilon) next.push({ x0: r.x0, z0: iz0, x1: ix0, z1: iz1 });
      if (r.x1 - ix1 > epsilon) next.push({ x0: ix1, z0: iz0, x1: r.x1, z1: iz1 });
    }
    current = next;
  }
  return current;
}

/** Does a point lie inside a rectangle? */
export function inRect(rect, x, z, epsilon = 0) {
  return x >= rect.x0 - epsilon && x <= rect.x1 + epsilon &&
    z >= rect.z0 - epsilon && z <= rect.z1 + epsilon;
}

/**
 * A tapered classical column: shaft with entasis, torus base and a flared
 * capital. Returned as a single lathe geometry, which is far cheaper than
 * modelling flutes and reads correctly at the distances the player sees it.
 */
export function columnGeometry(radius, height, segments = 20) {
  const points = [];
  const push = (r, y) => points.push(new THREE.Vector2(Math.max(0.0001, r), y));

  // Plinth and base mouldings.
  push(radius * 1.42, 0);
  push(radius * 1.42, height * 0.022);
  push(radius * 1.30, height * 0.028);
  push(radius * 1.30, height * 0.042);
  push(radius * 1.16, height * 0.056);
  push(radius * 1.08, height * 0.072);

  // Shaft, with a slight entasis: widest a third of the way up.
  const shaftBottom = height * 0.075;
  const shaftTop = height * 0.86;
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = shaftBottom + (shaftTop - shaftBottom) * t;
    const entasis = Math.sin((t * 0.72 + 0.13) * Math.PI);
    const r = radius * (0.86 + 0.13 * entasis) * (1 - t * 0.10);
    push(r, y);
  }

  // Capital: astragal, bell, abacus.
  push(radius * 0.92, height * 0.868);
  push(radius * 1.00, height * 0.880);
  push(radius * 0.94, height * 0.892);
  push(radius * 1.02, height * 0.930);
  push(radius * 1.24, height * 0.962);
  push(radius * 1.34, height * 0.978);
  push(radius * 1.34, height);
  push(0.001, height);

  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

/** A turned baluster for the balustrades. */
export function balusterGeometry(radius, height, segments = 10) {
  const points = [];
  const push = (r, y) => points.push(new THREE.Vector2(Math.max(0.0001, r), y));
  push(radius * 1.5, 0);
  push(radius * 1.5, height * 0.08);
  push(radius * 1.05, height * 0.13);
  push(radius * 0.62, height * 0.20);
  push(radius * 1.30, height * 0.36);
  push(radius * 1.36, height * 0.46);
  push(radius * 1.02, height * 0.60);
  push(radius * 0.58, height * 0.74);
  push(radius * 0.72, height * 0.84);
  push(radius * 1.20, height * 0.93);
  push(radius * 1.20, height);
  push(0.001, height);
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

/** A hemispherical dome with a lantern seat, built as a partial sphere. */
export function domeGeometry(radius, height, segments = 32) {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(8, segments >> 1), 0, Math.PI * 2, 0, Math.PI * 0.5);
  geometry.scale(1, height / radius, 1);
  return geometry;
}

/** Dispose a whole subtree's geometries and materials. */
export function disposeObject(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    const material = node.material;
    if (!material) return;
    if (Array.isArray(material)) for (const m of material) m.dispose();
    else material.dispose();
  });
}

/** Sum of a mesh tree's triangle count, for the statistics panel. */
export function countTriangles(root) {
  let total = 0;
  root.traverse((node) => {
    const g = node.geometry;
    if (!g) return;
    const count = node.isInstancedMesh ? (node.count || 0) : 1;
    if (g.index) total += (g.index.count / 3) * count;
    else if (g.attributes.position) total += (g.attributes.position.count / 3) * count;
  });
  return Math.round(total);
}
