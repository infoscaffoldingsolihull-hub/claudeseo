import * as THREE from 'three';
import { fbm2, worley2, valueNoise2, hash2i, clamp, lerp, smoothstep, makeRng } from './noise.js';

/**
 * Procedural texture library (A3).
 *
 * The simulator ships as ONE offline HTML file, so every surface — faded
 * runway asphalt with crack sealing and rubber, fresh SMA, slab concrete,
 * Sindh alluvial sand, cut/fill soils, aggregate layers, Sindhi fired brick,
 * terrazzo floors and the Ajrak block-print screens — is synthesised at load
 * time on a canvas.  Each set is built from ONE sampler pass per texel; the
 * normal map comes from a Sobel filter over the cached height field and the
 * ambient-occlusion channel from a cavity term (local mean height minus
 * height), so the whole library warms in well under two seconds.
 *
 * Every set returns { map, normalMap, ormMap, roughnessMap, aoMap }:
 *   ormMap  R = ambient occlusion, G = roughness, B = metalness
 *   (three reads aoMap.r, roughnessMap.g and metalnessMap.b, so ONE texture
 *    serves all three slots; roughnessMap / aoMap are aliases of ormMap).
 * Textures tile seamlessly (all noise is evaluated on a wrapped lattice).
 */

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function wrapIndex(i, n) {
  return ((i % n) + n) % n;
}

/** Periodic value noise: lattice coordinates wrap at `period` so tiles are seamless. */
function pnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const x0 = wrapIndex(xi, period);
  const x1 = wrapIndex(xi + 1, period);
  const y0 = wrapIndex(yi, period);
  const y1 = wrapIndex(yi + 1, period);
  const a = hash2i(x0, y0, seed);
  const b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed);
  const d = hash2i(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Periodic fbm in [0,1]; `freq` must be an integer so the tile wraps. */
function pfbm(u, v, freq, octaves, seed, gain = 0.5) {
  let amp = 1;
  let f = freq;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * pnoise(u * f, v * f, f, seed + i * 131);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

/** Periodic Worley F1 / F2-F1 (cell edges), `freq` integer. */
function pworley(u, v, freq, seed, out) {
  const x = u * freq;
  const y = v * freq;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = wrapIndex(cx, freq);
      const wy = wrapIndex(cy, freq);
      const px = cx + hash2i(wx, wy, seed);
      const py = cy + hash2i(wx, wy, seed + 9871);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2i(wx, wy, seed + 4242);
      } else if (d < f2) f2 = d;
    }
  }
  out.f1 = Math.sqrt(f1);
  out.f2 = Math.sqrt(f2);
  out.id = id;
  return out;
}

/**
 * Build albedo / normal / ORM maps from a per-texel sampler.
 * `sample(u, v, x, y, o)` writes o.h, o.r, o.g, o.b, o.rough, o.metal (0..1).
 */
function buildTextureSet(size, sample, opts = {}) {
  const { normalStrength = 2.0, aoStrength = 2.5, aoRadius = 3, anisotropy = 4 } = opts;
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const o = { h: 0, r: 0, g: 0, b: 0, rough: 1, metal: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      o.metal = 0;
      sample(x / size, y / size, x, y, o);
      height[i] = o.h;
      const k = i * 4;
      albedo[k] = o.r * 255;
      albedo[k + 1] = o.g * 255;
      albedo[k + 2] = o.b * 255;
      albedo[k + 3] = 255;
      orm[k + 1] = o.rough * 255;
      orm[k + 2] = o.metal * 255;
      orm[k + 3] = 255;
    }
  }

  // Cavity AO: separable box blur of the height field (wrapped).
  const tmp = new Float32Array(n);
  const blur = new Float32Array(n);
  const r = aoRadius;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += height[row + wrapIndex(k, size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc * inv;
      acc += height[row + wrapIndex(x + r + 1, size)] - height[row + wrapIndex(x - r, size)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[wrapIndex(k, size) * size + x];
    for (let y = 0; y < size; y++) {
      blur[y * size + x] = acc * inv;
      acc += tmp[wrapIndex(y + r + 1, size) * size + x] - tmp[wrapIndex(y - r, size) * size + x];
    }
  }
  for (let i = 0; i < n; i++) {
    const cavity = Math.max(0, blur[i] - height[i]);
    orm[i * 4] = clamp(1 - cavity * aoStrength, 0.25, 1) * 255;
  }

  // Sobel tangent-space normals (OpenGL convention, +Y = +v).
  const normal = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    const ym = wrapIndex(y - 1, size) * size;
    const yp = wrapIndex(y + 1, size) * size;
    const y0 = y * size;
    for (let x = 0; x < size; x++) {
      const xm = wrapIndex(x - 1, size);
      const xp = wrapIndex(x + 1, size);
      const dx =
        height[ym + xp] + 2 * height[y0 + xp] + height[yp + xp] -
        (height[ym + xm] + 2 * height[y0 + xm] + height[yp + xm]);
      const dy =
        height[yp + xm] + 2 * height[yp + x] + height[yp + xp] -
        (height[ym + xm] + 2 * height[ym + x] + height[ym + xp]);
      const nx = -dx * normalStrength;
      const ny = dy * normalStrength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y0 + x) * 4;
      normal[i] = (nx / len) * 127.5 + 127.5;
      normal[i + 1] = (ny / len) * 127.5 + 127.5;
      normal[i + 2] = (1 / len) * 127.5 + 127.5;
      normal[i + 3] = 255;
    }
  }

  const make = (data, colorSpace) => {
    const canvas = createCanvas(size, size);
    canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = anisotropy;
    tex.colorSpace = colorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
  const ormMap = make(orm, THREE.NoColorSpace);
  return {
    map: make(albedo, THREE.SRGBColorSpace),
    normalMap: make(normal, THREE.NoColorSpace),
    ormMap,
    roughnessMap: ormMap,
    aoMap: ormMap,
    size,
  };
}

