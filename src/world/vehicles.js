import * as THREE from 'three';
import { mergeGeometries, box, cyl, paint, place, createLightMaterial, updateLightScale, setLightClock, LIGHT_KIND, AIRCRAFT_TYPES } from './aircraft.js';
import { MASTERPLAN } from './layout.js';

/**
 * Vehicle fleet: the contractor's plant on the work fronts and the airside
 * ground-support equipment (GSE) on the apron.
 *
 *   new VehicleFleet(scene, quality, materials?, layout?)
 *   fleet.setActivity({ fronts:[{ wbsId, x, z, radius, kind }], workforce 0..1, operational })
 *   fleet.setGseActive(bool)                 // apron equipment works turnarounds
 *   fleet.setTurnarounds([{ stand, x, z, heading, type, length, span, phase 0..1, pushing, remote }])
 *   fleet.update(dt, { night | lights, elapsed, groundAt })
 *   fleet.dispose()
 *
 * Every vehicle type is ONE InstancedMesh (plus one for an articulated part:
 * dump body, excavator house, mixer drum, catering box) sharing a single
 * vertex-coloured PBR material; every head/tail/beacon light on the airport is
 * one point-sprite draw call. Motion is kinematic: pure-pursuit steering along
 * waypoint loops, so nothing allocates per frame.
 */

/* ------------------------------------------------------------- palette */
const C = {
  yellow: 0xe0a21c, yellowDk: 0xb78213, dark: 0x2b2d31, steel: 0x8e939a, glass: 0x1a2430, tyre: 0x1c1d20,
  hub: 0x9aa0a6, white: 0xeceae4, orange: 0xd9631e, red: 0xb3221c, navy: 0x1f2a6b, crimson: 0x8e1a2e,
  grey: 0x6b7077, teal: 0x0e7c86, blue: 0x2c5aa0, silver: 0xc4c8cd, black: 0x111214, cream: 0xe7dcc4,
};

/* -------------------------------------------------------------- helpers */
function wheels(list, r, w, positions, color = C.tyre) {
  for (const [x, y, z] of positions) {
    list.push(cyl(r, w, x, y ?? r, z, color, 'x', 14));
    list.push(cyl(r * 0.5, w + 0.02, x, y ?? r, z, C.hub, 'x', 10));
  }
}
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** Box spanning from point a to b (centre-line), w × h cross-section. */
function strut(a, b, w, h, color) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const len = _a.distanceTo(_b);
  const g = new THREE.BoxGeometry(w, h, len);
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const dx = b[0] - a[0];
  const pitch = -Math.atan2(dy, Math.hypot(dz, dx));
  const yaw = Math.atan2(dx, dz);
  g.rotateX(pitch);
  g.rotateY(yaw);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return paint(g, color);
}
function cab(list, w, h, d, x, y, z, body, { glassFront = true, glassSides = true } = {}) {
  list.push(box(w, h, d, x, y, z, body));
  if (glassFront) list.push(box(w * 0.86, h * 0.42, 0.06, x, y + h * 0.48, z + d / 2 + 0.01, C.glass));
  if (glassSides) {
    list.push(box(0.05, h * 0.4, d * 0.7, x - w / 2 - 0.01, y + h * 0.5, z + d * 0.05, C.glass));
    list.push(box(0.05, h * 0.4, d * 0.7, x + w / 2 + 0.01, y + h * 0.5, z + d * 0.05, C.glass));
  }
}
function truckChassis(list, len, cabColor, { cabLen = 2.1, cabH = 2.0, axles = [3.2, -1.6, -3.0], r = 0.55, w = 2.4 } = {}) {
  list.push(box(w * 0.82, 0.45, len - 0.4, 0, 0.8, 0, C.dark));
  const cz = len / 2 - cabLen / 2 - 0.15;
  cab(list, w, cabH, cabLen, 0, 1.05, cz, cabColor);
  list.push(box(w * 0.92, 0.35, 0.25, 0, 0.55, len / 2 - 0.05, C.dark)); // bumper
  list.push(box(w * 0.7, 0.3, 0.05, 0, 1.25, len / 2 + 0.01, C.silver)); // grille
  for (const z of axles) wheels(list, r, 0.42, [[-w / 2 + 0.22, r, z], [w / 2 - 0.22, r, z]]);
  return cz;
}

