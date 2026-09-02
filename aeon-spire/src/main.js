/**
 * AEON SPIRE — application entry point.
 *
 * Boots the engine, builds the world, wires the systems together and
 * exposes a small automation surface on `window.AEON` so the QA harness in
 * tools/verify.mjs can drive a full walkthrough headlessly.
 */

import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary, globalUniforms } from './core/Materials.js';
import { Sky } from './scene/Sky.js';
import { EnvironmentProbe } from './scene/Environment.js';
import { SceneManager } from './scene/SceneManager.js';
import { START_VIEW, ZONE_PRESETS } from './world/SitePlan.js';
import { clamp } from './core/MathUtil.js';

const BOOT = window.AEON_BOOT || { progress() {}, done() {}, fail() {} };

class AeonSpire {
  constructor(container) {
    this.container = container;
    this.errors = [];
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.errors.push(String(e.reason)));
  }

  async boot() {
    BOOT.progress(0.10, 'Starting renderer…');
    this.engine = new Engine(this.container);
    this.camera = this.engine.camera;
    this.renderer = this.engine.renderer;

    this.THREE_REVISION = THREE.REVISION;
    this.scene = new THREE.Scene();
    this.scene.name = 'AeonSpire';

    BOOT.progress(0.18, 'Generating materials…');
    this.materials = new MaterialLibrary({ textureSize: this.engine.tier.tex });

    BOOT.progress(0.26, 'Raising the sky…');
    const stars = this.materials.tex.get('starfield').map;
    this.sky = new Sky(this.scene, stars);

    BOOT.progress(0.30, 'Filtering the environment…');
    this.envProbe = new EnvironmentProbe(this.renderer);
    this.refreshEnvironment();

    BOOT.progress(0.34, 'Laying the ground…');
    this.world = new SceneManager(this.scene, this.materials, {
      tier: this.engine.tier,
      onProgress: (f, m) => BOOT.progress(f, m)
    }).build();

    // Provisional lighting; the full time-of-day rig replaces this in Phase 5.
    this.hemi = new THREE.HemisphereLight(0xbcd4e8, 0x4a4336, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    this.sun.position.set(320, 460, 240);
    this.scene.add(this.sun);
    this.scene.fog = new THREE.Fog(0xbcd4e8, 420, 3400);

    this.camera.position.set(START_VIEW.position[0], START_VIEW.position[1], START_VIEW.position[2]);
    this.camera.lookAt(START_VIEW.look[0], START_VIEW.look[1], START_VIEW.look[2]);

    this.engine.onUpdate((dt, t) => this.update(dt, t));
    this.engine.start(this.scene);

    BOOT.progress(1.0, 'Ready');
    BOOT.done();
    window.AEON_STARTED = true;
    return this;
  }

  /**
   * Repaint and re-filter the environment map from the current sky, then
   * push it onto every material. Called on boot and whenever the time of
   * day changes.
   */
  refreshEnvironment() {
    const u = this.sky.uniforms;
    const preset = {
      zenith: u.uZenith.value, horizon: u.uHorizon.value, ground: u.uGround.value,
      sunColor: u.uSunColor.value, sunDiscIntensity: u.uSunIntensity.value
    };
    const env = this.envProbe.update(preset, u.uSunDir.value);
    this.scene.environment = env;
    this.scene.environmentIntensity = 1.0;
    if (this.materials) this.materials.setEnvMap(null);   // let scene.environment drive it
    return env;
  }

  /** Automation hook used by the screenshot and QA tools. */
  setCamera(pos, look) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.camera.updateMatrixWorld(true);
  }

  update(dt, t) {
    globalUniforms.uTime.value = t;
    this.sky.update(dt, this.camera, globalUniforms.uWind.value);
    this.world.update(dt, t, this.camera.position);
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

const container = document.getElementById('viewport');
const app = new AeonSpire(container);

window.AEON = app;

app.boot().catch((err) => {
  console.error(err);
  BOOT.fail('Failed to build the scene: ' + (err && err.message ? err.message : err), err);
});
