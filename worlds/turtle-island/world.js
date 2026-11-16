// Turtle Island: a volcanic island at dusk on the back of a colossal sea turtle. See NOTES.md.
import { makeRng } from '../../core/src/math.js';
import { MS, MN, GN, VOL, DOOR, SPAWN, NEST, COLS, HUT, SHRINE, HOT, TIDE, ss, buildTerrain } from './terrain.js';
import * as GEO from './geo.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FXS from './fx.wgsl';
import BAKE from './bake.wgsl';

const TAU = Math.PI * 2, STROKE = 14, HEADT = 80, V0 = 2.6;
const HAM = [[1.5, 0, -89], [4.8, 0, -87.6]];
const NB = 14, NC = 8, NT = 9, ND = 3;                     // birds, crabs, baby turtles, dolphins (+1 whale)
let DY, DO = 0;
function put(x, y, z, s, yaw, tint, pitch, an) { const D = DY, o = DO; D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = s; D[o + 4] = yaw; D[o + 5] = tint; D[o + 6] = pitch; D[o + 7] = an; DO += 8; }
const P = (x, y, z, yaw, pitch, t) => ({ pos: [x, y, z], yaw, pitch, t });

// tiling detail texture: rg = slope, b = fbm, a = cells; with mips
function detailTex(ctx) {
  const N = 256, R = makeRng(77), h = new Float32Array(N * N), c = new Float32Array(N * N);
  for (let o = 0, Pd = 4, amp = 0.5; o < 6; o++, Pd *= 2, amp *= 0.74) {
    const L = new Float32Array(Pd * Pd); for (let i = 0; i < L.length; i++) L[i] = R();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i / N * Pd, y = j / N * Pd, ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const i1 = (ix + 1) % Pd, j1 = (iy + 1) % Pd, a = L[iy * Pd + ix], b = L[iy * Pd + i1], d = L[j1 * Pd + ix], e = L[j1 * Pd + i1];
      h[j * N + i] += amp * ((a + (b - a) * ux) * (1 - uy) + (d + (e - d) * ux) * uy);
    }
  }
  const C = 14, pts = new Float32Array(C * C * 2); for (let i = 0; i < pts.length; i++) pts[i] = R();
  let lo = 9, hi = -9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N * C, y = j / N * C, cx = x | 0, cy = y | 0; let m = 9;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const k = (((cy + b + C) % C) * C + (cx + a + C) % C) * 2, dx = cx + a + pts[k] - x, dy = cy + b + pts[k + 1] - y; m = Math.min(m, dx * dx + dy * dy);
    }
    c[j * N + i] = Math.min(1, Math.sqrt(m)); lo = Math.min(lo, h[j * N + i]); hi = Math.max(hi, h[j * N + i]);
  }
  let d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, g = (a, b) => Math.max(0, Math.min(255, 127.5 + (h[a] - h[b]) / (hi - lo) * 420));
    d[k * 4] = g(j * N + (i + 1) % N, j * N + (i + N - 1) % N); d[k * 4 + 1] = g(((j + 1) % N) * N + i, ((j + N - 1) % N) * N + i);
    d[k * 4 + 2] = (h[k] - lo) / (hi - lo) * 255; d[k * 4 + 3] = c[k] * 255;
  }
  const tex = ctx.texture(N, N, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, { mips: 9 });
  for (let l = 0, n = N; l < 9; l++, n >>= 1) {
    ctx.queue.writeTexture({ texture: tex, mipLevel: l }, d, { bytesPerRow: n * 4 }, [n, n]);
    const m = n >> 1, e = new Uint8Array(Math.max(m * m * 4, 4));
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) for (let q = 0; q < 4; q++)
      e[(j * m + i) * 4 + q] = (d[(2 * j * n + 2 * i) * 4 + q] + d[(2 * j * n + 2 * i + 1) * 4 + q] + d[((2 * j + 1) * n + 2 * i) * 4 + q] + d[((2 * j + 1) * n + 2 * i + 1) * 4 + q]) / 4;
    d = e;
  }
  return tex;
}

