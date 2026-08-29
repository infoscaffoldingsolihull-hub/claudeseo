/**
 * Atmosphere, sun, moon, stars, clouds and the lighting rig.
 *
 * The sky is a Preetham analytic scattering model evaluated per fragment on a
 * dome forced to the far plane.  Turbidity, the Rayleigh coefficient and the
 * Mie terms are all driven by the sun's elevation, so dawn, harsh noon, golden
 * hour and dusk each have their own atmospheric character instead of being a
 * colour ramp between four hand-picked tints.
 *
 * The sun's position is *real solar geometry* for the site — Lahore, 31.4805°N
 * — so the shadow the portico casts across the forecourt at four in the
 * afternoon is the shadow it would actually cast.  This matters more than it
 * sounds: an architectural model whose light is invented cannot be used to
 * argue anything about orientation, glare or solar gain.
 *
 *     declination δ = 23.44° · sin(2π(dayOfYear − 81) / 365)
 *     hour angle  H = 15° · (solar time − 12)
 *     sin(altitude) = sin(φ)·sin(δ) + cos(φ)·cos(δ)·cos(H)
 *     azimuth from north, clockwise, resolved for the afternoon branch
 *
 * World convention: +X is east, −Z is north, +Y is up.
 */
import * as THREE from 'three';
import { clamp, smoothstep, mix } from '../engine/rng.js';
import { DEFAULT_GRADE } from '../engine/postfx.js';

const SKY_VERT = `
uniform vec3 uSunDirection;
uniform float uRayleigh;
uniform float uTurbidity;
uniform float uMieCoefficient;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

const vec3 UP = vec3(0.0, 1.0, 0.0);
const float EULER = 2.718281828459045;
const vec3 TOTAL_RAYLEIGH = vec3(5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5);
const vec3 MIE_CONST = vec3(1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14);
const float CUTOFF_ANGLE = 1.6110731556870734;
const float STEEPNESS = 1.5;
const float SUN_ENERGY = 1000.0;

float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return SUN_ENERGY * max(0.0, 1.0 - pow(EULER, -((CUTOFF_ANGLE - acos(zenithAngleCos)) / STEEPNESS)));
}

vec3 totalMie(float turbidity) {
  float c = (0.2 * turbidity) * 1.0e-17;
  return 0.434 * c * MIE_CONST;
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Force the dome to the far plane so nothing can ever poke through it.
  gl_Position.z = gl_Position.w;

  vSunDirection = normalize(uSunDirection);
  vSunE = sunIntensity(dot(vSunDirection, UP));
  vSunfade = 1.0 - clamp(1.0 - exp(vSunDirection.y * 3.2), 0.0, 1.0);
  float rayleighCoefficient = uRayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = TOTAL_RAYLEIGH * rayleighCoefficient;
  vBetaM = totalMie(uTurbidity) * uMieCoefficient;
}
`;

