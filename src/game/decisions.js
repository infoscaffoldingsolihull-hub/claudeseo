/**
 * Decision events — the "dilemma cards" of SKY GATEWAY HYDERABAD.
 *
 * PURE JS (no DOM, no THREE): runs under `node --test`.
 *
 * Every event is a SIMULATED scenario grounded in the Hyderabad (Sindh) context:
 * encroachment, monsoon, dust, heat, PKR volatility, regulators, airlines, unions,
 * ethics. Vendors and airlines are fictional; officials appear by role only.
 *
 * Card shape (docs/ARCHITECTURE.md §9):
 *   { id, title, text, week, clo, domain, lesson,
 *     trigger:{ minDay?, maxDay?, phase?:[…], wbs?:{ id, min?, max? }, weather?:[…],
 *               season?:[doyFrom, doyTo], riskOccurred?:[keywords], chance? },
 *     options:[{ label, tradeoff:{ time, cost, quality, risk, stakeholders, safety, scope },
 *                effects, outcome, score (0..3 PM practice), ethics? }] }
 *
 * Trade-off chips run −2..+2 and are always "for the project": +2 = strongly
 * favourable on that dimension (faster, cheaper, better quality, less risk, happier
 * stakeholders, safer, scope protected), −2 = strongly unfavourable.
 *
 * `effects` feed `project.applyEffect(...)`: days (delay +, recovery −), cost (PKR, + = spend),
 * quality / safety / satisfaction / welfare (index deltas, 0..1 scale), scope (fraction of
 * scope added +/removed −), risk:{ id?, find:[keywords], dp } (probability delta) and
 * stakeholder:{ id?, find:[keywords], d } (satisfaction delta). `find` keywords are resolved
 * against the live risk / stakeholder registers by the GameDirector so the cards survive
 * changes to the scenario data.
 */

const M = 1e6; // PKR million

/* ------------------------------------------------------------ seeded RNG */

/** mulberry32 — tiny, fast, serialisable (state is one uint32). */
export function createRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 0x9e3779b9;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => s;
  rng.setState = (v) => { s = v >>> 0; };
  return rng;
}

/** Stable 32-bit string hash (FNV-1a) used to derive sub-seeds. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------ difficulty */

/**
 * gap: minimum project days between two cards; freq: multiplier on trigger chance;
 * strength: multiplier on the harmful part of every effect.
 */
export const DIFFICULTY = {
  trainee: { label: 'Trainee', gap: 40, freq: 0.7, strength: 0.7, xp: 0.9 },
  professional: { label: 'Professional', gap: 26, freq: 1, strength: 1, xp: 1 },
  crisis: { label: 'Crisis', gap: 15, freq: 1.45, strength: 1.4, xp: 1.25 },
};

export function difficultyOf(name) {
  return DIFFICULTY[name] || DIFFICULTY.professional;
}

/** Day of year (0-based) for a project day; day 0 = Mon 4 Jan 2027. */
export function dayOfYear(day) {
  return (((day + 3) % 365) + 365) % 365;
}

export const SEASONS = {
  winterFog: [335, 40],      // December – early February
  dustSpring: [90, 170],     // April – mid June
  heat: [120, 180],          // May – June (> 45 °C spells)
  monsoon: [182, 262],       // July – mid September
};

const EXEC = ['executing', 'monitoring'];

/* ---------------------------------------------------------------- events */

