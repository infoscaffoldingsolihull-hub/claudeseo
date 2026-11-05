import * as THREE from 'three';

/**
 * Hand-written post-processing chain (A3).
 *
 * The deliverable is ONE offline HTML file, so the chain is implemented
 * directly against WebGLRenderTargets (no EffectComposer add-ons):
 *
 *   scene (HDR half-float, optional MSAA, depth texture)
 *   → TAA resolve            (Ultra: Halton jitter, depth reprojection, YCoCg clamp)
 *   → camera motion blur     (High+: depth reprojection against last frame's camera)
 *   → depth of field         (tour/photo: CoC from depth, half-res golden-angle gather, autofocus)
 *   → SSAO (half res) · bright pass → 3-level gaussian bloom · radial god-rays
 *   → info pass (1×1)        (autofocus distance, sun occlusion for the flare, eye adaptation)
 *   → composite              (ACES, partial auto-exposure, bloom/rays, heat shimmer, lens flare
 *                             (ghosts, halo, anamorphic streak), grade, CA, vignette)
 *   → FXAA + film grain      (or grain in the composite when AA is off)
 *
 * Every pass is gated by the quality tier AND the user's toggle:
 *   postfx.setFeature('bloom'|'godRays'|'ssao'|'dof'|'motionBlur'|'lensFlare'|'grain'|'aa'|'taa'|'autoExposure', on)
 * Looks: postfx.applyLook('exterior'|'interior'|'night'|'dust'|'rain'|'photo'|'auto'|{…}).
 * 'auto' (default) lets the Engine blend looks from sky, weather and interior state.
 */

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const COMMON = /* glsl */ `
float hddLinearDepth( float d, float near, float far ) {
  float z = d * 2.0 - 1.0;
  return 2.0 * near * far / ( far + near - z * ( far - near ) );
}
vec3 hddWorldFromDepth( vec2 uv, float d, mat4 invViewProj ) {
  vec4 p = invViewProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  return p.xyz / p.w;
}
`;

const BRIGHT_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float threshold;
uniform float knee;
void main() {
  // 4-tap box prefilter (anti-firefly) then soft-knee threshold.
  vec2 t = vec2( dFdx( vUv.x ), dFdy( vUv.y ) ) * 0.5;
  vec3 c = texture2D( tDiffuse, vUv + vec2( -t.x, -t.y ) ).rgb + texture2D( tDiffuse, vUv + vec2( t.x, -t.y ) ).rgb
         + texture2D( tDiffuse, vUv + vec2( -t.x, t.y ) ).rgb + texture2D( tDiffuse, vUv + vec2( t.x, t.y ) ).rgb;
  c *= 0.25;
  c = min( c, vec3( 64.0 ) );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float soft = clamp( l - threshold + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-5 );
  float contrib = max( soft, l - threshold ) / max( l, 1e-5 );
  gl_FragColor = vec4( c * contrib, 1.0 );
}
`;

const BLUR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 direction;
void main() {
  vec4 sum = texture2D( tDiffuse, vUv ) * 0.2270270270;
  vec2 o1 = direction * 1.3846153846;
  vec2 o2 = direction * 3.2307692308;
  sum += texture2D( tDiffuse, vUv + o1 ) * 0.3162162162;
  sum += texture2D( tDiffuse, vUv - o1 ) * 0.3162162162;
  sum += texture2D( tDiffuse, vUv + o2 ) * 0.0702702703;
  sum += texture2D( tDiffuse, vUv - o2 ) * 0.0702702703;
  gl_FragColor = sum;
}
`;

const COPY_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
void main() { gl_FragColor = texture2D( tDiffuse, vUv ); }
`;

const RAYS_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 sunPos;
uniform float density;
uniform float decay;
uniform float weight;
uniform float visibility;
const int SAMPLES = 32;
void main() {
  vec2 delta = ( vUv - sunPos ) * ( density / float( SAMPLES ) );
  vec2 uv = vUv;
  vec3 acc = vec3( 0.0 );
  float illum = 1.0;
  for ( int i = 0; i < SAMPLES; i++ ) {
    uv -= delta;
    acc += texture2D( tDiffuse, clamp( uv, 0.0, 1.0 ) ).rgb * illum * weight;
    illum *= decay;
  }
  gl_FragColor = vec4( acc / float( SAMPLES ) * visibility, 1.0 );
}
`;

const SSAO_FRAG = /* glsl */ `
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
uniform vec3 uKernel[ 16 ];
vec3 viewFromUvDepth( vec2 uv, float d ) {
  vec4 view = uInverseProjection * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  return view.xyz / view.w;
}
float hash12( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }
void main() {
  float d = texture2D( tDepth, vUv ).x;
  if ( d >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }
  vec3 P = viewFromUvDepth( vUv, d );
  float viewDist = -P.z;
  if ( viewDist > uMaxDistance ) { gl_FragColor = vec4( 1.0 ); return; }
  float distanceFade = 1.0 - smoothstep( uFadeStart, uMaxDistance, viewDist );
  vec2 ex = vec2( uTexel.x, 0.0 );
  vec2 ey = vec2( 0.0, uTexel.y );
  vec3 pR = viewFromUvDepth( vUv + ex, texture2D( tDepth, vUv + ex ).x );
  vec3 pL = viewFromUvDepth( vUv - ex, texture2D( tDepth, vUv - ex ).x );
  vec3 pU = viewFromUvDepth( vUv + ey, texture2D( tDepth, vUv + ey ).x );
  vec3 pD = viewFromUvDepth( vUv - ey, texture2D( tDepth, vUv - ey ).x );
  vec3 dx = abs( pR.z - P.z ) < abs( P.z - pL.z ) ? ( pR - P ) : ( P - pL );
  vec3 dy = abs( pU.z - P.z ) < abs( P.z - pD.z ) ? ( pU - P ) : ( P - pD );
  vec3 N = normalize( cross( dx, dy ) );
  if ( N.z < 0.0 ) N = -N;
  float ang = hash12( gl_FragCoord.xy ) * 6.2831853;
  vec3 rvec = vec3( cos( ang ), sin( ang ), 0.0 );
  vec3 T = normalize( rvec - N * dot( rvec, N ) );
  vec3 B = cross( N, T );
  mat3 TBN = mat3( T, B, N );
  // Radius grows gently with distance so mid-field buildings still ground.
  float radius = uRadius * ( 1.0 + viewDist * 0.006 );
  float occlusion = 0.0;
  for ( int i = 0; i < 16; i++ ) {
    vec3 samplePos = P + TBN * uKernel[ i ] * radius;
    vec4 offset = uProjection * vec4( samplePos, 1.0 );
    vec2 sUv = ( offset.xy / offset.w ) * 0.5 + 0.5;
    if ( sUv.x < 0.0 || sUv.x > 1.0 || sUv.y < 0.0 || sUv.y > 1.0 ) continue;
    vec3 occluder = viewFromUvDepth( sUv, texture2D( tDepth, sUv ).x );
    float range = smoothstep( 0.0, 1.0, radius / max( 0.0001, abs( P.z - occluder.z ) ) );
    occlusion += ( occluder.z >= samplePos.z + uBias ? 1.0 : 0.0 ) * range;
  }
  float ao = 1.0 - ( occlusion / 16.0 ) * uIntensity * distanceFade;
  gl_FragColor = vec4( clamp( ao, 0.0, 1.0 ) );
}
`;

