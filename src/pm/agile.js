/**
 * Scrum helpers — pure JS. Sprint planning by priority against forecast
 * velocity, velocity statistics, burndown series, release forecast and WIP checks.
 */

/** Pick backlog stories in priority order until the forecast velocity is reached. */
export function planSprint(backlog, capacity) {
  const ready = backlog.filter((s) => s.status === 'backlog').sort((a, b) => a.priority - b.priority);
  const chosen = [];
  let points = 0;
  for (const s of ready) {
    if (points >= capacity) break;
    const remaining = s.points - (s.effort || 0);
    // A story that would overshoot is taken only if at least half of it fits.
    if (points + remaining > capacity && capacity - points < remaining / 2) continue;
    chosen.push(s.id);
    points += remaining;
  }
  return { ids: chosen, points };
}

/** Velocity: last, mean of the last three (yesterday's weather) and overall mean. */
export function velocityStats(velocities) {
  if (!velocities.length) return { last: 0, average3: 0, mean: 0 };
  const last3 = velocities.slice(-3);
  return {
    last: velocities[velocities.length - 1],
    average3: last3.reduce((a, b) => a + b, 0) / last3.length,
    mean: velocities.reduce((a, b) => a + b, 0) / velocities.length,
  };
}

/** Ideal vs actual burndown for one sprint. */
export function burndownSeries(sprint, sprintLength = 14) {
  const committed = sprint.committed || 0;
  const out = [];
  const burn = sprint.burn || [];
  for (let i = 0; i <= sprintLength; i++) {
    const rec = burn[i];
    out.push({
      day: sprint.startDay + i,
      remaining: rec === undefined ? null : rec,
      ideal: committed * (1 - i / sprintLength),
    });
  }
  return out;
}

/** Sprints (and day) needed to burn the remaining points at a given velocity. */
export function releaseForecast(remainingPoints, velocity, sprintLength = 14, today = 0) {
  if (remainingPoints <= 0) return { sprints: 0, finishDay: today };
  if (!(velocity > 0)) return { sprints: Infinity, finishDay: Infinity };
  const sprints = Math.ceil(remainingPoints / velocity);
  return { sprints, finishDay: today + sprints * sprintLength };
}

/** True when moving one more story into `status` would break its WIP limit. */
export function wipExceeded(stories, wip, status) {
  if (wip[status] === undefined) return false;
  return stories.filter((s) => s.status === status).length >= wip[status];
}
