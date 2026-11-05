import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMSPDI, toCSV, fromCSV, MSPDI_LINK_TYPES } from '../../src/pm/export.js';
import { computeCPM } from '../../src/pm/cpm.js';
import { Project } from '../../src/pm/project.js';

/** Minimal well-formedness check: every open tag closes in order. */
function wellFormed(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w.-]*)[^>]*?(\/?)>/g;
  let m;
  const body = xml.replace(/<\?xml[^>]*\?>/, '');
  while ((m = re.exec(body)) !== null) {
    if (m[3] === '/') continue;
    if (m[1] === '/') { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

const p = new Project({ seed: 11 });
for (let i = 0; i < 300; i++) p.step();

test('MSPDI: valid MS Project XML with tasks, links, resources, assignments and baseline', () => {
  const xml = toMSPDI(p);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"'));
  assert.ok(xml.includes('<Project xmlns="http://schemas.microsoft.com/project">'));
  assert.ok(wellFormed(xml));
  const tasks = xml.match(/<Task>/g).length;
  assert.equal(tasks, 1 + p.summaries.length + p.tasks.length);
  assert.deepEqual(MSPDI_LINK_TYPES, { FF: 0, FS: 1, SF: 2, SS: 3 });
  // Link types and lags (tenths of minutes; 8-hour day = 4,800).
  assert.ok(/<Type>3<\/Type>\s*<CrossProject>0<\/CrossProject>\s*<LinkLag>288000<\/LinkLag>/.test(xml), 'SS +60d');
  assert.ok(/<Type>0<\/Type>\s*<CrossProject>0<\/CrossProject>\s*<LinkLag>96000<\/LinkLag>/.test(xml), 'FF +20d');
  assert.ok(/<Type>2<\/Type>\s*<CrossProject>0<\/CrossProject>\s*<LinkLag>0<\/LinkLag>/.test(xml), 'SF');
  assert.ok(/<Type>1<\/Type>\s*<CrossProject>0<\/CrossProject>\s*<LinkLag>-144000<\/LinkLag>/.test(xml), 'FS lead −30d');
  const earthworks = xml.split('<Task>').find((s) => s.includes('<WBS>3.2</WBS>'));
  assert.ok(earthworks.includes(`<Duration>PT${p.taskById.get('3.2').duration * 8}H0M0S</Duration>`));
  assert.ok(earthworks.includes('<OutlineLevel>2</OutlineLevel>'));
  assert.ok(earthworks.includes('<Baseline>') && earthworks.includes('<Number>0</Number>'));
  assert.ok(xml.includes('<Milestone>1</Milestone>'));
  assert.equal(xml.match(/<Resource>/g).length, p.resources.length);
  assert.ok(xml.match(/<Assignment>/g).length > 100);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'all ampersands escaped');
});

test('CSV export → fromCSV import round-trip reproduces the network and its CPM', () => {
  const csv = toCSV(p);
  const rows = fromCSV(csv);
  assert.equal(rows.length, p.tasks.length);
  for (const t of p.tasks) {
    const r = rows.find((x) => x.id === t.id);
    assert.equal(r.name, t.name);
    assert.equal(r.duration, t.duration);
    assert.deepEqual(r.predecessors, t.predecessors.map((l) => ({ id: l.id, type: l.type || 'FS', lag: l.lag || 0 })));
    assert.equal(r.milestone, !!t.milestone);
  }
  assert.equal(computeCPM(rows).duration, p.baseline.duration);
});

test('fromCSV handles quoting, embedded commas and CRLF', () => {
  const text = 'ID,Name,Duration,Predecessors\r\nA,"Survey, ""phase 1""",5,\r\nB,Build,3,AFS+2d;ASS-1d\r\n';
  const rows = fromCSV(text);
  assert.equal(rows[0].name, 'Survey, "phase 1"');
  assert.deepEqual(rows[1].predecessors, [{ id: 'A', type: 'FS', lag: 2 }, { id: 'A', type: 'SS', lag: -1 }]);
  assert.throws(() => fromCSV('Foo,Bar\n1,2\n'));
});
