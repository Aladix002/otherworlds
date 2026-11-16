// Keyboard / mouse (pointer lock) / touch input. State only; consumers read it each frame.
export function createInput(canvas) {
  const keys = Object.create(null);
  const st = {
    keys, dx: 0, dy: 0, locked: false, touchLook: false, touches: 0, pressed: Object.create(null),
    onKey: null, onClick: null, onLockChange: null, dragging: false,
  };
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
  addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (!keys[e.code]) st.pressed[e.code] = true;
    keys[e.code] = true;
    if (st.onKey) st.onKey(e);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('pointerlockchange', () => {
    st.locked = document.pointerLockElement === canvas;
    if (st.onLockChange) st.onLockChange(st.locked);
  });
  addEventListener('mousemove', (e) => {
    if (st.locked || st.dragging) { st.dx += e.movementX; st.dy += e.movementY; }
  });
  canvas.addEventListener('mousedown', (e) => { if (!st.locked && e.button === 0) st.dragging = true; });
  addEventListener('mouseup', () => { st.dragging = false; });
  canvas.addEventListener('click', (e) => { if (st.onClick) st.onClick(e); });

  // touch on the canvas = look only (movement comes from the joystick in touch.js)
  let lastX = 0, lastY = 0, primary = null;
  st.joyX = 0; st.joyY = 0; st.vert = 0; st.joyFast = false; st.usedTouch = false;
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); st.usedTouch = true; st.touches = e.touches.length;
    if (primary === null) { const t = e.changedTouches[0]; primary = t.identifier; lastX = t.clientX; lastY = t.clientY; }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === primary) { st.dx += (t.clientX - lastX) * 1.6; st.dy += (t.clientY - lastY) * 1.6; lastX = t.clientX; lastY = t.clientY; }
  }, { passive: false });
  const end = (e) => {
    st.touches = e.touches.length;
    for (const t of e.changedTouches) if (t.identifier === primary) primary = null;
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);

  st.consumePressed = (code) => { const p = st.pressed[code]; st.pressed[code] = false; return !!p; };
  st.clearPressed = () => { for (const k in st.pressed) st.pressed[k] = false; };
  st.lock = () => { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* ignore */ } };
  st.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  return st;
}
