/**
 * Survey data for the Giza Necropolis.
 *
 * One world unit = one metre.  The origin is the centre of the Great Pyramid
 * of Khufu at its base course.  The axes follow the pyramid's own astronomical
 * orientation, which is why the model can be walked with a compass:
 *
 *     -Z = true north      +X = east
 *     +Z = true south      -X = west
 *
 * Dimensions are the published survey figures (Petrie 1883, Lehner 1997,
 * Dorner 1981) rounded to the centimetre.  Positions of the subsidiary
 * structures are taken from the Giza plateau plan and simplified where the
 * archaeology is uncertain (the Khufu valley temple, for example, lies under
 * the modern village of Nazlet el-Samman and is only partially known).
 */

export const SITE = {
  /** Bedrock level of the Khufu foundation platform, in local units. */
  baseLevel: 0,
  /** Extent of the detailed terrain tile. */
  terrainSize: 4200,
  /** Extent of the low-detail horizon skirt. */
  horizonSize: 26000,
  northAzimuth: 0,
};

export const PYRAMIDS = {
  khufu: {
    id: 'khufu',
    name: 'Great Pyramid of Khufu',
    epithet: 'Akhet Khufu — “Khufu’s Horizon”',
    x: 0,
    z: 0,
    baseY: 0,
    baseLength: 230.33,
    designHeight: 146.6,
    presentHeight: 138.5,
    courses: 210,
    slopeDeg: 51.844,
    blocksMillions: 2.3,
    meanBlockTonnes: 2.5,
    volumeM3: 2583283,
    builtBy: 'Khufu (Cheops), 4th Dynasty, c. 2560 BCE',
    isSubject: true,
  },
  khafre: {
    id: 'khafre',
    name: 'Pyramid of Khafre',
    epithet: 'Wer Khafre — “Khafre is Great”',
    x: -252,
    z: 418,
    baseY: 10.2,
    baseLength: 215.25,
    designHeight: 143.5,
    presentHeight: 136.4,
    courses: 200,
    slopeDeg: 53.13,
    blocksMillions: 1.9,
    meanBlockTonnes: 2.5,
    volumeM3: 2211096,
    builtBy: 'Khafre (Chephren), 4th Dynasty, c. 2520 BCE',
    /** Fraction of the height, measured from the apex, that keeps its Tura casing. */
    casingCapFraction: 0.31,
  },
  menkaure: {
    id: 'menkaure',
    name: 'Pyramid of Menkaure',
    epithet: 'Netjer-er-Menkaure — “Menkaure is Divine”',
    x: -594,
    z: 862,
    baseY: 14.6,
    baseLength: 102.2,
    designHeight: 65.0,
    presentHeight: 61.0,
    courses: 95,
    slopeDeg: 51.34,
    blocksMillions: 0.24,
    meanBlockTonnes: 2.5,
    volumeM3: 235183,
    builtBy: 'Menkaure (Mycerinus), 4th Dynasty, c. 2490 BCE',
    /** Lower courses were cased in Aswan granite, never finished. */
    graniteSkirtCourses: 16,
  },
};

/** Queens' pyramids G1-a/b/c on the east flank of Khufu. */
export const QUEENS_PYRAMIDS = [
  { id: 'g1a', name: 'G1-a — Queen Hetepheres I', x: 152, z: -52, baseLength: 49.5, height: 30.6, baseY: 0.4 },
  { id: 'g1b', name: 'G1-b — Queen Meritites I', x: 152, z: 4, baseLength: 49.0, height: 30.0, baseY: 0.6 },
  { id: 'g1c', name: 'G1-c — Queen Henutsen', x: 152, z: 60, baseLength: 46.9, height: 29.6, baseY: 0.9 },
];

