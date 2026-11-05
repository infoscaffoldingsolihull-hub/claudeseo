import {
  M, SIMULATED, PROJECT_INFO, SUMMARY_PACKAGES, WBS_LEAVES, MILESTONES, GATES, RESOURCE_TYPES, RISK_REGISTER,
  STAKEHOLDER_REGISTER, PROCUREMENT_PACKAGES, REQUIREMENTS, RACI_ROLES, RACI_ROWS, COMMS_PLAN, CLIMATE,
  WEATHER_FACTORS, WEATHER_LABELS, DIFFICULTY, QUALITY_METRICS, DEFECT_CATEGORIES, CHANGE_TEMPLATES,
  BUSINESS_CASE, EPIC_NAMES, buildBacklog, buildWbsTree,
} from './model.js';
import { computeCPM, pertDuration, pertSigma, pertAnalysis, crashCandidates, costSlope } from './cpm.js';
import { evmMetrics, earnedSchedule, buildPvCurve } from './evm.js';
import { emv, riskScore, probabilityScore, impactScore, THREAT_STRATEGIES, OPPORTUNITY_STRATEGIES } from './risk.js';
import { pareto } from './quality.js';
import { channels, gridQuadrant, salience, engagementLabel } from './comms.js';
import { weightedScore, contractOutcome, DEFAULT_WEIGHTS } from './procurement.js';
import { CCB_MEMBERS, ruleVote, tallyVotes } from './change.js';
import { planSprint, velocityStats, burndownSeries } from './agile.js';
import { samplePert } from './montecarlo.js';

/**
 * The Hyderabad Airport Revival & Expansion Programme as a living project.
 *
 * Holds the scope, schedule and cost baselines and simulates execution one
 * day at a time:
 *
 *   weather → eligibility (CPM links, gates, procurement) → resource demand &
 *   staffing → modifiers (weather, welfare, supply, vendor, inspection,
 *   productivity) → progress & cost (EV, materials, quality sampling, Scrum
 *   sprints) → labour → consumables → risk, safety & stakeholders →
 *   procurement & change control → gates & phase → EVM record / re-forecast.
 *
 * Every modifier is 1.0 at the planned condition, the weather work factors
 * are normalised to the Hyderabad climatology the estimates assume, and
 * auto-staffing matches demand exactly — so a manager who follows the plan
 * sees SPI ≈ CPI ≈ 1.00 and every variance is the result of risk, weather,
 * uncertainty or their own decisions. All data are simulated.
 */

