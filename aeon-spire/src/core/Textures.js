/**
 * AEON SPIRE — procedural texture factory.
 *
 * Section I of the build directive requires every texture to be original.
 * Nothing here is downloaded: each map is painted into an offscreen canvas
 * at load time from the noise primitives in Noise.js, then uploaded as a
 * CanvasTexture. Height fields are converted to normal maps with a Sobel
 * operator, and roughness maps are derived from the same height field so
 * surfaces stay physically coherent.
 *
 * Textures are cached by key and generated lazily, so a zone that the
 * camera never enters never pays for its interior finishes.
 */

import * as THREE from 'three';
import { ValueNoise, Worley } from './Noise.js';
import { clamp, rng, TAU } from './MathUtil.js';

const n1 = new ValueNoise(1001);
const n2 = new ValueNoise(2002);
const n3 = new ValueNoise(3003);

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Sobel-filter a height field (Float32Array, size×size) into a normal map. */
function heightToNormal(height, size, strength = 2.2) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Turn a scalar field into a greyscale canvas (roughness / metalness / AO). */
function fieldToCanvas(field, size, lo = 0, hi = 1) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = clamp(lo + field[i] * (hi - lo), 0, 1) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paint a per-pixel colour field via a callback returning [r,g,b] in 0..1. */
function paint(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rgb = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      d[i] = clamp(rgb[0], 0, 1) * 255;
      d[i + 1] = clamp(rgb[1], 0, 1) * 255;
      d[i + 2] = clamp(rgb[2], 0, 1) * 255;
      d[i + 3] = rgb.length > 3 ? clamp(rgb[3], 0, 1) * 255 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const hexRGB = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/* ------------------------------------------------------------------ */
/* The factory                                                         */
/* ------------------------------------------------------------------ */

export class TextureFactory {
  /** @param {number} size base texture resolution (quality-tier dependent) */
  constructor(size = 512) {
    this.size = size;
    this.cache = new Map();
    this.generated = 0;
  }

  /** Lazily build and cache a texture set under `key`. */
  get(key, builder, opts) {
    let v = this.cache.get(key);
    if (!v) {
      v = builder ? builder.call(this, this.size, this) : this[key](this.size, opts);
      this.generated++;
      this.cache.set(key, v);
    }
    return v;
  }

  dispose() {
    for (const set of this.cache.values()) {
      for (const t of Object.values(set)) if (t && t.isTexture) t.dispose();
    }
    this.cache.clear();
  }

  /* ---------- Stone family ---------- */

  /** Honed pale limestone — Canal Concourse water-level flooring (D.1). */
  limestone(size) {
    const h = new Float32Array(size * size);
    const base = hexRGB(0xd9d2c4);
    const dark = hexRGB(0xb3aa99);
    const canvas = paint(size, (u, v, x, y) => {
      const grain = n1.tileFbm(u * 9, v * 9, 9, 5);
      const fleck = n2.noise2(u * 180, v * 180);
      // Slab joints on a 1/4 grid, slightly recessed.
      const jx = Math.min((u * 4) % 1, 1 - (u * 4) % 1);
      const jy = Math.min((v * 4) % 1, 1 - (v * 4) % 1);
      const joint = 1 - clamp(Math.min(jx, jy) / 0.012, 0, 1);
      let c = mix(dark, base, grain * 0.75 + 0.25);
      c = shade(c, 0.94 + fleck * 0.12);
      c = mix(c, shade(dark, 0.72), joint);
      h[y * size + x] = grain * 0.7 + fleck * 0.1 - joint * 0.9;
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.42 + h[i] * 0.18;
    return {
      map: toTexture(canvas, { repeat: 1 }),
      normalMap: toTexture(heightToNormal(h, size, 1.4), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** Rough coursed stone for barrel vaults and podium walls. */
  vaultStone(size) {
    const h = new Float32Array(size * size);
    const warm = hexRGB(0xc8bda8);
    const cool = hexRGB(0x9d9382);
    const canvas = paint(size, (u, v, x, y) => {
      const course = Math.floor(v * 10);
      const off = (course % 2) * 0.5;
      const bu = (u * 5 + off) % 1;
      const bv = (v * 10) % 1;
      const mortar =
        clamp(1 - Math.min(bu, 1 - bu) / 0.045, 0, 1) *
        0.9 + clamp(1 - Math.min(bv, 1 - bv) / 0.07, 0, 1) * 0.9;
      const m = clamp(mortar, 0, 1);
      const tone = n1.fbm(u * 14 + course * 3.1, v * 14, 4);
      const pit = n3.noise2(u * 90, v * 90);
      let c = mix(cool, warm, tone);
      c = shade(c, 0.9 + pit * 0.18);
      c = mix(c, hexRGB(0x8a8175), m * 0.85);
      h[y * size + x] = (1 - m) * (0.6 + tone * 0.4) + pit * 0.08;
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.78 - h[i] * 0.12;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 3.0), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** Reclaimed herringbone brick — Market Loggia floor (D.1). */
  brickHerringbone(size) {
    const h = new Float32Array(size * size);
    const r = rng(4242);
    const tones = [hexRGB(0xa2543c), hexRGB(0x8e4a37), hexRGB(0xb56a49), hexRGB(0x7d4433), hexRGB(0xa9614a)];
    const cell = size / 8;              // herringbone module
    const canvas = paint(size, (u, v, x, y) => {
      // Classic herringbone: alternate horizontal/vertical bricks in 2×1 blocks.
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      const horiz = ((gx + gy) & 1) === 0;
      let bx, by, id;
      if (horiz) {
        bx = ((x / cell) % 2) / 2; by = (y / cell) % 1;
        id = Math.floor(x / (cell * 2)) * 31 + gy * 17;
      } else {
        bx = (x / cell) % 1; by = ((y / cell) % 2) / 2;
        id = gx * 13 + Math.floor(y / (cell * 2)) * 7;
      }
      const jointU = clamp(1 - Math.min(bx, 1 - bx) / 0.05, 0, 1);
      const jointV = clamp(1 - Math.min(by, 1 - by) / 0.05, 0, 1);
      const joint = clamp(Math.max(jointU, jointV), 0, 1);
      const rr = rng(id >>> 0);
      const tone = tones[Math.floor(rr() * tones.length) % tones.length];
      const wear = n2.fbm(u * 22, v * 22, 4);
      let c = shade(tone, 0.82 + wear * 0.34);
      c = mix(c, hexRGB(0x9c9184), joint * 0.9);
      h[y * size + x] = (1 - joint) * (0.55 + wear * 0.45);
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.72 - h[i] * 0.1;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 2.6), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** Polished travertine — Sail Atrium Grand Lobby floor (D.2). */
  travertine(size) {
    const h = new Float32Array(size * size);
    const light = hexRGB(0xe4d9c4);
    const mid = hexRGB(0xcbbda3);
    const deep = hexRGB(0xa8977c);
    const canvas = paint(size, (u, v, x, y) => {
      // Travertine reads as horizontal sediment banding with elongated voids.
      const band = n1.fbm(u * 3, v * 26, 5);
      const vein = n2.ridged(u * 4 + band * 0.4, v * 30, 3);
      const holes = clamp((n3.noise2(u * 60, v * 22) - 0.62) * 6, 0, 1);
      let c = mix(mid, light, band);
      c = mix(c, deep, vein * 0.35);
      c = mix(c, shade(deep, 0.7), holes * 0.55);
      h[y * size + x] = band * 0.4 - holes * 0.8;
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.16 + Math.max(0, -h[i]) * 0.55;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.6), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** White marble with grey veining — Sky Lobby + Leaning Observatory stair. */
  marble(size) {
    const h = new Float32Array(size * size);
    const white = hexRGB(0xf1efe9);
    const grey = hexRGB(0x9aa0a6);
    const warmGrey = hexRGB(0xbfb8ad);
    const canvas = paint(size, (u, v, x, y) => {
      const warp = n1.fbm(u * 3, v * 3, 4) * 0.55;
      const vein = n2.ridged(u * 2.2 + warp, v * 2.2 - warp, 5);
      const fine = n3.ridged(u * 9 + warp * 2, v * 9, 3);
      let c = mix(white, warmGrey, n1.fbm(u * 5, v * 5, 3) * 0.25);
      c = mix(c, grey, Math.pow(vein, 2.4) * 0.85);
      c = mix(c, shade(grey, 0.85), Math.pow(fine, 5) * 0.4);
      h[y * size + x] = vein * 0.25;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.7), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.08, 0.2), { srgb: false })
    };
  }

  /** Backlit onyx — reception desk (D.2). Emissive-friendly, warm amber. */
  onyx(size) {
    const canvas = paint(size, (u, v) => {
      const warp = n1.fbm(u * 2, v * 4, 4);
      const band = n2.ridged(u * 1.6 + warp * 0.8, v * 6, 5);
      const amber = hexRGB(0xd8a15a);
      const cream = hexRGB(0xf6e3c4);
      const brown = hexRGB(0x8a5a2c);
      let c = mix(amber, cream, Math.pow(band, 1.6));
      c = mix(c, brown, clamp(1 - band * 1.4, 0, 1) * 0.6);
      return c;
    });
    return { map: toTexture(canvas), emissiveMap: toTexture(canvas) };
  }

  /** Textured slate — Sail Atrium cascading water wall (D.2). */
  slate(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const strip = Math.floor(v * 22);
      const rr = rng(strip * 977 + 3);
      const depth = rr();
      const inStrip = (v * 22) % 1;
      const edge = clamp(1 - Math.min(inStrip, 1 - inStrip) / 0.09, 0, 1);
      const grain = n1.fbm(u * 30, v * 60 + strip * 5, 4);
      const base = mix(hexRGB(0x3a4046), hexRGB(0x596169), grain);
      let c = shade(base, 0.7 + depth * 0.5);
      c = shade(c, 1 - edge * 0.45);
      h[y * size + x] = depth * 0.7 + grain * 0.3 - edge * 0.6;
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.62 + h[i] * 0.2;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 4.0), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /* ---------- Composite / engineered finishes ---------- */

  /** Radial-pattern terrazzo — Ring Deck flooring (D.3). */
  terrazzo(size) {
    const w = new Worley(515, 1);
    const h = new Float32Array(size * size);
    const chipCols = [
      hexRGB(0xd8d3c8), hexRGB(0x8f9aa6), hexRGB(0xc0a882), hexRGB(0x6f7a86),
      hexRGB(0xb8a88f), hexRGB(0xe8e4da), hexRGB(0x556069)
    ].filter(Boolean);
    const matrix = hexRGB(0xece7dd);
    const canvas = paint(size, (u, v, x, y) => {
      // Sample cells in polar space so the aggregate follows the ring's curve.
      const cx = u - 0.5, cy = v - 0.5;
      const ang = Math.atan2(cy, cx) / TAU + 0.5;
      const rad = Math.hypot(cx, cy);
      const e = w.eval(ang * 26, rad * 26);
      const chip = clamp((0.42 - e.d1) * 7, 0, 1);
      const col = chipCols[Math.floor(e.id * chipCols.length) % chipCols.length];
      const speck = n2.noise2(u * 200, v * 200);
      // Faint radial score lines every 15 degrees.
      const score = clamp(1 - Math.abs(((ang * 24) % 1) - 0.5) * 2 / 0.04, 0, 1);
      let c = mix(shade(matrix, 0.96 + speck * 0.08), col, chip * 0.92);
      c = shade(c, 1 - score * 0.18);
      h[y * size + x] = chip * 0.35 - score * 0.4;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.9), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.22, 0.34), { srgb: false })
    };
  }

  /** Dark polished concrete — Spire Crown floor plates (D.4). */
  polishedConcrete(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const grain = n1.fbm(u * 12, v * 12, 5);
      const agg = clamp((n3.noise2(u * 70, v * 70) - 0.55) * 5, 0, 1);
      const trowel = n2.fbm(u * 3.5, v * 3.5, 3);
      let c = mix(hexRGB(0x30343a), hexRGB(0x4a4f57), grain * 0.6 + trowel * 0.4);
      c = mix(c, hexRGB(0x6b7079), agg * 0.5);
      h[y * size + x] = grain * 0.3 + agg * 0.2;
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.24 + h[i] * 0.25;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.8), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** Warm cream plaster — Canal Concourse walls (D.1) and Observatory (D.5). */
  plaster(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const sweep = n1.fbm(u * 6, v * 6, 4);
      const fine = n2.fbm(u * 40, v * 40, 3);
      const stain = clamp(n3.fbm(u * 2, v * 2 + 0.4, 3) * 1.4 - 0.55, 0, 1);
      let c = mix(hexRGB(0xe6dcc7), hexRGB(0xf3ecdc), sweep);
      c = shade(c, 0.97 + fine * 0.06);
      c = mix(c, hexRGB(0xcabfa5), stain * 0.35);
      h[y * size + x] = sweep * 0.5 + fine * 0.5;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.9), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.72, 0.9), { srgb: false })
    };
  }

  /** Painted timber tie-beams — muted ochre / venetian red (D.1). */
  paintedTimber(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const grain = n1.fbm(u * 3, v * 90, 4);
      const knot = clamp(1 - Math.hypot(u - 0.62, v - 0.4) * 9, 0, 1);
      const wear = n2.fbm(u * 18, v * 18, 3);
      const ochre = hexRGB(0xa8632f);
      const venet = hexRGB(0x8d3b2c);
      let c = mix(ochre, venet, n3.fbm(u * 1.5, v * 1.5, 2));
      c = shade(c, 0.88 + grain * 0.22);
      c = mix(c, hexRGB(0x6d4526), knot * 0.6);
      c = mix(c, hexRGB(0x8a7358), clamp(wear * 1.6 - 0.9, 0, 1) * 0.5);   // worn-through paint
      h[y * size + x] = grain * 0.6 + knot * 0.3;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.2), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.55, 0.8), { srgb: false })
    };
  }

  /** Anodised bronze — Sail Atrium diagrid ribs (D.2 / Phase 3). */
  bronze(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const brush = n1.fbm(u * 4, v * 220, 3);
      const patina = n2.fbm(u * 7, v * 7, 4);
      let c = mix(hexRGB(0xa8813f), hexRGB(0xe0bb78), brush * 0.5 + patina * 0.5);
      c = shade(c, 0.92 + brush * 0.18);
      h[y * size + x] = brush;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.5), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.28, 0.46), { srgb: false })
    };
  }

  /** Brushed aluminium — Beacon Room (D.4) and equipment bodies. */
  brushedMetal(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const brush = n1.noise2(u * 3, v * 320) * 0.6 + n2.noise2(u * 2, v * 700) * 0.4;
      const smudge = n3.fbm(u * 5, v * 5, 3);
      let c = mix(hexRGB(0x8f959c), hexRGB(0xc3c9cf), brush);
      c = shade(c, 0.94 + smudge * 0.1);
      h[y * size + x] = brush;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.45), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.26, 0.44), { srgb: false })
    };
  }

  /** Painted structural steel — cranes, trusses, plant. */
  paintedSteel(size, { hex = 0xd8552f } = {}) {
    const h = new Float32Array(size * size);
    const base = hexRGB(hex);
    const canvas = paint(size, (u, v, x, y) => {
      const chip = clamp((n2.noise2(u * 45, v * 45) - 0.68) * 5, 0, 1);
      const dirt = n1.fbm(u * 8, v * 8, 4);
      let c = shade(base, 0.85 + dirt * 0.3);
      c = mix(c, hexRGB(0x6b5348), chip * 0.75);   // exposed primer / rust
      h[y * size + x] = dirt * 0.4 - chip * 0.5;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.0), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.42, 0.68), { srgb: false })
    };
  }

  /* ---------- Soft finishes ---------- */

  /** Geometric carpet echoing the sail's curve — typical floors (D.2). */
  carpetSail(size) {
    const canvas = paint(size, (u, v) => {
      const cx = u - 0.15, cy = v - 1.1;
      const r = Math.hypot(cx, cy * 0.55);
      const rings = Math.sin(r * 34) * 0.5 + 0.5;
      const chev = Math.abs(((u * 10 + v * 3) % 1) - 0.5) * 2;
      const fuzz = n1.noise2(u * 260, v * 260);
      const deep = hexRGB(0x2f3a4a);
      const mid = hexRGB(0x415066);
      const gold = hexRGB(0x9c7f4e);
      let c = mix(deep, mid, rings * 0.7);
      c = mix(c, gold, clamp(1 - chev * 4, 0, 1) * 0.35 * rings);
      c = shade(c, 0.92 + fuzz * 0.16);
      return c;
    });
    return {
      map: toTexture(canvas),
      roughnessMap: toTexture(fieldToCanvas(new Float32Array(size * size).fill(0.94), size), { srgb: false })
    };
  }

  /** Striped canvas awning — Market Loggia stalls (D.1). */
  awningStripe(size, { a = 0xf2ead7, b = 0x9c3b34 } = {}) {
    const ca = hexRGB(a), cb = hexRGB(b);
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const stripe = Math.floor(u * 8) % 2 === 0 ? ca : cb;
      const weave = (Math.sin(x * 1.6) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 1.6) * 0.5 + 0.5) * 0.5;
      const sag = n1.fbm(u * 5, v * 5, 3);
      h[y * size + x] = weave;
      return shade(stripe, 0.88 + weave * 0.12 + sag * 0.1);
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.6), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.82, 0.95), { srgb: false })
    };
  }

  /** Living green wall / planting mass (D.2 lobby, D.3 sky gardens). */
  foliage(size) {
    const h = new Float32Array(size * size);
    const w = new Worley(881, 1);
    const canvas = paint(size, (u, v, x, y) => {
      const e = w.eval(u * 34, v * 34);
      const leaf = clamp((0.5 - e.d1) * 4, 0, 1);
      const tone = e.id;
      const shadow = n1.fbm(u * 8, v * 8, 4);
      const dark = hexRGB(0x28331d);
      const mid = hexRGB(0x4d5c31);
      const light = hexRGB(0x8b9455);
      let c = mix(dark, mid, tone);
      c = mix(c, light, leaf * 0.55 * tone);
      c = shade(c, 0.66 + shadow * 0.6);
      h[y * size + x] = leaf * 0.7 + shadow * 0.3;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 2.4), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.7, 0.95), { srgb: false })
    };
  }

  /** Manicured garden lawn — Reflection Court quadrants (D.6). */
  lawn(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const blade = n1.noise2(u * 300, v * 300);
      const patch = n2.fbm(u * 9, v * 9, 4);
      const mow = Math.sin(v * Math.PI * 16) * 0.5 + 0.5;   // mown stripes
      let c = mix(hexRGB(0x4c5a30), hexRGB(0x77854a), patch);
      // Sun-bleached patches where the irrigation does not quite reach.
      c = mix(c, hexRGB(0x9d9a68), clamp((n3.fbm(u * 3.5, v * 3.5, 3) - 0.55) * 2.6, 0, 1));
      c = shade(c, 0.88 + blade * 0.2 + mow * 0.08);
      h[y * size + x] = blade;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.4), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.85, 0.98), { srgb: false })
    };
  }

  /* ---------- Wonder Annex finishes (D.7) ---------- */

  /** Dark glossy resin — Motorsport Pavilion display floor. */
  glossResin(size) {
    const canvas = paint(size, (u, v) => {
      const swirl = n1.fbm(u * 6, v * 6, 4);
      const flake = clamp((n3.noise2(u * 260, v * 260) - 0.8) * 8, 0, 1);
      let c = mix(hexRGB(0x0d0f13), hexRGB(0x1c2028), swirl);
      c = mix(c, hexRGB(0xc0c6cf), flake * 0.5);
      return c;
    });
    return {
      map: toTexture(canvas),
      roughnessMap: toTexture(fieldToCanvas(new Float32Array(size * size).fill(0.07), size), { srgb: false })
    };
  }

  /** Bright poured rubber/resin in a primary colour — Block Pavilion. */
  primaryResin(size, { hex = 0xe03a2f } = {}) {
    const base = hexRGB(hex);
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const speck = n2.noise2(u * 150, v * 150);
      const pour = n1.fbm(u * 5, v * 5, 3);
      h[y * size + x] = speck * 0.4 + pour * 0.6;
      return shade(base, 0.9 + pour * 0.16 + speck * 0.06);
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 0.5), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.3, 0.45), { srgb: false })
    };
  }

  /** Patterned promenade tile — Themed Promenade Arcade (D.7). */
  promenadeTile(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const tu = (u * 6) % 1, tv = (v * 6) % 1;
      const gx = Math.floor(u * 6), gy = Math.floor(v * 6);
      const grout = clamp(1 - Math.min(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv)) / 0.035, 0, 1);
      // Alternating star/octagon motif.
      const d = Math.abs(tu - 0.5) + Math.abs(tv - 0.5);
      const motif = clamp((0.34 - d) * 8, 0, 1);
      const warm = hexRGB(0xd9c9a9), teal = hexRGB(0x2f6b6b), cream = hexRGB(0xefe6d2);
      let c = ((gx + gy) & 1) ? mix(cream, warm, 0.4) : mix(warm, cream, 0.4);
      c = mix(c, teal, motif * 0.8);
      c = mix(c, hexRGB(0x9c917f), grout * 0.9);
      const wear = n1.fbm(u * 20, v * 20, 3);
      c = shade(c, 0.9 + wear * 0.18);
      h[y * size + x] = (1 - grout) * 0.6 + wear * 0.2;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.6), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.24, 0.44), { srgb: false })
    };
  }

  /** Expanded metal mesh — Spire gallery flooring (D.4). Alpha-cut. */
  expandedMesh(size) {
    const canvas = paint(size, (u, v) => {
      const tu = (u * 16) % 1, tv = (v * 16) % 1;
      const d = Math.abs(tu - 0.5) * 1.6 + Math.abs(tv - 0.5);
      const solid = d > 0.42 ? 1 : 0;
      const metal = hexRGB(0x767c85);
      return [metal[0], metal[1], metal[2], solid];
    });
    const t = toTexture(canvas);
    return { map: t, alphaMap: toTexture(canvas, { srgb: false }) };
  }

  /* ---------- Environment ---------- */

  /** Exterior paving / plaza granite. */
  paving(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const gx = Math.floor(u * 6), gy = Math.floor(v * 6);
      const tu = (u * 6) % 1, tv = (v * 6) % 1;
      const joint = clamp(1 - Math.min(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv)) / 0.03, 0, 1);
      const rr = rng(gx * 71 + gy * 131);
      const shadeK = 0.86 + rr() * 0.24;
      const speck = n2.noise2(u * 220, v * 220);
      const grain = n1.fbm(u * 16, v * 16, 4);
      let c = mix(hexRGB(0x8d8e8c), hexRGB(0xb5b4ae), grain);
      c = shade(c, shadeK + speck * 0.12);
      c = mix(c, hexRGB(0x6f7070), joint * 0.8);
      h[y * size + x] = (1 - joint) * (0.5 + grain * 0.5);
      return c;
    });
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = 0.66 - h[i] * 0.12;
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 1.8), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size), { srgb: false })
    };
  }

  /** Compacted site ground — construction mode (E.7). */
  siteGround(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const dirt = n1.fbm(u * 10, v * 10, 5);
      const rut = n2.ridged(u * 4, v * 16, 3);
      const gravel = clamp((n3.noise2(u * 130, v * 130) - 0.62) * 5, 0, 1);
      let c = mix(hexRGB(0x6e5f4c), hexRGB(0x8f7f66), dirt);
      c = mix(c, hexRGB(0x554a3c), rut * 0.4);
      c = mix(c, hexRGB(0x9d968b), gravel * 0.5);
      h[y * size + x] = dirt * 0.6 + gravel * 0.4 - rut * 0.3;
      return c;
    });
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(h, size, 2.2), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.82, 0.98), { srgb: false })
    };
  }

  /** Water surface normal map — canal, reflecting pool, basins. */
  waterNormal(size) {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const a = n1.tileFbm(u * 10, v * 10, 10, 4);
        const b = n2.tileFbm(u * 22 + 3, v * 22, 22, 3);
        h[y * size + x] = a * 0.7 + b * 0.3;
      }
    }
    return { normalMap: toTexture(heightToNormal(h, size, 1.1), { srgb: false }) };
  }

  /**
   * Animated-caustic light pattern (D.1 modeling note: fake caustics with a
   * scrolling texture on an emissive plane, not real ray tracing).
   */
  caustics(size) {
    const canvas = paint(size, (u, v) => {
      const a = n1.tileFbm(u * 7, v * 7, 7, 3);
      const b = n2.tileFbm(u * 11 + 2, v * 11, 11, 3);
      const c1 = Math.pow(clamp(1 - Math.abs(a - b) * 5.5, 0, 1), 2.2);
      const g = c1 * 0.95;
      return [g * 0.72, g * 0.9, g];
    });
    const t = toTexture(canvas);
    return { map: t, emissiveMap: t };
  }

  /** Facade window grid used as an emissive map at dusk / night (E.4). */
  windowGrid(size, { cols = 16, rows = 24, lit = 0.62, seed = 7 } = {}) {
    const r = rng(seed);
    const state = new Float32Array(cols * rows);
    for (let i = 0; i < state.length; i++) state[i] = r() < lit ? 0.45 + r() * 0.55 : 0.0;
    const canvas = paint(size, (u, v) => {
      const cx = Math.floor(u * cols), cy = Math.floor(v * rows);
      const tu = (u * cols) % 1, tv = (v * rows) % 1;
      const inside = tu > 0.12 && tu < 0.88 && tv > 0.16 && tv < 0.84 ? 1 : 0;
      const k = state[cy * cols + cx] * inside;
      const warm = [1.0, 0.86, 0.66];
      const flicker = 0.9 + n1.noise2(cx * 3.1, cy * 5.7) * 0.2;
      return [warm[0] * k * flicker, warm[1] * k * flicker, warm[2] * k * flicker];
    });
    return { emissiveMap: toTexture(canvas), map: toTexture(canvas) };
  }

  /**
   * Unitised curtain wall — the cladding module the whole campus wears.
   *
   * One tile is `cols` × `rows` storey-height units. Each storey is an
   * opaque spandrel band sitting over a run of vision glass, the two
   * separated by a proud aluminium transom, with mullions up every unit
   * joint. The alpha map is the part that matters: the spandrel is nearly
   * opaque and the vision glass is not, so the eye reads floor lines from a
   * kilometre out instead of one continuous tinted balloon. Panels carry a
   * per-unit tint and roughness jitter, and a shallow pillow in the normal
   * map reproduces the wavy reflection real laminated glass has under wind
   * load — the detail that stops a facade looking like moulded plastic.
   */
  curtainWall(size, {
    cols = 8, rows = 10, spandrel = 0x5d6773, glassA = 0xa8bcc6,
    glassB = 0x8195a4, mullion = 0xc2c8cd, lit = 0.5, seed = 11,
    band = 0.36, pillow = 1, warmSpandrel = 0
  } = {}) {
    const cSp = mix(hexRGB(spandrel), hexRGB(0x7a6b57), warmSpandrel);
    const cGa = hexRGB(glassA), cGb = hexRGB(glassB), cMu = hexRGB(mullion);

    /* Deterministic per-unit hash — cheaper than carrying an rng across
       three passes over the same grid, and identical in each of them. */
    const h2 = (a, b, salt = 0) => {
      let n = ((a + 1) * 73856093) ^ ((b + 1) * 19349663) ^ ((seed + salt) * 83492791);
      n = (n ^ (n >>> 13)) >>> 0;
      n = Math.imul(n, 1274126177) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };

    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const metal = new Float32Array(size * size);
    const alpha = new Float32Array(size * size);
    const emis = [];

    const MW = 0.05;   // mullion half-width, in unit-widths
    const TW = 0.055;  // transom half-height, in unit-heights

    const albedo = paint(size, (u, v, x, y) => {
      const fu = u * cols, fv = v * rows;
      const cu = Math.floor(fu), cv = Math.floor(fv);
      const pu = fu - cu, pv = fv - cv;
      const i = y * size + x;

      const onMullion = pu < MW || pu > 1 - MW;
      const onTransom = pv < TW || pv > 1 - TW || Math.abs(pv - band) < TW * 0.8;
      const inSpandrel = pv < band;

      const j = h2(cu, cv);
      const j2 = h2(cu, cv, 991);

      let col, r, m, a, hgt;
      if (onMullion || onTransom) {
        /* Aluminium framing: proud of the glass, brushed, fully opaque. */
        const k = 0.9 + j2 * 0.16;
        col = shade(cMu, k);
        r = 0.34; m = 0.82; a = 1.0; hgt = 1.0;
      } else if (inSpandrel) {
        /* Back-painted spandrel over the floor slab and services zone. */
        const k = 0.88 + j * 0.2;
        col = shade(cSp, k);
        r = 0.44 + j2 * 0.16; m = 0.42; a = 0.97; hgt = 0.62;
      } else {
        /* Vision glass. The pillow is what makes reflections ripple. */
        const g = (pv - band) / (1 - band);
        const dome = Math.sin(Math.PI * pu) * Math.sin(Math.PI * g);
        col = mix(cGa, cGb, j);
        r = 0.03 + j2 * 0.05;
        m = 0.16;
        a = 0.28 + j * 0.12;
        hgt = 0.5 - pillow * 0.09 * dome;
      }

      height[i] = hgt; rough[i] = r; metal[i] = m; alpha[i] = a;
      return col;
    });

    /* Lit-window pass: only the vision band, and only some units, so the
       night elevation has the scattered pattern of a real occupied tower. */
    const emissive = paint(size, (u, v) => {
      const fu = u * cols, fv = v * rows;
      const cu = Math.floor(fu), cv = Math.floor(fv);
      const pu = fu - cu, pv = fv - cv;
      if (pv < band + TW || pv > 1 - TW || pu < MW || pu > 1 - MW) return [0, 0, 0];
      const on = h2(cu, cv, 4242);
      if (on > lit) return [0, 0, 0];
      const k = 0.45 + h2(cu, cv, 77) * 0.55;
      /* A few floors run cool (plant, lift lobbies); the rest run warm. */
      const cool = h2(cv, 0, 313) < 0.18;
      const tintc = cool ? [0.72, 0.86, 1.0] : [1.0, 0.84, 0.62];
      return [tintc[0] * k, tintc[1] * k, tintc[2] * k];
    });
    emis.push(emissive);

    return {
      map: toTexture(albedo),
      normalMap: toTexture(heightToNormal(height, size, 3.4), { srgb: false }),
      roughnessMap: toTexture(fieldToCanvas(rough, size, 0, 1), { srgb: false }),
      metalnessMap: toTexture(fieldToCanvas(metal, size, 0, 1), { srgb: false }),
      alphaMap: toTexture(fieldToCanvas(alpha, size, 0, 1), { srgb: false }),
      emissiveMap: toTexture(emissive)
    };
  }

  /** Subtle streak/dirt map for large glazing panels. */
  glassGrime(size) {
    const h = new Float32Array(size * size);
    const canvas = paint(size, (u, v, x, y) => {
      const streak = n1.fbm(u * 3, v * 40, 3);
      const dust = n2.fbm(u * 14, v * 14, 3);
      const k = 0.9 + streak * 0.08 + dust * 0.06;
      h[y * size + x] = streak;
      return [k, k, k];
    });
    return {
      map: toTexture(canvas),
      roughnessMap: toTexture(fieldToCanvas(h, size, 0.02, 0.13), { srgb: false })
    };
  }

  /** Night starfield for the sky dome (E.4 Night mode). */
  starfield(size) {
    const r = rng(31337);
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    const count = Math.floor(size * 9);
    for (let i = 0; i < count; i++) {
      const x = r() * size, y = r() * size;
      const mag = Math.pow(r(), 3.2);
      const rad = 0.16 + mag * 0.55;
      const a = 0.25 + mag * 0.75;
      const tint = r();
      const col = tint < 0.15 ? '190,205,255' : tint > 0.9 ? '255,225,190' : '255,255,255';
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.2, 0, TAU);
      ctx.fill();
    }
    // A faint galactic band.
    for (let i = 0; i < size * 6; i++) {
      const t = r();
      const x = t * size;
      const y = size * 0.42 + Math.sin(t * 3.1) * size * 0.09 + (r() - 0.5) * size * 0.1;
      ctx.fillStyle = `rgba(200,210,240,${0.02 + r() * 0.05})`;
      ctx.fillRect(x, y, 1.0, 1.0);
    }
    const t = toTexture(c, { repeat: 1 });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return { map: t };
  }

  /** A soft radial sprite used for dust, spray, glow points and lamp bloom. */
  glowSprite(size = 128) {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { map: t };
  }
}
