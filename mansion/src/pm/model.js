/**
 * The project model: work breakdown structure, precedence network, resource
 * pools, risk register, procurement, stakeholders, quality gates, milestones.
 *
 * This module is data plus a little indexing.  It has no dependency on
 * three.js and no dependency on the DOM, so the whole schedule and cost model
 * can be executed and calibrated in Node before any of it reaches a renderer.
 *
 * Durations are three-point estimates in working days:
 *   o = optimistic, m = most likely, p = pessimistic
 *   te = (o + 4m + p) / 6      sigma = (p - o) / 6
 *
 * Dependencies carry a relationship type and an optional lead/lag in days:
 *   FS  finish-to-start   SS  start-to-start
 *   FF  finish-to-finish  SF  start-to-finish
 * A positive lag delays the successor; a negative lag (a lead) overlaps it.
 */
import { packageBudget, BOQ_TOTAL } from './rates.js';

export const PROJECT_META = {
  name: 'Bagh-e-Shahi Manor',
  subtitle: 'A royal mansion on a two-kanal plot',
  locale: 'DHA Phase VI, Lahore, Pakistan',
  latitude: 31.4805,
  longitude: 74.3239,
  plotAreaM2: 1011,
  coveredAreaM2: 1174,
  client: 'The Shahnawaz family',
  currency: 'PKR',
  calendarNote: 'Six-day working week; the schedule is stated in working days.',
  costNote:
    'Rates are an internally consistent illustrative model for high-end Lahore ' +
    'residential construction in 2025-26, not a verified quotation. Every rate is ' +
    'editable in one place (pm/rates.js) so a live tender can replace them.',
};

/** The nine control accounts of the WBS. */
export const CONTROL_ACCOUNTS = [
  { id: 'CA1', code: '1.0', name: 'Preliminaries & Site Establishment', colour: '#c9a227', short: 'Prelim' },
  { id: 'CA2', code: '2.0', name: 'Substructure', colour: '#8a6a4f', short: 'Substructure' },
  { id: 'CA3', code: '3.0', name: 'Superstructure', colour: '#9aa5b1', short: 'Structure' },
  { id: 'CA4', code: '4.0', name: 'Envelope & Façade', colour: '#d08c60', short: 'Envelope' },
  { id: 'CA5', code: '5.0', name: 'MEP Services', colour: '#4f9d8f', short: 'MEP' },
  { id: 'CA6', code: '6.0', name: 'Interior Finishes', colour: '#b06a8c', short: 'Finishes' },
  { id: 'CA7', code: '7.0', name: 'Fixtures, Furnishing & Equipment', colour: '#7b6cc4', short: 'FF&E' },
  { id: 'CA8', code: '8.0', name: 'External Works & Landscape', colour: '#6a9a4f', short: 'External' },
  { id: 'CA9', code: '9.0', name: 'Commissioning & Handover', colour: '#5b8ec4', short: 'Handover' },
];

/**
 * The work packages.  `phase` labels the construction stage a package belongs
 * to, which the 3-D world uses to decide what the site should look like.
 */
