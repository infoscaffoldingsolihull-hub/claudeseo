/**
 * AEON SPIRE — material library.
 *
 * One place that owns every surface in the project, so that three
 * cross-cutting systems can reach all of them at once:
 *
 *   • Weather (E.4)  — `uWetness` darkens albedo and drops roughness on
 *                      anything registered as exterior, and `uWind` drives
 *                      vertex sway on foliage, flags and cables.
 *   • Time of day (E.4) — window emissive intensity is ramped from a single
 *                      call rather than walking the scene graph.
 *   • Performance (E.9) — materials are shared and cached by key, so the
 *                      renderer sees a small number of programs.
 */

import * as THREE from 'three';
import { TextureFactory } from './Textures.js';
import { clamp } from './MathUtil.js';

/* Shared uniform objects — every patched material references these exact
   objects, so updating one value updates every surface at once. */
export const globalUniforms = {
  uTime: { value: 0 },
  uWetness: { value: 0 },       // 0 dry → 1 soaked
  uWind: { value: 0.25 },       // 0 still → 1 gale
  uNightMix: { value: 0 },      // 0 day → 1 night (window emissive)
  uInteriorLight: { value: 1 }  // artificial interior lighting level
};

/** GLSL injected into any material that should react to rain. */
const WET_PARS = /* glsl */`
  uniform float uWetness;
`;
const WET_FRAG = /* glsl */`
  // Wet surfaces darken and become far more specular (E.4).
  diffuseColor.rgb *= mix(1.0, 0.62, uWetness);
`;
const WET_ROUGH = /* glsl */`
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.18 + 0.02, uWetness);
`;

/** GLSL for wind sway. Sway amount is read from vertex colour .r, so a mesh
    can paint "how flexible is this vertex" into its colour attribute. */
const WIND_PARS = /* glsl */`
  uniform float uTime;
  uniform float uWind;
  attribute float aSway;
`;
const WIND_VERT = /* glsl */`
  float sway = aSway;
  if (sway > 0.001) {
    float ph = dot(vec3(modelMatrix[3].xyz), vec3(0.37, 0.11, 0.53));
    float w = uWind;
    float a = sin(uTime * (1.7 + w * 2.4) + ph + position.y * 0.35) * 0.55
            + sin(uTime * (3.9 + w * 3.1) + ph * 1.7) * 0.25;
    transformed.x += a * sway * (0.25 + w * 1.35);
    transformed.z += a * 0.6 * sway * (0.25 + w * 1.1);
  }
`;

/**
 * Attach the wetness uniforms + GLSL to a standard-family material.
 * Safe to call once per material; idempotent via a marker flag.
 */
export function makeWeatherReactive(mat) {
  if (mat.userData._wetPatched) return mat;
  mat.userData._wetPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uWetness = globalUniforms.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WET_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + WET_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WET_ROUGH);
  };
  /* Compose rather than replace: the water surfaces already carry their own
     cache key, and collapsing them all onto 'aeon-wet' would have three.js
     reuse one compiled program for three different shaders. */
  const base = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => 'aeon-wet' + base;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Attach wind sway. The geometry must carry an `aSway` float attribute
 * (0 = rigid, 1 = tip of a flag/branch). Used by trees, flags, awnings
 * and crane cables (E.4).
 */
export function makeWindReactive(mat) {
  if (mat.userData._windPatched) return mat;
  mat.userData._windPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uWind = globalUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERT);
  };
  const base = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => 'aeon-wind' + base;
  mat.needsUpdate = true;
  return mat;
}

/** Give a geometry a uniform sway weight so wind-reactive materials work. */
export function setSway(geometry, fn) {
  const pos = geometry.attributes.position;
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    arr[i] = typeof fn === 'function'
      ? fn(pos.getX(i), pos.getY(i), pos.getZ(i), i)
      : fn;
  }
  geometry.setAttribute('aSway', new THREE.BufferAttribute(arr, 1));
  return geometry;
}

/* ------------------------------------------------------------------ */

export class MaterialLibrary {
  /**
   * @param {object} opts
   * @param {number} opts.textureSize base procedural texture resolution
   */
  constructor({ textureSize = 512 } = {}) {
    this.tex = new TextureFactory(textureSize);
    this.cache = new Map();
    /** Materials whose emissive follows the day→night ramp. */
    this.emissiveWindows = [];
    /** Materials that should look wet in the rain. */
    this.exterior = [];
    /** Interior finishes — see registerInterior(). */
    this.interiorMaterials = [];
    this.interiorEnv = 0.42;
    this.envMap = null;

    /* Construction mode (Phase 9). `buildClipPlane` reveals the finished
       building by height; materials created with `noClip` (the site plant)
       opt out, and `glazing` materials are held back until the facade
       package. */
    this.buildClipPlane = null;
    this.buildClipEnabled = false;
    this.clippable = [];
    this.glazing = [];
    this.glazingReveal = 1;
  }

