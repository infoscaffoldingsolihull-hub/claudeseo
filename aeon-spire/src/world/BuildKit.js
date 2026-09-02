/**
 * AEON SPIRE — geometry toolkit.
 *
 * Reusable builders shared by every zone. Deliberately written against the
 * three.js core only: `BufferGeometryUtils` lives in the addons bundle, and
 * the project keeps a single module dependency, so `mergeGeometries` below
 * is implemented here.
 *
 * Merging matters for E.9 — a supertall assembled from thousands of small
 * parts must reach the GPU as a handful of draw calls.
 */

import * as THREE from 'three';
import { clamp, lerp, TAU, rng } from '../core/MathUtil.js';

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

const MERGE_ATTRS = ['position', 'normal', 'uv', 'uv1', 'color', 'aSway'];

/**
 * Merge an array of BufferGeometry into one. Geometries need not share the
 * same attribute set — missing attributes are filled with zeros (or, for
 * normals, +Y) so the result is always well-formed.
 * @param {THREE.BufferGeometry[]} geos
 * @param {boolean} disposeSources free the inputs once merged
 */
export function mergeGeometries(geos, disposeSources = true) {
  const list = geos.filter(g => g && g.attributes.position);
  if (list.length === 0) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];

  // Work out which attributes to carry and their item sizes.
  const present = new Map();
  for (const g of list) {
    for (const name of MERGE_ATTRS) {
      const a = g.attributes[name];
      if (a && !present.has(name)) present.set(name, a.itemSize);
    }
  }

  let vertexCount = 0, indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const out = new THREE.BufferGeometry();
  const buffers = new Map();
  for (const [name, size] of present) buffers.set(name, new Float32Array(vertexCount * size));
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    for (const [name, size] of present) {
      const dst = buffers.get(name);
      const src = g.attributes[name];
      if (src && src.itemSize === size) {
        dst.set(src.array.subarray(0, count * size), vOff * size);
      } else if (name === 'normal') {
        for (let i = 0; i < count; i++) dst[(vOff + i) * size + 1] = 1;
      }
      // other missing attributes stay zero-filled
    }
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) indices[iOff + i] = src[i] + vOff;
      iOff += src.length;
    } else {
      for (let i = 0; i < count; i++) indices[iOff + i] = vOff + i;
      iOff += count;
    }
    vOff += count;
    if (disposeSources) g.dispose();
  }

  for (const [name, size] of present) {
    out.setAttribute(name, new THREE.BufferAttribute(buffers.get(name), size));
  }
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Clone-and-transform helper used before merging. */
export function xform(geo, { pos, rot, scale, quat } = {}) {
  const m = new THREE.Matrix4();
  const q = quat || new THREE.Quaternion();
  if (!quat && rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  m.compose(
    new THREE.Vector3(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0),
    q,
    new THREE.Vector3(
      scale ? (Array.isArray(scale) ? scale[0] : scale) : 1,
      scale ? (Array.isArray(scale) ? scale[1] : scale) : 1,
      scale ? (Array.isArray(scale) ? scale[2] : scale) : 1
    )
  );
  geo.applyMatrix4(m);
  return geo;
}

/** Convenience: build a box already positioned in local space. */
export function box(w, h, d, pos = [0, 0, 0], rot = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  return xform(g, { pos, rot });
}

export function cyl(rTop, rBot, h, seg, pos = [0, 0, 0], rot = null, openEnded = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, openEnded);
  return xform(g, { pos, rot });
}

/* ------------------------------------------------------------------ */
/* Plan shapes                                                         */
/* ------------------------------------------------------------------ */

