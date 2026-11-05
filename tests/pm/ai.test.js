/**
 * MEHRAN offline engine tests — rules, intents, glossary (node --test, no browser).
 * The mock project mirrors docs/ARCHITECTURE.md §5 so the AI is exercised against
 * the documented API even while the real engine evolves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, lookup, search, best, glossarySize, normalise } from '../../src/ai/glossary.js';
import { INTENTS, route, respond, makeContext, intentCount, fallback } from '../../src/ai/intents.js';
import {
  analyse, readState, executeAction, standupText, statusReport, riskResponses, changeImpact,
  stakeholderMessage, westernElectricCheck, tutorText, STATE_CHANGING, criticalPath, scheduleDriver,
} from '../../src/ai/rules.js';
import { parseSSE, buildSystemPrompt, TOOLS, compactSnapshot, LiveEngine, setKey, getKey, clearKey } from '../../src/ai/llm.js';

function mockProject() {
  const tasks = [
    { id: '1.1', code: '1.1', name: 'Feasibility study & business case', duration: 55, o: 40, m: 55, p: 90, budget: 180e6, crew: { pmo: 10 }, crashDuration: 50, delivery: 'predictive', dictionary: { description: 'Study.', owner: 'PMO Lead', acceptance: 'Approved by sponsor' } },
    { id: '3.2', code: '3.2', name: 'Earthworks (cut/fill) for extension', duration: 150, o: 120, m: 150, p: 220, budget: 2100e6, crew: { civil: 220, trucks: 50 }, crashDuration: 120, delivery: 'predictive' },
    { id: '3.5', code: '3.5', name: 'Asphalt surfacing (extension)', duration: 90, o: 70, m: 90, p: 130, budget: 2200e6, crew: { pavers: 2, civil: 60 }, crashDuration: 75, delivery: 'predictive' },
    { id: '7.1', code: '7.1', name: 'Terminal building structure', duration: 300, o: 250, m: 300, p: 400, budget: 5000e6, crew: { steel: 40, cranes: 2 }, crashDuration: 260, delivery: 'predictive' },
    { id: '10.2', code: '10.2', name: 'FIDS software', duration: 120, o: 90, m: 120, p: 180, budget: 300e6, crew: { itdev: 8 }, crashDuration: 110, delivery: 'agile' },
  ];
  const state = new Map([
    ['1.1', { pct: 1, actualCost: 190e6 }],
    ['3.2', { pct: 0.35, actualCost: 900e6, blocked: null }],
    ['3.5', { pct: 0, actualCost: 0 }],
    ['7.1', { pct: 0.2, actualCost: 1300e6 }],
    ['10.2', { pct: 0.4, actualCost: 150e6 }],
  ]);
  const nodes = new Map([
    ['1.1', { es: 0, ef: 55, ls: 0, lf: 55, totalFloat: 0, freeFloat: 0, critical: true }],
    ['3.2', { es: 55, ef: 205, ls: 55, lf: 205, totalFloat: 0, freeFloat: 0, critical: true }],
    ['3.5', { es: 205, ef: 295, ls: 205, lf: 295, totalFloat: 0, freeFloat: 0, critical: true }],
    ['7.1', { es: 55, ef: 355, ls: 70, lf: 370, totalFloat: 15, freeFloat: 5, critical: false }],
    ['10.2', { es: 100, ef: 220, ls: 250, lf: 370, totalFloat: 150, freeFloat: 150, critical: false }],
  ]);
  const p = {
    seed: 1, difficulty: 'professional', approach: 'hybrid', day: 200, phase: 'executing', finished: false,
    tasks, taskById: new Map(tasks.map((t) => [t.id, t])), state,
    summaries: [{ id: '1', code: '1', name: 'Initiation' }, { id: '3', code: '3', name: 'Runway' }],
    baseline: { nodes, criticalPath: ['1.1', '3.2', '3.5'], duration: 370 },
    baselineDuration: 370, bac: 9780e6, contingencyReserve: 900e6, managementReserve: 500e6,
    fundingLimits: [{ year: 2027, limit: 4000e6 }],
    pert: { mean: 372, sigma: 18, probabilityBy: (d) => (d >= 372 ? 0.55 : 0.3) },
    resources: [
      { id: 'civil', name: 'Civil works crews', unit: 'workers', dayRate: 4000, assigned: 150, required: 280, capacity: 400 },
      { id: 'pmo', name: 'PMO staff', unit: 'staff', dayRate: 30000, assigned: 30, required: 10, capacity: 40 },
      { id: 'pavers', name: 'Asphalt paving trains', unit: 'trains', dayRate: 900000, assigned: 2, required: 3, capacity: 2 },
      { id: 'trucks', name: 'Haul trucks', unit: 'trucks', dayRate: 30000, assigned: 50, required: 50, capacity: 80 },
    ],
    risks: [
      { id: 'R01', title: 'Land encroachment re-occupies cleared pockets', category: 'Social', kind: 'threat', probability: 0.45, costImpact: 450e6, daysImpact: 40, score: 16, emv: -202.5e6, response: 'Accept', strategies: [['Mitigate', 'Fence each pocket the day it is cleared.'], ['Escalate', 'Ask the district.']], owner: 'Land Manager', trigger: 'Drone survey shows new structures.', status: 'Open', wbs: ['3.2'] },
      { id: 'R03', title: 'Monsoon flooding of open works', category: 'Environmental', kind: 'threat', probability: 0.5, costImpact: 350e6, daysImpact: 18, score: 12, emv: -175e6, response: 'Mitigate', strategies: [{ strategy: 'Mitigate', text: 'Temporary drainage first.' }], owner: 'Airside Works Manager', trigger: '> 50 mm rain', status: 'Open', weather: 'rain' },
      { id: 'R09', title: 'Bitumen price spike', kind: 'threat', probability: 0.3, costImpact: 200e6, score: 9, response: 'Transfer', strategies: [], owner: 'Finance', status: 'Occurred', wbs: ['3.5'] },
      { id: 'O01', title: 'Early delivery of paving trains', kind: 'opportunity', probability: 0.2, costImpact: 100e6, score: 6, emv: 20e6, response: 'Accept', strategies: [['Enhance', 'Pay a small bonus.']], status: 'Open' },
    ],
    stakeholders: [
      { id: 'S01', role: 'Sponsor — airport owner (PAA programme board)', group: 'Governance', power: 0.95, interest: 0.9, current: 4, desired: 5, satisfaction: 0.7, channel: 'Steering committee', frequency: 'Monthly', needs: 'Value for money.' },
      { id: 'S07', role: 'Local residents near the airport', group: 'Community', power: 0.3, interest: 0.85, current: 2, desired: 3, satisfaction: 0.5, channel: 'Community meetings & helpline', frequency: 'Monthly', needs: 'Noise, dust, safety, local jobs.' },
      { id: 'S09', role: 'Airlines (operators committee)', group: 'Customers', power: 0.6, interest: 0.85, current: 3, desired: 5, satisfaction: 0.6, channel: 'Airline operators committee', frequency: 'Monthly', needs: 'Runway length, stands.' },
    ],
    procurement: [
      { id: 'P02', name: 'Airside civil works', packageIds: ['3.5'], contractType: 'FFP', estimate: 8000e6, leadTime: 60, status: 'RFP', makeOrBuy: { decision: 'Buy', rationale: 'No paving trains.' }, claims: [] },
      { id: 'P05', name: 'Terminal IT', packageIds: ['10.2'], contractType: 'T&M', estimate: 500e6, leadTime: 30, status: 'Awarded', claims: [{ amount: 1 }] },
    ],
    changes: [
      { id: 'CR01', title: 'Extra rapid exit taxiway', description: 'Add one RET.', raisedBy: 'Airlines', day: 150, status: 'Raised', impact: { days: 20, cost: 300e6, scope: 0.02, quality: 0, risk: 'low' }, votes: {} },
      { id: 'CR02', title: 'Upgrade FIDS screens', raisedBy: 'PO', day: 160, status: 'Approved', impact: { days: 0, cost: 20e6 }, votes: { Sponsor: 'approve' } },
    ],
    quality: {
      metrics: {
        compaction: { name: 'Compaction', unit: '%', target: 98, lsl: 95, usl: 101, samples: [97.9, 98.2, 98.1, 98.3, 98.4, 98.6, 98.5, 98.7, 98.9, 99.1].map((v, i) => ({ day: 100 + i, value: v, ok: true })) },
        friction: { name: 'Friction', unit: 'μ', target: 0.6, lsl: 0.5, usl: 0.8, samples: [0.6, 0.61, 0.59, 0.6].map((v, i) => ({ day: i, value: v, ok: true })) },
      },
      ncrs: [{ id: 'NCR01', status: 'Open' }, { id: 'NCR02', status: 'Closed' }, { id: 'NCR03', status: 'Open' }, { id: 'NCR04', status: 'Open' }],
      defects: { Compaction: 12, 'Surface texture': 7, Documentation: 2, Workmanship: 1 },
      costOfQuality: { prevention: 10e6, appraisal: 20e6, internalFailure: 60e6, externalFailure: 5e6 },
      inspectionLevel: 1,
      audits: [],
    },
    agile: {
      backlog: [
        { id: 'US01', title: 'Show arrivals', points: 5, priority: 1, status: 'done' },
        { id: 'US02', title: 'Gate changes', points: 8, priority: 2, status: 'doing' },
        { id: 'US03', title: 'Baggage belt', points: 3, priority: 3, status: 'doing' },
        { id: 'US04', title: 'Urdu labels', points: 5, priority: 4, status: 'doing' },
        { id: 'US05', title: 'Accessibility', points: 8, priority: 5, status: 'backlog' },
      ],
      sprintLength: 14,
      sprints: [{ n: 1, startDay: 100, endDay: 114, committed: 20, completed: 18, goal: 'Arrivals board' }, { n: 2, startDay: 114, endDay: 128, committed: 20, completed: 12, goal: 'Gates' }],
      currentSprint: 2,
      wip: { doing: 2, review: 2 },
      velocity: [18, 20, 12],
      ceremonies: [],
    },
    milestones: [{ id: 'M01', name: 'Charter approved', taskId: '1.1', baselineDay: 55 }, { id: 'M05', name: 'Runway extension open', taskId: '3.5', baselineDay: 295 }],
    gates: [{ id: 'G1', name: 'Plan approval', phase: 'planning', criteria: ['Baselines set'], status: 'approved' }, { id: 'G2', name: 'Execution readiness', phase: 'executing', criteria: ['Contracts awarded'], status: 'ready' }],
    raci: { roles: ['Sponsor (PAA)', 'Project Director', 'Main Contractor'], rows: [{ deliverable: 'Runway extension', cells: { 'Sponsor (PAA)': 'I', 'Project Director': 'A', 'Main Contractor': 'R' } }] },
    commsPlan: [{ audience: 'Sponsor', info: 'Dashboard', method: 'Meeting', frequency: 'Monthly', owner: 'PD' }],
    requirements: [{ id: 'RQ01', text: 'Code E runway', source: 'S09', priority: 'Must', wbs: ['3.5'], test: 'Survey', status: 'Open' }],
    events: [{ serial: 3, day: 200, kind: 'warn', title: 'Dust storm halts paving', detail: '' }, { serial: 2, day: 199, kind: 'info', title: 'Sprint 2 ended' }],
    issues: [{ id: 'I01', title: 'Access road permit', owner: 'PMO', status: 'Open' }],
    lessons: [],
    weather: { kind: 'rain', intensity: 0.7, label: 'Monsoon rain', workFactor: 0.7 },
    safety: 0.92, welfare: 0.8, incidents: 1, qualityIndex: 0.9, stakeholderSatisfaction: 0.62,
    benefits: { movementsPerDay: 0, paxPerDay: 0, onTimePct: 0, businessCaseTarget: { movementsPerDay: 36 } },
    calls: [],
    snapshot() {
      return { day: 200, dateLabel: 'Fri 23 Jul 2027', phase: 'executing', progress: 0.28, bac: this.bac, pv: 3300e6, ev: 2740e6, ac: 2540e6 + 300e6, sv: -560e6, cv: -100e6, spi: 0.83, cpi: 0.965, eac: 10135e6, etc: 7295e6, vac: -355e6, tcpi: 1.015, svt: -34, spit: 0.83, baselineDuration: 370, forecastFinish: 420, scheduleVarianceDays: 50, contingencyRemaining: 180e6, managementRemaining: 500e6, riskExposure: -377.5e6, openRisks: 3, realisedRisks: 1, qualityIndex: 0.9, safety: 0.92, welfare: 0.8, incidents: 1, stakeholderSatisfaction: 0.62, openChanges: 1, weather: this.weather, criticalPath: ['1.1', '3.2', '3.5'], finished: false, velocity: 16.7, budgetBurn: 0.29 };
    },
    evm() { return { pv: 3300e6, ev: 2740e6, ac: 2840e6, sv: -560e6, cv: -100e6, spi: 0.83, cpi: 0.965, eac: { cpi: 10135e6, atBudget: 9880e6, composite: 12200e6, bottomUp: 10000e6 }, etc: 7295e6, vac: -355e6, tcpi: { bac: 1.015, eac: 1 }, es: 166, svt: -34, spit: 0.83, bac: this.bac }; },
    dateLabel(d) { return `Day ${d} label`; },
    crashPlan(days) { return [{ id: '3.2', name: 'Earthworks', days: Math.min(days, 30), cost: 120e6, slope: 4e6 }, { id: '3.5', name: 'Asphalt', days: Math.max(0, Math.min(days - 30, 15)), cost: 90e6, slope: 6e6 }].filter((c) => c.days > 0); },
    applyCrashPlan(days) { this.calls.push(['applyCrashPlan', days]); return { ok: true, message: `Crashed ${days} d` }; },
    setStaffing(id, n) { this.calls.push(['setStaffing', id, n]); },
    levelResources() { this.calls.push(['levelResources']); return { moved: 2 }; },
    respondToRisk(id, s) { this.calls.push(['respondToRisk', id, s]); return { ok: true, cost: 1, message: `${id} → ${s}` }; },
    engageStakeholder(id, a) { this.calls.push(['engageStakeholder', id, a]); return { ok: true, message: 'ok' }; },
    setInspectionLevel(v) { this.calls.push(['setInspectionLevel', v]); },
    raiseChange(c) { this.calls.push(['raiseChange', c.title]); return { id: 'CR03', ...c }; },
    analyseChange(id) { this.calls.push(['analyseChange', id]); return {}; },
    fastTrack(id) { this.calls.push(['fastTrack', id]); return { ok: true, daysSaved: 12, riskAdded: 0.1 }; },
    approveGate(id) { this.calls.push(['approveGate', id]); return { ok: true, message: 'approved' }; },
    agileBurndown() { return [{ day: 114, remaining: 20, ideal: 20 }, { day: 121, remaining: 16, ideal: 10 }]; },
  };
  return p;
}

const MC = { iterations: 5000, day: 200, finish: { p10: 390, p50: 410, p80: 428, p90: 440 }, cost: { p50: 10e9, p80: 10.6e9 }, probabilityOnTime: 0.12, probabilityOnBudget: 0.3, tornado: [{ id: '3.2', code: '3.2', correlation: 0.71 }], baselineDuration: 370 };

/* ------------------------------------------------------------ glossary */

