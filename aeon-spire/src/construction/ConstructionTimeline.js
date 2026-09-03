/**
 * AEON SPIRE — construction programme (E.7, E.8).
 *
 * A fictional 700-day schedule compressed into ten scrubbable milestones.
 * This module owns the *state* — the day counter, the milestone, the play
 * head, the earned-value figures the HUD reads — while ConstructionSite.js
 * owns the geometry and equipment that state drives.
 *
 * Keeping them apart means the project-management layer (the whole point of
 * the deliverable for a PM course) is legible on its own: the schedule, the
 * budget curve and the critical path are plain data, not buried in a
 * rendering loop.
 */

import { clamp, lerp, smoothstep } from '../core/MathUtil.js';

/**
 * The ten milestones of E.7. `day` is the programme day on which the
 * milestone *completes*; `budget` is the cumulative planned spend at that
 * point, as a fraction of the total.
 *
 * `critical` marks the critical path — the chain with no float. The
 * Leaning Observatory and the Wonder Annex sit off it, which is what makes
 * them useful worked examples in the README.
 */
export const MILESTONES = [
  {
    n: 1, id: 'clearing', name: 'Site clearing & survey',
    day: 40, budget: 0.03, duration: 40, critical: true,
    equipment: 'Survey stakes, small excavator',
    zones: [], note: 'Enabling works. Sets out the grid the whole campus is built to.'
  },
  {
    n: 2, id: 'excavation', name: 'Excavation & piling',
    day: 110, budget: 0.11, duration: 70, critical: true,
    equipment: 'Excavators, pile-driving rig',
    zones: [], note: 'High water table — bored piles, per the Section C brief.'
  },
  {
    n: 3, id: 'foundation', name: 'Foundation & raft slab pour',
    day: 175, budget: 0.20, duration: 65, critical: true,
    equipment: 'Concrete pump trucks, mixer trucks',
    zones: ['canal'], note: 'Reinforced-concrete raft on the bored piles.'
  },
  {
    n: 4, id: 'core', name: 'Core & podium rising',
    day: 265, budget: 0.33, duration: 90, critical: true,
    equipment: 'Tower crane, rebar & formwork crews',
    zones: ['canal', 'sail'], note: 'Slipformed core; podium terraces follow.'
  },
  {
    n: 5, id: 'sailsteel', name: 'Sail Atrium steel erection',
    day: 350, budget: 0.46, duration: 85, critical: true,
    equipment: 'Crawler crane, steel-erection crew',
    zones: ['canal', 'sail', 'observatory'], note: 'Bronze diagrid exoskeleton goes up.'
  },
  {
    n: 6, id: 'ring', name: 'Ring Deck cantilever install',
    day: 435, budget: 0.58, duration: 85, critical: true,
    equipment: 'Heavy-lift crane, engineers on the ring',
    zones: ['canal', 'sail', 'observatory', 'ring'],
    note: 'The halo is flown in segments; dampers set at the joint.'
  },
  {
    n: 7, id: 'topping', name: 'Spire topping-out',
    day: 505, budget: 0.68, duration: 70, critical: true,
    equipment: 'Self-jacking climbing crane, flag-raising',
    zones: ['canal', 'sail', 'observatory', 'ring', 'spire'],
    note: 'Structural completion at 700 m. The programme milestone everyone photographs.'
  },
  {
    n: 8, id: 'facade', name: 'Facade glazing & MEP',
    day: 590, budget: 0.82, duration: 85, critical: true,
    equipment: 'Glazing trucks, cherry-pickers',
    zones: ['canal', 'sail', 'observatory', 'ring', 'spire'],
    note: 'Longest single package by value. Weather-dependent — the schedule risk.'
  },
  {
    n: 9, id: 'fitout', name: 'Interior fit-out & landscaping',
    day: 665, budget: 0.94, duration: 75, critical: true,
    equipment: 'Canal filled, gardens planted, Annex assembled',
    zones: ['canal', 'sail', 'observatory', 'ring', 'spire', 'court', 'annex'],
    note: 'Canal flooded; Reflection Court and Wonder Annex complete off the critical path.'
  },
  {
    n: 10, id: 'completion', name: 'Completion & opening',
    day: 700, budget: 1.00, duration: 35, critical: true,
    equipment: 'Ribbon-cutting, night light show',
    zones: ['canal', 'sail', 'observatory', 'ring', 'spire', 'court', 'annex'],
    note: 'Handover. Practical completion on day 700 of a 700-day programme.'
  }
];