/** A rounded rectangle Shape, centred on the origin, in the XY plane. */
export function roundedRectShape(halfX, halfZ, radius, segments = 6) {
  const r = Math.min(radius, Math.min(halfX, halfZ) * 0.98);
  const s = new THREE.Shape();
  s.moveTo(-halfX + r, -halfZ);
  s.lineTo(halfX - r, -halfZ);
  s.absarc(halfX - r, -halfZ + r, r, -Math.PI / 2, 0, false);
  s.lineTo(halfX, halfZ - r);
  s.absarc(halfX - r, halfZ - r, r, 0, Math.PI / 2, false);
  s.lineTo(-halfX + r, halfZ);
  s.absarc(-halfX + r, halfZ - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-halfX, -halfZ + r);
  s.absarc(-halfX + r, -halfZ + r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  s.curveSegments = segments;
  return s;
}

/** An annulus Shape with a hole — used for the Ring Deck and the canal. */
export function annulusShape(inner, outer, segments = 72) {
  const s = new THREE.Shape();
  s.absarc(0, 0, outer, 0, TAU, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, TAU, true);
  s.holes.push(hole);
  s.curveSegments = segments;
  return s;
}

/** A pointed-arch profile (Venetian barrel vaults, D.1). */
export function archShape(width, springHeight, riseHeight, thickness) {
  const hw = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw - thickness, 0);
  s.lineTo(-hw - thickness, springHeight);
  s.quadraticCurveTo(-hw - thickness, springHeight + riseHeight + thickness, 0, springHeight + riseHeight + thickness);
  s.quadraticCurveTo(hw + thickness, springHeight + riseHeight + thickness, hw + thickness, springHeight);
  s.lineTo(hw + thickness, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, springHeight);
  s.quadraticCurveTo(hw, springHeight + riseHeight, 0, springHeight + riseHeight);
  s.quadraticCurveTo(-hw, springHeight + riseHeight, -hw, springHeight);
  s.lineTo(-hw, 0);
  s.closePath();
  s.curveSegments = 12;
  return s;
}

/** Extrude a Shape along Z, then lay it flat so the extrusion runs along Y. */
export function extrudeVertical(shape, height, opts = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: false, curveSegments: opts.curveSegments || 10, steps: opts.steps || 1
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Lofted volumes                                                      */
/* ------------------------------------------------------------------ */

/**
 * Loft a closed plan outline up through a series of heights, where the plan
 * at each level is produced by `profile(t)` returning an array of [x, z].
 * This is how the tower's tapering shaft, the sail skin and the lattice
 * spire are all generated from one routine.
 *
 * @param {(t:number, y:number)=>Array<[number,number]>} profile
 * @param {number[]} heights ascending world Y values
 * @param {object} opts { capTop, capBottom, uvScale }
 */
export function loft(profile, heights, { capTop = true, capBottom = false, uvScale = 0.06, closed = true } = {}) {
  // uvScale may be a single number or [uScale, vScale].
  const uScale = Array.isArray(uvScale) ? uvScale[0] : uvScale;
  const vScale = Array.isArray(uvScale) ? uvScale[1] : uvScale;
  const rings = heights.map((y, i) => profile(heights.length === 1 ? 0 : i / (heights.length - 1), y));
  const n = rings[0].length;
  const rows = rings.length;

  const positions = [];
  const uvs = [];
  const indices = [];

  // Accumulated perimeter distance for a stable U coordinate.
  const perim = [];
  {
    let acc = 0;
    const r0 = rings[0];
    for (let i = 0; i < n; i++) {
      perim.push(acc);
      const a = r0[i], b = r0[(i + 1) % n];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    perim.push(acc);
  }

  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    for (let i = 0; i <= n; i++) {
      const p = ring[i % n];
      positions.push(p[0], heights[r], p[1]);
      uvs.push(perim[i] * uScale, heights[r] * vScale);
    }
  }

  const stride = n + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * stride + i;
      const b = a + 1;
      const c = (r + 1) * stride + i;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();

  const parts = [g];
  if (capTop) parts.push(capRing(rings[rows - 1], heights[rows - 1], 1));
  if (capBottom) parts.push(capRing(rings[0], heights[0], -1));
  return parts.length > 1 ? mergeGeometries(parts) : g;
}

/** Triangle-fan cap for a lofted ring (convex plans only — all ours are). */
function capRing(ring, y, dir) {
  const n = ring.length;
  let cx = 0, cz = 0;
  for (const p of ring) { cx += p[0]; cz += p[1]; }
  cx /= n; cz /= n;

  const positions = [cx, y, cz];
  const uvs = [0.5, 0.5];
  let maxR = 1e-6;
  for (const p of ring) maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cz));
  for (const p of ring) {
    positions.push(p[0], y, p[1]);
    uvs.push(0.5 + (p[0] - cx) / (2 * maxR), 0.5 + (p[1] - cz) / (2 * maxR));
  }
  const indices = [];
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    if (dir > 0) indices.push(0, a, b); else indices.push(0, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Sample a rounded-rectangle plan as [x,z] pairs — the tower's shaft. */
export function roundedRectRing(halfX, halfZ, radius, count = 40) {
  const pts = [];
  const r = Math.min(radius, Math.min(halfX, halfZ) * 0.95);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    // Superellipse-style rounding gives a clean, controllable corner.
    const c = Math.cos(t), s = Math.sin(t);
    const n = 2 + 6 * (1 - clamp(r / Math.min(halfX, halfZ), 0, 1));
    const k = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
    pts.push([c * k * halfX, s * k * halfZ]);
  }
  return pts;
}

