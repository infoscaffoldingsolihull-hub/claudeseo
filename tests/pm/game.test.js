import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, PHASES, instantiateMissions, evaluateMissions, projectContext, createTrack } from '../../src/game/missions.js';
import { DECISIONS, DecisionScheduler, createRng, scaleEffects, resolveEffects, triggerMatches } from '../../src/game/decisions.js';
import { LEVELS, BADGES, levelFor, gradeFor, computeScorecard, certificateData, submitLeaderboard, readLeaderboard } from '../../src/game/scoring.js';
import { GameDirector } from '../../src/game/director.js';
import { TOUR_BEATS, TourDirector } from '../../src/ui/tour.js';
import QUIZ from '../../src/data/quiz.json' with { type: 'json' };
import COURSE from '../../src/data/course.json' with { type: 'json' };

const PANEL_IDS = ['course', 'foundations', 'lifecycle', 'charter', 'approach', 'agile', 'aipm', 'scope', 'schedule', 'control', 'quality',
  'cost', 'risk', 'forecast', 'procurement', 'team', 'stakeholders', 'msproject', 'closing', 'cases', 'assess', 'present', 'missions',
  'operations', 'session'];
const CLOS = ['CLO1', 'CLO2', 'CLO3'];
const TRADEOFF_KEYS = ['time', 'cost', 'quality', 'risk', 'stakeholders', 'safety', 'scope'];

/* --------------------------------------------------------------- mocks */

/** A tiny deterministic project that walks through the lifecycle. */
class MockProject {
  constructor(seed = 1) {
    this.seed = seed;
    this.difficulty = 'professional';
    this.day = 0;
    this.finished = false;
    this.phase = 'initiating';
    this.tasks = ['2.3', '3.2', '3.3', '3.4', '3.5', '3.6', '4.3', '5.3', '6.4', '7.2', '7.3', '7.4', '7.5', '7.7', '8.1', '8.5', '8.7', '9.1', '10.1', '11.5', '12.2', '12.4']
      .map((id, i) => ({ id, summaryId: id.split('.')[0], budget: 100 + i, start: 20 + i * 18, length: 120 }));
    this.state = new Map(this.tasks.map((t) => [t.id, { pct: 0 }]));
    this.gates = [{ id: 'G0', phase: 'initiating', status: 'pending' }, { id: 'G1', phase: 'planning', status: 'pending' }];
    this.risks = [{ id: 'R01', title: 'Monsoon flooding of works', category: 'Environmental', weather: 'rain' }, { id: 'R02', title: 'Currency devaluation', category: 'Commercial' }];
    this.stakeholders = [{ id: 'S01', role: 'Encroached community', group: 'Community', satisfaction: 0.6 }, { id: 'S02', role: 'Airline (fictional)', group: 'Customer', satisfaction: 0.7 }];
    this.procurement = [];
    this.changes = [];
    this.weather = { kind: 'clear', intensity: 0 };
    this.applied = [];
    this.spi = 1;
  }
  step() {
    this.day++;
    const d = this.day;
    this.phase = d < 30 ? 'initiating' : d < 80 ? 'planning' : d < 700 ? 'executing' : 'closing';
    if (d === 25) this.gates[0].status = 'approved';
    for (const t of this.tasks) this.state.get(t.id).pct = Math.max(0, Math.min(1, (d - t.start) / t.length));
    const doy = (d + 3) % 365;
    this.weather = { kind: doy > 190 && doy < 230 && d % 3 === 0 ? 'rain' : doy > 130 && doy < 170 && d % 4 === 0 ? 'heat' : 'clear', intensity: 0.6 };
    this.spi = 0.97 + 0.02 * Math.sin(d / 40);
    if (d >= 760) this.finished = true;
  }
  snapshot() {
    return { day: this.day, phase: this.phase, progress: Math.min(1, this.day / 760), spi: this.spi, cpi: 0.98, qualityIndex: 0.93, safety: 0.96, welfare: 0.85, stakeholderSatisfaction: 0.68, riskExposure: 1e9 * (1 - this.day / 1000), finished: this.finished };
  }
  applyEffect(effects, source) {
    this.applied.push({ effects, source });
  }
}

