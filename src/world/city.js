import * as THREE from 'three';
import { makeRng } from '../engine/noise.js';
import { GEO } from './layout.js';
import { cityDensity, terrainHeight } from './terrain.js';
import { GeoBuilder, layered } from './props.js';

/**
 * Hyderabad backdrop: a low-poly city of instanced blocks on a north-aligned
 * street grid (mostly 2–6 storeys, a few taller), roof-top water tanks and
 * stair rooms, generic minarets and domes (no specific landmark), arterial
 * roads and — at night — lit windows (shader, per-instance hash) and moving
 * head/tail-light streams. Villages dot the farmland to the east and south.
 */

const NORTH = (GEO.northOffsetDeg * Math.PI) / 180;   // world rotation of the true-north grid
const CELL = 54;

const VILLAGES = [[1900, -900], [2600, 1400], [1600, 3300], [-400, 4800], [3200, -2600], [800, -3800], [-1600, 5200], [4200, 600]];
function villageDensity(x, z) {
  let d = 0;
  for (const [vx, vz] of VILLAGES) {
    const r = Math.hypot(x - vx, z - vz) / 260;
    d = Math.max(d, 0.75 * Math.exp(-r * r));
  }
  return d;
}

const CITY_VERT_HEAD = `
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityN;
varying float vCitySeed;
`;
const CITY_VERT_BODY = `
  vCityLocal = position;
  vCityN = normal;
  #ifdef USE_INSTANCING
    vCityScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vCitySeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #else
    vCityScale = vec3(1.0); vCitySeed = 0.5;
  #endif
`;
const CITY_FRAG_HEAD = `
uniform float uNight;
varying vec3 vCityLocal;
varying vec3 vCityScale;
varying vec3 vCityN;
varying float vCitySeed;
float cityHash(vec3 p) { return fract(sin(dot(p, vec3(17.13, 61.71, 12.97))) * 43758.5453); }
`;
const CITY_FRAG_COLOR = `
  float cWin = 0.0; float cLit = 0.0; vec3 cTint = vec3(1.0, 0.78, 0.5);
  if (abs(vCityN.y) < 0.5) {
    float along = abs(vCityN.x) > 0.5 ? (vCityLocal.z + 0.5) * vCityScale.z : (vCityLocal.x + 0.5) * vCityScale.x;
    float y = vCityLocal.y * vCityScale.y;
    float fl = floor(y / 3.3);
    float col = floor(along / 3.2);
    float fx = fract(along / 3.2); float fy = fract(y / 3.3);
    float top = vCityScale.y - y;
    cWin = step(0.22, fx) * step(fx, 0.78) * step(0.32, fy) * step(fy, 0.82) * step(1.0, top) * step(0.5, along) * step(0.5, (abs(vCityN.x) > 0.5 ? vCityScale.z : vCityScale.x) - along);
    float h = cityHash(vec3(fl, col + (vCityN.x + vCityN.z * 3.0) * 13.0, vCitySeed * 97.0));
    cLit = cWin * step(h, 0.34 + 0.2 * vCitySeed);
    cTint = h < 0.12 ? vec3(0.75, 0.9, 1.0) : (h < 0.25 ? vec3(1.0, 0.92, 0.75) : vec3(1.0, 0.72, 0.42));
    float band = 1.0 - 0.12 * step(fract(y / 3.3), 0.06);
    diffuseColor.rgb *= mix(1.0, 0.38, cWin) * band;
    if (y < 3.3) diffuseColor.rgb *= 0.86;
  } else {
    diffuseColor.rgb *= 0.82;
  }
`;
const CITY_FRAG_EMISSIVE = `
  totalEmissiveRadiance += cTint * cLit * uNight * 1.35;
`;

