import * as THREE from 'three';
import { clamp, lerp, makeRng } from './noise.js';
import { trueAzimuthToWorld } from '../world/layout.js';

/**
 * Weather (A3): clear | haze | dust | rain | fog | heat, each with an
 * intensity 0..1 and smooth transitions.
 *
 *   world.weather = new WeatherSystem(scene, sky, quality, materials);
 *   weather.set('dust', 0.8);           // eases over ~3 s ({ instant: true } to snap)
 *   weather.update(dt, camera);         // every frame, after sky.update/follow
 *   weather.state → { kind, intensity, visibility 0..1, wetness, dustiness, windDir (deg true, FROM),
 *                     windSpeed (m/s), windVector (world, blowing TO, m/s), rain, dust, heat, fog, label }
 *   weather.onLightning = (strength) => {}   // optional (thunder audio)
 *
 * What each kind drives:
 *   sky.atmosphere (turbidity, dust haze band, cloud deck, sun/sky dimming,
 *   fog density + tint, low ground fog, night-lights boost, lightning flash),
 *   materials (wetness → puddles/gloss, dustiness → khaki film),
 *   GPU particles following the camera: rain streaks (monsoon) and
 *   wind-blown dust sheets + grit (dust storm), counts scaled by quality tier.
 *   Heat shimmer and the post look are read by the Engine from `state`.
 */

const KINDS = ['clear', 'haze', 'dust', 'rain', 'fog', 'heat'];

const LABELS = {
  clear: 'Clear',
  haze: 'Dust haze',
  dust: 'Dust storm',
  rain: 'Monsoon rain',
  fog: 'Fog',
  heat: 'Extreme heat',
};

/** Full-strength presets; intensity blends each one from CLEAR. */
const PRESETS = {
  clear: {
    turbidity: 0, haze: 0, cloudCover: 0.14, cirrus: 0.55, cloudDark: 0, sunDim: 1, skyDim: 1, fogDensity: 1,
    fogColorMix: 0, fogColor: [0.84, 0.77, 0.64], groundFog: 0, groundFogFalloff: 0.06, lightsBoost: 0,
    rain: 0, dust: 0, heat: 0, fog: 0, visibility: 1, windSpeed: 3.5, windDir: 225,
  },
  haze: {
    turbidity: 4, haze: 0.55, cloudCover: 0.04, cirrus: 0.2, cloudDark: 0, sunDim: 0.78, skyDim: 0.9, fogDensity: 3.5,
    fogColorMix: 0.55, fogColor: [0.80, 0.70, 0.55], groundFog: 0, groundFogFalloff: 0.05, lightsBoost: 0.05,
    rain: 0, dust: 0.12, heat: 0.2, fog: 0, visibility: 0.55, windSpeed: 5, windDir: 250,
  },
  dust: {
    turbidity: 14, haze: 1, cloudCover: 0, cirrus: 0, cloudDark: 0, sunDim: 0.3, skyDim: 0.55, fogDensity: 16,
    fogColorMix: 0.9, fogColor: [0.62, 0.46, 0.28], groundFog: 0.0012, groundFogFalloff: 0.012, lightsBoost: 0.45,
    rain: 0, dust: 1, heat: 0, fog: 0, visibility: 0.2, windSpeed: 15, windDir: 240,
  },
  rain: {
    turbidity: 1.5, haze: 0.25, cloudCover: 0.97, cirrus: 0, cloudDark: 0.9, sunDim: 0.18, skyDim: 0.55, fogDensity: 4,
    fogColorMix: 0.9, fogColor: [0.30, 0.34, 0.40], groundFog: 0.0006, groundFogFalloff: 0.03, lightsBoost: 0.35,
    rain: 1, dust: 0, heat: 0, fog: 0, visibility: 0.35, windSpeed: 9, windDir: 215,
  },
  fog: {
    turbidity: 2, haze: 0.35, cloudCover: 0.35, cirrus: 0, cloudDark: 0.35, sunDim: 0.45, skyDim: 0.85, fogDensity: 3,
    fogColorMix: 0.85, fogColor: [0.70, 0.71, 0.72], groundFog: 0.02, groundFogFalloff: 0.04, lightsBoost: 0.25,
    rain: 0, dust: 0, heat: 0, fog: 1, visibility: 0.15, windSpeed: 1, windDir: 20,
  },
  heat: {
    turbidity: 3.5, haze: 0.35, cloudCover: 0.02, cirrus: 0.25, cloudDark: 0, sunDim: 1.06, skyDim: 1.02, fogDensity: 1.7,
    fogColorMix: 0.35, fogColor: [0.92, 0.83, 0.66], groundFog: 0, groundFogFalloff: 0.06, lightsBoost: 0,
    rain: 0, dust: 0.05, heat: 1, fog: 0, visibility: 0.8, windSpeed: 2.5, windDir: 230,
  },
};

