import { el, kpi, button, tabs, pill, bar, fmtPct } from '../dom.js';
import { section, card, table } from '../charts.js';
import { renderMarkdown, store, csvCell } from '../charts3.js';
import QUIZ from '../../data/quiz.json' with { type: 'json' };
import COURSE from '../../data/course.json' with { type: 'json' };

/**
 * Assessment & Quiz (weeks 1-15): a quiz per week from the question bank,
 * mid-term practice (weeks 1-7), a final review, CLO- and domain-wise
 * results, per-question explanations with a MEHRAN tutor, numeric answers
 * with tolerance, JSON/CSV export and persisted attempts.
 *
 * Bus: 'quiz:answered' { week, questionId, correct } for every answer and
 * 'quiz:completed' { setId, score, total, byClo } when a set is finished.
 */

const QUESTIONS = QUIZ.questions || [];
const KEY = 'hdd-quiz-attempts-v1';
const CLOS = ['CLO1', 'CLO2', 'CLO3'];
const TABS = [
  { id: 'take', label: 'Take a quiz', icon: 'quiz' },
  { id: 'results', label: 'Results by CLO', icon: 'stats' },
  { id: 'history', label: 'History & export', icon: 'table' },
];
const MID_COUNT = 30;
const FINAL_COUNT = 40;

const weekTopic = (w) => {
  const e = (COURSE.weeks || []).find((x) => x.week === w);
  return e ? e.topic.split(':')[0] : '';
};

/* ----------------------------------------------------------- persistence */

function attempts() { const a = store.get(KEY, []); return Array.isArray(a) ? a : []; }
function saveAttempt(a) { const all = attempts(); all.push(a); store.set(KEY, all.slice(-200)); }

/* ---------------------------------------------------------------- helpers */

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function setDefs() {
  const defs = [];
  for (let w = 1; w <= 15; w++) {
    const qs = QUESTIONS.filter((q) => q.week === w);
    defs.push({ id: `W${String(w).padStart(2, '0')}`, label: `Week ${w}`, sub: weekTopic(w), pick: () => qs.slice(), total: qs.length, kind: 'week', week: w });
  }
  defs.push({ id: 'MID', label: 'Mid-term practice', sub: `Weeks 1–7 · ${MID_COUNT} random questions`, pick: () => shuffle(QUESTIONS.filter((q) => q.week <= 7)).slice(0, MID_COUNT), total: MID_COUNT, kind: 'mid' });
  defs.push({ id: 'FINAL', label: 'Final review', sub: `All weeks · ${FINAL_COUNT} random questions`, pick: () => shuffle(QUESTIONS).slice(0, FINAL_COUNT), total: FINAL_COUNT, kind: 'final' });
  return defs;
}

function bestOf(setId) {
  let best = null;
  for (const a of attempts()) if (a.setId === setId && (!best || a.score / a.total > best.score / best.total)) best = a;
  return best;
}

function isCorrect(q, value) {
  if (q.type === 'numeric') {
    const x = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(x)) return false;
    const tol = Math.max((q.tolerance || 0) * Math.abs(q.answer), q.tolerance ? 0 : 0.0051);
    return Math.abs(x - q.answer) <= tol + 1e-9;
  }
  return Number(value) === q.answer;
}

const fmtAnswer = (q) => (q.type === 'numeric' ? `${q.answer}${q.unit ? ` ${q.unit}` : ''}` : q.options[q.answer]);

function tally(list) {
  const byClo = { CLO1: [0, 0], CLO2: [0, 0], CLO3: [0, 0] };
  const byDomain = {};
  let score = 0;
  for (const r of list) {
    const q = QUESTIONS.find((x) => x.id === r.id);
    if (!q) continue;
    byClo[q.clo][1] += 1;
    byDomain[q.domain] = byDomain[q.domain] || [0, 0];
    byDomain[q.domain][1] += 1;
    if (r.correct) { score += 1; byClo[q.clo][0] += 1; byDomain[q.domain][0] += 1; }
  }
  return { score, byClo, byDomain };
}

