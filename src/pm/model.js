/**
 * Scenario model for the Hyderabad Airport (HDD/OPKD, Sindh) Revival &
 * Expansion Programme — SIMULATED SCENARIO DATA.
 *
 * Every budget, duration, vendor, bid, risk value and stakeholder position
 * below is invented for teaching. Vendors and airlines are fictional; real
 * public bodies appear only as institutional roles; no real people are named.
 *
 * Money: raw Pakistani rupees (the data is written in PKR millions × M).
 * Time: whole days from Mon 4 Jan 2027 (day 0).
 */

export const M = 1e6;
export const SIMULATED = 'Simulated scenario data';

export const PROJECT_INFO = {
  name: 'Hyderabad Airport Revival & Expansion Programme',
  short: 'SKY GATEWAY HYDERABAD',
  code: 'HDD-REP',
  location: 'Hyderabad, Sindh, Pakistan (HDD / OPKD)',
  startDate: Date.UTC(2027, 0, 4),
  currency: 'PKR',
  sponsor: 'Sponsor: airport owner (PAA programme board)',
  simulated: SIMULATED,
  gateReviewDays: 10,
};

export const SUMMARY_PACKAGES = [
  { id: '1', name: 'Project Management & Initiation', color: '#c9a227', owner: 'Project Director' },
  { id: '2', name: 'Land & Site Preparation', color: '#a0522d', owner: 'Land & Resettlement Manager' },
  { id: '3', name: 'Runway 02/20 Rehabilitation & Extension', color: '#4b5563', owner: 'Airside Works Manager' },
  { id: '4', name: 'Taxiways & Apron', color: '#6b7280', owner: 'Airside Works Manager' },
  { id: '5', name: 'Airfield Ground Lighting', color: '#ffb000', owner: 'Electrical & AGL Lead' },
  { id: '6', name: 'Navigation Aids & ATC', color: '#2b3a8c', owner: 'CNS/ATM Systems Lead' },
  { id: '7', name: 'Passenger Terminal', color: '#9b1b30', owner: 'Terminal Construction Manager' },
  { id: '8', name: 'Airport Support Facilities', color: '#3a7d44', owner: 'Utilities & Support Facilities Manager' },
  { id: '9', name: 'Landside', color: '#8d6e63', owner: 'Landside Works Manager' },
  { id: '10', name: 'Terminal IT & Airport Systems (Agile)', color: '#0ea5e9', owner: 'Product Owner (Terminal IT)' },
  { id: '11', name: 'Operational Readiness & Certification', color: '#7c3aed', owner: 'ORAT Manager' },
  { id: '12', name: 'Handover & Closure', color: '#3ddc84', owner: 'Project Director' },
];

/**
 * Resource pools. dayRate = simulated fully-loaded PKR per unit-day
 * (equipment rates include operator and fuel).
 */
export const RESOURCE_TYPES = [
  { id: 'designers', name: 'Design engineers', unit: 'engineers', kind: 'people', dayRate: 40000, note: 'Airfield, structural, MEP and systems designers.' },
  { id: 'pmo', name: 'PMO & project controls staff', unit: 'staff', kind: 'people', dayRate: 30000, note: 'Planners, cost engineers, document control, ORAT staff.' },
  { id: 'civil', name: 'Civil works crews', unit: 'workers', kind: 'people', dayRate: 4000, note: 'Earthworks, concrete, drainage and general civil labour with supervision.' },
  { id: 'pavers', name: 'Asphalt paving trains', unit: 'trains', kind: 'equipment', dayRate: 900000, note: 'Paver, rollers, material transfer vehicle and crew.' },
  { id: 'cranes', name: 'Tower & mobile cranes', unit: 'cranes', kind: 'equipment', dayRate: 150000, note: 'Lifts steel, roof trusses, glazing units and jet bridges.' },
  { id: 'electricians', name: 'Electricians', unit: 'workers', kind: 'people', dayRate: 6500, note: 'Power, MEP, cabling and controls.' },
  { id: 'agl', name: 'AGL technicians', unit: 'specialists', kind: 'people', dayRate: 15000, note: 'Airfield ground lighting and navaid installation specialists.' },
  { id: 'steel', name: 'Steel erectors', unit: 'workers', kind: 'people', dayRate: 7000, note: 'Structural steel, roof and windcatcher frames.' },
  { id: 'glaziers', name: 'Glaziers', unit: 'workers', kind: 'people', dayRate: 7500, note: 'Curtain wall, Ajrak-pattern screens and tower cab glazing.' },
  { id: 'itdev', name: 'IT developers (Scrum team)', unit: 'developers', kind: 'people', dayRate: 35000, note: 'Two Scrum teams building FIDS, CUTE, BRS and security integration.' },
  { id: 'qa', name: 'QA inspectors', unit: 'inspectors', kind: 'people', dayRate: 18000, note: 'Materials testing, inspection and test plans, NCR close-out.' },
  { id: 'trucks', name: 'Haul trucks', unit: 'trucks', kind: 'equipment', dayRate: 30000, note: 'Tippers moving fill, aggregate and asphalt.' },
];

/* --------------------------------------------------------------- WBS leaves */

const OWNERS = Object.fromEntries(SUMMARY_PACKAGES.map((s) => [s.id, s.owner]));

function parseLinks(spec) {
  return spec.map((s) => {
    const m = /^(FS|SS|FF|SF):([\w.]+)([+-]\d+)?$/.exec(s);
    if (!m) throw new Error(`bad link ${s}`);
    return { id: m[2], type: m[1], lag: m[3] ? Number(m[3]) : 0 };
  });
}

function L(id, name, opm, budget, crew, preds, x) {
  return {
    id, name, o: opm[0], m: opm[1], p: opm[2], budget: budget * M, crew,
    predecessors: parseLinks(preds),
    cls: x.cls || 'outdoor', mat: x.mat || 'local', q: x.q || [], dc: x.dc || 'Workmanship',
    domain: x.ka, clo: x.clo,
    dictionary: {
      description: x.desc, deliverables: x.del, acceptance: x.acc,
      owner: x.owner || OWNERS[id.split('.')[0]], assumptions: x.asm, risks: [],
    },
  };
}

