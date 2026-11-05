/**
 * Critical Path Method over a precedence diagram (PDM) — pure JS, no DOM.
 *
 * Supports all four dependency types (FS, SS, FF, SF) with leads (negative
 * lag) and lags, forward and backward passes, total and free float, and the
 * critical path. A compiled, array-based core (`compileNetwork` + `cpmArrays`)
 * is shared by the Map-based public API, the crash optimiser and the Monte
 * Carlo engine, so every consumer schedules the network identically.
 *
 * Live (statused) networks are supported: a task may carry `fixedStart` and
 * `fixedFinish` (complete — both dates are actuals, relative to "now" = 0) or
 * only `fixedStart` (in progress — the remaining `duration` runs from now).
 */

export const LINK_CODES = { FF: 0, FS: 1, SF: 2, SS: 3 };
const CODE_NAMES = ['FF', 'FS', 'SF', 'SS'];

/** PERT expected duration tₑ = (O + 4M + P) / 6. */
export function pertDuration(o, m, p) {
  return (o + 4 * m + p) / 6;
}

/** PERT standard deviation σ = (P − O) / 6. */
export function pertSigma(o, p) {
  return (p - o) / 6;
}

/** Standard normal CDF Φ(z) (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse standard normal Φ⁻¹(p) (Acklam's rational approximation, |rel error| < 1.2e-9). */
export function inverseNormal(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Crash cost slope = (crash cost − normal cost) / (normal time − crash time). */
export function costSlope(task) {
  const normalCost = task.normalCost !== undefined ? task.normalCost : task.budget;
  const dt = task.duration - task.crashDuration;
  if (!(dt > 0)) return Infinity;
  return (task.crashCost - normalCost) / dt;
}

/**
 * Compile a task list into index arrays (topological order, typed links).
 * Throws on an unknown predecessor-free cycle so a bad network fails loudly.
 */
export function compileNetwork(tasks) {
  const n = tasks.length;
  const index = new Map();
  tasks.forEach((t, i) => index.set(t.id, i));
  const preds = [];
  const succs = [];
  for (let i = 0; i < n; i++) { preds.push([]); succs.push([]); }
  const indeg = new Int32Array(n);
  tasks.forEach((t, i) => {
    for (const link of t.predecessors || []) {
      const j = index.get(link.id);
      if (j === undefined) continue;
      const type = LINK_CODES[link.type || 'FS'];
      if (type === undefined) throw new Error(`CPM: unknown link type ${link.type} on ${t.id}`);
      const lag = link.lag || 0;
      preds[i].push({ j, type, lag });
      succs[j].push({ j: i, type, lag });
      indeg[i]++;
    }
  });
  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  const order = [];
  while (queue.length) {
    const i = queue.shift();
    order.push(i);
    for (const s of succs[i]) if (--indeg[s.j] === 0) queue.push(s.j);
  }
  if (order.length !== n) {
    const stuck = tasks.filter((t, i) => indeg[i] > 0).map((t) => t.id);
    throw new Error(`CPM: dependency cycle involving ${stuck.join(', ')}`);
  }
  return { n, ids: tasks.map((t) => t.id), index, preds, succs, order };
}

/**
 * Forward and backward passes over a compiled network.
 * @param {object} net   from compileNetwork
 * @param {ArrayLike<number>} dur  remaining/planned duration per node
 * @param {object} [fix] { fixedStart:Float64Array(NaN=free), fixedFinish:Float64Array(NaN=free), minStart }
 */
export function cpmArrays(net, dur, fix = null, opts = {}) {
  const { n, preds, succs, order } = net;
  const es = new Float64Array(n);
  const ef = new Float64Array(n);
  const ls = new Float64Array(n);
  const lf = new Float64Array(n);
  const tf = new Float64Array(n);
  const ff = new Float64Array(n);
  const span = new Float64Array(n);
  const fs = fix && fix.fixedStart;
  const ff2 = fix && fix.fixedFinish;
  const minStart = fix && fix.minStart;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const d = dur[i];
    if (fs && !Number.isNaN(fs[i]) && ff2 && !Number.isNaN(ff2[i])) {
      es[i] = fs[i]; ef[i] = ff2[i]; span[i] = ef[i] - es[i];
      continue;
    }
    if (fs && !Number.isNaN(fs[i])) {
      // In progress: started at fixedStart, the remaining work runs from now (0).
      let fin = Math.max(0, fs[i]) + d;
      for (const l of preds[i]) {
        if (l.type === 0) fin = Math.max(fin, ef[l.j] + l.lag);
        else if (l.type === 2) fin = Math.max(fin, es[l.j] + l.lag);
      }
      es[i] = fs[i]; ef[i] = fin; span[i] = fin - fs[i];
      continue;
    }
    let s = minStart ? (minStart[i] || 0) : 0;
    for (const l of preds[i]) {
      const p = l.j;
      let c;
      if (l.type === 1) c = ef[p] + l.lag;            // FS
      else if (l.type === 3) c = es[p] + l.lag;       // SS
      else if (l.type === 0) c = ef[p] + l.lag - d;   // FF
      else c = es[p] + l.lag - d;                     // SF
      if (c > s) s = c;
    }
    if (s < (minStart ? (minStart[i] || 0) : 0)) s = minStart ? (minStart[i] || 0) : 0;
    es[i] = s; ef[i] = s + d; span[i] = d;
  }
  let finish = 0;
  for (let i = 0; i < n; i++) if (ef[i] > finish) finish = ef[i];
  if (opts.projectFinish !== undefined && opts.projectFinish > finish) finish = opts.projectFinish;
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k];
    let f = finish;
    if (succs[i].length) {
      f = Infinity;
      for (const l of succs[i]) {
        const s = l.j;
        let c;
        if (l.type === 1) c = ls[s] - l.lag;
        else if (l.type === 3) c = ls[s] - l.lag + span[i];
        else if (l.type === 0) c = lf[s] - l.lag;
        else c = lf[s] - l.lag + span[i];
        if (c < f) f = c;
      }
      if (f > finish) f = finish;
    }
    lf[i] = f; ls[i] = f - span[i]; tf[i] = f - ef[i];
  }
  for (let i = 0; i < n; i++) {
    if (!succs[i].length) { ff[i] = Math.max(0, finish - ef[i]); continue; }
    let m = Infinity;
    for (const l of succs[i]) {
      const s = l.j;
      let slack;
      if (l.type === 1) slack = es[s] - l.lag - ef[i];
      else if (l.type === 3) slack = es[s] - l.lag - es[i];
      else if (l.type === 0) slack = ef[s] - l.lag - ef[i];
      else slack = ef[s] - l.lag - es[i];
      if (slack < m) m = slack;
    }
    ff[i] = Math.max(0, Math.min(m, tf[i]));
  }
  return { es, ef, ls, lf, tf, ff, span, duration: finish };
}

