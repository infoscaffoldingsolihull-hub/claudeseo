import { el, kpi, button, tabs, pill, slider, field, fmtPct, bar } from '../dom.js';
import { C, chartBox, section, card, dl, table, hookCard } from '../charts.js';
import { powerInterestGrid, salienceVenn, engagementMatrix, channelNetwork, ENGAGEMENT, renderMarkdown, shortRole } from '../charts3.js';
import { channels, gridQuadrant, salience, engagementGap } from '../../pm/comms.js';

/**
 * Stakeholders (Week 12): register, power/interest grid, salience model,
 * engagement assessment matrix with engagement actions, communications
 * management plan, channel-count calculator, information distribution,
 * generated status report and expectation management.
 */

const TABS = [
  { id: 'register', label: 'Register & grid', icon: 'target' },
  { id: 'salience', label: 'Salience', icon: 'people' },
  { id: 'engage', label: 'Engagement', icon: 'spark' },
  { id: 'comms', label: 'Communications', icon: 'chat' },
  { id: 'report', label: 'Reports & expectations', icon: 'scroll' },
];

const ACTIONS = [
  { id: 'inform', label: 'Inform', cost: 2, gain: 3, cap: 3, text: 'One-way updates: newsletter, notice, dashboard.' },
  { id: 'consult', label: 'Consult', cost: 4, gain: 5, cap: 3, text: 'Ask for feedback and show it was heard.' },
  { id: 'involve', label: 'Involve', cost: 6, gain: 7, cap: 4, text: 'Work with them through the process so concerns are reflected.' },
  { id: 'collaborate', label: 'Collaborate', cost: 10, gain: 9, cap: 4, text: 'Partner on decisions and solutions.' },
  { id: 'empower', label: 'Empower', cost: 15, gain: 11, cap: 5, text: 'Delegate final decision authority. Poorly suited to low-power groups.' },
];

const GROUPS = [
  { id: 'Community', title: 'Residents and encroachment occupants', ids: ['S07', 'S08'], text: 'Live beside the airport or on the extension corridor. Expect noise, dust, access changes and in some cases resettlement.' },
  { id: 'Business', title: 'Traders and exporters', ids: ['S06', 'S10'], text: 'Want cargo capacity, reliable access and local contracts.' },
  { id: 'Customers', title: 'Airlines and passengers', ids: ['S09', 'S16'], text: 'Expect a certified runway, safe operations and an on-time opening.' },
  { id: 'Governance', title: 'Regulators and government', ids: ['S02', 'S03', 'S04', 'S05'], text: 'Expect compliance, transparency and orderly gate approvals.' },
];

const STATUS_CLS = { 'Manage closely': 'bad', 'Keep satisfied': 'warn', 'Keep informed': 'info', Monitor: 'muted' };

function view(p) {
  return p.stakeholders.map((x) => ({
    ...x,
    quad: gridQuadrant(x.power, x.interest),
    sal: salience(x),
    gap: engagementGap(x.current, x.desired),
    short: shortRole(x.role),
  }));
}

export const PANEL_STAKEHOLDERS = {
  id: 'stakeholders',
  render(dash, body, head) {
    const p = dash.project;
    const s = dash.state;
    if (!s.tab) s.tab = 'register';
    if (!s.sel || !p.stakeholderById.has(s.sel)) s.sel = p.stakeholders[0].id;
    head.appendChild(dash.simBadge());
    body.appendChild(dash.tag());
    const v = view(p);
    const gaps = v.filter((x) => x.gap > 0);
    const n = p.stakeholders.length + 1;
    body.appendChild(el('p', { class: 'lede', text: `${p.stakeholders.length} stakeholders are registered. Analyse who matters (power, interest, salience), see where engagement falls short of what the project needs, act, and keep everyone informed through a deliberate communications plan.` }));
    body.appendChild(el('div', { class: 'grid c5 pm-kpis' }, [
      kpi({ label: 'Stakeholders', value: String(p.stakeholders.length), foot: `${v.filter((x) => x.quad === 'Manage closely').length} to manage closely` }),
      kpi({ label: 'Weighted satisfaction', value: fmtPct(p.stakeholderSatisfaction, 0), foot: 'power-weighted', cls: p.stakeholderSatisfaction < 0.5 ? 'warn' : 'good' }),
      kpi({ label: 'Engagement gaps', value: String(gaps.length), foot: `largest ${Math.max(0, ...gaps.map((x) => x.gap))} level(s)`, cls: gaps.length > 6 ? 'warn' : '' }),
      kpi({ label: 'Communication channels', value: String(channels(n)), foot: `n(n−1)/2 with n = ${n}` }),
      kpi({ label: 'Plan rows', value: String(p.commsPlan.length), foot: 'communications management plan' }),
    ]));
    body.appendChild(el('div', { class: 'pm-toolbar' }, [tabs(TABS, s.tab, (id) => { s.tab = id; dash.rerender(); })]));
    const pane = el('div', { class: 'tab-pane' });
    body.appendChild(pane);
    ({ register, salience: salienceTab, engage, comms, report })[s.tab](dash, pane, p, s, v);
    body.appendChild(hookCard(dash, {
      kicker: 'Case study · Week 5', title: 'British Columbia Transportation — many stakeholders, one programme',
      text: 'Rank the case’s stakeholders on this power/interest grid. Which would you have moved from “Keep informed” to “Manage closely”, and why?',
      cta: 'Open in Case Studies',
    }));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: `As of ${p.dateLabel()} · stakeholders are roles; no real individuals are named` })]));
  },
};

