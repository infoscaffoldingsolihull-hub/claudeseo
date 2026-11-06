import {
  el, clear, icon, button, tabs, toggle, select, slider, field, pill, kpi, table, humanize, confirmModal, openModal, fmtPct,
} from '../dom.js';
import { SLOTS, SLOT_LABELS, storageAvailable, writeSlot, readSlot, clearSlot, describeSlot } from '../storage.js';

/**
 * Session & Settings: three save slots plus the autosave, JSON export/import,
 * a new-project form, and every user preference (graphics, audio,
 * accessibility, controls, language and role). Every preference is persisted
 * through `sim.settings.set`, which main.js turns into body classes.
 */

const TABS = [
  { id: 'session', label: 'Session', icon: 'save' },
  { id: 'graphics', label: 'Graphics', icon: 'eye' },
  { id: 'audio', label: 'Audio', icon: 'sound' },
  { id: 'access', label: 'Accessibility', icon: 'user' },
  { id: 'controls', label: 'Controls', icon: 'keyboard' },
  { id: 'language', label: 'Language & role', icon: 'globe' },
];

const EFFECTS = [
  ['bloom', 'Bloom', 'Glow around runway lights, the sun and lit glazing'],
  ['godRays', 'God rays', 'Light shafts through dust and haze'],
  ['ssao', 'Ambient occlusion', 'Contact shadows in corners and under aircraft'],
  ['dof', 'Depth of field', 'Cinematic focus in tour and photo mode'],
  ['motionBlur', 'Motion blur', 'Camera blur while flying fast'],
  ['lensFlare', 'Lens flare', 'Sun and approach-light flares'],
  ['grain', 'Film grain', 'Fine grain and vignette'],
];

/** Weather choices shared by the HUD weather popover and Graphics → Weather & time. */
export const WEATHER_CHOICES = [
  { id: 'auto', label: 'Auto', icon: 'cycle', hint: 'Follow the project’s simulated weather' },
  { id: 'clear', label: 'Clear', icon: 'sun', hint: 'Clear sky' },
  { id: 'haze', label: 'Haze', icon: 'haze', hint: 'Dust haze' },
  { id: 'dust', label: 'Dust storm', icon: 'dust', hint: 'Wind-blown dust storm' },
  { id: 'rain', label: 'Monsoon rain', icon: 'rain', hint: 'Monsoon downpour' },
  { id: 'fog', label: 'Night fog', icon: 'fog', hint: 'Winter fog (moves the clock to night if it is day)' },
  { id: 'heat', label: 'Heat', icon: 'heat', hint: 'Extreme heat shimmer' },
];

export const TIME_PRESETS = [['Sunrise', 6.4], ['Noon', 12], ['Sunset', 18.4], ['Night', 22]];

/** Apply a weather choice: 'auto' clears the manual override. Shared by the HUD and this panel. */
export function applyWeatherChoice(sim, id, intensity = 0.8) {
  if (!sim || typeof sim.setWeatherOverride !== 'function') return null;
  if (!id || id === 'auto') return sim.setWeatherOverride(null);
  if (id === 'fog') {
    const sky = sim.world && sim.world.sky;
    if (sky && sky.state && sky.state.nightFactor < 0.5 && typeof sky.setHour === 'function') sky.setHour(21.5);
  }
  return sim.setWeatherOverride(id, intensity);
}

export const KEY_BINDINGS = [
  ['1 · 2 · 3 · 4 · 5', 'Site Walk · Project Manager · Guided Tour · Drone · Operations'],
  ['O', 'Operations mode'],
  ['W A S D / arrows', 'Move (walk and drone)'],
  ['Mouse / drag', 'Look · orbit'],
  ['Shift', 'Sprint / drone boost'],
  ['Ctrl', 'Crouch (hold)'],
  ['Space', 'Jump / drone climb'],
  ['Q', 'Drone descend · orbit zoom out'],
  ['E', 'Inspect a point of interest · orbit zoom in'],
  ['Tab', 'Open / close the dashboard'],
  ['Esc', 'Close help, photo mode, chat, panel or card · on a decision card: take the recommended option'],
  ['H', 'Talk to MEHRAN, the AI project manager'],
  ['V', 'MEHRAN voice input'],
  ['B', 'Agile board'],
  ['R', 'Present & report'],
  ['C', 'Raise a change request'],
  ['M', 'Missions'],
  ['P', 'Pause / resume · take a PNG in photo mode'],
  ['+ / −', 'Simulation speed'],
  ['[ / ]', 'Time of day −/+ 30 min'],
  ['N', 'Toggle day / night'],
  ['X', 'Photo mode (drone)'],
  ['G', 'Drone orbit-cam on the selected work package'],
  ['← / →', 'Tour: previous / next beat'],
  ['F', 'Renderer statistics'],
  ['K', 'Sound on / off'],
  ['T', 'Touch controls on / off'],
  ['?', 'Help card'],
];

