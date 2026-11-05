import { el, clear, icon, t, button, field } from './dom.js';

/**
 * First-run onboarding: a 60-second, skippable, interactive tutorial.
 *
 * 1. Welcome  2. Role (student / instructor) + name  3. Scenario (difficulty,
 * approach, seed → sim.newProject)  4–9. Spotlights over the live HUD — the
 * instruments, the five modes, the project clock, the dashboard rail, MEHRAN
 * and help — each advancing on its own after a few seconds or as soon as the
 * player does the thing it describes. Sets `settings.onboarded`.
 */

function put(node, ...kids) {
  for (const k of kids) if (k !== null && k !== undefined && k !== false) node.append(k);
  return node;
}

const SPOTS = [
  { sel: '.instruments', title: 'Your instrument panel', text: 'Project date, phase, % complete, SPI and CPI, budget burn against work earned, quality, weather and local time. Green is on track, amber is watch, red is act.', secs: 9 },
  { sel: '.hud-top .modes', alt: '.mode-arrows', title: 'Five ways to see the project', text: 'Try it now: press 1 to walk the site as an inspector, 4 to fly the drone, 2 to come back here. Operations (5) unlocks at handover.', touchText: 'Try it now: tap the arrows to walk the site as an inspector or fly the drone, then come back to Project Manager. Operations unlocks at handover.', secs: 11, waitFor: 'mode:changed' },
  { sel: '.hud-top .speed', alt: '.speed-cycle', title: 'The project clock', text: 'Each setting is project days per real second. P pauses. Decisions stop the clock until you choose.', secs: 8 },
  { sel: '.rail-scroll', alt: '.rail-toggle', title: 'The dashboard, in course order', text: '25 panels from Foundations to Close & assess — charter, WBS, schedule, earned value, risk, quality, change control and more. Open one now, or press Tab.', touchText: '25 panels from Foundations to Close & assess. Tap the menu button to open the drawer, then pick a panel.', secs: 11, waitFor: 'panel:opened' },
  { sel: '.hud-top .mehran', title: 'MEHRAN, your AI project manager', text: 'Ask anything — “why is CPI falling?”, “draft a status report”. Every action MEHRAN proposes waits for your approval. Press H.', touchText: 'Ask anything — “why is CPI falling?”, “draft a status report”. Every action MEHRAN proposes waits for your approval. Tap the chat button.', secs: 9 },
  { sel: '.hud-top .tool-btns', title: 'Help is one key away', text: 'Press ? for every control, K for sound, F for renderer statistics. You are ready — good luck with the programme.', touchText: 'The ? button lists every control, including the on-screen stick and action pad. You are ready — good luck with the programme.', secs: 7 },
];

const DIFFICULTIES = [
  { id: 'trainee', title: 'Trainee', text: 'Gentle risks, generous reserves. Learn the instruments.' },
  { id: 'professional', title: 'Professional', text: 'Realistic weather, risks and stakeholders.' },
  { id: 'crisis', title: 'Crisis', text: 'Frequent shocks and tight funding. For the final week.' },
];