const SSAO_BLUR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
void main() {
  float sum = 0.0;
  for ( int x = -2; x < 2; x++ ) {
    for ( int y = -2; y < 2; y++ ) {
      sum += texture2D( tDiffuse, vUv + vec2( float( x ) + 0.5, float( y ) + 0.5 ) * uTexel ).r;
    }
  }
  gl_FragColor = vec4( sum / 16.0 );
}
`;

const TAA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uReset;
${COMMON}
vec3 toYCoCg( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
vec3 fromYCoCg( vec3 c ) { return vec3( c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z ); }
vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
vec3 itm( vec3 c ) { return c / max( 1e-4, 1.0 - max( c.r, max( c.g, c.b ) ) ); }
void main() {
  vec3 cur = tm( texture2D( tCurrent, vUv ).rgb );
  vec3 mn = toYCoCg( cur );
  vec3 mx = mn;
  vec3 m1 = mn;
  vec3 m2 = mn * mn;
  for ( int i = 0; i < 8; i++ ) {
    vec2 o = i == 0 ? vec2( -1.0, -1.0 ) : i == 1 ? vec2( 0.0, -1.0 ) : i == 2 ? vec2( 1.0, -1.0 ) : i == 3 ? vec2( -1.0, 0.0 )
           : i == 4 ? vec2( 1.0, 0.0 ) : i == 5 ? vec2( -1.0, 1.0 ) : i == 6 ? vec2( 0.0, 1.0 ) : vec2( 1.0, 1.0 );
    vec3 s = toYCoCg( tm( texture2D( tCurrent, vUv + o * uTexel ).rgb ) );
    mn = min( mn, s );
    mx = max( mx, s );
    m1 += s;
    m2 += s * s;
  }
  // Variance clip box, intersected with the min/max box.
  vec3 mu = m1 / 9.0;
  vec3 sig = sqrt( max( m2 / 9.0 - mu * mu, 0.0 ) );
  mn = max( mn, mu - sig * 1.25 );
  mx = min( mx, mu + sig * 1.25 );
  float d = texture2D( tDepth, vUv ).x;
  vec3 wp = hddWorldFromDepth( vUv, d, uInvViewProj );
  vec4 pc = uPrevViewProj * vec4( wp, 1.0 );
  vec2 puv = ( pc.xy / pc.w ) * 0.5 + 0.5;
  float valid = ( puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 ) ? 1.0 : 0.0;
  vec3 hist = toYCoCg( tm( texture2D( tHistory, puv ).rgb ) );
  hist = clamp( hist, mn, mx );
  float motion = length( ( puv - vUv ) / uTexel );
  float alpha = mix( 0.1, 0.3, clamp( motion / 8.0, 0.0, 1.0 ) );
  alpha = max( alpha, max( 1.0 - valid, uReset ) );
  vec3 res = mix( fromYCoCg( hist ), cur, alpha );
  gl_FragColor = vec4( itm( res ), 1.0 );
}
`;

const MOTION_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uScale;
uniform float uMaxPx;
uniform vec2 uResolution;
${COMMON}
const int MB_SAMPLES = 10;
void main() {
  float d = texture2D( tDepth, vUv ).x;
  vec3 wp = hddWorldFromDepth( vUv, d, uInvViewProj );
  vec4 pc = uPrevViewProj * vec4( wp, 1.0 );
  vec2 puv = ( pc.xy / pc.w ) * 0.5 + 0.5;
  vec2 vel = ( vUv - puv ) * uScale;
  vec2 px = vel * uResolution;
  float len = length( px );
  if ( len > uMaxPx ) vel *= uMaxPx / len;
  vec3 c = texture2D( tColor, vUv ).rgb;
  if ( len < 0.6 ) { gl_FragColor = vec4( c, 1.0 ); return; }
  vec3 acc = c;
  float n = 1.0;
  for ( int i = 1; i < MB_SAMPLES; i++ ) {
    float t = float( i ) / float( MB_SAMPLES - 1 ) - 0.5;
    acc += texture2D( tColor, clamp( vUv + vel * t, 0.001, 0.999 ) ).rgb;
    n += 1.0;
  }
  gl_FragColor = vec4( acc / n, 1.0 );
}
`;

const INFO_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDepth;
uniform sampler2D tPrev;
uniform sampler2D tLum;
uniform vec2 uSun;
uniform float uNear;
uniform float uFar;
uniform float uManualFocus;
uniform float uBlend;
uniform float uLumLod;
${COMMON}
void main() {
  // Autofocus: nearest of five centre taps.
  float f = 1e9;
  for ( int i = 0; i < 5; i++ ) {
    vec2 o = i == 0 ? vec2( 0.0 ) : i == 1 ? vec2( 0.04, 0.0 ) : i == 2 ? vec2( -0.04, 0.0 ) : i == 3 ? vec2( 0.0, 0.05 ) : vec2( 0.0, -0.05 );
    f = min( f, hddLinearDepth( texture2D( tDepth, vec2( 0.5 ) + o ).x, uNear, uFar ) );
  }
  if ( uManualFocus > 0.0 ) f = uManualFocus;
  // Sun occlusion: fraction of a 5x5 grid around the sun that sees the sky.
  float vis = 0.0;
  for ( int y = -2; y <= 2; y++ ) {
    for ( int x = -2; x <= 2; x++ ) {
      vec2 p = uSun + vec2( float( x ), float( y ) ) * 0.006;
      float inside = ( p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0 ) ? 1.0 : 0.0;
      vis += inside * step( 0.99999, texture2D( tDepth, clamp( p, 0.0, 1.0 ) ).x );
    }
  }
  vis /= 25.0;
  float lum = exp( textureLod( tLum, vec2( 0.5 ), uLumLod ).r );
  vec4 prev = texture2D( tPrev, vec2( 0.5 ) );
  vec4 now = vec4( f, vis, lum, 1.0 );
  // Focus eases in log space so pulls between near and far feel like a lens.
  float lf = mix( log( max( prev.x, 0.1 ) ), log( max( now.x, 0.1 ) ), uBlend );
  gl_FragColor = vec4( exp( lf ), mix( prev.y, now.y, min( 1.0, uBlend * 2.0 ) ), mix( prev.z, now.z, uBlend * 0.5 ), 1.0 );
  if ( prev.w < 0.5 ) gl_FragColor = now;
}
`;