export const PACKAGES = [
  /* ---------------------------------------------- 1.0  preliminaries ----- */
  { id: 'P1', ca: 'CA1', code: '1.1', name: 'Design, survey & soil investigation', o: 22, m: 30, p: 48, crew: 'consult', deps: [], phase: 'design', gate: null },
  { id: 'P2', ca: 'CA1', code: '1.2', name: 'Site clearance & rough levelling', o: 4, m: 6, p: 10, crew: 'plant', deps: [{ id: 'P1', type: 'FS' }], phase: 'enabling' },
  { id: 'P3', ca: 'CA1', code: '1.3', name: 'Site office, store & temporary utilities', o: 6, m: 8, p: 13, crew: 'general', deps: [{ id: 'P2', type: 'SS', lag: 2 }], phase: 'enabling' },
  { id: 'P4', ca: 'CA1', code: '1.4', name: 'Boundary wall, crane base & scaffolding', o: 18, m: 24, p: 36, crew: 'mason', deps: [{ id: 'P3', type: 'SS', lag: 4 }], phase: 'enabling' },
  { id: 'P5', ca: 'CA1', code: '1.5', name: 'LDA approval & utility NOCs', o: 26, m: 42, p: 74, crew: 'consult', deps: [{ id: 'P1', type: 'SS', lag: 12 }], phase: 'design' },

  /* ----------------------------------------------- 2.0  substructure ----- */
  { id: 'S1', ca: 'CA2', code: '2.1', name: 'Bulk excavation — basement & footings', o: 12, m: 16, p: 25, crew: 'plant', deps: [{ id: 'P2', type: 'FS' }, { id: 'P5', type: 'FS' }], phase: 'excavation' },
  { id: 'S2', ca: 'CA2', code: '2.2', name: 'Blinding & anti-termite treatment', o: 4, m: 5, p: 9, crew: 'mason', deps: [{ id: 'S1', type: 'FS' }], phase: 'substructure' },
  { id: 'S3', ca: 'CA2', code: '2.3', name: 'Raft reinforcement & formwork', o: 10, m: 14, p: 21, crew: 'steel', deps: [{ id: 'S2', type: 'FS' }], phase: 'substructure', gate: 'Q1' },
  { id: 'S4', ca: 'CA2', code: '2.4', name: 'Raft concrete pour & curing', o: 8, m: 10, p: 16, crew: 'concrete', deps: [{ id: 'S3', type: 'FS' }], phase: 'substructure', gate: 'Q2' },
  { id: 'S5', ca: 'CA2', code: '2.5', name: 'Basement retaining walls & water tank', o: 16, m: 22, p: 32, crew: 'concrete', deps: [{ id: 'S4', type: 'FS', lag: 12 }], phase: 'substructure' },
  { id: 'S6', ca: 'CA2', code: '2.6', name: 'Tanking, waterproofing & backfill', o: 8, m: 11, p: 17, crew: 'general', deps: [{ id: 'S5', type: 'FS' }], phase: 'substructure', gate: 'Q3' },
  { id: 'S7', ca: 'CA2', code: '2.7', name: 'Ground floor slab & grade beams', o: 12, m: 16, p: 24, crew: 'concrete', deps: [{ id: 'S6', type: 'FS' }], phase: 'substructure' },

  /* --------------------------------------------- 3.0  superstructure ----- */
  { id: 'F1', ca: 'CA3', code: '3.1', name: 'Ground floor columns', o: 12, m: 16, p: 23, crew: 'concrete', deps: [{ id: 'S7', type: 'FS', lag: 7 }], phase: 'frame' },
  { id: 'F2', ca: 'CA3', code: '3.2', name: 'First floor slab & beams', o: 16, m: 21, p: 30, crew: 'concrete', deps: [{ id: 'F1', type: 'FS', lag: 5 }], phase: 'frame' },
  { id: 'F3', ca: 'CA3', code: '3.3', name: 'First floor columns', o: 11, m: 15, p: 22, crew: 'concrete', deps: [{ id: 'F2', type: 'FS', lag: 9 }], phase: 'frame' },
  { id: 'F4', ca: 'CA3', code: '3.4', name: 'Roof slab & beams', o: 15, m: 20, p: 29, crew: 'concrete', deps: [{ id: 'F3', type: 'FS', lag: 5 }], phase: 'frame', gate: 'Q4' },
  { id: 'F5', ca: 'CA3', code: '3.5', name: 'Staircases & lift shaft', o: 10, m: 14, p: 21, crew: 'concrete', deps: [{ id: 'F2', type: 'SS', lag: 10 }, { id: 'F4', type: 'FF', lag: 4 }], phase: 'frame' },
  { id: 'F6', ca: 'CA3', code: '3.6', name: 'Portico columns, entablature & pediment', o: 14, m: 18, p: 28, crew: 'mason', deps: [{ id: 'F4', type: 'FS', lag: 10 }], phase: 'envelope' },
  { id: 'F7', ca: 'CA3', code: '3.7', name: 'Roof parapet, cupola drum & dome', o: 18, m: 24, p: 36, crew: 'mason', deps: [{ id: 'F4', type: 'FS', lag: 12 }], phase: 'envelope' },

  /* ---------------------------------------------------- 4.0  envelope ---- */
  { id: 'E1', ca: 'CA4', code: '4.1', name: 'Ground floor masonry & partitions', o: 18, m: 24, p: 34, crew: 'mason', deps: [{ id: 'F2', type: 'SS', lag: 14 }], phase: 'envelope' },
  { id: 'E2', ca: 'CA4', code: '4.2', name: 'First floor masonry & partitions', o: 17, m: 22, p: 32, crew: 'mason', deps: [{ id: 'F4', type: 'SS', lag: 12 }, { id: 'E1', type: 'FS', lag: -6 }], phase: 'envelope' },
  { id: 'E3', ca: 'CA4', code: '4.3', name: 'Roof waterproofing, insulation & falls', o: 8, m: 11, p: 17, crew: 'general', deps: [{ id: 'F4', type: 'FS', lag: 14 }], phase: 'envelope', gate: 'Q5' },
  { id: 'E4', ca: 'CA4', code: '4.4', name: 'Façade stone cladding & external plaster', o: 30, m: 40, p: 58, crew: 'mason', deps: [{ id: 'E2', type: 'FS' }, { id: 'F7', type: 'FS' }], phase: 'facade' },
  { id: 'E5', ca: 'CA4', code: '4.5', name: 'Cornices, band courses & balustrades', o: 16, m: 22, p: 32, crew: 'mason', deps: [{ id: 'E4', type: 'SS', lag: 18 }], phase: 'facade' },
  { id: 'E6', ca: 'CA4', code: '4.6', name: 'Windows, glazing & skylight', o: 18, m: 24, p: 36, crew: 'joiner', deps: [{ id: 'E2', type: 'FS', lag: 6 }], phase: 'facade' },
  { id: 'E7', ca: 'CA4', code: '4.7', name: 'External doors & sectional garage doors', o: 8, m: 11, p: 17, crew: 'joiner', deps: [{ id: 'E6', type: 'FS', lag: -8 }], phase: 'facade' },

  /* --------------------------------------------------------- 5.0  MEP ---- */
  { id: 'M1', ca: 'CA5', code: '5.1', name: 'Underground plumbing & drainage', o: 8, m: 10, p: 15, crew: 'mep', deps: [{ id: 'S6', type: 'SS', lag: 3 }], phase: 'substructure' },
  { id: 'M2', ca: 'CA5', code: '5.2', name: 'Electrical conduiting & back boxes', o: 20, m: 26, p: 38, crew: 'mep', deps: [{ id: 'E1', type: 'SS', lag: 12 }, { id: 'E2', type: 'SS', lag: 8 }], phase: 'services' },
  { id: 'M3', ca: 'CA5', code: '5.3', name: 'Plumbing risers & distribution', o: 16, m: 21, p: 30, crew: 'mep', deps: [{ id: 'M2', type: 'SS', lag: 6 }], phase: 'services' },
  { id: 'M4', ca: 'CA5', code: '5.4', name: 'HVAC ducting & VRF pipework', o: 22, m: 28, p: 40, crew: 'mep', deps: [{ id: 'M2', type: 'SS', lag: 10 }], phase: 'services' },
  { id: 'M5', ca: 'CA5', code: '5.5', name: 'Fire detection & sprinkler installation', o: 10, m: 14, p: 20, crew: 'mep', deps: [{ id: 'M4', type: 'SS', lag: 14 }], phase: 'services' },
  { id: 'M6', ca: 'CA5', code: '5.6', name: 'Data, CCTV, intercom & automation', o: 14, m: 19, p: 27, crew: 'mep', deps: [{ id: 'M2', type: 'FS', lag: -10 }], phase: 'services' },
  { id: 'M7', ca: 'CA5', code: '5.7', name: 'Solar PV, standby power & lift', o: 18, m: 24, p: 34, crew: 'mep', deps: [{ id: 'E3', type: 'FS' }, { id: 'F5', type: 'FS' }], phase: 'services', gate: 'Q6' },

  /* --------------------------------------------- 6.0  interior finishes -- */
  { id: 'I1', ca: 'CA6', code: '6.1', name: 'Internal plaster to walls & soffits', o: 22, m: 30, p: 42, crew: 'finish', deps: [{ id: 'M3', type: 'FS' }, { id: 'M5', type: 'FS' }, { id: 'M6', type: 'FS' }, { id: 'E6', type: 'FS' }], phase: 'finishes', gate: 'Q7' },
  { id: 'I2', ca: 'CA6', code: '6.2', name: 'Floor screed & preparation', o: 10, m: 13, p: 19, crew: 'finish', deps: [{ id: 'I1', type: 'FS', lag: -8 }], phase: 'finishes' },
  { id: 'I3', ca: 'CA6', code: '6.3', name: 'Marble & stone flooring', o: 24, m: 32, p: 46, crew: 'stone', deps: [{ id: 'I2', type: 'FS', lag: 6 }], phase: 'finishes', gate: 'Q8' },
  { id: 'I4', ca: 'CA6', code: '6.4', name: 'Timber flooring, tiling & skirting', o: 14, m: 19, p: 27, crew: 'stone', deps: [{ id: 'I3', type: 'SS', lag: 14 }], phase: 'finishes' },
  { id: 'I5', ca: 'CA6', code: '6.5', name: 'Suspended ceilings & cornices', o: 20, m: 26, p: 37, crew: 'finish', deps: [{ id: 'I1', type: 'FS', lag: 4 }], phase: 'finishes' },
  { id: 'I6', ca: 'CA6', code: '6.6', name: 'Internal doors, stair & balustrade joinery', o: 18, m: 24, p: 34, crew: 'joiner', deps: [{ id: 'I3', type: 'FS', lag: -10 }, { id: 'I5', type: 'FS' }], phase: 'finishes' },
  { id: 'I7', ca: 'CA6', code: '6.7', name: 'Wall panelling & wallpaper', o: 14, m: 19, p: 27, crew: 'joiner', deps: [{ id: 'I5', type: 'FS', lag: 4 }], phase: 'finishes' },
  { id: 'I8', ca: 'CA6', code: '6.8', name: 'Painting, polish & decoration', o: 20, m: 26, p: 38, crew: 'finish', deps: [{ id: 'I6', type: 'FS', lag: -6 }, { id: 'I7', type: 'FS' }], phase: 'finishes' },
  { id: 'I9', ca: 'CA6', code: '6.9', name: 'Sanitaryware & bathroom fit-out', o: 12, m: 16, p: 23, crew: 'mep', deps: [{ id: 'I4', type: 'FS' }, { id: 'I8', type: 'SS', lag: 10 }], phase: 'finishes' },
  { id: 'I10', ca: 'CA6', code: '6.10', name: 'Kitchen & pantry installation', o: 14, m: 18, p: 26, crew: 'joiner', deps: [{ id: 'I8', type: 'SS', lag: 12 }], phase: 'finishes' },

  /* ---------------------------------------------------- 7.0  FF and E ---- */
  { id: 'X1', ca: 'CA7', code: '7.1', name: 'Wardrobes & library joinery', o: 12, m: 16, p: 23, crew: 'joiner', deps: [{ id: 'I8', type: 'FS' }], phase: 'fitout' },
  { id: 'X2', ca: 'CA7', code: '7.2', name: 'Lighting fixtures & chandeliers', o: 10, m: 14, p: 20, crew: 'mep', deps: [{ id: 'I8', type: 'FS' }], phase: 'fitout' },
  { id: 'X3', ca: 'CA7', code: '7.3', name: 'Reception room furniture', o: 6, m: 9, p: 14, crew: 'general', deps: [{ id: 'X2', type: 'FS' }, { id: 'I10', type: 'FS' }], phase: 'fitout' },
  { id: 'X4', ca: 'CA7', code: '7.4', name: 'Private room furniture', o: 6, m: 9, p: 14, crew: 'general', deps: [{ id: 'X1', type: 'FS' }, { id: 'X2', type: 'FS' }], phase: 'fitout' },
  { id: 'X5', ca: 'CA7', code: '7.5', name: 'Home cinema & audiovisual', o: 8, m: 11, p: 17, crew: 'mep', deps: [{ id: 'I8', type: 'FS' }], phase: 'fitout' },
  { id: 'X6', ca: 'CA7', code: '7.6', name: 'Gymnasium & sauna installation', o: 6, m: 8, p: 13, crew: 'general', deps: [{ id: 'I8', type: 'FS' }], phase: 'fitout' },
  { id: 'X7', ca: 'CA7', code: '7.7', name: 'Art, carpets & drapery', o: 7, m: 10, p: 16, crew: 'general', deps: [{ id: 'X3', type: 'FS' }, { id: 'X4', type: 'FS' }], phase: 'fitout' },

  /* ------------------------------------------- 8.0  external & landscape -- */
  { id: 'L1', ca: 'CA8', code: '8.1', name: 'Driveway, forecourt & hardscape', o: 12, m: 16, p: 23, crew: 'general', deps: [{ id: 'E4', type: 'FS' }], phase: 'external' },
  { id: 'L2', ca: 'CA8', code: '8.2', name: 'Garden earthworks & irrigation', o: 8, m: 11, p: 16, crew: 'landscape', deps: [{ id: 'E4', type: 'FS', lag: -12 }], phase: 'external' },
  { id: 'L3', ca: 'CA8', code: '8.3', name: 'Planting, turf & soft landscape', o: 8, m: 11, p: 17, crew: 'landscape', deps: [{ id: 'L2', type: 'FS' }, { id: 'L1', type: 'FS', lag: -4 }], phase: 'external' },
  { id: 'L4', ca: 'CA8', code: '8.4', name: 'Swimming pool, plant & deck', o: 24, m: 32, p: 46, crew: 'general', deps: [{ id: 'S7', type: 'SS', lag: 40 }, { id: 'E4', type: 'FF', lag: 10 }], phase: 'external' },
  { id: 'L5', ca: 'CA8', code: '8.5', name: 'Forecourt fountain & water feature', o: 6, m: 8, p: 13, crew: 'general', deps: [{ id: 'L1', type: 'FS', lag: -6 }], phase: 'external' },
  { id: 'L6', ca: 'CA8', code: '8.6', name: 'External & landscape lighting', o: 6, m: 9, p: 14, crew: 'mep', deps: [{ id: 'L3', type: 'SS', lag: 4 }], phase: 'external' },
  { id: 'L7', ca: 'CA8', code: '8.7', name: 'Main gate, guard post & perimeter', o: 8, m: 11, p: 16, crew: 'general', deps: [{ id: 'L1', type: 'SS', lag: 8 }], phase: 'external' },

  /* --------------------------------------------------- 9.0  handover ----- */
  { id: 'H1', ca: 'CA9', code: '9.1', name: 'MEP testing, balancing & commissioning', o: 8, m: 11, p: 16, crew: 'mep', deps: [{ id: 'M7', type: 'FS' }, { id: 'X2', type: 'FS' }, { id: 'I9', type: 'FS' }, { id: 'L6', type: 'FS' }], phase: 'handover', gate: 'Q9' },
  { id: 'H2', ca: 'CA9', code: '9.2', name: 'Snagging & rectification', o: 12, m: 16, p: 24, crew: 'general', deps: [{ id: 'H1', type: 'FS' }, { id: 'X7', type: 'FS' }, { id: 'L3', type: 'FS' }, { id: 'L7', type: 'FS' }, { id: 'X5', type: 'FS' }, { id: 'X6', type: 'FS' }, { id: 'L4', type: 'FS' }, { id: 'L5', type: 'FS' }], phase: 'handover' },
  { id: 'H3', ca: 'CA9', code: '9.3', name: 'Builders clean & presentation', o: 4, m: 5, p: 8, crew: 'general', deps: [{ id: 'H2', type: 'FS' }], phase: 'handover' },
  { id: 'H4', ca: 'CA9', code: '9.4', name: 'Client walkthrough & handover', o: 2, m: 3, p: 5, crew: 'consult', deps: [{ id: 'H3', type: 'FS' }], phase: 'handover', gate: 'Q10' },
];

