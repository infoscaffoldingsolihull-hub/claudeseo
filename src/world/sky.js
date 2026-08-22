import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeRng } from '../engine/noise.js';

/**
 * Atmosphere, celestial mechanics and the lighting rig.
 *
 * The sky uses a Preetham analytic scattering model evaluated per-fragment on a
 * far-plane dome.  The sun's position is computed from real solar geometry for
 * the latitude of Giza (29.9792 N, 31.1342 E), so the shadows the player sees
 * at 06:00, 12:00, 17:30 and 19:00 fall where they actually fall on the
 * plateau - which matters when the simulation is claiming archaeological
 * fidelity.
 */

export const GIZA_LATITUDE = 29.9792;
export const GIZA_LONGITUDE = 31.1342;

const SKY_VERT = /* glsl */ `
uniform vec3 sunPosition;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

const vec3 up = vec3(0.0, 1.0, 0.0);
const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const float vv = 4.0;
const vec3 K = vec3(0.686, 0.678, 0.666);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}

vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;   // pin to the far plane

  vSunDirection = normalize(sunPosition);
  vSunE = sunIntensity(dot(vSunDirection, up));
  vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);

  float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(turbidity) * mieCoefficient;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform float mieDirectionalG;
uniform vec3 up;
uniform float nightBlend;
uniform vec3 nightColor;
uniform float intensity;
uniform vec3 moonDirection;
uniform float moonIntensity;

const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase(float cosTheta) {
  return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
}

float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  float inv = 1.0 / pow(max(1.0 - 2.0 * g * cosTheta + g2, 0.0001), 1.5);
  return ONE_OVER_FOURPI * ((1.0 - g2) * inv);
}

void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);

  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;

  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

  float cosTheta = dot(direction, vSunDirection);
  vec3 betaRTheta = vBetaR * rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaMTheta = vBetaM * hgPhase(cosTheta, mieDirectionalG);

  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0),
             pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)),
             clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));

  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  L0 += (vSunE * 19000.0 * Fex) * sundisk;

  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 retColor = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));

  // Night: swap in an airglow gradient plus a soft lunar halo.
  float horizonFade = smoothstep(-0.12, 0.35, direction.y);
  vec3 night = nightColor * (0.35 + 0.65 * horizonFade);
  float moonHalo = pow(max(dot(direction, normalize(moonDirection)), 0.0), 220.0);
  night += vec3(0.55, 0.62, 0.78) * moonHalo * moonIntensity * 2.2;
  night += vec3(0.10, 0.13, 0.20) * pow(max(dot(direction, normalize(moonDirection)), 0.0), 8.0) * moonIntensity;

  vec3 color = mix(retColor, night, nightBlend);
  gl_FragColor = vec4(color * intensity, 1.0);
}
`;

/** Real solar position for a latitude / day-of-year / local solar hour. */
export function solarPosition(latitudeDeg, dayOfYear, solarHour) {
  const rad = Math.PI / 180;
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const hourAngle = (solarHour - 12) * 15 * rad;
  const lat = latitudeDeg * rad;
  const sinAlt =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));
  const cosAz =
    (Math.sin(decl) - Math.sin(altitude) * Math.sin(lat)) /
    Math.max(1e-6, Math.cos(altitude) * Math.cos(lat));
  let azimuth = Math.acos(clamp(cosAz, -1, 1));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
  return { altitude, azimuth };
}

/** Convert altitude/azimuth (azimuth measured from north, clockwise) to a direction. */
export function horizontalToVector(altitude, azimuth, target = new THREE.Vector3()) {
  const cosAlt = Math.cos(altitude);
  // World axes: -Z is north, +X is east, +Y is up.
  return target
    .set(cosAlt * Math.sin(azimuth), Math.sin(altitude), -cosAlt * Math.cos(azimuth))
    .normalize();
}

function makeStarField(count, radius, rng) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Cosine-free uniform sphere sampling, upper hemisphere biased.
    const u = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.abs(u) * 0.94 + 0.06;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
    const mag = Math.pow(rng(), 2.6);
    const temp = rng();
    tint.setRGB(
      lerp(0.72, 1.0, temp),
      lerp(0.8, 0.96, 1 - Math.abs(temp - 0.5) * 2),
      lerp(1.0, 0.78, temp)
    );
    colors[i * 3] = tint.r * (0.35 + mag);
    colors[i * 3 + 1] = tint.g * (0.35 + mag);
    colors[i * 3 + 2] = tint.b * (0.35 + mag);
    sizes[i] = lerp(1.1, 4.6, mag);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.9999;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      uniform float uOpacity;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d));
        gl_FragColor = vec4(vColor * a, a * uOpacity);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -900;
  return points;
}