const LUM_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  gl_FragColor = vec4( log( clamp( l, 1e-4, 64.0 ) ), 0.0, 0.0, 1.0 );
}
`;

const COC_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tInfo;
uniform float uNear;
uniform float uFar;
uniform float uAperture;
${COMMON}
void main() {
  float focus = texture2D( tInfo, vec2( 0.5 ) ).x;
  float dist = hddLinearDepth( texture2D( tDepth, vUv ).x, uNear, uFar );
  float coc = clamp( ( dist - focus ) / max( dist, 0.001 ) * uAperture, -1.0, 1.0 );
  gl_FragColor = vec4( texture2D( tColor, vUv ).rgb, coc );
}
`;

const BOKEH_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tCoc;
uniform vec2 uTexel;
uniform float uMaxRadius;
const int BOKEH_SAMPLES = DOF_SAMPLES;
void main() {
  vec4 c0 = texture2D( tCoc, vUv );
  vec3 acc = c0.rgb;
  float wsum = 1.0;
  for ( int i = 1; i < BOKEH_SAMPLES; i++ ) {
    float fi = float( i );
    float r = sqrt( ( fi + 0.5 ) / float( BOKEH_SAMPLES ) );
    float th = fi * 2.39996323;
    vec2 o = vec2( cos( th ), sin( th ) ) * r * uMaxRadius;
    vec4 s = texture2D( tCoc, vUv + o * uTexel );
    float sr = abs( s.a ) * uMaxRadius;
    float w = smoothstep( r * uMaxRadius - 1.0, r * uMaxRadius + 0.5, sr );
    // Sharp background must not bleed onto a blurred foreground.
    w *= ( s.a < c0.a - 0.15 && c0.a > 0.0 ) ? 0.2 : 1.0;
    acc += s.rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4( acc / wsum, abs( c0.a ) );
}
`;

const DOF_COMPOSITE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tBlur;
uniform sampler2D tDepth;
uniform sampler2D tInfo;
uniform float uNear;
uniform float uFar;
uniform float uAperture;
${COMMON}
void main() {
  float focus = texture2D( tInfo, vec2( 0.5 ) ).x;
  float dist = hddLinearDepth( texture2D( tDepth, vUv ).x, uNear, uFar );
  float coc = abs( clamp( ( dist - focus ) / max( dist, 0.001 ) * uAperture, -1.0, 1.0 ) );
  vec4 b = texture2D( tBlur, vUv );
  float k = smoothstep( 0.06, 0.32, max( coc, b.a * 0.85 ) );
  gl_FragColor = vec4( mix( texture2D( tColor, vUv ).rgb, b.rgb, k ), 1.0 );
}
`;

const COMPOSITE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tBloom2;
uniform sampler2D tRays;
uniform sampler2D tAO;
uniform sampler2D tInfo;
uniform float aoStrength;
uniform float bloomStrength;
uniform float raysStrength;
uniform float exposure;
uniform float autoExposure;
uniform float exposureTarget;
uniform float vignette;
uniform float grain;
uniform float aberration;
uniform float haze;
uniform float time;
uniform vec3 lift;
uniform vec3 gain;
uniform vec3 tint;
uniform float saturation;
uniform float contrast;
uniform vec2 resolution;
uniform vec2 sunPos;
uniform float flareStrength;
uniform vec3 flareColor;

vec3 aces( vec3 x ) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
}
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }
float disc( vec2 p, vec2 c, float r, float soft ) { return smoothstep( r, r * ( 1.0 - soft ), length( p - c ) ); }

vec3 lensFlare( vec2 uv, float aspect, float strength ) {
  vec2 asp = vec2( aspect, 1.0 );
  vec2 s = sunPos;
  vec2 dir = vec2( 0.5 ) - s;
  vec3 col = vec3( 0.0 );
  vec2 p = uv * asp;
  // Ghosts along the sun–centre axis.
  col += vec3( 0.35, 0.55, 1.0 ) * disc( p, ( s + dir * 0.45 ) * asp, 0.035, 0.6 ) * 0.22;
  col += vec3( 1.0, 0.75, 0.35 ) * disc( p, ( s + dir * 0.8 ) * asp, 0.018, 0.4 ) * 0.35;
  col += vec3( 0.55, 1.0, 0.6 ) * disc( p, ( s + dir * 1.25 ) * asp, 0.06, 0.7 ) * 0.12;
  col += vec3( 1.0, 0.5, 0.75 ) * disc( p, ( s + dir * 1.55 ) * asp, 0.028, 0.3 ) * 0.2;
  col += vec3( 0.4, 0.7, 1.0 ) * disc( p, ( s + dir * 2.0 ) * asp, 0.11, 0.85 ) * 0.08;
  // Halo ring centred on the image, brightest on the sun's side.
  float r = length( ( uv - 0.5 ) * asp );
  float ring = smoothstep( 0.05, 0.0, abs( r - 0.42 ) ) * max( 0.0, dot( normalize( ( uv - 0.5 ) * asp + 1e-5 ), normalize( -dir * asp + 1e-5 ) ) );
  col += vec3( 0.9, 0.75, 1.0 ) * ring * 0.08;
  // Anamorphic streak and glare around the sun.
  vec2 dv = ( uv - s ) * asp;
  col += flareColor * exp( -abs( dv.y ) * 260.0 ) * exp( -abs( dv.x ) * 3.5 ) * 0.35;
  col += flareColor * exp( -length( dv ) * 22.0 ) * 0.4;
  return col * strength;
}

