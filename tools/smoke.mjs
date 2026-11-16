#!/usr/bin/env node
// node tools/smoke.mjs <id> [--movement walk|fly|swim] [--no-build]
// Interactive end-to-end check (no shot mode): enter, walk with WASD, open door 0 with E, walk through,
// verify navigation to <to>.html?via=door and the arrival dissolve. Screenshots go to shots/<id>/smoke-*.png.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launch, openWorld, parseArgs, wgslErrors } from './lib/browser.mjs';
import { buildWorld } from './build.mjs';
const args = parseArgs(process.argv.slice(2));
const id = args._[0] || '_test';
const out = join(ROOT, 'shots', id); mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!args['no-build']) await buildWorld(id, { quiet: true });
const { browser, close } = await launch();
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) ok = false; };
try {
  const params = args.movement ? { movement: args.movement } : {};
  const { page, logs } = await openWorld(browser, id, params);
  await page.click('#ow-start button');
  await sleep(500);
  const p0 = await page.evaluate(() => Array.from(window.__ow.camera.pos));
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW'); await sleep(600);
  const p1 = await page.evaluate(() => Array.from(window.__ow.camera.pos));
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  check(moved > 1 && moved < 6, `WASD moves the camera (${moved.toFixed(2)} m in 1.5 s)`);
  await sleep(500);
  await page.keyboard.press('Escape'); await sleep(700);
  const menu = await page.evaluate(() => !document.getElementById('ow-menu').classList.contains('ow-hide') && document.querySelectorAll('#ow-menu .ow-worlds a').length);
  check(menu >= 12, `Esc opens the menu (${menu} worlds listed)`);
  await page.screenshot({ path: join(out, 'smoke-menu.png') });
  await page.click('#ow-menu [data-k=resume]'); await sleep(300);
  const hasDoor = await page.evaluate(() => window.__ow.ctx.doors.length > 0);
  if (hasDoor) {
    await page.evaluate(() => { const c = window.__ow.camera; window.__ow.doorView(0, 2.2, c.eyeHeight); c.frozen = false; });
    await sleep(300);
    const hint = await page.evaluate(() => !document.getElementById('ow-hint').classList.contains('ow-hide'));
    check(hint, 'door hint "E – open" visible near the door');
    await page.screenshot({ path: join(out, 'smoke-hint.png') });
    await page.keyboard.press('KeyE');
    await sleep(1900);
    const open = await page.evaluate(() => window.__ow.ctx.doors[0].open);
    check(open > 0.95, `door opens (open=${open.toFixed(2)})`);
    await page.screenshot({ path: join(out, 'smoke-open.png') });
    const nav = page.waitForNavigation({ timeout: 15000 }).then(() => true, () => false);
    await page.keyboard.down('KeyW');
    await sleep(1400);
    await page.screenshot({ path: join(out, 'smoke-through.png') });
    const navigated = await nav;
    await page.keyboard.up('KeyW').catch(() => {});
    check(navigated, 'walking through the open door navigates');
    if (navigated) {
      const url = page.url();
      check(/via=door/.test(url), `arrived via door: ${url.split('/').pop()}`);
      await page.waitForFunction(() => !!(window.__ow && window.__ow.ready), { timeout: 30000 });
      await page.evaluate(() => window.__ow.ready);
      await sleep(400);
      await page.screenshot({ path: join(out, 'smoke-arrive-a.png') });
      await sleep(1600);
      await page.screenshot({ path: join(out, 'smoke-arrive-b.png') });
      await sleep(2000);
      const a = await page.evaluate(() => window.__ow.ctx.time > 0);
      check(a, 'arrived world is running');
    }
  }
  const errs = wgslErrors(logs);
  check(errs.length === 0, `no console errors${errs.length ? ':\n' + errs.join('\n') : ''}`);
} finally { await close(); }
process.exit(ok ? 0 : 1);
