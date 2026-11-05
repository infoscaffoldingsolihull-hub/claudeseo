import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project } from '../../src/pm/project.js';
import { WORLD_LINKS } from '../../src/world/layout.js';

const SUMMARY_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

test('scope: 12 summary packages, ≥ 70 leaves, full WBS dictionary, all link types', () => {
  const p = new Project();
  assert.deepEqual(p.summaries.map((s) => s.id), SUMMARY_IDS);
  assert.deepEqual(p.wbs.map((n) => n.id), SUMMARY_IDS);
  const leaves = p.tasks.filter((t) => !t.milestone);
  assert.ok(leaves.length >= 70, `${leaves.length} leaves`);
  for (const t of leaves) {
    const d = t.dictionary;
    assert.ok(d.description && d.deliverables.length && d.acceptance && d.owner && d.assumptions !== undefined, t.id);
    assert.ok(Array.isArray(d.risks));
    assert.ok(t.o <= t.m && t.m <= t.p && t.duration > 0 && t.budget > 0, t.id);
    assert.ok(t.materialBudget >= 0 && t.labourBudget <= t.budget, `${t.id} labour exceeds budget`);
    assert.ok(t.crashDuration < t.duration && t.costSlope > 0, t.id);
    assert.ok(t.clo.length && t.domain, t.id);
  }
  const types = new Set(p.tasks.flatMap((t) => t.predecessors.map((l) => l.type)));
  for (const k of ['FS', 'SS', 'FF', 'SF']) assert.ok(types.has(k), k);
  assert.ok(p.tasks.some((t) => t.predecessors.some((l) => l.lag < 0)), 'a lead');
  assert.ok(p.tasks.some((t) => t.predecessors.some((l) => l.lag > 0)), 'a lag');
  assert.ok(p.milestones.length >= 10 && p.milestones.every((m) => p.taskById.get(m.id).duration === 0));
  for (const id of Object.keys(WORLD_LINKS)) assert.ok(p.taskById.has(id) && !p.taskById.get(id).milestone, `WORLD_LINKS ${id}`);
  assert.equal(p.taskById.get('3.2').name, 'Earthworks (cut/fill) for extension');
  assert.equal(p.taskById.get('7.9').name, 'Passenger boarding bridges');
  assert.equal(p.taskById.get('10.2').delivery, 'agile');
  assert.equal(p.taskById.get('3.5').delivery, 'predictive');
});

test('baseline: BAC 40–70 bn PKR, 1,200–1,600 days, critical path, PERT, reserves, funding', () => {
  const p = new Project();
  assert.ok(p.bac >= 40e9 && p.bac <= 70e9, `BAC ${p.bac}`);
  assert.ok(p.baselineDuration >= 1200 && p.baselineDuration <= 1600, `duration ${p.baselineDuration}`);
  const cp = p.baseline.criticalPath;
  assert.equal(cp[0], '1.1');
  assert.ok(cp.includes('7.6') && cp.includes('11.5') && cp[cp.length - 1] === 'M11', cp.join(' '));
  for (const id of cp) assert.ok(p.baseline.nodes.get(id).totalFloat <= 0.5);
  assert.ok(p.pert.sigma > 0 && Math.abs(p.pert.probabilityBy(p.baselineDuration) - 0.5) < 1e-6);
  assert.ok(p.pert.probabilityBy(p.baselineDuration + 2 * p.pert.sigma) > 0.97);
  assert.ok(p.contingencyReserve > 0 && p.managementReserve === p.bac * 0.05);
  assert.ok(p.fundingLimits.length >= 4 && p.fundingLimits.every((f, i, a) => i === 0 || f.limit >= a[i - 1].limit));
  assert.equal(p.startDate.toISOString().slice(0, 10), '2027-01-04');
  assert.equal(p.dateLabel(0), 'Mon 04 Jan 2027');
  assert.equal(p.pvCurve[p.baselineDuration], p.bac);
});

