/**
 * MEHRAN's voice: speechSynthesis for replies, Web Speech recognition for input.
 * Both are optional browser features; every entry point degrades to a no-op and
 * the chat UI disables the matching button with an explanatory tooltip.
 */

function win() {
  return typeof window !== 'undefined' ? window : null;
}

/** Markdown → speakable plain text. */
export function speakable(text, max = 700) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\|/g, ', ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/→/g, ' to ')
    .replace(/−/g, 'minus ')
    .replace(/\bPKR\b/g, 'rupees')
    .replace(/\bbn\b/g, 'billion')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) s = `${s.slice(0, max).replace(/\s+\S*$/, '')}. The rest is on screen.`;
  return s;
}

export class Voice {
  constructor(settings) {
    this.settings = settings;
    this.listening = false;
    this.speaking = false;
    this._rec = null;
  }

  get canSpeak() {
    const w = win();
    return !!(w && w.speechSynthesis && typeof w.SpeechSynthesisUtterance === 'function');
  }

  get canListen() {
    const w = win();
    return !!(w && (w.SpeechRecognition || w.webkitSpeechRecognition));
  }

  get enabled() {
    return !!(this.settings && this.settings.get && this.settings.get('ai.voice'));
  }

  setEnabled(on) {
    if (this.settings && this.settings.set) this.settings.set('ai.voice', !!on);
    if (!on) this.cancel();
    return !!on;
  }

  _voice() {
    const w = win();
    const voices = (w && w.speechSynthesis.getVoices && w.speechSynthesis.getVoices()) || [];
    return voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  }

  speak(text, { onStart, onEnd } = {}) {
    if (!this.canSpeak || !this.enabled) return false;
    const w = win();
    const s = speakable(text);
    if (!s) return false;
    try {
      w.speechSynthesis.cancel();
      const u = new w.SpeechSynthesisUtterance(s);
      const v = this._voice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-GB';
      u.rate = 1.03;
      u.pitch = 0.95;
      u.onstart = () => { this.speaking = true; if (onStart) onStart(); };
      u.onend = u.onerror = () => { this.speaking = false; if (onEnd) onEnd(); };
      w.speechSynthesis.speak(u);
      return true;
    } catch {
      this.speaking = false;
      return false;
    }
  }

  cancel() {
    const w = win();
    try {
      if (this.canSpeak) w.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.speaking = false;
  }

  /** Start speech-to-text. onResult(text, isFinal). Returns false if unsupported. */
  listen({ onResult, onEnd, onError } = {}) {
    if (!this.canListen) return false;
    this.stopListening();
    const w = win();
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    try {
      const rec = new Rec();
      const lang = (w.navigator && w.navigator.language) || 'en-GB';
      rec.lang = /^en/i.test(lang) ? lang : 'en-GB';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e) => {
        let text = '';
        let final = false;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
          if (e.results[i].isFinal) final = true;
        }
        if (onResult) onResult(text.trim(), final);
      };
      rec.onerror = (e) => { if (onError) onError(e && e.error ? e.error : 'error'); };
      rec.onend = () => { this.listening = false; this._rec = null; if (onEnd) onEnd(); };
      this.cancel();
      rec.start();
      this._rec = rec;
      this.listening = true;
      return true;
    } catch (err) {
      this.listening = false;
      if (onError) onError(err && err.message ? err.message : 'error');
      return false;
    }
  }

  stopListening() {
    if (this._rec) {
      try {
        this._rec.stop();
      } catch {
        /* ignore */
      }
    }
    this._rec = null;
    this.listening = false;
  }

  dispose() {
    this.stopListening();
    this.cancel();
  }
}
