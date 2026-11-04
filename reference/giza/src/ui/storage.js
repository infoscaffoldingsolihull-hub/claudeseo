/**
 * Session persistence.
 *
 * Three named slots plus an autosave, held in localStorage where the browser
 * allows it. Opened straight from `file://` some browsers give every file an
 * opaque origin and throw on any storage access, so every call is guarded and
 * the panel falls back to JSON export/import — which works everywhere.
 */

const PREFIX = 'giza.save.';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];

export const SLOT_LABELS = {
  auto: 'Autosave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

let available = null;

/** Is localStorage usable in this context? Cached after the first probe. */
export function storageAvailable() {
  if (available !== null) return available;
  try {
    const key = `${PREFIX}probe`;
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function writeSlot(slot, payload) {
  if (!storageAvailable()) return { ok: false, reason: 'Browser storage is unavailable from a local file.' };
  try {
    window.localStorage.setItem(PREFIX + slot, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    // Almost always the 5 MB quota; a save is ~80 KB, so this means many slots.
    return { ok: false, reason: err && err.name === 'QuotaExceededError' ? 'Browser storage is full.' : 'Could not write to browser storage.' };
  }
}

export function readSlot(slot) {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + slot);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSlot(slot) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(PREFIX + slot);
  } catch {
    /* nothing to do */
  }
}

/** Short human description of what a slot holds, for the panel. */
export function describeSlot(slot) {
  const data = readSlot(slot);
  if (!data) return null;
  const saved = data.savedAt ? new Date(data.savedAt) : null;
  return {
    day: data.day,
    years: (data.day / 365).toFixed(1),
    savedAt: saved ? saved.toLocaleString() : 'unknown',
    progress: data.totals && data.totals.ev !== undefined ? data.totals.ev : 0,
  };
}
