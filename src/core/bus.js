/**
 * Event bus shared by every subsystem (`sim.bus`).
 *
 * Events are plain strings; payloads are plain objects. The catalogue of
 * events lives in docs/ARCHITECTURE.md §4 — add new ones there first.
 * A listener that throws never breaks the emitter or the other listeners.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(event, fn) {
    const set = this.listeners.get(event);
    if (set) set.delete(fn);
  }

  emit(event, payload = {}) {
    for (const key of [event, '*']) {
      const set = this.listeners.get(key);
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          fn(payload, event);
        } catch (err) {
          // Surface the bug without letting one listener take the others down.
          setTimeout(() => { throw err; }, 0);
        }
      }
    }
  }
}
