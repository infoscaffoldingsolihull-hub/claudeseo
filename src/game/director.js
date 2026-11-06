import { DECISIONS, DecisionScheduler, difficultyOf, scaleEffects, resolveEffects, describeTradeoff } from './decisions.js';
import { instantiateMissions, evaluateMissions, projectContext, createTrack, coachingHints, TRACK_WINDOWS, wbsPct } from './missions.js';
import { BADGES, XP, levelFor, newBadges, computeScorecard, scoreFor, certificateData, readLeaderboard, submitLeaderboard } from './scoring.js';

/**
 * Auto-decide weights — difficulty-neutral and transparent: an option's score is
 * the weighted sum of its trade-off chips (−2..+2, + favourable). Safety counts a
 * little more; an unethical option takes a flat penalty.
 */
export const AUTO_WEIGHTS = { time: 1, cost: 1, quality: 1, risk: 1, stakeholders: 1, safety: 1.25, scope: 1 };
export const ETHICS_PENALTY = 3;
/** No decision fires before this project day (the opening seconds stay calm). */
export const DECISION_GRACE_DAYS = 20;

export function scoreOption(option) {
  const t = (option && option.tradeoff) || {};
  let s = 0;
  for (const [k, v] of Object.entries(t)) if (typeof v === 'number' && Number.isFinite(v)) s += (AUTO_WEIGHTS[k] === undefined ? 1 : AUTO_WEIGHTS[k]) * v;
  if (option && option.ethics === false) s -= ETHICS_PENALTY;
  return Math.round(s * 100) / 100;
}

/** Index of the best option: highest chip score; ties go to the lower cost/time impact, then the first listed. */
export function bestOptionIndex(event) {
  const opts = (event && Array.isArray(event.options) ? event.options : []);
  if (!opts.length) return 0;
  const impact = (o) => {
    const t = o.tradeoff || {};
    const e = o.effects || {};
    return { chips: (Number(t.cost) || 0) + (Number(t.time) || 0), size: Math.abs(Number(e.cost) || 0) / 1e8 + Math.abs(Number(e.days) || 0) };
  };
  let best = 0;
  for (let i = 1; i < opts.length; i++) {
    const a = scoreOption(opts[i]);
    const b = scoreOption(opts[best]);
    if (a > b) { best = i; continue; }
    if (a < b) continue;
    const ia = impact(opts[i]);
    const ib = impact(opts[best]);
    if (ia.chips > ib.chips || (ia.chips === ib.chips && ia.size < ib.size)) best = i;
  }
  return best;
}

/**
 * GameDirector — missions, decision cards, XP, badges, score (docs/ARCHITECTURE.md §9, §11).
 *
 * Constructed BEFORE the HUD exists, so the constructor never touches `sim.hud`.
 * No DOM: every UI effect goes through `sim.hud`, `sim.toast`, `sim.confetti`, `sim.shake`.
 * Works with a minimal mock `sim` under node (see tests/pm/game.test.js).
 */
export class GameDirector {
  constructor(sim) {
    this.sim = sim;
    this.decisions = DECISIONS;
    this.badgeDefs = BADGES;
    this._offs = [];
    this.reset();
    this._subscribe();
  }

  get project() {
    return this.sim && this.sim.project;
  }

  _seed() {
    const p = this.project || {};
    const fromUrl = this.sim && this.sim.params && this.sim.params.seed;
    return Number(fromUrl !== undefined && fromUrl !== null ? fromUrl : p.seed !== undefined ? p.seed : 20270104) >>> 0;
  }

  get difficulty() {
    const p = this.project || {};
    return p.difficulty || (this.sim && this.sim.params && this.sim.params.difficulty) || 'professional';
  }

  /** Fresh game state for a new project (main.js calls this from newProject()). */
  reset() {
    this.missions = instantiateMissions();
    this.track = createTrack();
    this.xp = 0;
    this.badges = [];
    this.history = [];
    this.active = null;
    this.pending = null;
    this.scheduler = new DecisionScheduler({ seed: this._seed(), difficulty: this.difficulty });
    this._lastCheck = 0;
    this._lastEvalDay = -1;
    this._refreshLevel();
  }

