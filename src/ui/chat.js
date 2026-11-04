/** STUB (A7 replaces). */
export class ChatPanel {
  constructor(root, sim) { this.root = root; this.sim = sim; this.isOpen = false; }
  toggle(force) { this.isOpen = force === undefined ? !this.isOpen : force; }
  toggleVoice() {}
  update() {}
}
