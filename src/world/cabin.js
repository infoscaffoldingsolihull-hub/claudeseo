import * as THREE from 'three';
import { createAircraft, AIRLINE_LIVERIES } from './aircraft.js';
import { GeoBuilder } from './props.js';
import { fbm2 } from '../engine/noise.js';
import {
  JourneyState, JOURNEY_STEPS, STEP_IDS, makeBoardingPass, filletPath, speedProfile, buildTimeline, FLIGHT_LABELS,
} from '../game/journey.js';

/**
 * Passenger journey runtime (simulated): from the forecourt doors through
 * check-in, passport control, security, the lounge, the gate and the jet
 * bridge into a procedural narrow-body cabin — then a seated first-person
 * flight: push-back, taxi, take-off from Hyderabad, a climb through a cloud
 * deck, cruise above it, descent and landing.
 *
 *   createCabin(spec, livery)  procedural single-aisle cabin (seats, bins, windows…)
 *   FlightClouds               self-contained cloud deck used only during the flight
 *   FlightPlan                 deterministic flight profile sampled by time
 *   JourneyRunner              guide, interactables, HUD, seated camera, flight
 *
 * Everything here is invented and labelled simulated: airline, flight number,
 * destination label, cabin, schedule.
 */

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ================================================================ cabin */

/** Bake soft "cabin light" shading into vertex colours (the cabin is unlit MeshBasic). */
function bakeShade(geo, y0) {
  const n = geo.attributes.normal; const p = geo.attributes.position; const c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i); const nz = n.getZ(i); const nx = n.getX(i);
    let s;
    if (ny > 0.6) s = 1.0;
    else if (ny < -0.6) s = 0.8;
    else s = 0.84 + 0.05 * nz - 0.03 * Math.abs(nx);
    const h = clamp((p.getY(i) - y0) / 1.7, 0, 1);
    s *= 0.72 + 0.28 * Math.sqrt(h);
    c.setXYZ(i, c.getX(i) * s, c.getY(i) * s, c.getZ(i) * s);
  }
  c.needsUpdate = true;
}

function roundedRect(shape, x, y, w, h, r) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/**
 * A single-aisle economy cabin in the aircraft's local frame (nose +Z, left = +X).
 * Returns { group, Y0, seats: Map('14F' → { eye, cushion, row, letter }), colliders:[[x0,y0,z0,x1,y1,z1]],
 *           doorway, panes (material), lamps (material), zFront, zRear, zDoor, dispose }.
 */
export function createCabin(spec, livery = {}) {
  const Y0 = spec.cy - spec.R * 0.25;          // cabin floor = door sill
  const L2 = spec.length / 2;
  const zDoor = L2 - spec.doors[0].d;
  const zFront = zDoor + 0.8;
  const pitch = 0.79;
  const row1 = zDoor - 1.15;
  const ROWS = 26;
  const rowZ = (r) => row1 - (r - 1) * pitch - (r > 10 ? 0.24 : 0);
  const zRear = rowZ(ROWS) - 0.8;
  const fabric = new THREE.Color(livery.secondary || '#23317a');
  const fabricHex = fabric.clone().lerp(new THREE.Color('#1c2236'), 0.25).getHex();
  const accent = new THREE.Color(livery.tail || '#8e1a2e').getHex();
  const b = new GeoBuilder({ worldUV: false });
  const lamps = new GeoBuilder({ worldUV: false });
  const ife = new GeoBuilder({ worldUV: false });
  const panesB = new GeoBuilder({ worldUV: false });
  const colliders = [];
  const wallC = 0xe9e6df; const binC = 0xf1efea; const seamC = 0xb9b5ad; const carpet = 0x3b4152; const runner = 0x4a3a52;

  // ---- floor (carpet + aisle runner)
  b.box(3.8, 0.04, zFront - zRear, 0, Y0 - 0.04, (zFront + zRear) / 2, carpet);
  b.box(0.7, 0.012, zFront - zRear - 0.4, 0, Y0, (zFront + zRear) / 2, runner);
  colliders.push([-1.95, Y0 - 0.4, zRear - 0.2, 1.95, Y0, zFront + 0.2]);

  // ---- sidewalls with window openings (tilted panels following the fuselage)
  const xb = 1.83; const ybase = Y0 + 0.55; const xt = 1.64; const ytop = Y0 + 1.56;
  const PL = Math.hypot(xt - xb, ytop - ybase);
  const tx = (xt - xb) / PL; const ty = (ytop - ybase) / PL;     // panel up-direction (left wall)
  const ox = ty; const oy = -tx;                                  // outward normal (left wall)
  const WV = 0.47; const WW = 0.27; const WH = 0.37; const WR = 0.1;
  const windows = [];
  {
    const w = spec.windows;
    for (let d = w.from; d <= w.to + 1e-6; d += w.pitch) {
      if (w.gaps.some(([a, c]) => d > a && d < c)) continue;
      const z = L2 - d;
      if (z > zFront - 0.35 || z < zRear + 0.35 || Math.abs(z - zDoor) < 0.75) continue;
      windows.push(z);
    }
  }
  const mapPanel = (geo, side) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i); const v = p.getY(i); const w = p.getZ(i);
      p.setXYZ(i, side * (xb + v * tx + w * ox), ybase + v * ty + w * oy, u);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const I4 = new THREE.Matrix4();
  for (const side of [1, -1]) {
    const shape = new THREE.Shape();
    shape.moveTo(zRear, 0); shape.lineTo(zFront, 0); shape.lineTo(zFront, PL); shape.lineTo(zRear, PL); shape.lineTo(zRear, 0);
    for (const z of windows) shape.holes.push(roundedRect(new THREE.Path(), z - WW / 2, WV - WH / 2, WW, WH, WR));
    if (side === 1) shape.holes.push(new THREE.Path().moveTo(zDoor - 0.48, 0.02).lineTo(zDoor + 0.48, 0.02).lineTo(zDoor + 0.48, PL - 0.02).lineTo(zDoor - 0.48, PL - 0.02).lineTo(zDoor - 0.48, 0.02));
    const wall = mapPanel(new THREE.ShapeGeometry(shape, 4), side);
    b.add(wall, I4, wallC); wall.dispose();
    // bezels + reveals: an extruded ring per window, cap facing the cabin, sides running out to the skin
    for (const z of windows) {
      const ring = roundedRect(new THREE.Shape(), z - WW / 2 - 0.07, WV - WH / 2 - 0.08, WW + 0.14, WH + 0.16, WR + 0.06);
      ring.holes.push(roundedRect(new THREE.Path(), z - WW / 2, WV - WH / 2, WW, WH, WR));
      const ex = new THREE.ExtrudeGeometry(ring, { depth: 0.17, bevelEnabled: false, curveSegments: 5 });
      ex.translate(0, 0, -0.025);
      const g = mapPanel(ex, side);
      b.add(g, I4, 0xf7f5f0); g.dispose();
      // outer pane (whitens inside cloud), slightly inset into the reveal
      const pane = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), z - WW / 2, WV - WH / 2, WW, WH, WR), 4);
      pane.translate(0, 0, 0.13);
      const pg = mapPanel(pane, side);
      panesB.add(pg, I4, 0xffffff); pg.dispose();
      // a few shades part-way down
      const k = Math.abs(Math.round(z * 7.3 + side * 3)) % 5;
      if (k === 0 || k === 3) {
        const f = k === 0 ? 0.55 : 0.3;
        const sh = new THREE.PlaneGeometry(WW - 0.02, WH * f);
        sh.translate(z, WV + WH / 2 - (WH * f) / 2, 0.06);
        const sg = mapPanel(sh, side);
        b.add(sg, I4, 0xd9d6cf); sg.dispose();
      }
    }
    // dado (vertical lower wall) + skirting
    b.box(0.04, 0.55, zFront - zRear, side * 1.85, Y0, (zFront + zRear) / 2, 0xdcd8cf);
    b.box(0.05, 0.08, zFront - zRear, side * 1.82, Y0, (zFront + zRear) / 2, 0x6b6f78);
    // collision: side wall (door gap on the left)
    if (side === 1) {
      colliders.push([1.84, Y0, zRear - 0.2, 2.1, Y0 + 2.3, zDoor - 0.58]);
      colliders.push([1.84, Y0, zDoor + 0.58, 2.1, Y0 + 2.3, zFront + 0.2]);
    } else colliders.push([-2.1, Y0, zRear - 0.2, -1.84, Y0 + 2.3, zFront + 0.2]);

    // overhead bins: an extruded section along the cabin, with door seams and latches
    const sec = new THREE.Shape();
    sec.moveTo(1.66, Y0 + 1.55); sec.lineTo(1.05, Y0 + 1.6); sec.quadraticCurveTo(1.0, Y0 + 1.82, 1.1, Y0 + 2.03);
    sec.lineTo(1.42, Y0 + 2.12); sec.lineTo(1.6, Y0 + 1.86); sec.lineTo(1.66, Y0 + 1.55);
    const bins = new THREE.ExtrudeGeometry(sec, { depth: zFront - zRear - 0.9, bevelEnabled: false, curveSegments: 6 });
    bins.translate(0, 0, zRear + 0.2);
    const bm = new THREE.Matrix4().makeScale(side, 1, 1);
    b.add(bins, bm, binC); bins.dispose();
    for (let z = zRear + 0.2; z <= zFront - 0.7; z += 1.58) {
      b.boxR(0.02, 0.44, 0.025, side * 1.03, Y0 + 1.82, z, seamC, 0, 0, side * 0.2);
      b.boxR(0.03, 0.05, 0.16, side * 1.055, Y0 + 1.97, z + 0.79, 0x8d9097, 0, 0, side * 0.2);
    }
    // passenger service units under the bins: reading lights, vents, seat-belt signs
    for (let r = 1; r <= ROWS; r++) {
      const z = rowZ(r) + 0.15;
      b.box(0.52, 0.025, 0.42, side * 1.36, Y0 + 1.54, z, 0xd8d5ce);
      for (const k of [0, 1, 2]) lamps.box(0.04, 0.012, 0.04, side * (1.18 + k * 0.13), Y0 + 1.525, z - 0.08, 0xffffff);
      for (const k of [0, 1, 2]) b.cyl(0.022, 0.02, side * (1.18 + k * 0.13), Y0 + 1.505, z + 0.07, 0x9a9da3, 8);
      if (r % 3 === 1) ife.box(0.14, 0.02, 0.07, side * 1.3, Y0 + 1.515, z + 0.16, 0xffffff);
    }
    // indirect cove light along the bin tops and a ceiling light line
    lamps.box(0.06, 0.02, zFront - zRear - 1.2, side * 1.08, Y0 + 2.06, (zFront + zRear) / 2, 0xffffff);
    // seats (triples): A B C on the left, D E F on the right; facing +Z
    const letters = side === 1 ? ['C', 'B', 'A'] : ['D', 'E', 'F'];
    const xs = [0.68, 1.12, 1.56];
    for (let r = 1; r <= ROWS; r++) {
      const rz = rowZ(r);
      for (let k = 0; k < 3; k++) {
        const x = side * xs[k];
        b.box(0.42, 0.04, 0.42, x, Y0 + 0.34, rz + 0.03, 0x2a2d33);           // pan
        b.box(0.41, 0.11, 0.47, x, Y0 + 0.38, rz + 0.06, fabricHex);          // cushion
        b.boxR(0.42, 0.74, 0.1, x, Y0 + 0.84, rz - 0.21, fabricHex, -0.17, 0, 0); // backrest
        b.boxR(0.36, 0.19, 0.115, x, Y0 + 1.14, rz - 0.25, 0xf2f0ea, -0.17, 0, 0); // headrest cover
        b.boxR(0.36, 0.035, 0.12, x, Y0 + 1.05, rz - 0.255, accent, -0.17, 0, 0);
        b.boxR(0.42, 0.72, 0.03, x, Y0 + 0.83, rz - 0.275, 0x6b707a, -0.17, 0, 0); // shell
        b.boxR(0.33, 0.23, 0.012, x, Y0 + 0.66, rz - 0.287, 0x8a8f98, -0.17, 0, 0); // tray table
        b.boxR(0.26, 0.09, 0.015, x, Y0 + 0.43, rz - 0.255, 0x4a4e57, -0.17, 0, 0); // seat pocket
        ife.boxR(0.2, 0.125, 0.01, x, Y0 + 0.98, rz - 0.293, 0xffffff, -0.17, 0, 0); // seat-back screen
        b.box(0.05, 0.08, 0.46, x - side * 0.215, Y0 + 0.56, rz + 0.02, 0x3a3e46); // armrests
      }
      b.box(0.05, 0.08, 0.46, side * (xs[2] + 0.215), Y0 + 0.56, rz + 0.02, 0x3a3e46);
      b.box(0.05, 0.36, 0.05, side * 0.8, Y0, rz + 0.1, 0x55595f);
      b.box(0.05, 0.36, 0.05, side * 1.45, Y0, rz + 0.1, 0x55595f);
      if (r === 10) {   // over-wing exit row marker light
        lamps.box(0.03, 0.06, 0.16, side * 1.62, Y0 + 1.42, rz + 0.5, 0xffffff);
      }
      for (let k = 0; k < 3; k++) {
        const L = letters[k];
        // (stored below with world-independent local coordinates)
        seatsOut.push({ row: r, letter: L, id: `${r}${L}`, eye: new THREE.Vector3(side * xs[k] - side * 0.02, Y0 + 1.17, rz - 0.06), cushion: new THREE.Vector3(side * xs[k], Y0 + 0.5, rz + 0.05) });
      }
    }
    colliders.push(side === 1 ? [0.45, Y0, rowZ(ROWS) - 0.45, 1.84, Y0 + 1.25, row1 + 0.5] : [-1.84, Y0, rowZ(ROWS) - 0.45, -0.45, Y0 + 1.25, row1 + 0.5]);
  }
  // ---- ceiling: centre panel with a light line, curved returns to the bins
  b.box(2.1, 0.03, zFront - zRear, 0, Y0 + 2.16, (zFront + zRear) / 2, 0xf6f4ef);
  for (const s of [1, -1]) b.boxR(0.12, 0.03, zFront - zRear, s * 1.08, Y0 + 2.12, (zFront + zRear) / 2, 0xeeece6, 0, 0, s * 0.35);
  lamps.box(0.12, 0.012, zFront - zRear - 1.6, 0, Y0 + 2.14, (zFront + zRear) / 2, 0xffffff);
  // ---- front bulkhead (galley / flight deck door) and rear bulkhead (lavatories)
  b.box(3.8, 2.2, 0.08, 0, Y0, zFront, 0xe3dfd7);
  b.box(0.85, 1.95, 0.02, -0.55, Y0, zFront - 0.05, 0xcfcac0);
  b.box(0.6, 0.25, 0.02, 0.55, Y0 + 1.55, zFront - 0.05, 0x1c2030);
  b.box(1.0, 1.6, 0.03, 1.1, Y0 + 0.2, zFront - 0.06, accent);           // curtain
  b.box(3.8, 2.2, 0.08, 0, Y0, zRear, 0xe3dfd7);
  for (const s of [1, -1]) b.box(0.75, 1.95, 0.02, s * 0.75, Y0, zRear + 0.05, 0xd2cdc3);
  colliders.push([-1.95, Y0, zFront, 1.95, Y0 + 2.3, zFront + 0.25], [-1.95, Y0, zRear - 0.25, 1.95, Y0 + 2.3, zRear]);
  // galley block by the door (right side, forward)
  b.box(1.1, 1.05, 0.7, -1.2, Y0, zFront - 0.4, 0xc9c5bd);
  b.box(1.1, 0.05, 0.72, -1.2, Y0 + 1.05, zFront - 0.4, 0x8d9097);
  colliders.push([-1.84, Y0, zFront - 0.8, -0.62, Y0 + 1.1, zFront]);
  // exit signs
  for (const z of [zFront - 0.1, zRear + 0.1]) lamps.box(0.3, 0.1, 0.02, 0, Y0 + 2.0, z + (z > 0 ? -0.02 : 0.02), 0xffffff);

  const geo = b.build(); bakeShade(geo, Y0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.color.setScalar(1.25);
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'cabin-interior'; mesh.frustumCulled = false;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.64).multiplyScalar(2.4) });
  lampMat.toneMapped = false;
  const lampMesh = new THREE.Mesh(lamps.build(), lampMat); lampMesh.frustumCulled = false;
  const ifeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.4, 0.9).multiplyScalar(0.9) });
  const ifeMesh = new THREE.Mesh(ife.build(), ifeMat); ifeMesh.frustumCulled = false;
  const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.93, 0.97), transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  const paneMesh = new THREE.Mesh(panesB.build(), paneMat); paneMesh.frustumCulled = false; paneMesh.renderOrder = 2;
  const group = new THREE.Group(); group.name = 'cabin';
  group.add(mesh, lampMesh, ifeMesh, paneMesh);

  // ---- the open forward door seen from the jet bridge: lit doorway + door leaf swung aft
  const doorway = new THREE.Group(); doorway.name = 'cabin-doorway';
  const dw = spec.doors[0].w; const dh = spec.doors[0].h;
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.02, 0.86) });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), glowMat);
  glow.position.set(spec.R + 0.02, Y0 + dh / 2 + 0.02, zDoor); glow.rotation.y = Math.PI / 2;
  const leafMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(livery.primary || '#f4f2ee'), roughness: 0.5, metalness: 0.1 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, dh, dw), leafMat);
  leaf.position.set(spec.R + 0.28, Y0 + dh / 2 + 0.02, zDoor - dw - 0.15);
  leaf.castShadow = true;
  doorway.add(glow, leaf);
  group.userData.doorway = doorway;

  const seats = new Map(seatsOut.map((s) => [s.id, s]));
  seatsOut.length = 0;
  return {
    group, doorway, Y0, seats, colliders, zFront, zRear, zDoor, rowZ, windows: windows.length, paneMat, lampMat, mat,
    dispose() {
      for (const m of [mesh, lampMesh, ifeMesh, paneMesh, glow, leaf]) m.geometry.dispose();
      for (const m of [mat, lampMat, ifeMat, paneMat, glowMat, leafMat]) m.dispose();
    },
  };
}
const seatsOut = [];

