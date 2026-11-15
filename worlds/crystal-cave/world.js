// Kryštálová jaskyňa — a hall of giant selenite beams and amethyst geodes. See NOTES.md.
import { WL, POOL, DOOR, SHAFT, floorY, sdfWorld, placeCrystals, buildMesh, crystalGeo, detailMips } from './cave.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';
import MOTES from './motes.wgsl';
import MOTESD from './motesdraw.wgsl';

const yawTo = (x, z, tx, tz) => Math.atan2(x - tx, z - tz);
const look = (x, y, z, tx, ty, tz, t) => ({ pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t });
const eye = (x, z, h = 1.6) => floorY(x, z) + h;
// fly-through: walk the loop hall -> pool -> shaft chamber -> hall -> door chamber -> geode alcove
const PATH = [[-8, 0], [6, -2], [20, -6], [30, -9], [33, -17], [29, -25], [22, -33], [14, -40], [5, -40], [3.5, -30], [3, -17], [-6, -6], [-20, -5], [-31, -8.5], [-37.5, -9.8],
  [-31, -8], [-21, -4], [-10, 6], [-4, 15], [-5, 23], [-5.5, 27.5]];
function flyPath() {
  const out = [];
  let prev = 0;
  for (let i = 0; i < PATH.length; i++) {
    const p = PATH[i], a = PATH[Math.max(i - 1, 0)], b = PATH[Math.min(i + 1, PATH.length - 1)];
    let yaw = i === 14 ? Math.PI / 2 : yawTo(a[0], a[1], b[0], b[1]);
    if (i === 15 || i === 16) yaw = Math.PI / 2 + (i - 14) * 1.25;      // turn around in front of the door
    while (yaw - prev > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - prev < -Math.PI) yaw += 2 * Math.PI;
    prev = yaw;
    out.push({ pos: [p[0], eye(p[0], p[1], 1.9), p[1]], yaw, pitch: i === 7 || i === 8 ? 0.25 : 0.03 });
  }
  return out;
}
const DROPS = 5;