test('registers meet the minimum counts and carry the required fields', () => {
  const p = new Project();
  const c = p.counts();
  assert.ok(c.resources >= 10 && c.risks >= 24 && c.stakeholders >= 14 && c.procurement >= 10);
  assert.ok(c.requirements >= 20 && c.raciRows >= 12 && c.stories >= 30 && c.gates === 5 && c.opportunities >= 2);
  for (const r of p.risks) {
    assert.ok(r.category && r.rbs && r.owner && r.trigger && r.strategies.length && r.response, r.id);
    assert.ok(r.pScore >= 1 && r.pScore <= 5 && r.iScore >= 1 && r.iScore <= 5);
    assert.equal(Math.sign(r.emv), r.kind === 'threat' ? -1 : 1, r.id);
  }
  for (const w of ['rain', 'dust', 'heat', 'fog']) assert.ok(p.risks.some((r) => r.weather === w), w);
  for (const s of p.stakeholders) {
    assert.ok(s.current >= 1 && s.current <= 5 && s.desired >= 1 && s.desired <= 5 && s.channel && s.frequency);
    for (const k of ['power', 'interest', 'legitimacy', 'urgency']) assert.ok(s[k] >= 0 && s[k] <= 1);
  }
  const types = new Set(p.procurement.map((x) => x.contractType));
  for (const k of ['FFP', 'FPIF', 'CPFF', 'CPIF', 'CPAF', 'T&M']) assert.ok(types.has(k), k);
  for (const pk of p.procurement) {
    assert.ok(pk.bids.length >= 3 && pk.makeOrBuy.decision && pk.leadTime > 0);
    assert.ok(pk.plan.awardDay + (pk.kind === 'supply' ? pk.leadTime : 0) <= pk.plan.requiredBy, `${pk.id} procurement plan meets the schedule`);
    assert.equal(p.evaluateBids(pk.id)[0].vendor, pk.plannedVendor);
  }
  for (const rq of p.requirements) {
    assert.ok(p.stakeholderById.has(rq.source), rq.id);
    for (const id of rq.wbs) assert.ok(p.taskById.has(id), `${rq.id} → ${id}`);
  }
  assert.equal(p.agile.backlog.reduce((a, s) => a + s.points, 0), p.agile.totalPoints);
  assert.ok(p.raci.rows.every((r) => Object.values(r.cells).includes('A')), 'one accountable per deliverable');
  assert.ok(p.commsPlan.length >= 10);
});

const runs = {};
function fullRun(difficulty, seed = 20270104) {
  const key = `${difficulty}:${seed}`;
  if (runs[key]) return runs[key];
  const p = new Project({ difficulty, seed });
  const logs = [];
  p.onLog = (e) => logs.push(e);
  const t0 = Date.now();
  let mid = null;
  while (!p.finished && p.day < 4000) {
    p.step();
    if (p.day === 700) mid = p.snapshot();
  }
  runs[key] = { p, ms: Date.now() - t0, mid, end: p.snapshot(), logs };
  return runs[key];
}