export const DECISIONS = [
  {
    id: 'D01',
    title: 'Encroachers at the extension boundary',
    text: 'Survey teams pegging the runway-extension footprint find some forty informal dwellings and a cattle pen inside the planned perimeter. Community elders ask to talk before any bulldozer moves. The district administration offers police support for an eviction "this week".',
    week: 12, clo: 'CLO3', domain: 'Stakeholders',
    lesson: 'Encroachment is a stakeholder problem before it is a land problem. Engagement (consult → involve) costs days now and saves months of litigation later.',
    trigger: { phase: ['planning', ...EXEC], minDay: 10, wbs: { id: '2.3', max: 0.6 }, chance: 0.9 },
    options: [
      { label: 'Negotiate a resettlement package through a community jirga and the district office', tradeoff: { time: -1, cost: -1, stakeholders: 2, risk: 1 }, effects: { days: 6, cost: 180 * M, stakeholder: { find: ['communit', 'encroach', 'resident'], d: 0.15 }, risk: { find: ['encroach', 'land'], dp: -0.15 } }, outcome: 'The jirga agrees a relocation package and a 30-day move-out window. Elders become allies on site security.', score: 3 },
      { label: 'Accept the police-assisted eviction', tradeoff: { time: 1, stakeholders: -2, safety: -1, risk: -1 }, effects: { days: -2, stakeholder: { find: ['communit', 'encroach', 'resident'], d: -0.3 }, satisfaction: -0.04, risk: { find: ['encroach', 'land', 'protest'], dp: 0.12 } }, outcome: 'The site is cleared in four days, but a court petition and road-block protests follow. The media picks it up.', score: 0 },
      { label: 'Re-sequence: start the extension at the clear end and engage the community in parallel', tradeoff: { time: 0, cost: -1, stakeholders: 1, scope: 0 }, effects: { days: 2, cost: 60 * M, stakeholder: { find: ['communit', 'encroach', 'resident'], d: 0.08 } }, outcome: 'Work fronts open at the clear southern end while talks continue. Float on 3.2 absorbs the delay.', score: 2 },
    ],
  },
  {
    id: 'D02',
    title: 'Monsoon flash flood on the airfield',
    text: 'A cloudburst drops a month of rain in six hours. Storm water ponds across the extension subgrade and the haul roads. The drainage package (8.7) is not finished. The Met office forecasts a second spell in 48 hours.',
    week: 10, clo: 'CLO2', domain: 'Risk',
    lesson: 'A realised risk is an issue: run the contingency plan, record it in the issue log, and update the risk register (residual and secondary risks).',
    trigger: { phase: EXEC, weather: ['rain'], season: SEASONS.monsoon, riskOccurred: ['flood', 'rain', 'monsoon', 'storm'], chance: 0.55 },
    options: [
      { label: 'Trigger the contingency plan: pumps, temporary bunds, and protect the subgrade', tradeoff: { time: 1, cost: -1, risk: 1, quality: 1 }, effects: { days: 3, cost: 95 * M, quality: 0.01, risk: { find: ['flood', 'monsoon', 'rain', 'drain'], dp: -0.1 } }, outcome: 'Pumps clear the ponding in two days. Subgrade CBR tests pass after drying. Contingency reserve drawn down.', score: 3 },
      { label: 'Stop all earthworks until the monsoon ends', tradeoff: { time: -2, cost: 1, safety: 1 }, effects: { days: 18, cost: 20 * M, safety: 0.01 }, outcome: 'Safe, but the critical path loses almost three weeks of float.', score: 1 },
      { label: 'Crash the drainage package with double shifts', tradeoff: { time: 0, cost: -2, risk: 2, safety: -1 }, effects: { days: 1, cost: 240 * M, safety: -0.02, risk: { find: ['flood', 'monsoon', 'rain', 'drain'], dp: -0.2 } }, outcome: 'The outfall is completed in record time. Overtime and night working cost heavily.', score: 2 },
    ],
  },
  {
    id: 'D03',
    title: 'Dust storm on paving day',
    text: 'A dust storm rolls in from the Thar side just as the asphalt paver starts the first lane of the extension surface course. Visibility is under 500 m, and grit is settling on the tack coat.',
    week: 7, clo: 'CLO2', domain: 'Quality',
    lesson: 'Quality is planned in, not inspected in. Pausing a pour costs time; a contaminated wearing course costs re-work and runway friction for twenty years.',
    trigger: { phase: EXEC, weather: ['dust'], season: SEASONS.dustSpring, wbs: { id: '3.5', min: 0.001, max: 0.98 }, chance: 0.75 },
    options: [
      { label: 'Halt paving, clean the tack coat and re-plan the lane', tradeoff: { time: -1, quality: 2, cost: -1 }, effects: { days: 2, cost: 25 * M, quality: 0.03 }, outcome: 'Two days lost. Friction and roughness tests on the lane come in well inside the spec.', score: 3 },
      { label: 'Pave behind windbreaks with doubled QC sampling', tradeoff: { time: 0, cost: -1, quality: 1, risk: 0 }, effects: { days: 1, cost: 35 * M, quality: 0.01 }, outcome: 'Production continues at half rate. Two cores fail and are cut out locally.', score: 2 },
      { label: 'Keep paving to protect the SPI', tradeoff: { time: 1, quality: -2, risk: -1 }, effects: { days: -1, quality: -0.06, risk: { find: ['quality', 'pavement', 'defect'], dp: 0.1 } }, outcome: 'The lane is laid on time. A week later the cores show poor bond: an NCR is raised.', score: 0 },
    ],
  },
  {
    id: 'D04',
    title: 'Heat wave above 45 °C',
    text: 'The forecast shows five days above 45 °C. Two labourers were treated for heat exhaustion yesterday. The contractor wants to keep the day shift to finish the apron slab on schedule.',
    week: 12, clo: 'CLO3', domain: 'Resources',
    lesson: 'Team welfare is a resource constraint, not a soft extra. Shift patterns, hydration and rest cycles protect people and productivity.',
    trigger: { phase: EXEC, weather: ['heat'], season: SEASONS.heat, chance: 0.65 },
    options: [
      { label: 'Move heavy work to night shifts (21:00–05:00) with lighting and medics', tradeoff: { time: 0, cost: -1, safety: 2, stakeholders: 1 }, effects: { days: 1, cost: 70 * M, safety: 0.04, welfare: 0.06 }, outcome: 'Productivity holds. Night concrete also cures better. The union praises the decision.', score: 3 },
      { label: 'Keep day shift; add shade, water and 15-min breaks per hour', tradeoff: { time: -1, cost: 0, safety: 1 }, effects: { days: 3, cost: 15 * M, safety: 0.01, welfare: 0.02 }, outcome: 'Output falls by a third in the afternoons, but nobody else is hospitalised.', score: 2 },
      { label: 'Push on — the apron is critical', tradeoff: { time: 1, safety: -2, stakeholders: -1 }, effects: { days: -1, safety: -0.08, welfare: -0.08, stakeholder: { find: ['union', 'labour', 'worker'], d: -0.2 } }, outcome: 'A worker collapses on day three. Work stops for an incident investigation.', score: 0 },
    ],
  },
  {
    id: 'D05',
    title: 'PKR devaluation hits the import bill',
    text: 'The rupee slides 9 % against the dollar in a month. Imported structural steel, ILS equipment and AGL fittings are priced in USD. Finance estimates an extra PKR 1.1 bn if nothing is done.',
    week: 9, clo: 'CLO2', domain: 'Cost',
    lesson: 'Currency exposure is a known-unknown: it belongs in the contingency reserve. Hedging transfers risk at a price; descoping trades benefits for cost.',
    trigger: { phase: EXEC, minDay: 90, chance: 0.35 },
    options: [
      { label: 'Draw on the contingency reserve and update the cost baseline via the CCB', tradeoff: { cost: -1, risk: 1, stakeholders: 0 }, effects: { cost: 1100 * M, risk: { find: ['currency', 'exchange', 'pkr', 'devalu', 'inflation'], dp: -0.1 } }, outcome: 'The reserve absorbs the shock. CPI dips but the plan stays whole.', score: 3 },
      { label: 'Buy forward cover for the remaining USD payments', tradeoff: { cost: -1, risk: 2 }, effects: { cost: 450 * M, risk: { find: ['currency', 'exchange', 'pkr', 'devalu', 'inflation'], dp: -0.3 } }, outcome: 'Hedging locks the rate for the rest of the programme for a premium.', score: 3 },
      { label: 'Substitute locally rolled steel sections', tradeoff: { cost: 1, quality: -1, time: -1 }, effects: { cost: 300 * M, days: 9, quality: -0.02 }, outcome: 'Cheaper, but the redesign and mill certificates add nine days and an extra inspection regime.', score: 1 },
      { label: 'Descope two of the four jet bridges', tradeoff: { cost: 2, scope: -2, stakeholders: -1 }, effects: { cost: -400 * M, scope: -0.02, stakeholder: { find: ['airline', 'carrier', 'operator'], d: -0.15 } }, outcome: 'The cost line recovers, but the airlines lose contact stands in the business case.', score: 1 },
    ],
  },
  {
    id: 'D06',
    title: 'Bitumen price spike',
    text: 'Refinery bitumen prices jump 22 % after a supply disruption. The paving subcontractor on a fixed-price contract threatens to slow down unless the price is adjusted.',
    week: 11, clo: 'CLO3', domain: 'Procurement',
    lesson: 'Contract type allocates risk. A fixed-price-with-economic-price-adjustment (FP-EPA) clause shares commodity risk fairly; forcing all of it onto a small supplier creates delivery risk.',
    trigger: { phase: EXEC, wbs: { id: '3.4', min: 0.2 }, chance: 0.5 },
    options: [
      { label: 'Apply the economic price adjustment clause against a published index', tradeoff: { cost: -1, stakeholders: 1, risk: 1 }, effects: { cost: 160 * M, stakeholder: { find: ['contractor', 'supplier'], d: 0.1 } }, outcome: 'The adjustment is transparent and auditable. Paving continues at full rate.', score: 3 },
      { label: 'Bulk-buy a season of bitumen now and free-issue it', tradeoff: { cost: -1, risk: 1, time: 0 }, effects: { cost: 220 * M, risk: { find: ['bitumen', 'material', 'supply'], dp: -0.15 } }, outcome: 'Supply is secured, but storage and heating add cost and the owner now carries material risk.', score: 2 },
      { label: 'Hold the contractor to the fixed price', tradeoff: { cost: 1, time: -1, stakeholders: -1, risk: -1 }, effects: { days: 8, stakeholder: { find: ['contractor', 'supplier'], d: -0.2 }, risk: { find: ['contractor', 'insolven', 'cash'], dp: 0.15 } }, outcome: 'The contract is upheld, but the crew is quietly halved.', score: 1 },
    ],
  },
  {
    id: 'D07',
    title: 'Airline asks for Code E stands',
    text: 'A fictional carrier, SindhJet, offers to base two wide-body aircraft at Hyderabad if two apron stands are upgraded from Code C to Code E. Their letter goes straight to the sponsor.',
    week: 6, clo: 'CLO2', domain: 'Change control',
    lesson: 'Every change goes through integrated change control: log it, analyse impact on scope, schedule, cost, quality and risk, and decide at the CCB — even attractive ones.',
    trigger: { phase: ['planning', ...EXEC], minDay: 60, wbs: { id: '4.3', max: 0.7 }, chance: 0.45 },
    options: [
      { label: 'Raise a change request and take an impact analysis to the CCB', tradeoff: { time: 0, scope: 1, stakeholders: 1, cost: -1 }, effects: { days: 2, cost: 30 * M, scope: 0.01, stakeholder: { find: ['airline', 'carrier'], d: 0.1 } }, outcome: 'The CCB approves a phased upgrade with funding from the carrier. Baselines are updated formally.', score: 3 },
      { label: 'Agree immediately — it is a great opportunity', tradeoff: { scope: -2, time: -2, cost: -2, stakeholders: 1 }, effects: { days: 20, cost: 650 * M, scope: 0.04, stakeholder: { find: ['airline', 'carrier'], d: 0.2 } }, outcome: 'Uncontrolled scope creep: apron drawings are re-issued and the critical path moves.', score: 0 },
      { label: 'Reject — it is not in the charter', tradeoff: { stakeholders: -2, scope: 1 }, effects: { stakeholder: { find: ['airline', 'carrier'], d: -0.25 }, satisfaction: -0.02 }, outcome: 'Scope is protected, but the carrier signs with another airport.', score: 1 },
      { label: 'Defer as a Phase 2 option and safeguard the land and pavement depth', tradeoff: { cost: -1, risk: 1, stakeholders: 1 }, effects: { cost: 40 * M, stakeholder: { find: ['airline', 'carrier'], d: 0.05 } }, outcome: 'A cheap real option: thicker pavement at two stands keeps the upgrade open.', score: 2 },
    ],
  },
  {
    id: 'D08',
    title: 'Main contractor cash-flow crisis',
    text: 'The civil works contractor has not paid its sub-contractors for two months. Dump trucks are parked, and the site agent asks for an advance against the next three interim payment certificates.',
    week: 11, clo: 'CLO3', domain: 'Procurement',
    lesson: 'Supplier financial health is a procurement risk. Remedies range from secured advances to termination; each has schedule and legal consequences.',
    trigger: { phase: EXEC, minDay: 150, wbs: { id: '3.3', min: 0.05 }, chance: 0.35 },
    options: [
      { label: 'Pay a secured advance against a bank guarantee and pay subs directly', tradeoff: { time: 1, cost: -1, risk: 1 }, effects: { cost: 120 * M, days: -2, risk: { find: ['contractor', 'insolven', 'cash'], dp: -0.15 } }, outcome: 'Trucks are back within a week. The guarantee protects the owner.', score: 3 },
      { label: 'Issue a formal notice to correct under the contract', tradeoff: { time: -2, stakeholders: -1, cost: 1 }, effects: { days: 14, stakeholder: { find: ['contractor'], d: -0.15 } }, outcome: 'Legally sound, but the site idles for two weeks while lawyers exchange letters.', score: 1 },
      { label: 'Terminate and re-tender the remaining works', tradeoff: { time: -2, cost: -2, risk: 1 }, effects: { days: 45, cost: 380 * M, risk: { find: ['contractor', 'insolven'], dp: -0.3 } }, outcome: 'A new contractor mobilises after six weeks at a higher price.', score: 1 },
    ],
  },
  {
    id: 'D09',
    title: 'Bird-strike hazard from a landfill',
    text: 'The wildlife hazard survey counts kites and crows circling an open municipal dump 3 km under the RWY 02 approach. ICAO guidance flags it as an attractant.',
    week: 10, clo: 'CLO2', domain: 'Risk',
    lesson: 'Some threats sit outside your scope but inside your risk register. Escalate to the owner of the cause; mitigate what you control.',
    trigger: { phase: EXEC, minDay: 120, chance: 0.35 },
    options: [
      { label: 'Escalate to the municipal authority with a joint wildlife-hazard plan', tradeoff: { safety: 2, stakeholders: 1, cost: -1 }, effects: { cost: 45 * M, safety: 0.03, risk: { find: ['bird', 'wildlife'], dp: -0.25 }, stakeholder: { find: ['municipal', 'district', 'local gov', 'city'], d: 0.05 } }, outcome: 'The dump is covered daily and relocated in the next budget cycle. Bird counts fall sharply.', score: 3 },
      { label: 'Install bird-scaring devices on the airfield only', tradeoff: { safety: 1, cost: -1 }, effects: { cost: 25 * M, safety: 0.01, risk: { find: ['bird', 'wildlife'], dp: -0.1 } }, outcome: 'Helps on the runway; does nothing about the source.', score: 2 },
      { label: 'Note it in the register and accept', tradeoff: { safety: -2, risk: -2 }, effects: { safety: -0.03, risk: { find: ['bird', 'wildlife'], dp: 0.1 } }, outcome: 'The regulator later lists it as a finding at the certification audit.', score: 0 },
    ],
  },
  {
    id: 'D10',
    title: 'Surprise regulator inspection',
    text: 'An aerodrome inspector from the civil aviation regulator arrives unannounced to review the works-in-progress safety plan and the quality records for the runway overlay.',
    week: 7, clo: 'CLO2', domain: 'Quality',
    lesson: 'Audits are free consulting. Transparent records and a corrective-action plan build trust that pays off at certification.',
    trigger: { phase: EXEC, wbs: { id: '3.6', min: 0.05 }, chance: 0.4 },
    options: [
      { label: 'Open every record and agree a corrective-action plan', tradeoff: { quality: 2, time: -1, stakeholders: 1 }, effects: { days: 2, quality: 0.03, stakeholder: { find: ['regulat', 'aviation authority', 'caa'], d: 0.15 } }, outcome: 'Three minor findings, closed within a week. The inspector notes "good safety culture".', score: 3 },
      { label: 'Give a guided tour of the best areas only', tradeoff: { risk: -2, stakeholders: -1 }, effects: { stakeholder: { find: ['regulat', 'aviation authority', 'caa'], d: -0.2 }, risk: { find: ['certif', 'regulat', 'approval'], dp: 0.15 } }, outcome: 'The inspector notices. A full audit is scheduled before certification.', score: 0 },
      { label: 'Ask to reschedule to next week', tradeoff: { stakeholders: -1, time: 0 }, effects: { stakeholder: { find: ['regulat', 'aviation authority', 'caa'], d: -0.08 } }, outcome: 'The request is granted reluctantly.', score: 1 },
    ],
  },
  {
    id: 'D11',
    title: 'Media story: "Airport revival stalls again"',
    text: 'A Hyderabad evening paper runs a story claiming the project is a year late and over budget. Social media is sharing an old photo of the closed terminal.',
    week: 12, clo: 'CLO3', domain: 'Communications',
    lesson: 'Communication management is proactive: a single source of truth, tailored to audience, delivered on a planned cadence.',
    trigger: { phase: EXEC, minDay: 200, chance: 0.3 },
    options: [
      { label: 'Hold a press briefing with verified progress data and a site visit', tradeoff: { stakeholders: 2, cost: 0, time: 0 }, effects: { cost: 5 * M, satisfaction: 0.05, stakeholder: { find: ['media', 'public', 'communit'], d: 0.2 } }, outcome: 'The follow-up story leads with drone photos of the new runway.', score: 3 },
      { label: 'No comment', tradeoff: { stakeholders: -1 }, effects: { satisfaction: -0.03, stakeholder: { find: ['media', 'public'], d: -0.1 } }, outcome: 'The story runs for a week unchallenged.', score: 1 },
      { label: 'Blame the contractor publicly', tradeoff: { stakeholders: -2, risk: -1 }, effects: { satisfaction: -0.04, stakeholder: { find: ['contractor'], d: -0.3 }, risk: { find: ['contractor', 'claim', 'dispute'], dp: 0.1 } }, outcome: 'The contractor issues a rebuttal and a notice of claim.', score: 0 },
    ],
  },
  {
    id: 'D12',
    title: 'Union demand: heat and night allowance',
    text: 'The site workers\' union demands a heat allowance and transport for night shifts, and gives notice of a work-to-rule from Monday.',
    week: 12, clo: 'CLO3', domain: 'Team',
    lesson: 'Negotiate on interests, not positions. Collaborating (win-win) is the preferred conflict-resolution mode when the relationship matters.',
    trigger: { phase: EXEC, minDay: 100, season: SEASONS.heat, chance: 0.4 },
    options: [
      { label: 'Negotiate: allowance plus rest cycles, linked to safety targets', tradeoff: { cost: -1, stakeholders: 2, safety: 1 }, effects: { cost: 85 * M, welfare: 0.08, safety: 0.02, stakeholder: { find: ['union', 'labour', 'worker'], d: 0.25 } }, outcome: 'An agreement is signed in two days. Absenteeism falls.', score: 3 },
      { label: 'Refuse — the contract rates are fixed', tradeoff: { time: -2, stakeholders: -2 }, effects: { days: 12, welfare: -0.08, stakeholder: { find: ['union', 'labour', 'worker'], d: -0.3 } }, outcome: 'Work-to-rule for two weeks. Productivity halves.', score: 0 },
      { label: 'Request mediation by the provincial labour department', tradeoff: { time: -1, stakeholders: 1, cost: 0 }, effects: { days: 4, cost: 40 * M, welfare: 0.03, stakeholder: { find: ['union', 'labour', 'worker'], d: 0.1 } }, outcome: 'A compromise is reached after four days.', score: 2 },
    ],
  },
  {
    id: 'D13',
    title: 'A vendor offers a "facilitation fee"',
    text: 'During bid evaluation for the airfield ground lighting package, a representative of a fictional bidder, Lumina Airfield Systems, hints that "a consideration" would be available if their technical score improved.',
    week: 11, clo: 'CLO3', domain: 'Procurement',
    lesson: 'Professional responsibility is non-negotiable: refuse, record, report. A weighted-scoring model with documented evidence protects you and the process.',
    trigger: { phase: ['planning', ...EXEC], minDay: 40, chance: 0.4 },
    options: [
      { label: 'Refuse, record the approach and report it to the ethics committee', tradeoff: { time: -1, stakeholders: 1, risk: 2 }, effects: { days: 3, stakeholder: { find: ['sponsor', 'ministry', 'board'], d: 0.1 } }, outcome: 'The bidder is disqualified and the evaluation re-run with independent scorers. Your integrity is noted by the sponsor.', score: 3, ethics: true },
      { label: 'Ignore the hint and carry on scoring', tradeoff: { risk: -1 }, effects: { risk: { find: ['procure', 'fraud', 'corrupt', 'vendor'], dp: 0.1 } }, outcome: 'Nothing happens — this time. The approach goes unreported.', score: 1 },
      { label: 'Accept the offer', tradeoff: { quality: -2, risk: -2, stakeholders: -2 }, effects: { quality: -0.08, satisfaction: -0.1, risk: { find: ['procure', 'fraud', 'corrupt', 'vendor'], dp: 0.4 } }, outcome: 'An audit uncovers the payment. The award is cancelled and you are removed from the evaluation panel.', score: 0, ethics: false },
    ],
  },
  {
    id: 'D14',
    title: 'A VIP lounge "while you are at it"',
    text: 'A senior provincial official asks for a VIP lounge and a separate VIP car park to be added to the terminal "since construction is already under way".',
    week: 4, clo: 'CLO1', domain: 'Scope',
    lesson: 'Scope creep is uncontrolled change. Even powerful stakeholders get a change request, an impact assessment and a CCB decision.',
    trigger: { phase: EXEC, wbs: { id: '7.3', min: 0.01 }, chance: 0.45 },
    options: [
      { label: 'Raise a change request with a costed impact analysis', tradeoff: { scope: 1, stakeholders: 1, time: 0 }, effects: { days: 1, stakeholder: { find: ['provinc', 'government', 'sponsor'], d: 0.05 } }, outcome: 'The CCB approves a smaller lounge within the existing footprint, funded separately.', score: 3 },
      { label: 'Add it quietly to the fit-out package', tradeoff: { scope: -2, cost: -2, time: -1 }, effects: { days: 12, cost: 320 * M, scope: 0.03 }, outcome: 'Fit-out drawings are re-issued. The cost overrun surfaces at the next EVM review.', score: 0 },
      { label: 'Decline: outside the charter', tradeoff: { scope: 1, stakeholders: -2 }, effects: { stakeholder: { find: ['provinc', 'government'], d: -0.2 } }, outcome: 'Scope is protected, but a key approver is now lukewarm.', score: 1 },
    ],
  },
  {
    id: 'D15',
    title: 'Sprint scope change: "just one more FIDS feature"',
    text: 'Mid-sprint, the terminal operator asks the IT Scrum team to add Urdu/Sindhi language toggles to the flight information displays before the sprint review.',
    week: 3, clo: 'CLO1', domain: 'Agile',
    lesson: 'In Scrum the sprint backlog is owned by the developers and the sprint goal is protected. New work goes to the product backlog and is ordered by the Product Owner.',
    trigger: { phase: EXEC, wbs: { id: '10', min: 0.05, max: 0.9 }, chance: 0.6 },
    options: [
      { label: 'Product Owner adds it to the product backlog for the next sprint planning', tradeoff: { scope: 1, stakeholders: 1, risk: 1 }, effects: { stakeholder: { find: ['operator', 'airport author'], d: 0.05 } }, outcome: 'The sprint goal is met. The language toggle ships next sprint.', score: 3 },
      { label: 'Squeeze it into the current sprint', tradeoff: { risk: -1, quality: -1, time: -1 }, effects: { days: 3, quality: -0.02 }, outcome: 'The sprint goal is missed and two stories carry over.', score: 0 },
      { label: 'Cancel the sprint and re-plan', tradeoff: { time: -2, cost: -1 }, effects: { days: 7, cost: 15 * M }, outcome: 'Only the Product Owner can cancel a sprint — and only when the goal is obsolete. A week of velocity is lost.', score: 1 },
    ],
  },
  {
    id: 'D16',
    title: 'NCR: concrete cubes fail at 28 days',
    text: 'Three of nine 28-day cube results for the apron slab come in below the specified 40 MPa. The batch plant blames curing; the contractor wants a concession.',
    week: 7, clo: 'CLO2', domain: 'Quality',
    lesson: 'A non-conformance report triggers investigation, disposition (use-as-is, repair, rework, reject) and root-cause analysis — not an argument.',
    trigger: { phase: EXEC, wbs: { id: '4.3', min: 0.1, max: 0.98 }, chance: 0.55 },
    options: [
      { label: 'Hold point: core tests and a structural assessment before disposition', tradeoff: { time: -1, quality: 2, cost: -1 }, effects: { days: 4, cost: 18 * M, quality: 0.04 }, outcome: 'Cores pass at 42 MPa — cube curing was the issue. Root cause fixed at the batch plant.', score: 3 },
      { label: 'Break out and recast the bays', tradeoff: { time: -2, cost: -2, quality: 2 }, effects: { days: 12, cost: 140 * M, quality: 0.05 }, outcome: 'Certain, but expensive — without evidence that the concrete was actually deficient.', score: 1 },
      { label: 'Accept with a concession', tradeoff: { quality: -2, risk: -1, time: 1 }, effects: { quality: -0.06, risk: { find: ['quality', 'defect', 'pavement'], dp: 0.12 } }, outcome: 'Hairline cracking appears six months later.', score: 0 },
    ],
  },
  {
    id: 'D17',
    title: 'Recover the schedule: fast-track or crash?',
    text: 'The terminal is 25 days behind. The SPI is below 0.92. Options on the table: overlap glazing and fit-out, add a second shift, or re-baseline.',
    week: 5, clo: 'CLO2', domain: 'Schedule',
    lesson: 'Crashing adds cost to buy time on the critical path (cheapest cost-slope first); fast-tracking overlaps activities and adds risk. Re-baselining is a CCB decision.',
    trigger: { phase: EXEC, wbs: { id: '7.5', max: 0.6 }, minDay: 200, chance: 0.4 },
    options: [
      { label: 'Fast-track: start fit-out in zones where glazing is complete', tradeoff: { time: 2, risk: -1, quality: -1 }, effects: { days: -12, quality: -0.01, risk: { find: ['schedule', 'delay', 'interface'], dp: 0.08 } }, outcome: 'Twelve days recovered. Two trades now share the concourse; coordination meetings go daily.', score: 2 },
      { label: 'Crash: add a second shift on the critical activities', tradeoff: { time: 1, cost: -2 }, effects: { days: -10, cost: 210 * M }, outcome: 'Ten days recovered at the cost-slope price.', score: 2 },
      { label: 'Propose a formal re-baseline to the CCB with a new forecast', tradeoff: { time: -1, stakeholders: -1, risk: 1 }, effects: { days: 0, satisfaction: -0.02 }, outcome: 'The sponsor accepts the revised date grudgingly. Variances now measure against a realistic plan.', score: 2 },
    ],
  },
  {
    id: 'D18',
    title: 'The lead pavement engineer resigns',
    text: 'Your lead pavement engineer accepts an offer in the Gulf. She leaves in four weeks, in the middle of the overlay works.',
    week: 12, clo: 'CLO3', domain: 'Resources',
    lesson: 'Key-person risk is mitigated by knowledge management: documented decisions, shadowing and a succession plan.',
    trigger: { phase: EXEC, wbs: { id: '3.6', min: 0.01, max: 0.8 }, chance: 0.35 },
    options: [
      { label: 'Promote her deputy and run a four-week structured handover', tradeoff: { time: 0, cost: 0, quality: 1, stakeholders: 1 }, effects: { cost: 6 * M, welfare: 0.03 }, outcome: 'The deputy grows into the role. Lessons are captured in the knowledge base.', score: 3 },
      { label: 'Hire an expatriate consultant on a day rate', tradeoff: { cost: -1, quality: 1 }, effects: { cost: 60 * M, days: 3 }, outcome: 'Expensive and slow to mobilise, but competent.', score: 2 },
      { label: 'Spread her duties across the team', tradeoff: { quality: -1, safety: -1 }, effects: { quality: -0.02, welfare: -0.05 }, outcome: 'The team is stretched; two inspections are missed.', score: 0 },
    ],
  },
  {
    id: 'D19',
    title: 'Unmapped gas main on the access road',
    text: 'An excavator on the landside access road (9.1) uncovers an unmapped medium-pressure gas main. The operator says he can dig around it.',
    week: 10, clo: 'CLO3', domain: 'Risk',
    lesson: 'Safety first is a project value, not a slogan. Stop-work authority belongs to everyone on site.',
    trigger: { phase: EXEC, wbs: { id: '9.1', min: 0.01, max: 0.9 }, chance: 0.6 },
    options: [
      { label: 'Stop work and re-route with the gas utility present', tradeoff: { safety: 2, time: -1, stakeholders: 1 }, effects: { days: 6, cost: 30 * M, safety: 0.04, stakeholder: { find: ['utilit', 'gas'], d: 0.1 } }, outcome: 'The utility isolates and diverts the main. Nobody is hurt.', score: 3 },
      { label: 'Hand-dig around it with a watchman', tradeoff: { safety: 1, time: -1 }, effects: { days: 3, safety: 0.01 }, outcome: 'Slow but safe enough. The utility is informed afterwards.', score: 2 },
      { label: 'Keep the excavator working', tradeoff: { safety: -2, risk: -2, time: 1 }, effects: { safety: -0.1, risk: { find: ['utilit', 'safety', 'accident'], dp: 0.15 } }, outcome: 'The bucket nicks the main. Evacuation, fire service, and a two-week stop.', score: 0 },
    ],
  },
  {
    id: 'D20',
    title: 'Opportunity: sell surplus solar power',
    text: 'The distribution company offers net-metering for the 8.5 solar plant. A 20 % larger array would export power on weekends and pay back in six years.',
    week: 10, clo: 'CLO2', domain: 'Risk',
    lesson: 'Opportunities are risks with upside: exploit, enhance, share or accept. Evaluate them with the same rigour (EMV, NPV).',
    trigger: { phase: EXEC, wbs: { id: '8.5', max: 0.7 }, minDay: 150, chance: 0.4 },
    options: [
      { label: 'Enhance: raise a CR for the larger array', tradeoff: { cost: -1, scope: -1, stakeholders: 1, risk: 1 }, effects: { cost: 180 * M, scope: 0.01, satisfaction: 0.02 }, outcome: 'The CCB approves. Benefits register updated with energy revenue.', score: 3 },
      { label: 'Share: invite the distribution company to co-invest', tradeoff: { cost: 0, stakeholders: 2 }, effects: { cost: 40 * M, stakeholder: { find: ['utilit', 'power', 'distribution'], d: 0.15 } }, outcome: 'A joint venture shares cost and revenue.', score: 3 },
      { label: 'Accept: build as designed', tradeoff: { scope: 1 }, effects: {}, outcome: 'The baseline is protected; the upside is left on the table.', score: 1 },
    ],
  },
  {
    id: 'D21',
    title: 'Winter fog over the approach lights',
    text: 'Dense radiation fog sits on the airfield every morning. Flight-checking the new approach lighting and PAPI needs clear early-morning windows.',
    week: 5, clo: 'CLO2', domain: 'Schedule',
    lesson: 'Calendar constraints (weather windows) are real constraints in the schedule model. Use resource calendars and lags rather than wishful durations.',
    trigger: { phase: EXEC, weather: ['fog'], season: SEASONS.winterFog, wbs: { id: '5.3', min: 0.2 }, chance: 0.5 },
    options: [
      { label: 'Re-sequence: do flight checks in the afternoon, ground tests at dawn', tradeoff: { time: 1, cost: 0, quality: 1 }, effects: { days: 1, quality: 0.01 }, outcome: 'The work fits the weather window. Flight check passes.', score: 3 },
      { label: 'Wait for the fog season to end', tradeoff: { time: -2 }, effects: { days: 20 }, outcome: 'Three weeks of float vanish.', score: 1 },
      { label: 'Fly the check in marginal visibility', tradeoff: { safety: -2, quality: -1 }, effects: { safety: -0.04, quality: -0.02 }, outcome: 'The flight-check pilot aborts; the inspector asks for a re-fly.', score: 0 },
    ],
  },
  {
    id: 'D22',
    title: 'Chance find during excavation',
    text: 'Excavating the cargo shed foundations, a crew finds old terracotta pipe fragments and a brick culvert. The provincial heritage office must be informed.',
    week: 12, clo: 'CLO3', domain: 'Stakeholders',
    lesson: 'Chance-find procedures belong in the environmental and social management plan. Compliance is cheaper than reputation damage.',
    trigger: { phase: EXEC, wbs: { id: '8.1', min: 0.01, max: 0.5 }, chance: 0.5 },
    options: [
      { label: 'Follow the chance-find procedure and invite the heritage office', tradeoff: { time: -1, stakeholders: 2 }, effects: { days: 5, stakeholder: { find: ['heritage', 'cultur', 'environment', 'provinc'], d: 0.12 } }, outcome: 'Fragments recorded and removed in five days. A small display goes into the terminal.', score: 3 },
      { label: 'Record it yourselves and continue', tradeoff: { time: 1, risk: -1 }, effects: { risk: { find: ['regulat', 'environment', 'permit'], dp: 0.08 } }, outcome: 'Work continues; a complaint is filed later.', score: 1 },
    ],
  },
  {
    id: 'D23',
    title: 'Water shortage for concrete curing',
    text: 'Canal water allocation is cut during the dry spell. Tankers are scarce and expensive; the terminal slabs need seven days of wet curing.',
    week: 7, clo: 'CLO2', domain: 'Quality',
    lesson: 'Prevention cost (curing compound) is usually lower than failure cost (cracking, rework). Cost of quality thinking guides the choice.',
    trigger: { phase: EXEC, wbs: { id: '7.2', min: 0.1, max: 0.95 }, season: SEASONS.heat, chance: 0.4 },
    options: [
      { label: 'Switch to membrane curing compounds', tradeoff: { cost: 0, quality: 1, time: 0 }, effects: { cost: 12 * M, quality: 0.02 }, outcome: 'Strength gain on target with a fraction of the water.', score: 3 },
      { label: 'Hire tankers at premium rates', tradeoff: { cost: -1, quality: 1 }, effects: { cost: 35 * M }, outcome: 'Curing continues as specified, at a price.', score: 2 },
      { label: 'Cut curing to three days', tradeoff: { quality: -2, time: 1 }, effects: { quality: -0.05, days: -1 }, outcome: 'Plastic shrinkage cracks appear on two slabs.', score: 0 },
    ],
  },
  {
    id: 'D24',
    title: 'Load-shedding stops the batch plant',
    text: 'Grid outages of six hours a day hit the site. The batch plant and the site offices go dark mid-pour.',
    week: 12, clo: 'CLO3', domain: 'Resources',
    lesson: 'Physical resources include utilities. Resource planning covers back-up capacity, not just people and machines.',
    trigger: { phase: EXEC, minDay: 60, season: SEASONS.heat, chance: 0.4 },
    options: [
      { label: 'Rent standby generators with an automatic changeover', tradeoff: { cost: -1, time: 1 }, effects: { cost: 55 * M }, outcome: 'Pours continue without cold joints.', score: 3 },
      { label: 'Schedule pours around the outage timetable', tradeoff: { time: -1, cost: 0 }, effects: { days: 6 }, outcome: 'No extra cost; production falls.', score: 2 },
      { label: 'Energise the solar plant early for site power', tradeoff: { cost: -1, scope: 0, risk: -1 }, effects: { cost: 70 * M, days: 2, risk: { find: ['interface', 'commission'], dp: 0.05 } }, outcome: 'A temporary connection works by day, with interface risk.', score: 1 },
    ],
  },
  {
    id: 'D25',
    title: 'Security alert raised',
    text: 'Following a provincial security advisory, the airport security agency asks for vetting of all 1,200 site workers and a hardened perimeter within two weeks.',
    week: 12, clo: 'CLO3', domain: 'Stakeholders',
    lesson: 'Some stakeholders hold a veto (high power, high urgency). Manage closely and comply early.',
    trigger: { phase: EXEC, minDay: 180, wbs: { id: '2.4', min: 0.2 }, chance: 0.3 },
    options: [
      { label: 'Comply: biometric passes, vetting and a guarded single gate', tradeoff: { cost: -1, safety: 2, time: -1, stakeholders: 1 }, effects: { cost: 40 * M, days: 3, safety: 0.03, stakeholder: { find: ['security', 'asf', 'police'], d: 0.15 } }, outcome: 'The agency signs off. Pilferage also drops.', score: 3 },
      { label: 'Negotiate a phased approach over two months', tradeoff: { time: 0, stakeholders: -1, risk: -1 }, effects: { stakeholder: { find: ['security', 'asf', 'police'], d: -0.1 } }, outcome: 'Agreed reluctantly, with a weekly inspection.', score: 1 },
    ],
  },
  {
    id: 'D26',
    title: 'Tower cab glazing out of tolerance',
    text: 'The inclined glazing panels for the control-tower cab arrive with optical distortion beyond specification. Re-manufacture takes ten weeks.',
    week: 7, clo: 'CLO2', domain: 'Quality',
    lesson: 'Fitness for use: for an ATC cab, optical quality is a safety requirement, not a cosmetic one. Inspection at source would have caught it.',
    trigger: { phase: EXEC, wbs: { id: '6.4', min: 0.01, max: 0.7 }, chance: 0.6 },
    options: [
      { label: 'Reject the batch and add source inspection for the remake', tradeoff: { quality: 2, time: -1, safety: 1 }, effects: { days: 10, quality: 0.03, safety: 0.02 }, outcome: 'The re-made panels pass. Controllers sign off the sightlines.', score: 3 },
      { label: 'Install temporarily and replace later', tradeoff: { time: 1, cost: -1, quality: -1 }, effects: { cost: 50 * M, quality: -0.01 }, outcome: 'Double handling, but the cab is weather-tight on time.', score: 2 },
      { label: 'Accept them', tradeoff: { quality: -2, safety: -1 }, effects: { quality: -0.05, safety: -0.03 }, outcome: 'Controllers complain of double images at night.', score: 0 },
    ],
  },
  {
    id: 'D27',
    title: 'AI analytics for baggage handling',
    text: 'A fictional start-up, Qasim Data Labs, pitches an AI model that predicts baggage-belt bottlenecks. They want a full licence now.',
    week: 3, clo: 'CLO1', domain: 'AI in PM',
    lesson: 'Treat AI as a hypothesis: a time-boxed spike or proof of value, data-governance check and human oversight before scaling.',
    trigger: { phase: EXEC, wbs: { id: '10', min: 0.1 }, chance: 0.45 },
    options: [
      { label: 'Run a two-sprint proof of value with clear acceptance criteria', tradeoff: { scope: 1, cost: 0, risk: 1 }, effects: { cost: 8 * M }, outcome: 'The spike shows a 12 % queue reduction in simulation. A data-protection review is booked.', score: 3 },
      { label: 'Buy the full licence now', tradeoff: { cost: -2, risk: -1 }, effects: { cost: 90 * M, risk: { find: ['it', 'system', 'integration'], dp: 0.08 } }, outcome: 'Integration problems surface late in ORAT.', score: 0 },
      { label: 'Decline — not in the baseline', tradeoff: { scope: 1 }, effects: {}, outcome: 'Safe; no learning gained.', score: 1 },
    ],
  },
  {
    id: 'D28',
    title: 'Near miss: crane load swings over workers',
    text: 'A tower-crane lifting roof trusses for the terminal swings in a gust and passes over a crew below. Nobody is hurt.',
    week: 12, clo: 'CLO3', domain: 'Team',
    lesson: 'Near misses are free lessons. Report, investigate root cause, and share — a just culture improves safety performance.',
    trigger: { phase: EXEC, wbs: { id: '7.4', min: 0.01, max: 0.95 }, chance: 0.55 },
    options: [
      { label: 'Stand-down, root-cause investigation, wind-speed lift limits', tradeoff: { safety: 2, time: -1 }, effects: { days: 2, safety: 0.05, welfare: 0.03 }, outcome: 'New lift plan with anemometer cut-out at 38 km/h.', score: 3 },
      { label: 'Warn the crane operator', tradeoff: { safety: 0 }, effects: { safety: -0.01 }, outcome: 'The underlying cause — no wind limit — remains.', score: 1 },
      { label: 'Do nothing — nobody was hurt', tradeoff: { safety: -2, risk: -2 }, effects: { safety: -0.05, risk: { find: ['safety', 'accident', 'crane'], dp: 0.12 } }, outcome: 'Workers notice that safety reports go nowhere.', score: 0 },
    ],
  },
  {
    id: 'D29',
    title: 'Regulator requires a longer RESA',
    text: 'The aerodrome regulator\'s design review requires a 240 m runway end safety area beyond each strip end, instead of the 90 m in the design.',
    week: 6, clo: 'CLO2', domain: 'Change control',
    lesson: 'Regulatory changes are mandatory changes — they still go through change control so baselines, budgets and risks stay consistent.',
    trigger: { phase: ['planning', ...EXEC], minDay: 45, wbs: { id: '3.2', max: 0.5 }, chance: 0.5 },
    options: [
      { label: 'Raise a mandatory CR and update scope, schedule and budget baselines', tradeoff: { scope: -1, cost: -1, safety: 2 }, effects: { days: 5, cost: 160 * M, scope: 0.01, safety: 0.03, stakeholder: { find: ['regulat', 'aviation authority', 'caa'], d: 0.1 } }, outcome: 'The longer RESA is designed in. Certification risk falls.', score: 3 },
      { label: 'Apply for a dispensation', tradeoff: { risk: -1, time: 0, stakeholders: -1 }, effects: { risk: { find: ['certif', 'regulat'], dp: 0.15 } }, outcome: 'The regulator refuses six months later — redesign under pressure.', score: 0 },
      { label: 'Reduce declared distances instead', tradeoff: { scope: -1, stakeholders: -1, safety: 1 }, effects: { scope: -0.01, stakeholder: { find: ['airline', 'carrier'], d: -0.1 } }, outcome: 'Compliant, but the usable runway shrinks for heavy aircraft.', score: 2 },
    ],
  },
  {
    id: 'D30',
    title: 'Ajrak art in the terminal',
    text: 'The provincial culture department proposes Ajrak-pattern screens and a Sindhi craft gallery in the departure hall, crafted by local artisans.',
    week: 12, clo: 'CLO3', domain: 'Stakeholders',
    lesson: 'Stakeholder engagement can create value: a small, well-controlled change can earn lasting support and community ownership.',
    trigger: { phase: EXEC, wbs: { id: '7.7', min: 0.01, max: 0.8 }, chance: 0.5 },
    options: [
      { label: 'Approve via the CCB as a small funded change', tradeoff: { stakeholders: 2, cost: -1, scope: 0 }, effects: { cost: 25 * M, scope: 0.005, satisfaction: 0.05, stakeholder: { find: ['cultur', 'communit', 'provinc'], d: 0.2 } }, outcome: 'The screens become the most photographed spot in the airport.', score: 3 },
      { label: 'Decline — fit-out is fixed', tradeoff: { stakeholders: -1, scope: 1 }, effects: { stakeholder: { find: ['cultur', 'communit', 'provinc'], d: -0.1 } }, outcome: 'A missed chance to build local pride.', score: 1 },
    ],
  },
  {
    id: 'D31',
    title: 'Everybody wants a weekly report',
    text: 'Eighteen stakeholder groups now ask for a weekly progress report. The team spends a day a week writing them, and still some say they are "never informed".',
    week: 12, clo: 'CLO3', domain: 'Communications',
    lesson: 'Channels grow as n(n−1)/2. Tailor the communications plan by power/interest: manage closely, keep satisfied, keep informed, monitor.',
    trigger: { phase: ['planning', ...EXEC], minDay: 70, chance: 0.4 },
    options: [
      { label: 'Tailor the communications plan by power/interest and use a live dashboard', tradeoff: { stakeholders: 2, time: 1 }, effects: { satisfaction: 0.05, welfare: 0.02 }, outcome: 'Fewer reports, better informed stakeholders. The PMO saves a day a week.', score: 3 },
      { label: 'Send the full report to everyone', tradeoff: { stakeholders: 0, time: -1 }, effects: { days: 1, welfare: -0.02 }, outcome: 'Information overload — the important messages get lost.', score: 1 },
      { label: 'Switch everyone to a monthly newsletter', tradeoff: { stakeholders: -1, time: 1 }, effects: { satisfaction: -0.03 }, outcome: 'High-power stakeholders feel ignored.', score: 0 },
    ],
  },
  {
    id: 'D32',
    title: 'ORAT passenger trials',
    text: 'Operational readiness (ORAT) proposes three days of full trials with 500 volunteer passengers, real bags and mock flights before opening.',
    week: 15, clo: 'CLO1', domain: 'Closing',
    lesson: 'Operational readiness proves that the output delivers the outcome. Trials surface defects while they are still cheap to fix.',
    trigger: { phase: ['executing', 'monitoring', 'closing'], wbs: { id: '11', min: 0.1, max: 0.95 }, chance: 0.7 },
    options: [
      { label: 'Run the full trials with volunteers', tradeoff: { quality: 2, cost: -1, time: -1 }, effects: { cost: 30 * M, days: 3, quality: 0.04, satisfaction: 0.03 }, outcome: 'Forty snags found — including a baggage-belt jam — all closed before opening.', score: 3 },
      { label: 'Table-top exercise only', tradeoff: { cost: 1, risk: -1 }, effects: { risk: { find: ['opera', 'readiness', 'orat', 'it'], dp: 0.1 } }, outcome: 'Cheaper; the baggage jam happens on opening day instead.', score: 1 },
    ],
  },
  {
    id: 'D33',
    title: 'Operator asks for more training before handover',
    text: 'The airport operator\'s team says six weeks of familiarisation is not enough for the new baggage system and the AGL control panel.',
    week: 15, clo: 'CLO3', domain: 'Closing',
    lesson: 'Transition is part of the project. Benefits are realised by the operating organisation — invest in their readiness.',
    trigger: { phase: ['executing', 'monitoring', 'closing'], wbs: { id: '12.2', max: 0.6 }, minDay: 300, chance: 0.6 },
    options: [
      { label: 'Extend the transition with vendor-led training and shadow operations', tradeoff: { time: -1, stakeholders: 2, quality: 1 }, effects: { days: 7, cost: 25 * M, stakeholder: { find: ['operator', 'airport author'], d: 0.2 } }, outcome: 'Operations open smoothly. The operator signs the acceptance certificate.', score: 3 },
      { label: 'Hand over on the baseline date', tradeoff: { time: 1, stakeholders: -2, risk: -1 }, effects: { stakeholder: { find: ['operator', 'airport author'], d: -0.2 }, risk: { find: ['opera', 'readiness', 'handover'], dp: 0.1 } }, outcome: 'On time — and a month of teething troubles follows.', score: 0 },
    ],
  },
  {
    id: 'D34',
    title: 'Lessons-learned workshop',
    text: 'At phase closure the team is exhausted and the sponsor wants to skip the lessons-learned workshop "to save time".',
    week: 15, clo: 'CLO1', domain: 'Closing',
    lesson: 'Lessons learned are captured throughout and consolidated at closure into the organisational process assets (OPAs) — the next project starts smarter.',
    trigger: { phase: ['monitoring', 'closing'], wbs: { id: '12.4', max: 0.9 }, minDay: 300, chance: 0.7 },
    options: [
      { label: 'Run a facilitated, blameless lessons workshop and update the OPAs', tradeoff: { time: 0, stakeholders: 1, quality: 1 }, effects: { cost: 3 * M, satisfaction: 0.02 }, outcome: 'Twenty-four lessons logged, five process changes adopted by the PMO.', score: 3 },
      { label: 'Circulate a survey form instead', tradeoff: { time: 1 }, effects: {}, outcome: 'Six responses arrive. Most are complaints about parking.', score: 1 },
      { label: 'Skip it', tradeoff: { time: 1, quality: -1 }, effects: { quality: -0.01 }, outcome: 'The same mistakes will be made at the next airport.', score: 0 },
    ],
  },
  {
    id: 'D35',
    title: 'Monte Carlo says P80 is late',
    text: 'The latest Monte Carlo simulation puts the P80 completion date 40 days after the committed opening. The sponsor has only seen the deterministic date.',
    week: 10, clo: 'CLO2', domain: 'Risk',
    lesson: 'A single-point date hides uncertainty. Communicate confidence levels and size schedule reserves from the simulation.',
    trigger: { phase: EXEC, minDay: 240, chance: 0.3 },
    options: [
      { label: 'Brief the sponsor on P50/P80 and agree a schedule reserve', tradeoff: { stakeholders: 1, risk: 2 }, effects: { satisfaction: 0.02 }, outcome: 'The sponsor appreciates the honesty and funds targeted risk responses.', score: 3 },
      { label: 'Crash the top tornado-chart drivers', tradeoff: { time: 1, cost: -2 }, effects: { days: -8, cost: 190 * M }, outcome: 'P80 moves 15 days earlier.', score: 2 },
      { label: 'Report the deterministic date only', tradeoff: { stakeholders: -1, risk: -2 }, effects: { risk: { find: ['schedule', 'delay'], dp: 0.1 } }, outcome: 'The surprise arrives later — and is bigger.', score: 0 },
    ],
  },
  {
    id: 'D36',
    title: 'Waterlogged clay in the earthworks',
    text: 'Borrow-pit clay is wetter than the geotechnical report assumed. Compaction tests keep failing and the earthworks productivity has halved.',
    week: 5, clo: 'CLO2', domain: 'Schedule',
    lesson: 'Assumptions belong in the assumption log and must be validated. When one fails, re-estimate with the new information.',
    trigger: { phase: EXEC, wbs: { id: '3.2', min: 0.05, max: 0.85 }, chance: 0.6 },
    options: [
      { label: 'Lime-stabilise the subgrade', tradeoff: { cost: -1, quality: 2, time: 0 }, effects: { cost: 120 * M, days: 2, quality: 0.03 }, outcome: 'Compaction passes first time. A stronger subgrade lowers long-term maintenance.', score: 3 },
      { label: 'Spread and dry the clay before compaction', tradeoff: { time: -2, cost: 0 }, effects: { days: 14 }, outcome: 'Works only in dry weather; two weeks lost.', score: 1 },
      { label: 'Import granular fill from a distant quarry', tradeoff: { cost: -2, time: 1, quality: 1 }, effects: { cost: 260 * M, days: -2, quality: 0.01 }, outcome: 'Fast and reliable, but haulage dominates the cost report.', score: 2 },
    ],
  },
  {
    id: 'D37',
    title: 'Conflict between civil and MEP leads',
    text: 'The civil and MEP package leads argue in every coordination meeting about who caused the late duct openings in the terminal slabs.',
    week: 12, clo: 'CLO3', domain: 'Team',
    lesson: 'Of the five conflict modes, collaborating/problem-solving addresses root causes; forcing or withdrawing only defers them.',
    trigger: { phase: EXEC, wbs: { id: '7.7', min: 0.01, max: 0.7 }, chance: 0.45 },
    options: [
      { label: 'Facilitate a joint problem-solving session with a clash-detection review', tradeoff: { time: 0, quality: 1, stakeholders: 1 }, effects: { cost: 4 * M, welfare: 0.05, quality: 0.01 }, outcome: 'BIM clash review finds 31 conflicts. A shared look-ahead is agreed.', score: 3 },
      { label: 'Decide yourself and impose the solution', tradeoff: { time: 1, stakeholders: -1 }, effects: { welfare: -0.03 }, outcome: 'Quick, but the losing side disengages.', score: 1 },
      { label: 'Let them sort it out', tradeoff: { time: -1, quality: -1 }, effects: { days: 5, welfare: -0.05 }, outcome: 'The argument festers; openings are cored later at extra cost.', score: 0 },
    ],
  },
  {
    id: 'D38',
    title: 'Sub-contractor wants a T&M contract',
    text: 'The terminal IT cabling sub-contractor says the scope is too uncertain for fixed price and asks to switch to time-and-materials.',
    week: 11, clo: 'CLO3', domain: 'Procurement',
    lesson: 'Uncertain scope favours cost-reimbursable or T&M with a not-to-exceed cap; well-defined scope favours fixed price.',
    trigger: { phase: EXEC, wbs: { id: '10', min: 0.05, max: 0.8 }, chance: 0.4 },
    options: [
      { label: 'Agree T&M with a not-to-exceed cap and weekly timesheet audits', tradeoff: { cost: 0, risk: 1, stakeholders: 1 }, effects: { cost: 15 * M, stakeholder: { find: ['contractor', 'supplier', 'vendor'], d: 0.05 } }, outcome: 'Fair risk sharing with a ceiling protects the budget.', score: 3 },
      { label: 'Uncapped T&M', tradeoff: { cost: -2, risk: -2 }, effects: { cost: 70 * M, risk: { find: ['cost', 'overrun', 'budget'], dp: 0.08 } }, outcome: 'Hours creep up each month.', score: 0 },
      { label: 'Refine the scope first, then re-price as fixed price', tradeoff: { time: -1, scope: 1, risk: 1 }, effects: { days: 5 }, outcome: 'Two weeks of design detail produce a firm, lower price.', score: 2 },
    ],
  },
];