test('glossary has ≥ 150 unique terms with required fields', () => {
  assert.ok(glossarySize() >= 150, `only ${glossarySize()} terms`);
  const names = new Set(GLOSSARY.map((e) => normalise(e.term)));
  assert.equal(names.size, GLOSSARY.length, 'duplicate term names');
  for (const e of GLOSSARY) {
    assert.ok(e.term && e.definition && e.definition.length > 30, `bad entry ${e.term}`);
    assert.match(e.clo, /^CLO[123]$/, `clo for ${e.term}`);
    assert.ok(e.domain, `domain for ${e.term}`);
    assert.ok(Array.isArray(e.related), `related for ${e.term}`);
  }
});

test('glossary covers the required topic families', () => {
  for (const t of ['TCPI', 'SPI', 'CPI', 'EAC', 'Critical Path', 'PERT', 'RACI', 'Tuckman', 'Pareto', 'fishbone', 'Western Electric Rules', 'FFP', 'CPFF', 'Kanban', 'WIP', 'Velocity', 'ORAT', 'Code E', 'PAPI', 'ILS', 'RESA', 'ARFF', 'EEF', 'OPA', 'PMO', 'Portfolio', 'Change Control Board', 'Performance Domain', 'Lessons Learned', 'Monte Carlo', 'Tracking Gantt']) {
    assert.ok(lookup(t) || best(t), `missing ${t}`);
  }
});