/* ========================================================= flight clouds */

const DECK_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DECK_FRAG = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uHaze; uniform vec3 uCam;
uniform float uFar; uniform float uTop; uniform float uOpacity; uniform float uTime; uniform float uCover;
varying vec3 vWorld;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
void main() {
  vec2 p = vWorld.xz / 2100.0 + vec2(uTime * 0.0015, 0.0);
  float n = fbm(p);
  float d = smoothstep(uCover, uCover + 0.2, n);
  float n2 = fbm(p + normalize(uSunDir.xz + 1e-4) * 0.035);
  float lit = clamp(0.62 + (n - n2) * 7.0, 0.0, 1.0);
  float dist = length(vWorld - uCam);
  vec3 col;
  if (uTop > 0.5) col = mix(uAmb, uSun, lit * (0.55 + 0.45 * d));
  else col = uAmb * mix(0.55, 0.85, 1.0 - d);
  col = mix(col, uHaze, smoothstep(uFar * 0.15, uFar * 0.85, dist) * 0.75);
  float fade = 1.0 - smoothstep(uFar * 0.6, uFar * 0.97, dist);
  float a = d * fade * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;
const PUFF_VERT = /* glsl */`
attribute vec4 aPuff;   // xyz centre, w size
attribute vec2 aVar;    // alpha, shade
varying vec2 vUv; varying float vA; varying float vShade; varying float vDist; varying float vY;
uniform float uNear;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = aPuff.xyz + (right * position.x + up * position.y * 0.62) * aPuff.w;
  vUv = uv; vA = aVar.x; vShade = aVar.y; vY = position.y;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vDist = length(aPuff.xyz - cameraPosition);
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uAmb; uniform float uOpacity; uniform float uNear; uniform float uFar;
varying vec2 vUv; varying float vA; varying float vShade; varying float vDist; varying float vY;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float a = t.a * vA * uOpacity * smoothstep(uNear * 0.2, uNear, vDist) * (1.0 - smoothstep(uFar * 0.6, uFar * 0.95, vDist));
  if (a < 0.004) discard;
  vec3 col = mix(uAmb, uSun, clamp(0.35 + vY * 0.6 + t.r * 0.35, 0.0, 1.0) * vShade);
  gl_FragColor = vec4(col, a);
}`;

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + i;
    const r = 18 + ((i * 37) % 23);
    const x = 64 + Math.cos(a) * (i % 3) * 13; const y = 70 + Math.sin(a) * (i % 4) * 7 - (i % 5) * 3;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const lum = 200 + (i % 4) * 14;
    gr.addColorStop(0, `rgba(${lum},${lum},${lum},0.42)`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * A self-contained cloud deck for the passenger flight: two noise-shaded
 * planes (lit tops, grey bases) plus billboard puffs for depth, and a stream
 * of near puffs that rush past the windows inside the layer. Only visible
 * while the flight runs.
 */
export class FlightClouds {
  constructor(scene, { bottom = 1150, top = 1450 } = {}) {
    this.scene = scene;
    this.bottom = bottom; this.top = top;
    this.group = new THREE.Group(); this.group.name = 'flight-clouds'; this.group.visible = false;
    scene.add(this.group);
    const common = {
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSun: { value: new THREE.Color(2, 1.95, 1.85) }, uAmb: { value: new THREE.Color(0.55, 0.62, 0.74) },
      uHaze: { value: new THREE.Color(0.62, 0.72, 0.86) }, uCam: { value: new THREE.Vector3() }, uFar: { value: 9000 }, uTime: { value: 0 }, uCover: { value: 0.47 },
    };
    this.uniforms = common;
    const deckMat = (topSide) => new THREE.ShaderMaterial({
      uniforms: { ...common, uTop: { value: topSide ? 1 : 0 }, uOpacity: { value: 1 } },
      vertexShader: DECK_VERT, fragmentShader: DECK_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    this.deckTop = new THREE.Mesh(plane, deckMat(true));
    this.deckBottom = new THREE.Mesh(plane, deckMat(false));
    for (const m of [this.deckTop, this.deckBottom]) { m.frustumCulled = false; m.scale.set(60000, 1, 60000); this.group.add(m); }
    this.deckTop.renderOrder = -1; this.deckBottom.renderOrder = -1;
    this.plane = plane;
    this.tex = puffTexture();
    this.puffs = this._puffs(520, true);
    this.near = this._puffs(70, false);
    this._nearState = null;
  }

  _puffs(n, field) {
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const P = new Float32Array(n * 4); const A = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      if (field) {
        // clustered where a CPU fbm says "cloud", over the flight area
        let x = 0; let z = 0; let tries = 0;
        do { x = -8500 + Math.random() * 10500; z = -11000 + Math.random() * 17000; tries++; } while (fbm2(x / 2100, z / 2100, 4, 2.03, 0.5, 11) < 0.45 && tries < 8);
        P[i * 4] = x; P[i * 4 + 2] = z;
        P[i * 4 + 1] = this.top - 60 + Math.random() * 220;
        P[i * 4 + 3] = 260 + Math.random() * 520;
        A[i * 2] = 0.55 + Math.random() * 0.45; A[i * 2 + 1] = 0.8 + Math.random() * 0.25;
      } else {
        P[i * 4 + 1] = -1e5; P[i * 4 + 3] = 60 + Math.random() * 120;
        A[i * 2] = 0.7 + Math.random() * 0.3; A[i * 2 + 1] = 0.7 + Math.random() * 0.3;
      }
    }
    g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(P, 4));
    g.setAttribute('aVar', new THREE.InstancedBufferAttribute(A, 2));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.tex }, uSun: this.uniforms.uSun, uAmb: this.uniforms.uAmb, uOpacity: { value: 1 }, uNear: { value: field ? 260 : 25 }, uFar: this.uniforms.uFar },
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.renderOrder = 1;
    this.group.add(m);
    return { mesh: m, geo: g, mat, P, n };
  }

  /** 0 outside the layer, ramping to 1 inside it. */
  densityAt(alt) {
    return smooth(this.bottom - 60, this.bottom + 70, alt) * (1 - smooth(this.top - 70, this.top + 50, alt));
  }

  setVisible(on) { this.group.visible = !!on; }

  update(dt, camera, sky, focus, forward) {
    if (!this.group.visible) return;
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCam.value.copy(camera.position);
    u.uFar.value = camera.far;
    const day = sky && sky.state ? sky.state.dayFactor : 1;
    const golden = sky && sky.state ? sky.state.goldenFactor || 0 : 0;
    if (sky && sky.sunDirection) u.uSunDir.value.copy(sky.sunDirection);
    const sunUp = clamp(u.uSunDir.value.y * 3 + 0.2, 0, 1);
    u.uSun.value.setRGB(2.15, 2.05 - golden * 0.45, 1.92 - golden * 0.8).multiplyScalar(0.06 + 0.94 * day * sunUp);
    u.uAmb.value.setRGB(0.5, 0.58, 0.72).multiplyScalar(0.08 + 0.92 * day);
    u.uHaze.value.setRGB(0.6, 0.7, 0.86).multiplyScalar(0.08 + 0.92 * day);
    for (const m of [this.deckTop, this.deckBottom]) { m.position.x = camera.position.x; m.position.z = camera.position.z; }
    this.deckTop.position.y = this.top; this.deckBottom.position.y = this.bottom;
    // near stream: recycle puffs around the aircraft while close to (or in) the layer
    const alt = focus.y;
    const k = smooth(this.bottom - 260, this.bottom, alt) * (1 - smooth(this.top, this.top + 260, alt));
    this.near.mat.uniforms.uOpacity.value = k;
    if (k > 0.001) {
      const P = this.near.P;
      const fx = forward.x; const fz = forward.z; const fl = Math.hypot(fx, fz) || 1;
      for (let i = 0; i < this.near.n; i++) {
        const dx = P[i * 4] - focus.x; const dy = P[i * 4 + 1] - focus.y; const dz = P[i * 4 + 2] - focus.z;
        const along = (dx * fx + dz * fz) / fl;
        if (along < -120 || Math.hypot(dx, dy, dz) > 1100) {
          const a = 250 + Math.random() * 850;
          const lat = (Math.random() - 0.5) * 420;
          P[i * 4] = focus.x + (fx / fl) * a + (-fz / fl) * lat;
          P[i * 4 + 2] = focus.z + (fz / fl) * a + (fx / fl) * lat;
          P[i * 4 + 1] = clamp(focus.y + (Math.random() - 0.5) * 160, this.bottom - 40, this.top + 40);
        }
      }
      this.near.geo.attributes.aPuff.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of [this.deckTop.material, this.deckBottom.material, this.puffs.mat, this.near.mat]) m.dispose();
    this.plane.dispose(); this.puffs.geo.dispose(); this.near.geo.dispose(); this.tex.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

/* =========================================================== flight plan */

/**
 * Deterministic flight profile for the aircraft parked on `stand`: the
 * sample(t) result is a pose for the model origin (ground point under the
 * fuselage) plus the readouts the HUD and audio need.
 */
export class FlightPlan {
  constructor({ stand, spec, groundFn }) {
    this.spec = spec;
    this.gfn = groundFn || (() => 0);
    this.mg = spec.length / 2 - spec.main.d;
    const cx = stand.noseX + spec.length / 2; const z0 = stand.z;
    this.start = { x: cx, z: z0 };
    this.pushPts = [[cx, z0], [-325, z0], [-325, z0 + 45]];
    this.taxi = filletPath([[-325, z0 + 45], [-325, -220], [-300, -250, 30], [-182.5, -250], [-182.5, -420], [-20, -420], [0, -400, 18], [0, -380]], 24);
    this.taxiA = [0, 150]; this.taxiB = [this.taxi.length - 205, this.taxi.length];
    this.runwayY = this.gfn(0, 0);
    this.a = 3.4; this.vLo = 80; this.vR = 71;
    this.rollT = this.vLo / this.a;
    const zLo = -380 + this.vLo * this.vLo / (2 * this.a);
    const ry = this.runwayY;
    const curve = (pts) => {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y + ry, z)), false, 'centripetal');
      c.arcLengthDivisions = 1500;
      return { c, len: c.getLength() };
    };
    this.A = curve([[0, 0, zLo], [0, 120, zLo + 1100], [-300, 450, zLo + 2400], [-1500, 900, zLo + 3250], [-3000, 1350, zLo + 3100], [-4300, 1900, zLo + 2100], [-5000, 2300, zLo + 500]]);
    this.B = curve([[-5000, 2300, zLo + 500], [-5150, 2330, zLo - 1500], [-4800, 2360, zLo - 4300]]);
    this.C = curve([[-3900, 1780, -8100], [-2500, 1320, -7400], [-1200, 800, -6500], [-260, 400, -5400], [0, 160, -4000], [0, 45, -1630], [0, 0, -766]]);
    this.tA = 45; this.tB = 16; this.tC = 46;
    this.pA = speedProfile(this.A.len, this.tA, this.vLo, 205);
    this.pB = speedProfile(this.B.len, this.tB, 205, 215);
    this.pC = speedProfile(this.C.len, this.tC, 185, 70);
    this.timeline = buildTimeline([
      { id: 'boarding', dur: 6 }, { id: 'pushback', dur: 9 }, { id: 'taxiA', dur: 13 }, { id: 'taxiCut', dur: 1.8 }, { id: 'taxiB', dur: 12 },
      { id: 'lineup', dur: 4 }, { id: 'takeoff', dur: this.rollT }, { id: 'climb', dur: this.tA }, { id: 'cruise', dur: this.tB },
      { id: 'cut', dur: 2.8 }, { id: 'descent', dur: this.tC }, { id: 'rollout', dur: 11 }, { id: 'arrived', dur: 4.5 },
    ]);
    this.total = this.timeline.total;
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3();
  }

  _air(seg, prof, tt, out) {
    const s = prof.s(tt);
    const u = clamp(s / seg.len, 0, 1);
    const P = seg.c.getPointAt(u, this._v);
    const T = seg.c.getTangentAt(u, this._t);
    out.x = P.x; out.y = P.y; out.z = P.z;
    out.yaw = Math.atan2(T.x, T.z);
    out.gamma = Math.asin(clamp(T.y, -1, 1));
    out.speed = prof.v(tt);
    // bank from the curvature of the track (averaged over ±160 m)
    const du = 160 / seg.len;
    const ya = seg.c.getTangentAt(clamp(u - du, 0, 1)); const yb = seg.c.getTangentAt(clamp(u + du, 0, 1));
    const dpsi = wrapPi(Math.atan2(yb.x, yb.z) - Math.atan2(ya.x, ya.z));
    const span = (clamp(u + du, 0, 1) - clamp(u - du, 0, 1)) * seg.len || 1;
    const kappa = dpsi / span;
    const v = Math.min(out.speed, 150);
    out.roll = clamp(-Math.atan(v * v * kappa / 9.81), -0.48, 0.48);
    out.pitch = out.gamma * 0.75 + 3.2 * DEG;
    return out;
  }

  sample(t, out = {}) {
    const tl = this.timeline;
    const tc = clamp(t, 0, tl.total - 1e-3);
    const ph = tl.at(tc);
    const tt = tc - ph.t0;
    const u = ph.dur > 0 ? tt / ph.dur : 1;
    out.phase = ph.id; out.tPhase = tt; out.uPhase = u;
    out.roll = 0; out.pitch = 0; out.gamma = 0; out.speed = 0; out.thrust = 0.08; out.gear = true; out.vib = 0; out.fade = 0; out.lights = 'park';
    const ground = (x, z, yaw) => { out.x = x; out.z = z; out.y = this.gfn(x, z); out.yaw = yaw; };
    switch (ph.id) {
      case 'boarding': ground(this.start.x, this.start.z, -Math.PI / 2); out.thrust = 0.02; break;
      case 'pushback': {
        const e = smooth(0, 1, u);
        const [a, b, c] = this.pushPts;
        const q = 1 - e;
        const x = q * q * a[0] + 2 * q * e * b[0] + e * e * c[0]; const z = q * q * a[1] + 2 * q * e * b[1] + e * e * c[1];
        const dx = 2 * q * (b[0] - a[0]) + 2 * e * (c[0] - b[0]); const dz = 2 * q * (b[1] - a[1]) + 2 * e * (c[1] - b[1]);
        ground(x, z, Math.atan2(-dx, -dz));
        out.speed = 3 * Math.sin(Math.PI * u); out.thrust = 0.1 + 0.15 * u; out.vib = 0.0015; out.lights = 'taxi';
        break;
      }
      case 'taxiA': case 'taxiB': case 'taxiCut': {
        let s;
        if (ph.id === 'taxiA') s = lerp(this.taxiA[0], this.taxiA[1], u * u * (3 - 2 * u) * 0.75 + u * 0.25);
        else if (ph.id === 'taxiB') s = lerp(this.taxiB[0], this.taxiB[1], u * u * (3 - 2 * u) * 0.6 + u * 0.4);
        else s = this.taxiA[1];
        if (ph.id === 'taxiCut') out.fade = Math.sin(Math.PI * u);
        if (ph.id === 'taxiCut' && u > 0.5) s = this.taxiB[0];
        const p = this.taxi.at(s);
        ground(p.x, p.z, p.heading);
        out.speed = ph.id === 'taxiCut' ? 12 : 13 * Math.sin(Math.PI * clamp(u, 0.08, 0.92));
        out.thrust = 0.22; out.vib = 0.0035; out.lights = 'taxi';
        break;
      }
      case 'lineup': ground(0, -380, 0); out.thrust = 0.25 + 0.5 * smooth(0.3, 1, u); out.vib = 0.002 + 0.004 * u; out.lights = 'runway'; break;
      case 'takeoff': {
        const s = 0.5 * this.a * tt * tt;
        ground(0, -380 + s, 0);
        out.speed = this.a * tt; out.thrust = 1;
        out.pitch = smooth(this.vR / this.a, this.rollT, tt) * 8.5 * DEG;
        out.vib = 0.004 + 0.016 * clamp(out.speed / this.vLo, 0, 1) * (1 - smooth(this.rollT - 1.2, this.rollT, tt));
        out.lights = 'runway';
        break;
      }
      case 'climb': {
        this._air(this.A, this.pA, tt, out);
        out.pitch = lerp(8.5 * DEG, out.pitch, smooth(0, 5, tt));
        out.thrust = 0.92 - 0.12 * u; out.gear = tt < 6; out.lights = tt < 30 ? 'runway' : 'air';
        break;
      }
      case 'cruise': this._air(this.B, this.pB, tt, out); out.thrust = 0.62; out.gear = false; out.lights = 'air'; break;
      case 'cut': {
        this._air(u < 0.5 ? this.B : this.C, u < 0.5 ? this.pB : this.pC, u < 0.5 ? this.tB : 0, out);
        out.fade = Math.sin(Math.PI * u); out.thrust = 0.4; out.gear = false; out.lights = 'air';
        break;
      }
      case 'descent': {
        this._air(this.C, this.pC, tt, out);
        const left = this.tC - tt;
        out.pitch += smooth(3.2, 0.4, left) * 4.5 * DEG;
        out.thrust = 0.24 + 0.14 * smooth(0.6, 0.9, u) - 0.2 * smooth(2.5, 0.2, left);
        out.gear = u > 0.45; out.lights = u > 0.6 ? 'runway' : 'air';
        break;
      }
      case 'rollout': {
        const v0 = 70; const dec = (v0 - 9) / ph.dur;
        const s = v0 * tt - 0.5 * dec * tt * tt;
        ground(0, -766 + s, 0);
        out.speed = v0 - dec * tt;
        out.pitch = (1 - smooth(0.6, 2.6, tt)) * 4.5 * DEG;
        out.thrust = tt > 0.8 && tt < 7 ? 0.85 : 0.2;
        out.vib = 0.006 + 0.03 * Math.exp(-tt * 2.2) + 0.006 * (out.speed / v0);
        out.lights = 'runway';
        break;
      }
      default: {
        const v0 = 70; const dec = (v0 - 9) / 11;
        ground(0, -766 + v0 * 11 - 0.5 * dec * 121 + 9 * 0.5 * smooth(0, 1, u), 0);
        out.speed = 9 * (1 - u); out.thrust = 0.12; out.fade = smooth(0.35, 0.95, u); out.lights = 'taxi';
      }
    }
    out.alt = Math.max(0, out.y - this.runwayY);
    out.airborne = ph.id === 'climb' || ph.id === 'cruise' || ph.id === 'cut' || ph.id === 'descent';
    return out;
  }

  /** Pose the aircraft group from a sample (rotation pivots on the main gear). */
  apply(group, s) {
    const q = group.quaternion;
    q.setFromEuler(new THREE.Euler(-s.pitch, s.yaw, s.roll, 'YXZ'));
    const g = new THREE.Vector3(0, 0, this.mg);
    const gy = g.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    const gr = g.clone().applyQuaternion(q);
    group.position.set(s.x + gy.x - gr.x, s.y + gy.y - gr.y, s.z + gy.z - gr.z);
    group.updateMatrixWorld(true);
  }
}