/* ------------------------------------------------------------- scheduler */

function matchesKeywords(text, keys) {
  const t = String(text || '').toLowerCase();
  return keys.some((k) => t.includes(k));
}

function inWindow(doy, win) {
  if (!win) return false;
  const [a, b] = win;
  return a <= b ? doy >= a && doy <= b : doy >= a || doy <= b;
}

/**
 * Does `event` match the decision context?
 * ctx = { day, phase, pct(id) → 0..1, weather:'clear'|…, recentRisks:[titles] }
 */
export function triggerMatches(event, ctx) {
  const t = event.trigger || {};
  if (t.minDay !== undefined && ctx.day < t.minDay) return false;
  if (t.maxDay !== undefined && ctx.day > t.maxDay) return false;
  if (t.phase && !t.phase.includes(ctx.phase)) return false;
  if (t.wbs) {
    const v = ctx.pct ? ctx.pct(t.wbs.id) : 0;
    if (t.wbs.min !== undefined && v < t.wbs.min) return false;
    if (t.wbs.max !== undefined && v > t.wbs.max) return false;
    if (t.wbs.min === undefined && v <= 0 && t.wbs.max === undefined) return false;
  }
  // Environmental triggers: any one of weather / season / realised risk opens the card.
  if (t.weather || t.season || t.riskOccurred) {
    const w = t.weather && t.weather.includes(ctx.weather);
    const s = t.season && inWindow(dayOfYear(ctx.day), t.season);
    const r = t.riskOccurred && (ctx.recentRisks || []).some((title) => matchesKeywords(title, t.riskOccurred));
    if (!w && !s && !r) return false;
  }
  return true;
}