export default {
  id: 'crystal-cave',
  title: 'Kryštálová jaskyňa',
  movement: 'walk',
  spawn: { pos: [-8, eye(-8, 0), 0], yaw: -Math.PI / 2, pitch: 0.06 },
  poses: [
    look(-8, eye(-8, 0, 1.8), 0, 10, 5.5, -1),               // hall with the giant beams
    look(-3.2, eye(-3.2, 26.5), 26.5, -11, 2.6, 33.5),        // amethyst geode alcove
    look(28.5, eye(28.5, -9.5), -9.5, 42, -0.8, -15),        // pool reflection
    look(4.5, eye(4.5, 5), 5, 12.5, 2.6, 12),                    // dispersion caustics on rock
    look(-2.5, eye(-2.5, -39), -39, 8.5, 8.5, -45.5),        // shaft of moonlight
    look(-37.6, eye(-37.6, -9.2, 1.7), -9.2, -42, 1.2, -10),      // the door in its chamber
  ],
  flythrough: flyPath(),
  flythroughDuration: 60,
  doors: [{ pos: DOOR, yaw: Math.PI / 2, to: 'spirit-forest' }],
  bounds: { min: [-56, -4, -60], max: [62, 30, 42] },
  env: { sunDir: [0.25, 1, 0.15], sunColor: [0.1, 0.11, 0.17], fogColor: [0.011, 0.011, 0.026], fogDensity: 0.011,
    ambientSky: [0.05, 0.06, 0.11], ambientGround: [0.03, 0.025, 0.05] },
  post: { exposure: 1.15, bloom: 0.17, bloomThreshold: 0.95, bloomKnee: 0.5, bloomRadius: 1.2, vignette: 0.3, saturation: 1.08 },
  clearColor: [1.5, 2.1, 3.2],          // only ever seen through the chimney: the moonlit sky
  doorLight: [0.13, 0.11, 0.17],
  eyeHeight: 1.6,

  heightAt(x, z) { return floorY(x, z); },
  sdf(x, y, z) { return sdfWorld(x, y, z); },

  async init(ctx, progress) {
    const M = ctx.mesh, lv = ctx.q.level, dev = ctx.device;
    const cr = placeCrystals(lv);
    await progress(0.06);
    const cave = await buildMesh(cr.lights, progress);
    this.lights = cr.lights;
    this.vb = ctx.buffer(cave.verts, 'vertex'); this.ib = ctx.buffer(cave.idx, 'index'); this.ni = cave.idx.length;
    this.cmesh = M.upload(crystalGeo());
    this.cinst = ctx.buffer(cr.inst, 'vertex'); this.nc = cr.n;

    // rock detail texture
    const mips = detailMips(256);
    const tex = ctx.texture(256, 256, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, { mips: mips.length });
    mips.forEach((d, i) => ctx.queue.writeTexture({ texture: tex, mipLevel: i }, d, { bytesPerRow: (256 >> i) * 4 }, [256 >> i, 256 >> i]));
    const dL = ctx.layout(['texture', 'sampler']);
    this.dBG = ctx.bindGroup(dL, [tex.createView(), ctx.samplers.repeat]);

    // planar reflection target for the pool
    const RW = [384, 640, 960][lv], RH = RW * 9 / 16;
    const rt = ctx.texture(RW, RH, ctx.hdrFormat, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT);
    const rd = ctx.texture(RW, RH, 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
    const fc = this.env.fogColor;
    this.rp = {
      colorAttachments: [{ view: rt.createView(), clearValue: [fc[0], fc[1], fc[2], 1], loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: rd.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
    this.dropData = new Float32Array(DROPS * 4); this.dropCycle = new Int32Array(DROPS).fill(-1e9);
    this.dropBuf = ctx.buffer(this.dropData, 'uniform');
    const fL = ctx.layout(['uniform', 'texture', 'sampler']);
    this.fBG = ctx.bindGroup(fL, [this.dropBuf, rt.createView(), ctx.samplers.linear]);

    const scene = ctx.shader(COMMON + SCENE, 'scene'), fx = ctx.shader(COMMON + FX, 'fx');
    const v4 = (n, step) => ({ arrayStride: n * 16, stepMode: step, attributes: Array.from({ length: n }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) });
    const rockL = v4(4, 'vertex'), IL = M.instanceLayout(['float32x4', 'float32x4', 'float32x4', 'float32x4', 'float32x4'], 3);
    const P = (d) => ctx.pipelineAsync(d);
    const rock = { module: scene, vs: 'vsRock', buffers: [rockL] }, cry = { module: scene, vs: 'vsCry', fs: 'fsCry', buffers: [M.layout, IL] };
    const ref = { cull: 'front', constants: { MIRROR: 1 } };
    await progress(0.92);
    [this.pPre, this.pRock, this.pCry, this.pRockR, this.pCryR, this.pWater, this.pDrop, this.pShaft, this.pShaftIn, this.pHalo, this.pMote] = await Promise.all([
      P({ ...rock, fs: 'fsPre', writeMask: 0, layouts: [dL], label: 'pre' }),
      P({ ...rock, fs: 'fsRock', layouts: [dL], depthCompare: 'equal', depthWrite: false, label: 'rock' }),
      P({ ...cry, label: 'crystal' }),
      P({ ...rock, fs: 'fsRockRef', ...ref, label: 'rockR' }),
      P({ ...cry, ...ref, label: 'crystalR' }),
      P({ module: fx, vs: 'vsWater', fs: 'fsWater', buffers: [M.layout], layouts: [fL], blend: 'premul', cull: 'none', label: 'water' }),
      P({ module: fx, vs: 'vsDrop', fs: 'fsDrop', layouts: [fL], blend: 'add', cull: 'none', label: 'drop' }),
      P({ module: fx, vs: 'vsShaft', fs: 'fsShaft', buffers: [M.layout], blend: 'add', label: 'shaft' }),
      P({ module: fx, vs: 'vsShaft', fs: 'fsShaft', buffers: [M.layout], blend: 'add', cull: 'front', depthTest: false, label: 'shaftIn' }),
      P({ module: fx, vs: 'vsHalo', fs: 'fsHalo', buffers: [v4(2, 'instance')], blend: 'add', cull: 'none', label: 'halo' }),
      P({ code: COMMON + MOTESD, layouts: [ctx.layout(['storage'])], blend: 'add', cull: 'none', label: 'motes' }),
    ]);
    this.water = M.upload(M.plane(34, 34, 48, 48));
    this.box = M.upload(M.box(1, 1, 1));

    // light pools
    const L = cr.lights, h = [];
    for (let i = 0; i < L.length; i += 12) if (L[i + 10] === 0) h.push(L[i], L[i + 1], L[i + 2], 1.6 + L[i + 3] * 1.6, L[i + 4] * 0.014, L[i + 5] * 0.014, L[i + 6] * 0.014, L[i + 8]);
    this.halo = ctx.buffer(new Float32Array(h), 'vertex'); this.nh = h.length / 8;

    // dust motes
    const nm = this.nm = [700, 1600, 3200][lv], md = new Float32Array(nm * 8), rng = ctx.rng;
    for (let i = 0; i < nm; i++) md.set([rng.range(-15, 15), rng.range(-4, 12), rng.range(-15, 15), i * 1.37, 0, 0, 0, 0], i * 8);
    const mb = ctx.buffer(md, 'storage'), sL = ctx.layout(['storage-rw']);
    this.pSim = ctx.compute({ code: COMMON + MOTES, entry: 'sim', layouts: [sL] });
    this.simBG = ctx.bindGroup(sL, [mb]);
    this.moteBG = ctx.bindGroup(this.pMote.getBindGroupLayout(1), [mb]);
    this.near = 0; this.tick = 0;
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    const e = cam.eye, D = this.dropData;
    // pool drops: each slot repeats with its own period; impact 2 s into its cycle at a hashed spot
    for (let i = 0; i < DROPS; i++) {
      const P = 11 + i * 3.1, off = i * 4.3, c = Math.floor((t + off) / P), start = c * P - off + 2;
      const h = ctx.noise.pcg(c * 16 + i), a = ctx.noise.u2f(h) * 6.283, r = 1 + 5.2 * ctx.noise.u2f(ctx.noise.pcg(h));
      D[i * 4] = POOL[0] + Math.cos(a) * r; D[i * 4 + 1] = POOL[1] + Math.sin(a) * r; D[i * 4 + 2] = start; D[i * 4 + 3] = 0.6 + 0.4 * ctx.noise.u2f(h >>> 3);
      if (ctx.audio && t >= start && this.dropCycle[i] !== c) {
        if (this.dropCycle[i] > -1e8 && t - start < 0.2) this.drip(ctx.audio, D[i * 4], D[i * 4 + 1], e);
        this.dropCycle[i] = c;
      }
    }
    ctx.write(this.dropBuf, D);
    const px = POOL[0] - e[0], pz = POOL[1] - e[2], pd = Math.hypot(px, pz);
    this.poolVis = pd < 44 && (pd < 19 || (px * cam.fwd[0] + pz * cam.fwd[2]) / pd > -0.15);
    this.inShaft = Math.abs(e[0] - 10) < 7.9 && Math.abs(e[1] - 14.6) < 15.4 && Math.abs(e[2] + 46.6) < 7.4;
    // how close the nearest crystal light is (drives the singing bowls)
    if (ctx.audio && (this.tick++ & 31) === 0) {
      const L = this.lights; let m = 1e9;
      for (let i = 0; i < L.length; i += 12) { const d = (L[i] - e[0]) ** 2 + (L[i + 1] - e[1]) ** 2 + (L[i + 2] - e[2]) ** 2; if (d < m) m = d; }
      this.near = 1 / (1 + m / 60);
    }
  },
  drip(a, x, z, e) {
    const d = Math.hypot(x - e[0], z - e[2]);
    a.chirp({ f0: a.rng.range(1500, 2300), f1: a.rng.range(700, 1000), dur: 0.06, gain: 0.03 / (1 + d / 9), reverb: 0.85, pan: a.rng.range(-0.5, 0.5) });
  },

  computeBefore(ctx, enc) {
    const c = ctx.beginCompute(enc);
    c.setPipeline(this.pSim); c.setBindGroup(1, this.simBG); c.dispatchWorkgroups(Math.ceil(this.nm / 64)); c.end();
    if (!this.poolVis) return;
    const p = enc.beginRenderPass(this.rp);
    p.setBindGroup(0, ctx.globalsBindGroup);
    p.setPipeline(this.pRockR); p.setVertexBuffer(0, this.vb); p.setIndexBuffer(this.ib, 'uint32'); p.drawIndexed(this.ni);
    this.drawCrystals(p, this.pCryR);
    p.end();
  },
  drawCrystals(p, pipe) {
    const m = this.cmesh;
    p.setPipeline(pipe); p.setVertexBuffer(0, m.vertexBuffer); p.setVertexBuffer(1, this.cinst); p.setIndexBuffer(m.indexBuffer, m.indexFormat);
    p.drawIndexed(m.indexCount, this.nc);
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.dBG);
    pass.setVertexBuffer(0, this.vb); pass.setIndexBuffer(this.ib, 'uint32');
    pass.setPipeline(this.pPre); pass.drawIndexed(this.ni);
    pass.setPipeline(this.pRock); pass.drawIndexed(this.ni);
    this.drawCrystals(pass, this.pCry);
  },

  renderTransparent(ctx, pass) {
    if (this.poolVis) {
      const w = this.water;
      pass.setPipeline(this.pWater); pass.setBindGroup(1, this.fBG);
      pass.setVertexBuffer(0, w.vertexBuffer); pass.setIndexBuffer(w.indexBuffer, w.indexFormat); pass.drawIndexed(w.indexCount);
      pass.setPipeline(this.pDrop); pass.draw(6, DROPS);
    }
    const b = this.box;
    pass.setPipeline(this.inShaft ? this.pShaftIn : this.pShaft);
    pass.setVertexBuffer(0, b.vertexBuffer); pass.setIndexBuffer(b.indexBuffer, b.indexFormat); pass.drawIndexed(b.indexCount);
    pass.setPipeline(this.pHalo); pass.setVertexBuffer(0, this.halo); pass.draw(6, this.nh);
    pass.setPipeline(this.pMote); pass.setBindGroup(1, this.moteBG); pass.draw(6, this.nm);
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 6.5, damp: 0.5, wet: 0.95, predelay: 0.04 });
    a.drone({ freq: a.hz(26), partials: [1, 2, 3, 4.02, 6.01], amps: [1, 0.6, 0.3, 0.12, 0.05], detune: 5, cutoff: 260, gain: 0.05, attack: 6 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 150, gain: 0.035, mod: 0.4, modRate: 0.03 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 900, q: 1.5, gain: 0.006, mod: 0.6, modRate: 0.02 });
    a.pad({ chords: [[62, 69, 74, 81], [60, 67, 74, 79], [57, 64, 72, 76], [55, 62, 69, 74]], gain: 0.012, attack: 8, change: [22, 40], cutoff: 1600, type: 'sine', reverb: 0.8 });
    // crystal singing: bowl-like inharmonic tones, louder when you stand near crystals
    const notes = a.scale(62, 'pentatonic', 2);
    a.every(7, 17, (when) => a.additive({ freq: a.hz(a.rng.pick(notes)), partials: [1, 0.45, 0.22, 0.08], ratios: [1, 2.76, 5.4, 8.93], attack: 1.4, decay: 8,
      gain: 0.012 + 0.026 * this.near, reverb: 0.85, pan: a.rng.range(-0.6, 0.6), when }), { startDelay: 5 });
    // far drips somewhere in the dark
    a.every(5, 13, (when) => a.chirp({ f0: a.rng.range(1700, 2600), f1: 900, dur: 0.05, gain: 0.008, reverb: 0.95, pan: a.rng.range(-0.9, 0.9), when }));
  },
};
