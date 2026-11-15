// Astral Ocean: a nebula that behaves like an ocean. Space whales, jellyfish, glowing fish shoals, stardust.
import UTIL from './util.wgsl';
import COMMON from './common.wgsl';
import NEBULA from './nebula.wgsl';
import BAKE from './bake.wgsl';
import SKY from './sky.wgsl';
import WHALE from './whale.wgsl';
import TRAIL from './trail.wgsl';
import FISH from './fish.wgsl';
import FISHDRAW from './fishdraw.wgsl';
import JELLY from './jelly.wgsl';
import MOTES from './motes.wgsl';
import PUFFS from './puffs.wgsl';
import PUFFBAKE from './puffbake.wgsl';
import GLOW from './glow.wgsl';
import ISLET from './islet.wgsl';

const DOOR = [0, -2, 26];
const CORE = [-0.316, 0.163, -0.935];
// paths: [cx, cy, cz, R, e, h, yaw, phase, speed, u0, dir, L]  (0-2 whales, 3-4 fish shoals). WGSL twin in common.wgsl
const PATHS = [
  [-25, 10, -105, 80, 0.72, 12, 0.4, 0, 3.4, 1.565, 1, 58],
  [30, -6, 10, 70, 0.9, 8, -0.8, 1.3, 3.0, 4.5, -1, 42],
  [0, 30, -20, 165, 0.7, 20, 1.9, 2.2, 4.2, 0.855, 1, 75],
  [-8, 1, -20, 20, 0.7, 3, 0.3, 0.5, 2.2, 0, 1, 0],
  [16, 4, 14, 26, 0.8, 4, -0.5, 1.9, 2.5, 2, -1, 0],
];
// jelly groups: [x, bottomY, z, radius, count, H, hueLo, hueHi]
const JGROUPS = [[-12, -16, -42, 9, 22, 28, 0.0, 0.6], [40, -12, 4, 10, 16, 26, 0.3, 1.0], [-26, -18, 34, 8, 12, 24, 0.0, 0.85]];

