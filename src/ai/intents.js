import { lookup, search, best, describe, glossarySize } from './glossary.js';
import { fact, hasFact } from '../core/facts.js';
import {
  readState, analyse, safe, num, arr, pct, idx, money, days, criticalPath, floatTable, scheduleDriver,
  resourceIssues, qualityIssues, riskIssues, riskEmv, bestStrategy, stakeholderGaps, findStakeholder, levelName,
  pendingChanges, agileInfo, procurementInfo, nextMilestone, crashSummary, findTask, standupText, statusReport,
  riskResponses, changeImpact, stakeholderMessage, tutorText, recentEvents, headline,
} from './rules.js';

/**
 * MEHRAN's offline intent router (pure JS — runs under node --test).
 *
 * Each intent: { id, patterns:[RegExp], answer(ctx, match), examples:[…] }.
 * `ctx` = { project, S (readState), advice() (lazy rules), mc, coaching, lastQuiz }.
 * Answers: { text (light Markdown), items?, actions?: [{kind,label,args,detail}], suggestions? }.
 * The first intent (in array order) whose pattern matches wins, so the more
 * specific intents sit above the general ones.
 */

const g = (term) => describe(lookup(term));

function list(items) {
  return items.filter(Boolean).map((s) => `- ${s}`).join('\n');
}

function evmLine(S) {
  return `SPI ${idx(S.spi)} · CPI ${idx(S.cpi)} · EV ${money(S.ev)} · PV ${money(S.pv)} · AC ${money(S.ac)}`;
}

function hasProject(ctx) {
  return arr(ctx.project && ctx.project.tasks).length > 0;
}

const NO_PROJECT = 'The project engine has not produced a schedule yet, so there are no live numbers to quote. Start a project from the Session panel and ask again.';

function factLine(key, label) {
  return hasFact(key) ? `- ${label}: ${fact(key)}` : null;
}

function adviceItems(ctx, n = 3, filter = null) {
  const a = ctx.advice().filter((x) => !filter || filter(x));
  return a.slice(0, n);
}

function actionsOf(items) {
  return items.map((a) => a.action).filter(Boolean);
}

/* --------------------------------------------------------------- intents */

