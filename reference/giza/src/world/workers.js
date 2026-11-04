import * as THREE from 'three';
import { makeRng, lerp, clamp } from '../engine/noise.js';
import { mergeGeometries, box, scaleUvByWorldSize } from './geobuild.js';
import { terrainHeight } from './terrain.js';
import { QUARRY, VILLAGE, PYRAMIDS, HARBOUR, GRANITE_YARD } from './layout.js';

/**
 * The workforce.
 *
 * Every figure on the plateau is one instance of a single mesh; the limbs are
 * animated entirely in the vertex shader from a per-instance phase, so a
 * thousand workers cost the CPU nothing but their root matrices.  Gangs haul
 * sledges along real routes - quarry to ramp, harbour to granite yard - and
 * the number of figures on site is driven by the project simulation's
 * assigned workforce, so a labour shortage is visible from the ground.
 */

/** Distance from the sledge's centre to the front rank of the hauling gang. */
const GANG_LEAD = 5.6;

const LIMB_BODY = 0;
const LIMB_LEG_L = 1;
const LIMB_LEG_R = 2;
const LIMB_ARM_L = 3;
const LIMB_ARM_R = 4;

/** Tag a geometry's vertices with a limb id, a pivot height and a colour. */
function tag(geometry, limb, pivotY, color) {
  const n = geometry.attributes.position.count;
  const limbs = new Float32Array(n).fill(limb);
  const pivots = new Float32Array(n).fill(pivotY);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
  }
  geometry.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  geometry.setAttribute('aPivotY', new THREE.BufferAttribute(pivots, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeTagged(list) {
  const merged = mergeGeometries(list);
  const total = merged.attributes.position.count;
  const limbs = new Float32Array(total);
  const pivots = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    limbs.set(g.attributes.aLimb.array.subarray(0, n), offset);
    pivots.set(g.attributes.aPivotY.array.subarray(0, n), offset);
    colors.set(g.attributes.color.array.subarray(0, n * 3), offset * 3);
    offset += n;
  }
  merged.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  merged.setAttribute('aPivotY', new THREE.BufferAttribute(pivots, 1));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

const SKIN = [0.62, 0.38, 0.22];
const LINEN = [0.93, 0.90, 0.82];
const HAIR = [0.13, 0.10, 0.09];

/** A 1.65 m labourer in a linen kilt: 11 boxes, ~130 triangles. */
function workerGeometry() {
  const parts = [];
  parts.push(tag(box(0.17, 0.76, 0.19, -0.11, 0.38, 0), LIMB_LEG_L, 0.76, SKIN));
  parts.push(tag(box(0.17, 0.76, 0.19, 0.11, 0.38, 0), LIMB_LEG_R, 0.76, SKIN));
  parts.push(tag(box(0.50, 0.30, 0.30, 0, 0.86, 0), LIMB_BODY, 0, LINEN));       // kilt
  parts.push(tag(box(0.42, 0.44, 0.24, 0, 1.18, 0), LIMB_BODY, 0, SKIN));        // torso
  parts.push(tag(box(0.44, 0.10, 0.26, 0, 1.36, 0), LIMB_BODY, 0, LINEN));       // shoulder cloth
  parts.push(tag(box(0.19, 0.21, 0.19, 0, 1.50, 0), LIMB_BODY, 0, SKIN));        // head
  parts.push(tag(box(0.21, 0.09, 0.21, 0, 1.60, -0.01), LIMB_BODY, 0, HAIR));    // hair
  parts.push(tag(box(0.12, 0.58, 0.13, -0.28, 1.06, 0), LIMB_ARM_L, 1.34, SKIN));
  parts.push(tag(box(0.12, 0.58, 0.13, 0.28, 1.06, 0), LIMB_ARM_R, 1.34, SKIN));
  const geo = mergeTagged(parts);
  scaleUvByWorldSize(geo, 0.6);
  return geo;
}

const WORKER_COMMON = /* glsl */ `
  attribute float aLimb;
  attribute float aPivotY;
  attribute vec4 aGait;        // x = stride rate, y = amplitude, z = phase, w = lean
  uniform float uWorkerTime;

  // Limb swing for this vertex, in radians. Legs 1/2 and arms 3/4 alternate.
  float gizaLimbSwing() {
    if (aLimb < 0.5) return 0.0;
    float back = (aLimb == 1.0 || aLimb == 4.0) ? 0.0 : 3.14159265;
    float amp = (aLimb > 2.5) ? aGait.y * 0.55 : aGait.y;
    return sin(uWorkerTime * aGait.x + aGait.z + back) * amp;
  }
`;

function makeWorkerMaterial(baseMaterial) {
  baseMaterial.vertexColors = true;
  baseMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWorkerTime = { value: 0 };
    baseMaterial.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', () => `#include <common>\n${WORKER_COMMON}`)
      // The normal has to be rotated before defaultnormal_vertex consumes it.
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         {
           float sw = gizaLimbSwing();
           float s = sin(sw);
           float c = cos(sw);
           float ny = objectNormal.y;
           float nz = objectNormal.z;
           objectNormal.y = ny * c - nz * s;
           objectNormal.z = ny * s + nz * c;
         }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           float sw = gizaLimbSwing();
           float s = sin(sw);
           float c = cos(sw);
           float dy = transformed.y - aPivotY;
           float dz = transformed.z;
           if (aLimb > 0.5) {
             transformed.y = aPivotY + dy * c - dz * s;
             transformed.z = dy * s + dz * c;
           }
           // Haulers lean into the rope.
           transformed.z += aGait.w * transformed.y * 0.16;
         }`
      );
  };
  return baseMaterial;
}

/** Route: a polyline on the ground that a gang walks, with a loop-back. */
function routeLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += points[i].distanceTo(points[i - 1]);
  return len;
}

function samplePolyline(points, distance, out) {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const seg = points[i].distanceTo(points[i - 1]);
    if (remaining <= seg) {
      const t = seg > 0 ? remaining / seg : 0;
      out.position.copy(points[i - 1]).lerp(points[i], t);
      out.heading = Math.atan2(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      return out;
    }
    remaining -= seg;
  }
  out.position.copy(points[points.length - 1]);
  out.heading = 0;
  return out;
}

function groundPoint(x, z, lift = 0) {
  return new THREE.Vector3(x, terrainHeight(x, z) + lift, z);
}

export class WorkerSystem {
  constructor(scene, textures, quality, pyramidSystem) {
    this.scene = scene;
    this.quality = quality;
    this.pyramids = pyramidSystem;
    this.group = new THREE.Group();
    this.group.name = 'workforce';
    scene.add(this.group);
    this.rng = makeRng(60606);
    this.time = 0;
    this.activityScale = 1;
    this.paused = false;
    /** Called as (x, y, z, strength, driftX, driftZ) when a sledge kicks dust. */
    this.onDust = null;
    this.sledgeDust = 0;

    const wood = textures.wood();
    const lime = textures.limestone();
    this.material = makeWorkerMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 })
    );
    this.sledgeMaterial = new THREE.MeshStandardMaterial({
      map: wood.map, normalMap: wood.normalMap, color: 0xa8834f, roughness: 0.9,
    });
    this.loadMaterial = new THREE.MeshStandardMaterial({
      map: lime.map, normalMap: lime.normalMap, color: 0xccbb99, roughness: 1,
    });

    this.geometry = workerGeometry();
    this.capacity = quality.settings.workerCount;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'workers';
    this.group.add(this.mesh);

    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.geometry.setAttribute('aGait', this.gait);
    const colors = new Float32Array(this.capacity * 3);
    for (let i = 0; i < this.capacity; i++) {
      const t = 0.78 + this.rng() * 0.42;
      colors[i * 3] = t;
      colors[i * 3 + 1] = t * (0.94 + this.rng() * 0.1);
      colors[i * 3 + 2] = t * (0.9 + this.rng() * 0.1);
    }
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    this._buildSledges();
    this._buildRopes();
    this._buildRoutes();
    this._buildAgents();

    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._scale = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._sample = { position: new THREE.Vector3(), heading: 0 };
  }

  _buildSledges() {
    // The sledge is modelled with its runners along local +Z, which is the
    // direction of travel once the route heading is applied - the gang is out
    // in front on the ropes, not alongside.
    const parts = [];
    const L = 4.6;
    const W = 2.2;
    this.sledgeLength = L;
    this.sledgeWidth = W;
    for (const side of [-1, 1]) {
      parts.push(box(0.32, 0.32, L, side * (W / 2 - 0.2), 0.16, 0));
      parts.push(box(0.32, 0.46, 0.5, side * (W / 2 - 0.2), 0.33, L / 2 - 0.1));
      // Towing post the rope is lashed to.
      parts.push(box(0.14, 0.5, 0.14, side * (W / 2 - 0.2), 0.62, L / 2 - 0.25));
    }
    for (let i = 0; i < 4; i++) parts.push(box(W, 0.2, 0.3, 0, 0.42, -L / 2 + 0.7 + i * 1.1));
    const geo = mergeGeometries(parts);
    scaleUvByWorldSize(geo, 0.8);
    this.sledgeGeometry = geo;
    this.sledgeCapacity = 10;
    this.sledges = new THREE.InstancedMesh(geo, this.sledgeMaterial, this.sledgeCapacity);
    this.sledges.castShadow = true;
    this.sledges.frustumCulled = false;
    this.sledges.count = 0;
    this.group.add(this.sledges);

    const load = box(1.6, 1.15, 2.5, 0, 0.58, 0);
    scaleUvByWorldSize(load, 1.0);
    this.loadGeometry = load;
    this.loads = new THREE.InstancedMesh(load, this.loadMaterial, this.sledgeCapacity);
    this.loads.castShadow = true;
    this.loads.frustumCulled = false;
    this.loads.count = 0;
    this.group.add(this.loads);
  }

  /**
   * Haul ropes.
   *
   * Two ropes per sledge, each drawn as a short polyline so it can sag under
   * its own weight between the towing post and the front rank's shoulders.
   * One LineSegments carries every rope on the plateau; the geometry is
   * rewritten in place each frame, which for ten gangs is 240 floats.
   */
  _buildRopes() {
    this.ropeSegments = 5;
    this.ropesPerSledge = 2;
    const verts = this.sledgeCapacity * this.ropesPerSledge * this.ropeSegments * 2;
    this.ropePositions = new Float32Array(verts * 3);
    const geo = new THREE.BufferGeometry();
    this.ropeAttribute = new THREE.BufferAttribute(this.ropePositions, 3);
    this.ropeAttribute.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.ropeAttribute);
    geo.setDrawRange(0, 0);
    this.ropeGeometry = geo;
    this.ropeMaterial = new THREE.LineBasicMaterial({ color: 0x7a6242, transparent: true, opacity: 0.95 });
    this.ropes = new THREE.LineSegments(geo, this.ropeMaterial);
    this.ropes.frustumCulled = false;
    this.ropes.name = 'haul-ropes';
    this.group.add(this.ropes);
    this._ropeCursor = 0;
  }

  /** Write one sagging rope from (ax,ay,az) to (bx,by,bz). */
  _writeRope(ax, ay, az, bx, by, bz) {
    const segs = this.ropeSegments;
    const sag = 0.16 + Math.hypot(bx - ax, bz - az) * 0.055;
    let o = this._ropeCursor;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      for (const t of [t0, t1]) {
        this.ropePositions[o++] = ax + (bx - ax) * t;
        this.ropePositions[o++] = ay + (by - ay) * t - sag * 4 * t * (1 - t);
        this.ropePositions[o++] = az + (bz - az) * t;
      }
    }
    this._ropeCursor = o;
  }

  _buildRoutes() {
    const k = PYRAMIDS.khufu;
    const hb = k.baseLength / 2;
    this.routes = [];

    // Quarry face -> haulage road -> foot of the construction ramp.
    this.routes.push({
      id: 'quarry-run',
      sledge: true,
      points: [
        groundPoint(QUARRY.x - QUARRY.w / 2 - 30, QUARRY.z - QUARRY.d / 2 + 30),
        groundPoint(QUARRY.x - QUARRY.w / 2 - 90, QUARRY.z - 40),
        groundPoint(150, 260),
        groundPoint(40, 235),
        groundPoint(k.x, k.z + hb + 60),
      ],
      speed: 0.85,
      gang: 9,
    });

    // Harbour quay -> granite receiving yard -> pyramid.
    this.routes.push({
      id: 'granite-run',
      sledge: true,
      points: [
        groundPoint(HARBOUR.x - HARBOUR.w / 2 - 20, HARBOUR.z - 30),
        groundPoint(GRANITE_YARD.x + 60, GRANITE_YARD.z + 20),
        groundPoint(GRANITE_YARD.x - 40, GRANITE_YARD.z - 30),
        groundPoint(320, 120),
        groundPoint(k.x + hb + 40, k.z + 40),
      ],
      speed: 0.7,
      gang: 11,
    });

    // Workers' town -> site gate -> works, the daily commute.
    this.routes.push({
      id: 'village-commute',
      sledge: false,
      points: [
        groundPoint(VILLAGE.x - VILLAGE.w / 2 - 20, VILLAGE.z - VILLAGE.d / 2 - 20),
        groundPoint(VILLAGE.x - 60, VILLAGE.z - 200),
        groundPoint(200, 500),
        groundPoint(120, 300),
        groundPoint(k.x + 40, k.z + hb + 30),
      ],
      speed: 1.15,
      gang: 7,
    });

    for (const r of this.routes) r.length = routeLength(r.points);
  }

  _buildAgents() {
    this.agents = [];
    const rng = this.rng;
    let index = 0;

    // ---- haulage and commuting gangs ----
    for (const route of this.routes) {
      const gangs = route.sledge ? 3 : 2;
      for (let g = 0; g < gangs; g++) {
        const offsetDistance = (g / gangs) * route.length;
        const gangId = this.agents.length;
        for (let w = 0; w < route.gang && index < this.capacity; w++) {
          const row = Math.floor(w / 2);
          const side = w % 2 === 0 ? -1 : 1;
          this.agents.push({
            kind: 'route',
            route,
            index,
            gangId,
            distance: offsetDistance,
            lateral: side * (0.7 + (row % 2) * 0.35),
            back: (route.sledge ? GANG_LEAD : 3.2) + row * 1.25,
            phase: rng() * Math.PI * 2,
            lean: route.sledge ? 1 : 0,
            speed: route.speed * (0.94 + rng() * 0.12),
          });
          index++;
        }
      }
    }

    // ---- quarrymen working the benches ----
    for (let i = 0; i < 22 && index < this.capacity; i++) {
      const x = QUARRY.x + (rng() - 0.5) * QUARRY.w * 0.8;
      const z = QUARRY.z + (rng() - 0.5) * QUARRY.d * 0.8;
      this.agents.push({
        kind: 'static',
        index,
        position: groundPoint(x, z),
        heading: rng() * Math.PI * 2,
        phase: rng() * Math.PI * 2,
        rate: 5.5 + rng() * 2.5,
        amp: 0.55,
        lean: 0.25,
      });
      index++;
    }

    // ---- masons on the working course (positions updated each frame) ----
    this.masons = [];
    for (let i = 0; i < 16 && index < this.capacity; i++) {
      const agent = {
        kind: 'mason',
        index,
        edge: i % 4,
        along: (Math.floor(i / 4) + 0.5) / 4 + (rng() - 0.5) * 0.12,
        phase: rng() * Math.PI * 2,
        rate: 4.2 + rng() * 2,
        amp: 0.4,
        lean: 0.15,
      };
      this.agents.push(agent);
      this.masons.push(agent);
      index++;
    }

    // ---- villagers ----
    for (let i = 0; i < 20 && index < this.capacity; i++) {
      const x = VILLAGE.x + (rng() - 0.5) * VILLAGE.w * 0.9;
      const z = VILLAGE.z + (rng() - 0.5) * VILLAGE.d * 0.9;
      this.agents.push({
        kind: 'wander',
        index,
        origin: groundPoint(x, z),
        radius: 8 + rng() * 16,
        angle: rng() * Math.PI * 2,
        angularSpeed: (rng() - 0.5) * 0.28,
        phase: rng() * Math.PI * 2,
        rate: 7.5,
        amp: 0.62,
        lean: 0,
      });
      index++;
    }

    this.mesh.count = index;
    this.activeCount = index;
  }

  /** 0..1 — how much of the modelled workforce is actually on site today. */
  setActivity(fraction) {
    this.activityScale = clamp(fraction, 0, 1);
    this.mesh.count = Math.max(2, Math.round(this.activeCount * this.activityScale));
  }

  _place(agent, x, y, z, heading, rate, amp, lean) {
    this._euler.set(0, heading, 0);
    this._quat.setFromEuler(this._euler);
    this._pos.set(x, y, z);
    this._scale.set(1, 1, 1);
    this._matrix.compose(this._pos, this._quat, this._scale);
    this.mesh.setMatrixAt(agent.index, this._matrix);
    const i = agent.index * 4;
    this.gait.array[i] = rate;
    this.gait.array[i + 1] = amp;
    this.gait.array[i + 2] = agent.phase;
    this.gait.array[i + 3] = lean;
  }

  update(dt, builtHeight) {
    if (this.paused) dt = 0;
    this.time += dt;
    const shader = this.material.userData.shader;
    if (shader) shader.uniforms.uWorkerTime.value = this.time;

    const k = PYRAMIDS.khufu;
    const hb = k.baseLength / 2;
    const workHalf = hb * (1 - builtHeight / PYRAMIDS.khufu.designHeight);

    let sledgeIndex = 0;
    const seenGangs = new Set();
    this._ropeCursor = 0;

    for (const agent of this.agents) {
      if (agent.index >= this.mesh.count) continue;
      if (agent.kind === 'route') {
        agent.distance += agent.speed * dt * 6;
        if (agent.distance > agent.route.length) agent.distance -= agent.route.length;
        const s = samplePolyline(agent.route.points, agent.distance, this._sample);
        const h = s.heading;
        const rx = Math.cos(h);
        const rz = -Math.sin(h);
        // Haulers walk ahead of the sledge - `back` is the distance up the
        // rope from the sledge nose, not a distance behind it.
        const lead = agent.route.sledge ? agent.back : -agent.back * 0.4;
        const px = s.position.x + rx * agent.lateral + Math.sin(h) * lead;
        const pz = s.position.z + rz * agent.lateral + Math.cos(h) * lead;
        const py = terrainHeight(px, pz);
        this._place(agent, px, py, pz, h, 7.2 * agent.speed, 0.62, agent.lean);

        if (agent.route.sledge && !seenGangs.has(agent.gangId) && sledgeIndex < this.sledgeCapacity) {
          seenGangs.add(agent.gangId);
          const sx = s.position.x;
          const sz = s.position.z;
          const sy = terrainHeight(sx, sz);
          this._euler.set(0, h, 0);
          this._quat.setFromEuler(this._euler);
          this._pos.set(sx, sy, sz);
          this._scale.set(1, 1, 1);
          this._matrix.compose(this._pos, this._quat, this._scale);
          this.sledges.setMatrixAt(sledgeIndex, this._matrix);
          this.loads.setMatrixAt(sledgeIndex, this._matrix);
          sledgeIndex++;

          // Ropes: towing post -> front rank's shoulders, one each side.
          const fx = Math.sin(h);
          const fz = Math.cos(h);
          const half = this.sledgeWidth / 2 - 0.2;
          const nose = this.sledgeLength / 2 - 0.25;
          for (const side of [-1, 1]) {
            const ax = sx + fx * nose + rx * half * side;
            const az = sz + fz * nose + rz * half * side;
            const bx = sx + fx * GANG_LEAD + rx * 0.7 * side;
            const bz = sz + fz * GANG_LEAD + rz * 0.7 * side;
            this._writeRope(ax, sy + 0.72, az, bx, terrainHeight(bx, bz) + 1.24, bz);
          }

          // Runners grinding through the sand throw a puff every few metres.
          this.sledgeDust += Math.abs(agent.speed) * dt * 6;
          if (this.onDust && this.sledgeDust > 2.4) {
            const tail = this.sledgeLength / 2;
            this.onDust(sx - fx * tail, sy + 0.15, sz - fz * tail, 1.35, -fx * 0.5, -fz * 0.5);
          }
        }
      } else if (agent.kind === 'static') {
        this._place(
          agent, agent.position.x, agent.position.y, agent.position.z,
          agent.heading, agent.rate, agent.amp, agent.lean
        );
      } else if (agent.kind === 'mason') {
        // Ring the working platform at the current course height.
        const t = agent.along;
        const w = Math.max(2, workHalf - 1.5);
        let px;
        let pz;
        let heading;
        if (agent.edge === 0) { px = lerp(-w, w, t); pz = -w; heading = 0; }
        else if (agent.edge === 1) { px = w; pz = lerp(-w, w, t); heading = -Math.PI / 2; }
        else if (agent.edge === 2) { px = lerp(w, -w, t); pz = w; heading = Math.PI; }
        else { px = -w; pz = lerp(w, -w, t); heading = Math.PI / 2; }
        this._place(agent, k.x + px, k.baseY + builtHeight, k.z + pz, heading, agent.rate, agent.amp, agent.lean);
      } else {
        agent.angle += agent.angularSpeed * dt;
        const px = agent.origin.x + Math.cos(agent.angle) * agent.radius;
        const pz = agent.origin.z + Math.sin(agent.angle) * agent.radius;
        const heading = agent.angle + Math.PI / 2 * Math.sign(agent.angularSpeed || 1);
        this._place(agent, px, terrainHeight(px, pz), pz, heading, agent.rate, agent.amp, agent.lean);
      }
    }

    if (this.sledgeDust > 2.4) this.sledgeDust = 0;
    this.sledges.count = sledgeIndex;
    this.loads.count = sledgeIndex;
    this.ropeGeometry.setDrawRange(0, this._ropeCursor / 3);
    this.ropeAttribute.needsUpdate = true;
    this.sledges.instanceMatrix.needsUpdate = true;
    this.loads.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.gait.needsUpdate = true;
  }

  dispose() {
    this.ropeGeometry.dispose();
    this.ropeMaterial.dispose();
    this.geometry.dispose();
    this.sledgeGeometry.dispose();
    this.loadGeometry.dispose();
    this.material.dispose();
    this.sledgeMaterial.dispose();
    this.loadMaterial.dispose();
  }
}