/* Latest answer per question across all attempts (for cumulative mastery). */
function latestByQuestion() {
  const map = new Map();
  for (const a of attempts()) for (const r of a.answers || []) map.set(r.id, r.correct);
  return map;
}

/* ------------------------------------------------------------------ panel */

export const PANEL_ASSESS = {
  id: 'assess',
  count: () => QUESTIONS.length,
  render(dash, body, head) {
    const s = dash.state;
    if (!s.tab) s.tab = 'take';
    head.appendChild(dash.simBadge('Scenario numbers are simulated'));
    body.appendChild(dash.tag());
    const all = attempts();
    const latest = latestByQuestion();
    const done = latest.size;
    const right = [...latest.values()].filter(Boolean).length;
    body.appendChild(el('p', { class: 'lede', text: `${QUESTIONS.length} questions across 15 weeks test the three course outcomes. Answer a weekly quiz, practise for the mid-term, or take the final review. Wrong answers come with an explanation and a MEHRAN tutor note.` }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Question bank', value: String(QUESTIONS.length), foot: `${QUESTIONS.filter((q) => q.type === 'numeric').length} numeric · ${QUESTIONS.filter((q) => q.type === 'mcq').length} MCQ · ${QUESTIONS.filter((q) => q.type === 'tf').length} T/F` }),
      kpi({ label: 'Attempts', value: String(all.length), foot: 'saved in this browser' }),
      kpi({ label: 'Questions seen', value: `${done} / ${QUESTIONS.length}`, foot: `${fmtPct(done / QUESTIONS.length, 0)} of the bank` }),
      kpi({ label: 'Mastery', value: done ? fmtPct(right / done, 0) : '—', foot: 'latest answer per question', cls: done && right / done >= 0.8 ? 'good' : done && right / done < 0.5 ? 'warn' : '' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { if (s.run && s.tab === 'take' && id !== 'take' && !s.run.finished) { /* keep the run alive */ } s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ take, results, history })[s.tab](dash, pane, s);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'Original questions aligned to PMBOK® Guide 8th Edition topics; scenario numbers are simulated.' })]));
  },
  /** Pause live re-rendering while a question is on screen. */
  autoRefresh: false,
};

/* ------------------------------------------------------------------- take */

function take(dash, pane, s) {
  if (s.run) { runView(dash, pane, s); return; }
  const defs = setDefs();
  const week = defs.filter((d) => d.kind === 'week');
  pane.appendChild(section('Practice sets'));
  pane.appendChild(el('div', { class: 'set-grid big' }, defs.filter((d) => d.kind !== 'week').map((d) => setCard(dash, s, d))));
  pane.appendChild(section('Weekly quizzes', 'one per course week'));
  pane.appendChild(el('div', { class: 'set-grid' }, week.map((d) => setCard(dash, s, d))));
}

function setCard(dash, s, d) {
  const best = bestOf(d.id);
  const pct = best ? best.score / best.total : 0;
  return el('button', { type: 'button', class: `set-card ${best ? 'done' : ''}`, onclick: () => start(dash, s, d), 'aria-label': `${d.label}: ${d.sub}` }, [
    el('div', { class: 'set-top' }, [el('b', { text: d.label }), el('span', { class: 'muted small', text: `${d.total} Q` })]),
    el('small', { text: d.sub }),
    best ? el('div', { class: 'set-best' }, [bar(pct, pct >= 0.8 ? 'good' : pct < 0.5 ? 'bad' : ''), el('span', { text: `Best ${best.score}/${best.total}` })]) : el('span', { class: 'muted small', text: 'Not attempted' }),
  ]);
}

function start(dash, s, d) {
  const qs = d.pick();
  s.run = { def: { id: d.id, label: d.label }, qs, idx: 0, answers: [], chosen: null, submitted: false, tutor: null, finished: false, startedAt: Date.now() };
  dash.rerender();
}

