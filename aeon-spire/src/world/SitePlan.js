/**
 * AEON SPIRE — the site plan.
 *
 * A single source of truth for every dimension in the project. The massing,
 * the facade pass, the interiors, the construction timeline, the collision
 * volumes and the camera presets all read from here, so the building can be
 * re-proportioned in one place without anything drifting out of alignment.
 *
 * Units are metres. Y is up. The tower's centre is the origin.
 *
 * Overall height 700 m (Section C), reached as:
 *   podium 18 · sail atrium 124 · ring deck 110 · spire crown occupied 148 ·
 *   lattice spire 300  =  700 m to the tip of the mast.
 */

export const SITE = {
  /** Overall extent of the modelled ground plane. */
  extent: 6000,
  /** Radius inside which the detailed plaza paving is laid. */
  plazaRadius: 470,
  seaLevel: 0
};

/* ------------------------------------------------------------------ */
/* Vertical stacking                                                   */
/* ------------------------------------------------------------------ */

export const LEVELS = {
  /* Zone 1 — Canal Concourse (B2 … L3).
     The canal is a sunken ring 8 m below the plaza, so the B2 Water Arrival
     Hall sits at dock level, one metre clear of the water. */
  B2: -7.0,
  B1: -3.0,
  L1: 0.0,
  L2: 6.2,
  L3: 12.0,
  podiumTop: 24.0,

  /* Zone 2 — Sail Atrium (L4 … L30) */
  L4: 24.0,
  L7: 40.0,
  L30: 178.0,
  sailTop: 178.0,

  /* Zone 3 — Ring Deck (L31 … L55). The disc is 80 m in elevation, so it
     reads as a disc rather than a bulge on a stem. */
  L31: 178.0,
  ringMid: 230.0,
  L55: 282.0,
  ringTop: 282.0,

  /* Zone 4 — Spire Crown (L56 … L88, then the lattice spire).
     The occupied crown is a real tower body of 164 m, and the spire above it
     is a 270 m needle at roughly 30:1 slenderness — not a cone. */
  L56: 282.0,
  L88: 440.0,
  crownTop: 440.0,
  spireTip: 700.0,
  /** The tuned-mass-damper chamber sits inside the lattice spire, above the
      last occupied floor at 430 m — not below it. */
  damperFloor: 492.0,
  /** The beacon room caps the habitable part of the mast. */
  beaconFloor: 626.0,

  /** Nominal floor-to-floor used when generating repeating plates. */
  floorHeight: 4.55
};

/** Convert a named building level (4…88) to its world height. */
export function levelHeight(level) {
  if (level <= 3) return LEVELS.L1 + (level - 1) * 6.0;
  if (level <= 30) return LEVELS.L4 + (level - 4) * ((LEVELS.L30 - LEVELS.L4) / 26);
  if (level <= 55) return LEVELS.L31 + (level - 31) * ((LEVELS.L55 - LEVELS.L31) / 24);
  return LEVELS.L56 + (level - 56) * ((LEVELS.L88 - LEVELS.L56) / 32);
}

/* ------------------------------------------------------------------ */
/* Zone 1 — The Canal Concourse                                        */
/* ------------------------------------------------------------------ */

export const CANAL = {
  /** Podium is a rounded square; this is its half-width. A superellipse
      plan of this half-width reaches ~108 m at its corners, so the canal's
      inner edge sits at 114 m to leave a continuous quay all the way round. */
  podiumHalf: 96,
  podiumCorner: 34,
  /** Navigable canal ring. */
  innerRadius: 114,
  outerRadius: 138,
  get midRadius() { return (this.innerRadius + this.outerRadius) / 2; },
  waterLevel: -8.0,
  depth: 3.2,
  /** Dock level on the podium side (the B2 arrival hall's floor). */
  quayLevel: -7.0,
  /** Top of the retaining walls — this is the plaza you look down from. */
  copingLevel: 0.3,
  /** Four arched stone footbridges on the cardinal axes. */
  bridgeAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
  bridgeWidth: 9,
  bridgeRise: 5.4,
  /** Shuttle-boat mooring piers. */
  pierAngles: [0.42, 1.99, 3.56, 5.13],
  boatCount: 6
};