/* ===================================================================== UI */

const CSS = `
.jr-root { position: absolute; inset: 0; pointer-events: none; z-index: 14; font-family: var(--font-ui, system-ui, sans-serif); color: var(--ink, #e8e4d8); }
.jr-root button { font-family: inherit; }
.jr-prompt { position: absolute; left: 50%; top: calc(50% + 2.6rem); transform: translateX(-50%); display: none; align-items: center; gap: 0.6rem;
  padding: 0.4rem 1rem 0.4rem 0.4rem; border-radius: 2rem; font-size: 0.92rem; color: var(--ink-strong, #f4f6ff); white-space: nowrap; pointer-events: auto; cursor: pointer;
  background: rgba(8, 11, 24, 0.88); border: 1px solid rgba(230, 198, 90, 0.55); box-shadow: 0 0 1.6rem rgba(201, 162, 39, 0.28); }
.jr-prompt.show { display: inline-flex; animation: jrIn 0.18s ease; }
.jr-prompt kbd { background: var(--brass, #c9a227); color: #191306; font-weight: 800; border-radius: 50%; width: 1.75rem; height: 1.75rem; display: grid; place-items: center; font-family: inherit; font-size: 0.95rem; border: 1px solid var(--brass-hi, #e6c65a); }
.jr-prompt b { color: var(--brass-hi, #e6c65a); font-weight: 750; }
body.touch-mode .jr-prompt .jr-key-word::before { content: 'Tap'; }
body:not(.touch-mode) .jr-prompt .jr-key-word::before { content: 'Press E'; }
.jr-list { position: absolute; left: calc(var(--rail-w, 3.1rem) + var(--gutter, 0.85rem) * 2); top: calc(var(--top-h, 3.6rem) + 4.6rem); width: min(17.5rem, calc(100vw - 2rem)); display: none;
  padding: 0.75rem 0.8rem 0.7rem; border-radius: var(--radius, 0.86rem); background: rgba(10, 13, 28, 0.82); border: 1px solid var(--hair, rgba(201,162,39,0.24)); box-shadow: var(--shadow); pointer-events: auto;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.jr-list.show { display: block; animation: jrIn 0.25s ease; }
.jr-list h4 { margin: 0 0 0.15rem; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass, #c9a227); }
.jr-list .jr-sub { font-size: 0.72rem; color: var(--muted, #9aa3b8); margin-bottom: 0.5rem; }
.jr-list ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.18rem; }
.jr-list li { display: flex; gap: 0.5rem; align-items: center; font-size: 0.82rem; color: var(--muted, #9aa3b8); padding: 0.16rem 0.3rem; border-radius: 0.4rem; }
.jr-list li i { width: 1.05rem; height: 1.05rem; border-radius: 50%; border: 1.5px solid rgba(232,228,216,0.3); display: grid; place-items: center; font-style: normal; font-size: 0.7rem; flex: 0 0 auto; }
.jr-list li.done { color: var(--ink, #e8e4d8); }
.jr-list li.done i { background: var(--ok, #3ddc84); border-color: var(--ok, #3ddc84); color: #06210f; }
.jr-list li.now { color: var(--ink-strong, #fff); background: rgba(201, 162, 39, 0.14); }
.jr-list li.now i { border-color: var(--brass-hi, #e6c65a); box-shadow: 0 0 0 3px rgba(230,198,90,0.22); }
.jr-list .jr-row { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
.jr-btn { pointer-events: auto; cursor: pointer; border-radius: 1rem; padding: 0.3rem 0.75rem; font-size: 0.78rem; font-weight: 650; color: var(--ink-strong, #fff);
  background: rgba(255,255,255,0.06); border: 1px solid var(--hair-mid, rgba(232,228,216,0.16)); }
.jr-btn:hover { background: rgba(255,255,255,0.12); }
.jr-btn.primary { background: var(--brass, #c9a227); color: #191306; border-color: var(--brass-hi, #e6c65a); }
.jr-guide { position: absolute; left: 50%; top: calc(var(--top-h, 3.6rem) + 6.1rem); transform: translateX(-50%); display: none; align-items: center; gap: 0.65rem; max-width: calc(100vw - 2rem);
  padding: 0.42rem 0.95rem 0.42rem 0.5rem; border-radius: 2rem; background: rgba(8, 11, 24, 0.8); border: 1px solid var(--hair, rgba(201,162,39,0.24)); font-size: 0.86rem; }
.jr-guide.show { display: inline-flex; }
.jr-guide .jr-arrow { width: 1.9rem; height: 1.9rem; border-radius: 50%; display: grid; place-items: center; background: rgba(201,162,39,0.18); color: var(--brass-hi, #e6c65a); font-size: 1.1rem; transition: transform 0.12s linear; }
.jr-guide .jr-dist { font-family: var(--font-mono, monospace); color: var(--brass-hi, #e6c65a); font-size: 0.8rem; }
.jr-guide .jr-hint { color: var(--ink-strong, #fff); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jr-card { position: absolute; right: var(--gutter, 0.85rem); top: calc(var(--top-h, 3.6rem) + 4.4rem); width: min(27rem, calc(100vw - 2rem)); display: none; pointer-events: auto;
  padding: 0.85rem; border-radius: var(--radius, 0.86rem); background: rgba(10, 13, 28, 0.9); border: 1px solid var(--hair, rgba(201,162,39,0.24)); box-shadow: var(--shadow); }
.jr-card.show { display: block; animation: jrCard 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.jr-card header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.55rem; }
.jr-card header b { flex: 1; font-size: 0.98rem; color: var(--ink-strong, #fff); }
.jr-card header small { font-size: 0.66rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass, #c9a227); display: block; }
.jr-card canvas { width: 100%; height: auto; display: block; border-radius: 0.55rem; }
.jr-card p { margin: 0.55rem 0 0; font-size: 0.84rem; line-height: 1.5; color: var(--ink, #e8e4d8); }
.jr-card .jr-x { pointer-events: auto; cursor: pointer; background: none; border: 0; color: var(--muted, #9aa3b8); font-size: 1.2rem; line-height: 1; padding: 0.2rem; }
.jr-stamp { position: relative; }
.jr-stamp canvas.st { position: absolute; left: 52%; top: 18%; width: 42%; animation: jrStamp 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both 0.25s; }
.jr-flight { position: absolute; left: 50%; bottom: calc(9vh + 0.8rem); transform: translateX(-50%); display: none; flex-direction: column; align-items: center; gap: 0.45rem; width: min(52rem, calc(100vw - 1.5rem)); }
.jr-flight.show { display: flex; }
.jr-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.25rem; }
.jr-chips span { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.18rem 0.5rem; border-radius: 1rem; color: var(--muted, #9aa3b8); background: rgba(8,11,24,0.6); border: 1px solid rgba(232,228,216,0.08); }
.jr-chips span.done { color: var(--ink, #e8e4d8); border-color: rgba(61,220,132,0.35); }
.jr-chips span.now { color: #191306; background: var(--brass-hi, #e6c65a); border-color: var(--brass-hi, #e6c65a); font-weight: 750; }
.jr-bar { display: flex; align-items: center; gap: 0.9rem; padding: 0.42rem 0.55rem 0.42rem 1rem; border-radius: 2rem; background: rgba(6, 8, 18, 0.78); border: 1px solid var(--hair, rgba(201,162,39,0.24)); pointer-events: auto; }
.jr-bar .jr-phase { font-weight: 700; color: var(--ink-strong, #fff); font-size: 0.9rem; min-width: 14rem; }
.jr-bar .jr-read { font-family: var(--font-mono, monospace); font-size: 0.78rem; color: var(--brass-hi, #e6c65a); white-space: nowrap; }
.jr-bar .jr-read em { font-style: normal; color: var(--muted, #9aa3b8); margin-right: 0.25rem; }
.jr-fade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 30; display: grid; place-items: center; }
.jr-fade b { font-family: var(--font-display, sans-serif); font-size: clamp(1.4rem, 3.4vw, 2.6rem); letter-spacing: 0.04em; color: #f4efe4; text-align: center; }
.jr-fade small { display: block; font-size: 0.9rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--brass, #c9a227); margin-top: 0.6rem; font-family: var(--font-ui, sans-serif); }
@keyframes jrIn { from { opacity: 0; transform: translate(-50%, 0.3rem); } to { opacity: 1; } }
.jr-list.show, .jr-card.show { animation-name: jrCard; }
@keyframes jrCard { from { opacity: 0; transform: translateY(0.6rem) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes jrStamp { from { opacity: 0; transform: scale(2.4) rotate(8deg); } to { opacity: 0.92; transform: scale(1) rotate(-11deg); } }
body.reduced-motion .jr-root * { animation: none !important; transition: none !important; }
@media (max-width: 720px) { .jr-list { top: auto; bottom: 6.5rem; left: 0.6rem; width: 13.5rem; font-size: 0.9em; } .jr-bar .jr-phase { min-width: 0; } .jr-card { top: auto; bottom: 7rem; } }
`;

