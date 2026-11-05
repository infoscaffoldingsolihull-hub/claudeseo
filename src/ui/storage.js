/**
 * Session persistence for SKY GATEWAY HYDERABAD.
 *
 * Three named slots plus an autosave, held in localStorage where the browser
 * allows it. Opened straight from `file://` some browsers give every file an
 * opaque origin and throw on any storage access, so every call is guarded and
 * the Session panel falls back to JSON export/import — which works everywhere.
 */

const PREFIX = 'hdd.save.';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];

export const SLOT_LABELS = {
  auto: 'Autosave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

const START = Date.UTC(2027, 0, 4);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  if (!payload) return { ok: false, reason: 'Nothing to save.' };
  if (!storageAvailable()) return { ok: false, reason: 'Browser storage is unavailable here — use Export JSON instead.' };
  try {
    window.localStorage.setItem(PREFIX + slot, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err && err.name === 'QuotaExceededError' ? 'Browser storage is full — clear a slot or export JSON.' : 'Could not write to browser storage.' };
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
  if (!storageAvailable()) return false;
  try {
    window.localStorage.removeItem(PREFIX + slot);
    return true;
  } catch {
    return false;
  }
}

function dayLabel(day) {
  const d = new Date(START + day * 86400000);
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Short human description of what a slot holds (or of a session object), for the panel. */
export function describeSlot(slotOrData) {
  const data = typeof slotOrData === 'string' ? readSlot(slotOrData) : slotOrData;
  if (!data || typeof data !== 'object') return null;
  const p = data.project || {};
  const day = Number.isFinite(p.day) ? p.day : Number.isFinite(data.day) ? data.day : 0;
  const saved = data.savedAt ? new Date(data.savedAt) : null;
  const o = data.options || {};
  let bytes = 0;
  try { bytes = JSON.stringify(data).length; } catch { bytes = 0; }
  return {
    day,
    dateLabel: p.dateLabel || dayLabel(day),
    savedAt: saved && !Number.isNaN(saved.getTime()) ? saved.toLocaleString() : 'unknown',
    seed: o.seed ?? p.seed ?? '—',
    difficulty: o.difficulty || p.difficulty || '—',
    approach: o.approach || p.approach || '—',
    progress: Number.isFinite(p.progress) ? p.progress : null,
    finished: !!p.finished,
    sizeKb: Math.round(bytes / 1024),
  };
}