export const WBS_LEAVES = [
  // 1 Project Management & Initiation
  L('1.1', 'Feasibility study & business case', [40, 55, 90], 180, { designers: 18, pmo: 10 }, [], {
    cls: 'office', ka: 'Integration', clo: ['CLO1'], dc: 'Documentation',
    desc: 'Demand forecast, options appraisal (do-minimum, rehabilitate, rehabilitate + extend) and economic/financial case for reviving scheduled services at Hyderabad.',
    del: ['Traffic forecast 2027–2047', 'Options appraisal with NPV/BCR', 'Outline business case'],
    acc: 'Business case scores BCR ≥ 1.5 under the central case and is endorsed by the programme board.',
    asm: 'Simulated demand assumptions; federal development funding available in principle.' }),
  L('1.2', 'Project charter & sponsor approval', [14, 20, 35], 40, { pmo: 8 }, ['FS:1.1'], {
    cls: 'office', ka: 'Integration', clo: ['CLO1'], dc: 'Documentation',
    desc: 'Charter naming the sponsor, project director, objectives, high-level scope, milestones, summary budget and authority levels.',
    del: ['Signed project charter', 'Assumption log', 'High-level risk list'],
    acc: 'Charter signed by the sponsor; project director authorised to apply resources.',
    asm: 'Sponsor available for a charter workshop within three weeks of the business case.' }),
  L('1.3', 'Stakeholder identification & engagement plan', [20, 30, 50], 60, { pmo: 6 }, ['SS:1.2+5'], {
    cls: 'office', ka: 'Stakeholders', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Stakeholder register, power/interest and salience analysis, engagement assessment matrix and communications plan.',
    del: ['Stakeholder register', 'Engagement assessment matrix', 'Communications management plan'],
    acc: 'Every stakeholder group has an owner, a desired engagement level and a channel.',
    asm: 'Community leaders around the airport are reachable through the district administration.' }),
  L('1.4', 'Project management plan & baselines', [45, 60, 90], 120, { pmo: 14, designers: 6 }, ['FS:M01'], {
    cls: 'office', ka: 'Integration', clo: ['CLO2'], dc: 'Documentation',
    desc: 'Integrated PM plan with scope, schedule and cost baselines, subsidiary plans and the hybrid delivery approach.',
    del: ['Scope baseline (scope statement, WBS, dictionary)', 'Schedule baseline (CPM)', 'Cost baseline & funding limits', 'Subsidiary management plans'],
    acc: 'Baselines approved at Gate G1; EVM measurement method agreed.',
    asm: 'Three-point estimates from the design consultant are available.' }),
  L('1.5', 'Environmental & social impact assessment', [90, 120, 200], 150, { designers: 10, qa: 2 }, ['FS:M01'], {
    cls: 'office', ka: 'Risk', clo: ['CLO3'], dc: 'Documentation',
    desc: 'ESIA covering noise contours, dust, drainage to the monsoon outfall, resettlement action plan and public hearings.',
    del: ['ESIA report', 'Resettlement action plan', 'Environmental approval'],
    acc: 'Environmental approval issued by the provincial environmental regulator with conditions logged.',
    asm: 'Public hearing can be held within the statutory notice period.' }),
  L('1.6', 'PMO set-up & project controls', [30, 45, 70], 180, { pmo: 12 }, ['SS:1.4+10', 'FF:1.4+15'], {
    cls: 'office', ka: 'Integration', clo: ['CLO2'], dc: 'Documentation',
    desc: 'PMO, document control, EVM reporting cycle, change control board and risk management process.',
    del: ['PMO operating procedures', 'EVM reporting templates', 'CCB terms of reference'],
    acc: 'First monthly performance report issued from the controls system.',
    asm: 'Scheduling and cost tools licensed; staff seconded from the sponsor.' }),

  // 2 Land & Site Preparation
  L('2.1', 'Land survey & title verification', [45, 60, 90], 90, { designers: 8, civil: 20, qa: 2 }, ['FS:M01'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Topographic and cadastral survey of the extension corridor; title verification against revenue records.',
    del: ['Topographic survey', 'Land schedule with title status', 'Encroachment census'],
    acc: 'Survey control within ±20 mm; every parcel has a verified title status.',
    asm: 'Revenue records are available for inspection.' }),
  L('2.2', 'Land acquisition & compensation', [110, 150, 260], 2200, { pmo: 6 }, ['FS:2.1'], {
    cls: 'office', ka: 'Procurement', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Acquisition of land for the runway extension, RESA and approach lights; valuation and compensation payments.',
    del: ['Acquisition notifications', 'Compensation awards paid', 'Possession certificates'],
    acc: 'Possession of every parcel in the extension corridor certified.',
    asm: 'Compensation at simulated market rates plus statutory solatium.' }),
  L('2.3', 'Encroachment clearance & resettlement', [80, 120, 220], 900, { civil: 120, trucks: 12, pmo: 4 }, ['SS:2.2+60', 'FS:M02'], {
    cls: 'earth', ka: 'Stakeholders', clo: ['CLO3'], dc: 'Workmanship',
    desc: 'Negotiated relocation of informal occupants within the planned perimeter under the resettlement action plan; demolition and site clearance.',
    del: ['Resettled households with livelihood support', 'Cleared encroachment pockets', 'Grievance log closed'],
    acc: 'All three encroachment pockets cleared; grievance redress cases closed or referred.',
    asm: 'Resettlement site with services is ready before clearance starts.' }),
  L('2.4', 'Perimeter wall & security fence', [150, 180, 260], 750, { civil: 140, trucks: 6, qa: 1 }, ['SS:2.3+40', 'FF:2.3+60'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Masonry perimeter wall with anti-climb security fence, patrol road and access gates around the expanded aerodrome.',
    del: ['Perimeter wall', 'Security fence & gates', 'Perimeter patrol road'],
    acc: 'Continuous secure perimeter accepted by the airport security force.',
    asm: 'Alignment follows the cleared boundary.' }),
  L('2.5', 'Utility relocation', [90, 120, 200], 650, { civil: 60, electricians: 20, trucks: 4 }, ['FS:M02'], {
    cls: 'earth', ka: 'Schedule', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Diversion of 11 kV lines, a gas main and water mains crossing the extension and apron footprint.',
    del: ['Diverted power lines', 'Relocated gas main', 'Relocated water mains'],
    acc: 'Utility owners certify the diversions and old services are decommissioned.',
    asm: 'Utility companies release permits within 30 days.' }),
  L('2.6', 'Site establishment (offices, batch plant, laydown)', [45, 60, 90], 420, { civil: 80, electricians: 10, cranes: 1, trucks: 6 }, ['FS:M02'], {
    cls: 'outdoor', ka: 'Resources', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Site offices, welfare facilities, concrete batch plant, asphalt plant pad, materials laboratory and laydown yards.',
    del: ['Site offices & welfare', 'Batch plant commissioned', 'Materials laboratory'],
    acc: 'Batch plant trial mix approved; welfare facilities inspected by HSE.',
    asm: 'Temporary power available from the grid.' }),

  // 3 Runway 02/20 Rehabilitation & Extension
  L('3.1', 'Pavement condition survey & design', [100, 140, 210], 420, { designers: 30, qa: 4 }, ['SS:1.4+20'], {
    cls: 'office', ka: 'Quality', clo: ['CLO2'], dc: 'Documentation',
    desc: 'PCI survey, falling-weight deflectometer testing and pavement design for the extension, overlay and Code E widening.',
    del: ['Pavement condition index report', 'Pavement design (PCN)', 'Issued-for-construction drawings'],
    acc: 'Design PCN meets the design aircraft; drawings approved by the Engineer.',
    asm: 'Design aircraft is a Code E wide-body on occasional operations.' }),
  L('3.2', 'Earthworks (cut/fill) for extension', [120, 150, 220], 2100, { civil: 220, trucks: 50, qa: 4 }, ['FS:M03', 'FS:2.6', 'FS:3.1-30'], {
    cls: 'earth', ka: 'Scope', clo: ['CLO2'], q: ['compaction'], dc: 'Compaction',
    desc: 'Cut, fill and compaction of the 1,372 m southern extension, strip and RESA formation.',
    del: ['Formation level to ±25 mm', 'Compaction records'],
    acc: 'Field density ≥ 95 % of MDD on every lot.',
    asm: 'Borrow pits within 15 km; water for compaction available.' }),
  L('3.3', 'Sub-base course', [90, 120, 170], 1500, { civil: 140, trucks: 40, qa: 3 }, ['SS:3.2+60', 'FF:3.2+20'], {
    cls: 'earth', ka: 'Quality', clo: ['CLO2'], q: ['compaction'], dc: 'Compaction',
    desc: 'Granular sub-base laid and compacted in layers on the extension.', del: ['Sub-base layers', 'Level and density records'],
    acc: 'Density ≥ 95 % MDD and level tolerance ±15 mm.', asm: 'Approved quarry source for granular material.' }),
  L('3.4', 'Base course', [80, 110, 160], 1650, { civil: 120, trucks: 35, qa: 3 }, ['SS:3.3+40', 'FF:3.3+20'], {
    cls: 'earth', ka: 'Quality', clo: ['CLO2'], q: ['compaction'], dc: 'Compaction',
    desc: 'Crushed-stone base course with cement stabilisation on the extension.', del: ['Base course', 'Plate-load test results'],
    acc: 'Density ≥ 95 % MDD; CBR meets design.', asm: 'Cement supply contracted.' }),
  L('3.5', 'Asphalt surfacing (extension)', [70, 90, 130], 2200, { pavers: 2, civil: 60, trucks: 30, qa: 4 }, ['SS:3.4+45', 'FF:3.4+15'], {
    cls: 'asphalt', ka: 'Quality', clo: ['CLO2'], mat: 'bitumen', q: ['friction', 'roughness'], dc: 'Surface texture',
    desc: 'Binder and wearing courses of polymer-modified asphalt on the extension.', del: ['Asphalt surfacing', 'Friction and IRI test reports'],
    acc: 'Friction μ ≥ 0.60 and IRI ≤ 2.0 m/km on every 100 m section.', asm: 'Paving restricted to night shifts in peak summer.' }),
  L('3.6', 'Existing runway milling & overlay', [100, 120, 180], 2000, { pavers: 2, civil: 70, trucks: 30, qa: 4 }, ['FS:3.5', 'FS:3.1'], {
    cls: 'asphalt', ka: 'Schedule', clo: ['CLO2'], mat: 'bitumen', q: ['friction', 'roughness'], dc: 'Ride quality',
    desc: 'Milling of the existing 2,133 m pavement and structural overlay under phased night closures.', del: ['Milled & overlaid runway', 'NOTAM-phased work packages'],
    acc: 'Runway returned to service each morning; final friction and IRI within limits.', asm: 'Flights diverted to the extension during day works where possible.' }),
  L('3.7', 'Widening to Code E & shoulders', [100, 130, 190], 1500, { civil: 120, pavers: 1, trucks: 25, qa: 3 }, ['SS:3.6+20'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', q: ['compaction'], dc: 'Compaction',
    desc: 'Widening the runway to 45 m with 7.5 m paved shoulders each side (60 m overall).', del: ['45 m runway', 'Paved shoulders'],
    acc: 'Width and transverse slopes per Annex 14 Code E requirements.', asm: 'Shoulder pavement re-uses milled material where specified.' }),
  L('3.8', 'Runway markings', [18, 25, 40], 120, { civil: 12, qa: 1 }, ['FS:3.7', 'FS:3.6'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Workmanship',
    desc: 'Threshold, designation, aiming point, touchdown zone, centreline and edge markings for RWY 02/20.', del: ['Painted markings', 'Retro-reflectivity tests'],
    acc: 'Markings and retro-reflectivity accepted by the aerodrome inspector.', asm: 'Paint applied after asphalt cure period.' }),
  L('3.9', 'Blast pads & RESA', [50, 70, 100], 480, { civil: 70, trucks: 15, qa: 2 }, ['SS:3.5+30'], {
    cls: 'earth', ka: 'Scope', clo: ['CLO2'], q: ['compaction'], dc: 'Compaction',
    desc: '120 m blast pads with chevrons and 240 m runway end safety areas.', del: ['Blast pads', 'Graded RESAs'],
    acc: 'RESA bearing strength and grading meet design.', asm: 'Land for RESA acquired under 2.2.' }),
  L('3.10', 'Runway drainage', [110, 150, 210], 650, { civil: 90, trucks: 10, qa: 2 }, ['SS:3.2+30'], {
    cls: 'earth', ka: 'Risk', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Sub-surface drains, side drains and culverts sized for monsoon storms.', del: ['Sub-soil drains', 'Culverts & manholes'],
    acc: 'CCTV survey clear; design storm conveyed without ponding.', asm: '1-in-25-year storm design basis.' }),

  // 4 Taxiways & Apron
  L('4.1', 'Parallel taxiway', [200, 240, 330], 2400, { civil: 160, pavers: 1, trucks: 35, qa: 3 }, ['SS:3.2+90', 'FS:2.5'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', q: ['compaction', 'roughness'], dc: 'Compaction',
    desc: 'Full-length 23 m parallel taxiway with link taxiways.', del: ['Parallel taxiway', 'Link taxiways'],
    acc: 'Geometric and pavement tests passed; separation to runway per design.', asm: 'Utilities cleared from the alignment.' }),
  L('4.2', 'Rapid exit taxiways', [90, 120, 170], 900, { civil: 70, pavers: 1, trucks: 15, qa: 2 }, ['SS:4.1+100'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', q: ['roughness'], dc: 'Ride quality',
    desc: 'Two rapid exit taxiways serving RWY 02 and RWY 20 arrivals.', del: ['Two RETs'],
    acc: 'Exit geometry for 93 km/h exit speed verified.', asm: 'Located per runway occupancy study.' }),
  L('4.3', 'Apron pavement', [170, 210, 290], 2400, { civil: 180, trucks: 25, cranes: 1, qa: 4 }, ['FS:2.6', 'FS:2.5'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], q: ['concrete'], dc: 'Concrete strength',
    desc: 'Rigid pavement-quality concrete apron for eight stands.', del: ['PQC apron slabs', 'Joint sealing'],
    acc: 'Concrete strength ≥ 35 MPa characteristic; surface regularity within 3 mm/3 m.', asm: 'Batch plant on site.' }),
  L('4.4', 'Stand markings & guidance', [20, 28, 45], 220, { civil: 10, electricians: 8, qa: 1 }, ['FS:4.3'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Workmanship',
    desc: 'Stand centrelines, safety lines and visual docking guidance systems.', del: ['Stand markings', 'Visual docking guidance'],
    acc: 'Docking guidance calibrated for each aircraft type.', asm: 'Stand plan frozen.' }),
  L('4.5', 'Apron floodlighting', [70, 90, 130], 350, { electricians: 30, cranes: 1, qa: 1 }, ['SS:4.3+120', 'FS:2.6'], {
    cls: 'height', ka: 'Scope', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'High-mast LED floodlighting with glare control toward the tower cab.', del: ['Floodlight masts', 'Photometric report'],
    acc: 'Average illuminance and uniformity meet design; no glare to the tower.', asm: 'Masts outside obstacle surfaces.' }),
  L('4.6', 'Airside service roads', [90, 120, 170], 600, { civil: 60, pavers: 1, trucks: 12, qa: 1 }, ['SS:4.3+60'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', dc: 'Workmanship',
    desc: 'Airside vehicle service roads linking apron, ARFF, cargo and fuel farm.', del: ['Service roads', 'Road markings'],
    acc: 'Roads open with airside driving markings.', asm: 'Uses reclaimed asphalt where practical.' }),

  // 5 Airfield Ground Lighting
  L('5.1', 'AGL design & cable ducting', [130, 170, 240], 650, { designers: 6, electricians: 40, civil: 30, agl: 6, qa: 2 }, ['SS:3.2+60', 'FS:3.1'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], dc: 'Cable termination',
    desc: 'AGL design, series circuits and duct banks under runway, taxiways and apron.', del: ['AGL design', 'Duct banks & light bases'],
    acc: 'Ducts mandrel-tested; light bases surveyed to ±5 mm.', asm: 'Ducting installed before final surfacing.' }),
  L('5.2', 'Runway edge & centreline lights', [80, 100, 150], 700, { agl: 30, electricians: 30, qa: 2 }, ['SS:3.6+40', 'FF:3.7+15', 'FS:5.1'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'LED runway edge, centreline, threshold and end lights.', del: ['Installed runway lights', 'Photometric test'],
    acc: 'Photometric performance per Annex 14; circuit insulation tests passed.', asm: 'Fittings delivered under P07.' }),
  L('5.3', 'Approach lighting system', [70, 90, 130], 450, { agl: 16, electricians: 20, civil: 20, cranes: 1 }, ['FS:5.1', 'FS:3.9'], {
    cls: 'height', ka: 'Scope', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: '900 m precision approach lighting with sequenced flashers.', del: ['Approach light structures', 'Sequenced flashers'],
    acc: 'Alignment and frangibility verified; flight-checked.', asm: 'Land beyond the threshold acquired.' }),
  L('5.4', 'PAPI', [20, 30, 45], 90, { agl: 8, electricians: 6 }, ['FS:3.6'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'Precision approach path indicators for both runway ends.', del: ['PAPI units (both ends)'],
    acc: 'Angles set and confirmed by flight calibration.', asm: 'Threshold positions final.' }),
  L('5.5', 'Taxiway lights & signage', [90, 120, 170], 420, { agl: 20, electricians: 20 }, ['SS:4.1+150', 'FF:4.1+30'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'Taxiway edge/centreline lights, stop bars and mandatory/information signs.', del: ['Taxiway lights', 'Signage'],
    acc: 'Sign legends per aerodrome chart; stop bars interlocked.', asm: 'Sign schedule approved by the regulator.' }),
  L('5.6', 'CCR room & AGL control', [60, 90, 130], 320, { electricians: 18, agl: 8 }, ['FS:5.1'], {
    cls: 'indoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'Constant-current regulators, AGL control and monitoring system with tower panel.', del: ['CCR room', 'AGL control system'],
    acc: 'Fail-safe switching and monitoring alarms tested.', asm: 'Standby power from 8.4.' }),

  // 6 Navigation Aids & ATC
  L('6.1', 'ILS localiser', [70, 90, 140], 520, { agl: 10, electricians: 12, civil: 15 }, ['SS:3.6+30'], {
    cls: 'outdoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'ILS localiser array and shelter beyond the RWY 20 end.', del: ['Localiser antenna array', 'Equipment shelter'],
    acc: 'Ground check within tolerance; ready for flight calibration.', asm: 'Critical area kept clear.' }),
  L('6.2', 'ILS glide path & DME', [70, 90, 140], 480, { agl: 10, electricians: 12, civil: 15 }, ['SS:6.1', 'FS:3.5'], {
    cls: 'outdoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: 'Glide path antenna, DME transponder and monitoring.', del: ['Glide path mast', 'DME'],
    acc: 'Path angle 3.0° ground-checked.', asm: 'Site graded within the glide path critical area.' }),
  L('6.3', 'ATC tower structure', [230, 280, 380], 1300, { civil: 70, cranes: 1, steel: 20, qa: 2 }, ['FS:2.6', 'FS:3.1'], {
    cls: 'height', ka: 'Schedule', clo: ['CLO2'], mat: 'steel', q: ['concrete'], dc: 'Concrete strength',
    desc: 'Slip-formed concrete tower shaft with cab floor at 42 m.', del: ['Tower shaft', 'Cab floor slab'],
    acc: 'Verticality within 1:1000; concrete strength ≥ 35 MPa.', asm: 'Tower siting gives full manoeuvring-area visibility.' }),
  L('6.4', 'Tower cab & ATC equipment', [120, 150, 210], 1100, { electricians: 20, glaziers: 10, agl: 4, designers: 4 }, ['FS:6.3'], {
    cls: 'indoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'Tower cab glazing, consoles, voice communications, surveillance display and recorders.', del: ['Glazed cab', 'ATC consoles & VCS'],
    acc: 'Site acceptance tests passed; controllers trained.', asm: 'Equipment imported under P09.' }),
  L('6.5', 'AWOS / met station', [45, 60, 90], 180, { electricians: 6, civil: 6 }, ['FS:2.6'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'Automated weather observing system with wind, visibility, RVR and cloud sensors.', del: ['AWOS sensors', 'Met display in tower'],
    acc: 'Sensor calibration certificates accepted by the met office.', asm: 'Sensor sites agreed with the regulator.' }),
  L('6.6', 'Flight calibration', [14, 20, 40], 160, { agl: 4, designers: 4 }, ['FS:6.1', 'FS:6.2', 'FS:5.2', 'FS:5.3', 'FS:5.4', 'FS:6.4'], {
    cls: 'outdoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Documentation',
    desc: 'Flight inspection of ILS, PAPI and approach lighting by a calibration aircraft.', del: ['Flight calibration report'],
    acc: 'All navaids flight-checked and declared operational.', asm: 'Calibration aircraft available in the slot.' }),

  // 7 Passenger Terminal
  L('7.1', 'Terminal design & approvals', [240, 300, 420], 1100, { designers: 60, pmo: 4 }, ['SS:1.4+30'], {
    cls: 'office', ka: 'Scope', clo: ['CLO2'], dc: 'Documentation',
    desc: 'Concept to detailed design of the 34,000 m² terminal with windcatcher roof forms and Ajrak-pattern screens; building approvals.', del: ['Detailed design', 'Building approval', 'Fire strategy'],
    acc: 'Design frozen and building approval granted.', asm: 'Peak-hour design: 1,200 passengers.' }),
  L('7.2', 'Foundations & piling', [140, 180, 260], 2200, { civil: 160, cranes: 3, trucks: 20, qa: 4 }, ['FS:7.1', 'FS:2.6', 'FS:M02'], {
    cls: 'earth', ka: 'Quality', clo: ['CLO2'], q: ['concrete'], dc: 'Concrete strength',
    desc: 'Bored piles, pile caps and ground beams for the terminal.', del: ['Piles & pile tests', 'Pile caps & ground beams'],
    acc: 'Pile integrity and load tests passed.', asm: 'Ground conditions per geotechnical report.' }),
  L('7.3', 'Structural steel frame', [170, 210, 300], 3200, { steel: 140, cranes: 5, qa: 4 }, ['SS:7.2+90', 'FF:7.2+40'], {
    cls: 'height', ka: 'Schedule', clo: ['CLO2'], mat: 'steel', dc: 'Workmanship',
    desc: 'Long-span steel frame for the terminal hall.', del: ['Erected steel frame', 'Bolt torque & weld records'],
    acc: 'Frame surveyed within tolerance; NDT passed.', asm: 'Steel fabricated off-site.' }),
  L('7.4', 'Roof & windcatcher forms', [150, 180, 260], 2100, { steel: 80, cranes: 3, civil: 40, qa: 2 }, ['SS:7.3+120', 'FF:7.3+45'], {
    cls: 'height', ka: 'Scope', clo: ['CLO2'], mat: 'steel', dc: 'Workmanship',
    desc: 'Standing-seam roof with windcatcher (manghi) forms providing passive ventilation.', del: ['Weathertight roof', 'Windcatcher forms'],
    acc: 'Roof watertight under flood test.', asm: 'Roof dry before monsoon.' }),
  L('7.5', 'Glass curtain wall & Ajrak screens', [150, 180, 260], 1900, { glaziers: 60, cranes: 2, qa: 2 }, ['SS:7.4+60'], {
    cls: 'height', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'Glazing seals',
    desc: 'High-performance glazing and Ajrak-pattern solar screens on the airside and landside façades.', del: ['Curtain wall', 'Ajrak screens'],
    acc: 'Water and air-tightness tests passed.', asm: 'Glass imported; samples approved.' }),
  L('7.6', 'MEP', [300, 360, 480], 3600, { electricians: 110, civil: 60, qa: 4 }, ['SS:7.4+30'], {
    cls: 'indoor', ka: 'Quality', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'HVAC, power, lighting, fire protection, plumbing and BMS.', del: ['Installed MEP systems', 'Testing & commissioning records'],
    acc: 'Integrated systems test passed.', asm: 'Chillers delivered on schedule.' }),
  L('7.7', 'Interior fit-out', [220, 270, 380], 2600, { civil: 150, electricians: 20, glaziers: 10, qa: 3 }, ['SS:7.6+150', 'FF:7.6+30'], {
    cls: 'indoor', ka: 'Quality', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Check-in islands, security lanes, lounges, retail, prayer rooms, wayfinding and finishes.', del: ['Fitted-out terminal', 'Snag list closed'],
    acc: 'Practical completion certificate.', asm: 'Tenant fit-out by others.' }),
  L('7.8', 'Baggage handling system', [200, 240, 330], 1700, { electricians: 30, steel: 20, designers: 4, qa: 2 }, ['SS:7.6+150'], {
    cls: 'indoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'Check-in collectors, hold-baggage screening, sorter and reclaim carousels.', del: ['Installed BHS', 'Throughput test'],
    acc: 'Throughput 1,200 bags/h with ≤ 0.5 % mis-sorts.', asm: 'Integrated with 10.4.' }),
  L('7.9', 'Passenger boarding bridges', [90, 120, 170], 1200, { steel: 20, electricians: 12, cranes: 1 }, ['FS:7.3', 'FS:4.3'], {
    cls: 'height', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'Four apron-drive passenger boarding bridges with pre-conditioned air and 400 Hz power.', del: ['Four boarding bridges'],
    acc: 'Docking tests with each aircraft type.', asm: 'Bridges imported under P06.' }),

  // 8 Airport Support Facilities
  L('8.1', 'Cargo shed', [150, 180, 250], 1100, { civil: 80, steel: 30, cranes: 1, qa: 1 }, ['FS:2.6', 'FS:M02'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], mat: 'steel', dc: 'Workmanship',
    desc: 'Cargo terminal with perishables area for mango and textile exporters.', del: ['Cargo shed', 'Cargo apron interface'],
    acc: 'Handover to the cargo operator.', asm: 'Exporter demand per business case.' }),
  L('8.2', 'Fuel farm', [160, 200, 280], 1100, { civil: 50, steel: 25, electricians: 10, cranes: 1, qa: 2 }, ['FS:2.6', 'FS:1.5'], {
    cls: 'outdoor', ka: 'Risk', clo: ['CLO2'], mat: 'imported', q: ['concrete'], dc: 'Workmanship',
    desc: 'Four Jet A-1 tanks, bunds, filtration and hydrant pit connection.', del: ['Fuel tanks & bunds', 'Fuel quality lab'],
    acc: 'Hydrostatic tests and fire-safety approval.', asm: 'Fuel supplier operates the farm.' }),
  L('8.3', 'ARFF fire station', [140, 170, 240], 650, { civil: 60, steel: 15, electricians: 8, qa: 1 }, ['FS:2.6'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], q: ['concrete'], dc: 'Workmanship',
    desc: 'Aerodrome rescue and fire-fighting station sized for the required category.', del: ['ARFF station', 'Response-time test'],
    acc: 'Response time ≤ 3 minutes to each runway end.', asm: 'Fire vehicles procured by the operator.' }),
  L('8.4', 'Power substation & standby generation', [150, 180, 260], 1150, { electricians: 40, civil: 20, cranes: 1, qa: 1 }, ['FS:2.5'], {
    cls: 'outdoor', ka: 'Risk', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: '132/11 kV substation, ring main and standby diesel generation with AGL changeover < 1 s.', del: ['Substation', 'Standby generators'],
    acc: 'Changeover tests within Annex 14 switch-over times.', asm: 'Grid connection approved.' }),
  L('8.5', 'Solar PV plant', [120, 150, 210], 1100, { electricians: 40, civil: 30 }, ['FS:8.4-60', 'FS:2.6'], {
    cls: 'outdoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'Cable termination',
    desc: '5 MWp ground-mounted solar PV east of the runway with glint-and-glare study.', del: ['Solar arrays', 'Inverter station'],
    acc: 'Performance ratio test passed; no glare to approach paths.', asm: 'Net-metering approved.' }),
  L('8.6', 'Water supply & treatment', [120, 150, 220], 520, { civil: 40, electricians: 8 }, ['FS:2.5'], {
    cls: 'earth', ka: 'Scope', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Water treatment plant, storage and distribution.', del: ['Treatment plant', 'Distribution network'],
    acc: 'Water quality to drinking standard.', asm: 'Raw water allocation granted.' }),
  L('8.7', 'Storm drainage & monsoon outfall', [150, 190, 270], 760, { civil: 90, trucks: 12, qa: 1 }, ['SS:3.10+30', 'FS:2.5'], {
    cls: 'earth', ka: 'Risk', clo: ['CLO2'], dc: 'Workmanship',
    desc: 'Primary storm drains, attenuation pond and outfall to the drainage channel.', del: ['Storm drains', 'Outfall structure'],
    acc: 'Design storm conveyed; outfall approved by the irrigation authority.', asm: 'Outfall permission granted.' }),

  // 9 Landside
  L('9.1', 'Access road', [120, 150, 210], 750, { civil: 70, pavers: 1, trucks: 15, qa: 1 }, ['FS:2.5'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', q: ['roughness'], dc: 'Ride quality',
    desc: 'Dual-carriageway access road from the city to the forecourt.', del: ['Access road', 'Junction & signals'],
    acc: 'Road safety audit passed.', asm: 'Right of way available.' }),
  L('9.2', 'Car park', [90, 120, 170], 420, { civil: 50, pavers: 1, trucks: 8 }, ['SS:9.1+60', 'FS:2.6'], {
    cls: 'asphalt', ka: 'Scope', clo: ['CLO2'], mat: 'bitumen', dc: 'Workmanship',
    desc: 'Short- and long-stay car parks with shaded bays.', del: ['Car park', 'Parking control'],
    acc: 'Bays, lighting and drainage accepted.', asm: 'Parking operator by concession.' }),
  L('9.3', 'Forecourt & canopy', [90, 120, 170], 520, { civil: 40, steel: 20, cranes: 1 }, ['FS:7.3', 'SS:9.1+90'], {
    cls: 'outdoor', ka: 'Scope', clo: ['CLO2'], mat: 'steel', dc: 'Workmanship',
    desc: 'Departures and arrivals forecourt with shade canopy.', del: ['Forecourt', 'Canopy'],
    acc: 'Traffic management plan tested.', asm: 'Canopy steel from the terminal fabricator.' }),
  L('9.4', 'Landscaping', [60, 80, 120], 260, { civil: 40 }, ['FS:9.3', 'FS:9.2'], {
    cls: 'outdoor', ka: 'Stakeholders', clo: ['CLO3'], dc: 'Workmanship',
    desc: 'Native, low-water planting (neem, date palms) avoiding bird-attracting species near the airfield.', del: ['Planting', 'Irrigation'],
    acc: 'Planting establishes; wildlife hazard review passed.', asm: 'Treated water used for irrigation.' }),

  // 10 Terminal IT & Airport Systems (Agile)
  L('10.1', 'Product discovery & backlog', [30, 42, 60], 140, { itdev: 8, designers: 2 }, ['FS:7.3'], {
    cls: 'office', ka: 'Scope', clo: ['CLO1'], dc: 'Software defect', owner: 'Product Owner (Terminal IT)',
    desc: 'Discovery with airlines, security and operations; product vision, roadmap and the prioritised product backlog.', del: ['Product vision & roadmap', 'Prioritised backlog', 'Definition of Done'],
    acc: 'Backlog estimated and ordered; release plan agreed.', asm: 'Airline users available for discovery workshops.' }),
  L('10.2', 'FIDS increment', [238, 280, 322], 420, { itdev: 4 }, ['FS:10.1'], {
    cls: 'indoor', ka: 'Scope', clo: ['CLO1', 'CLO2'], dc: 'Software defect', owner: 'Product Owner (Terminal IT)',
    desc: 'Flight information display system increment built in two-week sprints.', del: ['Working FIDS increment', 'Sprint review records'],
    acc: 'All FIDS stories meet the Definition of Done and pass user acceptance.', asm: 'AODB interface specification stable.' }),
  L('10.3', 'CUTE check-in increment', [238, 280, 322], 520, { itdev: 4 }, ['FS:10.1'], {
    cls: 'indoor', ka: 'Scope', clo: ['CLO1', 'CLO2'], dc: 'Software defect', owner: 'Product Owner (Terminal IT)',
    desc: 'Common-use terminal equipment for check-in, kiosks and bag drop.', del: ['Working CUTE increment'],
    acc: 'Airline DCS sessions load on any counter; UAT passed.', asm: 'Airline DCS test environments available.' }),
  L('10.4', 'Baggage reconciliation software increment', [238, 280, 322], 380, { itdev: 4 }, ['FS:10.1'], {
    cls: 'indoor', ka: 'Scope', clo: ['CLO1', 'CLO2'], dc: 'Software defect', owner: 'Product Owner (Terminal IT)',
    desc: 'Baggage reconciliation system linking bag tags, screening results and passenger boarding status.', del: ['Working BRS increment'],
    acc: 'Reconciliation of every loaded bag demonstrated in trials.', asm: 'BHS PLC gateway available for integration.' }),
  L('10.5', 'Security & access-control integration', [238, 280, 322], 600, { itdev: 4, electricians: 6 }, ['FS:10.1'], {
    cls: 'indoor', ka: 'Risk', clo: ['CLO1', 'CLO2'], dc: 'Software defect', owner: 'Product Owner (Terminal IT)',
    desc: 'Access control, CCTV, perimeter intrusion detection and SIEM integration.', del: ['Integrated security platform'],
    acc: 'Security acceptance tests witnessed by the airport security force.', asm: 'Vetting database interface approved.' }),
  L('10.6', 'IT infrastructure & data centre', [150, 180, 240], 900, { electricians: 20, itdev: 2 }, ['SS:7.6+180'], {
    cls: 'indoor', ka: 'Procurement', clo: ['CLO2'], mat: 'imported', dc: 'MEP commissioning',
    desc: 'Tier III-style data room, passive network, Wi-Fi and core switching.', del: ['Data centre', 'Campus network'],
    acc: 'Network and failover tests passed.', asm: 'Fibre backbone ducts laid with MEP.' }),

  // 11 Operational Readiness & Certification
  L('11.1', 'ORAT programme', [240, 300, 400], 260, { pmo: 10, designers: 4 }, ['SS:7.6+120'], {
    cls: 'office', ka: 'Integration', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Operational readiness and airport transfer programme: concept of operations, procedures and trials plan.', del: ['ORAT plan', 'Concept of operations', 'Trials scenarios'],
    acc: 'Readiness assessment green on all streams.', asm: 'Operator staff seconded to ORAT.' }),
  L('11.2', 'Staff recruitment & training', [200, 240, 320], 380, { pmo: 8 }, ['SS:11.1+60'], {
    cls: 'office', ka: 'Resources', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Recruitment and training of operations, security, ARFF and maintenance staff.', del: ['Staffed rosters', 'Training records'],
    acc: 'Competence records complete for every licensed role.', asm: 'Local hiring targets agreed with the province.' }),
  L('11.3', 'Aerodrome manual & SMS', [100, 120, 180], 90, { pmo: 4, designers: 2 }, ['SS:11.1+90'], {
    cls: 'office', ka: 'Quality', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Aerodrome manual, safety management system, wildlife hazard and emergency plans.', del: ['Aerodrome manual', 'SMS manual', 'Emergency plan'],
    acc: 'Accepted by the regulator.', asm: 'Regulator review within 60 days.' }),
  L('11.4', 'Operational trials', [45, 60, 90], 160, { pmo: 12, qa: 6, itdev: 4 }, ['FS:M07', 'FS:11.2-30', 'FS:M08', 'FS:M12'], {
    cls: 'indoor', ka: 'Quality', clo: ['CLO3'], dc: 'MEP commissioning',
    desc: 'Volunteer passenger trials, baggage trials, emergency exercise and live-systems proving.', del: ['Trial reports', 'Punch list'],
    acc: 'All critical trial scenarios passed.', asm: 'Volunteers recruited from the community.' }),
  L('11.5', 'Aerodrome certification', [40, 55, 100], 60, { pmo: 4, qa: 4 }, ['FS:11.4', 'FS:11.3', 'FS:6.6'], {
    cls: 'office', ka: 'Quality', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Regulator inspection, findings close-out and grant of the aerodrome certificate.', del: ['Aerodrome certificate', 'AIP amendment'],
    acc: 'Certificate granted for the extended runway.', asm: 'AIRAC cycle aligned with opening date.' }),
  L('11.6', 'Airline onboarding', [60, 80, 120], 120, { pmo: 6 }, ['SS:11.4', 'SF:12.2'], {
    cls: 'office', ka: 'Stakeholders', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Route development, slot and ground-handling agreements with fictional carriers (e.g. Indus Skyways, Mehran Air Link).', del: ['Signed airline agreements', 'Ground handling licences'],
    acc: 'At least three carriers committed to the opening schedule.', asm: 'Incentive scheme approved.' }),

  // 12 Handover & Closure
  L('12.1', 'Commissioning & final acceptance', [60, 75, 110], 180, { qa: 8, designers: 6, electricians: 10 }, ['SS:11.4', 'FF:11.5+15'], {
    cls: 'indoor', ka: 'Quality', clo: ['CLO3'], dc: 'MEP commissioning',
    desc: 'Final commissioning, defects inspection and final acceptance certificates.', del: ['Final acceptance certificates', 'As-built records', 'O&M manuals'],
    acc: 'Taking-over certificates issued for every contract.', asm: 'Defects liability periods start at handover.' }),
  L('12.2', 'Transition to operations', [30, 45, 75], 90, { pmo: 10 }, ['FS:M09'], {
    cls: 'office', ka: 'Integration', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Opening-day plan, hypercare, and transfer of assets and knowledge to the airport operator.', del: ['Opening-day plan', 'Asset register handed over'],
    acc: 'Operator signs the transition certificate.', asm: 'Hypercare team retained for 30 days.' }),
  L('12.3', 'Contract closure & final accounts', [70, 90, 150], 120, { pmo: 8 }, ['FS:M10'], {
    cls: 'office', ka: 'Procurement', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Final accounts, claims settlement, incentive and award fee determinations, release of retentions.', del: ['Agreed final accounts', 'Contract closure letters'],
    acc: 'Every contract formally closed.', asm: 'No unresolved disputes at closure.' }),
  L('12.4', 'Lessons learned & archive', [30, 40, 60], 25, { pmo: 4 }, ['SS:12.3+30', 'FF:12.3+5'], {
    cls: 'office', ka: 'Integration', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Lessons-learned register, retrospective and archiving of project records.', del: ['Lessons-learned register', 'Project archive'],
    acc: 'Archive indexed and accepted by the sponsor.', asm: 'Document control system retained.' }),
  L('12.5', 'Benefits realisation plan', [45, 60, 90], 40, { pmo: 4 }, ['SS:12.2+15'], {
    cls: 'office', ka: 'Integration', clo: ['CLO3'], dc: 'Documentation',
    desc: 'Benefits register, measures, owners and the post-opening review schedule.', del: ['Benefits realisation plan', 'Baseline KPI set'],
    acc: 'Benefit owners accept their measures.', asm: 'Operations data feed available.' }),
];

