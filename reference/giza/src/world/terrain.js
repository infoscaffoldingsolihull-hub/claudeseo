import * as THREE from 'three';
import { fbm2, ridged2, duneNoise, valueNoise2, clamp, lerp, smoothstep } from '../engine/noise.js';
import { SITE, PYRAMIDS, QUEENS_PYRAMIDS, MENKAURE_QUEENS, SPHINX, TEMPLES, QUARRY, VILLAGE, HARBOUR, NILE, GRANITE_YARD, BOAT_PITS } from './layout.js';

/**
 * The Giza plateau: a single analytic height field plus the meshes that draw it.
 *
 * Everything - the escarpment down to the Nile floodplain, the quarry, the
 * Sphinx enclosure, the harbour basin, the dune sea to the west - is one pure
 * function of (x, z).  Collision, object placement, worker pathing and the
 * terrain mesh all call it, so there is exactly one definition of "the ground"
 * and nothing can ever float or sink.
 */

const FLOODPLAIN_Y = -32.5;
const WIND_RAD = 0.62;   // prevailing north-westerly, in radians

/** Smooth rectangular mask: 1 inside, feathering to 0 over `feather` metres. */
function rectMask(x, z, cx, cz, halfW, halfD, feather) {
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  return smoothstep(halfW + feather, halfW, dx) * smoothstep(halfD + feather, halfD, dz);
}

/** Levelled construction pads. Order matters: later entries win. */
const PADS = [];
for (const p of Object.values(PYRAMIDS)) {
  PADS.push({ x: p.x, z: p.z, hw: p.baseLength / 2 + 26, hd: p.baseLength / 2 + 26, y: p.baseY, feather: 44 });
}
for (const q of [...QUEENS_PYRAMIDS, ...MENKAURE_QUEENS]) {
  PADS.push({ x: q.x, z: q.z, hw: q.baseLength / 2 + 10, hd: q.baseLength / 2 + 10, y: q.baseY, feather: 16 });
}
for (const t of Object.values(TEMPLES)) {
  PADS.push({ x: t.x, z: t.z, hw: t.w / 2 + 12, hd: t.d / 2 + 12, y: t.y, feather: 20 });
}
PADS.push({ x: VILLAGE.x, z: VILLAGE.z, hw: VILLAGE.w / 2 + 30, hd: VILLAGE.d / 2 + 30, y: 3.5, feather: 60 });
PADS.push({ x: GRANITE_YARD.x, z: GRANITE_YARD.z, hw: GRANITE_YARD.w / 2 + 14, hd: GRANITE_YARD.d / 2 + 14, y: -20.0, feather: 40 });

function regionalHeight(x, z) {
  const plateau = clamp(-x * 0.016 + z * 0.008, -6, 48);
  const escarp = smoothstep(540, 1150, x);
  let h = lerp(plateau, FLOODPLAIN_Y, escarp);
  h += smoothstep(950, 2300, z) * 24 * (1 - escarp);
  h += smoothstep(-950, -2400, x) * 32;
  h += smoothstep(-500, -1900, z) * 16 * (1 - escarp);
  return h;
}

/** How much of the surface at (x,z) is bare rock rather than wind-blown sand. */
export function terrainRockFactor(x, z) {
  const escarp = smoothstep(540, 1150, x);
  const plateauCore = rectMask(x, z, -160, 420, 760, 900, 420);
  const quarry = rectMask(x, z, QUARRY.x, QUARRY.z, QUARRY.w / 2 + 20, QUARRY.d / 2 + 20, 60);
  const sphinx = rectMask(x, z, SPHINX.x, SPHINX.z, 90, 60, 40);
  const dunes = clamp(smoothstep(-620, -1500, x) + smoothstep(1250, 2400, z), 0, 1);
  const mottle = fbm2(x * 0.0035, z * 0.0035, 3, 2, 0.5, 88);
  let rock = clamp(plateauCore * 0.82 + quarry * 0.9 + sphinx * 0.85 - escarp * 0.75 - dunes * 0.9, 0, 1);
  rock = clamp(rock * (0.55 + mottle * 0.9), 0, 1);
  return rock;
}

