/**
 * Project execution: the baseline, a seeded "as-built" run, and earned value.
 *
 * The baseline is the deterministic CPM answer.  The as-built run applies, once
 * at start-up and reproducibly from a seed:
 *
 *   - a productivity factor per work package (some crews beat the estimate,
 *     some do not),
 *   - Bernoulli trials on the *residual* probability of every risk, after its
 *     planned response,
 *   - quality-gate sampling, with rework days and rework cost when a sample
 *     falls outside tolerance.
 *
 * The result is re-run through the same CPM engine, so the as-built programme
 * obeys exactly the same precedence logic as the baseline.  Every number the
 * dashboard shows — and every state the 3-D world renders — is read out of
 * that one execution.
 *
 * No three.js, no DOM.
 */
import {
  PACKAGES, PKG_BY_ID, RISKS, QUALITY_GATES, GATE_BY_ID, RESOURCES, RES_BY_ID,
  PHASES, CONTROL_ACCOUNTS, MILESTONES, PROJECT_BUDGET_PKR, RESERVES, PROJECT_META,
} from './model.js';
import { buildNetwork, schedule, baselineDurations, criticalPath, criticalVariance, pertMean, pertSigma } from './cpm.js';
import { budgetOf } from './model.js';
import { makeRng, clamp, probit } from '../engine/rng.js';

/** Calendar anchor: a Monday, six working days per week (Mon–Sat). */
export const CALENDAR_START = new Date(Date.UTC(2025, 2, 3));
const WORK_DAYS_PER_WEEK = 6;

