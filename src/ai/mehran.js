/** STUB (A7 replaces — docs/ARCHITECTURE.md §8). */
export class Mehran {
  constructor(sim) { this.sim = sim; this.status = 'offline'; }
  analyse() { return []; }
  async ask() { return { text: 'MEHRAN is being briefed.', engine: 'offline' }; }
}
