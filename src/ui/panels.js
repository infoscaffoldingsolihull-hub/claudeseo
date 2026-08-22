import { el, svg, clear, fmtNum, fmtDays, fmtPct, indexClass } from './dom.js';
import {
  evmChart, evmLegend, ganttChart, networkDiagram, riskMatrix, resourceHistogram,
  controlChart, monteCarloChart, tornadoChart, stakeholderGrid, CHART_COLORS,
} from './charts.js';
import { WBS } from '../pm/model.js';
import { runMonteCarlo } from '../pm/montecarlo.js';

/**
 * The project management dashboard.
 *
 * Eleven panels covering the PMBOK performance domains: scope (WBS), schedule
 * (Gantt, CPM network, PERT), cost (earned value), risk, resources, quality,
 * procurement, stakeholders, uncertainty (Monte Carlo), the mission layer, and
 * the project charter itself.
 */

const PANELS = [
  { id: 'brief', title: 'Project Charter', sub: 'Scope, objectives and success criteria', icon: 'scroll' },
  { id: 'wbs', title: 'Work Breakdown Structure', sub: 'Scope decomposition and progress', icon: 'tree' },
  { id: 'schedule', title: 'Schedule', sub: 'Gantt · CPM network · PERT', icon: 'gantt', wide: true },
  { id: 'cost', title: 'Cost & Earned Value', sub: 'PV · EV · AC · CPI · SPI · EAC', icon: 'coins', wide: true },
  { id: 'risk', title: 'Risk Register', sub: 'Probability × impact, EMV and responses', icon: 'warning', wide: true },
  { id: 'resources', title: 'Resource Management', sub: 'Staffing, levelling and utilisation', icon: 'people' },
  { id: 'quality', title: 'Quality Management', sub: 'Control charts, gates and cost of quality', icon: 'gauge', wide: true },
  { id: 'procurement', title: 'Procurement', sub: 'Contracts, lead times and delivery', icon: 'ship' },
  { id: 'stakeholders', title: 'Stakeholders', sub: 'Power / interest and engagement', icon: 'crown', wide: true },
  { id: 'montecarlo', title: 'Monte Carlo Forecast', sub: 'Probabilistic schedule and cost', icon: 'dice', wide: true },
  { id: 'missions', title: 'Missions', sub: 'Objectives and success criteria', icon: 'flag' },
];

const ICONS = {
  scroll: 'M5 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z M5 4a2 2 0 0 0-2 2v2h2',
  tree: 'M4 5h6M4 5v14M4 12h6M4 19h6M13 3h7v4h-7z M13 10h7v4h-7z M13 17h7v4h-7z',
  gantt: 'M3 6h9M3 11h14M3 16h6M3 3v18',
  coins: 'M12 6c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 13v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  warning: 'M12 3 2 20h20z M12 10v5 M12 17.6v.1',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2 20a7 7 0 0 1 14 0 M17 11a3 3 0 1 0 0-6 M17.5 14a6 6 0 0 1 4.5 6',
  gauge: 'M4 18a9 9 0 1 1 16 0 M12 14l4-4',
  ship: 'M3 17c2 2 4 2 6 0s4-2 6 0 4 2 6 0 M5 15V8h14l-2 7 M9 8V5h6v3',
  crown: 'M4 18h16 M4 18 2 7l5 4 5-7 5 7 5-4-2 11',
  dice: 'M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z M12 12l8-4.5M12 12v8M12 12 4 7.5',
  flag: 'M5 21V4 M5 4h13l-2.5 4L18 12H5',
  advisor: 'M12 3a5 5 0 0 1 5 5c0 2-1 3-2 4s-1.5 1.5-1.5 3h-3c0-1.5-.5-2-1.5-3s-2-2-2-4a5 5 0 0 1 5-5z M10 19h4M10.5 21.5h3',
  help: 'M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7v.5 M12 17.5v.1 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4z M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  stats: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
};

export function icon(name, size = 19) {
  const path = ICONS[name] || ICONS.help;
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    svg('path', { d: path }),
  ]);
}

function kpi(label, value, foot, cls) {
  return el('div', { class: `kpi ${cls || ''}` }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    foot ? el('div', { class: 'foot', text: foot }) : null,
  ]);
}

function pill(text, cls) {
  return el('span', { class: `tag ${cls || ''}`, text });
}

