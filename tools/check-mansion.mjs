/**
 * Static checks over the mansion source tree, run before every build.
 *
 * Catches, without a browser:
 *   - syntax errors, via `node --check` on each module
 *   - imports that do not resolve to a file on disk
 *   - named imports that the target module does not actually export
 *   - top-level symbol collisions, which the single-file bundler cannot allow
 *     because flattening puts every module in one scope
 *   - accidental `console.log` left in shipping code
 *
 * Usage: node tools/check-mansion.mjs
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mansion', 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const IMPORT_RE = /^import\s+(?:\*\s+as\s+(\w+)|\{([\s\S]*?)\})\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
const TOP_DECL_RE = /^(?:export\s+)?(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;

/** Strip template literals, comments and strings before scanning for code. */
function scrub(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/gs, '``')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const files = walk(SRC);
const problems = [];
const exportsByFile = new Map();
const symbolOwner = new Map();

for (const file of files) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');

  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${rel}: syntax error\n${String(err.stderr || err.message).trim()}`);
    continue;
  }

  const code = scrub(raw);
  const names = new Set();
  EXPORT_DECL_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_DECL_RE.exec(code)) !== null) names.add(m[1]);
  exportsByFile.set(file, names);

  TOP_DECL_RE.lastIndex = 0;
  while ((m = TOP_DECL_RE.exec(code)) !== null) {
    const name = m[1];
    if (symbolOwner.has(name)) {
      problems.push(`duplicate top-level symbol "${name}" in ${rel} (already declared in ${symbolOwner.get(name)})`);
    } else {
      symbolOwner.set(name, rel);
    }
  }

  if (/^\s*console\.(log|debug)\(/m.test(code)) {
    problems.push(`${rel}: console.log left in shipping code`);
  }
}

// Second pass: resolve imports now that every module's exports are known.
for (const file of files) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(raw)) !== null) {
    const [, namespace, named, spec] = m;
    if (spec === 'three') continue;
    if (!spec.startsWith('.')) {
      problems.push(`${rel}: unsupported bare import "${spec}"`);
      continue;
    }
    const target = resolve(dirname(file), spec);
    let exists = true;
    try { statSync(target); } catch { exists = false; }
    if (!exists) {
      problems.push(`${rel}: import "${spec}" does not resolve to a file`);
      continue;
    }
    if (namespace) continue;
    const available = exportsByFile.get(target);
    if (!available) continue;
    for (const piece of named.split(',')) {
      const name = piece.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!available.has(name)) {
        problems.push(`${rel}: imports "${name}" from ${relative(ROOT, target)}, which does not export it`);
      }
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''} found:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.error(`checked ${files.length} modules, ${symbolOwner.size} top-level symbols — clean`);
