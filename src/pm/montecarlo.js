import { compileNetwork } from './cpm.js';

/**
 * Monte Carlo schedule & cost risk analysis.
 *
 * Each iteration samples every remaining activity duration (PERT-beta fitted
 * to the three-point estimate, or triangular), draws each open risk as a
 * Bernoulli trial against its current probability, re-schedules the whole
 * network (all four link types, lags, actuals) and prices the outcome. Output:
 * P10/P50/P80/P90 finish and cost, histograms, S-curves, the probability of
 * meeting the baseline, and a tornado of the activities that drive the finish.
 *
 * The kernel (`monteCarloKernel`) is self-contained — it references nothing
 * outside its own body — so the very same code runs synchronously in Node and
 * inside a Blob Web Worker in the browser (`createMonteCarloWorker`).
 */

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gamma(rng, shape) {
  if (shape < 1) return gamma(rng, shape + 1) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** PERT-beta draw on [o, p] with mode m (λ = 4, mean = (o + 4m + p)/6). */
export function samplePert(rng, o, m, p, lambda = 4) {
  const range = p - o;
  if (range <= 0) return m;
  const a = 1 + (lambda * (m - o)) / range;
  const b = 1 + (lambda * (p - m)) / range;
  const x = gamma(rng, a);
  const y = gamma(rng, b);
  return o + (x / (x + y)) * range;
}

/** Triangular draw on [o, p] with mode m (inverse CDF). */
export function sampleTriangular(rng, o, m, p) {
  if (p <= o) return m;
  const u = rng();
  const f = (m - o) / (p - o);
  return u < f ? o + Math.sqrt(u * (p - o) * (m - o)) : p - Math.sqrt((1 - u) * (p - o) * (p - m));
}

/**
 * Self-contained Monte Carlo kernel. `spec` is plain data (see buildMonteCarloSpec).
 * Returns a batch runner { step(batch) → done, progress, finish() → result }.
 */
export function monteCarloKernel(spec) {
  const N = spec.n;
  const iterations = spec.iterations;
  let seed = spec.seed >>> 0;
  const rng = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nrm = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const gam = (shape) => {
    if (shape < 1) return gam(shape + 1) * Math.pow(rng(), 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x;
      let v;
      do { x = nrm(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const draw = (o, m, p) => {
    const range = p - o;
    if (range <= 0) return m;
    if (spec.distribution === 'triangular') {
      const u = rng();
      const f = (m - o) / range;
      return u < f ? o + Math.sqrt(u * range * (m - o)) : p - Math.sqrt((1 - u) * range * (p - m));
    }
    const a = 1 + (4 * (m - o)) / range;
    const b = 1 + (4 * (p - m)) / range;
    const x = gam(a);
    const y = gam(b);
    return o + (x / (x + y)) * range;
  };

  const finishes = new Float64Array(iterations);
  const costs = new Float64Array(iterations);
  const samples = [];
  for (let i = 0; i < N; i++) samples.push(spec.done[i] ? null : new Float32Array(iterations));
  const dur = new Float64Array(N);
  const es = new Float64Array(N);
  const ef = new Float64Array(N);
  const bump = new Float64Array(N);
  let completed = 0;

  function schedule() {
    let finish = 0;
    for (let k = 0; k < N; k++) {
      const i = spec.order[k];
      const d = dur[i];
      const pl = spec.preds[i];
      if (spec.done[i]) {
        es[i] = spec.fixedStart[i]; ef[i] = spec.fixedFinish[i];
      } else if (spec.started[i]) {
        let fin = Math.max(0, spec.fixedStart[i]) + d;
        for (let q = 0; q < pl.length; q += 3) {
          const j = pl[q]; const type = pl[q + 1]; const lag = pl[q + 2];
          if (type === 0) fin = Math.max(fin, ef[j] + lag);
          else if (type === 2) fin = Math.max(fin, es[j] + lag);
        }
        es[i] = spec.fixedStart[i]; ef[i] = fin;
      } else {
        let s = spec.minStart[i];
        for (let q = 0; q < pl.length; q += 3) {
          const j = pl[q]; const type = pl[q + 1]; const lag = pl[q + 2];
          let c;
          if (type === 1) c = ef[j] + lag;
          else if (type === 3) c = es[j] + lag;
          else if (type === 0) c = ef[j] + lag - d;
          else c = es[j] + lag - d;
          if (c > s) s = c;
        }
        es[i] = s; ef[i] = s + d;
      }
      if (ef[i] > finish) finish = ef[i];
    }
    return finish;
  }

  function runOne(it) {
    bump.fill(0);
    let riskCost = 0;
    for (const r of spec.risks) {
      if (rng() >= r.p) continue;
      riskCost += r.cost * (0.6 + rng() * 0.8);
      if (r.days && r.affects.length) {
        const target = r.affects[Math.floor(rng() * r.affects.length)];
        bump[target] += r.days * (0.5 + rng() * 0.8);
      }
    }
    let cost = spec.ac + riskCost;
    for (let i = 0; i < N; i++) {
      if (spec.done[i]) { dur[i] = 0; continue; }
      const f = spec.remFrac[i];
      let d = spec.milestone[i] ? 0 : draw(spec.o[i] * f, spec.m[i] * f, spec.p[i] * f);
      d = Math.max(0, d + bump[i]);
      dur[i] = d;
      samples[i][it] = d;
      const plan = spec.planRem[i];
      const labourFactor = plan > 0 ? d / plan : 1;
      const mat = spec.matRem[i] * (0.97 + rng() * 0.1);
      cost += spec.labRem[i] * labourFactor + mat;
    }
    finishes[it] = spec.day + schedule();
    costs[it] = cost;
  }

  const pct = (sorted, q) => {
    const idx = (sorted.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const hist = (arr, bins) => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const v of arr) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
    return { bins, min, max, width, counts };
  };
  const scurve = (sorted, points) => {
    const out = [];
    for (let k = 0; k <= points; k++) {
      const q = k / points;
      out.push({ value: pct(sorted, q), p: q });
    }
    return out;
  };
  const summary = (arr) => {
    const sorted = Array.from(arr).sort((a, b) => a - b);
    let mean = 0;
    for (const v of sorted) mean += v;
    mean /= sorted.length;
    let v2 = 0;
    for (const v of sorted) v2 += (v - mean) * (v - mean);
    return {
      sorted,
      stats: {
        min: sorted[0], max: sorted[sorted.length - 1], mean, sd: Math.sqrt(v2 / Math.max(1, sorted.length - 1)),
        p10: pct(sorted, 0.1), p50: pct(sorted, 0.5), p80: pct(sorted, 0.8), p90: pct(sorted, 0.9),
        histogram: hist(sorted, 36), sCurve: scurve(sorted, 40),
      },
    };
  };
  const pearson = (xs, ys) => {
    const n = xs.length;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };

  return {
    iterations,
    get completed() { return completed; },
    get progress() { return completed / iterations; },
    get done() { return completed >= iterations; },
    step(batch = 500) {
      const end = Math.min(iterations, completed + batch);
      while (completed < end) { runOne(completed); completed++; }
      return completed >= iterations;
    },
    finish() {
      const f = summary(finishes);
      const c = summary(costs);
      const tornado = [];
      for (let i = 0; i < N; i++) {
        if (!samples[i] || spec.milestone[i]) continue;
        const r = pearson(samples[i], finishes);
        if (Math.abs(r) > 0.02) tornado.push({ id: spec.ids[i], code: spec.codes[i], name: spec.names[i], correlation: r });
      }
      tornado.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
      let onTime = 0;
      let onBudget = 0;
      for (let i = 0; i < iterations; i++) {
        if (finishes[i] <= spec.baselineDuration) onTime++;
        if (costs[i] <= spec.bac) onBudget++;
      }
      return {
        iterations, distribution: spec.distribution, seed: spec.seed, day: spec.day,
        finish: f.stats, cost: c.stats,
        probabilityOnTime: onTime / iterations, probabilityOnBudget: onBudget / iterations,
        histogram: f.stats.histogram,
        tornado: tornado.slice(0, 15),
        baseline: spec.baselineDuration, baselineDuration: spec.baselineDuration, bac: spec.bac,
        deterministicFinish: spec.deterministicFinish,
      };
    },
  };
}

/** Flatten the live project into plain data the kernel (or a Worker) can run. */
export function buildMonteCarloSpec(project, opts = {}) {
  const tasks = project.tasks;
  const net = compileNetwork(tasks);
  const n = net.n;
  const preds = [];
  const o = []; const m = []; const p = [];
  const done = []; const started = []; const fixedStart = []; const fixedFinish = []; const minStart = [];
  const remFrac = []; const planRem = []; const labRem = []; const matRem = []; const milestone = [];
  const now = project.day;
  for (let i = 0; i < n; i++) {
    const t = tasks[i];
    const st = project.state.get(t.id);
    const list = [];
    for (const l of net.preds[i]) list.push(l.j, l.type, l.lag);
    preds.push(list);
    const isDone = st.pct >= 1;
    done.push(isDone);
    const isStarted = !isDone && st.actualStart !== null;
    started.push(isStarted);
    fixedStart.push(st.actualStart !== null ? st.actualStart - now : 0);
    fixedFinish.push(isDone ? st.actualFinish - now : 0);
    minStart.push(st.notBefore ? Math.max(0, st.notBefore - now) : 0);
    const remaining = isDone ? 0 : (st.remainingWork !== undefined ? st.remainingWork : t.duration);
    const frac = t.duration > 0 ? remaining / t.duration : 0;
    remFrac.push(frac);
    o.push(t.o); m.push(t.m); p.push(t.p);
    planRem.push(remaining);
    milestone.push(!!t.milestone);
    labRem.push(isDone ? 0 : remaining * (t.dailyLabour || 0));
    matRem.push(isDone ? 0 : (1 - st.pct) * (t.materialBudget || 0) * (project.priceFactor ? project.priceFactor(t) : 1));
  }
  const risks = [];
  if (opts.includeRisks !== false) {
    for (const r of project.risks) {
      if (r.status === 'Closed' || r.status === 'Escalated' || r.status === 'Expired') continue;
      const affects = (r.taskIds || []).map((id) => net.index.get(id)).filter((j) => j !== undefined && !done[j]);
      if (!affects.length) continue;
      const frac = project.riskRemainingExposure ? project.riskRemainingExposure(r) : 1;
      const prob = Math.min(0.97, r.probability * frac * (r.recurring ? Math.max(1, frac * 1.5) : 1));
      const sign = r.kind === 'opportunity' ? -1 : 1;
      risks.push({ p: prob, cost: sign * r.costImpact * (r.impactFactor || 1) * (r.costShare === undefined ? 1 : r.costShare), days: sign * (r.daysImpact || 0), affects });
    }
  }
  return {
    n, ids: net.ids, codes: tasks.map((t) => t.code), names: tasks.map((t) => t.name), order: Array.from(net.order),
    preds, o, m, p, done, started, fixedStart, fixedFinish, minStart, remFrac, planRem, labRem, matRem, milestone, risks,
    ac: project.ac || 0, bac: project.bac, baselineDuration: project.baselineDuration, day: now,
    deterministicFinish: project.forecastFinish,
    iterations: Math.max(1, Math.round(opts.iterations || 5000)),
    seed: (opts.seed === undefined ? (project.seed ^ 0x5bd1e995) + now : opts.seed) >>> 0,
    distribution: opts.distribution === 'triangular' ? 'triangular' : 'pert',
  };
}

/** Batched run on the calling thread (the UI can step it from requestAnimationFrame). */
export function createMonteCarlo(project, opts = {}) {
  return monteCarloKernel(buildMonteCarloSpec(project, opts));
}

/** Synchronous run (Node, tests, headless). ≥ 5,000 iterations by default. */
export function runMonteCarlo(project, opts = {}) {
  const run = createMonteCarlo(project, { iterations: 5000, ...opts });
  while (!run.step(1000));
  return run.finish();
}

/**
 * Browser path: a Blob Web Worker running the same kernel off the main thread.
 * Returns null where Worker/Blob/URL are unavailable (Node, old browsers).
 * Usage: const w = createMonteCarloWorker(); w.run(project, { iterations, onProgress }).then(result)
 */
export function createMonteCarloWorker() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  const source = `'use strict';\nconst monteCarloKernel = ${monteCarloKernel.toString()};\n` +
    'self.onmessage = (e) => {\n' +
    '  const run = monteCarloKernel(e.data);\n' +
    '  while (!run.step(500)) self.postMessage({ type: "progress", progress: run.progress });\n' +
    '  self.postMessage({ type: "done", result: run.finish() });\n' +
    '};\n';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let worker;
  try {
    worker = new Worker(url);
  } catch (err) {
    URL.revokeObjectURL(url);
    return null;
  }
  let busy = false;
  return {
    get busy() { return busy; },
    run(project, opts = {}) {
      const spec = buildMonteCarloSpec(project, { iterations: 5000, ...opts });
      busy = true;
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'progress') { if (opts.onProgress) opts.onProgress(e.data.progress); return; }
          busy = false;
          resolve(e.data.result);
        };
        worker.onerror = (err) => { busy = false; reject(err); };
        worker.postMessage(spec);
      });
    },
    terminate() {
      worker.terminate();
      URL.revokeObjectURL(url);
    },
  };
}