function bar(fraction, cls) {
  return el('div', { class: 'bar' }, [el('i', { class: cls || '', style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` } })]);
}

export class Dashboard {
  constructor(root, sim) {
    this.sim = sim;
    this.project = sim.project;
    this.root = root;
    this.openId = null;
    this.selectedTask = null;
    this.scheduleTab = 'gantt';
    this.qualityMetric = 'joint';
    this.resourceView = 'quarrymen';
    this.monteCarloResult = null;
    this.expanded = new Set(['1', '5', '6']);

    this.panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        (this.headIcon = el('span', { class: 'panel-head-icon' })),
        el('div', {}, [(this.headTitle = el('h2', { text: '' })), (this.headSub = el('div', { class: 'sub', text: '' }))]),
        el('div', { class: 'grow' }),
        (this.headExtra = el('div', { class: 'row' })),
        el('button', { class: 'panel-close', text: '✕', title: 'Close (Esc)', onclick: () => this.close() }),
      ]),
      (this.body = el('div', { class: 'panel-body' })),
    ]);
    root.appendChild(this.panel);

    this.rail = el('div', { class: 'rail' });
    for (const p of PANELS) {
      const button = el('button', { title: p.title, onclick: () => this.toggle(p.id) }, [
        icon(p.icon),
        el('span', { class: 'tip', text: p.title }),
      ]);
      button.dataset.panel = p.id;
      this.rail.appendChild(button);
    }
    root.appendChild(this.rail);
  }

  toggle(id) {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  open(id) {
    const spec = PANELS.find((p) => p.id === id);
    if (!spec) return;
    // A dashboard and a narrated cinematic cannot share the screen.
    if (this.sim.mode === 'tour') this.sim.setMode('manager');
    this.openId = id;
    this.panel.classList.add('open');
    this.panel.classList.toggle('wide', !!spec.wide);
    clear(this.headIcon).appendChild(icon(spec.icon, 20));
    this.headTitle.textContent = spec.title;
    this.headSub.textContent = spec.sub;
    for (const b of this.rail.children) b.classList.toggle('active', b.dataset.panel === id);
    this.render();
  }

  close() {
    this.openId = null;
    this.panel.classList.remove('open');
    for (const b of this.rail.children) b.classList.remove('active');
  }

  get panelIds() {
    return PANELS.map((p) => p.id);
  }

  /** Cheap refresh while the panel is open. */
  tick() {
    if (!this.openId) return;
    if (this._sinceRender === undefined) this._sinceRender = 0;
    this._sinceRender++;
    const heavy = ['schedule', 'montecarlo', 'stakeholders'].includes(this.openId);
    if (this._sinceRender > (heavy ? 90 : 30)) {
      // Never rebuild the panel while the user is holding a slider or a select.
      const active = document.activeElement;
      if (active && this.panel.contains(active) && /INPUT|SELECT|TEXTAREA|BUTTON/.test(active.tagName)) return;
      this._sinceRender = 0;
      this.render();
    }
  }

  render() {
    if (!this.openId) return;
    const body = clear(this.body);
    clear(this.headExtra);
    const fn = this[`_render_${this.openId}`];
    if (fn) fn.call(this, body);
  }

  /* ------------------------------------------------------------- charter */

  _render_brief(body) {
    const p = this.project;
    body.appendChild(el('h3', { class: 'section', text: 'Project charter' }));
    body.appendChild(
      el('p', { class: 'note', html:
        '<em>Project:</em> Akhet Khufu — “Khufu’s Horizon”. Construct a true pyramid of 230.33 m base and 146.6 m height ' +
        'on the Giza plateau, with its internal chambers, casing, mortuary complex, causeway, valley temple, ' +
        'boat pits and three subsidiary pyramids, oriented to true north.' })
    );
    body.appendChild(
      el('div', { class: 'grid c4' }, [
        kpi('Budget at completion', `${fmtNum(p.bac)} kdb`, 'kilodeben of copper equivalent'),
        kpi('Baseline duration', `${(p.baselineDuration / 365).toFixed(1)} yr`, `${p.baselineDuration} days`),
        kpi('Peak workforce', p.peakWorkforce.toLocaleString(), 'from the resource histogram'),
        kpi('Work packages', String(p.tasks.length), `${WBS.length} control accounts`),
      ])
    );

    body.appendChild(el('h3', { class: 'section', text: 'Objectives and success criteria' }));
    const table = el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Domain' }), el('th', { text: 'Objective' }), el('th', { text: 'Success criterion' })])]),
      el('tbody', {}, [
        ['Scope', 'Deliver the monument and its complex complete', 'All 34 work packages at 100%, no descoped deliverable'],
        ['Schedule', 'Hand over within the king’s reign', `Finish ≤ ${p.baselineDuration} days; SPI ≥ 0.95`],
        ['Cost', 'Stay within the royal treasury allocation', `AC ≤ ${fmtNum(p.bac)} kdb; CPI ≥ 0.95`],
        ['Quality', 'Meet the priesthood’s tolerances', 'Orientation ≤ 0.12°, base level ≤ 4 cm, casing joint ≤ 1.6 mm'],
        ['Risk', 'Keep exposure inside the reserve', `Contingency ${fmtNum(p.contingencyReserve)} kdb (Σ EMV) not exceeded`],
        ['Resource', 'Feed, house and rotate the workforce', 'Welfare index ≥ 0.60 throughout'],
        ['Stakeholder', 'Keep the sponsor and priesthood engaged', 'All stakeholders at Supportive or better at handover'],
      ].map(([d, o, s]) => el('tr', {}, [el('td', { text: d }), el('td', { text: o }), el('td', { text: s })]))),
    ]);
    body.appendChild(table);

    body.appendChild(el('h3', { class: 'section', text: 'Assumptions and constraints' }));
    body.appendChild(el('ul', { class: 'note' }, [
      el('li', { text: 'Stone is moved on wooden sledges over watered, gypsum-sealed roads; no wheel, no pulley, no iron.' }),
      el('li', { text: 'Aswan granite and Tura casing can only be shipped during the Akhet inundation, roughly 120 days a year.' }),
      el('li', { text: 'The workforce is a paid, fed, rotating levy, not slave labour — the excavated town is the evidence.' }),
      el('li', { text: 'The project must finish inside the reign of the sponsor. Schedule risk is existential, not financial.' }),
      el('li', { text: 'Costs are expressed in kilodeben of copper equivalent so that earned-value analysis behaves exactly as it does on a modern project.' }),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Why this is a project and not an operation' }));
    body.appendChild(el('p', { class: 'note', text:
      'It is temporary — it has a definite start and an end fixed by the sponsor’s lifespan. It is unique — no monument of ' +
      'this scale had been attempted before, and the design changed twice during execution. It produces a defined ' +
      'deliverable, it is resource-constrained, and it was managed by a named project director with a documented ' +
      'organisational hierarchy. Every element of the PMBOK definition is present 4 500 years early.' }));
  }

  /* ----------------------------------------------------------------- WBS */

  _render_wbs(body) {
    const p = this.project;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Scope complete', fmtPct(p.overallProgress, 1), 'by earned value'),
      kpi('Packages finished', `${p.tasks.filter((t) => p.state.get(t.id).pct >= 1).length} / ${p.tasks.length}`, ''),
      kpi('In progress', String(p.tasks.filter((t) => { const s = p.state.get(t.id); return s.pct > 0 && s.pct < 1; }).length), ''),
      kpi('Critical packages', String(p.baseline.criticalPath.length), 'zero total float'),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Work breakdown structure' }));
    body.appendChild(el('div', { class: 'wbs-row', style: { fontSize: '9.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(184,171,144,0.8)' } }, [
      el('span', { text: 'Package' }), el('span', { text: 'Budget' }), el('span', { text: 'Float' }), el('span', { text: '%' }), el('span', { text: 'Progress' }),
    ]));

    const renderNode = (node, depth) => {
      const container = el('div', { class: depth ? 'wbs-node' : '' });
      if (node.children) {
        const leaves = [];
        const collect = (n) => (n.children ? n.children.forEach(collect) : leaves.push(n));
        collect(node);
        const budget = leaves.reduce((s, l) => s + l.budget, 0);
        const earned = leaves.reduce((s, l) => s + l.budget * p.state.get(l.id).pct, 0);
        const open = this.expanded.has(node.id);
        const row = el('div', { class: 'wbs-row', onclick: () => {
          if (open) this.expanded.delete(node.id);
          else this.expanded.add(node.id);
          this.render();
        } }, [
          el('span', {}, [el('span', { class: 'twist', text: open ? '▾' : '▸' }), el('span', { class: 'code', text: node.code }), el('span', { text: node.name })]),
          el('span', { class: 'code', text: fmtNum(budget) }),
          el('span', { text: '' }),
          el('span', { class: 'code', text: fmtPct(budget ? earned / budget : 0) }),
          bar(budget ? earned / budget : 0, 'ok'),
        ]);
        container.appendChild(row);
        if (open) for (const child of node.children) container.appendChild(renderNode(child, depth + 1));
      } else {
        const st = p.state.get(node.id);
        const cpm = p.baseline.nodes.get(node.id);
        const row = el('div', {
          class: `wbs-row ${cpm.critical ? 'critical' : ''} ${this.selectedTask === node.id ? 'selected' : ''}`,
          onclick: () => {
            this.selectedTask = this.selectedTask === node.id ? null : node.id;
            this.render();
          },
        }, [
          el('span', {}, [el('span', { class: 'twist', text: '' }), el('span', { class: 'code', text: node.code }), el('span', { text: node.name })]),
          el('span', { class: 'code', text: fmtNum(node.budget) }),
          el('span', { class: 'code', text: `${Math.round(cpm.totalFloat)}d` }),
          el('span', { class: 'code', text: fmtPct(st.pct) }),
          bar(st.pct, st.pct >= 1 ? 'ok' : st.blocked ? 'bad' : ''),
        ]);
        container.appendChild(row);
        if (this.selectedTask === node.id) container.appendChild(this._packageDetail(node));
      }
      return container;
    };

    for (const node of WBS) body.appendChild(renderNode(node, 0));
  }

  _packageDetail(spec) {
    const p = this.project;
    const st = p.state.get(spec.id);
    const cpm = p.baseline.nodes.get(spec.id);
    const task = p.taskById.get(spec.id);
    const box = el('div', { style: { padding: '10px 12px', margin: '4px 0 10px', background: 'rgba(212,169,47,0.06)', borderRadius: '8px', borderLeft: '2px solid var(--gold)' } });
    box.appendChild(el('p', { class: 'note', style: { marginTop: 0 }, text: spec.deliverable || '' }));
    box.appendChild(el('div', { class: 'grid c4' }, [
      kpi('PERT duration', `${task.duration} d`, `O ${spec.o} · M ${spec.m} · P ${spec.p}`),
      kpi('σ', `${task.sigma.toFixed(1)} d`, '(P − O) / 6'),
      kpi('Early / Late start', `${Math.round(cpm.es)} / ${Math.round(cpm.ls)}`, `TF ${Math.round(cpm.totalFloat)} d · FF ${Math.round(cpm.freeFloat)} d`),
      kpi('Budget / Earned', `${fmtNum(spec.budget)} / ${fmtNum(spec.budget * st.pct)}`, `AC ${fmtNum(st.actualCost)}`),
    ]));
    if (spec.predecessors && spec.predecessors.length) {
      box.appendChild(el('p', { class: 'note', html: `<em>Predecessors:</em> ${spec.predecessors.map((l) => `${l.id} (${l.type}${l.lag ? (l.lag > 0 ? ` +${l.lag}` : ` ${l.lag}`) : ''})`).join(', ')}` }));
    }
    const crew = Object.entries(task.crew).map(([k, v]) => `${p.resourceById.get(k) ? p.resourceById.get(k).name : k} ${v.toLocaleString()}`).join(' · ');
    if (crew) box.appendChild(el('p', { class: 'note', html: `<em>Crew:</em> ${crew}` }));
    if (spec.qualityGate) {
      box.appendChild(el('p', { class: 'note', html: `<em>Quality gate:</em> ${spec.qualityGate.metric} target ${spec.qualityGate.target} ${spec.qualityGate.unit}, tolerance ${spec.qualityGate.tolerance}` }));
    }
    if (spec.criticalNote) box.appendChild(el('p', { class: 'note', html: `<em>Note:</em> ${spec.criticalNote}` }));
    if (st.blocked) box.appendChild(el('p', { class: 'note', html: `<em>Status:</em> blocked — ${st.blocked}` }));
    return box;
  }

  /* ------------------------------------------------------------ schedule */

  _render_schedule(body) {
    const p = this.project;
    const tabs = el('div', { class: 'row' }, [
      el('button', { class: `action ${this.scheduleTab === 'gantt' ? '' : 'ghost'}`, text: 'Gantt', onclick: () => { this.scheduleTab = 'gantt'; this.render(); } }),
      el('button', { class: `action ${this.scheduleTab === 'network' ? '' : 'ghost'}`, text: 'CPM network', onclick: () => { this.scheduleTab = 'network'; this.render(); } }),
      el('button', { class: `action ${this.scheduleTab === 'pert' ? '' : 'ghost'}`, text: 'PERT & crashing', onclick: () => { this.scheduleTab = 'pert'; this.render(); } }),
    ]);
    this.headExtra.appendChild(tabs);

    const forecastLate = (p.scheduleVarianceDays || 0) > 0;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Baseline finish', `day ${p.baselineDuration}`, `${(p.baselineDuration / 365).toFixed(1)} years`),
      kpi('Forecast finish', `day ${Math.round(p.forecastFinish || p.baselineDuration)}`, forecastLate ? `${Math.round(p.scheduleVarianceDays)} days late` : 'on or ahead of plan', forecastLate ? (p.scheduleVarianceDays > 120 ? 'bad' : 'warn') : 'good'),
      kpi('SPI (earned value)', p.spi.toFixed(3), 'EV / PV', indexClass(p.spi)),
      kpi('SPI(t) (earned schedule)', p.spit.toFixed(3), `SV(t) ${fmtDays(p.svt)}`, indexClass(p.spit)),
    ]));

    if (this.scheduleTab === 'gantt') {
      body.appendChild(el('h3', { class: 'section', text: 'Gantt chart — critical path in red, float shown dashed' }));
      body.appendChild(el('div', { class: 'gantt-wrap' }, [ganttChart(p)]));
      body.appendChild(el('div', { class: 'legend' }, [
        el('span', { html: `<i style="background:rgba(193,80,60,0.7)"></i>critical path (zero float)` }),
        el('span', { html: `<i style="background:rgba(126,147,168,0.6)"></i>baseline` }),
        el('span', { html: `<i style="background:${CHART_COLORS.gold}"></i>in progress` }),
        el('span', { html: `<i style="background:${CHART_COLORS.done}"></i>complete` }),
      ]));
    } else if (this.scheduleTab === 'network') {
      body.appendChild(el('h3', { class: 'section', text: 'Precedence diagram — each node shows ES / EF / LS / LF and total float' }));
      body.appendChild(el('div', { class: 'gantt-wrap' }, [networkDiagram(p)]));
      body.appendChild(el('p', { class: 'note', text: 'Link labels show the dependency type and lag where it is not a simple finish-to-start with zero lag. Negative lags are leads: fast-tracking.' }));
    } else {
      this._renderPert(body);
    }
  }

  _renderPert(body) {
    const p = this.project;
    const pert = p.pert;
    body.appendChild(el('h3', { class: 'section', text: 'PERT analysis of the baseline' }));
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Expected duration', `${Math.round(pert.expected)} d`, 'Σ te along the critical path'),
      kpi('σ (critical path)', `${pert.sigma.toFixed(1)} d`, `variance ${Math.round(pert.variance)}`),
      kpi('P(finish ≤ baseline)', fmtPct(0.5), 'by construction — te is the mean'),
      kpi('P80 duration', `${Math.round(pert.atConfidence(0.8))} d`, '80% confidence'),
    ]));
    body.appendChild(el('p', { class: 'note', text:
      'PERT treats the critical path in isolation. It systematically underestimates, because a near-critical path can ' +
      'become critical in any given outcome — the merge bias. The Monte Carlo panel models the whole network and gives ' +
      'the honest answer.' }));

    body.appendChild(el('h3', { class: 'section', text: 'Three-point estimates' }));
    const rows = p.tasks.filter((t) => p.baseline.nodes.get(t.id).critical).map((t) => {
      const n = p.baseline.nodes.get(t.id);
      return el('tr', { class: 'critical' }, [
        el('td', { text: t.code }), el('td', { text: t.name }),
        el('td', { class: 'num', text: t.o }), el('td', { class: 'num', text: t.m }), el('td', { class: 'num', text: t.p }),
        el('td', { class: 'num', text: t.duration }), el('td', { class: 'num', text: t.sigma.toFixed(1) }),
        el('td', { class: 'num', text: Math.round(n.totalFloat) }),
      ]);
    });
    body.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Code', 'Critical package', 'O', 'M', 'P', 'te', 'σ', 'TF'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Schedule compression — crashing' }));
    const target = Math.max(30, Math.round(p.scheduleVarianceDays || 60));
    const plan = p.crashPlan(target);
    body.appendChild(el('p', { class: 'note', html:
      `To recover <em>${target} days</em>, crash in cost-slope order. Recovered: <em>${Math.round(plan.recovered)} days</em> ` +
      `for <em>${fmtNum(plan.addedCost)} kdb</em>` + (plan.shortfall > 0 ? `, with ${Math.round(plan.shortfall)} days that cannot be bought.` : '.') }));
    if (plan.plan.length) {
      body.appendChild(el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Package', 'Max crash', 'Days bought', 'Cost slope', 'Added cost', ''].map((h) => el('th', { text: h })))]),
        el('tbody', {}, plan.plan.map((c) => el('tr', {}, [
          el('td', { text: `${c.id} ${c.name}` }),
          el('td', { class: 'num', text: `${Math.round(c.maxCrash)} d` }),
          el('td', { class: 'num', text: `${Math.round(c.crashDays)} d` }),
          el('td', { class: 'num', text: `${fmtNum(c.costSlope)}/d` }),
          el('td', { class: 'num', text: fmtNum(c.addedCost) }),
          el('td', {}, [el('button', { class: 'action', text: 'Crash', onclick: () => { this.project.crashActivity(c.id, c.crashDays); this.render(); } })]),
        ]))),
      ]));
    }
  }

  /* ---------------------------------------------------------------- cost */

  _render_cost(body) {
    const p = this.project;
    const eac = p.eac;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('BAC', fmtNum(p.bac), 'budget at completion'),
      kpi('PV', fmtNum(p.pv), 'planned value'),
      kpi('EV', fmtNum(p.ev), 'earned value'),
      kpi('AC', fmtNum(p.ac), 'actual cost'),
    ]));
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('SV', fmtNum(p.sv), 'EV − PV', p.sv >= 0 ? 'good' : 'bad'),
      kpi('CV', fmtNum(p.cv), 'EV − AC', p.cv >= 0 ? 'good' : 'bad'),
      kpi('SPI', p.spi.toFixed(3), 'EV / PV', indexClass(p.spi)),
      kpi('CPI', p.cpi.toFixed(3), 'EV / AC', indexClass(p.cpi)),
    ]));
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('EAC (typical)', fmtNum(eac.typical), 'BAC / CPI', indexClass(p.bac / Math.max(1, eac.typical))),
      kpi('EAC (atypical)', fmtNum(eac.atypical), 'AC + (BAC − EV)'),
      kpi('EAC (SPI×CPI)', fmtNum(eac.combined), 'AC + (BAC−EV)/(CPI×SPI)'),
      kpi('VAC', fmtNum(p.vac), 'BAC − EAC', p.vac >= 0 ? 'good' : 'bad'),
    ]));
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('ETC', fmtNum(p.etc), 'estimate to complete'),
      kpi('TCPI (to BAC)', p.tcpi.toBac.toFixed(3), 'efficiency needed to hit BAC', p.tcpi.toBac <= 1.05 ? 'good' : 'bad'),
      kpi('TCPI (to EAC)', p.tcpi.toEac.toFixed(3), 'efficiency needed to hit EAC'),
      kpi('Reserves', `${fmtNum(p.contingencyRemaining)} / ${fmtNum(p.managementRemaining)}`, 'contingency / management', p.contingencyRemaining > 0 ? 'good' : 'bad'),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Earned value S-curve' }));
    body.appendChild(evmChart(p, { width: 900, height: 300 }));
    body.appendChild(evmLegend());

    body.appendChild(el('h3', { class: 'section', text: 'Control accounts' }));
    const rows = WBS.map((account) => {
      const leaves = [];
      const collect = (n) => (n.children ? n.children.forEach(collect) : leaves.push(n));
      collect(account);
      const budget = leaves.reduce((s, l) => s + l.budget, 0);
      const ev = leaves.reduce((s, l) => s + l.budget * p.state.get(l.id).pct, 0);
      const ac = leaves.reduce((s, l) => s + p.state.get(l.id).actualCost, 0);
      const pv = leaves.reduce((s, l) => {
        const n = p.baseline.nodes.get(l.id);
        const frac = p.day <= n.es ? 0 : p.day >= n.ef ? 1 : (p.day - n.es) / Math.max(1, n.ef - n.es);
        return s + l.budget * frac;
      }, 0);
      const cpi = ac > 0 ? ev / ac : 1;
      const spi = pv > 0 ? ev / pv : 1;
      return el('tr', {}, [
        el('td', { text: `${account.code} ${account.name}` }),
        el('td', { class: 'num', text: fmtNum(budget) }),
        el('td', { class: 'num', text: fmtNum(pv) }),
        el('td', { class: 'num', text: fmtNum(ev) }),
        el('td', { class: 'num', text: fmtNum(ac) }),
        el('td', { class: 'num' }, [pill(spi.toFixed(2), indexClass(spi))]),
        el('td', { class: 'num' }, [pill(cpi.toFixed(2), indexClass(cpi))]),
      ]);
    });
    body.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Control account', 'Budget', 'PV', 'EV', 'AC', 'SPI', 'CPI'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Cost of quality' }));
    const coq = p.costOfQuality;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Prevention', fmtNum(coq.prevention), 'training, method, proof loads'),
      kpi('Appraisal', fmtNum(coq.appraisal), 'inspection and survey'),
      kpi('Internal failure', fmtNum(coq.internalFailure), 'rework before handover', coq.internalFailure > coq.prevention * 3 ? 'bad' : 'warn'),
      kpi('External failure', fmtNum(coq.externalFailure), 'defects at handover'),
    ]));
  }

  /* ---------------------------------------------------------------- risk */

  _render_risk(body) {
    const p = this.project;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Total exposure (Σ EMV)', `${fmtNum(p.totalRiskExposure)} kdb`, 'probability × impact'),
      kpi('Contingency remaining', `${fmtNum(p.contingencyRemaining)} kdb`, `of ${fmtNum(p.contingencyReserve)}`, p.contingencyRemaining > p.contingencyReserve * 0.3 ? 'good' : 'bad'),
      kpi('Risks realised', String(p.realisedRisks), `${p.risks.filter((r) => r.activeUntil).length} currently active`),
      kpi('Safety index', fmtPct(p.safety), `${p.incidents} recorded incidents`, p.safety > 0.8 ? 'good' : 'warn'),
    ]));

    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: '18px', alignItems: 'start' } });
    const left = el('div');
    left.appendChild(el('h3', { class: 'section', text: 'Probability / impact matrix' }));
    left.appendChild(riskMatrix(p));
    left.appendChild(el('p', { class: 'note', text: 'Blue = open, red = realised at least once. Position uses the current (post-response) probability.' }));
    grid.appendChild(left);

    const right = el('div');
    right.appendChild(el('h3', { class: 'section', text: 'Risk register' }));
    const rows = [...p.risks].sort((a, b) => b.currentProbability * b.costImpact - a.currentProbability * a.costImpact).map((r) => {
      const emv = r.currentProbability * r.costImpact;
      const select = el('select', { onchange: (e) => { p.respondToRisk(r.id, e.target.value); this.render(); } },
        ['Avoid', 'Mitigate', 'Transfer', 'Accept'].map((s) => el('option', { value: s, text: s, selected: s === r.response })));
      return el('tr', { class: r.activeUntil ? 'critical' : '' }, [
        el('td', {}, [el('b', { text: r.id }), el('div', { text: r.name }), el('div', { style: { fontSize: '10.5px', opacity: 0.72 }, text: r.category })]),
        el('td', { class: 'num', text: fmtPct(r.currentProbability) }),
        el('td', { class: 'num', text: fmtNum(r.costImpact) }),
        el('td', { class: 'num', text: `${r.scheduleImpact}d` }),
        el('td', { class: 'num' }, [pill(fmtNum(emv), emv > 15000 ? 'bad' : emv > 6000 ? 'warn' : 'ok')]),
        el('td', {}, [select]),
        el('td', {}, [r.activeUntil ? pill('ACTIVE', 'bad') : r.occurrences ? pill(`${r.occurrences}×`, 'warn') : pill(r.status, 'muted')]),
      ]);
    });
    right.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Risk', 'P', 'Impact', 'Sched', 'EMV', 'Response', 'Status'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows),
    ]));
    grid.appendChild(right);
    body.appendChild(grid);

    body.appendChild(el('h3', { class: 'section', text: 'Response plans' }));
    for (const r of p.risks) {
      body.appendChild(el('p', { class: 'note', html:
        `<em>${r.id} · ${r.name}</em> — ${r.cause} <br>Response (${r.response}): ${r.responsePlan} ` +
        `<br>Trigger: ${r.trigger} · Owner: ${r.owner}` + (r.historical ? `<br>Archaeology: ${r.historical}` : '') }));
    }
  }

  /* ----------------------------------------------------------- resources */

  _render_resources(body) {
    const p = this.project;
    body.appendChild(el('div', { class: 'row between' }, [
      el('div', { class: 'note', html:
        `<em>Auto-levelled staffing</em> matches each pool to today's demand plus 5% headroom — the resource-levelled plan. ` +
        `Turning it off is how you earn a cost variance, in either direction.` }),
      el('button', {
        class: `action ${p.autoStaffing ? '' : 'ghost'}`,
        text: p.autoStaffing ? 'Auto-levelling ON' : 'Auto-levelling OFF',
        onclick: () => { p.setAutoStaffing(!p.autoStaffing); this.render(); },
      }),
    ]));

    const totalWorkers = p.resources.reduce((s, r) => (r.unit === 'workers' ? s + r.assigned : s), 0);
    const dailyCost = p.resources.reduce((s, r) => s + r.assigned * r.dayRate, 0);
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('On site today', totalWorkers.toLocaleString(), `peak plan ${p.peakWorkforce.toLocaleString()}`),
      kpi('Daily resource cost', `${dailyCost.toFixed(0)} kdb`, `plan ${p.baselineDailyLabour.toFixed(0)} kdb`, dailyCost <= p.baselineDailyLabour * 1.08 ? 'good' : 'bad'),
      kpi('Welfare index', fmtPct(p.welfare), 'rations, housing, rotation', p.welfare > 0.7 ? 'good' : p.welfare > 0.5 ? 'warn' : 'bad'),
      kpi('Stone buffer', fmtPct(p.stoneStock), 'dressed blocks beside the ramp', p.stoneStock > 0.4 ? 'good' : 'bad'),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Resource pools' }));
    for (const r of p.resources) {
      const fulfil = r.required > 0 ? r.assigned / r.required : 1;
      const row = el('div', { style: { marginBottom: '13px' } }, [
        el('div', { class: 'row between', style: { marginBottom: '4px' } }, [
          el('div', {}, [
            el('b', { text: r.name }),
            el('span', { style: { opacity: 0.7, marginLeft: '8px', fontSize: '11px' }, text: `demand ${Math.round(r.required).toLocaleString()} · peak plan ${r.peakDemand.toLocaleString()}` }),
          ]),
          el('div', { class: 'row' }, [
            pill(`${fulfil >= 1 ? '✓' : '⚠'} ${fmtPct(Math.min(2, fulfil))}`, fulfil >= 1 ? 'ok' : fulfil > 0.8 ? 'warn' : 'bad'),
            el('span', { class: 'code', style: { fontFamily: 'var(--font-mono)', minWidth: '64px', textAlign: 'right' }, text: r.assigned.toLocaleString() }),
          ]),
        ]),
        el('div', { class: 'row' }, [
          el('input', {
            type: 'range', min: 0, max: r.capacity, value: r.assigned, step: Math.max(1, Math.round(r.capacity / 200)),
            oninput: (e) => {
              p.setStaffing(r.id, Number(e.target.value));
              this.render();
            },
          }),
          el('button', { class: 'action ghost', text: 'Match demand', onclick: () => { p.setStaffing(r.id, Math.ceil(r.required * 1.05)); this.render(); } }),
        ]),
        el('div', { style: { fontSize: '11px', color: 'var(--papyrus-dim)', marginTop: '3px' }, text: r.note }),
      ]);
      body.appendChild(row);
    }

    body.appendChild(el('h3', { class: 'section', text: 'Resource histogram (baseline demand)' }));
    const picker = el('div', { class: 'row' }, p.resources.map((r) =>
      el('button', { class: `action ${this.resourceView === r.id ? '' : 'ghost'}`, text: r.name, onclick: () => { this.resourceView = r.id; this.render(); } })));
    body.appendChild(picker);
    body.appendChild(resourceHistogram(p, this.resourceView));
    const r = p.resourceById.get(this.resourceView);
    body.appendChild(el('p', { class: 'note', html:
      `Peak demand <em>${r.peakDemand.toLocaleString()}</em>, mean demand <em>${r.meanDemand.toLocaleString()}</em>. ` +
      `The ratio of the two is the levelling opportunity: staffing to peak for the whole project would waste ` +
      `<em>${fmtNum((r.peakDemand - r.meanDemand) * r.dayRate * p.baselineDuration)} kdb</em>.` }));
  }

  /* -------------------------------------------------------------- quality */

  _render_quality(body) {
    const p = this.project;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('Quality score', fmtPct(p.qualityScore), 'against gate tolerances', p.qualityScore > 0.8 ? 'good' : p.qualityScore > 0.6 ? 'warn' : 'bad'),
      kpi('Rework cost', fmtNum(p.reworkCost), 'internal failure', p.reworkCost > p.bac * 0.02 ? 'bad' : 'good'),
      kpi('Inspection level', p.inspectionLevel.toFixed(2), '0.4 minimal — 1.8 rigorous'),
      kpi('Samples taken', String(p.qualitySamples.length), 'statistical process control'),
    ]));

    body.appendChild(el('div', { class: 'row', style: { margin: '10px 0' } }, [
      el('span', { text: 'Inspection level' }),
      el('input', { type: 'range', min: 40, max: 180, value: Math.round(p.inspectionLevel * 100), oninput: (e) => { p.setInspectionLevel(Number(e.target.value) / 100); this.render(); } }),
      el('span', { class: 'note', text: 'Appraisal cost rises linearly; internal failure cost falls faster.' }),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Quality gates' }));
    const gates = p.tasks.filter((t) => t.spec.qualityGate);
    body.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Package', 'Metric', 'Target', 'Tolerance', 'Current', 'Status'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, gates.map((t) => {
        const g = t.spec.qualityGate;
        const v = p.quality[g.metric];
        const ok = v <= g.tolerance;
        return el('tr', {}, [
          el('td', { text: `${t.code} ${t.name}` }),
          el('td', { text: g.metric }),
          el('td', { class: 'num', text: `${g.target} ${g.unit}` }),
          el('td', { class: 'num', text: String(g.tolerance) }),
          el('td', { class: 'num', text: v.toFixed(2) }),
          el('td', {}, [pill(ok ? 'IN CONTROL' : 'OUT OF TOLERANCE', ok ? 'ok' : 'bad')]),
        ]);
      })),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Control chart' }));
    body.appendChild(el('div', { class: 'row' }, gates.map((t) =>
      el('button', { class: `action ${this.qualityMetric === t.spec.qualityGate.metric ? '' : 'ghost'}`, text: t.spec.qualityGate.metric, onclick: () => { this.qualityMetric = t.spec.qualityGate.metric; this.render(); } }))));
    body.appendChild(controlChart(p, this.qualityMetric, { width: 900, height: 220 }));
    body.appendChild(el('p', { class: 'note', text:
      'Each point is an inspection sample. Points above the upper control limit trigger rework: the affected part of the ' +
      'package is torn out and rebuilt, which is why internal failure cost is charged to the schedule as well as the budget.' }));

    body.appendChild(el('h3', { class: 'section', text: 'The 0.5 millimetre joint' }));
    body.appendChild(el('p', { class: 'note', text:
      'Petrie measured the mean joint of the surviving Tura casing blocks at half a millimetre over surfaces two and a half ' +
      'metres square — a tolerance that would be respectable in a modern machine shop, achieved with copper saws, sand ' +
      'abrasive and eyesight. It is the single most demanding quality requirement on the project, and it sits on the ' +
      'critical path through 7.1 and 7.2.' }));
  }

  /* ---------------------------------------------------------- procurement */

  _render_procurement(body) {
    const p = this.project;
    body.appendChild(el('div', { class: 'grid c3' }, [
      kpi('Contracts', String(p.procurement.length), 'in the register'),
      kpi('Committed value', `${fmtNum(p.procurement.reduce((s, c) => s + c.value, 0))} kdb`, `${fmtPct(p.procurement.reduce((s, c) => s + c.value, 0) / p.bac)} of BAC`),
      kpi('Closed', String(p.procurement.filter((c) => c.status === 'Closed').length), 'delivered and accepted'),
    ]));
    body.appendChild(el('h3', { class: 'section', text: 'Contract register' }));
    body.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['ID', 'Item / supplier', 'Type', 'Value', 'Lead time', 'Status', 'Linked risk'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, p.procurement.map((c) => el('tr', {}, [
        el('td', { text: c.id }),
        el('td', {}, [el('b', { text: c.item }), el('div', { style: { fontSize: '11px', opacity: 0.75 }, text: c.supplier }), el('div', { style: { fontSize: '11px', opacity: 0.6 }, text: c.terms })]),
        el('td', { text: c.contractType }),
        el('td', { class: 'num', text: fmtNum(c.value) }),
        el('td', { class: 'num', text: `${c.leadTimeDays} d` }),
        el('td', {}, [pill(c.status, c.status === 'Closed' ? 'ok' : c.status === 'Planned' ? 'muted' : 'info')]),
        el('td', { text: c.risk }),
      ]))),
    ]));
    body.appendChild(el('p', { class: 'note', text:
      'Contract type follows risk allocation, exactly as it should. Tura casing is fixed price because the quantity and ' +
      'the specification are both known. Aswan granite is cost plus fixed fee, because nobody — then or now — can estimate ' +
      'the extraction of a seventy-tonne monolith with enough confidence to price it firm.' }));
  }

  /* --------------------------------------------------------- stakeholders */

  _render_stakeholders(body) {
    const p = this.project;
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '400px 1fr', gap: '18px', alignItems: 'start' } });
    const left = el('div');
    left.appendChild(el('h3', { class: 'section', text: 'Power / interest grid' }));
    left.appendChild(stakeholderGrid(p));
    left.appendChild(el('p', { class: 'note', text: 'Number in each bubble is the current engagement level: 1 Unaware, 2 Resistant, 3 Neutral, 4 Supportive, 5 Leading.' }));
    grid.appendChild(left);

    const right = el('div');
    right.appendChild(el('h3', { class: 'section', text: 'Stakeholder register' }));
    right.appendChild(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, ['Stakeholder', 'Power', 'Interest', 'Current', 'Desired', 'Satisfaction'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, p.stakeholders.map((s) => el('tr', {}, [
        el('td', {}, [el('b', { text: s.name }), el('div', { style: { fontSize: '11px', opacity: 0.75 }, text: s.role })]),
        el('td', { class: 'num', text: s.power }),
        el('td', { class: 'num', text: s.interest }),
        el('td', {}, [pill(s.levelName || s.current, s.level >= 4 ? 'ok' : s.level === 3 ? 'warn' : 'bad')]),
        el('td', { text: s.desired }),
        el('td', {}, [bar(s.satisfaction, s.satisfaction > 0.66 ? 'ok' : s.satisfaction > 0.42 ? 'warn' : 'bad')]),
      ]))),
    ]));
    grid.appendChild(right);
    body.appendChild(grid);

    body.appendChild(el('h3', { class: 'section', text: 'Engagement strategies' }));
    for (const s of p.stakeholders) {
      body.appendChild(el('p', { class: 'note', html: `<em>${s.name}</em> — ${s.influence}<br>${s.strategy}` }));
    }
  }

  /* ---------------------------------------------------------- monte carlo */

  _render_montecarlo(body) {
    const p = this.project;
    const runButton = el('button', {
      class: 'action', text: 'Run 4 000 iterations',
      onclick: () => {
        runButton.disabled = true;
        runButton.textContent = 'Running…';
        setTimeout(() => {
          this.monteCarloResult = runMonteCarlo(p, { iterations: 4000, seed: 12345 + p.day });
          if (this.sim.advisor) this.sim.advisor.setForecast(this.monteCarloResult);
          this.render();
        }, 30);
      },
    });
    this.headExtra.appendChild(runButton);

    if (!this.monteCarloResult) {
      body.appendChild(el('p', { class: 'note', text:
        'Monte Carlo simulation samples every remaining activity duration from its PERT-beta distribution, rolls each ' +
        'identified risk as a Bernoulli trial against its current probability, and re-runs the whole critical path ' +
        'network for every iteration. That captures the merge bias that PERT cannot: near-critical paths become ' +
        'critical in some outcomes, which is why the P50 finish is always later than the deterministic estimate.' }));
      body.appendChild(el('button', { class: 'action', text: 'Run the analysis', onclick: () => runButton.click() }));
      return;
    }

    const r = this.monteCarloResult;
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('P50 finish', `day ${Math.round(r.finish.p50)}`, `${(r.finish.p50 / 365).toFixed(1)} years`),
      kpi('P80 finish', `day ${Math.round(r.finish.p80)}`, 'commit to this one', 'warn'),
      kpi('P90 finish', `day ${Math.round(r.finish.p90)}`, `${Math.round(r.finish.p90 - r.baseline)} d beyond baseline`, 'bad'),
      kpi('P(on time)', fmtPct(r.probabilityOnTime), `baseline day ${r.baseline}`, r.probabilityOnTime > 0.5 ? 'good' : 'bad'),
    ]));
    body.appendChild(el('div', { class: 'grid c4' }, [
      kpi('P50 cost', `${fmtNum(r.cost.p50)} kdb`, ''),
      kpi('P80 cost', `${fmtNum(r.cost.p80)} kdb`, 'recommended funding level', 'warn'),
      kpi('P(on budget)', fmtPct(r.probabilityOnBudget), `BAC ${fmtNum(r.bac)}`, r.probabilityOnBudget > 0.5 ? 'good' : 'bad'),
      kpi('Iterations', r.iterations.toLocaleString(), 'PERT-beta + Bernoulli risks'),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Completion date distribution' }));
    body.appendChild(monteCarloChart(r, { width: 900, height: 280 }));
    body.appendChild(el('div', { class: 'legend' }, [
      el('span', { html: `<i style="background:rgba(47,111,168,0.7)"></i>frequency` }),
      el('span', { html: `<i style="background:${CHART_COLORS.gold}"></i>cumulative probability` }),
    ]));

    body.appendChild(el('h3', { class: 'section', text: 'Sensitivity — what actually drives the finish date' }));
    body.appendChild(tornadoChart(r, { width: 880 }));
    body.appendChild(el('p', { class: 'note', text:
      'Correlation between each package’s sampled duration and the project finish date across all iterations. A package ' +
      'with a long duration but no correlation is not worth managing; a short one with high correlation is where the ' +
      'attention should go.' }));

    body.appendChild(el('h3', { class: 'section', text: 'What to tell the sponsor' }));
    body.appendChild(el('p', { class: 'note', html:
      `“The deterministic schedule says day ${r.baseline}. The analysis says there is a <em>${fmtPct(r.probabilityOnTime)}</em> ` +
      `chance of achieving it. I recommend we commit to day <em>${Math.round(r.finish.p80)}</em>, which we will meet four ` +
      `times in five, and fund to <em>${fmtNum(r.cost.p80)} kdb</em>. The difference between the two dates is not padding: ` +
      `it is the price of the uncertainty we have already identified and written down.”` }));
  }

  /* ------------------------------------------------------------ missions */

  _render_missions(body) {
    const p = this.project;
    for (const m of p.missions) {
      const done = m.status === 'complete';
      const active = m.status === 'active';
      const card = el('div', {
        style: {
          border: `1px solid ${done ? 'rgba(78,154,90,0.4)' : active ? 'rgba(212,169,47,0.5)' : 'rgba(236,224,198,0.1)'}`,
          borderRadius: '9px', padding: '13px 15px', marginBottom: '11px',
          background: active ? 'rgba(212,169,47,0.06)' : 'transparent',
          opacity: m.status === 'locked' ? 0.55 : 1,
        },
      });
      card.appendChild(el('div', { class: 'row between' }, [
        el('h4', { style: { margin: 0, fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--gold-soft)' }, text: `${m.id} · ${m.name}` }),
        pill(done ? 'COMPLETE' : active ? 'ACTIVE' : 'LOCKED', done ? 'ok' : active ? 'gold' : 'muted'),
      ]));
      card.appendChild(el('p', { class: 'note', text: m.brief }));
      for (const o of m.objectives) {
        card.appendChild(el('div', { class: `objective ${o.done ? 'done' : ''}` }, [
          el('span', { class: 'box' }), el('span', { text: o.text }),
        ]));
      }
      card.appendChild(el('p', { class: 'note', style: { marginBottom: 0 }, html: `<em>Reward:</em> ${m.reward}` }));
      body.appendChild(card);
    }
  }
}

export { PANELS };
