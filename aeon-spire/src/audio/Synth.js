/**
 * AEON SPIRE — procedural audio sources.
 *
 * Section I requires original audio, so nothing here is a sample: every
 * layer is synthesised at runtime from noise buffers and oscillators, and
 * every impulse response for the room convolvers is generated numerically.
 *
 * The buffers are built once, cached, and looped — which also means the
 * whole soundscape costs a few hundred kilobytes of RAM and no network.
 */

/* ------------------------------------------------------------------ */
/* Noise generators                                                    */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG so a given seed always yields the same buffer. */
function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** White noise. */
export function whiteNoise(ctx, seconds = 4, seed = 1) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  for (let i = 0; i < n; i++) d[i] = r();
  return buf;
}

/**
 * Pink noise via the Voss-McCartney algorithm — the spectral shape most
 * natural-sounding ambience is built on (wind, water, room tone).
 */
export function pinkNoise(ctx, seconds = 6, seed = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  // Cross-fade the tail into the head so the loop is seamless.
  const fade = Math.floor(ctx.sampleRate * 0.35);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  return buf;
}

/** Brown noise — heavier low end, used for the deep city hum. */
export function brownNoise(ctx, seconds = 6, seed = 3) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * r()) / 1.02;
    d[i] = last * 3.2;
  }
  const fade = Math.floor(ctx.sampleRate * 0.4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* Textural buffers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Water lapping on stone: filtered noise bursts at an irregular cadence,
 * each with a soft attack and a longer decay.
 */
export function waterLapping(ctx, seconds = 8, seed = 11) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const r = prng(seed);
  const sr = ctx.sampleRate;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const w = r();
      lp += (w - lp) * 0.06;
      lp2 += (lp - lp2) * 0.10;
      // A slow amplitude swell, plus a faster ripple.
      const t = i / sr;
      const swell = 0.5 + 0.5 * Math.sin(t * 0.51 + ch * 1.3);
      const ripple = 0.65 + 0.35 * Math.sin(t * 2.3 + ch * 2.1 + Math.sin(t * 0.7) * 2);
      d[i] = lp2 * 4.2 * swell * ripple;
    }
    const fade = Math.floor(sr * 0.5);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

/** Rain: dense high-frequency noise with a low rumble underneath. */
export function rainBuffer(ctx, seconds = 6, seed = 21) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const r = prng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let hp = 0, prev = 0, low = 0;
    for (let i = 0; i < n; i++) {
      const w = r();
      // High-passed noise is the hiss of the drops.
      hp = 0.86 * (hp + w - prev);
      prev = w;
      low += (w - low) * 0.02;
      d[i] = hp * 0.5 + low * 0.55;
    }
    const fade = Math.floor(ctx.sampleRate * 0.4);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

/** A thunder roll: a noise burst shaped by a long, rumbling envelope. */
export function thunderBuffer(ctx, seconds = 5.5, seed = 31) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const r = prng(seed);
  const sr = ctx.sampleRate;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let low = 0, low2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = r();
      low += (w - low) * 0.012;
      low2 += (low - low2) * 0.02;
      // Sharp crack, then a long decaying roll with secondary swells.
      const crack = Math.exp(-t * 5.5) * (t < 0.35 ? 1 : 0);
      const roll = Math.exp(-t * 0.55) * (0.6 + 0.4 * Math.sin(t * 3.1 + ch));
      const rumble = Math.exp(-t * 0.9) * (0.5 + 0.5 * Math.sin(t * 1.3));
      d[i] = (low2 * 9 * (roll + rumble) + w * 0.22 * crack) * 0.85;
    }
  }
  return buf;
}

/** Birdsong: short chirps of frequency-swept sine, at irregular intervals. */
export function birdsong(ctx, seconds = 12, seed = 41) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let t = 0.4;
  while (t < seconds - 1.2) {
    const notes = 2 + Math.floor((r() * 0.5 + 0.5) * 4);
    const pan = r() * 0.5 + 0.5;
    let nt = t;
    for (let k = 0; k < notes; k++) {
      const dur = 0.045 + (r() * 0.5 + 0.5) * 0.09;
      const f0 = 2100 + (r() * 0.5 + 0.5) * 2400;
      const f1 = f0 * (0.72 + (r() * 0.5 + 0.5) * 0.75);
      const start = Math.floor(nt * sr);
      const len = Math.floor(dur * sr);
      let phase = 0;
      for (let i = 0; i < len && start + i < n; i++) {
        const u = i / len;
        const f = f0 + (f1 - f0) * u;
        phase += (2 * Math.PI * f) / sr;
        // A gentle attack/decay so the chirp does not click.
        const env = Math.sin(Math.PI * u) ** 1.5;
        const v = Math.sin(phase) * env * 0.16;
        L[start + i] += v * (1 - pan);
        R[start + i] += v * pan;
      }
      nt += dur + 0.02 + (r() * 0.5 + 0.5) * 0.07;
    }
    t = nt + 0.6 + (r() * 0.5 + 0.5) * 2.6;
  }
  return buf;
}

