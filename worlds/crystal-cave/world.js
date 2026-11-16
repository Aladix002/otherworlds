// Kryštálová jaskyňa — a hall of giant selenite beams and amethyst geodes. See NOTES.md.
import { WL, POOL, DOOR, OC, SW, POND, SAL, STREAM, FALL, FLOWERS, riftW, floorY, sdfWorld, placeCrystals, buildMesh, crystalGeo, detailMips, salGeo, streamGeo, fallGeo } from './cave.js';
import { makeRng } from '../../core/src/math.js';
import COMMON0 from './common.wgsl';
import LIFE from './life.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';
import MOTES from './motes.wgsl';
import MOTESD from './motesdraw.wgsl';

const yawTo = (x, z, tx, tz) => Math.atan2(x - tx, z - tz);
const look = (x, y, z, tx, ty, tz, t) => ({ pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t });
// the stream constants of the WGSL floor twin come from cave.js
const COMMON = `const OC=vec3f(${OC});const SW=${SW};const NST=${STREAM.length};const ST=array<vec2f,${STREAM.length}>(${STREAM.map((p) => `vec2f(${p[0]},${p[1]})`).join(',')});const PONDC=vec2f(${POND[0]},${POND[1]});` + COMMON0;
const heightAt = (x, z) => { const h = floorY(x, z); return Math.abs(z - 18) < 1 && Math.abs(x - 31) < 4 ? Math.max(h, 0.45) : h; };
const eye = (x, z, h = 1.6) => heightAt(x, z) + h;
// fly-through: hall -> hidden passage -> bridge over the rift -> around the sleeper in the citrine chamber -> back -> pool -> moonlight shaft
// -> along the stream to the mushroom grotto -> hall -> door chamber -> geode alcove. [x, z, yaw override, pitch]
const PATH = [[-8, 0], [1, 0], [10, 0], [13, 0.5], [18, 7.5], [17.5, 13.5], [25.5, 17.3], [31, 18], [34, 18], [37.5, 19.3], [44, 16.8], [51, 21.5], [45, 27.2], [41, 24.5],
  [37.5, 19.5], [31, 18], [25.5, 17.3], [17.5, 13.5], [18, 5], [15.5, -3.5], [17.5, -5.5], [26, -6.5], [30, -9], [33, -17], [29, -25], [22, -33], [14, -40], [6, -41, , 0.25],
  [-3, -40, , 0.1], [-10, -36.5], [-17, -33.5], [-23, -32.5], [-17, -27], [-12.5, -20], [-13, -12], [-15.5, -11.5], [-23, -5.5], [-31, -8.5], [-37.5, -9.8, Math.PI / 2], [-31, -8, Math.PI / 2 + 1.25], [-21, -4.5, Math.PI / 2 + 2.5], [-12.5, -5],
  [-8, 2.5], [-4.5, 10.5], [-4, 15], [-5, 23], [-5.5, 27.5]];
