/**
 * AEON SPIRE — heads-up display (E.8).
 *
 * A project-management instrument panel rather than a game HUD, because that
 * is what this deliverable is for. Five surfaces:
 *
 *   • a branded top bar carrying the mode switch and the live earned-value
 *     metrics, so the PM figures are visible whether or not the timeline
 *     dock is open;
 *   • an icon rail for the things you reach for repeatedly;
 *   • a context card naming the zone and the interior you are standing in;
 *   • the bottom dock: a duration-weighted Gantt of the ten milestones, a
 *     draggable scrubber and the earned-value block;
 *   • overlays for the control reference and the zone index.
 *
 * All markup and styling ship with this module, so the single-file build has
 * no external stylesheet and no icon font.
 */

import { MILESTONES, TOTAL_DAYS, TOTAL_BUDGET } from '../construction/ConstructionTimeline.js';
import { ZONE_PRESETS } from '../world/SitePlan.js';
import { CSS, ICONS } from './theme.js';
import { commas, clamp } from '../core/MathUtil.js';

/* ------------------------------------------------------------------ */
/* Tiny DOM helpers — clearer than a wall of innerHTML                 */
/* ------------------------------------------------------------------ */

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) n.appendChild(c);
  return n;
}

function icon(name, size = 16) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.innerHTML = ICONS[name] || '';
  return s;
}

/** The E.6 table, grouped, and the single source for the help overlay. */
const HELP = [
  ['Movement', [
    ['W A S D', 'Move / walk'],
    ['Mouse', 'Look around — click the scene to capture the pointer'],
    ['Shift', 'Sprint / fast-fly'],
    ['Q / E', 'Descend / ascend (fly mode)'],
    ['F', 'Toggle walk ↔ fly'],
    ['Esc', 'Release pointer lock']
  ]],
  ['Zones', [
    ['1 – 7', 'Jump to each of the seven zones'],
    ['1 – 7 again', 'Step inside that zone’s interiors']
  ]],
  ['Atmosphere', [
    ['T', 'Cycle time of day'],
    ['G', 'Force Golden Hour'],
    ['N', 'Force Night'],
    ['R', 'Toggle rain']
  ]],
  ['Construction', [
    ['C', 'Toggle Construction Mode'],
    ['[  /  ]', 'Scrub the timeline back / forward'],
    ['Space', 'Play / pause the timeline']
  ]],
  ['Presentation', [
    ['M', 'Toggle the soundscape'],
    ['H', 'Controls and the zone index'],
    ['P', 'Photo mode — hide the UI, shallow depth of field']
  ]]
];

/** One line on each zone, for the index overlay. */
const ZONE_BLURB = {
  canal: 'A navigable canal ring sunk 8 m below the plaza, crossed by arched footbridges. The water is part of the building’s cooling loop.',
  sail: 'A doubly-curved sail skin on a bronze diagrid, over a full-height atrium crossed by suspended sky-bridges.',
  ring: 'A 104 m structural disc standing on edge, the tower waisting through it, with a glass-bottomed halo cantilevered clear.',
  spire: 'A tapering lattice from 440 m to 700 m, housing the tuned mass damper and terminating in the beacon.',
  observatory: 'Deliberately tilted 8°, held by a slung counterweight and a stay-cable fan. A plumb column stands beside it to read the lean against.',
  court: 'A mirror-symmetrical reflecting pool leading to a glass pyramid that houses the geothermal core and the solar chimney.',
  annex: 'A curved speed-form pavilion, a modular-block maker space and a glazed arcade over the light-and-water show plaza.'
};

export class HUD {
  /** @param {AeonSpire} app */
  constructor(app) {
    this.app = app;
    this.photoMode = false;
    this.helpVisible = false;
    this._toast = 0;
    this._acc = 0;
    this._heading = 1e9;
    this.build();
  }

  /* ------------------------------------------------------------------ */

