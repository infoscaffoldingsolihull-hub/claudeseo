/**
 * Missions — the lifecycle campaign of SKY GATEWAY HYDERABAD.
 *
 * PURE JS (no DOM, no THREE): runs under `node --test`.
 *
 * Each mission belongs to a lifecycle phase (Initiating → Closing), carries CLO
 * tags and a course week, and is made of objectives whose `check(ctx)` reads the
 * live project through `projectContext()`. Objectives may also define
 * `fail(ctx)`: once true the mission is failed (the coaching hints explain why).
 * MEHRAN quotes `hints` when the student asks for help.
 *
 * Everything here reads the Project API documented in docs/ARCHITECTURE.md §5
 * defensively, so a missing field never throws — it just leaves the objective open.
 */

export const PHASES = ['initiating', 'planning', 'executing', 'monitoring', 'closing'];
export const PHASE_RANK = { initiating: 0, planning: 1, executing: 2, monitoring: 2, closing: 3 };
export const PHASE_LABEL = {
  initiating: 'Initiating', planning: 'Planning', executing: 'Executing', monitoring: 'Monitoring & Controlling', closing: 'Closing',
};

/** WBS elements whose SPI / satisfaction history the director tracks while they are in progress. */
export const TRACK_WINDOWS = ['2.3', '3.2', '3.5', '7.3', '7.4', '8.7', '11'];

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** Indices may arrive as 0..1 or 0..100 — normalise to 0..1. */
const unit = (v, d) => {
  const n = num(v, d);
  return n > 1.5 ? n / 100 : n;
};
const safe = (fn, d) => {
  try {
    const v = fn();
    return v === undefined || v === null ? d : v;
  } catch {
    return d;
  }
};

const DONE_PROCUREMENT = ['Awarded', 'Delivering', 'Closed'];
const DECIDED_CHANGES = ['Approved', 'Rejected', 'Implemented'];

/** Fresh tracking record kept by the GameDirector (serialised with the game). */
export function createTrack() {
  return {
    minSpi: {},          // wbsId → lowest SPI seen while the element was in progress
    minSat: {},          // wbsId → lowest stakeholder satisfaction seen while in progress
    panels: [],          // panel ids opened
    poi: 0,              // points of interest inspected
    changesDecided: 0,   // change:decided events
    changesRejected: 0,
    quiz: {},            // setId → { best, total, byClo:{CLO1:[c,t]…} }
    decisions: 0,        // decision cards resolved
    goodDecisions: 0,    // resolved with best-practice option (score 3)
    ethics: null,        // true (refused bribe) | false (accepted) | null
    risksOccurred: 0,
    recentRisks: [],     // [{ day, title }]
    weatherSeen: {},     // kind → days observed
    milestones: 0,
    riskSeries: [],      // [{ day, exposure }] sampled every 14 days
    minSafety: 1,
    lessonsLogged: 0,
  };
}

/** Budget-weighted completion of a leaf or summary WBS element (0..1). */
export function wbsPct(project, id) {
  if (!project || !id) return 0;
  const st = project.state;
  const get = (k) => (st && typeof st.get === 'function' ? st.get(k) : st ? st[k] : undefined);
  const own = get(id);
  if (own && typeof own.pct === 'number') return unit(own.pct, 0);
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  const kids = tasks.filter((t) => t.id === id || String(t.id).startsWith(`${id}.`));
  if (kids.length) {
    let w = 0;
    let s = 0;
    for (const t of kids) {
      const weight = num(t.budget, 1) || 1;
      const ts = get(t.id);
      w += weight;
      s += weight * unit(ts && ts.pct, 0);
    }
    return w ? s / w : 0;
  }
  const ws = safe(() => project.worldState(), null);
  return ws && ws.pct ? unit(ws.pct[id], 0) : 0;
}

/**
 * The read-only view missions, badges and the scheduler use.
 * `game` is the GameDirector (or any object with `track`, `missions`, `badges`, `xp`).
 */
