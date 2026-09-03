#!/usr/bin/env node
/**
 * AEON SPIRE — single-file build.
 *
 * Inlines every ES module (including the vendored three.js) into one
 * self-contained HTML file that runs from `file://` with no server, no
 * network and no build step at the far end. That matters for an academic
 * submission: the marker double-clicks one file.
 *
 * The bundler is a small topological inliner rather than a real toolchain,
 * because the project deliberately has exactly one dependency and a flat,
 * cycle-free module graph.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'AeonSpire.html');

/* ------------------------------------------------------------------ */
/* Module graph                                                        */
/* ------------------------------------------------------------------ */

const IMPORT_RE = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
const BARE_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
/* `export { a, b as c } from './mod.js'` — a re-export, which is how the
   vendored three.js stitches three.module.js to three.core.js. It must be
   matched before the plain export-list form, which it would otherwise
   partially match. */
const REEXPORT_RE = /^[ \t]*export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_STAR_RE = /^[ \t]*export\s*\*\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

const modules = new Map();   // absolute path → { src, deps, id }
let nextId = 0;

/** Resolve a specifier relative to the importing file. */
function resolve(spec, fromFile) {
  if (spec === 'three') return path.join(ROOT, 'assets/vendor/three.module.js');
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  throw new Error(`Cannot bundle bare specifier "${spec}" from ${path.relative(ROOT, fromFile)}`);
}

function load(file) {
  if (modules.has(file)) return modules.get(file);
  if (!fs.existsSync(file)) throw new Error('Missing module: ' + file);
  const src = fs.readFileSync(file, 'utf8');
  const mod = { file, src, deps: [], id: 'M' + (nextId++), imports: [] };
  modules.set(file, mod);

  let m;

  /* Re-exports are found first and recorded, so the plain export-list scan
     in wrap() cannot mistake them for local exports. */
  mod.reexports = [];
  REEXPORT_RE.lastIndex = 0;
  while ((m = REEXPORT_RE.exec(src))) {
    const target = resolve(m[2], file);
    mod.reexports.push({ names: m[1], target, raw: m[0] });
    mod.deps.push(target);
  }
  EXPORT_STAR_RE.lastIndex = 0;
  while ((m = EXPORT_STAR_RE.exec(src))) {
    const target = resolve(m[1], file);
    mod.reexports.push({ names: '*', target, raw: m[0] });
    mod.deps.push(target);
  }

  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    // An import clause never contains a brace-to-'from' re-export, but the
    // greedy [\s\S]*? could span one; skip anything already claimed.
    if (mod.reexports.some(r => r.raw === m[0])) continue;
    const target = resolve(m[2], file);
    mod.imports.push({ clause: m[1].trim(), target, raw: m[0] });
    mod.deps.push(target);
  }
  BARE_IMPORT_RE.lastIndex = 0;
  while ((m = BARE_IMPORT_RE.exec(src))) {
    const target = resolve(m[1], file);
    mod.deps.push(target);
  }
  for (const d of new Set(mod.deps)) load(d);
  return mod;
}

/** Depth-first post-order, so a module is emitted after everything it needs. */
function order(entry) {
  const out = [];
  const seen = new Set();
  const stack = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    if (stack.has(file)) {
      throw new Error('Import cycle through ' + path.relative(ROOT, file));
    }
    stack.add(file);
    for (const d of modules.get(file).deps) visit(d);
    stack.delete(file);
    seen.add(file);
    out.push(file);
  };
  visit(entry);
  return out;
}

/* ------------------------------------------------------------------ */
/* Rewriting                                                           */
/* ------------------------------------------------------------------ */

/**
 * Turn a module into an IIFE that returns its namespace object, and rewrite
 * its imports into destructuring from the namespaces already built.
 */
