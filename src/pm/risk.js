/**
 * Risk analysis helpers — pure JS. Expected monetary value, probability/impact
 * scoring (PMBOK 5×5 matrix) and decision-tree roll-back.
 */

export const THREAT_STRATEGIES = ['Avoid', 'Mitigate', 'Transfer', 'Escalate', 'Accept'];
export const OPPORTUNITY_STRATEGIES = ['Exploit', 'Enhance', 'Share', 'Escalate', 'Accept'];

/** Signed EMV = P × I: negative for threats, positive for opportunities. */
export function emv(p, impact, kind = 'threat') {
  const v = p * Math.abs(impact);
  return kind === 'opportunity' ? v : -v;
}

/** Probability–impact score on the 5×5 matrix (1…25). */
export function riskScore(p, i) {
  return p * i;
}

/** Map a probability (0..1) to the 1–5 scale. */
export function probabilityScore(prob) {
  if (prob < 0.1) return 1;
  if (prob < 0.25) return 2;
  if (prob < 0.4) return 3;
  if (prob < 0.6) return 4;
  return 5;
}

/** Map cost and schedule impact to the 1–5 scale (the worse dimension wins). */
export function impactScore({ cost = 0, days = 0 }, { bac = 1 } = {}) {
  const c = Math.abs(cost) / Math.max(1, bac);
  const cs = c < 0.002 ? 1 : c < 0.005 ? 2 : c < 0.01 ? 3 : c < 0.025 ? 4 : 5;
  const d = Math.abs(days);
  const ds = d < 10 ? 1 : d < 20 ? 2 : d < 40 ? 3 : d < 80 ? 4 : 5;
  return Math.max(cs, ds);
}

/** Qualitative rating band from a P×I score. */
export function ratingBand(score) {
  if (score >= 15) return 'High';
  if (score >= 8) return 'Medium';
  return 'Low';
}

/**
 * Decision-tree roll-back (backward induction).
 *  { type:'decision', options:[{ label, cost?, node }] } → best option by value − cost
 *  { type:'chance', branches:[{ label?, p, node | value }] } → Σ p × value
 *  { type:'outcome'|'terminal', value }
 * Returns { value, choice?, options? }.
 */
export function decisionTree(node) {
  if (node === null || node === undefined) return { value: 0 };
  if (typeof node === 'number') return { value: node };
  if (node.type === 'decision') {
    const options = node.options.map((o) => {
      const sub = decisionTree(o.node !== undefined ? o.node : o.value || 0);
      return { label: o.label, value: sub.value - (o.cost || 0), detail: sub };
    });
    let best = options[0];
    for (const o of options) if (o.value > best.value) best = o;
    return { value: best.value, choice: best.label, options };
  }
  if (node.type === 'chance') {
    let value = 0;
    let total = 0;
    const branches = node.branches.map((b) => {
      const sub = decisionTree(b.node !== undefined ? b.node : b.value || 0);
      value += b.p * sub.value;
      total += b.p;
      return { label: b.label, p: b.p, value: sub.value, detail: sub };
    });
    if (Math.abs(total - 1) > 1e-6) throw new Error(`decisionTree: chance node probabilities sum to ${total}`);
    return { value, branches };
  }
  return { value: node.value || 0 };
}
