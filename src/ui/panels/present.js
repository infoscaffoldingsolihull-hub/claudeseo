import { el, kpi, button, tabs, pill, fmtPKR, fmtPct, bar } from '../dom.js';
import { C, chartBox, lineChart, section, card, table, legend } from '../charts.js';
import { scoreRing, printNode, renderMarkdown } from '../charts3.js';
import { buildCloseoutNode } from './closing.js';
import { fact } from '../../core/facts.js';

/**
 * Presentation Studio (Weeks 14-15): one-click Present (the guided tour), an
 * auto-generated slide-style summary deck of the live project state
 * (full-screen, arrow keys) and a printable Project Report (browser print →
 * PDF, see the @media print rules in panels3.css).
 */

const TABS = [
  { id: 'present', label: 'Present', icon: 'present' },
  { id: 'deck', label: 'Slide deck', icon: 'map' },
  { id: 'report', label: 'Project report', icon: 'scroll' },
];

const M = 1e6;
const mm = (v) => `${Math.round(Math.abs(v) / M).toLocaleString('en-US')} m`;

/* ------------------------------------------------------------------ slides */

function projectName(p) {
  return p.info && p.info.name ? p.info.name : 'Hyderabad Airport Revival & Expansion Programme';
}

function evmChart(p, w, h) {
  const hist = p.evmHistory || [];
  if (hist.length < 2) return el('div', { class: 'slide-empty', text: 'Run the simulation forward to build the S-curve.' });
  const bn = (v) => v / 1e9;
  return lineChart({
    width: w, height: h, label: 'Planned value, earned value and actual cost', xDomain: [0, Math.max(p.baselineDuration, hist[hist.length - 1].day)],
    series: [
      { label: 'PV', points: hist.map((x) => [x.day, bn(x.pv)]), color: C.pv, width: 2.4 },
      { label: 'EV', points: hist.map((x) => [x.day, bn(x.ev)]), color: C.ev, width: 3 },
      { label: 'AC', points: hist.map((x) => [x.day, bn(x.ac)]), color: C.ac, width: 2.6 },
    ],
    yFormat: (v) => `${v.toFixed(0)}`, yLabel: 'PKR bn', xLabel: 'Project day', vlines: [{ x: p.day, label: 'Today', color: C.brass }],
  });
}

