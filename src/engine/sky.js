import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeRng } from './noise.js';
import { GEO, trueAzimuthToWorld } from '../world/layout.js';

/**
 * Atmosphere, celestial mechanics and the lighting rig (A3).
 *
 *  - Sun: NOAA solar position algorithm (Julian century, equation of time,
 *    declination, true solar time, hour angle, refraction) for Hyderabad
 *    Airport, 25.318 N 68.366 E, PKT = UTC+5. True azimuths are rotated into
 *    the runway-aligned world frame with `trueAzimuthToWorld`.
 *  - Moon: low-precision lunar ephemeris (mean elements + main periodic terms),
 *    drawn as a sphere lit by the real sun direction, so the phase is correct
 *    for the simulated date; it also drives the moonlight.
 *  - Stars rotate with local sidereal time about the celestial pole.
 *  - Sky: Preetham analytic scattering with a hot-desert grade (dusty horizon,
 *    high noon turbidity, strong golden hour), procedural cumulus/cirrus deck,
 *    horizon dust band, Hyderabad light-dome at night.
 *  - Fog: a GLOBAL height fog with sun in-scattering (ShaderChunk patch, see
 *    below) shared by every three.js material in the scene.
 *  - IBL: a PMREM environment rendered from a sky-only scene, refreshed only
 *    when the sun moves > 2° (4° on Low) or the weather changes.
 *  - Shadows: the sun's shadow frustum is fitted to the visible slice of the
 *    view frustum around where the camera is looking, texel-snapped.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/* ======================================================= global height fog */

/*
 * Shared uniform storage. Float32Arrays are NOT cloned by three's
 * cloneUniforms (only Vector/Color/Matrix/Texture/Array are), so every
 * material that receives these from ShaderLib / UniformsLib.fog shares the
 * same live array.  A material compiled without them (a custom ShaderMaterial
 * that built its fog uniforms by hand) sees zeros and falls back to plain
 * FogExp2 — nothing breaks.
 *   A = sunDir.xyz (world), in-scatter strength
 *   B = haze height falloff (1/m), ground-fog density, ground-fog falloff (1/m), enabled
 *   C = sun in-scatter colour rgb, unused
 */
export const FOG_UNIFORMS = {
  hddFogA: new Float32Array([0, 1, 0, 0]),
  hddFogB: new Float32Array([0.0012, 0, 0.05, 1]),
  hddFogC: new Float32Array([1, 0.9, 0.7, 0]),
};

(function patchFog() {
  if (THREE.ShaderChunk.fog_fragment.indexOf('hddFogB') !== -1) return;
  const inject = (uniforms) => {
    if (!uniforms || !uniforms.fogColor) return;
    for (const [k, v] of Object.entries(FOG_UNIFORMS)) if (!uniforms[k]) uniforms[k] = { value: v };
  };
  inject(THREE.UniformsLib.fog);
  for (const lib of Object.values(THREE.ShaderLib)) inject(lib.uniforms);

  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vHddFogView;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vHddFogView = mvPosition.xyz;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vHddFogView;
  uniform vec4 hddFogA;
  uniform vec4 hddFogB;
  uniform vec4 hddFogC;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float hddFogIntegral( float x ) {
    return abs( x ) > 1e-4 ? ( 1.0 - exp( - x ) ) / x : 1.0 - 0.5 * x;
  }
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor;
    vec3 hddFogCol = fogColor;
    if ( hddFogB.w > 0.5 ) {
      vec3 fv = ( vec4( vHddFogView, 0.0 ) * viewMatrix ).xyz;
      float fd = length( fv );
      vec3 rd = fv / max( fd, 1e-4 );
      float camY = max( cameraPosition.y, -50.0 );
      float t1 = fogDensity * exp( - hddFogB.x * camY ) * fd * hddFogIntegral( hddFogB.x * rd.y * fd );
      float t2 = hddFogB.y * exp( - hddFogB.z * camY ) * fd * hddFogIntegral( hddFogB.z * rd.y * fd );
      fogFactor = 1.0 - exp( - ( t1 + t2 ) );
      float sunAmt = pow( max( dot( rd, hddFogA.xyz ), 0.0 ), 6.0 ) * hddFogA.w;
      hddFogCol = mix( fogColor, hddFogC.rgb, clamp( sunAmt, 0.0, 1.0 ) );
    } else {
      fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    }
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hddFogCol, fogFactor );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;
})();

/* ============================================================ astronomy */

/** Julian Day from a JS Date (UTC instant). */
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * NOAA solar position (Meeus-based spreadsheet algorithm).
 * Returns { elevation, azimuth (rad, true, clockwise from N), declination,
 *           equationOfTime (minutes), hourAngle (deg), zenith }.
 */
