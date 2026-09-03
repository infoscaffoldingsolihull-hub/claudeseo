/**
 * AEON SPIRE — heads-up display (E.8).
 *
 * This is the project-management hook the brief asks for, so it is built
 * as a PM instrument panel rather than a game HUD:
 *
 *   • a Gantt-style bar of the ten milestones, synced to the scrubber and
 *     clickable, with the critical path marked;
 *   • a day counter against the 700-day programme;
 *   • an earned-value block — planned value, earned value, actual cost,
 *     the budget-utilised ticker, and the SPI / CPI indices those imply;
 *   • mode indicators for time of day, weather and camera;
 *   • a help overlay listing every key in the E.6 table.
 *
 * The DOM is created here rather than in index.html so the whole UI ships
 * with the module that owns it.
 */

import { MILESTONES, TOTAL_DAYS, TOTAL_BUDGET } from '../construction/ConstructionTimeline.js';
import { commas, clamp } from '../core/MathUtil.js';

const CSS = `
#aeon-ui, #aeon-ui * { box-sizing: border-box; }
#aeon-ui {
  position: fixed; inset: 0; pointer-events: none; z-index: 40;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #e8eef8; transition: opacity .45s ease;
  --gold: #e8c07a; --blue: #7fa8e8; --green: #6fdca0; --amber: #f0b44a; --red: #ff8a72;
  --panel: rgba(10,15,26,.72); --line: rgba(150,175,210,.22);
}
#aeon-ui.photo { opacity: 0; }
#aeon-ui .panel {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
  box-shadow: 0 8px 28px rgba(0,0,0,.35);
}

/* ---------- top-left: identity + modes ---------- */
#aeon-top { position: absolute; top: 14px; left: 14px; padding: 11px 14px; max-width: 340px; }
#aeon-top .title {
  font-size: 12.5px; letter-spacing: .3em; text-indent: .3em; font-weight: 600;
  background: linear-gradient(180deg,#fdf3de,#e8c07a); -webkit-background-clip: text;
  background-clip: text; color: transparent;
}
#aeon-top .sub { font-size: 10px; letter-spacing: .16em; color: #7f93b4; text-transform: uppercase; margin-top: 2px; }
#aeon-modes { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.chip {
  font-size: 10.5px; padding: 3px 8px; border-radius: 999px; letter-spacing: .05em;
  border: 1px solid var(--line); background: rgba(255,255,255,.05); white-space: nowrap;
}
.chip b { font-weight: 600; color: var(--gold); }
.chip.on { border-color: rgba(232,192,122,.5); background: rgba(232,192,122,.12); }
#aeon-zone { margin-top: 8px; font-size: 11.5px; color: #b9c9e0; min-height: 1.3em; }
#aeon-room { font-size: 10.5px; color: #8ea3c4; min-height: 1.2em; }

/* ---------- top-right: performance ---------- */
#aeon-perf {
  position: absolute; top: 14px; right: 14px; padding: 8px 11px;
  font-size: 10.5px; color: #8ea3c4; text-align: right; line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
#aeon-perf b { color: #d8e2f2; font-weight: 600; }

/* ---------- bottom: the PM panel ---------- */
#aeon-pm {
  position: absolute; left: 14px; right: 14px; bottom: 14px; padding: 12px 14px 11px;
  transition: transform .4s cubic-bezier(.2,.8,.2,1), opacity .35s ease;
}
#aeon-pm.hidden { transform: translateY(130%); opacity: 0; }
#aeon-pm .row1 { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; margin-bottom: 9px; }
#aeon-pm .ms-name { font-size: 13.5px; font-weight: 600; color: #f0f5fc; }
#aeon-pm .ms-num {
  font-size: 10px; letter-spacing: .14em; color: #0b1220; background: var(--gold);
  padding: 2px 7px; border-radius: 4px; font-weight: 700;
}
#aeon-pm .ms-equip { font-size: 11px; color: #8ea3c4; }
#aeon-pm .cp {
  font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--red);
  border: 1px solid rgba(255,138,114,.4); padding: 1px 6px; border-radius: 4px;
}

/* Gantt */
#aeon-gantt { display: flex; gap: 2px; height: 26px; margin-bottom: 8px; }
.gbar {
  position: relative; flex: 1 1 0; border-radius: 3px; overflow: hidden; cursor: pointer;
  background: rgba(255,255,255,.07); border: 1px solid var(--line);
  pointer-events: auto; transition: border-color .2s ease, background .2s ease;
}
.gbar:hover { border-color: rgba(232,192,122,.6); background: rgba(255,255,255,.12); }
.gbar > i {
  position: absolute; inset: 0; width: 0%;
  background: linear-gradient(90deg, rgba(111,220,160,.55), rgba(232,192,122,.75));
  transition: width .12s linear;
}
.gbar > span {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 9.5px; font-weight: 600; color: #cfdcee; text-shadow: 0 1px 2px rgba(0,0,0,.6);
}
.gbar.done > i { width: 100%; }
.gbar.current { border-color: var(--gold); box-shadow: 0 0 0 1px rgba(232,192,122,.35) inset; }

/* Readouts */
#aeon-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: 6px 14px; font-variant-numeric: tabular-nums;
}
.stat .k { font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #7f93b4; }
.stat .v { font-size: 15px; font-weight: 600; color: #f0f5fc; line-height: 1.25; }
.stat .v small { font-size: 10.5px; font-weight: 500; color: #8ea3c4; margin-left: 2px; }
.stat .v.good { color: var(--green); }
.stat .v.warn { color: var(--amber); }
.stat .v.bad { color: var(--red); }
#aeon-scrub {
  position: relative; height: 4px; margin: 9px 0 2px; border-radius: 3px;
  background: rgba(255,255,255,.09); pointer-events: auto; cursor: pointer;
}
#aeon-scrub > i {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px;
  background: linear-gradient(90deg, var(--blue), var(--gold));
}
#aeon-scrub > u {
  position: absolute; top: -4px; width: 12px; height: 12px; margin-left: -6px;
  border-radius: 50%; background: #f4efe4; box-shadow: 0 1px 5px rgba(0,0,0,.5);
}
#aeon-hint { font-size: 10px; color: #6f83a4; margin-top: 6px; letter-spacing: .04em; }

/* ---------- help overlay ---------- */
#aeon-help {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(4,7,13,.72); backdrop-filter: blur(4px); pointer-events: auto;
  padding: 22px; overflow: auto;
}
#aeon-help.show { display: flex; }
#aeon-help .card { max-width: 860px; width: 100%; padding: 22px 26px; }
#aeon-help h2 {
  margin: 0 0 4px; font-size: 15px; letter-spacing: .22em; font-weight: 600;
  background: linear-gradient(180deg,#fdf3de,#e8c07a); -webkit-background-clip: text;
  background-clip: text; color: transparent;
}
#aeon-help .lede { margin: 0 0 16px; font-size: 11.5px; color: #8ea3c4; line-height: 1.7; }
#aeon-help .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px,1fr)); gap: 6px 30px; }
#aeon-help .grp { font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--gold); margin: 12px 0 5px; grid-column: 1 / -1; }
#aeon-help .grp:first-child { margin-top: 0; }
#aeon-help dl { display: contents; }
#aeon-help .kv { display: flex; align-items: baseline; gap: 10px; font-size: 12px; padding: 2.5px 0; }
#aeon-help .kv kbd {
  min-width: 66px; text-align: center; font-family: inherit; font-size: 10.5px; font-weight: 600;
  padding: 2.5px 7px; border-radius: 5px; color: #0b1220;
  background: linear-gradient(180deg,#e6ecf6,#b9c6da); box-shadow: 0 1.5px 0 rgba(0,0,0,.4);
}
#aeon-help .kv span { color: #c4d2e6; }
#aeon-help .foot { margin-top: 18px; font-size: 10.5px; color: #6f83a4; line-height: 1.7; }

/* ---------- toast ---------- */
#aeon-toast {
  position: absolute; left: 50%; top: 74px; transform: translateX(-50%) translateY(-10px);
  padding: 8px 16px; font-size: 12px; letter-spacing: .05em; opacity: 0;
  transition: opacity .3s ease, transform .3s ease; white-space: nowrap;
}
#aeon-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 720px) {
  #aeon-top { max-width: 210px; padding: 8px 10px; }
  #aeon-perf { display: none; }
  #aeon-pm .ms-equip { display: none; }
  .gbar > span { font-size: 8.5px; }
  #aeon-stats { grid-template-columns: repeat(3, 1fr); }
}
`;