/** Resource pools. `size` is the baseline head count available per day. */
export const RESOURCES = [
  { id: 'consult', name: 'Design & consultancy', size: 8, dayRatePKR: 18000, labourFrac: 0.80, colour: '#c9a227' },
  { id: 'plant', name: 'Plant & earthmoving', size: 10, dayRatePKR: 9500, labourFrac: 0.35, colour: '#8a6a4f' },
  { id: 'concrete', name: 'Concrete & formwork gang', size: 46, dayRatePKR: 2400, labourFrac: 0.26, colour: '#9aa5b1' },
  { id: 'steel', name: 'Steel fixers', size: 22, dayRatePKR: 2800, labourFrac: 0.25, colour: '#7f8c99' },
  { id: 'mason', name: 'Masons & stone dressers', size: 40, dayRatePKR: 2600, labourFrac: 0.30, colour: '#d08c60' },
  { id: 'mep', name: 'MEP technicians', size: 26, dayRatePKR: 3200, labourFrac: 0.16, colour: '#4f9d8f' },
  { id: 'finish', name: 'Plasterers & painters', size: 34, dayRatePKR: 2200, labourFrac: 0.40, colour: '#b06a8c' },
  { id: 'stone', name: 'Marble & tile layers', size: 24, dayRatePKR: 3000, labourFrac: 0.22, colour: '#a05c7b' },
  { id: 'joiner', name: 'Joiners & glaziers', size: 22, dayRatePKR: 3400, labourFrac: 0.14, colour: '#7b6cc4' },
  { id: 'landscape', name: 'Landscape crew', size: 14, dayRatePKR: 1900, labourFrac: 0.30, colour: '#6a9a4f' },
  { id: 'general', name: 'General labour & specialists', size: 34, dayRatePKR: 1700, labourFrac: 0.16, colour: '#5b8ec4' },
];