  build() {
    document.head.appendChild(el('style', { text: CSS }));
    const root = el('div', { id: 'aeon-ui' });
    this.root = root;

    root.appendChild(this._topBar());
    root.appendChild(this._rail());
    root.appendChild(this._context());
    root.appendChild(this._dock());
    root.appendChild(this._compass());
    root.appendChild(this._overlay());
    this.toastEl = el('div', { class: 'a-toast a-panel' });
    root.appendChild(this.toastEl);

    document.body.appendChild(root);
  }

  _topBar() {
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('viewBox', '0 0 26 30');
    mark.setAttribute('width', '24');
    mark.setAttribute('height', '28');
    mark.innerHTML =
      '<path d="M13 1 L16.4 11 H9.6 Z" fill="#e8c07a"/>' +
      '<ellipse cx="13" cy="15.4" rx="8.4" ry="3.1" fill="none" stroke="#8fb4e8" stroke-width="1.2"/>' +
      '<path d="M10.4 15.4 L13 11 L15.6 15.4 L13 21 Z" fill="#cfe2ff" opacity=".75"/>' +
      '<path d="M4 26h18v2H4z M6.5 22.5h13v2h-13z" fill="#9d7532"/>';

    this.modeBtns = {};
    const mk = (id, label, key, on) =>
      (this.modeBtns[id] = el('a-btn' in {} ? 'button' : 'button',
        { class: 'a-btn', onclick: on, title: label },
        [el('span', { text: label }), el('kbd', { text: key })]));

    this.metricEls = {};
    const metric = (id, label) => {
      const b = el('b', { text: '—' });
      const box = el('div', { class: 'a-metric' }, [b, el('span', { text: label })]);
      this.metricEls[id] = { box, b };
      return box;
    };

    this.topBar = el('div', { class: 'a-top a-panel' }, [
      el('div', { class: 'a-brand' }, [mark, el('div', {}, [
        el('div', { class: 'n', text: 'AEON SPIRE' }),
        el('small', { text: 'City of Wonders · 700 m' })
      ])]),
      el('div', { class: 'a-seg' }, [
        mk('walk', 'Walk', 'F', () => this.app.setCameraMode('walk')),
        mk('fly', 'Fly', 'F', () => this.app.setCameraMode('fly'))
      ]),
      el('div', { class: 'a-grow' }),
      el('div', { class: 'a-seg' }, [
        (this.todBtn = el('button', {
          class: 'a-btn', title: 'Cycle time of day',
          onclick: () => { this.app.cycleTimeOfDay(); this.toast(this.app.timeOfDayStatus().name); }
        }, [icon('time', 14), el('span', { text: 'Day' }), el('kbd', { text: 'T' })])),
        (this.rainBtn = el('button', {
          class: 'a-btn', title: 'Toggle rain',
          onclick: () => { this.app.toggleRain(); this.toast(this.app.weatherStatus().rain ? 'Rain' : 'Clear'); }
        }, [icon('rain', 14), el('kbd', { text: 'R' })])),
        (this.buildBtn = el('button', {
          class: 'a-btn', title: 'Construction mode',
          onclick: () => { const on = this.app.toggleConstruction(); this.toast(on ? 'Construction Mode' : 'Present day'); }
        }, [icon('build', 14), el('span', { text: 'Build' }), el('kbd', { text: 'C' })]))
      ]),
      el('div', { class: 'a-metrics' }, [
        metric('height', 'Eye height'),
        metric('zones', 'Rooms live'),
        metric('day', 'Programme day'),
        metric('complete', 'Complete'),
        metric('spi', 'SPI'),
        metric('cpi', 'CPI'),
        metric('fps', 'FPS')
      ])
    ]);
    return this.topBar;
  }

