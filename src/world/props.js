import * as THREE from 'three';
import { makeRng, hash2i } from '../engine/noise.js';
import { soundscape } from '../engine/audio.js';

/**
 * Shared world-building toolkit + small living props.
 *
 *  - GeoBuilder: merges thousands of boxes/cylinders/quads (with per-vertex
 *    colour and metre-scaled UVs) into ONE geometry, and records part
 *    boundaries so a merged mesh can be "built" progressively with
 *    setDrawRange — the trick every construction phase in the airfield uses.
 *  - WorldMaterials: procedural fallback material library (canvas textures),
 *    same member names as the engine MaterialLibrary, used when it is absent.
 *  - LightField: instanced point-sprite lights (runway, approach, PAPI,
 *    taxiway, street, aviation obstacle) — bloom-friendly, one draw call each.
 *  - Vegetation (date palm, neem, kikar, scrub), DustPuffs, BirdFlock.
 */

/* ================================================================ geometry */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const UNIT = new Map();

function unitGeo(key, make) {
  let g = UNIT.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    UNIT.set(key, g);
  }
  return g;
}

/** Give a plain geometry an all-white colour attribute (for vertex-coloured materials + instanceColor). */
export function whiteColors(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

export function unitBox() { return unitGeo('box', () => new THREE.BoxGeometry(1, 1, 1)); }
export function unitCyl(seg = 10, taper = 1) {
  return unitGeo(`cyl${seg}_${taper}`, () => new THREE.CylinderGeometry(taper * 0.5, 0.5, 1, seg, 1));
}

/** Accumulates triangles into one non-indexed geometry with colour + metre UVs. */
export class GeoBuilder {
  constructor({ worldUV = true } = {}) {
    this.p = [];
    this.n = [];
    this.c = [];
    this.u = [];
    this.worldUV = worldUV;
    this.marks = [];
  }

  get vertexCount() { return this.p.length / 3; }

  /** Close the current "part" (for progressive reveal). */
  mark() { this.marks.push(this.vertexCount); return this.marks.length; }

  add(geo, matrix, color = 0xffffff) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const U = g.attributes.uv;
    _nm.getNormalMatrix(matrix);
    if (color && color.isColor) _c.copy(color); else _c.set(color);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      const x = _v.x; const y = _v.y; const z = _v.z;
      this.p.push(x, y, z);
      let nx = 0; let ny = 1; let nz = 0;
      if (N) {
        _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        nx = _v.x; ny = _v.y; nz = _v.z;
      }
      this.n.push(nx, ny, nz);
      if (this.worldUV) {
        const ax = Math.abs(nx); const ay = Math.abs(ny); const az = Math.abs(nz);
        if (ay >= ax && ay >= az) this.u.push(x, z);
        else if (ax >= az) this.u.push(z, y);
        else this.u.push(x, y);
      } else if (U) this.u.push(U.getX(i), U.getY(i));
      else this.u.push(0, 0);
      this.c.push(_c.r, _c.g, _c.b);
    }
    if (g !== geo) g.dispose();
    return this;
  }

  /** Box with its BASE at y. Optional yaw. */
  box(w, h, d, x, y, z, color, ry = 0) {
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y + h / 2, z), _q, _s.set(w, h, d));
    return this.add(unitBox(), _m, color);
  }

  /** Box with full rotation (rx, ry, rz) centred at (x,y,z). */
  boxR(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(w, h, d));
    return this.add(unitBox(), _m, color);
  }

  /** Box spanning two points (beam / brace), cross-section w x w. */
  beam(ax, ay, az, bx, by, bz, w, color) {
    const dx = bx - ax; const dy = by - ay; const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return this;
    _v.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(w, len, w));
    return this.add(unitBox(), _m, color);
  }

  /** Vertical cylinder, base at y. taper = top radius / bottom radius. */
  cyl(r, h, x, y, z, color, seg = 10, taper = 1) {
    _m.compose(_p.set(x, y + h / 2, z), _q.identity(), _s.set(r * 2, h, r * 2));
    return this.add(unitCyl(seg, taper), _m, color);
  }

  /** Horizontal cylinder along X (rz) or Z. */
  cylH(r, len, x, y, z, color, axis = 'x', seg = 10) {
    _e.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(r * 2, len, r * 2));
    return this.add(unitCyl(seg, 1), _m, color);
  }

  /** Flat horizontal quad (top face only) x0..x1, z0..z1 at height y. */
  quad(x0, z0, x1, z1, y, color) {
    const c = color && color.isColor ? color : _c.set(color === undefined ? 0xffffff : color);
    const r = c.r; const g = c.g; const b = c.b;
    this.p.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let i = 0; i < 6; i++) { this.n.push(0, 1, 0); this.c.push(r, g, b); }
    this.u.push(x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0);
    return this;
  }

  /** Flat quad from 4 arbitrary corners (counter-clockwise seen from above: a,b,c,d). */
  quad4(a, b, c2, d, y, color) {
    _c.set(color === undefined ? 0xffffff : color);
    // Auto-orient so the face points up (front face from above).
    if ((b[1] - a[1]) * (c2[0] - a[0]) - (b[0] - a[0]) * (c2[1] - a[1]) < 0) { const t = b; b = d; d = t; }
    const pts = [a, b, c2, a, c2, d];
    for (const q of pts) { this.p.push(q[0], y, q[1]); this.n.push(0, 1, 0); this.c.push(_c.r, _c.g, _c.b); this.u.push(q[0], q[1]); }
    return this;
  }

  /** Quad from 4 corners [x,y,z] (a,b,c,d counter-clockwise from above), normal up. */
  quad3(a, b, c2, d, color) {
    _c.set(color === undefined ? 0xffffff : color);
    if ((b[2] - a[2]) * (c2[0] - a[0]) - (b[0] - a[0]) * (c2[2] - a[2]) < 0) { const t = b; b = d; d = t; }
    for (const q of [a, b, c2, a, c2, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(0, 1, 0); this.c.push(_c.r, _c.g, _c.b); this.u.push(q[0], q[2]); }
    return this;
  }

  /** A flat strip (ribbon) following a polyline of [x,z] points. */
  ribbon(points, width, y, color) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const dx = bx - ax; const dz = bz - az;
      const L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * width / 2; const nz = (dx / L) * width / 2;
      this.quad4([ax - nx, az - nz], [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], y, color);
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.p.length === 0) {
      g.boundingBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    } else {
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
    return g;
  }
}

/**
 * A merged mesh revealed part by part. Parts are whatever the builder marked,
 * in the order they were added (sort spatially before adding).
 */
