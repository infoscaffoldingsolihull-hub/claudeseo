/**
 * Furniture, fittings, sanitaryware, appliances and light fixtures.
 *
 * Every object here is a priced line in the bill of quantities and can be
 * inspected: press E and the camera frames it, the card names its material and
 * dimensions, the work package that bought it and what it cost in rupees.
 *
 * Geometry is merged by (material × work package) rather than kept per object.
 * A room's furniture is therefore two or three draw calls instead of forty,
 * and the timeline can still install the reception furniture on the day the
 * FF&E package starts, because the package is part of the merge key.
 *
 * Picking does not need the individual meshes: the interaction system tests a
 * ray against each object's own box (see interact.js), which is why merging
 * costs nothing in interactivity.
 */
import * as THREE from 'three';
import { LEVEL_BY_ID, ROOM_BY_ID, SITE_LEVEL, GARAGE, PORTICO, SITE } from './plan.js';
import { createSurfaceBuilder } from './build.js';

/**
 * The kit. Every builder works in world space from a footprint centred on
 * (x, z) with its base at `y`, so an item's data is just where it stands and
 * how big it is.
 */
const KIT = {
  /** Upholstered seating: plinth, seat cushions, back and arms. */
  sofa(b, o) {
    const { x, y, z, w, d, h } = o;
    const armW = Math.min(0.22, w * 0.12);
    const backD = 0.20;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.16, z + d / 2);
    b.box(x - w / 2, y + 0.16, z + d / 2 - backD, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2, y + 0.16, z - d / 2, x - w / 2 + armW, y + h * 0.72, z + d / 2);
    b.box(x + w / 2 - armW, y + 0.16, z - d / 2, x + w / 2, y + h * 0.72, z + d / 2);
    const seats = Math.max(1, Math.round(w / 0.72));
    const inner = w - armW * 2;
    for (let i = 0; i < seats; i += 1) {
      const cx = x - inner / 2 + (inner * (i + 0.5)) / seats;
      const cw = (inner / seats) * 0.94;
      b.box(cx - cw / 2, y + 0.16, z - d / 2 + 0.05, cx + cw / 2, y + 0.42, z + d / 2 - backD);
      b.box(cx - cw / 2, y + 0.42, z + d / 2 - backD - 0.04, cx + cw / 2, y + h * 0.86, z + d / 2 - backD + 0.02);
    }
  },

  /** A dining or occasional chair. */
  chair(b, o) {
    const { x, y, z, w, d, h } = o;
    const t = 0.05;
    b.box(x - w / 2, y + 0.42, z - d / 2, x + w / 2, y + 0.47, z + d / 2);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(x + sx * (w / 2 - t), y, z + sz * (d / 2 - t),
          x + sx * (w / 2 - t) + sx * t, y + 0.42, z + sz * (d / 2 - t) + sz * t);
      }
    }
    b.box(x - w / 2, y + 0.47, z + d / 2 - t * 1.6, x + w / 2, y + h, z + d / 2);
  },

  /** A table: top, apron and four legs. */
  table(b, o) {
    const { x, y, z, w, d, h } = o;
    const t = 0.055;
    const leg = 0.07;
    b.box(x - w / 2, y + h - t, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2 + 0.06, y + h - t - 0.08, z - d / 2 + 0.06, x + w / 2 - 0.06, y + h - t, z + d / 2 - 0.06);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = x + sx * (w / 2 - leg);
        const lz = z + sz * (d / 2 - leg);
        b.box(lx - leg / 2, y, lz - leg / 2, lx + leg / 2, y + h - t, lz + leg / 2);
      }
    }
  },

  /** A bed: base, mattress, headboard, pillows and a folded throw. */
  bed(b, o) {
    const { x, y, z, w, d, h, face } = o;
    // `face` is the direction the sleeper looks: the headboard is behind them.
    const headZ = face === 'north' ? z + d / 2 : z - d / 2;
    const sign = face === 'north' ? 1 : -1;
    b.box(x - w / 2, y + 0.12, z - d / 2, x + w / 2, y + 0.44, z + d / 2);
    b.box(x - w / 2 + 0.06, y, z - d / 2 + 0.06, x + w / 2 - 0.06, y + 0.12, z + d / 2 - 0.06);
    b.box(x - w / 2 - 0.03, y + 0.44, z - d / 2, x + w / 2 + 0.03, y + 0.70, z + d / 2);
    b.box(x - w / 2 - 0.05, y + 0.12, headZ - sign * 0.06, x + w / 2 + 0.05, y + h, headZ + sign * 0.06);
    // Pillows.
    for (const side of [-1, 1]) {
      const px = x + side * w * 0.23;
      b.box(px - w * 0.20, y + 0.70, headZ - sign * 0.62, px + w * 0.20, y + 0.83, headZ - sign * 0.24);
    }
    // A throw across the foot.
    b.box(x - w / 2 - 0.04, y + 0.68, headZ - sign * (d - 0.30), x + w / 2 + 0.04, y + 0.76, headZ - sign * (d - 0.02));
  },

  /** A carcase with doors and handles: wardrobes, sideboards, base units. */
  cabinet(b, o) {
    const { x, y, z, w, d, h, doors = 2, plinth = 0.08 } = o;
    b.box(x - w / 2 + 0.03, y, z - d / 2 + 0.03, x + w / 2 - 0.03, y + plinth, z + d / 2 - 0.03);
    b.box(x - w / 2, y + plinth, z - d / 2, x + w / 2, y + h, z + d / 2);
    const n = Math.max(1, doors);
    for (let i = 0; i < n; i += 1) {
      const dw = (w - 0.04) / n;
      const cx = x - w / 2 + 0.02 + dw * (i + 0.5);
      b.box(cx - dw / 2 + 0.008, y + plinth + 0.02, z + d / 2, cx + dw / 2 - 0.008, y + h - 0.02, z + d / 2 + 0.018);
      const hx = i % 2 === 0 ? cx + dw / 2 - 0.07 : cx - dw / 2 + 0.07;
      b.box(hx - 0.012, y + h * 0.52, z + d / 2 + 0.018, hx + 0.012, y + h * 0.66, z + d / 2 + 0.05);
    }
  },

  /** Open shelving: uprights, shelves and a run of books. */
  shelves(b, o) {
    const { x, y, z, w, d, h, tiers = 5, books = true } = o;
    const t = 0.035;
    b.box(x - w / 2, y, z - d / 2, x - w / 2 + t, y + h, z + d / 2);
    b.box(x + w / 2 - t, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.06, z + d / 2);
    for (let i = 1; i <= tiers; i += 1) {
      const sy = y + (h * i) / (tiers + 1);
      b.box(x - w / 2, sy, z - d / 2, x + w / 2, sy + t, z + d / 2);
      if (!books) continue;
      // Books, as a run of slightly different blocks.
      let cursor = x - w / 2 + 0.05;
      let n = 0;
      while (cursor < x + w / 2 - 0.10 && n < 40) {
        const bw = 0.028 + ((n * 37) % 11) * 0.006;
        const bh = 0.20 + ((n * 53) % 7) * 0.018;
        b.box(cursor, sy + t, z - d / 2 + 0.04, cursor + bw, sy + t + bh, z + d / 2 - 0.05);
        cursor += bw + 0.004;
        n += 1;
      }
    }
  },

  /** A flat panel: rugs, mirrors, screens, television, art. */
  panel(b, o) {
    const { x, y, z, w, d, h } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + (h || 0.02), z + d / 2);
  },

  /** A chandelier: chain, corona, arms and candles. */
  chandelier(b, o) {
    const { x, y, z, w, drop = 1.1 } = o;
    const r = w / 2;
    b.box(x - 0.02, y, z - 0.02, x + 0.02, y + drop, z + 0.02);
    b.box(x - r * 0.18, y - 0.10, z - r * 0.18, x + r * 0.18, y, z + r * 0.18);
    const arms = 8;
    for (let i = 0; i < arms; i += 1) {
      const a = (i / arms) * Math.PI * 2;
      const ax = x + Math.cos(a) * r;
      const az = z + Math.sin(a) * r;
      b.box(Math.min(x, ax), y - 0.13, Math.min(z, az), Math.max(x, ax), y - 0.09, Math.max(z, az));
      b.box(ax - 0.035, y - 0.13, az - 0.035, ax + 0.035, y + 0.14, az + 0.035);
      // Drops hanging from each arm.
      b.box(ax - 0.02, y - 0.34, az - 0.02, ax + 0.02, y - 0.13, az + 0.02);
    }
    b.box(x - r * 0.5, y - 0.42, z - r * 0.5, x + r * 0.5, y - 0.30, z + r * 0.5);
  },

  /** A ceiling or wall light: the emissive part is built separately. */
  fixture(b, o) {
    const { x, y, z, w, h } = o;
    b.box(x - w / 2, y - h, z - w / 2, x + w / 2, y, z + w / 2);
  },

  /** A washbasin on a vanity, with taps. */
  vanity(b, o) {
    const { x, y, z, w, d, h, basins = 1 } = o;
    b.box(x - w / 2, y + 0.10, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2 - 0.02, y + h, z - d / 2 - 0.02, x + w / 2 + 0.02, y + h + 0.04, z + d / 2 + 0.02);
    for (let i = 0; i < basins; i += 1) {
      const cx = x - w / 2 + (w * (i + 0.5)) / basins;
      b.box(cx - 0.22, y + h + 0.04, z - 0.16, cx + 0.22, y + h + 0.16, z + 0.16);
      b.box(cx - 0.02, y + h + 0.16, z + d / 2 - 0.12, cx + 0.02, y + h + 0.34, z + d / 2 - 0.08);
    }
  },

  /** A close-coupled WC. */
  wc(b, o) {
    const { x, y, z, d } = o;
    b.box(x - 0.19, y, z - d / 2 + 0.06, x + 0.19, y + 0.40, z + d / 2 - 0.16);
    b.box(x - 0.21, y + 0.36, z - d / 2 + 0.02, x + 0.21, y + 0.44, z + d / 2 - 0.12);
    b.box(x - 0.17, y + 0.40, z + d / 2 - 0.24, x + 0.17, y + 0.78, z + d / 2 - 0.02);
  },

  /** A freestanding bath. */
  bath(b, o) {
    const { x, y, z, w, d, h } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2 + 0.09, y + h - 0.06, z - d / 2 + 0.09, x + w / 2 - 0.09, y + h, z + d / 2 - 0.09);
  },

  /** A car: body, cabin, wheels and glass line. */
  car(b, o) {
    const { x, y, z, w, d } = o;
    const bodyH = 0.62;
    const wheel = 0.33;
    b.box(x - w / 2, y + wheel * 0.55, z - d / 2, x + w / 2, y + wheel * 0.55 + bodyH, z + d / 2);
    b.box(x - w / 2 + 0.06, y + wheel * 0.55 + bodyH, z - d * 0.22, x + w / 2 - 0.06, y + wheel * 0.55 + bodyH + 0.48, z + d * 0.26);
    b.box(x - w / 2 - 0.015, y + wheel * 0.7, z - d / 2 + 0.10, x + w / 2 + 0.015, y + wheel * 0.7 + 0.14, z + d / 2 - 0.10);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wx = x + sx * (w / 2 - 0.03);
        const wz = z + sz * (d * 0.31);
        b.box(wx - 0.06 * sx, y, wz - wheel / 2, wx + 0.06 * sx, y + wheel, wz + wheel / 2);
      }
    }
  },

  /** Gym equipment: a treadmill deck on an inclined frame. */
  treadmill(b, o) {
    const { x, y, z, w, d } = o;
    b.box(x - w / 2, y + 0.14, z - d / 2, x + w / 2, y + 0.24, z + d * 0.24);
    b.box(x - w / 2, y, z - d / 2 + 0.05, x - w / 2 + 0.08, y + 0.14, z + d / 2 - 0.05);
    b.box(x + w / 2 - 0.08, y, z - d / 2 + 0.05, x + w / 2, y + 0.14, z + d / 2 - 0.05);
    b.box(x - w / 2, y + 0.24, z + d * 0.24, x + w / 2, y + 1.05, z + d * 0.34);
    b.box(x - w / 2, y + 1.00, z + d * 0.20, x + w / 2, y + 1.12, z + d * 0.40);
  },

  /** A rack of weights. */
  weights(b, o) {
    const { x, y, z, w, d } = o;
    b.box(x - w / 2, y, z - d / 2, x - w / 2 + 0.08, y + 1.05, z + d / 2);
    b.box(x + w / 2 - 0.08, y, z - d / 2, x + w / 2, y + 1.05, z + d / 2);
    for (const level of [0.34, 0.72]) {
      b.box(x - w / 2, y + level, z - d / 2, x + w / 2, y + level + 0.06, z + d / 2);
      let cursor = x - w / 2 + 0.14;
      let i = 0;
      while (cursor < x + w / 2 - 0.24) {
        const r = 0.10 + (i % 4) * 0.018;
        b.box(cursor, y + level + 0.06, z - r, cursor + 0.10, y + level + 0.06 + r * 2, z + r);
        cursor += 0.22;
        i += 1;
      }
    }
  },

  /** Kitchen worktop run: carcase, doors, worktop and an upstand. */
  worktop(b, o) {
    const { x, y, z, w, d, h } = o;
    KIT.cabinet(b, { x, y, z, w, d, h: h - 0.04, doors: Math.max(2, Math.round(w / 0.62)) });
    b.box(x - w / 2 - 0.02, y + h - 0.04, z - d / 2 - 0.02, x + w / 2 + 0.02, y + h, z + d / 2 + 0.02);
  },

  /** An appliance: a box with a control strip and a handle. */
  appliance(b, o) {
    const { x, y, z, w, d, h } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.box(x - w / 2 + 0.03, y + h * 0.80, z + d / 2, x + w / 2 - 0.03, y + h * 0.92, z + d / 2 + 0.014);
    b.box(x - w / 2 + 0.06, y + h * 0.68, z + d / 2 + 0.014, x + w / 2 - 0.06, y + h * 0.74, z + d / 2 + 0.05);
  },

  /** A cooker hood over the island. */
  hood(b, o) {
    const { x, y, z, w, d, h } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.22, z + d / 2);
    b.box(x - 0.16, y + 0.22, z - 0.16, x + 0.16, y + h, z + 0.16);
  },

  /** Tiered cinema seating: a plinth with recliners on it. */
  cinemaRow(b, o) {
    const { x, y, z, w, d, seats = 4 } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + (o.riser || 0), z + d / 2);
    const top = y + (o.riser || 0);
    for (let i = 0; i < seats; i += 1) {
      const cx = x - w / 2 + (w * (i + 0.5)) / seats;
      const sw = (w / seats) * 0.86;
      b.box(cx - sw / 2, top, z - d / 2 + 0.12, cx + sw / 2, top + 0.42, z + d / 2 - 0.12);
      b.box(cx - sw / 2, top + 0.42, z + d / 2 - 0.34, cx + sw / 2, top + 1.02, z + d / 2 - 0.12);
      for (const side of [-1, 1]) {
        b.box(cx + side * (sw / 2 - 0.06), top + 0.42, z - d / 2 + 0.14,
          cx + side * (sw / 2), top + 0.62, z + d / 2 - 0.30);
      }
    }
  },

  /** Plant: a tank or a boiler on a base. */
  plant(b, o) {
    const { x, y, z, w, d, h } = o;
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.10, z + d / 2);
    b.box(x - w / 2 + 0.04, y + 0.10, z - d / 2 + 0.04, x + w / 2 - 0.04, y + h, z + d / 2 - 0.04);
    b.box(x - 0.06, y + h, z - 0.06, x + 0.06, y + h + 0.25, z + 0.06);
  },

  /** A sun lounger. */
  lounger(b, o) {
    const { x, y, z, w, d } = o;
    b.box(x - w / 2, y + 0.28, z - d / 2, x + w / 2, y + 0.36, z + d * 0.20);
    b.box(x - w / 2, y + 0.36, z + d * 0.20, x + w / 2, y + 0.78, z + d * 0.34);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(x + sx * (w / 2 - 0.05) - 0.03, y, z + sz * (d * 0.28) - 0.03,
          x + sx * (w / 2 - 0.05) + 0.03, y + 0.28, z + sz * (d * 0.28) + 0.03);
      }
    }
  },
};

