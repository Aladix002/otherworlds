// Touch controls (phones/tablets): left virtual joystick = move, drag anywhere else = look,
// ▲/▼ = up/down (fly/swim worlds), "Open" button near doors, ≡ = menu.
// Writes into the shared input state: joyX/joyY (-1..1), vert (-1/0/1), joyFast, pressed.KeyE.
const CSS = `
#ow-touch{position:fixed;inset:0;z-index:3;pointer-events:none;transition:opacity .6s}
#ow-touch.off{opacity:0}
#ow-touch .tb{pointer-events:auto;position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;
  background:rgba(14,15,20,.32);border:1px solid rgba(240,232,210,.28);color:#f3ecdb;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  font:20px/1 system-ui,sans-serif;touch-action:none;-webkit-tap-highlight-color:transparent}
#ow-touch .tb.on{background:rgba(240,232,210,.22)}
#ow-joy{left:max(22px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom));width:132px;height:132px}
#ow-joy i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(240,232,210,.32);transition:transform .08s}
#ow-up,#ow-down{right:max(22px,env(safe-area-inset-right));width:58px;height:58px}
#ow-up{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 70px)}
#ow-down{bottom:max(22px,env(safe-area-inset-bottom))}
#ow-menubtn{right:max(14px,env(safe-area-inset-right));top:max(14px,env(safe-area-inset-top));width:46px;height:46px;font-size:22px}
#ow-open{left:50%;bottom:calc(max(22px,env(safe-area-inset-bottom)) + 40px);transform:translateX(-50%);width:auto;height:auto;border-radius:30px;
  padding:12px 26px;font:17px/1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;letter-spacing:.05em;transition:opacity .4s}
#ow-touch .hide{opacity:0;pointer-events:none}
`;

export const isTouchDevice = () => {
  try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch (_) { return false; }
};

export function createTouch(input, { movement, onMenu }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'ow-touch'; root.className = 'off';
  const vertical = movement !== 'walk';
  root.innerHTML = `<div class="tb" id="ow-joy"><i></i></div>
    <div class="tb${vertical ? '' : ' hide'}" id="ow-up">▲</div><div class="tb${vertical ? '' : ' hide'}" id="ow-down">▼</div>
    <div class="tb" id="ow-menubtn">≡</div><div class="tb hide" id="ow-open">Open</div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const joy = $('ow-joy'), knob = joy.querySelector('i'), up = $('ow-up'), down = $('ow-down'), open = $('ow-open');
  input.joyX = 0; input.joyY = 0; input.vert = 0; input.joyFast = false;

  // joystick
  let joyId = null;
  const R = 52;
  const setJoy = (t) => {
    const r = joy.getBoundingClientRect();
    let x = t.clientX - (r.left + r.width / 2), y = t.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y), m = Math.min(l, R);
    if (l > 0) { x = x / l * m; y = y / l * m; }
    knob.style.transform = `translate(${x}px,${y}px)`;
    input.joyX = x / R; input.joyY = y / R;
    input.joyFast = l > R * 1.25; // pushing past the rim = faster
  };
  const resetJoy = () => { joyId = null; input.joyX = input.joyY = 0; input.joyFast = false; knob.style.transform = ''; joy.classList.remove('on'); };
  joy.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); const t = e.changedTouches[0]; joyId = t.identifier; joy.classList.add('on'); setJoy(t); }, { passive: false });
  joy.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); for (const t of e.changedTouches) if (t.identifier === joyId) setJoy(t); }, { passive: false });
  const joyEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) resetJoy(); };
  joy.addEventListener('touchend', joyEnd); joy.addEventListener('touchcancel', joyEnd);

  // hold buttons
  const hold = (el, v) => {
    const on = (e) => { e.preventDefault(); e.stopPropagation(); input.vert = v; el.classList.add('on'); };
    const off = (e) => { e.preventDefault(); if (input.vert === v) input.vert = 0; el.classList.remove('on'); };
    el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
  };
  hold(up, 1); hold(down, -1);
  const tap = (el, fn) => el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  tap($('ow-menubtn'), () => onMenu && onMenu());
  tap(open, () => { input.pressed.KeyE = true; });

  let shown = false;
  return {
    show(v) { if (v !== shown) { shown = v; root.className = v ? '' : 'off'; if (!v) { resetJoy(); input.vert = 0; } } },
    nearDoor(v) { open.classList.toggle('hide', !v); },
  };
}