/** Menkaure's three subsidiary pyramids, G3-a/b/c. */
export const MENKAURE_QUEENS = [
  { id: 'g3a', name: 'G3-a', x: -594, z: 940, baseLength: 44.0, height: 28.4, baseY: 14.2 },
  { id: 'g3b', name: 'G3-b', x: -646, z: 940, baseLength: 31.5, height: 21.2, baseY: 14.0 },
  { id: 'g3c', name: 'G3-c', x: -698, z: 940, baseLength: 31.2, height: 21.0, baseY: 13.8 },
];

export const SPHINX = {
  id: 'sphinx',
  name: 'The Great Sphinx of Giza',
  epithet: 'Hor-em-akhet — “Horus in the Horizon”',
  x: 336,
  z: 522,
  /** Floor of the quarried enclosure, below plateau level. */
  enclosureY: -8.5,
  length: 73.0,
  height: 20.2,
  width: 19.3,
  headWidth: 11.5,
  facing: 'east',
};

export const TEMPLES = {
  khufuMortuary: { id: 'khufuMortuary', name: 'Mortuary Temple of Khufu', x: 168, z: 0, w: 52.5, d: 40, y: 0 },
  khufuValley: { id: 'khufuValley', name: 'Valley Temple of Khufu (partly known)', x: 1080, z: 120, w: 60, d: 45, y: -26 },
  khafreMortuary: { id: 'khafreMortuary', name: 'Mortuary Temple of Khafre', x: -108, z: 430, w: 68, d: 48, y: 9.6 },
  khafreValley: { id: 'khafreValley', name: 'Valley Temple of Khafre', x: 404, z: 596, w: 44.6, d: 44.5, y: -9.0 },
  sphinxTemple: { id: 'sphinxTemple', name: 'Sphinx Temple', x: 404, z: 520, w: 46, d: 40, y: -8.8 },
  menkaureMortuary: { id: 'menkaureMortuary', name: 'Mortuary Temple of Menkaure', x: -520, z: 862, w: 45, d: 45, y: 14.2 },
};

/** Processional causeways: raised, walled roads from valley temple to plateau. */
export const CAUSEWAYS = [
  { id: 'khufuCauseway', name: 'Causeway of Khufu', from: [1050, 118], to: [186, 8], width: 18.5 },
  { id: 'khafreCauseway', name: 'Causeway of Khafre', from: [388, 574], to: [-72, 436], width: 15.0 },
];

export const QUARRY = {
  id: 'quarry',
  name: 'Central Field Quarry',
  x: 268,
  z: 366,
  w: 300,
  d: 260,
  depth: 13.5,
  note: 'The main Khufu quarry, ~300 m south-east of the pyramid; supplied roughly 90% of the core blocks.',
};

export const GRANITE_YARD = {
  id: 'graniteYard',
  name: 'Aswan Granite Receiving Yard',
  x: 760,
  z: 300,
  w: 90,
  d: 70,
};

export const VILLAGE = {
  id: 'village',
  name: 'Heit el-Ghurab — the Workers’ Town',
  x: 300,
  z: 1010,
  w: 300,
  d: 210,
  note: 'Excavated by Mark Lehner’s AERA team: galleries, bakeries, a copper workshop and the “Wall of the Crow”.',
};

export const HARBOUR = {
  id: 'harbour',
  name: 'Khufu’s Harbour and Delivery Canal',
  x: 1290,
  z: 470,
  w: 320,
  d: 220,
  waterY: -31.5,
};

export const NILE = {
  /** Centre line of the ancient Nile channel, east of the plateau. */
  x: 1880,
  width: 620,
  waterY: -32.0,
};

export const RAMP = {
  /** Straight construction ramp on the south face, plus wrapping side ramps. */
  faceAzimuth: 'south',
  baseWidth: 26,
  topWidth: 12,
  runLength: 420,
  slope: 0.125,
};

export const BOAT_PITS = [
  { id: 'pit-s1', name: 'Southern Boat Pit I (Khufu Ship)', x: -26, z: 143, w: 32, d: 5.5, depth: 4.5 },
  { id: 'pit-s2', name: 'Southern Boat Pit II', x: 34, z: 143, w: 30, d: 5.2, depth: 4.4 },
  { id: 'pit-e1', name: 'Eastern Boat Pit', x: 128, z: -96, w: 26, d: 5.0, depth: 4.0 },
];

