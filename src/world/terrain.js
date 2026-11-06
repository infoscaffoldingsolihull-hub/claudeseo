import * as THREE from 'three';
import { fbm2, smoothstep, clamp, makeRng, hash2i } from '../engine/noise.js';
import { MASTERPLAN } from './layout.js';
import { tileFbm, Vegetation } from './props.js';

/**
 * The Indus alluvial plain around Hyderabad Airport.
 *
 * Locally flat (~41 m AMSL mapped to y = 0) inside and around the airfield so
 * every pavement layer sits exactly on the ground; outside, very gentle swells
 * and, far to the west-north-west, the low limestone ridge the old city stands
 * on. One analytic function — terrainHeight — is shared by collision, the
 * mesh and every placement routine.
 *
 * The ground shader is world-space procedural: ochre silt, paler dust, olive
 * dry-grass patches, a compacted graded strip around the runway, irrigated
 * farm plots outside the fence and greyer urban ground under the city.
 */

const P = MASTERPLAN.perimeter;

/** Distance (m) outside the flat airfield zone (0 inside). */
function outsideFlat(x, z) {
  const dx = Math.max(P.x0 - 250 - x, 0, x - (P.x1 + 250));
  const dz = Math.max(P.z0 - 250 - z, 0, z - (P.z1 + 250));
  return Math.hypot(dx, dz);
}

/** Urban density 0..1 (simulated city footprint: generic, no landmarks). */
const CITY_BLOBS = [
  { x: -5600, z: -450, r: 5200, w: 1.0 },
  { x: -2900, z: 3300, r: 2600, w: 0.9 },
  { x: -3700, z: -4300, r: 2600, w: 0.7 },
  { x: -2500, z: -1500, r: 1900, w: 0.9 },
  { x: -2100, z: 1300, r: 1500, w: 0.75 },
  { x: -7600, z: 2600, r: 2400, w: 0.6 },
];
export function cityDensity(x, z) {
  let d = 0;
  for (const b of CITY_BLOBS) {
    const r = Math.hypot(x - b.x, z - b.z) / b.r;
    d = Math.max(d, b.w * Math.exp(-r * r * 1.6));
  }
  const n = fbm2(x * 0.0006, z * 0.0006, 3, 2, 0.5, 501);
  d *= 0.8 + n * 0.45;
  // Keep the airport, its approaches and buffer clear.
  const out = outsideFlat(x, z);
  d *= smoothstep(150, 900, out);
  // Approach funnels beyond each runway end stay open land.
  if (Math.abs(x) < 900 && (z > P.z1 || z < P.z0)) d *= smoothstep(250, 900, Math.abs(x));
  return clamp(d * 1.25, 0, 1);
}

export function farmDensity(x, z) {
  const out = outsideFlat(x, z);
  if (out < 60) return 0;
  const n = fbm2(x * 0.0009 + 3, z * 0.0009, 3, 2, 0.5, 611);
  const city = cityDensity(x, z);
  const east = smoothstep(-400, 1200, x) * 0.5 + 0.5;
  return clamp((smoothstep(0.38, 0.55, n) * east) * (1 - city * 1.6) * smoothstep(60, 250, out), 0, 1);
}

/** THE ground. */
export function terrainHeight(x, z) {
  const out = outsideFlat(x, z);
  if (out <= 0) return 0;
  const ramp = smoothstep(0, 900, out);
  let h = (fbm2(x * 0.0007, z * 0.0007, 3, 2, 0.5, 71) - 0.5) * 5 * ramp;
  // The old city's limestone ridge, far to the WNW (gentle, low).
  const rx = x + 6800; const rz = z + 900;
  const along = rx * 0.4 + rz * 0.92; const across = rx * 0.92 - rz * 0.4;
  h += 28 * Math.exp(-(across * across) / (1800 * 1800)) * smoothstep(-9000, -3000, -Math.abs(along)) * ramp;
  return h;
}

/** Where the scrub lives (0 on graded/paved/built ground). */
export function gradedMask(x, z) {
  // Runway strip + extension + RESA.
  let g = 0;
  if (z > -1450 && z < 2780) g = Math.max(g, smoothstep(170, 120, Math.abs(x)));
  // Taxiway corridor.
  if (z > -1250 && z < 2500) g = Math.max(g, smoothstep(70, 40, Math.abs(x + 182.5)));
  // Built-up apron / terminal / landside platform.
  const bx = Math.max(-720 - x, 0, x - -160); const bz = Math.max(-560 - z, 0, z - 660);
  g = Math.max(g, smoothstep(60, 0, Math.hypot(bx, bz)));
  return g;
}