function h(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
}

/** DOM layer: interaction prompt, journey checklist, guide pill, info cards, flight bar, fades. */
class JourneyUI {
  constructor(root, runner) {
    this.runner = runner;
    if (!document.getElementById('jr-style')) {
      const st = document.createElement('style'); st.id = 'jr-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    this.root = h('div', { class: 'jr-root' });
    root.appendChild(this.root);
    this.promptText = h('span');
    this.prompt = h('button', { class: 'jr-prompt', type: 'button', 'aria-live': 'polite', onclick: () => runner.sim.interact() }, [h('kbd', { text: 'E' }), h('b', { class: 'jr-key-word' }), h('span', { text: '—' }), this.promptText]);
    this.list = h('section', { class: 'jr-list', 'aria-label': 'Passenger journey' });
    this.guideArrow = h('span', { class: 'jr-arrow', text: '↑' });
    this.guideHint = h('span', { class: 'jr-hint' });
    this.guideDist = h('span', { class: 'jr-dist' });
    this.guide = h('div', { class: 'jr-guide', role: 'status' }, [this.guideArrow, this.guideHint, this.guideDist]);
    this.card = h('section', { class: 'jr-card', role: 'dialog' });
    this.chips = h('div', { class: 'jr-chips' });
    this.phase = h('span', { class: 'jr-phase' });
    this.read = h('span', { class: 'jr-read' });
    this.flight = h('div', { class: 'jr-flight' }, [this.chips, h('div', { class: 'jr-bar' }, [
      this.phase, this.read,
      h('button', { class: 'jr-btn', type: 'button', title: 'Next phase (Space or →)', onclick: () => runner.skipPhase() }, [h('span', { text: 'Next phase ▸▸' })]),
      h('button', { class: 'jr-btn', type: 'button', title: 'Leave the journey (Esc)', onclick: () => runner.stop('left') }, [h('span', { text: 'Leave · Esc' })]),
    ])]);
    this.fadeText = h('b');
    this.fade = h('div', { class: 'jr-fade', 'aria-hidden': 'true' }, [this.fadeText]);
    this.root.append(this.prompt, this.list, this.guide, this.card, this.flight, this.fade);
    this._prompt = null;
    this._cardTimer = 0;
  }

  setPrompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    if (!text) { this.prompt.classList.remove('show'); return; }
    this.promptText.textContent = text;
    this.prompt.classList.add('show');
  }

  renderList(state, pass) {
    const snap = state.snapshot();
    const items = JOURNEY_STEPS.map((s, i) => {
      const done = snap.done.includes(s.id);
      const now = snap.step === s.id;
      let title = s.title;
      if (s.id === 'seat' && pass) title = `Find seat ${pass.seat}`;
      return h('li', { class: done ? 'done' : now ? 'now' : '' }, [h('i', { text: done ? '✓' : String(i + 1) }), h('span', { text: title })]);
    });
    this.list.replaceChildren(
      h('h4', { text: 'Passenger journey' }),
      h('div', { class: 'jr-sub', text: pass ? `${pass.flight} · ${pass.from} → ${pass.to} · Gate ${pass.gate} · simulated` : 'Simulated walk-through · HDD' }),
      h('ol', {}, items),
      h('div', { class: 'jr-row' }, [h('button', { class: 'jr-btn', type: 'button', onclick: () => this.runner.stop('left') }, [h('span', { text: 'Leave journey (Esc)' })])]),
    );
    this.list.classList.add('show');
  }

  showCard({ eyebrow = 'Passenger journey', title, body = [], text = '', hold = 9 }) {
    this.card.replaceChildren(
      h('header', {}, [h('b', {}, [h('small', { text: eyebrow }), title]), h('button', { class: 'jr-x', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => this.hideCard() })]),
      ...[].concat(body),
      text ? h('p', { text }) : null,
    );
    this.card.classList.remove('show'); void this.card.offsetWidth; this.card.classList.add('show');
    this._cardTimer = hold;
  }

  hideCard() { this.card.classList.remove('show'); this._cardTimer = 0; }

  setFade(a, text = '', sub = '') {
    this.fade.style.opacity = String(clamp(a, 0, 1));
    if (text !== this._fadeText || sub !== this._fadeSub) {
      this._fadeText = text; this._fadeSub = sub;
      this.fadeText.replaceChildren(text, sub ? h('small', { text: sub }) : '');
    }
  }

