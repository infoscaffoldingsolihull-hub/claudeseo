/**
 * AEON SPIRE — the visual design system for the interface.
 *
 * A single token set, in one place, so the whole UI reads as one object
 * rather than a collection of boxes. No web fonts: the deliverable is a
 * single file that must render identically offline, so everything falls back
 * through system stacks.
 *
 * The palette is drawn from the building itself — the bronze of the sail's
 * diagrid, the blue-steel of the disc, the pale limestone of the podium and
 * the deep night the tower is lit against.
 */

export const CSS = `
:root {
  /* ---- surface ---- */
  --ink:        #070a11;
  --ink-2:      #0c1119;
  --slate:      #131a26;
  --slate-2:    #1b2432;
  --line:       rgba(150, 178, 214, 0.16);
  --line-warm:  rgba(232, 192, 122, 0.26);

  /* ---- content ---- */
  --text:       #e6edf8;
  --text-dim:   #93a6c2;
  --text-faint: #61738f;

  /* ---- accents, taken from the building ---- */
  --bronze:     #e8c07a;
  --bronze-hi:  #fdf0d4;
  --bronze-lo:  #9d7532;
  --steel:      #8fb4e8;
  --steel-hi:   #cfe2ff;
  --verdigris:  #5fc2ac;
  --amber:      #f0b44a;
  --coral:      #ff8a72;

  --ok:   var(--verdigris);
  --warn: var(--amber);
  --bad:  var(--coral);

  /* ---- type ---- */
  --font-display: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  --font-ui: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;

  /* ---- form ---- */
  --r:    10px;
  --r-sm: 7px;
  --panel: linear-gradient(168deg, rgba(20,27,39,.945), rgba(9,13,20,.965));
  --glass: saturate(150%) blur(14px);
  --shadow:    0 18px 44px rgba(0,0,0,.52);
  --shadow-sm: 0 6px 18px rgba(0,0,0,.38);
  --ease: cubic-bezier(.22,1,.36,1);
}

#aeon-ui, #aeon-ui * { box-sizing: border-box; }
#aeon-ui {
  position: fixed; inset: 0; z-index: 40; pointer-events: none;
  font-family: var(--font-ui); font-size: 13px; color: var(--text);
  -webkit-font-smoothing: antialiased;
  transition: opacity .5s var(--ease);
}
#aeon-ui > * { pointer-events: auto; }
#aeon-ui.photo { opacity: 0; pointer-events: none; }
#aeon-ui.photo * { pointer-events: none !important; }

.a-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
  backdrop-filter: var(--glass); -webkit-backdrop-filter: var(--glass);
  box-shadow: var(--shadow);
}

/* ==================== top bar ==================== */
.a-top {
  position: absolute; top: 12px; left: 12px; right: 12px; height: 50px;
  display: flex; align-items: center; gap: 10px; padding: 0 12px 0 14px;
}
.a-brand { display: flex; align-items: center; gap: 10px; padding-right: 14px;
  border-right: 1px solid var(--line); }
.a-brand svg { flex: none; filter: drop-shadow(0 0 10px rgba(232,192,122,.35)); }
.a-brand .n {
  font-family: var(--font-display); font-size: 15px; letter-spacing: .3em;
  text-indent: .3em; line-height: 1.1;
  background: linear-gradient(180deg, var(--bronze-hi), var(--bronze) 62%, var(--bronze-lo));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.a-brand small {
  display: block; font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
  color: var(--text-faint); margin-top: 1px;
}

.a-seg { display: flex; align-items: center; gap: 3px; }
.a-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px;
  padding: 0 10px; border: 1px solid transparent; border-radius: var(--r-sm);
  background: rgba(255,255,255,.045); color: var(--text-dim);
  font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap;
  transition: background .16s, color .16s, border-color .16s, transform .16s var(--ease);
}
.a-btn:hover { background: rgba(255,255,255,.1); color: var(--text); }
.a-btn:active { transform: translateY(1px); }
.a-btn.on {
  background: linear-gradient(180deg, rgba(232,192,122,.2), rgba(232,192,122,.09));
  border-color: var(--line-warm); color: var(--bronze-hi);
}
.a-btn kbd {
  font: 600 9.5px/1 var(--font-mono); padding: 3px 4px; border-radius: 4px;
  background: rgba(0,0,0,.42); color: var(--text-faint); border: 1px solid var(--line);
}
.a-btn.on kbd { color: var(--bronze); border-color: var(--line-warm); }
.a-grow { flex: 1; }

.a-metrics { display: flex; align-items: center; gap: 1px; }
.a-metric {
  display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
  padding: 0 11px; height: 34px; border-left: 1px solid var(--line);
}
.a-metric:first-child { border-left: 0; }
/* display:flex above outranks the UA's [hidden] rule, so say it here. */
.a-metric[hidden] { display: none; }
.a-metric b {
  font: 600 14px/1 var(--font-mono); color: var(--text);
  font-variant-numeric: tabular-nums;
}
.a-metric span {
  font-size: 8.5px; letter-spacing: .13em; text-transform: uppercase;
  color: var(--text-faint); margin-top: 3px;
}
.a-metric.good b { color: var(--ok); }
.a-metric.warn b { color: var(--warn); }
.a-metric.bad  b { color: var(--bad); }

/* ==================== left rail ==================== */
.a-rail {
  position: absolute; left: 12px; top: 74px;
  display: flex; flex-direction: column; gap: 5px; padding: 6px;
}
.a-rail button {
  position: relative; width: 38px; height: 38px; display: grid; place-items: center;
  border: 1px solid transparent; border-radius: var(--r-sm); cursor: pointer;
  background: transparent; color: var(--text-dim);
  transition: background .16s, color .16s, border-color .16s, transform .16s var(--ease);
}
.a-rail button:hover { background: rgba(255,255,255,.09); color: var(--text); transform: translateX(2px); }
.a-rail button.on {
  background: linear-gradient(180deg, rgba(232,192,122,.2), rgba(232,192,122,.08));
  border-color: var(--line-warm); color: var(--bronze-hi);
}
.a-rail .tip {
  position: absolute; left: 46px; top: 50%; transform: translate(-6px,-50%);
  padding: 5px 9px; border-radius: 6px; white-space: nowrap; font-size: 11px;
  background: var(--ink-2); border: 1px solid var(--line); color: var(--text);
  box-shadow: var(--shadow-sm); opacity: 0; pointer-events: none;
  transition: opacity .16s, transform .16s var(--ease);
}
.a-rail button:hover .tip { opacity: 1; transform: translate(0,-50%); }

/* ==================== context card ==================== */
.a-context {
  position: absolute; left: 12px; top: 300px; width: 268px; padding: 12px 14px;
}
.a-context h3 {
  margin: 0 0 3px; font-family: var(--font-display); font-size: 14.5px;
  font-weight: 600; color: var(--bronze-hi); letter-spacing: .02em;
}
.a-context .sub {
  font-size: 10px; letter-spacing: .13em; text-transform: uppercase;
  color: var(--text-faint); margin-bottom: 8px;
}
.a-context p { margin: 0; font-size: 11.5px; line-height: 1.62; color: var(--text-dim); }
.a-context .stat-row {
  display: flex; gap: 14px; margin-top: 10px; padding-top: 9px;
  border-top: 1px solid var(--line);
}
.a-context .stat-row div { flex: 1; }
.a-context .stat-row b {
  display: block; font: 600 13px/1.2 var(--font-mono); color: var(--text);
}
.a-context .stat-row span {
  font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-faint);
}

/* ==================== bottom PM dock ==================== */
.a-dock {
  position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 13px 16px 12px;
  transition: transform .42s var(--ease), opacity .32s;
}
.a-dock.hidden { transform: translateY(132%); opacity: 0; pointer-events: none; }
.a-dock-head { display: flex; align-items: baseline; gap: 13px; flex-wrap: wrap; margin-bottom: 10px; }
.a-chip {
  font: 700 10px/1 var(--font-mono); letter-spacing: .1em; padding: 4px 8px;
  border-radius: 5px; color: var(--ink);
  background: linear-gradient(180deg, var(--bronze-hi), var(--bronze));
}
.a-dock-head .t { font-family: var(--font-display); font-size: 15px; font-weight: 600; }
.a-dock-head .eq { font-size: 11px; color: var(--text-faint); }
.a-tag {
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  padding: 3px 7px; border-radius: 5px; border: 1px solid rgba(255,138,114,.42);
  color: var(--coral);
}

.a-gantt { display: flex; gap: 2px; height: 30px; margin-bottom: 9px; }
.a-gbar {
  position: relative; border-radius: 4px; overflow: hidden; cursor: pointer;
  background: rgba(255,255,255,.055); border: 1px solid var(--line);
  transition: border-color .18s, background .18s, transform .18s var(--ease);
}
.a-gbar:hover { border-color: var(--line-warm); background: rgba(255,255,255,.11); transform: translateY(-1px); }
.a-gbar > i {
  position: absolute; inset: 0; width: 0;
  background: linear-gradient(90deg, rgba(95,194,172,.5), rgba(232,192,122,.72));
  transition: width .1s linear;
}
.a-gbar > u {
  position: absolute; inset: 0; display: grid; place-items: center;
  font: 600 10px/1 var(--font-mono); color: var(--text-dim); text-decoration: none;
  text-shadow: 0 1px 3px rgba(0,0,0,.7);
}
.a-gbar.done > u, .a-gbar.now > u { color: var(--text); }
.a-gbar.now { border-color: var(--bronze); box-shadow: inset 0 0 0 1px rgba(232,192,122,.4); }

.a-scrub {
  position: relative; height: 5px; border-radius: 4px; margin: 0 0 11px;
  background: rgba(255,255,255,.08); cursor: pointer;
}
.a-scrub > i {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px;
  background: linear-gradient(90deg, var(--steel), var(--bronze));
}
.a-scrub > u {
  position: absolute; top: -5px; width: 14px; height: 14px; margin-left: -7px;
  border-radius: 50%; background: var(--bronze-hi);
  box-shadow: 0 2px 8px rgba(0,0,0,.6), 0 0 0 3px rgba(232,192,122,.2);
}

.a-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px,1fr)); gap: 5px 16px; }
.a-stat .k {
  font-size: 8.5px; letter-spacing: .13em; text-transform: uppercase; color: var(--text-faint);
}
.a-stat .v {
  font: 600 15px/1.3 var(--font-mono); color: var(--text); font-variant-numeric: tabular-nums;
}
.a-stat .v small { font: 500 10px var(--font-ui); color: var(--text-faint); margin-left: 3px; }
.a-stat .v.good { color: var(--ok); }
.a-stat .v.warn { color: var(--warn); }
.a-stat .v.bad  { color: var(--bad); }

/* ==================== overlay panels ==================== */
.a-overlay {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(4,7,13,.7); backdrop-filter: blur(5px); padding: 26px; overflow: auto;
}
.a-overlay.open { display: flex; animation: aFade .22s var(--ease); }
@keyframes aFade { from { opacity: 0 } to { opacity: 1 } }
.a-card { width: min(900px, 100%); padding: 24px 28px; }
.a-card h2 {
  margin: 0 0 5px; font-family: var(--font-display); font-size: 17px; font-weight: 600;
  letter-spacing: .2em;
  background: linear-gradient(180deg, var(--bronze-hi), var(--bronze));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.a-card .lede { margin: 0 0 18px; font-size: 12px; line-height: 1.75; color: var(--text-dim); }
.a-card .lede b { color: var(--steel-hi); }
.a-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(258px,1fr)); gap: 3px 30px; }
.a-grp {
  grid-column: 1/-1; margin: 14px 0 5px; font-size: 9px; letter-spacing: .18em;
  text-transform: uppercase; color: var(--bronze);
}
.a-grp:first-child { margin-top: 0; }
.a-kv { display: flex; align-items: baseline; gap: 11px; padding: 3px 0; font-size: 12px; }
.a-kv kbd {
  flex: none; min-width: 74px; text-align: center;
  font: 600 10.5px/1 var(--font-mono); padding: 4px 7px; border-radius: 5px;
  color: var(--ink); background: linear-gradient(180deg, #eaf0fa, #b6c5da);
  box-shadow: 0 2px 0 rgba(0,0,0,.42);
}
.a-kv span { color: var(--text-dim); }
.a-foot { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--line);
  font-size: 10.5px; line-height: 1.75; color: var(--text-faint); }

/* zone index inside the overlay */
.a-zones { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px,1fr)); gap: 8px; }
.a-zone {
  padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: rgba(255,255,255,.03); cursor: pointer;
  transition: border-color .16s, background .16s, transform .16s var(--ease);
}
.a-zone:hover { border-color: var(--line-warm); background: rgba(232,192,122,.07); transform: translateY(-2px); }
.a-zone b { display: block; font-family: var(--font-display); font-size: 13px; color: var(--bronze-hi); }
.a-zone i { display: block; font-style: normal; font-size: 10px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--text-faint); margin: 2px 0 5px; }
.a-zone span { font-size: 11px; line-height: 1.55; color: var(--text-dim); }

/* ==================== toast ==================== */
.a-toast {
  position: absolute; left: 50%; top: 80px; transform: translate(-50%,-10px);
  padding: 9px 17px; font-size: 12px; opacity: 0; white-space: nowrap;
  transition: opacity .3s, transform .3s var(--ease);
}
.a-toast.show { opacity: 1; transform: translate(-50%,0); }
.a-toast b { color: var(--bronze); }

/* ==================== compass ==================== */
.a-compass {
  position: absolute; right: 14px; bottom: 150px; width: 62px; height: 62px;
  border-radius: 50%; display: grid; place-items: center;
}
.a-compass svg { display: block; }

@media (max-width: 820px) {
  .a-top { height: auto; flex-wrap: wrap; padding: 6px 10px; gap: 6px; }
  .a-metrics { order: 3; width: 100%; justify-content: space-between; }
  .a-metric { padding: 0 6px; height: 28px; }
  .a-metric b { font-size: 12.5px; }
  .a-brand small { display: none; }
  .a-context { display: none; }
  .a-compass { display: none; }
  .a-dock-head .eq { display: none; }
  .a-stats { grid-template-columns: repeat(3, 1fr); }
  .a-rail { top: auto; bottom: 190px; }
}
`;

