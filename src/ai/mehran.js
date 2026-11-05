import {
  analyse as runRules, readState, executeAction, STATE_CHANGING, RULE_IDS, standupText, statusReport as buildReport,
  riskResponses as buildRiskResponses, changeImpact as buildChangeImpact, stakeholderMessage, tutorText, headline,
  criticalPath, floatTable,
} from './rules.js';
import { respond, makeContext, intentCount, suggestionsFor, DEFAULT_SUGGESTIONS } from './intents.js';
import { best, describe, search, glossarySize } from './glossary.js';
import { LiveEngine, hasKey, compactSnapshot } from './llm.js';
import { Voice } from './voice.js';
import { runMonteCarlo } from '../pm/montecarlo.js';

/**
 * MEHRAN — the AI project-management co-pilot (docs/ARCHITECTURE.md §8).
 *
 * Two engines behind one API:
 *  - offline (always available): rules.js + intents.js + glossary.js, transparent and deterministic;
 *  - live (opt-in): Claude via llm.js with the user's own key; any failure falls back to offline.
 * Every state-changing action — whether proposed by a rule, an intent or the
 * live model — goes through sim.requestApproval (human-in-the-loop).
 */
export class Mehran {
  constructor(sim) {
    this.sim = sim;
    this.history = [];
    this.lastMC = null;
    this.lastQuiz = null;
    this.lastError = '';
    this._failed = false;
    this._offs = [];
    this.voice = new Voice(sim && sim.settings);
    this.live = new LiveEngine({
      getModel: () => this._setting('ai.model') || 'claude-sonnet-5-5',
      getSnapshot: () => compactSnapshot(this.project, readState(this.project, { mc: this.mc() })),
      runTool: (name, input) => this._runTool(name, input),
    });
    const bus = sim && sim.bus;
    if (bus && bus.on) {
      this._offs.push(bus.on('project:new', () => { this.lastMC = null; }));
      this._offs.push(bus.on('settings:changed', ({ path } = {}) => { if (path && path.startsWith('ai.')) this._failed = false; }));
    }
  }

  get project() {
    return (this.sim && this.sim.project) || {};
  }

  _setting(path) {
    const s = this.sim && this.sim.settings;
    return s && typeof s.get === 'function' ? s.get(path) : undefined;
  }

  /** 'live' (green) | 'fallback' | 'offline' (amber). */
  get status() {
    if (this._setting('ai.engine') !== 'live' || !hasKey()) return 'offline';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'fallback';
    return this._failed ? 'fallback' : 'live';
  }

  get engineLabel() {
    const s = this.status;
    return s === 'live' ? `Live · ${this._setting('ai.model') || 'claude-sonnet-5-5'}` : s === 'fallback' ? 'Fallback · offline rules' : 'Offline rule engine';
  }

  /** Cached Monte Carlo result if it is recent (≤ 7 sim days old). */
  mc() {
    const p = this.project;
    const cand = this.lastMC || p.lastMonteCarlo || p.monteCarlo || null;
    if (!cand || !cand.iterations) return null;
    const d = Number.isFinite(cand.day) ? cand.day : p.day;
    return Math.abs((p.day || 0) - d) <= 7 ? cand : null;
  }

  setMonteCarlo(result) {
    if (result && result.iterations) this.lastMC = result;
  }

  runMonteCarlo(iterations = 5000) {
    return new Promise((resolve) => {
      setTimeout(() => {
        let r = null;
        try {
          r = runMonteCarlo(this.project, { iterations });
        } catch (err) {
          this.lastError = err && err.message ? err.message : String(err);
        }
        if (r && r.iterations) {
          if (!Number.isFinite(r.day)) r.day = this.project.day;
          this.lastMC = r;
        }
        resolve(this.lastMC);
      }, 30);
    });
  }

  /* ------------------------------------------------------------ actions */

  /** Wrap action data so it is JSON-safe (run is non-enumerable) yet callable. */
  wrapAction(a) {
    if (!a) return null;
    const out = { kind: a.kind, label: a.label, args: a.args || {}, detail: a.detail || '', needsApproval: STATE_CHANGING.has(a.kind) };
    Object.defineProperty(out, 'run', { enumerable: false, value: () => this.runAction(out) });
    return out;
  }

