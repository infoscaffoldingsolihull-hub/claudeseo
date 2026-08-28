/**
 * Monte Carlo schedule-risk analysis.
 *
 * Each iteration samples every activity duration from a PERT-beta fitted to
 * its three-point estimate, rolls a Bernoulli trial on the residual
 * probability of every risk, samples every quality gate, and re-runs the same
 * CPM engine the baseline uses.  Two thousand iterations over a 61-activity,
 * 87-edge network take a few milliseconds, so the analysis can be re-run
 * interactively rather than precomputed and cached.
 *
 * Outputs:
 *   - the distribution of completion dates (P10 / P50 / P80 / P90)
 *   - a criticality index per activity: how often it landed on the critical
 *     path, which is a far more honest question than "is it critical today"
 *   - a tornado of duration-to-finish correlations, ranking what actually
 *     drives the completion date
 *
 * No three.js, no DOM.
 */
import { PKG_BY_ID, RISKS, QUALITY_GATES } from './model.js';
import { schedule } from './cpm.js';
import { makeRng, pertSample, clamp } from '../engine/rng.js';

/**
 * Run the analysis.
 *
 * @param project    the project built by createProject
 * @param iterations how many trials (clamped to a sane range)
 * @param seed       stream seed; the same seed always gives the same answer
 */
export function runMonteCarlo(project, iterations = 2000, seed = 991) {
  const net = project.net;
  const n = net.n;
  const iters = clamp(Math.round(iterations), 100, 20000);
  const rng = makeRng(seed);

  const dur = new Float64Array(n);
  const scratch = {
    es: new Float64Array(n),
    ef: new Float64Array(n),
    ls: new Float64Array(n),
    lf: new Float64Array(n),
    tf: new Float64Array(n),
    ff: new Float64Array(n),
    critical: new Uint8Array(n),
  };

  const finishes = new Float64Array(iters);
  const criticalCount = new Float64Array(n);

  // Running sums for the Pearson correlation of each duration against finish.
  const sx = new Float64Array(n);
  const sxx = new Float64Array(n);
  const sxy = new Float64Array(n);
  let sy = 0;
  let syy = 0;

  const riskAffectIdx = RISKS.map((risk) =>
    risk.affects.map((id) => net.index.get(id)).filter((i) => i !== undefined));
  const gateIdx = QUALITY_GATES.map((gate) => net.index.get(gate.pkg));

  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < n; i += 1) {
      const pkg = PKG_BY_ID.get(net.ids[i]);
      dur[i] = Math.max(1, pertSample(rng, pkg.o, pkg.m, pkg.p));
    }
    for (let r = 0; r < RISKS.length; r += 1) {
      const risk = RISKS[r];
      const p = risk.response !== 'Accept' ? risk.residualProb : risk.prob;
      if (!rng.chance(p) || risk.days <= 0) continue;
      const idxs = riskAffectIdx[r];
      const share = risk.days / Math.max(1, idxs.length);
      for (const i of idxs) dur[i] += share;
    }
    for (let g = 0; g < QUALITY_GATES.length; g += 1) {
      const gate = QUALITY_GATES[g];
      const i = gateIdx[g];
      if (i === undefined) continue;
      const measured = rng.normal() * (gate.tolerance * 0.55);
      if (Math.abs(measured) > gate.tolerance) dur[i] += gate.reworkDays;
    }

    const res = schedule(net, dur, scratch);
    const finish = res.finish;
    finishes[it] = finish;
    sy += finish;
    syy += finish * finish;
    for (let i = 0; i < n; i += 1) {
      if (res.critical[i]) criticalCount[i] += 1;
      const x = dur[i];
      sx[i] += x;
      sxx[i] += x * x;
      sxy[i] += x * finish;
    }
  }

  const sorted = Float64Array.from(finishes).sort();
  const pct = (p) => {
    const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[idx];
  };

  const mean = sy / iters;
  const varY = Math.max(0, syy / iters - mean * mean);
  const sdY = Math.sqrt(varY);

  const tornado = [];
  for (let i = 0; i < n; i += 1) {
    const mx = sx[i] / iters;
    const varX = Math.max(0, sxx[i] / iters - mx * mx);
    const sdX = Math.sqrt(varX);
    const cov = sxy[i] / iters - mx * mean;
    const r = sdX > 1e-9 && sdY > 1e-9 ? cov / (sdX * sdY) : 0;
    tornado.push({
      id: net.ids[i],
      name: PKG_BY_ID.get(net.ids[i]).name,
      code: PKG_BY_ID.get(net.ids[i]).code,
      ca: PKG_BY_ID.get(net.ids[i]).ca,
      correlation: r,
      criticality: criticalCount[i] / iters,
    });
  }
  tornado.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // Histogram for the distribution chart.
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const bins = 34;
  const width = Math.max(1e-9, (hi - lo) / bins);
  const histogram = new Array(bins).fill(0);
  for (let i = 0; i < iters; i += 1) {
    const b = clamp(Math.floor((finishes[i] - lo) / width), 0, bins - 1);
    histogram[b] += 1;
  }

  const baseline = project.baseFinish;
  let atOrBefore = 0;
  for (let i = 0; i < iters; i += 1) if (finishes[i] <= baseline) atOrBefore += 1;

  return {
    iterations: iters,
    seed,
    min: lo,
    max: hi,
    mean,
    sd: sdY,
    p10: pct(0.10),
    p50: pct(0.50),
    p80: pct(0.80),
    p90: pct(0.90),
    histogram,
    histLo: lo,
    histWidth: width,
    tornado,
    baselineFinish: baseline,
    probabilityOfBaseline: atOrBefore / iters,
    criticality: tornado.slice().sort((a, b) => b.criticality - a.criticality),
  };
}
