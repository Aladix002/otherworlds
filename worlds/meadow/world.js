// Čarovná lúka: a magical flower meadow with wisteria tunnels and a misty river. See NOTES.md.
import { pcg, u2f, hash2i } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { ss, MS, MN, ZS, HW, SUN, DOOR, RING, BIGTREE, WARREN, FLOCK, TUN, BRIDGES, FIELDS, yawTo, riverZ, riverT, hAt, bridgeAt, deckY, buildMap } from './layout.js';
import { flower, clump, tuft, pack, tree, raceme, leafBlob, woodwork, rabbit, swing, hive } from './geo.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';

const CAP = 8000, NB = 26;                                  // flora bins: 16 near (species x 2 lods), 8 clumps, 2 grass
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pose = (x, z, up, tx, ty, tz, t) => { const y = hAt(x, z) + up; return { pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t }; };
const SP = [0, hAt(0, 20) + 1.6, 20], T2 = TUN[70], T3 = TUN[120];

// float32 -> float16 bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function half(v) { f32[0] = v; const x = u32[0], e = (x >> 23) & 255, s = (x >> 16) & 0x8000; return e < 113 ? s : e > 142 ? s | 0x7c00 : s | ((e - 112) << 10) | ((x >> 13) & 1023); }

// static instances binned per frame into LOD ranges (frustum + distance culled, allocation-free)
function makeBatch(ctx, meshes, inst, d, ck, rk) {
  const n = inst.length / 8, L = meshes.length;
  return { src: Float32Array.from(inst), n, L, meshes, d, ck, rk, stage: new Float32Array(Math.max(n, 1) * 8 * L), buf: ctx.buffer(Math.max(n, 1) * 32 * L, 'vertex'), cnt: new Int32Array(L) };
}
function binBatch(b, ctx, cam, tx, ty, kx, ky) {
  const { src, stage, cnt, n, L, d: D } = b, ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2], f = cam.fwd, r = cam.right, u = cam.up;
  cnt.fill(0);
  for (let i = 0; i < n; i++) {
    const k = i * 8, s = src[k + 3], rad = s * b.rk;
    const dx = src[k] - ex, dy = src[k + 1] + s * b.ck - ey, dz = src[k + 2] - ez;
    const z = dx * f[0] + dy * f[1] + dz * f[2];
    if (z < -rad) continue;
    const x = dx * r[0] + dy * r[1] + dz * r[2]; if ((x < 0 ? -x : x) > z * tx + rad * kx) continue;
    const y = dx * u[0] + dy * u[1] + dz * u[2]; if ((y < 0 ? -y : y) > z * ty + rad * ky) continue;
    const q = Math.sqrt(dx * dx + dy * dy + dz * dz) / s;
    let l = 0; while (l < L && q >= D[l]) l++;
    if (l === L) continue;
    const w = (l * n + cnt[l]++) * 8;
    for (let c = 0; c < 8; c++) stage[w + c] = src[k + c];
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
  id: 'meadow',
  title: 'Enchanted Meadow',
  movement: 'walk',
  spawn: { pos: SP, yaw: 0, pitch: -0.04 },
  poses: [
    pose(-1, 27, 3.4, -9, 1, -40, 14),                                     // wide meadow, colour fields, river
    pose(6, 13, 1.45, 2, hAt(2, 8) + 0.5, 8, 22),                         // flowers blooming around the camera
    pose(T2[0], T2[1], 1.6, T3[0], hAt(T3[0], T3[1]) + 1.7, T3[1], 31),     // inside the wisteria tunnel
    pose(-3.5, -27, 1.45, 12, 0.6, -39, 18),                                // misty river, bridge, golden trees
    pose(-22.6, 7.5, 0.9, -22.6 + SUN[0] * 100, hAt(-22.6, 7.5) + 0.9 + SUN[1] * 100 - 2, 7.5 + SUN[2] * 100, 26),   // low across the lavender into the sun
    pose(-5.4, 40.2, 1.6, DOOR[0], hAt(DOOR[0], DOOR[1]) + 1.15, DOOR[1], 12),   // the door
  ],
  flythrough: [
    [0, 20, 1.7, 0, -20], [2, 8, 1.7, 14, -5], [9, 0, 1.7, 15, -5], [15, -5, 1.7, 24, -10], [24, -10, 1.7, 34, -12], [34, -12, 1.7, 44, -17], [44, -17, 1.7, 52, -24],
    [52, -24, 1.7, 58, -32], [58.5, -31, 1.8, 60, -40], [60, -39.6, 4.2, 30, -42], [59, -52, 2.2, 30, -62], [44, -63, 2, 10, -50], [18, -62, 2.2, 8, -44],
    [8.3, -46, 2.2, 9, -37], [9, -37.3, 4.2, 9.6, -30], [9.5, -27, 2, 0, -5], [3, -15, 2.2, -30, -10], [-20, -4, 2.2, -30, -12], [-22, 12, 2, -15, 35], [-12, 27, 2.2, -8, 44], [-8, 36, 1.8, -7, 46],
    [-3.5, 40, 1.7, -7, 46], [-1, 30, 1.7, 0, 0], [0, 20, 1.7, 0, -20],
  ].map(([x, z, up, tx, tz]) => pose(x, z, up, tx, hAt(tx, tz) + 1.2, tz)),
  flythroughDuration: 60,
  doors: [{ pos: [DOOR[0], null, DOOR[1]], yaw: Math.PI, to: 'dream-desert' }],
  bounds: { center: [8, 3, -8], radius: 74 },
  env: {
    sunDir: SUN, sunColor: [3.0, 1.75, 0.8], fogColor: [0.8, 0.68, 0.7], fogDensity: 0.004,
    ambientSky: [0.36, 0.36, 0.66], ambientGround: [0.25, 0.2, 0.14],
  },
  post: { exposure: 0.92, bloom: 0.12, bloomThreshold: 1.0, bloomKnee: 0.7, vignette: 0.24, saturation: 1.08, contrast: 1.04, tonemap: 'aces' },
  clearColor: [0.6, 0.65, 0.9],
  doorLight: [0.14, 0.11, 0.12],
  fov: 62,

  heightAt(x, z) {
    const g = Math.abs(x) < MS - 1 && Math.abs(z) < MS - 1 ? this.hb(x, z) : hAt(x, z), b = bridgeAt(x, z);
    return b > g ? b : g;
  },
  sdf(x, y, z) {
    const T = this.trunks; let d = 1e9;
    for (let i = 0; i < T.length; i += 3) { const dx = x - T[i], dz = z - T[i + 1], q = Math.sqrt(dx * dx + dz * dz) - T[i + 2]; if (q < d) d = q; }
    return d;
  },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(977), M = ctx.mesh, TB = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    // ---------- tileable noise: r, g fbm at two scales, b round speckles, a fine fbm ----------
    const N = 256, nd = new Uint8Array(N * N * 4);
    const pv = (x, y, P, s) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const h = (a, b) => u2f(pcg((a % P) + pcg((b % P) + s * 7919)));
      const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1);
      return a + (b - a) * ux + (c + (h(ix + 1, iy + 1) - c) * ux - a - (b - a) * ux) * uy;
    };
    const fb = (i, j, f, s) => { let r = 0, a = 0.5; for (let o = 0; o < 4; o++) { r += a * pv(i / N * f, j / N * f, f, s + o); a *= 0.5; f *= 2; } return sat((r / 0.9375 - 0.5) * 1.9 + 0.5) * 255; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, C = 20, cx = i / N * C, cy = j / N * C; let d = 9;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const gx = Math.floor(cx) + a, gy = Math.floor(cy) + b, h = pcg(((gx + C) % C) + pcg(((gy + C) % C) + 77));
        d = Math.min(d, Math.hypot(gx + 0.2 + 0.6 * (h & 255) / 255 - cx, gy + 0.2 + 0.6 * ((h >> 8) & 255) / 255 - cy) / (0.3 + 0.25 * ((h >> 16) & 255) / 255));
      }
      nd[k] = fb(i, j, 4, 1); nd[k + 1] = fb(i, j, 8, 11); nd[k + 2] = sat(1.25 - d) * 255; nd[k + 3] = fb(i, j, 32, 31);
    }
    const mips = 9, ntex = ctx.texture(N, N, 'rgba8unorm', TB, { mips });
    for (let m = 0, s = N, src = nd; m < mips; m++) {
      dev.queue.writeTexture({ texture: ntex, mipLevel: m }, src, { bytesPerRow: s * 4 }, [s, s]);
      const h = s >> 1, dst = new Uint8Array(Math.max(h, 1) ** 2 * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < h; i++) for (let c = 0; c < 4; c++) { const a = (j * 2 * s + i * 2) * 4 + c; dst[(j * h + i) * 4 + c] = (src[a] + src[a + 4] + src[a + s * 4] + src[a + s * 4 + 4] + 2) >> 2; }
      src = dst; s = h;
    }
    await progress(0.02);

    // ---------- baked maps ----------
    const map = await buildMap(progress);
    this.hb = map.hb; this.DEN = map.DEN; this.GR = map.GR; this.ZID = map.ZID;
    const a16 = new Uint16Array(MN * MN * 4); for (let i = 0; i < a16.length; i++) a16[i] = half(map.A[i]);
    const ta = ctx.texture(MN, MN, 'rgba16float', TB), tb = ctx.texture(MN, MN, 'rgba8unorm', TB);
    dev.queue.writeTexture({ texture: ta }, a16, { bytesPerRow: MN * 8 }, [MN, MN]);
    dev.queue.writeTexture({ texture: tb }, map.B, { bytesPerRow: MN * 4 }, [MN, MN]);
    const cL = ctx.layout(['texture', 'sampler', 'texture', 'texture', 'sampler']);
    this.cBG = ctx.bindGroup(cL, [ntex.createView(), ctx.samplers.repeat, ta.createView(), tb.createView(), ctx.samplers.linear]);
    await progress(0.34);

    // ---------- terrain: tensor grid, fine in the map, stretched to the far hills ----------
    const xs = []; for (let i = -100; i <= 100; i++) xs.push(i * 1.3);
    for (let v = 130, st = 1.3; v < 1700;) { st *= 1.28; v += st; xs.push(v); xs.unshift(-v); }
    const n = xs.length, tg = { pos: new Float32Array(n * n * 3), nrm: new Float32Array(n * n * 3), uv: new Float32Array(n * n * 2), idx: new Uint32Array((n - 1) * (n - 1) * 6) };
    for (let j = 0, v = 0, k = 0; j < n; j++) {
      for (let i = 0; i < n; i++, v++) {
        tg.pos[v * 3] = xs[i]; tg.pos[v * 3 + 1] = hAt(xs[i], xs[j] - 10); tg.pos[v * 3 + 2] = xs[j] - 10;
        if (i < n - 1 && j < n - 1) { tg.idx[k++] = v; tg.idx[k++] = v + n; tg.idx[k++] = v + 1; tg.idx[k++] = v + 1; tg.idx[k++] = v + n; tg.idx[k++] = v + n + 1; }
      }
      if (j % 60 === 0) await progress(0.34 + 0.2 * j / n);
    }
    this.ter = M.upload(M.computeNormals(tg));
    // river surface: (x, lateral -1..1, z)
    const wv = [];
    for (let x = -900; x <= 900; x += 3) { const z = riverZ(x), e = (riverZ(x + 0.5) - riverZ(x - 0.5)), l = Math.hypot(1, e), w = HW + 1.4; wv.push(x + e / l * w, -1, z - w / l, x - e / l * w, 1, z + w / l); }
    this.waterV = ctx.buffer(Float32Array.from(wv), 'vertex'); this.waterN = wv.length / 3;
    await progress(0.56);

    // ---------- flora meshes: bin order = [species x (near, mid)], clumps, grass ----------
    const fl = [];
    for (let sp = 0; sp < 8; sp++) fl.push(flower(sp, 0, 3), flower(sp, 1, 3));
    for (let sp = 0; sp < 8; sp++) fl.push(clump(sp, 5));
    fl.push(tuft(0, 1), tuft(1, 2));
    const pk = pack(fl);
    this.flo = {
      vb: ctx.buffer(pk.v, 'vertex'), ib: ctx.buffer(pk.idx, 'index'), info: pk.info, cnt: new Int32Array(NB), stage: new Float32Array(NB * CAP * 4), buf: ctx.buffer(NB * CAP * 16, 'vertex'),
      cell: [0.34, 1.02, 0.21], rad: [17, [50, 75, 95][q], [9, 12, 14][q]],
    };
    await progress(0.62);

    // ---------- trees ----------
    const up = (g) => M.upload(g);
    this.batches = []; this.trunks = [];
    const tin = [[], [], []], li = [];
    for (const [x, z, s, v] of map.trees) {
      const y = hAt(x, z);
      tin[v].push(x, y - 0.1, z, s, R() * 6.283, R(), 1, 0);
      if (Math.abs(x) < 120 && Math.abs(z) < 120) {
        this.trunks.push(x, z, 0.42 * s);
        for (let k = 0; k < 3; k++) { const a = R() * 6.283, r = 2.4 * s * Math.sqrt(R()); li.push(x + Math.cos(a) * r, y + (3.4 + 2.6 * R()) * s, z + Math.sin(a) * r, R() * 0.999); }
      }
    }
    for (let v = 0; v < 3; v++) { this.batches.push(makeBatch(ctx, [0, 1, 2].map((l) => up(tree(v + 1, l))), tin[v], [[18, 22, 30][q], 62, 1e9], 4, 5.5)); await progress(0.64 + v * 0.05); }
    // ---------- wisteria tunnel ----------
    const rin = [[], []], bin = [];
    for (let i = 0; i < TUN.length; i++) {
      const p = TUN[i], a0 = TUN[Math.max(i - 1, 0)], a1 = TUN[Math.min(i + 1, TUN.length - 1)], l = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), nx = -(a1[1] - a0[1]) / l, nz = (a1[0] - a0[0]) / l, y = hAt(p[0], p[1]);
      for (let k = 0; k < [6, 8, 10][q]; k++) {
        const a = R.range(-1.42, 1.42), lat = 1.66 * Math.sin(a), ay = 3.28 * Math.cos(a), len = Math.min(R.range(0.5, 1.3), ay - (Math.abs(lat) < 1.15 ? 2.02 : 0.3)), o = R.range(-0.12, 0.12);
        if (len > 0.3) rin[R.int(2)].push(p[0] + nx * lat - nz * o, y + ay, p[1] + nz * lat + nx * o, len, R() * 6.283, R(), 1, sat(i / TUN.length * 2.6 - 0.6 + R.range(-0.25, 0.25)) + sat(i / TUN.length * 2.6 - 1.5 + R.range(-0.25, 0.25)));
        if (k < 3) li.push(p[0] + nx * lat * 0.8, y + ay - 0.3, p[1] + nz * lat * 0.8, 1 + R() * 0.999);
      }
      if (i % 3 === 0) for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.44 + R.range(-0.2, 0.2), s = R.range(0.5, 0.78); if (Math.abs(a) < 0.7 || R() < 0.7) bin.push(p[0] + nx * 2.2 * Math.sin(a), y + 3.85 * Math.cos(a) + 0.1, p[1] + nz * 2.2 * Math.sin(a), s, R() * 6.283, R(), 0.8, R() < (Math.abs(a) < 0.7 ? 0.35 : 0.65) ? sat(i / TUN.length * 2.6 - 0.6) + sat(i / TUN.length * 2.6 - 1.5) : -1); }
    }
    for (let v = 0; v < 2; v++) this.batches.push(makeBatch(ctx, [up(raceme(0, v)), up(raceme(1, v))], rin[v], [[14, 18, 24][q], 170], -0.5, 1.2));
    this.batches.push(makeBatch(ctx, [up(leafBlob(4, 0)), up(leafBlob(4, 1)), up(leafBlob(4, 2))], bin, [22, 70, 500], 0, 1.6));
    this.wood = up(woodwork(TUN, BRIDGES, hAt, deckY));
    // ---------- discoveries: rabbits, a swing and a beehive on the big tree ----------
    const rb = [], bx = BIGTREE[0], bz = BIGTREE[1], by = hAt(bx, bz);
    WARREN.forEach((p, j) => { for (let i = 0; i < 4 - j; i++) { const a = i * 1.7 + j, r = 0.4 + 0.4 * i, x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r; rb.push(x, hAt(x, z) - 0.02, z, i ? 0.7 + 0.1 * i : 1.15, R() * 6.283, R(), 1, 1); } });
    this.batches.push(makeBatch(ctx, [up(rabbit())], rb, [90], 0.2, 0.5));
    this.batches.push(makeBatch(ctx, [up(swing(5.4))], [bx + 2.6, by + 6.2, bz - 1.6, 1, 0.9, 0, 1, 0], [300], -3, 3.5));
    this.batches.push(makeBatch(ctx, [up(hive())], [bx - 2.4, by + 3.7, bz + 1.2, 1, 0, 0, 1, 0], [200], 0, 1));
    this.one = ctx.buffer(Float32Array.from([0, 0, 0, 1, 0, 0.5, 1, 0]), 'vertex');
    // ---------- small life ----------
    for (let i = 0; i < 16; i++) { const a = R() * 6.283, r = 1 + R() * 5, c = i < 9 ? [BIGTREE[0] - 2.4, BIGTREE[1] + 1.2] : RING; li.push(c[0] + Math.cos(a) * r, 0, c[1] + Math.sin(a) * r, 2 + R() * 0.999); }
    this.leafI = ctx.buffer(Float32Array.from(li), 'vertex'); this.nLeaf = li.length / 4;
    const bf = []; for (let i = 0; i < 26; i++) { const a = R() * 6.283, r = 6 + R() * 50; bf.push(4 + Math.cos(a) * r, 0, 2 + Math.sin(a) * r, R() * 0.999); }
    for (let i = 0; i < 14; i++) { const x = R.range(-50, 90); bf.push(x, 0, riverZ(x) + R.range(-2, 2), 1 + R() * 0.999); }      // dragonflies
    for (let i = 0; i < 14; i++) { const a = R() * 6.283, r = Math.sqrt(R()) * 3.2; bf.push(FLOCK[0] + Math.cos(a) * r, 0, FLOCK[1] + Math.sin(a) * r, 2 + R() * 0.999); }   // birds
    for (let i = 0; i < 9; i++) bf.push(-6, 0, -8, 3 + R() * 0.999);
    this.flyI = ctx.buffer(Float32Array.from(bf), 'vertex'); this.nFly = bf.length / 4;
    this.nSeed = [140, 260, 420][q];
    await progress(0.82);

    // ---------- pipelines ----------
    const IL = M.instanceLayout(['float32x4', 'float32x4'], 3), I4 = M.instanceLayout(['float32x4'], 3), mod = ctx.shader(COMMON + SCENE, 'scene'), fx = ctx.shader(COMMON + FX, 'fx');
    const FL = [{ arrayStride: 44, attributes: [0, 12, 24].map((offset, i) => ({ shaderLocation: i, offset, format: 'float32x3' })).concat({ shaderLocation: 3, offset: 36, format: 'float32x2' }) }, M.instanceLayout(['float32x4'], 4)];
    const P = (d) => ctx.pipelineAsync({ layouts: [cL], ...d });
    [this.pSky, this.pTer, this.pFlora, this.pObj, this.pWater, this.pSeed, this.pLeaf, this.pFly, this.pMist] = await Promise.all([
      P({ module: mod, vs: 'vsSky', fs: 'fsSky', depthWrite: false, label: 'sky' }),
      P({ module: mod, vs: 'vsTer', fs: 'fsTer', buffers: [M.layout], label: 'terrain' }),
      P({ module: mod, vs: 'vsFlora', fs: 'fsFlora', buffers: FL, cull: 'none', label: 'flora' }),
      P({ module: mod, vs: 'vsObj', fs: 'fsObj', buffers: [M.layout, IL], cull: 'none', label: 'obj' }),
      P({ module: mod, vs: 'vsWater', fs: 'fsWater', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }], cull: 'none', topology: 'triangle-strip', label: 'water' }),
      P({ module: fx, vs: 'vsSeed', fs: 'fsSeed', cull: 'none', blend: 'premul', label: 'seed' }),
      P({ module: fx, vs: 'vsLeaf', fs: 'fsLeaf', buffers: [I4], cull: 'none', label: 'leaf' }),
      P({ module: fx, vs: 'vsFly', fs: 'fsLeaf', buffers: [I4], cull: 'none', label: 'fly' }),
      P({ module: fx, vs: 'vsMist', fs: 'fsMist', cull: 'none', blend: 'premul', label: 'mist' }),
    ]);
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    const ty = Math.tan(cam.fov / 2), tx = ty * ctx.width / ctx.height, kx = Math.sqrt(1 + tx * tx), ky = Math.sqrt(1 + ty * ty), B = this.batches;
    for (let i = 0; i < B.length; i++) binBatch(B[i], ctx, cam, tx, ty, kx, ky);
    // the bloom follows the walker with a little lag, so flowers open as you arrive and close behind you
    const P = ctx.env.params, jx = cam.pos[0] - P[0], jz = cam.pos[2] - P[1];
    if (dt <= 0 || cam.frozen || jx * jx + jz * jz > 30) { P[0] = cam.pos[0]; P[1] = cam.pos[2]; } else { const k = 1 - Math.exp(-dt / 0.8); P[0] += jx * k; P[1] += jz * k; }
    this.mov = cam.moving;
    P[3] += ((cam.moving > 1 ? 1 : cam.moving) - P[3]) * (dt > 0 ? 1 - Math.exp(-dt / 0.5) : 0);
    // birds on the path fly up when you come close and settle again later
    const fd = Math.hypot(cam.pos[0] - FLOCK[0], cam.pos[2] - FLOCK[1]), ft = fd < 11 ? 1 : 0;
    if (ft && !this.fl && ctx.audio) ctx.audio.whoosh({ dur: 1.6, f0: 900, f1: 2400, gain: 0.02, reverb: 0.5 });
    this.fl = ft;
    P[2] = ctx.shot ? ft : P[2] + (ft - P[2]) * (1 - Math.exp(-dt / (ft ? 1.3 : 7)));

    // ---- flora: jittered world-fixed cells around the camera -> per-species, per-LOD instance bins ----
    const F = this.flo, st = F.stage, cnt = F.cnt, ex = cam.eye[0], ez = cam.eye[2], DEN = this.DEN, GR = this.GR, ZID = this.ZID, k1 = MN / (2 * MS), k2 = MN / (2 * ZS);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
    const tk = tx / Math.max(Math.cos(cam.pitch), 0.3) + 0.08, back = 1.5 + 5 * Math.max(-Math.sin(cam.pitch), 0);
    cnt.fill(0);
    for (let ly = 0; ly < 3; ly++) {
      const c = F.cell[ly], Rr = F.rad[ly], R2 = Rr * Rr;
      let x0 = ex - back - 2, x1 = ex + back + 2, z0 = ez - back - 2, z1 = ez + back + 2;
      for (let e = -1; e <= 1; e++) {
        const px = ex + Rr * (fx + e * tk * rx), pz = ez + Rr * (fz + e * tk * rz);
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
      }
      if (x0 < ex - Rr) x0 = ex - Rr; if (x1 > ex + Rr) x1 = ex + Rr; if (z0 < ez - Rr) z0 = ez - Rr; if (z1 > ez + Rr) z1 = ez + Rr;
      if (x0 < 1 - MS) x0 = 1 - MS; if (x1 > MS - 2) x1 = MS - 2; if (z0 < 1 - MS) z0 = 1 - MS; if (z1 > MS - 2) z1 = MS - 2;
      const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c), j0 = Math.floor(z0 / c), j1 = Math.floor(z1 / c);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const h = hash2i(i, j);
        let x = (i + 0.08 + 0.84 * (h & 1023) / 1023) * c;
        const z = (j + 0.08 + 0.84 * ((h >>> 10) & 1023) / 1023) * c;
        const dx = x - ex, dz = z - ez, d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const zf = dx * fx + dz * fz; if (zf < -back) continue;
        const xr = dx * rx + dz * rz; if ((xr < 0 ? -xr : xr) > (zf > 0 ? zf : 0) * tk + back + 1) continue;
        const d = Math.sqrt(d2), rank = (h >>> 20) / 4096, h2 = pcg(h), mi = ((z + MS) * k1 | 0) * MN + ((x + MS) * k1 | 0);
        let s, bin, acc = 0;
        if (ly === 2) {
          if ((h2 & 255) >= GR[mi]) continue;
          const dv = Rr * (0.55 + 0.45 * rank); if (d > dv) continue;
          s = sat((dv - d) / (dv * 0.3)) * (0.7 + 0.6 * rank) * (DEN[mi] < 30 && riverT(x, z) < 1.2 ? 2.2 : 1); bin = d > 4.5 ? 25 : 24;
        } else {
          if ((h2 & 255) >= DEN[mi]) continue;
          const zx = x + ((h2 >>> 8) & 15) * 0.4 - 3, zz = z + ((h2 >>> 12) & 15) * 0.4 - 3;
          const Fd = FIELDS[ZID[((zz + ZS) * k2 | 0) * MN + ((zx + ZS) * k2 | 0)]];
          let sp = Fd[1]; acc = Fd[2];
          if (((h2 >>> 16) & 255) < Fd[4] * 256) { sp = Fd[3]; acc = Fd[5]; }
          if (ly === 0) {
            if (sp === 1) { let m = i % 6; if (m < 0) m += 6; if (m > 2) continue; }
            const dv = 9 + 8 * rank; if (d > dv) continue;
            s = sat((dv - d) / 2); bin = sp * 2 + (d > 6.5 ? 1 : 0);
          } else {
            if (sp === 1) { if (i & 1) continue; x = (i + 0.36 + 0.28 * (h & 1023) / 1023) * c; }
            const dn = 7 + 7 * rank; if (d < dn) continue;
            const dv = Rr * (0.6 + 0.4 * rank); if (d > dv) continue;
            s = Math.min(sat((d - dn) / 3), sat((dv - d) / (dv * 0.22))) * (1 + d * 0.012); bin = 16 + sp;
          }
        }
        const nI = cnt[bin]; if (nI >= CAP) continue;
        const o = (bin * CAP + nI) * 4; cnt[bin] = nI + 1;
        st[o] = x; st[o + 1] = z; st[o + 2] = acc + ((h2 >>> 4) & 0xffff) / 65537; st[o + 3] = s;
      }
    }
    for (let i = 0; i < 9; i++) {                       // the ring of giant flowers: same meshes, six times the size; they wake when you step inside
      const b = (i % 3 === 0 ? 4 : i % 3 === 1 ? 2 : 6) * 2, o = (b * CAP + cnt[b]++) * 4;
      st[o] = RING[0] + Math.cos(i * 0.698) * 5; st[o + 1] = RING[1] + Math.sin(i * 0.698) * 5; st[o + 2] = (i % 3 ? i % 3 + 2 : 0) + i * 0.0873 % 1; st[o + 3] = 8;
    }
    for (let b = 0; b < NB; b++) if (cnt[b]) ctx.queue.writeBuffer(F.buf, b * CAP * 16, st, b * CAP * 4, cnt[b] * 4);
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    const F = this.flo;
    pass.setPipeline(this.pFlora);
    pass.setVertexBuffer(0, F.vb); pass.setVertexBuffer(1, F.buf); pass.setIndexBuffer(F.ib, 'uint32');
    for (let b = 0; b < NB; b++) if (F.cnt[b]) { const m = F.info[b]; pass.drawIndexed(m[0], F.cnt[b], m[1], m[2], b * CAP); }
    pass.setPipeline(this.pObj);
    for (let i = 0; i < this.batches.length; i++) drawBatch(this.batches[i], pass);
    pass.setVertexBuffer(1, this.one); this.wood.draw(pass);
    pass.setPipeline(this.pLeaf); pass.setVertexBuffer(0, this.leafI); pass.draw(6, this.nLeaf);
    pass.setPipeline(this.pFly); pass.setVertexBuffer(0, this.flyI); pass.draw(12, this.nFly);
    pass.setPipeline(this.pTer); this.ter.draw(pass);
    pass.setPipeline(this.pWater); pass.setVertexBuffer(0, this.waterV); pass.draw(this.waterN);
    pass.setPipeline(this.pSky); pass.draw(3);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    pass.setPipeline(this.pMist); pass.draw(6, 56);
    pass.setPipeline(this.pSeed); pass.draw(6, this.nSeed);
  },

  audio(ctx, a) {
    // identity: G major, harp arpeggios in a gentle 6/8 lilt + a tin-whistle folk tune
    const R = a.rng, W = a.scale(67, 'major', 2);                    // G4..
    a.setReverb({ seconds: 3.2, damp: 0.6, wet: 0.7 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 700, q: 0.6, gain: 0.045, mod: 0.6, modRate: 0.05, gainMod: 0.6 });      // wind through grass
    a.noiseBed({ color: 'white', filter: 'highpass', freq: 4200, gain: 0.004, mod: 0.4, modRate: 0.11, gainMod: 0.8 });
    a.drone({ freq: a.hz(43), partials: [1, 2, 3.01], gain: 0.014, cutoff: 420 });
    a.pad({ chords: [[55, 62, 67, 71], [52, 59, 67, 71], [48, 55, 64, 67], [50, 57, 66, 69]], gain: 0.012, attack: 6, change: [16, 30], cutoff: 2000, reverb: 0.7 });
    // harp episodes: 2-4 bars of 6/8 arpeggios (I vi IV V), then rests; now and then the whistle sings a tune over them
    const CH = { G: [55, 59, 62, 67, 71], Em: [52, 59, 64, 67, 71], C: [48, 55, 60, 64, 67], D: [50, 57, 62, 66, 69], Am: [57, 60, 64, 69, 72] };
    const PRG = [['G', 'Em', 'C', 'D'], ['G', 'C', 'G', 'D'], ['Em', 'C', 'G', 'D'], ['G', 'Am', 'C', 'D']];
    const ARP = [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 2, 4], [0, 1, 3, 2, 4, 3]];
    const TUNE = [[0, 2, 4, 5, 4, 2, 1], [0, 2, 4, 6, 5, 4, 2], [4, 5, 4, 2, 1, 0, 0]];       // degrees in W (G4 = 0); 6/8 durations below
    const RHY = [[1.5, 0.5, 1, 1.5, 0.5, 1, 3], [1, 1, 1, 1.5, 0.5, 1, 3]];
    let lastTune = -99, pi = 0, ps = 0, step = 0;
    a.every(24, 50, (when) => {
      const prg = PRG[(ps++ + R.int(2)) % PRG.length], bars = 2 + R.int(3), ar = R.pick(ARP), tempo = 130 + R.int(30), eighth = 60 / tempo;
      const lift = R() < 0.25 ? 12 : 0;
      for (let b = 0; b < bars; b++) {
        const ch = CH[prg[(b + pi) % 4]];
        for (let i = 0; i < 6; i++) {
          if (R() < 0.12) continue;
          a.harp({ midi: ch[ar[i]] + (i > 2 ? 12 : 0) * 0 + lift, gain: 0.035, vel: i === 0 ? 1.1 : 0.8 + R() * 0.2, reverb: 0.55, pan: -0.25 + i * 0.1, when: when + (b * 6 + i) * eighth + (R() - 0.5) * 0.02 });
        }
      }
      pi = (pi + 1 + R.int(2)) % 4;
      if (a.now() - lastTune > 40 && R() < 0.8) {
        lastTune = a.now();
        const tn = TUNE[step++ % 3 ? R.int(3) : 0], rh = R.pick(RHY), sh = R.pick([0, 0, 1, -1, 2]), notes = [];
        tn.forEach((d, i) => { notes.push({ deg: Math.min(13, Math.max(0, d + 4 + sh)), dur: rh[i], vel: 0.9 }); });
        a.phrase({ notes, inst: a.flute, opts: { preset: 'whistle', gain: 0.03, vibrato: 12, reverb: 0.6, pan: 0.2, attack: 0.05, release: 0.2, durMul: 0.9 }, tempo, humanize: 0.012, scale: W, when: when + 6 * eighth * (bars > 2 ? 1 : 0) + 0.4 });
      }
    }, { startDelay: 5 });
    // a lone harp note or two between the episodes
    a.every(9, 22, (when) => { if (R() < 0.6) a.harp({ midi: R.pick(W.slice(0, 11)), gain: 0.03, reverb: 0.6, pan: R.range(-0.5, 0.5), when }); }, { startDelay: 12 });
    for (const b of BRIDGES) a.noiseBed({ color: 'white', filter: 'bandpass', freq: 900, q: 0.5, gain: 0.07, mod: 0.2, modRate: 0.17, bus: a.spatial({ pos: [b.x, 0.3, b.z], ref: 9, rolloff: 1.2, reverb: 0.3, gain: 1 }) });   // river
    const rs = a.spatial({ pos: [RING[0], hAt(RING[0], RING[1]) + 2, RING[1]], ref: 6, rolloff: 1.3, reverb: 0.8, gain: 1 });
    a.every(3, 8, (when) => a.bell({ freq: a.hz(R.pick([76, 79, 83, 88])), gain: 0.02, decay: 5, when, bus: rs }));        // the giant flowers chime
    const bee = a.spatial({ pos: [BIGTREE[0] - 2.4, hAt(BIGTREE[0], BIGTREE[1]) + 4, BIGTREE[1] + 1.2], ref: 3, rolloff: 1.4, reverb: 0.1, gain: 1 });
    const bz = a.drone({ freq: 148, partials: [1, 2, 3, 4], type: 'sawtooth', detune: 14, cutoff: 700, gain: 0.012, bus: bee });
    a.every(3, 9, () => bz.setFreq(138 + R() * 30));
    a.every(5, 16, (when) => {                                                                // birdsong: short phrases, far and sparse
      const f = 1900 + R() * 1900, pan = R.range(-0.8, 0.8), k = R.int(3);
      for (let i = 0, n = 2 + R.int(4); i < n; i++) a.chirp({ f0: f * (k ? 1 : 1.25), f1: f * (k === 1 ? 1.35 : 0.85), dur: 0.07 + 0.05 * k, vib: k === 2 ? 60 : 0, vibRate: 30, gain: 0.006, when: when + i * (0.13 + 0.05 * k), pan, reverb: 0.7 });
    }, { startDelay: 4 });
    const notes = a.scale(67, 'pentatonic', 2);
    a.every(0.7, 2.2, (when) => { if (this.mov > 0.3) a.bell({ freq: a.hz(R.pick(notes)), gain: 0.007, decay: 2.5, when, pan: R.range(-0.5, 0.5), reverb: 0.8 }); });   // petal-soft chimes while flowers open around you
  },
};