  /** Execute an action; state-changing kinds require human approval first. */
  runAction(a) {
    const sim = this.sim || {};
    if (!a) return Promise.resolve(false);
    if (STATE_CHANGING.has(a.kind)) {
      const detail = `${a.detail || a.label}\n\nProposed by MEHRAN from the live simulation data. This changes the simulated project; approve only if you agree — you remain accountable.`;
      const approve = () => {
        const r = executeAction(this.project, a);
        if (sim.toast) sim.toast(r.ok ? `MEHRAN: ${r.message || a.label}` : `Not applied: ${r.message}`, r.ok ? 'good' : 'warn');
        if (sim.bus) sim.bus.emit('ai:message', { role: 'system', text: `${r.ok ? 'Applied' : 'Not applied'}: ${a.label}${r.message ? ` — ${r.message}` : ''}` });
        if (sim.dashboard && sim.dashboard.rerender && sim.dashboard.openId) sim.dashboard.rerender();
        if (sim.syncWorld) { try { sim.syncWorld(); } catch { /* world may be mid-build */ } }
      };
      if (typeof sim.requestApproval === 'function') return Promise.resolve(sim.requestApproval({ title: `MEHRAN proposes: ${a.label}`, detail, onApprove: approve }));
      return Promise.resolve(false);
    }
    switch (a.kind) {
      case 'openPanel':
        if (sim.openPanel) sim.openPanel(a.args && a.args.id);
        return Promise.resolve(true);
      case 'montecarlo':
        if (sim.toast) sim.toast('Running Monte Carlo…');
        return this.runMonteCarlo().then((r) => {
          if (sim.toast) sim.toast(r ? `Monte Carlo done: P80 day ${Math.round(r.finish && r.finish.p80)}` : 'Monte Carlo is not available in this build', r ? 'good' : 'warn');
          return !!r;
        });
      case 'exportReport':
        this.exportReport();
        return Promise.resolve(true);
      default:
        return Promise.resolve(false);
    }
  }

  /* ------------------------------------------------------------ §8 API */

  analyse() {
    let items = [];
    try {
      items = runRules(this.project, { mc: this.mc() });
    } catch (err) {
      items = [{ id: 'error', severity: 'info', title: 'Analysis unavailable', why: `The rule engine could not read the project (${err && err.message ? err.message : err}).`, recommendation: 'Try again after the next simulated day.', impact: null }];
    }
    return items.map((x) => ({ ...x, action: x.action ? this.wrapAction(x.action) : undefined }));
  }

  headline() {
    return headline(this.project, readState(this.project, { mc: this.mc() }));
  }

  context() {
    let coaching = [];
    try {
      const g = this.sim && this.sim.game;
      coaching = g && typeof g.coaching === 'function' ? g.coaching() || [] : [];
    } catch {
      coaching = [];
    }
    return makeContext(this.project, { mc: this.mc(), status: this.status, coaching, lastQuiz: this.lastQuiz, canRunMonteCarlo: true, ruleCount: RULE_IDS.length });
  }

  /** Offline answer (never throws). */
  answerOffline(text) {
    const r = respond(text, this.context());
    return { ...r, actions: (r.actions || []).map((a) => this.wrapAction(a)).filter(Boolean), engine: 'offline' };
  }

  /**
   * ask(text, { onDelta }) → Promise<{ text, items?, actions?, engine, intent?, suggestions, report? }>
   * Live when configured and reachable; otherwise (or on any error) offline.
   */
  async ask(text, { onDelta, onTool } = {}) {
    const q = String(text || '').trim();
    if (!q) return { text: 'Ask me anything about the project — or try one of the suggestions.', engine: 'offline', actions: [], suggestions: DEFAULT_SUGGESTIONS };
    const prior = this.history.slice(-8);
    this.history.push({ role: 'user', text: q });
    let out = null;
    const wantLive = this._setting('ai.engine') === 'live' && hasKey();
    if (wantLive && this.live.available()) {
      try {
        const r = await this.live.ask(prior, q, { onDelta, onTool });
        this._failed = false;
        this.lastError = '';
        out = { text: r.text, engine: 'live', actions: [], tools: r.tools, suggestions: suggestionsFor(readState(this.project), null) };
      } catch (err) {
        this._failed = true;
        this.lastError = err && err.message ? err.message : 'request failed';
      }
    } else if (wantLive) {
      this._failed = true;
      this.lastError = 'offline';
    }
    if (!out) {
      out = this.answerOffline(q);
      if (wantLive) out.note = `Live mode unavailable (${this.lastError}) — answered by the offline rule engine.`;
    }
    this.history.push({ role: 'assistant', text: out.text });
    if (this.history.length > 40) this.history.splice(0, this.history.length - 40);
    return out;
  }

  standup() {
    return standupText(this.project, readState(this.project, { mc: this.mc() }));
  }

  statusReport() {
    return buildReport(this.project, readState(this.project, { mc: this.mc() }));
  }

  exportReport() {
    const r = this.statusReport();
    const day = this.project.day || 0;
    if (this.sim && this.sim.download) this.sim.download(`HDD_status_report_day${day}.md`, 'text/markdown', r.markdown);
    return r;
  }

  explain(term) {
    const e = best(term, 30);
    if (e) return describe(e);
    const near = search(term, 3).map((h) => h.entry.term);
    return `"${term}" is not in the glossary.${near.length ? ` Closest: ${near.join(', ')}.` : ''}`;
  }

  /** Quiz tutoring hook: ai.tutor({ question, chosen, correct, explanation, options? }). */
  tutor(q = {}) {
    this.lastQuiz = q;
    return tutorText(q, (t) => best(t, 40));
  }

