/**
 * AEON SPIRE — audio system (E.5, D.8).
 *
 * A layered, cross-fading soundscape built entirely on the Web Audio API.
 * Every buffer is synthesised at runtime by Synth.js, so nothing is
 * downloaded and nothing is licensed (Section I).
 *
 * Signal path
 *
 *   layer sources ─▶ layer gain ─▶ dry bus ────────────────┐
 *                                └▶ convolver send ─▶ IR ──┤
 *                                                          ▼
 *   one-shots ─────────────────────────────────────▶ master ─▶ limiter ─▶ out
 *
 * The convolver's impulse response is swapped as the camera moves between
 * rooms, which is D.8's requirement for a distinct acoustic per interior
 * rather than one global reverb.
 *
 * Browsers will not start an AudioContext without a gesture, so everything
 * here is built lazily on the first user interaction and the whole module
 * degrades silently if audio is unavailable.
 */

import { ACOUSTIC } from '../world/Rooms.js';
import { clamp, lerp, damp } from '../core/MathUtil.js';
import * as Synth from './Synth.js';

/** Acoustic profiles → impulse-response parameters (D.8). */
const ROOM_IR = {
  [ACOUSTIC.STONE_VAULT]:   { decay: 3.4, damping: 0.18, predelay: 0.016, diffusion: 0.85, seed: 201 },
  [ACOUSTIC.GLASS_ATRIUM]:  { decay: 4.2, damping: 0.30, predelay: 0.022, diffusion: 0.72, seed: 211 },
  [ACOUSTIC.PADDED_LOUNGE]: { decay: 0.85, damping: 0.86, predelay: 0.007, diffusion: 0.45, seed: 221 },
  [ACOUSTIC.MARBLE_HALL]:   { decay: 2.6, damping: 0.22, predelay: 0.013, diffusion: 0.8, seed: 231 },
  [ACOUSTIC.MACHINE_ROOM]:  { decay: 1.5, damping: 0.55, predelay: 0.009, diffusion: 0.62, seed: 241 },
  [ACOUSTIC.SHOW_HALL]:     { decay: 2.1, damping: 0.42, predelay: 0.011, diffusion: 0.68, seed: 251 },
  [ACOUSTIC.OPEN_AIR]:      { decay: 0.5, damping: 0.75, predelay: 0.004, diffusion: 0.25, seed: 261 }
};

/** How much of the dry signal is sent to the convolver, per profile. */
const ROOM_WET = {
  [ACOUSTIC.STONE_VAULT]: 0.42,
  [ACOUSTIC.GLASS_ATRIUM]: 0.36,
  [ACOUSTIC.PADDED_LOUNGE]: 0.12,
  [ACOUSTIC.MARBLE_HALL]: 0.34,
  [ACOUSTIC.MACHINE_ROOM]: 0.22,
  [ACOUSTIC.SHOW_HALL]: 0.28,
  [ACOUSTIC.OPEN_AIR]: 0.05
};

/**
 * The ambience layers. `build` returns an AudioBuffer; `target(ctx)` returns
 * the gain this layer should sit at given the current world state, which is
 * what makes the mix cross-fade rather than hard-cut on a mode change (E.5).
 */
