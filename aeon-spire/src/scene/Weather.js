/**
 * AEON SPIRE — weather (E.4).
 *
 * Rain
 *   • Instanced streaks drawn as one LineSegments draw call. Each drop lives
 *     in a box that travels with the camera and wraps, so the system costs
 *     the same whether you are at ground level or at 700 m.
 *   • Wet-surface shift: every material registered as `exterior` in the
 *     MaterialLibrary darkens and drops roughness through the shared
 *     `uWetness` uniform, which reads as puddling and specular sheen.
 *   • Canal, pool and show-basin ripple amplitude rises with the rain.
 *   • Screen-space lightning through the post chain, with a thunder event
 *     emitted after a delay set by the strike's notional distance.
 *
 * Wind
 *   • A gusting scalar that drives the vertex sway already compiled into
 *     foliage, flags and (in construction mode) crane cables.
 *   • Drifting dust motes, denser and faster as the wind rises.
 *   • The same scalar is published for the audio system's wind layer.
 */

import * as THREE from 'three';
import { globalUniforms } from '../core/Materials.js';
import { clamp, lerp, damp, rng, TAU } from '../core/MathUtil.js';

const RAIN_VERT = /* glsl */`
attribute vec3 aOffset;
attribute float aSpeed;
attribute float aLen;
attribute float aEnd;

uniform float uTime;
uniform vec3  uCamera;
uniform vec3  uBox;
uniform vec2  uWindDir;
uniform float uWind;
uniform float uFall;

varying float vFade;

void main() {
  // Each drop falls and drifts, then wraps inside a box centred on the camera.
  vec3 p = aOffset;
  p.y -= uTime * aSpeed * uFall;
  p.x += uTime * uWindDir.x * uWind * 9.0;
  p.z += uTime * uWindDir.y * uWind * 9.0;

  vec3 base = uCamera + vec3(0.0, uBox.y * 0.35, 0.0);
  p = mod(p - base + uBox * 0.5, uBox) - uBox * 0.5 + base;

  // The second vertex of each segment trails behind along the fall vector.
  vec3 dir = normalize(vec3(uWindDir.x * uWind * 9.0, -aSpeed * uFall, uWindDir.y * uWind * 9.0));
  p += dir * aEnd * aLen;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Fade drops that are very close to the near plane or far away.
  float d = -mv.z;
  vFade = smoothstep(1.5, 6.0, d) * (1.0 - smoothstep(uBox.x * 0.35, uBox.x * 0.55, d));
  gl_Position = projectionMatrix * mv;
}`;

