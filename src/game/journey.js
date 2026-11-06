/**
 * Passenger journey — pure logic (no DOM, no THREE; runs under node --test).
 *
 * The runtime (guide markers, HUD, cabin, flight) lives in src/world/cabin.js;
 * this module owns the step list, the procedurally generated boarding pass,
 * the flight timeline and the small path maths the flight is built from.
 * Everything here is simulated: airlines, flight numbers and the destination
 * label are invented and labelled as such.
 */

/** The ten steps from the forecourt to the seat (then the flight). */
export const JOURNEY_STEPS = [
  { id: 'enter', title: 'Enter the terminal', hint: 'Walk to the glass doors and press E to open them' },
  { id: 'checkin', title: 'Check in', hint: 'Island D — press E at the desk for your boarding pass' },
  { id: 'passport', title: 'Passport control', hint: 'Booth 2 — press E to present your passport' },
  { id: 'security', title: 'Security screening', hint: 'Lane 4 — press E to put your bag through the X-ray' },
  { id: 'fids', title: 'Find your gate', hint: 'Walk through the archway and check the departures screen (E)' },
  { id: 'gate', title: 'Gate 4 — boarding', hint: 'Press E at the gate desk to scan your boarding pass' },
  { id: 'bridge', title: 'Walk the jet bridge', hint: 'Up the stairs, through the gate door, down the bridge' },
  { id: 'board', title: 'Board the aircraft', hint: 'Press E at the aircraft door' },
  { id: 'seat', title: 'Find your seat', hint: 'Walk the aisle and press E at your seat' },
  { id: 'flight', title: 'Fly', hint: 'Push-back, take-off, cruise above the clouds, landing' },
];

export const STEP_IDS = JOURNEY_STEPS.map((s) => s.id);

/** Deterministic small PRNG (mulberry32). */
export function journeyRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 0x2f6b3a;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
const hhmm = (h) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
};

/**
 * A simulated boarding pass. `airlines` is a list of { name, code } (the
 * fictional liveries); `hour` is the scene clock; `date` a Date (optional).
 */
export function makeBoardingPass({ seed = 7, airlines = [], hour = 10, date = null, gate = '4', seatRow = 14, seatLetter = 'A' } = {}) {
  const rnd = journeyRng(seed);
  const list = airlines.length ? airlines : [{ name: 'Sindhu Skyways', code: 'SSW' }];
  const airline = list[Math.floor(rnd() * list.length) % list.length];
  const num = 100 + Math.floor(rnd() * 800);
  const dep = hour + 0.75;
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    airline: airline.name,
    code: airline.code,
    flight: `${airline.code} ${num}`,
    passenger: 'GUEST / SITE INSPECTOR',
    from: 'HDD', fromName: 'Hyderabad',
    to: 'KHI', toName: 'Karachi (simulated)',
    date: d ? `${pad2(d.getDate())} ${months[d.getMonth()]}` : '—',
    boarding: hhmm(dep - 0.5),
    departs: hhmm(dep),
    gate,
    seat: `${seatRow}${seatLetter}`,
    row: seatRow,
    letter: seatLetter,
    group: 1 + Math.floor(rnd() * 4),
    seq: String(1 + Math.floor(rnd() * 180)).padStart(3, '0'),
    cls: 'ECONOMY',
    simulated: true,
  };
}

/** Step bookkeeping: which step is current, which are done. */
export class JourneyState {
  constructor() { this.reset(); }

  reset() {
    this.active = false;
    this.index = 0;
    this.done = new Set();
    this.startedAt = 0;
  }

  start(fromId = 'enter') {
    this.reset();
    this.active = true;
    const i = STEP_IDS.indexOf(fromId);
    this.index = i < 0 ? 0 : i;
    for (let k = 0; k < this.index; k++) this.done.add(STEP_IDS[k]);
    return this.current;
  }

  get current() { return this.active ? JOURNEY_STEPS[this.index] : null; }
  get currentId() { return this.active ? STEP_IDS[this.index] : null; }

  is(id) { return this.active && STEP_IDS[this.index] === id; }

  /** Mark `id` done; returns the next step (or null at the end). Ignores out-of-order calls. */
  complete(id) {
    if (!this.is(id)) return null;
    this.done.add(id);
    if (this.index < STEP_IDS.length - 1) this.index++;
    return this.current;
  }

  /** Jump to a step (QA / skip): everything before it counts as done. */
  jump(id) { return this.start(id); }

  snapshot() {
    return {
      active: this.active,
      step: this.currentId,
      index: this.index,
      done: STEP_IDS.filter((s) => this.done.has(s)),
      total: STEP_IDS.length,
    };
  }
}

/* ------------------------------------------------------------ path maths */

/**
 * A polyline in the ground plane with circular fillets at the corners,
 * parameterised by arc length. points = [[x, z], …]; radius per corner may
 * be given as a third value. at(s) → { x, z, heading } where heading is the
 * world yaw of the direction of travel (atan2(dx, dz)).
 */