function warpAxis(u) {
  const a = Math.abs(u);
  return Math.sign(u) * (0.2 * a + 0.8 * a * a * a);
}

const VERT_PATCH = `
attribute vec4 aMask;
varying vec4 vMask;
varying vec2 vWxz;
`;

/*
 * Shared GLSL: where the airfield is paved or built (no grass), where the
 * runway strip / taxiway corridor is (mown strip grass), and where the
 * landside verges are irrigated (green). Used by the ground shader and the
 * grass-tuft vertex shader so the tufts grow exactly on the grassy ground.
 */
const ZONES_GLSL = `
float hddSegDist( vec2 p, vec2 a, vec2 b ) {
  vec2 ab = b - a; float t = clamp( dot( p - a, ab ) / dot( ab, ab ), 0.0, 1.0 );
  return length( p - a - ab * t );
}
float hddBox( vec2 p, vec4 r, float soft ) {
  vec2 d = max( vec2( r.x - p.x, r.z - p.y ), vec2( p.x - r.y, p.y - r.w ) );
  return 1.0 - smoothstep( 0.0, soft, max( d.x, d.y ) );
}
float hddRoadDist( vec2 p ) {
  float d = hddSegDist( p, vec2( -640.0, -230.0 ), vec2( -668.0, -165.0 ) );
  d = min( d, hddSegDist( p, vec2( -668.0, -165.0 ), vec2( -760.0, -110.0 ) ) );
  d = min( d, hddSegDist( p, vec2( -760.0, -110.0 ), vec2( -900.0, -77.0 ) ) );
  d = min( d, hddSegDist( p, vec2( -900.0, -77.0 ), vec2( -1500.0, -261.0 ) ) );
  d = min( d, hddSegDist( p, vec2( -1500.0, -261.0 ), vec2( -2600.0, -600.0 ) ) );
  d = min( d, hddSegDist( p, vec2( -2600.0, -600.0 ), vec2( -3600.0, -840.0 ) ) );
  return d;
}
// 1 on pavements / buildings / site compounds (no vegetation).
float hddPaved( vec2 p ) {
  float k = 0.0;
  if ( p.y > -1260.0 && p.y < 2600.0 ) k = max( k, 1.0 - step( 31.0, abs( p.x ) ) );
  if ( p.y > -1200.0 && p.y < 2460.0 ) k = max( k, 1.0 - step( 19.0, abs( p.x + 182.5 ) ) );
  if ( p.x > -190.0 && p.x < 0.0 ) {
    float c = min( min( abs( p.y + 1120.0 ), abs( p.y + 420.0 ) ), min( abs( p.y - 120.0 ), abs( p.y - 690.0 ) ) );
    c = min( c, min( abs( p.y - 1300.0 ), abs( p.y - 2380.0 ) ) );
    k = max( k, 1.0 - step( 16.0, c ) );
    float r = min( hddSegDist( p, vec2( 0.0, -150.0 ), vec2( -182.5, -420.0 ) ), hddSegDist( p, vec2( 0.0, 420.0 ), vec2( -182.5, 690.0 ) ) );
    k = max( k, 1.0 - step( 16.0, r ) );
  }
  k = max( k, step( 0.5, hddBox( p, vec4( -720.0, -160.0, -560.0, 660.0 ), 1.0 ) ) );
  k = max( k, step( 0.5, hddBox( p, vec4( 250.0, 630.0, -210.0, 710.0 ), 1.0 ) ) );
  k = max( k, step( 0.5, hddBox( p, vec4( 240.0, 440.0, 1400.0, 1970.0 ), 1.0 ) ) );
  k = max( k, 1.0 - step( 9.0, hddRoadDist( p ) ) );
  return k;
}
// Runway strip and taxiway corridor: mown grass.
float hddStrip( vec2 p ) {
  float s = 0.0;
  if ( p.y > -1450.0 && p.y < 2780.0 ) s = max( s, 1.0 - smoothstep( 120.0, 150.0, abs( p.x ) ) );
  if ( p.y > -1250.0 && p.y < 2500.0 ) s = max( s, 1.0 - smoothstep( 45.0, 62.0, abs( p.x + 182.5 ) ) );
  return s;
}
// Irrigated landside verges (green): along the access road and the forecourt approach.
float hddVerge( vec2 p ) {
  float rd = hddRoadDist( p );
  float v = ( 1.0 - smoothstep( 22.0, 34.0, rd ) ) * smoothstep( 8.0, 11.0, rd ) * ( 1.0 - smoothstep( -2600.0, -3400.0, p.x ) );
  v = max( v, hddBox( p, vec4( -900.0, -720.0, -320.0, 300.0 ), 40.0 ) * 0.85 );
  return v;
}
`;