function detailCard(dash, p, st, withActions = false) {
  const act = withActions ? el('div', { class: 'engage-actions' }, ACTIONS.map((a) => button(a.label, () => {
    const r = p.engageStakeholder(st.id, a.id);
    dash.sim.toast(r.message, r.ok ? 'good' : 'warn');
    dash.rerender();
  }, { small: true, kind: a.id === 'empower' && st.power < 0.5 ? 'ghost' : 'primary', title: `${a.text} Cost PKR ${a.cost} m; satisfaction +${a.gain}; reaches at most ${ENGAGEMENT[a.cap - 1]}.` }))) : null;
  return card(`${st.id} · ${st.role}`, [
    dl([
      ['Group', st.group], ['Needs', st.needs],
      ['Power · Interest', `${Math.round(st.power * 100)} · ${Math.round(st.interest * 100)}  →  ${gridQuadrant(st.power, st.interest)}`],
      ['Salience', `${salience(st)} (legitimacy ${Math.round(st.legitimacy * 100)}, urgency ${Math.round(st.urgency * 100)})`],
      ['Engagement', `${ENGAGEMENT[st.current - 1]} → desired ${ENGAGEMENT[st.desired - 1]}`],
      ['Satisfaction', fmtPct(st.satisfaction, 0)],
      ['Channel', `${st.channel} · ${st.frequency}`],
    ]),
    bar(st.satisfaction, st.satisfaction < 0.4 ? 'bad' : st.satisfaction > 0.65 ? 'good' : ''),
    act,
    withActions && st.lastEngaged !== null ? el('p', { class: 'pm-note', text: `Last engaged day ${st.lastEngaged} (${st.engagements} time${st.engagements === 1 ? '' : 's'}); a stakeholder can be engaged again after 14 days.` }) : null,
  ], { cls: 'accent' });
}

/* --------------------------------------------------------------- register */

function register(dash, pane, p, s, v) {
  const items = v.map((x) => ({ id: x.id, label: x.short, power: x.power, interest: x.interest, gap: x.gap, quadrant: x.quad }));
  const st = p.stakeholderById.get(s.sel);
  pane.appendChild(el('div', { class: 'pm-grid c2', style: { alignItems: 'start' } }, [
    card('Power / interest grid', [
      chartBox(powerInterestGrid(items, { selected: s.sel, onSelect: (id) => { s.sel = id; dash.rerender(); } }), { minWidth: 420, caption: 'Dot colour shows the engagement gap: green = at desired level, amber = one level short, red = two or more. Click a dot for details.' }),
    ]),
    detailCard(dash, p, st),
  ]));
  pane.appendChild(section('Stakeholder register'));
  pane.appendChild(table([
    { key: 'id', label: 'ID' }, { key: 'short', label: 'Stakeholder' }, { key: 'group', label: 'Group' },
    { key: 'power', label: 'Power', num: true, format: (x) => Math.round(x * 100) },
    { key: 'interest', label: 'Interest', num: true, format: (x) => Math.round(x * 100) },
    { key: 'quad', label: 'Strategy', format: (x) => pill(x, STATUS_CLS[x]) },
    { key: 'sal', label: 'Salience' },
    { key: 'current', label: 'Engagement', format: (x, r) => `${ENGAGEMENT[x - 1]} → ${ENGAGEMENT[r.desired - 1]}` },
    { key: 'satisfaction', label: 'Satisfaction', num: true, format: (x) => el('div', { class: 'perf-cell' }, [bar(x, x < 0.4 ? 'bad' : x > 0.65 ? 'good' : ''), el('span', { text: fmtPct(x, 0) })]) },
  ], v, { dense: true, sortable: true, onRow: (r) => { s.sel = r.id; dash.rerender(); }, selected: (r) => r.id === s.sel }));
}