  /** Quick fade-through-black around `fn` (lift rides, teleports). */
  flash(fn) {
    let a = 0; let fired = false;
    const step = () => {
      a += fired ? -0.08 : 0.16;
      if (!fired && a >= 1) { fired = true; fn(); }
      this.setFade(Math.max(0, Math.min(1, a)));
      if (!fired || a > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  tick(dt) {
    if (this._cardTimer > 0) { this._cardTimer -= dt; if (this._cardTimer <= 0) this.hideCard(); }
  }

  hideAll() {
    for (const e of [this.list, this.guide, this.flight]) e.classList.remove('show');
    this.hideCard(); this.setFade(0);
  }

  dispose() { this.root.remove(); }
}

/* ---------------------------------------------------- procedural cards */

function boardingPassCanvas(pass, livery) {
  const W = 800; const H = 300;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tail = livery.tail || '#8e1a2e'; const sec = livery.secondary || '#1f2a6b';
  g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = tail; g.fillRect(0, 0, W, 58);
  g.fillStyle = sec; g.fillRect(0, 58, W, 6);
  // perforation between the pass and the stub
  g.fillStyle = '#d9d3c4'; for (let y = 72; y < H - 8; y += 12) g.fillRect(588, y, 2, 6);
  g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textBaseline = 'middle';
  g.fillText(pass.airline.toUpperCase(), 22, 30);
  g.font = 'bold 16px sans-serif'; g.textAlign = 'right'; g.fillText('BOARDING PASS', 572, 30); g.fillText(pass.cls, W - 18, 30); g.textAlign = 'left';
  const label = (t, x, y) => { g.fillStyle = '#7d7768'; g.font = 'bold 12px sans-serif'; g.fillText(t, x, y); };
  const val = (t, x, y, size = 22, col = '#1d2030') => { g.fillStyle = col; g.font = `bold ${size}px sans-serif`; g.fillText(t, x, y); };
  label('FROM', 22, 86); val(pass.from, 22, 120, 46, sec); label(pass.fromName.toUpperCase(), 22, 150);
  g.fillStyle = tail; g.font = 'bold 30px sans-serif'; g.fillText('✈', 152, 118);
  label('TO', 210, 86); val(pass.to, 210, 120, 46, sec); label(pass.toName.toUpperCase(), 210, 150);
  label('PASSENGER', 400, 86); val(pass.passenger, 400, 108, 15);
  label('FLIGHT', 400, 134); val(pass.flight, 400, 156, 20);
  const row = [['DATE', pass.date], ['BOARDING', pass.boarding], ['DEPARTS', pass.departs], ['GATE', pass.gate], ['SEAT', pass.seat], ['GROUP', String(pass.group)]];
  row.forEach(([l, v], i) => { label(l, 22 + i * 94, 188); val(v, 22 + i * 94, 214, i === 4 ? 26 : 21, i === 4 ? tail : '#1d2030'); });
  // barcode from the flight + seat
  let s = 0; for (const ch of `${pass.flight}${pass.seat}${pass.seq}`) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  g.fillStyle = '#1d2030';
  for (let x = 22; x < 560; x += 3) { s = (s * 1103515245 + 12345) >>> 0; if ((s >>> 16) & 1) g.fillRect(x, 238, (s >>> 20) & 1 ? 2 : 1, 38); }
  g.fillStyle = '#9b1b30'; g.font = 'bold 11px sans-serif'; g.fillText('SIMULATED — NOT A TRAVEL DOCUMENT', 22, 290);
  // stub
  label('FLIGHT', 606, 86); val(pass.flight, 606, 110, 20);
  label('SEAT', 606, 140); val(pass.seat, 606, 168, 34, tail);
  label('GATE', 700, 140); val(pass.gate, 700, 168, 34, sec);
  label('SEQ', 606, 200); val(pass.seq, 606, 222, 18);
  label('ZONE', 700, 200); val(String(pass.group), 700, 222, 18);
  g.fillStyle = sec;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { s = (s * 1103515245 + 12345) >>> 0; if ((s >>> 17) & 1) g.fillRect(712 + i * 7, 236 + j * 6, 6, 5); }
  return c;
}

function passportCanvas(pass) {
  const c = document.createElement('canvas'); c.width = 600; c.height = 300;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 600, 300); grad.addColorStop(0, '#e8efe0'); grad.addColorStop(1, '#d9e4d3');
  g.fillStyle = grad; g.fillRect(0, 0, 600, 300);
  g.strokeStyle = 'rgba(40, 90, 70, 0.14)'; g.lineWidth = 1;
  for (let i = -300; i < 600; i += 9) { g.beginPath(); g.moveTo(i, 0); g.quadraticCurveTo(i + 150, 150, i + 40, 300); g.stroke(); }
  g.fillStyle = 'rgba(30, 70, 55, 0.75)'; g.font = 'bold 15px sans-serif'; g.fillText('VISAS · ENDORSEMENTS', 20, 30);
  g.font = '12px monospace'; g.fillStyle = 'rgba(30,70,55,0.5)';
  for (let i = 0; i < 4; i++) g.fillText('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<'.slice(0, 44), 20, 250 + i * 12);
  const s = document.createElement('canvas'); s.width = 260; s.height = 260;
  const q = s.getContext('2d');
  q.strokeStyle = '#b3122e'; q.fillStyle = '#b3122e'; q.lineWidth = 7;
  q.beginPath(); q.arc(130, 130, 118, 0, Math.PI * 2); q.stroke();
  q.lineWidth = 3; q.beginPath(); q.arc(130, 130, 98, 0, Math.PI * 2); q.stroke();
  q.textAlign = 'center'; q.textBaseline = 'middle';
  q.font = 'bold 30px sans-serif'; q.fillText('HDD', 130, 86);
  q.font = 'bold 21px sans-serif'; q.fillText('DEPARTED', 130, 122);
  q.font = 'bold 19px monospace'; q.fillText(pass.date, 130, 154);
  q.font = 'bold 13px sans-serif'; q.fillText('SIMULATED · DESK 2', 130, 186);
  q.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { q.fillRect(Math.random() * 260, Math.random() * 260, 2 + Math.random() * 3, 1 + Math.random() * 2); }
  return { page: c, stamp: s };
}

function xrayCanvas() {
  const c = document.createElement('canvas'); c.width = 600; c.height = 260;
  const g = c.getContext('2d');
  g.fillStyle = '#04122a'; g.fillRect(0, 0, 600, 260);
  const blob = (x, y, w, hh, col, r = 12) => { g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); g.fill(); };
  blob(70, 40, 460, 180, 'rgba(255,150,40,0.35)', 26);            // bag body (organic)
  blob(110, 70, 230, 120, 'rgba(60,140,255,0.55)', 6);             // laptop (metal)
  blob(370, 80, 120, 40, 'rgba(70,220,120,0.5)', 10);              // clothes
  blob(380, 140, 60, 60, 'rgba(255,170,60,0.6)', 30);              // book / food
  g.strokeStyle = 'rgba(80,160,255,0.8)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(450, 150); g.bezierCurveTo(500, 120, 470, 210, 520, 190); g.stroke();   // cable
  blob(270, 24, 70, 18, 'rgba(60,140,255,0.7)', 6);               // handle
  g.fillStyle = '#3ddc84'; g.font = 'bold 18px monospace'; g.fillText('CLEAR ✓  LANE 4 · SIMULATED', 20, 245);
  return c;
}

/* ================================================================ runner */

const GATE_N = 4;
const SEAT_ID = '14F';
const REQUIRED = ['7.2', '7.3', '7.4', '7.5', '7.7', '7.9', '4.3', '3.5', '3.6'];

/**
 * The passenger journey: guide, interactables (desks, booths, lanes, gate,
 * bridge, aircraft door, seats, FIDS), boarding pass, cabin and flight.
 * main.js calls update(dt) every frame and updateCamera(dt) while
 * `ownsCamera` (seated); `interactables` join the E-interaction targets.
 */
export class JourneyRunner {
  constructor(sim) {
    this.sim = sim;
    this.state = new JourneyState();
    this.ui = new JourneyUI(sim.uiRoot, this);
    this.pass = null;
    this.seated = null;
    this.flight = null;
    this.t = 0;
    this._items = null;
    this._sample = {};
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._guide = null;
    this._lastDisplay = null;
    this._narrTimer = 0;
    this.headYaw = 0; this.headPitch = 0;
  }

  get active() { return this.state.active; }
  get ownsCamera() { return !!this.seated; }
  get terminal() { return this.sim.world && this.sim.world.terminal; }
  get gate() { const t = this.terminal; return t && t.gates ? t.gates.find((g) => g.n === GATE_N) : null; }

  /* ---------------------------------------------------- interactables */

  get interactables() {
    if (this._items) return this._items;
    const t = this.terminal;
    if (!t || !t.spots) return [];
    const sp = t.spots;
    const fit = (lvl) => () => (t.p['7.7'] || 0) >= lvl && (t.p['7.5'] || 0) > 0.6;
    const items = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const d of sp.checkin) {
      items.push({
        id: `checkin-${d.island}${d.side > 0 ? 'S' : 'N'}`, kind: 'checkin', name: `Check-in island ${d.island}`, segment: d.segment, position: V(-577, d.y, d.z), radius: 2.8, vtol: 2.2,
        available: fit(0.2),
        action: () => this._checkin(),
      });
    }
    for (const b of sp.booths) items.push({ id: `booth-${b.n}`, kind: 'booth', name: `Passport control booth ${b.n}`, position: b.position, radius: 2.6, vtol: 2.2, available: fit(0.35), action: () => this._passport(b) });
    for (const l of sp.lanes) items.push({ id: `lane-${l.n}`, kind: 'lane', name: `Security lane ${l.n}`, segment: l.segment, position: V(-562.5, l.y, l.z - 1.85), radius: 2.6, vtol: 2.2, available: fit(0.35), action: () => this._security(l) });
    sp.fids.forEach((p, i) => items.push({ id: `fids-${i}`, kind: 'fids', name: 'Flight information display', position: p, radius: p.y > 5 ? 9 : 4.5, vtol: p.y > 5 ? 6 : 3.4, available: fit(0.65), action: () => this._fids() }));
    for (const g of sp.gates) items.push({ id: `gate-desk-${g.n}`, kind: 'gate', name: `Gate ${g.n} desk`, position: g.desk, radius: 2.8, vtol: 2.2, available: fit(0.5), action: () => this._gateDesk(g) });
    for (const sb of sp.seatBanks) {
      items.push({
        id: `lounge-seat-${sb.x}-${sb.z0}`, kind: 'loungeSeat', name: 'Lounge seat', segment: [sb.x, sb.z0 + 0.6, sb.x, sb.z1 - 0.6], position: V(sb.x, 0.8, (sb.z0 + sb.z1) / 2), radius: 1.9, vtol: 2,
        available: fit(0.5), prompt: 'Sit down', action: () => this._sitLounge(sb),
      });
    }
    // Journey-only targets (aircraft door, assigned seat) live in the same list.
    this._doorItem = { id: 'aircraft-door', kind: 'aircraftDoor', name: 'Aircraft door', position: V(0, 0, 0), radius: 2.6, vtol: 2.2, available: () => !!(this.aircraft && this.active && !this.flight && this.state.index >= STEP_IDS.indexOf('bridge')), action: () => this._board() };
    this._seatItem = { id: 'my-seat', kind: 'seat', name: 'Your seat', position: V(0, 0, 0), radius: 2.3, vtol: 2.2, available: () => !!(this.aircraft && this.active && !this.flight && this.state.index >= STEP_IDS.indexOf('board')), action: () => this._sitAssigned() };
    items.push(this._doorItem, this._seatItem);
    // prompts by state
    for (const it of items) if (!('prompt' in it)) Object.defineProperty(it, 'prompt', { get: () => this._promptFor(it), configurable: true });
    this._items = items;
    return items;
  }

  _promptFor(it) {
    const st = this.state;
    switch (it.kind) {
      case 'checkin': return !st.active ? 'Check in — start the passenger journey' : st.is('checkin') ? 'Check in — collect your boarding pass' : `${it.name} — already checked in`;
      case 'booth': return st.is('passport') ? 'Present your passport' : `${it.name}`;
      case 'lane': return st.is('security') ? 'Put your bag through the X-ray' : `${it.name}`;
      case 'fids': return st.is('fids') ? 'Check the departures board for your gate' : 'Read the departures board';
      case 'gate': return st.is('gate') && it.id === `gate-desk-${GATE_N}` ? 'Scan your boarding pass' : `${it.name}`;
      case 'aircraftDoor': return 'Board the aircraft';
      case 'seat': return `Take seat ${this.pass ? this.pass.seat : SEAT_ID}`;
      default: return it.name;
    }
  }

  /* ---------------------------------------------------- lifecycle */

  toggle() { if (this.active) this.stop('left'); else this.start('enter'); }

