import { el, kpi, button, tabs, pill, fmtPct, openModal } from '../dom.js';
import { section, card, dl, table, hookCard } from '../charts.js';
import { toMSPDI, toCSV, fromCSV, formatLinks } from '../../pm/export.js';
import { computeCPM } from '../../pm/cpm.js';

/**
 * MS Project & Exports (Week 13): export the live plan as MSPDI XML and CSV,
 * import a CSV and compare it with the live plan (preview only), and a
 * step-by-step tutorial mapping every MS Project concept to its equivalent in
 * this simulator.
 */

const TABS = [
  { id: 'export', label: 'Export', icon: 'export' },
  { id: 'import', label: 'Import & compare', icon: 'table' },
  { id: 'tutorial', label: 'Tutorial', icon: 'book' },
];

const STEPS = [
  { title: 'Tasks and WBS', ms: 'Enter tasks, indent them under summary tasks to create the work breakdown structure. Milestones are zero-duration tasks.', game: 'Scope & WBS lists 12 summary packages and every leaf work package with its WBS dictionary entry. Milestones carry a diamond in the Gantt.', panel: 'scope', label: 'Scope & WBS' },
  { title: 'Durations and predecessors', ms: 'Type a duration, then add predecessors in the Predecessors column (e.g. 3.1FS, 2.6SS+10d). Link types FS, SS, FF, SF and lag are supported.', game: 'Every task has PERT estimates (O, M, P) and typed predecessors with lag. The CSV export writes them in MS Project notation, so the file round-trips.', panel: 'schedule', label: 'Schedule & CPM' },
  { title: 'Resources', ms: 'Open the Resource Sheet, define work and equipment resources with standard rates, then assign them to tasks.', game: 'Team & Resources holds twelve resource pools with day rates, a crew on every task and a resource histogram.', panel: 'team', label: 'Team & Resources' },
  { title: 'Set the baseline', ms: 'Project → Set Baseline saves start, finish, work and cost for later variance analysis.', game: 'The baseline is frozen when planning completes and re-baselined through approved change requests (Integrated Change Control).', panel: 'control', label: 'Change Control' },
  { title: 'Tracking Gantt', ms: 'Enter % complete and actuals, then view the Tracking Gantt: baseline bars sit under actual progress.', game: 'The Gantt chart draws baseline versus forecast bars and a today line; progress is updated automatically each simulated day.', panel: 'schedule', label: 'Schedule & CPM' },
  { title: 'Critical path', ms: 'Format → Critical Tasks highlights the path with zero total slack. Check total and free float columns.', game: 'The network diagram and Gantt highlight critical tasks in red and list total and free float for every task.', panel: 'schedule', label: 'Schedule & CPM' },
  { title: 'Resource levelling', ms: 'Resource → Level All resolves over-allocation by delaying tasks within slack.', game: '“Smooth resources” in Team & Resources shifts non-critical work within free float to flatten the histogram.', panel: 'team', label: 'Team & Resources' },
  { title: 'Earned value and reports', ms: 'Project → Reports → Costs → Earned Value; Dashboards show cost overview and progress.', game: 'Cost & Earned Value shows PV, EV, AC, CPI, SPI and EAC; Present & Report builds a printable project report.', panel: 'cost', label: 'Cost & Earned Value' },
  { title: 'Round trip', ms: 'File → Open an XML (MSPDI) file, or import CSV with the import wizard. Export maps fields to columns.', game: 'Export the MSPDI XML here, open it in MS Project (or any tool that reads MSPDI), edit it, then bring the CSV back on the “Import & compare” tab to see exactly what changed.', panel: null, label: null },
];

function readNum(n, d = 0) { return Number.isFinite(n) ? n : d; }

/* Compare an imported schedule (fromCSV rows) with the live plan. */
function compare(p, rows) {
  const live = new Map(p.tasks.map((t) => [t.id, t]));
  const seen = new Set();
  const changes = [];
  const added = [];
  const problems = [];
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`Duplicate ID ${r.id}`);
    seen.add(r.id);
    if (!Number.isFinite(r.duration) || r.duration < 0) problems.push(`${r.id}: invalid duration`);
    const t = live.get(r.id);
    if (!t) { added.push(r); continue; }
    if (r.name !== t.name) changes.push({ id: r.id, field: 'Name', from: t.name, to: r.name });
    if (Math.abs(readNum(r.duration) - t.duration) > 0.01) changes.push({ id: r.id, field: 'Duration', from: `${t.duration} d`, to: `${r.duration} d` });
    const a = formatLinks(t.predecessors);
    const b = formatLinks(r.predecessors || []);
    if (a !== b) changes.push({ id: r.id, field: 'Predecessors', from: a || '—', to: b || '—' });
    if (r.budget !== undefined && Math.abs(r.budget - Math.round(t.budget)) > 1) changes.push({ id: r.id, field: 'Budget', from: String(Math.round(t.budget)), to: String(r.budget) });
  }
  const removed = p.tasks.filter((t) => !seen.has(t.id));
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) for (const l of r.predecessors || []) if (!ids.has(l.id)) problems.push(`${r.id}: predecessor ${l.id} does not exist`);
  let cpm = null;
  if (!problems.length && rows.length) {
    try {
      const res = computeCPM(rows.map((r) => ({ id: r.id, duration: readNum(r.duration), predecessors: (r.predecessors || []).map((l) => ({ id: l.id, type: l.type || 'FS', lag: l.lag || 0 })) })));
      cpm = { duration: res.duration, critical: res.criticalPath };
    } catch (err) { problems.push(`Network error: ${err.message}`); }
  }
  return { changes, added, removed, problems, cpm };
}