/**
 * Quantified risk register.  `prob` is the probability of occurrence over the
 * life of the project, `days` the schedule impact if it occurs, `costPKR` the
 * direct cost impact.  EMV = prob × costPKR.
 */
export const RISKS = [
  { id: 'R1', name: 'Monsoon rain halts concrete pours', cat: 'Weather', prob: 0.62, days: 14, costPKR: 3800000, affects: ['S4', 'F2', 'F4'], response: 'Mitigate', responseCostPKR: 950000, residualProb: 0.30, note: 'Pour windows planned outside July–August; tarpaulins and admixtures on standby.' },
  { id: 'R2', name: 'Cement & steel price escalation', cat: 'Commercial', prob: 0.48, days: 0, costPKR: 12400000, affects: ['S4', 'F1', 'F2', 'F4'], response: 'Transfer', responseCostPKR: 2200000, residualProb: 0.18, note: 'Fixed-price supply agreement with the two principal suppliers for the structure phase.' },
  { id: 'R3', name: 'PKR depreciation against imported fittings', cat: 'Financial', prob: 0.55, days: 0, costPKR: 9800000, affects: ['I3', 'I9', 'I10', 'X2'], response: 'Transfer', responseCostPKR: 1650000, residualProb: 0.22, note: 'Letters of credit opened early to lock the exchange rate on imported packages.' },
  { id: 'R4', name: 'Imported marble shipment delayed at port', cat: 'Procurement', prob: 0.38, days: 24, costPKR: 2600000, affects: ['I3'], response: 'Mitigate', responseCostPKR: 1100000, residualProb: 0.16, note: 'Order released 90 days early; a local Ziarat White alternate is pre-approved.' },
  { id: 'R5', name: 'LDA approval or NOC delay', cat: 'Regulatory', prob: 0.34, days: 30, costPKR: 1800000, affects: ['P5', 'S1'], response: 'Mitigate', responseCostPKR: 700000, residualProb: 0.14, note: 'Dedicated liaison consultant; submission complete before site mobilisation.' },
  { id: 'R6', name: 'Skilled labour shortage around Eid & harvest', cat: 'Resource', prob: 0.52, days: 12, costPKR: 2900000, affects: ['E1', 'E2', 'I1', 'I8'], response: 'Mitigate', responseCostPKR: 850000, residualProb: 0.26, note: 'Retention bonus and staged leave roster agreed with the labour contractor.' },
  { id: 'R7', name: 'Client-instructed design change', cat: 'Scope', prob: 0.58, days: 18, costPKR: 7600000, affects: ['I5', 'I7', 'X1'], response: 'Mitigate', responseCostPKR: 0, residualProb: 0.35, note: 'Design freeze at the end of the frame phase; changes after that priced as variations.' },
  { id: 'R8', name: 'Utility connection delay (LESCO / SNGPL / WASA)', cat: 'Regulatory', prob: 0.40, days: 20, costPKR: 1400000, affects: ['M7', 'H1'], response: 'Mitigate', responseCostPKR: 480000, residualProb: 0.18, note: 'Applications lodged at foundation stage; generator covers the commissioning window.' },
  { id: 'R9', name: 'Concrete cube strength failure', cat: 'Quality', prob: 0.22, days: 16, costPKR: 5400000, affects: ['S4', 'F2', 'F4'], response: 'Mitigate', responseCostPKR: 620000, residualProb: 0.08, note: 'Batching-plant audit, on-site slump testing and independent cube laboratory.' },
  { id: 'R10', name: 'Basement waterproofing failure at pond test', cat: 'Quality', prob: 0.20, days: 14, costPKR: 3200000, affects: ['S6'], response: 'Mitigate', responseCostPKR: 540000, residualProb: 0.07, note: 'Two-layer system with a 10-year warranty; pond test before backfill.' },
  { id: 'R11', name: 'Tower crane breakdown', cat: 'Plant', prob: 0.18, days: 9, costPKR: 1600000, affects: ['F2', 'F4', 'E4'], response: 'Transfer', responseCostPKR: 380000, residualProb: 0.08, note: 'Hire contract includes a 24-hour replacement clause and preventive servicing.' },
  { id: 'R12', name: 'Material pilferage from site', cat: 'Security', prob: 0.30, days: 3, costPKR: 2100000, affects: ['E4', 'I3', 'X2'], response: 'Mitigate', responseCostPKR: 620000, residualProb: 0.11, note: 'Perimeter lighting, 24-hour guard and gate-pass material control from day one.' },
  { id: 'R13', name: 'Reportable safety incident & stand-down', cat: 'HSE', prob: 0.16, days: 8, costPKR: 2400000, affects: ['F4', 'E4', 'F7'], response: 'Mitigate', responseCostPKR: 900000, residualProb: 0.06, note: 'Edge protection, harness discipline and a full-time safety officer from the frame phase.' },
  { id: 'R14', name: 'Extended load-shedding disrupts site power', cat: 'Utilities', prob: 0.46, days: 6, costPKR: 1250000, affects: ['M2', 'I1', 'I8'], response: 'Mitigate', responseCostPKR: 410000, residualProb: 0.15, note: 'Site generator sized for the tower crane and finishing plant.' },
];

