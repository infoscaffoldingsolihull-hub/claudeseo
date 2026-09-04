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
import { AudioManager } from './audio/AudioManager.js';
import { ConstructionTimeline, MILESTONES, TOTAL_DAYS } from './construction/ConstructionTimeline.js';
import { Controls } from './ui/Controls.js';
import { ConstructionSite } from './construction/ConstructionSite.js';
import { HUD } from './ui/HUD.js';
import { SceneManager } from './scene/SceneManager.js';
import { START_VIEW, ZONE_PRESETS } from './world/SitePlan.js';
import { clamp, damp } from './core/MathUtil.js';

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

    BOOT.progress(0.95, 'Tuning the soundscape…');
    this.audio = new AudioManager();
    // Each interior publishes its acoustic profile, so the convolver's
    // impulse response follows the camera from room to room (D.8).
    this.world.interiors.onRoomChange = (room) => this.audio.onRoomChange(room);
    // Thunder is scheduled by the weather system at the strike's distance.
    this.weather.onThunder = (delay, strength) => this.audio.thunder(delay, strength);

    /* Browsers refuse to start an AudioContext without a gesture, so the
       graph is built on the first interaction and never before. */
    const startAudio = () => {
      this.audio.init();
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
    window.addEventListener('pointerdown', startAudio, { once: false });
    window.addEventListener('keydown', startAudio, { once: false });

    BOOT.progress(0.97, 'Loading the programme…');
    this.construction = new ConstructionTimeline();
    this.site = new ConstructionSite(
      this.scene, this.materials, this.world, this.construction, this.renderer,
      { tier: this.engine.tier }
    );
    // The pile rig's hammer drives a foley hit, so the blows land on picture.
    this.construction.onMilestoneChange = (m) => {
      if (this.hud) this.hud.onMilestoneChange(m);
    };

    this.engine.onTierChange = (t) => {
      this.lighting.setShadowsEnabled(t.shadows, t.shadowMap);
    };

    /* Say something when the driver resets the context, rather than leaving
       a frozen picture and no explanation. */
    this.engine.onContextLost = () => {
      if (this.hud) this.hud.toast('Graphics context lost — recovering…');
    };
    this.engine.onContextRestored = () => {
      if (this.hud) this.hud.toast('Graphics restored at reduced quality');
    };

    this.camera.position.set(START_VIEW.position[0], START_VIEW.position[1], START_VIEW.position[2]);
    this.camera.lookAt(START_VIEW.look[0], START_VIEW.look[1], START_VIEW.look[2]);

    this.controls = new Controls(this.camera, this.engine.canvas, this);
    this.photoMode = false;
    this.helpVisible = false;
    this.hud = new HUD(this);

    /* Hand the interior streamer the renderer, so it can warm each room's
       shaders and textures off the critical path instead of paying for them
       inside the frame that first draws the room. */
    this.world.interiors.attach(this.renderer, this.scene, this.camera, this.engine.postfx);

    /* Compile every exterior program before the first frame. This is the one
       place a stall is acceptable — the loading screen is still up — and it
       means the opening fly-around never pays a driver compile. */
    BOOT.progress(0.99, 'Compiling shaders…');
    if (this.renderer.compileAsync) {
      try {
        await this.engine.postfx.scenePassState(
          () => this.renderer.compileAsync(this.scene, this.camera));
      } catch (err) {
        console.warn('Shader pre-compile skipped:', err && err.message);
      }
    }

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

  /**
   * Collapse the world into the handful of scalars the audio mix reads.
   * Keeping this in one place means the soundscape always tracks what is
   * actually on screen.
   */
  audioWorldState() {
    const tod = this.timeOfDay.state;
    const w = this.weather;
    const room = this.world.interiors.current;
    const camY = this.camera.position.y;
    // Distance to the nearest large body of water on the campus.
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const dCanal = Math.abs(Math.hypot(cx, cz) - 126);
    const dPool = Math.hypot(cx, cz - 275);
    const dShow = Math.hypot(cx + 372, cz - 262);
    const nearest = Math.min(dCanal, dPool, dShow);

    const c = this.construction;
    return {
      night: tod.nightMix,
      golden: this.timeOfDay.current.id === 'golden' ? 1 : 0,
      rain: w.rainLevel,
      wind: w.windValue,
      interior: room ? 1 : 0,
      altitude: clamp((camY - 60) / 500, 0, 1),
      nearWater: clamp(1 - nearest / 140, 0, 1),
      construction: c ? c.audioWeight : 0,
      craneActivity: c ? c.craneActivity : 0,
      workerActivity: c ? c.workerActivity : 0,
      truckActivity: c ? c.truckActivity : 0
    };
  }

  /* ---- Camera & interaction (E.6) ---- */

  setCameraMode(mode) {
    const m = this.controls.setMode(mode);
    if (this.onStatusChange) this.onStatusChange();
    return m;
  }
  get cameraMode() { return this.controls.mode; }

  /**
   * Keys 1-7. Pressing the same zone again moves inside it, so every zone's
   * Section D interiors are reachable from the keyboard alone.
   */
  jumpToZone(index) {
    const p = ZONE_PRESETS[index];
    if (!p) return null;
    const again = this._lastZone === index && !this._lastZoneInside;
    const inside = again;
    this._lastZone = index;
    this._lastZoneInside = inside;
    const pos = inside && p.interior ? p.interior : p.position;
    const look = inside && p.interiorLook ? p.interiorLook : p.look;
    this.controls.moveTo(pos, look, 1.6);
    this.currentZoneName = p.name + (inside ? ' — interior' : '');
    if (this.onStatusChange) this.onStatusChange();
    return this.currentZoneName;
  }

  /** P — photo mode: hide the UI and open up a shallow depth of field. */
  togglePhotoMode() {
    this.photoMode = !this.photoMode;
    if (this.hud) this.hud.setPhotoMode(this.photoMode);
    return this.photoMode;
  }

  /** H — the help overlay listing every E.6 key. */
  toggleHelp() {
    this.helpVisible = !this.helpVisible;
    if (this.hud) this.hud.setHelpVisible(this.helpVisible);
    return this.helpVisible;
  }

  /**
   * Ease the DOF focus toward whatever the camera is pointed at, so photo
   * mode picks a sensible subject without the viewer setting a focus point.
   */
  updatePhotoFocus(dt) {
    const p = this.engine.postfx.params;
    const target = this.photoMode ? 1 : 0;
    p.dof = damp(p.dof, target, 3.0, dt);
    if (p.dof < 0.002) return;
    // Focus on the nearest of: the tower's centreline, or 60 m ahead.
    const cam = this.camera.position;
    const toTower = Math.hypot(cam.x, cam.z);
    const focus = clamp(Math.min(toTower, 260), 8, 300);
    p.focusDistance = damp(p.focusDistance, focus, 2.0, dt);
    p.focusRange = clamp(focus * 0.45, 12, 90);
  }

  /* ---- Construction mode (E.6: C, [ / ], Space) ---- */

  toggleConstruction() {
    const on = this.construction.toggle();
    if (this.onStatusChange) this.onStatusChange();
    return on;
  }
  setConstruction(on) { return this.construction.setActive(on); }
  scrubConstruction(dir) { return this.construction.step(dir); }
  toggleConstructionPlay() { return this.construction.togglePlay(); }
  goToMilestone(n) { return this.construction.goToMilestone(n); }
  constructionStatus() { return this.construction.status(); }
  siteStatus() { return this.site.status(); }
  hudStatus() { return this.hud.status(); }
  get milestones() { return MILESTONES; }

  /* ---- Audio (E.6: M toggles the soundscape) ---- */

  async initAudio() { return this.audio.init(); }
  toggleAudio() { return this.audio.toggle(); }
  audioStatus() { return this.audio.status(); }

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
    if (this.controls) {
      this.controls.snapTo(pos, look);
    } else {
      this.camera.position.set(pos[0], pos[1], pos[2]);
      this.camera.lookAt(look[0], look[1], look[2]);
    }
    this.camera.updateMatrixWorld(true);
  }

  /** Synthesise a key press — used by the QA harness to exercise E.6. */
  pressKey(code) {
    this.controls.handleKeyDown({
      code, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false
    });
    this.controls.keys.delete(code);
    return true;
  }

  /** Hold a movement key down (QA). */
  holdKey(code, down = true) {
    if (down) this.controls.keys.add(code); else this.controls.keys.delete(code);
  }

  update(dt, t) {
    globalUniforms.uTime.value = t;
    this.controls.update(dt);
    this.construction.update(dt);
    this.site.update(dt, t);
    this.weather.update(dt, this.camera, t);
    this.timeOfDay.update(dt);
    this.lighting.update(this.camera);
    this.sky.update(dt, this.camera, this.weather.windValue);
    this.world.update(dt, t, this.camera.position);
    this.audio.update(dt, this.audioWorldState());
    this.updatePhotoFocus(dt);
    this.hud.update(dt);
  }
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

const container = document.getElementById('viewport');
const app = new AeonSpire(container);

window.AEON = app;
/* The zone preset table, exposed for the Section G walkthrough harness. */
window.__ZONES = ZONE_PRESETS;

app.boot().catch((err) => {
  console.error(err);
  BOOT.fail('Failed to build the scene: ' + (err && err.message ? err.message : err), err);
});
