/**
 * AEON SPIRE — procedural noise.
 *
 * Everything visual in this project is generated at runtime (Section I:
 * no downloaded textures), so this module is the shared source of
 * randomness for stone grain, marble veining, rust, terrazzo chips,
 * water ripple and cloud cover.
 */

import { rng } from './MathUtil.js';

/* ------------------------------------------------------------------ */
/* Value noise with a permutation table — cheap, tileable, good enough  */
/* for surface grain at texture resolution.                            */
/* ------------------------------------------------------------------ */

const PERM_SIZE = 256;

export class ValueNoise {
  constructor(seed = 1337) {
    const r = rng(seed);
    this.p = new Uint8Array(PERM_SIZE * 2);
    const t = new Uint8Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) t[i] = i;
    for (let i = PERM_SIZE - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = t[i]; t[i] = t[j]; t[j] = tmp;
    }
    for (let i = 0; i < PERM_SIZE * 2; i++) this.p[i] = t[i & (PERM_SIZE - 1)];
    this.g = new Float32Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) this.g[i] = r();
  }

  /** Hashed lattice value in [0,1). */
  _v(ix, iy) {
    return this.g[this.p[(this.p[ix & 255] + (iy & 255)) & 255]];
  }

  /** 2D value noise in [0,1], quintic-smoothed. */
  noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = this._v(ix, iy), b = this._v(ix + 1, iy);
    const c = this._v(ix, iy + 1), d = this._v(ix + 1, iy + 1);
    const top = a + (b - a) * ux;
    const bot = c + (d - c) * ux;
    return top + (bot - top) * uy;
  }

  /** Fractal Brownian motion; returns [0,1]. */
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged noise — good for marble veins and cloud edges. */
  ridged(x, y, octaves = 4) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Tileable fbm over a `period`-sized cell (wraps seamlessly). */
  tileFbm(x, y, period, octaves = 4) {
    const a = this.fbm(x, y, octaves);
    const b = this.fbm(x - period, y, octaves);
    const c = this.fbm(x, y - period, octaves);
    const d = this.fbm(x - period, y - period, octaves);
    const tx = x / period, ty = y / period;
    return (
      a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) +
      c * (1 - tx) * ty + d * tx * ty
    );
  }
}

/* ------------------------------------------------------------------ */
/* Worley / cellular noise — terrazzo chips, cobbles, cracked glaze.    */
/* ------------------------------------------------------------------ */

export class Worley {
  constructor(seed = 99, density = 12) {
    this.r = rng(seed);
    this.density = density;
    this.cache = new Map();
  }

  _cell(cx, cy) {
    const key = cx * 73856093 ^ cy * 19349663;
    let pt = this.cache.get(key);
    if (!pt) {
      // Deterministic per-cell jitter, independent of visit order.
      const r = rng((key >>> 0) + 1);
      pt = [cx + r(), cy + r(), r()];
      this.cache.set(key, pt);
    }
    return pt;
  }

  /** Returns { d1, d2, id } — nearest distance, second distance, cell id. */
  eval(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    let d1 = Infinity, d2 = Infinity, id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const [px, py, pid] = this._cell(cx + i, cy + j);
        const dx = px - x, dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = pid; }
        else if (d < d2) { d2 = d; }
      }
    }
    return { d1, d2, id };
  }
}

/** Shared default instances so callers do not each rebuild permutation tables. */
export const noise = new ValueNoise(20240115);
export const noiseAlt = new ValueNoise(778899);