/** Map a working-day index to a calendar date. */
export function workingDayToDate(day) {
  const d = Math.max(0, Math.floor(day));
  const weeks = Math.floor(d / WORK_DAYS_PER_WEEK);
  const rem = d - weeks * WORK_DAYS_PER_WEEK;
  const out = new Date(CALENDAR_START.getTime());
  out.setUTCDate(out.getUTCDate() + weeks * 7 + rem);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Aug 2026" for a working-day index. */
export function formatDay(day) {
  const d = workingDayToDate(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Month index (0 = the month the project starts) for grouping the S-curve. */
export function monthOf(day) {
  const d = workingDayToDate(day);
  return (d.getUTCFullYear() - CALENDAR_START.getUTCFullYear()) * 12 +
    (d.getUTCMonth() - CALENDAR_START.getUTCMonth());
}

/**
 * Build the whole project: baseline schedule, as-built schedule, budgets,
 * risk outcomes, quality outcomes and the derived horizon.
 */
export function createProject(seed = 20260828) {
  const net = buildNetwork();
  const baseDur = baselineDurations(net);
  const baseline = schedule(net, baseDur);
  const baseFinish = Math.ceil(baseline.finish);

  const budgets = new Float64Array(net.n);
  for (let i = 0; i < net.n; i += 1) budgets[i] = budgetOf(net.ids[i]);
  let budgetTotal = 0;
  for (let i = 0; i < net.n; i += 1) budgetTotal += budgets[i];

  /* --------------------------------------------------- the as-built run -- */
  const rng = makeRng(seed);
  const actDur = new Float64Array(net.n);
  const costFactor = new Float64Array(net.n);
  const notes = new Map();

  for (let i = 0; i < net.n; i += 1) {
    const pkg = PKG_BY_ID.get(net.ids[i]);
    // Productivity: centred slightly pessimistic, which is what actually
    // happens on residential projects, and bounded so nothing goes silly.
    const drift = clamp(rng.normal() * 0.09 + 0.035, -0.16, 0.34);
    actDur[i] = Math.max(1, Math.round(baseDur[i] * (1 + drift)));
    costFactor[i] = clamp(1 + drift * 0.55 + rng.normal() * 0.035, 0.9, 1.4);
  }

  /* ------------------------------------------------------------- risks --- */
  const riskOutcomes = RISKS.map((risk) => {
    const responded = risk.response !== 'Accept';
    const p = responded ? risk.residualProb : risk.prob;
    const occurred = rng.chance(p);
    // The day a realised risk bites: uniformly within the window of the
    // earliest and latest activity it affects, on the baseline programme.
    let lo = Infinity;
    let hi = 0;
    for (const id of risk.affects) {
      const i = net.index.get(id);
      if (i === undefined) continue;
      lo = Math.min(lo, baseline.es[i]);
      hi = Math.max(hi, baseline.ef[i]);
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = baseFinish; }
    const day = Math.round(lo + (hi - lo) * rng());
    return {
      ...risk,
      responded,
      residual: p,
      emvPKR: risk.prob * risk.costPKR,
      residualEmvPKR: p * risk.costPKR,
      occurred,
      day: occurred ? day : null,
      impactDays: occurred ? risk.days : 0,
      impactCostPKR: occurred ? risk.costPKR : 0,
    };
  });

  for (const outcome of riskOutcomes) {
    if (!outcome.occurred || outcome.impactDays <= 0) continue;
    const share = outcome.impactDays / Math.max(1, outcome.affects.length);
    for (const id of outcome.affects) {
      const i = net.index.get(id);
      if (i === undefined) continue;
      actDur[i] += share;
      const list = notes.get(net.ids[i]) || [];
      list.push(`${outcome.id} ${outcome.name}`);
      notes.set(net.ids[i], list);
    }
  }

  /* ---------------------------------------------------- quality gates ---- */
  const gateOutcomes = QUALITY_GATES.map((gate) => {
    // Sample the measured value: centred on target, with a spread that makes
    // a failure plausible but uncommon.
    const spread = gate.tolerance * 0.55;
    const measured = gate.target + rng.normal() * spread;
    const deviation = Math.abs(measured - gate.target);
    const passed = deviation <= gate.tolerance;
    const i = net.index.get(gate.pkg);
    if (!passed && i !== undefined) {
      actDur[i] += gate.reworkDays;
      const list = notes.get(net.ids[i]) || [];
      list.push(`${gate.id} rework — ${gate.name}`);
      notes.set(net.ids[i], list);
    }
    return {
      ...gate,
      measured,
      deviation,
      passed,
      reworkAppliedDays: passed ? 0 : gate.reworkDays,
      reworkAppliedPKR: passed ? 0 : gate.reworkCostPKR,
    };
  });

  for (let i = 0; i < net.n; i += 1) actDur[i] = Math.max(1, Math.round(actDur[i]));
  const actual = schedule(net, actDur);
  const actFinish = Math.ceil(actual.finish);
  const horizon = Math.max(baseFinish, actFinish);

  /* ------------------------------------------------- actual cost per pkg -- */
  const actCost = new Float64Array(net.n);
  for (let i = 0; i < net.n; i += 1) actCost[i] = budgets[i] * costFactor[i];
  // Realised risk and rework costs land on the packages they affect.
  for (const outcome of riskOutcomes) {
    if (!outcome.occurred) continue;
    const share = outcome.impactCostPKR / Math.max(1, outcome.affects.length);
    for (const id of outcome.affects) {
      const i = net.index.get(id);
      if (i !== undefined) actCost[i] += share;
    }
  }
  for (const gate of gateOutcomes) {
    if (gate.passed) continue;
    const i = net.index.get(gate.pkg);
    if (i !== undefined) actCost[i] += gate.reworkAppliedPKR;
  }

  const cp = criticalPath(net, baseline);
  const variance = criticalVariance(net, baseline);

  const project = {
    net,
    seed,
    baseline,
    actual,
    baseDur,
    actDur,
    budgets,
    actCost,
    budgetTotal,
    baseFinish,
    actFinish,
    horizon,
    riskOutcomes,
    gateOutcomes,
    notes,
    criticalIds: cp,
    criticalSet: new Set(cp),
    criticalSigma: variance.sigma,
    criticalVariance: variance.variance,
  };

  project.pv = buildCurve(project, 'planned');
  project.evAc = buildCurve(project, 'actual');
  return project;
}

/** Cumulative cost curve (PV from the baseline, EV/AC from the as-built run). */
function buildCurve(project, which) {
  const { net, horizon } = project;
  const res = which === 'planned' ? project.baseline : project.actual;
  const pv = new Float64Array(horizon + 1);
  const ac = new Float64Array(horizon + 1);
  for (let i = 0; i < net.n; i += 1) {
    const s = res.es[i];
    const e = res.ef[i];
    const span = Math.max(1e-9, e - s);
    const budget = project.budgets[i];
    const cost = project.actCost[i];
    for (let d = 0; d <= horizon; d += 1) {
      const p = clamp((d - s) / span, 0, 1);
      pv[d] += budget * p;
      ac[d] += cost * p;
    }
  }
  return { value: pv, cost: ac };
}

/** Fraction of one package complete on the as-built programme at day `day`. */
export function packageProgress(project, pkgId, day) {
  const i = project.net.index.get(pkgId);
  if (i === undefined) return 0;
  const s = project.actual.es[i];
  const e = project.actual.ef[i];
  if (day >= e) return 1;
  if (day <= s) return 0;
  return clamp((day - s) / Math.max(1e-9, e - s), 0, 1);
}

/** Fraction complete on the *baseline* programme — used for planned-vs-actual. */
export function plannedProgress(project, pkgId, day) {
  const i = project.net.index.get(pkgId);
  if (i === undefined) return 0;
  const s = project.baseline.es[i];
  const e = project.baseline.ef[i];
  if (day >= e) return 1;
  if (day <= s) return 0;
  return clamp((day - s) / Math.max(1e-9, e - s), 0, 1);
}

/** Every package in progress on the given day, with its progress fraction. */
export function activePackages(project, day) {
  const out = [];
  for (let i = 0; i < project.net.n; i += 1) {
    const s = project.actual.es[i];
    const e = project.actual.ef[i];
    if (day >= s && day < e) {
      out.push({
        id: project.net.ids[i],
        pkg: PKG_BY_ID.get(project.net.ids[i]),
        progress: clamp((day - s) / Math.max(1e-9, e - s), 0, 1),
      });
    }
  }
  return out;
}

/** The dominant construction phase on a given day, by active budget weight. */
export function phaseAtDay(project, day) {
  if (day <= 0) return PHASES[0];
  const weights = new Map();
  for (const act of activePackages(project, day)) {
    const w = (weights.get(act.pkg.phase) || 0) + Math.max(1, project.budgets[project.net.index.get(act.id)]);
    weights.set(act.pkg.phase, w);
  }
  if (weights.size === 0) {
    // Between activities: report the phase of the most recently finished work.
    let best = PHASES[0];
    let bestEf = -Infinity;
    for (let i = 0; i < project.net.n; i += 1) {
      const ef = project.actual.ef[i];
      if (ef <= day && ef > bestEf) {
        bestEf = ef;
        best = PHASES.find((p) => p.id === PKG_BY_ID.get(project.net.ids[i]).phase) || PHASES[0];
      }
    }
    return best;
  }
  let bestId = null;
  let bestW = -1;
  for (const [id, w] of weights) if (w > bestW) { bestW = w; bestId = id; }
  return PHASES.find((p) => p.id === bestId) || PHASES[0];
}

/**
 * Earned-value analysis at a given day, including Earned Schedule.
 *
 *   PV  planned value      EV  earned value        AC  actual cost
 *   SV  = EV - PV          CV  = EV - AC
 *   SPI = EV / PV          CPI = EV / AC
 *   EAC1 = BAC / CPI                        (current cost performance holds)
 *   EAC2 = AC + (BAC - EV)                  (the rest goes to plan)
 *   EAC3 = AC + (BAC - EV) / (CPI × SPI)    (both trends hold)
 *   ETC = EAC - AC     VAC = BAC - EAC
 *   TCPI = (BAC - EV) / (BAC - AC)
 *
 * Earned Schedule: ES(t) is the time at which the planned value curve first
 * equals today's earned value; SV(t) = ES − t and SPI(t) = ES / t, which stay
 * meaningful near the end of the project where SPI always converges to 1.
 */
export function earnedValue(project, day) {
  const d = clamp(Math.round(day), 0, project.horizon);
  const bac = project.budgetTotal;
  const pv = project.pv.value[d];
  const ev = project.evAc.value[d];
  const ac = project.evAc.cost[d];

  const sv = ev - pv;
  const cv = ev - ac;
  const spi = pv > 1e-9 ? ev / pv : 1;
  const cpi = ac > 1e-9 ? ev / ac : 1;

  const eac1 = cpi > 1e-9 ? bac / cpi : bac;
  const eac2 = ac + (bac - ev);
  const denom = cpi * spi;
  const eac3 = denom > 1e-9 ? ac + (bac - ev) / denom : eac2;
  const eac = eac1;
  const etc = Math.max(0, eac - ac);
  const vac = bac - eac;
  const tcpi = Math.abs(bac - ac) > 1e-9 ? (bac - ev) / (bac - ac) : 1;

  // Earned schedule: walk the PV curve to find where it reaches today's EV.
  let es = 0;
  const curve = project.pv.value;
  if (ev > 0) {
    let k = 0;
    while (k < project.horizon && curve[k + 1] < ev) k += 1;
    const lo = curve[k];
    const hi = curve[k + 1];
    const frac = hi - lo > 1e-9 ? (ev - lo) / (hi - lo) : 0;
    es = k + clamp(frac, 0, 1);
  }
  const svt = es - d;
  const spit = d > 0 ? es / d : 1;

  return {
    day: d, bac, pv, ev, ac, sv, cv, spi, cpi,
    eac, eac1, eac2, eac3, etc, vac, tcpi,
    es, svt, spit,
    percentComplete: bac > 0 ? ev / bac : 0,
    percentSpent: bac > 0 ? ac / bac : 0,
    contingencyPKR: RESERVES.contingencyPKR,
    managementPKR: RESERVES.managementPKR,
  };
}

/** Cost performance broken down by control account, at a given day. */
export function costByAccount(project, day) {
  const d = clamp(Math.round(day), 0, project.horizon);
  const rows = CONTROL_ACCOUNTS.map((ca) => ({ ca, budget: 0, ev: 0, ac: 0, pv: 0 }));
  const byId = new Map(rows.map((r) => [r.ca.id, r]));
  for (let i = 0; i < project.net.n; i += 1) {
    const pkg = PKG_BY_ID.get(project.net.ids[i]);
    const row = byId.get(pkg.ca);
    if (!row) continue;
    const budget = project.budgets[i];
    const pa = packageProgress(project, pkg.id, d);
    const pp = plannedProgress(project, pkg.id, d);
    row.budget += budget;
    row.ev += budget * pa;
    row.pv += budget * pp;
    row.ac += project.actCost[i] * pa;
  }
  for (const row of rows) {
    row.spi = row.pv > 1e-9 ? row.ev / row.pv : 1;
    row.cpi = row.ac > 1e-9 ? row.ev / row.ac : 1;
    row.cv = row.ev - row.ac;
    row.sv = row.ev - row.pv;
  }
  return rows;
}

/** Cost of quality, split the four classical ways. */
export function costOfQuality(project) {
  let prevention = 0;
  let appraisal = 0;
  let internalFailure = 0;
  const externalFailure = 0;
  for (const risk of project.riskOutcomes) {
    if (risk.responded) prevention += risk.responseCostPKR;
  }
  for (const gate of project.gateOutcomes) {
    appraisal += 180000; // inspection, laboratory and survey cost per gate
    internalFailure += gate.reworkAppliedPKR;
  }
  const total = prevention + appraisal + internalFailure + externalFailure;
  return { prevention, appraisal, internalFailure, externalFailure, total };
}

/** Resource utilisation on a given day, per pool. */
export function resourceState(project, day) {
  const demand = new Map(RESOURCES.map((r) => [r.id, 0]));
  for (const act of activePackages(project, day)) {
    const pkg = act.pkg;
    const i = project.net.index.get(act.id);
    const span = Math.max(1, project.actual.ef[i] - project.actual.es[i]);
    // Head count implied by the package: its budget spread over its duration,
    // divided by the pool's day rate.
    const perDay = project.budgets[i] / span;
    const pool = RES_BY_ID.get(pkg.crew);
    // Only the labour content of a rate buys hours; the rest is material and
    // plant.  Capped at three times the pool so one material-heavy package
    // (chandeliers, say) reads as over-allocated rather than as 300 workers.
    const raw = pool ? (perDay * pool.labourFrac) / pool.dayRatePKR : 0;
    const heads = pool ? Math.min(raw, pool.size * 3) : 0;
    demand.set(pkg.crew, (demand.get(pkg.crew) || 0) + heads);
  }
  return RESOURCES.map((pool) => {
    const raw = demand.get(pool.id) || 0;
    const assigned = Math.min(pool.size, Math.round(raw));
    const over = Math.max(0, Math.round(raw) - pool.size);
    return {
      pool,
      demand: raw,
      assigned,
      over,
      utilisation: pool.size > 0 ? clamp(raw / pool.size, 0, 2) : 0,
      overCostPKR: over * pool.dayRatePKR * 1.5,
    };
  });
}

/** Total workforce on site on a given day — drives how many figures we draw. */
export function siteHeadcount(project, day) {
  let total = 0;
  for (const row of resourceState(project, day)) total += row.assigned;
  return total;
}

/** Milestones resolved against both programmes. */
export function milestoneTable(project) {
  return MILESTONES.map((ms) => {
    const i = project.net.index.get(ms.pkg);
    const planned = ms.at === 'start' ? project.baseline.es[i] : project.baseline.ef[i];
    const forecast = ms.at === 'start' ? project.actual.es[i] : project.actual.ef[i];
    return {
      ...ms,
      plannedDay: Math.round(planned),
      forecastDay: Math.round(forecast),
      varianceDays: Math.round(forecast - planned),
    };
  });
}

/** Confidence date from the PERT critical-path variance. */
export function confidenceDay(project, p) {
  return project.baseFinish + probit(p) * project.criticalSigma;
}

/** Rows for the work breakdown structure panel, with earned value roll-up. */
export function wbsRows(project, day) {
  const d = clamp(Math.round(day), 0, project.horizon);
  const rows = [];
  for (const ca of CONTROL_ACCOUNTS) {
    const children = [];
    let budget = 0;
    let ev = 0;
    let pv = 0;
    let ac = 0;
    let earliest = Infinity;
    let latest = 0;
    for (const pkg of PACKAGES) {
      if (pkg.ca !== ca.id) continue;
      const i = project.net.index.get(pkg.id);
      const b = project.budgets[i];
      const pa = packageProgress(project, pkg.id, d);
      const pp = plannedProgress(project, pkg.id, d);
      budget += b;
      ev += b * pa;
      pv += b * pp;
      ac += project.actCost[i] * pa;
      earliest = Math.min(earliest, project.actual.es[i]);
      latest = Math.max(latest, project.actual.ef[i]);
      children.push({
        pkg,
        budget: b,
        progress: pa,
        planned: pp,
        es: project.actual.es[i],
        ef: project.actual.ef[i],
        baseEs: project.baseline.es[i],
        baseEf: project.baseline.ef[i],
        tf: project.baseline.tf[i],
        ff: project.baseline.ff[i],
        critical: !!project.baseline.critical[i],
        te: pertMean(pkg),
        sigma: pertSigma(pkg),
        durBase: project.baseDur[i],
        durActual: project.actDur[i],
        actualCost: project.actCost[i],
        notes: project.notes.get(pkg.id) || [],
      });
    }
    rows.push({
      ca,
      budget,
      ev,
      pv,
      ac,
      progress: budget > 0 ? ev / budget : 0,
      spi: pv > 1e-9 ? ev / pv : 1,
      cpi: ac > 1e-9 ? ev / ac : 1,
      es: Number.isFinite(earliest) ? earliest : 0,
      ef: latest,
      children,
    });
  }
  return rows;
}

/** A short human summary of the project's health, used by the advisor. */
export function diagnose(project, day) {
  const evm = earnedValue(project, day);
  const findings = [];

  if (evm.spi < 0.97) {
    const slip = Math.round((1 - evm.spi) * evm.day);
    findings.push({
      severity: evm.spi < 0.92 ? 'high' : 'medium',
      title: `Behind schedule — SPI ${evm.spi.toFixed(3)}`,
      body: `Earned value trails plan by ${Math.round(Math.abs(evm.sv) / 1e5) / 10} crore, about ${slip} working days of work. Earned Schedule puts the project ${Math.abs(Math.round(evm.svt))} days behind.`,
      action: 'Look for the binding constraint on the critical path below and consider crashing the cheapest critical activity.',
    });
  } else if (evm.spi > 1.03) {
    findings.push({
      severity: 'good',
      title: `Ahead of schedule — SPI ${evm.spi.toFixed(3)}`,
      body: 'Earned value is running ahead of the baseline. Protect the gain: it is usually spent by the finishing trades.',
      action: 'Pull forward long-lead procurement while the float exists.',
    });
  }

  if (evm.cpi < 0.97) {
    findings.push({
      severity: evm.cpi < 0.92 ? 'high' : 'medium',
      title: `Over budget — CPI ${evm.cpi.toFixed(3)}`,
      body: `Cost variance is ${evm.cv < 0 ? '-' : ''}${Math.abs(Math.round(evm.cv / 1e5) / 10)} crore. Forecast at completion is ${Math.round(evm.eac / 1e7 * 100) / 100} crore against a ${Math.round(evm.bac / 1e7 * 100) / 100} crore budget.`,
      action: `TCPI is ${evm.tcpi.toFixed(3)} — the remaining work must run that much more efficiently than it has to finish on budget.`,
    });
  }

  const realised = project.riskOutcomes.filter((r) => r.occurred && r.day !== null && r.day <= day);
  if (realised.length) {
    const cost = realised.reduce((s, r) => s + r.impactCostPKR, 0);
    findings.push({
      severity: cost > RESERVES.contingencyPKR * 0.6 ? 'high' : 'medium',
      title: `${realised.length} risk${realised.length > 1 ? 's have' : ' has'} materialised`,
      body: `${realised.map((r) => r.id).join(', ')} — ${Math.round(cost / 1e5) / 10} crore drawn against a ${Math.round(RESERVES.contingencyPKR / 1e5) / 10} crore contingency.`,
      action: 'Review the residual probabilities on the remaining register; the responses that worked are worth repeating.',
    });
  }

  const failedGates = project.gateOutcomes.filter((g) => !g.passed);
  if (failedGates.length) {
    findings.push({
      severity: 'medium',
      title: `${failedGates.length} quality gate${failedGates.length > 1 ? 's' : ''} required rework`,
      body: failedGates.map((g) => `${g.id} ${g.name}`).join('; '),
      action: 'Rework days are already inside the as-built programme — the schedule you see includes them.',
    });
  }

  if (!findings.length) {
    findings.push({
      severity: 'good',
      title: 'Project is inside tolerance',
      body: `SPI ${evm.spi.toFixed(3)}, CPI ${evm.cpi.toFixed(3)}. Forecast completion ${formatDay(project.actFinish)}.`,
      action: 'Hold the baseline and keep the long-lead items under weekly review.',
    });
  }
  return { evm, findings };
}

/** Everything the world needs for one day, gathered in one call. */
export function projectStateAtDay(project, day) {
  const d = clamp(day, 0, project.horizon);
  const phase = phaseAtDay(project, d);
  const active = activePackages(project, d);
  const started = d >= project.actual.es[project.net.index.get('P2')];
  const finished = d >= project.actFinish;
  // A gap with no active package is not a hole in the model: it is a curing or
  // hand-over window designed into the programme by the lags on the network.
  // The world still shows a caretaker presence, and the HUD says why.
  const idle = active.length === 0 && started && !finished;
  return {
    day: d,
    date: formatDay(d),
    phase,
    active,
    idle,
    idleReason: idle ? nextActivityAfter(project, d) : null,
    headcount: siteHeadcount(project, d),
    evm: earnedValue(project, d),
    complete: finished,
  };
}

/** The next activity to start after a given day, and how long until it does. */
export function nextActivityAfter(project, day) {
  let best = null;
  for (let i = 0; i < project.net.n; i += 1) {
    const s = project.actual.es[i];
    if (s <= day) continue;
    if (!best || s < best.day) best = { id: project.net.ids[i], day: s };
  }
  if (!best) return null;
  return {
    id: best.id,
    pkg: PKG_BY_ID.get(best.id),
    startsInDays: Math.round(best.day - day),
  };
}

/** Project-level constants, exposed for the charter panel. */
export const PROJECT_FACTS = {
  meta: PROJECT_META,
  budgetPKR: PROJECT_BUDGET_PKR,
  reserves: RESERVES,
};
