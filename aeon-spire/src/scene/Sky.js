/**
 * AEON SPIRE — sky dome.
 *
 * A single inverted sphere carrying an analytic gradient, a sun disc with
 * forward-scattering glow, drifting cloud bands and a star layer that
 * cross-fades in at dusk. Every parameter is a uniform so TimeOfDay can
 * interpolate the whole sky smoothly rather than swapping materials
 * (E.4: "smooth transition, not a hard cut").
 */

import * as THREE from 'three';
import { clamp } from '../core/MathUtil.js';

const SKY_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vWorld;

uniform vec3  uZenith;
uniform vec3  uHorizon;
uniform vec3  uGround;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunSize;
uniform float uSunIntensity;
uniform float uHaze;
uniform float uStarMix;
uniform float uCloud;
uniform vec3  uCloudColor;
uniform float uTime;
uniform float uWind;
uniform sampler2D tStars;
uniform vec3 uCameraPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 dir = normalize(vWorld - uCameraPos);
  float h = dir.y;

  // ---- Base gradient: ground haze → horizon → zenith ----
  float up = clamp(h, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.42 + uHaze * 0.5));
  sky = mix(sky, uGround, clamp(-h * 3.0, 0.0, 1.0));

  // Thicken the horizon band; this is what sells dawn and golden hour.
  float band = exp(-abs(h) * (7.0 + uHaze * 9.0));
  sky = mix(sky, uHorizon * 1.12, band * 0.55);

  // ---- Sun disc + glow ----
  float sd = max(dot(dir, normalize(uSunDir)), 0.0);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
  float glow = pow(sd, 26.0) * 0.55 + pow(sd, 5.0) * 0.22 + pow(sd, 2.0) * 0.06;
  sky += uSunColor * (disc * 14.0 + glow * 3.4) * uSunIntensity;

  // ---- Stars (night) ----
  if (uStarMix > 0.001) {
    vec2 suv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265);
    vec3 stars = texture2D(tStars, suv * vec2(3.0, 1.5)).rgb;
    float twinkle = 0.75 + 0.25 * sin(uTime * 2.1 + hash(floor(suv * 900.0)) * 40.0);
    sky += stars * uStarMix * clamp(h * 2.4, 0.0, 1.0) * twinkle * 1.35;
  }

  // ---- Cloud bands ----
  if (uCloud > 0.001 && h > -0.02) {
    vec2 cp = dir.xz / max(h + 0.14, 0.05);
    cp *= 0.32;
    cp += vec2(uTime * (0.006 + uWind * 0.035), uTime * 0.003);
    float c = fbm(cp);
    float c2 = fbm(cp * 2.1 + 11.0);
    float cover = smoothstep(0.46, 0.86, c * 0.65 + c2 * 0.35);
    cover *= smoothstep(0.0, 0.16, h);
    // Light the cloud from the sun side.
    float lit = clamp(dot(normalize(vec3(dir.x, 0.22, dir.z)), normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 cc = mix(uCloudColor * 0.55, uCloudColor, lit) + uSunColor * pow(lit, 6.0) * 0.5 * uSunIntensity;
    sky = mix(sky, cc, cover * uCloud);
  }

  gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);
}`;

export class Sky {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Texture} starTexture from TextureFactory.starfield()
   */
  constructor(scene, starTexture) {
    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2f6bb5) },
      uHorizon: { value: new THREE.Color(0xbcd4e8) },
      uGround: { value: new THREE.Color(0x2a2f36) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
      uSunSize: { value: 0.0016 },
      uSunIntensity: { value: 1.0 },
      uHaze: { value: 0.35 },
      uStarMix: { value: 0.0 },
      uCloud: { value: 0.35 },
      uCloudColor: { value: new THREE.Color(0xffffff) },
      uTime: { value: 0 },
      uWind: { value: 0.25 },
      tStars: { value: starTexture || null },
      uCameraPos: { value: new THREE.Vector3() }
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'SkyDome';
    scene.add(this.mesh);
    this.scene = scene;
  }

  /** Keep the dome centred on the camera so it never clips. */
  update(dt, camera, windValue = 0.25) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value = windValue;
    if (camera) {
      this.mesh.position.copy(camera.position);
      const r = Math.min(camera.far * 0.48, 3000);
      this.mesh.scale.setScalar(r);
      this.uniforms.uCameraPos.value.copy(camera.position);
    }
  }

  /** Apply a time-of-day preset (already interpolated by TimeOfDay). */
  apply(p) {
    const u = this.uniforms;
    u.uZenith.value.copy(p.zenith);
    u.uHorizon.value.copy(p.horizon);
    u.uGround.value.copy(p.ground);
    u.uSunColor.value.copy(p.sunColor);
    u.uSunIntensity.value = p.sunDiscIntensity;
    u.uHaze.value = p.haze;
    u.uStarMix.value = p.stars;
    u.uCloud.value = clamp(p.cloud, 0, 1);
    u.uCloudColor.value.copy(p.cloudColor);
  }

  setSunDirection(v) { this.uniforms.uSunDir.value.copy(v).normalize(); }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}