function setting(dash, path, value) {
  dash.sim.settings.set(path, value);
}

function get(dash, path, dflt) {
  const v = dash.sim.settings.get(path);
  return v === undefined ? dflt : v;
}

/* ------------------------------------------------------------- session tab */

function loadData(dash, data, label) {
  if (!data) {
    dash.sim.toast(`${label} is empty`, 'warn');
    return;
  }
  confirmModal('Load session?', `Replace the current project with ${label}? Unsaved progress in the current project will be lost.`, { okLabel: 'Load' }).then((ok) => {
    if (!ok) return;
    const done = dash.sim.restoreSession ? dash.sim.restoreSession(data) : false;
    dash.sim.toast(done ? `Loaded ${label}` : `${label} could not be loaded (incompatible or damaged file)`, done ? 'good' : 'bad');
    dash.rerender();
  });
}

function renderSession(dash, body) {
  const sim = dash.sim;
  const p = dash.project || {};
  const st = dash.state;

  body.appendChild(el('h3', { class: 'section', text: 'Current project' }));
  body.appendChild(el('div', { class: 'grid c4' }, [
    kpi('Seed', String(p.seed ?? '—')),
    kpi('Difficulty', humanize(p.difficulty || '—')),
    kpi('Approach', humanize(p.approach || '—')),
    kpi('Project day', String(p.day ?? 0), typeof p.dateLabel === 'function' ? p.dateLabel() : ''),
  ]));

  body.appendChild(el('h3', { class: 'section', text: 'Decision events' }));
  const auto = get(dash, 'game.autoDecide', true) !== false;
  body.appendChild(el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Decision events' }, [
    [true, 'Auto-decide'], [false, 'Ask me'],
  ].map(([v, l]) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': v === auto ? 'true' : 'false', class: v === auto ? 'active' : null,
    onclick: () => { setting(dash, 'game.autoDecide', v); dash.rerender(); },
  }, [l]))));
  body.appendChild(el('p', { class: 'note', text: 'Auto-decide applies the option with the best trade-off score (sum of the −2…+2 chips; safety weighted ×1.25, unethical options penalised; ties go to the lower cost/time impact) and shows a small notice — the clock never stops. Ask me shows each dilemma card, with “Choose best for me” and Esc picking the same recommended option. Every choice is recorded in Monitoring & Control → Issue & decision logs.' }));

  body.appendChild(el('h3', { class: 'section', text: 'Save slots' }));
  if (!storageAvailable()) {
    body.appendChild(el('div', { class: 'callout warn' }, [
      icon('warning', 16),
      el('span', { text: 'This browser blocks storage for files opened from disk. Use Export JSON below — it works everywhere and can be imported on any machine.' }),
    ]));
  }
  const grid = el('div', { class: 'slot-grid' });
  for (const slot of SLOTS) {
    const d = describeSlot(slot);
    const label = SLOT_LABELS[slot];
    grid.appendChild(el('div', { class: `slot-card ${d ? '' : 'empty'}`.trim() }, [
      el('div', { class: 'slot-head' }, [
        icon(slot === 'auto' ? 'cycle' : 'save', 16),
        el('b', { text: label }),
        slot === 'auto' ? pill('every 60 days', 'muted') : null,
      ]),
      d ? el('div', { class: 'slot-meta' }, [
        el('div', { text: `Day ${d.day} · ${d.dateLabel}` }),
        el('div', { class: 'muted', text: `${humanize(d.difficulty)} · ${humanize(d.approach)} · seed ${d.seed}` }),
        el('div', { class: 'muted small', text: `Saved ${d.savedAt} · ${d.sizeKb} KB` }),
      ]) : el('div', { class: 'slot-meta muted', text: slot === 'auto' ? 'Written automatically every 60 project days.' : 'Empty slot.' }),
      el('div', { class: 'row' }, [
        button(slot === 'auto' ? 'Save now' : 'Save', () => {
          const r = writeSlot(slot, sim.sessionData());
          sim.toast(r.ok ? `Saved to ${label}` : r.reason, r.ok ? 'good' : 'bad');
          dash.rerender();
        }, { small: true, icon: 'save', disabled: !storageAvailable() }),
        button('Load', () => loadData(dash, readSlot(slot), label), { small: true, kind: 'ghost', icon: 'import', disabled: !d }),
        button('Clear', () => {
          confirmModal('Clear slot?', `Delete the save in ${label}? This cannot be undone.`, { okLabel: 'Clear', danger: true }).then((ok) => {
            if (!ok) return;
            clearSlot(slot);
            sim.toast(`${label} cleared`);
            dash.rerender();
          });
        }, { small: true, kind: 'ghost', icon: 'trash', disabled: !d }),
      ]),
    ]));
  }
  body.appendChild(grid);

  body.appendChild(el('h3', { class: 'section', text: 'Export & import' }));
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', 'aria-label': 'Choose a session JSON file' });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadData(dash, JSON.parse(String(reader.result)), f.name);
      } catch {
        sim.toast(`${f.name} is not valid JSON`, 'bad');
      }
    };
    reader.readAsText(f);
    fileInput.value = '';
  });
  const paste = el('textarea', { rows: 3, placeholder: 'Or paste a session JSON here…', 'aria-label': 'Paste session JSON', spellcheck: 'false' });
  paste.value = st.paste || '';
  paste.addEventListener('input', () => { st.paste = paste.value; });
  body.appendChild(el('div', { class: 'row' }, [
    button('Export JSON', () => {
      const r = sim.download(`HDD_session_day${p.day ?? 0}.json`, 'application/json', JSON.stringify(sim.sessionData(), null, 1));
      sim.toast(`Exported ${r && r.filename ? r.filename : 'session'}`, 'good');
    }, { icon: 'export', kind: 'primary' }),
    button('Import file…', () => fileInput.click(), { icon: 'import' }),
    fileInput,
  ]));
  body.appendChild(paste);
  body.appendChild(el('div', { class: 'row' }, [
    button('Import pasted JSON', () => {
      const text = paste.value.trim();
      if (!text) { sim.toast('Paste a session JSON first', 'warn'); return; }
      try {
        loadData(dash, JSON.parse(text), 'the pasted session');
      } catch {
        sim.toast('The pasted text is not valid JSON', 'bad');
      }
    }, { icon: 'import', kind: 'ghost', small: true }),
  ]));

  body.appendChild(el('h3', { class: 'section', text: 'New project' }));
  if (st.seed === undefined) st.seed = p.seed ?? 20270104;
  if (!st.difficulty) st.difficulty = p.difficulty || 'professional';
  if (!st.approach) st.approach = p.approach || 'hybrid';
  const seed = el('input', { type: 'number', min: 1, step: 1, value: st.seed, inputmode: 'numeric' });
  seed.addEventListener('input', () => { st.seed = Number(seed.value); });
  body.appendChild(el('div', { class: 'form-grid' }, [
    field('Seed', el('div', { class: 'row nowrap' }, [
      seed,
      button('', () => { st.seed = Math.floor(1 + Math.random() * 99999999); seed.value = st.seed; }, { icon: 'dice', kind: 'ghost', small: true, title: 'Random seed', ariaLabel: 'Random seed' }),
    ]), 'Same seed + same choices = the same project, for fair class comparison.'),
    field('Difficulty', select([
      { value: 'trainee', label: 'Trainee — gentle risks, generous reserves' },
      { value: 'professional', label: 'Professional — realistic' },
      { value: 'crisis', label: 'Crisis — frequent shocks, tight funding' },
    ], st.difficulty, (v) => { st.difficulty = v; })),
    field('Delivery approach', select([
      { value: 'predictive', label: 'Predictive (waterfall)' },
      { value: 'agile', label: 'Agile' },
      { value: 'hybrid', label: 'Hybrid' },
    ], st.approach, (v) => { st.approach = v; })),
  ]));
  body.appendChild(el('div', { class: 'row' }, [
    button('Start new project', () => {
      confirmModal('Start a new project?', 'The current project will be replaced. Save or export it first if you want to keep it.', { okLabel: 'Start', danger: true }).then((ok) => {
        if (!ok) return;
        const s = Number.isFinite(st.seed) && st.seed > 0 ? Math.floor(st.seed) : undefined;
        sim.newProject({ seed: s, difficulty: st.difficulty, approach: st.approach });
        sim.toast(`New ${st.difficulty} project chartered (seed ${s ?? 'default'})`, 'good');
        dash.rerender();
      });
    }, { kind: 'primary', icon: 'flag' }),
  ]));
}