export const TOTAL_DAYS = MILESTONES[MILESTONES.length - 1].day;
/** Fictional capital cost, used for the earned-value readouts (E.8). */
export const TOTAL_BUDGET = 2_400_000_000;

export class ConstructionTimeline {
  constructor() {
    /** Construction Mode on/off (C key). */
    this.active = false;
    /** Continuous progress through the programme, 0 → 1. */
    this.t = 0;
    /** Play head running (Space). */
    this.playing = true;
    /** Programme days per real second when playing. */
    this.speed = 26;
    /** Eased 0→1 that fades the finished building in and the site out. */
    this.blend = 0;

    /* Activity levels published to the audio mixer and the equipment rig. */
    this.craneActivity = 0;
    this.workerActivity = 0;
    this.truckActivity = 0;
    this.audioWeight = 0;

    this.onMilestoneChange = null;
    this._lastMilestone = -1;
  }

  /* ---------------- Derived state ---------------- */

  /** Programme day, 0 … 700. */
  get day() { return this.t * TOTAL_DAYS; }

  /** The milestone currently in progress (1-based), 1 … 10. */
  get milestoneIndex() {
    const d = this.day;
    for (let i = 0; i < MILESTONES.length; i++) if (d <= MILESTONES[i].day) return i;
    return MILESTONES.length - 1;
  }

  get milestone() { return MILESTONES[this.milestoneIndex]; }

  /** Progress within the current milestone, 0 → 1. */
  get milestoneProgress() {
    const i = this.milestoneIndex;
    const start = i === 0 ? 0 : MILESTONES[i - 1].day;
    const end = MILESTONES[i].day;
    return clamp((this.day - start) / Math.max(1, end - start), 0, 1);
  }

  /** Planned value: the budget curve, interpolated between milestones. */
  get plannedValue() {
    const i = this.milestoneIndex;
    const b0 = i === 0 ? 0 : MILESTONES[i - 1].budget;
    const b1 = MILESTONES[i].budget;
    return lerp(b0, b1, this.milestoneProgress);
  }

  /**
   * A fictional actual-cost curve that runs slightly ahead of plan in the
   * middle of the job and recovers late — the shape every construction
   * project management course draws on the board. Gives the HUD a real
   * cost-variance number to show rather than a duplicate of planned value.
   */
  get actualCost() {
    const pv = this.plannedValue;
    const bulge = Math.sin(pv * Math.PI) * 0.055;
    return clamp(pv + bulge, 0, 1.06);
  }

  /** Earned value — deliberately a touch behind actual cost mid-programme. */
  get earnedValue() {
    const pv = this.plannedValue;
    return clamp(pv - Math.sin(pv * Math.PI) * 0.022, 0, 1);
  }

  /** Cost Performance Index (EV / AC) — >1 is under budget. */
  get cpi() {
    const ac = this.actualCost;
    return ac > 0.001 ? this.earnedValue / ac : 1;
  }

  /** Schedule Performance Index (EV / PV) — >1 is ahead of schedule. */
  get spi() {
    const pv = this.plannedValue;
    return pv > 0.001 ? this.earnedValue / pv : 1;
  }

  /** Budget utilised, as the HUD ticker shows it (E.8). */
  get budgetUsed() { return this.actualCost; }
  get budgetUsedAbsolute() { return this.actualCost * TOTAL_BUDGET; }

  /** Overall percent complete. */
  get percentComplete() { return this.earnedValue; }

  /* ---------------- Controls ---------------- */

  /** C key. */
  toggle() {
    this.active = !this.active;
    if (this.active && this.t >= 0.999) this.t = 0;
    return this.active;
  }

  setActive(on) {
    if (!!on !== this.active) return this.toggle();
    return this.active;
  }