for (const difficulty of ['trainee', 'professional', 'crisis']) {
  test(`full headless run to completion — ${difficulty}`, () => {
    const { p, ms, mid, end, logs } = fullRun(difficulty);
    assert.ok(p.finished, 'finished');
    assert.ok(ms < 3000, `run took ${ms} ms`);
    for (const k of ['spi', 'cpi', 'spit', 'eac', 'tcpi', 'vac']) assert.ok(Number.isFinite(end[k]) && Number.isFinite(mid[k]), k);
    assert.ok(end.cpi > 0.75 && end.cpi < 1.15, `CPI ${end.cpi}`);
    assert.ok(mid.spi > 0.75 && mid.spi < 1.2, `mid SPI ${mid.spi}`);
    if (difficulty === 'trainee') {
      assert.ok(mid.spi > 0.9 && mid.spi < 1.1, `trainee SPI ${mid.spi}`);
      assert.ok(end.cpi > 0.9 && end.cpi < 1.1, `trainee CPI ${end.cpi}`);
      assert.ok(end.spit > 0.9 && end.spit < 1.1, `trainee SPI(t) ${end.spit}`);
    }
    assert.ok(p.day < p.baselineDuration * 1.3, `finished day ${p.day}`);
    assert.ok(Math.abs(end.progress - 1) < 1e-9, `progress ${end.progress}`);
    assert.equal(p.phase, 'closing');
    assert.ok(p.gates.every((g) => g.status === 'approved'));
    assert.ok(p.closeout && p.closeout.status === 'Completed');
    assert.ok(p.procurement.every((x) => x.status === 'Closed' && x.vendor && x.finalAccount));
    assert.ok(p.agile.sprints.length >= 15 && p.agile.backlog.every((s) => s.status === 'done'));
    assert.ok(p.requirements.every((r) => r.status === 'Verified'));
    assert.ok(logs.some((e) => e.kind === 'milestone'));
    assert.ok(p.changes.length >= 5 && p.changes.some((c) => c.status === 'Implemented'));
    assert.ok(p.lessons.length > 0 && p.decisionLog.length > 0);
    assert.ok(p.evmHistory.length > 150);
    for (const k of ['day', 'dateLabel', 'phase', 'progress', 'bac', 'pv', 'ev', 'ac', 'sv', 'cv', 'spi', 'cpi', 'eac', 'etc', 'vac', 'tcpi', 'svt', 'spit',
      'baselineDuration', 'forecastFinish', 'scheduleVarianceDays', 'contingencyRemaining', 'managementRemaining', 'riskExposure', 'openRisks',
      'realisedRisks', 'qualityIndex', 'safety', 'welfare', 'incidents', 'stakeholderSatisfaction', 'openChanges', 'weather', 'criticalPath',
      'finished', 'velocity', 'budgetBurn']) assert.ok(k in end, `snapshot.${k}`);
  });
}

test('difficulty scales outcomes: crisis is harder than trainee', () => {
  const t = fullRun('trainee').p;
  const c = fullRun('crisis').p;
  assert.ok(c.day > t.day, `crisis ${c.day} vs trainee ${t.day}`);
  assert.ok(c.snapshot().cpi < t.snapshot().cpi);
});

test('serialise → restore → continue equals an uninterrupted run (incl. RNG state)', () => {
  for (const difficulty of ['trainee', 'crisis']) {
    const a = new Project({ difficulty, seed: 4242 });
    while (!a.finished) a.step();
    const b = new Project({ difficulty, seed: 4242 });
    for (let i = 0; i < 611; i++) b.step();
    const saved = JSON.parse(JSON.stringify(b.serialise()));
    assert.equal(saved.version, 1);
    assert.ok(typeof saved.rngState === 'number');
    const c = new Project({ difficulty, seed: 4242 });
    assert.equal(c.restore(saved), true);
    assert.equal(c.day, 611);
    while (!c.finished) c.step();
    assert.equal(JSON.stringify(c.serialise()), JSON.stringify(a.serialise()), difficulty);
  }
  assert.equal(new Project().restore({ version: 9 }), false);
});

test('gates: ready → player approval, or sponsor default with a satisfaction penalty', () => {
  const p = new Project({ seed: 5 });
  while (p.gateById.get('G0').status !== 'ready') p.step();
  assert.equal(p.approveGate('G1').ok, false);
  const before = p.stakeholderById.get('S01').satisfaction;
  const r = p.approveGate('G0');
  assert.ok(r.ok);
  assert.ok(p.stakeholderById.get('S01').satisfaction > before);
  p.step();
  assert.equal(p.phase, 'planning');
  while (p.gateById.get('G1').status !== 'approved') p.step();
  assert.equal(p.gateById.get('G1').approvedBy, 'Sponsor (default decision)');
  assert.equal(p.gateById.get('G1').day - p.gateById.get('G1').readyDay, 10);
  assert.equal(p.autoGateApprovals, 1);
  assert.equal(p.phase, 'executing');
});

