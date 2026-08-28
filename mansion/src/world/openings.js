/**
 * Doors, windows, garage doors, the main gate and the lift — everything in the
 * mansion that moves.
 *
 * Each opening is built in a canonical frame — the wall runs along local X, the
 * wall's outward normal is local +Z, the opening's sill is at local y = 0 —
 * and the whole group is then placed and rotated to sit in its wall.  That one
 * decision removes an entire class of bug: hinge direction, swing side, sill
 * projection and architrave depth are all reasoned about once, in a frame
 * where "left" and "outward" mean something fixed.
 *
 * Every opening also carries a **lining**: a box that wraps the reveal through
 * the full thickness of the wall.  Without it you can see the raw brick core
 * of the wall through the door jamb, which is exactly what a real door lining
 * exists to hide.
 *
 * Openings are solid when closed and open when open: the collision box is
 * switched with the animation, so an open door is a doorway and a closed one
 * is a wall.
 */
import * as THREE from 'three';
import {
  DOORS, GARAGE_DOORS, GARAGE_WINDOWS, GARAGE, LEVEL_BY_ID, THICKNESS,
  PLOT, SITE_LEVEL, LIFT, ROOMS,
} from './plan.js';
import { createSurfaceBuilder } from './build.js';
import { allWindows, PKG } from './mansion.js';
import { clamp, smoothstep } from '../engine/rng.js';

/** How far a hinged leaf swings, in radians. */
const SWING = THREE.MathUtils.degToRad(96);
const GATE_SWING = THREE.MathUtils.degToRad(88);

/** Build one door leaf — slab, raised panels and handle — as one geometry. */
function leafGeometry(width, height, thickness, panelled, handleSide) {
  const b = createSurfaceBuilder(1.2);
  // The slab runs from the hinge (local x = 0) to the free edge.
  b.box(0, 0, -thickness / 2, width, height, thickness / 2);
  if (panelled) {
    // Two raised panels, proud of the slab on both faces.
    const inset = Math.min(0.14, width * 0.16);
    const rows = height > 2.2 ? 3 : 2;
    const gap = 0.09;
    const usable = height - inset * 2 - gap * (rows - 1);
    for (let r = 0; r < rows; r += 1) {
      const y0 = inset + r * (usable / rows + gap);
      const y1 = y0 + usable / rows;
      for (const side of [-1, 1]) {
        b.box(inset, y0, side * thickness / 2, width - inset, y1, side * (thickness / 2 + 0.014));
      }
    }
  }
  // Handle and backplate on the free edge.
  const hx = handleSide === 'free' ? width - 0.09 : 0.09;
  for (const side of [-1, 1]) {
    b.box(hx - 0.035, height * 0.46, side * thickness / 2, hx + 0.035, height * 0.54, side * (thickness / 2 + 0.022));
    b.box(hx - 0.10, height * 0.485, side * (thickness / 2 + 0.018), hx + 0.02, height * 0.515, side * (thickness / 2 + 0.042));
  }
  return b.build();
}

/** A glazed sash: stiles, rails, glazing bars and the pane as two geometries. */
function sashGeometry(width, height, thickness) {
  const frame = createSurfaceBuilder(0.9);
  const t = thickness;
  const s = 0.055;
  frame.box(0, 0, -t / 2, s, height, t / 2);
  frame.box(width - s, 0, -t / 2, width, height, t / 2);
  frame.box(s, 0, -t / 2, width - s, s, t / 2);
  frame.box(s, height - s, -t / 2, width - s, height, t / 2);
  // Glazing bars: a two-over-two pattern reads as a real casement.
  const bar = 0.022;
  frame.box(width / 2 - bar / 2, s, -t / 2, width / 2 + bar / 2, height - s, t / 2);
  frame.box(s, height * 0.56 - bar / 2, -t / 2, width - s, height * 0.56 + bar / 2, t / 2);

  const glass = createSurfaceBuilder(1);
  glass.box(s, s, -0.004, width - s, height - s, 0.004);
  return { frame: frame.build(), glass: glass.build() };
}

