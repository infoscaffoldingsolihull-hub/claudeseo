import * as THREE from 'three';

/**
 * Geometry construction helpers.
 *
 * three's BufferGeometryUtils is not vendored (the deliverable is one file),
 * so the handful of operations the world builder needs - merging, transforming,
 * per-face UV scaling, hollow rooms with doorways - live here.
 */

const SCRATCH_MATRIX = new THREE.Matrix4();

/** Merge geometries into one non-indexed buffer with position/normal/uv. */
export function mergeGeometries(geometries) {
  const list = geometries.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of list) total += g.attributes.position.count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;

  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    position.set(p.array.subarray(0, p.count * 3), offset * 3);
    if (n) normal.set(n.array.subarray(0, n.count * 3), offset * 3);
    if (t) uv.set(t.array.subarray(0, t.count * 2), offset * 2);
    offset += p.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (!list.some((g) => g.attributes.normal)) merged.computeVertexNormals();
  if (total === 0) {
    // An empty merge would produce an infinite bounding box and then a NaN
    // radius, which three reports as an error every frame.
    merged.boundingBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    return merged;
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Box translated/rotated into place, ready to merge. */
export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  SCRATCH_MATRIX.makeRotationY(ry);
  SCRATCH_MATRIX.setPosition(x, y, z);
  g.applyMatrix4(SCRATCH_MATRIX);
  return g;
}