/** THE ground. One function, used by every system. */
export function terrainHeight(x, z) {
  let h = regionalHeight(x, z);

  const escarp = smoothstep(540, 1150, x);
  const duneMask = clamp(smoothstep(-620, -1600, x) + smoothstep(1250, 2500, z), 0, 1) * (1 - escarp);

  // Broad undulation and fine surface texture.
  h += (fbm2(x * 0.00085, z * 0.00085, 4, 2.05, 0.5, 11) - 0.5) * 26 * (1 - escarp * 0.6);
  h += (fbm2(x * 0.0062, z * 0.0062, 3, 2.0, 0.5, 23) - 0.5) * 3.1;

  // Wind-shaped dune field to the west and far south.
  if (duneMask > 0.001) {
    h += duneNoise(x * 0.0042, z * 0.0042, WIND_RAD, 31) * 36 * duneMask;
    h += duneNoise(x * 0.0165, z * 0.0165, WIND_RAD + 0.3, 47) * 5.5 * duneMask;
  }

  // Wind-eroded bedrock ridges on the exposed plateau.
  const plateauMask = rectMask(x, z, -160, 420, 900, 1000, 500) * (1 - escarp);
  if (plateauMask > 0.001) {
    h += (ridged2(x * 0.0055, z * 0.0055, 4, 57) - 0.35) * 7.0 * plateauMask;
  }

  // The wadi that drains the plateau south-east toward the floodplain.
  const wadiT = clamp((x + 140) / 900, 0, 1);
  const wadiCenterZ = 660 + wadiT * 420;
  const wadiWidth = 70 + wadiT * 120;
  const wadi = smoothstep(wadiWidth, wadiWidth * 0.25, Math.abs(z - wadiCenterZ)) *
    smoothstep(-160, 40, x) * (1 - escarp * 0.55);
  h -= wadi * 11;

  // ---- levelled construction pads ----
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const m = rectMask(x, z, p.x, p.z, p.hw, p.hd, p.feather);
    if (m > 0.001) h = lerp(h, p.y, m);
  }

  // ---- quarried cuts ----
  const q = rectMask(x, z, QUARRY.x, QUARRY.z, QUARRY.w / 2, QUARRY.d / 2, 34);
  if (q > 0.001) {
    // Stepped quarry benches rather than a smooth bowl.
    const bench = Math.floor(clamp((z - (QUARRY.z - QUARRY.d / 2)) / QUARRY.d, 0, 0.999) * 3);
    const floorY = -QUARRY.depth + bench * 3.6 + (valueNoise2(x * 0.06, z * 0.06, 5) - 0.5) * 0.7;
    h = lerp(h, floorY, q);
  }

  const sph = rectMask(x, z, SPHINX.x, SPHINX.z, 62, 42, 12);
  if (sph > 0.001) h = lerp(h, SPHINX.enclosureY, sph);

  const harbour = rectMask(x, z, HARBOUR.x, HARBOUR.z, HARBOUR.w / 2, HARBOUR.d / 2, 55);
  if (harbour > 0.001) h = lerp(h, HARBOUR.waterY - 5.5, harbour);

  // Delivery canal linking the harbour basin to the river.
  const canal = smoothstep(60, 22, Math.abs(z - HARBOUR.z)) *
    smoothstep(HARBOUR.x + HARBOUR.w / 2 - 30, HARBOUR.x + HARBOUR.w / 2 + 30, x) *
    smoothstep(NILE.x + 40, NILE.x - 40, x);
  if (canal > 0.001) h = lerp(h, HARBOUR.waterY - 4.5, canal);

  // The river channel itself.
  const river = smoothstep(NILE.width / 2, NILE.width / 2 - 120, Math.abs(x - NILE.x));
  if (river > 0.001) h = lerp(h, NILE.waterY - 6.5, river);

  for (let i = 0; i < BOAT_PITS.length; i++) {
    const p = BOAT_PITS[i];
    const m = rectMask(x, z, p.x, p.z, p.w / 2, p.d / 2, 2.5);
    if (m > 0.001) h = lerp(h, -p.depth, m);
  }

  return h;
}

