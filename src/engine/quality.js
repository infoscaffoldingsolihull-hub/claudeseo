import * as THREE from 'three';

/**
 * Adaptive quality manager (A3).
 *
 * The simulator has to run on an RTX desktop in the lecture theatre, on the
 * presenter's integrated-graphics laptop and on a delegate's phone. The engine
 * picks a starting tier from the GPU string, then re-tiers on a rolling
 * frame-time average (never auto-promoting into Ultra).
 *
 *   ?quality=low|medium|high|ultra   pins the tier (QA harness, presenters)
 *   quality.setTier(t) / setAuto(on)
 *   quality.override(key, value)     Graphics-panel toggles; survives tier changes
 *   quality.clearOverrides()
 *   quality.onChange(fn(settings, tier)) → unsubscribe
 *
 * World/agent budgets (cityBlocks, treeCount, vehicleCount, workerCount,
 * passengerCount, lightInstances, terrainSegments, rainCount, dustCount) are
 * read by the world builders at build time.
 */

export const QUALITY_TIERS = {
  low: {
    label: 'Low',
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    shadowDistance: 260,
    bloom: true,
    godRays: false,
    grain: false,
    ssao: false,
    msaa: 0,
    aa: 'fxaa',
    taa: false,
    dof: false,
    motionBlur: false,
    lensFlare: false,
    ssaa: false,
    anisotropy: 2,
    blockScale: 5,
    terrainSegments: 128,
    viewDistance: 9000,
    rainCount: 2500,
    dustCount: 220,
    cityBlocks: 600,
    treeCount: 260,
    vehicleCount: 24,
    workerCount: 44,
    passengerCount: 60,
    lightInstances: 900,
    birdCount: 24,
    sandCount: 400,
    vegetationCount: 90,
    rockCount: 120,
    torchLights: 2,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 380,
    bloom: true,
    godRays: true,
    grain: true,
    ssao: true,
    msaa: 0,
    aa: 'fxaa',
    taa: false,
    dof: true,
    motionBlur: false,
    lensFlare: true,
    ssaa: false,
    anisotropy: 4,
    blockScale: 3,
    terrainSegments: 208,
    viewDistance: 11000,
    rainCount: 6000,
    dustCount: 500,
    cityBlocks: 1400,
    treeCount: 600,
    vehicleCount: 48,
    workerCount: 90,
    passengerCount: 140,
    lightInstances: 2200,
    birdCount: 44,
    sandCount: 900,
    vegetationCount: 180,
    rockCount: 240,
    torchLights: 3,
  },
  high: {
    label: 'High',
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 520,
    bloom: true,
    godRays: true,
    grain: true,
    ssao: true,
    msaa: 4,
    aa: 'fxaa',
    taa: false,
    dof: true,
    motionBlur: true,
    lensFlare: true,
    ssaa: false,
    anisotropy: 8,
    blockScale: 2,
    terrainSegments: 288,
    viewDistance: 13000,
    rainCount: 12000,
    dustCount: 900,
    cityBlocks: 2600,
    treeCount: 1200,
    vehicleCount: 80,
    workerCount: 150,
    passengerCount: 260,
    lightInstances: 4000,
    birdCount: 70,
    sandCount: 1600,
    vegetationCount: 320,
    rockCount: 420,
    torchLights: 4,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 2.0,
    shadows: true,
    shadowMapSize: 4096,
    shadowDistance: 700,
    bloom: true,
    godRays: true,
    grain: true,
    ssao: true,
    msaa: 0,
    aa: 'none',
    taa: true,
    dof: true,
    motionBlur: true,
    lensFlare: true,
    ssaa: true,
    anisotropy: 16,
    blockScale: 1,
    terrainSegments: 384,
    viewDistance: 15000,
    rainCount: 20000,
    dustCount: 1500,
    cityBlocks: 4200,
    treeCount: 2200,
    vehicleCount: 120,
    workerCount: 230,
    passengerCount: 400,
    lightInstances: 6500,
    birdCount: 96,
    sandCount: 2600,
    vegetationCount: 520,
    rockCount: 700,
    torchLights: 6,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

function detectTier(renderer) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
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
  if (/rtx|radeon rx (6|7|8|9)|apple m[2-9]|arc a[57]|arc b/.test(g)) return 'ultra';
  if (/gtx 1[06]|quadro|radeon rx 5|apple m1|geforce/.test(g)) return 'high';
  if (/llvmpipe|swiftshader|software|microsoft basic/.test(g)) return 'low';
  if (/(intel).*(uhd|hd graphics)/.test(g)) return 'low';
  if (/iris|vega|radeon/.test(g)) return 'medium';
  return cores >= 8 && mem >= 8 ? 'high' : 'medium';
}

export class QualityManager {
  constructor(renderer, { forced = null } = {}) {
    this.renderer = renderer;
    this.detected = detectTier(renderer);
    this.tier = forced && QUALITY_TIERS[forced] ? forced : this.detected;
    this.auto = !forced;
    this.overrides = {};
    this.settings = { ...QUALITY_TIERS[this.tier] };
    this.frameTimes = new Float32Array(90);
    this.frameIndex = 0;
    this.samples = 0;
    this.cooldown = 3.0;
    this.fps = 60;
    this.frameMs = 16.7;
    this.listeners = new Set();
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
    // Shared engine libraries register themselves here (see textures.js / materials.js).
    this.textureLibrary = null;
    this.materialLibrary = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of [...this.listeners]) fn(this.settings, this.tier);
  }

  get anisotropy() {
    return Math.min(this.settings.anisotropy, this.maxAnisotropy);
  }

  get pixelRatio() {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(dpr, this.settings.pixelRatio);
  }

  get tiers() {
    return TIER_ORDER.slice();
  }

  setTier(tier, { auto = false } = {}) {
    if (!QUALITY_TIERS[tier] || tier === this.tier) return false;
    this.tier = tier;
    this.settings = { ...QUALITY_TIERS[tier], ...this.overrides };
    if (!auto) this.auto = false;
    this.cooldown = 4.0;
    this.samples = 0;
    this._emit();
    return true;
  }

  setAuto(enabled) {
    this.auto = !!enabled;
    this.cooldown = 4.0;
    this.samples = 0;
  }

  /**
   * Pin one setting (e.g. override('ssao', false), override('shadowMapSize', 4096)).
   * Pass `undefined` to drop the override and return to the tier default.
   */
  override(key, value) {
    if (!(key in QUALITY_TIERS.ultra)) return false;
    if (value === undefined) delete this.overrides[key];
    else this.overrides[key] = value;
    const next = value === undefined ? QUALITY_TIERS[this.tier][key] : value;
    if (this.settings[key] === next) return true;
    this.settings[key] = next;
    this._emit();
    return true;
  }

  clearOverrides() {
    this.overrides = {};
    this.settings = { ...QUALITY_TIERS[this.tier] };
    this._emit();
  }

  /** Called once per frame; returns true when the tier changed. */
  update(dt) {
    const clamped = Math.min(dt, 0.25);
    this.frameTimes[this.frameIndex] = clamped;
    this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
    this.samples = Math.min(this.samples + 1, this.frameTimes.length);
    let sum = 0;
    for (let i = 0; i < this.samples; i++) sum += this.frameTimes[i];
    this.fps = this.samples ? this.samples / Math.max(1e-4, sum) : 60;
    this.frameMs = 1000 / Math.max(1, this.fps);

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
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'alphaMap']) {
    const t = material[key];
    if (t && t instanceof THREE.Texture && t.anisotropy !== aniso) {
      t.anisotropy = aniso;
      t.needsUpdate = true;
    }
  }
}
