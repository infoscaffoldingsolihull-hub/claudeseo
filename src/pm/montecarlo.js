import { computeCPM } from './cpm.js';

/**
 * Monte Carlo schedule and cost risk analysis.
 *
 * Activity durations are drawn from a PERT-beta fitted to the three-point
 * estimate; identified risks are drawn as Bernoulli trials against their
 * current (post-response) probability and, when they occur, add days to the
 * packages they affect and cost to the project.  Each iteration re-runs the
 * full CPM, so correlation through the network is captured properly rather
 * than by summing distributions.
 *
 * Output: a completion-date distribution with P10/P50/P80/P90, a cost
 * distribution, the probability of meeting the baseline, and a tornado
 * sensitivity ranking of which packages actually drive the outcome.
 */

function mcRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal. */
function normal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma sampler (shape ≥ 1 handled directly, <1 by boosting). */
function gamma(rng, shape) {
  if (shape < 1) {
    return gamma(rng, shape + 1) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(α, β) via two gamma variates. */
function beta(rng, alpha, betaParam) {
  const x = gamma(rng, alpha);
  const y = gamma(rng, betaParam);
  return x / (x + y);
}

/** Draw a duration from the PERT-beta fitted to (o, m, p). */
export function samplePert(rng, o, m, p, lambda = 4) {
  const range = p - o;
  if (range <= 0) return m;
  const alpha = 1 + (lambda * (m - o)) / range;
  const bet = 1 + (lambda * (p - m)) / range;
  return o + beta(rng, alpha, bet) * range;
}

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

/**
 * Run the analysis.
 *
 * @param {Project} project
 * @param {object} opts { iterations, seed, includeRisks, onProgress }
 */
export function runMonteCarlo(project, opts = {}) {
  const iterations = opts.iterations || 2000;
  const rng = mcRng(opts.seed || 987654321);
  const includeRisks = opts.includeRisks !== false;

  const specs = project.tasks.map((t) => {
    const st = project.state.get(t.id);
    const done = st.pct >= 1;
    const remainingFraction = done ? 0 : 1 - st.pct;
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      o: t.o * remainingFraction,
      m: t.m * remainingFraction,
      p: t.p * remainingFraction,
      budget: t.budget,
      spent: st.actualCost,
      predecessors: t.predecessors,
      done,
    };
  });

  const finishes = new Float64Array(iterations);
  const costs = new Float64Array(iterations);
  const durationSamples = new Map();
  for (const s of specs) durationSamples.set(s.id, new Float64Array(iterations));

  const riskYears = Math.max(0.5, (project.baselineDuration - project.day) / 365);
  const scratch = specs.map((s) => ({
    id: s.id,
    duration: 0,
    predecessors: s.predecessors,
  }));

  for (let i = 0; i < iterations; i++) {
    let extraCost = 0;
    const bump = new Map();

    if (includeRisks) {
      for (const risk of project.risks) {
        const chance = 1 - Math.pow(1 - Math.min(0.95, risk.currentProbability), riskYears);
        if (rng() < chance) {
          extraCost += risk.costImpact * (0.5 + rng() * 0.8);
          const share = risk.scheduleImpact / Math.max(1, risk.affects.length);
          for (const id of risk.affects) bump.set(id, (bump.get(id) || 0) + share * (0.4 + rng() * 0.9));
        }
      }
    }

    for (let k = 0; k < specs.length; k++) {
      const s = specs[k];
      let d = s.done ? 0 : samplePert(rng, s.o, s.m, s.p);
      d += bump.get(s.id) || 0;
      scratch[k].duration = d;
      durationSamples.get(s.id)[i] = d;
    }

    const result = computeCPM(scratch);
    finishes[i] = project.day + result.duration;

    // Cost: material to go plus labour over the sampled duration, plus risk.
    const remainingBudget = specs.reduce((sum, s) => sum + (s.done ? 0 : s.budget * (s.m > 0 ? 1 : 0)), 0);
    const labour = project.baselineDailyLabour * result.duration * (0.92 + rng() * 0.2);
    costs[i] = project.ac + remainingBudget * 0.45 * (0.94 + rng() * 0.18) + labour + extraCost;

    if (opts.onProgress && (i & 255) === 0) opts.onProgress(i / iterations);
  }

  const sortedFinish = Array.from(finishes).sort((a, b) => a - b);
  const sortedCost = Array.from(costs).sort((a, b) => a - b);

  // ---- tornado: correlation of each package's duration with the finish ----
  const finishArr = Array.from(finishes);
  const tornado = [];
  for (const s of specs) {
    if (s.done) continue;
    const r = pearson(Array.from(durationSamples.get(s.id)), finishArr);
    if (Math.abs(r) > 0.02) tornado.push({ id: s.id, code: s.code, name: s.name, correlation: r });
  }
  tornado.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // ---- histogram ----
  const bins = 34;
  const min = sortedFinish[0];
  const max = sortedFinish[sortedFinish.length - 1];
  const width = (max - min) / bins || 1;
  const histogram = new Array(bins).fill(0);
  for (const f of finishes) histogram[Math.min(bins - 1, Math.floor((f - min) / width))]++;

  const baseline = project.baselineDuration;
  let onTime = 0;
  for (const f of finishes) if (f <= baseline) onTime++;

  return {
    iterations,
    finish: {
      min,
      max,
      p10: percentile(sortedFinish, 0.1),
      p50: percentile(sortedFinish, 0.5),
      p80: percentile(sortedFinish, 0.8),
      p90: percentile(sortedFinish, 0.9),
      mean: sortedFinish.reduce((a, b) => a + b, 0) / iterations,
    },
    cost: {
      p10: percentile(sortedCost, 0.1),
      p50: percentile(sortedCost, 0.5),
      p80: percentile(sortedCost, 0.8),
      p90: percentile(sortedCost, 0.9),
      mean: sortedCost.reduce((a, b) => a + b, 0) / iterations,
    },
    probabilityOnTime: onTime / iterations,
    probabilityOnBudget: sortedCost.filter((c) => c <= project.bac).length / iterations,
    histogram: { bins, min, width, counts: histogram },
    tornado: tornado.slice(0, 12),
    baseline,
    bac: project.bac,
  };
}