export function projectContext(project, game = {}) {
  const p = project || {};
  const snap = safe(() => p.snapshot(), {}) || {};
  const track = game.track || createTrack();
  const gates = Array.isArray(p.gates) ? p.gates : [];
  const stakeholders = Array.isArray(p.stakeholders) ? p.stakeholders : [];
  const procurement = Array.isArray(p.procurement) ? p.procurement : [];
  const changes = Array.isArray(p.changes) ? p.changes : [];
  const ncrs = safe(() => p.quality.ncrs, []);
  const agile = p.agile || {};
  const sprints = Array.isArray(agile.sprints) ? agile.sprints : [];
  const doneSprints = sprints.filter((s) => s && (num(s.completed, null) !== null) && (s.endDay === undefined || s.endDay <= num(p.day, 0)));
  const velocity = Array.isArray(agile.velocity) ? agile.velocity : [];
  const ceremonies = Array.isArray(agile.ceremonies) ? agile.ceremonies : [];
  const phase = p.phase || snap.phase || 'initiating';
  const sats = stakeholders.map((s) => unit(s.satisfaction, 0.6));

  const ctx = {
    project: p,
    snap,
    track,
    game,
    day: num(p.day, num(snap.day, 0)),
    phase,
    phaseRank: PHASE_RANK[phase] === undefined ? 0 : PHASE_RANK[phase],
    finished: !!(p.finished || snap.finished),
    progress: unit(snap.progress, 0),
    spi: num(snap.spi, 1),
    cpi: num(snap.cpi, 1),
    quality: unit(num(snap.qualityIndex, p.qualityIndex), 1),
    safety: unit(num(snap.safety, p.safety), 1),
    welfare: unit(num(snap.welfare, p.welfare), 1),
    satisfaction: unit(num(snap.stakeholderSatisfaction, p.stakeholderSatisfaction), sats.length ? sats.reduce((a, b) => a + b, 0) / sats.length : 0.6),
    minStakeholderSatisfaction: sats.length ? Math.min(...sats) : 0.6,
    riskExposure: num(snap.riskExposure, 0),
    realisedRisks: num(snap.realisedRisks, track.risksOccurred),
    incidents: num(snap.incidents, Array.isArray(p.incidents) ? p.incidents.length : num(p.incidents, 0)),
    weather: (p.weather && p.weather.kind) || (snap.weather && snap.weather.kind) || snap.weather || 'clear',
    openNcrs: ncrs.filter((n) => n && !/closed/i.test(String(n.status || ''))).length,
    totalNcrs: ncrs.length,
    changesDecided: Math.max(track.changesDecided, changes.filter((c) => DECIDED_CHANGES.includes(c.status)).length),
    changesRejected: Math.max(track.changesRejected, changes.filter((c) => c.status === 'Rejected').length),
    awarded: procurement.filter((x) => DONE_PROCUREMENT.includes(x.status)).length,
    procurementTotal: procurement.length,
    sprintsDone: doneSprints.length,
    lastVelocity: num(velocity[velocity.length - 1], doneSprints.length ? num(doneSprints[doneSprints.length - 1].completed, 0) : 0),
    lastCommitted: doneSprints.length ? num(doneSprints[doneSprints.length - 1].committed, 0) : 0,
    reviews: ceremonies.filter((c) => /review/i.test(String(c.kind))).length,
    lessons: Math.max(Array.isArray(p.lessons) ? p.lessons.length : 0, track.lessonsLogged),
    recentRisks: track.recentRisks.map((r) => r.title),
    pct: (id) => wbsPct(p, id),
    gate(id) {
      const g = gates.find((x) => x.id === id);
      return g ? g.status : 'pending';
    },
    /** Gate approved by id, or (fallback) any gate of that phase approved. */
    gateApproved(id, phaseFallback) {
      const g = gates.find((x) => x.id === id);
      if (g) return g.status === 'approved';
      return !!phaseFallback && gates.some((x) => x.phase === phaseFallback && x.status === 'approved');
    },
    gatesApproved: gates.filter((g) => g.status === 'approved').length,
    gatesTotal: gates.length,
    minSpi: (id) => num(track.minSpi[id], null),
    minSat: (id) => num(track.minSat[id], null),
    panelOpened: (id) => track.panels.includes(id),
    quizBest(setId) {
      const q = track.quiz[setId];
      return q && q.total ? q.best / q.total : 0;
    },
    quizSets: Object.keys(track.quiz).length,
    quizMastery() {
      const vals = Object.values(track.quiz).filter((q) => q.total);
      return vals.length ? vals.reduce((a, q) => a + q.best / q.total, 0) / vals.length : 0;
    },
    missionsCompleted: Array.isArray(game.missions) ? game.missions.filter((m) => m.status === 'completed').length : 0,
  };
  return ctx;
}