function runView(dash, pane, s) {
  const run = s.run;
  if (run.finished) { resultView(dash, pane, s); return; }
  const q = run.qs[run.idx];
  const n = run.qs.length;
  const sim = dash.sim;
  pane.appendChild(el('div', { class: 'quiz-head' }, [
    el('div', {}, [el('b', { text: run.def.label }), el('span', { class: 'muted small', text: ` · question ${run.idx + 1} of ${n}` })]),
    el('div', { class: 'row' }, [pill(q.clo, 'indigo'), pill(q.domain, 'muted'), pill(`Week ${q.week}`, 'gold'), button('Quit', () => { s.run = null; dash.rerender(); }, { small: true, kind: 'ghost' })]),
  ]));
  pane.appendChild(bar(run.idx / n, '', 'Quiz progress'));
  const result = run.submitted ? run.answers[run.answers.length - 1] : null;
  const box = el('div', { class: 'q-card', tabindex: '-1' });
  box.appendChild(el('h3', { class: 'q-text', text: q.q }));

  const submit = () => {
    if (run.submitted) return;
    let value;
    if (q.type === 'numeric') { value = run.chosen; if (value === null || value === '' || value === undefined) { sim.toast('Enter a number first', 'warn'); return; } } else { value = run.chosen; if (value === null) { sim.toast('Choose an answer first', 'warn'); return; } }
    const ok = isCorrect(q, value);
    run.answers.push({ id: q.id, value, correct: ok });
    run.submitted = true;
    if (sim.bus) sim.bus.emit('quiz:answered', { week: q.week, questionId: q.id, correct: ok });
    dash.rerender();
  };

  if (q.type === 'numeric') {
    const input = el('input', { type: 'text', inputmode: 'decimal', class: 'q-num', placeholder: 'Type your answer', 'aria-label': 'Numeric answer', disabled: run.submitted, value: run.chosen === null ? '' : run.chosen });
    input.addEventListener('input', () => { run.chosen = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { run.chosen = input.value; submit(); } });
    box.appendChild(el('div', { class: 'q-numrow' }, [input, q.unit ? el('span', { class: 'muted', text: q.unit }) : null, el('span', { class: 'muted small', text: q.tolerance ? `tolerance ±${q.tolerance <= 1 ? `${q.tolerance * 100}%` : q.tolerance}` : 'give the exact value' })]));
    if (!run.submitted) setTimeout(() => { try { input.focus({ preventScroll: true }); } catch { /* ignore */ } }, 0);
  } else {
    box.appendChild(el('div', { class: 'q-opts', role: 'radiogroup', 'aria-label': 'Answer options' }, q.options.map((o, i) => {
      let cls = 'q-opt';
      if (run.chosen === i) cls += ' sel';
      if (run.submitted) { if (i === q.answer) cls += ' right'; else if (run.chosen === i) cls += ' wrong'; }
      return el('button', {
        type: 'button', role: 'radio', 'aria-checked': run.chosen === i ? 'true' : 'false', class: cls, disabled: run.submitted,
        onclick: () => { run.chosen = i; dash.rerender(); },
      }, [el('span', { class: 'q-key', text: q.type === 'tf' ? (i === 0 ? 'T' : 'F') : String.fromCharCode(65 + i) }), el('span', { text: o })]);
    })));
  }

  if (run.submitted && result) {
    const ok = result.correct;
    const wrongText = q.wrongExplanations && q.type !== 'numeric' ? q.wrongExplanations[String(result.value)] : null;
    box.appendChild(el('div', { class: `callout ${ok ? 'good' : 'bad'} q-feedback`, role: 'status' }, [
      el('b', { text: ok ? 'Correct.' : `Not quite. The answer is ${fmtAnswer(q)}.` }),
      el('p', { text: q.explanation }),
      !ok && wrongText ? el('p', { class: 'pm-note', text: `Why your choice does not fit: ${wrongText}` }) : null,
      !ok && q.type === 'numeric' ? el('p', { class: 'pm-note', text: `You answered ${result.value}.` }) : null,
    ]));
    if (!ok) {
      box.appendChild(el('div', { class: 'row' }, [button(run.tutor ? 'Hide MEHRAN’s explanation' : 'Explain with MEHRAN', () => {
        if (run.tutor) { run.tutor = null; dash.rerender(); return; }
        let text = q.explanation;
        try {
          if (sim.ai && sim.ai.tutor) {
            const chosenIdx = q.type === 'numeric' ? String(result.value) : result.value;
            const r = sim.ai.tutor({ question: q.q, chosen: chosenIdx, correct: q.type === 'numeric' ? String(q.answer) : q.answer, explanation: q.explanation, options: q.options });
            text = typeof r === 'string' ? r : (r && (r.text || r.markdown)) || text;
          }
        } catch { /* fall back to the stored explanation */ }
        run.tutor = text;
        dash.rerender();
      }, { small: true, icon: 'spark', kind: 'ghost' })]));
      if (run.tutor) box.appendChild(el('div', { class: 'tutor-note' }, [el('small', { class: 'muted', text: 'MEHRAN · quiz tutor' }), renderMarkdown(run.tutor)]));
    }
  }

  const actions = el('div', { class: 'row q-actions' });
  if (!run.submitted) actions.appendChild(button('Submit answer', submit, { kind: 'primary', icon: 'flagCheck' }));
  else {
    const last = run.idx === n - 1;
    actions.appendChild(button(last ? 'Finish quiz' : 'Next question', () => {
      if (last) finish(dash, s); else { run.idx += 1; run.chosen = null; run.submitted = false; run.tutor = null; dash.rerender(); }
    }, { kind: 'primary', icon: last ? 'flag' : 'play' }));
  }
  box.appendChild(actions);
  pane.appendChild(box);
  box.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!run.submitted && q.type !== 'numeric') {
      const k = e.key.toLowerCase();
      let idx = -1;
      if (q.type === 'tf') idx = k === 't' || k === '1' ? 0 : k === 'f' || k === '2' ? 1 : -1;
      else { idx = ['a', 'b', 'c', 'd', 'e'].indexOf(k); if (idx < 0 && /^[1-9]$/.test(k)) idx = Number(k) - 1; }
      if (idx >= 0 && idx < q.options.length) { run.chosen = idx; dash.rerender(); }
    }
    if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); if (!run.submitted) submit(); else actions.querySelector('button').click(); }
  });
}

