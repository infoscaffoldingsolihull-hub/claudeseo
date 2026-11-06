import { el, button, tabs, pill, field } from '../dom.js';
import { section, card, dl, table } from '../charts.js';
import { store } from '../charts3.js';
import CASES from '../../data/cases.json' with { type: 'json' };

/**
 * Case Studies (Weeks 5 and 10): case cards from src/data/cases.json — an
 * original summary, sources, discussion questions and an "apply it to
 * Hyderabad" exercise. Cards flagged `editable` (or with an empty summary)
 * show an instructor-editable text area saved in this browser. No case facts
 * are invented here: everything shown comes from the data file or the
 * instructor.
 */

const KEY = 'hdd-cases-v1';

function list() {
  const raw = Array.isArray(CASES) ? CASES : Array.isArray(CASES && CASES.cases) ? CASES.cases : [];
  return raw.map((c, i) => ({
    id: c.id || `case${i + 1}`,
    title: c.title || `Case ${i + 1}`,
    week: c.week,
    clo: c.clo || [],
    editable: c.editable === true || !c.summary,
    summary: c.summary || '',
    prompt: c.prompt || 'Instructor: paste the case summary from the course pack.',
    note: c.researchNote || '',
    questions: c.questions || c.discussion || [],
    exercise: c.exercise || c.apply || '',
    sources: (c.sources || []).map((x) => (typeof x === 'string' ? { title: x } : x)),
  }));
}

function saved(id, field_) { const all = store.get(KEY, {}) || {}; return (all[id] && all[id][field_]) || ''; }
function save(id, field_, value) { const all = store.get(KEY, {}) || {}; all[id] = { ...(all[id] || {}), [field_]: value }; store.set(KEY, all); }

const LINKS = {
  'bc-transportation': [['Stakeholders', 'stakeholders', 'Rank the case’s stakeholders on the power/interest grid.'], ['Schedule & CPM', 'schedule', 'Compare the case’s timeline with a critical-path view.'], ['Risk Register', 'risk', 'Name the case’s main risks and responses.']],
  astrazeneca: [['Risk Register', 'risk', 'Identify the opportunity and financial-risk responses.'], ['Procurement', 'procurement', 'Relate the supply agreements to contract types.'], ['Monte Carlo Forecast', 'forecast', 'Parallel work and compressed schedules.']],
};

export const PANEL_CASES = {
  id: 'cases',
  render(dash, body, head) {
    const s = dash.state;
    const cases = list();
    head.appendChild(dash.simBadge('Hyderabad exercise is simulated'));
    body.appendChild(dash.tag());
    if (!s.sel || !cases.some((c) => c.id === s.sel)) s.sel = cases.length ? cases[0].id : null;
    body.appendChild(el('p', { class: 'lede', text: 'Two published project cases anchor the course. Read each summary, discuss the questions, then apply what you learned to a decision in the Hyderabad programme. Case summaries are original paraphrases; follow the links to the sources.' }));
    if (!cases.length) {
      body.appendChild(el('div', { class: 'pm-empty', text: 'No case data is loaded. Your instructor can add case cards to the course data file.' }));
      return;
    }
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(cases.map((c) => ({ id: c.id, label: c.title, badge: c.week ? `W${c.week}` : undefined })), s.sel, (id) => { s.sel = id; dash.rerender(); })]));
    const c = cases.find((x) => x.id === s.sel);
    body.appendChild(renderCase(dash, c));
    body.appendChild(card('Compare the case with the simulator', [
      el('p', { text: 'Each tool in the simulator gives a different lens on a case. Pick one and use it as you discuss.' }),
      el('div', { class: 'case-links' }, (LINKS[c.id] || [['Stakeholders', 'stakeholders', 'Map the case’s people.'], ['Risk Register', 'risk', 'Log the case’s risks.'], ['Cost & Earned Value', 'cost', 'Test the case’s numbers.']]).map(([label, panel, hint]) =>
        el('button', { type: 'button', class: 'case-link', onclick: () => dash.open(panel) }, [el('b', { text: `${label} →` }), el('small', { text: hint })]))),
    ], { cls: 'flat' }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Case content: original summary; the Hyderabad exercise uses simulated scenario data.' })]));
  },
};

function renderCase(dash, c) {
  const parts = [];
  parts.push(el('div', { class: 'row' }, [
    c.week ? pill(`Week ${c.week}`, 'gold') : null, ...c.clo.map((k) => pill(k, 'indigo')), c.editable ? pill('Instructor-editable', 'info', 'Text saved in this browser only') : null,
  ]));
  // summary
  const savedSummary = saved(c.id, 'summary');
  const text = c.editable ? (savedSummary || c.summary) : c.summary;
  if (c.editable) {
    const area = el('textarea', { rows: 9, class: 'case-edit', 'aria-label': `${c.title} summary (editable)`, placeholder: c.prompt, spellcheck: 'true' });
    area.value = text;
    const status = el('span', { class: 'muted small', text: savedSummary ? 'Edited text saved in this browser.' : c.summary ? 'Showing the supplied summary; edit to replace it.' : 'Nothing saved yet.' });
    area.addEventListener('input', () => { save(c.id, 'summary', area.value); status.textContent = 'Saved in this browser.'; });
    parts.push(card('Case summary', [
      c.note ? el('div', { class: 'callout warn' }, [el('div', {}, [el('b', { text: 'Instructor note. ' }), c.note])]) : null,
      c.summary ? el('p', { class: 'pm-note', text: c.prompt }) : null,
      area,
      el('div', { class: 'row' }, [status, button('Reset to supplied text', () => { save(c.id, 'summary', ''); dash.rerender(); }, { small: true, kind: 'ghost', disabled: !savedSummary })]),
    ]));
  } else {
    parts.push(card('Case summary', [el('p', { class: 'case-summary', text })]));
  }
  // sources
  parts.push(card('Sources', [
    c.sources.length
      ? el('ul', { class: 'src-list' }, c.sources.map((x) => el('li', {}, [
        x.url ? el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', text: x.title || x.url }) : el('span', { text: x.title }),
        x.retrieved ? el('small', { class: 'muted', text: ` retrieved ${x.retrieved}` }) : null,
        x.note ? el('small', { class: 'muted', text: ` — ${x.note}` }) : null,
      ])))
      : el('p', { class: 'pm-note', text: 'No sources are listed. The instructor can name the course-pack reading here.' }),
  ], { cls: 'flat' }));
  // questions
  parts.push(section('Discussion questions'));
  parts.push(el('ol', { class: 'case-q' }, c.questions.map((q, i) => el('li', {}, [el('span', { text: q }), noteBox(c.id, `q${i}`, 'Your notes…')]))));
  if (!c.questions.length) parts.push(el('p', { class: 'pm-note', text: 'No questions supplied yet.' }));
  // exercise
  parts.push(card('Apply it to Hyderabad', [
    el('p', { text: c.exercise || 'Instructor: add an exercise connecting the case to the Hyderabad programme.' }),
    noteBox(c.id, 'exercise', 'Write your recommendation here (saved in this browser)…', 5),
  ], { cls: 'accent' }));
  return el('div', { class: 'case-body' }, parts);
}

function noteBox(id, key, placeholder, rows = 2) {
  const area = el('textarea', { rows, class: 'case-note', placeholder, 'aria-label': placeholder });
  area.value = saved(id, key);
  area.addEventListener('input', () => save(id, key, area.value));
  return area;
}

void field; void dl; void table;
