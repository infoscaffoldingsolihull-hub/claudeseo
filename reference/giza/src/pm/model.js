/**
 * Project scope model for "Akhet Khufu" — the construction of the Great Pyramid.
 *
 * This is the academic core of the simulator.  It is a genuine PMBOK-style
 * project definition: a decomposed work breakdown structure, a precedence
 * diagram with all four dependency types and leads/lags, three-point estimates
 * for PERT, resource requirements per package, a cost baseline, a risk register
 * with quantified EMV, a procurement register and a stakeholder register.
 *
 * Historical basis: Lehner, "The Complete Pyramids" (1997); Arnold, "Building
 * in Egypt" (1991); the AERA excavations at Heit el-Ghurab; Petrie's 1883
 * survey.  Workforce and rate figures follow Lehner's and Hemiunu-project
 * estimates: ~20 000 workers, ~2.3 million blocks, ~20 years.
 *
 * Currency: kilodeben of copper equivalent (kdb).  One deben ≈ 91 g of copper;
 * the Old Kingdom had no coinage, so state accounts were kept in grain, beer
 * and copper equivalents.  Using a single unit lets earned-value analysis work
 * exactly as it does on a modern project.
 */

export const CALENDAR = {
  daysPerYear: 365,
  /** The three seasons of the Egyptian civil year. */
  seasons: [
    { id: 'akhet', name: 'Akhet — Inundation', start: 1, end: 120, tint: '#2f6fa8' },
    { id: 'peret', name: 'Peret — Emergence', start: 121, end: 240, tint: '#4e9a5a' },
    { id: 'shemu', name: 'Shemu — Harvest', start: 241, end: 365, tint: '#d4a92f' },
  ],
  startRegnalYear: 4,
  monthNames: [
    'Thoth', 'Phaophi', 'Athyr', 'Choiak', 'Tybi', 'Mechir',
    'Phamenoth', 'Pharmuthi', 'Pachon', 'Payni', 'Epiphi', 'Mesore',
  ],
};

export const RESOURCE_TYPES = [
  {
    id: 'quarrymen',
    name: 'Quarry gangs',
    unit: 'workers',
    capacity: 9000,
    baseline: 5200,
    dayRate: 0.021,
    note: 'Cut and split blocks with copper chisels and dolerite pounders.',
  },
  {
    id: 'haulers',
    name: 'Haulage gangs',
    unit: 'workers',
    capacity: 12000,
    baseline: 7400,
    dayRate: 0.019,
    note: 'Drag sledges up the ramp; the largest single labour pool.',
  },
  {
    id: 'masons',
    name: 'Setting masons',
    unit: 'workers',
    capacity: 4200,
    baseline: 2400,
    dayRate: 0.034,
    note: 'Place and bed each course; skilled, permanent, and hard to replace.',
  },
  {
    id: 'artisans',
    name: 'Dressers & artisans',
    unit: 'workers',
    capacity: 3000,
    baseline: 1500,
    dayRate: 0.041,
    note: 'Dress casing stone to a 0.5 mm joint and finish the chambers.',
  },
  {
    id: 'surveyors',
    name: 'Surveyors & scribes',
    unit: 'specialists',
    capacity: 420,
    baseline: 220,
    dayRate: 0.075,
    note: 'Set out the base square, keep the levels, and record the accounts.',
  },
  {
    id: 'barges',
    name: 'River barges',
    unit: 'vessels',
    capacity: 90,
    baseline: 52,
    dayRate: 0.62,
    note: 'Move Tura casing across the river and Aswan granite 900 km downstream.',
  },
  {
    id: 'tools',
    name: 'Copper tool sets',
    unit: 'sets',
    capacity: 30000,
    baseline: 17000,
    dayRate: 0.004,
    note: 'Chisels blunt within hours in nummulitic limestone; the Sinai supply line is the constraint.',
  },
];

/**
 * The work breakdown structure.  Level 1 entries are control accounts;
 * their children are the work packages that carry duration, cost and resources.
 */