const SCALARS = Object.keys(PRESETS.clear).filter((k) => k !== 'fogColor');

/* ------------------------------------------------------------- shaders */

const RAIN_VERT = /* glsl */ `
attribute vec3 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uBox;
uniform float uHeight;
uniform vec3 uVel;
uniform float uLen;
uniform float uAmount;
varying float vAlpha;
varying float vSide;
void main() {
  float live = step( aSeed.x, uAmount );
  vec3 drift = uVel * uTime;
  vec3 p;
  p.xz = uCam.xz + mod( aSeed.yz * uBox * 3.7 + vec2( aSeed.x * 91.0 ) - uCam.xz + drift.xz, uBox ) - uBox * 0.5;
  p.y = uCam.y - uHeight * 0.35 + mod( fract( aSeed.x * 37.0 + aSeed.y * 13.0 ) * uHeight + drift.y - uCam.y, uHeight );
  vec3 axis = normalize( uVel );
  vec3 toCam = normalize( cameraPosition - p );
  vec3 side = normalize( cross( axis, toCam ) );
  float dist = length( cameraPosition - p );
  float w = 0.004 + dist * 0.0007;
  p += axis * position.y * uLen + side * position.x * w;
  vSide = position.x * 2.0;
  vAlpha = live * smoothstep( 1.5, 6.0, dist ) * ( 1.0 - smoothstep( uBox * 0.3, uBox * 0.5, dist ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vSide;
void main() {
  float a = ( 1.0 - vSide * vSide ) * vAlpha * uOpacity;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

const DUST_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uBox;
uniform vec3 uVel;
uniform float uAmount;
uniform float uSizeMin;
uniform float uSizeMax;
uniform float uLift;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float live = step( aSeed.x, uAmount );
  vec3 drift = uVel * uTime;
  vec3 c;
  c.xz = uCam.xz + mod( aSeed.yz * uBox + vec2( aSeed.w * 53.0 ) - uCam.xz + drift.xz, uBox ) - uBox * 0.5;
  float size = mix( uSizeMin, uSizeMax, fract( aSeed.w * 7.31 ) );
  c.y = size * 0.35 + fract( aSeed.w * 3.7 ) * uLift + sin( uTime * 0.7 + aSeed.w * 40.0 ) * 1.5;
  vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  float ang = aSeed.w * 6.2831 + uTime * 0.05 * ( fract( aSeed.w * 11.0 ) - 0.5 );
  vec2 q = mat2( cos( ang ), -sin( ang ), sin( ang ), cos( ang ) ) * position.xy;
  vec3 p = c + ( right * q.x + up * q.y ) * size;
  float dist = length( cameraPosition - c );
  vUv = position.xy + 0.5;
  vSeed = aSeed.w;
  vAlpha = live * smoothstep( size * 0.25, size * 1.2, dist ) * ( 1.0 - smoothstep( uBox * 0.32, uBox * 0.5, dist ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;

const DUST_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float a = texture2D( uMap, vUv ).a * vAlpha * uOpacity;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor * ( 0.85 + 0.3 * fract( vSeed * 17.0 ) ), a );
}
`;

function quadGeometry(count, seedSize, seedFn, centred = true) {
  const g = new THREE.InstancedBufferGeometry();
  const y0 = centred ? -0.5 : 0;
  const y1 = centred ? 0.5 : 1;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, y0, 0, 0.5, y0, 0, 0.5, y1, 0, -0.5, y1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * seedSize);
  for (let i = 0; i < count; i++) seedFn(seeds, i * seedSize, i, count);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, seedSize));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return g;
}