const LAYERS = [
  {
    id: 'cityHum', gain: 0.16, filter: { type: 'lowpass', freq: 320, q: 0.7 },
    build: (ctx) => Synth.brownNoise(ctx, 8, 3),
    target: (s) => 0.5 + (1 - s.night) * 0.35
  },
  {
    id: 'water', gain: 0.26, filter: { type: 'lowpass', freq: 1400, q: 0.8 },
    build: (ctx) => Synth.waterLapping(ctx, 8, 11),
    // Loudest at the canal and the court; still audible campus-wide.
    target: (s) => 0.32 + s.nearWater * 0.68
  },
  {
    id: 'birds', gain: 0.30, filter: { type: 'highpass', freq: 900, q: 0.6 },
    build: (ctx) => Synth.birdsong(ctx, 12, 41),
    // Day only, and never during rain.
    target: (s) => clamp(1 - s.night * 1.6, 0, 1) * (1 - s.rain * 0.9) * (1 - s.interior * 0.75)
  },
  {
    id: 'crickets', gain: 0.24, filter: { type: 'highpass', freq: 2200, q: 0.7 },
    build: (ctx) => Synth.crickets(ctx, 8, 51),
    target: (s) => clamp(s.night * 1.5 - 0.25, 0, 1) * (1 - s.rain * 0.85) * (1 - s.interior * 0.8)
  },
  {
    id: 'wind', gain: 0.34, filter: { type: 'bandpass', freq: 620, q: 0.55 },
    build: (ctx) => Synth.pinkNoise(ctx, 8, 2),
    // Scales with the internal wind value, and rises with altitude (D.4).
    target: (s) => clamp(s.wind * 0.85 + s.altitude * 0.4, 0, 1)
  },
  {
    id: 'rain', gain: 0.42, filter: { type: 'highpass', freq: 420, q: 0.5 },
    build: (ctx) => Synth.rainBuffer(ctx, 6, 21),
    target: (s) => s.rain * (1 - s.interior * 0.55)
  },
  {
    id: 'murmur', gain: 0.20, filter: { type: 'lowpass', freq: 900, q: 0.7 },
    build: (ctx) => Synth.crowdMurmur(ctx, 10, 71),
    target: (s) => (0.2 + s.interior * 0.55) * (1 - s.construction * 0.8)
  },
  {
    id: 'pad', gain: 0.14, filter: { type: 'lowpass', freq: 2600, q: 0.5 },
    build: (ctx) => Synth.wonderPad(ctx, 24, 61),
    // The "wonder" drone — always present, lifted at night and golden hour.
    target: (s) => 0.45 + s.night * 0.4 + s.golden * 0.25
  },
  /* ---- Construction mode only (E.5) ---- */
  {
    id: 'craneMotor', gain: 0.26, filter: { type: 'lowpass', freq: 520, q: 0.8 },
    build: (ctx) => Synth.craneMotor(ctx, 9, 81),
    target: (s) => s.construction * s.craneActivity
  },
  {
    id: 'hammering', gain: 0.22, filter: { type: 'bandpass', freq: 1400, q: 0.6 },
    build: (ctx) => Synth.hammering(ctx, 8, 91),
    target: (s) => s.construction * s.workerActivity
  },
  {
    id: 'trucks', gain: 0.24, filter: { type: 'lowpass', freq: 380, q: 0.8 },
    build: (ctx) => Synth.truckEngines(ctx, 10, 101),
    target: (s) => s.construction * s.truckActivity
  },
  {
    id: 'beeper', gain: 0.14, filter: { type: 'bandpass', freq: 1180, q: 3.0 },
    build: (ctx) => Synth.siteBeeper(ctx, 6, 111),
    target: (s) => s.construction * s.truckActivity * 0.7
  }
];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;          // M key
    this.masterLevel = 0.8;
    this.layers = new Map();
    this.oneShots = new Map();
    this.irCache = new Map();
    this.currentAcoustic = ACOUSTIC.OPEN_AIR;
    this.wetTarget = 0.05;
    this.failed = false;

    /** World state the mix reads from; updated every frame. */
    this.state = {
      night: 0, golden: 0, rain: 0, wind: 0.25, interior: 0, altitude: 0,
      nearWater: 0, construction: 0,
      craneActivity: 0, workerActivity: 0, truckActivity: 0
    };
  }

  /** True once the graph exists and the context is running. */
  get running() { return this.ready && this.ctx && this.ctx.state === 'running'; }

  /**
   * Build the graph. Must be called from a user gesture — browsers refuse to
   * start an AudioContext otherwise. Safe to call repeatedly.
   */
  async init() {
    if (this.ready || this.failed) return this.ready;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.failed = true; return false; }
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.buildGraph();
      this.ready = true;
      await this.resume();
      return true;
    } catch (err) {
      console.warn('AEON SPIRE: audio unavailable —', err && err.message);
      this.failed = true;
      return false;
    }
  }

  async resume() {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
    return this.ctx.state === 'running';
  }

  buildGraph() {
    const ctx = this.ctx;

    /* A gentle limiter keeps the layered mix from clipping. */
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.006;
    this.limiter.release.value = 0.22;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.masterLevel : 0;
    this.master.connect(this.limiter);

    /* Dry bus and the convolver send that gives each room its character. */
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.master);

    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.wetSend = ctx.createGain();
    this.wetSend.gain.value = 0.05;
    this.wetReturn = ctx.createGain();
    this.wetReturn.gain.value = 1;
    this.wetSend.connect(this.convolver);
    this.convolver.connect(this.wetReturn);
    this.wetReturn.connect(this.master);

    this.setAcoustic(ACOUSTIC.OPEN_AIR, true);

    /* Build every ambience layer. */
    for (const def of LAYERS) {
      const buffer = def.build(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = def.filter.type;
      filter.frequency.value = def.filter.freq;
      filter.Q.value = def.filter.q;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.dry);
      gain.connect(this.wetSend);
      src.start(0);

      this.layers.set(def.id, { def, src, filter, gain, level: 0 });
    }

    /* One-shot buffers, built once and replayed on demand. */
    this.oneShots.set('thunder', Synth.thunderBuffer(ctx, 5.5, 31));
    this.oneShots.set('chime', Synth.elevatorChime(ctx, 121));
    this.oneShots.set('whir', Synth.hydraulicWhir(ctx, 131));
    this.oneShots.set('playChime', Synth.playChime(ctx, 141));
    this.oneShots.set('stepStone', Synth.footstep(ctx, 'stone', 151));
    this.oneShots.set('stepCarpet', Synth.footstep(ctx, 'carpet', 152));
    this.oneShots.set('stepMetal', Synth.footstep(ctx, 'metal', 153));
  }

  /* ------------------------------------------------------------------ */
  /* Room acoustics                                                      */
  /* ------------------------------------------------------------------ */

  /** Swap the convolver's impulse response for a new room profile (D.8). */
  setAcoustic(profile, instant = false) {
    if (!this.ctx) { this.currentAcoustic = profile; return; }
    const key = profile || ACOUSTIC.OPEN_AIR;
    if (key === this.currentAcoustic && this.convolver.buffer) return;
    let ir = this.irCache.get(key);
    if (!ir) {
      ir = Synth.impulseResponse(this.ctx, ROOM_IR[key] || ROOM_IR[ACOUSTIC.OPEN_AIR]);
      this.irCache.set(key, ir);
    }
    this.currentAcoustic = key;
    this.convolver.buffer = ir;
    this.wetTarget = ROOM_WET[key] ?? 0.1;
    if (instant && this.wetSend) this.wetSend.gain.value = this.wetTarget;
  }

  /** Called by the InteriorManager when the camera changes rooms. */
  onRoomChange(room) {
    this.setAcoustic(room ? room.acoustic : ACOUSTIC.OPEN_AIR);
    this.state.interior = room ? 1 : 0;
  }

  /* ------------------------------------------------------------------ */
  /* One-shots                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Play a one-shot.
   * @param {string} id
   * @param {object} o { gain, delay, rate, pan }
   */
  play(id, { gain = 1, delay = 0, rate = 1, pan = 0 } = {}) {
    if (!this.running || !this.enabled) return null;
    const buf = this.oneShots.get(id);
    if (!buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.dry);
    node.connect(this.wetSend);
    src.start(ctx.currentTime + Math.max(0, delay));
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    return src;
  }

  /** Distant thunder, scheduled by the weather system. */
  thunder(delaySeconds, strength = 1) {
    return this.play('thunder', {
      gain: 0.55 * strength * clamp(1.4 - delaySeconds * 0.09, 0.25, 1.2),
      delay: delaySeconds,
      rate: 0.82 + Math.random() * 0.2,
      pan: (Math.random() - 0.5) * 1.2
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mix                                                                 */
  /* ------------------------------------------------------------------ */

  /** M key. */
  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.enabled ? this.masterLevel : 0, t, 0.25);
    }
    return this.enabled;
  }

  setEnabled(on) { if (!!on !== this.enabled) this.toggle(); return this.enabled; }

  /**
   * Publish world state and cross-fade every layer toward its target.
   * Nothing here ever hard-cuts: each gain uses `setTargetAtTime`, so a
   * mode change glides (E.5).
   */
  update(dt, world) {
    if (world) Object.assign(this.state, world);
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const s = this.state;

    for (const layer of this.layers.values()) {
      const want = clamp(layer.def.target(s), 0, 1) * layer.def.gain;
      if (Math.abs(want - layer.level) > 0.0015) {
        layer.level = want;
        // ~0.6 s glide: fast enough to feel responsive, slow enough that a
        // time-of-day or weather change reads as a cross-fade.
        layer.gain.gain.setTargetAtTime(want, t, 0.6);
      }
    }

    // The convolver send follows the room, also glided.
    this.wetSend.gain.setTargetAtTime(this.wetTarget, t, 0.35);
  }

  /** For the HUD and the QA harness. */
  status() {
    const mix = {};
    for (const [id, l] of this.layers) mix[id] = +l.level.toFixed(4);
    return {
      available: !this.failed,
      ready: this.ready,
      running: this.running,
      enabled: this.enabled,
      acoustic: this.currentAcoustic,
      wet: this.wetSend ? +this.wetSend.gain.value.toFixed(3) : 0,
      layers: mix
    };
  }

  dispose() {
    if (!this.ctx) return;
    for (const l of this.layers.values()) { try { l.src.stop(); } catch (e) {} }
    this.layers.clear();
    try { this.ctx.close(); } catch (e) {}
    this.ctx = null;
    this.ready = false;
  }
}
