/**
 * Persistent user settings (`sim.settings`), saved to localStorage.
 *
 * Every read and write is guarded: private windows and file:// pages with
 * blocked storage still get a working in-memory settings object.
 * Secrets (the optional Anthropic API key) are NEVER stored here — see
 * src/ai/llm.js, which keeps the key in sessionStorage only.
 */
const KEY = 'hdd-pm-settings-v1';

export const DEFAULT_SETTINGS = {
  graphics: { tier: 'auto', bloom: true, godRays: true, ssao: true, dof: true, motionBlur: true, lensFlare: true, grain: true },
  audio: { muted: false, volume: 0.8, narration: false },
  accessibility: {
    uiScale: 1,
    highContrast: false,
    reducedMotion: false,
    palette: 'default',        // 'default' | 'cb-safe' (Okabe–Ito)
    captions: true,
    conference: false,         // large-text projector mode
  },
  controls: { invertY: false, sensitivity: 1, remap: {} },
  language: 'en',              // 'en' | 'ur' (Urdu labels for key UI)
  role: 'student',             // 'student' | 'instructor'
  studentName: '',
  onboarded: false,
  game: { autoDecide: true },  // true: decision events pick the best option themselves (non-blocking)
  ai: { model: 'claude-sonnet-5-5', voice: false, engine: 'offline' },
};

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

export class Settings {
  constructor(bus = null) {
    this.bus = bus;
    let saved = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    this.data = deepMerge(DEFAULT_SETTINGS, saved);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !saved) {
      this.data.accessibility.reducedMotion = true;
    }
  }

  /** Dotted-path read: settings.get('accessibility.reducedMotion'). */
  get(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(path, value) {
    const keys = path.split('.');
    let o = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
    this.save();
    if (this.bus) this.bus.emit('settings:changed', { path, value });
  }

  save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: settings live for this session only */
    }
  }

  reset() {
    this.data = deepMerge(DEFAULT_SETTINGS, {});
    this.save();
    if (this.bus) this.bus.emit('settings:changed', { path: '*', value: null });
  }
}