export const WBS = [
  {
    id: '1', code: '1.0', name: 'Site Preparation & Survey',
    children: [
      {
        id: '1.1', code: '1.1', name: 'Astronomical Survey & Orientation',
        o: 60, m: 92, p: 150, budget: 5400,
        crew: { surveyors: 180, artisans: 120 },
        predecessors: [],
        deliverable: 'Base square set out to within 2 cm over 230 m, aligned to true north within 3′ 6″.',
        qualityGate: { metric: 'orientation', target: 0.06, unit: '° from true north', tolerance: 0.12 },
      },
      {
        id: '1.2', code: '1.2', name: 'Plateau Levelling',
        o: 300, m: 402, p: 620, budget: 42000,
        crew: { quarrymen: 2600, haulers: 1800, surveyors: 90 , tools: 4200},
        predecessors: [{ id: '1.1', type: 'SS', lag: 30 }],
        deliverable: '5.3 ha of bedrock dressed level to within 2.1 cm.',
        qualityGate: { metric: 'level', target: 2.1, unit: 'cm max deviation', tolerance: 4.0 },
      },
      {
        id: '1.3', code: '1.3', name: 'Foundation Trenching & Water Levelling',
        o: 150, m: 212, p: 320, budget: 16800,
        crew: { quarrymen: 1400, surveyors: 70 },
        predecessors: [{ id: '1.2', type: 'FS', lag: -90 }],
        deliverable: 'Perimeter trench cut and flooded to establish a single datum.',
      },
    ],
  },
  {
    id: '2', code: '2.0', name: 'Quarry Development & Procurement',
    children: [
      {
        id: '2.1', code: '2.1', name: 'Local Limestone Quarry Development',
        o: 120, m: 180, p: 280, budget: 21000,
        crew: { quarrymen: 2200, haulers: 900 , tools: 5200},
        predecessors: [{ id: '1.1', type: 'SS', lag: 15 }],
        deliverable: 'Central Field quarry opened; ~90% of core stone sourced within 300 m.',
      },
      {
        id: '2.2', code: '2.2', name: 'Tura Casing Stone Contract',
        o: 200, m: 262, p: 400, budget: 96000,
        crew: { surveyors: 40, barges: 22 },
        predecessors: [{ id: '1.1', type: 'SS', lag: 60 }],
        procurement: 'PC-01',
        deliverable: '67 000 m³ of fine white Tura limestone contracted and shipped across the river.',
      },
      {
        id: '2.3', code: '2.3', name: 'Aswan Granite Contract',
        o: 380, m: 524, p: 760, budget: 138000,
        crew: { surveyors: 30, barges: 26, artisans: 260 },
        predecessors: [{ id: '1.1', type: 'SS', lag: 120 }],
        procurement: 'PC-02',
        deliverable: '8 000 t of red granite quarried at Aswan and floated 900 km downstream.',
      },
      {
        id: '2.4', code: '2.4', name: 'Copper Tool Supply (Sinai)',
        o: 150, m: 202, p: 300, budget: 34000,
        crew: { artisans: 220, barges: 8 },
        predecessors: [{ id: '1.1', type: 'SS', lag: 45 }],
        procurement: 'PC-03',
        deliverable: 'Continuous supply of copper chisels; expedition mounted to Wadi Maghara.',
      },
    ],
  },
  {
    id: '3', code: '3.0', name: 'Logistics & Transport',
    children: [
      {
        id: '3.1', code: '3.1', name: 'Harbour Basin & Delivery Canal',
        o: 220, m: 302, p: 460, budget: 38000,
        crew: { quarrymen: 900, haulers: 2400 },
        predecessors: [{ id: '1.2', type: 'SS', lag: 60 }],
        deliverable: 'Dredged basin linked to the Nile, usable through the Akhet inundation.',
      },
      {
        id: '3.2', code: '3.2', name: 'Barge Fleet Construction',
        o: 180, m: 240, p: 360, budget: 44000,
        crew: { artisans: 480 },
        predecessors: [{ id: '3.1', type: 'FS', lag: -120 }],
        procurement: 'PC-04',
        deliverable: '52 cedar barges of up to 90 t capacity.',
      },
      {
        id: '3.3', code: '3.3', name: 'Causeway & Haulage Roads',
        o: 260, m: 342, p: 520, budget: 31000,
        crew: { haulers: 2100, quarrymen: 600 },
        predecessors: [{ id: '3.1', type: 'SS', lag: 90 }],
        deliverable: 'Watered, gypsum-sealed haulage roads from quarry and harbour to the ramp.',
      },
      {
        id: '3.4', code: '3.4', name: 'Construction Ramp System',
        o: 200, m: 282, p: 430, budget: 52000,
        crew: { haulers: 2600, quarrymen: 800 },
        predecessors: [{ id: '1.2', type: 'FS', lag: 0 }],
        deliverable: 'Straight south ramp plus wrapping side ramps; caps the daily placement rate.',
        constraint: 'Ramp capacity limits placement to ~340 blocks/day at full staffing.',
      },
    ],
  },
  {
    id: '4', code: '4.0', name: 'Workforce & Settlement',
    children: [
      {
        id: '4.1', code: '4.1', name: 'Workers’ Town (Heit el-Ghurab)',
        o: 180, m: 252, p: 380, budget: 26000,
        crew: { haulers: 1200, artisans: 320 },
        predecessors: [{ id: '1.1', type: 'SS', lag: 30 }],
        deliverable: 'Gallery dormitories for 1 600 rotating workers, plus administration.',
      },
      {
        id: '4.2', code: '4.2', name: 'Provisioning — Bakeries & Breweries',
        o: 120, m: 162, p: 240, budget: 19000,
        crew: { artisans: 260, haulers: 700 },
        predecessors: [{ id: '4.1', type: 'FS', lag: -90 }],
        deliverable: 'Bread and beer for ~20 000 people per day; the true throughput constraint.',
      },
      {
        id: '4.3', code: '4.3', name: 'Gang Organisation & Rotation',
        o: 90, m: 122, p: 180, budget: 8200,
        crew: { surveyors: 60 },
        predecessors: [{ id: '4.1', type: 'SS', lag: 60 }],
        deliverable: 'Two crews of five phyles each; three-month rotation from the nomes.',
      },
      {
        id: '4.4', code: '4.4', name: 'Medical & Welfare Provision',
        o: 60, m: 92, p: 140, budget: 6400,
        crew: { artisans: 90 },
        predecessors: [{ id: '4.1', type: 'FS', lag: -30 }],
        deliverable: 'Set-bone care and wound treatment; the skeletal record shows healed fractures.',
      },
    ],
  },
  {
    id: '5', code: '5.0', name: 'Foundation & Core Construction',
    children: [
      {
        id: '5.1', code: '5.1', name: 'Foundation Platform',
        o: 260, m: 342, p: 520, budget: 68000,
        crew: { masons: 1400, haulers: 2600, quarrymen: 1800 },
        predecessors: [{ id: '1.3', type: 'FS', lag: 0 }, { id: '2.1', type: 'FS', lag: -60 }],
        deliverable: 'Platform of fine limestone slabs, level to 2.1 cm across the whole base.',
        qualityGate: { metric: 'squareness', target: 4.4, unit: 'cm corner error', tolerance: 8.0 },
      },
      {
        id: '5.2', code: '5.2', name: 'Core Courses 1–50 (0–65 m)',
        o: 1250, m: 1552, p: 2100, budget: 496000,
        crew: { masons: 2200, haulers: 6800, quarrymen: 4600 , tools: 9800},
        predecessors: [{ id: '5.1', type: 'FS', lag: 0 }, { id: '3.4', type: 'FS', lag: 0 }],
        buildBand: [0.0, 0.443],
        deliverable: '1.35 million blocks placed — 59% of the total volume in the first third of the height.',
      },
      {
        id: '5.3', code: '5.3', name: 'Core Courses 51–120 (65–105 m)',
        o: 1050, m: 1302, p: 1750, budget: 318000,
        crew: { masons: 2000, haulers: 6200, quarrymen: 3800 , tools: 8200},
        predecessors: [{ id: '5.2', type: 'FS', lag: 0 }, { id: '6.5', type: 'FS', lag: 0 }],
        buildBand: [0.443, 0.716],
        deliverable: 'Courses above the King’s Chamber relieving stack.',
      },
      {
        id: '5.4', code: '5.4', name: 'Core Courses 121–180 (105–130 m)',
        o: 700, m: 882, p: 1200, budget: 152000,
        crew: { masons: 1500, haulers: 4200, quarrymen: 2400 , tools: 5600},
        predecessors: [{ id: '5.3', type: 'FS', lag: 0 }],
        buildBand: [0.716, 0.887],
        deliverable: 'The lift height now dominates the schedule: fewer blocks, far slower placement.',
      },
      {
        id: '5.5', code: '5.5', name: 'Core Courses 181–210 & Pyramidion Seat',
        o: 380, m: 482, p: 700, budget: 64000,
        crew: { masons: 900, haulers: 2200, quarrymen: 1100 , tools: 2600},
        predecessors: [{ id: '5.4', type: 'FS', lag: 0 }],
        buildBand: [0.887, 1.0],
        deliverable: 'Apex courses and the seat for the pyramidion.',
      },
    ],
  },
  {
    id: '6', code: '6.0', name: 'Internal Chambers & Passages',
    children: [
      {
        id: '6.1', code: '6.1', name: 'Descending Passage & Subterranean Chamber',
        o: 380, m: 502, p: 760, budget: 58000,
        crew: { quarrymen: 900, masons: 400, artisans: 260 , tools: 2600},
        predecessors: [{ id: '5.1', type: 'SS', lag: 60 }],
        deliverable: '105 m of passage at 26° 31′ 23″, cut to within 6 mm of straight over its length.',
        qualityGate: { metric: 'passageAlignment', target: 6, unit: 'mm deviation', tolerance: 20 },
      },
      {
        id: '6.2', code: '6.2', name: 'Ascending Passage',
        o: 200, m: 262, p: 390, budget: 34000,
        crew: { masons: 600, artisans: 300 },
        predecessors: [{ id: '5.2', type: 'SS', lag: 300 }],
        deliverable: '39 m rising passage with its granite plug train prepared in the Gallery.',
      },
      {
        id: '6.3', code: '6.3', name: 'Queen’s Chamber & Shafts',
        o: 260, m: 342, p: 520, budget: 47000,
        crew: { masons: 700, artisans: 420 },
        predecessors: [{ id: '6.2', type: 'FS', lag: -60 }],
        deliverable: 'Gabled chamber, corbelled niche and two 20 cm shafts. Left unfinished — the clearest evidence of a scope change.',
        scopeChange: true,
      },
      {
        id: '6.4', code: '6.4', name: 'Grand Gallery',
        o: 420, m: 562, p: 850, budget: 92000,
        crew: { masons: 1100, artisans: 620, haulers: 900 },
        predecessors: [{ id: '6.3', type: 'FS', lag: -120 }],
        deliverable: '46.7 m corbelled hall, seven courses stepping in, 8.74 m to the roof.',
        qualityGate: { metric: 'corbelStep', target: 7.6, unit: 'cm per corbel', tolerance: 12 },
        highRisk: true,
      },
      {
        id: '6.5', code: '6.5', name: 'King’s Chamber & Relieving Chambers',
        o: 520, m: 682, p: 1050, budget: 164000,
        crew: { masons: 1300, artisans: 780, haulers: 2200 },
        predecessors: [{ id: '6.4', type: 'FS', lag: 0 }, { id: '2.3', type: 'FS', lag: 0 }],
        deliverable: 'Nine roof beams up to 70 t lifted 43 m; five relieving chambers above.',
        qualityGate: { metric: 'beamSeating', target: 3, unit: 'mm bearing gap', tolerance: 10 },
        highRisk: true,
        criticalNote: 'The critical path runs straight through this package.',
      },
      {
        id: '6.6', code: '6.6', name: 'Portcullis & Sealing System',
        o: 90, m: 122, p: 200, budget: 21000,
        crew: { masons: 300, artisans: 240 },
        predecessors: [{ id: '6.5', type: 'FS', lag: 0 }],
        deliverable: 'Three granite portcullis slabs and the plug train released down the Ascending Passage.',
      },
    ],
  },
  {
    id: '7', code: '7.0', name: 'Exterior Finish',
    children: [
      {
        id: '7.1', code: '7.1', name: 'Casing Stone Dressing',
        o: 900, m: 1152, p: 1600, budget: 214000,
        crew: { artisans: 2100, masons: 700 , tools: 7400},
        predecessors: [{ id: '2.2', type: 'SS', lag: 200 }],
        deliverable: '~67 000 casing blocks dressed to a mean joint of 0.5 mm.',
        qualityGate: { metric: 'joint', target: 0.5, unit: 'mm mean joint', tolerance: 1.6 },
      },
      {
        id: '7.2', code: '7.2', name: 'Casing Placement (top-down)',
        o: 700, m: 902, p: 1300, budget: 186000,
        crew: { masons: 1900, haulers: 3400, artisans: 900 },
        predecessors: [{ id: '5.5', type: 'FS', lag: 0 }, { id: '7.1', type: 'FF', lag: 120 }],
        casingBand: [0, 1],
        deliverable: 'Casing laid from the apex downward as the ramps are dismantled behind it.',
      },
      {
        id: '7.3', code: '7.3', name: 'Final Polishing & Pyramidion',
        o: 180, m: 242, p: 380, budget: 48000,
        crew: { artisans: 1100 },
        predecessors: [{ id: '7.2', type: 'FS', lag: 0 }],
        deliverable: 'Faces polished; the electrum-sheathed pyramidion set.',
      },
    ],
  },
  {
    id: '8', code: '8.0', name: 'Complex & Closeout',
    children: [
      {
        id: '8.1', code: '8.1', name: 'Mortuary Temple & Enclosure',
        o: 380, m: 502, p: 760, budget: 76000,
        crew: { masons: 800, artisans: 620, haulers: 1100 },
        predecessors: [{ id: '5.3', type: 'SS', lag: 200 }],
        deliverable: 'Basalt-paved temple on the east face, inside the temenos wall.',
      },
      {
        id: '8.2', code: '8.2', name: 'Causeway & Valley Temple',
        o: 500, m: 652, p: 980, budget: 104000,
        crew: { masons: 900, artisans: 700, haulers: 1600 },
        predecessors: [{ id: '3.3', type: 'FS', lag: 300 }],
        deliverable: 'Roofed processional causeway from the valley temple to the plateau.',
      },
      {
        id: '8.3', code: '8.3', name: 'Boat Pits & Royal Barques',
        o: 220, m: 302, p: 460, budget: 39000,
        crew: { artisans: 540, quarrymen: 300 },
        predecessors: [{ id: '5.4', type: 'SS', lag: 120 }],
        deliverable: 'Five rock-cut pits; the 43.6 m cedar barque dismantled into 1 224 pieces and sealed.',
      },
      {
        id: '8.4', code: '8.4', name: 'Queens’ Pyramids G1-a/b/c',
        o: 600, m: 802, p: 1200, budget: 118000,
        crew: { masons: 900, haulers: 2100, quarrymen: 1400 , tools: 3000},
        predecessors: [{ id: '5.3', type: 'SS', lag: 100 }],
        deliverable: 'Three subsidiary pyramids on the east flank, each ~30 m high.',
      },
      {
        id: '8.5', code: '8.5', name: 'Demobilisation & Handover',
        o: 90, m: 122, p: 190, budget: 22000,
        crew: { haulers: 2400, surveyors: 60 },
        predecessors: [
          { id: '7.3', type: 'FS', lag: 0 },
          { id: '6.6', type: 'FS', lag: 0 },
          { id: '8.1', type: 'FS', lag: 0 },
          { id: '8.2', type: 'FS', lag: 0 },
          { id: '8.3', type: 'FS', lag: 0 },
          { id: '8.4', type: 'FS', lag: 0 },
        ],
        deliverable: 'Ramps removed, site cleared, accounts closed, monument handed to the mortuary priesthood.',
      },
    ],
  },
];

