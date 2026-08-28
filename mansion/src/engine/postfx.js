/**
 * The post-processing chain, written directly against WebGLRenderTarget.
 *
 *   scene ─► HDR target (half-float, MSAA by tier)
 *         ─► bright pass      (soft-knee threshold, half resolution)
 *         ─► gaussian bloom   (separable, quarter resolution, 1–2 iterations)
 *         ─► composite        exposure → ACES → grade → chromatic aberration
 *                             → vignette → grain → manual sRGB encode
 *
 * Two things here are easy to get wrong and are handled deliberately:
 *
 *   - Tone mapping happens exactly once.  `renderer.toneMapping` is
 *     NoToneMapping (see renderer.js) and ACES is applied in the composite.
 *   - sRGB encoding is manual.  A custom ShaderMaterial never receives
 *     three's `<colorspace_fragment>` chunk, so the composite pass has to
 *     encode the output itself or everything renders washed out.
 *
 * three's EffectComposer add-ons are deliberately not used: the deliverable is
 * one self-contained file, and each add-on would be another vendored module.
 */
import * as THREE from 'three';
import { fullscreenTriangle } from './renderer.js';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee: fades in over uKnee instead of clipping hard at the threshold.
  float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contribution = max(soft, lum - uThreshold) / max(lum, 1e-5);
  gl_FragColor = vec4(c * contribution, 1.0);
}
`;

const BLUR_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;
void main() {
  // Nine-tap gaussian, weights from the binomial row, run separably.
  vec3 sum = texture2D(tSource, vUv).rgb * 0.2270270270;
  sum += texture2D(tSource, vUv + uTexel * 1.3846153846).rgb * 0.3162162162;
  sum += texture2D(tSource, vUv - uTexel * 1.3846153846).rgb * 0.3162162162;
  sum += texture2D(tSource, vUv + uTexel * 3.2307692308).rgb * 0.0702702703;
  sum += texture2D(tSource, vUv - uTexel * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uSaturation;
uniform float uContrast;
uniform float uAberration;
uniform vec3 uLift;
uniform vec3 uGain;

vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03;
  const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float r2 = dot(centred, centred);

  // Lateral chromatic aberration, scaled by distance from the optical axis.
  vec3 scene;
  if (uAberration > 0.0001) {
    vec2 offset = centred * r2 * uAberration;
    scene.r = texture2D(tScene, uv + offset).r;
    scene.g = texture2D(tScene, uv).g;
    scene.b = texture2D(tScene, uv - offset).b;
  } else {
    scene = texture2D(tScene, uv).rgb;
  }

  vec3 bloom = texture2D(tBloom, uv).rgb;
  vec3 colour = scene * uExposure + bloom * uBloom;

  colour = aces(colour);

  // Lift / gain, then saturation, then filmic contrast about mid grey.
  colour = colour * uGain + uLift * (1.0 - colour);
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour = mix(vec3(luma), colour, uSaturation);
  colour = clamp((colour - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Vignette.
  float vig = 1.0 - uVignette * smoothstep(0.18, 0.78, r2);
  colour *= vig;

  // Film grain, animated so it does not read as a fixed dirty lens.
  float n = hash12(gl_FragCoord.xy + vec2(uTime * 61.7, uTime * 37.3));
  colour += (n - 0.5) * uGrain;

  gl_FragColor = vec4(toSRGB(clamp(colour, 0.0, 1.0)), 1.0);
}
`;

/** Default grade; the sky module overrides these per time of day. */
export const DEFAULT_GRADE = {
  exposure: 1.0,
  bloom: 0.40,
  vignette: 0.24,
  grain: 0.010,
  saturation: 1.05,
  contrast: 1.035,
  aberration: 0.0012,
  lift: [0.005, 0.006, 0.012],
  gain: [1.02, 1.005, 0.985],
  threshold: 1.15,
  knee: 0.5,
};

