/**
 * Deterministic procedural noise toolbox.
 *
 * Everything in the simulator that looks "random" - dune fields, limestone
 * mottling, block colour variation, worker gait offsets, Monte Carlo draws -
 * is derived from these functions so a given seed always reproduces the same
 * world.  That matters for a conference demo: the screenshot you rehearsed is
 * the screenshot you get.
 */

/** Small, fast, well-distributed 32-bit PRNG (Mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic scalar hash in [0,1) for a 2D integer lattice point. */
export function hash2i(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SMOOTH = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise with quintic interpolation, range [0,1]. */
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = SMOOTH(xf);
  const v = SMOOTH(yf);
  const a = hash2i(xi, yi, seed);
  const b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed);
  const d = hash2i(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Fractal Brownian motion, range [0,1]. */
export function fbm2(x, y, octaves = 5, lacunarity = 2.02, gain = 0.5, seed = 0) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 137);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal - produces the sharp crests of eroded desert rock. */
export function ridged2(x, y, octaves = 5, seed = 0) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, y * freq, seed + i * 71) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Cellular / Worley noise (F1 distance), range roughly [0,1]. Used for cracks. */
export function worley2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 8;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const px = cx + hash2i(cx, cy, seed);
      const py = cy + hash2i(cx, cy, seed + 9871);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.min(1, Math.sqrt(best));
}

/** Directional dune noise: asymmetric ridges aligned to a prevailing wind. */
export function duneNoise(x, y, windRad, seed = 0) {
  const c = Math.cos(windRad);
  const s = Math.sin(windRad);
  const u = x * c - y * s;
  const v = x * s + y * c;
  const wander = fbm2(u * 0.35, v * 0.35, 3, 2, 0.5, seed + 13) - 0.5;
  const t = (v * 1.0 + wander * 2.2) % 1;
  const tt = t < 0 ? t + 1 : t;
  // Asymmetric profile: long windward slope, short steep slip face.
  const profile = tt < 0.72 ? SMOOTH(tt / 0.72) : 1 - SMOOTH((tt - 0.72) / 0.28);
  const crest = fbm2(u * 0.18, v * 0.09, 3, 2, 0.5, seed + 71);
  return profile * (0.45 + 0.55 * crest);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