const W = { f1: 0, f2: 0, id: 0 };
const W2 = { f1: 0, f2: 0, id: 0 };

/* ------------------------------------------------------------- pavements */

/**
 * Existing 1960s-era runway asphalt: oxidised to a pale grey, coarse exposed
 * aggregate, block cracking sealed with black bitumen bands, a darker patch
 * repair, and longitudinal rubber streaks (texture v runs along the runway).
 */
function asphaltOldSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const macro = pfbm(u, v, 3, 4, seed);
    const fine = pnoise(u * 160, v * 160, 160, seed + 3);
    pworley(u, v, 90, seed + 7, W);
    const stone = smoothstep(0.42, 0.18, W.f1);           // exposed aggregate
    const stoneTone = W.id;
    pworley(u, v, 5, seed + 11, W2);
    const crackEdge = W2.f2 - W2.f1;
    const crackWobble = (pfbm(u, v, 24, 3, seed + 13) - 0.5) * 0.05;
    const crack = smoothstep(0.035, 0.0, crackEdge + crackWobble);
    const seal = smoothstep(0.11, 0.05, crackEdge + crackWobble * 0.6) * (1 - crack);
    // Rectangular patch repair (one per tile, wrapped).
    const pu = (u + 0.63) % 1;
    const pv = (v + 0.21) % 1;
    const patch = smoothstep(0.0, 0.01, pu) * smoothstep(0.34, 0.33, pu) * smoothstep(0.0, 0.01, pv) * smoothstep(0.22, 0.21, pv);
    // Rubber: streaks running along v, modulated in density.
    const streak = pnoise(u * 64, v * 2, 64, seed + 21) * pnoise(u * 9, v * 1, 9, seed + 23);
    const rubber = smoothstep(0.32, 0.75, streak) * (0.4 + macro * 0.6);
    let tone = 0.36 + macro * 0.10 + (fine - 0.5) * 0.05;
    tone = lerp(tone, 0.24 + stoneTone * 0.42, stone * 0.55);
    tone = lerp(tone, 0.13 + macro * 0.04, patch * 0.85);
    tone = lerp(tone, 0.06, seal * 0.8);
    tone = lerp(tone, 0.03, crack);
    tone = lerp(tone, tone * 0.45, rubber * 0.75);
    o.h = clamp(0.55 + stone * 0.25 * (1 - patch) + fine * 0.1 - crack * 0.6 + seal * 0.08, 0, 1);
    o.r = clamp(tone * 1.0, 0, 1);
    o.g = clamp(tone * 0.99, 0, 1);
    o.b = clamp(tone * 0.965, 0, 1);
    o.rough = clamp(0.86 + fine * 0.1 - rubber * 0.18 - seal * 0.25, 0.4, 1);
  }, { normalStrength: 2.4, aoStrength: 3.0, aoRadius: 2 });
}

/** Fresh stone-mastic asphalt: near-black, fine closed texture. */
function asphaltNewSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const macro = pfbm(u, v, 4, 3, seed);
    pworley(u, v, 120, seed + 5, W);
    const stone = smoothstep(0.45, 0.2, W.f1);
    const fine = pnoise(u * 256, v * 256, 256, seed + 9);
    const tone = 0.075 + macro * 0.035 + stone * W.id * 0.07 + fine * 0.02;
    o.h = clamp(0.5 + stone * 0.3 + fine * 0.15, 0, 1);
    o.r = tone;
    o.g = tone * 1.0;
    o.b = tone * 1.04;
    o.rough = clamp(0.78 + fine * 0.12 - stone * 0.12, 0.4, 1);
  }, { normalStrength: 2.0, aoStrength: 2.2, aoRadius: 2 });
}

/**
 * Pavement-quality concrete: `slabs` x `slabs` slabs per tile with sawn,
 * sealed joints, transverse broom texture, per-slab tone shift, hairline
 * cracks and (for aprons) oil drips and tyre scuffs.
 */
