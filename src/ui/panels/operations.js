import { el, kpi, button, tabs, pill, bar, icon, fmtPct } from '../dom.js';
import { section, card, table, legend } from '../charts.js';
import { gaugeChart, windRose, sparkline, K } from '../charts2.js';
import { fact } from '../../core/facts.js';

/**
 * operations — Operations & Benefits (Week 12, CLO3). Unlocked at handover (gate G3):
 * ATC-lite KPIs from sim.world.operations.kpis() against the business case, simulated
 * wind and runway in use, benefits realisation and a launcher for Operations mode.
 */

const TABS = [
  { id: 'live', label: 'Live operations', icon: 'plane' },
  { id: 'benefits', label: 'Benefits realisation', icon: 'target' },
  { id: 'readiness', label: 'Handover readiness', icon: 'flagCheck' },
];
const ZONES_GOOD_HIGH = [{ to: 0.5, color: K.bad }, { to: 0.8, color: K.warn }, { to: 10, color: K.good }];

function ops(dash) {
  const w = dash.sim.world;
  return w && w.operations ? w.operations : null;
}
function kp(dash) {
  const o = ops(dash);
  try { return o && o.kpis ? o.kpis() : null; } catch { return null; }
}
const running = (dash) => dash.sim.mode === 'ops';
const unlocked = (dash) => { try { return !!dash.sim.operationsUnlocked; } catch { return false; } };

function launchButton(dash) {
  const on = running(dash);
  return button(on ? 'Return to Project Manager mode' : 'Launch Operations mode', () => {
    dash.close();
    dash.sim.setMode(on ? 'manager' : 'ops');
  }, { kind: 'primary', icon: 'plane', disabled: !unlocked(dash) && !on });
}

function lockedCard(dash, pane) {
  const p = dash.project;
  const g3 = p.gateById.get('G3');
  const t = p.baselineDuration ? Math.min(1, p.day / g3.baselineDay) : 0;
  pane.appendChild(el('div', { class: 'cp-lock' }, [
    el('span', { class: 'cp-lock-i' }, [icon('shield', 30)]),
    el('div', {}, [
      el('h3', { text: 'Operations unlock at handover' }),
      el('p', { text: `Live airside operations — arrivals, departures, turnarounds, wind and runway in use — only make sense once the airport is certified. In the simulator the mode unlocks when gate ${g3.id} (${g3.name}) is approved and the aerodrome can operate. Instructors can preview it any time.` }),
      el('div', { class: 'cp-obj-bar' }, [bar(t, '', 'Progress towards the operational-readiness gate'), el('small', { text: `Day ${p.day} of a baseline ${g3.id} date at day ${g3.baselineDay}` })]),
      el('div', { class: 'row' }, [pill(`${g3.id}: ${g3.status === 'ready' ? 'ready for approval' : g3.status}`, g3.status === 'approved' ? 'ok' : g3.status === 'ready' ? 'warn' : 'muted'),
        button('Open Life Cycle & Gates', () => dash.open('lifecycle'), { small: true, icon: 'cycle' }), launchButton(dash)]),
    ]),
  ]));
}

