import * as THREE from 'three';
import { PostFX } from './postfx.js';
import { QualityManager } from './quality.js';

/**
 * Engine: owns the WebGL context, the camera, the post chain and the frame
 * budget.  Everything else in the simulator is content that this drives.
 */
export class Engine {
  constructor(canvas, { forcedTier = null } = {}) {
    // ?quality=low|medium|high|ultra pins the tier - used by the QA harness and
    // by presenters who know exactly what hardware the lecture theatre has.
    if (!forcedTier) {
      const q = new URLSearchParams(window.location.search).get('quality');
      if (q && ['low', 'medium', 'high', 'ultra'].includes(q)) forcedTier = q;
    }
    this.canvas = canvas;
    this.contextLost = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // MSAA is done on the HDR render target instead
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
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

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.22, this.quality.settings.viewDistance);
    this.camera.position.set(0, 60, 400);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this._sunScreen = new THREE.Vector2(0.5, 0.5);
    this._sunVisibility = 0;
    this._tmpVec = new THREE.Vector3();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });

    this._onLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this._onRestored = () => {
      this.contextLost = false;
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
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = settings.shadowMapSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
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

  /**
   * Project the sun into screen space and estimate how much of it is on-screen
   * and above the horizon; feeds the god-ray pass.
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
    this._sunVisibility = onScreen * aboveHorizon;
  }

  render(scene) {
    if (this.contextLost) return;
    this.renderer.setRenderTarget(this.postfx.renderTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, this.camera);
    // renderer.info resets on every render() call, and the post chain issues
    // several; snapshot the scene pass before the blits overwrite it.
    const info = this.renderer.info.render;
    this._sceneCalls = info.calls;
    this._sceneTriangles = info.triangles;
    this._scenePoints = info.points;
    this.postfx.render(this.elapsed, {
      sunScreen: this._sunScreen,
      sunVisibility: this._sunVisibility,
    });
    this.renderer.setRenderTarget(null);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.frame++;
    this.quality.update(dt);
    return dt;
  }

  get stats() {
    const info = this.renderer.info;
    return {
      fps: this.quality.fps,
      calls: this._sceneCalls || info.render.calls,
      triangles: this._sceneTriangles || info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      tier: this.quality.tier,
    };
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.postfx.dispose();
    this.renderer.dispose();
  }
}