function pathPos(p, u, o) {
  const lx = p[3] * Math.cos(u), lz = p[4] * p[3] * Math.sin(u), ly = p[5] * (Math.sin(0.5 * u + p[7]) + 0.35 * Math.sin(1.37 * u + 2 * p[7]));
  const c = Math.cos(p[6]), s = Math.sin(p[6]);
  o[0] = p[0] + c * lx + s * lz; o[1] = p[1] + ly; o[2] = p[2] - s * lx + c * lz; return o;
}
const _a = [0, 0, 0], _b = [0, 0, 0];
// spine frame at time t, body fraction s -> { p, f, r, u }
function frame(p, t, s) {
  const U = (t) => p[9] + p[10] * p[8] * t / p[3];
  const uh = U(t);
  pathPos(p, uh + 0.002, _a); pathPos(p, uh - 0.002, _b);
  const sp = Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]) * 250;
  const us = uh - p[10] * s * p[11] / sp;
  const P = pathPos(p, us, [0, 0, 0]);
  pathPos(p, us + 0.002, _a); pathPos(p, us - 0.002, _b);
  let f = [(_a[0] - _b[0]) * p[10], (_a[1] - _b[1]) * p[10], (_a[2] - _b[2]) * p[10]];
  const fl = Math.hypot(...f); f = f.map((x) => x / fl);
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map((x) => x / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { p: P, f, r, u };
}
const lookAt = (pos, tgt) => { const d = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], l = Math.hypot(...d); return { pos, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(d[1] / l) }; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// ---------- geometry ----------
function whaleGeo(q) {
  const P = [], I = [], UV = [];
  const NS = [40, 64, 80][q], NR = [16, 24, 28][q], Rm = 0.1;
  const rad = (s) => s < 0.28 ? Rm * Math.pow(Math.sin(s / 0.28 * Math.PI / 2), 0.6) : Rm * Math.max(0.004, 1 - 0.95 * Math.pow(Math.min((s - 0.28) / 0.68, 1), 1.45));
  for (let j = 0; j <= NS; j++) {
    const s = 0.965 * Math.pow(j / NS, 1.0), r = rad(s);
    for (let i = 0; i < NR; i++) {
      const a = i / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let y = r * 0.92 * ca; if (ca < 0) y *= 0.85;
      y -= 0.18 * r * (1 - Math.min(1, s / 0.3));
      y += 0.35 * r * Math.exp(-(((s - 0.66) / 0.035) ** 2)) * Math.max(ca, 0) ** 6;
      P.push(r * sa, y, s); UV.push(0, 0);
    }
  }
  for (let j = 0; j < NS; j++) for (let i = 0; i < NR; i++) {
    const a = j * NR + i, b = j * NR + (i + 1) % NR, c = a + NR, d = b + NR;
    I.push(a, c, b, b, c, d);
  }
  // lofted thin surface: sections[k] = [center, chordDir, thickDir, chord, thick], uv
  const loft = (secs, NA, part) => {
    const base = P.length / 3;
    for (const [C, cd, td, ch, th, u] of secs) for (let i = 0; i < NA; i++) {
      const a = i / NA * Math.PI * 2, x = Math.cos(a) * ch * 0.5, y = Math.sin(a) * th * 0.5;
      P.push(C[0] + cd[0] * x + td[0] * y, C[1] + cd[1] * x + td[1] * y, C[2] + cd[2] * x + td[2] * y); UV.push(part, u);
    }
    for (let j = 0; j < secs.length - 1; j++) for (let i = 0; i < NA; i++) {
      const a = base + j * NA + i, b = base + j * NA + (i + 1) % NA, c = a + NA, d = b + NA;
      I.push(a, c, b, b, c, d);
    }
  };
  const NF = [10, 16, 20][q], NA = [8, 10, 12][q];
  for (const side of [-1, 1]) {
    const s0 = 0.27, r0 = rad(s0), secs = [];
    let D = [side * 1, -0.5, 0.42]; const dl = Math.hypot(...D); D = D.map((x) => x / dl);
    for (let k = 0; k <= NF; k++) {
      const t = k / NF, len = 0.31;
      const C = [side * 0.7 * r0 + D[0] * t * len, -0.45 * r0 + D[1] * t * len - 0.04 * t * t, s0 + D[2] * t * len + 0.05 * t * t];
      const ch = 0.06 * (1 - 0.8 * Math.pow(t, 1.6)) * (1 + 0.07 * Math.sin(t * 34)) + 0.004;
      const cd = [0, 0.15, 1], td = [-D[1] * side, Math.abs(D[0]), 0];
      secs.push([C, cd, td, ch, ch * 0.22, t]);
    }
    loft(side < 0 ? secs.slice().reverse() : secs, NA, side);
  }
  const fl = [], NFL = [14, 22, 26][q];
  for (let k = 0; k <= NFL; k++) {
    const x = (k / NFL * 2 - 1) * 0.17, ax = Math.abs(x) / 0.17;
    const ch = 0.08 * Math.pow(Math.max(0, 1 - Math.pow(ax, 2.4)), 0.5) + 0.004;
    const zle = 0.915 + 0.42 * Math.abs(x) - 0.03 * ax * ax;
    fl.push([[x, 0, zle + ch * 0.5], [0, 0, 1], [0, 1, 0], ch, 0.012 * (1 - ax) + 0.003, ax]);
  }
  loft(fl, NA, 2);
  const g = { pos: Float32Array.from(P), nrm: new Float32Array(P.length), uv: Float32Array.from(UV), idx: Uint32Array.from(I) };
  return g;
}