function finish(dash, s) {
  const run = s.run;
  const t = tally(run.answers);
  const total = run.answers.length;
  const attempt = {
    setId: run.def.id, label: run.def.label, ts: new Date().toISOString(), score: t.score, total, byClo: t.byClo, byDomain: t.byDomain,
    answers: run.answers.map((a) => ({ id: a.id, value: a.value, correct: a.correct })),
  };
  saveAttempt(attempt);
  run.finished = true;
  run.attempt = attempt;
  if (dash.sim.bus) dash.sim.bus.emit('quiz:completed', { setId: run.def.id, score: t.score, total, byClo: t.byClo });
  dash.rerender();
}

function resultView(dash, pane, s) {
  const run = s.run;
  const a = run.attempt;
  const pct = a.score / a.total;
  pane.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
    kpi({ label: 'Score', value: `${a.score} / ${a.total}`, foot: run.def.label, cls: pct >= 0.8 ? 'good' : pct < 0.5 ? 'bad' : 'warn' }),
    ...CLOS.map((c) => kpi({ label: c, value: a.byClo[c][1] ? `${a.byClo[c][0]} / ${a.byClo[c][1]}` : '—', foot: a.byClo[c][1] ? fmtPct(a.byClo[c][0] / a.byClo[c][1], 0) : 'no questions' })),
  ]));
  pane.appendChild(el('div', { class: 'callout' }, [el('div', {}, [el('b', { text: pct >= 0.8 ? 'Strong result. ' : pct >= 0.5 ? 'Good progress. ' : 'Keep practising. ' }), `You earned ${a.score * 8} XP. Review the questions you missed below, then retake the set — questions in weekly sets always appear in the same order, the practice sets are random.`])]));
  pane.appendChild(section('Review'));
  pane.appendChild(el('div', { class: 'review-list' }, run.qs.map((q, i) => {
    const r = run.answers[i];
    const ok = r && r.correct;
    return el('details', { class: `review ${ok ? 'ok' : 'bad'}` }, [
      el('summary', {}, [el('span', { class: 'rv-mark', 'aria-hidden': 'true', text: ok ? '✓' : '✗' }), el('span', { text: `${i + 1}. ${q.q}` })]),
      el('div', { class: 'rv-body' }, [
        el('p', {}, [el('b', { text: 'Answer: ' }), fmtAnswer(q), r && !ok ? el('span', { class: 'muted', text: `  (you: ${q.type === 'numeric' ? r.value : q.options[r.value]})` }) : null]),
        el('p', { class: 'pm-note', text: q.explanation }),
      ]),
    ]);
  })));
  pane.appendChild(el('div', { class: 'row' }, [
    button('Retake', () => { const d = setDefs().find((x) => x.id === run.def.id); s.run = null; start(dash, s, d); }, { kind: 'primary', icon: 'play' }),
    button('Back to quizzes', () => { s.run = null; dash.rerender(); }, { kind: 'ghost' }),
    button('See CLO breakdown', () => { s.run = null; s.tab = 'results'; dash.rerender(); }, { kind: 'ghost' }),
  ]));
}

