import * as THREE from 'three';

/**
 * Hand-written post-processing chain.
 *
 * Deliberately not three's EffectComposer add-ons: the deliverable is a single
 * self-contained HTML file, so the chain is implemented directly against
 * WebGLRenderTargets.  Passes, in order:
 *
 *   scene (HDR, optionally MSAA)
 *     -> bright pass  (soft-knee threshold, half res)
 *     -> gaussian bloom (two separable mips)
 *     -> radial god-rays from the sun's screen position
 *     -> composite: ACES tonemap, bloom + rays, heat haze, grade,
 *        chromatic aberration, vignette, film grain, sRGB encode
 */

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float threshold;
uniform float knee;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float contrib = max(soft, l - threshold) / max(l, 1e-5);
  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 direction;
void main() {
  // 9-tap gaussian collapsed to 5 bilinear fetches.
  vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
  vec2 o1 = direction * 1.3846153846;
  vec2 o2 = direction * 3.2307692308;
  sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
  sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
  sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
  sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
  gl_FragColor = sum;
}
`;

const RAYS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 sunPos;
uniform float density;
uniform float decay;
uniform float weight;
uniform float visibility;
const int SAMPLES = 24;
void main() {
  if (visibility <= 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 delta = (vUv - sunPos) * (density / float(SAMPLES));
  vec2 uv = vUv;
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  for (int i = 0; i < SAMPLES; i++) {
    uv -= delta;
    vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
    acc += s * illum * weight;
    illum *= decay;
  }
  gl_FragColor = vec4(acc / float(SAMPLES) * visibility, 1.0);
}
`;

const SSAO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uProjection;
uniform mat4 uInverseProjection;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uMaxDistance;
uniform float uFadeStart;
uniform vec3 uKernel[16];

float sampleDepth(vec2 uv) {
  return texture2D(tDepth, uv).x;
}

