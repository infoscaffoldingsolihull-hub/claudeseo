/**
 * Statistical quality control — pure JS. Shewhart X̄/R and I-MR control
 * limits with the standard factors, Western Electric rules 1–4, process
 * capability and Pareto analysis.
 */

/** Control-chart factors by subgroup size n (index = n). */
export const SPC_CONSTANTS = {
  A2: [0, 0, 1.880, 1.023, 0.729, 0.577, 0.483, 0.419, 0.373, 0.337, 0.308],
  D3: [0, 0, 0, 0, 0, 0, 0, 0.076, 0.136, 0.184, 0.223],
  D4: [0, 0, 3.267, 2.574, 2.282, 2.114, 2.004, 1.924, 1.864, 1.816, 1.777],
  d2: [0, 0, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078],
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** X̄–R chart: UCL/LCL = X̿ ± A2·R̄, R chart D3·R̄ … D4·R̄. */
export function xbarR(subgroups) {
  const groups = subgroups.filter((g) => g.length >= 2);
  if (!groups.length) return null;
  const n = groups[0].length;
  if (n > 10) throw new Error('xbarR: subgroup size must be 2…10');
  const means = groups.map(mean);
  const ranges = groups.map((g) => Math.max(...g) - Math.min(...g));
  const xbarbar = mean(means);
  const rbar = mean(ranges);
  const { A2, D3, D4, d2 } = SPC_CONSTANTS;
  return {
    n, xbarbar, rbar, A2: A2[n], D3: D3[n], D4: D4[n], d2: d2[n],
    ucl: xbarbar + A2[n] * rbar, lcl: xbarbar - A2[n] * rbar, cl: xbarbar,
    rUcl: D4[n] * rbar, rLcl: D3[n] * rbar,
    sigma: rbar / d2[n], means, ranges,
  };
}

/** Individuals & moving-range chart: limits X̄ ± 3·MR̄/d2 (d2 = 1.128), MR UCL = 3.267·MR̄. */
export function imr(values) {
  if (values.length < 2) return null;
  const mr = [];
  for (let i = 1; i < values.length; i++) mr.push(Math.abs(values[i] - values[i - 1]));
  const xbar = mean(values);
  const mrBar = mean(mr);
  const sigma = mrBar / 1.128;
  return { mean: xbar, cl: xbar, mrBar, sigma, ucl: xbar + 3 * sigma, lcl: xbar - 3 * sigma, mrUcl: 3.267 * mrBar, mrLcl: 0, movingRanges: mr };
}

/**
 * Western Electric rules on a sequence:
 *  1 — one point beyond 3σ;  2 — 2 of 3 consecutive beyond 2σ on the same side;
 *  3 — 4 of 5 consecutive beyond 1σ on the same side;  4 — 8 consecutive on the same side of the centre line.
 * Returns [{ index, rule, side }] (index = the point that completes the pattern).
 */
export function westernElectric(values, cl, sigma) {
  const out = [];
  if (!(sigma > 0)) return out;
  const z = values.map((v) => (v - cl) / sigma);
  for (let i = 0; i < z.length; i++) {
    if (Math.abs(z[i]) > 3) out.push({ index: i, rule: 1, side: Math.sign(z[i]) });
    for (const side of [1, -1]) {
      if (i >= 2) {
        let c = 0;
        for (let k = i - 2; k <= i; k++) if (z[k] * side > 2) c++;
        if (c >= 2 && z[i] * side > 2) out.push({ index: i, rule: 2, side });
      }
      if (i >= 4) {
        let c = 0;
        for (let k = i - 4; k <= i; k++) if (z[k] * side > 1) c++;
        if (c >= 4 && z[i] * side > 1) out.push({ index: i, rule: 3, side });
      }
      if (i >= 7) {
        let ok = true;
        for (let k = i - 7; k <= i; k++) if (!(z[k] * side > 0)) { ok = false; break; }
        if (ok) out.push({ index: i, rule: 4, side });
      }
    }
  }
  return out;
}

/** Process capability Cp = (USL − LSL)/6σ, Cpk = min(USL − μ, μ − LSL)/3σ. */
export function capability({ mean: mu, sigma, lsl, usl }) {
  const cp = usl !== undefined && lsl !== undefined ? (usl - lsl) / (6 * sigma) : NaN;
  const upper = usl !== undefined ? (usl - mu) / (3 * sigma) : Infinity;
  const lower = lsl !== undefined ? (mu - lsl) / (3 * sigma) : Infinity;
  return { cp, cpk: Math.min(upper, lower) };
}

/** Pareto analysis: sort descending, cumulative %, and the "vital few" (≤ 80 %). */
export function pareto(counts) {
  const entries = Array.isArray(counts) ? counts.map((c) => [c.category, c.count]) : Object.entries(counts);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  let cum = 0;
  const rows = entries
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([category, count]) => {
      const before = cum;
      cum += count;
      return { category, count, pct: total ? (count / total) * 100 : 0, cumulativePct: total ? (cum / total) * 100 : 0, vital: total ? (before / total) * 100 < 80 : false };
    });
  return rows;
}