export class ProgressiveMesh {
  constructor(builder, material, { shadows = true, receive = true, name = '' } = {}) {
    if (builder.marks.length === 0 || builder.marks[builder.marks.length - 1] !== builder.vertexCount) builder.mark();
    this.marks = builder.marks.slice();
    this.geometry = builder.build();
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = receive;
    this.mesh.name = name;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.progress = -1;
    this.setProgress(1);
  }

  setProgress(p) {
    p = Math.max(0, Math.min(1, p || 0));
    if (p === this.progress) return;
    this.progress = p;
    const n = this.marks.length;
    const k = Math.round(p * n);
    const count = k <= 0 ? 0 : this.marks[k - 1];
    this.geometry.setDrawRange(0, count);
    this.mesh.visible = count > 0;
  }

  dispose() { this.geometry.dispose(); }
}

/** Instanced mesh helper: give it matrices + colours, reveal by count. */
export class InstancedSet {
  constructor(geometry, material, items, { shadows = true, receive = true, name = '' } = {}) {
    this.geometry = geometry;
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    this.mesh.name = name;
    this.total = items.length;
    const col = new THREE.Color();
    let hasColor = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
      _q.setFromEuler(_e);
      const sc = it.s === undefined ? 1 : it.s;
      _s.set(it.sx === undefined ? sc : it.sx, it.sy === undefined ? sc : it.sy, it.sz === undefined ? sc : it.sz);
      _m.compose(_p.set(it.x, it.y || 0, it.z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      if (it.color !== undefined) {
        hasColor = true;
        this.mesh.setColorAt(i, col.set(it.color));
      }
    }
    if (hasColor && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = receive;
    this.mesh.count = items.length;
    this.mesh.visible = items.length > 0;
    this.mesh.computeBoundingSphere();
    this.progress = 1;
  }

  setProgress(p) {
    p = Math.max(0, Math.min(1, p || 0));
    this.progress = p;
    const n = Math.round(this.total * p);
    this.mesh.count = n;
    this.mesh.visible = n > 0;
  }

  /** Reveal from the END of the list backwards (removal: count shrinks). */
  setRemaining(p) { this.setProgress(p); }

  dispose() { this.geometry.dispose(); }
}

/* ========================================================== textures/noise */

/** Tileable value noise (period in lattice cells). */
function tnoise(x, y, period, seed) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const w = (a, b) => hash2i(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = w(xi, yi); const b = w(xi + 1, yi); const c = w(xi, yi + 1); const d = w(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function tileFbm(x, y, period, octaves, seed) {
  let s = 0; let amp = 1; let norm = 0; let f = 1;
  for (let i = 0; i < octaves; i++) {
    s += tnoise(x * f, y * f, period * f, seed + i * 31) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

export function canvasTexture(size, draw, { srgb = true, repeat = 1, mips = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mips;
  tex.anisotropy = 4;
  return tex;
}

/** Fill a canvas with tileable fbm-modulated colour. fn(n, x, y) → [r,g,b] 0..255 */
function noiseFill(ctx, size, period, octaves, seed, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const sc = period / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileFbm(x * sc, y * sc, period, octaves, seed);
      const rgb = fn(n, x, y);
      const i = (y * size + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = rgb.length > 3 ? rgb[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* =============================================================== materials */

/**
 * Procedural fallback material library. Member names match the engine's
 * MaterialLibrary so World can merge the two (engine members win).
 * All map UVs are in metres; `tile` = metres per texture repeat.
 */
export class WorldMaterials {
  constructor(quality) {
    const tier = quality && quality.tier ? quality.tier : 'medium';
    const S = tier === 'low' ? 128 : tier === 'medium' ? 256 : 256;
    this._list = [];
    this._textures = [];
    const tex = (size, draw, tile, opts) => {
      const t = canvasTexture(size, draw, opts);
      t.repeat.set(1 / tile, 1 / tile);
      this._textures.push(t);
      return t;
    };
    const std = (o) => { const m = new THREE.MeshStandardMaterial(o); this._list.push(m); return m; };

    const asphalt = (base, spread, seed, cracks) => (ctx, size) => {
      const rng = makeRng(seed);
      noiseFill(ctx, size, 8, 4, seed, (n, x, y) => {
        const g = hash2i(x, y, seed) < 0.06 ? (hash2i(x, y, seed + 1) - 0.5) * 70 : 0;
        const v = base + (n - 0.5) * spread + g;
        return [clamp255(v), clamp255(v), clamp255(v + 3)];
      });
      if (cracks) {
        ctx.strokeStyle = 'rgba(20,20,22,0.55)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          ctx.beginPath();
          let x = rng() * size; let y = rng() * size;
          ctx.moveTo(x, y);
          for (let k = 0; k < 9; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.3) * 24; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
    };
    this.asphaltOld = std({ map: tex(S, asphalt(112, 46, 11, true), 9), roughness: 0.93, color: 0xffffff });
    this.asphaltNew = std({ map: tex(S, asphalt(44, 26, 12, false), 6), roughness: 0.82, color: 0xffffff });

    const concrete = (base, joint, seed, slabs) => (ctx, size) => {
      noiseFill(ctx, size, 6, 4, seed, (n, x, y) => {
        const s = hash2i(x, y, seed) < 0.03 ? -18 : 0;
        const v = base + (n - 0.5) * 16 + s * 0.5;
        return [clamp255(v + 4), clamp255(v + 2), clamp255(v - 3)];
      });
      ctx.strokeStyle = joint;
      ctx.lineWidth = Math.max(1, size / 200);
      const step = size / slabs;
      for (let i = 0; i <= slabs; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
      }
    };
    this.concrete = std({ map: tex(S, concrete(178, 'rgba(90,88,84,0.25)', 21, 1), 4), roughness: 0.9 });
    this.concreteApron = std({ map: tex(S, concrete(200, 'rgba(90,88,84,0.45)', 22, 2), 15), roughness: 0.86 });

    this.sand = std({
      map: tex(S, (ctx, size) => noiseFill(ctx, size, 16, 5, 31, (n, x, y) => {
        const g = (hash2i(x, y, 3) - 0.5) * 22;
        return [clamp255(196 + (n - 0.5) * 60 + g), clamp255(168 + (n - 0.5) * 52 + g), clamp255(122 + (n - 0.5) * 44 + g)];
      }), 7),
      roughness: 1,
    });
    const soil = (r, g, b, seed, stripes) => (ctx, size) => noiseFill(ctx, size, 8, 4, seed, (n, x, y) => {
      const s = stripes ? Math.sin(x * 0.35) * 8 : 0;
      const gr = (hash2i(x, y, seed) - 0.5) * 26;
      return [clamp255(r + (n - 0.5) * 50 + gr + s), clamp255(g + (n - 0.5) * 42 + gr + s), clamp255(b + (n - 0.5) * 34 + gr + s)];
    });
    this.soilCut = std({ map: tex(S, soil(150, 104, 70, 41, false), 8), roughness: 1 });
    this.soilFill = std({ map: tex(S, soil(190, 160, 112, 42, true), 6), roughness: 1 });
    this.gravelSubbase = std({ map: tex(S, (ctx, size) => noiseFill(ctx, size, 32, 3, 43, (n, x, y) => {
      const h = hash2i(x >> 1, y >> 1, 43);
      const v = 150 + (h - 0.5) * 90 + (n - 0.5) * 30;
      return [clamp255(v + 8), clamp255(v + 2), clamp255(v - 8)];
    }), 3), roughness: 1 });
    this.crushedBase = std({ map: tex(S, (ctx, size) => noiseFill(ctx, size, 32, 3, 44, (n, x, y) => {
      const h = hash2i(x, y, 44);
      const v = 120 + (h - 0.5) * 70 + (n - 0.5) * 24;
      return [clamp255(v), clamp255(v), clamp255(v + 2)];
    }), 3), roughness: 0.98 });
    this.dryGrass = std({ map: tex(S, soil(150, 140, 86, 45, false), 5), roughness: 1 });

    this.markingWhite = std({ color: 0xf2f2ec, roughness: 0.7 });
    this.markingYellow = std({ color: 0xf2b418, roughness: 0.7 });

    this.glass = std({ color: 0x3e5f72, metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.62, envMapIntensity: 1.2 });
    this.roofMetal = std({
      map: tex(S, (ctx, size) => {
        ctx.fillStyle = '#c9ccd0'; ctx.fillRect(0, 0, size, size);
        for (let x = 0; x < size; x += size / 16) {
          const g = ctx.createLinearGradient(x, 0, x + size / 16, 0);
          g.addColorStop(0, '#aeb2b8'); g.addColorStop(0.5, '#e2e4e6'); g.addColorStop(1, '#a6aab0');
          ctx.fillStyle = g; ctx.fillRect(x, 0, size / 16, size);
        }
      }, 6),
      metalness: 0.25, roughness: 0.45, color: 0xf4efe6,
    });
    this.tile = std({
      map: tex(S, (ctx, size) => {
        noiseFill(ctx, size, 4, 3, 51, (n, x, y) => {
          const sp = hash2i(x, y, 52) < 0.08 ? 22 : 0;
          const v = 214 + (n - 0.5) * 18 + sp;
          return [clamp255(v), clamp255(v - 6), clamp255(v - 16)];
        });
        ctx.strokeStyle = 'rgba(120,110,96,0.6)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(i * size / 2, 0); ctx.lineTo(i * size / 2, size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * size / 2); ctx.lineTo(size, i * size / 2); ctx.stroke();
        }
      }, 2.4),
      roughness: 0.22, metalness: 0.0,
    });
    this.plaster = std({ map: tex(S, (ctx, size) => noiseFill(ctx, size, 8, 4, 61, (n) => {
      const v = 226 + (n - 0.5) * 26;
      return [clamp255(v), clamp255(v - 5), clamp255(v - 14)];
    }), 5), roughness: 0.92 });

    // Ajrak: block-printed crimson/indigo field with white star-rosette motifs,
    // pierced (alphaTest) so it reads as a perforated sun screen.
    this.ajrakTexture = tex(256, (ctx, size) => {
      ctx.fillStyle = '#7d1325'; ctx.fillRect(0, 0, size, size);
      const cell = size / 4;
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const cx = i * cell + cell / 2; const cy = j * cell + cell / 2;
          ctx.fillStyle = (i + j) % 2 ? '#1f2a6e' : '#7d1325';
          ctx.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
          ctx.save(); ctx.translate(cx, cy);
          ctx.fillStyle = '#f3ead8';
          for (let k = 0; k < 8; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cell * 0.12, cell * 0.2); ctx.lineTo(0, cell * 0.42); ctx.lineTo(-cell * 0.12, cell * 0.2); ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, cell * 0.1, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          // pierced holes between motifs
          ctx.clearRect(i * cell - 4, j * cell - 4, 8, 8);
        }
      }
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, size - 2, size - 2);
    }, 3.2);
    this.ajrakScreen = std({ map: this.ajrakTexture, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.65 });

    // Vertex-coloured workhorses: most merged structures use these two.
    this.paint = std({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
    this.paintMetal = std({ vertexColors: true, roughness: 0.42, metalness: 0.55 });
    this.paintMap = std({ vertexColors: true, map: this.concrete.map, roughness: 0.88 });
    this._painted = new Map();
    this._emissive = new Map();
    this.wetness = 0;
    this._wettable = [this.asphaltOld, this.asphaltNew, this.concrete, this.concreteApron, this.tile, this.paintMap];
    this._dryRough = this._wettable.map((m) => m.roughness);
  }

  paintedSteel(c = 0xc8c8c8) {
    const key = String(c);
    let m = this._painted.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.45 }); this._painted.set(key, m); this._list.push(m); }
    return m;
  }

  emissive(c = 0xffffff, i = 2) {
    const key = `${c}:${i}`;
    let m = this._emissive.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) }); m.toneMapped = false; this._emissive.set(key, m); this._list.push(m); }
    return m;
  }

  setWetness(w) {
    this.wetness = w;
    this._wettable.forEach((m, i) => { m.roughness = this._dryRough[i] * (1 - 0.6 * w); });
  }

  dispose() {
    for (const m of this._list) m.dispose();
    for (const t of this._textures) t.dispose();
  }
}

/** Clone a material with polygon offset so coplanar layers stack cleanly at any distance. */
export function layered(material, level, cache) {
  const key = `${material.uuid}:${level}`;
  if (cache && cache.has(key)) return cache.get(key);
  const m = material.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -0.25 * level;
  m.polygonOffsetUnits = -3 * level;
  if (cache) cache.set(key, m);
  return m;
}

/* ============================================================= LightField */

const LIGHT_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aSize;
  attribute float aPhase;
  attribute float aMode;
  uniform float uTime;
  uniform float uScale;
  uniform float uMinPx;
  uniform float uMaxPx;
  varying vec3 vColor;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Lift the sprite towards the eye so polygon-offset pavements never occlude it.
    vec3 toEye = cameraPosition - wp.xyz;
    float dist = length(toEye);
    vec4 lp = vec4(wp.xyz + toEye / max(dist, 1e-3) * min(dist * 0.5, 0.8 + dist * 0.006), 1.0);
    vec4 mv = viewMatrix * lp;
    float d = max(1.0, dist);
    float px = clamp(aSize * uScale / d, uMinPx, uMaxPx);
    float a = 1.0;
    vec3 col = color;
    if (aMode > 0.5 && aMode < 1.5) {           // sequenced strobe (rabbit)
      float t = fract(uTime * 2.0 - aPhase);
      a = smoothstep(0.0, 0.015, t) * (1.0 - smoothstep(0.03, 0.10, t)) * 2.2;
      px *= 1.6;
    } else if (aMode > 1.5 && aMode < 2.5) {    // slow beacon / obstruction flash
      a = 0.2 + 0.8 * step(0.55, fract(uTime * 0.75 + aPhase));
    } else if (aMode > 2.5 && aMode < 3.5) {    // PAPI: red below the unit's angle, white above
      vec3 dv = cameraPosition - wp.xyz;
      float elev = atan(dv.y, length(dv.xz));
      col = elev > aPhase ? vec3(5.0, 4.6, 4.2) : vec3(5.0, 0.35, 0.25);
    } else if (aMode > 3.5) {                   // flicker-free moving (cars): phase drives along-path offset in CPU
      a = 1.0;
    }
    vColor = col * a;
    gl_PointSize = px;
    gl_Position = projectionMatrix * mv;
  }
`;
const LIGHT_FRAG = /* glsl */ `
  uniform float uIntensity;
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float core = 1.0 - smoothstep(0.25, 0.6, r);
    float halo = exp(-r * r * 3.0) * 0.45;
    float a = (core + halo) * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

/**
 * Point-sprite light field. add(x,y,z, color, size, mode, phase) then
 * finalize(). Lights are revealed in insertion order with setProgress(p).
 */
export class LightField {
  constructor(name = 'lights', { minPx = 1.6, maxPx = 40 } = {}) {
    minPx = Math.max(2.4, minPx * 1.5);
    this.name = name;
    this.data = [];
    this.minPx = minPx;
    this.maxPx = maxPx;
    this.points = null;
    this.intensity = 1;
  }

