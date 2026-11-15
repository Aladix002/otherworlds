#!/usr/bin/env node
// node tools/debug.mjs <id> [query]  — opens a world headless for ~N seconds and prints console output + __ow.info
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, launch, parseArgs } from './lib/browser.mjs';
const args = parseArgs(process.argv.slice(2));
const id = args._[0] || '_test';
const { browser, close } = await launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  const u = pathToFileURL(join(ROOT, 'dist', id + '.html')); u.search = args._[1] || 'shot=1';
  await page.goto(u.href);
  await new Promise((r) => setTimeout(r, (+args.wait || 6) * 1000));
  console.log(await page.evaluate(() => JSON.stringify(window.__ow ? window.__ow.info : 'no __ow')));
  console.log('ready:', await page.evaluate(() => Promise.race([window.__ow.ready.then(() => 'yes'), new Promise((r) => setTimeout(() => r('no'), 500))])));
  console.log('frame:', await page.evaluate(() => window.__ow.ctx.frame + ' raf? ' + typeof requestAnimationFrame));
  if (args.png) await page.screenshot({ path: join(ROOT, args.png) });
} finally { await close(); }