/** Approximate surface normal by central differences. */
export function terrainNormal(x, z, eps = 1.5, target = new THREE.Vector3()) {
  const hL = terrainHeight(x - eps, z);
  const hR = terrainHeight(x + eps, z);
  const hD = terrainHeight(x, z - eps);
  const hU = terrainHeight(x, z + eps);
  return target.set(hL - hR, 2 * eps, hD - hU).normalize();
}

/**
 * Non-uniform grid warp.
 *
 * The interesting archaeology - the quarry benches, the Sphinx enclosure, the
 * levelled pyramid platforms - is concentrated within a few hundred metres of
 * the origin, while the tile has to reach 2 km to meet the horizon ring.  A
 * uniform grid at a tractable vertex count would smear a 13 m quarry cut into
 * nothing.  Warping the parameter concentrates vertices near the centre:
 * ~9 m cells over the necropolis, ~40 m out at the tile edge, same total count.
 */
function warpAxis(u) {
  const a = Math.abs(u);
  return Math.sign(u) * (0.42 * a + 0.58 * Math.pow(a, 2.6));
}

/** Point on the unit square boundary for perimeter index p of 4N. */
function squareBoundaryPoint(p, n) {
  const side = Math.floor(p / n) % 4;
  const t = (p % n) / n;
  const w = warpAxis(-1 + 2 * t);
  const wr = warpAxis(1 - 2 * t);
  if (side === 0) return [w, -1];
  if (side === 1) return [1, w];
  if (side === 2) return [wr, 1];
  return [-1, wr];
}

function sampleVertex(x, z, positions, colors, rocks, uvs, i, uvScale) {
  const y = terrainHeight(x, z);
  positions[i * 3] = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = z;
  const rock = terrainRockFactor(x, z);
  rocks[i] = rock;
  // Macro tint breaks up texture tiling at long range.
  const tint = 0.86 + fbm2(x * 0.0016, z * 0.0016, 3, 2, 0.5, 77) * 0.32;
  const warm = 0.94 + fbm2(x * 0.0007, z * 0.0007, 2, 2, 0.5, 91) * 0.16;
  colors[i * 3] = tint * warm;
  colors[i * 3 + 1] = tint * (0.97 + (1 - warm) * 0.1);
  colors[i * 3 + 2] = tint * (0.9 + (1 - warm) * 0.25);
  uvs[i * 2] = x * uvScale;
  uvs[i * 2 + 1] = z * uvScale;
}

/** Uniform inner grid over [-half, half]^2 with N divisions. */
function buildInnerGrid(half, n, uvScale) {
  const count = (n + 1) * (n + 1);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const rocks = new Float32Array(count);
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j <= n; j++) {
    const z = half * warpAxis(-1 + (2 * j) / n);
    for (let i = 0; i <= n; i++) {
      const x = half * warpAxis(-1 + (2 * i) / n);
      sampleVertex(x, z, positions, colors, rocks, uvs, j * (n + 1) + i, uvScale);
    }
  }
  const indices = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rocks, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Square annulus from `innerHalf` out to `outerHalf`.
 *
 * `n` MUST be the inner grid's subdivision count: ring 0 then lands on exactly
 * the same coordinates as the inner tile's boundary vertices, so the seam is
 * watertight without any skirt or overlap hack.  Ring radii grow geometrically
 * so 2 km of detail tile reaches a 13 km horizon in sixteen rings.
 */
