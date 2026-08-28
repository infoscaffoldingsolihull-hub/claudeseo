/**
 * Precedence-diagramming CPM engine.
 *
 * Supports all four PMBOK dependency types with leads and lags:
 *
 *   FS   ES(j) >= EF(i) + lag        SS   ES(j) >= ES(i) + lag
 *   FF   EF(j) >= EF(i) + lag        SF   EF(j) >= ES(i) + lag
 *
 * The network is compiled once into flat index arrays; a forward/backward
 * pass over it is a few thousand arithmetic operations, which is what makes a
 * two-thousand-iteration Monte Carlo run finish in a few milliseconds.
 *
 * No three.js, no DOM — this runs in Node.
 */
import { PACKAGES, PKG_BY_ID } from './model.js';

const REL_FS = 0;
const REL_SS = 1;
const REL_FF = 2;
const REL_SF = 3;
const REL_CODE = { FS: REL_FS, SS: REL_SS, FF: REL_FF, SF: REL_SF };
const REL_NAME = ['FS', 'SS', 'FF', 'SF'];

/** PERT expected duration from a three-point estimate. */
export function pertMean(pkg) {
  return (pkg.o + 4 * pkg.m + pkg.p) / 6;
}

/** PERT standard deviation from a three-point estimate. */
export function pertSigma(pkg) {
  return (pkg.p - pkg.o) / 6;
}

/**
 * Compile the precedence network into flat arrays.  Called once at start-up;
 * every schedule computation reuses the result.
 */