  _refreshLevel() {
    const l = levelFor(this.xp);
    this.level = l.level;
    this.levelName = l.name;
    this.levelInfo = l;
  }

  get score() {
    return scoreFor(this.xp, this._cardCache || null);
  }

  /* -------------------------------------------------------------- bus */

  _subscribe() {
    const bus = this.sim && this.sim.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (evt, fn) => this._offs.push(bus.on(evt, fn));
    on('quiz:completed', (e) => this._onQuiz(e || {}));
    on('project:milestone', (e) => {
      this.track.milestones++;
      this.gainXp(XP.milestone, `Milestone: ${(e && e.name) || 'reached'}`);
      this._call('confetti');
      this._toast(`Milestone — ${(e && e.name) || 'reached'}`, 'good');
      this._evaluate(true);
    });
    on('risk:occurred', (e) => {
      const r = (e && e.risk) || {};
      this.track.risksOccurred++;
      const day = (this.project && this.project.day) || 0;
      this.track.recentRisks.push({ day, title: `${r.title || ''} ${r.detail || ''}` });
      if (this.track.recentRisks.length > 12) this.track.recentRisks.shift();
      this._call('shake', 0.5);
    });
    on('poi:inspected', () => {
      this.track.poi++;
      this.gainXp(XP.poi, 'Site inspection');
      this._evaluate(true);
    });
    on('change:decided', (e) => {
      const c = (e && e.change) || {};
      this.track.changesDecided++;
      if (c.status === 'Rejected') this.track.changesRejected++;
      this.gainXp(XP.changeDecided, `CCB decision ${c.id || ''}`.trim());
      this._evaluate(true);
    });
    on('panel:opened', (e) => {
      const id = e && e.id;
      if (id && !this.track.panels.includes(id)) {
        this.track.panels.push(id);
        this._evaluate(true);
      }
    });
    on('mode:changed', (e) => {
      if (e && e.mode === 'ops') { this.track.opsVisited = true; this._evaluate(true); }
    });
    on('tour:beat', (e) => {
      if (e && e.beat && e.beat.id === 'control-view') this.track.tourControlView = true;
    });
    on('project:log', (e) => {
      const entry = e && e.entry;
      if (entry && /lesson/i.test(`${entry.kind} ${entry.title}`)) this.track.lessonsLogged++;
      if (entry && entry.kind !== 'milestone' && /\bG\d\b|gate/i.test(entry.title || '') && /approv/i.test(entry.title || '')) {
        this.gainXp(XP.gateApproved, entry.title);
        this._evaluate(true);
      }
    });
  }

  _onQuiz(e) {
    const id = e.setId || 'quiz';
    const score = Number(e.score) || 0;
    const total = Number(e.total) || 0;
    const prev = this.track.quiz[id];
    if (!prev || score > prev.best) this.track.quiz[id] = { best: score, total, byClo: e.byClo || null };
    this.gainXp(score * XP.quizPerCorrect, `Quiz ${id}: ${score}/${total}`);
    this._evaluate(true);
  }

  /* ------------------------------------------------------------ juice */

  _call(name, ...args) {
    const s = this.sim;
    if (s && typeof s[name] === 'function') {
      try { s[name](...args); } catch { /* cosmetic */ }
    }
  }

  _toast(text, kind = '') {
    this._call('toast', text, kind);
  }

  _emit(evt, payload) {
    const bus = this.sim && this.sim.bus;
    if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
  }

  gainXp(amount, reason = '') {
    const mult = difficultyOf(this.difficulty).xp;
    const a = Math.round((Number(amount) || 0) * mult);
    if (a <= 0) return 0;
    const before = this.level;
    this.xp += a;
    this._refreshLevel();
    this._emit('xp:gained', { amount: a, reason, total: this.xp, level: this.level, levelName: this.levelName });
    if (this.level > before) {
      this._toast(`Promoted to ${this.levelName}!`, 'good');
      this._call('confetti');
    }
    return a;
  }

  /* -------------------------------------------------------- the loop */

  context() {
    return projectContext(this.project, this);
  }

