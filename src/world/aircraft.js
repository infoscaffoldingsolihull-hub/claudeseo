import * as THREE from 'three';

/**
 * Procedural airliners (generic — no manufacturer, airline or livery is real).
 *
 *   createAircraft(type, livery) → THREE.Group
 *     type   'narrow'    ~ single-aisle twin, 37.6 m long, 35.8 m span
 *            'wide'      ~ long-haul twin of the class the 3,505 m runway is built for (73.9 m / 64.8 m)
 *            'turboprop' ~ 70-seat high-wing regional twin with six-blade propellers, T-tail
 *            'cargo'     ~ freighter derivative of the wide-body (no cabin windows, main-deck door)
 *     livery { name, primary, secondary, tail, stripe, ... } — see AIRLINE_LIVERIES (all fictional)
 *
 * Model frame: nose towards local +Z, origin on the ground under the
 * fuselage centre, +Y up. Everything that is painted (fuselage, fin) samples a
 * per-livery canvas atlas; everything else is vertex-coloured against a white
 * patch of the same atlas, so an airframe is ONE draw call (plus gear and one
 * point-sprite call for every navigation / beacon / strobe / landing light).
 *
 * The module also exports the small geometry kit and the light-sprite shader
 * that the vehicle, crowd and traffic modules share.
 */

/* =========================================================== geometry kit */

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Merge geometries (indexed or not) into one indexed BufferGeometry. Missing attributes are filled (color → 1, others → 0). */
export function mergeGeometries(list) {
  const names = new Map();
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!names.has(k)) names.set(k, g.attributes[k].itemSize);
  }
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  const arrays = {};
  for (const [k, size] of names) arrays[k] = new Float32Array(vCount * size);
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    for (const [k, size] of names) {
      const a = g.attributes[k];
      const dst = arrays[k];
      if (a) {
        for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) dst[(vo + i) * size + c] = a.getComponent(i, c);
      } else if (k === 'color') {
        dst.fill(1, vo * size, (vo + n) * size);
      }
    }
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) index[io + i] = src[i] + vo;
      io += src.length;
    } else {
      for (let i = 0; i < n; i++) index[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }
  for (const [k, size] of names) out.setAttribute(k, new THREE.BufferAttribute(arrays[k], size));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  for (const g of list) g.dispose();
  return out;
}

/** Fill a geometry's vertex colour (hex or THREE.Color, sRGB). */
export function paint(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Set every UV of a geometry to one atlas point (solid swatch). */
export function flatUV(geo, u = 0.97, v = 0.97) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = u; arr[i * 2 + 1] = v; }
  geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  return geo;
}

/** Transform a geometry in place: position, Euler rotation (XYZ), scale. */
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m4);
  return geo;
}

/** Box with its BASE centred at (x, y, z). */
export function box(w, h, d, x = 0, y = 0, z = 0, color = 0xffffff) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** Cylinder along an axis ('x' | 'y' | 'z') centred at (x, y, z). */
export function cyl(r, len, x, y, z, color = 0xffffff, axis = 'y', seg = 12, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Mirror a geometry across x = 0 (fixes winding). */
export function mirrorX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  }
  g.computeVertexNormals();
  return g;
}

/** Make sure a geometry has position/normal/uv/color so merges never fail. */
function complete(geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) flatUV(geo);
  if (!geo.attributes.color) paint(geo, 0xffffff);
  return geo;
}

/* ======================================================= light sprites */

/**
 * Shared uniforms for every light sprite (aircraft + vehicles):
 * time drives blinking, night scales brightness, scale converts metres to pixels.
 */
export const LIGHT_UNIFORMS = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uScale: { value: 900 },
};

/** Light kinds for the `aBlink.x` attribute. */
export const LIGHT_KIND = { NAV: 0, BEACON: 1, STROBE: 2, LANDING: 3, HEAD: 4, TAIL: 5, AMBER: 6 };

const LIGHT_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aSize;
  attribute vec4 aBlink;      // kind, phase, rate, day visibility
  uniform float uTime;
  uniform float uNight;
  uniform float uScale;
  uniform vec4 uMask;         // nav, beacon, strobe, landing enables
  uniform float uMinPx;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float k = aBlink.x;
    float on = 1.0;
    float mask = 1.0;
    float t = fract(uTime * aBlink.z + aBlink.y);
    if (k < 0.5) { mask = uMask.x; }
    else if (k < 1.5) { mask = uMask.y; on = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.10, 0.22, t)); }
    else if (k < 2.5) { mask = uMask.z; on = step(t, 0.035) + step(0.11, t) * step(t, 0.145); }
    else if (k < 3.5) { mask = uMask.w; }
    else if (k < 4.5) { mask = uMask.w; }
    else if (k < 5.5) { mask = uMask.x; }
    else { mask = uMask.y; on = 0.25 + 0.75 * pow(max(0.0, sin(t * 6.2831853)), 6.0); }
    float day = mix(aBlink.w, 1.0, uNight);
    vAlpha = on * mask * day;
    vColor = color * mix(1.4, 3.2, uNight);
    float px = aSize * uScale / max(0.5, -mvPosition.z);
    gl_PointSize = vAlpha > 0.003 ? clamp(max(uMinPx, px), 0.0, 96.0) : 0.0;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LIGHT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float halo = pow(1.0 - d, 2.2);
    float core = smoothstep(0.42, 0.0, d);
    float a = vAlpha;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float ff = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      a *= 1.0 - ff * 0.85;
    #endif
    gl_FragColor = vec4(vColor * (halo * 0.7 + core * 1.6), a * (halo + core));
  }
