import { el, kpi, button, tabs, pill, icon } from '../dom.js';
import { section, card, table } from '../charts.js';
import { RULE_IDS, STATE_CHANGING } from '../../ai/rules.js';

/**
 * aipm — AI in Project Management (Week 3, CLO1). How MEHRAN works, what it can and
 * cannot do, human-in-the-loop approvals, data sources, ethics and bias, and the
 * offline vs live engines — with live status and live findings from sim.ai.
 */

const TABS = [
  { id: 'how', label: 'How MEHRAN works', icon: 'spark' },
  { id: 'limits', label: 'Can & cannot', icon: 'shield' },
  { id: 'hitl', label: 'Human in the loop', icon: 'check' },
  { id: 'data', label: 'Data & engines', icon: 'layers' },
  { id: 'ethics', label: 'Ethics & bias', icon: 'people' },
];
const SEV = { critical: 'bad', warning: 'warn', info: 'info', good: 'ok' };

const STATUS_TEXT = {
  live: ['Live', 'ok', 'A Claude model answers using a compact summary of the project. State-changing actions still need your approval.'],
  fallback: ['Fallback', 'warn', 'Live mode is selected but unreachable (offline or error), so the offline rule engine answers.'],
  offline: ['Offline', 'gold', 'The built-in rule engine answers on this device. Nothing leaves the browser.'],
};

function ai(dash) {
  return dash.sim.ai || null;
}
function safe(fn, d) {
  try { const v = fn(); return v === undefined ? d : v; } catch { return d; }
}

function pipeline() {
  const steps = [
    ['Project state', 'Snapshot of schedule, cost, risk, quality, people', 'stats'],
    [`${RULE_IDS.length} rules`, 'Transparent checks on the numbers (SPI, CPI, float, WIP…)', 'gauge'],
    ['Findings', 'Severity, why, impact and a recommendation', 'warning'],
    ['Proposed action', 'A concrete step MEHRAN could take', 'spark'],
    ['You decide', 'Approve or reject — nothing changes without you', 'check'],
    ['Logged', 'Decision recorded in the project log', 'scroll'],
  ];
  return el('ol', { class: 'cp-pipe', 'aria-label': 'MEHRAN pipeline' }, steps.map(([t, d, ic], i) => el('li', { class: i === 4 ? 'human' : '' }, [
    el('span', { class: 'cp-pipe-i' }, [icon(ic, 18)]), el('b', { text: t }), el('small', { text: d }),
  ])));
}

function how(dash, pane) {
  const m = ai(dash);
  const items = safe(() => m.analyse(), []).slice(0, 6);
  pane.appendChild(el('p', { class: 'lede', text: 'MEHRAN is the AI co-pilot of this simulator. It reads the live project, applies rules and project-management knowledge to explain what is happening, and proposes actions. It never acts on its own: you stay the accountable project manager.' }));
  pane.appendChild(card('From data to decision', [pipeline()]));
  pane.appendChild(section('Live findings', `what MEHRAN sees right now on day ${dash.project.day}`));
  if (!items.length) {
    pane.appendChild(el('p', { class: 'pm-empty', text: 'No findings yet — advance the simulation and MEHRAN will start reporting.' }));
  } else {
    pane.appendChild(el('div', { class: 'cp-finds' }, items.map((f) => el('div', { class: `cp-find ${f.severity}` }, [
      el('div', { class: 'cp-find-h' }, [pill(f.severity, SEV[f.severity] || 'muted'), el('b', { text: f.title })]),
      el('p', { text: f.why }),
      f.recommendation ? el('p', { class: 'pm-note' }, [el('b', { text: 'Recommendation: ' }), f.recommendation]) : null,
      f.action ? el('div', { class: 'row' }, [
        button(f.action.label, () => { f.action.run(); }, { small: true, kind: f.action.needsApproval ? 'primary' : 'ghost', icon: f.action.needsApproval ? 'shield' : 'play' }),
        f.action.needsApproval ? pill('needs your approval', 'gold') : null,
      ]) : null,
    ]))));
  }
  pane.appendChild(el('div', { class: 'row actions-row' }, [
    button('Ask MEHRAN (H)', () => { if (dash.sim.chat && dash.sim.chat.toggle) dash.sim.chat.toggle(true); }, { icon: 'chat' }),
    button('Open Monte Carlo', () => dash.open('forecast'), { icon: 'dice', kind: 'ghost' }),
  ]));
}