export function buildNetwork() {
  const ids = PACKAGES.map((p) => p.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  /** Edges as parallel arrays: from → to, with a relation type and a lag. */
  const edgeFrom = [];
  const edgeTo = [];
  const edgeRel = [];
  const edgeLag = [];
  for (let j = 0; j < n; j += 1) {
    const pkg = PACKAGES[j];
    for (const dep of pkg.deps) {
      const i = index.get(dep.id);
      if (i === undefined) throw new Error(`${pkg.id}: dependency on unknown package "${dep.id}"`);
      edgeFrom.push(i);
      edgeTo.push(j);
      edgeRel.push(REL_CODE[dep.type]);
      edgeLag.push(dep.lag || 0);
    }
  }

  // Adjacency in both directions, as index lists.
  const inEdges = Array.from({ length: n }, () => []);
  const outEdges = Array.from({ length: n }, () => []);
  for (let e = 0; e < edgeFrom.length; e += 1) {
    outEdges[edgeFrom[e]].push(e);
    inEdges[edgeTo[e]].push(e);
  }

  // Kahn topological sort over the dependency graph.
  const indeg = new Int32Array(n);
  for (let j = 0; j < n; j += 1) indeg[j] = inEdges[j].length;
  const queue = [];
  for (let j = 0; j < n; j += 1) if (indeg[j] === 0) queue.push(j);
  const order = [];
  while (queue.length) {
    const j = queue.shift();
    order.push(j);
    for (const e of outEdges[j]) {
      const k = edgeTo[e];
      indeg[k] -= 1;
      if (indeg[k] === 0) queue.push(k);
    }
  }
  if (order.length !== n) throw new Error('precedence network contains a cycle');

  return {
    n,
    ids,
    index,
    order,
    edgeFrom: Int32Array.from(edgeFrom),
    edgeTo: Int32Array.from(edgeTo),
    edgeRel: Int32Array.from(edgeRel),
    edgeLag: Float64Array.from(edgeLag),
    inEdges,
    outEdges,
  };
}

/**
 * Forward and backward pass.
 *
 * @param net  the compiled network
 * @param dur  Float64Array of durations, indexed like net.ids
 * @param out  optional scratch object, reused across Monte Carlo iterations
 */
export function schedule(net, dur, out) {
  const { n, order, edgeFrom, edgeTo, edgeRel, edgeLag, inEdges, outEdges } = net;
  const r = out && out.es && out.es.length === n
    ? out
    : {
      es: new Float64Array(n),
      ef: new Float64Array(n),
      ls: new Float64Array(n),
      lf: new Float64Array(n),
      tf: new Float64Array(n),
      ff: new Float64Array(n),
      critical: new Uint8Array(n),
    };

  /* ------------------------------------------------------------ forward -- */
  for (let oi = 0; oi < n; oi += 1) {
    const j = order[oi];
    let es = 0;
    for (const e of inEdges[j]) {
      const i = edgeFrom[e];
      const lag = edgeLag[e];
      let cand;
      switch (edgeRel[e]) {
        case REL_SS: cand = r.es[i] + lag; break;
        case REL_FF: cand = r.ef[i] + lag - dur[j]; break;
        case REL_SF: cand = r.es[i] + lag - dur[j]; break;
        default: cand = r.ef[i] + lag; break; // FS
      }
      if (cand > es) es = cand;
    }
    if (es < 0) es = 0;
    r.es[j] = es;
    r.ef[j] = es + dur[j];
  }

  let finish = 0;
  for (let j = 0; j < n; j += 1) if (r.ef[j] > finish) finish = r.ef[j];

  /* ----------------------------------------------------------- backward -- */
  for (let oi = n - 1; oi >= 0; oi -= 1) {
    const i = order[oi];
    let lf = outEdges[i].length ? Infinity : finish;
    for (const e of outEdges[i]) {
      const j = edgeTo[e];
      const lag = edgeLag[e];
      let cand;
      switch (edgeRel[e]) {
        case REL_SS: cand = r.ls[j] - lag + dur[i]; break;
        case REL_FF: cand = r.lf[j] - lag; break;
        case REL_SF: cand = r.lf[j] - lag + dur[i]; break;
        default: cand = r.ls[j] - lag; break; // FS
      }
      if (cand < lf) lf = cand;
    }
    if (!Number.isFinite(lf) || lf > finish) lf = finish;
    r.lf[i] = lf;
    r.ls[i] = lf - dur[i];
  }

  /* -------------------------------------------------------------- float -- */
  for (let i = 0; i < n; i += 1) {
    r.tf[i] = r.ls[i] - r.es[i];
    // Guard against -0 and floating-point dust so "critical" is stable.
    if (Math.abs(r.tf[i]) < 1e-9) r.tf[i] = 0;
    r.critical[i] = r.tf[i] <= 1e-9 ? 1 : 0;

    let free = outEdges[i].length ? Infinity : finish - r.ef[i];
    for (const e of outEdges[i]) {
      const j = edgeTo[e];
      const lag = edgeLag[e];
      let slack;
      switch (edgeRel[e]) {
        case REL_SS: slack = r.es[j] - (r.es[i] + lag); break;
        case REL_FF: slack = r.ef[j] - (r.ef[i] + lag); break;
        case REL_SF: slack = r.ef[j] - (r.es[i] + lag); break;
        default: slack = r.es[j] - (r.ef[i] + lag); break; // FS
      }
      if (slack < free) free = slack;
    }
    r.ff[i] = Math.max(0, Number.isFinite(free) ? free : 0);
  }

  r.finish = finish;
  return r;
}

/** Baseline durations: PERT expected value, rounded to whole working days. */
export function baselineDurations(net) {
  const dur = new Float64Array(net.n);
  for (let i = 0; i < net.n; i += 1) {
    const pkg = PKG_BY_ID.get(net.ids[i]);
    dur[i] = Math.max(1, Math.round(pertMean(pkg)));
  }
  return dur;
}

/**
 * The critical path as an ordered list of package ids: every critical
 * activity, sorted by early start then by early finish.  With four dependency
 * types the critical "path" can legitimately be several parallel chains, so
 * this returns the critical *set* in schedule order, which is what a Gantt
 * chart draws in red.
 */
export function criticalPath(net, res) {
  const items = [];
  for (let i = 0; i < net.n; i += 1) {
    if (res.critical[i]) items.push({ id: net.ids[i], es: res.es[i], ef: res.ef[i] });
  }
  items.sort((a, b) => a.es - b.es || a.ef - b.ef);
  return items.map((it) => it.id);
}

/**
 * Variance of the critical path, and the standard deviation used for
 * confidence dates.  Only critical activities contribute, which is the
 * classical PERT assumption and is stated as such in the user interface.
 */
export function criticalVariance(net, res) {
  let variance = 0;
  for (let i = 0; i < net.n; i += 1) {
    if (!res.critical[i]) continue;
    const sigma = pertSigma(PKG_BY_ID.get(net.ids[i]));
    variance += sigma * sigma;
  }
  return { variance, sigma: Math.sqrt(variance) };
}

/** Human-readable relation label for the network diagram. */
export function relationLabel(type, lag) {
  const base = REL_NAME[REL_CODE[type] ?? REL_FS] || 'FS';
  if (!lag) return base;
  return `${base}${lag > 0 ? '+' : ''}${lag}d`;
}

/**
 * Per-day resource demand from a schedule, for the histogram and for
 * over-allocation detection.  Demand is spread evenly across each activity's
 * duration, which is the standard baseline assumption.
 */
export function resourceHistogram(net, res, horizon) {
  const byPool = new Map();
  for (let i = 0; i < net.n; i += 1) {
    const pkg = PKG_BY_ID.get(net.ids[i]);
    let series = byPool.get(pkg.crew);
    if (!series) {
      series = new Float64Array(horizon + 1);
      byPool.set(pkg.crew, series);
    }
    const start = Math.max(0, Math.round(res.es[i]));
    const end = Math.min(horizon, Math.round(res.ef[i]));
    const span = Math.max(1, end - start);
    // Crew loading is proportional to the package's budget per day, normalised
    // later; a bigger package draws more of its pool.
    const load = 1;
    for (let d = start; d < start + span && d <= horizon; d += 1) series[d] += load;
  }
  return byPool;
}