/**
 * Run CPM over task objects.
 * @param {Array} tasks [{ id, duration, predecessors:[{id,type,lag}], fixedStart?, fixedFinish?, minStart? }]
 * @returns {{ nodes:Map, duration:number, criticalPath:string[], drivingPath:string[], order:string[] }}
 */
export function computeCPM(tasks, opts = {}) {
  const tol = opts.floatTolerance === undefined ? 0.5 : opts.floatTolerance;
  const net = opts.net || compileNetwork(tasks);
  const n = net.n;
  const dur = new Float64Array(n);
  const fixedStart = new Float64Array(n).fill(NaN);
  const fixedFinish = new Float64Array(n).fill(NaN);
  const minStart = new Float64Array(n);
  let anyFix = false;
  tasks.forEach((t, i) => {
    dur[i] = t.duration;
    if (t.fixedStart !== undefined && t.fixedStart !== null) { fixedStart[i] = t.fixedStart; anyFix = true; }
    if (t.fixedFinish !== undefined && t.fixedFinish !== null) { fixedFinish[i] = t.fixedFinish; anyFix = true; }
    if (t.minStart) { minStart[i] = t.minStart; anyFix = true; }
  });
  const r = cpmArrays(net, dur, anyFix ? { fixedStart, fixedFinish, minStart } : null, opts);
  const nodes = new Map();
  const critical = [];
  for (let i = 0; i < n; i++) {
    const done = !Number.isNaN(fixedFinish[i]);
    const node = {
      id: net.ids[i], duration: dur[i], es: r.es[i], ef: r.ef[i], ls: r.ls[i], lf: r.lf[i],
      totalFloat: r.tf[i], freeFloat: r.ff[i], critical: !done && r.tf[i] <= tol, done,
      predecessors: tasks[i].predecessors || [],
      successors: net.succs[i].map((l) => ({ id: net.ids[l.j], type: CODE_NAMES[l.type], lag: l.lag })),
    };
    nodes.set(node.id, node);
    if (node.critical) critical.push(node);
  }
  critical.sort((a, b) => a.es - b.es || a.ef - b.ef);
  return {
    nodes, duration: r.duration, order: net.order.map((i) => net.ids[i]),
    criticalPath: critical.map((c) => c.id), drivingPath: drivingChain(net, r, dur, tol), net,
  };
}

/** Trace the single driving chain back from the latest-finishing node. */
function drivingChain(net, r, dur, tol) {
  let end = -1;
  for (let i = 0; i < net.n; i++) if (end < 0 || r.ef[i] > r.ef[end] + 1e-9) end = i;
  const chain = [];
  const seen = new Set();
  let cur = end;
  while (cur >= 0 && !seen.has(cur)) {
    seen.add(cur);
    chain.push(net.ids[cur]);
    let next = -1;
    for (const l of net.preds[cur]) {
      const p = l.j;
      let c;
      if (l.type === 1) c = r.ef[p] + l.lag;
      else if (l.type === 3) c = r.es[p] + l.lag;
      else if (l.type === 0) c = r.ef[p] + l.lag - dur[cur];
      else c = r.es[p] + l.lag - dur[cur];
      if (Math.abs(c - r.es[cur]) <= 1e-6 && r.tf[p] <= tol) { next = p; break; }
    }
    cur = next;
  }
  return chain.reverse();
}

