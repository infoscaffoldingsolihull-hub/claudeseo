/**
 * Procurement helpers — pure JS. Weighted-scoring source selection,
 * contract-type cost outcomes (FFP, FPIF, CPFF, CPIF, CPAF, T&M), point of
 * total assumption and make-or-buy break-even.
 */

export const CONTRACT_TYPES = {
  FFP: 'Firm fixed price',
  FPIF: 'Fixed price incentive fee',
  CPFF: 'Cost plus fixed fee',
  CPIF: 'Cost plus incentive fee',
  CPAF: 'Cost plus award fee',
  'T&M': 'Time and materials',
};

export const DEFAULT_WEIGHTS = { price: 0.4, technical: 0.3, experience: 0.15, schedule: 0.15 };

/**
 * Weighted scoring. Price score = lowest price / bid price × 100; the other
 * criteria are already on a 0–100 scale. Returns bids ranked best first.
 */
export function weightedScore(bids, weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const sum = w.price + w.technical + w.experience + w.schedule || 1;
  const low = Math.min(...bids.map((b) => b.price));
  return bids
    .map((b) => {
      const priceScore = (low / b.price) * 100;
      const score = (w.price * priceScore + w.technical * b.technical + w.experience * b.experience + w.schedule * b.schedule) / sum;
      return { ...b, priceScore, score };
    })
    .sort((a, b) => b.score - a.score || a.price - b.price);
}

/** Point of total assumption (FPIF): PTA = target cost + (ceiling − target price) / buyer share. */
export function pointOfTotalAssumption({ targetCost, targetFee, ceiling, buyerShare }) {
  return targetCost + (ceiling - (targetCost + targetFee)) / buyerShare;
}

/**
 * What the buyer pays under each contract type for a given actual cost.
 * params: { type, price, targetCost, targetFee, buyerShare, ceiling, fee, minFee, maxFee,
 *           baseFee, awardPool, awardScore, hours, rate, materials, nte }
 */
export function contractOutcome(params) {
  const { type, actualCost = 0 } = params;
  switch (type) {
    case 'FFP': {
      return { type, buyerPays: params.price, sellerProfit: params.price - actualCost };
    }
    case 'FPIF': {
      const sellerShare = 1 - params.buyerShare;
      const fee = params.targetFee + sellerShare * (params.targetCost - actualCost);
      let price = actualCost + fee;
      const capped = price > params.ceiling;
      if (capped) price = params.ceiling;
      return { type, fee: price - actualCost, buyerPays: price, sellerProfit: price - actualCost, capped, pta: pointOfTotalAssumption(params) };
    }
    case 'CPFF': {
      return { type, fee: params.fee, buyerPays: actualCost + params.fee, sellerProfit: params.fee };
    }
    case 'CPIF': {
      const sellerShare = 1 - params.buyerShare;
      let fee = params.targetFee + sellerShare * (params.targetCost - actualCost);
      if (params.minFee !== undefined) fee = Math.max(params.minFee, fee);
      if (params.maxFee !== undefined) fee = Math.min(params.maxFee, fee);
      return { type, fee, buyerPays: actualCost + fee, sellerProfit: fee };
    }
    case 'CPAF': {
      const award = params.awardPool * Math.max(0, Math.min(1, params.awardScore));
      const fee = params.baseFee + award;
      return { type, fee, award, buyerPays: actualCost + fee, sellerProfit: fee };
    }
    case 'T&M': {
      const raw = (params.hours || 0) * (params.rate || 0) + (params.materials || 0);
      const buyerPays = params.nte !== undefined ? Math.min(params.nte, raw) : raw;
      return { type, buyerPays, capped: params.nte !== undefined && raw > params.nte, sellerProfit: buyerPays - actualCost };
    }
    default:
      throw new Error(`contractOutcome: unknown contract type ${type}`);
  }
}

/** Make-or-buy: make = fixed + unit × q, buy = price × q; break-even q* = fixed / (buy − make unit). */
export function makeOrBuy({ makeFixed = 0, makeUnit = 0, buyUnit = 0, quantity = 1 }) {
  const makeCost = makeFixed + makeUnit * quantity;
  const buyCost = buyUnit * quantity;
  const breakEven = buyUnit > makeUnit ? makeFixed / (buyUnit - makeUnit) : Infinity;
  return { makeCost, buyCost, breakEven, decision: makeCost < buyCost ? 'Make' : 'Buy' };
}
