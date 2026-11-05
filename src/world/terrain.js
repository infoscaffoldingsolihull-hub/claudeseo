import * as THREE from 'three';
import { fbm2, smoothstep, clamp } from '../engine/noise.js';
import { MASTERPLAN } from './layout.js';
import { tileFbm } from './props.js';

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
const FRAG_HEAD = `
uniform sampler2D uNoise;
uniform vec3 uSoilA; uniform vec3 uSoilB; uniform vec3 uSoilC; uniform vec3 uGrass; uniform vec3 uGraded;
uniform vec3 uCrop1; uniform vec3 uCrop2; uniform vec3 uFallow; uniform vec3 uMustard; uniform vec3 uUrban;
uniform float uWet;
varying vec4 vMask;
varying vec2 vWxz;
`;
const FRAG_BODY = `
  vec2 w = vWxz;
  vec4 n1 = texture2D(uNoise, w / 1500.0);
  vec4 n2 = texture2D(uNoise, w / 270.0 + 0.31);
  vec4 n3 = texture2D(uNoise, w / 43.0 + 0.67);
  vec4 n4 = texture2D(uNoise, w / 6.5);
  float macro = n1.r * 0.6 + n2.g * 0.4;
  vec3 soil = mix(uSoilA, uSoilB, smoothstep(0.38, 0.68, macro));
  soil = mix(soil, uSoilC, smoothstep(0.52, 0.78, n2.b) * 0.65);
  float grass = smoothstep(0.42, 0.72, n2.r * 0.45 + n3.g * 0.55) * vMask.r;
  soil = mix(soil, uGrass * (0.85 + 0.3 * n3.a), grass * 0.8);
  soil = mix(soil, uGraded * (0.9 + 0.16 * n3.b), clamp(vMask.g, 0.0, 1.0) * 0.6);
  if (vMask.b > 0.01) {
    float ca = 0.446; // fields follow true north, not the runway
    vec2 rw = vec2(w.x * cos(ca) - w.y * sin(ca), w.x * sin(ca) + w.y * cos(ca));
    vec2 fc = rw / vec2(95.0, 150.0);
    vec2 cell = floor(fc); vec2 f = fract(fc);
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 crop = h < 0.32 ? uCrop1 : (h < 0.55 ? uCrop2 : (h < 0.8 ? uFallow : uMustard));
    crop *= 0.82 + 0.34 * n3.r;
    crop *= 0.92 + 0.08 * sin((h > 0.5 ? f.x : f.y) * 90.0);
    float edge = smoothstep(0.0, 0.02, f.x) * smoothstep(1.0, 0.98, f.x) * smoothstep(0.0, 0.015, f.y) * smoothstep(1.0, 0.985, f.y);
    float farm = smoothstep(0.0, 0.6, vMask.b) * step(0.08, h);
    soil = mix(soil, crop, farm * mix(0.55, 1.0, edge));
  }
  soil = mix(soil, uUrban * (0.88 + 0.24 * n3.r), clamp(vMask.a, 0.0, 1.0) * 0.55);
  soil *= 0.84 + 0.3 * n4.g;
  soil *= 1.0 - uWet * 0.35;
  diffuseColor.rgb *= soil;
`;

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
    this.noise.needsUpdate = true;

    const col = (h) => new THREE.Color(h);
    this.uniforms = {
      uNoise: { value: this.noise },
      uSoilA: { value: col('#b39670') }, uSoilB: { value: col('#94775a') }, uSoilC: { value: col('#cdb58e') },
      uGrass: { value: col('#8b8655') }, uGraded: { value: col('#bea883') },
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
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_BODY}`);
    };
    this.material.customProgramCacheKey = () => 'hdd-terrain';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  setWetness(w) { this.uniforms.uWet.value = w; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.noise.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