  /** Called by main.js after every project.step(). */
  onDay(day) {
    const p = this.project;
    if (!p) return;
    const ctx = this.context();
    this._track(ctx);
    this._evaluate(false, ctx);
    if (this.active || this.pending) return;
    // Keep the opening calm: no decision in the first weeks, and a blocking card
    // never appears before the player has touched the game.
    if (ctx.day < DECISION_GRACE_DAYS) return day;
    if (!this.autoDecide && this.sim && this.sim.userInteracted === false) return day;
    const ev = this.scheduler.next({ day: ctx.day, phase: ctx.phase, pct: ctx.pct, weather: ctx.weather, recentRisks: this.track.recentRisks.filter((r) => ctx.day - r.day <= 20).map((r) => r.title) });
    if (ev) this._queue(ev);
    return day;
  }

  _track(ctx) {
    const t = this.track;
    for (const id of TRACK_WINDOWS) {
      const v = ctx.pct(id);
      if (v > 0 && v < 0.999) {
        t.minSpi[id] = Math.min(t.minSpi[id] === undefined ? Infinity : t.minSpi[id], ctx.spi);
        t.minSat[id] = Math.min(t.minSat[id] === undefined ? Infinity : t.minSat[id], ctx.satisfaction);
      }
    }
    if (ctx.weather && ctx.weather !== 'clear') t.weatherSeen[ctx.weather] = (t.weatherSeen[ctx.weather] || 0) + 1;
    t.minSafety = Math.min(t.minSafety, ctx.safety);
    if (ctx.day % 14 === 0 && (!t.riskSeries.length || t.riskSeries[t.riskSeries.length - 1].day !== ctx.day)) {
      t.riskSeries.push({ day: ctx.day, exposure: ctx.riskExposure });
      if (t.riskSeries.length > 120) t.riskSeries.splice(1, 1);
    }
  }

  _evaluate(force = false, ctxIn = null) {
    const ctx = ctxIn || this.context();
    if (!force && ctx.day === this._lastEvalDay) return;
    this._lastEvalDay = ctx.day;
    const changed = evaluateMissions(this.missions, ctx);
    for (const m of changed) {
      if (m.status === 'completed') {
        this.gainXp(m.xp, `Mission ${m.id}: ${m.name}`);
        this._emit('mission:completed', { mission: m });
        this._toast(`Mission complete — ${m.name} (+${m.xp} XP)`, 'good');
        this._call('confetti');
      } else if (m.status === 'failed') {
        this._emit('mission:failed', { mission: m });
        this._toast(`Mission failed — ${m.name}. ${m.hints[m.hints.length - 1]}`, 'bad');
      }
    }
    const earned = newBadges({ ...ctx, missionsCompleted: this.missions.filter((m) => m.status === 'completed').length }, this.badges.map((b) => b.id));
    for (const b of earned) {
      const badge = { id: b.id, name: b.name, icon: b.icon, clo: b.clo, text: b.text, day: ctx.day };
      this.badges.push(badge);
      this._emit('badge:earned', { badge });
      this._toast(`Badge earned — ${b.name}`, 'good');
      this.gainXp(XP.badge, `Badge: ${b.name}`);
    }
  }

  /** Per-frame: show queued cards when the HUD can take them; re-check UI-driven objectives. */
  update(dt = 0) {
    this._lastCheck += dt;
    if (this._lastCheck > 1.5) {
      this._lastCheck = 0;
      if (this.project) this._evaluate(true);
    }
    if (this.pending && !this.active) this._showPending();
  }

  /* -------------------------------------------------------- decisions */

  /** `game.autoDecide` setting (default on in DEFAULT_SETTINGS; a sim without settings asks). */
  get autoDecide() {
    const st = this.sim && this.sim.settings;
    if (!st || typeof st.get !== 'function') return false;
    const v = st.get('game.autoDecide');
    return v === undefined ? false : !!v;
  }

  setAutoDecide(on) {
    const st = this.sim && this.sim.settings;
    if (st && typeof st.set === 'function') st.set('game.autoDecide', !!on);
    return this.autoDecide;
  }