/** Zero-duration milestones (gates carry the 10-day review as a lag). */
export const MILESTONES = [
  { id: 'M01', name: 'Charter approved — Gate G0', summaryId: '1', gate: 'G0', preds: ['FS:1.2+10'] },
  { id: 'M02', name: 'Baselines & ESIA approved — Gate G1', summaryId: '1', gate: 'G1', preds: ['FS:1.4+10', 'FS:1.5+10', 'FS:2.1+10', 'FS:1.3+10'] },
  { id: 'M03', name: 'Extension land handed over', summaryId: '2', preds: ['FS:2.3'] },
  { id: 'M04', name: 'Runway extension surfaced', summaryId: '3', preds: ['FS:3.5'] },
  { id: 'M05', name: 'Terminal roof watertight', summaryId: '7', preds: ['FS:7.4'] },
  { id: 'M06', name: 'Runway 02/20 Code E complete', summaryId: '3', preds: ['FS:3.8', 'FS:5.2', 'FS:3.9', 'FS:3.10'] },
  { id: 'M07', name: 'Construction complete — Gate G2', summaryId: '11', gate: 'G2',
    preds: ['FS:7.7+10', 'FS:7.8+10', 'FS:7.9+10', 'FS:7.5+10', 'FS:M06+10', 'FS:4.2+10', 'FS:4.4+10', 'FS:4.5+10', 'FS:4.6+10', 'FS:5.5+10', 'FS:5.6+10', 'FS:6.5+10',
      'FS:8.1+10', 'FS:8.2+10', 'FS:8.3+10', 'FS:8.5+10', 'FS:8.6+10', 'FS:8.7+10', 'FS:9.4+10', 'FS:2.4+10', 'FS:10.6+10'] },
  { id: 'M08', name: 'Flight calibration passed', summaryId: '6', preds: ['FS:6.6'] },
  { id: 'M09', name: 'Aerodrome certificate granted — Gate G3', summaryId: '11', gate: 'G3', preds: ['FS:11.5+10'] },
  { id: 'M10', name: 'Handover accepted — Gate G4', summaryId: '12', gate: 'G4', preds: ['FS:12.1+10', 'FS:12.2+10', 'FS:11.6+10'] },
  { id: 'M11', name: 'Project closed', summaryId: '12', preds: ['FS:12.3', 'FS:12.4', 'FS:12.5'] },
  { id: 'M12', name: 'Terminal IT release 1.0 accepted', summaryId: '10', preds: ['FS:10.2', 'FS:10.3', 'FS:10.4', 'FS:10.5', 'FS:10.6'] },
].map((m) => ({ ...m, predecessors: parseLinks(m.preds) }));

