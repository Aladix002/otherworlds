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
import RAY from './ray.wgsl';
import LIFE from './life.wgsl';

import { DOOR, CORE, PATHS, JGROUPS, POSES, FLY, FLY_DUR, frame, spine, NURSERY, REEF, RING, RAXIS, ROCKS, CLOUDS } from './layout.js';
const _sp = [0, 0, 0], _ws = new Float32Array(54);
const WH = [0, 1, 2, 6];                 // whale paths that push the camera (the calf is too small to matter)
const NSPR = 6, LROCK = 16, _ld = new Float32Array((LROCK + ROCKS.length) * 4);   // life data: see life.wgsl

// ---------- geometry ----------
export const WRM = 0.108;
const wBase = (s) => s < 0.25 ? Math.pow(Math.sin(s / 0.25 * Math.PI / 2), 0.5) : Math.max(0.03, 1 - 0.93 * Math.pow((s - 0.25) / 0.7, 1.3));
function whaleGeo(q) {
  const P = [], I = [], UV = [];
  const NS = [56, 96, 120][q], NR = [20, 36, 44][q], Rm = WRM;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // height profile keeps a deep tail stock (laterally compressed, like a real peduncle); width narrows instead
  const hB = (s) => s < 0.25 ? wBase(s) : Math.max(0.24, 1 - 0.8 * Math.pow((s - 0.25) / 0.7, 1.6));
  const arch = (s) => 0.02 * Math.sin(Math.PI * Math.min(1, s / 0.95)) - 0.012 * sm(0.75, 0.95, s);
  const topAt = (s) => Rm * hB(s) * 0.86 * (1 - 0.22 * (1 - sm(0.02, 0.2, s))) * (1 + 0.16 * Math.exp(-(((s - 0.4) / 0.17) ** 2)) + 0.22 * Math.exp(-(((s - 0.66) / 0.05) ** 2))) + arch(s);
  for (let j = 0; j <= NS; j++) {
    const v = j / NS, s = 0.95 * (v < 0.5 ? 0.5 * Math.pow(2 * v, 1.25) : 1 - 0.5 * Math.pow(2 - 2 * v, 1.15));
    const b = Rm * wBase(s);
    const wid = b * (1 + 0.1 * Math.exp(-(((s - 0.3) / 0.15) ** 2))) * (1 - 0.3 * sm(0.7, 0.93, s));
    const end = 1 - 0.7 * sm(0.9, 0.95, s);
    const top = topAt(s) * end;
    const bot = (Rm * hB(s) * (0.92 + 0.3 * Math.exp(-(((s - 0.24) / 0.14) ** 2))) - arch(s)) * end;
    for (let i = 0; i < NR; i++) {
      const a = i / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const y = ca > 0 ? top * Math.pow(ca, 0.85) : -bot * Math.pow(-ca, 0.85);
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
      P.push(C[0] + cd[0] * x + td[0] * y, C[1] + cd[1] * x + td[1] * y, C[2] + cd[2] * x + td[2] * y); UV.push(part + 0.3 * c, u);   // + chordwise position (-1 leading .. 1 trailing)
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
  const NF = [16, 26, 32][q], NA = [10, 14, 16][q];
  // humpback flippers: long, curved back, tapered, knobbly leading edge
  for (const side of [-1, 1]) {
    const s0 = 0.26, b0 = Rm * wBase(s0), secs = [];
    const cen = (t) => [side * (0.5 * b0 + 0.25 * t - 0.07 * t * t), -0.5 * b0 - 0.04 * t - 0.06 * t * t, s0 + 0.05 * t + 0.17 * t * t];
    for (let j = 0; j <= NF; j++) {
      const t = j / NF, A = cen(t + 0.01), B = cen(t - 0.01), T = nrm([A[0] - B[0], A[1] - B[1], A[2] - B[2]]);
      const zd = [0, 0.2, 1], k = zd[0] * T[0] + zd[1] * T[1] + zd[2] * T[2];
      const cd = nrm([zd[0] - T[0] * k, zd[1] - T[1] * k, zd[2] - T[2] * k]), td = cross(T, cd);
      const bump = 0.007 * (0.5 + 0.5 * Math.sin(t * 34)) * (1 - 0.7 * t) * sm(0.05, 0.2, t);
      const ch = (0.062 * Math.pow(1 - t, 0.55) * (0.62 + 0.38 * sm(0, 0.3, t)) + 0.004 + bump) * (j === NF ? 0.3 : 1);
      const C = cen(t); for (let c = 0; c < 3; c++) C[c] -= cd[c] * bump * 0.5;
      secs.push([C, cd, td, ch, ch * 0.36 * (1 - 0.45 * t), t]);
    }
    loft(secs, NA, side);
  }
  // horizontal falcate fluke with a median notch
  const fl = [], NFL = [20, 32, 40][q];
  for (let j = 0; j <= NFL; j++) {
    const x = (j / NFL * 2 - 1) * 0.15, ax = Math.abs(x) / 0.15;
    const zle = 0.885 + 0.12 * Math.pow(ax, 1.5), zte = 1.0 + 0.04 * ax * ax - 0.035 * Math.exp(-((x / 0.016) ** 2));
    const ch = Math.max(0.005, (zte - zle) * (1 - 0.6 * Math.pow(ax, 6)));
    fl.push([[x, -0.012 * ax * ax, zle + ch * 0.5], [0, 0, 1], [0, 1, 0], ch, 0.034 * Math.pow(1 - ax, 0.7) + 0.003, ax]);
  }
  loft(fl, NA, 2);
  // small dorsal hump on the midline
  const df = [];
  for (let j = 0; j <= 6; j++) {
    const t = j / 6, z = 0.64 + 0.05 * t, ch = 0.085 * Math.pow(1 - t, 0.8) + 0.004;
    df.push([[0, topAt(0.66) - 0.014 + 0.042 * Math.pow(t, 0.8), z + ch * 0.1], [0, 0, 1], [1, 0, 0], ch, ch * 0.3, t]);
  }
  loft(df, NA, 3);
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
    let d = Math.max(r - rr, qy - 0.02, -7.4 - qy) * 0.85;
    // whales gently shoulder the camera aside instead of passing through it
    const t = this.t || 0;
    for (let k = 0; k < 4; k++) {
      const p = PATHS[WH[k]], R = p[11] * 0.1 + 2.5;
      for (let j = 0; j < 6; j++) {
        spine(p, t, 0.06 + j * 0.17, _sp);
        const dd = Math.hypot(x - _sp[0], y - _sp[1], z - _sp[2]) - R;
        if (dd < d) d = dd;
      }
    }
    for (let k = 0; k < ROCKS.length; k++) {
      const o = (LROCK + k) * 4, dd = Math.hypot(x - _ld[o], (y - _ld[o + 1]) * (y > _ld[o + 1] ? 1.5 : 1), z - _ld[o + 2]) - _ld[o + 3] * 1.05;
      if (dd < d) d = dd;
    }
    return d;
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
    const whaleMod = ctx.shader(UTIL + COMMON + WHALE, 'ao-whale');
    const whaleL = ctx.layout(['storage', 'texture-cube', 'sampler']);
    this.whaleBG = ctx.bindGroup(whaleL, [this.pathBuf, cubeView(this.farTex), ctx.samplers.linear]);
    this.whalePre = ctx.pipeline({ module: whaleMod, fs: 'fsd', writeMask: 0, buffers: [M.layout], layouts: [whaleL], label: 'ao-whale-depth' });
    this.whale = ctx.pipeline({ module: whaleMod, buffers: [M.layout], layouts: [whaleL], blend: 'premul', depthCompare: 'equal', label: 'ao-whale' });
    this.whaleAura = ctx.pipeline({ module: whaleMod, vs: 'vsh', fs: 'fsh', layouts: [whaleL], blend: 'add', cull: 'none', label: 'ao-aura' });
    this.NT = [900, 2200, 3200][q];
    this.trail = ctx.pipeline({ code: UTIL + COMMON + TRAIL, layouts: [pathL], blend: 'add', cull: 'none', constants: { NT: this.NT }, label: 'ao-trail' });
    // ---- rays: the giant of the deep (instance 0) and the reef pod ----
    {
      const NX = [32, 56, 64][q], NV = 8, g = M.plane(2, 1, NX, NV), n = g.pos.length / 3, tl = M.plane(0.03, 1, 1, 10);
      for (let i = 0; i < n; i++) { g.pos[i * 3 + 2] += 0.5; g.uv[i * 2] = 0; }
      for (let i = 0; i < tl.pos.length / 3; i++) { tl.pos[i * 3 + 2] += 1.5; tl.uv[i * 2] = 1; }
      this.rayMesh = M.upload(M.merge([g, tl]));
      this.NRAY = [5, 7, 9][q];
      this.ray = ctx.pipeline({ code: UTIL + COMMON + RAY, buffers: [M.layout], layouts: [pathL], blend: 'premul', cull: 'none', label: 'ao-ray' });
    }

    // ---- fish ----
    const NF = [1152, 2176, 3584][q], FA = Math.round(NF * 0.42), FB = Math.round(NF * 0.8), rng = ctx.rng;
    const fd = new Float32Array(NF * 16);
    for (let i = 0; i < NF; i++) { fd[i * 16 + 3] = rng() * 100; fd[i * 16 + 7] = 10 * rng(); }
    this.fishBuf = ctx.buffer(fd, 'storage');
    this.NF = NF;
    const fishSimL = ctx.layout(['storage', 'storage-rw']), fishDrawL = ctx.layout(['storage', 'storage']);
    this.fishSim = ctx.compute({ code: COMMON + FISH, entry: 'sim', layouts: [fishSimL], constants: { NA: FA, NB: FB } });
    this.fishSimBG = ctx.bindGroup(fishSimL, [this.pathBuf, this.fishBuf]);
    this.fishDraw = ctx.pipeline({ code: UTIL + COMMON + FISHDRAW, layouts: [fishDrawL], blend: 'add', cull: 'none', constants: { NA: FA, NB: FB }, label: 'ao-fish' });
    this.fishDrawBG = ctx.bindGroup(fishDrawL, [this.pathBuf, this.fishBuf]);
    this.fishFrames = 0;

    // ---- jellies ----
    const jd = [], jsc = [0.6, 1, 1][q];
    this.jgroups = [];
    const rng2 = ctx.math.makeRng(77);     // new content draws from its own stream, so the old layout stays put
    JGROUPS.forEach(([x, by, z, r, n, H, h0, h1, sm = 1], gi) => {
      const cnt = Math.round(n * (sm > 1 ? 1 : jsc)), rng = gi > 2 ? rng2 : ctx.rng;
      this.jgroups.push([x, by + H * 0.5, z]);
      const placed = [];
      for (let i = 0; i < cnt; i++) {
        const size = (0.4 + Math.pow(rng(), 2.2) * 1.5) * sm;
        let jx = 0, jz = 0;
        // every jelly keeps its own column: bells never nest, tentacles have room
        for (let tr = 0, ok = false; tr < 300 && !ok; tr++) {
          const a = rng() * Math.PI * 2, rr = r * (1 + tr / 150) * Math.sqrt(rng());
          jx = Math.cos(a) * rr; jz = Math.sin(a) * rr;
          ok = placed.every(([px, pz, ps]) => Math.hypot(px - jx, pz - jz) > (ps + size) * 1.15 + 1.2);
        }
        placed.push([jx, jz, size]);
        jd.push(x + jx, by, z + jz, size, 3.2 + rng() * 2.2, h0 + (h1 - h0) * rng(), rng(), rng(), H, 0.8 + rng() * 0.5, 0.65 + 0.75 * rng(), 0, 0, 0, 0, 0);
      }
    });
    this.NJ = jd.length / 16;
    this.jd = Float32Array.from(jd);
    this.jelBuf = ctx.buffer(this.jd, 'storage');
    const jelL = ctx.layout(['storage']);
    this.jelBG = ctx.bindGroup(jelL, [this.jelBuf]);
    // bell profile, smoothed (Catmull-Rom midpoints) so large bells keep a round silhouette
    const bp = [[0.84, -0.07], [0.97, 0.0], [1.0, 0.1], [0.97, 0.25], [0.88, 0.42], [0.72, 0.58], [0.5, 0.7], [0.25, 0.77], [0.0, 0.79]], bq = [];
    bp.forEach((b, i) => {
      bq.push(b);
      if (i < 8 && q) { const a = bp[Math.max(0, i - 1)], c = bp[i + 1], d = bp[Math.min(8, i + 2)]; bq.push([0, 1].map((k) => (9 * (b[k] + c[k]) - a[k] - d[k]) / 16)); }
    });
    const bell = M.lathe(bq, [16, 36, 44][q]);
    this.bellMesh = M.upload(bell);
    this.bell = ctx.pipeline({ code: UTIL + JELLY, buffers: [M.layout], layouts: [jelL], blend: 'add', cull: 'none', label: 'ao-bell' });
    this.NSEG = [10, 20, 24][q];
    this.jhalo = ctx.pipeline({ code: UTIL + JELLY, vs: 'vsg', fs: 'fsg', layouts: [jelL], blend: 'add', cull: 'none', label: 'ao-jhalo' });
    this.tent = ctx.pipeline({ code: UTIL + JELLY, vs: 'vst', fs: 'fst', layouts: [jelL], blend: 'add', cull: 'none', constants: { NSEG: this.NSEG }, label: 'ao-tent' });
    await progress(0.85);

    // ---- motes ----
    this.NM = [900, 1800, 3000][q];
    this.motes = ctx.pipeline({ code: UTIL + MOTES, blend: 'add', cull: 'none', label: 'ao-motes' });

    // ---- puffs ----
    const ptex = ctx.texture(384, 384, 'rgba16float', TU.TEXTURE_BINDING | TU.STORAGE_BINDING);
    {
      const L = ctx.layout(['storage-texture:rgba16float']);
      const pipe = ctx.compute({ code: PUFFBAKE, entry: 'bake', layouts: [L] });
      const enc = device.createCommandEncoder(), cp = ctx.beginCompute(enc);
      cp.setPipeline(pipe); cp.setBindGroup(1, ctx.bindGroup(L, [ptex.createView()])); cp.dispatchWorkgroups(48, 48); cp.end();
      device.queue.submit([enc.finish()]);
    }
    // clusters of overlapping cards, 3-10x apart in scale, so they merge into larger structures instead of single puffs
    const NPF = [30, 60, 78][q], pf = [];
    const pcols = [[0.10, 0.04, 0.22], [0.18, 0.03, 0.14], [0.03, 0.11, 0.17], [0.2, 0.05, 0.13], [0.06, 0.06, 0.2]];
    for (let i = 0, cx = 0, cy = 0, cz = 0, cs = 0, ci = 0; i < NPF; i++) {
      if (i % 6 === 0) {
        do { const a = rng() * Math.PI * 2, b = (rng() - 0.5) * 1.4, d = 80 + rng() * 150; cx = Math.cos(a) * Math.cos(b) * d; cy = Math.sin(b) * d * 0.6; cz = Math.sin(a) * Math.cos(b) * d - 15; }
        while (Math.hypot(cx - DOOR[0], cy - DOOR[1], cz - DOOR[2]) < 70);
        cs = 55 + rng() * 50; ci = Math.floor(rng() * 5);
        pf.push(cx, cy, cz, cs, ...pcols[ci], i + 4 * Math.floor(rng() * 50));
      } else {
        const s = cs * (0.25 + 0.55 * rng()), o = cs * 0.8, c = pcols[(ci + (rng() < 0.3 ? 1 : 0)) % 5];
        pf.push(cx + (rng() - 0.5) * 2 * o, cy + (rng() - 0.5) * o, cz + (rng() - 0.5) * 2 * o, s, c[0], c[1], c[2], i + 4 * Math.floor(rng() * 50));
      }
    }
    this.NPF = NPF;
    const puffL = ctx.layout(['storage', 'texture', 'sampler', 'texture-cube']);
    this.puffBG = ctx.bindGroup(puffL, [ctx.buffer(Float32Array.from(pf), 'storage'), ptex.createView(), ctx.samplers.linear, cubeView(this.farTex)]);
    this.puffs = ctx.pipeline({ code: UTIL + PUFFS, layouts: [puffL], blend: 'premul', cull: 'none', label: 'ao-puffs' });

    // ---- islet: floating rock under the door. Stone steps carry the threshold, roots climb the frame, the rim is
    // broken up by boulders; crystals, curled tendrils, grass tufts, hanging roots, drifting debris ----
    {
      const { fbm2 } = ctx.noise, D = DOOR;
      const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      // door-local frame = world - D (the door plane is z = 0); everything here is mirror-symmetric enough not to care about yaw
      const sdR = (x, z, hx, hz) => { const qx = Math.abs(x) - hx, qz = Math.abs(z) - hz; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0); };
      const GY = -0.46, RT = 3.2;
      const TIER = [[0.95, 0.5, 0], [1.3, 0.85, -0.16], [1.65, 1.2, -0.32]];     // half-extents and top of the three steps
      const topH = (x, z) => {
        const sd = sdR(x, z, 1.65, 1.2), r = Math.hypot(x, z);
        const lump = Math.max(0, fbm2(x * 0.7 + 9, z * 0.7 + 2, 3) + 0.15);
        return GY + sm(0.05, 0.6, sd) * (0.08 * fbm2(x * 1.9 + 3, z * 1.9, 4) + 0.5 * sm(0.3, 1.5, sd) * lump + 0.12 * sm(2.5, 3.1, r));
      };
      const gh = (x, z) => { for (const [hx, hz, y] of TIER) if (sdR(x, z, hx, hz) < 0) return y; return topH(x, z); };
      const under = [[0.0, -7.4], [0.35, -7.0], [0.8, -5.9], [1.3, -4.8], [1.9, -3.6], [2.5, -2.3], [3.0, -1.2], [3.3, -0.72], [3.36, -0.45], [RT, GY]];
      const prof = [];
      for (let k = 0; k < under.length - 1; k++) for (let m = 0; m < 3; m++) { const a = under[k], b = under[k + 1], t = m / 3; prof.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      const jTop = prof.length, NTOP = [12, 22, 26][q];
      for (let k = 0; k <= NTOP; k++) prof.push([RT * (1 - k / NTOP), GY]);
      const SEG = [40, 72, 88][q];
      const rock = M.lathe(prof, SEG);
      const rAt = (y) => { for (let k = 0; k < under.length - 1; k++) { const [r0, y0] = under[k], [r1, y1] = under[k + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1); } return 0; };
      const rimK = (a) => 1 + 0.1 * fbm2(2 * Math.cos(a) + 5, 2 * Math.sin(a), 3) + 0.04 * Math.sin(3 * a + 1);
      const disp = (a, y, x, z) => {
        const w = Math.min(1, Math.max(0, (GY - y) / 0.7));
        const ridge = Math.pow(Math.abs(Math.sin(a * 6 + 1.3 * fbm2(Math.cos(a) * 2, y * 0.3, 2))), 0.6);
        const strata = Math.pow(Math.abs(Math.sin(y * 2.7 + 1.5 * fbm2(Math.cos(a) * 1.5 + 3, Math.sin(a) * 1.5, 2))), 0.5);
        return rimK(a) * (1 + w * (0.3 * fbm2(Math.cos(a) * 2 + y * 0.35, Math.sin(a) * 2 + y * 0.2, 4) + 0.1 * fbm2(x * 1.3, z * 1.3 + y, 2) - 0.15 * ridge * Math.min(1, -y / 3) + 0.09 * strata - 0.04));
      };
      for (let v = 0; v < rock.pos.length / 3; v++) {
        const i = v * 3, j = Math.floor(v / (SEG + 1));
        const x = rock.pos[i], y = rock.pos[i + 1], z = rock.pos[i + 2], a = Math.atan2(z, x);
        if (j >= jTop) {
          const r = Math.hypot(x, z), k = 1 + (rimK(a) - 1) * (r / RT) ** 2, X = x * k, Z = z * k;
          rock.pos[i] = X + D[0]; rock.pos[i + 1] = topH(X, Z) + D[1]; rock.pos[i + 2] = Z + D[2];
        } else {
          const k = disp(a, y, x, z), w = Math.min(1, Math.max(0, (GY - y) / 0.7));
          rock.pos[i] = x * k + D[0]; rock.pos[i + 1] = y + w * 0.3 * fbm2(x * 0.7 + 5, z * 0.7, 3) + (1 - w) * (topH(x * k, z * k) - GY) + D[1]; rock.pos[i + 2] = z * k + D[2];
        }
        rock.uv[v * 2] = 0; rock.uv[v * 2 + 1] = 0;
      }
      M.computeNormals(rock);
      for (let j = 0; j < prof.length; j++) {     // weld the lathe seam (first and last column share positions)
        const a = j * (SEG + 1) * 3, b = (j * (SEG + 1) + SEG) * 3;
        for (let c = 0; c < 3; c++) { const m = (rock.nrm[a + c] + rock.nrm[b + c]) * 0.5; rock.nrm[a + c] = rock.nrm[b + c] = m; }
      }
      const parts = [rock], glows = [], lights = [];
      const m4 = new Float32Array(16);
      const orient = (g, pos, dir) => {
        let [dx, dy, dz] = dir; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        let ax = [-dz, 0, dx]; if (Math.hypot(...ax) < 1e-3) ax = [1, 0, 0];
        const al = Math.hypot(...ax); ax = ax.map((v) => v / al);
        const az = [ax[1] * dz - ax[2] * dy, ax[2] * dx - ax[0] * dz, ax[0] * dy - ax[1] * dx];
        m4.set([ax[0], ax[1], ax[2], 0, dx, dy, dz, 0, az[0], az[1], az[2], 0, pos[0], pos[1], pos[2], 1]);
        return M.transform(g, m4);
      };
      const flag = (g, u, v) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = u; if (v !== undefined) g.uv[i + 1] = v; } return g; };
      const W3 = (x, y, z) => [D[0] + x, D[1] + y, D[2] + z];
      const crystal = (pos, dir, r, h, col, glow = 0, mat = 1) => {
        const g = orient(M.merge([M.cylinder(r, r * 0.85, h, 6, 1), M.translate(M.cone(r * 0.85, h * 0.4, 6), 0, h, 0)]), pos, dir);
        parts.push(flag(g, mat, col));
        const l = Math.hypot(...dir);
        if (glow) glows.push(pos[0] + dir[0] / l * h, pos[1] + dir[1] / l * h, pos[2] + dir[2] / l * h, h * glow, ...(col < 0.5 ? [0.04, 0.12, 0.26] : [0.15, 0.06, 0.24]), 0);
      };
      const rng = ctx.rng;
      // three clearly stepped tiers of stone blocks carry the threshold
      const slab = (x0, x1, z0, z1, top, h) => {
        const g = M.box(x1 - x0 - 0.012, h, z1 - z0 - 0.012);
        m4.fill(0); const a = (rng() - 0.5) * 0.02, c = Math.cos(a), s = Math.sin(a);
        m4.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, D[0] + (x0 + x1) / 2, D[1] + top - h / 2, D[2] + (z0 + z1) / 2, 1]);
        parts.push(flag(M.transform(g, m4), 7, rng()));
      };
      const row = (x0, x1, z0, z1, n, top, alongX) => {
        let a = alongX ? x0 : z0; const e = alongX ? x1 : z1;
        for (let k = 1; k <= n; k++) {
          const b = k === n ? e : a + (e - a) / (n - k + 1) * (0.8 + 0.4 * rng()), t = top - 0.008 * rng();
          if (alongX) slab(a, b, z0, z1, t, 0.22); else slab(x0, x1, a, b, t, 0.22);
          a = b;
        }
      };
      row(-0.95, 0.95, -0.5, 0.5, 3, 0, true);
      TIER.slice(1).forEach(([hx, hz, y], k) => {
        const [ix, iz] = TIER[k];
        row(-hx, hx, iz, hz, 3 + k, y, true); row(-hx, hx, -hz, -iz, 3 + k, y, true);
        row(ix, hx, -iz, iz, 2, y, false); row(-hx, -ix, -iz, iz, 2, y, false);
      });
      // nothing may stand in the leaf swing or on the steps
      const free = (x, z, m = 0.25) => Math.hypot(x, z) < 3.0 && sdR(x, z, 1.65, 1.2) > m;
      // boulders and standing stones break up the rim silhouette (the approach along z stays open)
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + rng() * 0.3, r = 2.5 + 0.65 * rng(), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < 1.2) continue;
        const g = M.rock(40 + i, 2, 0.45), sc = 0.2 + 0.42 * rng() * rng();
        M.scale(g, sc, sc * (0.7 + 0.5 * rng()), sc); M.translate(g, ...W3(x, topH(x, z) + sc * 0.15, z));
        parts.push(flag(g, 0, 0));
      }
      for (const [x, z, h] of [[2.5, 0.8, 1.0], [-2.45, -1.2, 0.8], [-2.25, 1.75, 0.6], [2.1, -1.9, 0.5]]) {
        const g = M.rock(70 + x * 3, 2, 0.4);
        M.scale(g, 0.3 + 0.1 * h, h, 0.26 + 0.1 * h); orient(g, W3(x, topH(x, z) + h * 0.2, z), [x * 0.06, 1, z * 0.06]);
        parts.push(flag(g, 0, 0));
      }
      for (let i = 0, n = 0; i < 200 && n < 18; i++) {
        const x = (rng() - 0.5) * 6, z = (rng() - 0.5) * 6; if (!free(x, z, 0.1)) continue; n++;
        const sc = 0.04 + 0.1 * rng() * rng(), g = M.rock(30 + n, sc > 0.07 ? 2 : 1, 0.4);
        M.scale(g, sc, sc * 0.75, sc); M.translate(g, ...W3(x, topH(x, z) + sc * 0.2, z));
        parts.push(flag(g, 0, 0));
      }
      // rock chunks fused to the underside
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4 + rng(), y = -0.9 - rng() * 4.6, r = rAt(y) * disp(a, y, 0, 0) * 0.92, sc = 0.35 + 0.5 * rng();
        const g = M.rock(90 + i, 2, 0.5);
        M.scale(g, sc, sc * (1.1 + 0.6 * rng()), sc); orient(g, W3(Math.cos(a) * r, y, Math.sin(a) * r), [Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5]);
        parts.push(flag(g, 0, 0));
      }
      // crystals rooted in the underside, pointing out and down
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + 0.4 + rng() * 0.3, y = -1.6 - rng() * 3.6, r = rAt(y) * disp(a, y, 0, 0) * 0.85;
        crystal(W3(Math.cos(a) * r, y, Math.sin(a) * r), [Math.cos(a), -0.7 - rng() * 0.6, Math.sin(a)], 0.07 + 0.05 * rng(), 0.45 + 0.5 * rng(), (i % 2) * 0.9, 1.1);
      }
      // crystal clusters on top; each lights the ground around it (CL in the shader)
      for (const [x, z, c] of [[2.15, 1.45, 0], [-2.35, -0.6, 0.9], [-1.7, 2.1, 0], [1.75, -2.0, 0.9]]) {
        const y = topH(x, z) - 0.06;
        for (let k = 0; k < 5; k++) {
          const h = k === 0 ? 0.55 + 0.2 * rng() : 0.16 + 0.26 * rng(), o = k === 0 ? 0 : 0.22;
          crystal(W3(x + (rng() - 0.5) * o * 2, y, z + (rng() - 0.5) * o * 2), [x * 0.06 + (rng() - 0.5) * (k ? 0.9 : 0.3), 1, z * 0.06 + (rng() - 0.5) * (k ? 0.9 : 0.3)], k === 0 ? 0.075 : 0.035 + 0.03 * rng(), h, c, k === 0 ? 1.5 : 0);
        }
        lights.push(...W3(x, y + 0.3, z), c);
      }
      // roots: hanging under the islet, and creeping over the steps to climb the door posts
      const root = (path, rad, glow) => {
        const g = M.tube(path, rad, 10);
        for (let i = 0; i < g.uv.length; i += 2) g.uv[i] = 3 + g.uv[i] * 0.9;     // 3 + angle around the root (for the light strands)
        parts.push(g);
        const e = path[path.length - 1]; if (glow) glows.push(e[0], e[1], e[2], glow, 0.05, 0.16, 0.26, 0);
      };
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + rng(), y0 = -1.5 - rng() * 3, r0 = rAt(y0) * 0.75, len = 2 + rng() * 3.5, path = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, rr = r0 * (1 - 0.3 * t) + 0.4 * Math.sin(t * 5 + i), aa = a + 0.3 * Math.sin(t * 3 + i);
          path.push(W3(Math.cos(aa) * rr, y0 - t * len, Math.sin(aa) * rr));
        }
        root(path, (t) => 0.13 - 0.115 * Math.pow(t, 0.7), 0.4);
      }
      // a worn stone foot hugs the outside of each jamb, so the frame is set into the masonry
      for (const sx of [-1, 1]) {
        const g = M.rock(120 + sx, 2, 0.25);
        M.scale(g, 0.17, 0.2, 0.25); M.translate(g, ...W3(sx * 0.76, 0.03, 0));
        parts.push(flag(g, 7, 0.4 + 0.3 * rng()));
      }
      // curled tendrils (fiddleheads) with a light in the curl
      for (let i = 0, n = 0; i < 400 && n < [10, 18, 22][q]; i++) {
        const x = (rng() - 0.5) * 6, z = (rng() - 0.5) * 6; if (!free(x, z)) continue; n++;
        const h = 0.14 + 0.26 * rng(), a = rng() * 6.28, ca = Math.cos(a), sa = Math.sin(a), rc = h * (0.24 + 0.1 * rng()), y0 = topH(x, z) - 0.03, path = [];
        for (let k = 0; k <= 26; k++) {
          const t = k / 26;
          let o, y;
          if (t < 0.5) { const s = t / 0.5; o = 0.12 * h * s * s; y = h * s; }
          else { const f = (t - 0.5) / 0.5, phi = f * 8.6, r = rc * (1 - 0.8 * f); o = 0.12 * h + rc - Math.cos(phi) * r - (rc - r) * 0.3; y = h + Math.sin(phi) * r; }
          path.push(W3(x + ca * o, y0 + y, z + sa * o));
        }
        parts.push(flag(M.tube(path, (t) => 0.02 * (1 - 0.65 * t), 5), 5));
      }
      // grass tufts: thin curved blades, double-sided
      const gp = [], gn = [], gu = [], gi = [];
      const blade = (px, py, pz, ca, sa, h, lean, w) => {
        const base = gp.length / 3;
        for (let k = 0; k <= 4; k++) {
          const t = k / 4, o = lean * Math.abs(h) * t * t, ww = w * (1 - t * 0.92);
          for (const sd of [-1, 1]) { gp.push(px + ca * o - sa * ww * sd, py + h * t * (1 - 0.25 * lean * t), pz + sa * o + ca * ww * sd); gn.push(0, 1, 0); gu.push(6, t); }
        }
        for (let k = 0; k < 4; k++) { const v = base + k * 2; gi.push(v, v + 1, v + 2, v + 1, v + 3, v + 2, v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      };
      {
        const NTF = [50, 100, 130][q];
        for (let i = 0, n = 0; i < 900 && n < NTF; i++) {
          let x = (rng() - 0.5) * 6.2, z = (rng() - 0.5) * 6.2;
          if (i % 3 === 0) { const a = rng() * 6.28, r = 0.55 + 0.25 * rng(); x = Math.cos(a) * (1.65 + r) * 0.95; z = Math.sin(a) * (1.2 + r); }   // hug the foot of the steps
          if (!free(x, z, 0.06) || Math.hypot(x, z) > 2.95) continue; n++;
          const nb = 5 + Math.floor(rng() * 5), th = 0.1 + 0.2 * rng();
          for (let b = 0; b < nb; b++) {
            const a = rng() * 6.28, ca = Math.cos(a), sa = Math.sin(a), h = th * (0.6 + 0.6 * rng()), lean = 0.25 + 0.6 * rng(), w = 0.011 + 0.007 * rng();
            const bx = x + (rng() - 0.5) * 0.09, bz = z + (rng() - 0.5) * 0.09;
            blade(D[0] + bx, D[1] + topH(bx, bz) - 0.02, D[2] + bz, ca, sa, h, lean, w);
          }
        }
      }
      // drifting debris (bobs in the vertex shader: uv.x = 2, uv.y = phase)
      for (let i = 0; i < 8; i++) {
        const r = M.rock(11 + i, q > 0 ? 2 : 1, 0.5), sc = 0.2 + 0.5 * rng(), a = i * 0.9 + rng(), d = 4.6 + rng() * 3.5;
        M.scale(r, sc, sc * 0.8, sc); M.translate(r, ...W3(Math.cos(a) * d, -1 - rng() * 6, Math.sin(a) * d));
        parts.push(flag(r, 2, i * 1.7));
      }
      // ---- the reef field: asteroid chunks grown over with branching light-coral, weed and crystals ----
      const hat = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
      const coral = (p, d, h, lvl, n) => {
        const path = [], bx = (rng2() - 0.5) * 0.5, bz = (rng2() - 0.5) * 0.5;
        for (let k = 0; k <= 5; k++) { const t = k / 5; path.push([p[0] + (d[0] + bx * t) * h * t, p[1] + (d[1] + 0.25 * t) * h * t, p[2] + (d[2] + bz * t) * h * t]); }
        const g = M.tube(path, (t) => h * (0.13 - 0.06 * t), 5);
        for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = 5; g.uv[i + 1] = Math.pow((n - lvl - 1 + g.uv[i + 1]) / n, 0.6); }
        parts.push(g);
        if (!lvl) glows.push(...path[5], h * 0.5, ...(rng2() < 0.3 ? [0.1, 0.03, 0.08] : [0.02, 0.09, 0.08]), 0);     // every tip carries a light
        if (lvl) for (let b = 0; b < 3; b++) coral(path[5], hat([d[0] + (rng2() - 0.5) * 1.5, d[1] + (rng2() - 0.5) * 1.5 + 0.3, d[2] + (rng2() - 0.5) * 1.5]), h * 0.62, lvl - 1, n);
      };
      ROCKS.forEach(([dx, dy, dz, R], k) => {
        const c = [REEF[0] + dx, REEF[1] + dy, REEF[2] + dz], top = M.rock(200 + k * 7, 3, 0.5), keel = M.rock(230 + k * 5, 3, 0.55);
        _ld.set([c[0], c[1], c[2], R], (LROCK + k) * 4);
        M.scale(top, R, R * 0.62, R * 0.9); M.translate(top, c[0], c[1], c[2]);
        M.scale(keel, R * 0.95, R * (0.8 + 0.5 * rng2()), R * 0.85); orient(keel, c, [0.15 * rng2(), -1, 0.15 * rng2()]);     // a rough keel hides the flat underside
        const nt = top.pos.length / 3, g = M.merge([M.computeNormals(top), M.computeNormals(keel)]);
        parts.push(flag(g, 4, 0));
        glows.push(c[0], c[1] - R * 0.5, c[2], R * 1.5, 0.008, 0.05, 0.06, 0);
        const nv = g.pos.length / 3;
        for (let j = 0, m = 0; m < (5 + R * 9) * [0.5, 1, 1.2][q] && j < 900; j++) {
          const v = Math.floor(rng2() * nv) * 3, p = [g.pos[v], g.pos[v + 1], g.pos[v + 2]], nr = [g.nrm[v], g.nrm[v + 1], g.nrm[v + 2]];
          if (v < nt * 3 ? nr[1] < 0.15 : nr[1] > -0.3 || rng2() < 0.7) continue;
          m++;
          const up = nr[1] < 0 ? -1 : 1, d = hat([nr[0], nr[1] + 0.6 * up, nr[2]]), kind = rng2();
          p[1] -= 0.05 * up;
          if (kind < 0.7) coral(p, d, 0.45 + 0.9 * rng2(), 2, 3);
          else for (let b = 0, nb = 4 + Math.floor(rng2() * 5); b < nb; b++) {       // weed tuft
            const a = rng2() * 6.28;
            blade(p[0], p[1], p[2], Math.cos(a), Math.sin(a), (0.25 + 0.5 * rng2()) * up, 0.3 + 0.6 * rng2(), 0.02 + 0.012 * rng2());
          }
        }
      });
      parts.push({ pos: Float32Array.from(gp), nrm: Float32Array.from(gn), uv: Float32Array.from(gu), idx: Uint32Array.from(gi) });
      // ---- the crystal ring: shards circling the jelly column behind the islet (material 8 turns in the shader) ----
      {
        const e1 = hat([RAXIS[1], -RAXIS[0], 0]), e2 = [RAXIS[1] * e1[2] - RAXIS[2] * e1[1], RAXIS[2] * e1[0] - RAXIS[0] * e1[2], RAXIS[0] * e1[1] - RAXIS[1] * e1[0]];
        // irregular clusters: one long blade and a few splinters each, lying along the orbit
        for (let i = 0, a = 0; a < 6.1; i++) {
          a += 0.25 + 0.6 * rng2();
          for (let k = 0, n = 1 + Math.floor(rng2() * 4); k < n; k++) {
            const b = a + (rng2() - 0.5) * 0.16, R = 10 + (rng2() - 0.5) * (k ? 2 : 0.6), ca = Math.cos(b), sa = Math.sin(b), y = (rng2() - 0.5) * (k ? 1.6 : 0.4);
            const p = [0, 1, 2].map((j) => RING[j] + (e1[j] * ca + e2[j] * sa) * R + RAXIS[j] * y);
            const d = hat([0, 1, 2].map((j) => e2[j] * ca - e1[j] * sa + (rng2() - 0.5) * 0.7));     // orbit tangent, a little askew
            const h = k ? 0.3 + 0.5 * rng2() : 1.1 + 1.4 * rng2(), r = h * (0.07 + 0.04 * rng2()) + 0.02, col = (i % 3 ? 0.08 : 0.8) + 0.15 * rng2();
            crystal(p, d, r, h, col, k ? 0 : 0.35, 8); crystal(p, d.map((v) => -v), r, h * (0.5 + 0.5 * rng2()), col, 0, 8);
          }
        }
      }
      glows.push(D[0], D[1] - 6.6, D[2], 3.6, 0.035, 0.07, 0.18, 0, D[0] + 0.9, D[1] - 5.2, D[2] - 0.6, 2.2, 0.03, 0.03, 0.1, 0, D[0] - 0.8, D[1] - 4.4, D[2] + 0.7, 1.8, 0.015, 0.05, 0.09, 0);
      this.isletMesh = M.upload(M.merge(parts));
      const v3s = (v) => 'vec3f(' + v.map((x) => x.toFixed(3)).join(',') + ');\n';
      const CLS = 'const RC = ' + v3s(RING) + 'const RA = ' + v3s(RAXIS) + 'const CL = array<vec4f, 4>(' + [0, 1, 2, 3].map((k) => 'vec4f(' + lights.slice(k * 4, k * 4 + 4).map((v) => v.toFixed(3)).join(',') + ')').join(',') + ');\n';
      const TRS = 'const TIERS = array<vec3f, 3>(' + TIER.map((v) => 'vec3f(' + v.map((x) => x.toFixed(3)).join(',') + ')').join(',') + ');\n';
      this.islet = ctx.pipeline({ code: CLS + TRS + ISLET, buffers: [M.layout], constants: { DX: DOOR[0], DY: DOOR[1], DZ: DOOR[2] }, label: 'ao-islet' });
      const glL = ctx.layout(['storage']);
      this.NG = glows.length / 8;
      this.glowBG = ctx.bindGroup(glL, [ctx.buffer(Float32Array.from(glows), 'storage')]);
      this.glow = ctx.pipeline({ code: UTIL + GLOW, layouts: [glL], blend: 'add', cull: 'none', label: 'ao-glow' });
    }
    // ---- small life (see life.wgsl) ----
    {
      for (let i = 0; i < NSPR; i++) _ld.set([RING[0] + 3 * Math.cos(i), RING[1] + Math.sin(i * 2), RING[2] + 3 * Math.sin(i), 0], i * 4);
      CLOUDS.forEach((c, i) => { _ld.set(c.slice(0, 4), (6 + i) * 4); _ld[(11 + i) * 4 + 2] = c[4]; });
      this.lifeBuf = ctx.buffer(_ld, 'storage');
      const L = ctx.layout(['storage']), NP = [1000, 2000, 3000][q], ND = [90, 160, 220][q], NE = 84, NC = [260, 500, 700][q];
      this.lifeBG = ctx.bindGroup(L, [this.lifeBuf]);
      this.NL = NP + ND + 2 * NE + NC + NSPR * 9;
      this.life = ctx.pipeline({ code: UTIL + LIFE, layouts: [L], blend: 'add', cull: 'none', constants: { NP, ND, NE, NC, NR: ROCKS.length }, label: 'ao-life' });
    }
    this.nearJelly = 1e9; this.lt = 0;
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    this.t = t;
    // jellies drift out of the whales' way (a slow, damped push away from each whale's spine); twin of aoJel's position
    const jd = this.jd, kd = 1 - Math.exp(-dt / 0.8);
    if (kd > 0) {
      for (let k = 0; k < 3; k++) for (let j = 0; j < 6; j++) { spine(PATHS[k], t, 0.04 + j * 0.184, _sp); _ws[(k * 6 + j) * 3] = _sp[0]; _ws[(k * 6 + j) * 3 + 1] = _sp[1]; _ws[(k * 6 + j) * 3 + 2] = _sp[2]; }
      for (let i = 0; i < this.NJ; i++) {
        const o = i * 16, H = jd[o + 8], ph = t / jd[o + 4] + jd[o + 6], fl = Math.floor(ph), f = ph - fl;
        const st = Math.min(1, Math.max(0, (f - 0.03) / 0.52)), yy = (jd[o + 7] * H + (fl + st * st * (3 - 2 * st)) * 0.3 * jd[o + 3] + t * 0.05) / H;
        const px = jd[o], py = jd[o + 1] + (yy - Math.floor(yy)) * H, pz = jd[o + 2];
        let tx = 0, ty = 0, tz = 0;
        for (let w = 0; w < 18; w++) {
          const R = PATHS[(w / 6) | 0][11] * 0.15 + 4 + jd[o + 3] * 2, dx = px - _ws[w * 3], dy = py - _ws[w * 3 + 1], dz = pz - _ws[w * 3 + 2], d = Math.hypot(dx, dy, dz) + 1e-3;
          if (d < R) { const u = Math.min(1, (R - d) / (R * 0.6)), s = u * u * (3 - 2 * u) * R * 0.8 / d; tx += dx * s; ty += dy * s; tz += dz * s; }
        }
        jd[o + 12] += (tx - jd[o + 12]) * kd; jd[o + 13] += (ty - jd[o + 13]) * kd; jd[o + 14] += (tz - jd[o + 14]) * kd;
      }
      ctx.write(this.jelBuf, jd);
    }
    // star-sprites: at home in the crystal ring; when you come near, the bolder ones drift over and circle ahead of you
    const P = cam.pos, ld = _ld, ks = 1 - Math.exp(-dt / 1.5), M3 = ctx.math;
    const lead = M3.smoothstep(64, 30, Math.hypot(P[0] - RING[0], P[1] - RING[1], P[2] - RING[2]));
    this.lead = lead;
    for (let i = 0; i < NSPR; i++) {
      const o = i * 4, l = lead * (1 - i * 0.14), a = t * 0.21 + i * 1.047, cr = Math.cos(a) * 2.6, cu = Math.sin(a * 1.3) * 1.3 + 0.3, cf = 5 + i * 0.5;
      const hx = RING[0] + 3.5 * Math.cos(t * 0.11 + i * 1.05), hy = RING[1] + 2 * Math.sin(t * 0.17 + i * 2.1), hz = RING[2] + 3.5 * Math.sin(t * 0.13 + i * 1.05);
      for (let c = 0; c < 3; c++) {
        const h = c === 0 ? hx : c === 1 ? hy : hz, tg = P[c] + cam.fwd[c] * cf + cam.right[c] * cr + cam.up[c] * cu;
        ld[o + c] += (h + (tg - h) * l - ld[o + c]) * ks;
      }
      ld[o + 3] = l;
    }
    // plankton clouds wind up into a slow whirl while you move through them, glow when you are near, then settle
    const sp = Math.min(3, Math.hypot(cam.vel[0], cam.vel[1], cam.vel[2])), kw = 1 - Math.exp(-dt / 2.5);
    for (let i = 0; i < 5; i++) {
      const o = (6 + i) * 4, s = (11 + i) * 4, pr = M3.smoothstep(ld[o + 3] * 4, ld[o + 3], Math.hypot(P[0] - ld[o], P[1] - ld[o + 1], P[2] - ld[o + 2]));
      ld[s + 3] += (pr * sp * 0.3 - ld[s + 3]) * kw;
      ld[s] += ld[s + 3] * dt;
      ld[s + 1] += (pr - ld[s + 1]) * kw;
    }
    ctx.write(this.lifeBuf, ld);
    // the deep: a low layer swells as you sink
    if (ctx.audio && this.deep && t - this.lt > 0.5) { this.lt = t; this.deep.set(0.05 * M3.smoothstep(-15, -70, P[1]), 1.5); }
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
    pass.setBindGroup(1, this.pathBG);
    pass.setPipeline(this.ray); this.rayMesh.draw(pass, 1);         // the giant of the deep: a silhouette under everything
    // whales: aura, depth prepass, then one shell of light at equal depth; later things are hidden behind them
    pass.setBindGroup(1, this.whaleBG);
    pass.setPipeline(this.whaleAura); pass.draw(6, 35);
    pass.setPipeline(this.whalePre); this.whaleMesh.draw(pass, 5);
    pass.setPipeline(this.whale); this.whaleMesh.draw(pass, 5);
    pass.setBindGroup(1, this.pathBG);
    pass.setPipeline(this.trail); pass.draw(6, this.NT * 4);
    pass.setPipeline(this.ray); this.rayMesh.draw(pass, this.NRAY, 1);
    pass.setBindGroup(1, this.jelBG);
    pass.setPipeline(this.jhalo); pass.draw(6, this.NJ);
    pass.setPipeline(this.bell); this.bellMesh.draw(pass, this.NJ);
    pass.setPipeline(this.tent); pass.draw(6 * 14 * this.NSEG, this.NJ);
    pass.setPipeline(this.fishDraw); pass.setBindGroup(1, this.fishDrawBG); pass.draw(6, this.NF);
    pass.setPipeline(this.motes); pass.draw(6, this.NM);
    pass.setPipeline(this.life); pass.setBindGroup(1, this.lifeBG); pass.draw(6, this.NL);
    pass.setPipeline(this.glow); pass.setBindGroup(1, this.glowBG); pass.draw(6, this.NG);
  },

  audio(ctx, a) {
    // E lydian, free and weightless: whale-song glides (a recurring 4-note motif with variants), glassy high harmonics, a deep sub swell
    a.setReverb({ seconds: 6.5, damp: 0.45, wet: 0.95, predelay: 0.04 });
    const r = a.rng, LY = a.scale(52, 'lydian', 3); // E3 F#3 G#3 A#3 B3 C#4 D#4 E4 ...
    a.drone({ freq: a.hz(28), partials: [1, 2, 3, 4.02], amps: [1, 0.6, 0.35, 0.1], gain: 0.05, cutoff: 360, detune: 5 });
    a.noiseBed({ color: 'brown', freq: 260, q: 0.5, gain: 0.025, mod: 0.4, modRate: 0.03 });
    // very slow sub swell on the tonic / fifth
    a.every(40, 75, (when) => a.additive({ freq: a.hz(r() < 0.65 ? 28 : 35), partials: [1, 0.35, 0.12], attack: 9, decay: 12, gain: 0.05, when, reverb: 0.5 }), { startDelay: 10 });
    // whale song: the motif E-B-A#-F# (deg 0,4,3,1) glides, with variants
    const MOTIF = [4, 7, 6, 3, 4]; // B3 E4 D#4 A#3 B3 -> overall contour up, fall, rest on the fifth
    const songPath = (mul) => {
      const x = r(), sh = r.int(3) - 1;
      let d = MOTIF.map((k) => k + sh);
      if (x < 0.25) d = d.slice(0, 3);
      else if (x < 0.45) d = d.slice().reverse();
      else if (x < 0.7) d = d.concat([d[d.length - 1] - 2 - r.int(2)]);
      else if (x > 0.88) d = [r.int(6), r.int(6) + 1, r.int(6) + 2, r.int(6)].map((k) => k + 1);
      return d.map((k) => LY[Math.max(0, Math.min(LY.length - 1, k))] + (mul > 1.5 ? 12 : 0));
    };
    const song = (when, k = r.int(3), mul = 1) => {
      const W = frame(PATHS[k], ctx.time, 0.2);
      const sp = a.spatial({ pos: W.p, ref: 40, rolloff: 0.6, reverb: 0.9, gain: 1 });
      const path = songPath(mul);
      a.whaleSong({ path, dur: (6 + path.length * 1.4 + r() * 3) / Math.sqrt(mul), gain: 0.05, bus: sp, when });
    };
    a.every(24, 52, (when) => { song(when); if (r() < 0.4) song(when + 5 + r() * 3); }, { startDelay: 6 });
    // glassy shimmer: two high lydian glass tones, rarely a slowly sounded triad
    a.every(11, 26, (when) => {
      const k = 8 + r.int(6);
      a.glassHarmonica({ midi: LY[k] + 12, dur: 4 + r() * 3, gain: 0.014, pan: r.range(-0.6, 0.6), reverb: 0.9, when });
      if (r() < 0.55) a.glassHarmonica({ midi: LY[k + 2] + 12, dur: 4 + r() * 3, gain: 0.011, pan: r.range(-0.6, 0.6), reverb: 0.9, when: when + 1.5 + r() * 2 });
    }, { startDelay: 12 });
    // the calf answers in a small high voice; the reef ticks and chirps; sprites chime when they come to you
    a.every(30, 70, (when) => song(when, 7, 2.3), { startDelay: 20 });
    const reef = a.spatial({ pos: REEF, ref: 12, rolloff: 1, reverb: 0.7, gain: 1 });
    this.deep = a.drone({ freq: a.hz(28), partials: [1, 2, 3.01], amps: [1, 0.5, 0.2], gain: 0, cutoff: 200, detune: 4 });
    const notes = a.scale(76, 'lydian', 2);
    a.every(3, 9, (when) => {
      if (a.rng() < 0.3) a.chirp({ f0: 700 + a.rng() * 300, f1: 1300 + a.rng() * 500, dur: 0.6, gain: 0.02, bus: reef, when });
      else a.pluck({ freq: a.hz(a.rng.pick(notes) - 12), decay: 1.6, gain: 0.03, bus: reef, when });
    });
    a.every(4, 10, (when) => { if (this.lead > 0.35) a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.007 * this.lead, decay: 2.5, ratio: 4.2, index: 0.8, when, pan: a.rng.range(-0.5, 0.5), reverb: 0.8 }); });
    a.every(1.8, 5.5, (when) => {
      const near = Math.max(0, 1 - this.nearJelly / 45);
      if (near <= 0.02 && a.rng() < 0.8) return;
      a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.006 + 0.016 * near, decay: 4.5, ratio: 2.76, index: 1.2, when, pan: a.rng.range(-0.7, 0.7), reverb: 0.85 });
    });
  },
};
