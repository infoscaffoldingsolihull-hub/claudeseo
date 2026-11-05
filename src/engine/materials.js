import * as THREE from 'three';
import { TextureLibrary } from './textures.js';

/**
 * PBR material library (A3).
 *
 *   const M = new MaterialLibrary(textures, quality);   // or engine.materials
 *   mesh.material = M.asphaltOld;                       // cached materials are PROPERTIES
 *   M.paintedSteel(0x2b3a8c); M.emissive(0xffd27a, 6);  // parameterised ones are methods
 *   M.setWetness(0..1); M.setDustiness(0..1);           // global weather hooks
 *
 * Mapping
 *   Ground materials (pavements, soils, aggregates, grass, sand) are WORLD
 *   MAPPED: up-facing faces take their UVs from world X/Z (v runs along the
 *   runway, −Z), so no mesh UVs are needed and a 3.5 km runway never shows a
 *   seam. Steep faces fall back to the mesh's own UVs, which must be in METRES
 *   (the same convention as the world builders). A kilometre-scale macro
 *   variation field and a second rotated sample of the albedo hide tiling.
 *   Other materials use mesh UVs in metres; `TILE[name]` is metres per repeat.
 *
 * Weather
 *   Every library material shares a few live uniforms: wetness darkens porous
 *   surfaces, lowers roughness and pools puddles (flat, mirror-smooth patches
 *   driven by the macro field) on up-facing ground; dustiness drifts a fine
 *   khaki film onto up-facing surfaces. `materials.update(dt, sky)` (called by
 *   WeatherSystem) keeps the night-lights factor and time current.
 *
 * Clones made with `material.clone()` keep the library's shader patches.
 */

/** Metres per texture repeat. */
export const TILE = {
  asphaltOld: 8,
  asphaltNew: 6,
  concrete: 10,
  concreteApron: 15,
  sand: 9,
  soilCut: 8,
  soilFill: 8,
  gravelSubbase: 3,
  crushedBase: 2.5,
  dryGrass: 6,
  brick: 2.4,
  plaster: 4,
  tile: 2.4,
  roofMetal: 4,
  marking: 6,
  paint: 3,
  ajrak: 2.4,
};

const VERT_PARS = /* glsl */ `
varying vec3 vHddWorld;
varying float vHddUp;
`;

const VERT_MAIN = /* glsl */ `
{
  vec4 hddWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    hddWp = batchingMatrix * hddWp;
  #endif
  #ifdef USE_INSTANCING
    hddWp = instanceMatrix * hddWp;
  #endif
  hddWp = modelMatrix * hddWp;
  vHddWorld = hddWp.xyz;
  vec3 hddWn = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
  vHddUp = hddWn.y;
  #ifdef HDD_WORLD
    if ( abs( hddWn.y ) > 0.6 ) {
      vec2 hddUv = vec2( hddWp.x, - hddWp.z );
      #ifdef USE_MAP
        vMapUv = ( mapTransform * vec3( hddUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = ( normalMapTransform * vec3( hddUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = ( roughnessMapTransform * vec3( hddUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_METALNESSMAP
        vMetalnessMapUv = ( metalnessMapTransform * vec3( hddUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_AOMAP
        vAoMapUv = ( aoMapTransform * vec3( hddUv, 1.0 ) ).xy;
      #endif
    }
  #endif
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vHddWorld;
varying float vHddUp;
uniform float hddWet;
uniform float hddDust;
uniform vec3 hddDustColor;
uniform float hddPorosity;
uniform float hddPuddles;
uniform float hddMacroAmt;
uniform float hddDustAffinity;
uniform sampler2D hddMacro;
`;