  riskResponses() {
    return buildRiskResponses(this.project, readState(this.project)).map((r) => ({
      ...r,
      action: r.current !== r.recommended ? this.wrapAction({ kind: 'risk', label: `${r.recommended} ${r.id}`, args: { riskId: r.id, strategy: r.recommended }, detail: `Set the response for ${r.id} (${r.title}) to ${r.recommended}.` }) : undefined,
    }));
  }

  changeImpact(crId) {
    return buildChangeImpact(this.project, crId);
  }

  draftStakeholderMessage(stakeholderId) {
    return stakeholderMessage(this.project, stakeholderId);
  }

  /** Coaching for a mission object (or the active missions when omitted). */
  coach(mission) {
    if (mission && Array.isArray(mission.objectives)) {
      const lines = [`**${mission.name}**${mission.brief ? ` — ${mission.brief}` : ''}`];
      for (const o of mission.objectives) lines.push(`- ${o.done ? '✓' : '○'} ${o.text}`);
      const open = mission.objectives.find((o) => !o.done);
      if (open) {
        const e = best(open.text, 45);
        if (e) lines.push('', `Concept to apply: ${describe(e)}`);
      }
      if (mission.hints && mission.hints.length) lines.push('', `Hint: ${mission.hints[0]}`);
      return lines.join('\n');
    }
    return respond('coach me on my mission', this.context()).text;
  }

  glossarySize() {
    return glossarySize();
  }

  intentCount() {
    return intentCount();
  }

  /* ------------------------------------------------------------ live-mode tools */

  async _runTool(name, input = {}) {
    const p = this.project;
    switch (name) {
      case 'get_snapshot':
        return compactSnapshot(p, readState(p, { mc: this.mc() }));
      case 'get_critical_path': {
        const ft = new Map(floatTable(p).map((r) => [r.id, r.float]));
        return criticalPath(p).map((c) => ({ code: c.code, name: c.name, pct: Math.round(c.pct * 1000) / 1000, totalFloat: ft.has(c.id) ? ft.get(c.id) : c.float, blocked: c.blocked || null }));
      }
      case 'run_monte_carlo': {
        const n = Math.max(1000, Math.min(10000, Math.round(Number(input.iterations) || 5000)));
        const r = await this.runMonteCarlo(n);
        if (!r) return 'Monte Carlo is not available in this build — not in the data.';
        return { iterations: r.iterations, day: r.day, finish: { p10: r.finish.p10, p50: r.finish.p50, p80: r.finish.p80, p90: r.finish.p90 }, probabilityOnTime: r.probabilityOnTime, probabilityOnBudget: r.probabilityOnBudget, cost: r.cost ? { p50: r.cost.p50, p80: r.cost.p80 } : null, tornado: (r.tornado || []).slice(0, 5).map((t) => ({ code: t.code || t.id, correlation: t.correlation })) };
      }
      case 'propose_change_request': {
        const title = String(input.title || '').slice(0, 120) || 'Change proposed by MEHRAN';
        const description = String(input.description || '').slice(0, 800);
        const impact = {};
        if (Number.isFinite(Number(input.days))) impact.days = Number(input.days);
        if (Number.isFinite(Number(input.cost))) impact.cost = Number(input.cost);
        let result = null;
        const action = { kind: 'raiseChange', label: `Raise change request "${title}"`, args: { title, description, raisedBy: 'MEHRAN (live AI) on behalf of the PM', impact: Object.keys(impact).length ? impact : undefined } };
        const sim = this.sim || {};
        if (typeof sim.requestApproval !== 'function') return 'No approval channel is available, so nothing was changed.';
        await sim.requestApproval({
          title: 'MEHRAN (live) proposes a change request',
          detail: `${title}\n\n${description}${impact.days !== undefined ? `\nSchedule impact: ${impact.days} days` : ''}${impact.cost !== undefined ? `\nCost impact: PKR ${Math.round(impact.cost).toLocaleString('en-US')}` : ''}\n\nApproving only RAISES the request; the CCB still decides.`,
          onApprove: () => { result = executeAction(p, action); },
        });
        if (!result) return 'The user declined. Nothing was changed.';
        if (sim.toast) sim.toast(result.ok ? `Change request raised: ${title}` : `Not raised: ${result.message}`, result.ok ? 'good' : 'warn');
        return result.ok ? `Raised as ${(result.result && result.result.id) || 'a new change request'} with status Raised.` : `The engine refused: ${result.message}`;
      }
      case 'draft_status_report':
        return this.statusReport().markdown;
      case 'explain_term':
        return this.explain(String(input.term || ''));
      case 'get_advice':
        return runRules(p, { mc: this.mc() }).map((a) => ({ severity: a.severity, title: a.title, why: a.why, recommendation: a.recommendation, impact: a.impact || null }));
      default:
        return `Unknown tool ${name}.`;
    }
  }

  dispose() {
    for (const off of this._offs) if (typeof off === 'function') off();
    this._offs = [];
    this.voice.dispose();
    this.live.cancel();
  }
}
