/**
 * The project dashboard: twelve panels over the same simulation the 3-D world
 * is rendering.
 *
 * Nothing here recomputes anything. Every figure is read from the project the
 * world is already showing, so the cost on an inspect card, the total in the
 * bill of quantities and the budget in the earned-value panel are the same
 * number arrived at once.
 *
 * Selecting a work package anywhere in these panels highlights the geometry it
 * paid for, which is the point of tying a bill of quantities to a model.
 */
import { el, fill, clear, row, bar, pct, byId } from './dom.js';
import { VIZ, sCurve, barsH, gantt, histogram, tornado, grid2d, resourceBars, controlChart, legend } from './charts.js';
import {
  CONTROL_ACCOUNTS, CA_BY_ID, PACKAGES, PKG_BY_ID, RESOURCES, RISKS, CONTRACTS,
  STAKEHOLDERS, QUALITY_GATES, PROJECT_META, RESERVES, PROJECT_BUDGET_PKR,
} from '../pm/model.js';
import { relationLabel, pertMean, pertSigma } from '../pm/cpm.js';
import {
  wbsRows, earnedValue, costByAccount, costOfQuality, resourceState, milestoneTable,
  diagnose, confidenceDay, formatDay, packageProgress,
} from '../pm/project.js';
import { runMonteCarlo } from '../pm/montecarlo.js';
import { BOQ, RATES, lineCost, formatPKR, formatPKRExact, BOQ_TOTAL } from '../pm/rates.js';
import { LAYER, XRAY_LEGEND } from '../world/mansion.js';
import { ROOMS, roomArea, coveredArea, PLOT } from '../world/plan.js';


const TABS = [
  { id: 'charter', label: 'Charter' },
  { id: 'wbs', label: 'Work breakdown' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'cost', label: 'Cost & earned value' },
  { id: 'boq', label: 'Bill of quantities' },
  { id: 'risk', label: 'Risk' },
  { id: 'resources', label: 'Resources' },
  { id: 'quality', label: 'Quality' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'stakeholders', label: 'Stakeholders' },
  { id: 'montecarlo', label: 'Monte Carlo' },
  { id: 'advisor', label: 'Advisor' },
];