const RAIN_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vFade);
}`;

export class Weather {
  /**
   * @param {THREE.Scene} scene
   * @param {MaterialLibrary} materials
   * @param {PostFX} postfx
   * @param {object} opts { tier }
   */
  constructor(scene, materials, postfx, { tier } = {}) {
    this.scene = scene;
    this.materials = materials;
    this.postfx = postfx;
    this.tier = tier;

    /* ---- State ---- */
    this.rainOn = false;
    this.rainLevel = 0;             // eased 0 → 1
    this.wetness = 0;               // lags the rain, and dries slowly
    this.windBase = 0.25;           // the setting the user/scene asks for
    this.windValue = 0.25;          // the gusting value the world actually sees
    this.windDir = new THREE.Vector2(0.82, 0.57).normalize();
    this.time = 0;

    /* Lightning */
    this.flash = 0;
    this._nextStrike = 8 + Math.random() * 14;
    this._strikeQueue = [];
    /** Called as onThunder(delaySeconds, strength) so audio can schedule it. */
    this.onThunder = null;
    /** Called as onLightning(strength) at the moment of the flash. */
    this.onLightning = null;

    /* Ripple consumers registered by the zones (canal, pool, show basin). */
    this.rippleTargets = [];

    const particles = tier ? tier.particles : 1.0;
    this.buildRain(Math.round(9000 * particles));
    this.buildDust(Math.round(700 * particles));
  }

  /** Register a `{ uRipple: {value} }` uniform set to be driven by the rain. */
  addRippleTarget(uniforms, baseValue = 0.3, gain = 1.4) {
    if (!uniforms || !uniforms.uRipple) return;
    this.rippleTargets.push({ uniforms, base: baseValue, gain });
  }

  /* ------------------------------------------------------------------ */

  buildRain(count) {
    const box = new THREE.Vector3(240, 200, 240);
    this.rainBox = box;
    const r = rng(9182);

    const positions = new Float32Array(count * 2 * 3);   // unused, but required
    const offsets = new Float32Array(count * 2 * 3);
    const speeds = new Float32Array(count * 2);
    const lens = new Float32Array(count * 2);
    const ends = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const ox = (r() - 0.5) * box.x;
      const oy = (r() - 0.5) * box.y;
      const oz = (r() - 0.5) * box.z;
      const sp = 34 + r() * 26;
      const ln = 1.1 + r() * 2.4;
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        offsets[j * 3] = ox; offsets[j * 3 + 1] = oy; offsets[j * 3 + 2] = oz;
        speeds[j] = sp;
        lens[j] = ln;
        ends[j] = k;   // 0 = head, 1 = tail
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    geo.setDrawRange(0, 0);   // nothing drawn until it rains

    this.rainUniforms = {
      uTime: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uBox: { value: box },
      uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
      uWind: { value: 0.25 },
      uFall: { value: 1.0 },
      uColor: { value: new THREE.Color(0xc8dcea) },
      uOpacity: { value: 0.0 }
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false
    });

    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.name = 'Rain';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 20;
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.rainCount = count;
  }

  buildDust(count) {
    const r = rng(5150);
    const box = new THREE.Vector3(180, 90, 180);
    this.dustBox = box;
    const pos = new Float32Array(count * 3);
    this.dustSeed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (r() - 0.5) * box.x, y = r() * box.y, z = (r() - 0.5) * box.z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this.dustSeed[i * 3] = x; this.dustSeed[i * 3 + 1] = y; this.dustSeed[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const sprite = this.materials.tex.get('glowSprite').map;
    const mat = new THREE.PointsMaterial({
      size: 0.42, map: sprite, transparent: true, opacity: 0.16,
      depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xd8cfbc, sizeAttenuation: true, fog: false
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.name = 'WindDust';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 19;
    this.scene.add(this.dust);
    this.dustCount = count;
    this.dustMaterial = mat;
  }

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */

  /** R key. Independent of the time-of-day mode, as E.4 requires. */
  toggleRain() { this.rainOn = !this.rainOn; return this.rainOn; }
  setRain(on) { this.rainOn = !!on; return this.rainOn; }

  /** Set the base wind strength, 0 (still) → 1 (gale). */
  setWind(v) { this.windBase = clamp(v, 0, 1); return this.windBase; }
  cycleWind() {
    const steps = [0.05, 0.25, 0.55, 0.85];
    const i = steps.findIndex(s => s > this.windBase + 0.01);
    return this.setWind(steps[i < 0 ? 0 : i]);
  }

  /** Trigger a strike now (used by the QA walkthrough). */
  strike(strength = 1) {
    const s = 0.55 + Math.random() * 0.6;
    const mag = s * strength;
    // Two or three sub-flashes, as real lightning reads.
    this._strikeQueue.push({ t: 0.0, mag: mag });
    this._strikeQueue.push({ t: 0.09 + Math.random() * 0.06, mag: mag * 0.62 });
    if (Math.random() > 0.45) this._strikeQueue.push({ t: 0.26 + Math.random() * 0.1, mag: mag * 0.4 });
    const distance = 0.4 + Math.random() * 3.2;   // notional km
    if (this.onLightning) this.onLightning(mag);
    if (this.onThunder) this.onThunder(distance * 2.9, mag);
    return mag;
  }

  /* ------------------------------------------------------------------ */

  update(dt, camera, elapsed) {
    this.time += dt;

    /* ---- Rain level and the wetness that lags it ---- */
    const target = this.rainOn ? 1 : 0;
    this.rainLevel = damp(this.rainLevel, target, this.rainOn ? 1.6 : 1.1, dt);
    // Surfaces soak quickly and dry slowly — that asymmetry is what sells it.
    this.wetness = damp(this.wetness, this.rainLevel, this.rainLevel > this.wetness ? 0.9 : 0.16, dt);
    this.materials.setWetness(this.wetness);

    /* ---- Wind: a gusting value around the base setting ---- */
    const gust =
      Math.sin(this.time * 0.31) * 0.5 +
      Math.sin(this.time * 0.77 + 1.7) * 0.3 +
      Math.sin(this.time * 1.63 + 4.1) * 0.2;
    // Rain brings its own weather, so it lifts the floor of the wind.
    const base = Math.max(this.windBase, this.rainLevel * 0.55);
    this.windValue = clamp(base + gust * 0.18 * (0.3 + base), 0, 1);
    this.materials.setWind(this.windValue);
    // Slowly rotate the prevailing direction.
    const a = this.time * 0.035;
    this.windDir.set(Math.cos(a), Math.sin(a));

    /* ---- Rain geometry ---- */
    const u = this.rainUniforms;
    u.uTime.value = this.time;
    u.uCamera.value.copy(camera.position);
    u.uWind.value = this.windValue;
    u.uWindDir.value.copy(this.windDir);
    u.uOpacity.value = this.rainLevel * 0.55;
    const visible = this.rainLevel > 0.01;
    this.rain.visible = visible;
    if (visible) {
      // Scale the drawn count with the rain level so a light shower is cheap.
      const n = Math.round(this.rainCount * clamp(this.rainLevel, 0, 1)) * 2;
      this.rain.geometry.setDrawRange(0, n);
    }

    /* ---- Ripples on every registered water surface ---- */
    for (const t of this.rippleTargets) {
      t.uniforms.uRipple.value = t.base + this.rainLevel * t.gain;
    }

    /* ---- Dust ---- */
    this.updateDust(dt, camera);

    /* ---- Lightning ---- */
    this.updateLightning(dt);
  }

  updateDust(dt, camera) {
    const pos = this.dust.geometry.attributes.position;
    const box = this.dustBox;
    const wx = this.windDir.x * this.windValue * 5.4;
    const wz = this.windDir.y * this.windValue * 5.4;
    const base = camera.position;
    for (let i = 0; i < this.dustCount; i++) {
      let x = pos.getX(i) + wx * dt;
      let y = pos.getY(i) + Math.sin(this.time * 0.7 + i) * 0.18 * dt * (1 + this.windValue * 3);
      let z = pos.getZ(i) + wz * dt;
      // Wrap around the camera.
      const rx = x - base.x, ry = y - base.y, rz = z - base.z;
      if (Math.abs(rx) > box.x / 2) x -= Math.sign(rx) * box.x;
      if (Math.abs(ry) > box.y / 2) y -= Math.sign(ry) * box.y;
      if (Math.abs(rz) > box.z / 2) z -= Math.sign(rz) * box.z;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    // Dust is suppressed by rain (it gets washed out of the air) and rises
    // with wind.
    this.dustMaterial.opacity = clamp(0.05 + this.windValue * 0.22, 0, 0.3) * (1 - this.rainLevel * 0.85);
    this.dust.visible = this.dustMaterial.opacity > 0.012;
  }

  updateLightning(dt) {
    /* Schedule strikes only while it is actually raining. */
    if (this.rainLevel > 0.55) {
      this._nextStrike -= dt;
      if (this._nextStrike <= 0) {
        this.strike(1);
        this._nextStrike = 7 + Math.random() * 18;
      }
    } else {
      this._nextStrike = Math.max(this._nextStrike, 5);
    }

    /* Advance queued sub-flashes. */
    let target = 0;
    for (let i = this._strikeQueue.length - 1; i >= 0; i--) {
      const s = this._strikeQueue[i];
      s.t -= dt;
      if (s.t <= 0) {
        target = Math.max(target, s.mag);
        this._strikeQueue.splice(i, 1);
      }
    }
    if (target > 0) this.flash = Math.max(this.flash, target);
    // Fast decay — a lightning flash is milliseconds, not a fade.
    this.flash = damp(this.flash, 0, 11, dt);
    if (this.postfx) this.postfx.params.flash = this.flash * 0.55;
  }

  /** Reported to the HUD and the audio mixer. */
  status() {
    return {
      rain: this.rainOn,
      rainLevel: this.rainLevel,
      wetness: this.wetness,
      wind: this.windValue,
      windBase: this.windBase,
      flash: this.flash
    };
  }

  dispose() {
    this.scene.remove(this.rain, this.dust);
    this.rain.geometry.dispose(); this.rain.material.dispose();
    this.dust.geometry.dispose(); this.dust.material.dispose();
  }
}