/** Flat list of work packages (WBS leaves), in WBS order. */
export function flattenWBS(nodes = WBS, out = []) {
  for (const node of nodes) {
    if (node.children && node.children.length) flattenWBS(node.children, out);
    else out.push(node);
  }
  return out;
}

/**
 * Risk register.  Probability and impact are the PMBOK qualitative scale
 * (1–5); EMV is computed from `probability` × `costImpact` in kdb.
 */
export const RISK_REGISTER = [
  {
    id: 'R-01',
    name: 'Nile inundation fails or runs low',
    category: 'External / environmental',
    cause: 'A weak Akhet flood leaves the delivery canal too shallow for loaded barges.',
    probability: 0.22,
    scheduleImpact: 150,
    costImpact: 42000,
    season: 'akhet',
    affects: ['2.2', '2.3', '3.1', '6.5'],
    response: 'Mitigate',
    responsePlan: 'Stockpile a full season of casing and granite ahead of Akhet; keep 12 shallow-draught barges in reserve.',
    residual: 0.09,
    trigger: 'Nilometer reading below 12 cubits at Elephantine.',
    owner: 'Overseer of the Royal Boats',
  },
  {
    id: 'R-02',
    name: 'Excessive inundation floods the harbour works',
    category: 'External / environmental',
    cause: 'An unusually high flood overtops the basin and destroys the quay.',
    probability: 0.14,
    scheduleImpact: 90,
    costImpact: 26000,
    season: 'akhet',
    affects: ['3.1', '3.2'],
    response: 'Accept',
    responsePlan: 'Accept with contingency; the basin is rebuilt each season in any case.',
    residual: 0.14,
    trigger: 'Nilometer above 18 cubits.',
    owner: 'Overseer of the Harbour',
  },
  {
    id: 'R-03',
    name: 'Core stone shortage at the quarry face',
    category: 'Resource / supply',
    cause: 'Quarry output falls below the ramp’s placement rate; the face runs into poor-quality nummulitic beds.',
    probability: 0.34,
    scheduleImpact: 120,
    costImpact: 31000,
    affects: ['2.1', '5.2', '5.3', '5.4'],
    response: 'Mitigate',
    responsePlan: 'Open a second quarry face; hold 20 days of dressed stock beside the ramp.',
    residual: 0.15,
    trigger: 'Stockpile falls below 12 days of placement.',
    owner: 'Master of the Quarry',
  },
  {
    id: 'R-04',
    name: 'Epidemic in the workers’ town',
    category: 'Health & safety',
    cause: 'Crowded galleries and a contaminated water supply.',
    probability: 0.19,
    scheduleImpact: 110,
    costImpact: 24000,
    affects: ['4.1', '4.2', '5.2', '5.3'],
    response: 'Mitigate',
    responsePlan: 'Separate the water supply, enforce the three-month rotation, staff the medical building.',
    residual: 0.08,
    trigger: 'Sick list above 6% of the on-site workforce.',
    owner: 'Overseer of the Town',
  },
  {
    id: 'R-05',
    name: 'Khamsin sandstorm season',
    category: 'External / environmental',
    cause: 'Spring khamsin winds stop haulage and bury the roads.',
    probability: 0.42,
    scheduleImpact: 35,
    costImpact: 8600,
    season: 'peret',
    affects: ['3.3', '5.2', '5.3', '5.4', '7.2'],
    response: 'Accept',
    responsePlan: 'Schedule dressing and interior work into the khamsin window.',
    residual: 0.42,
    trigger: 'Visibility below 200 m for more than two days.',
    owner: 'Overseer of Works',
  },
  {
    id: 'R-06',
    name: 'Granite beam fractures during lifting',
    category: 'Technical',
    cause: 'A 70 t King’s Chamber roof beam is over-stressed on the lifting frame.',
    probability: 0.16,
    scheduleImpact: 200,
    costImpact: 58000,
    affects: ['6.5'],
    response: 'Mitigate',
    responsePlan: 'Order two spare beams with the Aswan contract; proof-load every lifting frame.',
    residual: 0.06,
    trigger: 'Any audible cracking during a lift.',
    owner: 'Hemiunu, Overseer of All the King’s Works',
  },
  {
    id: 'R-07',
    name: 'Grand Gallery corbel settlement',
    category: 'Technical / quality',
    cause: 'Differential settlement of the corbelled walls under the mass above.',
    probability: 0.12,
    scheduleImpact: 240,
    costImpact: 71000,
    affects: ['6.4', '5.3'],
    response: 'Mitigate',
    responsePlan: 'Survey the corbel line every fifth course; no rework is possible once it is roofed.',
    residual: 0.05,
    trigger: 'More than 4 mm of divergence between opposing corbels.',
    owner: 'Hemiunu, Overseer of All the King’s Works',
  },
  {
    id: 'R-08',
    name: 'Provincial levy shortfall',
    category: 'Political / stakeholder',
    cause: 'Nomarchs withhold the seasonal labour levy after a poor harvest.',
    probability: 0.24,
    scheduleImpact: 130,
    costImpact: 36000,
    affects: ['4.3', '5.2', '5.3'],
    response: 'Transfer',
    responsePlan: 'Grain-for-labour contracts with the nomes; the crown carries the harvest risk.',
    residual: 0.11,
    trigger: 'Any nome delivering below 80% of its levy.',
    owner: 'The Vizier',
  },
  {
    id: 'R-09',
    name: 'Copper tool supply interrupted',
    category: 'Procurement',
    cause: 'The Sinai expedition is delayed or attacked; chisels blunt within hours in limestone.',
    probability: 0.21,
    scheduleImpact: 70,
    costImpact: 17000,
    affects: ['2.4', '2.1', '7.1'],
    response: 'Mitigate',
    responsePlan: 'Hold six months of stock; run a resharpening workshop at Heit el-Ghurab.',
    residual: 0.09,
    trigger: 'Tool stock below 90 days of consumption.',
    owner: 'Overseer of the Copper Workshop',
  },
  {
    id: 'R-10',
    name: 'Barge foundering with cargo',
    category: 'Logistics',
    cause: 'An overloaded barge is lost in the current with granite aboard.',
    probability: 0.18,
    scheduleImpact: 60,
    costImpact: 22000,
    affects: ['3.2', '2.3'],
    response: 'Mitigate',
    responsePlan: 'Load to 80% of rated capacity; convoy with tow boats through the cataract reach.',
    residual: 0.08,
    trigger: 'Any vessel taking water under load.',
    owner: 'Overseer of the Royal Boats',
  },
  {
    id: 'R-11',
    name: 'Royal scope change to the burial chamber',
    category: 'Scope',
    cause: 'The king orders the burial chamber moved higher into the body of the pyramid.',
    probability: 0.30,
    scheduleImpact: 180,
    costImpact: 64000,
    affects: ['6.3', '6.4', '6.5'],
    response: 'Accept',
    responsePlan: 'Accept: this is the king’s monument. Log it, re-baseline, and carry a change reserve.',
    residual: 0.30,
    trigger: 'Any instruction from the palace regarding the chamber.',
    owner: 'Hemiunu, Overseer of All the King’s Works',
    historical: 'The abandoned Subterranean Chamber and the unfinished Queen’s Chamber are the physical record of exactly this.',
  },
  {
    id: 'R-12',
    name: 'Ramp collapse under load',
    category: 'Health & safety / technical',
    cause: 'Rubble ramp fails under a heavy sledge after rain or poor compaction.',
    probability: 0.15,
    scheduleImpact: 95,
    costImpact: 27000,
    affects: ['3.4', '5.3', '5.4'],
    response: 'Mitigate',
    responsePlan: 'Batter the sides at 1:4, water and ram every lift, restrict single loads above 15 t.',
    residual: 0.06,
    trigger: 'Any settlement crack in the ramp shoulder.',
    owner: 'Overseer of Works',
  },
];