export default {
  id: 'turtle-island',
  title: 'Turtle Island',
  movement: 'walk',
  spawn: { pos: [SPAWN[0], 3.2, SPAWN[1]], yaw: 0, pitch: 0.03 },
  // y is metres above the ground until init() resolves it
  poses: [
    P(4, 1.65, -124, 0, 0.02, 13.9),                      // the head rising ahead, hatchlings crawling to the sea
    P(46, 1.7, -134, -1.52, 0.09, 10.5),                 // tide pools on the shell, a flipper lifting beyond
    P(0, 2, 0, 0, 0, 16.8),                                   // lava meeting the sea (placed in init)
    P(-54, 1.6, -108.5, 2.3, 0.17, 12),                      // black sand and basalt columns
    P(0, 2, 0, 0.52, -0.17, 10),                        // the summit: crater, sea and the head
    P(-3.6, 1.55, -104.5, Math.PI - 0.24, 0.05, 30),        // the door on the beach, the volcano behind it
  ],
  flythrough: [
    P(4, 2, -124, 0.06, 0), P(-14, 2.4, -128, 0.7, 0), P(-48, 2.6, -116, 1.0, 0.05), P(-78, 9, -78, 0.2, -0.25),
    P(-104, 5, -44, -0.5, -0.2), P(-84, 5, -30, -1.9, -0.12), P(-52, 4, -52, -2.4, -0.2), P(-30, 6, -30, -2.4, 0.15),
    P(-8, 6, 4, -2.6, 0.2), P(6, 4, 38, -3.3, -0.3), P(22, 7, 70, -3.1, -0.1), P(16, 3, 104, -3.2, 0.0),
    P(50, 6, 84, -4.4, -0.1), P(84, 3.5, 40, -4.3, -0.05), P(92, 2.5, 16, -4.9, 0), P(86, 3, -40, -5.6, -0.1),
    P(78, 2.2, -74, -5.2, -0.1), P(48, 3, -108, -6.6, 0), P(8, 2.2, -112, -9.2, 0.02), P(-2, 1.8, -106, -9.6, 0.04), P(2, 2, -118, -12.5, 0),
  ],
  flythroughDuration: 60,
  doors: [{ pos: [DOOR[0], null, DOOR[1]], yaw: Math.PI, to: 'astral-ocean' }],
  bounds: { center: [0, 0, 0], radius: 172 },
  env: {
    sunDir: [-0.4225, 0.14, -0.9053], sunColor: [1.75, 0.82, 0.42], fogColor: [0.5, 0.3, 0.3], fogDensity: 0.00042,
    ambientSky: [0.2, 0.2, 0.36], ambientGround: [0.1, 0.065, 0.06],
  },
  post: { exposure: 1.05, bloom: 0.1, bloomThreshold: 1.2, vignette: 0.28, saturation: 1.14, contrast: 1.08 },
  fov: 62, doorLight: [0.05, 0.035, 0.03],

  heightAt(x, z) { return Math.max(this.T.at(x, z), -0.55); },
  sdf(x, y, z) {
    const cx = x - COLS[0], cz = z - COLS[1], a = (this.T.at(x, z) + 0.5) * 1.4, b = (Math.hypot((cx * 0.81 - cz * 0.585) / 15, (cx * 0.585 + cz * 0.81) / 6.4) - 1) * 6;
    return Math.min(a, b, Math.hypot(x - HUT[0], z - HUT[1]) - 2.6, Math.hypot(x - SHRINE[0] + 1.6, z - SHRINE[1] + 0.4) - 0.5);
  },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(4242), M = ctx.mesh;
    const T = this.T = buildTerrain();
    const at = T.at, gy = (x, z) => Math.max(at(x, z), 0);
    await progress(0.3);
    // lava entries into the sea (paths 0 and 1) and the tube's end pond
    const entry = T.paths.slice(0, 2).map((p) => p.find((q) => q[1] < 0.25) || p[p.length - 1]);
    { const e = entry[0], l = Math.hypot(e[0], e[2]), tx = -e[2] / l, tz = e[0] / l, x = e[0] * 0.93 + tx * 13, z = e[2] * 0.93 + tz * 13;
      this.poses[2].pos = [e[0] + 5.5, 2.5, e[2] + 15]; this.poses[2].yaw = 0.08; this.poses[2].pitch = -0.15; }
    { let b = 0, bd = 12; for (let d = 9; d < 20; d += 0.5) { const h = at(VOL[0] + 0.5 * d, VOL[1] + 0.87 * d); if (h > b) { b = h; bd = d; } } this.poses[4].pos = [VOL[0] + 0.5 * bd, 2, VOL[1] + 0.87 * bd]; }
    for (const p of [...this.poses, ...this.flythrough]) p.pos[1] += gy(p.pos[0], p.pos[2]);
    if (ctx.movement !== 'walk') ctx.camera.pos[1] = at(SPAWN[0], SPAWN[1]) + 1.7;

    // ---------- textures ----------
    const TU = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    const mskT = ctx.texture(MN, MN, 'rgba16float', TU);
    dev.queue.writeTexture({ texture: mskT }, T.mask, { bytesPerRow: MN * 8 }, [MN, MN]);
    const skyT = ctx.texture(2048, 512, 'rgba16float', TU | GPUTextureUsage.RENDER_ATTACHMENT);
    {
      const pipe = ctx.pipeline({ code: 'const EYE=vec3f();const HPV=EYE;const NOS=EYE;' + COMMON + BAKE, format: 'rgba16float', depthFormat: null, cull: 'none' });
      const enc = dev.createCommandEncoder();
      const p = enc.beginRenderPass({ colorAttachments: [{ view: skyT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      p.setBindGroup(0, ctx.globalsBindGroup); p.setPipeline(pipe); p.draw(3); p.end();
      dev.queue.submit([enc.finish()]);
    }
    const L = ctx.layout(['texture', 'texture', 'texture', 'sampler', 'sampler']);
    this.bg = ctx.bindGroup(L, [skyT.createView(), detailTex(ctx).createView(), mskT.createView(), ctx.samplers.linear, ctx.samplers.repeat]);
    await progress(0.45);

    // ---------- placement ----------
    const inst = [], batches = [], stamps = [];
    const push = (x, y, z, s, yaw, tint, sy = 1, an = 0) => inst.push(x, y, z, s, yaw, tint, sy, an);
    const batch = (geo, fill) => { const first = inst.length / 8; fill(); const b = { mesh: M.upload(geo), first, count: inst.length / 8 - first }; batches.push(b); return b; };
    const scatter = (n, ok, put) => { for (let i = 0, k = 0; i < n && k < n * 40; k++) { const x = R.range(-150, 150), z = R.range(-170, 170); if (ok(x, z)) { put(x, z); i++; } } };
    const clear = (x, z) => Math.hypot(x - DOOR[0], z - DOOR[1]) > 4.5 && Math.hypot(x + 54, z + 108.5) > 14 && Math.hypot(x - 46, z + 134) > 10 && Math.hypot(x - SPAWN[0], z - SPAWN[1]) > 3 && Math.hypot(x - HUT[0], z - HUT[1]) > 4.5
      && Math.hypot(x - SHRINE[0], z - SHRINE[1]) > 4 && Math.hypot(x - NEST[0], z - NEST[1]) > 2 && T.lavaD(x, z) > 1.5;
    const pools = [...HOT, ...TIDE], dry = (x, z, m = 1) => pools.every((p) => Math.hypot(x - p[0], z - p[1]) > p[2] + m);
    const sandy = (x, z) => T.mat(x, z, 2) > 0.6 && at(x, z) > 1.1 && at(x, z) < 4.5;

    const palmAt = [[27, -138, 2.2], [-13, -131, 0.4], [-22, -118, 1.2], [30, -122, 3.0], [HAM[0][0] - 0.2, HAM[0][2] - 0.15, 3.6], [HAM[1][0] + 0.2, HAM[1][2] + 0.15, 0.5], [-9.5, -95, 2.2]];
    for (let i = 0; i < 16; i++) { const a = R.range(0, TAU), r = 4 + 13 * Math.sqrt(R()); palmAt.push([93 + Math.cos(a) * r * 0.7, 22 + Math.sin(a) * r * 1.3, R.range(0, TAU)]); }
    scatter(q ? 16 : 8, (x, z) => sandy(x, z) && clear(x, z) && Math.abs(x - SPAWN[0]) > 9, (x, z) => palmAt.push([x, z, R.range(0, TAU)]));
    const veg = (x, z) => T.mat(x, z, 3);
    scatter([45, 80, 115][q], (x, z) => veg(x, z) > 0.5 && at(x, z) < 38 && dry(x, z, 2.5), (x, z) => palmAt.push([x, z, R.range(0, TAU), 1]));   // jungle palms on the slopes
    const palmOk = palmAt.filter((p, i) => i < 7 || ((p[3] || sandy(p[0], p[1])) && clear(p[0], p[1]) && palmAt.every((o, j) => j >= i || Math.hypot(o[0] - p[0], o[1] - p[1]) > 2.6)));
    for (let v = 0; v < 3; v++) batch(GEO.palm(11 + v * 5), () => palmOk.forEach((p, i) => { if (i % 3 === v) { push(p[0], at(p[0], p[1]) - 0.15, p[1], R.range(0.85, 1.15), p[2], R()); stamps.push([p[0], p[1], 1.3, 0.5]); } }));
    for (let v = 0; v < 2; v++) batch(GEO.tree(3 + v * 4), () => scatter([9, 14, 20][q], (x, z) => veg(x, z) > 0.62 && at(x, z) < 34 && clear(x, z) && dry(x, z, 2.5), (x, z) => { push(x, at(x, z), z, R.range(0.8, 1.4), R.range(0, TAU), R(), R.range(0.85, 1.5)); stamps.push([x, z, 2.6, 0.45]); }));
    batch(GEO.fern(5), () => {
      scatter([350, 800, 1300][q], (x, z) => veg(x, z) > 0.3 && clear(x, z) && dry(x, z), (x, z) => push(x, at(x, z) - 0.03, z, R.range(0.7, 1.9), R.range(0, TAU), R()));
      scatter(40, (x, z) => T.mat(x, z, 2) > 0.3 && at(x, z) > 2.2 && at(x, z) < 5 && clear(x, z), (x, z) => push(x, at(x, z) - 0.03, z, R.range(0.6, 1.1), R.range(0, TAU), R()));
      for (const s of [-1, 1]) push(DOOR[0] + s * 1.35, at(DOOR[0], DOOR[1]) - 0.03, DOOR[1] + 0.25 * s, 0.6, s, 0.5);
    });
    for (let v = 0; v < 2; v++) batch(GEO.boulder(21 + v), () => {
      scatter([50, 90, 130][q], (x, z) => at(x, z) > -0.4 && at(x, z) < 34 && veg(x, z) < 0.5 && clear(x, z) && dry(x, z, 0.2) && Math.abs(x - SPAWN[0]) + Math.abs(z - SPAWN[1] + 12) > 14,
        (x, z) => { const s = 0.15 + 1.5 * Math.pow(R(), 3.5); push(x, at(x, z) - s * 0.2, z, s, R.range(0, TAU), R(), R.range(0.6, 1)); stamps.push([x, z, s * 1.5, 0.45]); });
      if (!v) { push(DOOR[0] - 1.15, at(DOOR[0], DOOR[1]) - 0.08, DOOR[1] + 0.05, 0.3, 1, 0.5, 0.8); push(DOOR[0] + 1.2, at(DOOR[0], DOOR[1]) - 0.05, DOOR[1] - 0.2, 0.2, 2, 0.5, 0.8); }
    });
    batch(GEO.boulder(9, 1), () => { for (const sd of [-1, 1]) push(DOOR[0] + sd * 0.78, at(DOOR[0], DOOR[1]) - 0.12, DOOR[1], 0.6, sd, 0.5, 0.32); scatter([150, 350, 600][q], (x, z) => sandy(x, z) || (T.mat(x, z, 2) > 0.5 && at(x, z) > 0.1 && at(x, z) < 1.2 && R() < 0.5),
      (x, z) => { const s = 0.03 + 0.1 * R() * R(); push(x, at(x, z) - s * 0.15, z, s, R.range(0, TAU), R(), R.range(0.5, 0.9)); }); });
    stamps.push([DOOR[0], DOOR[1], 1.5, 0.5], [HUT[0], HUT[1], 3.2, 0.5], [COLS[0], COLS[1], 13, 0.4], [NEST[0], NEST[1], 1.3, 0.35]);
    batch(GEO.column(), () => {                              // Reynisfjara-like organ of hex columns: a stepped foot rising to a cliff
      for (let j = -14; j <= 14; j++) for (let i = -30; i <= 30; i++) {
        const lx = (i + (j & 1) * 0.5) * 0.54, lz = j * 0.468, e = Math.hypot(lx / 15, lz / 6.4);
        if (e > 1 + 0.1 * Math.sin(i * 0.7 + j)) continue;
        const x = COLS[0] + lx * 0.81 - lz * 0.585, z = COLS[1] - lx * 0.585 - lz * 0.81 + 0, g = at(x, z);
        const u = (0.3 + 0.7 * ss(-6.5, 3, -lz)) * ss(1.06, 0.6, e), cl = ctx.noise.fbm2(lx * 0.2 + 7, lz * 0.2, 2);      // clustered heights, not a cone
        const top = 0.3 + u * Math.max(0.4, 5.5 + 7.5 * cl) + 0.35 * Math.floor(R() * 5) * (0.3 + u) - (R() < 0.07 ? 1.5 * u : 0);
        push(x, g - 1, z, 0.312, 0.624, R(), (top + 1) / 0.312, top + 1);
      }
    });
    batch(GEO.starfish(), () => TIDE.forEach((p, i) => { for (let k = 0; k < 2; k++) { const a = i * 2.1 + k * 2.6, r = p[2] * (0.35 + 0.3 * k); push(p[0] + Math.cos(a) * r, at(p[0], p[1]) + 0.005, p[1] + Math.sin(a) * r, R.range(1.8, 2.8), a, k); } }));
    HAM.forEach((h) => { h[1] = at(h[0], h[2]) + 1.45; });
    batch(GEO.props(at, HUT, SHRINE, HAM, NEST), () => push(0, 0, 0, 1, 0, 0.5));
    // dynamic creatures live at the end of the instance buffer
    this.dyn0 = inst.length / 8;
    this.dynB = [[GEO.bird(), NB], [GEO.crab(), NC], [GEO.babyTurtle(), NT], [GEO.dolphin(), ND], [GEO.whale(), 1]].map(([g, n]) => batch(g, () => { for (let i = 0; i < n; i++) push(0, -50, 0, 1, 0, 0); }));
    this.dyn = new Float32Array((NB + NC + NT + ND + 1) * 8);
    this.inst = ctx.buffer(new Float32Array(inst), 'vertex'); this.batches = batches;

    // ---------- terrain + ocean meshes ----------
    const N = GN + 1;
    for (const s of stamps) {
      const r = Math.ceil(s[2] / MS * GN), ci = Math.round((s[0] / MS + 0.5) * GN), cj = Math.round((s[1] / MS + 0.5) * GN);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        const o = (j * N + i) * 10, d = Math.hypot(T.verts[o] - s[0], T.verts[o + 2] - s[1]);
        T.verts[o + 6] *= 1 - s[3] * ss(s[2], s[2] * 0.25, d);
      }
    }
    this.tv = ctx.buffer(T.verts, 'vertex'); this.ti = ctx.buffer(T.idx, 'index'); this.tn = T.idx.length;
    T.verts = T.idx = T.mask = null;
    const NR = 150, NS = 168, wv = new Float32Array((NR * NS + 1) * 3), wi = new Uint32Array(NR * NS * 6); let k = 0;
    for (let r = 0; r < NR; r++) for (let s = 0; s < NS; s++) {
      const o = (1 + r * NS + s) * 3, rad = 3 + 9500 * Math.pow((r + 1) / NR, 2.6), a = (s + (r & 1) * 0.5) / NS * TAU;
      wv[o] = Math.cos(a) * rad; wv[o + 2] = Math.sin(a) * rad;
      const s1 = (s + 1) % NS, A = 1 + r * NS + s, B = 1 + r * NS + s1;
      if (!r) { wi[k++] = 0; wi[k++] = B; wi[k++] = A; } else { const C = A - NS, D = B - NS; wi[k++] = C; wi[k++] = D; wi[k++] = A; wi[k++] = D; wi[k++] = B; wi[k++] = A; }
    }
    this.wv = ctx.buffer(wv, 'vertex'); this.wi = ctx.buffer(wi, 'index'); this.wn = k;
    const hg = GEO.head(), v3 = (n, p) => `const ${n} = vec3f(${p.map((x) => x.toFixed(4)).join(',')});`;
    const CM = v3('EYE', hg.eye) + v3('HPV', hg.pivot) + v3('NOS', hg.nose) + `const NESTP=vec2f(${NEST});` + v3('HUTL', [HUT[0] - 0.9, at(HUT[0], HUT[1]) + 2.45, HUT[1] - 1.8]) + v3('SHRL', [SHRINE[0] - 1.6, at(SHRINE[0], SHRINE[1]) + 1.6, SHRINE[1] - 0.4]) + COMMON;
    this.flipMesh = M.upload(GEO.flipper()); this.headMesh = M.upload(hg);
    await progress(0.6);

    // ---------- particles ----------
    const fx = [], F = (x, y, z, ty, size, life, ex = 0) => fx.push(x, y, z, ty, R(), size, life, ex);
    const nq = [0.5, 1, 1.5][q];
    for (let i = 0; i < 140 * nq; i++) F(VOL[0], at(VOL[0], VOL[1]) + 2, VOL[1], 1, 5, 44);
    for (let i = 0; i < 12 * nq; i++) F(VOL[0], at(VOL[0], VOL[1]) + 1, VOL[1], 0, 2.6, 13, 1);
    for (const e of entry) for (let i = 0; i < 50 * nq; i++) F(e[0], 0.3, e[2], 0, 3.8, 11, 1);
    for (const p of HOT) for (let i = 0; i < 12 * nq; i++) F(p[0], at(p[0], p[1]) + 0.2, p[1], 0, p[2] * 0.42, 8, 0);
    { const e = T.paths[2][T.paths[2].length - 6]; for (let i = 0; i < 8; i++) F(e[0], e[1] + 0.3, e[2], 0, 0.9, 6, 0.3); }
    for (let i = 0; i < 70 * nq; i++) { const p = R.pick(T.paths), s = p[R.int(p.length)]; if (s[3] > 0) F(s[0], s[1] + 0.2, s[2], 5, 0.04, R.range(4, 8)); }
    for (let i = 0; i < 26; i++) F(0, 0, 0, 2, 3.2, 1);
    for (let i = 0; i < 22; i++) F(0, 0, 0, 3, 7, 17);
    scatter(190 * nq, (x, z) => veg(x, z) > 0.35 && at(x, z) < 22 && (z > 40 || x > 45) && R() < 0.4 + ss(60, 10, Math.hypot(x - SHRINE[0], z - SHRINE[1])), (x, z) => F(x, at(x, z) + R.range(0.5, 2.6), z, 4, 0.06, 1));
    for (let i = 0; i < 12; i++) F(HUT[0] + R.range(-7, 9), at(HUT[0], HUT[1]) + R.range(0.6, 2.5), HUT[1] + R.range(-7, 9), 4, 0.05, 1);
    for (const s of [-1, 1]) for (let i = 0; i < 44 * nq; i++) F(s, 0, 0, 6, 3.4, R.range(2.6, 4));
    this.fx = ctx.buffer(new Float32Array(fx), 'vertex'); this.nfx = fx.length / 8;

    // ---------- pipelines ----------
    const i2 = M.instanceLayout(['float32x4', 'float32x4'], 3);
    const scene = ctx.shader(CM + SCENE, 'scene'), ly = [L];
    const tl = { arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }] };
    const mk = (d) => ctx.pipelineAsync({ module: scene, layouts: ly, ...d });
    [this.pSky, this.pTerr, this.pWater, this.pFlip, this.pHead, this.pObj, this.pFx] = await Promise.all([
      mk({ vs: 'vsSky', fs: 'fsSky', depthTest: false, depthWrite: false }),
      mk({ vs: 'vsTerr', fs: 'fsTerr', buffers: [tl] }),
      mk({ vs: 'vsWater', fs: 'fsWater', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }], blend: 'alpha', cull: 'none' }),
      mk({ vs: 'vsFlip', fs: 'fsSkin', buffers: [M.layout], cull: 'none' }),
      mk({ vs: 'vsHead', fs: 'fsSkin', buffers: [M.layout] }),
      mk({ vs: 'vsObj', fs: 'fsObj', buffers: [M.layout, i2], cull: 'none' }),
      ctx.pipelineAsync({ code: CM + FXS, layouts: ly, buffers: [M.instanceLayout(['float32x4', 'float32x4'], 0)], blend: 'premul', cull: 'none' }),
    ]);
    this.at = at; this.tAudio = 0; this.lastStroke = -1; this.lastHead = -1;
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    const e = ctx.env, at = this.at, D = this.dyn;
    const ph = TAU * t / STROKE + 0.3;
    const th = (t + 12) % HEADT;
    e.params[0] = V0 * (t + 0.22 * STROKE / TAU * Math.sin(ph - 1.2));
    e.params[1] = ph;
    e.params[2] = ss(1, 9, th) * ss(40, 30, th);
    e.params[3] = -0.45 * Math.sin(t * 0.07 + 1.2) * e.params[2];
    e.params2[0] = Math.min(1, Math.max(0, (th - 12) / 7));
    const wz = -420 + 20 * Math.sin(t * 0.05), wx = 120;
    e.params2[2] = wx; e.params2[3] = wz - 7;
    DY = D; DO = 0;
    for (let i = 0; i < NB; i++) {                          // seabirds: wide slow circles round the cone, the coast and the head
      const g = i % 3, cx = g === 0 ? VOL[0] : g === 1 ? -10 + (i % 4) * 8 : 0, cz = g === 0 ? VOL[1] : g === 1 ? -150 : -205;
      const r = g === 1 ? 20 + (i * 37 % 26) : 42 + (i * 37 % 60), dir = i & 1 ? 1 : -1, a = i * 2.4 + dir * t * 8.5 / r;
      const rr = r * (1 + 0.18 * Math.sin(a * 2 + i)), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.8;
      const y = (g === 0 ? 46 : g === 1 ? 6 : 24) + (i * 13 % (g === 1 ? 8 : 17)) + (g === 1 ? 1.5 : 4) * Math.sin(t * 0.13 + i * 1.9);
      put(x, y, z, 1.6, Math.atan2(Math.sin(a) * dir, -Math.cos(a) * dir * 0.8), 0, 0.1 * Math.cos(t * 0.13 + i * 1.9), t * 2.6 + i * 1.3 + 1.2 * Math.sin(t * 0.37 + i));
    }
    for (let i = 0; i < NC; i++) {                          // crabs sidle along the rims of the tide pools
      const p = TIDE[i % 4], a = i * 1.9 + 0.7 * Math.sin(t * 0.11 + i * 2.3) + 0.25 * Math.sin(t * 0.37 + i), r = p[2] + 0.35 + 0.2 * (i >> 2);
      const x = p[0] + Math.cos(a) * r, z = p[1] + Math.sin(a) * r;
      put(x, at(x, z) - 0.01, z, 2.1 + 0.4 * (i % 3), Math.atan2(-Math.cos(a), -Math.sin(a)), 0, 0, a * 7);
    }
    for (let i = 0; i < NT; i++) {                          // hatchlings: from the nest down to the water, again and again
      const s = (t / 125 + i / NT + 0.02 * Math.sin(i * 5)) % 1, d = s * 34, lat = (i % 7 - 3) * 0.55 * ss(0, 4, d) + 0.3 * Math.sin(d * 0.6 + i * 2);
      const x = NEST[0] + 0.12 * d + lat, z = NEST[1] - 0.993 * d, y = at(x, z);
      put(x, y, z, (2 + 0.3 * (i % 3)) * ss(0, 0.5, d) * ss(-0.3, -0.05, y), 0.12 + 0.25 * Math.cos(d * 0.6 + i * 2) + 0.12 * Math.sin(t * 2.2 + i), 0, 0, t * 4.4 + i * 2);
    }
    for (let i = 0; i < ND; i++) {                          // dolphins riding beside the turtle
      const tt = (t + i * 4.3) % 12.5, u = Math.min(tt / 2.8, 1), s = Math.sin(Math.PI * u);
      put(-26 - i * 8, -2.2 + 5.6 * s, -168 + i * 7 - 9 * u + 7 * ss(3, 12, tt), 2, 0, 0, 0.95 * Math.cos(Math.PI * u) * (tt < 2.8 ? 1 : 0), t * 5);
    }
    put(wx, -1.6 + 0.7 * Math.sin(t * 0.25), wz, 1.5, 0, 0, 0.05 * Math.sin(t * 0.25 + 1), 0);
    ctx.queue.writeBuffer(this.inst, this.dyn0 * 32, D);

    const A = ctx.audio;
    if (A && this.snd) {
      const n = Math.floor(ph / TAU - 0.25), hn = Math.floor((t + 12) / HEADT);
      if (n !== this.lastStroke) { this.lastStroke = n; A.whoosh({ dur: 6, f0: 260, f1: 110, q: 0.8, gain: 0.05, reverb: 0.5, pan: cam.fwd[2] * 0.4 }); }
      if (th > 12 && th < 16 && hn !== this.lastHead) {
        this.lastHead = hn; A.whoosh({ dur: 7, f0: 150, f1: 60, q: 1.2, gain: 0.085, reverb: 0.8 });
        A.additive({ freq: 41, partials: [1, 0.5, 0.2], attack: 2.5, decay: 6, gain: 0.05, reverb: 0.7 });
      }
      if ((this.tAudio -= dt) < 0) {
        this.tAudio = 0.4;
        const h = cam.pos[1], sh = ss(9, 0.5, h);
        this.snd.surf.set(0.035 + 0.06 * sh, 1); this.snd.wind.set(0.02 + 0.04 * ss(8, 40, h), 1);
      }
    }
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.bg);
    pass.setPipeline(this.pSky); pass.draw(3);
    pass.setPipeline(this.pTerr); pass.setVertexBuffer(0, this.tv); pass.setIndexBuffer(this.ti, 'uint32'); pass.drawIndexed(this.tn);
    pass.setPipeline(this.pObj); pass.setVertexBuffer(1, this.inst);
    for (let i = 0; i < this.batches.length; i++) { const b = this.batches[i]; b.mesh.draw(pass, b.count, b.first); }
    pass.setPipeline(this.pFlip); this.flipMesh.draw(pass, 4);
    pass.setPipeline(this.pHead); this.headMesh.draw(pass, 1);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.bg);
    pass.setPipeline(this.pWater); pass.setVertexBuffer(0, this.wv); pass.setIndexBuffer(this.wi, 'uint32'); pass.drawIndexed(this.wn);
    pass.setPipeline(this.pFx); pass.setVertexBuffer(0, this.fx); pass.draw(6, this.nfx);
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 4.5, damp: 0.5, wet: 0.8 });
    const surf = a.noiseBed({ color: 'pink', freq: 520, q: 0.5, gain: 0.07, mod: 0.6, modRate: 0.07, gainMod: 0.5 });       // waves on the sand
    a.noiseBed({ color: 'brown', freq: 170, gain: 0.05, mod: 0.4, modRate: 0.045 });                                       // the sea sliding past
    const wind = a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 900, q: 0.7, gain: 0.02, mod: 0.6, modRate: 0.05 });
    a.drone({ freq: a.hz(33), partials: [1, 2, 3.01], amps: [1, 0.4, 0.15], gain: 0.03, cutoff: 300 });
    a.pad({ chords: [[50, 57, 62, 66], [45, 52, 61, 64], [47, 54, 62, 66], [43, 50, 59, 62]], gain: 0.026, change: [18, 30], cutoff: 1100 });
    this.snd = { surf, wind };
    a.every(7, 19, (when) => {                               // distant seabirds
      const f = a.rng.range(1500, 2300), pan = a.rng.range(-0.8, 0.8);
      a.chirp({ f0: f, f1: f * 0.72, dur: 0.32, repeat: 1 + a.rng.int(3), gap: 0.22, vib: 30, vibRate: 9, gain: 0.011, when, pan, reverb: 0.7 });
    });
    const src = (p, o) => a.spatial({ pos: p, ref: 6, rolloff: 1.4, reverb: 0.25, ...o });
    const T = this.T, at = this.at;
    T.paths.forEach((p, i) => {                              // soft lava crackle, loudest near the flows
      const s = p[Math.floor(p.length * (i === 2 ? 0.25 : 0.85))], bus = src([s[0], s[1] + 0.5, s[2]], { ref: 9 });
      a.noiseBed({ color: 'brown', freq: 260, gain: 0.05, mod: 0.5, modRate: 0.2, bus });
      a.every(0.25, 1.6, (when) => a.whoosh({ dur: a.rng.range(0.03, 0.09), f0: a.rng.range(1500, 4200), f1: 900, q: 3, gain: a.rng.range(0.01, 0.03), when, bus }));
    });
    { const p = HOT[0], bus = src([p[0], at(p[0], p[1]), p[1]]);   // hot springs bubbling
      a.every(0.3, 1.4, (when) => { const f = a.rng.range(240, 520); a.chirp({ f0: f, f1: f * 1.7, dur: 0.07, gain: 0.02, when, bus }); }); }
    { const bus = src([HUT[0] + 2.3, at(HUT[0], HUT[1]) + 2.4, HUT[1] + 0.9], { reverb: 0.5 }), notes = a.scale(81, 'pentatonic', 1);   // shell chimes at the hut
      a.every(3, 11, (when) => { for (let i = 0, n = 1 + a.rng.int(3); i < n; i++) a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.03, decay: 2.5, ratio: 2.76, index: 1.2, when: when + i * a.rng.range(0.12, 0.4), bus }); }); }
    { const bus = src([SHRINE[0], at(SHRINE[0], SHRINE[1]) + 1, SHRINE[1]], { ref: 8, reverb: 0.6 });                                    // crickets in the jungle by the shrine
      a.every(1.5, 6, (when) => a.chirp({ f0: 4300, f1: 4500, dur: 0.05, repeat: 3 + a.rng.int(5), gap: 0.06, gain: 0.008, when, bus })); }
  },
};