function buildHorizonRing(innerHalf, outerHalf, n, rings, uvScale) {
  const perim = 4 * n;
  const count = perim * (rings + 1);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const rocks = new Float32Array(count);
  const uvs = new Float32Array(count * 2);
  const growth = Math.pow(outerHalf / innerHalf, 1 / rings);

  for (let r = 0; r <= rings; r++) {
    const s = innerHalf * Math.pow(growth, r);
    for (let p = 0; p < perim; p++) {
      const [u, v] = squareBoundaryPoint(p, n);
      sampleVertex(u * s, v * s, positions, colors, rocks, uvs, r * perim + p, uvScale);
    }
  }

  const indices = new Uint32Array(perim * rings * 6);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    for (let p = 0; p < perim; p++) {
      const pn = (p + 1) % perim;
      const a = r * perim + p;
      const b = r * perim + pn;
      const c = (r + 1) * perim + p;
      const d = (r + 1) * perim + pn;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rocks, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

const WATER_VERT = /* glsl */ `
varying vec2 vWorldXZ;
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */ `
precision highp float;
varying vec2 vWorldXZ;
varying vec3 vWorldPos;
uniform sampler2D uNormalMap;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogDensity;

void main() {
  vec2 uv1 = vWorldXZ * 0.021 + vec2(uTime * 0.013, uTime * 0.008);
  vec2 uv2 = vWorldXZ * 0.049 - vec2(uTime * 0.019, uTime * 0.011);
  vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(n1.x + n2.x, 4.0, n1.y + n2.y));

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.4);

  vec3 base = mix(uDeep, uShallow, clamp(dot(viewDir, n), 0.0, 1.0));
  vec3 color = mix(base, uSkyColor, fresnel * 0.86);

  vec3 h = normalize(uSunDirection + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 260.0);
  color += uSunColor * spec * 2.6;
  float sheen = pow(max(dot(n, h), 0.0), 22.0) * 0.18;
  color += uSunColor * sheen;

  float dist = length(cameraPosition - vWorldPos);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(color, uOpacity);
}
`;

export class TerrainSystem {
  constructor(scene, textures, quality) {
    this.scene = scene;
    this.textures = textures;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.waterMaterials = [];
    this.build();
  }

  build() {
    const s = this.quality.settings;
    const sand = this.textures.sand();
    const rock = this.textures.bedrock();
    const uvScale = 1 / 20;   // one texture repeat per 20 m

    for (const t of [sand.map, sand.normalMap, sand.roughnessMap, rock.map, rock.normalMap, rock.roughnessMap]) {
      t.repeat.set(1, 1);
      t.anisotropy = Math.min(s.anisotropy, this.quality.maxAnisotropy);
      t.needsUpdate = true;
    }

    this.material = new THREE.MeshStandardMaterial({
      map: sand.map,
      normalMap: sand.normalMap,
      roughnessMap: sand.roughnessMap,
      normalScale: new THREE.Vector2(0.52, 0.52),
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true,
      dithering: true,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uRockMap = { value: rock.map };
      shader.uniforms.uRockNormal = { value: rock.normalMap };
      shader.uniforms.uRockRough = { value: rock.roughnessMap };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRock;\nvarying float vRock;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uRockMap;\nuniform sampler2D uRockNormal;\nuniform sampler2D uRockRough;\nvarying float vRock;'
        )
        .replace(
          '#include <map_fragment>',
          // Two incommensurate sample scales per material kill the visible
          // repeat of a 20 m tile seen across two kilometres of open desert.
          `vec4 sandTexel = mix( texture2D( map, vMapUv ),
                                texture2D( map, vMapUv * 0.2673 + vec2( 0.37, 0.11 ) ), 0.42 );
           vec4 rockTexel = mix( texture2D( uRockMap, vMapUv * 0.43 ),
                                texture2D( uRockMap, vMapUv * 0.1123 + vec2( 0.63, 0.29 ) ), 0.4 );
           vec4 sampledDiffuseColor = mix( sandTexel, rockTexel, vRock );
           float macro = texture2D( map, vMapUv * 0.0331 ).g;
           float macro2 = texture2D( uRockMap, vMapUv * 0.0107 ).r;
           sampledDiffuseColor.rgb *= 0.78 + macro * 0.30 + macro2 * 0.22;
           diffuseColor *= sampledDiffuseColor;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
           float rSand = texture2D( roughnessMap, vRoughnessMapUv ).g;
           float rRock = texture2D( uRockRough, vRoughnessMapUv * 0.43 ).g;
           roughnessFactor *= mix( rSand, rRock, vRock );`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `vec3 nSand = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0
                      + texture2D( normalMap, vNormalMapUv * 0.2673 + vec2( 0.37, 0.11 ) ).xyz * 2.0 - 1.0;
           vec3 nRock = texture2D( uRockNormal, vNormalMapUv * 0.43 ).xyz * 2.0 - 1.0;
           vec3 mapN = normalize( mix( nSand, nRock, vRock ) );
           mapN.xy *= normalScale;
           normal = normalize( tbn * mapN );`
        );
      this._shader = shader;
    };

    const half = SITE.terrainSize / 2;
    const n = s.terrainSegments;
    this.innerGeometry = buildInnerGrid(half, n, uvScale);
    this.inner = new THREE.Mesh(this.innerGeometry, this.material);
    this.inner.receiveShadow = true;
    this.inner.castShadow = false;
    this.inner.name = 'terrain-inner';
    this.group.add(this.inner);

    this.ringGeometry = buildHorizonRing(half, SITE.horizonSize / 2, n, 16, uvScale);
    this.ring = new THREE.Mesh(this.ringGeometry, this.material);
    this.ring.receiveShadow = false;
    this.ring.name = 'terrain-horizon';
    this.group.add(this.ring);

    this._buildWater();
  }

  _buildWater() {
    const normalMap = this.textures.waterNormal();
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

    const makeWater = (w, d, x, z, y, opacity) => {
      const geo = new THREE.PlaneGeometry(w, d, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: {
          uNormalMap: { value: normalMap },
          uShallow: { value: new THREE.Color(0x4d7a63) },
          uDeep: { value: new THREE.Color(0x123326) },
          uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color(0xfff0d0) },
          uSkyColor: { value: new THREE.Color(0x9fc3e8) },
          uTime: { value: 0 },
          uOpacity: { value: opacity },
          uFogColor: { value: new THREE.Color(0xd8c39a) },
          uFogDensity: { value: 0.00018 },
        },
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 5;
      this.waterMaterials.push(mat);
      this.group.add(mesh);
      return mesh;
    };

    this.nile = makeWater(NILE.width, SITE.horizonSize * 0.8, NILE.x, 300, NILE.waterY, 0.94);
    this.harbourWater = makeWater(HARBOUR.w, HARBOUR.d, HARBOUR.x, HARBOUR.z, HARBOUR.waterY, 0.92);
    this.canalWater = makeWater(
      NILE.x - (HARBOUR.x + HARBOUR.w / 2) + 80,
      44,
      (HARBOUR.x + HARBOUR.w / 2 + NILE.x) / 2,
      HARBOUR.z,
      HARBOUR.waterY,
      0.92
    );
  }

  /** Rebuild the meshes at a new tessellation after a quality-tier change. */
  rebuild() {
    this.group.remove(this.inner, this.ring);
    this.innerGeometry.dispose();
    this.ringGeometry.dispose();
    const s = this.quality.settings;
    const half = SITE.terrainSize / 2;
    const n = s.terrainSegments;
    const uvScale = 1 / 20;
    this.innerGeometry = buildInnerGrid(half, n, uvScale);
    this.inner = new THREE.Mesh(this.innerGeometry, this.material);
    this.inner.receiveShadow = true;
    this.group.add(this.inner);
    this.ringGeometry = buildHorizonRing(half, SITE.horizonSize / 2, n, 16, uvScale);
    this.ring = new THREE.Mesh(this.ringGeometry, this.material);
    this.group.add(this.ring);
  }

  update(dt, sky, elapsed) {
    for (const mat of this.waterMaterials) {
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uSunDirection.value.copy(sky.sunDirection);
      mat.uniforms.uSunColor.value.copy(sky.sunLight.color).multiplyScalar(0.25 + sky.state.dayFactor);
      mat.uniforms.uSkyColor.value.copy(sky.horizonColor).multiplyScalar(1.1);
      mat.uniforms.uFogColor.value.copy(sky.fog.color);
      mat.uniforms.uFogDensity.value = sky.fog.density;
      const night = sky.state.nightFactor;
      mat.uniforms.uShallow.value.setRGB(lerp(0.30, 0.06, night), lerp(0.48, 0.10, night), lerp(0.39, 0.15, night));
      mat.uniforms.uDeep.value.setRGB(lerp(0.07, 0.015, night), lerp(0.20, 0.03, night), lerp(0.15, 0.06, night));
    }
  }

  dispose() {
    this.innerGeometry.dispose();
    this.ringGeometry.dispose();
    this.material.dispose();
    for (const m of this.waterMaterials) m.dispose();
  }
}
