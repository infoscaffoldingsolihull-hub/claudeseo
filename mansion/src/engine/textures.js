/**
 * Procedural material library.
 *
 * Every surface in the mansion is generated from noise at start-up: marble
 * veining, sandstone bedding, brick courses, oak grain, turf, plaster.  There
 * is not a single downloaded image anywhere in the deliverable, which is what
 * lets the whole thing live in one HTML file and open from `file://`.
 *
 * All noise is *periodic* — the lattice wraps at the octave frequency — so
 * every texture tiles seamlessly no matter how many times it repeats across a
 * floor or a façade.
 *
 * Textures are built lazily on first request and cached, so a room the player
 * never enters costs nothing.
 */
import * as THREE from 'three';
import { hash2, clamp, mix, smootherstep } from './rng.js';

/* ------------------------------------------------------------ periodic noise */

/** Value noise whose lattice wraps at `period`, so the result tiles. */
function pvalue(u, v, period) {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);
  const w = (i, j) => hash2(((i % period) + period) % period, ((j % period) + period) % period);
  const a = w(xi, yi);
  const b = w(xi + 1, yi);
  const c = w(xi, yi + 1);
  const d = w(xi + 1, yi + 1);
  return mix(mix(a, b, xf), mix(c, d, xf), yf);
}

