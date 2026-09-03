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
import { Lighting } from './scene/Lighting.js';
import { TimeOfDay, TOD_PRESETS } from './scene/TimeOfDay.js';
import { Weather } from './scene/Weather.js';
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

    BOOT.progress(0.88, 'Setting the light…');
    this.lighting = new Lighting(this.scene, { tier: this.engine.tier });
    this.timeOfDay = new TimeOfDay({
      scene: this.scene,
      sky: this.sky,
      lighting: this.lighting,
      materials: this.materials,
      postfx: this.engine.postfx,
      envProbe: this.envProbe,
      onEnvRefresh: (state) => this.refreshEnvironment(state)
    });
    BOOT.progress(0.92, 'Bringing in the weather…');
    this.weather = new Weather(this.scene, this.materials, this.engine.postfx, {
      tier: this.engine.tier
    });
    // Every water surface in the campus ripples harder in the rain (E.4).
    const canal = this.world.zone('canal');
    const court = this.world.zone('court');
    const annex = this.world.zone('annex');
    if (canal) this.weather.addRippleTarget(canal.waterUniforms, 0.5, 1.5);
    if (court) this.weather.addRippleTarget(court.poolUniforms, 0.25, 1.3);
    if (annex) this.weather.addRippleTarget(annex.showWaterUniforms, 0.6, 1.2);

    this.engine.onTierChange = (t) => {
      this.lighting.setShadowsEnabled(t.shadows, t.shadowMap);
    };

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
  refreshEnvironment(state) {
    const u = this.sky.uniforms;
    const preset = state || {
      zenith: u.uZenith.value, horizon: u.uHorizon.value, ground: u.uGround.value,
      sunColor: u.uSunColor.value, sunDiscIntensity: u.uSunIntensity.value
    };
    const dir = this.lighting ? this.lighting.sunDirection : u.uSunDir.value;
    const env = this.envProbe.update(preset, dir);
    this.scene.environment = env;
    if (this.scene.environmentIntensity === undefined) this.scene.environmentIntensity = 0.85;
    if (this.materials) this.materials.setEnvMap(null);   // let scene.environment drive it
    return env;
  }

  /**
   * Force every Section D interior to build and show. Used by the QA
   * walkthrough so a room that is never approached still gets exercised.
   */
  revealInteriors(latch = true) {
    return this.world.interiors.revealAll(latch);
  }

  /** Return to normal distance-based interior culling (D.8). */
  releaseInteriors() { this.world.interiors.releaseAll(); }

  /**
   * Time the per-frame CPU work (scene graph, animated props, culling)
   * without rendering. Software rasterisation dominates any headless frame
   * timing, so this is the honest measure of the simulation's own cost and
   * the one that predicts behaviour on real hardware.
   * @returns {{ms:number, frames:number}} mean milliseconds per update pass
   */
  benchUpdate(frames = 120) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      for (const fn of this.engine.updaters) fn(1 / 60, this.engine.elapsed + i / 60);
    }
    const ms = (performance.now() - t0) / frames;
    return { ms, frames };
  }

  /** The manifest of every named interior space, for QA and the HUD. */
  interiorManifest() { return this.world.manifest(); }

  /* ---- Weather (E.6: R toggles rain; wind runs continuously) ---- */

  toggleRain() { return this.weather.toggleRain(); }
  setRain(on) { return this.weather.setRain(on); }
  setWind(v) { return this.weather.setWind(v); }
  cycleWind() { return this.weather.cycleWind(); }
  strikeLightning() { return this.weather.strike(1); }
  weatherStatus() { return this.weather.status(); }

  /* ---- Time of day (E.6: T cycles, G forces Golden Hour, N forces Night) ---- */

  cycleTimeOfDay() { return this.timeOfDay.cycle().name; }
  setTimeOfDay(idOrIndex, opts) {
    return typeof idOrIndex === 'number'
      ? this.timeOfDay.set(idOrIndex, opts)
      : this.timeOfDay.setById(idOrIndex, opts);
  }
  timeOfDayStatus() { return this.timeOfDay.status(); }
  get timeOfDayModes() { return TOD_PRESETS.map(p => ({ id: p.id, name: p.name })); }

  /** Jump to one of the seven zone presets (E.6 keys 1-7). */
  gotoZone(index, inside = false) {
    const p = ZONE_PRESETS[index];
    if (!p) return null;
    const pos = inside && p.interior ? p.interior : p.position;
    const look = inside && p.interiorLook ? p.interiorLook : p.look;
    this.setCamera(pos, look);
    return p.name;
  }

  /** Automation hook used by the screenshot and QA tools. */
  setCamera(pos, look) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.camera.updateMatrixWorld(true);
  }

  update(dt, t) {
    globalUniforms.uTime.value = t;
    this.weather.update(dt, this.camera, t);
    this.timeOfDay.update(dt);
    this.lighting.update(this.camera);
    this.sky.update(dt, this.camera, this.weather.windValue);
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
