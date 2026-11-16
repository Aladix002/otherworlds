#!/usr/bin/env node
// node tools/perf.mjs <id> [--quality medium] [--no-build] [--warmup 3]
// Runs the world's scripted fly-through (60 s by default) at 1920x1080 with GPU timestamp queries and writes
// perf/<id>.json. Then probes spawn and every door (closed/open/near/far) at scale 1 and reports the GPU ms there (`doors` in
// the JSON, WARN line if > 16.7 ms; not part of the gate). Takes an exclusive lock on perf/.lock (flock) so parallel runs on the shared GPU never overlap.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openWorld, parseArgs, wgslErrors } from './lib/browser.mjs';
import { buildWorld } from './build.mjs';

const GATE = { avgGpuMs: 12, p99GpuMs: 16.7, minScale: 0.6 };
const args = parseArgs(process.argv.slice(2));
const id = args._[0];
if (!id) { console.error('usage: node tools/perf.mjs <id> [--quality low|medium|high] [--no-build]'); process.exit(2); }
const perfDir = join(ROOT, 'perf');
mkdirSync(perfDir, { recursive: true });
const lock = join(perfDir, '.lock');

if (!process.env.OW_PERF_LOCKED) {
  const probe = spawnSync('flock', ['-n', lock, 'true']);
  if (probe.status !== 0) console.log('perf: GPU is busy (another perf run holds perf/.lock), waiting…');
  const r = spawnSync('flock', [lock, process.execPath, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, OW_PERF_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const quality = args.quality || 'medium';
const extra = Object.fromEntries(new URLSearchParams(args.params || ''));
async function main() {
  if (!args['no-build']) await buildWorld(id, {});
  const { browser, close } = await launch();
  let res, logs = [];
  try {
    const { page, info, logs: L, adapter } = await openWorld(browser, id, { bench: 1, quality, ...extra });
    logs = L;
    if (!info.timestamps) throw new Error('timestamp-query not available; cannot measure GPU time');
    console.log(`${id}: adapter ${adapter}, quality ${info.quality}, output ${info.output.join('x')}, fly-through ${info.flythroughDuration}s`);
    await page.evaluate((s) => new Promise((r) => setTimeout(r, s * 1000)), +(args.warmup ?? 3));
    await page.evaluate(() => window.__ow.startFlythrough());
    res = await page.evaluate((s) => window.__ow.stats(s), !!args.series);
    res.adapterString = adapter;
    // door probes: GPU ms at full resolution (scale pinned to 1) looking at each door, closed / open / close-up open.
    // The fly-through may never pass the door, so a heavy door area would otherwise go unnoticed.
    res.doors = await page.evaluate(async () => {
      const ow = window.__ow, out = [];
      ow.setScale(1, true);
      const ms = async () => { await ow.frames(45); return +ow.stats().gpuNow.toFixed(2); };
      for (let i = 0; i < ow.ctx.doors.length; i++) {
        const r = { door: i, to: ow.ctx.doors[i].to };
        ow.door(i, 0); ow.doorView(i, 3.2); r.closed = await ms();
        ow.door(i, 1); r.open = await ms();
        ow.doorView(i, 1.2, 1.5); r.near = await ms();
        ow.doorView(i, 6, 1.7, 0.6); r.far = await ms();
        ow.door(i, 0); out.push(r);
      }
      if (ow.spawnView) { ow.spawnView(); out.push({ spawn: await ms() }); }   // (older builds lack spawnView)
      return out;
    }).catch((e) => { console.error('door probe failed: ' + e.message); return []; });
  } finally { await close(); }
  const g = res.gpu;
  res.gate = GATE;
  res.pass = g.avg <= GATE.avgGpuMs && g.p99 <= GATE.p99GpuMs && res.scale.min >= GATE.minScale - 1e-6;
  res.date = new Date().toISOString();
  res.consoleErrors = wgslErrors(logs).slice(0, 20);
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const k of ['gpu', 'cpu', 'frame', 'scale']) for (const f of ['avg', 'p50', 'p99', 'max']) res[k][f] = r2(res[k][f]);
  const file = join(perfDir, `${id}${quality !== 'medium' ? '-' + quality : ''}.json`);
  writeFileSync(file, JSON.stringify(res, null, 1));
  console.log(`GPU ms  avg ${g.avg}  p50 ${g.p50}  p99 ${g.p99}  max ${g.max}  (${g.n} frames)`);
  console.log(`CPU ms  avg ${res.cpu.avg}  p99 ${res.cpu.p99}   frame interval avg ${res.frame.avg} p99 ${res.frame.p99}`);
  console.log(`scale   avg ${res.scale.avg}  min ${res.scale.min ?? '-'}  max ${res.scale.max}  final ${r2(res.scale.current)}`);
  const dmax = Math.max(0, ...res.doors.flatMap((d) => [d.spawn, d.closed, d.open, d.near, d.far].filter((v) => v !== undefined)));
  res.doorMaxMs = dmax; res.doorHeavy = dmax > GATE.p99GpuMs;
  for (const d of res.doors) console.log(d.spawn !== undefined ? `spawn   ${d.spawn} ms at scale 1` : `door ${d.door}  closed ${d.closed}  open ${d.open}  near ${d.near}  far ${d.far} ms at scale 1 (-> ${d.to})`);
  if (res.doorHeavy) console.log(`WARN: ${dmax} ms at scale 1 near a door/spawn (> ${GATE.p99GpuMs} ms): dynamic resolution will drop there; lighten that area`);
  console.log(`${res.pass ? 'PASS' : 'FAIL'} (gate: avg <= ${GATE.avgGpuMs} ms, p99 <= ${GATE.p99GpuMs} ms at 1920x1080, scale floor ${GATE.minScale})  -> ${file}`);
  if (res.consoleErrors.length) console.error('console errors:\n' + res.consoleErrors.join('\n'));
  process.exit(res.pass ? 0 : 1);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
