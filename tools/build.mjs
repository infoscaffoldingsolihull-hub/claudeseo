/**
 * Single-file bundler for SKY GATEWAY HYDERABAD.
 *
 * Source is plain ES modules (developed natively via `npm run serve`). For the
 * deliverable everything — three.js, every module, every JSON data file and the
 * stylesheet — is flattened into ONE html file that runs from file:// offline.
 *
 * Unlike the benchmark's flat concatenation, each module is wrapped in its own
 * function scope and returns its exports, so modules written by different
 * agents can never collide on a top-level name.
 *
 * Supported source subset (enforced; the build fails loudly otherwise):
 *   import * as THREE from 'three';
 *   import { a, b as c } from './x.js';            (may span lines)
 *   import NAME from './x.json' with { type: 'json' };
 *   export const|let|var|function|async function|class NAME
 *   export { a, b as c };
 * No default exports of JS, no re-exports from other modules, no dynamic import.
 *
 * Usage: node tools/build.mjs [--out path/to/file.html]
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const THREE_PATH = resolve(ROOT, 'assets/vendor/three.module.js');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? resolve(args[outIdx + 1]) : resolve(ROOT, 'dist/Hyderabad_Airport_PM_Simulator.html');
const CSS_FILES = ['src/styles/main.css', 'src/styles/panels.css', 'src/styles/panels2.css', 'src/styles/hud.css', 'src/styles/chat.css'];

const IMPORT_RE = /^import\s+(\*\s+as\s+\w+|\{[\s\S]*?\}|\w+)\s+from\s+['"]([^'"]+)['"](\s+(?:with|assert)\s*\{[^}]*\})?\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(const|let|var|function\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

function stripCommentsAndStrings(src) {
  return src
    .replace(/`(?:\\.|[^`\\])*`/gs, '``')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const modules = new Map(); // abs path -> { id, deps, kind }
const order = [];

function collect(file, stack = []) {
  const key = resolve(file);
  if (modules.has(key)) return;
  if (stack.includes(key)) throw new Error(`import cycle: ${[...stack, key].map((p) => relative(ROOT, p)).join(' -> ')}`);
  const isJson = key.endsWith('.json');
  const entry = { id: `__m${modules.size}`, deps: [], kind: isJson ? 'json' : 'js', src: readFileSync(key, 'utf8') };
  modules.set(key, entry);
  if (!isJson) {
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(entry.src)) !== null) {
      const spec = m[2];
      if (spec === 'three') continue;
      if (!spec.startsWith('.')) throw new Error(`${relative(ROOT, key)}: unsupported bare import "${spec}"`);
      const dep = resolve(dirname(key), spec);
      entry.deps.push(dep);
      collect(dep, [...stack, key]);
    }
    if (/^\s*export\s+default\b/m.test(entry.src)) throw new Error(`${relative(ROOT, key)}: default exports are not supported`);
    if (/^\s*export\s*\*|^\s*export\s*\{[^}]*\}\s*from/m.test(entry.src)) throw new Error(`${relative(ROOT, key)}: re-exports are not supported`);
    if (/\bimport\s*\(/.test(stripCommentsAndStrings(entry.src))) throw new Error(`${relative(ROOT, key)}: dynamic import() is not supported`);
  }
  order.push(key);
}

function transform(file) {
  const entry = modules.get(file);
  if (entry.kind === 'json') {
    JSON.parse(entry.src); // validate
    return `const ${entry.id} = { default: ${entry.src.trim()} };`;
  }
  const exportsList = [];
  let code = entry.src.replace(IMPORT_RE, (match, what, spec) => {
    const lines = match.split('\n').length;
    const pad = '\n'.repeat(lines - 1);
    if (spec === 'three') return `const ${what.replace(/\*\s+as\s+/, '').trim()} = __THREE;${pad}`;
    const dep = modules.get(resolve(dirname(file), spec));
    if (what.startsWith('{')) {
      const names = what.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${names.join(', ')} } = ${dep.id};${pad}`;
    }
    if (dep.kind !== 'json') throw new Error(`${relative(ROOT, file)}: default import of JS module "${spec}"`);
    return `const ${what} = ${dep.id}.default;${pad}`;
  });
  code = code.replace(EXPORT_LIST_RE, (match, list) => {
    for (const part of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [local, exported] = part.split(/\s+as\s+/).map((s) => s.trim());
      exportsList.push(`${exported || local}: ${local}`);
    }
    return '';
  });
  code = code.replace(EXPORT_DECL_RE, (match, kind, name) => {
    exportsList.push(name);
    return match.replace(/^export\s+/, '');
  });
  const getters = exportsList.map((e) => {
    const [k, v] = e.includes(':') ? e.split(':').map((s) => s.trim()) : [e, e];
    return `get ${k}() { return ${v}; }`;
  });
  return `const ${entry.id} = (function () {\n'use strict';\n${code}\nreturn { ${getters.join(', ')} };\n})();`;
}

function buildThreePrelude() {
  const src = readFileSync(THREE_PATH, 'utf8');
  const idx = src.lastIndexOf('\nexport {');
  if (idx === -1) throw new Error('three.module.js: could not locate the export block');
  return src.slice(0, idx) + src.slice(idx).replace('\nexport {', () => '\nconst __THREE = {');
}

function main() {
  collect(ENTRY);
  const parts = order.map((file) => `/* ===== ${relative(ROOT, file)} ===== */\n${transform(file)}`);
  const css = CSS_FILES.map((f) => {
    try { return `/* ${f} */\n${readFileSync(resolve(ROOT, f), 'utf8')}`; } catch { return ''; }
  }).join('\n');
  const shell = readFileSync(resolve(ROOT, 'src/shell.html'), 'utf8');
  const licence = readFileSync(resolve(ROOT, 'assets/vendor/THREE-LICENSE.txt'), 'utf8').replace(/\*\//g, '* /');
  const bundle = [
    '(function () {',
    "'use strict';",
    `/* ---- three.js r160 — MIT licence ----\n${licence}\n*/`,
    buildThreePrelude(),
    ...parts,
    '})();',
  ].join('\n');
  // Function replacers: the bundle contains literal `$'` sequences.
  const html = shell
    .replace('<!--STYLES-->', () => `<style>\n${css}\n</style>`)
    .replace('<!--SCRIPT-->', () => `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html, 'utf8');

  if (outIdx === -1) {
    const devHtml = shell
      .replace('<!--STYLES-->', () => CSS_FILES.map((f) => `<link rel="stylesheet" href="./${f}">`).join('\n'))
      .replace('<!--SCRIPT-->', () => '<script type="importmap">\n' +
        JSON.stringify({ imports: { three: './assets/vendor/three.module.js' } }, null, 2) +
        '\n</scr' + 'ipt>\n<script type="module" src="./src/main.js"></scr' + 'ipt>');
    writeFileSync(resolve(ROOT, 'index.html'), devHtml, 'utf8');
  }
  const size = statSync(OUT).size;
  console.log(`modules bundled : ${order.length}`);
  console.log(`output          : ${relative(ROOT, OUT) || OUT}  (${(size / 1048576).toFixed(2)} MB)`);
  if (size > 8 * 1048576) {
    console.error('FAIL: bundle exceeds the 8 MB budget');
    process.exit(1);
  }
}

main();