// critic poses and fly-through, computed from the creatures' analytic paths (needed before init)
const POSES = [{ pos: [0, 0, 0], yaw: 0, pitch: 0.1 }, {}, {}, {}, {}, {}], FLY = [];
{
      const W1 = frame(PATHS[1], 40, 0.42);
      const p1 = add(add(W1.p, W1.r, 30), W1.u, 5);
      const G0 = JGROUPS[0], gc = [G0[0], G0[1] + G0[5] * 0.5, G0[2]];
      const p2 = add(gc, CORE, -21);
      const S3 = frame(PATHS[3], 16 - 4.5, 0);
      const p3 = add(add(S3.p, S3.r, 10), S3.u, 2.5);
      const P = POSES;
      Object.assign(P[1], lookAt(p1, add(W1.p, W1.f, 4)), { t: 40 });
      Object.assign(P[2], lookAt(p2, gc), { t: 14 });
      Object.assign(P[3], lookAt(p3, S3.p), { t: 16 });
      Object.assign(P[4], lookAt([-6, -24, -34], [-14, 6, -46]), { t: 22 });
      Object.assign(P[5], lookAt([-5, -0.4, 15], [1.5, -0.2, 27]), { t: 10 });
      const pts = [[0, 0, 0], [-6, -1, -28], [-26, 4, -55], [8, 12, -78], [48, 6, -40], [44, 0, -2], [22, 3, 18], [5, 0, 15], [-18, -2, 26], [-24, 2, 4], [0, 0, 0]];
            for (let i = 0; i < pts.length; i++) {
        const n = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)];
        const L = lookAt(pts[i], add(pts[i], [n[0] - pv[0], (n[1] - pv[1]) * 0.5, n[2] - pv[2]]));
        FLY.push({ pos: pts[i], yaw: L.yaw, pitch: L.pitch * 0.5 });
      }
      for (let i = 1; i < FLY.length; i++) {   // unwrap yaw
        const a = FLY[i - 1].yaw; let b = FLY[i].yaw;
        while (b - a > Math.PI) b -= Math.PI * 2; while (b - a < -Math.PI) b += Math.PI * 2; FLY[i].yaw = b;
      }
    }

