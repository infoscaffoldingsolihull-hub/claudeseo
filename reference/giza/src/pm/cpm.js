/**
 * Critical Path Method over a precedence diagram (PDM).
 *
 * Supports all four dependency types with leads and lags, computes early and
 * late dates, total and free float, identifies the critical path, and layers
 * PERT three-point estimating on top so the schedule carries a variance as
 * well as a date.
 *
 * Nothing here knows about pyramids — it is a general scheduling engine, which
 * is the point: the same code would run a hospital fit-out.
 */

/** PERT expected duration: (O + 4M + P) / 6. */
export function pertDuration(o, m, p) {
  return (o + 4 * m + p) / 6;
}

/** PERT standard deviation: (P − O) / 6. */
export function pertSigma(o, p) {
  return (p - o) / 6;
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). */
export function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Kahn topological sort; throws on a cycle so a bad network fails loudly. */
function topologicalOrder(tasks) {
  const indegree = new Map();
  const successors = new Map();
  for (const t of tasks) {
    indegree.set(t.id, 0);
    successors.set(t.id, []);
  }
  for (const t of tasks) {
    for (const link of t.predecessors || []) {
      if (!indegree.has(link.id)) continue;
      indegree.set(t.id, indegree.get(t.id) + 1);
      successors.get(link.id).push({ id: t.id, type: link.type || 'FS', lag: link.lag || 0 });
    }
  }
  const queue = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const s of successors.get(id)) {
      indegree.set(s.id, indegree.get(s.id) - 1);
      if (indegree.get(s.id) === 0) queue.push(s.id);
    }
  }
  if (order.length !== tasks.length) {
    const stuck = tasks.filter((t) => !order.includes(t.id)).map((t) => t.id);
    throw new Error(`CPM: dependency cycle involving ${stuck.join(', ')}`);
  }
  return { order, successors };
}

/**
 * Run the forward and backward passes.
 *
 * @param {Array} tasks  [{ id, duration, predecessors:[{id,type,lag}] }]
 * @param {object} opts  { floatTolerance }
 * @returns {{ nodes: Map, duration: number, criticalPath: string[], order: string[] }}
 */
export function computeCPM(tasks, opts = {}) {
  const floatTolerance = opts.floatTolerance === undefined ? 0.5 : opts.floatTolerance;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { order, successors } = topologicalOrder(tasks);

  const nodes = new Map();
  for (const t of tasks) {
    nodes.set(t.id, {
      id: t.id,
      duration: t.duration,
      es: 0, ef: 0, ls: 0, lf: 0,
      totalFloat: 0, freeFloat: 0,
      critical: false,
      predecessors: t.predecessors || [],
      successors: successors.get(t.id) || [],
    });
  }

  // ---- forward pass ----
  for (const id of order) {
    const node = nodes.get(id);
    const task = byId.get(id);
    let es = task.constraintStart !== undefined ? task.constraintStart : 0;
    for (const link of node.predecessors) {
      const pred = nodes.get(link.id);
      if (!pred) continue;
      const lag = link.lag || 0;
      const type = link.type || 'FS';
      let candidate;
      if (type === 'FS') candidate = pred.ef + lag;
      else if (type === 'SS') candidate = pred.es + lag;
      else if (type === 'FF') candidate = pred.ef + lag - node.duration;
      else candidate = pred.es + lag - node.duration;   // SF
      if (candidate > es) es = candidate;
    }
    node.es = Math.max(0, es);
    node.ef = node.es + node.duration;
  }

  let projectFinish = 0;
  for (const node of nodes.values()) projectFinish = Math.max(projectFinish, node.ef);
  if (opts.projectFinish !== undefined) projectFinish = Math.max(projectFinish, opts.projectFinish);

  // ---- backward pass ----
  for (let i = order.length - 1; i >= 0; i--) {
    const node = nodes.get(order[i]);
    let lf = projectFinish;
    if (node.successors.length) {
      lf = Infinity;
      for (const link of node.successors) {
        const succ = nodes.get(link.id);
        const lag = link.lag || 0;
        let candidate;
        if (link.type === 'FS') candidate = succ.ls - lag;
        else if (link.type === 'SS') candidate = succ.ls - lag + node.duration;
        else if (link.type === 'FF') candidate = succ.lf - lag;
        else candidate = succ.lf - lag + node.duration;  // SF
        if (candidate < lf) lf = candidate;
      }
    }
    node.lf = lf;
    node.ls = node.lf - node.duration;
    node.totalFloat = node.ls - node.es;
    node.critical = node.totalFloat <= floatTolerance;
  }

  // ---- free float ----
  for (const node of nodes.values()) {
    if (!node.successors.length) {
      node.freeFloat = projectFinish - node.ef;
      continue;
    }
    let ff = Infinity;
    for (const link of node.successors) {
      const succ = nodes.get(link.id);
      const lag = link.lag || 0;
      let slack;
      if (link.type === 'FS') slack = succ.es - lag - node.ef;
      else if (link.type === 'SS') slack = succ.es - lag - node.es;
      else if (link.type === 'FF') slack = succ.ef - lag - node.ef;
      else slack = succ.ef - lag - node.es;
      if (slack < ff) ff = slack;
    }
    node.freeFloat = Math.max(0, Math.min(ff, node.totalFloat));
  }

  // ---- extract the longest critical chain for display ----
  const criticalIds = order.filter((id) => nodes.get(id).critical);
  const criticalPath = criticalIds.sort((a, b) => nodes.get(a).es - nodes.get(b).es);

  return { nodes, duration: projectFinish, criticalPath, order };
}

