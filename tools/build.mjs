#!/usr/bin/env node
// Build single-file worlds: node tools/build.mjs <id|all> [--readable]
//   -> dist/<id>.html (core + world + every world's postcard, all inlined). `all` also writes dist/index.html.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS_DIR = join(ROOT, 'worlds');
const DIST = join(ROOT, 'dist');
const SOFT_BUDGET = 150 * 1024;

// Conservative WGSL minifier: strips comments, collapses whitespace where tokens cannot merge.
export function minifyWGSL(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const W = /[A-Za-z0-9_]/, OP = /[+\-*/<>=!&|%^]/;
  let out = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      let j = i; while (j < s.length && /\s/.test(s[j])) j++;
      const a = out[out.length - 1], b = s[j];
      if (a !== undefined && b !== undefined && ((W.test(a) && W.test(b)) || (OP.test(a) && OP.test(b)))) out += ' ';
      i = j;
    } else { out += ch; i++; }
  }
  return out;
}

const listWorlds = () => readdirSync(WORLDS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(WORLDS_DIR, d.name, 'world.js'))).map((d) => d.name).sort();

function postcardsModule(minify, only = null) {
  const map = {};
  if (existsSync(WORLDS_DIR)) for (const d of readdirSync(WORLDS_DIR)) {
    const f = join(WORLDS_DIR, d, 'postcard.wgsl');
    if (only && !only.includes(d)) continue;
    if (existsSync(f)) { const t = readFileSync(f, 'utf8'); map[d] = minify ? minifyWGSL(t) : t; }
  }
  return 'export default ' + JSON.stringify(map) + ';';
}

function owPlugin(id, minify, only = null) {
  return {
    name: 'ow',
    setup(b) {
      b.onResolve({ filter: /^ow:/ }, (a) => ({ path: a.path, namespace: 'ow' }));
      b.onLoad({ filter: /.*/, namespace: 'ow' }, (a) => {
        if (a.path === 'ow:postcards') return { contents: postcardsModule(minify, only), loader: 'js' };
        if (a.path === 'ow:entry') {
          const w = JSON.stringify(join(WORLDS_DIR, id, 'world.js')), m = JSON.stringify(join(ROOT, 'core/src/main.js'));
          return { contents: `import world from ${w};\nimport { run } from ${m};\nif (!world.id) world.id = ${JSON.stringify(id)};\nrun(world);\n`, loader: 'js', resolveDir: ROOT };
        }
      });
      b.onLoad({ filter: /\.wgsl$/ }, (a) => {
        const t = readFileSync(a.path, 'utf8');
        return { contents: minify ? minifyWGSL(t) : t, loader: 'text' };
      });
    },
  };
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function buildWorld(id, { readable = false, quiet = false, released = null, outDir = DIST } = {}) {
  const worldFile = join(WORLDS_DIR, id, 'world.js');
  if (!existsSync(worldFile)) throw new Error(`no world at worlds/${id}/world.js`);
  const minify = !readable;
  const r = await esbuild.build({
    entryPoints: ['ow:entry'], bundle: true, write: false, format: 'iife', target: 'es2022',
    minify, legalComments: 'none', charset: 'utf8', plugins: [owPlugin(id, minify, released)], logLevel: 'silent',
    define: released ? { __OW_RELEASED__: JSON.stringify(released) } : {},
  });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const src = readFileSync(worldFile, 'utf8');
  const title = (src.match(/title\s*:\s*['"`]([^'"`]+)['"`]/) || [])[1] || id;
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)} · OtherWorlds</title><style>html,body{margin:0;height:100%;background:#0b0d12}</style></head><body><script>${js}</script></body></html>`;
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, id + '.html');
  writeFileSync(out, html);
  const size = Buffer.byteLength(html), gz = gzipSync(html, { level: 9 }).length;
  if (!quiet) console.log(`${id.padEnd(16)} ${(size / 1024).toFixed(1).padStart(7)} KB  (gzip ${(gz / 1024).toFixed(1)} KB)${size > SOFT_BUDGET ? '  OVER 150 KB soft budget' : ''}`);
  return { id, out, size, gzip: gz, title };
}

export async function buildIndex(built, { outDir = DIST, released = null } = {}) {
  const { WORLDS } = await import(pathToFileURL(join(ROOT, 'core/src/worlds.js')).href);
  const have = new Set(released || listWorlds().filter((id) => existsSync(join(outDir, id + '.html'))));
  const items = WORLDS.map((w, i) => have.has(w.id)
    ? `<a class="w" href="${w.id}.html"><span>${String(i + 1).padStart(2, '0')}</span>${esc(w.title)}</a>`
    : `<div class="w off"><span>${String(i + 1).padStart(2, '0')}</span>${esc(w.title)}${released ? ' <small>· čoskoro</small>' : ''}</div>`).join('\n');
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OtherWorlds</title>
<style>
html,body{margin:0;min-height:100%;background:radial-gradient(ellipse at 50% 30%,#262a3a 0%,#0d0f15 70%) fixed;color:#ebe5d6;font:16px/1.5 system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:12vh 16px 10vh}
h1{font:400 clamp(34px,7vw,64px)/1.1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;letter-spacing:.05em;margin:0 0 8px}
p{opacity:.65;margin:0 0 40px}
.w{display:flex;gap:18px;align-items:baseline;padding:12px 14px;border-radius:12px;color:inherit;text-decoration:none;font:400 21px/1.3 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;transition:background .4s}
a.w:hover{background:rgba(255,255,255,.06)}
.w span{font:12px ui-monospace,monospace;opacity:.45}
.off{opacity:.32}
footer{margin-top:48px;font-size:13px;opacity:.4}footer a{color:inherit}
</style></head><body><main><h1>OtherWorlds</h1><p>Pokojné, otvorené, magické svety. Medzi nimi sa chodí cez obyčajné drevené dvere.</p>
${items}
<footer>${released ? 'Potrebuje prehliadač s WebGPU (Chrome alebo Edge na počítači, nové Safari). Najlepšie so slúchadlami.' : have.has('_test') ? '<a href="_test.html">testovací svet</a>' : ''}</footer></main></body></html>`;
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`index.html       ${built.length} built, ${have.size} available`);
}

async function main() {
  const args = process.argv.slice(2);
  const readable = args.includes('--readable');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) { console.error('usage: node tools/build.mjs <id|all> [--readable]'); process.exit(2); }
  const ids = target === 'all' ? listWorlds() : [target];
  const built = []; let failed = 0;
  for (const id of ids) {
    try { built.push(await buildWorld(id, { readable })); } catch (e) { failed++; console.error(`${id}: BUILD FAILED\n${e.message}`); }
  }
  if (target === 'all') await buildIndex(built);
  process.exit(failed ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