test('glossary related links resolve', () => {
  let missing = 0;
  for (const e of GLOSSARY) for (const r of e.related) if (!lookup(r)) missing++;
  assert.equal(missing, 0, `${missing} related links do not resolve`);
});

test('glossary fuzzy search', () => {
  assert.equal(lookup('tcpi').abbr, 'TCPI');
  assert.equal(best('to complete performance index').abbr, 'TCPI');
  assert.equal(best('tcip').abbr, 'TCPI', 'transposition typo');
  assert.equal(best('float').term, 'Total Float');
  assert.ok(search('earned value').length > 0);
  assert.equal(best('zzqqxx'), null);
});

/* ------------------------------------------------------------ intents */

test('≥ 60 intents, unique ids, each with ≥ 1 RegExp pattern', () => {
  assert.ok(INTENTS.length >= 60, `only ${INTENTS.length} intents`);
  assert.equal(intentCount(), INTENTS.length);
  assert.equal(new Set(INTENTS.map((i) => i.id)).size, INTENTS.length);
  for (const i of INTENTS) {
    assert.ok(i.patterns.length >= 1, i.id);
    for (const re of i.patterns) assert.ok(re instanceof RegExp, i.id);
    assert.equal(typeof i.answer, 'function', i.id);
  }
});

test('every intent answers its examples without throwing (mock project, MC, empty project)', () => {
  const projects = [mockProject(), {}, null];
  for (const p of projects) {
    const ctx = makeContext(p, { mc: p ? MC : null, coaching: [{ mission: 'm1', name: 'First steps', next: 'Approve G1', hint: 'Open Charter' }], lastQuiz: { question: { text: 'Which index measures cost efficiency?', options: ['SPI', 'CPI', 'TCPI', 'SV'] }, chosen: 0, correct: 1, explanation: 'CPI = EV/AC.' } });
    for (const intent of INTENTS) {
      for (const ex of intent.examples || []) {
        const r = respond(ex, ctx);
        assert.equal(typeof r.text, 'string', `${intent.id} / ${ex}`);
        assert.ok(r.text.length > 0, `${intent.id} empty text`);
        assert.ok(!/undefined|NaN|\[object Object\]/.test(r.text), `${intent.id} "${ex}" leaked: ${r.text.slice(0, 300)}`);
        assert.ok(Array.isArray(r.actions));
      }
    }
  }
});

