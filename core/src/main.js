// OtherWorlds core runtime. run(world) boots WebGPU, the camera, post stack, doors, audio, UI and the test harness.
import { initGPU, installHelpers, HDR_FORMAT, DEPTH_FORMAT, WGSL, LIB_PURE, PRELUDE } from './gpu.js';
import { createPost } from './post.js';
import { createDoors } from './door.js';
import { createCamera } from './camera.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { WORLDS, nextWorld } from './worlds.js';
import * as math from './math.js';
import * as noise from './noise.js';
import * as mesh from './mesh.js';
import POSTCARDS from 'ow:postcards';

const { clamp, smoothstep, wrapAngle, mul4, invert4, perspectiveRevZ, viewFromBasis, m4, DEG } = math;

export const QUALITY = {
  low: { name: 'low', level: 0, floor: 0.5, maxScale: 0.85, bloomLevels: 4, bloomDiv: 4, aa: false, targetMs: 13, maxW: 1600, maxH: 900 },
  medium: { name: 'medium', level: 1, floor: 0.6, maxScale: 1, bloomLevels: 4, bloomDiv: 4, aa: true, targetMs: 10.5, maxW: 1920, maxH: 1200 },
  high: { name: 'high', level: 2, floor: 0.7, maxScale: 1, bloomLevels: 6, bloomDiv: 2, aa: true, targetMs: 12.5, maxW: 2560, maxH: 1600 },
};
const LEVELS = ['low', 'medium', 'high'];

