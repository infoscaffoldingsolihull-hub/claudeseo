/**
 * Entry point so `node --test tests/pm/` (directory form, as used by `npm test`)
 * runs the whole suite: Node 22's test runner resolves a directory argument to
 * this index, which loads every *.test.js beside it.
 */
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter((n) => n.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(`${here}/${f}`).href);
}
