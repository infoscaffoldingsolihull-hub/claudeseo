import { el, kpi, button, fmtPKR, fmtPct, fmtIndex, fmtDays, indexClass, humanize } from '../dom.js';

/**
 * charter — live summary panel (the shell's minimal module; the full panel is owned by A6b).
 * Shows the CLO/domain chips, a one-paragraph framing and live KPIs from project.snapshot().
 */

const NOTE = "The charter authorises the Hyderabad Airport Revival & Expansion Programme: reopen HDD to scheduled traffic with a longer runway, a new terminal and tower, within the funded budget. Live constraints are tracked against it below.";
const ITEMS = [["Budget at completion","bac","pkr"],["Baseline duration","baselineDuration","days"],["Contingency remaining","contingencyRemaining","pkr"],["Management reserve","managementRemaining","pkr"]];

function value(dash, s, key, kind) {
  const p = dash.project || {};
  const g = dash.sim.game || {};
  let v;
  if (key === '@tasks') v = (p.tasks || []).length;
  else if (key === '@resources') v = (p.resources || []).length;
  else if (key === '@stakeholders') v = (p.stakeholders || []).length;
  else if (key === '@procurement') v = (p.procurement || []).length;
  else if (key === '@missions') v = (g.missions || []).length;
  else if (key === '@approach') v = humanize(p.approach || 'hybrid');
  else if (key === '@difficulty') v = humanize(p.difficulty || 'professional');
  else if (key === '@level') v = g.levelName ? `${g.level || 1} · ${g.levelName}` : String(g.level || 1);
  else if (key === '@xp') v = g.xp || 0;
  else v = s[key];
  let text = '—';
  let cls = '';
  if (kind === 'pkr') text = fmtPKR(v);
  else if (kind === 'pct') text = fmtPct(v, 1);
  else if (kind === 'q') text = Number.isFinite(v) ? fmtPct(v > 1.5 ? v / 100 : v, 0) : '—';
  else if (kind === 'idx') { text = fmtIndex(v); cls = indexClass(v); }
  else if (kind === 'days') text = fmtDays(v);
  else if (kind === 'sdays') { text = Number.isFinite(v) ? `${v > 0 ? '+' : ''}${Math.round(v)} d` : '—'; cls = Number.isFinite(v) ? (v > 10 ? 'bad' : v > 0 ? 'warn' : 'good') : ''; }
  else if (kind === 'dayn') text = Number.isFinite(v) ? (p.dateLabel ? p.dateLabel(Math.round(v)) : `Day ${Math.round(v)}`) : '—';
  else if (kind === 'phase') text = v ? humanize(v) : '—';
  else if (kind === 'num1') text = Number.isFinite(v) ? v.toFixed(1) : '—';
  else if (kind === 'int') text = Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
  else text = v === undefined || v === null ? '—' : String(v);
  return { text, cls };
}

export const PANEL_CHARTER = {
  id: 'charter',
  render(dash, body) {
    let s = {};
    try { s = dash.project && dash.project.snapshot ? dash.project.snapshot() || {} : {}; } catch { s = {}; }
    body.appendChild(dash.tag());
    body.appendChild(el('p', { class: 'lede', text: NOTE }));
    body.appendChild(el('div', { class: 'grid c4' }, ITEMS.map(([label, key, kind]) => {
      const v = value(dash, s, key, kind);
      return kpi(label, v.text, null, v.cls);
    })));
    const actions = [
      button("Open scope & WBS", () => { dash.open('scope'); }, { icon: 'tree' }),
    ];
    if (actions.length) body.appendChild(el('div', { class: 'row actions-row' }, actions));
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge(), el('span', { class: 'muted small', text: s.dateLabel ? `As of ${s.dateLabel}` : '' })]));
  },
};
