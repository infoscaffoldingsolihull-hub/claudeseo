import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCPM, pertDuration, pertSigma, normalCdf, inverseNormal, pertAnalysis, crashCandidates, costSlope } from '../../src/pm/cpm.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('PERT three-point estimate: tₑ = (O+4M+P)/6, σ = (P−O)/6', () => {
  assert.equal(pertDuration(2, 4, 12), 5);
  near(pertSigma(2, 12), 10 / 6);
  assert.equal(pertDuration(30, 42, 60), 43);
});

test('normal CDF and its inverse', () => {
  near(normalCdf(0), 0.5, 1e-7);
  near(normalCdf(1.96), 0.975, 1e-4);
  near(normalCdf(-1), 0.158655, 1e-5);
  near(inverseNormal(0.975), 1.959964, 1e-5);
  near(inverseNormal(0.1), -1.281552, 1e-5);
});

/*
 * Hand-worked precedence network using all four link types:
 *   A 3d; B 4d FS A; C 2d SS A+1; D 5d FF B+2; E 2d SF C+4; F 3d FS D, FS E
 * Forward: A 0–3, B 3–7, C 1–3, D (7+2−5=4) 4–9, E (1+4−2=3) 3–5, F 9–12 → 12 days.
 * Backward: F 9/12, D 4/9 (TF 0), E 7/9 (TF 4), B lf = 9−2 = 7 (TF 0),
 *   C lf = 9−4+2 = 7 → ls 5 (TF 4), A lf = min(3, 5−1+3) = 3 (TF 0).
 * Free float: E = 9−5 = 4; C = 5−4−1 = 0; A = 0.
 */
const network = [
  { id: 'A', duration: 3, predecessors: [] },
  { id: 'B', duration: 4, predecessors: [{ id: 'A', type: 'FS', lag: 0 }] },
  { id: 'C', duration: 2, predecessors: [{ id: 'A', type: 'SS', lag: 1 }] },
  { id: 'D', duration: 5, predecessors: [{ id: 'B', type: 'FF', lag: 2 }] },
  { id: 'E', duration: 2, predecessors: [{ id: 'C', type: 'SF', lag: 4 }] },
  { id: 'F', duration: 3, predecessors: [{ id: 'D', type: 'FS' }, { id: 'E', type: 'FS' }] },
];

test('CPM forward/backward pass with FS, SS, FF, SF and lags', () => {
  const r = computeCPM(network);
  assert.equal(r.duration, 12);
  const n = (id) => r.nodes.get(id);
  assert.deepEqual([n('A').es, n('A').ef], [0, 3]);
  assert.deepEqual([n('B').es, n('B').ef], [3, 7]);
  assert.deepEqual([n('C').es, n('C').ef], [1, 3]);
  assert.deepEqual([n('D').es, n('D').ef], [4, 9]);
  assert.deepEqual([n('E').es, n('E').ef], [3, 5]);
  assert.deepEqual([n('F').es, n('F').ef], [9, 12]);
  assert.equal(n('E').totalFloat, 4);
  assert.equal(n('E').ls, 7);
  assert.equal(n('C').ls, 5);
  assert.equal(n('C').totalFloat, 4);
  assert.equal(n('E').freeFloat, 4);
  assert.equal(n('C').freeFloat, 0);
  assert.deepEqual(r.criticalPath, ['A', 'B', 'D', 'F']);
  assert.deepEqual(r.drivingPath, ['A', 'B', 'D', 'F']);
  for (const node of r.nodes.values()) assert.equal(node.totalFloat, node.ls - node.es);
});

test('CPM: leads (negative lag) and a cycle is rejected', () => {
  const r = computeCPM([
    { id: 'X', duration: 10, predecessors: [] },
    { id: 'Y', duration: 5, predecessors: [{ id: 'X', type: 'FS', lag: -3 }] },
  ]);
  assert.equal(r.nodes.get('Y').es, 7);
  assert.equal(r.duration, 12);
  assert.throws(() => computeCPM([
    { id: 'P', duration: 1, predecessors: [{ id: 'Q' }] },
    { id: 'Q', duration: 1, predecessors: [{ id: 'P' }] },
  ]), /cycle/);
});

test('CPM on a statused network: completed and in-progress activities', () => {
  // now = 0; X finished at −2 (started −10); Y in progress since −1 with 4 days left; Z FS Y.
  const r = computeCPM([
    { id: 'X', duration: 0, fixedStart: -10, fixedFinish: -2, predecessors: [] },
    { id: 'Y', duration: 4, fixedStart: -1, predecessors: [{ id: 'X', type: 'FS' }] },
    { id: 'Z', duration: 3, predecessors: [{ id: 'Y', type: 'FS', lag: 1 }] },
  ]);
  assert.equal(r.nodes.get('Y').ef, 4);
  assert.equal(r.nodes.get('Z').es, 5);
  assert.equal(r.duration, 8);
  assert.ok(!r.criticalPath.includes('X'));
});

test('PERT path analysis: σ_path = √Σσ², P(T ≤ d) = Φ((d − Tₑ)/σ)', () => {
  const tasks = [
    { id: 'X', o: 1, m: 3, p: 5, duration: 3, predecessors: [] },
    { id: 'Y', o: 2, m: 4, p: 12, duration: 5, predecessors: [{ id: 'X', type: 'FS' }] },
  ];
  const cpm = computeCPM(tasks);
  const pa = pertAnalysis(cpm, tasks, 10);
  near(pa.sigma, Math.sqrt((4 / 6) ** 2 + (10 / 6) ** 2));
  near(pa.probability, normalCdf((10 - 8) / pa.sigma));
  near(pa.probability, 0.8674, 1e-3);
  near(pa.atConfidence(0.5), 8, 1e-6);
});

test('cost slope = (crash cost − normal cost)/(normal time − crash time)', () => {
  assert.equal(costSlope({ duration: 6, crashDuration: 4, budget: 1000, crashCost: 1200 }), 100);
  assert.equal(costSlope({ duration: 4, crashDuration: 4, budget: 1, crashCost: 2 }), Infinity);
});

test('crashing in ascending cost-slope order, re-evaluating as the critical path changes', () => {
  // Paths: A(6)→C(4) = 10 and B(9) = 9. Slopes: C 50, A 100, B 300.
  // Day 1: crash C (cheapest critical) → 9; both paths now critical.
  // Days 2–3: no single activity shortens both paths → crash A and B together (400/day).
  const tasks = [
    { id: 'A', name: 'A', duration: 6, crashDuration: 4, budget: 1000, crashCost: 1200, predecessors: [] },
    { id: 'B', name: 'B', duration: 9, crashDuration: 6, budget: 2000, crashCost: 2900, predecessors: [] },
    { id: 'C', name: 'C', duration: 4, crashDuration: 3, budget: 500, crashCost: 550, predecessors: [{ id: 'A', type: 'FS' }] },
  ];
  const r = crashCandidates(null, tasks, 3);
  assert.equal(r.recovered, 3);
  assert.equal(r.finalDuration, 7);
  assert.equal(r.addedCost, 850);
  assert.deepEqual(r.plan.map((p) => [p.id, p.days, p.cost]), [['C', 1, 50], ['A', 2, 200], ['B', 2, 600]]);
  const more = crashCandidates(null, tasks, 10);
  assert.ok(more.shortfall > 0, 'cannot crash below the crash durations');
});