/** Procurement packages, with the reason each contract type was chosen. */
export const CONTRACTS = [
  { id: 'C1', name: 'Main civil works', type: 'Remeasurement (BOQ) contract', valuePKR: 0, cover: ['CA1', 'CA2', 'CA3', 'CA4'], leadDays: 30, rationale: 'Quantities for excavation and substructure cannot be fixed until the soil report lands, so the risk of quantity variation stays with the client and is measured honestly rather than priced as a contingency.' },
  { id: 'C2', name: 'MEP installation', type: 'Lump sum with provisional sums', valuePKR: 0, cover: ['CA5'], leadDays: 45, rationale: 'The services design is complete at tender, so a lump sum transfers productivity risk to the specialist; provisional sums cover the automation scope, which the client is still developing.' },
  { id: 'C3', name: 'Imported stone supply', type: 'Supply-only, FOB, letter of credit', valuePKR: 0, cover: ['I3'], leadDays: 90, rationale: 'A letter of credit fixes the exchange rate at order and the long lead is absorbed by ordering during the frame phase, well before the floor is ready.' },
  { id: 'C4', name: 'Joinery, kitchen & wardrobes', type: 'Supply-and-fix lump sum', valuePKR: 0, cover: ['I10', 'X1'], leadDays: 75, rationale: 'Single-point responsibility for manufacture and fit avoids the classic dispute over site dimensions and factory tolerances.' },
  { id: 'C5', name: 'Landscape, pool & external works', type: 'Lump sum with a schedule of rates', valuePKR: 0, cover: ['CA8'], leadDays: 30, rationale: 'The hard landscape is fully designed and lump-summed; planting is on a schedule of rates because the client selects specimens on site.' },
  { id: 'C6', name: 'Lift supply & installation', type: 'Supply, install & maintain', valuePKR: 0, cover: ['M7'], leadDays: 120, rationale: 'The longest lead item on the project. Ordered at foundation stage; the maintenance term binds the supplier to its own commissioning quality.' },
];