/** Periodic fBm; `period` doubles each octave so the tiling survives. */
function pfbm(u, v, period, octaves = 4, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let per = period;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * pvalue(u, v, per);
    norm += amp;
    amp *= gain;
    per *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Periodic ridged noise — the crease shapes used for veins and cracks. */
function pridged(u, v, period, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let per = period;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(pvalue(u, v, per) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.52;
    per *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/* ------------------------------------------------------------------ painting */

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * Fill a canvas from a per-pixel function.
 * @param fn (u, v) => [r, g, b] with components in 0..255
 */
function paint(size, fn) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const inv = 1 / size;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      fn((x + 0.5) * inv, (y + 0.5) * inv, out);
      const i = (y * size + x) * 4;
      data[i] = clamp(out[0], 0, 255);
      data[i + 1] = clamp(out[1], 0, 255);
      data[i + 2] = clamp(out[2], 0, 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Build a height field, then convert it to a tangent-space normal map. */
function paintNormal(size, heightFn, strength = 2.0) {
  const h = new Float32Array(size * size);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) h[y * size + x] = heightFn((x + 0.5) * inv, (y + 0.5) * inv);
  }
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Sobel over the wrapped height field keeps the normal map seamless too.
      const tl = at(x - 1, y - 1); const t = at(x, y - 1); const tr = at(x + 1, y - 1);
      const l = at(x - 1, y); const r = at(x + 1, y);
      const bl = at(x - 1, y + 1); const b = at(x, y + 1); const br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len;
      const nzn = nz / len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nzn * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Single-channel map (roughness, metalness) written to all three channels. */
function paintGrey(size, fn) {
  return paint(size, (u, v, out) => {
    const g = fn(u, v) * 255;
    out[0] = g; out[1] = g; out[2] = g;
  });
}

/* ------------------------------------------------------------ the materials */

/**
 * Each entry returns { albedo, normal?, rough?, strength? } as canvases.
 * `size` is the tier's texture resolution.
 */
const RECIPES = {
  /* Imported Botticino: warm cream ground, grey-gold veining, faint clouding. */
  marbleWhite: (size) => {
    const vein = (u, v) => {
      const warp = pfbm(u, v, 4, 3) * 0.35;
      return pridged(u + warp, v * 0.55 + warp * 0.6, 3, 5);
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const cloud = pfbm(u, v, 3, 4);
        const vn = vein(u, v);
        const sharp = Math.pow(clamp(vn, 0, 1), 2.5);
        const hairline = Math.pow(clamp(pridged(u * 2.4 + cloud, v * 1.1, 7, 3), 0, 1), 6) * 0.55;
        const grain = pvalue(u, v, size / 3) * 0.04;
        const base = 237 + cloud * 14 - grain * 55;
        out[0] = base - sharp * 96 - hairline * 70 + cloud * 5;
        out[1] = base - sharp * 88 - hairline * 66 - 3 + cloud * 3;
        out[2] = base - sharp * 99 - hairline * 60 - 13;
      }),
      normal: paintNormal(size, (u, v) => Math.pow(clamp(vein(u, v), 0, 1), 3) * 0.35 + pfbm(u, v, 24, 2) * 0.06, 0.9),
      rough: paintGrey(size, (u, v) => 0.10 + Math.pow(clamp(vein(u, v), 0, 1), 3) * 0.22 + pfbm(u, v, 8, 3) * 0.06),
    };
  },

  /* Dark Emperador, used for borders, thresholds and bathroom walls. */
  marbleDark: (size) => {
    const vein = (u, v) => pridged(u + pfbm(u, v, 5, 3) * 0.4, v * 0.6, 4, 5);
    return {
      albedo: paint(size, (u, v, out) => {
        const cloud = pfbm(u, v, 4, 4);
        const vn = Math.pow(clamp(vein(u, v), 0, 1), 2.6);
        out[0] = 58 + cloud * 26 + vn * 96;
        out[1] = 42 + cloud * 20 + vn * 80;
        out[2] = 33 + cloud * 15 + vn * 62;
      }),
      normal: paintNormal(size, (u, v) => Math.pow(clamp(vein(u, v), 0, 1), 3) * 0.3, 0.8),
      rough: paintGrey(size, (u, v) => 0.12 + pfbm(u, v, 8, 3) * 0.1),
    };
  },

  /* Sandstone façade cladding: coursed ashlar with bedding and an open grain.
     The block joints matter more than the grain — without them a stone façade
     reads as brown noise at any distance beyond a few metres. */
  sandstone: (size) => {
    const COURSES = 3;
    const PER_COURSE = 2;
    const cell = (u, v) => {
      const row = Math.floor(v * COURSES);
      const offset = (row % 2) * 0.5;
      const raw = u * PER_COURSE + offset;
      return {
        row,
        col: Math.floor(((raw % PER_COURSE) + PER_COURSE) % PER_COURSE),
        cu: raw - Math.floor(raw),
        cv: v * COURSES - row,
      };
    };
    const joint = (u, v) => {
      const { cu, cv } = cell(u, v);
      const e = Math.min(Math.min(cu, 1 - cu) * PER_COURSE, Math.min(cv, 1 - cv) * COURSES);
      return clamp(1 - e / 0.055, 0, 1);
    };
    const bed = (u, v) => {
      const layer = Math.sin(v * Math.PI * 18 + pfbm(u, v, 5, 3) * 4.2) * 0.5 + 0.5;
      return layer * 0.32 + pfbm(u * 2, v * 6, 6, 4) * 0.68;
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const { row, col } = cell(u, v);
        // Each block is cut from its own bed, so no two are quite the same.
        const stone = hash2(row * 17 + 3, col * 29 + 7);
        const b = bed(u, v);
        const speck = pvalue(u, v, size / 2) * 0.14;
        const j = joint(u, v);
        const r = 212 - b * 34 - speck * 52 + stone * 16;
        const g = 190 - b * 36 - speck * 50 + stone * 13;
        const bl = 156 - b * 34 - speck * 44 + stone * 10;
        // The joint is lime mortar: paler and flatter than the stone.
        out[0] = mix(r, 178, j);
        out[1] = mix(g, 168, j);
        out[2] = mix(bl, 148, j);
      }),
      normal: paintNormal(size, (u, v) =>
        bed(u, v) * 0.22 + pvalue(u, v, size / 4) * 0.10 - joint(u, v) * 0.7, 1.5),
      rough: paintGrey(size, (u, v) => 0.60 + bed(u, v) * 0.18 + joint(u, v) * 0.14),
    };
  },

  /* Dressed limestone for carved work — columns, balusters, mouldings, the
     dome. No coursing: a turned shaft is cut from one block, and putting
     ashlar joints on it is the single fastest way to make stone look like
     wallpaper. */
  limestone: (size) => {
    const grain = (u, v) => pfbm(u * 1.6, v * 1.6, 6, 5) * 0.7 + pvalue(u, v, size / 3) * 0.3;
    return {
      albedo: paint(size, (u, v, out) => {
        const g = grain(u, v);
        const shell = Math.pow(clamp(pridged(u * 1.1, v * 1.1, 4, 3), 0, 1), 5) * 0.35;
        out[0] = 224 - g * 30 - shell * 26;
        out[1] = 214 - g * 30 - shell * 24;
        out[2] = 192 - g * 28 - shell * 20;
      }),
      normal: paintNormal(size, (u, v) => grain(u, v) * 0.16, 0.7),
      rough: paintGrey(size, (u, v) => 0.58 + grain(u, v) * 0.16),
    };
  },

  /* Interior plaster: almost flat, with the faintest trowel modulation. */
  plaster: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const n = pfbm(u, v, 4, 4);
      const fine = pvalue(u, v, size / 2) * 0.05;
      const base = 236 + n * 8 - fine * 40;
      out[0] = base; out[1] = base - 1; out[2] = base - 4;
    }),
    normal: paintNormal(size, (u, v) => pfbm(u, v, 6, 4) * 0.28 + pvalue(u, v, size / 3) * 0.05, 0.5),
    rough: paintGrey(size, (u, v) => 0.86 + pfbm(u, v, 6, 3) * 0.08),
  }),

  /* Warm painted wall for bedrooms and the lounge. */
  paintWarm: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const n = pfbm(u, v, 5, 4);
      out[0] = 226 + n * 10; out[1] = 214 + n * 9; out[2] = 196 + n * 8;
    }),
    rough: paintGrey(size, (u, v) => 0.9 + pfbm(u, v, 6, 3) * 0.06),
  }),

  /* Burnt brick in stretcher bond — the masonry phase and the boundary wall. */
  brick: (size) => {
    const COURSES = 8;
    const PER_ROW = 4;
    const cell = (u, v) => {
      const row = Math.floor(v * COURSES);
      const offset = (row % 2) * 0.5;
      const cu = (u * PER_ROW + offset * 1) % 1;
      const cv = v * COURSES - row;
      return { row, cu, cv, col: Math.floor(((u * PER_ROW + offset) % PER_ROW + PER_ROW) % PER_ROW) };
    };
    const mortar = (u, v) => {
      const { cu, cv } = cell(u, v);
      const mx = Math.min(cu, 1 - cu);
      const my = Math.min(cv, 1 - cv);
      const e = Math.min(mx * PER_ROW, my * COURSES);
      return clamp(1 - e / 0.22, 0, 1);
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const { row, col } = cell(u, v);
        const tint = hash2(row * 7 + 3, col * 13 + 5);
        const m = mortar(u, v);
        const grain = pfbm(u * 3, v * 3, 8, 4);
        const r = 152 + tint * 46 - grain * 34;
        const g = 78 + tint * 30 - grain * 24;
        const b = 58 + tint * 22 - grain * 18;
        const mg = 176 + pfbm(u, v, 12, 3) * 22;
        out[0] = mix(r, mg, m);
        out[1] = mix(g, mg - 4, m);
        out[2] = mix(b, mg - 10, m);
      }),
      normal: paintNormal(size, (u, v) => (1 - mortar(u, v)) * 0.7 + pfbm(u * 3, v * 3, 10, 3) * 0.12, 1.8),
      rough: paintGrey(size, (u, v) => 0.78 + mortar(u, v) * 0.12),
    };
  },

  /* Fair-faced concrete: the raw frame during construction and X-ray mode. */
  concrete: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const n = pfbm(u, v, 5, 5);
      const stain = pfbm(u * 0.6, v * 1.8, 3, 3);
      const pit = pvalue(u, v, size / 2) > 0.93 ? 0.35 : 0;
      const base = 168 + n * 26 - stain * 22 - pit * 60;
      out[0] = base; out[1] = base + 1; out[2] = base - 2;
    }),
    normal: paintNormal(size, (u, v) => pfbm(u, v, 8, 4) * 0.3 + (pvalue(u, v, size / 2) > 0.93 ? 0.4 : 0), 1.1),
    rough: paintGrey(size, (u, v) => 0.82 + pfbm(u, v, 7, 3) * 0.1),
  }),

  /* Engineered oak plank flooring, laid in a running bond. */
  woodFloor: (size) => {
    const PLANKS = 6;
    const plank = (u, v) => {
      const row = Math.floor(v * PLANKS);
      const shift = (hash2(row, 91) * 0.8);
      const pu = ((u + shift) % 1 + 1) % 1;
      return { row, pu, pv: v * PLANKS - row, seg: Math.floor(pu * 2) };
    };
    const grain = (u, v) => {
      const { row, pu, seg } = plank(u, v);
      const t = hash2(row * 5 + seg, 17);
      const bands = Math.sin((pu * 26 + t * 9) * Math.PI + pfbm(u * 5, v * 22, 8, 3) * 7);
      return bands * 0.5 + 0.5;
    };
    const gap = (u, v) => {
      const { pv, pu } = plank(u, v);
      const gy = clamp(1 - Math.min(pv, 1 - pv) / 0.05, 0, 1);
      const seg = (pu * 2) % 1;
      const gx = clamp(1 - Math.min(seg, 1 - seg) / 0.012, 0, 1);
      return Math.max(gy, gx);
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const { row, seg } = plank(u, v);
        const tone = hash2(row * 3 + seg * 11, 41);
        const g = grain(u, v);
        const k = gap(u, v);
        const r = 150 + tone * 34 - g * 40;
        const gg = 106 + tone * 26 - g * 34;
        const b = 66 + tone * 18 - g * 24;
        out[0] = mix(r, 58, k);
        out[1] = mix(gg, 40, k);
        out[2] = mix(b, 26, k);
      }),
      normal: paintNormal(size, (u, v) => grain(u, v) * 0.12 - gap(u, v) * 0.55, 1.1),
      rough: paintGrey(size, (u, v) => 0.34 + grain(u, v) * 0.16),
    };
  },

  /* Dark walnut, for doors, panelling and furniture. */
  woodDark: (size) => {
    const grain = (u, v) => {
      const bands = Math.sin((v * 17) * Math.PI + pfbm(u * 4, v * 14, 7, 4) * 8);
      return bands * 0.5 + 0.5;
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const g = grain(u, v);
        const fig = pfbm(u * 2, v * 2, 5, 3);
        // Around six and a half per cent reflectance, which is what a
        // lacquered walnut door actually returns. Below about five, a surface
        // stops carrying any modelling at all indoors and reads as a hole.
        out[0] = 106 + fig * 28 - g * 30;
        out[1] = 69 + fig * 19 - g * 22;
        out[2] = 44 + fig * 13 - g * 14;
      }),
      normal: paintNormal(size, (u, v) => grain(u, v) * 0.16, 0.8),
      rough: paintGrey(size, (u, v) => 0.28 + grain(u, v) * 0.12),
    };
  },

  /*
   * Raised-and-fielded oak panelling, for the majlis, the dining room and the
   * study.
   *
   * Panelling was previously drawn as dark walnut with a tint over it, which
   * put its reflectance at under three per cent — darker than any real timber,
   * and dark enough that with no bounce light in the room the walls rendered
   * black.  This is quarter-sawn oak at about eighteen per cent, which is what
   * a lacquered oak panel actually returns, and it is built as joinery: stiles
   * and rails proud, a chamfer running down into each field, the grain turning
   * with the member it is cut from.
   */
  oakPanel: (size) => {
    const COLS = 3;
    const ROWS = 2;
    const RAIL = 0.13;   // half-width of the stile/rail, as a fraction of a bay
    const CHAMFER = 0.09; // the fielding chamfer, over the same fraction

    /** Where in its bay a point falls, and how far it is from the bay edge. */
    const bay = (u, v) => {
      const bu = u * COLS;
      const bv = v * ROWS;
      const col = Math.floor(bu);
      const row = Math.floor(bv);
      const cu = bu - col;
      const cv = bv - row;
      const du = Math.min(cu, 1 - cu);
      const dv = Math.min(cv, 1 - cv);
      return { col, row, cu, cv, edge: Math.min(du, dv), vertical: du < dv };
    };

    /**
     * The section through a panel: the frame stands proud, a chamfer falls
     * away from it, and the field sits back with a shallow crown.
     */
    const relief = (u, v) => {
      const { edge } = bay(u, v);
      if (edge < RAIL) return 1;
      if (edge < RAIL + CHAMFER) return mix(1, 0.42, (edge - RAIL) / CHAMFER);
      return 0.42 + Math.min(0.14, (edge - RAIL - CHAMFER) * 0.9);
    };

    /** Grain runs along the member, so it turns through ninety degrees. */
    const grain = (u, v) => {
      const b = bay(u, v);
      const upright = b.edge < RAIL && b.vertical;
      const along = upright ? v * 15 : u * 12;
      const across = upright ? u * 5 : v * 4;
      const bands = Math.sin(along * Math.PI + pfbm(u * 3, v * 3, 6, 4) * 5 + across);
      return bands * 0.5 + 0.5;
    };

    /** The quirk: the shadow line where the field is cut away from the frame. */
    const quirk = (u, v) => {
      const { edge } = bay(u, v);
      return clamp(1 - Math.abs(edge - RAIL) / 0.016, 0, 1);
    };

    return {
      albedo: paint(size, (u, v, out) => {
        const b = bay(u, v);
        const g = grain(u, v);
        const fig = pfbm(u * 2.5, v * 2.5, 6, 3);
        // Each board is cut from a different part of the log.
        const tone = hash2(b.col * 7 + b.row * 13, 23) * 0.5 + hash2(b.row, 5) * 0.5;
        const h = relief(u, v);
        // The frame stands into the light and the field falls away from it;
        // the quirk between them is a hard shadow line, and it is the line
        // that makes the wall read as panelling rather than as boarding.
        const shade = (0.82 + h * 0.30) * (1 - quirk(u, v) * 0.46);
        out[0] = (178 + tone * 24 + fig * 22 - g * 22) * shade;
        out[1] = (134 + tone * 19 + fig * 17 - g * 18) * shade;
        out[2] = (90 + tone * 14 + fig * 12 - g * 13) * shade;
      }),
      normal: paintNormal(size, (u, v) => relief(u, v) * 0.9 - quirk(u, v) * 0.35 + grain(u, v) * 0.05, 1.6),
      rough: paintGrey(size, (u, v) => 0.40 + grain(u, v) * 0.14),
    };
  },

  /* Lawn turf, seen from a walking eye height. */
  grass: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const clump = pfbm(u, v, 5, 4);
      const blade = pvalue(u, v, size / 1.5);
      const dry = pfbm(u * 0.5, v * 0.5, 3, 3);
      out[0] = 58 + clump * 34 + blade * 26 + dry * 30;
      out[1] = 96 + clump * 46 + blade * 30 - dry * 10;
      out[2] = 42 + clump * 22 + blade * 16;
    }),
    normal: paintNormal(size, (u, v) => pvalue(u, v, size / 2) * 0.2 + pfbm(u, v, 10, 3) * 0.2, 1.4),
    rough: paintGrey(size, () => 0.92),
  }),

  /* Interlocking paver driveway. */
  paver: (size) => {
    const NX = 6;
    const NY = 10;
    const joint = (u, v) => {
      const row = Math.floor(v * NY);
      const off = (row % 2) * 0.5;
      const cu = ((u * NX + off) % 1 + 1) % 1;
      const cv = v * NY - row;
      const e = Math.min(Math.min(cu, 1 - cu) * NX, Math.min(cv, 1 - cv) * NY);
      return clamp(1 - e / 0.18, 0, 1);
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const row = Math.floor(v * NY);
        const off = (row % 2) * 0.5;
        const col = Math.floor((u * NX + off) % NX);
        const tint = hash2(row * 13 + 1, col * 7 + 2);
        const j = joint(u, v);
        const n = pfbm(u * 3, v * 3, 9, 4);
        const base = 138 + tint * 44 - n * 26;
        out[0] = mix(base + 8, 96, j);
        out[1] = mix(base, 92, j);
        out[2] = mix(base - 12, 86, j);
      }),
      normal: paintNormal(size, (u, v) => -joint(u, v) * 0.6 + pfbm(u * 3, v * 3, 10, 3) * 0.1, 1.6),
      rough: paintGrey(size, () => 0.8),
    };
  },

  /* Large-format porcelain, for bathrooms and service areas. */
  tile: (size) => {
    const N = 4;
    const joint = (u, v) => {
      const cu = (u * N) % 1;
      const cv = (v * N) % 1;
      const e = Math.min(Math.min(cu, 1 - cu), Math.min(cv, 1 - cv)) * N;
      return clamp(1 - e / 0.08, 0, 1);
    };
    return {
      albedo: paint(size, (u, v, out) => {
        const cloud = pfbm(u * 1.6, v * 1.6, 4, 4);
        const vein = Math.pow(pridged(u * 1.4 + cloud * 0.3, v * 0.9, 3, 4), 3) * 0.5;
        const j = joint(u, v);
        const base = 226 + cloud * 14 - vein * 60;
        out[0] = mix(base, 196, j);
        out[1] = mix(base - 1, 194, j);
        out[2] = mix(base - 6, 190, j);
      }),
      normal: paintNormal(size, (u, v) => -joint(u, v) * 0.5, 1.1),
      rough: paintGrey(size, (u, v) => 0.16 + joint(u, v) * 0.5),
    };
  },

  /* Wool carpet and broadloom. */
  carpet: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const tuft = pvalue(u, v, size / 1.2);
      const shade = pfbm(u, v, 6, 3);
      out[0] = 128 + shade * 34 + tuft * 22;
      out[1] = 112 + shade * 30 + tuft * 20;
      out[2] = 98 + shade * 26 + tuft * 18;
    }),
    normal: paintNormal(size, (u, v) => pvalue(u, v, size / 1.5) * 0.35, 1.2),
    rough: paintGrey(size, () => 0.95),
  }),

  /* Upholstery weave. */
  fabric: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const warp = Math.sin(u * size * 0.6 * Math.PI) * 0.5 + 0.5;
      const weft = Math.sin(v * size * 0.6 * Math.PI) * 0.5 + 0.5;
      const w = (warp * weft) * 0.35 + pfbm(u, v, 8, 3) * 0.3;
      out[0] = 118 + w * 46;
      out[1] = 104 + w * 40;
      out[2] = 92 + w * 36;
    }),
    normal: paintNormal(size, (u, v) => (Math.sin(u * size * 0.6 * Math.PI) + Math.sin(v * size * 0.6 * Math.PI)) * 0.1, 0.9),
    rough: paintGrey(size, () => 0.94),
  }),

  /* Excavated earth and site soil. */
  soil: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const lump = pfbm(u, v, 5, 5);
      const stone = pvalue(u, v, size / 2) > 0.9 ? 0.4 : 0;
      out[0] = 112 + lump * 44 + stone * 40;
      out[1] = 88 + lump * 34 + stone * 34;
      out[2] = 66 + lump * 24 + stone * 26;
    }),
    normal: paintNormal(size, (u, v) => pfbm(u, v, 8, 5) * 0.5 + (pvalue(u, v, size / 2) > 0.9 ? 0.3 : 0), 1.7),
    rough: paintGrey(size, () => 0.95),
  }),

  /* Compacted site hardstanding and stockpile gravel. */
  gravel: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const g = pvalue(u, v, size / 2);
      const n = pfbm(u, v, 7, 4);
      const base = 128 + g * 60 + n * 24;
      out[0] = base; out[1] = base - 4; out[2] = base - 12;
    }),
    normal: paintNormal(size, (u, v) => pvalue(u, v, size / 2) * 0.5, 2.0),
    rough: paintGrey(size, () => 0.94),
  }),

  /* Roof screed and waterproofing. */
  roofScreed: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const n = pfbm(u, v, 6, 4);
      const base = 142 + n * 26;
      out[0] = base + 4; out[1] = base; out[2] = base - 8;
    }),
    normal: paintNormal(size, (u, v) => pfbm(u, v, 9, 4) * 0.25, 1.0),
    rough: paintGrey(size, () => 0.88),
  }),

  /* Shuttering ply, seen on the frame during construction. */
  plywood: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const grain = Math.sin((v * 9) * Math.PI + pfbm(u * 3, v * 9, 6, 3) * 6) * 0.5 + 0.5;
      const stain = pfbm(u, v, 4, 4);
      out[0] = 176 + stain * 30 - grain * 26;
      out[1] = 142 + stain * 24 - grain * 22;
      out[2] = 96 + stain * 18 - grain * 16;
    }),
    rough: paintGrey(size, () => 0.85),
  }),

  /* Brushed brass, for ironmongery and light fittings. */
  brass: (size) => ({
    albedo: paint(size, (u, v, out) => {
      const brush = Math.sin(v * size * 0.8) * 0.5 + 0.5;
      const n = pfbm(u, v, 8, 3);
      out[0] = 196 + brush * 26 + n * 18;
      out[1] = 158 + brush * 24 + n * 14;
      out[2] = 84 + brush * 18 + n * 10;
    }),
    rough: paintGrey(size, (u, v) => 0.22 + (Math.sin(v * size * 0.8) * 0.5 + 0.5) * 0.14),
  }),

  /* Water surface detail for the pool and the fountain basin. */
  water: (size) => ({
    normal: paintNormal(size, (u, v) => pfbm(u, v, 6, 4) * 0.6 + pfbm(u * 2.3, v * 1.7, 11, 3) * 0.4, 0.9),
  }),
};