test('every example routes to its own intent', () => {
  for (const intent of INTENTS) {
    for (const ex of intent.examples || []) {
      const r = route(ex);
      assert.ok(r, `no route for "${ex}"`);
      assert.equal(r.intent.id, intent.id, `"${ex}" → ${r.intent.id}, expected ${intent.id}`);
    }
  }
});

test('brief sample utterances route correctly', () => {
  const cases = {
    'why are we behind?': 'why_behind',
    'what is TCPI?': 'tcpi',
    'crash 20 days': 'crash',
    'who should I talk to?': 'stakeholder_talk',
    'explain RACI': 'raci',
    "what's on the critical path": 'critical_path',
    'biggest risk': 'biggest_risk',
    'status report': 'status_report',
    'stand-up': 'standup',
    'forecast finish': 'forecast_finish',
    'how much contingency is left': 'contingency',
    'what does SPI 0.9 mean': 'metric_meaning',
    'draft a message to residents': 'draft_message',
    'what if we fast-track the terminal': 'fast_track',
    'explain why answer B is wrong': 'tutor',
    'what can you do': 'capabilities',
    'how do you work': 'how_work',
    'are you sure?': 'how_work',
    'weather': 'weather',
    'agile velocity': 'velocity',
    'procurement status': 'procurement',
    'quality': 'quality',
    'Monte Carlo': 'monte_carlo',
    'what is risk appetite?': 'define',
    'define scope creep': 'define',
    'what is ORAT': 'aviation_terms',
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(route(q) && route(q).intent.id, id, q);
});

test('answers quote live numbers and carry approval-gated actions', () => {
  const p = mockProject();
  const ctx = makeContext(p, { mc: MC, lastQuiz: { question: { text: 'Which index measures cost efficiency?', options: ['SPI', 'CPI', 'TCPI', 'SV'] }, chosen: 0, correct: 1, explanation: 'CPI = EV/AC.' } });
  const behind = respond('why are we behind?', ctx);
  assert.match(behind.text, /0\.83/);
  assert.match(behind.text, /3\.2/);
  const crash = respond('crash 20 days', ctx);
  assert.equal(crash.actions[0].kind, 'crash');
  assert.ok(STATE_CHANGING.has('crash'));
  const ft = respond('what if we fast-track the terminal', ctx);
  assert.equal(ft.actions[0].args.id, '7.1');
  const msg = respond('draft a message to residents', ctx);
  assert.match(msg.text, /neighbours/);
  const mc = respond('P80 date', ctx);
  assert.match(mc.text, /428/);
  const tut = respond('explain why answer A is wrong', ctx);
  assert.match(tut.text, /CPI/);
  const raise = respond('raise a change request for an extra apron floodlight', ctx);
  assert.equal(raise.actions[0].kind, 'raiseChange');
});

test('unknown input → helpful fallback with suggestions', () => {
  const r = respond('blorp wibble', makeContext(mockProject()));
  assert.equal(r.intent, 'fallback');
  assert.ok(r.suggestions.length >= 3);
  const f = fallback('earned schedule thing');
  assert.match(f.text, /Earned Schedule/);
});

/* ------------------------------------------------------------ rules */

test('analyse ranks issues and fires the expected rules', () => {
  const p = mockProject();
  const a = analyse(p, { mc: MC });
  assert.ok(a.length >= 4);
  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  for (let i = 1; i < a.length; i++) assert.ok(order[a[i - 1].severity] <= order[a[i].severity], 'sorted by severity');
  const ids = a.map((x) => x.id);
  for (const id of ['schedule', 'forecast', 'contingency']) assert.ok(ids.includes(id), `missing rule ${id}: ${ids}`);
  for (const x of a) {
    for (const k of ['severity', 'title', 'why', 'recommendation']) assert.ok(x[k], `${x.id}.${k}`);
    assert.ok(!/undefined|NaN/.test(`${x.title} ${x.why} ${x.recommendation} ${x.impact || ''}`), `${x.id}: ${x.why}`);
    if (x.action) assert.ok(x.action.kind && x.action.label);
  }
});

test('rules never throw on empty or partial projects', () => {
  for (const p of [{}, null, { tasks: [] }, { tasks: [{ id: 'a', name: 'A' }], snapshot: () => ({}) }, { tasks: [{ id: 'a' }], snapshot() { throw new Error('x'); } }]) {
    const a = analyse(p);
    assert.ok(Array.isArray(a) && a.length >= 1);
    assert.ok(standupText(p).length > 0);
    assert.ok(statusReport(p).markdown.length > 0);
    assert.ok(Array.isArray(riskResponses(p)));
    assert.equal(typeof changeImpact(p, 'CR09'), 'string');
    assert.equal(typeof stakeholderMessage(p, 'S01').body, 'string');
  }
});

test('schedule driver finds the starved critical activity', () => {
  const p = mockProject();
  const d = scheduleDriver(p, readState(p));
  assert.equal(d.id, '3.2');
  assert.match(d.reason, /civil/i);
  assert.equal(d.action.kind, 'staffing');
  assert.equal(criticalPath(p).length, 3);
});

test('executeAction calls the documented Project methods', () => {
  const p = mockProject();
  const acts = [
    { kind: 'crash', args: { days: 20 } }, { kind: 'staffing', args: { resId: 'civil', n: 290 } }, { kind: 'level', args: {} },
    { kind: 'risk', args: { riskId: 'R01', strategy: 'Mitigate' } }, { kind: 'engage', args: { id: 'S07', how: 'consult' } },
    { kind: 'inspection', args: { level: 1.25 } }, { kind: 'raiseChange', args: { title: 'X' } }, { kind: 'analyseChange', args: { id: 'CR01' } },
    { kind: 'fastTrack', args: { id: '7.1' } }, { kind: 'approveGate', args: { id: 'G2' } },
  ];
  for (const a of acts) assert.equal(executeAction(p, a).ok, true, a.kind);
  assert.deepEqual(p.calls.map((c) => c[0]), ['applyCrashPlan', 'setStaffing', 'levelResources', 'respondToRisk', 'engageStakeholder', 'setInspectionLevel', 'raiseChange', 'analyseChange', 'fastTrack', 'approveGate']);
  assert.equal(executeAction({}, { kind: 'crash', args: { days: 5 } }).ok, false, 'missing method is reported, not thrown');
});

test('Western Electric rules', () => {
  assert.deepEqual(westernElectricCheck([0, 0, 0, 3.5], 0, 1).map((h) => h.rule), [1]);
  assert.ok(westernElectricCheck([0.5, 0.2, 0.3, 0.4, 0.1, 0.6, 0.2, 0.3], 0, 1).some((h) => h.rule === 4));
  assert.ok(westernElectricCheck([0, 2.5, 0.1, 2.2], 0, 1).some((h) => h.rule === 2));
  assert.ok(westernElectricCheck([1.5, 1.2, 0.2, 1.3, 1.6], 0, 1).some((h) => h.rule === 3));
  assert.deepEqual(westernElectricCheck([0.1, -0.2, 0.3, -0.1], 0, 1), []);
});

test('reports: stand-up and status report are grounded in the snapshot', () => {
  const p = mockProject();
  const s = standupText(p);
  assert.match(s, /day 200/);
  assert.match(s, /Dust storm halts paving/);
  const r = statusReport(p, readState(p, { mc: MC }));
  assert.match(r.title, /Status Report/);
  assert.match(r.markdown, /\| SPI \/ CPI \| 0\.83 \/ 0\.9[67] \|/);
  assert.match(r.markdown, /P50 \/ P80/);
  assert.match(r.markdown, /Simulated scenario data/);
  assert.match(tutorText({ question: 'Q', options: ['a', 'b'], chosen: 0, correct: 1, explanation: 'Because.' }), /B\) b/);
});