/** Crickets: a pulsing band of high chirps for night. */
export function crickets(ctx, seconds = 8, seed = 51) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const voices = 14;
  for (let v = 0; v < voices; v++) {
    const f = 3900 + (r() * 0.5 + 0.5) * 1400;
    const rate = 8 + (r() * 0.5 + 0.5) * 6;      // chirps per second
    const pan = r() * 0.5 + 0.5;
    const off = (r() * 0.5 + 0.5) * seconds;
    const amp = 0.035 + (r() * 0.5 + 0.5) * 0.03;
    for (let i = 0; i < n; i++) {
      const t = i / sr + off;
      const pulse = Math.max(0, Math.sin(t * rate * Math.PI * 2));
      const gate = pulse > 0.55 ? 1 : 0;
      // A slow chorus swell so the bed breathes.
      const swell = 0.55 + 0.45 * Math.sin(t * 0.21 + v);
      const s = Math.sin(2 * Math.PI * f * t) * gate * amp * swell;
      L[i] += s * (1 - pan);
      R[i] += s * pan;
    }
  }
  const fade = Math.floor(sr * 0.4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    L[i] = L[i] * k + L[n - fade + i] * (1 - k);
    R[i] = R[i] * k + R[n - fade + i] * (1 - k);
  }
  return buf;
}

/**
 * The "wonder" pad: a slowly evolving drone built from a just-intoned stack
 * of detuned sines with independent amplitude cycles. Original and generic —
 * no melody, so nothing to infringe.
 */
export function wonderPad(ctx, seconds = 24, seed = 61) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const root = 110;                                  // A2
  const ratios = [1, 1.5, 2, 2.5, 3, 4, 4.5, 6];      // fifths and octaves
  for (let v = 0; v < ratios.length; v++) {
    const f = root * ratios[v] * (1 + (r() * 0.5) * 0.004);
    const pan = 0.5 + (r() * 0.5) * 0.8;
    const cycle = 0.03 + (r() * 0.5 + 0.5) * 0.07;    // very slow swell
    const phase0 = (r() * 0.5 + 0.5) * Math.PI * 2;
    const amp = 0.13 / (1 + v * 0.55);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * cycle * Math.PI * 2 + phase0)));
      const s = Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.13 + v) * 0.6) * amp * env;
      L[i] += s * (1 - pan * 0.5);
      R[i] += s * (0.5 + pan * 0.5);
    }
  }
  // Seamless loop: the pad's period divides `seconds`, but cross-fade anyway.
  const fade = Math.floor(sr * 1.5);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    L[i] = L[i] * k + L[n - fade + i] * (1 - k);
    R[i] = R[i] * k + R[n - fade + i] * (1 - k);
  }
  return buf;
}

/** A muffled crowd/market murmur: band-limited noise with slow formants. */
export function crowdMurmur(ctx, seconds = 10, seed = 71) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, bp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = r();
      lp += (w - lp) * 0.05;
      bp += (lp - bp) * 0.012;
      const formant = 0.6 + 0.4 * Math.sin(t * 1.7 + ch) * Math.sin(t * 0.43);
      d[i] = (lp - bp) * 2.6 * formant;
    }
    const fade = Math.floor(sr * 0.5);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* Construction foley (E.5: non-verbal only)                           */
/* ------------------------------------------------------------------ */

/** A crane motor: a low whine with harmonics and a slow duty cycle. */
export function craneMotor(ctx, seconds = 9, seed = 81) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // The motor runs, pauses, and runs again.
      const duty = 0.5 + 0.5 * Math.sin(t * 0.34 + ch * 0.7);
      const gate = duty > 0.42 ? Math.min(1, (duty - 0.42) * 6) : 0;
      const f = 86 + 26 * Math.sin(t * 0.21);
      let s = 0;
      for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t) / (h * 1.7);
      lp += (r() - lp) * 0.08;
      d[i] = (s * 0.13 + lp * 0.05) * gate;
    }
    const fade = Math.floor(sr * 0.4);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

/** Hammering / riveting: sharp transient hits at an irregular work rhythm. */
export function hammering(ctx, seconds = 8, seed = 91) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let t = 0.2;
  while (t < seconds - 0.6) {
    const hits = 3 + Math.floor((r() * 0.5 + 0.5) * 5);
    const gap = 0.16 + (r() * 0.5 + 0.5) * 0.12;
    const pan = r() * 0.5 + 0.5;
    const dist = 0.35 + (r() * 0.5 + 0.5) * 0.65;    // near hits are louder
    for (let k = 0; k < hits; k++) {
      const start = Math.floor((t + k * gap) * sr);
      const len = Math.floor(0.22 * sr);
      for (let i = 0; i < len && start + i < n; i++) {
        const u = i / sr;
        const env = Math.exp(-u * 34);
        const ring = Math.sin(2 * Math.PI * (620 + 240 * Math.sin(k)) * u) * 0.5 +
                     Math.sin(2 * Math.PI * 1450 * u) * 0.3;
        const v = (ring + r() * 0.4) * env * 0.22 * dist;
        L[start + i] += v * (1 - pan);
        R[start + i] += v * pan;
      }
    }
    t += hits * gap + 0.5 + (r() * 0.5 + 0.5) * 1.8;
  }
  return buf;
}