test('management actions: crash, fast-track, levelling, risk responses, engagement, procurement, changes, effects', () => {
  const p = new Project({ seed: 8 });
  for (let i = 0; i < 520; i++) p.step();
  // crashing
  const plan = p.crashPlan(20);
  assert.ok(plan.length > 0 && plan.recovered > 0);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].slope >= plan[i - 1].slope);
  const fBefore = p.forecastFinish;
  const ac0 = p.ac;
  const sum = p.applyCrashPlan(20);
  assert.ok(p.forecastFinish < fBefore, `${p.forecastFinish} < ${fBefore}`);
  assert.ok(p.ac > ac0 && sum.cost > 0);
  // fast-tracking an unstarted activity with an FS predecessor
  const ft = p.fastTrack('7.9');
  assert.ok(ft.ok && ft.riskAdded, ft.message);
  assert.ok(p.taskById.get('7.9').predecessors.some((l) => l.lag < 0));
  assert.equal(p.fastTrack('1.1').ok, false);
  // resource smoothing
  const lv = p.levelResources();
  assert.ok(lv.resources.length === p.resources.length && Array.isArray(lv.shifted));
  // risk responses
  const open = p.risks.find((r) => r.kind === 'threat' && r.status === 'Open' && r.response !== 'Avoid');
  const resp = p.respondToRisk(open.id, 'avoid');
  assert.ok(resp.ok && open.probability < open.residual);
  assert.equal(p.respondToRisk(open.id, 'exploit').ok, false);
  const opp = p.risks.find((r) => r.kind === 'opportunity' && r.status === 'Open');
  if (opp) assert.ok(p.respondToRisk(opp.id, 'enhance').ok);
  // stakeholder engagement with cooldown
  const s7 = p.stakeholderById.get('S07');
  const lvl = s7.current;
  assert.ok(p.engageStakeholder('S07', 'involve').ok);
  assert.ok(s7.current >= lvl);
  assert.equal(p.engageStakeholder('S07', 'consult').ok, false);
  assert.equal(p.engageStakeholder('S07', 'bribe').ok, false);
  // procurement: player award and claims
  const pk = p.procurement.find((x) => !x.vendor && x.status !== 'Planned');
  if (pk) {
    const ranked = p.evaluateBids(pk.id, { price: 1, technical: 0, experience: 0, schedule: 0 });
    assert.ok(ranked[0].price <= ranked[ranked.length - 1].price);
    assert.ok(p.award(pk.id, ranked[0].vendor).ok);
  }
  const awarded = p.procurement.find((x) => x.vendor);
  assert.ok(p.raiseClaim(awarded.id, 5e6, 'Late access to site').ok);
  // change control: raise → analyse → vote → decide → implement → re-baseline
  const bac0 = p.bac;
  const cr = p.raiseChange({ title: 'Extra apron floodlight mast', description: 'Glare-free mast for stand 8', raisedBy: 'S09', wbs: '4.5', impact: { days: 5, cost: 50e6 } });
  assert.equal(cr.status, 'Raised');
  assert.ok(p.analyseChange(cr.id).scheduleDays >= 0);
  assert.ok(p.voteChange(cr.id, 'Finance Controller', true));
  assert.equal(p.decideChange(cr.id, true).status, 'Approved');
  const v0 = p.baselineVersion;
  p.implementChange(cr.id);
  assert.equal(cr.status, 'Implemented');
  assert.ok(p.bac > bac0 && p.baselineVersion === v0 + 1);
  // effects from decision cards
  const q0 = p.qualityIndex;
  const fx = p.applyEffect({ days: 3, cost: 10, quality: 0.02, safety: -0.01, risk: { id: 'R04', dp: 0.05 }, stakeholder: { id: 'S09', d: 0.05 }, satisfaction: 0.01, welfare: 0.01 }, 'Decision: test');
  assert.ok(fx.ok && fx.applied.length >= 6);
  assert.ok(p.qualityIndex >= q0);
  // staffing and inspection
  assert.ok(p.setStaffing('civil', 50));
  assert.equal(p.autoStaffing, false);
  p.setAutoStaffing(true);
  assert.equal(p.setInspectionLevel(3), 1.5);
  // still runs to the end after all that
  while (!p.finished) p.step();
  assert.ok(p.finished);
});