/** Unproject a depth-buffer sample back into view space. */
vec3 viewFromUvDepth(vec2 uv, float d) {
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 view = uInverseProjection * clip;
  return view.xyz / view.w;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float d = sampleDepth(vUv);
  // Sky and far plane are never occluded.
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewFromUvDepth(vUv, d);

  // Beyond a few hundred metres the occlusion is sub-pixel anyway, and the
  // depth buffer has so little precision left that sampling it produces
  // speckle along the horizon. Fade out and stop.
  float viewDist = -P.z;
  if (viewDist > uMaxDistance) { gl_FragColor = vec4(1.0); return; }
  float distanceFade = 1.0 - smoothstep(uFadeStart, uMaxDistance, viewDist);

  // Reconstruct the normal from the four nearest depth taps, choosing the
  // closer neighbour on each axis so silhouettes do not smear. Doing it this
  // way avoids needing derivatives, which are awkward under GLSL ES 1.00.
  vec2 ex = vec2(uTexel.x, 0.0);
  vec2 ey = vec2(0.0, uTexel.y);
  vec3 pR = viewFromUvDepth(vUv + ex, sampleDepth(vUv + ex));
  vec3 pL = viewFromUvDepth(vUv - ex, sampleDepth(vUv - ex));
  vec3 pU = viewFromUvDepth(vUv + ey, sampleDepth(vUv + ey));
  vec3 pD = viewFromUvDepth(vUv - ey, sampleDepth(vUv - ey));
  vec3 dx = abs(pR.z - P.z) < abs(P.z - pL.z) ? (pR - P) : (P - pL);
  vec3 dy = abs(pU.z - P.z) < abs(P.z - pD.z) ? (pU - P) : (P - pD);
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;

  // Random tangent frame per pixel, so the 16 samples cover more directions.
  float ang = hash12(gl_FragCoord.xy) * 6.2831853;
  vec3 rvec = vec3(cos(ang), sin(ang), 0.0);
  vec3 T = normalize(rvec - N * dot(rvec, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

  float occlusion = 0.0;
  for (int i = 0; i < 16; i++) {
    vec3 samplePos = P + TBN * uKernel[i] * uRadius;
    vec4 offset = uProjection * vec4(samplePos, 1.0);
    vec2 sUv = (offset.xy / offset.w) * 0.5 + 0.5;
    if (sUv.x < 0.0 || sUv.x > 1.0 || sUv.y < 0.0 || sUv.y > 1.0) continue;
    vec3 occluder = viewFromUvDepth(sUv, sampleDepth(sUv));
    // View space looks down -Z, so a larger z is nearer the camera.
    float range = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(P.z - occluder.z)));
    occlusion += (occluder.z >= samplePos.z + uBias ? 1.0 : 0.0) * range;
  }

  float ao = 1.0 - (occlusion / 16.0) * uIntensity * distanceFade;
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0));
}
`;

const SSAO_BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
void main() {
  // 4x4 box blur: enough to hide the per-pixel rotation noise.
  float sum = 0.0;
  for (int x = -2; x < 2; x++) {
    for (int y = -2; y < 2; y++) {
      sum += texture2D(tDiffuse, vUv + vec2(float(x) + 0.5, float(y) + 0.5) * uTexel).r;
    }
  }
  gl_FragColor = vec4(sum / 16.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform sampler2D tAO;
uniform float aoStrength;
uniform float bloomStrength;
uniform float raysStrength;
uniform float exposure;
uniform float vignette;
uniform float grain;
uniform float aberration;
uniform float haze;
uniform float time;
uniform vec3 lift;
uniform vec3 gain;
uniform float saturation;
uniform float contrast;
uniform vec2 resolution;

// Narkowicz ACES filmic approximation.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;

  // Desert heat shimmer: strongest low in frame, animated, tiny amplitude.
  if (haze > 0.0) {
    float band = smoothstep(0.55, 0.0, uv.y);
    float w = sin(uv.y * 190.0 + time * 2.7) * 0.5 + sin(uv.x * 120.0 - time * 1.9) * 0.5;
    uv.x += w * haze * band * 0.0016;
  }

  vec2 fromCenter = uv - 0.5;
  vec3 color;
  if (aberration > 0.0) {
    float amt = aberration * 0.0022;
    color.r = texture2D(tDiffuse, uv + fromCenter * amt).r;
    color.g = texture2D(tDiffuse, uv).g;
    color.b = texture2D(tDiffuse, uv - fromCenter * amt).b;
  } else {
    color = texture2D(tDiffuse, uv).rgb;
  }

  if (aoStrength > 0.0) {
    float ao = texture2D(tAO, uv).r;
    color *= mix(1.0, ao, aoStrength);
  }

  color += texture2D(tBloom, uv).rgb * bloomStrength;
  color += texture2D(tRays, uv).rgb * raysStrength;
  color *= exposure;

  color = aces(color);

  // Lift / gain grade + saturation (warm Saharan look).
  color = color * gain + lift;
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(lum), color, saturation);
  // Filmic contrast pivoted on middle grey.
  color = clamp((color - 0.18) * contrast + 0.18, 0.0, 1.4);

  float r = length(fromCenter * vec2(resolution.x / resolution.y, 1.0));
  color *= 1.0 - vignette * smoothstep(0.35, 1.05, r);

  if (grain > 0.0) {
    float n = hash(gl_FragCoord.xy + fract(time) * 137.0) - 0.5;
    color += n * grain * (1.0 - 0.7 * lum);
  }

  color = clamp(color, 0.0, 1.0);
  // Manual sRGB encode: this ShaderMaterial bypasses three's output conversion.
  vec3 srgb = mix(color * 12.92, 1.055 * pow(max(color, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
                  step(vec3(0.0031308), color));
  gl_FragColor = vec4(srgb, 1.0);
}
`;

function fullscreenMesh(material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

function makeRT(w, h, samples, withDepthTexture = false) {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const options = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: samples || 0,
  };
  if (withDepthTexture) {
    // three resolves depth as part of the multisample blit, so a sampleable
    // depth texture works alongside MSAA and SSAO needs no extra scene pass.
    const depth = new THREE.DepthTexture(width, height);
    depth.type = THREE.UnsignedIntType;
    depth.format = THREE.DepthFormat;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    options.depthTexture = depth;
  }
  const rt = new THREE.WebGLRenderTarget(width, height, options);
  rt.texture.generateMipmaps = false;
  return rt;
}

/** Cosine-weighted hemisphere kernel, clustered toward the origin. */
function makeSsaoKernel(count) {
  const kernel = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand());
    v.normalize();
    const t = i / count;
    v.multiplyScalar(0.1 + 0.9 * t * t);
    kernel.push(v);
  }
  return kernel;
}

