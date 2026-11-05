import { el, svg, clear } from './dom.js';
import { MODELS, hasKey, setKey, clearKey } from '../ai/llm.js';
import { DEFAULT_SUGGESTIONS } from '../ai/intents.js';

/**
 * ChatPanel — MEHRAN's docked chat (docs/ARCHITECTURE.md §11).
 *
 * Three tabs: Chat (streaming conversation, suggestion chips, voice in/out),
 * Advisor (ranked rule-engine cards with one-click, approval-gated actions)
 * and Report (weekly status report: copy / export .md). Settings drawer:
 * engine, model, session-only API key and the privacy notice.
 *
 * Keyboard: H toggles (main.js), Esc closes, Enter sends, Shift+Enter = newline,
 * ←/→ move between tabs. Keys typed inside the panel never reach game hotkeys.
 */

/* ------------------------------------------------------------ tiny Markdown → HTML (escape first) */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

export function markdownToHtml(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let list = null;
  let table = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => {
    if (!table) return;
    const [head, ...body] = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    out.push(`<div class="mx-table-wrap"><table class="mx-table"><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    table = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*\|.*\|\s*$/.test(line)) { closeList(); (table = table || []).push(line); continue; }
    closeTable();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { closeList(); out.push(`<h${m[1].length + 2} class="mx-h">${inline(m[2])}</h${m[1].length + 2}>`); continue; }
    if (/^\s*---+\s*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); list = 'ul'; out.push('<ul>'); } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); list = 'ol'; out.push('<ol>'); } out.push(`<li>${inline(m[1])}</li>`); continue; }
    closeList();
    if (!line.trim()) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  return out.join('');
}

/* ------------------------------------------------------------ icons & avatar */

const ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7',
  send: 'M4 12l16-7-6 16-2.5-6.5z M11.5 14.5L20 5',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  refresh: 'M19 8a7.5 7.5 0 1 0 1 6M19 3.5V8h-4.5',
};

function ico(name, size = 16) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'mx-ico' }, [
    svg('path', { d: ICONS[name], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
}

let avatarSeq = 0;

/** Procedural avatar: indigo disc, Ajrak star ring, Indus river and a sailing boat under a brass sun. */
export function avatar(size = 44) {
  const id = `mxg${++avatarSeq}`;
  const stars = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = 32 + Math.cos(a) * 26;
    const y = 32 + Math.sin(a) * 26;
    const r = 2.6;
    stars.push(svg('path', { d: `M${x} ${y - r}L${x + r * 0.38} ${y - r * 0.38}L${x + r} ${y}L${x + r * 0.38} ${y + r * 0.38}L${x} ${y + r}L${x - r * 0.38} ${y + r * 0.38}L${x - r} ${y}L${x - r * 0.38} ${y - r * 0.38}Z`, fill: i % 2 ? '#c9a227' : '#e8e4d8', opacity: i % 2 ? 0.9 : 0.75 }));
  }
  return svg('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'mx-avatar-svg', role: 'img', 'aria-label': 'MEHRAN avatar: the Indus river under a brass sun' }, [
    svg('defs', {}, [
      svg('radialGradient', { id: `${id}a`, cx: '50%', cy: '38%', r: '65%' }, [svg('stop', { offset: '0', 'stop-color': '#3d50b8' }), svg('stop', { offset: '1', 'stop-color': '#0e1330' })]),
      svg('linearGradient', { id: `${id}r`, x1: '0', x2: '1' }, [svg('stop', { offset: '0', 'stop-color': '#4fc3d9' }), svg('stop', { offset: '1', 'stop-color': '#2b6fb8' })]),
      svg('clipPath', { id: `${id}c` }, [svg('circle', { cx: 32, cy: 32, r: 22.5 })]),
    ]),
    svg('circle', { cx: 32, cy: 32, r: 31, fill: '#9b1b30' }),
    svg('circle', { cx: 32, cy: 32, r: 30, fill: 'none', stroke: '#c9a227', 'stroke-width': 1.2 }),
    svg('g', { class: 'mx-ring' }, stars),
    svg('circle', { cx: 32, cy: 32, r: 22.5, fill: `url(#${id}a)`, stroke: '#c9a227', 'stroke-width': 1 }),
    svg('g', { 'clip-path': `url(#${id}c)` }, [
      svg('circle', { class: 'mx-sun', cx: 32, cy: 24, r: 6.5, fill: '#e6c65a' }),
      svg('path', { d: 'M8 40c6-4 10 4 16 0s10-4 16 0 10 4 16 0v16H8z', fill: `url(#${id}r)`, opacity: 0.95 }),
      svg('path', { class: 'mx-wave', d: 'M8 44c6-3 10 3 16 0s10-3 16 0 10 3 16 0', fill: 'none', stroke: '#e8e4d8', 'stroke-width': 1, opacity: 0.6 }),
      svg('path', { class: 'mx-wave mx-wave2', d: 'M8 49c6-3 10 3 16 0s10-3 16 0 10 3 16 0', fill: 'none', stroke: '#e8e4d8', 'stroke-width': 0.8, opacity: 0.4 }),
      svg('path', { d: 'M24 38.5h16l-3 3.4H27z', fill: '#2a1a10' }),
      svg('path', { d: 'M31.5 38.5V27l7 9.5z', fill: '#f4f6ff', opacity: 0.92 }),
    ]),
  ]);
}

/* ------------------------------------------------------------ the panel */

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'report', label: 'Report' },
];