const MOVE_VERT = `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec2 aT;
  attribute vec3 color;
  uniform float uTime; uniform float uScale;
  varying vec3 vColor;
  void main() {
    float t = fract(uTime * aT.x + aT.y);
    vec3 p = mix(aA, aB, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(0.9 * uScale / max(1.0, -mv.z), 1.2, 9.0);
    vColor = color;
    gl_Position = projectionMatrix * mv;
  }
`;
const MOVE_FRAG = `
  uniform float uIntensity;
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 18.0) * uIntensity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

export class City {
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.M;
    this.group = new THREE.Group();
    this.group.name = 'city';
    ctx.scene.add(this.group);
    this.elements = [];
    this.disposables = [];
    this.uNight = { value: 0 };
    const rng = makeRng(1768);
    const target = (ctx.counts && ctx.counts.city) || 3000;

    // ---- placement on a true-north grid ----
    const cos = Math.cos(NORTH); const sin = Math.sin(NORTH);
    const toWorld = (u, v) => [u * cos + v * sin, -u * sin + v * cos];
    const toGrid = (x, z) => [x * cos - z * sin, x * sin + z * cos];
    const used = new Set();
    const blocks = []; const tanks = []; const rooms = []; const mosques = [];
    let attempts = 0;
    const centre = [-2600, 0];
    const queue = [];
    const place = (iu, iv, dens) => {
      if (iu % 6 === 0 || iv % 6 === 0) return false;          // arterial streets
      const key = `${iu},${iv}`;
      if (used.has(key)) return false;
      used.add(key);
      const [cx, cz] = toWorld(iu * CELL, iv * CELL);
      const isVillage = cityDensity(cx, cz) < 0.05;
      const w = isVillage ? 10 + rng() * 10 : 34 + rng() * 16; const d = isVillage ? 9 + rng() * 9 : 30 + rng() * 18;
      let storeys = isVillage ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(Math.pow(rng(), 1.5) * 5);
      if (!isVillage && dens > 0.6 && rng() < 0.06) storeys += 5 + Math.floor(rng() * 10);
      const h = storeys * 3.3 + 0.6;
      const y = terrainHeight(cx, cz) - 0.5;
      const shade = [0xe9e2d2, 0xe4d6b8, 0xd8c7a6, 0xefe9de, 0xc9b896, 0xd9c6b4, 0xbfc4c0, 0xd5cfb8, 0xe6d2c2, 0xc7d3cf][Math.floor(rng() * 10)];
      blocks.push({ x: cx, y, z: cz, ry: NORTH, sx: w, sy: h, sz: d, color: shade });
      if (rng() < 0.35) {
        const ox = (rng() - 0.5) * (w - 4); const oz = (rng() - 0.5) * (d - 4);
        tanks.push({ x: cx + ox * cos + oz * sin, y: y + h, z: cz - ox * sin + oz * cos, sx: 1.4, sy: 1.6, sz: 1.4, color: rng() < 0.7 ? 0x1c1c1c : 0x2b5aa0 });
      }
      if (rng() < 0.3) rooms.push({ x: cx + (rng() - 0.5) * 6, y: y + h, z: cz + (rng() - 0.5) * 6, ry: NORTH, sx: 4, sy: 2.6, sz: 4, color: shade });
      if (!isVillage && rng() < 0.008 && mosques.length < 26) mosques.push({ x: cx, y: y + 0.2, z: cz, h: 22 + rng() * 18, dome: 7 + rng() * 6 });
      return true;
    };
    // Scan the true-north grid; fill cells with probability ∝ urban density,
    // nearest the airport first so the visible edge is always complete.
    const cand = [];
    const R = 10500;
    for (let iu = Math.floor(-R / CELL) - 60; iu <= Math.ceil(R / CELL) + 60; iu++) {
      for (let iv = Math.floor(-R / CELL) - 60; iv <= Math.ceil(R / CELL) + 60; iv++) {
        if (iu % 6 === 0 || iv % 6 === 0) continue;
        const [x, z] = toWorld(iu * CELL, iv * CELL);
        const dx = x + 300; const dz = z - 300;
        const dist = Math.hypot(dx, dz);
        if (dist > R || dist < 900) continue;
        const city = cityDensity(x, z);
        const dens = city > 0.04 ? city : villageDensity(x, z) * 0.8;
        if (dens < 0.05) continue;
        if (rng() > Math.min(0.96, dens * 1.7)) continue;
        cand.push([iu, iv, dens, dist]);
      }
    }
    cand.sort((p1, p2) => p1[3] - p2[3]);
    let reach = 0;
    for (const [iu, iv, dens, dist] of cand) {
      if (blocks.length >= target) break;
      if (place(iu, iv, dens)) reach = dist;
    }
    this.reach = reach;
    attempts = cand.length;
    this.blockCount = blocks.length;

    // ---- block material with lit windows ----
    this.blockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    this.blockMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this.uNight;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CITY_VERT_HEAD}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${CITY_VERT_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CITY_FRAG_HEAD}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${CITY_FRAG_COLOR}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CITY_FRAG_EMISSIVE}`);
    };
    this.blockMat.customProgramCacheKey = () => 'hdd-city-blocks';
    this.disposables.push(this.blockMat);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    this.disposables.push(unit);
    const inst = (geo, mat, items, name, shadows = false) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3(); const c = new THREE.Color();
      items.forEach((it, i) => {
        q.setFromEuler(new THREE.Euler(0, it.ry || 0, 0));
        mtx.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx || 1, it.sy || 1, it.sz || 1));
        m.setMatrixAt(i, mtx);
        m.setColorAt(i, c.set(it.color === undefined ? 0xffffff : it.color));
      });
      m.count = items.length;
      m.castShadow = shadows; m.receiveShadow = true;
      m.name = name;
      m.computeBoundingSphere();
      this.group.add(m);
      return m;
    };
    this.blocks = inst(unit, this.blockMat, blocks, 'city-blocks', false);
    const tankGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false); tankGeo.translate(0, 0.5, 0);
    this.disposables.push(tankGeo);
    this.plainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.disposables.push(this.plainMat);
    this.tanks = inst(tankGeo, this.plainMat, tanks, 'roof-tanks');
    this.rooms = inst(unit, this.blockMat, rooms, 'roof-rooms');

    // ---- generic minarets & domes ----
    const mb = new GeoBuilder();
    for (const m of mosques) {
      mb.box(26, 8, 26, m.x, m.y, m.z, 0xece6da, NORTH);
      mb.cyl(m.dome * 0.9, 3, m.x, m.y + 8, m.z, 0xece6da, 16);
      const dome = new THREE.SphereGeometry(m.dome, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      mb.add(dome, new THREE.Matrix4().makeTranslation(m.x, m.y + 11, m.z), 0xd9e3e0);
      dome.dispose();
      for (const s of [-1, 1]) {
        const [ox, oz] = [s * 15 * Math.cos(NORTH), -s * 15 * Math.sin(NORTH)];
        mb.cyl(1.4, m.h, m.x + ox, m.y, m.z + oz, 0xf2ede4, 10, 0.8);
        mb.cyl(2.0, 0.8, m.x + ox, m.y + m.h * 0.75, m.z + oz, 0xd0c8b8, 10);
        mb.cyl(1.2, 3.5, m.x + ox, m.y + m.h, m.z + oz, 0xf2ede4, 10, 0.9);
        mb.cyl(1.2, 2.2, m.x + ox, m.y + m.h + 3.5, m.z + oz, 0xd9e3e0, 10, 0.05);
      }
    }
    this.mosques = new THREE.Mesh(mb.build(), this.M.paint);
    this.mosques.name = 'city-domes-minarets';
    this.mosques.receiveShadow = true;
    this.group.add(this.mosques);
    this.disposables.push(this.mosques.geometry);

    // ---- arterial roads + moving lights ----
    const roads = new GeoBuilder();
    const paths = [];
    for (let k = -9; k <= 9; k++) {
      for (const dir of [0, 1]) {
        let run = [];
        const flush = () => { if (run.length > 2) paths.push(run); run = []; };
        for (let s = -9000; s <= 9000; s += 180) {
          const u = dir === 0 ? k * 6 * CELL * 2 : s; const v = dir === 0 ? s : k * 6 * CELL * 2;
          const [x, z] = toWorld(u, v);
          const [wx, wz] = [x + centre[0], z + centre[1]];
          const ok = cityDensity(wx, wz) > 0.45 && Math.hypot(wx + 300, wz - 300) < Math.min(9000, reach + 150);
          if (ok) run.push([wx, terrainHeight(wx, wz) + 0.25, wz]); else flush();
        }
        flush();
      }
    }
    for (const run of paths) {
      for (let i = 0; i < run.length - 1; i++) {
        const [ax, ay, az] = run[i]; const [bx, by, bz] = run[i + 1];
        const L = Math.hypot(bx - ax, bz - az); const nx = -(bz - az) / L * 5; const nz = (bx - ax) / L * 5;
        roads.quad3([ax - nx, ay, az - nz], [ax + nx, ay, az + nz], [bx + nx, by, bz + nz], [bx - nx, by, bz - nz], 0xc8c2b8);
      }
    }
    this.roadMat = layered(Object.assign(this.M.asphaltOld.clone(), { vertexColors: true }), 1, null);
    this.disposables.push(this.roadMat);
    this.roads = new THREE.Mesh(roads.build(), this.roadMat);
    this.roads.receiveShadow = true;
    this.roads.name = 'city-roads';
    this.group.add(this.roads);
    this.disposables.push(this.roads.geometry);

    const lanes = [];
    for (const run of paths) for (let i = 0; i < run.length - 1; i++) lanes.push([run[i], run[i + 1]]);
    const lsPath = ctx.world && ctx.world.landside && ctx.world.landside.roadPath;
    if (lsPath) {
      for (let i = 0; i < lsPath.length - 1; i++) {
        const [ax, az] = lsPath[i]; const [bx, bz] = lsPath[i + 1];
        lanes.push([[ax, terrainHeight(ax, az) + 1, az], [bx, terrainHeight(bx, bz) + 1, bz], true]);
      }
    }
    const nCars = Math.min(2400, Math.max(300, Math.round(target * 0.4)));
    const A = new Float32Array(nCars * 3); const B = new Float32Array(nCars * 3); const T = new Float32Array(nCars * 2); const C = new Float32Array(nCars * 3);
    for (let i = 0; i < nCars && lanes.length; i++) {
      const lane = lanes[Math.floor(rng() * lanes.length)];
      const fwd = rng() < 0.5;
      const [p0, p1] = fwd ? [lane[0], lane[1]] : [lane[1], lane[0]];
      const L = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) || 1;
      const off = fwd ? 2.5 : -2.5; const nx = -(p1[2] - p0[2]) / L * off; const nz = (p1[0] - p0[0]) / L * off;
      A.set([p0[0] + nx, p0[1] + 0.7, p0[2] + nz], i * 3); B.set([p1[0] + nx, p1[1] + 0.7, p1[2] + nz], i * 3);
      T.set([(10 + rng() * 6) / L, rng()], i * 2);
      const head = rng() < 0.5;
      C.set(head ? [3.2, 3.0, 2.6] : [3.2, 0.25, 0.15], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nCars * 3), 3));
    mg.setAttribute('aA', new THREE.BufferAttribute(A, 3));
    mg.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    mg.setAttribute('aT', new THREE.BufferAttribute(T, 2));
    mg.setAttribute('color', new THREE.BufferAttribute(C, 3));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(-2600, 0, 0), 12000);
    this.moveMat = new THREE.ShaderMaterial({
      vertexShader: MOVE_VERT, fragmentShader: MOVE_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uIntensity: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.carLights = new THREE.Points(mg, this.moveMat);
    this.carLights.name = 'city-car-lights';
    this.carLights.renderOrder = 21;
    this.group.add(this.carLights);
    this.disposables.push(mg, this.moveMat);
  }

  update(dt, t, env) {
    this.uNight.value = env.lights;
    const u = this.moveMat.uniforms;
    u.uTime.value = t;
    u.uIntensity.value = env.lights;
    const cam = env.camera;
    const r = this.ctx.world.engine.renderer;
    const h = r && r.domElement ? r.domElement.height : 900;
    u.uScale.value = h / (2 * Math.tan(((cam && cam.fov ? cam.fov : 58) * Math.PI) / 360));
    this.carLights.visible = env.lights > 0.02;
  }

  dispose() {
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    for (const m of [this.blocks, this.tanks, this.rooms]) if (m) m.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
