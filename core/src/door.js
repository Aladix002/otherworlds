// Core-owned doors: procedural geometry, opening animation, doorway postcards, collision, crossing detection.
import DOOR from '../wgsl/door.wgsl';
import WRAP from '../wgsl/postcard-wrap.wgsl';
import DEFAULT_PC from '../wgsl/postcard-default.wgsl';
import { trsY, mul4, m4, easeInOut, clamp } from './math.js';
import { sphere, cylinder, torus } from './mesh.js';

export const OPEN_W = 0.96, OPEN_H = 2.05, FRAME_W = 0.14, FRAME_D = 0.16;
const MAX_DOORS = 4, OPEN_TIME = 1.6, SWING = 100 * Math.PI / 180;

// Vertex: pos(3) nrm(3) o(3: box-local offset in meters, unrotated) h(3: box half extents) attr(4: part, mat, seed, rotZ)
// mat: 0 wood (grain along local y), 1 wood (grain along x), 2 iron. part: 0 frame, 1 leaf.
const VS = 16;
function buildGeometry() {
  const V = [], I = [];
  function box(cx, cy, cz, sx, sy, sz, part, mat, seed, rotZ = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, c = Math.cos(rotZ), s = Math.sin(rotZ);
    const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
    for (const [n, u, t, sg] of faces) {
      const base = V.length / VS;
      for (let k = 0; k < 4; k++) {
        const cu = (k & 1) ? 1 : -1, cv = (k & 2) ? 1 : -1;
        const b = [0, 0, 0]; b[n] = sg; b[u] = cu * sg; b[t] = cv;
        const nr = [0, 0, 0]; nr[n] = sg;
        const lx = b[0] * hx, ly = b[1] * hy;
        V.push(cx + lx * c - ly * s, cy + lx * s + ly * c, cz + b[2] * hz, nr[0] * c - nr[1] * s, nr[0] * s + nr[1] * c, nr[2],
          lx, ly, b[2] * hz, hx, hy, hz, part, mat, seed, rotZ);
      }
      I.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  // arbitrary smooth mesh (no bevels): o = 0, h = large
  function geo(g, ox, oy, oz, part, mat, seed) {
    const base = V.length / VS;
    for (let i = 0; i < g.pos.length / 3; i++) V.push(ox + g.pos[i * 3], oy + g.pos[i * 3 + 1], oz + g.pos[i * 3 + 2], g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2], 0, 0, 0, 1, 1, 1, part, mat, seed, 0);
    for (const k of g.idx) I.push(base + k);
  }
  const W = OPEN_W, H = OPEN_H, pw = FRAME_W, pd = FRAME_D;
  // ---- frame (part 0), door-local: opening centered on x, ground at y=0, door plane z=0 ----
  const postH = H + 0.2;
  box(-(W / 2 + pw / 2), postH / 2 - 0.08, 0, pw, postH + 0.08, pd, 0, 0, 11);
  box(W / 2 + pw / 2, postH / 2 - 0.08, 0, pw, postH + 0.08, pd, 0, 0, 12);
  box(0, H + 0.09, 0, W + 2 * pw + 0.16, 0.18, pd + 0.04, 0, 1, 13);          // lintel with overhang
  box(0, H + 0.205, 0, W + 2 * pw + 0.22, 0.05, pd + 0.07, 0, 1, 15);         // cap board
  box(0, -0.02, 0, W + 2 * pw + 0.06, 0.07, pd + 0.12, 0, 1, 14);            // threshold
  for (const hy of [0.36, 1.74]) {                                            // pintles on the hinge post
    box(-W / 2 - 0.02, hy, 0, 0.04, 0.03, 0.03, 0, 2, 1);
    geo(cylinder(0.011, 0.011, 0.05, 8), -W / 2 - 0.004, hy - 0.08, 0, 0, 2, 1);
  }
  // ---- leaf (part 1), hinge axis at x=0, z=0 ----
  const lw = W - 0.006, lh = H - 0.012, t = 0.046, n = 5, plw = lw / n;
  for (let i = 0; i < n; i++) {
    const th = t + Math.sin(i * 12.9898) * 0.003, top = lh + Math.sin(i * 78.233) * 0.006;
    box(0.003 + plw * (i + 0.5), 0.01 + top / 2, Math.sin(i * 3.7) * 0.0015, plw - 0.0035, top, th, 1, 0, i + 1);
  }
  box(0.006 + lw / 2, 0.01 + lh / 2, 0, lw - 0.03, lh - 0.04, t - 0.012, 1, 0, 6);  // inner backing board: gaps read dark, not see-through
  const bz = -t / 2 - 0.014;                                                       // battens + Z brace on the back
  box(0.006 + lw / 2, 0.36, bz, lw - 0.06, 0.14, 0.028, 1, 1, 7);
  box(0.006 + lw / 2, 1.74, bz, lw - 0.06, 0.14, 0.028, 1, 1, 8);
  const x0 = 0.11, y0 = 0.44, x1 = lw - 0.09, y1 = 1.66, len = Math.hypot(x1 - x0, y1 - y0);
  box((x0 + x1) / 2, (y0 + y1) / 2, bz, 0.12, len - 0.06, 0.026, 1, 0, 9, -Math.atan2(x1 - x0, y1 - y0));
  for (const hy of [0.36, 1.74]) {                                                 // strap hinges + knuckles (front)
    box(0.3, hy, t / 2 + 0.005, 0.6, 0.05, 0.009, 1, 2, 0);
    box(0.62, hy, t / 2 + 0.005, 0.05, 0.034, 0.009, 1, 2, 0);
    geo(cylinder(0.013, 0.013, 0.09, 10), 0.0, hy - 0.045, 0.012, 1, 2, 1);
  }
  const kx = lw - 0.1;
  box(kx, 1.0, t / 2 + 0.004, 0.07, 0.17, 0.008, 1, 2, 2);                        // front escutcheon plate
  box(kx, 1.05, t / 2 + 0.018, 0.016, 0.016, 0.026, 1, 2, 2);                     // ring staple
  const ring = torus(0.045, 0.0075, 18, 8);                                        // ring handle hanging in the door plane
  for (let i = 0; i < ring.pos.length; i += 3) { const y = ring.pos[i + 1], z = ring.pos[i + 2]; ring.pos[i + 1] = -z; ring.pos[i + 2] = y; const ny = ring.nrm[i + 1], nz = ring.nrm[i + 2]; ring.nrm[i + 1] = -nz; ring.nrm[i + 2] = ny; }
  geo(ring, kx, 1.05 - 0.045, t / 2 + 0.03, 1, 2, 2);
  box(kx, 1.0, -t / 2 - 0.004, 0.06, 0.15, 0.008, 1, 2, 2);                       // back plate + round knob
  box(kx, 1.0, -t / 2 - 0.022, 0.016, 0.016, 0.03, 1, 2, 2);
  geo(sphere(0.03, 2), kx, 1.0, -t / 2 - 0.05, 1, 2, 2);
  return { verts: new Float32Array(V), idx: new Uint16Array(I.length % 2 ? [...I, 0] : I), count: I.length };
}

export function createDoors(ctx, world, postcards) {
  const device = ctx.device;
  const geo = buildGeometry();
  const vbuf = ctx.buffer(geo.verts, 'vertex', 'door-v');
  const ibuf = ctx.buffer(geo.idx, 'index', 'door-i');
  const ubuf = device.createBuffer({ size: 160 * MAX_DOORS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const udata = new Float32Array(40 * MAX_DOORS);
  const doorLayout = ctx.layout(['uniform'], 'door');
  const doorBG = ctx.bindGroup(doorLayout, [ubuf]);
  const doorPipe = ctx.pipeline({
    code: DOOR, label: 'door', layouts: [doorLayout], cull: 'none',
    buffers: [{ arrayStride: VS * 4, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32x3' },
      { shaderLocation: 4, offset: 48, format: 'float32x4' }] }],
  });

  // postcards: one uniform slot per door + 1 for the full-screen overlay (256-byte aligned slots)
  const pcLayout = ctx.layout(['uniform'], 'postcard');
  const pcBuf = device.createBuffer({ size: 256 * (MAX_DOORS + 1), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pcData = new Float32Array(24);
  const pcBG = []; for (let i = 0; i <= MAX_DOORS; i++) pcBG.push(ctx.bindGroup(pcLayout, [{ buffer: pcBuf, offset: 256 * i, size: 96 }]));
  const pipes = {};
  function postcardPipes(id) {
    if (pipes[id]) return pipes[id];
    const code = (postcards && postcards[id]) || DEFAULT_PC;
    const module = ctx.shader(code + '\n' + WRAP, 'postcard:' + id);
    const base = { module, layouts: [pcLayout], fs: 'pc_fs', cull: 'none' };
    const p = { ready: false, quad: null, full: null };
    p.promise = Promise.all([
      ctx.pipelineAsync({ ...base, vs: 'pc_vs_quad', label: 'pc-quad:' + id }),
      ctx.pipelineAsync({ ...base, vs: 'pc_vs_full', label: 'pc-full:' + id, blend: 'alpha', depthTest: false, depthWrite: false }),
    ]).then(([q, f]) => { p.quad = q; p.full = f; p.ready = true; }).catch((e) => {
      console.error('postcard ' + id + ' failed, using default', e);
      if (id !== '__default') return postcardPipes('__default').promise.then(() => { Object.assign(p, pipes.__default); });
    });
    if (id === '__default') pipes.__default = p;
    return (pipes[id] = p);
  }

  const doors = [];
  // called by the core after world.init (so init may compute door positions). pos[1] == null -> world.heightAt(x, z)
  function setDoors(list, heightAt) {
    doors.length = 0;
    (list || []).slice(0, MAX_DOORS).forEach((d, i) => {
      const pos = Float32Array.from([d.pos[0], d.pos[1] ?? (heightAt ? heightAt(d.pos[0], d.pos[2]) : 0), d.pos[2]]);
      const door = { index: i, pos, yaw: d.yaw || 0, to: d.to, open: 0, phase: 0, target: 0, side: 1,
        frameM: m4(), leafM: m4(), tmpM: m4(), lx: 0, ly: 0, lz: 0, prevLz: 0, near: false, pc: postcardPipes(d.to) };
      trsY(door.frameM, pos[0], pos[1], pos[2], door.yaw);
      doors.push(door);
    });
  }

  const state = { doors, nearDoor: -1, crossed: -1, light: world.doorLight || [0, 0, 0] };

  function writeUniforms() {
    for (const d of doors) {
      const o = d.index * 40;
      // leaf transform = frame * T(hinge) * R(angle)
      const ang = -d.side * d.open * SWING; // swings toward the viewer (pulled open)
      trsY(d.tmpM, -OPEN_W / 2, 0, 0, ang);
      mul4(d.leafM, d.frameM, d.tmpM);
      udata.set(d.frameM, o); udata.set(d.leafM, o + 16);
      udata[o + 32] = d.open; udata[o + 33] = d.side;
      udata[o + 36] = state.light[0]; udata[o + 37] = state.light[1]; udata[o + 38] = state.light[2];
    }
    if (doors.length) device.queue.writeBuffer(ubuf, 0, udata, 0, doors.length * 40);
  }

  // per-frame logic. cam: camera, interact: bool (E/click). Returns index of door crossed this frame or -1.
  function update(dt, cam, interact, exposure, time, allowOpen) {
    state.nearDoor = -1; state.crossed = -1;
    let best = 1e9;
    for (const d of doors) {
      const dx = cam.pos[0] - d.pos[0], dz = cam.pos[2] - d.pos[2], c = Math.cos(d.yaw), s = Math.sin(d.yaw);
      d.prevLz = d.lz;
      d.lx = c * dx - s * dz; d.lz = s * dx + c * dz; d.ly = cam.pos[1] - d.pos[1];
      const flz = s * cam.fwd[0] + c * cam.fwd[2];
      const dist = Math.hypot(d.lx, d.lz);
      const facing = -flz * Math.sign(d.lz || 1);
      d.near = Math.abs(d.lx) < 1.6 && Math.abs(d.lz) < 3.2 && Math.abs(d.lz) > 0.2 && d.ly > -1 && d.ly < 3.5 && facing > 0.35;
      if (d.near && d.target === 0 && dist < best) { best = dist; state.nearDoor = d.index; }
      // auto-close far away
      if (d.target === 1 && dist > 40) d.target = 0;
      // crossing: open, inside the opening, sign of local z changed
      if (d.open > 0.75 && Math.abs(d.lx) < OPEN_W / 2 && d.ly > -0.5 && d.ly < OPEN_H + 0.4 && d.prevLz !== 0 && Math.sign(d.lz) !== Math.sign(d.prevLz)) state.crossed = d.index;
      const dir = d.target ? 1 : -1;
      d.phase = clamp(d.phase + dir * dt / (d.target ? OPEN_TIME : OPEN_TIME * 2), 0, 1);
      d.open = easeInOut(d.phase);
    }
    if (interact && state.nearDoor >= 0 && allowOpen) {
      const d = doors[state.nearDoor];
      d.side = Math.sign(d.lz) || 1; d.target = 1;
      state.opened = d.index;
    } else state.opened = -1;
    writeUniforms();
    // postcard slots for doorways
    for (const d of doors) {
      pcData.set(d.frameM, 0);
      pcData[16] = d.yaw + (d.lz < 0 ? Math.PI : 0); pcData[17] = 1; pcData[18] = 0;
      pcData[20] = 1 / Math.max(exposure, 1e-3); pcData[21] = time; pcData[22] = 1;
      device.queue.writeBuffer(pcBuf, 256 * d.index, pcData);
    }
    return state.crossed;
  }

  function setOverlay(yaw, alpha, exposure, time) {
    pcData[16] = yaw; pcData[17] = alpha; pcData[18] = 1;
    pcData[20] = 1 / Math.max(exposure, 1e-3); pcData[21] = time; pcData[22] = 0;
    device.queue.writeBuffer(pcBuf, 256 * MAX_DOORS, pcData);
  }

  function draw(pass) {
    if (!doors.length) return;
    pass.setPipeline(doorPipe); pass.setBindGroup(1, doorBG);
    pass.setVertexBuffer(0, vbuf); pass.setIndexBuffer(ibuf, 'uint16');
    pass.drawIndexed(geo.count, doors.length);
    for (const d of doors) {
      if (d.open < 0.005 || !d.pc.ready) continue;
      pass.setPipeline(d.pc.quad); pass.setBindGroup(1, pcBG[d.index]); pass.draw(6);
    }
  }
  function drawOverlay(pass, pc) {
    if (!pc.ready) return;
    pass.setPipeline(pc.full); pass.setBindGroup(1, pcBG[MAX_DOORS]); pass.draw(3);
  }

  // collision distance to door frames (+ closed leaves), in world space
  function boxD(x, y, z, cx, cy, cz, hx, hy, hz) {
    const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  }
  function sdf(x, y, z) {
    let r = 1e9;
    for (const d of doors) {
      const dx = x - d.pos[0], dz = z - d.pos[2], c = Math.cos(d.yaw), s = Math.sin(d.yaw);
      const lx = c * dx - s * dz, lz = s * dx + c * dz, ly = y - d.pos[1];
      if (Math.abs(lx) > 3 || Math.abs(lz) > 3) { r = Math.min(r, Math.hypot(lx, lz) - 1.2); continue; }
      r = Math.min(r, boxD(lx, ly, lz, -(OPEN_W / 2 + FRAME_W / 2), 1.15, 0, FRAME_W / 2, 1.2, FRAME_D / 2), boxD(lx, ly, lz, OPEN_W / 2 + FRAME_W / 2, 1.15, 0, FRAME_W / 2, 1.2, FRAME_D / 2));
      r = Math.min(r, boxD(lx, ly, lz, 0, OPEN_H + 0.12, 0, OPEN_W / 2 + 0.25, 0.12, 0.1));
      if (d.open < 0.5) r = Math.min(r, boxD(lx, ly, lz, 0, OPEN_H / 2, 0, OPEN_W / 2, OPEN_H / 2, 0.03));
    }
    return r;
  }

  const ready = () => Promise.all(doors.map((d) => d.pc.promise));
  return { state, doors, setDoors, update, draw, drawOverlay, setOverlay, sdf, ready, postcardPipes, MAX_DOORS };
}
