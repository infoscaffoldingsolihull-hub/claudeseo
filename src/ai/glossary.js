import DATA from '../data/glossary.json' with { type: 'json' };

/**
 * MEHRAN's glossary (pure JS — runs under node --test).
 *
 * `lookup(term)` answers an exact name, abbreviation or alias; `search(q)`
 * ranks fuzzy matches so "what is tcpi", "to complete perf index" and
 * "tcip" (a typo) all land on the same entry.
 */

export function normalise(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%/+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const GLOSSARY = (DATA.terms || []).map((e) => ({ ...e, related: e.related || [] }));

const INDEX = new Map();
function keysOf(e) {
  const keys = [e.term];
  if (e.abbr) keys.push(e.abbr);
  for (const a of e.aliases || []) keys.push(a);
  // "Power/Interest Grid" also answers to "power interest grid".
  return keys.map(normalise).filter(Boolean);
}
for (const e of GLOSSARY) {
  for (const k of keysOf(e)) if (!INDEX.has(k)) INDEX.set(k, e);
}

export function glossarySize() {
  return GLOSSARY.length;
}

/** Exact match on term, abbreviation or alias (case/punctuation-insensitive). */
export function lookup(term) {
  const k = normalise(term);
  if (!k) return null;
  if (INDEX.has(k)) return INDEX.get(k);
  // Tolerate plurals and a leading article.
  const k2 = k.replace(/^(the|a|an) /, '').replace(/s$/, '');
  return INDEX.get(k2) || null;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Optimal-string-alignment distance: a swapped pair ("tcip") costs 1.
  const d = [];
  for (let i = 0; i <= a.length; i++) d.push([i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'to', 'for', 'is', 'what', 'whats', 'does', 'do', 'mean', 'means', 'explain', 'define', 'definition', 'me', 'tell', 'about', 'on', 'how', 'with', 'by', 'or', 'please', 'term']);

/** Ranked fuzzy search → [{ entry, score }] best first. */
export function search(q, limit = 5) {
  const nq = normalise(q);
  if (!nq) return [];
  const words = nq.split(' ').filter((w) => w && !STOP.has(w));
  const out = [];
  for (const e of GLOSSARY) {
    const keys = keysOf(e);
    let score = 0;
    for (const k of keys) {
      if (k === nq) score = Math.max(score, 100);
      else if (words.length && words.join(' ') === k) score = Math.max(score, 95);
      else if (k.length >= 3 && (` ${nq} `).includes(` ${k} `)) score = Math.max(score, 60 + Math.min(30, k.length));
      else if (nq.length >= 4 && k.includes(nq)) score = Math.max(score, 50);
      else if (k.length <= 6 && words.some((w) => w.length >= 3 && levenshtein(w, k) === 1)) score = Math.max(score, 40);
    }
    if (words.length) {
      const hay = `${keys.join(' ')} ${normalise(e.definition)}`;
      const termWords = new Set(normalise(e.term).split(' '));
      let hits = 0;
      let termHits = 0;
      for (const w of words) {
        if (w.length < 3) continue;
        if (termWords.has(w) || [...termWords].some((t) => t.length > 4 && (t.startsWith(w) || w.startsWith(t)))) termHits++;
        else if (hay.includes(w)) hits++;
      }
      score = Math.max(score, termHits * 18 + hits * 4);
    }
    if (score > 0) out.push({ entry: e, score });
  }
  out.sort((a, b) => b.score - a.score || a.entry.term.length - b.entry.term.length);
  return out.slice(0, limit);
}

/** Best single entry for free text, or null. */
export function best(q, minScore = 30) {
  const exact = lookup(q);
  if (exact) return exact;
  const r = search(q, 1)[0];
  return r && r.score >= minScore ? r.entry : null;
}

/** Plain-text explanation used by the chat and by `ai.explain(term)`. */
export function describe(entry) {
  if (!entry) return '';
  const name = entry.abbr ? `${entry.term} (${entry.abbr})` : entry.term;
  let s = `**${name}** — ${entry.definition}`;
  if (entry.formula) s += `\n\nFormula: \`${entry.formula}\``;
  s += `\n\n_${entry.domain} · ${entry.clo}_`;
  if (entry.related && entry.related.length) s += ` · Related: ${entry.related.slice(0, 4).join(', ')}`;
  return s;
}