/** Sample a circular plan. */
export function circleRing(radius, count = 56, cx = 0, cz = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    pts.push([cx + Math.cos(t) * radius, cz + Math.sin(t) * radius]);
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* Structural members                                                  */
/* ------------------------------------------------------------------ */

/** A straight structural member between two points, as a box section. */
export function member(a, b, width, depth = width) {
  const va = new THREE.Vector3().fromArray(a);
  const vb = new THREE.Vector3().fromArray(b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  if (len < 1e-5) return null;
  const g = new THREE.BoxGeometry(width, len, depth);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
  return xform(g, { pos: mid.toArray(), quat: q });
}

/** A cylindrical member (cables, tubes, handrails). */
export function tube(a, b, radius, seg = 6) {
  const va = new THREE.Vector3().fromArray(a);
  const vb = new THREE.Vector3().fromArray(b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  if (len < 1e-5) return null;
  const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
  return xform(g, { pos: mid.toArray(), quat: q });
}

/**
 * A circular perimeter truss: top and bottom chords plus zig-zag webs.
 * Used for the Ring Deck's perimeter truss ring (Section C, zone 3).
 */
export function circularTruss(radius, yTop, yBottom, bays, chord = 0.55, web = 0.34) {
  const parts = [];
  for (let i = 0; i < bays; i++) {
    const t0 = (i / bays) * TAU, t1 = ((i + 1) / bays) * TAU;
    const p = (t, y, r = radius) => [Math.cos(t) * r, y, Math.sin(t) * r];
    parts.push(member(p(t0, yTop), p(t1, yTop), chord));
    parts.push(member(p(t0, yBottom), p(t1, yBottom), chord));
    parts.push(member(p(t0, yTop), p(t0, yBottom), chord * 0.9));
    parts.push(member(p(t0, yTop), p(t1, yBottom), web));
    parts.push(member(p(t0, yBottom), p(t1, yTop), web));
  }
  return mergeGeometries(parts.filter(Boolean));
}

/**
 * A diagrid shell: crossing helical members wrapped around a lofted plan.
 * This is the Sail Atrium's steel exoskeleton (Section C, zone 2).
 */
export function diagrid(profileFn, yBottom, yTop, bays, courses, thickness) {
  const parts = [];
  const dy = (yTop - yBottom) / courses;
  for (let c = 0; c < courses; c++) {
    const y0 = yBottom + c * dy, y1 = y0 + dy;
    const t0 = (y0 - yBottom) / (yTop - yBottom);
    const t1 = (y1 - yBottom) / (yTop - yBottom);
    const r0 = profileFn(t0, y0);
    const r1 = profileFn(t1, y1);
    const n = r0.length;
    for (let i = 0; i < n; i++) {
      const a = [r0[i][0], y0, r0[i][1]];
      const bR = [r1[(i + 1) % n][0], y1, r1[(i + 1) % n][1]];
      const bL = [r1[(i - 1 + n) % n][0], y1, r1[(i - 1 + n) % n][1]];
      const m1 = member(a, bR, thickness);
      const m2 = member(a, bL, thickness);
      if (m1) parts.push(m1);
      if (m2) parts.push(m2);
    }
    // Horizontal ring beam at every second course.
    if (c % 2 === 0) {
      for (let i = 0; i < n; i++) {
        const m = member([r0[i][0], y0, r0[i][1]], [r0[(i + 1) % n][0], y0, r0[(i + 1) % n][1]], thickness * 0.75);
        if (m) parts.push(m);
      }
    }
  }
  return mergeGeometries(parts.filter(Boolean));
}

/** A balustrade: posts plus a top rail, following a list of [x,y,z] points. */
export function balustrade(points, height = 1.05, postEvery = 2, postR = 0.045, railR = 0.055) {
  const parts = [];
  for (let i = 0; i < points.length; i++) {
    if (i % postEvery === 0) {
      const p = points[i];
      const t = tube(p, [p[0], p[1] + height, p[2]], postR, 5);
      if (t) parts.push(t);
    }
    if (i < points.length - 1) {
      const a = points[i], b = points[i + 1];
      const r = tube([a[0], a[1] + height, a[2]], [b[0], b[1] + height, b[2]], railR, 5);
      if (r) parts.push(r);
      const r2 = tube([a[0], a[1] + height * 0.45, a[2]], [b[0], b[1] + height * 0.45, b[2]], railR * 0.55, 5);
      if (r2) parts.push(r2);
    }
  }
  return mergeGeometries(parts.filter(Boolean));
}

/** Glass balustrade panels along a path (Sail Atrium stair, Halo Walkway). */
export function glassBalustrade(points, height = 1.15) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len < 1e-4) continue;
    const g = new THREE.PlaneGeometry(len, height);
    const ang = Math.atan2(b[0] - a[0], b[2] - a[2]);
    xform(g, {
      pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + height / 2, (a[2] + b[2]) / 2],
      rot: [0, ang + Math.PI / 2, 0]
    });
    parts.push(g);
  }
  return mergeGeometries(parts.filter(Boolean));
}

