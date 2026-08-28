/**
 * The architectural plan of Bagh-e-Shahi Manor.
 *
 * This module is pure data: the plot, the levels, every room as a rectangle,
 * every stair, every slab opening, and every door and window.  Nothing here
 * knows about three.js.  The geometry builder reads it, the collision world
 * reads it, the cost panel reads it and the guided tour reads it, so there is
 * exactly one description of the building and it cannot drift out of step
 * with itself.
 *
 * Convention: +X east, −Z north, +Y up, all dimensions in metres.
 * The principal elevation faces south, onto the forecourt and the gate.
 *
 *      z = +15  ┌──────── boundary wall, gate ────────┐   south
 *      z = +6.6 │        portico ┌────────┐           │
 *      z = +3   │  garage ┌──────┴────────┴────────┐  │
 *               │         │        MANSION         │  │
 *      z = −13  │         └────────────────────────┘  │
 *      z = −15  └─────────────────────────────────────┘   north
 *               x = −17                            x = +17
 *
 * Walls are *not* authored one by one.  Every room contributes its four
 * edges; edges that share a line are merged by interval union, so two rooms
 * either side of a partition produce exactly one wall, and a wall that runs
 * past three rooms is one continuous segment rather than three overlapping
 * ones.  Openings are authored in absolute coordinates and the builder
 * assigns each to the wall it lies on.
 */

/**
 * Finished external ground level. The house sits on a plinth, so the ground
 * floor is 450 mm above the garden — which is both how these houses are
 * actually built (flood and damp) and what gives the elevation its presence.
 */
export const SITE_LEVEL = -0.45;

/** The plot, its boundary and the site datum. */
export const PLOT = {
  x0: -17, x1: 17,
  z0: -15, z1: 15,
  areaM2: 1020,
  wallHeight: 2.4,
  wallThickness: 0.30,
  gate: { x0: -3.2, x1: 3.2, z: 15, height: 2.9 },
};

/**
 * Construction build-up, in metres. Everything stacks from these three
 * numbers, so a finished floor is always exactly at its level datum and a
 * player never stands 40 mm above or below where the plan says the floor is.
 *
 *   slabTop − 0.34  ┬ structural slab soffit  (= wallTop of the level below)
 *                   │ 0.30  reinforced concrete slab
 *   slabTop − 0.04  ┼
 *                   │ 0.04  screed and floor finish
 *   slabTop         ┴ walking surface of the level above
 *
 * The suspended ceiling of the level below hangs in the 0.12 m immediately
 * under the slab soffit.
 */
export const SLAB = { structural: 0.30, finish: 0.04, ceiling: 0.12, total: 0.34 };

