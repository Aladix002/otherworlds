#!/usr/bin/env node
// node tools/shoot.mjs <id> [--quality medium] [--no-build] [--params "movement=fly&x=1"] [--t 10]
// node tools/shoot.mjs <id> ... [--motion-at 0.3] [--motion-step 0.2]
// Writes shots/<id>/pose-0..5.png (1920x1080, deterministic time), door-*.png, motion-00..23.png (ONE continuous
// fly-through window: 24 frames, 0.2 s apart = 4.6 s, starting at 30 % of the fly-through), sheet.png (contact sheet)
// and console.txt. Safe to run in parallel with other shoots.
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, launch, openWorld, parseArgs, wgslErrors } from './lib/browser.mjs';
import { buildWorld } from './build.mjs';

const args = parseArgs(process.argv.slice(2));
const id = args._[0];
if (!id) { console.error('usage: node tools/shoot.mjs <id> [--quality low|medium|high] [--no-build] [--params "k=v&k2=v2"]'); process.exit(2); }
const quality = args.quality || 'medium';
const extra = Object.fromEntries(new URLSearchParams(args.params || ''));
const outDir = join(ROOT, 'shots', id);

async function main() {
  if (!args['no-build']) await buildWorld(id, {});
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^(pose|motion|door)-.*\.png$|^sheet\.png$/.test(f)) rmSync(join(outDir, f));
  const { browser, close } = await launch();
  let logs = [];
  try {
    const { page, info, logs: L, adapter } = await openWorld(browser, id, { shot: 1, quality, ...extra });
    logs = L;
    console.log(`${id}: adapter ${adapter}, ${info.poses} poses, quality ${info.quality}, output ${info.output.join('x')}`);
    const nPoses = Math.max(1, info.poses);
    for (let i = 0; i < nPoses; i++) {
      const t = await page.evaluate((i) => { const w = window.__ow.ctx.world; return (w.poses && w.poses[i] && w.poses[i].t) ?? 10; }, i);
      await page.evaluate((i) => window.__ow.setPose(i), i);
      await page.evaluate((t) => window.__ow.settle(t, 2), +(args.t ?? t));
      await page.evaluate(() => window.__ow.frames(3));
      await page.screenshot({ path: join(outDir, `pose-${i}.png`) });
    }
    // door shots: closed, open (postcard visible), stepping through (overlay), arrival dissolve
    const hasDoor = await page.evaluate(() => window.__ow.doorView(0, 3.2));
    if (hasDoor) {
      const shot = async (name, fn) => { await page.evaluate(fn); await page.evaluate(() => window.__ow.frames(3)); await page.screenshot({ path: join(outDir, `door-${name}.png`) }); };
      await page.evaluate(() => { window.__ow.door(0, 0); return window.__ow.settle(10, 1); });
      await shot('closed', () => {});
      await shot('side', () => window.__ow.doorView(0, 2.6, 1.4, 0.95));
      await shot('back', () => window.__ow.doorView(0, 2.8, 1.5, Math.PI));
      await shot('open', () => { window.__ow.doorView(0, 3.2); window.__ow.door(0, 1); });
      await shot('open-side', () => window.__ow.doorView(0, 3.4, 1.6, 0.7));
      await shot('near', () => { window.__ow.doorView(0, 0.9, 1.5); });
      // mid walk-through, with the overlay alpha the real exit transition has at that distance
      await shot('through', () => { window.__ow.through(0, 0.35, 1.5); });
      // arrival dissolve as a player sees it: at the spawn pose/yaw, once this world's own postcard pipeline has compiled
      await shot('arrival', async () => {
        window.__ow.transition(0); window.__ow.door(0, 0); window.__ow.spawnView();
        const ok = await window.__ow.arrival(0.55);
        if (!ok) console.error('door-arrival: postcard pipeline not ready');
      });
      await page.evaluate(() => { window.__ow.arrival(0); });
    }
    // motion: one continuous window of the fly-through (no cuts): 24 frames, `step` s apart, simulated at 30 fps in between
    const dur = info.flythroughDuration;
    const step = Math.max(1 / 30, +(args['motion-step'] ?? 0.2)), sub = Math.max(1, Math.round(step * 30));
    const s0 = Math.max(0, Math.min(dur - 23 * step, dur * +(args['motion-at'] ?? 0.3)));
    await page.evaluate((s) => { window.__ow.flyAt(s); return window.__ow.settle(s, 1); }, s0);
    for (let k = 0; k < 24; k++) {
      if (k) await page.evaluate(async (a, b, n) => {
        for (let i = 1; i <= n; i++) { const s = a + (b - a) * i / n; window.__ow.flyAt(s); window.__ow.setTime(s); await window.__ow.frames(1); }
      }, s0 + (k - 1) * step, s0 + k * step, sub);
      await page.evaluate(() => window.__ow.frames(1));
      await page.screenshot({ path: join(outDir, `motion-${String(k).padStart(2, '0')}.png`) });
    }
    console.log(`motion: fly-through ${s0.toFixed(1)}–${(s0 + 23 * step).toFixed(1)} s of ${dur} s, continuous, ${step} s between frames`);
  } finally {
    await close();
    writeFileSync(join(outDir, 'console.txt'), logs.join('\n') + '\n');
  }
  const poses = readdirSync(outDir).filter((f) => /^pose-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const motion = readdirSync(outDir).filter((f) => /^motion-\d+\.png$/.test(f)).sort();
  const doorShots = ['closed', 'side', 'back', 'open', 'open-side', 'near', 'through', 'arrival'].map((n) => `door-${n}.png`).filter((f) => readdirSync(outDir).includes(f));
  try {
    execFileSync('montage', [...poses, ...doorShots, ...motion, '-tile', '6x', '-geometry', '480x270+3+3', '-background', '#111', '-depth', '8', '-define', 'png:color-type=2', 'sheet.png'], { cwd: outDir });
  } catch (e) { console.error('montage failed:', e.message); }
  const errs = wgslErrors(logs);
  if (errs.length) { console.error(`${errs.length} console error(s):\n` + errs.slice(0, 20).join('\n')); }
  console.log(`shots: ${outDir}  (${poses.length} poses, ${doorShots.length} door shots, ${motion.length} motion frames, sheet.png)`);
  process.exit(errs.length ? 1 : 0);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
