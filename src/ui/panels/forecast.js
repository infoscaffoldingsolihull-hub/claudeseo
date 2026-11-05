import { el, kpi, button, table, select, toggle, bar, fmtPKR, fmtPct } from '../dom.js';
import { C, chartBox, legend, histogramChart, lineChart, tornadoChart, dayTicks, shortDate, money, section, card, animOnce, dl } from '../charts.js';
import { createMonteCarloWorker, createMonteCarlo } from '../../pm/montecarlo.js';
import { inverseNormal } from '../../pm/cpm.js';

/**
 * Monte Carlo Forecast (Week 10): ≥ 5,000 iterations of the live network with
 * PERT-Beta (or triangular) durations and the risk register as discrete
 * events, run in a Web Worker so the 3D view never stalls (chunked fallback
 * on the main thread). Finish and cost histograms with cumulative curves,
 * P10/P50/P80/P90, probability of finishing on time and on budget, and a
 * tornado chart of the activities that drive the finish. Results feed MEHRAN.
 */

let WORKER = null;
let WORKER_TRIED = false;
function getWorker() {
  if (!WORKER_TRIED) {
    WORKER_TRIED = true;
    try { WORKER = createMonteCarloWorker(); } catch { WORKER = null; }
  }
  return WORKER;
}

function setProgress(s, f) {
  s.progress = f;
  if (s.progEl && s.progEl.isConnected) {
    const i = s.progEl.querySelector('.bar i');
    if (i) i.style.width = `${Math.round(f * 100)}%`;
    const t = s.progEl.querySelector('.mc-pct');
    if (t) t.textContent = `${Math.round(f * 100)}% · ${Math.round(f * (s.runOpts ? s.runOpts.iterations : 5000)).toLocaleString('en-US')} iterations`;
  }
}

function runMC(dash) {
  const s = dash.state;
  const p = dash.project;
  if (s.running || !p) return;
  const opts = { iterations: s.iter || 5000, distribution: s.dist || 'pert', includeRisks: s.withRisks !== false };
  s.running = true;
  s.runOpts = opts;
  s.progress = 0;
  const t0 = performance.now();
  let engine = 'Web Worker';
  const finish = (res) => {
    s.running = false;
    if (dash.project !== p) return;
    res.engine = engine;
    res.ms = Math.round(performance.now() - t0);
    res.includeRisks = opts.includeRisks;
    s.mc = res;
    s.runs = [{ day: p.day, it: res.iterations, p50: res.finish.p50, p80: res.finish.p80, c80: res.cost.p80, onTime: res.probabilityOnTime, engine }, ...(s.runs || [])].slice(0, 8);
    const ai = dash.sim.ai;
    try {
      if (ai && typeof ai.setMonteCarlo === 'function') ai.setMonteCarlo(res);
      else if (ai && typeof ai.setForecast === 'function') ai.setForecast(res);
    } catch (err) { console.error('[forecast] could not share the result with MEHRAN', err); }
    if (dash.openId === 'forecast') dash.rerender();
  };
  const chunked = () => {
    engine = 'main thread (chunked)';
    const run = createMonteCarlo(p, opts);
    const loop = () => {
      if (dash.project !== p) { s.running = false; return; }
      const done = run.step(300);
      setProgress(s, run.progress);
      if (done) finish(run.finish());
      else setTimeout(loop, 0);
    };
    loop();
  };
  const w = getWorker();
  if (w && !w.busy) {
    w.run(p, { ...opts, onProgress: (f) => setProgress(s, f) }).then(finish, () => { WORKER = null; chunked(); });
  } else chunked();
}