  _rail() {
    const b = (name, tip, on) => el('button', { onclick: on, title: tip },
      [icon(name, 17), el('span', { class: 'tip', text: tip })]);
    this.railBtns = {
      zones: b('zones', 'Zone index  ·  1–7', () => this.openOverlay('zones')),
      sound: b('sound', 'Soundscape  ·  M', () => { this.app.toggleAudio(); }),
      photo: b('photo', 'Photo mode  ·  P', () => this.app.togglePhotoMode()),
      help: b('help', 'Controls  ·  H', () => this.openOverlay('help'))
    };
    return el('div', { class: 'a-rail a-panel' }, Object.values(this.railBtns));
  }

  _context() {
    this.ctxTitle = el('h3', { text: 'AEON SPIRE' });
    this.ctxSub = el('div', { class: 'sub', text: 'Press 1–7 to visit the zones' });
    this.ctxBody = el('p', { text: 'Seven zones, each borrowing one engineering idea from a real-world marvel — never its likeness.' });
    const stat = (id, label) => {
      const b = el('b', { text: '—' });
      this[id] = b;
      return el('div', {}, [b, el('span', { text: label })]);
    };
    this.contextEl = el('div', { class: 'a-context a-panel' }, [
      this.ctxTitle, this.ctxSub, this.ctxBody,
      el('div', { class: 'stat-row' }, [
        stat('ctxAlt', 'Altitude'),
        stat('ctxRooms', 'Interiors live'),
        stat('ctxMode', 'Camera')
      ])
    ]);
    return this.contextEl;
  }

  _dock() {
    this.msChip = el('span', { class: 'a-chip', text: 'M1' });
    this.msName = el('span', { class: 't', text: '—' });
    this.msTag = el('span', { class: 'a-tag', text: 'critical path' });
    this.msEquip = el('span', { class: 'eq', text: '' });

    this.gantt = el('div', { class: 'a-gantt' });
    this.bars = MILESTONES.map((m) => {
      const fill = el('i');
      const label = el('u', { text: String(m.n) });
      const bar = el('div', {
        class: 'a-gbar', title: `M${m.n} · ${m.name}\nDay ${m.day} of ${TOTAL_DAYS} · ${m.duration} days\n${m.equipment}\n${m.note}`,
        onclick: () => { this.app.setConstruction(true); this.app.goToMilestone(m.n); this.toast(`M${m.n} · ${m.name}`); }
      }, [fill, label]);
      bar.style.flex = `${m.duration} 1 0`;
      this.gantt.appendChild(bar);
      /* `el` is the name the QA harness reads the bar's classes through; it
         is an alias for the same node, kept so the contract does not depend
         on which field name this file happens to use internally. */
      return { bar, el: bar, fill, m };
    });

    this.scrubFill = el('i');
    this.scrubKnob = el('u');
    this.scrub = el('div', { class: 'a-scrub' }, [this.scrubFill, this.scrubKnob]);
    let drag = false;
    const set = (e) => {
      const r = this.scrub.getBoundingClientRect();
      this.app.construction.setProgress(clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1));
      this.app.setConstruction(true);
    };
    this.scrub.addEventListener('pointerdown', (e) => {
      drag = true; set(e); this.scrub.setPointerCapture(e.pointerId);
    });
    this.scrub.addEventListener('pointermove', (e) => { if (drag) set(e); });
    this.scrub.addEventListener('pointerup', () => { drag = false; });

    this.statEls = {};
    const stats = el('div', { class: 'a-stats' });
    for (const [k, label] of [
      ['day', 'Programme day'], ['complete', 'Percent complete'], ['budget', 'Budget utilised'],
      ['ev', 'Earned value'], ['pv', 'Planned value'], ['spi', 'SPI · schedule'], ['cpi', 'CPI · cost']
    ]) {
      const v = el('div', { class: 'v', text: '—' });
      this.statEls[k] = v;
      stats.appendChild(el('div', { class: 'a-stat' }, [el('div', { class: 'k', text: label }), v]));
    }