function mockSim(project) {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, new Set()); handlers.get(evt).add(fn); return () => handlers.get(evt).delete(fn); },
    emit(evt, payload) { emitted.push({ evt, payload }); for (const fn of handlers.get(evt) || []) fn(payload); },
  };
  const cards = [];
  return {
    bus, emitted, cards, project, params: {}, mode: 'manager',
    settings: { get: (k) => (k === 'studentName' ? 'Test Student' : undefined) },
    toast() {}, confetti() {}, shake() {},
    hud: { showDecision(ev, cb) { cards.push({ ev, cb }); }, blocking: () => false, closeCards() {} },
  };
}

/* --------------------------------------------------------------- content */

test('missions: at least 12, every phase covered, objectives have checks', () => {
  assert.ok(MISSIONS.length >= 12, `missions = ${MISSIONS.length}`);
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length);
  for (const phase of PHASES) assert.ok(MISSIONS.some((m) => m.phase === phase), `no mission for ${phase}`);
  for (const m of MISSIONS) {
    assert.ok(m.name && m.brief && m.xp > 0 && m.hints.length >= 1, m.id);
    assert.ok(m.clo.every((c) => CLOS.includes(c)), m.id);
    assert.ok(m.objectives.length >= 2, m.id);
    for (const o of m.objectives) assert.equal(typeof o.check, 'function');
  }
});

test('missions: checks never throw on an empty project', () => {
  const ctx = projectContext({}, { track: createTrack(), missions: [] });
  const ms = instantiateMissions();
  assert.doesNotThrow(() => evaluateMissions(ms, ctx));
  assert.ok(ms.some((m) => m.status === 'active'));
});

test('decisions: at least 30, each with 2–4 options and valid trade-off chips', () => {
  assert.ok(DECISIONS.length >= 30, `decisions = ${DECISIONS.length}`);
  assert.equal(new Set(DECISIONS.map((d) => d.id)).size, DECISIONS.length);
  for (const d of DECISIONS) {
    assert.ok(d.options.length >= 2 && d.options.length <= 4, d.id);
    assert.ok(CLOS.includes(d.clo), d.id);
    assert.ok(d.week >= 1 && d.week <= 15, d.id);
    assert.ok(d.title && d.text && d.lesson && d.trigger, d.id);
    for (const o of d.options) {
      assert.ok(o.label && o.outcome && typeof o.effects === 'object', d.id);
      for (const [k, v] of Object.entries(o.tradeoff)) {
        assert.ok(TRADEOFF_KEYS.includes(k), `${d.id} tradeoff key ${k}`);
        assert.ok(Number.isInteger(v) && v >= -2 && v <= 2, `${d.id} ${k}=${v}`);
      }
    }
  }
});

test('decisions: deterministic sequence for a fixed seed, different for another seed', () => {
  const run = (seed, difficulty = 'professional') => {
    const p = new MockProject(seed);
    const s = new DecisionScheduler({ seed, difficulty });
    const seq = [];
    for (let i = 0; i < 760; i++) {
      p.step();
      const ctx = projectContext(p, { track: createTrack() });
      const ev = s.next({ day: ctx.day, phase: ctx.phase, pct: ctx.pct, weather: ctx.weather, recentRisks: [] });
      if (ev) seq.push(`${ctx.day}:${ev.id}`);
    }
    return seq;
  };
  const a = run(20270104);
  const b = run(20270104);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 8, `only ${a.length} cards fired`);
  assert.notDeepEqual(run(42), a);
  assert.ok(run(20270104, 'crisis').length > run(20270104, 'trainee').length, 'crisis should fire more cards than trainee');
});

