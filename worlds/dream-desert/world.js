// Púšť snov — a slot canyon of light beams and dancing dust that opens onto night dunes with glowing creatures. See NOTES.md.
import { cx, ground, sdRock, meshBox, terrain, detailMips, DOOR, ARCH, BEAMS, BLEN, dusk } from './geo.js';
import { makeLife, lizardAt, RINGS, NLZ, NSN } from './life.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import SKY from './sky.wgsl';
import BAKE from './bake.wgsl';
import LIFE from './life.wgsl';
import FX from './fx.wgsl';

const HORIZ = [0.032, 0.022, 0.07], WARMFOG = [0.3, 0.05, 0.1];
const v3 = (a) => `vec3f(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;
const HDR = `const NB = 3; const BLEN = ${BLEN}.0; const DOORP = ${v3(DOOR)}; const HORIZ = ${v3(HORIZ)};
const BF = array<vec3f, 3>(${BEAMS.map((b) => v3(b.f))}); const BD = array<vec3f, 3>(${BEAMS.map((b) => v3(b.d))});\n` + COMMON;

const yawTo = (x, z, tx, tz) => Math.atan2(x - tx, z - tz);
const look = (x, y, z, tx, ty, tz, t) => ({ pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t });
const eye = (x, z, h = 1.6) => ground(x, z) + h;
const B0 = BEAMS[0].f, LZ = lizardAt(0, 10);
const lizPose = () => {
  const [x, y, z, fx, fz] = LZ, sx = -fz, sz = fx, px = x + fx * 1.25 + sx * 1.45, pz = z + fz * 1.25 + sz * 1.45;
  return look(px, ground(px, pz) + 0.62, pz, x - fx * 0.75, y + 0.12, z - fz * 0.75);
};
function flyPath() {
  const P = [[1, 64], [-1.5, 58.5], [-2, 52], [-4.5, 45], [cx(39), 39]];
  for (let z = 33; z >= -33; z -= 6) P.push([cx(z) + (Math.abs(z - 9) < 4 || Math.abs(z + 7) < 4 || Math.abs(z + 23) < 4 ? -1 : 0), z]);
  P.push([cx(-39), -39], [-5, -47], [-1, -57], [8, -68], [17, -79], [ARCH[0] - 1.5, ARCH[2] + 1], [31, -97], [42, -92]);
  const out = [];
  let prev = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
    let yaw = yawTo(a[0], a[1], b[0], b[1]);
    while (yaw - prev > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - prev < -Math.PI) yaw += 2 * Math.PI;
    prev = yaw;
    out.push({ pos: [p[0], eye(p[0], p[1], 1.75), p[1]], yaw, pitch: 0.04 });
  }
  return out;
}

export default {
  id: 'dream-desert',
  title: 'Dream Desert',
  movement: 'walk',
  spawn: { pos: [cx(22), eye(cx(22), 22), 22], yaw: yawTo(cx(22), 22, B0[0], B0[2]), pitch: 0.05 },
  poses: [
    look(cx(18.5) + 0.2, eye(cx(18.5), 18.5), 18.5, B0[0], 2.6, B0[2]),                 // beam and dancing dust
    look(cx(1.5), eye(cx(1.5), 1.5), 1.5, cx(-3) + 2.6, 3.6, -3),                       // flowing strata, close
    look(cx(-30), eye(cx(-30), -30), -30, cx(-39) - 0.5, 2.4, -44),                      // canyon exit onto the dunes
    look(-12, eye(-12, -49, 2.2), -49, -8, eye(-12, -49) + 16, -110),                   // dunes under the Milky Way
    lizPose(),                                                                          // glowing lizard and its tracks
    look(DOOR[0] + 2.6, DOOR[1] + 1.5, DOOR[2] - 6.6, DOOR[0], DOOR[1] + 1.25, DOOR[2]), // the door on its dune
  ],
  flythrough: flyPath(),
  flythroughDuration: 60,
  doors: [{ pos: DOOR, yaw: Math.PI, to: 'light-library' }],
  bounds: { center: [0, 0, -15], radius: 150 },
  env: { sunDir: [0.35, 0.4, -0.78], sunColor: [0.2, 0.19, 0.42], fogColor: HORIZ, fogDensity: 0.0035,
    ambientSky: [0.035, 0.04, 0.11], ambientGround: [0.012, 0.035, 0.05] },
  post: { exposure: 1.25, bloom: 0.15, bloomThreshold: 0.9, bloomKnee: 0.6, bloomRadius: 1.1, vignette: 0.3, saturation: 1.1 },
  clearColor: HORIZ,
  doorLight: [0.16, 0.11, 0.2],
  eyeHeight: 1.6,

  heightAt(x, z) { return ground(x, z); },
  sdf(x, y, z) { return sdRock(x, y, z); },

  async init(ctx, progress) {
    const lv = ctx.q.level, M = ctx.mesh, dev = ctx.device;
    const life = this.life = makeLife(lv);
    await progress(0.04);
    const ter = terrain([320, 448, 520][lv], life.glows);
    await progress(0.2);
    const mesa = await meshBox(-37.5, -1.6, -44, 37.5, 21, 44, [0.4, 0.34, 0.3][lv], (f) => progress(0.2 + 0.6 * f));
    const arch = await meshBox(ARCH[0] - 11, ARCH[1] - 3, ARCH[2] - 11, ARCH[0] + 11, ARCH[1] + 9.5, ARCH[2] + 11, 0.3);
    await progress(0.85);
    const up = (m) => ({ vb: ctx.buffer(m.verts, 'vertex'), ib: ctx.buffer(m.idx, 'index'), n: m.idx.length });
    this.geo = [up(mesa), up(arch)]; this.ter = up(ter);

    // textures: rock/sand detail, baked night sky
    const mips = detailMips(256), TEX = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
    const tex = ctx.texture(256, 256, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, { mips: mips.length });
    mips.forEach((d, i) => ctx.queue.writeTexture({ texture: tex, mipLevel: i }, d, { bytesPerRow: (256 >> i) * 4 }, [256 >> i, 256 >> i]));
    const skyTex = ctx.texture(2048, 640, 'rgba16float', TEX);
    {
      const pipe = ctx.pipeline({ code: HDR + BAKE, format: 'rgba16float', depthFormat: null, cull: 'none' });
      const enc = dev.createCommandEncoder();
      const p = enc.beginRenderPass({ colorAttachments: [{ view: skyTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.setBindGroup(0, ctx.globalsBindGroup); p.setPipeline(pipe); p.draw(3); p.end();
      ctx.queue.submit([enc.finish()]);
    }
    // stars: round sprites, power-law brightness, crowded toward the Milky Way
    const ns = this.ns = [1600, 2800, 3800][lv], sd = new Float32Array(ns * 8), rng = ctx.rng;
    const SC = [[1, 0.78, 0.55], [1, 0.95, 0.88], [0.66, 0.8, 1], [0.8, 0.86, 1], [1, 0.45, 0.75], [0.4, 0.95, 0.9]];
    for (let i = 0; i < ns;) {
      const y = rng(), a = rng() * 6.283, h = Math.sqrt(1 - y * y), x = Math.cos(a) * h, z = Math.sin(a) * h, d = x * 0.894 - y * 0.447;
      if (rng() > 0.3 + 0.7 * Math.exp(-d * d / 0.05)) continue;
      const c = SC[rng() < 0.12 ? 4 + rng.int(2) : rng.int(4)], I = Math.min(0.1 * Math.pow(rng(), -0.8), 5);
      sd.set([x, y, z, I, c[0], c[1], c[2], rng()], i++ * 8);
    }
    this.stars = ctx.buffer(sd, 'vertex');

    const gL = ctx.layout(['texture', 'sampler', 'uniform']), sL = ctx.layout(['texture', 'sampler']), tL = ctx.layout(['storage', 'storage']);
    this.dL = ctx.layout(['texture-depth']);
    this.lightBuf = ctx.buffer(life.lights, 'uniform');
    this.gBG = ctx.bindGroup(gL, [tex.createView(), ctx.samplers.repeat, this.lightBuf]);
    this.sBG = ctx.bindGroup(sL, [skyTex.createView(), dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat' })]);
    this.ptsBuf = ctx.buffer(life.pts, 'storage'); this.tubeBuf = ctx.buffer(life.tubes, 'storage');
    this.tBG = ctx.bindGroup(tL, [this.ptsBuf, this.tubeBuf]);
    this.dynPts = life.pts.subarray(0, life.nDynPts * 4); this.dynTubes = life.tubes.subarray(0, life.nDynTubes * 12);
    this.printBuf = ctx.buffer(life.prints, 'vertex'); this.haloBuf = ctx.buffer(life.halos, 'vertex');

    const scene = ctx.shader(HDR + SCENE, 'scene'), sky = ctx.shader(HDR + SKY, 'sky'), lifeM = ctx.shader(HDR + LIFE, 'life'), fx = ctx.shader(HDR + FX, 'fx');
    const v4 = (n, step) => ({ arrayStride: n * 16, stepMode: step, attributes: Array.from({ length: n }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) });
    const P = (d) => ctx.pipelineAsync(d), add = { blend: 'add', cull: 'none' };
    [this.pSky, this.pStar, this.pRock, this.pTer, this.pTube, this.pTrail, this.pPrint, this.pHalo, this.pMote, this.pBeam] = await Promise.all([
      P({ module: sky, layouts: [sL], depthTest: false, depthWrite: false, cull: 'none', label: 'sky' }),
      P({ module: sky, vs: 'vsStar', fs: 'fsStar', buffers: [v4(2, 'instance')], ...add, depthTest: false, label: 'star' }),
      P({ module: scene, fs: 'fsRock', buffers: [v4(3, 'vertex')], layouts: [gL], label: 'rock' }),
      P({ module: scene, fs: 'fsTer', buffers: [v4(3, 'vertex')], layouts: [gL], label: 'sand' }),
      P({ module: lifeM, vs: 'vsTube', fs: 'fsTube', layouts: [tL], cull: 'none', label: 'tube' }),
      P({ module: lifeM, vs: 'vsTube', fs: 'fsTrail', layouts: [tL], ...add, label: 'trail' }),
      P({ module: lifeM, vs: 'vsPrint', fs: 'fsPrint', buffers: [v4(3, 'instance')], ...add, label: 'print' }),
      P({ module: lifeM, vs: 'vsHalo', fs: 'fsHalo', buffers: [v4(2, 'instance')], ...add, label: 'halo' }),
      P({ module: fx, vs: 'vsMote', fs: 'fsMote', ...add, label: 'mote' }),
      P({ module: fx, vs: 'vsBeam', fs: 'fsBeam', layouts: [this.dL], blend: 'add', depthFormat: null, label: 'beam' }),
    ]);
    this.nm = [900, 1700, 2600][lv] * 3;
    this.k = -1; this.ka = -1; this.inside = false;
    this.resize(ctx);
    await progress(1);
  },
  resize(ctx) {
    if (!ctx.depthView) return;
    this.dv = ctx.depthView;
    this.dBG = ctx.bindGroup(this.dL, [ctx.depthView]);
    this.passB = { colorAttachments: [{ view: ctx.hdrView, loadOp: 'load', storeOp: 'store' }] };
  },

  update(ctx, dt, t, cam) {
    const L = this.life, e = cam.eye, env = ctx.env;
    L.update(t);
    ctx.write(this.ptsBuf, this.dynPts); ctx.write(this.tubeBuf, this.dynTubes); ctx.write(this.printBuf, L.prints); ctx.write(this.lightBuf, L.lights);
    // dusk in the canyon -> night on the dunes
    const k = this.k = dusk(e[0], e[2]);
    env.params[0] = k;
    for (let i = 0; i < 3; i++) env.fogColor[i] = HORIZ[i] + (WARMFOG[i] - HORIZ[i]) * k;
    env.fogDensity = 0.0035 + 0.005 * k;
    this.inside = Math.abs(e[0]) < 75 && Math.abs(e[2]) < 85;
    if (ctx.audio && this.aCan && Math.abs(k - this.ka) > 0.03) { this.ka = k; this.aCan.set(k, 1.5); this.aDun.set(1 - 0.85 * k, 1.5); }
  },

  render(ctx, pass) {
    pass.setPipeline(this.pSky); pass.setBindGroup(1, this.sBG); pass.draw(3);
    if (this.k < 0.99) { pass.setPipeline(this.pStar); pass.setVertexBuffer(0, this.stars); pass.draw(6, this.ns); }
    pass.setBindGroup(1, this.gBG);
    pass.setPipeline(this.pRock);
    for (let i = 0; i < 2; i++) { const g = this.geo[i]; pass.setVertexBuffer(0, g.vb); pass.setIndexBuffer(g.ib, 'uint32'); pass.drawIndexed(g.n); }
    const g = this.ter;
    pass.setPipeline(this.pTer); pass.setVertexBuffer(0, g.vb); pass.setIndexBuffer(g.ib, 'uint32'); pass.drawIndexed(g.n);
    pass.setPipeline(this.pTube); pass.setBindGroup(1, this.tBG);
    pass.draw(RINGS[0] * 60, NLZ + NSN, 0, 0);
    pass.draw(RINGS[1] * 60, NLZ * 4, 0, NLZ + NSN);
    pass.draw(RINGS[3] * 60, this.life.nPlantTubes, 0, this.life.nDynTubes);
  },

  renderTransparent(ctx, pass) {
    const L = this.life;
    pass.setPipeline(this.pPrint); pass.setVertexBuffer(0, this.printBuf); pass.draw(6, L.nPrints);
    pass.setPipeline(this.pTrail); pass.setBindGroup(1, this.tBG); pass.draw(RINGS[2] * 60, NSN, 0, NLZ * 5 + NSN);
    pass.setPipeline(this.pHalo); pass.setVertexBuffer(0, this.haloBuf); pass.draw(6, L.halos.length / 8);
    if (this.inside) { pass.setPipeline(this.pMote); pass.draw(6, this.nm); }
  },

  afterScene(ctx, enc) {
    if (!this.inside) return;
    if (this.dv !== ctx.depthView) this.resize(ctx);
    const p = enc.beginRenderPass(this.passB);
    p.setViewport(0, 0, ctx.renderWidth, ctx.renderHeight, 0, 1); p.setScissorRect(0, 0, ctx.renderWidth, ctx.renderHeight);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.dBG); p.setPipeline(this.pBeam); p.draw(3); p.end();
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 5, damp: 0.5, wet: 0.9, predelay: 0.03 });
    const can = this.aCan = a.bus({ gain: 0, reverb: 0.6 }), dun = this.aDun = a.bus({ gain: 1, reverb: 0.3 });
    a.drone({ freq: a.hz(33), partials: [1, 2, 3, 4.01, 5.02], amps: [1, 0.5, 0.25, 0.1, 0.05], detune: 6, cutoff: 320, gain: 0.05, attack: 6 });
    // canyon: wind whistling through the slot, resonant tones
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 640, q: 10, gain: 0.02, mod: 0.5, modRate: 0.05, bus: can });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 965, q: 14, gain: 0.011, mod: 0.6, modRate: 0.033, bus: can });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 240, gain: 0.05, mod: 0.4, modRate: 0.04, bus: can });
    a.pad({ chords: [[50, 57, 62, 69], [48, 55, 64, 67], [53, 57, 60, 69], [45, 52, 60, 64]], gain: 0.016, attack: 7, change: [18, 34], cutoff: 1300, type: 'sine', reverb: 0.8, bus: can });
    // dunes: sand hiss, sparse harp notes, small creature chirps
    a.noiseBed({ color: 'white', filter: 'highpass', freq: 3800, gain: 0.005, mod: 0.7, modRate: 0.08, bus: dun });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 420, q: 0.7, gain: 0.022, mod: 0.5, modRate: 0.04, bus: dun });
    const notes = a.scale(50, 'pentatonic', 3);
    a.every(4, 12, (when) => {
      const i = a.rng.int(notes.length - 3), n = 1 + a.rng.int(3);
      for (let k = 0; k < n; k++) a.pluck({ freq: a.hz(notes[i + k]), decay: 3.5, gain: 0.03 - 0.006 * k, reverb: 0.7, pan: a.rng.range(-0.5, 0.5), bus: dun, when: when + k * a.rng.range(0.22, 0.4) });
    }, { startDelay: 4 });
    a.every(8, 22, (when) => a.chirp({ f0: a.rng.range(2300, 3400), f1: a.rng.range(2700, 3900), dur: 0.06, repeat: 2 + a.rng.int(3), gap: 0.1, vib: 0.02, gain: 0.006,
      reverb: 0.5, pan: a.rng.range(-0.9, 0.9), bus: dun, when }), { startDelay: 7 });
    this.ka = -1;
  },
};