test('agile: sprints start after 10.1, respect WIP, produce velocity and burndown', () => {
  const p = new Project({ seed: 21 });
  while (p.state.get('10.1').pct < 1) p.step();
  for (let i = 0; i < 60; i++) p.step();
  const ag = p.agile;
  assert.ok(ag.sprints.length >= 4);
  assert.ok(ag.sprints[0].startDay >= p.state.get('10.1').actualFinish);
  assert.ok(ag.velocity.length >= 3 && ag.velocity.every((v) => v >= 0));
  assert.ok(ag.backlog.filter((s) => s.status === 'doing').length <= ag.wip.doing);
  const bd = p.agileBurndown(1);
  assert.equal(bd.length, 15);
  assert.ok(bd[0].remaining > 0 && bd[0].ideal === ag.sprints[0].committed);
  assert.ok(ag.ceremonies.some((c) => c.kind === 'Sprint planning') && ag.ceremonies.some((c) => c.kind === 'Retrospective'));
  assert.ok(p.state.get('10.2').pct > 0);
  const free = ag.backlog.filter((s) => s.status === 'backlog').slice(0, 2).map((s) => s.id);
  assert.ok(p.agilePlanSprint(free).ok);
  assert.equal(p.agileMove('US01', 'teleport').ok, false);
});

test('predictive approach delivers WBS 10 without sprints', () => {
  const p = new Project({ approach: 'predictive', seed: 2 });
  assert.equal(p.taskById.get('10.3').delivery, 'predictive');
  while (!p.finished) p.step();
  assert.equal(p.agile.sprints.length, 0);
  assert.ok(p.agile.backlog.every((s) => s.status === 'done'));
});

test('world link, overlays, preview, operations and close-out', () => {
  const p = new Project({ seed: 31 });
  for (let i = 0; i < 600; i++) p.step();
  const ws = p.worldState();
  for (const id of Object.keys(WORLD_LINKS)) assert.ok(ws.pct[id] >= 0 && ws.pct[id] <= 1, id);
  for (const id of SUMMARY_IDS) assert.ok(id in ws.pct);
  assert.ok(ws.workforce > 0 && ws.workforce <= 1 && ws.activeIds.length > 0 && ws.operational === false);
  assert.ok(['clear', 'haze', 'dust', 'rain', 'fog', 'heat'].includes(ws.weather.kind));
  for (const kind of ['sv', 'cv', 'risk', 'load']) {
    const v = p.overlayValues(kind);
    assert.ok(Object.values(v).every((x) => x >= -1 && x <= 1), kind);
    assert.ok('3.2' in v && '7' in v);
  }
  const pre0 = p.previewState(0);
  const pre1 = p.previewState(1);
  const preHalf = p.previewState(0.5);
  assert.equal(pre0.pct['7.9'], 0);
  assert.equal(pre1.pct['7.9'], 1);
  assert.equal(pre1.operational, true);
  assert.ok(preHalf.pct['3.2'] === 1 && preHalf.pct['12.3'] === 0);
  const draft = p.closeProject();
  assert.equal(draft.status, 'In progress');
  const b = p.recordOperations({ movements: 30, pax: 3600, onTimePct: 82 });
  assert.ok(b.realisation > 0.8 && b.realisation <= 1);
  assert.ok(p.dateLabel(p.day).match(/^\w{3} \d{2} \w{3} 20\d{2}$/));
  const mc = p.missionContext;
  assert.ok(typeof mc.pct === 'function' && mc.pct('1.1') === 1 && mc.gateApproved('G0'));
  const rtm = p.rtm();
  assert.ok(rtm.length >= 20 && rtm[0].deliverables.length);
});

test('weather follows the Hyderabad calendar', () => {
  const p = new Project({ seed: 77 });
  const byMonth = Array.from({ length: 12 }, () => ({}));
  for (let i = 0; i < 730; i++) {
    p.step();
    const m = p.date().getUTCMonth();
    byMonth[m][p.weather.kind] = (byMonth[m][p.weather.kind] || 0) + 1;
  }
  const count = (months, kind) => months.reduce((s, m) => s + (byMonth[m][kind] || 0), 0);
  assert.ok(count([6, 7, 8], 'rain') > count([0, 1, 10, 11], 'rain'), 'monsoon Jul–Sep');
  assert.ok(count([4, 5], 'heat') > 5 && count([0, 1, 11], 'heat') === 0, 'heat May–Jun');
  assert.ok(count([11, 0], 'fog') > 0, 'winter fog');
  assert.ok(count([2, 3, 4, 5, 6], 'dust') > count([9, 10, 11, 0, 1], 'dust'), 'dust in spring/summer');
});
