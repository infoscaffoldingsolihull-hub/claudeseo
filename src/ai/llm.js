import { FACT_TABLE } from '../core/facts.js';
import {
  readState, analyse, criticalPath, riskIssues, riskEmv, stakeholderGaps, levelName, pendingChanges,
  agileInfo, qualityIssues, resourceIssues, procurementInfo, nextMilestone, num, arr,
} from './rules.js';

/**
 * MEHRAN live mode — optional, bring-your-own-key Claude via the Messages API.
 *
 * Privacy contract:
 *  - the key lives in sessionStorage only (never localStorage, never in saves,
 *    exports or logs) and is dropped when the tab closes or on "Forget key";
 *  - nothing is sent anywhere unless the user has pasted a key AND chosen the
 *    live engine; any failure falls back to the offline rule engine.
 *
 * Raw fetch (no SDK): the deliverable is one offline HTML file with no npm
 * runtime dependencies. Streaming SSE is parsed by hand (parseSSE, unit-tested).
 */

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';
export const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced, default)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
];
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const KEY_NAME = 'hdd-mehran-session-key';
const MAX_TOOL_ROUNDS = 4;

/* ------------------------------------------------------------ key storage (sessionStorage only) */

function store() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getKey() {
  try {
    const s = store();
    return (s && s.getItem(KEY_NAME)) || '';
  } catch {
    return '';
  }
}

export function hasKey() {
  return getKey().length > 0;
}

export function setKey(k) {
  const v = String(k || '').trim();
  try {
    const s = store();
    if (!s) return false;
    if (v) s.setItem(KEY_NAME, v);
    else s.removeItem(KEY_NAME);
    return true;
  } catch {
    return false;
  }
}

export function clearKey() {
  return setKey('');
}

/* ------------------------------------------------------------ grounding */

const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : null);

/** Compact, JSON-safe snapshot of the live project for the system prompt. */
export function compactSnapshot(p, S) {
  S = S || readState(p);
  const rk = riskIssues(p, S);
  const ag = agileInfo(p);
  const q = qualityIssues(p);
  const res = resourceIssues(p);
  const pr = procurementInfo(p, S);
  const ms = nextMilestone(p, S);
  return {
    note: 'Simulated scenario data. Money in PKR (rupees). Time in days from project start (day 0 = Mon 04 Jan 2027).',
    day: S.day, date: S.dateLabel, phase: S.phase, approach: S.approach, difficulty: S.difficulty, finished: S.finished,
    progress: r3(S.progress), bac: r0(S.bac), pv: r0(S.pv), ev: r0(S.ev), ac: r0(S.ac), sv: r0(S.sv), cv: r0(S.cv),
    spi: r3(S.spi), cpi: r3(S.cpi), eac: r0(S.eac), etc: r0(S.etc), vac: r0(S.vac), tcpi: r3(S.tcpi), svt: r0(S.svt),
    baselineDuration: r0(S.baselineDuration), forecastFinish: r0(S.forecastFinish), scheduleVarianceDays: r0(S.scheduleVarianceDays),
    contingencyRemaining: r0(S.contingencyRemaining), contingencyReserve: r0(S.contingencyReserve), managementRemaining: r0(S.managementRemaining),
    qualityIndex: r3(S.qualityIndex), safety: r3(S.safety), welfare: r3(S.welfare), incidents: Number.isFinite(S.incidents) ? S.incidents : null,
    stakeholderSatisfaction: r3(S.stakeholderSatisfaction),
    weather: { kind: S.weather.kind, label: S.weather.label, workFactor: r3(S.weather.workFactor) },
    nextMilestone: ms ? { name: ms.name, baselineDay: r0(num(ms.baselineDay)), forecastDay: r0(ms.forecastDay) } : null,
    criticalPath: criticalPath(p).slice(0, 12).map((c) => ({ code: c.code, name: c.name, pct: r3(c.pct) })),
    topRisks: rk.threats.slice(0, 6).map((r) => ({ id: r.id, title: r.title, p: r3(num(r.probability)), impact: r0(num(r.costImpact)), emv: r0(riskEmv(r)), response: r.response || null, owner: r.owner || null })),
    realisedRisks: rk.occurred.slice(0, 6).map((r) => r.id),
    resources: res.rows.slice(0, 14).map((r) => ({ id: r.id, name: r.name, assigned: r0(r.assigned), required: r0(r.required), capacity: Number.isFinite(r.capacity) ? r0(r.capacity) : null })),
    stakeholdersBelowTarget: stakeholderGaps(p).filter((x) => x.gap > 0).slice(0, 6).map((x) => ({ id: x.id, role: x.role, current: levelName(x.current), desired: levelName(x.desired), quadrant: x.quadrant })),
    pendingChanges: pendingChanges(p).slice(0, 6).map((c) => ({ id: c.id, title: c.title, status: c.status, impact: c.impact || null })),
    quality: { openNcrs: q.openNcrs.length, signals: q.metrics.filter((m) => m.hits.length).map((m) => ({ metric: m.name, rule: m.hits[0].rule })), inspectionLevel: q.inspectionLevel },
    agile: ag.hasAgile ? { velocities: ag.velocities.slice(-5), avgVelocity: r3(ag.avg), pointsLeft: ag.pointsLeft, wipBreaches: ag.breaches } : null,
    procurement: { byStatus: pr.by, atRisk: pr.atRisk.slice(0, 4).map((k) => ({ id: k.id, name: k.name, status: k.status, slackDays: r0(k.slack) })) },
    monteCarlo: S.mc ? { iterations: S.mc.iterations, p50: r0(num(S.mc.finish && S.mc.finish.p50)), p80: r0(num(S.mc.finish && S.mc.finish.p80)), probabilityOnTime: r3(num(S.mc.probabilityOnTime)) } : null,
    ruleEngineAdvice: analyse(p, { state: S }).slice(0, 5).map((a) => ({ severity: a.severity, title: a.title })),
  };
}

