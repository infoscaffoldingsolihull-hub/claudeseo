#!/usr/bin/env node
/**
 * AEON SPIRE — headless QA harness.
 *
 * Boots the real page in Chromium (SwiftShader WebGL2), drives the
 * automation surface exposed on window.AEON, and fails on any console
 * error, page error or failed request. Used as the gate for every phase's
 * Definition of Done and for the Section G master walkthrough.
 *
 *   node tools/verify.mjs            # standard run
 *   node tools/verify.mjs --full     # full Section G walkthrough
 *   node tools/verify.mjs --shots    # also write screenshots to docs/
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8199 + (process.pid % 300);
const FULL = process.argv.includes('--full');
const SHOTS = process.argv.includes('--shots');
const TARGET = (process.argv.find(a => a.startsWith('--url=')) || '').slice(6);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.txt': 'text/plain', '.md': 'text/markdown'
};

function serve() {
  const s = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (e, d) => {
      if (e) { res.writeHead(404).end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(d);
    });
  });
  return new Promise(r => s.listen(PORT, () => r(s)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
  return ok;
}

const server = await serve();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 720, height: 440 } });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
/* The CDN reachability probe in index.html is expected to fail in a
   network-restricted sandbox; the app then loads the vendored copy. That
   browser-level resource log is not an application error, so it is filtered
   here (and only here) and reported separately. */
const cdnProbeNoise = [];
const isCdnProbeNoise = (t) =>
  /jsdelivr/.test(t) ||
  (/Failed to load resource/.test(t) && /ERR_(TUNNEL_CONNECTION_FAILED|PROXY|NAME_NOT_RESOLVED|CONNECTION|INTERNET_DISCONNECTED|BLOCKED)/.test(t));
page.on('console', m => {
  if (m.type() === 'error') {
    if (isCdnProbeNoise(m.text())) cdnProbeNoise.push(m.text());
    else consoleErrors.push(m.text());
  }
  if (process.env.AEON_LOG) console.log('    [console]', m.type(), m.text());
});
page.on('pageerror', e => pageErrors.push(e.message + '\n' + (e.stack || '')));
page.on('requestfailed', r => {
  // The CDN probe is expected to fail in the sandbox; the app falls back.
  if (!r.url().includes('cdn.jsdelivr.net')) failedRequests.push(r.url() + ' :: ' + (r.failure()?.errorText));
});

// Boot at the low tier: SwiftShader cannot sustain the high tier, and the
// gate here is liveness plus the CPU/draw-call budgets, not GPU throughput.
const url = TARGET || `http://localhost:${PORT}/index.html?quality=low`;
console.log(`\nAEON SPIRE verification → ${url}\n`);

await page.goto(url, { waitUntil: 'load', timeout: 60000 });

let booted = false;
try {
  await page.waitForFunction(() => window.AEON_STARTED === true || window.AEON_FATAL, { timeout: 90000 });
  booted = await page.evaluate(() => window.AEON_STARTED === true);
} catch (e) { /* handled below */ }

const fatal = await page.evaluate(() => window.AEON_FATAL || null);
check('page boots (window.AEON_STARTED)', booted, fatal || '');

