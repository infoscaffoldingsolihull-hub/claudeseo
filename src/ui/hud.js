/** STUB (A6a replaces — docs/ARCHITECTURE.md §11). */
export class HUD {
  constructor(root, sim) { this.root = root; this.sim = sim; this.speedIndex = 2; }
  toast(t) { console.info('[toast]', t); }
  update() {} setPrompt() {} showPoi() {} showSelection() {}
  toggleHelp() {} isHelpOpen() { return false; } toggleStats() {} refreshSound() {}
  setSpeedIndex(i) { const S = [0, 1, 10, 50, 200]; this.speedIndex = Math.max(0, Math.min(S.length - 1, i)); this.sim.simulationSpeed = S[this.speedIndex]; }
  applySpeed() {}
  showNarration() {} hideNarration() {} setTourProgress() {} setCinematic() {}
  showDecision() {} blocking() { return false; } closeCards() {}
  async requestApproval({ onApprove } = {}) { if (onApprove) onApprove(); return true; }
  modal() {} modalOpen() { return false; } closeModal() {} confetti() {}
}