/* ------------------------------------------------------------------ */
/* Zone 2 — The Sail Atrium                                            */
/* ------------------------------------------------------------------ */

export const SAIL = {
  base: LEVELS.L4,
  top: LEVELS.sailTop,
  /** Tower plan at the base of the sail (half-extents, X × Z). */
  baseHalfX: 44,
  baseHalfZ: 35,
  /** Plan at the top of the sail. */
  topHalfX: 33,
  topHalfZ: 27,
  /** The sail shell springs from the +X face and leans over the atrium. */
  sailFace: 1,
  sailChord: 104,
  sailMaxOffset: 54,
  /** The full-height atrium void sits between the core and the sail skin. */
  atriumHalfX: 29,
  atriumHalfZ: 23,
  /** Structural diagrid module. */
  diagridBays: 12,
  diagridCourses: 9,
  /** Sky-bridges crossing the atrium void. */
  bridgeLevels: [8, 13, 18, 23, 28],
  /** Levels that get a modelled typical-floor interior. */
  typicalFloors: [7, 11, 15, 19, 23, 27, 29]
};

/* ------------------------------------------------------------------ */
/* Zone 3 — The Ring Deck                                              */
/* ------------------------------------------------------------------ */

export const RING = {
  base: LEVELS.L31,
  top: LEVELS.ringTop,
  /**
   * The disc stands on edge like a coin: circular in elevation (radius 55,
   * which is exactly half the 110 m the zone spans) and only 44 m thick in
   * plan. That is the Aldar HQ engineering idea — a circular diagrid disc —
   * rather than the bulging solid a radius-varying loft would produce.
   */
  /* 104 m across in elevation against a 48-66 m tower, but only 30 m thick:
     the disc must out-reach the shaft from every bearing, or it reads as a
     bulge on a stem rather than a disc standing on edge. */
  discRadius: 52,
  discThickHalf: 15,
  discCentreY: 230.0,
  discInner: 15,
  /** The cantilevered, glass-bottomed halo walkway, clear of the disc. */
  haloRadius: 70,
  haloWidth: 7.2,
  haloLevel: 230.0,
  /** Perimeter truss follows the disc's circular rim in elevation. */
  trussBays: 40,
  rakerCount: 20,
  /** Sky gardens punctuate the ring at these bearings (radians). */
  gardenAngles: [0.6, 2.2, 3.8, 5.4],
  observationAngle: -Math.PI / 2,
  /** Seismic damper / structural joint viewing gallery. */
  damperAngle: Math.PI * 0.78,
  floors: [31, 36, 41, 46, 51, 55]
};

/* ------------------------------------------------------------------ */
/* Zone 4 — The Spire Crown                                            */
/* ------------------------------------------------------------------ */

export const SPIRE = {
  base: LEVELS.L56,
  crownTop: LEVELS.crownTop,
  tip: LEVELS.spireTip,
  /** Occupied crown tapers from this half-width to this one. */
  baseHalf: 24,
  topHalf: 11,
  /** The lattice spire: a needle, not a cone. */
  latticeBase: 9,
  latticeTip: 0.4,
  latticeRibs: 8,
  latticeRings: 30,
  /** Only the lowest fraction of the spire is enclosed; above that it is an
      open mast, which is what keeps the silhouette slender. */
  glazedFraction: 0.22,
  /** Floor plates modelled inside the crown. */
  floors: [56, 61, 66, 71, 76, 81, 86, 88],
  damperY: LEVELS.damperFloor,
  beaconY: LEVELS.beaconFloor
};

/* ------------------------------------------------------------------ */
/* Zone 5 — The Leaning Observatory (detached annex)                   */
/* ------------------------------------------------------------------ */

export const OBSERVATORY = {
  /** Plan position of the base of the tilt. */
  x: 232,
  z: -206,
  /** Deliberate 8° lean, per Section C. */
  tiltDegrees: 8,
  tiltAzimuth: -Math.PI * 0.28,
  radius: 13.5,
  height: 40,
  storeys: 6,
  storeyHeight: 6.2,
  /** Post-tensioned cable anchors resisting the lean. */
  anchorCount: 6,
  anchorRadius: 30,
  /** Asymmetric caisson foundation, offset against the lean. */
  caissonOffset: 5.5
};