/**
 * PERT analysis of a completed CPM result: expected duration, the variance
 * accumulated along the critical path, and the probability of finishing by a
 * given target date.
 */
export function pertAnalysis(cpm, tasks, targetDuration) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let variance = 0;
  for (const id of cpm.criticalPath) {
    const t = byId.get(id);
    if (!t || t.o === undefined) continue;
    const sigma = pertSigma(t.o, t.p);
    variance += sigma * sigma;
  }
  const sigma = Math.sqrt(variance);
  const z = sigma > 0 ? (targetDuration - cpm.duration) / sigma : targetDuration >= cpm.duration ? 6 : -6;
  return {
    expected: cpm.duration,
    variance,
    sigma,
    z,
    probability: normalCdf(z),
    /** Duration with the given confidence, from the inverse normal. */
    atConfidence(pct) {
      // Beasley–Springer–Moro style rational approximation of the probit.
      const q = pct - 0.5;
      let x;
      if (Math.abs(q) <= 0.425) {
        const r = 0.180625 - q * q;
        x =
          (q *
            (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r +
              45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
              133.14166789178437745) * r + 3.387132872796366608)) /
          (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r +
            21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
            42.313330701600911252) * r + 1);
      } else {
        let r = q < 0 ? pct : 1 - pct;
        r = Math.sqrt(-Math.log(r));
        if (r <= 5) {
          r -= 1.6;
          x =
            (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
              1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
              4.6303378461565452959) * r + 1.42343711074968357734) /
            (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
              0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
              2.05319162663775882187) * r + 1);
        } else {
          r -= 5;
          x =
            (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
              0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
              5.4637849111641143699) * r + 6.6579046435011037772) /
            (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
              7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
              0.59983220655588793769) * r + 1);
        }
        if (q < 0) x = -x;
      }
      return cpm.duration + x * sigma;
    },
  };
}

/**
 * Schedule compression: return the cheapest set of activities to crash in
 * order to recover `days`, using the classic cost-slope ranking restricted to
 * the current critical path.
 */
export function crashCandidates(cpm, tasks, days) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const options = [];
  for (const id of cpm.criticalPath) {
    const t = byId.get(id);
    if (!t || !t.crashable) continue;
    const maxCrash = t.duration - t.crashDuration;
    if (maxCrash <= 0) continue;
    options.push({
      id,
      name: t.name,
      maxCrash,
      costSlope: (t.crashCost - t.budget) / maxCrash,
    });
  }
  options.sort((a, b) => a.costSlope - b.costSlope);
  const plan = [];
  let remaining = days;
  let cost = 0;
  for (const opt of options) {
    if (remaining <= 0) break;
    const take = Math.min(opt.maxCrash, remaining);
    plan.push({ ...opt, crashDays: take, addedCost: take * opt.costSlope });
    cost += take * opt.costSlope;
    remaining -= take;
  }
  return { plan, recovered: days - remaining, addedCost: cost, shortfall: remaining };
}
