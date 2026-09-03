#!/usr/bin/env node
/**
 * AEON SPIRE — screenshot tool.
 *
 * Drives the live page in headless Chromium and writes framed views to
 * docs/screenshots/. Used during the build to visually check massing,
 * facades and interiors, and at the end to illustrate the README.
 *
 *   node tools/shoot.mjs                    # the standard set
 *   node tools/shoot.mjs name x y z lx ly lz
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/screenshots');
const PORT = 8600 + (process.pid % 200);
const W = Number(process.env.SHOT_W || 900);
const H = Number(process.env.SHOT_H || 560);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = await new Promise(r => {
  const s = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(f, (e, d) => {
      if (e) return res.writeHead(404).end('404');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  });
  s.listen(PORT, () => r(s));
});

/** name, camera position, look-at target, optional setup fn body. */
const DEFAULT_SHOTS = [
  ['massing-hero', [430, 190, 470], [0, 250, 30]],
  ['massing-spire', [180, 430, 220], [0, 560, 0]],
  ['massing-canal', [0, 26, 210], [0, 30, 40]],
  ['massing-court', [0, 40, 120], [0, 30, 420]],
  ['massing-annex', [-170, 60, 40], [-350, 10, 110]],
  ['massing-observatory', [300, 30, -140], [232, 20, -206]],
  ['massing-ring', [200, 220, 170], [0, 200, 0]]
];

const args = process.argv.slice(2);
const shots = args.length >= 7
  ? [[args[0], [+args[1], +args[2], +args[3]], [+args[4], +args[5], +args[6]]]]
  : DEFAULT_SHOTS;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error('  page error:', e.message));
page.on('console', m => { if (m.type() === 'error' && !/jsdelivr|Failed to load resource/.test(m.text())) console.error('  console:', m.text()); });

await page.goto(`http://localhost:${PORT}/index.html?quality=high`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.AEON_STARTED === true || window.AEON_FATAL, { timeout: 120000 });
await page.waitForTimeout(1200);
if (process.env.SHOT_INTERIORS) {
  await page.evaluate(() => window.AEON.revealInteriors && window.AEON.revealInteriors());
  await page.waitForTimeout(1500);
}

for (const [name, pos, look] of shots) {
  await page.evaluate(([p, l]) => {
    const a = window.AEON;
    if (a.setCamera) a.setCamera(p, l);
    else { a.camera.position.set(p[0], p[1], p[2]); a.camera.lookAt(l[0], l[1], l[2]); }
  }, [pos, look]);
  // A few frames so culling, lazy rooms and the sky settle.
  await page.waitForTimeout(2600);
  const file = path.join(OUT, name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
  console.log('  →', path.relative(ROOT, file));
}

await browser.close();
server.close();
