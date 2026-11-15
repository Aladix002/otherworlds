// Floating mountains above a sea of clouds. See NOTES.md.
import { pcg, u2f } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { merge } from '../../core/src/mesh.js';
import { ss, pillar, island, pine, crane, tuft, flower, stone } from './geo.js';
import { SUN, CLOUD_FLOOR, ISL, HERO, DOOR, SPAWN, LOOPS, NVAR, NFVAR, HERO_TREES, HERO_STONES, topY, yawTo, buildLayout, pillarTrees, heroCover, islandTrees, fragments, falls, makeSdf } from './layout.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';
import RAYS from './rays.wgsl';

const TAU = Math.PI * 2, SMR = 44, SMN = 256, RW = 480, RH = 270;
const I1 = ISL[1];
const pose = (x, y, z, tx, ty, tz, t) => ({ pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t });

function smp(H, u, v) {                                   // bilinear, wrapped sample of the 256^2 height field
  u = (u - Math.floor(u)) * 256 - 0.5; v = (v - Math.floor(v)) * 256 - 0.5;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i0 = i & 255, i1 = (i + 1) & 255, j0 = (j & 255) * 256, j1 = ((j + 1) & 255) * 256;
  return (H[j0 + i0] * (1 - fu) + H[j0 + i1] * fu) * (1 - fv) + (H[j1 + i0] * (1 - fu) + H[j1 + i1] * fu) * fv;
}
// instances binned per frame into LOD ranges of one vertex buffer (frustum + distance culled, allocation-free)
function makeBatch(ctx, meshes, inst, o) {
  const n = inst.length / 8, L = meshes.length;
  return { src: Float32Array.from(inst), n, L, meshes, stage: new Float32Array(Math.max(n, 1) * 8 * L), buf: ctx.buffer(Math.max(n, 1) * 32 * L, 'vertex'), cnt: new Int32Array(L), ...o };
}
function binBatch(b, ctx, cam, tx, ty, kx, ky) {
  const { src, stage, cnt, n, L } = b, ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2], f = cam.fwd, r = cam.right, u = cam.up;
  cnt.fill(0);
  if (b.bs) { const d = Math.hypot(ex - b.bs[0], ey - b.bs[1], ez - b.bs[2]); if (d > b.bs[3]) return; }
  const D = b.d;
  for (let i = 0; i < n; i++) {
    const k = i * 8, s = src[k + 3], h = src[k + 6], rad = s * (h > 1 ? h : 1) * b.rk;
    const dx = src[k] - ex, dy = src[k + 1] + s * h * b.ck - ey, dz = src[k + 2] - ez;
    const z = dx * f[0] + dy * f[1] + dz * f[2];
    if (z < -rad) continue;
    const x = dx * r[0] + dy * r[1] + dz * r[2]; if ((x < 0 ? -x : x) > z * tx + rad * kx) continue;
    const y = dx * u[0] + dy * u[1] + dz * u[2]; if ((y < 0 ? -y : y) > z * ty + rad * ky) continue;
    const q = Math.sqrt(dx * dx + dy * dy + dz * dz) / s;
    let l = 0; while (l < L && q >= D[l]) l++;
    if (l === L) continue;
    const w = (l * n + cnt[l]++) * 8;
    stage[w] = src[k]; stage[w + 1] = src[k + 1]; stage[w + 2] = src[k + 2]; stage[w + 3] = s;
    stage[w + 4] = src[k + 4]; stage[w + 5] = src[k + 5]; stage[w + 6] = h; stage[w + 7] = src[k + 7];
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
  id: 'sky-mountains',
  title: 'Lietajúce hory nad morom oblakov',
  movement: 'fly',
  spawn: { pos: SPAWN, yaw: 0, pitch: -0.02 },
  poses: [
    pose(-70, 176, 150, -30, 96, -160, 20),                                // wide establishing shot
    pose(4, 82, -62, I1.x - 6, I1.y - 16, I1.z, 33),                       // floating island with waterfalls
    pose(-0.5, SPAWN[1] + 3.0, -9.5, -8.6, SPAWN[1] + 2.7, -19.6, 12),    // close pine on the island's ledge
    pose(-25, 75, 3, -38, 10, -42, 41),                                  // looking down into the clouds
    pose(46, 56, -8, 46 + SUN[0] * 100, 56 + SUN[1] * 100 + 6, -8 + SUN[2] * 100, 26),   // sunrise backlight through pillars
    pose(2.4, DOOR[1] + 1.45, 10.2, -0.4, DOOR[1] + 1.15, DOOR[2], 16),        // the door on its ledge
  ],
  flythrough: [
    [0, 72.6, 2, 0, 72, -40], [1, 73, -16, 10, 74, -80], [6, 77, -44, 50, 72, -130], [16, 80, -78, 56, 68, -128], [14, 76, -112, 50, 60, -132],
    [-2, 68, -150, 44, 66, -152], [5, 64, -193, -60, 84, -300], [30, 67, -204, -40, 84, -310], [88, 84, -200, 60, 80, -150], [134, 106, -160, 40, 80, -60],
    [122, 112, -100, 10, 74, -10], [84, 102, -52, 0, 72, 5], [50, 88, -8, 0, 72, 10], [30, 80, 28, 0, 72, 14], [8, 75.5, 36, 0, 72, 15],
    [-9, 73.8, 22, 0, 72.3, 10], [-6, 73, 7, -2, 72.4, -30], [0, 72.6, 2, 0, 72, -40],
  ].map(([x, y, z, tx, ty, tz]) => pose(x, y, z, tx, ty, tz)),
  flythroughDuration: 60,
  doors: [{ pos: DOOR, yaw: Math.PI, to: 'moon-sea' }],
  bounds: { center: [0, 95, -70], radius: 280 },
  env: {
    sunDir: SUN, sunColor: [4.3, 2.15, 0.8], fogColor: [0.62, 0.52, 0.72], fogDensity: 0.0012,
    ambientSky: [0.15, 0.2, 0.5], ambientGround: [0.24, 0.2, 0.34],
  },
  post: { exposure: 1.0, bloom: 0.12, bloomThreshold: 1.0, bloomKnee: 0.7, vignette: 0.24, saturation: 1.24, contrast: 1.15 },
  doorLight: [0.07, 0.06, 0.1],
  clearColor: [0.5, 0.52, 0.8],
  fov: 64,

  // CPU twin of cloudHG (common.wgsl): keeps the camera above the billows
  cloudAt(x, z) {
    const t = this.time, H = this.hf, S = smp;
    return 34 * (S(H, x / 760 + 0.0022 * t, z / 760 + 0.0008 * t) - 0.5) + 13 * (S(H, z / 230 - 0.0035 * t, x / 230 + 0.0055 * t) - 0.5)
      + 50 * (S(H, x / 2900 + 0.37 + 0.0005 * t, z / 2900 + 0.61 + 0.0003 * t) - 0.5);
  },
  heightAt(x, z) { return this.cloudAt(x, z) + CLOUD_FLOOR; },
  sdf(x, y, z) { return this.sdfFn(x, y, z); },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(7331), M = ctx.mesh;
    // ---------- baked noise: r billow (cloud height), g/b its gradient, a detail ----------
    const N = 256, hf = this.hf = new Float32Array(N * N), nd = new Uint8Array(N * N * 4);
    const pv = (x, y, P, s) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const h = (a, b) => u2f(pcg((a % P) + pcg((b % P) + s * 7919)));
      const a = h(ix, iy), b = h(ix + 1, iy);
      return a + (b - a) * ux + (h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * ux - a - (b - a) * ux) * uy;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let r = 0, d = 0, a = 0.5, f = 4;
      for (let o = 0; o < 4; o++) { r += a * Math.abs(2 * pv(i / N * f, j / N * f, f, o) - 1); d += a * pv(i / N * f * 2, j / N * f * 2, f * 2, o + 9); a *= 0.5; f *= 2; }
      hf[j * N + i] = Math.min(Math.max((r / 0.9375 - 0.42) * 1.5 + 0.5, 0), 1);
      nd[(j * N + i) * 4 + 3] = Math.min(Math.max((d / 0.9375 - 0.5) * 1.7 + 0.5, 0), 1) * 255;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, gx = (hf[j * N + (i + 1) % N] - hf[j * N + (i + N - 1) % N]) * N / 2, gy = (hf[((j + 1) % N) * N + i] - hf[((j + N - 1) % N) * N + i]) * N / 2;
      nd[k] = hf[j * N + i] * 255; nd[k + 1] = Math.min(Math.max(0.5 + gx / 50, 0), 1) * 255; nd[k + 2] = Math.min(Math.max(0.5 + gy / 50, 0), 1) * 255;
    }
    const mips = Math.log2(N) + 1, ntex = ctx.texture(N, N, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, { mips });
    for (let m = 0, s = N, src = nd; m < mips; m++) {
      dev.queue.writeTexture({ texture: ntex, mipLevel: m }, src, { bytesPerRow: s * 4 }, [s, s]);
      const h = s >> 1, dst = new Uint8Array(Math.max(h, 1) ** 2 * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < h; i++) for (let c = 0; c < 4; c++) {
        const a = (j * 2 * s + i * 2) * 4 + c; dst[(j * h + i) * 4 + c] = (src[a] + src[a + 4] + src[a + s * 4] + src[a + s * 4 + 4] + 2) >> 2;
      }
      src = dst; s = h;
    }
    await progress(0.1);

    // ---------- layout ----------
    const L = buildLayout(q);
    this.sdfFn = makeSdf(L.col);
    const trees = [[], [], []];
    const pushTrees = (list) => { for (let i = 0; i < list.length; i += 8) trees[R.int(3)].push(...list.slice(i, i + 8)); };
    for (const fl of [0, 1]) (fl ? L.fpil : L.pil).forEach((inst, v) => {
      const out = [];
      for (let k = 0; k < inst.length; k += 8) {
        const d = Math.hypot(inst[k], inst[k + 2] + 60);
        if (d < 1100) pillarTrees(inst, k, v, fl, R, out, (d < 480 ? [9, 13, 16] : [3, 5, 7])[q]);
      }
      pushTrees(out);
    });
    for (const I of ISL) { const out = []; islandTrees(I, R, out); pushTrees(out); }
    for (const [x, z, s, v] of HERO_TREES) trees[v].push(x, topY(HERO, x, z) - 0.2 * s, z, s, x * 1.7 + z, 0.5 + 0.5 * Math.sin(x * 3 + z), 1, 0);
    const stones = [];
    for (const [x, z, s, fl, sink] of HERO_STONES) stones.push(x, topY(HERO, x, z) - sink * s + (fl < 0.3 ? 0.06 : 0), z, s, x * 2.3 + z * 1.1, 0.5, fl, -2);
    const cover = heroCover(q, R), frags = [];
    fragments(R, frags);
    await progress(0.2);

    // ---------- hero island shadow map: long sunrise shadows of trees, door and stones + contact shade ----------
    const sm = new Float32Array(SMN * SMN).fill(1), sl = Math.hypot(SUN[0], SUN[2]), sdx = -SUN[0] / sl, sdz = -SUN[2] / sl, cot = sl / SUN[1];
    const seg = (ax, az, bx, bz, r0, r1, soft, dark) => {
      const t2 = (v) => Math.floor((v + SMR) / (2 * SMR) * SMN), m = Math.max(r0, r1) + soft;
      const i0 = Math.max(0, t2(Math.min(ax, bx) - m)), i1 = Math.min(SMN - 1, t2(Math.max(ax, bx) + m)), j0 = Math.max(0, t2(Math.min(az, bz) - m)), j1 = Math.min(SMN - 1, t2(Math.max(az, bz) + m));
      const vx = bx - ax, vz = bz - az, vv = vx * vx + vz * vz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / SMN * 2 * SMR - SMR, z = (j + 0.5) / SMN * 2 * SMR - SMR, h = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / vv));
        const d = Math.hypot(x - ax - vx * h, z - az - vz * h) - (r0 + (r1 - r0) * h), sf = soft * (0.35 + 0.65 * h);
        sm[j * SMN + i] *= 1 - dark * (1 - ss(-sf, sf, d));
      }
    };
    for (const [x, z, s] of HERO_TREES) {
      const H = 5.6 * s * cot;
      seg(x, z, x + sdx * H * 0.6, z + sdz * H * 0.6, 0.3 * s, 0.2 * s, 0.5, 0.6);
      seg(x + sdx * H * 0.5, z + sdz * H * 0.5, x + sdx * H * 1.08, z + sdz * H * 1.08, 1.5 * s, 2.3 * s, 2.2, 0.62);
      seg(x, z, x, z, 0.4 * s, 0.4 * s, 0.9, 0.45);
    }
    seg(DOOR[0], DOOR[2], DOOR[0] + sdx * 2.3 * cot, DOOR[2] + sdz * 2.3 * cot, 0.62, 0.7, 0.5, 0.66);
    seg(DOOR[0] - 0.62, DOOR[2], DOOR[0] + 0.62, DOOR[2], 0.2, 0.2, 0.55, 0.6);
    for (const [x, z, s, fl] of HERO_STONES) { seg(x, z, x + sdx * s * fl * cot * 0.6, z + sdz * s * fl * cot * 0.6, s * 0.85, s * 0.6, 0.5, 0.5); seg(x, z, x, z, s * 0.9, s * 0.9, 0.35, 0.4); }
    const sm8 = new Uint8Array(SMN * SMN); for (let i = 0; i < sm.length; i++) sm8[i] = sm[i] * 255;
    const stex = ctx.texture(SMN, SMN, 'r8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: stex }, sm8, { bytesPerRow: SMN }, [SMN, SMN]);
    const cL = ctx.layout(['texture', 'sampler', 'texture']);
    this.cBG = ctx.bindGroup(cL, [ntex.createView(), ctx.samplers.repeat, stex.createView()]);
    await progress(0.3);

    // ---------- meshes and batches ----------
    const up = (g) => M.upload(g);
    const lods = (f, n = 3) => [...Array(n).keys()].map((l) => up(f(l)));
    const PD = [[32, 64], [16, 30], [8, 11]];
    this.batches = [];
    const add = (meshes, inst, o) => { const b = makeBatch(ctx, meshes, inst, o); this.batches.push(b); return b; };
    this.rockB = []; this.vegB = [];
    for (const fl of [0, 1]) for (let v = 0; v < (fl ? NFVAR : NVAR); v++) {
      const inst = (fl ? L.fpil : L.pil)[v];
      if (inst.length) this.rockB.push(add(lods((l) => pillar(v + (fl ? 21 : 1), fl, PD[l][0], PD[l][1])), inst, { d: [15, 48, 1e9], ck: 0.45, rk: 0.66 }));
      await progress(0.3 + 0.03 * v + 0.2 * fl);
    }
    const isl = ISL.map((I, i) => {
      const g = island(I, i ? 72 : 128, i ? 44 : 72, I.vines);
      for (let k = 0; k < g.pos.length; k += 3) { g.pos[k] += I.x; g.pos[k + 1] += I.y; g.pos[k + 2] += I.z; }
      return g;
    });
    this.rockB.push(add([up(merge(isl))], [0, 0, 0, 1, 0, 0.5, 1, -1], { d: [1e9], ck: 0, rk: 1e6 }));
    this.rockB.push(add([up(stone(3, 3)), up(stone(3, 2))], stones, { d: [30, 260], ck: 0, rk: 1.4, bs: [0, 70, 0, 300] }));
    const half = (frags.length / 16 | 0) * 8;
    this.rockB.push(add([up(stone(5, 3)), up(stone(5, 2))], frags.slice(0, half), { d: [60, 700], ck: 0, rk: 2.2 }));
    this.rockB.push(add([up(stone(8, 3)), up(stone(8, 2))], frags.slice(half), { d: [60, 700], ck: 0, rk: 2.2 }));
    await progress(0.62);
    for (let v = 0; v < 3; v++) { this.vegB.push(add(lods((l) => pine(v + 1, l), 4), trees[v], { d: [22, 75, 210, 560], ck: 3, rk: 5.5 })); await progress(0.65 + v * 0.04); }
    this.vegB.push(add([up(tuft(11, 11)), up(tuft(12, 5))], cover.tufts, { d: [22, 48], ck: 0.2, rk: 0.8, bs: [0, 70, 0, 100] }));
    this.vegB.push(add([up(flower(4))], cover.flowers, { d: [48], ck: 0.2, rk: 0.8, bs: [0, 70, 0, 100] }));
    // cloud grid: polar, rings grow geometrically
    const NA = 128, NR = 84, cv = new Float32Array((NA * NR + 1) * 2), ci = new Uint32Array(NA * 3 + (NR - 1) * NA * 6);
    let n = 0;
    for (let k = 0; k < NR; k++) for (let a = 0; a < NA; a++) { const r = 6 * Math.pow(1.09, k), th = (a + (k & 1) * 0.5) / NA * TAU; cv[(1 + k * NA + a) * 2] = Math.cos(th) * r; cv[(1 + k * NA + a) * 2 + 1] = Math.sin(th) * r; }
    for (let a = 0; a < NA; a++) { ci[n++] = 0; ci[n++] = 1 + (a + 1) % NA; ci[n++] = 1 + a; }
    for (let k = 0; k < NR - 1; k++) for (let a = 0; a < NA; a++) {
      const p = 1 + k * NA + a, p1 = 1 + k * NA + (a + 1) % NA, c = p + NA, c1 = p1 + NA;
      ci[n++] = p; ci[n++] = p1; ci[n++] = c; ci[n++] = p1; ci[n++] = c1; ci[n++] = c;
    }
    this.cloudV = ctx.buffer(cv, 'vertex'); this.cloudI = ctx.buffer(ci, 'index'); this.cloudN = ci.length;
    this.shellN = NA * 3 + 60 * NA * 6; this.shells = [2, 4, 6][q];
    // birds
    const bi = [];
    for (const [cx, cy, cz, rad, cnt, size] of LOOPS) for (let i = 0; i < cnt; i++) {
      const row = (i + 1) >> 1, sd = i & 1 ? 1 : -1;
      bi.push(cx, cy, cz, rad, cx * 0.01 + 1, sd * row * 1.9 + (R() - 0.5) * 0.5, row * 1.7 + (R() - 0.5) * 0.6 + 0.001, size);
    }
    this.birdM = up(crane()); this.birdI = ctx.buffer(Float32Array.from(bi), 'vertex'); this.nBird = bi.length / 8;
    // waterfalls (water + mist plume per fall)
    const fi = [], pi = [];
    this.fallList = falls();
    for (const f of this.fallList) {
      const tx = -Math.sin(f[6]), tz = Math.cos(f[6]);
      for (let k = -1; k <= 1; k++) { const o = k * f[4] * 0.55 + (R() - 0.5) * 0.2; fi.push(f[0] + tx * o, f[1], f[2] + tz * o, f[3] * (0.8 + 0.3 * R()), f[4] * (0.2 + 0.14 * R()), f[5] + k * 0.13, f[6], 0); }
      for (let k = 0; k < 5; k++) pi.push(f[0], f[1], f[2], f[3], f[4], f[5], f[6], k);
    }
    this.fallI = ctx.buffer(Float32Array.from(fi), 'vertex'); this.nFall = fi.length / 8;
    this.puffI = ctx.buffer(Float32Array.from(pi), 'vertex'); this.nPuff = pi.length / 8;
    this.nMote = [160, 320, 520][q];
    await progress(0.8);

    // ---------- pipelines ----------
    const IL = M.instanceLayout(['float32x4', 'float32x4'], 3), sc = COMMON + SCENE, mod = ctx.shader(sc, 'scene'), fx = ctx.shader(COMMON + FX, 'fx'), rays = ctx.shader(RAYS, 'rays');
    const P = (d) => ctx.pipelineAsync({ layouts: [cL], ...d });
    this.dL = ctx.layout(['texture-depth']); this.rL = ctx.layout(['texture', 'sampler']);
    const CB = [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }];
    [this.pVeil, this.pPuff, this.pRock, this.pVeg, this.pBird, this.pCloud, this.pShell, this.pSky, this.pFall, this.pMote, this.pRay, this.pRayMix] = await Promise.all([
      P({ module: mod, vs: 'vsCloud', fs: 'fsVeil', buffers: CB, cull: 'none', blend: 'premul', label: 'veil' }),
      P({ module: fx, vs: 'vsPuff', fs: 'fsPuff', buffers: [IL], cull: 'none', blend: 'premul', label: 'puff' }),
      P({ module: mod, fs: 'fsRock', buffers: [M.layout, IL], label: 'rock' }),
      P({ module: mod, fs: 'fsVeg', buffers: [M.layout, IL], cull: 'none', label: 'veg' }),
      P({ module: mod, vs: 'vsBird', fs: 'fsBird', buffers: [M.layout, IL], cull: 'none', label: 'bird' }),
      P({ module: mod, vs: 'vsCloud', fs: 'fsCloud', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }], cull: 'none', label: 'cloud' }),
      P({ module: mod, vs: 'vsCloud', fs: 'fsShell', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }], cull: 'none', blend: 'premul', label: 'shell' }),
      P({ module: mod, vs: 'vsSky', fs: 'fsSky', depthWrite: false, label: 'sky' }),
      P({ module: fx, vs: 'vsFall', fs: 'fsFall', buffers: [IL], cull: 'none', blend: 'premul', label: 'fall' }),
      P({ module: fx, vs: 'vsMote', fs: 'fsMote', cull: 'none', blend: 'add', label: 'mote' }),
      ctx.pipelineAsync({ module: rays, vs: 'vsRay', fs: 'fsRay', layouts: [this.dL], format: 'r8unorm', depthFormat: null, label: 'ray' }),
      ctx.pipelineAsync({ module: rays, vs: 'vsRay', fs: 'fsRayMix', layouts: [this.dL, this.rL], blend: 'add', depthFormat: null, label: 'raymix' }),
    ]);
    const rt = ctx.texture(RW, RH, 'r8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT);
    this.rBG = ctx.bindGroup(this.rL, [rt.createView(), ctx.samplers.linear]);
    this.passR = { colorAttachments: [{ view: rt.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
    this.resize(ctx);
    await progress(1);
  },
  resize(ctx) {
    if (!ctx.depthView) return;
    this.dv = ctx.depthView;
    this.dBG = ctx.bindGroup(this.dL, [ctx.depthView]);
    this.passM = { colorAttachments: [{ view: ctx.hdrView, loadOp: 'load', storeOp: 'store' }] };
  },

  time: 0,
  update(ctx, dt, t, cam) {
    this.time = t;
    const ty = Math.tan(cam.fov / 2), tx = ty * ctx.width / ctx.height, kx = Math.sqrt(1 + tx * tx), ky = Math.sqrt(1 + ty * ty), B = this.batches;
    for (let i = 0; i < B.length; i++) binBatch(B[i], ctx, cam, tx, ty, kx, ky);
    const s = cam.fwd[0] * SUN[0] + cam.fwd[1] * SUN[1] + cam.fwd[2] * SUN[2];
    this.rayK = ctx.env.params[0] = ss(0.0, 0.5, s);
    const A = this.aud;
    if (A && (ctx.frame & 15) === 0) {
      const h = ss(40, 190, cam.eye[1]);
      A.wind.set(0.035 + 0.035 * h + 0.02 * Math.min(cam.moving, 1.5), 1.5);
    }
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    pass.setPipeline(this.pRock);
    for (let i = 0; i < this.rockB.length; i++) drawBatch(this.rockB[i], pass);
    pass.setPipeline(this.pVeg);
    for (let i = 0; i < this.vegB.length; i++) drawBatch(this.vegB[i], pass);
    pass.setPipeline(this.pBird);
    pass.setVertexBuffer(0, this.birdM.vertexBuffer); pass.setVertexBuffer(1, this.birdI); pass.setIndexBuffer(this.birdM.indexBuffer, this.birdM.indexFormat);
    pass.drawIndexed(this.birdM.indexCount, this.nBird);
    pass.setPipeline(this.pCloud);
    pass.setVertexBuffer(0, this.cloudV); pass.setIndexBuffer(this.cloudI, 'uint32'); pass.drawIndexed(this.cloudN, 1);
    pass.setPipeline(this.pSky); pass.draw(3);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    pass.setPipeline(this.pShell);
    pass.setVertexBuffer(0, this.cloudV); pass.setIndexBuffer(this.cloudI, 'uint32'); pass.drawIndexed(this.shellN, this.shells, 0, 0, 1);
    pass.setPipeline(this.pVeil); pass.drawIndexed(this.shellN, 1, 0, 0, 20);
    pass.setPipeline(this.pPuff); pass.setVertexBuffer(0, this.puffI); pass.draw(6, this.nPuff);
    pass.setPipeline(this.pFall); pass.setVertexBuffer(0, this.fallI); pass.draw(168, this.nFall);
    pass.setPipeline(this.pMote); pass.draw(6, this.nMote);
  },
  afterScene(ctx, enc) {
    if (this.rayK < 0.01) return;
    if (this.dv !== ctx.depthView) this.resize(ctx);
    let p = enc.beginRenderPass(this.passR);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.dBG); p.setPipeline(this.pRay); p.draw(3); p.end();
    p = enc.beginRenderPass(this.passM);
    p.setViewport(0, 0, ctx.renderWidth, ctx.renderHeight, 0, 1); p.setScissorRect(0, 0, ctx.renderWidth, ctx.renderHeight);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.dBG); p.setBindGroup(2, this.rBG); p.setPipeline(this.pRayMix); p.draw(3); p.end();
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 5, damp: 0.5, wet: 0.85 });
    const wind = a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 420, q: 0.7, gain: 0.05, mod: 0.6, modRate: 0.05, gainMod: 0.5 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 160, gain: 0.05, mod: 0.3, modRate: 0.03 });
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 2600, q: 1.2, gain: 0.006, mod: 0.5, modRate: 0.09, gainMod: 0.8 });   // high airy gusts
    a.drone({ freq: a.hz(41), partials: [1, 2, 3.01], gain: 0.02, cutoff: 500 });
    a.pad({ chords: [[69, 76, 81, 85], [66, 73, 78, 81], [71, 78, 83, 86], [64, 71, 76, 80]], gain: 0.016, attack: 7, change: [18, 32], cutoff: 2400, reverb: 0.8 });
    for (const i of [0, 1, 2]) {                                                        // nearest waterfalls, spatialised
      const f = this.fallList[i], s = a.spatial({ pos: [f[0], f[1] - 8, f[2]], ref: 14, rolloff: 1.1, reverb: 0.4, gain: 1 });
      a.noiseBed({ color: 'white', filter: 'bandpass', freq: 1300 + i * 250, q: 0.5, gain: 0.07, mod: 0.15, modRate: 0.2, bus: s });
    }
    a.every(16, 44, (when) => {                                                          // distant crane calls, two or three soft notes
      const f = 520 + a.rng() * 160, pan = a.rng.range(-0.8, 0.8), n = 2 + a.rng.int(2);
      for (let i = 0; i < n; i++) a.chirp({ f0: f * (1 + 0.06 * i), f1: f * 1.32, dur: 0.22, vib: 14, vibRate: 28, gain: 0.011, when: when + i * 0.42, pan, reverb: 0.9 });
    }, { startDelay: 9 });
    const notes = a.scale(81, 'pentatonic', 2);
    a.every(11, 30, (when) => a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.008, decay: 6, when, pan: a.rng.range(-0.6, 0.6), reverb: 0.9 }), { startDelay: 5 });
    this.aud = { wind };
  },
};
