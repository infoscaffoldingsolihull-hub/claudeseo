/** STUB (A6a replaces — docs/ARCHITECTURE.md §7). */
export const PANELS = [];
export class Dashboard {
  constructor(root, sim) { this.root = root; this.sim = sim; this.openId = null; }
  get panelIds() { return PANELS.map((p) => p.id); }
  open(id) { this.openId = id; } toggle(id) { this.openId = this.openId === id ? null : id; } close() { this.openId = null; }
  tick() {} rerender() {}
}