/* ---------------------------------------------------------------- results */

function results(dash, pane, s) {
  const latest = latestByQuestion();
  if (!latest.size) {
    pane.appendChild(el('div', { class: 'pm-empty', text: 'No quiz has been completed yet. Take a weekly quiz and your outcome-by-outcome breakdown appears here.' }));
    return;
  }
  const rows = [...latest.entries()].map(([id, correct]) => ({ id, correct }));
  const t = tally(rows);
  const cloTitle = { CLO1: 'CLO1 · Concepts, life cycles and approaches', CLO2: 'CLO2 · Planning and control tools', CLO3: 'CLO3 · People, stakeholders and procurement' };
  pane.appendChild(section('Course outcomes', 'latest answer to every question seen'));
  pane.appendChild(el('div', { class: 'clo-bars' }, CLOS.map((c) => {
    const [r, tot] = t.byClo[c];
    const f = tot ? r / tot : 0;
    const seen = QUESTIONS.filter((q) => q.clo === c).length;
    return el('div', { class: 'clo-row' }, [el('div', {}, [el('b', { text: cloTitle[c] }), el('small', { class: 'muted', text: `${tot} of ${seen} questions seen` })]), bar(f, f >= 0.8 ? 'good' : f < 0.5 ? 'bad' : ''), el('b', { class: 'clo-pct', text: tot ? fmtPct(f, 0) : '—' })]);
  })));
  pane.appendChild(section('Week by week'));
  const strip = [];
  for (let w = 1; w <= 15; w++) {
    const qs = QUESTIONS.filter((q) => q.week === w);
    const seen = qs.filter((q) => latest.has(q.id));
    const right = seen.filter((q) => latest.get(q.id)).length;
    const f = seen.length ? right / seen.length : null;
    strip.push(el('div', { class: `wk ${f === null ? 'none' : f >= 0.8 ? 'high' : f >= 0.5 ? 'mid' : 'low'}`, title: f === null ? `Week ${w}: not attempted` : `Week ${w}: ${right}/${seen.length}` }, [el('b', { text: `W${w}` }), el('span', { text: f === null ? '—' : `${Math.round(f * 100)}%` })]));
  }
  pane.appendChild(el('div', { class: 'wk-strip' }, strip));
  pane.appendChild(section('By domain'));
  pane.appendChild(table([{ key: 'domain', label: 'Domain' }, { key: 'right', label: 'Correct', num: true }, { key: 'total', label: 'Seen', num: true }, { key: 'pct', label: 'Mastery', format: (v) => el('div', { class: 'perf-cell' }, [bar(v, v >= 0.8 ? 'good' : v < 0.5 ? 'bad' : ''), el('span', { text: fmtPct(v, 0) })]) }],
    Object.entries(t.byDomain).map(([domain, [r, tot]]) => ({ domain, right: r, total: tot, pct: tot ? r / tot : 0 })).sort((a, b) => a.pct - b.pct), { dense: true }));
  const weakest = Object.entries(t.byDomain).filter(([, [, tot]]) => tot >= 2).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0];
  if (weakest) pane.appendChild(el('div', { class: 'callout warn' }, [el('div', {}, [el('b', { text: 'Focus next: ' }), `${weakest[0]} (${weakest[1][0]} of ${weakest[1][1]} correct). Retake the weeks that cover it.`])]));
}

