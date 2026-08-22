import { WBS, flattenWBS, RESOURCE_TYPES, RISK_REGISTER, PROCUREMENT, STAKEHOLDERS, CALENDAR, MISSIONS } from './model.js';
import { computeCPM, pertDuration, pertSigma, pertAnalysis, crashCandidates } from './cpm.js';

/**
 * The project simulation.
 *
 * Holds the baseline (scope, schedule, cost), the live execution state, and
 * every derived measure a project manager would actually look at: earned
 * value, earned schedule, resource loading, quality control charts, risk
 * exposure, procurement status and stakeholder engagement.
 *
 * The simulation advances in whole days.  Each day it decides which work
 * packages are eligible, divides the assigned workforce between them, converts
 * that into progress, accrues cost, rolls the risk register, samples quality,
 * and updates morale and stakeholder satisfaction.
 */

const LABOUR_SHARE = 0.55;      // fraction of budget that is labour, not material
/**
 * Peak simultaneous workforce, from Lehner's estimate of 20 000–25 000 people
 * on the plateau at the height of construction.  The per-package crew figures
 * in the model are relative weights; they are rescaled at load time so that the
 * peak of the baseline resource histogram lands on this number.
 */
const TARGET_PEAK_WORKFORCE = 21000;
const ENGAGEMENT_LEVELS = ['Unaware', 'Resistant', 'Neutral', 'Supportive', 'Leading'];

/** Deterministic PRNG so a given seed replays exactly. */
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function seasonForDay(dayOfYear) {
  for (const s of CALENDAR.seasons) {
    if (dayOfYear >= s.start && dayOfYear <= s.end) return s;
  }
  return CALENDAR.seasons[CALENDAR.seasons.length - 1];
}

/** Format an absolute project day as a regnal-year civil date. */
export function formatEgyptianDate(day) {
  const year = Math.floor(day / CALENDAR.daysPerYear);
  const dayOfYear = Math.floor(day % CALENDAR.daysPerYear) + 1;
  const monthIndex = Math.min(11, Math.floor((dayOfYear - 1) / 30));
  const dayOfMonth = ((dayOfYear - 1) % 30) + 1;
  const season = seasonForDay(dayOfYear);
  return {
    regnalYear: CALENDAR.startRegnalYear + year,
    month: CALENDAR.monthNames[monthIndex],
    day: dayOfMonth,
    season,
    dayOfYear,
    label: `Year ${CALENDAR.startRegnalYear + year} · ${CALENDAR.monthNames[monthIndex]} ${dayOfMonth} · ${season.name.split(' — ')[0]}`,
  };
}