// After <map_fragment>: macro variation, de-tiling, wet darkening, dust film, puddle mask.
const FRAG_MAP = /* glsl */ `
float hddPuddle = 0.0;
float hddWetness = 0.0;
float hddDustCover = 0.0;
{
  float hddUpF = clamp( vHddUp, 0.0, 1.0 );
  vec4 hddMa = texture2D( hddMacro, vHddWorld.xz * ( 1.0 / 640.0 ) );
  vec4 hddMb = texture2D( hddMacro, vHddWorld.xz * ( 1.0 / 73.0 ) );
  #ifdef HDD_WORLD
    #if defined( USE_MAP ) && defined( HDD_DETILE )
      // Second, rotated and rescaled sample blended by the macro field.
      vec2 hddR = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.61 + vec2( 0.37, 0.71 );
      vec4 hddAlt = texture2D( map, hddR );
      float hddW = smoothstep( 0.35, 0.65, hddMb.a );
      diffuseColor.rgb = mix( diffuseColor.rgb, diffuse * hddAlt.rgb, hddW * 0.5 );
    #endif
  #endif
  float hddVar = ( hddMa.r - 0.5 ) * hddMacroAmt + ( hddMb.g - 0.5 ) * hddMacroAmt * 0.6;
  diffuseColor.rgb *= 1.0 + hddVar;
  hddWetness = hddWet * mix( 0.45, 1.0, hddUpF );
  hddPuddle = hddPuddles * hddUpF * smoothstep( 1.0 - hddWet * 0.55, 1.04 - hddWet * 0.55, 1.0 - hddMa.b * 0.6 - hddMb.b * 0.4 + 0.12 );
  diffuseColor.rgb *= 1.0 - hddWetness * hddPorosity - hddPuddle * 0.25;
  hddDustCover = hddDust * hddDustAffinity * ( 0.2 + 0.8 * smoothstep( 0.2, 0.9, vHddUp ) ) * ( 0.75 + 0.5 * hddMb.r ) * ( 1.0 - hddWetness );
  diffuseColor.rgb = mix( diffuseColor.rgb, hddDustColor, clamp( hddDustCover, 0.0, 0.85 ) );
}
`;

// After <roughnessmap_fragment>
const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix( roughnessFactor, 0.12 + roughnessFactor * 0.35, hddWetness * hddPorosity * 1.4 );
roughnessFactor = mix( roughnessFactor, 0.035, hddPuddle );
roughnessFactor = mix( roughnessFactor, max( roughnessFactor, 0.85 ), hddDustCover );
roughnessFactor = clamp( roughnessFactor, 0.03, 1.0 );
`;

// After <normal_fragment_maps>: standing water is optically flat.
const FRAG_NORMAL = /* glsl */ `
normal = normalize( mix( normal, nonPerturbedNormal, hddPuddle ) );
`;

// Glass: Fresnel reflections should not be attenuated by the low base opacity.
const FRAG_GLASS = /* glsl */ `
#ifdef HDD_GLASS
  diffuseColor.a = clamp( diffuseColor.a + dot( totalSpecular, vec3( 0.2126, 0.7152, 0.0722 ) ) * 1.6, 0.0, 1.0 );
#endif
`;

const LIGHT_VERT = /* glsl */ `
attribute vec3 color;
attribute float aPhase;
uniform float uSize;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uScale;
uniform float uTime;
uniform float uStrobe;
varying vec3 vColor;
varying float vBlink;
#include <common>
#include <fog_pars_vertex>
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  float px = uSize * uScale / max( 1.0, - mvPosition.z );
  gl_PointSize = clamp( px, uMinPx, uMaxPx );
  // Strobe (sequenced flashers / "rabbit"): a short pulse whose phase walks along the row.
  float s = fract( uTime * 2.0 - aPhase );
  vBlink = mix( 1.0, smoothstep( 0.12, 0.0, s ) * 2.5, uStrobe );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const LIGHT_FRAG = /* glsl */ `
uniform float uIntensity;
uniform float uOn;
varying vec3 vColor;
varying float vBlink;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length( d ) * 2.0;
  float core = smoothstep( 0.35, 0.0, r );
  float halo = pow( max( 0.0, 1.0 - r ), 3.0 ) * 0.35;
  float a = ( core + halo ) * uOn * vBlink;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor * uIntensity * a, 1.0 );
  #include <fog_fragment>
}
`;

