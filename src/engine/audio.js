/**
 * The soundtrack of Hyderabad airport, synthesised.
 *
 * No audio files: everything is built from noise buffers and oscillators in the
 * Web Audio graph, lazily on the first user gesture (`resume()`).
 *
 * The mix is deliberately calm — a desert morning, not a building site:
 *   - the master starts low (0.35) and fades in over ~4 s after the gesture;
 *   - every noise bed is low-passed (nothing hissy above ~4 kHz);
 *   - construction noise is a faint distant bed that only comes forward when
 *     the camera is close to active work (proximity from `soundscape`);
 *   - radio chatter is rare and quiet, and only in the tower or Operations;
 *   - birdsong (sparrows, mynas, bulbuls, doves, kite whistles) is
 *     procedural, varied, busiest in the morning and near trees.
 *
 * A fixed set of always-running "beds" is crossfaded from the world state in
 * `update()`. One-shot voices (footsteps, chimes, bird calls, thunder, UI cues)
 * are short-lived nodes that disconnect themselves when they end; the number
 * alive at once is capped, so the node count stays bounded.
 */

const STORAGE_KEY = 'hdd.audio.v2';
const LEGACY_KEY = 'hdd.audio';
const DEFAULT_VOLUME = 0.35;
const FADE_IN = 4;
const MAX_VOICES = 28;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Listener context written by the world each frame (camera position and how
 * close it is to trees, birds, water and active works). The audio engine reads
 * it; when nothing writes it (`valid` false) altitude alone is used.
 */
export const soundscape = { valid: false, x: 0, y: 0, z: 0, trees: 0, birds: 0, water: 0, work: 0, hour: NaN };

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

/** Pink-ish noise (Paul Kellet's economy filter): softer than white for rain. */
function pinkBuffer(ctx, seconds = 3) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return buffer;
}