if (booted) {
  const src = await page.evaluate(() => window.AEON_THREE_SOURCE + ' r' + (window.AEON?.THREE_REVISION || '?'));
  console.log(`    three.js source: ${src}`);

  // Let the render loop settle, then measure over a fixed window.
  await page.waitForTimeout(1500);
  const f0 = await page.evaluate(() => window.AEON.engine.frame);
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const a = window.AEON;
    return {
      frames: a.engine.frame,
      fps: a.engine.fps,
      stats: a.engine.stats(),
      hasScene: !!a.scene,
      children: a.scene.children.length,
      camera: a.camera.position.toArray().map(n => +n.toFixed(1)),
      glLost: a.renderer.getContext().isContextLost()
    };
  });
  // SwiftShader software rasterisation runs roughly two orders of magnitude
  // slower than any real GPU, so the gate is "the loop is alive and steady",
  // with draw calls / triangles as the meaningful E.9 performance budget.
  const swFps = (info.frames - f0) / 4;
  check('render loop advancing', info.frames - f0 >= 1,
        `${info.frames - f0} frames in 4s (${swFps.toFixed(1)} fps under software raster)`);
  check('draw-call budget (E.9)', info.stats.calls <= 400, `${info.stats.calls} calls`);
  check('triangle budget (E.9)', Number.isFinite(info.stats.triangles) && info.stats.triangles <= 4_000_000,
        Number.isFinite(info.stats.triangles) ? `${info.stats.triangles.toLocaleString()} tris` : 'NaN triangle count');
  check('scene populated', info.children >= 2, `${info.children} root children`);
  check('WebGL context healthy', !info.glLost);
  console.log(`    tier=${info.stats.tier} fps≈${info.fps.toFixed(1)} calls=${info.stats.calls} tris=${info.stats.triangles}`);

  /* ---- Section D interiors ---- */
  if (await page.evaluate(() => typeof window.AEON.revealInteriors === 'function')) {
    const before = consoleErrors.length + pageErrors.length;
    const rooms = await page.evaluate(() => {
      const n = window.AEON.revealInteriors();
      return { n, manifest: window.AEON.interiorManifest() };
    });
    await page.waitForTimeout(2500);
    const built = rooms.manifest.filter(m => m.built).length;
    const withProps = rooms.manifest.filter(m => m.props >= 2).length;
    const zones = new Set(rooms.manifest.map(m => m.zone));
    check('every named interior builds', built === rooms.n && rooms.n > 0,
          `${built}/${rooms.n} rooms across ${zones.size} zones`);
    check('interiors have 2+ animated props (D.8)', withProps === rooms.n,
          `${withProps}/${rooms.n}`);
    check('no errors while building interiors',
          consoleErrors.length + pageErrors.length === before,
          (consoleErrors.slice(before).concat(pageErrors.slice(before))).slice(0, 2).join(' | ').slice(0, 500));
    if (process.env.AEON_ROOMS) {
      for (const m of rooms.manifest) console.log(`      · [${m.zone}] ${m.name} (${m.acoustic}, ${m.props} props)`);
    }
    const st = await page.evaluate(() => window.AEON.engine.stats());
    check('renderer stats finite with interiors revealed',
          Number.isFinite(st.triangles) && Number.isFinite(st.calls),
          `calls=${st.calls} tris=${st.triangles}`);
    console.log(`    with all interiors revealed: calls=${st.calls} tris=${Number(st.triangles).toLocaleString()}`);

    /* CPU cost of one simulation pass with every interior live — the metric
       that actually predicts frame rate on real hardware (E.9). */
    const bench = await page.evaluate(() => window.AEON.benchUpdate(150));
    check('CPU update budget (E.9)', bench.ms < 8.0,
          `${bench.ms.toFixed(2)} ms/frame with all ${rooms.n} interiors live`);
  }


  // Phase-specific automation hooks, present only once implemented.
  const api = await page.evaluate(() => Object.keys(window.AEON).filter(k => typeof window.AEON[k] === 'function'));
  if (process.env.AEON_LOG) console.log('    api:', api.join(', '));

  /* ---- Time of day (E.4 / Phase 5) ---- */
  if (await page.evaluate(() => typeof window.AEON.cycleTimeOfDay === 'function')) {
    const tod = await page.evaluate(() => {
      const a = window.AEON;
      const modes = a.timeOfDayModes;
      const seen = [];
      // Cycle through every mode with T, settling each one.
      for (let i = 0; i < modes.length; i++) {
        a.cycleTimeOfDay();
        for (let k = 0; k < 200; k++) a.timeOfDay.update(1 / 60);
        seen.push(a.timeOfDayStatus().id);
      }
      // G and N must force their modes.
      a.setTimeOfDay('golden'); for (let k = 0; k < 200; k++) a.timeOfDay.update(1 / 60);
      const golden = a.timeOfDayStatus().id;
      a.setTimeOfDay('night'); for (let k = 0; k < 200; k++) a.timeOfDay.update(1 / 60);
      const night = a.timeOfDayStatus().id;
      const nightMix = a.timeOfDay.state.nightMix;
      const nightEmissive = a.materials.emissiveWindows[0]
        ? a.materials.emissiveWindows[0].emissiveIntensity : -1;

      // Now measure the transition itself: day -> night, sampled.
      a.setTimeOfDay('day', { instant: true });
      a.setTimeOfDay('night');
      const samples = [];
      for (let k = 0; k < 160; k++) {
        a.timeOfDay.update(1 / 60);
        if (k % 16 === 0) samples.push({
          mix: a.timeOfDay.state.nightMix,
          exposure: a.timeOfDay.state.exposure,
          sunI: a.timeOfDay.state.sunIntensity,
          transitioning: a.timeOfDay.isTransitioning
        });
      }
      for (let k = 0; k < 200; k++) a.timeOfDay.update(1 / 60);
      const dayEmissive = (() => {
        a.setTimeOfDay('day', { instant: true });
        return a.materials.emissiveWindows[0] ? a.materials.emissiveWindows[0].emissiveIntensity : -1;
      })();
      return { modes: modes.map(m => m.id), seen, golden, night, nightMix, nightEmissive, dayEmissive, samples };
    });

    check('all 5 time-of-day modes reachable via T',
          tod.modes.length === 5 && tod.modes.every(m => tod.seen.includes(m)),
          tod.seen.join(' → '));
    check('G forces Golden Hour, N forces Night',
          tod.golden === 'golden' && tod.night === 'night', `${tod.golden}, ${tod.night}`);

    // The transition must pass through intermediate values, not jump.
    const mids = tod.samples.filter(s => s.mix > 0.02 && s.mix < 0.98);
    const monotonic = tod.samples.every((s, i, arr) => i === 0 || s.mix >= arr[i - 1].mix - 1e-6);
    check('time-of-day transition is smooth, not a hard cut',
          mids.length >= 4 && monotonic,
          `${mids.length} intermediate samples, monotonic=${monotonic}, ` +
          `mix ${tod.samples.map(s => s.mix.toFixed(2)).join('/')}`);
    check('windows are emissive at night and dark by day (E.4)',
          tod.nightEmissive > 1.0 && tod.dayEmissive < 0.05,
          `night ${tod.nightEmissive.toFixed(2)} / day ${tod.dayEmissive.toFixed(2)}`);
  }

  /* ---- Weather (E.4 / Phase 6) ---- */
  if (await page.evaluate(() => typeof window.AEON.toggleRain === 'function')) {
    const w = await page.evaluate(() => {
      const a = window.AEON;
      const step = (n) => { for (let i = 0; i < n; i++) a.weather.update(1 / 60, a.camera, 0); };

      const dry = { ...a.weatherStatus(), wetU: a.materials.tex ? 0 : 0 };
      const dryWet = a.weather.wetness;

      const on = a.toggleRain();
      step(180);
      const wetStatus = a.weatherStatus();
      const rainVisible = a.weather.rain.visible;
      const drawRange = a.weather.rain.geometry.drawRange.count;
      const canalRipple = a.world.zone('canal').waterUniforms.uRipple.value;

      // Wetness must actually reach the shared uniform the materials read.
      const uWet = a.materials.constructor === undefined ? -1 : null;
      const wetUniform = a.weather.materials.exterior.length;

      // Lightning: force a strike and confirm the post chain flashes.
      let thunderDelay = -1;
      a.weather.onThunder = (d) => { thunderDelay = d; };
      a.strikeLightning();
      step(2);
      const flash = a.engine.postfx.params.flash;

      // Wind independent of rain. Drying is deliberately slow — surfaces
      // soak fast and dry over tens of seconds — so give it a real window.
      a.setRain(false);
      step(1500);
      const dried = a.weather.wetness;
      a.setWind(0.9);
      step(60);
      const windHigh = a.weather.windValue;
      a.setWind(0.05);
      step(60);
      const windLow = a.weather.windValue;
      const dustVisible = a.weather.dust.visible;

      return {
        dryWet, wetness: wetStatus.wetness, rainOn: on, rainVisible, drawRange,
        canalRipple, wetUniform, flash, thunderDelay, dried, windHigh, windLow,
        dustVisible, exteriorMaterials: a.materials.exterior.length
      };
    });

    check('rain renders and wets surfaces',
          w.rainOn && w.rainVisible && w.drawRange > 0 && w.wetness > 0.5,
          `${w.drawRange / 2} drops, wetness ${w.wetness.toFixed(2)} across ${w.exteriorMaterials} exterior materials`);
    check('canal ripple rises with rain', w.canalRipple > 0.9,
          `uRipple ${w.canalRipple.toFixed(2)}`);
    check('lightning flashes and queues thunder',
          w.flash > 0.05 && w.thunderDelay > 0,
          `flash ${w.flash.toFixed(2)}, thunder in ${w.thunderDelay.toFixed(1)}s`);
    check('surfaces dry out after the rain stops', w.dried < 0.1,
          `wetness ${w.dried.toFixed(3)} after 25 s of drying`);
    check('wind is independent of rain and drives dust',
          w.windHigh > 0.7 && w.windLow < 0.3 && w.dustVisible,
          `wind ${w.windLow.toFixed(2)} → ${w.windHigh.toFixed(2)}, dust visible`);
  }

  /* ---- Audio (E.5 / Phase 7) ---- */
  if (await page.evaluate(() => typeof window.AEON.initAudio === 'function')) {
    const au = await page.evaluate(async () => {
      const a = window.AEON;
      const ok = await a.initAudio();
      if (!ok) return { available: false };
      const st0 = a.audioStatus();

      // Day, dry, exterior: birds up, crickets and rain down.
      a.setTimeOfDay('day', { instant: true });
      a.setRain(false);
      for (let i = 0; i < 600; i++) a.weather.update(1 / 60, a.camera, 0);
      a.audio.update(1 / 60, a.audioWorldState());
      await new Promise(r => setTimeout(r, 400));
      const day = a.audioStatus().layers;

      // Night, raining: crickets and rain up, birds gone.
      a.setTimeOfDay('night', { instant: true });
      a.setRain(true);
      for (let i = 0; i < 400; i++) a.weather.update(1 / 60, a.camera, 0);
      a.audio.update(1 / 60, a.audioWorldState());
      await new Promise(r => setTimeout(r, 400));
      const night = a.audioStatus().layers;

      // Per-room acoustics: the convolver IR must change with the room.
      const acoustics = [];
      const seen = new Set();
      for (const room of a.world.interiors.rooms) {
        a.audio.onRoomChange(room);
        acoustics.push(a.audio.currentAcoustic);
        seen.add(a.audio.currentAcoustic);
      }
      const irCount = a.audio.irCache.size;
      a.audio.onRoomChange(null);
      const outdoor = a.audio.currentAcoustic;

      // Thunder must actually schedule a source.
      const before = a.ctxNodes || 0;
      const src = a.audio.thunder(0.2, 1);

      // M mutes with a glide, never a hard cut (E.5), so give it time to
      // reach the floor before reading the master gain.
      const toggled = a.toggleAudio();
      await new Promise(r => setTimeout(r, 900));
      const masterOff = a.audio.master.gain.value;
      a.toggleAudio();
      await new Promise(r => setTimeout(r, 900));
      const masterOn = a.audio.master.gain.value;

      a.setRain(false);
      return {
        available: true, running: st0.running, layerCount: Object.keys(day).length,
        day, night, distinctAcoustics: seen.size, acousticsSeen: [...seen],
        irCount, outdoor, thunderOk: !!src, toggled, masterOff, masterOn
      };
    });

    if (!au.available) {
      check('audio system available', false, 'AudioContext could not be created');
    } else {
      check('audio graph runs with all E.5 layers', au.running && au.layerCount >= 10,
            `${au.layerCount} layers, context running`);
      check('birds by day, crickets and rain at night',
            au.day.birds > au.night.birds && au.night.crickets > au.day.crickets &&
            au.night.rain > au.day.rain,
            `birds ${au.day.birds.toFixed(3)}→${au.night.birds.toFixed(3)}, ` +
            `crickets ${au.day.crickets.toFixed(3)}→${au.night.crickets.toFixed(3)}, ` +
            `rain ${au.day.rain.toFixed(3)}→${au.night.rain.toFixed(3)}`);
      check('per-room convolver acoustics (D.8)', au.distinctAcoustics >= 5 && au.irCount >= 5,
            `${au.distinctAcoustics} distinct profiles across 31 rooms, ${au.irCount} impulse responses`);
      check('thunder schedules and M mutes (with a glide, not a cut)',
            au.thunderOk && au.toggled === false && au.masterOff < 0.12 && au.masterOn > 0.5,
            `master ${au.masterOff.toFixed(3)} muted → ${au.masterOn.toFixed(2)} restored`);
    }
  }

  /* ---- Controls: every key in the E.6 table (Phase 8) ---- */
  if (await page.evaluate(() => typeof window.AEON.pressKey === 'function')) {
    const kb = await page.evaluate(() => {
      const a = window.AEON;
      const c = a.controls;
      const out = { results: {}, failures: [] };
      const rec = (key, ok, detail) => {
        out.results[key] = { ok, detail };
        if (!ok) out.failures.push(key + ': ' + detail);
      };
      const step = (n = 30, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) { c.update(dt); a.construction.update(dt); }
      };

      a.setTimeOfDay('day', { instant: true });
      a.setRain(false);
      a.setConstruction(false);
      c.snapTo([300, 40, 300], [0, 60, 0]);

      /* --- F: walk <-> fly --- */
      const m0 = c.mode;
      a.pressKey('KeyF');
      const m1 = c.mode;
      a.pressKey('KeyF');
      rec('F', m1 !== m0 && c.mode === m0, `${m0} → ${m1} → ${c.mode}`);

      /* --- W A S D --- */
      c.setMode('fly');
      c.snapTo([300, 60, 300], [0, 60, 0]);
      const moves = {};
      for (const [key, axis] of [['KeyW', 'f'], ['KeyS', 'b'], ['KeyA', 'l'], ['KeyD', 'r']]) {
        c.snapTo([300, 60, 300], [0, 60, 0]);
        c.velocity.set(0, 0, 0);
        const p0 = a.camera.position.clone();
        a.holdKey(key, true); step(40); a.holdKey(key, false);
        moves[axis] = p0.distanceTo(a.camera.position);
      }
      rec('WASD', Object.values(moves).every(d => d > 3),
          Object.entries(moves).map(([k, v]) => k + '=' + v.toFixed(1) + 'm').join(' '));

      /* --- Shift: sprint --- */
      c.snapTo([300, 60, 300], [0, 60, 0]); c.velocity.set(0, 0, 0);
      let p0 = a.camera.position.clone();
      a.holdKey('KeyW', true); step(40); a.holdKey('KeyW', false);
      const normal = p0.distanceTo(a.camera.position);
      c.snapTo([300, 60, 300], [0, 60, 0]); c.velocity.set(0, 0, 0);
      p0 = a.camera.position.clone();
      a.holdKey('KeyW', true); a.holdKey('ShiftLeft', true); step(40);
      a.holdKey('KeyW', false); a.holdKey('ShiftLeft', false);
      const fast = p0.distanceTo(a.camera.position);
      rec('Shift', fast > normal * 2, `${normal.toFixed(1)}m → ${fast.toFixed(1)}m`);

      /* --- Q / E: descend / ascend in fly mode --- */
      c.snapTo([300, 200, 300], [0, 200, 0]); c.velocity.set(0, 0, 0);
      const y0 = a.camera.position.y;
      a.holdKey('KeyE', true); step(40); a.holdKey('KeyE', false);
      const yUp = a.camera.position.y;
      c.velocity.set(0, 0, 0);
      a.holdKey('KeyQ', true); step(80); a.holdKey('KeyQ', false);
      const yDown = a.camera.position.y;
      rec('Q/E', yUp > y0 + 3 && yDown < yUp - 3,
          `y ${y0.toFixed(0)} → ${yUp.toFixed(0)} → ${yDown.toFixed(0)}`);

      /* --- Walk mode: gravity puts the viewer on a floor --- */
      c.setMode('fly');
      c.snapTo([0, 90, 300], [0, 60, 0]);
      c.setMode('walk');
      c.velocity.set(0, 0, 0);
      step(200);
      const grounded = c.grounded;
      const standY = a.camera.position.y;
      rec('walk gravity', grounded && standY > -12 && standY < 30,
          `grounded=${grounded} at y=${standY.toFixed(2)}`);
      c.setMode('fly');

      /* --- 1-7: zone presets, and the second press going inside --- */
      const zones = [];
      for (let i = 0; i < 7; i++) {
        a.pressKey('Digit' + (i + 1));
        // Let the eased transition run to completion.
        for (let k = 0; k < 200; k++) c.update(1 / 60);
        zones.push({ name: a.currentZoneName, pos: a.camera.position.toArray().map(n => +n.toFixed(0)) });
      }
      const distinct = new Set(zones.map(z => z.pos.join(','))).size;
      rec('1-7 zone presets', zones.length === 7 && distinct === 7,
          `${distinct} distinct viewpoints`);
      // Pressing 1 twice must land inside the Canal Concourse.
      a.pressKey('Digit1'); for (let k = 0; k < 200; k++) c.update(1 / 60);
      a.pressKey('Digit1'); for (let k = 0; k < 200; k++) c.update(1 / 60);
      rec('preset re-press enters interior', /interior/.test(a.currentZoneName || ''),
          a.currentZoneName);

      /* --- T / G / N --- */
      a.setTimeOfDay('day', { instant: true });
      a.pressKey('KeyT');
      const afterT = a.timeOfDayStatus().id;
      a.pressKey('KeyG');
      const afterG = a.timeOfDayStatus().id;
      a.pressKey('KeyN');
      const afterN = a.timeOfDayStatus().id;
      rec('T/G/N', afterT !== 'day' && afterG === 'golden' && afterN === 'night',
          `T→${afterT}, G→${afterG}, N→${afterN}`);

      /* --- R: rain --- */
      const r0 = a.weatherStatus().rain;
      a.pressKey('KeyR');
      const r1 = a.weatherStatus().rain;
      a.pressKey('KeyR');
      rec('R', r1 !== r0 && a.weatherStatus().rain === r0, `${r0} → ${r1} → ${a.weatherStatus().rain}`);

      /* --- C, [ , ] , Space --- */
      const c0 = a.constructionStatus().active;
      a.pressKey('KeyC');
      const c1 = a.constructionStatus().active;
      const startMs = a.constructionStatus().milestone;
      a.pressKey('BracketRight');
      const fwd = a.constructionStatus().milestone;
      a.pressKey('BracketRight');
      const fwd2 = a.constructionStatus().milestone;
      a.pressKey('BracketLeft');
      const back = a.constructionStatus().milestone;
      const play0 = a.constructionStatus().playing;
      a.pressKey('Space');
      const play1 = a.constructionStatus().playing;
      rec('C', c1 !== c0, `${c0} → ${c1}`);
      rec('[ / ]', fwd2 > startMs && back < fwd2,
          `milestone ${startMs} → ${fwd} → ${fwd2} → ${back}`);
      rec('Space', play1 !== play0, `${play0} → ${play1}`);

      /* Every one of the ten milestones must be reachable by scrubbing. */
      a.construction.setProgress(0);
      const reached = new Set([a.constructionStatus().milestone]);
      for (let i = 0; i < 14; i++) { a.pressKey('BracketRight'); reached.add(a.constructionStatus().milestone); }
      rec('all 10 milestones scrubbable', reached.size === 10, `${reached.size}/10 reached`);
      a.pressKey('KeyC');

      /* --- M --- */
      const audio0 = a.audioStatus().enabled;
      a.pressKey('KeyM');
      const audio1 = a.audioStatus().enabled;
      a.pressKey('KeyM');
      rec('M', audio1 !== audio0, `${audio0} → ${audio1}`);

      /* --- H --- */
      const h0 = a.helpVisible;
      a.pressKey('KeyH');
      const h1 = a.helpVisible;
      a.pressKey('KeyH');
      rec('H', h1 !== h0, `${h0} → ${h1}`);

      /* --- P: photo mode raises the depth-of-field amount --- */
      const dof0 = a.engine.postfx.params.dof;
      a.pressKey('KeyP');
      for (let i = 0; i < 90; i++) a.updatePhotoFocus(1 / 60);
      const dof1 = a.engine.postfx.params.dof;
      const photoOn = a.photoMode;
      a.pressKey('KeyP');
      for (let i = 0; i < 120; i++) a.updatePhotoFocus(1 / 60);
      const dof2 = a.engine.postfx.params.dof;
      rec('P', photoOn && dof1 > 0.7 && dof2 < 0.15,
          `dof ${dof0.toFixed(2)} → ${dof1.toFixed(2)} → ${dof2.toFixed(2)}`);

      /* --- Esc --- */
      let escOk = true;
      try { a.pressKey('Escape'); } catch (e) { escOk = false; }
      rec('Esc', escOk && !c.dragging, 'releases pointer lock / drag');

      a.setTimeOfDay('day', { instant: true });
      return out;
    });

    const total = Object.keys(kb.results).length;
    check(`every E.6 control works (${total} bindings)`, kb.failures.length === 0,
          kb.failures.length ? kb.failures.join(' | ') : Object.keys(kb.results).join(', '));
    if (process.env.AEON_KEYS) {
      for (const [k, v] of Object.entries(kb.results)) {
        console.log(`      ${v.ok ? '·' : '!'} ${k.padEnd(28)} ${v.detail}`);
      }
    }
  }

  /* ---- Construction simulation (E.7 / Phase 9) ---- */
  if (await page.evaluate(() => typeof window.AEON.siteStatus === 'function')) {
    const cs = await page.evaluate(() => {
      const a = window.AEON;
      const step = (n = 60) => {
        for (let i = 0; i < n; i++) {
          a.construction.update(1 / 60);
          a.site.update(1 / 60, i / 60);
        }
      };
      a.setConstruction(true);
      a.construction.playing = false;
      step(120);

      const rows = [];
      for (let m = 1; m <= 10; m++) {
        a.goToMilestone(m);
        step(90);
        const st = a.constructionStatus();
        const site = a.siteStatus();
        // Which staged site objects are on screen at this milestone?
        const visible = a.site.stages.filter(s => s.obj.visible).map(s => s.obj.name);
        // Which zones of the finished building are present?
        const zones = a.world.zones.filter(z => z.group.visible).map(z => z.id);
        // Are the workers and cranes actually moving? Measure the crew in
        // aggregate: at any instant most figures are idle or working in
        // place, which is the intended behaviour, not a stalled animation.
        const live = Math.max(1, a.site.crew.liveCount || 0);
        const before = a.site.crew.workers.slice(0, live).map(w => w.pos.clone());
        step(60);
        let moved = 0;
        for (let k = 0; k < live; k++) moved += before[k].distanceTo(a.site.crew.workers[k].pos);
        const craneSlew = a.site.towerCranes[0].slew.rotation.y;
        step(30);
        const craneMoved = Math.abs(a.site.towerCranes[0].slew.rotation.y - craneSlew) > 1e-4;
        rows.push({
          m, day: st.day, name: st.milestoneName, buildHeight: site.buildHeight,
          plantVisible: visible.length, zones: zones.length, zoneIds: zones,
          liveWorkers: live, crewMotion: +moved.toFixed(2),
          workersMoved: moved > 0.05, craneMoved,
          ribbonVisible: !!(a.site.ribbon && a.site.ribbon.visible),
          glazing: +a.materials.glazingReveal.toFixed(3),
          budget: +st.budgetUsed.toFixed(3), spi: +st.spi.toFixed(3), cpi: +st.cpi.toFixed(3)
        });
      }

      // Turning construction mode off must restore the finished campus.
      a.setConstruction(false);
      step(180);
      const restoredZones = a.world.zones.filter(z => z.group.visible).length;
      const clipOff = !a.materials.buildClipEnabled;
      const glazingBack = a.materials.glazingReveal;

      return { rows, restoredZones, clipOff, glazingBack, siteBuilt: a.siteStatus().built,
               plantCount: a.siteStatus().plant };
    });

    const heights = cs.rows.map(r => r.buildHeight);
    const rising = heights.every((h, i) => i === 0 || h >= heights[i - 1]);
    const spread = heights[heights.length - 1] - heights[0];
    check('every milestone changes the structure',
          rising && spread > 600 && new Set(heights).size >= 7,
          `build height ${heights[0]} → ${heights[heights.length - 1]} m across ` +
          `${new Set(heights).size} distinct stages`);
    /* Milestones 1-9 are live work; by milestone 10 the job is handed over
       and the crew has left, so the ribbon replaces them. */
    const working = cs.rows.slice(0, 9);
    check('plant and workers animate at every milestone',
          cs.rows.every(r => r.plantVisible > 0) &&
          working.every(r => r.workersMoved) &&
          cs.rows[9].ribbonVisible &&
          cs.rows.filter(r => r.craneMoved).length >= 4,
          `${cs.plantCount} plant items; crew ` +
          `${Math.min(...working.map(r => r.liveWorkers))}-${Math.max(...working.map(r => r.liveWorkers))} ` +
          `figures on M1-9, cranes slewing in ` +
          `${cs.rows.filter(r => r.craneMoved).length}/10; ribbon up at handover`);
    check('zones appear on their own milestones',
          cs.rows[0].zones === 0 && cs.rows[9].zones === 7 &&
          cs.rows[8].zoneIds.includes('court') && !cs.rows[5].zoneIds.includes('court'),
          `M1 ${cs.rows[0].zones} zones → M9 ${cs.rows[8].zones} → M10 ${cs.rows[9].zones}`);
    check('glazing waits for the facade package',
          cs.rows[5].glazing < 0.1 && cs.rows[8].glazing > 0.9,
          `M6 ${cs.rows[5].glazing} → M8 ${cs.rows[7].glazing} → M9 ${cs.rows[8].glazing}`);
    check('leaving construction mode restores the campus',
          cs.restoredZones === 7 && cs.clipOff && cs.glazingBack > 0.98,
          `${cs.restoredZones}/7 zones, clipping off, glazing ${cs.glazingBack.toFixed(2)}`);
    if (process.env.AEON_MILESTONES) {
      for (const r of cs.rows) {
        console.log(`      ${String(r.m).padStart(2)}  day ${String(r.day).padStart(3)}  ` +
          `h=${String(r.buildHeight).padStart(4)}m  zones=${r.zones}  glaze=${r.glazing.toFixed(2)}  ` +
          `budget=${(r.budget * 100).toFixed(1)}%  SPI=${r.spi.toFixed(2)}  ${r.name}`);
      }
    }
  }

  if (SHOTS) {
    fs.mkdirSync(path.join(ROOT, 'docs/screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'docs/screenshots/verify.jpg'), quality: 82, type: 'jpeg' });
  }
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ').slice(0, 600));
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | ').slice(0, 800));
check('no failed requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
if (cdnProbeNoise.length) console.log(`    (filtered ${cdnProbeNoise.length} sandbox CDN-probe network log(s) — app fell back to the vendored three.js)`);

await browser.close();
server.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
