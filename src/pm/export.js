/**
 * Schedule interchange — pure JS.
 *
 *  toMSPDI(project)  Microsoft Project XML (MSPDI) that MS Project and
 *                    ProjectLibre open: project summary, 12 summary tasks,
 *                    leaves and milestones with outline levels, PERT-derived
 *                    durations, typed predecessor links with lag, resources,
 *                    assignments, baseline 0 and progress.
 *  toCSV(project)    flat schedule table; fromCSV(text) parses it back.
 *
 * MSPDI conventions used: a 7-day working calendar (08:00–12:00, 13:00–17:00
 * = 8 h/day, construction sites work every day); durations as PT{h}H0M0S;
 * LinkLag in tenths of minutes (1 day = 4,800); link Type FF=0 FS=1 SF=2 SS=3;
 * currency values in hundredths of a rupee, as MSPDI stores them.
 */

export const MSPDI_LINK_TYPES = { FF: 0, FS: 1, SF: 2, SS: 3 };
const HOURS_PER_DAY = 8;
const TENTHS_PER_DAY = HOURS_PER_DAY * 60 * 10;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(startMs, day, hour) {
  const d = new Date(startMs + Math.floor(day) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:00:00`;
}

/** Start of work on day `es` (08:00) and end of work on the last day (17:00); milestones sit at the finish. */
function dates(startMs, es, ef, milestone) {
  if (milestone || ef <= es) {
    const at = Math.max(0, Math.round(ef));
    return { start: at > 0 ? stamp(startMs, at - 1, 17) : stamp(startMs, 0, 8), finish: at > 0 ? stamp(startMs, at - 1, 17) : stamp(startMs, 0, 8) };
  }
  return { start: stamp(startMs, Math.round(es), 8), finish: stamp(startMs, Math.round(ef) - 1, 17) };
}

function dur(days) {
  return `PT${Math.round(days * HOURS_PER_DAY)}H0M0S`;
}

function money(v) {
  return Math.round(v * 100);
}

/** Microsoft Project XML (MSPDI) for the project. */
export function toMSPDI(project) {
  const startMs = project.startDate.getTime();
  const nodes = project.baseline.nodes;
  const tasks = project.tasks;
  const lines = [];
  const out = (s) => lines.push(s);
  const finishDay = project.baselineDuration;

  out('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out('<Project xmlns="http://schemas.microsoft.com/project">');
  out('  <SaveVersion>14</SaveVersion>');
  out(`  <Name>${esc(project.info ? project.info.code : 'HDD-REP')}.xml</Name>`);
  out(`  <Title>${esc(project.info ? project.info.name : 'Hyderabad Airport Revival & Expansion Programme')}</Title>`);
  out('  <Subject>Simulated scenario data — SKY GATEWAY HYDERABAD</Subject>');
  out('  <Company>Simulated</Company>');
  out('  <Author>SKY GATEWAY HYDERABAD simulator</Author>');
  out(`  <CreationDate>${stamp(startMs, 0, 8)}</CreationDate>`);
  out('  <ScheduleFromStart>1</ScheduleFromStart>');
  out(`  <StartDate>${stamp(startMs, 0, 8)}</StartDate>`);
  out(`  <FinishDate>${stamp(startMs, Math.max(0, finishDay - 1), 17)}</FinishDate>`);
  out('  <FYStartDate>7</FYStartDate>');
  out('  <CriticalSlackLimit>0</CriticalSlackLimit>');
  out('  <CurrencyDigits>0</CurrencyDigits>');
  out('  <CurrencySymbol>Rs</CurrencySymbol>');
  out('  <CurrencyCode>PKR</CurrencyCode>');
  out('  <CurrencySymbolPosition>2</CurrencySymbolPosition>');
  out('  <CalendarUID>1</CalendarUID>');
  out('  <DefaultStartTime>08:00:00</DefaultStartTime>');
  out('  <DefaultFinishTime>17:00:00</DefaultFinishTime>');
  out(`  <MinutesPerDay>${HOURS_PER_DAY * 60}</MinutesPerDay>`);
  out(`  <MinutesPerWeek>${HOURS_PER_DAY * 60 * 7}</MinutesPerWeek>`);
  out('  <DaysPerMonth>30</DaysPerMonth>');
  out('  <DefaultTaskType>1</DefaultTaskType>');
  out('  <DurationFormat>7</DurationFormat>');
  out('  <WorkFormat>2</WorkFormat>');
  out('  <HonorConstraints>0</HonorConstraints>');
  out('  <EarnedValueMethod>0</EarnedValueMethod>');
  out(`  <StatusDate>${stamp(startMs, Math.max(0, project.day), 8)}</StatusDate>`);
  out('  <WeekStartDay>1</WeekStartDay>');
  // Calendar: every day a working day, 08–12 & 13–17.
  out('  <Calendars>');
  out('    <Calendar>');
  out('      <UID>1</UID>');
  out('      <Name>Site 7-day</Name>');
  out('      <IsBaseCalendar>1</IsBaseCalendar>');
  out('      <BaseCalendarUID>-1</BaseCalendarUID>');
  out('      <WeekDays>');
  for (let d = 1; d <= 7; d++) {
    out('        <WeekDay>');
    out(`          <DayType>${d}</DayType>`);
    out('          <DayWorking>1</DayWorking>');
    out('          <WorkingTimes>');
    out('            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>');
    out('            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>');
    out('          </WorkingTimes>');
    out('        </WeekDay>');
  }
  out('      </WeekDays>');
  out('    </Calendar>');
  out('  </Calendars>');

  // UIDs: 0 = project summary, summaries and leaves numbered in outline order.
  const uid = new Map();
  const outline = [];
  let next = 1;
  for (const s of project.summaries) {
    const kids = tasks.filter((t) => t.summaryId === s.id);
    uid.set(`S${s.id}`, next++);
    outline.push({ kind: 'summary', s, kids });
    kids.forEach((t) => { uid.set(t.id, next++); outline.push({ kind: 'task', t }); });
  }

  out('  <Tasks>');
  const pd = dates(startMs, 0, finishDay, false);
  out('    <Task>');
  out('      <UID>0</UID>');
  out('      <ID>0</ID>');
  out(`      <Name>${esc(project.info ? project.info.name : 'Project')}</Name>`);
  out('      <Type>1</Type>');
  out('      <IsNull>0</IsNull>');
  out('      <WBS>0</WBS>');
  out('      <OutlineNumber>0</OutlineNumber>');
  out('      <OutlineLevel>0</OutlineLevel>');
  out(`      <Start>${pd.start}</Start>`);
  out(`      <Finish>${pd.finish}</Finish>`);
  out(`      <Duration>${dur(finishDay)}</Duration>`);
  out('      <DurationFormat>7</DurationFormat>');
  out('      <Summary>1</Summary>');
  out(`      <Cost>${money(project.bac)}</Cost>`);
  out('    </Task>');

  let id = 1;
  let sIndex = 0;
  let kIndex = 0;
  for (const item of outline) {
    if (item.kind === 'summary') {
      sIndex++;
      kIndex = 0;
      const kids = item.kids;
      let es = Infinity;
      let ef = 0;
      let cost = 0;
      let ev = 0;
      for (const t of kids) {
        const n = nodes.get(t.id);
        es = Math.min(es, n.es);
        ef = Math.max(ef, n.ef);
        cost += t.budget;
        ev += project.state.get(t.id).pct * t.budget;
      }
      const d = dates(startMs, es, ef, false);
      out('    <Task>');
      out(`      <UID>${uid.get(`S${item.s.id}`)}</UID>`);
      out(`      <ID>${id++}</ID>`);
      out(`      <Name>${esc(item.s.name)}</Name>`);
      out('      <Type>1</Type>');
      out('      <IsNull>0</IsNull>');
      out(`      <WBS>${esc(item.s.id)}</WBS>`);
      out(`      <OutlineNumber>${sIndex}</OutlineNumber>`);
      out('      <OutlineLevel>1</OutlineLevel>');
      out(`      <Start>${d.start}</Start>`);
      out(`      <Finish>${d.finish}</Finish>`);
      out(`      <Duration>${dur(ef - es)}</Duration>`);
      out('      <DurationFormat>7</DurationFormat>');
      out('      <Milestone>0</Milestone>');
      out('      <Summary>1</Summary>');
      out(`      <PercentComplete>${cost > 0 ? Math.round((ev / cost) * 100) : 0}</PercentComplete>`);
      out(`      <Cost>${money(cost)}</Cost>`);
      out('    </Task>');
      continue;
    }
    const t = item.t;
    kIndex++;
    const n = nodes.get(t.id);
    const st = project.state.get(t.id);
    const d = dates(startMs, n.es, n.ef, t.milestone);
    const pct = Math.round(st.pct * 100);
    out('    <Task>');
    out(`      <UID>${uid.get(t.id)}</UID>`);
    out(`      <ID>${id++}</ID>`);
    out(`      <Name>${esc(t.name)}</Name>`);
    out('      <Type>0</Type>');
    out('      <IsNull>0</IsNull>');
    out(`      <WBS>${esc(t.code)}</WBS>`);
    out(`      <OutlineNumber>${sIndex}.${kIndex}</OutlineNumber>`);
    out('      <OutlineLevel>2</OutlineLevel>');
    out(`      <Start>${d.start}</Start>`);
    out(`      <Finish>${d.finish}</Finish>`);
    out(`      <Duration>${dur(t.duration)}</Duration>`);
    out('      <DurationFormat>7</DurationFormat>');
    out('      <Estimated>0</Estimated>');
    out(`      <Milestone>${t.milestone ? 1 : 0}</Milestone>`);
    out('      <Summary>0</Summary>');
    out(`      <Critical>${n.critical ? 1 : 0}</Critical>`);
    out(`      <EarlyStart>${d.start}</EarlyStart>`);
    out(`      <EarlyFinish>${d.finish}</EarlyFinish>`);
    const late = dates(startMs, n.ls, n.lf, t.milestone);
    out(`      <LateStart>${late.start}</LateStart>`);
    out(`      <LateFinish>${late.finish}</LateFinish>`);
    out(`      <FreeSlack>${Math.round(n.freeFloat * TENTHS_PER_DAY)}</FreeSlack>`);
    out(`      <TotalSlack>${Math.round(n.totalFloat * TENTHS_PER_DAY)}</TotalSlack>`);
    out(`      <FixedCost>${money(t.materialBudget || 0)}</FixedCost>`);
    out('      <FixedCostAccrual>3</FixedCostAccrual>');
    out(`      <PercentComplete>${pct}</PercentComplete>`);
    out(`      <Cost>${money(t.budget)}</Cost>`);
    if (st.actualStart !== null) out(`      <ActualStart>${stamp(startMs, st.actualStart, 8)}</ActualStart>`);
    if (st.pct >= 1 && st.actualFinish !== null) out(`      <ActualFinish>${stamp(startMs, Math.max(0, st.actualFinish - (t.milestone ? 0 : 1)), 17)}</ActualFinish>`);
    out(`      <ActualCost>${money(st.actualCost || 0)}</ActualCost>`);
    out(`      <RemainingDuration>${dur(st.pct >= 1 ? 0 : (st.remainingWork !== undefined ? st.remainingWork : t.duration))}</RemainingDuration>`);
    out('      <ConstraintType>0</ConstraintType>');
    out('      <CalendarUID>-1</CalendarUID>');
    if (t.dictionary && t.dictionary.description) out(`      <Notes>${esc(t.dictionary.description)}</Notes>`);
    out(`      <BCWS>${money(project.plannedValueOf ? project.plannedValueOf(t.id) : 0)}</BCWS>`);
    out(`      <BCWP>${money(st.pct * t.budget)}</BCWP>`);
    for (const link of t.predecessors) {
      if (!uid.has(link.id)) continue;
      out('      <PredecessorLink>');
      out(`        <PredecessorUID>${uid.get(link.id)}</PredecessorUID>`);
      out(`        <Type>${MSPDI_LINK_TYPES[link.type || 'FS']}</Type>`);
      out('        <CrossProject>0</CrossProject>');
      out(`        <LinkLag>${Math.round((link.lag || 0) * TENTHS_PER_DAY)}</LinkLag>`);
      out('        <LagFormat>7</LagFormat>');
      out('      </PredecessorLink>');
    }
    out('      <Baseline>');
    out('        <Number>0</Number>');
    out(`        <Start>${d.start}</Start>`);
    out(`        <Finish>${d.finish}</Finish>`);
    out(`        <Duration>${dur(t.duration)}</Duration>`);
    out('        <DurationFormat>7</DurationFormat>');
    out(`        <Cost>${money(t.budget)}</Cost>`);
    out('      </Baseline>');
    out('    </Task>');
  }
  out('  </Tasks>');

  out('  <Resources>');
  project.resources.forEach((r, i) => {
    out('    <Resource>');
    out(`      <UID>${i + 1}</UID>`);
    out(`      <ID>${i + 1}</ID>`);
    out(`      <Name>${esc(r.name)}</Name>`);
    out('      <Type>1</Type>');
    out('      <IsNull>0</IsNull>');
    out(`      <Initials>${esc(r.id.slice(0, 3).toUpperCase())}</Initials>`);
    out(`      <Group>${esc(r.kind === 'equipment' ? 'Equipment' : 'Labour')}</Group>`);
    out(`      <MaxUnits>${(r.capacity || r.peakDemand || 1).toFixed(2)}</MaxUnits>`);
    out(`      <StandardRate>${(r.dayRate / HOURS_PER_DAY).toFixed(2)}</StandardRate>`);
    out('      <StandardRateFormat>2</StandardRateFormat>');
    out(`      <OvertimeRate>${((r.dayRate / HOURS_PER_DAY) * 1.5).toFixed(2)}</OvertimeRate>`);
    out('      <OvertimeRateFormat>2</OvertimeRateFormat>');
    out('      <CostPerUse>0</CostPerUse>');
    out('      <CalendarUID>1</CalendarUID>');
    out('    </Resource>');
  });
  out('  </Resources>');

  out('  <Assignments>');
  const resUid = new Map(project.resources.map((r, i) => [r.id, i + 1]));
  let aid = 1;
  for (const t of tasks) {
    const n = nodes.get(t.id);
    const d = dates(startMs, n.es, n.ef, t.milestone);
    for (const [rid, count] of Object.entries(t.crew || {})) {
      if (!resUid.has(rid) || !count) continue;
      out('    <Assignment>');
      out(`      <UID>${aid++}</UID>`);
      out(`      <TaskUID>${uid.get(t.id)}</TaskUID>`);
      out(`      <ResourceUID>${resUid.get(rid)}</ResourceUID>`);
      out(`      <Finish>${d.finish}</Finish>`);
      out(`      <Start>${d.start}</Start>`);
      out(`      <Units>${Number(count).toFixed(2)}</Units>`);
      out(`      <Work>${dur(t.duration * count)}</Work>`);
      out('    </Assignment>');
    }
  }
  out('  </Assignments>');
  out('</Project>');
  return lines.join('\n') + '\n';
}

/* ------------------------------------------------------------------- CSV */

export const CSV_COLUMNS = ['ID', 'WBS', 'Name', 'Summary', 'Milestone', 'Duration', 'Optimistic', 'MostLikely', 'Pessimistic',
  'Predecessors', 'Budget', 'BaselineStart', 'BaselineFinish', 'TotalFloat', 'FreeFloat', 'Critical', 'PercentComplete', 'ActualCost'];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Predecessor list in MS Project notation: "3.1FS-30d;2.6SS+10d". */
export function formatLinks(links) {
  return links.map((l) => `${l.id}${l.type || 'FS'}${(l.lag || 0) >= 0 ? '+' : ''}${l.lag || 0}d`).join(';');
}

export function parseLinks(text) {
  if (!text || !text.trim()) return [];
  return text.split(';').map((part) => {
    const m = /^\s*([\w.]+?)(FS|SS|FF|SF)?([+-]\d+(?:\.\d+)?)?d?\s*$/.exec(part);
    if (!m) throw new Error(`fromCSV: cannot parse predecessor "${part}"`);
    return { id: m[1], type: m[2] || 'FS', lag: m[3] ? Number(m[3]) : 0 };
  });
}

export function toCSV(project) {
  const rows = [CSV_COLUMNS.join(',')];
  const nodes = project.baseline.nodes;
  for (const t of project.tasks) {
    const n = nodes.get(t.id);
    const st = project.state.get(t.id);
    const ds = project.dateLabel ? project.dateLabel(n.es) : n.es;
    const df = project.dateLabel ? project.dateLabel(n.ef) : n.ef;
    rows.push([
      t.id, t.code, t.name, t.summaryId, t.milestone ? 1 : 0, t.duration, t.o, t.m, t.p,
      formatLinks(t.predecessors), Math.round(t.budget), ds, df,
      +n.totalFloat.toFixed(1), +n.freeFloat.toFixed(1), n.critical ? 1 : 0,
      +(st.pct * 100).toFixed(1), Math.round(st.actualCost || 0),
    ].map(csvCell).join(','));
  }
  return rows.join('\n') + '\n';
}

/** RFC 4180 parser (quoted fields, embedded commas, doubled quotes, CRLF). */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim()));
}

/** Parse a schedule CSV (toCSV format, or any CSV with ID/Name/Duration/Predecessors columns). */
export function fromCSV(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name.toLowerCase());
  const iId = col('ID');
  const iName = col('Name');
  const iDur = col('Duration');
  const iPred = col('Predecessors');
  if (iId < 0 || iName < 0 || iDur < 0) throw new Error('fromCSV: ID, Name and Duration columns are required');
  const num = (r, name) => {
    const i = col(name);
    return i >= 0 && r[i] !== '' && r[i] !== undefined ? Number(r[i]) : undefined;
  };
  return rows.slice(1).map((r) => {
    const out = {
      id: r[iId].trim(), name: r[iName], duration: Number(r[iDur]),
      predecessors: iPred >= 0 ? parseLinks(r[iPred]) : [],
    };
    const o = num(r, 'Optimistic');
    if (o !== undefined) { out.o = o; out.m = num(r, 'MostLikely'); out.p = num(r, 'Pessimistic'); }
    const b = num(r, 'Budget');
    if (b !== undefined) out.budget = b;
    const ms = num(r, 'Milestone');
    if (ms !== undefined) out.milestone = ms === 1;
    const si = col('Summary');
    if (si >= 0) out.summaryId = r[si];
    return out;
  });
}