/** Stakeholders on a power / interest grid. `power` and `interest` are 0-1. */
export const STAKEHOLDERS = [
  { id: 'K1', name: 'Client family (owner)', power: 1.0, interest: 1.0, strategy: 'Manage closely', baseline: 0.86, note: 'Weekly walkthrough, monthly cost report, all variations signed personally.' },
  { id: 'K2', name: 'Architect & interior designer', power: 0.72, interest: 0.95, strategy: 'Manage closely', baseline: 0.80, note: 'Site instruction log; design freeze agreed at the end of the frame phase.' },
  { id: 'K3', name: 'Structural consultant', power: 0.66, interest: 0.62, strategy: 'Keep satisfied', baseline: 0.78, note: 'Inspection before every pour; cube results copied within 24 hours.' },
  { id: 'K4', name: 'Main contractor', power: 0.85, interest: 0.90, strategy: 'Manage closely', baseline: 0.74, note: 'Fortnightly progress meeting against the baseline programme; certified monthly.' },
  { id: 'K5', name: 'LDA & building control', power: 0.90, interest: 0.35, strategy: 'Keep satisfied', baseline: 0.66, note: 'Statutory inspections booked in advance; no work proceeds ahead of approval.' },
  { id: 'K6', name: 'LESCO, SNGPL & WASA', power: 0.78, interest: 0.28, strategy: 'Keep satisfied', baseline: 0.58, note: 'Connection applications lodged at foundation stage and chased fortnightly.' },
  { id: 'K7', name: 'Neighbouring residents', power: 0.34, interest: 0.72, strategy: 'Keep informed', baseline: 0.52, note: 'Working hours 07:00–19:00, wheel-wash at the gate, dust screens on the scaffold.' },
  { id: 'K8', name: 'Site workforce', power: 0.42, interest: 0.88, strategy: 'Keep informed', baseline: 0.70, note: 'Welfare facilities, on-time wages and a daily toolbox talk before the shift.' },
];