/**
 * Interior of the Great Pyramid.  Passage angles and chamber sizes follow
 * Petrie's survey.  Y values are relative to the pyramid base course, X is
 * east, Z is north-negative — the Descending Passage therefore runs from the
 * north face down toward +Y-negative and +Z-positive (southward).
 */
export const KHUFU_INTERIOR = {
  /** Original entrance: 16.9 m above the base, 7.29 m east of the axis. */
  entrance: { x: 7.29, y: 16.9, z: -115.17 },
  passageAngleDeg: 26.5225,
  passageWidth: 1.05,
  passageHeight: 1.20,
  descendingLength: 105.15,
  subterranean: { w: 14.0, d: 8.26, h: 3.5, floorY: -30.0, centerZ: -13.0 },
  ascendingLength: 39.27,
  horizontalLength: 38.7,
  queensChamber: { w: 5.75, d: 5.23, wallH: 4.67, apexH: 6.23, floorY: 21.2 },
  grandGallery: { length: 46.68, height: 8.74, bottomWidth: 2.06, topWidth: 1.04, corbels: 7 },
  antechamber: { w: 3.15, d: 1.55, h: 3.75 },
  kingsChamber: { w: 10.47, d: 5.23, h: 5.97, floorY: 43.0 },
  sarcophagus: { w: 2.28, d: 0.98, h: 1.05 },
  reliefChambers: 5,
  shaftDiameter: 0.21,
};