function wrap(mod) {
  let src = mod.src;

  /* Collect the names this module exports. */
  const named = new Set();
  const spreads = [];
  let m;

  /* --- Re-exports first: rewrite them into destructuring from the dep. --- */
  for (const re of mod.reexports) {
    const depId = modules.get(re.target).id;
    if (re.names === '*') {
      src = src.replace(re.raw, '');
      spreads.push(depId);
      continue;
    }
    const pairs = [];
    for (const part of re.names.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      const local = as[0].trim();
      const exported = (as[1] || as[0]).trim();
      pairs.push(local === exported ? local : `${local}: ${exported}`);
      named.add(exported);
    }
    src = src.replace(re.raw, pairs.length ? `const { ${pairs.join(', ')} } = ${depId};` : '');
  }

  const declRe = /^\s*export\s+(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = declRe.exec(src))) named.add(m[2]);

  const listRe = EXPORT_LIST_RE;
  listRe.lastIndex = 0;
  const listExports = [];
  while ((m = listRe.exec(src))) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      const local = as[0].trim();
      const exported = (as[1] || as[0]).trim();
      named.add(exported);
      listExports.push({ local, exported });
    }
  }

  /* Replace import statements with destructuring from the dep namespaces. */
  for (const imp of mod.imports) {
    const depId = modules.get(imp.target).id;
    let replacement = '';
    const clause = imp.clause;
    const nsMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (nsMatch) {
      replacement = `const ${nsMatch[1]} = ${depId};`;
    } else {
      // Split "Default, { a, b as c }" into its parts.
      const braceStart = clause.indexOf('{');
      const defaultPart = (braceStart >= 0 ? clause.slice(0, braceStart) : clause)
        .replace(/,\s*$/, '').trim();
      const bracePart = braceStart >= 0 ? clause.slice(braceStart) : '';
      const bits = [];
      if (defaultPart) bits.push(`const ${defaultPart} = ${depId}.default;`);
      if (bracePart) {
        const inner = bracePart.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        const pairs = inner.map(s => {
          const as = s.split(/\s+as\s+/);
          return as.length > 1 ? `${as[0].trim()}: ${as[1].trim()}` : as[0].trim();
        });
        bits.push(`const { ${pairs.join(', ')} } = ${depId};`);
      }
      replacement = bits.join(' ');
    }
    src = src.replace(imp.raw, replacement + '\n');
  }
  src = src.replace(BARE_IMPORT_RE, '');

  /* Strip the export keyword from declarations and drop export lists. */
  src = src.replace(/^(\s*)export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\s)/gm, '$1');
  listRe.lastIndex = 0;
  src = src.replace(listRe, '');
  src = src.replace(/^\s*export\s+default\s+/gm, 'const __default = ');

  const returnBits = [...named].map(n => `${n}`);
  for (const e of listExports) {
    const i = returnBits.indexOf(e.exported);
    if (i >= 0) returnBits[i] = e.exported === e.local ? e.exported : `${e.exported}: ${e.local}`;
  }

  const spreadBits = spreads.map(id => `...${id}`);
  const ns = [...spreadBits, ...returnBits].join(', ');
  return `/* ${path.relative(ROOT, mod.file)} */\nconst ${mod.id} = (() => {\n${src}\nreturn { ${ns} };\n})();`;
}

/* ------------------------------------------------------------------ */

console.log('AEON SPIRE — building single-file distribution…');

const entry = path.join(ROOT, 'src/main.js');
load(entry);
const files = order(entry);
console.log(`  ${files.length} modules in the graph`);

const chunks = files.map(f => wrap(modules.get(f)));
const bundle = chunks.join('\n\n');

/* The page shell: index.html with its module bootstrap replaced by the
   inlined bundle, so the single file needs no import map and no network. */
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const bootStart = html.indexOf('<script>\n/* ------------------------------------------------------------------');
const bootEnd = html.lastIndexOf('</script>');
if (bootStart < 0 || bootEnd < 0) throw new Error('Could not locate the bootstrap script in index.html');

const replacement =
  '<script>\n' +
  '/* AEON SPIRE — single-file build. Every module, including three.js r185,\n' +
  '   is inlined below. No network access and no server are required. */\n' +
  'window.AEON_THREE_SOURCE = "inlined";\n' +
  'window.AEON_THREE_VERSION = "0.185.1";\n' +
  '(function () {\n' +
  '  var bootEl = document.getElementById("boot");\n' +
  '  var barEl = document.querySelector("#bar > i");\n' +
  '  var msgEl = document.getElementById("bootmsg");\n' +
  '  window.AEON_BOOT = {\n' +
  '    progress: function (f, m) {\n' +
  '      if (barEl) barEl.style.width = Math.max(0, Math.min(1, f)) * 100 + "%";\n' +
  '      if (m && msgEl) msgEl.textContent = m;\n' +
  '    },\n' +
  '    done: function () { if (bootEl) bootEl.classList.add("done"); },\n' +
  '    fail: fail\n' +
  '  };\n' +
  '  function fail(message, detail) {\n' +
  '    var f = document.getElementById("fatal");\n' +
  '    document.getElementById("fatalmsg").textContent = message || "An unexpected error occurred.";\n' +
  '    document.getElementById("fataldetail").textContent =\n' +
  '      (detail && (detail.stack || detail.message || String(detail))) || "";\n' +
  '    f.classList.add("show");\n' +
  '    if (bootEl) bootEl.classList.add("done");\n' +
  '    window.AEON_FATAL = message;\n' +
  '  }\n' +
  '  window.addEventListener("error", function (e) {\n' +
  '    if (!window.AEON_STARTED) fail("Startup failed: " + (e.message || "script error"), e.error);\n' +
  '  });\n' +
  '})();\n' +
  '</script>\n' +
  '<script type="module">\n' + bundle + '\n</script>';

html = html.slice(0, bootStart) + replacement + html.slice(bootEnd + '</script>'.length);

/* The fatal-error panel's advice about servers does not apply to this build. */
html = html.replace(
  /<p>This build needs a browser[\s\S]*?<\/p>/,
  '<p>This build needs a browser with <b>WebGL 2</b> — Chrome, Edge, Firefox, or Safari 15 or newer. ' +
  'Everything else it needs is already inside this file.</p>'
);
html = html.replace(
  '<title>AEON SPIRE — City of Wonders</title>',
  '<title>AEON SPIRE — City of Wonders (single-file build)</title>'
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`  → ${path.relative(ROOT, OUT)}  (${kb} KB)`);
console.log('  Open it directly in a browser — no server needed.');
