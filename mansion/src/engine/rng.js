/**
 * Deterministic pseudo-random numbers and coherent noise.
 *
 * Pure arithmetic: no three.js, no DOM.  The project simulation imports this
 * module and runs in Node, which is how the schedule and cost model are
 * calibrated before any of it is wired to a renderer.
 *
 * Every stochastic feature of the world and of the project derives from an
 * explicit seed, so a saved session replays byte-identically on another
 * machine.
 */

/** Mulberry32 — small, fast, and good enough for visuals and Monte Carlo. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const rng = function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Uniform in [lo, hi). */
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  /** Integer in [lo, hi]. */
  rng.int = (lo, hi) => Math.min(hi, lo + Math.floor((hi - lo + 1) * rng()));
  /** True with probability p. */
  rng.chance = (p) => rng() < p;
  /** Uniformly pick one element. */
  rng.pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  /** Approximately standard normal (Box–Muller, guarded against log(0)). */
  rng.normal = () => {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return rng;
}

/** Deterministic scalar hash of one integer, in [0, 1). */
export function hash1(n) {
  let t = (n | 0) + 0x9e3779b9;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

/** Deterministic scalar hash of a 2-D integer lattice point, in [0, 1). */
export function hash2(x, y) {
  return hash1(Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263));
}

/** Deterministic scalar hash of a 3-D integer lattice point, in [0, 1). */
export function hash3(x, y, z) {
  return hash1(
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519)
  );
}

/** Ken Perlin's quintic ease — C2 continuous, so noise has no lattice creases. */
export function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Value noise on a 2-D lattice, in [0, 1]. */
export function valueNoise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

/** Fractional Brownian motion over value noise, normalised to [0, 1]. */
export function fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise2(fx, fy);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged fBm — sharp creases, used for marble veining and plaster cracks. */
export function ridged2(x, y, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise2(fx, fy) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    fx *= 2.07;
    fy *= 2.03;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Clamp helper shared across the whole application. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation, exported for the modules that need it by name. */
export function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep with explicit edges, matching the GLSL semantics. */
export function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.15e-9).
 * Used for PERT confidence dates: "what completion date am I 80% sure of?"
 */
export function probit(p) {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  let r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * One draw from a PERT-beta distribution with the given three-point estimate.
 * Uses the standard beta shape parameters derived from (O, M, P) with lambda 4,
 * sampled through two gamma draws.  Degenerate ranges fall back to the mode.
 */
export function pertSample(rng, o, m, p) {
  if (!(p > o)) return m;
  const mean = (o + 4 * m + p) / 6;
  // Shape parameters for the standard PERT (Vose) formulation.
  let alpha = ((mean - o) * (2 * m - o - p)) / ((m - mean) * (p - o));
  let beta = (alpha * (p - mean)) / (mean - o);
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha <= 0 || beta <= 0) {
    alpha = 4;
    beta = 4;
  }
  const g1 = gammaSample(rng, alpha);
  const g2 = gammaSample(rng, beta);
  const denom = g1 + g2;
  const x = denom > 0 ? g1 / denom : 0.5;
  return o + x * (p - o);
}

/** Marsaglia–Tsang gamma sampler with shape boost for alpha < 1. */
function gammaSample(rng, alpha) {
  if (alpha < 1) {
    const u = Math.max(1e-12, rng());
    return gammaSample(rng, alpha + 1) * Math.pow(u, 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 200; i += 1) {
    let x;
    let v;
    do {
      x = rng.normal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(1e-12, rng());
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}