const BIRDS = ['sparrow', 'myna', 'bulbul', 'dove', 'kite', 'babbler'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = DEFAULT_VOLUME;
    this.beds = {};
    this._time = 0;
    this._acc = 0;
    this._voices = 0;
    this._lastBird = '';
    this._next = { work: 6, beep: 40, bird: 1.5, kite: 12, pa: 14, atc: 20, drop: 0, thunder: 25, hammer: 9 };
    this._restore();
  }

  get nodeCount() {
    return this._nodes || 0;
  }

  get voiceCount() {
    return this._voices;
  }

  _restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.volume === 'number') this.volume = clamp(saved.volume);
        if (typeof saved.muted === 'boolean') this.muted = saved.muted;
        return;
      }
      // Earlier builds stored a loud default volume; keep only the mute choice.
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        const saved = JSON.parse(old);
        if (typeof saved.muted === 'boolean') this.muted = saved.muted;
        if (typeof saved.volume === 'number') this.volume = Math.min(DEFAULT_VOLUME, clamp(saved.volume));
      }
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
    const now = ctx.currentTime;
    // master (user volume) → fade-in → gentle top-end roll-off → limiter.
    this.master = this._gain(this.muted ? 0 : this.volume);
    this.fade = this._gain(0);
    this.fade.gain.setValueAtTime(0, now);
    this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    this.fade.gain.linearRampToValueAtTime(1, now + 0.25 + FADE_IN);
    const tame = this._filter('lowpass', 7500, 0.5);
    const comp = this._n(ctx.createDynamicsCompressor());
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(this.fade);
    this.fade.connect(tame);
    tame.connect(comp);
    comp.connect(ctx.destination);

    // Room reflections: two-tap feedback delay (no impulse-response asset).
    this.reverbIn = this._gain(0);
    const delay = this._n(ctx.createDelay(0.5));
    delay.delayTime.value = 0.085;
    const fb = this._gain(0.35);
    const damp = this._filter('lowpass', 1500, 0.7);
    this.reverbIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    // Open-air "distance" send for birds: a long soft echo off the plain.
    this.airIn = this._gain(1);
    const airDelay = this._n(ctx.createDelay(1));
    airDelay.delayTime.value = 0.23;
    const airFb = this._gain(0.22);
    const airDamp = this._filter('lowpass', 2600, 0.5);
    this.airIn.connect(airDelay);
    airDelay.connect(airDamp);
    airDamp.connect(airFb);
    airFb.connect(airDelay);
    const airOut = this._gain(0.35, this.master);
    airDamp.connect(airOut);

    this.white = whiteBuffer(ctx);
    this.brown = brownBuffer(ctx);
    this.pink = pinkBuffer(ctx);

    const b = this.beds;
    // Wind: soft low rush; a second, airier layer for gusts (both low-passed).
    b.wind = this._bed(this.brown, 'lowpass', 520, 0.5);
    b.breeze = this._bed(this.pink, 'bandpass', 700, 0.6, 1400);
    b.whistle = this._bed(this.pink, 'bandpass', 1100, 6, 1800);
    b.sand = this._bed(this.pink, 'bandpass', 1500, 0.6, 2600);

    // Distant construction: a low diesel murmur (two detuned saws, heavily filtered).
    b.diesel = { gain: this._gain(0, this.master) };
    const dLp = this._filter('lowpass', 150, 0.8, b.diesel.gain);
    const dThrob = this._gain(0.6, dLp);
    this._osc('sawtooth', 46, dThrob);
    this._osc('sawtooth', 47.3, dThrob);
    const dLfo = this._osc('sine', 5.5);
    const dLfoG = this._gain(0.25);
    dLfo.connect(dLfoG);
    dLfoG.connect(dThrob.gain);
    b.diesel.lfo = dLfo;

    // Rain: soft pink wash + low patter; roof drum indoors.
    b.rain = this._bed(this.pink, 'bandpass', 1600, 0.4, 3800);
    b.rainLow = this._bed(this.brown, 'bandpass', 500, 0.6);
    b.roof = this._bed(this.brown, 'bandpass', 240, 2.0);

    // Terminal murmur: formant-ish noise with slow amplitude wobble.
    b.murmur = this._bed(this.pink, 'bandpass', 480, 1.3);
    const mLfo = this._osc('sine', 0.31);
    const mLfoG = this._gain(0.3);
    mLfo.connect(mLfoG);
    mLfoG.connect(b.murmur.gain.gain);
    b.hvac = this._bed(this.brown, 'lowpass', 150, 0.8);

    // Tower: faint mains hum + fan whisper.
    b.hum = { gain: this._gain(0, this.master) };
    this._osc('sine', 100, b.hum.gain);
    this._osc('sine', 200, this._gain(0.3, b.hum.gain));
    b.fan = this._bed(this.pink, 'lowpass', 700, 0.5);

    // Radio chain for ATC chatter (narrow band, quiet).
    this.radioIn = this._filter('bandpass', 1500, 1.1);
    const radioLp = this._filter('lowpass', 2800, 0.7);
    this.radioIn.connect(radioLp);
    radioLp.connect(this._gain(0.7, this.master));
    radioLp.connect(this._gain(0.1, this.reverbIn));

    // Jets: broadband roar + soft whine.
    b.jetRoar = this._bed(this.pink, 'lowpass', 500, 0.6);
    b.jetRumble = this._bed(this.brown, 'lowpass', 140, 0.8);
    b.jetWhine = { gain: this._gain(0, this.master) };
    const wf = this._filter('lowpass', 1800, 0.6, b.jetWhine.gain);
    b.jetWhine.osc = this._osc('triangle', 600, wf);
    b.jetWhine.osc2 = this._osc('sine', 910, this._gain(0.4, wf));

    // Night insects: a soft, slowly pulsing chirr (sine, not a square).
    b.crickets = { gain: this._gain(0, this.master) };
    const cGate = this._gain(0, b.crickets.gain);
    this._osc('sine', 3400, cGate);
    this._osc('sine', 3460, this._gain(0.6, cGate));
    const cLfo = this._osc('sine', 13, this._gain(0.5, cGate.gain));
    const cSlow = this._osc('sine', 0.4, this._gain(0.25, cGate.gain));
    b.crickets.lfo = cLfo;
    b.crickets.slow = cSlow;
  }

  /** One looping noise source through a filter (and optional low-pass) into its own gain. */
  _bed(buffer, type, freq, q, lowpass = 0) {
    const src = this._n(this.ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const filter = this._filter(type, freq, q);
    const gain = this._gain(0, this.master);
    src.connect(filter);
    if (lowpass) {
      const lp = this._filter('lowpass', lowpass, 0.5);
      filter.connect(lp);
      lp.connect(gain);
    } else filter.connect(gain);
    src.start(0, Math.random() * 1.5);
    return { src, filter, gain };
  }

  setVolume(v) {
    this.volume = clamp(num(v, this.volume));
    this.muted = false;
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    this._persist();
    return this.volume;
  }

  toggleMute(force) {
    this.muted = force === undefined ? !this.muted : !!force;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.08);
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
    const doMix = this._acc >= 0.1;
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
    const dustK = kind === 'dust' ? inten : kind === 'haze' ? inten * 0.25 : 0;
    const wind = clamp(num(w.windSpeed, 4) / 14);
    const sc = soundscape;
    // Ground-level detail fades as the camera climbs (overview ≈ 1300 m up).
    const nearGround = clamp(1 - (alt - 25) / 260);
    // Construction proximity: the world reports it; else guess from altitude.
    const workNear = sc.valid ? clamp(sc.work) : nearGround * 0.5;
    const treeNear = sc.valid ? clamp(sc.trees) : 0.3;
    this._mix = { workNear, treeNear, nearGround };

    if (doMix) {
      const b = this.beds;
      const R = (p, v, tc) => this._ramp(p, v, tc);
      // Wind: slow gusts on incommensurate cycles; louder in dust, muffled indoors.
      const gust = 0.5 + 0.3 * Math.sin(t * 0.11) + 0.2 * Math.sin(t * 0.29 + 1.1);
      const windAmt = (0.035 + wind * 0.05 + dustK * 0.09) * (0.6 + gust * 0.7) * (1 + clamp(alt / 400) * 0.6);
      R(b.wind.gain.gain, windAmt * (out + inside * 0.1), 1.2);
      R(b.wind.filter.frequency, 300 + gust * 260 + dustK * 200, 1.5);
      R(b.breeze.gain.gain, out * (0.004 + wind * 0.006 + dustK * 0.02) * gust * gust, 1.4);
      R(b.sand.gain.gain, out * dustK * (0.006 + gust * 0.01), 1.2);
      const whistle = drone * clamp((alt - 30) / 200) * (0.3 + gust * 0.5);
      R(b.whistle.gain.gain, whistle * 0.004, 0.8);
      R(b.whistle.filter.frequency, 800 + clamp(alt / 300) * 700 + gust * 200, 1.0);

      // Site works: a faint far-off bed; louder only close to active work.
      const prox = 0.08 + 0.92 * workNear * workNear;
      const siteK = work * prox * (out + inTerm * 0.08 + inTower * 0.15) * (night > 0.8 ? 0.5 : 1);
      R(b.diesel.gain.gain, siteK * 0.03, 1.2);
      b.diesel.lfo.frequency.setTargetAtTime(4.5 + work * 2.5, this.ctx.currentTime, 1.5);

      // Rain: soft wash outside, muffled with a roof drum inside.
      R(b.rain.gain.gain, rainK * (out * 0.06 + inside * 0.008), 1.0);
      R(b.rainLow.gain.gain, rainK * (out * 0.04 + inside * 0.015), 1.0);
      R(b.roof.gain.gain, rainK * inside * 0.16, 1.0);

      // Terminal room tone.
      R(b.murmur.gain.gain, inTerm * 0.03, 1.0);
      R(b.hvac.gain.gain, inTerm * 0.06 + inTower * 0.03, 1.0);
      R(this.reverbIn.gain, inTerm * 0.4 + inTower * 0.1, 1.0);

      // Tower hum + fan (indoors only).
      R(b.hum.gain.gain, inTower * 0.008, 1.0);
      R(b.fan.gain.gain, inTower * 0.01, 1.0);

      // Jets: inverse-distance attenuation; thrust drives pitch and filter.
      const jets = s.jets;
      let jetAmt = 0;
      let thrust = 0;
      if (jets && isFinite(jets.nearest)) {
        const d = Math.max(30, jets.nearest);
        jetAmt = clamp(220 / d) * clamp(1 - d / 2200 + 0.2) * (out + inside * 0.15);
        thrust = clamp(num(jets.thrust, 0));
        jetAmt *= 0.25 + thrust * 0.75;
      }
      R(b.jetRoar.gain.gain, jetAmt * 0.18, 0.4);
      R(b.jetRoar.filter.frequency, 260 + thrust * 1100, 0.5);
      R(b.jetRumble.gain.gain, jetAmt * 0.35, 0.4);
      R(b.jetWhine.gain.gain, jetAmt * thrust * 0.005, 0.4);
      b.jetWhine.osc.frequency.setTargetAtTime(380 + thrust * 900, this.ctx.currentTime, 0.35);
      b.jetWhine.osc2.frequency.setTargetAtTime((380 + thrust * 900) * 1.5, this.ctx.currentTime, 0.35);

      // Night insects (clear-ish nights, outdoors, near the ground).
      R(b.crickets.gain.gain, night * out * nearGround * (kind === 'rain' ? 0.1 : 1) * 0.006, 2.0);
    }

    if (!live) return;
    const nx = this._next;

    // ---- one-shots scheduled from state ----
    // Site one-shots only when the camera is genuinely close to the works.
    if (out && work > 0.05 && day > 0.1 && workNear > 0.35) {
      const k = work * workNear;
      if (t > nx.work) {
        nx.work = t + 4 + Math.random() * 8 / Math.max(0.3, k);
        this._thump(k);
      }
      if (t > nx.hammer) {
        nx.hammer = t + 7 + Math.random() * 12;
        this._hammer(k);
      }
      if (t > nx.beep) {
        nx.beep = t + 45 + Math.random() * 60;
        if (workNear > 0.7) this._reverseBeeps(k);
      }
    }
    if (rainK > 0.05 && t > nx.drop) {
      nx.drop = t + 0.08 + (Math.random() * 0.35) / Math.max(0.2, rainK);
      this._droplet(out ? 0.006 : 0.003);
    }
    if (rainK > 0.7 && t > nx.thunder) {
      nx.thunder = t + 30 + Math.random() * 60;
      this._thunder(0.7);
    }

    // ---- birdsong ----
    const birdWeather = kind === 'rain' ? 0.15 * (1 - rainK) : kind === 'dust' ? 0.1 : kind === 'fog' ? 0.5 : 1;
    if (out && day > 0.08 && birdWeather > 0.05) {
      const hour = num(s.hour, sc.valid ? num(sc.hour, NaN) : NaN);
      // Dawn chorus: busiest when the sun is low, quieter through the heat of noon.
      const chorus = day < 0.55 ? 1 : 0.5;
      // Up high the chorus is faint and distant, but never entirely absent.
      const near = Math.max(nearGround * (0.35 + 0.65 * treeNear), 0.12);
      const rate = chorus * birdWeather * (0.2 + near);
      if (t > nx.bird) {
        nx.bird = t + (1.6 + Math.random() * 5.5) / Math.max(0.12, rate);
        this._birdCall(near * birdWeather, day, hour);
      }
      // Kite whistles carry far and come from overhead: also audible up high.
      if (t > nx.kite) {
        nx.kite = t + 18 + Math.random() * 30;
        if (day > 0.2) this._kite(0.5 + 0.5 * clamp(alt / 300) * birdWeather);
      }
    }

    if (inTerm && t > nx.pa) {
      nx.pa = t + 40 + Math.random() * 50;
      this._paChime();
    }
    // Radio chatter: rare and quiet, only in the tower cab or the ops view.
    if (inTower || ops) {
      if (t > nx.atc) {
        nx.atc = t + 22 + Math.random() * 38;
        this._atc(inTower ? 0.55 : 0.3);
      }
    } else if (nx.atc < t + 8) nx.atc = t + 8;
  }

  // --------------------------------------------------------------------------
  // Voices
  // --------------------------------------------------------------------------

  /**
   * Run a short voice: `build(reg, track)` creates nodes (registering each with
   * `reg`) and tracks its sources; all are disconnected when the last ends.
   * Returns false (and builds nothing) when the voice cap is reached.
   */
  _voice(build) {
    if (!this.ready || this._voices >= MAX_VOICES) return false;
    const nodes = [];
    const reg = (n) => {
      nodes.push(n);
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

  /** Optional stereo placement for a voice's output. */
  _out(reg, amp, pan, dest) {
    const ctx = this.ctx;
    if (pan && ctx.createStereoPanner) {
      const p = reg(ctx.createStereoPanner());
      p.pan.value = clamp(pan, -1, 1);
      amp.connect(p);
      p.connect(dest || this.master);
      return p;
    }
    amp.connect(dest || this.master);
    return amp;
  }

  /** Filtered noise burst with attack/decay; `when` offsets the start (s). */
  _burst({ gain = 0.2, freq = 1200, q = 1, type = 'bandpass', attack = 0.002, decay = 0.12, buffer = null, send = 0, when = 0, dest = null, pan = 0 }) {
    return this._voice((reg, track) => {
      const ctx = this.ctx;
      const src = reg(ctx.createBufferSource());
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
      const o = this._out(reg, amp, pan, dest);
      if (send > 0) {
        const sg = reg(ctx.createGain());
        sg.gain.value = send;
        o.connect(sg);
        sg.connect(this.reverbIn);
      }
      track(src);
      src.start(t0, Math.random());
      src.stop(t0 + attack + decay + 0.05);
    });
  }

  /** Pitched tone with envelope. */
  _tone({ freq = 440, to = 0, type = 'sine', gain = 0.05, attack = 0.01, decay = 0.3, when = 0, send = 0, dest = null, pan = 0 }) {
    return this._voice((reg, track) => {
      const ctx = this.ctx;
      const osc = reg(ctx.createOscillator());
      osc.type = type;
      const t0 = ctx.currentTime + when;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
      const amp = reg(ctx.createGain());
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      osc.connect(amp);
      const o = this._out(reg, amp, pan, dest);
      if (send > 0) {
        const sg = reg(ctx.createGain());
        sg.gain.value = send;
        o.connect(sg);
        sg.connect(this.reverbIn);
      }
      track(osc);
      osc.start(t0);
      osc.stop(t0 + attack + decay + 0.05);
    });
  }

  /**
   * A bird phrase as ONE voice: a sine carrier whose pitch follows a list of
   * notes [start s, dur s, f0, f1, gain], with an optional vibrato (trill)
   * oscillator. Everything is scheduled up front on two AudioParams.
   */
  _phrase(notes, { gain = 0.02, pan = 0, vib = 0, vibRate = 30, air = 0.3, type = 'sine' } = {}) {
    if (!notes.length) return false;
    return this._voice((reg, track) => {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.02;
      const osc = reg(ctx.createOscillator());
      osc.type = type;
      const amp = reg(ctx.createGain());
      amp.gain.setValueAtTime(0, t0);
      osc.frequency.setValueAtTime(notes[0][2], t0);
      let end = 0;
      for (const [st, dur, f0, f1, g = 1] of notes) {
        const a = t0 + st;
        const atk = Math.min(0.012, dur * 0.25);
        osc.frequency.setValueAtTime(f0, a);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), a + dur);
        amp.gain.setValueAtTime(0.0001, a);
        amp.gain.linearRampToValueAtTime(gain * g, a + atk);
        amp.gain.setValueAtTime(gain * g * 0.8, a + Math.max(atk, dur - 0.02));
        amp.gain.linearRampToValueAtTime(0.0001, a + dur);
        end = Math.max(end, st + dur + 0.02);
      }
      if (vib > 0) {
        const lfo = reg(ctx.createOscillator());
        lfo.frequency.value = vibRate;
        const lg = reg(ctx.createGain());
        lg.gain.value = vib;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        track(lfo);
        lfo.start(t0);
        lfo.stop(t0 + end + 0.05);
      }
      // Soft top: birds are bright but never piercing.
      const lp = reg(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      lp.Q.value = 0.5;
      osc.connect(lp);
      lp.connect(amp);
      const o = this._out(reg, amp, pan, null);
      if (air > 0) {
        const sg = reg(ctx.createGain());
        sg.gain.value = air;
        o.connect(sg);
        sg.connect(this.airIn);
      }
      track(osc);
      osc.start(t0);
      osc.stop(t0 + end + 0.05);
    });
  }

  /**
   * Footfall by surface: sand (soft dark thud), asphalt (gritty scuff),
   * concrete (dull tap), tile (soft click + room tail), metal (ringing clank).
   */
  footstep(surface = 'sand', sprinting = false, indoor = false) {
    if (!this.ready || this.muted) return;
    const k = (sprinting ? 1.3 : 1) * 0.7;
    const room = indoor ? 0.4 : 0.03;
    switch (surface) {
      case 'asphalt':
        this._burst({ gain: 0.03 * k, freq: 1200, q: 0.7, decay: 0.07 });
        this._burst({ gain: 0.03 * k, freq: 260, q: 1, type: 'lowpass', decay: 0.1 });
        break;
      case 'concrete':
        this._burst({ gain: 0.03 * k, freq: 1500, q: 0.8, decay: 0.05, send: room });
        this._burst({ gain: 0.035 * k, freq: 320, q: 1.2, type: 'lowpass', decay: 0.11, send: room * 0.6 });
        break;
      case 'tile':
        this._burst({ gain: 0.035 * k, freq: 2400, q: 1.2, decay: 0.035, send: room });
        this._burst({ gain: 0.03 * k, freq: 520, q: 1.2, decay: 0.09, send: room * 0.8 });
        break;
      case 'metal':
        this._burst({ gain: 0.035 * k, freq: 1800, q: 1, decay: 0.04, send: room });
        this._tone({ freq: 340 + Math.random() * 60, type: 'triangle', gain: 0.012 * k, decay: 0.2, send: room });
        break;
      default:
        this._burst({ gain: 0.04 * k, freq: 600, q: 0.6, type: 'lowpass', decay: 0.1, buffer: this.pink });
        this._burst({ gain: 0.008 * k, freq: 2200, q: 0.6, type: 'bandpass', decay: 0.08, buffer: this.pink });
    }
  }

  /** Discovery sting: a soft two-note chime with a tail. */
  discovery() {
    if (!this.ready || this.muted) return;
    this._tone({ freq: 523.25, type: 'sine', gain: 0.035, attack: 0.02, decay: 0.9, send: 0.3 });
    this._tone({ freq: 784, type: 'sine', gain: 0.022, attack: 0.02, decay: 1.1, send: 0.3, when: 0.08 });
  }

  /** Interface cues: short, soft, sine/triangle only. */
  ui(kind = 'click') {
    if (!this.ready || this.muted) return;
    const T = (f, o = {}) => this._tone({ freq: f, attack: 0.008, ...o });
    switch (kind) {
      case 'open':
        T(440, { to: 620, gain: 0.018, decay: 0.12 });
        break;
      case 'close':
        T(600, { to: 400, gain: 0.016, decay: 0.12 });
        break;
      case 'toast':
        T(784, { gain: 0.014, decay: 0.18 });
        T(1046.5, { gain: 0.01, decay: 0.22, when: 0.09 });
        break;
      case 'good':
        T(523.25, { type: 'triangle', gain: 0.022, decay: 0.2 });
        T(659.25, { type: 'triangle', gain: 0.022, decay: 0.2, when: 0.09 });
        T(783.99, { type: 'triangle', gain: 0.024, decay: 0.45, when: 0.18, send: 0.2 });
        break;
      case 'warn':
        T(440, { type: 'triangle', gain: 0.02, decay: 0.16 });
        T(392, { type: 'triangle', gain: 0.02, decay: 0.22, when: 0.18 });
        break;
      case 'bad':
        T(330, { to: 247, type: 'triangle', gain: 0.022, decay: 0.3 });
        T(262, { to: 196, type: 'triangle', gain: 0.02, decay: 0.4, when: 0.16 });
        break;
      case 'decision':
        T(392, { type: 'triangle', gain: 0.022, decay: 0.35, send: 0.25 });
        T(587.33, { type: 'triangle', gain: 0.02, decay: 0.5, when: 0.12, send: 0.25 });
        break;
      case 'milestone':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => T(f, { type: 'triangle', gain: 0.022, decay: 0.5 + i * 0.15, when: i * 0.11, send: 0.3 }));
        break;
      case 'xp':
        T(1046.5, { gain: 0.012, decay: 0.12 });
        T(1318.5, { gain: 0.01, decay: 0.16, when: 0.06 });
        break;
      case 'badge':
        [659.25, 830.6, 987.77, 1318.5].forEach((f, i) => T(f, { gain: 0.018, decay: 0.6, when: i * 0.07, send: 0.35 }));
        break;
      case 'thunder':
        this._thunder(1);
        break;
      default: // click: a soft tick
        T(900, { to: 700, gain: 0.01, attack: 0.003, decay: 0.04 });
    }
  }

  _thunder(k = 1) {
    this._burst({ gain: 0.22 * k, freq: 110, q: 0.7, type: 'lowpass', attack: 0.2, decay: 2.8, buffer: this.brown, send: 0.3, when: 0.05 });
    this._burst({ gain: 0.12 * k, freq: 70, q: 0.7, type: 'lowpass', attack: 0.6, decay: 3.5, buffer: this.brown, when: 0.6 });
  }

  // ---- site (distant, soft) ----

  _thump(k) {
    this._tone({ freq: 80 + Math.random() * 20, to: 42, gain: 0.02 + 0.03 * k, decay: 0.18 });
    this._burst({ gain: 0.01 + 0.012 * k, freq: 300, q: 0.8, type: 'lowpass', decay: 0.12, buffer: this.brown });
  }

  /** A few dull hammer taps, far away. */
  _hammer(k) {
    const n = 2 + Math.floor(Math.random() * 3);
    const pan = rnd(-0.6, 0.6);
    let when = 0;
    for (let i = 0; i < n; i++) {
      this._burst({ gain: 0.004 + 0.008 * k, freq: 1100 + Math.random() * 500, q: 4, decay: 0.05, when, pan });
      when += 0.32 + Math.random() * 0.12;
    }
  }

  /** Reversing alarm, rare, distant and soft (sine pips). */
  _reverseBeeps(k) {
    const pan = rnd(-0.7, 0.7);
    for (let i = 0; i < 3; i++) this._tone({ freq: 1000, gain: 0.003 + 0.004 * k, attack: 0.01, decay: 0.18, when: i * 0.6, pan });
  }

  _droplet(gain) {
    this._burst({ gain, freq: 900 + Math.random() * 1800, q: 6, decay: 0.015 + Math.random() * 0.01, buffer: this.pink, pan: rnd(-0.8, 0.8) });
  }

  // ---- birds ----

  /** Choose a species for the hour and proximity, never the same twice running. */
  _birdCall(near, day, hour) {
    const morning = isFinite(hour) ? hour < 10.5 : day < 0.5;
    const evening = isFinite(hour) ? hour > 16.5 : false;
    const weights = {
      sparrow: morning || evening ? 3 : 1.6,
      myna: morning ? 3 : 1.8,
      bulbul: morning ? 2 : 1,
      dove: morning ? 1.6 : 1.1,
      babbler: 1,
      kite: 0,
    };
    let total = 0;
    for (const k of BIRDS) if (k !== this._lastBird) total += weights[k];
    let r = Math.random() * total;
    let pick = 'sparrow';
    for (const k of BIRDS) {
      if (k === this._lastBird) continue;
      r -= weights[k];
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    this._lastBird = pick;
    const g = 0.4 + 0.6 * near;
    const pan = rnd(-0.85, 0.85);
    switch (pick) {
      case 'sparrow': return this._sparrow(g, pan);
      case 'myna': return this._myna(g, pan);
      case 'bulbul': return this._bulbul(g, pan);
      case 'dove': return this._dove(g, pan);
      default: return this._babbler(g, pan);
    }
  }

  /** House sparrows: a run of quick "chirrup" notes, sometimes two birds. */
  _sparrow(g, pan) {
    const birds = Math.random() < 0.4 ? 2 : 1;
    for (let b = 0; b < birds; b++) {
      const base = rnd(3000, 3900);
      const notes = [];
      let st = b * rnd(0.15, 0.5);
      const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const d = rnd(0.05, 0.09);
        notes.push([st, d * 0.5, base * rnd(1.0, 1.12), base * rnd(0.8, 0.9), rnd(0.7, 1)]);
        notes.push([st + d * 0.5, d * 0.5, base * rnd(0.85, 0.95), base * rnd(1.05, 1.2), rnd(0.6, 0.9)]);
        st += d + rnd(0.08, 0.22);
      }
      this._phrase(notes, { gain: 0.012 * g, pan: clamp(pan + b * 0.4, -1, 1), air: 0.25 });
    }
  }

  /** Common myna: a varied, gurgling medley of whistles and "kok" notes. */
  _myna(g, pan) {
    const notes = [];
    let st = 0;
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const style = Math.random();
      if (style < 0.35) {
        // liquid whistle, up or down
        const f = rnd(1300, 2600);
        const d = rnd(0.1, 0.22);
        notes.push([st, d, f, f * rnd(0.7, 1.4), rnd(0.7, 1)]);
        st += d + rnd(0.05, 0.15);
      } else if (style < 0.65) {
        // "kok-kok": short low notes
        const f = rnd(700, 1000);
        for (let k = 0; k < 2; k++) {
          notes.push([st, 0.05, f, f * 0.85, 0.8]);
          st += 0.11;
        }
        st += rnd(0.05, 0.12);
      } else {
        // gurgle: a quick zigzag
        const f = rnd(1600, 2400);
        for (let k = 0; k < 3; k++) {
          notes.push([st, 0.035, f * (k % 2 ? 0.8 : 1.15), f * (k % 2 ? 1.1 : 0.85), 0.7]);
          st += 0.045;
        }
        st += rnd(0.06, 0.16);
      }
    }
    this._phrase(notes, { gain: 0.014 * g, pan, vib: Math.random() < 0.4 ? 60 : 0, vibRate: 22, air: 0.3 });
  }

  /** Red-vented bulbul: a cheerful, melodic 3–5 note phrase. */
  _bulbul(g, pan) {
    const notes = [];
    const base = rnd(1500, 2100);
    const steps = [1, 1.25, 1.12, 1.5, 1.33, 0.9];
    let st = 0;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = base * steps[Math.floor(Math.random() * steps.length)];
      const d = rnd(0.09, 0.16);
      notes.push([st, d, f, f * rnd(0.92, 1.12), rnd(0.8, 1)]);
      st += d + rnd(0.03, 0.08);
    }
    this._phrase(notes, { gain: 0.015 * g, pan, air: 0.35 });
  }

  /** Laughing dove: soft low "coo-coo-roo" — the sound of a warm morning. */
  _dove(g, pan) {
    const f = rnd(470, 560);
    const notes = [];
    let st = 0;
    const n = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const d = i === n - 2 ? 0.32 : 0.16;
      notes.push([st, d, f * (i % 2 ? 1.06 : 1), f * (i === n - 2 ? 0.9 : 1.02), i === n - 2 ? 1 : 0.75]);
      st += d + 0.07;
    }
    this._phrase(notes, { gain: 0.03 * g, pan, air: 0.25, type: 'triangle' });
  }

  /** Jungle babblers: a scratchy little squabble of short notes. */
  _babbler(g, pan) {
    const notes = [];
    let st = 0;
    const n = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const f = rnd(2000, 2800);
      const d = rnd(0.04, 0.07);
      notes.push([st, d, f, f * rnd(0.75, 0.9), rnd(0.5, 0.9)]);
      st += d + rnd(0.05, 0.12);
    }
    this._phrase(notes, { gain: 0.008 * g, pan, vib: 120, vibRate: 45, air: 0.3 });
  }

  /** Black kite: a thin, descending whinnying whistle from high overhead. */
  _kite(g) {
    const f = rnd(2100, 2500);
    const notes = [[0, 0.32, f * 0.92, f * 1.04, 0.8], [0.38, 0.9, f, f * 0.7, 1]];
    this._phrase(notes, { gain: 0.007 * g, pan: rnd(-0.6, 0.6), vib: 90, vibRate: 16, air: 0.6 });
  }

  // ---- terminal & tower ----

  /** Two-tone airport PA chime (descending major third) with room tail. */
  _paChime() {
    this._tone({ freq: 659.25, gain: 0.022, attack: 0.02, decay: 0.9, send: 0.5 });
    this._tone({ freq: 523.25, gain: 0.022, attack: 0.02, decay: 1.2, send: 0.5, when: 0.45 });
  }

  /**
   * Synthesised ATC radio chatter, no speech: a soft squelch, then a handful
   * of band-limited noise syllables, then a tail click. `level` scales it.
   */
  _atc(level) {
    const syll = 3 + Math.floor(Math.random() * 5);
    const base = 1100 + Math.random() * 400;
    let when = 0;
    this._burst({ gain: 0.01 * level, freq: 2000, q: 1, decay: 0.02, dest: this.radioIn, buffer: this.pink, when });
    when += 0.06;
    for (let i = 0; i < syll; i++) {
      const len = 0.07 + Math.random() * 0.13;
      this._burst({ gain: (0.018 + Math.random() * 0.01) * level, freq: base + Math.random() * 600, q: 2.5 + Math.random() * 2, attack: 0.015, decay: len, dest: this.radioIn, buffer: this.pink, when });
      when += len + 0.05 + Math.random() * (Math.random() < 0.25 ? 0.2 : 0.05);
    }
    this._burst({ gain: 0.008 * level, freq: 1800, q: 1, decay: 0.02, dest: this.radioIn, buffer: this.pink, when });
  }
}