/** Quality gates: an inspection with a tolerance that can fail and cause rework. */
export const QUALITY_GATES = [
  { id: 'Q1', name: 'Reinforcement inspection — raft', pkg: 'S3', metric: 'Cover to reinforcement', target: 50, tolerance: 6, unit: 'mm', reworkDays: 3, reworkCostPKR: 420000 },
  { id: 'Q2', name: 'Concrete cube test — raft', pkg: 'S4', metric: '28-day compressive strength', target: 4000, tolerance: 260, unit: 'psi', reworkDays: 16, reworkCostPKR: 5400000 },
  { id: 'Q3', name: 'Pond test — basement tanking', pkg: 'S6', metric: 'Water level drop in 48 h', target: 0, tolerance: 4, unit: 'mm', reworkDays: 12, reworkCostPKR: 3200000 },
  { id: 'Q4', name: 'Concrete cube test — roof slab', pkg: 'F4', metric: '28-day compressive strength', target: 4000, tolerance: 260, unit: 'psi', reworkDays: 14, reworkCostPKR: 4600000 },
  { id: 'Q5', name: 'Roof falls & flood test', pkg: 'E3', metric: 'Standing water after 24 h', target: 0, tolerance: 3, unit: 'mm', reworkDays: 7, reworkCostPKR: 1450000 },
  { id: 'Q6', name: 'MEP pressure test', pkg: 'M7', metric: 'Pressure loss over 2 h', target: 0, tolerance: 5, unit: '%', reworkDays: 6, reworkCostPKR: 1250000 },
  { id: 'Q7', name: 'Plaster tolerance survey', pkg: 'I1', metric: 'Deviation under a 2 m straight edge', target: 0, tolerance: 4, unit: 'mm', reworkDays: 8, reworkCostPKR: 1850000 },
  { id: 'Q8', name: 'Stone flatness & lippage', pkg: 'I3', metric: 'Lippage between adjacent slabs', target: 0, tolerance: 1, unit: 'mm', reworkDays: 10, reworkCostPKR: 3400000 },
  { id: 'Q9', name: 'Integrated systems commissioning', pkg: 'H1', metric: 'Test scripts passed', target: 100, tolerance: 4, unit: '%', reworkDays: 5, reworkCostPKR: 980000 },
  { id: 'Q10', name: 'Client acceptance walkthrough', pkg: 'H4', metric: 'Category-A snags outstanding', target: 0, tolerance: 2, unit: 'items', reworkDays: 6, reworkCostPKR: 1150000 },
];

/** Named milestones, resolved against the schedule once the CPM has run. */
export const MILESTONES = [
  { id: 'MS1', name: 'Ground breaking', pkg: 'S1', at: 'start' },
  { id: 'MS2', name: 'Foundation complete', pkg: 'S7', at: 'finish' },
  { id: 'MS3', name: 'Structure topped out', pkg: 'F4', at: 'finish' },
  { id: 'MS4', name: 'Watertight & weathertight', pkg: 'E6', at: 'finish' },
  { id: 'MS5', name: 'Services rough-in complete', pkg: 'M5', at: 'finish' },
  { id: 'MS6', name: 'Finishes complete', pkg: 'I8', at: 'finish' },
  { id: 'MS7', name: 'Practical completion', pkg: 'H4', at: 'finish' },
];

/**
 * Construction phases, in order.  The 3-D world asks "what phase is day N in?"
 * to decide what plant, scaffolding and workforce belong on the site.
 */