export default {
  id: 'astral-ocean',
  title: 'Astrálny oceán',
  movement: 'fly',
  speed: 0.7,
  spawn: { pos: [0, 0, 0], yaw: 0, pitch: 0.1 },
  poses: POSES,
  flythrough: FLY,
  flythroughDuration: 60,
  doors: [{ pos: DOOR, yaw: Math.PI, to: 'underwater' }],
  bounds: { center: [0, 0, -15], radius: 150 },
  env: {
    sunDir: CORE, sunColor: [1.25, 0.72, 0.55], fogColor: [0.02, 0.018, 0.055], fogDensity: 0.0025,
    ambientSky: [0.16, 0.13, 0.32], ambientGround: [0.07, 0.04, 0.1],
  },
  post: { exposure: 1.0, bloom: 0.2, bloomThreshold: 0.65, bloomKnee: 0.7, bloomRadius: 1.2, saturation: 1.12, vignette: 0.32, contrast: 1.03 },
  clearColor: [0.004, 0.005, 0.016],
  doorLight: [0.09, 0.08, 0.14],
  fov: 64,

  sdf(x, y, z) {
    const qx = x - DOOR[0], qy = y - DOOR[1], qz = z - DOOR[2], r = Math.hypot(qx, qz);
    const rr = qy > -1 ? 3.3 : Math.max(0, 3.3 * (1 + (qy + 1) / 5.5));
    return Math.max(r - rr, qy - 0.02, -6.6 - qy) * 0.85;
  },

  async init(ctx, progress) {
    const { device } = ctx, q = ctx.q.level, M = ctx.mesh;
    this.q = q;
    // ---- nebula cubemaps baked on the GPU ----
    const S1 = [512, 1024, 1024][q], S2 = [384, 768, 768][q];
    const TU = GPUTextureUsage;
    const cubeTex = (S) => ctx.texture(S, S, 'rgba16float', TU.TEXTURE_BINDING | TU.STORAGE_BINDING, { depth: 6 });
    this.farTex = cubeTex(S1); this.wispTex = cubeTex(S2);
    const bakeL = ctx.layout(['storage-texture:rgba16float:2d-array', 'uniform']);
    const faceBufs = [0, 1, 2, 3, 4, 5].map((f) => ctx.buffer(new Uint32Array([f, 0, 0, 0]), 'uniform'));
    const bakeMod = ctx.shader(NEBULA + BAKE, 'ao-bake');
    for (const [tex, S, which] of [[this.farTex, S1, 0], [this.wispTex, S2, 1]]) {
      const pipe = ctx.compute({ module: bakeMod, entry: 'bake', layouts: [bakeL], constants: { WHICH: which } });
      const view = tex.createView({ dimension: '2d-array' });
      for (let face = 0; face < 6; face++) {
        const bg = ctx.bindGroup(bakeL, [view, faceBufs[face]]);
        const enc = device.createCommandEncoder(), cp = ctx.beginCompute(enc);
        cp.setPipeline(pipe); cp.setBindGroup(1, bg); cp.dispatchWorkgroups(Math.ceil(S / 8), Math.ceil(S / 8), 1);
        cp.end(); device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
        await progress(0.05 + 0.06 * (which * 6 + face));
      }
    }
    const cubeView = (t) => t.createView({ dimension: 'cube' });
    const skyL = ctx.layout(['texture-cube', 'texture-cube', 'sampler']);
    this.sky = ctx.pipeline({ code: SKY, layouts: [skyL], depthTest: false, depthWrite: false, label: 'ao-sky' });
    this.skyBG = ctx.bindGroup(skyL, [cubeView(this.farTex), cubeView(this.wispTex), ctx.samplers.linear]);
    await progress(0.8);

    // ---- paths buffer (whales + shoals) ----
    const pd = new Float32Array(PATHS.length * 12);
    PATHS.forEach((p, i) => pd.set(p, i * 12));
    this.pathBuf = ctx.buffer(pd, 'storage');
    const pathL = ctx.layout(['storage']);
    this.pathBG = ctx.bindGroup(pathL, [this.pathBuf]);

    // ---- whales ----
    const wg = M.computeNormals(whaleGeo(q));
    this.whaleMesh = M.upload(wg);
    this.whale = ctx.pipeline({ code: UTIL + COMMON + WHALE, buffers: [M.layout], layouts: [pathL], blend: 'premul', label: 'ao-whale' });
    this.NT = [350, 800, 1000][q];
    this.trail = ctx.pipeline({ code: UTIL + COMMON + TRAIL, layouts: [pathL], blend: 'add', cull: 'none', constants: { NT: this.NT }, label: 'ao-trail' });

    // ---- fish ----
    const NF = [1024, 2048, 4096][q], NH = NF / 2, rng = ctx.rng;
    const fd = new Float32Array(NF * 16);
    for (let i = 0; i < NF; i++) { fd[i * 16 + 3] = rng() * 100; fd[i * 16 + 7] = 10 * rng(); }
    this.fishBuf = ctx.buffer(fd, 'storage');
    this.NF = NF;
    const fishSimL = ctx.layout(['storage', 'storage-rw']), fishDrawL = ctx.layout(['storage', 'storage']);
    this.fishSim = ctx.compute({ code: COMMON + FISH, entry: 'sim', layouts: [fishSimL], constants: { NHALF: NH } });
    this.fishSimBG = ctx.bindGroup(fishSimL, [this.pathBuf, this.fishBuf]);
    this.fishDraw = ctx.pipeline({ code: UTIL + COMMON + FISHDRAW, layouts: [fishDrawL], blend: 'add', cull: 'none', constants: { NHALF: NH }, label: 'ao-fish' });
    this.fishDrawBG = ctx.bindGroup(fishDrawL, [this.pathBuf, this.fishBuf]);
    this.fishFrames = 0;

    // ---- jellies ----
    const jd = [], jsc = [0.6, 1, 1][q];
    this.jgroups = [];
    for (const [x, by, z, r, n, H, h0, h1] of JGROUPS) {
      const cnt = Math.round(n * jsc);
      this.jgroups.push([x, by + H * 0.5, z]);
      for (let i = 0; i < cnt; i++) {
        const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
        const size = 0.45 + Math.pow(rng(), 2) * 1.1;
        jd.push(x + Math.cos(a) * rr, by, z + Math.sin(a) * rr, size, 3.2 + rng() * 2.2, h0 + (h1 - h0) * rng(), rng(), rng(), H, 0.8 + rng() * 0.5, 0, 0);
      }
    }
    this.NJ = jd.length / 12;
    this.jelBuf = ctx.buffer(Float32Array.from(jd), 'storage');
    const jelL = ctx.layout(['storage']);
    this.jelBG = ctx.bindGroup(jelL, [this.jelBuf]);
    const bell = M.lathe([[0.84, -0.07], [0.97, 0.0], [1.0, 0.1], [0.97, 0.25], [0.88, 0.42], [0.72, 0.58], [0.5, 0.7], [0.25, 0.77], [0.0, 0.79]], [16, 24, 32][q]);
    this.bellMesh = M.upload(bell);
    this.bell = ctx.pipeline({ code: UTIL + JELLY, buffers: [M.layout], layouts: [jelL], blend: 'add', cull: 'none', label: 'ao-bell' });
    this.NSEG = [8, 14, 18][q];
    this.tent = ctx.pipeline({ code: UTIL + JELLY, vs: 'vst', fs: 'fst', layouts: [jelL], blend: 'add', cull: 'none', constants: { NSEG: this.NSEG }, label: 'ao-tent' });
    await progress(0.85);

    // ---- motes ----
    this.NM = [700, 1400, 2400][q];
    this.motes = ctx.pipeline({ code: UTIL + MOTES, blend: 'add', cull: 'none', label: 'ao-motes' });

    // ---- puffs ----
    const ptex = ctx.texture(256, 256, 'rgba8unorm', TU.TEXTURE_BINDING | TU.STORAGE_BINDING);
    {
      const L = ctx.layout(['storage-texture:rgba8unorm']);
      const pipe = ctx.compute({ code: PUFFBAKE, entry: 'bake', layouts: [L] });
      const enc = device.createCommandEncoder(), cp = ctx.beginCompute(enc);
      cp.setPipeline(pipe); cp.setBindGroup(1, ctx.bindGroup(L, [ptex.createView()])); cp.dispatchWorkgroups(32, 32); cp.end();
      device.queue.submit([enc.finish()]);
    }
    const NPF = [14, 24, 32][q], pf = [];
    const pcols = [[0.10, 0.04, 0.22], [0.18, 0.03, 0.14], [0.03, 0.11, 0.17], [0.2, 0.08, 0.04], [0.06, 0.06, 0.2]];
    for (let i = 0; i < NPF; i++) {
      let x, y, z;
      do { const a = rng() * Math.PI * 2, b = (rng() - 0.5) * 1.4, d = 45 + rng() * 150; x = Math.cos(a) * Math.cos(b) * d; y = Math.sin(b) * d * 0.6; z = Math.sin(a) * Math.cos(b) * d - 15; }
      while (Math.hypot(x - DOOR[0], y - DOOR[1], z - DOOR[2]) < 45);
      const c = pcols[i % pcols.length], s = 18 + rng() * 30;
      pf.push(x, y, z, s, c[0], c[1], c[2], i + 4 * Math.floor(rng() * 50));
    }
    this.NPF = NPF;
    const puffL = ctx.layout(['storage', 'texture', 'sampler']);
    this.puffBG = ctx.bindGroup(puffL, [ctx.buffer(Float32Array.from(pf), 'storage'), ptex.createView(), ctx.samplers.linear]);
    this.puffs = ctx.pipeline({ code: UTIL + PUFFS, layouts: [puffL], blend: 'premul', cull: 'none', label: 'ao-puffs' });

    // ---- islet: floating rock under the door, crystals, small satellite rocks ----
    {
      const { fbm2 } = ctx.noise;
      const prof = [[0.0, -6.6], [0.5, -6.1], [1.1, -4.9], [1.8, -3.5], [2.5, -2.1], [3.0, -1.1], [3.3, -0.5], [3.3, -0.15], [3.1, 0.0], [2.2, 0.0], [1.0, 0.0], [0.0, 0.0]];
      const rock = M.lathe(prof, [28, 40, 48][q]);
      for (let i = 0; i < rock.pos.length; i += 3) {
        const x = rock.pos[i], y = rock.pos[i + 1], z = rock.pos[i + 2];
        const a = Math.atan2(z, x), w = Math.min(1, Math.max(0, -y / 0.6));
        const k = 1 + w * (0.22 * fbm2(Math.cos(a) * 2 + y * 0.35, Math.sin(a) * 2 + y * 0.2, 4) + 0.08 * fbm2(x * 1.3, z * 1.3 + y, 2));
        rock.pos[i] = x * k + DOOR[0]; rock.pos[i + 1] = y + w * 0.25 * fbm2(x * 0.7 + 5, z * 0.7, 3) + DOOR[1]; rock.pos[i + 2] = z * k + DOOR[2];
        rock.uv[i / 3 * 2] = 0;
      }
      M.computeNormals(rock);
      const parts = [rock], glows = [];
      const m4 = new Float32Array(16);
      const crystal = (pos, dir, r, h, col) => {
        const g = M.merge([M.cylinder(r, r * 0.9, h, 6, 1), M.translate(M.cone(r * 0.9, h * 0.45, 6), 0, h, 0)]);
        let [dx, dy, dz] = dir; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        // basis with Y -> dir
        let ax = [dy * 0 - dz * 1, dz * 0 - dx * 0, dx * 1 - dy * 0]; if (Math.hypot(...ax) < 1e-3) ax = [1, 0, 0];
        const al = Math.hypot(...ax); ax = ax.map((v) => v / al);
        const az = [ax[1] * dz - ax[2] * dy, ax[2] * dx - ax[0] * dz, ax[0] * dy - ax[1] * dx];
        m4.set([ax[0], ax[1], ax[2], 0, dx, dy, dz, 0, az[0], az[1], az[2], 0, pos[0], pos[1], pos[2], 1]);
        M.transform(g, m4);
        for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = 1; g.uv[i + 1] = col; }
        parts.push(g);
        glows.push(pos[0] + dx * h * 0.7, pos[1] + dy * h * 0.7, pos[2] + dz * h * 0.7, h * 1.6, ...(col < 0.5 ? [0.05, 0.16, 0.32] : [0.2, 0.08, 0.3]), 0);
      };
      const D = DOOR;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + 0.3, rr = 1.2 + (i % 3) * 0.6;
        crystal([D[0] + Math.cos(a) * rr, D[1] - 3.2 - (i % 3) * 0.9, D[2] + Math.sin(a) * rr], [Math.cos(a) * 0.6, -1, Math.sin(a) * 0.6], 0.14 + 0.05 * (i % 2), 1.0 + 0.6 * ((i * 7) % 3), (i % 2) * 0.9);
      }
      crystal([D[0] + 2.4, D[1] - 0.1, D[2] + 1.2], [0.4, 1, 0.2], 0.12, 0.8, 0.0);
      crystal([D[0] - 2.5, D[1] - 0.1, D[2] - 0.6], [-0.35, 1, -0.1], 0.1, 0.6, 0.9);
      crystal([D[0] - 2.2, D[1] - 0.1, D[2] + 1.6], [-0.3, 1, 0.4], 0.09, 0.5, 0.0);
      for (let i = 0; i < 4; i++) {
        const r = M.rock(11 + i, q > 0 ? 2 : 1, 0.45), s = 0.4 + 0.3 * i, a = i * 1.9 + 0.7;
        M.scale(r, s, s * 0.8, s); M.translate(r, D[0] + Math.cos(a) * (5 + i), D[1] - 1.5 - i * 1.2, D[2] + Math.sin(a) * (5 + i));
        for (let k = 0; k < r.uv.length; k += 2) r.uv[k] = 0;
        parts.push(r);
      }
      glows.push(D[0], D[1] - 6.2, D[2], 7, 0.06, 0.12, 0.3, 0);
      this.isletMesh = M.upload(M.merge(parts));
      this.islet = ctx.pipeline({ code: ISLET, buffers: [M.layout], label: 'ao-islet' });
      const glL = ctx.layout(['storage']);
      this.NG = glows.length / 8;
      this.glowBG = ctx.bindGroup(glL, [ctx.buffer(Float32Array.from(glows), 'storage')]);
      this.glow = ctx.pipeline({ code: UTIL + GLOW, layouts: [glL], blend: 'add', cull: 'none', label: 'ao-glow' });
    }
    this.nearJelly = 1e9;
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    let m = 1e9;
    for (let i = 0; i < this.jgroups.length; i++) {
      const g = this.jgroups[i];
      const d = Math.hypot(cam.pos[0] - g[0], cam.pos[1] - g[1], cam.pos[2] - g[2]);
      if (d < m) m = d;
    }
    this.nearJelly = m;
  },

  computeBefore(ctx, enc) {
    const p = ctx.beginCompute(enc);
    p.setPipeline(this.fishSim); p.setBindGroup(1, this.fishSimBG); p.dispatchWorkgroups(Math.ceil(this.NF / 64)); p.end();
  },

  render(ctx, pass) {
    pass.setPipeline(this.sky); pass.setBindGroup(1, this.skyBG); pass.draw(3);
    pass.setPipeline(this.islet); this.isletMesh.draw(pass);
  },

  renderTransparent(ctx, pass) {
    pass.setPipeline(this.puffs); pass.setBindGroup(1, this.puffBG); pass.draw(6, this.NPF);
    pass.setPipeline(this.whale); pass.setBindGroup(1, this.pathBG); this.whaleMesh.draw(pass, 3);
    pass.setPipeline(this.trail); pass.draw(6, this.NT * 3);
    pass.setPipeline(this.bell); pass.setBindGroup(1, this.jelBG); this.bellMesh.draw(pass, this.NJ);
    pass.setPipeline(this.tent); pass.draw(6 * 16 * this.NSEG, this.NJ);
    pass.setPipeline(this.fishDraw); pass.setBindGroup(1, this.fishDrawBG); pass.draw(6, this.NF);
    pass.setPipeline(this.motes); pass.draw(6, this.NM);
    pass.setPipeline(this.glow); pass.setBindGroup(1, this.glowBG); pass.draw(6, this.NG);
  },

  audio(ctx, a) {
    const ac = a.ctx;
    a.setReverb({ seconds: 6.5, damp: 0.45, wet: 0.95, predelay: 0.04 });
    a.drone({ freq: a.hz(36), partials: [1, 1.5, 2, 3, 4.02], amps: [1, 0.45, 0.5, 0.2, 0.1], gain: 0.05, cutoff: 420, detune: 5 });
    a.noiseBed({ color: 'brown', freq: 260, q: 0.5, gain: 0.025, mod: 0.4, modRate: 0.03 });
    a.pad({ chords: [[72, 79, 83, 86], [71, 76, 79, 86], [69, 76, 81, 84], [74, 79, 83, 88], [67, 74, 79, 83]], type: 'sine', gain: 0.022, attack: 7, change: [16, 30], cutoff: 3200, reverb: 0.85 });
    // whale song: formant-filtered glides, positioned at a whale
    const song = (when) => {
      const k = a.rng.int(3), W = frame(PATHS[k], ctx.time, 0.2);
      const sp = a.spatial({ pos: W.p, ref: 40, rolloff: 0.6, reverb: 0.9, gain: 1 });
      const base = 110 + a.rng() * 120, dur = 2.8 + a.rng() * 3, low = a.rng() < 0.35;
      const os = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
      os.type = 'sine'; o2.type = 'triangle';
      const f = [base, base * (low ? 0.6 : 1.5 + a.rng() * 0.5), base * (low ? 0.5 : 1.15)];
      for (const o of [os, o2]) {
        o.frequency.setValueAtTime(f[0], when);
        o.frequency.exponentialRampToValueAtTime(f[1], when + dur * 0.45);
        o.frequency.exponentialRampToValueAtTime(f[2], when + dur);
      }
      o2.detune.value = 7;
      const v = ac.createOscillator(), vg = ac.createGain(); v.frequency.value = 3.5 + a.rng() * 2; vg.gain.value = 4; v.connect(vg); vg.connect(os.frequency); vg.connect(o2.frequency);
      const b1 = ac.createBiquadFilter(), b2 = ac.createBiquadFilter(), mix = ac.createGain();
      b1.type = 'bandpass'; b1.frequency.value = 420 + a.rng() * 200; b1.Q.value = 3;
      b2.type = 'bandpass'; b2.frequency.value = 1100 + a.rng() * 400; b2.Q.value = 5;
      b1.frequency.setTargetAtTime(b1.frequency.value * 1.4, when + dur * 0.3, dur * 0.3);
      os.connect(b1); o2.connect(b1); os.connect(b2); b1.connect(mix); b2.connect(mix); mix.gain.value = 1;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      os.connect(lp); lp.connect(g); mix.connect(g);
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.045, when + dur * 0.3); g.gain.linearRampToValueAtTime(0.03, when + dur * 0.75); g.gain.linearRampToValueAtTime(0, when + dur);
      g.connect(sp.input);
      for (const o of [os, o2, v]) { o.start(when); o.stop(when + dur + 0.1); }
    };
    a.every(14, 34, (when) => { song(when); if (a.rng() < 0.5) song(when + 2.5 + a.rng() * 2); }, { startDelay: 6 });
    const notes = a.scale(76, 'pentatonic', 2);
    a.every(1.8, 5.5, (when) => {
      const near = Math.max(0, 1 - this.nearJelly / 45);
      if (near <= 0.02 && a.rng() < 0.8) return;
      a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.006 + 0.016 * near, decay: 4.5, ratio: 2.76, index: 1.2, when, pan: a.rng.range(-0.7, 0.7), reverb: 0.85 });
    });
  },
};