    this.dock = el('div', { class: 'a-dock a-panel hidden' }, [
      el('div', { class: 'a-dock-head' }, [this.msChip, this.msName, this.msTag, this.msEquip]),
      this.gantt, this.scrub, stats
    ]);
    return this.dock;
  }

  _compass() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '-32 -32 64 64');
    s.setAttribute('width', '58');
    s.setAttribute('height', '58');
    s.innerHTML =
      '<circle r="27" fill="none" stroke="rgba(150,178,214,.2)" stroke-width="1"/>' +
      '<circle r="20" fill="none" stroke="rgba(150,178,214,.12)" stroke-width="1"/>' +
      '<g id="a-needle">' +
      '<path d="M0,-22 L5,4 L0,0 L-5,4 Z" fill="#e8c07a"/>' +
      '<path d="M0,22 L5,-4 L0,0 L-5,-4 Z" fill="#4c5a70"/></g>' +
      '<text x="0" y="-23" text-anchor="middle" font-size="9" fill="#93a6c2" font-family="ui-sans-serif">N</text>';
    this.needle = s.querySelector('#a-needle');
    return el('div', { class: 'a-compass a-panel' }, [s]);
  }

  _overlay() {
    /* --- controls --- */
    const cols = el('div', { class: 'a-cols' });
    for (const [group, rows] of HELP) {
      cols.appendChild(el('div', { class: 'a-grp', text: group }));
      for (const [k, d] of rows) {
        cols.appendChild(el('div', { class: 'a-kv' }, [
          el('kbd', { text: k }), el('span', { text: d })
        ]));
      }
    }
    this.helpCard = el('div', { class: 'a-card a-panel' }, [
      el('h2', { text: 'CONTROLS' }),
      el('p', {
        class: 'lede',
        html: 'A 700 m fictional supertall and entertainment campus, composited from seven zones. ' +
          'Press <b>C</b> to watch it built over a 700-day programme, or <b>1–7</b> to visit each zone — ' +
          'press the same number twice to step inside.'
      }),
      cols,
      el('div', {
        class: 'a-foot',
        text: 'Every texture, sound and polygon in this project is generated procedurally at runtime. ' +
          'Nothing is downloaded, and no trademarked form, logo or character appears anywhere in the scene. ' +
          'Press H or Esc to close.'
      })
    ]);

    /* --- zone index --- */
    const grid = el('div', { class: 'a-zones' });
    ZONE_PRESETS.forEach((z, i) => {
      grid.appendChild(el('div', {
        class: 'a-zone',
        onclick: () => { this.closeOverlay(); this.app.jumpToZone(i); }
      }, [
        el('b', { text: z.name }),
        el('i', { text: 'Key ' + z.key }),
        el('span', { text: ZONE_BLURB[z.id] || '' })
      ]));
    });
    this.zoneCard = el('div', { class: 'a-card a-panel' }, [
      el('h2', { text: 'THE SEVEN ZONES' }),
      el('p', {
        class: 'lede',
        html: 'Each zone borrows one <b>engineering idea</b> from a real-world marvel and expresses it in ' +
          'original geometry. Click a zone to travel there; press its number again to go inside.'
      }),
      grid,
      el('div', {
        class: 'a-foot',
        text: 'All 31 named interior spaces are modelled and furnished. Interiors build as you approach ' +
          'them and each carries its own acoustic, so a stone vault and a glass atrium do not sound alike.'
      })
    ]);

    this.overlay = el('div', {
      class: 'a-overlay',
      onclick: (e) => { if (e.target === this.overlay) this.closeOverlay(); }
    }, [this.helpCard, this.zoneCard]);
    this.helpCard.style.display = 'none';
    this.zoneCard.style.display = 'none';
    return this.overlay;
  }

  /* ------------------------------------------------------------------ */

  openOverlay(which) {
    this.overlayKind = which;
    this.helpCard.style.display = which === 'help' ? '' : 'none';
    this.zoneCard.style.display = which === 'zones' ? '' : 'none';
    this.overlay.classList.add('open');
    this.helpVisible = true;
    this.app.helpVisible = true;
    this.railBtns.help.classList.toggle('on', which === 'help');
    this.railBtns.zones.classList.toggle('on', which === 'zones');
  }

  closeOverlay() {
    this.overlay.classList.remove('open');
    this.helpVisible = false;
    this.app.helpVisible = false;
    this.railBtns.help.classList.remove('on');
    this.railBtns.zones.classList.remove('on');
  }

  setHelpVisible(on) {
    if (on) this.openOverlay(this.overlayKind === 'zones' ? 'zones' : 'help');
    else this.closeOverlay();
  }

  setPhotoMode(on) {
    this.photoMode = on;
    this.root.classList.toggle('photo', on);
    this.railBtns.photo.classList.toggle('on', on);
  }

  onMilestoneChange(m) {
    if (this.app.construction.active) this.toast(`M${m.n} · ${m.name}`);
  }

  toast(text, seconds = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this._toast = seconds;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this._toast > 0) {
      this._toast -= dt;
      if (this._toast <= 0) this.toastEl.classList.remove('show');
    }
    if (this.photoMode) return;

    // DOM at 60 Hz is wasted work and causes layout thrash; ~12 Hz is plenty.
    this._acc += dt;
    if (this._acc < 0.08) return;
    this._acc = 0;

    const app = this.app;
    const tod = app.timeOfDayStatus();
    const w = app.weatherStatus();
    const cs = app.constructionStatus();
    const audio = app.audioStatus();
    const st = app.engine.stats();
    const room = app.world.interiors.current;

    /* ---- top bar ---- */
    this.modeBtns.walk.classList.toggle('on', app.cameraMode === 'walk');
    this.modeBtns.fly.classList.toggle('on', app.cameraMode === 'fly');
    this.todBtn.querySelector('span').textContent = tod.name;
    this.rainBtn.classList.toggle('on', w.rain);
    this.buildBtn.classList.toggle('on', cs.active);
    this.railBtns.sound.classList.toggle('on', audio.enabled && audio.running);

    const setMetric = (id, text, grade) => {
      const m = this.metricEls[id];
      m.b.textContent = text;
      m.box.classList.remove('good', 'warn', 'bad');
      if (grade) m.box.classList.add(grade);
    };
    const gradeIdx = (v) => (v >= 0.995 ? 'good' : v >= 0.95 ? 'warn' : 'bad');
    /* The four earned-value figures only mean anything while the programme
       is running; outside construction mode they were four em-dashes taking
       up half the bar, so they are hidden and the campus reads instead. */
    for (const id of ['day', 'complete', 'spi', 'cpi']) {
      this.metricEls[id].box.hidden = !cs.active;
    }
    this.metricEls.height.box.hidden = cs.active;
    this.metricEls.zones.box.hidden = cs.active;
    if (cs.active) {
      setMetric('day', String(cs.day));
      setMetric('complete', (cs.percentComplete * 100).toFixed(0) + '%');
      setMetric('spi', cs.spi.toFixed(2), gradeIdx(cs.spi));
      setMetric('cpi', cs.cpi.toFixed(2), gradeIdx(cs.cpi));
    } else {
      setMetric('height', Math.round(app.camera.position.y) + ' m');
      setMetric('zones', String(app.world.interiors.visibleCount));
    }
    setMetric('fps', st.fps.toFixed(0), st.fps > 45 ? 'good' : st.fps > 26 ? 'warn' : 'bad');

    /* ---- context card ---- */
    if (room) {
      this.ctxTitle.textContent = room.name;
      this.ctxSub.textContent = (room.level ? room.level + ' · ' : '') + app.world.zone(room.zone).name;
      this.ctxBody.textContent = ZONE_BLURB[room.zone] || '';
    } else if (app.currentZoneName) {
      this.ctxTitle.textContent = app.currentZoneName.replace(' — interior', '');
      this.ctxSub.textContent = 'Exterior view';
      const z = ZONE_PRESETS.find(p => app.currentZoneName.startsWith(p.name));
      this.ctxBody.textContent = z ? (ZONE_BLURB[z.id] || '') : '';
    }
    this.ctxAlt.textContent = Math.round(app.camera.position.y) + ' m';
    this.ctxRooms.textContent = String(app.world.interiors.visibleCount);
    this.ctxMode.textContent = app.cameraMode === 'walk' ? 'Walk' : 'Fly';

    /* ---- compass ---- */
    if (this.needle) {
      /* Read the camera basis straight out of its world matrix: the forward
         axis is -Z, i.e. (-e8, -e9, -e10). Doing it this way keeps the HUD
         free of a three.js import and allocates nothing per frame. North is
         -Z, east is +X, and SVG rotates clockwise, which is the same sense. */
      const e = app.camera.matrixWorld.elements;
      const heading = Math.atan2(-e[8], e[10]) * 180 / Math.PI;
      if (Math.abs(heading - this._heading) > 0.25) {
        this._heading = heading;
        this.needle.setAttribute('transform', `rotate(${heading.toFixed(1)})`);
      }
    }

    /* ---- the PM dock ---- */
    this.dock.classList.toggle('hidden', !cs.active);
    if (!cs.active) return;

    this.msChip.textContent = 'M' + cs.milestone;
    this.msName.textContent = cs.milestoneName;
    this.msEquip.textContent = cs.equipment;
    this.msTag.style.display = cs.onCriticalPath ? '' : 'none';

    for (const b of this.bars) {
      const done = cs.milestone > b.m.n;
      const now = cs.milestone === b.m.n;
      b.bar.classList.toggle('done', done);
      b.bar.classList.toggle('now', now);
      b.fill.style.width = done ? '100%' : now ? (cs.milestoneProgress * 100).toFixed(1) + '%' : '0';
    }
    this.scrubFill.style.width = (cs.t * 100).toFixed(2) + '%';
    this.scrubKnob.style.left = (cs.t * 100).toFixed(2) + '%';

    const bn = (f) => '$' + (f * TOTAL_BUDGET / 1e9).toFixed(2) + 'bn';
    const S = this.statEls;
    S.day.innerHTML = `${cs.day}<small>of ${cs.totalDays}</small>`;
    S.complete.innerHTML = `${(cs.percentComplete * 100).toFixed(1)}<small>%</small>`;
    S.budget.innerHTML = `${(cs.budgetUsed * 100).toFixed(1)}<small>% · ${bn(cs.budgetUsed)}</small>`;
    S.ev.textContent = bn(cs.earnedValue);
    S.pv.textContent = bn(cs.plannedValue);
    S.spi.textContent = cs.spi.toFixed(3);
    S.cpi.textContent = cs.cpi.toFixed(3);
    for (const [k, v] of [['spi', cs.spi], ['cpi', cs.cpi]]) {
      S[k].classList.remove('good', 'warn', 'bad');
      S[k].classList.add(gradeIdx(v));
    }
  }

  /** For the QA harness. */
  status() {
    let targetOpacity = 1;
    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText === '#aeon-ui.photo' && rule.style.opacity !== '') {
            targetOpacity = this.root.matches('#aeon-ui.photo') ? Number(rule.style.opacity) : 1;
          }
        }
      }
    } catch (e) { /* not our stylesheet */ }
    return {
      photoMode: this.photoMode,
      hiddenClass: this.root.classList.contains('photo'),
      targetOpacity,
      pointerEvents: this.photoMode ? 'none' : '',
      helpVisible: this.helpVisible,
      pmPanelVisible: !this.dock.classList.contains('hidden'),
      ganttBars: this.bars.length,
      helpRows: this.overlay.querySelectorAll('.a-kv').length,
      zoneCards: this.overlay.querySelectorAll('.a-zone').length,
      dayText: this.statEls.day.textContent,
      budgetText: this.statEls.budget.textContent
    };
  }
}