/* ------------------------------------------------------------ graphics tab */

function renderGraphics(dash, body) {
  const sim = dash.sim;
  const q = sim.engine && sim.engine.quality;
  const stats = sim.engine && sim.engine.stats ? sim.engine.stats : {};
  body.appendChild(el('h3', { class: 'section', text: 'Quality tier' }));
  body.appendChild(el('div', { class: 'grid c3' }, [
    kpi('Current tier', humanize(q ? q.tier : '—'), q && q.auto ? 'Adaptive' : 'Pinned'),
    kpi('Detected for this GPU', humanize(q ? q.detected : '—')),
    kpi('Frame rate', Number.isFinite(stats.fps) ? `${stats.fps.toFixed(0)} fps` : '—', `${(stats.calls || 0).toLocaleString()} draw calls`),
  ]));
  const tier = get(dash, 'graphics.tier', 'auto');
  body.appendChild(el('div', { class: 'form-grid' }, [
    field('Tier', select([
      { value: 'auto', label: 'Auto — adapt to frame rate' },
      { value: 'low', label: 'Low — laptops, phones' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'ultra', label: 'Ultra — discrete GPU, 4K projector' },
    ], tier, (v) => {
      setting(dash, 'graphics.tier', v);
      if (q) {
        if (v === 'auto') {
          if (q.setAuto) q.setAuto(true);
          if (q.setTier && q.detected) q.setTier(q.detected, { auto: true });
        } else if (q.setTier) q.setTier(v);
      }
      sim.toast(v === 'auto' ? 'Graphics: adaptive quality' : `Graphics tier: ${v}`);
      setTimeout(() => dash.rerender(), 50);
    }), 'Adaptive mode steps down when the frame rate falls below 34 fps.'),
  ]));
  body.appendChild(el('h3', { class: 'section', text: 'Weather & time of day' }));
  const ov = sim.weatherOverride;
  const pw = (sim.project && sim.project.weather) || {};
  const sky = sim.world && sim.world.sky;
  body.appendChild(el('div', { class: 'form-grid' }, [
    field('Weather', select(WEATHER_CHOICES.map((w) => ({ value: w.id, label: w.id === 'auto' ? `Auto — follow the project (now: ${pw.label || humanize(pw.kind || 'clear')})` : w.label })), ov && ov.kind ? ov.kind : 'auto', (v) => {
      applyWeatherChoice(sim, v, ov && ov.intensity ? ov.intensity : 0.8);
      sim.toast(v === 'auto' ? 'Weather: following the project' : `Weather: ${(WEATHER_CHOICES.find((w) => w.id === v) || {}).label}`);
      dash.rerender();
    }), 'Also on the HUD: click the weather read-out. Manual weather is visual — productivity still follows the project’s simulated weather.'),
    field('Intensity', slider(0.1, 1, 0.05, ov && ov.intensity ? ov.intensity : 0.8, (v, done) => {
      if (done && sim.weatherOverride && sim.weatherOverride.kind !== 'clear') sim.setWeatherOverride(sim.weatherOverride.kind, v);
    }, (v) => fmtPct(v, 0), { 'aria-label': 'Weather intensity', disabled: !(ov && ov.kind && ov.kind !== 'clear') })),
    field('Time of day', slider(0, 24, 0.25, sky ? sky.hour : 9.5, (v) => { if (sky && sky.setHour) sky.setHour(v); }, (v) => {
      const h = Math.floor(v % 24); const m = Math.round((v - Math.floor(v)) * 60) % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }, { 'aria-label': 'Time of day (hours)' }), 'Shortcuts: [ and ] step 30 minutes, N toggles day / night.'),
  ]));
  body.appendChild(el('div', { class: 'row' }, TIME_PRESETS.map(([l, h]) => button(l, () => { if (sky && sky.setHour) sky.setHour(h); dash.rerender(); }, { small: true, kind: 'ghost' }))));

  body.appendChild(el('h3', { class: 'section', text: 'Effects' }));
  const list = el('div', { class: 'switch-list' });
  for (const [key, label, hint] of EFFECTS) {
    list.appendChild(toggle(label, get(dash, `graphics.${key}`, true), (on) => {
      setting(dash, `graphics.${key}`, on);
      if (q && typeof q.override === 'function') q.override(key, on);
    }, hint));
  }
  body.appendChild(list);
}