test('decisions: rng is serialisable and scheduler restores', () => {
  const r = createRng(7);
  r(); r();
  const st = r.getState();
  const x = r();
  r.setState(st);
  assert.equal(r(), x);
  const s = new DecisionScheduler({ seed: 5 });
  s.mark(DECISIONS[0], 10);
  const s2 = new DecisionScheduler({ seed: 5 });
  s2.restore(s.serialise());
  assert.deepEqual(s2.shown, s.shown);
  assert.equal(s2.lastDay, 10);
});

test('decisions: effects scale with difficulty and resolve register ids', () => {
  const e = scaleEffects({ days: 10, cost: 100, quality: 0.05, safety: -0.02 }, 1.5);
  assert.equal(e.days, 15);
  assert.equal(e.cost, 150);
  assert.equal(e.quality, 0.05);
  assert.ok(Math.abs(e.safety + 0.03) < 1e-9);
  const p = new MockProject();
  const r = resolveEffects({ risk: { find: ['flood'], dp: -0.1 }, stakeholder: { find: ['communit'], d: 0.2 } }, p);
  assert.deepEqual(r.risk, { id: 'R01', dp: -0.1 });
  assert.deepEqual(r.stakeholder, { id: 'S01', d: 0.2 });
  const miss = resolveEffects({ stakeholder: { find: ['nobody'], d: 0.2 } }, p);
  assert.equal(miss.stakeholder, undefined);
  assert.ok(miss.satisfaction > 0);
  assert.equal(triggerMatches({ trigger: { phase: ['executing'] } }, { day: 1, phase: 'planning' }), false);
});

test('quiz: ≥ 120 questions, ≥ 8 per week for 15 weeks, valid answers', () => {
  const qs = QUIZ.questions;
  assert.ok(qs.length >= 120, `quiz = ${qs.length}`);
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  for (let w = 1; w <= 15; w++) assert.ok(qs.filter((q) => q.week === w).length >= 8, `week ${w}`);
  for (const q of qs) {
    assert.ok(CLOS.includes(q.clo) && q.domain && q.q && q.explanation, q.id);
    if (q.type === 'mcq') {
      assert.ok(q.options.length >= 3 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id);
      assert.equal(new Set(q.options).size, q.options.length, q.id);
    } else if (q.type === 'tf') {
      assert.deepEqual(q.options, ['True', 'False']);
      assert.ok(q.answer === 0 || q.answer === 1, q.id);
    } else {
      assert.equal(q.type, 'numeric', q.id);
      assert.ok(Number.isFinite(q.answer) && q.tolerance >= 0, q.id);
    }
  }
  assert.ok(qs.filter((q) => q.type === 'numeric').length >= 30);
  const mcqAnswers = new Set(qs.filter((q) => q.type === 'mcq').map((q) => q.answer));
  assert.ok(mcqAnswers.size >= 4, 'correct options are spread across positions');
});

test('quiz: spot-check numeric answers', () => {
  const byQ = (frag) => QUIZ.questions.find((q) => q.q.includes(frag));
  assert.equal(byQ('O = 40, M = 55, P = 88').answer, (40 + 4 * 55 + 88) / 6);
  assert.ok(Math.abs(byQ('current CPI continues, what is the EAC').answer - 48 / 0.9) < 0.01);
  assert.equal(byQ('among 15 stakeholders').answer, (15 * 14) / 2);
  assert.ok(Math.abs(byQ('price 40 %, technical 30 %').answer - (0.4 * 8 + 0.3 * 7 + 0.2 * 9 + 0.1 * 6)) < 1e-9);
});

