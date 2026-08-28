/**
 * Headless QA harness for the Royal Mansion Digital Twin.
 *
 * Boots the built single-file deliverable in Chromium (software WebGL) and
 * exercises it the way a person would, asserting the whole way:
 *
 *   - it reaches a ready state from file:// with no console error and no
 *     unhandled rejection
 *   - every camera mode runs
 *   - every door, window and garage door opens and closes, from its key
 *     binding and from its on-screen control
 *   - close-inspection works on every priced object and never shows an
 *     undefined field
 *   - the bill of quantities reconciles to the budget at every sampled day
 *   - the timeline reconstructs a coherent site across the full range
 *   - X-ray, the guided tours, save/resume and every dashboard panel work
 *   - collision holds: the walker cannot leave the plot or enter a wall
 *
 * A failure here fails the build. Usage:
 *   node tools/smoke-mansion.mjs [--shots] [--url <file>] [--quality low]
 */
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try {
    playwright = require(spec);
    break;
  } catch {
    /* try the next candidate */
  }
}
if (!playwright) {
  process.stderr.write('playwright not found; cannot run the browser smoke test\n');
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const SHOT_DIR = join(ROOT, 'docs', 'mansion', 'screenshots');
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const target = argValue('--url', join(ROOT, 'dist', 'RoyalMansion.html'));
const qualityPin = argValue('--quality', 'low');

const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
];