export const PHASES = [
  { id: 'design', name: 'Design & approvals', colour: '#c9a227' },
  { id: 'enabling', name: 'Site establishment', colour: '#b08d3f' },
  { id: 'excavation', name: 'Excavation', colour: '#8a6a4f' },
  { id: 'substructure', name: 'Substructure', colour: '#7a6350' },
  { id: 'frame', name: 'Structural frame', colour: '#9aa5b1' },
  { id: 'envelope', name: 'Envelope & masonry', colour: '#d08c60' },
  { id: 'facade', name: 'Façade & glazing', colour: '#c2794f' },
  { id: 'services', name: 'MEP services', colour: '#4f9d8f' },
  { id: 'finishes', name: 'Interior finishes', colour: '#b06a8c' },
  { id: 'fitout', name: 'Furnishing & fit-out', colour: '#7b6cc4' },
  { id: 'external', name: 'External works', colour: '#6a9a4f' },
  { id: 'handover', name: 'Commissioning & handover', colour: '#5b8ec4' },
];

/* --------------------------------------------------------------- indexes -- */

/** Packages by id. */
export const PKG_BY_ID = (() => {
  const map = new Map();
  for (const pkg of PACKAGES) {
    if (map.has(pkg.id)) throw new Error(`duplicate work package id "${pkg.id}"`);
    map.set(pkg.id, pkg);
  }
  return map;
})();

/** Control accounts by id. */
export const CA_BY_ID = new Map(CONTROL_ACCOUNTS.map((ca) => [ca.id, ca]));

/** Resource pools by id. */
export const RES_BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));

/** Quality gates by id. */
export const GATE_BY_ID = new Map(QUALITY_GATES.map((g) => [g.id, g]));

/** Phase definitions by id. */
export const PHASE_BY_ID = new Map(PHASES.map((p) => [p.id, p]));

/**
 * Validate the model at load: every dependency must resolve, every package
 * must belong to a real control account and resource pool, the precedence
 * network must be acyclic, and every BOQ line must attach to a real package.
 * A model error is a build error, not a runtime surprise.
 */
export function validateModel() {
  const problems = [];
  for (const pkg of PACKAGES) {
    if (!CA_BY_ID.has(pkg.ca)) problems.push(`${pkg.id}: unknown control account "${pkg.ca}"`);
    if (!RES_BY_ID.has(pkg.crew)) problems.push(`${pkg.id}: unknown resource pool "${pkg.crew}"`);
    if (!PHASE_BY_ID.has(pkg.phase)) problems.push(`${pkg.id}: unknown phase "${pkg.phase}"`);
    if (pkg.gate && !GATE_BY_ID.has(pkg.gate)) problems.push(`${pkg.id}: unknown quality gate "${pkg.gate}"`);
    if (!(pkg.o <= pkg.m && pkg.m <= pkg.p)) problems.push(`${pkg.id}: three-point estimate is not ordered (${pkg.o}/${pkg.m}/${pkg.p})`);
    for (const dep of pkg.deps) {
      if (!PKG_BY_ID.has(dep.id)) problems.push(`${pkg.id}: dependency on unknown package "${dep.id}"`);
      if (!['FS', 'SS', 'FF', 'SF'].includes(dep.type)) problems.push(`${pkg.id}: bad dependency type "${dep.type}"`);
    }
  }
  for (const gate of QUALITY_GATES) {
    if (!PKG_BY_ID.has(gate.pkg)) problems.push(`gate ${gate.id}: unknown package "${gate.pkg}"`);
  }
  for (const risk of RISKS) {
    for (const id of risk.affects) {
      if (!PKG_BY_ID.has(id)) problems.push(`risk ${risk.id}: affects unknown package "${id}"`);
    }
  }
  for (const ms of MILESTONES) {
    if (!PKG_BY_ID.has(ms.pkg)) problems.push(`milestone ${ms.id}: unknown package "${ms.pkg}"`);
  }
  // Cycle detection over the precedence network.
  const state = new Map();
  const visit = (id, trail) => {
    const mark = state.get(id);
    if (mark === 2) return;
    if (mark === 1) {
      problems.push(`precedence cycle: ${[...trail, id].join(' → ')}`);
      return;
    }
    state.set(id, 1);
    const pkg = PKG_BY_ID.get(id);
    if (pkg) for (const dep of pkg.deps) if (PKG_BY_ID.has(dep.id)) visit(dep.id, [...trail, id]);
    state.set(id, 2);
  };
  for (const pkg of PACKAGES) visit(pkg.id, []);
  return problems;
}

/**
 * Budget for one work package, from the bill of quantities.  Packages with no
 * BOQ line of their own (pure coordination activities) carry zero direct cost;
 * their effort is recovered through the preliminaries.
 */
export function budgetOf(pkgId) {
  return packageBudget(pkgId);
}

/** The project's construction budget: the bill of quantities, totalled. */
export const PROJECT_BUDGET_PKR = BOQ_TOTAL;

/** Contingency and management reserve, as a policy percentage of the budget. */
export const RESERVES = {
  contingencyPct: 0.065,
  managementPct: 0.035,
  get contingencyPKR() { return PROJECT_BUDGET_PKR * this.contingencyPct; },
  get managementPKR() { return PROJECT_BUDGET_PKR * this.managementPct; },
};
