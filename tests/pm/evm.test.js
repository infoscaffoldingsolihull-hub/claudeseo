import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evmMetrics, earnedSchedule, buildPvCurve } from '../../src/pm/evm.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('EVM textbook example: BAC 100k, PV 50k, EV 40k, AC 45k', () => {
  const m = evmMetrics({ bac: 100000, pv: 50000, ev: 40000, ac: 45000, etcBottomUp: 70000 });
  assert.equal(m.cv, -5000);
  assert.equal(m.sv, -10000);
  near(m.cpi, 40000 / 45000);
  near(m.spi, 0.8);
  near(m.eac.cpi, 112500);                       // BAC / CPI
  near(m.eac.atBudget, 105000);                  // AC + (BAC − EV)
  near(m.eac.composite, 45000 + 60000 / ((40000 / 45000) * 0.8)); // 129,375
  near(m.eac.composite, 129375);
  near(m.eac.bottomUp, 115000);                  // AC + bottom-up ETC
  near(m.etc, 67500);                            // EAC − AC
  near(m.vac, -12500);                           // BAC − EAC
  near(m.tcpi.bac, 60000 / 55000);               // (BAC − EV)/(BAC − AC)
  near(m.tcpi.eac, 60000 / 67500);               // (BAC − EV)/(EAC − AC) = CPI
  near(m.tcpi.eac, m.cpi);
});

test('EVM guards: no actuals yet', () => {
  const m = evmMetrics({ bac: 100, pv: 0, ev: 0, ac: 0 });
  assert.equal(m.cpi, 1);
  assert.equal(m.spi, 1);
  assert.equal(m.eac.cpi, 100);
});

test('earned schedule (Lipke): ES = C + (EV − PV_C)/(PV_C+1 − PV_C)', () => {
  const pv = [0, 100, 200, 300, 400, 500];
  const r = earnedSchedule(pv, 250, 4, 5);
  near(r.es, 2.5);
  near(r.svt, -1.5);
  near(r.spit, 0.625);
  near(r.ieact, 8);                              // PD / SPI(t)
  assert.equal(earnedSchedule(pv, 0, 3).es, 0);
  assert.equal(earnedSchedule(pv, 500, 6).es, 5);
});

test('PV curve spreads each budget linearly between start and finish', () => {
  const c = buildPvCurve([{ start: 0, finish: 4, budget: 400 }, { start: 2, finish: 2, budget: 50 }], 5);
  assert.deepEqual(Array.from(c), [0, 100, 250, 350, 450, 450]);
});
