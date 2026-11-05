import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emv, riskScore, probabilityScore, impactScore, decisionTree } from '../../src/pm/risk.js';
import { xbarR, imr, westernElectric, pareto, capability, SPC_CONSTANTS } from '../../src/pm/quality.js';
import { channels, salience, gridQuadrant } from '../../src/pm/comms.js';
import { weightedScore, contractOutcome, pointOfTotalAssumption, makeOrBuy } from '../../src/pm/procurement.js';
import { tallyVotes, CCB_MEMBERS, ruleVote } from '../../src/pm/change.js';
import { planSprint, velocityStats, releaseForecast, burndownSeries, wipExceeded } from '../../src/pm/agile.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('EMV is signed: threats negative, opportunities positive', () => {
  assert.equal(emv(0.3, 1000), -300);
  assert.equal(emv(0.3, 1000, 'threat'), -300);
  assert.equal(emv(0.25, 800, 'opportunity'), 200);
  assert.equal(riskScore(4, 5), 20);
  assert.equal(probabilityScore(0.05), 1);
  assert.equal(probabilityScore(0.5), 4);
  assert.equal(impactScore({ cost: 3e9, days: 5 }, { bac: 60e9 }), 5);
  assert.equal(impactScore({ cost: 0, days: 45 }, { bac: 60e9 }), 4);
});

test('decision tree roll-back: build new vs upgrade', () => {
  // Build: −120 + 0.6×200 + 0.4×90 = 36; Upgrade: −50 + 0.6×120 + 0.4×60 = 46 → upgrade.
  const r = decisionTree({
    type: 'decision',
    options: [
      { label: 'Build new', cost: 120, node: { type: 'chance', branches: [{ p: 0.6, value: 200 }, { p: 0.4, value: 90 }] } },
      { label: 'Upgrade', cost: 50, node: { type: 'chance', branches: [{ p: 0.6, value: 120 }, { p: 0.4, value: 60 }] } },
    ],
  });
  near(r.value, 46);
  assert.equal(r.choice, 'Upgrade');
  near(r.options[0].value, 36);
  assert.throws(() => decisionTree({ type: 'chance', branches: [{ p: 0.5, value: 1 }] }));
});

test('X̄–R chart limits with A2, D3, D4', () => {
  const r = xbarR([[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]]);
  near(r.xbarbar, 3.5);
  near(r.rbar, 4);
  assert.equal(r.A2, 0.577);
  near(r.ucl, 3.5 + 0.577 * 4);
  near(r.lcl, 3.5 - 0.577 * 4);
  near(r.rUcl, 2.114 * 4);
  assert.equal(r.rLcl, 0);
  assert.equal(SPC_CONSTANTS.D3[7], 0.076);
});

test('I-MR chart: X̄ ± 3·MR̄/1.128, MR UCL = 3.267·MR̄', () => {
  const r = imr([10, 12, 11, 13]);
  near(r.mrBar, 5 / 3);
  near(r.mean, 11.5);
  near(r.ucl, 11.5 + (3 * (5 / 3)) / 1.128);
  near(r.lcl, 11.5 - (3 * (5 / 3)) / 1.128);
  near(r.mrUcl, 3.267 * (5 / 3));
});

test('Western Electric rules 1–4', () => {
  const rules = (v) => [...new Set(westernElectric(v, 0, 1).map((x) => x.rule))];
  assert.deepEqual(rules([0, 0.2, 3.5]), [1]);
  assert.deepEqual(rules([0, 2.5, -0.5, 2.4]).includes(2), true);
  assert.deepEqual(rules([-0.2, 1.5, 1.2, 0.3, 1.4, 1.1]).includes(3), true);
  assert.deepEqual(rules([0.5, 0.3, 0.2, 0.6, 0.4, 0.1, 0.7, 0.2]), [4]);
  assert.deepEqual(rules([0.5, -0.3, 0.2, -0.6]), []);
});

test('Pareto: sorted, cumulative %, vital few', () => {
  const p = pareto({ Glazing: 20, Compaction: 50, Cables: 30 });
  assert.deepEqual(p.map((x) => x.category), ['Compaction', 'Cables', 'Glazing']);
  assert.deepEqual(p.map((x) => x.cumulativePct), [50, 80, 100]);
  assert.deepEqual(p.filter((x) => x.vital).map((x) => x.category), ['Compaction', 'Cables']);
  const c = capability({ mean: 98.5, sigma: 1, lsl: 95, usl: 102 });
  near(c.cp, 7 / 6);
  near(c.cpk, 3.5 / 3);
});