/** Points of interest surfaced in Archaeologist mode and the guided tour. */
export const POINTS_OF_INTEREST = [
  {
    id: 'poi-khufu-north',
    name: 'North Face & Original Entrance',
    position: [7, 20, -140],
    look: [7, 18, -115],
    category: 'monument',
    text:
      'The original entrance sits 16.9 m above the base and 7.3 m east of the north–south axis. ' +
      'Above it, four massive limestone gables relieve the weight of the masonry. The lower opening ' +
      'is the forced passage cut by, or for, the caliph al-Ma’mun around 820 CE.',
    pm: 'Work package 6.1 — Descending Passage & Subterranean Chamber. Predecessor of every internal package.',
  },
  {
    id: 'poi-khufu-corner',
    name: 'North-East Corner Socket',
    position: [128, 4, -128],
    look: [115, 1, -115],
    category: 'monument',
    text:
      'The four corner sockets cut into the bedrock let the surveyors establish a base square accurate ' +
      'to about 2 cm over 230 m, and level to within 2.1 cm across the whole platform.',
    pm: 'Work package 1.2 — Plateau Levelling. Quality gate: base squareness ≤ 5 cm, level ≤ 3 cm.',
  },
  {
    id: 'poi-quarry',
    name: 'Central Field Quarry',
    position: [268, 4, 300],
    look: [268, -8, 366],
    category: 'logistics',
    text:
      'The horseshoe-shaped quarry south-east of the pyramid yielded roughly 90% of the core blocks. ' +
      'Gangs cut channels with copper chisels and dolerite pounders, then split the blocks free with ' +
      'wooden wedges swollen with water.',
    pm: 'Work packages 2.1 and 5.x — the quarry is the single most schedule-sensitive supply node.',
  },
  {
    id: 'poi-ramp',
    name: 'The Construction Ramp',
    position: [40, 26, 210],
    look: [10, 60, 120],
    category: 'construction',
    text:
      'No ramp survives, so this model shows the most economical reconstruction: a straight ramp on the ' +
      'south face for the lower third, then wrapping side ramps for the upper courses where a straight ' +
      'ramp would need more material than the pyramid itself.',
    pm: 'Work package 3.4 — Construction Ramp System. Its capacity caps the daily block placement rate.',
  },
  {
    id: 'poi-sphinx',
    name: 'The Great Sphinx',
    position: [430, 2, 522],
    look: [336, 12, 522],
    category: 'monument',
    text:
      '73 m long and 20 m high, carved in place from a single knoll of Mokattam limestone left standing ' +
      'in Khafre’s quarry. It faces due east, toward the rising sun at the equinox.',
    pm: 'Work package 8.2 — carved from quarry spoil; a textbook example of turning waste into scope value.',
  },
  {
    id: 'poi-valley-temple',
    name: 'Valley Temple of Khafre',
    position: [470, -2, 596],
    look: [404, 4, 596],
    category: 'monument',
    text:
      'Built of megalithic limestone cores sheathed in polished Aswan granite, with an alabaster floor. ' +
      'Sixteen granite pillars carry architraves weighing up to 150 tonnes.',
    pm: 'Work package 8.2 — the granite here is the same procurement stream as the King’s Chamber.',
  },
  {
    id: 'poi-village',
    name: 'Heit el-Ghurab — Workers’ Town',
    position: [300, 6, 900],
    look: [300, 2, 1010],
    category: 'logistics',
    text:
      'Excavation found dormitory galleries for roughly 1 600 rotating workers, bakeries, a fish-processing ' +
      'yard and cattle bone from herds driven in from the Delta. The workforce was skilled, fed and paid — ' +
      'not enslaved.',
    pm: 'Work packages 4.1–4.4 — resource management and the welfare constraint on productivity.',
  },
  {
    id: 'poi-harbour',
    name: 'Khufu’s Harbour',
    position: [1180, 2, 470],
    look: [1290, -28, 470],
    category: 'logistics',
    text:
      'A dredged basin linked to the Nile by canal, active only during the Akhet inundation. Aswan granite ' +
      'floated 900 km downstream; Tura casing limestone crossed from the east bank.',
    pm: 'Work packages 3.1–3.2 — the inundation window is the hardest external constraint in the schedule.',
  },
  {
    id: 'poi-boat-pit',
    name: 'Southern Boat Pit',
    position: [-26, 4, 168],
    look: [-26, -2, 143],
    category: 'monument',
    text:
      'In 1954 a sealed pit here produced 1 224 pieces of cedar that reassembled into a 43.6 m river boat, ' +
      'the oldest intact vessel ever found.',
    pm: 'Work package 8.3 — a deliverable with zero schedule float: it had to be sealed before handover.',
  },
  {
    id: 'poi-kings-chamber',
    name: 'The King’s Chamber',
    position: [0, 45.6, 0],
    look: [3, 45.6, -3],
    category: 'interior',
    interior: true,
    text:
      'Nine granite beams roof the chamber, the largest weighing about 70 tonnes, hauled 900 km from Aswan ' +
      'and lifted 43 m. Five relieving chambers above spread the load of 60 m of masonry.',
    pm: 'Work package 6.5 — the critical path runs straight through this chamber.',
  },
  {
    id: 'poi-grand-gallery',
    name: 'The Grand Gallery',
    position: [0, 30, 12],
    look: [0, 36, -6],
    category: 'interior',
    interior: true,
    text:
      'A corbelled hall 46.7 m long and 8.7 m high, its walls stepping inward in seven courses. It probably ' +
      'housed the counterweight system that hauled the granite plugs into place.',
    pm: 'Work package 6.4 — the highest-risk package in the register: no rework was possible once roofed.',
  },
  {
    id: 'poi-queens-chamber',
    name: 'The Queen’s Chamber',
    position: [0, 22.5, 4],
    look: [0, 22.5, -8],
    category: 'interior',
    interior: true,
    text:
      'Misnamed by Arab explorers; it never held a queen. Its gabled roof and corbelled eastern niche are ' +
      'unfinished, and the two shafts leaving it were sealed at both ends.',
    pm: 'Work package 6.3 — the clearest surviving evidence of a mid-project scope change.',
  },
];