/** Weather or a realised risk makes an environmental card much more likely to fire today. */
function urgency(event, ctx) {
  const t = event.trigger || {};
  if (t.weather && t.weather.includes(ctx.weather)) return 2.2;
  if (t.riskOccurred && (ctx.recentRisks || []).some((title) => matchesKeywords(title, t.riskOccurred))) return 2.2;
  return 1;
}

/**
 * Deterministic card scheduler. Given the same seed, difficulty and sequence of
 * contexts it always produces the same cards on the same days.
 */
export class DecisionScheduler {
  constructor({ seed = 20270104, difficulty = 'professional', events = DECISIONS } = {}) {
    this.seed = seed >>> 0;
    this.difficulty = difficulty;
    this.events = events;
    this.rng = createRng(this.seed ^ hashString('decisions'));
    this.shown = [];
    this.lastDay = -Infinity;
  }

  get settings() {
    return difficultyOf(this.difficulty);
  }

  /** Base daily probability that an eligible card fires (≈ one card per `gap` days). */
  dailyChance() {
    return Math.min(0.5, 0.11 * this.settings.freq);
  }

  /** Called once per project day; returns an event to show, or null. */
  next(ctx) {
    if (ctx.day - this.lastDay < this.settings.gap) return null;
    const shown = new Set(this.shown);
    const pool = this.events.filter((e) => !shown.has(e.id) && triggerMatches(e, ctx));
    if (!pool.length) return null;
    // One draw for "does anything happen today", then a weighted pick.
    const gate = this.rng();
    const best = Math.max(...pool.map((e) => urgency(e, ctx)));
    if (gate > this.dailyChance() * best) return null;
    const weights = pool.map((e) => (e.trigger.chance === undefined ? 0.5 : e.trigger.chance) * urgency(e, ctx));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return this.mark(pool[i], ctx.day);
    }
    return this.mark(pool[pool.length - 1], ctx.day);
  }

  mark(event, day) {
    if (!this.shown.includes(event.id)) this.shown.push(event.id);
    this.lastDay = day;
    return event;
  }

  serialise() {
    return { seed: this.seed, difficulty: this.difficulty, rng: this.rng.getState(), shown: [...this.shown], lastDay: Number.isFinite(this.lastDay) ? this.lastDay : null };
  }

  restore(data) {
    if (!data) return;
    if (typeof data.rng === 'number') this.rng.setState(data.rng);
    this.shown = Array.isArray(data.shown) ? [...data.shown] : [];
    this.lastDay = typeof data.lastDay === 'number' ? data.lastDay : -Infinity;
    if (data.difficulty) this.difficulty = data.difficulty;
  }
}