  _queue(event) {
    this.pending = event;
    this._showPending();
  }

  /** Pick and apply the best option without showing a card. */
  _autoDecide(event) {
    this.pending = null;
    this.active = event;
    const day = (this.project && this.project.day) || 0;
    this._emit('decision:shown', { event, option: null, day, auto: true });
    return this.resolve(event.id, bestOptionIndex(event), { auto: true });
  }

  _showPending(force = false) {
    const sim = this.sim || {};
    if (!this.pending || this.active) return;
    if (!force && this.autoDecide) { this._autoDecide(this.pending); return; }
    if (sim.mode === 'tour' || sim.previewing) return;
    const hud = sim.hud;
    if (hud && typeof hud.blocking === 'function' && hud.blocking()) return;
    const event = this.pending;
    this.pending = null;
    this.active = event;
    const day = (this.project && this.project.day) || 0;
    this._emit('decision:shown', { event, option: null, day });
    if (hud && typeof hud.showDecision === 'function') {
      hud.showDecision(this.present(event), (i) => this.resolve(event.id, i));
    }
  }

  /** Card data for the HUD: the event plus plain-language trade-off summaries. */
  present(event) {
    const best = bestOptionIndex(event);
    return {
      ...event,
      difficulty: this.difficulty,
      bestIndex: best,
      options: event.options.map((o, i) => ({ ...o, summary: describeTradeoff(o.tradeoff), autoScore: scoreOption(o), best: i === best })),
    };
  }

  /** Force a card (QA hook `__hdd.triggerDecision(id?)`). Returns the event or null. */
  trigger(id) {
    let ev = null;
    if (id) ev = this.decisions.find((d) => d.id === id) || null;
    else {
      const shown = new Set(this.scheduler.shown);
      ev = this.decisions.find((d) => !shown.has(d.id)) || this.decisions[0];
    }
    if (!ev) return null;
    if (this.active) this.resolve(this.active.id, 0);
    this.scheduler.mark(ev, (this.project && this.project.day) || 0);
    this.pending = ev;
    this._showPending(true);
    if (!this.active) { this.active = ev; this.pending = null; }
    return ev;
  }

  /** Apply the chosen option. Returns the resolution record or null. */
  resolve(eventId, optionIndex = 0, { auto = false } = {}) {
    const ev = this.active && this.active.id === eventId ? this.active : null;
    if (!ev) return null;
    const i = Math.max(0, Math.min(ev.options.length - 1, Number(optionIndex) || 0));
    const option = ev.options[i];
    this.active = null;
    const p = this.project;
    const strength = difficultyOf(this.difficulty).strength;
    const effects = resolveEffects(scaleEffects(option.effects || {}, strength), p);
    if (p && typeof p.applyEffect === 'function') {
      try { p.applyEffect(effects, `${ev.id} ${ev.title}`); } catch (err) { /* engine rejected the effect: keep the game going */ }
    }
    if (option.ethics === true) this.track.ethics = this.track.ethics === false ? false : true;
    if (option.ethics === false) this.track.ethics = false;
    this.track.decisions++;
    if ((option.score || 0) >= 3) this.track.goodDecisions++;
    const day = (p && p.day) || 0;
    const record = { id: ev.id, title: ev.title, option: i, label: option.label, outcome: option.outcome, score: option.score || 0, day, clo: ev.clo, week: ev.week, auto: !!auto };
    this.history.push(record);
    this.gainXp(XP.decisionBase + (option.score || 0) * XP.decisionPerScore, `Decision ${ev.id}`);
    const kind = (option.score || 0) >= 3 ? 'good' : (option.score || 0) === 0 ? 'bad' : '';
    const hud = this.sim && this.sim.hud;
    if (auto) {
      // One small, non-blocking notice per decision (the HUD throttles them at high speed).
      if (hud && typeof hud.notifyAutoDecision === 'function') {
        try { hud.notifyAutoDecision(record); } catch { /* cosmetic */ }
      } else this._toast(`Auto-decided: ${ev.title} → ${option.label}`, kind === 'bad' ? 'warn' : kind);
    } else {
      this._toast(option.outcome, kind);
      if (kind === 'bad') this._call('shake', 0.35);
    }
    this._emit('decision:resolved', { event: ev, option: { ...option, index: i }, effects, record, auto: !!auto });
    if (!auto && hud && typeof hud.closeCards === 'function') {
      try { hud.closeCards(); } catch { /* already closed */ }
    }
    this._evaluate(true);
    return record;
  }