/** Rotate about X (used for the 26.5-degree pyramid passages) then translate. */
export function boxTilted(w, h, d, x, y, z, rx, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

/**
 * Scale UVs so a tiled material keeps a constant texel density regardless of
 * how large the box is.  `unit` is metres per texture repeat.
 */
export function scaleUvByWorldSize(geometry, unit = 2.5) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  if (!pos || !nor || !uv) return geometry;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = pz / unit;
      v = py / unit;
    } else if (ny >= nx && ny >= nz) {
      u = px / unit;
      v = pz / unit;
    } else {
      u = px / unit;
      v = py / unit;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Truncated pyramid / battered wall - the standard Egyptian temple profile. */
export function batteredBox(bottomW, topW, bottomD, topD, height, x = 0, y = 0, z = 0) {
  const hw0 = bottomW / 2;
  const hw1 = topW / 2;
  const hd0 = bottomD / 2;
  const hd1 = topD / 2;
  const v = [
    [-hw0, 0, -hd0], [hw0, 0, -hd0], [hw0, 0, hd0], [-hw0, 0, hd0],
    [-hw1, height, -hd1], [hw1, height, -hd1], [hw1, height, hd1], [-hw1, height, hd1],
  ];
  const faces = [
    [0, 1, 5, 4], // north (-Z)
    [1, 2, 6, 5], // east
    [2, 3, 7, 6], // south
    [3, 0, 4, 7], // west
    [4, 5, 6, 7], // top
    [3, 2, 1, 0], // bottom
  ];
  const positions = [];
  const uvs = [];
  for (const f of faces) {
    const quad = f.map((i) => v[i]);
    const tris = [[0, 1, 2], [0, 2, 3]];
    for (const tri of tris) {
      for (const k of tri) {
        positions.push(quad[k][0] + x, quad[k][1] + y, quad[k][2] + z);
      }
      uvs.push(0, 0, 1, 0, 1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ensureOutwardWinding(g, new THREE.Vector3(x, y + height * 0.4, z));
  return g;
}

/**
 * A rectangular room built from six slabs, with rectangular openings punched
 * through named walls.  Openings are given in wall-local coordinates.
 *
 * `openings` entries: { wall: 'n'|'s'|'e'|'w', offset, width, height, sill }
 */
export function hollowRoom(width, depth, height, thickness, openings = [], opts = {}) {
  const { floor = true, ceiling = true, floorThickness = thickness } = opts;
  const parts = [];
  const hw = width / 2;
  const hd = depth / 2;

  if (floor) parts.push(box(width + thickness * 2, floorThickness, depth + thickness * 2, 0, -floorThickness / 2, 0));
  if (ceiling) parts.push(box(width + thickness * 2, thickness, depth + thickness * 2, 0, height + thickness / 2, 0));

  const walls = [
    { id: 'n', len: width, cz: -hd - thickness / 2, cx: 0, horizontal: true },
    { id: 's', len: width, cz: hd + thickness / 2, cx: 0, horizontal: true },
    { id: 'w', len: depth, cx: -hw - thickness / 2, cz: 0, horizontal: false },
    { id: 'e', len: depth, cx: hw + thickness / 2, cz: 0, horizontal: false },
  ];

  for (const wall of walls) {
    const holes = openings
      .filter((o) => o.wall === wall.id)
      .map((o) => ({
        a: o.offset - o.width / 2,
        b: o.offset + o.width / 2,
        sill: o.sill || 0,
        top: (o.sill || 0) + o.height,
      }))
      .sort((p, q) => p.a - q.a);

    const half = wall.len / 2 + thickness;
    let cursor = -half;
    const segments = [];
    for (const h of holes) {
      if (h.a > cursor) segments.push({ a: cursor, b: h.a, full: true });
      // Below and above the opening.
      if (h.sill > 0) segments.push({ a: h.a, b: h.b, y0: 0, y1: h.sill });
      if (h.top < height) segments.push({ a: h.a, b: h.b, y0: h.top, y1: height });
      cursor = Math.max(cursor, h.b);
    }
    if (cursor < half) segments.push({ a: cursor, b: half, full: true });

    for (const s of segments) {
      const len = s.b - s.a;
      if (len <= 1e-4) continue;
      const mid = (s.a + s.b) / 2;
      const y0 = s.full ? 0 : s.y0;
      const y1 = s.full ? height : s.y1;
      const h = y1 - y0;
      if (h <= 1e-4) continue;
      if (wall.horizontal) parts.push(box(len, h, thickness, mid, y0 + h / 2, wall.cz));
      else parts.push(box(thickness, h, len, wall.cx, y0 + h / 2, mid));
    }
  }
  return mergeGeometries(parts);
}

/**
 * A straight corridor of rectangular section: floor, ceiling and two walls,
 * open at both ends so junctions read as continuous rock.
 */
export function corridor(length, width, height, thickness = 0.9) {
  return mergeGeometries([
    box(width + thickness * 2, thickness, length, 0, -thickness / 2, 0),
    box(width + thickness * 2, thickness, length, 0, height + thickness / 2, 0),
    box(thickness, height, length, -width / 2 - thickness / 2, height / 2, 0),
    box(thickness, height, length, width / 2 + thickness / 2, height / 2, 0),
  ]);
}

/** Gabled (saddle) roof of two inclined slabs, as over the Queen's Chamber. */
export function gableRoof(width, depth, rise, thickness) {
  const half = width / 2;
  const angle = Math.atan2(rise, half);
  const slabLen = Math.hypot(half, rise);
  const parts = [];
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(slabLen, thickness, depth);
    const m = new THREE.Matrix4().makeRotationZ(-side * angle);
    m.setPosition((side * half) / 2, rise / 2 + thickness * 0.5 * Math.cos(angle), 0);
    g.applyMatrix4(m);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** Corbelled hall: N courses stepping inward, as in the Grand Gallery. */
export function corbelledHall(length, bottomWidth, topWidth, height, courses, thickness = 1.2) {
  const parts = [];
  const stepH = height / courses;
  const inset = (bottomWidth - topWidth) / 2 / courses;
  for (let i = 0; i < courses; i++) {
    const y = i * stepH;
    const w = bottomWidth - inset * 2 * i;
    for (const side of [-1, 1]) {
      parts.push(box(thickness + inset, stepH, length, side * (w / 2 + (thickness + inset) / 2), y + stepH / 2, 0));
    }
  }
  const topW = bottomWidth - inset * 2 * courses;
  parts.push(box(topW + thickness * 2, thickness, length, 0, height + thickness / 2, 0));
  parts.push(box(bottomWidth + thickness * 2, thickness, length, 0, -thickness / 2, 0));
  return mergeGeometries(parts);
}

/** Simple stepped ramp/stair block run. */
export function stairs(steps, rise, run, width, x = 0, y = 0, z = 0, dirZ = 1) {
  const parts = [];
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    parts.push(box(width, h, run, x, y + h / 2, z + dirZ * (i * run + run / 2)));
  }
  return mergeGeometries(parts);
}

/** Egyptian square pillar with a simple abacus. */
export function squarePillar(size, height, x = 0, y = 0, z = 0) {
  return mergeGeometries([
    box(size, height, size, x, y + height / 2, z),
    box(size * 1.22, size * 0.28, size * 1.22, x, y + height + size * 0.14, z),
  ]);
}

/**
 * Guarantee outward-facing triangles for a convex-ish shell.
 *
 * Hand-built pyramid faces are easy to wind the wrong way, and a back-facing
 * triangle simply vanishes under back-face culling.  This flips any triangle
 * whose geometric normal points back toward `center`, so the caller never has
 * to reason about vertex order.
 */
export function ensureOutwardWinding(geometry, center = new THREE.Vector3()) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center);
    if (normal.dot(centroid) < 0) {
      pos.setXYZ(i + 1, c.x, c.y, c.z);
      pos.setXYZ(i + 2, b.x, b.y, b.z);
      if (uv) {
        const u1 = uv.getX(i + 1);
        const v1 = uv.getY(i + 1);
        uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
        uv.setXY(i + 2, u1, v1);
      }
    }
  }
  pos.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Apply a world matrix to a geometry (position + normals). */
export function transformGeometry(geometry, matrix) {
  geometry.applyMatrix4(matrix);
  return geometry;
}