export const PANEL_MSPROJECT = {
  id: 'msproject',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'export';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const snap = p.snapshot();
    body.appendChild(el('p', { class: 'lede', text: 'The live schedule exports as MS Project XML (MSPDI) and CSV, so the same plan can be continued in a desktop scheduling tool. Bring a CSV back to compare it with the plan, and use the tutorial to map each MS Project concept to its home in this simulator.' }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Work packages', value: String(p.tasks.length), foot: `${p.tasks.filter((t) => t.milestone).length} milestones` }),
      kpi({ label: 'Baseline duration', value: `${p.baselineDuration} d`, foot: `${(p.baselineDuration / 7).toFixed(0)} weeks` }),
      kpi({ label: 'Forecast finish', value: p.dateLabel(Math.round(snap.forecastFinish)).slice(4), foot: `${snap.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(snap.scheduleVarianceDays)} d vs baseline`, cls: snap.scheduleVarianceDays > 10 ? 'warn' : '' }),
      kpi({ label: 'Complete', value: fmtPct(snap.progress, 1), foot: p.dateLabel() }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); }), el('span', { class: 'grow' }), button('Start tutorial overlay', () => openTutorial(dash, 0), { icon: 'book', kind: 'primary', small: true })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ export: exportTab, import: importTab, tutorial: tutorialTab })[s.tab](dash, pane, p, s);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 5', title: 'British Columbia Transportation — one schedule across many parties',
      text: 'Programmes of this size exchange schedules between owner, consultant and contractors in files like these. What goes wrong when each party keeps a different copy?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · dates start Mon 4 Jan 2027` })]));
  },
};

/* ----------------------------------------------------------------- export */

function exportTab(dash, pane, p, s) {
  const csv = toCSV(p);
  const xml = toMSPDI(p);
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('MS Project XML (MSPDI)', [
      el('p', { text: 'The Microsoft Project Data Interchange format. Opens in MS Project and other tools that read MSPDI, with tasks, WBS codes, predecessors with lag, calendar, resources, assignments, baseline and actual progress.' }),
      el('div', { class: 'row' }, [button('Download .xml', () => dash.sim.download(`HDD_schedule_day${p.day}.xml`, 'application/xml', xml), { kind: 'primary', icon: 'export' }), pill(`${Math.round(xml.length / 1024)} KB`, 'muted')]),
    ], { cls: 'accent' }),
    card('CSV (spreadsheet round-trip)', [
      el('p', { text: 'One row per task with ID, WBS, name, duration, PERT estimates, predecessors in MS Project notation, budget, baseline dates, float, critical flag, % complete and actual cost.' }),
      el('div', { class: 'row' }, [button('Download .csv', () => dash.sim.download(`HDD_schedule_day${p.day}.csv`, 'text/csv', csv), { kind: 'primary', icon: 'export' }), pill(`${csv.split('\n').length - 2} rows`, 'muted')]),
    ], { cls: 'accent' }),
  ]));
  pane.appendChild(section('Preview', 'first lines of each file'));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('CSV', [el('pre', { class: 'file-prev', tabindex: '0', text: csv.split('\n').slice(0, 9).join('\n') })], { cls: 'flat' }),
    card('MSPDI XML', [el('pre', { class: 'file-prev', tabindex: '0', text: xml.split('\n').slice(0, 24).join('\n') })], { cls: 'flat' }),
  ]));
  pane.appendChild(card('How to open the file in MS Project', [
    el('ol', {}, [
      'File → Open → choose the downloaded .xml (set the file type to “XML Format”).',
      'Check Gantt Chart view: the baseline dates match the baseline columns of the CSV.',
      'Open Resource Sheet to see the twelve resource pools and their rates.',
      'Use Project → Set Baseline on your own copy before you experiment with changes.',
    ].map((t) => el('li', { text: t }))),
  ], { cls: 'flat' }));
}

