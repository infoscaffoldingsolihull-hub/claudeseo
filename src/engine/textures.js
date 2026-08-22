import * as THREE from 'three';
import { fbm2, ridged2, worley2, valueNoise2, hash2i, clamp, lerp, smoothstep, makeRng } from './noise.js';

/**
 * Procedural material library.
 *
 * The simulator ships as a single HTML file with no external assets, so every
 * surface - weathered limestone, Aswan granite, Sahara sand, mud brick, cedar,
 * plaster, water - is synthesised at load time from noise.  Each builder runs
 * ONE noise evaluation per texel and derives the normal and roughness maps from
 * the cached height field, which keeps the whole library under ~1 s even on a
 * low-power laptop.
 */

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Wrap an index into [0,n) so generated maps tile seamlessly. */
function wrapIndex(i, n) {
  return i < 0 ? i + n : i >= n ? i - n : i;
}

/**
 * Build an albedo / normal / roughness set from a single per-texel sampler.
 * `sample(u, v, x, y)` must return { h, r, g, b, rough } with 0..1 channels.
 */
function buildTextureSet(size, sample, opts = {}) {
  const { normalStrength = 2.0, repeat = 1, anisotropy = 4 } = opts;
  const height = new Float32Array(size * size);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const s = sample(x / size, y / size, x, y);
      height[i] = s.h;
      albedo[i * 4] = s.r * 255;
      albedo[i * 4 + 1] = s.g * 255;
      albedo[i * 4 + 2] = s.b * 255;
      albedo[i * 4 + 3] = 255;
      const rq = s.rough * 255;
      rough[i * 4] = rq;
      rough[i * 4 + 1] = rq;
      rough[i * 4 + 2] = rq;
      rough[i * 4 + 3] = 255;
    }
  }

  // Sobel-derived tangent-space normals from the cached height field.
  const normal = new Uint8ClampedArray(size * size * 4);
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
      let nx = -dx * normalStrength;
      let ny = -dy * normalStrength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y0 + x) * 4;
      normal[i] = (nx * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz / len) * 0.5 * 255 + 127.5;
      normal[i + 3] = 255;
    }
  }

  const make = (data, colorSpace) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(data, size, size), 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = anisotropy;
    tex.colorSpace = colorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    map: make(albedo, THREE.SRGBColorSpace),
    normalMap: make(normal, THREE.NoColorSpace),
    roughnessMap: make(rough, THREE.NoColorSpace),
  };
}

/* ------------------------------------------------------------------ stone */

/** Nummulitic Mokattam limestone: the local plateau stone used for the core. */
function limestoneSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const n1 = fbm2(u * 7, v * 7, 5, 2.1, 0.55, seed);
      const n2 = fbm2(u * 31, v * 31, 4, 2.0, 0.5, seed + 17);
      const pits = 1 - worley2(u * 13, v * 13, seed + 5);
      const shells = smoothstep(0.62, 0.78, valueNoise2(u * 55, v * 55, seed + 91));
      const cracks = smoothstep(0.06, 0.0, worley2(u * 5.5, v * 5.5, seed + 41));
      const h = clamp(n1 * 0.55 + n2 * 0.28 + pits * 0.2 - cracks * 0.5 + shells * 0.1, 0, 1);
      const tone = 0.62 + n1 * 0.26 + n2 * 0.1;
      const warm = 0.02 + shells * 0.05;
      return {
        h,
        r: clamp(tone * 0.96 + warm, 0, 1),
        g: clamp(tone * 0.90 + warm * 0.75, 0, 1),
        b: clamp(tone * 0.76 + warm * 0.35, 0, 1),
        rough: clamp(0.74 + n2 * 0.2 - shells * 0.18, 0.3, 1),
      };
    },
    { normalStrength: 2.6 }
  );
}

/** Tura casing limestone: fine, near-white, polished to a 0.5 mm joint. */
function casingSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const fine = fbm2(u * 23, v * 23, 4, 2.0, 0.5, seed);
      const veil = fbm2(u * 3.5, v * 3.5, 3, 2.0, 0.5, seed + 3);
      const h = clamp(fine * 0.35 + veil * 0.2 + 0.3, 0, 1);
      const tone = 0.85 + veil * 0.12 + fine * 0.05;
      return {
        h,
        r: clamp(tone, 0, 1),
        g: clamp(tone * 0.985, 0, 1),
        b: clamp(tone * 0.93, 0, 1),
        rough: clamp(0.32 + fine * 0.22, 0.2, 0.8),
      };
    },
    { normalStrength: 0.8 }
  );
}

