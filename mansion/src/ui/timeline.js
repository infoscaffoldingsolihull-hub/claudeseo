/**
 * The construction timeline: the scrubber, the transport controls, the phase
 * strip and the list of packages in progress on the day you are looking at.
 *
 * The phase strip is not decoration. It is drawn from the as-built programme —
 * for every day, which phase carries the most active budget — so the coloured
 * bands under the slider are the schedule itself, and the milestone ticks sit
 * where the CPM put them.
 */
import { el, fill, clear, byId } from './dom.js';
import { PHASES, PHASE_BY_ID } from '../pm/model.js';
import { phaseAtDay, milestoneTable, activePackages, formatDay } from '../pm/project.js';


export function createTimeline(ctx) {
  const { api, onDay, onPlay, onSpeed } = ctx;
  const project = api.project;
  const horizon = project.horizon;

  const range = byId('tlRange');
  const dayEl = byId('tlDay');
  const ofEl = byId('tlOf');
  const dateEl = byId('tlDate');
  const phaseEl = byId('tlPhase');
  const activeEl = byId('tlActive');
  const playBtn = byId('tlPlay');
  const speedEl = byId('tlSpeed');

  range.max = String(horizon);
  ofEl.textContent = `of ${horizon}`;

  /* --------------------------------------------------------- phase strip */
  {
    // Walk the horizon once and record where the dominant phase changes.
    const bands = [];
    let currentId = null;
    let start = 0;
    for (let d = 0; d <= horizon; d += 1) {
      const id = phaseAtDay(project, d).id;
      if (id !== currentId) {
        if (currentId !== null) bands.push({ id: currentId, from: start, to: d });
        currentId = id;
        start = d;
      }
    }
    bands.push({ id: currentId, from: start, to: horizon });
    fill(byId('tlPhases'), bands.map((band) => {
      const phase = PHASE_BY_ID.get(band.id) || PHASES[0];
      return el('i', {
        title: `${phase.name} — days ${band.from} to ${band.to}`,
        style: {
          width: `${((band.to - band.from) / horizon) * 100}%`,
          background: phase.colour,
        },
      });
    }));
  }

  /* ---------------------------------------------------------- milestones */
  {
    const marks = [];
    for (const ms of milestoneTable(project)) {
      const left = (ms.forecastDay / horizon) * 100;
      marks.push(el('i', { style: { left: `${left}%` }, title: ms.name }));
      // Only label the milestones that will not collide with each other.
      if (['MS1', 'MS3', 'MS5', 'MS7'].includes(ms.id)) {
        marks.push(el('b', {
          style: { left: `${Math.min(96, Math.max(4, left))}%` },
          text: ms.name.length > 22 ? `${ms.name.slice(0, 20)}…` : ms.name,
          title: `${ms.name} — ${formatDay(ms.forecastDay)}`,
        }));
      }
    }
    fill(byId('tlMarks'), marks);
  }

  /* -------------------------------------------------------------- events */
  range.addEventListener('input', () => onDay(Number(range.value)));
  byId('tlStart').addEventListener('click', () => onDay(0));
  byId('tlEnd').addEventListener('click', () => onDay(horizon));
  byId('tlBack').addEventListener('click', () => onDay(Number(range.value) - 1));
  byId('tlFwd').addEventListener('click', () => onDay(Number(range.value) + 1));
  playBtn.addEventListener('click', () => onPlay());
  speedEl.addEventListener('change', () => onSpeed(Number(speedEl.value)));
  onSpeed(Number(speedEl.value));

  let lastDay = -1;

  return {
    /** Redraw for a day. Cheap enough to call on every change. */
    setDay(day) {
      if (day === lastDay) return;
      lastDay = day;
      range.value = String(day);
      dayEl.textContent = String(day);
      dateEl.textContent = formatDay(day);

      const state = api.stateAt(day);
      phaseEl.textContent = state.complete
        ? 'Handed over'
        : (state.idle
          ? `${state.phase.name} — curing, no productive activity`
          : state.phase.name);

      const active = activePackages(project, day);
      if (!active.length) {
        const next = state.idleReason;
        fill(activeEl, [
          el('span', {
            class: 'pkgchip idle',
            text: state.complete
              ? 'Practical completion — the house is handed over'
              : (next
                ? `Curing — ${next.pkg.code} ${next.pkg.name} starts in ${next.startsInDays} days`
                : 'Site not yet mobilised'),
          }),
        ]);
        return;
      }
      const chips = active
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 7)
        .map((entry) => el('span', {
          class: 'pkgchip',
          title: `${entry.pkg.code} ${entry.pkg.name}`,
          style: { 'border-left': `3px solid ${phaseColour(entry.pkg.phase)}` },
        }, [
          entry.pkg.name.length > 34 ? `${entry.pkg.name.slice(0, 32)}…` : entry.pkg.name,
          el('i', { text: `${Math.round(entry.progress * 100)}%` }),
        ]));
      if (active.length > 7) {
        chips.push(el('span', { class: 'pkgchip idle', text: `+${active.length - 7} more` }));
      }
      fill(activeEl, chips);
    },

    setPlaying(playing) {
      playBtn.textContent = playing ? '❚❚' : '▶';
      playBtn.title = playing ? 'Pause  (Space)' : 'Play  (Space)';
    },
  };
}

function phaseColour(id) {
  const phase = PHASE_BY_ID.get(id);
  return phase ? phase.colour : '#d8b678';
}