/* ----------------------------------------------------------------- import */

function importTab(dash, pane, p, s) {
  if (s.text === undefined) s.text = '';
  const area = el('textarea', { rows: 6, class: 'paste-box', placeholder: 'Paste CSV here (ID, Name, Duration, Predecessors columns are required) or choose a file…', 'aria-label': 'CSV text to import', spellcheck: 'false' });
  area.value = s.text;
  area.addEventListener('input', () => { s.text = area.value; });
  const file = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', 'aria-label': 'Choose a CSV file' });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { s.text = String(rd.result || ''); s.fileName = f.name; analyse(dash, p, s); dash.rerender(); };
    rd.readAsText(f);
  });
  pane.appendChild(card('Import a schedule CSV', [
    el('p', { class: 'pm-note', text: 'Importing is a preview: the parsed plan is compared with the live plan and nothing in the simulation changes. This is how a planner checks a contractor’s updated schedule before accepting it through change control.' }),
    el('div', { class: 'row' }, [file, button('Load the live plan as sample', () => { s.text = toCSV(p); s.fileName = 'live plan'; analyse(dash, p, s); dash.rerender(); }, { small: true, kind: 'ghost' }),
      button('Load a modified sample', () => { s.text = modifiedSample(p); s.fileName = 'modified sample'; analyse(dash, p, s); dash.rerender(); }, { small: true, kind: 'ghost', title: 'Changes three durations and removes a link so you can see the diff' })]),
    area,
    el('div', { class: 'row' }, [button('Parse and compare', () => { analyse(dash, p, s); dash.rerender(); }, { kind: 'primary', icon: 'table' }), button('Clear', () => { s.text = ''; s.result = null; s.error = null; dash.rerender(); }, { kind: 'ghost', small: true })]),
  ]));
  if (s.error) pane.appendChild(el('div', { class: 'callout bad' }, [el('b', { text: 'Could not parse the CSV' }), el('p', { text: s.error })]));
  const r = s.result;
  if (!r) return;
  const cmp = r.cmp;
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Rows parsed', value: String(r.rows.length), foot: s.fileName || 'pasted text' }),
    kpi({ label: 'Changed fields', value: String(cmp.changes.length), cls: cmp.changes.length ? 'warn' : 'good' }),
    kpi({ label: 'Added · removed', value: `${cmp.added.length} · ${cmp.removed.length}` }),
    kpi({ label: 'Imported finish', value: cmp.cpm ? `${cmp.cpm.duration} d` : '—', foot: cmp.cpm ? `${cmp.cpm.duration - p.baselineDuration >= 0 ? '+' : ''}${cmp.cpm.duration - p.baselineDuration} d vs baseline` : 'network not valid', cls: cmp.cpm && cmp.cpm.duration > p.baselineDuration ? 'warn' : '' }),
  ]));
  if (cmp.problems.length) pane.appendChild(el('div', { class: 'callout warn' }, [el('div', {}, [el('b', { text: `${cmp.problems.length} validation issue${cmp.problems.length === 1 ? '' : 's'}` }), el('ul', {}, cmp.problems.slice(0, 8).map((x) => el('li', { text: x })))])]));
  else pane.appendChild(el('div', { class: 'callout good' }, [el('div', {}, [el('b', { text: 'The imported network is valid. ' }), cmp.cpm ? `Recomputed critical path: ${cmp.cpm.critical.slice(0, 10).join(' → ')}${cmp.cpm.critical.length > 10 ? ' …' : ''}.` : ''])]));
  pane.appendChild(section('Parsed tasks', 'first 12 rows'));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'duration', label: 'Duration', num: true },
    { key: 'pred', label: 'Predecessors', format: (_, row) => formatLinks(row.predecessors || []) || '—' },
  ], r.rows.slice(0, 12), { dense: true }));
  pane.appendChild(section('Differences from the live plan'));
  pane.appendChild(table([{ key: 'id', label: 'ID' }, { key: 'field', label: 'Field' }, { key: 'from', label: 'Live plan' }, { key: 'to', label: 'Imported', cls: 'pm-warn' }], cmp.changes, { dense: true, maxRows: 40, empty: 'No differences: the imported plan matches the live plan.' }));
  if (cmp.added.length) pane.appendChild(el('p', { class: 'pm-note', text: `New in the import: ${cmp.added.slice(0, 8).map((x) => `${x.id} ${x.name}`).join('; ')}${cmp.added.length > 8 ? '…' : ''}` }));
  if (cmp.removed.length) pane.appendChild(el('p', { class: 'pm-note', text: `Missing from the import: ${cmp.removed.slice(0, 8).map((x) => `${x.id} ${x.name}`).join('; ')}${cmp.removed.length > 8 ? '…' : ''}` }));
  pane.appendChild(el('div', { class: 'row' }, [
    button('Raise a change request for these differences', () => {
      const ch = p.raiseChange({ title: 'Schedule update from imported plan', description: `Imported schedule shows ${cmp.changes.length} field change(s), ${cmp.added.length} added and ${cmp.removed.length} missing tasks versus the baseline. Review through integrated change control.`, raisedBy: 'PMO Lead', impact: { days: cmp.cpm ? Math.max(0, cmp.cpm.duration - p.baselineDuration) : 0 }, merit: 0.5 });
      dash.sim.toast(`${ch.id} raised — decide it in Change Control`, 'good');
    }, { small: true, icon: 'shuffle', disabled: !cmp.changes.length && !cmp.added.length && !cmp.removed.length }),
  ]));
}

