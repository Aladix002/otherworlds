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

import { DOOR, CORE, PATHS, JGROUPS, POSES, FLY, FLY_DUR, frame } from './layout.js';

// ---------- geometry ----------
export const WRM = 0.095;
const wBase = (s) => s < 0.25 ? Math.pow(Math.sin(s / 0.25 * Math.PI / 2), 0.5) : Math.max(0.03, 1 - 0.93 * Math.pow((s - 0.25) / 0.7, 1.3));
function whaleGeo(q) {
  const P = [], I = [], UV = [];
  const NS = [44, 72, 90][q], NR = [16, 26, 30][q], Rm = WRM;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let j = 0; j <= NS; j++) {
    const v = j / NS, s = 0.95 * (v < 0.5 ? 0.5 * Math.pow(2 * v, 1.25) : 1 - 0.5 * Math.pow(2 - 2 * v, 1.15));
    const b = Rm * wBase(s);
    const wid = b * (1 - 0.45 * sm(0.68, 0.92, s));
    const top = b * 0.86 * (1 - 0.22 * (1 - sm(0.02, 0.2, s)));
    const bot = b * (0.92 + 0.22 * Math.exp(-(((s - 0.22) / 0.13) ** 2)));
    for (let i = 0; i < NR; i++) {
      const a = i / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let y = ca > 0 ? top * ca : bot * ca;
      y += 0.35 * b * Math.exp(-(((s - 0.68) / 0.03) ** 2)) * Math.max(ca, 0) ** 8;
      P.push(wid * sa, y - 0.12 * b * (1 - sm(0.0, 0.3, s)), s); UV.push(0, 0);
    }
  }
  for (let j = 0; j < NS; j++) for (let i = 0; i < NR; i++) {
    const a = j * NR + i, b = j * NR + (i + 1) % NR, c = a + NR, d = b + NR;
    I.push(a, c, b, b, c, d);
  }
  // lofted thin airfoil surface. secs: [center, chordDir, thickDir, chord, thick, u]; leading edge at -chordDir
  const loft = (secs, NA, part) => {
    const base = P.length / 3, i0 = I.length;
    for (const [C, cd, td, ch, th, u] of secs) for (let i = 0; i < NA; i++) {
      const a = i / NA * Math.PI * 2, c = Math.cos(a), x = c * ch * 0.5, y = Math.sin(a) * th * 0.5 * (0.6 - 0.4 * c);
      P.push(C[0] + cd[0] * x + td[0] * y, C[1] + cd[1] * x + td[1] * y, C[2] + cd[2] * x + td[2] * y); UV.push(part, u);
    }
    for (let j = 0; j < secs.length - 1; j++) for (let i = 0; i < NA; i++) {
      const a = base + j * NA + i, b = base + j * NA + (i + 1) % NA, c = a + NA, d = b + NA;
      I.push(a, c, b, b, c, d);
    }
    // orient outward: test a triangle of the middle section against its section center
    const jm = secs.length >> 1, a = base + jm * NA + (NA >> 2), b = base + jm * NA + (NA >> 2) + 1, c = a + NA, C = secs[jm][0];
    const v = (k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
    const A = v(a), B = v(b), Cc = v(c);
    const e1 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]], e2 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * (A[0] - C[0]) + n[1] * (A[1] - C[1]) + n[2] * (A[2] - C[2]) < 0) for (let k = i0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  };
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const NF = [10, 16, 20][q], NA = [8, 12, 14][q];
  for (const side of [-1, 1]) {
    const s0 = 0.27, b0 = Rm * wBase(s0), secs = [];
    const D = nrm([side, -0.45, 0.62]);
    let cd = [0, 0.1, 1]; const k = cd[0] * D[0] + cd[1] * D[1] + cd[2] * D[2]; cd = nrm([cd[0] - D[0] * k, cd[1] - D[1] * k, cd[2] - D[2] * k]);
    const td = cross(D, cd);
    for (let j = 0; j <= NF; j++) {
      const t = j / NF, len = 0.3;
      const C = [side * 0.55 * b0 + D[0] * t * len, -0.4 * b0 + D[1] * t * len - 0.03 * t * t, s0 + D[2] * t * len + 0.03 * t * t];
      const ch = (0.075 * (1 - 0.82 * Math.pow(t, 1.3)) + 0.004) * (1 + 0.05 * Math.sin(t * 36) * (1 - t)) * (j === NF ? 0.3 : 1);
      secs.push([C, cd, td, ch, ch * 0.34 * (1 - 0.3 * t), t]);
    }
    loft(secs, NA, side);
  }
  const fl = [], NFL = [16, 24, 30][q];
  for (let j = 0; j <= NFL; j++) {
    const x = (j / NFL * 2 - 1) * 0.16, ax = Math.abs(x) / 0.16;
    let ch = 0.072 * Math.pow(Math.max(0, 1 - Math.pow(ax, 2.2)), 0.6) + 0.006;
    const notch = Math.exp(-((x / 0.022) ** 2));
    ch *= 1 - 0.3 * notch;
    const zle = 0.912 + 0.42 * Math.abs(x) - 0.5 * x * x;
    fl.push([[x, 0, zle + ch * 0.5], [0, 0, 1], [0, 1, 0], ch, 0.018 * Math.pow(1 - ax, 0.8) + 0.002, ax]);
  }
  loft(fl, NA, 2);
  return { pos: Float32Array.from(P), nrm: new Float32Array(P.length), uv: Float32Array.from(UV), idx: Uint32Array.from(I) };
}

