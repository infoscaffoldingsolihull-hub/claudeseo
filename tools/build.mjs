/**
 * Single-file bundler for the Digital Giza Project Management Simulator.
 *
 * The source is written as plain ES modules so it can be developed and debugged
 * with native browser module loading (see index.html).  For the conference
 * deliverable everything - including the vendored three.js build - is flattened
 * into ONE self-contained .html file that runs from file:// with no server,
 * no network and no build step.
 *
 * The bundler is deliberately tiny because the source obeys a strict subset of
 * ESM:
 *   - named imports only, one statement per line, from relative './x.js' paths
 *   - `import * as THREE from 'three'` is the only bare specifier
 *   - named exports only (no default, no re-export, no dynamic import)
 *   - every top-level identifier is unique across the whole source tree
 * A collision check enforces the last rule so the flattening can never silently
 * shadow a symbol.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const THREE_PATH = resolve(ROOT, 'assets/vendor/three.module.js');
const OUT = resolve(ROOT, 'dist/GizaDigitalTwin.html');

/**
 * Matches a whole import statement, including the multi-line brace form:
 *   import { a, b } from './x.js';
 *   import {
 *     a, b,
 *   } from './x.js';
 *   import * as THREE from 'three';
 */
const IMPORT_RE = /^import\s+(?:\*\s+as\s+\w+|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_RE = /^export\s+(const|let|var|function|async function|class)\s/;
/** Standalone re-export lists: `export { A, B };` — dropped entirely. */
const EXPORT_LIST_RE = /^export\s*\{[^}]*\}\s*;?[ \t]*$/gm;

/** Depth-first module graph walk producing dependency-first ordering. */
function collect(file, seen, order) {
  const key = resolve(file);
  if (seen.has(key)) return;
  seen.add(key);
  const src = readFileSync(key, 'utf8');
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    if (spec === 'three') continue;
    if (!spec.startsWith('.')) throw new Error(`${key}: unsupported bare import "${spec}"`);
    collect(resolve(dirname(key), spec), seen, order);
  }
  order.push(key);
}

/** Strip import statements and the `export ` keyword from a module. */
function flatten(file) {
  const src = readFileSync(file, 'utf8');
  IMPORT_RE.lastIndex = 0;
  // Replace each import with the same number of newlines so stack traces from
  // the bundle still line up roughly with the source file.
  const stripped = src
    .replace(IMPORT_RE, (match) => match.split('\n').map(() => '').join('\n'))
    .replace(EXPORT_LIST_RE, '');
  return stripped
    .split('\n')
    .map((line) => line.replace(EXPORT_RE, '$1 '))
    .join('\n');
}

/**
 * Collect top-level declaration names so duplicates fail the build loudly.
 * Template literals (which hold GLSL) and comments are stripped first so
 * `const float x` inside a shader is never mistaken for a JS declaration.
 */
function topLevelNames(source) {
  const code = source
    .replace(/`(?:\\.|[^`\\])*`/gs, '``')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const names = [];
  const re = /^(?:export\s+)?(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code)) !== null) names.push(m[1]);
  return names;
}

function buildThreePrelude() {
  const src = readFileSync(THREE_PATH, 'utf8');
  const idx = src.lastIndexOf('\nexport {');
  if (idx === -1) throw new Error('three.module.js: could not locate the export block');
  const body = src.slice(0, idx);
  const exportBlock = src.slice(idx).replace('\nexport {', () => '\nconst THREE = {');
  return body + exportBlock;
}

function humanSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function main() {
  const order = [];
  collect(ENTRY, new Set(), order);

  const seenNames = new Map();
  const modules = order.map((file) => {
    const rel = relative(ROOT, file);
    const raw = readFileSync(file, 'utf8');
    for (const name of topLevelNames(raw)) {
      if (seenNames.has(name)) {
        throw new Error(`duplicate top-level symbol "${name}" in ${rel} (already in ${seenNames.get(name)})`);
      }
      seenNames.set(name, rel);
    }
    return { rel, code: flatten(file) };
  });

  const css = readFileSync(resolve(ROOT, 'src/ui/styles.css'), 'utf8');
  const shell = readFileSync(resolve(ROOT, 'src/shell.html'), 'utf8');

  const bundle = [
    '(function () {',
    "'use strict';",
    '/* ---- three.js r160 (MIT) - vendored, see assets/vendor/THREE-LICENSE.txt ---- */',
    buildThreePrelude(),
    ...modules.map((m) => `/* ================= ${m.rel} ================= */\n${m.code}`),
    '})();',
  ].join('\n');

  // NOTE: string replacements would interpret `$'` / `$&` inside the bundle as
  // replacement patterns (three.js contains a literal `+ '$'`), so every
  // substitution below uses a function replacer.
  const html = shell
    .replace('<!--STYLES-->', () => `<style>\n${css}\n</style>`)
    .replace('<!--SCRIPT-->', () => `<script>\n${bundle}\n</script>`);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html, 'utf8');

  // Development entry point: native ES modules, served over http://
  const devHtml = shell
    .replace('<!--STYLES-->', () => '<link rel="stylesheet" href="./src/ui/styles.css">')
    .replace(
      '<!--SCRIPT-->',
      () => '<script type="importmap">\n' +
        JSON.stringify({ imports: { three: './assets/vendor/three.module.js' } }, null, 2) +
        '\n</scr' + 'ipt>\n<script type="module" src="./src/main.js"></scr' + 'ipt>'
    );
  writeFileSync(resolve(ROOT, 'index.html'), devHtml, 'utf8');

  console.log(`modules bundled : ${modules.length}`);
  console.log(`top-level syms  : ${seenNames.size}`);
  console.log(`output          : ${relative(ROOT, OUT)}  (${humanSize(statSync(OUT).size)})`);
}

main();