function cloneTex(t, repeat) {
  if (!t) return null;
  const c = t.clone();
  c.repeat.set(1 / repeat, 1 / repeat);
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.needsUpdate = true;
  return c;
}

export class MaterialLibrary {
  constructor(textures = null, quality = null) {
    this.quality = quality;
    this.textures = textures || new TextureLibrary(quality);
    this.cache = new Map();
    this._owned = [];        // materials to dispose
    this._ownedTex = [];     // texture clones to dispose
    this.wetness = 0;
    this.dustiness = 0;
    this.lightsFactor = 0;
    this.uniforms = {
      hddWet: { value: 0 },
      hddDust: { value: 0 },
      hddDustColor: { value: new THREE.Color(0.62, 0.52, 0.38) },
      hddMacro: { value: this.textures.macro() },
      time: { value: 0 },
      lightsOn: { value: 0 },
    };
    this._lightPointMats = new Set();
    const tier = quality && quality.tier ? quality.tier : 'medium';
    this._detile = tier !== 'low';
    if (quality && quality.onChange) {
      this._offQuality = quality.onChange(() => this.applyAnisotropy());
    }
    this._build();
  }

  get anisotropy() {
    return this.quality && this.quality.anisotropy ? this.quality.anisotropy : 4;
  }

  /* ----------------------------------------------------------- internals */