/** Diesel truck engines: a low irregular chug with a broadband bed. */
export function truckEngines(ctx, seconds = 10, seed = 101) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const r = prng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const rpm = 11 + 3 * Math.sin(t * 0.27 + ch) + 1.5 * Math.sin(t * 1.7);
      let s = 0;
      for (let h = 1; h <= 6; h++) {
        s += Math.sin(2 * Math.PI * rpm * h * t + Math.sin(t * 0.6) * h) / (h * 1.5);
      }
      lp += (r() - lp) * 0.03;
      const load = 0.55 + 0.45 * Math.sin(t * 0.19 + ch * 1.1);
      d[i] = (s * 0.1 + lp * 0.12) * load;
    }
    const fade = Math.floor(sr * 0.5);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

/** A reversing beeper / site alarm — short, periodic, unmistakably a site. */
export function siteBeeper(ctx, seconds = 6, seed = 111) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const f = 1180;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const c = t % 1.2;
    const on = c < 0.28 ? 1 : 0;
    const env = on ? Math.min(1, c * 40) * Math.min(1, (0.28 - c) * 40) : 0;
    d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.12;
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* One-shots                                                           */
/* ------------------------------------------------------------------ */

/** A soft two-tone elevator chime. */
export function elevatorChime(ctx, seed = 121) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 1.6);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const tones = [[880, 0.0], [1174.66, 0.18]];
  for (const [f, off] of tones) {
    const start = Math.floor(off * sr);
    for (let i = 0; i < n - start; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 3.4) * Math.min(1, t * 90);
      const s = (Math.sin(2 * Math.PI * f * t) * 0.7 +
                 Math.sin(2 * Math.PI * f * 2 * t) * 0.18) * env * 0.19;
      L[start + i] += s;
      R[start + i] += s * 0.94;
    }
  }
  return buf;
}

/** A short hydraulic whir, for the Observatory's levelling plinths (D.5). */
export function hydraulicWhir(ctx, seed = 131) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 1.4);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.9) * 8);
    const f = 220 + 90 * Math.sin(t * 5.5) + 40 * t;
    lp += (r() - lp) * 0.2;
    d[i] = (Math.sin(2 * Math.PI * f * t) * 0.4 + lp * 0.35) * env * 0.14;
  }
  return buf;
}

/** A bright playful chime for the block pavilion (D.7). */
export function playChime(ctx, seed = 141) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 1.2);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let k = 0; k < notes.length; k++) {
    const start = Math.floor(k * 0.085 * sr);
    for (let i = 0; i < n - start; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 5.5) * Math.min(1, t * 120);
      const s = Math.sin(2 * Math.PI * notes[k] * t) * env * 0.12;
      L[start + i] += s * (k % 2 ? 0.75 : 1);
      R[start + i] += s * (k % 2 ? 1 : 0.75);
    }
  }
  return buf;
}

/** Footsteps on a hard surface — one step, pitched by the surface. */
export function footstep(ctx, kind = 'stone', seed = 151) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 0.35);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  const bright = kind === 'stone' ? 1 : kind === 'metal' ? 1.6 : 0.35;
  let lp = 0, prev = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r();
    hp = 0.7 * (hp + w - prev); prev = w;
    lp += (w - lp) * 0.25;
    const env = Math.exp(-t * (kind === 'carpet' ? 38 : 22));
    d[i] = (hp * 0.5 * bright + lp * 0.6) * env * 0.16;
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* Convolver impulse responses (D.8: per-room acoustics)               */
/* ------------------------------------------------------------------ */

/**
 * A synthesised impulse response. `decay` sets RT60-ish length, `damp`
 * how quickly the high end dies (a padded lounge damps hard, a stone vault
 * barely at all), `predelay` the gap before the first reflections.
 */
export function impulseResponse(ctx, {
  decay = 2.4, damping = 0.5, predelay = 0.012, diffusion = 0.7, seed = 161
} = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * (decay + predelay + 0.1));
  const buf = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(predelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = prng(seed + ch * 977);
    let lp = 0;
    // Early reflections: a handful of discrete taps.
    const taps = 7 + Math.floor(diffusion * 9);
    for (let k = 0; k < taps; k++) {
      const pos = pre + Math.floor((0.004 + (k / taps) * 0.09 * decay) * sr * (0.7 + Math.abs(r()) * 0.6));
      if (pos < n) d[pos] += (r() > 0 ? 1 : -1) * (0.9 - k / taps * 0.7) * 0.6;
    }
    // Diffuse tail.
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp(-t * (6.0 / Math.max(decay, 0.05)));
      lp += (r() - lp) * (1 - damping * 0.92);
      d[i] += lp * env * (0.35 + diffusion * 0.5);
    }
    // Normalise so swapping rooms does not change perceived loudness.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak * 1.25;
  }
  return buf;
}
