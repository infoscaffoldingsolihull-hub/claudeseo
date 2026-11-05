import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMonteCarlo, createMonteCarlo, createMonteCarloWorker, buildMonteCarloSpec, monteCarloKernel, samplePert, sampleTriangular, mulberry32 } from '../../src/pm/montecarlo.js';
import { Project } from '../../src/pm/project.js';
import { computeCPM } from '../../src/pm/cpm.js';

function miniProject(tasks) {
  const state = new Map(tasks.map((t) => [t.id, { pct: 0, actualStart: null, actualFinish: null, remainingWork: t.duration, notBefore: 0 }]));
  return { tasks, state, risks: [], ac: 0, bac: 100, baselineDuration: computeCPM(tasks).duration, day: 0, seed: 1, forecastFinish: 0 };
}

test('PERT-beta and triangular samplers have the right means', () => {
  const rng = mulberry32(42);
  let a = 0;
  let b = 0;
  const n = 40000;
  for (let i = 0; i < n; i++) { a += samplePert(rng, 2, 4, 12); b += sampleTriangular(rng, 2, 4, 12); }
  assert.ok(Math.abs(a / n - 5) < 0.05, `PERT mean ${a / n}`);
  assert.ok(Math.abs(b / n - 6) < 0.06, `triangular mean ${b / n}`);
});

test('zero-variance network: every iteration equals the CPM duration (all link types)', () => {
  const tasks = [
    { id: 'A', code: 'A', name: 'A', o: 3, m: 3, p: 3, duration: 3, predecessors: [] },
    { id: 'B', code: 'B', name: 'B', o: 4, m: 4, p: 4, duration: 4, predecessors: [{ id: 'A', type: 'FS', lag: 0 }] },
    { id: 'C', code: 'C', name: 'C', o: 2, m: 2, p: 2, duration: 2, predecessors: [{ id: 'A', type: 'SS', lag: 1 }] },
    { id: 'D', code: 'D', name: 'D', o: 5, m: 5, p: 5, duration: 5, predecessors: [{ id: 'B', type: 'FF', lag: 2 }] },
    { id: 'E', code: 'E', name: 'E', o: 2, m: 2, p: 2, duration: 2, predecessors: [{ id: 'C', type: 'SF', lag: 4 }] },
    { id: 'F', code: 'F', name: 'F', o: 3, m: 3, p: 3, duration: 3, predecessors: [{ id: 'D' }, { id: 'E' }] },
  ];
  const r = monteCarloKernel(buildMonteCarloSpec(miniProject(tasks), { iterations: 200 }));
  r.step(200);
  const out = r.finish();
  assert.equal(out.finish.min, 12);
  assert.equal(out.finish.max, 12);
  assert.equal(out.probabilityOnTime, 1);
});

test('Monte Carlo on the live programme: ≥ 5,000 iterations, ordered percentiles, histogram, S-curve, tornado', () => {
  const p = new Project({ seed: 99 });
  const t0 = Date.now();
  const r = runMonteCarlo(p);
  const ms = Date.now() - t0;
  assert.equal(r.iterations, 5000);
  const f = r.finish;
  assert.ok(f.p10 <= f.p50 && f.p50 <= f.p80 && f.p80 <= f.p90);
  assert.ok(f.p50 > p.baselineDuration * 0.9 && f.p90 < p.baselineDuration * 1.6);
  assert.equal(f.histogram.counts.reduce((a, b) => a + b, 0), 5000);
  assert.equal(f.sCurve.length, 41);
  assert.ok(r.cost.p10 <= r.cost.p90);
  assert.ok(r.probabilityOnTime >= 0 && r.probabilityOnTime <= 1);
  assert.ok(r.tornado.length > 3);
  assert.ok(r.tornado[0].code && Math.abs(r.tornado[0].correlation) <= 1);
  // The terminal chain drives the finish in the baseline.
  assert.ok(r.tornado.slice(0, 6).some((x) => x.id.startsWith('7.')), JSON.stringify(r.tornado.slice(0, 6)));
  assert.ok(ms < 5000, `MC took ${ms} ms`);
  // Same seed → same answer; triangular option works.
  assert.equal(runMonteCarlo(p, { iterations: 500, seed: 5 }).finish.p50, runMonteCarlo(p, { iterations: 500, seed: 5 }).finish.p50);
  assert.equal(runMonteCarlo(p, { iterations: 500, distribution: 'triangular' }).distribution, 'triangular');
});

test('batched run and Worker guard', () => {
  const p = new Project({ seed: 3 });
  const run = createMonteCarlo(p, { iterations: 1000 });
  assert.equal(run.step(400), false);
  assert.ok(Math.abs(run.progress - 0.4) < 1e-9);
  run.step(1000);
  assert.ok(run.done);
  assert.equal(run.finish().iterations, 1000);
  assert.equal(createMonteCarloWorker(), null, 'no Worker in Node');
  // The kernel must be self-contained so it survives Function#toString into a Blob worker.
  const rebuilt = new Function(`return (${monteCarloKernel.toString()});`)();
  const k = rebuilt(buildMonteCarloSpec(p, { iterations: 50, seed: 1 }));
  k.step(50);
  assert.equal(k.finish().iterations, 50);
});