export class Onboarding {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    this.active = false;
    this.layer = null;
    this.choice = { role: 'student', name: '', difficulty: 'professional', approach: 'hybrid', seed: 20270104 };
    this._onResize = () => this._place();
    this._onKey = (e) => this._key(e);
  }

  maybeStart() {
    const done = this.sim.settings && this.sim.settings.get('onboarded');
    if (!done) this.start();
    return !done;
  }

  start() {
    if (this.active) return;
    this.active = true;
    const s = this.sim.settings;
    const p = this.sim.project || {};
    this.choice = {
      role: (s && s.get('role')) || 'student',
      name: (s && s.get('studentName')) || '',
      difficulty: p.difficulty || 'professional',
      approach: p.approach || 'hybrid',
      seed: p.seed || 20270104,
    };
    this.layer = el('div', { class: 'onboarding', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Tutorial' });
    this.spot = el('div', { class: 'ob-spot', 'aria-hidden': 'true' });
    this.callout = el('div', { class: 'ob-callout', role: 'document' });
    this.timerBar = el('div', { class: 'ob-timer', 'aria-hidden': 'true' }, [el('i')]);
    this.layer.append(this.spot, this.callout, this.timerBar);
    this.root.appendChild(this.layer);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKey, true);
    this.step = 0;
    this._show();
  }

  get steps() {
    return 3 + SPOTS.length;
  }

  _key(e) {
    if (!this.active) return;
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.finish(true);
    } else if (e.key === 'Enter' && !typing && this.step >= 3) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.next();
    }
  }

  next() {
    if (this.step === 2) this._charter();
    this.step++;
    if (this.step >= this.steps) this.finish(false);
    else this._show();
  }

  back() {
    if (this.step > 0) {
      this.step--;
      this._show();
    }
  }

  _dots() {
    return el('div', { class: 'ob-dots', 'aria-label': `Step ${this.step + 1} of ${this.steps}` }, Array.from({ length: this.steps }, (_, i) => el('i', { class: i < this.step ? 'done' : i === this.step ? 'now' : '' })));
  }

  _nav(nextLabel = t('action.next'), showBack = true) {
    return el('div', { class: 'ob-nav' }, [
      this._dots(),
      el('div', { class: 'grow' }),
      button(t('action.skip'), () => this.finish(true), { kind: 'ghost', small: true, title: 'Skip the tutorial (Esc)' }),
      showBack && this.step > 0 ? button(t('action.back'), () => this.back(), { kind: 'ghost', small: true }) : null,
      button(nextLabel, () => this.next(), { kind: 'primary', small: true, icon: 'next' }),
    ]);
  }

  _show() {
    clearTimeout(this._timer);
    if (this._off) { this._off(); this._off = null; }
    const c = clear(this.callout);
    this.layer.classList.toggle('centre', this.step < 3);
    this._target = null;
    if (this.step === 0) this._welcome(c);
    else if (this.step === 1) this._role(c);
    else if (this.step === 2) this._scenario(c);
    else this._spotlight(c, SPOTS[this.step - 3]);
    this._place();
    const total = this.steps - 1;
    this.timerBar.firstChild.style.width = `${(this.step / total) * 100}%`;
    setTimeout(() => {
      const f = this.callout.querySelector('input') || this.callout.querySelector('.action.primary') || this.callout.querySelector('button');
      if (f) f.focus({ preventScroll: true });
    }, 30);
  }

  _welcome(c) {
    put(c, 
      el('div', { class: 'ob-hero' }, [
        el('span', { class: 'ob-mark' }, [icon('planeUp', 30)]),
        el('div', {}, [el('div', { class: 'ob-eyebrow', text: 'HDD · OPKD · Sindh, Pakistan' }), el('h2', { text: 'SKY GATEWAY HYDERABAD' })]),
      ]),
      el('p', { class: 'ob-lede', text: 'You are the project manager of the Hyderabad Airport Revival & Expansion Programme: a longer runway, a new terminal and tower, and a city that wants its airport back. Plan it, build it, steer it through dust storms and change requests — then hand it over to operations.' }),
      el('ul', { class: 'ob-points' }, [
        el('li', {}, [icon('layers', 15), 'A 3D digital twin driven by a real PM engine: CPM, PERT, EVM, risk, quality, procurement.']),
        el('li', {}, [icon('chat', 15), 'MEHRAN, an AI project manager that explains and recommends — you approve.']),
        el('li', {}, [icon('flag', 15), 'Missions and decisions mapped to the course learning outcomes.']),
      ]),
      el('p', { class: 'muted small', text: 'About 60 seconds. Budgets, vendors, airlines and events are simulated scenario data.' }),
      this._nav('Start the tour', false),
    );
  }

  _role(c) {
    const ch = this.choice;
    const roleBtn = (id, title, text, ic) => el('button', {
      type: 'button', class: `ob-choice ${ch.role === id ? 'active' : ''}`.trim(), role: 'radio', 'aria-checked': ch.role === id ? 'true' : 'false',
      onclick: () => { ch.role = id; this._show(); },
    }, [icon(ic, 24), el('b', { text: title }), el('span', { text })]);
    const name = el('input', { type: 'text', maxlength: 60, value: ch.name, placeholder: 'Shown on your reports and scorecard', autocomplete: 'name' });
    name.addEventListener('input', () => { ch.name = name.value; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.next(); } });
    put(c, 
      el('div', { class: 'ob-eyebrow', text: 'Step 1 · Who is driving?' }),
      el('h2', { text: 'Choose your role' }),
      el('div', { class: 'ob-choices two', role: 'radiogroup', 'aria-label': 'Role' }, [
        roleBtn('student', 'Student', 'Run the programme, complete missions and quizzes, earn XP.', 'user'),
        roleBtn('instructor', 'Instructor', 'Everything a student can do, plus Operations preview and presenter tools.', 'present'),
      ]),
      field('Your name (optional)', name),
      this._nav(),
    );
  }

  _scenario(c) {
    const ch = this.choice;
    const seed = el('input', { type: 'number', min: 1, step: 1, value: ch.seed, inputmode: 'numeric', 'aria-label': 'Scenario seed' });
    seed.addEventListener('input', () => { ch.seed = Number(seed.value); });
    put(c, 
      el('div', { class: 'ob-eyebrow', text: 'Step 2 · Charter the project' }),
      el('h2', { text: 'Set the scenario' }),
      el('div', { class: 'ob-choices three', role: 'radiogroup', 'aria-label': 'Difficulty' }, DIFFICULTIES.map((d) => el('button', {
        type: 'button', class: `ob-choice ${ch.difficulty === d.id ? 'active' : ''}`.trim(), role: 'radio', 'aria-checked': ch.difficulty === d.id ? 'true' : 'false',
        onclick: () => { ch.difficulty = d.id; this._show(); },
      }, [el('b', { text: d.title }), el('span', { text: d.text })]))),
      el('div', { class: 'ob-row' }, [
        el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Delivery approach' }, ['predictive', 'hybrid', 'agile'].map((a) => el('button', {
          type: 'button', role: 'radio', class: ch.approach === a ? 'active' : null, 'aria-checked': ch.approach === a ? 'true' : 'false',
          onclick: () => { ch.approach = a; this._show(); },
        }, [a.charAt(0).toUpperCase() + a.slice(1)]))),
        el('label', { class: 'ob-seed' }, [el('span', { text: 'Seed' }), seed,
          button('', () => { ch.seed = Math.floor(1 + Math.random() * 99999999); seed.value = ch.seed; }, { kind: 'ghost', small: true, icon: 'dice', ariaLabel: 'Random seed', title: 'Random seed' })]),
      ]),
      el('p', { class: 'muted small', text: 'The same seed and choices give every student the same project — useful for class comparisons.' }),
      this._nav('Charter project'),
    );
  }

  _charter() {
    const ch = this.choice;
    const s = this.sim.settings;
    if (s) {
      s.set('role', ch.role);
      s.set('studentName', (ch.name || '').trim());
    }
    const p = this.sim.project || {};
    const seed = Number.isFinite(ch.seed) && ch.seed > 0 ? Math.floor(ch.seed) : undefined;
    if (p.seed !== seed || p.difficulty !== ch.difficulty || p.approach !== ch.approach || (p.day || 0) > 0) {
      if (this.sim.newProject) this.sim.newProject({ seed, difficulty: ch.difficulty, approach: ch.approach });
    }
    if (this.sim.toast) this.sim.toast(`Project chartered — ${ch.difficulty}, ${ch.approach}, seed ${seed ?? 'default'}`, 'good');
  }

  _spotlight(c, spot) {
    let target = document.querySelector(spot.sel);
    if ((!target || !target.offsetWidth) && spot.alt) target = document.querySelector(spot.alt);
    this._target = target && target.offsetWidth ? target : null;
    const progress = el('div', { class: 'ob-steptimer' }, [el('i', { style: { animationDuration: `${spot.secs}s` } })]);
    put(c, 
      el('div', { class: 'ob-eyebrow', text: `Tour · ${this.step - 2} of ${SPOTS.length}` }),
      el('h3', { text: spot.title }),
      el('p', { text: document.body.classList.contains('touch-mode') && spot.touchText ? spot.touchText : spot.text }),
      progress,
      this._nav(this.step === this.steps - 1 ? 'Finish' : t('action.next')),
    );
    this._timer = setTimeout(() => { if (this.active) this.next(); }, spot.secs * 1000);
    if (spot.waitFor && this.sim.bus) {
      const off = this.sim.bus.on(spot.waitFor, () => {
        off();
        this._off = null;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          if (!this.active) return;
          if (spot.waitFor === 'panel:opened' && this.sim.dashboard) this.sim.dashboard.close();
          this.next();
        }, 1400);
      });
      this._off = off;
    }
  }

  _place() {
    if (!this.layer) return;
    const tgt = this._target;
    if (!tgt || !document.contains(tgt)) {
      this.spot.style.display = 'none';
      this.callout.style.left = '';
      this.callout.style.top = '';
      this.callout.classList.remove('anchored');
      return;
    }
    const r = tgt.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, window.innerHeight * 0.7) + pad * 2}px`,
    });
    this.callout.classList.add('anchored');
    const cw = Math.min(380, window.innerWidth - 24);
    const ch = this.callout.offsetHeight || 200;
    let left;
    let top;
    if (r.width < window.innerWidth * 0.2 && r.left < window.innerWidth * 0.3 && r.height > 200) {
      left = r.right + 16;
      top = Math.max(70, Math.min(window.innerHeight - ch - 12, r.top + 40));
    } else {
      left = r.left + r.width / 2 - cw / 2;
      top = r.bottom + 16;
      if (top + ch > window.innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    }
    left = Math.max(12, Math.min(window.innerWidth - cw - 12, left));
    this.callout.style.left = `${left}px`;
    this.callout.style.top = `${top}px`;
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._timer);
    if (this._off) { this._off(); this._off = null; }
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey, true);
    if (this.layer) this.layer.remove();
    this.layer = null;
    if (this.sim.settings) this.sim.settings.set('onboarded', true);
    if (this.sim.toast) this.sim.toast(skipped ? 'Tutorial skipped — replay it any time from Session & Settings' : 'Tutorial complete — over to you, project manager', skipped ? '' : 'good');
  }
}