/** Aswan red granite: feldspar / quartz / biotite speckle. */
function graniteSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const feld = valueNoise2(u * 22, v * 22, seed);
      const quartz = valueNoise2(u * 31, v * 31, seed + 31);
      const biotite = smoothstep(0.72, 0.86, valueNoise2(u * 44, v * 44, seed + 61));
      const band = fbm2(u * 5, v * 5, 4, 2.0, 0.5, seed + 7);
      const h = clamp(feld * 0.4 + quartz * 0.3 + band * 0.3, 0, 1);
      let r = 0.44 + feld * 0.34 + band * 0.06;
      let g = 0.24 + feld * 0.16 + quartz * 0.14;
      let b = 0.21 + quartz * 0.2 + band * 0.04;
      if (quartz > 0.68) {
        const t = smoothstep(0.68, 0.9, quartz);
        r = lerp(r, 0.78, t);
        g = lerp(g, 0.74, t);
        b = lerp(b, 0.7, t);
      }
      r = lerp(r, 0.07, biotite);
      g = lerp(g, 0.07, biotite);
      b = lerp(b, 0.08, biotite);
      return { h, r, g, b, rough: clamp(0.42 + biotite * 0.25 - quartz * 0.12, 0.16, 0.9) };
    },
    { normalStrength: 1.2 }
  );
}

/** Basalt paving of the mortuary temple courtyard. */
function basaltSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const vesicles = 1 - worley2(u * 26, v * 26, seed);
      const grain = fbm2(u * 40, v * 40, 4, 2.0, 0.5, seed + 12);
      const h = clamp(grain * 0.5 + vesicles * 0.45, 0, 1);
      const tone = 0.13 + grain * 0.12 + vesicles * 0.05;
      return { h, r: tone, g: tone * 1.02, b: tone * 1.12, rough: clamp(0.6 + grain * 0.25, 0.3, 1) };
    },
    { normalStrength: 2.0 }
  );
}

/**
 * Dressed ashlar masonry: courses of large blocks with fine joints, over a
 * stone base.  This is what turns the interior chambers from smooth boxes into
 * something that reads as built - the King's Chamber granite is laid in five
 * courses, and you can see every one of them.
 */
function ashlarSet(size, seed, kind) {
  const rows = 2;      // courses per texture tile
  const cols = 1;      // blocks per tile across
  const joint = 0.012; // joint width as a fraction of a block
  return buildTextureSet(
    size,
    (u, v) => {
      const ry = v * rows;
      const row = Math.floor(ry);
      const offset = (row % 2) * 0.5;
      const rx = u * cols + offset;
      const col = Math.floor(rx);
      const fx = rx - col;
      const fy = ry - row;
      const face =
        smoothstep(0, joint * 3, fx) * smoothstep(1, 1 - joint * 3, fx) *
        smoothstep(0, joint * 6, fy) * smoothstep(1, 1 - joint * 6, fy);
      const jitter = hash2i(col, row, seed);
      const grain = fbm2(u * 26, v * 26, 4, 2.0, 0.5, seed + 3);

      let r;
      let g;
      let b;
      let rough;
      let relief;
      if (kind === 'granite') {
        const feld = valueNoise2(u * 38, v * 38, seed + 11);
        const quartz = valueNoise2(u * 54, v * 54, seed + 31);
        const biotite = smoothstep(0.76, 0.93, valueNoise2(u * 74, v * 74, seed + 61)) * 0.75;
        // Aswan granite is pink-grey, not terracotta: a modest red bias over a
        // neutral base, with grey quartz and near-black biotite.
        r = 0.52 + feld * 0.22 + jitter * 0.04;
        g = 0.40 + feld * 0.15 + quartz * 0.10;
        b = 0.37 + quartz * 0.15;
        if (quartz > 0.7) {
          const t = smoothstep(0.7, 0.92, quartz);
          r = lerp(r, 0.74, t);
          g = lerp(g, 0.70, t);
          b = lerp(b, 0.66, t);
        }
        r = lerp(r, 0.22, biotite);
        g = lerp(g, 0.20, biotite);
        b = lerp(b, 0.22, biotite);
        rough = 0.36 + biotite * 0.2 + grain * 0.1;
        relief = grain * 0.3 + feld * 0.2;
      } else {
        const fine = fbm2(u * 18, v * 18, 4, 2.0, 0.5, seed + 7);
        const tone = 0.70 + fine * 0.18 + jitter * 0.10;
        r = tone;
        g = tone * 0.965;
        b = tone * 0.885;
        rough = 0.5 + fine * 0.28;
        relief = fine * 0.45;
      }

      // Joints: recessed, darker, and rougher than the dressed face.
      const shade = lerp(0.55, 1.0, face);
      const h = clamp(relief * 0.5 + face * 0.5, 0, 1);
      return {
        h,
        r: clamp(r * shade, 0, 1),
        g: clamp(g * shade, 0, 1),
        b: clamp(b * shade, 0, 1),
        rough: clamp(lerp(0.95, rough, face), 0.15, 1),
      };
    },
    { normalStrength: kind === 'granite' ? 1.6 : 2.0 }
  );
}