const FRAG_HEAD = `
uniform sampler2D uNoise;
uniform vec3 uSoilA; uniform vec3 uSoilB; uniform vec3 uSoilC; uniform vec3 uGrass; uniform vec3 uGraded;
uniform vec3 uCrop1; uniform vec3 uCrop2; uniform vec3 uFallow; uniform vec3 uMustard; uniform vec3 uUrban;
uniform vec3 uStraw; uniform vec3 uGreen; uniform vec3 uSunDir; uniform vec4 uCloud;
uniform float uWet;
varying vec4 vMask;
varying vec2 vWxz;
float hddH = 0.0;
${ZONES_GLSL}
`;
const FRAG_BODY = `
  vec2 w = vWxz;
  float camD = length( cameraPosition - vec3( w.x, 0.0, w.y ) );
  float nearK = 1.0 - smoothstep( 40.0, 220.0, camD );
  vec4 n0 = texture2D( uNoise, w / 4100.0 + 0.13 );
  vec4 n1 = texture2D( uNoise, w / 1500.0 );
  vec4 n2 = texture2D( uNoise, w / 270.0 + 0.31 );
  vec4 n3 = texture2D( uNoise, w / 43.0 + 0.67 );
  vec4 n4 = texture2D( uNoise, w / 6.5 );
  vec4 n5 = texture2D( uNoise, w / 1.31 + 0.5 );
  vec4 n6 = texture2D( uNoise, w / 0.29 + 0.21 );
  // ---- sand & silt: macro variation (kills tiling), crusts, pale blown sand
  float macro = n1.r * 0.5 + n2.g * 0.3 + n0.b * 0.2;
  vec3 soil = mix( uSoilA, uSoilB, smoothstep( 0.36, 0.7, macro ) );
  float blown = smoothstep( 0.48, 0.74, n2.b * 0.65 + n0.r * 0.35 );
  soil = mix( soil, uSoilC, blown * 0.8 );
  soil *= 0.86 + 0.28 * n0.g;
  // Wind ripples (~0.9 m) in the loose, pale sand, fading with distance.
  vec2 rd = vec2( 0.81, 0.59 );
  float rip = sin( dot( w, rd ) * 7.0 + n3.r * 14.0 + n4.b * 4.0 );
  float ripK = blown * nearK * vMask.r;
  soil *= 1.0 + rip * 0.05 * ripK;
  // Grain, pebbles and darker crust specks.
  float grainK = 1.0 - smoothstep( 6.0, 45.0, camD );
  soil *= 0.88 + 0.24 * mix( 0.5, n5.a, nearK * 0.8 + 0.2 );
  soil *= 1.0 + ( n6.b - 0.5 ) * 0.28 * grainK;
  soil *= 1.0 - smoothstep( 0.7, 0.78, n5.r ) * 0.3 * ( 0.4 + 0.6 * nearK );
  soil *= 1.0 - smoothstep( 0.74, 0.8, n6.r ) * 0.35 * grainK;
  soil = mix( soil, uSoilC * 1.08, smoothstep( 0.76, 0.82, n6.g ) * 0.5 * grainK );
  hddH = rip * 0.018 * ripK + ( n4.g - 0.5 ) * 0.06 + ( n5.a - 0.5 ) * 0.012 * nearK + ( n6.a - 0.5 ) * 0.004 * grainK;
  // ---- wild dry grass: patchy olive/straw tussocks with sand between
  float gPatch = smoothstep( 0.42, 0.62, n2.r * 0.42 + n3.g * 0.43 + n4.b * 0.15 ) * vMask.r;
  float gCov = gPatch * smoothstep( 0.25, 0.62, n4.a * 0.6 + n5.b * 0.4 + gPatch * 0.25 );
  vec3 wild = mix( uGrass, uStraw, smoothstep( 0.3, 0.75, n3.a ) );
  wild *= 0.78 + 0.36 * n5.g;
  soil = mix( soil, wild, gCov * 0.92 );
  hddH += gCov * ( n5.g - 0.3 ) * 0.025 * nearK;
  // ---- runway strip / taxiway corridor: mown grass, green and straw patches
  float strip = hddStrip( w ) * ( 1.0 - clamp( vMask.a, 0.0, 1.0 ) );
  float verge = hddVerge( w );
  float greenAmt = smoothstep( 0.35, 0.7, n2.a * 0.6 + n3.b * 0.4 );
  vec3 mown = mix( uStraw * 0.92, uGreen, greenAmt * 0.75 );
  mown *= 0.8 + 0.3 * n4.r;
  float bare = smoothstep( 0.6, 0.78, n3.r * 0.6 + n2.b * 0.4 ) * 0.7;
  float sCov = strip * ( 1.0 - bare ) * smoothstep( 0.15, 0.5, n5.b * 0.5 + n4.a * 0.5 + 0.2 );
  soil = mix( soil, mown, clamp( sCov, 0.0, 1.0 ) );
  // Irrigated landside verges: lush and green.
  vec3 lush = uGreen * ( 0.85 + 0.3 * n4.g ) * mix( vec3( 1.0 ), vec3( 0.86, 1.08, 0.86 ), n3.a );
  float vCov = verge * smoothstep( 0.2, 0.5, n5.b * 0.5 + n4.a * 0.5 + 0.15 );
  soil = mix( soil, lush, clamp( vCov, 0.0, 1.0 ) );
  hddH += ( sCov + vCov ) * ( n5.g - 0.5 ) * 0.02 * nearK;
  // ---- graded platform (apron / terminal works): compacted pale earth with tyre tracks
  float graded = clamp( vMask.g, 0.0, 1.0 ) * ( 1.0 - strip * 0.85 );
  float tracks = smoothstep( 0.6, 0.9, sin( dot( w, vec2( 0.0, 1.0 ) ) * 1.6 + n3.r * 6.0 ) ) * smoothstep( 0.55, 0.7, n2.g );
  soil = mix( soil, uGraded * ( 0.9 + 0.16 * n3.b ) * ( 1.0 - tracks * 0.08 ), graded * 0.7 );
  if ( vMask.b > 0.01 ) {
    float ca = 0.446; // fields follow true north, not the runway
    vec2 rw = vec2( w.x * cos( ca ) - w.y * sin( ca ), w.x * sin( ca ) + w.y * cos( ca ) );
    vec2 fc = rw / vec2( 95.0, 150.0 );
    vec2 cell = floor( fc ); vec2 f = fract( fc );
    float h = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    vec3 crop = h < 0.32 ? uCrop1 : ( h < 0.55 ? uCrop2 : ( h < 0.8 ? uFallow : uMustard ) );
    crop *= 0.82 + 0.34 * n3.r;
    float rows = sin( ( h > 0.5 ? f.x * 95.0 : f.y * 150.0 ) * 2.4 );
    crop *= 0.92 + 0.08 * rows;
    float edge = smoothstep( 0.0, 0.02, f.x ) * smoothstep( 1.0, 0.98, f.x ) * smoothstep( 0.0, 0.015, f.y ) * smoothstep( 1.0, 0.985, f.y );
    float farm = smoothstep( 0.0, 0.6, vMask.b ) * step( 0.08, h );
    soil = mix( soil, crop, farm * mix( 0.55, 1.0, edge ) );
    hddH += farm * rows * 0.02 * nearK;
  }
  soil = mix( soil, uUrban * ( 0.88 + 0.24 * n3.r ), clamp( vMask.a, 0.0, 1.0 ) * 0.55 );
  soil *= 0.86 + 0.28 * n4.g;
  // Drifting cloud shadows (projected along the sun from the cloud deck).
  if ( uCloud.w > 0.001 ) {
    vec2 cp = w + uSunDir.xz / max( uSunDir.y, 0.2 ) * 1400.0;
    float cs = texture2D( uNoise, cp / 5200.0 + uCloud.xy ).r * 0.65 + texture2D( uNoise, cp / 1700.0 + uCloud.xy * 1.7 ).g * 0.35;
    float lo = 0.66 - uCloud.z * 0.5;
    soil *= 1.0 - smoothstep( lo, lo + 0.06, cs ) * uCloud.w;
  }
  soil *= 1.0 - uWet * 0.35;
  diffuseColor.rgb *= soil;
`;
// Procedural micro-relief → perturbed normal (screen-space derivative bump).
const NORMAL_BODY = `
  {
    vec3 dpx = dFdx( -vViewPosition ); vec3 dpy = dFdy( -vViewPosition );
    float hx = dFdx( hddH ); float hy = dFdy( hddH );
    vec3 r1 = cross( dpy, normal ); vec3 r2 = cross( normal, dpx );
    float det = dot( dpx, r1 );
    vec3 grad = sign( det ) * ( hx * r1 + hy * r2 ) * 0.45;
    normal = normalize( abs( det ) * normal - grad );
  }
`;