export const GATES = [
  { id: 'G0', name: 'Initiation gate — charter', milestone: 'M01', phase: 'initiating', next: 'planning',
    criteria: ['Business case endorsed (1.1)', 'Project charter signed (1.2)'] },
  { id: 'G1', name: 'Planning gate — baselines & ESIA', milestone: 'M02', phase: 'planning', next: 'executing',
    criteria: ['PM plan & baselines complete (1.4)', 'Environmental approval (1.5)', 'Land titles verified (2.1)', 'Engagement plan issued (1.3)'] },
  { id: 'G2', name: 'Construction completion gate', milestone: 'M07', phase: 'executing', next: 'monitoring',
    criteria: ['Terminal practical completion (7.x)', 'Runway Code E complete (M06)', 'Support facilities complete (8.x)', 'Landside complete (9.x)', 'IT infrastructure ready (10.6)'] },
  { id: 'G3', name: 'Operational readiness & certification gate', milestone: 'M09', phase: 'monitoring', next: 'monitoring',
    criteria: ['Operational trials passed (11.4)', 'Aerodrome certificate (11.5)', 'Aerodrome manual & SMS accepted (11.3)'] },
  { id: 'G4', name: 'Handover & closure gate', milestone: 'M10', phase: 'monitoring', next: 'closing',
    criteria: ['Final acceptance certificates (12.1)', 'Transition to operations signed (12.2)', 'Airlines onboarded (11.6)'] },
];

/* ---------------------------------------------------------------- climate */

/**
 * Simulated Hyderabad (Sindh) climatology by month: mean daily maximum (°C)
 * and the probability that a day starts a spell of each weather kind.
 * Dust storms in spring/summer, extreme heat May–June, monsoon July–September,
 * night fog in winter, haze in the cool season.
 */