export function noaaSolarPosition(date, latDeg = GEO.latitude, lonDeg = GEO.longitude, tzHours = GEO.utcOffsetHours) {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
    0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  // Minutes past local midnight of the instant, in the zone's standard time.
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
  const localMin = (((utcMin + tzHours * 60) % 1440) + 1440) % 1440;
  const tst = (((localMin + eot + 4 * lonDeg - 60 * tzHours) % 1440) + 1440) % 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;
  const lat = latDeg * RAD;
  const cosZ = clamp(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha * RAD), -1, 1);
  const zen = Math.acos(cosZ);
  const elevDeg = 90 - zen * DEG;
  // Atmospheric refraction (NOAA approximation), degrees.
  let refr = 0;
  if (elevDeg <= 85) {
    const te = Math.tan(elevDeg * RAD);
    if (elevDeg > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elevDeg > -0.575) refr = 1735 + elevDeg * (-518.2 + elevDeg * (103.4 + elevDeg * (-12.79 + elevDeg * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  const sinZ = Math.max(1e-6, Math.sin(zen));
  const azArg = clamp(((Math.sin(lat) * cosZ) - Math.sin(decl)) / (Math.cos(lat) * sinZ), -1, 1);
  let azDeg = Math.acos(azArg) * DEG;
  azDeg = ha > 0 ? (azDeg + 180) % 360 : (540 - azDeg) % 360;
  return {
    elevation: (elevDeg + refr) * RAD,
    azimuth: azDeg * RAD,
    declination: decl,
    equationOfTime: eot,
    hourAngle: ha,
    zenith: zen,
  };
}

/** Local mean sidereal time (radians) for a UTC instant and east longitude. */
export function siderealTime(date, lonDeg = GEO.longitude) {
  const d = julianDay(date) - 2451545.0;
  return (((280.16 + 360.9856235 * d + lonDeg) % 360) + 360) % 360 * RAD;
}

/**
 * Low-precision lunar ephemeris (mean elements + the largest periodic terms;
 * ~0.3° — far below the disc's apparent size at this scale).
 * Returns { altitude, azimuth (true, from N), distanceKm, illumination 0..1, phase 0..1 }.
 */
export function lunarPosition(date, latDeg = GEO.latitude, lonDeg = GEO.longitude) {
  const d = julianDay(date) - 2451545.0;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const D = (297.85 + 12.190749 * d) * RAD;
  const Ms = (357.529 + 0.98560028 * d) * RAD;
  const lon = L + RAD * (6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) +
    0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F));
  const lat = RAD * (5.128 * Math.sin(F));
  const distanceKm = 385001 - 20905 * Math.cos(M);
  const e = 23.4397 * RAD;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon));
  const H = siderealTime(date, lonDeg) - ra;
  const phi = latDeg * RAD;
  let altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // Topocentric parallax (~0.95°) and refraction near the horizon.
  altitude -= Math.asin(6378.14 / distanceKm) * Math.cos(altitude);
  const azFromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const azimuth = (azFromSouth + Math.PI + 2 * Math.PI) % (2 * Math.PI);
  // Elongation from the sun's ecliptic longitude gives the phase.
  const sunLon = (280.46646 + 0.98564736 * d) * RAD + RAD * (1.915 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms));
  const elong = Math.acos(clamp(Math.cos(lat) * Math.cos(lon - sunLon), -1, 1));
  const illumination = (1 - Math.cos(elong)) / 2;
  let phase = (((lon - sunLon) / (2 * Math.PI)) % 1 + 1) % 1;
  if (!Number.isFinite(phase)) phase = 0;
  return { altitude, azimuth, distanceKm, illumination, phase, ra, dec };
}

/** True horizontal coordinates → world direction (runway-aligned frame). */
export function horizontalToWorld(altitude, trueAzimuth, target = new THREE.Vector3()) {
  const a = trueAzimuthToWorld(trueAzimuth);
  const c = Math.cos(altitude);
  return target.set(c * Math.sin(a), Math.sin(altitude), -c * Math.cos(a)).normalize();
}

/* ============================================================== shaders */

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
const vec3 up = vec3( 0.0, 1.0, 0.0 );
const float e = 2.718281828459045;
const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w;
  vSunDirection = normalize( sunPosition );
  vSunE = sunIntensity( dot( vSunDirection, up ) );
  vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );
  float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie( turbidity ) * mieCoefficient;
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
uniform float nightBlend;
uniform vec3 nightColor;
uniform float intensity;
uniform vec3 moonDirection;
uniform float moonIntensity;
uniform float sunDiscScale;
uniform vec3 hazeColor;
uniform float hazeAmount;
uniform vec3 groundColor;
uniform float cloudCover;
uniform float cloudDark;
uniform float cirrus;
uniform vec2 cloudOffset;
uniform vec3 cloudSun;
uniform vec3 cloudAmbient;
uniform vec3 cityGlowDir;
uniform float cityGlow;
uniform float flash;
uniform float cloudGolden;
uniform vec2 cloudWind;
uniform float skyClear;
uniform float envBoost;

const float pi = 3.141592653589793;
const vec3 up = vec3( 0.0, 1.0, 0.0 );
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.999956676946448;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + cosTheta * cosTheta ); }
float hgPhase( float cosTheta, float g ) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ( 1.0 - g2 ) / pow( max( 1.0 - 2.0 * g * cosTheta + g2, 0.0001 ), 1.5 );
}
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float s = 0.0;
  float a = 0.5;
  for ( int i = 0; i < CLOUD_OCTAVES; i++ ) {
    s += a * vnoise( p );
    p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p;
    a *= 0.5;
  }
  return s;
}