/* ============================================================ GrassField */

const GRASS_VERT = `
attribute vec2 aCell;
attribute float aTip;
uniform vec2 uOrigin;
uniform float uCellSize;
uniform float uRadius;
uniform float uTime;
uniform float uKind;
uniform vec2 uWind;
uniform sampler2D uNoise;
varying float vTip;
varying vec3 vTint;
${ZONES_GLSL}
float gh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
`;
const GRASS_BEGIN = `
  vec2 cell = uOrigin + aCell;
  float h1 = gh( cell ); float h2 = gh( cell + 17.31 ); float h3 = gh( cell + 41.7 ); float h4 = gh( cell + 73.1 );
  vec2 wp = ( cell + vec2( h1, h2 ) ) * uCellSize;
  vec4 m2 = textureLod( uNoise, wp / 270.0 + 0.31, 0.0 );
  vec4 m3 = textureLod( uNoise, wp / 43.0 + 0.67, 0.0 );
  vec4 m4 = textureLod( uNoise, wp / 6.5, 0.0 );
  float paved = hddPaved( wp );
  float strip = hddStrip( wp );
  float verge = hddVerge( wp );
  float wild = smoothstep( 0.42, 0.62, m2.r * 0.42 + m3.g * 0.43 + m4.b * 0.15 );
  float dens;
  float green;
  if ( uKind < 0.5 ) {
    dens = max( max( wild * 0.9, strip * 0.75 ), verge * 0.95 ) * ( 1.0 - paved );
    green = max( verge, strip * smoothstep( 0.35, 0.7, m2.a ) * 0.7 );
  } else {
    // Shrubs: wild ground only, sparse, never on the mown strip.
    dens = ( 0.05 + wild * 0.3 ) * ( 1.0 - paved ) * ( 1.0 - strip ) * ( 1.0 - verge * 0.7 );
    green = verge * 0.5;
  }
  float clump = uKind < 0.5 ? smoothstep( 0.25, 0.75, m4.a * 0.7 + m3.b * 0.3 ) * 1.5 : 1.0;
  float keep = step( h3, dens * clump );
  float d = distance( wp, cameraPosition.xz );
  float fade = 1.0 - smoothstep( uRadius * 0.55, uRadius * 0.95, d );
  float s = keep * fade * ( 0.6 + 0.8 * h4 ) * ( uKind < 0.5 ? mix( 1.0, 0.7, strip ) : 1.0 );
  float a = h1 * 6.2832;
  float ca = cos( a ); float sa = sin( a );
  vec3 p = position * s;
  p.xz = mat2( ca, -sa, sa, ca ) * p.xz;
  float sway = sin( uTime * 1.9 + wp.x * 0.35 + wp.y * 0.21 ) + 0.5 * sin( uTime * 3.7 + wp.y * 0.6 );
  p.xz += uWind * aTip * aTip * sway * s * ( uKind < 0.5 ? 0.09 : 0.03 );
  vec3 transformed = vec3( wp.x + p.x, p.y - 0.02, wp.y + p.z );
  vTip = aTip;
  vec3 straw = vec3( 0.86, 0.76, 0.5 ); vec3 olive = vec3( 0.62, 0.62, 0.34 ); vec3 lushG = vec3( 0.4, 0.56, 0.2 );
  vTint = mix( mix( straw, olive, m3.a ), lushG, green ) * ( 0.85 + 0.3 * h2 );
  if ( uKind > 0.5 ) vTint = mix( vec3( 0.44, 0.5, 0.28 ), vec3( 0.6, 0.56, 0.38 ), h4 ) * ( 0.8 + 0.35 * h2 );
`;

