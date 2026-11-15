// Aurora over a winter fjord. See NOTES.md.
import { pcg, u2f } from '../../core/src/noise.js';
import { ss, DOOR, DOOR_YAW, PIER, SPAWN, MOON, VN, buildLayout, buildTerrain, buildMap, heightAt, makeSdf } from './terrain.js';
import { HOUSE, village, spruce, boulder } from './geo.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';

const NPRINT = 48, EYE = 1.62;
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
// pose from eye xz (+ height above ground) looking at a target
const pose = (x, up, z, tx, ty, tz, t) => { const y = heightAt(x, z) + up; return { pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t }; };
const DY = heightAt(DOOR[0], DOOR[2]);

// instances binned per frame into LOD ranges of one vertex buffer (horizontal frustum + distance, allocation-free)
function makeBatch(ctx, meshes, inst, d) {
  const n = inst.length / 8, L = meshes.length;
  return { src: Float32Array.from(inst), n, L, meshes, d, stage: new Float32Array(n * 8 * L), buf: ctx.buffer(n * 32 * L, 'vertex'), cnt: new Int32Array(L) };
}
function binBatch(b, ctx, cam, tx, ty) {
  const { src, stage, cnt, n, L, d: D } = b, ex = cam.eye[0], ez = cam.eye[2], f = cam.fwd, r = cam.right;
  const fl = Math.hypot(f[0], f[2]), w = fl - ty * Math.abs(f[1]), all = w < 0.25, fx = f[0] / fl, fz = f[2] / fl, k = tx / Math.max(w, 0.25);
  cnt.fill(0);
  for (let i = 0; i < n; i++) {
    const o = i * 8, s = src[o + 3], dx = src[o] - ex, dz = src[o + 2] - ez, rad = 5 * s;
    if (!all) {
      const z = dx * fx + dz * fz;
      if (z < -rad) continue;
      const x = dx * r[0] + dz * r[2]; if ((x < 0 ? -x : x) > z * k + rad * 2) continue;
    }
    const q = Math.sqrt(dx * dx + dz * dz) / s;
    let l = 0; while (l < L && q >= D[l]) l++;
    if (l === L) continue;
    const t = (l * n + cnt[l]++) * 8;
    for (let j = 0; j < 8; j++) stage[t + j] = src[o + j];
  }
  for (let l = 0; l < L; l++) if (cnt[l]) ctx.queue.writeBuffer(b.buf, l * n * 32, stage, l * n * 8, cnt[l] * 8);
}
function drawBatch(b, pass) {
  for (let l = 0; l < b.L; l++) {
    const c = b.cnt[l]; if (!c) continue;
    const m = b.meshes[l];
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setVertexBuffer(1, b.buf, l * b.n * 32, c * 32);
    pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount, c);
  }
}