function flyPath() {
  const out = [];
  let prev = 0;
  for (let i = 0; i < PATH.length; i++) {
    const p = PATH[i], a = PATH[Math.max(i - 1, 0)], b = PATH[Math.min(i + 1, PATH.length - 1)];
    let yaw = p[2] ?? yawTo(a[0], a[1], b[0], b[1]);
    while (yaw - prev > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - prev < -Math.PI) yaw += 2 * Math.PI;
    prev = yaw;
    out.push({ pos: [p[0], eye(p[0], p[1], 1.9), p[1]], yaw, pitch: p[3] ?? 0.03 });
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
    look(-8, eye(-8, 0, 1.8), 0, 10, 7.6, -1.5),             // hall: giant beams and the floating heart with its orbiting crystals
    look(-3.4, eye(-3.4, 26.6, 1.5), 26.6, -10.5, 3.4, 34.5),        // amethyst geode alcove
    look(28.5, eye(28.5, -9.5), -9.5, 42, -0.8, -15),        // pool reflection
    look(-19.5, eye(-19.5, -30.5, 2.3), -30.5, -28.5, 2.6, -34),       // mushroom grotto: waterfall, pond and stream
    look(27.4, eye(27.4, 14.8, 1.9), 14.8, 34.5, -0.2, 19.8),           // the selenite bridge over the rift, the citrine chamber beyond
    look(41.6, eye(41.6, 19.6, 1.5), 19.6, 46.3, 0.7, 22.3),         // the sleeper
  ],
  flythrough: flyPath(),
  flythroughDuration: 75,
  doors: [{ pos: DOOR, yaw: Math.PI / 2, to: 'spirit-forest' }],
  bounds: { min: [-56, -4, -60], max: [62, 30, 42] },
  env: { sunDir: [0.25, 1, 0.15], sunColor: [0.1, 0.11, 0.17], fogColor: [0.01, 0.018, 0.034], fogDensity: 0.015,
    ambientSky: [0.05, 0.06, 0.11], ambientGround: [0.03, 0.025, 0.05] },
  post: { exposure: 1.15, bloom: 0.17, bloomThreshold: 0.95, bloomKnee: 0.5, bloomRadius: 1.2, vignette: 0.3, saturation: 1.08 },
  clearColor: [1.5, 2.1, 3.2],          // only ever seen through the chimney: the moonlit sky
  doorLight: [0.13, 0.11, 0.17],
  eyeHeight: 1.6,

  heightAt,
  sdf(x, y, z) { return sdfWorld(x, y, z); },

  async init(ctx, progress) {
    const M = ctx.mesh, lv = ctx.q.level, dev = ctx.device;
    const cr = placeCrystals(lv);
    await progress(0.06);
    const cave = await buildMesh(cr.lights, progress);
    this.lights = cr.lights;
    ctx.env.params.set(FALL); ctx.env.params2.set([0, -99, 0, -99]);
    this.oinst = ctx.buffer(cr.orb.inst, 'vertex'); this.no = cr.orb.n;
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
    const RW = [480, 960, 1280][lv], RH = RW * 9 / 16;
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

    const scene = ctx.shader(COMMON + SCENE, 'scene'), fx = ctx.shader(COMMON + FX, 'fx'), life = ctx.shader(COMMON + LIFE, 'life');
    const v4 = (n, step) => ({ arrayStride: n * 16, stepMode: step, attributes: Array.from({ length: n }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) });
    const rockL = v4(4, 'vertex'), IL = M.instanceLayout(['float32x4', 'float32x4', 'float32x4', 'float32x4', 'float32x4'], 3);
    const P = (d) => ctx.pipelineAsync(d);
    const rock = { module: scene, vs: 'vsRock', buffers: [rockL] }, cry = { module: scene, vs: 'vsCry', fs: 'fsCry', buffers: [M.layout, IL] };
    const ref = { cull: 'front', constants: { MIRROR: 1 } };
    await progress(0.92);
    [this.pPre, this.pRock, this.pCry, this.pRockR, this.pCryR, this.pWater, this.pDrop, this.pShaft, this.pShaftIn, this.pHalo, this.pMote, this.pMush, this.pSal, this.pLife, this.pStream, this.pFall, this.pCryO] = await Promise.all([
      P({ ...cry, constants: { ORBIT: 1 }, label: 'orbit' }),
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
      P({ module: life, vs: 'vsMush', fs: 'fsMush', buffers: [M.layout, M.instanceLayout(['float32x4', 'float32x4'], 3)], cull: 'none', label: 'mush' }),
      P({ module: life, vs: 'vsSal', fs: 'fsSal', buffers: [M.layout], label: 'sal' }),
      P({ module: life, vs: 'vsLife', fs: 'fsLife', buffers: [v4(3, 'instance')], blend: 'add', cull: 'none', label: 'life' }),
      P({ module: fx, vs: 'vsStream', fs: 'fsStream', buffers: [v4(1, 'vertex')], blend: 'premul', cull: 'none', label: 'stream' }),
      P({ module: fx, vs: 'vsFall', fs: 'fsFall', buffers: [v4(1, 'vertex')], blend: 'premul', cull: 'none', label: 'fall' }),
    ]).then((p) => [...p.slice(1), p[0]]);
    // mushrooms, the sleeper, stream and waterfall
    this.mush = M.upload(M.lathe([[0.001, 0], [0.085, 0], [0.065, 0.2], [0.05, 0.55], [0.06, 0.66], [0.4, 0.64], [0.44, 0.69], [0.4, 0.78], [0.29, 0.88], [0.15, 0.96], [0.001, 1]], 14));
    this.minst = ctx.buffer(cr.shrooms, 'vertex'); this.nmu = cr.shrooms.length / 8;
    this.sal = M.upload(salGeo(M));
    const sg = streamGeo(), fg = fallGeo();
    this.svb = ctx.buffer(sg.v, 'vertex'); this.sib = ctx.buffer(sg.idx, 'index'); this.sni = sg.idx.length;
    this.fvb = ctx.buffer(fg.v, 'vertex'); this.fib = ctx.buffer(fg.idx, 'index'); this.fni = fg.idx.length;
    this.water = M.upload(M.plane(34, 34, 48, 48));
    { // unit box with consistent outward winding (the shaft is shaded analytically on its faces)
      const pos = new Float32Array(24); for (let i = 0; i < 8; i++) pos.set([(i & 1) - 0.5, ((i >> 1) & 1) - 0.5, (i >> 2) - 0.5], i * 3);
      this.box = M.upload({ pos, nrm: new Float32Array(24), uv: new Float32Array(16),
        idx: new Uint32Array([0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6]) });
    }

    // light pools
    const L = cr.lights, h = [];
    h.push(FALL[0], SW + 0.5, FALL[2], 2, 0.004, 0.011, 0.008, 1, OC[0], OC[1], OC[2], 10, 0.09, 0.07, 0.14, 0);
    for (let i = 0; i < L.length; i += 12) if (L[i + 10] === 0 || L[i + 10] > 2) h.push(L[i], L[i + 1], L[i + 2], 1.6 + L[i + 3] * 1.6, L[i + 4] * 0.014 * (0.4 + L[i + 8] * 0.2), L[i + 5] * 0.014 * (0.4 + L[i + 8] * 0.2), L[i + 6] * 0.014 * (0.4 + L[i + 8] * 0.2), L[i + 8]);
    this.halo = ctx.buffer(new Float32Array(h), 'vertex'); this.nh = h.length / 8;

    // dust motes
    const nm = this.nm = [700, 1600, 3200][lv], md = new Float32Array(nm * 8), rng = ctx.rng;
    for (let i = 0; i < nm; i++) md.set([rng.range(-15, 15), rng.range(-4, 12), rng.range(-15, 15), i * 1.37, 0, 0, 0, 0], i * 8);
    const mb = ctx.buffer(md, 'storage'), sL = ctx.layout(['storage-rw']);
    this.pSim = ctx.compute({ code: COMMON + MOTES, entry: 'sim', layouts: [sL] });
    this.simBG = ctx.bindGroup(sL, [mb]);
    this.moteBG = ctx.bindGroup(this.pMote.getBindGroupLayout(1), [mb]);
    this.near = 0; this.tick = 0;

    // small life: moths around crystals and flowers, light orbs, rising spores and gold sparks, mist, blind fish
    const r2 = makeRng(4711), lf = [], put = (x, y, z, range, r, g, b, kind, size, speed, aux = 0) => lf.push(x, y, z, range, r, g, b, kind, r2(), size, speed, aux);
    for (let i = 0, k = 0; i < L.length; i += 12) {
      if (L[i + 10] !== 0 || L[i + 7] === 6 || L[i + 1] < -1 || k++ % 5) continue;
      const m = Math.max(L[i + 4], L[i + 5], L[i + 6]);
      for (let j = 0; j < 4; j++) put(L[i] + r2.range(-1, 1), L[i + 1] + r2.range(-0.5, 0.8), L[i + 2] + r2.range(-1, 1), r2.range(1.2, 2.4), 0.5 + 0.5 * L[i + 4] / m, 0.5 + 0.5 * L[i + 5] / m, 0.5 + 0.5 * L[i + 6] / m, 0, r2.range(0.05, 0.08), r2.range(0.8, 1.5));
    }
    for (let i = 0; i < FLOWERS.length; i += 3) for (let j = 0; j < 3; j++) put(FLOWERS[i], FLOWERS[i + 1] + 0.5, FLOWERS[i + 2], r2.range(0.5, 1), 0.9, 0.85, 1, 0, r2.range(0.04, 0.06), r2.range(1, 1.6));
    for (const o of [[0, 5, 2, 7, 0.7, 0.5, 1, 3], [12, 5, -4, 5, 0.7, 0.5, 1, 2], [-14, 4, 3, 5, 0.8, 0.6, 1, 2], [40, 3, -14, 6, 0.3, 0.8, 1, 3], [45, 3.5, 21, 4, 1, 0.65, 0.2, 4], [31, 3, 18, 2.5, 1, 0.7, 0.25, 2],
      [-22, 3, -34, 5, 0.3, 1, 0.55, 4], [6, 4, -43, 4, 0.6, 0.8, 1, 2], [-38, 3, -9, 3, 0.8, 0.5, 1, 2], [-6, 3, 29, 2.5, 0.8, 0.5, 1, 2]])
      for (let j = 0; j < o[7]; j++) put(o[0] + r2.range(-2, 2), o[1] + r2.range(-1, 1), o[2] + r2.range(-2, 2), o[3], o[4] * 0.5, o[5] * 0.5, o[6] * 0.5, 1, r2.range(0.28, 0.42), r2.range(0.25, 0.5));
    for (let i = 0; i < 34; i++) { const z = r2.range(9, 27); put(31 + riftW(z) + r2.range(-1.2, 1.2), -7, z, 0.8, 1, 0.62, 0.15, 2, r2.range(0.025, 0.05), r2.range(0.4, 1), 11); }
    const SH = cr.shrooms;
    for (let i = 0; i < SH.length; i += 8) if (SH[i + 3] > 0.45) for (let j = 0; j < 3; j++)
      put(SH[i] + r2.range(-0.6, 0.6), SH[i + 1] + SH[i + 3] * 0.7, SH[i + 2] + r2.range(-0.6, 0.6), 0.7, ...[[0.15, 0.8, 0.4], [0.8, 0.45, 0.1], [0.6, 0.3, 0.8]][SH[i + 7]], 2, r2.range(0.015, 0.03), r2.range(0.5, 1.2), 2.6);
    for (let i = 0; i < 26; i++) put(FALL[0] + r2.range(-1.1, 1.1), SW, FALL[2] + r2.range(-1.1, 1.1), 0.5, 0.5, 0.9, 0.75, 2, r2.range(0.02, 0.045), r2.range(1.5, 4), 9);      // drops rising with the waterfall
    // crystal jellyfish drifting through the air, and the tiny nebula in the heart of the geode
    for (const j of [[-3, 6.5, 5, 7], [7, 5.5, -9, 6], [15, 8, 5, 5], [-13, 7, -7, 6], [2, 9, -3, 6], [38, 4.5, -12, 6], [44, 4, -18, 4], [6, 6, -42, 4], [45, 5, 23, 3], [-21, 4.5, -33, 3.5]])
      put(j[0], j[1], j[2], j[3], 0.75, 0.8, 1, 4, r2.range(0.4, 0.75), r2.range(0.2, 0.35));
    put(-6, 3.4, 30.6, 0, 0.3, 1, 1, 5, 2.3, 1); put(-6.2, 3.3, 31.2, 0, 0.7, 1, 1, 5, 1.6, 1.3);
    for (let i = 0; i < 14; i++) put(POOL[0], WL + 0.004, POOL[1], r2.range(1.5, 6), 1, 0.92, 0.88, 3, r2.range(0.22, 0.4), r2.sign() * r2.range(0.6, 1.2));
    for (let i = 0; i < 4; i++) put(POND[0] + 0.3, SW + 0.004, POND[1], r2.range(0.7, 2), 1, 0.95, 0.85, 3, r2.range(0.15, 0.22), r2.sign() * r2.range(0.6, 1.1));
    this.life = ctx.buffer(new Float32Array(lf), 'vertex'); this.nl = lf.length / 12;
    this.fl = new Uint8Array(FLOWERS.length / 3);
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
    // crystal flowers chime once when you step up to them
    for (let i = 0, j = 0; i < FLOWERS.length; i += 3, j++) {
      const dx = FLOWERS[i] - e[0], dz = FLOWERS[i + 2] - e[2], d2 = dx * dx + dz * dz;
      if (d2 > 36) this.fl[j] = 0;
      else if (d2 < 10 && !this.fl[j]) { this.fl[j] = 1; const q = ctx.env.params2; q[0] = FLOWERS[i]; q[1] = FLOWERS[i + 1]; q[2] = FLOWERS[i + 2]; q[3] = t; if (ctx.audio && t > 2) this.chime(ctx.audio, j, (dx * cam.right[0] + dz * cam.right[2]) / (Math.sqrt(d2) + 1)); }
    }
    this.west = e[2] < -12 && e[0] < 34;
    this.east = e[0] > 8 && e[2] > 0;
    // the sleeper's breath follows the swell of its body
    if (this.breath && (this.tick & 15) === 0) this.breath.set(0.012 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.75 - 0.6)), 0.4);
    // how close the nearest crystal light is (drives the singing bowls)
    if (ctx.audio && (this.tick++ & 31) === 0) {
      const L = this.lights; let m = 1e9;
      for (let i = 0; i < L.length; i += 12) { const d = (L[i] - e[0]) ** 2 + (L[i + 1] - e[1]) ** 2 + (L[i + 2] - e[2]) ** 2; if (d < m) m = d; }
      this.near = 1 / (1 + m / 60);
    }
  },
  chime(a, j, pan) {
    const f = a.hz([74, 76, 79, 81, 86, 88, 91][j % 7]);
    a.bell({ freq: f, gain: 0.035, decay: 4, ratio: 3.01, index: 1.1, reverb: 0.8, pan });
    a.bell({ freq: f * 1.5, gain: 0.018, decay: 5, ratio: 2, index: 0.6, reverb: 0.9, pan: -pan * 0.5, when: a.now() + 0.22 });
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
  drawCrystals(p, pipe, buf = this.cinst, n = this.nc) {
    const m = this.cmesh;
    p.setPipeline(pipe); p.setVertexBuffer(0, m.vertexBuffer); p.setVertexBuffer(1, buf); p.setIndexBuffer(m.indexBuffer, m.indexFormat);
    p.drawIndexed(m.indexCount, n);
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.dBG);
    pass.setVertexBuffer(0, this.vb); pass.setIndexBuffer(this.ib, 'uint32');
    pass.setPipeline(this.pPre); pass.drawIndexed(this.ni);
    pass.setPipeline(this.pRock); pass.drawIndexed(this.ni);
    this.drawCrystals(pass, this.pCry);
    this.drawCrystals(pass, this.pCryO, this.oinst, this.no);
    if (this.west) {
      const m = this.mush;
      pass.setPipeline(this.pMush); pass.setVertexBuffer(0, m.vertexBuffer); pass.setVertexBuffer(1, this.minst); pass.setIndexBuffer(m.indexBuffer, m.indexFormat);
      pass.drawIndexed(m.indexCount, this.nmu);
    }
    if (this.east) {
      const m = this.sal;
      pass.setPipeline(this.pSal); pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount);
    }
  },

  renderTransparent(ctx, pass) {
    if (this.poolVis) {
      const w = this.water;
      pass.setPipeline(this.pWater); pass.setBindGroup(1, this.fBG);
      pass.setVertexBuffer(0, w.vertexBuffer); pass.setIndexBuffer(w.indexBuffer, w.indexFormat); pass.drawIndexed(w.indexCount);
      pass.setPipeline(this.pDrop); pass.draw(6, DROPS);
    }
    if (this.west) {
      pass.setPipeline(this.pStream); pass.setVertexBuffer(0, this.svb); pass.setIndexBuffer(this.sib, 'uint32'); pass.drawIndexed(this.sni);
      pass.setPipeline(this.pFall); pass.setVertexBuffer(0, this.fvb); pass.setIndexBuffer(this.fib, 'uint32'); pass.drawIndexed(this.fni);
    }
    const b = this.box;
    pass.setPipeline(this.inShaft ? this.pShaftIn : this.pShaft);
    pass.setVertexBuffer(0, b.vertexBuffer); pass.setIndexBuffer(b.indexBuffer, b.indexFormat); pass.drawIndexed(b.indexCount);
    pass.setPipeline(this.pHalo); pass.setVertexBuffer(0, this.halo); pass.draw(6, this.nh);
    pass.setPipeline(this.pMote); pass.setBindGroup(1, this.moteBG); pass.draw(6, this.nm);
    pass.setPipeline(this.pLife); pass.setVertexBuffer(0, this.life); pass.draw(6, this.nl);
  },

  audio(ctx, a) {
    // identity: C lydian augmented (C D E F# G# A B), glass harmonica + singing bowls, pitched water drips for an irregular pulse
    a.setReverb({ seconds: 6.5, damp: 0.5, wet: 0.95, predelay: 0.04 });
    const R = a.rng, S = a.scale(60, 'lydianAug', 3);          // 21 degrees, C4..
    a.drone({ freq: a.hz(24), partials: [1, 2, 3, 4.02, 6.01], amps: [1, 0.6, 0.3, 0.12, 0.05], detune: 5, cutoff: 260, gain: 0.05, attack: 6 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 150, gain: 0.035, mod: 0.4, modRate: 0.03 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 900, q: 1.5, gain: 0.006, mod: 0.6, modRate: 0.02 });
    // drips: water falling into pools somewhere in the dark; clustered, then long gaps
    const dsc = a.scale(72, 'lydianAug', 2);
    a.every(0.9, 5.5, (when) => {
      const f = a.hz(R.pick(dsc)), pan = R.range(-0.8, 0.8), g = 0.015 + 0.01 * this.near;
      a.drip({ freq: f, gain: g, pan, reverb: 0.8, dir: R() < 0.5 ? 1 : -1, when });
      if (R() < 0.3) a.drip({ freq: f * (R() < 0.5 ? 1.5 : 0.75), gain: g * 0.5, pan: -pan, reverb: 0.9, when: when + 0.28 + R() * 0.3 });
    }, { startDelay: 3 });
    // singing bowls: beating partials, near the crystals they speak louder
    const bw = [S[0], S[2], S[4], S[5], S[7], S[9]];
    a.every(9, 24, (when) => a.singingBowl({ midi: R.pick(bw), decay: 14, gain: 0.016 + 0.018 * this.near, reverb: 0.85, pan: R.range(-0.6, 0.6), when }), { startDelay: 6 });
    // glass harmonica motif (C-E-F#-E... in degrees), every ~40-80 s, with variations
    const MOT = [[2, 4, 3, 5], [2, 4, 3, 1], [4, 2, 3, 0, 1], [2, 5, 4, 3]];
    let last = -99, n = 0;
    a.every(40, 80, (when) => {
      const base = MOT[n++ % 2 ? (R.int(MOT.length)) : 0], sh = R.pick([0, 0, 2, 7, -2]);
      const seq = R() < 0.35 ? base.slice(0, -1) : base.slice();
      const notes = [];
      for (const d of seq) { notes.push({ deg: Math.min(20, Math.max(0, d + 7 + sh)), dur: 1 }); if (R() < 0.4) notes.push({ rest: true, dur: 0.5 }); }
      last = a.phrase({ notes, inst: a.glassHarmonica, opts: { gain: 0.022, reverb: 0.85, pan: R.range(-0.3, 0.3), durMul: 1.8 }, tempo: 26, humanize: 0.03, scale: S, when });
    }, { startDelay: 12 });
    // lone glass tones between
    a.every(14, 34, (when) => { if (a.now() > last + 8) a.glassHarmonica({ midi: R.pick(S.slice(7, 17)), dur: 4 + R() * 3, gain: 0.014, reverb: 0.9, pan: R.range(-0.7, 0.7), when }); }, { startDelay: 22 });
    // the waterfall and the stream
    const wf = a.spatial({ pos: [FALL[0], 1, FALL[2]], ref: 4, rolloff: 1.5, reverb: 0.5 });
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 1500, q: 0.6, gain: 0.045, mod: 0.2, modRate: 0.2, bus: wf });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 420, gain: 0.05, bus: wf });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 800, q: 0.8, gain: 0.02, mod: 0.4, modRate: 0.15, bus: a.spatial({ pos: [1, -0.3, -44], ref: 3.5, rolloff: 1.6, reverb: 0.5 }) });
    // mushroom grotto: soft hollow plops
    const gb = a.spatial({ pos: [-22, 1.5, -34], ref: 6, rolloff: 1.6, reverb: 0.7 }), low = a.scale(48, 'lydianAug', 1);
    a.every(4, 11, (when) => a.additive({ freq: a.hz(R.pick(low)), partials: [1, 0.25, 0.06], attack: 0.04, decay: 1.6, gain: 0.03, bus: gb, when }), { startDelay: 3 });
    // citrine chamber: warm glassy tones; the sleeper purrs and breathes
    const cb = a.spatial({ pos: [44, 3, 21], ref: 6, rolloff: 1.6, reverb: 0.8 }), hi = a.scale(72, 'lydianAug', 1);
    a.every(5, 13, (when) => a.bell({ freq: a.hz(R.pick(hi)), gain: 0.022, decay: 6, ratio: 2, index: 0.5, bus: cb, when }), { startDelay: 4 });
    const sb = a.spatial({ pos: [SAL[0], 0.6, SAL[1]], ref: 3, rolloff: 1.7, reverb: 0.4 });
    this.breath = a.noiseBed({ color: 'pink', filter: 'lowpass', freq: 300, gain: 0.02, mod: 0.15, gainMod: 0, bus: sb });
    a.drone({ freq: a.hz(36), partials: [1, 2, 3], amps: [1, 0.4, 0.12], detune: 4, cutoff: 200, gain: 0.03, bus: sb });
    // the crystal jellyfish sing: long glassy vowels, two voices a fifth apart
    a.every(9, 21, (when) => {
      const m = R.pick(a.scale(72, 'lydianAug', 2)), f = a.hz(m), pan = R.range(-0.7, 0.7);
      a.additive({ freq: f, partials: [1, 0.3, 0.08], attack: 2, decay: 6, gain: 0.011, reverb: 0.9, pan, when });
      a.additive({ freq: a.hz(m + 7), partials: [1, 0.2], attack: 2.6, decay: 5, gain: 0.006, reverb: 0.9, pan: -pan, when: when + 0.7 });
    }, { startDelay: 8 });
    // far drips somewhere in the dark
    a.every(5, 13, (when) => a.chirp({ f0: R.range(1700, 2600), f1: 900, dur: 0.05, gain: 0.008, reverb: 0.95, pan: R.range(-0.9, 0.9), when }));
  },
};