/**
 * Instanced grass tufts (or shrubs) on a camera-centred grid of world cells.
 * Every cell is fixed in the world (hash-jittered), so nothing swims as the
 * camera moves; the vertex shader decides from the same zone masks as the
 * ground shader whether a tuft grows there, and shrinks tufts to nothing
 * towards the grid edge (distance LOD). No per-frame CPU work but a uniform.
 */
class GrassField {
  constructor(scene, noise, { kind = 0, grid = 64, cell = 1.6, name = 'grass' } = {}) {
    const rng = makeRng(kind ? 515 : 313);
    const pos = []; const tip = []; const col = [];
    if (kind === 0) {
      // A tussock: 16 thin blades (one tapered triangle each), splayed outwards.
      const blades = 16;
      for (let i = 0; i < blades; i++) {
        const a = rng() * Math.PI * 2;
        const r0 = rng() * 0.07;
        const lean = 0.05 + rng() * 0.25;
        const h = 0.22 + rng() * 0.32;
        const w = 0.012 + rng() * 0.01;
        const dx = Math.cos(a); const dz = Math.sin(a);
        const px = -dz * w; const pz = dx * w;
        const bx = dx * r0; const bz = dz * r0;
        pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + dx * lean, h, bz + dz * lean);
        tip.push(0, 0, 1);
      }
    } else {
      // A desert shrub (khip / ak style): a dome of ~70 twiggy blades.
      const twigs = 70;
      for (let i = 0; i < twigs; i++) {
        const a = rng() * Math.PI * 2;
        const el = 0.25 + Math.pow(rng(), 0.7) * 1.2;      // elevation of the twig
        const len = 0.55 + rng() * 0.6;
        const w = 0.03 + rng() * 0.03;
        const dx = Math.cos(a) * Math.cos(el); const dz = Math.sin(a) * Math.cos(el); const dy = Math.sin(el);
        const px = -Math.sin(a) * w; const pz = Math.cos(a) * w;
        const r0 = rng() * 0.12;
        const bx = Math.cos(a) * r0; const bz = Math.sin(a) * r0;
        pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + dx * len, dy * len * 0.85, bz + dz * len);
        tip.push(0, 0, 1);
      }
    }
    for (let i = 0; i < tip.length; i++) col.push(1, 1, 1);
    const base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    base.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
    base.computeVertexNormals();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('aTip', base.attributes.aTip);
    const cells = new Float32Array(grid * grid * 2);
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) { cells[(j * grid + i) * 2] = i; cells[(j * grid + i) * 2 + 1] = j; }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    geo.instanceCount = grid * grid;
    this._base = base;
    this.geometry = geo;
    this.grid = grid;
    this.cell = cell;
    this.uniforms = {
      uOrigin: { value: new THREE.Vector2() }, uCellSize: { value: cell }, uRadius: { value: (grid * cell) / 2 },
      uTime: { value: 0 }, uKind: { value: kind }, uWind: { value: new THREE.Vector2(0.8, 0.6) }, uNoise: { value: noise },
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GRASS_VERT}`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace('#include <begin_vertex>', GRASS_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;\nvarying vec3 vTint;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= vTint * mix( 0.62, 1.15, vTip );`);
    };
    mat.customProgramCacheKey = () => `hdd-grass-${kind}`;
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = name;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  place(camera, time, wind) {
    const c = this.cell;
    this.uniforms.uOrigin.value.set(Math.floor(camera.position.x / c) - (this.grid >> 1), Math.floor(camera.position.z / c) - (this.grid >> 1));
    this.uniforms.uTime.value = time;
    if (wind) this.uniforms.uWind.value.set(wind.x, wind.y);
  }

  dispose() {
    this._base.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

/** Date palms, neem and kikar along the outer access road (irregular, village-road style). */
function roadsideTrees(rng) {
  const path = [[-900, -77], [-1500, -261], [-2600, -600], [-3600, -840], [-5200, -900]];
  const palm = []; const neem = []; const kikar = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]; const [bx, bz] = path[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L; const nz = (bx - ax) / L;
    for (let s = 20; s < L; s += 18 + rng() * 40) {
      if (rng() < 0.25) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (19 + rng() * 9);
      const x = ax + ((bx - ax) * s) / L + nx * off; const z = az + ((bz - az) * s) / L + nz * off;
      if (cityDensity(x, z) > 0.55) continue;
      const t = { x, y: terrainHeight(x, z) - 0.1, z, ry: rng() * 6.28 };
      const r = rng();
      if (r < 0.45) palm.push({ ...t, h: 8 + rng() * 5 });
      else if (r < 0.85) neem.push({ ...t, h: 6 + rng() * 4 });
      else kikar.push({ ...t, h: 4.5 + rng() * 3 });
    }
  }
  return { palm, neem, kikar, scrub: [] };
}

