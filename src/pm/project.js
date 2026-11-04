/** STUB (A5 replaces with the full PM engine — see docs/ARCHITECTURE.md §5). */
export class Project {
  constructor({ seed = 20270104, difficulty = 'professional', approach = 'hybrid' } = {}) {
    Object.assign(this, { seed, difficulty, approach });
    this.startDate = new Date(Date.UTC(2027, 0, 4));
    this.day = 0; this.finished = false; this.phase = 'initiating';
    this.tasks = []; this.summaries = []; this.risks = []; this.stakeholders = []; this.resources = []; this.procurement = [];
    this.baseline = { criticalPath: [] }; this.baselineDuration = 0; this.bac = 0; this.events = [];
    this.weather = { kind: 'clear', intensity: 0, label: 'Clear' };
  }
  step() { this.day += 1; }
  date(day = this.day) { return new Date(this.startDate.getTime() + day * 86400000); }
  worldState() { return { pct: {}, workforce: 0, phase: this.phase, operational: false, weather: this.weather, activeIds: [] }; }
  snapshot() { return { day: this.day, progress: 0, spi: 1, cpi: 1 }; }
  serialise() { return { version: 1, day: this.day }; }
  restore(d) { this.day = d.day; return true; }
}