function analyse(dash, p, s) {
  s.error = null;
  s.result = null;
  if (!s.text || !s.text.trim()) { s.error = 'Nothing to parse: paste CSV text or choose a file first.'; return; }
  try {
    const rows = fromCSV(s.text);
    if (!rows.length) { s.error = 'The CSV has a header but no task rows.'; return; }
    s.result = { rows, cmp: compare(p, rows) };
  } catch (err) {
    s.error = err && err.message ? err.message : String(err);
  }
}

function modifiedSample(p) {
  const rows = toCSV(p).split('\n');
  // lengthen three tasks by 10 days to demonstrate the diff and the effect on the finish date
  let n = 0;
  return rows.map((line, i) => {
    if (i === 0 || !line) return line;
    const cells = line.split(',');
    if (n < 3 && /^\d+\.\d+$/.test(cells[0]) && Number(cells[5]) > 20 && !line.includes('"')) { cells[5] = String(Number(cells[5]) + 10); n++; }
    return cells.join(',');
  }).join('\n');
}

/* --------------------------------------------------------------- tutorial */

function tutorialTab(dash, pane, p, s) {
  pane.appendChild(el('p', { class: 'pm-note', text: 'Nine steps from a blank MS Project file to a tracked, levelled plan — each mapped to the place in this simulator where you can practise the same idea.' }));
  pane.appendChild(el('div', { class: 'tut-list' }, STEPS.map((st, i) => el('div', { class: 'tut-card' }, [
    el('div', { class: 'tut-num', text: String(i + 1) }),
    el('div', {}, [
      el('h4', { text: st.title }),
      el('div', { class: 'tut-pair' }, [
        el('div', {}, [el('small', { text: 'In MS Project' }), el('p', { text: st.ms })]),
        el('div', {}, [el('small', { text: 'In SKY GATEWAY' }), el('p', { text: st.game })]),
      ]),
      st.panel ? button(`Open ${st.label}`, () => dash.open(st.panel), { small: true, kind: 'ghost', icon: 'map' }) : button('Go to Export', () => { dash.state.tab = 'export'; dash.rerender(); }, { small: true, kind: 'ghost' }),
    ]),
  ]))));
  pane.appendChild(el('div', { class: 'row' }, [button('Walk me through it (overlay)', () => openTutorial(dash, 0), { kind: 'primary', icon: 'book' })]));
}

function openTutorial(dash, start) {
  let i = start;
  const content = el('div', { class: 'tut-modal' });
  const draw = () => {
    const st = STEPS[i];
    content.replaceChildren(
      el('div', { class: 'tut-prog', 'aria-hidden': 'true' }, STEPS.map((_, k) => el('i', { class: k <= i ? 'on' : '' }))),
      el('small', { class: 'muted', text: `Step ${i + 1} of ${STEPS.length}` }),
      el('h3', { text: st.title }),
      el('div', { class: 'tut-pair' }, [
        el('div', { class: 'tut-side ms' }, [el('small', { text: 'In MS Project' }), el('p', { text: st.ms })]),
        el('div', { class: 'tut-side game' }, [el('small', { text: 'In SKY GATEWAY HYDERABAD' }), el('p', { text: st.game })]),
      ]),
      st.panel ? el('div', { class: 'row' }, [button(`Open ${st.label}`, () => { m.close(); dash.open(st.panel); }, { kind: 'primary', icon: 'map' })]) : null,
    );
  };
  const m = openModal({
    title: 'MS Project tutorial', wide: true, body: [content], icon: 'book',
    actions: [
      { label: 'Back', kind: 'ghost', keep: true, onClick: () => { i = Math.max(0, i - 1); draw(); } },
      { label: 'Next', kind: 'primary', keep: true, onClick: () => { if (i < STEPS.length - 1) { i += 1; draw(); } else m.close(); } },
      { label: 'Close', kind: 'ghost' },
    ],
  });
  draw();
  m.card.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { i = Math.min(STEPS.length - 1, i + 1); draw(); }
    if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); draw(); }
  });
}