  /** Cached construction. `build` receives (THREE, textureFactory). */
  get(key, build) {
    let m = this.cache.get(key);
    if (!m) {
      m = build(this.tex, this);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  /** Apply a texture set produced by TextureFactory onto a material. */
  static applySet(mat, set, repeat = 1) {
    if (!set) return mat;
    for (const [k, t] of Object.entries(set)) {
      if (!t || !t.isTexture) continue;
      if (repeat !== 1) {
        // Clone so different repeats of the same texture can coexist.
        const c = t.clone();
        c.needsUpdate = true;
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.repeat.set(repeat, repeat);
        mat[k] = c;
      } else {
        mat[k] = t;
      }
    }
    return mat;
  }

  /**
   * Standard PBR surface from a procedural texture set.
   * @param {string} key cache key
   * @param {string} texKey TextureFactory method name
   */
  surface(key, texKey, {
    repeat = 1, color = 0xffffff, roughness = 0.8, metalness = 0.0,
    exterior = false, wind = false, opts = null, side = THREE.FrontSide,
    normalScale = 1, envMapIntensity = 1, transparent = false, opacity = 1,
    alphaTest = 0, emissive = 0x000000, emissiveIntensity = 0, flatShading = false,
    noClip = false
  } = {}) {
    return this.get(key, (tex) => {
      const set = tex.get(key + '|' + repeat + '|' + texKey, (size, f) => f[texKey](size, opts || undefined));
      const m = new THREE.MeshStandardMaterial({
        color, roughness, metalness, side, transparent, opacity, alphaTest,
        emissive, emissiveIntensity, flatShading,
        envMapIntensity
      });
      MaterialLibrary.applySet(m, set, repeat);
      if (m.normalMap) m.normalScale = new THREE.Vector2(normalScale, normalScale);
      if (this.envMap) m.envMap = this.envMap;
      if (exterior) { makeWeatherReactive(m); this.exterior.push(m); }
      if (wind) makeWindReactive(m);
      if (!noClip) this.clippable.push(m);
      return m;
    });
  }

  /** Flat-coloured surface (used for small props where a map is overkill). */
  solid(key, {
    color = 0xcccccc, roughness = 0.7, metalness = 0.0, exterior = false,
    wind = false, side = THREE.FrontSide, transparent = false, opacity = 1,
    emissive = 0x000000, emissiveIntensity = 0, flatShading = false, envMapIntensity = 1,
    depthWrite = true, alphaTest = 0, noClip = false
  } = {}) {
    return this.get(key, () => {
      const m = new THREE.MeshStandardMaterial({
        color, roughness, metalness, side, transparent, opacity, emissive,
        emissiveIntensity, flatShading, envMapIntensity, depthWrite, alphaTest
      });
      if (this.envMap) m.envMap = this.envMap;
      if (exterior) { makeWeatherReactive(m); this.exterior.push(m); }
      if (wind) makeWindReactive(m);
      if (!noClip) this.clippable.push(m);
      return m;
    });
  }

  /**
   * Architectural glazing. Real transmission is far too expensive at this
   * scale (a supertall's worth of facade), so this is a tuned transparent
   * standard material with a strong environment response — the honest
   * "stylized PBR" target set out in E.3.
   */
  glass(key, {
    color = 0x9fc4d8, opacity = 0.26, roughness = 0.05, metalness = 0.12,
    side = THREE.DoubleSide, tint = 1, exterior = true, emissive = 0x000000,
    emissiveIntensity = 0, envMapIntensity = 1.35, noClip = false
  } = {}) {
    return this.get(key, () => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(tint),
        transparent: true, opacity, roughness, metalness, side,
        depthWrite: false, emissive, emissiveIntensity, envMapIntensity
      });
      if (this.envMap) m.envMap = this.envMap;
      if (exterior) { makeWeatherReactive(m); this.exterior.push(m); }
      if (!noClip) {
        this.clippable.push(m);
        // Glazing is the facade package; construction mode holds it back
        // until milestone 8 so the structure reads as a bare frame first.
        m.userData.baseOpacity = opacity;
        this.glazing.push(m);
      }
      return m;
    });
  }

  /**
   * Unitised curtain wall — the campus's default cladding.
   *
   * `glass()` gives a tinted sheet with no internal structure, which at a
   * kilometre reads as one moulded blob however carefully it is tuned. This
   * hangs the procedural curtain-wall set on the same transparent-standard
   * base instead, so the surface carries mullions, transoms, spandrel bands
   * and per-unit tint jitter, and the alpha map lets the floor lines read
   * from any distance. Registered for the night emissive ramp, the weather
   * wetness ramp and the construction facade package like any other glazing.
   *
   * @param {[number,number]} repeat facade modules across × up
   */
  curtain(key, {
    repeat = [1, 1], color = 0xffffff, opacity = 1, roughness = 0.1,
    metalness = 0.4, side = THREE.DoubleSide, envMapIntensity = 1.3,
    maxEmissive = 2.3, exterior = true, noClip = false, depthWrite = true,
    normalScale = 1, opts = null
  } = {}) {
    const [rx, ry] = repeat;
    const m = this.get(key, (tex) => {
      const set = tex.get(key + '|curtain', (size, f) => f.curtainWall(size, opts || undefined));
      const mat = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity, roughness, metalness, side,
        depthWrite, envMapIntensity, emissive: 0xffffff, emissiveIntensity: 0
      });
      for (const [k, t] of Object.entries(set)) {
        if (!t || !t.isTexture) continue;
        const c = (rx === 1 && ry === 1) ? t : t.clone();
        if (c !== t) {
          c.needsUpdate = true;
          c.wrapS = c.wrapT = THREE.RepeatWrapping;
          c.repeat.set(rx, ry);
        }
        mat[k] = c;
      }
      mat.normalScale = new THREE.Vector2(normalScale, normalScale);
      mat.userData.maxEmissive = maxEmissive;
      mat.userData.baseOpacity = opacity;
      if (this.envMap) mat.envMap = this.envMap;
      if (exterior) { makeWeatherReactive(mat); this.exterior.push(mat); }
      if (!noClip) { this.clippable.push(mat); this.glazing.push(mat); }
      return mat;
    });
    if (!this.emissiveWindows.includes(m)) this.emissiveWindows.push(m);
    return m;
  }

  /**
   * Facade panel whose emissive window grid switches on at dusk (E.4).
   *
   * Built on the unitised curtain wall rather than a flat tinted sheet: the
   * caller still gives a module count, a lit fraction and a facade tint, but
   * the tint is split into a desaturated vision-glass pair and a darker
   * spandrel rather than being painted flat across the whole elevation. A
   * single saturated colour over a doubled transparent surface is what made
   * every tower on the campus read as one moulded blue mass, however
   * carefully the hue was picked.
   *
   * Opacity is left to the alpha map — the spandrel bands are nearly opaque
   * and the vision glass is not — so the caller's `opacity` is kept only as
   * the construction-mode reveal target.
   */
  litFacade(key, {
    cols = 16, rows = 24, lit = 0.6, seed = 7, color = 0x8ea6bd,
    repeat = 1, roughness = 0.12, metalness = 0.35, opacity = 0.55,
    maxEmissive = 2.4, spandrel = null, band = 0.36, mullion = 0xc6ccd2,
    envMapIntensity = 1.25, side = THREE.DoubleSide, depthWrite = false,
    exterior = true, noClip = false
  } = {}) {
    const hsl = {};
    new THREE.Color(color).getHSL(hsl);
    const at = (sMul, l) => new THREE.Color()
      .setHSL(hsl.h, clamp(hsl.s * sMul, 0, 1), clamp(l, 0, 1)).getHex();
    return this.curtain(key, {
      repeat: [repeat, repeat], roughness, metalness, envMapIntensity,
      side, depthWrite, maxEmissive, exterior, noClip, opacity: 1,
      opts: {
        cols, rows, lit, seed, band, mullion,
        glassA: at(0.5, Math.min(0.74, hsl.l * 1.3)),
        glassB: at(0.72, hsl.l * 0.9),
        spandrel: spandrel === null ? at(0.3, hsl.l * 0.58) : spandrel
      }
    });
  }

  /**
   * Mark a material as an interior finish.
   *
   * Interiors are enclosed, so they should not receive the full strength of
   * the sky's environment map — without this every room reads as an
   * over-exposed white box. Registering them also gives D.8's requirement a
   * single lever: interior lighting reacts *subtly* to the exterior time of
   * day (light spilling through glazing) while artificial lighting stays
   * dominant, so rooms never go fully dark or blow out.
   */
  registerInterior(mat, k = null) {
    if (!mat || !mat.isMaterial) return mat;
    if (!this.interiorMaterials.includes(mat)) this.interiorMaterials.push(mat);
    mat.userData.interiorEnvBase = k === null ? 1.0 : k;
    mat.envMapIntensity = this.interiorEnv * mat.userData.interiorEnvBase;
    return mat;
  }

  /** Register every material in a zone's palette object in one call. */
  registerInteriorPalette(palette) {
    for (const m of Object.values(palette)) this.registerInterior(m);
    return palette;
  }

  /**
   * Drive the interior environment response from the time-of-day system.
   * The range is deliberately narrow (D.8): day 0.55 → night 0.20.
   */
  setInteriorEnv(k) {
    this.interiorEnv = k;
    for (const m of this.interiorMaterials) {
      m.envMapIntensity = k * (m.userData.interiorEnvBase ?? 1);
    }
  }

  /** Register an arbitrary material to follow the night emissive ramp. */
  registerNightEmissive(mat, maxEmissive = 1.5) {
    mat.userData.maxEmissive = maxEmissive;
    if (!this.emissiveWindows.includes(mat)) this.emissiveWindows.push(mat);
    return mat;
  }

  /** Drive every registered window emissive from the day→night mix. */
  setNightMix(mix) {
    globalUniforms.uNightMix.value = mix;
    const k = clamp(mix, 0, 1);
    for (const m of this.emissiveWindows) {
      m.emissiveIntensity = (m.userData.maxEmissive ?? 1.5) * k;
    }
  }

  /* ---------------- Construction-mode reveal (Phase 9) ---------------- */

  /** Hand the library the plane that clips the finished building by height. */
  setBuildClip(plane) {
    this.buildClipPlane = plane;
    return plane;
  }

  /**
   * Turn height clipping on or off. Assigning `clippingPlanes` forces a
   * shader recompile, so this only touches the materials when the flag
   * actually changes.
   */
  setBuildClipEnabled(on) {
    const want = !!on && !!this.buildClipPlane;
    if (want === this.buildClipEnabled) return want;
    this.buildClipEnabled = want;
    const planes = want ? [this.buildClipPlane] : null;
    for (const m of this.clippable) {
      m.clippingPlanes = planes;
      m.needsUpdate = true;
    }
    return want;
  }

  /**
   * Fade the glazing in as the facade package proceeds. 1 = fully glazed,
   * 0 = bare structure.
   */
  setGlazingReveal(k) {
    const v = clamp(k, 0, 1);
    if (Math.abs(v - this.glazingReveal) < 0.002) return v;
    this.glazingReveal = v;
    for (const m of this.glazing) {
      const base = m.userData.baseOpacity ?? 1;
      m.opacity = base * v;
      m.visible = v > 0.02;
    }
    return v;
  }

  setWetness(v) { globalUniforms.uWetness.value = clamp(v, 0, 1); }
  setWind(v) { globalUniforms.uWind.value = clamp(v, 0, 1); }
  setTime(t) { globalUniforms.uTime.value = t; }

  /**
   * Adopt a material built by hand rather than through this library.
   *
   * The water surfaces each carry a bespoke shader patch, so they are
   * constructed directly — and were therefore missing from the cache that
   * setEnvMap() walks. A mirror-smooth surface with no environment map
   * reflects nothing but the lights, which is why every pool and canal on
   * the campus rendered as flat grey paint.
   */
  adopt(mat, { exterior = false, clip = true, key = null } = {}) {
    if (key && !this.cache.has(key)) this.cache.set(key, mat);
    if (this.envMap && 'envMap' in mat) { mat.envMap = this.envMap; mat.needsUpdate = true; }
    if (exterior && !this.exterior.includes(mat)) { makeWeatherReactive(mat); this.exterior.push(mat); }
    if (clip && !this.clippable.includes(mat)) this.clippable.push(mat);
    if (!this.adopted) this.adopted = [];
    if (!this.adopted.includes(mat)) this.adopted.push(mat);
    return mat;
  }

  /** Push a freshly generated environment map onto every cached material. */
  setEnvMap(env) {
    this.envMap = env;
    const apply = (m) => {
      if ('envMap' in m) { m.envMap = env; m.needsUpdate = true; }
    };
    for (const m of this.cache.values()) apply(m);
    for (const m of (this.adopted || [])) apply(m);
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    this.tex.dispose();
  }
}