/**
 * Build the library.  Nothing is generated until it is asked for.
 *
 * @param tier  the active quality tier (supplies texture size and anisotropy)
 * @param maxAnisotropy  what the renderer actually supports
 */
export function createTextures(tier, maxAnisotropy = 1) {
  const size = Math.max(128, tier.texture | 0);
  const aniso = Math.min(tier.anisotropy, maxAnisotropy || 1);
  const built = new Map();
  const clones = new Map();
  const all = [];

  function build(name) {
    let entry = built.get(name);
    if (entry) return entry;
    const recipe = RECIPES[name];
    if (!recipe) throw new Error(`unknown texture "${name}"`);
    const canvases = recipe(size);
    entry = {};
    for (const key of Object.keys(canvases)) {
      const canvas = canvases[key];
      if (!canvas) continue;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = aniso;
      tex.colorSpace = key === 'albedo' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      tex.needsUpdate = true;
      entry[key] = tex;
      all.push(tex);
    }
    built.set(name, entry);
    return entry;
  }

  return {
    size,
    /** The base texture set for a material, at repeat 1×1. */
    get: (name) => build(name),

    /**
     * A texture set with a specific repeat.  Clones share the underlying
     * image, so asking for twenty different repeats of marble costs one
     * texture upload, not twenty.
     */
    tiled(name, repeatX, repeatY = repeatX) {
      const key = `${name}|${repeatX}|${repeatY}`;
      let entry = clones.get(key);
      if (entry) return entry;
      const base = build(name);
      entry = {};
      for (const k of Object.keys(base)) {
        const tex = base[k].clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.anisotropy = aniso;
        tex.colorSpace = base[k].colorSpace;
        tex.needsUpdate = true;
        entry[k] = tex;
        all.push(tex);
      }
      clones.set(key, entry);
      return entry;
    },

    /** Names available, for the test harness. */
    names: () => Object.keys(RECIPES),

    dispose() {
      for (const tex of all) tex.dispose();
      all.length = 0;
      built.clear();
      clones.clear();
    },
  };
}

/**
 * Convenience: a MeshStandardMaterial wired to a texture set.
 * `opts` overrides anything on the material.
 */
export function standardFrom(set, opts = {}) {
  const extra = Object.assign({}, opts);
  const params = {
    map: set.albedo || null,
    normalMap: set.normal || null,
    roughnessMap: set.rough || null,
    roughness: set.rough ? 1.0 : 0.8,
    metalness: 0.0,
  };
  if (set.normal && extra.normalScale !== undefined) {
    params.normalScale = new THREE.Vector2(extra.normalScale, extra.normalScale);
    delete extra.normalScale;
  }
  return new THREE.MeshStandardMaterial(Object.assign(params, extra));
}