/* ------------------------------------------------------------ live-LLM helpers (no network) */

test('SSE parser assembles text, thinking and tool_use blocks across chunk boundaries', () => {
  const events = [
    { type: 'message_start', message: { id: 'm', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello ' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'world' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu1', name: 'explain_term', input: {} } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"term":' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"TCPI"}' } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ];
  const wire = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const st = { buffer: '', blocks: [], stopReason: null, text: '' };
  const deltas = [];
  for (let i = 0; i < wire.length; i += 37) parseSSE(wire.slice(i, i + 37), st, (t) => deltas.push(t));
  assert.equal(deltas.join(''), 'Hello world');
  assert.equal(st.stopReason, 'tool_use');
  assert.equal(st.blocks[0].type, 'thinking');
  assert.equal(st.blocks[0].signature, 'sig');
  assert.deepEqual(st.blocks[2].input, { term: 'TCPI' });
  assert.equal(st.blocks[2]._json, undefined, 'scratch field removed');
});

test('system prompt embeds the snapshot and the grounding rule; tools are well-formed', () => {
  const p = mockProject();
  const snap = compactSnapshot(p, readState(p));
  const sys = buildSystemPrompt(snap);
  assert.match(sys, /not in the data/);
  assert.match(sys, /"spi":0\.83/);
  const names = TOOLS.map((t) => t.name);
  for (const n of ['get_snapshot', 'get_critical_path', 'run_monte_carlo', 'propose_change_request', 'draft_status_report', 'explain_term']) assert.ok(names.includes(n), n);
  for (const t of TOOLS) assert.equal(t.input_schema.type, 'object');
});