export class WeatherSystem {
  constructor(scene, sky, quality, materials = null) {
    this.scene = scene;
    this.sky = sky;
    this.quality = quality;
    this.materials = materials;
    this.kind = 'clear';
    this.intensity = 0;
    this.time = 0;
    this.onLightning = null;
    this._rng = makeRng(20270104);
    this._target = {};
    this._cur = {};
    this._fogTarget = new THREE.Color();
    this._fogCur = new THREE.Color();
    this._lightning = { timer: 8, flash: 0, pending: [] };
    this.state = {
      kind: 'clear', intensity: 0, visibility: 1, wetness: 0, dustiness: 0, windDir: 225, windSpeed: 3.5,
      windVector: new THREE.Vector3(), rain: 0, dust: 0, heat: 0, fog: 0, label: LABELS.clear,
    };
    this._computeTarget('clear', 0);
    Object.assign(this._cur, this._target);
    this._fogCur.copy(this._fogTarget);

    this._buildParticles();
    if (quality && quality.onChange) this._offQuality = quality.onChange(() => this._buildParticles());
    scene.userData.weather = this;
    this._apply(0);
  }

  /* ------------------------------------------------------------- API */

  set(kind, intensity = 1, { instant = false } = {}) {
    const k = KINDS.includes(kind) ? kind : 'clear';
    const i = clamp(Number.isFinite(intensity) ? intensity : 1, 0, 1);
    this.kind = k;
    this.intensity = k === 'clear' ? 0 : i;
    this._computeTarget(k, this.intensity);
    if (instant) {
      Object.assign(this._cur, this._target);
      this._fogCur.copy(this._fogTarget);
      if (k === 'rain') this.state.wetness = Math.max(this.state.wetness, 0.85 * i);
      if (k === 'dust') this.state.dustiness = Math.max(this.state.dustiness, 0.7 * i);
      this._apply(0);
    }
    this.state.kind = k;
    this.state.intensity = this.intensity;
    this.state.label = k === 'fog' && this.sky && this.sky.state.nightFactor > 0.5 ? 'Night fog' : LABELS[k];
    return this.state;
  }

  _computeTarget(kind, intensity) {
    const c = PRESETS.clear;
    const p = PRESETS[kind] || c;
    const t = kind === 'clear' ? 0 : intensity;
    for (const key of SCALARS) {
      if (key === 'windDir') {
        // Interpolate the bearing along the short arc.
        const d = ((p.windDir - c.windDir + 540) % 360) - 180;
        this._target.windDir = (c.windDir + d * t + 360) % 360;
      } else this._target[key] = lerp(c[key], p[key], t);
    }
    this._fogTarget.setRGB(...c.fogColor).lerp(new THREE.Color(...p.fogColor), t);
  }

  /* -------------------------------------------------------- particles */

  _buildParticles() {
    this._disposeParticles();
    const s = (this.quality && this.quality.settings) || {};
    const rainCount = Math.max(0, s.rainCount !== undefined ? s.rainCount : 6000);
    const dustCount = Math.max(0, s.dustCount !== undefined ? s.dustCount : 500);
    const rng = this._rng;

    if (rainCount > 0) {
      const geo = quadGeometry(rainCount, 3, (a, o, i, n) => { a[o] = (i + 0.5) / n; a[o + 1] = rng(); a[o + 2] = rng(); }, false);
      this.rainMaterial = new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms: {
          uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: 70 }, uHeight: { value: 40 },
          uVel: { value: new THREE.Vector3(0, -9, 0) }, uLen: { value: 0.55 }, uAmount: { value: 0 },
          uColor: { value: new THREE.Color(0.7, 0.74, 0.8) }, uOpacity: { value: 0.32 },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      this.rain = new THREE.Mesh(geo, this.rainMaterial);
      this.rain.frustumCulled = false;
      this.rain.renderOrder = 20;
      this.rain.visible = false;
      this.scene.add(this.rain);
    }

    if (dustCount > 0) {
      const tex = this.materials && this.materials.textures && this.materials.textures.dustPuff
        ? this.materials.textures.dustPuff()
        : (this.quality && this.quality.textureLibrary ? this.quality.textureLibrary.dustPuff() : null);
      this._dustTex = tex;
      const sheets = Math.max(12, Math.round(dustCount * 0.12));
      const geoS = quadGeometry(sheets, 4, (a, o, i, n) => { a[o] = (i + 0.5) / n; a[o + 1] = rng(); a[o + 2] = rng(); a[o + 3] = rng(); });
      this.dustSheetMaterial = new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: {
          uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: 420 }, uVel: { value: new THREE.Vector3() },
          uAmount: { value: 0 }, uSizeMin: { value: 26 }, uSizeMax: { value: 70 }, uLift: { value: 30 },
          uMap: { value: tex }, uColor: { value: new THREE.Color(0.7, 0.55, 0.38) }, uOpacity: { value: 0.22 },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      this.dustSheets = new THREE.Mesh(geoS, this.dustSheetMaterial);
      this.dustSheets.frustumCulled = false;
      this.dustSheets.renderOrder = 21;
      this.dustSheets.visible = false;
      this.scene.add(this.dustSheets);

      const grit = Math.round(dustCount * 1.5);
      const geoG = quadGeometry(grit, 4, (a, o, i, n) => { a[o] = (i + 0.5) / n; a[o + 1] = rng(); a[o + 2] = rng(); a[o + 3] = rng(); });
      this.dustGritMaterial = new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: {
          uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: 60 }, uVel: { value: new THREE.Vector3() },
          uAmount: { value: 0 }, uSizeMin: { value: 0.05 }, uSizeMax: { value: 0.16 }, uLift: { value: 6 },
          uMap: { value: tex }, uColor: { value: new THREE.Color(0.78, 0.64, 0.46) }, uOpacity: { value: 0.75 },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      this.dustGrit = new THREE.Mesh(geoG, this.dustGritMaterial);
      this.dustGrit.frustumCulled = false;
      this.dustGrit.renderOrder = 22;
      this.dustGrit.visible = false;
      this.scene.add(this.dustGrit);
    }
  }