export function createPostFX(view) {
  const { renderer } = view;
  const geometry = fullscreenTriangle();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(geometry, null);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const brightMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: BRIGHT_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null },
      uThreshold: { value: DEFAULT_GRADE.threshold },
      uKnee: { value: DEFAULT_GRADE.knee },
    },
  });

  const blurMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
    },
  });

  const compositeMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uExposure: { value: DEFAULT_GRADE.exposure },
      uBloom: { value: DEFAULT_GRADE.bloom },
      uVignette: { value: DEFAULT_GRADE.vignette },
      uGrain: { value: DEFAULT_GRADE.grain },
      uTime: { value: 0 },
      uSaturation: { value: DEFAULT_GRADE.saturation },
      uContrast: { value: DEFAULT_GRADE.contrast },
      uAberration: { value: DEFAULT_GRADE.aberration },
      uLift: { value: new THREE.Vector3().fromArray(DEFAULT_GRADE.lift) },
      uGain: { value: new THREE.Vector3().fromArray(DEFAULT_GRADE.gain) },
    },
  });

  let bright = null;
  let blurA = null;
  let blurB = null;
  let bufferW = 1;
  let bufferH = 1;
  let passes = view.tier.bloomPasses;

  function makeTarget(w, h) {
    const target = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: view.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return target;
  }

  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
    renderer.render(quadScene, quadCamera);
  }

  const api = {
    setSize(w, h) {
      bufferW = Math.max(1, w);
      bufferH = Math.max(1, h);
      const halfW = Math.max(1, bufferW >> 1);
      const halfH = Math.max(1, bufferH >> 1);
      const quarterW = Math.max(1, bufferW >> 2);
      const quarterH = Math.max(1, bufferH >> 2);
      if (bright) bright.dispose();
      if (blurA) blurA.dispose();
      if (blurB) blurB.dispose();
      bright = makeTarget(halfW, halfH);
      blurA = makeTarget(quarterW, quarterH);
      blurB = makeTarget(quarterW, quarterH);
    },

    setTier(tier) {
      passes = tier.bloomPasses;
    },

    /** Apply a grade, typically supplied by the sky for the time of day. */
    setGrade(grade) {
      const u = compositeMat.uniforms;
      u.uExposure.value = grade.exposure;
      u.uBloom.value = grade.bloom;
      u.uVignette.value = grade.vignette;
      u.uGrain.value = grade.grain;
      u.uSaturation.value = grade.saturation;
      u.uContrast.value = grade.contrast;
      u.uAberration.value = grade.aberration;
      u.uLift.value.fromArray(grade.lift);
      u.uGain.value.fromArray(grade.gain);
      brightMat.uniforms.uThreshold.value = grade.threshold;
      brightMat.uniforms.uKnee.value = grade.knee;
    },

    /** Render the scene through the whole chain to the default framebuffer. */
    render(scene, camera, elapsed) {
      const sceneTarget = view.sceneTarget;
      renderer.setRenderTarget(sceneTarget);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);

      // Bright pass at half resolution.
      brightMat.uniforms.tScene.value = sceneTarget.texture;
      draw(brightMat, bright);

      // Separable gaussian at quarter resolution, ping-ponging A ↔ B.
      let source = bright;
      for (let i = 0; i < passes; i += 1) {
        blurMat.uniforms.tSource.value = source.texture;
        blurMat.uniforms.uTexel.value.set(1 / source.width, 0);
        draw(blurMat, blurA);

        blurMat.uniforms.tSource.value = blurA.texture;
        blurMat.uniforms.uTexel.value.set(0, 1 / blurA.height);
        draw(blurMat, blurB);
        source = blurB;
      }

      compositeMat.uniforms.tScene.value = sceneTarget.texture;
      compositeMat.uniforms.tBloom.value = blurB.texture;
      compositeMat.uniforms.uTime.value = elapsed;
      draw(compositeMat, null);
      renderer.setRenderTarget(null);
    },

    dispose() {
      if (bright) bright.dispose();
      if (blurA) blurA.dispose();
      if (blurB) blurB.dispose();
      brightMat.dispose();
      blurMat.dispose();
      compositeMat.dispose();
      geometry.dispose();
    },
  };

  return api;
}
