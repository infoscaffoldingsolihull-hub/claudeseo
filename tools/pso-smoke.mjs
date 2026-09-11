/**
 * Headless QA for PSO 2035 — Future Forecourt.
 *
 * Boots the build in Chromium (SwiftShader), asserts it reaches a ready state
 * with no console errors, then probes the things this round of work claims to
 * have fixed: LED luminance against the bloom threshold, the LED strip rig
 * being live rather than write-only, day/night response, and the absence of
 * per-tick AudioParam steps. Screenshots are written for visual review.
 *
 * Claims are worthless; assertions are the currency. Usage:
 *   node tools/pso-smoke.mjs [--shots] [--json]
 */
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { playwright = require(spec); break; } catch { /* try next */ }
}
if (!playwright) { console.error('playwright not found'); process.exit(2); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'games', 'PSOFutureForecourt.html');
const SHOT_DIR = join(ROOT, 'docs', 'pso-screenshots');
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');

const CHROMIUM_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-gpu-sandbox', '--no-sandbox', '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
];

const IGNORABLE = [
  /Automatic fallback to software WebGL/i, /GroupMarkerNotSet/i,
  /Failed to load resource.*favicon/i, /SwiftShader/i,
  /WebGL context could not be created/i,
];
const ignorable = (t) => IGNORABLE.some((re) => re.test(t));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function run() {
  const browser = await playwright.chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));

  console.log('\nBooting ' + TARGET + '\n');
  await page.goto(pathToFileURL(TARGET).href, { waitUntil: 'load', timeout: 60000 });

  // The build exposes window.PSO2035 once it is interactive.
  /* The hook appears at boot step 2 of 34 — the build continues across frames,
     so waiting on window.PSO2035 alone races the world builders. The loader
     clearing is the real ready signal. */
  let booted = false;
  try {
    await page.waitForFunction(() => !!window.PSO2035, null, { timeout: 45000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('load');
      return !el || el.classList.contains('gone') || getComputedStyle(el).opacity === '0';
    }, null, { timeout: 90000 });
    booted = true;
  } catch { /* reported below */ }
  check('boots to interactive (loader cleared)', booted);
  if (!booted) {
    console.log('\nConsole errors:\n' + (errors.slice(0, 12).join('\n') || '(none captured)'));
    await browser.close();
    return finish();
  }

  /* Dismiss the title card with a key, not a click: clicking the middle of the
     screen lands on the "Drive a Car" mode card, and every screenshot then has
     a windscreen and a bonnet across it. Walk mode is the one that shows the
     site. */
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.PSO2035.setMode('walk', true); });
  await page.waitForTimeout(1500);

  check('no console errors', errors.length === 0,
    errors.length ? errors.slice(0, 5).join(' | ') : '');

  // ---- Gate C: the LED rig -------------------------------------------------
  const led = await page.evaluate(async () => {
    const P = window.PSO2035;
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    /* Wait in FRAMES, not milliseconds. The strike ramp converges at dt*9 per
       frame with dt clamped to 0.05, so it needs ~15 frames to settle. Under
       SwiftShader that is half a minute of wall time, and a ms-based wait
       samples a strip that is still on its way up — which reads as a failure
       of the rig rather than of the harness. */
    const frames = (n) => new Promise((res) => {
      let i = 0;
      (function tick() { if (++i >= n) res(); else requestAnimationFrame(tick); })();
    });

    P.setTime(22 * 60 + 30);
    await frames(40);
    const night = {
      cove: lum(P.MAT.cove.color),
      emGreen: lum(P.MAT.emGreen.color),
      strips: P.LED.strips.map((s) => lum(s.mat.color)),
      lit: P.LED.strips.map((s) => +s.lit.toFixed(3)),
    };
    const a = P.LED.strips.map((s) => s.mat.color.clone());
    await frames(6);
    const b = P.LED.strips.map((s) => s.mat.color.clone());
    const moved = a.some((c, i) => Math.abs(lum(c) - lum(b[i])) > 1e-5);

    P.setTime(12 * 60);
    await frames(40);
    const day = {
      cove: lum(P.MAT.cove.color),
      strips: P.LED.strips.map((s) => lum(s.mat.color)),
      lit: P.LED.strips.map((s) => +s.lit.toFixed(3)),
    };

    P.setTime(22 * 60 + 30);
    await frames(40);

    return {
      threshold: P.BLOOM ? P.BLOOM.threshold : null,
      night, day, moved,
      stripCount: P.LED.strips.length,
      coveCount: P.COVE.length,
      soffitFlag: !!P.MAT.soffitFlag,
      totem: !!P.MAT.totem,
      flagEm: P.MAT.soffitFlag ? P.MAT.soffitFlag.emissiveIntensity : null,
      totemEm: P.MAT.totem ? P.MAT.totem.emissiveIntensity : null,
    };
  });

  const thr = led.threshold;
  check('bloom threshold exposed', thr !== null, 'threshold=' + thr);
  check('C1a blue cove clears bloom threshold',
    led.night.cove >= 1.15 * thr,
    `lum=${led.night.cove.toFixed(3)} vs required ${(1.15 * thr).toFixed(3)}`);
  check('C1b green accent clears bloom threshold',
    led.night.emGreen >= 1.05 * thr,
    `lum=${led.night.emGreen.toFixed(3)} vs required ${(1.05 * thr).toFixed(3)}`);
  check('C1c every animated strip clears threshold at night',
    led.night.strips.every((l) => l >= thr),
    'lum=[' + led.night.strips.map((l) => l.toFixed(2)).join(', ') + ']  lit=[' + led.night.lit.join(', ') + ']');
  check('C6 strips go dark in daylight',
    led.day.strips.every((l) => l < 0.10),
    'day lum=[' + led.day.strips.map((l) => l.toFixed(3)).join(', ') + ']');
  check('C3 LED rig is live, not write-only',
    led.stripCount >= 4 && led.coveCount >= 5,
    `strips=${led.stripCount} cove meshes=${led.coveCount}`);
  check('C4 LEDs respond to time of day (night/day >= 4)',
    led.day.cove > 0 && led.night.cove / led.day.cove >= 4.0,
    `night=${led.night.cove.toFixed(3)} day=${led.day.cove.toFixed(3)} ratio=${(led.night.cove / Math.max(1e-6, led.day.cove)).toFixed(1)}`);
  check('C5 LED animation is actually running', led.moved);
  check('V3 soffit flag material present and lit', led.soffitFlag && led.flagEm > 0.6,
    'emissiveIntensity=' + led.flagEm);
  check('V4 column totem material present and lit', led.totem && led.totemEm > 0.6,
    'emissiveIntensity=' + led.totemEm);

  // ---- Gate E: viewpoints are not inside geometry --------------------------
  /* Viewpoint 1 used to sit 0.82 m from a kiosk shell, so pressing "1" filled
     the screen with a black slab. Objects move between builds and viewpoints do
     not follow them, so this is checked rather than eyeballed. */
  const views = await page.evaluate(async () => {
    const P = window.PSO2035, T = P.THREE;
    const frames = (n) => new Promise((res) => {
      let i = 0; (function tick() { if (++i >= n) res(); else requestAnimationFrame(tick); })();
    });
    const out = [];
    for (let i = 0; i < 5; i++) {
      P.goView(i);
      await frames(4);
      P.camera.updateMatrixWorld(true);
      const rc = new T.Raycaster();
      let min = Infinity, what = null;
      for (const [nx, ny] of [[0, 0], [-0.5, 0], [0.5, 0], [0, 0.4], [0, -0.4]]) {
        rc.setFromCamera(new T.Vector2(nx, ny), P.camera);
        const h = rc.intersectObjects(P.scene.children, true).filter((x) => x.object.visible)[0];
        if (h && h.distance < min) { min = h.distance; what = (h.object.material && h.object.material.name) || '?'; }
      }
      out.push({ i, n: (P.VIEWS && P.VIEWS[i] && P.VIEWS[i].n) || String(i), d: +min.toFixed(2), what });
    }
    return out;
  });
  const tooClose = views.filter((v) => v.d < 1.2);
  check('E1 no viewpoint spawns inside geometry (>= 1.2 m clear)',
    tooClose.length === 0,
    tooClose.length ? tooClose.map((v) => `view ${v.i + 1} "${v.n}" ${v.d}m from ${v.what}`).join('; ')
                    : views.map((v) => v.d + 'm').join(', '));

  // ---- Gate F: audio -------------------------------------------------------
  /* Only the per-tick paths matter. Setting .value once at construction, before
     the node is connected and running, is correct and is how every voice here is
     initialised — flagging those would just train us to ignore the check. What
     must not survive is a .value assignment inside the mixer, which runs 6 times
     a second on every loop. */
  const src = readFileSync(TARGET, 'utf8');
  const mixer = (src.match(/function updateAudio\(dt\)[\s\S]*?\n\}/) || [''])[0];
  check('F0 mixer located for inspection', mixer.length > 200, mixer.length + ' chars');
  const tickSteps = [...mixer.matchAll(/\.value\s*=/g)].filter((m) => !/\.position\./.test(mixer.slice(Math.max(0, m.index - 40), m.index)));
  check('F1 no per-tick AudioParam steps in the mixer', tickSteps.length === 0,
    tickSteps.length ? tickSteps.length + ' direct .value assignments' : 'all ramped');
  check('F2 mixer uses setTargetAtTime', /setTargetAtTime\(/.test(mixer));
  check('F3 mute ramps rather than stepping',
    /A\.listener\.gain\.gain\.setTargetAtTime\(/.test(src));

  // ---- Gate B: frame rate --------------------------------------------------
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    (function tick() { if (++n < 120) requestAnimationFrame(tick); else res(120000 / (performance.now() - t0)); })();
  }));
  check('B3 renders (SwiftShader, informational)', fps > 0, fps.toFixed(1) + ' fps software');

  if (wantShots) {
    mkdirSync(SHOT_DIR, { recursive: true });
    /* Three fixed poses at 22:30 — approach, under-canopy, wash portal — plus
       one daylight frame to confirm the LEDs are actually off rather than
       merely dim. Waits are in frames because the strike ramp is frame-driven. */
    const shots = [
      ['night-approach', 22 * 60 + 30, 0],
      ['night-canopy', 22 * 60 + 30, 1],
      ['night-wash', 22 * 60 + 30, 3],
      ['dusk-approach', 19 * 60 + 10, 0],
      ['day-approach', 12 * 60, 0],
    ];
    for (const [name, t, view] of shots) {
      await page.evaluate(([tm, v]) => { window.PSO2035.setTime(tm); window.PSO2035.goView(v); }, [t, view]);
      await page.evaluate(() => new Promise((res) => {
        let i = 0;
        (function tick() { if (++i >= 30) res(); else requestAnimationFrame(tick); })();
      }));
      await page.screenshot({ path: join(SHOT_DIR, name + '.png') });
      console.log('  shot  ' + name + '.png');
    }
  }

  check('no console errors after full exercise', errors.length === 0,
    errors.length ? errors.slice(0, 5).join(' | ') : '');

  await browser.close();
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILED:\n' + failed.map((f) => '  - ' + f.name + (f.detail ? ' — ' + f.detail : '')).join('\n'));
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