float fbm3( vec2 p ) {
  float s = 0.5 * vnoise( p );
  p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p;
  s += 0.25 * vnoise( p );
  p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p;
  return s + 0.125 * vnoise( p );
}
void main() {
  vec3 direction = normalize( vWorldPosition - cameraPosition );
  float dy = max( 0.0, direction.y );
  float zenithAngle = acos( dy );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( max( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), 0.001 ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
  float cosTheta = dot( direction, vSunDirection );
  vec3 betaRTheta = vBetaR * rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaMTheta = vBetaM * hgPhase( cosTheta, mieDirectionalG );
  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ),
              clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
  L0 += ( vSunE * 19000.0 * Fex ) * sundisk * sunDiscScale;
  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  vec3 day = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
  // Desert grade: a deeper cobalt zenith, a warm sun glow.
  float zen = pow( dy, 0.55 );
  float lum = dot( day, vec3( 0.299, 0.587, 0.114 ) );
  day = mix( day, vec3( 0.12, 0.32, 0.78 ) * lum * 1.8, zen * 0.7 * skyClear * vSunfade );
  float sg = max( cosTheta, 0.0 );
  day += vec3( 1.0, 0.72, 0.42 ) * ( pow( sg, 48.0 ) * 0.22 + pow( sg, 6.0 ) * 0.06 ) * skyClear * ( 1.0 - 0.6 * vSunfade + 0.6 );

  // Night: airglow gradient, lunar halo, Hyderabad light dome.
  float horizonFade = smoothstep( -0.12, 0.35, direction.y );
  vec3 night = nightColor * ( 0.35 + 0.65 * horizonFade );
  float md = max( dot( direction, normalize( moonDirection ) ), 0.0 );
  night += vec3( 0.55, 0.62, 0.78 ) * pow( md, 220.0 ) * moonIntensity * 1.2;
  night += vec3( 0.10, 0.13, 0.20 ) * pow( md, 8.0 ) * moonIntensity;
  float cg = pow( max( dot( normalize( vec3( direction.x, 0.0, direction.z ) ), cityGlowDir ), 0.0 ), 3.0 );
  night += vec3( 0.20, 0.15, 0.09 ) * cityGlow * cg * exp( -max( direction.y, 0.0 ) * 14.0 );

  vec3 color = mix( day, night, nightBlend );

  // Clouds on a curved deck: domain-warped fbm cumulus, self-shadowed
  // towards the sun (silver lining on thin edges), tinted gold/pink at low
  // sun, grey and dense in the monsoon, brown in dust; plus wind-combed cirrus.
  if ( direction.y > -0.01 && ( cloudCover > 0.01 || cirrus > 0.01 ) ) {
    float hy = max( direction.y, 0.0 );
    vec2 p = direction.xz / ( hy + 0.085 ) * 1.6 + cloudOffset;
    float horizonK = smoothstep( 0.0, 0.10, hy );
    float farK = 1.0 - smoothstep( 0.02, 0.35, hy );          // 1 near the horizon
    float sunUp = clamp( vSunDirection.y * 4.0 + 0.3, 0.0, 1.0 );
    float c = 0.0;
    vec3 cloudCol = vec3( 0.0 );
    if ( cloudCover > 0.01 ) {
      vec2 wq = vec2( vnoise( p * 0.45 + 3.1 ), vnoise( p * 0.45 + vec2( 7.7, 1.3 ) ) );
      vec2 pc = p * 0.95 + ( wq - 0.5 ) * 1.3;
      float n = fbm( pc );
      float det = fbm3( pc * 4.1 + 2.3 ) * 1.14;
      n += ( det - 0.5 ) * 0.16;
      float lo = 0.6 - cloudCover * 0.48 - cloudDark * 0.2;
      float dens = smoothstep( lo, lo + mix( 0.07, 0.4, cloudDark ), n );
      // Self-shadow: denser towards the sun means this side is in shade.
      vec2 toSun = normalize( vSunDirection.xz + vec2( 1e-4 ) ) * 0.16;
      float ns = fbm( pc + toSun ) + ( det - 0.5 ) * 0.16;
      float light = clamp( 0.6 - ( ns - n ) * 12.0, 0.0, 1.0 );
      float core = smoothstep( lo + 0.02, lo + mix( 0.24, 0.45, cloudDark ), n );
      float sunCos = max( cosTheta, 0.0 );
      float silver = pow( sunCos, 10.0 ) * ( 1.0 - core ) * 3.0 + hgPhase( cosTheta, 0.55 ) * 1.6 * ( 1.0 - core * 0.7 );
      vec3 lit = cloudSun * ( 0.6 + 1.2 * light + silver ) + cloudAmbient * 1.2;
      vec3 shade = cloudAmbient * mix( 0.85, 0.62, cloudGolden ) + cloudSun * 0.12;
      cloudCol = mix( lit, shade, clamp( core * 0.75 * ( 1.0 - light * 0.5 ) + ( 1.0 - light ) * 0.45, 0.0, 0.92 ) );
      // Golden / pink hour: warm tops, rosy undersides.
      cloudCol = mix( cloudCol, cloudCol * vec3( 1.18, 0.86, 0.8 ) + cloudSun * vec3( 0.18, 0.04, 0.06 ) * ( 1.0 - core ), cloudGolden * 0.8 );
      // Monsoon: heavy slate-grey nimbostratus with darker bellies.
      vec3 storm = cloudAmbient * mix( 0.95, 0.5, core ) * vec3( 0.92, 0.96, 1.05 );
      cloudCol = mix( cloudCol, storm, cloudDark * 0.85 );
      // Dust and distance: clouds melt into the haze towards the horizon.
      cloudCol = mix( cloudCol, hazeColor * 0.95, clamp( farK * 0.4 + hazeAmount * 0.5, 0.0, 0.9 ) );
      c = dens * horizonK * mix( 0.96, 1.0, cloudDark );
    }
    color = mix( color, cloudCol, clamp( c, 0.0, 1.0 ) );
    if ( cirrus > 0.01 ) {
      vec2 wd = normalize( cloudWind + vec2( 1e-4 ) );
      mat2 rot = mat2( wd.x, -wd.y, wd.y, wd.x );
      vec2 q = rot * ( p * 0.9 + cloudOffset * 0.35 );
      q = vec2( q.x * 0.5, q.y * 3.2 );
      float ci = fbm( q + vec2( vnoise( q * 0.7 ) * 1.6, 0.0 ) );
      ci = smoothstep( 0.52, 0.8, ci ) * cirrus * smoothstep( 0.03, 0.25, hy ) * 0.55 * ( 1.0 - c );
      vec3 ciCol = cloudSun * ( 1.05 + hgPhase( cosTheta, 0.7 ) * 2.0 ) + cloudAmbient * 0.9;
      ciCol = mix( ciCol, ciCol * vec3( 1.25, 0.78, 0.88 ), cloudGolden );
      color = mix( color, ciCol, ci * sunUp + ci * 0.3 * ( 1.0 - sunUp ) );
    }
  }
  // Dust band hugging the horizon, and the ground below it.
  float band = exp( -max( direction.y, 0.0 ) * mix( 14.0, 3.0, hazeAmount ) );
  color = mix( color, hazeColor, clamp( band * ( 0.35 + 0.65 * hazeAmount ), 0.0, 1.0 ) * ( 1.0 - 0.4 * nightBlend ) );
  color = mix( color, groundColor, smoothstep( 0.0, -0.06, direction.y ) );
  color += vec3( 0.75, 0.8, 1.0 ) * flash * ( 0.4 + 0.6 * dy );
  gl_FragColor = vec4( color * intensity * envBoost, 1.0 );
}
`;

const MOON_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w * 0.99995;
}
`;