/* ------------------------------------------------------------- ground/misc */

/** Wind-rippled Sahara sand. */
function sandSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const ripple = Math.sin((u * 11 + fbm2(u * 4, v * 4, 3, 2, 0.5, seed) * 2.4) * Math.PI * 2) * 0.5 + 0.5;
      const grain = valueNoise2(u * 96, v * 96, seed + 3);
      const drift = fbm2(u * 9, v * 9, 4, 2.0, 0.5, seed + 21);
      const h = clamp(ripple * 0.42 + grain * 0.18 + drift * 0.4, 0, 1);
      const tone = 0.66 + drift * 0.2 + ripple * 0.08 + grain * 0.06;
      return {
        h,
        r: clamp(tone * 1.0, 0, 1),
        g: clamp(tone * 0.84, 0, 1),
        b: clamp(tone * 0.58, 0, 1),
        rough: clamp(0.86 + grain * 0.12, 0.5, 1),
      };
    },
    { normalStrength: 1.6 }
  );
}

/** Exposed plateau bedrock with wind-scoured flutes. */
function bedrockSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const flute = ridged2(u * 6, v * 14, 5, seed);
      const grain = fbm2(u * 44, v * 44, 4, 2.0, 0.5, seed + 8);
      const bed = smoothstep(0.42, 0.58, fbm2(u * 2.5, v * 9, 3, 2, 0.5, seed + 19));
      const h = clamp(flute * 0.62 + grain * 0.34 + bed * 0.12, 0, 1);
      // Mokattam limestone: pale grey-buff, noticeably cooler than the sand
      // that drifts over it, with bedding planes picked out in the relief.
      const tone = 0.40 + flute * 0.20 + grain * 0.11 + bed * 0.06;
      return {
        h,
        r: clamp(tone * 1.02, 0, 1),
        g: clamp(tone * 0.99, 0, 1),
        b: clamp(tone * 0.90, 0, 1),
        rough: clamp(0.78 + grain * 0.17, 0.4, 1),
      };
    },
    { normalStrength: 2.4 }
  );
}

/** Nile-silt mud brick used throughout Heit el-Ghurab, the workers' town. */
function mudbrickSet(size, seed) {
  const rows = 8;
  const cols = 4;
  return buildTextureSet(
    size,
    (u, v) => {
      const ry = v * rows;
      const row = Math.floor(ry);
      const offset = (row % 2) * 0.5;
      const rx = u * cols + offset;
      const col = Math.floor(rx);
      const fx = rx - col;
      const fy = ry - row;
      const mortar = smoothstep(0.0, 0.06, fx) * smoothstep(1.0, 0.94, fx) *
        smoothstep(0.0, 0.09, fy) * smoothstep(1.0, 0.91, fy);
      const jitter = hash2i(col, row, seed);
      const straw = smoothstep(0.78, 0.95, valueNoise2(u * 150, v * 90, seed + 13));
      const grain = fbm2(u * 36, v * 36, 4, 2.0, 0.5, seed + 5);
      const h = clamp(mortar * 0.7 + grain * 0.2 + jitter * 0.08, 0, 1);
      const base = lerp(0.42, 0.6, jitter) * lerp(0.8, 1.05, grain);
      const tone = lerp(base * 0.72, base, mortar);
      return {
        h,
        r: clamp(tone * 1.02 + straw * 0.2, 0, 1),
        g: clamp(tone * 0.8 + straw * 0.18, 0, 1),
        b: clamp(tone * 0.6 + straw * 0.08, 0, 1),
        rough: clamp(0.88 - straw * 0.1, 0.5, 1),
      };
    },
    { normalStrength: 2.2 }
  );
}