/* ------------------------------------------------------------- missions */

export const MISSIONS = [
  {
    id: 'M01', name: 'Charter the Gateway', phase: 'initiating', clo: ['CLO1'], week: 1, xp: 150,
    brief: 'Hyderabad has a 2,133 m runway and a closed terminal. Before anything is built, the programme needs a sponsor-signed charter, a business case and a first look at the site.',
    objectives: [
      { id: 'o1', text: 'Read the project charter (open the Charter panel)', check: (c) => c.panelOpened('charter') },
      { id: 'o2', text: 'Inspect two points of interest on a site walk (mode 1, press E)', check: (c) => c.track.poi >= 2 },
      { id: 'o3', text: 'Approve gate G0 — Charter & business case', check: (c) => c.gateApproved('G0', 'initiating') },
    ],
    hints: [
      'A charter authorises the project and the project manager. Without G0 nothing downstream is legitimate.',
      'The site walk is how you find the EEFs: encroachment, drainage, heat, an old terminal. Write them into the assumption log.',
    ],
  },
  {
    id: 'M02', name: 'Map the Stakeholders', phase: 'initiating', clo: ['CLO3'], week: 12, xp: 150,
    brief: 'Airport authority, regulator, airlines, district administration, residents, unions, the media. Identify them before they identify you.',
    objectives: [
      { id: 'o1', text: 'Open the Stakeholders panel (power/interest grid)', check: (c) => c.panelOpened('stakeholders') },
      { id: 'o2', text: 'Average stakeholder satisfaction ≥ 60 %', check: (c) => c.satisfaction >= 0.6 },
      { id: 'o3', text: 'No stakeholder below 35 % satisfaction', check: (c) => c.minStakeholderSatisfaction >= 0.35 },
    ],
    hints: [
      'Manage closely the high-power, high-interest group; keep the high-power, low-interest group satisfied.',
      'Engagement levels move from unaware → resistant → neutral → supportive → leading. Plan the gap.',
    ],
  },
  {
    id: 'M03', name: 'Baseline the Plan', phase: 'planning', clo: ['CLO2'], week: 5, xp: 200,
    brief: 'Scope, schedule and cost baselines make up the performance measurement baseline. Find the critical path, check the PERT confidence and get the PMP approved.',
    objectives: [
      { id: 'o1', text: 'Inspect the WBS and WBS dictionary (Scope panel)', check: (c) => c.panelOpened('scope') },
      { id: 'o2', text: 'Inspect the critical path (Schedule panel)', check: (c) => c.panelOpened('schedule') },
      { id: 'o3', text: 'Approve gate G1 — Project management plan baseline', check: (c) => c.gateApproved('G1', 'planning') },
    ],
    hints: [
      'Total float zero = critical. Crashing non-critical work buys nothing.',
      'PERT mean = (O + 4M + P) / 6; σ = (P − O) / 6. Add path variances, not standard deviations.',
    ],
  },
  {
    id: 'M04', name: 'Clear the Land, Keep the Peace', phase: 'executing', clo: ['CLO3'], week: 12, xp: 250,
    brief: 'Encroachments sit inside the planned perimeter. Clear WBS 2.3 without letting any stakeholder satisfaction fall below 50 % while it is under way.',
    objectives: [
      { id: 'o1', text: 'Complete 2.3 Encroachment clearance & resettlement', check: (c) => c.pct('2.3') >= 0.999 },
      { id: 'o2', text: 'Average satisfaction stays ≥ 50 % throughout 2.3', check: (c) => c.pct('2.3') >= 0.999 && (c.minSat('2.3') === null ? c.satisfaction : c.minSat('2.3')) >= 0.5, fail: (c) => c.minSat('2.3') !== null && c.minSat('2.3') < 0.5 },
    ],
    hints: [
      'Consult and involve before you evict. A jirga and a fair package cost days; a court case costs a season.',
      'Watch the stakeholder engagement matrix while 2.3 runs — satisfaction below 50 % fails the mission.',
    ],
  },
  {
    id: 'M05', name: 'Move the Earth', phase: 'executing', clo: ['CLO2'], week: 5, xp: 250,
    brief: 'The runway extension earthworks (3.2) sit on the critical path. Keep SPI ≥ 0.95 the whole way through.',
    objectives: [
      { id: 'o1', text: 'Complete 3.2 Extension earthworks', check: (c) => c.pct('3.2') >= 0.999 },
      { id: 'o2', text: 'SPI ≥ 0.95 throughout 3.2', check: (c) => c.pct('3.2') >= 0.999 && (c.minSpi('3.2') === null ? c.spi : c.minSpi('3.2')) >= 0.95, fail: (c) => c.minSpi('3.2') !== null && c.minSpi('3.2') < 0.95 },
      { id: 'o3', text: 'CPI ≥ 0.95 when earthworks finish', check: (c) => c.pct('3.2') >= 0.999 && c.cpi >= 0.95 },
    ],
    hints: [
      'SPI = EV / PV. Falling SPI on a critical activity means a late finish unless you crash or fast-track.',
      'Crash the cheapest cost-slope activity on the critical path first; stop when another path becomes critical.',
    ],
  },
  {
    id: 'M06', name: 'Scrum the Terminal IT', phase: 'executing', clo: ['CLO1', 'CLO2'], week: 3, xp: 220,
    brief: 'WBS 10 (terminal IT, FIDS, common-use check-in) is delivered Agile inside a predictive programme. Run sprints that meet their goals.',
    objectives: [
      { id: 'o1', text: 'Complete two sprints', check: (c) => c.sprintsDone >= 2 },
      { id: 'o2', text: 'Last velocity ≥ 80 % of the commitment (and ≥ 18 points)', check: (c) => c.sprintsDone >= 1 && c.lastVelocity >= Math.min(18, 0.8 * (c.lastCommitted || 18)) },
      { id: 'o3', text: 'Hold a sprint review (open the Agile board — B)', check: (c) => c.reviews >= 1 || (c.sprintsDone >= 1 && c.panelOpened('agile')) },
    ],
    hints: [
      'Protect the sprint goal. New requests go to the product backlog, ordered by the Product Owner.',
      'Velocity is a planning tool for the team, not a performance target for management.',
    ],
  },
  {
    id: 'M07', name: 'Chair the CCB', phase: 'monitoring', clo: ['CLO2'], week: 6, xp: 220,
    brief: 'Changes will come — from airlines, officials and regulators. Run every one through integrated change control.',
    objectives: [
      { id: 'o1', text: 'Decide three change requests through the CCB', check: (c) => c.changesDecided >= 3 },
      { id: 'o2', text: 'Reject at least one change that does not fit the business case', check: (c) => c.changesRejected >= 1 },
      { id: 'o3', text: 'Keep CPI ≥ 0.9 after the changes', check: (c) => c.changesDecided >= 3 && c.cpi >= 0.9 },
    ],
    hints: [
      'Log → analyse impact (scope, time, cost, quality, risk) → CCB decides → update baselines → communicate.',
      'Saying “no” with an impact analysis is good change control, not obstruction.',
    ],
  },
  {
    id: 'M08', name: 'Zero-Defect Pavement', phase: 'executing', clo: ['CLO2'], week: 7, xp: 250,
    brief: 'The new surface course (3.5) must pass the quality gate with no open NCRs and a quality index of at least 90 %.',
    objectives: [
      { id: 'o1', text: 'Complete 3.5 Surface course', check: (c) => c.pct('3.5') >= 0.999 },
      { id: 'o2', text: 'Zero open NCRs at the gate', check: (c) => c.pct('3.5') >= 0.999 && c.openNcrs === 0 },
      { id: 'o3', text: 'Quality index ≥ 90 %', check: (c) => c.quality >= 0.9 },
    ],
    hints: [
      'A point outside the control limits, or seven in a row on one side of the mean, is a special cause — investigate it.',
      'Prevention and appraisal costs are cheaper than internal and external failure.',
    ],
  },
  {
    id: 'M09', name: 'Weighted Award', phase: 'executing', clo: ['CLO3'], week: 11, xp: 220,
    brief: 'Award the major packages by weighted scoring — price, technical, experience, schedule — with integrity.',
    objectives: [
      { id: 'o1', text: 'Evaluate bids in the Procurement panel', check: (c) => c.panelOpened('procurement') },
      { id: 'o2', text: 'Award three procurement packages', check: (c) => c.awarded >= 3 },
      { id: 'o3', text: 'Never accept an improper offer', check: (c) => c.awarded >= 3 && c.track.ethics !== false, fail: (c) => c.track.ethics === false },
    ],
    hints: [
      'Score each criterion 1–10, multiply by its weight, sum. Document why — the audit trail is the protection.',
      'Choose the contract type by scope certainty: FFP for well-defined scope, cost-reimbursable or T&M with a cap for uncertain scope.',
    ],
  },
  {
    id: 'M10', name: 'Survive the Monsoon', phase: 'executing', clo: ['CLO2', 'CLO3'], week: 10, xp: 250,
    brief: 'July to September brings cloudbursts. Finish the storm drainage (8.7) and come through the rains safely.',
    objectives: [
      { id: 'o1', text: 'Complete 8.7 Storm-water drainage', check: (c) => c.pct('8.7') >= 0.999 },
      { id: 'o2', text: 'Experience at least one rain event', check: (c) => (c.track.weatherSeen.rain || 0) >= 1 },
      { id: 'o3', text: 'Keep the safety index ≥ 85 %', check: (c) => c.safety >= 0.85 && (c.track.weatherSeen.rain || 0) >= 1 },
    ],
    hints: [
      'EMV = probability × impact. A PKR 40 m pump plan against a 30 % chance of a PKR 300 m flood loss is good value.',
      'Weather risks have triggers: when the Met office issues a warning, implement the contingency plan.',
    ],
  },
  {
    id: 'M11', name: 'Raise the Terminal', phase: 'executing', clo: ['CLO2'], week: 9, xp: 250,
    brief: 'Steel frame (7.3) and the windcatcher roof (7.4). Imported steel, PKR volatility and cranes in the wind.',
    objectives: [
      { id: 'o1', text: 'Complete 7.3 Structural steel', check: (c) => c.pct('7.3') >= 0.999 },
      { id: 'o2', text: 'Complete 7.4 Roof', check: (c) => c.pct('7.4') >= 0.999 },
      { id: 'o3', text: 'CPI ≥ 0.95 when the roof is closed', check: (c) => c.pct('7.4') >= 0.999 && c.cpi >= 0.95 },
    ],
    hints: [
      'EAC = BAC / CPI if today’s cost performance continues. TCPI tells you how efficient the rest must be.',
      'Contingency reserve is for identified risks (known-unknowns); management reserve for unknown-unknowns.',
    ],
  },
  {
    id: 'M12', name: 'The Control View', phase: 'executing', clo: ['CLO1'], week: 7, xp: 200,
    brief: 'The new tower cab (6.4) and the airfield ground lighting (5) give controllers eyes and pilots guidance.',
    objectives: [
      { id: 'o1', text: 'Complete 6.4 Tower cab', check: (c) => c.pct('6.4') >= 0.999 },
      { id: 'o2', text: 'Complete WBS 5 Airfield ground lighting', check: (c) => c.pct('5') >= 0.999 },
      { id: 'o3', text: 'Visit the tower cab or watch the tour “control view” beat', check: (c) => c.track.poi >= 4 || c.track.tourControlView === true },
    ],
    hints: [
      'Acceptance criteria for a cab: unobstructed sightlines to both thresholds and the apron, and optical glazing quality.',
    ],
  },
  {
    id: 'M13', name: 'Certify the Aerodrome', phase: 'monitoring', clo: ['CLO1', 'CLO2'], week: 7, xp: 300,
    brief: 'ORAT trials and the regulator’s aerodrome certification (11.5). The product must be fit for use, and proven so.',
    objectives: [
      { id: 'o1', text: 'Complete 11.5 Aerodrome certification', check: (c) => c.pct('11.5') >= 0.999 },
      { id: 'o2', text: 'Quality index ≥ 90 %', check: (c) => c.quality >= 0.9 },
      { id: 'o3', text: 'Safety index ≥ 90 %', check: (c) => c.safety >= 0.9 },
    ],
    hints: [
      'Validate scope = formal acceptance by the customer; control quality = checking correctness. Certification needs both.',
    ],
  },
  {
    id: 'M14', name: 'Hand Over to Operations', phase: 'closing', clo: ['CLO3'], week: 15, xp: 300,
    brief: 'Transition (12.2): train the operator, transfer documentation and warranties, and open to traffic.',
    objectives: [
      { id: 'o1', text: 'Complete 12.2 Transition to operations', check: (c) => c.pct('12.2') >= 0.999 },
      { id: 'o2', text: 'Stakeholder satisfaction ≥ 70 % at handover', check: (c) => c.pct('12.2') >= 0.999 && c.satisfaction >= 0.7 },
      { id: 'o3', text: 'Watch operations (mode 5) or open the Operations panel', check: (c) => c.panelOpened('operations') || c.track.opsVisited === true },
    ],
    hints: [
      'Outputs are what the project builds; outcomes and benefits are what the operator achieves with them.',
    ],
  },
  {
    id: 'M15', name: 'Close with Lessons Learned', phase: 'closing', clo: ['CLO1'], week: 15, xp: 350,
    brief: 'Close the contracts, release the team, archive the records and leave the next project a better organisation.',
    objectives: [
      { id: 'o1', text: 'Log at least five lessons learned', check: (c) => c.lessons >= 5 },
      { id: 'o2', text: 'Complete 12.4 Lessons learned & archive', check: (c) => c.pct('12.4') >= 0.999 },
      { id: 'o3', text: 'Project finished', check: (c) => c.finished },
    ],
    hints: [
      'Lessons learned go into the organisational process assets. Capture them all along, not just at the end.',
      'Close procurements (claims settled, final payments) before administrative closure.',
    ],
  },
  {
    id: 'M16', name: 'People First', phase: 'executing', clo: ['CLO3'], week: 12, xp: 220,
    brief: 'Heat, dust and long shifts. Keep the team safe and motivated through the first year on site.',
    objectives: [
      { id: 'o1', text: 'Reach day 365', check: (c) => c.day >= 365 },
      { id: 'o2', text: 'Welfare ≥ 75 % on day 365', check: (c) => c.day >= 365 && c.welfare >= 0.75 },
      { id: 'o3', text: 'Safety never below 80 %', check: (c) => c.day >= 365 && c.track.minSafety >= 0.8, fail: (c) => c.track.minSafety < 0.8 },
    ],
    hints: [
      'Maslow and Herzberg: pay and conditions remove dissatisfaction; recognition and growth motivate.',
      'Night shifts in May–June protect people and concrete alike.',
    ],
  },
];