export class SkySystem {
  constructor(scene, { dayOfYear = 172, quality } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.dayOfYear = dayOfYear;
    this.hour = 8.5;
    this.timeScale = 0;        // hours per real second; 0 = frozen
    this.sunDirection = new THREE.Vector3(0.4, 0.6, 0.2).normalize();
    this.moonDirection = new THREE.Vector3(-0.4, 0.6, -0.2).normalize();
    this.sunElevation = 0.6;
    this.moonElevation = -0.6;
    this.sunWorld = new THREE.Vector3();
    this.horizonColor = new THREE.Color(0xd8c39a);
    this.state = { phase: 'day', dayFactor: 1, nightFactor: 0, torchFactor: 0 };

    const skyGeo = new THREE.SphereGeometry(1, 32, 16);
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        sunPosition: { value: new THREE.Vector3() },
        rayleigh: { value: 2.1 },
        turbidity: { value: 6.5 },
        mieCoefficient: { value: 0.006 },
        mieDirectionalG: { value: 0.79 },
        up: { value: new THREE.Vector3(0, 1, 0) },
        nightBlend: { value: 0 },
        nightColor: { value: new THREE.Color(0x10182e) },
        intensity: { value: 1.0 },
        moonDirection: { value: new THREE.Vector3(0, 1, 0) },
        moonIntensity: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(skyGeo, this.material);
    this.dome.scale.setScalar(1);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.stars = makeStarField(2200, 1, makeRng(4242));
    scene.add(this.stars);

    // Moon disc: emissive sphere with a subtle mare pattern baked into vertex colours.
    const moonGeo = new THREE.SphereGeometry(1, 20, 14);
    this.moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xf0eee6,
      fog: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    this.moon = new THREE.Mesh(moonGeo, this.moonMaterial);
    this.moon.renderOrder = -899;
    this.moon.frustumCulled = false;
    scene.add(this.moon);

    // ---- lighting rig ----
    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 3.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.06;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 2600;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;
    scene.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(0x9db2e0, 0.0);
    this.moonLight.castShadow = false;
    this.moonTarget = new THREE.Object3D();
    scene.add(this.moonTarget);
    this.moonLight.target = this.moonTarget;
    scene.add(this.moonLight);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0xc2a06a, 0.65);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(this.ambient);

    this.fog = new THREE.FogExp2(0xd8c39a, 0.00018);
    scene.fog = this.fog;

