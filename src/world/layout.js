/**
 * Shared geography and the conceptual masterplan (READ-ONLY for agents; owned by A0).
 *
 * WORLD FRAME — 1 unit = 1 metre, +Y up, right-handed.
 *   The world is aligned to the RUNWAY, not to true north, so every airside
 *   building is axis-aligned and the AABB collision world stays exact.
 *     −Z  = runway heading 025.5° true (towards the RWY 20 threshold, NNE)
 *     +Z  = 205.5° true (towards the RWY 02 threshold, SSW)
 *     +X  = 115.5° true (ESE, right of the runway when flying 025°)
 *     −X  = 295.5° true (WNW — terminal side, towards Hyderabad city)
 *   Origin = midpoint of the existing 2,133 m pavement, at ground level.
 *   The sky converts true azimuths with `trueAzimuthToWorld()`.
 *
 * The heading is derived from the SkyVector threshold coordinates in
 * src/data/facts.json (RWY 02 N25°18.57′ E68°21.70′, RWY 20 N25°19.61′ E68°22.25′):
 *   Δnorth = 1.04′ × 1852 m = 1926 m, Δeast = 0.55′ × 1852 × cos 25.32° = 921 m
 *   length = 2135 m (published 2,133 m), true bearing = atan2(921, 1926) = 25.55°.
 *
 * Everything below the "MASTERPLAN" banner is a SIMULATED conceptual design
 * and must be labelled as such wherever it is shown.
 */

export const GEO = {
  latitude: 25.318,
  longitude: 68.366,
  elevationM: 41,
  utcOffsetHours: 5,
  /** True bearing (degrees) of the world −Z axis. */
  northOffsetDeg: 25.55,
};

/** Convert a true azimuth (radians, clockwise from true north) to a world azimuth measured from −Z clockwise. */
export function trueAzimuthToWorld(azimuthRad) {
  return azimuthRad - (GEO.northOffsetDeg * Math.PI) / 180;
}

/** Heading shown on the HUD compass for a world yaw (three.js camera yaw, 0 = looking −Z). */
export function worldYawToTrueHeading(yaw) {
  const deg = (-yaw * 180) / Math.PI + GEO.northOffsetDeg;
  return ((deg % 360) + 360) % 360;
}

/* ------------------------------------------------------------- RUNWAY (real) */

export const RUNWAY = {
  /** Existing pavement (facts.json: runway.length / runway.width). */
  existingLength: 2133,
  existingWidth: 30,
  /** z of the RWY 02 threshold (south end) and RWY 20 threshold (north end). */
  threshold02Z: 1066.5,
  threshold20Z: -1066.5,
  designator02: '02',
  designator20: '20',
  /* ---- MASTERPLAN (simulated): extension to ~3,505 m / 11,500 ft, Code E ---- */
  targetLength: 3505,
  targetWidth: 45,
  shoulderWidth: 7.5,           // each side → 60 m overall with shoulders
  /** The extension is built southwards beyond the RWY 02 end (away from the city). */
  extensionStartZ: 1066.5,
  extensionEndZ: 1066.5 + (3505 - 2133),   // 2438.5
  blastPadLength: 120,
  resaLength: 240,
};

/* ----------------------------------------------- MASTERPLAN (all simulated) */

