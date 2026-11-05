import { fmtPKR, fmtIndex, fmtPercent } from '../core/format.js';

/**
 * MEHRAN's offline reasoning engine (pure JS — no DOM, runs under node --test).
 *
 * Every recommendation comes from an explicit, inspectable rule over the live
 * Project: earned value, the critical path, resource demand, control charts,
 * the risk register, the stakeholder engagement matrix, pending changes, the
 * agile board, procurement lead times and (when one has been run) the Monte
 * Carlo forecast. Each rule states the number it fired on, so a student can
 * check the reasoning against the dashboard.
 *
 * Actions are returned as DATA ({ kind, label, args, detail }); the browser
 * layer (mehran.js) wraps them in sim.requestApproval so nothing changes the
 * project without a human pressing Approve.
 *
 * Everything is defensive: a missing Project member yields a smaller answer,
 * never an exception.
 */

export const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, good: 3 };

/** Every rule the offline engine evaluates (ids as they appear on advice items). */
export const RULE_IDS = ['schedule', 'ahead', 'forecast', 'cost', 'tcpi', 'contingency', 'overalloc', 'starved', 'risk', 'weather', 'quality', 'ncr', 'safety', 'stakeholder', 'changes', 'wip', 'velocity', 'procurement', 'gate', 'montecarlo', 'ontrack'];

/* ------------------------------------------------------------ helpers */

export function safe(fn, dflt) {
  try {
    const r = fn();
    return r === undefined || r === null ? dflt : r;
  } catch {
    return dflt;
  }
}

export function num(v, dflt = NaN) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export function arr(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v[Symbol.iterator] === 'function' && typeof v !== 'string') return [...v];
  return [];
}

function getIn(map, id) {
  if (!map || id === undefined || id === null) return undefined;
  if (typeof map.get === 'function') return map.get(id);
  return map[id];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function pct(v, digits = 0) {
  return fmtPercent(v, digits);
}

export function idx(v) {
  return fmtIndex(v, 2);
}

export function money(v) {
  return fmtPKR(v);
}

export function days(v) {
  const n = Math.round(Math.abs(num(v, 0)));
  return `${n} day${n === 1 ? '' : 's'}`;
}

function firstNum(...vals) {
  for (const v of vals) {
    const n = num(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function eacOf(x) {
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'object') return firstNum(x.cpi, x.typical, x.composite, x.atBudget, x.bottomUp);
  return num(x);
}

function tcpiOf(x) {
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'object') return firstNum(x.bac, x.eac);
  return num(x);
}

/* ------------------------------------------------------------ state */

/**
 * Flatten the live project into a stable shape the rules and intents read.
 * Missing values become NaN / [] rather than throwing.
 */
export function readState(p, extras = {}) {
  p = p || {};
  const snap = safe(() => (typeof p.snapshot === 'function' ? p.snapshot() : null), {}) || {};
  const evm = safe(() => (typeof p.evm === 'function' ? p.evm() : null), {}) || {};
  const bac = firstNum(snap.bac, evm.bac, p.bac, 0);
  const pv = firstNum(snap.pv, evm.pv, 0);
  const ev = firstNum(snap.ev, evm.ev, 0);
  const ac = firstNum(snap.ac, evm.ac, 0);
  const spi = firstNum(snap.spi, evm.spi, pv > 0 ? ev / pv : 1);
  const cpi = firstNum(snap.cpi, evm.cpi, ac > 0 ? ev / ac : 1);
  let eac = firstNum(eacOf(snap.eac), eacOf(evm.eac));
  if (!Number.isFinite(eac)) eac = cpi > 0 ? bac / cpi : bac;
  const day = firstNum(snap.day, p.day, 0);
  const baselineDuration = firstNum(snap.baselineDuration, p.baselineDuration, 0);
  const forecastFinish = firstNum(snap.forecastFinish, p.forecastFinish, baselineDuration);
  const weatherRaw = snap.weather || p.weather || {};
  const weather = typeof weatherRaw === 'string'
    ? { kind: weatherRaw, label: weatherRaw, intensity: NaN, workFactor: NaN }
    : { kind: weatherRaw.kind || 'clear', label: weatherRaw.label || weatherRaw.kind || 'Clear', intensity: num(weatherRaw.intensity), workFactor: num(weatherRaw.workFactor) };
  const S = {
    day,
    dateLabel: snap.dateLabel || safe(() => p.dateLabel(day), '') || `Day ${day}`,
    phase: snap.phase || p.phase || 'initiating',
    finished: !!(snap.finished || p.finished),
    difficulty: p.difficulty || '',
    approach: p.approach || '',
    progress: firstNum(snap.progress, bac > 0 ? ev / bac : 0),
    bac, pv, ev, ac, spi, cpi, eac,
    sv: firstNum(snap.sv, evm.sv, ev - pv),
    cv: firstNum(snap.cv, evm.cv, ev - ac),
    etc: firstNum(snap.etc, evm.etc, eac - ac),
    vac: firstNum(snap.vac, evm.vac, bac - eac),
    tcpi: firstNum(tcpiOf(snap.tcpi), tcpiOf(evm.tcpi), bac - ac !== 0 ? (bac - ev) / (bac - ac) : NaN),
    svt: firstNum(snap.svt, evm.svt),
    spit: firstNum(snap.spit, evm.spit),
    baselineDuration,
    forecastFinish,
    scheduleVarianceDays: firstNum(snap.scheduleVarianceDays, forecastFinish - baselineDuration),
    contingencyReserve: num(p.contingencyReserve),
    contingencyRemaining: firstNum(snap.contingencyRemaining, p.contingencyRemaining),
    managementReserve: num(p.managementReserve),
    managementRemaining: firstNum(snap.managementRemaining, p.managementRemaining),
    riskExposure: firstNum(snap.riskExposure),
    openRisks: firstNum(snap.openRisks, arr(p.risks).filter((r) => r.status === 'Open').length),
    realisedRisks: firstNum(snap.realisedRisks, arr(p.risks).filter((r) => r.status === 'Occurred').length),
    qualityIndex: firstNum(snap.qualityIndex, p.qualityIndex),
    safety: firstNum(snap.safety, p.safety),
    welfare: firstNum(snap.welfare, p.welfare),
    incidents: firstNum(snap.incidents, Array.isArray(p.incidents) ? p.incidents.length : p.incidents),
    stakeholderSatisfaction: firstNum(snap.stakeholderSatisfaction, p.stakeholderSatisfaction),
    openChanges: firstNum(snap.openChanges, pendingChanges(p).length),
    velocity: snap.velocity,
    budgetBurn: firstNum(snap.budgetBurn, bac > 0 ? ac / bac : 0),
    weather,
    tasks: arr(p.tasks).length,
    mc: extras.mc && extras.mc.iterations ? extras.mc : null,
  };
  return S;
}

/* ------------------------------------------------------------ lookups */

export function taskState(p, id) {
  return getIn(p && p.state, id) || {};
}

export function taskById(p, id) {
  return getIn(p && p.taskById, id) || arr(p && p.tasks).find((t) => t.id === id || t.code === id) || null;
}

export function findTask(p, text) {
  const q = String(text || '').toLowerCase().trim();
  if (!q) return null;
  const tasks = arr(p && p.tasks);
  const code = q.match(/\b(\d{1,2}(?:\.\d{1,2})+)\b/);
  if (code) {
    const t = tasks.find((x) => String(x.code || x.id) === code[1]);
    if (t) return t;
  }
  let bestT = null;
  let bestScore = 0;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'what', 'if', 'we', 'fast', 'track', 'crash', 'task', 'package'].includes(w));
  for (const t of tasks) {
    const name = String(t.name || '').toLowerCase();
    let s = 0;
    for (const w of words) if (name.includes(w.replace(/s$/, ''))) s += w.length;
    if (s > bestScore) { bestScore = s; bestT = t; }
  }
  return bestScore >= 4 ? bestT : null;
}

/** Forecast networks are computed from today, so their ES/EF are offsets from p.day. */
function absForecast(p, v) {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return NaN;
  return p && p.forecast && p.forecast.nodes ? n + num(p.day, 0) : n;
}

function nodeOf(p, id, which = 'baseline') {
  const net = which === 'forecast' ? p.forecast || p.baseline : p.baseline;
  return getIn(net && net.nodes, id) || {};
}