/** Inline SVG icons — no icon font, so the single file stays self-contained. */
export const ICONS = {
  zones: '<path d="M8 2 14 13H2Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 14h8" stroke="currentColor" stroke-width="1.3"/>',
  build: '<path d="M2 13h12M4 13V5l7-3v11M4 6l7 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  time:  '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3.4l2.3 1.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  rain:  '<path d="M4.6 8.4a2.6 2.6 0 0 1 .3-5.1 3.4 3.4 0 0 1 6.5.7 2.4 2.4 0 0 1-.4 4.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 10.5 5 13M8.5 10.5 7.5 13M11 10.5 10 13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  sound: '<path d="M3 6.2h2.4L8.6 3.4v9.2L5.4 9.8H3Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.6 6a3 3 0 0 1 0 4M12.4 4.2a5.6 5.6 0 0 1 0 7.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  photo: '<rect x="2" y="4.4" width="12" height="8.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 4.4l.9-1.4h2.2l.9 1.4" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  help:  '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.3 2c-.5.3-.6.7-.6 1.2" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><circle cx="8" cy="11.4" r=".78" fill="currentColor"/>',
  walk:  '<circle cx="9" cy="2.9" r="1.35" fill="currentColor"/><path d="M9 4.6 7.4 8l-2 1.2M9 4.6l1.8 2.6.9 3M7.7 8l-.5 2.6-1.6 2.6M9.9 10.4l1 3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  fly:   '<path d="M2 9.5 14 4l-3.4 8.4-1.9-3.6Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>'
};
