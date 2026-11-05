/**
 * Scoring — XP, levels, badges, the closure scorecard, grade, certificate data
 * and the local leaderboard.
 *
 * PURE JS (no DOM, no THREE). `localStorage` is reached through `globalThis`
 * and every access is guarded, so the module also runs under `node --test`.
 */

export const LEVELS = [
  { level: 1, name: 'Junior PM', xp: 0 },
  { level: 2, name: 'Project Engineer', xp: 400 },
  { level: 3, name: 'Project Manager', xp: 1100 },
  { level: 4, name: 'Senior PM', xp: 2200 },
  { level: 5, name: 'Programme Manager', xp: 3600 },
  { level: 6, name: 'Programme Director', xp: 5400 },
];

export function levelFor(xp = 0) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > xp) || null;
  const span = next ? next.xp - cur.xp : 1;
  return { level: cur.level, name: cur.name, xp, next: next ? next.xp : null, nextName: next ? next.name : null, progress: next ? (xp - cur.xp) / span : 1 };
}

/** XP table for game events (the director multiplies by the difficulty factor). */
export const XP = {
  decisionBase: 20,
  decisionPerScore: 15,     // + score (0..3) × 15
  milestone: 60,
  poi: 15,
  changeDecided: 30,
  quizPerCorrect: 8,
  badge: 50,
  gateApproved: 80,
};

/* ----------------------------------------------------------------- badges */

export const BADGES = [
  { id: 'charter-signed', name: 'Charter Signed', icon: 'seal', clo: 'CLO1', text: 'Approved the G0 charter gate.', check: (c) => c.gateApproved('G0', 'initiating') },
  { id: 'site-walker', name: 'Boots on the Ground', icon: 'boot', clo: 'CLO1', text: 'Inspected six points of interest on foot.', check: (c) => c.track.poi >= 6 },
  { id: 'critical-thinker', name: 'Critical Thinker', icon: 'path', clo: 'CLO2', text: 'Studied the critical path and the Monte Carlo forecast.', check: (c) => c.panelOpened('schedule') && c.panelOpened('forecast') },
  { id: 'earth-mover', name: 'Earth Mover', icon: 'dozer', clo: 'CLO2', text: 'Finished the extension earthworks with SPI ≥ 0.95 throughout.', check: (c) => c.pct('3.2') >= 0.999 && (c.minSpi('3.2') === null ? c.spi : c.minSpi('3.2')) >= 0.95 },
  { id: 'ccb-chair', name: 'CCB Chair', icon: 'gavel', clo: 'CLO2', text: 'Decided three change requests through the CCB.', check: (c) => c.changesDecided >= 3 },
  { id: 'zero-ncr', name: 'Zero Defects', icon: 'check', clo: 'CLO2', text: 'Surface course complete with no open NCRs.', check: (c) => c.pct('3.5') >= 0.999 && c.openNcrs === 0 },
  { id: 'monsoon-ready', name: 'Monsoon Ready', icon: 'rain', clo: 'CLO2', text: 'Drainage complete and a monsoon survived.', check: (c) => c.pct('8.7') >= 0.999 && (c.track.weatherSeen.rain || 0) >= 1 },
  { id: 'ethical-compass', name: 'Ethical Compass', icon: 'compass', clo: 'CLO3', text: 'Refused and reported an improper vendor offer.', check: (c) => c.track.ethics === true },
  { id: 'stakeholder-whisperer', name: 'Stakeholder Whisperer', icon: 'people', clo: 'CLO3', text: 'Average stakeholder satisfaction reached 80 %.', check: (c) => c.satisfaction >= 0.8 },
  { id: 'safety-first', name: 'Safety First', icon: 'helmet', clo: 'CLO3', text: 'A full year on site with safety ≥ 95 %.', check: (c) => c.day >= 365 && c.track.minSafety >= 0.95 },
  { id: 'scrum-master', name: 'Servant Leader', icon: 'board', clo: 'CLO1', text: 'Completed two sprints in the terminal IT stream.', check: (c) => c.sprintsDone >= 2 },
  { id: 'quiz-ace', name: 'Quiz Ace', icon: 'star', clo: 'CLO1', text: 'Scored 90 % or more on a weekly quiz.', check: (c) => Object.values(c.track.quiz).some((q) => q.total && q.best / q.total >= 0.9) },
  { id: 'scholar', name: 'Scholar of the Gateway', icon: 'book', clo: 'CLO1', text: 'Completed quizzes for eight different weeks.', check: (c) => c.quizSets >= 8 },
  { id: 'decisive', name: 'Decisive', icon: 'bolt', clo: 'CLO2', text: 'Resolved fifteen decision cards.', check: (c) => c.track.decisions >= 15 },
  { id: 'best-practice', name: 'By the Book', icon: 'ribbon', clo: 'CLO1', text: 'Chose the best-practice option ten times.', check: (c) => c.track.goodDecisions >= 10 },
  { id: 'on-budget', name: 'On Budget', icon: 'coin', clo: 'CLO2', text: 'Finished the programme with CPI ≥ 1.0.', check: (c) => c.finished && c.cpi >= 1 },
  { id: 'on-time', name: 'On Time', icon: 'clock', clo: 'CLO2', text: 'Finished the programme with SPI ≥ 0.98.', check: (c) => c.finished && c.spi >= 0.98 },
  { id: 'lessons-learned', name: 'Learning Organisation', icon: 'scroll', clo: 'CLO1', text: 'Logged at least five lessons learned.', check: (c) => c.lessons >= 5 },
  { id: 'mission-master', name: 'Mission Master', icon: 'trophy', clo: 'CLO1', text: 'Completed ten missions.', check: (c) => c.missionsCompleted >= 10 },
];