/* ---------------------------------------------------------------- history */

function history(dash, pane, s) {
  const all = attempts();
  pane.appendChild(el('div', { class: 'row' }, [
    button('Export attempts (JSON)', () => dash.sim.download('HDD_quiz_results.json', 'application/json', JSON.stringify({ exported: new Date().toISOString(), student: (dash.sim.settings && dash.sim.settings.get('studentName')) || '', attempts: all }, null, 1)), { icon: 'export', kind: 'primary', disabled: !all.length }),
    button('Export answers (CSV)', () => {
      const lines = [['Attempt', 'Date', 'Set', 'Question', 'Week', 'CLO', 'Domain', 'Type', 'Given', 'Correct answer', 'Result'].join(',')];
      all.forEach((a, i) => {
        for (const r of a.answers || []) {
          const q = QUESTIONS.find((x) => x.id === r.id);
          if (!q) continue;
          lines.push([i + 1, a.ts, a.setId, q.id, q.week, q.clo, q.domain, q.type, q.type === 'numeric' ? r.value : q.options[r.value], fmtAnswer(q), r.correct ? 'correct' : 'incorrect'].map(csvCell).join(','));
        }
      });
      dash.sim.download('HDD_quiz_answers.csv', 'text/csv', `${lines.join('\n')}\n`);
    }, { icon: 'export', kind: 'ghost', disabled: !all.length }),
    button('Clear history', () => { store.set(KEY, []); dash.rerender(); }, { kind: 'ghost', small: true, disabled: !all.length }),
  ]));
  pane.appendChild(table([
    { key: 'ts', label: 'When', format: (v) => v.slice(0, 16).replace('T', ' ') }, { key: 'label', label: 'Set' },
    { key: 'score', label: 'Score', num: true, format: (v, r) => `${v} / ${r.total}` },
    { key: 'pct', label: 'Result', format: (v) => pill(fmtPct(v, 0), v >= 0.8 ? 'ok' : v < 0.5 ? 'bad' : 'warn') },
    { key: 'c1', label: 'CLO1', num: true }, { key: 'c2', label: 'CLO2', num: true }, { key: 'c3', label: 'CLO3', num: true },
  ], all.slice().reverse().map((a) => ({ ts: a.ts, label: a.label, score: a.score, total: a.total, pct: a.total ? a.score / a.total : 0, c1: a.byClo.CLO1[1] ? `${a.byClo.CLO1[0]}/${a.byClo.CLO1[1]}` : '—', c2: a.byClo.CLO2[1] ? `${a.byClo.CLO2[0]}/${a.byClo.CLO2[1]}` : '—', c3: a.byClo.CLO3[1] ? `${a.byClo.CLO3[0]}/${a.byClo.CLO3[1]}` : '—' })), { dense: true, empty: 'No attempts yet.' }));
}