  /** Space — play/pause the play head. */
  togglePlay() { this.playing = !this.playing; return this.playing; }

  /** `[` and `]` — scrub to the previous/next milestone. */
  step(dir) {
    const i = this.milestoneIndex;
    // Scrubbing back from just inside a milestone should go to its start,
    // not skip a whole one — so snap to boundaries.
    const boundaries = [0, ...MILESTONES.map(m => m.day / TOTAL_DAYS)];
    const cur = this.t;
    if (dir > 0) {
      const next = boundaries.find(b => b > cur + 1e-4);
      this.t = next === undefined ? 1 : next;
    } else {
      let prev = 0;
      for (const b of boundaries) if (b < cur - 1e-4) prev = b;
      this.t = prev;
    }
    this.playing = false;
    return this.milestoneIndex;
  }

  /** Jump straight to milestone n (1-based) — used by the HUD's Gantt bar. */
  goToMilestone(n) {
    const i = clamp(Math.round(n), 1, MILESTONES.length) - 1;
    this.t = MILESTONES[i].day / TOTAL_DAYS;
    this.playing = false;
    return this.milestoneIndex;
  }

  /** Set the play head directly, 0 → 1 (HUD scrubber drag). */
  setProgress(v) { this.t = clamp(v, 0, 1); return this.t; }

  setSpeed(daysPerSecond) { this.speed = clamp(daysPerSecond, 2, 200); return this.speed; }

  /* ---------------- Per-frame ---------------- */

  update(dt) {
    // The whole site fades in and out with construction mode, so switching
    // is a transition rather than a pop.
    const targetBlend = this.active ? 1 : 0;
    this.blend += (targetBlend - this.blend) * Math.min(1, dt * 3.2);
    if (Math.abs(this.blend - targetBlend) < 0.002) this.blend = targetBlend;

    if (this.active && this.playing) {
      this.t = clamp(this.t + (this.speed / TOTAL_DAYS) * dt, 0, 1);
      if (this.t >= 1) this.playing = false;
    }

    /* Activity levels drive the equipment animation and the audio mix.
       Each milestone has its own mix of plant on site. */
    const i = this.milestoneIndex;
    const p = this.milestoneProgress;
    const CRANE = [0, 0.1, 0.2, 1.0, 0.95, 1.0, 0.9, 0.55, 0.25, 0.05];
    const WORK = [0.35, 0.5, 0.7, 0.9, 1.0, 0.85, 0.7, 0.9, 1.0, 0.4];
    const TRUCK = [0.6, 0.9, 1.0, 0.7, 0.55, 0.5, 0.35, 0.75, 0.6, 0.2];
    // Ramp activity down as the last milestone completes.
    const wind = this.t > 0.985 ? 1 - (this.t - 0.985) / 0.015 : 1;
    const mix = (arr) => lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], p) * wind;
    this.craneActivity = clamp(mix(CRANE), 0, 1) * this.blend;
    this.workerActivity = clamp(mix(WORK), 0, 1) * this.blend;
    this.truckActivity = clamp(mix(TRUCK), 0, 1) * this.blend;
    this.audioWeight = this.blend;

    if (i !== this._lastMilestone) {
      this._lastMilestone = i;
      if (this.onMilestoneChange) this.onMilestoneChange(MILESTONES[i], i);
    }
  }

  /** Everything the HUD needs, in one object (E.8). */
  status() {
    const m = this.milestone;
    return {
      active: this.active,
      playing: this.playing,
      t: this.t,
      day: Math.round(this.day),
      totalDays: TOTAL_DAYS,
      milestone: m.n,
      milestoneId: m.id,
      milestoneName: m.name,
      equipment: m.equipment,
      note: m.note,
      milestoneProgress: this.milestoneProgress,
      percentComplete: this.percentComplete,
      plannedValue: this.plannedValue,
      earnedValue: this.earnedValue,
      actualCost: this.actualCost,
      budgetUsed: this.budgetUsed,
      budgetUsedAbsolute: this.budgetUsedAbsolute,
      cpi: this.cpi,
      spi: this.spi,
      onCriticalPath: m.critical
    };
  }
}