export function createPanels(ctx) {
  const { api, hud } = ctx;
  const project = api.project;
  const body = byId('dashBody');
  const tabsEl = byId('dashTabs');

  let active = 'charter';
  let selectedPkg = null;
  let mc = null;
  let boqFilter = '';

  const tabButtons = new Map();
  fill(tabsEl, TABS.map((t) => {
    const button = el('button', {
      class: 'tab', type: 'button', text: t.label,
      onclick: () => show(t.id),
    });
    tabButtons.set(t.id, button);
    return button;
  }));
  byId('dashClose').addEventListener('click', () => ctx.openOverlay(null));

  function show(id) {
    active = id;
    for (const [key, button] of tabButtons) button.classList.toggle('on', key === id);
    refresh();
  }

  function selectPackage(pkgId) {
    selectedPkg = selectedPkg === pkgId ? null : pkgId;
    api.world.setHighlightPackage(selectedPkg);
    refresh();
  }

  /* ------------------------------------------------------------- charter */
  function panelCharter() {
    const evm = earnedValue(project, api.day);
    const area = coveredArea();
    return [
      el('h3', { class: 'panel-head', text: `${PROJECT_META.name} — project charter` }),
      el('p', { class: 'panel-lede', text: `${PROJECT_META.subtitle}. ${PROJECT_META.locale}. A ${PLOT.areaM2} m² plot carrying ${Math.round(area)} m² of covered area over three levels, delivered against a ${project.baseFinish}-working-day baseline programme for ${formatPKR(PROJECT_BUDGET_PKR)}.` }),

      el('div', { class: 'kpis' }, [
        kpi('Construction budget', formatPKR(PROJECT_BUDGET_PKR), 'Bill of quantities, totalled', 'gold'),
        kpi('Baseline duration', `${project.baseFinish} days`, `Practical completion ${formatDay(project.baseFinish)}`),
        kpi('Forecast duration', `${project.actFinish} days`, `${project.actFinish - project.baseFinish >= 0 ? '+' : ''}${project.actFinish - project.baseFinish} days against baseline`,
          project.actFinish <= project.baseFinish ? 'good' : 'warn'),
        kpi('Contingency', formatPKR(RESERVES.contingencyPKR), `${pct(RESERVES.contingencyPct, 1)} of budget`),
        kpi('Management reserve', formatPKR(RESERVES.managementPKR), `${pct(RESERVES.managementPct, 1)} of budget`),
        kpi('Covered area', `${Math.round(area)} m²`, `${ROOMS.length} rooms over three levels`),
      ]),

      el('div', { class: 'note' }, [
        el('b', { text: 'On the rates. ' }),
        PROJECT_META.costNote,
      ]),

      el('h4', { class: 'section-title', text: 'Objectives and success criteria' }),
      table(
        ['Domain', 'Objective', 'Measured by'],
        [
          ['Scope', 'A two-kanal residence of 894 m² covered area over basement, ground and first floors, plus a two-bay garage and full external works.', 'Room schedule signed by the client before the design freeze'],
          ['Time', `Practical completion within ${project.baseFinish} working days of ground breaking.`, 'CPM finish against the baseline, reported fortnightly'],
          ['Cost', `Final account within ${formatPKR(PROJECT_BUDGET_PKR)} plus the ${pct(RESERVES.contingencyPct, 1)} contingency.`, 'Earned-value cost variance and the forecast at completion'],
          ['Quality', 'Every one of the ten gates passed, with rework closed before the following trade starts.', 'Inspection records and the statistical control chart'],
          ['Safety', 'No reportable incident.', 'Site safety register and the toolbox-talk log'],
        ].map((r) => [r[0], r[1], r[2]]),
      ),

      el('h4', { class: 'section-title', text: 'Assumptions and constraints' }),
      el('table', { class: 'data' }, [
        el('tbody', {}, [
          ...[
            ['Assumption', 'A six-day working week, Monday to Saturday. All durations in this model are working days.'],
            ['Assumption', 'Ground conditions as reported: firm silty clay, allowable bearing 1.6 kg/cm², no water table within the basement depth.'],
            ['Assumption', 'Imported packages — stone, joinery, the lift — are ordered against letters of credit opened at foundation stage.'],
            ['Constraint', 'LDA approval must be in hand before excavation; the network makes it a predecessor of the excavation package.'],
            ['Constraint', 'No concrete pour is scheduled into the July–August monsoon window.'],
            ['Constraint', 'Working hours 07:00–19:00, agreed with the residents’ association.'],
            ['Exclusion', 'Land, statutory connection deposits and the client’s vehicles are outside this budget.'],
          ].map(([kind, note]) => el('tr', {}, [
            el('td', { class: 'muted', style: { width: '110px' }, text: kind }),
            el('td', { text: note }),
          ])),
        ]),
      ]),

      el('h4', { class: 'section-title', text: 'Milestones' }),
      table(
        ['Milestone', 'Baseline', 'Forecast', 'Variance', 'Status'],
        milestoneTable(project).map((ms) => [
          ms.name,
          { num: true, text: `Day ${ms.plannedDay}` },
          { num: true, text: `Day ${ms.forecastDay}` },
          { num: true, text: `${ms.varianceDays > 0 ? '+' : ''}${ms.varianceDays} d`, cls: ms.varianceDays > 0 ? 'bad' : 'good' },
          api.day >= ms.forecastDay ? 'Achieved' : `Due ${formatDay(ms.forecastDay)}`,
        ]),
      ),
    ];
  }

  /* ----------------------------------------------------------------- WBS */
  function panelWbs() {
    const rows = wbsRows(project, api.day);
    const nodes = [];
    for (const group of rows) {
      nodes.push(el('tr', { class: 'group' }, [
        el('td', { text: `${group.ca.code}  ${group.ca.name}` }),
        el('td', { class: 'num', text: formatPKR(group.budget) }),
        el('td', { class: 'num', text: formatPKR(group.ev) }),
        el('td', {}, [bar(group.progress, group.progress >= 1 ? 'good' : null)]),
        el('td', { class: 'num', text: pct(group.progress) }),
        el('td', { class: `num ${group.spi >= 0.98 ? 'good' : 'bad'}`, text: group.spi.toFixed(3) }),
        el('td', { class: `num ${group.cpi >= 0.98 ? 'good' : 'bad'}`, text: group.cpi.toFixed(3) }),
      ]));
      for (const child of group.children) {
        const selected = selectedPkg === child.pkg.id;
        nodes.push(el('tr', {
          class: `clickable${selected ? ' sel' : ''}`,
          onclick: () => selectPackage(child.pkg.id),
          title: 'Select to highlight what this package paid for in the model',
        }, [
          el('td', {}, [
            el('span', { class: 'muted', text: `${child.pkg.code}  ` }),
            child.pkg.name,
            child.critical ? el('span', { class: 'crit', text: '  · critical' }) : null,
            child.notes.length ? el('div', { class: 'muted', style: { 'font-size': '11px' }, text: child.notes.join(' · ') }) : null,
          ]),
          el('td', { class: 'num', text: formatPKR(child.budget) }),
          el('td', { class: 'num', text: formatPKR(child.budget * child.progress) }),
          el('td', {}, [bar(child.progress, child.progress >= 1 ? 'good' : null)]),
          el('td', { class: 'num', text: pct(child.progress) }),
          el('td', { class: 'num', text: `${Math.round(child.tf)} d` }),
          el('td', { class: 'num', text: `${child.durActual} d` }),
        ]));
      }
    }
    const evm = earnedValue(project, api.day);
    return [
      el('h3', { class: 'panel-head', text: 'Work breakdown structure' }),
      el('p', { class: 'panel-lede', text: `Nine control accounts and ${PACKAGES.length} work packages. Every package carries a three-point estimate, a dependency in the precedence network, a crew, and a budget taken from the bill of quantities — which is why the control-account budgets below sum to the project budget exactly. Select a package to highlight the geometry it paid for.` }),
      el('div', { class: 'kpis' }, [
        kpi('Budget at completion', formatPKR(evm.bac), 'Sum of all control accounts', 'gold'),
        kpi('Earned to date', formatPKR(evm.ev), `${pct(evm.percentComplete, 1)} complete`),
        kpi('Packages complete', String(PACKAGES.filter((p) => packageProgress(project, p.id, api.day) >= 1).length),
          `of ${PACKAGES.length}`),
        kpi('On the critical path', String(project.criticalIds.length), 'zero total float'),
      ]),
      selectedPkg ? packageDetail(selectedPkg) : null,
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['Package', 'Budget', 'Earned', 'Progress', '%', 'Float', 'Duration']
          .map((h, i) => el('th', { class: i > 0 ? 'num' : '', text: h })))]),
        el('tbody', {}, nodes),
      ]),
    ];
  }

  function packageDetail(pkgId) {
    const pkg = PKG_BY_ID.get(pkgId);
    if (!pkg) return null;
    const i = project.net.index.get(pkgId);
    const lines = BOQ.filter((l) => l.pkg === pkgId);
    const account = CA_BY_ID.get(pkg.ca);
    return el('div', { class: 'note' }, [
      el('b', { text: `${pkg.code}  ${pkg.name}` }),
      el('div', { style: { 'margin-top': '6px' } }, [
        `${account.name} · crew: ${RESOURCES.find((r) => r.id === pkg.crew).name} · `,
        `three-point ${pkg.o}/${pkg.m}/${pkg.p} days, expected ${pertMean(pkg).toFixed(1)} ± ${pertSigma(pkg).toFixed(1)} · `,
        `baseline days ${Math.round(project.baseline.es[i])}–${Math.round(project.baseline.ef[i])}, `,
        `as built ${Math.round(project.actual.es[i])}–${Math.round(project.actual.ef[i])} · `,
        `total float ${Math.round(project.baseline.tf[i])} d, free float ${Math.round(project.baseline.ff[i])} d`,
      ]),
      pkg.deps.length ? el('div', { style: { 'margin-top': '6px' } }, [
        'Depends on: ',
        pkg.deps.map((d) => `${PKG_BY_ID.get(d.id).code} (${relationLabel(d.type, d.lag)})`).join(', '),
      ]) : null,
      lines.length ? el('div', { style: { 'margin-top': '6px' } }, [
        'Paid for: ',
        lines.map((l) => `${l.label} — ${formatPKR(lineCost(l))}`).join('; '),
      ]) : el('div', { class: 'muted', style: { 'margin-top': '6px' }, text: 'No direct bill-of-quantities line: this package is recovered through the preliminaries.' }),
      el('div', { class: 'insp-actions', style: { 'margin-top': '10px' } }, [
        el('button', { class: 'chip', type: 'button', text: 'Go to the day it starts', onclick: () => {
          api.setDay(Math.round(project.actual.es[i]));
          ctx.openOverlay(null);
        } }),
        el('button', { class: 'chip', type: 'button', text: 'Clear selection', onclick: () => selectPackage(pkgId) }),
      ]),
    ]);
  }

  /* ------------------------------------------------------------ schedule */
  function panelSchedule() {
    const rows = [];
    for (const pkg of PACKAGES) {
      const i = project.net.index.get(pkg.id);
      rows.push({
        label: `${pkg.code} ${pkg.name.length > 30 ? `${pkg.name.slice(0, 28)}…` : pkg.name}`,
        start: project.actual.es[i], finish: project.actual.ef[i],
        baseStart: project.baseline.es[i], baseFinish: project.baseline.ef[i],
        critical: !!project.baseline.critical[i],
        float: project.baseline.tf[i],
        done: api.day >= project.actual.ef[i],
      });
    }
    const variance = project.criticalSigma;
    return [
      el('h3', { class: 'panel-head', text: 'Schedule' }),
      el('p', { class: 'panel-lede', text: `A precedence network with all four dependency types and leads and lags. The pale bar behind each activity is the baseline; the solid bar is the as-built programme. Activities on the critical path are drawn in red and labelled "critical" — the colour is never the only signal.` }),
      el('div', { class: 'kpis' }, [
        kpi('Baseline finish', `Day ${project.baseFinish}`, formatDay(project.baseFinish)),
        kpi('Forecast finish', `Day ${project.actFinish}`, formatDay(project.actFinish),
          project.actFinish > project.baseFinish ? 'warn' : 'good'),
        kpi('Critical path σ', `${variance.toFixed(1)} d`, 'PERT, critical activities only'),
        kpi('80% confident by', `Day ${Math.round(confidenceDay(project, 0.8))}`, formatDay(Math.round(confidenceDay(project, 0.8)))),
      ]),
      gantt(project, rows, api.day),
      legend([
        { colour: VIZ.accent, label: 'As-built activity' },
        { colour: 'rgba(255,255,255,0.14)', label: 'Baseline' },
        { colour: VIZ.critical, label: 'On the critical path' },
      ]),
      el('h4', { class: 'section-title', text: 'Network analysis' }),
      table(
        ['Package', 'Depends on', 'ES', 'EF', 'LS', 'LF', 'Total float', 'Free float'],
        PACKAGES.map((pkg) => {
          const i = project.net.index.get(pkg.id);
          const crit = !!project.baseline.critical[i];
          return [
            { text: `${pkg.code} ${pkg.name}${crit ? ' · critical' : ''}`, cls: crit ? 'crit' : '' },
            pkg.deps.map((d) => `${PKG_BY_ID.get(d.id).code} ${relationLabel(d.type, d.lag)}`).join(', ') || '—',
            { num: true, text: Math.round(project.baseline.es[i]) },
            { num: true, text: Math.round(project.baseline.ef[i]) },
            { num: true, text: Math.round(project.baseline.ls[i]) },
            { num: true, text: Math.round(project.baseline.lf[i]) },
            { num: true, text: `${Math.round(project.baseline.tf[i])} d`, cls: crit ? 'crit' : '' },
            { num: true, text: `${Math.round(project.baseline.ff[i])} d` },
          ];
        }),
      ),
    ];
  }

  /* ---------------------------------------------------------------- cost */
  function panelCost() {
    const evm = earnedValue(project, api.day);
    const accounts = costByAccount(project, api.day);
    const coq = costOfQuality(project);
    return [
      el('h3', { class: 'panel-head', text: 'Cost and earned value' }),
      el('p', { class: 'panel-lede', text: 'The full earned-value set, computed at the day the timeline is showing. Schedule performance converges to 1.0 at completion whatever actually happened, which is why Earned Schedule is reported beside it: it keeps telling the truth to the last day.' }),
      el('div', { class: 'kpis' }, [
        kpi('Planned value', formatPKR(evm.pv), 'PV — budgeted cost of work scheduled'),
        kpi('Earned value', formatPKR(evm.ev), 'EV — budgeted cost of work performed'),
        kpi('Actual cost', formatPKR(evm.ac), 'AC — actual cost of work performed'),
        kpi('Schedule variance', formatPKR(evm.sv), `SV = EV − PV`, evm.sv >= 0 ? 'good' : 'bad'),
        kpi('Cost variance', formatPKR(evm.cv), 'CV = EV − AC', evm.cv >= 0 ? 'good' : 'bad'),
        kpi('SPI', evm.spi.toFixed(3), 'EV / PV', evm.spi >= 0.98 ? 'good' : 'bad'),
        kpi('CPI', evm.cpi.toFixed(3), 'EV / AC', evm.cpi >= 0.98 ? 'good' : 'bad'),
        kpi('SPI(t)', evm.spit.toFixed(3), `Earned schedule — ${Math.abs(Math.round(evm.svt))} days ${evm.svt < 0 ? 'behind' : 'ahead'}`,
          evm.spit >= 0.98 ? 'good' : 'bad'),
        kpi('Forecast at completion', formatPKR(evm.eac), 'EAC = BAC / CPI', 'gold'),
        kpi('To complete', formatPKR(evm.etc), 'ETC = EAC − AC'),
        kpi('Variance at completion', formatPKR(evm.vac), 'VAC = BAC − EAC', evm.vac >= 0 ? 'good' : 'bad'),
        kpi('TCPI', evm.tcpi.toFixed(3), 'Efficiency the rest of the work needs', evm.tcpi <= 1.02 ? 'good' : 'warn'),
      ]),
      sCurve(project, api.day),
      el('h4', { class: 'section-title', text: 'The three forecasts' }),
      table(['Formula', 'Assumption', 'Forecast at completion'], [
        ['EAC = BAC / CPI', 'Cost performance to date continues', { num: true, text: formatPKR(evm.eac1) }],
        ['EAC = AC + (BAC − EV)', 'The remaining work runs to plan', { num: true, text: formatPKR(evm.eac2) }],
        ['EAC = AC + (BAC − EV) / (CPI × SPI)', 'Both cost and schedule trends continue', { num: true, text: formatPKR(evm.eac3) }],
      ]),
      el('h4', { class: 'section-title', text: 'By control account' }),
      barsH(accounts.map((a) => ({
        label: a.ca.name,
        value: a.budget,
        display: formatPKR(a.budget),
        dim: a.ev / Math.max(1, a.budget) < 0.02,
      })), { labelW: 250 }),
      table(['Control account', 'Budget', 'Earned', 'Actual', 'CV', 'SPI', 'CPI'],
        accounts.map((a) => [
          a.ca.name,
          { num: true, text: formatPKR(a.budget) },
          { num: true, text: formatPKR(a.ev) },
          { num: true, text: formatPKR(a.ac) },
          { num: true, text: formatPKR(a.cv), cls: a.cv >= 0 ? 'good' : 'bad' },
          { num: true, text: a.spi.toFixed(3) },
          { num: true, text: a.cpi.toFixed(3) },
        ])),
      el('h4', { class: 'section-title', text: 'Cost of quality' }),
      table(['Category', 'What it bought', 'Cost'], [
        ['Prevention', 'Risk responses put in place before the risk could occur', { num: true, text: formatPKR(coq.prevention) }],
        ['Appraisal', 'Inspection, laboratory testing and survey at the ten gates', { num: true, text: formatPKR(coq.appraisal) }],
        ['Internal failure', 'Rework found by our own inspection, before handover', { num: true, text: formatPKR(coq.internalFailure) }],
        ['External failure', 'Defects found by the client after handover', { num: true, text: formatPKR(coq.externalFailure) }],
        [{ text: 'Total', cls: 'good' }, '', { num: true, text: formatPKR(coq.total) }],
      ]),
    ];
  }

  /* ----------------------------------------------------- bill of quantities */
  function panelBoq() {
    const search = boqFilter.trim().toLowerCase();
    const lines = BOQ.filter((l) => {
      if (!search) return true;
      const rate = RATES[l.rate];
      return `${l.label} ${l.id} ${l.pkg} ${rate.note}`.toLowerCase().includes(search);
    });
    const shownTotal = lines.reduce((s, l) => s + lineCost(l), 0);
    const byAccount = new Map();
    for (const line of lines) {
      const pkg = PKG_BY_ID.get(line.pkg);
      const key = pkg ? pkg.ca : 'other';
      const list = byAccount.get(key) || [];
      list.push(line);
      byAccount.set(key, list);
    }
    const rows = [];
    for (const ca of CONTROL_ACCOUNTS) {
      const list = byAccount.get(ca.id);
      if (!list || !list.length) continue;
      const subtotal = list.reduce((s, l) => s + lineCost(l), 0);
      rows.push(el('tr', { class: 'group' }, [
        el('td', { colspan: '4', text: `${ca.code}  ${ca.name}` }),
        el('td', { class: 'num', text: formatPKR(subtotal) }),
      ]));
      for (const line of list) {
        const rate = RATES[line.rate];
        rows.push(el('tr', {
          class: 'clickable',
          onclick: () => selectPackage(line.pkg),
          title: rate.note,
        }, [
          el('td', {}, [line.label, el('div', { class: 'muted', style: { 'font-size': '11px' }, text: rate.note })]),
          el('td', { class: 'num muted', text: PKG_BY_ID.get(line.pkg) ? PKG_BY_ID.get(line.pkg).code : line.pkg }),
          el('td', { class: 'num', text: `${line.qty} ${rate.unit}` }),
          el('td', { class: 'num', text: formatPKRExact(rate.pkr) }),
          el('td', { class: 'num', text: formatPKRExact(lineCost(line)) }),
        ]));
      }
    }
    return [
      el('h3', { class: 'panel-head', text: 'Bill of quantities' }),
      el('p', { class: 'panel-lede', text: `Every rupee in this project comes from this table: rate × quantity, summed into a work package, summed into a control account, summed into the budget. The figure on an inspect card in the 3-D world is read from the same line. Click a row to highlight what it paid for.` }),
      el('div', { class: 'field' }, [
        el('div', {}, [
          el('div', { class: 'field-label', text: 'Search the bill' }),
          el('div', { class: 'field-help', text: 'By description, rate note, work package code or line id.' }),
        ]),
        el('div', { class: 'field-control' }, [
          el('input', {
            type: 'text',
            value: boqFilter,
            placeholder: 'marble, garage door, M7…',
            oninput: (event) => { boqFilter = event.target.value; refresh(); },
          }),
        ]),
      ]),
      el('div', { class: 'kpis' }, [
        kpi('Lines shown', `${lines.length}`, `of ${BOQ.length} in the bill`),
        kpi('Value shown', formatPKR(shownTotal), search ? 'Matching your search' : 'The whole bill', 'gold'),
        kpi('Reconciliation', Math.abs(BOQ_TOTAL - PROJECT_BUDGET_PKR) < 0.5 ? 'Exact' : 'MISMATCH',
          'Bill total against the project budget',
          Math.abs(BOQ_TOTAL - PROJECT_BUDGET_PKR) < 0.5 ? 'good' : 'bad'),
      ]),
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Description' }),
          el('th', { class: 'num', text: 'Pkg' }),
          el('th', { class: 'num', text: 'Quantity' }),
          el('th', { class: 'num', text: 'Rate (PKR)' }),
          el('th', { class: 'num', text: 'Amount (PKR)' }),
        ])]),
        el('tbody', {}, rows),
      ]),
    ];
  }

  /* ---------------------------------------------------------------- risk */
  function panelRisk() {
    const outcomes = project.riskOutcomes;
    const emv = outcomes.reduce((s, r) => s + r.emvPKR, 0);
    const residual = outcomes.reduce((s, r) => s + r.residualEmvPKR, 0);
    const responseCost = outcomes.reduce((s, r) => s + (r.responded ? r.responseCostPKR : 0), 0);
    const realised = outcomes.filter((r) => r.occurred && r.day !== null && r.day <= api.day);
    return [
      el('h3', { class: 'panel-head', text: 'Risk register' }),
      el('p', { class: 'panel-lede', text: 'Fourteen quantified risks with a probability, a schedule impact, a cost impact and a response that costs real money. Expected monetary value is probability × cost; the residual column is the same calculation after the response has been paid for, and the difference is what the responses bought.' }),
      el('div', { class: 'kpis' }, [
        kpi('Gross EMV', formatPKR(emv), 'Before any response'),
        kpi('Residual EMV', formatPKR(residual), 'After the planned responses', 'good'),
        kpi('Spent on responses', formatPKR(responseCost), 'Prevention cost'),
        kpi('EMV avoided', formatPKR(emv - residual - responseCost), 'Net of what the responses cost',
          emv - residual - responseCost > 0 ? 'good' : 'warn'),
        kpi('Realised to date', `${realised.length}`, realised.length ? realised.map((r) => r.id).join(', ') : 'None yet',
          realised.length ? 'warn' : 'good'),
        kpi('Contingency drawn', formatPKR(realised.reduce((s, r) => s + r.impactCostPKR, 0)),
          `of ${formatPKR(RESERVES.contingencyPKR)}`),
      ]),
      table(
        ['Risk', 'Category', 'P', 'Days', 'Cost', 'EMV', 'Response', 'Residual P', 'Status'],
        outcomes.map((r) => [
          { text: `${r.id}  ${r.name}`, sub: r.note },
          r.cat,
          { num: true, text: pct(r.prob) },
          { num: true, text: r.days ? `${r.days} d` : '—' },
          { num: true, text: formatPKR(r.costPKR) },
          { num: true, text: formatPKR(r.emvPKR) },
          r.response,
          { num: true, text: pct(r.residual) },
          r.occurred
            ? { text: r.day <= api.day ? `Realised, day ${r.day}` : `Forecast day ${r.day}`, cls: r.day <= api.day ? 'bad' : 'muted' }
            : { text: 'Not realised', cls: 'good' },
        ]),
      ),
    ];
  }

  /* ----------------------------------------------------------- resources */
  function panelResources() {
    const rows = resourceState(project, api.day);
    const total = rows.reduce((s, r) => s + r.assigned, 0);
    const overCost = rows.reduce((s, r) => s + r.overCostPKR, 0);
    return [
      el('h3', { class: 'panel-head', text: 'Resources' }),
      el('p', { class: 'panel-lede', text: 'Eleven crews, sized from the baseline resource histogram. Demand is derived from each package’s budget spread over its duration, taking only the labour content of the rate — the rest of a rate is material and plant, and paying it does not buy hours.' }),
      el('div', { class: 'kpis' }, [
        kpi('On site today', `${total}`, 'Across all crews'),
        kpi('Crews working', String(rows.filter((r) => r.assigned > 0).length), `of ${RESOURCES.length}`),
        kpi('Over-allocated', String(rows.filter((r) => r.over > 0).length), 'Crews above establishment',
          rows.some((r) => r.over > 0) ? 'warn' : 'good'),
        kpi('Over-allocation cost', formatPKR(overCost), 'Overtime at 1.5×, today'),
      ]),
      resourceBars(rows.map((r) => ({
        label: r.pool.name, demand: r.demand, size: r.pool.size, over: r.over,
      }))),
      table(['Crew', 'Establishment', 'Assigned', 'Over', 'Utilisation', 'Day rate', 'Labour content of a rate'],
        rows.map((r) => [
          r.pool.name,
          { num: true, text: String(r.pool.size) },
          { num: true, text: String(r.assigned) },
          { num: true, text: r.over ? `+${r.over}` : '—', cls: r.over ? 'bad' : '' },
          { num: true, text: pct(Math.min(1.5, r.utilisation)) },
          { num: true, text: formatPKRExact(r.pool.dayRatePKR) },
          { num: true, text: pct(r.pool.labourFrac) },
        ])),
    ];
  }

  /* ------------------------------------------------------------- quality */
  function panelQuality() {
    const gates = project.gateOutcomes;
    const failed = gates.filter((g) => !g.passed);
    return [
      el('h3', { class: 'panel-head', text: 'Quality' }),
      el('p', { class: 'panel-lede', text: 'Ten gates, each with a measured characteristic and a stated tolerance. The control chart plots every sample as a fraction of its own tolerance, so a cube test in psi and a plaster survey in millimetres can share one axis honestly. A sample outside the band buys rework days and rework cost, and those are already inside the as-built programme you are looking at.' }),
      el('div', { class: 'kpis' }, [
        kpi('Gates passed', `${gates.length - failed.length}`, `of ${gates.length}`, failed.length ? 'warn' : 'good'),
        kpi('Rework days', `${failed.reduce((s, g) => s + g.reworkAppliedDays, 0)} d`, 'Added to the programme'),
        kpi('Rework cost', formatPKR(failed.reduce((s, g) => s + g.reworkAppliedPKR, 0)), 'Internal failure cost'),
        kpi('First-time-right', pct((gates.length - failed.length) / gates.length), 'Gates passed at the first attempt',
          failed.length ? 'warn' : 'good'),
      ]),
      controlChart(gates),
      table(['Gate', 'Work package', 'Characteristic', 'Target', 'Tolerance', 'Measured', 'Result'],
        gates.map((g) => [
          `${g.id}  ${g.name}`,
          PKG_BY_ID.get(g.pkg) ? PKG_BY_ID.get(g.pkg).code : g.pkg,
          g.metric,
          { num: true, text: `${g.target} ${g.unit}` },
          { num: true, text: `±${g.tolerance} ${g.unit}` },
          { num: true, text: `${g.measured.toFixed(2)} ${g.unit}` },
          { text: g.passed ? 'Passed' : `Rework — ${g.reworkAppliedDays} d`, cls: g.passed ? 'good' : 'bad' },
        ])),
    ];
  }

  /* --------------------------------------------------------- procurement */
  function panelProcurement() {
    return [
      el('h3', { class: 'panel-head', text: 'Procurement' }),
      el('p', { class: 'panel-lede', text: 'Six contracts. The contract type is the interesting column: each one is chosen because of what is and is not known at tender, and the rationale is stated rather than assumed.' }),
      table(['Contract', 'Type', 'Covers', 'Lead time', 'Value', 'Why this contract type'],
        CONTRACTS.map((c) => {
          const value = BOQ
            .filter((l) => {
              const pkg = PKG_BY_ID.get(l.pkg);
              return c.cover.includes(l.pkg) || (pkg && c.cover.includes(pkg.ca));
            })
            .reduce((s, l) => s + lineCost(l), 0);
          return [
            `${c.id}  ${c.name}`,
            c.type,
            c.cover.map((id) => (CA_BY_ID.get(id) ? CA_BY_ID.get(id).short : id)).join(', '),
            { num: true, text: `${c.leadDays} d` },
            { num: true, text: formatPKR(value) },
            c.rationale,
          ];
        })),
    ];
  }

  /* -------------------------------------------------------- stakeholders */
  function panelStakeholders() {
    return [
      el('h3', { class: 'panel-head', text: 'Stakeholders' }),
      el('p', { class: 'panel-lede', text: 'Eight stakeholders on a power and interest grid. Every point is labelled, so identity comes from the name beside it rather than from a colour.' }),
      grid2d(STAKEHOLDERS.map((s) => ({
        x: s.interest, y: s.power, weight: s.baseline, label: s.name, note: s.note,
      }))),
      table(['Stakeholder', 'Power', 'Interest', 'Strategy', 'Engagement', 'How they are managed'],
        STAKEHOLDERS.map((s) => [
          s.name,
          { num: true, text: pct(s.power) },
          { num: true, text: pct(s.interest) },
          s.strategy,
          { num: true, text: pct(s.baseline), cls: s.baseline >= 0.7 ? 'good' : 'warn' },
          s.note,
        ])),
    ];
  }

  /* --------------------------------------------------------- monte carlo */
  function panelMonteCarlo() {
    if (!mc) {
      return [
        el('h3', { class: 'panel-head', text: 'Monte Carlo schedule risk' }),
        el('p', { class: 'panel-lede', text: 'Two thousand runs of the whole precedence network. Every activity duration is drawn from a PERT-beta fitted to its own three-point estimate, every risk gets a Bernoulli trial on its residual probability, and every quality gate is sampled. The same CPM engine solves each run.' }),
        el('button', {
          class: 'chip', type: 'button', text: 'Run the analysis',
          onclick: () => { mc = runMonteCarlo(project, 2000); refresh(); },
        }),
      ];
    }
    return [
      el('h3', { class: 'panel-head', text: 'Monte Carlo schedule risk' }),
      el('p', { class: 'panel-lede', text: `${mc.iterations} runs. Every activity duration drawn from a PERT-beta fitted to its three-point estimate, every risk given a Bernoulli trial on its residual probability, every quality gate sampled, and the same CPM engine used to solve each one.` }),
      el('div', { class: 'kpis' }, [
        kpi('P10', `Day ${Math.round(mc.p10)}`, formatDay(Math.round(mc.p10)), 'good'),
        kpi('P50', `Day ${Math.round(mc.p50)}`, formatDay(Math.round(mc.p50))),
        kpi('P80', `Day ${Math.round(mc.p80)}`, formatDay(Math.round(mc.p80)), 'warn'),
        kpi('P90', `Day ${Math.round(mc.p90)}`, formatDay(Math.round(mc.p90)), 'bad'),
        kpi('Mean', `Day ${mc.mean.toFixed(0)}`, `σ ${mc.sd.toFixed(1)} days`),
        kpi('Chance of the baseline', pct(mc.probabilityOfBaseline), `Finishing by day ${mc.baselineFinish}`,
          mc.probabilityOfBaseline > 0.5 ? 'good' : 'bad'),
      ]),
      histogram(mc),
      el('div', { class: 'note' }, [
        el('b', { text: 'Read this before you quote the baseline. ' }),
        `Only ${pct(mc.probabilityOfBaseline)} of runs finish by day ${mc.baselineFinish}. ` +
        `A commitment made at P80 — day ${Math.round(mc.p80)} — is one you would keep four times in five.`,
      ]),
      el('h4', { class: 'section-title', text: 'What actually drives the completion date' }),
      tornado(mc.tornado.slice(0, 12).map((t) => ({
        label: `${t.code} ${t.name.length > 30 ? `${t.name.slice(0, 28)}…` : t.name}`,
        value: t.correlation,
      }))),
      el('p', { class: 'panel-lede', text: 'Correlation between an activity’s sampled duration and the project’s finish date, across every run. An activity with a high correlation is one where a day saved is a day off the project.' }),
      el('h4', { class: 'section-title', text: 'Criticality index' }),
      table(['Package', 'On the critical path', 'Correlation with finish'],
        mc.criticality.slice(0, 14).map((t) => [
          `${t.code} ${t.name}`,
          { num: true, text: pct(t.criticality) },
          { num: true, text: t.correlation.toFixed(2) },
        ])),
      el('button', {
        class: 'chip', type: 'button', text: 'Run it again',
        onclick: () => { mc = runMonteCarlo(project, 2000, Math.floor(Math.random() * 1e6)); refresh(); },
      }),
    ];
  }

  /* -------------------------------------------------------------- advisor */
  function panelAdvisor() {
    const { evm, findings } = diagnose(project, api.day);
    return [
      el('h3', { class: 'panel-head', text: 'Advisor' }),
      el('p', { class: 'panel-lede', text: 'A transparent rule engine, not a black box: each finding names the measurement it came from and what it implies. Nothing here is generated text — every number is one of the figures in the panels beside it.' }),
      ...findings.map((f) => el('div', { class: `finding ${f.severity}` }, [
        el('h4', { text: f.title }),
        el('p', { text: f.body }),
        el('p', { class: 'action', text: f.action }),
      ])),
      el('h4', { class: 'section-title', text: 'The measurements behind these findings' }),
      table(['Measure', 'Value', 'What it means'], [
        ['SPI', { num: true, text: evm.spi.toFixed(3) }, 'Earned value divided by planned value. Converges to 1.0 at completion whatever happened.'],
        ['SPI(t)', { num: true, text: evm.spit.toFixed(3) }, 'Earned schedule. Stays meaningful to the last day, which is why it is quoted beside SPI.'],
        ['CPI', { num: true, text: evm.cpi.toFixed(3) }, 'Earned value divided by actual cost. Below 1.0 means the work cost more than it was worth.'],
        ['TCPI', { num: true, text: evm.tcpi.toFixed(3) }, 'The cost efficiency the remaining work must achieve to finish on budget.'],
        ['Earned schedule', { num: true, text: `${evm.es.toFixed(1)} d` }, `The day the baseline expected to have earned what has actually been earned. Today is day ${evm.day}.`],
      ]),
    ];
  }

  /* ---------------------------------------------------------- rendering */
  const RENDERERS = {
    charter: panelCharter,
    wbs: panelWbs,
    schedule: panelSchedule,
    cost: panelCost,
    boq: panelBoq,
    risk: panelRisk,
    resources: panelResources,
    quality: panelQuality,
    procurement: panelProcurement,
    stakeholders: panelStakeholders,
    montecarlo: panelMonteCarlo,
    advisor: panelAdvisor,
  };

  function refresh() {
    const render = RENDERERS[active] || panelCharter;
    const scroll = body.scrollTop;
    fill(body, render().filter(Boolean));
    body.scrollTop = active === 'boq' ? scroll : 0;
  }

  /* -------------------------------------------------------------- helpers */
  function kpi(label, value, note, tone) {
    return el('div', { class: `kpi${tone ? ` ${tone}` : ''}` }, [
      el('div', { class: 'kpi-label', text: label }),
      el('div', { class: 'kpi-value', text: value }),
      note ? el('div', { class: 'kpi-note', text: note }) : null,
    ]);
  }

  function table(headers, rows) {
    return el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, headers.map((h, i) => el('th', {
        class: i > 0 && i < headers.length - 1 ? 'num' : '', text: h,
      })))]),
      el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell) => {
        if (cell && typeof cell === 'object') {
          return el('td', { class: `${cell.num ? 'num ' : ''}${cell.cls || ''}`.trim() },
            cell.sub
              ? [cell.text, el('div', { class: 'muted', style: { 'font-size': '11px' }, text: cell.sub })]
              : cell.text);
        }
        return el('td', { text: cell });
      })))),
    ]);
  }

  show('charter');

  return {
    refresh,
    show,
    onDayChange() { if (!byId('dashboard').hidden) refresh(); },
    showPackage(pkgId) {
      selectedPkg = pkgId;
      api.world.setHighlightPackage(pkgId);
      show('wbs');
    },

    /** The controls reference. */
    buildHelp(node) {
      const keys = (title, pairs) => el('div', {}, [
        el('div', { class: 'section-title', text: title }),
        el('dl', {}, pairs.flatMap(([k, v]) => [
          el('dt', {}, k.split('/').map((part, i) => [i ? ' / ' : '', el('kbd', { text: part })]).flat()),
          el('dd', { text: v }),
        ])),
      ]);
      fill(node, [
        el('p', { class: 'panel-lede', text: 'Every action has a key and an on-screen control. Nothing in this model can only be reached with a mouse, and nothing can only be reached with a keyboard.' }),
        el('div', { class: 'keys' }, [
          keys('Moving', [
            ['W/A/S/D', 'Walk'],
            ['Shift', 'Run'],
            ['C', 'Crouch'],
            ['Mouse', 'Look — click the view first to capture the pointer'],
            ['Arrows', 'Look, without a mouse'],
            ['Space', 'Rise (drone mode)'],
            ['R', 'Return to the gate'],
            ['J', 'Jump to a room'],
          ]),
          keys('Interacting', [
            ['E', 'Open, close or inspect whatever you are looking at'],
            ['F', 'Inspect it, whether or not it opens'],
            ['Escape', 'Close the card, leave the tour, close a panel'],
          ]),
          keys('Modes and light', [
            ['1', 'Walk'],
            ['2', 'Orbit the site'],
            ['3', 'Guided tour of the house'],
            ['4', 'Drone'],
            ['5–9', 'Dawn, day, golden hour, dusk, night'],
            ['G', 'Guided tour of the construction'],
            ['X', 'WBS X-ray'],
          ]),
          keys('The project', [
            ['Tab', 'Project dashboard'],
            ['P', 'Play or pause the construction'],
            [', / .', 'One day back or forward'],
            ['[ / ]', 'A fortnight back or forward'],
            ['Home/End', 'Day 0 or handover'],
            ['O', 'Settings and session'],
            ['?', 'This card'],
          ]),
        ]),
        el('div', { class: 'note' }, [
          el('b', { text: 'Presenting from this file. ' }),
          'Add ?quality=low, medium, high or ultra to the address to pin the graphics tier on a machine you already know. Otherwise the engine picks a tier from the GPU and re-tiers itself against measured frame time.',
        ]),
      ]);
    },

    /** Settings and session. */
    buildSettings(node, deps) {
      const { quality, session, world } = deps;
      const field = (label, help, control) => el('div', { class: 'field' }, [
        el('div', {}, [
          el('div', { class: 'field-label', text: label }),
          help ? el('div', { class: 'field-help', text: help }) : null,
        ]),
        el('div', { class: 'field-control' }, control),
      ]);
      const rebuild = () => this.buildSettings(node, deps);
      fill(node, [
        el('div', { class: 'section-title', text: 'Graphics' }),
        field('Quality tier',
          quality.pinned ? 'Pinned by the ?quality= parameter in the address.' : 'Detected from the GPU, then re-tiered against measured frame time.',
          [el('select', {
            disabled: quality.pinned,
            onchange: (e) => { quality.set(e.target.value); rebuild(); },
          }, api.TIER_ORDER.map((t) => el('option', {
            value: t, selected: quality.name === t, text: t[0].toUpperCase() + t.slice(1),
          })))]),
        field('Time of day', 'Real solar geometry for 31.4805° N. The slider is local solar time.',
          [el('input', {
            type: 'range', min: '0', max: '23.9', step: '0.1', value: String(world.sky.hour),
            oninput: (e) => { api.setHour(Number(e.target.value)); },
          })]),
        field('Day of year', 'Moves the sun’s declination: the shadows on the forecourt change with the season.',
          [el('input', {
            type: 'range', min: '1', max: '365', step: '1', value: String(world.sky.dayOfYear),
            oninput: (e) => { world.sky.setDayOfYear(Number(e.target.value)); },
          })]),
        field('Cloud cover', 'Also changes how much light reaches the site.',
          [el('input', {
            type: 'range', min: '0', max: '0.95', step: '0.05', value: String(world.sky.cloudCover),
            oninput: (e) => { world.sky.setCloudCover(Number(e.target.value)); },
          })]),
        field('Mouse sensitivity', null,
          [el('input', {
            type: 'range', min: '0.0006', max: '0.005', step: '0.0002',
            value: String(api.controls.state.sensitivity),
            oninput: (e) => { api.controls.state.sensitivity = Number(e.target.value); },
          })]),
        field('Invert the vertical look', null,
          [el('select', {
            onchange: (e) => { api.controls.state.invertY = e.target.value === 'yes'; },
          }, [
            el('option', { value: 'no', selected: !api.controls.state.invertY, text: 'No' }),
            el('option', { value: 'yes', selected: api.controls.state.invertY, text: 'Yes' }),
          ])]),

        el('div', { class: 'section-title', text: 'Session' }),
        el('p', { class: 'field-help', text: 'A session records the day you are on, where you are standing, the time of day and which doors are open. Saved sessions live in this browser; the export is text you can carry to another machine.' }),
        ...session.slots().map((slot) => field(slot.label, slot.detail, [
          el('button', { class: 'chip', type: 'button', text: 'Save', onclick: () => { session.save(slot.id); rebuild(); } }),
          slot.used ? el('button', { class: 'chip', type: 'button', text: 'Load', onclick: () => { session.load(slot.id); rebuild(); } }) : null,
          slot.used ? el('button', { class: 'chip', type: 'button', text: 'Clear', onclick: () => { session.clear(slot.id); rebuild(); } }) : null,
        ])),
        field('Export', 'Copies the session to the clipboard as text.',
          [el('button', { class: 'chip', type: 'button', text: 'Copy session', onclick: () => session.exportToClipboard() })]),
        field('Import', 'Paste an exported session here.',
          [el('input', {
            type: 'text', placeholder: 'Paste and press Enter',
            onkeydown: (e) => { if (e.key === 'Enter') { session.importText(e.target.value); e.target.value = ''; } },
          })]),

        el('div', { class: 'section-title', text: 'What the X-ray shows' }),
        el('p', { class: 'field-help', text: 'Four systems carry a colour in the X-ray. The hues are a validated set: every pair is separated under simulated red-green colour blindness as well as normal vision. Everything else in this model is identified by name, because past about seven simultaneous colour classes no palette can keep them apart.' }),
        legend(XRAY_LEGEND.map((key) => ({ colour: LAYER[key].viz, label: LAYER[key].label }))),
      ]);
    },
  };
}