/* --------------------------------------------------------------- audio tab */

function renderAudio(dash, body) {
  const sim = dash.sim;
  const audio = sim.audio || {};
  body.appendChild(el('h3', { class: 'section', text: 'Sound' }));
  const list = el('div', { class: 'switch-list' });
  list.appendChild(toggle('Mute all sound', !!audio.muted, (on) => {
    if (audio.resume) audio.resume();
    if (audio.toggleMute) audio.toggleMute(on);
    setting(dash, 'audio.muted', on);
    if (sim.hud && sim.hud.refreshSound) sim.hud.refreshSound();
  }, 'Shortcut: K'));
  list.appendChild(toggle('Narrate the guided tour', !!get(dash, 'audio.narration', false), (on) => setting(dash, 'audio.narration', on),
    'Reads tour beats aloud with the browser’s offline speech voice.'));
  body.appendChild(list);
  body.appendChild(field('Master volume', slider(0, 1, 0.05, Number.isFinite(audio.volume) ? audio.volume : get(dash, 'audio.volume', 0.8), (v, done) => {
    if (audio.setVolume) audio.setVolume(v);
    if (done) {
      setting(dash, 'audio.volume', v);
      setting(dash, 'audio.muted', false);
      if (sim.hud && sim.hud.refreshSound) sim.hud.refreshSound();
    }
  }, (v) => fmtPct(v, 0), { 'aria-label': 'Master volume' })));
  body.appendChild(el('div', { class: 'row' }, [
    button('Play test chime', () => {
      if (audio.resume) audio.resume();
      if (audio.discovery) audio.discovery();
      else sim.toast('Audio is not ready yet — click the 3D view once to enable it.', 'warn');
    }, { icon: 'sound', kind: 'ghost', small: true }),
  ]));
}