/** The E.6 table, grouped for the help overlay. */
const HELP = [
  ['Movement', [
    ['W A S D', 'Move / walk'],
    ['Mouse', 'Look around (click to capture the pointer)'],
    ['Shift', 'Sprint / fast-fly'],
    ['Q / E', 'Descend / ascend (fly mode)'],
    ['F', 'Toggle walk ↔ fly mode'],
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
    ['H', 'Toggle this help overlay'],
    ['P', 'Photo mode — hide the UI, shallow depth of field']
  ]]
];

export class HUD {
  /** @param {AeonSpire} app */
  constructor(app) {
    this.app = app;
    this.visible = true;
    this.photoMode = false;
    this.helpVisible = false;
    this._toastTimer = 0;
    this._acc = 0;
    this.build();
  }

  build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'aeon-ui';
    root.innerHTML = `
      <div id="aeon-top" class="panel">
        <div class="title">AEON SPIRE</div>
        <div class="sub">City of Wonders · 700 m</div>
        <div id="aeon-modes"></div>
        <div id="aeon-zone"></div>
        <div id="aeon-room"></div>
      </div>

      <div id="aeon-perf" class="panel"></div>

      <div id="aeon-pm" class="panel">
        <div class="row1">
          <span class="ms-num" id="aeon-msnum">M1</span>
          <span class="ms-name" id="aeon-msname">—</span>
          <span class="cp" id="aeon-cp">critical path</span>
          <span class="ms-equip" id="aeon-msequip"></span>
        </div>
        <div id="aeon-gantt"></div>
        <div id="aeon-scrub"><i></i><u></u></div>
        <div id="aeon-stats"></div>
        <div id="aeon-hint">C enter construction mode · [ ] scrub · Space play/pause · H for all controls</div>
      </div>

      <div id="aeon-toast" class="panel"></div>

      <div id="aeon-help">
        <div class="card panel">
          <h2>AEON SPIRE — CONTROLS</h2>
          <p class="lede">
            A 700 m fictional supertall and entertainment campus, composited from seven zones.
            Each borrows an engineering idea from a real-world marvel — never its likeness.
            Press <b>C</b> to watch it built over a 700-day programme.
          </p>
          <div class="cols" id="aeon-helpcols"></div>
          <div class="foot" id="aeon-helpfoot"></div>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    /* Mode chips. */
    this.modes = root.querySelector('#aeon-modes');
    this.chips = {};
    for (const key of ['time', 'weather', 'camera', 'audio', 'wind']) {
      const el = document.createElement('span');
      el.className = 'chip';
      this.modes.appendChild(el);
      this.chips[key] = el;
    }

    this.el = {
      zone: root.querySelector('#aeon-zone'),
      room: root.querySelector('#aeon-room'),
      perf: root.querySelector('#aeon-perf'),
      pm: root.querySelector('#aeon-pm'),
      msNum: root.querySelector('#aeon-msnum'),
      msName: root.querySelector('#aeon-msname'),
      msEquip: root.querySelector('#aeon-msequip'),
      cp: root.querySelector('#aeon-cp'),
      gantt: root.querySelector('#aeon-gantt'),
      scrub: root.querySelector('#aeon-scrub'),
      scrubFill: root.querySelector('#aeon-scrub > i'),
      scrubKnob: root.querySelector('#aeon-scrub > u'),
      stats: root.querySelector('#aeon-stats'),
      toast: root.querySelector('#aeon-toast'),
      help: root.querySelector('#aeon-help')
    };

    /* The Gantt bar: one segment per milestone, width proportional to its
       duration so the chart is a real schedule, not ten equal boxes. */
    this.bars = [];
    for (const m of MILESTONES) {
      const bar = document.createElement('div');
      bar.className = 'gbar' + (m.critical ? ' critical' : '');
      bar.style.flexGrow = String(m.duration);
      bar.title = `M${m.n} · ${m.name}\\nDay ${m.day} of ${TOTAL_DAYS} · ${m.equipment}\\n${m.note}`;
      bar.innerHTML = `<i></i><span>${m.n}</span>`;
      bar.addEventListener('click', () => {
        this.app.setConstruction(true);
        this.app.goToMilestone(m.n);
        this.toast(`M${m.n} · ${m.name}`);
      });
      this.el.gantt.appendChild(bar);
      this.bars.push({ el: bar, fill: bar.querySelector('i'), m });
    }

    /* Scrubber drag. */
    const setFromEvent = (e) => {
      const rect = this.el.scrub.getBoundingClientRect();
      const x = ((e.clientX ?? 0) - rect.left) / Math.max(1, rect.width);
      this.app.construction.setProgress(clamp(x, 0, 1));
      this.app.setConstruction(true);
    };
    let dragging = false;
    this.el.scrub.addEventListener('pointerdown', (e) => {
      dragging = true; setFromEvent(e);
      this.el.scrub.setPointerCapture(e.pointerId);
    });
    this.el.scrub.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
    this.el.scrub.addEventListener('pointerup', () => { dragging = false; });

    /* Stat tiles. */
    this.stats = {};
    for (const [key, label] of [
      ['day', 'Programme day'], ['complete', '% complete'], ['budget', 'Budget utilised'],
      ['ev', 'Earned value'], ['spi', 'SPI (schedule)'], ['cpi', 'CPI (cost)']
    ]) {
      const el = document.createElement('div');
      el.className = 'stat';
      el.innerHTML = `<div class="k">${label}</div><div class="v">—</div>`;
      this.el.stats.appendChild(el);
      this.stats[key] = el.querySelector('.v');
    }

    /* Help overlay content, generated from the same table the keys use. */
    const cols = root.querySelector('#aeon-helpcols');
    for (const [group, rows] of HELP) {
      const h = document.createElement('div');
      h.className = 'grp';
      h.textContent = group;
      cols.appendChild(h);
      for (const [k, d] of rows) {
        const kv = document.createElement('div');
        kv.className = 'kv';
        kv.innerHTML = `<kbd></kbd><span></span>`;
        kv.querySelector('kbd').textContent = k;
        kv.querySelector('span').textContent = d;
        cols.appendChild(kv);
      }
    }
    root.querySelector('#aeon-helpfoot').textContent =
      'All geometry, textures and audio in this project are generated procedurally at ' +
      'runtime — nothing is downloaded, and no trademarked form, logo or character appears ' +
      'anywhere in the scene. Press H to close.';
    this.el.help.addEventListener('click', (e) => {
      if (e.target === this.el.help) this.app.toggleHelp();
    });
  }

  /* ------------------------------------------------------------------ */

  setPhotoMode(on) {
    this.photoMode = on;
    this.root.classList.toggle('photo', on);
    this.root.style.pointerEvents = on ? 'none' : '';
  }

  setHelpVisible(on) {
    this.helpVisible = on;
    this.el.help.classList.toggle('show', on);
  }

  onMilestoneChange(m) {
    if (this.app.construction.active) this.toast(`M${m.n} · ${m.name}`);
  }

  toast(text, seconds = 2.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._toastTimer = seconds;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.photoMode) return;

    // The HUD is DOM: refreshing it at 60 Hz is wasted work and causes
    // layout thrash, so it runs at ~12 Hz.
    this._acc += dt;
    if (this._acc < 0.08) return;
    this._acc = 0;

    const app = this.app;
    const tod = app.timeOfDayStatus();
    const w = app.weatherStatus();
    const cs = app.constructionStatus();
    const audio = app.audioStatus();

    /* ---- Mode chips ---- */
    this.chips.time.innerHTML = `<b>T</b> ${tod.name}${tod.transitioning ? ' …' : ''}`;
    this.chips.weather.innerHTML = `<b>R</b> ${w.rain ? 'Rain' : 'Clear'}`;
    this.chips.weather.classList.toggle('on', w.rain);
    this.chips.camera.innerHTML = `<b>F</b> ${app.cameraMode === 'walk' ? 'Walk' : 'Fly'}`;
    this.chips.audio.innerHTML = `<b>M</b> ${audio.enabled ? (audio.running ? 'Sound' : 'Sound (click)') : 'Muted'}`;
    this.chips.audio.classList.toggle('on', audio.enabled && audio.running);
    this.chips.wind.innerHTML = `<b>Wind</b> ${Math.round(w.wind * 100)}%`;

    this.el.zone.textContent = app.currentZoneName || 'Press 1–7 for the seven zones';
    const room = app.world.interiors.current;
    this.el.room.textContent = room ? `Inside: ${room.name}${room.level ? ' · ' + room.level : ''}` : '';

    /* ---- Performance ---- */
    const st = app.engine.stats();
    this.el.perf.innerHTML =
      `<b>${st.fps.toFixed(0)}</b> fps · <b>${st.tier}</b><br>` +
      `${commas(st.calls)} calls · ${commas(st.triangles / 1000)}k tris<br>` +
      `${app.world.interiors.visibleCount} interiors live`;

    /* ---- The PM panel ---- */
    this.el.pm.classList.toggle('hidden', !cs.active);
    if (!cs.active) return;

    this.el.msNum.textContent = 'M' + cs.milestone;
    this.el.msName.textContent = cs.milestoneName;
    this.el.msEquip.textContent = cs.equipment;
    this.el.cp.style.display = cs.onCriticalPath ? '' : 'none';

    for (const b of this.bars) {
      const done = cs.milestone > b.m.n;
      const current = cs.milestone === b.m.n;
      b.el.classList.toggle('done', done);
      b.el.classList.toggle('current', current);
      b.fill.style.width = done ? '100%' : current ? (cs.milestoneProgress * 100).toFixed(1) + '%' : '0%';
    }

    this.el.scrubFill.style.width = (cs.t * 100).toFixed(2) + '%';
    this.el.scrubKnob.style.left = (cs.t * 100).toFixed(2) + '%';

    const money = (frac) => '$' + (frac * TOTAL_BUDGET / 1e9).toFixed(2) + 'bn';
    this.stats.day.innerHTML = `${cs.day}<small>/ ${cs.totalDays}</small>`;
    this.stats.complete.innerHTML = `${(cs.percentComplete * 100).toFixed(1)}<small>%</small>`;
    this.stats.budget.innerHTML = `${(cs.budgetUsed * 100).toFixed(1)}<small>% · ${money(cs.budgetUsed)}</small>`;
    this.stats.ev.innerHTML = `${money(cs.earnedValue)}<small>EV</small>`;

    const grade = (el, v) => {
      el.classList.remove('good', 'warn', 'bad');
      el.classList.add(v >= 0.995 ? 'good' : v >= 0.95 ? 'warn' : 'bad');
    };
    this.stats.spi.textContent = cs.spi.toFixed(3);
    this.stats.cpi.textContent = cs.cpi.toFixed(3);
    grade(this.stats.spi, cs.spi);
    grade(this.stats.cpi, cs.cpi);
  }

  /** For the QA harness. */
  status() {
    /* Report the *target* opacity from the matched rule, not the value
       mid-transition: under software rendering the compositor can be
       starved and a running CSS transition never advances. */
    let targetOpacity = 1;
    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText === '#aeon-ui.photo' && rule.style.opacity !== '') {
            targetOpacity = this.root.matches('#aeon-ui.photo') ? Number(rule.style.opacity) : 1;
          }
        }
      }
    } catch (e) { /* cross-origin stylesheet; not ours */ }

    return {
      photoMode: this.photoMode,
      hiddenClass: this.root.classList.contains('photo'),
      targetOpacity,
      pointerEvents: this.root.style.pointerEvents,
      helpVisible: this.helpVisible,
      pmPanelVisible: !this.el.pm.classList.contains('hidden'),
      ganttBars: this.bars.length,
      helpRows: this.el.help.querySelectorAll('.kv').length,
      dayText: this.stats.day.textContent,
      budgetText: this.stats.budget.textContent
    };
  }
}
