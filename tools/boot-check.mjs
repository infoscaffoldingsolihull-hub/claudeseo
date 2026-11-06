/**
 * Quick headless check used by every agent while developing.
 *
 *   node tools/boot-check.mjs [--html dist/x.html] [--shot out.png] [--w 1600 --h 900]
 *                             [--eval "js expression or async () => {...}"]... [--wait 1500]
 *
 * Boots the file from file:// with ?e2e (skips onboarding), waits for
 * window.__hdd.ready, runs each --eval in order (printing its JSON result),
 * optionally screenshots, and prints every console error / warning.
 * Exit code 1 if the app never became ready or any error was logged.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { playwright = require(spec); break; } catch { /* next */ }
}
if (!playwright) { console.error('playwright not available'); process.exit(2); }

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : dflt; };
const evals = argv.flatMap((a, i) => (a === '--eval' ? [argv[i + 1]] : []));
const html = resolve(opt('html', 'dist/Hyderabad_Airport_PM_Simulator.html'));
const query = opt('query', 'e2e');
const shot = opt('shot', null);
const wait = Number(opt('wait', 1200));

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: Number(opt('w', 1600)), height: Number(opt('h', 900)) }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => {
  const t = m.text();
  if (/GroupMarkerNotSet|SwiftShader|Automatic fallback to software WebGL|GPU stall due to ReadPixels/i.test(t)) return;
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${t}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(`file://${html}?${query}`);
const ok = await page.waitForFunction(() => window.__hdd && window.__hdd.ready, null, { timeout: 180000 }).then(() => true, () => false);
console.log(`ready: ${ok} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (ok) {
  for (const e of evals) {
    try {
      const r = await page.evaluate(`(async () => { const __r = (${e}); return typeof __r === 'function' ? await __r() : await __r; })()`);
      console.log(`eval> ${e.slice(0, 80)}\n${String(JSON.stringify(r, null, 1)).slice(0, 4000)}`);
    } catch (err) {
      problems.push(`eval failed: ${e.slice(0, 60)} → ${err.message.split('\n')[0]}`);
    }
  }
  await page.waitForTimeout(wait);
  if (shot) { await page.screenshot({ path: resolve(shot) }); console.log(`screenshot: ${resolve(shot)}`); }
} else {
  const bootText = await page.evaluate(() => document.getElementById('boot') && document.getElementById('boot').innerText).catch(() => '');
  console.log(`boot screen: ${bootText}`);
}
console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.slice(0, 40).join('\n')}` : 'console: clean');
await browser.close();
process.exit(ok && !problems.length ? 0 : 1);
