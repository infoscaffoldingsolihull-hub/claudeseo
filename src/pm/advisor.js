/**
 * Hemiunu — the AI project advisor.
 *
 * Hemiunu was Khufu's vizier and "Overseer of All the King's Works"; his
 * statue is in Hildesheim and his mastaba stands in the eastern cemetery a few
 * hundred metres from where the player is standing.  Here he is a diagnostic
 * engine: every day he reads the same measures the dashboard shows, works out
 * which of them actually explains the variance, and states a recommendation
 * with a number attached.
 *
 * The reasoning is explicit and inspectable — a rule base over the earned-value
 * measures, the critical path, resource fulfilment and the risk register, with
 * Monte Carlo forecasting for the probabilistic statements.  Nothing here is a
 * black box, which matters when the audience asks how it works.
 */

const SEVERITY_ORDER = { crit: 0, warn: 1, info: 2, good: 3 };

function pct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

function days(v) {
  const n = Math.round(Math.abs(v));
  return `${n} day${n === 1 ? '' : 's'}`;
}

function kdb(v) {
  return `${Math.round(v).toLocaleString()} kdb`;
}

export class Advisor {
  constructor(project) {
    this.project = project;
    this.lastForecast = null;
    this.history = [];
  }

  /** Set the Monte Carlo result the advisor should quote. */
  setForecast(result) {
    this.lastForecast = result;
  }