  _disposeParticles() {
    for (const key of ['rain', 'dustSheets', 'dustGrit']) {
      const m = this[key];
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      this[key] = null;
    }
  }

  /* ------------------------------------------------------------ frame */

  update(dt, camera) {
    this.time += dt;
    const k = 1 - Math.exp(-dt / 2.4);
    for (const key of SCALARS) {
      if (key === 'windDir') {
        const d = ((this._target.windDir - this._cur.windDir + 540) % 360) - 180;
        this._cur.windDir = (this._cur.windDir + d * k + 360) % 360;
      } else this._cur[key] += (this._target[key] - this._cur[key]) * k;
    }
    this._fogCur.lerp(this._fogTarget, k);

    // Wetness lags the rain (soak-in, then evaporation; fast in the heat).
    const st = this.state;
    const c = this._cur;
    if (c.rain > 0.05) st.wetness = Math.min(1, st.wetness + dt * 0.07 * c.rain * (1.2 - st.wetness));
    else st.wetness = Math.max(0, st.wetness - dt * (0.006 + c.heat * 0.02 + (this.sky ? this.sky.state.dayFactor * 0.006 : 0)));
    if (c.dust > 0.2) st.dustiness = Math.min(1, st.dustiness + dt * 0.03 * c.dust);
    else st.dustiness = Math.max(0, st.dustiness - dt * (0.002 + st.wetness * 0.05));

    this._lightningStep(dt);
    this._dt = dt;
    this._apply(dt);
    if (camera) this._updateParticles(dt, camera);
  }