/* ------------------------------------------------------- accessibility tab */

function renderAccess(dash, body) {
  body.appendChild(el('h3', { class: 'section', text: 'Display' }));
  body.appendChild(field('Interface scale', slider(0.8, 1.8, 0.05, get(dash, 'accessibility.uiScale', 1), (v, done) => {
    if (done) setting(dash, 'accessibility.uiScale', v);
    else document.documentElement.style.setProperty('--ui-scale', String(v));
  }, (v) => `${Math.round(v * 100)}%`, { 'aria-label': 'Interface scale' }), 'Conference mode enforces at least 135%.'));
  const list = el('div', { class: 'switch-list' });
  const sw = (path, label, hint, map = (v) => v, read = (v) => !!v) =>
    list.appendChild(toggle(label, read(get(dash, path)), (on) => setting(dash, path, map(on)), hint));
  sw('accessibility.conference', 'Conference / projector mode', 'Large type and bold contrast for a hall screen.');
  sw('accessibility.highContrast', 'High contrast', 'Solid panels, brighter text and thicker outlines.');
  sw('accessibility.reducedMotion', 'Reduce motion', 'No animations, camera shake or confetti.');
  sw('accessibility.palette', 'Colour-blind-safe palette', 'Okabe–Ito colours for charts and status.', (on) => (on ? 'cb-safe' : 'default'), (v) => v === 'cb-safe');
  sw('accessibility.captions', 'Captions for narration', 'Show the tour narration text on screen.');
  body.appendChild(list);
  body.appendChild(el('h3', { class: 'section', text: 'Status colours' }));
  body.appendChild(el('div', { class: 'swatches' }, [
    ['ok', 'On track'], ['warn', 'Watch'], ['bad', 'Off track'], ['info', 'Information'], ['brass', 'Highlight'], ['ajrak', 'Accent'],
  ].map(([k, l]) => el('span', { class: `swatch sw-${k}` }, [el('i'), l]))));
}

/* ------------------------------------------------------------ controls tab */

function renderControls(dash, body) {
  const sim = dash.sim;
  const list = el('div', { class: 'switch-list' });
  list.appendChild(toggle('Invert vertical look', !!get(dash, 'controls.invertY', false), (on) => setting(dash, 'controls.invertY', on)));
  list.appendChild(toggle('On-screen touch controls', !!(sim.touch && sim.touch.enabled), (on) => {
    if (sim.touch && sim.touch.setEnabled) {
      sim.touch.forced = on;
      sim.touch.setEnabled(on);
    }
  }, 'Shortcut: T'));
  body.appendChild(list);
  body.appendChild(field('Look sensitivity', slider(0.3, 2.5, 0.05, get(dash, 'controls.sensitivity', 1), (v, done) => {
    if (done) setting(dash, 'controls.sensitivity', v);
  }, (v) => `${v.toFixed(2)}×`, { 'aria-label': 'Look sensitivity' })));
  body.appendChild(el('h3', { class: 'section', text: 'Key bindings' }));
  const remap = get(dash, 'controls.remap', {}) || {};
  const rows = KEY_BINDINGS.map(([k, d]) => [k, d]);
  for (const [from, to] of Object.entries(remap)) rows.push([`${from} → ${to}`, 'Custom remap']);
  body.appendChild(table([
    { key: 0, label: 'Key', format: (v) => el('kbd', { text: v }) },
    { key: 1, label: 'Action' },
  ], rows, { dense: true }));
}