export class Project {
  constructor({ seed = 20250821 } = {}) {
    this.rng = rng32(seed);
    this.packages = flattenWBS();
    this.wbs = WBS;

    // ---- baseline schedule ----
    this.tasks = this.packages.map((wp) => ({
      id: wp.id,
      name: wp.name,
      code: wp.code,
      o: wp.o,
      m: wp.m,
      p: wp.p,
      duration: Math.round(pertDuration(wp.o, wp.m, wp.p)),
      sigma: pertSigma(wp.o, wp.p),
      predecessors: wp.predecessors || [],
      budget: wp.budget,
      crew: wp.crew || {},
      spec: wp,
      crashable: true,
      crashDuration: Math.round(pertDuration(wp.o, wp.m, wp.p) * 0.78),
      crashCost: wp.budget * 1.32,
    }));
    this.taskById = new Map(this.tasks.map((t) => [t.id, t]));

    this.baseline = computeCPM(this.tasks);
    this.baselineDuration = this.baseline.duration;
    this.bac = this.tasks.reduce((sum, t) => sum + t.budget, 0);
    this.pert = pertAnalysis(this.baseline, this.tasks, this.baselineDuration);

    /* ---- resource plan, derived from the baseline schedule -------------
     * A resource plan is not invented; it falls out of the schedule.  We build
     * the baseline resource histogram, rescale the crew weights so the peak
     * total workforce matches the historical estimate, then set the
     * recommended staffing of each pool to its own peak.  Day rates are then
     * calibrated so that running at the recommended staffing for the baseline
     * duration spends exactly the labour share of BAC — i.e. the player who
     * follows the plan sees SPI = CPI = 1.00, and every deviation is theirs.
     */
    let profile = this._buildResourceProfile();
    const peakWorkers = this._peakTotalWorkers(profile);
    this.crewScale = peakWorkers > 0 ? TARGET_PEAK_WORKFORCE / peakWorkers : 1;
    for (const t of this.tasks) {
      const scaled = {};
      for (const [key, n] of Object.entries(t.crew)) scaled[key] = Math.round(n * this.crewScale);
      t.crew = scaled;
    }
    profile = this._buildResourceProfile();
    this.resourceProfile = profile;

    this.resources = RESOURCE_TYPES.map((r) => {
      const arr = profile.get(r.id);
      let peak = 0;
      let area = 0;
      for (let d = 0; d < arr.length; d++) {
        if (arr[d] > peak) peak = arr[d];
        area += arr[d];
      }
      const recommended = Math.max(1, Math.round(peak));
      return {
        ...r,
        peakDemand: recommended,
        meanDemand: Math.round(area / Math.max(1, arr.length)),
        capacity: Math.round(recommended * 1.45),
        baseline: recommended,
        assigned: recommended,
        utilisation: 0,
        required: 0,
      };
    });
    // Calibrate against the AREA under the baseline demand curve (plus the 5%
    // headroom the auto-staffing plan carries), not peak x duration: a manager
    // who follows the staffing plan spends exactly the labour budget, and one
    // who parks everyone at peak all project pays for the idle time.
    let plannedLabour = 0;
    for (const r of this.resources) {
      const arr = profile.get(r.id);
      let area = 0;
      for (let d = 0; d < arr.length; d++) area += Math.max(arr[d] * 1.05, r.peakDemand * 0.05);
      plannedLabour += area * r.dayRate;
    }
    const scale = (LABOUR_SHARE * this.bac) / Math.max(1e-6, plannedLabour);
    for (const r of this.resources) r.dayRate *= scale;
    this.resourceById = new Map(this.resources.map((r) => [r.id, r]));
    this.peakWorkforce = this.resources.reduce((s, r) => (r.unit === 'workers' ? s + r.baseline : s), 0);
    this.autoStaffing = true;
    let plannedDaily = 0;
    for (const r of this.resources) plannedDaily += r.meanDemand * 1.05 * r.dayRate;
    this.baselineDailyLabour = plannedDaily;

    // ---- planned value curve (early-start baseline) ----
    this.pvCurve = this._buildPvCurve();

    // ---- live state ----
    this.day = 0;
    this.finished = false;
    this.state = new Map();
    for (const t of this.tasks) {
      this.state.set(t.id, {
        id: t.id,
        pct: 0,
        actualStart: null,
        actualFinish: null,
        actualCost: 0,
        materialSpent: 0,
        remaining: t.duration,
        rework: 0,
        blocked: null,
        crashed: 0,
      });
    }

    this.ac = 0;
    this.ev = 0;
    this.pv = 0;
    this.labourSpent = 0;
    this.materialSpent = 0;
    this.reworkCost = 0;
    this.riskSpent = 0;

    this.contingencyReserve = RISK_REGISTER.reduce((s, r) => s + r.probability * r.costImpact, 0);
    this.managementReserve = this.bac * 0.10;
    this.contingencyRemaining = this.contingencyReserve;
    this.managementRemaining = this.managementReserve;

    this.welfare = 0.82;
    this.safety = 0.9;
    this.stoneStock = 0.62;          // days of dressed stone, normalised 0..1
    this.toolStock = 0.75;
    this.incidents = 0;
    this.recentIncidents = 0;
    this.realisedRisks = 0;

    this.risks = RISK_REGISTER.map((r) => ({
      ...r,
      status: 'Open',
      occurrences: 0,
      lastDay: null,
      mitigated: r.response === 'Mitigate' || r.response === 'Transfer',
      currentProbability: r.response === 'Mitigate' || r.response === 'Transfer' ? r.residual : r.probability,
    }));
    this.riskById = new Map(this.risks.map((r) => [r.id, r]));

    this.procurement = PROCUREMENT.map((p) => ({ ...p, status: 'Planned', ordered: null, delivered: null }));

    this.stakeholders = STAKEHOLDERS.map((s) => ({
      ...s,
      satisfaction: 0.62,
      level: ENGAGEMENT_LEVELS.indexOf(s.current.charAt(0).toUpperCase() + s.current.slice(1)) + 1 || 3,
    }));

    this.quality = {
      orientation: 0.05,
      level: 1.9,
      squareness: 4.0,
      passageAlignment: 5.4,
      corbelStep: 7.4,
      beamSeating: 2.6,
      joint: 0.5,
    };
    this.qualitySamples = [];
    this.costOfQuality = { prevention: 0, appraisal: 0, internalFailure: 0, externalFailure: 0 };
    this.inspectionLevel = 1.0;      // 0.5 = minimal, 1.5 = rigorous

    this.evmHistory = [];
    this.resourceHistory = [];
    this.events = [];
    this.eventSerial = 0;
    this.missions = MISSIONS.map((m) => ({
      ...m,
      status: 'locked',
      objectives: m.objectives.map((o) => ({ ...o, done: false })),
    }));
    this.missions[0].status = 'active';
    this.activeMissionIndex = 0;

    this._recomputeForecast();
    this._recordEvm();
    this.log('info', 'Project chartered', `Akhet Khufu authorised. Baseline: ${this.baselineDuration} days, ${Math.round(this.bac).toLocaleString()} kdb.`);
  }

  /* ------------------------------------------------------------ baseline */

