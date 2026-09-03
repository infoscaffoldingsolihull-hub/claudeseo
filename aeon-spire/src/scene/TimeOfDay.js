/**
 * AEON SPIRE — time-of-day system (E.4).
 *
 * Five modes: Dawn, Day, Golden Hour, Dusk, Night. Each carries its own sun
 * angle and colour, sky gradient, fog, colour grade and window-emissive
 * level. Switching modes interpolates *every* one of those values over a
 * couple of seconds, because the spec is explicit that this must be a
 * smooth transition and not a hard cut.
 *
 * The same interpolated state also drives:
 *   • the environment probe (so glass and metal reflect the right sky),
 *   • the interior environment response required by D.8, and
 *   • the post-processing grade, so night is genuinely graded, not dimmed.
 */

import * as THREE from 'three';
import { clamp, lerp, smootherstep, damp } from '../core/MathUtil.js';

const C = (hex) => new THREE.Color(hex);
const DEG = Math.PI / 180;

/**
 * The five presets. Values are deliberately hand-tuned rather than derived
 * from a physical sky model — E.3's target is a confident stylised look.
 */
export const TOD_PRESETS = [
  {
    id: 'dawn', name: 'Dawn', key: 'Dawn',
    sunAzimuth: 78 * DEG, sunElevation: 5 * DEG,
    sunColor: C(0xffb27a), sunIntensity: 1.5,
    fillColor: C(0x7f9fd8), fillIntensity: 0.55,
    hemiSky: C(0x9fb6d8), hemiGround: C(0x4a4038), hemiIntensity: 0.85,
    ambientIntensity: 0.10,
    zenith: C(0x2c4a80), horizon: C(0xe0a878), ground: C(0x2a2c33),
    cloudColor: C(0xf0c8a8), cloud: 0.42, haze: 0.62, stars: 0.18,
    sunDiscIntensity: 0.85,
    fogColor: C(0xc8b0a0), fogNear: 900, fogFar: 5200,
    exposure: 1.05, grade: C(0xffe8dc), lift: C(0x0a0c14), contrast: 1.06,
    saturation: 1.10, vignette: 0.46, bloomStrength: 0.72, bloomThreshold: 0.78,
    nightMix: 0.55, interiorEnv: 0.30, envIntensity: 0.52
  },
  {
    id: 'day', name: 'Day', key: 'Day',
    sunAzimuth: 140 * DEG, sunElevation: 62 * DEG,
    sunColor: C(0xfff6e6), sunIntensity: 4.2,
    fillColor: C(0x9ab8e0), fillIntensity: 0.34,
    hemiSky: C(0xbcd6ee), hemiGround: C(0x60584a), hemiIntensity: 0.78,
    ambientIntensity: 0.05,
    zenith: C(0x2f6bb5), horizon: C(0xc2d8ea), ground: C(0x33363c),
    cloudColor: C(0xffffff), cloud: 0.34, haze: 0.30, stars: 0.0,
    sunDiscIntensity: 1.0,
    fogColor: C(0xbcd2e4), fogNear: 1400, fogFar: 6400,
    exposure: 1.0, grade: C(0xffffff), lift: C(0x000000), contrast: 1.12,
    saturation: 1.10, vignette: 0.40, bloomStrength: 0.42, bloomThreshold: 0.95,
    nightMix: 0.0, interiorEnv: 0.55, envIntensity: 0.85
  },
  {
    id: 'golden', name: 'Golden Hour', key: 'Golden',
    sunAzimuth: 205 * DEG, sunElevation: 11 * DEG,
    sunColor: C(0xffc077), sunIntensity: 3.4,
    fillColor: C(0x8ba8d8), fillIntensity: 0.45,
    hemiSky: C(0xd8c0a0), hemiGround: C(0x5e4a36), hemiIntensity: 1.0,
    ambientIntensity: 0.09,
    zenith: C(0x3f6faa), horizon: C(0xf0b070), ground: C(0x33302e),
    cloudColor: C(0xffd8b0), cloud: 0.48, haze: 0.55, stars: 0.0,
    sunDiscIntensity: 1.15,
    fogColor: C(0xdcb188), fogNear: 1100, fogFar: 5600,
    exposure: 0.94, grade: C(0xfff2dc), lift: C(0x0c0a06), contrast: 1.14,
    saturation: 1.14, vignette: 0.46, bloomStrength: 0.55, bloomThreshold: 0.88,
    nightMix: 0.18, interiorEnv: 0.44, envIntensity: 0.62
  },
  {
    id: 'dusk', name: 'Dusk', key: 'Dusk',
    sunAzimuth: 232 * DEG, sunElevation: 2.0 * DEG,
    sunColor: C(0xff8a5c), sunIntensity: 0.75,
    fillColor: C(0x6f8ed0), fillIntensity: 0.6,
    hemiSky: C(0x7f92c0), hemiGround: C(0x3a3630), hemiIntensity: 0.7,
    ambientIntensity: 0.12,
    zenith: C(0x1e2a56), horizon: C(0xc76a58), ground: C(0x22242a),
    cloudColor: C(0xb87f88), cloud: 0.5, haze: 0.7, stars: 0.4,
    sunDiscIntensity: 0.7,
    fogColor: C(0x6f6478), fogNear: 800, fogFar: 4600,
    exposure: 1.10, grade: C(0xeae6f2), lift: C(0x0e0f1c), contrast: 1.07,
    saturation: 1.02, vignette: 0.5, bloomStrength: 1.0, bloomThreshold: 0.62,
    nightMix: 0.88, interiorEnv: 0.26, envIntensity: 0.34
  },
  {
    id: 'night', name: 'Night', key: 'Night',
    // At night the "sun" stands in for the moon, so it is *above* the
    // horizon — a disc sitting on the skyline read as a stray light source.
    sunAzimuth: 300 * DEG, sunElevation: 34 * DEG,
    sunColor: C(0xb0c4ee), sunIntensity: 0.55,
    fillColor: C(0x5a72ad), fillIntensity: 0.42,
    hemiSky: C(0x39496f), hemiGround: C(0x1b1e26), hemiIntensity: 0.62,
    ambientIntensity: 0.22,
    zenith: C(0x060a18), horizon: C(0x1c2b45), ground: C(0x121419),
    cloudColor: C(0x27324a), cloud: 0.3, haze: 0.4, stars: 1.0,
    sunDiscIntensity: 0.40,
    fogColor: C(0x141a2a), fogNear: 700, fogFar: 4200,
    exposure: 1.25, grade: C(0xdce6ff), lift: C(0x0a0e1a), contrast: 1.12,
    saturation: 1.02, vignette: 0.58, bloomStrength: 1.35, bloomThreshold: 0.46,
    nightMix: 1.0, interiorEnv: 0.20, envIntensity: 0.26
  }
];

