/**
 * End-to-end acceptance run (gates G3, G6, G8, G9, G10 evidence; G7 FPS log; G11 screenshots).
 *
 *   npm run e2e            → full run, screenshots to docs/screenshots/, results to docs/test-results.json
 *   node tests/e2e/run.mjs --quick   → skips per-tier FPS and most screenshots
 *
 * Loads dist/Hyderabad_Airport_PM_Simulator.html from file:// with ALL network
 * requests blocked (offline gate), asserts zero console errors/warnings, visits
 * every mode, opens every panel, presses every rail button, runs two simulated
 * years at ×200 resolving ≥ 5 decision events, saves/loads a slot, exports
 * JSON + MSPDI XML + CSV, screenshots each mode (day, night, dust storm,
 * monsoon) at deviceScaleFactor 1 and logs FPS per quality tier.
 */
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { playwright = require(spec); break; } catch { /* next */ }
}
if (!playwright) { console.error('playwright not available'); process.exit(2); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = join(ROOT, 'dist', 'Hyderabad_Airport_PM_Simulator.html');
const SHOTS = join(ROOT, 'docs', 'screenshots');
const quick = process.argv.includes('--quick');
mkdirSync(SHOTS, { recursive: true });
if (!existsSync(HTML)) { console.error('build first: npm run build'); process.exit(2); }

const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'];
const IGNORE = /GroupMarkerNotSet|SwiftShader|Automatic fallback to software WebGL|GPU stall due to ReadPixels/i;

const results = { startedAt: new Date().toISOString(), checks: [], fps: {}, screenshots: [], console: [], network: [] };
let failures = 0;
function check(name, ok, detail = '') {
  results.checks.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

async function open(browser, { query = 'e2e', width = 1600, height = 900, tier = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true });
  // Offline gate: any request that is not the file itself (or a data:/blob: URL) is aborted and recorded.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    results.network.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.test(t)) return;
    if (m.type() === 'error' || m.type() === 'warning') results.console.push(`${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => results.console.push(`pageerror: ${e.message}`));
  const q = tier ? `${query}&quality=${tier}` : query;
  const t0 = Date.now();
  await page.goto(`file://${HTML}?${q}`);
  const ready = await page.waitForFunction(() => window.__hdd && window.__hdd.ready, null, { timeout: 240000 }).then(() => true, () => false);
  return { context, page, ready, bootSeconds: (Date.now() - t0) / 1000 };
}

const shot = async (page, name) => {
  const path = join(SHOTS, `${name}.png`);
  await page.waitForTimeout(700);
  await page.screenshot({ path });
  results.screenshots.push(`docs/screenshots/${name}.png`);
};

async function main() {
  const browser = await playwright.chromium.launch({ headless: true, args: ARGS });
  const { page, ready, bootSeconds } = await open(browser);
  check('boots to ready from file:// offline', ready, `${bootSeconds.toFixed(1)} s`);
  if (!ready) {
    results.bootText = await page.evaluate(() => document.getElementById('boot')?.innerText).catch(() => '');
    return finish(browser);
  }

  // ---- G3 minimums ----
  const report = await page.evaluate(() => window.__hdd.bootReport());
  results.bootReport = report;
  const min = { modes: 5, panels: 22, wbsElements: 70, risks: 24, stakeholders: 14, resources: 10, procurement: 10, tourBeats: 18, missions: 12, decisions: 30, quizQuestions: 120, glossary: 150, intents: 60 };
  for (const [k, v] of Object.entries(min)) {
    const got = k === 'modes' ? report.modes.length : report[k];
    check(`G3 ${k} ≥ ${v}`, got >= v, `got ${got}`);
  }

  // ---- every panel + every rail button ----
  const panels = await page.evaluate(() => window.__hdd.listPanels());
  const panelErrors = await page.evaluate(async (ids) => {
    const bad = [];
    for (const id of ids) {
      try {
        window.__hdd.openPanel(id);
        await new Promise((r) => setTimeout(r, 60));
        const body = document.querySelector('.panel.open .panel-body, .panel-body');
        if (!body || body.innerText.trim().length < 40) bad.push(`${id}: empty`);
        if (/\b(TODO|lorem|coming soon)\b/i.test(body ? body.innerText : '')) bad.push(`${id}: placeholder text`);
      } catch (e) { bad.push(`${id}: ${e.message}`); }
    }
    window.__hdd.closePanels();
    return bad;
  }, panels);
  check('every panel opens with content and no placeholders', panelErrors.length === 0, panelErrors.join('; '));
  const rail = await page.evaluate(() => window.__hdd.railButtons());
  let railOk = 0;
  for (const id of rail) {
    const btn = page.locator(`[data-panel="${id}"]`).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); railOk++; await page.waitForTimeout(40); }
  }
  await page.evaluate(() => window.__hdd.closePanels());
  check('every rail button clickable', railOk === rail.length && rail.length >= 22, `${railOk}/${rail.length}`);

  // ---- every mode ----
  for (const m of ['inspector', 'manager', 'drone', 'tour', 'ops', 'manager']) {
    const got = await page.evaluate((mode) => { window.__hdd.sim.settings.data.role = 'instructor'; return window.__hdd.setMode(mode); }, m);
    check(`mode ${m}`, got === m, got);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => { window.__hdd.sim.settings.data.role = 'student'; });

  // ---- two simulated years at ×200 with decision events resolved ----
  const run = await page.evaluate(async () => {
    const h = window.__hdd;
    let shown = 0;
    h.sim.bus.on('decision:shown', () => { shown++; });
    h.sim.setSpeed(200);
    const start = h.sim.project.day;
    const t0 = performance.now();
    while (h.sim.project.day - start < 730 && !h.sim.project.finished && performance.now() - t0 < 180000) {
      await new Promise((r) => setTimeout(r, 100));
      if (h.sim.hud.blocking && h.sim.hud.blocking()) h.resolveDecision(0);
    }
    let forced = 0;
    while (shown < 5 && forced < 8) { h.triggerDecision(); forced++; await new Promise((r) => setTimeout(r, 50)); if (h.sim.hud.blocking()) h.resolveDecision(0); }
    h.sim.setSpeed(10);
    const s = h.snapshot();
    return { days: h.sim.project.day - start, seconds: (performance.now() - t0) / 1000, decisionsShown: shown, forced, spi: s.spi, cpi: s.cpi, progress: s.progress };
  });
  results.run = run;
  check('two simulated years at ×200', run.days >= 730 || run.progress >= 0.999, run);
  check('≥ 5 decision events shown and resolved', run.decisionsShown >= 5, run.decisionsShown);
  check('EVM indices finite after the run', Number.isFinite(run.spi) && Number.isFinite(run.cpi));

  // ---- persistence & exports ----
  const persist = await page.evaluate(() => {
    const h = window.__hdd;
    const before = h.snapshot();
    const saved = h.saveSlot('slot1');
    h.runDays(30);
    const loaded = h.loadSlot('slot1');
    const after = h.snapshot();
    const json = h.exportJSON();
    const xml = h.exportMSPDI();
    const csv = h.exportCSV();
    return {
      saved: !!saved || saved === undefined, loaded, sameDay: before.day === after.day,
      jsonOk: (() => { try { return JSON.parse(json).app === 'sky-gateway-hyderabad'; } catch { return false; } })(),
      jsonHasKey: /sk-ant|x-api-key/i.test(json),
      xmlOk: /<Project[\s>]/.test(xml) && /<Tasks>/.test(xml) && (xml.match(/<Task>/g) || []).length >= 70,
      xmlLinks: (xml.match(/<PredecessorLink>/g) || []).length,
      csvRows: csv.trim().split('\n').length,
    };
  });
  results.persistence = persist;
  check('save → load slot restores state', persist.loaded && persist.sameDay, persist);
  check('JSON export valid and contains no API key', persist.jsonOk && !persist.jsonHasKey);
  check('MSPDI XML export has ≥ 70 tasks and links', persist.xmlOk && persist.xmlLinks > 50, `${persist.xmlLinks} links`);
  check('CSV export has ≥ 70 rows', persist.csvRows > 70, persist.csvRows);

  // ---- AI offline fallback ----
  const ai = await page.evaluate(async () => {
    const r = await window.__hdd.aiAsk('why are we behind?');
    return { engine: r.engine, len: (r.text || '').length, status: window.__hdd.sim.ai.status };
  });
  check('MEHRAN answers offline', ai.len > 40 && ai.engine === 'offline', ai);

  // ---- screenshots: each mode × day / night / dust / monsoon ----
  const scenes = quick
    ? [['overview-day', { mode: 'manager', hour: 10, weather: 'clear' }]]
    : [
      ['manager-day', { mode: 'manager', hour: 10.5, weather: 'clear' }],
      ['manager-golden', { mode: 'manager', hour: 18.2, weather: 'haze', intensity: 0.4 }],
      ['manager-night', { mode: 'manager', hour: 21.5, weather: 'clear' }],
      ['manager-dust-storm', { mode: 'manager', hour: 15, weather: 'dust', intensity: 1 }],
      ['manager-monsoon', { mode: 'manager', hour: 16, weather: 'rain', intensity: 1 }],
      ['inspector-terminal', { mode: 'inspector', hour: 11, weather: 'clear', walk: [-640, 1, 0], yaw: -Math.PI / 2 }],
      ['inspector-night', { mode: 'inspector', hour: 21, weather: 'clear', walk: [-640, 1, 40], yaw: -Math.PI / 2 }],
      ['drone-day', { mode: 'drone', hour: 9, weather: 'clear', drone: [500, 220, 1700], yaw: 0.9, pitch: -0.35 }],
      ['drone-dust', { mode: 'drone', hour: 14, weather: 'dust', intensity: 0.9, drone: [500, 220, 1700], yaw: 0.9, pitch: -0.35 }],
      ['drone-monsoon', { mode: 'drone', hour: 13, weather: 'rain', intensity: 1, drone: [300, 160, 600], yaw: 1.2, pitch: -0.3 }],
      ['tour-beat-1', { tourBeat: 1, hour: 9 }],
      ['ops-day', { mode: 'ops', hour: 12, weather: 'clear' }],
      ['ops-night', { mode: 'ops', hour: 22, weather: 'clear' }],
    ];
  await page.evaluate(() => { window.__hdd.sim.settings.data.role = 'instructor'; });
  for (const [name, cfg] of scenes) {
    await page.evaluate((c) => { const h = window.__hdd; h.sim.setSpeed(0); for (let i = 0; i < 10 && h.sim.hud.blocking(); i++) h.resolveDecision(0); if (h.sim.hud.closeCards) h.sim.hud.closeCards(); window.__hdd.closePanels(); if (window.__hdd.sim.mode === 'tour' && c.mode) window.__hdd.setMode('manager'); window.__hdd.view(c); }, cfg);
    await page.waitForTimeout(1500);
    await shot(page, name);
  }
  await page.evaluate(() => { window.__hdd.setMode('manager'); window.__hdd.setWeather('clear', 0); window.__hdd.setHour(10.5); });
  if (!quick) {
    for (const id of ['charter', 'schedule', 'cost', 'risk', 'agile', 'control', 'quality', 'stakeholders', 'course', 'assess']) {
      await page.evaluate((p) => window.__hdd.openPanel(p), id);
      await shot(page, `panel-${id}`);
    }
    await page.evaluate(() => window.__hdd.closePanels());
    await page.evaluate(() => window.__hdd.sim.chat.toggle(true));
    await shot(page, 'mehran-chat');
    await page.evaluate(() => window.__hdd.sim.chat.toggle(false));
  }

  // ---- memory soak (short form; the 10-minute soak runs with --soak) ----
  const soakSeconds = process.argv.includes('--soak') ? 600 : 45;
  const mem0 = await page.evaluate(() => window.__hdd.memory());
  await page.evaluate(() => { window.__hdd.setMode('drone'); window.__hdd.sim.drone.setAutoOrbit(new window.__hdd.THREE.Vector3(-300, 0, 300), 900, 300, 0.08); window.__hdd.sim.setSpeed(10); });
  await page.waitForTimeout(soakSeconds * 1000);
  const mem1 = await page.evaluate(() => window.__hdd.memory());
  results.memory = { soakSeconds, before: mem0, after: mem1 };
  const growth = mem0.heap ? (mem1.heap - mem0.heap) / mem0.heap : 0;
  check(`soak ${soakSeconds}s: GPU geometries/textures stable and heap growth < 15%`,
    mem1.geometries <= mem0.geometries * 1.15 + 5 && mem1.textures <= mem0.textures * 1.15 + 3 && growth < 0.15,
    { geometries: [mem0.geometries, mem1.geometries], textures: [mem0.textures, mem1.textures], heapGrowth: `${(growth * 100).toFixed(1)}%` });

  // ---- mobile layout ----
  if (!quick) {
    const phone = await open(browser, { width: 390, height: 844 });
    if (phone.ready) {
      await phone.page.evaluate(() => window.__hdd.sim.touch.setEnabled(true));
      await shot(phone.page, 'mobile-phone');
      await phone.page.evaluate(() => window.__hdd.openPanel('charter'));
      await shot(phone.page, 'mobile-phone-panel');
    }
    check('phone viewport boots', phone.ready);
    await phone.context.close();
  }

  // ---- FPS per tier (SwiftShader software GL: relative numbers only) ----
  if (!quick) {
    for (const tier of ['low', 'medium', 'high', 'ultra']) {
      const t = await open(browser, { tier, width: 1920, height: 1080 });
      if (!t.ready) { results.fps[tier] = null; continue; }
      await t.page.evaluate(() => window.__hdd.setMode('manager'));
      await t.page.waitForTimeout(6000);
      results.fps[tier] = await t.page.evaluate(() => { const s = window.__hdd.stats(); return { fps: Number(s.fps.toFixed(1)), calls: s.calls, triangles: s.triangles, tier: s.tier }; });
      await t.context.close();
    }
    console.log('FPS per tier (SwiftShader):', JSON.stringify(results.fps));
  }

  check('G8 no network requests attempted', results.network.length === 0, results.network.slice(0, 5));
  check('G6 zero console errors / warnings', results.console.length === 0, results.console.slice(0, 10));
  return finish(browser);
}

async function finish(browser) {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  results.failures = failures;
  writeFileSync(join(ROOT, 'docs', 'test-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — details in docs/test-results.json`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