const SKY_FRAG = `
precision highp float;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform float uMieDirectionalG;
uniform float uIntensity;
uniform float uNight;
uniform vec3 uNightColour;
uniform vec3 uMoonDirection;
uniform float uMoonBrightness;
uniform float uStarTwinkle;

const vec3 UP = vec3(0.0, 1.0, 0.0);
const float PI = 3.141592653589793;
const float RAYLEIGH_ZENITH = 8.4e3;
const float MIE_ZENITH = 1.25e3;
const float SUN_ANGULAR_DIAMETER_COS = 0.999956676946448;
const float MOON_ANGULAR_DIAMETER_COS = 0.99975;

float rayleighPhase(float cosTheta) {
  return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = max(1.0e-4, 1.0 - 2.0 * g * cosTheta + g2);
  return (1.0 / (4.0 * PI)) * ((1.0 - g2) / pow(denom, 1.5));
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

/** A procedural star field on the direction sphere — no texture, no points. */
float stars(vec3 dir) {
  vec3 cell = floor(dir * 320.0);
  float h = hash31(cell);
  float present = step(0.9975, h);
  // Sub-cell position, so a star is a point rather than a lit cell.
  vec3 local = fract(dir * 320.0) - 0.5;
  float d = length(local);
  float shape = smoothstep(0.42, 0.0, d);
  float twinkle = 0.65 + 0.35 * sin(uStarTwinkle * (1.0 + h * 7.0) + h * 40.0);
  float magnitude = 0.35 + 0.65 * hash31(cell + 17.0);
  return present * shape * twinkle * magnitude;
}

void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);

  // Optical path length through the atmosphere for this direction.
  float zenithAngle = acos(max(0.0, dot(UP, direction)));
  float denom = cos(zenithAngle) + 0.15 * pow(max(1.0e-3, 93.885 - ((zenithAngle * 180.0) / PI)), -1.253);
  float inverse = 1.0 / max(1.0e-4, denom);
  float sR = RAYLEIGH_ZENITH * inverse;
  float sM = MIE_ZENITH * inverse;

  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

  float cosTheta = dot(direction, vSunDirection);
  vec3 betaRTheta = vBetaR * rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaMTheta = vBetaM * hgPhase(cosTheta, uMieDirectionalG);
  vec3 ratio = (betaRTheta + betaMTheta) / (vBetaR + vBetaM);

  vec3 Lin = pow(vSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(
    vec3(1.0),
    pow(vSunE * ratio * Fex, vec3(0.5)),
    clamp(pow(1.0 - dot(UP, vSunDirection), 5.0), 0.0, 1.0)
  );

  // The sun's own disc, and a soft limb around it.
  float sunDisc = smoothstep(SUN_ANGULAR_DIAMETER_COS, SUN_ANGULAR_DIAMETER_COS + 0.00004, cosTheta);
  vec3 L0 = vec3(0.1) * Fex + (vSunE * 17000.0 * Fex) * sunDisc;

  // Calibrated so the sky arrives at roughly 1.0 linear at noon: the
  // composite tone-maps at an exposure near 1.0, not the 0.5 the classic
  // Preetham constant assumes.
  vec3 colour = (Lin + L0) * 0.0135;

  // Night: a deep gradient, a star field and the moon, faded in as the sun
  // drops below the horizon so there is never a hard switch.
  if (uNight > 0.001) {
    float horizon = smoothstep(-0.15, 0.55, direction.y);
    vec3 night = mix(uNightColour * 0.45, uNightColour, horizon);
    night += vec3(stars(direction)) * 1.6 * horizon;
    float moonCos = dot(direction, normalize(uMoonDirection));
    float moonDisc = smoothstep(MOON_ANGULAR_DIAMETER_COS, MOON_ANGULAR_DIAMETER_COS + 0.00012, moonCos);
    float moonGlow = pow(max(0.0, moonCos), 900.0) * 0.35;
    night += (vec3(0.92, 0.94, 1.0) * moonDisc * 6.0 + vec3(0.5, 0.56, 0.72) * moonGlow) * uMoonBrightness;
    colour = mix(colour, night, uNight);
  }

  gl_FragColor = vec4(colour * uIntensity, 1.0);
}
`;