void main() {
  vec2 uv = vUv;
  if ( haze > 0.0 ) {
    float band = smoothstep( 0.6, 0.05, uv.y );
    float w = sin( uv.y * 210.0 + time * 3.1 ) * 0.5 + sin( uv.x * 140.0 - time * 2.3 + uv.y * 40.0 ) * 0.5;
    uv.x += w * haze * band * 0.0014;
    uv.y += cos( uv.x * 170.0 + time * 2.0 ) * haze * band * 0.0006;
  }
  vec2 fromCenter = uv - 0.5;
  vec3 color;
  if ( aberration > 0.0 ) {
    float amt = aberration * 0.0022 * dot( fromCenter, fromCenter ) * 4.0;
    color.r = texture2D( tDiffuse, uv + fromCenter * amt ).r;
    color.g = texture2D( tDiffuse, uv ).g;
    color.b = texture2D( tDiffuse, uv - fromCenter * amt ).b;
  } else {
    color = texture2D( tDiffuse, uv ).rgb;
  }
  if ( aoStrength > 0.0 ) color *= mix( 1.0, texture2D( tAO, uv ).r, aoStrength );
  if ( bloomStrength > 0.0 ) color += ( texture2D( tBloom, uv ).rgb + texture2D( tBloom2, uv ).rgb * 0.8 ) * bloomStrength;
  if ( raysStrength > 0.0 ) color += texture2D( tRays, uv ).rgb * raysStrength;
  vec4 info = texture2D( tInfo, vec2( 0.5 ) );
  if ( flareStrength > 0.0 ) color += lensFlare( uv, resolution.x / resolution.y, flareStrength * info.y );

  // Partial eye adaptation: brightens night, tames glare, never fully normalises.
  float adapt = clamp( pow( exposureTarget / max( info.z, 1e-4 ), 0.55 ), 0.55, 3.2 );
  color *= exposure * mix( 1.0, adapt, autoExposure );
  color *= tint;
  color = aces( color );
  color = color * gain + lift;
  float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( lum ), color, saturation );
  color = clamp( ( color - 0.18 ) * contrast + 0.18, 0.0, 1.4 );
  float rr = length( fromCenter * vec2( resolution.x / resolution.y, 1.0 ) );
  color *= 1.0 - vignette * smoothstep( 0.35, 1.05, rr );
  if ( grain > 0.0 ) {
    float n = hash( gl_FragCoord.xy + fract( time ) * 137.0 ) - 0.5;
    color += n * grain * ( 1.0 - 0.7 * lum );
  }
  color = clamp( color, 0.0, 1.0 );
  vec3 srgb = mix( color * 12.92, 1.055 * pow( max( color, vec3( 1e-5 ) ), vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), color ) );
  gl_FragColor = vec4( srgb, 1.0 );
}
`;

// FXAA (Lottes, console-quality variant) on the sRGB-encoded image, + film grain.
const FXAA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float grain;
uniform float time;
float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }
void main() {
  vec3 rgbM = texture2D( tDiffuse, vUv ).rgb;
  float lNW = luma( texture2D( tDiffuse, vUv + vec2( -1.0, -1.0 ) * uTexel ).rgb );
  float lNE = luma( texture2D( tDiffuse, vUv + vec2( 1.0, -1.0 ) * uTexel ).rgb );
  float lSW = luma( texture2D( tDiffuse, vUv + vec2( -1.0, 1.0 ) * uTexel ).rgb );
  float lSE = luma( texture2D( tDiffuse, vUv + vec2( 1.0, 1.0 ) * uTexel ).rgb );
  float lM = luma( rgbM );
  float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
  float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );
  vec3 outc = rgbM;
  if ( lMax - lMin > max( 0.0312, lMax * 0.125 ) ) {
    vec2 dir = vec2( -( ( lNW + lNE ) - ( lSW + lSE ) ), ( lNW + lSW ) - ( lNE + lSE ) );
    float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.03125, 1.0 / 128.0 );
    float rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
    dir = clamp( dir * rcp, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;
    vec3 a = 0.5 * ( texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
    vec3 b = a * 0.5 + 0.25 * ( texture2D( tDiffuse, vUv - dir * 0.5 ).rgb + texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );
    float lb = luma( b );
    outc = ( lb < lMin || lb > lMax ) ? a : b;
  }
  if ( grain > 0.0 ) {
    float n = hash( gl_FragCoord.xy + fract( time ) * 137.0 ) - 0.5;
    outc += n * grain * ( 1.0 - 0.7 * luma( outc ) );
  }
  gl_FragColor = vec4( outc, 1.0 );
}
`;

/* -------------------------------------------------------------- helpers */

function fullscreenMesh(material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

function makeRT(w, h, { samples = 0, depth = false, type = THREE.HalfFloatType, filter = THREE.LinearFilter, mips = false } = {}) {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const options = {
    type,
    format: THREE.RGBAFormat,
    minFilter: mips ? THREE.LinearMipmapLinearFilter : filter,
    magFilter: filter,
    depthBuffer: depth,
    stencilBuffer: false,
    samples,
    generateMipmaps: mips,
  };
  if (depth) {
    const dt = new THREE.DepthTexture(width, height);
    dt.type = THREE.UnsignedIntType;
    dt.format = THREE.DepthFormat;
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    options.depthTexture = dt;
  }
  const rt = new THREE.WebGLRenderTarget(width, height, options);
  rt.texture.generateMipmaps = mips;
  return rt;
}

function makeSsaoKernel(count) {
  const kernel = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand()).normalize();
    const t = i / count;
    v.multiplyScalar(0.1 + 0.9 * t * t);
    kernel.push(v);
  }
  return kernel;
}

function shader(fragmentShader, uniforms, defines) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    defines: defines || {},
    depthTest: false,
    depthWrite: false,
  });
}