/** Cedar of Lebanon / acacia timber for sledges, scaffolding and barges. */
function woodSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const rings = Math.abs(Math.sin((v * 9 + fbm2(u * 3, v * 3, 3, 2, 0.5, seed) * 3) * Math.PI));
      const fibre = valueNoise2(u * 12, v * 220, seed + 4);
      const knot = smoothstep(0.9, 1.0, 1 - worley2(u * 3, v * 3, seed + 44));
      const h = clamp(rings * 0.4 + fibre * 0.3 + knot * 0.4, 0, 1);
      const tone = 0.3 + rings * 0.22 + fibre * 0.14 - knot * 0.12;
      return {
        h,
        r: clamp(tone * 1.25, 0, 1),
        g: clamp(tone * 0.86, 0, 1),
        b: clamp(tone * 0.52, 0, 1),
        rough: clamp(0.72 + fibre * 0.2, 0.4, 1),
      };
    },
    { normalStrength: 1.4 }
  );
}

/** Lime plaster ground for painted temple reliefs. */
function plasterSet(size, seed) {
  return buildTextureSet(
    size,
    (u, v) => {
      const wash = fbm2(u * 6, v * 6, 4, 2.0, 0.5, seed);
      const trowel = valueNoise2(u * 26, v * 18, seed + 6);
      const crackle = smoothstep(0.05, 0.0, worley2(u * 9, v * 9, seed + 27));
      const h = clamp(wash * 0.4 + trowel * 0.35 - crackle * 0.5 + 0.3, 0, 1);
      const tone = 0.8 + wash * 0.14 - crackle * 0.2;
      return {
        h,
        r: clamp(tone, 0, 1),
        g: clamp(tone * 0.95, 0, 1),
        b: clamp(tone * 0.85, 0, 1),
        rough: clamp(0.7 + trowel * 0.2, 0.4, 1),
      };
    },
    { normalStrength: 1.1 }
  );
}

/* ---------------------------------------------------------------- sprites */

/** Radial falloff sprite used for torch glow, sun bloom and dust motes. */
function radialSprite(size, inner, outer, rgb) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size * outer);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
  g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft elongated footprint decal stamped into the sand behind the player. */
function footprintTexture(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.58, size * 0.17, size * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.22, size * 0.13, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = ctx.getImageData(0, 0, size, size);
  // Feather the stamp so it reads as displaced sand rather than a decal sticker.
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

/** Animated-looking flame billboard (three stacked lobes + noise erosion). */
function flameTexture(size = 128) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5;
      const v = 1 - y / size;
      const width = 0.30 * Math.pow(1 - v, 0.55) + 0.02;
      const d = Math.abs(u) / width;
      const flick = fbm2(x * 0.06, y * 0.05, 3, 2, 0.5, 17);
      let a = clamp(1 - d, 0, 1) * clamp(1 - Math.pow(Math.abs(v - 0.28) * 1.7, 1.6), 0, 1);
      a *= 0.6 + flick * 0.8;
      a = clamp(a, 0, 1);
      const core = clamp(1 - d * 1.9, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = clamp(90 + core * 165 + v * 30, 0, 255);
      img.data[i + 2] = clamp(20 + core * core * 150, 0, 255);
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Nile water: dual-scale ripple normal map, scrolled in the shader. */
function waterNormalTexture(size = 256, seed = 5) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] =
        fbm2(u * 12, v * 12, 4, 2.0, 0.5, seed) * 0.6 +
        fbm2(u * 33, v * 33, 3, 2.0, 0.5, seed + 4) * 0.4;
    }
  }
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = wrapIndex(x - 1, size);
      const xp = wrapIndex(x + 1, size);
      const ym = wrapIndex(y - 1, size) * size;
      const yp = wrapIndex(y + 1, size) * size;
      const y0 = y * size;
      const dx = height[y0 + xp] - height[y0 + xm];
      const dy = height[yp + x] - height[ym + x];
      let nx = -dx * 4;
      let ny = -dy * 4;
      const len = Math.hypot(nx, ny, 1);
      const i = (y0 + x) * 4;
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
 * Procedural hieroglyphic register: a cartouche band over sunk-relief columns.
 * Not a transcription - a stylised, historically-flavoured wall treatment.
 */
