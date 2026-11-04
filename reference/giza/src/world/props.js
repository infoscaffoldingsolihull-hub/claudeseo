import * as THREE from 'three';
import { makeRng, fbm2, clamp, lerp, smoothstep } from '../engine/noise.js';
import { mergeGeometries, box, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight, terrainRockFactor, terrainNormal } from './terrain.js';
import { QUARRY, HARBOUR, NILE, SITE } from './layout.js';

/**
 * Environment dressing: boulders, desert scrub, tamarisk and date palms along
 * the river, wind-blown sand, footprints in the dust, and the torch system that
 * lights the site after dark and the pyramid's passages at any hour.
 *
 * Everything here is instanced or shader-driven; the CPU cost per frame is a
 * handful of matrix writes for the torch lights and nothing else.
 */

/* --------------------------------------------------------------- rocks */

function rockGeometry(rng, detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 1.6 + 10, v.z * 1.6 + v.y * 0.8, 3, 2.1, 0.5, Math.floor(rng() * 1000));
    v.multiplyScalar(0.72 + n * 0.62);
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  scaleUvByWorldSize(geo, 1.4);
  return geo;
}

export class RockField {
  constructor(scene, textures, quality, collision) {
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    scene.add(this.group);
    const rng = makeRng(31337);
    const count = quality.settings.rockCount;
    const set = textures.bedrock();
    const material = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      roughness: 1.0,
      metalness: 0,
      vertexColors: true,
    });
    this.material = material;

    // Two silhouettes: rounded boulders and angular quarry spoil.
    this.geometries = [rockGeometry(rng, 1), rockGeometry(rng, 0)];
    for (const g of this.geometries) {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }

    const buckets = [[], []];
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scaleV = new THREE.Vector3();
    const posV = new THREE.Vector3();
    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 12) {
      attempts++;
      const x = (rng() - 0.5) * SITE.terrainSize * 0.92;
      const z = (rng() - 0.5) * SITE.terrainSize * 0.92;
      const rock = terrainRockFactor(x, z);
      const nearQuarry =
        Math.abs(x - QUARRY.x) < QUARRY.w * 0.75 && Math.abs(z - QUARRY.z) < QUARRY.d * 0.75;
      const density = clamp(rock * 0.85 + (nearQuarry ? 0.7 : 0), 0, 1);
      if (rng() > density) continue;
      const y = terrainHeight(x, z);
      if (y < NILE.waterY + 1) continue;

      const angular = nearQuarry || rng() < 0.4;
      const s = lerp(0.35, nearQuarry ? 2.6 : 1.9, Math.pow(rng(), 2.1));
      euler.set(rng() * 0.5 - 0.25, rng() * Math.PI * 2, rng() * 0.5 - 0.25);
      quat.setFromEuler(euler);
      scaleV.set(s * (0.7 + rng() * 0.6), s * (0.6 + rng() * 0.5), s * (0.7 + rng() * 0.6));
      posV.set(x, y + scaleV.y * 0.35, z);
      matrix.compose(posV, quat, scaleV);
      const tint = 0.72 + rng() * 0.42;
      buckets[angular ? 1 : 0].push({ matrix: matrix.clone(), tint });
      placed++;
    }

    this.meshes = [];
    for (let i = 0; i < 2; i++) {
      const list = buckets[i];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.geometries[i], material, list.length);
      const colors = new Float32Array(list.length * 3);
      for (let j = 0; j < list.length; j++) {
        mesh.setMatrixAt(j, list[j].matrix);
        const t = list[j].tint;
        colors[j * 3] = t;
        colors[j * 3 + 1] = t * 0.96;
        colors[j * 3 + 2] = t * 0.88;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.count = placed;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}

/* ---------------------------------------------------------- vegetation */