  /** Start (or jump to) a step. Returns the state snapshot. */
  start(from = 'enter', { teleport = true, quiet = false } = {}) {
    const sim = this.sim;
    if (!this.terminal) { sim.toast('The terminal is not available in this build.', 'warn'); return this.snapshot(); }
    if (this.seated) this._standUp(true);
    if (this.flight) this._endFlight(true);
    if (sim.mode !== 'inspector') sim.setMode('inspector');
    this._ensureWorld();
    void this.interactables;
    if (!this.pass) {
      const airlines = AIRLINE_LIVERIES.filter((l) => !l.cargo).map((l) => ({ name: l.name, code: l.code }));
      const date = sim.project && sim.project.date ? sim.project.date() : null;
      const hour = sim.world.sky ? sim.world.sky.hour : 10;
      this.pass = makeBoardingPass({ seed: ((sim.project && sim.project.seed) || 7) + Math.floor(hour * 3), airlines, hour, date, gate: String(GATE_N), seatRow: 14, seatLetter: 'F' });
    }
    this._spawnAircraft();
    this.state.start(from);
    const idx = this.state.index;
    // side effects of steps we skipped over
    if (idx > STEP_IDS.indexOf('gate')) this._openGateDoor(600);
    this._setCabinCollision(idx >= STEP_IDS.indexOf('board'));
    sim.walker.radius = idx >= STEP_IDS.indexOf('seat') ? 0.3 : 0.42;
    if (teleport) this._placeForStep(from);
    this.ui.renderList(this.state, this.pass);
    this._buildGuide();
    if (from === 'flight') this._sitAssigned(true);
    if (!quiet && from === 'enter') sim.toast(`Passenger journey — ${this.pass.flight} to ${this.pass.to} (simulated). Follow the gold arrows; E interacts.`, 'good');
    return this.snapshot();
  }

  stop(reason = 'left') {
    const sim = this.sim;
    if (!this.active && !this.seated) return;
    const inAircraft = !!this.flight || this.state.index >= STEP_IDS.indexOf('board');
    if (this.seated) this._standUp(true);
    if (this.flight) this._endFlight(true);
    this.state.reset();
    this.ui.hideAll();
    this.ui.setPrompt(null);
    this._hideGuide();
    this._setCabinCollision(false);
    sim.walker.radius = 0.42;
    if (this.aircraft) this.aircraft.visible = false;
    if (this._gateDoorHeld) { const d = this.terminal.doorById(this._gateDoorHeld); if (d) d.timer = Math.min(d.timer, 2); this._gateDoorHeld = null; }
    const wasPreview = this.previewed;
    if (this.previewed) { this.previewed = false; sim.syncWorld(true); }
    if (reason === 'arrived') {
      const x = -640; const z = 117;
      sim.walker.teleport(x, sim._groundY(x, z) + sim.walker.eyeHeight, z, -Math.PI / 2);
      sim.toast(`Arrived — simulated flight. You are back on the HDD forecourt by the arrivals exit.${wasPreview ? ' The project view is restored.' : ''}`, 'good');
      if (sim.audio && sim.audio.ui) sim.audio.ui('milestone');
    } else {
      if (inAircraft && reason !== 'mode') {
        const x = -489; const z = (this.gate ? this.gate.desk.z : -31) + 2;
        sim.walker.teleport(x, sim.world.collision.groundAt(x, z, 5) + sim.walker.eyeHeight, z, -Math.PI / 2);
      }
      if (reason !== 'mode') sim.toast(`Passenger journey closed.${wasPreview ? ' The project view is restored.' : ''}`);
    }
    this.pass = null;
  }

  _ensureWorld() {
    const sim = this.sim;
    if (this.previewed) return;
    const pct = sim.previewing ? null : sim.project.worldState().pct;
    const missing = !pct || REQUIRED.some((id) => (pct[id] === undefined ? 1 : pct[id]) < 0.999);
    if (missing && sim.project.previewState) {
      sim.previewProject(sim.project.previewState(1));
      this.previewed = true;
      sim.toast('Previewing the completed terminal and apron for the journey (simulated). The project clock is paused until you leave.', 'warn');
    }
  }

  _spawnAircraft() {
    const sim = this.sim;
    const g = this.gate;
    if (!g) return;
    const livery = AIRLINE_LIVERIES.find((l) => l.code === this.pass.code) || AIRLINE_LIVERIES[0];
    if (this.aircraft && this.aircraft.userData.livery !== livery) this._disposeAircraft();
    if (!this.aircraft) {
      this.aircraft = createAircraft('narrow', livery);
      this.aircraft.name = 'journey-aircraft';
      const spec = this.aircraft.userData.spec;
      this.cabin = createCabin(spec, livery);
      this.aircraft.add(this.cabin.group, this.cabin.doorway);
      sim.world.scene.add(this.aircraft);
      this.clouds = this.clouds || new FlightClouds(sim.world.scene);
    }
    this._parkAircraft();
  }

  _parkAircraft() {
    const g = this.gate; const a = this.aircraft;
    const spec = a.userData.spec;
    const st = g.stand;
    const x = st.noseX + spec.length / 2; const z = st.z;
    const gfn = this.sim.world.collision.groundFn || (() => 0);
    a.position.set(x, gfn(x, z), z);
    a.rotation.set(0, -Math.PI / 2, 0);
    a.visible = true;
    a.updateMatrixWorld(true);
    a.userData.setGear(true);
    a.userData.setLights({ nav: true, beacon: false, strobe: false, landing: false });
    this.cabin.doorway.visible = true;
    this.cabin.group.visible = false;
    // journey targets inside the parked aircraft
    const door = this.aircraft.localToWorld(new THREE.Vector3(spec.R - 0.1, this.cabin.Y0 + 1.1, this.cabin.zDoor));
    this._doorItem.position.copy(door);
    const seat = this.cabin.seats.get(SEAT_ID);
    this._seatItem.position.copy(this.aircraft.localToWorld(seat.cushion.clone().setY(this.cabin.Y0 + 0.9)));
  }