  /**
   * Produce a ranked list of advice items.
   * Each item: { severity, title, why, recommendation, impact, action }
   */
  analyse() {
    const p = this.project;
    const out = [];
    const snap = p.snapshot();

    /* ---------------------------------------------------- schedule health */
    if (snap.spi < 0.995) {
      const behindDays = Math.max(0, -snap.svt);
      const driver = this._scheduleDriver();
      out.push({
        severity: snap.spi < 0.9 ? 'crit' : 'warn',
        title: `Project is ${days(behindDays)} behind schedule`,
        why:
          `SPI is ${snap.spi.toFixed(3)} and earned schedule is ${days(behindDays)} short of actual time. ` +
          (driver
            ? `The binding constraint is ${driver.code} ${driver.name}, which is ${pct(driver.pctComplete)} complete and ${driver.reason}.`
            : 'No single package dominates; the loss is spread across the critical path.'),
        recommendation: driver
          ? driver.recommendation
          : 'Re-baseline or crash the critical path; see the Schedule panel for the crash cost curve.',
        impact: driver ? driver.impact : null,
        action: driver ? driver.action : null,
      });
    } else if (snap.spi > 1.02) {
      out.push({
        severity: 'good',
        title: `Ahead of schedule by ${days(snap.svt)}`,
        why: `SPI ${snap.spi.toFixed(3)}. Earned value is running ahead of the baseline curve.`,
        recommendation:
          'Do not bank it. Pull forward 7.1 Casing Stone Dressing so the finish trade is never the constraint.',
      });
    }

    /* -------------------------------------------------------- cost health */
    if (snap.cpi < 0.98) {
      const idle = this._idleLabour();
      out.push({
        severity: snap.cpi < 0.88 ? 'crit' : 'warn',
        title: `Cost performance index is ${snap.cpi.toFixed(3)}`,
        why:
          `Cost variance is ${kdb(snap.cv)}. ` +
          (idle
            ? `${idle.name} is staffed at ${idle.assigned.toLocaleString()} against a demand of ${Math.round(idle.required).toLocaleString()} — ` +
              `${kdb(idle.waste)} per day is being paid for labour that has no work face.`
            : 'The overrun is in materials and rework rather than in idle labour.'),
        recommendation: idle
          ? `Stand down ${Math.round(idle.excess).toLocaleString()} ${idle.unit} from ${idle.name}. Saves ${kdb(idle.waste)} a day with no effect on the critical path.`
          : 'Tighten inspection to cut rework: internal failure is the largest single overrun line.',
        impact: idle ? `EAC improves by roughly ${kdb(idle.waste * Math.max(0, p.baselineDuration - p.day) * 0.35)}` : null,
        action: idle ? { type: 'staffing', resource: idle.id, value: Math.round(idle.required * 1.05) } : null,
      });
    }

    /* ----------------------------------------------------------- forecast */
    if (snap.forecastFinish && snap.scheduleVarianceDays > 30) {
      const crash = p.crashPlan(Math.min(snap.scheduleVarianceDays, 240));
      out.push({
        severity: snap.scheduleVarianceDays > 200 ? 'crit' : 'warn',
        title: `Forecast completion is ${days(snap.scheduleVarianceDays)} beyond baseline`,
        why:
          `Re-running the network on remaining durations puts handover at day ${Math.round(snap.forecastFinish)} ` +
          `against a baseline of ${p.baselineDuration}.`,
        recommendation:
          crash.plan.length > 0
            ? `Crash ${crash.plan.slice(0, 3).map((c) => c.id).join(', ')} to recover ${days(crash.recovered)} for ${kdb(crash.addedCost)} — ` +
              `a cost slope of ${kdb(crash.addedCost / Math.max(1, crash.recovered))} per day.`
            : 'No crashable float remains on the critical path; the only lever left is scope.',
        impact: crash.shortfall > 0 ? `${days(crash.shortfall)} cannot be recovered by crashing alone.` : null,
        action: crash.plan.length ? { type: 'crash', plan: crash.plan } : null,
      });
    }

    /* ------------------------------------------------------------- supply */
    if (p.stoneStock < 0.3) {
      const quarry = p.resourceById.get('quarrymen');
      const target = Math.min(quarry.capacity, Math.round(quarry.assigned * 1.15));
      out.push({
        severity: p.stoneStock < 0.15 ? 'crit' : 'warn',
        title: 'Dressed stone stock is running out',
        why:
          `The stockpile beside the ramp holds ${pct(p.stoneStock)} of its buffer. ` +
          'Placement is now limited by supply, not by the setting gangs.',
        recommendation: `Increase the quarry workforce by 15% — from ${quarry.assigned.toLocaleString()} to ${target.toLocaleString()}.`,
        impact: 'Restores the buffer in roughly 40 days at current placement rates.',
        action: { type: 'staffing', resource: 'quarrymen', value: target },
      });
    }
    if (p.toolStock < 0.3) {
      out.push({
        severity: 'warn',
        title: 'Copper tool stock is low',
        why: `Tool stock at ${pct(p.toolStock)}. Chisels blunt within hours in nummulitic limestone.`,
        recommendation:
          p.state.get('2.4').pct < 1
            ? 'Prioritise 2.4 Copper Tool Supply — the Sinai expedition is still open.'
            : 'Expand the resharpening workshop at Heit el-Ghurab; raise artisan staffing by 10%.',
        impact: 'Quarry output is currently capped at ' + pct(0.6 + p.toolStock * 0.4) + ' of nominal.',
      });
    }

    /* ------------------------------------------------------------ welfare */
    if (p.welfare < 0.6) {
      out.push({
        severity: p.welfare < 0.45 ? 'crit' : 'warn',
        title: 'Worker welfare is falling',
        why:
          `Welfare index ${pct(p.welfare)}. Provisioning is ${pct(p.state.get('4.2').pct)} complete and the town ` +
          `supports fewer people than are on site. Productivity scales directly with this number.`,
        recommendation:
          'Complete 4.2 Provisioning before adding any more labour. Adding workers to an under-fed site reduces output.',
        impact: `Every 10 points of welfare is worth about 5.5% on the daily placement rate.`,
      });
    }

    /* --------------------------------------------------------------- risk */
    const untreated = p.risks
      .filter((r) => r.status === 'Open' && r.response === 'Accept' && r.currentProbability * r.costImpact > 6000)
      .sort((a, b) => b.currentProbability * b.costImpact - a.currentProbability * a.costImpact);
    if (untreated.length) {
      const r = untreated[0];
      out.push({
        severity: 'warn',
        title: `${r.id} carries the largest untreated exposure`,
        why: `${r.name}: ${pct(r.currentProbability)} × ${kdb(r.costImpact)} = ${kdb(r.currentProbability * r.costImpact)} EMV, and ${days(r.scheduleImpact)} of schedule.`,
        recommendation: `${r.responsePlan} Residual probability falls to ${pct(r.residual)}.`,
        impact: `Reduces exposure by ${kdb((r.currentProbability - r.residual) * r.costImpact)}.`,
        action: { type: 'risk', risk: r.id, strategy: 'Mitigate' },
      });
    }
    if (p.contingencyRemaining < p.contingencyReserve * 0.25) {
      out.push({
        severity: 'crit',
        title: 'Contingency reserve nearly exhausted',
        why: `${kdb(p.contingencyRemaining)} left of an original ${kdb(p.contingencyReserve)}. Realised risks: ${p.realisedRisks}.`,
        recommendation:
          'Escalate to the sponsor now. A reserve request made before the reserve is gone is a management decision; made afterwards it is an apology.',
      });
    }

    /* ------------------------------------------------------------ quality */
    for (const task of p.tasks) {
      const gate = task.spec.qualityGate;
      if (!gate) continue;
      const value = p.quality[gate.metric];
      if (value > gate.tolerance * 0.75 && p.state.get(task.id).pct < 1) {
        out.push({
          severity: value > gate.tolerance ? 'crit' : 'warn',
          title: `Quality drifting on ${task.code}`,
          why: `${gate.metric} is ${value.toFixed(2)} ${gate.unit} against a target of ${gate.target} and a tolerance of ${gate.tolerance}.`,
          recommendation:
            'Raise the inspection level. Appraisal cost is roughly a tenth of the internal failure cost it prevents.',
          impact: 'Rework on this package has already cost ' + kdb(p.costOfQuality.internalFailure),
          action: { type: 'inspection', value: Math.min(1.8, p.inspectionLevel + 0.3) },
        });
        break;
      }
    }

    /* ------------------------------------------------------- stakeholders */
    const unhappy = p.stakeholders
      .filter((s) => s.level < 3 || (s.desired === 'leading' && s.level < 4))
      .sort((a, b) => a.satisfaction - b.satisfaction);
    if (unhappy.length) {
      const s = unhappy[0];
      out.push({
        severity: s.level <= 2 ? 'warn' : 'info',
        title: `${s.name} is ${s.levelName}, target ${s.desired}`,
        why: `${s.influence} Satisfaction ${pct(s.satisfaction)}.`,
        recommendation: s.strategy,
      });
    }

    /* ------------------------------------------------- probabilistic view */
    if (this.lastForecast) {
      const f = this.lastForecast;
      out.push({
        severity: f.probabilityOnTime < 0.4 ? 'warn' : 'info',
        title: `Monte Carlo: ${pct(f.probabilityOnTime)} chance of meeting the baseline`,
        why:
          `${f.iterations.toLocaleString()} iterations over the remaining network. ` +
          `P50 finish day ${Math.round(f.finish.p50)}, P80 day ${Math.round(f.finish.p80)}, ` +
          `against a baseline of ${f.baseline}.`,
        recommendation:
          f.tornado.length
            ? `${f.tornado[0].code} ${f.tornado[0].name} has the strongest influence on the finish date (r = ${f.tornado[0].correlation.toFixed(2)}). Manage its estimate before anything else.`
            : 'The remaining network is well balanced; no single package dominates the outcome.',
        impact: `Commit to the P80 date (day ${Math.round(f.finish.p80)}) if the sponsor needs a date he can rely on.`,
      });
    }

    if (!out.length) {
      out.push({
        severity: 'good',
        title: 'The works are in hand',
        why: `SPI ${snap.spi.toFixed(3)}, CPI ${snap.cpi.toFixed(3)}, welfare ${pct(p.welfare)}, no untreated exposure above 6 000 kdb.`,
        recommendation: 'Hold the current staffing and keep the stone buffer above 40%.',
      });
    }

    out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return out.slice(0, 6);
  }