/** Returns the badge definitions newly earned in this context. */
export function newBadges(ctx, owned = []) {
  const have = new Set(owned);
  return BADGES.filter((b) => {
    if (have.has(b.id)) return false;
    try { return !!b.check(ctx); } catch { return false; }
  });
}

/* --------------------------------------------------------------- scorecard */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Map an index where `good` is excellent and `bad` is failing to 0..100. */
const band = (v, bad, good) => Math.round(100 * clamp01((v - bad) / (good - bad)));

export const GRADES = [
  ['A+', 90], ['A', 85], ['A−', 80], ['B+', 75], ['B', 70], ['B−', 65], ['C+', 60], ['C', 55], ['D', 50], ['F', 0],
];

export function gradeFor(score) {
  for (const [g, min] of GRADES) if (score >= min) return g;
  return 'F';
}

/**
 * Risk-exposure trend from the director's samples: positive = exposure falling.
 * Returns -1..1 (0 when not enough data).
 */
export function riskTrend(series = []) {
  if (!series || series.length < 2) return 0;
  const first = series[0].exposure || 0;
  const last = series[series.length - 1].exposure || 0;
  const peak = Math.max(...series.map((s) => s.exposure || 0), 1);
  return Math.max(-1, Math.min(1, (first - last) / peak));
}

function quizByClo(track) {
  const acc = { CLO1: [0, 0], CLO2: [0, 0], CLO3: [0, 0] };
  for (const q of Object.values(track.quiz || {})) {
    if (q.byClo) {
      for (const k of Object.keys(acc)) {
        const v = q.byClo[k];
        if (Array.isArray(v)) { acc[k][0] += v[0]; acc[k][1] += v[1]; } else if (v && typeof v === 'object') { acc[k][0] += v.correct || 0; acc[k][1] += v.total || 0; }
      }
    }
  }
  const out = {};
  for (const [k, [c, t]] of Object.entries(acc)) out[k] = t ? c / t : null;
  return out;
}

/**
 * Closure scorecard (also usable mid-project as a progress report).
 * `ctx` comes from projectContext(project, game).
 */