/* --------------------------------------------------------------- salience */

function salienceTab(dash, pane, p, s, v) {
  const groups = {};
  for (const x of v) (groups[x.sal] = groups[x.sal] || []).push(x.id);
  const st = p.stakeholderById.get(s.sel);
  pane.appendChild(el('div', { class: 'pm-grid c2', style: { alignItems: 'start' } }, [
    card('Salience model (power · legitimacy · urgency)', [
      chartBox(salienceVenn(groups, { selected: s.sel, onSelect: (id) => { s.sel = id; dash.rerender(); } }), { minWidth: 380, caption: 'A stakeholder holding all three attributes is Definitive and demands immediate attention. Numbers are stakeholder IDs.' }),
    ]),
    detailCard(dash, p, st),
  ]));
  pane.appendChild(table([
    { key: 'sal', label: 'Class', format: (x) => pill(x, x === 'Definitive' ? 'bad' : x === 'Dominant' || x === 'Dangerous' ? 'warn' : 'muted') },
    { key: 'meaning', label: 'Holds' },
    { key: 'who', label: 'Stakeholders' },
  ], [
    ['Definitive', 'Power + legitimacy + urgency', ''], ['Dominant', 'Power + legitimacy', ''], ['Dangerous', 'Power + urgency', ''], ['Dependent', 'Legitimacy + urgency', ''],
    ['Dormant', 'Power only', ''], ['Discretionary', 'Legitimacy only', ''], ['Demanding', 'Urgency only', ''], ['Non-stakeholder', 'None', ''],
  ].map(([sal, meaning]) => ({ sal, meaning, who: (groups[sal] || []).map((id) => `${id} ${view(p).find((x) => x.id === id).short}`).join(' · ') || '—' })), { dense: true }));
}

/* ------------------------------------------------------------- engagement */

function engage(dash, pane, p, s, v) {
  const rows = v.map((x) => ({ id: x.id, label: x.short, current: x.current, desired: x.desired }));
  const st = p.stakeholderById.get(s.sel);
  pane.appendChild(card('Stakeholder engagement assessment matrix', [
    chartBox(engagementMatrix(rows, { selected: s.sel, onSelect: (id) => { s.sel = id; dash.rerender(); } }), { minWidth: 640, caption: 'C = current engagement, D = desired. A red C is short of the desired level; an arrow shows the gap to close.' }),
  ], { cls: 'flat' }));
  pane.appendChild(el('div', { class: 'pm-grid c2' }, [
    detailCard(dash, p, st, true),
    card('Choosing an engagement action', [
      el('ul', {}, ACTIONS.map((a) => el('li', {}, [el('b', { text: `${a.label}. ` }), `${a.text} PKR ${a.cost} m; reaches ${ENGAGEMENT[a.cap - 1]}.`]))),
      el('p', { class: 'pm-note', text: 'Match the action to power and interest: informing a highly powerful sponsor is too little; empowering a low-power group is a poor fit and gains little.' }),
    ], { cls: 'flat' }),
  ]));
}

/* ------------------------------------------------------------------ comms */