  /** Which critical-path package is actually costing the schedule, and why. */
  _scheduleDriver() {
    const p = this.project;
    const network = p.forecast || p.baseline;
    let worst = null;
    for (const id of network.criticalPath) {
      const task = p.taskById.get(id);
      const st = p.state.get(id);
      if (!task || !st || st.pct >= 1) continue;
      const planned = p.baseline.nodes.get(id);
      const expected = Math.max(0, Math.min(1, (p.day - planned.es) / Math.max(1, task.duration)));
      const gap = expected - st.pct;
      if (!worst || gap > worst.gap) worst = { task, st, gap, planned };
    }
    if (!worst || worst.gap <= 0.01) return null;

    const { task, st } = worst;
    // Root cause: blocked, resource-starved, risk-affected, or supply-limited.
    let reason = 'behind its planned progress';
    let recommendation = 'Review the package with its owner.';
    let impact = null;
    let action = null;

    if (st.blocked) {
      reason = `blocked — ${st.blocked}`;
      recommendation = `Clear the predecessor. Until it finishes, no amount of labour on ${task.code} will help.`;
    } else {
      let scarcest = null;
      for (const [key, need] of Object.entries(task.crew)) {
        const r = p.resourceById.get(key);
        if (!r || r.required <= 0) continue;
        const f = r.assigned / r.required;
        if (!scarcest || f < scarcest.f) scarcest = { r, f, need };
      }
      if (scarcest && scarcest.f < 0.98) {
        const target = Math.min(scarcest.r.capacity, Math.round(scarcest.r.required * 1.05));
        const uplift = (target - scarcest.r.assigned) / Math.max(1, scarcest.r.assigned);
        reason = `starved of ${scarcest.r.name.toLowerCase()} at ${pct(scarcest.f)} of demand`;
        recommendation = `Increase ${scarcest.r.name.toLowerCase()} by ${pct(uplift)} — from ${scarcest.r.assigned.toLocaleString()} to ${target.toLocaleString()}.`;
        impact = `Restores the package to full rate; recovers roughly ${days(worst.gap * task.duration)} over its remaining span.`;
        action = { type: 'staffing', resource: scarcest.r.id, value: target };
      } else if (p.stoneStock < 0.35) {
        reason = 'limited by stone supply rather than by labour';
        recommendation = 'Fix the quarry before adding setting masons; the constraint is upstream.';
      } else {
        const active = p.risks.find((r) => r.activeUntil && r.affects.includes(task.id));
        if (active) {
          reason = `affected by the realised risk ${active.id} (${active.name})`;
          recommendation = `${active.responsePlan}`;
          impact = `Effect persists for a further ${days(active.activeUntil - p.day)}.`;
        } else {
          reason = 'losing rate to welfare and tool availability';
          recommendation = 'Complete provisioning and tool supply before adding headcount.';
        }
      }
    }

    return {
      id: task.id,
      code: task.code,
      name: task.name,
      pctComplete: st.pct,
      reason,
      recommendation,
      impact,
      action,
    };
  }