test('tour: ≥ 18 beats spanning Initiating → Closing with the required set pieces', () => {
  assert.ok(TOUR_BEATS.length >= 18);
  for (const b of TOUR_BEATS) {
    assert.ok(b.id && b.title && b.text && b.lesson && b.phase && b.clo.length, b.id);
    assert.equal(b.camera.position.length, 3);
    assert.equal(b.camera.target.length, 3);
    assert.ok(b.hour >= 0 && b.hour < 24 && b.duration > 5, b.id);
    assert.ok(b.progress >= 0 && b.progress <= 1, b.id);
  }
  for (const phase of ['initiating', 'planning', 'executing', 'monitoring', 'closing']) assert.ok(TOUR_BEATS.some((b) => b.phase === phase), phase);
  const ids = TOUR_BEATS.map((b) => b.id);
  for (const id of ['control-view', 'scrum-war-room', 'dust-storm', 'monsoon', 'benefits']) assert.ok(ids.includes(id), id);
  assert.ok(TOUR_BEATS.some((b) => b.hour >= 20), 'night beat');
  assert.ok(TOUR_BEATS.some((b) => b.weather === 'dust') && TOUR_BEATS.some((b) => b.weather === 'rain'));
});

test('tour: director drives the HUD, cinematic and restores on stop', () => {
  const calls = [];
  const sim = {
    hud: { setCinematic: (on) => calls.push(['cin', on]), showNarration: (n) => calls.push(['nar', n.title]), hideNarration: () => calls.push(['hide']), setTourProgress: (i, n) => calls.push(['prog', i, n]) },
    cinematic: { play: (k) => calls.push(['play', k.length]), stop: () => calls.push(['stop']) },
    world: { sky: { hour: 11, setHour(h) { this.hour = h; } }, weather: { state: { kind: 'clear', intensity: 0 }, set(k, i) { this.state = { kind: k, intensity: i }; } } },
    project: { weather: { kind: 'clear', intensity: 0 }, previewState: (p) => ({ p }) },
    previewProject: (s) => calls.push(['preview', s.p]),
    syncWorld: () => calls.push(['sync']),
    settings: { get: () => false },
    bus: { emit: (e, p) => calls.push([e, p.index]) },
    toast() {},
  };
  const tour = new TourDirector(sim);
  tour.start(0);
  assert.equal(tour.index, 0);
  tour.next();
  tour.previous();
  tour.goTo(7);
  assert.equal(sim.world.weather.state.kind, TOUR_BEATS[7].weather);
  tour.update(TOUR_BEATS[7].duration + 3);
  assert.equal(tour.index, 8, 'auto-advance');
  tour.stop();
  assert.equal(sim.world.sky.hour, 11);
  assert.ok(calls.some((c) => c[0] === 'sync'));
  assert.ok(calls.some((c) => c[0] === 'tour:beat'));
  assert.ok(calls.some((c) => c[0] === 'cin' && c[1] === false));
});

test('course map: 15 filled rows linked to panels, missions, quiz sets and tour beats', () => {
  assert.match(COURSE.derivedFrom, /replace with the official outline/);
  assert.equal(COURSE.weeks.length, 15);
  const missionIds = new Set(MISSIONS.map((m) => m.id));
  const beatIds = new Set(TOUR_BEATS.map((b) => b.id));
  for (const [i, r] of COURSE.weeks.entries()) {
    assert.equal(r.week, i + 1);
    assert.ok(r.topic && r.mechanic && r.domain && r.panels.length && r.missions.length && r.clo.length, `week ${r.week}`);
    for (const p of r.panels) assert.ok(PANEL_IDS.includes(p), `panel ${p}`);
    for (const m of r.missions) assert.ok(missionIds.has(m), `mission ${m}`);
    assert.ok(beatIds.has(r.tourBeat), `beat ${r.tourBeat}`);
    assert.ok(QUIZ.questions.some((q) => `W${String(q.week).padStart(2, '0')}` === r.quizSet), r.quizSet);
  }
  assert.equal(COURSE.clos.length, 3);
  for (const c of COURSE.clos) assert.ok(c.features.length >= 3, c.id);
  assert.equal(COURSE.objectives.length, 5);
  for (const o of COURSE.objectives) assert.ok(o.features.length >= 3, o.id);
});

/* ---------------------------------------------------------------- scoring */