/** Critical path as task rows (forecast network if available, else baseline). */
export function criticalPath(p) {
  const snap = safe(() => p.snapshot(), {}) || {};
  let ids = arr(p && p.forecast && p.forecast.criticalPath);
  if (!ids.length && Array.isArray(snap.criticalPath)) ids = snap.criticalPath;
  if (!ids.length && typeof snap.criticalPath === 'string') ids = snap.criticalPath.split(/\s*(?:→|->|,)\s*/).filter(Boolean);
  if (!ids.length) ids = arr(p && p.baseline && p.baseline.criticalPath);
  return ids.map((id) => {
    const t = taskById(p, id) || { id, code: id, name: id };
    const st = taskState(p, t.id);
    const n = nodeOf(p, t.id, 'forecast');
    const base = nodeOf(p, t.id, 'baseline');
    // A "blocked" flag on work that is not yet due is just normal sequencing.
    const due = num(base.es, Infinity) <= num(p && p.day, 0);
    return {
      id: t.id, code: t.code || t.id, name: t.name || t.id,
      pct: num(st.pct, 0), float: num(n.totalFloat, 0), duration: num(t.duration, 0),
      es: absForecast(p, n.es), ef: absForecast(p, n.ef), crashable: num(t.duration, 0) - num(t.crashDuration, num(t.duration, 0)),
      blocked: st.blocked && due && num(st.pct, 0) < 1 ? st.blocked : null,
    };
  });
}

/** Leaf tasks with float, sorted by least float (near-critical first). */
export function floatTable(p) {
  return arr(p && p.tasks).map((t) => {
    const n = nodeOf(p, t.id, 'forecast');
    return { id: t.id, code: t.code || t.id, name: t.name, float: num(n.totalFloat, NaN), freeFloat: num(n.freeFloat, NaN), pct: num(taskState(p, t.id).pct, 0) };
  }).filter((r) => Number.isFinite(r.float) && r.pct < 1).sort((a, b) => a.float - b.float);
}

function resourceById(p, id) {
  return getIn(p && p.resourceById, id) || arr(p && p.resources).find((r) => r.id === id) || null;
}

/** The critical-path package that is furthest behind its planned progress, and why. */
export function scheduleDriver(p, S) {
  const day = S ? S.day : num(p && p.day, 0);
  let worst = null;
  for (const row of criticalPath(p)) {
    if (row.pct >= 1) continue;
    const base = nodeOf(p, row.id, 'baseline');
    const es = num(base.es, NaN);
    const dur = Math.max(1, row.duration || num(base.ef, 0) - es || 1);
    if (!Number.isFinite(es) || day < es) continue;
    const expected = clamp((day - es) / dur, 0, 1);
    const gap = expected - row.pct;
    if (!worst || gap > worst.gap) worst = { ...row, gap, expected, dur };
  }
  if (!worst || worst.gap <= 0.02) return null;
  const task = taskById(p, worst.id) || {};
  const st = taskState(p, worst.id);
  const late = num(st.actualStart, NaN) - num(nodeOf(p, worst.id, 'baseline').es, NaN);
  const out = { ...worst, reason: 'behind its planned progress', recommendation: `Review ${worst.code} with its owner and agree a recovery plan.`, action: null, impact: null };
  if (worst.blocked) {
    out.reason = `blocked (${typeof st.blocked === 'string' ? st.blocked : 'waiting on a predecessor'})`;
    out.recommendation = `Clear the blocker first; adding labour to ${worst.code} will not help until it is lifted.`;
    return out;
  }
  let scarcest = null;
  for (const resId of Object.keys(task.crew || {})) {
    const r = resourceById(p, resId);
    if (!r) continue;
    const required = num(r.required, 0);
    const assigned = num(r.assigned, 0);
    if (required <= 0) continue;
    const f = assigned / required;
    if (!scarcest || f < scarcest.f) scarcest = { r, f, required, assigned };
  }
  if (scarcest && scarcest.f < 0.95) {
    const cap = num(scarcest.r.capacity, Infinity);
    const target = Math.round(Math.min(cap, scarcest.required * 1.05));
    out.reason = `short of ${String(scarcest.r.name || scarcest.r.id).toLowerCase()} (${pct(scarcest.f)} of demand)`;
    out.recommendation = `Raise ${scarcest.r.name || scarcest.r.id} from ${scarcest.assigned} to ${target} ${scarcest.r.unit || ''}`.trim() + '.';
    out.impact = `Restores ${worst.code} to full rate; recovers roughly ${days(worst.gap * worst.dur)} over its remaining span.`;
    if (target > scarcest.assigned) out.action = { kind: 'staffing', label: `Set ${scarcest.r.name || scarcest.r.id} to ${target}`, args: { resId: scarcest.r.id, n: target } };
    return out;
  }
  const hit = arr(p.risks).find((r) => (num(r.until, -1) >= day || (r.status === 'Occurred' && num(st.riskDays, 1) > 0)) && affects(r).includes(worst.id));
  if (hit) {
    out.reason = `hit by realised risk ${hit.id} (${hit.title})`;
    out.recommendation = `Work the response for ${hit.id}${strategyText(hit) ? ': ' + strategyText(hit) : ''}`;
    return out;
  }
  if (S && S.weather && Number.isFinite(S.weather.workFactor) && S.weather.workFactor < 0.9) {
    out.reason = `losing productivity to ${String(S.weather.label).toLowerCase()} (work factor ${pct(S.weather.workFactor)})`;
    out.recommendation = 'Shift weather-sensitive work to night shifts or re-sequence indoor work onto the critical path while it lasts.';
    return out;
  }
  const perf = num(st.perf, NaN);
  if (Number.isFinite(late) && late > 3) {
    out.reason = `started ${days(late)} late (day ${Math.round(num(st.actualStart))} vs baseline day ${Math.round(num(st.actualStart) - late)}), and its crews are fully supplied`;
    out.recommendation = `The slip was inherited from a predecessor, so adding labour to ${worst.code} cannot recover it; compress what is still ahead — ask me to "crash ${Math.max(5, Math.min(60, Math.round(late)))} days" or fast-track ${worst.code}'s successor.`;
    out.action = { kind: 'crash', label: `Crash ${days(Math.max(5, Math.min(60, Math.round(late))))}`, args: { days: Math.max(5, Math.min(60, Math.round(late))) }, detail: `Apply the least-cost crash plan for ${days(Math.max(5, Math.min(60, Math.round(late))))}.` };
    return out;
  }
  if (Number.isFinite(perf) && perf < 0.97) {
    const welfare = num(p.welfare, NaN);
    out.reason = `running at ${pct(perf)} of planned productivity` + (Number.isFinite(welfare) && welfare < 0.8 ? ` (workforce welfare ${pct(welfare)})` : '');
    out.recommendation = Number.isFinite(welfare) && welfare < 0.8
      ? `Fix welfare before adding headcount, then put the strongest crew on ${worst.code}; ask me to "crash ${Math.max(5, Math.round(worst.gap * worst.dur))} days" to price recovery.`
      : `Give ${worst.code} priority access to crews and approvals; if that is not enough, crash it (cost slope ${money(num(task.costSlope, NaN))}/day).`;
  }
  return out;
}

function affects(r) {
  return [...new Set([...arr(r.wbs), ...arr(r.affects), ...arr(r.taskIds), ...arr(r.packages), ...arr(r.tasks)])];
}

function strategyName(s) {
  if (!s) return '';
  if (Array.isArray(s)) return s[0];
  if (typeof s === 'string') return s;
  return s.strategy || s.name || s.kind || '';
}

function strategyText(r) {
  const s = arr(r.strategies).find((x) => strategyName(x) === r.response) || arr(r.strategies)[0];
  if (!s) return '';
  if (Array.isArray(s)) return s[1] || '';
  if (typeof s === 'string') return '';
  return s.action || s.text || s.description || s.detail || '';
}

/** Resource pools: starved (demand > supply), over capacity, idle (supply ≫ demand). */
export function resourceIssues(p) {
  const out = { starved: [], overCapacity: [], idle: [], rows: [] };
  for (const r of arr(p && p.resources)) {
    const required = num(r.required, 0);
    const assigned = num(r.assigned, 0);
    const capacity = num(r.capacity, Infinity);
    const util = firstNum(r.utilisation, assigned > 0 ? required / assigned : 0);
    const row = { id: r.id, name: r.name || r.id, unit: r.unit || '', required, assigned, capacity, util, dayRate: num(r.dayRate, 0) };
    out.rows.push(row);
    if (required > capacity * 1.001) out.overCapacity.push(row);
    if (required > 0 && assigned < required * 0.95) out.starved.push(row);
    if (assigned > required * 1.15 && assigned - required >= 1) out.idle.push({ ...row, excess: assigned - required, waste: (assigned - required) * num(r.dayRate, 0) });
  }
  out.idle.sort((a, b) => b.waste - a.waste);
  out.starved.sort((a, b) => a.assigned / Math.max(1, a.required) - b.assigned / Math.max(1, b.required));
  return out;
}