/* ---------------------------------------------------------- type builds */
/** Each builder returns { parts:[geo], sub?:{ parts, pivot:[x,y,z] }, lights:[{x,y,z,kind,color,size}], len } */
const BUILDERS = {
  dump() {
    const p = [];
    const cz = truckChassis(p, 9.2, C.orange, { axles: [3.3, -1.5, -2.9] });
    p.push(box(0.9, 0.5, 1.2, 0, 1.25, cz - 1.6, C.dark));     // hoist housing
    const s = [];
    s.push(box(2.45, 0.15, 5.5, 0, 0, 0, C.yellowDk));
    s.push(box(0.12, 1.25, 5.5, -1.17, 0.15, 0, C.yellow));
    s.push(box(0.12, 1.25, 5.5, 1.17, 0.15, 0, C.yellow));
    s.push(box(2.45, 1.6, 0.14, 0, 0.15, 2.7, C.yellow));
    s.push(box(2.45, 0.2, 0.9, 0, 1.75, 2.95, C.yellow));      // cab protector
    s.push(box(2.3, 1.1, 0.12, 0, 0.15, -2.7, C.yellowDk));
    s.push(box(2.2, 0.45, 4.8, 0, 0.6, 0.2, 0x8a7458));        // load (aggregate)
    s.forEach((g) => g.translate(0, 1.15, -1.5));
    return { parts: p, sub: { parts: s, pivot: [0, 1.15, -4.25], axis: 'x' }, len: 9.2,
      lights: [...heads(1.0, 1.0, 4.6), ...tails(1.05, 0.9, -4.6), amber(0, 3.2, 3.6)] };
  },
  excavator() {
    const p = [];
    for (const s of [-1, 1]) {
      p.push(box(0.62, 0.85, 4.2, s * 1.3, 0, 0, C.dark));
      p.push(cyl(0.42, 0.62, s * 1.3, 0.43, 2.1, C.dark, 'x', 10));
      p.push(cyl(0.42, 0.62, s * 1.3, 0.43, -2.1, C.dark, 'x', 10));
    }
    p.push(box(2.0, 0.45, 2.6, 0, 0.75, 0, C.dark));
    p.push(cyl(0.95, 0.2, 0, 1.25, 0, C.steel, 'y', 16));
    const u = [];
    u.push(box(2.9, 1.15, 3.2, 0, 1.35, -0.5, C.yellow));
    u.push(box(2.9, 1.0, 0.85, 0, 1.4, -2.45, C.dark));          // counterweight
    cab(u, 1.0, 1.65, 1.6, -0.88, 2.5, 0.65, C.yellow);
    u.push(box(0.3, 0.6, 0.3, 0.9, 2.5, -1.4, C.dark));           // exhaust
    const b0 = [0.45, 2.1, 1.0];
    const b1 = [0.45, 5.4, 5.2];
    const a1 = [0.45, 2.3, 6.9];
    u.push(strut(b0, b1, 0.55, 0.7, C.yellow));
    u.push(strut(b1, a1, 0.42, 0.55, C.yellow));
    u.push(strut([0.45, 3.0, 1.6], [0.45, 4.6, 3.6], 0.18, 0.18, C.silver));  // ram
    u.push(box(1.1, 0.9, 0.9, 0.45, 1.5, 7.1, C.dark));             // bucket
    for (let i = -2; i <= 2; i++) u.push(box(0.12, 0.25, 0.2, 0.45 + i * 0.22, 1.3, 7.55, C.steel));
    return { parts: p, sub: { parts: u, pivot: [0, 0, 0], axis: 'y' }, len: 8,
      lights: [...heads(0.6, 3.6, 1.5), amber(-0.88, 4.3, 0.6)] };
  },
  grader() {
    const p = [];
    p.push(box(2.3, 1.45, 2.4, 0, 0.8, -2.8, C.yellow));
    p.push(box(2.0, 0.3, 0.3, 0, 2.25, -3.7, C.dark));
    cab(p, 1.9, 1.75, 1.7, 0, 1.4, -0.9, C.yellow);
    p.push(strut([0, 1.5, -0.2], [0, 1.55, 4.3], 0.55, 0.55, C.yellow));
    p.push(box(2.2, 0.3, 0.4, 0, 0.75, 4.6, C.dark));
    const blade = box(3.8, 0.62, 0.14, 0, 0.12, 1.6, C.steel);
    blade.rotateY(0.45);
    p.push(blade);
    p.push(strut([0, 1.4, 2.6], [0, 0.6, 1.6], 0.2, 0.2, C.dark));
    wheels(p, 0.62, 0.45, [[-1.05, 0.62, 4.3], [1.05, 0.62, 4.3], [-1.15, 0.62, -2.2], [1.15, 0.62, -2.2], [-1.15, 0.62, -3.65], [1.15, 0.62, -3.65]]);
    return { parts: p, len: 9, lights: [...heads(0.9, 1.9, 4.9), ...tails(1.0, 1.4, -4.0), amber(0, 3.25, -0.9)] };
  },
  paver() {
    const p = [];
    for (const s of [-1, 1]) p.push(box(0.5, 0.6, 3.2, s * 1.15, 0, 0.2, C.dark));
    p.push(box(2.6, 1.3, 3.4, 0, 0.45, 0, C.yellow));
    p.push(box(2.8, 0.1, 1.9, 0, 0.75, 2.75, C.dark));                    // hopper floor
    for (const s of [-1, 1]) {
      const wing = box(0.1, 0.85, 1.9, s * 1.55, 0.8, 2.75, C.yellow);
      p.push(wing);
    }
    p.push(box(3.1, 0.75, 0.1, 0, 0.75, 3.7, C.yellow));
    p.push(box(2.0, 0.55, 0.6, 0, 1.75, -0.9, C.dark));                    // console
    p.push(box(0.45, 0.5, 0.45, -0.7, 2.3, -0.9, C.black));                // seat
    p.push(box(0.45, 0.5, 0.45, 0.7, 2.3, -0.9, C.black));
    for (const [x, z] of [[-1.2, 0.2], [1.2, 0.2], [-1.2, -1.8], [1.2, -1.8]]) p.push(box(0.08, 1.6, 0.08, x, 1.75, z, C.dark));
    p.push(box(2.8, 0.08, 2.3, 0, 3.35, -0.8, C.yellow));                  // canopy
    p.push(box(6.2, 0.55, 1.1, 0, 0.12, -2.5, C.yellowDk));                // screed
    p.push(box(6.2, 0.22, 0.4, 0, 0.67, -2.4, C.dark));
    for (const s of [-1, 1]) p.push(box(0.08, 0.7, 1.4, s * 3.1, 0.05, -2.5, C.yellow));
    p.push(cyl(0.09, 0.9, 0.9, 2.2, 1.0, C.dark));
    return { parts: p, len: 7, lights: [...heads(1.0, 2.0, 1.75), amber(0, 3.55, -0.8), { x: -2.9, y: 1.2, z: -2.6, kind: LIGHT_KIND.HEAD, color: 0xfff0d0, size: 0.6 }, { x: 2.9, y: 1.2, z: -2.6, kind: LIGHT_KIND.HEAD, color: 0xfff0d0, size: 0.6 }] };
  },
  rollerSteel() {
    const p = [];
    p.push(box(1.5, 1.0, 2.6, 0, 0.75, 0, C.yellow));
    for (const z of [-1.55, 1.55]) {
      p.push(cyl(0.66, 1.72, 0, 0.66, z, C.steel, 'x', 20));
      p.push(box(1.9, 0.5, 0.25, 0, 1.05, z + Math.sign(z) * 0.72, C.yellow));
    }
    p.push(box(0.5, 0.5, 0.5, 0, 1.75, 0, C.black));
    for (const [x, z] of [[-0.75, 0.6], [0.75, 0.6], [-0.75, -0.6], [0.75, -0.6]]) p.push(box(0.07, 1.5, 0.07, x, 1.75, z, C.dark));
    p.push(box(1.7, 0.08, 1.6, 0, 3.25, 0, C.yellow));
    return { parts: p, len: 4.6, lights: [...heads(0.6, 1.4, 2.3), ...tails(0.6, 1.4, -2.3), amber(0, 3.45, 0)] };
  },
  rollerTyre() {
    const p = [];
    p.push(box(1.95, 1.25, 3.4, 0, 0.55, 0, C.yellow));
    for (let i = 0; i < 4; i++) {
      p.push(cyl(0.46, 0.34, -0.75 + i * 0.5, 0.46, 1.3, C.tyre, 'x', 12));
      p.push(cyl(0.46, 0.34, -0.5 + i * 0.5 - 0.25 + 0.25, 0.46, -1.3, C.tyre, 'x', 12));
    }
    p.push(box(0.5, 0.5, 0.5, 0, 1.8, -0.2, C.black));
    for (const [x, z] of [[-0.85, 0.5], [0.85, 0.5], [-0.85, -0.9], [0.85, -0.9]]) p.push(box(0.07, 1.45, 0.07, x, 1.8, z, C.dark));
    p.push(box(2.0, 0.08, 1.8, 0, 3.25, -0.2, C.yellow));
    return { parts: p, len: 4.6, lights: [...heads(0.7, 1.4, 1.75), ...tails(0.7, 1.4, -1.75), amber(0, 3.45, -0.2)] };
  },
  mixer() {
    const p = [];
    const cz = truckChassis(p, 9.6, C.white, { axles: [3.6, 2.2, -1.8, -3.1] });
    p.push(box(1.0, 0.9, 0.9, 0, 1.25, cz - 1.5, C.dark));
    p.push(strut([0, 1.3, -3.7], [0, 2.55, -4.5], 0.5, 0.15, C.steel));  // chute
    // drum (sub): lathe along +Z centred on origin
    const prof = [[0.35, -2.6], [0.95, -2.2], [1.22, -0.8], [1.18, 0.6], [0.85, 2.0], [0.4, 2.55], [0.38, 2.7]].map(([r, y]) => new THREE.Vector2(r, y));
    const drum = new THREE.LatheGeometry(prof, 22);
    drum.rotateX(-Math.PI / 2);
    const col = new Float32Array(drum.attributes.position.count * 3);
    const ca = new THREE.Color(C.orange);
    const cb = new THREE.Color(C.white);
    for (let i = 0; i < drum.attributes.position.count; i++) {
      const x = drum.attributes.position.getX(i);
      const y = drum.attributes.position.getY(i);
      const z = drum.attributes.position.getZ(i);
      const ang = Math.atan2(y, x);
      const c = Math.sin(ang * 2 + z * 1.6) > 0 ? ca : cb;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    drum.setAttribute('color', new THREE.BufferAttribute(col, 3));
    drum.deleteAttribute('uv');
    p.push(box(0.3, 1.2, 0.3, 0, 1.0, 1.4, C.dark));
    p.push(box(0.3, 0.9, 0.3, 0, 1.0, -3.2, C.dark));
    return { parts: p, sub: { parts: [drum], pivot: [0, 2.35, -0.9], axis: 'drum', tilt: 0.24 }, len: 9.6,
      lights: [...heads(1.0, 1.0, 4.8), ...tails(1.05, 0.9, -4.8), amber(0, 3.3, 3.8)] };
  },
  bowser() {
    const p = [];
    truckChassis(p, 8.6, C.blue, { axles: [3.0, -1.8, -3.0] });
    const tank = cyl(1.12, 5.4, 0, 2.15, -1.2, C.white, 'z', 18);
    tank.scale(1, 0.92, 1);
    p.push(tank);
    p.push(cyl(1.14, 0.35, 0, 2.15, -1.2, C.blue, 'z', 18));
    p.push(box(2.4, 0.12, 0.12, 0, 0.7, -4.3, C.steel));                // spray bar
    p.push(box(0.6, 0.15, 3.0, 0, 3.1, -1.2, C.steel));                 // walkway
    return { parts: p, len: 8.6, lights: [...heads(1.0, 1.0, 4.3), ...tails(1.05, 0.9, -4.3), amber(0, 3.2, 3.2)] };
  },
  pickup() {
    const p = [];
    p.push(box(1.85, 0.72, 5.3, 0, 0.42, 0, C.white));
    p.push(box(1.75, 0.82, 2.5, 0, 1.12, 0.55, C.glass));
    p.push(box(1.78, 0.1, 2.3, 0, 1.94, 0.45, C.white));
    p.push(box(1.8, 0.35, 0.12, 0, 1.12, 1.8, C.white));                  // A-pillar / bonnet line
    for (const s of [-1, 1]) p.push(box(0.08, 0.45, 2.0, s * 0.88, 1.12, -1.65, C.white));
    p.push(box(1.85, 0.45, 0.08, 0, 1.12, -2.62, C.white));
    p.push(box(1.7, 0.18, 0.06, 0, 0.75, 2.66, C.silver));
    wheels(p, 0.38, 0.3, [[-0.85, 0.38, 1.6], [0.85, 0.38, 1.6], [-0.85, 0.38, -1.6], [0.85, 0.38, -1.6]]);
    return { parts: p, len: 5.3, lights: [...heads(0.7, 0.85, 2.66), ...tails(0.8, 0.95, -2.66), amber(0, 2.1, 0.4)] };
  },
  // ---------------------------------------------------------------- GSE
  tug() {
    const p = [];
    p.push(box(2.9, 1.0, 6.2, 0, 0.38, 0, C.dark));
    p.push(box(2.95, 0.12, 6.25, 0, 1.38, 0, C.yellow));
    p.push(box(2.6, 0.35, 0.3, 0, 0.5, 3.1, C.yellow));
    cab(p, 1.3, 0.95, 1.4, 0.65, 1.5, -2.2, C.yellow, { glassFront: true, glassSides: true });
    wheels(p, 0.6, 0.55, [[-1.25, 0.6, 1.9], [1.25, 0.6, 1.9], [-1.25, 0.6, -1.9], [1.25, 0.6, -1.9]]);
    return { parts: p, len: 6.2, lights: [...heads(1.1, 1.0, 3.1), ...tails(1.1, 1.0, -3.1), amber(0.65, 2.6, -2.2)] };
  },
  tractor() {
    const p = [];
    p.push(box(1.45, 0.75, 2.8, 0, 0.32, 0, C.white));
    p.push(box(1.3, 0.55, 1.0, 0, 1.07, 0.75, C.white));
    p.push(box(0.5, 0.45, 0.5, 0, 1.07, -0.4, C.black));
    for (const [x, z] of [[-0.62, 0.25], [0.62, 0.25], [-0.62, -1.1], [0.62, -1.1]]) p.push(box(0.06, 1.25, 0.06, x, 1.07, z, C.dark));
    p.push(box(1.45, 0.07, 1.6, 0, 2.32, -0.42, C.crimson));
    wheels(p, 0.35, 0.28, [[-0.68, 0.35, 0.95], [0.68, 0.35, 0.95], [-0.68, 0.35, -0.95], [0.68, 0.35, -0.95]]);
    return { parts: p, len: 2.8, lights: [...heads(0.55, 0.85, 1.4), amber(0, 2.45, -0.4)] };
  },
  cart() {
    const p = [];
    p.push(box(1.6, 0.18, 3.0, 0, 0.45, 0, C.grey));
    for (const [x, z] of [[-0.75, 1.42], [0.75, 1.42], [-0.75, -1.42], [0.75, -1.42]]) p.push(box(0.07, 1.55, 0.07, x, 0.63, z, C.dark));
    p.push(box(1.64, 0.07, 3.05, 0, 2.18, 0, C.navy));
    for (const s of [-1, 1]) p.push(box(0.04, 1.3, 2.7, s * 0.8, 0.85, 0, C.navy));
    p.push(box(1.3, 0.75, 1.3, 0, 0.63, 0.65, 0x6b1f2a));
    p.push(box(1.2, 0.6, 1.0, 0, 0.63, -0.75, 0x22305e));
    p.push(box(0.1, 0.1, 1.0, 0, 0.45, 1.95, C.dark));                       // drawbar
    wheels(p, 0.24, 0.18, [[-0.7, 0.24, 1.1], [0.7, 0.24, 1.1], [-0.7, 0.24, -1.1], [0.7, 0.24, -1.1]]);
    return { parts: p, len: 3.0, lights: [] };
  },
  beltLoader() {
    const p = [];
    p.push(box(2.0, 0.6, 6.6, 0, 0.32, 0, C.white));
    cab(p, 1.0, 1.1, 1.3, -0.55, 0.9, -2.3, C.white);
    p.push(strut([0, 1.0, -3.6], [0, 3.35, 3.7], 1.0, 0.22, C.black));
    for (const s of [-1, 1]) p.push(strut([s * 0.55, 1.45, -3.4], [s * 0.55, 3.8, 3.6], 0.06, 0.06, C.yellow));
    p.push(strut([0, 0.9, 1.0], [0, 2.4, 1.6], 0.25, 0.25, C.steel));
    wheels(p, 0.38, 0.3, [[-0.95, 0.38, 2.2], [0.95, 0.38, 2.2], [-0.95, 0.38, -2.2], [0.95, 0.38, -2.2]]);
    return { parts: p, len: 7.4, lights: [...heads(0.8, 0.7, 3.3), amber(-0.55, 2.1, -2.3)] };
  },
  fuel() {
    const p = [];
    truckChassis(p, 10.4, C.white, { axles: [3.8, -2.1, -3.5], cabLen: 2.2 });
    const tank = cyl(1.2, 6.4, 0, 2.25, -1.4, C.white, 'z', 20);
    tank.scale(1.05, 0.9, 1);
    p.push(tank);
    p.push(box(2.55, 0.25, 6.3, 0, 1.55, -1.4, C.red));
    p.push(cyl(0.55, 1.2, 0, 1.4, -4.9, C.dark, 'x', 14));                 // hose reel
    p.push(box(1.0, 0.1, 4.0, 0, 3.32, -1.4, C.steel));
    return { parts: p, len: 10.4, lights: [...heads(1.0, 1.0, 5.2), ...tails(1.05, 0.9, -5.2), amber(0, 3.25, 3.9)] };
  },
  catering() {
    const p = [];
    truckChassis(p, 8.4, C.white, { axles: [2.9, -2.3], cabLen: 2.0 });
    p.push(box(2.3, 0.2, 5.6, 0, 1.1, -1.2, C.steel));
    for (const s of [-1, 1]) {
      p.push(strut([s * 1.05, 1.3, -3.6], [s * 1.05, 3.4, 1.0], 0.12, 0.12, C.steel));
      p.push(strut([s * 1.05, 1.3, 1.0], [s * 1.05, 3.4, -3.6], 0.12, 0.12, C.steel));
    }
    p.push(box(2.0, 0.12, 1.4, 0, 1.3, 3.0, C.steel));
    const s = [];
    s.push(box(2.5, 2.6, 5.4, 0, 0, 0, C.white));
    s.push(box(2.52, 0.3, 5.42, 0, 1.55, 0, C.crimson));
    s.push(box(2.52, 0.12, 5.42, 0, 1.93, 0, C.navy));
    s.push(box(1.8, 0.1, 1.2, 0, 0.05, 3.3, C.steel));                       // front platform
    s.forEach((g) => g.translate(0, 0, -1.2));
    return { parts: p, sub: { parts: s, pivot: [0, 1.3, 0], axis: 'lift' }, len: 8.4,
      lights: [...heads(1.0, 1.0, 4.2), ...tails(1.05, 0.9, -4.2), amber(0, 3.2, 3.2)] };
  },
  bus() {
    const p = [];
    p.push(box(2.95, 0.9, 13.5, 0, 0.32, 0, C.white));
    p.push(box(2.97, 1.35, 13.3, 0, 1.22, 0, C.glass));
    p.push(box(2.95, 0.55, 13.5, 0, 2.55, 0, C.white));
    p.push(box(2.97, 0.25, 13.52, 0, 0.85, 0, C.crimson));
    p.push(box(2.97, 0.08, 13.52, 0, 1.12, 0, C.navy));
    for (let i = 0; i < 3; i++) p.push(box(0.04, 2.2, 1.4, 1.5, 0.35, 4.2 - i * 4.2, 0x3a4450));
    wheels(p, 0.5, 0.35, [[-1.3, 0.5, 4.6], [1.3, 0.5, 4.6], [-1.3, 0.5, -4.4], [1.3, 0.5, -4.4]]);
    return { parts: p, len: 13.5, lights: [...heads(1.15, 0.8, 6.76), ...tails(1.2, 0.9, -6.76), amber(0, 3.15, 5.5)] };
  },
  arff() {
    const p = [];
    p.push(box(3.0, 2.3, 9.0, 0, 1.0, -1.2, C.red));
    cab(p, 3.0, 1.9, 2.6, 0, 1.0, 4.3, C.red);
    p.push(box(3.02, 0.12, 11.8, 0, 2.2, 0, C.white));
    p.push(box(2.6, 0.12, 5.0, 0, 3.32, -1.5, C.steel));
    p.push(cyl(0.3, 0.5, 0, 3.15, 3.8, C.silver, 'y', 10));
    p.push(strut([0, 3.35, 3.8], [0, 3.6, 5.3], 0.18, 0.18, C.silver));
    p.push(box(2.0, 0.18, 0.35, 0, 2.95, 5.2, C.dark));                      // light bar
    wheels(p, 0.72, 0.55, [[-1.3, 0.72, 3.8], [1.3, 0.72, 3.8], [-1.3, 0.72, -1.4], [1.3, 0.72, -1.4], [-1.3, 0.72, -3.4], [1.3, 0.72, -3.4]]);
    return { parts: p, len: 11.8, lights: [...heads(1.15, 1.2, 5.65), ...tails(1.2, 1.4, -5.85),
      { x: -0.7, y: 3.15, z: 5.2, kind: LIGHT_KIND.AMBER, color: 0xff2020, size: 0.6 }, { x: 0.7, y: 3.15, z: 5.2, kind: LIGHT_KIND.AMBER, color: 0x2a5cff, size: 0.6, phase: 0.5 }] };
  },
};
function heads(x, y, z) {
  return [{ x: -x, y, z, kind: LIGHT_KIND.HEAD, color: 0xfff2d8, size: 0.55, day: 0.05 }, { x, y, z, kind: LIGHT_KIND.HEAD, color: 0xfff2d8, size: 0.55, day: 0.05 }];
}
function tails(x, y, z) {
  return [{ x: -x, y, z, kind: LIGHT_KIND.TAIL, color: 0xff1a10, size: 0.35, day: 0.05 }, { x, y, z, kind: LIGHT_KIND.TAIL, color: 0xff1a10, size: 0.35, day: 0.05 }];
}
function amber(x, y, z) { return { x, y, z, kind: LIGHT_KIND.AMBER, color: 0xffa21a, size: 0.55, day: 0.55 }; }

const CONSTRUCTION = ['dump', 'excavator', 'grader', 'paver', 'rollerSteel', 'rollerTyre', 'mixer', 'bowser', 'pickup'];
const GSE = ['tug', 'tractor', 'cart', 'beltLoader', 'fuel', 'catering', 'bus', 'arff'];
const POOL = { dump: 16, excavator: 6, grader: 4, paver: 3, rollerSteel: 6, rollerTyre: 3, mixer: 8, bowser: 4, pickup: 14,
  tug: 8, tractor: 8, cart: 24, beltLoader: 16, fuel: 8, catering: 8, bus: 4, arff: 2 };

const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

/** Simple seeded RNG (mulberry32) so the fleet is laid out the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* =============================================================== fleet */
export class VehicleFleet {
  constructor(scene, quality, materials = null, layout = null) {
    this.scene = scene;
    this.quality = quality;
    this.layout = layout || {};
    this.groundAt = (layout && layout.groundAt) || null;
    this.group = new THREE.Group();
    this.group.name = 'vehicle-fleet';
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.2, envMapIntensity: 0.9 });
    this.material.name = 'hdd:vehicles';
    this.time = 0;
    this.night = 0;
    this.gseActive = false;
    this.operational = false;
    this.turnarounds = [];
    this.rand = rng(4417);
    this.types = {};
    this.units = [];
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._m3 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._axisY = new THREE.Vector3(0, 1, 0);
    this._lp = new THREE.Vector3();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    const plant = (MASTERPLAN.site && MASTERPLAN.site.batchPlant) || { x: 320, z: 1650 };
    this.plant = { x: plant.x - 30, z: plant.z };
    const lay = (MASTERPLAN.site && MASTERPLAN.site.laydown) || { x0: 260, x1: 420, z0: 1750, z1: 1950 };
    this.laydown = lay;

    let lightCount = 0;
    for (const name of [...CONSTRUCTION, ...GSE]) {
      const def = BUILDERS[name]();
      const cap = POOL[name];
      const geo = mergeGeometries(def.parts);
      const mesh = new THREE.InstancedMesh(geo, this.material, cap);
      mesh.name = `veh:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      const t = { name, def, cap, mesh, sub: null, units: [], gse: GSE.includes(name) };
      if (def.sub) {
        const sg = mergeGeometries(def.sub.parts);
        const sm = new THREE.InstancedMesh(sg, this.material, cap);
        sm.name = `veh:${name}:part`;
        sm.castShadow = true;
        sm.frustumCulled = false;
        sm.count = 0;
        sm.visible = false;
        sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(sm);
        t.sub = sm;
        t.pivot = new THREE.Vector3(...def.sub.pivot);
      }
      this.types[name] = t;
      for (let i = 0; i < cap; i++) {
        const u = {
          type: t, index: i, visible: false, x: 0, y: 0, z: 0, h: 0, speed: 0, sub: 0, subSpin: 0,
          mode: 'park', park: null, task: null, wp: 0, dwell: 0, timer: this.rand() * 10, phase: this.rand(),
          lightBase: lightCount, beacon: true, moving: false, tx: 0, tz: 0, th: 0,
        };
        lightCount += def.lights.length;
        t.units.push(u);
        this.units.push(u);
      }
    }
    this._buildLights(lightCount);
    this._assignParking();
    this._buildStands();
    this._frontsKey = '';
    this.crews = [];
    this._byStand = [];
    this.setActivity({ fronts: [], workforce: 0, operational: false });
  }

  /* --------------------------------------------------------- lights */
  _buildLights(n) {
    const geo = new THREE.BufferGeometry();
    this._lightPos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const blink = new Float32Array(n * 4);
    this._lightLocal = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (const u of this.units) {
      u.type.def.lights.forEach((l, k) => {
        const i = u.lightBase + k;
        this._lightLocal[i * 3] = l.x; this._lightLocal[i * 3 + 1] = l.y; this._lightLocal[i * 3 + 2] = l.z;
        c.set(l.color);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        size[i] = l.size;
        blink[i * 4] = l.kind;
        blink[i * 4 + 1] = (l.phase || 0) + this.rand();
        blink[i * 4 + 2] = l.kind === LIGHT_KIND.AMBER ? 1.4 : 1;
        blink[i * 4 + 3] = l.day === undefined ? 0.4 : l.day;
      });
    }
    this._lightPos.fill(-10000);
    this._lightAttr = new THREE.BufferAttribute(this._lightPos, 3);
    this._lightAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this._lightAttr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aBlink', new THREE.BufferAttribute(blink, 4));
    this.lights = new THREE.Points(geo, createLightMaterial({ mask: [0, 1, 0, 0], minPx: 1.2 }));
    this.lights.frustumCulled = false;
    this.lights.onBeforeRender = updateLightScale;
    this.lights.name = 'vehicle-lights';
    this.group.add(this.lights);
  }

  /* --------------------------------------------------------- parking */
  _assignParking() {
    const L = this.laydown;
    let col = 0;
    let row = 0;
    const cols = Math.max(4, Math.floor((L.x1 - L.x0 - 10) / 9));
    for (const name of CONSTRUCTION) {
      for (const u of this.types[name].units) {
        const x = L.x0 + 8 + col * 9;
        const z = L.z0 + 14 + row * 16;
        u.park = { x, z, h: Math.PI };
        col++;
        if (col >= cols) { col = 0; row++; }
      }
    }
  }

  _buildStands() {
    const stands = this.layout.STANDS || [];
    this.stands = stands.length ? stands.map((s) => ({ index: s.index, z: s.z, noseX: s.noseX ?? s.x, contact: !!s.contact }))
      : Array.from({ length: MASTERPLAN.stands }, (_, i) => {
        const a = MASTERPLAN.apron;
        return { index: i, z: a.z0 + ((i + 0.5) * (a.z1 - a.z0)) / MASTERPLAN.stands, noseX: -452, contact: i >= 2 && i < 2 + MASTERPLAN.jetBridges };
      });
    const pitch = this.stands.length > 1 ? Math.abs(this.stands[1].z - this.stands[0].z) : 82;
    const take = (name) => this.types[name].units.find((u) => !u.crew);
    this.standCrews = this.stands.map((st) => {
      const crew = { stand: st, members: [] };
      const add = (name, role, extra = {}) => { const u = take(name); if (!u) return null; u.crew = crew; u.role = role; Object.assign(u, extra); crew.members.push(u); return u; };
      add('tug', 'tug');
      add('beltLoader', 'beltF');
      add('beltLoader', 'beltA');
      const tr = add('tractor', 'tractor');
      for (let k = 0; k < 3; k++) { const c = add('cart', 'cart', { k }); if (c) c.leader = tr; }
      add('fuel', 'fuel');
      add('catering', 'catering');
      if (!st.contact) add('bus', 'bus');
      // staging: a neat row on the stand's starboard boundary line
      const bz = st.z - pitch / 2 + 4;
      let sx = st.noseX + 12;
      for (const u of crew.members) {
        if (u.role === 'cart') { u.stage = { x: crew.members.find((m) => m.role === 'tractor').stage.x, z: bz, h: 0 }; continue; }
        const len = u.type.def.len;
        u.stage = { x: sx + len / 2, z: bz, h: Math.PI / 2 };
        sx += len + 3;
        if (u.role === 'tractor') sx += 3 * 3.4 + 1;
      }
      return crew;
    });
    // ARFF tenders at the fire station apron, spare buses by the terminal
    const arff = MASTERPLAN.arff || { x0: -300, x1: -230, z0: 520, z1: 580 };
    this.types.arff.units.forEach((u, i) => { u.stage = { x: arff.x1 + 8, z: arff.z0 + 15 + i * 18, h: Math.PI / 2 }; u.role = 'standby'; });
    this.types.bus.units.forEach((u, i) => { if (!u.crew) { u.stage = { x: -470, z: 200 + i * 16, h: 0 }; u.role = 'standby'; } });
    for (const u of this.units) if (u.type.gse && u.stage) { u.x = u.stage.x; u.z = u.stage.z; u.h = u.stage.h; }
  }

  /* --------------------------------------------------------- public */
  setGseActive(on) {
    this.gseActive = !!on;
    this.gseVisible = this.gseActive || this.operational;
  }

  setTurnarounds(list) {
    this.turnarounds = list || [];
  }

  /** Distribute construction plant over the active work fronts. */
  setActivity({ fronts = [], workforce = 0, operational = false } = {}) {
    this.operational = !!operational;
    this.gseVisible = this.gseActive || this.operational;
    const list = fronts.slice().sort((a, b) => (b.radius || 0) - (a.radius || 0));
    const key = `${list.map((f) => f.wbsId).join(',')}|${Math.round(workforce * 4)}|${operational ? 1 : 0}`;
    // keep crews; refresh their front geometry (fronts creep as work progresses)
    for (const crew of this.crews) {
      const f = list.find((ff) => ff.wbsId === crew.front.wbsId);
      if (f) { crew.front.x = f.x; crew.front.z = f.z; crew.front.radius = f.radius || 40; }
    }
    if (key === this._frontsKey) return;
    this._frontsKey = key;
    for (const t of CONSTRUCTION) for (const u of this.types[t].units) { u.task = null; u.mode = 'park'; u.wp = 0; u.dwell = 0; }
    this.crews = [];
    if (operational) return;
    const scale = 0.45 + 0.55 * Math.max(0, Math.min(1, workforce));
    const free = (name) => this.types[name].units.find((u) => !u.task);
    for (const f of list) {
      const front = { wbsId: f.wbsId, x: f.x, z: f.z, radius: Math.max(20, f.radius || 40), kind: f.kind || 'building' };
      const crew = { front, members: [] };
      const want = (name, n, setup) => {
        for (let i = 0; i < Math.round(n); i++) {
          const u = free(name);
          if (!u) return;
          u.task = { crew, k: i, n: Math.round(n) };
          setup(u, i);
          crew.members.push(u);
        }
      };
      const kind = front.kind;
      if (/pav|asph|surf|apron|overlay/.test(kind)) {
        let paver = null;
        want('paver', 1, (u) => { u.mode = 'paver'; paver = u; this._placeNear(u, front, 0); });
        want('rollerSteel', paver ? 2 : 1, (u, i) => { u.mode = 'roller'; u.leader = paver; u.offset = 16 + i * 12; this._placeNear(u, front, 10 + i * 10); });
        want('rollerTyre', paver ? 1 : 0, (u) => { u.mode = 'roller'; u.leader = paver; u.offset = 42; this._placeNear(u, front, 40); });
        want('dump', 3 * scale, (u, i) => { u.mode = 'haul'; u.leader = paver; u.dumpAt = 'front'; this._startHaul(u, i); });
        want('bowser', 1, (u) => { u.mode = 'loop'; this._placeNear(u, front, front.radius); });
        want('pickup', 1, (u) => { u.mode = 'parked'; this._parkAt(u, front, 0.95); });
        if (!paver) want('grader', 1, (u) => { u.mode = 'sweep'; this._placeNear(u, front, 0); });
      } else if (/earth|clear|exc|grad|drain|obstacle|landscape/.test(kind)) {
        const exc = [];
        want('excavator', kind === 'landscape' ? 1 : 1 + (scale > 0.8 ? 1 : 0), (u, i) => { u.mode = 'dig'; exc.push(u); this._placeNear(u, front, front.radius * 0.3 + i * 22, i * 2.6); });
        want('dump', 3 * scale, (u, i) => { u.mode = 'haul'; u.leader = exc[i % Math.max(1, exc.length)] || null; u.dumpAt = 'spoil'; this._startHaul(u, i); });
        want('grader', 1, (u) => { u.mode = 'sweep'; this._placeNear(u, front, front.radius * 0.5, 2); });
        want('bowser', 1, (u) => { u.mode = 'loop'; this._placeNear(u, front, front.radius); });
        want('pickup', 1, (u) => { u.mode = 'parked'; this._parkAt(u, front, 1.0); });
      } else if (/elec|light|nav|ils|mark/.test(kind)) {
        want('pickup', 2, (u, i) => { u.mode = i === 0 ? 'patrol' : 'parked'; if (i === 0) this._placeNear(u, front, 6); else this._parkAt(u, front, 0.6); });
      } else {
        want('mixer', 2 * scale, (u, i) => { u.mode = 'haul'; u.leader = null; u.dumpAt = 'pour'; this._startHaul(u, i); });
        want('pickup', 2, (u, i) => { u.mode = i === 0 ? 'patrol' : 'parked'; if (i === 0) this._placeNear(u, front, front.radius * 0.6); else this._parkAt(u, front, 1.05); });
        if (scale > 0.6) want('dump', 1, (u) => { u.mode = 'parked'; this._parkAt(u, front, 0.9, 1.4); });
      }
      if (crew.members.length) this.crews.push(crew);
    }
  }

  _placeNear(u, front, dist, ang = 0) {
    const a = ang + u.phase * TAU;
    u.x = front.x + Math.cos(a) * dist;
    u.z = front.z + Math.sin(a) * dist;
    u.h = u.phase * TAU;
  }

  _parkAt(u, front, frac, ang = 0.7) {
    const a = ang + u.index * 0.9;
    u.x = front.x + Math.cos(a) * front.radius * frac;
    u.z = front.z + Math.sin(a) * front.radius * frac;
    u.h = a + Math.PI / 2;
  }

  _startHaul(u, i) {
    // stagger trucks along the haul cycle so they never bunch
    u.haulState = i % 2 === 0 ? 'toFront' : 'toPlant';
    const t = (i * 0.37 + u.phase * 0.2) % 1;
    const f = u.task.crew.front;
    u.x = this.plant.x + (f.x - this.plant.x) * t + (i % 3 - 1) * 6;
    u.z = this.plant.z + (f.z - this.plant.z) * t;
    u.h = Math.atan2(f.x - this.plant.x, f.z - this.plant.z) + (u.haulState === 'toPlant' ? Math.PI : 0);
    u.dwell = 0;
  }

  /* --------------------------------------------------------- motion */
  /** Pure pursuit towards (tx, tz); returns remaining distance. */
  _drive(u, dt, tx, tz, vmax, turnRate = 0.9, reverse = false) {
    const dx = tx - u.x;
    const dz = tz - u.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { u.speed = 0; return d; }
    let want = Math.atan2(dx, dz);
    if (reverse) want += Math.PI;
    const err = angDiff(u.h, want);
    const maxTurn = turnRate * dt * Math.min(1, 0.25 + u.speed / 3);
    u.h += Math.max(-maxTurn, Math.min(maxTurn, err));
    const align = Math.max(0.15, Math.cos(err));
    const target = Math.min(vmax, d * 0.6 + 0.3) * align;
    u.speed += Math.max(-3 * dt, Math.min(1.5 * dt, target - u.speed));
    const step = Math.min(d, Math.max(0, u.speed) * dt);
    const dir = reverse ? -1 : 1;
    u.x += Math.sin(u.h) * step * dir;
    u.z += Math.cos(u.h) * step * dir;
    return d;
  }

  /** Seek a pose: drive there, then settle the heading. */
  _seek(u, dt, x, z, h, vmax = 6) {
    const d = this._drive(u, dt, x, z, vmax, 1.1);
    if (d < 2.5) {
      u.h += angDiff(u.h, h) * Math.min(1, dt * 1.5);
      if (d < 0.6) { u.x += (x - u.x) * Math.min(1, dt * 2); u.z += (z - u.z) * Math.min(1, dt * 2); }
    }
    u.moving = d > 0.8;
    return d;
  }

  _updateConstruction(u, dt) {
    const crew = u.task && u.task.crew;
    const f = crew ? crew.front : null;
    u.moving = false;
    switch (u.mode) {
      case 'paver': {
        // crawl up and down adjacent lanes inside the front, turning at each end
        const half = f.radius * 0.75;
        const lane = (u.lane || 0) % 4;
        const lx = f.x - 6 + (lane % 2 === 0 ? 0 : 0) + (lane < 2 ? 0 : 12) + (lane % 2) * 6;
        const dir = lane % 2 === 0 ? 1 : -1;
        const tz = f.z + dir * half;
        const d = this._drive(u, dt, lx, tz, 1.1, 0.35);
        u.moving = true;
        if (d < 1.5) u.lane = (lane + 1) % 4;
        break;
      }
      case 'roller': {
        const lead = u.leader;
        let bx; let bz; let bh;
        if (lead) { bh = lead.h; bx = lead.x - Math.sin(bh) * u.offset; bz = lead.z - Math.cos(bh) * u.offset; } else { bh = 0; bx = f.x; bz = f.z; }
        u.timer += dt;
        const osc = Math.sin(u.timer * 0.35 + u.phase * TAU) * 7;
        const tx = bx + Math.sin(bh) * osc + Math.cos(bh) * (u.index % 2 ? 1.6 : -1.6);
        const tz = bz + Math.cos(bh) * osc - Math.sin(bh) * (u.index % 2 ? 1.6 : -1.6);
        // rollers reverse rather than turn: keep heading parallel to the mat
        const dx = tx - u.x;
        const dz = tz - u.z;
        const d = Math.hypot(dx, dz);
        u.h += angDiff(u.h, bh) * Math.min(1, dt * 0.8);
        const step = Math.min(d, 2.2 * dt);
        if (d > 0.01) { u.x += (dx / d) * step; u.z += (dz / d) * step; }
        u.moving = d > 0.2;
        break;
      }
      case 'haul': {
        if (u.dwell > 0) {
          u.dwell -= dt;
          if (u.haulState === 'dumping') {
            const k = 1 - Math.max(0, u.dwell) / 9;
            u.sub = u.type.name === 'dump' ? Math.sin(Math.min(1, k) * Math.PI) * 0.85 : u.sub;
            u.subSpin += dt * (u.type.name === 'mixer' ? 3.2 : 0);
          } else u.subSpin += dt * 0.6;
          if (u.dwell <= 0) {
            u.haulState = u.haulState === 'dumping' ? 'toPlant' : 'toFront';
            u.sub = 0;
          }
          break;
        }
        u.subSpin += dt * 0.8;
        let tx;
        let tz;
        if (u.haulState === 'toFront') {
          const lead = u.leader;
          if (u.dumpAt === 'front' && lead) { tx = lead.x + Math.sin(lead.h) * 12; tz = lead.z + Math.cos(lead.h) * 12; } else if (u.dumpAt === 'spoil' && lead) {
            tx = lead.x + Math.sin(lead.h + lead.subRest) * 7.5; tz = lead.z + Math.cos(lead.h + lead.subRest) * 7.5;
          } else {
            const a = u.index * 1.7;
            tx = f.x + Math.cos(a) * f.radius * 0.55; tz = f.z + Math.sin(a) * f.radius * 0.55;
          }
        } else if (u.dumpAt === 'spoil') {
          // earthworks: cut is hauled to a spoil / fill area beside the front, not to the batch plant
          tx = f.x + f.radius * 1.7 + ((u.index % 3) - 1) * 9; tz = f.z + f.radius * 0.4;
        } else { tx = this.plant.x + ((u.index % 4) - 1.5) * 7; tz = this.plant.z + 10; }
        const d = this._drive(u, dt, tx, tz, 11, 0.6);
        u.moving = true;
        if (d < 3) {
          if (u.haulState === 'toFront') { u.haulState = 'dumping'; u.dwell = u.type.name === 'mixer' ? 16 : 9; } else { u.haulState = 'loading'; u.dwell = 8 + u.phase * 6; }
        }
        break;
      }
      case 'dig': {
        // excavator: swing between the dig face and the truck side
        u.timer += dt;
        const cyc = (u.timer * 0.11 + u.phase) % 1;
        const swing = cyc < 0.35 ? 0 : cyc < 0.5 ? (cyc - 0.35) / 0.15 : cyc < 0.75 ? 1 : 1 - (cyc - 0.75) / 0.25;
        const s = swing * swing * (3 - 2 * swing);
        u.subRest = 1.9;
        u.sub = s * 1.9;
        break;
      }
      case 'sweep': {
        const half = f.radius * 0.7;
        const lane = (u.lane || 0) % 2;
        const tx = f.x + 14 + (u.index % 2) * 6;
        const tz = f.z + (lane === 0 ? half : -half);
        const d = this._drive(u, dt, tx + (lane ? 4 : 0), tz, 2.6, 0.4);
        u.moving = true;
        if (d < 3) u.lane = lane + 1;
        break;
      }
      case 'loop': {
        u.timer += dt * 0.05;
        const a = u.timer + u.phase * TAU;
        const r = f.radius * 1.05;
        this._drive(u, dt, f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 4.5, 0.6);
        u.moving = true;
        break;
      }
      case 'patrol': {
        u.timer += dt * 0.035;
        const a = u.timer * TAU + u.phase * TAU;
        this._drive(u, dt, f.x + Math.cos(a) * f.radius * 0.7, f.z + Math.sin(a * 1.3) * f.radius * 0.7, 5, 0.8);
        u.moving = true;
        break;
      }
      case 'parked':
      default:
        if (!u.task && u.park) {
          // demobilised plant drives back to the laydown yard, then parks in its slot
          const d = Math.hypot(u.park.x - u.x, u.park.z - u.z);
          if (d > 400) { u.x = u.park.x; u.z = u.park.z; u.h = u.park.h; } else if (d > 0.5) this._seek(u, dt, u.park.x, u.park.z, u.park.h, 6);
          u.sub = 0;
        }
        break;
    }
  }

  _updateGse(u, dt) {
    if (u.role === 'standby') { u.moving = false; return; }
    const crew = u.crew;
    if (!crew) return;
    const rec = this._byStand[crew.stand.index];
    if (u.role === 'cart') {
      const lead = u.leader;
      if (!lead) return;
      const back = 3.3 + u.k * 3.35;
      u.x = lead.x - Math.sin(lead.h) * back;
      u.z = lead.z - Math.cos(lead.h) * back;
      u.h = lead.h;
      u.moving = lead.moving;
      return;
    }
    let tx = u.stage.x;
    let tz = u.stage.z;
    let th = u.stage.h;
    let lift = 0;
    let active = false;
    if (rec && this.gseActive) {
      const ph = rec.phase;
      const meta = AIRCRAFT_TYPES[rec.type] || AIRCRAFT_TYPES.narrow;
      const L = rec.length || meta.length;
      const R = meta.radius;
      const S = rec.span || meta.span;
      let lx = 0; let lz = 0; let lh = 0;
      switch (u.role) {
        case 'tug':
          if (rec.pushing || ph > 0.9) { active = true; lx = 0; lz = L / 2 + 3.8; lh = Math.PI; }
          break;
        case 'beltF': if (ph > 0.04 && ph < 0.8) { active = true; lx = -(R + 3.9); lz = L * 0.2; lh = Math.PI / 2 + 0.15; } break;
        case 'beltA': if (ph > 0.06 && ph < 0.78) { active = true; lx = -(R + 3.9); lz = -L * 0.22; lh = Math.PI / 2 - 0.15; } break;
        case 'tractor': if (ph > 0.05 && ph < 0.76) { active = true; lx = -(R + 10.5); lz = L * 0.02; lh = Math.PI; } break;
        case 'fuel': if (ph > 0.15 && ph < 0.55) { active = true; lx = -(S * 0.2 + 3); lz = -L * 0.03; lh = 0; } break;
        case 'catering': if (ph > 0.2 && ph < 0.66) { active = true; lx = -(R + 5.0); lz = -L * 0.36; lh = Math.PI / 2; lift = Math.max(0, Math.min(1, (ph - 0.26) / 0.04, (0.6 - ph) / 0.04)); } break;
        case 'bus': if ((ph > 0.01 && ph < 0.14) || (ph > 0.7 && ph < 0.86)) { active = true; lx = R + 8; lz = L * 0.25; lh = Math.PI; } break;
        default: break;
      }
      if (active) {
        const c = Math.cos(rec.heading);
        const s = Math.sin(rec.heading);
        tx = rec.x + lx * c + lz * s;
        tz = rec.z - lx * s + lz * c;
        th = rec.heading + lh;
        if (u.role === 'catering') lift *= Math.max(0, (meta.doorSill || 3.4) - 1.3);
      }
    }
    if (u.role === 'tug' && rec && rec.pushing) {
      // locked to the nose gear while pushing
      u.x = tx; u.z = tz; u.h = th; u.moving = true;
    } else {
      // avoid teleport-length drives (e.g. on the very first activation)
      if (Math.hypot(tx - u.x, tz - u.z) > 600) { u.x = tx; u.z = tz; u.h = th; }
      this._seek(u, dt, tx, tz, th, u.role === 'tug' ? 5 : 7);
    }
    if (u.type.name === 'catering') u.sub += (lift - u.sub) * Math.min(1, dt * 0.6);
  }

  /* --------------------------------------------------------- frame */
  update(dt, ctx = {}) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.time += dt;
    const night = ctx.night !== undefined ? ctx.night : ctx.lights !== undefined ? ctx.lights : 0;
    this.night = night;
    setLightClock(ctx.elapsed !== undefined ? ctx.elapsed : this.time, night);
    const groundAt = ctx.groundAt || this.groundAt;
    const showConstruction = !this.operational;
    const showGse = !!(this.gseVisible || this.gseActive);
    this._byStand.length = this.stands.length;
    for (let i = 0; i < this._byStand.length; i++) this._byStand[i] = null;
    for (const r of this.turnarounds) if (r && r.stand !== undefined && r.stand !== null) this._byStand[r.stand] = r;

    const mat = this.lights.material.uniforms.uMask.value;
    mat.x = night > 0.25 ? 1 : 0;
    mat.w = night > 0.25 ? 1 : 0;
    mat.y = 1;

    const L = this._lightPos;
    const local = this._lightLocal;
    for (const name in this.types) {
      const t = this.types[name];
      const visible = t.gse ? showGse : showConstruction;
      let count = 0;
      for (const u of t.units) {
        let show = visible;
        if (show) {
          if (t.gse) {
            if (!u.stage) show = false; else this._updateGse(u, dt);
          } else this._updateConstruction(u, dt);
        }
        u.visible = show;
        if (!show) {
          t.mesh.setMatrixAt(u.index, this._hidden);
          if (t.sub) t.sub.setMatrixAt(u.index, this._hidden);
          for (let k = 0; k < t.def.lights.length; k++) L[(u.lightBase + k) * 3 + 1] = -10000;
          continue;
        }
        count = u.index + 1;
        u.y = groundAt && u.moving !== false ? groundAt(u.x, u.z) || 0 : u.y || 0;
        this._q.setFromAxisAngle(this._axisY, u.h);
        this._p.set(u.x, u.y, u.z);
        this._m.compose(this._p, this._q, this._s);
        t.mesh.setMatrixAt(u.index, this._m);
        if (t.sub) {
          const pv = t.pivot;
          const ax = t.def.sub.axis;
          if (ax === 'x') this._m2.makeRotationX(-u.sub);
          else if (ax === 'y') this._m2.makeRotationY(u.sub);
          else if (ax === 'lift') this._m2.makeTranslation(0, u.sub, 0);
          else { this._m2.makeRotationZ(u.subSpin); this._m3.makeRotationX(t.def.sub.tilt || 0); this._m2.premultiply(this._m3); }
          if (ax === 'x' || ax === 'y') {
            this._m3.makeTranslation(-pv.x, -pv.y, -pv.z);
            this._m2.multiply(this._m3);
            this._m3.makeTranslation(pv.x, pv.y, pv.z);
            this._m2.premultiply(this._m3);
          } else if (ax === 'drum') {
            this._m3.makeTranslation(pv.x, pv.y, pv.z);
            this._m2.premultiply(this._m3);
          }
          this._m2.premultiply(this._m);
          t.sub.setMatrixAt(u.index, this._m2);
        }
        // lights follow the body (excavator lamps sit on the house; close enough)
        const n = t.def.lights.length;
        if (n) {
          const e = this._m.elements;
          for (let k = 0; k < n; k++) {
            const i3 = (u.lightBase + k) * 3;
            const lx = local[i3]; const ly = local[i3 + 1]; const lz = local[i3 + 2];
            const isAmber = t.def.lights[k].kind === LIGHT_KIND.AMBER;
            if (isAmber && !(u.moving || u.mode === 'dig' || u.mode === 'paver' || u.mode === 'roller' || (t.gse && u.role !== 'standby' && u.moving))) { L[i3 + 1] = -10000; continue; }
            L[i3] = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
            L[i3 + 1] = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
            L[i3 + 2] = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
          }
        }
      }
      t.mesh.count = count;
      t.mesh.visible = count > 0;
      t.mesh.instanceMatrix.needsUpdate = count > 0;
      if (t.sub) { t.sub.count = count; t.sub.visible = count > 0; t.sub.instanceMatrix.needsUpdate = count > 0; }
    }
    this._lightAttr.needsUpdate = true;
  }

  /** Diagnostics: visible vehicles per type and draw calls. */
  stats() {
    const out = { drawCalls: 1 };
    for (const name in this.types) {
      const t = this.types[name];
      const n = t.units.filter((u) => u.visible).length;
      if (n) { out[name] = n; out.drawCalls += t.sub ? 2 : 1; }
    }
    return out;
  }

  dispose() {
    for (const name in this.types) {
      const t = this.types[name];
      t.mesh.geometry.dispose();
      t.mesh.dispose();
      if (t.sub) { t.sub.geometry.dispose(); t.sub.dispose(); }
    }
    this.lights.geometry.dispose();
    this.lights.material.dispose();
    this.material.dispose();
    this.scene.remove(this.group);
  }
}
