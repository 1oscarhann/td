#!/usr/bin/env node
/**
 * Check route JSON files before the game loads them.
 *
 *   node tools/validate-route.mjs public/data/routes            # every .json in a folder
 *   node tools/validate-route.mjs public/data/routes/test-track.json
 *
 * Uses the same validator as the game, so if this passes the game will load it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateRoute } from '../src/route/validate.js';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node tools/validate-route.mjs <file-or-folder> [...]');
  process.exit(2);
}

/** Route files: *.json directly in a folder, or route.json in its subfolders. */
const findRoutes = (/** @type {string} */ dir) =>
  readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    if (statSync(path).isDirectory()) return readdirSync(path).includes('route.json') ? [join(path, 'route.json')] : [];
    return f.endsWith('.json') ? [path] : [];
  });
const files = targets.flatMap((t) => (statSync(t).isDirectory() ? findRoutes(t) : [t]));

let failed = 0;
for (const file of files) {
  let problems;
  try {
    problems = validateRoute(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    problems = [`not valid JSON: ${err.message}`];
  }
  if (problems.length === 0) {
    console.log(`✓ ${file}`);
  } else {
    failed++;
    console.log(`✗ ${file}`);
    for (const p of problems) console.log(`    - ${p}`);
  }
}
process.exit(failed ? 1 : 0);