const VERSION = 1;
const DAY_MS = 86400000;
const PHASES = ['initiating', 'planning', 'executing', 'monitoring', 'closing'];
const OUTDOOR = new Set(['earth', 'asphalt', 'outdoor', 'height']);
const CRASH_PREMIUM = { office: 0.06, indoor: 0.1, earth: 0.08, asphalt: 0.12, outdoor: 0.1, height: 0.14 };
const ENGAGE_ACTIONS = {
  inform: { cost: 2, gain: 0.03, cap: 3 },
  consult: { cost: 4, gain: 0.05, cap: 3 },
  involve: { cost: 6, gain: 0.07, cap: 4 },
  collaborate: { cost: 10, gain: 0.09, cap: 4 },
  empower: { cost: 15, gain: 0.11, cap: 5 },
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class Project {
  constructor({ seed = 20270104, difficulty = 'professional', approach = 'hybrid' } = {}) {
    this.seed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 20270104;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'professional';
    this.approach = ['predictive', 'agile', 'hybrid'].includes(approach) ? approach : 'hybrid';
    this.diff = DIFFICULTY[this.difficulty];
    this.info = PROJECT_INFO;
    this.simulated = SIMULATED;
    this.rngState = this.seed;
    this.startDate = new Date(PROJECT_INFO.startDate);
    this.onLog = null;
    this.events = [];
    this.serial = { event: 0, issue: 0, decision: 0, lesson: 0, ncr: 0, change: 0, claim: 0, incident: 0 };

    this._buildScope();
    this.baselineTasks = this._snapshotTasks();
    this.baselineVersion = 1;
    this._buildBaseline();
    this._buildResources();
    this._buildWeatherNorms();
    this._buildRegisters();
    this._initState();
    this._recomputeForecast();
    this._recordEvm();
    this.log('info', 'Programme chartering started',
      `${PROJECT_INFO.name}. Baseline ${this.baselineDuration} days (finish ${this.dateLabel(this.baselineDuration)}), BAC PKR ${(this.bac / 1e9).toFixed(1)} bn. ${SIMULATED}.`);
  }

  /* ================================================================ RNG */

  rng() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ============================================================ BASELINE */

  _buildScope() {
    const rate = Object.fromEntries(RESOURCE_TYPES.map((r) => [r.id, r.dayRate]));
    this.tasks = [];
    for (const s of SUMMARY_PACKAGES) {
      for (const l of WBS_LEAVES.filter((x) => x.id.split('.')[0] === s.id)) {
        const duration = Math.round(pertDuration(l.o, l.m, l.p));
        const agile = s.id === '10' && !['10.1', '10.6'].includes(l.id) && this.approach !== 'predictive';
        const dailyLabour = Object.entries(l.crew).reduce((a, [k, n]) => a + n * (rate[k] || 0), 0);
        const labourBudget = dailyLabour * duration;
        const premium = (agile ? 0.25 : CRASH_PREMIUM[l.cls] || 0.1);
        const task = {
          id: l.id, code: l.id, name: l.name, summaryId: s.id,
          o: l.o, m: l.m, p: l.p, duration, sigma: pertSigma(l.o, l.p),
          predecessors: l.predecessors.map((x) => ({ ...x })),
          budget: l.budget, crew: { ...l.crew },
          crashDuration: Math.max(1, Math.round(duration * (agile ? 0.85 : 0.8))),
          crashCost: Math.round(l.budget * (1 + premium)),
          costSlope: 0,
          delivery: agile ? 'agile' : 'predictive', milestone: false, gate: null,
          dictionary: { ...l.dictionary, deliverables: [...l.dictionary.deliverables], risks: [] },
          clo: l.clo, domain: l.domain, cls: l.cls, mat: l.mat, q: l.q, dc: l.dc,
          dailyLabour, labourBudget, materialBudget: Math.max(0, l.budget - labourBudget),
        };
        task.costSlope = costSlope(task);
        this.tasks.push(task);
      }
      for (const ms of MILESTONES.filter((x) => x.summaryId === s.id)) {
        this.tasks.push({
          id: ms.id, code: ms.id, name: ms.name, summaryId: s.id, o: 0, m: 0, p: 0, duration: 0, sigma: 0,
          predecessors: ms.predecessors.map((x) => ({ ...x })), budget: 0, crew: {},
          crashDuration: 0, crashCost: 0, costSlope: null, delivery: 'predictive', milestone: true, gate: ms.gate || null,
          dictionary: { description: ms.name, deliverables: [], acceptance: ms.gate ? 'Gate approved by the sponsor.' : 'All predecessor deliverables accepted.', owner: 'Project Director', assumptions: '', risks: [] },
          clo: ['CLO2'], domain: 'Schedule', cls: 'office', mat: 'local', q: [], dc: 'Documentation',
          dailyLabour: 0, labourBudget: 0, materialBudget: 0,
        });
      }
    }
    this.taskById = new Map(this.tasks.map((t) => [t.id, t]));
    this.wbs = buildWbsTree();
    // Topological order for the daily loop (links never change endpoints).
    const cpm = computeCPM(this.tasks);
    this.topo = cpm.order.map((id) => this.taskById.get(id));
  }

  _snapshotTasks() {
    return this.tasks.map((t) => ({ id: t.id, duration: t.duration, budget: t.budget, o: t.o, p: t.p, predecessors: t.predecessors.map((x) => ({ ...x })) }));
  }

  _buildBaseline() {
    const bt = this.baselineTasks;
    const cpm = computeCPM(bt);
    this.baseline = { nodes: cpm.nodes, duration: cpm.duration, criticalPath: cpm.criticalPath, drivingPath: cpm.drivingPath, order: cpm.order };
    this.baselineDuration = Math.ceil(cpm.duration);
    this.bac = bt.reduce((s, t) => s + t.budget, 0);
    this.baselineBudget = new Map(bt.map((t) => [t.id, t.budget]));
    this.pvCurve = buildPvCurve(bt.map((t) => ({ start: cpm.nodes.get(t.id).es, finish: cpm.nodes.get(t.id).ef, budget: t.budget })), this.baselineDuration);
    const pa = pertAnalysis(cpm, bt, this.baselineDuration);
    this.pert = { mean: pa.mean, sigma: pa.sigma, pathSigma: pa.pathSigma, variance: pa.variance, probabilityBy: pa.probabilityBy, atConfidence: pa.atConfidence };
    this.milestones = this.tasks.filter((t) => t.milestone).map((t) => ({ id: t.id, name: t.name, taskId: t.id, gate: t.gate, baselineDay: Math.round(cpm.nodes.get(t.id).ef) }));
    this.summaries = SUMMARY_PACKAGES.map((s) => {
      const kids = bt.filter((t) => this.taskById.get(t.id).summaryId === s.id);
      return {
        id: s.id, code: s.id, name: s.name, color: s.color, owner: s.owner,
        budget: kids.reduce((a, t) => a + t.budget, 0),
        baselineStart: Math.min(...kids.map((t) => cpm.nodes.get(t.id).es)),
        baselineFinish: Math.max(...kids.map((t) => cpm.nodes.get(t.id).ef)),
      };
    });
  }

  _rebaseline(reason) {
    this.baselineTasks = this._snapshotTasks();
    this.baselineVersion += 1;
    this._buildBaseline();
    this._setFunding();
    this.log('change', `Re-baselined (v${this.baselineVersion})`, `${reason} New baseline ${this.baselineDuration} days, BAC PKR ${(this.bac / 1e9).toFixed(2)} bn.`);
  }

  _buildResources() {
    const D = this.baselineDuration + 1;
    const profile = new Map(RESOURCE_TYPES.map((r) => [r.id, new Float64Array(D)]));
    for (const t of this.tasks) {
      const n = this.baseline.nodes.get(t.id);
      for (const [rid, c] of Object.entries(t.crew)) {
        const arr = profile.get(rid);
        for (let d = Math.max(0, Math.floor(n.es)); d < Math.min(D, Math.ceil(n.ef)); d++) arr[d] += c;
      }
    }
    this.resourceProfile = profile;
    this.resources = RESOURCE_TYPES.map((r) => {
      const arr = profile.get(r.id);
      let peak = 0;
      let area = 0;
      for (let d = 0; d < D; d++) { peak = Math.max(peak, arr[d]); area += arr[d]; }
      return {
        id: r.id, name: r.name, unit: r.unit, kind: r.kind, note: r.note, dayRate: r.dayRate,
        peakDemand: peak, meanDemand: Math.round(area / D), baseline: peak, capacity: Math.ceil(peak * 1.3),
        assigned: 0, required: 0, utilisation: 0, auto: true, plannedCost: area * r.dayRate,
      };
    });
    this.resourceById = new Map(this.resources.map((r) => [r.id, r]));
    this.peakPeople = this.resources.filter((r) => r.kind === 'people').reduce((s, r) => s + r.peakDemand, 0);
    this.plannedLabour = this.resources.reduce((s, r) => s + r.plannedCost, 0);
  }

  _buildWeatherNorms() {
    // Expected factor per work class under the climatology (mean intensity 0.75):
    // the estimates already allow for normal Hyderabad weather.
    this.weatherNorm = {};
    for (const [cls, f] of Object.entries(WEATHER_FACTORS)) {
      let sum = 0;
      for (const c of CLIMATE) {
        let clear = 1;
        let e = 0;
        for (const k of ['haze', 'dust', 'rain', 'fog', 'heat']) {
          const p = c[k] || 0;
          clear -= p;
          e += p * (1 - (1 - f[k]) * 0.75);
        }
        sum += e + Math.max(0, clear);
      }
      this.weatherNorm[cls] = sum / CLIMATE.length;
    }
  }

  _buildRegisters() {
    const diff = this.diff;
    // ---- risks ----
    this.risks = RISK_REGISTER.map((r) => {
      const taskIds = this._resolveAffects(r.affects);
      const responded = ['Mitigate', 'Transfer', 'Avoid', 'Exploit', 'Enhance', 'Share'].includes(r.response);
      const risk = {
        id: r.id, title: r.title, category: r.category, rbs: r.rbs, kind: r.kind,
        rawProbability: r.rawProbability, residual: r.residual,
        probability: responded ? r.residual : r.rawProbability * (r.response === 'Escalate' ? 0.8 : 1),
        costImpact: r.costImpact, daysImpact: r.daysImpact, response: r.response,
        strategies: r.strategies, responseCost: r.responseCost || 0, owner: r.owner, trigger: r.trigger,
        status: r.response === 'Escalate' ? 'Escalated' : 'Open', occurrences: 0, lastDay: null, until: null,
        weather: r.weather || null, recurring: !!r.recurring, months: r.months || null,
        affects: r.affects, taskIds, priceShock: r.priceShock || null, raisesChange: r.raisesChange || null,
        supplyHit: r.supplyHit || null, safetyHit: r.safetyHit || 0, communityHit: r.communityHit || 0,
        impactFactor: r.response === 'Mitigate' ? 0.8 : 1, costShare: r.response === 'Transfer' ? 0.25 : r.response === 'Share' ? 0.6 : 1,
        pScore: 0, iScore: 0, score: 0, emv: 0, hazard: 0, exposureDays: 0, seasonsExposed: 0,
      };
      return risk;
    });
    this.riskById = new Map(this.risks.map((r) => [r.id, r]));
    for (const r of this.risks) {
      this._riskExposure(r);
      this._riskScores(r);
      if (!r.affects.includes('*')) for (const id of r.taskIds) this.taskById.get(id).dictionary.risks.push(r.id);
    }
    // ---- stakeholders ----
    this.stakeholders = STAKEHOLDER_REGISTER.map((s) => ({
      ...s, drivers: { ...s.drivers },
      satisfaction: clamp01(diff.satisfaction + (s.current - 3) * 0.06),
      quadrant: gridQuadrant(s.power, s.interest), salience: salience(s), levelName: engagementLabel(s.current),
      lastEngaged: null, engagements: 0,
    }));
    this.stakeholderById = new Map(this.stakeholders.map((s) => [s.id, s]));
    this.commsPlan = COMMS_PLAN.map((c) => ({ ...c }));
    this.communicationChannels = channels(this.stakeholders.length + 1);
    // ---- procurement ----
    this.procurement = PROCUREMENT_PACKAGES.map((pk) => this._buildPackage(pk));
    this.pkgByTask = new Map();
    for (const pk of this.procurement) for (const id of pk.packageIds) this.pkgByTask.set(id, pk.id);
    this.pkgById = new Map(this.procurement.map((p) => [p.id, p]));
    // ---- requirements, RACI ----
    this.requirements = REQUIREMENTS.map(([id, text, source, priority, wbs, test]) => ({ id, text, source, priority, wbs, test, status: 'Approved' }));
    this.raci = {
      roles: RACI_ROLES,
      rows: RACI_ROWS.map(([deliverable, codes]) => {
        const letters = codes.split(' ');
        return { deliverable, cells: Object.fromEntries(RACI_ROLES.map((role, i) => [role, letters[i] === '.' ? '' : letters[i]])) };
      }),
    };
    // ---- gates ----
    this.gates = GATES.map((g) => ({ id: g.id, name: g.name, phase: g.phase, next: g.next, criteria: g.criteria, milestone: g.milestone,
      status: 'pending', day: null, readyDay: null, approvedBy: null, baselineDay: Math.round(this.baseline.nodes.get(g.milestone).ef) }));
    this.gateById = new Map(this.gates.map((g) => [g.id, g]));
    // ---- agile ----
    const backlog = buildBacklog();
    const releaseDays = this.taskById.get('10.2').duration;
    const plannedSprints = Math.max(1, Math.round(releaseDays / 14));
    const totalPoints = backlog.reduce((s, x) => s + x.points, 0);
    this.agile = {
      backlog, sprintLength: 14, sprints: [], currentSprint: null, wip: { doing: 4, review: 2 }, velocity: [],
      ceremonies: [], plannedVelocity: totalPoints / plannedSprints, plannedSprints, totalPoints, nextPlan: null,
      epicPoints: Object.fromEntries(Object.keys(EPIC_NAMES).map((e) => [e, backlog.filter((s) => s.epic === e).reduce((a, s) => a + s.points, 0)])),
      mode: this.approach === 'predictive' ? 'predictive (waterfall IT delivery)' : 'Scrum',
    };
  }

  _resolveAffects(list) {
    const leaves = this.tasks.filter((t) => !t.milestone);
    const out = new Set();
    for (const a of list) {
      if (a === '*') leaves.forEach((t) => out.add(t.id));
      else if (a === '*outdoor') leaves.filter((t) => OUTDOOR.has(t.cls)).forEach((t) => out.add(t.id));
      else if (a === '*indoor') leaves.filter((t) => t.cls === 'indoor').forEach((t) => out.add(t.id));
      else if (a.startsWith('*')) leaves.filter((t) => t.mat === a.slice(1)).forEach((t) => out.add(t.id));
      else if (this.taskById.has(a)) out.add(a);
    }
    return [...out];
  }

  _riskExposure(r) {
    const nodes = this.baseline.nodes;
    const D = this.baselineDuration;
    const active = new Uint8Array(D + 1);
    for (const id of r.taskIds) {
      const n = nodes.get(id);
      for (let d = Math.floor(n.es); d < Math.min(D, Math.ceil(n.ef)); d++) active[d] = 1;
    }
    let days = 0;
    let seasonal = 0;
    for (let d = 0; d < D; d++) {
      if (!active[d]) continue;
      days++;
      if (r.months && r.months.includes(this.date(d).getUTCMonth())) seasonal++;
    }
    r.exposureDays = Math.max(1, days);
    r.seasonDays = r.months ? r.months.length * 30.4 : 0;
    r.seasonsExposed = r.months ? seasonal / r.seasonDays : 0;
    this._riskHazard(r);
  }

  _riskHazard(r) {
    const p = clamp(r.probability * this.diff.riskScale, 0, 0.97);
    const window = r.recurring ? r.seasonDays : r.exposureDays;
    r.hazard = 1 - Math.pow(1 - p, 1 / Math.max(1, window));
  }

  _riskScores(r) {
    const impact = r.costImpact * r.impactFactor * r.costShare;
    r.pScore = probabilityScore(r.probability);
    r.iScore = impactScore({ cost: impact, days: r.daysImpact }, { bac: this.bac });
    r.score = riskScore(r.pScore, r.iScore);
    r.emv = emv(r.probability, impact, r.kind) * (r.recurring ? Math.max(1, r.seasonsExposed) : 1);
    r.residualEmv = emv(r.residual, impact, r.kind);
  }

  _buildPackage(pk) {
    const estimate = pk.packageIds.reduce((s, id) => s + this.taskById.get(id).budget, 0);
    const requiredBy = Math.min(...pk.packageIds.map((id) => this.baseline.nodes.get(id).es));
    const awardDay = Math.max(1, Math.floor(requiredBy - pk.leadTime));
    const rfpDay = Math.max(0, awardDay - 45);
    const bids = pk.bidSpecs.map(([vendor, f, technical, experience, schedule]) => ({ vendor, price: Math.round(estimate * f), technical, experience, schedule }));
    const ranked = weightedScore(bids, DEFAULT_WEIGHTS);
    for (const b of bids) b.score = ranked.find((x) => x.vendor === b.vendor).score;
    return {
      id: pk.id, name: pk.name, packageIds: [...pk.packageIds], contractType: pk.contractType, kind: pk.kind,
      estimate, leadTime: pk.leadTime, terms: { ...pk.terms },
      makeOrBuy: { make: Math.round(estimate * pk.makeOrBuy.make), buy: estimate, decision: pk.makeOrBuy.decision, rationale: pk.makeOrBuy.rationale },
      bids, plannedVendor: ranked[0].vendor, plannedTechnical: ranked[0].technical,
      status: 'Planned', vendor: null, awardedValue: 0, priceRatio: 1, performance: 1,
      plan: { rfpDay, evaluationDay: rfpDay + 30, awardDay, requiredBy: Math.round(requiredBy) },
      rfpDay: null, awardDay: null, deliveryDay: null, delivered: 0, closedDay: null,
      claims: [], variations: [], payments: [], paid: 0, retention: 0, finalAccount: null,
    };
  }

  _setFunding() {
    const years = [];
    const D = this.baselineDuration;
    const y0 = this.startDate.getUTCFullYear();
    const yEnd = this.date(D).getUTCFullYear();
    for (let y = y0; y <= yEnd; y++) {
      const endDay = Math.min(D, Math.round((Date.UTC(y + 1, 0, 1) - this.startDate.getTime()) / DAY_MS));
      const pv = this.pvCurve[Math.max(0, Math.min(D, endDay))];
      years.push({ year: y, limit: Math.round(pv * 1.05 + (y === yEnd ? this.contingencyReserve : this.contingencyReserve * 0.5)), plannedValue: pv });
    }
    this.fundingLimits = years;
  }

  /* ======================================================== LIVE STATE */

  _initState() {
    this.day = 0;
    this.finished = false;
    this.phase = 'initiating';
    this.state = new Map();
    for (const t of this.tasks) {
      this.state.set(t.id, {
        id: t.id, pct: 0, actualStart: null, actualFinish: null, actualCost: 0,
        remaining: t.duration, remainingWork: t.duration, crashed: 0, rework: 0, blocked: null,
        perf: 1, notBefore: 0, fastTracked: false, daysActive: 0, workDone: 0, riskDays: 0, crashUntil: 0,
      });
    }
    this.ev = 0;
    this.pv = 0;
    this.ac = 0;
    this.costBreakdown = { labour: 0, material: 0, quality: 0, risk: 0, crash: 0, management: 0, claims: 0, idle: 0 };
    this.contingencyReserve = this.risks.filter((r) => r.kind === 'threat' && r.status !== 'Escalated').reduce((s, r) => s - r.emv, 0);
    this.managementReserve = this.bac * 0.05;
    this.contingencyRemaining = this.contingencyReserve;
    this.managementRemaining = this.managementReserve;
    this._setFunding();
    this.welfare = 0.82;
    this.safety = 0.92;
    this.incidents = 0;
    this.recentIncidents = 0;
    this.realisedRisks = 0;
    this.realisedOpportunities = 0;
    this.community = this.diff.community;
    this.qualityIndex = 0.95;
    this.failEwma = 0.01;
    this.inspectionLevel = 1;
    this.autoStaffing = true;
    this.crashedDays = 0;
    this.scopeChanges = 0;
    this.autoGateApprovals = 0;
    this.latentDefects = 0;
    this.reserveWarned = false;
    this.priceIndex = { local: 1, bitumen: 1, steel: 1, imported: 1 };
    this.stock = { local: 1, bitumen: 1, steel: 1, imported: 1 };
    this.supplyDisruption = { local: 0, bitumen: 0, steel: 0, imported: 0 };
    this.weather = { kind: 'clear', intensity: 0, label: 'Clear', tempC: 25, workFactor: 1, simulated: true };
    this.forcedWeather = null;
    this.activeIds = [];
    this.evmHistory = [];
    this.resourceHistory = [];
    this.changes = [];
    this.raisedTemplates = [];
    this.issues = [];
    this.decisionLog = [];
    this.lessons = [];
    this.lessonKeys = [];
    this.ncrs = [];
    this.quality = {
      metrics: Object.fromEntries(Object.entries(QUALITY_METRICS).map(([k, m]) => [k, { ...m, samples: [] }])),
      ncrs: this.ncrs,
      defects: Object.fromEntries(DEFECT_CATEGORIES.map((c) => [c, 0])),
      costOfQuality: { prevention: 0, appraisal: 0, internalFailure: 0, externalFailure: 0 },
      inspectionLevel: 1, audits: [],
    };
    this.benefits = { movementsPerDay: 0, paxPerDay: 0, onTimePct: 0, samples: [], businessCaseTarget: { ...BUSINESS_CASE }, realisation: 0 };
    this.stakeholderSatisfaction = this._weightedSatisfaction();
    this.forecastFinish = this.baselineDuration;
    this.scheduleVarianceDays = 0;
    this.closeout = null;
  }

  /* ============================================================ DATES */

  date(day = this.day) {
    return new Date(this.startDate.getTime() + Math.round(day) * DAY_MS);
  }

  dateLabel(day = this.day) {
    const d = this.date(day);
    return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  /* ============================================================ LOGGING */

  log(kind, title, detail = '') {
    this.serial.event += 1;
    const entry = { serial: this.serial.event, day: this.day, kind, title, detail };
    this.events.unshift(entry);
    if (this.events.length > 400) this.events.pop();
    if (typeof this.onLog === 'function') {
      try { this.onLog(entry); } catch (err) { /* a UI listener must never break the simulation */ }
    }
    return entry;
  }

  _decision(title, detail, owner = 'Project Director') {
    this.serial.decision += 1;
    const d = { id: `D${pad(this.serial.decision, 3)}`, day: this.day, title, detail, owner, status: 'Recorded' };
    this.decisionLog.unshift(d);
    if (this.decisionLog.length > 300) this.decisionLog.pop();
    return d;
  }

  _issue(title, detail, owner, resolveIn, source) {
    this.serial.issue += 1;
    const is = { id: `IS${pad(this.serial.issue, 3)}`, day: this.day, title, detail, owner, status: 'Open', source: source || null, resolveDay: this.day + Math.max(5, Math.round(resolveIn)) };
    this.issues.unshift(is);
    if (this.issues.length > 300) this.issues.pop();
    return is;
  }

  _lessonOnce(key, title, detail, category, owner = 'PMO Lead') {
    if (this.lessonKeys.includes(key)) return null;
    this.lessonKeys.push(key);
    return this.addLesson({ title, detail, category, owner });
  }

  addLesson({ title, detail, category = 'General', owner = 'PMO Lead' }) {
    this.serial.lesson += 1;
    const l = { id: `LL${pad(this.serial.lesson)}`, day: this.day, title, detail, owner, status: 'Captured', category };
    this.lessons.unshift(l);
    return l;
  }

  /* ============================================================== COST */

  _spend(bucket, amount, taskId = null) {
    if (!amount) return;
    this.costBreakdown[bucket] += amount;
    this.ac += amount;
    if (taskId) this.state.get(taskId).actualCost += amount;
    if (amount > 0 && (bucket === 'risk' || bucket === 'quality' || bucket === 'claims')) this._drawReserve(amount, true);
    else if (amount > 0 && (bucket === 'crash' || bucket === 'management')) this._drawReserve(amount, false);
    else if (amount < 0 && bucket === 'risk') this.contingencyRemaining -= amount;
  }

  _drawReserve(amount, contingencyFirst) {
    if (contingencyFirst && this.contingencyRemaining >= amount) { this.contingencyRemaining -= amount; return; }
    let rest = amount;
    if (contingencyFirst) { rest -= Math.max(0, this.contingencyRemaining); this.contingencyRemaining = Math.min(0, this.contingencyRemaining); }
    this.managementRemaining -= rest;
    if (contingencyFirst && !this.reserveWarned) {
      this.reserveWarned = true;
      this.log('warn', 'Contingency reserve exhausted', 'Further risk costs draw on the management reserve — the sponsor must be informed.');
      this._lessonOnce('reserve', 'Contingency sizing', 'The contingency reserve ran out before completion; size it from quantitative risk analysis (P80), not the sum of EMVs.', 'Cost');
    }
  }

  priceFactor(t) {
    const pkId = this.pkgByTask.get(t.id);
    const ratio = pkId ? this.pkgById.get(pkId).priceRatio : 1;
    return this.priceIndex[t.mat] * ratio;
  }

  /* ============================================================== STEP */

  step() {
    if (this.finished) return;
    this.day += 1;
    this._updateWeather();
    const active = this._eligibility();
    this._resourceDemand(active);
    this._progress(active);
    this._labour(active);
    this._consumables(active);
    this._rollRisks();
    this._safetyAndWelfare(active);
    this._procurementStep();
    this._changeControl();
    this._issuesStep();
    if (this.day % 7 === 0) {
      this._updateStakeholders();
      this._updateRequirements();
    }
    this._phaseFromGates();
    if (this.day % 7 === 0) this._recordEvm();
    if (this.day % 14 === 0) this._recomputeForecast();
    if (this.day % 90 === 0) this._qualityAudit();
    let done = true;
    for (const st of this.state.values()) if (st.pct < 1) { done = false; break; }
    if (done) this._complete();
  }

  /** Advance n days (headless helper). */
  run(n) {
    for (let i = 0; i < n && !this.finished; i++) this.step();
    return this.snapshot();
  }

  _complete() {
    this.finished = true;
    this.phase = 'closing';
    this._updateStakeholders();
    this._updateRequirements();
    this._recordEvm();
    this._recomputeForecast();
    for (const pk of this.procurement) if (pk.status !== 'Closed') this._closePackage(pk);
    this.log('milestone', 'Programme complete', `Handed over and closed on ${this.dateLabel()} (day ${this.day}; baseline ${this.baselineDuration}).`);
    this.closeout = this.closeProject();
  }

  /* ----------------------------------------------------------- weather */

  _updateWeather() {
    const month = this.date().getUTCMonth();
    const clim = CLIMATE[month];
    let kind = this.weather.kind;
    let intensity = this.weather.intensity;
    if (this.forcedWeather && this.day <= this.forcedWeather.until) {
      kind = this.forcedWeather.kind;
      intensity = this.forcedWeather.intensity;
    } else {
      this.forcedWeather = null;
      const allowed = kind === 'clear' || (clim[kind] || 0) > 0;
      if (!allowed || this.rng() < 0.32) {
        const u = this.rng();
        let acc = 0;
        kind = 'clear';
        for (const k of ['haze', 'dust', 'rain', 'fog', 'heat']) {
          acc += clim[k] || 0;
          if (u < acc) { kind = k; break; }
        }
        intensity = kind === 'clear' ? 0 : 0.5 + this.rng() * 0.5;
      }
    }
    const tempC = Math.round(kind === 'heat' ? Math.max(45, clim.tmax + 3 + 3 * intensity) : clim.tmax + (kind === 'rain' ? -4 : kind === 'fog' ? -6 : 0));
    const label = kind === 'heat' ? `${WEATHER_LABELS.heat} ${tempC} °C` : WEATHER_LABELS[kind];
    this.weather = { kind, intensity, label, tempC, workFactor: this._weatherFactor('outdoor', kind, intensity), simulated: true };
  }

  _weatherFactor(cls, kind = this.weather.kind, intensity = this.weather.intensity) {
    const f = WEATHER_FACTORS[cls] || WEATHER_FACTORS.outdoor;
    const raw = kind === 'clear' ? 1 : 1 - (1 - f[kind]) * intensity;
    return raw / this.weatherNorm[cls];
  }

  /* ------------------------------------------------------- eligibility */

  _eligibility() {
    const now = this.day - 1;    // today's work interval is [day − 1, day]
    const active = [];
    for (const t of this.topo) {
      const st = this.state.get(t.id);
      if (st.pct >= 1) continue;
      if (t.milestone) { this._milestoneCheck(t, st, now); continue; }
      const reason = this._blockedReason(t, st, now);
      st.blocked = reason;
      if (reason) continue;
      if (st.actualStart === null) this._startTask(t, st, now);
      active.push(t);
    }
    this.activeIds = active.map((t) => t.id);
    return active;
  }

  _predFinishEstimate(ps, now) {
    return ps.pct >= 1 ? ps.actualFinish : now + ps.remainingWork;
  }

  _blockedReason(t, st, now) {
    if (now < st.notBefore) return `levelled to start ${this.dateLabel(st.notBefore)}`;
    for (const link of t.predecessors) {
      const ps = this.state.get(link.id);
      const lag = link.lag || 0;
      const type = link.type || 'FS';
      if (type === 'FS') {
        if (lag >= 0) {
          if (ps.pct < 1) return `waiting on ${link.id} (FS)`;
          if (now < ps.actualFinish + lag) return `lag after ${link.id}`;
        } else if (ps.pct < 1 && (ps.actualStart === null || ps.remainingWork > -lag + 1e-9)) {
          return `lead on ${link.id} not reached`;
        }
      } else if (type === 'SS') {
        if (ps.actualStart === null) return `waiting on ${link.id} to start (SS)`;
        if (now < ps.actualStart + lag) return `SS lag after ${link.id}`;
      } else if (st.actualStart === null) {
        // FF / SF constrain the finish; CPM also delays the start so the successor
        // is not opened earlier than it can usefully run.
        const ref = type === 'FF' ? this._predFinishEstimate(ps, now) : (ps.actualStart !== null ? ps.actualStart : now);
        if (now < ref + lag - st.remainingWork - 1e-9) return `${type} with ${link.id}`;
      }
    }
    const pkId = this.pkgByTask.get(t.id);
    if (pkId) {
      const pk = this.pkgById.get(pkId);
      if (!pk.vendor) return `awaiting contract award (${pk.id})`;
      if (pk.kind === 'supply' && pk.deliveryDay !== null && now < pk.deliveryDay) return `awaiting delivery (${pk.id})`;
    }
    return null;
  }

  _startTask(t, st, now) {
    st.actualStart = now;
    const v = this.diff.variability;
    if (t.o < t.p && t.delivery !== 'agile') {
      const sample = samplePert(() => this.rng(), t.o, t.m, t.p);
      const te = pertDuration(t.o, t.m, t.p);
      const d = te + (sample - te) * v;
      st.perf = clamp(t.duration / Math.max(1, d), 0.6, 1.5);
    }
    if (t.dictionary && this.day > 1) this.log('info', `${t.code} started`, t.name);
  }

  _milestoneCheck(t, st, now) {
    const gate = t.gate ? this.gateById.get(t.gate) : null;
    for (const link of t.predecessors) {
      const ps = this.state.get(link.id);
      if (ps.pct < 1) { st.blocked = `waiting on ${link.id}`; return; }
      if (!gate && now < ps.actualFinish + (link.lag || 0)) { st.blocked = `lag after ${link.id}`; return; }
    }
    if (gate) {
      if (gate.status === 'pending') {
        gate.status = 'ready';
        gate.readyDay = now;
        this.log('decision', `Gate ${gate.id} ready for decision`, `${gate.name}: all criteria met. Approve within ${PROJECT_INFO.gateReviewDays} days or the sponsor decides by default.`);
      }
      if (gate.status === 'ready' && now >= gate.readyDay + PROJECT_INFO.gateReviewDays) {
        this._approveGate(gate, 'Sponsor (default decision)', now);
        this.autoGateApprovals += 1;
        this.stakeholderById.get('S01').satisfaction = clamp01(this.stakeholderById.get('S01').satisfaction - 0.05);
        for (const s of this.stakeholders) s.satisfaction = clamp01(s.satisfaction - 0.01);
        this.log('warn', `Gate ${gate.id} approved by default`, 'The project board did not decide within the review window; the sponsor approved by default and confidence in governance fell.');
        this._lessonOnce('gate-latency', 'Gate decision latency', 'Gate reviews were not decided inside the review window. Prepare gate packs ahead of readiness and pre-book board time.', 'Governance');
      }
      if (gate.status !== 'approved') { st.blocked = 'awaiting gate decision'; return; }
    }
    st.blocked = null;
    st.actualStart = now;
    st.actualFinish = now;
    st.pct = 1;
    st.remaining = 0;
    st.remainingWork = 0;
    this.log('milestone', `${t.id} ${t.name}`, `Reached on ${this.dateLabel(now)} (baseline ${this.dateLabel(this.baseline.nodes.get(t.id).ef)}).`);
  }

  /* ------------------------------------------------- resource demand */

  _resourceDemand(active) {
    for (const r of this.resources) r.required = 0;
    for (const t of active) for (const [rid, n] of Object.entries(t.crew)) this.resourceById.get(rid).required += n;
    this.fulfilment = {};
    for (const r of this.resources) {
      if (r.auto) r.assigned = Math.min(r.capacity, r.required);
      this.fulfilment[r.id] = r.required > 0 ? r.assigned / r.required : 1;
      r.utilisation = r.assigned > 0 ? Math.min(1, r.required / r.assigned) : 0;
    }
  }

  _staffingFactor(t) {
    let s = Infinity;
    for (const rid of Object.keys(t.crew)) s = Math.min(s, this.fulfilment[rid]);
    if (!Number.isFinite(s)) s = 1;
    return s <= 1 ? s : Math.min(1.3, 1 + (s - 1) * 0.35);  // Brooks: diminishing returns above plan
  }

  _productivity(t, st) {
    const welfare = this.welfare >= 0.7 ? 1 : 0.7 + this.welfare * 0.43;
    const stock = this.stock[t.mat];
    const supply = stock >= 0.25 ? 1 : 0.5 + stock * 2;
    const pkId = this.pkgByTask.get(t.id);
    const vendor = pkId ? this.pkgById.get(pkId).performance : 1;
    const inspection = t.q.length ? 1 - 0.04 * (this.inspectionLevel - 1) : 1;
    return clamp(this._staffingFactor(t) * this._weatherFactor(t.cls) * welfare * supply * vendor * inspection * st.perf * this.diff.productivity, 0, 1.6);
  }

  /* -------------------------------------------------- progress & cost */

  _progress(active) {
    const day = this.day;
    let agileActive = false;
    for (const t of active) {
      const st = this.state.get(t.id);
      st.daysActive += 1;
      if (t.delivery === 'agile') { agileActive = true; continue; }
      let minRem = 0;
      for (const link of t.predecessors) {
        if (link.type !== 'FF' && link.type !== 'SF') continue;
        const ps = this.state.get(link.id);
        const lag = link.lag || 0;
        let need;
        if (link.type === 'FF') need = ps.pct >= 1 ? ps.actualFinish + lag - day : ps.remainingWork + lag;
        else need = ps.actualStart !== null ? ps.actualStart + lag - day : Math.max(lag, 0.001);
        if (need > minRem) minRem = need;
      }
      const prod = this._productivity(t, st);
      const w = Math.max(0, Math.min(prod, st.remainingWork - minRem));
      if (w <= 0) { st.blocked = minRem > 0 ? 'held by FF/SF link' : st.blocked; continue; }
      const before = st.pct;
      st.pct = st.remainingWork - w <= 1e-6 ? 1 : before + (1 - before) * (w / st.remainingWork);
      st.remainingWork = Math.max(0, st.remainingWork - w);
      st.remaining = st.remainingWork;
      st.workDone += w;
      this._earn(t, st, st.pct - before);
      this._sampleQuality(t, st, w);
      if (st.pct >= 1) this._finishTask(t, st);
    }
    if (this.approach !== 'predictive') this._agileStep(agileActive);
    else this._syncStoriesPredictive();
  }

  _earn(t, st, dPct) {
    if (dPct <= 0) return;
    this.ev += dPct * t.budget;
    const mat = dPct * t.materialBudget * this.priceFactor(t);
    this.costBreakdown.material += mat;
    this.ac += mat;
    st.actualCost += mat;
    const base = dPct * t.budget;
    this.quality.costOfQuality.prevention += base * 0.004 * this.inspectionLevel;
    this.quality.costOfQuality.appraisal += base * 0.006 * this.inspectionLevel;
    const extra = base * 0.01 * (this.inspectionLevel - 1);   // inspection above/below the planned level
    if (extra) { this.costBreakdown.quality += extra; this.ac += extra; st.actualCost += extra; }
  }

  _finishTask(t, st) {
    st.pct = 1;
    st.remaining = 0;
    st.remainingWork = 0;
    st.actualFinish = this.day;
    st.blocked = null;
    const late = Math.round(this.day - this.baseline.nodes.get(t.id).ef);
    this.log('good', `${t.code} complete`, `${t.name} — ${late > 0 ? `${late} days late` : late < 0 ? `${-late} days early` : 'on baseline'}.`);
    if (t.id === '2.3') this.community = clamp01(this.community + 0.08);
    if (t.id === '12.1' && this.latentDefects > 0) {
      const cost = this.latentDefects * 2.5 * M;
      this.quality.costOfQuality.externalFailure += cost;
      this._spend('quality', cost, t.id);
      this.log('warn', 'Latent defects found at commissioning', `${this.latentDefects} defects escaped inspection and were found at final acceptance: PKR ${(cost / M).toFixed(0)} m external-failure cost.`);
      this._lessonOnce('latent', 'Inspection level vs. escaped defects', 'Defects that escape inspection cost several times more to fix after handover — the cost of quality curve in practice.', 'Quality');
      this.latentDefects = 0;
    }
    const sum = this.summaries.find((s) => s.id === t.summaryId);
    if (sum && this.tasks.every((x) => x.summaryId !== t.summaryId || this.state.get(x.id).pct >= 1)) {
      this.log('good', `Package ${sum.id} complete`, sum.name);
    }
  }

  /* ----------------------------------------------------------- quality */

  _sampleQuality(t, st, w) {
    const crash = this.day <= st.crashUntil ? 0.8 : 0;
    const pressure = crash + (st.fastTracked ? 0.5 : 0) + (this.welfare < 0.6 ? 0.5 : 0) + (1 - st.perf > 0.15 ? 0.2 : 0);
    const detect = clamp(0.55 + 0.35 * this.inspectionLevel, 0.3, 0.98);
    const spread = 1 + Math.max(0, 1 - this.inspectionLevel) * 0.5;
    if (t.q.length && this.rng() < 0.3 * Math.min(1, w)) {
      const key = t.q[Math.floor(this.rng() * t.q.length)];
      const m = this.quality.metrics[key];
      let shift = pressure;
      if (key === 'roughness' || key === 'friction') shift += this.weather.kind === 'heat' ? 0.6 * this.weather.intensity : 0;
      const pkId = this.pkgByTask.get(t.id);
      if (pkId) shift += (1 - this.pkgById.get(pkId).performance) * 20;
      let u1 = this.rng();
      if (u1 < 1e-12) u1 = 1e-12;
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * this.rng());
      const value = m.target + m.worse * shift * m.sd + z * m.sd * spread;
      const ok = value >= m.lsl && value <= m.usl;
      m.samples.push({ day: this.day, value: +value.toFixed(3), ok, task: t.id });
      if (m.samples.length > 240) m.samples.shift();
      this.failEwma = this.failEwma * 0.98 + (ok ? 0 : 0.02);
      if (!ok) this._defect(t, st, key === 'concrete' ? 'Concrete strength' : key === 'compaction' ? 'Compaction' : key === 'friction' ? 'Surface texture' : 'Ride quality', detect, { metric: key, value, limit: value < m.lsl ? m.lsl : m.usl, unit: m.unit });
    } else if (!t.q.length) {
      const fail = this.rng() < 0.012 * Math.min(1, w) * (1 + pressure);
      this.failEwma = this.failEwma * 0.995 + (fail ? 0.005 : 0);
      if (fail) this._defect(t, st, t.dc, detect, null);
    }
    let openNcrs = 0;
    for (const n of this.ncrs) if (n.status === 'Open') openNcrs++;
    this.qualityIndex = clamp01(1 - 4 * this.failEwma - 0.002 * Math.min(50, this.latentDefects) - 0.01 * openNcrs);
  }

  _defect(t, st, category, detect, measurement) {
    this.quality.defects[category] = (this.quality.defects[category] || 0) + 1;
    if (this.rng() > detect) { this.latentDefects += 1; return; }
    const days = measurement ? 1.5 + this.rng() * 3 : 0.3 + this.rng() * 0.7;
    const cost = t.budget * (measurement ? 0.003 + this.rng() * 0.005 : 0.0008 + this.rng() * 0.001);
    st.remainingWork += days;
    st.remaining = st.remainingWork;
    st.rework += days;
    this.quality.costOfQuality.internalFailure += cost;
    this._spend('quality', cost, t.id);
    if (measurement) {
      this.serial.ncr += 1;
      const ncr = {
        id: `NCR${pad(this.serial.ncr, 3)}`, day: this.day, task: t.id, metric: measurement.metric, value: +measurement.value.toFixed(3),
        limit: measurement.limit, unit: measurement.unit, category, disposition: 'Rework', cost, status: 'Open', closeDay: this.day + Math.ceil(days) + 3,
      };
      this.ncrs.unshift(ncr);
      if (this.ncrs.length > 200) this.ncrs.pop();
      this.log('warn', `${ncr.id} — ${t.code} ${QUALITY_METRICS[measurement.metric].name}`,
        `Measured ${ncr.value} ${ncr.unit} against limit ${ncr.limit}. Lot rejected and reworked (${days.toFixed(1)} days, PKR ${(cost / M).toFixed(1)} m).`);
      this._lessonOnce(`ncr-${measurement.metric}`, `First NCR on ${QUALITY_METRICS[measurement.metric].name.toLowerCase()}`, 'Trend control-chart data weekly and act on Western Electric signals before a lot fails.', 'Quality');
    }
  }

  _qualityAudit() {
    const score = Math.round(this.qualityIndex * 100 - 3 + this.rng() * 6);
    const findings = Math.max(0, Math.round((100 - score) / 8 + this.rng() * 2));
    this.quality.audits.unshift({ day: this.day, scope: `Quality audit Q${Math.ceil(this.day / 90)}`, score, findings });
    if (this.quality.audits.length > 40) this.quality.audits.pop();
    for (const n of this.ncrs) if (n.status === 'Open' && this.day >= n.closeDay) n.status = 'Closed';
  }

  setInspectionLevel(v) {
    const lvl = clamp(Number(v) || 1, 0.5, 1.5);
    this.inspectionLevel = lvl;
    this.quality.inspectionLevel = lvl;
    this._decision('Inspection level set', `Inspection and test intensity set to ${Math.round(lvl * 100)} % of plan.`, 'Quality Manager');
    return lvl;
  }

  /* ------------------------------------------------------------- agile */

  _agileTasks() {
    return this.tasks.filter((t) => t.delivery === 'agile');
  }

  _agileStep(anyActive) {
    const ag = this.agile;
    if (!anyActive && !ag.currentSprint) return;
    const remaining = ag.backlog.filter((s) => s.status !== 'done');
    if (!ag.currentSprint) {
      if (!remaining.length) return;
      this._startSprint();
    }
    const sp = ag.currentSprint;
    const day = this.day;
    // Review → done (Definition of Done checked at the review column).
    for (const s of ag.backlog) if (s.status === 'review' && s.reviewSince < day) this._storyDone(s);
    for (const s of ag.backlog) {
      if (s.status === 'doing' && s.effort >= s.points - 1e-9 && ag.backlog.filter((x) => x.status === 'review').length < ag.wip.review) { s.status = 'review'; s.reviewSince = day; }
    }
    // Team capacity: planned velocity per day × staffing × focus factor.
    // The whole Scrum team swarms the remaining backlog until the release is done.
    const fulfil = this.fulfilment.itdev === undefined ? 1 : Math.min(1.2, this.fulfilment.itdev);
    let cap = (ag.plannedVelocity / ag.sprintLength) * fulfil * sp.focus * this.diff.productivity * this._weatherFactor('indoor');
    for (let guard = 0; cap > 1e-9 && guard < 20; guard++) {
      let doing = ag.backlog.filter((s) => s.status === 'doing' && s.effort < s.points);
      if (doing.length < ag.wip.doing) {
        let next = ag.backlog.filter((s) => s.status === 'todo').sort((a, b) => a.priority - b.priority)[0];
        if (!next) {
          next = ag.backlog.filter((s) => s.status === 'backlog').sort((a, b) => a.priority - b.priority)[0];
          if (next) { next.sprint = sp.n; sp.stretch = (sp.stretch || 0) + next.points; sp.stories.push(next.id); }
        }
        if (next) {
          if (next.effort >= next.points - 1e-9) {
            // Already built in an earlier sprint: straight to review if there is room.
            if (ag.backlog.filter((x) => x.status === 'review').length < ag.wip.review) { next.status = 'review'; next.reviewSince = day; continue; }
            next.status = 'todo';
            break;
          }
          next.status = 'doing';
          doing = [...doing, next];
        }
      }
      if (!doing.length) break;
      const s = doing[0];
      const take = Math.min(cap, s.points - s.effort);
      s.effort += take;
      cap -= take;
      if (s.effort >= s.points - 1e-9) {
        const inReview = ag.backlog.filter((x) => x.status === 'review').length;
        if (inReview < ag.wip.review) { s.status = 'review'; s.reviewSince = day; }
        else break;   // WIP limit on review: stop starting, start finishing
      }
    }
    const committedLeft = ag.backlog.filter((s) => s.sprint === sp.n && s.status !== 'done').reduce((a, s) => a + (s.points - s.effort), 0);
    sp.burn.push(+committedLeft.toFixed(2));
    if (day >= sp.endDay) this._endSprint();
  }

  _startSprint() {
    const ag = this.agile;
    const n = ag.sprints.length + 1;
    const vs = velocityStats(ag.velocity);
    const forecast = ag.velocity.length ? vs.average3 : ag.plannedVelocity;
    let ids;
    if (ag.nextPlan && ag.nextPlan.length) { ids = ag.nextPlan.filter((id) => ag.backlog.some((s) => s.id === id && s.status === 'backlog')); ag.nextPlan = null; }
    else ids = planSprint(ag.backlog, forecast).ids;
    const v = this.diff.variability;
    const sp = {
      n, startDay: this.day - 1, endDay: this.day - 1 + ag.sprintLength, committed: 0, completed: 0, stories: [],
      goal: '', focus: 1 + (this.rng() - 0.5) * 0.24 * v, burn: [], stretch: 0,
    };
    for (const id of ids) {
      const s = ag.backlog.find((x) => x.id === id);
      s.status = 'todo';
      s.sprint = n;
      sp.stories.push(id);
      sp.committed += s.points - s.effort;
    }
    sp.committed = +sp.committed.toFixed(2);
    sp.burn.push(sp.committed);
    const epics = [...new Set(ids.map((id) => ag.backlog.find((x) => x.id === id).epicName))];
    sp.goal = `Sprint ${n}: ship ${epics.join(' + ') || 'backlog'} stories worth ${Math.round(sp.committed)} points`;
    ag.sprints.push(sp);
    ag.currentSprint = sp;
    this._ceremony('Sprint planning', `${sp.goal} (forecast velocity ${forecast.toFixed(1)}).`);
  }

  _endSprint() {
    const ag = this.agile;
    const sp = ag.currentSprint;
    // The sprint review is where built increments are inspected and accepted.
    for (const s of ag.backlog) if (s.sprint === sp.n && s.status === 'review') this._storyDone(s);
    const done = ag.backlog.filter((s) => s.sprint === sp.n && s.status === 'done');
    sp.completed = done.reduce((a, s) => a + s.points, 0);
    ag.velocity.push(sp.completed);
    for (const s of ag.backlog) if (s.sprint === sp.n && s.status !== 'done') { s.status = 'backlog'; s.sprint = null; s.reviewSince = undefined; }
    this._ceremony('Sprint review', `Sprint ${sp.n}: ${sp.completed} of ${Math.round(sp.committed)} committed points accepted by the product owner.`);
    this._ceremony('Retrospective', sp.completed < sp.committed * 0.8 ? 'Team agreed to split large stories and limit WIP.' : 'Team kept its working agreements; flow was stable.');
    this.log('info', `Sprint ${sp.n} closed`, `Velocity ${sp.completed} points (planned ${ag.plannedVelocity.toFixed(1)}).`);
    if (sp.completed < ag.plannedVelocity * 0.7) this._lessonOnce('velocity', 'Velocity below plan', 'Sprint velocity fell well below the release plan; re-forecast the release with yesterday’s weather and protect the team from interruptions.', 'Agile');
    ag.currentSprint = null;
  }

  _ceremony(kind, note) {
    this.agile.ceremonies.unshift({ day: this.day, kind, note });
    if (this.agile.ceremonies.length > 240) this.agile.ceremonies.pop();
  }

  _storyDone(s) {
    s.status = 'done';
    s.doneDay = this.day;
    const t = this.taskById.get(s.epic);
    const st = this.state.get(t.id);
    const total = this.agile.epicPoints[s.epic];
    const donePts = this.agile.backlog.filter((x) => x.epic === s.epic && x.status === 'done').reduce((a, x) => a + x.points, 0);
    const pct = Math.min(1, donePts / total);
    const before = st.pct;
    if (pct <= before) return;
    st.pct = pct >= 1 - 1e-9 ? 1 : pct;
    st.remainingWork = (1 - st.pct) * t.duration;
    st.remaining = st.remainingWork;
    st.workDone += s.points;
    this._earn(t, st, st.pct - before);
    this._sampleQuality(t, st, s.points / 4);
    if (st.pct >= 1) this._finishTask(t, st);
  }

  _syncStoriesPredictive() {
    for (const [epic, total] of Object.entries(this.agile.epicPoints)) {
      const pct = this.state.get(epic).pct;
      let cum = 0;
      for (const s of this.agile.backlog.filter((x) => x.epic === epic).sort((a, b) => a.priority - b.priority)) {
        cum += s.points;
        if (s.status !== 'done' && cum <= pct * total + 1e-9) { s.status = 'done'; s.doneDay = this.day; s.effort = s.points; }
      }
    }
  }

  agilePlanSprint(storyIds) {
    const ag = this.agile;
    const ids = (storyIds || []).filter((id) => ag.backlog.some((s) => s.id === id && s.status === 'backlog'));
    if (!ids.length) return { ok: false, points: 0, message: 'No backlog stories selected.' };
    ag.nextPlan = ids;
    const points = ids.reduce((a, id) => a + ag.backlog.find((s) => s.id === id).points, 0);
    const forecast = ag.velocity.length ? velocityStats(ag.velocity).average3 : ag.plannedVelocity;
    this._decision('Sprint plan set', `${ids.length} stories (${points} points) queued for the next sprint; forecast velocity ${forecast.toFixed(1)}.`, 'Product Owner (Terminal IT)');
    return { ok: true, points, forecast, message: points > forecast * 1.2 ? 'Over-committed: plan exceeds forecast velocity by more than 20 %.' : 'Sprint plan accepted.' };
  }

  agileMove(storyId, status) {
    const ag = this.agile;
    const s = ag.backlog.find((x) => x.id === storyId);
    if (!s) return { ok: false, message: 'Unknown story.' };
    if (!['backlog', 'todo', 'doing', 'review', 'done'].includes(status)) return { ok: false, message: 'Unknown status.' };
    if (s.status === 'done') return { ok: false, message: 'Done stories stay done.' };
    if (ag.wip[status] !== undefined && ag.backlog.filter((x) => x.status === status).length >= ag.wip[status]) return { ok: false, message: `WIP limit reached for "${status}" (${ag.wip[status]}).` };
    if (status === 'done' && (s.status !== 'review' || s.effort < s.points)) return { ok: false, message: 'Only reviewed, fully built stories meet the Definition of Done.' };
    if ((status === 'todo' || status === 'doing') && !ag.currentSprint) return { ok: false, message: 'No sprint is running.' };
    if (status === 'done') { this._storyDone(s); return { ok: true, message: `${s.id} accepted.` }; }
    if (status === 'review') { if (s.effort < s.points) return { ok: false, message: 'Story is not built yet.' }; s.reviewSince = this.day; }
    if (status === 'todo' || status === 'doing') s.sprint = ag.currentSprint.n;
    if (status === 'backlog') s.sprint = null;
    s.status = status;
    return { ok: true, message: `${s.id} moved to ${status}.` };
  }

  agileBurndown(n) {
    const ag = this.agile;
    const sp = n === undefined ? (ag.currentSprint || ag.sprints[ag.sprints.length - 1]) : ag.sprints.find((x) => x.n === n);
    if (!sp) return [];
    return burndownSeries(sp, ag.sprintLength);
  }

  /** Release burn-up: total scope vs done points per sprint. */
  agileReleaseBurnup() {
    let done = 0;
    return this.agile.sprints.map((sp) => { done += sp.completed; return { sprint: sp.n, done, scope: this.agile.totalPoints }; });
  }

  /* ------------------------------------------------------------- labour */

  _labour(active) {
    let today = 0;
    for (const r of this.resources) {
      if (!r.assigned) continue;
      const cost = r.assigned * r.dayRate;
      today += cost;
      if (r.required > 0) {
        const share = Math.min(r.assigned, r.required) * r.dayRate;
        for (const t of active) {
          const c = t.crew[r.id];
          if (c) this.state.get(t.id).actualCost += share * (c / r.required);
        }
        if (r.assigned > r.required) this.costBreakdown.idle += (r.assigned - r.required) * r.dayRate;
      } else {
        this.costBreakdown.idle += cost;
      }
    }
    this.costBreakdown.labour += today;
    this.ac += today;
    this.pv = this.plannedValueAt(this.day);
  }

  setStaffing(resId, n) {
    const r = this.resourceById.get(resId);
    if (!r) return false;
    r.auto = false;
    r.assigned = clamp(Math.round(Number(n) || 0), 0, r.capacity);
    this.autoStaffing = this.resources.every((x) => x.auto);
    this._decision('Staffing changed', `${r.name} set to ${r.assigned} ${r.unit} (capacity ${r.capacity}).`, 'Project Director');
    return true;
  }

  setAutoStaffing(on) {
    this.autoStaffing = !!on;
    for (const r of this.resources) {
      r.auto = !!on;
      if (on) r.assigned = Math.min(r.capacity, r.required);
    }
    this._decision('Auto-staffing', on ? 'Resources follow the levelled staffing plan.' : 'Manual staffing enabled.', 'Project Director');
    return this.autoStaffing;
  }

  /** Resource smoothing: shift non-critical, unstarted work within its free float to cut peaks. */
  levelResources() {
    this._recomputeForecast();
    const nodes = this.forecast.nodes;
    const H = Math.ceil(this.forecast.duration) + 2;
    const profile = new Map(this.resources.map((r) => [r.id, new Float64Array(H)]));
    const span = new Map();
    for (const t of this.tasks) {
      const st = this.state.get(t.id);
      if (st.pct >= 1 || t.milestone) continue;
      const n = nodes.get(t.id);
      const s = Math.max(0, Math.floor(n.es));
      const e = Math.min(H, Math.ceil(n.ef));
      span.set(t.id, [s, e]);
      for (const [rid, c] of Object.entries(t.crew)) { const a = profile.get(rid); for (let d = s; d < e; d++) a[d] += c; }
    }
    const peakOf = (rid) => profile.get(rid).reduce((m, v) => Math.max(m, v), 0);
    const before = Object.fromEntries(this.resources.map((r) => [r.id, peakOf(r.id)]));
    const shifted = [];
    const cands = this.tasks.filter((t) => span.has(t.id) && this.state.get(t.id).actualStart === null && nodes.get(t.id).freeFloat >= 7)
      .sort((a, b) => nodes.get(b.id).freeFloat - nodes.get(a.id).freeFloat);
    for (const t of cands) {
      const [s, e] = span.get(t.id);
      const ff = Math.floor(nodes.get(t.id).freeFloat);
      const cost = (shift) => {
        let worst = 0;
        for (const [rid, c] of Object.entries(t.crew)) {
          const a = profile.get(rid);
          const pk = before[rid] || 1;
          for (let d = s + shift; d < Math.min(H, e + shift); d++) worst = Math.max(worst, (a[d] + (d >= s && d < e ? 0 : c)) / pk);
        }
        return worst;
      };
      let best = 0;
      let bestCost = cost(0);
      for (let k = 7; k <= ff; k += 7) { const c = cost(k); if (c < bestCost - 1e-9) { best = k; bestCost = c; } }
      if (!best) continue;
      for (const [rid, c] of Object.entries(t.crew)) {
        const a = profile.get(rid);
        for (let d = s; d < e; d++) a[d] -= c;
        for (let d = s + best; d < Math.min(H, e + best); d++) a[d] += c;
      }
      span.set(t.id, [s + best, e + best]);
      this.state.get(t.id).notBefore = this.day + s + best;
      shifted.push({ id: t.id, name: t.name, days: best });
    }
    const report = {
      method: 'Resource smoothing within free float (finish date protected)',
      resources: this.resources.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, peakBefore: before[r.id], peakAfter: peakOf(r.id) })),
      shifted,
    };
    this._decision('Resources smoothed', `${shifted.length} activities shifted within free float.`, 'Planner');
    this._recomputeForecast();
    return report;
  }

  /* -------------------------------------------------------- consumables */

  _consumables(active) {
    const use = { local: 0, bitumen: 0, steel: 0, imported: 0 };
    for (const t of active) if (t.delivery !== 'agile' && t.materialBudget > 0) use[t.mat] += 1;
    for (const k of Object.keys(this.stock)) {
      const consumption = Math.min(0.06, use[k] * 0.01);
      const supply = this.day <= this.supplyDisruption[k] ? consumption * 0.2 : consumption * 1.15 + 0.01;
      this.stock[k] = clamp01(this.stock[k] - consumption + supply);
    }
  }

  /* --------------------------------------------------------------- risk */

  _rollRisks() {
    const month = this.date().getUTCMonth();
    const activeSet = new Set(this.activeIds);
    for (const r of this.risks) {
      if (r.until !== null && this.day > r.until) {
        r.until = null;
        if (r.status === 'Occurred') r.status = r.recurring ? 'Open' : 'Closed';
      }
      if (r.status !== 'Open' && r.status !== 'Escalated') continue;
      if (r.until !== null) continue;
      if (r.months && !r.months.includes(month)) continue;
      let live = false;
      for (const id of r.taskIds) if (activeSet.has(id)) { live = true; break; }
      if (!live) {
        if (!r.recurring && r.taskIds.every((id) => this.state.get(id).pct >= 1)) r.status = 'Expired';
        continue;
      }
      if (this.rng() >= r.hazard) continue;
      this._riskOccurs(r, activeSet);
    }
  }

  _riskOccurs(r, activeSet) {
    const scale = this.diff.impactScale * r.impactFactor;
    const opp = r.kind === 'opportunity';
    r.occurrences += 1;
    r.lastDay = this.day;
    r.status = 'Occurred';
    if (opp) this.realisedOpportunities += 1; else this.realisedRisks += 1;
    const parts = [];
    let cost = 0;
    if (r.priceShock) {
      const shock = r.priceShock.pct * (0.7 + this.rng() * 0.6) * scale * (r.costShare < 1 ? 0.3 : 1);
      this.priceIndex[r.priceShock.cls] = Math.max(0.8, this.priceIndex[r.priceShock.cls] * (1 + shock));
      parts.push(`${r.priceShock.cls} price index ${shock >= 0 ? '+' : ''}${(shock * 100).toFixed(1)} %`);
    } else {
      cost = r.costImpact * (0.6 + this.rng() * 0.8) * scale * r.costShare * (opp ? -1 : 1);
    }
    let days = Math.round(r.daysImpact * (0.5 + this.rng() * 0.8) * scale);
    const targets = r.taskIds.filter((id) => activeSet.has(id));
    let target = null;
    if (targets.length) {
      const fc = this.forecast && this.forecast.nodes;
      target = targets.reduce((best, id) => (!best || (fc && fc.get(id) && fc.get(best) && fc.get(id).totalFloat < fc.get(best).totalFloat) ? id : best), null);
    }
    if (days && target) {
      const st = this.state.get(target);
      const delta = days > 0 ? days : -Math.min(-days, st.remainingWork * 0.3);
      st.remainingWork += delta;
      st.remaining = st.remainingWork;
      st.riskDays += delta;
      parts.push(`${delta > 0 ? '+' : ''}${Math.round(delta)} days on ${target}`);
    } else days = 0;
    if (cost) {
      this._spend('risk', cost, target);
      parts.push(`${cost > 0 ? '' : 'saving '}PKR ${(Math.abs(cost) / M).toFixed(0)} m`);
    }
    if (r.weather) {
      const len = r.weather === 'rain' ? 4 + Math.round(this.rng() * 5) : r.weather === 'heat' ? 4 + Math.round(this.rng() * 4) : 2 + Math.round(this.rng() * 2);
      this.forcedWeather = { kind: r.weather, intensity: 0.85 + this.rng() * 0.15, until: this.day + len };
    }
    if (r.supplyHit) this.supplyDisruption[r.supplyHit] = this.day + 20;
    if (r.safetyHit) this.safety = clamp01(this.safety - r.safetyHit);
    if (r.communityHit) this.community = clamp01(this.community - r.communityHit);
    if (['R01', 'R02', 'R24'].includes(r.id)) {
      this.community = clamp01(this.community - 0.05);
      for (const id of ['S07', 'S08', 'S15']) this.stakeholderById.get(id).satisfaction = clamp01(this.stakeholderById.get(id).satisfaction - 0.04);
    }
    if (r.id === 'R13') for (const id of ['7.3', '7.4', '7.5', '7.6', '7.7']) { const pk = this.pkgById.get(this.pkgByTask.get(id)); if (pk) pk.performance = Math.max(0.75, pk.performance - 0.08); }
    if (r.id === 'R16') for (const pk of this.procurement) if (pk.kind === 'supply' && pk.deliveryDay !== null && pk.deliveryDay > this.day) pk.deliveryDay += Math.round(days || 20);
    if (r.raisesChange && !this.raisedTemplates.includes(r.raisesChange)) this._raiseTemplate(CHANGE_TEMPLATES.find((c) => c.id === r.raisesChange));
    r.until = this.day + Math.max(r.recurring ? 10 : 5, Math.abs(days));
    if (opp) {
      this.log('good', `${r.id} opportunity realised — ${r.title}`, parts.join('; ') + '.');
    } else {
      this.log('risk', `${r.id} occurred — ${r.title}`, `${r.trigger} Impact: ${parts.join('; ') || 'absorbed'}.`);
      this._issue(r.title, `Risk ${r.id} became an issue: ${parts.join('; ') || 'impact absorbed'}.`, r.owner, Math.max(10, Math.abs(days)), r.id);
      if (['R01', 'R02', 'R10', 'R22', 'R03'].includes(r.id) && target) this._contractorClaim(target, Math.abs(cost) * 0.2, `Extension of time and cost: ${r.title.toLowerCase()} (employer risk).`);
    }
    this._lessonOnce(`risk-${r.category}`, `${r.category} risk realised (${r.id})`,
      `${r.title}. Response in place: ${r.response}. ${opp ? 'Exploit similar opportunities early.' : 'Review whether the response was proportionate to the EMV.'}`, 'Risk', r.owner);
  }

  /** Remaining exposure fraction of a risk (for Monte Carlo). */
  riskRemainingExposure(r) {
    const left = r.taskIds.filter((id) => this.state.get(id).pct < 1).length;
    if (!left) return 0;
    if (r.recurring) return Math.max(0.3, (this.forecastFinish - this.day) / 365);
    const done = r.taskIds.reduce((s, id) => s + this.state.get(id).pct, 0) / r.taskIds.length;
    return clamp01(1 - done);
  }

  respondToRisk(riskId, strategy) {
    const r = this.riskById.get(riskId);
    if (!r) return { ok: false, cost: 0, message: 'Unknown risk.' };
    const s = String(strategy || '').charAt(0).toUpperCase() + String(strategy || '').slice(1).toLowerCase();
    const allowed = r.kind === 'opportunity' ? OPPORTUNITY_STRATEGIES : THREAT_STRATEGIES;
    if (!allowed.includes(s)) return { ok: false, cost: 0, message: `${s} is not a valid ${r.kind} strategy (${allowed.join(', ')}).` };
    if (r.status === 'Closed' || r.status === 'Expired') return { ok: false, cost: 0, message: `${r.id} is ${r.status.toLowerCase()}.` };
    let cost = 0;
    let msg = '';
    const base = r.costImpact;
    if (r.kind === 'threat') {
      if (s === 'Avoid') { r.probability = r.residual * 0.15; cost = base * 0.2; r.impactFactor = 1; msg = 'Scope or method changed to remove the cause.'; }
      else if (s === 'Mitigate') { r.probability = Math.min(r.probability, r.residual); r.impactFactor = 0.8; cost = r.responseCost || base * 0.08; msg = r.strategies.find((x) => x.strategy === 'Mitigate')?.action || 'Probability and impact reduced.'; }
      else if (s === 'Transfer') { r.costShare = 0.25; cost = base * 0.08; msg = 'Financial impact transferred by contract/insurance; schedule impact remains.'; }
      else if (s === 'Escalate') { r.status = 'Escalated'; r.owner = 'Sponsor (PAA programme board)'; r.probability *= 0.8; msg = 'Outside the project’s authority — escalated to the programme board.'; }
      else { r.probability = r.rawProbability; r.impactFactor = 1; r.costShare = 1; msg = 'Actively accepted with contingency.'; }
    } else {
      if (s === 'Exploit') { r.probability = 0.95; cost = base * 0.12; msg = 'Action taken to make the opportunity certain.'; }
      else if (s === 'Enhance') { r.probability = Math.min(0.9, r.probability * 1.5); cost = base * 0.06; msg = 'Probability increased.'; }
      else if (s === 'Share') { r.probability = Math.min(0.9, r.probability * 1.3); r.costShare = 0.6; cost = base * 0.02; msg = 'Shared with a partner best able to capture it.'; }
      else if (s === 'Escalate') { r.status = 'Escalated'; msg = 'Escalated to the programme board.'; }
      else { msg = 'Accepted — benefit taken if it arises.'; }
    }
    if (s !== 'Escalate' && r.status === 'Escalated') r.status = 'Open';
    r.response = s;
    this._riskHazard(r);
    this._riskScores(r);
    if (cost) this._spend('management', cost);
    this._decision(`Risk response — ${r.id}`, `${s}: ${msg} Cost PKR ${(cost / M).toFixed(1)} m.`, r.owner);
    this.log('decision', `${r.id} response: ${s}`, msg);
    return { ok: true, cost, message: msg };
  }

  /* ----------------------------------------------------- safety/welfare */

  _safetyAndWelfare(active) {
    const people = this.resources.filter((r) => r.kind === 'people').reduce((s, r) => s + r.assigned, 0);
    const ratio = this.peakPeople ? people / this.peakPeople : 0;
    const heat = this.weather.kind === 'heat' ? this.weather.intensity : 0;
    this.recentIncidents *= 0.99;
    const crashing = active.some((t) => this.day <= this.state.get(t.id).crashUntil);
    const target = clamp01(0.78 + 0.08 * this.state.get('2.6').pct - 0.1 * heat - (crashing ? 0.06 : 0) - Math.min(0.2, this.recentIncidents * 0.04));
    this.welfare += (target - this.welfare) * 0.05;
    const p = 0.0012 * this.diff.incident * ratio * (1 + heat * 0.5) * (1.3 - this.safety) * (crashing ? 1.4 : 1);
    if (active.length && this.rng() < p) {
      this.incidents += 1;
      this.recentIncidents += 1;
      this.serial.incident += 1;
      this.safety = clamp01(this.safety - 0.04);
      this.welfare = clamp01(this.welfare - 0.03);
      const outdoor = active.filter((t) => OUTDOOR.has(t.cls));
      const t = outdoor.length ? outdoor[Math.floor(this.rng() * outdoor.length)] : active[0];
      const cost = (5 + this.rng() * 25) * M;
      const days = 1 + Math.round(this.rng() * 2);
      const st = this.state.get(t.id);
      st.remainingWork += days;
      st.remaining = st.remainingWork;
      this._spend('risk', cost, t.id);
      this.log('bad', `Safety incident on ${t.code}`, `Lost-time injury during ${t.name.toLowerCase()}; stand-down ${days} day(s), PKR ${(cost / M).toFixed(0)} m.`);
      this._issue(`Lost-time injury on ${t.code}`, 'Investigation, root cause and corrective actions required.', 'HSE Manager', 14, 'safety');
      this.stakeholderById.get('S14').satisfaction = clamp01(this.stakeholderById.get('S14').satisfaction - 0.04);
      this._lessonOnce('incident', 'First lost-time injury', 'Heat, crowding and schedule compression drive incident rates; plan rest breaks and avoid crashing in May–June.', 'Safety', 'HSE Manager');
    } else {
      this.safety = clamp01(this.safety + (0.95 - this.safety) * 0.004);
    }
  }

  /* -------------------------------------------------------- procurement */

  _procurementStep() {
    const now = this.day;
    for (const pk of this.procurement) {
      if (pk.status === 'Planned' && now >= pk.plan.rfpDay) {
        pk.status = 'RFP';
        pk.rfpDay = now;
        this.log('info', `${pk.id} RFP issued`, `${pk.name} (${pk.contractType}).`);
      }
      if (pk.status === 'RFP' && now >= pk.plan.evaluationDay) pk.status = 'Evaluating';
      if ((pk.status === 'Evaluating' || pk.status === 'RFP') && now >= pk.plan.awardDay && !pk.vendor) {
        const best = weightedScore(pk.bids, DEFAULT_WEIGHTS)[0];
        this._awardTo(pk, best.vendor, 'Procurement board (default evaluation)');
      }
      if (pk.status === 'Awarded' && pk.packageIds.some((id) => this.state.get(id).actualStart !== null)) pk.status = 'Delivering';
      if (pk.vendor) {
        const ev = pk.packageIds.reduce((s, id) => s + this.state.get(id).pct * this.taskById.get(id).budget, 0);
        const est = pk.packageIds.reduce((s, id) => s + this.taskById.get(id).budget, 0);
        pk.delivered = est > 0 ? ev / est : 0;
        if (now % 30 === 0 && pk.status === 'Delivering') {
          const gross = ev * pk.priceRatio;
          const due = gross - pk.paid - pk.retention;
          if (due > 1) {
            const ret = due * 0.05;
            pk.retention += ret;
            pk.paid += due - ret;
            pk.payments.push({ day: now, gross: Math.round(due), retention: Math.round(ret), net: Math.round(due - ret), cumulative: Math.round(pk.paid) });
            if (pk.payments.length > 80) pk.payments.shift();
          }
        }
        for (const c of pk.claims) {
          if (c.status === 'Submitted' && now >= c.day + 30) c.status = 'Assessed';
          else if (c.status === 'Assessed' && now >= c.day + 60) {
            c.status = 'Settled';
            c.settled = Math.round(c.amount * (c.amount >= 0 ? 0.6 : 0.5));
            this._spend('claims', c.settled, null);
            this.log('info', `${c.id} settled`, `${pk.id}: PKR ${(c.settled / M).toFixed(1)} m (${c.reason})`);
          }
        }
        if (pk.status === 'Delivering' && pk.packageIds.every((id) => this.state.get(id).pct >= 1)) this._closePackage(pk);
      }
    }
  }

  _awardTo(pk, vendor, by) {
    const bid = pk.bids.find((b) => b.vendor === vendor);
    pk.vendor = vendor;
    pk.awardedValue = bid.price;
    pk.priceRatio = bid.price / pk.estimate;
    pk.performance = clamp(1 + (bid.technical - pk.plannedTechnical) * 0.004, 0.85, 1.05);
    pk.awardDay = this.day;
    pk.status = 'Awarded';
    if (pk.kind === 'supply') pk.deliveryDay = this.day + pk.leadTime;
    this._decision(`Contract award — ${pk.id}`, `${pk.name} awarded to ${vendor} (${pk.contractType}) for PKR ${(bid.price / 1e9).toFixed(2)} bn.`, by);
    this.log('decision', `${pk.id} awarded to ${vendor}`, `${pk.contractType}, PKR ${(bid.price / 1e9).toFixed(2)} bn, weighted score ${bid.score.toFixed(1)}.`);
  }

  _contractorClaim(taskId, amount, reason) {
    const pkId = this.pkgByTask.get(taskId);
    if (!pkId || !amount) return null;
    const pk = this.pkgById.get(pkId);
    if (!pk.vendor) return null;
    this.serial.claim += 1;
    const c = { id: `CL${pad(this.serial.claim, 3)}`, day: this.day, amount: Math.round(amount), reason, status: 'Submitted', settled: 0, by: pk.vendor };
    pk.claims.push(c);
    return c;
  }

  _closePackage(pk) {
    pk.status = 'Closed';
    pk.closedDay = this.day;
    const actual = pk.packageIds.reduce((s, id) => s + this.state.get(id).actualCost, 0);
    const value = pk.awardedValue + pk.variations.reduce((s, v) => s + v.value, 0);
    const t = pk.terms;
    let params;
    if (pk.contractType === 'FFP') params = { type: 'FFP', price: value, actualCost: actual * 0.93 };
    else if (pk.contractType === 'FPIF' || pk.contractType === 'CPIF') {
      const targetCost = value / (1 + (t.feePct || 0.1));
      params = { type: pk.contractType, targetCost, targetFee: value - targetCost, buyerShare: t.buyerShare || 0.8, ceiling: targetCost * (t.ceilingPct || 1.2),
        minFee: t.minFeePct ? targetCost * t.minFeePct : undefined, maxFee: t.maxFeePct ? targetCost * t.maxFeePct : undefined, actualCost: actual / (1 + (t.feePct || 0.1)) };
    } else if (pk.contractType === 'CPFF') {
      const est = value / (1 + (t.feePct || 0.08));
      params = { type: 'CPFF', fee: value - est, actualCost: actual / (1 + (t.feePct || 0.08)) };
    } else if (pk.contractType === 'CPAF') {
      const est = value / (1 + t.baseFeePct + t.awardPoolPct);
      const late = pk.packageIds.reduce((m, id) => Math.max(m, this.state.get(id).actualFinish - this.baseline.nodes.get(id).ef), 0);
      params = { type: 'CPAF', baseFee: est * t.baseFeePct, awardPool: est * t.awardPoolPct, awardScore: clamp01(this.qualityIndex - Math.max(0, late) / 200), actualCost: actual / (1 + t.baseFeePct + t.awardPoolPct) };
    } else {
      params = { type: 'T&M', hours: actual / 2400, rate: 2400, materials: 0, nte: value * (t.nteFactor || 1.15), actualCost: actual * 0.9 };
    }
    const outcome = contractOutcome(params);
    pk.finalAccount = { day: this.day, contractValue: Math.round(value), actualCost: Math.round(actual), ...Object.fromEntries(Object.entries(outcome).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])) };
    if (!this.finished) this.log('info', `${pk.id} closed`, `${pk.name}: final account agreed; retention PKR ${(pk.retention / M).toFixed(0)} m released.`);
  }

  evaluateBids(pkgId, weights = DEFAULT_WEIGHTS) {
    const pk = this.pkgById.get(pkgId);
    if (!pk) return [];
    return weightedScore(pk.bids, weights);
  }

  award(pkgId, vendor) {
    const pk = this.pkgById.get(pkgId);
    if (!pk) return { ok: false, message: 'Unknown package.' };
    if (pk.vendor) return { ok: false, message: `${pk.id} already awarded to ${pk.vendor}.` };
    if (pk.status === 'Planned') return { ok: false, message: 'Issue the RFP before awarding (RFP opens on the planned day).' };
    if (!pk.bids.some((b) => b.vendor === vendor)) return { ok: false, message: 'Vendor did not bid.' };
    this._awardTo(pk, vendor, 'Project Director');
    return { ok: true, message: `${pk.id} awarded to ${vendor}.` };
  }

  raiseClaim(pkgId, amount, reason = 'Claim') {
    const pk = this.pkgById.get(pkgId);
    if (!pk || !pk.vendor) return { ok: false, message: 'Package not awarded.' };
    this.serial.claim += 1;
    const c = { id: `CL${pad(this.serial.claim, 3)}`, day: this.day, amount: Math.round(Number(amount) || 0), reason, status: 'Submitted', settled: 0, by: amount < 0 ? 'Employer (back-charge)' : pk.vendor };
    pk.claims.push(c);
    this._decision(`Claim ${c.id} raised on ${pk.id}`, `${reason}: PKR ${(c.amount / M).toFixed(1)} m.`, 'Commercial Manager');
    return { ok: true, claim: c, message: `${c.id} submitted for assessment.` };
  }

  /* ------------------------------------------------------------ changes */

  _changeControl() {
    for (const tpl of CHANGE_TEMPLATES) {
      if (this.raisedTemplates.includes(tpl.id)) continue;
      if (this.state.get(tpl.trigger.task).pct >= tpl.trigger.pct) this._raiseTemplate(tpl);
    }
    for (const c of this.changes) {
      if (c.status === 'Raised' && this.day >= c.day + 5) this.analyseChange(c.id);
      if (c.status === 'Analysed' && this.day >= c.day + 15) {
        const tally = tallyVotes(c.votes);
        this.decideChange(c.id, tally.decision === 'Approved', 'CCB (majority vote)');
      }
      if (c.status === 'Approved' && this.day >= c.decisionDay + 2) this.implementChange(c.id);
    }
  }

  _raiseTemplate(tpl) {
    this.raisedTemplates.push(tpl.id);
    return this.raiseChange({
      title: tpl.title, description: tpl.description, raisedBy: tpl.raisedBy, wbs: tpl.target, template: tpl.id,
      impact: { scope: tpl.description, days: tpl.days, cost: tpl.costM * M, risk: tpl.risk, quality: tpl.quality }, merit: tpl.merit, agilePoints: tpl.agilePoints || 0,
    });
  }

  raiseChange({ title, description = '', raisedBy = 'Project Director', impact = {}, wbs = null, merit = 0.5, template = null, agilePoints = 0 } = {}) {
    this.serial.change += 1;
    const target = wbs && this.taskById.has(wbs) ? wbs : null;
    const c = {
      id: `CR${pad(this.serial.change)}`, title: title || 'Change request', description, raisedBy, day: this.day, status: 'Raised',
      impact: { scope: impact.scope || description, days: Number(impact.days) || 0, cost: Number(impact.cost) || 0, risk: Number(impact.risk) || 0, quality: Number(impact.quality) || 0 },
      wbs: target, template, merit, agilePoints, votes: {}, decisionDay: null, decidedBy: null, implementedDay: null,
    };
    this.changes.push(c);
    const who = this.stakeholderById.get(raisedBy);
    this.log('change', `${c.id} raised — ${c.title}`, `${who ? who.role : raisedBy}: ${description}`);
    return c;
  }

  analyseChange(id) {
    const c = this.changes.find((x) => x.id === id);
    if (!c) return null;
    const node = c.wbs && this.forecast ? this.forecast.nodes.get(c.wbs) : null;
    const float = node ? Math.max(0, node.totalFloat) : 0;
    c.impact.scheduleDays = Math.max(0, Math.round(c.impact.days - float));
    c.impact.costRatio = c.impact.cost / this.bac;
    c.impact.float = Math.round(float);
    for (const m of CCB_MEMBERS) {
      if (c.votes[m.role]) continue;
      c.votes[m.role] = ruleVote(m, { merit: c.merit, costRatio: c.impact.costRatio, scheduleDays: c.impact.scheduleDays, quality: c.impact.quality, risk: c.impact.risk });
    }
    if (c.status === 'Raised') c.status = 'Analysed';
    c.analysedDay = this.day;
    return c.impact;
  }

  voteChange(id, role, approve) {
    const c = this.changes.find((x) => x.id === id);
    if (!c || !['Raised', 'Analysed'].includes(c.status)) return null;
    c.votes[role] = approve ? 'approve' : 'reject';
    return tallyVotes(c.votes);
  }

  decideChange(id, approve, by = 'Project Director (CCB chair delegate)') {
    const c = this.changes.find((x) => x.id === id);
    if (!c || !['Raised', 'Analysed'].includes(c.status)) return null;
    if (c.status === 'Raised') this.analyseChange(id);
    c.status = approve ? 'Approved' : 'Rejected';
    c.decisionDay = this.day;
    c.decidedBy = by;
    const who = this.stakeholderById.get(c.raisedBy);
    if (who) who.satisfaction = clamp01(who.satisfaction + (approve ? 0.06 : -0.05));
    if (approve && c.impact.costRatio > 0.01) this.stakeholderById.get('S04').satisfaction = clamp01(this.stakeholderById.get('S04').satisfaction - 0.02);
    this._decision(`${c.id} ${c.status.toLowerCase()}`, `${c.title} — ${by}. Votes: ${JSON.stringify(tallyVotes(c.votes))}.`, by);
    this.log('change', `${c.id} ${c.status.toLowerCase()}`, `${c.title} (${by}).`);
    if (approve) this._lessonOnce('scope-creep', 'Scope creep through change requests', 'Several stakeholders asked for additions after baselining; integrated change control kept them visible and funded from the management reserve.', 'Scope');
    return c;
  }

  implementChange(id) {
    const c = this.changes.find((x) => x.id === id);
    if (!c || c.status !== 'Approved') return null;
    const t = c.wbs ? this.taskById.get(c.wbs) : null;
    let note = '';
    if (t) {
      const st = this.state.get(t.id);
      if (t.delivery === 'agile' && c.agilePoints) {
        const ag = this.agile;
        const total = ag.epicPoints[t.id];
        const pts = [Math.ceil(c.agilePoints / 2), Math.floor(c.agilePoints / 2)].filter((x) => x > 0);
        pts.forEach((p, i) => {
          const n = ag.backlog.length + 1;
          ag.backlog.push({ id: `US${pad(n)}`, title: `${c.title} — part ${i + 1}`, points: p, epic: t.id, epicName: EPIC_NAMES[t.id], priority: ag.backlog.length + 1, status: 'backlog', sprint: null, effort: 0, doneDay: null, change: c.id });
        });
        ag.epicPoints[t.id] = total + c.agilePoints;
        ag.totalPoints += c.agilePoints;
        const scale = (total + c.agilePoints) / total;
        // Keep EV continuous: done points / new total × scaled budget = unchanged EV.
        const added = t.budget * (scale - 1);
        t.budget += added;
        t.materialBudget += added;
        c.impact.cost = Math.round(added);
        const extraDays = Math.round((c.agilePoints / ag.plannedVelocity) * ag.sprintLength);
        t.duration += extraDays; t.o += extraDays; t.m += extraDays; t.p += extraDays;
        st.remainingWork = (1 - st.pct) * t.duration;
        st.remaining = st.remainingWork;
        note = `${c.agilePoints} points added to the ${EPIC_NAMES[t.id]} backlog.`;
      } else if (st.pct < 1) {
        const d = c.impact.days;
        const extraLabour = t.dailyLabour * d;
        t.duration += d; t.o += d; t.m += d; t.p += d;
        t.crashDuration = Math.max(1, Math.round(t.duration * 0.8));
        t.budget += c.impact.cost;
        t.labourBudget += extraLabour;
        t.materialBudget += Math.max(0, c.impact.cost - extraLabour);
        t.crashCost = Math.round(t.budget * (1 + (CRASH_PREMIUM[t.cls] || 0.1)));
        t.costSlope = costSlope(t);
        // Earned value is preserved: new pct = earned / new budget.
        const earned = st.pct * (t.budget - c.impact.cost);
        st.pct = earned / t.budget;
        st.remainingWork += d;
        st.remaining = st.remainingWork;
        note = `${d} days and PKR ${(c.impact.cost / M).toFixed(0)} m added to ${t.code}.`;
      } else note = `${t.code} already complete; change recorded for the next phase.`;
      const pkId = this.pkgByTask.get(t.id);
      if (pkId) this.pkgById.get(pkId).variations.push({ change: c.id, day: this.day, value: Math.round(c.impact.cost) });
    }
    this.managementRemaining -= c.impact.cost;
    this.scopeChanges += 1;
    c.status = 'Implemented';
    c.implementedDay = this.day;
    this._rebaseline(`${c.id} ${c.title}: ${note}`);
    this._recomputeForecast();
    return c;
  }

  /* -------------------------------------------------------- stakeholders */

  _updateStakeholders() {
    const e = this.evm();
    const ctx = {
      schedule: clamp01((e.spit - 0.8) / 0.3), cost: clamp01((e.cpi - 0.8) / 0.3), quality: this.qualityIndex, safety: this.safety,
      community: this.community, welfare: this.welfare, readiness: this._packageIndex(['10', '11']), gate: clamp01(1 - this.autoGateApprovals * 0.12),
    };
    for (const s of this.stakeholders) {
      let w = 0;
      let v = 0;
      for (const [k, wt] of Object.entries(s.drivers)) { w += wt; v += wt * (ctx[k] === undefined ? 0.7 : ctx[k]); }
      const target = clamp01((w ? v / w : 0.7) * 0.9 + (s.current - 3) * 0.04 + 0.05);
      s.satisfaction = clamp01(s.satisfaction + (target - s.satisfaction) * 0.06);
      if (this.day % 28 === 0) {
        if (s.satisfaction > 0.72 && s.current < Math.min(4, s.desired)) s.current += 1;
        else if (s.satisfaction < 0.35 && s.current > 2) s.current -= 1;
        s.levelName = engagementLabel(s.current);
      }
    }
    this.stakeholderSatisfaction = this._weightedSatisfaction();
  }

  _packageIndex(ids) {
    let pv = 0;
    let ev = 0;
    for (const t of this.tasks) {
      if (!ids.includes(t.summaryId) || !t.budget) continue;
      ev += this.state.get(t.id).pct * t.budget;
      pv += this.plannedValueOf(t.id);
    }
    return pv > 0 ? clamp01((ev / pv - 0.7) / 0.4) : 0.75;
  }

  _weightedSatisfaction() {
    let w = 0;
    let v = 0;
    for (const s of this.stakeholders) { w += s.power; v += s.power * s.satisfaction; }
    return w ? v / w : 0;
  }

  engageStakeholder(id, action) {
    const s = this.stakeholderById.get(id);
    const a = ENGAGE_ACTIONS[action];
    if (!s) return { ok: false, message: 'Unknown stakeholder.' };
    if (!a) return { ok: false, message: `Unknown action (${Object.keys(ENGAGE_ACTIONS).join(', ')}).` };
    if (s.lastEngaged !== null && this.day - s.lastEngaged < 14) return { ok: false, message: `${s.role} was engaged ${this.day - s.lastEngaged} days ago — wait for the next cycle.` };
    const fit = action === 'empower' && s.power < 0.5 ? 0.4 : action === 'inform' && s.power > 0.8 ? 0.6 : 1;
    s.satisfaction = clamp01(s.satisfaction + a.gain * fit);
    if (s.current < a.cap) s.current += 1;
    s.levelName = engagementLabel(s.current);
    s.lastEngaged = this.day;
    s.engagements += 1;
    if (['S07', 'S08'].includes(id)) this.community = clamp01(this.community + 0.03 * fit);
    const cost = a.cost * M;
    this._spend('management', cost);
    this.stakeholderSatisfaction = this._weightedSatisfaction();
    const message = `${action[0].toUpperCase() + action.slice(1)} — ${s.role} now ${s.levelName} (desired ${engagementLabel(s.desired)}).${fit < 1 ? ' The action was a poor fit for this stakeholder’s power.' : ''}`;
    this._decision(`Stakeholder engagement — ${s.id}`, message, 'Project Director');
    return { ok: true, cost, message };
  }

  _updateRequirements() {
    for (const r of this.requirements) {
      const st = r.wbs.map((id) => this.state.get(id));
      r.status = st.every((x) => x.pct >= 1) ? 'Verified' : st.some((x) => x.actualStart !== null) ? 'In progress' : 'Approved';
    }
  }

  /* ------------------------------------------------------- issues/gates */

  _issuesStep() {
    for (const is of this.issues) if (is.status === 'Open' && this.day >= is.resolveDay) is.status = 'Resolved';
  }

  _approveGate(gate, by, when) {
    gate.status = 'approved';
    gate.day = when;
    gate.approvedBy = by;
    this._decision(`Gate ${gate.id} approved`, `${gate.name} — ${by}.`, by);
  }

  approveGate(id) {
    const gate = this.gateById.get(id);
    if (!gate) return { ok: false, message: 'Unknown gate.' };
    if (gate.status === 'approved') return { ok: false, message: `${id} already approved.` };
    if (gate.status !== 'ready') {
      const t = this.taskById.get(gate.milestone);
      const missing = t.predecessors.filter((l) => this.state.get(l.id).pct < 1).map((l) => l.id);
      return { ok: false, message: `${id} not ready — outstanding: ${missing.join(', ')}.` };
    }
    this._approveGate(gate, 'Project board', this.day);
    const st = this.state.get(gate.milestone);
    st.pct = 1; st.actualStart = this.day; st.actualFinish = this.day; st.remainingWork = 0; st.remaining = 0; st.blocked = null;
    const t = this.taskById.get(gate.milestone);
    this.log('milestone', `${t.id} ${t.name}`, `Approved by the project board on ${this.dateLabel()} (${this.day - gate.readyDay} days after readiness).`);
    this.stakeholderById.get('S01').satisfaction = clamp01(this.stakeholderById.get('S01').satisfaction + 0.02);
    this._phaseFromGates();
    return { ok: true, message: `${gate.name} approved.` };
  }

  _phaseFromGates() {
    let phase = 'initiating';
    for (const g of this.gates) if (g.status === 'approved') phase = g.next;
    if (this.finished) phase = 'closing';
    if (phase !== this.phase) {
      this.phase = phase;
      this.log('info', `Phase: ${phase}`, `The programme moved into the ${phase} phase.`);
    }
  }

  /* --------------------------------------------------------- forecasting */

  _liveTasks() {
    const now = this.day;
    return this.tasks.map((t) => {
      const st = this.state.get(t.id);
      const base = { id: t.id, name: t.name, predecessors: t.predecessors, budget: t.budget, o: t.o, p: t.p };
      if (st.pct >= 1) return { ...base, duration: 0, fixedStart: st.actualStart - now, fixedFinish: st.actualFinish - now, crashable: false };
      let rem = st.remainingWork;
      if (st.actualStart !== null && st.daysActive > 10 && t.delivery !== 'agile') rem /= clamp(st.workDone / st.daysActive, 0.5, 1.5);
      if (t.delivery === 'agile' && this.agile.velocity.length) rem *= clamp(this.agile.plannedVelocity / Math.max(0.1, velocityStats(this.agile.velocity).average3), 0.7, 2);
      const capacity = t.milestone ? 0 : Math.max(0, (t.duration - t.crashDuration) * (st.remainingWork / Math.max(1, t.duration)) - 0);
      const out = { ...base, duration: rem, crashDuration: Math.max(0, rem - capacity), crashCost: t.budget + (t.costSlope || 0) * capacity, crashable: !t.milestone && capacity >= 1 };
      if (st.actualStart !== null) out.fixedStart = st.actualStart - now;
      else if (st.notBefore > now) out.minStart = st.notBefore - now;
      return out;
    });
  }

  _recomputeForecast() {
    const live = this._liveTasks();
    this.forecast = computeCPM(live);
    this.forecastFinish = this.day + Math.ceil(this.forecast.duration);
    if (this.finished) this.forecastFinish = this.day;
    this.scheduleVarianceDays = this.forecastFinish - this.baselineDuration;
    this.forecastPert = pertAnalysis(this.forecast, live, this.baselineDuration - this.day);
    this.forecastDay = this.day;
  }

  /** Live re-forecast on demand (also runs automatically every 14 days). */
  reforecast() {
    this._recomputeForecast();
    return { forecastFinish: this.forecastFinish, scheduleVarianceDays: this.scheduleVarianceDays, criticalPath: this.forecast.criticalPath, probabilityOnTime: this.forecastPert.probability };
  }

  crashPlan(days) {
    const r = crashCandidates(null, this._liveTasks(), Math.max(0, Math.round(days)));
    const plan = r.plan.map((p) => ({ id: p.id, name: p.name, days: p.days, cost: p.cost, slope: p.slope }));
    plan.recovered = r.recovered;
    plan.addedCost = r.addedCost;
    plan.shortfall = r.shortfall;
    plan.steps = r.steps.length;
    return plan;
  }

  applyCrashPlan(days) {
    const plan = this.crashPlan(days);
    let cost = 0;
    let bought = 0;
    for (const p of plan) {
      const res = this.crashActivity(p.id, p.days, true);
      if (res.ok) { cost += res.cost; bought += res.days; }
    }
    this._recomputeForecast();
    const summary = { plan, recovered: plan.recovered, cost, activityDays: bought, forecastFinish: this.forecastFinish };
    this._decision('Crash plan applied', `${plan.length} activities crashed for ${plan.recovered} days; PKR ${(cost / M).toFixed(0)} m from management reserve.`, 'Project Director');
    return summary;
  }

  crashActivity(id, days, quiet = false) {
    const t = this.taskById.get(id);
    const st = this.state.get(id);
    if (!t || t.milestone || st.pct >= 1) return { ok: false, days: 0, cost: 0, message: 'Not crashable.' };
    const capacity = Math.max(0, (t.duration - t.crashDuration) * (st.remainingWork / Math.max(1, t.duration)) - 0);
    const take = Math.min(Number(days) || 0, capacity, st.remainingWork - 1);
    if (take <= 0) return { ok: false, days: 0, cost: 0, message: 'No crash capacity left.' };
    const cost = take * t.costSlope;
    st.remainingWork -= take;
    st.remaining = st.remainingWork;
    st.crashed += take;
    st.crashUntil = this.day + Math.ceil(st.remainingWork);
    this.crashedDays += take;
    this._spend('crash', cost, id);
    if (!quiet) {
      this._decision(`Crashed ${t.code}`, `${take.toFixed(0)} days bought at PKR ${(t.costSlope / M).toFixed(2)} m/day.`, 'Project Director');
      this._recomputeForecast();
    }
    this.log('decision', `${t.code} crashed`, `${take.toFixed(0)} days for PKR ${(cost / M).toFixed(0)} m (slope ${(t.costSlope / M).toFixed(2)} m/day).`);
    return { ok: true, days: take, cost, message: 'Crashed.' };
  }

  fastTrack(id) {
    const t = this.taskById.get(id);
    const st = this.state.get(id);
    if (!t || t.milestone || st.actualStart !== null) return { ok: false, daysSaved: 0, riskAdded: null, message: 'Only unstarted activities can be fast-tracked.' };
    const links = t.predecessors.filter((l) => (l.type || 'FS') === 'FS' && (l.lag || 0) >= 0 && this.taskById.get(l.id) && !this.taskById.get(l.id).milestone && this.state.get(l.id).pct < 1);
    if (!links.length) return { ok: false, daysSaved: 0, riskAdded: null, message: 'No finish-to-start predecessor left to overlap.' };
    this._recomputeForecast();
    const before = this.forecastFinish;
    const driving = links.reduce((a, b) => (this.forecast.nodes.get(a.id).ef + (a.lag || 0) >= this.forecast.nodes.get(b.id).ef + (b.lag || 0) ? a : b));
    const pred = this.taskById.get(driving.id);
    const lead = Math.round(0.3 * Math.min(pred.duration, t.duration));
    driving.lag = -lead;
    st.fastTracked = true;
    const rk = this.riskById.get('R26');
    rk.probability = Math.min(0.9, rk.probability + 0.05);
    this._riskHazard(rk);
    this._riskScores(rk);
    this._recomputeForecast();
    const saved = before - this.forecastFinish;
    const riskAdded = `Rework risk on ${t.code} up (overlap with ${pred.code}); R26 probability +5 %.`;
    this._decision(`Fast-tracked ${t.code}`, `FS link from ${pred.code} changed to a ${lead}-day lead; forecast ${saved >= 0 ? 'gains' : 'loses'} ${Math.abs(saved)} days.`, 'Project Director');
    this.log('decision', `${t.code} fast-tracked`, riskAdded);
    return { ok: true, daysSaved: saved, riskAdded, message: `${t.code} now overlaps ${pred.code} by ${lead} days.` };
  }

  /* ---------------------------------------------------------- effects */

  applyEffect(effect = {}, source = 'Decision') {
    const applied = [];
    const e = effect || {};
    const frac = (v) => (Math.abs(v) > 1 ? v / 100 : v);
    if (e.days) {
      const id = e.wbs && this.taskById.has(e.wbs) ? e.wbs : this._criticalActive();
      if (id) {
        const st = this.state.get(id);
        const d = e.days > 0 ? e.days : -Math.min(-e.days, st.remainingWork * 0.5);
        st.remainingWork = Math.max(0, st.remainingWork + d);
        st.remaining = st.remainingWork;
        applied.push(`${d > 0 ? '+' : ''}${Math.round(d)} days on ${id}`);
      }
    }
    if (e.cost) {
      const c = Math.abs(e.cost) < 1e5 ? e.cost * M : e.cost;
      this._spend('management', c);
      applied.push(`PKR ${(c / M).toFixed(1)} m`);
    }
    if (e.quality) { this.failEwma = clamp(this.failEwma - frac(e.quality) * 0.05, 0, 0.25); this.qualityIndex = clamp01(this.qualityIndex + frac(e.quality)); applied.push('quality'); }
    if (e.safety) { this.safety = clamp01(this.safety + frac(e.safety)); applied.push('safety'); }
    if (e.welfare) { this.welfare = clamp01(this.welfare + frac(e.welfare)); applied.push('welfare'); }
    if (e.scope) {
      const id = e.wbs && this.taskById.has(e.wbs) ? e.wbs : this._criticalActive();
      if (id) {
        const t = this.taskById.get(id);
        const st = this.state.get(id);
        const add = frac(e.scope) * t.duration;
        st.remainingWork = Math.max(0, st.remainingWork + add);
        st.remaining = st.remainingWork;
        applied.push(`scope ${add > 0 ? '+' : ''}${add.toFixed(1)} work-days on ${id}`);
      }
    }
    if (e.risk && this.riskById.has(e.risk.id)) {
      const r = this.riskById.get(e.risk.id);
      r.probability = clamp(r.probability + (e.risk.dp || 0), 0, 0.97);
      this._riskHazard(r);
      this._riskScores(r);
      applied.push(`${r.id} P ${(r.probability * 100).toFixed(0)} %`);
    }
    if (e.stakeholder && this.stakeholderById.has(e.stakeholder.id)) {
      const s = this.stakeholderById.get(e.stakeholder.id);
      s.satisfaction = clamp01(s.satisfaction + frac(e.stakeholder.d || 0));
      applied.push(`${s.id} satisfaction`);
    }
    if (e.satisfaction) {
      for (const s of this.stakeholders) s.satisfaction = clamp01(s.satisfaction + frac(e.satisfaction));
      applied.push('all stakeholders');
    }
    this.stakeholderSatisfaction = this._weightedSatisfaction();
    this._decision(source, applied.join('; ') || 'No measurable effect.', 'Project Director');
    this.log('decision', source, applied.join('; ') || 'Recorded.');
    return { ok: true, applied };
  }

  _criticalActive() {
    const fc = this.forecast && this.forecast.nodes;
    let best = null;
    for (const id of this.activeIds) if (!best || (fc && fc.get(id).totalFloat < fc.get(best).totalFloat)) best = id;
    if (best) return best;
    const cp = this.forecast ? this.forecast.criticalPath.filter((id) => !this.taskById.get(id).milestone && this.state.get(id).pct < 1) : [];
    return cp[0] || null;
  }

  /* ------------------------------------------------------------- metrics */

  plannedValueAt(day) {
    return this.pvCurve[Math.max(0, Math.min(this.pvCurve.length - 1, Math.floor(day)))];
  }

  plannedValueOf(id, day = this.day) {
    const n = this.baseline.nodes.get(id);
    const b = this.baselineBudget.get(id) || 0;
    if (!n || !b) return 0;
    if (day >= n.ef) return b;
    if (day <= n.es) return 0;
    return (b * (day - n.es)) / (n.ef - n.es);
  }

  etcBottomUp() {
    let etc = 0;
    for (const t of this.tasks) {
      const st = this.state.get(t.id);
      if (st.pct >= 1) continue;
      etc += (1 - st.pct) * t.materialBudget * this.priceFactor(t) + st.remainingWork * t.dailyLabour;
    }
    return etc;
  }

  evm() {
    const m = evmMetrics({ bac: this.bac, pv: this.pv, ev: this.ev, ac: this.ac, etcBottomUp: this.etcBottomUp() });
    const es = earnedSchedule(this.pvCurve, this.ev, this.day, this.baselineDuration);
    return { ...m, es: es.es, svt: es.svt, spit: es.spit, ieact: es.ieact };
  }

  get riskExposure() {
    return this.risks.filter((r) => r.kind === 'threat' && ['Open', 'Escalated', 'Occurred'].includes(r.status)).reduce((s, r) => s - r.emv, 0);
  }

  _recordEvm() {
    const e = this.evm();
    this.evmHistory.push({ day: this.day, pv: e.pv, ev: e.ev, ac: e.ac, spi: e.spi, cpi: e.cpi, eac: e.eac.cpi, spit: e.spit, svt: e.svt });
    if (this.evmHistory.length > 600) this.evmHistory.shift();
    this.resourceHistory.push({ day: this.day, values: Object.fromEntries(this.resources.map((r) => [r.id, [r.assigned, r.required]])) });
    if (this.resourceHistory.length > 600) this.resourceHistory.shift();
  }

  snapshot() {
    const e = this.evm();
    const sprint = this.agile.currentSprint;
    return {
      day: this.day, date: this.date().toISOString().slice(0, 10), dateLabel: this.dateLabel(), phase: this.phase,
      progress: this.bac ? this.ev / this.bac : 0,
      bac: this.bac, pv: e.pv, ev: e.ev, ac: e.ac, sv: e.sv, cv: e.cv, spi: e.spi, cpi: e.cpi,
      eac: e.eac.cpi, eacs: e.eac, etc: e.etc, vac: e.vac, tcpi: e.tcpi.bac, tcpis: e.tcpi,
      es: e.es, svt: e.svt, spit: e.spit,
      baselineDuration: this.baselineDuration, forecastFinish: this.forecastFinish, forecastDateLabel: this.dateLabel(this.forecastFinish),
      scheduleVarianceDays: this.scheduleVarianceDays,
      contingencyReserve: this.contingencyReserve, contingencyRemaining: this.contingencyRemaining,
      managementReserve: this.managementReserve, managementRemaining: this.managementRemaining,
      riskExposure: this.riskExposure, openRisks: this.risks.filter((r) => r.status === 'Open').length, realisedRisks: this.realisedRisks,
      realisedOpportunities: this.realisedOpportunities,
      qualityIndex: this.qualityIndex, safety: this.safety, welfare: this.welfare, incidents: this.incidents,
      stakeholderSatisfaction: this.stakeholderSatisfaction, community: this.community,
      openChanges: this.changes.filter((c) => c.status === 'Raised' || c.status === 'Analysed' || c.status === 'Approved').length,
      openIssues: this.issues.filter((i) => i.status === 'Open').length, openNcrs: this.ncrs.filter((n) => n.status === 'Open').length,
      weather: { ...this.weather }, criticalPath: this.forecast ? this.forecast.criticalPath.slice() : [],
      finished: this.finished, velocity: this.agile.velocity.length ? velocityStats(this.agile.velocity).average3 : 0,
      sprint: sprint ? sprint.n : null, budgetBurn: this.bac ? this.ac / this.bac : 0,
      activeTasks: this.activeIds.length, workforce: this.resources.filter((r) => r.kind === 'people').reduce((s, r) => s + r.assigned, 0),
      gates: this.gates.map((g) => ({ id: g.id, status: g.status })), difficulty: this.difficulty, approach: this.approach,
      operational: this._operational(), baselineVersion: this.baselineVersion, simulated: true,
    };
  }

  _operational() {
    return this.gateById.get('G3').status === 'approved' || this.finished;
  }

  get missionContext() {
    const self = this;
    const e = this.evm();
    return {
      day: this.day, phase: this.phase, finished: this.finished, progress: this.bac ? this.ev / this.bac : 0,
      pct: (id) => (self.state.get(id) ? self.state.get(id).pct : 0),
      gateApproved: (id) => !!self.gateById.get(id) && self.gateById.get(id).status === 'approved',
      awarded: (id) => !!self.pkgById.get(id) && !!self.pkgById.get(id).vendor,
      spi: e.spi, cpi: e.cpi, spit: e.spit, svt: e.svt, tcpi: e.tcpi.bac,
      qualityIndex: this.qualityIndex, safety: this.safety, welfare: this.welfare,
      stakeholderSatisfaction: this.stakeholderSatisfaction, minEngagement: Math.min(...this.stakeholders.map((s) => s.current)),
      realisedRisks: this.realisedRisks, respondedRisks: this.decisionLog.filter((d) => d.title.startsWith('Risk response')).length,
      openChanges: this.changes.filter((c) => ['Raised', 'Analysed'].includes(c.status)).length,
      decidedChanges: this.changes.filter((c) => c.decidedBy && !c.decidedBy.startsWith('CCB')).length,
      sprintsDone: this.agile.velocity.length, velocity: this.agile.velocity.length ? velocityStats(this.agile.velocity).average3 : 0,
      ncrs: this.ncrs.length, inspectionLevel: this.inspectionLevel, crashedDays: this.crashedDays,
      contingencyRemaining: this.contingencyRemaining, operational: this._operational(),
      engagements: this.stakeholders.reduce((s, x) => s + x.engagements, 0), lessons: this.lessons.length,
    };
  }

  /* ---------------------------------------------------------- world link */

  worldState() {
    const pct = {};
    for (const t of this.tasks) pct[t.id] = this.state.get(t.id).pct;
    for (const s of this.summaries) {
      let b = 0;
      let v = 0;
      for (const t of this.tasks) if (t.summaryId === s.id && t.budget) { b += t.budget; v += t.budget * pct[t.id]; }
      pct[s.id] = b ? v / b : 0;
    }
    const people = this.resources.filter((r) => r.kind === 'people').reduce((s, r) => s + r.assigned, 0);
    return {
      pct, workforce: this.peakPeople ? clamp01(people / this.peakPeople) : 0, phase: this.phase,
      operational: this._operational(), weather: { ...this.weather }, activeIds: this.activeIds.slice(), day: this.day,
      progress: this.bac ? this.ev / this.bac : 0,
    };
  }

  previewState(f) {
    const d = clamp01(Number(f) || 0) * this.baselineDuration;
    const pct = {};
    const activeIds = [];
    for (const t of this.tasks) {
      const n = this.baseline.nodes.get(t.id);
      const v = n.ef <= n.es ? (d >= n.ef ? 1 : 0) : clamp01((d - n.es) / (n.ef - n.es));
      pct[t.id] = v;
      if (v > 0 && v < 1 && !t.milestone) activeIds.push(t.id);
    }
    for (const s of this.summaries) {
      let b = 0;
      let v = 0;
      for (const t of this.tasks) if (t.summaryId === s.id && t.budget) { b += t.budget; v += t.budget * pct[t.id]; }
      pct[s.id] = b ? v / b : 0;
    }
    let people = 0;
    for (const r of this.resources) if (r.kind === 'people') people += this.resourceProfile.get(r.id)[Math.min(this.baselineDuration, Math.floor(d))] || 0;
    let phase = 'initiating';
    for (const g of this.gates) if (d >= g.baselineDay) phase = g.next;
    if (d >= this.baselineDuration) phase = 'closing';
    return {
      pct, workforce: this.peakPeople ? clamp01(people / this.peakPeople) : 0, phase,
      operational: d >= this.gateById.get('G3').baselineDay, weather: { kind: 'clear', intensity: 0, label: 'Clear', workFactor: 1, simulated: true },
      activeIds, day: Math.round(d), progress: this.bac ? this.plannedValueAt(d) / this.bac : 0, preview: true,
    };
  }

  overlayValues(kind) {
    const out = {};
    const exposure = {};
    if (kind === 'risk') {
      for (const r of this.risks) {
        if (r.kind !== 'threat' || !['Open', 'Escalated', 'Occurred'].includes(r.status) || r.affects.includes('*')) continue;
        for (const id of r.taskIds) exposure[id] = (exposure[id] || 0) - r.emv / r.taskIds.length;
      }
    }
    const maxExp = Math.max(1, ...Object.values(exposure));
    const val = (t) => {
      const st = this.state.get(t.id);
      const b = t.budget || 1;
      const ev = st.pct * t.budget;
      const pv = this.plannedValueOf(t.id);
      if (kind === 'sv') return clamp((ev - pv) / (b * 0.15), -1, 1);
      if (kind === 'cv') return st.actualCost > 0 ? clamp((ev - st.actualCost) / (b * 0.08), -1, 1) : 0;
      if (kind === 'risk') return clamp01((exposure[t.id] || 0) / maxExp);
      if (kind === 'load') {
        if (!this.activeIds.includes(t.id)) return 0;
        let worst = 0;
        for (const rid of Object.keys(t.crew)) {
          const r = this.resourceById.get(rid);
          worst = Math.max(worst, r.assigned > 0 ? r.required / r.assigned - 1 : 1);
        }
        return clamp(worst * 2, -1, 1);
      }
      return 0;
    };
    for (const t of this.tasks) if (!t.milestone) out[t.id] = val(t);
    for (const s of this.summaries) {
      const kids = this.tasks.filter((t) => t.summaryId === s.id && !t.milestone);
      let w = 0;
      let v = 0;
      for (const t of kids) { w += t.budget; v += t.budget * out[t.id]; }
      out[s.id] = w ? v / w : 0;
    }
    return out;
  }

  /* -------------------------------------------------------- benefits */

  recordOperations({ movements = 0, pax = 0, onTimePct = 0 } = {}) {
    const b = this.benefits;
    b.samples.push({ day: this.day, movements, pax, onTimePct });
    if (b.samples.length > 365) b.samples.shift();
    const recent = b.samples.slice(-30);
    const avg = (k) => recent.reduce((s, x) => s + x[k], 0) / recent.length;
    b.movementsPerDay = avg('movements');
    b.paxPerDay = avg('pax');
    b.onTimePct = avg('onTimePct');
    const tgt = b.businessCaseTarget;
    b.realisation = clamp01((b.movementsPerDay / tgt.movementsPerDay + b.paxPerDay / tgt.paxPerDay + b.onTimePct / tgt.onTimePct) / 3);
    for (const id of ['S09', 'S16', 'S06']) {
      const s = this.stakeholderById.get(id);
      s.satisfaction = clamp01(s.satisfaction + (b.realisation - 0.7) * 0.01);
    }
    return { ...b, samples: undefined };
  }

  /* --------------------------------------------------------- close-out */

  closeProject() {
    const e = this.evm();
    const complete = this.finished;
    const realised = this.risks.filter((r) => r.occurrences > 0);
    const report = {
      title: `${PROJECT_INFO.name} — ${complete ? 'Close-out report' : 'Draft close-out (project still running)'}`,
      status: complete ? 'Completed' : 'In progress',
      day: this.day, dateLabel: this.dateLabel(), simulated: SIMULATED,
      schedule: {
        baselineDuration: this.baselineDuration, actualDuration: this.day, forecastFinish: this.forecastFinish,
        varianceDays: (complete ? this.day : this.forecastFinish) - this.baselineDuration, spit: e.spit,
        milestones: this.milestones.map((m) => ({ id: m.id, name: m.name, baselineDay: m.baselineDay, actualDay: this.state.get(m.id).actualFinish })),
      },
      cost: { bac: this.bac, ac: this.ac, ev: this.ev, cpi: e.cpi, eac: e.eac.cpi, vac: e.vac, breakdown: { ...this.costBreakdown },
        contingencyUsed: this.contingencyReserve - this.contingencyRemaining, managementReserveUsed: this.managementReserve - this.managementRemaining },
      scope: { requirementsVerified: this.requirements.filter((r) => r.status === 'Verified').length, requirements: this.requirements.length,
        changesApproved: this.changes.filter((c) => c.status === 'Implemented').length, changesRejected: this.changes.filter((c) => c.status === 'Rejected').length,
        baselineVersion: this.baselineVersion },
      quality: { index: this.qualityIndex, ncrs: this.ncrs.length, costOfQuality: { ...this.quality.costOfQuality }, pareto: pareto(this.quality.defects).slice(0, 5) },
      risk: { realisedThreats: this.realisedRisks, realisedOpportunities: this.realisedOpportunities, occurred: realised.map((r) => ({ id: r.id, title: r.title, times: r.occurrences })) },
      safety: { index: this.safety, incidents: this.incidents },
      stakeholders: { satisfaction: this.stakeholderSatisfaction, belowDesired: this.stakeholders.filter((s) => s.current < s.desired).map((s) => s.role) },
      procurement: this.procurement.map((p) => ({ id: p.id, name: p.name, type: p.contractType, vendor: p.vendor, status: p.status, finalAccount: p.finalAccount, claims: p.claims.length })),
      agile: { sprints: this.agile.sprints.length, velocity: velocityStats(this.agile.velocity), pointsDone: this.agile.backlog.filter((s) => s.status === 'done').reduce((a, s) => a + s.points, 0), totalPoints: this.agile.totalPoints },
      benefits: { ...this.benefits, samples: this.benefits.samples.length, target: this.benefits.businessCaseTarget },
      lessons: this.lessons.map((l) => ({ id: l.id, title: l.title, category: l.category })),
      acceptance: complete ? 'All deliverables accepted; contracts closed; records archived (12.4); benefits handed to the operator (12.5).' : 'Close-out not yet possible: open work remains.',
    };
    if (complete) this.closeout = report;
    return report;
  }

  /* -------------------------------------------------------- persistence */

  serialise() {
    const state = [];
    for (const [id, st] of this.state) state.push({ ...st, id });
    return JSON.parse(JSON.stringify({
      version: VERSION, app: 'sky-gateway-hyderabad-pm', seed: this.seed, difficulty: this.difficulty, approach: this.approach,
      rngState: this.rngState, day: this.day, finished: this.finished, phase: this.phase,
      scalars: {
        ev: this.ev, pv: this.pv, ac: this.ac, costBreakdown: this.costBreakdown,
        contingencyReserve: this.contingencyReserve, managementReserve: this.managementReserve,
        contingencyRemaining: this.contingencyRemaining, managementRemaining: this.managementRemaining,
        welfare: this.welfare, safety: this.safety, incidents: this.incidents, recentIncidents: this.recentIncidents,
        realisedRisks: this.realisedRisks, realisedOpportunities: this.realisedOpportunities, community: this.community,
        qualityIndex: this.qualityIndex, failEwma: this.failEwma, inspectionLevel: this.inspectionLevel, autoStaffing: this.autoStaffing,
        crashedDays: this.crashedDays, scopeChanges: this.scopeChanges, autoGateApprovals: this.autoGateApprovals, latentDefects: this.latentDefects,
        reserveWarned: this.reserveWarned, priceIndex: this.priceIndex, stock: this.stock, supplyDisruption: this.supplyDisruption,
        weather: this.weather, forcedWeather: this.forcedWeather, activeIds: this.activeIds, stakeholderSatisfaction: this.stakeholderSatisfaction,
        forecastFinish: this.forecastFinish, scheduleVarianceDays: this.scheduleVarianceDays, serial: this.serial,
        baselineVersion: this.baselineVersion, raisedTemplates: this.raisedTemplates, lessonKeys: this.lessonKeys,
      },
      baselineTasks: this.baselineTasks,
      tasks: this.tasks.map((t) => ({ id: t.id, duration: t.duration, o: t.o, m: t.m, p: t.p, budget: t.budget, predecessors: t.predecessors,
        crashDuration: t.crashDuration, crashCost: t.crashCost, costSlope: t.costSlope, labourBudget: t.labourBudget, materialBudget: t.materialBudget })),
      state,
      resources: this.resources.map((r) => ({ id: r.id, assigned: r.assigned, required: r.required, utilisation: r.utilisation, auto: r.auto, capacity: r.capacity })),
      risks: this.risks, stakeholders: this.stakeholders, procurement: this.procurement,
      requirements: this.requirements, gates: this.gates, agile: this.agile, quality: { ...this.quality, ncrs: undefined },
      ncrs: this.ncrs, changes: this.changes, issues: this.issues, decisionLog: this.decisionLog, lessons: this.lessons,
      events: this.events, evmHistory: this.evmHistory, resourceHistory: this.resourceHistory, benefits: this.benefits, closeout: this.closeout,
      forecast: {
        day: this.forecastDay, duration: this.forecast.duration, criticalPath: this.forecast.criticalPath, drivingPath: this.forecast.drivingPath,
        nodes: [...this.forecast.nodes.values()].map((n) => [n.id, n.duration, n.es, n.ef, n.ls, n.lf, n.totalFloat, n.freeFloat, n.critical ? 1 : 0, n.done ? 1 : 0]),
      },
    }));
  }

  restore(data) {
    if (!data || data.version !== VERSION || !Array.isArray(data.state) || !Array.isArray(data.tasks)) return false;
    try {
      for (const saved of data.tasks) {
        const t = this.taskById.get(saved.id);
        if (t) Object.assign(t, saved, { predecessors: saved.predecessors.map((x) => ({ ...x })), costSlope: saved.costSlope === null ? (t.milestone ? null : Infinity) : saved.costSlope });
      }
      this.baselineTasks = data.baselineTasks;
      this._buildBaseline();
      this.rngState = data.rngState >>> 0;
      this.day = data.day;
      this.finished = !!data.finished;
      this.phase = data.phase;
      Object.assign(this, data.scalars);
      this._setFunding();
      for (const saved of data.state) if (this.state.has(saved.id)) this.state.set(saved.id, { ...saved });
      for (const saved of data.resources) { const r = this.resourceById.get(saved.id); if (r) Object.assign(r, saved); }
      this.risks = data.risks;
      this.riskById = new Map(this.risks.map((r) => [r.id, r]));
      this.stakeholders = data.stakeholders;
      this.stakeholderById = new Map(this.stakeholders.map((s) => [s.id, s]));
      this.procurement = data.procurement;
      this.pkgById = new Map(this.procurement.map((p) => [p.id, p]));
      this.requirements = data.requirements;
      this.gates = data.gates;
      this.gateById = new Map(this.gates.map((g) => [g.id, g]));
      this.agile = data.agile;
      if (this.agile.currentSprint) this.agile.currentSprint = this.agile.sprints.find((s) => s.n === this.agile.currentSprint.n) || null;
      this.ncrs = data.ncrs;
      this.quality = { ...data.quality, ncrs: this.ncrs };
      this.changes = data.changes;
      this.issues = data.issues;
      this.decisionLog = data.decisionLog;
      this.lessons = data.lessons;
      this.events = data.events;
      this.evmHistory = data.evmHistory;
      this.resourceHistory = data.resourceHistory;
      this.benefits = data.benefits;
      this.closeout = data.closeout;
      // The forecast is restored verbatim (not recomputed) so a resumed run is bit-identical.
      const f = data.forecast;
      const nodes = new Map();
      for (const [id, duration, es, ef, ls, lf, totalFloat, freeFloat, critical, done] of f.nodes) {
        const t = this.taskById.get(id);
        nodes.set(id, { id, duration, es, ef, ls, lf, totalFloat, freeFloat, critical: !!critical, done: !!done, predecessors: t ? t.predecessors : [], successors: [] });
      }
      this.forecast = { nodes, duration: f.duration, criticalPath: f.criticalPath, drivingPath: f.drivingPath, order: this.topo.map((t) => t.id) };
      this.forecastDay = f.day;
      this.forecastPert = pertAnalysis(this.forecast, this.tasks, this.baselineDuration - this.forecastDay);
      this.fulfilment = Object.fromEntries(this.resources.map((r) => [r.id, r.required > 0 ? r.assigned / r.required : 1]));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ------------------------------------------------------------- reports */

  /** Requirements traceability matrix rows. */
  rtm() {
    return this.requirements.map((r) => ({
      ...r, stakeholder: this.stakeholderById.get(r.source) ? this.stakeholderById.get(r.source).role : r.source,
      deliverables: r.wbs.map((id) => ({ id, name: this.taskById.get(id).name, pct: this.state.get(id).pct })),
    }));
  }

  /** Counts of every register (used by tests and the QA hook). */
  counts() {
    return {
      summaries: this.summaries.length, leaves: this.tasks.filter((t) => !t.milestone).length, milestones: this.milestones.length,
      resources: this.resources.length, risks: this.risks.length, threats: this.risks.filter((r) => r.kind === 'threat').length,
      opportunities: this.risks.filter((r) => r.kind === 'opportunity').length, stakeholders: this.stakeholders.length,
      procurement: this.procurement.length, requirements: this.requirements.length, raciRows: this.raci.rows.length, raciRoles: this.raci.roles.length,
      commsPlan: this.commsPlan.length, gates: this.gates.length, stories: this.agile.backlog.length, changeTemplates: CHANGE_TEMPLATES.length,
    };
  }
}

export { PHASES };