function live(dash, pane) {
  const k = kp(dash);
  const p = dash.project;
  const b = p.benefits;
  const tgt = b.businessCaseTarget;
  const on = running(dash);
  if (!unlocked(dash)) lockedCard(dash, pane);
  else {
    pane.appendChild(el('div', { class: 'cp-ops-bar' }, [
      el('div', {}, [el('b', { text: on ? 'Operations mode is running' : 'Airport certified — operations available' }), el('small', { class: 'muted', text: on ? 'Fly around in drone view or watch the FIDS; the KPIs below are live.' : 'Launch Operations mode to run the ATC-lite traffic simulation and feed the benefits tracker.' })]),
      launchButton(dash),
    ]));
  }
  if (!k) { pane.appendChild(el('p', { class: 'pm-empty', text: 'The traffic simulation is not available in this build.' })); return; }
  const live_ = unlocked(dash) && (on || k.movements > 0);
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Movements / hour', value: live_ ? k.movementsPerHour.toFixed(1) : '—', foot: `${k.arrivals} arrivals · ${k.departures} departures` }),
    kpi({ label: 'Passengers handled', value: live_ ? k.pax.toLocaleString('en-US') : '—', foot: 'since operations began (sim)' }),
    kpi({ label: 'On-time performance', value: live_ ? `${k.onTimePct.toFixed(1)}%` : '—', foot: `business case ${tgt.onTimePct}%`, cls: live_ ? (k.onTimePct >= tgt.onTimePct ? 'good' : 'warn') : '' }),
    kpi({ label: 'Average taxi time', value: live_ ? `${k.avgTaxiMin.toFixed(1)} min` : '—', foot: `${k.onStand} on stand · ${k.airborne} airborne` }),
  ]));
  pane.appendChild(el('div', { class: 'pm-grid c3' }, [
    card('Wind & runway in use', [
      el('div', { class: 'cp-wind' }, [windRose({ dir: k.wind.dir, speed: k.wind.speed, active: String(k.activeRunway), size: 210 }),
        el('div', {}, [
          el('div', { class: 'cp-bignum' }, [el('b', { text: `Runway ${k.activeRunway}` }), el('small', { text: 'in use' })]),
          el('p', { class: 'pm-note', text: `Wind from ${String(k.wind.dir).padStart(3, '0')}° at ${k.wind.speed} kt (simulated). Aircraft land and take off into the wind: runway 02 for northerly winds, 20 for southerly. Runway ${fact('runway.designators')}, ${fact('runway.length')}.` }),
        ])]),
    ]),
    card('Throughput vs business case', [
      el('div', { class: 'cp-gauges' }, [
        gaugeChart({ value: b.movementsPerDay, max: tgt.movementsPerDay * 1.4, target: tgt.movementsPerDay, label: 'movements/day', display: Math.round(b.movementsPerDay), zones: [{ to: 0.55, color: K.bad }, { to: 0.8, color: K.warn }, { to: 2, color: K.good }] }),
        gaugeChart({ value: b.paxPerDay, max: tgt.paxPerDay * 1.4, target: tgt.paxPerDay, label: 'pax/day', display: Math.round(b.paxPerDay).toLocaleString('en-US'), zones: [{ to: 0.55, color: K.bad }, { to: 0.8, color: K.warn }, { to: 2, color: K.good }] }),
      ]),
      el('small', { class: 'muted', text: 'Tick = business-case target (simulated); fill = 30-sample rolling average recorded by the simulator.' }),
    ]),
    card('Traffic log', [
      table(['Metric', 'Now'], [
        ['Movements (total)', k.movements], ['Go-arounds', k.goArounds], ['Aircraft on stand', k.onStand], ['Airborne', k.airborne], ['Runway', k.activeRunway],
      ], { dense: true }),
      !on ? el('small', { class: 'muted', text: 'Figures hold at the last values while Operations mode is not running.' }) : null,
    ]),
  ]));
}

function benefits(dash, pane) {
  const p = dash.project;
  const b = p.benefits;
  const t = b.businessCaseTarget;
  const real = b.realisation || 0;
  const annual = b.paxPerDay * 365;
  const rows = [
    ['Aircraft movements per day', t.movementsPerDay, b.movementsPerDay, (v) => v.toFixed(0)],
    ['Passengers per day', t.paxPerDay, b.paxPerDay, (v) => Math.round(v).toLocaleString('en-US')],
    ['On-time performance (%)', t.onTimePct, b.onTimePct, (v) => v.toFixed(1)],
    ['Annual passengers (run-rate)', t.annualPax, annual, (v) => `${(v / 1e6).toFixed(2)} m`],
  ];
  pane.appendChild(el('p', { class: 'lede', text: 'Projects create outputs; organisations realise benefits. The business case promised measurable operating results — benefits realisation checks, after handover, whether the investment actually delivered them. The airport is judged on these numbers, not on the runway being finished.' }));
  pane.appendChild(el('div', { class: 'pm-grid c3' }, [
    card('Benefits realised', [
      el('div', { class: 'cp-gauges' }, [gaugeChart({ value: real, max: 1, label: 'realisation', display: fmtPct(real, 0), zones: [{ to: 0.5, color: K.bad }, { to: 0.8, color: K.warn }, { to: 1, color: K.good }], width: 220, height: 135 })]),
      el('p', { class: 'pm-note', text: b.samples.length ? `Average of the three KPI ratios over the last ${Math.min(30, b.samples.length)} recorded samples.` : 'No operating samples yet. Launch Operations mode after handover and let traffic run for a few minutes.' }),
    ], { cls: 'accent' }),
    card('Pax/day trend', [
      b.samples.length > 1 ? el('div', { class: 'cp-fig' }, [sparkline(b.samples.map((s) => s.pax), { width: 280, height: 70, color: K.c4, label: 'Passengers per day samples' })]) : el('p', { class: 'pm-empty', text: 'Waiting for samples.' }),
      el('small', { class: 'muted', text: `${b.samples.length} samples recorded (simulated).` }),
    ]),
    card('Funding link', [
      el('p', { text: 'Benefit levels drive the satisfaction of the operator, airlines and the provincial government in the stakeholder model — missing the business case costs goodwill.' }),
      button('Open Stakeholders', () => dash.open('stakeholders'), { small: true, kind: 'ghost', icon: 'target' }),
    ]),
  ]));
  pane.appendChild(table(['Benefit measure', 'Business case (sim)', 'Current', 'Gap', 'Status'], rows.map(([n, target, cur, f]) => {
    const r = target ? cur / target : 0;
    return [n, f(target), f(cur), `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`, pill(r >= 1 ? 'Achieved' : r >= 0.8 ? 'On track' : r > 0 ? 'Behind' : 'Not started', r >= 1 ? 'ok' : r >= 0.8 ? 'warn' : r > 0 ? 'bad' : 'muted')];
  }), { dense: true }));
  pane.appendChild(section('Benefits management plan', 'who measures what, and when'));
  pane.appendChild(table(['Benefit', 'Owner (role)', 'Measured by', 'When'], [
    ['Domestic and diversion capacity', 'Airport manager', 'Movements per day from the ATC log', 'Monthly after handover'],
    ['Passenger throughput', 'Terminal operations lead', 'Passengers per day from check-in data', 'Monthly'],
    ['Service quality', 'Airline operations coordinator', 'On-time performance', 'Weekly'],
    ['Regional connectivity', 'Provincial transport department', 'Routes served and annual passengers', 'Annually'],
  ], { dense: true }));
  pane.appendChild(el('p', { class: 'pm-note', text: `Context (verified): ${fact('revival.uses')}. Targets and measurements here are simulated for teaching.` }));
}