export const INTENTS = [
  /* ---------- meta & ethics ---------- */
  {
    id: 'greeting',
    patterns: [/^\s*(hi|hello|hey|salaam|salam|assalam|aoa|good (morning|afternoon|evening))\b[\s!.,]*(mehran)?[\s!.]*$/i],
    examples: ['hello', 'salaam'],
    answer: (ctx) => ({ text: `Wa alaikum assalam — I'm MEHRAN, your project co-pilot. ${headline(ctx.project, ctx.S)}\n\nAsk me "why are we behind?", "biggest risk", "stand-up" or "what can you do".` }),
  },
  {
    id: 'thanks',
    patterns: [/^\s*(thanks|thank you|shukriya|cheers|great|ok(ay)?|cool|nice)\b[\s!.]*$/i],
    examples: ['thanks'],
    answer: () => ({ text: 'You are welcome. I keep watching the numbers — open the Advisor tab any time for the ranked list.' }),
  },
  {
    id: 'capabilities',
    patterns: [/\bwhat can you do\b/i, /^\s*(help|commands|menu|options)\s*[?!.]*$/i, /\bcapabilit/i, /\bhelp me use\b/i, /\bhow (can|do) (i|you) use you\b/i, /\bwhat (do|can) you know\b/i],
    examples: ['what can you do', 'help'],
    answer: () => ({
      text: `I read the live simulation and answer from it — no internet needed. Try:\n${list([
        'Diagnosis: "why are we behind?", "why over budget?", "status", "recommendations"',
        'Schedule: "critical path", "float on 3.5", "forecast finish", "crash 20 days", "what if we fast-track the terminal"',
        'Cost & EVM: "what is TCPI?", "what does SPI 0.9 mean", "EAC", "how much contingency is left"',
        'Risk & forecast: "biggest risk", "risk responses", "Monte Carlo", "weather"',
        'People: "who should I talk to?", "explain RACI", "draft a message to residents"',
        'Control: "pending changes", "impact of CR01", "raise a change for…", "quality", "NCRs"',
        'Agile & supply: "velocity", "WIP", "burndown", "procurement status", "contract types"',
        'Reports: "stand-up", "status report" (exportable), "lessons learned"',
        `Learning: "define <term>" (${glossarySize()} glossary terms), "explain why answer B is wrong", "coach me on my mission"`,
      ])}\n\nEvery action I propose waits for your approval.`,
    }),
  },
  {
    id: 'how_work',
    patterns: [/\bhow do you work\b/i, /\bare you (sure|certain|right|accurate)\b/i, /\bhow (do|can) (i|we) trust\b/i, /\bhallucinat/i, /\b(explainab|transparen)/i, /\b(ai )?ethic/i, /\bcan you be wrong\b/i, /\bwhere do (your|the) (numbers|answers) come from\b/i],
    examples: ['how do you work?', 'are you sure?'],
    answer: (ctx) => ({
      text: `I am two engines:\n${list([
        `**Offline rule engine (always on).** ${ctx.ruleCount || 'About twenty'} transparent rules read EVM, CPM, resources, control charts, the risk register, stakeholders, changes, the agile board and procurement. Every recommendation quotes the number it fired on — you can check it in the dashboard.`,
        '**Live Claude mode (optional).** If you paste your own API key in settings, a language model answers using a JSON snapshot of the simulation and is told to say "not in the data" rather than guess.',
      ])}\n\nLimits: all project figures are simulated; I can misread an unusual situation; I never change the project myself — every action opens an approval dialog and you stay accountable (human-in-the-loop). If an answer looks wrong, check the panel it cites and challenge it.`,
    }),
  },
  {
    id: 'who_are_you',
    patterns: [/\bwho are you\b/i, /\byour name\b/i, /\bwhy (are you )?(called )?mehran\b/i, /\bwhat is mehran\b/i],
    examples: ['who are you'],
    answer: () => ({ text: 'I am MEHRAN, the simulator\'s AI project-management co-pilot. The name nods to Sindh\'s river heritage — like the Indus, my job is to keep the flow of work, money and information moving. I advise; you decide.' }),
  },
  {
    id: 'privacy',
    patterns: [/\b(privacy|api key|my key|data (leave|sent|stored)|where is my key)\b/i, /\bis (it|my key|my data) (safe|secure)\b/i],
    examples: ['is my api key safe?'],
    answer: () => ({ text: `Privacy:\n${list([
      'Offline mode sends nothing anywhere; all reasoning runs in this page.',
      'Live mode is opt-in: your Anthropic API key is kept in this tab\'s sessionStorage only — never in localStorage, saves, exports or logs — and is forgotten when the tab closes (or when you press "Forget key").',
      'In live mode, your question plus a compact snapshot of the simulated project is sent to api.anthropic.com. No personal data is included unless you type it.',
    ])}` }),
  },
  {
    id: 'engine_status',
    patterns: [/\b(are you )?(online|offline|live mode|fallback)\b/i, /\bwhich (engine|model)\b/i],
    examples: ['are you online?'],
    answer: (ctx) => ({ text: `Engine status: **${ctx.status || 'offline'}**. ${ctx.status === 'live' ? 'Live Claude answers are on; if a request fails I fall back to the rule engine automatically.' : 'The offline rule engine is answering. Add your own API key in the chat settings (gear icon) to enable live mode.'}` }),
  },

  /* ---------- tutoring & coaching ---------- */
  {
    id: 'tutor',
    patterns: [/\bwhy (is|was) (answer|option|choice)?\s*\(?([a-f])\)?\b.*\bwrong\b/i, /\bexplain why (answer|option)\s*([a-f])\b/i, /\bwhy (did i get|is my answer|was i) (it )?wrong\b/i, /\bquiz\b.*\b(explain|why|help)\b/i],
    examples: ['explain why answer B is wrong'],
    answer: (ctx, m) => {
      const q = ctx.lastQuiz;
      if (!q) return { text: 'I have not seen a quiz answer yet. Answer a question in the Assess panel and press "Ask MEHRAN", or paste the question and options here and I will walk through them.' };
      const letter = m && (m[3] || m[2]);
      const chosen = letter && /^[a-f]$/i.test(letter) ? letter.toUpperCase().charCodeAt(0) - 65 : q.chosen;
      return { text: tutorText({ ...q, chosen }, (t) => best(t, 40)) };
    },
  },
  {
    id: 'coach',
    patterns: [/\b(coach|missions?|quest)\b/i, /\bwhat should i do next\b/i, /\bhow do i (win|level up|earn xp|get xp)\b/i],
    examples: ['coach me on my mission', 'what should I do next?'],
    answer: (ctx) => {
      const hints = arr(ctx.coaching);
      if (hints.length) {
        return { text: `Active missions:\n${list(hints.slice(0, 3).map((h) => `**${h.name}** — next: ${h.next || 'all objectives met'}${h.hint ? `. Hint: ${h.hint}` : ''}`))}` };
      }
      const a = adviceItems(ctx, 2, (x) => x.severity !== 'good');
      return { text: `No mission is active right now. The most valuable thing to do next:\n${list(a.map((x) => `${x.title} — ${x.recommendation}`))}`, actions: actionsOf(a) };
    },
  },

  /* ---------- whole-project views ---------- */
  {
    id: 'standup',
    patterns: [/\bstand[- ]?up\b/i, /\bdaily (brief|briefing|scrum|update)\b/i, /\bbrief me\b/i, /\bmorning (brief|report)\b/i],
    examples: ['stand-up', 'brief me'],
    answer: (ctx) => ({ text: hasProject(ctx) ? standupText(ctx.project, ctx.S, ctx.advice()) : NO_PROJECT }),
  },
  {
    id: 'status_report',
    patterns: [/\b(status|progress|weekly|sponsor|monthly) report\b/i, /\bwrite (a|the) report\b/i, /\bexport (a |the )?report\b/i, /\breport for (the )?(sponsor|board|steering)\b/i],
    examples: ['status report', 'weekly report'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const r = statusReport(ctx.project, ctx.S, ctx.advice());
      return { text: r.markdown, report: r, actions: [{ kind: 'exportReport', label: 'Export report (.md)', args: {} }] };
    },
  },
  {
    id: 'status',
    patterns: [/\bhow (are|is) (we|it|the project|things) (doing|going)\b/i, /^\s*(status|overview|summary|health check|dashboard)\s*\??\s*$/i, /\bproject (status|health)\b/i, /\boverall\b/i, /\bwhere are we\b/i],
    examples: ['how are we doing?', 'status'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const S = ctx.S;
      const a = adviceItems(ctx, 3);
      return { text: `**Day ${S.day} (${S.dateLabel}) — ${S.phase}.** ${pct(S.progress)} complete.\n${evmLine(S)}\nForecast finish day ${Math.round(S.forecastFinish)} vs baseline ${Math.round(S.baselineDuration)}; EAC ${money(S.eac)} vs BAC ${money(S.bac)}.\n\nTop items:\n${list(a.map((x) => `${x.title}`))}`, items: a, actions: actionsOf(a) };
    },
  },
  {
    id: 'recommendations',
    patterns: [/\b(recommend\w*|advice|advise|suggest(ion)?s?)\b/i, /\bwhat (should|do) (we|i) (do|focus on|fix)\b/i, /\btop (issues|priorities|actions)\b/i],
    examples: ['recommendations', 'what should we do?'],
    answer: (ctx) => {
      const a = adviceItems(ctx, 5);
      return { text: `Ranked recommendations (most severe first):\n${list(a.map((x) => `**${x.title}** — ${x.recommendation}`))}`, items: a, actions: actionsOf(a) };
    },
  },

  /* ---------- schedule ---------- */
  {
    id: 'why_behind',
    patterns: [/\bwhy (are|is) (we|it|the project)\s*(so )?(behind|late|slipping|delayed)\b/i, /\b(behind schedule|schedule slip|running late|why late|why the delay)\b/i, /\bwhat('?s| is) (causing|driving) the delay\b/i],
    examples: ['why are we behind?'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const S = ctx.S;
      const d = scheduleDriver(ctx.project, S);
      if (S.spi >= 0.98 && S.scheduleVarianceDays <= 7 && !d) {
        return { text: `We are not materially behind: SPI ${idx(S.spi)} and the forecast finish is day ${Math.round(S.forecastFinish)} vs baseline ${Math.round(S.baselineDuration)}. Keep an eye on the near-critical paths.` };
      }
      const L = [`SPI is ${idx(S.spi)} — ${pct(S.spi)} of planned value earned (SV ${money(S.sv)})${Number.isFinite(S.svt) && S.svt <= -1 ? `, about ${days(-S.svt)} of earned schedule lost` : ''}. Forecast finish day ${Math.round(S.forecastFinish)} (${S.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(S.scheduleVarianceDays)} d).`];
      if (d) L.push(`Root cause: **${d.code} ${d.name}** is on the critical path, ${pct(d.pct)} complete vs ${pct(d.expected)} planned — ${d.reason}.`);
      const rk = riskIssues(ctx.project, S);
      if (rk.occurred.length) L.push(`Realised risks: ${rk.occurred.slice(0, 3).map((r) => `${r.id} ${r.title}`).join('; ')}.`);
      if (S.weather.kind !== 'clear') L.push(`Weather: ${S.weather.label}${Number.isFinite(S.weather.workFactor) ? ` (work factor ${pct(S.weather.workFactor)})` : ''}.`);
      L.push(`Recommendation: ${d ? d.recommendation : 'compress the critical path — ask me to "crash 20 days" to see the least-cost plan.'}`);
      return { text: L.join('\n'), actions: d && d.action ? [d.action] : [] };
    },
  },
  {
    id: 'crash',
    patterns: [/\bcrash(ing)?\b[^0-9]*(\d{1,3})\s*(days?|d)?\b/i, /\b(recover|claw back|save|cut)\s*(\d{1,3})\s*days?\b/i, /\bcrash(ing)?\b/i, /\bcompress the schedule\b/i],
    examples: ['crash 20 days', 'recover 15 days'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const asked = num(m && m[2], NaN);
      const want = Number.isFinite(asked) ? Math.max(1, Math.round(asked)) : Math.max(5, Math.min(60, Math.round(ctx.S.scheduleVarianceDays) || 10));
      const c = crashSummary(ctx.project, want);
      if (!c || !c.plan.length) return { text: `I could not find crashable time on the critical path for ${days(want)}. ${g('Fast-Tracking')}` };
      const rows = c.plan.slice(0, 6).map((x) => `${x.id}${x.name ? ' ' + x.name : ''}: −${days(num(x.days, num(x.crashDays, 0)))} for ${money(num(x.cost, 0))}${Number.isFinite(num(x.slope)) ? ` (${money(num(x.slope))}/day)` : ''}`);
      return {
        text: `Least-cost crash plan for **${days(want)}** (cheapest cost slope first):\n${list(rows)}\nTotal: ${days(c.recovered)} for ${money(c.cost)}${c.shortfall > 0 ? ` — ${days(c.shortfall)} cannot be bought by crashing` : ''}. Re-check the critical path afterwards: a near-critical path may take over.`,
        actions: [{ kind: 'crash', label: `Apply crash plan (${days(c.recovered)})`, args: { days: Math.round(c.recovered) }, detail: `Crash ${c.plan.length} critical activities to recover ${days(c.recovered)} for ${money(c.cost)}.` }],
      };
    },
  },
  {
    id: 'fast_track',
    patterns: [/\bfast[- ]?track(ing)?\b(.*)/i, /\bwhat if we (overlap|run .* in parallel|parallel)\b(.*)/i],
    examples: ['what if we fast-track the terminal'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const t = findTask(ctx.project, m && m[2]) || criticalPath(ctx.project).filter((c) => c.pct < 1).map((c) => ({ id: c.id, code: c.code, name: c.name }))[0];
      if (!t) return { text: g('Fast-Tracking') };
      const cp = criticalPath(ctx.project).some((c) => c.id === t.id);
      return {
        text: `Fast-tracking **${t.code || t.id} ${t.name}** means starting it before its predecessor finishes (relaxing a discretionary FS link to SS + lag).\n${list([
          cp ? 'It is on the critical path, so any days saved shorten the project.' : 'It is NOT on the critical path — fast-tracking it saves nothing on the finish date unless its float is gone.',
          'Cost: little up front, but rework risk rises because the work starts on incomplete information.',
          'The engine will report days saved and risk added when you approve.',
        ])}`,
        actions: [{ kind: 'fastTrack', label: `Fast-track ${t.code || t.id}`, args: { id: t.id }, detail: `Overlap ${t.code || t.id} ${t.name} with its predecessor.` }],
      };
    },
  },
  {
    id: 'critical_path',
    patterns: [/\bcritical path\b/i, /\bcritical (tasks|activities)\b/i, /\bwhat('?s| is) critical\b/i, /\blongest path\b/i],
    examples: ["what's on the critical path"],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const cp = criticalPath(ctx.project);
      if (!cp.length) return { text: `The critical path has not been computed yet. ${g('Critical Path')}` };
      const open = cp.filter((c) => c.pct < 1);
      return { text: `Critical path (${cp.length} activities, ${open.length} still open):\n${list(cp.slice(0, 14).map((c) => `${c.code} ${c.name} — ${pct(c.pct)}${c.blocked ? ' · BLOCKED' : ''}`))}${cp.length > 14 ? `\n…and ${cp.length - 14} more.` : ''}\nAny day lost here moves handover (day ${Math.round(ctx.S.forecastFinish)}).` };
    },
  },
  {
    id: 'float',
    patterns: [/\b(float|slack)\b/i, /\bnear[- ]critical\b/i],
    examples: ['which tasks have float?', 'float on 3.5'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: g('Total Float') };
      const t = findTask(ctx.project, m && m.input);
      const ft = floatTable(ctx.project);
      if (t) {
        const row = ft.find((r) => r.id === t.id);
        return { text: row ? `${t.code} ${t.name}: total float ${days(row.float)}${Number.isFinite(row.freeFloat) ? `, free float ${days(row.freeFloat)}` : ''}. ${row.float <= 0 ? 'It is critical.' : row.float < 10 ? 'Near-critical — watch it.' : 'Comfortable.'}` : `${t.code} ${t.name} is complete or has no float data.` };
      }
      const near = ft.filter((r) => r.float > 0 && r.float <= 15).slice(0, 8);
      return { text: `${g('Total Float')}\n\nNear-critical activities (≤ 15 days float):\n${near.length ? list(near.map((r) => `${r.code} ${r.name} — ${days(r.float)}`)) : '- none'}` };
    },
  },
  {
    id: 'forecast_finish',
    patterns: [/\b(when will|when do) (we|it|the project) (finish|complete|be done|open|hand ?over)\b/i, /\bforecast (finish|completion|date)\b/i, /\bcompletion date\b/i, /\bhandover date\b/i, /\bfinish date\b/i],
    examples: ['forecast finish', 'when will we finish?'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const S = ctx.S;
      const L = [`Deterministic CPM forecast: **day ${Math.round(S.forecastFinish)}** vs baseline day ${Math.round(S.baselineDuration)} (${S.scheduleVarianceDays > 0 ? '+' : ''}${Math.round(S.scheduleVarianceDays)} d).`];
      const date = safe(() => ctx.project.dateLabel(Math.round(S.forecastFinish)), '');
      if (date) L.push(`That is ${date} (simulated calendar).`);
      if (S.mc) L.push(`Monte Carlo: P50 day ${Math.round(num(S.mc.finish && S.mc.finish.p50))}, P80 day ${Math.round(num(S.mc.finish && S.mc.finish.p80))}; ${pct(num(S.mc.probabilityOnTime))} chance of the baseline.`);
      else L.push('Ask "run Monte Carlo" for P50/P80 confidence dates.');
      if (Number.isFinite(S.spit)) L.push(`Earned-schedule SPI(t) ${idx(S.spit)}.`);
      return { text: L.join('\n') };
    },
  },
  {
    id: 'milestones',
    patterns: [/\bmilestones?\b/i, /\bnext (big )?(event|deadline)\b/i],
    examples: ['next milestone'],
    answer: (ctx) => {
      const ms = arr(ctx.project && ctx.project.milestones);
      if (!ms.length) return { text: g('Milestone') };
      const nx = nextMilestone(ctx.project, ctx.S);
      return { text: `${ms.length} milestones in the baseline.${nx ? ` Next: **${nx.name}** — baseline day ${Math.round(num(nx.baselineDay))}${Number.isFinite(nx.forecastDay) ? `, forecast day ${Math.round(nx.forecastDay)}` : ''}.` : ' All milestones achieved.'}\n${list(ms.slice(0, 10).map((m) => `${m.name} — day ${Math.round(num(m.baselineDay))}`))}` };
    },
  },
  {
    id: 'pert',
    patterns: [/\bpert\b/i, /\bthree[- ]point\b/i, /\bprobability of finishing (by|before) (day )?(\d+)/i, /\bchance (of|to) finish(ing)? (by|before) (day )?(\d+)/i],
    examples: ['PERT', 'probability of finishing by day 900'],
    answer: (ctx, m) => {
      const pert = ctx.project && ctx.project.pert;
      const target = num(m && (m[3] || m[5]), NaN);
      let extra = '';
      if (pert && Number.isFinite(target) && typeof pert.probabilityBy === 'function') {
        const pr = safe(() => pert.probabilityBy(target), NaN);
        if (Number.isFinite(pr)) extra = `\n\nOn the baseline network, P(finish ≤ day ${target}) ≈ **${pct(pr)}** (PERT mean ${Math.round(num(pert.mean))} d, σ ${num(pert.sigma, 0).toFixed(1)} d).`;
      } else if (pert && Number.isFinite(num(pert.mean))) {
        extra = `\n\nBaseline PERT: mean ${Math.round(num(pert.mean))} days, σ ${num(pert.sigma, 0).toFixed(1)} days on the critical path.`;
      }
      return { text: g('PERT') + extra };
    },
  },
  {
    id: 'phase',
    patterns: [/\bwhat (phase|stage) (are we|is the project|is it)\b/i, /\b(current|which) (phase|focus area|process group)\b/i, /\bgates?\b/i, /\bstage gate\b/i],
    examples: ['what phase are we in?', 'next gate'],
    answer: (ctx) => {
      const S = ctx.S;
      const gates = arr(ctx.project && ctx.project.gates);
      const nextG = gates.find((x) => x.status !== 'approved');
      return { text: `Current focus area: **${S.phase}** (day ${S.day}).${gates.length ? `\nGates: ${gates.map((x) => `${x.id} ${x.name} (${x.status})`).join(' · ')}.` : ''}${nextG ? `\nNext gate ${nextG.id}: ${arr(nextG.criteria).slice(0, 4).map((c) => (typeof c === 'string' ? c : c.text || c.name)).join('; ')}.` : ''}\n\n${g('Phase Gate')}`, actions: nextG && nextG.status === 'ready' ? [{ kind: 'approveGate', label: `Approve ${nextG.id}`, args: { id: nextG.id } }] : [] };
    },
  },
  {
    id: 'today',
    patterns: [/\bwhat (day|date) is it\b/i, /\btoday'?s date\b/i, /\bwhat day are we on\b/i],
    examples: ['what day is it?'],
    answer: (ctx) => ({ text: `Simulation day ${ctx.S.day} — ${ctx.S.dateLabel} (simulated calendar starting Mon 04 Jan 2027).` }),
  },

  /* ---------- cost / EVM ---------- */
  {
    id: 'metric_meaning',
    patterns: [/\b(spi|cpi|tcpi|spi\(t\))\s*(?:of|=|is|at|value|reading)?\s*(\d*\.\d+|\d+(?:\.\d+)?)/i],
    examples: ['what does SPI 0.9 mean', 'CPI of 1.1'],
    answer: (ctx, m) => {
      const k = m[1].toUpperCase();
      const v = num(m[2], 1);
      let text;
      if (k === 'CPI') {
        text = v < 1 ? `CPI ${v} means every PKR 1 spent earns only PKR ${v.toFixed(2)} of planned work — ${pct(1 - v)} over budget on work done. If it holds, EAC = BAC / ${v} (≈ ${pct(1 / v - 1)} overrun).` : v > 1 ? `CPI ${v} means each PKR 1 buys PKR ${v.toFixed(2)} of work — under budget for the work performed.` : 'CPI 1.0: exactly on budget for the work done.';
      } else if (k === 'TCPI') {
        text = `TCPI ${v} means the remaining work must be done at a cost efficiency of ${v} to hit the target. ${v > 1.1 ? 'Above ~1.10 that is rarely achievable — revise the EAC.' : v > 1 ? 'Tighter than the plan; achievable only with real improvement.' : 'Easier than the plan — there is headroom.'}`;
      } else {
        text = v < 1 ? `SPI ${v} means only ${pct(v)} of the work planned by now has been done — behind schedule. Roughly, every ${10} planned days are delivering ${(v * 10).toFixed(1)} days of work. SPI says nothing about the critical path, so check that too.` : v > 1 ? `SPI ${v} means ${pct(v)} of the planned work is done — ahead of schedule (check it is critical work, not easy work).` : 'SPI 1.0: on plan.';
      }
      const cur = k === 'CPI' ? ctx.S.cpi : k === 'TCPI' ? ctx.S.tcpi : ctx.S.spi;
      if (hasProject(ctx) && Number.isFinite(cur)) text += `\n\nOur live ${k} is ${idx(cur)}.`;
      return { text };
    },
  },
  {
    id: 'tcpi',
    patterns: [/\btcpi\b/i, /\bto[- ]complete performance\b/i],
    examples: ['what is TCPI?'],
    answer: (ctx) => ({ text: `${g('To-Complete Performance Index')}${hasProject(ctx) && Number.isFinite(ctx.S.tcpi) ? `\n\nLive: TCPI(BAC) = (BAC − EV) / (BAC − AC) = (${money(ctx.S.bac)} − ${money(ctx.S.ev)}) / (${money(ctx.S.bac)} − ${money(ctx.S.ac)}) = **${idx(ctx.S.tcpi)}** vs CPI to date ${idx(ctx.S.cpi)}.` : ''}` }),
  },
  {
    id: 'spi',
    patterns: [/\b(what('?s| is) (our|the) )?spi\b/i, /\bschedule performance\b/i],
    examples: ['what is our SPI?'],
    answer: (ctx) => ({ text: `${g('Schedule Performance Index')}${hasProject(ctx) ? `\n\nLive: SPI = EV / PV = ${money(ctx.S.ev)} / ${money(ctx.S.pv)} = **${idx(ctx.S.spi)}**.` : ''}` }),
  },
  {
    id: 'cpi',
    patterns: [/\bcpi\b/i, /\bcost performance\b/i],
    examples: ['what is our CPI?'],
    answer: (ctx) => ({ text: `${g('Cost Performance Index')}${hasProject(ctx) ? `\n\nLive: CPI = EV / AC = ${money(ctx.S.ev)} / ${money(ctx.S.ac)} = **${idx(ctx.S.cpi)}**.` : ''}` }),
  },
  {
    id: 'why_over_budget',
    patterns: [/\bwhy (are we|is it|is the project) (over|above) budget\b/i, /\b(over ?budget|overspend|cost overrun|overrun)\b/i, /\bwhere is the money going\b/i],
    examples: ['why are we over budget?'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const S = ctx.S;
      const res = resourceIssues(ctx.project);
      const q = qualityIssues(ctx.project);
      const L = [`CPI ${idx(S.cpi)}: AC ${money(S.ac)} for EV ${money(S.ev)} (CV ${money(S.cv)}). EAC ${money(S.eac)}, VAC ${money(S.vac)}.`];
      if (S.cpi >= 0.98) L[0] += ' We are essentially on budget for the work done.';
      if (res.idle.length) L.push(`Idle capacity: ${res.idle.slice(0, 3).map((r) => `${r.name} +${Math.round(r.excess)} ${r.unit} (${money(r.waste)}/day)`).join('; ')}.`);
      const coq = q.coq || {};
      if (num(coq.internalFailure, 0) + num(coq.externalFailure, 0) > 0) L.push(`Failure cost of quality: ${money(num(coq.internalFailure, 0) + num(coq.externalFailure, 0))} (rework and defects).`);
      const rk = riskIssues(ctx.project, S);
      if (rk.occurred.length) L.push(`Realised risks: ${rk.occurred.length} (${rk.occurred.slice(0, 3).map((r) => r.id).join(', ')}).`);
      const a = adviceItems(ctx, 1, (x) => x.id === 'cost');
      return { text: L.join('\n'), actions: actionsOf(a) };
    },
  },
  {
    id: 'eac',
    patterns: [/\beac\b/i, /\bestimate at completion\b/i, /\bfinal cost\b/i, /\bhow much will (it|the project) cost\b/i, /\bvac\b/i, /^\s*etc\s*\??$/i, /\bestimate to complete\b/i, /\bvariance at completion\b/i],
    examples: ['EAC', 'how much will it cost?'],
    answer: (ctx) => {
      const S = ctx.S;
      const evm = safe(() => ctx.project.evm(), {}) || {};
      const e = evm.eac && typeof evm.eac === 'object' ? evm.eac : null;
      const rows = e ? [`Typical (BAC/CPI): ${money(num(e.cpi))}`, `Atypical (AC + BAC − EV): ${money(num(e.atBudget))}`, `Composite (CPI×SPI): ${money(num(e.composite))}`, Number.isFinite(num(e.bottomUp)) ? `Bottom-up: ${money(num(e.bottomUp))}` : null] : [];
      return { text: `${hasProject(ctx) ? `EAC **${money(S.eac)}** vs BAC ${money(S.bac)} → VAC ${money(S.vac)}; ETC ${money(S.etc)}.\n${rows.length ? list(rows) + '\n' : ''}` : ''}\n${g('Estimate at Completion')}` };
    },
  },
  {
    id: 'evm',
    patterns: [/\bearned value\b/i, /\bevm\b/i, /\b(pv|ev|ac)\b.*\b(pv|ev|ac)\b/i, /\bplanned value\b/i, /\bactual cost\b/i, /\bs[- ]curve\b/i],
    examples: ['earned value summary'],
    answer: (ctx) => ({ text: `${hasProject(ctx) ? `Live EVM (day ${ctx.S.day}): ${evmLine(ctx.S)}\nSV ${money(ctx.S.sv)} · CV ${money(ctx.S.cv)} · EAC ${money(ctx.S.eac)} · TCPI ${idx(ctx.S.tcpi)}\n\n` : ''}${g('Earned Value Management')}` }),
  },
  {
    id: 'formulas',
    patterns: [/\bformula(s|e)?\b/i, /\bcheat ?sheet\b/i],
    examples: ['formula cheat sheet'],
    answer: () => ({ text: `EVM cheat sheet:\n${list(['SV = EV − PV · CV = EV − AC', 'SPI = EV / PV · CPI = EV / AC', 'EAC = BAC / CPI (typical) · AC + (BAC − EV) (atypical) · AC + (BAC − EV)/(CPI × SPI)', 'ETC = EAC − AC · VAC = BAC − EAC', 'TCPI = (BAC − EV) / (BAC − AC)', 'PERT tE = (O + 4M + P)/6 · σ = (P − O)/6', 'TF = LS − ES · channels = n(n − 1)/2', 'EMV = P × impact'])}` }),
  },
  {
    id: 'contingency',
    patterns: [/\bcontingency\b/i, /\breserves?\b/i, /\bhow much (money|budget) (is )?left\b/i],
    examples: ['how much contingency is left'],
    answer: (ctx) => {
      const S = ctx.S;
      if (!Number.isFinite(S.contingencyRemaining) && !Number.isFinite(S.contingencyReserve)) return { text: g('Contingency Reserve') };
      const share = S.contingencyReserve > 0 ? S.contingencyRemaining / S.contingencyReserve : NaN;
      return { text: `Contingency reserve: **${money(S.contingencyRemaining)}** left of ${money(S.contingencyReserve)}${Number.isFinite(share) ? ` (${pct(share)})` : ''}, at ${pct(S.progress)} complete. ${S.realisedRisks || 0} risks have occurred.\nManagement reserve (sponsor-held): ${money(S.managementRemaining)}${S.managementReserve > 0 ? ` of ${money(S.managementReserve)}` : ''}.\nOpen risk exposure (Σ EMV of threats): ${money(riskIssues(ctx.project, S).exposure)}.${Number.isFinite(share) && share < 0.3 ? '\n\nThis is low — escalate before it runs out.' : ''}` };
    },
  },
  {
    id: 'funding',
    patterns: [/\bfunding (limits?|status|profile)\b/i, /\bcash ?flow\b/i, /\bbudget (limit|ceiling)s?\b/i],
    examples: ['funding limits'],
    answer: (ctx) => {
      const f = arr(ctx.project && ctx.project.fundingLimits);
      return { text: `${f.length ? `Annual funding limits (simulated):\n${list(f.map((x) => `${x.year}: ${money(num(x.limit))}`))}\nBudget burn so far: ${pct(ctx.S.budgetBurn)} of BAC.\n\n` : ''}${g('Funding Limit Reconciliation')}` };
    },
  },

  /* ---------- resources & team ---------- */
  {
    id: 'what_if_staff',
    patterns: [/\b(what if we )?(add|hire|bring in|increase|raise|reduce|cut|release|remove)\s+(\d+)\s+([a-z ]+?)(\s+(crews?|workers?|staff|people|units?))?\s*\??$/i],
    examples: ['what if we add 50 civil workers'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const n = num(m[3], 0);
      const down = /reduce|cut|release|remove/i.test(m[2]);
      const name = String(m[4] || '').toLowerCase();
      const rows = resourceIssues(ctx.project).rows;
      const r = rows.find((x) => name.split(' ').some((w) => w.length > 2 && `${x.name} ${x.id}`.toLowerCase().includes(w.replace(/s$/, ''))));
      if (!r) return { text: `I could not match "${m[4]}" to a resource pool. Pools: ${rows.map((x) => x.name).join(', ')}.` };
      const target = Math.max(0, Math.round(r.assigned + (down ? -n : n)));
      const capped = Math.min(target, Number.isFinite(r.capacity) ? r.capacity : target);
      const L = [`${r.name}: ${Math.round(r.assigned)} assigned, demand ${Math.round(r.required)}, capacity ${Number.isFinite(r.capacity) ? Math.round(r.capacity) : '—'}.`];
      if (!down && r.assigned >= r.required) L.push(`Adding ${n} would mostly create idle time (${money(n * r.dayRate)}/day) — demand is already covered. Brooks's law applies on crowded work faces.`);
      else if (!down) L.push(`Raising to ${capped} closes ${pct(Math.min(1, (capped - r.assigned) / Math.max(1, r.required - r.assigned)))} of the shortfall for about ${money((capped - r.assigned) * r.dayRate)}/day.`);
      else L.push(`Cutting to ${capped} saves ${money((r.assigned - capped) * r.dayRate)}/day${capped < r.required ? ' but starves the pool below demand — expect slower progress' : ' with no loss of output'}.`);
      return { text: L.join('\n'), actions: [{ kind: 'staffing', label: `Set ${r.name} to ${capped}`, args: { resId: r.id, n: capped }, detail: `Change ${r.name} from ${Math.round(r.assigned)} to ${capped}.` }] };
    },
  },
  {
    id: 'resources',
    patterns: [/\b(our|resource|the) (resources|pools|utili[sz]ation|histogram)\b/i, /^\s*resources\s*\??$/i, /\bover[- ]?allocat/i, /\butili[sz]ation\b/i, /\bwho is (overloaded|idle)\b/i, /\bstaffing\b/i, /\bworkforce\b/i, /\bidle (labou?r|crews?|workers)\b/i],
    examples: ['resource utilisation', 'who is overloaded?'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: g('Over-allocation') };
      const r = resourceIssues(ctx.project);
      const L = [`${r.rows.length} resource pools.`];
      if (r.overCapacity.length) L.push(`Over capacity: ${r.overCapacity.map((x) => `${x.name} (${Math.round(x.required)}/${Math.round(x.capacity)})`).join(', ')}.`);
      if (r.starved.length) L.push(`Short of demand: ${r.starved.slice(0, 4).map((x) => `${x.name} ${Math.round(x.assigned)}/${Math.round(x.required)}`).join(', ')}.`);
      if (r.idle.length) L.push(`Idle: ${r.idle.slice(0, 4).map((x) => `${x.name} +${Math.round(x.excess)} (${money(x.waste)}/day)`).join(', ')}.`);
      if (L.length === 1) L.push('Supply matches demand across all pools.');
      const acts = [];
      if (r.overCapacity.length) acts.push({ kind: 'level', label: 'Level resources', args: {} });
      if (r.idle[0]) acts.push({ kind: 'staffing', label: `Set ${r.idle[0].name} to ${Math.ceil(r.idle[0].required * 1.05)}`, args: { resId: r.idle[0].id, n: Math.ceil(r.idle[0].required * 1.05) } });
      return { text: L.join('\n'), actions: acts };
    },
  },
  {
    id: 'level',
    patterns: [/\blevel(l)?(ing)? (the )?resources\b/i, /\bresource level(l)?ing\b/i, /\bsmooth(ing)?\b/i],
    examples: ['level resources'],
    answer: () => ({ text: `${g('Resource Levelling')}\n\n${g('Resource Smoothing')}`, actions: [{ kind: 'level', label: 'Level resources now', args: {}, detail: 'Run resource levelling across all pools (may move non-critical dates).' }] }),
  },
  {
    id: 'raci',
    patterns: [/\braci\b/i, /\bresponsib(le|ility) (matrix|assignment)\b/i, /\bwho is (accountable|responsible)\b/i],
    examples: ['explain RACI', 'who is accountable for the runway?'],
    answer: (ctx, m) => {
      const raci = ctx.project && ctx.project.raci;
      let live = '';
      if (raci && arr(raci.rows).length) {
        const q = String(m.input || '').toLowerCase();
        const row = arr(raci.rows).find((r) => q.split(/\W+/).some((w) => w.length > 3 && String(r.deliverable).toLowerCase().includes(w))) || arr(raci.rows)[0];
        const cells = Object.entries(row.cells || {}).filter(([, v]) => v);
        live = `\n\nExample from our matrix — **${row.deliverable}**: ${cells.map(([role, v]) => `${v} = ${role}`).join(' · ')}.`;
        const a = cells.filter(([, v]) => v === 'A').length;
        if (a !== 1) live += ` ⚠ This row has ${a} "A"s; there should be exactly one.`;
      }
      return { text: g('RACI Matrix') + live };
    },
  },
  {
    id: 'team',
    patterns: [/\btuckman\b/i, /\b(forming|storming|norming|performing)\b/i, /\bteam (development|stage|morale|building)\b/i, /\bwelfare\b/i],
    examples: ['what stage is the team in (Tuckman)?'],
    answer: (ctx) => {
      const d = ctx.S.day;
      const stage = d < 60 ? 'forming' : d < 180 ? 'storming' : d < 360 ? 'norming' : ctx.S.finished ? 'adjourning' : 'performing';
      return { text: `${g('Tuckman Model')}\n\nBy elapsed time (day ${d}) the core team would typically be **${stage}** — a heuristic, not a measurement.${Number.isFinite(ctx.S.welfare) ? ` Welfare index ${pct(ctx.S.welfare)}.` : ''}` };
    },
  },
  {
    id: 'safety',
    patterns: [/\bsafety (record|index|status|performance)\b/i, /^\s*safety\s*\??$/i, /\bincidents?\b/i, /\baccidents?\b/i, /\bhse\b/i, /\binjur/i, /\bhow safe\b/i],
    examples: ['safety record'],
    answer: (ctx) => ({ text: `${Number.isFinite(ctx.S.safety) ? `Safety index **${pct(ctx.S.safety)}**` : 'Safety index not reported yet'}${Number.isFinite(ctx.S.incidents) ? `, ${ctx.S.incidents} incident(s)` : ''}${Number.isFinite(ctx.S.welfare) ? `, welfare ${pct(ctx.S.welfare)}` : ''}.\nAirside works need a method of working plan, FOD sweeps, haul-route separation and crane clearance from the obstacle limitation surfaces.\n\n${g('Safety Management System')}` }),
  },

  /* ---------- risk ---------- */
  {
    id: 'biggest_risk',
    patterns: [/\b(biggest|largest|top|worst|main|greatest) (risk|threat)s?\b/i, /\bwhat('?s| is) the (biggest|main) (risk|threat)\b/i, /\brisk(s)? (should|must) (i|we) worry\b/i],
    examples: ['biggest risk'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const rk = riskIssues(ctx.project, ctx.S);
      const r = rk.threats[0];
      if (!r) return { text: 'No open threats in the register.' };
      const strat = bestStrategy(r);
      return {
        text: `**${r.id} — ${r.title}** (${r.category || 'risk'})\nP ${pct(num(r.probability, 0))} × impact ${money(num(r.costImpact, 0))}${num(r.daysImpact, 0) ? ` and ${days(r.daysImpact)}` : ''} → EMV ${money(riskEmv(r))}${Number.isFinite(num(r.score)) ? `, score ${r.score}` : ''}.\nOwner: ${r.owner || '—'} · trigger: ${String(r.trigger || '—').replace(/\.$/, '')} · current response: ${r.response || 'none'}.\nRecommended: **${strat}**.\n\nNext largest: ${rk.threats.slice(1, 4).map((x) => `${x.id} ${x.title} (${money(riskEmv(x))})`).join('; ') || 'none'}.`,
        actions: r.response !== strat ? [{ kind: 'risk', label: `${strat} ${r.id}`, args: { riskId: r.id, strategy: strat }, detail: `Set the response for ${r.id} to ${strat}.` }] : [],
      };
    },
  },
  {
    id: 'risk_responses',
    patterns: [/\brisk responses?\b/i, /\bhow (should|do) (we|i) (respond|treat|handle)\b.*\brisk/i, /\b(respond|response) to (r\d{2})\b/i, /\b(mitigate|transfer|avoid|accept|escalate|exploit|enhance)\s+(r\d{2})\b/i],
    examples: ['risk responses', 'mitigate R03'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: g('Risk Response Strategy') };
      const id = String(m.input).match(/\br\d{2}\b/i);
      const verb = String(m.input).match(/\b(mitigate|transfer|avoid|accept|escalate|exploit|enhance|share)\b/i);
      const rr = riskResponses(ctx.project, ctx.S);
      if (id) {
        const r = arr(ctx.project.risks).find((x) => String(x.id).toLowerCase() === id[0].toLowerCase());
        if (r) {
          const strat = verb ? verb[1].charAt(0).toUpperCase() + verb[1].slice(1).toLowerCase() : bestStrategy(r);
          const row = rr.find((x) => x.id === r.id);
          return { text: `**${r.id} ${r.title}** — current response ${r.response || 'none'}; ${strat} it: ${row ? row.rationale : ''}`, actions: [{ kind: 'risk', label: `${strat} ${r.id}`, args: { riskId: r.id, strategy: strat }, detail: `Set ${r.id}'s response to ${strat}.` }] };
        }
      }
      return { text: `Recommended responses for the top open risks:\n${list(rr.slice(0, 6).map((x) => `${x.id} ${x.title} — EMV ${money(x.emv)}; current ${x.current}, recommend **${x.recommended}**: ${x.rationale}`))}`, actions: rr.filter((x) => x.current !== x.recommended).slice(0, 2).map((x) => ({ kind: 'risk', label: `${x.recommended} ${x.id}`, args: { riskId: x.id, strategy: x.recommended } })) };
    },
  },
  {
    id: 'risks',
    patterns: [/\brisk (register|exposure|profile|summary|status|score)s?\b/i, /\bhow many risks\b/i, /\b(open|our|current|realised|realized) risks\b/i, /^\s*risks?\s*\??$/i],
    examples: ['risk register summary'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: g('Risk Register') };
      const rk = riskIssues(ctx.project, ctx.S);
      return { text: `Risk register: ${rk.risks.length} risks — ${rk.open.length} open (${rk.threats.length} threats, ${rk.opportunities.length} opportunities), ${rk.occurred.length} occurred.\nThreat exposure (Σ EMV): ${money(rk.exposure)}; contingency left ${money(ctx.S.contingencyRemaining)}.\nTop 3: ${rk.threats.slice(0, 3).map((r) => `${r.id} ${r.title} (${money(riskEmv(r))})`).join('; ') || '—'}.${rk.opportunities[0] ? `\nBest opportunity: ${rk.opportunities[0].id} ${rk.opportunities[0].title} (+${money(riskEmv(rk.opportunities[0]))}).` : ''}` };
    },
  },
  {
    id: 'weather',
    patterns: [/\bweather\b/i, /\b(dust|sand) ?storm\b/i, /\b(monsoon|rain|heat ?wave|fog|haze)\b/i, /\bclimate\b/i],
    examples: ['weather impact'],
    answer: (ctx) => {
      const S = ctx.S;
      const rk = riskIssues(ctx.project, S);
      const linked = arr(ctx.project && ctx.project.risks).filter((r) => r.weather);
      const climate = hasFact('airport.climate') ? `Real-world context: ${fact('airport.climate')}.` : '';
      return { text: `Site weather (simulated): **${S.weather.label}**${Number.isFinite(S.weather.intensity) ? `, intensity ${pct(S.weather.intensity)}` : ''}${Number.isFinite(S.weather.workFactor) ? `, work factor ${pct(S.weather.workFactor)}` : ''}.\n${rk.weatherLinked.length ? `Triggered risks: ${rk.weatherLinked.map((r) => `${r.id} ${r.title}`).join('; ')}.` : 'No weather-triggered risk is active.'}\n${linked.length ? `Weather-linked risks in the register: ${linked.map((r) => `${r.id} (${r.weather})`).join(', ')}.` : ''}\n${climate}`.trim() };
    },
  },
  {
    id: 'monte_carlo',
    patterns: [/\bmonte ?carlo\b/i, /\bp(50|80|90)\b/i, /\bprobabilit(y|ies) (of|on) (time|finishing)\b/i, /\bconfidence (level|date)\b/i, /\bhow (likely|confident)\b/i, /\bchance (of|to) (finish|meet|hit)/i, /\bsimulat(e|ion) the schedule\b/i],
    examples: ['Monte Carlo', 'P80 date'],
    answer: (ctx) => {
      const mc = ctx.S.mc;
      if (!mc) return { text: `No Monte Carlo run is cached for today. ${ctx.canRunMonteCarlo ? 'Press the button to run one (≈ a few seconds); I will quote P50/P80 afterwards.' : 'Open the Forecast panel to run one.'}\n\n${g('Monte Carlo Simulation')}`, actions: [{ kind: 'montecarlo', label: 'Run Monte Carlo', args: {} }] };
      const f = mc.finish || {};
      const t = arr(mc.tornado).slice(0, 3);
      return { text: `Monte Carlo (${num(mc.iterations, 0).toLocaleString('en-US')} iterations, day ${num(mc.day, ctx.S.day)}):\n${list([`P10 day ${Math.round(num(f.p10))} · **P50 day ${Math.round(num(f.p50))}** · **P80 day ${Math.round(num(f.p80))}** · P90 day ${Math.round(num(f.p90))}`, `Baseline day ${Math.round(num(mc.baselineDuration, ctx.S.baselineDuration))}: ${pct(num(mc.probabilityOnTime))} chance of meeting it`, Number.isFinite(num(mc.probabilityOnBudget)) ? `${pct(num(mc.probabilityOnBudget))} chance of finishing within BAC` : null, mc.cost && Number.isFinite(num(mc.cost.p80)) ? `Cost P50 ${money(num(mc.cost.p50))} · P80 ${money(num(mc.cost.p80))}` : null, t.length ? `Biggest drivers (tornado): ${t.map((x) => `${x.code || x.id} r=${num(x.correlation, 0).toFixed(2)}`).join(', ')}` : null])}\nCommit externally to P80; manage the team to P50.` };
    },
  },
  {
    id: 'decision_tree',
    patterns: [/\bdecision tree\b/i, /\bemv\b/i, /\bexpected monetary\b/i],
    examples: ['what is EMV?'],
    answer: (ctx) => {
      const rk = hasProject(ctx) ? riskIssues(ctx.project, ctx.S) : null;
      return { text: `${g('Expected Monetary Value')}${rk && rk.threats[0] ? `\n\nExample from our register: ${rk.threats[0].id} — ${pct(num(rk.threats[0].probability, 0))} × ${money(num(rk.threats[0].costImpact, 0))} = ${money(riskEmv(rk.threats[0]))}.` : ''}\n\n${g('Decision Tree')}` };
    },
  },

  /* ---------- quality ---------- */
  {
    id: 'control_chart',
    patterns: [/\bcontrol charts?\b/i, /\bwestern electric\b/i, /\b(special|common) cause\b/i, /\bout of control\b/i, /\brule of seven\b/i],
    examples: ['control chart violations'],
    answer: (ctx) => {
      const q = qualityIssues(ctx.project);
      const rows = q.metrics.filter((m) => m.n > 0).map((m) => `${m.name}: latest ${num(m.latest).toFixed(2)} ${m.unit}, centre ${num(m.cl).toFixed(2)}, σ ${num(m.sigma).toFixed(2)} — ${m.hits.length ? `**rule ${m.hits.map((h) => h.rule).join(', ')}** (${m.hits[0].text})` : 'in control'}`);
      return { text: `${rows.length ? `Live control charts:\n${list(rows)}\n\n` : ''}${g('Western Electric Rules')}` };
    },
  },
  {
    id: 'pareto',
    patterns: [/\bpareto\b/i, /\b80\/20\b/i, /\bdefects?\b/i],
    examples: ['defect Pareto'],
    answer: (ctx) => {
      const q = qualityIssues(ctx.project);
      const total = q.defects.reduce((a, d) => a + d.count, 0);
      return { text: `${total ? `Defects by category (${total} total):\n${list(q.defects.slice(0, 6).map((d) => `${d.category}: ${d.count} (${pct(d.count / total)})`))}\nVital few (≈80%): ${q.vitalFew.map((d) => d.category).join(', ')}.\n\n` : ''}${g('Pareto Chart')}` };
    },
  },
  {
    id: 'fishbone',
    patterns: [/\bfishbone\b/i, /\bishikawa\b/i, /\broot cause\b/i, /\b5 whys|five whys\b/i],
    examples: ['fishbone'],
    answer: () => ({ text: `${g('Fishbone Diagram')}\n\nFor pavement defects on this site the usual bones are: Materials (bitumen grade, aggregate moisture), Methods (laying temperature, roller passes), Machines (paver screed), People (crew experience, night shifts), Measurement (nuclear gauge calibration), Environment (heat, dust, rain).` }),
  },
  {
    id: 'coq',
    patterns: [/\bcost of (poor )?quality\b/i, /\bcoq\b/i, /\bprevention (vs|versus|and) appraisal\b/i, /\binspection level\b/i],
    examples: ['cost of quality'],
    answer: (ctx) => {
      const c = qualityIssues(ctx.project).coq || {};
      const vals = ['prevention', 'appraisal', 'internalFailure', 'externalFailure'].map((k) => [k, num(c[k], NaN)]);
      const has = vals.some(([, v]) => Number.isFinite(v));
      return { text: `${has ? `Live cost of quality: ${vals.map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${money(v)}`).join(' · ')}. Inspection level ${qualityIssues(ctx.project).inspectionLevel.toFixed(2)}.\n\n` : ''}${g('Cost of Quality')}` };
    },
  },
  {
    id: 'quality',
    patterns: [/\bquality (status|index|report|issues|problems|so far)\b/i, /^\s*quality\s*\??$/i, /\bhow is (the |our )?quality\b/i, /\b(open|our|how many) ncrs?\b/i, /^\s*ncrs?\s*\??$/i, /\brework\b/i],
    examples: ['quality status', 'open NCRs'],
    answer: (ctx) => {
      const q = qualityIssues(ctx.project);
      const sig = q.metrics.filter((m) => m.hits.length);
      const a = adviceItems(ctx, 1, (x) => x.id === 'quality');
      return { text: `Quality index ${Number.isFinite(ctx.S.qualityIndex) ? pct(ctx.S.qualityIndex) : '—'} · open NCRs ${q.openNcrs.length} of ${q.ncrs.length} · inspection level ${q.inspectionLevel.toFixed(2)}.\n${sig.length ? `Control-chart signals: ${sig.map((m) => `${m.name} (rule ${m.hits[0].rule})`).join(', ')}.` : 'All tracked metrics are in statistical control.'}${q.vitalFew.length ? `\nVital-few defect categories: ${q.vitalFew.map((d) => d.category).join(', ')}.` : ''}`, actions: actionsOf(a) };
    },
  },

  /* ---------- stakeholders & comms ---------- */
  {
    id: 'draft_message',
    patterns: [/\b(draft|write|prepare|compose)\b.*\b(message|letter|email|update|notice|note)\b.*\bto\b\s*(.*)$/i, /\b(message|letter|email) (to|for) (.+)$/i],
    examples: ['draft a message to residents'],
    answer: (ctx, m) => {
      if (!hasProject(ctx)) return { text: NO_PROJECT };
      const who = m[3] || m[0];
      const d = stakeholderMessage(ctx.project, who);
      return { text: d.to ? `**To:** ${d.to}\n**Subject:** ${d.subject}\n\n${d.body}` : d.body, actions: d.stakeholderId ? [{ kind: 'engage', label: `Log "inform" with ${d.stakeholderId}`, args: { id: d.stakeholderId, how: 'inform' }, detail: `Record that this update was sent to ${d.to}.` }] : [] };
    },
  },
  {
    id: 'stakeholder_talk',
    patterns: [/\bwho should (i|we) (talk|speak|meet|engage|call)\b/i, /\bstakeholder (gaps?|engagement|priorit)/i, /\bwho (is|are) (unhappy|resistant|upset)\b/i, /\bengage(ment)? (gap|matrix|plan)\b/i],
    examples: ['who should I talk to?'],
    answer: (ctx) => {
      if (!hasProject(ctx)) return { text: g('Stakeholder Engagement Assessment Matrix') };
      const gaps = stakeholderGaps(ctx.project).filter((x) => x.gap > 0);
      if (!gaps.length) return { text: 'Every stakeholder is at or above the desired engagement level. Keep the communication plan cadence.' };
      return {
        text: `Talk to these first (largest engagement gap × power × interest):\n${list(gaps.slice(0, 4).map((x) => `**${x.role}** — ${levelName(x.current)} → ${levelName(x.desired)} (${x.quadrant}); ${x.action} via ${x.channel || 'meeting'}. Needs: ${String(x.needs || '—').replace(/\.$/, '')}`))}`,
        actions: gaps.slice(0, 2).map((x) => ({ kind: 'engage', label: `${x.action.charAt(0).toUpperCase() + x.action.slice(1)} ${x.id}`, args: { id: x.id, how: x.action }, detail: `Run a "${x.action}" engagement with ${x.role}.` })),
      };
    },
  },
  {
    id: 'stakeholder_map',
    patterns: [/\b(our|the|show|list|all) (power[ /-]?interest|salience)\b/i, /\bstakeholder (map|grid|register|list)\b/i, /^\s*stakeholders\s*\??$/i, /\b(our|list|all|show) stakeholders\b/i],
    examples: ['show our power/interest grid', 'stakeholders'],
    answer: (ctx) => {
      const gs = stakeholderGaps(ctx.project);
      if (!gs.length) return { text: g('Power/Interest Grid') };
      const by = {};
      for (const s of gs) (by[s.quadrant] = by[s.quadrant] || []).push(s.role.split(/[—(]/)[0].trim());
      return { text: `${gs.length} stakeholders by power/interest:\n${list(Object.entries(by).map(([k, v]) => `**${k}**: ${v.join(', ')}`))}${Number.isFinite(ctx.S.stakeholderSatisfaction) ? `\nOverall satisfaction ${pct(ctx.S.stakeholderSatisfaction)}.` : ''}` };
    },
  },
  {
    id: 'comms',
    patterns: [/\bcommunication(s)? (plan|management|channels?)\b/i, /\bcomms plan\b/i, /\bchannels?\b/i, /\bpush|pull communication\b/i],
    examples: ['communication plan'],
    answer: (ctx) => {
      const plan = arr(ctx.project && ctx.project.commsPlan);
      const n = arr(ctx.project && ctx.project.stakeholders).length;
      return { text: `${plan.length ? `Communication plan (${plan.length} lines):\n${list(plan.slice(0, 6).map((c) => `${c.audience}: ${c.info} — ${c.method}, ${c.frequency} (${c.owner})`))}\n\n` : ''}${n ? `With ${n} stakeholder groups there are ${(n * (n - 1)) / 2} potential channels — n(n − 1)/2.\n\n` : ''}${g('Communications Management Plan')}` };
    },
  },

  /* ---------- change control ---------- */
  {
    id: 'change_impact',
    patterns: [/\b(impact|effect|analysis|analyse|analyze) (of|for|on) (cr\d{2})\b/i, /\b(cr\d{2})\b.*\b(impact|effect|mean|analys)/i, /\bwhat does (cr\d{2})\b/i],
    examples: ['impact of CR01'],
    answer: (ctx, m) => {
      const id = String(m.input).match(/\bcr\d{2}\b/i);
      return { text: changeImpact(ctx.project, id ? id[0].toUpperCase() : null) };
    },
  },
  {
    id: 'raise_change',
    patterns: [/\b(raise|submit|log|create|open) (a |an )?(change( request)?|cr)\b\s*(for|to|about)?\s*(.*)$/i],
    examples: ['raise a change request for extra apron lighting'],
    answer: (ctx, m) => {
      const what = String(m[6] || '').trim().replace(/[.?!]+$/, '');
      if (!what) return { text: `Tell me what the change is, e.g. "raise a change for an extra rapid exit taxiway". ${g('Change Request')}` };
      const title = what.charAt(0).toUpperCase() + what.slice(1);
      return { text: `I can raise **"${title}"** as a change request. It will enter the log as *Raised*; the CCB analyses impact on scope, schedule, cost, quality and risk before voting. Nothing is approved by raising it.`, actions: [{ kind: 'raiseChange', label: 'Raise this change request', args: { title, description: `Raised from the MEHRAN chat on day ${ctx.S.day}: ${what}.`, raisedBy: 'Project Manager (via MEHRAN)' }, detail: `Raise change request: ${title}` }] };
    },
  },
  {
    id: 'changes',
    patterns: [/\b(pending|open|outstanding|our|any) (changes|change requests|crs)\b/i, /\bchange (log|status)\b/i, /\bccb (agenda|queue|status)\b/i, /^\s*(changes|crs?|change requests)\s*\??$/i],
    examples: ['pending change requests'],
    answer: (ctx) => {
      const all = arr(ctx.project && ctx.project.changes);
      const pend = pendingChanges(ctx.project);
      if (!all.length) return { text: `No change requests yet. ${g('Integrated Change Control')}` };
      return { text: `${all.length} change requests; ${pend.length} awaiting decision.\n${list(all.slice(-6).reverse().map((c) => `${c.id} ${c.title} — ${c.status}${c.impact && Number.isFinite(num(c.impact.cost)) ? `, ${money(num(c.impact.cost))}` : ''}${c.impact && Number.isFinite(num(c.impact.days)) ? `, ${Math.round(num(c.impact.days))} d` : ''}`))}`, actions: pend.filter((c) => c.status === 'Raised').slice(0, 1).map((c) => ({ kind: 'analyseChange', label: `Analyse ${c.id}`, args: { id: c.id } })) };
    },
  },

  /* ---------- agile ---------- */
  {
    id: 'velocity',
    patterns: [/\bvelocity\b/i, /\bstory points?\b/i, /\bhow many sprints\b/i, /\brelease (forecast|date)\b/i],
    examples: ['agile velocity'],
    answer: (ctx) => {
      const a = agileInfo(ctx.project);
      if (!a.hasAgile) return { text: g('Velocity') };
      if (!a.velocities.length) {
        const pv = num(ctx.project.agile && ctx.project.agile.plannedVelocity, NaN);
        return { text: `No sprint has finished yet, so there is no measured velocity.${Number.isFinite(pv) ? ` The plan assumes about ${pv.toFixed(1)} points per ${a.sprintLength}-day sprint.` : ''} Backlog: ${a.pointsLeft} points.\n\n${g('Velocity')}` };
      }
      return { text: `Velocity by sprint: ${a.velocities.join(', ') || '—'} points. 3-sprint average **${Number.isFinite(a.avg) ? a.avg.toFixed(1) : '—'}**${a.trend ? ` (last change ${a.trend > 0 ? '+' : ''}${a.trend})` : ''}.\nBacklog remaining ${a.pointsLeft} points (${a.pointsDone} done)${Number.isFinite(a.sprintsLeft) ? ` → about ${a.sprintsLeft} more sprints of ${a.sprintLength} days` : ''}.\nUse the average, never the best sprint, to forecast.` };
    },
  },
  {
    id: 'wip',
    patterns: [/\bwip\b/i, /\bwork in progress\b/i, /\bkanban\b/i, /\blittle'?s law\b/i],
    examples: ['WIP limits'],
    answer: (ctx) => {
      const a = agileInfo(ctx.project);
      return { text: `${a.hasAgile ? `Board: ${Object.entries(a.by).map(([k, v]) => `${k} ${v}`).join(' · ')}. Limits: ${Object.entries(a.limits).map(([k, v]) => `${k} ≤ ${v}`).join(', ') || '—'}. ${a.breaches.length ? `**Breach:** ${a.breaches.map((b) => `${b.status} ${b.count}/${b.limit}`).join(', ')}.` : 'No WIP breach.'}\n\n` : ''}${g('WIP Limit')}` };
    },
  },
  {
    id: 'burndown',
    patterns: [/\bburn ?(down|up)\b/i, /\bsprint (goal|status|progress)\b/i, /\b(current|this|last) sprint\b/i, /^\s*sprints?\s*\??$/i],
    examples: ['sprint burndown'],
    answer: (ctx) => {
      const a = agileInfo(ctx.project);
      if (!a.hasAgile) return { text: g('Burndown Chart') };
      const s = a.sprint;
      const last = a.burndown.filter((b) => Number.isFinite(num(b.remaining))).pop();
      return { text: `${s ? `Sprint ${s.n}${s.goal ? ` — goal: ${s.goal}` : ''}; committed ${num(s.committed, 0)} pts, completed ${num(s.completed, 0)}.` : 'No sprint active.'}${last ? `\nBurndown: ${num(last.remaining).toFixed(0)} points remaining vs ideal ${num(last.ideal).toFixed(0)} — ${a.burndownGap > 0.5 ? 'behind the ideal line' : 'on or ahead of the ideal line'}.` : ''}` };
    },
  },
  {
    id: 'backlog',
    patterns: [/\b(our|the|product) backlog\b/i, /^\s*backlog\s*\??$/i, /\b(top|open|our) (user )?stories\b/i],
    examples: ['product backlog'],
    answer: (ctx) => {
      const a = agileInfo(ctx.project);
      if (!a.hasAgile) return { text: g('Product Backlog') };
      const top = a.backlog.filter((s) => s.status !== 'done').sort((x, y) => num(x.priority, 99) - num(y.priority, 99)).slice(0, 5);
      return { text: `${a.backlog.length} stories, ${a.pointsLeft} points open. Top of the backlog:\n${list(top.map((s) => `${s.id} ${s.title} — ${s.points} pts (${s.status})`))}` };
    },
  },
  {
    id: 'approach',
    patterns: [/\b(predictive|agile|hybrid|waterfall) (vs|versus|or)\b/i, /\bwhich (delivery )?approach\b/i, /\b(our|the) approach\b/i, /\bwhy hybrid\b/i],
    examples: ['predictive vs agile', 'which approach are we using?'],
    answer: (ctx) => ({ text: `This project runs a **${ctx.S.approach || 'hybrid'}** approach: civil and airfield works are predictive (fixed design, high consequence, formal change control) while terminal IT is delivered in ${agileInfo(ctx.project).sprintLength}-day Scrum sprints.\n\n${g('Hybrid Approach')}` }),
  },

  /* ---------- procurement ---------- */
  {
    id: 'contract_types',
    patterns: [/\bcontract types?\b/i, /\b(ffp|fpif|cpff|cpif|cpaf|t&m|time and materials|fixed price|cost[- ]plus|cost reimbursable)\b/i, /\bwhich contract\b/i, /\bpoint of total assumption\b/i],
    examples: ['FFP vs CPFF', 'which contract type?'],
    answer: (ctx, m) => {
      const e = best(m.input, 40);
      const mine = arr(ctx.project && ctx.project.procurement).map((k) => `${k.id} ${k.name}: ${k.contractType}`);
      return { text: `${e && e.term !== 'Contract Types' ? describe(e) + '\n\n' : ''}${g('Contract Types')}\n\nRule of thumb: clear, stable scope → fixed price; uncertain scope → cost-reimbursable with an incentive; urgent, small, ill-defined → T&M with a not-to-exceed cap.${mine.length ? `\n\nOur packages:\n${list(mine.slice(0, 8))}` : ''}` };
    },
  },
  {
    id: 'make_or_buy',
    patterns: [/\bmake[- ]or[- ]buy\b/i, /\boutsourc/i, /\bin[- ]house\b/i],
    examples: ['make or buy'],
    answer: (ctx) => {
      const rows = arr(ctx.project && ctx.project.procurement).filter((k) => k.makeOrBuy).slice(0, 5).map((k) => `${k.id} ${k.name}: ${k.makeOrBuy.decision}${k.makeOrBuy.rationale ? ` — ${k.makeOrBuy.rationale}` : ''}`);
      return { text: `${g('Make-or-Buy Analysis')}${rows.length ? `\n\nOur decisions:\n${list(rows)}` : ''}` };
    },
  },
  {
    id: 'procurement',
    patterns: [/\bprocurement (status|progress|plan|summary)\b/i, /^\s*procurement\s*\??$/i, /\b(our|which) (vendors?|suppliers?|contractors?|bids?|tenders?|contracts?)\b/i, /\b(awarded|award status|lead times?)\b/i],
    examples: ['procurement status'],
    answer: (ctx) => {
      const pr = procurementInfo(ctx.project, ctx.S);
      if (!pr.list.length) return { text: g('Procurement Management') };
      return { text: `${pr.list.length} procurement packages: ${Object.entries(pr.by).map(([k, v]) => `${k} ${v}`).join(' · ')}. Claims raised: ${pr.claims}.\n${pr.atRisk.length ? `Lead-time watch list:\n${list(pr.atRisk.slice(0, 4).map((k) => `${k.id} ${k.name} — ${k.status || 'Planned'}, lead ${days(k.leadTime)}, needed day ${Math.round(k.needDay)} (${k.slack < 0 ? `${days(-k.slack)} late` : `${days(k.slack)} slack`})`))}` : 'No package threatens its need date.'}\nVendors are fictional (simulated).`, actions: pr.atRisk.length ? [{ kind: 'openPanel', label: 'Open procurement', args: { id: 'procurement' } }] : [] };
    },
  },

  /* ---------- scope, requirements, governance ---------- */
  {
    id: 'task_info',
    patterns: [/\b(tell me about|status of|how is|what about|info on)\s+(\d{1,2}(?:\.\d{1,2})+)\b/i, /^\s*(\d{1,2}(?:\.\d{1,2})+)\s*\??\s*$/],
    examples: ['tell me about 3.5'],
    answer: (ctx, m) => {
      const t = findTask(ctx.project, m[2] || m[1]);
      if (!t) return { text: 'I could not find that WBS code.' };
      const st = safe(() => (ctx.project.state.get ? ctx.project.state.get(t.id) : ctx.project.state[t.id]), {}) || {};
      const ft = floatTable(ctx.project).find((r) => r.id === t.id);
      const d = t.dictionary || {};
      return { text: `**${t.code} ${t.name}** (${t.delivery || 'predictive'})\n${list([`Progress ${pct(num(st.pct, 0))}; budget ${money(num(t.budget, NaN))}; actual cost ${money(num(st.actualCost, NaN))}`, `Duration ${num(t.duration, 0)} d (O/M/P ${t.o}/${t.m}/${t.p})${ft ? `; total float ${days(ft.float)}` : ''}`, d.description, d.owner ? `Owner: ${d.owner}` : null, d.acceptance ? `Acceptance: ${d.acceptance}` : null, st.blocked ? `Blocked: ${st.blocked}` : null])}` };
    },
  },
  {
    id: 'scope',
    patterns: [/\bwbs\b/i, /\bwork breakdown\b/i, /^\s*scope\s*\??$/i, /\b(our|project|the project'?s?) scope\b/i, /\bhow many work packages\b/i],
    examples: ['what is in the WBS?'],
    answer: (ctx) => {
      const sums = arr(ctx.project && ctx.project.summaries);
      return { text: `${sums.length ? `WBS: ${sums.length} summary packages, ${arr(ctx.project.tasks).length} work packages.\n${list(sums.map((s) => `${s.code || s.id} ${s.name}`))}\n\n` : ''}${g('Work Breakdown Structure')}` };
    },
  },
  {
    id: 'requirements',
    patterns: [/\b(our|the|open|how many) requirements\b/i, /^\s*requirements\s*\??$/i, /\btraceab/i, /\brtm\b/i],
    examples: ['requirements traceability'],
    answer: (ctx) => {
      const rq = arr(ctx.project && ctx.project.requirements);
      const by = {};
      for (const r of rq) by[r.status || 'Open'] = (by[r.status || 'Open'] || 0) + 1;
      return { text: `${rq.length ? `${rq.length} requirements: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}. Untraced to WBS: ${rq.filter((r) => !arr(r.wbs).length).length}.\n\n` : ''}${g('Requirements Traceability Matrix')}` };
    },
  },
  {
    id: 'issues',
    patterns: [/\bissues?( log)?\b/i, /\bdecision log\b/i, /\bblockers?\b/i, /\bimpediments?\b/i],
    examples: ['issue log', 'blockers'],
    answer: (ctx) => {
      const iss = arr(ctx.project && ctx.project.issues).filter((i) => !/closed/i.test(String(i.status || '')));
      const blocked = criticalPath(ctx.project).filter((c) => c.blocked);
      return { text: `Open issues: ${iss.length}${iss.length ? `\n${list(iss.slice(0, 5).map((i) => `${i.id || ''} ${i.title} (${i.owner || 'unassigned'})`))}` : ''}\nBlocked critical activities: ${blocked.length ? blocked.map((b) => `${b.code} ${b.name}`).join(', ') : 'none'}.` };
    },
  },
  {
    id: 'events',
    patterns: [/\bwhat (just )?happened\b/i, /\b(recent|latest) (events|news|log)\b/i, /\bwhat'?s new\b/i, /\bevent log\b/i],
    examples: ['what happened recently?'],
    answer: (ctx) => {
      const ev = recentEvents(ctx.project, ctx.S.day - 14, 8);
      return { text: ev.length ? `Last two weeks:\n${list(ev.map((e) => `Day ${e.day}: ${e.title}${e.detail ? ` — ${e.detail}` : ''}`))}` : 'Nothing logged in the last two weeks.' };
    },
  },
  {
    id: 'lessons',
    patterns: [/\blessons?( learned| learnt)?\b/i, /\bretrospective\b/i, /\bretro\b/i, /\bpost[- ]implementation\b/i],
    examples: ['lessons learned'],
    answer: (ctx) => {
      const ls = arr(ctx.project && ctx.project.lessons);
      const rk = riskIssues(ctx.project, ctx.S);
      const auto = [
        ctx.S.spi < 0.95 ? `Schedule: SPI fell to ${idx(ctx.S.spi)} — early warning signs were visible in the critical-path progress.` : null,
        rk.occurred[0] ? `Risk: ${rk.occurred[0].id} ${rk.occurred[0].title} occurred — was its trigger monitored?` : null,
        ctx.S.cpi < 0.95 ? `Cost: CPI ${idx(ctx.S.cpi)} — check idle resources and rework before blaming estimates.` : null,
      ].filter(Boolean);
      return { text: `${ls.length ? `Lessons recorded (${ls.length}):\n${list(ls.slice(-5).map((l) => `${l.title}${l.detail ? ` — ${l.detail}` : ''}`))}\n` : 'No lessons recorded yet.\n'}${auto.length ? `\nCandidates from the data:\n${list(auto)}` : ''}\n\nCapture lessons continuously, not only at closure.` };
    },
  },
  {
    id: 'closing',
    patterns: [/\bclos(e|ing) (the )?project\b/i, /\bcloseout\b/i, /\bclose[- ]out\b/i, /\bhandover\b/i, /\bfinal acceptance\b/i],
    examples: ['how do we close the project?'],
    answer: (ctx) => ({ text: `${ctx.S.finished ? 'The works are complete — run the closeout from the Closing panel.' : `Closing checklist (we are ${pct(ctx.S.progress)} complete):`}\n${list(['Final acceptance against acceptance criteria', 'Contract closure: settle claims, release retention, archive', 'ORAT trials and handover to operations', 'Lessons learned into the organisational process assets', 'Release resources and celebrate the team', 'Benefits realisation plan handed to the operator'])}\n\n${g('Closing')}` }),
  },
  {
    id: 'benefits',
    patterns: [/\bbenefits?\b/i, /\b(our|the) business case\b/i, /\bvalue (delivered|of the project)\b/i],
    examples: ['business case benefits'],
    answer: (ctx) => {
      const b = (ctx.project && ctx.project.benefits) || {};
      const t = b.businessCaseTarget || {};
      return { text: `${Object.keys(b).length ? `Benefits (simulated): ${Number.isFinite(num(b.movementsPerDay)) ? `${b.movementsPerDay} movements/day` : ''}${Number.isFinite(num(b.paxPerDay)) ? `, ${b.paxPerDay} pax/day` : ''}${Number.isFinite(num(b.onTimePct)) ? `, ${b.onTimePct}% on time` : ''}${Object.keys(t).length ? ` vs targets ${Object.entries(t).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}. Operations mode (key 5) feeds these.\n\n` : ''}${g('Benefits Realisation')}` };
    },
  },
  {
    id: 'pmo_governance',
    patterns: [/\bpmo\b/i, /\bgovernance\b/i, /\bportfolio\b/i, /\bprogram(me)?\b/i, /\bsponsor\b/i, /\bcharter\b/i],
    examples: ['what does the PMO do?'],
    answer: (ctx, m) => {
      const e = best(m.input, 30) || lookup('Project Management Office');
      return { text: describe(e) };
    },
  },
  {
    id: 'pmbok',
    patterns: [/\bpmbok\b/i, /\bperformance domains?\b/i, /\bprinciples?\b/i, /\bfocus areas?\b/i, /\bprocess groups?\b/i],
    examples: ['PMBOK performance domains'],
    answer: (ctx, m) => {
      const q = String(m.input).toLowerCase();
      if (/principle/.test(q)) return { text: `${g('Project Management Principle')}\n\nThe principles used in this course: ${['Holistic View', 'Focus on Value', 'Embed Quality', 'Accountable Leadership', 'Sustainability', 'Empowered Culture'].join(' · ')}. Ask "define focus on value" for any one.` };
      if (/focus area|process group/.test(q)) return { text: g('Focus Area') };
      return { text: `${g('Performance Domain')}\n\n${g('PMBOK Guide')}` };
    },
  },
  {
    id: 'msproject',
    patterns: [/\bms ?project\b/i, /\bmicrosoft project\b/i, /\bmspdi\b/i, /\bexport (the )?(schedule|xml|csv)\b/i, /\bgantt\b/i],
    examples: ['export to MS Project'],
    answer: () => ({ text: `The live schedule exports as MSPDI XML (opens in MS Project) and CSV from the MS Project panel; tasks keep WBS codes, durations, predecessors (FS/SS/FF/SF with lags) and baselines.\n\n${g('MSPDI')}\n\n${g('Task Type')}` }),
  },
  {
    id: 'airport_facts',
    patterns: [/\b(tell me about|history of|facts about|about) (the )?(hyderabad )?airport\b/i, /\brunway (length|width|designator)/i, /\b(iata|icao) code\b/i, /\bwhere is (the )?airport\b/i, /\bopkd\b|\bhdd\b/i, /\breal[- ]world\b/i],
    examples: ['tell me about Hyderabad airport'],
    answer: () => ({
      text: `Verified real-world facts (from the simulator's cited facts table):\n${list([
        factLine('airport.name', 'Name'), factLine('airport.city', 'Location'), factLine('airport.iata', 'IATA'), factLine('airport.icao', 'ICAO'),
        factLine('runway.designators', 'Runway'), factLine('runway.length', 'Runway length'), factLine('runway.width', 'Runway width'),
        factLine('airport.elevation', 'Elevation'), factLine('airport.climate', 'Climate'), factLine('history.lastFlight2013', 'Recent history'),
        factLine('revival.proposal', 'Proposal'), factLine('org.operator', 'Operator'), factLine('org.regulator', 'Regulator'),
      ])}\n\nEverything else in the simulator — budget, schedule, vendors, risks — is simulated scenario data.`,
    }),
  },
  {
    id: 'aviation_terms',
    patterns: [/\b(orat|papi|ils|resa|arff|code e|code c|notam|fod|localiser|localizer|glide ?path|apron|airside|landside|mowp|obstacle limitation|pcr|pcn)\b/i],
    examples: ['what is ORAT?', 'explain PAPI'],
    answer: (ctx, m) => {
      const e = best(m[1], 30) || best(m.input, 30);
      const t = e ? findTask(ctx.project, e.term) : null;
      return { text: `${describe(e)}${t ? `\n\nIn our WBS: ${t.code} ${t.name}.` : ''}` };
    },
  },

  /* ---------- glossary (general, near the end) ---------- */
  {
    id: 'define',
    patterns: [/\b(?:what(?:'s| is| are| does)|define|definition of|meaning of|explain|tell me about|what do you mean by)\s+(?:an? |the )?(.+?)(?:\s+mean)?\s*\??$/i],
    examples: ['what is a work package?', 'define earned schedule'],
    answer: (ctx, m) => {
      const q = m[1];
      const e = best(q, 30);
      if (!e) return null;
      const more = search(q, 4).filter((r) => r.entry !== e && r.score >= 30).map((r) => r.entry.term);
      return { text: describe(e) + (more.length ? `\n\nSee also: ${more.join(', ')}.` : '') };
    },
  },
  {
    id: 'glossary_list',
    patterns: [/\bglossary\b/i, /\bhow many terms\b/i, /\blist (of )?terms\b/i],
    examples: ['glossary'],
    answer: () => ({ text: `The glossary holds ${glossarySize()} terms across PMBOK principles and domains, EVM, CPM/PERT, risk, quality, procurement, agile, stakeholders, MS Project and airport projects. Ask "define <term>" — I also understand abbreviations like TCPI, RACI, ORAT, PAPI.` }),
  },
];

export const DEFAULT_SUGGESTIONS = ['Why are we behind?', 'Biggest risk', 'Stand-up', 'What is TCPI?', 'Who should I talk to?', 'Crash 20 days', 'Status report', 'What can you do?'];

/** Find the first intent whose pattern matches. */
export function route(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const intent of INTENTS) {
    for (const re of intent.patterns) {
      const m = t.match(re);
      if (m) return { intent, match: m };
    }
  }
  return null;
}

/** Contextual follow-up chips based on the live state. */
export function suggestionsFor(S, lastIntent) {
  const out = [];
  if (S && S.spi < 0.95) out.push('Why are we behind?', 'Crash 20 days');
  if (S && S.cpi < 0.97) out.push('Why are we over budget?');
  if (lastIntent === 'biggest_risk' || lastIntent === 'risks') out.push('Risk responses', 'How much contingency is left?');
  if (lastIntent === 'stakeholder_talk') out.push('Draft a message to residents');
  if (lastIntent === 'critical_path') out.push('Forecast finish', 'What if we fast-track the terminal?');
  if (lastIntent === 'status' || lastIntent === 'standup') out.push('Status report', 'Recommendations');
  for (const s of DEFAULT_SUGGESTIONS) if (out.length < 6 && !out.includes(s)) out.push(s);
  return out.slice(0, 6);
}

/** Build the intent context from a project + extras. */
export function makeContext(project, extras = {}) {
  const S = readState(project, extras);
  let adv = null;
  return {
    project: project || {},
    S,
    mc: S.mc,
    status: extras.status || 'offline',
    coaching: extras.coaching || [],
    lastQuiz: extras.lastQuiz || null,
    canRunMonteCarlo: !!extras.canRunMonteCarlo,
    ruleCount: extras.ruleCount,
    advice: () => (adv = adv || analyse(project, { state: S, mc: S.mc })),
  };
}

/** Answer free text offline → { text, intent, actions, items?, suggestions, report? }. */
export function respond(text, ctxOrProject, extras) {
  const ctx = ctxOrProject && ctxOrProject.S && typeof ctxOrProject.advice === 'function' ? ctxOrProject : makeContext(ctxOrProject, extras);
  const r = route(text);
  let ans = null;
  let id = 'fallback';
  if (r) {
    try {
      ans = r.intent.answer(ctx, r.match);
      id = r.intent.id;
    } catch (err) {
      ans = { text: `I hit a problem reading that part of the project (${err && err.message ? err.message : err}). Try another question; the rest of the data is fine.` };
      id = r.intent.id;
    }
  }
  if (!ans) {
    ans = fallback(text);
    id = 'fallback';
  }
  return { actions: [], ...ans, intent: id, suggestions: ans.suggestions || suggestionsFor(ctx.S, id) };
}

/** Unknown question → glossary fuzzy match + suggestions. */
export function fallback(text) {
  const hits = search(text, 3).filter((h) => h.score >= 30);
  if (hits.length) {
    const top = hits[0].entry;
    return { text: `Here is the closest thing I know:\n\n${describe(top)}${hits.length > 1 ? `\n\nOr did you mean: ${hits.slice(1).map((h) => h.entry.term).join(', ')}?` : ''}` };
  }
  const near = search(text, 3).map((h) => h.entry.term);
  return {
    text: `I'm not sure I understood "${String(text).slice(0, 80)}". I answer from the live simulation and a ${glossarySize()}-term glossary.${near.length ? ` Related terms: ${near.join(', ')}.` : ''} Try one of the suggestions below, or "what can you do?".`,
    suggestions: DEFAULT_SUGGESTIONS.slice(0, 6),
  };
}

export function intentCount() {
  return INTENTS.length;
}
