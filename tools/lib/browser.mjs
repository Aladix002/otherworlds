// Shared headless Chromium launcher for the OtherWorlds tools (real GPU via Vulkan, profile inside the repo).
import puppeteer from 'puppeteer-core';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CHROME = process.env.OW_CHROME || '/snap/bin/chromium';

export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

export async function launch({ width = 1920, height = 1080 } = {}) {
  const profile = join(ROOT, '.chrome-profile-' + randomBytes(5).toString('hex'));
  mkdirSync(profile, { recursive: true });
  const cleanup = () => { try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* */ } };
  const onSig = () => { cleanup(); process.exit(130); };
  process.once('SIGINT', onSig); process.once('SIGTERM', onSig);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: 'new', userDataDir: profile,
      defaultViewport: { width, height, deviceScaleFactor: 1 },
      args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
        '--enable-webgpu-developer-features', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--autoplay-policy=user-gesture-required', `--window-size=${width},${height}`],
    });
  } catch (e) { cleanup(); throw e; }
  const close = async () => { try { await browser.close(); } catch (_) { /* */ } cleanup(); process.off('SIGINT', onSig); process.off('SIGTERM', onSig); };
  return { browser, close, profile };
}

// Opens dist/<id>.html with query params, waits for __ow.ready, asserts a real (non-SwiftShader) adapter.
export async function openWorld(browser, id, params = {}, { timeout = 120000, width = 1920, height = 1080 } = {}) {
  const file = join(ROOT, 'dist', id + '.html');
  if (!existsSync(file)) throw new Error(`missing ${file} (build first)`);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const u = pathToFileURL(file); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  await page.goto(u.href, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => !!(window.__ow && window.__ow.ready), { timeout: 30000 });
    await page.evaluate((t) => Promise.race([window.__ow.ready, new Promise((_, r) => setTimeout(() => r(new Error('ready timeout')), t))]), timeout);
  } catch (e) {
    throw new Error(`world did not become ready: ${e.message}\n${logs.join('\n')}`);
  }
  const info = await page.evaluate(() => window.__ow.info);
  const ad = info.adapter || {};
  const desc = `${ad.vendor || '?'} / ${ad.architecture || '?'} ${ad.description || ''}`.trim();
  if (/swiftshader|llvmpipe|software/i.test(desc) || !ad.vendor) throw new Error(`software adapter detected (${desc}); real GPU required`);
  return { page, info, logs, adapter: desc };
}

export const wgslErrors = (logs) => logs.filter((l) => /\[error\]|\[pageerror\]|wgsl.*error|Validation/i.test(l));
