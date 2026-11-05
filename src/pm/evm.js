/**
 * Earned value management — pure functions, textbook formulas (PMBOK 7 /
 * PMI Practice Standard for EVM, Lipke's earned schedule).
 */

function div(a, b, fallback = 1) {
  return b !== 0 && Number.isFinite(a / b) ? a / b : fallback;
}

/**
 * Every §5.3 EVM measure.
 * @param {{ bac:number, pv:number, ev:number, ac:number, etcBottomUp?:number }} input
 */
export function evmMetrics({ bac, pv, ev, ac, etcBottomUp }) {
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = div(ev, ac);
  const spi = div(ev, pv);
  const eac = {
    cpi: div(bac, cpi, bac),                                   // EAC = BAC / CPI (typical)
    atBudget: ac + (bac - ev),                                  // EAC = AC + (BAC − EV) (atypical)
    composite: ac + div(bac - ev, cpi * spi, bac - ev),         // EAC = AC + (BAC − EV)/(CPI×SPI)
    bottomUp: ac + (etcBottomUp === undefined ? bac - ev : etcBottomUp), // EAC = AC + bottom-up ETC
  };
  const etc = eac.cpi - ac;                                     // ETC = EAC − AC
  const vac = bac - eac.cpi;                                    // VAC = BAC − EAC
  const tcpi = {
    bac: div(bac - ev, bac - ac),                               // (BAC − EV)/(BAC − AC)
    eac: div(bac - ev, eac.cpi - ac),                           // (BAC − EV)/(EAC − AC)
  };
  return {
    bac, pv, ev, ac, cv, sv, cpi, spi,
    cvPct: div(cv, ev, 0), svPct: div(sv, pv, 0),
    eac, etc,
    etcs: { cpi: eac.cpi - ac, atBudget: eac.atBudget - ac, composite: eac.composite - ac, bottomUp: eac.bottomUp - ac },
    vac,
    vacs: { cpi: bac - eac.cpi, atBudget: bac - eac.atBudget, composite: bac - eac.composite, bottomUp: bac - eac.bottomUp },
    tcpi,
    percentComplete: div(ev, bac, 0), percentSpent: div(ac, bac, 0),
  };
}

/**
 * Earned schedule (Lipke): ES = C + (EV − PV_C)/(PV_{C+1} − PV_C), where C is
 * the last whole period whose cumulative PV does not exceed EV.
 * @param {ArrayLike<number>} pvCurve cumulative PV at t = 0, 1, 2 …
 * @param {number} ev
 * @param {number} [at] actual time (periods elapsed) for SV(t), SPI(t)
 * @param {number} [pd] planned duration, for IEAC(t) = PD / SPI(t)
 */
export function earnedSchedule(pvCurve, ev, at, pd) {
  const last = pvCurve.length - 1;
  let es;
  if (ev <= 0) es = 0;
  else if (ev >= pvCurve[last]) es = last;
  else {
    let lo = 0;
    let hi = last;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (pvCurve[mid] <= ev) lo = mid;
      else hi = mid;
    }
    while (hi < last && pvCurve[hi] <= ev) { lo = hi; hi++; }
    const step = pvCurve[hi] - pvCurve[lo];
    es = step > 0 ? lo + (ev - pvCurve[lo]) / step : lo;
  }
  const out = { es };
  if (at !== undefined) {
    out.svt = es - at;
    out.spit = at > 0 ? es / at : 1;
    if (pd !== undefined) out.ieact = out.spit > 0 ? pd / out.spit : Infinity;
  }
  return out;
}

/** Build a cumulative PV curve from a schedule (linear spread between start and finish). */
export function buildPvCurve(items, length) {
  const curve = new Float64Array(length + 1);
  for (const it of items) {
    const start = it.start;
    const end = it.finish;
    if (!it.budget) continue;
    const span = end - start;
    for (let d = 0; d <= length; d++) {
      let frac;
      if (span <= 0) frac = d >= end ? 1 : 0;
      else if (d <= start) frac = 0;
      else if (d >= end) frac = 1;
      else frac = (d - start) / span;
      curve[d] += it.budget * frac;
    }
  }
  return curve;
}