/** Numeric fields interpolated linearly; colour fields via Color.lerp. */
const NUM_KEYS = [
  'sunAzimuth', 'sunElevation', 'sunIntensity', 'fillIntensity', 'hemiIntensity',
  'ambientIntensity', 'cloud', 'haze', 'stars', 'sunDiscIntensity',
  'fogNear', 'fogFar', 'exposure', 'contrast', 'saturation', 'vignette',
  'bloomStrength', 'bloomThreshold', 'nightMix', 'interiorEnv', 'envIntensity'
];
const COL_KEYS = [
  'sunColor', 'fillColor', 'hemiSky', 'hemiGround', 'zenith', 'horizon',
  'ground', 'cloudColor', 'fogColor', 'grade', 'lift'
];

function blankState() {
  const s = {};
  for (const k of NUM_KEYS) s[k] = 0;
  for (const k of COL_KEYS) s[k] = new THREE.Color();
  return s;
}

export class TimeOfDay {
  /**
   * @param {object} deps { sky, lighting, materials, postfx, envProbe, onEnvRefresh }
   */
  constructor({ sky, lighting, materials, postfx, envProbe, onEnvRefresh, scene } = {}) {
    this.scene = scene;
    this.sky = sky;
    this.lighting = lighting;
    this.materials = materials;
    this.postfx = postfx;
    this.envProbe = envProbe;
    this.onEnvRefresh = onEnvRefresh;

    this.presets = TOD_PRESETS;
    this.index = 1;                 // start at Day
    this.fromIndex = 1;
    this.state = blankState();
    this.transition = 1;            // 1 = settled
    this.transitionTime = 2.2;      // seconds — E.4's "smooth, not a hard cut"
    this._envTimer = 0;

    this.copyInto(this.state, this.presets[this.index]);
    this.push(true);
  }