/**
 * PERT analysis: variance accumulated along the critical path and the
 * probability of finishing by `targetDuration` (normal approximation, CLT).
 */
export function pertAnalysis(cpm, tasks, targetDuration) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let variance = 0;
  const path = cpm.drivingPath && cpm.drivingPath.length ? cpm.drivingPath : cpm.criticalPath;
  for (const id of path) {
    const t = byId.get(id);
    if (!t || t.o === undefined) continue;
    const s = pertSigma(t.o, t.p) * (t.scale === undefined ? 1 : t.scale);
    variance += s * s;
  }
  const sigma = Math.sqrt(variance);
  const mean = cpm.duration;
  const probabilityBy = (day) => (sigma > 0 ? normalCdf((day - mean) / sigma) : day >= mean ? 1 : 0);
  const z = sigma > 0 ? (targetDuration - mean) / sigma : 0;
  return {
    expected: mean, mean, variance, sigma, pathSigma: sigma, z,
    probability: probabilityBy(targetDuration),
    probabilityBy,
    atConfidence: (pct) => mean + inverseNormal(pct) * sigma,
  };
}

/**
 * Schedule compression by crashing.
 *
 * Iterative textbook algorithm: shorten the project one day at a time by
 * crashing the cheapest-slope activity on the CURRENT critical path,
 * re-running CPM after every step so a change of critical path (or parallel
 * critical paths that must be crashed together) is always respected.
 *
 * @param {object|null} cpm   initial CPM result (recomputed if null)
 * @param {Array} tasks       [{ id, name, duration, crashDuration, crashCost, budget, predecessors, fixed* }]
 * @param {number} days       days to recover
 */
export function crashCandidates(cpm, tasks, days) {
  const net = (cpm && cpm.net) || compileNetwork(tasks);
  const n = net.n;
  const dur = new Float64Array(n);
  const minDur = new Float64Array(n);
  const slope = new Float64Array(n);
  const fixedStart = new Float64Array(n).fill(NaN);
  const fixedFinish = new Float64Array(n).fill(NaN);
  tasks.forEach((t, i) => {
    dur[i] = t.duration;
    const crashMin = t.crashDuration === undefined ? t.duration : t.crashDuration;
    minDur[i] = t.crashable === false ? t.duration : Math.min(t.duration, crashMin);
    slope[i] = costSlope(t);
    if (t.fixedStart !== undefined && t.fixedStart !== null) fixedStart[i] = t.fixedStart;
    if (t.fixedFinish !== undefined && t.fixedFinish !== null) fixedFinish[i] = t.fixedFinish;
  });
  const fix = { fixedStart, fixedFinish };
  const done = (i) => !Number.isNaN(fixedFinish[i]);
  let r = cpmArrays(net, dur, fix);
  const initial = r.duration;
  let current = initial;
  const crashed = new Float64Array(n);
  const steps = [];
  const target = initial - Math.max(0, days);
  let guard = 0;
  while (current > target + 1e-9 && guard++ < 2000) {
    const cands = [];
    for (let i = 0; i < n; i++) {
      if (done(i) || r.tf[i] > 0.5) continue;
      if (dur[i] - minDur[i] < 1 - 1e-9 || !Number.isFinite(slope[i])) continue;
      cands.push(i);
    }
    if (!cands.length) break;
    cands.sort((a, b) => slope[a] - slope[b] || a - b);
    let chosen = null;
    for (const i of cands) {
      dur[i] -= 1;
      const d = cpmArrays(net, dur, fix).duration;
      dur[i] += 1;
      if (d < current - 1e-9) { chosen = [i]; break; }
    }
    if (!chosen) {
      // Parallel critical paths: crash the cheapest activity on each until the finish moves.
      const set = [];
      for (const i of cands) {
        dur[i] -= 1; set.push(i);
        if (cpmArrays(net, dur, fix).duration < current - 1e-9) { chosen = set; break; }
      }
      for (const i of set) dur[i] += 1;
    }
    if (!chosen) break;
    for (const i of chosen) { dur[i] -= 1; crashed[i] += 1; }
    r = cpmArrays(net, dur, fix);
    steps.push({ ids: chosen.map((i) => net.ids[i]), duration: r.duration, cost: chosen.reduce((s, i) => s + slope[i], 0) });
    current = r.duration;
  }
  const plan = [];
  let addedCost = 0;
  for (let i = 0; i < n; i++) {
    if (crashed[i] <= 0) continue;
    const cost = crashed[i] * slope[i];
    addedCost += cost;
    plan.push({ id: net.ids[i], name: tasks[i].name, days: crashed[i], crashDays: crashed[i], cost, addedCost: cost, slope: slope[i], costSlope: slope[i] });
  }
  plan.sort((a, b) => a.slope - b.slope);
  const recovered = initial - current;
  return { plan, recovered, addedCost, shortfall: Math.max(0, days - recovered), initialDuration: initial, finalDuration: current, steps };
}