const MOON_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uToward;
uniform vec3 uSunDir;
uniform float uOpacity;
uniform float uBright;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
void main() {
  float r2 = dot( vUv, vUv );
  if ( r2 > 1.0 ) discard;
  float z = sqrt( 1.0 - r2 );
  vec3 n = normalize( vUv.x * uRight + vUv.y * uUp + z * uToward );
  float lit = smoothstep( -0.04, 0.12, dot( n, uSunDir ) );
  // Maria: low-frequency dark patches fixed to the disc.
  float m = vnoise( vUv * 2.6 + 3.1 ) * 0.6 + vnoise( vUv * 6.0 + 1.7 ) * 0.4;
  float albedo = mix( 0.62, 1.0, smoothstep( 0.35, 0.65, m ) );
  float limb = mix( 0.75, 1.0, z );
  float edge = smoothstep( 1.0, 0.94, r2 );
  vec3 c = vec3( 1.0, 0.97, 0.9 ) * albedo * limb * ( lit * uBright + 0.012 );
  gl_FragColor = vec4( c * edge * uOpacity, 1.0 );
}
`;

/* =========================================================== star field */

/** Stars in EQUATORIAL coordinates (x → RA 0h, z → north celestial pole). */
function makeStarField(count, rng) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const zc = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - zc * zc);
    // Milky-Way-ish density: favour a great circle tilted to the equator.
    positions[i * 3] = Math.cos(th) * r;
    positions[i * 3 + 1] = Math.sin(th) * r;
    positions[i * 3 + 2] = zc;
    const mag = Math.pow(rng(), 3.0);
    const temp = rng();
    tint.setRGB(lerp(0.86, 1.0, temp), lerp(0.92, 1.0, 1 - Math.abs(temp - 0.5) * 2), lerp(1.0, 0.88, temp));
    colors[i * 3] = tint.r * (0.3 + mag * 1.6);
    colors[i * 3 + 1] = tint.g * (0.3 + mag * 1.6);
    colors[i * 3 + 2] = tint.b * (0.3 + mag * 1.6);
    sizes[i] = lerp(1.0, 4.2, mag);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uScale: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vColor;
      varying float vFade;
      uniform float uScale;
      uniform float uTime;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vec3 wdir = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz );
        vFade = smoothstep( -0.02, 0.18, wdir.y );
        float tw = 0.75 + 0.25 * sin( uTime * 3.0 + position.x * 91.0 + position.y * 57.0 );
        vColor = color * mix( tw, 1.0, smoothstep( 0.2, 0.7, wdir.y ) );
        gl_PointSize = aSize * uScale;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.9999;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vFade;
      uniform float uOpacity;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep( 0.5, 0.05, length( d ) );
        gl_FragColor = vec4( vColor * a * uOpacity * vFade, 1.0 );
      }
    `,
    vertexColors: true,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.matrixAutoUpdate = false;
  points.renderOrder = -900;
  return points;
}

/* ============================================================= the sky */

const PHASES = [
  [4.6, 'night'], [6.4, 'dawn'], [10.5, 'morning'], [14.5, 'noon'], [16.6, 'afternoon'], [18.0, 'golden'], [19.2, 'dusk'], [24, 'night'],
];

export class SkySystem {
  constructor(scene, { quality = null, date = null, hour = 9.5 } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.renderer = quality && quality.renderer ? quality.renderer : null;
    this.date = date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) : new Date(Date.UTC(2027, 0, 4));
    this.hour = hour;
    this.timeScale = 0;               // simulated hours per real second (0 = frozen)
    this.dayOfYear = 4;
    this.sunDirection = new THREE.Vector3(0.4, 0.6, 0.2).normalize();
    this.moonDirection = new THREE.Vector3(-0.4, 0.6, -0.2).normalize();
    this.sunElevation = 0.6;
    this.sunAzimuth = 0;
    this.moonElevation = -0.6;
    this.moonIllumination = 0.5;
    this.sunWorld = new THREE.Vector3();
    this.horizonColor = new THREE.Color(0xd8c39a);
    this.solar = null;
    this.lunar = null;
    this.state = {
      phase: 'day', dayFactor: 1, nightFactor: 0, goldenFactor: 0, lightsFactor: 0, torchFactor: 0,
      elevationDeg: 0, azimuthDeg: 0, moonIllumination: 0.5, moonElevationDeg: 0, equationOfTime: 0,
    };
    /** Weather-driven atmosphere (written by WeatherSystem; neutral defaults). */
    this.atmosphere = {
      turbidity: 0, haze: 0, hazeColor: new THREE.Color(0.78, 0.66, 0.5), cloudCover: 0.12, cirrus: 0.5,
      cloudDark: 0, sunDim: 1, skyDim: 1, fogDensity: 1, fogColor: null, fogColorMix: 0, groundFog: 0,
      groundFogFalloff: 0.06, lightsBoost: 0, flash: 0, wind: new THREE.Vector2(1, 0.3),
    };
    this._cloudOffset = new THREE.Vector2();

    const tier = quality ? quality.tier : 'medium';
    const octaves = tier === 'low' ? 3 : tier === 'medium' ? 4 : 5;