`;

/** A light-sprite material. Every instance shares the program and the time/night/scale uniforms. */
export function createLightMaterial({ mask = [1, 0, 0, 0], minPx = 1.6 } = {}) {
  const fog = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const mat = new THREE.ShaderMaterial({
    vertexShader: LIGHT_VERT,
    fragmentShader: LIGHT_FRAG,
    uniforms: {
      ...fog,
      uTime: LIGHT_UNIFORMS.uTime,
      uNight: LIGHT_UNIFORMS.uNight,
      uScale: LIGHT_UNIFORMS.uScale,
      uMask: { value: new THREE.Vector4(mask[0], mask[1], mask[2], mask[3]) },
      uMinPx: { value: minPx },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  mat.name = 'hdd:lightSprites';
  return mat;
}

const _drawSize = new THREE.Vector2();
/** onBeforeRender hook: keep the metres → pixels factor in step with the viewport. */
export function updateLightScale(renderer, scene, camera) {
  renderer.getDrawingBufferSize(_drawSize);
  const p = camera.projectionMatrix.elements[5];
  if (p) LIGHT_UNIFORMS.uScale.value = _drawSize.y * 0.5 * p;
}

/** Advance blink time and night factor for every light sprite (call once per frame). */
export function setLightClock(time, night) {
  LIGHT_UNIFORMS.uTime.value = time;
  LIGHT_UNIFORMS.uNight.value = night;
}

/** Build a light-sprite BufferGeometry from [{ x,y,z, color, size, kind, phase, rate, day }]. */
export function lightGeometry(lights, capacity = lights.length) {
  const n = capacity;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const blink = new Float32Array(n * 4);
  const c = new THREE.Color();
  lights.forEach((l, i) => {
    pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z;
    c.set(l.color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = l.size;
    blink[i * 4] = l.kind; blink[i * 4 + 1] = l.phase || 0; blink[i * 4 + 2] = l.rate || 1; blink[i * 4 + 3] = l.day === undefined ? 0.4 : l.day;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aBlink', new THREE.BufferAttribute(blink, 4));
  g.computeBoundingSphere();
  return g;
}

/* ============================================================ liveries */

/**
 * Fictional operators. Names draw on Sindh's landscape and crafts; colours,
 * emblems and titles are invented for the simulation and are not those of
 * any real airline.
 */
export const AIRLINE_LIVERIES = [
  { name: 'Ajrak Air', code: 'AJK', primary: '#f4f2ee', secondary: '#1f2a6b', tail: '#8e1a2e', stripe: '#1f2a6b', title: '#8e1a2e', belly: '#cdd0d6', engine: '#8e1a2e', style: 'sweep', emblem: 'star', fleet: ['Makli', 'Hala', 'Bhit Shah', 'Thatta'] },
  { name: 'Sindhu Skyways', code: 'SSW', primary: '#f5f6f8', secondary: '#c9a227', tail: '#23317a', stripe: '#c9a227', title: '#23317a', belly: '#23317a', engine: '#e9ebee', style: 'cheatline', emblem: 'river', fleet: ['Kotri', 'Sukkur', 'Jamshoro', 'Sehwan'] },
  { name: 'Kinjhar Airways', code: 'KJR', primary: '#f7f8f9', secondary: '#0e7c86', tail: '#0e7c86', stripe: '#6fd0c9', title: '#0b5f68', belly: '#d2d6da', engine: '#0e7c86', style: 'bold', emblem: 'wave', fleet: ['Haleji', 'Manchar', 'Keenjhar'] },
  { name: 'Kirthar Airlines', code: 'KRT', primary: '#f6f3ee', secondary: '#b5542b', tail: '#b5542b', stripe: '#e3a35a', title: '#7a3418', belly: '#cfc8bf', engine: '#ece8e2', style: 'sweep', emblem: 'mountain', fleet: ['Gorakh', 'Kutte-ji-Qabar'] },
  { name: 'Ranikot Express', code: 'RNK', primary: '#f5f6f4', secondary: '#2f6b3a', tail: '#2f6b3a', stripe: '#d7b23a', title: '#2f6b3a', belly: '#cfd3cc', engine: '#f1f2ef', style: 'cheatline', emblem: 'fort', fleet: ['Mirpur', 'Badin', 'Tando'] },
  { name: 'Thar Jet', code: 'THJ', primary: '#f3f1ec', secondary: '#272a30', tail: '#272a30', stripe: '#f08a1c', title: '#f08a1c', belly: '#272a30', engine: '#f08a1c', style: 'bold', emblem: 'sun', fleet: ['Mithi', 'Nagarparkar', 'Umerkot'] },
];

/** The fictional all-cargo operator. */
export const CARGO_LIVERY = { name: 'Hala Cargo', code: 'HCG', primary: '#eef0f2', secondary: '#16233f', tail: '#16233f', stripe: '#ffb000', title: '#16233f', belly: '#16233f', engine: '#e8eaed', style: 'bold', emblem: 'chevrons', cargo: true, fleet: ['Indus Trader'] };

AIRLINE_LIVERIES.push(CARGO_LIVERY);

function resolveLivery(livery) {
  if (!livery) return AIRLINE_LIVERIES[0];
  if (typeof livery === 'string') return AIRLINE_LIVERIES.find((l) => l.name === livery || l.code === livery) || AIRLINE_LIVERIES[0];
  return {
    secondary: livery.primary, tail: livery.secondary || '#23317a', stripe: livery.secondary || '#c9a227',
    belly: '#cdd0d6', engine: '#e9ebee', style: 'cheatline', emblem: 'star', fleet: [],
    ...livery,
    title: livery.title || livery.tail || livery.secondary || '#23317a',
  };
}

/* ============================================================ type specs */

/**
 * Dimensions are generic class figures. Positions are metres from the nose
 * (`d…`) and from the centreline; heights from the ground.
 */
const SPECS = {
  narrow: {
    length: 37.6, span: 35.8, height: 11.8, R: 1.98, k: 1.05, cy: 3.35,
    noseLen: 5.6, tailLen: 11.4, tailUp: 0.86,
    wing: { d: 13.2, root: 7.4, tip: 1.55, semi: 17.3, sweep: 25, dihedral: 5.5, yRel: -0.62, th: 0.14, thTip: 0.1, low: true, tipDevice: 'sharklet' },
    htail: { d: 30.2, root: 3.7, tip: 1.3, semi: 6.2, sweep: 31, dihedral: 6, yRel: 0.15 },
    fin: { d: 27.6, root: 6.0, tip: 2.0, sweep: 36 },
    engines: [{ x: 5.75, d: 10.6, len: 4.4, r: 1.04, y: 1.62 }], engineType: 'fan',
    nose: { d: 5.1, r: 0.36, wheels: 2 }, main: { d: 17.7, track: 7.6, r: 0.58, axles: 1 },
    windows: { phi: 0.24, from: 7.4, to: 31.6, pitch: 0.53, w: 0.24, h: 0.34, gaps: [[13.6, 14.7]] },
    doors: [{ d: 6.3, w: 0.82, h: 1.85 }, { d: 14.0, w: 0.5, h: 1.0, overwing: true }, { d: 14.6, w: 0.5, h: 1.0, overwing: true }, { d: 31.9, w: 0.82, h: 1.85 }],
    cockpit: 3.2, seats: 180,
    approachSpeed: 68, rotateSpeed: 76, accel: 2.15,
  },
  wide: {
    length: 73.9, span: 64.8, height: 18.5, R: 3.1, k: 1.0, cy: 5.15,
    noseLen: 8.4, tailLen: 19.5, tailUp: 0.84,
    wing: { d: 27.2, root: 13.6, tip: 2.6, semi: 32.4, sweep: 31.5, dihedral: 6, yRel: -0.6, th: 0.13, thTip: 0.09, low: true, tipDevice: 'raked' },
    htail: { d: 62.5, root: 7.4, tip: 2.4, semi: 10.8, sweep: 34, dihedral: 7, yRel: 0.1 },
    fin: { d: 57.5, root: 11.2, tip: 3.6, sweep: 41 },
    engines: [{ x: 9.6, d: 22.8, len: 7.4, r: 1.95, y: 2.95 }], engineType: 'fan',
    nose: { d: 6.4, r: 0.6, wheels: 2 }, main: { d: 37.6, track: 11.0, r: 0.62, axles: 3 },
    windows: { phi: 0.1, from: 10.5, to: 64.5, pitch: 0.53, w: 0.27, h: 0.42, gaps: [[19.5, 21.0], [33.0, 34.5], [46.0, 47.5], [55.6, 57.0]] },
    doors: [{ d: 9.4, w: 1.07, h: 1.9 }, { d: 20.2, w: 1.07, h: 1.9 }, { d: 33.7, w: 1.07, h: 1.9 }, { d: 46.8, w: 1.07, h: 1.9 }, { d: 56.3, w: 1.07, h: 1.9 }, { d: 65.8, w: 1.07, h: 1.9 }],
    cockpit: 5.0, seats: 360,
    approachSpeed: 75, rotateSpeed: 84, accel: 1.85,
  },
  cargo: null,  // derived below
  turboprop: {
    length: 27.2, span: 27.05, height: 7.65, R: 1.36, k: 1.0, cy: 2.2,
    noseLen: 3.6, tailLen: 8.0, tailUp: 0.95,
    wing: { d: 11.3, root: 2.6, tip: 1.45, semi: 13.5, sweep: 3.5, dihedral: 1.5, yRel: 0.98, th: 0.17, thTip: 0.14, low: false, tipDevice: 'none' },
    htail: { d: 24.0, root: 2.0, tip: 1.2, semi: 3.7, sweep: 18, dihedral: 0, yRel: 0, tTail: true },
    fin: { d: 20.6, root: 4.1, tip: 2.2, sweep: 34 },
    engines: [{ x: 4.05, d: 9.2, len: 5.6, r: 0.55, y: 3.2 }], engineType: 'prop',
    nose: { d: 3.0, r: 0.3, wheels: 2 }, main: { d: 13.8, track: 4.1, r: 0.44, axles: 2, sponson: true },
    windows: { phi: 0.16, from: 4.6, to: 22.0, pitch: 0.78, w: 0.24, h: 0.36, gaps: [] },
    doors: [{ d: 4.0, w: 0.72, h: 1.4 }, { d: 22.6, w: 0.72, h: 1.75 }],
    cockpit: 2.4, seats: 70,
    approachSpeed: 57, rotateSpeed: 58, accel: 2.5,
  },
};
SPECS.cargo = {
  ...SPECS.wide,
  length: 63.7, tailLen: 18.0,
  wing: { ...SPECS.wide.wing, d: 22.3 },
  htail: { ...SPECS.wide.htail, d: 52.4 },
  fin: { ...SPECS.wide.fin, d: 47.4 },
  engines: [{ ...SPECS.wide.engines[0], d: 17.9 }],
  main: { ...SPECS.wide.main, d: 32.4 },
  windows: { phi: 0.1, from: 10.5, to: 12.6, pitch: 0.53, w: 0.27, h: 0.42, gaps: [] },
  doors: [{ d: 9.4, w: 1.07, h: 1.9 }, { d: 50.5, w: 4.0, h: 3.0, cargo: true }],
  freighter: true, seats: 0,
};

/** Public type metadata (dims, seats, performance) for traffic logic. */
export const AIRCRAFT_TYPES = Object.fromEntries(Object.entries(SPECS).map(([k, s]) => [k, {
  length: s.length, span: s.span, height: s.height, seats: s.seats, approachSpeed: s.approachSpeed,
  rotateSpeed: s.rotateSpeed, accel: s.accel, mainGearZ: s.length / 2 - s.main.d, noseGearZ: s.length / 2 - s.nose.d,
}]));

/* =========================================================== atlas paint */

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const FUSE_H = 640;            // fuselage band height (px)
const FIN_Y0 = 648;            // fin band top
const FIN_W = 1024;
const FIN_H = 368;
const WHITE_U = 1800 / ATLAS_W;
const WHITE_V = 860 / ATLAS_H;

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return `#${c.getHexString()}`;
}