function concreteSet(size, seed, { slabs = 2, apron = false } = {}) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const su = u * slabs;
    const sv = v * slabs;
    const cx = Math.floor(su);
    const cy = Math.floor(sv);
    const fx = su - cx;
    const fy = sv - cy;
    const jw = 0.0045 * slabs;
    const joint = Math.max(smoothstep(jw, 0, fx) + smoothstep(1 - jw, 1, fx), smoothstep(jw, 0, fy) + smoothstep(1 - jw, 1, fy));
    const slabTone = hash2i(cx % slabs, cy % slabs, seed);
    const macro = pfbm(u, v, 4, 4, seed + 3);
    const broom = pnoise(u * 24, v * 380, 24, seed + 7) * 0.6 + pnoise(u * 48, v * 760, 48, seed + 8) * 0.4;
    const pores = smoothstep(0.88, 0.97, pnoise(u * 220, v * 220, 220, seed + 9)) * 0.6;
    pworley(u, v, 3, seed + 15, W);
    const hair = smoothstep(0.008, 0.0, W.f2 - W.f1 + (pfbm(u, v, 32, 2, seed + 17) - 0.5) * 0.02) * 0.35 * smoothstep(0.45, 0.7, pfbm(u, v, 4, 2, seed + 19));
    let stain = 0;
    if (apron) {
      const drip = smoothstep(0.66, 0.84, pfbm(u, v, 8, 3, seed + 31)) * 0.7;
      const scuff = smoothstep(0.55, 0.85, pnoise(u * 2, v * 40, 2, seed + 33)) * smoothstep(0.4, 0.7, pfbm(u, v, 3, 2, seed + 35));
      stain = drip * 0.55 + scuff * 0.3;
    }
    let tone = (apron ? 0.56 : 0.62) + slabTone * 0.07 + (macro - 0.5) * 0.12 + (broom - 0.5) * 0.035 - pores * 0.06;
    tone *= 1 - stain * 0.55;
    tone = lerp(tone, 0.1, joint * 0.85);
    tone = lerp(tone, tone * 0.6, hair);
    o.h = clamp(0.6 + broom * 0.12 - pores * 0.25 - joint * 0.55 - hair * 0.2, 0, 1);
    o.r = clamp(tone * 1.0, 0, 1);
    o.g = clamp(tone * 0.985, 0, 1);
    o.b = clamp(tone * 0.95, 0, 1);
    o.rough = clamp(0.84 + broom * 0.1 - stain * 0.35 - joint * 0.1, 0.35, 1);
  }, { normalStrength: 1.6, aoStrength: 3.0, aoRadius: 2 });
}

/* ------------------------------------------------------------------ ground */

/** Indus-plain alluvial sand: pale khaki, wind ripples, darker silt patches. */
function sandSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const warp = pfbm(u, v, 4, 3, seed) * 2.2;
    const ripple = Math.sin((v * 22 + warp) * Math.PI * 2) * 0.5 + 0.5;
    const ripple2 = Math.pow(ripple, 1.6);
    const grain = pnoise(u * 256, v * 256, 256, seed + 3);
    const drift = pfbm(u, v, 3, 4, seed + 21);
    const silt = smoothstep(0.55, 0.75, pfbm(u, v, 5, 3, seed + 41));
    const pebble = smoothstep(0.9, 0.97, pnoise(u * 96, v * 96, 96, seed + 51));
    const tone = 0.62 + drift * 0.16 + ripple2 * 0.06 + (grain - 0.5) * 0.08 - silt * 0.1 - pebble * 0.2;
    o.h = clamp(ripple2 * 0.35 + grain * 0.15 + drift * 0.35 + pebble * 0.3, 0, 1);
    o.r = clamp(tone * 0.98, 0, 1);
    o.g = clamp(tone * 0.86, 0, 1);
    o.b = clamp(tone * 0.66, 0, 1);
    o.rough = clamp(0.9 + grain * 0.08 - silt * 0.05, 0.5, 1);
  }, { normalStrength: 1.5, aoStrength: 2.0, aoRadius: 3 });
}

/** Freshly cut clayey silt: darker, moister, bucket-tooth scrapes along v. */
function soilCutSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const macro = pfbm(u, v, 3, 4, seed);
    const teeth = Math.abs(Math.sin((u * 18 + pfbm(u, v, 6, 2, seed + 4) * 0.8) * Math.PI));
    const scrape = smoothstep(0.0, 0.25, teeth);
    pworley(u, v, 26, seed + 7, W);
    const clod = smoothstep(0.5, 0.15, W.f1) * W.id;
    const moist = smoothstep(0.4, 0.7, pfbm(u, v, 4, 3, seed + 9));
    const tone = 0.40 + macro * 0.14 - moist * 0.1 + clod * 0.06 - (1 - scrape) * 0.05;
    o.h = clamp(scrape * 0.4 + clod * 0.4 + macro * 0.3, 0, 1);
    o.r = clamp(tone * 0.92, 0, 1);
    o.g = clamp(tone * 0.72, 0, 1);
    o.b = clamp(tone * 0.52, 0, 1);
    o.rough = clamp(0.88 - moist * 0.16, 0.4, 1);
  }, { normalStrength: 2.4, aoStrength: 2.5, aoRadius: 3 });
}

/** Engineered fill: lighter, compacted, roller drum bands along v. */
function soilFillSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const macro = pfbm(u, v, 3, 4, seed);
    const band = Math.floor(u * 4);
    const bandTone = hash2i(band, 0, seed + 2);
    const edge = smoothstep(0.03, 0.0, Math.abs((u * 4) % 1 - 0.5) - 0.47);
    const grit = pnoise(u * 200, v * 200, 200, seed + 5);
    pworley(u, v, 40, seed + 9, W);
    const stone = smoothstep(0.32, 0.12, W.f1);
    const tone = 0.55 + macro * 0.12 + bandTone * 0.05 + (grit - 0.5) * 0.06 - edge * 0.06 + stone * (W.id - 0.5) * 0.2;
    o.h = clamp(0.5 + grit * 0.15 + stone * 0.3 - edge * 0.2, 0, 1);
    o.r = clamp(tone * 0.96, 0, 1);
    o.g = clamp(tone * 0.83, 0, 1);
    o.b = clamp(tone * 0.64, 0, 1);
    o.rough = clamp(0.92 + grit * 0.06, 0.5, 1);
  }, { normalStrength: 1.8, aoStrength: 2.0, aoRadius: 2 });
}