    // ---- sky dome ----
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      defines: { CLOUD_OCTAVES: octaves },
      uniforms: {
        sunPosition: { value: new THREE.Vector3() },
        rayleigh: { value: 2.2 },
        turbidity: { value: 5 },
        mieCoefficient: { value: 0.006 },
        mieDirectionalG: { value: 0.8 },
        nightBlend: { value: 0 },
        nightColor: { value: new THREE.Color(0x0a1224) },
        intensity: { value: 1 },
        moonDirection: { value: new THREE.Vector3(0, 1, 0) },
        moonIntensity: { value: 0 },
        sunDiscScale: { value: 1 },
        hazeColor: { value: new THREE.Color() },
        hazeAmount: { value: 0 },
        groundColor: { value: new THREE.Color() },
        cloudCover: { value: 0.1 },
        cloudDark: { value: 0 },
        cirrus: { value: 0.5 },
        cloudOffset: { value: this._cloudOffset },
        cloudSun: { value: new THREE.Color(1, 1, 1) },
        cloudAmbient: { value: new THREE.Color(0.3, 0.35, 0.45) },
        cityGlowDir: { value: new THREE.Vector3(-1, 0, -0.25).normalize() },
        cityGlow: { value: 0 },
        flash: { value: 0 },
        envBoost: { value: 1 },
        cloudGolden: { value: 0 },
        cloudWind: { value: new THREE.Vector2(1, 0.3) },
        skyClear: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.name = 'sky-dome';
    scene.add(this.dome);

    this.stars = makeStarField(tier === 'low' ? 1400 : 3200, makeRng(4242));
    scene.add(this.stars);
    this._starRot = new THREE.Matrix4();
    this._starScale = new THREE.Matrix4();

    this.moonMaterial = new THREE.ShaderMaterial({
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
      uniforms: {
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uToward: { value: new THREE.Vector3(0, 0, 1) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uOpacity: { value: 0 },
        uBright: { value: 2.4 },
      },
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.moonMaterial);
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -899;
    scene.add(this.moon);

    // ---- lighting rig ----
    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 3.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.05;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;
    scene.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(0x9db2e0, 0);
    this.moonLight.castShadow = false;
    this.moonTarget = new THREE.Object3D();
    scene.add(this.moonTarget);
    this.moonLight.target = this.moonTarget;
    scene.add(this.moonLight);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0xc2a06a, 0.5);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(this.ambient);

    this.fog = new THREE.FogExp2(0xd8c39a, 0.00012);
    scene.fog = this.fog;

    // ---- shadow fitting scratch ----
    this._shadowCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
    this._shadowCentre = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._altUp = new THREE.Vector3(0, 0, 1);
    this._right = new THREE.Vector3();
    this._trueUp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmpColor = new THREE.Color();

    // ---- IBL ----
    this.envEnabled = !!this.renderer;
    this.envBoost = 0.85;
    this.envMap = null;
    this._envRT = null;
    this._envSun = new THREE.Vector3(0, -2, 0);
    this._envSig = '';
    this._envTimer = 0;
    this._envDirty = true;
    if (this.envEnabled) {
      this._pmrem = new THREE.PMREMGenerator(this.renderer);
      this._envScene = new THREE.Scene();
      this._envDome = new THREE.Mesh(this.dome.geometry, this.material);
      this._envDome.scale.setScalar(100);
      this._envDome.frustumCulled = false;
      this._envDome.renderOrder = -1000;
      this._envScene.add(this._envDome);
      this._envGroundMat = new THREE.MeshBasicMaterial({ color: 0x8a7656, fog: false });
      const g = new THREE.CircleGeometry(900, 32);
      g.rotateX(-Math.PI / 2);
      this._envGround = new THREE.Mesh(g, this._envGroundMat);
      this._envGround.position.y = -8;
      this._envScene.add(this._envGround);
    }

    this.applyQuality();
    if (quality && quality.onChange) this._offQuality = quality.onChange(() => this.applyQuality());
    scene.userData.sky = this;
    this._recompute();
  }

  applyQuality() {
    if (!this.quality) return;
    const s = this.quality.settings;
    this.sunLight.castShadow = !!s.shadows;
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
    cam.near = 1;
    cam.far = d * 6;
    cam.updateProjectionMatrix();
    this._envThreshold = (this.quality.tier === 'low' ? 4 : 2) * RAD;
    this._envMinInterval = this.quality.tier === 'low' ? 1.0 : 0.25;
  }

  /* --------------------------------------------------------------- time */

  /** Simulated calendar date (UTC midnight of the local day). */
  setDate(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return;
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (this.date && d.getTime() === this.date.getTime()) return;
    this.date = d;
    this._recompute();
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this._recompute();
  }

  /** Benchmark compatibility: set the day of year (keeps the year). */
  setDayOfYear(day) {
    const y = this.date.getUTCFullYear();
    this.setDate(new Date(Date.UTC(y, 0, 1) + (((day - 1) % 365) + 365) % 365 * 86400000));
  }

  /** The UTC instant of the current simulated local time. */
  get instant() {
    return new Date(this.date.getTime() + (this.hour - GEO.utcOffsetHours) * 3600000);
  }

  update(dt) {
    if (this.timeScale !== 0) {
      this.hour = (((this.hour + this.timeScale * dt) % 24) + 24) % 24;
    }
    this._cloudOffset.x += this.atmosphere.wind.x * dt * 0.004;
    this._cloudOffset.y += this.atmosphere.wind.y * dt * 0.004;
    this.stars.material.uniforms.uTime.value += dt;
    // Recompute every frame: weather transitions move the palette continuously
    // and the cost is a few dozen trig calls.
    this._recompute();
    this._envTimer += dt;
    this._maybeRefreshEnvironment();
  }

  /** Re-derive everything from date, hour and atmosphere. */
  refresh() {
    this._recompute();
  }

  _recompute() {
    const instant = this.instant;
    const doy = Math.floor((this.date.getTime() - Date.UTC(this.date.getUTCFullYear(), 0, 1)) / 86400000) + 1;
    this.dayOfYear = doy;
    const sun = noaaSolarPosition(instant);
    this.solar = sun;
    horizontalToWorld(sun.elevation, sun.azimuth, this.sunDirection);
    this.sunElevation = sun.elevation;
    this.sunAzimuth = sun.azimuth;
    const moon = lunarPosition(instant);
    this.lunar = moon;
    horizontalToWorld(moon.altitude, moon.azimuth, this.moonDirection);
    this.moonElevation = moon.altitude;
    this.moonIllumination = moon.illumination;

    const a = this.atmosphere;
    const elev = this.sunElevation;
    const u = this.material.uniforms;
    u.sunPosition.value.copy(this.sunDirection).multiplyScalar(450000);
    u.moonDirection.value.copy(this.moonDirection);

    const dayFactor = smoothstep(-0.16, 0.10, elev);
    const nightFactor = 1 - smoothstep(-0.22, 0.02, elev);
    const goldenFactor = smoothstep(-0.02, 0.16, elev) * (1 - smoothstep(0.16, 0.42, elev));
    const noonFactor = smoothstep(0.55, 1.1, elev);
    const overcast = clamp(a.cloudCover * a.cloudDark * 1.2, 0, 1);

    // Hot-desert grade: dusty noon, crisp-ish mornings, intense golden hour.
    u.turbidity.value = 2.1 + noonFactor * 1.4 + goldenFactor * 4.8 + a.turbidity;
    u.rayleigh.value = lerp(3.0, 2.9, dayFactor) + goldenFactor * 0.5;
    u.mieCoefficient.value = lerp(0.0042, 0.011, goldenFactor) + a.haze * 0.01;
    u.mieDirectionalG.value = lerp(0.76, 0.86, goldenFactor);
    u.nightBlend.value = nightFactor;
    u.intensity.value = lerp(0.28, 0.48, dayFactor) * a.skyDim * (1 - overcast * 0.35);
    const moonUp = clamp(Math.sin(Math.max(0, this.moonElevation)) * 3, 0, 1);
    u.moonIntensity.value = moonUp * nightFactor * (0.3 + 0.7 * moon.illumination) * (1 - overcast);
    u.cloudCover.value = a.cloudCover;
    u.cloudDark.value = a.cloudDark;
    u.cirrus.value = a.cirrus * (1 - a.haze * 0.8);
    u.cityGlow.value = nightFactor * (0.35 + overcast * 0.6);
    u.cloudGolden.value = goldenFactor * (1 - overcast);
    if (a.wind && (a.wind.x || a.wind.y)) u.cloudWind.value.set(a.wind.x, a.wind.y);
    u.skyClear.value = clamp(1 - overcast * 1.2 - a.haze * 0.8, 0, 1);
    u.flash.value = a.flash;

    this.stars.material.uniforms.uOpacity.value = nightFactor * (1 - overcast) * (1 - a.haze * 0.85) * 0.95;
    this.stars.material.uniforms.uScale.value = window.devicePixelRatio > 1.5 ? 1.6 : 1.1;
    const moonVis = moonUp * clamp(1 - dayFactor * 0.75, 0, 1) * (1 - overcast) * (1 - a.haze * 0.7);
    this.moonMaterial.uniforms.uOpacity.value = moonVis;
    this.moonMaterial.uniforms.uSunDir.value.copy(this.sunDirection);
    this.moon.visible = moonVis > 0.01;

    // ---- sun colour temperature (smooth ramp) ----
    const sc = this._tmpColor;
    const t = smoothstep(-0.02, 0.5, elev);
    sc.setRGB(1.0, lerp(0.38, 0.96, Math.pow(t, 0.8)), lerp(0.14, 0.90, Math.pow(t, 1.1)));
    if (elev < 0) sc.setRGB(0.5, 0.26, 0.16);
    this.sunLight.color.copy(sc);
    const dim = a.sunDim * (1 - overcast * 0.8);
    this.sunLight.intensity = lerp(0.0, 4.4, smoothstep(-0.05, 0.45, elev)) * dim;
    this.sunLight.visible = this.sunLight.intensity > 0.01;
    u.cloudSun.value.copy(sc).multiplyScalar(lerp(0.05, 0.85, dayFactor) * (0.4 + 0.6 * a.sunDim));
    u.cloudSun.value.lerp(new THREE.Color(0.06, 0.07, 0.1), nightFactor * 0.8);
    u.cloudAmbient.value.setRGB(lerp(0.03, 0.42, dayFactor), lerp(0.035, 0.45, dayFactor), lerp(0.05, 0.5, dayFactor));
    u.cloudAmbient.value.lerp(a.hazeColor, a.haze * 0.6);

    this.moonLight.intensity = nightFactor * moonUp * (0.25 + 0.75 * moon.illumination) * 0.7 * (1 - overcast * 0.8);
    this.moonLight.visible = this.moonLight.intensity > 0.005;

    // Sky bounce: with an IBL environment present the hemisphere light only
    // fills in; without one (no renderer) it carries the full ambient.
    const hemiScale = this.envEnabled ? 0.45 : 1.0;
    this.hemi.intensity = lerp(0.14, 0.5, dayFactor) * hemiScale * (0.6 + 0.4 * a.skyDim) + overcast * 0.12;
    this.hemi.color.setRGB(lerp(0.30, 0.64, dayFactor), lerp(0.36, 0.76, dayFactor), lerp(0.55, 1.0, dayFactor));
    this.hemi.groundColor.setRGB(lerp(0.10, 0.74, dayFactor), lerp(0.09, 0.6, dayFactor), lerp(0.10, 0.42, dayFactor));
    this.ambient.intensity = lerp(0.07, 0.04, dayFactor) + a.flash * 3;

    // ---- fog / horizon ----
    const horizon = this.horizonColor;
    // Mornings are cooler and clearer (peach and blue) than the dusty, amber evenings.
    const morning = this.hour < 12.5 ? 1 : 0;
    const gold = this._c1 || (this._c1 = new THREE.Color());
    gold.setRGB(0.95, 0.55, 0.30).lerp(this._c1m || (this._c1m = new THREE.Color(0.86, 0.70, 0.60)), morning);
    horizon.setRGB(0.05, 0.065, 0.11)
      .lerp(gold, goldenFactor)
      .lerp(this._c2 || (this._c2 = new THREE.Color(0.84, 0.77, 0.64)), dayFactor * (1 - goldenFactor * 0.75));
    if (a.fogColor && a.fogColorMix > 0) {
      const wc = this._c3 || (this._c3 = new THREE.Color());
      wc.copy(a.fogColor).multiplyScalar(lerp(0.12, 1.0, dayFactor));
      horizon.lerp(wc, clamp(a.fogColorMix, 0, 1));
    }
    this.fog.color.copy(horizon);
    // Desert haze is denser in the afternoon heat and through golden hour.
    this.fog.density = (lerp(0.00014, 0.00008, dayFactor) + goldenFactor * (morning ? 0.00002 : 0.000032) + noonFactor * 0.000015) * a.fogDensity;
    u.hazeColor.value.copy(horizon).multiplyScalar(1 / Math.max(0.3, u.intensity.value * 2.1));
    u.hazeAmount.value = clamp(a.haze + (a.fogDensity - 1) * 0.08, 0, 1);
    u.groundColor.value.copy(u.hazeColor.value).multiplyScalar(0.92);

    FOG_UNIFORMS.hddFogA[0] = this.sunDirection.x;
    FOG_UNIFORMS.hddFogA[1] = this.sunDirection.y;
    FOG_UNIFORMS.hddFogA[2] = this.sunDirection.z;
    FOG_UNIFORMS.hddFogA[3] = (0.35 + goldenFactor * (morning ? 0.3 : 0.45)) * dayFactor * dim;
    FOG_UNIFORMS.hddFogB[0] = 0.0011;
    FOG_UNIFORMS.hddFogB[1] = a.groundFog;
    FOG_UNIFORMS.hddFogB[2] = a.groundFogFalloff;
    FOG_UNIFORMS.hddFogB[3] = 1;
    FOG_UNIFORMS.hddFogC[0] = sc.r * 1.15;
    FOG_UNIFORMS.hddFogC[1] = sc.g * 1.0;
    FOG_UNIFORMS.hddFogC[2] = sc.b * 0.85;

    let phase = 'night';
    for (const [h, name] of PHASES) {
      if (this.hour < h) {
        phase = name;
        break;
      }
    }
    if (dayFactor > 0.5 && phase === 'night') phase = 'day';
    const s = this.state;
    s.phase = phase;
    s.dayFactor = dayFactor;
    s.nightFactor = nightFactor;
    s.goldenFactor = goldenFactor;
    s.lightsFactor = clamp(1 - smoothstep(0.02, 0.14, elev) + a.lightsBoost + overcast * 0.35, 0, 1);
    s.torchFactor = s.lightsFactor;
    s.elevationDeg = elev * DEG;
    s.azimuthDeg = sun.azimuth * DEG;
    s.moonIllumination = moon.illumination;
    s.moonElevationDeg = moon.altitude * DEG;
    s.equationOfTime = sun.equationOfTime;
  }

  /* ---------------------------------------------------------------- IBL */

  _envSignature() {
    const a = this.atmosphere;
    const q = (v, s = 20) => Math.round(v * s);
    return `${q(a.cloudCover)}:${q(a.cloudDark)}:${q(a.haze)}:${q(a.sunDim)}:${q(a.skyDim)}:${q(a.fogColorMix)}`;
  }

  _maybeRefreshEnvironment(force = false) {
    if (!this.envEnabled) return;
    if (!force && this._envTimer < this._envMinInterval) return;
    const moved = this._envSun.angleTo(this.sunDirection) > (this._envThreshold || 2 * RAD) || this._envSun.y < -1;
    const sig = this._envSignature();
    if (!force && !moved && sig === this._envSig && !this._envDirty) return;
    this._envTimer = 0;
    this._envDirty = false;
    this._envSun.copy(this.sunDirection);
    this._envSig = sig;
    this._renderEnvironment();
  }

  /** Force an immediate PMREM refresh (e.g. after a scripted time jump). */
  refreshEnvironment() {
    this._maybeRefreshEnvironment(true);
  }

  _renderEnvironment() {
    const u = this.material.uniforms;
    // Ground in the environment: sand lit by sun + sky.
    const day = this.state.dayFactor;
    const sunI = this.sunLight.intensity * Math.max(0, this.sunDirection.y);
    const g = this._envGroundMat.color;
    g.setRGB(0.42, 0.34, 0.24).multiplyScalar((sunI * 0.32 + this.hemi.intensity * 0.5 + 0.01) * 1.3);
    g.lerp(this.fog.color, 0.25 * day);
    const disc = u.sunDiscScale.value;
    u.sunDiscScale.value = 0;   // the directional light already carries the sun's highlight
    // Boost the sky radiance seen by the IBL: the dome is graded for display,
    // the environment must carry the full skylight that fills desert shadows.
    u.envBoost.value = this.envBoost;
    const rt = this._pmrem.fromScene(this._envScene, 0, 0.1, 1000);
    u.envBoost.value = 1;
    u.sunDiscScale.value = disc;
    const old = this._envRT;
    this._envRT = rt;
    this.envMap = rt.texture;
    this.scene.environment = rt.texture;
    if (old) old.dispose();
  }

  /* ------------------------------------------------------------ follow */

  /**
   * Fit the shadow frustum to the part of the view that can show shadows.
   * When the camera looks down at the ground from altitude (manager/drone
   * views) the slice is centred on the look-at point on the ground instead of
   * the near plane, so overview shots keep crisp shadows under buildings.
   * Bounding sphere → rotation-invariant extents; centre snapped to texels.
   */
  _fitShadowCamera(camera) {
    const s = this.quality.settings;
    const base = s.shadowDistance;
    camera.updateMatrixWorld();
    const fwd = camera.getWorldDirection(this._fwd);
    let near = camera.near;
    let far = Math.min(base, camera.far);
    const h = camera.position.y;
    if (fwd.y < -0.05 && h > 30) {
      const D = h / -fwd.y;              // distance to the ground along the view axis
      const span = base * (0.6 + clamp(h / 1500, 0, 1) * 1.2);
      near = Math.max(camera.near, D - span);
      far = Math.min(camera.far, D + span * 0.7);
    }
    const tanV = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const tanH = tanV * camera.aspect;
    const corners = this._shadowCorners;
    let i = 0;
    for (const dist of [near, far]) {
      const hh = tanV * dist;
      const ww = tanH * dist;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners[i++].set(sx * ww, sy * hh, -dist).applyMatrix4(camera.matrixWorld);
    }
    const centre = this._shadowCentre.set(0, 0, 0);
    for (const c of corners) centre.add(c);
    centre.multiplyScalar(1 / 8);
    let radius = 0;
    for (const c of corners) radius = Math.max(radius, c.distanceTo(centre));
    radius = Math.max(40, Math.ceil(radius / 16) * 16);  // quantised: no swimming from radius jitter

    const texelWorld = (radius * 2) / s.shadowMapSize;
    const up = Math.abs(this.sunDirection.y) > 0.98 ? this._altUp : this._up;
    const right = this._right.crossVectors(up, this.sunDirection).normalize();
    const trueUp = this._trueUp.crossVectors(this.sunDirection, right).normalize();
    const alongRight = Math.round(centre.dot(right) / texelWorld) * texelWorld;
    const alongUp = Math.round(centre.dot(trueUp) / texelWorld) * texelWorld;
    const alongDir = centre.dot(this.sunDirection);
    centre.copy(right).multiplyScalar(alongRight).addScaledVector(trueUp, alongUp).addScaledVector(this.sunDirection, alongDir);

    const back = radius + 200;
    this.sunTarget.position.copy(centre);
    this.sunTarget.updateMatrixWorld();
    this.sunLight.position.copy(centre).addScaledVector(this.sunDirection, back);
    this.sunLight.updateMatrixWorld();
    const cam = this.sunLight.shadow.camera;
    const newFar = back + radius + 200;
    if (cam.right !== radius || cam.far !== newFar) {
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.near = 1;
      cam.far = newFar;
      cam.updateProjectionMatrix();
    }
    // Keep depth bias proportional to texel size.
    this.sunLight.shadow.normalBias = clamp(texelWorld * 0.9, 0.03, 1.2);
  }

  /** Keep the dome, stars, moon and shadow frustum centred on the viewer. */
  follow(camera) {
    const far = camera.far * 0.94;
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(far);

    // Stars: equatorial → horizontal (LST, latitude) → world (runway frame).
    const lst = siderealTime(this.instant);
    const lat = GEO.latitude * RAD;
    const off = GEO.northOffsetDeg * RAD;
    const cL = Math.cos(lst);
    const sL = Math.sin(lst);
    const cP = Math.cos(lat);
    const sP = Math.sin(lat);
    // rows: east, up, north as functions of equatorial (ex, ey, ez)
    const E = [-sL, cL, 0];
    const U = [cP * cL, cP * sL, sP];
    const N = [-sP * cL, -sP * sL, cP];
    const co = Math.cos(off);
    const so = Math.sin(off);
    const wx = E.map((e, k) => e * co - N[k] * so);
    const wz = E.map((e, k) => -(N[k] * co + e * so));
    const r = far * 0.96;
    this.stars.matrix.set(
      wx[0] * r, wx[1] * r, wx[2] * r, camera.position.x,
      U[0] * r, U[1] * r, U[2] * r, camera.position.y,
      wz[0] * r, wz[1] * r, wz[2] * r, camera.position.z,
      0, 0, 0, 1,
    );
    this.stars.matrixWorldNeedsUpdate = true;

    // Moon billboard (apparent diameter exaggerated ×2.2 for legibility).
    const md = far * 0.9;
    this.moon.position.copy(camera.position).addScaledVector(this.moonDirection, md);
    this.moon.scale.setScalar(md * Math.tan(0.26 * RAD) * 2.2);
    this.moon.quaternion.copy(camera.quaternion);
    const mu = this.moonMaterial.uniforms;
    mu.uRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    mu.uUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mu.uToward.value.set(0, 0, 1).applyQuaternion(camera.quaternion);

    const d = this.quality ? this.quality.settings.shadowDistance : 400;
    if (this.quality && this.quality.settings.shadows) {
      this._fitShadowCamera(camera);
    } else {
      this.sunTarget.position.set(camera.position.x, 0, camera.position.z);
      this.sunTarget.updateMatrixWorld();
      this.sunLight.position.copy(this.sunTarget.position).addScaledVector(this.sunDirection, d * 2.6);
      this.sunLight.updateMatrixWorld();
    }
    this.moonTarget.position.set(camera.position.x, 0, camera.position.z);
    this.moonTarget.updateMatrixWorld();
    this.moonLight.position.copy(this.moonTarget.position).addScaledVector(this.moonDirection, d * 2.6);
    this.moonLight.updateMatrixWorld();

    this.sunWorld.copy(camera.position).addScaledVector(this.sunDirection, far * 0.85);
  }

  /** Formatted local clock (PKT) for the HUD. */
  clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  dispose() {
    if (this._offQuality) this._offQuality();
    this.scene.remove(this.dome, this.stars, this.moon, this.sunLight, this.sunTarget, this.moonLight, this.moonTarget, this.hemi, this.ambient);
    if (this.scene.fog === this.fog) this.scene.fog = null;
    if (this._envRT) {
      if (this.scene.environment === this._envRT.texture) this.scene.environment = null;
      this._envRT.dispose();
    }
    if (this._pmrem) this._pmrem.dispose();
    if (this._envGround) {
      this._envGround.geometry.dispose();
      this._envGroundMat.dispose();
    }
    this.sunLight.dispose();
    this.moonLight.dispose();
    this.dome.geometry.dispose();
    this.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.moon.geometry.dispose();
    this.moonMaterial.dispose();
    if (this.scene.userData.sky === this) delete this.scene.userData.sky;
  }
}