/** Deep-ish copy with live status for a director instance. */
export function instantiateMissions() {
  return MISSIONS.map((m) => ({
    ...m,
    status: 'locked',
    completedDay: null,
    objectives: m.objectives.map((o) => ({ ...o, done: false })),
  }));
}

/**
 * Evaluate missions against a context. Mutates statuses; returns the list of
 * missions that changed to 'completed' or 'failed' in this call.
 */
export function evaluateMissions(missions, ctx) {
  const changed = [];
  for (const m of missions) {
    if (m.status === 'completed' || m.status === 'failed') continue;
    if (m.status === 'locked') {
      if ((PHASE_RANK[m.phase] || 0) <= ctx.phaseRank) m.status = 'active';
      else continue;
    }
    let all = true;
    for (const o of m.objectives) {
      if (!o.done) {
        let ok = false;
        try { ok = !!o.check(ctx); } catch { ok = false; }
        if (ok) o.done = true;
      }
      if (!o.done) all = false;
      let failed = false;
      if (!o.done && o.fail) {
        try { failed = !!o.fail(ctx); } catch { failed = false; }
      }
      if (failed) {
        m.status = 'failed';
        m.completedDay = ctx.day;
        changed.push(m);
        all = false;
        break;
      }
    }
    if (all && m.status === 'active') {
      m.status = 'completed';
      m.completedDay = ctx.day;
      changed.push(m);
    }
  }
  return changed;
}

/** Coaching lines MEHRAN can quote for the currently active missions. */
export function coachingHints(missions) {
  const out = [];
  for (const m of missions) {
    if (m.status !== 'active') continue;
    const open = m.objectives.find((o) => !o.done);
    out.push({ mission: m.id, name: m.name, next: open ? open.text : null, hint: m.hints[0], hints: m.hints });
  }
  return out;
}