export const CLIMATE = [
  { m: 'Jan', tmax: 25, haze: 0.18, fog: 0.22 },
  { m: 'Feb', tmax: 28, haze: 0.16, fog: 0.08 },
  { m: 'Mar', tmax: 34, haze: 0.08, dust: 0.08 },
  { m: 'Apr', tmax: 39, dust: 0.12, heat: 0.08 },
  { m: 'May', tmax: 42, dust: 0.12, heat: 0.4 },
  { m: 'Jun', tmax: 41, dust: 0.14, heat: 0.34, rain: 0.03 },
  { m: 'Jul', tmax: 38, dust: 0.06, rain: 0.2, heat: 0.04 },
  { m: 'Aug', tmax: 36, rain: 0.24 },
  { m: 'Sep', tmax: 36, rain: 0.12, heat: 0.05 },
  { m: 'Oct', tmax: 36, haze: 0.12 },
  { m: 'Nov', tmax: 31, haze: 0.2, fog: 0.06 },
  { m: 'Dec', tmax: 26, haze: 0.18, fog: 0.2 },
];

/** Productivity factor by work class and weather kind (at intensity 1). */
export const WEATHER_FACTORS = {
  earth: { clear: 1, haze: 1, dust: 0.7, rain: 0.35, fog: 0.95, heat: 0.85 },
  asphalt: { clear: 1, haze: 1, dust: 0.6, rain: 0.2, fog: 0.85, heat: 0.7 },
  outdoor: { clear: 1, haze: 1, dust: 0.75, rain: 0.6, fog: 0.9, heat: 0.8 },
  height: { clear: 1, haze: 0.98, dust: 0.45, rain: 0.6, fog: 0.85, heat: 0.8 },
  indoor: { clear: 1, haze: 1, dust: 0.97, rain: 0.95, fog: 1, heat: 0.95 },
  office: { clear: 1, haze: 1, dust: 1, rain: 0.98, fog: 1, heat: 1 },
};

export const WEATHER_LABELS = { clear: 'Clear', haze: 'Haze', dust: 'Dust storm', rain: 'Monsoon rain', fog: 'Night fog', heat: 'Extreme heat' };

export const DIFFICULTY = {
  trainee: { label: 'Trainee', riskScale: 0.55, impactScale: 0.7, variability: 0.25, productivity: 1.0, incident: 0.6, satisfaction: 0.68, community: 0.58 },
  professional: { label: 'Professional', riskScale: 1.0, impactScale: 1.0, variability: 0.55, productivity: 1.0, incident: 1.0, satisfaction: 0.62, community: 0.5 },
  crisis: { label: 'Crisis', riskScale: 1.6, impactScale: 1.3, variability: 0.9, productivity: 0.97, incident: 1.5, satisfaction: 0.55, community: 0.42 },
};

/* ---------------------------------------------------------------- quality */

export const QUALITY_METRICS = {
  concrete: { name: 'Concrete compressive strength (28-day)', unit: 'MPa', target: 42, lsl: 35, usl: 55, sd: 2.3, worse: -1 },
  compaction: { name: 'Field compaction (% of MDD)', unit: '%', target: 98.5, lsl: 95, usl: 102, sd: 1.15, worse: -1 },
  friction: { name: 'Runway friction coefficient (65 km/h)', unit: 'μ', target: 0.74, lsl: 0.6, usl: 0.95, sd: 0.046, worse: -1 },
  roughness: { name: 'Ride quality (IRI)', unit: 'm/km', target: 1.3, lsl: 0.5, usl: 2.0, sd: 0.23, worse: 1 },
};

export const DEFECT_CATEGORIES = ['Compaction', 'Concrete strength', 'Surface texture', 'Ride quality', 'Cable termination', 'Glazing seals', 'MEP commissioning', 'Software defect', 'Documentation', 'Workmanship'];

/* ------------------------------------------------------------------ risks */

function R(id, title, category, rbs, kind, probability, residual, costImpactM, daysImpact, affects, response, owner, trigger, strategies, extra = {}) {
  return {
    id, title, category, rbs, kind, rawProbability: probability, residual, costImpact: costImpactM * M, daysImpact,
    affects, response, owner, trigger, strategies: strategies.map(([strategy, action]) => ({ strategy, action })), ...extra,
  };
}

export const RISK_REGISTER = [
  R('R01', 'Land encroachment re-occupies cleared pockets', 'Social', 'External › Social › Land', 'threat', 0.45, 0.25, 450, 40, ['2.3', '2.4', '3.2'], 'Mitigate',
    'Land & Resettlement Manager', 'New structures seen on the weekly drone survey of the perimeter.',
    [['Mitigate', 'Fence each pocket the day it is cleared; community liaison officers on site.'], ['Escalate', 'Ask the district administration to enforce the cleared boundary.'], ['Accept', 'Hold contingency for repeat clearance.']], { responseCost: 40 * M }),
  R('R02', 'Land-ownership dispute and court stay order', 'Legal', 'External › Regulatory › Legal', 'threat', 0.35, 0.2, 600, 60, ['2.2', '2.3'], 'Mitigate',
    'Land & Resettlement Manager', 'Petition filed by a claimant over a parcel in the extension corridor.',
    [['Mitigate', 'Independent title verification and negotiated settlements before notification.'], ['Transfer', 'Province indemnifies the project for title defects.'], ['Accept', 'Hold contingency for litigation delay.']], { responseCost: 30 * M }),
  R('R03', 'Monsoon flooding of open works', 'Environmental', 'External › Environment › Weather', 'threat', 0.5, 0.35, 350, 18, ['2.5', '3.2', '3.3', '3.4', '3.10', '4.1', '4.3', '7.2', '8.7', '9.1'], 'Mitigate',
    'Airside Works Manager', 'Forecast of more than 50 mm rain in 24 hours.',
    [['Mitigate', 'Temporary drainage first; schedule earthworks outside July–September.'], ['Transfer', 'Contractor all-risks insurance for flood damage.'], ['Accept', 'Seasonal contingency.']],
    { weather: 'rain', recurring: true, months: [6, 7, 8], responseCost: 60 * M }),
  R('R04', 'Dust storms halt paving and crane lifts', 'Environmental', 'External › Environment › Weather', 'threat', 0.55, 0.45, 80, 8, ['3.5', '3.6', '6.3', '7.3', '7.4', '7.5', '4.5'], 'Accept',
    'HSE Manager', 'Wind gusts above 40 km/h with visibility below 1 km.',
    [['Accept', 'Stop lifting above wind limits; resequence indoor work.'], ['Mitigate', 'Wind monitoring with lift plans and dust screens.']],
    { weather: 'dust', recurring: true, months: [3, 4, 5, 6] }),
  R('R05', 'Extreme heat above 45 °C — labour heat stress', 'Health & safety', 'Internal › Resources › Labour', 'threat', 0.6, 0.45, 60, 10, ['*outdoor'], 'Mitigate',
    'HSE Manager', 'Forecast maximum above 45 °C for two consecutive days.',
    [['Mitigate', 'Shift work to night and early morning, shaded rest, water and ORS stations.'], ['Accept', 'Contingency for lost shifts.']],
    { weather: 'heat', recurring: true, months: [4, 5], responseCost: 25 * M }),
  R('R06', 'Extreme heat — asphalt laying window and rutting', 'Technical', 'Technical › Materials › Asphalt', 'threat', 0.45, 0.3, 120, 12, ['3.5', '3.6', '3.7', '4.1', '4.2', '4.6', '9.1'], 'Mitigate',
    'Airside Works Manager', 'Pavement surface temperature above 60 °C at noon.',
    [['Mitigate', 'Night paving and polymer-modified binder.'], ['Avoid', 'Programme surfacing outside May–June.']],
    { weather: 'heat', recurring: true, months: [4, 5], responseCost: 20 * M }),
  R('R07', 'PKR devaluation raises import costs', 'Economic', 'External › Market › Currency', 'threat', 0.5, 0.4, 1800, 0, ['*imported'], 'Mitigate',
    'Finance Controller', 'PKR falls more than 8 % against the US dollar within a quarter.',
    [['Mitigate', 'Forward cover and early letters of credit for major imports.'], ['Transfer', 'Price adjustment clause carried by suppliers in FFP contracts.'], ['Accept', 'Contingency for exchange movement.']],
    { priceShock: { cls: 'imported', pct: 0.12 }, responseCost: 35 * M }),
  R('R08', 'Steel price shock', 'Economic', 'External › Market › Commodities', 'threat', 0.35, 0.3, 700, 0, ['*steel'], 'Accept',
    'Commercial Manager', 'Rebar/section index up 15 % on contract base.',
    [['Accept', 'Contingency for price escalation.'], ['Mitigate', 'Early mill orders at fixed price.']], { priceShock: { cls: 'steel', pct: 0.15 } }),
  R('R09', 'Bitumen price shock', 'Economic', 'External › Market › Commodities', 'threat', 0.4, 0.35, 500, 0, ['*bitumen'], 'Accept',
    'Commercial Manager', 'Refinery bitumen price up 15 % on contract base.',
    [['Accept', 'Contingency for price escalation.'], ['Mitigate', 'Bulk purchase and storage (see R27).']], { priceShock: { cls: 'bitumen', pct: 0.18 } }),
  R('R10', 'Utility relocation delays', 'Third party', 'External › Third parties › Utilities', 'threat', 0.45, 0.3, 250, 45, ['2.5'], 'Mitigate',
    'Utilities & Support Facilities Manager', 'Utility company misses its permit or shutdown date.',
    [['Mitigate', 'Joint utility programme with named contacts and early permits.'], ['Escalate', 'Provincial coordination committee.']], { responseCost: 15 * M }),
  R('R11', 'Bird and wildlife strike hazard', 'Safety', 'Operational › Aviation safety › Wildlife', 'threat', 0.25, 0.15, 60, 20, ['11.4', '11.5', '9.4'], 'Mitigate',
    'ORAT Manager', 'Bird counts above threshold near the drainage outfall.',
    [['Mitigate', 'Wildlife hazard management plan; cover the drainage pond; no fruiting trees.'], ['Accept', 'Contingency.']], { responseCost: 10 * M }),
  R('R12', 'Regulatory certification delay', 'Regulatory', 'External › Regulatory › Aviation authority', 'threat', 0.35, 0.25, 300, 45, ['11.5', '6.6', '11.3'], 'Mitigate',
    'ORAT Manager', 'Regulator findings unresolved 30 days before the planned inspection.',
    [['Mitigate', 'Early engagement and staged pre-inspections with the regulator.'], ['Escalate', 'Sponsor-level engagement with the authority.']], { responseCost: 12 * M }),
  R('R13', 'Main contractor insolvency', 'Commercial', 'Internal › Procurement › Contractor', 'threat', 0.12, 0.08, 2200, 100, ['7.3', '7.4', '7.5', '7.6', '7.7'], 'Transfer',
    'Commercial Manager', 'Late subcontractor payments and a qualified audit opinion.',
    [['Transfer', 'Performance bond and parent-company guarantee.'], ['Mitigate', 'Monthly financial health checks; direct payment to key subcontractors.']], { responseCost: 25 * M }),
  R('R14', 'Security incident on site', 'Security', 'External › Security', 'threat', 0.25, 0.15, 150, 10, ['2.4', '2.6', '7.2', '7.3'], 'Mitigate',
    'Security Manager', 'Credible threat report or theft of materials.',
    [['Mitigate', 'Guarding, access control and lighting of compounds.'], ['Transfer', 'Insure materials in store.']], { responseCost: 20 * M }),
  R('R15', 'Scope change to widen taxiway & stands to Code E', 'Scope', 'Internal › Scope › Requirements', 'threat', 0.5, 0.4, 900, 30, ['4.1', '4.3'], 'Accept',
    'Project Director', 'Airlines committee requests wide-body capability before taxiway paving.',
    [['Accept', 'Route through change control; evaluate at the CCB.'], ['Avoid', 'Freeze the design at Gate G1.']], { raisesChange: 'CR-T1' }),
  R('R16', 'Navaid equipment import delayed at customs', 'Procurement', 'Internal › Procurement › Logistics', 'threat', 0.3, 0.2, 120, 40, ['6.1', '6.2', '6.4', '6.5'], 'Mitigate',
    'Commercial Manager', 'Shipment held more than 14 days.',
    [['Mitigate', 'Pre-clearance and a customs agent; ship early.'], ['Transfer', 'DDP incoterms in the supply contract.']], { responseCost: 8 * M, supplyHit: 'imported' }),
  R('R17', 'Baggage handling system integration failure', 'Technical', 'Technical › Integration', 'threat', 0.3, 0.2, 400, 35, ['7.8', '10.4'], 'Mitigate',
    'Product Owner (Terminal IT)', 'Sorter–BRS interface tests failing at sprint review.',
    [['Mitigate', 'Integration environment and early end-to-end tests each sprint.'], ['Accept', 'Contingency.']], { responseCost: 20 * M }),
  R('R18', 'IT/cyber integration and data-centre readiness', 'Technical', 'Technical › Integration › IT', 'threat', 0.3, 0.2, 250, 30, ['10.5', '10.6'], 'Mitigate',
    'Product Owner (Terminal IT)', 'Penetration test finds critical vulnerabilities.',
    [['Mitigate', 'Security-by-design, SIEM from sprint 1, independent pen tests.'], ['Transfer', 'Vendor warranty on security defects.']], { responseCost: 15 * M }),
  R('R19', 'Skilled labour shortage (AGL technicians, glaziers)', 'Resources', 'Internal › Resources › Skills', 'threat', 0.35, 0.25, 180, 30, ['5.2', '5.3', '5.5', '7.5'], 'Mitigate',
    'Project Director', 'Specialist headcount below 80 % of plan for two weeks.',
    [['Mitigate', 'Early hiring and a training school with the local polytechnic.'], ['Transfer', 'Supplier-installed packages.']], { responseCost: 15 * M }),
  R('R20', 'Expansive clay and high water table at piling', 'Technical', 'Technical › Ground conditions', 'threat', 0.3, 0.2, 500, 35, ['7.2', '3.2', '6.3'], 'Mitigate',
    'Terminal Construction Manager', 'Pile test results below design capacity.',
    [['Mitigate', 'Additional boreholes and pile load tests before production piling.'], ['Accept', 'Contingency for extra piles.']], { responseCost: 30 * M }),
  R('R21', 'Grid power outages (load-shedding)', 'Infrastructure', 'External › Utilities › Power', 'threat', 0.5, 0.35, 90, 10, ['*indoor'], 'Mitigate',
    'Utilities & Support Facilities Manager', 'Unscheduled outages above 4 hours/day.',
    [['Mitigate', 'Site generators and fuel stock.'], ['Accept', 'Contingency.']], { responseCost: 15 * M }),
  R('R22', 'Development funding release delayed', 'Financial', 'External › Funding', 'threat', 0.3, 0.25, 200, 35, ['*'], 'Escalate',
    'Finance Controller', 'Quarterly release below 75 % of the funding limit.',
    [['Escalate', 'Sponsor secures releases with the finance ministry.'], ['Mitigate', 'Re-sequence work to match cash flow.']]),
  R('R23', 'Construction accident or crane collapse', 'Safety', 'Internal › HSE', 'threat', 0.15, 0.1, 250, 25, ['6.3', '7.3', '7.4', '7.9'], 'Mitigate',
    'HSE Manager', 'Near-miss frequency rising for two months.',
    [['Mitigate', 'Lift plans, third-party crane inspection, permits to work.'], ['Transfer', 'Insurance.']], { responseCost: 20 * M, safetyHit: 0.12 }),
  R('R24', 'Resident opposition to noise and dust', 'Social', 'External › Social › Community', 'threat', 0.35, 0.25, 100, 15, ['2.3', '3.2', '3.6', '9.1'], 'Mitigate',
    'Community Liaison Officer', 'Petition or protest at the site gate.',
    [['Mitigate', 'Dust suppression, work-hour limits, community meetings.'], ['Accept', 'Contingency.']], { responseCost: 10 * M, communityHit: 0.1 }),
  R('R25', 'Winter night fog delays night works and calibration', 'Environmental', 'External › Environment › Weather', 'threat', 0.4, 0.4, 30, 7, ['3.6', '6.6', '11.4'], 'Accept',
    'Airside Works Manager', 'Visibility below 800 m forecast overnight.',
    [['Accept', 'Re-plan night shifts; calibration window with float.']], { weather: 'fog', recurring: true, months: [11, 0] }),
  R('R26', 'Late terminal design changes', 'Technical', 'Technical › Design', 'threat', 0.35, 0.25, 450, 30, ['7.1', '7.6', '7.7'], 'Mitigate',
    'Design Consultant', 'More than 20 design queries open for 30 days.',
    [['Mitigate', 'Design freeze at G1 with BIM coordination.'], ['Accept', 'Contingency.']], { responseCost: 20 * M }),
  R('R27', 'Early bulk purchase of bitumen and aggregate', 'Commercial', 'Internal › Procurement › Materials', 'opportunity', 0.4, 0.6, 350, 0, ['3.5', '3.6', '3.7'], 'Exploit',
    'Commercial Manager', 'Refinery offers a seasonal discount.',
    [['Exploit', 'Buy and store a season of bitumen at the discount.'], ['Accept', 'Buy as needed.']], { priceShock: { cls: 'bitumen', pct: -0.06 } }),
  R('R28', 'Solar-power grant from a green climate facility', 'Financial', 'External › Funding › Grants', 'opportunity', 0.35, 0.5, 600, 0, ['8.5'], 'Enhance',
    'Finance Controller', 'Call for proposals opened by the facility.',
    [['Enhance', 'Submit a bankable proposal with carbon accounting.'], ['Share', 'Joint bid with the provincial energy department.']]),
  R('R29', 'Prefabricated modular MEP risers', 'Technical', 'Technical › Methods', 'opportunity', 0.3, 0.45, 200, -20, ['7.6'], 'Enhance',
    'Terminal Construction Manager', 'Fabricator offers off-site riser modules.',
    [['Enhance', 'Design for manufacture; approve modules early.'], ['Accept', 'Traditional install.']]),
  R('R30', 'Favourable dry winter accelerates earthworks', 'Environmental', 'External › Environment › Weather', 'opportunity', 0.45, 0.45, 60, -10, ['3.2', '3.3', '3.4'], 'Accept',
    'Airside Works Manager', 'Seasonal outlook below-normal rainfall.',
    [['Accept', 'Take the gain if it happens.'], ['Exploit', 'Add a second earthworks shift in the dry window.']]),
  R('R31', 'Shared common-use platform with an airline consortium', 'Commercial', 'External › Partners', 'opportunity', 0.3, 0.4, 150, -10, ['10.3'], 'Share',
    'Product Owner (Terminal IT)', 'Consortium offers its cloud platform.',
    [['Share', 'Joint venture on the CUTE platform.'], ['Accept', 'Build as planned.']]),
  R('R32', 'Reuse of milled asphalt in shoulders and service roads', 'Technical', 'Technical › Materials', 'opportunity', 0.5, 0.75, 180, 0, ['3.7', '4.6'], 'Exploit',
    'Airside Works Manager', 'Milled material passes the RAP specification.',
    [['Exploit', 'Specify RAP in shoulders and service roads.'], ['Accept', 'Use virgin material.']]),
];