export class TerrainSystem {
  constructor(scene, quality) {
    const seg = Math.max(160, Math.min(240, (quality && quality.settings && quality.settings.terrainSegments) || 200));
    const half = 13000;
    const cx = -600; const cz = 400;
    const n = seg;
    const count = (n + 1) * (n + 1);
    const pos = new Float32Array(count * 3);
    const mask = new Float32Array(count * 4);
    for (let j = 0; j <= n; j++) {
      const z = cz + half * warpAxis(-1 + (2 * j) / n);
      for (let i = 0; i <= n; i++) {
        const x = cx + half * warpAxis(-1 + (2 * i) / n);
        const k = j * (n + 1) + i;
        pos[k * 3] = x; pos[k * 3 + 1] = terrainHeight(x, z) - 0.02; pos[k * 3 + 2] = z;
        const g = gradedMask(x, z);
        const urban = cityDensity(x, z);
        const farm = farmDensity(x, z);
        mask[k * 4] = (1 - g) * (1 - urban) * (0.6 + 0.4 * fbm2(x * 0.004, z * 0.004, 2, 2, 0.5, 9));
        mask[k * 4 + 1] = g;
        mask[k * 4 + 2] = farm;
        mask[k * 4 + 3] = urban;
      }
    }
    const idx = new Uint32Array(n * n * 6);
    let t = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i; const b = a + 1; const c = a + n + 1; const d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    // RGBA tileable noise (four independent fbm channels).
    const NS = 256;
    const data = new Uint8Array(NS * NS * 4);
    for (let y = 0; y < NS; y++) {
      for (let x = 0; x < NS; x++) {
        const o = (y * NS + x) * 4;
        const u = (x / NS) * 8; const v = (y / NS) * 8;
        data[o] = tileFbm(u, v, 8, 4, 11) * 255;
        data[o + 1] = tileFbm(u + 3.1, v, 8, 4, 23) * 255;
        data[o + 2] = tileFbm(u, v + 5.7, 8, 4, 37) * 255;
        data[o + 3] = tileFbm(u * 2, v * 2, 16, 3, 41) * 255;
      }
    }
    this.noise = new THREE.DataTexture(data, NS, NS, THREE.RGBAFormat);
    this.noise.wrapS = this.noise.wrapT = THREE.RepeatWrapping;
    this.noise.magFilter = THREE.LinearFilter;
    this.noise.minFilter = THREE.LinearMipmapLinearFilter;
    this.noise.generateMipmaps = true;
    this.noise.anisotropy = (quality && quality.anisotropy) || 8;
    this.noise.needsUpdate = true;

    const col = (h) => new THREE.Color(h);
    this.uniforms = {
      uNoise: { value: this.noise },
      uSoilA: { value: col('#b59268') }, uSoilB: { value: col('#8a6c4e') }, uSoilC: { value: col('#dcc59c') },
      uGrass: { value: col('#6f7140') }, uGraded: { value: col('#bfa984') },
      uStraw: { value: col('#b7a56c') }, uGreen: { value: col('#587a30') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uCloud: { value: new THREE.Vector4(0, 0, 0.14, 0) },
      uCrop1: { value: col('#56702f') }, uCrop2: { value: col('#71823d') }, uFallow: { value: col('#86694a') },
      uMustard: { value: col('#a99a3a') }, uUrban: { value: col('#9a9184') },
      uWet: { value: 0 },
    };
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = 1;
    this.material.polygonOffsetUnits = 2;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PATCH}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vMask = aMask; vWxz = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_BODY}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL_BODY}`);
    };
    this.material.customProgramCacheKey = () => 'hdd-terrain-2';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    // Grass tussocks and desert shrubs around the camera (count by tier).
    const tier = (quality && quality.tier) || 'medium';
    const grid = { low: 48, medium: 80, high: 104, ultra: 128 }[tier] || 80;
    const shrubGrid = { low: 24, medium: 36, high: 48, ultra: 56 }[tier] || 36;
    this.grass = new GrassField(scene, this.noise, { kind: 0, grid, cell: 1.1, name: 'grass-tufts' });
    this.shrubs = new GrassField(scene, this.noise, { kind: 1, grid: shrubGrid, cell: 9, name: 'shrubs' });
    // Roadside trees on the outer access road.
    const trees = roadsideTrees(makeRng(4711));
    this.roadside = new Vegetation(scene, trees, { seed: 23, shadows: false });
    this.roadside.group.name = 'roadside-trees';
    // Habitat hints for birds and the soundscape (tree groves, farm water).
    const groves = [];
    for (const t of [...trees.palm, ...trees.neem, ...trees.kikar]) if (groves.every((g) => Math.hypot(g[0] - t.x, g[1] - t.z) > 120)) groves.push([t.x, t.z]);
    for (const e of MASTERPLAN.encroachments) groves.push([e.x, e.z]);
    groves.push([-760, -20], [-700, 250]);
    const farms = [];
    for (let z = -6000; z <= 7000 && farms.length < 8; z += 650) {
      for (let x = -1500; x <= 6000 && farms.length < 8; x += 650) {
        if (farmDensity(x, z) > 0.7 && farms.every((f) => Math.hypot(f[0] - x, f[1] - z) > 1500)) farms.push([x, z]);
      }
    }
    scene.userData.habitat = { groves, farms };

    this._t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this._last = this._t0;
    this._wind2 = new THREE.Vector2(0.8, 0.6);
    this.mesh.onBeforeRender = (renderer, scn, camera) => this._frame(scn, camera);
  }

  /** Per-frame upkeep, driven from the terrain's own render callback. */
  _frame(scene, camera) {
    if (!camera || !camera.isPerspectiveCamera) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    const t = (now - this._t0) / 1000;
    const sky = scene && scene.userData ? scene.userData.sky : null;
    const u = this.uniforms;
    if (sky) {
      u.uSunDir.value.copy(sky.sunDirection);
      const a = sky.atmosphere || {};
      const day = sky.state ? sky.state.dayFactor : 1;
      const off = sky._cloudOffset;
      if (off) { u.uCloud.value.x = off.x * 0.06; u.uCloud.value.y = off.y * 0.06; }
      u.uCloud.value.z = a.cloudCover || 0;
      const cov = a.cloudCover || 0;
      u.uCloud.value.w = clamp(cov * 2.5, 0, 1) * (1 - clamp((a.cloudDark || 0) * 1.4, 0, 1)) * day * 0.32;
      if (a.wind) this._wind2.set(a.wind.x, a.wind.y).multiplyScalar(0.25 + Math.min(1, a.wind.length() / 10));
    }
    // Tufts only matter near the ground; above ~140 m they are sub-pixel.
    // The tuft shader assumes the flat airfield zone (y = 0), so stay inside it.
    const cp = camera.position;
    const inFlat = cp.x > P.x0 - 150 && cp.x < P.x1 + 150 && cp.z > P.z0 - 150 && cp.z < P.z1 + 150;
    this.grass.mesh.visible = inFlat && cp.y < 140;
    this.shrubs.mesh.visible = inFlat && cp.y < 420;
    this.grass.place(camera, t, this._wind2);
    this.shrubs.place(camera, t, this._wind2);
    this.roadside.update(dt);
  }

  setWetness(w) { this.uniforms.uWet.value = w; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.noise.dispose();
    this.grass.dispose();
    this.shrubs.dispose();
    this.roadside.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

