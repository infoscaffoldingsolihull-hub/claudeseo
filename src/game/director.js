/** STUB (A8 replaces — docs/ARCHITECTURE.md §9). */
export class GameDirector {
  constructor(sim) { this.sim = sim; this.missions = []; this.decisions = []; this.xp = 0; this.level = 1; this.levelName = 'Junior PM'; }
  onDay() {} update() {} trigger() {} resolveActive() {} autoResolve() {} reset() {}
  serialise() { return {}; } restore() {}
}