/** Western Electric zone tests on a series (returns rule hits, newest-relevant). */
export function westernElectricCheck(values, cl, sigma) {
  const v = arr(values).map((x) => num(x)).filter(Number.isFinite);
  const hits = [];
  if (v.length < 2 || !(sigma > 0)) return hits;
  const z = v.map((x) => (x - cl) / sigma);
  const n = z.length;
  if (Math.abs(z[n - 1]) > 3) hits.push({ rule: 1, text: 'latest point beyond 3σ' });
  for (let i = Math.max(0, n - 3); i <= n - 3; i++) {
    const w = z.slice(i, i + 3);
    if (w.filter((x) => x > 2).length >= 2 || w.filter((x) => x < -2).length >= 2) { hits.push({ rule: 2, text: '2 of 3 points beyond 2σ on one side' }); break; }
  }
  if (n >= 5) {
    const w = z.slice(n - 5);
    if (w.filter((x) => x > 1).length >= 4 || w.filter((x) => x < -1).length >= 4) hits.push({ rule: 3, text: '4 of 5 points beyond 1σ on one side' });
  }
  if (n >= 8) {
    const w = z.slice(n - 8);
    if (w.every((x) => x > 0) || w.every((x) => x < 0)) hits.push({ rule: 4, text: '8 consecutive points on one side of the centre line' });
  }
  return hits;
}

export function qualityIssues(p) {
  const q = (p && p.quality) || {};
  const metrics = [];
  for (const [key, m] of Object.entries(q.metrics || {})) {
    const samples = arr(m && m.samples).slice(-30);
    const values = samples.map((s) => num(typeof s === 'object' ? s.value : s)).filter(Number.isFinite);
    if (!values.length) { metrics.push({ key, name: (m && m.name) || key, unit: (m && m.unit) || '', n: 0, hits: [], outOfSpec: 0 }); continue; }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1));
    const spec = Number.isFinite(num(m.usl)) && Number.isFinite(num(m.lsl)) ? (num(m.usl) - num(m.lsl)) / 6 : NaN;
    const sigma = sd > 1e-9 ? sd : spec;
    const cl = firstNum(m.target, mean);
    const outOfSpec = samples.filter((s) => (typeof s === 'object' && s.ok === false) || (Number.isFinite(num(m.lsl)) && num(s.value) < num(m.lsl)) || (Number.isFinite(num(m.usl)) && num(s.value) > num(m.usl))).length;
    metrics.push({ key, name: m.name || key, unit: m.unit || '', n: values.length, mean, sigma, cl, target: num(m.target), latest: values[values.length - 1], hits: westernElectricCheck(values, cl, sigma), outOfSpec });
  }
  const ncrs = arr(q.ncrs).length ? arr(q.ncrs) : arr(p && p.ncrs);
  const openNcrs = ncrs.filter((n) => !/closed/i.test(String(n.status || '')));
  const coq = q.costOfQuality || {};
  const defects = Object.entries(q.defects || {}).map(([k, v]) => ({ category: k, count: num(v, 0) })).sort((a, b) => b.count - a.count);
  const total = defects.reduce((a, d) => a + d.count, 0);
  let cum = 0;
  const vitalFew = [];
  for (const d of defects) {
    if (cum / Math.max(1, total) >= 0.8) break;
    cum += d.count;
    vitalFew.push(d);
  }
  return { metrics, ncrs, openNcrs, coq, defects, vitalFew, inspectionLevel: num(q.inspectionLevel, 1) };
}

export function riskEmv(r) {
  const e = num(r.emv);
  if (Number.isFinite(e)) return e;
  const v = num(r.probability, 0) * num(r.costImpact, 0);
  return r.kind === 'opportunity' ? v : -v;
}

export function riskIssues(p, S) {
  const risks = arr(p && p.risks);
  const open = risks.filter((r) => r.status === 'Open' || !r.status);
  const threats = open.filter((r) => r.kind !== 'opportunity').sort((a, b) => Math.abs(riskEmv(b)) - Math.abs(riskEmv(a)) || num(b.score, 0) - num(a.score, 0));
  const opportunities = open.filter((r) => r.kind === 'opportunity').sort((a, b) => riskEmv(b) - riskEmv(a));
  const untreated = threats.filter((r) => !r.response || /accept/i.test(r.response) || r.responded === false);
  const weatherKind = S && S.weather && S.weather.kind;
  const weatherLinked = weatherKind && weatherKind !== 'clear' ? open.filter((r) => r.weather === weatherKind) : [];
  const occurred = risks.filter((r) => r.status === 'Occurred');
  const exposure = open.reduce((a, r) => a + Math.abs(Math.min(0, riskEmv(r))), 0);
  return { risks, open, threats, opportunities, untreated, weatherLinked, occurred, exposure: Number.isFinite(num(S && S.riskExposure)) ? Math.abs(S.riskExposure) : exposure };
}

export function bestStrategy(r) {
  const list = arr(r.strategies).map((s) => strategyName(s)).filter(Boolean);
  if (r.kind === 'opportunity') return list.find((s) => /exploit|enhance/i.test(s)) || list[0] || 'Enhance';
  return list.find((s) => /mitigate/i.test(s)) || list.find((s) => /transfer|avoid/i.test(s)) || list[0] || 'Mitigate';
}

const ENGAGE_FOR_LEVEL = { 1: 'inform', 2: 'inform', 3: 'consult', 4: 'involve', 5: 'collaborate' };
const LEVEL_NAMES = ['', 'Unaware', 'Resistant', 'Neutral', 'Supportive', 'Leading'];

export function levelName(n) {
  return LEVEL_NAMES[clamp(Math.round(num(n, 3)), 1, 5)];
}

export function stakeholderGaps(p) {
  return arr(p && p.stakeholders).map((s) => {
    const current = num(s.current, 3);
    const desired = num(s.desired, current);
    const gap = desired - current;
    const power = num(s.power, 0.5);
    const interest = num(s.interest, 0.5);
    const quadrant = power >= 0.5 ? (interest >= 0.5 ? 'Manage closely' : 'Keep satisfied') : (interest >= 0.5 ? 'Keep informed' : 'Monitor');
    const action = gap <= 0 ? 'inform' : ENGAGE_FOR_LEVEL[clamp(Math.round(desired), 1, 5)] || 'consult';
    return { id: s.id, role: s.role || s.name || s.id, group: s.group || '', current, desired, gap, power, interest, satisfaction: num(s.satisfaction, NaN), channel: s.channel || '', frequency: s.frequency || '', needs: s.needs || '', quadrant, action, priority: gap * (power * interest + 0.25) + (1 - num(s.satisfaction, 0.7)) * 0.3 };
  }).sort((a, b) => b.priority - a.priority);
}