/** Granular sub-base / crushed base: graded stones in a fines matrix. */
function gravelSet(size, seed, crushed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    pworley(u, v, crushed ? 70 : 42, seed, W);
    const stone = smoothstep(crushed ? 0.62 : 0.55, crushed ? 0.3 : 0.25, W.f1);
    const edge = smoothstep(0.0, 0.12, W.f2 - W.f1);
    const fines = pnoise(u * 256, v * 256, 256, seed + 3);
    const macro = pfbm(u, v, 3, 3, seed + 5);
    const sTone = crushed ? 0.42 + W.id * 0.25 : 0.38 + W.id * 0.3;
    const mTone = crushed ? 0.36 : 0.45;
    const tone = lerp(mTone + fines * 0.08, sTone, stone * edge) + (macro - 0.5) * 0.08;
    o.h = clamp(stone * edge * 0.8 + fines * 0.15, 0, 1);
    if (crushed) {
      o.r = clamp(tone * 0.95, 0, 1);
      o.g = clamp(tone * 0.95, 0, 1);
      o.b = clamp(tone * 0.97, 0, 1);
    } else {
      o.r = clamp(tone * 1.0, 0, 1);
      o.g = clamp(tone * 0.9, 0, 1);
      o.b = clamp(tone * 0.76, 0, 1);
    }
    o.rough = clamp(0.88 - stone * edge * 0.12 + fines * 0.06, 0.4, 1);
  }, { normalStrength: 3.0, aoStrength: 4.0, aoRadius: 2 });
}

/** Sun-bleached grass/scrub with soil showing between tufts. */
function dryGrassSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const clump = pfbm(u, v, 6, 4, seed);
    const blades = pnoise(u * 300, v * 60, 300, seed + 3) * 0.6 + pnoise(u * 180, v * 140, 180, seed + 4) * 0.4;
    const cover = smoothstep(0.38, 0.6, clump);
    const green = smoothstep(0.6, 0.85, pfbm(u, v, 4, 2, seed + 9)) * 0.5;
    const soil = 0.42 + pnoise(u * 90, v * 90, 90, seed + 7) * 0.08;
    const grass = 0.55 + blades * 0.25;
    const t = cover * smoothstep(0.25, 0.6, blades);
    o.h = clamp(t * 0.7 + blades * 0.2, 0, 1);
    o.r = clamp(lerp(soil * 0.95, grass * (0.92 - green * 0.3), t), 0, 1);
    o.g = clamp(lerp(soil * 0.8, grass * (0.80 + green * 0.05), t), 0, 1);
    o.b = clamp(lerp(soil * 0.6, grass * (0.45 - green * 0.05), t), 0, 1);
    o.rough = 0.95;
  }, { normalStrength: 2.0, aoStrength: 3.0, aoRadius: 2 });
}

/* -------------------------------------------------------------- buildings */

/** Sindhi fired brick, stretcher bond, lime mortar. 8 courses x 4 bricks per tile. */
function brickSet(size, seed) {
  const rows = 8;
  const cols = 4;
  return buildTextureSet(size, (u, v, x, y, o) => {
    const ry = v * rows;
    const row = Math.floor(ry);
    const rx = u * cols + (row % 2) * 0.5;
    const col = Math.floor(rx);
    const fx = rx - col;
    const fy = ry - row;
    const face = smoothstep(0.0, 0.035, fx) * smoothstep(1.0, 0.965, fx) * smoothstep(0.0, 0.08, fy) * smoothstep(1.0, 0.92, fy);
    const jitter = hash2i(wrapIndex(col, cols), wrapIndex(row, rows), seed);
    const grain = pfbm(u, v, 16, 3, seed + 5);
    const burn = smoothstep(0.75, 0.95, jitter) * 0.35;
    const base = 0.48 + jitter * 0.12 + (grain - 0.5) * 0.1;
    const mortar = 0.66 + grain * 0.08;
    o.h = clamp(face * 0.7 + grain * 0.25, 0, 1);
    o.r = clamp(lerp(mortar * 0.96, base * 1.12 * (1 - burn), face), 0, 1);
    o.g = clamp(lerp(mortar * 0.92, base * 0.58 * (1 - burn), face), 0, 1);
    o.b = clamp(lerp(mortar * 0.84, base * 0.40 * (1 - burn * 0.6), face), 0, 1);
    o.rough = clamp(lerp(0.95, 0.82 + grain * 0.1, face), 0.5, 1);
  }, { normalStrength: 2.4, aoStrength: 3.0, aoRadius: 2 });
}

/** Lime/cement render, warm off-white with trowel marks and weather streaks. */
function plasterSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const wash = pfbm(u, v, 4, 4, seed);
    const trowel = pnoise(u * 26, v * 18, 26, seed + 6);
    const streak = smoothstep(0.55, 0.8, pnoise(u * 30, v * 2, 30, seed + 9)) * smoothstep(0.3, 1.0, 1 - v) * 0.5;
    const tone = 0.78 + wash * 0.12 - streak * 0.12;
    o.h = clamp(wash * 0.4 + trowel * 0.4, 0, 1);
    o.r = clamp(tone, 0, 1);
    o.g = clamp(tone * 0.955, 0, 1);
    o.b = clamp(tone * 0.88, 0, 1);
    o.rough = clamp(0.78 + trowel * 0.15, 0.4, 1);
  }, { normalStrength: 0.9, aoStrength: 1.5, aoRadius: 3 });
}

