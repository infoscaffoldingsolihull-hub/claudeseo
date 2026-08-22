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