function buildSlides(dash) {
  const p = dash.project;
  const sim = dash.sim;
  const snap = p.snapshot();
  const e = p.evm();
  let card_ = null;
  try { card_ = sim.game && sim.game.scorecard ? sim.game.scorecard() : null; } catch { card_ = null; }
  const name = (sim.settings && sim.settings.get('studentName')) || '';
  const top = (arr, n) => arr.slice(0, n);
  const risks = p.risks.filter((r) => ['Open', 'Occurred', 'Escalated'].includes(r.status) && r.kind === 'threat').sort((a, b) => b.score - a.score || Math.abs(b.emv) - Math.abs(a.emv));
  const kpiRow = (items) => el('div', { class: 'sl-kpis' }, items.map(([l, v, f, cls]) => el('div', { class: `sl-kpi ${cls || ''}` }, [el('small', { text: l }), el('b', { text: v }), f ? el('span', { text: f }) : null])));
  const slides = [];

  slides.push({
    title: 'Title', node: el('div', { class: 'sl-title' }, [
      el('div', { class: 'sl-kicker', text: 'SKY GATEWAY HYDERABAD' }),
      el('h1', { text: projectName(p) }),
      el('p', { text: `${fact('airport.name')} · ${fact('airport.iata')} / ${fact('airport.icao')} · ${fact('airport.city')}` }),
      el('p', { class: 'sl-sub', text: `Status as of ${snap.dateLabel} (day ${snap.day}) · ${p.approach} approach · ${p.difficulty} difficulty` }),
      name ? el('p', { class: 'sl-by', text: `Presented by ${name}` }) : null,
      el('p', { class: 'sl-sim', text: 'Simulated scenario data for teaching — PMBOK® Guide 8th Edition' }),
    ]),
  });

  slides.push({
    title: 'Scope', node: el('div', {}, [
      kpiRow([['Budget at completion', fmtPKR(p.bac), 'baseline v' + p.baselineVersion], ['Work packages', String(p.tasks.length), `${p.summaries.length} summary packages`], ['Requirements', String(p.requirements.length), `${p.requirements.filter((r) => r.status === 'Verified').length} verified`], ['Changes', `${p.changes.filter((c) => c.status === 'Implemented').length} implemented`, `${snap.openChanges} open`]]),
      el('h3', { text: 'Work packages' }),
      el('ul', { class: 'sl-list two' }, p.summaries.map((s) => el('li', {}, [el('i', { style: { background: s.color } }), s.name]))),
    ]),
  });

  slides.push({
    title: 'Schedule', node: el('div', {}, [
      kpiRow([['Complete', fmtPct(snap.progress, 1), snap.phase], ['Baseline finish', `${p.baselineDuration} d`, p.dateLabel(p.baselineDuration).slice(4)], ['Forecast finish', p.dateLabel(Math.round(snap.forecastFinish)).slice(4), `${snap.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(snap.scheduleVarianceDays)} d`, snap.scheduleVarianceDays > 10 ? 'warn' : 'good'], ['SPI', e.spi.toFixed(2), `SPI(t) ${e.spit.toFixed(2)}`, e.spi < 0.95 ? 'warn' : 'good']]),
      el('h3', { text: 'Critical path' }),
      el('p', { class: 'sl-path', text: snap.criticalPath.slice(0, 12).join('  →  ') + (snap.criticalPath.length > 12 ? '  → …' : '') }),
      el('p', { text: `${p.milestones.filter((m) => p.state.get(m.taskId || m.id) && p.state.get(m.taskId || m.id).pct >= 1).length} of ${p.milestones.length} milestones reached.` }),
    ]),
  });

  slides.push({
    title: 'Cost and earned value', node: el('div', {}, [
      kpiRow([['CPI', e.cpi.toFixed(2), e.cpi < 0.95 ? 'over budget' : 'on budget', e.cpi < 0.95 ? 'warn' : 'good'], ['Actual cost', fmtPKR(e.ac), `EV ${fmtPKR(e.ev)}`], ['EAC', fmtPKR(e.eac.cpi), `VAC ${fmtPKR(e.vac)}`], ['TCPI', e.tcpi.bac.toFixed(2), 'to finish on BAC']]),
      chartBox(evmChart(p, 1000, 330), { minWidth: 0, cls: 'sl-chart' }),
    ]),
  });

  slides.push({
    title: 'Risk', node: el('div', {}, [
      kpiRow([['Threat exposure', fmtPKR(snap.riskExposure), `${snap.openRisks} open`], ['Realised', String(snap.realisedRisks), 'threat events'], ['Contingency left', fmtPKR(snap.contingencyRemaining), `of ${fmtPKR(p.contingencyReserve)}`], ['Management reserve', fmtPKR(snap.managementRemaining), 'untouched unless escalated']]),
      el('h3', { text: 'Top threats (by P × I score)' }),
      table([{ key: 'id', label: 'ID' }, { key: 'title', label: 'Risk' }, { key: 'score', label: 'Score', num: true }, { key: 'emv', label: 'EMV', num: true, format: (v) => mm(v) }, { key: 'owner', label: 'Owner' }], top(risks, 5), { dense: true }),
    ]),
  });

  slides.push({
    title: 'Quality and safety', node: el('div', {}, [
      kpiRow([['Quality index', fmtPct(snap.qualityIndex, 0), `${snap.openNcrs} open NCRs`], ['Safety index', fmtPct(snap.safety, 0), `${snap.incidents} incidents`], ['Welfare', fmtPct(snap.welfare, 0), 'workforce'], ['Cost of quality', fmtPKR(Object.values(p.quality.costOfQuality).reduce((a, b) => a + b, 0)), 'prevention + appraisal + failure']]),
      el('h3', { text: 'Defects by category' }),
      el('ul', { class: 'sl-list' }, Object.entries(p.quality.defects).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => el('li', { text: `${k}: ${v}` }))),
      !Object.keys(p.quality.defects).length ? el('p', { text: 'No defects recorded so far.' }) : null,
    ]),
  });

  const gaps = p.stakeholders.filter((s) => s.current < s.desired).sort((a, b) => (b.desired - b.current) - (a.desired - a.current));
  slides.push({
    title: 'Stakeholders', node: el('div', {}, [
      kpiRow([['Satisfaction', fmtPct(snap.stakeholderSatisfaction, 0), 'power-weighted'], ['Stakeholders', String(p.stakeholders.length), 'registered'], ['Engagement gaps', String(gaps.length), 'below desired level', gaps.length > 6 ? 'warn' : '']]),
      el('h3', { text: 'Largest engagement gaps' }),
      el('ul', { class: 'sl-list' }, top(gaps, 5).map((s) => el('li', { text: `${s.role.split(/\s[—–-]\s|\(/)[0].trim()}: ${s.levelName || ''} → desired ${['Unaware', 'Resistant', 'Neutral', 'Supportive', 'Leading'][s.desired - 1]}` }))),
      !gaps.length ? el('p', { text: 'Every stakeholder has reached the desired engagement level.' }) : null,
    ]),
  });

  const awarded = p.procurement.filter((x) => x.vendor);
  slides.push({
    title: 'Procurement and resources', node: el('div', {}, [
      kpiRow([['Contracts awarded', `${awarded.length} / ${p.procurement.length}`, `${p.procurement.filter((x) => x.status === 'Closed').length} closed`], ['Committed', fmtPKR(awarded.reduce((a, x) => a + x.awardedValue, 0)), 'awards'], ['People on site', p.resources.filter((r) => r.kind === 'people').reduce((a, r) => a + r.assigned, 0).toLocaleString('en-US'), `peak plan ${p.peakPeople.toLocaleString('en-US')}`], ['Open claims', String(p.procurement.reduce((a, x) => a + x.claims.filter((c) => c.status !== 'Settled').length, 0)), '']]),
      el('h3', { text: 'Contract mix' }),
      el('p', { text: Object.entries(p.procurement.reduce((m, x) => { m[x.contractType] = (m[x.contractType] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} × ${v}`).join('   ·   ') }),
    ]),
  });

  slides.push({
    title: 'Lessons learned', node: el('div', {}, [
      el('h3', { text: `${p.lessons.length} lesson${p.lessons.length === 1 ? '' : 's'} captured` }),
      p.lessons.length
        ? el('ul', { class: 'sl-list lessons' }, top(p.lessons, 5).map((l) => el('li', {}, [el('b', { text: l.title }), el('span', { text: ` — ${l.detail}` })])))
        : el('p', { text: 'No lessons have been recorded yet. Add them in Closing & Lessons as events happen.' }),
    ]),
  });

  if (card_) {
    slides.push({
      title: 'Scorecard', node: el('div', { class: 'sl-score' }, [
        el('div', { class: 'sl-rings' }, [scoreRing(card_.overall / 100, `Grade ${card_.grade}`, { size: 190, display: String(card_.overall), color: 'var(--brass)' }), ...Object.entries(card_.byClo).map(([k, v]) => scoreRing(v / 100, k, { size: 140, color: k === 'CLO1' ? 'var(--c2)' : k === 'CLO2' ? 'var(--c4)' : 'var(--c6)' }))]),
        el('ul', { class: 'sl-list two' }, Object.entries(card_.cloLabels).map(([k, v]) => el('li', { text: `${k}: ${v}` }))),
      ]),
    });
  }

  slides.push({
    title: 'Questions', node: el('div', { class: 'sl-title' }, [
      el('div', { class: 'sl-kicker', text: 'Thank you' }),
      el('h1', { text: 'Questions and discussion' }),
      el('p', { text: 'What would you decide differently, and what evidence would change your mind?' }),
      el('p', { class: 'sl-sim', text: 'Simulated scenario data — no real project figures are shown.' }),
    ]),
  });
  return slides;
}

function slideEl(slide, i, n) {
  return el('section', { class: `slide ${slide.title === 'Title' || slide.title === 'Questions' ? 'cover' : ''}`, 'aria-label': `Slide ${i + 1} of ${n}: ${slide.title}` }, [
    slide.title === 'Title' || slide.title === 'Questions' ? null : el('header', { class: 'sl-head' }, [el('h2', { text: slide.title }), el('span', { text: `${i + 1} / ${n}` })]),
    el('div', { class: 'sl-body' }, [slide.node]),
    el('footer', { class: 'sl-foot' }, [el('span', { text: 'SKY GATEWAY HYDERABAD · simulated scenario data' }), el('span', { text: `${i + 1} / ${n}` })]),
  ]);
}

/* -------------------------------------------------------------- full screen */

function openDeck(dash, start = 0) {
  const slides = buildSlides(dash);
  let i = Math.max(0, Math.min(slides.length - 1, start));
  const stage = el('div', { class: 'deck-stage' });
  const dots = el('div', { class: 'deck-dots', 'aria-hidden': 'true' }, slides.map((_, k) => el('i', { onclick: () => go(k) })));
  const counter = el('span', { class: 'deck-count' });
  const prev = el('button', { type: 'button', class: 'deck-nav', 'aria-label': 'Previous slide', onclick: () => go(i - 1) }, ['‹']);
  const next = el('button', { type: 'button', class: 'deck-nav', 'aria-label': 'Next slide', onclick: () => go(i + 1) }, ['›']);
  const close = el('button', { type: 'button', class: 'deck-close', 'aria-label': 'Close the slide deck', onclick: () => end() }, ['Esc ✕']);
  const root = el('div', { class: 'deck-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Project summary slide deck' }, [stage, el('div', { class: 'deck-bar' }, [prev, dots, counter, next]), close]);
  const fit = () => {
    const sl = stage.firstChild;
    if (!sl) return;
    const sc = Math.min(window.innerWidth / 1280, (window.innerHeight - 56) / 720);
    sl.style.transform = `scale(${sc})`;
    stage.style.width = `${1280 * sc}px`;
    stage.style.height = `${720 * sc}px`;
  };
  function go(k) {
    i = Math.max(0, Math.min(slides.length - 1, k));
    stage.replaceChildren(slideEl(slides[i], i, slides.length));
    [...dots.children].forEach((d, idx) => d.classList.toggle('on', idx === i));
    counter.textContent = `${i + 1} / ${slides.length}`;
    prev.disabled = i === 0;
    next.disabled = i === slides.length - 1;
    fit();
  }
  const key = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(i + 1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); e.stopPropagation(); go(i - 1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === 'Home') { go(0); } else if (e.key === 'End') { go(slides.length - 1); }
  };
  function end() {
    document.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', fit);
    root.remove();
    document.body.classList.remove('deck-open');
    if (dash.openId === 'present') dash.rerender();
  }
  document.addEventListener('keydown', key, true);
  window.addEventListener('resize', fit);
  document.body.classList.add('deck-open');
  document.body.appendChild(root);
  go(i);
  setTimeout(() => { try { root.querySelector('.deck-nav:not(:disabled)').focus({ preventScroll: true }); } catch { /* ignore */ } }, 0);
  return { go, end, root, count: slides.length };
}

/* ------------------------------------------------------------- the report */

export function buildProjectReport(dash) {
  const p = dash.project;
  const sim = dash.sim;
  const r = p.closeProject();
  const snap = p.snapshot();
  let rep = null;
  try { rep = sim.ai && sim.ai.statusReport ? sim.ai.statusReport() : null; } catch { rep = null; }
  const name = (sim.settings && sim.settings.get('studentName')) || '';
  const e = p.evm();
  return el('article', { class: 'project-report' }, [
    el('header', { class: 'rep-cover' }, [
      el('div', { class: 'sl-kicker', text: 'SKY GATEWAY HYDERABAD · PROJECT REPORT' }),
      el('h1', { text: projectName(p) }),
      el('p', { text: `${fact('airport.name')} (${fact('airport.iata')} / ${fact('airport.icao')}), ${fact('airport.city')}` }),
      el('p', { text: `Status at ${snap.dateLabel} (day ${snap.day}) · ${p.approach} approach · ${p.difficulty}` }),
      name ? el('p', { text: `Prepared by ${name}` }) : null,
      el('p', { class: 'rep-note', text: 'Simulated scenario data for teaching. Real-world facts are limited to the airport’s name, codes, location and public history.' }),
    ]),
    el('section', { class: 'rep-sec' }, [
      el('h3', { text: 'Executive summary' }),
      el('p', { text: `The programme is ${fmtPct(snap.progress, 1)} complete in the ${snap.phase} phase. Schedule performance index ${e.spi.toFixed(2)} and cost performance index ${e.cpi.toFixed(2)}; the estimate at completion is ${fmtPKR(e.eac.cpi)} against a budget of ${fmtPKR(p.bac)}. The forecast finish is ${p.dateLabel(Math.round(snap.forecastFinish))} (${snap.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(snap.scheduleVarianceDays)} days against baseline). ${snap.openRisks} risks are open with a threat exposure of ${fmtPKR(snap.riskExposure)}; ${snap.openChanges} change request(s) await a decision.` }),
      el('div', { class: 'rep-chart' }, [evmChart(p, 900, 280)]),
    ]),
    rep && rep.markdown ? el('section', { class: 'rep-sec' }, [el('h3', { text: 'Status report' }), renderMarkdown(rep.markdown)]) : null,
    buildCloseoutNode(p, r),
  ]);
}

/* ---------------------------------------------------------------- the panel */

export const PANEL_PRESENT = {
  id: 'present',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'present';
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const snap = p.snapshot();
    body.appendChild(el('p', { class: 'lede', text: 'Present the programme in three ways: let the guided tour narrate it, walk an auto-generated slide deck of the live project state, or hand over a printable report. Everything here is built from the current simulation, so it is always up to date.' }));
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'Progress', value: fmtPct(snap.progress, 1), foot: `day ${p.day}` }),
      kpi({ label: 'SPI · CPI', value: `${snap.spi.toFixed(2)} · ${snap.cpi.toFixed(2)}`, cls: Math.min(snap.spi, snap.cpi) < 0.95 ? 'warn' : 'good' }),
      kpi({ label: 'Forecast finish', value: p.dateLabel(Math.round(snap.forecastFinish)).slice(4) }),
      kpi({ label: 'Lessons', value: String(p.lessons.length) }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ present: presentTab, deck: deckTab, report: reportTab })[s.tab](dash, pane, p, s);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · press F11 for a full-screen browser` })]));
  },
};

function presentTab(dash, pane) {
  pane.appendChild(el('div', { class: 'present-hero' }, [
    el('div', {}, [
      el('h3', { text: 'One-click presentation' }),
      el('p', { text: 'Starts the cinematic guided tour: narrated beats from dawn at the closed airport to the first landing, with captions and the matching project state. Use ← → to move between beats and Esc to leave.' }),
      el('div', { class: 'row' }, [
        button('Present now (guided tour)', () => { dash.close(); dash.sim.setMode('tour'); }, { kind: 'primary', icon: 'present', id: 'present-now' }),
        button('Full-screen slide deck', () => openDeck(dash, 0), { icon: 'map', kind: 'ghost' }),
      ]),
    ]),
  ]));
  pane.appendChild(card('Five-minute presenter script', [
    el('ol', {}, [
      '30 s — Open with the title slide and the airport’s story: closed to commercial traffic, now proposed for revival.',
      '60 s — Scope and schedule: the 12 packages, the critical path and the forecast finish.',
      '90 s — Cost and risk: the S-curve (PV, EV, AC), CPI and SPI, then the top three threats and the reserves.',
      '60 s — People and stakeholders: engagement gaps and what you did about them.',
      '60 s — Lessons and scorecard: what you would change next time, tied to each course outcome.',
    ].map((t) => el('li', { text: t }))),
  ], { cls: 'flat' }));
  pane.appendChild(card('Tips', [
    el('ul', {}, ['Use the speed control to jump ahead before presenting so there is real data to discuss.', 'Open the dashboard panel you are talking about, then close it to show the 3D site behind.', 'Print the report as a PDF to hand in with your slides.'].map((t) => el('li', { text: t }))),
  ], { cls: 'flat' }));
}

function deckTab(dash, pane, p, s) {
  const slides = buildSlides(dash);
  pane.appendChild(el('div', { class: 'row' }, [
    button('Start full-screen deck', () => openDeck(dash, 0), { kind: 'primary', icon: 'present', id: 'deck-start' }),
    button('Print deck (PDF)', () => printNode(el('div', { class: 'deck-print' }, slides.map((sl, i) => slideEl(sl, i, slides.length))), 'Project slide deck'), { kind: 'ghost', icon: 'export' }),
    el('span', { class: 'muted small', text: `${slides.length} slides · arrow keys to move, Esc to leave` }),
  ]));
  pane.appendChild(el('div', { class: 'thumb-grid' }, slides.map((sl, i) => {
    const holder = el('button', { type: 'button', class: 'thumb', onclick: () => openDeck(dash, i), 'aria-label': `Open slide ${i + 1}: ${sl.title}` }, [
      el('div', { class: 'thumb-frame' }, [el('div', { class: 'thumb-scale' }, [slideEl(sl, i, slides.length)])]),
      el('span', { text: `${i + 1}. ${sl.title}` }),
    ]);
    return holder;
  })));
  const grid = pane.lastChild;
  const fitThumbs = () => grid.querySelectorAll('.thumb-frame').forEach((fr) => { const sc = fr.clientWidth / 1280; if (sc > 0) fr.firstChild.style.transform = `scale(${sc})`; });
  setTimeout(fitThumbs, 0);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitThumbs).observe(grid);
}

function reportTab(dash, pane) {
  pane.appendChild(el('div', { class: 'row' }, [
    button('Print / save as PDF', () => printNode(buildProjectReport(dash), 'SKY GATEWAY HYDERABAD — Project Report'), { kind: 'primary', icon: 'present', id: 'print-report' }),
    button('Download status report (Markdown)', () => { try { dash.sim.ai.exportReport(); } catch { dash.sim.toast('Status report unavailable', 'warn'); } }, { kind: 'ghost', icon: 'export', small: true }),
    el('span', { class: 'muted small', text: 'In the print dialog choose “Save as PDF”. Dark panels switch to a clean white layout.' }),
  ]));
  pane.appendChild(el('div', { class: 'report-sheet' }, [buildProjectReport(dash)]));
  void bar; void pill; void section; void legend;
}

PANEL_PRESENT.openDeck = openDeck;
