/**
 * AEON SPIRE — shared numeric helpers.
 * Deliberately dependency-free so every other module can import it cheaply.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Frame-rate independent exponential approach. `rate` is roughly "per second". */
export const damp = (current, target, rate, dt) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Deterministic 32-bit PRNG (mulberry32) — every procedural asset is reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrappers around a seeded generator. */
export function rngRange(r, lo, hi) { return lo + r() * (hi - lo); }
export function rngInt(r, lo, hi) { return Math.floor(lo + r() * (hi - lo + 1)); }
export function rngPick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

/** Format a number with thousands separators (HUD readouts). */
export function commas(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Shortest-arc angle interpolation, for camera yaw blending. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