/** Levels. `wallTop` is the slab soffit: slabTop − SLAB.total. */
export const LEVELS = [
  { id: 'basement', name: 'Basement', floor: -3.0, wallTop: -0.34, slabTop: 0, order: -1 },
  { id: 'ground', name: 'Ground floor', floor: 0, wallTop: 3.66, slabTop: 4.0, order: 0 },
  { id: 'first', name: 'First floor', floor: 4.0, wallTop: 7.26, slabTop: 7.6, order: 1 },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

export const ROOF = {
  level: 7.6,
  parapetTop: 8.75,
  parapetThickness: 0.28,
  domeCentre: { x: 0, z: 0.5 },
  domeRadius: 2.55,
  drumBottom: 8.6,
  drumTop: 11.1,
  domeTop: 13.7,
  finialTop: 15.0,
};

/** The building's outer rectangle — everything else sits inside it. */
export const SHELL = { x0: -10, x1: 10, z0: -13, z1: 3 };

/** The garage, an attached mass on the west side. */
export const GARAGE = {
  x0: -16.4, x1: -10, z0: -3, z1: 3,
  floor: 0, wallTop: 3.2, slabTop: 3.5, parapetTop: 4.3,
};

/** The portico: a two-storey order projecting from the principal elevation. */
export const PORTICO = {
  x0: -5, x1: 5, z0: 3, z1: 6.6,
  columnRadius: 0.38,
  columnBase: 0,
  columnTop: 7.0,
  entablatureTop: 8.05,
  pedimentTop: 10.2,
  terraceLevel: 4.0,
  balustradeTop: 5.05,
  /** Column centres, in world X, on the front row and the two returns. */
  frontRow: [-4.3, -2.58, -0.86, 0.86, 2.58, 4.3],
  returnZ: [4.4, 5.6],
};

/**
 * Rooms.
 *
 *   floor / wall / ceiling  name a texture recipe in engine/textures.js
 *   hole                    a rectangle with no floor slab (a double-height void)
 *   boq                     bill-of-quantities line ids attributed to this room
 *   category                groups rooms in the room-jump list
 */
export const ROOMS = [
  /* ------------------------------------------------------------ basement -- */
  { id: 'theatre', level: 'basement', name: 'Home cinema', x0: -8, x1: -2, z0: -7, z1: 1, floor: 'carpet', wall: 'fabric', ceiling: 'plaster', category: 'Leisure', boq: ['b.theatre'] },
  { id: 'basementLobby', level: 'basement', name: 'Basement lobby', x0: -2, x1: 3.5, z0: -7, z1: 1, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: [] },
  { id: 'gym', level: 'basement', name: 'Gymnasium', x0: 3.5, x1: 10, z0: -7, z1: 1, floor: 'tile', wall: 'plaster', ceiling: 'plaster', category: 'Leisure', boq: ['b.gym'] },
  { id: 'plant', level: 'basement', name: 'Plant room', x0: -8, x1: -2, z0: -11, z1: -7, floor: 'epoxy', wall: 'concrete', ceiling: null, category: 'Service', boq: ['b.generator', 'b.filter'] },
  { id: 'cellar', level: 'basement', name: 'Store & cellar', x0: -2, x1: 3.5, z0: -11, z1: -7, floor: 'epoxy', wall: 'plaster', ceiling: null, category: 'Service', boq: [] },
  { id: 'sauna', level: 'basement', name: 'Sauna & changing', x0: 3.5, x1: 8, z0: -11, z1: -7, floor: 'tile', wall: 'woodDark', ceiling: 'woodDark', category: 'Leisure', boq: ['b.sauna'] },
  { id: 'coreB', level: 'basement', name: 'Lift lobby (basement)', x0: 8, x1: 10, z0: -11, z1: -7, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: [] },

  /* -------------------------------------------------------------- ground -- */
  { id: 'majlis', level: 'ground', name: 'Majlis — formal living', x0: -10, x1: -3.5, z0: -2, z1: 3, floor: 'marbleWhite', wall: 'panel', ceiling: 'plaster', category: 'Reception', boq: ['b.furn.majlis', 'b.marble.recep'] },
  { id: 'foyer', level: 'ground', name: 'Grand foyer', x0: -3.5, x1: 3.5, z0: -2, z1: 3, floor: 'marbleWhite', wall: 'marbleWhite', ceiling: null, doubleHeight: true, category: 'Reception', boq: ['b.marble.foyer', 'b.chand.grand', 'b.door.main'] },
  { id: 'dining', level: 'ground', name: 'Formal dining', x0: 3.5, x1: 10, z0: -2, z1: 3, floor: 'marbleWhite', wall: 'panel', ceiling: 'plaster', category: 'Reception', boq: ['b.furn.dining'] },
  { id: 'kitchen', level: 'ground', name: 'Kitchen & breakfast', x0: -10, x1: -2, z0: -7, z1: -2, floor: 'tile', wall: 'plaster', ceiling: 'plaster', category: 'Service', boq: ['b.kitchen', 'b.kit.app'] },
  { id: 'stairHall', level: 'ground', name: 'Stair hall', x0: -2, x1: 3.5, z0: -7, z1: -2, floor: 'marbleWhite', wall: 'plaster', ceiling: null, category: 'Circulation', boq: ['b.stair.joinery', 'b.balustrade.int'] },
  { id: 'lounge', level: 'ground', name: 'Family lounge', x0: 3.5, x1: 10, z0: -7, z1: -2, floor: 'woodFloor', wall: 'paintWarm', ceiling: 'plaster', category: 'Reception', boq: ['b.furn.living'] },
  { id: 'corridorG', level: 'ground', name: 'Rear corridor', x0: -10, x1: 8, z0: -8.5, z1: -7, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: [] },
  { id: 'pantry', level: 'ground', name: 'Working pantry', x0: -10, x1: -6.5, z0: -13, z1: -8.5, floor: 'tile', wall: 'tile', ceiling: 'plaster', category: 'Service', boq: ['b.pantry'] },
  { id: 'guest', level: 'ground', name: 'Guest suite', x0: -6.5, x1: -1, z0: -13, z1: -8.5, floor: 'woodFloor', wall: 'paintWarm', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'powder', level: 'ground', name: 'Powder room & cloaks', x0: -1, x1: 1.5, z0: -13, z1: -8.5, floor: 'marbleDark', wall: 'marbleDark', ceiling: 'plaster', category: 'Service', boq: ['b.bath.powder'] },
  { id: 'service', level: 'ground', name: 'Service & staff room', x0: 1.5, x1: 8, z0: -13, z1: -8.5, floor: 'tile', wall: 'plaster', ceiling: 'plaster', category: 'Service', boq: [] },
  { id: 'coreG', level: 'ground', name: 'Lift lobby (ground)', x0: 8, x1: 10, z0: -13, z1: -7, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: ['b.lift'] },

  /* --------------------------------------------------------------- first -- */
  { id: 'master', level: 'first', name: 'Master bedroom', x0: -10, x1: -3.5, z0: -2, z1: 3, floor: 'woodFloor', wall: 'wallpaper', ceiling: 'plaster', category: 'Private', boq: ['b.furn.master'] },
  { id: 'gallery', level: 'first', name: 'Foyer gallery', x0: -3.5, x1: 3.5, z0: -2, z1: 3, floor: 'marbleWhite', wall: 'marbleWhite', ceiling: null, hole: { x0: -2.5, x1: 2.5, z0: -1, z1: 2 }, category: 'Circulation', boq: [] },
  { id: 'bed2', level: 'first', name: 'Bedroom 2', x0: 3.5, x1: 10, z0: -2, z1: 3, floor: 'woodFloor', wall: 'wallpaper', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'dressing', level: 'first', name: 'Master dressing', x0: -10, x1: -7, z0: -7, z1: -2, floor: 'woodFloor', wall: 'woodDark', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'masterBath', level: 'first', name: 'Master bathroom', x0: -7, x1: -3.5, z0: -7, z1: -2, floor: 'marbleWhite', wall: 'marbleWhite', ceiling: 'plaster', category: 'Private', boq: ['b.bath.master'] },
  { id: 'upperHall', level: 'first', name: 'Upper hall', x0: -3.5, x1: 3.5, z0: -7, z1: -2, floor: 'marbleWhite', wall: 'plaster', ceiling: null, hole: { x0: -1.9, x1: 1.5, z0: -6.1, z1: -2.3 }, category: 'Circulation', boq: [] },
  { id: 'bed3', level: 'first', name: 'Bedroom 3', x0: 3.5, x1: 10, z0: -7, z1: -2, floor: 'woodFloor', wall: 'wallpaper', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'corridorF', level: 'first', name: 'Bedroom corridor', x0: -10, x1: 8, z0: -8.5, z1: -7, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: [] },
  { id: 'study', level: 'first', name: 'Study & library', x0: -10, x1: -5, z0: -13, z1: -8.5, floor: 'woodFloor', wall: 'panel', ceiling: 'plaster', category: 'Private', boq: ['b.library', 'b.furn.office'] },
  { id: 'bed4', level: 'first', name: 'Bedroom 4', x0: -5, x1: -0.5, z0: -13, z1: -8.5, floor: 'woodFloor', wall: 'wallpaper', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'bed5', level: 'first', name: 'Bedroom 5', x0: -0.5, x1: 4, z0: -13, z1: -8.5, floor: 'woodFloor', wall: 'wallpaper', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'familyRoom', level: 'first', name: 'Family sitting room', x0: 4, x1: 8, z0: -13, z1: -8.5, floor: 'carpet', wall: 'paintWarm', ceiling: 'plaster', category: 'Private', boq: [] },
  { id: 'coreF', level: 'first', name: 'Lift lobby (first)', x0: 8, x1: 10, z0: -13, z1: -7, floor: 'marbleLocal', wall: 'plaster', ceiling: 'plaster', category: 'Circulation', boq: [] },
];

export const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

/**
 * Openings in slabs: stairwells and the double-height voids.  Rectangles here
 * are subtracted from the slab above the named level.
 */
export const SLAB_HOLES = [
  // Ground floor slab (over the basement): the basement stair.
  { level: 'basement', x0: 1.6, x1: 3.4, z0: -6.8, z1: -3.0 },
  // First floor slab (over the ground floor): the main stairwell and the
  // double-height foyer void.
  { level: 'ground', x0: -1.9, x1: 1.5, z0: -6.1, z1: -2.3 },
  { level: 'ground', x0: -2.5, x1: 2.5, z0: -1, z1: 2 },
  // Roof slab: the oculus over the foyer, glazed under the cupola.
  { level: 'first', x0: -2.5, x1: 2.5, z0: -1, z1: 2 },
];

/**
 * Stairs.  Each flight is a run of treads; the builder makes one box per
 * tread, which is what lets the collision world's step-up handle them without
 * any special case.
 */
export const STAIRS = [
  {
    id: 'stairBasement', name: 'Basement stair', level: 'basement',
    x0: 1.7, x1: 3.3, zStart: -6.6, zEnd: -3.2, yStart: -3.0, yEnd: 0,
    risers: 12, material: 'marbleLocal', railSide: 'both',
  },
  {
    id: 'stairMain1', name: 'Grand stair — lower flight', level: 'ground',
    x0: -1.8, x1: -0.3, zStart: -2.4, zEnd: -5.0, yStart: 0, yEnd: 2.0,
    risers: 9, material: 'marbleWhite', railSide: 'both',
  },
  {
    id: 'stairMain2', name: 'Grand stair — upper flight', level: 'ground',
    x0: -0.1, x1: 1.4, zStart: -5.0, zEnd: -2.4, yStart: 2.0, yEnd: 4.0,
    risers: 9, material: 'marbleWhite', railSide: 'both',
  },
];

/** The half-landing between the two flights of the grand stair. */
export const LANDINGS = [
  { id: 'stairLanding', x0: -1.8, x1: 1.4, z0: -6.0, z1: -5.0, y: 2.0, material: 'marbleWhite' },
];

/** The lift shaft, which rises through every level at one position. */
export const LIFT = {
  x0: 8.25, x1: 9.75, z0: -10.4, z1: -8.7,
  levels: ['basement', 'ground', 'first'],
  doorWidth: 1.0,
  doorHeight: 2.15,
  /** Doors open on the −Z face into each lift lobby. */
  face: 'z0',
};

/**
 * Doors.  `axis` is the axis the wall runs along, so a door in a wall running
 * east–west has axis 'x'.  Every door is a real, openable object with a cost.
 */
export const DOORS = [
  /* ------------------------------------------------ external, ground ----- */
  { id: 'doorMain', name: 'Main entrance door', level: 'ground', axis: 'x', x: 0, z: 3, width: 1.9, height: 2.75, kind: 'double', swing: -1, material: 'woodDark', boq: 'b.door.main', exterior: true },
  { id: 'doorGardenW', name: 'Garden door — majlis', level: 'ground', axis: 'z', x: -10, z: 0.6, width: 1.5, height: 2.45, kind: 'french', swing: -1, material: 'woodDark', boq: 'b.door.french', exterior: true },
  { id: 'doorGardenE', name: 'Garden door — dining', level: 'ground', axis: 'z', x: 10, z: 0.6, width: 1.5, height: 2.45, kind: 'french', swing: 1, material: 'woodDark', boq: 'b.door.french', exterior: true },
  { id: 'doorLoungeE', name: 'Terrace door — lounge', level: 'ground', axis: 'z', x: 10, z: -4.5, width: 1.5, height: 2.45, kind: 'french', swing: 1, material: 'woodDark', boq: 'b.door.french', exterior: true },
  { id: 'doorService', name: 'Service entrance', level: 'ground', axis: 'x', x: 4.5, z: -13, width: 1.0, height: 2.25, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.side', exterior: true },
  { id: 'doorPantryN', name: 'Pantry service door', level: 'ground', axis: 'x', x: -8.2, z: -13, width: 0.95, height: 2.25, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.side', exterior: true },
  { id: 'doorKitchenW', name: 'Kitchen yard door', level: 'ground', axis: 'z', x: -10, z: -5.2, width: 1.0, height: 2.25, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.side', exterior: true },

  /* ------------------------------------------------ internal, ground ----- */
  { id: 'doorMajlis', name: 'Majlis doors', level: 'ground', axis: 'z', x: -3.5, z: 0.8, width: 1.7, height: 2.5, kind: 'double', swing: 1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'doorDining', name: 'Dining doors', level: 'ground', axis: 'z', x: 3.5, z: 0.8, width: 1.7, height: 2.5, kind: 'double', swing: -1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'archFoyer', name: 'Foyer arch to stair hall', level: 'ground', axis: 'x', x: 0.75, z: -2, width: 2.6, height: 2.9, kind: 'arch' },
  { id: 'doorKitchen', name: 'Kitchen door', level: 'ground', axis: 'z', x: -2, z: -4.4, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorLounge', name: 'Lounge doors', level: 'ground', axis: 'z', x: 3.5, z: -4.4, width: 1.6, height: 2.4, kind: 'double', swing: -1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'doorDiningLounge', name: 'Dining to lounge door', level: 'ground', axis: 'x', x: 7.2, z: -2, width: 1.1, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'archStairCorr', name: 'Stair hall to corridor', level: 'ground', axis: 'x', x: 1.6, z: -7, width: 1.8, height: 2.5, kind: 'arch' },
  { id: 'doorKitchenCorr', name: 'Kitchen corridor door', level: 'ground', axis: 'x', x: -6, z: -7, width: 1.0, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorPantry', name: 'Pantry door', level: 'ground', axis: 'x', x: -8.2, z: -8.5, width: 0.95, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorGuest', name: 'Guest suite door', level: 'ground', axis: 'x', x: -4.5, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorPowder', name: 'Powder room door', level: 'ground', axis: 'x', x: 0.25, z: -8.5, width: 0.9, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorServiceInt', name: 'Service room door', level: 'ground', axis: 'x', x: 3.2, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorCoreG', name: 'Lift lobby door', level: 'ground', axis: 'z', x: 8, z: -7.75, width: 1.0, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.fire' },

  /* -------------------------------------------------- internal, first ---- */
  { id: 'doorMaster', name: 'Master bedroom doors', level: 'first', axis: 'z', x: -3.5, z: 0.8, width: 1.6, height: 2.45, kind: 'double', swing: 1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'doorBed2', name: 'Bedroom 2 door', level: 'first', axis: 'z', x: 3.5, z: 0.8, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'doorDressing', name: 'Dressing room door', level: 'first', axis: 'x', x: -8.5, z: -2, width: 1.0, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorMasterBath', name: 'Master bathroom door', level: 'first', axis: 'z', x: -7, z: -4.4, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'archUpper', name: 'Gallery to upper hall', level: 'first', axis: 'x', x: 2.4, z: -2, width: 1.9, height: 2.6, kind: 'arch' },
  { id: 'doorBathHall', name: 'Bathroom lobby door', level: 'first', axis: 'z', x: -3.5, z: -4.4, width: 1.0, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorBed3', name: 'Bedroom 3 door', level: 'first', axis: 'z', x: 3.5, z: -4.4, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'archUpperCorr', name: 'Upper hall to corridor', level: 'first', axis: 'x', x: 1.6, z: -7, width: 1.8, height: 2.5, kind: 'arch' },
  { id: 'doorStudy', name: 'Study door', level: 'first', axis: 'x', x: -7.5, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.prem' },
  { id: 'doorBed4', name: 'Bedroom 4 door', level: 'first', axis: 'x', x: -3, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorBed5', name: 'Bedroom 5 door', level: 'first', axis: 'x', x: 1.5, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorFamily', name: 'Family room door', level: 'first', axis: 'x', x: 6, z: -8.5, width: 1.0, height: 2.3, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorCoreF', name: 'Lift lobby door (first)', level: 'first', axis: 'z', x: 8, z: -7.75, width: 1.0, height: 2.3, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.fire' },
  { id: 'doorTerrace', name: 'Terrace doors', level: 'first', axis: 'x', x: 0, z: 3, width: 1.8, height: 2.5, kind: 'french', swing: 1, material: 'woodDark', boq: 'b.door.french', exterior: true },
  { id: 'doorBalcE', name: 'Balcony door — bedroom 2', level: 'first', axis: 'z', x: 10, z: 0.6, width: 1.2, height: 2.4, kind: 'french', swing: 1, material: 'woodDark', boq: 'b.door.french', exterior: true },
  { id: 'doorBalcW', name: 'Balcony door — master', level: 'first', axis: 'z', x: -10, z: 0.6, width: 1.2, height: 2.4, kind: 'french', swing: -1, material: 'woodDark', boq: 'b.door.french', exterior: true },

  /* ----------------------------------------------- internal, basement ---- */
  { id: 'doorTheatre', name: 'Cinema door', level: 'basement', axis: 'z', x: -2, z: -3.5, width: 1.1, height: 2.2, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.fire' },
  { id: 'doorGym', name: 'Gymnasium door', level: 'basement', axis: 'z', x: 3.5, z: -3.5, width: 1.1, height: 2.2, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorPlant', name: 'Plant room door', level: 'basement', axis: 'x', x: -5, z: -7, width: 1.0, height: 2.2, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.fire' },
  { id: 'doorCellar', name: 'Cellar door', level: 'basement', axis: 'x', x: 0.75, z: -7, width: 1.0, height: 2.2, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorSauna', name: 'Sauna door', level: 'basement', axis: 'z', x: 3.5, z: -9, width: 0.9, height: 2.1, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.int' },
  { id: 'doorCoreB', name: 'Lift lobby door (basement)', level: 'basement', axis: 'z', x: 8, z: -9, width: 1.0, height: 2.2, kind: 'single', swing: -1, material: 'woodDark', boq: 'b.door.fire' },

  /* ------------------------------------------------------- garage link ---- */
  { id: 'doorGarageLink', name: 'Garage to house door', level: 'ground', axis: 'z', x: -10, z: -1.2, width: 1.0, height: 2.25, kind: 'single', swing: 1, material: 'woodDark', boq: 'b.door.fire', exterior: true, garageLink: true },
];

/** The two sectional garage doors, on the garage's south face. */
export const GARAGE_DOORS = [
  { id: 'garageL', name: 'Garage door — left bay', x: -14.7, z: 3, width: 2.7, height: 2.5, boq: 'b.door.garage' },
  { id: 'garageR', name: 'Garage door — right bay', x: -11.5, z: 3, width: 2.7, height: 2.5, boq: 'b.door.garage' },
];



/**
 * Window runs.  Each run places `count` windows evenly between `from` and
 * `to` along an exterior wall, which is far less error-prone than authoring
 * ninety window positions by hand and keeps the elevations regular.
 */
export const WINDOW_RUNS = [
  /* ---------------------------------------------- ground, south front ---- */
  { id: 'wGS1', level: 'ground', axis: 'x', at: 3, from: -9.4, to: -4.2, count: 2, width: 1.35, sill: 0.85, head: 2.9, style: 'arch', boq: 'b.win.arch', room: 'majlis' },
  { id: 'wGS2', level: 'ground', axis: 'x', at: 3, from: 4.2, to: 9.4, count: 2, width: 1.35, sill: 0.85, head: 2.9, style: 'arch', boq: 'b.win.arch', room: 'dining' },
  /* ------------------------------------------------------- ground, west -- */
  { id: 'wGW1', level: 'ground', axis: 'z', at: -10, z0: -1.4, z1: 2.4, count: 2, width: 1.2, sill: 0.9, head: 2.8, style: 'casement', boq: 'b.win.gf', room: 'majlis' },
  { id: 'wGW2', level: 'ground', axis: 'z', at: -10, z0: -6.6, z1: -5.8, count: 1, width: 1.2, sill: 1.1, head: 2.6, style: 'casement', boq: 'b.win.gf', room: 'kitchen' },
  { id: 'wGW3', level: 'ground', axis: 'z', at: -10, z0: -12.4, z1: -9.0, count: 2, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.gf', room: 'pantry' },
  /* ------------------------------------------------------- ground, east -- */
  { id: 'wGE1', level: 'ground', axis: 'z', at: 10, z0: -1.4, z1: 2.4, count: 2, width: 1.2, sill: 0.9, head: 2.8, style: 'casement', boq: 'b.win.gf', room: 'dining' },
  { id: 'wGE2', level: 'ground', axis: 'z', at: 10, z0: -6.6, z1: -5.6, count: 1, width: 1.2, sill: 0.9, head: 2.8, style: 'casement', boq: 'b.win.gf', room: 'lounge' },
  { id: 'wGE3', level: 'ground', axis: 'z', at: 10, z0: -12.4, z1: -8.2, count: 2, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.gf', room: 'coreG' },
  /* ------------------------------------------------------ ground, north -- */
  { id: 'wGN1', level: 'ground', axis: 'x', at: -13, from: -5.8, to: -1.8, count: 2, width: 1.2, sill: 0.9, head: 2.7, style: 'casement', boq: 'b.win.gf', room: 'guest' },
  { id: 'wGN2', level: 'ground', axis: 'x', at: -13, from: 1.9, to: 3.6, count: 1, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.gf', room: 'service' },
  { id: 'wGN3', level: 'ground', axis: 'x', at: -13, from: 6.2, to: 9.4, count: 2, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.gf', room: 'coreG' },

  /* ----------------------------------------------- first, south front ---- */
  { id: 'wFS1', level: 'first', axis: 'x', at: 3, from: -9.4, to: -4.2, count: 2, width: 1.35, sill: 0.8, head: 2.75, style: 'arch', boq: 'b.win.arch', room: 'master' },
  { id: 'wFS2', level: 'first', axis: 'x', at: 3, from: 4.2, to: 9.4, count: 2, width: 1.35, sill: 0.8, head: 2.75, style: 'arch', boq: 'b.win.arch', room: 'bed2' },
  /* -------------------------------------------------------- first, west -- */
  { id: 'wFW1', level: 'first', axis: 'z', at: -10, z0: -1.4, z1: 2.4, count: 2, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'master' },
  { id: 'wFW2', level: 'first', axis: 'z', at: -10, z0: -6.5, z1: -2.5, count: 2, width: 1.0, sill: 1.3, head: 2.5, style: 'casement', boq: 'b.win.ff', room: 'dressing' },
  { id: 'wFW3', level: 'first', axis: 'z', at: -10, z0: -12.4, z1: -9.0, count: 2, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'study' },
  /* -------------------------------------------------------- first, east -- */
  { id: 'wFE1', level: 'first', axis: 'z', at: 10, z0: -1.4, z1: 2.4, count: 2, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'bed2' },
  { id: 'wFE2', level: 'first', axis: 'z', at: 10, z0: -6.5, z1: -2.5, count: 2, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'bed3' },
  { id: 'wFE3', level: 'first', axis: 'z', at: 10, z0: -12.4, z1: -8.2, count: 2, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.ff', room: 'coreF' },
  /* ------------------------------------------------------- first, north -- */
  { id: 'wFN1', level: 'first', axis: 'x', at: -13, from: -9.2, to: -5.8, count: 2, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'study' },
  { id: 'wFN2', level: 'first', axis: 'x', at: -13, from: -4.2, to: -1.3, count: 2, width: 1.1, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'bed4' },
  { id: 'wFN3', level: 'first', axis: 'x', at: -13, from: 0.3, to: 3.2, count: 2, width: 1.1, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'bed5' },
  { id: 'wFN4', level: 'first', axis: 'x', at: -13, from: 5.0, to: 7.2, count: 1, width: 1.2, sill: 0.85, head: 2.7, style: 'casement', boq: 'b.win.ff', room: 'familyRoom' },
  { id: 'wFN5', level: 'first', axis: 'x', at: -13, from: 8.4, to: 9.6, count: 1, width: 1.0, sill: 1.2, head: 2.5, style: 'casement', boq: 'b.win.ff', room: 'coreF' },
];

/** Garage windows — high clerestory strips on the west wall. */
export const GARAGE_WINDOWS = [
  { id: 'wGar1', x: -16.4, z: -1.6, axis: 'z', width: 1.2, sill: 2.1, head: 2.9, boq: 'b.win.gf' },
  { id: 'wGar2', x: -16.4, z: 1.0, axis: 'z', width: 1.2, sill: 2.1, head: 2.9, boq: 'b.win.gf' },
];

/** Wall thicknesses, by role. */
export const THICKNESS = {
  exterior: 0.34,
  interior: 0.16,
  party: 0.24,
  basement: 0.32,
  parapet: 0.28,
};

/**
 * External works: the drive, the forecourt, the pool, the fountain, the lawns
 * and the planting beds.  Rectangles in plan, at the levels they sit at.
 */
export const SITE = {
  driveway: { x0: -3.6, x1: 3.6, z0: 6.6, z1: 15, y: 0.02 },
  forecourt: { x0: -8.5, x1: 8.5, z0: 3, z1: 8.4, y: 0.02 },
  garageApron: { x0: -16.4, x1: -10, z0: 3, z1: 7.2, y: 0.02 },
  fountain: { x: 0, z: 11.2, radius: 2.15, basinHeight: 0.55 },
  pool: { x0: 11.6, x1: 15.6, z0: -8.6, z1: 1.4, depth: 1.55, coping: 0.32 },
  poolDeck: { x0: 10.6, x1: 16.6, z0: -9.8, z1: 2.6, y: 0.04 },
  lawnWest: { x0: -16.6, x1: -10.4, z0: -14.6, z1: -3.4 },
  lawnFrontW: { x0: -16.6, x1: -4.0, z0: 8.6, z1: 14.6 },
  lawnFrontE: { x0: 4.0, x1: 16.6, z0: 8.6, z1: 14.6 },
  lawnNorth: { x0: -9.6, x1: 9.6, z0: -14.6, z1: -13.4 },
  guardPost: { x0: 4.4, x1: 7.0, z0: 12.4, z1: 14.6, height: 2.9 },
};

/**
 * Spawn points used by the room-jump list and by the guided tours.
 *
 * `yaw` follows the camera convention: forward is (−sin yaw, 0, −cos yaw), so
 *
 *      yaw 0     → north (−Z), into the house from the forecourt
 *      yaw  π/2  → west  (−X)
 *      yaw  π    → south (+Z), back down the drive
 *      yaw −π/2  → east  (+X)
 *
 * Each one stands where a visitor would naturally stand and looks at what
 * the room is for.
 */
export const SPAWNS = [
  { id: 'gate', name: 'At the gate', category: 'Approach', x: 0, y: -0.4, z: 13.2, yaw: 0 },
  { id: 'forecourt', name: 'Forecourt', category: 'Approach', x: 0, y: -0.4, z: 8.2, yaw: 0 },
  { id: 'portico', name: 'Under the portico', category: 'Approach', x: 0, y: 0, z: 5.4, yaw: 0 },
  { id: 'pool', name: 'Poolside', category: 'Approach', x: 13.6, y: -0.4, z: 1.9, yaw: 0 },
  { id: 'garage', name: 'Garage', category: 'Approach', x: -13.2, y: 0, z: 1.2, yaw: 0 },

  { id: 'foyer', name: 'Grand foyer', category: 'Reception', x: 0, y: 0, z: 1.7, yaw: 0 },
  { id: 'majlis', name: 'Majlis', category: 'Reception', x: -4.4, y: 0, z: 0.5, yaw: Math.PI * 0.5 },
  { id: 'dining', name: 'Formal dining', category: 'Reception', x: 4.4, y: 0, z: 0.5, yaw: -Math.PI * 0.5 },
  { id: 'lounge', name: 'Family lounge', category: 'Reception', x: 4.4, y: 0, z: -4.5, yaw: -Math.PI * 0.5 },
  { id: 'stairHall', name: 'Stair hall', category: 'Reception', x: 2.7, y: 0, z: -2.8, yaw: Math.PI * 0.5 },

  { id: 'kitchen', name: 'Kitchen', category: 'Service', x: -3.0, y: 0, z: -4.5, yaw: Math.PI * 0.5 },
  { id: 'guest', name: 'Guest suite', category: 'Service', x: -2.0, y: 0, z: -10.8, yaw: Math.PI * 0.5 },
  { id: 'corridorG', name: 'Rear corridor', category: 'Service', x: -1.0, y: 0, z: -7.75, yaw: Math.PI * 0.5 },

  { id: 'gallery', name: 'Foyer gallery', category: 'First floor', x: 0, y: 4, z: 2.6, yaw: 0 },
  { id: 'master', name: 'Master bedroom', category: 'First floor', x: -4.4, y: 4, z: 0.5, yaw: Math.PI * 0.5 },
  { id: 'terrace', name: 'Portico terrace', category: 'First floor', x: 0, y: 4, z: 4.7, yaw: Math.PI },
  { id: 'upperHall', name: 'Upper hall', category: 'First floor', x: 2.7, y: 4, z: -4.5, yaw: Math.PI * 0.5 },
  { id: 'bed3', name: 'Bedroom 3', category: 'First floor', x: 4.4, y: 4, z: -4.5, yaw: -Math.PI * 0.5 },
  { id: 'study', name: 'Study & library', category: 'First floor', x: -6.0, y: 4, z: -10.8, yaw: Math.PI * 0.5 },

  { id: 'theatre', name: 'Home cinema', category: 'Basement', x: -5.0, y: -3, z: -4.6, yaw: 0 },
  { id: 'gym', name: 'Gymnasium', category: 'Basement', x: 6.6, y: -3, z: -4.6, yaw: 0 },
  { id: 'basementLobby', name: 'Basement lobby', category: 'Basement', x: 0.6, y: -3, z: -1.5, yaw: 0 },
];

export const SPAWN_BY_ID = new Map(SPAWNS.map((s) => [s.id, s]));

/**
 * Validate the plan at load: rooms must sit inside their shell, must not
 * overlap another room on the same level, and every door and window must
 * actually land on a wall line.  A plan error would otherwise show up as a
 * hole in a wall or a door floating in mid-air, which is exactly the class of
 * bug that is hard to find by walking around.
 */
export function validatePlan() {
  const problems = [];

  for (const room of ROOMS) {
    if (!LEVEL_BY_ID.has(room.level)) problems.push(`room ${room.id}: unknown level "${room.level}"`);
    if (room.x1 <= room.x0 || room.z1 <= room.z0) problems.push(`room ${room.id}: degenerate rectangle`);
    if (room.hole) {
      const h = room.hole;
      if (h.x0 < room.x0 || h.x1 > room.x1 || h.z0 < room.z0 || h.z1 > room.z1) {
        problems.push(`room ${room.id}: hole is not inside the room`);
      }
    }
  }

  // Overlap check, per level.
  for (const level of LEVELS) {
    const list = ROOMS.filter((r) => r.level === level.id);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (overlapX > 1e-6 && overlapZ > 1e-6) {
          problems.push(`rooms ${a.id} and ${b.id} overlap on ${level.id} by ${overlapX.toFixed(2)} × ${overlapZ.toFixed(2)} m`);
        }
      }
    }
  }

  // Every door must sit on a line that some room edge occupies.
  const lines = new Map();
  for (const room of ROOMS) {
    const key = (axis, at) => `${room.level}|${axis}|${at.toFixed(3)}`;
    for (const [axis, at, lo, hi] of [
      ['x', room.z0, room.x0, room.x1],
      ['x', room.z1, room.x0, room.x1],
      ['z', room.x0, room.z0, room.z1],
      ['z', room.x1, room.z0, room.z1],
    ]) {
      const k = key(axis, at);
      const list = lines.get(k) || [];
      list.push([lo, hi]);
      lines.set(k, list);
    }
  }
  // Merge the intervals on each line first: two rooms side by side produce
  // one continuous wall, and an opening is allowed to sit across the join.
  const merged = new Map();
  for (const [key, list] of lines) {
    const sorted = list.slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [lo, hi] of sorted) {
      const last = out[out.length - 1];
      if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi);
      else out.push([lo, hi]);
    }
    merged.set(key, out);
  }
  const onLine = (level, axis, at, pos, width) => {
    const list = merged.get(`${level}|${axis}|${at.toFixed(3)}`);
    if (!list) return false;
    return list.some(([lo, hi]) => pos - width / 2 >= lo - 1e-6 && pos + width / 2 <= hi + 1e-6);
  };

  for (const door of DOORS) {
    const at = door.axis === 'x' ? door.z : door.x;
    const pos = door.axis === 'x' ? door.x : door.z;
    if (!onLine(door.level, door.axis, at, pos, door.width)) {
      problems.push(`door ${door.id}: does not lie within a wall on ${door.level} (${door.axis} at ${at})`);
    }
  }
  for (const run of WINDOW_RUNS) {
    const from = run.axis === 'x' ? run.from : run.z0;
    const to = run.axis === 'x' ? run.to : run.z1;
    if (from === undefined || to === undefined) {
      problems.push(`window run ${run.id}: missing extent`);
      continue;
    }
    if (to <= from) problems.push(`window run ${run.id}: extent is not increasing`);
    const centre = (from + to) / 2;
    const span = to - from;
    if (!onLine(run.level, run.axis, run.at, centre, span)) {
      problems.push(`window run ${run.id}: does not lie within a wall on ${run.level}`);
    }
  }

  // Stairs must rise the full storey height they claim.
  for (const stair of STAIRS) {
    const rise = stair.yEnd - stair.yStart;
    if (rise <= 0) problems.push(`stair ${stair.id}: does not rise`);
    const riser = rise / stair.risers;
    if (riser < 0.14 || riser > 0.26) {
      problems.push(`stair ${stair.id}: riser ${riser.toFixed(3)} m is outside 0.14–0.26 m`);
    }
    const run = Math.abs(stair.zEnd - stair.zStart) / stair.risers;
    if (run < 0.22) problems.push(`stair ${stair.id}: going ${run.toFixed(3)} m is too shallow`);
  }

  return problems;
}

/** Total floor area, computed from the plan rather than asserted. */
export function coveredArea() {
  let total = 0;
  for (const room of ROOMS) total += (room.x1 - room.x0) * (room.z1 - room.z0);
  total += (GARAGE.x1 - GARAGE.x0) * (GARAGE.z1 - GARAGE.z0);
  return total;
}

/** Area of one room, in square metres. */
export function roomArea(room) {
  const gross = (room.x1 - room.x0) * (room.z1 - room.z0);
  if (!room.hole) return gross;
  return gross - (room.hole.x1 - room.hole.x0) * (room.hole.z1 - room.hole.z0);
}