/** Procurement register: what is bought, how, and on what contract terms. */
export const PROCUREMENT = [
  {
    id: 'PC-01', item: 'Tura casing limestone', supplier: 'Tura quarries, east bank',
    contractType: 'Fixed price', value: 96000, leadTimeDays: 180,
    terms: 'Delivered to the west-bank quay during Akhet only; quality rejected at the quay is replaced free.',
    risk: 'R-01', activity: '2.2',
  },
  {
    id: 'PC-02', item: 'Aswan red granite', supplier: 'Aswan quarries, 900 km upstream',
    contractType: 'Cost plus fixed fee', value: 138000, leadTimeDays: 420,
    terms: 'Cost plus, because neither party can estimate extraction of a 70 t monolith. Two spare beams included.',
    risk: 'R-06', activity: '2.3',
  },
  {
    id: 'PC-03', item: 'Copper chisels and picks', supplier: 'Sinai expedition, Wadi Maghara',
    contractType: 'Unit price', value: 34000, leadTimeDays: 240,
    terms: 'Per-set price with a six-month standing stock obligation.',
    risk: 'R-09', activity: '2.4',
  },
  {
    id: 'PC-04', item: 'Lebanese cedar for barges and sledges', supplier: 'Byblos, by sea',
    contractType: 'Fixed price', value: 44000, leadTimeDays: 300,
    terms: 'Diplomatic contract with Byblos; payment in grain, linen and papyrus.',
    risk: 'R-10', activity: '3.2',
  },
  {
    id: 'PC-05', item: 'Dolerite pounders', supplier: 'Eastern Desert',
    contractType: 'Unit price', value: 12000, leadTimeDays: 120,
    terms: 'Consumable; ~2 kg lost per cubic metre of granite dressed.',
    risk: 'R-09', activity: '2.1',
  },
];

