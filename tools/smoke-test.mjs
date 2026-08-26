/**
 * Headless QA harness.
 *
 * Boots the built single-file deliverable in Chromium (SwiftShader), asserts
 * that it reaches a ready state with no console errors, exercises every game
 * mode and every dashboard panel, samples the frame rate and JS heap, and
 * writes screenshots for visual review.
 *
 * Usage: node tools/smoke-test.mjs [--shots] [--url <file>]
 */
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try {
    playwright = require(spec);
    break;
  } catch {
    /* try next */
  }
}
if (!playwright) {
  console.error('playwright not found; skipping browser smoke test');
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = join(ROOT, 'docs', 'screenshots');
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const target = (() => {
  const i = args.indexOf('--url');
  if (i !== -1 && args[i + 1]) return args[i + 1];
  return join(ROOT, 'dist', 'GizaDigitalTwin.html');
})();

const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
];

const IGNORABLE = [
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/i,
  /Failed to load resource.*favicon/i,
  /SwiftShader/i,
  /THREE.WebGLRenderer: A WebGL context could not be created.*$/i,
];

function isIgnorable(text) {
  return IGNORABLE.some((re) => re.test(text));
}

async function run() {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (isIgnorable(text)) return;
    if (msg.type() === 'error') errors.push(text);
    else if (msg.type() === 'warning') warnings.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  const url = target.startsWith('http') ? target : pathToFileURL(target).href;
  console.log(`> loading ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });

  await page.waitForFunction(() => window.__giza && window.__giza.ready === true, null, { timeout: 180000 });
  console.log('> simulator reported ready');

  const boot = await page.evaluate(() => window.__giza.bootReport());
  console.log('> boot report:', JSON.stringify(boot, null, 2));

  if (wantShots && !existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });

  const results = [];
  const scenarios = [
    { id: 'overview', mode: 'manager', hour: 9.5, wait: 2200 },
    { id: 'sunrise-walk', mode: 'archaeologist', hour: 6.0, wait: 2200 },
    { id: 'noon-site', mode: 'archaeologist', hour: 12.0, wait: 2000 },
    { id: 'golden-hour', mode: 'drone', hour: 17.5, wait: 2400 },
    { id: 'night-torches', mode: 'drone', hour: 21.0, wait: 2200 },
    { id: 'interior-kings-chamber', mode: 'archaeologist', hour: 12.0, interior: 'kingsChamber', wait: 2400 },
    { id: 'interior-grand-gallery', mode: 'archaeologist', hour: 12.0, interior: 'grandGallery', wait: 2400 },
    { id: 'tour', mode: 'tour', hour: 8.0, wait: 2600 },
  ];

  for (const s of scenarios) {
    await page.evaluate((cfg) => window.__giza.testScenario(cfg), s);
    await page.waitForTimeout(s.wait);
    const stats = await page.evaluate(() => window.__giza.sampleStats());
    results.push({ id: s.id, ...stats });
    console.log(`  ${s.id.padEnd(26)} fps=${stats.fps.toFixed(1)} calls=${stats.calls} tris=${stats.triangles}`);
    if (wantShots) await page.screenshot({ path: join(SHOT_DIR, `${s.id}.jpg`), type: 'jpeg', quality: 82 });
  }

  console.log('> exercising every dashboard panel');
  const panels = await page.evaluate(() => window.__giza.listPanels());
  for (const id of panels) {
    await page.evaluate((p) => window.__giza.openPanel(p), id);
    await page.waitForTimeout(320);
    if (wantShots && ['brief', 'wbs', 'schedule', 'cost', 'risk', 'resources', 'quality', 'stakeholders', 'montecarlo'].includes(id)) {
      await page.screenshot({ path: join(SHOT_DIR, `panel-${id}.jpg`), type: 'jpeg', quality: 82 });
    }
  }
  await page.evaluate(() => window.__giza.closePanels());

  console.log('> touch / mobile controls');
  const touch = await page.evaluate(() => {
    window.__giza.sim.setMode('archaeologist');
    const forced = window.__giza.setTouchControls(true);
    const stick = window.__giza.touchStick(0.7, -0.7);
    const jump = window.__giza.touchButton('jump');
    const crouch = window.__giza.touchButton('crouch');
    window.__giza.touchButton('crouch');   // toggle back off
    window.__giza.touchStick(0, 0);
    window.__giza.setTouchControls(false);
    return { ...forced, stick, jump, crouch };
  });
  console.log('> touch:', JSON.stringify(touch));
  if (!touch.enabled || touch.buttons.length !== 4 || !touch.jump.down || touch.jump.stillDown) {
    errors.push(`touch controls did not behave: ${JSON.stringify(touch)}`);
  }
  if (Math.abs(touch.stick.x - 0.7) > 0.01 || Math.abs(touch.stick.y + 0.7) > 0.01) {
    errors.push(`virtual stick axes wrong: ${JSON.stringify(touch.stick)}`);
  }

  console.log('> responsive layout check');
  const layouts = [];
  for (const [label, width, height] of [['phone', 412, 915], ['tablet', 1024, 768], ['landscape-phone', 844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__giza.setTouchControls(true));
    await page.waitForTimeout(320);
    const m = await page.evaluate(() => {
      window.__giza.openPanel('cost');
      const panel = document.querySelector('.panel.open');
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        panelW: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
        panelRight: panel ? Math.round(panel.getBoundingClientRect().right) : 0,
      };
    });
    await page.evaluate(() => window.__giza.closePanels());
    layouts.push({ label, ...m });
    console.log(`  ${label.padEnd(16)} panel=${m.panelW}px right=${m.panelRight} viewport=${m.innerW} scroll=${m.scrollW}`);
    if (m.scrollW > m.innerW + 1) errors.push(`${label}: page scrolls horizontally (${m.scrollW} > ${m.innerW})`);
    if (m.panelRight > m.innerW + 1) errors.push(`${label}: dashboard overflows the viewport`);
    if (wantShots) await page.screenshot({ path: join(SHOT_DIR, `mobile-${label}.jpg`), type: 'jpeg', quality: 82 });
  }
  await page.evaluate(() => window.__giza.setTouchControls(false));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(400);

  console.log('> walker / collision check');
  const walk = await page.evaluate(() =>
    window.__giza.walkTest([[0, -260], [210, -206], [268, 300], [336, 620], [300, 900], [-252, 620], [1100, 300], [-800, 400]])
  );
  const floaters = walk.filter((w) => Math.abs(w.drift) > 1.2);
  for (const w of walk) console.log(`  (${w.x}, ${w.z}) y=${w.y} expected≈${w.expected} drift=${w.drift} grounded=${w.grounded}`);
  if (floaters.length) {
    console.log(`  WARNING: ${floaters.length} point(s) did not settle on the ground`);
  }

  console.log('> running an accelerated project simulation');
  const sim = await page.evaluate(() => window.__giza.runHeadlessProject());
  console.log('> project result:', JSON.stringify(sim, null, 2));

  console.log('> memory / leak check');
  const mem = await page.evaluate(() => window.__giza.memoryReport());
  console.log('> memory:', JSON.stringify(mem, null, 2));

  await browser.close();

  const minFps = Math.min(...results.map((r) => r.fps));
  console.log('\n================ SMOKE TEST SUMMARY ================');
  console.log(`scenarios      : ${results.length}`);
  console.log(`panels         : ${panels.length}`);
  console.log(`viewports      : ${layouts.length} (${layouts.map((l) => l.label).join(', ')})`);
  console.log(`min fps        : ${minFps.toFixed(1)} (SwiftShader software rasteriser)`);
  console.log(`console errors : ${errors.length}`);
  console.log(`console warns  : ${warnings.length}`);
  if (warnings.length) warnings.slice(0, 12).forEach((w) => console.log(`  warn: ${w}`));
  if (errors.length) {
    errors.slice(0, 30).forEach((e) => console.log(`  ERROR: ${e}`));
    process.exitCode = 1;
  } else {
    console.log('RESULT: PASS - zero console errors');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
