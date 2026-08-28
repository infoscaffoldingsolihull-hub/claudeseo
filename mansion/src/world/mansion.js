/**
 * The building itself: walls, slabs, columns, stairs, portico, roof and dome.
 *
 * Walls are *derived*, not authored.  Every room contributes its four edges;
 * edges on the same line are unioned, then split at every room corner on that
 * level, so each resulting segment has one room on each side and can take that
 * room's own wall finish.  A partition between two rooms is emitted exactly
 * once, and a wall that runs past three rooms is one continuous run of
 * masonry with three different finishes applied to its inner face.
 *
 * Every wall is built in three physical layers, because that is how it is
 * actually built and because it is what makes the construction timeline
 * legible:
 *
 *     ┌────┬──────────┬────┐
 *     │ E4 │    E1    │ I1 │      E4  sandstone cladding   (façade package)
 *     │    │  masonry │    │      E1  brick core          (masonry package)
 *     └────┴──────────┴────┘      I1  plaster / panelling (finishes package)
 *
 * Scrub the timeline back to the envelope phase and the house is bare brick
 * with scaffolding on it; scrub forward and the cladding and the plaster
 * arrive as their packages earn value.
 */
import * as THREE from 'three';
import {
  ROOMS, LEVELS, LEVEL_BY_ID, SLAB, SHELL, ROOF, GARAGE, PORTICO, THICKNESS,
  DOORS, WINDOW_RUNS, GARAGE_WINDOWS, GARAGE_DOORS, SLAB_HOLES, STAIRS, LANDINGS,
  LIFT, SITE_LEVEL, roomArea,
} from './plan.js';
import {
  createSurfaceBuilder, unionIntervals, splitIntervals, wallPieces, subtractRects,
  columnGeometry, balusterGeometry, domeGeometry,
} from './build.js';

/** Which work package pays for which piece of the building. */
export const PKG = {
  raft: 'S4',
  retaining: 'S5',
  groundSlab: 'S7',
  colGround: 'F1',
  firstSlab: 'F2',
  colFirst: 'F3',
  roofSlab: 'F4',
  stairs: 'F5',
  portico: 'F6',
  parapet: 'F7',
  masonryGround: 'E1',
  masonryFirst: 'E2',
  roofFinish: 'E3',
  facade: 'E4',
  cornice: 'E5',
  glazing: 'E6',
  extDoors: 'E7',
  plaster: 'I1',
  floorStone: 'I3',
  floorOther: 'I4',
  ceiling: 'I5',
  intDoors: 'I6',
  panelling: 'I7',
};

/**
 * X-ray layers: what survives when the finishes are stripped away.
 *
 * Exactly four systems carry a colour identity here, and the four hues are a
 * validated categorical set — every pair separated under simulated protan and
 * deutan vision as well as normal vision, on this surface (worst pair ΔE 15.5
 * simulated, 23.1 normal). Nine control accounts were tried first and
 * rejected: past about seven simultaneous colour classes no palette can keep
 * them apart, so accounts are identified by name everywhere else and colour is
 * spent only where four systems must be told apart at a glance.
 */
export const LAYER = {
  ground: { xray: true, viz: '#4a5240', ca: 'CA1', mix: 0.22, label: 'Ground' },
  substructure: { xray: true, viz: '#7a4bd8', ca: 'CA2', label: 'Substructure' },
  frame: { xray: true, viz: '#0ba5cb', ca: 'CA3', label: 'Structural frame' },
  masonry: { xray: true, viz: '#cb7e0b', ca: 'CA4', label: 'Masonry' },
  services: { xray: true, viz: '#cb0b65', ca: 'CA5', label: 'MEP services' },
  facade: { xray: false, viz: '#c2794f', ca: 'CA4', label: 'Façade' },
  finish: { xray: false, viz: '#b06a8c', ca: 'CA6', label: 'Finishes' },
  joinery: { xray: false, viz: '#7b6cc4', ca: 'CA7', label: 'Joinery & FF&E' },
  external: { xray: false, viz: '#6a9a4f', ca: 'CA8', label: 'External works' },
};

/** The layers the x-ray shows, in the order the legend lists them. */
export const XRAY_LEGEND = ['substructure', 'frame', 'masonry', 'services'];

/** Which package a room's wall finish belongs to. */
function finishPackage(surface) {
  if (surface === 'panel' || surface === 'wallpaper' || surface === 'fabric' || surface === 'woodDark') return PKG.panelling;
  if (surface === 'marbleWhite' || surface === 'marbleDark' || surface === 'tile') return PKG.floorStone;
  if (surface === 'concrete') return null; // left as fair-faced concrete
  return PKG.plaster;
}

/** Which package a floor finish belongs to. */
function floorPackage(surface) {
  if (surface === 'marbleWhite' || surface === 'marbleLocal' || surface === 'marbleDark') return PKG.floorStone;
  return PKG.floorOther;
}

/** The room containing a point on a level, or null if the point is outside. */
export function roomAt(levelId, x, z) {
  for (const room of ROOMS) {
    if (room.level !== levelId) continue;
    if (x > room.x0 && x < room.x1 && z > room.z0 && z < room.z1) return room;
  }
  return null;
}

/**
 * Derive the wall segments of one level from its rooms.
 *
 * Returns segments each of which has a single room (or nothing) on each side,
 * so the finish on each face is unambiguous.
 */