const store = {
  get(k, d) { try { const v = localStorage.getItem('ow.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('ow.' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};

function autoQuality(info) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return 'low';
  const v = (info.vendor || '').toLowerCase(), a = (info.architecture || '').toLowerCase(), d = (info.description || '').toLowerCase();
  if (v.includes('nvidia') || d.includes('radeon rx') || d.includes('geforce') || a.startsWith('lovelace') || a.startsWith('ampere')) return 'high';
  return 'medium';
}

export async function run(world) {
  const P = new URLSearchParams(location.search);
  const shot = P.has('shot'), via = P.get('via') === 'door' && !shot;
  const bench = P.has('bench');
  const ui = createUI(world, { shot: shot || bench, via });
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; document.body.prepend(canvas);
  let gpu;
  try { gpu = await initGPU(canvas); } catch (e) { ui.error(e.message); throw e; }
  try { await boot(world, P, ui, canvas, gpu, { shot, via, bench }); } catch (e) { console.error(e); ui.error(String(e && e.message || e)); throw e; }
}

async function boot(world, P, ui, canvas, gpu, flags) {
  const { device, context } = gpu;
  const { shot, via, bench } = flags;
  const qName = LEVELS.includes(P.get('quality')) ? P.get('quality') : store.get('quality', null) || autoQuality(gpu.info);
  const Q = QUALITY[qName] || QUALITY.medium;
  const movement = ['fly', 'swim', 'walk'].includes(P.get('movement')) ? P.get('movement') : world.movement || 'fly';
  const settings = { quality: Q.name, volume: store.get('volume', 0.8), sens: store.get('sens', 1), invertY: store.get('invertY', false) };

  // ---- globals ----
  const G = new Float32Array(128);
  const globalsBuffer = device.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'globals' });
  const globalsLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }] });
  const globalsBindGroup = device.createBindGroup({ layout: globalsLayout, entries: [{ binding: 0, resource: { buffer: globalsBuffer } }] });
  const env = {
    sunDir: Float32Array.from(world.env?.sunDir || [0.3, 0.6, -0.5]), sunColor: Float32Array.from(world.env?.sunColor || [1.6, 1.45, 1.2]),
    fogColor: Float32Array.from(world.env?.fogColor || world.post?.fogColor || [0.55, 0.62, 0.75]), fogDensity: world.env?.fogDensity ?? 0.004,
    ambientSky: Float32Array.from(world.env?.ambientSky || [0.35, 0.42, 0.55]), ambientGround: Float32Array.from(world.env?.ambientGround || [0.18, 0.16, 0.14]),
    params: new Float32Array(4), params2: new Float32Array(4),
  };
  const ctx = {
    device, queue: device.queue, canvas, adapterInfo: gpu.info, features: gpu.features,
    hdrFormat: HDR_FORMAT, depthFormat: DEPTH_FORMAT, canvasFormat: gpu.format,
    quality: Q.name, q: Q, movement, shot, bench, via, world,
    globalsBuffer, globalsLayout, globalsBindGroup, env,
    clearColor: Float32Array.from(world.clearColor || env.fogColor),
    wgsl: { ...WGSL, lib: LIB_PURE, prelude: PRELUDE },
    math, noise, mesh: { ...mesh, upload: (g, label) => mesh.upload(ctx, g, label) },
    rng: math.makeRng(world.seed ?? 1337),
    time: 0, dt: 0, frame: 0, width: 0, height: 0, renderWidth: 0, renderHeight: 0, renderScale: 1,
    audio: null, worlds: WORLDS,
  };
  installHelpers(ctx);

  // ---- post + targets ----
  const post = createPost(ctx);
  const wp = { ...(world.post || {}) }; delete wp.fogColor;
  Object.assign(post.params, wp);
  if (!Q.aa) post.params.aa = false;
  for (const [k, v] of P) if (k.startsWith('post.')) post.params[k.slice(5)] = v === 'agx' || v === 'aces' ? v : +v; // dev overrides, e.g. ?post.bloom=0
  ctx.post = post.params;
  let resized = true;
  new ResizeObserver(() => { resized = true; }).observe(canvas);
  function doResize() {
    const dpr = Math.min(devicePixelRatio || 1, Q.level === 0 ? 1 : 2);
    let W = Math.max(1, Math.round(canvas.clientWidth * dpr)), H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const f = Math.min(1, Q.maxW / W, Q.maxH / H); W = Math.round(W * f); H = Math.round(H * f);
    if (W === ctx.width && H === ctx.height) return;
    canvas.width = W; canvas.height = H; ctx.width = W; ctx.height = H;
    post.resize(W, H, Q.bloomLevels, Q.bloomDiv);
    ctx.hdrTexture = post.st.hdr; ctx.hdrView = post.st.hdrView; ctx.depthTexture = post.st.depth; ctx.depthView = post.st.depthView;
    mainDesc.colorAttachments[0].view = post.st.hdrView; mainDesc.depthStencilAttachment.view = post.st.depthView;
    if (worldReady && world.resize) world.resize(ctx);
  }
  const clearValue = { r: 0, g: 0, b: 0, a: 1 };
  const mainDesc = {
    colorAttachments: [{ view: null, clearValue, loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: null, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
  };

  // ---- timestamps ----
  const hasTS = gpu.features.has('timestamp-query');
  let qs, resolveBuf, tsBegin, tsEnd; const readbacks = [];
  if (hasTS) {
    qs = device.createQuerySet({ type: 'timestamp', count: 2 });
    resolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    tsBegin = { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0 } };
    tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
    for (let i = 0; i < 4; i++) {
      const rb = { buf: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false, cb: null };
      rb.cb = () => {
        const u = new Uint32Array(rb.buf.getMappedRange());
        const t0 = u[1] * 4294967296 + u[0], t1 = u[3] * 4294967296 + u[2];
        rb.buf.unmap(); rb.busy = false;
        const ms = (t1 - t0) / 1e6;
        if (ms > 0 && ms < 1000) onGpuTime(ms);
      };
      rb.fail = () => { rb.busy = false; };
      readbacks.push(rb);
    }
  }

  // ---- stats & dynamic resolution ----
  const N = 1 << 15;
  const S = { gpu: new Float32Array(N), cpu: new Float32Array(N), frame: new Float32Array(N), scale: new Float32Array(N), ng: 0, nc: 0, rec: false, scaleHist: [], lastHist: 0 };
  const fixedScale = P.has('scale') ? clamp(+P.get('scale'), 0.25, 1) : shot ? 1 : 0;
  let scale = fixedScale || Q.maxScale, gpuEma = 0, frameEma = 16.7, dynAcc = 0;
  function onGpuTime(ms) {
    ctx.gpuMs = ms;
    gpuEma = gpuEma ? gpuEma * 0.9 + ms * 0.1 : ms;
    if (S.rec && S.ng < N) S.gpu[S.ng++] = ms;
    if (fixedScale || !worldReady) return;
    if (++dynAcc >= 20) {
      dynAcc = 0;
      const tgt = Q.targetMs;
      if (gpuEma > tgt * 1.06) scale = Math.max(Q.floor, scale - (gpuEma > tgt * 1.35 ? 0.1 : 0.05));
      else if (gpuEma < tgt * 0.78) scale = Math.min(Q.maxScale, scale + 0.025);
    }
  }
  function dynresNoTS(frameMs) {
    if (hasTS || fixedScale || !worldReady) return;
    frameEma = frameEma * 0.95 + frameMs * 0.05;
    if (++dynAcc >= 30) { dynAcc = 0; if (frameEma > 19) scale = Math.max(Q.floor, scale - 0.05); else if (frameEma < 17.2) scale = Math.min(Q.maxScale, scale + 0.01); }
  }
  const pct = (arr, n, p) => { if (!n) return 0; const a = Array.from(arr.subarray(0, n)).sort((x, y) => x - y); return a[Math.min(n - 1, Math.floor(p * (n - 1)))]; };
  const summarize = (arr, n) => { let s = 0, mx = 0, mn = Infinity; for (let i = 0; i < n; i++) { s += arr[i]; if (arr[i] > mx) mx = arr[i]; if (arr[i] < mn) mn = arr[i]; } return { avg: n ? s / n : 0, p50: pct(arr, n, 0.5), p99: pct(arr, n, 0.99), max: mx, min: n ? mn : 0, n }; };
  function stats(series = false) {
    return {
      series: series ? { gpu: Array.from(S.gpu.subarray(0, S.ng), (x) => +x.toFixed(2)), scale: Array.from(S.scale.subarray(0, S.nc), (x) => +x.toFixed(3)) } : undefined,
      world: world.id, quality: Q.name, timestamps: hasTS, adapter: { vendor: gpu.info.vendor, architecture: gpu.info.architecture, description: gpu.info.description },
      output: [ctx.width, ctx.height], gpu: summarize(S.gpu, S.ng), cpu: summarize(S.cpu, S.nc), frame: summarize(S.frame, S.nc),
      scale: { ...summarize(S.scale, S.nc), current: scale, floor: Q.floor }, scaleHistory: S.scaleHist.slice(), gpuNow: gpuEma,
    };
  }
  function resetStats() { S.ng = S.nc = 0; S.scaleHist.length = 0; S.lastHist = 0; }

  // ---- camera, input, doors ----
  const input = createInput(canvas);
  const cam = createCamera(world, movement);
  ctx.camera = cam; ctx.input = input;
  const doors = createDoors(ctx, world, POSTCARDS);
  ctx.doors = doors.doors;
  const heightAt = world.heightAt ? (x, z) => world.heightAt(x, z) : null;
  const sdf = (x, y, z) => { const a = doors.sdf(x, y, z); return world.sdf ? Math.min(a, world.sdf(x, y, z)) : a; };
  const camOpts = { sens: settings.sens, invertY: settings.invertY, sdf, heightAt, bounds: world.bounds || null, upKeyBlocked: false };
  const spawn = world.spawn || { pos: [0, 2, 0], yaw: 0, pitch: 0 };
  const dy = +P.get('dy') || 0, dp = P.has('dp') ? clamp(+P.get('dp'), -0.6, 0.6) : spawn.pitch || 0;
  cam.set(spawn.pos, spawn.yaw || 0, via ? dp : spawn.pitch || 0);
  const poses = world.poses || [];
  function setPose(i) {
    const p = poses[i] || spawn; cam.set(p.pos, p.yaw || 0, p.pitch || 0); cam.frozen = shot || bench; return !!poses[i];
  }
  if (P.has('pose')) setPose(+P.get('pose') | 0);

  // ---- fly-through spline (Catmull-Rom, time proportional to path length) ----
  const FP = world.flythrough || [spawn, spawn];
  const fly = { active: false, t: 0, dur: world.flythroughDuration || 60, times: new Float32Array(FP.length), yaws: new Float32Array(FP.length), resolve: null, loop: false };
  {
    let acc = 0, prevYaw = FP[0].yaw || 0;
    for (let i = 0; i < FP.length; i++) {
      let y = FP[i].yaw || 0; y = prevYaw + wrapAngle(y - prevYaw); fly.yaws[i] = prevYaw = y;
      if (i) { const a = FP[i - 1].pos, b = FP[i].pos; acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + Math.abs(fly.yaws[i] - fly.yaws[i - 1]) * 2 + 0.01; }
      fly.times[i] = acc;
    }
    for (let i = 0; i < FP.length; i++) fly.times[i] *= fly.dur / (acc || 1);
  }
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  function flyAt(s) {
    s = clamp(s, 0, fly.dur);
    let i = 0; while (i < FP.length - 2 && fly.times[i + 1] < s) i++;
    const t = clamp((s - fly.times[i]) / Math.max(1e-5, fly.times[i + 1] - fly.times[i]), 0, 1);
    const i0 = Math.max(0, i - 1), i2 = Math.min(FP.length - 1, i + 1), i3 = Math.min(FP.length - 1, i + 2);
    for (let k = 0; k < 3; k++) cam.pos[k] = cr(FP[i0].pos[k], FP[i].pos[k], FP[i2].pos[k], FP[i3].pos[k], t);
    cam.yaw = cam.yawT = cr(fly.yaws[i0], fly.yaws[i], fly.yaws[i2], fly.yaws[i3], t);
    cam.pitch = cam.pitchT = cr(FP[i0].pitch || 0, FP[i].pitch || 0, FP[i2].pitch || 0, FP[i3].pitch || 0, t);
    cam.vel[0] = cam.vel[1] = cam.vel[2] = 0; cam.roll = 0; cam.frozen = true;
  }
  function startFlythrough(loop = false) {
    fly.active = true; fly.t = 0; fly.loop = loop; resetStats(); S.rec = true; scale = fixedScale || Q.maxScale;
    return new Promise((r) => { fly.resolve = r; });
  }

  // ---- time control (harness) ----
  let time = +P.get('t') || 0, frozen = P.has('t') || shot, pendingDt = -1, settle = 0, settleResolve = null;
  const frameWaiters = [];

  // ---- transitions ----
  const trans = { mode: via ? 'arrive' : 'none', t: 0, alpha: via ? 1 : 0, yaw: (spawn.yaw || 0) - dy, pc: null, door: null, navigated: false };
  if (via) trans.pc = doors.postcardPipes(world.id);
  let entered = false, worldReady = false, audioWanted = !(shot || bench);

  // ---- audio & UI wiring ----
  function startAudio() {
    if (!audioWanted || ctx.audio) { if (ctx.audio && ctx.audio.ctx.state !== 'running') ctx.audio.resume(); return; }
    try {
      const a = createAudio(); ctx.audio = a;
      a.setVolume(settings.volume); a.setMuted(store.get('muted', false));
      if (world.audio) world.audio(ctx, a);
      a.fadeIn(via ? 2.5 : 4);
      a.ctx.onstatechange = () => { if (a.ctx.state === 'running') ui.message(''); };
    } catch (e) { console.warn('audio failed', e); }
  }
  function enter() {
    entered = true; startAudio(); input.lock(); ui.dot(true); canvas.focus();
  }
  function onSetting(k, v) {
    settings[k] = v; store.set(k, v);
    if (k === 'volume' && ctx.audio) ctx.audio.setVolume(v);
    if (k === 'sens') camOpts.sens = v;
    if (k === 'invertY') camOpts.invertY = v;
    if (k === 'quality') { const u = new URL(location.href); u.searchParams.delete('quality'); location.replace(u.href); }
  }
  function openMenu() { if (ui.menuOpen) return; ui.openMenu(settings, onSetting, () => { input.lock(); }); ui.dot(false); }
  input.onKey = (e) => {
    if (e.code === 'KeyM' && ctx.audio) { const m = !ctx.audio.muted; ctx.audio.setMuted(m); store.set('muted', m); ui.message(m ? 'Zvuk stlmený' : 'Zvuk zapnutý', 1400); }
    if (e.code === 'KeyH') ui.togglePerf();
    if (e.code === 'Escape' && entered && performance.now() - lockChangedAt > 400) { if (ui.menuOpen) { ui.closeMenu(); input.lock(); } else if (!input.locked) openMenu(); }
    if (entered && ctx.audio && ctx.audio.ctx.state !== 'running') ctx.audio.resume();
  };
  let lockChangedAt = 0;
  input.onLockChange = (locked) => {
    lockChangedAt = performance.now();
    if (locked) { ui.closeMenu(); ui.dot(true); }
    else if (entered && trans.mode !== 'exit') openMenu();
  };
  let clickInteract = false;
  input.onClick = () => {
    if (!entered) return;
    if (ctx.audio && ctx.audio.ctx.state !== 'running') ctx.audio.resume();
    if (!ctx.audio) startAudio();
    if (!input.locked && !ui.menuOpen) input.lock();
    clickInteract = true;
  };

  // ---- the frame ----
  let last = performance.now(), raf = 0, perfAcc = 0;
  const submitArr = [null];
  const projM = m4(), viewM = m4(), vpM = m4(), invVP = m4();

  function writeGlobals() {
    const W = ctx.renderWidth, H = ctx.renderHeight, aspect = W / H;
    perspectiveRevZ(projM, cam.fov, aspect, cam.near);
    viewFromBasis(viewM, cam.eye, cam.right, cam.up, cam.fwd);
    mul4(vpM, projM, viewM); invert4(invVP, vpM);
    G.set(vpM, 0); G.set(invVP, 16); G.set(viewM, 32); G.set(projM, 48);
    G[64] = cam.eye[0]; G[65] = cam.eye[1]; G[66] = cam.eye[2]; G[67] = time;
    G[68] = cam.fwd[0]; G[69] = cam.fwd[1]; G[70] = cam.fwd[2]; G[71] = ctx.dt;
    G[72] = cam.right[0]; G[73] = cam.right[1]; G[74] = cam.right[2]; G[75] = aspect;
    G[76] = cam.up[0]; G[77] = cam.up[1]; G[78] = cam.up[2]; G[79] = Math.tan(cam.fov / 2);
    G[80] = W; G[81] = H; G[82] = 1 / W; G[83] = 1 / H;
    const sd = env.sunDir, sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
    G[84] = sd[0] / sl; G[85] = sd[1] / sl; G[86] = sd[2] / sl; G[87] = ctx.renderScale;
    G.set(env.sunColor, 88); G[91] = ctx.frame;
    G.set(env.fogColor, 92); G[95] = env.fogDensity;
    G.set(env.ambientSky, 96); G[99] = Q.level;
    G.set(env.ambientGround, 100); G[103] = cam.near;
    G.set(env.params, 104); G.set(env.params2, 108);
    G[112] = ctx.width; G[113] = ctx.height; G[114] = W / ctx.width; G[115] = H / ctx.height;
    G[116] = performance.now() / 1000; G[117] = trans.alpha;
    device.queue.writeBuffer(globalsBuffer, 0, G);
  }

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    const realDt = clamp((nowMs - last) / 1000, 0, 0.25); last = nowMs;
    const c0 = performance.now();
    if (resized) { resized = false; doResize(); }
    // animation time
    let dt;
    if (settle > 0) { dt = 1 / 60; time += dt; if (--settle === 0) { frozen = true; settleResolve && settleResolve(); } }
    else if (pendingDt >= 0) { dt = pendingDt; pendingDt = -1; }
    else if (frozen) dt = 0;
    else { dt = Math.min(realDt, 1 / 20); time += dt; }
    ctx.dt = dt; ctx.time = time; ctx.frame++;
    const camDt = Math.min(realDt, 1 / 20);

    // camera
    const playing = worldReady && entered && !ui.menuOpen && trans.mode !== 'exit';
    if (fly.active) {
      fly.t += shot ? 1 / 60 : realDt;
      flyAt(fly.t);
      if (fly.t >= fly.dur) { if (fly.loop) fly.t = 0; else { fly.active = false; S.rec = false; const r = fly.resolve; fly.resolve = null; r && r(stats()); } }
    }
    if (!playing) { input.dx = input.dy = 0; }
    const nearBefore = doors.state.nearDoor >= 0;
    camOpts.upKeyBlocked = nearBefore;
    cam.update(playing || cam.frozen ? camDt : 0, input, camOpts);
    if (!playing && !cam.frozen) { cam.vel[0] *= 0.9; cam.vel[2] *= 0.9; }

    // doors
    const interact = playing && (input.consumePressed('KeyE') && nearBefore || (clickInteract && input.locked));
    clickInteract = false;
    if (!playing) input.clearPressed();
    const crossed = worldReady ? doors.update(camDt, cam, interact, post.params.exposure, time, playing) : -1;
    if (doors.state.opened >= 0 && ctx.audio) ctx.audio.creak();
    ui.hint(playing && doors.state.nearDoor >= 0, 'E – otvoriť');
    // centering assist + exit trigger
    if (playing) for (const d of doors.doors) {
      if (d.open < 0.6 || Math.abs(d.lz) > 1.8 || Math.abs(d.lx) > 0.8 || d.ly < -0.5 || d.ly > 2.6) continue;
      const toward = -(Math.sin(d.yaw) * cam.vel[0] + Math.cos(d.yaw) * cam.vel[2]) * Math.sign(d.lz);
      if (toward > 0.15) {
        const k = math.damp(0.4, camDt) * d.lx, c = Math.cos(d.yaw), s = Math.sin(d.yaw);
        cam.pos[0] -= c * k; cam.pos[2] += s * k;
      }
      if (Math.abs(d.lz) < 0.6 && Math.abs(d.lx) < 0.4 && toward > 0.05) beginExit(d);
    }
    if (crossed >= 0 && playing) beginExit(doors.doors[crossed]);
    updateTransition(camDt);

    if (worldReady && world.update) world.update(ctx, dt, time, cam);
    if (ctx.audio) ctx.audio.setListener(cam.eye, cam.fwd, cam.up);

    // resolution
    ctx.renderScale = scale;
    ctx.renderWidth = Math.max(1, Math.round(ctx.width * scale)); ctx.renderHeight = Math.max(1, Math.round(ctx.height * scale));
    writeGlobals();
    post.update(ctx.renderWidth, ctx.renderHeight, shot ? 0 : ctx.frame, 0);
    if (trans.alpha > 0 && trans.pc) doors.setOverlay(trans.yaw, trans.alpha, post.params.exposure, time);

    // encode
    const enc = device.createCommandEncoder();
    if (hasTS) enc.beginComputePass(tsBegin).end();
    if (worldReady && world.computeBefore) world.computeBefore(ctx, enc);
    const cc = ctx.clearColor; clearValue.r = cc[0]; clearValue.g = cc[1]; clearValue.b = cc[2];
    const pass = enc.beginRenderPass(mainDesc);
    pass.setViewport(0, 0, ctx.renderWidth, ctx.renderHeight, 0, 1);
    pass.setScissorRect(0, 0, ctx.renderWidth, ctx.renderHeight);
    pass.setBindGroup(0, globalsBindGroup);
    if (worldReady) {
      world.render(ctx, pass);
      doors.draw(pass);
      if (world.renderTransparent) world.renderTransparent(ctx, pass);
    }
    if (trans.alpha > 0 && trans.pc) doors.drawOverlay(pass, trans.pc);
    pass.end();
    if (worldReady && world.afterScene) world.afterScene(ctx, enc);
    post.encode(enc, context.getCurrentTexture().createView(), hasTS ? tsEnd : undefined);
    let rb = null;
    if (hasTS) {
      enc.resolveQuerySet(qs, 0, 2, resolveBuf, 0);
      for (let i = 0; i < readbacks.length; i++) if (!readbacks[i].busy) { rb = readbacks[i]; break; }
      if (rb) enc.copyBufferToBuffer(resolveBuf, 0, rb.buf, 0, 16);
    }
    submitArr[0] = enc.finish();
    device.queue.submit(submitArr);
    if (rb) { rb.busy = true; rb.buf.mapAsync(GPUMapMode.READ).then(rb.cb, rb.fail); }

    // stats
    const cpuMs = performance.now() - c0;
    ctx.cpuMs = cpuMs;
    dynresNoTS(realDt * 1000);
    if (S.rec && S.nc < N) {
      S.cpu[S.nc] = cpuMs; S.frame[S.nc] = realDt * 1000; S.scale[S.nc] = scale; S.nc++;
      if (fly.t - S.lastHist >= 1) { S.lastHist = fly.t; S.scaleHist.push(+scale.toFixed(3)); }
    }
    if (ui.perfVisible && (perfAcc += realDt) > 0.5) {
      perfAcc = 0;
      ui.perfText(`GPU ${hasTS ? gpuEma.toFixed(2) + ' ms' : 'n/a'}\nCPU ${cpuMs.toFixed(2)} ms\n${(1000 / Math.max(1, frameEma)).toFixed(0)} fps  ${(realDt * 1000).toFixed(1)} ms\nscale ${scale.toFixed(2)}  ${ctx.renderWidth}×${ctx.renderHeight}\n${Q.name} · ${movement}`);
    }
    frameEma = frameEma * 0.95 + realDt * 1000 * 0.05;
    if (frameWaiters.length) { for (let i = frameWaiters.length - 1; i >= 0; i--) if (--frameWaiters[i].n <= 0) { frameWaiters[i].r(); frameWaiters.splice(i, 1); } }
  }

  function beginExit(d) {
    if (trans.mode === 'exit') return;
    const side = Math.sign(d.lz || d.prevLz) || 1;
    trans.mode = 'exit'; trans.t = 0; trans.door = d; trans.pc = d.pc;
    trans.yaw = d.yaw + (side < 0 ? Math.PI : 0);
    if (ctx.audio) { ctx.audio.whoosh({ dur: 2.2, f0: 220, f1: 900, gain: 0.05, reverb: 0.6 }); ctx.audio.fadeOut(1.3); }
    ui.hint(false); ui.dot(false);
  }
  function updateTransition(dt) {
    if (trans.mode === 'exit') {
      trans.t += dt;
      trans.alpha = smoothstep(0, 0.3, trans.t);
      if (trans.t > 1.5 && !trans.navigated && !shot) {
        trans.navigated = true;
        const d = trans.door, rel = wrapAngle(cam.yaw - trans.yaw);
        const u = new URL((d.to || nextWorld(world.id)) + '.html', location.href);
        u.searchParams.set('via', 'door'); u.searchParams.set('dy', rel.toFixed(3)); u.searchParams.set('dp', cam.pitch.toFixed(3));
        if (P.get('quality')) u.searchParams.set('quality', P.get('quality'));
        if (P.get('movement') && d.to === world.id) u.searchParams.set('movement', P.get('movement'));
        location.href = u.href;
      }
    } else if (trans.mode === 'arrive') {
      if (worldReady) { trans.t += dt; trans.alpha = 1 - smoothstep(0.4, 3.0, trans.t); if (trans.alpha <= 0) { trans.mode = 'none'; trans.alpha = 0; } }
    }
  }

  // ---- harness for tools: window.__ow ----
  const frames = (n = 1) => new Promise((r) => frameWaiters.push({ n, r }));
  let readyResolve; const ready = new Promise((r) => { readyResolve = r; });
  window.__ow = {
    ready, stats, resetStats, frames, startFlythrough,
    get info() { return { world: world.id, quality: Q.name, movement, adapter: gpu.info && { vendor: gpu.info.vendor, architecture: gpu.info.architecture, description: gpu.info.description }, timestamps: hasTS, poses: poses.length, flythroughDuration: fly.dur, output: [ctx.width, ctx.height] }; },
    setPose, setTime(t) { pendingDt = clamp(t - time, 0, 0.1); time = t; frozen = true; },
    unfreeze() { frozen = false; },
    settle(t, sec = 2) { time = t - sec; settle = Math.max(1, Math.round(sec * 60)); frozen = false; return new Promise((r) => { settleResolve = r; }); },
    flyAt(s) { fly.active = false; flyAt(s); },
    setScale(s) { scale = clamp(s, 0.25, 1); },
    door(i, open) { const d = doors.doors[i]; if (d) { d.target = open > 0 ? 1 : 0; d.phase = open; d.open = math.easeInOut(open); d.side = 1; } },
    transition(alpha, i = 0) { const d = doors.doors[i]; if (!d) return; trans.mode = alpha > 0 ? 'shot' : 'none'; trans.pc = d.pc; trans.alpha = alpha; trans.yaw = d.yaw; },
    arrival(alpha) { trans.mode = alpha > 0 ? 'shot' : 'none'; trans.pc = doors.postcardPipes(world.id); trans.alpha = alpha; trans.yaw = cam.yaw; },
    // camera `dist` meters in front of door i (front side), looking at it
    doorView(i = 0, dist = 3.2, height = 1.55) {
      const d = doors.doors[i]; if (!d) return false;
      const s = Math.sin(d.yaw), c = Math.cos(d.yaw);
      cam.set([d.pos[0] + s * dist, d.pos[1] + height, d.pos[2] + c * dist], d.yaw, -0.03); cam.frozen = true; return true;
    },
    camera: cam, ctx,
  };

  // ---- loading ----
  device.lost.then((info) => {
    console.error('device lost', info.message);
    if (info.reason === 'destroyed') return;
    let n = 0; try { n = +sessionStorage.getItem('ow.lost') || 0; sessionStorage.setItem('ow.lost', n + 1); } catch (_) { /* */ }
    if (n > 2) { ui.error('GPU zariadenie sa stratilo.'); return; }
    const lower = LEVELS[Math.max(0, Q.level - 1)];
    store.set('quality', lower);
    const u = new URL(location.href); u.searchParams.set('quality', lower); location.replace(u.href);
  });
  if (via) { await trans.pc.promise; raf = requestAnimationFrame(frame); }
  const progress = (f) => { ui.progress(f); return new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(fin); setTimeout(fin, 50); }); };
  await progress(0.02);
  if (world.init) await world.init(ctx, progress);
  doors.setDoors(world.doors, heightAt);
  if (heightAt && movement === 'walk' && !cam.frozen) { cam.pos[1] = heightAt(cam.pos[0], cam.pos[2]) + cam.eyeHeight; cam.eye[1] = cam.pos[1]; }
  await doors.ready();
  ui.progress(1);
  await device.queue.onSubmittedWorkDone();
  worldReady = true;
  try { sessionStorage.removeItem('ow.lost'); } catch (_) { /* */ }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  await frames(3);
  ui.loaded();
  readyResolve();
  if (shot || bench) { entered = false; }
  else if (via) { entered = true; startAudio(); if (!ctx.audio || ctx.audio.ctx.state !== 'running') ui.message('Klikni pre zvuk a ovládanie myšou'); ui.dot(true); }
  else ui.showStart(enter);
  if (P.has('flythrough') && !shot) startFlythrough(true);
}