export default {
  id: 'astral-ocean',
  title: 'Astrálny oceán',
  movement: 'fly',
  speed: 0.7,
  spawn: { pos: [0, 0, 0], yaw: 0, pitch: 0.12 },
  poses: POSES,
  flythrough: FLY,
  flythroughDuration: FLY_DUR,
  doors: [{ pos: DOOR, yaw: Math.PI, to: 'underwater' }],
  bounds: { center: [0, 0, -15], radius: 150 },
  env: {
    sunDir: CORE, sunColor: [1.25, 0.72, 0.55], fogColor: [0.02, 0.018, 0.055], fogDensity: 0.0025,
    ambientSky: [0.16, 0.13, 0.32], ambientGround: [0.07, 0.04, 0.1],
  },
  post: { exposure: 1.0, bloom: 0.2, bloomThreshold: 0.65, bloomKnee: 0.7, bloomRadius: 1.2, saturation: 1.12, vignette: 0.32, contrast: 1.03 },
  clearColor: [0.004, 0.005, 0.016],
  doorLight: [0.1, 0.12, 0.2],
  fov: 64,

  sdf(x, y, z) {
    const qx = x - DOOR[0], qy = y - DOOR[1], qz = z - DOOR[2], r = Math.hypot(qx, qz);
    const rr = qy > -1 ? 3.3 : Math.max(0, 3.3 * (1 + (qy + 1) / 5.5));
    return Math.max(r - rr, qy - 0.02, -7.4 - qy) * 0.85;
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
    this.NT = [500, 1000, 1400][q];
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

    // ---- islet: floating rock under the door: rooty underside, crystals, stones, glowing sprouts, drifting debris ----
    {
      const { fbm2 } = ctx.noise, D = DOOR;
      const prof = [[0.0, -7.4], [0.35, -7.0], [0.8, -5.9], [1.3, -4.8], [1.9, -3.6], [2.5, -2.3], [3.0, -1.2], [3.3, -0.55], [3.35, -0.18], [3.15, 0.0], [2.2, 0.0], [1.0, 0.0], [0.0, 0.0]];
      const SEG = [32, 48, 56][q];
      const rock = M.lathe(prof, SEG);
      const rAt = (y) => { for (let k = 0; k < prof.length - 1; k++) { const [r0, y0] = prof[k], [r1, y1] = prof[k + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1); } return 0; };
      const disp = (a, y, x, z) => {
        const w = Math.min(1, Math.max(0, -y / 0.7));
        const ridge = Math.pow(Math.abs(Math.sin(a * 6 + 1.3 * fbm2(Math.cos(a) * 2, y * 0.3, 2))), 0.6);
        return 1 + w * (0.2 * fbm2(Math.cos(a) * 2 + y * 0.35, Math.sin(a) * 2 + y * 0.2, 4) + 0.07 * fbm2(x * 1.3, z * 1.3 + y, 2) - 0.14 * ridge * Math.min(1, -y / 3));
      };
      for (let i = 0; i < rock.pos.length; i += 3) {
        const x = rock.pos[i], y = rock.pos[i + 1], z = rock.pos[i + 2];
        const a = Math.atan2(z, x), k = disp(a, y, x, z), w = Math.min(1, Math.max(0, -y / 0.7));
        rock.pos[i] = x * k + D[0]; rock.pos[i + 1] = y + w * 0.3 * fbm2(x * 0.7 + 5, z * 0.7, 3) + D[1]; rock.pos[i + 2] = z * k + D[2];
        rock.uv[i / 3 * 2] = 0;
      }
      M.computeNormals(rock);
      for (let j = 0; j < prof.length; j++) {     // weld the lathe seam (first and last column share positions)
        const a = j * (SEG + 1) * 3, b = (j * (SEG + 1) + SEG) * 3;
        for (let c = 0; c < 3; c++) { const m = (rock.nrm[a + c] + rock.nrm[b + c]) * 0.5; rock.nrm[a + c] = rock.nrm[b + c] = m; }
      }
      const parts = [rock], glows = [];
      const m4 = new Float32Array(16);
      const orient = (g, pos, dir) => {
        let [dx, dy, dz] = dir; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        let ax = [-dz, 0, dx]; if (Math.hypot(...ax) < 1e-3) ax = [1, 0, 0];
        const al = Math.hypot(...ax); ax = ax.map((v) => v / al);
        const az = [ax[1] * dz - ax[2] * dy, ax[2] * dx - ax[0] * dz, ax[0] * dy - ax[1] * dx];
        m4.set([ax[0], ax[1], ax[2], 0, dx, dy, dz, 0, az[0], az[1], az[2], 0, pos[0], pos[1], pos[2], 1]);
        return M.transform(g, m4);
      };
      const flag = (g, u, v) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = u; g.uv[i + 1] = v; } return g; };
      const crystal = (pos, dir, r, h, col, glow = true) => {
        const g = orient(M.merge([M.cylinder(r, r * 0.85, h, 6, 1), M.translate(M.cone(r * 0.85, h * 0.4, 6), 0, h, 0)]), pos, dir);
        parts.push(flag(g, 1, col));
        const l = Math.hypot(...dir);
        if (glow) glows.push(pos[0] + dir[0] / l * h, pos[1] + dir[1] / l * h, pos[2] + dir[2] / l * h, h * 1.1, ...(col < 0.5 ? [0.04, 0.12, 0.26] : [0.15, 0.06, 0.24]), 0);
      };
      const rng = ctx.rng;
      // crystals rooted in the underside, pointing out and down
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + 0.4 + rng() * 0.3, y = -1.6 - rng() * 3.6, r = rAt(y) * disp(a, y, 0, 0) * 0.85;
        crystal([D[0] + Math.cos(a) * r, D[1] + y, D[2] + Math.sin(a) * r], [Math.cos(a), -0.7 - rng() * 0.6, Math.sin(a)], 0.07 + 0.05 * rng(), 0.45 + 0.5 * rng(), (i % 2) * 0.9);
      }
      // small crystal clusters on the top rim, out of the door corridor
      for (const [x, z, c] of [[2.3, 1.3, 0], [-2.4, -0.9, 0.9], [-2.0, 1.8, 0], [1.9, -1.9, 0.9]]) {
        for (let k = 0; k < 3; k++) crystal([D[0] + x + (rng() - 0.5) * 0.4, D[1] - 0.12, D[2] + z + (rng() - 0.5) * 0.4], [x * 0.15 + (rng() - 0.5) * 0.6, 1, z * 0.15 + (rng() - 0.5) * 0.6], 0.04 + 0.03 * rng(), 0.22 + 0.25 * rng(), c, k === 0);
      }
      // hanging roots
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + rng(), y0 = -1.5 - rng() * 3, r0 = rAt(y0) * 0.75, len = 2 + rng() * 3.5, path = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10, rr = r0 * (1 - 0.3 * t) + 0.4 * Math.sin(t * 5 + i);
          path.push([D[0] + Math.cos(a + 0.3 * Math.sin(t * 3 + i)) * rr, D[1] + y0 - t * len, D[2] + Math.sin(a + 0.3 * Math.sin(t * 3 + i)) * rr]);
        }
        parts.push(flag(M.tube(path, (t) => 0.13 * (1 - t) + 0.015, 5), 0, 0));
        const e = path[10]; glows.push(e[0], e[1] - 0.1, e[2], 0.5, 0.06, 0.16, 0.3, 0);
      }
      // stones and glowing sprouts on top (kept out of the door corridor and leaf swing)
      const free = (x, z) => Math.hypot(x, z) < 2.9 && !(Math.abs(x) < 1.3 && Math.abs(z) < 2.4);
      for (let i = 0, n = 0; i < 200 && n < 26; i++) {
        const x = (rng() - 0.5) * 6, z = (rng() - 0.5) * 6; if (!free(x, z)) continue; n++;
        const r = M.rock(30 + n, 1, 0.4), sc = 0.06 + 0.16 * rng() * rng();
        M.scale(r, sc, sc * 0.6, sc); M.translate(r, D[0] + x, D[1] + sc * 0.15, D[2] + z);
        parts.push(flag(r, 0, 0));
      }
      for (let i = 0, n = 0; i < 300 && n < 30; i++) {
        const x = (rng() - 0.5) * 6.2, z = (rng() - 0.5) * 6.2; if (!free(x, z)) continue; n++;
        const h = 0.12 + 0.22 * rng(), col = rng() < 0.6 ? 0 : 0.9;
        const g = orient(M.cone(0.018, h, 4), [D[0] + x, D[1] - 0.02, D[2] + z], [(rng() - 0.5) * 0.5, 1, (rng() - 0.5) * 0.5]);
        parts.push(flag(g, 1, col));
        glows.push(D[0] + x, D[1] + h, D[2] + z, 0.12, ...(col < 0.5 ? [0.1, 0.3, 0.45] : [0.4, 0.15, 0.4]), 0);
      }
      // drifting debris (bobs in the vertex shader: uv.x = 2, uv.y = phase)
      for (let i = 0; i < 7; i++) {
        const r = M.rock(11 + i, q > 0 ? 2 : 1, 0.5), sc = 0.2 + 0.45 * rng(), a = i * 0.9 + rng(), d = 4.5 + rng() * 3.5;
        M.scale(r, sc, sc * 0.8, sc); M.translate(r, D[0] + Math.cos(a) * d, D[1] - 1 - rng() * 6, D[2] + Math.sin(a) * d);
        parts.push(flag(r, 2, i * 1.7));
      }
      glows.push(D[0], D[1] - 7.2, D[2], 6, 0.05, 0.1, 0.26, 0);
      this.isletMesh = M.upload(M.merge(parts));
      this.islet = ctx.pipeline({ code: ISLET, buffers: [M.layout], constants: { DX: DOOR[0], DY: DOOR[1], DZ: DOOR[2] }, label: 'ao-islet' });
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
    pass.setPipeline(this.bell); pass.setBindGroup(1, this.jelBG); this.bellMesh.draw(pass, this.NJ);
    pass.setPipeline(this.tent); pass.draw(6 * 16 * this.NSEG, this.NJ);
    pass.setPipeline(this.fishDraw); pass.setBindGroup(1, this.fishDrawBG); pass.draw(6, this.NF);
    pass.setPipeline(this.whale); pass.setBindGroup(1, this.pathBG); this.whaleMesh.draw(pass, 3);
    pass.setPipeline(this.trail); pass.draw(6, this.NT * 3);
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