/** Terminal floor: 1.2 m polished terrazzo tiles, 2 x 2 per tile, fine grout. */
function tileSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const su = u * 2;
    const sv = v * 2;
    const fx = su - Math.floor(su);
    const fy = sv - Math.floor(sv);
    const g = 0.004;
    const grout = Math.max(smoothstep(g, 0, fx) + smoothstep(1 - g, 1, fx), smoothstep(g, 0, fy) + smoothstep(1 - g, 1, fy));
    const tileTone = hash2i(Math.floor(su) % 2, Math.floor(sv) % 2, seed) * 0.03;
    pworley(u, v, 140, seed + 3, W);
    const chip = smoothstep(0.35, 0.2, W.f1);
    const chipTone = W.id;
    const cloud = pfbm(u, v, 4, 3, seed + 9);
    let r = 0.80 + cloud * 0.05 + tileTone;
    let gg = 0.78 + cloud * 0.05 + tileTone;
    let b = 0.74 + cloud * 0.04 + tileTone;
    if (chip > 0) {
      const cr = chipTone < 0.3 ? 0.25 : chipTone < 0.55 ? 0.62 : chipTone < 0.7 ? 0.58 : 0.92;
      const cg = chipTone < 0.3 ? 0.24 : chipTone < 0.55 ? 0.55 : chipTone < 0.7 ? 0.32 : 0.9;
      const cb = chipTone < 0.3 ? 0.26 : chipTone < 0.55 ? 0.48 : chipTone < 0.7 ? 0.28 : 0.86;
      r = lerp(r, cr, chip * 0.8);
      gg = lerp(gg, cg, chip * 0.8);
      b = lerp(b, cb, chip * 0.8);
    }
    r = lerp(r, 0.45, grout);
    gg = lerp(gg, 0.44, grout);
    b = lerp(b, 0.42, grout);
    o.h = clamp(0.8 - grout * 0.6, 0, 1);
    o.r = r;
    o.g = gg;
    o.b = b;
    o.rough = clamp(0.16 + cloud * 0.08 + grout * 0.6, 0.05, 1);
  }, { normalStrength: 1.2, aoStrength: 1.5, aoRadius: 1 });
}

/** Standing-seam metal roof: seams along v, 8 per tile, faint chalking. */
function roofMetalSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const s = (u * 8) % 1;
    const seam = smoothstep(0.035, 0.0, Math.abs(s - 0.5) - 0.0) ;
    const rib = smoothstep(0.06, 0.0, Math.abs(s - 0.5));
    const pan = smoothstep(0.5, 0.1, Math.abs(s - 0.5)) * 0.1;
    const chalk = pfbm(u, v, 5, 4, seed);
    const streak = pnoise(u * 64, v * 3, 64, seed + 3);
    const tone = 0.62 + chalk * 0.12 + (streak - 0.5) * 0.06 - seam * 0.05;
    o.h = clamp(0.4 + rib * 0.6 + pan, 0, 1);
    o.r = clamp(tone * 0.97, 0, 1);
    o.g = clamp(tone * 0.98, 0, 1);
    o.b = clamp(tone * 1.0, 0, 1);
    o.rough = clamp(0.32 + chalk * 0.25 + streak * 0.08, 0.1, 1);
    o.metal = 0.85;
  }, { normalStrength: 3.0, aoStrength: 1.5, aoRadius: 2 });
}

/** Painted-steel wear map (greyscale albedo multiplier + roughness variation). */
function paintWearSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const macro = pfbm(u, v, 4, 4, seed);
    const chip = smoothstep(0.78, 0.86, pfbm(u, v, 12, 3, seed + 5));
    const streak = pnoise(u * 48, v * 3, 48, seed + 7);
    const t = 0.92 + macro * 0.08 - chip * 0.45 - streak * 0.04;
    o.h = clamp(0.7 - chip * 0.3 + macro * 0.1, 0, 1);
    o.r = t;
    o.g = t;
    o.b = t;
    o.rough = clamp(0.42 + macro * 0.2 + chip * 0.35, 0.1, 1);
    o.metal = chip * 0.6;
  }, { normalStrength: 0.8, aoStrength: 1.0, aoRadius: 2 });
}

/** Retro-reflective road paint: white base with asphalt showing through wear. */
function markingWearSet(size, seed) {
  return buildTextureSet(size, (u, v, x, y, o) => {
    const wear = pfbm(u, v, 6, 4, seed);
    const pits = smoothstep(0.8, 0.9, pnoise(u * 180, v * 180, 180, seed + 3));
    const rubber = smoothstep(0.45, 0.85, pnoise(u * 20, v * 2, 20, seed + 5)) * 0.4;
    const t = clamp(0.95 - smoothstep(0.62, 0.8, wear) * 0.55 - pits * 0.5 - rubber * 0.5, 0.15, 1);
    o.h = clamp(0.6 + wear * 0.2 - pits * 0.4, 0, 1);
    o.r = t;
    o.g = t;
    o.b = t;
    o.rough = clamp(0.55 + pits * 0.3 + wear * 0.1, 0.2, 1);
  }, { normalStrength: 1.2, aoStrength: 1.5, aoRadius: 1 });
}