  /** Daily resource demand implied by the early-start baseline. */
  _buildResourceProfile() {
    const days = Math.ceil(this.baseline.duration) + 2;
    const profile = new Map();
    for (const r of RESOURCE_TYPES) profile.set(r.id, new Float64Array(days));
    for (const t of this.tasks) {
      const n = this.baseline.nodes.get(t.id);
      const start = Math.max(0, Math.floor(n.es));
      const end = Math.min(days, Math.ceil(n.ef));
      for (const [key, count] of Object.entries(t.crew)) {
        const arr = profile.get(key);
        if (!arr) continue;
        for (let d = start; d < end; d++) arr[d] += count;
      }
    }
    return profile;
  }

  _peakTotalWorkers(profile) {
    const workerIds = RESOURCE_TYPES.filter((r) => r.unit === 'workers').map((r) => r.id);
    const len = profile.get(workerIds[0]).length;
    let peak = 0;
    for (let d = 0; d < len; d++) {
      let total = 0;
      for (const id of workerIds) total += profile.get(id)[d];
      if (total > peak) peak = total;
    }
    return peak;
  }

  _buildPvCurve() {
    const total = Math.ceil(this.baseline.duration) + 1;
    const curve = new Float64Array(total + 1);
    for (const t of this.tasks) {
      const n = this.baseline.nodes.get(t.id);
      const start = Math.floor(n.es);
      const end = Math.ceil(n.ef);
      const span = Math.max(1, end - start);
      for (let d = 0; d <= total; d++) {
        let frac;
        if (d <= start) frac = 0;
        else if (d >= end) frac = 1;
        else frac = (d - start) / span;
        curve[d] += t.budget * frac;
      }
    }
    return curve;
  }

  plannedValueAt(day) {
    const d = Math.max(0, Math.min(this.pvCurve.length - 1, Math.floor(day)));
    return this.pvCurve[d];
  }

