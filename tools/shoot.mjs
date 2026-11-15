#!/usr/bin/env node
// node tools/shoot.mjs <id> [--quality medium] [--no-build] [--params "movement=fly&x=1"] [--t 10]
// Writes shots/<id>/pose-0..5.png (1920x1080, deterministic time), motion-00..23.png (fly-through clips),
// sheet.png (contact sheet) and console.txt. Safe to run in parallel with other shoots.
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
      await shot('open', () => window.__ow.door(0, 1));
      await shot('near', () => { window.__ow.doorView(0, 0.9, 1.5); });
      await shot('through', () => { window.__ow.doorView(0, 0.5, 1.5); window.__ow.transition(0.6, 0); });
      await shot('arrival', () => { window.__ow.transition(0); window.__ow.door(0, 0); window.__ow.setPose(0); window.__ow.arrival(0.55); });
      await page.evaluate(() => window.__ow.arrival(0));
    }
    // motion clips: 3 clips x 8 frames at 1/15 s spacing along the fly-through
    const dur = info.flythroughDuration;
    let k = 0;
    for (const f of [0.15, 0.5, 0.82]) {
      const s0 = dur * f;
      await page.evaluate((s) => { window.__ow.flyAt(s); return window.__ow.settle(s, 1); }, s0);
      for (let j = 0; j < 8; j++, k++) {
        const s = s0 + j / 15;
        await page.evaluate((s) => { window.__ow.flyAt(s); window.__ow.setTime(s); return window.__ow.frames(2); }, s);
        await page.screenshot({ path: join(outDir, `motion-${String(k).padStart(2, '0')}.png`) });
      }
    }
  } finally {
    await close();
    writeFileSync(join(outDir, 'console.txt'), logs.join('\n') + '\n');
  }
  const poses = readdirSync(outDir).filter((f) => /^pose-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const motion = readdirSync(outDir).filter((f) => /^motion-\d+\.png$/.test(f)).sort();
  const doorShots = ['closed', 'open', 'near', 'through', 'arrival'].map((n) => `door-${n}.png`).filter((f) => readdirSync(outDir).includes(f));
  try {
    execFileSync('montage', [...poses, ...doorShots, ...motion, '-tile', '6x', '-geometry', '480x270+3+3', '-background', '#111', '-type', 'TrueColor', '-define', 'png:color-type=2', 'sheet.png'], { cwd: outDir });
  } catch (e) { console.error('montage failed:', e.message); }
  const errs = wgslErrors(logs);
  if (errs.length) { console.error(`${errs.length} console error(s):\n` + errs.slice(0, 20).join('\n')); }
  console.log(`shots: ${outDir}  (${poses.length} poses, ${doorShots.length} door shots, ${motion.length} motion frames, sheet.png)`);
  process.exit(errs.length ? 1 : 0);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