/** Stakeholder register with a power/interest grid position. */
export const STAKEHOLDERS = [
  {
    id: 'khufu', name: 'Khufu', role: 'The King — project sponsor',
    power: 5, interest: 5, current: 'supportive', desired: 'leading',
    influence: 'Absolute. Sets scope; his death ends the project whatever its state.',
    strategy: 'Manage closely. Monthly progress at the palace; never surprise him with schedule news.',
    drivers: { spi: 0.5, quality: 0.3, scope: 0.2 },
  },
  {
    id: 'hemiunu', name: 'Hemiunu', role: 'Vizier & Overseer of All the King’s Works',
    power: 5, interest: 5, current: 'leading', desired: 'leading',
    influence: 'Project director. Owns the technical solution and the critical path.',
    strategy: 'Manage closely. He is also your AI advisor in this simulation.',
    drivers: { spi: 0.35, cpi: 0.35, quality: 0.3 },
  },
  {
    id: 'priesthood', name: 'Priesthood of Ra at Heliopolis', role: 'Religious authority',
    power: 4, interest: 4, current: 'neutral', desired: 'supportive',
    influence: 'Controls the ritual calendar and the alignment requirements.',
    strategy: 'Keep satisfied. Orientation accuracy and the solar alignments are non-negotiable.',
    drivers: { quality: 0.6, scope: 0.4 },
  },
  {
    id: 'nomarchs', name: 'Provincial Nomarchs', role: 'Suppliers of the labour levy',
    power: 4, interest: 3, current: 'neutral', desired: 'supportive',
    influence: 'Deliver the rotating workforce; can quietly under-deliver after a bad harvest.',
    strategy: 'Keep satisfied. Grain-for-labour terms, and never hold a gang past its rotation.',
    drivers: { welfare: 0.5, cpi: 0.3, spi: 0.2 },
  },
  {
    id: 'gangs', name: 'The Work Gangs', role: 'The workforce — “Friends of Khufu”, “Drunkards of Menkaure”',
    power: 3, interest: 5, current: 'supportive', desired: 'supportive',
    influence: 'Productivity is directly their morale. Graffiti in the relieving chambers records their gang names.',
    strategy: 'Keep informed. Rations, rotation and safety; the first recorded labour action in history was over rations.',
    drivers: { welfare: 0.7, safety: 0.3 },
  },
  {
    id: 'quarrymaster', name: 'Master of the Quarry', role: 'Key internal supplier',
    power: 3, interest: 4, current: 'supportive', desired: 'leading',
    influence: 'Sets the stone supply rate that everything downstream depends on.',
    strategy: 'Manage closely during core construction; his output is the schedule.',
    drivers: { spi: 0.5, welfare: 0.25, cpi: 0.25 },
  },
  {
    id: 'boatmen', name: 'Guild of the Royal Boatmen', role: 'Logistics contractor',
    power: 2, interest: 4, current: 'neutral', desired: 'supportive',
    influence: 'Owns the only route for Tura casing and Aswan granite.',
    strategy: 'Keep informed; their season is fixed by the flood, not by your schedule.',
    drivers: { cpi: 0.5, spi: 0.5 },
  },
];