/* ---------------------------------------------------------------- effects */

const HARM_SIGN = { days: 1, cost: 1, quality: -1, safety: -1, satisfaction: -1, welfare: -1 };

/** Scale the harmful part of an effect by the difficulty strength (benefits are left alone). */
export function scaleEffects(effects = {}, strength = 1) {
  const out = {};
  for (const [k, v] of Object.entries(effects)) {
    if (typeof v === 'number' && HARM_SIGN[k]) {
      const harmful = Math.sign(v) === HARM_SIGN[k];
      const scaled = harmful ? v * strength : v;
      out[k] = k === 'days' ? Math.round(scaled) : scaled;
    } else if (k === 'risk' && v && typeof v.dp === 'number') {
      out.risk = { ...v, dp: v.dp > 0 ? v.dp * strength : v.dp };
    } else if (k === 'stakeholder' && v && typeof v.d === 'number') {
      out.stakeholder = { ...v, d: v.d < 0 ? v.d * strength : v.d };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Turn `find` keywords into concrete register ids. Unmatched parts degrade gracefully. */
export function resolveEffects(effects, project) {
  const out = { ...effects };
  if (effects.risk) {
    const r = effects.risk;
    let id = r.id;
    if (!id && r.find && project && Array.isArray(project.risks)) {
      const hit = project.risks.find((x) => matchesKeywords(`${x.title} ${x.category} ${x.rbs || ''} ${x.weather || ''}`, r.find));
      id = hit ? hit.id : null;
    }
    if (id) out.risk = { id, dp: r.dp };
    else delete out.risk;
  }
  if (effects.stakeholder) {
    const s = effects.stakeholder;
    let id = s.id;
    if (!id && s.find && project && Array.isArray(project.stakeholders)) {
      const hit = project.stakeholders.find((x) => matchesKeywords(`${x.role} ${x.group} ${x.needs || ''}`, s.find));
      id = hit ? hit.id : null;
    }
    if (id) out.stakeholder = { id, d: s.d };
    else {
      delete out.stakeholder;
      out.satisfaction = (out.satisfaction || 0) + s.d * 0.25;
    }
  }
  return out;
}

/** Plain-language summary of an option's trade-offs (for MEHRAN / screen readers). */
export function describeTradeoff(tradeoff = {}) {
  const words = { time: 'schedule', cost: 'cost', quality: 'quality', risk: 'risk', stakeholders: 'stakeholders', safety: 'safety', scope: 'scope' };
  return Object.entries(tradeoff)
    .filter(([, v]) => v)
    .map(([k, v]) => `${words[k] || k} ${v > 0 ? '+'.repeat(v) : '−'.repeat(-v)}`)
    .join(', ');
}