/* ----------------------------------------------------------- stakeholders */

function S(id, role, group, power, interest, legitimacy, urgency, current, desired, channel, frequency, needs, drivers) {
  return { id, role, group, power, interest, legitimacy, urgency, current, desired, channel, frequency, needs, drivers };
}

export const STAKEHOLDER_REGISTER = [
  S('S01', 'Sponsor — airport owner (PAA programme board)', 'Governance', 0.95, 0.9, 0.95, 0.7, 4, 5, 'Steering committee & monthly dashboard', 'Monthly', 'Value for money, on-time opening, reputation.', { schedule: 3, cost: 3, quality: 1, gate: 2 }),
  S('S02', 'Regulator — aviation authority (PCAA aerodrome standards)', 'Governance', 0.9, 0.7, 0.95, 0.6, 3, 4, 'Formal correspondence & inspections', 'Fortnightly', 'Compliance with aerodrome standards and safety.', { quality: 3, safety: 3 }),
  S('S03', 'Government of Sindh', 'Government', 0.75, 0.7, 0.85, 0.5, 3, 4, 'Coordination committee', 'Monthly', 'Regional development, jobs, resettlement handled fairly.', { community: 3, schedule: 1 }),
  S('S04', 'Ministry of Aviation (federal)', 'Government', 0.85, 0.55, 0.9, 0.4, 3, 4, 'Quarterly review', 'Quarterly', 'National network policy, funding discipline.', { cost: 3, schedule: 1 }),
  S('S05', 'Hyderabad Development Authority', 'Government', 0.55, 0.55, 0.8, 0.4, 2, 4, 'Planning liaison meetings', 'Monthly', 'Land use, access road, utilities.', { community: 2, schedule: 1 }),
  S('S06', 'Hyderabad Chamber of Commerce & Industry', 'Business', 0.4, 0.8, 0.6, 0.5, 3, 4, 'Business forum & newsletter', 'Quarterly', 'Flights, cargo capacity, local contracts.', { schedule: 2, readiness: 2 }),
  S('S07', 'Local residents near the airport', 'Community', 0.3, 0.85, 0.7, 0.7, 2, 3, 'Community meetings & helpline', 'Monthly', 'Noise, dust, safety, local jobs.', { community: 3, safety: 1 }),
  S('S08', 'Encroachment occupants (informal settlers)', 'Community', 0.25, 0.95, 0.5, 0.95, 2, 3, 'Resettlement desk & grievance mechanism', 'Weekly', 'Fair compensation, livelihoods, dignity.', { community: 4 }),
  S('S09', 'Airlines (operators committee)', 'Customers', 0.6, 0.85, 0.8, 0.6, 3, 5, 'Airline operators committee', 'Monthly', 'Runway length, stands, check-in systems, charges.', { readiness: 3, quality: 1, schedule: 1 }),
  S('S10', 'Cargo exporters (mango, textiles)', 'Customers', 0.35, 0.8, 0.6, 0.6, 2, 4, 'Exporters working group', 'Quarterly', 'Cargo shed, cold chain, freighter access.', { schedule: 2, readiness: 2 }),
  S('S11', 'Design consultant (Indus Meridian Consultants)', 'Delivery', 0.5, 0.9, 0.8, 0.5, 4, 4, 'Design coordination meetings', 'Weekly', 'Clear decisions, timely approvals.', { quality: 2, schedule: 1 }),
  S('S12', 'Main contractor (Kirthar Ridge Constructors JV)', 'Delivery', 0.6, 0.95, 0.8, 0.7, 3, 4, 'Progress meetings & site instructions', 'Weekly', 'Cash flow, access, fair claims.', { cost: 2, schedule: 2, safety: 1 }),
  S('S13', 'IT vendor (Saffron Grid Technologies)', 'Delivery', 0.35, 0.9, 0.7, 0.5, 3, 4, 'Sprint reviews', 'Fortnightly', 'Stable backlog, engaged product owner.', { readiness: 3 }),
  S('S14', 'Workforce and site labour', 'Delivery', 0.45, 0.9, 0.75, 0.7, 3, 4, 'Toolbox talks & welfare committee', 'Weekly', 'Safety, heat protection, timely wages.', { safety: 3, welfare: 3 }),
  S('S15', 'Media (regional press & broadcast)', 'Public', 0.5, 0.6, 0.5, 0.6, 2, 3, 'Press releases & site visits', 'Monthly', 'Newsworthy progress, transparency.', { schedule: 2, community: 2, safety: 1 }),
  S('S16', 'Travelling public & passengers', 'Customers', 0.3, 0.7, 0.7, 0.4, 2, 3, 'Website, social media, surveys', 'Monthly', 'Reliable flights, comfort, accessibility.', { readiness: 2, quality: 1 }),
];

/* ------------------------------------------------------------ procurement */

function P(id, name, packageIds, contractType, leadTime, kind, makeBuy, bids, terms = {}) {
  return { id, name, packageIds, contractType, leadTime, kind, makeOrBuy: makeBuy, bidSpecs: bids, terms };
}