  _lightningStep(dt) {
    const L = this._lightning;
    L.flash *= Math.exp(-dt * 9);
    if (this._cur.rain > 0.6) {
      L.timer -= dt;
      if (L.timer <= 0) {
        const strength = 0.6 + this._rng() * 0.8;
        L.pending.push({ t: 0, s: strength }, { t: 0.09 + this._rng() * 0.08, s: strength * 0.6 }, { t: 0.32, s: strength * 0.8 });
        L.timer = 7 + this._rng() * 16 / this._cur.rain;
        if (this.onLightning) this.onLightning(strength);
      }
    }
    for (let i = L.pending.length - 1; i >= 0; i--) {
      const p = L.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        L.flash = Math.max(L.flash, p.s);
        L.pending.splice(i, 1);
      }
    }
  }

  _apply() {
    const c = this._cur;
    const st = this.state;
    // Wind: bearing the wind blows FROM (true); world vector blows TO.
    st.windDir = c.windDir;
    st.windSpeed = c.windSpeed * (1 + 0.15 * Math.sin(this.time * 0.6) * Math.sin(this.time * 1.7));
    const toAz = trueAzimuthToWorld(((c.windDir + 180) % 360) * Math.PI / 180);
    st.windVector.set(Math.sin(toAz), 0, -Math.cos(toAz)).multiplyScalar(st.windSpeed);
    st.rain = c.rain;
    st.dust = c.dust;
    st.heat = c.heat;
    st.fog = c.fog;
    const night = this.sky ? this.sky.state.nightFactor : 0;
    // Night fog is deeper: radiative cooling over the plain.
    st.visibility = clamp(c.visibility - c.fog * night * 0.08, 0.03, 1);

    if (this.sky && this.sky.atmosphere) {
      const a = this.sky.atmosphere;
      a.turbidity = c.turbidity;
      a.haze = c.haze;
      a.hazeColor.copy(this._fogCur);
      a.cloudCover = c.cloudCover;
      a.cirrus = c.cirrus;
      a.cloudDark = c.cloudDark;
      a.sunDim = c.sunDim;
      a.skyDim = c.skyDim;
      a.fogDensity = c.fogDensity * (1 + c.fog * night * 0.8);
      a.fogColor = this._fogCur;
      a.fogColorMix = c.fogColorMix;
      a.groundFog = c.groundFog * (1 + night * 0.6);
      a.groundFogFalloff = c.groundFogFalloff;
      a.lightsBoost = c.lightsBoost;
      a.flash = this._lightning.flash * clamp(c.rain, 0, 1);
      a.wind.set(st.windVector.x, st.windVector.z);
    }

    const libs = [];
    if (this.materials) libs.push(this.materials);
    if (this.quality && this.quality.materialLibrary && !libs.includes(this.quality.materialLibrary)) libs.push(this.quality.materialLibrary);
    for (const lib of libs) {
      if (typeof lib.setWetness === 'function') lib.setWetness(st.wetness);
      if (typeof lib.setDustiness === 'function') lib.setDustiness(st.dustiness);
      if (typeof lib.update === 'function') lib.update(this._dt || 0, this.sky);
    }
  }

  _updateParticles(dt, camera) {
    const st = this.state;
    const c = this._cur;
    const day = this.sky ? this.sky.state.dayFactor : 1;
    const lights = this.sky ? this.sky.state.lightsFactor : 0;
    const wv = st.windVector;

    if (this.rain) {
      const amount = clamp(c.rain, 0, 1);
      this.rain.visible = amount > 0.01;
      if (this.rain.visible) {
        const u = this.rainMaterial.uniforms;
        u.uCam.value.copy(camera.position);
        u.uTime.value = this.time;
        u.uAmount.value = amount;
        u.uVel.value.set(wv.x * 0.6, -9.5, wv.z * 0.6);
        // Lit by the overcast sky by day, by apron floodlights / lightning at night.
        const b = lerp(0.12, 0.62, day) + lights * 0.18 + this._lightning.flash * 0.8;
        u.uColor.value.setRGB(b * 0.95, b, b * 1.08);
        u.uOpacity.value = 0.1 + 0.14 * amount;
      }
    }
    if (this.dustSheets) {
      const amount = clamp(c.dust, 0, 1);
      const visible = amount > 0.01;
      this.dustSheets.visible = visible;
      this.dustGrit.visible = visible && camera.position.y < 80;
      if (visible) {
        const sunI = this.sky ? this.sky.sunLight.intensity : 1;
        const fc = this._fogCur;
        const lum = 0.12 + sunI * 0.22 + day * 0.25 + lights * 0.06;
        for (const [mat, op] of [[this.dustSheetMaterial, 0.2], [this.dustGritMaterial, 0.7]]) {
          const u = mat.uniforms;
          u.uCam.value.copy(camera.position);
          u.uTime.value = this.time;
          u.uAmount.value = amount;
          u.uVel.value.set(wv.x, 0, wv.z).multiplyScalar(mat === this.dustGritMaterial ? 1.6 : 0.8);
          u.uColor.value.copy(fc).multiplyScalar(lum * 1.6);
          u.uOpacity.value = op * Math.min(1, amount * 1.3) * 0.7;
        }
        // Sheets hug the ground near the camera; from altitude they spread out.
        this.dustSheetMaterial.uniforms.uLift.value = 20 + clamp(camera.position.y, 0, 300) * 0.3;
      }
    }
  }

  dispose() {
    if (this._offQuality) this._offQuality();
    this._disposeParticles();
    if (this.scene.userData.weather === this) delete this.scene.userData.weather;
  }
}

export const WEATHER_KINDS = KINDS;
export const WEATHER_LABELS = LABELS;