  add(x, y, z, color, size = 0.6, mode = 0, phase = 0) {
    const c = new THREE.Color(color);
    this.data.push(x, y, z, c.r, c.g, c.b, size, mode, phase);
    return this;
  }

  get count() { return this.data.length / 9; }

  finalize(scene) {
    const n = this.count;
    const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
    const size = new Float32Array(n); const mode = new Float32Array(n); const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      pos[i * 3] = this.data[o]; pos[i * 3 + 1] = this.data[o + 1]; pos[i * 3 + 2] = this.data[o + 2];
      col[i * 3] = this.data[o + 3]; col[i * 3 + 1] = this.data[o + 4]; col[i * 3 + 2] = this.data[o + 5];
      size[i] = this.data[o + 6]; mode[i] = this.data[o + 7]; phase[i] = this.data[o + 8];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aMode', new THREE.BufferAttribute(mode, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    if (n) g.computeBoundingSphere(); else g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT,
      fragmentShader: LIGHT_FRAG,
      uniforms: {
        uTime: { value: 0 }, uScale: { value: 800 }, uMinPx: { value: this.minPx }, uMaxPx: { value: this.maxPx },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geometry = g;
    this.points = new THREE.Points(g, this.material);
    this.points.name = this.name;
    this.points.frustumCulled = n > 0;
    this.points.renderOrder = 20;
    this.data = null;
    this.total = n;
    if (scene) scene.add(this.points);
    this.setProgress(1);
    return this;
  }

  setProgress(p) {
    const n = Math.round(this.total * Math.max(0, Math.min(1, p)));
    this.geometry.setDrawRange(0, n);
    this._installed = n;
    this.points.visible = n > 0 && this.intensity > 0.002;
  }

  update(time, intensity, pxScale) {
    if (!this.points) return;
    this.intensity = intensity;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = intensity;
    u.uScale.value = pxScale;
    this.points.visible = this._installed > 0 && intensity > 0.002;
  }

  dispose() {
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.points && this.points.parent) this.points.parent.remove(this.points);
  }
}

/* ============================================================ Vegetation */

function palmParts(rng) {
  const trunk = new GeoBuilder({ worldUV: false });
  const crown = new GeoBuilder({ worldUV: false });
  const h = 1; // unit tree, scaled per instance (height ~ 9-14 m)
  const segs = 3;
  for (let i = 0; i < segs; i++) {
    const y0 = (i / segs) * h; const y1 = ((i + 1) / segs) * h;
    const lean = 0.036 * i * i / segs;
    trunk.cyl(0.032 - i * 0.004, y1 - y0, lean, y0, 0, i % 2 ? 0x6e5a44 : 0x7b6650, 6, 0.88);
  }
  const top = 1.0; const leanTop = 0.036 * segs;
  const frond = new THREE.BufferGeometry();
  // A frond: arched blade of 5 segments, 2 triangles each, folded slightly (V section).
  const pts = []; const nor = [];
  const L = 0.42; const W = 0.07;
  for (let k = 0; k < 3; k++) {
    const t0 = k / 3; const t1 = (k + 1) / 3;
    const y0 = Math.sin(t0 * 2.2) * 0.13 - t0 * t0 * 0.12; const y1 = Math.sin(t1 * 2.2) * 0.13 - t1 * t1 * 0.12;
    const w0 = W * (1 - t0 * 0.75); const w1 = W * (1 - t1 * 0.75);
    const x0 = t0 * L; const x1 = t1 * L;
    pts.push(x0, y0, -w0, x1, y1, -w1, x0, y0 - 0.01, 0, x0, y0 - 0.01, 0, x1, y1, -w1, x1, y1 - 0.01, 0);
    pts.push(x0, y0 - 0.01, 0, x1, y1 - 0.01, 0, x0, y0, w0, x0, y0, w0, x1, y1 - 0.01, 0, x1, y1, w1);
    for (let q = 0; q < 12; q++) nor.push(0, 1, 0);
  }
  frond.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  frond.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const n = 11;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + rng() * 0.3;
    const pitch = (i % 2 ? 0.25 : -0.15) + rng() * 0.2;
    _e.set(0, yaw, pitch, 'YZX');
    _q.setFromEuler(_e);
    _m.compose(_p.set(leanTop, top, 0), _q, _s.set(1, 1, 1));
    const green = new THREE.Color().setHSL(0.2 + rng() * 0.05, 0.42, 0.24 + rng() * 0.08);
    crown.add(frond, _m, green);
  }
  crown.cyl(0.05, 0.08, leanTop, top - 0.06, 0, 0x7a6a3c, 5);
  frond.dispose();
  return { trunk: trunk.build(), crown: crown.build() };
}

