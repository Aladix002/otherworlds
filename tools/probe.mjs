#!/usr/bin/env node
// node tools/probe.mjs <id> [--at 0,10,20] [--quality medium] — GPU ms (full res, scale 1) at fly-through times. Takes the perf lock.
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ROOT, launch, openWorld, parseArgs } from './lib/browser.mjs';
const args = parseArgs(process.argv.slice(2));
const id = args._[0];
mkdirSync(join(ROOT, 'perf'), { recursive: true });
if (!process.env.OW_PERF_LOCKED) {
  const r = spawnSync('flock', [join(ROOT, 'perf/.lock'), process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, OW_PERF_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}
const { browser, close } = await launch();
try {
  const { page, info } = await openWorld(browser, id, { bench: 1, scale: 1, quality: args.quality || 'medium', ...Object.fromEntries(new URLSearchParams(args.params || '')) });
  const at = (args.at ? String(args.at).split(',').map(Number) : Array.from({ length: 13 }, (_, i) => i * info.flythroughDuration / 12));
  for (const s of at) {
    const ms = await page.evaluate(async (s) => { window.__ow.flyAt(s); await window.__ow.frames(40); return window.__ow.stats().gpuNow; }, s);
    console.log(`t=${s.toFixed(1).padStart(5)}s  gpu ${ms.toFixed(2)} ms`);
  }
} finally { await close(); }