export function buildSystemPrompt(snapshot) {
  const facts = Object.fromEntries(Object.entries(FACT_TABLE).map(([k, v]) => [k, v.value]));
  return [
    'You are MEHRAN, the AI project-management co-pilot inside SKY GATEWAY HYDERABAD, an educational 3D simulator of a revival and expansion programme at Hyderabad Airport (Sindh, Pakistan; HDD/OPKD). The user is a project-management student or instructor.',
    'Rules:',
    '1. Only use numbers from the snapshot below or from tool results; if a number is not there, say "not in the data". Never estimate or invent figures.',
    '2. All project figures are simulated scenario data. Real-world facts about the airport may be stated only from the VERIFIED_FACTS list; otherwise say you do not have a verified source.',
    '3. You may recommend actions but never claim to have changed the project. Use propose_change_request to propose changes; the human must approve every state-changing action.',
    '4. Explain PM concepts in PMBOK 8 terms (principles, performance domains, focus areas) and show the formula when you use one. Use PKR with "bn"/"m" units.',
    '5. Be concise: at most about 180 words unless the user asks for a report. Use short Markdown (bold, lists).',
    `VERIFIED_FACTS: ${JSON.stringify(facts)}`,
    `SNAPSHOT: ${JSON.stringify(snapshot)}`,
  ].join('\n');
}

export const TOOLS = [
  { name: 'get_snapshot', description: 'Return the full current compact project snapshot (EVM, schedule, risks, resources, stakeholders, quality, agile, procurement). Use when the system-prompt snapshot may be stale.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_critical_path', description: 'Return every activity on the current critical path with WBS code, name, % complete and total float.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'run_monte_carlo', description: 'Run a Monte Carlo schedule/cost simulation of the remaining work and return P10/P50/P80/P90 finish days, probability of meeting the baseline and the top tornado drivers.', input_schema: { type: 'object', properties: { iterations: { type: 'integer', description: 'Number of iterations, 1000–10000. Default 5000.' } }, additionalProperties: false } },
  { name: 'propose_change_request', description: 'Propose a formal change request. The human user is shown an approval dialog; the change is only raised if they approve. Returns whether it was raised.', input_schema: { type: 'object', properties: { title: { type: 'string', description: 'Short title of the change.' }, description: { type: 'string', description: 'What changes and why.' }, days: { type: 'number', description: 'Estimated schedule impact in days (optional).' }, cost: { type: 'number', description: 'Estimated cost impact in PKR (optional).' } }, required: ['title', 'description'], additionalProperties: false } },
  { name: 'draft_status_report', description: 'Generate the weekly status report (Markdown) from the live project using the offline rule engine.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'explain_term', description: 'Look up a project-management or airport term in the simulator glossary and return its definition, formula and related terms.', input_schema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'], additionalProperties: false } },
  { name: 'get_advice', description: 'Return the offline rule engine\'s ranked recommendations with the evidence each rule fired on.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
];