function limits(dash, pane) {
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('What AI does well', [el('ul', { class: 'cp-feat good' }, [
      'Scans every number every day and never gets tired',
      'Spots patterns: a drifting SPI, an overloaded resource, a stuck review column',
      'Drafts first versions: status reports, stakeholder messages, risk responses',
      'Explains terms and formulas on request (EVM, float, EMV)',
      'Runs what-ifs and Monte Carlo faster than a spreadsheet',
      'Gives consistent, explainable recommendations from stated rules',
    ].map((t) => el('li', { text: t })))], { cls: 'accent' }),
    card('What AI cannot do', [el('ul', { class: 'cp-feat bad' }, [
      'Know the context it was not given — politics, trust, a minister’s phone call',
      'Take responsibility: accountability stays with the project manager',
      'Guarantee a forecast: it extrapolates the past under stated assumptions',
      'Judge ethics or fairness for you, or negotiate with people',
      'Be right about everything: any language model can state falsehoods confidently',
      'Replace professional judgement, site inspection or the regulator’s sign-off',
    ].map((t) => el('li', { text: t })))]),
  ]));
  pane.appendChild(section('Where AI helps in the PMBOK performance domains'));
  pane.appendChild(table(['Domain', 'AI assists with', 'Human decides'], [
    ['Schedule', 'Critical-path and float scans, Monte Carlo finish dates', 'Which recovery option to take and who to ask'],
    ['Finance', 'EAC scenarios, CPI trend alerts', 'Whether to release reserves'],
    ['Risk', 'Exposure ranking, response suggestions', 'Risk appetite and acceptance'],
    ['Stakeholders', 'Engagement gaps, message drafts', 'Tone, timing and relationships'],
    ['Governance', 'Gate readiness checks, report packs', 'Gate approval and accountability'],
  ], { dense: true }));
}

function hitl(dash, pane) {
  const s = dash.state;
  if (!s.log) s.log = [];
  const sim = dash.sim;
  pane.appendChild(el('p', { class: 'lede', text: 'Human-in-the-loop means the AI proposes and a person disposes. Every action that would change the simulated project — crashing activities, changing staffing, approving a gate — opens an approval dialog first. Try the demonstration below; nothing in the project is changed by it.' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    card('Demonstration', [
      el('p', { text: 'MEHRAN proposes to increase the inspection level for the surface course after a run of marginal quality readings. Review it as you would a real proposal: what is the evidence, what is the cost, who is accountable?' }),
      button('Trigger an approval request', () => {
        const q = dash.project.qualityIndex;
        const p = sim.requestApproval({
          title: 'MEHRAN proposes: raise inspection level (demonstration)',
          detail: `Evidence: quality index ${Math.round((q > 1.5 ? q / 100 : q) * 100)}% with recent marginal samples.\nCost: small additional inspection effort.\nRisk of not acting: more rework later.\n\nThis is a demonstration — approving or rejecting changes nothing in the project.`,
          onApprove: () => {},
        });
        Promise.resolve(p).then((ok) => { s.log.unshift({ day: dash.project.day, ok: !!ok, t: 'Inspection level (demo)' }); if (dash.openId === 'aipm') dash.rerender(); });
      }, { kind: 'primary', icon: 'shield' }),
    ], { cls: 'accent' }),
    card('Approval log (this session)', s.log.length ? [table(['Day', 'Proposal', 'Your decision'], s.log.slice(0, 8).map((l) => [l.day, l.t, pill(l.ok ? 'Approved' : 'Rejected', l.ok ? 'ok' : 'bad')]), { dense: true })] : [el('p', { class: 'pm-empty', text: 'No requests yet.' })]),
  ]));
  pane.appendChild(section('Which actions need approval?', `${STATE_CHANGING.size} kinds of state-changing action`));
  pane.appendChild(el('div', { class: 'cp-chips' }, [...STATE_CHANGING].map((k) => pill(k, 'gold'))));
  pane.appendChild(el('p', { class: 'pm-note', text: 'Read-only actions (open a panel, run Monte Carlo, export a report) run immediately. Good practice: read the evidence, ask “what would change my mind?”, then decide — and record why.' }));
}

