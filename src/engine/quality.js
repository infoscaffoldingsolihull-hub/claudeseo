import * as THREE from 'three';

/**
 * Adaptive quality manager.
 *
 * The simulator has to run on an RTX desktop in the lecture theatre, on the
 * presenter's integrated-graphics laptop, and on a delegate's phone.  Rather
 * than shipping one compromise, the engine picks a starting tier from the GPU
 * string and then continuously re-tiers on a rolling frame-time average.
 */

export const QUALITY_TIERS = {
  low: {
    label: 'Low',
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    shadowDistance: 260,
    bloom: false,
    godRays: false,
    grain: false,
    ssaa: false,
    msaa: 0,
    ssao: false,
    anisotropy: 2,
    blockScale: 5,          // merge N stone courses per instanced block
    terrainSegments: 128,
    viewDistance: 3600,
    dustCount: 220,
    birdCount: 24,
    sandCount: 400,
    workerCount: 44,
    vegetationCount: 90,
    rockCount: 120,
    torchLights: 2,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 340,
    bloom: true,
    godRays: false,
    grain: true,
    ssaa: false,
    msaa: 2,
    ssao: true,
    anisotropy: 4,
    blockScale: 3,
    terrainSegments: 208,
    viewDistance: 5200,
    dustCount: 500,
    birdCount: 44,
    sandCount: 900,
    workerCount: 90,
    vegetationCount: 180,
    rockCount: 240,
    torchLights: 3,
  },
  high: {
    label: 'High',
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 460,
    bloom: true,
    godRays: true,
    grain: true,
    ssaa: false,
    msaa: 4,
    ssao: true,
    anisotropy: 8,
    blockScale: 2,
    terrainSegments: 288,
    viewDistance: 7000,
    dustCount: 900,
    birdCount: 70,
    sandCount: 1600,
    workerCount: 150,
    vegetationCount: 320,
    rockCount: 420,
    torchLights: 4,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 2.0,
    shadows: true,
    shadowMapSize: 4096,
    shadowDistance: 620,
    bloom: true,
    godRays: true,
    grain: true,
    ssaa: true,
    msaa: 4,
    ssao: true,
    anisotropy: 16,
    blockScale: 1,
    terrainSegments: 384,
    viewDistance: 9000,
    dustCount: 1500,
    birdCount: 96,
    sandCount: 2600,
    workerCount: 230,
    vegetationCount: 520,
    rockCount: 700,
    torchLights: 6,
  },
};

const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

function detectTier(renderer) {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
  } catch {
    gpu = '';
  }
  const g = gpu.toLowerCase();
  if (isMobile) return /apple a1[5-9]|apple m[1-9]|adreno \(tm\) 7|adreno 7/.test(g) ? 'medium' : 'low';
  if (/rtx|radeon rx (6|7|8)|apple m[2-9]|arc a[57]/.test(g)) return 'ultra';
  if (/gtx 1[06]|quadro|radeon rx 5|apple m1|geforce/.test(g)) return 'high';
  if (/(intel).*(uhd|hd graphics)|llvmpipe|swiftshader|software/.test(g)) return 'low';
  if (/iris|vega|radeon/.test(g)) return 'medium';
  return cores >= 8 && mem >= 8 ? 'high' : 'medium';
}

export class QualityManager {
  constructor(renderer, { forced = null } = {}) {
    this.renderer = renderer;
    this.detected = detectTier(renderer);
    this.tier = forced || this.detected;
    this.auto = !forced;
    this.settings = { ...QUALITY_TIERS[this.tier] };
    this.frameTimes = new Float32Array(90);
    this.frameIndex = 0;
    this.samples = 0;
    this.cooldown = 3.0;
    this.fps = 60;
    this.listeners = new Set();
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy
      ? renderer.capabilities.getMaxAnisotropy()
      : 4;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get anisotropy() {
    return Math.min(this.settings.anisotropy, this.maxAnisotropy);
  }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.settings.pixelRatio);
  }

  setTier(tier, { auto = false } = {}) {
    if (!QUALITY_TIERS[tier] || tier === this.tier) return false;
    this.tier = tier;
    this.settings = { ...QUALITY_TIERS[tier] };
    this.auto = auto ? this.auto : false;
    this.cooldown = 4.0;
    this.samples = 0;
    for (const fn of this.listeners) fn(this.settings, tier);
    return true;
  }

  setAuto(enabled) {
    this.auto = enabled;
    this.cooldown = 4.0;
  }

  /** Called once per frame; returns true when the tier changed. */
  update(dt) {
    const clamped = Math.min(dt, 0.25);
    this.frameTimes[this.frameIndex] = clamped;
    this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
    this.samples = Math.min(this.samples + 1, this.frameTimes.length);
    let sum = 0;
    for (let i = 0; i < this.samples; i++) sum += this.frameTimes[i];
    this.fps = this.samples ? this.samples / sum : 60;

    if (this.cooldown > 0) {
      this.cooldown -= clamped;
      return false;
    }
    if (!this.auto || this.samples < this.frameTimes.length) return false;

    const idx = TIER_ORDER.indexOf(this.tier);
    if (this.fps < 34 && idx > 0) return this.setTier(TIER_ORDER[idx - 1], { auto: true });
    if (this.fps > 88 && idx < TIER_ORDER.length - 1 && TIER_ORDER[idx + 1] !== 'ultra') {
      return this.setTier(TIER_ORDER[idx + 1], { auto: true });
    }
    return false;
  }
}

/** Shared helper: apply the current anisotropy to every texture of a material. */
export function applyAnisotropy(material, aniso) {
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap']) {
    const t = material[key];
    if (t && t instanceof THREE.Texture) {
      t.anisotropy = aniso;
      t.needsUpdate = true;
    }
  }
}