  _setCabinCollision(on) {
    const col = this.sim.world.collision;
    if (!this.aircraft || !col) return;
    if (!this._cabinCols) {
      const a = this.aircraft; a.updateMatrixWorld(true);
      this._cabinCols = this.cabin.colliders.map((b) => {
        const p0 = a.localToWorld(new THREE.Vector3(b[0], b[1], b[2])); const p1 = a.localToWorld(new THREE.Vector3(b[3], b[4], b[5]));
        return col.addBox(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), Math.max(p0.y, p1.y), Math.max(p0.z, p1.z), 'journey-cabin');
      });
    }
    col.setDisabled(this._cabinCols, !on);
  }

  _disposeAircraft() {
    if (!this.aircraft) return;
    this._setCabinCollision(false);
    this.aircraft.parent && this.aircraft.parent.remove(this.aircraft);
    this.aircraft.userData.dispose && this.aircraft.userData.dispose();
    this.cabin.dispose();
    this.aircraft = null; this.cabin = null;
    // collider indices stay registered (CollisionWorld never removes) but disabled.
    this._cabinCols = null;
  }

  /* ---------------------------------------------------- steps */

  _complete(id) {
    const next = this.state.complete(id);
    if (!next && !this.state.is(id)) { /* out of order */ }
    this.ui.renderList(this.state, this.pass);
    this._buildGuide();
    if (this.sim.bus) this.sim.bus.emit('journey:step', { step: id, next: this.state.currentId });
    return next;
  }

  _info(text) { this.sim.toast(text); }

  _checkin() {
    const sim = this.sim;
    if (!this.active) { this.start('checkin', { teleport: false, quiet: true }); }
    if (!this.state.is('checkin')) { this._info(`Already checked in — ${this.pass.flight}, seat ${this.pass.seat}, gate ${this.pass.gate}.`); return; }
    const livery = AIRLINE_LIVERIES.find((l) => l.code === this.pass.code) || AIRLINE_LIVERIES[0];
    this.ui.showCard({
      eyebrow: `${this.pass.airline} · check-in island D`, title: 'Your boarding pass',
      body: boardingPassCanvas(this.pass, livery),
      text: `Bag tagged to ${this.pass.to}. Next: passport control (booth 2), then security lane 4. Boarding ${this.pass.boarding} at Gate ${this.pass.gate}.`, hold: 12,
    });
    if (sim.audio && sim.audio.ui) sim.audio.ui('good');
    this._complete('checkin');
  }

  _passport(b) {
    if (!this.active || !this.state.is('passport')) { this._info(this.active && this.state.index < STEP_IDS.indexOf('passport') ? 'Check in first — the desks are at the islands behind you.' : `${b ? `Booth ${b.n}` : 'Passport control'} — officers process departing passengers here (simulated).`); return; }
    const { page, stamp } = passportCanvas(this.pass);
    stamp.className = 'st';
    this.ui.showCard({ eyebrow: `Passport control · booth ${b ? b.n : 2}`, title: 'Passport stamped', body: h('div', { class: 'jr-stamp' }, [page, stamp]), text: 'Exit recorded (simulated). Continue to security screening — lane 4 is just ahead on your right.', hold: 8 });
    const a = this.sim.audio;
    if (a && a.ui) { setTimeout(() => a.ui('click'), 260); setTimeout(() => a.ui('good'), 420); }
    this._complete('passport');
  }

  _security(l) {
    if (!this.active || !this.state.is('security')) { this._info(this.active && this.state.index < STEP_IDS.indexOf('security') ? 'Passport control comes first.' : `Lane ${l ? l.n : ''} — divest table, X-ray tunnel, walk-through archway and body scanner.`); return; }
    this.ui.showCard({ eyebrow: `Security · lane ${l ? l.n : 4}`, title: 'X-ray: clear', body: xrayCanvas(), text: 'Your bag is clear. Walk through the archway into the departure lounge and find your gate on a departures screen.', hold: 8 });
    if (this.sim.audio && this.sim.audio.ui) this.sim.audio.ui('toast');
    this._complete('security');
  }

  _fids() {
    const t = this.terminal;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    if (t && t.fidsCanvas) c.getContext('2d').drawImage(t.fidsCanvas, 0, 0);
    const p = this.pass;
    const mine = p ? `Your flight: ${p.flight} to ${p.to} — Gate ${p.gate}, boarding ${p.boarding}.` : 'Simulated airlines and schedule, refreshed live from the simulation.';
    this.ui.showCard({ eyebrow: 'Departures · HDD', title: 'Flight information display', body: c, text: mine, hold: 9 });
    if (this.active && this.state.is('fids')) this._complete('fids');
  }

  _gateDesk(g) {
    if (!this.active || !this.state.is('gate')) {
      this._info(this.active && this.state.index > STEP_IDS.indexOf('gate') ? 'Boarding pass already scanned — walk down the jet bridge.' : `Gate ${g.n} — boarding opens 30 minutes before departure (simulated).`);
      return;
    }
    if (g.n !== GATE_N) { this._info(`This is Gate ${g.n}. ${this.pass.flight} boards at Gate ${GATE_N}.`); return; }
    this.ui.showCard({ eyebrow: `Gate ${g.n} · boarding`, title: 'Boarding pass scanned ✓', text: `${this.pass.flight} · seat ${this.pass.seat} · zone ${this.pass.group}. The gate door at the top of the stairs is open — walk down the jet bridge to the aircraft.`, hold: 8 });
    if (this.sim.audio && this.sim.audio.ui) this.sim.audio.ui('xp');
    this._openGateDoor(240);
    this._complete('gate');
  }

  _openGateDoor(hold) {
    const t = this.terminal; const g = this.gate;
    if (!t || !g) return;
    const d = t.doorById(g.doorId);
    if (!d) return;
    if (d.target < 0.5) t.openDoor(g.doorId, this.sim);
    d.timer = hold;
    this._gateDoorHeld = g.doorId;
  }

  _board() {
    if (!this.state.is('board')) { if (this.state.is('bridge')) this._complete('bridge'); else return; }
    const sim = this.sim;
    this._setCabinCollision(true);
    sim.walker.radius = 0.3;
    this.ui.showCard({ eyebrow: `${this.pass.airline} · ${this.pass.flight}`, title: 'Welcome aboard', text: `Seat ${this.pass.seat} is a window seat on the right, row 14 — just behind the over-wing exits. Walk down the aisle and press E at your seat.`, hold: 7 });
    this._pa();
    this._complete('board');
  }

  _sitAssigned(instant = false) {
    if (!this.aircraft) return;
    if (!instant && !this.state.is('seat')) return;
    if (this.state.is('seat')) this._complete('seat');
    if (!this.state.is('flight')) this.state.start('flight');
    this.ui.renderList(this.state, this.pass);
    this._setCabinCollision(false);
    const seat = this.cabin.seats.get(SEAT_ID);
    this.seated = { kind: 'aircraft', eye: seat.eye.clone() };
    this.headYaw = -0.95; this.headPitch = -0.12;
    this._hideGuide();
    this._startFlight();
  }

  _sitLounge(bank) {
    const sim = this.sim;
    const cam = sim.engine.camera.position;
    let z = bank.seats[0];
    for (const s of bank.seats) if (Math.abs(s - cam.z) < Math.abs(z - cam.z)) z = s;
    const look = -bank.facing;          // seated passengers face away from the backrest
    const eye = new THREE.Vector3(bank.x - bank.facing * 0.05, 0.3 + 1.12, z);
    this.seated = { kind: 'lounge', eye, yaw0: look > 0 ? -Math.PI / 2 : Math.PI / 2, back: new THREE.Vector3(bank.x + look * 1.1, sim.walker.position.y, z) };
    this.headYaw = 0; this.headPitch = -0.05;
    sim.walker.enabled = false;
    this.ui.setPrompt(null);
    sim.toast('Seated in the departure lounge. Look around; E or any movement key to stand up.');
  }

  _standUp(silent = false) {
    const sim = this.sim;
    const s = this.seated;
    this.seated = null;
    sim.walker.enabled = true;
    if (s && s.kind === 'lounge') {
      const yaw = s.yaw0 + this.headYaw;
      sim.walker.teleport(s.back.x, s.back.y, s.back.z, yaw);
      if (!silent) sim.toast('Standing up.');
    }
  }

  /** E while seated (lounge): stand. */
  get seatedItem() {
    if (!this.seated || this.seated.kind !== 'lounge') return null;
    if (!this._standItem) this._standItem = { id: 'stand-up', kind: 'stand', name: 'Stand up', prompt: 'Stand up', position: new THREE.Vector3(), radius: 99, action: () => this._standUp() };
    return this._standItem;
  }

  _placeForStep(id) {
    const sim = this.sim;
    const g = this.gate;
    const P = {
      enter: [-636, -9, -12],
      checkin: [-593, -12, -16],
      passport: [-571, -21, -36],
      security: [-566, -37, -28.2],
      fids: [-558, -27.0, -24],
      gate: [-519, -8, -15],
      bridge: [-490, -31.0, -31],
      board: [g ? g.head.x - 0.6 : -446, g ? g.head.z + 1.2 : -36.8, -42],
    };
    const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    if (id === 'seat' && this.aircraft) {
      const p = this.aircraft.localToWorld(new THREE.Vector3(0.9, this.cabin.Y0, this.cabin.zDoor));
      const tgt = this._seatItem.position;
      sim.walker.teleport(p.x, p.y + 0.05 + sim.walker.eyeHeight, p.z, yawTo(p.x, p.z, tgt.x, tgt.z));
      return;
    }
    if (id === 'flight') return;
    const p = P[id] || P.enter;
    const tgt = this._targetFor(id);
    const x = p[0]; const z = p[1];
    const y = sim.world.collision.groundAt(x, z, id === 'board' ? 4.5 : 3) + sim.walker.eyeHeight;
    const yaw = tgt ? yawTo(x, z, tgt.x, tgt.z) : -Math.PI / 2;
    sim.walker.teleport(x, y, z, yaw, 0);
    sim.walker.height = sim.walker.eyeHeight;
  }

  /** Target (world point) of a step: what the gold marker hovers over. */
  _targetFor(id) {
    const t = this.terminal; const g = this.gate;
    if (!t) return null;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    switch (id) {
      case 'enter': return V(-600, 0.3, -9);
      case 'checkin': return V(-577, 0.3, -24.1);
      case 'passport': { const b = t.booths[1]; return V(b.position.x, 0.3, b.z); }
      case 'security': return V(-562.6, 0.3, -28.85);
      case 'fids': return V(-516.5, 0.3, -6);
      case 'gate': return g ? V(g.desk.x, 0.3, g.desk.z) : null;
      case 'bridge': return g ? g.head.clone() : null;
      case 'board': return this._doorItem ? this._doorItem.position.clone().setY(g ? g.head.y : 3) : null;
      case 'seat': return this._seatItem ? this._seatItem.position.clone().setY(this.cabin ? this.aircraft.position.y + this.cabin.Y0 : 3) : null;
      default: return null;
    }
  }

  /** Floor route polyline [x, z] for a step's chevrons. */
  _routeFor(id) {
    const g = this.gate;
    const gz = g ? g.z : -27.25;
    switch (id) {
      case 'enter': return [[-636, -9], [-603, -9], [-597.5, -9]];
      case 'checkin': return [[-596, -9], [-583, -14], [-577, -22.6]];
      case 'passport': return [[-577, -22.4], [-567.5, -21.5], [-565.5, -34], [-562.6, -43]];
      case 'security': return [[-562.6, -42], [-567, -37], [-566.6, -28.1], [-563.2, -28.1]];
      case 'fids': return [[-563, -27.3], [-556, -27.0], [-546, -25.5], [-538, -22.1], [-523, -22.1], [-519, -7.5]];
      case 'gate': return g ? [[-519, -7.5], [-505, -11.1], [-497, -11.1], [-493.6, -18], [-493.6, g.desk.z + 1.5], [-487.6, g.desk.z]] : null;
      case 'bridge': return g ? [[-487.6, g.desk.z + 0.4], [-493.6, gz - 2.2], [-493.7, gz], [-482.5, gz], [-479.5, gz], [-471, gz], [g.head.x, g.head.z], [g.aircraftDoor.x, g.aircraftDoor.z + 0.5]] : null;
      case 'board': return g ? [[g.head.x, g.head.z + 0.6], [g.aircraftDoor.x, g.aircraftDoor.z + 0.3]] : null;
      case 'seat': {
        if (!this.aircraft) return null;
        const a = this.aircraft; const c = this.cabin; const r14 = c.rowZ(14);
        const pts = [[1.5, c.zDoor], [0.1, c.zDoor - 0.4], [0, c.zDoor - 1.5], [0, r14 + 0.2]].map(([x, z]) => { const p = a.localToWorld(new THREE.Vector3(x, c.Y0, z)); return [p.x, p.z]; });
        return pts;
      }
      default: return null;
    }
  }

  /* ---------------------------------------------------- guide (3D) */

  _ensureGuideMeshes() {
    if (this._guide) return this._guide;
    const scene = this.sim.world.scene;
    const gold = new THREE.Color(1.7, 1.18, 0.32);
    const chevShape = new THREE.Shape();
    chevShape.moveTo(-0.42, -0.12); chevShape.lineTo(0, 0.28); chevShape.lineTo(0.42, -0.12); chevShape.lineTo(0.42, -0.34); chevShape.lineTo(0, 0.06); chevShape.lineTo(-0.42, -0.34); chevShape.lineTo(-0.42, -0.12);
    const cg = new THREE.ShapeGeometry(chevShape); cg.rotateX(-Math.PI / 2); cg.scale(1.5, 1, 1.5);
    const cm = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    cm.toneMapped = false;
    const chev = new THREE.InstancedMesh(cg, cm, 96);
    chev.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    chev.frustumCulled = false; chev.count = 0; chev.renderOrder = 3;
    for (let i = 0; i < 96; i++) chev.setColorAt(i, new THREE.Color(1, 1, 1));
    const marker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4), new THREE.MeshBasicMaterial({ color: gold }));
    cone.material.toneMapped = false; cone.rotation.x = Math.PI; cone.position.y = 2.6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.material.toneMapped = false; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 2.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.25), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.material.toneMapped = false; beam.position.y = 1.2;
    marker.add(cone, ring, beam);
    marker.visible = false;
    scene.add(chev, marker);
    this._guide = { chev, marker, cone, ring, beam, route: null, target: null, pts: [], tmp: new THREE.Object3D(), col: new THREE.Color() };
    return this._guide;
  }

  _buildGuide() {
    const G = this._ensureGuideMeshes();
    const id = this.state.currentId;
    const route = id ? this._routeFor(id) : null;
    G.target = id ? this._targetFor(id) : null;
    G.pts.length = 0;
    const col = this.sim.world.collision;
    if (route) {
      for (let i = 0; i < route.length - 1; i++) {
        const [ax, az] = route[i]; const [bx, bz] = route[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = i === 0 ? 0.6 : 0; s < L - 0.2; s += 1.1) {
          if (G.pts.length >= 96) break;
          const x = ax + (bx - ax) * (s / L); const z = az + (bz - az) * (s / L);
          const hint = G.target ? G.target.y + 1.4 : 4;
          const y = col.groundAt(x, z, Math.max(hint, 1.2)) + 0.035;
          G.pts.push({ x, y, z, yaw: Math.atan2(-(bx - ax), -(bz - az)) });
        }
      }
    }
    G.chev.count = G.pts.length;
    G.pts.forEach((p, i) => { G.tmp.position.set(p.x, p.y, p.z); G.tmp.rotation.set(0, p.yaw, 0); G.tmp.updateMatrix(); G.chev.setMatrixAt(i, G.tmp.matrix); });
    G.chev.instanceMatrix.needsUpdate = true;
    if (G.target) {
      const y = col.groundAt(G.target.x, G.target.z, G.target.y + 1.5);
      G.marker.position.set(G.target.x, Math.max(y, G.target.y - 0.4), G.target.z);
    }
    G.chev.visible = !!route; G.marker.visible = !!G.target;
    this.ui.guideHint.textContent = id ? `${JOURNEY_STEPS[this.state.index].title} — ${this._hint(id)}` : '';
    this.ui.guide.classList.toggle('show', !!G.target && !this.seated);
  }

  _hint(id) {
    const s = JOURNEY_STEPS.find((q) => q.id === id);
    if (id === 'seat' && this.pass) return `seat ${this.pass.seat}, right-hand window, row 14 — press E`;
    return s ? s.hint : '';
  }

  _hideGuide() {
    if (!this._guide) return;
    this._guide.chev.visible = false; this._guide.marker.visible = false;
    this.ui.guide.classList.remove('show');
  }

  _updateGuide(dt) {
    const G = this._guide;
    if (!G || !this.active || this.seated || !G.target) return;
    const t = this.sim.engine.elapsed || performance.now() / 1000;
    const reduced = this.sim.settings.get('accessibility.reducedMotion');
    G.cone.position.y = 2.5 + (reduced ? 0 : Math.sin(t * 3) * 0.12);
    G.cone.rotation.y = reduced ? 0 : t * 1.6;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    G.ring.scale.setScalar(1 + (reduced ? 0 : pulse * 0.25));
    const cam = this.sim.engine.camera;
    for (let i = 0; i < G.pts.length; i++) {
      const p = G.pts[i];
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      const wave = reduced ? 0.7 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.55));
      G.col.setScalar(wave * (d < 1.2 ? 0.25 : 1));
      G.chev.setColorAt(i, G.col);
    }
    if (G.chev.instanceColor) G.chev.instanceColor.needsUpdate = true;
    // HUD arrow: bearing of the target relative to the view
    const dx = G.target.x - cam.position.x; const dz = G.target.z - cam.position.z;
    const dist = Math.hypot(dx, dz);
    const e = this._e.setFromQuaternion(cam.quaternion, 'YXZ');
    const bearing = Math.atan2(-dx, -dz);
    const rel = wrapPi(bearing - e.y);
    this.ui.guideArrow.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
    this.ui.guideDist.textContent = dist < 2 ? 'here' : `${Math.round(dist)} m`;
    G.beam.visible = dist > 4.5; G.cone.visible = dist > 2.2;
    G.ring.material.opacity = clamp(dist / 4, 0.25, 0.8);
  }

  /* ---------------------------------------------------- flight */

  _pa() {
    const a = this.sim.audio;
    if (!a || !a.ready || a.muted) return;
    if (typeof a._paChime === 'function') a._paChime(); else if (a.ui) a.ui('decision');
  }

  _startFlight() {
    const sim = this.sim;
    const a = this.aircraft;
    this.flight = new FlightPlan({ stand: this.gate.stand, spec: a.userData.spec, groundFn: sim.world.collision.groundFn });
    this.t = 0;
    this._lastPhase = null; this._lastDisplay = null;
    this.clouds.setVisible(true);
    this.cabin.group.visible = true;
    sim.walker.enabled = false;
    sim.hud.setCinematic(true);
    this.ui.guide.classList.remove('show');
    this.ui.flight.classList.add('show');
    this.ui.list.classList.remove('show');
    this.ui.hideCard();
    this._renderChips('board');
    this._flightTick(0);
  }

  _endFlight(silent) {
    const sim = this.sim;
    this.flight = null;
    if (this.clouds) this.clouds.setVisible(false);
    this.ui.flight.classList.remove('show');
    this.ui.setFade(0);
    sim.hud.setCinematic(false);
    if (sim.hud.hideNarration) sim.hud.hideNarration();
    if (this.aircraft) this._parkAircraft();
    if (!silent) sim.toast('Flight ended.');
  }

  skipPhase() {
    if (!this.flight) return;
    const tl = this.flight.timeline;
    const p = tl.at(this.t);
    const order = ['boarding', 'pushback', 'taxiA', 'lineup', 'takeoff', 'climb', 'cruise', 'descent', 'rollout', 'arrived'];
    const i = order.indexOf(p.id === 'taxiCut' || p.id === 'taxiB' ? 'taxiA' : p.id === 'cut' ? 'cruise' : p.id);
    const next = order[Math.min(order.length - 1, i + 1)];
    this.t = tl.byId(next).t0 + 0.01;
  }

  /** QA: jump to a flight time (s) or a phase id. */
  setFlightTime(v) {
    if (!this.flight) return null;
    if (typeof v === 'string') {
      const tl = this.flight.timeline;
      const map = { above: ['climb', 0.85], clouds: ['climb', 0.5], climb: ['climb', 0.18], landing: ['descent', 0.86], final: ['descent', 0.8], touchdown: ['rollout', 0.05] };
      if (map[v]) { const p = tl.byId(map[v][0]); this.t = p.t0 + p.dur * map[v][1]; } else { const p = tl.byId(v); if (p) this.t = p.t0 + Math.min(1.5, p.dur * 0.3); }
    } else this.t = Number(v) || 0;
    this._flightTick(0);
    return this.snapshot();
  }

  _display(s) {
    const id = s.phase;
    if (id === 'boarding') return 'boarding';
    if (id === 'pushback') return 'pushback';
    if (id.startsWith('taxi')) return 'taxi';
    if (id === 'lineup') return 'lineup';
    if (id === 'takeoff') return 'takeoff';
    if (id === 'arrived') return 'arrived';
    if (id === 'rollout') return 'rollout';
    const d = this.clouds.densityAt(s.alt);
    if (d > 0.15) return 'clouds';
    if (id === 'climb') return s.alt > this.clouds.top ? 'above' : 'climb';
    if (id === 'cruise' || id === 'cut') return 'cruise';
    return s.alt < 520 ? 'landing' : 'descent';
  }

  _renderChips(display) {
    const chips = [['boarding', 'Board'], ['pushback', 'Push-back'], ['taxi', 'Taxi'], ['takeoff', 'Take-off'], ['climb', 'Climb'], ['clouds', 'Clouds'], ['cruise', 'Cruise'], ['descent', 'Descent'], ['landing', 'Landing'], ['arrived', 'Arrived']];
    const alias = { lineup: 'takeoff', above: 'cruise', rollout: 'landing' };
    const cur = alias[display] || display;
    const order = chips.map((c) => c[0]);
    const ci = order.indexOf(cur);
    if (cur === this._chipCur) return;
    this._chipCur = cur;
    this.ui.chips.replaceChildren(...chips.map(([id, label], i) => h('span', { class: i < ci ? 'done' : i === ci ? 'now' : '', text: label })));
  }

  _narrate(display) {
    const p = this.pass;
    const lines = {
      boarding: [`Welcome aboard ${p.airline} ${p.flight}`, 'Cabin crew, arm doors and cross-check. Please fasten your seat belt.'],
      pushback: ['Push-back', 'The tug pushes us back from Gate 4; engines are starting.'],
      taxi: ['Taxiing to runway 20', 'Along the apron taxilane and the parallel taxiway to the runway holding point.'],
      lineup: ['Lined up on runway 20', 'Cabin crew, seats for take-off.'],
      takeoff: ['Take-off', 'Take-off thrust set — rotate at about 140 knots (simulated).'],
      climb: ['Climbing over Hyderabad', 'Turning right over the city and the Indus plain.'],
      clouds: ['Through the cloud layer', 'A little turbulence as we climb through the clouds.'],
      above: ['Above the clouds', 'Sunshine above the cloud deck. The seat-belt sign is off.'],
      cruise: ['Cruise', 'Levelled off above the clouds. Enjoy the view.'],
      descent: ['Descent', 'Cabin crew, prepare the cabin for landing.'],
      landing: ['Final approach — runway 20', 'Gear down, flaps set. Landing at Hyderabad (simulated).'],
      rollout: ['Touchdown', 'Reverse thrust and braking. Welcome to Hyderabad.'],
    };
    const l = lines[display];
    if (!l) return;
    if (this.sim.hud.showNarration) this.sim.hud.showNarration({ title: l[0], text: l[1], phase: null });
    this._narrTimer = 6;
    if (display === 'boarding' || display === 'lineup' || display === 'descent' || display === 'above') this._pa();
  }

  _flightTick(dt) {
    const f = this.flight; const a = this.aircraft;
    if (!f || !a) return;
    this.t += dt;
    if (this.t >= f.total) { this._finish(); return; }
    const s = f.sample(this.t, this._sample);
    f.apply(a, s);
    const ud = a.userData;
    ud.setGear(s.gear);
    const L = s.lights;
    ud.setLights({ nav: true, beacon: L !== 'park', strobe: L === 'runway' || L === 'air', landing: L === 'runway' });
    this.cabin.doorway.visible = s.phase === 'boarding';
    // window panes whiten inside the cloud layer
    const dens = this.clouds.densityAt(s.alt);
    this.cabin.paneMat.opacity = 0.05 + dens * 0.9;
    const fwd = this._v.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    this.clouds.update(dt, this.sim.engine.camera, this.sim.world.sky, a.position, fwd);
    // HUD
    const display = this._display(s);
    if (display !== this._lastDisplay) { this._lastDisplay = display; this._narrate(display); this._renderChips(display); }
    this.ui.phase.textContent = FLIGHT_LABELS[display] || display;
    const kmh = Math.round(Math.min(s.speed, 240) * 3.6);
    const altFt = Math.round(s.alt * 3.281 / 10) * 10;
    this.ui.read.replaceChildren(h('em', { text: 'GS' }), `${kmh} km/h  `, h('em', { text: 'ALT' }), `${altFt.toLocaleString('en-US')} ft  `, h('em', { text: 'T+' }), `${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}`);
    const capt = s.phase === 'cut' ? ['Holding over the Indus plain', 'cleared to descend · simulated'] : s.phase === 'taxiCut' ? ['Taxiing to runway 20', 'time-lapse'] : s.phase === 'arrived' ? ['Arrived — simulated flight', `${this.pass.flight} · ${this.pass.from} → ${this.pass.to}`] : ['', ''];
    this.ui.setFade(s.fade, capt[0], capt[1]);
    this._vib = s.vib + (dens > 0.2 ? 0.004 * dens : 0);
    if (s.phase === 'rollout' && this._lastPhase !== 'rollout') this._touchdown = 0.03;
    this._lastPhase = s.phase;
    // sound
    this.sim.journeyAudio = { thrust: s.thrust, phase: s.phase };
    if (this._narrTimer > 0) { this._narrTimer -= dt; if (this._narrTimer <= 0 && this.sim.hud.hideNarration) this.sim.hud.hideNarration(); }
  }

  _finish() {
    const sub = this.pass ? `${this.pass.flight} · ${this.pass.from} → ${this.pass.to}` : '';
    this.stop('arrived');
    this.ui.setFade(1, 'Arrived — simulated flight', sub);
    // fade the arrival curtain out over a second
    let a = 1.6;
    const step = () => { a -= 0.025; this.ui.setFade(Math.min(1, a), 'Arrived — simulated flight', sub); if (a > 0) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /** Audio override while seated in the aircraft (main.js feeds this to AudioEngine.update). */
  audioState() {
    if (!this.flight) return null;
    const thrust = this._sample.thrust || 0;
    return { interior: 'terminal', jets: { nearest: 34, thrust } };
  }

  /* ---------------------------------------------------- per frame */

  update(dt) {
    this.ui.tick(dt);
    if (this.flight) { this._flightTick(dt); return; }
    if (!this.active) return;
    const cam = this.sim.engine.camera.position;
    // automatic completions
    if (this.state.is('enter') && cam.x > -598.5 && cam.x < -481 && Math.abs(cam.z) < 168 && cam.y < 6) {
      this._complete('enter');
      this.sim.toast('Inside the terminal — head for check-in island D.', 'good');
    }
    if (this.state.is('bridge') && this.gate && cam.y > 3.6) {
      const hd = this.gate.head;
      if (Math.hypot(cam.x - hd.x, cam.z - hd.z) < 3.2) this._complete('bridge');
    }
    // aircraft cabin visibility when the camera is inside it
    if (this.aircraft && this.cabin) {
      const lp = this.aircraft.worldToLocal(this._v.copy(cam));
      const c = this.cabin;
      this.cabin.group.visible = Math.abs(lp.x) < 2.1 && lp.y > c.Y0 - 0.6 && lp.y < c.Y0 + 2.8 && lp.z > c.zRear - 0.6 && lp.z < c.zFront + 0.6 || Math.abs(lp.x) < 4.5 && Math.abs(lp.z - c.zDoor) < 2.5 && lp.y > c.Y0;
    }
    this._updateGuide(dt);
  }

  /** Seated camera (lounge chair or aircraft seat): free look within a cone, plus vibration. */
  updateCamera(dt) {
    const sim = this.sim; const s = this.seated;
    if (!s) return;
    const look = sim.input.consumeLook();
    const sens = sim.walker.sensitivity || 0.0021;
    this.headYaw = clamp(this.headYaw - look.x * sens, -1.9, 1.9);
    this.headPitch = clamp(this.headPitch - look.y * sens, -0.85, 0.7);
    const cam = sim.engine.camera;
    if (s.kind === 'lounge') {
      const ax = sim.input.axes();
      if (Math.abs(ax.x) + Math.abs(ax.y) > 0.3 || sim.input.isDown('Space')) { this._standUp(); return; }
      cam.position.copy(s.eye);
      cam.quaternion.setFromEuler(this._e.set(this.headPitch, s.yaw0 + this.headYaw, 0, 'YXZ'));
      return;
    }
    const a = this.aircraft;
    if (!a) return;
    const reduced = sim.settings.get('accessibility.reducedMotion');
    this._touchdown = (this._touchdown || 0) * Math.pow(0.04, dt);
    const vib = reduced ? 0 : (this._vib || 0) + (this._touchdown || 0);
    const t = performance.now() / 1000;
    const j = this._v.copy(s.eye);
    if (vib > 0) {
      j.x += (Math.sin(t * 37.1) + Math.sin(t * 23.7)) * vib * 0.5;
      j.y += (Math.sin(t * 41.3) + Math.sin(t * 29.9) * 0.7) * vib;
    }
    a.updateMatrixWorld(true);
    cam.position.copy(a.localToWorld(j));
    this._q.setFromEuler(this._e.set(this.headPitch + (vib ? Math.sin(t * 31.7) * vib * 0.4 : 0), Math.PI + this.headYaw, vib ? Math.sin(t * 19.3) * vib * 0.3 : 0, 'YXZ'));
    cam.quaternion.copy(a.quaternion).multiply(this._q);
  }

  /** Keys while the journey runs. Returns true when handled. */
  onKey(e) {
    if (!this.active && !this.seated) return false;
    const sim = this.sim;
    if (e.key === 'Escape') {
      if ((sim.hud.isHelpOpen && sim.hud.isHelpOpen()) || sim.dashboard.openId || (sim.chat && sim.chat.isOpen)) return false;
      if (this.seated && this.seated.kind === 'lounge') { this._standUp(); return true; }
      if (this.ui.card.classList.contains('show') && !this.flight) { this.ui.hideCard(); return true; }
      this.stop('left');
      return true;
    }
    if (this.flight && (e.code === 'Space' || e.key === 'ArrowRight')) { e.preventDefault(); this.skipPhase(); return true; }
    return false;
  }

  snapshot() {
    const s = this.state.snapshot();
    const f = this.flight ? this._sample : null;
    return {
      ...s,
      seated: this.seated ? this.seated.kind : null,
      previewing: !!this.previewed,
      pass: this.pass ? { flight: this.pass.flight, seat: this.pass.seat, gate: this.pass.gate, to: this.pass.to, airline: this.pass.airline } : null,
      flight: f ? { t: Math.round(this.t * 10) / 10, total: Math.round(this.flight.total), phase: f.phase, display: this._lastDisplay, alt: Math.round(f.alt), speed: Math.round(f.speed), x: Math.round(f.x), z: Math.round(f.z) } : null,
      aircraft: this.aircraft ? { x: Math.round(this.aircraft.position.x * 10) / 10, y: Math.round(this.aircraft.position.y * 10) / 10, z: Math.round(this.aircraft.position.z * 10) / 10 } : null,
    };
  }

  dispose() {
    if (this.active) this.stop('mode');
    this._disposeAircraft();
    if (this.clouds) this.clouds.dispose();
    if (this._guide) {
      const G = this._guide;
      for (const m of [G.chev, G.cone, G.ring, G.beam]) { m.geometry.dispose(); m.material.dispose(); if (m.parent) m.parent.remove(m); }
      if (G.marker.parent) G.marker.parent.remove(G.marker);
    }
    this.ui.dispose();
  }
}