export function deriveWallSegments(levelId) {
  const rooms = ROOMS.filter((r) => r.level === levelId);
  const xs = new Set();
  const zs = new Set();
  for (const r of rooms) {
    xs.add(r.x0); xs.add(r.x1);
    zs.add(r.z0); zs.add(r.z1);
  }

  const lines = new Map();
  const push = (axis, at, lo, hi) => {
    const key = `${axis}|${at.toFixed(3)}`;
    const list = lines.get(key) || [];
    list.push([lo, hi]);
    lines.set(key, list);
  };
  for (const r of rooms) {
    push('x', r.z0, r.x0, r.x1);
    push('x', r.z1, r.x0, r.x1);
    push('z', r.x0, r.z0, r.z1);
    push('z', r.x1, r.z0, r.z1);
  }

  const segments = [];
  for (const [key, intervals] of lines) {
    const axis = key[0];
    const at = parseFloat(key.slice(2));
    const parts = splitIntervals(unionIntervals(intervals), axis === 'x' ? [...xs] : [...zs]);
    for (const [u0, u1] of parts) {
      if (u1 - u0 < 0.02) continue;
      const mid = (u0 + u1) / 2;
      const probe = 0.02;
      const neg = axis === 'x' ? roomAt(levelId, mid, at - probe) : roomAt(levelId, at - probe, mid);
      const pos = axis === 'x' ? roomAt(levelId, mid, at + probe) : roomAt(levelId, at + probe, mid);
      if (!neg && !pos) continue;
      segments.push({ level: levelId, axis, at, u0, u1, neg, pos, exterior: !neg || !pos });
    }
  }
  return segments;
}

/** Every window in a run, expanded to individual openings. */
export function expandWindowRun(run) {
  const level = LEVEL_BY_ID.get(run.level);
  const from = run.axis === 'x' ? run.from : run.z0;
  const to = run.axis === 'x' ? run.to : run.z1;
  const span = to - from;
  const out = [];
  for (let i = 0; i < run.count; i += 1) {
    const centre = from + (span * (i + 0.5)) / run.count;
    out.push({
      id: `${run.id}_${i}`,
      runId: run.id,
      level: run.level,
      axis: run.axis,
      at: run.at,
      u: centre,
      x: run.axis === 'x' ? centre : run.at,
      z: run.axis === 'x' ? run.at : centre,
      width: run.width,
      sill: level.floor + run.sill,
      head: level.floor + run.head,
      style: run.style,
      boq: run.boq,
      room: run.room,
      name: `${run.style === 'arch' ? 'Arched window' : 'Casement window'} — ${run.room}`,
    });
  }
  return out;
}

/** All windows, on every level. */
export function allWindows() {
  const out = [];
  for (const run of WINDOW_RUNS) out.push(...expandWindowRun(run));
  return out;
}