export function computeScorecard(ctx) {
  const p = ctx.project || {};
  const benefitsObj = p.benefits || (ctx.snap && ctx.snap.benefits) || null;
  let benefits = ctx.progress;
  if (benefitsObj && benefitsObj.businessCaseTarget) {
    const t = benefitsObj.businessCaseTarget;
    const ratios = ['movementsPerDay', 'paxPerDay', 'onTimePct']
      .filter((k) => typeof t[k] === 'number' && t[k] > 0 && typeof benefitsObj[k] === 'number')
      .map((k) => clamp01(benefitsObj[k] / t[k]));
    if (ratios.length) benefits = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }
  const trend = riskTrend(ctx.track.riskSeries);
  const quiz = ctx.quizMastery();
  const qClo = quizByClo(ctx.track);
  const missions = Array.isArray(ctx.game.missions) ? ctx.game.missions : [];
  const missionShare = (clo) => {
    const ms = missions.filter((m) => (m.clo || []).includes(clo));
    return ms.length ? ms.filter((m) => m.status === 'completed').length / ms.length : 0;
  };
  const decisionsQuality = ctx.track.decisions ? ctx.track.goodDecisions / ctx.track.decisions : 0.5;

  const metrics = {
    spi: { value: ctx.spi, score: band(ctx.spi, 0.75, 1.0), label: 'Schedule performance (SPI)' },
    cpi: { value: ctx.cpi, score: band(ctx.cpi, 0.75, 1.0), label: 'Cost performance (CPI)' },
    quality: { value: ctx.quality, score: band(ctx.quality, 0.6, 0.97), label: 'Quality index' },
    safety: { value: ctx.safety, score: band(ctx.safety, 0.6, 0.97), label: 'Safety index' },
    stakeholders: { value: ctx.satisfaction, score: band(ctx.satisfaction, 0.35, 0.85), label: 'Stakeholder satisfaction' },
    riskTrend: { value: trend, score: band(trend, -0.5, 0.5), label: 'Risk-exposure trend' },
    benefits: { value: benefits, score: band(benefits, 0, 1), label: 'Benefits realised' },
    quiz: { value: quiz, score: band(quiz, 0.3, 0.95), label: 'Quiz mastery' },
  };
  const qs = (k, fallback) => (qClo[k] === null ? fallback : band(qClo[k], 0.3, 0.95));
  const gates = ctx.gatesTotal ? ctx.gatesApproved / ctx.gatesTotal : ctx.progress;
  const ethics = ctx.track.ethics === false ? 0 : ctx.track.ethics === true ? 100 : 70;
  const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

  const byClo = {
    CLO1: avg([band(gates, 0, 1), band(missionShare('CLO1'), 0, 1), band(decisionsQuality, 0.2, 0.9), qs('CLO1', metrics.quiz.score)]),
    CLO2: avg([metrics.spi.score, metrics.cpi.score, metrics.quality.score, metrics.riskTrend.score, qs('CLO2', metrics.quiz.score)]),
    CLO3: avg([metrics.stakeholders.score, metrics.safety.score, band(ctx.welfare, 0.5, 0.95), band(ctx.procurementTotal ? ctx.awarded / ctx.procurementTotal : 0, 0, 1), ethics, qs('CLO3', metrics.quiz.score)]),
  };
  const overall = Math.round(0.3 * byClo.CLO1 + 0.4 * byClo.CLO2 + 0.3 * byClo.CLO3);
  return {
    day: ctx.day,
    finished: ctx.finished,
    spi: ctx.spi,
    cpi: ctx.cpi,
    quality: ctx.quality,
    safety: ctx.safety,
    stakeholders: ctx.satisfaction,
    riskTrend: trend,
    benefits,
    quiz,
    metrics,
    byClo,
    cloLabels: {
      CLO1: 'Understand and apply PM concepts, frameworks and lifecycles',
      CLO2: 'Apply quantitative tools to plan, monitor and control',
      CLO3: 'Manage people, stakeholders, communication and procurement',
    },
    overall,
    grade: gradeFor(overall),
  };
}

/** Score shown on the HUD and leaderboard. */
export function scoreFor(xp, card) {
  return Math.round(xp + (card ? card.overall * 25 : 0));
}

/** Data for a printable certificate. */
export function certificateData({ name, card, level, badges = [], project = {}, xp = 0 }) {
  return {
    title: 'Certificate of Achievement — SKY GATEWAY HYDERABAD',
    subtitle: 'Project Management Simulator · Hyderabad Airport Revival & Expansion Programme (simulated scenario)',
    studentName: name && String(name).trim() ? String(name).trim() : 'Student Project Manager',
    level: level ? level.name : 'Junior PM',
    xp,
    grade: card ? card.grade : 'F',
    overall: card ? card.overall : 0,
    byClo: card ? card.byClo : { CLO1: 0, CLO2: 0, CLO3: 0 },
    cloLabels: card ? card.cloLabels : {},
    metrics: card ? Object.fromEntries(Object.entries(card.metrics).map(([k, m]) => [k, { label: m.label, value: m.value, score: m.score }])) : {},
    badges: badges.map((b) => (typeof b === 'string' ? b : b.name)),
    seed: project.seed,
    difficulty: project.difficulty,
    approach: project.approach,
    projectDay: project.day,
    issued: new Date().toISOString().slice(0, 10),
    note: 'Simulated scenario data — educational use. Aligned to PMBOK® Guide 8th Edition performance domains.',
  };
}

/* ------------------------------------------------------------ leaderboard */

export const LEADERBOARD_KEY = 'hdd-pm-leaderboard-v1';

function storage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

let memoryBoard = [];

export function readLeaderboard() {
  const s = storage();
  if (!s) return [...memoryBoard];
  try {
    const raw = s.getItem(LEADERBOARD_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [...memoryBoard];
  }
}

export function submitLeaderboard(entry, limit = 10) {
  const list = readLeaderboard();
  list.push({ ...entry, at: entry.at || new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, limit);
  memoryBoard = top;
  const s = storage();
  if (s) {
    try { s.setItem(LEADERBOARD_KEY, JSON.stringify(top)); } catch { /* storage full or blocked */ }
  }
  return top;
}