const SEV_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info', good: 'Good' };

export class ChatPanel {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.isOpen = false;
    this.tab = 'chat';
    this.busy = false;
    this.messages = [];
    this._greeted = false;
    this._advisorDirty = true;
    this._advisorClock = 0;
    this._lastStatus = '';
    this._prevFocus = null;
    this._offs = [];
    this._build();
    const bus = sim && sim.bus;
    if (bus && bus.on) {
      this._offs.push(bus.on('project:day', () => { this._advisorDirty = true; }));
      this._offs.push(bus.on('project:new', () => { this._advisorDirty = true; this._report = null; }));
      this._offs.push(bus.on('ai:message', (m) => { if (m && m.role === 'system' && this.isOpen) this._note(m.text); }));
    }
  }

  get ai() {
    return this.sim && this.sim.ai;
  }

  /* ---------------------------------------------------------- build */

  _build() {
    this.light = el('span', { class: 'mx-light', 'aria-hidden': 'true' });
    this.statusText = el('span', { class: 'mx-status-text' });
    this.avatarBox = el('div', { class: 'mx-avatar' }, [avatar(46)]);

    this.voiceBtn = el('button', { type: 'button', class: 'mx-icon-btn', 'aria-pressed': 'false', title: 'Read replies aloud (V)', 'aria-label': 'Read replies aloud', onclick: () => this.toggleVoice() }, [ico('mute', 18)]);
    this.settingsBtn = el('button', { type: 'button', class: 'mx-icon-btn', 'aria-expanded': 'false', 'aria-controls': 'mx-settings', title: 'Engine, model & API key', 'aria-label': 'Chat settings', onclick: () => this._toggleSettings() }, [ico('gear', 18)]);
    const closeBtn = el('button', { type: 'button', class: 'mx-icon-btn', title: 'Close (Esc)', 'aria-label': 'Close MEHRAN', onclick: () => this.toggle(false) }, [ico('close', 18)]);

    const head = el('header', { class: 'mx-head' }, [
      this.avatarBox,
      el('div', { class: 'mx-id' }, [
        el('div', { class: 'mx-name' }, [el('b', { text: 'MEHRAN' }), this.light]),
        el('div', { class: 'mx-sub' }, [el('span', { text: 'AI project co-pilot · ' }), this.statusText]),
      ]),
      el('div', { class: 'mx-head-btns' }, [this.voiceBtn, this.settingsBtn, closeBtn]),
    ]);

    this.settings = this._buildSettings();

    this.tabBtns = TABS.map((t) => el('button', {
      type: 'button', role: 'tab', id: `mx-tab-${t.id}`, class: 'mx-tab', 'aria-selected': t.id === this.tab ? 'true' : 'false', 'aria-controls': `mx-pane-${t.id}`, tabindex: t.id === this.tab ? '0' : '-1',
      onclick: () => this.setTab(t.id),
      onkeydown: (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const i = TABS.findIndex((x) => x.id === this.tab);
        const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        this.setTab(n.id);
        this.tabBtns[TABS.indexOf(n)].focus();
        e.preventDefault();
      },
    }, [t.label]));
    const tabs = el('div', { class: 'mx-tabs', role: 'tablist', 'aria-label': 'MEHRAN views' }, this.tabBtns);

    this.log = el('div', { class: 'mx-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Conversation with MEHRAN' });
    this.chips = el('div', { class: 'mx-chips', role: 'group', 'aria-label': 'Suggested questions' });
    this.input = el('textarea', { class: 'mx-input', rows: '1', placeholder: 'Ask MEHRAN… e.g. "why are we behind?"', 'aria-label': 'Message to MEHRAN', maxlength: '2000', autocomplete: 'off', spellcheck: 'true' });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this._submit(); }
    });
    this.input.addEventListener('input', () => this._autosize());
    this.micBtn = el('button', { type: 'button', class: 'mx-icon-btn mx-mic', 'aria-label': 'Speak your question', onclick: () => this._mic() }, [ico('mic', 18)]);
    this.sendBtn = el('button', { type: 'submit', class: 'mx-send', 'aria-label': 'Send' }, [ico('send', 18)]);
    const form = el('form', { class: 'mx-compose', onsubmit: (e) => { e.preventDefault(); this._submit(); } }, [this.micBtn, this.input, this.sendBtn]);

    this.paneChat = el('div', { class: 'mx-pane', id: 'mx-pane-chat', role: 'tabpanel', 'aria-labelledby': 'mx-tab-chat' }, [this.log, this.chips, form]);
    this.advisorBody = el('div', { class: 'mx-advisor-body' });
    this.paneAdvisor = el('div', { class: 'mx-pane', id: 'mx-pane-advisor', role: 'tabpanel', 'aria-labelledby': 'mx-tab-advisor', hidden: true }, [this.advisorBody]);
    this.reportBody = el('div', { class: 'mx-report-body mx-md', tabindex: '0', 'aria-label': 'Weekly status report preview' });
    this.paneReport = el('div', { class: 'mx-pane', id: 'mx-pane-report', role: 'tabpanel', 'aria-labelledby': 'mx-tab-report', hidden: true }, [
      el('div', { class: 'mx-report-bar' }, [
        el('button', { type: 'button', class: 'mx-btn', onclick: () => this._renderReport(true) }, [ico('refresh', 15), el('span', { text: 'Refresh' })]),
        el('button', { type: 'button', class: 'mx-btn', onclick: () => this._copyReport() }, [ico('copy', 15), el('span', { text: 'Copy' })]),
        el('button', { type: 'button', class: 'mx-btn mx-btn-primary', onclick: () => this._exportReport() }, [ico('download', 15), el('span', { text: 'Export .md' })]),
      ]),
      this.reportBody,
    ]);

    this.panel = el('section', { class: 'mx-chat', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'MEHRAN, AI project co-pilot', 'aria-hidden': 'true' }, [
      head, this.settings, tabs, this.paneChat, this.paneAdvisor, this.paneReport,
    ]);
    // Keys typed in the panel must not drive the simulator's hotkeys.
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!this.settings.hidden) this._toggleSettings(false);
        else this.toggle(false);
      }
      e.stopPropagation();
    });
    this.panel.addEventListener('keyup', (e) => e.stopPropagation());
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    if (this.root) this.root.appendChild(this.panel);
    this._renderChips(DEFAULT_SUGGESTIONS);
    this._refreshVoice();
    this._refreshStatus();
  }

  _buildSettings() {
    const settings = this.sim && this.sim.settings;
    const get = (p, d) => { try { const v = settings.get(p); return v === undefined ? d : v; } catch { return d; } };
    const set = (p, v) => { try { settings.set(p, v); } catch { /* ignore */ } };
    this.engineSel = el('select', { class: 'mx-select', id: 'mx-engine', onchange: () => { set('ai.engine', this.engineSel.value); this._refreshStatus(); } }, [
      el('option', { value: 'offline', text: 'Offline rule engine (no network)' }),
      el('option', { value: 'live', text: 'Live Claude — your own API key' }),
    ]);
    this.engineSel.value = get('ai.engine', 'offline') === 'live' ? 'live' : 'offline';
    this.modelSel = el('select', { class: 'mx-select', id: 'mx-model', onchange: () => { set('ai.model', this.modelSel.value); this._refreshStatus(); } }, MODELS.map((m) => el('option', { value: m.id, text: m.label })));
    this.modelSel.value = MODELS.some((m) => m.id === get('ai.model', '')) ? get('ai.model', '') : MODELS[0].id;
    this.keyInput = el('input', { type: 'password', class: 'mx-key', id: 'mx-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…', 'aria-describedby': 'mx-privacy' });
    this.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._saveKey(); } });
    this.keyState = el('span', { class: 'mx-key-state', role: 'status' });
    const box = el('div', { class: 'mx-settings', id: 'mx-settings', hidden: true }, [
      el('label', { class: 'mx-field', for: 'mx-engine' }, [el('span', { text: 'Engine' }), this.engineSel]),
      el('label', { class: 'mx-field', for: 'mx-model' }, [el('span', { text: 'Model (live mode)' }), this.modelSel]),
      el('label', { class: 'mx-field', for: 'mx-key' }, [el('span', { text: 'Anthropic API key' }), this.keyInput]),
      el('div', { class: 'mx-key-row' }, [
        el('button', { type: 'button', class: 'mx-btn mx-btn-primary', onclick: () => this._saveKey() }, ['Use key for this tab']),
        el('button', { type: 'button', class: 'mx-btn', onclick: () => { clearKey(); this.keyInput.value = ''; this._refreshStatus(); } }, ['Forget key']),
        this.keyState,
      ]),
      el('p', { class: 'mx-privacy', id: 'mx-privacy', text: 'Privacy: your key stays in this tab\'s session storage only — never in local storage, saves, exports or logs — and is forgotten when the tab closes. Offline mode sends nothing. In live mode your question and a compact snapshot of the simulated project go to api.anthropic.com; any error falls back to the offline engine. Every action MEHRAN proposes still needs your approval.' }),
    ]);
    return box;
  }

  _saveKey() {
    const v = this.keyInput.value.trim();
    this.keyInput.value = '';
    if (!v) return;
    setKey(v);
    if (this.engineSel.value !== 'live') {
      this.engineSel.value = 'live';
      try { this.sim.settings.set('ai.engine', 'live'); } catch { /* ignore */ }
    }
    this._refreshStatus();
  }

  _toggleSettings(force) {
    const open = force === undefined ? this.settings.hidden : force;
    this.settings.hidden = !open;
    this.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) this.engineSel.focus();
    else this.settingsBtn.focus();
  }

  /* ---------------------------------------------------------- public API (§11) */

  toggle(force) {
    const open = force === undefined ? !this.isOpen : !!force;
    if (open === this.isOpen) return this.isOpen;
    this.isOpen = open;
    this.panel.classList.toggle('open', open);
    this.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      this._prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
      try { if (this.sim.input && this.sim.input.exitPointerLock) this.sim.input.exitPointerLock(); } catch { /* ignore */ }
      if (!this._greeted) this._greet();
      if (this.tab === 'advisor') this._renderAdvisor();
      this._refreshStatus();
      setTimeout(() => { if (this.isOpen && this.tab === 'chat') this.input.focus({ preventScroll: true }); }, 30);
    } else {
      if (this.ai && this.ai.voice) this.ai.voice.stopListening();
      if (this._prevFocus && this._prevFocus.focus && this.panel.contains(document.activeElement)) {
        try { this._prevFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    }
    return this.isOpen;
  }

  toggleVoice() {
    const v = this.ai && this.ai.voice;
    if (!v) return false;
    if (!v.canSpeak) {
      if (this.sim.toast) this.sim.toast('Speech output is not supported in this browser', 'warn');
      return false;
    }
    const on = v.setEnabled(!v.enabled);
    this._refreshVoice();
    if (this.sim.toast) this.sim.toast(on ? 'MEHRAN will read replies aloud' : 'MEHRAN voice off');
    return on;
  }

  setTab(id) {
    this.tab = id;
    TABS.forEach((t, i) => {
      const on = t.id === id;
      this.tabBtns[i].setAttribute('aria-selected', on ? 'true' : 'false');
      this.tabBtns[i].tabIndex = on ? 0 : -1;
    });
    this.paneChat.hidden = id !== 'chat';
    this.paneAdvisor.hidden = id !== 'advisor';
    this.paneReport.hidden = id !== 'report';
    if (id === 'advisor') this._renderAdvisor();
    if (id === 'report') this._renderReport(!this._report);
  }

  /** Send a question (also used by the HUD, tour and QA). */
  async send(text) {
    const q = String(text || '').trim();
    if (!q || !this.ai) return null;
    if (!this.isOpen) this.toggle(true);
    if (this.tab !== 'chat') this.setTab('chat');
    this._addMessage('user', q);
    if (this.sim.bus) this.sim.bus.emit('ai:message', { role: 'user', text: q });
    const msg = this._addMessage('bot', '', { pending: true });
    this.busy = true;
    this.sendBtn.disabled = true;
    let res;
    try {
      res = await this.ai.ask(q, { onDelta: (t) => { msg.raw += t; msg.streaming = true; }, onTool: (name) => this._toolNote(msg, name) });
    } catch (err) {
      res = { text: `Something went wrong: ${err && err.message ? err.message : err}`, engine: 'offline', actions: [] };
    }
    this.busy = false;
    this.sendBtn.disabled = false;
    msg.pending = false;
    msg.raw = res.text || '';
    msg.engine = res.engine;
    msg.done = true;
    if (!msg.streaming && this._reduced()) msg.shown = msg.raw.length;
    msg.note = res.note || '';
    msg.actions = res.actions || [];
    msg.report = res.report || null;
    this._finishMessage(msg);
    this._renderChips(res.suggestions || DEFAULT_SUGGESTIONS);
    this._refreshStatus();
    if (this.sim.bus) this.sim.bus.emit('ai:message', { role: 'assistant', text: msg.raw });
    if (this.ai.voice && this.ai.voice.enabled) {
      this.avatarBox.classList.add('speaking');
      this.ai.voice.speak(msg.raw, { onEnd: () => this.avatarBox.classList.remove('speaking') });
    }
    return res;
  }

  update(dt = 0.016) {
    if (!this.isOpen) return;
    // Typewriter / streaming reveal.
    for (const m of this.messages) {
      if (m.role !== 'bot' || m.shown >= m.raw.length) continue;
      const rate = m.streaming ? 2400 : 1500;
      m.shown = this._reduced() ? m.raw.length : Math.min(m.raw.length, m.shown + Math.max(6, Math.round(rate * dt)));
      this._renderBody(m);
      this._scroll();
    }
    this._advisorClock += dt;
    if (this.tab === 'advisor' && this._advisorDirty && this._advisorClock > 1.5) this._renderAdvisor();
    const s = this.ai ? this.ai.status : 'offline';
    if (s !== this._lastStatus) this._refreshStatus();
  }

  dispose() {
    for (const off of this._offs) if (typeof off === 'function') off();
    this._offs = [];
    if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
  }

  /* ---------------------------------------------------------- messages */

  _reduced() {
    try {
      return !!this.sim.settings.get('accessibility.reducedMotion');
    } catch {
      return false;
    }
  }

  _greet() {
    this._greeted = true;
    const ai = this.ai;
    if (!ai) return;
    let head = '';
    let items = [];
    try {
      head = ai.headline ? ai.headline() : '';
      items = ai.analyse().filter((a) => a.severity !== 'good').slice(0, 2);
    } catch {
      items = [];
    }
    const text = `Salaam — I'm **MEHRAN**, your AI project co-pilot. I read the live simulation and explain every recommendation; nothing changes without your approval.\n\n${head}`;
    const m = this._addMessage('bot', text, { engine: 'offline' });
    m.shown = this._reduced() ? text.length : 0;
    m.items = items;
    m.done = true;
    this._finishMessage(m);
  }

  _addMessage(role, text, opts = {}) {
    const body = el('div', { class: 'mx-body mx-md' });
    const node = el('div', { class: `mx-msg mx-${role}` }, [body]);
    const m = { role, raw: text, shown: role === 'user' ? text.length : 0, node, body, pending: !!opts.pending, engine: opts.engine || '', done: role === 'user', streaming: false, actions: [], items: [] };
    if (role === 'user') body.textContent = text;
    else if (m.pending) body.appendChild(el('span', { class: 'mx-typing', 'aria-label': 'MEHRAN is thinking' }, [el('i'), el('i'), el('i')]));
    this.messages.push(m);
    if (this.messages.length > 80) {
      const old = this.messages.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
    this.log.appendChild(node);
    this._scroll(true);
    return m;
  }

  _renderBody(m) {
    if (m.role !== 'bot') return;
    if (m.pending && !m.raw) return;
    const text = m.shown >= m.raw.length ? m.raw : m.raw.slice(0, m.shown);
    m.body.innerHTML = markdownToHtml(text);
    if (m.shown < m.raw.length) m.body.appendChild(el('span', { class: 'mx-caret', 'aria-hidden': 'true' }));
  }

  _finishMessage(m) {
    if (this._reduced()) m.shown = m.raw.length;
    this._renderBody(m);
    for (const extra of m.node.querySelectorAll('.mx-msg-extra')) extra.remove();
    const extra = el('div', { class: 'mx-msg-extra' });
    if (m.note) extra.appendChild(el('p', { class: 'mx-note', text: m.note }));
    if (m.items && m.items.length) for (const a of m.items) extra.appendChild(this._card(a, true));
    if (m.actions && m.actions.length) {
      extra.appendChild(el('div', { class: 'mx-actions' }, m.actions.map((a) => this._actionBtn(a))));
    }
    const meta = el('div', { class: 'mx-meta' }, [
      el('span', { class: `mx-engine mx-engine-${m.engine || 'offline'}`, text: m.engine === 'live' ? 'live Claude' : 'offline rules' }),
      el('button', { type: 'button', class: 'mx-link', title: 'Copy this answer', onclick: () => this._copy(m.raw) }, ['Copy']),
      m.report ? el('button', { type: 'button', class: 'mx-link', onclick: () => this._exportReport(m.report) }, ['Export .md']) : null,
      this.ai && this.ai.voice && this.ai.voice.canSpeak ? el('button', { type: 'button', class: 'mx-link', title: 'Read aloud', onclick: () => { this.avatarBox.classList.add('speaking'); const ok = this.ai.voice.speak(m.raw, { onEnd: () => this.avatarBox.classList.remove('speaking') }) || this._speakOnce(m.raw); if (!ok) this.avatarBox.classList.remove('speaking'); } }, ['Listen']) : null,
    ]);
    extra.appendChild(meta);
    m.node.appendChild(extra);
    this._scroll(true);
  }

  _speakOnce(text) {
    const v = this.ai.voice;
    const was = v.enabled;
    if (was) return false;
    try { this.sim.settings.data.ai.voice = true; } catch { return false; }
    const ok = v.speak(text, { onEnd: () => this.avatarBox.classList.remove('speaking') });
    try { this.sim.settings.data.ai.voice = false; } catch { /* ignore */ }
    return ok;
  }

  _toolNote(msg, name) {
    const labels = { get_snapshot: 'reading the snapshot', get_critical_path: 'tracing the critical path', run_monte_carlo: 'running Monte Carlo', propose_change_request: 'preparing a change request (needs your approval)', draft_status_report: 'drafting the status report', explain_term: 'checking the glossary', get_advice: 'consulting the rule engine' };
    msg.raw += `${msg.raw && !msg.raw.endsWith('\n') ? '\n\n' : ''}_(${labels[name] || name}…)_\n\n`;
  }

  _note(text) {
    const n = el('div', { class: 'mx-sys', role: 'status', text });
    this.log.appendChild(n);
    this._scroll(true);
  }

  _scroll(force) {
    const l = this.log;
    if (force || l.scrollHeight - l.scrollTop - l.clientHeight < 120) l.scrollTop = l.scrollHeight;
  }

  _autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(140, this.input.scrollHeight)}px`;
  }

  _submit() {
    if (this.busy) return;
    const q = this.input.value;
    if (!q.trim()) return;
    this.input.value = '';
    this._autosize();
    this.send(q);
  }

  _renderChips(list) {
    clear(this.chips);
    for (const s of (list || []).slice(0, 6)) {
      this.chips.appendChild(el('button', { type: 'button', class: 'mx-chip', onclick: () => { if (!this.busy) this.send(s); } }, [s]));
    }
  }

  /* ---------------------------------------------------------- advisor cards */

  _actionBtn(a) {
    const btn = el('button', { type: 'button', class: `mx-btn ${a.needsApproval ? 'mx-btn-primary' : ''}`, title: a.needsApproval ? 'Opens an approval dialog — nothing changes until you approve' : '' }, [a.label]);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await (a.run ? a.run() : this.ai.runAction(a));
      } finally {
        btn.disabled = false;
        this._advisorDirty = true;
        if (this.tab === 'advisor') this._renderAdvisor();
      }
    });
    return btn;
  }

  _card(a, compact = false) {
    return el('article', { class: `mx-card mx-sev-${a.severity}${compact ? ' compact' : ''}` }, [
      el('div', { class: 'mx-card-head' }, [
        el('span', { class: 'mx-sev', text: SEV_LABEL[a.severity] || a.severity }),
        el('b', { class: 'mx-card-title', text: a.title }),
      ]),
      el('p', { class: 'mx-why', text: a.why }),
      el('p', { class: 'mx-rec' }, [el('span', { 'aria-hidden': 'true', text: '→ ' }), a.recommendation]),
      a.impact ? el('p', { class: 'mx-impact', text: a.impact }) : null,
      a.action ? el('div', { class: 'mx-actions' }, [this._actionBtn(a.action)]) : null,
    ]);
  }

  _renderAdvisor() {
    this._advisorDirty = false;
    this._advisorClock = 0;
    const ai = this.ai;
    clear(this.advisorBody);
    if (!ai) return;
    let items = [];
    try { items = ai.analyse(); } catch { items = []; }
    const p = this.sim.project || {};
    this.advisorBody.appendChild(el('div', { class: 'mx-adv-top' }, [
      el('p', { class: 'mx-headline', text: ai.headline ? ai.headline() : '' }),
      el('p', { class: 'mx-small', text: `Day ${p.day || 0} · ${items.length} finding${items.length === 1 ? '' : 's'}, most severe first · transparent rules over EVM, CPM, resources, quality, risk, stakeholders, changes, agile and procurement.` }),
      el('div', { class: 'mx-actions' }, [
        el('button', { type: 'button', class: 'mx-btn', onclick: () => { this.setTab('chat'); this.send('stand-up'); } }, ['Daily stand-up']),
        el('button', { type: 'button', class: 'mx-btn', onclick: () => ai.runAction({ kind: 'montecarlo' }).then(() => this._renderAdvisor()) }, ['Run Monte Carlo']),
      ]),
    ]));
    const list = el('div', { class: 'mx-cards', role: 'list' });
    for (const a of items) {
      const c = this._card(a);
      c.setAttribute('role', 'listitem');
      list.appendChild(c);
    }
    this.advisorBody.appendChild(list);
    this.advisorBody.appendChild(el('p', { class: 'mx-small mx-sim', text: 'Simulated scenario data. Recommendations are decision support — you approve every change.' }));
  }

  /* ---------------------------------------------------------- report */

  _renderReport(rebuild) {
    if (!this.ai) return;
    if (rebuild || !this._report) {
      try { this._report = this.ai.statusReport(); } catch (err) { this._report = { title: 'Status report', markdown: `Report unavailable: ${err && err.message ? err.message : err}` }; }
    }
    this.reportBody.innerHTML = markdownToHtml(this._report.markdown);
  }

  _copy(text) {
    const done = (ok) => { if (this.sim.toast) this.sim.toast(ok ? 'Copied to clipboard' : 'Copy failed — select the text manually', ok ? 'good' : 'warn'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true), () => done(this._copyFallback(text)));
        return;
      }
    } catch { /* fall through */ }
    done(this._copyFallback(text));
  }

  _copyFallback(text) {
    try {
      const ta = el('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  _copyReport() {
    if (!this._report) this._renderReport(true);
    this._copy(this._report.markdown);
  }

  _exportReport(report) {
    const r = report || this._report || (this.ai && this.ai.statusReport());
    if (!r) return;
    const day = (this.sim.project && this.sim.project.day) || 0;
    if (this.sim.download) this.sim.download(`HDD_status_report_day${day}.md`, 'text/markdown', r.markdown);
    if (this.sim.toast) this.sim.toast('Status report exported', 'good');
  }

  /* ---------------------------------------------------------- voice & status */

  _mic() {
    const v = this.ai && this.ai.voice;
    if (!v || !v.canListen) return;
    if (v.listening) { v.stopListening(); this.micBtn.classList.remove('on'); return; }
    this.micBtn.classList.add('on');
    this.micBtn.setAttribute('aria-pressed', 'true');
    const ok = v.listen({
      onResult: (text, final) => {
        this.input.value = text;
        this._autosize();
        if (final && text) { this.input.value = ''; this.send(text); }
      },
      onEnd: () => { this.micBtn.classList.remove('on'); this.micBtn.setAttribute('aria-pressed', 'false'); },
      onError: (e) => { if (this.sim.toast) this.sim.toast(`Microphone: ${e}`, 'warn'); },
    });
    if (!ok) { this.micBtn.classList.remove('on'); this.micBtn.setAttribute('aria-pressed', 'false'); }
  }

  _refreshVoice() {
    const v = this.ai && this.ai.voice;
    const canSpeak = !!(v && v.canSpeak);
    const on = canSpeak && v.enabled;
    clear(this.voiceBtn).appendChild(ico(on ? 'speaker' : 'mute', 18));
    this.voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.voiceBtn.disabled = !canSpeak;
    this.voiceBtn.title = canSpeak ? (on ? 'Voice replies on (V)' : 'Read replies aloud (V)') : 'Speech output is not supported in this browser';
    const canListen = !!(v && v.canListen);
    this.micBtn.disabled = !canListen;
    this.micBtn.setAttribute('aria-pressed', 'false');
    this.micBtn.title = canListen ? 'Speak your question' : 'Speech input is not supported in this browser (try Chrome or Edge)';
  }

  _refreshStatus() {
    const s = this.ai ? this.ai.status : 'offline';
    this._lastStatus = s;
    this.light.className = `mx-light mx-light-${s}`;
    this.light.title = s === 'live' ? 'Live Claude engine' : s === 'fallback' ? 'Live mode failed — using offline rules' : 'Offline rule engine';
    this.statusText.textContent = this.ai && this.ai.engineLabel ? this.ai.engineLabel : 'Offline rule engine';
    const key = hasKey();
    this.keyState.textContent = key ? 'A key is set for this tab.' : 'No key set.';
    if (this.ai && s === 'fallback' && this.ai.lastError) this.keyState.textContent += ` Last error: ${this.ai.lastError}.`;
    this._refreshVoice();
  }
}