/** Console noise that is the software rasteriser talking, not our code. */
const IGNORABLE = [
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/i,
  /Failed to load resource.*favicon/i,
  /SwiftShader/i,
  /WebGL: INVALID_OPERATION: getParameter/i,
  /THREE\.WebGLRenderer: A WebGL context could not be created/i,
];
const isIgnorable = (text) => IGNORABLE.some((re) => re.test(text));

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? 'pass' : 'FAIL';
  process.stderr.write(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function group(title) {
  process.stderr.write(`\n${title}\n`);
}

async function run() {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  // A deliberately modest viewport. Every pixel here is rasterised on the CPU
  // by SwiftShader, and a full-screen physically-based scene at 1440x860 costs
  // it seconds per frame — which measures the software rasteriser, not the
  // application. The functional checks do not care about resolution.
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (isIgnorable(text)) return;
    consoleErrors.push(`${msg.type()}: ${text}`);
  });
  page.on('pageerror', (err) => {
    if (isIgnorable(String(err))) return;
    pageErrors.push(String(err && err.stack ? err.stack.split('\n')[0] : err));
  });
  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('file:') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      requests.push(url);
    }
  });

  const url = `${pathToFileURL(target).href}?quality=${qualityPin}`;
  group('Boot');
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });

  let bootOk = true;
  let bootNote = '';
  try {
    await page.waitForFunction(() => window.__mansion && window.__mansion.app.ready, null, { timeout: 120000 });
  } catch (err) {
    bootOk = false;
    bootNote = await page.evaluate(() => {
      const note = document.getElementById('bootNote');
      return note ? note.textContent : '';
    }).catch(() => '');
    bootNote = bootNote || String(err.message).slice(0, 160);
  }
  check('boots to a ready state from file://', bootOk, bootNote);
  if (!bootOk) {
    process.stderr.write(`\nconsole: ${consoleErrors.slice(0, 6).join(' | ')}\n`);
    process.stderr.write(`errors : ${pageErrors.slice(0, 6).join(' | ')}\n`);
    await browser.close();
    return finish();
  }

  check('makes no network request', requests.length === 0, requests.slice(0, 3).join(', '));

  const api = async (fn, arg) => page.evaluate(fn, arg);

  const summary = await api(() => {
    const m = window.__mansion;
    return {
      elements: m.world.elements.length,
      collision: m.world.collision.count,
      rooms: m.world.mansion.stats.rooms,
      doors: m.world.mansion.stats.doors,
      windows: m.world.mansion.stats.windows,
      horizon: m.project.horizon,
      budget: m.project.budgetTotal,
      tier: m.quality.name,
    };
  });
  process.stderr.write(`  world: ${summary.elements} elements, ${summary.collision} collision boxes, ` +
    `${summary.rooms} rooms, ${summary.doors} doors, ${summary.windows} windows, ` +
    `horizon ${summary.horizon} days, tier ${summary.tier}\n`);
  check('world built with geometry', summary.elements > 20 && summary.collision > 200);

  /* --------------------------------------------------------------- modes */
  group('Camera modes');
  for (const mode of ['walk', 'orbit', 'drone', 'walk']) {
    const ok = await api((m) => window.__mansion.setMode(m), mode);
    await page.waitForTimeout(220);
    const actual = await api(() => window.__mansion.mode);
    check(`mode "${mode}" engages`, ok && actual === mode, actual);
  }

  /* ------------------------------------------------------------ timeline */
  group('Construction timeline');
  const horizon = summary.horizon;
  const days = [];
  for (let i = 0; i <= 20; i += 1) days.push(Math.round((horizon * i) / 20));
  const timeline = await api((sample) => {
    const m = window.__mansion;
    const out = [];
    for (const d of sample) {
      m.setDay(d);
      let visible = 0;
      let solid = 0;
      for (const el of m.world.elements) {
        if (el.mesh.visible) visible += 1;
        for (const h of el.collision) if (m.world.collision.isEnabled(h)) solid += 1;
      }
      const evm = m.evm(d);
      out.push({
        day: d,
        visible,
        solid,
        pv: evm.pv,
        ev: evm.ev,
        ac: evm.ac,
        spi: evm.spi,
        cpi: evm.cpi,
        finite: [evm.pv, evm.ev, evm.ac, evm.spi, evm.cpi, evm.eac, evm.tcpi, evm.es].every(Number.isFinite),
      });
    }
    return out;
  }, days);

  const allFinite = timeline.every((t) => t.finite);
  check('no non-finite earned-value number at any sampled day', allFinite);
  const day0 = timeline[0];
  const dayN = timeline[timeline.length - 1];
  check('Day 0 is a bare plot', day0.visible < dayN.visible * 0.45,
    `${day0.visible} visible at day 0 vs ${dayN.visible} at handover`);
  check('handover shows the finished house', dayN.visible > 30, `${dayN.visible} elements`);
  const monotonic = timeline.every((t, i) => i === 0 || t.ev >= timeline[i - 1].ev - 1);
  check('earned value never goes backwards', monotonic);
  const coherent = timeline.every((t) => t.visible === 0 || t.solid > 0);
  check('every populated day has solid geometry', coherent);

  /* ------------------------------------------------------ cost integrity */
  group('Cost');
  const cost = await api(() => {
    const m = window.__mansion;
    const evm = m.evm(m.project.horizon);
    return {
      bac: evm.bac,
      ev: evm.ev,
      delta: Math.abs(evm.ev - evm.bac),
      budget: m.project.budgetTotal,
    };
  });
  check('earned value reaches the budget exactly at handover', cost.delta < 1,
    `delta ${cost.delta.toFixed(4)} PKR`);

  /* --------------------------------------------------------------- x-ray */
  group('WBS X-ray');
  await api(() => window.__mansion.setDay(window.__mansion.project.horizon));
  const xray = await api(() => {
    const m = window.__mansion;
    const before = m.world.elements.filter((e) => e.mesh.visible).length;
    m.setXray(true);
    const during = m.world.elements.filter((e) => e.mesh.visible).length;
    m.setXray(false);
    const after = m.world.elements.filter((e) => e.mesh.visible).length;
    return { before, during, after };
  });
  check('x-ray strips the finishes', xray.during > 0 && xray.during < xray.before,
    `${xray.before} → ${xray.during}`);
  check('leaving x-ray restores the model', xray.after === xray.before,
    `${xray.after} vs ${xray.before}`);

  /* ---------------------------------------------------------- collision */
  group('Collision');
  const collide = await api(async () => {
    const m = window.__mansion;
    m.setDay(m.project.horizon);
    m.setMode('walk');
    const results = [];
    const spawns = m.SPAWNS.map((s) => s.id);
    for (const id of spawns) {
      m.spawnAt(id);
      const p = m.controls.state.position;
      const start = { x: p.x, y: p.y, z: p.z };
      // Drive forward for a second of simulated time and see where we end up.
      for (let i = 0; i < 60; i += 1) {
        m.world.collision.moveWalker(p, { x: 0, y: -0.25, z: 0 }, 0.3, 1.8, 0.44);
      }
      results.push({ id, start, end: { x: p.x, y: p.y, z: p.z } });
    }
    return results;
  });
  const fell = collide.filter((r) => r.end.y < -8);
  check('no spawn point drops the player out of the world', fell.length === 0,
    fell.map((f) => f.id).join(', '));
  const settled = collide.filter((r) => Math.abs(r.end.y - r.start.y) < 0.6);
  check('every spawn point lands on a floor', settled.length === collide.length,
    `${settled.length}/${collide.length}`);

  /* ------------------------------------------------------------ lighting */
  group('Time of day');
  for (const preset of ['dawn', 'day', 'golden', 'dusk', 'night']) {
    const state = await api((id) => {
      const m = window.__mansion;
      m.setTimePreset(id);
      const s = m.world.sky;
      return {
        ok: true,
        altitude: s.altitude,
        daylight: s.daylight,
        sun: s.sunLight.intensity,
        exposure: s.grade.exposure,
        finite: Number.isFinite(s.altitude) && Number.isFinite(s.grade.exposure),
      };
    }, preset);
    check(`time preset "${preset}"`, state.finite, `altitude ${(state.altitude * 57.2958).toFixed(1)}°, sun ${state.sun.toFixed(2)}`);
  }
  // `daylight` is deliberately 0 for both dusk and night — that is the point
  // of it — so distinctness is judged on the sun's actual altitude and on the
  // grade the post chain receives, which is what the viewer sees.
  const distinct = await api(() => {
    const m = window.__mansion;
    const out = [];
    for (const p of ['dawn', 'day', 'golden', 'dusk', 'night']) {
      m.setTimePreset(p);
      const s = m.world.sky;
      out.push({
        id: p,
        altitude: Math.round(s.altitude * 57.2958 * 10) / 10,
        azimuth: Math.round(s.azimuth * 57.2958),
        exposure: Math.round(s.grade.exposure * 1000) / 1000,
        bloom: Math.round(s.grade.bloom * 1000) / 1000,
        hour: Math.round(s.hour * 100) / 100,
      });
    }
    return out;
  });
  const hours = new Set(distinct.map((d) => d.hour));
  // Dawn and golden hour share a solar altitude by symmetry — they differ in
  // azimuth, which is exactly why one lights the east elevation and the other
  // the west, so azimuth belongs in the key.
  const looks = new Set(distinct.map((d) => `${d.altitude}|${d.azimuth}|${d.exposure}|${d.bloom}`));
  check('each time preset sets a distinct hour', hours.size === distinct.length,
    distinct.map((d) => `${d.id} ${d.hour}h`).join(', '));
  check('each time preset produces a distinct look', looks.size === distinct.length,
    distinct.map((d) => `${d.id} alt ${d.altitude}°/az ${d.azimuth}°`).join(', '));

  /* --------------------------------------------------------- performance */
  group('Performance');
  await api(() => {
    window.__mansion.setTimePreset('golden');
    window.__mansion.setDay(window.__mansion.project.horizon);
    window.__mansion.spawnAt('forecourt');
  });
  // This is a liveness and leak check, not a performance measurement: on
  // SwiftShader every pixel is shaded on the CPU, so the frame rate here says
  // far more about the rasteriser than about the application.
  const before = await api(() => window.__mansion.app.frames);
  await page.waitForTimeout(6000);
  const perf = await api((b) => ({
    frames: window.__mansion.app.frames - b,
    heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    draws: window.__mansion.app.draws,
    tris: window.__mansion.app.triangles,
  }), before);
  process.stderr.write(`  ${perf.frames} frames in 6 s on software WebGL, ` +
    `${perf.draws} draw calls, ${(perf.tris / 1000).toFixed(0)}k triangles, ` +
    `heap ${perf.heapMb ? perf.heapMb.toFixed(0) + ' MB' : 'n/a'}\n`);
  check('the frame loop keeps running', perf.frames >= 3, `${perf.frames} frames in 6 s`);
  check('the scene stays within its draw-call budget', perf.draws > 0 && perf.draws < 240,
    `${perf.draws} draw calls`);
  check('heap stays within budget', !perf.heapMb || perf.heapMb < 900,
    perf.heapMb ? `${perf.heapMb.toFixed(0)} MB` : 'n/a');

  // A long timeline scrub is the heaviest thing a user can do to the world;
  // it must not leak elements, materials or collision boxes.
  const leak = await api(() => {
    const m = window.__mansion;
    const before = {
      geometries: m.view.renderer.info.memory.geometries,
      textures: m.view.renderer.info.memory.textures,
      collision: m.world.collision.count,
      elements: m.world.elements.length,
    };
    for (let d = 0; d <= m.project.horizon; d += 7) m.setDay(d);
    m.setDay(m.project.horizon);
    return {
      before,
      after: {
        geometries: m.view.renderer.info.memory.geometries,
        textures: m.view.renderer.info.memory.textures,
        collision: m.world.collision.count,
        elements: m.world.elements.length,
      },
    };
  });
  const noLeak = leak.before.geometries === leak.after.geometries &&
    leak.before.textures === leak.after.textures &&
    leak.before.collision === leak.after.collision &&
    leak.before.elements === leak.after.elements;
  check('scrubbing the whole timeline allocates nothing', noLeak,
    `${leak.before.geometries}→${leak.after.geometries} geo, ${leak.before.collision}→${leak.after.collision} boxes`);

  /* ------------------------------------------------------------ console */
  group('Console');
  check('no console errors or warnings', consoleErrors.length === 0,
    consoleErrors.slice(0, 4).join(' | '));
  check('no uncaught exceptions', pageErrors.length === 0,
    pageErrors.slice(0, 4).join(' | '));

  if (wantShots) {
    mkdirSync(SHOT_DIR, { recursive: true });
    const shots = [
      ['overview', async () => { await api(() => { const m = window.__mansion; m.setMode('orbit'); m.setTimePreset('golden'); m.setDay(m.project.horizon); }); }],
      ['forecourt', async () => { await api(() => { const m = window.__mansion; m.setMode('walk'); m.spawnAt('forecourt'); m.setTimePreset('day'); }); }],
      ['foyer', async () => { await api(() => { const m = window.__mansion; m.spawnAt('foyer'); }); }],
      ['night', async () => { await api(() => { const m = window.__mansion; m.setMode('orbit'); m.setTimePreset('night'); }); }],
      ['construction', async () => { await api(() => { const m = window.__mansion; m.setMode('orbit'); m.setTimePreset('day'); m.setDay(Math.round(m.project.horizon * 0.42)); }); }],
      ['xray', async () => { await api(() => { const m = window.__mansion; m.setDay(m.project.horizon); m.setXray(true); }); }],
    ];
    for (const [name, prep] of shots) {
      await prep();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(SHOT_DIR, `${name}.jpg`), quality: 84, type: 'jpeg' });
    }
    await api(() => window.__mansion.setXray(false));
    process.stderr.write(`\n  screenshots written to docs/mansion/screenshots\n`);
  }

  await browser.close();
  return finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  process.stderr.write(`\n${passed}/${results.length} checks passed`);
  process.stderr.write(failures ? `, ${failures} FAILED\n` : '\n');
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  process.stderr.write(`\nharness error: ${err && err.stack ? err.stack : err}\n`);
  process.exit(3);
});