export function filletPath(points, radius = 20) {
  const segs = [];
  const P = points.map((p) => ({ x: p[0], z: p[1], r: p[2] === undefined ? radius : p[2] }));
  let cur = { x: P[0].x, z: P[0].z };
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1]; const b = P[i]; const c = P[i + 1];
    if (!c) { segs.push({ kind: 'line', a: cur, b: { x: b.x, z: b.z } }); break; }
    const d1x = b.x - a.x; const d1z = b.z - a.z; const l1 = Math.hypot(d1x, d1z) || 1;
    const d2x = c.x - b.x; const d2z = c.z - b.z; const l2 = Math.hypot(d2x, d2z) || 1;
    const u1 = { x: d1x / l1, z: d1z / l1 }; const u2 = { x: d2x / l2, z: d2z / l2 };
    const cross = u1.x * u2.z - u1.z * u2.x;
    const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.z * u2.z));
    const turn = Math.acos(dot);
    if (turn < 1e-3) { continue; }
    let t = b.r * Math.tan(turn / 2);
    t = Math.min(t, l1 * 0.48, l2 * 0.48);
    const r = t / Math.tan(turn / 2);
    const p1 = { x: b.x - u1.x * t, z: b.z - u1.z * t };
    const p2 = { x: b.x + u2.x * t, z: b.z + u2.z * t };
    segs.push({ kind: 'line', a: cur, b: p1 });
    // centre: perpendicular to u1 on the inside of the turn
    const side = cross > 0 ? 1 : -1;
    const n = { x: -u1.z * side, z: u1.x * side };
    const ctr = { x: p1.x + n.x * r, z: p1.z + n.z * r };
    const a0 = Math.atan2(p1.z - ctr.z, p1.x - ctr.x);
    segs.push({ kind: 'arc', c: ctr, r, a0, sweep: turn * side, len: r * turn });
    cur = p2;
  }
  let total = 0;
  for (const s of segs) {
    if (s.kind === 'line') s.len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    s.s0 = total;
    total += s.len;
  }
  const at = (sIn) => {
    const s = Math.max(0, Math.min(total, sIn));
    let g = segs[segs.length - 1];
    for (const q of segs) { if (s <= q.s0 + q.len) { g = q; break; } }
    const f = g.len > 0 ? (s - g.s0) / g.len : 0;
    if (g.kind === 'line') {
      const dx = g.b.x - g.a.x; const dz = g.b.z - g.a.z;
      return { x: g.a.x + dx * f, z: g.a.z + dz * f, heading: Math.atan2(dx, dz) };
    }
    const ang = g.a0 + g.sweep * f;
    const x = g.c.x + Math.cos(ang) * g.r; const z = g.c.z + Math.sin(ang) * g.r;
    // tangent of the circle in the direction of travel
    const sg = Math.sign(g.sweep);
    const tx = -Math.sin(ang) * sg; const tz = Math.cos(ang) * sg;
    return { x, z, heading: Math.atan2(tx, tz) };
  };
  return { length: total, at, segments: segs.length };
}

/**
 * Distance-vs-time table for a leg of length L flown in T seconds that starts
 * at v0 and ends at v1 (m/s), with a smooth "time-lapse" bump in between.
 * Returns { s(t), v(t), T, L }.
 */
export function speedProfile(L, T, v0, v1) {
  const n = 400;
  const dt = T / n;
  const base = (t) => v0 + (v1 - v0) * (t / T);
  const bump = (t) => Math.pow(Math.sin(Math.PI * t / T), 2.4);
  let bInt = 0; let vInt = 0;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * dt; bInt += bump(t) * dt; vInt += base(t) * dt; }
  const A = Math.max(0, (L - vInt) / Math.max(1e-6, bInt));
  const v = (t) => base(t) + A * bump(t);
  const table = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const t = (i - 0.5) * dt; table[i] = table[i - 1] + v(t) * dt; }
  const scale = table[n] > 0 ? L / table[n] : 1;
  const s = (t) => {
    const x = Math.max(0, Math.min(n, (t / T) * n));
    const i = Math.floor(x); const f = x - i;
    if (i >= n) return L;
    return (table[i] + (table[i + 1] - table[i]) * f) * scale;
  };
  return { s, v: (t) => v(Math.max(0, Math.min(T, t))) * scale, T, L, peak: (v0 + v1) / 2 + A };
}

/** Phase bookkeeping for the flight: [{ id, label, dur }] → lookups by time. */
export function buildTimeline(phases) {
  let t = 0;
  const list = phases.map((p) => { const q = { ...p, t0: t, t1: t + p.dur }; t += p.dur; return q; });
  return {
    phases: list,
    total: t,
    at(time) {
      for (const p of list) if (time < p.t1) return p;
      return list[list.length - 1];
    },
    byId(id) { return list.find((p) => p.id === id) || null; },
  };
}

/** Labels shown while airborne, picked from altitude and vertical trend. */
export function airbornePhase(alt, climbing, deck = { bottom: 1150, top: 1450 }, cruiseAlt = 2400) {
  if (alt >= deck.bottom - 40 && alt <= deck.top + 40) return 'clouds';
  if (climbing && alt < deck.bottom) return 'climb';
  if (alt > deck.top && alt > cruiseAlt - 150) return 'cruise';
  if (alt > deck.top) return climbing ? 'above' : 'descent';
  return climbing ? 'climb' : alt < 500 ? 'landing' : 'descent';
}

export const FLIGHT_LABELS = {
  boarding: 'Boarding complete — doors closing',
  pushback: 'Push-back from Gate 4',
  taxi: 'Taxi to runway 20 (time-lapse)',
  lineup: 'Line up and wait — runway 20',
  takeoff: 'Take-off roll',
  climb: 'Climbing over Hyderabad',
  clouds: 'Through the cloud layer',
  above: 'Above the clouds',
  cruise: 'Cruise — above the clouds',
  descent: 'Descent over the Indus plain',
  landing: 'Final approach — runway 20',
  rollout: 'Touchdown — reversers, braking',
  arrived: 'Arrived — simulated flight',
};