/* ------------------------------------------------------------------ */
/* Zone 6 — The Reflection Court & Pyramid Pavilion                    */
/* ------------------------------------------------------------------ */

export const COURT = {
  /** Court runs along the +Z axis from the podium to the pyramid. */
  axisZ: 1,
  startZ: 168,
  endZ: 452,
  halfWidth: 106,
  /** Central reflecting pool. */
  poolHalfX: 21,
  poolStartZ: 188,
  poolEndZ: 362,
  poolLevel: -0.5,
  /** Glass-and-stone pyramid pavilion housing the sustainability core. */
  pyramid: { x: 0, z: 408, base: 78, height: 52 },
  /** Four planted garden quadrants (symmetry, per the Taj-inspired brief). */
  quadrants: [
    { x: -62, z: 232, w: 62, d: 108 },
    { x: 62, z: 232, w: 62, d: 108 },
    { x: -62, z: 348, w: 62, d: 84 },
    { x: 62, z: 348, w: 62, d: 84 }
  ],
  /** Flanking single-storey garden halls. */
  halls: [
    { x: -72, z: 408, w: 30, d: 62, h: 9 },
    { x: 72, z: 408, w: 30, d: 62, h: 9 }
  ],
  solarChimney: { radius: 3.4, top: 50 }
};

/* ------------------------------------------------------------------ */
/* Zone 7 — The Wonder Annex                                           */
/* ------------------------------------------------------------------ */

export const ANNEX = {
  /** Curved aerodynamic "speed form" pavilion. */
  motorsport: { x: -292, z: -104, w: 104, d: 58, h: 21, rot: 0.32 },
  /** Colourful modular-block creative pavilion. */
  blocks: { x: -428, z: 78, w: 66, d: 66, h: 27 },
  /** Themed promenade street: a glazed barrel-vaulted arcade. */
  promenade: { x: -268, z: 176, length: 186, width: 26, height: 17, rot: 0 },
  /** The light-and-water show plaza the promenade gallery overlooks. */
  showPlaza: { x: -372, z: 262, radius: 46, basinRadius: 34, waterLevel: -0.4 },
  /** Unbranded concept-vehicle display plinth. */
  displayPlinth: { radius: 6.4, height: 0.9 },
  simulatorPods: 5
};

/* ------------------------------------------------------------------ */
/* Camera presets — keys 1…7 (E.6)                                     */
/* ------------------------------------------------------------------ */

export const ZONE_PRESETS = [
  {
    key: '1', id: 'canal', name: 'The Canal Concourse',
    position: [0, 3.2, 146], look: [0, 22, 60],
    interior: [92, -6.0, 8], interiorLook: [40, -4.0, 8]
  },
  {
    key: '2', id: 'sail', name: 'The Sail Atrium',
    position: [148, 46, 116], look: [0, 96, 0],
    interior: [12, 21.5, 0], interiorLook: [-30, 34, 0]
  },
  {
    key: '3', id: 'ring', name: 'The Ring Deck',
    position: [188, 214, 156], look: [0, 197, 0],
    interior: [0, 199.4, -70], interiorLook: [40, 199.4, -58]
  },
  {
    key: '4', id: 'spire', name: 'The Spire Crown',
    position: [206, 452, 188], look: [0, 520, 0],
    interior: [0, 256.5, 0], interiorLook: [0, 300, 14]
  },
  {
    key: '5', id: 'observatory', name: 'The Leaning Observatory',
    position: [292, 24, -152], look: [232, 22, -206],
    interior: [232, 2.4, -206], interiorLook: [246, 8, -196]
  },
  {
    key: '6', id: 'court', name: 'Reflection Court & Pyramid Pavilion',
    position: [0, 26, 150], look: [0, 24, 410],
    interior: [0, 2.2, 408], interiorLook: [0, 26, 424]
  },
  {
    key: '7', id: 'annex', name: 'The Wonder Annex',
    position: [-196, 44, 74], look: [-330, 12, 96],
    interior: [-292, 2.2, -104], interiorLook: [-292, 6, -80]
  }
];

/** Where the camera starts: a hero three-quarter view of the whole campus. */
export const START_VIEW = {
  position: [352, 128, 402],
  look: [0, 200, 40]
};