/* ------------------------------------------------------------------ Ajrak */

export const AJRAK = {
  crimson: '#9B1B30',
  indigo: '#1E2A6E',
  black: '#14110f',
  white: '#F2EBDD',
};

function starPath(ctx, cx, cy, ro, ri, points, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function trefoilPath(ctx, cx, cy, r, rot) {
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * Math.PI * 2) / 3;
    ctx.moveTo(cx + Math.cos(a) * r * 0.62 + r * 0.48, cy + Math.sin(a) * r * 0.62);
    ctx.arc(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.48, 0, Math.PI * 2);
  }
}

/**
 * Ajrak block-print tile (Sindhi resist-dyed textile): a 2 x 2 lattice of
 * eight-pointed stars on crimson, indigo lozenge frames, trefoil corner
 * motifs, black outline lines and white "chhapa" dots.  Returns the colour
 * canvas and a matching perforation alpha canvas (white = solid screen,
 * black = cut-out) used by the terminal's perforated metal screens.
 */
function ajrakCanvases(size) {
  const color = createCanvas(size, size);
  const alpha = createCanvas(size, size);
  const c = color.getContext('2d');
  const a = alpha.getContext('2d');
  c.fillStyle = AJRAK.crimson;
  c.fillRect(0, 0, size, size);
  a.fillStyle = '#fff';
  a.fillRect(0, 0, size, size);
  const cell = size / 2;
  const lw = Math.max(1, size / 256);

  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      // Lozenge grid lines between cells (drawn on a 3x3 lattice for wrap).
      const x0 = gx * cell;
      const y0 = gy * cell;
      c.strokeStyle = AJRAK.black;
      c.lineWidth = lw * 3;
      c.beginPath();
      c.moveTo(x0 - cell / 2, y0);
      c.lineTo(x0, y0 - cell / 2);
      c.lineTo(x0 + cell / 2, y0);
      c.lineTo(x0, y0 + cell / 2);
      c.closePath();
      c.stroke();
      c.strokeStyle = AJRAK.white;
      c.lineWidth = lw;
      c.stroke();
      // Trefoils at lattice nodes (cell corners).
      c.fillStyle = AJRAK.indigo;
      trefoilPath(c, x0, y0, cell * 0.11, Math.PI / 2);
      c.fill();
      c.strokeStyle = AJRAK.black;
      c.lineWidth = lw * 1.5;
      c.stroke();
      a.fillStyle = '#000';
      trefoilPath(a, x0, y0, cell * 0.085, Math.PI / 2);
      a.fill();
    }
  }

  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      const cx = gx * cell + cell / 2;
      const cy = gy * cell + cell / 2;
      // Indigo medallion behind the star.
      c.fillStyle = AJRAK.indigo;
      c.beginPath();
      c.arc(cx, cy, cell * 0.34, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = AJRAK.black;
      c.lineWidth = lw * 2.5;
      c.stroke();
      // Ring of white dots around the medallion.
      c.fillStyle = AJRAK.white;
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        c.beginPath();
        c.arc(cx + Math.cos(ang) * cell * 0.39, cy + Math.sin(ang) * cell * 0.39, cell * 0.014, 0, Math.PI * 2);
        c.fill();
      }
      // Eight-pointed star: crimson body, black edge, white inner star.
      starPath(c, cx, cy, cell * 0.3, cell * 0.17, 8, Math.PI / 8);
      c.fillStyle = AJRAK.crimson;
      c.fill();
      c.strokeStyle = AJRAK.black;
      c.lineWidth = lw * 2;
      c.stroke();
      starPath(c, cx, cy, cell * 0.16, cell * 0.08, 8, 0);
      c.fillStyle = AJRAK.white;
      c.fill();
      c.fillStyle = AJRAK.black;
      c.beginPath();
      c.arc(cx, cy, cell * 0.035, 0, Math.PI * 2);
      c.fill();
      // Perforation: the outer star ring and the inner star are cut out,
      // the centre boss and the dot ring stay solid.
      a.fillStyle = '#000';
      starPath(a, cx, cy, cell * 0.27, cell * 0.15, 8, Math.PI / 8);
      a.fill();
      a.fillStyle = '#fff';
      starPath(a, cx, cy, cell * 0.16, cell * 0.08, 8, 0);
      a.fill();
      a.fillStyle = '#000';
      starPath(a, cx, cy, cell * 0.12, cell * 0.05, 8, 0);
      a.fill();
      a.fillStyle = '#fff';
      a.beginPath();
      a.arc(cx, cy, cell * 0.04, 0, Math.PI * 2);
      a.fill();
      a.fillStyle = '#000';
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2 + Math.PI / 12;
        a.beginPath();
        a.arc(cx + Math.cos(ang) * cell * 0.42, cy + Math.sin(ang) * cell * 0.42, cell * 0.022, 0, Math.PI * 2);
        a.fill();
      }
    }
  }

  // Block-print texture: slight ink unevenness so it reads as printed cloth/metal.
  const img = c.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = 0.88 + pfbm(x / size, y / size, 16, 3, 77) * 0.2;
      d[i] *= n;
      d[i + 1] *= n;
      d[i + 2] *= n;
    }
  }
  c.putImageData(img, 0, 0);
  return { color, alpha };
}