/** Axis-aligned footprints: x0..x1, z0..z1 in world metres, plus heights where relevant. */
export const MASTERPLAN = {
  label: 'Conceptual masterplan (simulated)',
  parallelTaxiway: { x: -182.5, width: 23, z0: -1180, z1: 2440 },
  rapidExits: [
    { fromZ: -150, toZ: -420, width: 23 },     // for RWY 02 arrivals (roll-out towards −Z)
    { fromZ: 420, toZ: 690, width: 23 },       // for RWY 20 arrivals (roll-out towards +Z)
  ],
  connectors: [-1120, -420, 120, 690, 1300, 2380], // z of right-angle link taxiways
  apron: { x0: -470, x1: -230, z0: -330, z1: 330 },
  stands: 8,                    // nose-in stands along the terminal frontage
  terminal: { x0: -600, x1: -480, z0: -170, z1: 170, height: 24 },
  jetBridges: 4,
  tower: { x: -560, z: -420, baseSize: 14, cabFloor: 42, cabSize: 16 },
  arff: { x0: -300, x1: -230, z0: 520, z1: 580 },
  cargo: { x0: -470, x1: -360, z0: 380, z1: 470 },
  fuelFarm: { x: -520, z: 520, tanks: 4, radius: 9, height: 12 },
  substation: { x0: -660, x1: -620, z0: 360, z1: 420 },
  solar: { x0: 260, x1: 620, z0: -200, z1: 700, rows: 30 },
  waterWorks: { x: -660, z: 600 },
  drainageOutfall: { x: 240, z: 1700 },
  landside: {
    forecourt: { x0: -650, x1: -600, z0: -170, z1: 170 },
    carPark: { x0: -820, x1: -660, z0: -220, z1: 220 },
    accessRoad: { from: [-650, 0], to: [-2600, -600], width: 14 },
  },
  site: {
    batchPlant: { x: 320, z: 1650 },
    offices: { x: 300, z: 1450 },
    laydown: { x0: 260, x1: 420, z0: 1750, z1: 1950 },
  },
  perimeter: { x0: -900, x1: 700, z0: -2300, z1: 3500 },
  /** Encroachment pockets inside the planned perimeter (cleared by WBS 2.3). */
  encroachments: [
    { x: 220, z: 2200, r: 110 },
    { x: -760, z: 2600, r: 90 },
    { x: 520, z: 2900, r: 80 },
  ],
  windsock: { x: -110, z: -900 },
  /** After the extension the RWY 02 threshold moves to the new south end; PAPI/glide path follow it (A2 places them at z ≈ 2058.5 / 2118.5). */
  papi: { z02: 2438.5 - 380, z20: -1066.5 + 380, x: -40 },
  approachLights: { length: 900, spacing: 30 },
  ils: { localizerZ: -1066.5 - 300, glidePathZ: 2438.5 - 320, glidePathX: 140 },
  awos: { x: 120, z: -200 },
  city: { innerRadius: 2400, outerRadius: 9000 },
};

/** Default camera framings (used by modes, tour and tests). */
export const VIEWS = {
  overview: { target: [-120, 0, 300], distance: 2300, phi: 0.95, theta: 2.35 },
  terminal: { target: [-540, 10, 0], distance: 520, phi: 1.05, theta: 2.0 },
  runwayExtension: { target: [0, 0, 1800], distance: 1100, phi: 0.9, theta: 2.6 },
  tower: { target: [-560, 40, -420], distance: 260, phi: 1.1, theta: 1.4 },
  apron: { target: [-350, 0, 0], distance: 520, phi: 0.95, theta: 2.3 },
  walkStart: { x: -640, z: 0, yaw: -Math.PI / 2 },   // on the forecourt, facing the terminal (−X → +X is yaw −π/2)
  droneStart: { x: 600, y: 260, z: 1600, yaw: 0.8 },
};

/**
 * Which world elements each WBS id drives. World agents look up visuals by
 * these ids; the PM engine guarantees every id below exists in the WBS.
 */
export const WORLD_LINKS = {
  '2.3': 'encroachments',
  '2.4': 'perimeterWall',
  '2.6': 'siteEstablishment',
  '3.2': 'extensionEarthworks',
  '3.3': 'extensionSubbase',
  '3.4': 'extensionBase',
  '3.5': 'extensionSurface',
  '3.6': 'runwayOverlay',
  '3.7': 'runwayWidening',
  '3.8': 'runwayMarkings',
  '3.9': 'blastPads',
  '4.1': 'parallelTaxiway',
  '4.2': 'rapidExits',
  '4.3': 'apron',
  '4.4': 'standMarkings',
  '4.5': 'apronFloodlights',
  '4.6': 'serviceRoads',
  '5.2': 'runwayLights',
  '5.3': 'approachLights',
  '5.4': 'papi',
  '5.5': 'taxiwayLights',
  '6.1': 'localizer',
  '6.2': 'glidePath',
  '6.3': 'towerShaft',
  '6.4': 'towerCab',
  '6.5': 'awos',
  '7.2': 'terminalFoundations',
  '7.3': 'terminalSteel',
  '7.4': 'terminalRoof',
  '7.5': 'terminalGlazing',
  '7.7': 'terminalInterior',
  '7.9': 'jetBridges',
  '8.1': 'cargoShed',
  '8.2': 'fuelFarm',
  '8.3': 'arffStation',
  '8.4': 'substation',
  '8.5': 'solarPlant',
  '8.6': 'waterWorks',
  '8.7': 'stormDrainage',
  '9.1': 'accessRoad',
  '9.2': 'carPark',
  '9.3': 'forecourt',
  '9.4': 'landscaping',
};