  /** Earned schedule: the date at which the baseline planned to have earned EV. */
  earnedScheduleAt(ev) {
    if (ev <= 0) return 0;
    if (ev >= this.bac) return this.pvCurve.length - 1;
    let lo = 0;
    let hi = this.pvCurve.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.pvCurve[mid] < ev) lo = mid;
      else hi = mid;
    }
    const span = this.pvCurve[hi] - this.pvCurve[lo];
    return span > 0 ? lo + (ev - this.pvCurve[lo]) / span : lo;
  }

  /* ------------------------------------------------------------ execution */

  /** Is this package allowed to be worked today? */
  _readiness(task) {
    for (const link of task.predecessors) {
      const pred = this.state.get(link.id);
      if (!pred) continue;
      const type = link.type || 'FS';
      const lag = link.lag || 0;
      if (type === 'FS') {
        if (lag < 0) {
          // A negative lag is a lead: fast-tracked, so the successor may start
          // once the predecessor is within |lag| days of finishing.
          const predTask = this.taskById.get(link.id);
          const needed = predTask ? Math.max(0, 1 + lag / Math.max(1, predTask.duration)) : 1;
          if (pred.pct < needed) return { ready: false, reason: `waiting on ${link.id}` };
        } else {
          if (pred.pct < 1) return { ready: false, reason: `waiting on ${link.id}` };
          if (this.day < pred.actualFinish + lag) return { ready: false, reason: `lag after ${link.id}` };
        }
      } else if (type === 'SS') {
        if (pred.actualStart === null) return { ready: false, reason: `waiting on ${link.id} to start` };
        if (this.day < pred.actualStart + lag) return { ready: false, reason: `lead/lag on ${link.id}` };
      }
    }
    return { ready: true, reason: null };
  }

  /** Finish-to-finish and start-to-finish links cap how far a package may go. */
  _progressCap(task) {
    let cap = 1;
    for (const link of task.predecessors) {
      const type = link.type || 'FS';
      if (type !== 'FF' && type !== 'SF') continue;
      const pred = this.state.get(link.id);
      if (!pred) continue;
      const lag = link.lag || 0;
      if (type === 'FF') {
        if (pred.pct < 1 || this.day < pred.actualFinish + lag) cap = Math.min(cap, 0.95);
      } else if (pred.actualStart === null || this.day < pred.actualStart + lag) {
        cap = Math.min(cap, 0.95);
      }
    }
    return cap;
  }

  setStaffing(resourceId, value) {
    const r = this.resourceById.get(resourceId);
    if (!r) return;
    this.autoStaffing = false;
    r.assigned = Math.max(0, Math.min(r.capacity, Math.round(value)));
  }

  /**
   * Follow the staffing plan: match today's demand plus 5% headroom, with a
   * small standing core so a newly-started package is never stalled on its
   * first day.  This is the resource-levelled plan; turning it off is how the
   * player earns a cost variance.
   */
  setAutoStaffing(enabled) {
    this.autoStaffing = enabled;
    if (enabled) this._applyAutoStaffing();
  }

  _applyAutoStaffing() {
    for (const r of this.resources) {
      r.assigned = Math.min(
        r.capacity,
        Math.max(Math.ceil(r.required * 1.05), Math.ceil(r.peakDemand * 0.05))
      );
    }
  }

  setInspectionLevel(v) {
    this.inspectionLevel = Math.max(0.4, Math.min(1.8, v));
  }

  /** Advance the simulation by one whole day. */
  step() {
    if (this.finished) return;
    this.day += 1;
    const dayOfYear = (this.day % CALENDAR.daysPerYear) + 1;
    const season = seasonForDay(dayOfYear);

    // ---- 1. which packages are eligible today ----
    const active = [];
    for (const task of this.tasks) {
      const st = this.state.get(task.id);
      if (st.pct >= 1) continue;
      const readiness = this._readiness(task);
      st.blocked = readiness.ready ? null : readiness.reason;
      if (readiness.ready) active.push(task);
    }

    // ---- 2. resource demand and fulfilment ----
    for (const r of this.resources) r.required = 0;
    for (const task of active) {
      for (const [key, n] of Object.entries(task.crew)) {
        const r = this.resourceById.get(key);
        if (r) r.required += n;
      }
    }
    if (this.autoStaffing) this._applyAutoStaffing();
    const fulfilment = new Map();
    for (const r of this.resources) {
      const f = r.required > 0 ? Math.min(1.6, r.assigned / r.required) : 1;
      fulfilment.set(r.id, f);
      r.utilisation = r.required > 0 ? Math.min(1, r.required / Math.max(1, r.assigned)) : 0;
    }

    // ---- 3. global modifiers ----
    // Each modifier is 1.0 at its nominal planned condition and only ever
    // penalises below it, so "follow the plan" really does mean SPI = 1.00.
    const seasonFactor = season.id === 'akhet' ? 1.06 : season.id === 'shemu' ? 0.96 : 1.0;
    const welfareFactor = 0.50 + Math.min(1, this.welfare / 0.82) * 0.50;
    const supplyFactor = 0.45 + Math.min(1, this.stoneStock / 0.72) * 0.55;
    const toolAvail = fulfilment.get('tools') === undefined ? 1 : Math.min(1, fulfilment.get('tools'));
    const supplyReady = this.state.get('2.4').pct >= 1 ? 1 : 0.62 + this.state.get('2.4').pct * 0.38;
    const toolFactor = 0.62 + toolAvail * supplyReady * 0.38;
    const eventFactor = this._activeEventFactor();

    // ---- 4. progress and cost ----
    let earnedToday = 0;
    for (const task of active) {
      const st = this.state.get(task.id);
      if (st.actualStart === null) {
        st.actualStart = this.day;
        this.log('info', `${task.code} started`, task.name);
      }
      let scarcest = 1;
      for (const key of Object.keys(task.crew)) {
        scarcest = Math.min(scarcest, fulfilment.get(key) === undefined ? 1 : fulfilment.get(key));
      }
      // Above 100% staffing there are real but diminishing returns (Brooks).
      const staffing = scarcest <= 1 ? scarcest : 1 + (scarcest - 1) * 0.42;
      const productivity = Math.max(
        0,
        Math.min(1.25, staffing * seasonFactor * welfareFactor * supplyFactor * toolFactor * eventFactor)
      );

      const cap = this._progressCap(task);
      const perDay = 1 / Math.max(1, task.duration - st.crashed);
      const gain = Math.min(perDay * productivity, Math.max(0, cap - st.pct));
      if (gain <= 0) continue;

      st.pct = Math.min(cap, st.pct + gain);
      st.remaining = Math.max(0, (1 - st.pct) * task.duration);
      earnedToday += gain * task.budget;

      const material = gain * task.budget * (1 - LABOUR_SHARE);
      st.materialSpent += material;
      this.materialSpent += material;
      st.actualCost += material;

      this._sampleQuality(task, gain, productivity);

      if (st.pct >= 0.9999) {
        st.pct = 1;
        st.actualFinish = this.day;
        this.log('good', `${task.code} complete`, `${task.name} — finished on day ${this.day}.`);
      }
    }

    // ---- 5. labour cost: assigned people are paid whether productive or not ----
    const labourToday = this.resources.reduce((s, r) => s + r.assigned * r.dayRate, 0);
    this.labourSpent += labourToday;
    this.ac = this.labourSpent + this.materialSpent + this.reworkCost + this.riskSpent;
    this.ev += earnedToday;
    this.pv = this.plannedValueAt(this.day);

    // ---- 6. consumables, welfare, safety ----
    this._updateLogistics(active, fulfilment, season);
    this._updateWelfare(fulfilment);

    // ---- 7. risk and stakeholders ----
    this._rollRisks(season);
    this._updateProcurement();
    this._updateStakeholders();
    this._updateMissions();

    if (this.day % 10 === 0) this._recordEvm();
    if (this.day % 30 === 0) this._recomputeForecast();

    const done = this.tasks.every((t) => this.state.get(t.id).pct >= 1);
    if (done && !this.finished) {
      this.finished = true;
      this._recordEvm();
      this._recomputeForecast();
      this.log('good', 'Project complete', `Akhet Khufu handed over on day ${this.day} (baseline ${this.baselineDuration}).`);
    }
  }

  _activeEventFactor() {
    let factor = 1;
    for (const r of this.risks) {
      if (r.activeUntil && this.day <= r.activeUntil) factor *= r.productivityFactor || 0.82;
    }
    return factor;
  }

  _updateLogistics(active, fulfilment, season) {
    // Stone stock: quarry output versus placement demand.
    const quarryOut = (fulfilment.get('quarrymen') || 1) * 0.027;
    const placing = active.some((t) => t.spec.buildBand) ? 0.021 : 0.008;
    const haulage = Math.min(1, fulfilment.get('haulers') || 1);
    this.stoneStock = clamp01(this.stoneStock + quarryOut * haulage - placing);

    // Tool availability is the fulfilment of the tool pool, gated by whether
    // the Sinai supply contract has actually been delivered.
    const ready = this.state.get('2.4').pct >= 1 ? 1 : 0.62 + this.state.get('2.4').pct * 0.38;
    const avail = fulfilment.get('tools') === undefined ? 1 : Math.min(1, fulfilment.get('tools'));
    this.toolStock = clamp01(avail * ready);

    // Barges only earn their keep during the inundation.
    if (season.id !== 'akhet') this.stoneStock = clamp01(this.stoneStock - 0.0012);
  }

  _updateWelfare(fulfilment) {
    const provisioning = this.state.get('4.2').pct;
    const housing = this.state.get('4.1').pct;
    const medical = this.state.get('4.4').pct;
    const rotation = this.state.get('4.3').pct;
    const totalAssigned = this.resources.reduce((s, r) => (r.unit === 'workers' ? s + r.assigned : s), 0);
    // The town and its bakeries are sized for the planned peak: fully provisioned
    // they support a little over it, unprovisioned only the permanent core.
    const W = this.peakWorkforce;
    const supported = W * (0.20 + provisioning * 0.62 + housing * 0.26);
    const crowding = clamp01(totalAssigned / Math.max(1, supported));

    this.recentIncidents *= 0.994;      // ~4-month memory
    const target = clamp01(
      0.28 + provisioning * 0.30 + housing * 0.12 + medical * 0.10 + rotation * 0.10 +
      (1 - crowding) * 0.24 - Math.min(0.30, this.recentIncidents * 0.05)
    );
    this.welfare += (target - this.welfare) * 0.02;

    // Safety degrades with crowding and with lift height.
    const lift = this.buildFraction;
    const risk = 0.00035 * (0.4 + crowding) * (0.6 + lift);
    if (this.rng() < risk * 30) {
      this.incidents += 1;
      this.recentIncidents += 1;
      this.safety = clamp01(this.safety - 0.02);
      const cost = 400 + this.rng() * 1800;
      this.riskSpent += cost;
      this.log('risk', 'Accident on the works', `A haulage accident on the ramp. ${Math.round(cost)} kdb charged to contingency; welfare and safety affected.`);
      this.contingencyRemaining -= cost;
    } else {
      this.safety = clamp01(this.safety + 0.0006);
    }
  }

  /* -------------------------------------------------------------- quality */

  _sampleQuality(task, gain, productivity) {
    const gate = task.spec.qualityGate;
    const appraisal = gain * task.budget * 0.012 * this.inspectionLevel;
    this.costOfQuality.appraisal += appraisal;
    this.costOfQuality.prevention += gain * task.budget * 0.008 * this.inspectionLevel;
    this.ac += appraisal;
    if (!gate) return;
    if (this.rng() > gain * 45) return;

    // Rushing degrades quality; rigorous inspection recovers it.
    const pressure = Math.max(0, productivity - 1) * 1.8 + Math.max(0, 0.85 - this.welfare) * 1.2;
    const control = 1 / this.inspectionLevel;
    const noise = (this.rng() + this.rng() + this.rng() - 1.5) * 0.46;
    const value = gate.target * (1 + pressure * control * 0.9 + noise * control * 0.35);
    this.quality[gate.metric] = value;
    this.qualitySamples.push({
      day: this.day,
      metric: gate.metric,
      value,
      target: gate.target,
      ucl: gate.tolerance,
      task: task.code,
    });
    if (this.qualitySamples.length > 400) this.qualitySamples.shift();

    if (value > gate.tolerance) {
      const st = this.state.get(task.id);
      const reworkFraction = Math.min(0.06, (value / gate.tolerance - 1) * 0.10);
      st.pct = Math.max(0, st.pct - reworkFraction);
      st.rework += reworkFraction;
      const cost = reworkFraction * task.budget * 1.35;
      this.reworkCost += cost;
      this.costOfQuality.internalFailure += cost;
      this.contingencyRemaining -= cost;
      this.log(
        'risk',
        `Quality failure — ${task.code}`,
        `${gate.metric}: ${value.toFixed(2)} ${gate.unit} exceeds the ${gate.tolerance} tolerance. ` +
          `${(reworkFraction * 100).toFixed(1)}% of the package torn out and rebuilt (${Math.round(cost).toLocaleString()} kdb).`
      );
    }
  }

  /* ----------------------------------------------------------------- risk */

  _rollRisks(season) {
    for (const risk of this.risks) {
      if (risk.activeUntil && this.day > risk.activeUntil) {
        risk.activeUntil = null;
        risk.status = 'Closed (realised)';
      }
      if (risk.activeUntil) continue;
      if (risk.season && risk.season !== season.id) continue;
      // Register probabilities are stated for the whole project, so convert to
      // a daily hazard over the exposure window (a season-bound risk can only
      // fire during its season, so its hazard is concentrated there).
      const years = Math.max(1, this.baselineDuration / CALENDAR.daysPerYear);
      const window = risk.season ? 120 * years : this.baselineDuration;
      const daily = risk.currentProbability / window;
      if (this.rng() >= daily) continue;

      risk.occurrences += 1;
      risk.lastDay = this.day;
      risk.status = 'Realised';
      this.realisedRisks += 1;
      const duration = Math.round(risk.scheduleImpact * (0.4 + this.rng() * 0.9));
      risk.activeUntil = this.day + duration;
      risk.productivityFactor = 1 - Math.min(0.34, risk.scheduleImpact / 620);

      const cost = risk.costImpact * (0.5 + this.rng() * 0.8);
      this.riskSpent += cost;
      if (this.contingencyRemaining >= cost) this.contingencyRemaining -= cost;
      else {
        const overflow = cost - Math.max(0, this.contingencyRemaining);
        this.contingencyRemaining = 0;
        this.managementRemaining -= overflow;
        this.log('risk', 'Contingency exhausted', 'Drawing on management reserve — the sponsor must be told.');
      }

      if (risk.id === 'R-03') this.stoneStock = clamp01(this.stoneStock * 0.45);
      if (risk.id === 'R-09') this.toolStock = clamp01(this.toolStock * 0.5);
      if (risk.id === 'R-04' || risk.id === 'R-08') this.welfare = clamp01(this.welfare - 0.16);
      if (risk.id === 'R-12') this.safety = clamp01(this.safety - 0.12);

      this.log(
        'risk',
        `${risk.id} realised — ${risk.name}`,
        `${risk.cause} Impact: ${duration} days at reduced output, ${Math.round(cost).toLocaleString()} kdb.`
      );
    }
  }

  /** Apply a risk response strategy, changing residual probability and cost. */
  respondToRisk(riskId, strategy) {
    const risk = this.riskById.get(riskId);
    if (!risk) return false;
    risk.response = strategy;
    if (strategy === 'Mitigate') {
      risk.currentProbability = risk.residual;
      const cost = risk.costImpact * 0.12;
      this.costOfQuality.prevention += cost;
      this.riskSpent += cost;
      this.contingencyRemaining -= cost;
      this.log('info', `${risk.id} mitigated`, `${risk.responsePlan} Cost of response: ${Math.round(cost).toLocaleString()} kdb.`);
    } else if (strategy === 'Transfer') {
      risk.currentProbability = risk.residual;
      const cost = risk.costImpact * 0.18;
      this.riskSpent += cost;
      this.contingencyRemaining -= cost;
      this.log('info', `${risk.id} transferred`, `Risk transferred by contract. Premium: ${Math.round(cost).toLocaleString()} kdb.`);
    } else if (strategy === 'Avoid') {
      risk.currentProbability = risk.residual * 0.25;
      const cost = risk.costImpact * 0.3;
      this.riskSpent += cost;
      this.contingencyRemaining -= cost;
      this.log('info', `${risk.id} avoided`, 'Scope or method changed to remove the risk entirely.');
    } else {
      risk.currentProbability = risk.probability;
      this.log('info', `${risk.id} accepted`, 'Accepted with contingency; no response cost.');
    }
    return true;
  }

  _updateProcurement() {
    for (const p of this.procurement) {
      const st = this.state.get(p.activity);
      if (!st) continue;
      if (p.status === 'Planned' && st.actualStart !== null) {
        p.status = 'Ordered';
        p.ordered = this.day;
      } else if (p.status === 'Ordered' && this.day >= p.ordered + p.leadTimeDays) {
        p.status = 'Delivering';
      }
      if (p.status === 'Delivering' && st.pct >= 1) {
        p.status = 'Closed';
        p.delivered = this.day;
      }
    }
  }

  /* --------------------------------------------------------- stakeholders */

  _updateStakeholders() {
    const spi = this.spi;
    const cpi = this.cpi;
    const qualityScore = this.qualityScore;
    for (const s of this.stakeholders) {
      const d = s.drivers;
      let target = 0;
      let weight = 0;
      const add = (w, v) => {
        if (!w) return;
        target += w * v;
        weight += w;
      };
      add(d.spi, clamp01((spi - 0.7) / 0.4));
      add(d.cpi, clamp01((cpi - 0.7) / 0.4));
      add(d.quality, qualityScore);
      add(d.welfare, this.welfare);
      add(d.safety, this.safety);
      add(d.scope, clamp01(1 - this.scopeChanges * 0.12));
      const goal = weight > 0 ? target / weight : 0.6;
      s.satisfaction += (goal - s.satisfaction) * 0.01;
      s.level = s.satisfaction > 0.86 ? 5 : s.satisfaction > 0.66 ? 4 : s.satisfaction > 0.42 ? 3 : s.satisfaction > 0.22 ? 2 : 1;
      s.levelName = ENGAGEMENT_LEVELS[s.level - 1];
    }
  }

  get scopeChanges() {
    return this.risks.filter((r) => r.category === 'Scope' && r.occurrences > 0).length;
  }

  /* -------------------------------------------------------------- metrics */

  get spi() {
    return this.pv > 0 ? this.ev / this.pv : 1;
  }
  get cpi() {
    return this.ac > 0 ? this.ev / this.ac : 1;
  }
  get sv() {
    return this.ev - this.pv;
  }
  get cv() {
    return this.ev - this.ac;
  }
  /** Earned schedule in days, and the time-based schedule indices. */
  get earnedSchedule() {
    return this.earnedScheduleAt(this.ev);
  }
  get spit() {
    return this.day > 0 ? this.earnedSchedule / this.day : 1;
  }
  get svt() {
    return this.earnedSchedule - this.day;
  }
  /** EAC by the three standard formulas. */
  get eac() {
    return {
      atypical: this.ac + (this.bac - this.ev),
      typical: this.cpi > 0 ? this.bac / this.cpi : this.bac,
      combined:
        this.cpi > 0 && this.spi > 0 ? this.ac + (this.bac - this.ev) / (this.cpi * this.spi) : this.bac,
    };
  }
  get etc() {
    return Math.max(0, this.eac.typical - this.ac);
  }
  get vac() {
    return this.bac - this.eac.typical;
  }
  /** To-complete performance index against BAC and against EAC. */
  get tcpi() {
    const toBac = this.bac - this.ac !== 0 ? (this.bac - this.ev) / (this.bac - this.ac) : 1;
    const eac = this.eac.typical;
    const toEac = eac - this.ac !== 0 ? (this.bac - this.ev) / (eac - this.ac) : 1;
    return { toBac, toEac };
  }
  get overallProgress() {
    return this.bac > 0 ? this.ev / this.bac : 0;
  }
  get qualityScore() {
    let score = 0;
    let n = 0;
    for (const task of this.tasks) {
      const gate = task.spec.qualityGate;
      if (!gate) continue;
      const value = this.quality[gate.metric];
      score += clamp01(1 - Math.max(0, value - gate.target) / Math.max(1e-6, gate.tolerance - gate.target));
      n++;
    }
    return n ? score / n : 1;
  }
  get minStakeholderLevel() {
    return this.stakeholders.reduce((m, s) => Math.min(m, s.level), 5);
  }
  get totalRiskExposure() {
    return this.risks.reduce((s, r) => s + r.currentProbability * r.costImpact, 0);
  }

  /** 0..1 fraction of the pyramid's design height that is built. */
  get buildFraction() {
    let f = 0;
    for (const task of this.tasks) {
      const band = task.spec.buildBand;
      if (!band) continue;
      const pct = this.state.get(task.id).pct;
      f = Math.max(f, band[0] + (band[1] - band[0]) * pct);
    }
    return f;
  }
  get casingFraction() {
    return this.state.get('7.2').pct;
  }
  get workforceRatio() {
    const assigned = this.resources.reduce((s, r) => (r.unit === 'workers' ? s + r.assigned : s), 0);
    const baseline = this.resources.reduce((s, r) => (r.unit === 'workers' ? s + r.baseline : s), 0);
    return baseline > 0 ? Math.min(1.4, assigned / baseline) : 1;
  }

  /* ------------------------------------------------------------ forecasts */

  /** Re-run CPM using remaining durations to get a live forecast finish. */
  _recomputeForecast() {
    const liveTasks = this.tasks.map((t) => {
      const st = this.state.get(t.id);
      const remaining = st.pct >= 1 ? 0 : Math.max(1, Math.round(st.remaining));
      const task = {
        id: t.id,
        name: t.name,
        duration: remaining,
        predecessors: t.predecessors,
        o: t.o,
        p: t.p,
        budget: t.budget,
        crashable: t.crashable,
        crashDuration: t.crashDuration,
        crashCost: t.crashCost,
      };
      if (st.actualStart !== null && st.pct < 1) task.constraintStart = 0;
      return task;
    });
    try {
      this.forecast = computeCPM(liveTasks);
      this.forecastFinish = this.day + this.forecast.duration;
      this.forecastPert = pertAnalysis(this.forecast, liveTasks, this.baselineDuration - this.day);
    } catch (err) {
      this.forecast = this.baseline;
      this.forecastFinish = this.baselineDuration;
    }
    this.scheduleVarianceDays = this.forecastFinish - this.baselineDuration;
  }

  crashPlan(days) {
    const liveTasks = this.tasks.map((t) => {
      const st = this.state.get(t.id);
      return {
        id: t.id,
        name: t.name,
        duration: st.pct >= 1 ? 0 : Math.max(1, Math.round(st.remaining)),
        predecessors: t.predecessors,
        budget: t.budget,
        crashable: st.pct < 1,
        crashDuration: Math.max(1, Math.round(st.remaining * 0.78)),
        crashCost: t.budget * 1.32,
      };
    });
    return crashCandidates(this.forecast || this.baseline, liveTasks, days);
  }

  /** Apply a crash: shorten remaining duration at a cost premium. */
  crashActivity(id, days) {
    const task = this.taskById.get(id);
    const st = this.state.get(id);
    if (!task || !st || st.pct >= 1) return false;
    const maxCrash = Math.max(0, st.remaining * 0.22);
    const take = Math.min(days, maxCrash);
    if (take <= 0) return false;
    st.crashed += take;
    st.remaining = Math.max(1, st.remaining - take);
    const cost = take * ((task.crashCost - task.budget) / Math.max(1, task.duration - task.crashDuration));
    this.riskSpent += cost;
    this.managementRemaining -= cost;
    this.log('info', `${task.code} crashed`, `${Math.round(take)} days bought for ${Math.round(cost).toLocaleString()} kdb.`);
    this._recomputeForecast();
    return true;
  }

  /* ------------------------------------------------------------- history */

  _recordEvm() {
    this.evmHistory.push({
      day: this.day,
      pv: this.plannedValueAt(this.day),
      ev: this.ev,
      ac: this.ac,
      spi: this.spi,
      cpi: this.cpi,
      eac: this.eac.typical,
    });
    if (this.evmHistory.length > 1400) this.evmHistory.shift();
    this.resourceHistory.push({
      day: this.day,
      values: this.resources.map((r) => ({ id: r.id, assigned: r.assigned, required: r.required })),
    });
    if (this.resourceHistory.length > 1400) this.resourceHistory.shift();
  }

  log(kind, title, detail) {
    this.eventSerial = (this.eventSerial || 0) + 1;
    this.events.unshift({
      serial: this.eventSerial,
      day: this.day,
      kind,
      title,
      detail,
      date: formatEgyptianDate(this.day),
    });
    if (this.events.length > 160) this.events.pop();
  }

  /* ------------------------------------------------------------ missions */

  get missionContext() {
    const self = this;
    return {
      pct: (id) => (self.state.get(id) ? self.state.get(id).pct : 0),
      spi: this.spi,
      cpi: this.cpi,
      welfare: this.welfare,
      safety: this.safety,
      quality: this.quality,
      realisedRisks: this.realisedRisks,
      overallProgress: this.overallProgress,
      minStakeholderLevel: this.minStakeholderLevel,
    };
  }

  _updateMissions() {
    const ctx = this.missionContext;
    for (let i = 0; i < this.missions.length; i++) {
      const mission = this.missions[i];
      if (mission.status === 'complete') continue;
      let all = true;
      for (const objective of mission.objectives) {
        const done = !!objective.check(ctx);
        if (done && !objective.done) objective.done = true;
        if (!objective.done) all = false;
      }
      if (mission.status === 'active' && all) {
        mission.status = 'complete';
        this.log('good', `Mission complete — ${mission.name}`, mission.reward);
        if (this.missions[i + 1]) {
          this.missions[i + 1].status = 'active';
          this.activeMissionIndex = i + 1;
          this.log('info', `Mission available — ${this.missions[i + 1].name}`, this.missions[i + 1].brief);
        }
      }
    }
  }

  get activeMission() {
    return this.missions.find((m) => m.status === 'active') || this.missions[this.missions.length - 1];
  }

  /* ----------------------------------------------------------- world link */

  /** The subset of state the 3D world needs each frame. */
  worldState() {
    return {
      coreProgress: this.buildFraction,
      casingProgress: this.casingFraction,
      workforceRatio: Math.min(1, this.workforceRatio),
      stoneRatio: this.stoneStock,
    };
  }

  /** Snapshot for the dashboard. */
  snapshot() {
    return {
      day: this.day,
      date: formatEgyptianDate(this.day),
      bac: this.bac,
      pv: this.pv,
      ev: this.ev,
      ac: this.ac,
      sv: this.sv,
      cv: this.cv,
      spi: this.spi,
      cpi: this.cpi,
      spit: this.spit,
      svt: this.svt,
      eac: this.eac,
      etc: this.etc,
      vac: this.vac,
      tcpi: this.tcpi,
      progress: this.overallProgress,
      baselineDuration: this.baselineDuration,
      forecastFinish: this.forecastFinish,
      scheduleVarianceDays: this.scheduleVarianceDays,
      welfare: this.welfare,
      safety: this.safety,
      stoneStock: this.stoneStock,
      toolStock: this.toolStock,
      quality: this.qualityScore,
      contingencyRemaining: this.contingencyRemaining,
      managementRemaining: this.managementRemaining,
      riskExposure: this.totalRiskExposure,
      realisedRisks: this.realisedRisks,
      incidents: this.incidents,
      finished: this.finished,
    };
  }
}