function blobCanopy(rng, blobs, spread, flat, hue, sat, light) {
  const b = new GeoBuilder({ worldUV: false });
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const k = 0.82 + hash2i(Math.round(_v.x * 50), Math.round(_v.y * 50 + _v.z * 31), 7) * 0.32;
    pos.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
  }
  ico.computeVertexNormals();
  for (let i = 0; i < blobs; i++) {
    const a = rng() * Math.PI * 2; const r = i === 0 ? 0 : spread * (0.4 + rng() * 0.6);
    const s = (i === 0 ? 0.55 : 0.32 + rng() * 0.2);
    _m.compose(_p.set(Math.cos(a) * r, 0.78 + (rng() - 0.3) * 0.12, Math.sin(a) * r), _q.identity(), _s.set(s, s * flat, s));
    b.add(ico, _m, new THREE.Color().setHSL(hue + rng() * 0.03, sat, light + rng() * 0.06));
  }
  ico.dispose();
  return b.build();
}

function treeTrunk(fork) {
  const b = new GeoBuilder({ worldUV: false });
  b.cyl(0.05, 0.62, 0, 0, 0, 0x4e3e30, 5, 0.7);
  if (fork) {
    b.beam(0, 0.5, 0, 0.18, 0.8, 0.05, 0.035, 0x4e3e30);
    b.beam(0, 0.5, 0, -0.15, 0.82, -0.06, 0.035, 0x4e3e30);
  }
  return b.build();
}

