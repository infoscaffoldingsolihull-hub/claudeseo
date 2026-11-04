/**
 * The soundtrack of the plateau, synthesised.
 *
 * There are no audio files: the deliverable is a single HTML document, and a
 * few minutes of ambience as base64 would be larger than the whole rest of the
 * build.  Everything here is made from noise buffers and oscillators through
 * the Web Audio graph, which costs a few kilobytes of code and no download at
 * all.
 *
 * The mix is built as a handful of always-running beds whose gains are driven
 * by the world state - wind outside, room tone inside, water near the harbour,
 * the works when the site is busy - plus one-shot voices for footsteps, torch
 * crackle and bird calls.  Browsers will not start an AudioContext until the
 * user has interacted with the page, so nothing is created until `resume()` is
 * called from a real gesture.
 */

const STORAGE_KEY = 'giza.audio';

/** Two seconds of white noise, reused by every noise voice. */
function noiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Brown-ish noise, which is what wind and rumble actually sound like: white
 * noise integrated, so energy falls with frequency instead of being flat.
 */
function brownBuffer(ctx, seconds = 4) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.7;
    this.beds = {};
    this._time = 0;
    this._nextCrackle = 0;
    this._nextBird = 4;
    this._nextWork = 6;
    this._restore();
  }

  _restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.volume === 'number') this.volume = Math.min(1, Math.max(0, saved.volume));
      if (typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      /* localStorage can throw on file:// - the defaults are fine */
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* not important enough to care */
    }
  }

  /**
   * Build the graph.  Safe to call repeatedly; the first call that happens
   * inside a user gesture is the one that sticks.
   */
  resume() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.ctx) {
      try {
        this.ctx = new Ctx();
      } catch {
        return false;
      }
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.ready = this.ctx.state === 'running';
    return this.ready;
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // A short feedback delay stands in for the reflections of a stone chamber.
    // Two taps is enough to hear a room; a convolver would need an impulse
    // response, which is an asset file again.
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.09;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1600;
    this.reverbIn.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(this.master);

    this.noise = noiseBuffer(ctx);
    this.brown = brownBuffer(ctx);

    // ---- wind: brown noise through a slowly swept bandpass ----
    this.beds.wind = this._bed(this.brown, { type: 'bandpass', freq: 420, q: 0.7 }, 0);
    this.windFilter = this.beds.wind.filter;

    // ---- the hiss of sand moving over sand, only outdoors ----
    this.beds.sand = this._bed(this.noise, { type: 'highpass', freq: 2600, q: 0.5 }, 0);

    // ---- room tone: the pressure of a sealed stone chamber ----
    this.beds.room = this._bed(this.brown, { type: 'lowpass', freq: 180, q: 0.9 }, 0);

    // ---- water at the harbour and the canal ----
    this.beds.water = this._bed(this.noise, { type: 'bandpass', freq: 900, q: 0.8 }, 0);
  }

  /** One looping noise source through a filter into its own gain. */
  _bed(buffer, filterSpec, gainValue) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterSpec.type;
    filter.frequency.value = filterSpec.freq;
    filter.Q.value = filterSpec.q;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    return { source, filter, gain };
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    this.muted = false;
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this._persist();
    return this.volume;
  }

  toggleMute(force) {
    this.muted = force === undefined ? !this.muted : !!force;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    this._persist();
    return this.muted;
  }

  _ramp(param, value, time = 0.4) {
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  /**
   * Drive the mix from the world.
   *
   * `state` carries only what the mix needs: whether we are underground, how
   * high the sun is, how hard the crews are working, and how far the listener
   * is from the water.
   */
  update(dt, state) {
    if (!this.ready || !this.ctx) return;
    this._time += dt;
    const inside = state.interior ? 1 : 0;
    const day = state.day === undefined ? 1 : state.day;

    // Wind gusts on two incommensurate cycles so the pattern never settles.
    const gust = 0.5 + 0.3 * Math.sin(this._time * 0.13) + 0.2 * Math.sin(this._time * 0.37 + 1.1);
    this._ramp(this.beds.wind.gain.gain, (1 - inside) * (0.05 + gust * 0.09), 0.8);
    this._ramp(this.windFilter.frequency, 300 + gust * 380, 1.2);
    this._ramp(this.beds.sand.gain.gain, (1 - inside) * gust * 0.012, 1.0);

    // Underground: a low pressure bed, and the delay opens up into a room.
    this._ramp(this.beds.room.gain.gain, inside * 0.16, 0.9);
    this._ramp(this.reverbIn.gain, inside * 0.5, 0.9);

    // Water carries a long way across flat ground at night.
    const water = state.waterDistance === undefined ? 9999 : state.waterDistance;
    const near = Math.max(0, 1 - water / 420);
    this._ramp(this.beds.water.gain.gain, (1 - inside) * near * near * 0.06, 1.0);

    // ---- one-shots ----
    if (state.torchGlow > 0.02 && this._time > this._nextCrackle) {
      this._nextCrackle = this._time + 0.12 + Math.random() * (inside ? 0.5 : 1.6);
      this._crackle(Math.min(1, state.torchGlow) * (inside ? 0.9 : 0.5));
    }
    if (!inside && day > 0.25 && this._time > this._nextBird) {
      this._nextBird = this._time + 9 + Math.random() * 22;
      this._kite();
    }
    if (!inside && day > 0.2 && state.work > 0.05 && this._time > this._nextWork) {
      this._nextWork = this._time + 1.4 + Math.random() * 4.5 / Math.max(0.15, state.work);
      this._chisel(state.work);
    }
  }

  /** A noise burst with a fast decay: the generic percussive voice. */
  _burst({ gain = 0.2, freq = 1200, q = 1, type = 'bandpass', attack = 0.002, decay = 0.12, buffer = null, send = 0 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer || this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gain, now + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      amp.connect(sendGain);
      sendGain.connect(this.reverbIn);
    }
    src.start(now);
    src.stop(now + attack + decay + 0.05);
  }

  /**
   * A footfall.  Sand is a soft, dark thud with no transient; stone is
   * brighter and has a click on the front, which is most of what tells you
   * which one you are walking on.
   */
  footstep(surface = 'sand', sprinting = false, interior = false) {
    if (!this.ready) return;
    const loud = sprinting ? 1.5 : 1;
    if (surface === 'stone') {
      this._burst({ gain: 0.05 * loud, freq: 2400, q: 0.8, decay: 0.05, send: interior ? 0.5 : 0.06 });
      this._burst({ gain: 0.035 * loud, freq: 380, q: 1.2, decay: 0.13, send: interior ? 0.35 : 0.04 });
    } else {
      this._burst({ gain: 0.045 * loud, freq: 780, q: 0.6, type: 'lowpass', decay: 0.1 });
    }
  }

  /** Resin spitting in a torch. */
  _crackle(strength) {
    this._burst({
      gain: 0.012 + Math.random() * 0.03 * strength,
      freq: 1400 + Math.random() * 2600,
      q: 2.5,
      decay: 0.03 + Math.random() * 0.05,
      send: 0.35,
    });
  }

  /** A black kite's descending whistle, the sound of every Egyptian sky. */
  _kite() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1750 + Math.random() * 350, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.9);
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(0.028, now + 0.08);
    amp.gain.setTargetAtTime(0.0001, now + 0.35, 0.22);
    // A little vibrato, or it sounds like a test tone.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 11;
    lfoGain.gain.value = 42;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 1.3);
    lfo.stop(now + 1.3);
  }

  /** A copper chisel on limestone, somewhere out on the site. */
  _chisel(work) {
    const taps = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < taps; i++) {
      const when = i * (0.14 + Math.random() * 0.05);
      setTimeout(() => {
        if (!this.ready) return;
        this._burst({
          gain: 0.006 + 0.012 * work,
          freq: 2600 + Math.random() * 1800,
          q: 6,
          decay: 0.05,
        });
      }, when * 1000);
    }
  }

  /** Stepping through a doorway: a low boom with the room's tail on it. */
  threshold(entering) {
    if (!this.ready) return;
    this._burst({
      gain: 0.09,
      freq: entering ? 150 : 220,
      q: 1.4,
      type: 'lowpass',
      decay: 0.55,
      buffer: this.brown,
      send: entering ? 0.7 : 0.2,
    });
  }

  /** Finding something: a short struck-stone note, not a UI beep. */
  discovery() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [f, g, d] of [[523.25, 0.05, 0.9], [784, 0.03, 1.1]]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      amp.gain.setValueAtTime(0, now);
      amp.gain.linearRampToValueAtTime(g, now + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + d);
      osc.connect(amp);
      amp.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = 0.3;
      amp.connect(send);
      send.connect(this.reverbIn);
      osc.start(now);
      osc.stop(now + d + 0.05);
    }
  }
}
