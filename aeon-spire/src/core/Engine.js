/**
 * AEON SPIRE — engine shell.
 *
 * Owns the WebGL renderer, the quality tier, the frame loop and the
 * adaptive-degradation logic required by E.9: when the frame budget is
 * missed for a sustained period the engine steps shadow, particle and
 * post-processing quality down rather than letting the frame rate collapse.
 */

import * as THREE from 'three';
import { PostFX } from './PostFX.js';
import { clamp } from './MathUtil.js';

/** Quality presets. `tex` feeds TextureFactory; `particles` scales rain/dust. */
export const TIERS = {
  low: {
    name: 'low', pixelRatio: 1.0, antialias: false, shadows: false, shadowMap: 1024,
    tex: 256, bloom: false, bloomLevels: 2, particles: 0.35, interiorRange: 120,
    detailRange: 320, maxLights: 6, softShadows: false
  },
  medium: {
    name: 'medium', pixelRatio: 1.0, antialias: true, shadows: true, shadowMap: 2048,
    tex: 512, bloom: true, bloomLevels: 3, particles: 0.7, interiorRange: 190,
    detailRange: 620, maxLights: 10, softShadows: false
  },
  high: {
    name: 'high', pixelRatio: 1.5, antialias: true, shadows: true, shadowMap: 3072,
    tex: 512, bloom: true, bloomLevels: 4, particles: 1.0, interiorRange: 260,
    detailRange: 1100, maxLights: 14, softShadows: true
  }
};

const ORDER = ['low', 'medium', 'high'];

/** Pick a starting tier from the URL, then from crude device hints. */
export function detectTier() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && TIERS[q]) return q;

  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 800;

  if (coarse && small) return 'low';
  if (mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export class Engine {
  /** @param {HTMLElement} container */
  constructor(container, { tier = detectTier() } = {}) {
    this.container = container;
    this.tierName = tier;
    this.tier = { ...TIERS[tier] };
    this.autoQuality = !new URLSearchParams(location.search).has('quality');

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.tier.antialias,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    this.renderer.setPixelRatio(Math.min(this.tier.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.tier.shadows;
    this.renderer.shadowMap.type = this.tier.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('tabindex', '0');

    /* A lost WebGL context is recoverable, and saying so beats a page that
       silently stops moving. Preventing the default on `webglcontextlost`
       is what lets the browser send `webglcontextrestored` at all; three.js
       re-uploads its own resources when it does. The tier is also dropped a
       step, because the most common reason a driver resets a context is
       that it was asked for more than it had. */
    this.contextLost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.stop();
      if (this.onContextLost) this.onContextLost();
    }, false);
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      const i = ORDER.indexOf(this.tierName);
      if (i > 0) this.setTier(ORDER[i - 1]);
      if (this.scene) this.start(this.scene);
      if (this.onContextRestored) this.onContextRestored();
    }, false);

    this.camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.12,
      7000
    );

    this.postfx = new PostFX(this.renderer, {
      bloom: this.tier.bloom,
      bloomLevels: this.tier.bloomLevels
    });

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsCount = 0;
    this._slowFor = 0;
    this._fastFor = 0;
    this.updaters = [];
    this.running = false;
    this._raf = 0;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.resize();
  }

  /** Register a per-frame callback: fn(dt, elapsed). */
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  offUpdate(fn) {
    const i = this.updaters.indexOf(fn);
    if (i >= 0) this.updaters.splice(i, 1);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.postfx.setSize(w, h, pr);
  }

  /** Apply a tier by name. Some settings (texture size) only affect new assets. */
  setTier(name) {
    if (!TIERS[name] || name === this.tierName) return false;
    this.tierName = name;
    const t = { ...TIERS[name] };
    this.tier = t;
    this.renderer.setPixelRatio(Math.min(t.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = t.shadows;
    this.renderer.shadowMap.type = t.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.postfx.bloomEnabled = t.bloom;
    this.postfx.levels = t.bloomLevels;
    this.postfx.width = -1;                 // force target rebuild
    this.resize();
    if (this.onTierChange) this.onTierChange(t);
    return true;
  }

  /**
   * E.9: drop a tier after 2.5s below 26fps, climb back after 12s above 55fps.
   * Only ever moves one step at a time, and never fights an explicit ?quality=.
   */
  _adaptQuality(dt) {
    if (!this.autoQuality) return;
    const i = ORDER.indexOf(this.tierName);
    if (this.fps < 26) { this._slowFor += dt; this._fastFor = 0; }
    else if (this.fps > 55) { this._fastFor += dt; this._slowFor = 0; }
    else { this._slowFor *= 0.9; this._fastFor *= 0.9; }

    if (this._slowFor > 2.5 && i > 0) {
      this.setTier(ORDER[i - 1]);
      this._slowFor = 0; this._fastFor = 0;
    } else if (this._fastFor > 12 && i < ORDER.length - 1) {
      this.setTier(ORDER[i + 1]);
      this._slowFor = 0; this._fastFor = 0;
    }
  }

  start(scene) {
    this.scene = scene;
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.tick();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  /** One frame. Exposed separately so headless tests can step deterministically. */
  tick(forcedDt) {
    const dt = clamp(forcedDt !== undefined ? forcedDt : this.clock.getDelta(), 0, 0.1);
    this.elapsed += dt;
    this.frame++;

    if (dt > 0) {
      this._fpsAcc += 1 / dt; this._fpsCount++;
      if (this._fpsCount >= 20) {
        this.fps = this._fpsAcc / this._fpsCount;
        this._fpsAcc = 0; this._fpsCount = 0;
        this._adaptQuality(0.34);
      }
    }

    for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt, this.elapsed);

    this.renderer.info.reset();
    if (this.scene) this.postfx.render(this.scene, this.camera, dt);
  }

  /** Renderer statistics for the HUD / QA harness. */
  stats() {
    const info = this.renderer.info;
    return {
      fps: this.fps,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      tier: this.tierName
    };
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.postfx.dispose();
    this.renderer.dispose();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}