/** Halton low-discrepancy sequence for TAA sub-pixel jitter. */
function halton(index, base) {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const LOOK_KEYS = ['exposure', 'vignette', 'grain', 'aberration', 'saturation', 'contrast', 'bloomStrength', 'raysStrength',
  'aoStrength', 'flareStrength', 'haze'];
const LOOK_VEC = ['lift', 'gain', 'tint'];

export class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.enabled = true;
    this.width = 1;
    this.height = 1;
    this.frame = 0;
    this.features = {
      bloom: true, godRays: true, ssao: true, dof: true, motionBlur: true, lensFlare: true, grain: true,
      aa: true, taa: true, autoExposure: true,
    };
    this.dofOn = false;
    this.focusDistance = 0;        // 0 = autofocus
    this.aperture = 1.6;           // CoC scale: blur reached at 2x focus distance
    this.autoLook = true;
    this.weather = { heat: 0, dust: 0, rain: 0 };
    this._lastTime = 0;
    this._historyValid = false;
    this._infoIndex = 0;
    this._prevViewProj = new THREE.Matrix4();
    this._viewProj = new THREE.Matrix4();
    this._invViewProj = new THREE.Matrix4();
    this._jitteredVP = new THREE.Matrix4();
    this._prevCamPos = new THREE.Vector3();
    this._prevCamQuat = new THREE.Quaternion();
    this._hasPrev = false;
    this.jitter = new THREE.Vector2();
    this.motion = 0;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    const tier = quality ? quality.tier : 'medium';
    const dofSamples = tier === 'ultra' ? 48 : tier === 'high' ? 36 : 22;

    this.brightMat = shader(BRIGHT_FRAG, { tDiffuse: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.6 } });
    this.blurMat = shader(BLUR_FRAG, { tDiffuse: { value: null }, direction: { value: new THREE.Vector2() } });
    this.copyMat = shader(COPY_FRAG, { tDiffuse: { value: null } });
    this.raysMat = shader(RAYS_FRAG, {
      tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.8) }, density: { value: 0.9 },
      decay: { value: 0.95 }, weight: { value: 0.85 }, visibility: { value: 0 },
    });
    this.ssaoMat = shader(SSAO_FRAG, {
      tDepth: { value: null }, uProjection: { value: new THREE.Matrix4() }, uInverseProjection: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.2 }, uBias: { value: 0.04 }, uIntensity: { value: 1.0 },
      uMaxDistance: { value: 650 }, uFadeStart: { value: 320 }, uKernel: { value: makeSsaoKernel(16) },
    });
    this.ssaoBlurMat = shader(SSAO_BLUR_FRAG, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.taaMat = shader(TAA_FRAG, {
      tCurrent: { value: null }, tHistory: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uReset: { value: 1 },
    });
    this.motionMat = shader(MOTION_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() }, uScale: { value: 0.5 }, uMaxPx: { value: 32 }, uResolution: { value: new THREE.Vector2() },
    });
    this.lumMat = shader(LUM_FRAG, { tDiffuse: { value: null } });
    this.infoMat = shader(INFO_FRAG, {
      tDepth: { value: null }, tPrev: { value: null }, tLum: { value: null }, uSun: { value: new THREE.Vector2() },
      uNear: { value: 0.3 }, uFar: { value: 10000 }, uManualFocus: { value: 0 }, uBlend: { value: 0.1 }, uLumLod: { value: 6 },
    });
    this.cocMat = shader(COC_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, tInfo: { value: null }, uNear: { value: 0.3 }, uFar: { value: 10000 }, uAperture: { value: 1.6 },
    });
    this.bokehMat = shader(BOKEH_FRAG, { tCoc: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxRadius: { value: 9 } }, { DOF_SAMPLES: dofSamples });
    this.dofMat = shader(DOF_COMPOSITE_FRAG, {
      tColor: { value: null }, tBlur: { value: null }, tDepth: { value: null }, tInfo: { value: null },
      uNear: { value: 0.3 }, uFar: { value: 10000 }, uAperture: { value: 1.6 },
    });
    this.compositeMat = shader(COMPOSITE_FRAG, {
      tDiffuse: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, tRays: { value: null }, tAO: { value: null }, tInfo: { value: null },
      aoStrength: { value: 0.85 }, bloomStrength: { value: 0.5 }, raysStrength: { value: 0.45 }, exposure: { value: 1.0 },
      autoExposure: { value: 1 }, exposureTarget: { value: 0.3 },
      vignette: { value: 0.32 }, grain: { value: 0.03 }, aberration: { value: 0.25 }, haze: { value: 0 }, time: { value: 0 },
      lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, tint: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1.1 }, contrast: { value: 1.08 }, resolution: { value: new THREE.Vector2(1, 1) },
      sunPos: { value: new THREE.Vector2(0.5, 0.5) }, flareStrength: { value: 0 }, flareColor: { value: new THREE.Color(1, 0.85, 0.65) },
    });
    this.fxaaMat = shader(FXAA_FRAG, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, grain: { value: 0 }, time: { value: 0 } });

    this.quad = fullscreenMesh(this.compositeMat);
    this.scene.add(this.quad);

    // Current (blended) look, its target, and the blend inputs.
    this.look = PostFX._expand(PostFX.LOOKS.exterior);
    this._lookTarget = PostFX._expand(PostFX.LOOKS.exterior);
    this._lookWeights = { night: 0, dust: 0, rain: 0, interior: 0, photo: 0, golden: 0 };

    // Black 1x1 fallbacks so samplers are never unbound.
    this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this._black.needsUpdate = true;
    this._white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this._white.needsUpdate = true;
    this._infoInit = new THREE.DataTexture(new Float32Array([200, 0, 0.3, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this._infoInit.needsUpdate = true;

    this._rts = {};
    this.setSize(1, 1);
  }

  /* ------------------------------------------------------------ setup */

  /** Effective on/off for a pass = quality tier flag AND user toggle. */
  isActive(name) {
    const s = this.quality.settings;
    const f = this.features;
    switch (name) {
      case 'bloom': return !!(s.bloom && f.bloom);
      case 'godRays': return !!(s.godRays && f.godRays);
      case 'ssao': return !!(s.ssao && f.ssao);
      case 'dof': return !!(s.dof && f.dof && this.dofOn);
      case 'motionBlur': return !!(s.motionBlur && f.motionBlur);
      case 'lensFlare': return !!(s.lensFlare && f.lensFlare);
      case 'grain': return !!(s.grain && f.grain);
      case 'aa': return !!(s.aa && s.aa !== 'none' && f.aa);
      case 'taa': return !!(s.taa && f.taa);
      case 'autoExposure': return !!f.autoExposure;
      default: return false;
    }
  }

  /** User toggle from the Graphics settings. Unknown names are ignored. */
  setFeature(name, on) {
    if (!(name in this.features)) return false;
    const was = this.features[name];
    this.features[name] = !!on;
    if (was !== !!on && (name === 'taa' || name === 'ssao')) this.setSize(this.width, this.height);
    if (name === 'taa') this._historyValid = false;
    return true;
  }

  /** Apply a { bloom, godRays, ssao, dof, motionBlur, lensFlare, grain, … } object (settings.graphics). */
  setFeatures(obj = {}) {
    for (const [k, v] of Object.entries(obj)) if (k in this.features && typeof v === 'boolean') this.setFeature(k, v);
  }

  /** Depth of field for tour / photo mode. `focusDistance` in metres; omit for autofocus. */
  setDepthOfField(on, focusDistance) {
    this.dofOn = !!on;
    if (focusDistance !== undefined && focusDistance !== null) this.focusDistance = Math.max(0, +focusDistance || 0);
    else if (!on) this.focusDistance = 0;
  }

  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const s = this.quality.settings;
    const W = this.width;
    const H = this.height;
    const half = [Math.ceil(W / 2), Math.ceil(H / 2)];
    const quarter = [Math.ceil(W / 4), Math.ceil(H / 4)];
    const eighth = [Math.ceil(W / 8), Math.ceil(H / 8)];
    for (const rt of Object.values(this._rts)) if (rt) rt.dispose();
    const r = {};
    r.scene = makeRT(W, H, { samples: s.msaa || 0, depth: true });
    r.bright = makeRT(half[0], half[1]);
    r.blurA = makeRT(quarter[0], quarter[1]);
    r.blurB = makeRT(quarter[0], quarter[1]);
    r.blurC = makeRT(eighth[0], eighth[1]);
    r.blurD = makeRT(eighth[0], eighth[1]);
    r.rays = makeRT(half[0], half[1]);
    r.lum = makeRT(64, 64, { mips: true });
    r.info0 = makeRT(1, 1, { filter: THREE.NearestFilter });
    r.info1 = makeRT(1, 1, { filter: THREE.NearestFilter });
    if (s.ssao) {
      r.ssao = makeRT(half[0], half[1]);
      r.ssaoBlur = makeRT(half[0], half[1]);
      this.ssaoMat.uniforms.uTexel.value.set(1 / half[0], 1 / half[1]);
      this.ssaoBlurMat.uniforms.uTexel.value.set(1 / half[0], 1 / half[1]);
    }
    if (s.taa) {
      r.taa0 = makeRT(W, H);
      r.taa1 = makeRT(W, H);
    }
    if (s.motionBlur) r.motion = makeRT(W, H);
    if (s.dof) {
      r.coc = makeRT(half[0], half[1]);
      r.bokeh = makeRT(half[0], half[1]);
      r.dof = makeRT(W, H);
    }
    if (s.aa && s.aa !== 'none') r.ldr = makeRT(W, H, { type: THREE.UnsignedByteType });
    this._rts = r;
    this._historyValid = false;
    this._infoPrimed = false;
    this.compositeMat.uniforms.resolution.value.set(W, H);
    this.taaMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.motionMat.uniforms.uResolution.value.set(W, H);
    this.fxaaMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.bokehMat.uniforms.uTexel.value.set(1 / half[0], 1 / half[1]);
  }

  get renderTarget() {
    return this._rts.scene;
  }

  get sceneRT() {
    return this._rts.scene;
  }

  /* ------------------------------------------------------- TAA jitter */

  /** Sub-pixel jitter (pixels) for this frame, or (0,0) when TAA is off. */
  nextJitter() {
    if (!this.isActive('taa') || !this._rts.taa0) {
      this.jitter.set(0, 0);
      return this.jitter;
    }
    const i = (this.frame % 8) + 1;
    this.jitter.set(halton(i, 2) - 0.5, halton(i, 3) - 0.5);
    return this.jitter;
  }

  /** Forget temporal history (camera cut, teleport, resize). */
  resetHistory() {
    this._historyValid = false;
    this._hasPrev = false;
  }

  /* ------------------------------------------------------------ looks */

  static get LOOKS() {
    return {
      exterior: {
        exposure: 1.0, vignette: 0.28, grain: 0.028, aberration: 0.25, haze: 0, saturation: 1.16, contrast: 1.1,
        lift: [0.006, 0.003, 0.0], gain: [1.06, 1.0, 0.92], tint: [1, 1, 1], bloomStrength: 0.45, raysStrength: 0.45,
        aoStrength: 0.8, flareStrength: 0.55,
      },
      interior: {
        exposure: 1.18, vignette: 0.42, grain: 0.035, aberration: 0.15, haze: 0, saturation: 1.0, contrast: 1.05,
        lift: [0.006, 0.005, 0.006], gain: [1.02, 0.99, 0.96], tint: [1, 1, 1], bloomStrength: 0.4, raysStrength: 0.2,
        aoStrength: 1.0, flareStrength: 0.15,
      },
      night: {
        exposure: 1.35, vignette: 0.42, grain: 0.03, aberration: 0.3, haze: 0, saturation: 0.92, contrast: 1.12,
        lift: [0.0, 0.004, 0.012], gain: [0.94, 0.98, 1.08], tint: [1, 1, 1], bloomStrength: 0.85, raysStrength: 0.15,
        aoStrength: 0.6, flareStrength: 0.25,
      },
      golden: {
        exposure: 1.02, vignette: 0.34, grain: 0.028, aberration: 0.25, haze: 0, saturation: 1.18, contrast: 1.1,
        lift: [0.012, 0.004, 0.0], gain: [1.08, 0.99, 0.88], tint: [1, 1, 1], bloomStrength: 0.6, raysStrength: 0.7,
        aoStrength: 0.8, flareStrength: 0.7,
      },
      dust: {
        exposure: 1.08, vignette: 0.38, grain: 0.045, aberration: 0.2, haze: 0, saturation: 0.82, contrast: 0.94,
        lift: [0.03, 0.016, 0.0], gain: [1.08, 0.96, 0.8], tint: [1.04, 0.98, 0.9], bloomStrength: 0.5, raysStrength: 0.15,
        aoStrength: 0.6, flareStrength: 0.0,
      },
      rain: {
        exposure: 1.12, vignette: 0.36, grain: 0.035, aberration: 0.2, haze: 0, saturation: 0.82, contrast: 1.06,
        lift: [0.0, 0.006, 0.014], gain: [0.95, 1.0, 1.06], tint: [1, 1, 1], bloomStrength: 0.6, raysStrength: 0.05,
        aoStrength: 0.8, flareStrength: 0.0,
      },
      photo: {
        exposure: 1.04, vignette: 0.48, grain: 0.02, aberration: 0.35, haze: 0, saturation: 1.16, contrast: 1.12,
        lift: [0.004, 0.002, 0.0], gain: [1.05, 1.0, 0.95], tint: [1, 1, 1], bloomStrength: 0.55, raysStrength: 0.55,
        aoStrength: 0.9, flareStrength: 0.7,
      },
    };
  }

  static _expand(look) {
    const o = {};
    for (const k of LOOK_KEYS) o[k] = look[k] !== undefined ? look[k] : PostFX.LOOKS.exterior[k];
    for (const k of LOOK_VEC) o[k] = (look[k] || PostFX.LOOKS.exterior[k]).slice();
    return o;
  }

  /**
   * Named preset, a custom object, or 'auto'. A name/object pins the look until
   * applyLook('auto'); pass { instant: true } as the 2nd arg to skip the blend.
   */
  applyLook(look, { instant = false } = {}) {
    if (look === 'auto') {
      this.autoLook = true;
      return;
    }
    const src = typeof look === 'string' ? PostFX.LOOKS[look] : look;
    if (!src) return;
    this.autoLook = false;
    const merged = { ...PostFX.LOOKS.exterior, ...src };
    this._lookTarget = PostFX._expand(merged);
    if (instant) this.look = PostFX._expand(merged);
  }

  /**
   * Engine-driven environment for the automatic look and weather passes.
   * { night, golden, dust, rain, heat, interior, photo } all 0..1.
   */
  setEnvironment(env = {}) {
    const w = this._lookWeights;
    for (const k of Object.keys(w)) if (env[k] !== undefined) w[k] = Math.max(0, Math.min(1, env[k]));
    if (env.heat !== undefined) this.weather.heat = env.heat;
    if (!this.autoLook) return;
    const L = PostFX.LOOKS;
    const t = PostFX._expand(L.exterior);
    const mix = (src, a) => {
      if (a <= 0) return;
      for (const k of LOOK_KEYS) t[k] += ((src[k] !== undefined ? src[k] : t[k]) - t[k]) * a;
      for (const k of LOOK_VEC) for (let i = 0; i < 3; i++) t[k][i] += ((src[k] || t[k])[i] - t[k][i]) * a;
    };
    mix(L.golden, w.golden * (1 - w.night));
    mix(L.night, w.night);
    mix(L.dust, w.dust);
    mix(L.rain, w.rain);
    mix(L.interior, w.interior);
    mix(L.photo, w.photo);
    this._lookTarget = t;
  }

  _blendLook(dt) {
    const k = 1 - Math.exp(-dt * 2.5);
    const c = this.look;
    const t = this._lookTarget;
    for (const key of LOOK_KEYS) c[key] += (t[key] - c[key]) * k;
    for (const key of LOOK_VEC) for (let i = 0; i < 3; i++) c[key][i] += (t[key][i] - c[key][i]) * k;
  }

  /* ----------------------------------------------------------- render */

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target || null);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Runs the chain over whatever was rendered into `renderTarget`.
   * `unjitteredProjection` is the camera projection before TAA jitter.
   */
  render(time, { sunScreen = null, sunVisibility = 0, camera = null, unjitteredProjection = null } = {}) {
    const r = this._rts;
    const dt = Math.max(0, Math.min(0.25, time - this._lastTime));
    this._lastTime = time;
    this.frame++;
    this._blendLook(dt || 1 / 60);
    const look = this.look;
    const u = this.compositeMat.uniforms;
    u.time.value = time;
    const depth = r.scene.depthTexture;
    const near = camera ? camera.near : 0.3;
    const far = camera ? camera.far : 10000;

    // Camera matrices (unjittered) for reprojection passes.
    if (camera) {
      const proj = unjitteredProjection || camera.projectionMatrix;
      this._viewProj.multiplyMatrices(proj, camera.matrixWorldInverse);
      this._jitteredVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this._invViewProj.copy(this._jitteredVP).invert();
      // Camera motion since last frame, to gate blur and detect cuts.
      const moved = this._hasPrev ? camera.position.distanceTo(this._prevCamPos) : 0;
      const turned = this._hasPrev ? 2 * Math.acos(Math.min(1, Math.abs(camera.quaternion.dot(this._prevCamQuat)))) : 0;
      this.motion = moved + turned * 50;
      if (this._hasPrev && (moved > 60 || turned > 0.6)) this._historyValid = false;   // cut
    }
    const cut = !this._historyValid;
    let color = r.scene.texture;

    // ---- TAA ----
    if (this.isActive('taa') && r.taa0 && camera) {
      const src = this.frame % 2 ? r.taa0 : r.taa1;
      const dst = this.frame % 2 ? r.taa1 : r.taa0;
      const tu = this.taaMat.uniforms;
      tu.tCurrent.value = color;
      tu.tHistory.value = src.texture;
      tu.tDepth.value = depth;
      tu.uInvViewProj.value.copy(this._invViewProj);
      tu.uPrevViewProj.value.copy(this._hasPrev ? this._prevViewProj : this._viewProj);
      tu.uReset.value = this._historyValid ? 0 : 1;
      this._blit(this.taaMat, dst);
      color = dst.texture;
    }
    this._historyValid = true;

    // ---- info: autofocus, sun occlusion, eye adaptation ----
    this.lumMat.uniforms.tDiffuse.value = color;
    this._blit(this.lumMat, r.lum);
    const infoPrev = this._infoIndex ? r.info1 : r.info0;
    const infoNext = this._infoIndex ? r.info0 : r.info1;
    this._infoIndex = 1 - this._infoIndex;
    const iu = this.infoMat.uniforms;
    iu.tDepth.value = depth;
    iu.tPrev.value = this._infoPrimed ? infoPrev.texture : this._infoInit;
    iu.tLum.value = r.lum.texture;
    iu.uSun.value.copy(sunScreen || iu.uSun.value);
    iu.uNear.value = near;
    iu.uFar.value = far;
    iu.uManualFocus.value = this.focusDistance;
    iu.uBlend.value = cut ? 1 : Math.min(1, (dt || 1 / 60) * 6);
    this._blit(this.infoMat, infoNext);
    this._infoPrimed = true;
    const info = infoNext.texture;

    // ---- motion blur (camera) ----
    if (this.isActive('motionBlur') && r.motion && camera && this._hasPrev && !cut && this.motion > 0.02) {
      const mu = this.motionMat.uniforms;
      mu.tColor.value = color;
      mu.tDepth.value = depth;
      mu.uInvViewProj.value.copy(this._invViewProj);
      mu.uPrevViewProj.value.copy(this._prevViewProj);
      // 1/120 s shutter expressed in frames.
      mu.uScale.value = Math.min(1.2, (1 / 120) / Math.max(1 / 240, dt || 1 / 60));
      mu.uMaxPx.value = Math.max(12, this.height * 0.04);
      this._blit(this.motionMat, r.motion);
      color = r.motion.texture;
    }

    // ---- depth of field ----
    if (this.isActive('dof') && r.dof && camera) {
      const apt = this.aperture;
      for (const m of [this.cocMat, this.dofMat]) {
        m.uniforms.tDepth.value = depth;
        m.uniforms.tInfo.value = info;
        m.uniforms.uNear.value = near;
        m.uniforms.uFar.value = far;
        m.uniforms.uAperture.value = apt;
      }
      this.cocMat.uniforms.tColor.value = color;
      this._blit(this.cocMat, r.coc);
      this.bokehMat.uniforms.tCoc.value = r.coc.texture;
      this.bokehMat.uniforms.uMaxRadius.value = Math.max(4, Math.min(14, this.height / 90));
      this._blit(this.bokehMat, r.bokeh);
      this.dofMat.uniforms.tColor.value = color;
      this.dofMat.uniforms.tBlur.value = r.bokeh.texture;
      this._blit(this.dofMat, r.dof);
      color = r.dof.texture;
    }

    // ---- SSAO ----
    if (this.isActive('ssao') && r.ssao && camera) {
      const su = this.ssaoMat.uniforms;
      su.tDepth.value = depth;
      su.uProjection.value.copy(camera.projectionMatrix);
      su.uInverseProjection.value.copy(camera.projectionMatrixInverse);
      this._blit(this.ssaoMat, r.ssao);
      this.ssaoBlurMat.uniforms.tDiffuse.value = r.ssao.texture;
      this._blit(this.ssaoBlurMat, r.ssaoBlur);
      u.tAO.value = r.ssaoBlur.texture;
      u.aoStrength.value = look.aoStrength;
    } else {
      u.tAO.value = this._white;
      u.aoStrength.value = 0;
    }

    // ---- bloom (bright → ¼ → ⅛) ----
    const bloom = this.isActive('bloom');
    const rays = this.isActive('godRays') && sunScreen && sunVisibility > 0.001;
    if (bloom || rays) {
      this.brightMat.uniforms.tDiffuse.value = color;
      this._blit(this.brightMat, r.bright);
    }
    if (bloom) {
      const bm = this.blurMat.uniforms;
      bm.tDiffuse.value = r.bright.texture;
      bm.direction.value.set(1 / r.blurA.width, 0);
      this._blit(this.blurMat, r.blurA);
      bm.tDiffuse.value = r.blurA.texture;
      bm.direction.value.set(0, 1 / r.blurA.height);
      this._blit(this.blurMat, r.blurB);
      bm.tDiffuse.value = r.blurB.texture;
      bm.direction.value.set(1 / r.blurC.width, 0);
      this._blit(this.blurMat, r.blurC);
      bm.tDiffuse.value = r.blurC.texture;
      bm.direction.value.set(0, 1 / r.blurC.height);
      this._blit(this.blurMat, r.blurD);
      bm.tDiffuse.value = r.blurD.texture;
      bm.direction.value.set(2 / r.blurC.width, 0);
      this._blit(this.blurMat, r.blurC);
      bm.tDiffuse.value = r.blurC.texture;
      bm.direction.value.set(0, 2 / r.blurC.height);
      this._blit(this.blurMat, r.blurD);
      u.tBloom.value = r.blurB.texture;
      u.tBloom2.value = r.blurD.texture;
      u.bloomStrength.value = look.bloomStrength;
    } else {
      u.tBloom.value = this._black;
      u.tBloom2.value = this._black;
      u.bloomStrength.value = 0;
    }

    // ---- god rays ----
    if (rays) {
      const ru = this.raysMat.uniforms;
      ru.tDiffuse.value = r.bright.texture;
      ru.sunPos.value.copy(sunScreen);
      ru.visibility.value = sunVisibility;
      this._blit(this.raysMat, r.rays);
      u.tRays.value = r.rays.texture;
      u.raysStrength.value = look.raysStrength;
    } else {
      u.tRays.value = this._black;
      u.raysStrength.value = 0;
    }

    // ---- composite ----
    u.tDiffuse.value = color;
    u.tInfo.value = info;
    u.exposure.value = look.exposure;
    u.autoExposure.value = this.isActive('autoExposure') ? 1 : 0;
    u.vignette.value = look.vignette;
    u.aberration.value = look.aberration;
    u.saturation.value = look.saturation;
    u.contrast.value = look.contrast;
    u.lift.value.set(...look.lift);
    u.gain.value.set(...look.gain);
    u.tint.value.set(...look.tint);
    u.haze.value = Math.max(look.haze, this.weather.heat * 1.4);
    const flare = this.isActive('lensFlare') && sunScreen ? look.flareStrength * sunVisibility : 0;
    u.flareStrength.value = flare;
    if (sunScreen) u.sunPos.value.copy(sunScreen);
    const grain = this.isActive('grain') ? look.grain : 0;
    const aa = this.isActive('aa') && r.ldr;
    u.grain.value = aa ? 0 : grain;
    this._blit(this.compositeMat, aa ? r.ldr : null);
    if (aa) {
      this.fxaaMat.uniforms.tDiffuse.value = r.ldr.texture;
      this.fxaaMat.uniforms.grain.value = grain;
      this.fxaaMat.uniforms.time.value = time;
      this._blit(this.fxaaMat, null);
    }

    if (camera) {
      this._prevViewProj.copy(this._viewProj);
      this._prevCamPos.copy(camera.position);
      this._prevCamQuat.copy(camera.quaternion);
      this._hasPrev = true;
    }
  }

  /** Which passes ran last frame (for the stats overlay / QA). */
  get activePasses() {
    return ['taa', 'motionBlur', 'dof', 'ssao', 'bloom', 'godRays', 'lensFlare', 'aa', 'grain', 'autoExposure'].filter((n) => this.isActive(n));
  }

  dispose() {
    for (const rt of Object.values(this._rts)) if (rt) rt.dispose();
    this._rts = {};
    this.quad.geometry.dispose();
    for (const m of [this.brightMat, this.blurMat, this.copyMat, this.raysMat, this.ssaoMat, this.ssaoBlurMat, this.taaMat,
      this.motionMat, this.lumMat, this.infoMat, this.cocMat, this.bokehMat, this.dofMat, this.compositeMat, this.fxaaMat]) m.dispose();
    this._black.dispose();
    this._white.dispose();
    this._infoInit.dispose();
  }
}