const VEG_PATCH = (mat, amp) => {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float sway = sin(uTime * 1.4 + ip.x * 0.07 + ip.z * 0.05) + 0.4 * sin(uTime * 3.1 + ip.z * 0.2);
          transformed.x += sway * ${amp.toFixed(3)} * max(transformed.y - 0.4, 0.0);
          transformed.z += sway * ${(amp * 0.6).toFixed(3)} * max(transformed.y - 0.4, 0.0);
        #endif`);
  };
  mat.customProgramCacheKey = () => `veg${amp}`;
};

/**
 * Trees and scrub, all instanced. `placements` = { palm:[], neem:[], kikar:[], scrub:[] }
 * with items { x, z, h, ry, color? }.
 */
export class Vegetation {
  constructor(scene, placements, { seed = 77, shadows = true } = {}) {
    const rng = makeRng(seed);
    this.time = { value: 0 };
    this.trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.leafMat.userData.uTime = this.time;
    VEG_PATCH(this.leafMat, 0.012);
    this.scrubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.sets = [];
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);

    const palm = palmParts(rng);
    const neem = blobCanopy(rng, 6, 0.32, 0.72, 0.24, 0.38, 0.17);
    const kikar = blobCanopy(rng, 5, 0.42, 0.32, 0.17, 0.3, 0.23);
    const scrubGeo = (() => {
      const g = new GeoBuilder({ worldUV: false });
      const ico = new THREE.OctahedronGeometry(1, 0);
      for (let i = 0; i < 2; i++) {
        _m.compose(_p.set((rng() - 0.5) * 0.8, 0.25, (rng() - 0.5) * 0.8), _q.identity(), _s.set(0.5 + rng() * 0.3, 0.35 + rng() * 0.2, 0.5 + rng() * 0.3));
        g.add(ico, _m, new THREE.Color().setHSL(0.14 + rng() * 0.06, 0.2 + rng() * 0.12, 0.3 + rng() * 0.1));
      }
      ico.dispose();
      return g.build();
    })();
    const mk = (geo, mat, list, sy = 1, shadows = true) => {
      const items = list.map((t) => ({ x: t.x, y: t.y || 0, z: t.z, ry: t.ry, sx: t.h * (t.w || 1) * sy, sy: t.h, sz: t.h * (t.w || 1) * sy, color: t.color }));
      const set = new InstancedSet(geo, mat, items, { shadows, name: 'veg' });
      this.group.add(set.mesh);
      this.sets.push(set);
      return set;
    };
    const P = placements;
    const sh = shadows;
    mk(palm.trunk, this.trunkMat, P.palm || [], 1, sh);
    mk(palm.crown, this.leafMat, P.palm || [], 1, sh);
    const neemT = treeTrunk(true); const kikT = treeTrunk(true);
    mk(neemT, this.trunkMat, P.neem || [], 1, sh);
    mk(neem, this.leafMat, P.neem || [], 1, sh);
    mk(kikT, this.trunkMat, P.kikar || [], 1, sh);
    mk(kikar, this.leafMat, (P.kikar || []).map((t) => ({ ...t, w: 1.25 })), 1, sh);
    this.scrub = mk(scrubGeo, this.scrubMat, P.scrub || [], 1, false);
    this.scrub.mesh.receiveShadow = true;
  }

  update(dt) { this.time.value += dt; }

  /** Reveal planted trees in placement order (landscaping works). */
  setProgress(p) { for (const s of this.sets) s.setProgress(p); }

  dispose() {
    for (const s of this.sets) s.dispose();
    this.trunkMat.dispose(); this.leafMat.dispose(); this.scrubMat.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

/* ============================================================ DustPuffs */

const PUFF_VERT = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec4 aPuff;     // t0, size, alpha, seed
  attribute vec3 aDrift;
  uniform float uTime;
  varying float vA;
  varying vec2 vUv;
  void main() {
    float age = uTime - aPuff.x;
    float life = 1.4 + aPuff.y * 0.5;
    float k = clamp(age / life, 0.0, 1.0);
    vec3 c = aOrigin + aDrift * age + vec3(0.0, k * aPuff.y * 0.5, 0.0);
    float s = aPuff.y * (0.5 + k * 2.4);
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    float rot = aPuff.w * 6.283 + age * 0.4;
    vec2 p = vec2(position.x * cos(rot) - position.y * sin(rot), position.x * sin(rot) + position.y * cos(rot));
    mv.xy += p * s;
    vA = aPuff.z * (1.0 - k) * smoothstep(0.0, 0.06, k) * step(age, life) * step(0.0, age);
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;
const PUFF_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  varying vec2 vUv;
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float lobes = 0.85 + 0.15 * sin(atan(d.y, d.x) * 5.0);
    float a = smoothstep(1.0, 0.2, r / lobes) * vA * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export class DustPuffs {
  constructor(scene, { capacity = 200, color = 0xd9c49a, opacity = 0.55 } = {}) {
    this.capacity = capacity;
    this.cursor = 0;
    this.time = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.origins = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.puffs = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.drifts = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (let i = 0; i < capacity; i++) this.puffs.array[i * 4] = -1000;
    geo.setAttribute('aOrigin', this.origins);
    geo.setAttribute('aPuff', this.puffs);
    geo.setAttribute('aDrift', this.drifts);
    geo.instanceCount = capacity;
    this.geometry = geo;
    this._quad = quad;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'dust-puffs';
    scene.add(this.mesh);
    this.devils = [];
  }

  emit(x, y, z, strength = 1, dx = 0, dz = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.origins.array.set([x, y, z], i * 3);
    this.puffs.array.set([this.time, 0.7 + strength * 0.9, Math.min(1, 0.5 * strength + 0.15), (i * 0.618) % 1], i * 4);
    this.drifts.array.set([dx, 0.3 + strength * 0.25, dz], i * 3);
    this.origins.needsUpdate = this.puffs.needsUpdate = this.drifts.needsUpdate = true;
  }

  /** A wandering dust devil: a spiralling column of puffs that drifts with the wind. */
  spawnDevil(x, z, life = 14) {
    if (this.devils.length < 3) this.devils.push({ x, z, age: 0, life, spin: Math.random() * 6 });
  }

  update(dt, wind = { x: 2, z: 1 }) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    for (let i = this.devils.length - 1; i >= 0; i--) {
      const d = this.devils[i];
      d.age += dt;
      d.x += wind.x * dt * 0.9;
      d.z += wind.z * dt * 0.9;
      d.spin += dt * 5;
      d.acc = (d.acc || 0) + dt;
      while (d.acc > 0.06) {
        d.acc -= 0.06;
        const h = Math.random() * 14;
        const r = 1 + h * 0.3;
        const fade = Math.sin(Math.PI * Math.min(1, d.age / d.life));
        this.emit(d.x + Math.cos(d.spin + h) * r, h, d.z + Math.sin(d.spin + h) * r, 1.6 * fade + 0.2, wind.x * 0.4, wind.z * 0.4);
      }
      if (d.age > d.life) this.devils.splice(i, 1);
    }
  }

  dispose() {
    this.geometry.dispose(); this._quad.dispose(); this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

/* ============================================================== BirdFlock */

/*
 * Birds of the Indus plain, animated entirely on the GPU (one instanced draw,
 * no per-frame CPU work beyond a handful of uniforms):
 *   0 black kites   — soaring circles on thermals, 70–380 m, occasional wing-beats
 *   1 sparrows      — small busy flocks near tree groves, bounding flight
 *   2 cattle egrets — white, slow deep beats, looping low over the farmland
 *   3 rock pigeons  — a flock wheeling over the terminal / landside
 *   4 common mynas  — small dark flocks near groves
 * Every bird's path is an analytic function of time (flock centre wander +
 * per-bird cohesion orbit, a boids-like look), orientation comes from a finite
 * difference of that path, wings flap and fold in the vertex shader. Far birds
 * are held at a minimum on-screen size so they read from the overview camera.
 * By night they roost (hidden); at dusk they come down low.
 */
const BIRD_VERT = /* glsl */ `
  attribute float aWing;     // 0 body/tail, 0..1 along the wing (span fraction)
  attribute vec4 aA;         // species, centre x, centre z, bird seed
  attribute vec4 aB;         // orbit radius, altitude, speed (m/s), phase
  attribute vec4 aC;         // colour rgb, wingspan (m)
  attribute vec4 aD;         // flock wander radius, flock seed, flock speed, max boost
  uniform float uTime;
  uniform float uDay;
  uniform float uPxScale;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSkyCol;
  varying vec3 vTop;
  varying vec3 vUnder;
  #include <fog_pars_vertex>

  vec3 birdPos( float t ) {
    float sp = aA.x;
    float seed = aA.w;
    vec2 c = aA.yz;
    float roost = mix( 0.25, 1.0, uDay );
    if ( sp < 0.5 ) {
      // Kite on a thermal: the thermal itself wanders slowly downwind.
      c += vec2( sin( t * 0.011 + aD.y * 7.0 ), cos( t * 0.009 + aD.y * 3.0 ) ) * aD.x;
      float r = aB.x * ( 1.0 + 0.18 * sin( t * 0.05 + seed * 11.0 ) );
      float a = aB.w + t * aB.z / aB.x;
      float y = aB.y * roost + 22.0 * sin( t * 0.035 + seed * 5.0 );
      return vec3( c.x + cos( a ) * r, y, c.y + sin( a ) * r );
    }
    if ( sp > 1.5 && sp < 2.5 ) {
      // Egrets: a long loop over the fields, loose V formation (offsets in aB.xw).
      float a = aD.y * 6.2832 + t * aD.z / aD.x;
      vec2 dir = vec2( -sin( a ), cos( a ) * 0.22 );
      vec2 base = c + vec2( cos( a ) * aD.x, sin( a ) * aD.x * 0.22 );
      vec2 fw = normalize( dir + vec2( 1e-4 ) );
      vec2 side = vec2( -fw.y, fw.x );
      vec2 p = base + side * aB.w - fw * abs( aB.w ) * 0.8 + vec2( sin( t * 0.3 + seed * 9.0 ), cos( t * 0.27 + seed * 4.0 ) ) * 1.2;
      return vec3( p.x, aB.y * roost + sin( t * 0.4 + seed * 3.0 ) * 1.5, p.y );
    }
    // Flocks (sparrows, mynas, pigeons): a wandering flock centre + cohesion orbits.
    float ft = t * aD.z / max( aD.x, 1.0 );
    vec2 fc = c + vec2( sin( ft + aD.y * 6.2832 ) + 0.35 * sin( ft * 2.3 + aD.y * 11.0 ), cos( ft * 0.83 + aD.y * 4.0 ) + 0.3 * sin( ft * 1.9 ) ) * aD.x;
    float a = aB.w + t * aB.z / max( aB.x, 0.5 );
    float r = aB.x * ( 0.7 + 0.3 * sin( t * 0.7 + seed * 13.0 ) );
    vec3 off = vec3( cos( a ) * r, sin( a * 1.3 + seed * 5.0 ) * r * 0.25, sin( a ) * r * 0.8 );
    float y = aB.y * roost + off.y;
    if ( sp < 1.5 || sp > 3.5 ) y += abs( sin( t * 2.6 + seed * 7.0 ) ) * 0.9;   // bounding flight
    return vec3( fc.x + off.x, max( y, 2.0 ), fc.y + off.z );
  }

  void main() {
    float sp = aA.x;
    float seed = aA.w;
    float t = uTime + seed * 37.0;
    vec3 p0 = birdPos( t );
    vec3 p1 = birdPos( t + 0.12 );
    vec3 p2 = birdPos( t + 0.24 );
    vec3 f = normalize( p1 - p0 + vec3( 0.0, 0.0, 1e-4 ) );
    vec3 f2 = normalize( p2 - p1 + vec3( 0.0, 0.0, 1e-4 ) );
    vec3 rgt = normalize( cross( f, vec3( 0.0, 1.0, 0.0 ) ) );
    // Bank into the turn.
    float turn = dot( cross( f, f2 ), vec3( 0.0, 1.0, 0.0 ) );
    float bank = clamp( -turn * ( sp < 0.5 ? 26.0 : 10.0 ), -0.9, 0.9 );
    vec3 up0 = cross( rgt, f );
    vec3 up = normalize( up0 * cos( bank ) + rgt * sin( bank ) );
    rgt = normalize( cross( f, up ) );

    // Wing-beats by species.
    float flap = 0.0; float fold = 1.0;
    if ( sp < 0.5 ) {
      float gate = smoothstep( 0.86, 0.9, fract( t * 0.07 + seed ) ) * ( 1.0 - smoothstep( 0.96, 1.0, fract( t * 0.07 + seed ) ) );
      flap = sin( t * 5.5 ) * 0.55 * gate + 0.1;
    } else if ( sp < 1.5 || sp > 3.5 ) {
      float glide = step( 0.62, fract( t * 0.9 + seed ) );
      flap = sin( t * 15.0 + seed * 20.0 ) * 0.9 * ( 1.0 - glide );
      fold = mix( 1.0, 0.35, glide );
    } else if ( sp < 2.5 ) {
      flap = sin( t * 2.7 + seed * 6.0 ) * 0.75;
    } else {
      float glide = step( 0.8, fract( t * 0.21 + seed ) );
      flap = mix( sin( t * 8.0 + seed * 9.0 ) * 0.8, 0.15, glide );
    }
    vec3 lp = position;
    float wing = aWing;
    lp.x *= mix( 1.0, fold, step( 0.01, wing ) );
    lp.y += flap * wing * 0.42 + flap * max( wing - 0.5, 0.0 ) * 0.35;
    lp.x *= 1.0 - abs( flap ) * wing * 0.12;

    // Minimum on-screen size so distant birds stay legible.
    float span = aC.w;
    float dist = length( p0 - cameraPosition );
    float px = span * uPxScale / max( dist, 1.0 );
    float boost = clamp( 14.0 / max( px, 1e-3 ), 1.0, aD.w );
    float s = span * boost * step( 0.02, uDay );
    vec3 wpos = p0 + ( rgt * lp.x + up * lp.y + f * lp.z ) * s;

    // Shading: lit top, darker underside (silhouette against the sky).
    vec3 n = up;
    float sunK = max( dot( n, uSunDir ), 0.0 );
    vec3 base = aC.rgb;
    vTop = base * ( uSkyCol * 0.75 + uSunCol * sunK * 0.9 );
    vUnder = base * ( uSkyCol * 0.42 + uSunCol * max( -dot( n, uSunDir ), 0.0 ) * 0.5 + vec3( 0.06, 0.05, 0.04 ) );
    vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const BIRD_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vTop;
  varying vec3 vUnder;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4( gl_FrontFacing ? vTop : vUnder, uOpacity );
    #include <fog_fragment>
  }
`;

/** Unit bird, wingspan 1, nose towards +z, up +y; triangles wound to face up. */
function birdGeometry() {
  const P = []; const W = [];
  const tri = (a, b, c, wa, wb, wc) => {
    // Wind counter-clockwise seen from above (+y): normal.y > 0.
    const cr = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (cr < 0) { P.push(...a, ...b, ...c); W.push(wa, wb, wc); } else { P.push(...a, ...c, ...b); W.push(wa, wc, wb); }
  };
  // Body: a slim diamond with a raised spine, head forward.
  const nose = [0, 0.0, 0.3]; const tailJ = [0, 0, -0.2]; const l = [-0.045, 0, 0.06]; const r = [0.045, 0, 0.06]; const spine = [0, 0.035, 0.05];
  tri(nose, l, spine, 0, 0, 0); tri(nose, spine, r, 0, 0, 0); tri(l, tailJ, spine, 0, 0, 0); tri(spine, tailJ, r, 0, 0, 0);
  tri(nose, r, l, 0, 0, 0); tri(l, r, tailJ, 0, 0, 0);
  // Forked tail.
  tri([-0.03, 0, -0.18], [0.03, 0, -0.18], [-0.09, 0, -0.42], 0, 0, 0);
  tri([0.03, 0, -0.18], [0.09, 0, -0.42], [0, 0, -0.33], 0, 0, 0);
  tri([0.03, 0, -0.18], [0, 0, -0.33], [-0.09, 0, -0.42], 0, 0, 0);
  // Wings: inner panel (root → elbow) and outer, swept, fingered hand.
  for (const sd of [-1, 1]) {
    const r0 = [sd * 0.04, 0, 0.12]; const r1 = [sd * 0.04, 0, -0.1];
    const e0 = [sd * 0.24, 0.01, 0.12]; const e1 = [sd * 0.24, 0.01, -0.14];
    const t0 = [sd * 0.5, 0.02, 0.0]; const t1 = [sd * 0.44, 0.02, -0.1];
    tri(r0, e0, r1, 0.08, 0.48, 0.08); tri(e0, e1, r1, 0.48, 0.48, 0.08);
    tri(e0, t0, e1, 0.48, 1, 0.48); tri(t0, t1, e1, 1, 0.9, 0.48);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  return g;
}

/** Points the soundscape and bird habitats are measured against. */
const WORK_POINTS = [
  [-540, 0], [-350, 0], [-560, -420], [-180, 900], [0, 1900], [0, 2350], [320, 1650], [340, 1850], [-100, -900],
];

export class BirdFlock {
  constructor(scene, { count = 40, centres = null, seed = 9 } = {}) {
    const rng = makeRng(seed);
    const habitat = (scene.userData && scene.userData.habitat) || {};
    const groves = (habitat.groves && habitat.groves.length ? habitat.groves : [[-760, -20], [-1500, -280], [220, 2200], [-760, 2600]]).slice(0, 10);
    const farms = (habitat.farms && habitat.farms.length ? habitat.farms : [[2200, 1500], [2600, -900]]).slice(0, 4);
    this.groves = groves;
    const birds = [];
    const add = (sp, cx, cz, B, col, span, D) => birds.push({ sp, cx, cz, B, col, span, D, seed: rng() });
    const C = (h) => new THREE.Color(h);

    // Black kites: thermals around the airfield, visible from the overview.
    const thermals = centres || [[-400, -300], [150, 600], [-650, 900], [-150, 1700], [-1100, 200], [350, -900]];
    const kites = Math.max(14, Math.round(count * 0.6));
    for (let i = 0; i < kites; i++) {
      const th = thermals[i % thermals.length];
      const col = C(0x3a2c22).lerp(C(0x6a4e36), rng() * 0.6);
      add(0, th[0] + (rng() - 0.5) * 120, th[1] + (rng() - 0.5) * 120, [45 + rng() * 90, 70 + rng() * 310, 8 + rng() * 4, rng() * 6.28], col, 1.45 + rng() * 0.25, [160, (i % thermals.length) / thermals.length, 0, 24]);
    }
    // Sparrows and mynas at the tree groves; a pigeon flock over the terminal.
    let fi = 0;
    for (const g of groves) {
      const myna = fi % 3 === 2;
      const n = myna ? 7 + Math.floor(rng() * 5) : 12 + Math.floor(rng() * 8);
      const fs = rng();
      const wander = 25 + rng() * 40;
      const alt = 7 + rng() * 10;
      for (let i = 0; i < n; i++) {
        const col = myna ? C(0x2e2219).lerp(C(0x4a3424), rng()) : C(0x6b5440).lerp(C(0x8d7458), rng());
        add(myna ? 4 : 1, g[0], g[1], [2 + rng() * 6, alt + rng() * 4, 6 + rng() * 3, rng() * 6.28], col, myna ? 0.4 : 0.25, [wander, fs, 7 + rng() * 2, 6]);
      }
      fi++;
    }
    const pig = [[-560, 120], [-420, -150]];
    for (let k = 0; k < pig.length; k++) {
      const fs = rng();
      for (let i = 0; i < 18; i++) {
        const col = C(0x6f7380).lerp(C(0x9a9ca6), rng());
        add(3, pig[k][0], pig[k][1], [3 + rng() * 7, 32 + rng() * 14, 12 + rng() * 2, rng() * 6.28], col, 0.65, [110, fs, 13, 14]);
      }
    }
    // Cattle egrets over the irrigated fields (loose V).
    for (const f of farms) {
      const n = 6 + Math.floor(rng() * 5);
      const fs = rng();
      const alt = 14 + rng() * 18;
      for (let i = 0; i < n; i++) {
        const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 3.2;
        add(2, f[0], f[1], [0, alt + rng() * 3, 0, side], C(0xf4f1e8), 0.92, [320 + rng() * 120, fs, 9, 16]);
      }
    }

    const N = birds.length;
    const aA = new Float32Array(N * 4); const aB = new Float32Array(N * 4); const aC = new Float32Array(N * 4); const aD = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      aA.set([b.sp, b.cx, b.cz, b.seed], i * 4);
      aB.set(b.B, i * 4);
      aC.set([b.col.r, b.col.g, b.col.b, b.span], i * 4);
      aD.set(b.D, i * 4);
    }
    const base = birdGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('aWing', base.attributes.aWing);
    geo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    geo.setAttribute('aD', new THREE.InstancedBufferAttribute(aD, 4));
    geo.instanceCount = N;
    this._base = base;
    this.geometry = geo;
    this.count = N;
    this.material = new THREE.ShaderMaterial({
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uDay: { value: 1 }, uOpacity: { value: 1 }, uPxScale: { value: 800 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSkyCol: { value: new THREE.Color(0.6, 0.65, 0.75) },
      }]),
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
    this.mesh.onBeforeRender = (renderer, scn, camera) => this._frame(renderer, scn, camera);
    scene.add(this.mesh);
    this.time = 0;
  }

  update(dt, light = 1) {
    this.time += dt;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uDay.value = light;
    // Roosting at night: nothing in the sky.
    this.mesh.visible = light > 0.03;
    if (!this.mesh.visible) soundscape.birds = 0;
  }

  /** Per-frame: pixel scale, sun & sky light, and the listener context for the audio. */
  _frame(renderer, scene, camera) {
    if (!camera || !camera.isPerspectiveCamera) return;
    const u = this.material.uniforms;
    const h = renderer.domElement ? renderer.domElement.height : 900;
    u.uPxScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const sky = scene && scene.userData ? scene.userData.sky : null;
    if (sky) {
      u.uSunDir.value.copy(sky.sunDirection);
      u.uSunCol.value.copy(sky.sunLight.color).multiplyScalar(Math.min(1.4, sky.sunLight.intensity / 3));
      u.uSkyCol.value.copy(sky.hemi.color).multiplyScalar(0.4 + sky.hemi.intensity);
      soundscape.hour = sky.hour;
    }
    const cp = camera.position;
    soundscape.valid = true;
    soundscape.x = cp.x; soundscape.y = cp.y; soundscape.z = cp.z;
    let dt = Infinity;
    for (const g of this.groves) dt = Math.min(dt, Math.hypot(cp.x - g[0], cp.z - g[1]));
    soundscape.trees = clamp01(1 - (Math.hypot(Math.max(0, dt - 60), cp.y) / 450));
    let dw = Infinity;
    for (const w of WORK_POINTS) dw = Math.min(dw, Math.hypot(cp.x - w[0], cp.z - w[1], cp.y));
    soundscape.work = clamp01(1 - (dw - 90) / 700);
    soundscape.birds = this.mesh.visible ? u.uDay.value : 0;
  }

  dispose() {
    this._base.dispose(); this.geometry.dispose(); this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ============================================================ small props */

/** Traffic cone geometry (unit ~0.75 m). */
export function coneGeometry() {
  const b = new GeoBuilder({ worldUV: false });
  b.box(0.42, 0.04, 0.42, 0, 0, 0, 0x1a1a1a);
  b.cyl(0.16, 0.24, 0, 0.04, 0, 0xff5a10, 10, 0.62);
  b.cyl(0.1, 0.16, 0, 0.28, 0, 0xf4f4f4, 10, 0.7);
  b.cyl(0.07, 0.3, 0, 0.44, 0, 0xff5a10, 10, 0.2);
  return b.build();
}

/** Jersey barrier geometry (unit 3 m long along X). */
export function barrierGeometry(color = 0xd8d4cc) {
  const b = new GeoBuilder({ worldUV: false });
  b.box(3, 0.3, 0.6, 0, 0, 0, color);
  b.box(3, 0.5, 0.36, 0, 0.3, 0, color);
  b.box(3, 0.2, 0.22, 0, 0.8, 0, color);
  b.box(0.6, 0.12, 0.23, -0.9, 0.85, 0, 0xd02010);
  b.box(0.6, 0.12, 0.23, 0.6, 0.85, 0, 0xd02010);
  return b.build();
}

/**
 * Text label texture (signage, FIDS headers, stand numbers). Fonts are the
 * platform's sans-serif — no web fonts.
 */
export function labelTexture(text, { w = 256, h = 64, bg = '#111', fg = '#f2c21b', font = 'bold 44px sans-serif', border = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); } else ctx.clearRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4); }
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