function scrubGeometry(rng) {
  const parts = [];
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng() * 0.5;
    const lean = 0.25 + rng() * 0.5;
    const h = 0.5 + rng() * 0.75;
    const g = new THREE.BoxGeometry(0.055, h, 0.055);
    const m = new THREE.Matrix4()
      .makeRotationZ(Math.cos(a) * lean)
      .multiply(new THREE.Matrix4().makeRotationX(Math.sin(a) * lean));
    m.setPosition(Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12);
    g.applyMatrix4(m);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function palmGeometry(rng) {
  const parts = [];
  const h = 7 + rng() * 4.5;
  const trunkSegs = 8;
  for (let i = 0; i < trunkSegs; i++) {
    const t = i / trunkSegs;
    const y = t * h;
    const r = lerp(0.34, 0.2, t);
    const lean = Math.sin(t * 1.6) * 0.5;
    parts.push(box(r * 2, h / trunkSegs + 0.06, r * 2, lean, y + h / trunkSegs / 2, 0));
  }
  const fronds = 11;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const droop = 0.5 + rng() * 0.45;
    const len = 2.6 + rng() * 1.5;
    const g = new THREE.BoxGeometry(len, 0.07, 0.42);
    const m = new THREE.Matrix4().makeRotationY(a);
    m.multiply(new THREE.Matrix4().makeRotationZ(-droop));
    m.setPosition(Math.cos(a) * len * 0.42, h + 0.35 - droop * 0.7, Math.sin(a) * len * 0.42);
    g.applyMatrix4(m);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export class Vegetation {
  constructor(scene, quality) {
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    const rng = makeRng(9182);
    const scrubMat = new THREE.MeshStandardMaterial({
      color: 0x6f6a3c,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    const palmMat = new THREE.MeshStandardMaterial({
      color: 0x4e6b34,
      roughness: 0.95,
      metalness: 0,
      vertexColors: true,
    });
    this.materials = [scrubMat, palmMat];

    const scrubGeo = scrubGeometry(rng);
    const palmGeo = palmGeometry(rng);
    for (const g of [scrubGeo, palmGeo]) {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    this.geometries = [scrubGeo, palmGeo];

    const scrubCount = quality.settings.vegetationCount;
    const palmCount = Math.max(14, Math.round(scrubCount * 0.16));

    this.scrub = this._scatter(scrubGeo, scrubMat, scrubCount, rng, (x, z) => {
      // Scrub clings to the wadi floor and the damp margins of the floodplain.
      const wet = smoothstep(700, 1500, x) * (1 - smoothstep(NILE.x - 260, NILE.x, x));
      const wadi = smoothstep(150, 40, Math.abs(z - (660 + clamp((x + 140) / 900, 0, 1) * 420)));
      return clamp(wet * 0.8 + wadi * 0.35 + 0.03, 0, 1);
    }, 0.6, 1.7);

    this.palms = this._scatter(palmGeo, palmMat, palmCount, rng, (x, z) => {
      const bank = smoothstep(NILE.x - 470, NILE.x - 330, x) * (1 - smoothstep(NILE.x - 330, NILE.x - 250, x));
      const harbour = smoothstep(150, 60, Math.abs(z - HARBOUR.z)) * smoothstep(HARBOUR.x - 240, HARBOUR.x - 150, x) *
        (1 - smoothstep(HARBOUR.x - 150, HARBOUR.x - 90, x));
      return clamp(bank + harbour * 0.7, 0, 1);
    }, 0.8, 1.25);
  }

  _scatter(geometry, material, count, rng, densityFn, minScale, maxScale) {
    const matrices = [];
    const colors = [];
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scaleV = new THREE.Vector3();
    const posV = new THREE.Vector3();
    let attempts = 0;
    while (matrices.length < count && attempts < count * 40) {
      attempts++;
      const x = (rng() - 0.5) * SITE.terrainSize * 1.1;
      const z = (rng() - 0.5) * SITE.terrainSize * 1.1;
      if (rng() > densityFn(x, z)) continue;
      const y = terrainHeight(x, z);
      if (y < NILE.waterY + 0.6 || y > 60) continue;
      const s = lerp(minScale, maxScale, rng());
      quat.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
      scaleV.set(s * (0.85 + rng() * 0.3), s, s * (0.85 + rng() * 0.3));
      posV.set(x, y - 0.05, z);
      matrix.compose(posV, quat, scaleV);
      matrices.push(matrix.clone());
      const t = 0.72 + rng() * 0.5;
      colors.push(t, t * (0.94 + rng() * 0.16), t * 0.82);
    }
    if (!matrices.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors), 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/* --------------------------------------------------------- footprints */

export class Footprints {
  constructor(scene, textures, capacity = 200) {
    this.capacity = capacity;
    this.cursor = 0;
    this.count = 0;
    this.side = 1;
    const geo = new THREE.PlaneGeometry(0.46, 0.72);
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.material = new THREE.MeshBasicMaterial({
      map: textures.footprint(),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      color: 0x40342a,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'footprints';
    scene.add(this.mesh);
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._pos = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._euler = new THREE.Euler();
  }

  stamp(position, yaw) {
    this.side *= -1;
    const offX = Math.cos(yaw) * 0.19 * this.side;
    const offZ = -Math.sin(yaw) * 0.19 * this.side;
    const x = position.x + offX;
    const z = position.z + offZ;
    const y = terrainHeight(x, z) + 0.035;
    terrainNormal(x, z, 1.0, this._normal);
    this._euler.set(0, yaw, 0, 'YXZ');
    this._quat.setFromEuler(this._euler);
    this._pos.set(x, y, z);
    this._matrix.compose(this._pos, this._quat, this._scale);
    this.mesh.setMatrixAt(this.cursor, this._matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    this.mesh.count = this.count;
  }

  clear() {
    this.count = 0;
    this.cursor = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* -------------------------------------------------- airborne particles */

const PARTICLE_VERT = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform vec3 uOrigin;
uniform vec3 uExtent;
uniform vec3 uVelocity;
uniform float uScale;
varying float vFade;

void main() {
  vec3 p = position;
  // Advect and wrap inside a box that follows the camera.
  p += uVelocity * (uTime + aSeed * 120.0);
  p = mod(p - uOrigin + uExtent * 0.5, uExtent) - uExtent * 0.5 + uOrigin;
  p.y += sin(uTime * (0.4 + aSeed) + aSeed * 20.0) * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vFade = smoothstep(uExtent.x * 0.55, uExtent.x * 0.12, dist) * smoothstep(1.5, 8.0, dist);
  gl_PointSize = aSize * uScale * (60.0 / max(dist, 1.0));
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.08, length(d));
  gl_FragColor = vec4(uColor, a * vFade * uOpacity);
}
`;

/** Wind-blown sand (exterior) and hanging dust (interior) share one implementation. */
export class ParticleField {
  constructor(scene, { count, extent, velocity, color, size, opacity, blending }) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    const rng = makeRng(777);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * extent.x;
      positions[i * 3 + 1] = (rng() - 0.5) * extent.y;
      positions[i * 3 + 2] = (rng() - 0.5) * extent.z;
      seeds[i] = rng();
      sizes[i] = size * (0.4 + rng() * 1.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uExtent: { value: new THREE.Vector3(extent.x, extent.y, extent.z) },
        uVelocity: { value: new THREE.Vector3(velocity.x, velocity.y, velocity.z) },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uScale: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: blending || THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  update(elapsed, cameraPosition, opacity, pixelRatio) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uOrigin.value.copy(cameraPosition);
    u.uOpacity.value = opacity;
    u.uScale.value = pixelRatio;
  }

  set visible(v) {
    this.points.visible = v;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* -------------------------------------------------------------- torches */

const FLAME_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uScale;
varying vec2 vUv;
varying float vPhase;
void main() {
  vUv = uv;
  vPhase = aPhase;
  vec4 world = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(0.0, 1.0, 0.0);
  float flick = 0.86 + 0.28 * sin(uTime * 11.0 + aPhase * 6.283) * sin(uTime * 7.3 + aPhase * 12.0);
  float sx = length(vec3(instanceMatrix[0])) * uScale;
  float sy = length(vec3(instanceMatrix[1])) * uScale * flick;
  vec3 offset = camRight * position.x * sx + up * (position.y + 0.5) * sy;
  offset += camRight * sin(uTime * 6.0 + aPhase * 9.0) * position.y * 0.06 * sy;
  gl_Position = projectionMatrix * viewMatrix * vec4(world.xyz + offset, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying float vPhase;
void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 9.0 + uTime * 8.0 + vPhase * 6.283) * 0.035 * uv.y;
  vec4 c = texture2D(uMap, uv);
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
}
`;

export class TorchSystem {
  constructor(scene, textures, quality, { capacity = 220 } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.capacity = capacity;
    this.torches = [];
    this.group = new THREE.Group();
    this.group.name = 'torches';
    scene.add(this.group);

    const quad = new THREE.PlaneGeometry(1, 1);
    this.flameGeometry = quad;
    const phases = new Float32Array(capacity);
    const rng = makeRng(505);
    for (let i = 0; i < capacity; i++) phases[i] = rng();
    quad.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

    this.flameMaterial = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: {
        uMap: { value: textures.flame() },
        uTime: { value: 0 },
        uScale: { value: 1 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flames = new THREE.InstancedMesh(quad, this.flameMaterial, capacity);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 8;
    this.group.add(this.flames);

    const glowQuad = new THREE.PlaneGeometry(1, 1);
    glowQuad.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.glowGeometry = glowQuad;
    this.glowMaterial = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: {
        uMap: { value: textures.glow() },
        uTime: { value: 0 },
        uScale: { value: 1 },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glows = new THREE.InstancedMesh(glowQuad, this.glowMaterial, capacity);
    this.glows.count = 0;
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 7;
    this.group.add(this.glows);

    this.lights = [];
    this._rebuildLights();
    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._time = 0;
  }

  _rebuildLights() {
    for (const l of this.lights) this.group.remove(l);
    this.lights = [];
    const n = this.quality.settings.torchLights;
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffa860, 0, 26, 2.0);
      light.castShadow = false;
      light.visible = false;
      this.group.add(light);
      this.lights.push(light);
    }
  }

  add(x, y, z, { scale = 1, interior = false, alwaysLit = false } = {}) {
    if (this.torches.length >= this.capacity) return -1;
    const index = this.torches.length;
    this.torches.push({ position: new THREE.Vector3(x, y, z), scale, interior, alwaysLit, lit: 1 });
    this._pos.set(x, y, z);
    this._scale.set(0.62 * scale, 1.15 * scale, 1);
    this._matrix.compose(this._pos, this._quat, this._scale);
    this.flames.setMatrixAt(index, this._matrix);
    this._scale.set(4.4 * scale, 4.4 * scale, 1);
    this._matrix.compose(this._pos, this._quat, this._scale);
    this.glows.setMatrixAt(index, this._matrix);
    this.flames.count = this.torches.length;
    this.glows.count = this.torches.length;
    this.flames.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    return index;
  }

  /**
   * Assign the limited PointLight budget to the torches nearest the camera.
   * `exteriorFactor` fades the outdoor torches out during daylight.
   */
  update(dt, cameraPosition, exteriorFactor, interiorMode) {
    this._time += dt;
    this.flameMaterial.uniforms.uTime.value = this._time;
    this.glowMaterial.uniforms.uTime.value = this._time;

    const flameOpacity = interiorMode ? 1 : clamp(exteriorFactor * 1.4, 0, 1);
    this.flameMaterial.uniforms.uOpacity.value = flameOpacity;
    this.glowMaterial.uniforms.uOpacity.value = flameOpacity * (interiorMode ? 0.22 : 0.5);
    this.flames.visible = flameOpacity > 0.02;
    this.glows.visible = flameOpacity > 0.02;

    if (!this.lights.length || flameOpacity <= 0.02) {
      for (const l of this.lights) l.visible = false;
      return;
    }

    // Partial selection of the N nearest torches - no full sort needed.
    const budget = this.lights.length;
    const best = [];
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      if (t.interior !== interiorMode && !t.alwaysLit) continue;
      const d = t.position.distanceToSquared(cameraPosition);
      if (d > 4900) continue;
      if (best.length < budget) {
        best.push({ i, d });
        if (best.length === budget) best.sort((a, b) => a.d - b.d);
      } else if (d < best[budget - 1].d) {
        best[budget - 1] = { i, d };
        best.sort((a, b) => a.d - b.d);
      }
    }

    for (let k = 0; k < this.lights.length; k++) {
      const light = this.lights[k];
      if (k >= best.length) {
        light.visible = false;
        continue;
      }
      const t = this.torches[best[k].i];
      light.position.copy(t.position).setY(t.position.y + 0.35 * t.scale);
      const flicker =
        0.78 +
        0.22 * Math.sin(this._time * 9.3 + best[k].i * 2.1) +
        0.12 * Math.sin(this._time * 21.7 + best[k].i);
      light.intensity = (interiorMode ? 5.5 : 13.0) * t.scale * flicker * flameOpacity;
      light.distance = (interiorMode ? 18 : 30) * t.scale;
      light.visible = true;
    }
  }

  applyQuality() {
    this._rebuildLights();
  }

  dispose() {
    this.flameGeometry.dispose();
    this.glowGeometry.dispose();
    this.flameMaterial.dispose();
    this.glowMaterial.dispose();
  }
}

/** Wooden torch posts / braziers, merged into one static mesh. */
export function buildTorchPosts(positions, material) {
  const parts = [];
  for (const p of positions) {
    const s = p.scale || 1;
    parts.push(box(0.16 * s, 2.0 * s, 0.16 * s, p.x, p.y - 1.0 * s, p.z));
    parts.push(box(0.42 * s, 0.3 * s, 0.42 * s, p.x, p.y + 0.05 * s, p.z));
  }
  if (!parts.length) return null;
  const geo = mergeGeometries(parts);
  scaleUvByWorldSize(geo, 0.7);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

/* ------------------------------------------------------------ dust puffs */

const PUFF_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aPuff;      // x = spawn time, y = life, z = base size, w = seed
attribute vec3 aDrift;
uniform float uTime;
varying float vAlpha;
varying vec2 vUv;

void main() {
  float age = (uTime - aPuff.x) / max(aPuff.y, 0.001);
  vUv = uv;
  if (age < 0.0 || age > 1.0) {
    // Retired puffs collapse to a degenerate point behind the camera.
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Expand quickly, then linger and fade; the puff also lifts and drifts.
  float grow = 0.35 + 1.15 * sqrt(age);
  float size = aPuff.z * grow;
  vec3 centre = aOrigin + aDrift * age + vec3(0.0, 0.55 * age * age, 0.0);
  vAlpha = (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.12, age);

  // Billboard: build the quad in view space so it always faces the camera.
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  float spin = aPuff.w * 6.2831853 + age * (aPuff.w - 0.5) * 1.4;
  float c = cos(spin);
  float s = sin(spin);
  vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
}
`;

const PUFF_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vUv;

void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.15, r);
  // A soft interior gradient stops the puff reading as a flat disc.
  a *= 0.55 + 0.45 * smoothstep(1.0, 0.35, r);
  gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
}
`;

/**
 * A ring buffer of billboarded dust puffs.
 *
 * Every puff is one instance of a unit quad; the whole animation - growth,
 * drift, spin and fade - runs in the vertex shader from a spawn time, so
 * emitting a puff costs four attribute writes and nothing per frame.
 */
export class DustPuffs {
  constructor(scene, { capacity = 120, color = 0xf0e3c8, opacity = 0.62 } = {}) {
    this.capacity = capacity;
    this.cursor = 0;
    this.time = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    quad.dispose();
    this.origins = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.puffs = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.drifts = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    // Spawn every slot far in the past so nothing is drawn until it is used.
    for (let i = 0; i < capacity; i++) this.puffs.array[i * 4] = -1000;
    geo.setAttribute('aOrigin', this.origins);
    geo.setAttribute('aPuff', this.puffs);
    geo.setAttribute('aDrift', this.drifts);
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'dust-puffs';
    scene.add(this.mesh);
  }

  /** Emit one puff. `strength` scales size and lifetime (a sprint kicks more). */
  emit(x, y, z, strength = 1, driftX = 0, driftZ = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.origins.array[i * 3] = x;
    this.origins.array[i * 3 + 1] = y;
    this.origins.array[i * 3 + 2] = z;
    const p = i * 4;
    this.puffs.array[p] = this.time;
    this.puffs.array[p + 1] = 0.75 + strength * 0.85;
    this.puffs.array[p + 2] = 0.62 * strength;
    this.puffs.array[p + 3] = (i * 0.6180339887) % 1;
    this.drifts.array[i * 3] = driftX;
    this.drifts.array[i * 3 + 1] = 0.32 + strength * 0.2;
    this.drifts.array[i * 3 + 2] = driftZ;
    this.origins.needsUpdate = true;
    this.puffs.needsUpdate = true;
    this.drifts.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.puffs.array[i * 4] = -1000;
    this.puffs.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ----------------------------------------------------------------- birds */

const BIRD_VERT = /* glsl */ `
attribute float aWing;     // -1 = left wing, +1 = right wing, 0 = body
attribute float aSpan;     // 0 at the shoulder, 1 at the tip
attribute vec3 aFlap;      // x = beat rate, y = phase, z = how much it soars
uniform float uTime;
varying float vShade;

void main() {
  vec3 p = position;
  if (abs(aWing) > 0.5) {
    // Kites and vultures hold the wing out and beat rarely, so the beat is
    // gated by a slow envelope: mostly a flat soaring profile, with bursts.
    float burst = smoothstep(0.15, 0.75, sin(uTime * 0.21 + aFlap.y * 0.7));
    float beatGain = mix(burst, 1.0, 1.0 - aFlap.z);
    float beat = sin(uTime * aFlap.x + aFlap.y) * beatGain;
    // The tip travels furthest: the wing bends along its span rather than
    // pivoting rigidly, which is what makes a beat read as a wing and not
    // as a hinge.
    float bend = aSpan * aSpan;
    p.y += beat * 0.52 * bend;
    // Held slightly above the horizontal even at rest - the dihedral that
    // makes a soaring bird a shallow V from head-on.
    p.y += 0.16 * bend;
    p.x *= 1.0 - abs(beat) * 0.20 * bend;
    vShade = 0.72 + 0.28 * (1.0 - abs(beat) * bend);
  } else {
    vShade = 1.0;
  }
  vec4 world = instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * world;
}
`;

const BIRD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vShade;
void main() {
  // Underwing catches the sky and reads paler than the back; the varying
  // carries the wing's own angle so the silhouette is not a flat cut-out.
  gl_FragColor = vec4(uColor * vShade, uOpacity);
}
`;

/**
 * Ibis and egret flocks working the Nile margin.
 *
 * Each bird is a three-triangle glider; the wingbeat is a vertex-shader
 * function of a per-instance rate and phase, so a hundred birds cost the CPU
 * one matrix each and the GPU almost nothing.  They fly slow circuits at
 * different radii and heights, which gives the eastern sky some life without
 * competing for attention with the monuments.
 */
/**
 * Birds over the plateau.
 *
 * Egyptian vultures and black kites are the two raptors that actually work
 * this escarpment, and they work it the same way: circle up a thermal off the
 * hot limestone, glide across, circle up again.  So the flocks here are pinned
 * to the things that make thermals - the pyramid faces, the quarry, the
 * harbour - rather than to a point out over the river, which is where they
 * used to be and where nobody standing on the plateau could ever see them.
 *
 * Each bird flies its own slowly-drifting spiral, and the whole flock is
 * skipped when the camera is far from its centre.
 */

/** Thermal sources: birds circle over these. Radius is the spiral's size. */
const THERMALS = [
  { x: 0, z: -60, y: 210, radius: 130, weight: 3 },      // over Khufu
  { x: -252, z: 418, y: 205, radius: 120, weight: 2 },   // over Khafre
  { x: -594, z: 862, y: 150, radius: 95, weight: 1 },    // over Menkaure
  { x: 268, z: 366, y: 95, radius: 150, weight: 2 },     // the quarry
  { x: 336, z: 522, y: 78, radius: 110, weight: 2 },     // the Sphinx enclosure
  { x: 300, z: 1010, y: 88, radius: 160, weight: 1 },    // the workers' town
];

export class BirdFlock {
  constructor(scene, { count = 60, seed = 4242 } = {}) {
    const rng = makeRng(seed);
    // Body, two cranked wings and a fanned tail.  Each wing is two panels so
    // it can bend along its span instead of hinging as one rigid plate.
    const P = [];
    const wing = [];
    const span = [];
    const push = (verts, w, spans) => {
      for (let i = 0; i < 3; i++) {
        P.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
        wing.push(w);
        span.push(spans[i]);
      }
    };
    // Body: a dart along -Z, which is the direction of travel.
    push([0, 0, -1.05, -0.14, 0, 0.46, 0.14, 0, 0.46], 0, [0, 0, 0]);
    // Tail: a fan behind the body.
    push([-0.14, 0, 0.46, 0, 0, 0.95, 0.14, 0, 0.46], 0, [0, 0, 0]);
    for (const side of [-1, 1]) {
      const s = side;
      // Inner panel, shoulder to the crank.
      push([s * 0.10, 0, -0.34, s * 0.62, 0, -0.22, s * 0.10, 0, 0.38], s, [0, 0.5, 0]);
      push([s * 0.62, 0, -0.22, s * 0.58, 0, 0.30, s * 0.10, 0, 0.38], s, [0.5, 0.5, 0]);
      // Outer panel, crank to the tip: swept back, as a soaring wing is.
      push([s * 0.62, 0, -0.22, s * 1.28, 0, 0.16, s * 0.58, 0, 0.30], s, [0.5, 1, 0.5]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(wing), 1));
    geo.setAttribute('aSpan', new THREE.BufferAttribute(new Float32Array(span), 1));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x4a4034) },
        uOpacity: { value: 1 },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // Hand the birds out among the thermals in proportion to their weight.
    const pool = [];
    for (const t of THERMALS) for (let i = 0; i < t.weight; i++) pool.push(t);

    const flap = new Float32Array(count * 3);
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const t = pool[i % pool.length];
      const soars = rng() < 0.72;
      const bird = {
        thermal: t,
        radius: t.radius * (0.32 + rng() * 0.68),
        angle: rng() * Math.PI * 2,
        // Everything in one thermal turns the same way, as real birds do.
        speed: (0.06 + rng() * 0.07) * (t.x + t.z > 0 ? 1 : -1),
        // Spread through the column: some low over the stone, some specks.
        height: t.y * (0.28 + rng() * 0.85),
        climb: 0.5 + rng() * 1.6,
        climbRate: 0.05 + rng() * 0.06,
        bobAmp: 0.8 + rng() * 2.4,
        bobRate: 0.3 + rng() * 0.5,
        scale: soars ? 3.4 + rng() * 2.2 : 2.2 + rng() * 1.4,
      };
      this.birds.push(bird);
      flap[i * 3] = soars ? 3.2 + rng() * 1.8 : 5.5 + rng() * 3.0;
      flap[i * 3 + 1] = rng() * Math.PI * 2;
      flap[i * 3 + 2] = soars ? 1 : 0;
    }
    this.flap = new THREE.InstancedBufferAttribute(flap, 3);
    geo.setAttribute('aFlap', this.flap);

    this.time = 0;
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3();
  }

  update(dt, cameraPosition, light = 1) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    // Dark against a bright sky, and all but gone once the sun is down.
    this.material.uniforms.uOpacity.value = 0.3 + light * 0.7;
    this.mesh.visible = true;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const t = b.thermal;
      b.angle += b.speed * dt;
      // The spiral breathes: the bird works up the column and slides back
      // down it, so the flock never looks like beads on a wire.
      const climb = Math.sin(this.time * b.climbRate + b.angle * 0.3) * b.climb;
      const r = b.radius * (0.88 + 0.12 * Math.sin(this.time * 0.07 + b.angle));
      const x = t.x + Math.cos(b.angle) * r;
      const z = t.z + Math.sin(b.angle) * r;
      const y = b.height + climb * 12 + Math.sin(this.time * b.bobRate + b.angle) * b.bobAmp;
      // Heading is the tangent to the circle; the dart points down -Z, so the
      // yaw that maps -Z onto the velocity is atan2(-vx, -vz). Bank into the turn.
      const vx = -Math.sin(b.angle) * b.speed;
      const vz = Math.cos(b.angle) * b.speed;
      const heading = Math.atan2(-vx, -vz);
      // Pitch a little nose-up while climbing, nose-down while sinking.
      const pitch = THREE.MathUtils.clamp(-climb * 0.06, -0.16, 0.16);
      this._euler.set(pitch, heading, b.speed > 0 ? -0.30 : 0.30, 'YXZ');
      this._quat.setFromEuler(this._euler);
      this._pos.set(x, y, z);
      this._scale.setScalar(b.scale);
      this._matrix.compose(this._pos, this._quat, this._scale);
      this.mesh.setMatrixAt(i, this._matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* -------------------------------------------------------------- pennants */

const PENNANT_VERT = /* glsl */ `
attribute float aAnchor;   // 0 at the mast, 1 at the free end
attribute float aPhase;
uniform float uTime;
uniform float uWind;
varying vec3 vColor;
varying float vShade;

void main() {
  vec3 p = position;
  float t = aAnchor;
  // A travelling wave whose amplitude grows with distance from the mast.
  float wave = sin(uTime * 2.6 + aPhase - t * 6.5) * t * t;
  float lift = sin(uTime * 1.7 + aPhase * 1.3 - t * 3.1) * t;
  p.z += wave * 0.85 * uWind;
  p.y += lift * 0.30 * uWind - t * t * 0.55 * (1.0 - uWind);
  vColor = color;
  // Fake the cloth's own shading from the slope of the wave.
  vShade = 0.72 + 0.28 * cos(uTime * 2.6 + aPhase - t * 6.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const PENNANT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vShade;
uniform vec3 uLight;
void main() {
  gl_FragColor = vec4(vColor * vShade * uLight, 1.0);
}
`;

/**
 * Linen standards on the temple flagstaffs.
 *
 * Old Kingdom temple gates carried tall cedar masts with coloured streamers -
 * the hieroglyph for "god" is one of them.  Each streamer is a strip of
 * quads whose free end is displaced by a travelling wave in the vertex
 * shader, so the whole set of them is a single draw call that never touches
 * the CPU after construction.
 */
export class Pennants {
  constructor(scene, sites, mastMaterial) {
    this.sites = sites || [];
    this.time = 0;
    if (!this.sites.length) return;

    const LENGTH = 6.6;
    const WIDTH = 1.15;
    const SEGMENTS = 10;
    const cloth = [];
    const masts = [];
    const anchors = [];
    const phases = [];
    const colors = [];
    const palette = [
      [0.78, 0.20, 0.16], [0.93, 0.90, 0.84], [0.16, 0.44, 0.46],
      [0.85, 0.66, 0.20], [0.30, 0.26, 0.52],
    ];

    for (let s = 0; s < this.sites.length; s++) {
      const site = this.sites[s];
      // Both masts at one gate fly the same colour.
      const tint = palette[Math.floor(s / 2) % palette.length];
      const phase = (s * 1.7) % (Math.PI * 2);
      const top = site.y + site.height;
      const dirX = Math.cos(site.yaw || 0);
      const dirZ = -Math.sin(site.yaw || 0);
      masts.push(box(0.48, site.height, 0.48, site.x, site.y + site.height / 2, site.z));
      masts.push(box(0.78, 0.5, 0.78, site.x, top + 0.24, site.z));

      // The streamer is built in its own local frame and baked into world
      // space, so one geometry carries every pennant on the plateau.
      const positions = new Float32Array(SEGMENTS * 6 * 3);
      const anch = new Float32Array(SEGMENTS * 6);
      let o = 0;
      for (let i = 0; i < SEGMENTS; i++) {
        const t0 = i / SEGMENTS;
        const t1 = (i + 1) / SEGMENTS;
        const quad = [[t0, 0], [t1, 0], [t1, 1], [t0, 0], [t1, 1], [t0, 1]];
        for (const [t, v] of quad) {
          const along = t * LENGTH;
          positions[o * 3] = site.x + dirX * along;
          positions[o * 3 + 1] = top - 0.35 - v * WIDTH;
          positions[o * 3 + 2] = site.z + dirZ * along;
          anch[o] = t;
          o++;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      cloth.push(g);
      for (let i = 0; i < anch.length; i++) {
        anchors.push(anch[i]);
        phases.push(phase);
        colors.push(tint[0], tint[1], tint[2]);
      }
    }

    const geo = mergeGeometries(cloth);
    for (const g of cloth) g.dispose();
    geo.setAttribute('aAnchor', new THREE.BufferAttribute(new Float32Array(anchors), 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(phases), 1));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PENNANT_VERT,
      fragmentShader: PENNANT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 1 },
        uLight: { value: new THREE.Color(1, 1, 1) },
      },
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'pennants';
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.mastGeometry = mergeGeometries(masts);
    scaleUvByWorldSize(this.mastGeometry, 0.8);
    this.masts = new THREE.Mesh(this.mastGeometry, mastMaterial);
    this.masts.castShadow = true;
    this.masts.name = 'flagstaffs';
    scene.add(this.masts);
  }

  /** `light` is the sky's day factor: the linen goes dark with the sun. */
  update(dt, light = 1) {
    if (!this.material) return;
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    // A slow gust cycle so the standards are never quite still.
    this.material.uniforms.uWind.value = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 0.17));
    const l = 0.22 + light * 0.9;
    this.material.uniforms.uLight.value.setRGB(l, l * 0.98, l * 0.94);
  }

  dispose() {
    if (this.geometry) this.geometry.dispose();
    if (this.mastGeometry) this.mastGeometry.dispose();
    if (this.material) this.material.dispose();
  }
}
