/**
 * AEON SPIRE — post-processing chain.
 *
 * Written directly against WebGLRenderTarget rather than pulling in the
 * three.js addon composer, so the project has exactly one module
 * dependency (`three`) and nothing else can fail to resolve at runtime.
 *
 * Pipeline (E.3 "stylized painterly PBR", E.6 photo mode):
 *
 *   scene ──▶ HDR target ──▶ bright pass ──▶ 3× downsample+blur ──▶ bloom
 *        └────────────────────────────────────────────┐
 *                                                     ▼
 *   composite: DOF blend · ACES tonemap · per-time-of-day grade ·
 *              lightning flash · vignette · grain  ──▶ screen
 */

import * as THREE from 'three';
import { clamp } from './MathUtil.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Full-screen triangle-ish quad driver. */
class FSQuad {
  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 3, -1, 0, -1, 3, 0
    ]), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 2, 0, 0, 2
    ]), 2));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(this.geo, null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target || null);
    renderer.render(this.scene, this.cam);
  }
  dispose() { this.geo.dispose(); }
}

function rt(w, h, { depth = false, type = THREE.HalfFloatType } = {}) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace
  });
  if (depth) {
    t.depthTexture = new THREE.DepthTexture(Math.max(1, w | 0), Math.max(1, h | 0));
    t.depthTexture.type = THREE.UnsignedIntType;
    t.depthTexture.minFilter = THREE.NearestFilter;
    t.depthTexture.magFilter = THREE.NearestFilter;
  }
  return t;
}

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} opts
   */
  constructor(renderer, { bloom = true, bloomLevels = 3 } = {}) {
    this.renderer = renderer;
    this.enabled = true;
    this.bloomEnabled = bloom;
    this.levels = bloomLevels;
    this.quad = new FSQuad();

    this.width = 1; this.height = 1;

    /* --- Uniform-carrying state exposed to the rest of the app --- */
    this.params = {
      exposure: 1.0,
      bloomStrength: 0.62,
      bloomThreshold: 0.86,
      bloomRadius: 1.0,
      grade: new THREE.Color(1, 1, 1),   // per-time-of-day tint
      lift: new THREE.Color(0, 0, 0),
      contrast: 1.04,
      saturation: 1.06,
      vignette: 0.42,
      grain: 0.022,
      flash: 0.0,                         // lightning (Weather)
      flashColor: new THREE.Color(0.82, 0.88, 1.0),
      dof: 0.0,                           // 0 off → 1 full photo-mode DOF
      focusDistance: 40.0,
      focusRange: 22.0,
      fadeToBlack: 0.0
    };

    this._buildMaterials();
  }

  _buildMaterials() {
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.86 },
        uSoft: { value: 0.35 }
      },
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uThreshold, uSoft;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float knee = uThreshold * uSoft;
          float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee + 1e-4);
          float w = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }`,
      depthTest: false, depthWrite: false
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRadius: { value: 1.0 }
      },
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel, uDir;
        uniform float uRadius;
        void main() {
          // 9-tap Gaussian, linear-sampled.
          vec2 o = uTexel * uDir * uRadius;
          vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
          s += texture2D(tDiffuse, vUv + o * 1.3846153846).rgb * 0.3162162162;
          s += texture2D(tDiffuse, vUv - o * 1.3846153846).rgb * 0.3162162162;
          s += texture2D(tDiffuse, vUv + o * 3.2307692308).rgb * 0.0702702703;
          s += texture2D(tDiffuse, vUv - o * 3.2307692308).rgb * 0.0702702703;
          gl_FragColor = vec4(s, 1.0);
        }`,
      depthTest: false, depthWrite: false
    });

    this.upMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      uniforms: { tDiffuse: { value: null }, tAdd: { value: null }, uMix: { value: 0.6 } },
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tDiffuse, tAdd;
        uniform float uMix;
        void main() {
          gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tAdd, vUv).rgb * uMix, 1.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending
    });

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tBlur: { value: null },
        tDepth: { value: null },
        uBloom: { value: 0.62 },
        uExposure: { value: 1.0 },
        uGrade: { value: new THREE.Color(1, 1, 1) },
        uLift: { value: new THREE.Color(0, 0, 0) },
        uContrast: { value: 1.04 },
        uSaturation: { value: 1.06 },
        uVignette: { value: 0.42 },
        uGrain: { value: 0.022 },
        uFlash: { value: 0.0 },
        uFlashColor: { value: new THREE.Color(0.82, 0.88, 1.0) },
        uDof: { value: 0.0 },
        uFocus: { value: 40.0 },
        uRange: { value: 22.0 },
        uNear: { value: 0.1 },
        uFar: { value: 6000.0 },
        uTime: { value: 0.0 },
        uFade: { value: 0.0 }
      },
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform sampler2D tScene, tBloom, tBlur;
        uniform highp sampler2D tDepth;
        uniform float uBloom, uExposure, uContrast, uSaturation, uVignette, uGrain;
        uniform float uFlash, uDof, uFocus, uRange, uNear, uFar, uTime, uFade;
        uniform vec3 uGrade, uLift, uFlashColor;

        // ACES filmic approximation (Narkowicz) — the tonemap three.js ships
        // as ACESFilmicToneMapping, applied here instead of in the renderer so
        // bloom accumulates in linear HDR first.
        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        float linearDepth(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          float ndc = z * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
        }

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 col = texture2D(tScene, vUv).rgb;

          // ---- Depth of field (photo mode, E.6 "P") ----
          if (uDof > 0.001) {
            float d = linearDepth(vUv);
            float coc = clamp(abs(d - uFocus) / max(uRange, 0.001), 0.0, 1.0);
            coc = smoothstep(0.15, 1.0, coc) * uDof;
            col = mix(col, texture2D(tBlur, vUv).rgb, coc);
          }

          // ---- Bloom ----
          col += texture2D(tBloom, vUv).rgb * uBloom;

          // ---- Lightning flash (E.4 rain) ----
          col += uFlashColor * uFlash;

          // ---- Exposure + tonemap ----
          col = aces(col * uExposure);

          // ---- Grade: tint, lift, contrast, saturation ----
          col = col * uGrade + uLift;
          col = (col - 0.5) * uContrast + 0.5;
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(lum), col, uSaturation);

          // ---- Vignette ----
          vec2 q = vUv - 0.5;
          float vig = 1.0 - dot(q, q) * uVignette * 2.2;
          col *= clamp(vig, 0.0, 1.0);

          // ---- Fine grain, keeps flat sky gradients from banding ----
          col += (hash(vUv * 1024.0 + fract(uTime)) - 0.5) * uGrain;

          col = max(col, vec3(0.0)) * (1.0 - uFade);

          // Linear → sRGB for the default framebuffer.
          col = mix(col * 12.92, 1.055 * pow(max(col, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
                    step(vec3(0.0031308), col));
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false
    });
  }

  setSize(width, height, pixelRatio = 1) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.dispose(false);

    this.sceneRT = rt(w, h, { depth: true });
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      this.mips.push({ a: rt(mw, mh), b: rt(mw, mh), w: mw, h: mh });
    }
    // Half-res buffers reused for the photo-mode DOF blur.
    this.dofA = rt(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.dofB = rt(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  /** Render `scene` through `camera` and composite to the screen. */
  render(scene, camera, dt = 0.016) {
    const r = this.renderer;
    const p = this.params;

    if (!this.enabled || !this.sceneRT) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    const prevTone = r.toneMapping;
    const prevOut = r.outputColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    /* ---- Bloom chain ---- */
    let bloomTex = null;
    if (this.bloomEnabled && p.bloomStrength > 0.001) {
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value = p.bloomThreshold;
      this.quad.render(r, this.brightMat, this.mips[0].a);

      for (let i = 0; i < this.mips.length; i++) {
        const m = this.mips[i];
        if (i > 0) {
          // Downsample from the previous level's blurred result.
          this.brightMat.uniforms.tDiffuse.value = this.mips[i - 1].a.texture;
          this.brightMat.uniforms.uThreshold.value = 0.0;
          this.quad.render(r, this.brightMat, m.a);
        }
        this.blurMat.uniforms.uTexel.value.set(1 / m.w, 1 / m.h);
        this.blurMat.uniforms.uRadius.value = p.bloomRadius;
        this.blurMat.uniforms.tDiffuse.value = m.a.texture;
        this.blurMat.uniforms.uDir.value.set(1, 0);
        this.quad.render(r, this.blurMat, m.b);
        this.blurMat.uniforms.tDiffuse.value = m.b.texture;
        this.blurMat.uniforms.uDir.value.set(0, 1);
        this.quad.render(r, this.blurMat, m.a);
      }
      // Combine coarse → fine.
      for (let i = this.mips.length - 1; i > 0; i--) {
        this.upMat.uniforms.tDiffuse.value = this.mips[i - 1].a.texture;
        this.upMat.uniforms.tAdd.value = this.mips[i].a.texture;
        this.upMat.uniforms.uMix.value = 0.75;
        this.quad.render(r, this.upMat, this.mips[i - 1].b);
        // Result now lives in .b; swap so the next iteration reads it.
        const t = this.mips[i - 1].a; this.mips[i - 1].a = this.mips[i - 1].b; this.mips[i - 1].b = t;
      }
      bloomTex = this.mips[0].a.texture;
    }

    /* ---- DOF source blur (photo mode only) ---- */
    if (p.dof > 0.001) {
      this.blurMat.uniforms.uTexel.value.set(2 / this.width, 2 / this.height);
      this.blurMat.uniforms.uRadius.value = 2.4;
      this.blurMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.blurMat.uniforms.uDir.value.set(1, 0);
      this.quad.render(r, this.blurMat, this.dofA);
      this.blurMat.uniforms.tDiffuse.value = this.dofA.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1);
      this.quad.render(r, this.blurMat, this.dofB);
      this.blurMat.uniforms.tDiffuse.value = this.dofB.texture;
      this.blurMat.uniforms.uDir.value.set(1, 0);
      this.quad.render(r, this.blurMat, this.dofA);
      this.blurMat.uniforms.tDiffuse.value = this.dofA.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1);
      this.quad.render(r, this.blurMat, this.dofB);
    }

    /* ---- Composite ---- */
    const u = this.compMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = bloomTex || this.mips[0].a.texture;
    u.tBlur.value = this.dofB.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uBloom.value = bloomTex ? p.bloomStrength : 0.0;
    u.uExposure.value = p.exposure;
    u.uGrade.value.copy(p.grade);
    u.uLift.value.copy(p.lift);
    u.uContrast.value = p.contrast;
    u.uSaturation.value = p.saturation;
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uFlash.value = p.flash;
    u.uFlashColor.value.copy(p.flashColor);
    u.uDof.value = p.dof;
    u.uFocus.value = p.focusDistance;
    u.uRange.value = p.focusRange;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFade.value = p.fadeToBlack;
    u.uTime.value += dt;

    this.quad.render(r, this.compMat, null);

    r.toneMapping = prevTone;
    r.outputColorSpace = prevOut;
    r.setRenderTarget(null);
  }

  dispose(full = true) {
    if (this.sceneRT) {
      if (this.sceneRT.depthTexture) this.sceneRT.depthTexture.dispose();
      this.sceneRT.dispose();
      this.sceneRT = null;
    }
    if (this.mips) for (const m of this.mips) { m.a.dispose(); m.b.dispose(); }
    this.mips = null;
    if (this.dofA) this.dofA.dispose();
    if (this.dofB) this.dofB.dispose();
    this.dofA = this.dofB = null;
    if (full) {
      this.quad.dispose();
      this.brightMat.dispose(); this.blurMat.dispose();
      this.upMat.dispose(); this.compMat.dispose();
    }
  }
}