/* ------------------------------------------------------------ language tab */

function renderLanguage(dash, body) {
  const sim = dash.sim;
  body.appendChild(el('h3', { class: 'section', text: 'Interface language' }));
  const lang = get(dash, 'language', 'en');
  body.appendChild(el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Interface language' }, [
    ['en', 'English'], ['ur', 'اردو · Urdu'],
  ].map(([v, l]) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': v === lang ? 'true' : 'false', class: v === lang ? 'active' : null, dir: 'auto',
    onclick: () => { setting(dash, 'language', v); dash.rerender(); },
  }, [l]))));
  body.appendChild(el('p', { class: 'note', text: 'Urdu translates the mode names, panel titles, HUD metric labels and common actions. Technical terms (SPI, CPI, WBS) stay in English, as they appear in PMBOK and on site.' }));

  body.appendChild(el('h3', { class: 'section', text: 'Role & name' }));
  const name = el('input', { type: 'text', maxlength: 60, value: get(dash, 'studentName', ''), placeholder: 'Your name (shown on reports)', autocomplete: 'name' });
  name.addEventListener('change', () => setting(dash, 'studentName', name.value.trim()));
  body.appendChild(el('div', { class: 'form-grid' }, [
    field('Role', select([
      { value: 'student', label: 'Student' },
      { value: 'instructor', label: 'Instructor — unlocks Operations preview and editing' },
    ], get(dash, 'role', 'student'), (v) => { setting(dash, 'role', v); sim.toast(`Role: ${v}`); }), 'Instructors can preview Operations mode before handover.'),
    field('Student name', name),
  ]));
  body.appendChild(el('h3', { class: 'section', text: 'Start over' }));
  body.appendChild(el('div', { class: 'row' }, [
    button('Replay the tutorial', () => { dash.close(); if (sim.onboarding && sim.onboarding.start) sim.onboarding.start(); }, { icon: 'play' }),
    button('Reset all settings', () => {
      confirmModal('Reset settings?', 'Restore every preference to its default. Saves are not touched.', { okLabel: 'Reset', danger: true }).then((ok) => {
        if (!ok) return;
        sim.settings.reset();
        sim.toast('Settings restored to defaults');
        dash.rerender();
      });
    }, { icon: 'cycle', kind: 'ghost' }),
    button('About this simulator', () => openModal({
      title: 'SKY GATEWAY HYDERABAD', icon: 'planeUp',
      body: [
        el('p', { text: 'A 3D project-management simulator of the Hyderabad Airport (HDD · OPKD) revival and expansion programme, built for a 15-week project-management course.' }),
        el('p', { class: 'muted', text: 'Runs offline from one HTML file. Real-world facts come from a cited facts table; budgets, schedules, vendors, airlines and events are simulated scenario data. three.js r160 (MIT).' }),
      ],
    }), { icon: 'help', kind: 'ghost' }),
  ]));
}

const RENDER = { session: renderSession, graphics: renderGraphics, audio: renderAudio, access: renderAccess, controls: renderControls, language: renderLanguage };

export const PANEL_SESSION = {
  id: 'session',
  autoRefresh: false,
  render(dash, body) {
    const st = dash.state;
    if (!st.tab) st.tab = 'session';
    body.appendChild(dash.tag([], 'System · Accessibility'));
    body.appendChild(tabs(TABS, st.tab, (id) => {
      st.tab = id;
      dash.rerender();
      const b = dash.body.querySelector(`[data-tab="${id}"]`);
      if (b) b.focus();
    }));
    const pane = el('div', { class: 'tab-pane', role: 'tabpanel' });
    (RENDER[st.tab] || renderSession)(dash, pane);
    body.appendChild(pane);
    body.appendChild(el('div', { class: 'panel-foot' }, [dash.simBadge()]));
  },
};