/**
 * A helical stair: treads plus a central newel. Used for the Leaning
 * Observatory's spiral marble stair (D.5) and the spire's lattice stair (D.4).
 */
export function spiralStair(rInner, rOuter, yBottom, yTop, turns, stepsPerTurn = 18, treadT = 0.14) {
  const parts = [];
  const total = Math.round(turns * stepsPerTurn);
  const dy = (yTop - yBottom) / total;
  const dt = (turns * TAU) / total;
  for (let i = 0; i < total; i++) {
    const t = i * dt;
    const y = yBottom + i * dy;
    const w = rOuter - rInner;
    const g = new THREE.BoxGeometry(w, treadT, (rInner + rOuter) * dt * 0.92);
    xform(g, { pos: [Math.cos(t) * (rInner + w / 2), y, Math.sin(t) * (rInner + w / 2)], rot: [0, -t, 0] });
    parts.push(g);
  }
  const newel = new THREE.CylinderGeometry(rInner * 0.72, rInner * 0.72, yTop - yBottom, 14);
  xform(newel, { pos: [0, (yTop + yBottom) / 2, 0] });
  parts.push(newel);
  return mergeGeometries(parts);
}

/** A straight run of stairs between two heights. */
export function stairRun(width, yBottom, yTop, length, steps = 16) {
  const parts = [];
  const dy = (yTop - yBottom) / steps;
  const dz = length / steps;
  for (let i = 0; i < steps; i++) {
    parts.push(box(width, dy, dz, [0, yBottom + dy * (i + 0.5), -length / 2 + dz * (i + 0.5)]));
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ */
/* Repetition helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build an InstancedMesh from a geometry and a list of transforms.
 * @param {Array<{pos:number[],rot?:number[],scale?:number|number[],quat?:THREE.Quaternion}>} xs
 */
export function instance(geo, mat, xs, { castShadow = false, receiveShadow = false, name = '' } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, xs.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    v.set(x.pos[0], x.pos[1], x.pos[2]);
    if (x.quat) q.copy(x.quat);
    else { e.set(x.rot ? x.rot[0] : 0, x.rot ? x.rot[1] : 0, x.rot ? x.rot[2] : 0); q.setFromEuler(e); }
    const sc = x.scale === undefined ? 1 : x.scale;
    if (Array.isArray(sc)) s.set(sc[0], sc[1], sc[2]); else s.setScalar(sc);
    mtx.compose(v, q, s);
    m.setMatrixAt(i, mtx);
  }
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  m.name = name;
  m.computeBoundingSphere();
  return m;
}

/** Quick mesh helper that keeps naming and shadow flags consistent. */
export function mesh(geo, mat, { name = '', cast = false, receive = false, pos, rot, renderOrder } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  if (renderOrder !== undefined) m.renderOrder = renderOrder;
  return m;
}

/** A low-poly deciduous tree, wind-swayable via its aSway attribute. */
export function tree(seed = 1, scale = 1) {
  const r = rng(seed);
  const h = (5.5 + r() * 3.5) * scale;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14 * scale, 0.28 * scale, h * 0.52, 6);
  xform(trunk, { pos: [0, h * 0.26, 0] });
  parts.push(trunk);
  const blobs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const rad = (1.5 + r() * 1.5) * scale;
    const g = new THREE.IcosahedronGeometry(rad, 0);
    xform(g, {
      pos: [(r() - 0.5) * 2.4 * scale, h * (0.56 + r() * 0.4), (r() - 0.5) * 2.4 * scale],
      scale: [1, 0.82, 1]
    });
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  // Sway weight rises with height so the trunk stays planted.
  const pos = merged.attributes.position;
  const sway = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) sway[i] = clamp((pos.getY(i) / h - 0.28) / 0.72, 0, 1) * 0.55;
  merged.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  return merged;
}