export default {
  id: 'aurora-fjord',
  title: 'Polárna žiara nad fjordom',
  movement: 'walk',
  spawn: { pos: [SPAWN[0], heightAt(SPAWN[0], SPAWN[2]) + EYE, SPAWN[2]], yaw: 0, pitch: 0.05 },
  poses: [
    pose(-1.5, 1.7, 21, -1, 5, -60, 12),                 // village around the cove, aurora mirrored in the fjord
    pose(1.4, 1.75, -16.5, -70, 170, -420, 31),            // peaks with aurora curtains, from the pier head
    pose(-70, 2.1, -93, -175, 66, -168, 22),                  // forest slope swaying
    pose(-8.5, 1.6, 9.5, -15.5, 3.0, -1.5, 17),            // close house: warm window, snow on the roof
    pose(-3, 1.6, 30, -3.5, 60, 14, 44),                 // looking up into the aurora
    pose(10.2, 1.55, 42.6, DOOR[0], DY + 1.25, DOOR[2], 27),   // the door on the snowy shore
  ],
  flythrough: [
    [-1.5, 21, -1, -60], [0.5, 15, 2, -40], [2, 8, 2, -60], [2, 0, -10, -80], [2, -9, -30, -90], [2, -15, 30, -70], [2.2, -8, 40, -20], [2, 2, 20, 10], [0, 13, -20, 5],
    [-9, 15, -26, 0], [-19, 6, -34, -24], [-27, -8, -30, -40], [-31, -18, 0, -30], [-25, -4, 10, 20], [-13, 14, 9, 37], [-2, 24, 9, 37], [5, 31, 9, 37], [8.5, 39.5, 9.3, 36],
    [11.5, 41, 9, 37], [13, 36, -30, -40], [8, 28, -10, -60], [2, 23, -1, -60], [-1.5, 21, -1, -60],
  ].map(([x, z, tx, tz]) => pose(x, EYE, z, tx, heightAt(x, z) + 1.5 + Math.hypot(tx - x, tz - z) * 0.04, tz)),
  flythroughDuration: 60,
  doors: [{ pos: [DOOR[0], DY, DOOR[2]], yaw: DOOR_YAW, to: 'crystal-cave' }],
  doorLight: [0.05, 0.06, 0.085],
  bounds: { center: [0, 2, -12], radius: 92 },
  env: {
    sunDir: MOON, sunColor: [0.2, 0.26, 0.4], fogColor: [0.02, 0.04, 0.07], fogDensity: 0.00042,
    ambientSky: [0.04, 0.065, 0.115], ambientGround: [0.022, 0.032, 0.052],
  },
  post: { exposure: 1.05, bloom: 0.14, bloomThreshold: 1.0, bloomKnee: 0.5, vignette: 0.3, saturation: 1.1, contrast: 1.03 },
  clearColor: [0.01, 0.02, 0.04],
  fov: 62,
  heightAt,
  sdf(x, y, z) { return this.sdfFn(x, y, z); },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, M = ctx.mesh, TU = GPUTextureUsage;
    // ---------- baked tileable noise: r billow, g/b its gradient, a detail fbm ----------
    const N = 256, hf = new Float32Array(N * N), nd = new Uint8Array(N * N * 4);
    const pv = (x, y, P, s) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const h = (a, b) => u2f(pcg((a % P) + pcg((b % P) + s * 7919)));
      const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1);
      return a + (b - a) * ux + (c + (h(ix + 1, iy + 1) - c) * ux - a - (b - a) * ux) * uy;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let r = 0, d = 0, a = 0.5, f = 4;
      for (let o = 0; o < 4; o++) { r += a * pv(i / N * f, j / N * f, f, o); d += a * pv(i / N * f * 2, j / N * f * 2, f * 2, o + 9); a *= 0.5; f *= 2; }
      hf[j * N + i] = Math.min(Math.max((r / 0.9375 - 0.5) * 1.8 + 0.5, 0), 1);
      nd[(j * N + i) * 4 + 3] = Math.min(Math.max((d / 0.9375 - 0.5) * 1.9 + 0.5, 0), 1) * 255;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, gx = (hf[j * N + (i + 1) % N] - hf[j * N + (i + N - 1) % N]) * N / 2, gy = (hf[((j + 1) % N) * N + i] - hf[((j + N - 1) % N) * N + i]) * N / 2;
      nd[k] = hf[j * N + i] * 255; nd[k + 1] = Math.min(Math.max(0.5 + gx / 40, 0), 1) * 255; nd[k + 2] = Math.min(Math.max(0.5 + gy / 40, 0), 1) * 255;
    }
    const mips = Math.log2(N) + 1, ntex = ctx.texture(N, N, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, { mips });
    for (let m = 0, s = N, src = nd; m < mips; m++) {
      dev.queue.writeTexture({ texture: ntex, mipLevel: m }, src, { bytesPerRow: s * 4 }, [s, s]);
      const h = s >> 1, dst = new Uint8Array(Math.max(h, 1) ** 2 * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < h; i++) for (let c = 0; c < 4; c++) {
        const a = (j * 2 * s + i * 2) * 4 + c; dst[(j * h + i) * 4 + c] = (src[a] + src[a + 4] + src[a + s * 4] + src[a + s * 4 + 4] + 2) >> 2;
      }
      src = dst; s = h;
    }
    await progress(0.1);

    // ---------- layout, terrain, village map ----------
    const L = buildLayout(q);
    this.sdfFn = makeSdf(L.col);
    await progress(0.2);
    const T = buildTerrain(L);
    this.ter = T.geos.map((g) => M.upload(g));
    for (let i = 0; i < L.trees.length; i += 8) L.trees[i + 6] = T.shadowAt(L.trees[i], L.trees[i + 2]);
    await progress(0.45);
    const vtex = ctx.texture(VN, VN, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
    dev.queue.writeTexture({ texture: vtex }, buildMap(L), { bytesPerRow: VN * 4 }, [VN, VN]);
    await progress(0.55);

    // ---------- meshes + instances ----------
    const V = village(PIER, L.lamps, heightAt, [DOOR[0], DY, DOOR[2]], DOOR_YAW, L.posts);
    const inst = (a) => ctx.buffer(Float32Array.from(a), 'vertex');
    this.objs = [{ m: M.upload(V.geo), i: inst([0, 0, 0, 1, 0, 0.5, 1, 0]), n: 1 }];
    this.glows = [];
    this.objs.push({ m: M.upload(boulder(5)), i: inst(L.rocks), n: L.rocks.length / 8 });
    HOUSE.forEach((H, v) => {
      const n = L.houses[v].length / 8; if (!n) return;
      const ib = inst(L.houses[v]);
      this.objs.push({ m: M.upload(H.geo), i: ib, n }); this.glows.push({ m: M.upload(H.glow), i: ib, n });
    });
    await progress(0.65);
    this.trees = makeBatch(ctx, [0, 1, 2].map((l) => M.upload(spruce(l, 3))), L.trees, [42, 150, 1000]);
    const lamps = []; for (let i = 0; i < V.bulbs.length; i += 3) lamps.push(V.bulbs[i], V.bulbs[i + 1], V.bulbs[i + 2], 0);
    this.lampI = inst(lamps); this.nLamp = lamps.length / 4;
    const sm = [];
    L.chim.forEach((c, i) => sm.push(c[0], c[1], c[2], (i * 0.618) % 1 * 0.99));
    this.nChim = L.chim.length;
    L.puffs.slice(0, 14).forEach((p, i) => sm.push(p[0], p[1], p[2], 1 + (i * 0.381) % 1 * 0.99));
    this.smokeI = inst(sm); this.nSmoke = sm.length / 4;
    // footprints: baked trails + a ring buffer for the player's own
    const pr = new Float32Array((L.prints.length / 3 + NPRINT) * 4);
    for (let i = 0; i < L.prints.length / 3; i++) { const x = L.prints[i * 3], z = L.prints[i * 3 + 1]; pr.set([x, heightAt(x, z), z, L.prints[i * 3 + 2]], (NPRINT + i) * 4); }
    for (let i = 0; i < NPRINT; i++) pr[i * 4 + 1] = -99;
    this.printI = ctx.buffer(pr, 'vertex'); this.nPrint = pr.length / 4; this.pr = pr.subarray(0, NPRINT * 4); this.pk = 0; this.walked = 0; this.side = 1;
    this.nSnow = [1800, 3200, 5000][q]; this.nRib = 5;
    await progress(0.75);

    // ---------- reflection target + bind groups ----------
    const RW = [640, 960, 1280][q], RH = RW * 9 / 16;
    const rt = ctx.texture(RW, RH, ctx.hdrFormat, TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT), rd = ctx.texture(RW, RH, ctx.depthFormat, TU.RENDER_ATTACHMENT);
    const dummy = ctx.texture(1, 1, ctx.hdrFormat, TU.TEXTURE_BINDING);
    const cL = ctx.layout(['texture', 'sampler', 'texture', 'sampler', 'texture']);
    const bg = (t) => ctx.bindGroup(cL, [ntex.createView(), ctx.samplers.repeat, vtex.createView(), ctx.samplers.linear, t.createView()]);
    this.bg = bg(rt); this.bgR = bg(dummy);
    this.passR = {
      colorAttachments: [{ view: rt.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0.01, 0.02, 0.04, 1] }],
      depthStencilAttachment: { view: rd.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };

    // ---------- pipelines (main + mirrored variants for the reflection pass) ----------
    const IL = M.instanceLayout(['float32x4', 'float32x4'], 3), I4 = M.instanceLayout(['float32x4'], 3);
    const sc = ctx.shader(COMMON + SCENE, 'scene'), fx = ctx.shader(COMMON + FX, 'fx');
    const P = (d) => ctx.pipelineAsync({ module: sc, layouts: [cL], ...d }), mir = { MIR: -1 };
    const defs = [
      { vs: 'vsTer', fs: 'fsTer', buffers: [M.layout] }, { buffers: [M.layout, IL] }, { vs: 'vsTree', fs: 'fsTree', buffers: [M.layout, IL], cull: 'none' },
      { fs: 'fsGlow', buffers: [M.layout, IL], blend: 'add' }, { vs: 'vsSky', fs: 'fsSky', depthWrite: false, cull: 'none' }, { vs: 'vsAur', fs: 'fsAur', blend: 'add', cull: 'none' },
      { module: fx, vs: 'vsLamp', fs: 'fsLamp', buffers: [I4], blend: 'add', cull: 'none' },
    ];
    const all = await Promise.all([
      ...defs.map((d) => P(d)), ...defs.map((d) => P({ ...d, cull: d.cull === 'none' ? 'none' : 'front', constants: mir })),
      P({ vs: 'vsWater', fs: 'fsWater', cull: 'none' }),
      P({ module: fx, vs: 'vsSnow', fs: 'fsSnow', blend: 'add', cull: 'none' }),
      P({ module: fx, vs: 'vsSmoke', fs: 'fsSmoke', buffers: [I4], blend: 'premul', cull: 'none' }),
      P({ module: fx, vs: 'vsPrint', fs: 'fsPrint', buffers: [I4], blend: 'multiply', cull: 'none' }),
    ]);
    this.pm = all.slice(0, 7); this.pr2 = all.slice(7, 14);
    [this.pWater, this.pSnow, this.pSmoke, this.pPrint] = all.slice(14);
    await progress(1);
  },

  // opaque + additive scene, shared by the main pass and the mirrored reflection pass
  scene(pass, p, refl) {
    pass.setPipeline(p[0]);
    for (let i = 0; i < 4; i++) this.ter[i].draw(pass);
    pass.setPipeline(p[1]);
    for (let i = 0; i < this.objs.length; i++) { const o = this.objs[i]; pass.setVertexBuffer(1, o.i); o.m.draw(pass, o.n); }
    pass.setPipeline(p[2]); drawBatch(this.trees, pass);
    pass.setPipeline(p[3]);
    for (let i = 0; i < this.glows.length; i++) { const o = this.glows[i]; pass.setVertexBuffer(1, o.i); o.m.draw(pass, o.n); }
    pass.setPipeline(p[4]); pass.draw(3);
    pass.setPipeline(p[5]); pass.draw(1920, this.nRib);
    pass.setPipeline(p[6]); pass.setVertexBuffer(0, this.lampI); pass.draw(6, this.nLamp);
  },

  update(ctx, dt, t, cam) {
    const ty = Math.tan(cam.fov / 2), P = ctx.env.params;
    binBatch(this.trees, ctx, cam, ty * ctx.width / ctx.height, ty);
    P[0] = 0.92 + 0.2 * Math.sin(t * 0.021) + 0.12 * Math.sin(t * 0.053 + 1.3);          // aurora activity
    P[1] = 0.62 + 0.28 * Math.sin(t * 0.017 + 2) + 0.1 * Math.sin(t * 0.041);           // snowfall density
    P[2] = ctx.doors[0] ? ctx.doors[0].open : 0;
    // the player's own footprints + crunch
    if (!cam.frozen && cam.mode === 'walk') {
      this.walked += Math.hypot(cam.vel[0], cam.vel[2]) * dt;
      if (this.walked > 0.7) {
        this.walked = 0; this.side = -this.side;
        const x = cam.pos[0] + cam.right[0] * 0.11 * this.side, z = cam.pos[2] + cam.right[2] * 0.11 * this.side, k = this.pk * 4, pr = this.pr;
        pr[k] = x; pr[k + 1] = heightAt(x, z); pr[k + 2] = z; pr[k + 3] = Math.atan2(-cam.vel[0], -cam.vel[2]);
        ctx.queue.writeBuffer(this.printI, k * 4, pr, k, 4);
        this.pk = (this.pk + 1) % NPRINT;
        if (ctx.audio) this.step(ctx.audio, cam.pos[2] < PIER[1] - 1 && Math.abs(cam.pos[0] - PIER[0]) < 1.4);
      }
    }
  },
  computeBefore(ctx, enc) {
    const p = enc.beginRenderPass(this.passR);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.bgR);
    this.scene(p, this.pr2, 1);
    p.end();
  },
  render(ctx, pass) {
    pass.setBindGroup(1, this.bg);
    pass.setPipeline(this.pWater); pass.draw(6);
    this.scene(pass, this.pm, 0);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.bg);
    pass.setPipeline(this.pPrint); pass.setVertexBuffer(0, this.printI); pass.draw(6, this.nPrint);
    pass.setPipeline(this.pSmoke); pass.setVertexBuffer(0, this.smokeI); pass.draw(96, this.nSmoke);
    pass.setPipeline(this.pSnow); pass.draw(6, this.nSnow);
  },

  step(a, wood) {
    const g = 0.022 + 0.01 * a.rng(), pan = this.side * 0.12;
    a.whoosh({ dur: 0.11, f0: wood ? 500 : 900, f1: wood ? 900 : 2600, q: 0.9, gain: g, peak: 0.2, pan, reverb: 0.12 });
    a.whoosh({ dur: 0.16, f0: 1400, f1: 3400, q: 0.6, gain: g * 0.6, peak: 0.5, when: a.now() + 0.06, pan, reverb: 0.12 });
    if (wood) a.whoosh({ dur: 0.12, f0: 110, f1: 170, q: 2, gain: 0.03, peak: 0.15, pan, reverb: 0.2 });
  },
  audio(ctx, a) {
    a.setReverb({ seconds: 4.5, damp: 0.6, wet: 0.8 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 380, q: 0.6, gain: 0.045, mod: 0.6, modRate: 0.045, gainMod: 0.55 });          // wind
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 140, gain: 0.05, mod: 0.3, modRate: 0.03 });
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 3000, q: 1.5, gain: 0.004, mod: 0.5, modRate: 0.08, gainMod: 0.9 });          // dry snow hiss
    a.drone({ freq: a.hz(38), partials: [1, 2, 3.01], gain: 0.018, cutoff: 420 });
    // aurora hum: a very soft, slowly turning high pad
    a.pad({ chords: [[74, 81, 86, 90], [72, 79, 84, 91], [69, 76, 83, 88], [71, 78, 86, 93]], gain: 0.011, attack: 8, change: [20, 36], cutoff: 2600, type: 'sine', reverb: 0.9 });
    // water lapping under the pier
    const lap = a.spatial({ pos: [PIER[0], 0, PIER[2] + 6], ref: 9, rolloff: 1, reverb: 0.25, gain: 1 });
    a.every(1.6, 4.2, (when) => a.whoosh({ dur: 0.7 + a.rng() * 0.6, f0: 300, f1: 700 + a.rng() * 500, q: 1.2, gain: 0.035, when, bus: lap }), { startDelay: 2 });
    a.every(38, 95, (when) => a.creak ? a.creak({ when, gain: 0.02, pan: a.rng.range(-0.7, 0.7), reverb: 0.5 }) : 0, { startDelay: 25 });
    a.every(120, 260, (when) => {                                                                                             // a dog, far across the water
      const pan = a.rng.range(-0.8, 0.8), n = 2 + a.rng.int(2);
      for (let i = 0; i < n; i++) {
        const w = when + i * (0.34 + a.rng() * 0.1);
        a.chirp({ f0: 360, f1: 250, dur: 0.11, gain: 0.006, when: w, pan, reverb: 0.95 });
        a.whoosh({ dur: 0.13, f0: 500, f1: 900, q: 2.5, gain: 0.008, when: w, pan, reverb: 0.95 });
      }
    }, { startDelay: 70 });
    const notes = a.scale(74, 'pentatonic', 2);
    a.every(18, 44, (when) => a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.005, decay: 7, when, pan: a.rng.range(-0.6, 0.6), reverb: 0.95 }), { startDelay: 9 });
  },
};