export const PROCUREMENT_PACKAGES = [
  P('P01', 'Design & supervision consultancy', ['3.1', '7.1'], 'CPFF', 20, 'service',
    { make: 1.25, buy: 1, decision: 'Buy', rationale: 'No in-house airport design capacity at the required scale.' },
    [['Indus Meridian Consultants', 1.0, 88, 85, 80], ['Clifton Arc Design Partners', 0.94, 76, 70, 75], ['Northwind Airport Planners', 1.08, 86, 90, 70]], { feePct: 0.08 }),
  P('P02', 'Airside civil works — runway & taxiways', ['3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '4.1', '4.2', '4.6'], 'FFP', 60, 'works',
    { make: 1.18, buy: 1, decision: 'Buy', rationale: 'Force account lacks paving trains and QA systems.' },
    [['Gorakh Hill Paving Co.', 1.0, 85, 82, 84], ['Thar Dunes Asphalt Works', 0.92, 70, 64, 72], ['Ranikot Fortline Engineering', 1.06, 88, 86, 80]]),
  P('P03', 'Apron & airside pavements', ['4.3', '4.4'], 'FPIF', 45, 'works',
    { make: 1.12, buy: 1, decision: 'Buy', rationale: 'Rigid pavement specialist required.' },
    [['Kinjhar Lakeside Builders', 1.0, 84, 80, 82], ['Makli Arch Structures', 0.95, 72, 75, 74], ['Haleji Concrete Group', 1.05, 86, 78, 80]], { buyerShare: 0.8, feePct: 0.1, ceilingPct: 1.2 }),
  P('P04', 'Terminal building main contract', ['7.2', '7.3', '7.4', '7.5', '7.6', '7.7'], 'CPIF', 60, 'works',
    { make: 1.3, buy: 1, decision: 'Buy', rationale: 'Complex building; incentive to share cost risk.' },
    [['Kirthar Ridge Constructors JV', 1.0, 87, 84, 83], ['Bhanbhore Building Corp.', 0.93, 74, 70, 78], ['Chaukhandi Structures Ltd.', 1.04, 85, 88, 76]], { buyerShare: 0.7, feePct: 0.09, minFeePct: 0.04, maxFeePct: 0.14 }),
  P('P05', 'Baggage handling system', ['7.8'], 'FPIF', 180, 'supply',
    { make: 1.6, buy: 1, decision: 'Buy', rationale: 'Proprietary sorter technology.' },
    [['Cirrusgate Baggage Systems', 1.0, 86, 84, 80], ['Conveyline Logistics Automation', 0.9, 70, 66, 72], ['Sortwell Airport Systems', 1.07, 88, 80, 82]], { buyerShare: 0.8, feePct: 0.1, ceilingPct: 1.15 }),
  P('P06', 'Passenger boarding bridges', ['7.9'], 'FFP', 240, 'supply',
    { make: 2, buy: 1, decision: 'Buy', rationale: 'Specialist manufactured equipment.' },
    [['Brightway Bridges Manufacturing', 1.0, 85, 82, 80], ['Skyreach Gangway Co.', 0.94, 74, 68, 70], ['Aerolink Docking Systems', 1.05, 88, 86, 78]]),
  P('P07', 'AGL supply & installation', ['4.5', '5.1', '5.2', '5.3', '5.4', '5.5', '5.6'], 'FFP', 90, 'supply',
    { make: 1.2, buy: 1, decision: 'Buy', rationale: 'Certified fittings and photometric testing.' },
    [['Vantor Airfield Lighting', 1.0, 87, 85, 82], ['Sehwan Lantern Electrical', 0.91, 72, 70, 76], ['Lumacross Aviation Lighting', 1.05, 86, 88, 80]]),
  P('P08', 'ILS/DME & AWOS supply and installation', ['6.1', '6.2', '6.5', '6.6'], 'FFP', 150, 'supply',
    { make: 3, buy: 1, decision: 'Buy', rationale: 'Certified navaid equipment only.' },
    [['Aerilon Navigation Systems', 1.0, 88, 86, 80], ['Sufi Signal Avionics', 0.92, 73, 66, 74], ['Polaris Approach Aids', 1.06, 86, 84, 84]]),
  P('P09', 'ATC tower & ATC equipment', ['6.3', '6.4'], 'CPAF', 45, 'works',
    { make: 1.25, buy: 1, decision: 'Buy', rationale: 'Integration performance best rewarded by award fee.' },
    [['Keenjhar Towerworks', 1.0, 85, 82, 80], ['Kotri Barrage Mechanical', 0.94, 72, 74, 76], ['Skyward ATC Integrators', 1.06, 88, 85, 78]], { baseFeePct: 0.03, awardPoolPct: 0.07 }),
  P('P10', 'Terminal IT systems (Scrum delivery)', ['10.1', '10.2', '10.3', '10.4', '10.5'], 'T&M', 30, 'service',
    { make: 1.1, buy: 1, decision: 'Buy (T&M with not-to-exceed)', rationale: 'Evolving requirements suit T&M with an NTE ceiling; no in-house agile team.' },
    [['Saffron Grid Technologies', 1.0, 86, 80, 84], ['Chenab Code Labs', 0.88, 72, 62, 70], ['Mohana Digital Works', 1.04, 84, 86, 78]], { nteFactor: 1.15 }),
  P('P11', 'Support facilities (fuel, ARFF, substation, water)', ['8.2', '8.3', '8.4', '8.6'], 'FPIF', 45, 'works',
    { make: 1.15, buy: 1, decision: 'Buy', rationale: 'Multi-discipline package with shared incentive.' },
    [['Jamshoro Grid Power Builders', 1.0, 84, 82, 80], ['Badin Coastal Engineering', 0.93, 70, 72, 74], ['Nagarparkar Utility Works', 1.05, 86, 80, 82]], { buyerShare: 0.75, feePct: 0.1, ceilingPct: 1.2 }),
  P('P12', 'Solar PV EPC', ['8.5'], 'FFP', 120, 'supply',
    { make: 1.4, buy: 1, decision: 'Buy', rationale: 'EPC with performance guarantee.' },
    [['Helioreach Solar EPC', 1.0, 86, 80, 82], ['Sunfield Sindh Renewables', 0.92, 74, 68, 76], ['Desertlight Power Systems', 1.04, 84, 84, 80]]),
  P('P13', 'Landside works', ['9.1', '9.2', '9.3', '9.4'], 'FFP', 45, 'works',
    { make: 1.05, buy: 1, decision: 'Buy', rationale: 'Standard road works; competitive market.' },
    [['Hala Roadways & Civil', 1.0, 82, 80, 82], ['Indus Delta Roadbuilders', 0.95, 74, 76, 76], ['Rohri Bridge & Road Co.', 1.04, 84, 82, 78]]),
  P('P14', 'Land survey & resettlement services', ['2.1', '2.3'], 'T&M', 15, 'service',
    { make: 0.95, buy: 1, decision: 'Buy', rationale: 'Independent resettlement agency builds community trust despite slightly higher cost.' },
    [['Sindhu Skyline Surveyors', 1.0, 84, 82, 84], ['Pir Patho Land Services', 0.9, 70, 68, 72], ['Daryo Social Consultants', 1.05, 86, 84, 80]], { nteFactor: 1.2 }),
  P('P15', 'Enabling works (site establishment, perimeter, utilities)', ['2.4', '2.5', '2.6'], 'FFP', 30, 'works',
    { make: 1.1, buy: 1, decision: 'Buy', rationale: 'Fast mobilisation needed.' },
    [['Ajrak Civil & Marine', 1.0, 82, 80, 84], ['Latif Valley Contractors', 0.94, 72, 70, 76], ['Kirthar Ridge Constructors JV', 1.06, 86, 84, 78]]),
  P('P16', 'Cargo shed & storm drainage', ['8.1', '8.7'], 'FFP', 45, 'works',
    { make: 1.1, buy: 1, decision: 'Buy', rationale: 'Standard industrial shed and drainage.' },
    [['Makli Arch Structures', 1.0, 82, 82, 80], ['Mirpur Steelcraft', 0.93, 72, 70, 76], ['Ranikot Fortline Engineering', 1.05, 86, 86, 78]]),
  P('P17', 'ORAT & certification advisory', ['11.1', '11.3'], 'CPFF', 20, 'service',
    { make: 1.3, buy: 1, decision: 'Buy', rationale: 'Specialist readiness expertise not held in-house.' },
    [['Runwaywise Readiness Advisers', 1.0, 86, 84, 82], ['Cloudbase Operations Consulting', 0.92, 74, 70, 76], ['Tarmac Transition Partners', 1.06, 88, 86, 80]], { feePct: 0.07 }),
];

/* ------------------------------------------------------------ requirements */

export const REQUIREMENTS = [
  ['RQ01', 'Runway 02/20 extended to 3,505 m to serve wide-body operations at maximum take-off weight in summer.', 'S09', 'Must', ['3.2', '3.3', '3.4', '3.5'], 'Declared distances survey and AIP publication'],
  ['RQ02', 'Runway, shoulders and strip meet Code E width and slope requirements.', 'S02', 'Must', ['3.7', '3.9'], 'Aerodrome inspection'],
  ['RQ03', 'Runway surface friction μ ≥ 0.60 and IRI ≤ 2.0 m/km.', 'S02', 'Must', ['3.5', '3.6'], 'Friction and profilometer tests'],
  ['RQ04', 'CAT I precision approach on RWY 20 (ILS, approach lights, PAPI).', 'S09', 'Must', ['6.1', '6.2', '5.3', '5.4'], 'Flight calibration'],
  ['RQ05', 'AGL switch-over to standby power within Annex 14 limits.', 'S02', 'Must', ['5.6', '8.4'], 'Changeover test'],
  ['RQ06', 'Terminal capacity of 1,200 peak-hour passengers at IATA optimum level of service.', 'S01', 'Must', ['7.1', '7.7'], 'Capacity simulation and trials'],
  ['RQ07', 'Four passenger boarding bridges serving Code C to Code E stands.', 'S09', 'Should', ['7.9', '4.3'], 'Docking tests'],
  ['RQ08', 'Baggage system throughput of 1,200 bags/h with 100 % hold-baggage screening.', 'S02', 'Must', ['7.8', '10.4'], 'Throughput test'],
  ['RQ09', 'Common-use check-in on every counter for any airline.', 'S09', 'Must', ['10.3'], 'UAT with airline DCS'],
  ['RQ10', 'Bilingual flight information on all displays, updated within 60 s.', 'S16', 'Must', ['10.2'], 'FIDS acceptance test'],
  ['RQ11', 'Airside access control by role and zone with audit trail.', 'S02', 'Must', ['10.5', '2.4'], 'Security acceptance test'],
  ['RQ12', 'Cargo shed with perishables handling for mango exports.', 'S10', 'Should', ['8.1'], 'Operator acceptance'],
  ['RQ13', 'ARFF response time ≤ 3 minutes to each runway end.', 'S02', 'Must', ['8.3'], 'Timed response exercise'],
  ['RQ14', 'At least 20 % of daytime terminal energy from on-site solar.', 'S03', 'Could', ['8.5'], 'Metered energy report'],
  ['RQ15', 'Storm drainage conveys the 1-in-25-year monsoon storm without ponding on pavements.', 'S05', 'Must', ['3.10', '8.7'], 'Hydraulic model and CCTV survey'],
  ['RQ16', 'Resettlement meets the approved action plan with livelihood restoration.', 'S08', 'Must', ['2.3', '1.5'], 'Independent resettlement audit'],
  ['RQ17', 'Construction dust and noise within the ESIA limits at sensitive receptors.', 'S07', 'Must', ['1.5', '3.2'], 'Environmental monitoring'],
  ['RQ18', 'Universal accessibility: step-free routes, accessible counters and toilets.', 'S16', 'Must', ['7.7'], 'Accessibility audit'],
  ['RQ19', 'Terminal architecture reflects Sindhi heritage (windcatchers, Ajrak screens).', 'S03', 'Should', ['7.4', '7.5'], 'Design review'],
  ['RQ20', 'Aerodrome certificate granted before commercial opening.', 'S02', 'Must', ['11.5'], 'Certificate issued'],
  ['RQ21', 'Trained operations staff for every licensed role before trials.', 'S14', 'Must', ['11.2'], 'Competence records'],
  ['RQ22', 'Access road capacity for peak-hour forecourt demand.', 'S05', 'Should', ['9.1', '9.3'], 'Traffic model'],
  ['RQ23', 'Wildlife hazard management with no bird-attracting landscaping.', 'S02', 'Must', ['9.4', '11.3'], 'Wildlife hazard assessment'],
  ['RQ24', 'Monthly EVM reporting to the sponsor with forecast at completion.', 'S01', 'Must', ['1.6'], 'Report review'],
  ['RQ25', 'Opening schedule with at least three airlines and a cargo service.', 'S06', 'Should', ['11.6'], 'Signed agreements'],
];

/* ------------------------------------------------------- RACI & comms plan */

export const RACI_ROLES = ['Sponsor (PAA)', 'Project Director', 'PMO Lead', 'Design Consultant', 'Main Contractor', 'Regulator (PCAA)', 'Product Owner (IT)', 'ORAT Manager', 'HSE Manager', 'Finance Controller'];

export const RACI_ROWS = [
  ['Business case (1.1)', 'A R C I . . . . . C'],
  ['Project charter (1.2)', 'A R C . . . . . . C'],
  ['PM plan & baselines (1.4)', 'A R R C C . . . C C'],
  ['ESIA & resettlement plan (1.5)', 'I A C R . C . . C .'],
  ['Land possession (2.2)', 'I A C . . . . . . R'],
  ['Pavement design (3.1)', 'I A C R C C . . . .'],
  ['Runway extension works (3.2–3.5)', 'I A C C R I . . C .'],
  ['Terminal design (7.1)', 'C A C R C C C C C .'],
  ['Terminal construction (7.2–7.7)', 'I A C C R I . C C C'],
  ['Product backlog & increments (10.x)', 'I C I . . . A C . .'],
  ['Change control decisions', 'A R R C C I C . . C'],
  ['Risk register', 'I A R C C . C C C C'],
  ['Operational trials (11.4)', 'I A C . C C C R C .'],
  ['Aerodrome certificate (11.5)', 'I A C . C R . R . .'],
  ['Final accounts (12.3)', 'I A R C C . . . . R'],
  ['Lessons learned (12.4)', 'I A R C C . C C C C'],
];

export const COMMS_PLAN = [
  { audience: 'Sponsor programme board', info: 'Performance report (EVM, forecast, top risks)', method: 'Dashboard + meeting', frequency: 'Monthly', owner: 'Project Director' },
  { audience: 'Change control board', info: 'Change requests with impact analysis', method: 'CCB meeting', frequency: 'Fortnightly', owner: 'PMO Lead' },
  { audience: 'Regulator (PCAA)', info: 'Design submissions, inspection requests, certification evidence', method: 'Formal letters & site visits', frequency: 'As required / fortnightly', owner: 'ORAT Manager' },
  { audience: 'Government of Sindh & HDA', info: 'Land, resettlement and utilities progress', method: 'Coordination committee', frequency: 'Monthly', owner: 'Land & Resettlement Manager' },
  { audience: 'Ministry of Aviation', info: 'Funding drawdown and milestone status', method: 'Quarterly review', frequency: 'Quarterly', owner: 'Finance Controller' },
  { audience: 'Contractors', info: 'Progress, look-ahead, site instructions, safety', method: 'Progress meeting', frequency: 'Weekly', owner: 'Project Director' },
  { audience: 'Scrum team & IT vendor', info: 'Sprint goal, backlog, impediments', method: 'Sprint planning / daily stand-up / review / retrospective', frequency: 'Daily & fortnightly', owner: 'Product Owner (IT)' },
  { audience: 'Airlines operators committee', info: 'Opening plan, stand allocation, CUTE readiness', method: 'Committee meeting', frequency: 'Monthly', owner: 'ORAT Manager' },
  { audience: 'Local residents & occupants', info: 'Works schedule, dust/noise controls, grievances', method: 'Community meeting & helpline', frequency: 'Monthly / continuous', owner: 'Community Liaison Officer' },
  { audience: 'Workforce', info: 'Toolbox talks, heat-stress alerts, welfare', method: 'Toolbox talk & SMS alerts', frequency: 'Daily', owner: 'HSE Manager' },
  { audience: 'Media & public', info: 'Milestones, opening date, traffic diversions', method: 'Press release & social media', frequency: 'Monthly / at milestones', owner: 'Communications Officer' },
  { audience: 'Chamber of Commerce & exporters', info: 'Cargo facilities and business opportunities', method: 'Business forum', frequency: 'Quarterly', owner: 'Project Director' },
];

/* ------------------------------------------------------------ agile backlog */

const STORY_SPECS = {
  '10.2': [
    ['As a passenger, I want departure boards showing gate, time and status so that I can find my flight.', 8],
    ['As a passenger, I want Urdu, Sindhi and English display rotation so that everyone can read the boards.', 5],
    ['As an airline duty officer, I want to update flight status from a web console so that boards are correct within 60 s.', 8],
    ['As an integrator, I want a schedule feed from the operational database so that FIDS never needs re-keying.', 13],
    ['As a passenger, I want arrival boards with baggage belt numbers so that I go to the right reclaim.', 5],
    ['As a gate agent, I want gate displays showing boarding status and zones so that boarding is orderly.', 5],
    ['As a controller, I want a delay and cancellation banner so that passengers are told early.', 3],
    ['As an accessibility lead, I want a high-contrast, large-type mode so that boards meet accessibility standards.', 3],
    ['As a passenger, I want flight information on my phone via a QR code so that I can leave the gate area.', 5],
    ['As an IT operator, I want health monitoring of every display so that dead screens are fixed fast.', 3],
    ['As a passenger, I want weather and prayer-time panels so that I can plan my time.', 2],
    ['As a controller, I want an emergency broadcast override on all displays so that evacuations are clear.', 5],
  ],
  '10.3': [
    ['As an airline agent, I want any common-use counter to load my airline session so that counters are shared.', 13],
    ['As an agent, I want boarding-pass printing on common printers so that any counter can check in.', 5],
    ['As an agent, I want bag-tag printing with licence-plate numbers so that bags are traceable.', 5],
    ['As a passenger, I want self-service kiosks so that I can check in without queuing.', 8],
    ['As a passenger, I want to check in by scanning my identity document so that it is quick.', 5],
    ['As a station manager, I want counter allocation planning so that counters match the schedule.', 5],
    ['As an agent, I want single sign-on with role-based access so that logins are secure.', 3],
    ['As a passenger, I want self bag-drop so that I spend less time at the counter.', 13],
    ['As an IT operator, I want peripheral fault alerts so that printers are fixed before queues build.', 3],
    ['As finance, I want per-use billing reports so that airlines are charged fairly.', 5],
    ['As an agent, I want gate readers to validate boarding passes so that no passenger boards the wrong flight.', 5],
    ['As a security officer, I want check-in data shared with passenger information checks so that screening is informed.', 8],
  ],
  '10.4': [
    ['As a baggage controller, I want every bag tag read at make-up and linked to boarding status so that unaccompanied bags are caught.', 13],
    ['As a loader, I want handheld scanning at the hold so that I know every bag loaded.', 8],
    ['As a dispatcher, I want offload alerts for no-show passengers so that departures are not delayed.', 8],
    ['As a baggage controller, I want baggage source messages from check-in so that records are complete.', 5],
    ['As a baggage controller, I want hold-baggage screening results on each bag record so that only cleared bags load.', 5],
    ['As a passenger, I want an SMS when my bag is loaded so that I travel with confidence.', 3],
    ['As a ramp supervisor, I want container build lists so that loading is balanced.', 5],
    ['As an airline, I want mishandled-bag reports so that we can improve performance.', 3],
    ['As an operator, I want sorter integration through a PLC gateway so that the sorter and software agree.', 8],
    ['As an auditor, I want two-year retention of bag events so that investigations are possible.', 2],
    ['As a baggage controller, I want a manual encoding fallback so that unreadable tags still flow.', 3],
    ['As a dispatcher, I want a bags-versus-passengers dashboard per flight so that I see problems early.', 3],
  ],
  '10.5': [
    ['As a security manager, I want airside access cards with role-based zones so that only authorised staff enter.', 8],
    ['As a security officer, I want CCTV alarm pop-ups in the control room so that I respond fast.', 8],
    ['As an investigator, I want access logs searchable within 10 s so that incidents are traced.', 5],
    ['As a security manager, I want vetting status linked to card validity so that expired vetting blocks access.', 5],
    ['As a screening supervisor, I want lane throughput and wait-time dashboards so that I open lanes in time.', 5],
    ['As a security officer, I want perimeter intrusion alarms on a site plan so that patrols go to the right place.', 8],
    ['As an IT security officer, I want network segmentation and SIEM logging so that attacks are contained and seen.', 8],
    ['As a security manager, I want visitor passes with photos so that escorted visits are controlled.', 3],
    ['As a fire officer, I want the fire alarm to release doors so that evacuation is safe.', 5],
    ['As an auditor, I want quarterly access reviews so that stale permissions are removed.', 2],
    ['As a security manager, I want vehicle access control at airside gates so that only permitted vehicles enter.', 5],
    ['As an IT operator, I want penetration-test findings tracked to closure so that risk is reduced.', 3],
  ],
};

export const EPIC_NAMES = { '10.2': 'FIDS', '10.3': 'CUTE', '10.4': 'BRS', '10.5': 'Security' };

/** Stories ordered so every epic progresses evenly through the release. */
export function buildBacklog() {
  const all = [];
  let n = 0;
  for (const [epic, specs] of Object.entries(STORY_SPECS)) {
    const total = specs.reduce((s, x) => s + x[1], 0);
    let cum = 0;
    for (const [title, points] of specs) {
      n++;
      all.push({ id: `US${String(n).padStart(2, '0')}`, title, points, epic, epicName: EPIC_NAMES[epic], key: (cum + points / 2) / total });
      cum += points;
    }
  }
  all.sort((a, b) => a.key - b.key || a.id.localeCompare(b.id));
  return all.map((s, i) => ({ id: s.id, title: s.title, points: s.points, epic: s.epic, epicName: s.epicName, priority: i + 1, status: 'backlog', sprint: null, effort: 0, doneDay: null }));
}

/* ---------------------------------------------------- scope-creep changes */

export const CHANGE_TEMPLATES = [
  { id: 'CR-T1', title: 'Code E taxiway fillets and two wide-body stands', raisedBy: 'S09', trigger: { task: '3.1', pct: 1 }, target: '4.1', days: 30, costM: 1400, merit: 0.62, risk: 0.2, quality: 0.1,
    description: 'Airlines request Code E fillets on the parallel taxiway and two wide-body capable stands so that seasonal Hajj and Gulf charters can use wide-bodies.' },
  { id: 'CR-T2', title: 'Fifth passenger boarding bridge', raisedBy: 'S09', trigger: { task: '7.3', pct: 0.5 }, target: '7.9', days: 20, costM: 650, merit: 0.58, risk: 0.1, quality: 0,
    description: 'Add a fifth boarding bridge to serve peak-hour narrow-body banks.' },
  { id: 'CR-T3', title: 'Self-service bag drop and 12 extra CUTE positions', raisedBy: 'S16', trigger: { task: '10.1', pct: 1 }, target: '10.3', days: 14, costM: 120, merit: 0.66, risk: 0.1, quality: 0.1, agilePoints: 16,
    description: 'Passengers and airlines want self bag-drop units and more common-use positions at opening.' },
  { id: 'CR-T4', title: 'Cold-chain annex for perishable exports', raisedBy: 'S10', trigger: { task: '8.1', pct: 0.3 }, target: '8.1', days: 30, costM: 420, merit: 0.55, risk: 0.1, quality: 0,
    description: 'Exporters ask for a 600 m² cold store so mangoes can fly direct from Hyderabad.' },
  { id: 'CR-T5', title: 'Increase solar PV from 5 MWp to 8 MWp', raisedBy: 'S03', trigger: { task: '8.4', pct: 0.5 }, target: '8.5', days: 20, costM: 700, merit: 0.45, risk: 0.05, quality: 0,
    description: 'The province proposes a larger plant to cut grid demand and emissions.' },
  { id: 'CR-T6', title: 'Enlarged prayer rooms and family lounge', raisedBy: 'S16', trigger: { task: '7.6', pct: 0.4 }, target: '7.7', days: 10, costM: 90, merit: 0.6, risk: 0, quality: 0.1,
    description: 'Passenger feedback asks for larger prayer rooms with ablution areas and a family lounge.' },
  { id: 'CR-T7', title: 'Upgrade ILS to CAT II', raisedBy: 'S02', trigger: { task: '6.4', pct: 0.2 }, target: '6.1', days: 25, costM: 380, merit: 0.4, risk: 0.15, quality: 0.2,
    description: 'Winter fog suggests CAT II capability; requires additional monitoring and lighting changes.' },
];

export const BUSINESS_CASE = { movementsPerDay: 36, paxPerDay: 4200, onTimePct: 85, annualPax: 1.5e6, label: 'Business case targets (simulated)' };

/** Build the WBS tree (summary packages → leaves). Milestones are not WBS elements. */
export function buildWbsTree() {
  return SUMMARY_PACKAGES.map((s) => ({
    id: s.id, code: s.id, name: s.name, color: s.color,
    children: WBS_LEAVES.filter((l) => l.id.split('.')[0] === s.id).map((l) => ({ id: l.id, code: l.id, name: l.name })),
  }));
}