const CLOUD_VERT = `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CLOUD_FRAG = `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform float uTime;
uniform float uCover;
uniform vec3 uSunDirection;
uniform vec3 uTint;
uniform vec3 uShade;
uniform float uOpacity;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise2(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = vWorld.xz * 0.0016 + vec2(uTime * 0.0035, uTime * 0.0016);
  float base = fbm(p * 1.6);
  float detail = fbm(p * 5.4 + base);
  float density = smoothstep(1.0 - uCover, 1.0 - uCover + 0.42, base * 0.72 + detail * 0.38);

  // Fade the sheet out toward the horizon so the plane's edge never shows.
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(340.0, 900.0, dist);
  fade *= smoothstep(0.0, 90.0, dist);

  // Cheap self-shading: sample the field again toward the sun.
  float lit = fbm((p + normalize(uSunDirection).xz * 0.05) * 1.6);
  float shade = clamp((base - lit) * 2.4 + 0.55, 0.0, 1.0);
  vec3 colour = mix(uShade, uTint, shade);

  float alpha = density * fade * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour, alpha);
}
`;

/** Solar altitude and azimuth, in radians, for a latitude and a solar time. */
export function solarPosition(latitudeDeg, dayOfYear, solarHour) {
  const rad = Math.PI / 180;
  const lat = latitudeDeg * rad;
  const decl = 23.44 * rad * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);
  const hourAngle = (solarHour - 12) * 15 * rad;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));
  const cosAz = (Math.sin(decl) - Math.sin(altitude) * Math.sin(lat)) /
    Math.max(1e-6, Math.cos(altitude) * Math.cos(lat));
  let azimuth = Math.acos(clamp(cosAz, -1, 1));
  // acos resolves to the morning branch; mirror it after solar noon.
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
  return { altitude, azimuth, declination: decl };
}

/** Unit vector toward the sun, in world space (+X east, −Z north, +Y up). */
export function solarVector(altitude, azimuth) {
  const cosAlt = Math.cos(altitude);
  return new THREE.Vector3(
    Math.sin(azimuth) * cosAlt,
    Math.sin(altitude),
    -Math.cos(azimuth) * cosAlt,
  ).normalize();
}

/** The named times of day, as decimal hours of local solar time. */
export const TIME_PRESETS = [
  { id: 'dawn', label: 'Dawn', hour: 6.7, key: 'Digit5' },
  { id: 'day', label: 'Day', hour: 13.0, key: 'Digit6' },
  { id: 'golden', label: 'Golden hour', hour: 17.35, key: 'Digit7' },
  { id: 'dusk', label: 'Dusk', hour: 19.05, key: 'Digit8' },
  { id: 'night', label: 'Night', hour: 22.4, key: 'Digit9' },
];

export function createSky(scene, options = {}) {
  const latitude = options.latitude !== undefined ? options.latitude : 31.4805;
  let dayOfYear = options.dayOfYear !== undefined ? options.dayOfYear : 105;
  let hour = 13.0;
  let cloudCover = 0.36;
  let elapsed = 0;

  /* ------------------------------------------------------------- the dome -- */
  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uRayleigh: { value: 2.0 },
      uTurbidity: { value: 3.4 },
      uMieCoefficient: { value: 0.005 },
      uMieDirectionalG: { value: 0.80 },
      uIntensity: { value: 1.0 },
      uNight: { value: 0 },
      uNightColour: { value: new THREE.Color(0x0a1428) },
      uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
      uMoonBrightness: { value: 1 },
      uStarTwinkle: { value: 0 },
    },
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skyMaterial);
  skyMesh.scale.setScalar(400);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  skyMesh.name = 'sky';
  scene.add(skyMesh);

  /* ------------------------------------------------------------- clouds --- */
  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uCover: { value: cloudCover },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uTint: { value: new THREE.Color(0xffffff) },
      uShade: { value: new THREE.Color(0x9aa8bd) },
      uOpacity: { value: 0.85 },
    },
  });
  const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), cloudMaterial);
  cloudMesh.rotation.x = -Math.PI / 2;
  cloudMesh.position.y = 190;
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = -900;
  cloudMesh.name = 'clouds';
  scene.add(cloudMesh);

  /* ------------------------------------------------------- the light rig -- */
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 260;
  sunLight.shadow.bias = -0.0012;
  sunLight.shadow.normalBias = 0.035;
  sunLight.name = 'sun';
  scene.add(sunLight);
  scene.add(sunLight.target);

  const moonLight = new THREE.DirectionalLight(0x9fb6de, 0.0);
  moonLight.name = 'moon';
  scene.add(moonLight);
  scene.add(moonLight.target);

  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b5c46, 0.85);
  hemi.name = 'hemisphere';
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  scene.fog = new THREE.FogExp2(0xc9d4e0, 0.0026);

  const grade = Object.assign({}, DEFAULT_GRADE, { lift: [...DEFAULT_GRADE.lift], gain: [...DEFAULT_GRADE.gain] });

  /**
   * The bounced light inside the building — see materials.js, behaviour 4.
   *
   * Two sources, summed:
   *
   *   *Daylight.*  Sunlight and skylight admitted through the openings and
   *   bounced off the floor and the walls.  It follows the sun's elevation but
   *   with a much shallower curve than the sun itself, because a room's
   *   illuminance is dominated by the diffuse sky component, which survives
   *   long after the sun has stopped striking the windows directly.  It also
   *   never quite reaches zero: at the sun's own colour temperature, a room
   *   with the lights off at dusk is dim, not black.
   *
   *   *The electric installation.*  Warm, and switched by exactly the same
   *   term that turns the light fittings' emissive on, so the fill and the
   *   fittings can never disagree about whether the lights are on.
   */
  const interiorFill = new THREE.Color(0, 0, 0);
  const fillDaylight = new THREE.Color();
  const fillLamps = new THREE.Color();
  let fillScale = 1;
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, 1, 0);
  let altitude = 1;
  let azimuth = 0;

  /**
   * Recompute everything the sun's position drives: the atmosphere's
   * parameters, the light rig's colour and intensity, the fog, and the grade
   * handed to the post chain.
   */
  function refresh() {
    const solar = solarPosition(latitude, dayOfYear, hour);
    altitude = solar.altitude;
    azimuth = solar.azimuth;
    sunDir.copy(solarVector(altitude, azimuth));

    // The moon rides the opposite arc, offset so it is not a perfect mirror.
    const moonSolar = solarPosition(latitude, dayOfYear, (hour + 12.6) % 24);
    moonDir.copy(solarVector(moonSolar.altitude, moonSolar.azimuth));

    const alt = altitude; // radians; negative below the horizon
    const above = Math.max(0, Math.sin(alt));
    const nightFactor = clamp(smoothstep(0.06, -0.16, Math.sin(alt)), 0, 1);
    const twilight = clamp(smoothstep(-0.26, 0.14, Math.sin(alt)) * (1 - above * 0.65), 0, 1);
    // Irradiance does not fall off linearly with the sine of the altitude as
    // far as the eye is concerned: at ten degrees the sun is still perfectly
    // capable of lighting a façade, and the eye adapts besides. A gamma on the
    // elevation is what keeps golden hour golden instead of merely dark.
    const lit = Math.pow(above, 0.42);
    const soft = Math.pow(above, 0.5);

    // Atmosphere: thicker and mie-heavier when the sun is low.
    const u = skyMaterial.uniforms;
    u.uSunDirection.value.copy(sunDir);
    u.uTurbidity.value = mix(7.6, 2.6, above);
    u.uRayleigh.value = mix(3.3, 1.35, above);
    u.uMieCoefficient.value = mix(0.021, 0.0042, above);
    u.uMieDirectionalG.value = mix(0.86, 0.78, above);
    u.uIntensity.value = mix(1.25, 0.92, soft);
    u.uNight.value = nightFactor;
    u.uMoonDirection.value.copy(moonDir);
    u.uMoonBrightness.value = clamp(Math.max(0, moonDir.y) * 1.4 + 0.15, 0, 1.4);

    // Sun colour: white at noon, deep amber at the horizon.
    const warmth = clamp(1 - lit * 1.25, 0, 1);
    sunLight.color.setRGB(
      mix(1.0, 1.0, warmth),
      mix(0.95, 0.62, warmth),
      mix(0.86, 0.34, warmth),
    );
    sunLight.intensity = 2.7 * lit;
    sunLight.visible = sunLight.intensity > 0.005;

    moonLight.position.copy(moonDir).multiplyScalar(120);
    moonLight.target.position.set(0, 0, 0);
    moonLight.target.updateMatrixWorld();
    moonLight.intensity = nightFactor * clamp(Math.max(0, moonDir.y), 0, 1) * 0.8;
    moonLight.visible = moonLight.intensity > 0.005;
    moonLight.castShadow = false;

    // Sky bounce: blue by day, cold and dim at night.
    hemi.intensity = mix(0.14, 0.78, soft) + twilight * 0.12;
    hemi.color.setRGB(
      mix(0.16, 0.74, above),
      mix(0.22, 0.83, above),
      mix(0.38, 1.0, above),
    );
    hemi.groundColor.setRGB(
      mix(0.05, 0.42, above),
      mix(0.05, 0.36, above),
      mix(0.07, 0.28, above),
    );
    ambient.intensity = mix(0.075, 0.14, soft) + nightFactor * 0.03;

    // Interior bounce. `lit` is already the perceptual curve on the sun's
    // elevation; the interior rides an even shallower one, and carries a
    // floor so that a windowless basement is never pitch dark.
    const admitted = 0.14 + 0.46 * Math.pow(above, 0.30);
    fillDaylight.setRGB(
      mix(1.0, 0.82, above),
      mix(0.90, 0.86, above),
      mix(0.74, 0.96, above),
    ).multiplyScalar(admitted);
    const lampsOn = 1 - clamp(smoothstep(-0.14, 0.10, Math.sin(alt)), 0, 1);
    fillLamps.setRGB(1.0, 0.82, 0.58).multiplyScalar(0.50 * lampsOn);
    interiorFill.copy(fillDaylight).add(fillLamps).multiplyScalar(fillScale);

    // Fog picks up the horizon colour so distance reads correctly at any hour.
    const fogNight = new THREE.Color(0x0d1626);
    const fogGolden = new THREE.Color(0xe6b183);
    const fogDay = new THREE.Color(0xc4d6e6);
    const fogColour = new THREE.Color().copy(fogGolden).lerp(fogDay, clamp(above * 1.9, 0, 1));
    fogColour.lerp(fogNight, nightFactor);
    scene.fog.color.copy(fogColour);
    scene.fog.density = mix(0.0030, 0.0013, above) + nightFactor * 0.0009;

    cloudMaterial.uniforms.uSunDirection.value.copy(sunDir);
    cloudMaterial.uniforms.uCover.value = cloudCover;
    cloudMaterial.uniforms.uTint.value.setRGB(
      mix(0.52, 1.0, above) + warmth * 0.35,
      mix(0.48, 0.99, above) + warmth * 0.12,
      mix(0.56, 0.98, above) - warmth * 0.06,
    );
    cloudMaterial.uniforms.uShade.value.setRGB(
      mix(0.10, 0.56, above),
      mix(0.12, 0.60, above),
      mix(0.20, 0.70, above),
    );
    cloudMaterial.uniforms.uOpacity.value = mix(0.55, 0.88, above) * (1 - nightFactor * 0.45);

    // Colour grade for the post chain.
    grade.exposure = mix(1.42, 0.98, clamp(lit * 1.15, 0, 1));
    grade.bloom = mix(0.58, 0.32, clamp(lit * 1.3, 0, 1)) + twilight * 0.14;
    grade.threshold = mix(0.95, 1.28, clamp(lit * 1.3, 0, 1));
    grade.saturation = mix(1.10, 1.03, clamp(lit * 1.3, 0, 1));
    grade.contrast = mix(1.05, 1.03, clamp(lit * 1.3, 0, 1));
    grade.vignette = mix(0.28, 0.20, clamp(lit * 1.3, 0, 1));
    grade.grain = mix(0.011, 0.006, clamp(lit * 1.4, 0, 1));
    grade.aberration = mix(0.0015, 0.0009, clamp(lit * 1.4, 0, 1));
    grade.lift = [
      0.003 + nightFactor * 0.010,
      0.004 + nightFactor * 0.013,
      0.008 + nightFactor * 0.028,
    ];
    grade.gain = [
      1.015 + warmth * 0.055,
      1.000 + warmth * 0.008,
      0.985 - warmth * 0.032 + nightFactor * 0.05,
    ];
  }

  refresh();

  return {
    sunLight,
    moonLight,
    hemi,
    ambient,
    grade,
    /** Bounced interior light, for the fill uniform. Read every frame. */
    interiorFill,
    skyMesh,
    cloudMesh,

    get hour() { return hour; },
    get dayOfYear() { return dayOfYear; },
    get altitude() { return altitude; },
    get azimuth() { return azimuth; },
    get sunDirection() { return sunDir; },
    get isNight() { return Math.sin(altitude) < -0.05; },
    /** 0 at full night, 1 at full day — used to switch interior lights on. */
    get daylight() { return clamp(smoothstep(-0.14, 0.10, Math.sin(altitude)), 0, 1); },
    get cloudCover() { return cloudCover; },
    /** Interior-fill trim, exposed so the QA harness can sweep it. */
    get fillScale() { return fillScale; },
    setFillScale(value) {
      fillScale = clamp(value, 0, 6);
      refresh();
    },

    setHour(value) {
      hour = ((value % 24) + 24) % 24;
      refresh();
    },

    setPreset(id) {
      const preset = TIME_PRESETS.find((p) => p.id === id);
      if (!preset) return false;
      hour = preset.hour;
      refresh();
      return true;
    },

    /** Which preset the current hour is closest to, for the HUD. */
    nearestPreset() {
      let best = TIME_PRESETS[0];
      let bestD = Infinity;
      for (const p of TIME_PRESETS) {
        const d = Math.min(Math.abs(p.hour - hour), 24 - Math.abs(p.hour - hour));
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    },

    setDayOfYear(value) {
      dayOfYear = clamp(Math.round(value), 1, 365);
      refresh();
    },

    setCloudCover(value) {
      cloudCover = clamp(value, 0, 0.95);
      refresh();
    },

    /** Per-frame: keep the dome and cloud sheet centred on the camera. */
    update(dt, camera) {
      elapsed += dt;
      skyMesh.position.copy(camera.position);
      cloudMesh.position.x = camera.position.x;
      cloudMesh.position.z = camera.position.z;
      cloudMaterial.uniforms.uTime.value = elapsed;
      skyMaterial.uniforms.uStarTwinkle.value = elapsed * 1.6;
    },

    /** Formatted local time, for the heads-up display. */
    clock() {
      const h = Math.floor(hour);
      const m = Math.floor((hour - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    dispose() {
      scene.remove(skyMesh);
      scene.remove(cloudMesh);
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      cloudMesh.geometry.dispose();
      cloudMaterial.dispose();
    },
  };
}
