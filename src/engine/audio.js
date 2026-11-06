/**
 * The soundtrack of Hyderabad airport, synthesised.
 *
 * No audio files: everything is built from noise buffers and oscillators in the
 * Web Audio graph, lazily on the first user gesture (`resume()`).
 *
 * A fixed set of always-running "beds" (wind, site, rain, terminal, tower,
 * jets, night/dawn) is crossfaded from the world state in `update()`.  One-shot
 * voices (footsteps, chimes, beeps, ATC squelch bursts, bird calls, thunder, UI
 * cues) are short-lived nodes that disconnect themselves when they end; the
 * number alive at once is capped, so the node count stays bounded.
 */

const STORAGE_KEY = 'hdd.audio';
const MAX_VOICES = 36;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

function whiteBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Brown noise: energy falls with frequency, which is what wind and rumble are. */
function brownBuffer(ctx, seconds = 4) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
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
    this._acc = 0;
    this._voices = 0;
    this._next = { work: 2, beep: 5, bird: 3, pa: 10, atc: 3, drop: 0, thunder: 20, hammer: 3 };
    this._restore();
  }

  get nodeCount() {
    return this._nodes || 0;
  }

  _restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.volume === 'number') this.volume = clamp(saved.volume);
      if (typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      /* storage unavailable: defaults are fine */
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  /** Build the graph on the first call; returns true once the context is running. */
  resume() {
    if (this._disposed) return false;
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return false;
    if (!this.ctx) {
      try {
        this.ctx = new Ctx();
        this._build();
        this.ctx.onstatechange = () => {
          this.ready = !!this.ctx && this.ctx.state === 'running';
        };
      } catch {
        this.ctx = null;
        return false;
      }
    }
    if (this.ctx.state === 'suspended') {
      try {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    this.ready = this.ctx.state === 'running';
    return this.ready;
  }

  _n(node) {
    this._nodes = (this._nodes || 0) + 1;
    return node;
  }

  _gain(v = 0, dest = null) {
    const g = this._n(this.ctx.createGain());
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  _filter(type, freq, q = 0.7, dest = null) {
    const f = this._n(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }

  _osc(type, freq, dest = null) {
    const o = this._n(this.ctx.createOscillator());
    o.type = type;
    o.frequency.value = freq;
    if (dest) o.connect(dest);
    o.start();
    return o;
  }

  _build() {
    const ctx = this.ctx;
    this.master = this._gain(this.muted ? 0 : this.volume);
    const comp = this._n(ctx.createDynamicsCompressor());
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // Room reflections: two-tap feedback delay (no impulse-response asset).
    this.reverbIn = this._gain(0);
    const delay = this._n(ctx.createDelay(0.5));
    delay.delayTime.value = 0.085;
    const fb = this._gain(0.4);
    const damp = this._filter('lowpass', 1800, 0.7);
    this.reverbIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    this.white = whiteBuffer(ctx);
    this.brown = brownBuffer(ctx);

    const b = this.beds;
    // Wind (+ a high whistle that rises with altitude in drone mode).
    b.wind = this._bed(this.brown, 'bandpass', 420, 0.7);
    b.whistle = this._bed(this.white, 'bandpass', 1300, 14);
    b.sand = this._bed(this.white, 'highpass', 3000, 0.5);

    // Construction diesel: two detuned saws through a lowpass, throbbing.
    b.diesel = { gain: this._gain(0, this.master) };
    const dLp = this._filter('lowpass', 240, 1.2, b.diesel.gain);
    const dThrob = this._gain(0.6, dLp);
    this._osc('sawtooth', 46, dThrob);
    this._osc('sawtooth', 47.6, dThrob);
    const dLfo = this._osc('sine', 7.5);
    const dLfoG = this._gain(0.35);
    dLfo.connect(dLfoG);
    dLfoG.connect(dThrob.gain);
    b.diesel.lfo = dLfo;

    // Rain: bright hiss + roof drum (indoors).
    b.rain = this._bed(this.white, 'highpass', 1800, 0.4);
    b.rainLow = this._bed(this.white, 'bandpass', 700, 0.6);
    b.roof = this._bed(this.brown, 'bandpass', 260, 2.2);

    // Terminal murmur: formant-ish noise with slow amplitude wobble.
    b.murmur = this._bed(this.white, 'bandpass', 480, 1.4);
    const mLfo = this._osc('sine', 0.35);
    const mLfoG = this._gain(0.4);
    mLfo.connect(mLfoG);
    mLfoG.connect(b.murmur.gain.gain);
    b.hvac = this._bed(this.brown, 'lowpass', 160, 0.8);

    // Tower: mains hum + fan whisper.
    b.hum = { gain: this._gain(0, this.master) };
    this._osc('sine', 100, b.hum.gain);
    const h2 = this._gain(0.4, b.hum.gain);
    this._osc('sine', 200, h2);
    b.fan = this._bed(this.white, 'lowpass', 900, 0.5);

    // Radio chain for ATC chatter.
    this.radioIn = this._filter('bandpass', 1700, 0.9);
    const radioOut = this._gain(1, this.master);
    this.radioIn.connect(radioOut);
    const radioSend = this._gain(0.15, this.reverbIn);
    this.radioIn.connect(radioSend);

    // Jets: broadband roar + whine.
    b.jetRoar = this._bed(this.white, 'lowpass', 500, 0.6);
    b.jetRumble = this._bed(this.brown, 'lowpass', 140, 0.8);
    b.jetWhine = { gain: this._gain(0, this.master) };
    const wf = this._filter('lowpass', 2400, 0.8, b.jetWhine.gain);
    b.jetWhine.osc = this._osc('sawtooth', 600, wf);
    b.jetWhine.osc2 = this._osc('square', 910, this._gain(0.4, wf));

    // Crickets: high sine gated by a fast square LFO, with a slow swell.
    b.crickets = { gain: this._gain(0, this.master) };
    const cGate = this._gain(0, b.crickets.gain);
    this._osc('sine', 4300, cGate);
    const cLfo = this._osc('square', 17, this._gain(0.5, cGate.gain));
    const cSlow = this._osc('sine', 1.1, this._gain(0.25, cGate.gain));
    b.crickets.lfo = cLfo;
    b.crickets.slow = cSlow;
  }

  /** One looping noise source through a filter into its own gain. */
  _bed(buffer, type, freq, q) {
    const src = this._n(this.ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const filter = this._filter(type, freq, q);
    const gain = this._gain(0, this.master);
    src.connect(filter);
    filter.connect(gain);
    src.start(0, Math.random() * 1.5);
    return { src, filter, gain };
  }

  setVolume(v) {
    this.volume = clamp(num(v, this.volume));
    this.muted = false;
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this._persist();
    return this.volume;
  }

  toggleMute(force) {
    this.muted = force === undefined ? !this.muted : !!force;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    this._persist();
    return this.muted;
  }

  dispose() {
    this._disposed = true;
    this.ready = false;
    if (this.ctx) {
      this.ctx.onstatechange = null;
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.beds = {};
    this.master = null;
  }

  _ramp(param, value, t = 0.4) {
    param.setTargetAtTime(value, this.ctx.currentTime, t);
  }

  // --------------------------------------------------------------------------
  // World-driven mix
  // --------------------------------------------------------------------------

  update(dt, s = {}) {
    if (!this.ready || !this.ctx || this._disposed) return;
    dt = clamp(num(dt, 0.016), 0, 0.5);
    this._time += dt;
    this._acc += dt;
    const t = this._time;
    const live = !this.muted;
    // Gain targets are cheap but pointless at 60 Hz.
    const doMix = this._acc >= 0.05;
    if (doMix) this._acc = 0;

    const interior = s.interior === 'terminal' || s.interior === 'tower' ? s.interior : s.interior ? 'terminal' : null;
    const inside = interior ? 1 : 0;
    const out = 1 - inside;
    const inTerm = interior === 'terminal' ? 1 : 0;
    const inTower = interior === 'tower' ? 1 : 0;
    const ops = s.mode === 'ops' ? 1 : 0;
    const day = clamp(num(s.day, 1));
    const night = 1 - clamp((day - 0.05) / 0.2);
    const w = s.weather || {};
    const kind = w.kind || 'clear';
    const inten = clamp(num(w.intensity, kind === 'clear' ? 0 : 0.6));
    const work = clamp(num(s.work, 0));
    const alt = Math.max(0, num(s.altitude, 0));
    const drone = s.mode === 'drone' ? 1 : 0;
    const rainK = kind === 'rain' ? inten : 0;
    const dustK = kind === 'dust' ? inten : 0;
    const wind = clamp(num(w.windSpeed, 4) / 14);

    if (doMix) {
      const b = this.beds;
      const R = (p, v, tc) => this._ramp(p, v, tc);
      // Wind: gusts on incommensurate cycles; louder in dust/heat, muffled indoors.
      const gust = 0.5 + 0.3 * Math.sin(t * 0.13) + 0.2 * Math.sin(t * 0.37 + 1.1);
      const windAmt = (0.04 + wind * 0.08 + dustK * 0.12 + (kind === 'heat' ? 0.02 : 0)) * (0.6 + gust * 0.8);
      R(b.wind.gain.gain, windAmt * (out + inside * 0.12), 0.8);
      R(b.wind.filter.frequency, 280 + gust * 380 + dustK * 250, 1.2);
      R(b.sand.gain.gain, out * dustK * (0.012 + gust * 0.02), 0.9);
      const whistle = drone * clamp((alt - 15) / 160) * (0.4 + gust * 0.6);
      R(b.whistle.gain.gain, whistle * 0.012, 0.6);
      R(b.whistle.filter.frequency, 900 + clamp(alt / 300) * 1800 + gust * 300, 0.8);

      // Site works: audible outdoors (and faintly in the terminal).
      const siteK = work * (out * 1 + inTerm * 0.12 + inTower * 0.2) * (night > 0.8 ? 0.6 : 1);
      R(b.diesel.gain.gain, siteK * 0.05, 0.9);
      b.diesel.lfo.frequency.setTargetAtTime(6 + work * 4, this.ctx.currentTime, 1);

      // Rain: bright hiss outside, muffled with a roof drum inside.
      R(b.rain.gain.gain, rainK * (out * 0.07 + inside * 0.01), 0.7);
      R(b.rainLow.gain.gain, rainK * (out * 0.05 + inside * 0.02), 0.7);
      R(b.roof.gain.gain, rainK * inside * 0.28, 0.8);

      // Terminal room tone.
      R(b.murmur.gain.gain, inTerm * 0.045, 0.9);
      R(b.hvac.gain.gain, inTerm * 0.1 + inTower * 0.05, 1.0);
      R(this.reverbIn.gain, inTerm * 0.5 + inTower * 0.12, 0.9);

      // Tower hum + fan.
      R(b.hum.gain.gain, inTower * 0.02 + ops * out * 0.002, 0.9);
      R(b.fan.gain.gain, inTower * 0.015, 0.9);

      // Jets: inverse-distance attenuation; thrust drives pitch and filter.
      const jets = s.jets;
      let jetAmt = 0;
      let thrust = 0;
      if (jets && isFinite(jets.nearest)) {
        const d = Math.max(30, jets.nearest);
        jetAmt = clamp(260 / d) * clamp(1 - d / 2200 + 0.2) * (out + inside * 0.15);
        thrust = clamp(num(jets.thrust, 0));
        jetAmt *= 0.25 + thrust * 0.75;
      }
      R(b.jetRoar.gain.gain, jetAmt * 0.3, 0.35);
      R(b.jetRoar.filter.frequency, 280 + thrust * 1700, 0.4);
      R(b.jetRumble.gain.gain, jetAmt * 0.5, 0.35);
      R(b.jetWhine.gain.gain, jetAmt * thrust * 0.014, 0.35);
      b.jetWhine.osc.frequency.setTargetAtTime(380 + thrust * 1100, this.ctx.currentTime, 0.3);
      b.jetWhine.osc2.frequency.setTargetAtTime((380 + thrust * 1100) * 1.52, this.ctx.currentTime, 0.3);

      // Night crickets (clear-ish nights, outdoors).
      R(b.crickets.gain.gain, night * out * (kind === 'rain' ? 0.1 : 1) * (1 - drone * 0.8) * 0.018, 1.5);
    }

    if (!live) return;
    const nx = this._next;

    // ---- one-shots scheduled from state ----
    if (out && work > 0.05 && day > 0.1) {
      if (t > nx.work) {
        nx.work = t + 1.2 + (Math.random() * 3.5) / Math.max(0.2, work);
        this._thump(work);
      }
      if (t > nx.beep) {
        nx.beep = t + 6 + Math.random() * 9;
        this._reverseBeeps(work);
      }
      if (t > nx.hammer) {
        nx.hammer = t + 4 + Math.random() * 6;
        this._hammer(work);
      }
    }
    if (rainK > 0.05 && t > nx.drop) {
      nx.drop = t + 0.04 + Math.random() * 0.25 / Math.max(0.2, rainK);
      this._droplet(out ? 0.012 : 0.006, out);
    }
    if (rainK > 0.7 && t > nx.thunder) {
      nx.thunder = t + 25 + Math.random() * 50;
      this.ui('thunder');
    }
    if (out && day > 0.12 && day < 0.6 && kind !== 'rain' && kind !== 'dust' && t > nx.bird) {
      // Dawn chorus: busier when the sun is low.
      nx.bird = t + 1.5 + Math.random() * 5 * (0.4 + day);
      this._bird();
    }
    if (inTerm && t > nx.pa) {
      nx.pa = t + 18 + Math.random() * 28;
      this._paChime();
    }
    if ((inTower || ops) && t > nx.atc) {
      nx.atc = t + 3 + Math.random() * 7;
      this._atc(inTower ? 1 : 0.45);
    }
  }

  // --------------------------------------------------------------------------
  // Voices
  // --------------------------------------------------------------------------

  /**
   * Run a short voice: `build(end)` creates nodes and returns the ones to
   * disconnect; `end` is a callback taking the stop time of the last source.
   * Returns false (and builds nothing) when the voice cap is reached.
   */
  _voice(build) {
    if (!this.ready || this._voices >= MAX_VOICES) return false;
    const sources = [];
    const nodes = [];
    const reg = (n, isSource) => {
      nodes.push(n);
      if (isSource) sources.push(n);
      return n;
    };
    this._voices++;
    let left = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this._voices--;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
    const track = (src) => {
      left++;
      src.onended = () => {
        if (--left <= 0) finish();
      };
    };
    try {
      build(reg, track);
    } catch {
      finish();
      return false;
    }
    if (left === 0) finish();
    return true;
  }

  /** Filtered noise burst with attack/decay; `when` offsets the start (s). */
  _burst({ gain = 0.2, freq = 1200, q = 1, type = 'bandpass', attack = 0.002, decay = 0.12, buffer = null, send = 0, when = 0, dest = null }) {
    return this._voice((reg, track) => {
      const ctx = this.ctx;
      const src = reg(ctx.createBufferSource(), true);
      src.buffer = buffer || this.white;
      src.loop = true;
      const filter = reg(ctx.createBiquadFilter());
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const amp = reg(ctx.createGain());
      const t0 = ctx.currentTime + when;
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      src.connect(filter);
      filter.connect(amp);
      amp.connect(dest || this.master);
      if (send > 0) {
        const sg = reg(ctx.createGain());
        sg.gain.value = send;
        amp.connect(sg);
        sg.connect(this.reverbIn);
      }
      track(src);
      src.start(t0, Math.random());
      src.stop(t0 + attack + decay + 0.05);
    });
  }

  /** Pitched tone with envelope. */
  _tone({ freq = 440, to = 0, type = 'sine', gain = 0.05, attack = 0.01, decay = 0.3, when = 0, send = 0, dest = null }) {
    return this._voice((reg, track) => {
      const ctx = this.ctx;
      const osc = reg(ctx.createOscillator(), true);
      osc.type = type;
      const t0 = ctx.currentTime + when;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
      const amp = reg(ctx.createGain());
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      osc.connect(amp);
      amp.connect(dest || this.master);
      if (send > 0) {
        const sg = reg(ctx.createGain());
        sg.gain.value = send;
        amp.connect(sg);
        sg.connect(this.reverbIn);
      }
      track(osc);
      osc.start(t0);
      osc.stop(t0 + attack + decay + 0.05);
    });
  }

  /**
   * Footfall by surface: sand (soft dark thud), asphalt (gritty scuff),
   * concrete (dull tap), tile (bright click + room tail), metal (ringing clank).
   */
  footstep(surface = 'sand', sprinting = false, indoor = false) {
    if (!this.ready || this.muted) return;
    const k = sprinting ? 1.5 : 1;
    const room = indoor ? 0.5 : 0.05;
    switch (surface) {
      case 'asphalt':
        this._burst({ gain: 0.04 * k, freq: 1500, q: 0.7, decay: 0.07 });
        this._burst({ gain: 0.03 * k, freq: 260, q: 1, type: 'lowpass', decay: 0.1 });
        break;
      case 'concrete':
        this._burst({ gain: 0.045 * k, freq: 1900, q: 0.8, decay: 0.05, send: room });
        this._burst({ gain: 0.035 * k, freq: 320, q: 1.2, type: 'lowpass', decay: 0.11, send: room * 0.6 });
        break;
      case 'tile':
        this._burst({ gain: 0.06 * k, freq: 3200, q: 1.2, decay: 0.035, send: room });
        this._burst({ gain: 0.03 * k, freq: 520, q: 1.2, decay: 0.09, send: room * 0.8 });
        break;
      case 'metal':
        this._burst({ gain: 0.05 * k, freq: 2200, q: 1, decay: 0.04, send: room });
        this._tone({ freq: 340 + Math.random() * 60, type: 'triangle', gain: 0.018 * k, decay: 0.22, send: room });
        this._tone({ freq: 870 + Math.random() * 100, type: 'sine', gain: 0.008 * k, decay: 0.16 });
        break;
      default:
        this._burst({ gain: 0.045 * k, freq: 700, q: 0.6, type: 'lowpass', decay: 0.1 });
        this._burst({ gain: 0.012 * k, freq: 3800, q: 0.5, type: 'highpass', decay: 0.08 });
    }
  }

  /** Discovery sting: a bright two-note chime with a tail. */
  discovery() {
    if (!this.ready || this.muted) return;
    this._tone({ freq: 523.25, type: 'triangle', gain: 0.05, decay: 0.9, send: 0.3 });
    this._tone({ freq: 784, type: 'triangle', gain: 0.03, decay: 1.1, send: 0.3, when: 0.07 });
    this._tone({ freq: 1568, type: 'sine', gain: 0.012, decay: 0.7, send: 0.3, when: 0.07 });
  }

  /** Interface cues. */
  ui(kind = 'click') {
    if (!this.ready || this.muted) return;
    const T = (f, o = {}) => this._tone({ freq: f, ...o });
    switch (kind) {
      case 'open':
        T(420, { to: 680, type: 'sine', gain: 0.03, decay: 0.12 });
        break;
      case 'close':
        T(620, { to: 360, type: 'sine', gain: 0.03, decay: 0.12 });
        break;
      case 'toast':
        T(880, { type: 'sine', gain: 0.025, decay: 0.18 });
        T(1175, { type: 'sine', gain: 0.018, decay: 0.2, when: 0.08 });
        break;
      case 'good':
        T(523.25, { type: 'triangle', gain: 0.04, decay: 0.2 });
        T(659.25, { type: 'triangle', gain: 0.04, decay: 0.2, when: 0.09 });
        T(783.99, { type: 'triangle', gain: 0.045, decay: 0.45, when: 0.18, send: 0.2 });
        break;
      case 'warn':
        T(466, { type: 'square', gain: 0.018, decay: 0.14 });
        T(466, { type: 'square', gain: 0.018, decay: 0.14, when: 0.2 });
        break;
      case 'bad':
        T(330, { to: 220, type: 'sawtooth', gain: 0.03, decay: 0.28 });
        T(247, { to: 165, type: 'sawtooth', gain: 0.03, decay: 0.38, when: 0.15 });
        break;
      case 'decision':
        T(392, { type: 'triangle', gain: 0.04, decay: 0.35, send: 0.25 });
        T(587.33, { type: 'triangle', gain: 0.035, decay: 0.5, when: 0.12, send: 0.25 });
        break;
      case 'milestone':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => T(f, { type: 'triangle', gain: 0.04, decay: 0.5 + i * 0.15, when: i * 0.11, send: 0.35 }));
        break;
      case 'xp':
        T(1318.5, { type: 'sine', gain: 0.025, decay: 0.1 });
        T(1760, { type: 'sine', gain: 0.02, decay: 0.16, when: 0.06 });
        break;
      case 'badge':
        [659.25, 830.6, 987.77, 1318.5].forEach((f, i) => T(f, { type: 'sine', gain: 0.035, decay: 0.6, when: i * 0.07, send: 0.4 }));
        this._burst({ gain: 0.01, freq: 6000, q: 0.5, type: 'highpass', decay: 0.4, when: 0.2 });
        break;
      case 'thunder':
        this._thunder();
        break;
      default: // click
        this._burst({ gain: 0.03, freq: 2600, q: 1.5, decay: 0.02 });
        T(1100, { type: 'sine', gain: 0.012, decay: 0.04 });
    }
  }

  _thunder() {
    this._burst({ gain: 0.32, freq: 120, q: 0.7, type: 'lowpass', attack: 0.15, decay: 2.8, buffer: this.brown, send: 0.3, when: 0.05 });
    this._burst({ gain: 0.18, freq: 70, q: 0.7, type: 'lowpass', attack: 0.5, decay: 3.5, buffer: this.brown, when: 0.6 });
    this._burst({ gain: 0.1, freq: 600, q: 0.5, type: 'lowpass', attack: 0.02, decay: 0.6, buffer: this.brown });
  }

  // ---- site ----

  _thump(work) {
    this._tone({ freq: 90 + Math.random() * 25, to: 40, type: 'sine', gain: 0.05 + 0.05 * work, decay: 0.16 });
    this._burst({ gain: 0.02 + 0.02 * work, freq: 400, q: 0.8, type: 'lowpass', decay: 0.1, buffer: this.brown });
  }

  /** Hammer taps in a short run. */
  _hammer(work) {
    const n = 2 + Math.floor(Math.random() * 4);
    let when = 0;
    for (let i = 0; i < n; i++) {
      this._burst({ gain: 0.01 + 0.014 * work, freq: 2400 + Math.random() * 1600, q: 5, decay: 0.05, when, send: 0.05 });
      when += 0.15 + Math.random() * 0.06;
    }
  }

  /** Reversing-vehicle beeps: four 1 kHz pips, slightly distant. */
  _reverseBeeps(work) {
    for (let i = 0; i < 4; i++) {
      this._tone({ freq: 1000, type: 'square', gain: 0.007 + 0.006 * work, attack: 0.004, decay: 0.2, when: i * 0.55 });
    }
  }

  _droplet(gain, outdoors) {
    this._burst({ gain, freq: (outdoors ? 2400 : 1200) + Math.random() * 3000, q: 8, decay: 0.012 + Math.random() * 0.01 });
  }

  _bird() {
    const f = 2200 + Math.random() * 1600;
    const chirps = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chirps; i++) {
      this._tone({ freq: f, to: f * (0.7 + Math.random() * 0.7), type: 'sine', gain: 0.014, attack: 0.01, decay: 0.07 + Math.random() * 0.06, when: i * 0.14 });
    }
  }

  // ---- terminal & tower ----

  /** Two-tone airport PA chime (descending major third) with room tail. */
  _paChime() {
    this._tone({ freq: 659.25, type: 'sine', gain: 0.04, decay: 0.9, send: 0.6 });
    this._tone({ freq: 523.25, type: 'sine', gain: 0.04, decay: 1.2, send: 0.6, when: 0.45 });
  }

  /**
   * Synthesised ATC radio chatter, no speech: a squelch click, then a handful
   * of band-limited noise syllables with a tone-like carrier, then a tail click.
   * `level` scales the whole exchange.
   */
  _atc(level) {
    const syll = 3 + Math.floor(Math.random() * 6);
    const base = 1500 + Math.random() * 600;
    let when = 0;
    this._burst({ gain: 0.03 * level, freq: 3200, q: 1.2, decay: 0.012, dest: this.radioIn, when });
    when += 0.05;
    for (let i = 0; i < syll; i++) {
      const len = 0.06 + Math.random() * 0.14;
      this._burst({ gain: (0.035 + Math.random() * 0.025) * level, freq: base + Math.random() * 900, q: 3 + Math.random() * 3, attack: 0.01, decay: len, dest: this.radioIn, when });
      when += len + 0.04 + Math.random() * (Math.random() < 0.25 ? 0.2 : 0.05);
    }
    this._burst({ gain: 0.025 * level, freq: 2800, q: 1, decay: 0.015, dest: this.radioIn, when });
    // Occasional acknowledgement beep.
    if (Math.random() < 0.45) {
      this._tone({ freq: 1000 + Math.random() * 400, type: 'sine', gain: 0.02 * level, decay: 0.09, dest: this.radioIn, when: when + 0.12 });
    }
  }
}