    this.applyQuality();
    this.setHour(this.hour);
  }

  applyQuality() {
    if (!this.quality) return;
    const s = this.quality.settings;
    this.sunLight.castShadow = s.shadows;
    this.sunLight.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
    const d = s.shadowDistance;
    const cam = this.sunLight.shadow.camera;
    cam.left = -d;
    cam.right = d;
    cam.top = d;
    cam.bottom = -d;
    cam.far = d * 6;
    cam.updateProjectionMatrix();
  }

  /** Keep the sky dome and shadow frustum centred on the viewer. */
  follow(camera) {
    const far = camera.far * 0.94;
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(far);
    this.stars.position.copy(camera.position);
    this.stars.scale.setScalar(far * 0.96);
    this.moon.position.copy(camera.position).addScaledVector(this.moonDirection, far * 0.9);
    this.moon.scale.setScalar(far * 0.012);
    this.moon.lookAt(camera.position);

    const d = this.quality ? this.quality.settings.shadowDistance : 400;
    this.sunTarget.position.set(camera.position.x, 0, camera.position.z);
    this.sunTarget.updateMatrixWorld();
    this.sunLight.position.copy(this.sunTarget.position).addScaledVector(this.sunDirection, d * 2.6);
    this.sunLight.updateMatrixWorld();
    this.moonTarget.position.copy(this.sunTarget.position);
    this.moonTarget.updateMatrixWorld();
    this.moonLight.position.copy(this.sunTarget.position).addScaledVector(this.moonDirection, d * 2.6);

    this.sunWorld.copy(camera.position).addScaledVector(this.sunDirection, far * 0.85);
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this._recompute();
  }

  setDayOfYear(day) {
    this.dayOfYear = ((day % 365) + 365) % 365;
    this._recompute();
  }

  update(dt) {
    if (this.timeScale !== 0) {
      this.hour = (this.hour + this.timeScale * dt) % 24;
      if (this.hour < 0) this.hour += 24;
      this._recompute();
    }
  }

  _recompute() {
    const sun = solarPosition(GIZA_LATITUDE, this.dayOfYear, this.hour);
    horizontalToVector(sun.altitude, sun.azimuth, this.sunDirection);
    this.sunElevation = sun.altitude;

    // The moon is modelled as the anti-sun with a small inclination offset -
    // enough for a believable night sky without an ephemeris.
    const moon = solarPosition(GIZA_LATITUDE, this.dayOfYear, (this.hour + 12) % 24);
    horizontalToVector(moon.altitude * 0.92 + 0.12, moon.azimuth + 0.22, this.moonDirection);
    this.moonElevation = moon.altitude;

    const elev = this.sunElevation;
    const u = this.material.uniforms;
    u.sunPosition.value.copy(this.sunDirection).multiplyScalar(450000);
    u.moonDirection.value.copy(this.moonDirection);

    // 0 at civil twilight, 1 in full day.
    const dayFactor = smoothstep(-0.16, 0.10, elev);
    const nightFactor = 1 - smoothstep(-0.22, 0.02, elev);
    const goldenFactor = smoothstep(0.0, 0.22, elev) * (1 - smoothstep(0.22, 0.5, elev));
    const noonFactor = smoothstep(0.55, 1.0, elev);

    u.nightBlend.value = nightFactor;
    u.turbidity.value = lerp(2.6, 8.5, goldenFactor) + noonFactor * 1.1;
    u.rayleigh.value = lerp(3.2, 2.55, dayFactor);
    u.mieCoefficient.value = lerp(0.004, 0.011, goldenFactor);
    u.mieDirectionalG.value = lerp(0.72, 0.84, goldenFactor);
    u.intensity.value = lerp(0.30, 0.46, dayFactor);
    const moonUp = clamp(Math.sin(Math.max(0, this.moonElevation)) * 2.2, 0, 1);
    u.moonIntensity.value = moonUp * nightFactor;

    this.stars.material.uniforms.uOpacity.value = nightFactor * 0.95;
    this.stars.material.uniforms.uScale.value = window.devicePixelRatio > 1.5 ? 1.6 : 1.1;
    this.moonMaterial.opacity = moonUp * clamp(nightFactor * 1.2, 0, 1);
    this.moon.visible = this.moonMaterial.opacity > 0.01;

    // ---- sun light colour temperature ramp ----
    const sunColor = new THREE.Color();
    if (elev < 0) sunColor.setRGB(0.42, 0.22, 0.14);
    else if (elev < 0.12) sunColor.setRGB(1.0, 0.42, 0.19);
    else if (elev < 0.3) sunColor.setRGB(1.0, 0.68, 0.40);
    else if (elev < 0.6) sunColor.setRGB(1.0, 0.90, 0.74);
    else sunColor.setRGB(1.0, 0.975, 0.93);
    this.sunLight.color.copy(sunColor);
    this.sunLight.intensity = lerp(0.0, 3.05, smoothstep(-0.06, 0.42, elev));
    this.sunLight.visible = this.sunLight.intensity > 0.01;

    this.moonLight.intensity = nightFactor * moonUp * 0.95;
    this.moonLight.visible = this.moonLight.intensity > 0.005;

    // Sky bounce: blue from above, warm sand bounce from below.
    this.hemi.intensity = lerp(0.16, 0.52, dayFactor);
    this.hemi.color.setRGB(lerp(0.30, 0.62, dayFactor), lerp(0.36, 0.76, dayFactor), lerp(0.55, 1.0, dayFactor));
    this.hemi.groundColor.setRGB(
      lerp(0.10, 0.80, dayFactor),
      lerp(0.09, 0.63, dayFactor),
      lerp(0.10, 0.40, dayFactor)
    );
    this.ambient.intensity = lerp(0.062, 0.07, dayFactor);

    // ---- fog / horizon colour ----
    const horizon = new THREE.Color();
    horizon
      .setRGB(0.055, 0.07, 0.13)
      .lerp(new THREE.Color(0.92, 0.52, 0.30), goldenFactor)
      .lerp(new THREE.Color(0.80, 0.75, 0.63), dayFactor * (1 - goldenFactor * 0.7));
    this.horizonColor.copy(horizon);
    this.fog.color.copy(horizon);
    this.fog.density = lerp(0.00030, 0.00013, dayFactor) + goldenFactor * 0.00009;

    let phase = 'night';
    if (this.hour >= 4.5 && this.hour < 7.0) phase = 'dawn';
    else if (this.hour >= 7.0 && this.hour < 11.0) phase = 'morning';
    else if (this.hour >= 11.0 && this.hour < 15.0) phase = 'noon';
    else if (this.hour >= 15.0 && this.hour < 17.2) phase = 'afternoon';
    else if (this.hour >= 17.2 && this.hour < 18.6) phase = 'golden';
    else if (this.hour >= 18.6 && this.hour < 19.9) phase = 'dusk';

    this.state.phase = phase;
    this.state.dayFactor = dayFactor;
    this.state.nightFactor = nightFactor;
    this.state.goldenFactor = goldenFactor;
    this.state.torchFactor = clamp(nightFactor * 1.35 + (1 - dayFactor) * 0.5, 0, 1);
    this.state.elevationDeg = (elev * 180) / Math.PI;
  }

  /** Formatted 24-hour clock for the HUD. */
  clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  dispose() {
    this.dome.geometry.dispose();
    this.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.moon.geometry.dispose();
    this.moonMaterial.dispose();
  }
}