test('scoring: six levels, ≥ 12 badges, grades', () => {
  assert.deepEqual(LEVELS.map((l) => l.name), ['Junior PM', 'Project Engineer', 'Project Manager', 'Senior PM', 'Programme Manager', 'Programme Director']);
  assert.equal(levelFor(0).name, 'Junior PM');
  assert.equal(levelFor(1e6).name, 'Programme Director');
  assert.ok(BADGES.length >= 12);
  assert.equal(gradeFor(95), 'A+');
  assert.equal(gradeFor(10), 'F');
});

test('scoring: scorecard maps to CLOs and certificate carries the student name', () => {
  const p = new MockProject();
  for (let i = 0; i < 400; i++) p.step();
  const game = { track: createTrack(), missions: instantiateMissions() };
  game.track.quiz.W05 = { best: 9, total: 10, byClo: { CLO2: [9, 10] } };
  const card = computeScorecard(projectContext(p, game));
  for (const k of ['spi', 'cpi', 'quality', 'safety', 'stakeholders', 'riskTrend', 'benefits', 'quiz', 'byClo', 'grade']) assert.ok(k in card, k);
  for (const c of CLOS) assert.ok(card.byClo[c] >= 0 && card.byClo[c] <= 100);
  const cert = certificateData({ name: 'Ayesha', card, level: levelFor(500) });
  assert.equal(cert.studentName, 'Ayesha');
  assert.equal(cert.grade, card.grade);
  const top = submitLeaderboard({ name: 'A', score: 10 });
  assert.ok(top.length >= 1 && readLeaderboard().length >= 1);
});

/* --------------------------------------------------------------- director */

test('director: plays a whole mock project, shows cards, applies effects, awards XP', () => {
  const p = new MockProject(20270104);
  const sim = mockSim(p);
  const game = new GameDirector(sim);
  assert.ok(game.missions.length >= 12 && game.decisions.length >= 30);
  sim.bus.emit('panel:opened', { id: 'charter' });
  sim.bus.emit('poi:inspected', { poi: { id: 'a' } });
  sim.bus.emit('poi:inspected', { poi: { id: 'b' } });
  for (let i = 0; i < 760; i++) {
    p.step();
    game.onDay(p.day);
    game.update(0.016);
    if (game.active) sim.cards[sim.cards.length - 1].cb(1);
  }
  assert.ok(sim.cards.length >= 8, `cards shown: ${sim.cards.length}`);
  assert.ok(p.applied.length === sim.cards.length);
  assert.ok(game.xp > 0 && game.level >= 2);
  assert.ok(game.missions.find((m) => m.id === 'M01').status === 'completed');
  const names = sim.emitted.map((e) => e.evt);
  for (const e of ['decision:shown', 'decision:resolved', 'xp:gained', 'mission:completed', 'badge:earned']) assert.ok(names.includes(e), e);
  const card = game.scorecard();
  assert.ok(card.grade);
  assert.equal(game.certificate().studentName, 'Test Student');
});

test('director: trigger / autoResolve / serialise / restore / reset', () => {
  const p = new MockProject();
  const sim = mockSim(p);
  const game = new GameDirector(sim);
  const ev = game.trigger('D13');
  assert.equal(ev.id, 'D13');
  assert.equal(game.active.id, 'D13');
  const rec = game.autoResolve();
  assert.equal(rec.option, 0);
  assert.equal(game.track.ethics, true);
  assert.ok(game.badges.some((b) => b.id === 'ethical-compass'));
  sim.bus.emit('quiz:completed', { setId: 'W05', score: 9, total: 10, byClo: { CLO2: [9, 10] } });
  game.trigger();
  const data = JSON.parse(JSON.stringify(game.serialise()));
  const g2 = new GameDirector(mockSim(p));
  assert.ok(g2.restore(data));
  assert.equal(g2.xp, game.xp);
  assert.equal(g2.badges.length, game.badges.length);
  assert.deepEqual(g2.scheduler.shown, game.scheduler.shown);
  assert.ok(g2.resolveActive(0));
  g2.reset();
  assert.equal(g2.xp, 0);
  assert.equal(g2.active, null);
});