function data(dash, pane) {
  const m = ai(dash);
  const st = m ? m.status : 'offline';
  const [label, tone, text] = STATUS_TEXT[st] || STATUS_TEXT.offline;
  pane.appendChild(el('div', { class: 'pm-grid c3' }, [
    kpi({ label: 'Engine now', value: label, foot: m ? m.engineLabel : 'unavailable', cls: tone === 'ok' ? 'good' : 'warn' }),
    kpi({ label: 'Offline intents', value: String(safe(() => m.intentCount(), '—')), foot: 'questions it can answer on-device' }),
    kpi({ label: 'Glossary terms', value: String(safe(() => m.glossarySize(), '—')), foot: 'PM vocabulary, built in' }),
  ]));
  pane.appendChild(el('div', { class: `callout ${tone === 'ok' ? 'good' : 'warn'}` }, [icon('spark', 16), el('div', {}, [el('b', { text: `Status: ${label}` }), el('p', { text })])]));
  pane.appendChild(section('Offline vs live'));
  pane.appendChild(table(['', 'Offline rule engine', 'Live (optional)'], [
    ['How it answers', 'Fixed rules + intent matching + glossary', 'A Claude model, with tools that read the project'],
    ['Needs internet', 'No — the simulator is one offline file', 'Yes, and your own API key'],
    ['Where data goes', 'Nowhere; it stays in the page', 'A compact project summary goes to the model provider only after you paste a key and choose live'],
    ['Key storage', '—', 'Browser session storage only; cleared when the tab closes; never saved or exported'],
    ['Strengths', 'Deterministic, explainable, free, classroom-safe', 'Natural conversation, flexible explanations'],
    ['Weaknesses', 'Cannot step outside its rules', 'Can be wrong or inconsistent; needs checking'],
    ['If it fails', '—', 'Falls back to offline automatically (amber light)'],
  ], { dense: true }));
  pane.appendChild(section('Data sources MEHRAN uses'));
  pane.appendChild(table(['Source', 'Used for', 'Nature'], [
    ['Project snapshot and registers', 'Findings, status report, stand-up', 'Simulated scenario data'],
    ['Critical path, EVM, Monte Carlo cache', 'Schedule and cost forecasts', 'Computed by the engine'],
    ['Game state (missions, decisions)', 'Coaching hints', 'Local to this session'],
    ['Glossary and intent library', 'Explanations', 'Built-in teaching content'],
    ['Airport fact base', 'Real-world context (climate, constraints)', 'Verified, cited facts only'],
  ], { dense: true }));
  pane.appendChild(el('div', { class: 'row actions-row' }, [button('Open Session & Settings', () => dash.open('session'), { icon: 'gear', kind: 'ghost' })]));
}

const CASES = [
  {
    q: 'MEHRAN flags a contractor as “high risk” because past data from a different region shows delays. The vendor is a good local firm. What do you do?',
    opts: [['Exclude the vendor — the AI said so', false, 'Automation bias: a model trained on unlike data can misjudge a different context.'], ['Check the evidence, test it against the vendor’s record, then decide and document', true, 'Treat output as input to your judgement — and record your reasoning.'], ['Ignore AI findings from now on', false, 'Over-correcting loses a useful second opinion.']],
  },
  {
    q: 'You are asked to paste the full commercial bid sheets into a public AI chat to compare them faster.',
    opts: [['Paste them — it saves time', false, 'Confidential bids must not leave approved systems; this breaches confidentiality and fair-procurement duties.'], ['Use only the offline engine or an approved tool, and anonymise where possible', true, 'Protect confidential data; follow organisational policy.'], ['Paste only half', false, 'Partial leakage is still leakage.']],
  },
  {
    q: 'The AI forecasts a finish 40 days late, but the team lead says it is wrong. Neither shows evidence.',
    opts: [['Trust the team lead — people know best', false, 'Experience matters, but unexamined opinion is a bias too.'], ['Trust the AI — it is data-driven', false, 'Data-driven is not infallible; check its assumptions.'], ['Compare both with the schedule data, run a Monte Carlo, and test the assumptions together', true, 'Triangulate: evidence beats authority, human or machine.']],
  },
];