export function findStakeholder(p, text) {
  const q = String(text || '').toLowerCase();
  const list = arr(p && p.stakeholders);
  const id = q.match(/\bs\d{2}\b/);
  if (id) {
    const s = list.find((x) => String(x.id).toLowerCase() === id[0]);
    if (s) return s;
  }
  const syn = [
    [/resident|neighbou?r|communit|local people/, /resident|communit/],
    [/settler|encroach|occupant/, /encroach|settler/],
    [/airline|operator|carrier/, /airline/],
    [/regulat|pcaa|aviation authority/, /regulat/],
    [/sponsor|paa|owner|board/, /sponsor/],
    [/chamber|business/, /chamber|business/],
    [/sindh|provinc/, /sindh/],
    [/ministry|federal/, /ministry/],
    [/development authority|hda|planning/, /development authority/],
    [/passeng|traveller|public/, /passeng/],
    [/contractor/, /contractor/],
    [/media|press|journalist/, /media|press/],
    [/staff|employee|union|worker/, /staff|union|worker/],
    [/environment|ngo/, /environment|ngo/],
  ];
  for (const [ask, role] of syn) {
    if (ask.test(q)) {
      const s = list.find((x) => role.test(String(x.role || x.name || '').toLowerCase()));
      if (s) return s;
    }
  }
  return list.find((x) => q.includes(String(x.role || '').toLowerCase().split(/[—(-]/)[0].trim())) || null;
}

export function pendingChanges(p) {
  return arr(p && p.changes).filter((c) => c.status === 'Raised' || c.status === 'Analysed');
}

export function agileInfo(p) {
  const a = (p && p.agile) || {};
  const vel = arr(a.velocity).map((v) => num(typeof v === 'object' ? firstNum(v.completed, v.points, v.velocity) : v)).filter(Number.isFinite);
  const recent = vel.slice(-3);
  const avg = recent.length ? recent.reduce((x, y) => x + y, 0) / recent.length : NaN;
  const backlog = arr(a.backlog);
  const by = {};
  for (const s of backlog) by[s.status || 'backlog'] = (by[s.status || 'backlog'] || 0) + 1;
  const pointsLeft = backlog.filter((s) => s.status !== 'done').reduce((x, s) => x + num(s.points, 0), 0);
  const pointsDone = backlog.filter((s) => s.status === 'done').reduce((x, s) => x + num(s.points, 0), 0);
  const limits = a.wip || {};
  const breaches = [];
  for (const k of ['doing', 'review', 'todo']) {
    const lim = num(limits[k]);
    if (Number.isFinite(lim) && (by[k] || 0) > lim) breaches.push({ status: k, count: by[k], limit: lim });
  }
  const sprintRaw = a.currentSprint;
  const sprint = typeof sprintRaw === 'object' && sprintRaw ? sprintRaw : arr(a.sprints).find((s) => s.n === sprintRaw) || arr(a.sprints)[arr(a.sprints).length - 1] || null;
  const sprintN = sprint ? sprint.n : num(sprintRaw, NaN);
  const burndown = arr(safe(() => p.agileBurndown(sprintN), []));
  const last = burndown.filter((b) => Number.isFinite(num(b.remaining))).pop();
  const behind = last ? num(last.remaining) - num(last.ideal, last.remaining) : 0;
  const trend = vel.length >= 2 ? vel[vel.length - 1] - vel[vel.length - 2] : 0;
  return { velocities: vel, avg, trend, backlog, by, pointsLeft, pointsDone, limits, breaches, sprint, sprintN, burndown, burndownGap: behind, sprintsLeft: avg > 0 ? Math.ceil(pointsLeft / avg) : NaN, sprintLength: num(a.sprintLength, 14), hasAgile: backlog.length > 0 || vel.length > 0 };
}

export function procurementInfo(p, S) {
  const list = arr(p && p.procurement);
  const by = {};
  for (const k of list) by[k.status || 'Planned'] = (by[k.status || 'Planned'] || 0) + 1;
  const day = S ? S.day : num(p && p.day, 0);
  const atRisk = [];
  for (const k of list) {
    if (!['Planned', 'RFP', 'Evaluating'].includes(k.status || 'Planned')) continue;
    // First package that has not started yet decides the need date.
    const need = Math.min(...arr(k.packageIds).filter((id) => !(num(taskState(p, id).pct, 0) > 0)).map((id) => { const v = absForecast(p, nodeOf(p, id, 'forecast').es); return Number.isFinite(v) ? v : Infinity; }));
    const lead = num(k.leadTime, 0);
    if (Number.isFinite(need) && need - day < lead + 14) atRisk.push({ ...k, needDay: need, slack: need - day - lead });
  }
  atRisk.sort((a, b) => a.slack - b.slack);
  const claims = list.reduce((a, k) => a + arr(k.claims).length, 0);
  return { list, by, atRisk, claims };
}

export function nextMilestone(p, S) {
  const day = S ? S.day : num(p && p.day, 0);
  const ms = arr(p && p.milestones).map((m) => {
    const st = taskState(p, m.taskId || m.id);
    const fcRaw = absForecast(p, nodeOf(p, m.taskId || m.id, 'forecast').ef);
    const fc = Number.isFinite(fcRaw) ? fcRaw : num(m.forecastDay, num(m.baselineDay));
    return { ...m, done: num(st.pct, 0) >= 1 || !!m.achieved || !!m.actualDay, forecastDay: fc };
  });
  return ms.filter((m) => !m.done).sort((a, b) => num(a.baselineDay, 1e9) - num(b.baselineDay, 1e9))[0] || null;
}

function crashSummary(p, wanted) {
  const raw = safe(() => p.crashPlan(wanted), null);
  if (!raw) return null;
  const plan = Array.isArray(raw) ? raw : arr(raw.plan);
  const recovered = Array.isArray(raw) ? plan.reduce((a, c) => a + num(c.days, num(c.crashDays, 0)), 0) : num(raw.recovered, plan.reduce((a, c) => a + num(c.days, 0), 0));
  const cost = Array.isArray(raw) ? plan.reduce((a, c) => a + num(c.cost, 0), 0) : num(raw.addedCost, num(raw.cost, 0));
  return { plan, recovered, cost, shortfall: Math.max(0, wanted - recovered) };
}

export { crashSummary };

/* ------------------------------------------------------------ analyse */

/**
 * The ranked advisory list. Each item:
 * { id, severity, title, why, recommendation, impact, action?: { kind, label, args, detail }, domain }
 */
export function analyse(p, extras = {}) {
  p = p || {};
  const S = extras.state || readState(p, extras);
  const out = [];
  const add = (item) => out.push(item);

  if (!arr(p.tasks).length) {
    return [{ id: 'empty', severity: 'info', title: 'No schedule loaded yet', why: 'The project engine has not produced a WBS or baseline, so there is nothing to measure.', recommendation: 'Start or load a project from the Session panel; MEHRAN will analyse it from day one.', impact: null, domain: 'Governance' }];
  }

  /* --- schedule */
  const driver = scheduleDriver(p, S);
  if (S.day > 0 && S.spi < 0.95) {
    const behind = Number.isFinite(S.svt) ? Math.max(0, -S.svt) : Math.max(0, S.scheduleVarianceDays);
    add({
      id: 'schedule', domain: 'Schedule',
      severity: S.spi < 0.88 ? 'critical' : 'warning',
      title: `Behind schedule — SPI ${idx(S.spi)}`,
      why: `Only ${pct(S.spi)} of the planned work is done (EV ${money(S.ev)} vs PV ${money(S.pv)})` + (behind >= 1 ? `, about ${days(behind)} of earned schedule lost.` : '.') +
        (driver ? ` The binding constraint is ${driver.code} ${driver.name}: ${pct(driver.pct)} complete against ${pct(driver.expected)} planned, ${driver.reason}.` : ' No single critical activity dominates; the loss is spread along the path.'),
      recommendation: driver ? driver.recommendation : 'Compress the critical path (crash the cheapest days first) or re-sequence near-critical work.',
      impact: driver && driver.impact,
      action: driver && driver.action,
    });
  } else if (S.day > 30 && S.spi > 1.05) {
    add({ id: 'ahead', domain: 'Schedule', severity: 'good', title: `Ahead of plan — SPI ${idx(S.spi)}`, why: `Earned value ${money(S.ev)} exceeds planned value ${money(S.pv)}.`, recommendation: 'Do not bank the float: pull forward long-lead procurement and near-critical work so the gain survives the monsoon.', impact: null });
  }

  /* --- forecast finish & crash */
  if (S.scheduleVarianceDays > 14 && !S.finished) {
    const want = Math.min(Math.round(S.scheduleVarianceDays), 60);
    const crash = crashSummary(p, want);
    add({
      id: 'forecast', domain: 'Schedule',
      severity: S.scheduleVarianceDays > 90 ? 'critical' : 'warning',
      title: `Forecast finish ${days(S.scheduleVarianceDays)} late`,
      why: `Re-running CPM on remaining durations gives handover on day ${Math.round(S.forecastFinish)} against a baseline of day ${Math.round(S.baselineDuration)}.`,
      recommendation: crash && crash.plan.length
        ? `Crash ${crash.plan.slice(0, 3).map((c) => c.id).join(', ')} to recover ${days(crash.recovered)} for about ${money(crash.cost)} (${money(crash.cost / Math.max(1, crash.recovered))} per day).`
        : 'No crashable time is left on the critical path; consider fast-tracking a discretionary dependency or a scope change.',
      impact: crash && crash.shortfall > 0 ? `${days(crash.shortfall)} cannot be recovered by crashing alone.` : null,
      action: crash && crash.plan.length ? { kind: 'crash', label: `Crash ${days(crash.recovered)}`, args: { days: Math.round(crash.recovered) }, detail: `Apply the least-cost crash plan (${crash.plan.length} activities, ${money(crash.cost)}).` } : null,
    });
  }

  /* --- cost */
  const res = resourceIssues(p);
  if (S.day > 0 && S.cpi < 0.97) {
    const idle = res.idle[0];
    add({
      id: 'cost', domain: 'Finance',
      severity: S.cpi < 0.9 ? 'critical' : 'warning',
      title: `Over budget — CPI ${idx(S.cpi)}`,
      why: `Each PKR 1 spent is earning PKR ${idx(S.cpi)} of work; CV is ${money(S.cv)} and the CPI-based EAC is ${money(S.eac)} (VAC ${money(S.vac)}).` +
        (idle ? ` ${idle.name} is staffed at ${Math.round(idle.assigned)} against demand of ${Math.round(idle.required)} — ${money(idle.waste)} a day buys idle time.` : ''),
      recommendation: idle ? `Release ${Math.round(idle.excess)} ${idle.unit} from ${idle.name}; there is no work face for them.` : 'Attack rework and waste: review NCRs and the defect Pareto before cutting scope.',
      impact: idle ? `Saves about ${money(idle.waste)} per day with no effect on the critical path.` : null,
      action: idle ? { kind: 'staffing', label: `Set ${idle.name} to ${Math.ceil(idle.required * 1.05)}`, args: { resId: idle.id, n: Math.ceil(idle.required * 1.05) } } : null,
    });
  }
  if (S.day > 0 && Number.isFinite(S.tcpi) && S.tcpi > 1.1 && !S.finished) {
    add({ id: 'tcpi', domain: 'Finance', severity: S.tcpi > 1.2 ? 'critical' : 'warning', title: `TCPI ${idx(S.tcpi)} — BAC is no longer credible`, why: `To finish on the original budget the remaining work must run at CPI ${idx(S.tcpi)}, while the project has achieved ${idx(S.cpi)} so far. Few projects improve by more than 0.10.`, recommendation: 'Present a revised EAC to the sponsor and ask for a decision on reserve, scope or funding — before the money runs out, not after.', impact: `Revised EAC ≈ ${money(S.eac)}.` });
  }

  /* --- reserves */
  if (Number.isFinite(S.contingencyRemaining) && S.contingencyReserve > 0) {
    const share = S.contingencyRemaining / S.contingencyReserve;
    if (share < 0.25) add({ id: 'contingency', domain: 'Risk', severity: 'critical', title: 'Contingency reserve nearly exhausted', why: `${money(S.contingencyRemaining)} left of ${money(S.contingencyReserve)} (${pct(share)}); ${S.realisedRisks || 0} risks have occurred.`, recommendation: 'Escalate to the sponsor now and request management reserve with a costed recovery plan.', impact: Number.isFinite(S.managementRemaining) ? `Management reserve available: ${money(S.managementRemaining)}.` : null });
    else if (share < 0.5 && S.progress < 0.6) add({ id: 'contingency', domain: 'Risk', severity: 'warning', title: `Contingency burning faster than progress`, why: `${pct(1 - share)} of contingency used at ${pct(S.progress)} complete.`, recommendation: 'Re-run quantitative risk analysis and tighten responses on the top threats.', impact: null });
  }

  /* --- resources */
  if (res.overCapacity.length) {
    const r = res.overCapacity[0];
    add({ id: 'overalloc', domain: 'Resources', severity: 'warning', title: `${r.name} over-allocated`, why: `Demand ${Math.round(r.required)} ${r.unit} exceeds capacity ${Math.round(r.capacity)} (${res.overCapacity.length} pool${res.overCapacity.length > 1 ? 's' : ''} over).`, recommendation: 'Level resources: delay non-critical work within its float before hiring more.', impact: 'Levelling may move non-critical dates; check the critical path afterwards.', action: { kind: 'level', label: 'Level resources', args: {}, detail: 'Run resource levelling across all pools.' } });
  } else if (res.starved.length && (!driver || !driver.action)) {
    const r = res.starved[0];
    const target = Math.round(Math.min(r.capacity, r.required * 1.05));
    if (target > r.assigned) add({ id: 'starved', domain: 'Resources', severity: 'info', title: `${r.name} short of demand`, why: `${Math.round(r.assigned)} assigned against ${Math.round(r.required)} required.`, recommendation: `Raise ${r.name} to ${target}.`, impact: null, action: { kind: 'staffing', label: `Set ${r.name} to ${target}`, args: { resId: r.id, n: target } } });
  }

  /* --- risk */
  const rk = riskIssues(p, S);
  const top = rk.untreated[0] || rk.threats[0];
  if (top && Math.abs(riskEmv(top)) > 0) {
    const strat = bestStrategy(top);
    add({ id: 'risk', domain: 'Risk', severity: num(top.score, 0) >= 15 ? 'warning' : 'info', title: `${top.id} is the largest ${rk.untreated.includes(top) ? 'untreated ' : ''}threat`, why: `${top.title}: ${pct(num(top.probability, 0))} × ${money(num(top.costImpact, 0))} = EMV ${money(riskEmv(top))}${num(top.daysImpact, 0) ? `, ${days(top.daysImpact)} of schedule` : ''}. Owner: ${top.owner || 'unassigned'}. Trigger: ${top.trigger || 'not recorded'}.`, recommendation: `${strat}${strategyText({ ...top, response: strat }) ? ': ' + strategyText({ ...top, response: strat }) : ''}`, impact: Number.isFinite(num(top.responseCost)) ? `Response cost ${money(top.responseCost)}.` : null, action: top.response !== strat ? { kind: 'risk', label: `${strat} ${top.id}`, args: { riskId: top.id, strategy: strat }, detail: `Set the response for ${top.id} (${top.title}) to ${strat}.` } : null });
  }
  if (rk.weatherLinked.length) {
    const r = rk.weatherLinked[0];
    add({ id: 'weather', domain: 'Risk', severity: 'warning', title: `${S.weather.label}: trigger for ${r.id}`, why: `Current weather matches the trigger of ${rk.weatherLinked.map((x) => x.id).join(', ')} — ${r.title}.`, recommendation: strategyText(r) || 'Activate the weather contingency plan and protect open works.', impact: null });
  }

  /* --- quality */
  const q = qualityIssues(p);
  const bad = q.metrics.filter((m) => m.hits.length);
  if (bad.length) {
    const m = bad[0];
    const lvl = Math.min(1.5, Math.round((q.inspectionLevel + 0.25) * 100) / 100);
    add({ id: 'quality', domain: 'Quality', severity: m.hits.some((h) => h.rule === 1) ? 'warning' : 'info', title: `${m.name} control chart signals a special cause`, why: `Western Electric rule ${m.hits[0].rule}: ${m.hits[0].text} (latest ${fmt(m.latest)} ${m.unit}, centre ${fmt(m.cl)}, σ ${fmt(m.sigma)}).`, recommendation: 'Investigate the cause (fishbone) before the next pour or lift and raise inspection temporarily — appraisal is cheaper than rework.', impact: `${q.openNcrs.length} open NCR${q.openNcrs.length === 1 ? '' : 's'}.`, action: lvl > q.inspectionLevel ? { kind: 'inspection', label: `Inspection to ${lvl.toFixed(2)}`, args: { level: lvl }, detail: `Raise the inspection level from ${q.inspectionLevel.toFixed(2)} to ${lvl.toFixed(2)}.` } : null });
  } else if (q.openNcrs.length >= 3) {
    add({ id: 'ncr', domain: 'Quality', severity: 'info', title: `${q.openNcrs.length} open NCRs`, why: q.vitalFew.length ? `The vital few defect categories are ${q.vitalFew.map((d) => d.category).join(', ')}.` : 'Non-conformances are accumulating.', recommendation: 'Close NCRs weekly; fix the root cause of the top Pareto category first.', impact: null });
  }

  /* --- safety */
  if (Number.isFinite(S.safety) && S.safety < 0.8) {
    add({ id: 'safety', domain: 'Resources', severity: S.safety < 0.65 ? 'critical' : 'warning', title: `Safety index ${pct(S.safety)}`, why: `${Number.isFinite(S.incidents) ? S.incidents : 'Several'} incident(s) recorded.`, recommendation: 'Hold a safety stand-down, refresh the airside method of working plan and audit haul-route separation.', impact: null });
  }

  /* --- stakeholders */
  const gaps = stakeholderGaps(p).filter((g) => g.gap > 0);
  if (gaps.length) {
    const g = gaps[0];
    add({ id: 'stakeholder', domain: 'Stakeholders', severity: g.gap >= 2 && g.power >= 0.6 ? 'warning' : 'info', title: `${g.role}: ${levelName(g.current)} → target ${levelName(g.desired)}`, why: `Power ${pct(g.power)}, interest ${pct(g.interest)} (${g.quadrant})${Number.isFinite(g.satisfaction) ? `, satisfaction ${pct(g.satisfaction)}` : ''}. Needs: ${String(g.needs || 'not recorded').replace(/\.$/, '')}.`, recommendation: `${cap(g.action)} them via ${g.channel || 'a face-to-face meeting'}${g.frequency ? ` (${g.frequency.toLowerCase()})` : ''}.`, impact: `${gaps.length} stakeholder${gaps.length > 1 ? 's are' : ' is'} below the desired engagement level.`, action: { kind: 'engage', label: `${cap(g.action)} ${g.id}`, args: { id: g.id, how: g.action }, detail: `Run a "${g.action}" engagement with ${g.role}.` } });
  }

  /* --- changes */
  const pend = pendingChanges(p);
  if (pend.length) {
    const c = pend[0];
    add({ id: 'changes', domain: 'Governance', severity: pend.length >= 3 ? 'warning' : 'info', title: `${pend.length} change request${pend.length > 1 ? 's' : ''} awaiting the CCB`, why: `${c.id} "${c.title}" is ${String(c.status).toLowerCase()} since day ${num(c.day, S.day)}.`, recommendation: c.status === 'Raised' ? `Analyse ${c.id}'s impact on scope, time, cost, quality and risk before the board votes.` : `Take ${c.id} to the CCB: approve, reject or defer — undecided changes are hidden risk.`, impact: null, action: c.status === 'Raised' ? { kind: 'analyseChange', label: `Analyse ${c.id}`, args: { id: c.id }, detail: `Run impact analysis on ${c.id}.` } : { kind: 'openPanel', label: 'Open change control', args: { id: 'control' } } });
  }

  /* --- agile */
  const ag = agileInfo(p);
  if (ag.breaches.length) {
    const b = ag.breaches[0];
    add({ id: 'wip', domain: 'Agile', severity: 'warning', title: `WIP limit breached in "${b.status}"`, why: `${b.count} stories in ${b.status} against a limit of ${b.limit}. By Little's Law, cycle time rises with WIP.`, recommendation: 'Stop starting, start finishing: swarm on the oldest item in review before pulling new work.', impact: null, action: { kind: 'openPanel', label: 'Open the agile board', args: { id: 'agile' } } });
  } else if (ag.velocities.length >= 3 && ag.trend < 0 && ag.avg > 0 && -ag.trend / ag.avg > 0.2) {
    add({ id: 'velocity', domain: 'Agile', severity: 'info', title: 'Velocity is falling', why: `Last sprint ${ag.velocities[ag.velocities.length - 1]} points vs a 3-sprint average of ${ag.avg.toFixed(1)}.`, recommendation: 'Use the retrospective to find the impediment; do not push the team to "commit harder".', impact: Number.isFinite(ag.sprintsLeft) ? `About ${ag.sprintsLeft} sprints of backlog remain at the average.` : null });
  }

  /* --- procurement */
  const pr = procurementInfo(p, S);
  if (pr.atRisk.length) {
    const k = pr.atRisk[0];
    add({ id: 'procurement', domain: 'Resources', severity: k.slack < 0 ? 'warning' : 'info', title: `${k.id} ${k.name} is on the procurement critical path`, why: `Still "${k.status || 'Planned'}" with a ${days(k.leadTime)} lead time; the first package needs it on day ${Math.round(k.needDay)}.`, recommendation: k.status === 'Evaluating' ? 'Close the evaluation and award this week.' : 'Issue the RFP now and run a bidder conference to shorten clarifications.', impact: k.slack < 0 ? `Already ${days(-k.slack)} short of lead time.` : `${days(k.slack)} of procurement slack left.`, action: { kind: 'openPanel', label: 'Open procurement', args: { id: 'procurement' } } });
  }

  /* --- gates */
  const ready = arr(p.gates).find((g) => g.status === 'ready');
  if (ready) add({ id: 'gate', domain: 'Governance', severity: 'info', title: `${ready.id} ${ready.name} is ready for approval`, why: 'All gate criteria are met.', recommendation: 'Hold the gate review with the sponsor and record the decision.', impact: null, action: { kind: 'approveGate', label: `Approve ${ready.id}`, args: { id: ready.id }, detail: `Approve gate ${ready.id} (${ready.name}).` } });

  /* --- Monte Carlo */
  if (S.mc) {
    const f = S.mc.finish || {};
    const pOn = num(S.mc.probabilityOnTime);
    const t0 = arr(S.mc.tornado)[0];
    add({ id: 'montecarlo', domain: 'Risk', severity: pOn < 0.4 ? 'warning' : 'info', title: `Monte Carlo: ${pct(pOn)} chance of the baseline date`, why: `${num(S.mc.iterations, 0).toLocaleString('en-US')} iterations: P50 day ${Math.round(num(f.p50))}, P80 day ${Math.round(num(f.p80))} vs baseline ${Math.round(S.baselineDuration)}.`, recommendation: t0 ? `${t0.code || t0.id} drives the spread most (r = ${num(t0.correlation, 0).toFixed(2)}); firm up its estimate first.` : 'Commit externally to the P80 date, manage internally to P50.', impact: `Commit to P80 (day ${Math.round(num(f.p80))}) if the sponsor needs a date they can rely on.` });
  }

  if (!out.some((o) => o.severity === 'critical' || o.severity === 'warning')) {
    add({ id: 'ontrack', domain: 'Governance', severity: 'good', title: S.day === 0 ? 'Baseline set — ready to start' : 'The works are in hand', why: `SPI ${idx(S.spi)}, CPI ${idx(S.cpi)}, ${pct(S.progress)} complete, ${S.openRisks || 0} open risks.`, recommendation: S.day === 0 ? 'Set the simulation running, then watch the critical path and the top three risks.' : 'Hold the plan; spend the time on the next gate criteria and on stakeholders below target.', impact: null });
  }

  out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return out.slice(0, 8);
}

function fmt(v) {
  const n = num(v);
  if (!Number.isFinite(n)) return '—';
  return Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function cap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function headline(p, S) {
  S = S || readState(p);
  if (S.finished) return 'Handover complete. Capture the lessons learned while they are fresh.';
  if (!arr(p && p.tasks).length) return 'Waiting for a project baseline.';
  if (S.spi < 0.9) return `Behind schedule (SPI ${idx(S.spi)}). The critical path is the constraint.`;
  if (S.cpi < 0.9) return `Over budget (CPI ${idx(S.cpi)}). Find the waste before cutting scope.`;
  return `Day ${S.day} · ${pct(S.progress)} earned · SPI ${idx(S.spi)} · CPI ${idx(S.cpi)}`;
}

/* ------------------------------------------------------------ actions */

/** Kinds that change project state and therefore need human approval. */
export const STATE_CHANGING = new Set(['crash', 'staffing', 'level', 'risk', 'engage', 'inspection', 'raiseChange', 'analyseChange', 'fastTrack', 'approveGate']);

function call(p, name, ...args) {
  if (!p || typeof p[name] !== 'function') return { ok: false, message: `The project engine has no ${name}() method in this build.` };
  try {
    const r = p[name](...args);
    return { ok: !(r && r.ok === false), result: r, message: r && r.message };
  } catch (err) {
    return { ok: false, message: `${name} failed: ${err && err.message ? err.message : err}` };
  }
}

/** Execute an action's data against the project. Call only after approval. */
export function executeAction(p, action) {
  const a = (action && action.args) || {};
  let r;
  switch (action && action.kind) {
    case 'crash': r = call(p, 'applyCrashPlan', a.days); r.message = r.message || (r.ok ? `Crash plan applied for ${days(a.days)}.` : r.message); break;
    case 'staffing': r = call(p, 'setStaffing', a.resId, a.n); r.message = r.message || (r.ok ? `${a.resId} set to ${a.n}.` : r.message); break;
    case 'level': r = call(p, 'levelResources'); r.message = r.message || (r.ok ? 'Resources levelled.' : r.message); break;
    case 'risk': r = call(p, 'respondToRisk', a.riskId, a.strategy); r.message = r.message || (r.ok ? `${a.riskId} response set to ${a.strategy}.` : r.message); break;
    case 'engage': r = call(p, 'engageStakeholder', a.id, a.how); r.message = r.message || (r.ok ? `Engagement (${a.how}) logged with ${a.id}.` : r.message); break;
    case 'inspection': r = call(p, 'setInspectionLevel', a.level); r.message = r.message || (r.ok ? `Inspection level set to ${num(a.level, 1).toFixed(2)}.` : r.message); break;
    case 'raiseChange': r = call(p, 'raiseChange', { title: a.title, description: a.description, raisedBy: a.raisedBy || 'MEHRAN (AI assistant)', impact: a.impact }); r.message = r.message || (r.ok ? `Change request ${(r.result && r.result.id) || ''} raised.`.replace('  ', ' ') : r.message); break;
    case 'analyseChange': r = call(p, 'analyseChange', a.id); r.message = r.message || (r.ok ? `${a.id} analysed.` : r.message); break;
    case 'fastTrack': r = call(p, 'fastTrack', a.id); r.message = r.message || (r.ok && r.result ? `Fast-tracked ${a.id}: ${days(num(r.result.daysSaved, 0))} saved.` : r.message); break;
    case 'approveGate': r = call(p, 'approveGate', a.id); r.message = r.message || (r.ok ? `Gate ${a.id} approved.` : r.message); break;
    default: r = { ok: false, message: 'Unknown action.' };
  }
  return r;
}

/* ------------------------------------------------------------ reports */

function rag(S) {
  if (S.spi < 0.9 || S.cpi < 0.9 || S.scheduleVarianceDays > 90) return 'RED';
  if (S.spi < 0.97 || S.cpi < 0.97 || S.scheduleVarianceDays > 21) return 'AMBER';
  return 'GREEN';
}

export function recentEvents(p, sinceDay, limit = 5) {
  return arr(p && p.events).filter((e) => num(e.day, -1) >= sinceDay).slice(0, limit);
}

/** Daily stand-up briefing (plain text, ~120 words). */
export function standupText(p, S, advice) {
  S = S || readState(p);
  advice = advice || analyse(p, { state: S });
  const ev = recentEvents(p, S.day - 1, 3);
  const blockers = criticalPath(p).filter((c) => c.blocked);
  const lines = [];
  lines.push(`**Stand-up — day ${S.day}, ${S.dateLabel}** (${String(S.phase)})`);
  lines.push(`Numbers: ${pct(S.progress)} complete · SPI ${idx(S.spi)} · CPI ${idx(S.cpi)} · forecast finish day ${Math.round(S.forecastFinish)} (${S.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(S.scheduleVarianceDays)} d) · weather ${S.weather.label}.`);
  lines.push(`Since yesterday: ${ev.length ? ev.map((e) => e.title).join('; ') : 'no logged events'}.`);
  const today = advice.filter((a) => a.severity !== 'good').slice(0, 2);
  lines.push(`Today: ${today.length ? today.map((a) => a.recommendation).join(' ') : 'hold the plan and protect the critical path.'}`);
  lines.push(`Blockers: ${blockers.length ? blockers.map((b) => `${b.code} ${b.name}`).join(', ') : 'none on the critical path'}.`);
  return lines.join('\n');
}

/** Weekly status report as Markdown → { title, markdown }. */
export function statusReport(p, S, advice) {
  S = S || readState(p);
  advice = advice || analyse(p, { state: S });
  const rk = riskIssues(p, S);
  const q = qualityIssues(p);
  const ag = agileInfo(p);
  const pr = procurementInfo(p, S);
  const pend = pendingChanges(p);
  const gaps = stakeholderGaps(p).filter((g) => g.gap > 0).slice(0, 3);
  const cp = criticalPath(p).filter((c) => c.pct < 1).slice(0, 5);
  const ms = nextMilestone(p, S);
  const status = rag(S);
  const title = `HDD Revival & Expansion — Weekly Status Report, week ${Math.floor(S.day / 7) + 1} (day ${S.day})`;
  const L = [];
  L.push(`# ${title}`);
  L.push('');
  L.push(`_${S.dateLabel} · phase: ${S.phase} · overall status: **${status}** · Simulated scenario data_`);
  L.push('');
  L.push('## 1. Summary');
  L.push(headline(p, S));
  const decisions = advice.filter((a) => a.severity === 'critical' || a.severity === 'warning');
  L.push('');
  L.push('**Decisions needed from the sponsor / CCB**');
  if (decisions.length) for (const d of decisions.slice(0, 4)) L.push(`- ${d.title}: ${d.recommendation}`);
  else L.push('- None this week.');
  L.push('');
  L.push('## 2. Performance (earned value)');
  L.push('| Measure | Value |');
  L.push('|---|---|');
  L.push(`| % complete | ${pct(S.progress)} |`);
  L.push(`| BAC | ${money(S.bac)} |`);
  L.push(`| PV / EV / AC | ${money(S.pv)} / ${money(S.ev)} / ${money(S.ac)} |`);
  L.push(`| SV / CV | ${money(S.sv)} / ${money(S.cv)} |`);
  L.push(`| SPI / CPI | ${idx(S.spi)} / ${idx(S.cpi)} |`);
  L.push(`| EAC / VAC | ${money(S.eac)} / ${money(S.vac)} |`);
  L.push(`| TCPI (BAC) | ${idx(S.tcpi)} |`);
  L.push(`| Forecast finish | day ${Math.round(S.forecastFinish)} (baseline ${Math.round(S.baselineDuration)}) |`);
  if (Number.isFinite(S.contingencyRemaining)) L.push(`| Contingency remaining | ${money(S.contingencyRemaining)}${S.contingencyReserve > 0 ? ` of ${money(S.contingencyReserve)}` : ''} |`);
  if (S.mc) L.push(`| Monte Carlo P50 / P80 | day ${Math.round(num(S.mc.finish && S.mc.finish.p50))} / day ${Math.round(num(S.mc.finish && S.mc.finish.p80))} (${pct(num(S.mc.probabilityOnTime))} on time) |`);
  L.push('');
  L.push('## 3. Schedule');
  L.push(cp.length ? `Open critical activities: ${cp.map((c) => `${c.code} ${c.name} (${pct(c.pct)})`).join('; ')}.` : 'No open critical activities.');
  if (ms) L.push(`Next milestone: **${ms.name}** — baseline day ${Math.round(num(ms.baselineDay))}${Number.isFinite(ms.forecastDay) ? `, forecast day ${Math.round(ms.forecastDay)}` : ''}.`);
  L.push('');
  L.push('## 4. Top risks');
  const topR = rk.threats.slice(0, 5);
  if (topR.length) {
    L.push('| ID | Risk | P | Impact | EMV | Response | Owner |');
    L.push('|---|---|---|---|---|---|---|');
    for (const r of topR) L.push(`| ${r.id} | ${r.title} | ${pct(num(r.probability, 0))} | ${money(num(r.costImpact, 0))} | ${money(riskEmv(r))} | ${r.response || '—'} | ${r.owner || '—'} |`);
  } else L.push('No open threats.');
  L.push(`Realised risks to date: ${S.realisedRisks || 0}. Exposure: ${money(rk.exposure)}.`);
  L.push('');
  L.push('## 5. Changes, issues & quality');
  L.push(`Pending change requests: ${pend.length ? pend.map((c) => `${c.id} ${c.title} (${c.status})`).join('; ') : 'none'}.`);
  L.push(`Open NCRs: ${q.openNcrs.length}. Quality index: ${Number.isFinite(S.qualityIndex) ? pct(S.qualityIndex) : '—'}. Safety index: ${Number.isFinite(S.safety) ? pct(S.safety) : '—'}${Number.isFinite(S.incidents) ? `, incidents ${S.incidents}` : ''}.`);
  const sig = q.metrics.filter((m) => m.hits.length);
  if (sig.length) L.push(`Control-chart signals: ${sig.map((m) => `${m.name} (rule ${m.hits[0].rule})`).join(', ')}.`);
  L.push('');
  L.push('## 6. Stakeholders');
  L.push(gaps.length ? gaps.map((g) => `- ${g.role}: ${levelName(g.current)} → ${levelName(g.desired)} — plan: ${g.action} via ${g.channel || 'meeting'}.`).join('\n') : 'All key stakeholders are at their desired engagement level.');
  if (ag.hasAgile) {
    L.push('');
    L.push('## 7. Agile workstream (terminal IT)');
    L.push(`Velocity (last 3 sprints): ${ag.velocities.slice(-3).join(', ') || '—'}; average ${Number.isFinite(ag.avg) ? ag.avg.toFixed(1) : '—'} points. Backlog remaining ${ag.pointsLeft} points${Number.isFinite(ag.sprintsLeft) ? ` (≈ ${ag.sprintsLeft} sprints)` : ''}. WIP breaches: ${ag.breaches.length ? ag.breaches.map((b) => `${b.status} ${b.count}/${b.limit}`).join(', ') : 'none'}.`);
  }
  if (pr.list.length) {
    L.push('');
    L.push('## 8. Procurement');
    L.push(Object.entries(pr.by).map(([k, v]) => `${k}: ${v}`).join(' · ') + `. Claims: ${pr.claims}.`);
    if (pr.atRisk.length) L.push(`Watch: ${pr.atRisk.slice(0, 3).map((k) => `${k.id} ${k.name}`).join('; ')}.`);
  }
  L.push('');
  L.push('## Next week');
  const nxt = advice.filter((a) => a.severity !== 'good').slice(0, 3);
  L.push(nxt.length ? nxt.map((a) => `- ${a.recommendation}`).join('\n') : '- Continue to plan; prepare the next gate review.');
  L.push('');
  L.push('---');
  L.push('_Generated by MEHRAN (offline rule engine) from the live simulation. All project figures are simulated scenario data; recommendations need human review._');
  return { title, markdown: L.join('\n') };
}

/** Risk responses: recommended strategy per open risk with the rationale. */
export function riskResponses(p, S) {
  S = S || readState(p);
  const rk = riskIssues(p, S);
  return [...rk.threats, ...rk.opportunities].slice(0, 10).map((r) => {
    const strat = bestStrategy(r);
    return { id: r.id, title: r.title, kind: r.kind || 'threat', emv: riskEmv(r), score: num(r.score), current: r.response || '—', recommended: strat, rationale: strategyText({ ...r, response: strat }) || (r.kind === 'opportunity' ? 'Increase the chance of capturing the upside.' : 'Reduce probability and impact below the risk threshold.'), owner: r.owner || '—', trigger: r.trigger || '' };
  });
}

/** Text impact analysis for a change request. */
export function changeImpact(p, crId) {
  const c = arr(p && p.changes).find((x) => String(x.id).toLowerCase() === String(crId || '').toLowerCase()) || pendingChanges(p)[0];
  if (!c) return 'There are no change requests in the log yet. Raise one from the Control panel (key C) or ask me to "raise a change for …".';
  const i = c.impact || {};
  const S = readState(p);
  const parts = [];
  parts.push(`**${c.id} — ${c.title}** (${c.status}, raised day ${num(c.day, 0)} by ${c.raisedBy || 'unknown'})`);
  if (c.description) parts.push(c.description);
  const dd = num(i.days, NaN);
  const cc = num(i.cost, NaN);
  parts.push(`- Schedule: ${Number.isFinite(dd) ? `${dd > 0 ? '+' : ''}${Math.round(dd)} days` : 'not analysed'}${Number.isFinite(dd) && dd > 0 ? ` → forecast finish ≈ day ${Math.round(S.forecastFinish + dd)}` : ''}`);
  parts.push(`- Cost: ${Number.isFinite(cc) ? money(cc) : 'not analysed'}${Number.isFinite(cc) && Number.isFinite(S.contingencyRemaining) ? ` (${pct(cc / Math.max(1, S.contingencyRemaining))} of remaining contingency)` : ''}`);
  if (i.scope !== undefined) parts.push(`- Scope: ${typeof i.scope === 'number' ? (i.scope > 0 ? '+' : '') + pct(i.scope) : i.scope}`);
  if (i.quality !== undefined) parts.push(`- Quality: ${typeof i.quality === 'number' ? (i.quality >= 0 ? '+' : '') + pct(i.quality) : i.quality}`);
  if (i.risk !== undefined) parts.push(`- Risk: ${typeof i.risk === 'object' ? JSON.stringify(i.risk) : i.risk}`);
  const votes = Object.entries(c.votes || {});
  if (votes.length) parts.push(`CCB votes: ${votes.map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  const verdict = Number.isFinite(cc) && Number.isFinite(S.contingencyRemaining) && cc > S.contingencyRemaining
    ? 'It costs more than the remaining contingency — it needs management reserve and sponsor approval.'
    : Number.isFinite(dd) && dd > 0 && criticalPath(p).length ? 'Check whether it touches the critical path; if it does, the delay flows straight to handover.' : 'Decide it at the next CCB and update the baselines if approved.';
  parts.push(verdict);
  return parts.join('\n');
}

/** Draft a stakeholder message grounded in live (simulated) data. */
export function stakeholderMessage(p, idOrText) {
  const s = arr(p && p.stakeholders).find((x) => x.id === idOrText) || findStakeholder(p, idOrText);
  const S = readState(p);
  const ms = nextMilestone(p, S);
  const active = arr(p && p.tasks).filter((t) => { const st = taskState(p, t.id); return num(st.pct, 0) > 0 && num(st.pct, 0) < 1; }).slice(0, 3);
  if (!s) return { to: '', subject: '', body: 'I could not find that stakeholder in the register. Try "draft a message to residents", "…to the airlines" or a stakeholder ID such as S07.' };
  const role = s.role || s.name || s.id;
  const community = /communit|resident|settler|occupant/i.test(`${s.group} ${role}`);
  const subject = community ? 'Airport works: what is happening near you this month' : `HDD programme update — day ${S.day}`;
  const L = [];
  L.push(community ? 'Dear neighbours,' : `Dear ${role.split(/[—(]/)[0].trim()},`);
  L.push('');
  L.push(`Here is a short update on the airport revival works as of ${S.dateLabel}. The programme is ${pct(S.progress)} complete${ms ? `, and the next milestone is ${ms.name}` : ''}.`);
  if (active.length) L.push(`Work currently under way: ${active.map((t) => t.name.toLowerCase()).join('; ')}.`);
  if (community) {
    L.push('');
    L.push('What we are doing to limit the impact on you:');
    L.push('- Haul trucks use the designated site route, with speed limits and water spraying to keep dust down.');
    L.push('- Noisy work is scheduled in daytime hours wherever possible, and you will get notice before any night work.');
    if (S.weather.kind !== 'clear') L.push(`- Current conditions (${S.weather.label.toLowerCase()}) mean extra dust and drainage checks around the boundary.`);
    L.push('');
    L.push(`If you have a concern, please use ${s.channel || 'the community helpline and grievance desk'}; every grievance is logged and answered.`);
  } else {
    L.push(`Performance: SPI ${idx(S.spi)}, CPI ${idx(S.cpi)}; forecast handover day ${Math.round(S.forecastFinish)} against a baseline of day ${Math.round(S.baselineDuration)}.`);
    if (s.needs) L.push(`On your priorities (${s.needs.replace(/\.$/, '').toLowerCase()}): we will cover these in detail at the next ${String(s.channel || 'review meeting').toLowerCase()}.`);
  }
  L.push('');
  L.push(`We will keep you updated ${s.frequency ? s.frequency.toLowerCase() : 'regularly'}.`);
  L.push('');
  L.push('Project Director, HDD Revival & Expansion Programme');
  L.push('_(Draft prepared by MEHRAN from simulated scenario data — review before sending.)_');
  return { to: role, subject, body: L.join('\n'), stakeholderId: s.id };
}

/** Explain a quiz answer (tutoring hook). `lookupFn` resolves a concept. */
export function tutorText({ question, chosen, correct, explanation, options } = {}, conceptFn) {
  const qText = typeof question === 'object' && question ? question.text || question.q || question.question || '' : String(question || '');
  const opts = options || (typeof question === 'object' && question ? question.options || question.choices : null) || [];
  const letter = (i) => (Number.isInteger(i) ? String.fromCharCode(65 + i) : null);
  const label = (v) => {
    if (Number.isInteger(v) && opts[v] !== undefined) return `${letter(v)}) ${opts[v]}`;
    if (typeof v === 'string' && /^[A-Fa-f]$/.test(v) && opts.length) { const i = v.toUpperCase().charCodeAt(0) - 65; return `${v.toUpperCase()}) ${opts[i] !== undefined ? opts[i] : ''}`.trim(); }
    return v === undefined || v === null ? '' : String(v);
  };
  const exp = explanation || (typeof question === 'object' && question ? question.explanation : '') || '';
  const concept = conceptFn ? conceptFn(`${qText} ${label(correct)}`) : null;
  const L = [];
  if (chosen !== undefined && chosen !== null && String(label(chosen)) === String(label(correct))) {
    L.push(`**${label(chosen)}** is correct.`);
  } else {
    L.push(`You chose **${label(chosen) || 'that option'}**, but the answer is **${label(correct) || 'the keyed option'}**.`);
  }
  if (exp) L.push(`Why: ${exp}`);
  if (concept) {
    L.push(`Key concept — ${concept.term}${concept.abbr ? ` (${concept.abbr})` : ''}: ${concept.definition}`);
    if (concept.formula) L.push(`Formula: \`${concept.formula}\``);
  }
  L.push('Tip: re-read the stem for the qualifier (first, best, most likely, except) — distractors are usually true statements that answer a different question.');
  return L.join('\n\n');
}