function paintAtlas(spec, livery) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d');
  const L = spec.length;
  const R = spec.R;
  const X = (d) => (1 - d / L) * ATLAS_W;                 // distance from nose → px
  const PX = ATLAS_W / L;                                   // px per metre along
  const PY = FUSE_H / (2 * Math.PI);                       // px per radian around
  const Yp = (phi) => phi * PY;                            // port side (phi from belly)

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, ATLAS_W, ATLAS_H);

  /** Draw a closed shape (in d, phi coordinates) on both sides, mirrored about the crown. */
  const sym = (fill, pts) => {
    for (const side of [0, 1]) {
      g.beginPath();
      pts.forEach(([d, phi], i) => {
        const x = X(d);
        const y = side === 0 ? Yp(phi) : FUSE_H - Yp(phi);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    }
  };
  const symRect = (fill, d0, d1, phi0, phi1) => sym(fill, [[d0, phi0], [d1, phi0], [d1, phi1], [d0, phi1]]);

  // ---------- base & belly
  g.fillStyle = livery.primary;
  g.fillRect(0, 0, ATLAS_W, FUSE_H);
  const winPhi = Math.PI / 2 + spec.windows.phi;
  const PI = Math.PI;
  symRect(livery.belly, -1, L + 1, 0, 0.95);

  // ---------- livery style
  const tailStart = L - spec.tailLen;
  if (livery.style === 'cheatline') {
    symRect(livery.stripe, 1.5, L + 1, winPhi - 0.2, winPhi - 0.13);
    symRect(livery.secondary === livery.primary ? livery.tail : livery.tail, 1.5, L + 1, winPhi - 0.32, winPhi - 0.22);
    // tail colour wraps up the rear fuselage under the fin
    sym(livery.tail, [[tailStart + spec.tailLen * 0.25, PI + 0.01], [L + 1, PI + 0.01], [L + 1, winPhi - 0.32], [tailStart + spec.tailLen * 0.62, winPhi - 0.32], [tailStart + spec.tailLen * 0.3, PI - 0.5]]);
  } else if (livery.style === 'sweep') {
    // a broad sweep rises from the belly behind the wing to the crown at the fin
    const s0 = L * 0.42;
    const pts = [[s0, 0.6]];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([s0 + (L - s0) * t, 0.6 + (PI - 0.6 + 0.01) * Math.pow(t, 1.6)]);
    }
    pts.push([L + 1, PI + 0.01], [L + 1, 0], [s0, 0]);
    sym(livery.tail, pts);
    const ac = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      ac.push([s0 - 2 + (L - s0 + 2) * t, 0.6 + (PI - 0.6) * Math.pow(t, 1.6) + 0.1]);
    }
    for (let i = 12; i >= 0; i--) {
      const t = i / 12;
      ac.push([s0 - 2 + (L - s0 + 2) * t, 0.6 + (PI - 0.6) * Math.pow(t, 1.6) + 0.19]);
    }
    sym(livery.stripe, ac);
    symRect(livery.secondary, 0, L * 0.42, 0.62, 0.7);
  } else {
    // 'bold': lower fuselage in the secondary colour, a bright line above it, coloured tail cone
    symRect(livery.secondary, -1, L + 1, 0, winPhi - 0.36);
    symRect(livery.stripe, 1.0, L + 1, winPhi - 0.33, winPhi - 0.25);
    sym(livery.tail, [[tailStart + spec.tailLen * 0.35, PI + 0.01], [L + 1, PI + 0.01], [L + 1, 0], [tailStart + spec.tailLen * 0.1, 0]]);
  }

  // ---------- nose cone (radome) slightly greyer, cockpit windscreen
  symRect(shade(livery.primary, -0.03), -1, 0.35, 0, PI + 0.01);
  const ck = spec.cockpit;
  const ckPhi = PI - 0.04;
  const wsDark = '#11161f';
  // front panes
  sym(wsDark, [[ck * 0.62, ckPhi], [ck * 0.86, ckPhi], [ck * 0.86, ckPhi - 0.52], [ck * 0.62, ckPhi - 0.62]]);
  // side panes
  sym(wsDark, [[ck * 0.88, ckPhi - 0.5], [ck * 1.06, ckPhi - 0.47], [ck * 1.06, ckPhi - 0.8], [ck * 0.88, ckPhi - 0.86]]);
  sym(wsDark, [[ck * 1.08, ckPhi - 0.49], [ck * 1.22, ckPhi - 0.52], [ck * 1.22, ckPhi - 0.76], [ck * 1.08, ckPhi - 0.8]]);
  // window frame lines
  g.strokeStyle = 'rgba(160,170,180,0.6)';

  // ---------- doors
  for (const door of spec.doors) {
    const w = door.w * PX;
    const hRad = door.h / R;
    const bottom = winPhi - hRad * 0.62;
    for (const side of [0, 1]) {
      if (door.cargo && side === 1) continue;
      const x = X(door.d) - w / 2;
      const y0 = side === 0 ? Yp(bottom) : FUSE_H - Yp(bottom + hRad);
      const h = hRad * PY;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(40,46,56,0.55)';
      if (door.overwing) { g.strokeRect(x, side === 0 ? Yp(winPhi - 0.18) : FUSE_H - Yp(winPhi + 0.18), w, 0.36 * PY); continue; }
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y0, w, h, Math.min(w, h) * 0.18); else g.rect(x, y0, w, h);
      g.stroke();
      if (!door.cargo) {
        g.fillStyle = '#1a2230';
        const wy = side === 0 ? Yp(winPhi - spec.windows.h / R / 2) : FUSE_H - Yp(winPhi + spec.windows.h / R / 2);
        g.fillRect(X(door.d) - spec.windows.w * PX * 0.45, wy, spec.windows.w * PX * 0.9, (spec.windows.h / R) * PY * 0.9);
      }
    }
  }

  // ---------- cabin windows
  const wi = spec.windows;
  const ww = wi.w * PX;
  const wh = (wi.h / R) * PY;
  for (let d = wi.from; d <= wi.to; d += wi.pitch) {
    if (wi.gaps.some(([a, b]) => d > a && d < b)) continue;
    if (spec.doors.some((dr) => !dr.overwing && Math.abs(dr.d - d) < dr.w * 0.5 + 0.35)) continue;
    for (const side of [0, 1]) {
      const yc = side === 0 ? Yp(winPhi) : FUSE_H - Yp(winPhi);
      g.fillStyle = '#1b2533';
      g.beginPath();
      if (g.roundRect) g.roundRect(X(d) - ww / 2, yc - wh / 2, ww, wh, Math.min(ww, wh) * 0.45); else g.rect(X(d) - ww / 2, yc - wh / 2, ww, wh);
      g.fill();
      g.fillStyle = 'rgba(150,180,210,0.35)';
      g.fillRect(X(d) - ww * 0.3, yc - wh * 0.36, ww * 0.25, wh * 0.4);
    }
  }

  // ---------- titles (port side is rotated 180° in texture space; starboard is upright)
  const titlePhi = winPhi + 0.42 + (spec.R > 2.5 ? 0.12 : 0);
  const titleH = Math.min(1.5, spec.R * 0.5) / R * PY * 0.95;
  const text = livery.name.toUpperCase();
  const fontPx = Math.max(18, Math.round(titleH));
  g.font = `bold ${fontPx}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  const titleD = livery.cargo ? L * 0.3 : L * (spec.engineType === 'prop' ? 0.36 : 0.3);
  const maxW = L * 0.38 * PX;
  const measured = g.measureText(text).width;
  const aspect = (PX * R) / PY;           // canvas x-px per y-px for an undistorted glyph
  const sx = aspect * Math.min(1, maxW / (measured * aspect));
  for (const side of [0, 1]) {
    g.save();
    const x = X(titleD);
    if (side === 0) {
      g.translate(x, Yp(titlePhi));
      g.rotate(Math.PI);
    } else {
      g.translate(x, FUSE_H - Yp(titlePhi));
    }
    g.scale(sx, 1);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = livery.title;
    g.fillText(text, 0, 0);
    g.restore();
    // fleet name near the nose
    const fleetName = (livery.fleet && livery.fleet.length) ? livery.fleet[(spec.length * 7) % livery.fleet.length | 0] : '';
    if (fleetName) {
      g.save();
      g.font = `italic ${Math.round(fontPx * 0.32)}px Georgia, "Times New Roman", serif`;
      const fx = X(spec.cockpit * 1.9 + 0.8);
      const phi = winPhi + 0.18;
      if (side === 0) { g.translate(fx, Yp(phi)); g.rotate(Math.PI); } else g.translate(fx, FUSE_H - Yp(phi));
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = shade(livery.title, -0.05);
      g.fillText(fleetName, 0, 0);
      g.restore();
    }
  }
  if (livery.cargo) {
    for (const side of [0, 1]) {
      g.save();
      g.font = `bold ${Math.round(fontPx * 0.45)}px Arial, sans-serif`;
      const x = X(L * 0.56);
      const phi = winPhi + 0.3;
      if (side === 0) { g.translate(x, Yp(phi)); g.rotate(Math.PI); } else g.translate(x, FUSE_H - Yp(phi));
      g.textAlign = 'center';
      g.fillStyle = livery.stripe;
      g.fillText('FREIGHTER', 0, 0);
      g.restore();
    }
  }

  // ---------- tail fin band (same mapping on both faces)
  paintFin(g, spec, livery);

  // ---------- white swatch for vertex-coloured parts
  g.fillStyle = '#ffffff';
  g.fillRect(1600, 700, 448, 324);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Fin geometry in fin-band coordinates. */
function finFrame(spec) {
  const f = spec.fin;
  const L = spec.length;
  const zRootLE = L / 2 - f.d;
  const rootY = spec.cy + spec.R * spec.k * 0.82;
  const span = spec.height - rootY;
  const zTipLE = zRootLE - Math.tan((f.sweep * Math.PI) / 180) * span;
  const zMin = Math.min(zRootLE - f.root, zTipLE - f.tip) - 0.5;
  const zMax = zRootLE + 0.5;
  return { zRootLE, zTipLE, rootY, span, zMin, zMax, yMin: rootY - 0.5, yMax: spec.height + 0.3 };
}

function paintFin(g, spec, livery) {
  const fr = finFrame(spec);
  const U = (z) => ((z - fr.zMin) / (fr.zMax - fr.zMin)) * FIN_W;
  const V = (y) => FIN_Y0 + (1 - (y - fr.yMin) / (fr.yMax - fr.yMin)) * FIN_H;
  g.fillStyle = livery.tail;
  g.fillRect(0, FIN_Y0 - 4, FIN_W + 8, FIN_H + 8);
  // fin outline points (LE root, LE tip, TE tip, TE root)
  const f = spec.fin;
  const p = [[fr.zRootLE, fr.rootY], [fr.zTipLE, spec.height], [fr.zTipLE - f.tip, spec.height], [fr.zRootLE - f.root, fr.rootY]];
  // leading-edge accent
  g.save();
  g.beginPath();
  g.moveTo(U(p[0][0]), V(p[0][1]));
  g.lineTo(U(p[1][0]), V(p[1][1]));
  g.lineTo(U(p[1][0] - f.tip * 0.16), V(p[1][1]));
  g.lineTo(U(p[0][0] - f.root * 0.12), V(p[0][1]));
  g.closePath();
  g.fillStyle = livery.stripe;
  g.fill();
  g.restore();
  // emblem centred on the fin area
  const h = 0.48;
  const cz = ((p[0][0] + p[3][0]) * (1 - h) + (p[1][0] + p[2][0]) * h) / 2 - f.root * 0.05;
  const cyy = fr.rootY + (spec.height - fr.rootY) * h;
  const cx = U(cz);
  const cyPx = V(cyy);
  const rad = Math.min((U(cz + f.root * 0.3) - U(cz)), (V(cyy) - V(cyy + (spec.height - fr.rootY) * 0.26)));
  drawEmblem(g, livery, cx, cyPx, rad);
}

function drawEmblem(g, livery, cx, cy, r) {
  const a = livery.primary;
  const b = livery.stripe;
  g.save();
  g.translate(cx, cy);
  switch (livery.emblem) {
    case 'star': {
      // Ajrak-style eight-point star inside a ring of dots
      for (let layer = 0; layer < 2; layer++) {
        const R0 = layer === 0 ? r : r * 0.55;
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const ang = (i * Math.PI) / 8;
          const rr = i % 2 === 0 ? R0 : R0 * 0.62;
          g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        g.closePath();
        g.fillStyle = layer === 0 ? a : b;
        g.fill();
      }
      g.fillStyle = a;
      g.beginPath(); g.arc(0, 0, r * 0.16, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 16; i++) {
        const ang = (i * Math.PI) / 8 + Math.PI / 16;
        g.beginPath(); g.arc(Math.cos(ang) * r * 1.18, Math.sin(ang) * r * 1.18, r * 0.06, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'river': {
      g.lineWidth = r * 0.22;
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = k === 1 ? b : a;
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const y = -r * 1.1 + t * r * 2.2;
          const x = Math.sin(t * Math.PI * 2.2 + k * 0.5) * r * 0.45 + (k - 1) * r * 0.42;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    }
    case 'wave': {
      g.fillStyle = a;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = livery.tail;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const y0 = -r * 0.25 + k * r * 0.42;
        g.moveTo(-r, y0);
        for (let i = 0; i <= 20; i++) { const t = i / 20; g.lineTo(-r + t * 2 * r, y0 + Math.sin(t * Math.PI * 3) * r * 0.1); }
        g.lineTo(r, y0 + r * 0.16); g.lineTo(-r, y0 + r * 0.16); g.closePath();
        g.fill();
      }
      g.fillStyle = b;
      g.beginPath(); g.arc(r * 0.3, -r * 0.5, r * 0.18, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'mountain': {
      g.fillStyle = a;
      g.beginPath();
      g.moveTo(-r * 1.2, r * 0.7); g.lineTo(-r * 0.45, -r * 0.55); g.lineTo(-r * 0.1, -r * 0.05); g.lineTo(r * 0.35, -r * 0.95); g.lineTo(r * 1.2, r * 0.7);
      g.closePath(); g.fill();
      g.fillStyle = b;
      g.beginPath(); g.moveTo(r * 0.35, -r * 0.95); g.lineTo(r * 0.62, -r * 0.5); g.lineTo(r * 0.35, -r * 0.6); g.lineTo(r * 0.12, -r * 0.48); g.closePath(); g.fill();
      g.beginPath(); g.arc(-r * 0.75, -r * 0.75, r * 0.2, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'fort': {
      g.fillStyle = a;
      const w = r * 2;
      g.fillRect(-w / 2, -r * 0.1, w, r * 0.8);
      for (let i = 0; i < 5; i++) g.fillRect(-w / 2 + i * (w / 4.5), -r * 0.4, w / 9, r * 0.32);
      g.fillStyle = livery.tail;
      g.beginPath(); g.arc(0, r * 0.7, r * 0.3, Math.PI, 0); g.fill();
      g.fillStyle = b;
      g.fillRect(-w / 2, r * 0.82, w, r * 0.14);
      break;
    }
    case 'sun': {
      g.fillStyle = b;
      for (let i = 0; i < 12; i++) {
        const ang = Math.PI + (i / 11) * Math.PI;
        g.save(); g.rotate(ang);
        g.fillRect(r * 0.62, -r * 0.06, r * 0.55, r * 0.12);
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, r * 0.52, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = a;
      g.fillRect(-r * 1.2, r * 0.08, r * 2.4, r * 0.1);
      g.fillRect(-r * 0.9, r * 0.3, r * 1.8, r * 0.08);
      break;
    }
    case 'chevrons':
    default: {
      g.fillStyle = b;
      for (let k = 0; k < 3; k++) {
        const y = -r * 0.8 + k * r * 0.62;
        g.beginPath();
        g.moveTo(-r, y); g.lineTo(0, y + r * 0.45); g.lineTo(r, y); g.lineTo(r, y + r * 0.28); g.lineTo(0, y + r * 0.73); g.lineTo(-r, y + r * 0.28);
        g.closePath(); g.fill();
      }
      break;
    }
  }
  g.restore();
}

/* ======================================================= airframe parts */

/** Fuselage: a lofted surface of revolution with nose droop and tail upsweep, UV-mapped to the livery band. */
function fuselageGeometry(spec) {
  const L = spec.length;
  const R = spec.R;
  const k = spec.k;
  const seg = 44;
  const stations = [];
  const nose = spec.noseLen;
  const tailStart = L - spec.tailLen;
  for (let i = 0; i <= 18; i++) stations.push(nose * (1 - Math.cos((i / 18) * Math.PI / 2)) ** 1.0);
  const barrelStep = Math.max(1.2, L / 34);
  for (let d = nose + barrelStep; d < tailStart; d += barrelStep) stations.push(d);
  for (let i = 0; i <= 16; i++) stations.push(tailStart + (spec.tailLen * i) / 16);
  stations.push(L + 0.25);
  const profile = (d) => {
    if (d <= nose) {
      const q = Math.max(0, d / nose);
      const r = R * Math.pow(1 - Math.pow(1 - q, 2.3), 0.5);
      return { r, y: -R * k * 0.16 * Math.pow(1 - q, 2) };
    }
    if (d < tailStart) return { r: R, y: 0 };
    if (d > L) return { r: 0, y: (R - R * 0.12) * k * spec.tailUp };
    const q = (d - tailStart) / spec.tailLen;
    const r = R * (1 - 0.86 * Math.pow(q, 1.45));
    return { r, y: (R - r) * k * spec.tailUp };
  };
  const rings = stations.length;
  const pos = new Float32Array(rings * (seg + 1) * 3);
  const uv = new Float32Array(rings * (seg + 1) * 2);
  let p = 0;
  let t = 0;
  for (let i = 0; i < rings; i++) {
    const d = stations[i];
    const { r, y } = profile(d);
    const z = L / 2 - d;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      pos[p++] = r * Math.sin(th);
      pos[p++] = spec.cy + y - r * k * Math.cos(th);
      pos[p++] = z;
      uv[t++] = Math.min(0.999, Math.max(0.001, 1 - d / L));
      uv[t++] = ((j / seg) * FUSE_H) / ATLAS_H;
    }
  }
  const idx = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  orient(geo, (n, ctr) => ctr.y > spec.cy + R * 0.5 ? n.y : 0);
  geo.computeVertexNormals();
  return paint(geo, 0xffffff);
}

/**
 * Ensure outward-facing winding. `test(normal, centroid)` should return a
 * positive number for a correctly-oriented triangle; the sum decides.
 */
function orient(geo, test) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ctr = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    score += test(n, ctr);
  }
  if (score < 0) {
    for (let i = 0; i < idx.length; i += 3) { const s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
  }
}

/**
 * A lifting surface along +X (port): tapered, swept, with dihedral and a
 * NACA-like section. Returns an indexed geometry with normals.
 */
function liftingSurface({ root, tip, span, sweep, dihedral = 0, th = 0.12, thTip = 0.1, x0 = 0, y0 = 0, zLE = 0, sections = 6, n = 9, color = 0xffffff, camber = 0.25, rootCap = false }) {
  const tanS = Math.tan((sweep * Math.PI) / 180);
  const tanD = Math.tan((dihedral * Math.PI) / 180);
  const ring = [];
  for (let i = n; i >= 0; i--) ring.push([(1 - Math.cos((i / n) * Math.PI)) / 2, 1]);
  for (let i = 1; i <= n; i++) ring.push([(1 - Math.cos((i / n) * Math.PI)) / 2, -1]);
  const half = (a) => 5 * (0.2969 * Math.sqrt(a) - 0.126 * a - 0.3516 * a * a + 0.2843 * a * a * a - 0.1036 * a * a * a * a);
  const pos = [];
  for (let s = 0; s <= sections; s++) {
    const f = s / sections;
    const x = x0 + span * f;
    const c = root + (tip - root) * f;
    const tk = th + (thTip - th) * f;
    const le = zLE - tanS * span * f;
    const yb = y0 + tanD * span * f;
    for (const [a, side] of ring) {
      const ht = half(a) * tk * c;
      const camberY = camber * ht * (1 - a) * 0.6;
      pos.push(x, yb + (side > 0 ? ht * 0.95 : -ht * 0.62) + camberY, le - a * c);
    }
  }
  const per = ring.length;
  const idx = [];
  for (let s = 0; s < sections; s++) {
    for (let j = 0; j < per - 1; j++) {
      const a = s * per + j;
      const b = a + per;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // tip cap (and optional root cap)
  const capAt = (s, flip) => {
    const base = s * per;
    const cIdx = pos.length / 3;
    let cx = 0; let cy = 0; let cz = 0;
    for (let j = 0; j < per; j++) { cx += pos[(base + j) * 3]; cy += pos[(base + j) * 3 + 1]; cz += pos[(base + j) * 3 + 2]; }
    pos.push(cx / per, cy / per, cz / per);
    for (let j = 0; j < per - 1; j++) {
      if (flip) idx.push(cIdx, base + j + 1, base + j); else idx.push(cIdx, base + j, base + j + 1);
    }
  };
  capAt(sections, false);
  if (rootCap) capAt(0, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // upper-surface triangles must face +Y (in the local, pre-rotation frame)
  orient(geo, (nn, ctr) => {
    const f = (ctr.x - x0) / span;
    const yb = y0 + tanD * span * f;
    return Math.abs(nn.y) > 0.6 ? Math.sign(nn.y) * Math.sign(ctr.y - yb) : 0;
  });
  geo.computeVertexNormals();
  flatUV(geo, WHITE_U, WHITE_V);
  return paint(geo, color);
}

/** Turbofan nacelle: lathe with intake lip, fan face + spinner, exhaust nozzle and plug. Axis along +Z, centred at origin front. */
function turbofan(len, r, cowl) {
  const parts = [];
  const pts = [
    [r * 0.42, -len * 0.08], [r * 0.6, 0.0], [r * 0.78, len * 0.12], [r * 0.9, len * 0.45], [r * 0.99, len * 0.78],
    [r * 1.0, len * 0.9], [r * 0.96, len * 0.985], [r * 0.88, len * 1.0], [r * 0.82, len * 0.99], [r * 0.8, len * 0.9],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const shell = new THREE.LatheGeometry(pts, 28);
  shell.rotateX(Math.PI / 2);
  // shell faces outward: colour by position along the nacelle (lip = bright metal)
  const sp = shell.attributes.position;
  const col = new Float32Array(sp.count * 3);
  const cCowl = new THREE.Color(cowl);
  const cLip = new THREE.Color(0xc9ced4);
  const cCore = new THREE.Color(0x6c7178);
  const cInner = new THREE.Color(0x30343a);
  for (let i = 0; i < sp.count; i++) {
    const z = sp.getZ(i);
    const rr = Math.hypot(sp.getX(i), sp.getY(i));
    let c = cCowl;
    if (z > len * 0.975) c = cLip;
    else if (z < len * 0.02) c = cCore;
    if (z > len * 0.89 && rr < r * 0.86) c = cInner;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  shell.deleteAttribute('uv');
  parts.push(shell);
  const fan = new THREE.CircleGeometry(r * 0.8, 28);
  fan.translate(0, 0, len * 0.9);
  parts.push(paint(fan, 0x24272c));
  // fan blades suggested by a ring of thin dark-grey blades
  for (let i = 0; i < 18; i++) {
    const b = new THREE.BoxGeometry(r * 0.06, r * 0.62, 0.04);
    b.translate(0, r * 0.45, 0);
    b.rotateZ((i / 18) * Math.PI * 2 + 0.2);
    b.translate(0, 0, len * 0.905);
    parts.push(paint(b, 0x3b4048));
  }
  const spinner = new THREE.ConeGeometry(r * 0.22, r * 0.5, 16);
  spinner.rotateX(Math.PI / 2);
  spinner.translate(0, 0, len * 0.9 + r * 0.25);
  parts.push(paint(spinner, 0xb9bec5));
  const plug = new THREE.ConeGeometry(r * 0.32, len * 0.22, 16);
  plug.rotateX(-Math.PI / 2);
  plug.translate(0, 0, -len * 0.08 - len * 0.1);
  parts.push(paint(plug, 0x55595f));
  parts.forEach((g) => { complete(g); flatUV(g, WHITE_U, WHITE_V); });
  return parts;
}

/** Turboprop nacelle (box-ish lathe) — the propeller is a separate spinning mesh. */
function propNacelle(len, r, cowl) {
  const pts = [[0.01, 0], [r * 0.55, len * 0.03], [r * 0.8, len * 0.2], [r * 0.95, len * 0.45], [r * 0.95, len * 0.78], [r * 0.82, len * 0.92], [r * 0.45, len * 0.99], [0.01, len * 1.0]]
    .map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(pts, 20);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1.35, 1);
  g.deleteAttribute('uv');
  const out = [paint(g, cowl)];
  const ex = cyl(r * 0.28, r * 1.2, r * 0.9, -r * 0.1, len * 0.55, 0x4a4e55, 'z', 8);
  ex.rotateY(0);
  out.push(ex);
  out.forEach((p) => { complete(p); flatUV(p, WHITE_U, WHITE_V); });
  return out;
}

function propellerGeometry(radius) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.BoxGeometry(0.2, radius, 0.05);
    b.translate(0, radius / 2 + 0.15, 0);
    // taper the blade tip
    const p = b.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > radius * 0.6) p.setX(k, p.getX(k) * 0.6);
    b.rotateY(0.35);
    b.rotateZ((i / 6) * Math.PI * 2);
    paint(b, 0x25282d);
    parts.push(b);
    const tipMark = new THREE.BoxGeometry(0.13, 0.12, 0.06);
    tipMark.translate(0, radius + 0.08, 0);
    tipMark.rotateY(0.35);
    tipMark.rotateZ((i / 6) * Math.PI * 2);
    parts.push(paint(tipMark, 0xd8c23a));
  }
  const sp = new THREE.ConeGeometry(0.38, 0.9, 16);
  sp.rotateX(Math.PI / 2);
  parts.push(paint(sp, 0xe9eaec));
  parts.forEach((g) => { complete(g); flatUV(g, WHITE_U, WHITE_V); });
  return mergeGeometries(parts);
}

/** Landing gear: struts + tyres + hubs, in one vertex-coloured geometry. */
function gearGeometry(spec) {
  const L = spec.length;
  const parts = [];
  const steel = 0xb8bcc2;
  const tyre = 0x1c1d20;
  const hub = 0x8d939a;
  const bottomY = spec.cy - spec.R * spec.k;
  const wheel = (x, y, z, r, w) => {
    parts.push(cyl(r, w, x, y, z, tyre, 'x', 18));
    parts.push(cyl(r * 0.55, w + 0.02, x, y, z, hub, 'x', 12));
  };
  // nose gear
  const nz = L / 2 - spec.nose.d;
  const nr = spec.nose.r;
  parts.push(cyl(0.09 * Math.max(1, spec.R / 2), bottomY - nr + 0.3, 0, (bottomY + nr) / 2 + 0.1, nz, steel, 'y', 8));
  parts.push(box(0.5, 0.12, 0.14, 0, nr - 0.06, nz, steel));
  wheel(-nr * 0.75, nr, nz, nr, nr * 0.55);
  wheel(nr * 0.75, nr, nz, nr, nr * 0.55);
  // nose gear doors
  parts.push(box(0.04, 0.9, 1.6, -0.45, bottomY - 0.85, nz + 0.5, 0xd9dcdf));
  parts.push(box(0.04, 0.9, 1.6, 0.45, bottomY - 0.85, nz + 0.5, 0xd9dcdf));
  // main gear
  const mz = L / 2 - spec.main.d;
  const mr = spec.main.r;
  const tw = spec.main.track / 2;
  const topY = spec.main.sponson ? bottomY + 0.6 : spec.cy - spec.R * spec.k * 0.55;
  for (const side of [-1, 1]) {
    const x = side * tw;
    if (spec.main.axles === 3) {
      parts.push(cyl(0.2, topY - mr - 0.3, x, (topY + mr + 0.3) / 2, mz, steel, 'y', 10));
      parts.push(box(0.26, 0.26, 4.0, x, mr - 0.13, mz, steel));
      for (const dz of [-1.47, 0, 1.47]) { wheel(x - 0.5, mr, mz + dz, mr, 0.42); wheel(x + 0.5, mr, mz + dz, mr, 0.42); }
      parts.push(box(0.6, 0.06, 2.2, x - side * 0.5, topY - 0.8, mz + 0.2, 0xd9dcdf));
    } else if (spec.main.axles === 2) {
      // turboprop: tandem wheels under a fuselage sponson
      parts.push(cyl(0.12, topY - mr, x, (topY + mr) / 2, mz, steel, 'y', 8));
      wheel(x, mr, mz + 0.55, mr, 0.32);
      wheel(x, mr, mz - 0.55, mr, 0.32);
    } else {
      parts.push(cyl(0.14, topY - mr, x, (topY + mr) / 2, mz, steel, 'y', 10));
      wheel(x - 0.36, mr, mz, mr, 0.38);
      wheel(x + 0.36, mr, mz, mr, 0.38);
    }
  }
  parts.forEach((g) => { complete(g); flatUV(g, WHITE_U, WHITE_V); });
  return mergeGeometries(parts);
}

function airframeGeometry(spec, livery) {
  const parts = [];
  const L = spec.length;
  const R = spec.R;
  const k = spec.k;
  const wingGrey = 0xc9cdd3;
  const wingDark = 0xaab0b8;

  parts.push(fuselageGeometry(spec));

  // ---- main wing (port, then mirrored)
  const w = spec.wing;
  const wingY = spec.cy + R * k * w.yRel;
  const wingZ = L / 2 - w.d;
  const wingParts = [];
  const port = liftingSurface({ root: w.root, tip: w.tip, span: w.semi, sweep: w.sweep, dihedral: w.dihedral, th: w.th, thTip: w.thTip, y0: wingY, zLE: wingZ, sections: 8, color: wingGrey, camber: 0.4 });
  wingParts.push(port);
  const tipX = w.semi;
  const tipY = wingY + Math.tan((w.dihedral * Math.PI) / 180) * w.semi;
  const tipZ = wingZ - Math.tan((w.sweep * Math.PI) / 180) * w.semi;
  if (w.tipDevice === 'sharklet') {
    const wl = liftingSurface({ root: w.tip * 0.95, tip: w.tip * 0.35, span: 2.4, sweep: 38, th: 0.1, thTip: 0.08, zLE: 0, sections: 3, color: wingGrey, camber: 0 });
    wl.rotateZ(Math.PI / 2 - 0.22);
    wl.translate(tipX - 0.05, tipY, tipZ);
    wingParts.push(wl);
  } else if (w.tipDevice === 'raked') {
    const rk = liftingSurface({ root: w.tip, tip: w.tip * 0.35, span: 2.6, sweep: 55, dihedral: w.dihedral + 2, th: 0.09, thTip: 0.07, zLE: 0, sections: 2, color: wingGrey, camber: 0 });
    rk.translate(tipX - 0.05, tipY, tipZ);
    wingParts.push(rk);
  }
  // flap-track fairings (jets) — the canoes under the trailing edge
  if (w.low) {
    for (const f of [0.28, 0.5, 0.7]) {
      const x = w.semi * f;
      const c = w.root + (w.tip - w.root) * f;
      const le = wingZ - Math.tan((w.sweep * Math.PI) / 180) * x;
      const fy = wingY + Math.tan((w.dihedral * Math.PI) / 180) * x;
      const canoe = new THREE.SphereGeometry(1, 10, 6);
      canoe.scale(0.16 * R / 2, 0.22 * R / 2, c * 0.42);
      canoe.translate(x, fy - 0.12, le - c * 0.78);
      wingParts.push(paint(canoe, wingDark));
    }
  }
  // engines
  const enginesOut = [];
  for (const e of spec.engines) {
    const ez = L / 2 - e.d;
    if (spec.engineType === 'fan') {
      const nac = turbofan(e.len, e.r, livery.engine || '#e9ebee');
      nac.forEach((g) => { g.translate(e.x, e.y, ez - e.len); wingParts.push(g); });
      // pylon from nacelle top to the wing lower surface
      const leAtX = wingZ - Math.tan((w.sweep * Math.PI) / 180) * e.x;
      const wyAtX = wingY + Math.tan((w.dihedral * Math.PI) / 180) * e.x;
      const pyH = Math.max(0.4, wyAtX - (e.y + e.r * 0.85));
      const pyLen = Math.max(e.len * 0.75, ez - (leAtX - (w.root * 0.5)));
      const py = box(e.r * 0.28, pyH + 0.25, pyLen, e.x, e.y + e.r * 0.82, ez - pyLen / 2 - e.len * 0.05, 0xdfe2e5);
      wingParts.push(py);
      enginesOut.push({ x: e.x, y: e.y, z: ez - e.len * 0.5, radius: e.r, exhaustZ: ez - e.len * 1.1 });
    } else {
      const nac = propNacelle(e.len, e.r, livery.engine || '#eef0f1');
      nac.forEach((g) => { g.translate(e.x, e.y, ez - e.len); wingParts.push(g); });
      enginesOut.push({ x: e.x, y: e.y, z: ez, radius: 1.96, exhaustZ: ez - e.len });
    }
  }
  const wingMerged = mergeGeometries(wingParts.map(complete));
  parts.push(wingMerged, mirrorX(wingMerged));
  const engines = [];
  for (const e of enginesOut) { engines.push(e, { ...e, x: -e.x }); }

  // ---- wing-body fairing (jets) or wing root fairing on top (turboprop)
  const fair = new THREE.SphereGeometry(1, 20, 12);
  if (w.low) {
    fair.scale(R * 0.98, R * 0.42, w.root * 0.95);
    fair.translate(0, spec.cy - R * k * 0.62, wingZ - w.root * 0.45);
    parts.push(paint(fair, new THREE.Color(livery.belly)));
  } else {
    fair.scale(R * 0.62, R * 0.3, w.root * 1.4);
    fair.translate(0, spec.cy + R * k * 0.9, wingZ - w.root * 0.5);
    parts.push(paint(fair, new THREE.Color(livery.primary)));
  }
  flatUV(parts[parts.length - 1], WHITE_U, WHITE_V);

  // ---- main-gear sponsons (high-wing turboprop)
  if (spec.main.sponson) {
    for (const side of [-1, 1]) {
      const sp = new THREE.SphereGeometry(1, 18, 10);
      sp.scale(0.62, 0.62, 2.9);
      sp.translate(side * spec.R * 0.9, spec.cy - spec.R * k + 0.72, L / 2 - spec.main.d);
      parts.push(flatUV(paint(sp, new THREE.Color(livery.belly)), WHITE_U, WHITE_V));
    }
  }

  // ---- tailplane
  const ht = spec.htail;
  const fr = finFrame(spec);
  let htY;
  let htZ;
  if (ht.tTail) {
    htY = spec.height - 0.15;
    htZ = fr.zTipLE + 0.2;
  } else {
    htY = spec.cy + (R - R * 0.4) * k * spec.tailUp + R * k * ht.yRel * 0.5;
    htZ = L / 2 - ht.d;
  }
  const hs = liftingSurface({ root: ht.root, tip: ht.tip, span: ht.semi, sweep: ht.sweep, dihedral: ht.dihedral, th: 0.1, thTip: 0.09, y0: htY, zLE: htZ, sections: 4, color: ht.tTail ? new THREE.Color(livery.tail) : 0xd6d9dd, camber: 0, rootCap: false });
  parts.push(hs, mirrorX(hs));

  // ---- fin (livery band mapped onto both faces)
  const fin = liftingSurface({ root: spec.fin.root, tip: spec.fin.tip, span: fr.span, sweep: spec.fin.sweep, th: 0.11, thTip: 0.09, y0: 0, zLE: fr.zRootLE, sections: 5, n: 8, camber: 0 });
  fin.rotateZ(Math.PI / 2);
  fin.translate(0, fr.rootY, 0);
  {
    const p = fin.attributes.position;
    const uvA = fin.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = ((p.getZ(i) - fr.zMin) / (fr.zMax - fr.zMin)) * FIN_W / ATLAS_W;
      const v = (FIN_Y0 + (1 - (p.getY(i) - fr.yMin) / (fr.yMax - fr.yMin)) * FIN_H) / ATLAS_H;
      uvA.setXY(i, Math.min(FIN_W / ATLAS_W - 0.002, Math.max(0.001, u)), Math.min(0.999, Math.max(FIN_Y0 / ATLAS_H, v)));
    }
  }
  parts.push(fin);
  // dorsal fillet
  const dorsal = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dorsal.scale(0.18 * R, 0.55 * R, spec.fin.root * 0.75);
  dorsal.translate(0, fr.rootY - 0.05, fr.zRootLE - spec.fin.root * 0.1);
  parts.push(flatUV(paint(dorsal, new THREE.Color(livery.tail)), WHITE_U, WHITE_V));

  // ---- antennas, pitot, APU exhaust
  parts.push(box(0.05, 0.42, 0.3, 0, spec.cy + R * k - 0.02, L * 0.12, 0x3a3d42));
  parts.push(box(0.05, 0.3, 0.25, 0, spec.cy - R * k - 0.28, L * 0.05, 0x3a3d42));

  const merged = mergeGeometries(parts.map(complete));
  return { geometry: merged, engines };
}

/* ======================================================== cache + build */

const CACHE = { airframe: new Map(), gear: new Map(), prop: new Map(), atlas: new Map(), material: new Map(), gearMat: null };

function getAtlasMaterial(type, livery) {
  const key = `${type}|${livery.name}|${livery.primary}|${livery.tail}`;
  let m = CACHE.material.get(key);
  if (!m) {
    const tex = paintAtlas(SPECS[type], livery);
    CACHE.atlas.set(key, tex);
    m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.38, metalness: 0.18, envMapIntensity: 1.1 });
    m.name = `hdd:aircraft:${type}:${livery.code || livery.name}`;
    CACHE.material.set(key, m);
  }
  return m;
}

function getGearMaterial() {
  if (!CACHE.gearMat) {
    CACHE.gearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 });
    CACHE.gearMat.name = 'hdd:aircraft:gear';
  }
  return CACHE.gearMat;
}

function lightsFor(spec, engines) {
  const L = spec.length;
  const w = spec.wing;
  const wingY = spec.cy + spec.R * spec.k * w.yRel;
  const tipY = wingY + Math.tan((w.dihedral * Math.PI) / 180) * w.semi + (w.tipDevice === 'sharklet' ? 0.25 : 0);
  const tipZ = L / 2 - w.d - Math.tan((w.sweep * Math.PI) / 180) * w.semi - w.tip * 0.15;
  const tipX = w.semi + (w.tipDevice === 'raked' ? 2.2 : 0.05);
  const tailZ = -L / 2 - 0.2;
  const tailY = spec.cy + (spec.R - spec.R * 0.14) * spec.k * spec.tailUp;
  const ph = Math.random();
  const list = [
    { x: tipX, y: tipY, z: tipZ, color: 0xff2a1a, size: 0.55, kind: LIGHT_KIND.NAV, day: 0.35 },
    { x: -tipX, y: tipY, z: tipZ, color: 0x22ff6a, size: 0.55, kind: LIGHT_KIND.NAV, day: 0.35 },
    { x: 0, y: tailY, z: tailZ, color: 0xffffff, size: 0.5, kind: LIGHT_KIND.NAV, day: 0.3 },
    { x: tipX, y: tipY, z: tipZ - 0.4, color: 0xffffff, size: 1.4, kind: LIGHT_KIND.STROBE, phase: ph, rate: 0.85, day: 1 },
    { x: -tipX, y: tipY, z: tipZ - 0.4, color: 0xffffff, size: 1.4, kind: LIGHT_KIND.STROBE, phase: ph, rate: 0.85, day: 1 },
    { x: 0, y: tailY + 0.2, z: tailZ - 0.1, color: 0xffffff, size: 1.1, kind: LIGHT_KIND.STROBE, phase: ph + 0.5, rate: 0.85, day: 1 },
    { x: 0, y: spec.cy + spec.R * spec.k + 0.12, z: L * 0.05, color: 0xff2410, size: 0.9, kind: LIGHT_KIND.BEACON, phase: ph, rate: 0.95, day: 0.85 },
    { x: 0, y: spec.cy - spec.R * spec.k - 0.12, z: -L * 0.02, color: 0xff2410, size: 0.9, kind: LIGHT_KIND.BEACON, phase: ph + 0.5, rate: 0.95, day: 0.85 },
  ];
  const rootX = spec.R * 1.25;
  const rootZ = L / 2 - w.d - Math.tan((w.sweep * Math.PI) / 180) * rootX + 0.2;
  const rootY = wingY + Math.tan((w.dihedral * Math.PI) / 180) * rootX - 0.1;
  list.push({ x: rootX, y: rootY, z: rootZ, color: 0xfff4dc, size: 2.2, kind: LIGHT_KIND.LANDING, day: 0.65 });
  list.push({ x: -rootX, y: rootY, z: rootZ, color: 0xfff4dc, size: 2.2, kind: LIGHT_KIND.LANDING, day: 0.65 });
  list.push({ x: 0, y: spec.nose.r * 2 + 0.9, z: L / 2 - spec.nose.d + 0.4, color: 0xfff0d0, size: 1.4, kind: LIGHT_KIND.LANDING, day: 0.5 });
  // logo lights wash the fin at night
  return list;
}

/**
 * Build a generic airliner.
 * @returns THREE.Group with userData { type, livery, dims, spec, parts, mainGearZ, noseGearZ, setLights(), setGear(), dispose() }
 */
export function createAircraft(type = 'narrow', livery = null) {
  const t = SPECS[type] ? type : 'narrow';
  const spec = SPECS[t];
  const liv = resolveLivery(livery || (t === 'cargo' ? CARGO_LIVERY : null));
  const group = new THREE.Group();
  group.name = `aircraft:${t}:${liv.code || liv.name}`;

  let af = CACHE.airframe.get(`${t}|${liv.engine}|${liv.belly}|${liv.tail}|${liv.primary}`);
  if (!af) {
    af = airframeGeometry(spec, liv);
    CACHE.airframe.set(`${t}|${liv.engine}|${liv.belly}|${liv.tail}|${liv.primary}`, af);
  }
  const body = new THREE.Mesh(af.geometry, getAtlasMaterial(t, liv));
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'airframe';
  group.add(body);

  let gg = CACHE.gear.get(t);
  if (!gg) { gg = gearGeometry(spec); CACHE.gear.set(t, gg); }
  const gear = new THREE.Mesh(gg, getGearMaterial());
  gear.castShadow = true;
  gear.name = 'gear';
  group.add(gear);

  const props = [];
  if (spec.engineType === 'prop') {
    let pg = CACHE.prop.get(t);
    if (!pg) { pg = propellerGeometry(1.96); CACHE.prop.set(t, pg); }
    for (const e of af.engines) {
      const p = new THREE.Mesh(pg, getGearMaterial());
      p.position.set(e.x, e.y, e.z + 0.35);
      p.castShadow = true;
      p.name = 'propeller';
      group.add(p);
      props.push(p);
    }
  }

  const lights = new THREE.Points(lightGeometry(lightsFor(spec, af.engines)), createLightMaterial({ mask: [1, 0, 0, 0] }));
  lights.frustumCulled = false;
  lights.onBeforeRender = updateLightScale;
  lights.name = 'aircraft-lights';
  lights.renderOrder = 5;
  group.add(lights);

  const mask = lights.material.uniforms.uMask.value;
  const ctl = (key) => ({
    get visible() { return mask[key] > 0.5; },
    set visible(v) { mask[key] = v ? 1 : 0; },
  });
  const parts = {
    gear, wheels: gear, engines: af.engines, props, lights, body,
    navLights: ctl('x'), beacon: ctl('y'), strobes: ctl('z'), landingLights: ctl('w'),
  };
  group.userData = {
    type: t,
    livery: liv,
    spec,
    dims: { length: spec.length, span: spec.span, height: spec.height },
    seats: spec.seats,
    parts,
    mainGearZ: spec.length / 2 - spec.main.d,
    noseGearZ: spec.length / 2 - spec.nose.d,
    setLights({ nav, beacon, strobe, landing } = {}) {
      if (nav !== undefined) mask.x = nav ? 1 : 0;
      if (beacon !== undefined) mask.y = beacon ? 1 : 0;
      if (strobe !== undefined) mask.z = strobe ? 1 : 0;
      if (landing !== undefined) mask.w = landing ? 1 : 0;
    },
    setGear(down) { gear.visible = !!down; },
    dispose() {
      lights.geometry.dispose();
      lights.material.dispose();
    },
  };
  return group;
}

/** Free every cached airframe geometry, atlas texture and material. */
export function disposeAircraftCache() {
  for (const g of CACHE.airframe.values()) g.geometry.dispose();
  for (const g of CACHE.gear.values()) g.dispose();
  for (const g of CACHE.prop.values()) g.dispose();
  for (const t of CACHE.atlas.values()) t.dispose();
  for (const m of CACHE.material.values()) m.dispose();
  if (CACHE.gearMat) CACHE.gearMat.dispose();
  CACHE.airframe.clear(); CACHE.gear.clear(); CACHE.prop.clear(); CACHE.atlas.clear(); CACHE.material.clear();
  CACHE.gearMat = null;
}