  resolveActive(i = 0) {
    if (!this.active && this.pending) { this.active = this.pending; this.pending = null; }
    return this.active ? this.resolve(this.active.id, i) : null;
  }

  /** Apply the best-scoring option to the active (or pending) decision. */
  resolveBest() {
    if (!this.active && this.pending) { this.active = this.pending; this.pending = null; }
    return this.active ? this.resolve(this.active.id, bestOptionIndex(this.active)) : null;
  }

  /** QA: picks option 0. */
  autoResolve() {
    return this.resolveActive(0);
  }

  /* ---------------------------------------------------------- scoring */

  scorecard() {
    const card = computeScorecard(this.context());
    this._cardCache = card;
    return card;
  }

  coaching() {
    return coachingHints(this.missions);
  }

  certificate() {
    const sim = this.sim || {};
    const name = sim.settings && typeof sim.settings.get === 'function' ? sim.settings.get('studentName') : '';
    return certificateData({ name, card: this.scorecard(), level: this.levelInfo, badges: this.badges, project: this.project || {}, xp: this.xp });
  }

  leaderboard() {
    return readLeaderboard();
  }

  submitScore(name) {
    const card = this.scorecard();
    const p = this.project || {};
    const sim = this.sim || {};
    const n = name || (sim.settings && typeof sim.settings.get === 'function' ? sim.settings.get('studentName') : '') || 'Anonymous PM';
    return submitLeaderboard({ name: n, score: this.score, grade: card.grade, xp: this.xp, level: this.levelName, seed: p.seed, difficulty: p.difficulty, day: p.day });
  }

  /** Coaching / status helpers for MEHRAN and panels. */
  summary() {
    return {
      xp: this.xp, level: this.level, levelName: this.levelName, levelInfo: this.levelInfo,
      badges: this.badges.length, badgeTotal: BADGES.length,
      missionsCompleted: this.missions.filter((m) => m.status === 'completed').length, missionTotal: this.missions.length,
      decisionsResolved: this.track.decisions, active: this.active ? this.active.id : null,
    };
  }

  pct(id) {
    return wbsPct(this.project, id);
  }

  /* -------------------------------------------------------- save/load */

  serialise() {
    return {
      version: 1,
      xp: this.xp,
      badges: this.badges.map((b) => ({ ...b })),
      history: this.history.map((h) => ({ ...h })),
      track: JSON.parse(JSON.stringify(this.track, (k, v) => (v === Infinity ? null : v))),
      missions: this.missions.map((m) => ({ id: m.id, status: m.status, completedDay: m.completedDay, done: m.objectives.map((o) => o.done) })),
      scheduler: this.scheduler.serialise(),
      active: this.active ? this.active.id : this.pending ? this.pending.id : null,
    };
  }

  restore(data) {
    if (!data || data.version !== 1) return false;
    this.reset();
    this.xp = Number(data.xp) || 0;
    this.badges = Array.isArray(data.badges) ? data.badges : [];
    this.history = Array.isArray(data.history) ? data.history : [];
    this.track = { ...createTrack(), ...(data.track || {}) };
    for (const s of data.missions || []) {
      const m = this.missions.find((x) => x.id === s.id);
      if (!m) continue;
      m.status = s.status;
      m.completedDay = s.completedDay;
      (s.done || []).forEach((d, i) => { if (m.objectives[i]) m.objectives[i].done = !!d; });
    }
    this.scheduler.restore(data.scheduler);
    if (data.active) this.pending = this.decisions.find((d) => d.id === data.active) || null;
    this._refreshLevel();
    return true;
  }

  dispose() {
    for (const off of this._offs) if (typeof off === 'function') off();
    this._offs = [];
  }
}
