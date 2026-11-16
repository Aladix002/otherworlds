#!/usr/bin/env node
// Build the public site: node tools/release.mjs
//   Builds from the last COMMITTED state (git HEAD) in a temporary worktree, so half-finished,
//   uncommitted edits in worlds/ never reach the public site.
//   Reads release.json { released: [ids] } and writes /site/<id>.html + /site/index.html.
//   Doors and the Esc menu only lead to released worlds; unreleased ones show as "coming soon".
import { readFileSync, rmSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const inner = args.includes('--inner');

if (!inner) {
  const tree = join(ROOT, '.release-tree');
  const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { stdio: 'pipe' }).toString().trim();
  try { git('worktree', 'remove', '--force', tree); } catch (_) { /* not there */ }
  rmSync(tree, { recursive: true, force: true });
  git('worktree', 'add', '--detach', tree, 'HEAD');
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'));
    // release.json is read from the working copy so you can publish without committing it first
    execFileSync(process.execPath, [join(tree, 'tools/release.mjs'), '--inner', '--out', join(ROOT, 'site'), '--list', join(ROOT, 'release.json')], { stdio: 'inherit' });
    console.log(`built from commit ${git('rev-parse', '--short', 'HEAD')}`);
  } finally {
    try { git('worktree', 'remove', '--force', tree); } catch (_) { rmSync(tree, { recursive: true, force: true }); }
  }
} else {
  const out = resolve(args[args.indexOf('--out') + 1]);
  const list = resolve(args[args.indexOf('--list') + 1]);
  const { buildWorld, buildIndex } = await import('./build.mjs');
  const { released } = JSON.parse(readFileSync(list, 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const built = [];
  for (const id of released) {
    if (!existsSync(join(ROOT, 'worlds', id, 'world.js'))) { console.warn(`skip ${id}: not committed yet`); continue; }
    built.push(await buildWorld(id, { released, outDir: out }));
  }
  await buildIndex(built, { outDir: out, released });
  console.log(`site/: ${built.length} worlds`);
}
