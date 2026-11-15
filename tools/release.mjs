#!/usr/bin/env node
// Build the public site: node tools/release.mjs
//   Reads /release.json { released: [ids] } and writes /site/<id>.html + /site/index.html.
//   Doors and the Esc menu only lead to released worlds; unreleased ones show as "čoskoro".
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld, buildIndex } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const { released } = JSON.parse(readFileSync(join(ROOT, 'release.json'), 'utf8'));
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
const built = [];
for (const id of released) built.push(await buildWorld(id, { released, outDir: SITE }));
await buildIndex(built, { outDir: SITE, released });
console.log(`site/: ${built.length} worlds`);