function ethics(dash, pane) {
  const s = dash.state;
  if (!s.case) s.case = {};
  pane.appendChild(el('div', { class: 'pm-grid c3' }, [
    ['Automation bias', 'Over-trusting a confident machine. Counter: ask for the evidence and the assumptions.'],
    ['Data bias', 'Models inherit the gaps of their data — a model trained elsewhere can mislead locally. Counter: check fit to context.'],
    ['Transparency', 'People affected deserve to know AI is used and how. Counter: label AI output; keep the rules readable (as MEHRAN’s offline engine does).'],
    ['Accountability', 'The PM, not the tool, answers for decisions. Counter: record who approved what and why.'],
    ['Privacy & confidentiality', 'Bids, staff and stakeholder data are sensitive. Counter: minimum data, approved tools, no secrets in prompts.'],
    ['Fairness & dignity', 'Do not let a score replace conversation with people — especially about performance or stakeholders.'],
  ].map(([t, d]) => card(t, [el('p', { text: d })]))));
  pane.appendChild(section('Judgement calls', 'choose the best response'));
  pane.appendChild(el('div', { class: 'cp-cases' }, CASES.map((c, i) => {
    const pick = s.case[i];
    return card(`Scenario ${i + 1}`, [
      el('p', { text: c.q }),
      el('div', { class: 'cp-opts', role: 'radiogroup', 'aria-label': `Scenario ${i + 1} options` }, c.opts.map(([t, good, why], j) => el('button', {
        type: 'button', role: 'radio', 'aria-checked': pick === j ? 'true' : 'false', class: `cp-opt ${pick === j ? (good ? 'right' : 'wrong') : ''}`,
        onclick: () => { s.case[i] = j; dash.rerender(); },
      }, [el('span', { text: t }), pick === j ? el('small', { role: 'status', text: `${good ? 'Good call. ' : 'Think again. '}${why}` }) : null]))),
    ]);
  })));
}

const VIEWS = { how, limits, hitl, data, ethics };

export const PANEL_AIPM = {
  id: 'aipm',
  render(dash, body, head) {
    const s = dash.state;
    if (!s.tab) s.tab = 'how';
    const m = ai(dash);
    const st = m ? m.status : 'offline';
    const [label, tone] = STATUS_TEXT[st] || STATUS_TEXT.offline;
    head.appendChild(dash.simBadge());
    head.appendChild(pill(`MEHRAN: ${label}`, tone, m ? m.engineLabel : ''));
    body.appendChild(dash.tag());
    body.appendChild(el('div', { class: 'grid c4 pm-kpis' }, [
      kpi({ label: 'MEHRAN status', value: label, foot: m ? m.engineLabel : '—', cls: tone === 'ok' ? 'good' : 'warn' }),
      kpi({ label: 'Rules', value: String(RULE_IDS.length), foot: 'transparent checks' }),
      kpi({ label: 'Findings now', value: String(safe(() => m.analyse().filter((f) => f.severity !== 'good').length, 0)), foot: 'warnings and criticals' }),
      kpi({ label: 'Approvals gate', value: `${STATE_CHANGING.size} actions`, foot: 'always human-approved' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    VIEWS[s.tab](dash, pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: 'AI output is advice, not authority — a reminder that the project manager remains accountable.' })]));
  },
};