  /** Attach the shared shader patches; `opts` = { world, porosity, puddles, macro, dust, glass }. */
  _decorate(material, opts = {}) {
    const lib = this;
    const o = {
      world: false, porosity: 0.3, puddles: 0, macro: 0.1, dust: 1, glass: false, detile: false, ...opts,
    };
    material.defines = { ...(material.defines || {}) };
    if (o.world) material.defines.HDD_WORLD = '';
    if (o.world && o.detile && this._detile) material.defines.HDD_DETILE = '';
    if (o.glass) material.defines.HDD_GLASS = '';
    material.userData.hdd = o;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.hddWet = lib.uniforms.hddWet;
      shader.uniforms.hddDust = lib.uniforms.hddDust;
      shader.uniforms.hddDustColor = lib.uniforms.hddDustColor;
      shader.uniforms.hddMacro = lib.uniforms.hddMacro;
      shader.uniforms.hddPorosity = { value: material.userData.hdd.porosity };
      shader.uniforms.hddPuddles = { value: material.userData.hdd.puddles };
      shader.uniforms.hddMacroAmt = { value: material.userData.hdd.macro };
      shader.uniforms.hddDustAffinity = { value: material.userData.hdd.dust };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_MAP}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
        .replace('#include <opaque_fragment>', `${FRAG_GLASS}\n#include <opaque_fragment>`);
    };
    // Same source for every library material: programs are shared, keyed by defines.
    material.customProgramCacheKey = () => 'hdd-mat-v1';
    const baseClone = material.clone;
    material.clone = function cloneDecorated() {
      const c = baseClone.call(this);
      lib._decorate(c, { ...this.userData.hdd });
      lib._owned.push(c);
      return c;
    };
    this._owned.push(material);
    return material;
  }

  _set(name, tile, extra = {}) {
    const set = this.textures[name]();
    const map = cloneTex(set.map, tile);
    const normalMap = cloneTex(set.normalMap, tile);
    const orm = cloneTex(set.ormMap, tile);
    for (const t of [map, normalMap, orm]) {
      t.anisotropy = this.anisotropy;
      this._ownedTex.push(t);
    }
    return { map, normalMap, roughnessMap: orm, aoMap: orm, ...extra };
  }

  _std(name, tile, params, deco) {
    const m = new THREE.MeshStandardMaterial({ ...this._set(name, tile), ...params });
    m.name = `hdd:${name}`;
    return this._decorate(m, deco);
  }

  _build() {
    const ns = (x, y = x) => new THREE.Vector2(x, y);
    const ground = (porosity, puddles, macro, detile = true) => ({ world: true, porosity, puddles, macro, detile });

    this.asphaltOld = this._std('asphaltOld', TILE.asphaltOld, { roughness: 1, metalness: 0, normalScale: ns(0.9), aoMapIntensity: 0.9 }, ground(0.32, 1, 0.22));
    this.asphaltNew = this._std('asphaltNew', TILE.asphaltNew, { roughness: 1, metalness: 0, normalScale: ns(0.7), aoMapIntensity: 0.8 }, ground(0.18, 0.8, 0.12));
    this.concrete = this._std('concrete', TILE.concrete, { roughness: 1, metalness: 0, normalScale: ns(0.8), aoMapIntensity: 1 }, ground(0.38, 0.6, 0.16));
    this.concreteApron = this._std('concreteApron', TILE.concreteApron, { roughness: 1, metalness: 0, normalScale: ns(0.8), aoMapIntensity: 1 }, ground(0.36, 0.8, 0.18));
    this.sand = this._std('sand', TILE.sand, { roughness: 1, metalness: 0, normalScale: ns(1.0), aoMapIntensity: 0.6 }, ground(0.42, 0.35, 0.26));
    this.soilCut = this._std('soilCut', TILE.soilCut, { roughness: 1, metalness: 0, normalScale: ns(1.1) }, ground(0.4, 0.9, 0.22));
    this.soilFill = this._std('soilFill', TILE.soilFill, { roughness: 1, metalness: 0, normalScale: ns(1.0) }, ground(0.4, 0.6, 0.18));
    this.gravelSubbase = this._std('gravelSubbase', TILE.gravelSubbase, { roughness: 1, metalness: 0, normalScale: ns(1.2), aoMapIntensity: 1 }, ground(0.3, 0.3, 0.14));
    this.crushedBase = this._std('crushedBase', TILE.crushedBase, { roughness: 1, metalness: 0, normalScale: ns(1.2), aoMapIntensity: 1 }, ground(0.28, 0.3, 0.12));
    this.dryGrass = this._std('dryGrass', TILE.dryGrass, { roughness: 1, metalness: 0, normalScale: ns(1.0) }, ground(0.3, 0.2, 0.3));

    this.brick = this._std('brick', TILE.brick, { roughness: 1, metalness: 0, normalScale: ns(1.0), aoMapIntensity: 1 }, { porosity: 0.3, macro: 0.08 });
    this.plaster = this._std('plaster', TILE.plaster, { roughness: 1, metalness: 0, normalScale: ns(0.6) }, { porosity: 0.22, macro: 0.06 });
    this.tile = this._std('tile', TILE.tile, { roughness: 1, metalness: 0, normalScale: ns(0.4), envMapIntensity: 1.1 }, { porosity: 0.0, macro: 0.03, dust: 0.25 });
    this.roofMetal = this._std('roofMetal', TILE.roofMetal, { roughness: 1, metalness: 1, normalScale: ns(1.0), envMapIntensity: 1.0 }, { porosity: 0.05, macro: 0.08, dust: 0.8 });

    // Pavement paint: Annex 14 white / taxiway yellow, glass-bead sheen, worn.
    const mark = (color) => {
      const set = this._set('markingWear', TILE.marking);
      const m = new THREE.MeshStandardMaterial({
        map: set.map, roughnessMap: set.roughnessMap, color, roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
      });
      m.name = 'hdd:marking';
      return this._decorate(m, { world: true, porosity: 0.15, puddles: 0.6, macro: 0.08 });
    };
    this.markingWhite = mark(new THREE.Color(0.93, 0.93, 0.9));
    this.markingYellow = mark(new THREE.Color(0.96, 0.66, 0.06));

    // Curtain-wall glass: tinted, low base opacity, Fresnel-boosted reflections.
    this.glass = this._decorate(new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.40, 0.55, 0.60),
      metalness: 0.0,
      roughness: 0.04,
      ior: 1.52,
      specularIntensity: 1,
      reflectivity: 0.6,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), { glass: true, porosity: 0, macro: 0, dust: 0.15 });
    this.glass.name = 'hdd:glass';
    // Opaque mirror-glass for distant facades and the tower cab exterior.
    this.glassReflective = this._decorate(new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.20, 0.30, 0.34),
      metalness: 0.85,
      roughness: 0.06,
      envMapIntensity: 1.4,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }), { porosity: 0, macro: 0.02, dust: 0.15 });
    this.glassReflective.name = 'hdd:glassReflective';

    // Ajrak perforated screen: block print + cut-out alphaMap (alphaTest also cuts shadows).
    const aj = this.textures.ajrak();
    const ajMap = cloneTex(aj.map, TILE.ajrak);
    const ajAlpha = cloneTex(aj.alphaMap, TILE.ajrak);
    ajMap.anisotropy = ajAlpha.anisotropy = this.anisotropy;
    this._ownedTex.push(ajMap, ajAlpha);
    const pw = this.textures.paintWear();
    const ajRough = cloneTex(pw.ormMap, TILE.ajrak);
    this._ownedTex.push(ajRough);
    this.ajrakScreen = this._decorate(new THREE.MeshStandardMaterial({
      map: ajMap,
      alphaMap: ajAlpha,
      alphaTest: 0.5,
      roughnessMap: ajRough,
      metalnessMap: ajRough,
      roughness: 1,
      metalness: 0.6,
      side: THREE.DoubleSide,
      envMapIntensity: 0.9,
    }), { porosity: 0.05, macro: 0.04, dust: 0.6 });
    this.ajrakScreen.name = 'hdd:ajrakScreen';
    // Unperforated Ajrak (textile banners, wall panels).
    this.ajrakFabric = this._decorate(new THREE.MeshStandardMaterial({
      map: ajMap, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    }), { porosity: 0.3, macro: 0.03, dust: 0.5 });
    this.ajrakFabric.name = 'hdd:ajrakFabric';
  }

  /* --------------------------------------------------------- public API */

  /** Painted structural steel (cranes, jet bridges, roof trusses), cached per colour. */
  paintedSteel(color = 0xc8c8c8, { roughness = 1, metalness = 1 } = {}) {
    const key = `steel:${new THREE.Color(color).getHexString()}:${roughness}:${metalness}`;
    let m = this.cache.get(key);
    if (!m) {
      const set = this._set('paintWear', TILE.paint);
      m = new THREE.MeshStandardMaterial({
        color, map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: set.roughnessMap, metalnessMap: set.roughnessMap,
        roughness, metalness, envMapIntensity: 1.0,
      });
      m.name = 'hdd:paintedSteel';
      this._decorate(m, { porosity: 0.08, macro: 0.04, dust: 0.7 });
      this.cache.set(key, m);
    }
    return m;
  }

  /**
   * Unlit HDR emissive (window strips, signage, beacons). `intensity` > 1
   * pushes the colour above the bloom threshold. Not fogged away completely:
   * lights stay visible through haze at night.
   */
  emissive(color = 0xffffff, intensity = 2) {
    const c = new THREE.Color(color);
    const key = `emissive:${c.getHexString()}:${intensity}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(intensity) });
      m.toneMapped = false;
      m.name = 'hdd:emissive';
      this.cache.set(key, m);
      this._owned.push(m);
    }
    return m;
  }

  /**
   * Instanced, bloom-friendly point lights in ONE draw call.
   *   lightPoints(positions Float32Array|Vector3[], { color, colors, size (m), intensity,
   *               minPixels, maxPixels, strobe (0/1), phases Float32Array, nightOnly })
   * Returns a THREE.Points; `points.material.uniforms.uIntensity/uOn` are live.
   * With nightOnly (default true) brightness follows the sky's lights factor.
   */
  lightPoints(positions, opts = {}) {
    const {
      color = 0xffe2b0, colors = null, size = 1.4, intensity = 5, minPixels = 1.6, maxPixels = 48,
      strobe = 0, phases = null, nightOnly = true,
    } = opts;
    let pos = positions;
    if (Array.isArray(positions)) {
      pos = new Float32Array(positions.length * 3);
      positions.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
    }
    const n = pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let col = colors;
    if (!col) {
      const c = new THREE.Color(color);
      col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let ph = phases;
    if (!ph) {
      ph = new Float32Array(n);
      for (let i = 0; i < n; i++) ph[i] = i / Math.max(1, n);
    }
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT,
      fragmentShader: LIGHT_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uSize: { value: size },
        uMinPx: { value: minPixels },
        uMaxPx: { value: maxPixels },
        uScale: { value: 900 },
        uTime: { value: 0 },
        uStrobe: { value: strobe },
        uIntensity: { value: intensity },
        uOn: { value: nightOnly ? this.lightsFactor : 1 },
      }]),
      fog: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mat.userData.nightOnly = nightOnly;
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = true;
    points.renderOrder = 10;
    this._lightPointMats.add(mat);
    const lib = this;
    points.onBeforeRender = (renderer, scene, camera) => {
      // Pixel scale: viewport height / (2 tan(fov/2)).
      const h = renderer.getRenderTarget() ? renderer.getRenderTarget().height : renderer.domElement.height;
      if (camera.isPerspectiveCamera) mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      mat.uniforms.uTime.value = lib.uniforms.time.value;
    };
    points.userData.dispose = () => { geo.dispose(); mat.dispose(); lib._lightPointMats.delete(mat); };
    return points;
  }

  /** Alias kept for the brief's naming. */
  lightPoint(positions, opts) {
    return this.lightPoints(positions, opts);
  }

  /** 0 = dry, 1 = monsoon downpour (puddles, darkened porous surfaces, glossy pavement). */
  setWetness(w) {
    this.wetness = THREE.MathUtils.clamp(w || 0, 0, 1);
    this.uniforms.hddWet.value = this.wetness;
  }

  /** 0 = clean, 1 = after a dust storm (khaki film on up-facing surfaces). */
  setDustiness(d) {
    this.dustiness = THREE.MathUtils.clamp(d || 0, 0, 1);
    this.uniforms.hddDust.value = this.dustiness;
  }

  /** 0 = daylight (lights off), 1 = full night; drives lightPoints with nightOnly. */
  setLightsFactor(f) {
    this.lightsFactor = THREE.MathUtils.clamp(f, 0, 1);
    this.uniforms.lightsOn.value = this.lightsFactor;
    for (const m of this._lightPointMats) if (m.userData.nightOnly) m.uniforms.uOn.value = this.lightsFactor;
  }

  /** Per-frame hook (WeatherSystem calls it): time for strobes, lights from the sky. */
  update(dt, sky = null) {
    this.uniforms.time.value += dt;
    if (sky && sky.state && sky.state.lightsFactor !== undefined) this.setLightsFactor(sky.state.lightsFactor);
  }

  applyAnisotropy() {
    const a = this.anisotropy;
    for (const t of this._ownedTex) {
      if (t.anisotropy !== a) {
        t.anisotropy = a;
        t.needsUpdate = true;
      }
    }
  }

  /** Every cached material, for warm-up compiles and QA. */
  list() {
    return this._owned.slice();
  }

  dispose() {
    if (this._offQuality) this._offQuality();
    for (const m of this._owned) m.dispose();
    for (const t of this._ownedTex) t.dispose();
    for (const m of this._lightPointMats) m.dispose();
    this._owned.length = 0;
    this._ownedTex.length = 0;
    this._lightPointMats.clear();
    this.cache.clear();
  }
}