test('communication channels n(n−1)/2 and stakeholder models', () => {
  assert.equal(channels(4), 6);
  assert.equal(channels(17), 136);
  assert.equal(channels(1), 0);
  assert.equal(salience({ power: 0.9, legitimacy: 0.9, urgency: 0.9 }), 'Definitive');
  assert.equal(salience({ power: 0.2, legitimacy: 0.6, urgency: 0.9 }), 'Dependent');
  assert.equal(gridQuadrant(0.9, 0.2), 'Keep satisfied');
});

test('contract types: FFP, FPIF (with ceiling & PTA), CPFF, CPIF, CPAF, T&M', () => {
  const fpif = contractOutcome({ type: 'FPIF', targetCost: 150000, targetFee: 15000, buyerShare: 0.8, ceiling: 180000, actualCost: 170000 });
  assert.equal(fpif.buyerPays, 180000);          // 181,000 capped at the ceiling
  assert.ok(fpif.capped);
  near(fpif.pta, 168750);                         // 150,000 + (180,000 − 165,000)/0.8
  near(pointOfTotalAssumption({ targetCost: 150000, targetFee: 15000, ceiling: 180000, buyerShare: 0.8 }), 168750);
  const under = contractOutcome({ type: 'FPIF', targetCost: 150000, targetFee: 15000, buyerShare: 0.8, ceiling: 180000, actualCost: 140000 });
  near(under.buyerPays, 140000 + 15000 + 0.2 * 10000);
  const cpif = contractOutcome({ type: 'CPIF', targetCost: 210000, targetFee: 25000, buyerShare: 0.8, actualCost: 200000 });
  assert.equal(cpif.fee, 27000);
  assert.equal(cpif.buyerPays, 227000);
  assert.equal(contractOutcome({ type: 'CPFF', fee: 10, actualCost: 100 }).buyerPays, 110);
  assert.equal(contractOutcome({ type: 'CPAF', baseFee: 10, awardPool: 20, awardScore: 0.5, actualCost: 100 }).buyerPays, 120);
  const tm = contractOutcome({ type: 'T&M', hours: 100, rate: 50, materials: 1000, nte: 5500 });
  assert.equal(tm.buyerPays, 5500);
  assert.equal(contractOutcome({ type: 'FFP', price: 500, actualCost: 520 }).sellerProfit, -20);
});

test('weighted scoring and make-or-buy break-even', () => {
  const ranked = weightedScore([
    { vendor: 'Cheap', price: 90, technical: 60, experience: 60, schedule: 60 },
    { vendor: 'Good', price: 100, technical: 90, experience: 85, schedule: 85 },
  ]);
  assert.equal(ranked[0].vendor, 'Good');
  near(ranked[1].priceScore, 100);
  near(ranked[0].priceScore, 90);
  const mb = makeOrBuy({ makeFixed: 10000, makeUnit: 5, buyUnit: 7, quantity: 4000 });
  assert.equal(mb.breakEven, 5000);
  assert.equal(mb.decision, 'Buy');
});

test('CCB vote tally with chair casting vote', () => {
  const v = Object.fromEntries(CCB_MEMBERS.map((m, i) => [m.role, i < 3 ? 'approve' : 'reject']));
  assert.equal(tallyVotes(v).decision, 'Approved');
  const tie = { [CCB_MEMBERS[0].role]: 'approve', [CCB_MEMBERS[1].role]: 'reject', [CCB_MEMBERS[2].role]: 'reject', [CCB_MEMBERS[3].role]: 'approve' };
  assert.equal(tallyVotes(tie).decision, 'Approved');
  assert.equal(tallyVotes({}).quorum, false);
  assert.equal(ruleVote({ lens: 'cost' }, { merit: 0.6, costRatio: 0.02 }), 'reject');
});

test('Scrum helpers: sprint planning, velocity, release forecast, burndown, WIP', () => {
  const backlog = [
    { id: 'a', points: 5, priority: 1, status: 'backlog' },
    { id: 'b', points: 8, priority: 2, status: 'backlog' },
    { id: 'c', points: 3, priority: 3, status: 'backlog' },
  ];
  assert.deepEqual(planSprint(backlog, 10).ids, ['a', 'b']);
  assert.deepEqual(planSprint(backlog, 8).ids, ['a', 'c']);
  const v = velocityStats([10, 12, 14, 16]);
  assert.equal(v.average3, 14);
  assert.equal(v.last, 16);
  assert.deepEqual(releaseForecast(30, 14, 14, 100), { sprints: 3, finishDay: 142 });
  const bd = burndownSeries({ startDay: 0, committed: 14, burn: [14, 13] }, 14);
  assert.equal(bd.length, 15);
  assert.equal(bd[14].ideal, 0);
  assert.equal(bd[1].remaining, 13);
  assert.ok(wipExceeded([{ status: 'doing' }, { status: 'doing' }], { doing: 2 }, 'doing'));
});
