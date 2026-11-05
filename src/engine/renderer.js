import * as THREE from 'three';
import { PostFX } from './postfx.js';
import { QualityManager } from './quality.js';
import { MaterialLibrary } from './materials.js';
import { TextureLibrary } from './textures.js';

/**
 * Engine (A3): owns the WebGL context, the camera, the post chain and the
 * frame budget. Everything else in the simulator is content that this drives.
 *
 * Depth: logarithmic depth is OFF (it disables early-z and breaks the depth
 * reprojection passes). Precision for the 9 km city backdrop comes from a
 * near plane of 0.3 m and a far plane from the tier's viewDistance; coplanar
 * pavement layers use polygonOffset (MaterialLibrary markings, world layers).
 *
 * Environment coupling without extra wiring: SkySystem and WeatherSystem
 * register themselves on `scene.userData.sky / .weather`; the World may set
 * `scene.userData.interiorAt = (position) => 'terminal' | 'tower' | null`.
 * `render(scene)` reads those to blend the post look (night, golden hour,
 * dust, rain, interior), drive heat shimmer and scale the lens flare.
 */
export class Engine {
  constructor(canvas, { forcedTier = null } = {}) {
    if (!forcedTier && typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('quality');
      if (q && ['low', 'medium', 'high', 'ultra'].includes(q)) forcedTier = q;
    }
    this.canvas = canvas;
    this.contextLost = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // MSAA / TAA / FXAA happen in the post chain
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      logarithmicDepthBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;   // tonemapped in the composite pass
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.quality = new QualityManager(this.renderer, { forced: forcedTier });
    this.postfx = new PostFX(this.renderer, this.quality);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, this.quality.settings.viewDistance);
    this.camera.position.set(0, 60, 400);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this.lastDt = 1 / 60;
    this._sunScreen = new THREE.Vector2(0.5, 0.5);
    this._sunVisibility = 0;
    this._tmpVec = new THREE.Vector3();
    this._unjittered = new THREE.Matrix4();
    this._sceneInfo = { calls: 0, triangles: 0, points: 0, lines: 0 };
    this._interior = 0;
    this.photoLook = false;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });

    this._onLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this._onRestored = () => {
      this.contextLost = false;
      this.postfx.resetHistory();
      this.resize();
    };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);

    this.quality.onChange((settings) => this.applyQuality(settings));
    this.applyQuality(this.quality.settings);
    this.resize();
  }

  applyQuality(settings) {
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = !!settings.shadows;
    this.renderer.shadowMap.type = settings.shadowMapSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.camera.near = 0.3;
    this.camera.far = settings.viewDistance;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const pr = this.quality.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  /** Shared PBR material library (built on first use, reusing main's TextureLibrary). */
  get materials() {
    if (!this._materials) {
      const tex = this.quality.textureLibrary || new TextureLibrary(this.quality);
      this._materials = new MaterialLibrary(tex, this.quality);
    }
    return this._materials;
  }

  /**
   * Apply `settings.graphics` ({ tier:'auto'|'low'|…, bloom, godRays, ssao, dof,
   * motionBlur, lensFlare, grain }) and optionally reduced motion.
   */
  applyGraphicsSettings(graphics = {}, { reducedMotion = false } = {}) {
    if (graphics.tier && graphics.tier !== 'auto') this.quality.setTier(graphics.tier);
    else if (graphics.tier === 'auto') this.quality.setAuto(true);
    this.postfx.setFeatures(graphics);
    if (reducedMotion) this.postfx.setFeature('motionBlur', false);
  }

  /** Pre-compile every shader in `scene` so the first frames do not hitch. */
  warmup(scene) {
    try {
      this.renderer.compile(scene, this.camera);
    } catch {
      /* compile is an optimisation only */
    }
  }

  /**
   * Project the sun into screen space and estimate how much of it is on-screen
   * and above the horizon; feeds god-rays and the lens flare.
   */
  updateSunScreenPosition(sunWorldPos, aboveHorizon) {
    this._tmpVec.copy(sunWorldPos).project(this.camera);
    const x = this._tmpVec.x * 0.5 + 0.5;
    const y = this._tmpVec.y * 0.5 + 0.5;
    const behind = this._tmpVec.z > 1;
    this._sunScreen.set(x, y);
    if (behind || !aboveHorizon) {
      this._sunVisibility = 0;
      return;
    }
    const edge = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5));
    const onScreen = THREE.MathUtils.clamp(1.0 - (edge - 0.4) / 0.45, 0, 1);
    this._sunVisibility = onScreen * THREE.MathUtils.clamp(aboveHorizon * 4, 0, 1);
  }

  /** Feed the post look from sky / weather / interior registered on the scene. */
  _environment(scene) {
    const ud = scene.userData || {};
    const sky = ud.sky;
    const weather = ud.weather;
    let interior = 0;
    if (typeof ud.interiorAt === 'function') {
      try {
        interior = ud.interiorAt(this.camera.position) ? 1 : 0;
      } catch {
        interior = 0;
      }
    }
    this._interior += (interior - this._interior) * Math.min(1, this.lastDt * 4);
    const ss = sky ? sky.state : null;
    const ws = weather ? weather.state : null;
    const env = {
      night: ss ? ss.nightFactor : 0,
      golden: ss ? ss.goldenFactor : 0,
      dust: ws ? ws.dust || 0 : 0,
      rain: ws ? ws.rain || 0 : 0,
      heat: ws ? (ws.heat || 0) * (ss ? ss.dayFactor : 1) : 0,
      interior: this._interior,
      photo: this.photoLook ? 1 : 0,
    };
    this.postfx.setEnvironment(env);
    // Overcast, dust and haze hide the sun disc: scale god-rays and flare.
    if (sky && sky.atmosphere) {
      const a = sky.atmosphere;
      const clear = THREE.MathUtils.clamp(a.sunDim, 0, 1) * (1 - a.cloudCover * a.cloudDark) * (1 - a.haze * 0.6);
      return clear * clear * (1 - this._interior);
    }
    return 1 - this._interior;
  }

  render(scene) {
    if (this.contextLost) return;
    const sunScale = this._environment(scene);
    const cam = this.camera;
    // TAA: sub-pixel jitter through the view offset, unjittered copy kept for reprojection.
    this._unjittered.copy(cam.projectionMatrix);
    const j = this.postfx.nextJitter();
    const jittered = j.x !== 0 || j.y !== 0;
    if (jittered) {
      const w = this.postfx.width;
      const h = this.postfx.height;
      cam.setViewOffset(w, h, j.x, j.y, w, h);
    }
    this.renderer.setRenderTarget(this.postfx.renderTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, cam);
    // renderer.info resets on every render() call and the post chain issues
    // many; snapshot the scene pass before the blits overwrite it.
    const info = this.renderer.info.render;
    this._sceneInfo.calls = info.calls;
    this._sceneInfo.triangles = info.triangles;
    this._sceneInfo.points = info.points;
    this._sceneInfo.lines = info.lines;
    this.postfx.render(this.elapsed, {
      sunScreen: this._sunScreen,
      sunVisibility: this._sunVisibility * sunScale,
      camera: cam,
      unjitteredProjection: this._unjittered,
    });
    if (jittered) cam.clearViewOffset();
    this.renderer.setRenderTarget(null);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.lastDt = dt;
    this.elapsed += dt;
    this.frame++;
    this.quality.update(dt);
    return dt;
  }

  get stats() {
    const info = this.renderer.info;
    return {
      fps: this.quality.fps,
      frameMs: this.quality.frameMs,
      calls: this._sceneInfo.calls || info.render.calls,
      triangles: this._sceneInfo.triangles || info.render.triangles,
      points: this._sceneInfo.points,
      lines: this._sceneInfo.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      tier: this.quality.tier,
      auto: this.quality.auto,
      pixelRatio: this.quality.pixelRatio,
      width: this.postfx.width,
      height: this.postfx.height,
      passes: this.postfx.activePasses,
    };
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.postfx.dispose();
    if (this._materials) this._materials.dispose();
    this.renderer.dispose();
  }
}