function hieroglyphTexture(size = 512, seed = 9) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rng = makeRng(seed);
  ctx.fillStyle = '#c8b48c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(60,42,24,0.55)';
  ctx.fillStyle = 'rgba(60,42,24,0.7)';
  const cols = 8;
  const cw = size / cols;
  for (let c = 0; c < cols; c++) {
    const x = c * cw;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(x + cw * 0.08, size * 0.02, cw * 0.84, size * 0.96);
    ctx.globalAlpha = 0.85;
    let y = size * 0.05;
    while (y < size * 0.95) {
      const gh = cw * (0.35 + rng() * 0.55);
      const gx = x + cw * 0.2;
      const gw = cw * 0.6;
      const kind = Math.floor(rng() * 6);
      ctx.beginPath();
      if (kind === 0) {
        ctx.rect(gx, y, gw, gh * 0.6);
      } else if (kind === 1) {
        ctx.ellipse(gx + gw / 2, y + gh / 2, gw / 2, gh / 2, 0, 0, Math.PI * 2);
      } else if (kind === 2) {
        ctx.moveTo(gx, y + gh);
        ctx.lineTo(gx + gw / 2, y);
        ctx.lineTo(gx + gw, y + gh);
        ctx.closePath();
      } else if (kind === 3) {
        ctx.moveTo(gx, y + gh * 0.5);
        ctx.quadraticCurveTo(gx + gw * 0.5, y - gh * 0.2, gx + gw, y + gh * 0.5);
        ctx.quadraticCurveTo(gx + gw * 0.5, y + gh * 1.1, gx, y + gh * 0.5);
      } else if (kind === 4) {
        ctx.rect(gx + gw * 0.35, y, gw * 0.3, gh);
        ctx.rect(gx, y + gh * 0.3, gw, gh * 0.16);
      } else {
        ctx.arc(gx + gw / 2, y + gh / 2, gw * 0.42, 0.4, Math.PI * 1.7);
      }
      ctx.fill();
      y += gh + cw * 0.18;
    }
  }
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const n = fbm2((p % size) * 0.03, Math.floor(p / size) * 0.03, 4, 2, 0.5, seed + 2);
    const w = 0.82 + n * 0.36;
    img.data[i] *= w;
    img.data[i + 1] *= w * 0.99;
    img.data[i + 2] *= w * 0.95;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lazily-built, cached texture library.  Nothing is generated until the first
 * material that needs it is created, and everything is disposable.
 */
export class TextureLibrary {
  constructor(quality) {
    this.quality = quality;
    this.cache = new Map();
  }

  _size(hero) {
    const tier = this.quality.tier;
    // Interior walls are read at arm's length, so even the low tier needs
    // enough texels to keep the ashlar joints crisp rather than blotchy.
    const base = tier === 'ultra' ? 1024 : tier === 'high' ? 512 : tier === 'medium' ? 384 : 256;
    return hero ? base : Math.max(128, base / 2);
  }

  _get(key, factory) {
    let v = this.cache.get(key);
    if (!v) {
      v = factory();
      this.cache.set(key, v);
    }
    return v;
  }

  limestone() {
    return this._get('limestone', () => limestoneSet(this._size(true), 101));
  }
  casing() {
    return this._get('casing', () => casingSet(this._size(true), 202));
  }
  granite() {
    return this._get('granite', () => graniteSet(this._size(true), 303));
  }
  graniteAshlar() {
    return this._get('graniteAshlar', () => ashlarSet(this._size(true), 313, 'granite'));
  }
  limestoneAshlar() {
    return this._get('limestoneAshlar', () => ashlarSet(this._size(true), 323, 'limestone'));
  }
  basalt() {
    return this._get('basalt', () => basaltSet(this._size(false), 404));
  }
  sand() {
    return this._get('sand', () => sandSet(this._size(true), 505));
  }
  bedrock() {
    return this._get('bedrock', () => bedrockSet(this._size(false), 606));
  }
  mudbrick() {
    return this._get('mudbrick', () => mudbrickSet(this._size(false), 707));
  }
  wood() {
    return this._get('wood', () => woodSet(this._size(false), 808));
  }
  plaster() {
    return this._get('plaster', () => plasterSet(this._size(false), 909));
  }
  hieroglyphs() {
    return this._get('glyphs', () => hieroglyphTexture(Math.max(256, this._size(true)), 9));
  }
  waterNormal() {
    return this._get('waterN', () => waterNormalTexture(this._size(false), 5));
  }
  flame() {
    return this._get('flame', () => flameTexture(128));
  }
  glow() {
    return this._get('glow', () => radialSprite(128, 0.0, 0.5, [255, 178, 96]));
  }
  dust() {
    return this._get('dust', () => radialSprite(64, 0.0, 0.5, [235, 220, 190]));
  }
  footprint() {
    return this._get('footprint', () => footprintTexture(64));
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