export const PANEL_FORECAST = {
  id: 'forecast',
  onOpen(dash) {
    const s = dash.stateFor('forecast');
    const p = dash.project;
    if (!s.running && (!s.mc || Math.abs(p.day - s.mc.day) > 30)) setTimeout(() => runMC(dash), 60);
  },
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    body.appendChild(el('p', { class: 'lede', text: 'A single CPM date hides the uncertainty in every estimate and the risks waiting in the register. Monte Carlo simulation replays the remaining project thousands of times, sampling each duration and risk, to show the range of outcomes and how confident we can be in a date or a budget.' }));
    const prog = el('div', { class: 'mc-progress', 'aria-live': 'polite' }, [
      el('span', { text: s.running ? 'Simulating…' : s.mc ? `Last run: day ${s.mc.day} · ${s.mc.iterations.toLocaleString('en-US')} iterations · ${s.mc.engine} · ${s.mc.ms} ms` : 'Not run yet' }),
      bar(s.running ? s.progress || 0 : s.mc ? 1 : 0, s.running ? 'info' : 'ok', 'Monte Carlo progress'),
      el('span', { class: 'mc-pct pm-mono', text: s.running ? `${Math.round((s.progress || 0) * 100)}%` : '' }),
    ]);
    s.progEl = prog;
    body.appendChild(el('div', { class: 'pm-toolbar' }, [
      el('label', { class: 'inline' }, ['Iterations ', select([{ value: 5000, label: '5,000' }, { value: 10000, label: '10,000' }, { value: 20000, label: '20,000' }], s.iter || 5000, (v) => { s.iter = Number(v); })]),
      el('label', { class: 'inline' }, ['Durations ', select([{ value: 'pert', label: 'PERT-Beta' }, { value: 'triangular', label: 'Triangular' }], s.dist || 'pert', (v) => { s.dist = v; })]),
      toggle('Risk events', s.withRisks !== false, (on) => { s.withRisks = on; }, 'sample the register'),
      button(s.running ? 'Running…' : 'Run simulation', () => { runMC(dash); dash.rerender(); }, { kind: 'primary', icon: 'dice', disabled: !!s.running }),
    ]));
    body.appendChild(prog);
    if (!s.mc && !s.running) setTimeout(() => runMC(dash), 30);
    const r = s.mc;
    if (!r) {
      body.appendChild(el('div', { class: 'pm-empty', text: 'Running the first simulation of the live schedule… the 3D view keeps running while it works.' }));
      body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge()]));
      return;
    }
    const stale = Math.abs(p.day - r.day) > 7;
    const f = r.finish;
    const c = r.cost;
    const D = r.baselineDuration;
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'P(on time)', value: fmtPct(r.probabilityOnTime, 0), foot: `finish ≤ ${shortDate(p.startDate, D)}`, cls: r.probabilityOnTime >= 0.8 ? 'good' : r.probabilityOnTime >= 0.5 ? 'warn' : 'bad' }),
      kpi({ label: 'P50 finish', value: shortDate(p.startDate, f.p50), foot: `${f.p50 - D >= 0 ? '+' : ''}${Math.round(f.p50 - D)} d vs baseline` }),
      kpi({ label: 'P80 finish', value: shortDate(p.startDate, f.p80), foot: `schedule reserve ${Math.max(0, Math.round(f.p80 - r.deterministicFinish))} d over CPM`, cls: f.p80 > D ? 'warn' : 'good' }),
      kpi({ label: 'P(on budget)', value: fmtPct(r.probabilityOnBudget, 0), foot: `cost ≤ BAC ${fmtPKR(r.bac)}`, cls: r.probabilityOnBudget >= 0.8 ? 'good' : r.probabilityOnBudget >= 0.5 ? 'warn' : 'bad' }),
      kpi({ label: 'P80 cost', value: fmtPKR(c.p80), foot: `P50 ${fmtPKR(c.p50)}` }),
    ]));
    if (stale) body.appendChild(el('div', { class: 'callout warn' }, [el('p', { text: `This result is from day ${r.day}; the project is now at day ${p.day}. Re-run to include progress and risks since then.` })]));
    const anim = animOnce(dash, `mc-${r.day}-${r.iterations}-${r.seed}`);
    // finish histogram
    const xf = (v) => shortDate(p.startDate, v).slice(3);
    body.appendChild(section('Finish date distribution', `${r.iterations.toLocaleString('en-US')} iterations · ${r.distribution === 'pert' ? 'PERT-Beta' : 'triangular'} durations${r.includeRisks ? ' + risk events' : ''}`));
    const fh = f.histogram;
    body.appendChild(chartBox(histogramChart({
      bins: fh, width: 1000, height: 300, cumulative: true, label: 'Monte Carlo finish-date histogram', animate: anim,
      color: (a) => (a + fh.width / 2 <= D ? 'var(--good)' : 'var(--c2)'),
      xTicks: dayTicks(p.startDate, fh.min - (fh.max - fh.min) * 0.05, fh.max + (fh.max - fh.min) * 0.05, 8), xFormat: xf,
      vlines: [
        { x: D, label: `Baseline ${xf(D)}`, color: C.brass, dash: '2 4' },
        { x: r.deterministicFinish, label: 'CPM', color: C.ink },
        { x: f.p50, label: 'P50', color: C.info },
        { x: f.p80, label: 'P80', color: C.warn },
        { x: f.p90, label: 'P90', color: C.bad },
      ],
    }), {
      minWidth: 720,
      legend: legend([{ label: 'Iterations finishing on or before the baseline', color: 'var(--good)' }, { label: 'Late iterations', color: 'var(--c2)' }, { label: 'Cumulative probability (right axis)', color: C.brass, shape: 'line' }]),
      caption: 'Each bar counts iterations finishing in that window. The cumulative curve reads straight off as confidence: where it crosses 80 % is the P80 date.',
    }));
    // cost histogram + S-curves
    const ch = c.histogram;
    body.appendChild(el('div', { class: 'pm-grid c2' }, [
      card('Cost at completion distribution', [chartBox(histogramChart({
        bins: ch, width: 560, height: 260, cumulative: true, label: 'Monte Carlo cost histogram', animate: anim,
        color: (a) => (a + ch.width / 2 <= r.bac ? 'var(--good)' : 'var(--c6)'), xFormat: (v) => money(v),
        vlines: [{ x: r.bac, label: 'BAC', color: C.brass, dash: '2 4' }, { x: c.p50, label: 'P50', color: C.info }, { x: c.p80, label: 'P80', color: C.warn }],
      }), { minWidth: 460 })], { sub: 'PKR — labour, materials at today’s prices and risk costs' }),
      card('S-curves (cumulative probability)', [chartBox(lineChart({
        width: 560, height: 260, label: 'Finish-date S-curve', yDomain: [0, 1], yExact: true, yFormat: (v) => `${Math.round(v * 100)}%`,
        series: [{ label: 'P(finish ≤ date)', points: f.sCurve.map((x) => [x.value, x.p]), color: C.c2, width: 3, area: true, areaOpacity: 0.1 }],
        xTicks: dayTicks(p.startDate, f.sCurve[0].value, f.sCurve[f.sCurve.length - 1].value, 5), xDomain: [f.sCurve[0].value, f.sCurve[f.sCurve.length - 1].value],
        hlines: [{ y: 0.8, label: 'P80', color: C.warn }, { y: 0.5, label: 'P50', color: C.info, dash: '2 4' }], vlines: [{ x: D, label: 'Baseline', color: C.brass }],
        marks: [{ x: D, y: r.probabilityOnTime, color: C.good, label: `P(on time) = ${fmtPct(r.probabilityOnTime)}`, text: fmtPct(r.probabilityOnTime) }], animate: anim,
      }), { minWidth: 460 })], { sub: 'Read across from a confidence level to its date' }),
    ]));
    // confidence table & comparison
    const pert = p.forecastPert;
    const pertP80 = pert ? (Number.isFinite(p.forecastDay) ? p.forecastDay : p.day) + pert.mean + inverseNormal(0.8) * pert.sigma : NaN;
    body.appendChild(el('div', { class: 'pm-grid c2' }, [
      card('Confidence levels', [table(['Confidence', 'Finish date', 'vs baseline', 'Cost at completion', 'vs BAC'], ['p10', 'p50', 'p80', 'p90'].map((k) => [
        k.toUpperCase(), shortDate(p.startDate, f[k]), `${f[k] - D >= 0 ? '+' : ''}${Math.round(f[k] - D)} d`, fmtPKR(c[k]),
        el('span', { class: c[k] > r.bac ? 'pm-neg' : 'pm-pos', text: `${c[k] - r.bac >= 0 ? '+' : '−'}${fmtPKR(Math.abs(c[k] - r.bac)).replace('PKR ', '')}` }),
      ]), { dense: true }), dl([
        ['Mean ± σ (finish)', `${shortDate(p.startDate, f.mean)} ± ${Math.round(f.sd)} d`], ['Range simulated', `${shortDate(p.startDate, f.min)} → ${shortDate(p.startDate, f.max)}`],
        ['Cost reserve for P80', `${fmtPKR(Math.max(0, c.p80 - c.p50))} above P50`],
      ])]),
      card('Why the three dates differ', [dl([
        ['CPM (deterministic)', `${shortDate(p.startDate, r.deterministicFinish)} — single most-likely path`],
        ['PERT P80', Number.isFinite(pertP80) ? `${shortDate(p.startDate, pertP80)} — driving path only, normal approximation` : '—'],
        ['Monte Carlo P80', `${shortDate(p.startDate, f.p80)} — every path, merge bias and risk events`],
      ]), el('p', { class: 'pm-note', text: 'Where several near-critical paths merge (Gate G2 has 21 predecessors), the latest of them sets the date — so the true distribution sits later than PERT suggests. This merge bias is why sponsors commit to P80, not to the CPM date.' }),
      el('p', { class: 'pm-note', text: 'This result is shared with MEHRAN — ask it “what is our P80?” or “how likely are we to finish on time?”.' })]),
    ]));
    // tornado
    const items = r.tornado.slice(0, 12).map((t) => ({ label: `${t.code} ${t.name}`, value: t.correlation, color: t.correlation >= 0 ? C.crit : C.good }));
    body.appendChild(section('Sensitivity — tornado', 'correlation of each activity’s sampled duration with the finish date'));
    body.appendChild(el('div', { class: 'pm-grid c21' }, [
      items.length ? chartBox(tornadoChart(items, { width: 820, label: 'Tornado chart of schedule drivers', format: (v) => v.toFixed(2), max: Math.max(0.1, Math.abs(items[0].value)), animate: anim }), { minWidth: 640 }) : el('div', { class: 'pm-empty', text: 'No remaining activity has a measurable effect on the finish date.' }),
      card('Using the tornado', [
        el('p', { text: 'The longest bars are the activities whose uncertainty moves the finish most — usually critical-path work with wide O–P ranges. Focus risk responses, better estimates or crashing there; uncertainty on short bars hardly matters.' }),
        items.length ? el('p', { class: 'pm-note', html: `Top driver: <b>${items[0].label}</b> (r = ${items[0].value.toFixed(2)}).` }) : null,
        button('Open the schedule', () => dash.open('schedule'), { small: true, kind: 'ghost', icon: 'gantt' }),
      ]),
    ]));
    if (s.runs && s.runs.length > 1) {
      body.appendChild(section('Forecast trend', 'previous runs this session'));
      body.appendChild(table([
        { key: 'day', label: 'Run on', format: (v) => shortDate(p.startDate, v) }, { key: 'it', label: 'Iterations', num: true, format: (v) => v.toLocaleString('en-US') },
        { key: 'p50', label: 'P50 finish', format: (v) => shortDate(p.startDate, v) }, { key: 'p80', label: 'P80 finish', format: (v) => shortDate(p.startDate, v) },
        { key: 'c80', label: 'P80 cost', num: true, format: (v) => fmtPKR(v) }, { key: 'onTime', label: 'P(on time)', num: true, format: (v) => fmtPct(v) }, { key: 'engine', label: 'Engine' },
      ], s.runs, { dense: true }));
    }
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `Seed ${r.seed} · reproducible for the same day and settings` })]));
  },
};