export function buildOpenings(ctx) {
  const { scene, materials, collision, tile, project } = ctx;
  const root = new THREE.Group();
  root.name = 'openings';
  scene.add(root);

  const elements = [];
  const interactives = [];
  const animating = new Set();

  const woodMat = materials.make('woodDark');
  const glassMat = materials.make('glassClear');
  const steelMat = materials.make('steel', { colour: 0x2b2f36 });

  /* ------------------------------------------------- static frame builders */
  const liningB = createSurfaceBuilder(tile('woodDark'));
  const stoneB = createSurfaceBuilder(tile('sandstone'));

  /**
   * Line the reveal of an opening and put an architrave on both faces.
   * Coordinates are world-space; `axis` is the axis the wall runs along.
   */
  function lineOpening(axis, at, u, width, sill, head, wallT, stone) {
    const b = stone ? stoneB : liningB;
    const j = 0.055;
    const half = width / 2;
    const t = wallT / 2;
    const put = (u0, u1, y0, y1, t0, t1) => {
      if (axis === 'x') b.box(u0, y0, at + t0, u1, y1, at + t1);
      else b.box(at + t0, y0, u0, at + t1, y1, u1);
    };
    // Jambs and head, through the full wall thickness.
    put(u - half, u - half + j, sill, head, -t, t);
    put(u + half - j, u + half, sill, head, -t, t);
    put(u - half, u + half, head - j, head, -t, t);
    // Architrave: a moulding standing proud of both wall faces.
    const a = 0.085;
    for (const side of [-1, 1]) {
      const t0 = side < 0 ? -t - 0.028 : t;
      const t1 = side < 0 ? -t : t + 0.028;
      put(u - half - a, u - half, sill, head + a, t0, t1);
      put(u + half, u + half + a, sill, head + a, t0, t1);
      put(u - half - a, u + half + a, head, head + a, t0, t1);
    }
  }

  /** A projecting stone sill under an external window. */
  function addSill(axis, at, u, width, sill, wallT, outward) {
    const half = width / 2 + 0.12;
    const t = wallT / 2;
    const p0 = outward > 0 ? t : -t - 0.11;
    const p1 = outward > 0 ? t + 0.11 : -t;
    if (axis === 'x') stoneB.box(u - half, sill - 0.09, at + p0, u + half, sill, at + p1);
    else stoneB.box(at + p0, sill - 0.09, u - half, at + p1, sill, u + half);
  }

  /** Corner infill that turns a rectangular opening into an arched one. */
  function addArchHead(axis, at, u, width, head, wallT) {
    const r = width / 2;
    const spring = head - r;
    const steps = 10;
    const t = wallT / 2;
    for (let i = 0; i < steps; i += 1) {
      const y0 = spring + (r * i) / steps;
      const y1 = spring + (r * (i + 1)) / steps;
      const dy = y1 - spring;
      const halfAt = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (axis === 'x') {
        stoneB.box(u - r, y0, at - t, u - halfAt, y1, at + t);
        stoneB.box(u + halfAt, y0, at - t, u + r, y1, at + t);
      } else {
        stoneB.box(at - t, y0, u - r, at + t, y1, u - halfAt);
        stoneB.box(at - t, y0, u + halfAt, at + t, y1, u + r);
      }
    }
  }

  /**
   * Register a moving part.
   *
   * `apply(openFraction)` positions the geometry; the module handles easing,
   * collision and the interaction record.
   */
  function addMover(spec) {
    const mover = {
      // The opening's own rectangle is exactly the volume you aim at, and
      // naming its collision tag stops a door from occluding itself.
      bounds: spec.box ? {
        min: new THREE.Vector3(spec.box[0], spec.box[1], spec.box[2]),
        max: new THREE.Vector3(spec.box[3], spec.box[4], spec.box[5]),
      } : undefined,
      occluderTag: spec.occluderTag || null,
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      pkg: spec.pkg,
      boq: spec.boq,
      room: spec.room || null,
      material: spec.material || 'Hardwood',
      dimensions: spec.dimensions,
      hotspot: spec.hotspot,
      normal: spec.normal,
      meshes: spec.meshes,
      apply: spec.apply,
      open: 0,
      target: 0,
      collisionHandles: spec.collisionHandles || [],
      locked: false,
      note: spec.note || '',
      verb: spec.verb || ['Open', 'Close'],
    };
    mover.toggle = () => {
      mover.target = mover.target > 0.5 ? 0 : 1;
      animating.add(mover);
      return mover.target > 0.5;
    };
    mover.setOpen = (value) => {
      mover.target = clamp(value, 0, 1);
      animating.add(mover);
    };
    mover.apply(0);
    interactives.push(mover);
    return mover;
  }

  /* ------------------------------------------------------------ the doors */
  for (const door of DOORS) {
    const level = LEVEL_BY_ID.get(door.level);
    const sill = level.floor;
    const head = level.floor + door.height;
    const wallT = door.exterior ? THICKNESS.exterior : THICKNESS.interior;
    const at = door.axis === 'x' ? door.z : door.x;
    const u = door.axis === 'x' ? door.x : door.z;

    lineOpening(door.axis, at, u, door.width, sill, head, wallT, false);

    if (door.kind === 'arch') continue; // an opening, not a door

    // Canonical frame: wall along +X, outward normal +Z, sill at y = 0.
    const group = new THREE.Group();
    group.position.set(door.x, sill, door.z);
    group.rotation.y = door.axis === 'x' ? 0 : Math.PI / 2;
    group.name = `door:${door.id}`;
    root.add(group);

    const clear = door.width - 0.10;
    const leafHeight = door.height - 0.06;
    const thickness = 0.048;
    const double = door.kind === 'double' || door.kind === 'french';
    const glazed = door.kind === 'french';
    const leaves = [];

    const makeLeaf = (leafWidth, hingeX, direction) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0, 0);
      group.add(pivot);
      if (glazed) {
        const { frame, glass } = sashGeometry(leafWidth, leafHeight, thickness);
        const fm = new THREE.Mesh(frame, woodMat);
        const gm = new THREE.Mesh(glass, glassMat);
        fm.castShadow = true;
        gm.renderOrder = 2;
        pivot.add(fm);
        pivot.add(gm);
        if (direction < 0) { fm.scale.x = -1; gm.scale.x = -1; }
      } else {
        const mesh = new THREE.Mesh(
          leafGeometry(leafWidth, leafHeight, thickness, true, 'free'),
          woodMat,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (direction < 0) mesh.scale.x = -1;
        pivot.add(mesh);
      }
      leaves.push({ pivot, direction });
      return pivot;
    };

    if (double) {
      makeLeaf(clear / 2, -clear / 2, 1);
      makeLeaf(clear / 2, clear / 2, -1);
    } else {
      makeLeaf(clear, -clear / 2, 1);
    }

    // Solid while shut.
    const half = door.width / 2;
    const box = door.axis === 'x'
      ? [door.x - half, sill, door.z - wallT / 2, door.x + half, head, door.z + wallT / 2]
      : [door.x - wallT / 2, sill, door.z - half, door.x + wallT / 2, head, door.z + half];
    const handle = collision.add(box[0], box[1], box[2], box[3], box[4], box[5], `door:${door.id}`);

    const normal = door.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    addMover({
      id: door.id,
      name: door.name,
      kind: 'door',
      pkg: door.exterior ? PKG.extDoors : PKG.intDoors,
      boq: door.boq,
      material: glazed ? 'Hardwood and double glazing' : 'Solid hardwood, veneered',
      dimensions: [door.width, door.height, wallT],
      hotspot: new THREE.Vector3(door.x, sill + door.height * 0.5, door.z),
      box,
      occluderTag: `door:${door.id}`,
      normal,
      meshes: leaves.map((l) => l.pivot),
      collisionHandles: [handle],
      note: door.exterior
        ? 'External door set in a hardwood lining, with a weathered threshold and a moulded architrave to both faces.'
        : 'Panelled internal door on a solid-core blank, hung in a hardwood lining with a moulded architrave.',
      apply(f) {
        const eased = smoothstep(0, 1, f);
        for (const leaf of leaves) {
          // A left-hung leaf swings toward +Z when rotated negatively; a
          // right-hung one mirrors it. `swing` picks which face it opens onto.
          leaf.pivot.rotation.y = -door.swing * leaf.direction * SWING * eased;
        }
      },
    });
  }

  /* ---------------------------------------------------------- the windows */
  const windows = allWindows();
  for (const win of windows) {
    const wallT = THICKNESS.exterior;
    const height = win.head - win.sill;
    lineOpening(win.axis, win.at, win.u, win.width, win.sill, win.head, wallT, true);

    // Which way is out? Away from the room the window serves.
    const room = ROOMS.find((r) => r.id === win.room);
    let outward = 1;
    if (room) {
      const centreU = win.axis === 'x' ? (room.z0 + room.z1) / 2 : (room.x0 + room.x1) / 2;
      outward = win.at > centreU ? 1 : -1;
    }
    addSill(win.axis, win.at, win.u, win.width, win.sill, wallT, outward);
    if (win.style === 'arch') addArchHead(win.axis, win.at, win.u, win.width, win.head, wallT);

    const group = new THREE.Group();
    group.position.set(win.x, win.sill, win.z);
    group.rotation.y = win.axis === 'x' ? 0 : Math.PI / 2;
    root.add(group);

    const clear = win.width - 0.10;
    const sashHeight = height - 0.08;
    const { frame, glass } = sashGeometry(clear, sashHeight, 0.055);
    const pivot = new THREE.Group();
    // Hinge on the left jamb, opening outward.
    pivot.position.set(-clear / 2, 0.04, 0);
    group.add(pivot);
    const fm = new THREE.Mesh(frame, woodMat);
    const gm = new THREE.Mesh(glass, glassMat);
    // A sash sits inside a 340 mm reveal. The reveal already casts that
    // shadow, so making the sash a caster costs a shadow draw call per window
    // and changes nothing you can see.
    fm.castShadow = false;
    fm.userData.neverCasts = true;
    gm.renderOrder = 2;
    gm.userData.neverCasts = true;
    pivot.add(fm);
    pivot.add(gm);

    const halfW = win.width / 2;
    const box = win.axis === 'x'
      ? [win.x - halfW, win.sill, win.z - wallT / 2, win.x + halfW, win.head, win.z + wallT / 2]
      : [win.x - wallT / 2, win.sill, win.z - halfW, win.x + wallT / 2, win.head, win.z + halfW];
    const handle = collision.add(box[0], box[1], box[2], box[3], box[4], box[5], `window:${win.id}`);

    addMover({
      id: win.id,
      name: win.name,
      kind: 'window',
      pkg: PKG.glazing,
      boq: win.boq,
      room: win.room,
      material: win.style === 'arch'
        ? 'Timber-clad arched casement, double-glazed'
        : 'uPVC casement, 24 mm argon-filled unit',
      dimensions: [win.width, height, wallT],
      hotspot: new THREE.Vector3(win.x, win.sill + height * 0.5, win.z),
      box,
      occluderTag: `window:${win.id}`,
      normal: win.axis === 'x' ? new THREE.Vector3(0, 0, outward) : new THREE.Vector3(outward, 0, 0),
      meshes: [pivot],
      collisionHandles: [handle],
      verb: ['Open', 'Close'],
      note: 'Double-glazed casement on a projecting stone sill, hung to open outward clear of the reveal.',
      apply(f) {
        // The sash always swings out, away from the room it serves.
        pivot.rotation.y = -outward * SWING * 0.72 * smoothstep(0, 1, f);
      },
    });
  }

  /* ---------------------------------------------- garage: sectional doors */
  for (const gd of GARAGE_DOORS) {
    const wallT = THICKNESS.exterior;
    const sill = GARAGE.floor;
    const head = sill + gd.height;
    lineOpening('x', gd.z, gd.x, gd.width, sill, head, wallT, false);

    const group = new THREE.Group();
    group.position.set(gd.x, sill, gd.z);
    root.add(group);

    const panelCount = 5;
    const panelH = gd.height / panelCount;
    const clear = gd.width - 0.06;
    const panels = [];
    for (let i = 0; i < panelCount; i += 1) {
      const b = createSurfaceBuilder(1.1);
      b.box(-clear / 2, 0, -0.03, clear / 2, panelH - 0.012, 0.03);
      // Two ribs per panel: what makes a sectional door read as one.
      b.box(-clear / 2, panelH * 0.22, 0.03, clear / 2, panelH * 0.30, 0.045);
      b.box(-clear / 2, panelH * 0.68, 0.03, clear / 2, panelH * 0.76, 0.045);
      const mesh = new THREE.Mesh(b.build(), steelMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      panels.push({ mesh, base: i * panelH });
    }

    const box = [gd.x - gd.width / 2, sill, gd.z - wallT / 2, gd.x + gd.width / 2, head, gd.z + wallT / 2];
    const handle = collision.add(box[0], box[1], box[2], box[3], box[4], box[5], `garage:${gd.id}`);

    /**
     * The track: up the face of the opening, round a quarter turn at the
     * head, then back horizontally under the garage ceiling. `u` is distance
     * along it from the threshold.
     */
    const radius = 0.42;
    const corner = gd.height - radius;
    const trackPoint = (u) => {
      if (u <= corner) return { y: u, z: 0, tilt: 0 };
      if (u >= corner + radius * Math.PI / 2) {
        return { y: gd.height, z: -(u - corner - radius * Math.PI / 2) - radius, tilt: Math.PI / 2 };
      }
      const a = (u - corner) / radius;
      return {
        y: corner + Math.sin(a) * radius,
        z: -(radius - Math.cos(a) * radius),
        tilt: a,
      };
    };

    addMover({
      id: gd.id,
      name: gd.name,
      kind: 'garage',
      pkg: PKG.extDoors,
      boq: gd.boq,
      room: 'garage',
      material: 'Insulated steel sectional door, remote operator',
      dimensions: [gd.width, gd.height, 0.06],
      hotspot: new THREE.Vector3(gd.x, sill + gd.height * 0.5, gd.z),
      box,
      occluderTag: `garage:${gd.id}`,
      normal: new THREE.Vector3(0, 0, 1),
      meshes: panels.map((p) => p.mesh),
      collisionHandles: [handle],
      note: 'Insulated sectional door on a curved track: the panels rise up the opening and turn back under the ceiling.',
      apply(f) {
        // Every panel travels the same distance along the shared track; the
        // track itself turns them from vertical to horizontal at the head.
        const travel = smoothstep(0, 1, f) * (gd.height + 0.6);
        for (const p of panels) {
          const pt = trackPoint(p.base + travel);
          p.mesh.position.set(0, pt.y, pt.z);
          p.mesh.rotation.x = -pt.tilt;
        }
      },
    });
  }

  /* --------------------------------------------- garage clerestory windows */
  for (const gw of GARAGE_WINDOWS) {
    const wallT = THICKNESS.exterior;
    const sill = GARAGE.floor + gw.sill;
    const head = GARAGE.floor + gw.head;
    lineOpening('z', gw.x, gw.z, gw.width, sill, head, wallT, true);
    const glassGeo = createSurfaceBuilder(1);
    glassGeo.box(gw.x - 0.02, sill + 0.05, gw.z - gw.width / 2 + 0.05,
      gw.x + 0.02, head - 0.05, gw.z + gw.width / 2 - 0.05);
    const mesh = new THREE.Mesh(glassGeo.build(), glassMat);
    mesh.renderOrder = 2;
    root.add(mesh);
    collision.add(gw.x - wallT / 2, sill, gw.z - gw.width / 2,
      gw.x + wallT / 2, head, gw.z + gw.width / 2, `window:${gw.id}`);
  }

  /* --------------------------------------------------------- the main gate */
  {
    const gate = PLOT.gate;
    const width = gate.x1 - gate.x0;
    const height = gate.height;
    const group = new THREE.Group();
    group.position.set((gate.x0 + gate.x1) / 2, SITE_LEVEL, PLOT.z1 - 0.15);
    root.add(group);

    const leaves = [];
    const makeGateLeaf = (leafWidth, hingeX, direction) => {
      const b = createSurfaceBuilder(0.8);
      const w = leafWidth;
      // Frame.
      b.box(0, 0, -0.04, 0.075, height, 0.04);
      b.box(w - 0.075, 0, -0.04, w, height, 0.04);
      b.box(0, 0, -0.04, w, 0.10, 0.04);
      b.box(0, height - 0.12, -0.04, w, height, 0.04);
      b.box(0, height * 0.52, -0.035, w, height * 0.56, 0.035);
      // Vertical bars with spear heads.
      const bars = Math.max(5, Math.round(w / 0.19));
      for (let i = 1; i < bars; i += 1) {
        const x = (w * i) / bars;
        b.box(x - 0.018, 0.10, -0.018, x + 0.018, height - 0.12, 0.018);
        b.box(x - 0.035, height * 0.55, -0.03, x + 0.035, height * 0.60, 0.03);
      }
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0, 0);
      const mesh = new THREE.Mesh(b.build(), steelMat);
      mesh.castShadow = true;
      if (direction < 0) mesh.scale.x = -1;
      pivot.add(mesh);
      group.add(pivot);
      leaves.push({ pivot, direction });
    };
    makeGateLeaf(width / 2, -width / 2, 1);
    makeGateLeaf(width / 2, width / 2, -1);

    const handle = collision.add(gate.x0, SITE_LEVEL, PLOT.z1 - 0.3,
      gate.x1, SITE_LEVEL + height, PLOT.z1 + 0.1, 'gate');

    addMover({
      id: 'mainGate',
      name: 'Main gate',
      kind: 'gate',
      pkg: 'L7',
      boq: 'b.gate',
      material: 'Hand-forged wrought iron, powder-coated, motorised',
      dimensions: [width, height, 0.08],
      hotspot: new THREE.Vector3((gate.x0 + gate.x1) / 2, SITE_LEVEL + height * 0.5, PLOT.z1 - 0.15),
      box: [gate.x0, SITE_LEVEL, PLOT.z1 - 0.3, gate.x1, SITE_LEVEL + height, PLOT.z1 + 0.1],
      occluderTag: 'gate',
      normal: new THREE.Vector3(0, 0, 1),
      meshes: leaves.map((l) => l.pivot),
      collisionHandles: [handle],
      note: 'Motorised wrought-iron gate between carved stone piers, opening inward onto the drive.',
      apply(f) {
        const eased = smoothstep(0, 1, f);
        for (const leaf of leaves) leaf.pivot.rotation.y = leaf.direction * GATE_SWING * eased;
      },
    });
  }

  /* ----------------------------------------------------------- lift doors */
  for (const levelId of LIFT.levels) {
    const level = LEVEL_BY_ID.get(levelId);
    const group = new THREE.Group();
    group.position.set((LIFT.x0 + LIFT.x1) / 2, level.floor, LIFT.z0);
    root.add(group);

    const w = LIFT.doorWidth;
    const h = LIFT.doorHeight;
    const panels = [];
    for (const dir of [-1, 1]) {
      const b = createSurfaceBuilder(0.7);
      b.box(0, 0, -0.03, w / 2, h, 0.03);
      const mesh = new THREE.Mesh(b.build(), steelMat);
      // Landing doors are flush in their surround; nothing of theirs falls
      // anywhere the surround does not already shade.
      mesh.castShadow = false;
      mesh.position.x = dir < 0 ? -w / 2 : 0;
      group.add(mesh);
      panels.push({ mesh, dir, home: mesh.position.x });
    }
    // Surround.
    liningB.box((LIFT.x0 + LIFT.x1) / 2 - w / 2 - 0.09, level.floor, LIFT.z0 - 0.06,
      (LIFT.x0 + LIFT.x1) / 2 + w / 2 + 0.09, level.floor + h + 0.09, LIFT.z0 + 0.02);

    const handle = collision.add(
      (LIFT.x0 + LIFT.x1) / 2 - w / 2, level.floor, LIFT.z0 - 0.06,
      (LIFT.x0 + LIFT.x1) / 2 + w / 2, level.floor + h, LIFT.z0 + 0.06, `lift:${levelId}`,
    );

    addMover({
      id: `lift-${levelId}`,
      name: `Lift doors — ${level.name.toLowerCase()}`,
      kind: 'lift',
      pkg: 'M7',
      boq: 'b.lift',
      material: 'Brushed stainless steel, centre-opening',
      dimensions: [w, h, 0.06],
      hotspot: new THREE.Vector3((LIFT.x0 + LIFT.x1) / 2, level.floor + h * 0.5, LIFT.z0),
      box: [(LIFT.x0 + LIFT.x1) / 2 - w / 2, level.floor, LIFT.z0 - 0.12,
        (LIFT.x0 + LIFT.x1) / 2 + w / 2, level.floor + h, LIFT.z0 + 0.12],
      occluderTag: `lift:${levelId}`,
      normal: new THREE.Vector3(0, 0, -1),
      meshes: panels.map((p) => p.mesh),
      collisionHandles: [handle],
      note: 'Centre-opening landing doors to the three-stop passenger lift.',
      apply(f) {
        const eased = smoothstep(0, 1, f);
        for (const p of panels) p.mesh.position.x = p.home + p.dir * (w / 2 - 0.03) * eased;
      },
    });
  }

  /* ------------------------------------------------- commit the static work */
  const liningGeo = liningB.build();
  if (liningGeo.getAttribute('position').count) {
    const mesh = new THREE.Mesh(liningGeo, woodMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'openings:linings';
    mesh.userData.layer = 'joinery';
    root.add(mesh);
    elements.push({
      name: 'openings:linings', pkg: PKG.intDoors, layer: 'joinery',
      mesh, material: woodMat, reveal: null, collision: [],
    });
  } else {
    liningGeo.dispose();
  }

  const stoneGeo = stoneB.build();
  if (stoneGeo.getAttribute('position').count) {
    const stoneMat = materials.make('sandstone', { colour: 0xe0d4b8 });
    const mesh = new THREE.Mesh(stoneGeo, stoneMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'openings:sills';
    mesh.userData.layer = 'facade';
    root.add(mesh);
    elements.push({
      name: 'openings:sills', pkg: PKG.glazing, layer: 'facade',
      mesh, material: stoneMat, reveal: null, collision: [],
    });
  } else {
    stoneGeo.dispose();
  }

  // Each mover becomes a construction element too, so the timeline installs
  // doors and windows on the day their package pays for them.
  const byKindPkg = new Map();
  for (const mover of interactives) {
    const key = mover.pkg;
    const list = byKindPkg.get(key) || [];
    list.push(mover);
    byKindPkg.set(key, list);
  }
  for (const [pkg, list] of byKindPkg) {
    // The meshes already live under `root`, so the element does not re-parent
    // them: it carries the list and switches them, along with the collision
    // boxes, which must not come back solid for a door that is standing open.
    const proxy = new THREE.Group();
    proxy.name = `openings:${pkg}`;
    elements.push({
      name: `openings:${pkg}`,
      pkg,
      layer: 'joinery',
      mesh: proxy,
      material: woodMat,
      reveal: null,
      collision: [],
      movers: list,
      setVisible(v) {
        for (const mover of list) {
          mover.installed = v;
          for (const m of mover.meshes) m.visible = v;
          for (const h of mover.collisionHandles) collision.setEnabled(h, v && mover.open < 0.3);
        }
      },
    });
  }

  collision.build();

  /** Animate every opening that is not at rest. */
  function update(dt) {
    if (!animating.size) return;
    const done = [];
    for (const mover of animating) {
      const speed = mover.kind === 'garage' ? 0.9 : (mover.kind === 'gate' ? 0.55 : 1.9);
      const delta = Math.sign(mover.target - mover.open) * speed * dt;
      const next = mover.target > mover.open
        ? Math.min(mover.target, mover.open + Math.abs(delta))
        : Math.max(mover.target, mover.open - Math.abs(delta));
      mover.open = next;
      mover.apply(next);
      // A door only blocks the way while it is shut *and* installed.
      const solid = next < 0.3 && mover.installed !== false;
      for (const h of mover.collisionHandles) collision.setEnabled(h, solid);
      if (Math.abs(next - mover.target) < 1e-4) done.push(mover);
    }
    for (const mover of done) animating.delete(mover);
  }

  /** Shut everything — used by the timeline and by session restore. */
  function closeAll() {
    for (const mover of interactives) {
      mover.open = 0;
      mover.target = 0;
      mover.apply(0);
      for (const h of mover.collisionHandles) collision.setEnabled(h, mover.installed !== false);
    }
    animating.clear();
  }

  return {
    root,
    elements,
    interactives,
    update,
    closeAll,
    byId: new Map(interactives.map((m) => [m.id, m])),
  };
}