test('live engine: key stays in sessionStorage, tool loop echoes blocks, HTTP errors throw for fallback', async () => {
  const mem = new Map();
  globalThis.sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    setKey('test-key-not-real');
    assert.equal(getKey(), 'test-key-not-real');
    const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const turn1 = sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'S1' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'get_critical_path', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]);
    const turn2 = sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The path runs through 3.2.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
    const bodies = [];
    const replies = [turn1, turn2];
    const fetchImpl = async (url, init) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(init.headers['x-api-key'], 'test-key-not-real');
      assert.equal(init.headers['anthropic-version'], '2023-06-01');
      assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
      const body = JSON.parse(init.body);
      bodies.push(body);
      assert.equal(body.stream, true);
      return { ok: true, status: 200, text: async () => replies.shift() };
    };
    const calls = [];
    const eng = new LiveEngine({ getModel: () => 'claude-haiku-5-5', getSnapshot: () => ({ spi: 0.8 }), runTool: async (n) => { calls.push(n); return [{ code: '3.2' }]; }, fetchImpl });
    let streamed = '';
    const r = await eng.ask([{ role: 'assistant', text: 'hello' }, { role: 'user', text: 'hi' }], 'critical path?', { onDelta: (t) => { streamed += t; } });
    assert.deepEqual(calls, ['get_critical_path']);
    assert.equal(r.text, 'The path runs through 3.2.');
    assert.equal(streamed, 'The path runs through 3.2.');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, 'claude-haiku-5-5');
    assert.equal(bodies[0].messages[0].role, 'user', 'history starts with a user turn');
    const echoed = bodies[1].messages[bodies[1].messages.length - 2];
    assert.equal(echoed.role, 'assistant');
    assert.equal(echoed.content[0].type, 'thinking');
    assert.equal(echoed.content[0].signature, 'S1');
    const results = bodies[1].messages[bodies[1].messages.length - 1];
    assert.equal(results.content[0].type, 'tool_result');
    assert.equal(results.content[0].tool_use_id, 'tu_1');
    assert.ok(!JSON.stringify(bodies).includes('test-key-not-real'), 'key never in the request body');

    const bad = new LiveEngine({ fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }) });
    await assert.rejects(() => bad.ask([], 'hi'), /API key rejected/);
    clearKey();
    assert.equal(getKey(), '');
    await assert.rejects(() => eng.ask([], 'hi'), /unavailable/);
  } finally {
    delete globalThis.sessionStorage;
  }
});