/** Missions: the game layer over the project. */
export const MISSIONS = [
  {
    id: 'M1',
    name: 'Set Out the Base',
    brief:
      'Establish the base square of Akhet Khufu. The Priesthood of Ra will not consecrate a monument that is not square to the stars.',
    objectives: [
      { id: 'o1', text: 'Complete 1.1 Astronomical Survey', check: (s) => s.pct('1.1') >= 1 },
      { id: 'o2', text: 'Complete 1.2 Plateau Levelling', check: (s) => s.pct('1.2') >= 1 },
      { id: 'o3', text: 'Keep SPI ≥ 0.95 at handover of the platform', check: (s) => s.spi >= 0.95 },
      { id: 'o4', text: 'Orientation error ≤ 0.12°', check: (s) => s.quality.orientation <= 0.12 },
    ],
    reward: 'The Priesthood of Ra moves from Neutral to Supportive.',
  },
  {
    id: 'M2',
    name: 'Open the Supply Lines',
    brief:
      'Nothing rises without stone. Open the quarry, contract Tura and Aswan, and get the harbour working before Akhet closes.',
    objectives: [
      { id: 'o1', text: 'Complete 2.1 Quarry Development', check: (s) => s.pct('2.1') >= 1 },
      { id: 'o2', text: 'Complete 3.1 Harbour Basin', check: (s) => s.pct('3.1') >= 1 },
      { id: 'o3', text: 'Award both stone contracts (2.2, 2.3 started)', check: (s) => s.pct('2.2') > 0 && s.pct('2.3') > 0 },
      { id: 'o4', text: 'Keep CPI ≥ 0.90', check: (s) => s.cpi >= 0.9 },
    ],
    reward: 'Stone stockpile buffer increased; R-03 residual probability halved.',
  },
  {
    id: 'M3',
    name: 'Raise the Core',
    brief:
      'Fifty courses, 1.35 million blocks, 59% of the volume of the entire monument. This is where projects are won or lost.',
    objectives: [
      { id: 'o1', text: 'Complete 5.2 Core Courses 1–50', check: (s) => s.pct('5.2') >= 1 },
      { id: 'o2', text: 'Maintain SPI ≥ 0.92 throughout', check: (s) => s.spi >= 0.92 },
      { id: 'o3', text: 'Keep worker welfare above 60%', check: (s) => s.welfare >= 0.6 },
      { id: 'o4', text: 'No more than two realised risks', check: (s) => s.realisedRisks <= 2 },
    ],
    reward: 'The gangs’ morale bonus becomes permanent.',
  },
  {
    id: 'M4',
    name: 'Complete the King’s Chamber',
    brief:
      'Nine granite beams, the heaviest 70 tonnes, lifted 43 metres. The critical path runs straight through this chamber, and there is no rework once it is roofed.',
    objectives: [
      { id: 'o1', text: 'Complete 6.4 Grand Gallery', check: (s) => s.pct('6.4') >= 1 },
      { id: 'o2', text: 'Complete 6.5 King’s Chamber', check: (s) => s.pct('6.5') >= 1 },
      { id: 'o3', text: 'SPI ≥ 0.95', check: (s) => s.spi >= 0.95 },
      { id: 'o4', text: 'CPI ≥ 0.90', check: (s) => s.cpi >= 0.9 },
      { id: 'o5', text: 'Beam seating gap ≤ 10 mm', check: (s) => s.quality.beamSeating <= 10 },
    ],
    reward: 'Khufu moves to Leading. Contingency reserve replenished by 40 000 kdb.',
  },
  {
    id: 'M5',
    name: 'Dress the Horizon',
    brief:
      'Twenty-one acres of Tura limestone, laid from the apex down, to a mean joint of half a millimetre. The monument must shine.',
    objectives: [
      { id: 'o1', text: 'Complete 5.5 Apex Courses', check: (s) => s.pct('5.5') >= 1 },
      { id: 'o2', text: 'Complete 7.2 Casing Placement', check: (s) => s.pct('7.2') >= 1 },
      { id: 'o3', text: 'Mean casing joint ≤ 1.6 mm', check: (s) => s.quality.joint <= 1.6 },
      { id: 'o4', text: 'CPI ≥ 0.88', check: (s) => s.cpi >= 0.88 },
    ],
    reward: 'The pyramidion is set and the monument is visible from the Delta.',
  },
  {
    id: 'M6',
    name: 'Hand Over the Horizon',
    brief:
      'Close the project. Seal the chambers, finish the complex, dismantle the ramps, and hand Akhet Khufu to the mortuary priesthood.',
    objectives: [
      { id: 'o1', text: 'Complete all work packages', check: (s) => s.overallProgress >= 0.999 },
      { id: 'o2', text: 'Final SPI ≥ 0.90', check: (s) => s.spi >= 0.9 },
      { id: 'o3', text: 'Final CPI ≥ 0.85', check: (s) => s.cpi >= 0.85 },
      { id: 'o4', text: 'All stakeholders at Supportive or better', check: (s) => s.minStakeholderLevel >= 3 },
    ],
    reward: 'Project complete. “Akhet Khufu” — Khufu’s Horizon.',
  },
];
