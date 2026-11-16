// DOM UI: loading screen, start overlay, Esc menu, door hint, perf overlay. Slovak texts.
import { WORLDS, isOpen, titleOf } from './worlds.js';
import { isTouchDevice } from './touch.js';

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#0b0d12;color:#eae6dc;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none}
canvas{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.ow{position:fixed;transition:opacity 1.2s ease;z-index:2}
.ow-hide{opacity:0;pointer-events:none}
.ow-serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:400;letter-spacing:.04em}
#ow-load,#ow-start{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center}
#ow-load{background:radial-gradient(ellipse at 50% 60%,#232634 0%,#0b0d12 70%)}
#ow-start{background:radial-gradient(ellipse at 50% 55%,rgba(20,22,30,.25) 0%,rgba(8,9,13,.72) 75%)}
.ow-title{font-size:clamp(28px,5vw,54px);text-shadow:0 2px 30px rgba(0,0,0,.5)}
.ow-bar{width:min(260px,60vw);height:2px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}
.ow-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c9b98f,#f3ead2);transition:width .4s ease}
.ow-btn{appearance:none;border:1px solid rgba(240,232,210,.45);background:rgba(255,255,255,.06);color:#f3ecdb;padding:12px 38px;border-radius:40px;font-size:18px;cursor:pointer;backdrop-filter:blur(6px);transition:background .4s,border-color .4s}
.ow-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(240,232,210,.8)}
.ow-small{opacity:.62;font-size:13px;max-width:520px;padding:0 16px}
#ow-hint{left:50%;bottom:16%;transform:translateX(-50%);padding:8px 18px;border-radius:30px;background:rgba(10,10,14,.35);backdrop-filter:blur(4px);font-size:16px;letter-spacing:.05em;transition:opacity .6s ease}
#ow-msg{left:50%;bottom:6%;transform:translateX(-50%);font-size:13px;opacity:.7;transition:opacity .8s}
#ow-dot{left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:rgba(255,255,255,.35);transition:opacity .6s}
#ow-perf{left:10px;top:10px;font:12px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.45);padding:6px 9px;border-radius:6px;white-space:pre;transition:none}
#ow-menu{inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,9,13,.55);backdrop-filter:blur(10px);transition:opacity .5s}
.ow-panel{width:min(760px,92vw);max-height:88vh;overflow:auto;display:grid;grid-template-columns:1.2fr 1fr;gap:28px;padding:30px;border-radius:18px;background:rgba(22,24,32,.72);border:1px solid rgba(255,255,255,.08)}
@media (max-width:640px){.ow-panel{grid-template-columns:1fr}}
.ow-panel h2{margin:0 0 12px;font-size:22px}
.ow-worlds a{display:block;padding:7px 10px;margin:2px 0;border-radius:8px;color:#e9e3d4;text-decoration:none;opacity:.82}
.ow-worlds a:hover{background:rgba(255,255,255,.07);opacity:1}
.ow-worlds a.cur{background:rgba(240,225,190,.12);opacity:1}
.ow-set label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0}
.ow-set input[type=range]{width:150px;accent-color:#d8c79c}
.ow-set select{background:#1d2029;color:#eee;border:1px solid #444;border-radius:6px;padding:4px 6px}
.ow-err{max-width:520px;padding:0 20px;line-height:1.6}
`;

export function createUI(world, { shot, via }) {
  const TITLE = titleOf(world.id, world.title);
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const SUPPORT = typeof __OW_SUPPORT__ !== 'undefined' ? __OW_SUPPORT__ : '';
  document.title = TITLE + ' · OtherWorlds';
  const el = (id, cls, html) => { const e = document.createElement('div'); e.id = id; e.className = 'ow ' + (cls || ''); if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  const load = el('ow-load', via ? 'ow-hide' : '', `<div class="ow-title ow-serif">${TITLE}</div><div class="ow-bar"><i></i></div>`);
  const bar = load.querySelector('i');
  const start = el('ow-start', 'ow-hide', `<div class="ow-title ow-serif">${TITLE}</div><button class="ow-btn ow-serif">Enter</button>
    <div class="ow-small">${isTouchDevice() ? `Left stick – move · drag – look${world.movement !== 'walk' ? ' · ▲/▼ – up/down' : ''} · Open – door · ≡ – menu` : `WASD – move · mouse – look · Shift – faster${world.movement !== 'walk' ? ' · Q/E – down/up' : ''} · E or click – open door · M – mute · Esc – menu`}</div>`);
  const hint = el('ow-hint', 'ow-hide', 'E – open');
  const msg = el('ow-msg', 'ow-hide', '');
  const dot = el('ow-dot', 'ow-hide');
  const perf = el('ow-perf', 'ow-hide');
  const menu = el('ow-menu', 'ow-hide', `<div class="ow-panel"><div class="ow-worlds"><h2 class="ow-serif">Worlds</h2>${WORLDS.map((w) =>
    isOpen(w.id) ? `<a href="${w.id}.html" class="${w.id === world.id ? 'cur' : ''}">${w.title}</a>` : `<a class="soon" style="opacity:.35;pointer-events:none">${w.title} · coming soon</a>`).join('')}</div>
    <div class="ow-set"><h2 class="ow-serif">Settings</h2>
    <label>Quality <select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
    <label>Volume <input type="range" min="0" max="1" step="0.01" data-k="volume"></label>
    <label>Look sensitivity <input type="range" min="0.2" max="3" step="0.05" data-k="sens"></label>
    <label>Invert Y <input type="checkbox" data-k="invertY"></label>
    <p style="margin-top:26px"><button class="ow-btn ow-serif" data-k="resume">Resume</button></p>${SUPPORT ? `<p class="ow-small" style="margin-top:18px"><a href="${SUPPORT}" target="_blank" rel="noopener" style="color:inherit">♥ Enjoying the calm? Support OtherWorlds</a></p>` : ''}</div></div>`);
  if (shot) for (const e of [load, start, hint, msg, dot, perf, menu]) e.style.display = 'none';

  const ui = {
    progress(f) { bar.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; },
    loaded() { load.classList.add('ow-hide'); },
    showStart(onEnter) {
      start.classList.remove('ow-hide');
      start.querySelector('button').onclick = (e) => { e.stopPropagation(); start.classList.add('ow-hide'); onEnter(); };
    },
    hint(on, text) { if (text && hint.textContent !== text) hint.textContent = text; hint.classList.toggle('ow-hide', !on); },
    message(text, ms = 0) { msg.textContent = text; msg.classList.toggle('ow-hide', !text); if (ms) setTimeout(() => msg.classList.add('ow-hide'), ms); },
    dot(on) { dot.classList.toggle('ow-hide', !on); },
    perfVisible: false,
    togglePerf() { ui.perfVisible = !ui.perfVisible; perf.classList.toggle('ow-hide', !ui.perfVisible); },
    perfText(t) { perf.textContent = t; },
    menuOpen: false,
    openMenu(settings, onChange, onResume) {
      ui.menuOpen = true; menu.classList.remove('ow-hide');
      for (const inp of menu.querySelectorAll('[data-k]')) {
        const k = inp.dataset.k;
        if (k === 'resume') { inp.onclick = () => { ui.closeMenu(); onResume(); }; continue; }
        if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
        inp.oninput = inp.onchange = () => onChange(k, inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value);
      }
    },
    closeMenu() { ui.menuOpen = false; menu.classList.add('ow-hide'); },
    error(kind) {
      load.classList.remove('ow-hide');
      const t = kind === 'nogpu' || kind === 'noadapter'
        ? 'This browser or device doesn\'t support WebGPU.<br>Try a current Chrome or Edge on desktop, Safari 26+, or Chrome on a recent Android phone.<br><span class="ow-small">On Linux, enable chrome://flags → Unsafe WebGPU Support, Vulkan and Override software rendering list, and run the browser on X11.</span>'
        : 'Something went wrong while starting this world.<br><span class="ow-small">' + kind + '</span>';
      load.innerHTML = `<div class="ow-title ow-serif">${TITLE}</div><div class="ow-err">${t}</div>`;
    },
  };
  return ui;
}