  get current() { return this.presets[this.index]; }
  get name() { return this.presets[this.index].name; }
  /** True while a mode change is still being interpolated. */
  get isTransitioning() { return this.transition < 1; }

  copyInto(dst, src) {
    for (const k of NUM_KEYS) dst[k] = src[k];
    for (const k of COL_KEYS) dst[k].copy(src[k]);
    return dst;
  }

  /** Begin a smooth move to preset `i`. */
  set(i, { instant = false } = {}) {
    const n = this.presets.length;
    const target = ((i % n) + n) % n;
    if (target === this.index && this.transition >= 1) return this.presets[target];
    // Freeze the current interpolated look as the new starting point, so a
    // mode change mid-transition still moves smoothly.
    this.from = this.from || blankState();
    this.copyInto(this.from, this.state);
    this.fromIndex = this.index;
    this.index = target;
    this.transition = instant ? 1 : 0;
    if (instant) {
      this.copyInto(this.state, this.presets[target]);
      this.push(true);
    }
    return this.presets[target];
  }

  /** T key — advance to the next mode. */
  cycle() { return this.set(this.index + 1); }

  /** Jump to a preset by id ('golden' for G, 'night' for N). */
  setById(id, opts) {
    const i = this.presets.findIndex(p => p.id === id);
    return i >= 0 ? this.set(i, opts) : null;
  }

  update(dt) {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionTime);
      const k = smootherstep(this.transition);
      const a = this.from, b = this.presets[this.index];
      for (const key of NUM_KEYS) this.state[key] = lerp(a[key], b[key], k);
      for (const key of COL_KEYS) this.state[key].copy(a[key]).lerp(b[key], k);
      this.push(false);

      // Refresh reflections a few times across the transition rather than
      // every frame — the probe is cheap but not free.
      this._envTimer += dt;
      if (this._envTimer > 0.28 || this.transition >= 1) {
        this._envTimer = 0;
        if (this.onEnvRefresh) this.onEnvRefresh(this.state);
      }
    }
  }

  /** Publish the current interpolated state to every consumer. */
  push(refreshEnv) {
    const s = this.state;
    if (this.lighting) this.lighting.apply(s);
    if (this.sky) {
      this.sky.apply(s);
      this.sky.setSunDirection(this.lighting ? this.lighting.sunDirection : new THREE.Vector3(0, 1, 0));
    }
    if (this.scene) {
      /* The probe's sky is display-referred and very bright at dawn and
         dusk; used at full strength as an irradiance source it washes the
         whole campus in the horizon's colour. This scales it per mode. */
      this.scene.environmentIntensity = s.envIntensity;
    }
    if (this.materials) {
      // Window emissive and interior environment response (E.4 / D.8).
      this.materials.setNightMix(s.nightMix);
      this.materials.setInteriorEnv(s.interiorEnv);
    }
    if (this.postfx) {
      const p = this.postfx.params;
      p.exposure = s.exposure;
      p.grade.copy(s.grade);
      p.lift.copy(s.lift);
      p.contrast = s.contrast;
      p.saturation = s.saturation;
      p.vignette = s.vignette;
      p.bloomStrength = s.bloomStrength;
      p.bloomThreshold = s.bloomThreshold;
    }
    if (refreshEnv && this.onEnvRefresh) this.onEnvRefresh(s);
  }

  /** A compact description for the HUD. */
  status() {
    return {
      id: this.current.id,
      name: this.name,
      transitioning: this.isTransitioning,
      progress: this.transition,
      nightMix: this.state.nightMix
    };
  }
}