/* ------------------------------------------------------------ SSE parsing */

/**
 * Incremental SSE parser. `st` = { buffer, blocks:[], stopReason, text }.
 * Calls onDelta(text) for each text_delta. Returns st.
 */
export function parseSSE(chunk, st, onDelta) {
  st.buffer = (st.buffer || '') + chunk;
  st.blocks = st.blocks || [];
  const parts = st.buffer.split(/\r?\n\r?\n/);
  st.buffer = parts.pop();
  for (const part of parts) {
    const data = part.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    handleEvent(ev, st, onDelta);
  }
  return st;
}

function handleEvent(ev, st, onDelta) {
  switch (ev.type) {
    case 'content_block_start': {
      const b = { ...(ev.content_block || {}) };
      if (b.type === 'tool_use') { b._json = ''; b.input = b.input || {}; }
      if (b.type === 'text') b.text = b.text || '';
      if (b.type === 'thinking') { b.thinking = b.thinking || ''; b.signature = b.signature || ''; }
      st.blocks[ev.index] = b;
      break;
    }
    case 'content_block_delta': {
      const b = st.blocks[ev.index];
      const d = ev.delta || {};
      if (!b) break;
      if (d.type === 'text_delta') {
        b.text = (b.text || '') + d.text;
        st.text = (st.text || '') + d.text;
        if (onDelta) onDelta(d.text);
      } else if (d.type === 'input_json_delta') {
        b._json = (b._json || '') + (d.partial_json || '');
      } else if (d.type === 'thinking_delta') {
        b.thinking = (b.thinking || '') + (d.thinking || '');
      } else if (d.type === 'signature_delta') {
        b.signature = (b.signature || '') + (d.signature || '');
      }
      break;
    }
    case 'content_block_stop': {
      const b = st.blocks[ev.index];
      if (b && b.type === 'tool_use') {
        try {
          b.input = b._json ? JSON.parse(b._json) : b.input || {};
        } catch {
          b.input = {};
          b._invalid = true;
        }
        delete b._json;
      }
      break;
    }
    case 'message_delta':
      if (ev.delta && ev.delta.stop_reason) st.stopReason = ev.delta.stop_reason;
      break;
    case 'error': {
      const err = new Error((ev.error && ev.error.message) || 'Stream error');
      err.status = 'stream';
      throw err;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------ the live engine */

/**
 * LiveEngine.ask() runs one streamed turn with a client-side tool loop.
 * `runTool(name, input)` → Promise<string> is supplied by mehran.js (state-changing
 * tools go through sim.requestApproval there).
 */
export class LiveEngine {
  constructor({ getModel, getSnapshot, runTool, fetchImpl } = {}) {
    this.getModel = getModel || (() => DEFAULT_MODEL);
    this.getSnapshot = getSnapshot || (() => ({}));
    this.runTool = runTool || (async () => 'Tool unavailable.');
    this.fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.useFallbacks = true;
    this.controller = null;
  }

  available() {
    return !!this.fetch && hasKey() && (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  cancel() {
    if (this.controller) this.controller.abort();
  }

  async ask(history, text, { onDelta, onTool } = {}) {
    if (!this.available()) throw Object.assign(new Error('Live mode unavailable (no key or offline).'), { status: 'unavailable' });
    const system = buildSystemPrompt(this.getSnapshot());
    const messages = [];
    for (const h of arr(history).slice(-8)) {
      if (!h || !h.text) continue;
      const role = h.role === 'user' ? 'user' : 'assistant';
      if (!messages.length && role !== 'user') continue;
      const last = messages[messages.length - 1];
      if (last && last.role === role) last.content += `\n\n${h.text}`;
      else messages.push({ role, content: h.text });
    }
    if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += `\n\n${text}`;
    else messages.push({ role: 'user', content: text });

    let finalText = '';
    const tools = [];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const st = await this._stream({ system, messages, onDelta: (t) => { finalText += t; if (onDelta) onDelta(t); } });
      const blocks = st.blocks.filter(Boolean);
      if (st.stopReason === 'refusal') {
        const note = '\n\n_(The model declined this request.)_';
        finalText += note;
        if (onDelta) onDelta(note);
        break;
      }
      if (st.stopReason !== 'tool_use') break;
      const uses = blocks.filter((b) => b.type === 'tool_use');
      if (!uses.length || round === MAX_TOOL_ROUNDS) break;
      messages.push({ role: 'assistant', content: blocks.map(cleanBlock) });
      const results = [];
      for (const u of uses) {
        if (onTool) onTool(u.name, u.input);
        tools.push(u.name);
        let content;
        let isError = false;
        if (u._invalid) {
          content = 'INVALID_JSON: the tool input could not be parsed; please retry with valid JSON.';
          isError = true;
        } else {
          try {
            const r = await this.runTool(u.name, u.input || {});
            content = typeof r === 'string' ? r : JSON.stringify(r);
          } catch (err) {
            content = `Tool error: ${err && err.message ? err.message : err}`;
            isError = true;
          }
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      if (finalText && !/\n$/.test(finalText)) { finalText += '\n\n'; if (onDelta) onDelta('\n\n'); }
    }
    return { text: finalText.trim() || 'not in the data', tools };
  }

  async _stream({ system, messages, onDelta }) {
    const model = this.getModel() || DEFAULT_MODEL;
    const body = { model, max_tokens: 4096, system, messages, tools: TOOLS, stream: true, output_config: { effort: 'low' } };
    const headers = {
      'x-api-key': getKey(),
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    };
    // Server-side refusal fallback (Sonnet/Opus 5.5 on the Claude API). Dropped automatically if the account rejects it.
    const withFallback = this.useFallbacks && /sonnet-5-5|opus-5-5/.test(model);
    if (withFallback) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    this.controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = this.controller ? setTimeout(() => this.controller.abort(), 90000) : null;
    let res;
    try {
      res = await this.fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: this.controller ? this.controller.signal : undefined });
    } catch (err) {
      clearTimeout(timer);
      throw Object.assign(new Error(`Network error: ${err && err.message ? err.message : err}`), { status: 'network' });
    }
    if (!res.ok) {
      clearTimeout(timer);
      let msg = '';
      try {
        const j = await res.json();
        msg = (j && j.error && j.error.message) || '';
      } catch {
        msg = '';
      }
      if (withFallback && res.status === 400 && /fallback|beta/i.test(msg)) {
        this.useFallbacks = false;
        return this._stream({ system, messages, onDelta });
      }
      const why = res.status === 401 ? 'API key rejected' : res.status === 429 ? 'rate limited' : res.status === 529 ? 'service overloaded' : msg || `HTTP ${res.status}`;
      throw Object.assign(new Error(why), { status: res.status });
    }
    const st = { buffer: '', blocks: [], stopReason: null, text: '' };
    try {
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          parseSSE(dec.decode(value, { stream: true }), st, onDelta);
        }
        parseSSE('\n\n', st, onDelta);
      } else {
        parseSSE(`${await res.text()}\n\n`, st, onDelta);
      }
    } finally {
      clearTimeout(timer);
    }
    return st;
  }
}

/** Strip parser scratch fields so blocks can be echoed back unchanged. */
function cleanBlock(b) {
  const out = { ...b };
  delete out._json;
  delete out._invalid;
  return out;
}
