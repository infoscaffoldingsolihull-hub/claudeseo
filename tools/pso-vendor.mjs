/**
 * Vendors three.js and its post-processing addons into PSO 2035 as one file.
 *
 * The build previously reached jsDelivr through an import map, which meant it
 * could not open from file://, could not run offline, and could not be booted
 * by the headless harness at all. The reference project (Digital Giza) vendors
 * three for exactly this reason, and this brings PSO to the same standard.
 *
 * The flattening follows the same rules as tools/build.mjs: ESM in, one script
 * out, imports stripped, `export` keywords dropped, and a collision check so a
 * duplicated top-level identifier fails loudly here instead of silently
 * shadowing something at runtime.
 *
 * The game module asks for two namespace objects (`THREE` and `BGU`). Those are
 * synthesised from each module's own export list rather than hand-maintained,
 * so they cannot drift from what the library actually exports.
 *
 * Usage: node tools/pso-vendor.mjs --three <path to three package root>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'games', 'PSOFutureForecourt.html');

const args = process.argv.slice(2);
const threeArg = args[args.indexOf('--three') + 1];
if (!threeArg || !existsSync(threeArg)) {
  console.error('usage: node tools/pso-vendor.mjs --three <three package root>');
  process.exit(2);
}
const PKG = resolve(threeArg);
const JSM = join(PKG, 'examples', 'jsm');

/* The addons the game imports, in the order the game imports them. */
const ROOTS = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/SMAAPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/SSAOPass.js',
  'utils/BufferGeometryUtils.js',
];

const IMPORT_RE = /^[ \t]*import\s+(?:\*\s+as\s+\w+|\{[\s\S]*?\}|\w+)\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^[ \t]*export\s+(?=(?:default\s+)?(?:const|let|var|function|class|async))/gm;

/** Names from an `export { A, B as C }` list — the exported spelling. */
function exportedNames(src) {
  const out = [];
  for (const m of src.matchAll(EXPORT_LIST_RE)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      out.push({ local: as[0].trim(), exported: (as[1] || as[0]).trim() });
    }
  }
  return out;
}

/** Top-level declarations, used only for the collision check. */
function topLevel(src) {
  const out = new Set();
  const re = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(re)) out.add(m[1]);
  return out;
}

function strip(src) {
  return src
    .replace(IMPORT_RE, '')
    .replace(EXPORT_LIST_RE, '')
    .replace(EXPORT_DECL_RE, '');
}

/* ---- dependency-first walk over the addon graph ---- */
const seen = new Set();
const order = [];
function walk(file) {
  const key = normalize(file);
  if (seen.has(key)) return;
  seen.add(key);
  const src = readFileSync(key, 'utf8');
  IMPORT_RE.lastIndex = 0;
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec === 'three') continue;
    if (!spec.startsWith('.')) throw new Error(`${key}: unsupported bare import "${spec}"`);
    walk(resolve(dirname(key), spec));
  }
  order.push(key);
}
for (const r of ROOTS) walk(join(JSM, r));

/* ---- core ---- */
const coreRaw = readFileSync(join(PKG, 'build', 'three.module.js'), 'utf8');
const coreExports = exportedNames(coreRaw);
if (!coreExports.length) throw new Error('no export list found in three.module.js');
const core = strip(coreRaw);

/* ---- collision handling: the one rule that makes flattening safe ----
   Flattening is only correct while every top-level identifier is unique. Two
   addons genuinely collide with the core (Pass.js declares its own _camera and
   _geometry, which three.module.js also has at top level), and silently letting
   one shadow the other is exactly the class of bug that shows up later as a
   blank screen. Collisions in a module's *private* names are renamed under a
   module-scoped prefix; a collision on an *exported* name is not renameable
   without changing the public surface, so that still fails the build. */
const owner = new Map();
for (const n of topLevel(coreRaw)) owner.set(n, 'three.module.js');

const sources = new Map();
const renames = [];
const fatal = [];

order.forEach((f, idx) => {
  const short = f.slice(JSM.length + 1);
  let src = readFileSync(f, 'utf8');
  const exported = new Set(exportedNames(src).map((e) => e.local));
  // `export function foo` / `export class Bar` are exported under their own name
  for (const m of src.matchAll(/^[ \t]*export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.add(m[1]);
  }

  for (const n of topLevel(src)) {
    if (!owner.has(n)) { owner.set(n, short); continue; }
    if (exported.has(n)) { fatal.push(`${n}: ${owner.get(n)} vs ${short} (exported — cannot rename)`); continue; }
    const to = `_v${idx}_${n.replace(/^_+/, '')}`;
    src = src.replace(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), to);
    owner.set(to, short);
    renames.push(`${n} -> ${to}  (${short}, collides with ${owner.get(n)})`);
  }
  sources.set(f, src);
});

if (fatal.length) {
  console.error('unrenameable top-level collisions:\n  ' + fatal.join('\n  '));
  process.exit(1);
}
if (renames.length) console.log('renamed to avoid shadowing:\n  ' + renames.join('\n  '));

/* ---- namespaces ---- */
const ns = (name, pairs) =>
  `const ${name} = Object.freeze({\n` +
  pairs.map((p) => (p.local === p.exported ? `  ${p.exported},` : `  ${p.exported}: ${p.local},`)).join('\n') +
  `\n});\n`;

const bguFile = order.find((f) => f.endsWith('BufferGeometryUtils.js'));
const bguExports = exportedNames(sources.get(bguFile));

let bundle = '';
bundle += '/* ══════════════════════════════════════════════════════════════════════════\n';
bundle += '   VENDORED: three.js r169 (MIT) + post-processing addons.\n';
bundle += '   Flattened by tools/pso-vendor.mjs so this file runs from file:// with no\n';
bundle += '   network. Do not edit below this banner by hand — re-run the tool.\n';
bundle += '   @license Copyright 2010-2024 three.js Authors · SPDX: MIT\n';
bundle += '   ══════════════════════════════════════════════════════════════════════ */\n';
bundle += core + '\n';
for (const f of order) {
  bundle += `\n/* ── addon: ${f.slice(JSM.length + 1)} ── */\n`;
  bundle += strip(sources.get(f)) + '\n';
}
bundle += '\n/* namespace objects the game module expects */\n';
bundle += ns('THREE', coreExports);
bundle += ns('BGU', bguExports);

/* ---- splice into the HTML ---- */
let html = readFileSync(TARGET, 'utf8');

const IMPORTMAP = /<script type="importmap">[\s\S]*?<\/script>\s*/;
if (!IMPORTMAP.test(html)) {
  console.error('no importmap found — already vendored?');
  process.exit(1);
}
html = html.replace(IMPORTMAP, () => '');

/* Drop the game's own import statements and put the bundle in their place. */
const GAME_IMPORTS =
  /import \* as THREE from 'three';[\s\S]*?import \* as BGU\s+from 'three\/addons\/utils\/BufferGeometryUtils\.js';/;
if (!GAME_IMPORTS.test(html)) {
  console.error('game import block not found');
  process.exit(1);
}
/* Function form, not a string: the vendored source contains $& and $' byte
   sequences, and String.replace would expand those as substitution patterns —
   which silently duplicates the tail of the document. */
html = html.replace(GAME_IMPORTS, () => bundle);

writeFileSync(TARGET, html);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`vendored ${order.length} addons + core`);
console.log(`  bundle   ${kb(bundle.length)}`);
console.log(`  THREE    ${coreExports.length} exports`);
console.log(`  BGU      ${bguExports.length} exports`);
console.log(`  artefact ${kb(html.length)}`);