/* ----------------------------------------------------------------- glyphs */

// Blocky runway-numeral segments on a 3 x 5 grid (x0, y0, x1, y1), ICAO style.
const DIGIT_SEGMENTS = {
  0: [[0, 0, 3, 1], [0, 4, 3, 5], [0, 0, 1, 5], [2, 0, 3, 5]],
  1: [[1, 0, 2, 5], [0.4, 0, 1, 1]],
  2: [[0, 0, 3, 1], [2, 0, 3, 2.5], [0, 2, 3, 3], [0, 2.5, 1, 5], [0, 4, 3, 5]],
  3: [[0, 0, 3, 1], [2, 0, 3, 5], [0.6, 2, 3, 3], [0, 4, 3, 5]],
  4: [[0, 0, 1, 3], [0, 2, 3, 3], [2, 0, 3, 5]],
  5: [[0, 0, 3, 1], [0, 0, 1, 2.5], [0, 2, 3, 3], [2, 2.5, 3, 5], [0, 4, 3, 5]],
  6: [[0, 0, 3, 1], [0, 0, 1, 5], [0, 2, 3, 3], [2, 2.5, 3, 5], [0, 4, 3, 5]],
  7: [[0, 0, 3, 1], [2, 0, 3, 5]],
  8: [[0, 0, 3, 1], [0, 2, 3, 3], [0, 4, 3, 5], [0, 0, 1, 5], [2, 0, 3, 5]],
  9: [[0, 0, 3, 1], [0, 0, 1, 2.5], [0, 2, 3, 3], [2, 0, 3, 5], [0, 4, 3, 5]],
  L: [[0, 0, 1, 5], [0, 4, 3, 5]],
  R: [[0, 0, 3, 1], [0, 0, 1, 5], [2, 0, 3, 2.5], [0, 2, 3, 3], [1.6, 3, 2.6, 5]],
  C: [[0, 0, 3, 1], [0, 0, 1, 5], [0, 4, 3, 5]],
};

/**
 * Runway designator canvas ("02" / "20"): white blocky numerals on a
 * transparent ground, proportioned 9 m tall glyphs (Annex 14 style).
 * The texture's +v points towards the threshold (read by landing pilots).
 */
function designatorTexture(text, height = 512) {
  const glyphs = String(text).split('');
  const unit = height / 6;
  const gw = unit * 3;
  const gap = unit * 1.2;
  const width = Math.ceil(glyphs.length * gw + (glyphs.length - 1) * gap + unit);
  const canvas = createCanvas(THREE.MathUtils.ceilPowerOfTwo(width), height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  const ox0 = (canvas.width - (glyphs.length * gw + (glyphs.length - 1) * gap)) / 2;
  glyphs.forEach((ch, gi) => {
    const segs = DIGIT_SEGMENTS[ch];
    if (!segs) return;
    const ox = ox0 + gi * (gw + gap);
    const oy = unit * 0.5;
    for (const [x0, y0, x1, y1] of segs) ctx.fillRect(ox + x0 * unit, oy + y0 * unit, (x1 - x0) * unit, (y1 - y0) * unit);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.userData.aspect = canvas.width / canvas.height;
  return tex;
}

/* ---------------------------------------------------------------- sprites */

function radialSprite(size, rgb, falloff = 1.0) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.pow(clamp(1 - d, 0, 1), 2 * falloff);
      const i = (y * size + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft billowing dust puff (alpha), used by the dust-storm sheets and kick-up. */
function dustPuffTexture(size = 128, seed = 31) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = fbm2(u * 4, v * 4, 5, 2.0, 0.55, seed);
      const a = clamp((1 - d) * 1.4, 0, 1) * smoothstep(0.25, 0.75, n + (1 - d) * 0.3);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Footprint decal (kept from the benchmark: used for sand footsteps). */
function footprintTexture(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.58, size * 0.17, size * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.22, size * 0.13, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x / size - 0.5, y / size - 0.5) * 2;
      img.data[i + 3] *= clamp(1 - d, 0, 1) * (0.7 + valueNoise2(x * 0.4, y * 0.4, 3) * 0.3);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ripple normal map for water / puddles (seamless). */
function waterNormalTexture(size = 256, seed = 5) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = pfbm(u, v, 8, 4, seed) * 0.6 + pfbm(u, v, 24, 3, seed + 4) * 0.4;
    }
  }
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height[y * size + wrapIndex(x + 1, size)] - height[y * size + wrapIndex(x - 1, size)];
      const dy = height[wrapIndex(y + 1, size) * size + x] - height[wrapIndex(y - 1, size) * size + x];
      const nx = -dx * 6;
      const ny = dy * 6;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = (nx / len) * 127.5 + 127.5;
      data[i + 1] = (ny / len) * 127.5 + 127.5;
      data[i + 2] = (1 / len) * 127.5 + 127.5;
      data[i + 3] = 255;
    }
  }
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Low-frequency variation map (RGBA = four independent seamless fbm fields)
 * sampled at kilometre scale by the material library to break up tiling.
 */
function macroTexture(size = 256, seed = 1234) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i] = pfbm(u, v, 4, 5, seed) * 255;
      data[i + 1] = pfbm(u, v, 8, 4, seed + 10) * 255;
      data[i + 2] = pfbm(u, v, 16, 3, seed + 20) * 255;
      data[i + 3] = pfbm(u, v, 3, 4, seed + 30) * 255;
    }
  }
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  // Premultiplication would corrupt the alpha-channel noise field.
  tex.premultiplyAlpha = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- library */