/* ------------------------------------------------------------- the schedule */

const G = 0;      // ground floor datum
const F = 4.0;    // first floor datum
const B = -3.0;   // basement datum

/**
 * Every furnished object in the house.
 *
 *   build     which builder in KIT
 *   mat       merge material
 *   pkg       work package that pays for it
 *   boq       bill-of-quantities line
 *   solid     register a collision box (large items only)
 */
function furnishingSchedule() {
  const items = [];
  const add = (o) => { items.push(o); return o; };

  /** A standard bedroom set, mirrored to whichever wall the head goes against. */
  const bedroom = (room, id, x, z, opts = {}) => {
    const y = opts.y !== undefined ? opts.y : F;
    const face = opts.face || 'north';
    const sign = face === 'north' ? 1 : -1;
    const w = opts.w || 1.62;
    const d = opts.d || 2.05;
    add({ id: `${id}Bed`, name: opts.bedName || 'Bed', room, build: 'bed', mat: 'fabric', pkg: 'X4', boq: 'b.furn.bed', solid: true, material: 'Upholstered frame, sprung mattress', x, y, z, w, d, h: 1.15, face });
    for (const side of [-1, 1]) {
      add({ id: `${id}Side${side > 0 ? 'R' : 'L'}`, name: 'Bedside table', room, build: 'cabinet', mat: 'wood', pkg: 'X4', boq: 'b.furn.bed', material: 'Veneered hardwood', x: x + side * (w / 2 + 0.34), y, z: z + sign * (d / 2 - 0.24), w: 0.5, d: 0.42, h: 0.56, doors: 1 });
    }
    add({ id: `${id}Wardrobe`, name: 'Built-in wardrobe', room, build: 'cabinet', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Veneered MDF, soft-close, internally lit', x: opts.wx, y, z: opts.wz, w: opts.ww || 2.2, d: opts.wd || 0.62, h: 2.35, doors: 3 });
    if (opts.desk) {
      add({ id: `${id}Desk`, name: 'Writing desk', room, build: 'table', mat: 'wood', pkg: 'X4', boq: 'b.furn.bed', material: 'Oak, waxed', x: opts.desk[0], y, z: opts.desk[1], w: 1.3, d: 0.62, h: 0.75 });
      add({ id: `${id}DeskChair`, name: 'Desk chair', room, build: 'chair', mat: 'fabric', pkg: 'X4', boq: 'b.furn.bed', material: 'Upholstered oak', x: opts.desk[0], y, z: opts.desk[1] - 0.7, w: 0.48, d: 0.48, h: 0.92 });
    }
  };

  /* ------------------------------------------------------------- foyer ---- */
  add({ id: 'foyerChandelier', name: 'Grand crystal chandelier', room: 'foyer', build: 'chandelier', mat: 'brass', pkg: 'X2', boq: 'b.chand.grand', emissive: true, material: 'Hand-cut lead crystal on a brass corona', x: 0, y: 6.0, z: 0.5, w: 1.6, drop: 1.2, h: 1.9, note: 'Hung in the double-height void so it is read from both the foyer floor and the first-floor gallery.' });
  for (const side of [-1, 1]) {
    add({ id: `foyerConsole${side > 0 ? 'E' : 'W'}`, name: 'Foyer console table', room: 'foyer', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.art', material: 'Carved hardwood with a marble top', x: side * 3.05, y: G, z: 0.5, w: 0.42, d: 1.35, h: 0.86 });
    add({ id: `foyerMirror${side > 0 ? 'E' : 'W'}`, name: 'Gilt pier mirror', room: 'foyer', build: 'panel', mat: 'brass', pkg: 'X7', boq: 'b.art', material: 'Gilded frame, bevelled glass', x: side * 3.3, y: 1.15, z: 0.5, w: 0.06, d: 1.15, h: 1.85 });
  }
  add({ id: 'foyerRug', name: 'Hand-knotted foyer carpet', room: 'foyer', build: 'panel', mat: 'carpet', pkg: 'X7', boq: 'b.rugs', material: 'Silk and wool, hand-knotted', x: 0, y: G, z: 0.5, w: 3.2, d: 2.8, h: 0.022 });

  /* ------------------------------------------------------------ majlis ---- */
  add({ id: 'majlisSofa', name: 'Majlis principal sofa', room: 'majlis', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.majlis', solid: true, material: 'Silk-blend upholstery on a hardwood frame', x: -6.8, y: G, z: 2.35, w: 2.6, d: 0.98, h: 0.86 });
  add({ id: 'majlisSofaW', name: 'Majlis two-seat sofa', room: 'majlis', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.majlis', solid: true, material: 'Silk-blend upholstery on a hardwood frame', x: -9.2, y: G, z: 0.3, w: 0.98, d: 1.9, h: 0.86 });
  for (let i = 0; i < 2; i += 1) {
    add({ id: `majlisChair${i}`, name: 'Majlis armchair', room: 'majlis', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.majlis', solid: true, material: 'Silk-blend upholstery on a hardwood frame', x: -4.35, y: G, z: -0.5 + i * 1.5, w: 0.92, d: 0.92, h: 0.86 });
  }
  add({ id: 'majlisTable', name: 'Majlis centre table', room: 'majlis', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.furn.majlis', solid: true, material: 'Walnut with an inlaid marble top', x: -6.8, y: G, z: 0.55, w: 1.5, d: 0.85, h: 0.42 });
  add({ id: 'majlisRug', name: 'Majlis carpet', room: 'majlis', build: 'panel', mat: 'carpet', pkg: 'X7', boq: 'b.rugs', material: 'Hand-knotted wool', x: -6.8, y: G, z: 0.6, w: 4.2, d: 3.1, h: 0.02 });
  add({ id: 'majlisChandelier', name: 'Majlis chandelier', room: 'majlis', build: 'chandelier', mat: 'brass', pkg: 'X2', boq: 'b.chand.room', emissive: true, material: 'Crystal on an antique-brass frame', x: -6.8, y: 3.3, z: 0.5, w: 0.85, drop: 0.5, h: 1.0 });
  add({ id: 'majlisConsole', name: 'Majlis console', room: 'majlis', build: 'cabinet', mat: 'wood', pkg: 'X3', boq: 'b.furn.majlis', material: 'Veneered walnut', x: -6.8, y: G, z: -1.75, w: 1.8, d: 0.45, h: 0.82, doors: 3 });

  /* ------------------------------------------------------------ dining ---- */
  add({ id: 'diningTable', name: 'Twelve-seat dining table', room: 'dining', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.furn.dining', solid: true, material: 'Solid walnut on a turned base', x: 6.75, y: G, z: 0.5, w: 1.25, d: 3.1, h: 0.77 });
  for (let i = 0; i < 5; i += 1) {
    for (const side of [-1, 1]) {
      add({ id: `diningChair${i}${side > 0 ? 'E' : 'W'}`, name: 'Dining chair', room: 'dining', build: 'chair', mat: 'fabric', pkg: 'X3', boq: 'b.furn.dining', material: 'Upholstered walnut', x: 6.75 + side * 0.95, y: G, z: -0.72 + i * 0.61, w: 0.5, d: 0.5, h: 1.02 });
    }
  }
  for (const end of [-1, 1]) {
    add({ id: `diningChairEnd${end > 0 ? 'N' : 'S'}`, name: 'Carver chair', room: 'dining', build: 'chair', mat: 'fabric', pkg: 'X3', boq: 'b.furn.dining', material: 'Upholstered walnut with arms', x: 6.75, y: G, z: 0.5 + end * 1.92, w: 0.56, d: 0.5, h: 1.08 });
  }
  add({ id: 'diningBuffet', name: 'Dining sideboard', room: 'dining', build: 'cabinet', mat: 'wood', pkg: 'X3', boq: 'b.furn.dining', solid: true, material: 'Walnut with a marble top', x: 9.6, y: G, z: 0.5, w: 0.5, d: 2.2, h: 0.92, doors: 3 });
  add({ id: 'diningChandelier', name: 'Dining chandelier', room: 'dining', build: 'chandelier', mat: 'brass', pkg: 'X2', boq: 'b.chand.room', emissive: true, material: 'Crystal on an antique-brass frame', x: 6.75, y: 3.3, z: 0.5, w: 0.9, drop: 0.45, h: 1.0 });
  add({ id: 'diningRug', name: 'Dining carpet', room: 'dining', build: 'panel', mat: 'carpet', pkg: 'X7', boq: 'b.rugs', material: 'Hand-knotted wool', x: 6.75, y: G, z: 0.5, w: 3.4, d: 4.4, h: 0.02 });

  /* ------------------------------------------------------------ lounge ---- */
  add({ id: 'loungeSofa', name: 'Lounge sectional', room: 'lounge', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.living', solid: true, material: 'Performance weave on a hardwood frame', x: 6.9, y: G, z: -2.75, w: 3.0, d: 1.0, h: 0.82 });
  add({ id: 'loungeSofaB', name: 'Lounge chaise', room: 'lounge', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.living', solid: true, material: 'Performance weave on a hardwood frame', x: 9.4, y: G, z: -4.1, w: 0.95, d: 1.9, h: 0.82 });
  add({ id: 'loungeTable', name: 'Lounge coffee table', room: 'lounge', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.furn.living', material: 'Oak with a smoked-glass top', x: 6.9, y: G, z: -4.3, w: 1.3, d: 0.8, h: 0.40 });
  add({ id: 'loungeMedia', name: 'Media console', room: 'lounge', build: 'cabinet', mat: 'wood', pkg: 'X3', boq: 'b.furn.living', material: 'Veneered oak', x: 6.9, y: G, z: -6.6, w: 2.4, d: 0.45, h: 0.52, doors: 3 });
  add({ id: 'loungeTv', name: 'Television', room: 'lounge', build: 'panel', mat: 'steel', pkg: 'X5', boq: 'b.theatre', material: '85-inch 4K OLED', x: 6.9, y: 0.95, z: -6.78, w: 1.92, d: 0.07, h: 1.10 });
  add({ id: 'loungeShelf', name: 'Lounge bookcase', room: 'lounge', build: 'shelves', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Veneered oak', x: 4.0, y: G, z: -4.4, w: 0.42, d: 1.9, h: 2.1, tiers: 4 });
  add({ id: 'loungeRug', name: 'Lounge rug', room: 'lounge', build: 'panel', mat: 'carpet', pkg: 'X7', boq: 'b.rugs', material: 'Hand-knotted wool', x: 6.9, y: G, z: -4.3, w: 3.6, d: 2.9, h: 0.02 });

  /* ----------------------------------------------------------- kitchen ---- */
  add({ id: 'kitchenIsland', name: 'Kitchen island', room: 'kitchen', build: 'worktop', mat: 'stone', pkg: 'I10', boq: 'b.kitchen', solid: true, material: 'Quartz worktop on a lacquered carcase', x: -6.0, y: G, z: -4.4, w: 2.9, d: 1.15, h: 0.94 });
  add({ id: 'kitchenRunN', name: 'Kitchen run — north', room: 'kitchen', build: 'worktop', mat: 'stone', pkg: 'I10', boq: 'b.kitchen', solid: true, material: 'Quartz worktop on a lacquered carcase', x: -6.2, y: G, z: -6.62, w: 6.6, d: 0.64, h: 0.92 });
  add({ id: 'kitchenWall', name: 'Wall units', room: 'kitchen', build: 'cabinet', mat: 'wood', pkg: 'I10', boq: 'b.kitchen', material: 'Lacquered MDF, soft-close', x: -6.2, y: 1.52, z: -6.62, w: 6.6, d: 0.36, h: 0.72, doors: 8, plinth: 0 });
  add({ id: 'kitchenTall', name: 'Tall unit housing', room: 'kitchen', build: 'cabinet', mat: 'wood', pkg: 'I10', boq: 'b.kitchen', solid: true, material: 'Lacquered MDF', x: -9.3, y: G, z: -5.4, w: 0.62, d: 1.9, h: 2.30, doors: 2 });
  add({ id: 'kitchenFridge', name: 'Refrigeration', room: 'kitchen', build: 'appliance', mat: 'steel', pkg: 'I10', boq: 'b.kit.app', solid: true, material: 'Integrated side-by-side, 640 litre', x: -9.3, y: G, z: -3.6, w: 0.66, d: 1.2, h: 2.0 });
  add({ id: 'kitchenOven', name: 'Built-in ovens', room: 'kitchen', build: 'appliance', mat: 'steel', pkg: 'I10', boq: 'b.kit.app', material: 'Pyrolytic double oven with steam', x: -8.4, y: 0.6, z: -6.5, w: 0.6, d: 0.58, h: 1.2 });
  add({ id: 'kitchenHood', name: 'Island extractor', room: 'kitchen', build: 'hood', mat: 'steel', pkg: 'I10', boq: 'b.kit.app', material: 'Ceiling-mounted recirculating hood', x: -6.0, y: 2.05, z: -4.4, w: 1.3, d: 0.7, h: 1.55 });
  add({ id: 'kitchenTable', name: 'Breakfast table', room: 'kitchen', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.furn.living', material: 'Oak', x: -3.6, y: G, z: -3.4, w: 1.1, d: 1.1, h: 0.75 });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    add({ id: `kitchenStool${i}`, name: 'Breakfast chair', room: 'kitchen', build: 'chair', mat: 'fabric', pkg: 'X3', boq: 'b.furn.living', material: 'Upholstered oak', x: -3.6 + Math.cos(a) * 0.82, y: G, z: -3.4 + Math.sin(a) * 0.82, w: 0.44, d: 0.44, h: 0.9 });
  }

  /* ------------------------------------------------------------ pantry ---- */
  add({ id: 'pantryRun', name: 'Pantry units', room: 'pantry', build: 'worktop', mat: 'stone', pkg: 'I10', boq: 'b.pantry', solid: true, material: 'Laminate worktop on a melamine carcase', x: -8.25, y: G, z: -12.6, w: 3.2, d: 0.62, h: 0.9 });
  add({ id: 'pantryShelves', name: 'Pantry shelving', room: 'pantry', build: 'shelves', mat: 'wood', pkg: 'I10', boq: 'b.pantry', solid: true, material: 'Powder-coated steel and ply', x: -9.7, y: G, z: -10.2, w: 0.4, d: 2.4, h: 2.1, tiers: 4, books: false });

  /* ------------------------------------------------------- guest suite ---- */
  bedroom('guest', 'guest', -3.8, -10.8, { y: G, face: 'south', wx: -6.1, wz: -10.6, ww: 0.6, wd: 2.4, bedName: 'Guest bed' });

  /* ------------------------------------------------------------ powder ---- */
  add({ id: 'powderWc', name: 'Powder room WC', room: 'powder', build: 'wc', mat: 'porcelain', pkg: 'I9', boq: 'b.bath.powder', material: 'Wall-hung pan with a concealed cistern', x: 1.1, y: G, z: -12.5, w: 0.4, d: 0.7, h: 0.8 });
  add({ id: 'powderVanity', name: 'Powder room vanity', room: 'powder', build: 'vanity', mat: 'stone', pkg: 'I9', boq: 'b.bath.powder', solid: true, material: 'Marble top with a vessel basin', x: -0.2, y: G, z: -12.6, w: 1.1, d: 0.52, h: 0.82 });
  add({ id: 'powderMirror', name: 'Powder room mirror', room: 'powder', build: 'panel', mat: 'brass', pkg: 'I9', boq: 'b.bath.powder', material: 'Brass-framed bevelled mirror', x: -0.2, y: 1.15, z: -12.86, w: 0.9, d: 0.05, h: 1.1 });

  /* ----------------------------------------------------------- service ---- */
  add({ id: 'serviceTable', name: 'Staff table', room: 'service', build: 'table', mat: 'wood', pkg: 'X4', boq: 'b.furn.bed', material: 'Laminated ply', x: 4.6, y: G, z: -10.8, w: 1.5, d: 0.85, h: 0.75 });
  add({ id: 'serviceStore', name: 'Service storage', room: 'service', build: 'cabinet', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Melamine carcase', x: 7.3, y: G, z: -11.0, w: 0.6, d: 2.4, h: 2.1, doors: 2 });
  add({ id: 'serviceWasher', name: 'Laundry appliances', room: 'service', build: 'appliance', mat: 'steel', pkg: 'I10', boq: 'b.kit.app', material: 'Washer and heat-pump dryer', x: 2.4, y: G, z: -12.6, w: 1.3, d: 0.62, h: 0.86 });

  /* ------------------------------------------------------ master suite ---- */
  add({ id: 'masterBed', name: 'Master bed', room: 'master', build: 'bed', mat: 'fabric', pkg: 'X4', boq: 'b.furn.master', solid: true, material: 'Upholstered four-poster frame, pocket-sprung mattress', x: -6.8, y: F, z: 1.3, w: 2.0, d: 2.2, h: 1.35, face: 'north' });
  for (const side of [-1, 1]) {
    add({ id: `masterSide${side > 0 ? 'R' : 'L'}`, name: 'Bedside table', room: 'master', build: 'cabinet', mat: 'wood', pkg: 'X4', boq: 'b.furn.master', material: 'Walnut with a marble top', x: -6.8 + side * 1.35, y: F, z: 2.2, w: 0.55, d: 0.45, h: 0.58, doors: 1 });
  }
  add({ id: 'masterBench', name: 'Bed-end bench', room: 'master', build: 'sofa', mat: 'fabric', pkg: 'X4', boq: 'b.furn.master', material: 'Velvet on a walnut frame', x: -6.8, y: F, z: -0.15, w: 1.7, d: 0.5, h: 0.48 });
  add({ id: 'masterChair', name: 'Reading chair', room: 'master', build: 'sofa', mat: 'fabric', pkg: 'X4', boq: 'b.furn.master', material: 'Velvet on a walnut frame', x: -9.1, y: F, z: -0.9, w: 0.9, d: 0.9, h: 0.9 });
  add({ id: 'masterRug', name: 'Master carpet', room: 'master', build: 'panel', mat: 'carpet', pkg: 'X7', boq: 'b.rugs', material: 'Hand-knotted silk and wool', x: -6.8, y: F, z: 0.6, w: 4.0, d: 3.4, h: 0.02 });
  add({ id: 'masterChandelier', name: 'Master light fitting', room: 'master', build: 'chandelier', mat: 'brass', pkg: 'X2', boq: 'b.chand.room', emissive: true, material: 'Crystal on an antique-brass frame', x: -6.8, y: 6.9, z: 0.5, w: 0.7, drop: 0.35, h: 0.9 });

  add({ id: 'dressingRunW', name: 'Dressing room joinery', room: 'dressing', build: 'cabinet', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Veneered MDF with internal lighting', x: -9.7, y: F, z: -4.5, w: 0.6, d: 4.4, h: 2.5, doors: 4 });
  add({ id: 'dressingRunE', name: 'Dressing room joinery', room: 'dressing', build: 'cabinet', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Veneered MDF with internal lighting', x: -7.3, y: F, z: -4.5, w: 0.6, d: 4.4, h: 2.5, doors: 4 });
  add({ id: 'dressingIsland', name: 'Dressing island', room: 'dressing', build: 'cabinet', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', material: 'Veneered MDF with a glass top', x: -8.5, y: F, z: -4.5, w: 0.9, d: 1.6, h: 0.9, doors: 2 });

  add({ id: 'masterBath', name: 'Freestanding bath', room: 'masterBath', build: 'bath', mat: 'porcelain', pkg: 'I9', boq: 'b.bath.master', solid: true, material: 'Cast stone, hand-finished', x: -4.3, y: F, z: -2.9, w: 0.85, d: 1.75, h: 0.58 });
  add({ id: 'masterVanity', name: 'Twin vanity', room: 'masterBath', build: 'vanity', mat: 'stone', pkg: 'I9', boq: 'b.bath.master', solid: true, material: 'Marble top with undermounted basins', x: -5.25, y: F, z: -6.7, w: 2.2, d: 0.55, h: 0.84, basins: 2 });
  add({ id: 'masterWc', name: 'Master WC', room: 'masterBath', build: 'wc', mat: 'porcelain', pkg: 'I9', boq: 'b.bath.master', material: 'Wall-hung pan with a concealed cistern', x: -6.7, y: F, z: -3.2, w: 0.4, d: 0.72, h: 0.8 });
  add({ id: 'masterShower', name: 'Shower enclosure', room: 'masterBath', build: 'panel', mat: 'glass', pkg: 'I9', boq: 'b.bath.master', solid: true, material: '10 mm toughened glass on brushed brass', x: -6.1, y: F, z: -5.1, w: 1.7, d: 0.014, h: 2.1 });
  add({ id: 'masterMirror', name: 'Bathroom mirror', room: 'masterBath', build: 'panel', mat: 'brass', pkg: 'I9', boq: 'b.bath.master', material: 'Backlit bevelled mirror', x: -5.25, y: F + 1.05, z: -6.94, w: 2.0, d: 0.05, h: 1.0 });

  /* --------------------------------------------------------- bedrooms ---- */
  bedroom('bed2', 'bed2', 6.9, 1.3, { face: 'north', wx: 9.6, wz: 0.5, ww: 0.6, wd: 2.6, desk: [4.2, 2.0], bedName: 'Bedroom 2 bed' });
  bedroom('bed3', 'bed3', 6.9, -4.4, { face: 'south', wx: 9.6, wz: -4.5, ww: 0.6, wd: 2.6, desk: [4.2, -6.2], bedName: 'Bedroom 3 bed' });
  bedroom('bed4', 'bed4', -2.75, -10.8, { face: 'south', wx: -4.65, wz: -10.7, ww: 0.5, wd: 2.4, bedName: 'Bedroom 4 bed' });
  bedroom('bed5', 'bed5', 1.75, -10.8, { face: 'south', wx: 3.65, wz: -10.7, ww: 0.5, wd: 2.4, bedName: 'Bedroom 5 bed' });

  /* ------------------------------------------------------------- study ---- */
  add({ id: 'studyShelvesW', name: 'Library joinery — west', room: 'study', build: 'shelves', mat: 'wood', pkg: 'X1', boq: 'b.library', solid: true, material: 'Floor-to-ceiling oak with a ladder rail', x: -9.72, y: F, z: -10.7, w: 0.44, d: 3.8, h: 3.1, tiers: 6 });
  add({ id: 'studyShelvesN', name: 'Library joinery — north', room: 'study', build: 'shelves', mat: 'wood', pkg: 'X1', boq: 'b.library', solid: true, material: 'Floor-to-ceiling oak with a ladder rail', x: -7.4, y: F, z: -12.74, w: 4.2, d: 0.44, h: 3.1, tiers: 6 });
  add({ id: 'studyDesk', name: 'Partners desk', room: 'study', build: 'table', mat: 'wood', pkg: 'X4', boq: 'b.furn.office', solid: true, material: 'Leather-topped mahogany', x: -7.3, y: F, z: -10.4, w: 1.9, d: 0.95, h: 0.76 });
  add({ id: 'studyChair', name: 'Desk chair', room: 'study', build: 'chair', mat: 'fabric', pkg: 'X4', boq: 'b.furn.office', material: 'Buttoned leather on castors', x: -7.3, y: F, z: -9.6, w: 0.6, d: 0.6, h: 1.05 });
  for (let i = 0; i < 2; i += 1) {
    add({ id: `studyReader${i}`, name: 'Reading chair', room: 'study', build: 'sofa', mat: 'fabric', pkg: 'X4', boq: 'b.furn.office', material: 'Buttoned leather', x: -6.1 + i * 0.02, y: F, z: -12.0 + i * 1.15, w: 0.85, d: 0.85, h: 0.92 });
  }

  /* ------------------------------------------------------ family room ---- */
  add({ id: 'familySofa', name: 'Family room sofa', room: 'familyRoom', build: 'sofa', mat: 'fabric', pkg: 'X3', boq: 'b.furn.living', solid: true, material: 'Performance weave', x: 6.0, y: F, z: -9.0, w: 2.3, d: 0.95, h: 0.82 });
  add({ id: 'familyTable', name: 'Family room table', room: 'familyRoom', build: 'table', mat: 'wood', pkg: 'X3', boq: 'b.furn.living', material: 'Oak', x: 6.0, y: F, z: -10.4, w: 1.1, d: 0.65, h: 0.40 });
  add({ id: 'familyTv', name: 'Television', room: 'familyRoom', build: 'panel', mat: 'steel', pkg: 'X5', boq: 'b.theatre', material: '65-inch 4K OLED', x: 6.0, y: F + 0.95, z: -12.7, w: 1.5, d: 0.07, h: 0.86 });

  /* ----------------------------------------------------- home cinema ----- */
  add({ id: 'theatreScreen', name: 'Projection screen', room: 'theatre', build: 'panel', mat: 'steel', pkg: 'X5', boq: 'b.theatre', material: 'Acoustically transparent 3.4 m screen', x: -5.0, y: B + 0.85, z: -6.72, w: 3.4, d: 0.09, h: 1.92 });
  add({ id: 'theatreRow1', name: 'Cinema seating — front row', room: 'theatre', build: 'cinemaRow', mat: 'fabric', pkg: 'X5', boq: 'b.theatre', solid: true, material: 'Motorised leather recliners', x: -5.0, y: B, z: -3.4, w: 3.4, d: 1.15, seats: 4, riser: 0 });
  add({ id: 'theatreRow2', name: 'Cinema seating — back row', room: 'theatre', build: 'cinemaRow', mat: 'fabric', pkg: 'X5', boq: 'b.theatre', solid: true, material: 'Motorised leather recliners', x: -5.0, y: B, z: -1.7, w: 3.4, d: 1.15, seats: 4, riser: 0.30 });
  add({ id: 'theatreProjector', name: 'Laser projector', room: 'theatre', build: 'appliance', mat: 'steel', pkg: 'X5', boq: 'b.theatre', material: '4K triple-laser projector, ceiling mounted', x: -5.0, y: B + 2.25, z: 0.2, w: 0.5, d: 0.42, h: 0.22 });

  /* ------------------------------------------------------ gymnasium ------ */
  add({ id: 'gymMirror', name: 'Mirrored wall', room: 'gym', build: 'panel', mat: 'glass', pkg: 'X6', boq: 'b.gym', material: '6 mm silvered float glass', x: 6.75, y: B + 0.35, z: -6.82, w: 5.2, d: 0.02, h: 2.0 });
  for (let i = 0; i < 2; i += 1) {
    add({ id: `gymTreadmill${i}`, name: 'Treadmill', room: 'gym', build: 'treadmill', mat: 'steel', pkg: 'X6', boq: 'b.gym', solid: true, material: 'Commercial slat-belt treadmill', x: 4.8 + i * 1.5, y: B, z: -5.2, w: 0.9, d: 1.9 });
  }
  add({ id: 'gymWeights', name: 'Weight rack', room: 'gym', build: 'weights', mat: 'steel', pkg: 'X6', boq: 'b.gym', solid: true, material: 'Powder-coated steel with rubber hex dumbbells', x: 8.6, y: B, z: -4.4, w: 0.5, d: 2.2 });
  add({ id: 'gymBench', name: 'Weight bench', room: 'gym', build: 'sofa', mat: 'fabric', pkg: 'X6', boq: 'b.gym', material: 'Upholstered adjustable bench', x: 6.8, y: B, z: -3.2, w: 0.42, d: 1.3, h: 0.48 });
  add({ id: 'gymMat', name: 'Exercise flooring', room: 'gym', build: 'panel', mat: 'carpet', pkg: 'X6', boq: 'b.gym', material: 'Bonded rubber tile, 12 mm', x: 6.6, y: B, z: -0.8, w: 4.0, d: 2.6, h: 0.014 });

  /* ----------------------------------------------------------- sauna ----- */
  add({ id: 'saunaBench', name: 'Sauna benching', room: 'sauna', build: 'cabinet', mat: 'wood', pkg: 'X6', boq: 'b.sauna', solid: true, material: 'Nordic spruce, kiln-dried', x: 5.7, y: B, z: -10.6, w: 3.6, d: 0.6, h: 0.62, doors: 0, plinth: 0 });
  add({ id: 'saunaHeater', name: 'Sauna heater', room: 'sauna', build: 'plant', mat: 'steel', pkg: 'X6', boq: 'b.sauna', material: 'Electric heater with olivine stones', x: 4.1, y: B, z: -8.2, w: 0.5, d: 0.5, h: 0.75 });

  /* ------------------------------------------------------------ cellar --- */
  add({ id: 'cellarRacks', name: 'Wine racking', room: 'cellar', build: 'shelves', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Oak bottle racking, climate controlled', x: -1.7, y: B, z: -9.0, w: 0.44, d: 3.2, h: 2.1, tiers: 6, books: false });
  add({ id: 'cellarStore', name: 'Cellar shelving', room: 'cellar', build: 'shelves', mat: 'steel', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Galvanised steel shelving', x: 3.2, y: B, z: -9.0, w: 0.44, d: 3.2, h: 2.1, tiers: 4, books: false });

  /* ------------------------------------------------------- plant room ---- */
  add({ id: 'plantGenerator', name: 'Standby generator', room: 'plant', build: 'plant', mat: 'steel', pkg: 'M7', boq: 'b.generator', solid: true, material: '100 kVA diesel set in an acoustic canopy', x: -6.6, y: B, z: -9.4, w: 2.3, d: 1.1, h: 1.6 });
  add({ id: 'plantFilter', name: 'Water treatment plant', room: 'plant', build: 'plant', mat: 'steel', pkg: 'M3', boq: 'b.filter', solid: true, material: 'Multimedia filtration and softening', x: -3.6, y: B, z: -9.4, w: 1.6, d: 0.9, h: 1.8 });
  add({ id: 'plantBattery', name: 'Battery storage', room: 'plant', build: 'plant', mat: 'steel', pkg: 'M7', boq: 'b.battery', solid: true, material: '40 kWh lithium bank with a BMS', x: -6.6, y: B, z: -7.7, w: 1.4, d: 0.5, h: 1.7 });
  add({ id: 'plantBoards', name: 'Main distribution boards', room: 'plant', build: 'panel', mat: 'steel', pkg: 'M2', boq: 'b.db', material: 'Six-way boards with MCB and RCD protection', x: -2.3, y: B + 0.9, z: -9.0, w: 0.16, d: 2.0, h: 1.2 });

  /* ----------------------------------------------------------- garage ---- */
  for (let i = 0; i < 2; i += 1) {
    add({ id: `garageCar${i}`, name: i === 0 ? 'Saloon' : 'Estate', room: null, roomName: 'Garage', build: 'car', mat: 'steel', pkg: 'X4', boq: null, solid: true, costPKR: 0, material: 'Client vehicle — not part of the contract', x: -14.75 + i * 3.2, y: GARAGE.floor, z: 0.3, w: 1.85, d: 4.6, h: 1.5, note: 'Shown for scale. Vehicles are the client\\u2019s and carry no cost in the bill of quantities.' });
  }
  add({ id: 'garageBench', name: 'Workbench', room: null, roomName: 'Garage', build: 'worktop', mat: 'wood', pkg: 'X1', boq: 'b.wardrobe', solid: true, material: 'Hardwood top on a steel frame', x: -13.2, y: GARAGE.floor, z: -2.6, w: 2.6, d: 0.6, h: 0.9 });

  /* -------------------------------------------------- terrace and pool --- */
  add({ id: 'terraceTable', name: 'Terrace table', room: null, roomName: 'Portico terrace', build: 'table', mat: 'wood', pkg: 'X7', boq: 'b.furn.outdoor', material: 'Teak with a powder-coated frame', x: 0, y: PORTICO.terraceLevel, z: 4.9, w: 1.5, d: 0.9, h: 0.74 });
  for (let i = 0; i < 4; i += 1) {
    add({ id: `terraceChair${i}`, name: 'Terrace chair', room: null, roomName: 'Portico terrace', build: 'chair', mat: 'fabric', pkg: 'X7', boq: 'b.furn.outdoor', material: 'Teak with an all-weather sling', x: (i < 2 ? -1.05 : 1.05), y: PORTICO.terraceLevel, z: 4.55 + (i % 2) * 0.7, w: 0.5, d: 0.5, h: 0.95 });
  }
  for (let i = 0; i < 4; i += 1) {
    add({ id: `poolLounger${i}`, name: 'Sun lounger', room: null, roomName: 'Pool deck', build: 'lounger', mat: 'fabric', pkg: 'X7', boq: 'b.furn.outdoor', material: 'All-weather sling on a powder-coated frame', x: 16.0, y: SITE_LEVEL + 0.04, z: -7.0 + i * 2.3, w: 0.72, d: 1.95 });
  }
  add({ id: 'poolTable', name: 'Poolside table', room: null, roomName: 'Pool deck', build: 'table', mat: 'wood', pkg: 'X7', boq: 'b.furn.outdoor', material: 'Teak', x: 11.2, y: SITE_LEVEL + 0.04, z: 1.6, w: 0.8, d: 0.8, h: 0.5 });

  return items;
}

/** Which merge material each kit material maps to. */
const MATERIAL_OF = {
  fabric: 'upholstery',
  wood: 'woodDark',
  stone: 'marbleWhite',
  brass: 'brass',
  steel: 'steel',
  carpet: 'carpet',
  glass: 'glassClear',
  porcelain: 'tile',
};

export function buildFurnishings(ctx) {
  const { scene, materials, collision, tile, project } = ctx;
  const root = new THREE.Group();
  root.name = 'furnishings';
  scene.add(root);

  const items = furnishingSchedule();
  const groups = new Map();
  const interactives = [];
  const elements = [];

  for (const item of items) {
    const surface = MATERIAL_OF[item.mat] || 'woodDark';
    const key = `${surface}|${item.pkg}`;
    let group = groups.get(key);
    if (!group) {
      group = { surface, pkg: item.pkg, builder: createSurfaceBuilder(tile(surface)), emissive: false };
      groups.set(key, group);
    }
    if (item.emissive) group.emissive = true;

    const builder = KIT[item.build];
    if (!builder) throw new Error(`furnishing ${item.id} uses unknown builder "${item.build}"`);
    builder(group.builder, item);

    // Collision only for things you could walk into; a rug or a mirror is not
    // an obstacle, and making it one is how a room stops feeling walkable.
    const handles = [];
    if (item.solid) {
      const h = item.h || 0.8;
      handles.push(collision.add(
        item.x - item.w / 2, item.y, item.z - item.d / 2,
        item.x + item.w / 2, item.y + h, item.z + item.d / 2,
        `furn:${item.id}`,
      ));
    }

    const height = item.h || 0.9;
    const hotspot = new THREE.Vector3(item.x, item.y + height * 0.5, item.z);
    const bounds = {
      min: new THREE.Vector3(item.x - item.w / 2 - 0.05, item.y - 0.05, item.z - item.d / 2 - 0.05),
      max: new THREE.Vector3(item.x + item.w / 2 + 0.05, item.y + height + 0.05, item.z + item.d / 2 + 0.05),
    };
    interactives.push({
      id: item.id,
      name: item.name,
      kind: 'object',
      pkg: item.pkg,
      boq: item.boq || null,
      costPKR: item.costPKR,
      room: item.room || null,
      roomName: item.roomName || null,
      material: item.material,
      dimensions: [item.w, height, item.d],
      hotspot,
      bounds,
      normal: new THREE.Vector3(0, 0, 1),
      note: item.note || '',
      collisionHandles: handles,
      groupKey: key,
      meshes: [],
    });
  }

  // One mesh per material and package.
  for (const [key, group] of groups) {
    const geometry = group.builder.build();
    if (!geometry.getAttribute('position').count) {
      geometry.dispose();
      continue;
    }
    const material = materials.make(group.surface, group.emissive
      ? { emissive: 0xffe2b0, emissiveIntensity: 0 }
      : {});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `furnish:${key}`;
    mesh.userData.pkg = group.pkg;
    mesh.userData.layer = 'joinery';
    root.add(mesh);

    const members = interactives.filter((i) => i.groupKey === key);
    for (const member of members) member.meshes = [mesh];

    elements.push({
      name: `furnish:${key}`,
      pkg: group.pkg,
      layer: 'joinery',
      mesh,
      material,
      reveal: null,
      collision: [],
      emissive: group.emissive,
      setVisible(v) {
        mesh.visible = v;
        for (const member of members) {
          member.installed = v;
          for (const h of member.collisionHandles) collision.setEnabled(h, v);
        }
      },
    });
  }

  collision.build();

  return { root, elements, interactives, items };
}