function comms(dash, pane, p, s) {
  if (!s.n) s.n = p.stakeholders.length + 1;
  if (!s.sent) s.sent = [];
  pane.appendChild(section('Communications management plan'));
  pane.appendChild(table([
    { key: 'audience', label: 'Audience' }, { key: 'info', label: 'Information' }, { key: 'method', label: 'Method' }, { key: 'frequency', label: 'Frequency' }, { key: 'owner', label: 'Owner' },
    { key: 'act', label: 'Distribute', format: (_, r) => button('Issue now', () => {
      s.sent.unshift({ day: p.day, audience: r.audience, info: r.info, method: r.method });
      p.log('info', `Communication issued — ${r.audience}`, `${r.info} (${r.method}), owner ${r.owner}.`);
      dash.sim.toast(`Issued to ${r.audience}`, 'good');
      dash.rerender();
    }, { small: true, kind: 'ghost' }) },
  ], p.commsPlan, { dense: true }));
  if (s.sent.length) {
    pane.appendChild(section('Information distribution log'));
    pane.appendChild(table([{ key: 'day', label: 'Day', num: true }, { key: 'audience', label: 'Audience' }, { key: 'info', label: 'Information' }, { key: 'method', label: 'Method' }], s.sent.slice(0, 8), { dense: true }));
  }
  const total = channels(s.n);
  const out = el('div', { class: 'chan-out' });
  const draw = () => {
    out.replaceChildren(
      chartBox(channelNetwork(s.n), { minWidth: 260, cls: 'chan-fig' }),
      el('div', {}, [
        el('div', { class: 'formula', text: `channels = n(n − 1) ÷ 2 = ${s.n} × ${s.n - 1} ÷ 2 = ${channels(s.n)}` }),
        el('p', { text: `Adding the next person to a team of ${s.n} adds ${s.n} new channels (${channels(s.n + 1) - channels(s.n)}). Complexity grows with the square of the group, which is why large programmes use hierarchies, a communications plan and a PMO instead of everyone talking to everyone.` }),
        el('p', { class: 'pm-note', text: `Live project: ${p.stakeholders.length} stakeholders + the project manager = n ${p.stakeholders.length + 1} → ${channels(p.stakeholders.length + 1)} channels.` }),
      ]),
    );
  };
  pane.appendChild(card('Channel calculator', [
    el('div', { class: 'pm-toolbar' }, [field('People (n)', slider(2, 40, 1, s.n, (v) => { s.n = v; draw(); }, (v) => `n = ${v}`)), button('Use live n', () => { s.n = p.stakeholders.length + 1; dash.rerender(); }, { small: true, kind: 'ghost' })]),
    out,
  ]));
  draw();
  void total;
}

/* ----------------------------------------------------------------- report */

function report(dash, pane, p, s, v) {
  const sim = dash.sim;
  let rep = null;
  try { rep = sim.ai && sim.ai.statusReport ? sim.ai.statusReport() : null; } catch { rep = null; }
  pane.appendChild(section('Expectation management', 'what each group expects and how satisfied they are'));
  pane.appendChild(el('div', { class: 'exp-grid' }, GROUPS.map((g) => card(g.title, [
    el('p', { class: 'pm-note', text: g.text }),
    ...g.ids.map((id) => {
      const x = v.find((y) => y.id === id);
      if (!x) return null;
      return el('div', { class: 'exp-row', role: 'button', tabindex: '0', onclick: () => { s.sel = id; s.tab = 'engage'; dash.rerender(); }, onkeydown: (e) => { if (e.key === 'Enter') { s.sel = id; s.tab = 'engage'; dash.rerender(); } } }, [
        el('b', { text: x.short }),
        el('span', { class: 'pm-note', text: x.needs }),
        el('div', { class: 'perf-cell' }, [bar(x.satisfaction, x.satisfaction < 0.4 ? 'bad' : x.satisfaction > 0.65 ? 'good' : ''), el('span', { text: fmtPct(x.satisfaction, 0) })]),
        pill(x.gap > 0 ? `${ENGAGEMENT[x.current - 1]} → ${ENGAGEMENT[x.desired - 1]}` : `${ENGAGEMENT[x.current - 1]} ✓`, x.gap > 1 ? 'bad' : x.gap === 1 ? 'warn' : 'ok'),
      ]);
    }),
  ], { cls: 'flat' }))));
  pane.appendChild(section('Status and performance report', 'generated from the live project'));
  const box = el('div', { class: 'report-box' });
  if (rep && rep.markdown) {
    box.appendChild(renderMarkdown(rep.markdown));
    pane.appendChild(box);
    pane.appendChild(el('div', { class: 'row' }, [
      button('Download report (Markdown)', () => sim.download(`HDD_status_report_day${p.day}.md`, 'text/markdown', rep.markdown), { icon: 'export', small: true }),
      button('Issue to the sponsor board', () => { p.log('info', 'Status report issued', 'Weekly status report distributed to the programme board and the CCB.'); sim.toast('Status report issued', 'good'); }, { small: true, kind: 'primary' }),
    ]));
  } else {
    const e = p.evm();
    box.appendChild(el('p', { text: `Day ${p.day} (${p.dateLabel()}): ${fmtPct(p.snapshot().progress, 1)} complete. SPI ${e.spi.toFixed(2)}, CPI ${e.cpi.toFixed(2)}, EAC ${(e.eac.cpi / 1e9).toFixed(2)} bn PKR. Stakeholder satisfaction ${fmtPct(p.stakeholderSatisfaction, 0)}; ${p.risks.filter((r) => r.status === 'Open').length} open risks.` }));
    pane.appendChild(box);
  }
  void C;
}