/** Names `preload()` warms, in priority order (most visible first). */
const PRELOAD = [
  'macro', 'asphaltOld', 'asphaltNew', 'concrete', 'concreteApron', 'sand', 'soilCut', 'soilFill',
  'gravelSubbase', 'crushedBase', 'dryGrass', 'markingWear', 'paintWear', 'roofMetal', 'plaster',
  'brick', 'tile', 'ajrak', 'waterNormal', 'glow', 'dustPuff',
];

/**
 * Lazily-built, cached texture library. Every accessor builds on first use;
 * `preload(nextFrame)` warms everything with a yield between sets so the boot
 * screen keeps animating.
 */
export class TextureLibrary {
  constructor(quality) {
    this.quality = quality;
    this.cache = new Map();
    // Let the Engine's lazily-built MaterialLibrary share this library.
    if (quality && !quality.textureLibrary) quality.textureLibrary = this;
  }

  /** Texel size per tier. Hero sets (pavements, sand, floor) get the larger size. */
  _size(hero) {
    const tier = this.quality ? this.quality.tier : 'medium';
    const base = tier === 'ultra' ? 1024 : tier === 'high' ? 512 : tier === 'medium' ? 512 : 256;
    return hero ? base : Math.max(256, base / 2);
  }

  get anisotropy() {
    return this.quality && this.quality.anisotropy ? this.quality.anisotropy : 4;
  }

  _get(key, factory) {
    let v = this.cache.get(key);
    if (!v) {
      v = factory();
      this.cache.set(key, v);
    }
    return v;
  }

  asphaltOld() { return this._get('asphaltOld', () => asphaltOldSet(this._size(true), 1101)); }
  asphaltNew() { return this._get('asphaltNew', () => asphaltNewSet(this._size(true), 1202)); }
  concrete() { return this._get('concrete', () => concreteSet(this._size(true), 1303, { slabs: 2 })); }
  concreteApron() { return this._get('concreteApron', () => concreteSet(this._size(true), 1404, { slabs: 2, apron: true })); }
  sand() { return this._get('sand', () => sandSet(this._size(true), 1505)); }
  soilCut() { return this._get('soilCut', () => soilCutSet(this._size(false), 1606)); }
  soilFill() { return this._get('soilFill', () => soilFillSet(this._size(false), 1707)); }
  gravelSubbase() { return this._get('gravelSubbase', () => gravelSet(this._size(false), 1808, false)); }
  crushedBase() { return this._get('crushedBase', () => gravelSet(this._size(false), 1909, true)); }
  dryGrass() { return this._get('dryGrass', () => dryGrassSet(this._size(false), 2010)); }
  brick() { return this._get('brick', () => brickSet(this._size(false), 2111)); }
  plaster() { return this._get('plaster', () => plasterSet(this._size(false), 2212)); }
  tile() { return this._get('tile', () => tileSet(this._size(true), 2313)); }
  roofMetal() { return this._get('roofMetal', () => roofMetalSet(this._size(false), 2414)); }
  paintWear() { return this._get('paintWear', () => paintWearSet(256, 2515)); }
  markingWear() { return this._get('markingWear', () => markingWearSet(256, 2616)); }
  macro() { return this._get('macro', () => macroTexture(256, 2717)); }

  /** { map, alphaMap, size } — Ajrak block print and its perforation mask. */
  ajrak() {
    return this._get('ajrak', () => {
      const size = this._size(true) >= 1024 ? 1024 : 512;
      const { color, alpha } = ajrakCanvases(size);
      const map = new THREE.CanvasTexture(color);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = this.anisotropy;
      const alphaMap = new THREE.CanvasTexture(alpha);
      alphaMap.colorSpace = THREE.NoColorSpace;
      alphaMap.wrapS = alphaMap.wrapT = THREE.RepeatWrapping;
      alphaMap.anisotropy = this.anisotropy;
      return { map, alphaMap, size };
    });
  }

  /** Runway designator glyph texture ("02", "20", "02L"…); `texture.userData.aspect` = w/h. */
  designator(text) {
    return this._get(`designator:${text}`, () => designatorTexture(text, 512));
  }

  waterNormal() { return this._get('waterNormal', () => waterNormalTexture(256, 5)); }
  glow() { return this._get('glow', () => radialSprite(128, [255, 214, 160], 1.0)); }
  dust() { return this._get('dust', () => radialSprite(64, [235, 220, 190], 0.8)); }
  dustPuff() { return this._get('dustPuff', () => dustPuffTexture(128, 31)); }
  footprint() { return this._get('footprint', () => footprintTexture(64)); }

  /** Warm every texture with a yield between sets. `nextFrame` returns a Promise. */
  async preload(nextFrame = null) {
    for (const name of PRELOAD) {
      this[name]();
      if (nextFrame) await nextFrame();
    }
  }

  dispose() {
    for (const entry of this.cache.values()) {
      if (entry instanceof THREE.Texture) entry.dispose();
      else if (entry && typeof entry === 'object') {
        for (const t of Object.values(entry)) if (t instanceof THREE.Texture) t.dispose();
      }
    }
    this.cache.clear();
  }
}

export { makeRng, worley2 };