export function buildMansion(ctx) {
  const { scene, materials, collision, tile } = ctx;
  const root = new THREE.Group();
  root.name = 'mansion';
  scene.add(root);

  /** Construction elements: the unit the timeline and the x-ray operate on. */
  const elements = [];
  const windows = allWindows();

  /**
   * Register one built thing.
   *
   * reveal: { dir:[x,y,z], min, max } — the plane sweep that builds it
   * boxes:  collision boxes, enabled with the element
   */
  function addElement({ name, pkg, geometry, material, layer, reveal, boxes, cast = true, receive = true, renderOrder }) {
    if (!geometry || geometry.getAttribute('position').count === 0) {
      geometry?.dispose();
      return null;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = name;
    if (renderOrder !== undefined) mesh.renderOrder = renderOrder;
    mesh.userData.pkg = pkg;
    mesh.userData.layer = layer;
    root.add(mesh);

    const handles = [];
    for (const b of boxes || []) {
      handles.push(collision.add(b[0], b[1], b[2], b[3], b[4], b[5], name));
    }
    const element = {
      name, pkg, layer, mesh, material,
      reveal: reveal || null,
      collision: handles,
      baseColour: material.color ? material.color.getHex() : 0xffffff,
    };
    elements.push(element);
    return element;
  }

  /* ------------------------------------------------------------- walls --- */

  /** Openings on a given wall line, for the piece calculation. */
  function openingsOn(levelId, axis, at) {
    const level = LEVEL_BY_ID.get(levelId);
    const out = [];
    for (const door of DOORS) {
      if (door.level !== levelId || door.axis !== axis) continue;
      const lineAt = axis === 'x' ? door.z : door.x;
      if (Math.abs(lineAt - at) > 1e-6) continue;
      out.push({
        u: axis === 'x' ? door.x : door.z,
        width: door.width + 0.04,
        sill: level.floor,
        head: level.floor + door.height,
        door,
      });
    }
    for (const win of windows) {
      if (win.level !== levelId || win.axis !== axis) continue;
      if (Math.abs(win.at - at) > 1e-6) continue;
      out.push({ u: win.u, width: win.width + 0.04, sill: win.sill, head: win.head, window: win });
    }
    return out;
  }

  const wallBuilders = new Map();
  function wallBuilder(key, surface, pkg, layer) {
    let entry = wallBuilders.get(key);
    if (!entry) {
      entry = { surface, pkg, layer, builder: createSurfaceBuilder(tile(surface)), boxes: [] };
      wallBuilders.set(key, entry);
    }
    return entry;
  }

  const wallSegmentIndex = [];

  for (const level of LEVELS) {
    const segments = deriveWallSegments(level.id);
    const y0 = level.floor;
    const y1 = level.wallTop;
    const isBasement = level.id === 'basement';
    const corePkg = isBasement ? PKG.retaining : (level.id === 'ground' ? PKG.masonryGround : PKG.masonryFirst);
    const coreSurface = isBasement ? 'concrete' : 'brick';

    for (const seg of segments) {
      const openings = openingsOn(level.id, seg.axis, seg.at)
        .map((o) => ({ u: o.u, width: o.width, sill: o.sill, head: o.head }));
      const pieces = wallPieces(seg.u0, seg.u1, y0, y1, openings);
      if (!pieces.length) continue;

      const total = seg.exterior ? THICKNESS.exterior : THICKNESS.interior;
      const coreT = seg.exterior ? 0.20 : 0.11;
      const skinT = (total - coreT) / 2;

      // Core masonry.
      const core = wallBuilder(`${level.id}|core`, coreSurface, corePkg, isBasement ? 'substructure' : 'masonry');
      // Skins: one per side, taking that side's room finish.
      const sides = [
        { sign: -1, room: seg.neg },
        { sign: +1, room: seg.pos },
      ];

      for (const piece of pieces) {
        const emit = (target, lo, hi) => {
          if (seg.axis === 'x') target.builder.box(piece.u0, piece.v0, lo, piece.u1, piece.v1, hi);
          else target.builder.box(lo, piece.v0, piece.u0, hi, piece.v1, piece.u1);
        };
        emit(core, seg.at - coreT / 2, seg.at + coreT / 2);

        for (const side of sides) {
          const lo = side.sign < 0 ? seg.at - total / 2 : seg.at + coreT / 2;
          const hi = side.sign < 0 ? seg.at - coreT / 2 : seg.at + total / 2;
          let surface;
          let pkg;
          let layer;
          if (side.room) {
            surface = side.room.wall;
            pkg = finishPackage(surface);
            layer = 'finish';
            if (!pkg) continue; // fair-faced concrete: no skin at all
          } else {
            surface = isBasement ? 'concrete' : 'sandstone';
            pkg = isBasement ? PKG.retaining : PKG.facade;
            layer = isBasement ? 'substructure' : 'facade';
          }
          const target = wallBuilder(`${level.id}|${surface}|${pkg}|${layer}`, surface, pkg, layer);
          emit(target, lo, hi);
        }

        // Collision uses the full thickness, as one box per piece.
        const box = seg.axis === 'x'
          ? [piece.u0, piece.v0, seg.at - total / 2, piece.u1, piece.v1, seg.at + total / 2]
          : [seg.at - total / 2, piece.v0, piece.u0, seg.at + total / 2, piece.v1, piece.u1];
        core.boxes.push(box);
      }

      wallSegmentIndex.push(seg);
    }
  }

  for (const [key, entry] of wallBuilders) {
    const levelId = key.split('|')[0];
    const level = LEVEL_BY_ID.get(levelId);
    addElement({
      name: `wall:${key}`,
      pkg: entry.pkg,
      layer: entry.layer,
      geometry: entry.builder.build(),
      material: materials.make(entry.surface),
      reveal: { dir: [0, 1, 0], min: level.floor, max: level.wallTop },
      boxes: entry.boxes,
    });
  }

  /* ------------------------------------------------------------- slabs --- */

  function holesFor(levelId) {
    return SLAB_HOLES.filter((h) => h.level === levelId);
  }

  // The raft, under the basement.
  {
    const b = createSurfaceBuilder(tile('concrete'));
    const y = -3.0;
    b.box(SHELL.x0 - 0.4, y - SLAB.total, SHELL.z0 - 0.4, SHELL.x1 + 0.4, y - SLAB.finish, SHELL.z1 + 0.4);
    addElement({
      name: 'slab:raft',
      pkg: PKG.raft,
      layer: 'substructure',
      geometry: b.build(),
      material: materials.make('concrete'),
      reveal: { dir: [1, 0, 0], min: SHELL.x0 - 0.4, max: SHELL.x1 + 0.4 },
      boxes: [[SHELL.x0 - 0.4, y - SLAB.total, SHELL.z0 - 0.4, SHELL.x1 + 0.4, y - SLAB.finish, SHELL.z1 + 0.4]],
      cast: false,
    });
  }

  // Suspended slabs: ground floor, first floor and roof.
  const slabSpecs = [
    { level: 'basement', pkg: PKG.groundSlab, name: 'slab:ground' },
    { level: 'ground', pkg: PKG.firstSlab, name: 'slab:first' },
    { level: 'first', pkg: PKG.roofSlab, name: 'slab:roof' },
  ];
  for (const spec of slabSpecs) {
    const level = LEVEL_BY_ID.get(spec.level);
    const b = createSurfaceBuilder(tile('concrete'));
    const top = level.slabTop - SLAB.finish;
    const bottom = level.slabTop - SLAB.total;
    const rects = subtractRects(
      { x0: SHELL.x0, z0: SHELL.z0, x1: SHELL.x1, z1: SHELL.z1 },
      holesFor(spec.level),
    );
    const boxes = [];
    for (const r of rects) {
      b.box(r.x0, bottom, r.z0, r.x1, top, r.z1);
      boxes.push([r.x0, bottom, r.z0, r.x1, top, r.z1]);
    }
    addElement({
      name: spec.name,
      pkg: spec.pkg,
      layer: 'frame',
      geometry: b.build(),
      material: materials.make('concrete'),
      reveal: { dir: [0, 0, -1], min: -SHELL.z1, max: -SHELL.z0 },
      boxes,
    });
  }

  /* ---------------------------------------------------------- columns --- */
  // The frame the x-ray reveals. Columns stand at room corners, which are wall
  // intersections by construction — so a column is always *inside* a wall and
  // can never end up standing in a doorway or free in the middle of a room.
  {
    for (const [levelId, pkg] of [['ground', PKG.colGround], ['first', PKG.colFirst]]) {
      const level = LEVEL_BY_ID.get(levelId);
      const b = createSurfaceBuilder(tile('concrete'));
      const seen = new Set();
      const openings = [
        ...DOORS.filter((d) => d.level === levelId).map((d) => ({ x: d.x, z: d.z, w: d.width })),
        ...windows.filter((w) => w.level === levelId).map((w) => ({ x: w.x, z: w.z, w: w.width })),
      ];
      for (const room of ROOMS) {
        if (room.level !== levelId) continue;
        for (const x of [room.x0, room.x1]) {
          for (const z of [room.z0, room.z1]) {
            const key = `${x.toFixed(2)}|${z.toFixed(2)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // Never obstruct an opening.
            const blocks = openings.some((o) => Math.abs(o.x - x) < o.w / 2 + 0.3 && Math.abs(o.z - z) < o.w / 2 + 0.3);
            if (blocks) continue;
            // Keep the column inside the shell so it does not read as a buttress.
            const cx = Math.min(Math.max(x, SHELL.x0 + 0.16), SHELL.x1 - 0.16);
            const cz = Math.min(Math.max(z, SHELL.z0 + 0.16), SHELL.z1 - 0.16);
            b.boxAt(cx, (level.floor + level.wallTop) / 2, cz, 0.32, level.wallTop - level.floor, 0.32);
          }
        }
      }
      addElement({
        name: `columns:${levelId}`,
        pkg,
        layer: 'frame',
        geometry: b.build(),
        material: materials.make('concrete'),
        reveal: { dir: [0, 1, 0], min: level.floor, max: level.wallTop },
        boxes: [],
        cast: false,
      });
    }
  }

  /* ------------------------------------------- floor and ceiling finishes */
  const floorGroups = new Map();
  const ceilingBuilder = createSurfaceBuilder(tile('plaster'));
  const ceilingBoxes = [];

  for (const room of ROOMS) {
    const level = LEVEL_BY_ID.get(room.level);
    const surface = room.floor;
    const pkg = floorPackage(surface);
    const key = `${surface}|${pkg}`;
    let group = floorGroups.get(key);
    if (!group) {
      group = { surface, pkg, builder: createSurfaceBuilder(tile(surface)), boxes: [] };
      floorGroups.set(key, group);
    }
    const rects = subtractRects(
      { x0: room.x0, z0: room.z0, x1: room.x1, z1: room.z1 },
      room.hole ? [room.hole] : [],
    );
    for (const r of rects) {
      group.builder.box(r.x0, level.floor - SLAB.finish, r.z0, r.x1, level.floor, r.z1);
      group.boxes.push([r.x0, level.floor - SLAB.finish, r.z0, r.x1, level.floor, r.z1]);
    }

    if (room.ceiling) {
      for (const r of rects) {
        ceilingBuilder.box(r.x0, level.wallTop - SLAB.ceiling, r.z0, r.x1, level.wallTop, r.z1);
        ceilingBoxes.push([r.x0, level.wallTop - SLAB.ceiling, r.z0, r.x1, level.wallTop, r.z1]);
      }
    }
  }

  for (const [key, group] of floorGroups) {
    addElement({
      name: `floor:${key}`,
      pkg: group.pkg,
      layer: 'finish',
      geometry: group.builder.build(),
      material: materials.make(group.surface),
      reveal: { dir: [0, 0, -1], min: -SHELL.z1, max: -SHELL.z0 },
      boxes: group.boxes,
      cast: false,
    });
  }
  addElement({
    name: 'ceilings',
    pkg: PKG.ceiling,
    layer: 'finish',
    geometry: ceilingBuilder.build(),
    material: materials.make('plaster', { colour: 0xf4f1ea }),
    reveal: { dir: [0, 0, -1], min: -SHELL.z1, max: -SHELL.z0 },
    boxes: ceilingBoxes,
    cast: false,
  });

  /* -------------------------------------------------------------- stairs */
  {
    const b = createSurfaceBuilder(tile('marbleWhite'));
    const boxes = [];
    let lowest = Infinity;
    let highest = -Infinity;
    for (const stair of STAIRS) {
      const rise = (stair.yEnd - stair.yStart) / stair.risers;
      const going = (stair.zEnd - stair.zStart) / stair.risers;
      for (let i = 0; i < stair.risers; i += 1) {
        const top = stair.yStart + rise * (i + 1);
        const za = stair.zStart + going * i;
        const zb = stair.zStart + going * (i + 1);
        const z0 = Math.min(za, zb);
        const z1 = Math.max(za, zb);
        // Each tread is a solid block down to the flight's underside, which
        // is both how a concrete stair is cast and what makes the collision
        // world's step-up handle it with no special case.
        b.box(stair.x0, stair.yStart - 0.16, z0, stair.x1, top, z1);
        boxes.push([stair.x0, stair.yStart - 0.16, z0, stair.x1, top, z1]);
        lowest = Math.min(lowest, stair.yStart);
        highest = Math.max(highest, stair.yEnd);
      }
    }
    for (const landing of LANDINGS) {
      b.box(landing.x0, landing.y - 0.30, landing.z0, landing.x1, landing.y, landing.z1);
      boxes.push([landing.x0, landing.y - 0.30, landing.z0, landing.x1, landing.y, landing.z1]);
    }
    addElement({
      name: 'stairs',
      pkg: PKG.stairs,
      layer: 'frame',
      geometry: b.build(),
      material: materials.make('marbleWhite'),
      reveal: { dir: [0, 1, 0], min: lowest, max: highest },
      boxes,
    });
  }

  /* ------------------------------------------------------- balustrades -- */
  {
    const railBuilder = createSurfaceBuilder(tile('brass'));
    const balusterGeo = balusterGeometry(0.035, 0.86, 8);
    const balusterMat = materials.make('steel', { colour: 0x2a2c30, roughness: 0.5 });
    const spots = [];
    const boxes = [];

    /** A run of balusters with a handrail on top. */
    const run = (x0, z0, x1, z1, yBase) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const length = Math.hypot(dx, dz);
      const n = Math.max(2, Math.round(length / 0.19));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        spots.push({ x: x0 + dx * t, y: yBase, z: z0 + dz * t });
      }
      // Handrail and bottom rail as thin boxes.
      const pad = 0.03;
      railBuilder.box(
        Math.min(x0, x1) - pad, yBase + 0.86, Math.min(z0, z1) - pad,
        Math.max(x0, x1) + pad, yBase + 0.95, Math.max(z0, z1) + pad,
      );
      railBuilder.box(
        Math.min(x0, x1) - 0.02, yBase, Math.min(z0, z1) - 0.02,
        Math.max(x0, x1) + 0.02, yBase + 0.06, Math.max(z0, z1) + 0.02,
      );
      boxes.push([
        Math.min(x0, x1) - 0.05, yBase, Math.min(z0, z1) - 0.05,
        Math.max(x0, x1) + 0.05, yBase + 0.95, Math.max(z0, z1) + 0.05,
      ]);
    };

    // Around the first-floor stairwell.
    const well = SLAB_HOLES.find((h) => h.level === 'ground' && h.x0 < 0 && h.z0 < -2);
    if (well) {
      run(well.x0, well.z0, well.x1, well.z0, 4.0);
      run(well.x1, well.z0, well.x1, well.z1, 4.0);
      run(well.x0, well.z1, well.x1, well.z1, 4.0);
    }
    // Around the double-height foyer void.
    const voidHole = SLAB_HOLES.find((h) => h.level === 'ground' && h.z1 > 1);
    if (voidHole) {
      run(voidHole.x0, voidHole.z0, voidHole.x1, voidHole.z0, 4.0);
      run(voidHole.x0, voidHole.z1, voidHole.x1, voidHole.z1, 4.0);
      run(voidHole.x0, voidHole.z0, voidHole.x0, voidHole.z1, 4.0);
      run(voidHole.x1, voidHole.z0, voidHole.x1, voidHole.z1, 4.0);
    }
    // Along both flights of the grand stair.
    for (const stair of STAIRS) {
      if (stair.id === 'stairBasement') continue;
      const steps = 14;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const y = stair.yStart + (stair.yEnd - stair.yStart) * t0;
        const za = stair.zStart + (stair.zEnd - stair.zStart) * t0;
        const zb = stair.zStart + (stair.zEnd - stair.zStart) * t1;
        const x = stair.id === 'stairMain1' ? stair.x0 + 0.06 : stair.x1 - 0.06;
        spots.push({ x, y: y + 0.2, z: (za + zb) / 2 });
        railBuilder.box(x - 0.04, y + 1.02, Math.min(za, zb), x + 0.04, y + 1.11, Math.max(za, zb));
      }
    }

    const instanced = new THREE.InstancedMesh(balusterGeo, balusterMat, spots.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.name = 'balusters';
    const m = new THREE.Matrix4();
    for (let i = 0; i < spots.length; i += 1) {
      m.makeTranslation(spots[i].x, spots[i].y, spots[i].z);
      instanced.setMatrixAt(i, m);
    }
    instanced.instanceMatrix.needsUpdate = true;
    instanced.userData.pkg = PKG.intDoors;
    instanced.userData.layer = 'joinery';
    root.add(instanced);
    elements.push({
      name: 'balusters', pkg: PKG.intDoors, layer: 'joinery',
      mesh: instanced, material: balusterMat,
      reveal: { dir: [0, 1, 0], min: 0, max: 5 }, collision: [],
    });

    addElement({
      name: 'handrails',
      pkg: PKG.intDoors,
      layer: 'joinery',
      geometry: railBuilder.build(),
      material: materials.make('brass'),
      reveal: { dir: [0, 1, 0], min: 0, max: 5 },
      boxes,
    });
  }

  /* --------------------------------------------------------- the portico */
  {
    const stoneB = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];
    const porchY = 0;

    // Porch floor and the three entrance steps.
    stoneB.box(PORTICO.x0 - 0.6, porchY - 0.30, PORTICO.z0, PORTICO.x1 + 0.6, porchY, PORTICO.z1 + 0.4);
    boxes.push([PORTICO.x0 - 0.6, porchY - 0.30, PORTICO.z0, PORTICO.x1 + 0.6, porchY, PORTICO.z1 + 0.4]);
    const steps = [
      [PORTICO.z1 + 0.4, PORTICO.z1 + 0.75, -0.15],
      [PORTICO.z1 + 0.75, PORTICO.z1 + 1.10, -0.30],
    ];
    for (const [z0, z1, top] of steps) {
      stoneB.box(PORTICO.x0 - 0.9, SITE_LEVEL, z0, PORTICO.x1 + 0.9, top, z1);
      boxes.push([PORTICO.x0 - 0.9, SITE_LEVEL, z0, PORTICO.x1 + 0.9, top, z1]);
    }

    // Entablature over the columns, and the terrace slab at first-floor level.
    stoneB.box(PORTICO.x0 - 0.35, PORTICO.columnTop, PORTICO.z0, PORTICO.x1 + 0.35, PORTICO.entablatureTop, PORTICO.z1 + 0.35);
    boxes.push([PORTICO.x0 - 0.35, PORTICO.columnTop, PORTICO.z0, PORTICO.x1 + 0.35, PORTICO.entablatureTop, PORTICO.z1 + 0.35]);
    stoneB.box(PORTICO.x0, PORTICO.terraceLevel - 0.34, PORTICO.z0, PORTICO.x1, PORTICO.terraceLevel, PORTICO.z1);
    boxes.push([PORTICO.x0, PORTICO.terraceLevel - 0.34, PORTICO.z0, PORTICO.x1, PORTICO.terraceLevel, PORTICO.z1]);

    // Pediment: a stepped triangle, mirrored about the centre line.
    const pedZ0 = PORTICO.z1 - 0.5;
    const pedZ1 = PORTICO.z1 + 0.35;
    const tiers = 9;
    for (let i = 0; i < tiers; i += 1) {
      const t = i / tiers;
      const t2 = (i + 1) / tiers;
      const halfWidth = (PORTICO.x1 + 0.35) * (1 - t);
      const yLo = PORTICO.entablatureTop + (PORTICO.pedimentTop - PORTICO.entablatureTop) * t;
      const yHi = PORTICO.entablatureTop + (PORTICO.pedimentTop - PORTICO.entablatureTop) * t2;
      stoneB.box(-halfWidth, yLo, pedZ0, halfWidth, yHi, pedZ1);
    }

    addElement({
      name: 'portico:stone',
      pkg: PKG.portico,
      layer: 'facade',
      geometry: stoneB.build(),
      material: materials.make('sandstone'),
      reveal: { dir: [0, 1, 0], min: SITE_LEVEL, max: PORTICO.pedimentTop },
      boxes,
    });

    // The eight columns of the order.
    const colGeo = columnGeometry(PORTICO.columnRadius, PORTICO.columnTop - PORTICO.columnBase, 22);
    const colMat = materials.make('sandstone', { colour: 0xe8dcc4 });
    const positions = [];
    for (const x of PORTICO.frontRow) positions.push({ x, z: PORTICO.returnZ[1] });
    positions.push({ x: PORTICO.frontRow[0], z: PORTICO.returnZ[0] });
    positions.push({ x: PORTICO.frontRow[PORTICO.frontRow.length - 1], z: PORTICO.returnZ[0] });

    const cols = new THREE.InstancedMesh(colGeo, colMat, positions.length);
    cols.castShadow = true;
    cols.receiveShadow = true;
    cols.name = 'portico:columns';
    const mat4 = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i += 1) {
      mat4.makeTranslation(positions[i].x, PORTICO.columnBase, positions[i].z);
      cols.setMatrixAt(i, mat4);
      collision.add(
        positions[i].x - 0.42, PORTICO.columnBase, positions[i].z - 0.42,
        positions[i].x + 0.42, PORTICO.columnTop, positions[i].z + 0.42, 'portico:column',
      );
    }
    cols.instanceMatrix.needsUpdate = true;
    cols.userData.pkg = PKG.portico;
    cols.userData.layer = 'facade';
    root.add(cols);
    elements.push({
      name: 'portico:columns', pkg: PKG.portico, layer: 'facade',
      mesh: cols, material: colMat,
      reveal: { dir: [0, 1, 0], min: 0, max: PORTICO.columnTop }, collision: [],
    });
  }

  /* ---------------------------------------------------------- roof works */
  {
    // Waterproofing and screed on the roof slab.
    const roofB = createSurfaceBuilder(tile('roofScreed'));
    const rects = subtractRects(
      { x0: SHELL.x0, z0: SHELL.z0, x1: SHELL.x1, z1: SHELL.z1 },
      SLAB_HOLES.filter((h) => h.level === 'first'),
    );
    const boxes = [];
    for (const r of rects) {
      roofB.box(r.x0, ROOF.level - SLAB.finish, r.z0, r.x1, ROOF.level, r.z1);
      boxes.push([r.x0, ROOF.level - SLAB.finish, r.z0, r.x1, ROOF.level, r.z1]);
    }
    addElement({
      name: 'roof:finish',
      pkg: PKG.roofFinish,
      layer: 'finish',
      geometry: roofB.build(),
      material: materials.make('roofScreed'),
      reveal: { dir: [1, 0, 0], min: SHELL.x0, max: SHELL.x1 },
      boxes,
      cast: false,
    });

    // Parapet and cornice.
    const parapetB = createSurfaceBuilder(tile('sandstone'));
    const pBoxes = [];
    const t = ROOF.parapetThickness;
    const ring = [
      [SHELL.x0 - t, SHELL.z0 - t, SHELL.x1 + t, SHELL.z0],
      [SHELL.x0 - t, SHELL.z1, SHELL.x1 + t, SHELL.z1 + t],
      [SHELL.x0 - t, SHELL.z0, SHELL.x0, SHELL.z1],
      [SHELL.x1, SHELL.z0, SHELL.x1 + t, SHELL.z1],
    ];
    for (const [x0, z0, x1, z1] of ring) {
      parapetB.box(x0, ROOF.level, z0, x1, ROOF.parapetTop, z1);
      pBoxes.push([x0, ROOF.level, z0, x1, ROOF.parapetTop, z1]);
      // Moulded coping oversailing the parapet.
      parapetB.box(x0 - 0.09, ROOF.parapetTop, z0 - 0.09, x1 + 0.09, ROOF.parapetTop + 0.14, z1 + 0.09);
    }
    // A cornice band under the parapet, running the whole elevation.
    for (const [x0, z0, x1, z1] of ring) {
      parapetB.box(x0 - 0.22, ROOF.level - 0.55, z0 - 0.22, x1 + 0.22, ROOF.level - 0.20, z1 + 0.22);
    }
    addElement({
      name: 'roof:parapet',
      pkg: PKG.parapet,
      layer: 'facade',
      geometry: parapetB.build(),
      material: materials.make('sandstone'),
      reveal: { dir: [0, 1, 0], min: ROOF.level - 0.55, max: ROOF.parapetTop + 0.14 },
      boxes: pBoxes,
    });

    // The cupola: a square base, a colonnaded drum, a ribbed dome and a finial.
    const domeB = createSurfaceBuilder(tile('sandstone'));
    const c = ROOF.domeCentre;
    domeB.boxAt(c.x, (ROOF.level + ROOF.drumBottom) / 2, c.z,
      ROOF.domeRadius * 2.5, ROOF.drumBottom - ROOF.level, ROOF.domeRadius * 2.5);
    addElement({
      name: 'roof:cupolaBase',
      pkg: PKG.parapet,
      layer: 'facade',
      geometry: domeB.build(),
      material: materials.make('sandstone'),
      reveal: { dir: [0, 1, 0], min: ROOF.level, max: ROOF.drumBottom },
      boxes: [[c.x - ROOF.domeRadius * 1.25, ROOF.level, c.z - ROOF.domeRadius * 1.25,
        c.x + ROOF.domeRadius * 1.25, ROOF.drumBottom, c.z + ROOF.domeRadius * 1.25]],
    });

    const drumGroup = new THREE.Group();
    drumGroup.name = 'roof:cupola';
    const stoneMat = materials.make('sandstone', { colour: 0xeadfc8 });
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOF.domeRadius, ROOF.domeRadius, ROOF.drumTop - ROOF.drumBottom, 24, 1, true),
      stoneMat,
    );
    drum.position.set(c.x, (ROOF.drumBottom + ROOF.drumTop) / 2, c.z);
    drum.castShadow = true;
    drumGroup.add(drum);

    const dome = new THREE.Mesh(
      domeGeometry(ROOF.domeRadius * 1.06, ROOF.domeTop - ROOF.drumTop, 28),
      materials.make('sandstone', { colour: 0xd9c9a6 }),
    );
    dome.position.set(c.x, ROOF.drumTop, c.z);
    dome.castShadow = true;
    drumGroup.add(dome);

    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, ROOF.finialTop - ROOF.domeTop, 12),
      materials.make('brass'),
    );
    finial.position.set(c.x, (ROOF.domeTop + ROOF.finialTop) / 2, c.z);
    finial.castShadow = true;
    drumGroup.add(finial);

    root.add(drumGroup);
    elements.push({
      name: 'roof:cupola', pkg: PKG.parapet, layer: 'facade',
      mesh: drumGroup, material: stoneMat, group: true,
      reveal: { dir: [0, 1, 0], min: ROOF.drumBottom, max: ROOF.finialTop }, collision: [],
    });
    collision.add(c.x - ROOF.domeRadius, ROOF.drumBottom, c.z - ROOF.domeRadius,
      c.x + ROOF.domeRadius, ROOF.drumTop, c.z + ROOF.domeRadius, 'cupola');
  }

  /* -------------------------------------------------------- the garage -- */
  {
    const b = createSurfaceBuilder(tile('brick'));
    const skin = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];
    const t = THICKNESS.exterior;
    const y0 = GARAGE.floor;
    const y1 = GARAGE.wallTop;

    const garageOpenings = {
      // The south face carries the two sectional doors.
      south: GARAGE_DOORS.map((d) => ({ u: d.x, width: d.width + 0.06, sill: y0, head: y0 + d.height })),
      west: GARAGE_WINDOWS.map((w) => ({ u: w.z, width: w.width + 0.04, sill: y0 + w.sill, head: y0 + w.head })),
    };

    const walls = [
      { axis: 'x', at: GARAGE.z1, u0: GARAGE.x0, u1: GARAGE.x1, openings: garageOpenings.south },
      { axis: 'x', at: GARAGE.z0, u0: GARAGE.x0, u1: GARAGE.x1, openings: [] },
      { axis: 'z', at: GARAGE.x0, u0: GARAGE.z0, u1: GARAGE.z1, openings: garageOpenings.west },
    ];
    for (const w of walls) {
      for (const piece of wallPieces(w.u0, w.u1, y0, y1, w.openings)) {
        if (w.axis === 'x') {
          b.box(piece.u0, piece.v0, w.at - t / 2, piece.u1, piece.v1, w.at + t / 2);
          skin.box(piece.u0, piece.v0, w.at - t / 2 - 0.06, piece.u1, piece.v1, w.at - t / 2);
          skin.box(piece.u0, piece.v0, w.at + t / 2, piece.u1, piece.v1, w.at + t / 2 + 0.06);
          boxes.push([piece.u0, piece.v0, w.at - t / 2 - 0.06, piece.u1, piece.v1, w.at + t / 2 + 0.06]);
        } else {
          b.box(w.at - t / 2, piece.v0, piece.u0, w.at + t / 2, piece.v1, piece.u1);
          skin.box(w.at - t / 2 - 0.06, piece.v0, piece.u0, w.at - t / 2, piece.v1, piece.u1);
          boxes.push([w.at - t / 2 - 0.06, piece.v0, piece.u0, w.at + t / 2, piece.v1, piece.u1]);
        }
      }
    }

    // Slab, floor and parapet.
    b.box(GARAGE.x0 - 0.2, GARAGE.slabTop - SLAB.total, GARAGE.z0 - 0.2, GARAGE.x1, GARAGE.slabTop, GARAGE.z1 + 0.2);
    boxes.push([GARAGE.x0 - 0.2, GARAGE.slabTop - SLAB.total, GARAGE.z0 - 0.2, GARAGE.x1, GARAGE.slabTop, GARAGE.z1 + 0.2]);
    skin.box(GARAGE.x0 - 0.3, GARAGE.slabTop, GARAGE.z0 - 0.3, GARAGE.x1, GARAGE.parapetTop, GARAGE.z0 - 0.02);
    skin.box(GARAGE.x0 - 0.3, GARAGE.slabTop, GARAGE.z1 + 0.02, GARAGE.x1, GARAGE.parapetTop, GARAGE.z1 + 0.3);
    skin.box(GARAGE.x0 - 0.3, GARAGE.slabTop, GARAGE.z0 - 0.3, GARAGE.x0 - 0.02, GARAGE.parapetTop, GARAGE.z1 + 0.3);

    addElement({
      name: 'garage:masonry',
      pkg: PKG.masonryGround,
      layer: 'masonry',
      geometry: b.build(),
      material: materials.make('brick'),
      reveal: { dir: [0, 1, 0], min: y0, max: GARAGE.parapetTop },
      boxes,
    });
    addElement({
      name: 'garage:facade',
      pkg: PKG.facade,
      layer: 'facade',
      geometry: skin.build(),
      material: materials.make('sandstone'),
      reveal: { dir: [0, 1, 0], min: y0, max: GARAGE.parapetTop },
      boxes: [],
    });

    // Garage floor slab and its finish.
    const floorB = createSurfaceBuilder(tile('epoxy'));
    floorB.box(GARAGE.x0, GARAGE.floor - SLAB.finish, GARAGE.z0, GARAGE.x1, GARAGE.floor, GARAGE.z1);
    addElement({
      name: 'garage:floor',
      pkg: PKG.floorOther,
      layer: 'finish',
      geometry: floorB.build(),
      material: materials.make('epoxy'),
      reveal: { dir: [1, 0, 0], min: GARAGE.x0, max: GARAGE.x1 },
      boxes: [[GARAGE.x0, GARAGE.floor - 0.4, GARAGE.z0, GARAGE.x1, GARAGE.floor, GARAGE.z1]],
      cast: false,
    });
  }

  /* ------------------------------------------------------ the lift shaft */
  {
    const b = createSurfaceBuilder(tile('concrete'));
    const boxes = [];
    const bottom = LEVEL_BY_ID.get('basement').floor - 0.4;
    const top = LEVEL_BY_ID.get('first').wallTop;
    const t = 0.2;
    const walls = [
      [LIFT.x0 - t, LIFT.z0 - t, LIFT.x1 + t, LIFT.z0],
      [LIFT.x0 - t, LIFT.z1, LIFT.x1 + t, LIFT.z1 + t],
      [LIFT.x1, LIFT.z0, LIFT.x1 + t, LIFT.z1],
    ];
    for (const [x0, z0, x1, z1] of walls) {
      b.box(x0, bottom, z0, x1, top, z1);
      boxes.push([x0, bottom, z0, x1, top, z1]);
    }
    addElement({
      name: 'liftShaft',
      pkg: PKG.stairs,
      layer: 'frame',
      geometry: b.build(),
      material: materials.make('concrete'),
      reveal: { dir: [0, 1, 0], min: bottom, max: top },
      boxes,
    });
  }

  collision.build();

  return {
    root,
    elements,
    windows,
    wallSegments: wallSegmentIndex,
    stats: {
      rooms: ROOMS.length,
      windows: windows.length,
      doors: DOORS.length + GARAGE_DOORS.length,
      area: ROOMS.reduce((s, r) => s + roomArea(r), 0),
    },
  };
}
