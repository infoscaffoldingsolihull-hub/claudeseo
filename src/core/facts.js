import FACTS from '../data/facts.json' with { type: 'json' };

/**
 * The only door through which real-world facts reach the UI.
 *
 * `fact('runway.length')` returns the verified value; `factSource(key)` the
 * citation. Asking for a key that is not in facts.json throws during
 * development, so a hallucinated "fact" can never render silently.
 */
export const FACT_TABLE = FACTS.facts || {};

export function fact(key) {
  const f = FACT_TABLE[key];
  if (!f) throw new Error(`facts.json has no entry "${key}"`);
  return f.value;
}

export function hasFact(key) {
  return Object.prototype.hasOwnProperty.call(FACT_TABLE, key);
}

export function factSource(key) {
  const f = FACT_TABLE[key];
  return f ? { url: f.source_url, retrieved: f.retrieved, confidence: f.confidence, note: f.note || '' } : null;
}

export function factKeys() {
  return Object.keys(FACT_TABLE);
}

export const SIM_LABEL = 'Simulated scenario data';