function readiness(dash, pane) {
  const p = dash.project;
  const gs = p.gates.filter((g) => ['G2', 'G3', 'G4'].includes(g.id));
  pane.appendChild(el('p', { class: 'lede', text: 'Handover is a managed transition, not a ribbon-cutting: trials, certification, training, and operational acceptance happen before the operator takes over and benefits can begin.' }));
  pane.appendChild(el('div', { class: 'pm-grid c3' }, gs.map((g) => card(`${g.id} · ${g.name}`, [
    pill(g.status === 'approved' ? `Approved day ${g.day}` : g.status === 'ready' ? 'Ready' : 'Pending', g.status === 'approved' ? 'ok' : g.status === 'ready' ? 'warn' : 'muted'),
    el('ul', { class: 'cp-feat' }, g.criteria.map((c) => el('li', { text: c }))),
  ]))));
  pane.appendChild(el('div', { class: 'row actions-row' }, [button('Open Life Cycle & Gates', () => dash.open('lifecycle'), { icon: 'cycle' }), button('Open Closing & Lessons', () => dash.open('closing'), { icon: 'flagCheck', kind: 'ghost' })]));
}

const VIEWS = { live, benefits, readiness };

export const PANEL_OPERATIONS = {
  id: 'operations',
  tick(dash) {
    if (dash.state.tab !== 'live' && dash.state.tab !== undefined) return;
    if (!running(dash) || dash.interacting()) return;
    const k = kp(dash);
    if (!k) return;
    const sig = `${k.movements}|${k.pax}|${k.activeRunway}|${k.wind.dir}|${k.onTimePct}`;
    const s = dash.state;
    const now = performance.now();
    if (sig !== s.sig && now - (s.at || 0) > 1500) { s.sig = sig; s.at = now; dash.rerender(); }
  },
  render(dash, body, head) {
    const s = dash.state;
    if (!s.tab) s.tab = 'live';
    const p = dash.project;
    head.appendChild(dash.simBadge());
    head.appendChild(pill(unlocked(dash) ? (running(dash) ? 'Operations running' : 'Unlocked') : 'Locked until handover', unlocked(dash) ? 'ok' : 'muted'));
    body.appendChild(dash.tag());
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Mode', value: unlocked(dash) ? (running(dash) ? 'Operations' : 'Available') : 'Locked', foot: unlocked(dash) ? 'press 5 or O to switch' : `unlocks at gate G3`, cls: unlocked(dash) ? 'good' : 'warn' }),
      kpi({ label: 'Benefits realised', value: fmtPct(p.benefits.realisation || 0, 0), foot: 'vs business case' }),
      kpi({ label: 'Pax / day (avg)', value: Math.round(p.benefits.paxPerDay).toLocaleString('en-US'), foot: `target ${p.benefits.businessCaseTarget.paxPerDay.toLocaleString('en-US')}` }),
      kpi({ label: 'Movements / day', value: Math.round(p.benefits.movementsPerDay).toString(), foot: `target ${p.benefits.businessCaseTarget.movementsPerDay}` }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `${fact('airport.name')} — traffic, wind and targets are simulated; airport facts are verified.` })]));
  },
};