  /** The most over-staffed resource pool, if any. */
  _idleLabour() {
    const p = this.project;
    let worst = null;
    for (const r of p.resources) {
      if (r.required <= 0) continue;
      const excess = r.assigned - r.required;
      if (excess <= r.required * 0.06) continue;
      const waste = excess * r.dayRate;
      if (!worst || waste > worst.waste) {
        worst = { id: r.id, name: r.name, unit: r.unit, assigned: r.assigned, required: r.required, excess, waste };
      }
    }
    return worst;
  }

  /** One-line status for the HUD. */
  headline() {
    const p = this.project;
    const s = p.snapshot();
    if (s.finished) return 'Akhet Khufu is complete. The horizon of Khufu stands.';
    if (s.spi < 0.9) return `Behind schedule by ${days(-s.svt)}. Critical path is the constraint.`;
    if (s.cpi < 0.9) return `Over budget: CPI ${s.cpi.toFixed(2)}. Idle labour is the largest single line.`;
    if (p.stoneStock < 0.25) return 'Stone supply is the binding constraint today.';
    if (p.welfare < 0.55) return 'Welfare is limiting output. Feed the workforce before enlarging it.';
    return `On plan. SPI ${s.spi.toFixed(2)} · CPI ${s.cpi.toFixed(2)} · ${pct(s.progress)} earned.`;
  }
}
