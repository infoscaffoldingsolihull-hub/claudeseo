/**
 * The plot: ground, plinth, boundary wall, gate, drive, pool, garden.
 *
 * The house stands on a 450 mm plinth — which is how these houses are
 * actually built in Lahore, for damp and for monsoon standing water, and is
 * also what gives the elevation its lift.  A single step ring runs round the
 * building so every external door has a threshold you can actually walk over,
 * and the portico has its own flight.
 *
 * Everything here is tagged with the external-works package that pays for it,
 * so the timeline plants the garden on the day the landscape contractor
 * arrives and not before.
 */
import * as THREE from 'three';
import { PLOT, SHELL, GARAGE, PORTICO, SITE, SITE_LEVEL, LEVEL_BY_ID, GROUND_PAD, FOOTPRINT_HOLES } from './plan.js';
import { createSurfaceBuilder, subtractRects } from './build.js';
import { makeRng } from '../engine/rng.js';

export const SITE_PKG = {
  clearance: 'P2',
  boundary: 'P4',
  drive: 'L1',
  irrigation: 'L2',
  planting: 'L3',
  pool: 'L4',
  fountain: 'L5',
  lighting: 'L6',
  gate: 'L7',
  plinth: 'S7',
};

export function buildSite(ctx) {
  const { scene, materials, collision, tile, quality } = ctx;
  const root = new THREE.Group();
  root.name = 'site';
  scene.add(root);

  const elements = [];
  const rng = makeRng(4711);

  function addElement({ name, pkg, geometry, material, layer = 'external', reveal, boxes, cast = true, receive = true, always = false }) {
    if (!geometry || geometry.getAttribute('position').count === 0) {
      geometry?.dispose();
      return null;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = name;
    mesh.userData.pkg = pkg;
    mesh.userData.layer = layer;
    root.add(mesh);
    const handles = [];
    for (const b of boxes || []) handles.push(collision.add(b[0], b[1], b[2], b[3], b[4], b[5], name));
    const element = { name, pkg, layer, mesh, material, reveal: reveal || null, collision: handles, always };
    elements.push(element);
    return element;
  }

  /* --------------------------------------------------- footprint cut-outs */
  // The ground and the plinth are built *around* the building, not through
  // it. A solid ground slab under the footprint would drive a 0.8 m slab of
  // grass straight through the middle of the home cinema.
  const PLINTH_PAD = GROUND_PAD.plinth;
  const STEP_PAD = GROUND_PAD.step;
  const [holeShell, holeGarage, holePortico] = FOOTPRINT_HOLES;
  const footprintHoles = FOOTPRINT_HOLES;

  /* ------------------------------------------------------------- ground -- */
  {
    // A generous apron of ground beyond the plot, so the horizon is land and
    // not a cut edge floating in the sky.
    // A much coarser repeat than the lawns: at 2.6 m the tiling reads as a
    // visible grid all the way to the horizon.
    const b = createSurfaceBuilder(6.5);
    const outer = 190;
    const boxes = [];
    for (const r of subtractRects({ x0: -outer, z0: -outer, x1: outer, z1: outer }, footprintHoles)) {
      b.box(r.x0, SITE_LEVEL - 0.8, r.z0, r.x1, SITE_LEVEL, r.z1);
      boxes.push([r.x0, SITE_LEVEL - 0.8, r.z0, r.x1, SITE_LEVEL, r.z1]);
    }
    addElement({
      name: 'site:ground',
      pkg: SITE_PKG.clearance,
      layer: 'ground',
      geometry: b.build(),
      material: materials.make('grass', { colour: 0x79855a }),
      reveal: null,
      boxes,
      cast: false,
      always: true,
    });
  }

  /* ------------------------------------------------------------- plinth -- */
  {
    const b = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];

    // The plinth face: a ring immediately outside the building line, running
    // from the garden up to the ground floor.
    const plinthRing = [
      ...subtractRects(
        { x0: SHELL.x0 - PLINTH_PAD, z0: SHELL.z0 - PLINTH_PAD, x1: SHELL.x1 + PLINTH_PAD, z1: SHELL.z1 + PLINTH_PAD },
        [{ x0: SHELL.x0, z0: SHELL.z0, x1: SHELL.x1, z1: SHELL.z1 }, holePortico],
      ),
      ...subtractRects(
        { x0: GARAGE.x0 - PLINTH_PAD, z0: GARAGE.z0 - PLINTH_PAD, x1: GARAGE.x1, z1: GARAGE.z1 + PLINTH_PAD },
        [{ x0: GARAGE.x0, z0: GARAGE.z0, x1: GARAGE.x1, z1: GARAGE.z1 }],
      ),
    ];
    for (const r of plinthRing) {
      b.box(r.x0, SITE_LEVEL - 0.5, r.z0, r.x1, 0, r.z1);
      boxes.push([r.x0, SITE_LEVEL - 0.5, r.z0, r.x1, 0, r.z1]);
    }

    // One 230 mm step all the way round, so no external door is ever a
    // 450 mm drop into the garden.
    const stepRing = [
      ...subtractRects(
        { x0: SHELL.x0 - STEP_PAD, z0: SHELL.z0 - STEP_PAD, x1: SHELL.x1 + STEP_PAD, z1: SHELL.z1 + STEP_PAD },
        [{ x0: SHELL.x0 - PLINTH_PAD, z0: SHELL.z0 - PLINTH_PAD, x1: SHELL.x1 + PLINTH_PAD, z1: SHELL.z1 + PLINTH_PAD }, holePortico],
      ),
      ...subtractRects(
        { x0: GARAGE.x0 - STEP_PAD, z0: GARAGE.z0 - STEP_PAD, x1: GARAGE.x1, z1: GARAGE.z1 + STEP_PAD },
        [{ x0: GARAGE.x0 - PLINTH_PAD, z0: GARAGE.z0 - PLINTH_PAD, x1: GARAGE.x1, z1: GARAGE.z1 + PLINTH_PAD }],
      ),
    ];
    for (const r of stepRing) {
      b.box(r.x0, SITE_LEVEL - 0.4, r.z0, r.x1, -0.22, r.z1);
      boxes.push([r.x0, SITE_LEVEL - 0.4, r.z0, r.x1, -0.22, r.z1]);
    }

    addElement({
      name: 'site:plinth',
      pkg: SITE_PKG.plinth,
      layer: 'substructure',
      geometry: b.build(),
      material: materials.make('sandstone', { colour: 0xcfc3a8 }),
      reveal: { dir: [0, 1, 0], min: SITE_LEVEL - 0.5, max: 0 },
      boxes,
      cast: false,
    });
  }

  /* ---------------------------------------------------- drive & forecourt */
  {
    const b = createSurfaceBuilder(tile('paver'));
    const boxes = [];
    const top = SITE_LEVEL + 0.02;
    for (const r of [SITE.driveway, SITE.forecourt]) {
      b.box(r.x0, SITE_LEVEL - 0.12, r.z0, r.x1, top, r.z1);
      boxes.push([r.x0, SITE_LEVEL - 0.12, r.z0, r.x1, top, r.z1]);
    }
    // The garage apron ramps from the plinth down to the drive, in steps
    // shallow enough to walk up as well as drive up.
    const apron = SITE.garageApron;
    const steps = 6;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const z0 = apron.z0 + (apron.z1 - apron.z0) * t0;
      const z1 = apron.z0 + (apron.z1 - apron.z0) * t1;
      const y = 0 + (SITE_LEVEL + 0.02) * t1;
      b.box(apron.x0, SITE_LEVEL - 0.12, z0, apron.x1, y, z1);
      boxes.push([apron.x0, SITE_LEVEL - 0.12, z0, apron.x1, y, z1]);
    }
    // A path round to the service entrance on the north.
    b.box(SHELL.x1 + 0.9, SITE_LEVEL - 0.12, SHELL.z0 - 1.6, SHELL.x1 + 2.6, top, SHELL.z1 + 2);
    boxes.push([SHELL.x1 + 0.9, SITE_LEVEL - 0.12, SHELL.z0 - 1.6, SHELL.x1 + 2.6, top, SHELL.z1 + 2]);
    b.box(SHELL.x0 - 2.4, SITE_LEVEL - 0.12, SHELL.z0 - 1.6, SHELL.x1 + 2.6, top, SHELL.z0 - 0.95);
    boxes.push([SHELL.x0 - 2.4, SITE_LEVEL - 0.12, SHELL.z0 - 1.6, SHELL.x1 + 2.6, top, SHELL.z0 - 0.95]);

    addElement({
      name: 'site:paving',
      pkg: SITE_PKG.drive,
      geometry: b.build(),
      material: materials.make('paver'),
      reveal: { dir: [0, 0, 1], min: PLOT.z0, max: PLOT.z1 },
      boxes,
      cast: false,
    });
  }

  /* ------------------------------------------------------- boundary wall */
  {
    const b = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];
    const t = PLOT.wallThickness;
    const top = SITE_LEVEL + PLOT.wallHeight;
    const gate = PLOT.gate;
    const runs = [
      // North, east and west sides run unbroken.
      [PLOT.x0, PLOT.z0, PLOT.x1, PLOT.z0 + t],
      [PLOT.x0, PLOT.z0, PLOT.x0 + t, PLOT.z1],
      [PLOT.x1 - t, PLOT.z0, PLOT.x1, PLOT.z1],
      // The south side opens for the gate.
      [PLOT.x0, PLOT.z1 - t, gate.x0 - 0.55, PLOT.z1],
      [gate.x1 + 0.55, PLOT.z1 - t, PLOT.x1, PLOT.z1],
    ];
    for (const [x0, z0, x1, z1] of runs) {
      b.box(x0, SITE_LEVEL - 0.4, z0, x1, top, z1);
      boxes.push([x0, SITE_LEVEL - 0.4, z0, x1, top, z1]);
      // Coping.
      b.box(x0 - 0.05, top, z0 - 0.05, x1 + 0.05, top + 0.11, z1 + 0.05);
    }
    // Gate piers.
    for (const px of [gate.x0 - 0.28, gate.x1 + 0.28]) {
      b.box(px - 0.55, SITE_LEVEL - 0.4, PLOT.z1 - 0.62, px + 0.55, SITE_LEVEL + gate.height + 0.35, PLOT.z1 + 0.05);
      boxes.push([px - 0.55, SITE_LEVEL - 0.4, PLOT.z1 - 0.62, px + 0.55, SITE_LEVEL + gate.height + 0.35, PLOT.z1 + 0.05]);
      // Pier cap and finial.
      b.box(px - 0.66, SITE_LEVEL + gate.height + 0.35, PLOT.z1 - 0.73, px + 0.66, SITE_LEVEL + gate.height + 0.52, PLOT.z1 + 0.16);
      b.boxAt(px, SITE_LEVEL + gate.height + 0.72, PLOT.z1 - 0.28, 0.34, 0.4, 0.34);
    }
    addElement({
      name: 'site:boundary',
      pkg: SITE_PKG.boundary,
      geometry: b.build(),
      material: materials.make('sandstone', { colour: 0xd6c8ab }),
      reveal: { dir: [0, 1, 0], min: SITE_LEVEL - 0.4, max: top + 0.2 },
      boxes,
    });
  }

  /* ------------------------------------------------------------ the pool */
  {
    const p = SITE.pool;
    const deck = SITE.poolDeck;
    const b = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];
    const deckTop = SITE_LEVEL + 0.04;

    // Deck, built as the four bands around the water so the pool is a real
    // hole rather than a blue rectangle painted on the paving.
    const bands = [
      [deck.x0, deck.z0, deck.x1, p.z0],
      [deck.x0, p.z1, deck.x1, deck.z1],
      [deck.x0, p.z0, p.x0, p.z1],
      [p.x1, p.z0, deck.x1, p.z1],
    ];
    for (const [x0, z0, x1, z1] of bands) {
      b.box(x0, SITE_LEVEL - 0.35, z0, x1, deckTop, z1);
      boxes.push([x0, SITE_LEVEL - 0.35, z0, x1, deckTop, z1]);
    }
    // Tank: floor and four walls.
    const floorY = deckTop - p.depth;
    b.box(p.x0 - 0.25, floorY - 0.25, p.z0 - 0.25, p.x1 + 0.25, floorY, p.z1 + 0.25);
    boxes.push([p.x0 - 0.25, floorY - 0.25, p.z0 - 0.25, p.x1 + 0.25, floorY, p.z1 + 0.25]);
    for (const [x0, z0, x1, z1] of [
      [p.x0 - 0.25, p.z0 - 0.25, p.x1 + 0.25, p.z0],
      [p.x0 - 0.25, p.z1, p.x1 + 0.25, p.z1 + 0.25],
      [p.x0 - 0.25, p.z0, p.x0, p.z1],
      [p.x1, p.z0, p.x1 + 0.25, p.z1],
    ]) {
      b.box(x0, floorY, z0, x1, deckTop, z1);
      boxes.push([x0, floorY, z0, x1, deckTop, z1]);
    }
    addElement({
      name: 'site:poolShell',
      pkg: SITE_PKG.pool,
      geometry: b.build(),
      material: materials.make('sandstone', { colour: 0xd9d2c0 }),
      reveal: { dir: [0, 1, 0], min: floorY - 0.25, max: deckTop },
      boxes,
      cast: false,
    });

    // Water surface: a plane with a scrolling normal map.
    const waterMat = materials.make('water');
    waterMat.side = THREE.DoubleSide;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(p.x1 - p.x0 - 0.02, p.z1 - p.z0 - 0.02, 1, 1),
      waterMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((p.x0 + p.x1) / 2, deckTop - 0.16, (p.z0 + p.z1) / 2);
    water.receiveShadow = false;
    water.name = 'site:poolWater';
    water.userData.pkg = SITE_PKG.pool;
    water.userData.layer = 'external';
    root.add(water);
    elements.push({
      name: 'site:poolWater', pkg: SITE_PKG.pool, layer: 'external',
      mesh: water, material: waterMat, reveal: null, collision: [], water: true,
    });
  }

  /* -------------------------------------------------------- the fountain */
  {
    const f = SITE.fountain;
    const group = new THREE.Group();
    group.name = 'site:fountain';
    const stone = materials.make('limestone', { colour: 0xe8dcc0 });

    const basin = new THREE.Mesh(new THREE.CylinderGeometry(f.radius, f.radius * 1.05, f.basinHeight, 28, 1, false), stone);
    basin.position.set(f.x, SITE_LEVEL + f.basinHeight / 2, f.z);
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);

    // Two tiers on a turned stem, in the proportions a stone fountain actually
    // has: a wide lower bowl at waist height and a small upper bowl above it.
    const tiers = [
      { geo: new THREE.CylinderGeometry(0.42, 0.30, 0.78, 14), y: f.basinHeight + 0.39 },
      { geo: new THREE.CylinderGeometry(1.12, 0.36, 0.24, 22), y: f.basinHeight + 0.90 },
      { geo: new THREE.CylinderGeometry(0.17, 0.13, 0.58, 12), y: f.basinHeight + 1.31 },
      { geo: new THREE.CylinderGeometry(0.56, 0.20, 0.18, 18), y: f.basinHeight + 1.69 },
      { geo: new THREE.SphereGeometry(0.14, 12, 8), y: f.basinHeight + 1.90 },
    ];
    for (const t of tiers) {
      const mesh = new THREE.Mesh(t.geo, stone);
      mesh.position.set(f.x, SITE_LEVEL + t.y, f.z);
      mesh.castShadow = true;
      group.add(mesh);
    }

    const waterMat = materials.make('water', { colour: 0x3d8fa6 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(f.radius - 0.1, 28), waterMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(f.x, SITE_LEVEL + f.basinHeight - 0.09, f.z);
    group.add(disc);

    root.add(group);
    collision.add(f.x - f.radius, SITE_LEVEL, f.z - f.radius, f.x + f.radius, SITE_LEVEL + f.basinHeight, f.z + f.radius, 'fountain');
    elements.push({
      name: 'site:fountain', pkg: SITE_PKG.fountain, layer: 'external',
      mesh: group, material: stone, group: true, reveal: null, collision: [],
      fountainWater: disc,
    });
  }

  /* ------------------------------------------------------- guard cabin -- */
  {
    const g = SITE.guardPost;
    const b = createSurfaceBuilder(tile('sandstone'));
    const boxes = [];
    const t = 0.22;
    const top = SITE_LEVEL + g.height;
    for (const [x0, z0, x1, z1] of [
      [g.x0, g.z0, g.x1, g.z0 + t],
      [g.x0, g.z1 - t, g.x1, g.z1],
      [g.x0, g.z0, g.x0 + t, g.z1],
      [g.x1 - t, g.z0, g.x1, g.z1],
    ]) {
      b.box(x0, SITE_LEVEL, z0, x1, top, z1);
      boxes.push([x0, SITE_LEVEL, z0, x1, top, z1]);
    }
    b.box(g.x0 - 0.2, top, g.z0 - 0.2, g.x1 + 0.2, top + 0.22, g.z1 + 0.2);
    boxes.push([g.x0 - 0.2, top, g.z0 - 0.2, g.x1 + 0.2, top + 0.22, g.z1 + 0.2]);
    addElement({
      name: 'site:guardPost',
      pkg: SITE_PKG.gate,
      geometry: b.build(),
      material: materials.make('sandstone', { colour: 0xcdbfa2 }),
      reveal: { dir: [0, 1, 0], min: SITE_LEVEL, max: top + 0.22 },
      boxes,
    });
  }

  /* --------------------------------------------------- lawns and borders */
  {
    const lawnB = createSurfaceBuilder(tile('grass'));
    const bedB = createSurfaceBuilder(tile('soil'));
    const kerbB = createSurfaceBuilder(tile('sandstone'));
    const lawns = [SITE.lawnWest, SITE.lawnFrontW, SITE.lawnFrontE, SITE.lawnNorth];
    for (const r of lawns) {
      lawnB.box(r.x0, SITE_LEVEL - 0.06, r.z0, r.x1, SITE_LEVEL + 0.035, r.z1);
      // A stone kerb round every lawn, which is what stops it reading as a
      // green rectangle dropped onto the paving.
      const k = 0.14;
      kerbB.box(r.x0 - k, SITE_LEVEL - 0.06, r.z0 - k, r.x1 + k, SITE_LEVEL + 0.075, r.z0);
      kerbB.box(r.x0 - k, SITE_LEVEL - 0.06, r.z1, r.x1 + k, SITE_LEVEL + 0.075, r.z1 + k);
      kerbB.box(r.x0 - k, SITE_LEVEL - 0.06, r.z0, r.x0, SITE_LEVEL + 0.075, r.z1);
      kerbB.box(r.x1, SITE_LEVEL - 0.06, r.z0, r.x1 + k, SITE_LEVEL + 0.075, r.z1);
    }
    // Planting beds along the boundary.
    const beds = [
      { x0: PLOT.x0 + 0.4, z0: PLOT.z0 + 0.4, x1: PLOT.x1 - 0.4, z1: PLOT.z0 + 1.5 },
      { x0: PLOT.x0 + 0.4, z0: PLOT.z0 + 1.5, x1: PLOT.x0 + 1.5, z1: PLOT.z1 - 0.4 },
      { x0: PLOT.x1 - 1.5, z0: PLOT.z0 + 1.5, x1: PLOT.x1 - 0.4, z1: PLOT.z1 - 0.4 },
    ];
    for (const r of beds) bedB.box(r.x0, SITE_LEVEL - 0.05, r.z0, r.x1, SITE_LEVEL + 0.06, r.z1);

    addElement({
      name: 'site:lawn',
      pkg: SITE_PKG.planting,
      geometry: lawnB.build(),
      material: materials.make('grass'),
      reveal: { dir: [0, 0, 1], min: PLOT.z0, max: PLOT.z1 },
      boxes: [],
      cast: false,
    });
    addElement({
      name: 'site:beds',
      pkg: SITE_PKG.planting,
      geometry: bedB.build(),
      material: materials.make('soil'),
      reveal: { dir: [0, 0, 1], min: PLOT.z0, max: PLOT.z1 },
      boxes: [],
      cast: false,
    });
    addElement({
      name: 'site:kerbs',
      pkg: SITE_PKG.drive,
      geometry: kerbB.build(),
      material: materials.make('sandstone', { colour: 0xc8bda4 }),
      reveal: { dir: [0, 0, 1], min: PLOT.z0, max: PLOT.z1 },
      boxes: [],
      cast: false,
    });
  }

  /* ------------------------------------------------------ trees & shrubs */
  const planting = (() => {
    const density = quality ? quality.props : 1;
    const spots = [];
    // Trees line the boundary and the drive; they are placed deterministically
    // so a saved session shows the same garden.
    const candidates = [];
    for (let i = 0; i < 42; i += 1) {
      const edge = i % 4;
      const t = rng();
      let x;
      let z;
      if (edge === 0) { x = PLOT.x0 + 1.4 + rng() * 0.9; z = PLOT.z0 + 2 + t * (PLOT.z1 - PLOT.z0 - 4); }
      else if (edge === 1) { x = PLOT.x1 - 1.4 - rng() * 0.9; z = PLOT.z0 + 2 + t * (PLOT.z1 - PLOT.z0 - 4); }
      else if (edge === 2) { x = PLOT.x0 + 2 + t * (PLOT.x1 - PLOT.x0 - 4); z = PLOT.z0 + 1.2 + rng() * 0.8; }
      else { x = PLOT.x0 + 2 + t * (PLOT.x1 - PLOT.x0 - 4); z = PLOT.z1 - 1.3 - rng() * 0.8; }
      candidates.push({ x, z });
    }
    for (const c of candidates) {
      // Keep trees off the building, the garage, the pool and the drive.
      const nearBuilding = c.x > SHELL.x0 - 2.2 && c.x < SHELL.x1 + 2.2 && c.z > SHELL.z0 - 2.2 && c.z < SHELL.z1 + 2.2;
      const nearGarage = c.x > GARAGE.x0 - 1.6 && c.x < GARAGE.x1 && c.z > GARAGE.z0 - 1.6 && c.z < GARAGE.z1 + 5;
      const nearDrive = c.x > SITE.driveway.x0 - 1.2 && c.x < SITE.driveway.x1 + 1.2 && c.z > SITE.driveway.z0 - 1;
      const nearPool = c.x > SITE.poolDeck.x0 - 1 && c.x < SITE.poolDeck.x1 + 1 && c.z > SITE.poolDeck.z0 - 1 && c.z < SITE.poolDeck.z1 + 1;
      const nearPortico = c.x > PORTICO.x0 - 2 && c.x < PORTICO.x1 + 2 && c.z > PORTICO.z0 && c.z < PORTICO.z1 + 3;
      if (nearBuilding || nearGarage || nearDrive || nearPool || nearPortico) continue;
      spots.push({ x: c.x, z: c.z, scale: 0.75 + rng() * 0.6, rot: rng() * Math.PI * 2 });
    }
    const count = Math.max(8, Math.round(spots.length * density));
    return spots.slice(0, count);
  })();

  {
    const trunkGeo = new THREE.CylinderGeometry(0.10, 0.17, 2.6, 7);
    const trunkMat = materials.make('woodDark', { colour: 0x6a5340, roughness: 1 });
    const canopyGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const canopyMat = materials.make('grass', { colour: 0x5f7d43, roughness: 1 });
    canopyMat.flatShading = true;

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, planting.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, planting.length * 2);
    trunks.castShadow = true;
    canopies.castShadow = true;
    canopies.receiveShadow = true;
    trunks.name = 'site:treeTrunks';
    canopies.name = 'site:treeCanopies';

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let ci = 0;
    for (let i = 0; i < planting.length; i += 1) {
      const t = planting[i];
      p.set(t.x, SITE_LEVEL + 1.3 * t.scale, t.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      s.set(t.scale, t.scale, t.scale);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);

      for (let k = 0; k < 2; k += 1) {
        const lift = 2.5 + k * 0.85;
        p.set(t.x + (k ? 0.3 : -0.2) * t.scale, SITE_LEVEL + lift * t.scale, t.z + (k ? -0.25 : 0.2) * t.scale);
        s.setScalar(t.scale * (k ? 0.78 : 1.0));
        m.compose(p, q, s);
        canopies.setMatrixAt(ci, m);
        ci += 1;
      }
      collision.add(t.x - 0.22, SITE_LEVEL, t.z - 0.22, t.x + 0.22, SITE_LEVEL + 2.6 * t.scale, t.z + 0.22, 'tree');
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    trunks.userData.pkg = SITE_PKG.planting;
    canopies.userData.pkg = SITE_PKG.planting;
    trunks.userData.layer = 'external';
    canopies.userData.layer = 'external';
    root.add(trunks);
    root.add(canopies);
    elements.push(
      { name: 'site:treeTrunks', pkg: SITE_PKG.planting, layer: 'external', mesh: trunks, material: trunkMat, reveal: null, collision: [], growable: true },
      { name: 'site:treeCanopies', pkg: SITE_PKG.planting, layer: 'external', mesh: canopies, material: canopyMat, reveal: null, collision: [], growable: true },
    );
  }

  /* ------------------------------------------------- external lighting -- */
  const lamps = [];
  {
    const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.05, 8);
    const postMat = materials.make('steel', { colour: 0x23262c });
    const headGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const headMat = materials.make('steel', { colour: 0xf0e2c0, roughness: 0.4 });
    headMat.emissive = new THREE.Color(0xffd9a0);
    headMat.emissiveIntensity = 0;

    const positions = [];
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      positions.push({ x: SITE.driveway.x0 - 0.9, z: SITE.driveway.z0 + 0.6 + t * 7.2 });
      positions.push({ x: SITE.driveway.x1 + 0.9, z: SITE.driveway.z0 + 0.6 + t * 7.2 });
    }
    positions.push({ x: SITE.poolDeck.x0 + 0.5, z: SITE.poolDeck.z0 + 0.7 });
    positions.push({ x: SITE.poolDeck.x1 - 0.5, z: SITE.poolDeck.z1 - 0.7 });

    const posts = new THREE.InstancedMesh(postGeo, postMat, positions.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, positions.length);
    posts.castShadow = true;
    posts.name = 'site:lampPosts';
    heads.name = 'site:lampHeads';
    const m = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i += 1) {
      m.makeTranslation(positions[i].x, SITE_LEVEL + 0.52, positions[i].z);
      posts.setMatrixAt(i, m);
      m.makeTranslation(positions[i].x, SITE_LEVEL + 1.1, positions[i].z);
      heads.setMatrixAt(i, m);
      lamps.push({ x: positions[i].x, y: SITE_LEVEL + 1.1, z: positions[i].z });
    }
    posts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    for (const mesh of [posts, heads]) {
      mesh.userData.pkg = SITE_PKG.lighting;
      mesh.userData.layer = 'external';
      root.add(mesh);
    }
    elements.push(
      { name: 'site:lampPosts', pkg: SITE_PKG.lighting, layer: 'external', mesh: posts, material: postMat, reveal: null, collision: [] },
      { name: 'site:lampHeads', pkg: SITE_PKG.lighting, layer: 'external', mesh: heads, material: headMat, reveal: null, collision: [], emissive: true },
    );
  }

  collision.build();

  return { root, elements, lamps, trees: planting };
}