/** A pennant flag on a pole — the topping-out moment and plaza dressing. */
export function flag(poleHeight = 8, cloth = 2.4) {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.07, 0.09, poleHeight, 7);
  xform(pole, { pos: [0, poleHeight / 2, 0] });
  parts.push(pole);
  const g = new THREE.PlaneGeometry(cloth, cloth * 0.62, 8, 4);
  xform(g, { pos: [cloth / 2, poleHeight - cloth * 0.45, 0] });
  parts.push(g);
  const merged = mergeGeometries(parts);
  const pos = merged.attributes.position;
  const sway = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    sway[i] = x > 0.02 ? clamp(x / cloth, 0, 1) * 1.4 : 0;
  }
  merged.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  return merged;
}

/* ------------------------------------------------------------------ */
/* Parametric surfaces                                                 */
/* ------------------------------------------------------------------ */

/**
 * A parametric grid surface. `fn(u, v, out)` writes a world position into
 * `out` for u,v in [0,1]. Used for the Sail Atrium's doubly-curved skin,
 * the Motorsport Pavilion's aerodynamic shell and the promenade's barrel
 * vault — shapes a loft of closed rings cannot express.
 */
export function surfaceGrid(fn, nu, nv, { flip = false, uvScale = [1, 1] } = {}) {
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const out = new THREE.Vector3();
  let k = 0, j = 0;
  for (let iv = 0; iv <= nv; iv++) {
    for (let iu = 0; iu <= nu; iu++) {
      fn(iu / nu, iv / nv, out);
      positions[k++] = out.x; positions[k++] = out.y; positions[k++] = out.z;
      uvs[j++] = (iu / nu) * uvScale[0];
      uvs[j++] = (iv / nv) * uvScale[1];
    }
  }
  const indices = [];
  const stride = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * stride + iu, b = a + 1, c = a + stride, d = c + 1;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Give a surface thickness by offsetting it along its own normals and
 * stitching the border — turns the sail skin and shell roofs into solids.
 */
export function thicken(geo, thickness) {
  const src = geo.clone();
  const back = geo.clone();
  const pos = back.attributes.position;
  const nor = back.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) - nor.getX(i) * thickness,
      pos.getY(i) - nor.getY(i) * thickness,
      pos.getZ(i) - nor.getZ(i) * thickness);
  }
  const idx = back.index.array.slice();
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  back.setIndex(new THREE.BufferAttribute(idx, 1));
  back.computeVertexNormals();
  return mergeGeometries([src, back]);
}

/**
 * An extruded profile swept along a 3-D curve — the canal's arched vaults
 * and the promenade's ribs (D.1 modelling note: "reuse one extruded arch
 * profile along a spline for all vaults").
 */
export function sweep(shape, curve, steps = 24) {
  return new THREE.ExtrudeGeometry(shape, {
    steps, bevelEnabled: false, extrudePath: curve, curveSegments: 8
  });
}

/** A water plane with enough tessellation for a vertex ripple. */
export function waterPlane(width, depth, seg = 48) {
  const g = new THREE.PlaneGeometry(width, depth, seg, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** An annular water surface (the canal ring). */
export function waterAnnulus(inner, outer, seg = 96, rings = 4) {
  const g = new THREE.RingGeometry(inner, outer, seg, rings);
  g.rotateX(-Math.PI / 2);
  // RingGeometry's UVs are centred; remap to something tileable.
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) * 0.02, pos.getZ(i) * 0.02);
  }
  return g;
}