export class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.enabled = true;
    this.width = 1;
    this.height = 1;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { tDiffuse: { value: null }, threshold: { value: 1.05 }, knee: { value: 0.6 } },
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { tDiffuse: { value: null }, direction: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.raysMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: RAYS_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        sunPos: { value: new THREE.Vector2(0.5, 0.8) },
        density: { value: 0.85 },
        decay: { value: 0.94 },
        weight: { value: 0.9 },
        visibility: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.ssaoMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: SSAO_FRAG,
      uniforms: {
        tDepth: { value: null },
        uProjection: { value: new THREE.Matrix4() },
        uInverseProjection: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1.15 },
        uBias: { value: 0.035 },
        uIntensity: { value: 1.0 },
        uMaxDistance: { value: 420 },
        uFadeStart: { value: 240 },
        uKernel: { value: makeSsaoKernel(16) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.ssaoBlurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: SSAO_BLUR_FRAG,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        tRays: { value: null },
        tAO: { value: null },
        aoStrength: { value: 0.85 },
        bloomStrength: { value: 0.55 },
        raysStrength: { value: 0.5 },
        exposure: { value: 1.0 },
        vignette: { value: 0.38 },
        grain: { value: 0.035 },
        aberration: { value: 0.22 },
        haze: { value: 1.0 },
        time: { value: 0 },
        lift: { value: new THREE.Vector3(0.008, 0.004, 0.0) },
        gain: { value: new THREE.Vector3(1.05, 1.0, 0.945) },
        saturation: { value: 1.16 },
        contrast: { value: 1.10 },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = fullscreenMesh(this.compositeMat);
    this.scene.add(this.quad);
    // Desired strengths, kept separately so that disabling bloom or god rays
    // on a low tier does not permanently zero them when the tier goes back up.
    this.bloomStrength = 0.55;
    this.raysStrength = 0.5;

    this.sceneRT = null;
    this.brightRT = null;
    this.blurRTA = null;
    this.blurRTB = null;
    this.raysRT = null;
    this.ssaoRT = null;
    this.ssaoBlurRT = null;
    this.aoStrength = 0.85;
    this.setSize(1, 1);
  }

  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const s = this.quality.settings;
    const samples = s.msaa || 0;
    const half = [Math.ceil(this.width / 2), Math.ceil(this.height / 2)];
    const quarter = [Math.ceil(this.width / 4), Math.ceil(this.height / 4)];

    for (const rt of [this.sceneRT, this.brightRT, this.blurRTA, this.blurRTB, this.raysRT, this.ssaoRT, this.ssaoBlurRT]) {
      if (rt) rt.dispose();
    }
    this.sceneRT = makeRT(this.width, this.height, samples, !!s.ssao);
    this.brightRT = makeRT(half[0], half[1], 0);
    this.blurRTA = makeRT(quarter[0], quarter[1], 0);
    this.blurRTB = makeRT(quarter[0], quarter[1], 0);
    this.raysRT = makeRT(half[0], half[1], 0);
    if (s.ssao) {
      this.ssaoRT = makeRT(half[0], half[1], 0);
      this.ssaoBlurRT = makeRT(half[0], half[1], 0);
      this.ssaoMat.uniforms.uTexel.value.set(1 / half[0], 1 / half[1]);
      this.ssaoBlurMat.uniforms.uTexel.value.set(1 / half[0], 1 / half[1]);
    } else {
      this.ssaoRT = null;
      this.ssaoBlurRT = null;
    }
    this.compositeMat.uniforms.resolution.value.set(this.width, this.height);
  }

  get renderTarget() {
    return this.sceneRT;
  }

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target || null);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.scene, this.camera);
  }

  /** Runs the chain over whatever was rendered into `sceneRT`. */
  render(time, { sunScreen = null, sunVisibility = 0, camera = null } = {}) {
    const s = this.quality.settings;
    const u = this.compositeMat.uniforms;
    u.time.value = time;

    if (s.ssao && this.ssaoRT && camera && this.sceneRT.depthTexture) {
      const su = this.ssaoMat.uniforms;
      su.tDepth.value = this.sceneRT.depthTexture;
      su.uProjection.value.copy(camera.projectionMatrix);
      su.uInverseProjection.value.copy(camera.projectionMatrixInverse);
      this._blit(this.ssaoMat, this.ssaoRT);

      this.ssaoBlurMat.uniforms.tDiffuse.value = this.ssaoRT.texture;
      this._blit(this.ssaoBlurMat, this.ssaoBlurRT);

      u.tAO.value = this.ssaoBlurRT.texture;
      u.aoStrength.value = this.aoStrength;
    } else {
      u.tAO.value = null;
      u.aoStrength.value = 0;
    }

    if (s.bloom) {
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this._blit(this.brightMat, this.brightRT);

      this.blurMat.uniforms.tDiffuse.value = this.brightRT.texture;
      this.blurMat.uniforms.direction.value.set(1 / this.blurRTA.width, 0);
      this._blit(this.blurMat, this.blurRTA);

      this.blurMat.uniforms.tDiffuse.value = this.blurRTA.texture;
      this.blurMat.uniforms.direction.value.set(0, 1 / this.blurRTA.height);
      this._blit(this.blurMat, this.blurRTB);

      this.blurMat.uniforms.tDiffuse.value = this.blurRTB.texture;
      this.blurMat.uniforms.direction.value.set(2 / this.blurRTA.width, 0);
      this._blit(this.blurMat, this.blurRTA);

      this.blurMat.uniforms.tDiffuse.value = this.blurRTA.texture;
      this.blurMat.uniforms.direction.value.set(0, 2 / this.blurRTA.height);
      this._blit(this.blurMat, this.blurRTB);
      u.tBloom.value = this.blurRTB.texture;
      u.bloomStrength.value = this.bloomStrength;
    } else {
      u.tBloom.value = null;
      u.bloomStrength.value = 0;
    }

    if (s.godRays && sunScreen && sunVisibility > 0.001) {
      this.raysMat.uniforms.tDiffuse.value = this.brightRT.texture;
      this.raysMat.uniforms.sunPos.value.copy(sunScreen);
      this.raysMat.uniforms.visibility.value = sunVisibility;
      this._blit(this.raysMat, this.raysRT);
      u.tRays.value = this.raysRT.texture;
      u.raysStrength.value = this.raysStrength;
    } else {
      u.tRays.value = null;
      u.raysStrength.value = 0;
    }

    u.tDiffuse.value = this.sceneRT.texture;
    u.grain.value = s.grain ? u.grain.value : 0;
    this._blit(this.compositeMat, null);
  }

  /** Named grades. `applyLook` takes the object, these are the presets. */
  static get LOOKS() {
    return {
      exterior: {
        exposure: 1.0,
        vignette: 0.38,
        grain: 0.035,
        aberration: 0.22,
        haze: 1.0,
        saturation: 1.16,
        contrast: 1.10,
        lift: [0.008, 0.004, 0.0],
        gain: [1.05, 1.0, 0.945],
        bloomStrength: 0.55,
        aoStrength: 0.8,
      },
      interior: {
        exposure: 1.12,
        vignette: 0.55,
        grain: 0.055,
        aberration: 0.12,
        haze: 0.0,
        saturation: 0.94,
        contrast: 1.06,
        lift: [0.006, 0.005, 0.006],
        gain: [1.0, 0.985, 0.985],
        bloomStrength: 0.42,
        aoStrength: 1.0,
      },
    };
  }

  /** Look presets keep the mood consistent between exterior, interior and UI. */
  applyLook(look) {
    const u = this.compositeMat.uniforms;
    if (look.bloomStrength !== undefined) this.bloomStrength = look.bloomStrength;
    if (look.raysStrength !== undefined) this.raysStrength = look.raysStrength;
    if (look.aoStrength !== undefined) this.aoStrength = look.aoStrength;
    for (const [key, value] of Object.entries(look)) {
      if (!u[key]) continue;
      if (u[key].value && u[key].value.isVector3) u[key].value.set(value[0], value[1], value[2]);
      else if (u[key].value && u[key].value.isVector2) u[key].value.set(value[0], value[1]);
      else u[key].value = value;
    }
  }

  dispose() {
    for (const rt of [this.sceneRT, this.brightRT, this.blurRTA, this.blurRTB, this.raysRT, this.ssaoRT, this.ssaoBlurRT]) {
      if (rt) rt.dispose();
    }
    this.quad.geometry.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.raysMat.dispose();
    this.ssaoMat.dispose();
    this.ssaoBlurMat.dispose();
    this.compositeMat.dispose();
  }
}
