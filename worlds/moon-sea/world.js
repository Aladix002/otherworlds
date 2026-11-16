// Moon mirror sea: a few centimetres of still water under a huge moon. See NOTES.md.
import { fbm2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import COMMON from './common.wgsl';
import BAKE from './bake.wgsl';
import SKY from './sky.wgsl';
import SCENE from './scene.wgsl';
import WATER from './water.wgsl';
import LIFE from './life.wgsl';

const TAU = Math.PI * 2;
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

// ---- layout (metres). Spawn at the origin looking toward -Z, where the moon hangs. ----
const MOON_EL = 0.31, MOON_R = 0.165;
const MOON = [0, Math.sin(MOON_EL), -Math.cos(MOON_EL)];
const MW_POLE = norm([Math.sin(2.44) * Math.cos(0.61), Math.sin(0.61), -Math.cos(2.44) * Math.cos(0.61)]);   // Milky Way pole
const ISX = 291.3, ISZ = -106.0, ISR = 235;          // dune island (keep in sync with common.wgsl)
const HM = [40, -10, 400], HN = 768;                 // height map centre, size, resolution (common.wgsl HMAP)
const DOOR = [6, 24];
const TREE = [-16.6, -34.3];
const LAUNCH = [17, -47, 32];                        // lantern launch area: centre, radius
const ISL = [-58, -70];                              // the lighthouse islet
const LOTUS = [-30, 21, 12];                         // field of lotus candles: centre, radius
const PODS = [[6, -4], [-37, -50], [-28, 22], [41, 7]];   // fish pod homes
const TURTLE = [22, 6, 0.37];                        // turtle home x, z, path phase
const WHALE_T = 83;                                  // keep in sync with life.wgsl
// swimmer path, the twin of podPath in life.wgsl (used to aim the critic poses)
function podPath(h, ph, r, a0) {
  const a = a0 + ph * 40;
  return [h[0] + r * (Math.sin(a) + 0.35 * Math.sin(2.3 * a + ph * 5)), h[1] + r * (Math.cos(a * 0.77 + ph * 3) + 0.3 * Math.sin(1.9 * a))];
}
// sandbars: cx, cz, rx, rz, rotation, amplitude above the sea floor (-0.075)
const BARS = [
  [-16, -34, 9.5, 4.6, 0.5, 0.52],     // the tree bar
  [6, 24.4, 5.0, 3.6, 0.2, 0.066],     // shoal under the door: stays just below the surface
  [7.5, -13, 5.5, 2.3, -0.4, 0.17],    // low spit in front of the spawn
  [-38, 3, 7, 3, 1.0, 0.2],
  [44, -13, 10, 4, 0.25, 0.23],
  [ISL[0], ISL[1], 10.5, 8, 0.3, 1.3],  // the islet: a low mound under the rocks and the tower
];

function shoreS(x, z) { return ISR - Math.hypot(x - ISX, z - ISZ) + 5 * fbm2(x * 0.012, z * 0.012, 2); }
function terrain(x, z) {
  let h = -0.075 + 0.02 * fbm2(x * 0.07, z * 0.07, 2);
  for (let i = 0; i < BARS.length; i++) {
    const b = BARS[i], dx = x - b[0], dz = z - b[1];
    if (dx * dx + dz * dz > 400) continue;
    const c = Math.cos(b[4]), s = Math.sin(b[4]);
    const e = Math.hypot((c * dx + s * dz) / b[2], (c * dz - s * dx) / b[3]) + 0.2 * fbm2(x * 0.16 + i * 7.3, z * 0.16, 2);
    h += b[5] * ss(1.05, 0.2, e);
  }
  const s = shoreS(x, z);
  if (s > -9) {
    const dn = ss(7, 40, s);
    const land = 0.03 * s + dn * (1.5 + 2.7 * (0.5 + 0.5 * fbm2(x * 0.019 + 3, z * 0.019, 3)) + 0.45 * fbm2(x * 0.075, z * 0.075, 2));
    h = mix(h, land, ss(-9, 3, s));
  }
  return h;
}
const walkH = (x, z) => { const h = terrain(x, z), k = 0.05; return h > k ? h : h < -k ? 0 : (h + k) * (h + k) / (4 * k); };

function toHalf(v) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = v; const x = u[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; const m = (x >>> 13) & 0x3ff;
  if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | m;
}

// sand grid: at(u, v) -> [x, z]; vertices are pos, normal, (shore distance, shore flag)
function sandGrid(nx, nz, at, flag, V, I) {
  const base = V.length / 8, P = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const [x, z] = at(i / nx, j / nz), e = 0.3;
    const ax = terrain(x - e, z) - terrain(x + e, z), az = terrain(x, z - e) - terrain(x, z + e), l = Math.hypot(ax, 2 * e, az);
    V.push(x, terrain(x, z), z, ax / l, 2 * e / l, az / l, flag ? shoreS(x, z) : -99, flag);
    P.push(x, z);
  }
  const w = nx + 1;
  const up = (P[2] - P[0]) * (P[2 * w + 1] - P[1]) - (P[3] - P[1]) * (P[2 * w] - P[0]) < 0;   // orientation of (a, a+1, a+w)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = base + j * w + i, b = a + 1, c = a + w, d = c + 1;
    if (up) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
  }
}

function makeTree(M, R) {
  const wood = [], L = { pos: [], nrm: [], uv: [], idx: [] };
  const leaf = (c, s) => {   // one blossom: a quad card, uv.x = corner index + phase, uv.y = tone
    const n = norm([R() - 0.5, R() * 0.9 + 0.1, R() - 0.5]), a = norm(cross(n, [R() - 0.5, R() - 0.5, R() - 0.5])), b = cross(n, a);
    const k = L.pos.length / 3, ph = R() * 0.98, tone = R();
    for (let ci = 0; ci < 4; ci++) {
      const u = (ci & 1) * 2 - 1, v = (ci >> 1) * 2 - 1;
      L.pos.push(c[0] + (a[0] * u + b[0] * v) * s, c[1] + (a[1] * u + b[1] * v) * s, c[2] + (a[2] * u + b[2] * v) * s);
      L.nrm.push(n[0], n[1], n[2]); L.uv.push(ci + ph, tone);
    }
    L.idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  };
  const tuft = (q, n, r) => { for (let i = 0; i < n; i++) leaf([q[0] + (R() - 0.5) * 2 * r, q[1] + (R() - 0.5) * 1.4 * r, q[2] + (R() - 0.5) * 2 * r], 0.06 + R() * R() * 0.075); };
  const branch = (p, d, len, rad, depth) => {
    const n = depth === 0 ? 6 : 4, path = [p]; let q = p, dir = d;
    for (let i = 1; i <= n; i++) {
      dir = norm([dir[0] + (R() - 0.5) * 0.5 + 0.07, dir[1] + (R() - 0.5) * 0.3 + (depth ? 0.05 : 0.02), dir[2] + (R() - 0.5) * 0.5 + 0.03]);
      q = [q[0] + dir[0] * len / n, q[1] + dir[1] * len / n, q[2] + dir[2] * len / n]; path.push(q);
    }
    wood.push(M.tube(path, (t) => Math.max(rad * (1 - 0.4 * t), 0.016), depth < 2 ? 7 : 5));
    if (depth === 3) { for (let i = 1; i <= n; i++) tuft(path[i], 34, 0.29); return; }
    const kids = depth === 0 ? 4 : 3;
    for (let k = 0; k < kids; k++) {
      const at = k === 0 ? n : n - 1 - (k % 2) - (depth === 0 ? (k >> 1) : 0), a = R() * TAU, sp = k === 0 ? 0.45 : 1;
      const cd = norm([dir[0] * 0.55 + Math.cos(a) * 0.8 * sp, dir[1] * 0.55 + 0.3, dir[2] * 0.55 + Math.sin(a) * 0.8 * sp]);
      branch(path[at], cd, len * (0.66 + R() * 0.14), Math.max(rad * (1 - 0.4 * at / n) * 0.85, 0.018), depth + 1);
    }
  };
  branch([0, -0.1, 0], [0.1, 1, 0.04], 2.0, 0.16, 0);
  // the low bough that carries a lantern
  const hb = [[0, 1.2, 0], [-0.42, 1.7, 0.18], [-0.9, 1.98, 0.38], [-1.36, 2.06, 0.55]];
  wood.push(M.tube(hb, (t) => 0.06 - 0.03 * t, 6));
  wood.push(M.tube([[-1.33, 2.05, 0.54], [-1.33, 1.76, 0.54]], 0.011, 4));
  tuft([-1.5, 2.14, 0.6], 20, 0.24); tuft([-0.95, 2.06, 0.4], 10, 0.2);
  return { wood: M.merge(wood), leaves: { pos: new Float32Array(L.pos), nrm: new Float32Array(L.nrm), uv: new Float32Array(L.uv), idx: new Uint32Array(L.idx) }, hang: [-1.33, 1.76, 0.54] };
}

const P0 = (x, z, y = 1.6) => [x, walkH(x, z) + y, z];
export default {
  id: 'moon-sea',
  title: 'Moon Mirror Sea',
  movement: 'walk',
  spawn: { pos: [0, 1.6, 0], yaw: 0, pitch: 0.07 },
  poses: [
    { pos: [0, 1.6, 0], yaw: 0, pitch: 0.07, t: 24 },                                                 // mirror horizon: moon, tree, lighthouse, lanterns
    { pos: [-38, 1.6, -50], yaw: 0.72, pitch: 0.08, t: 10 },                                          // the lighthouse islet, a whale fluke far behind
    { pos: P0(66.5, -40, 1.5), yaw: yawTo(66.5, -40, 82, 30), pitch: -0.04, t: 33 },                  // glowing shore waves, fireflies in the dune grass
    { pos: [26, 1.6, 15.5], yaw: 0.709, pitch: -0.409, t: 30 },                                       // the turtle under the mirror, paper boats
    { pos: [-14.4, 1.45, -24.6], yaw: yawTo(-14.4, -24.6, -16.3, -34), pitch: 0.13, t: 12 },          // the lone tree
    { pos: [-28.5, 1.5, 27], yaw: 0.2, pitch: -0.27, t: 30 },                                         // the lotus candle field
  ],
  flythrough: [
    { pos: [0, 1.7, 3], yaw: 0, pitch: 0.05 }, { pos: [5, 1.7, -17], yaw: -0.35, pitch: 0.12 },
    { pos: [-10, 1.7, -25], yaw: 0.45, pitch: 0.12 }, { pos: [-34, 1.8, -48], yaw: 0.7, pitch: 0.08 },
    { pos: [-46, 1.9, -60], yaw: 0.75, pitch: 0.12 }, { pos: [-30, 1.8, -40], yaw: -0.9, pitch: 0.05 },
    { pos: [8, 1.8, -36], yaw: -1.3, pitch: 0.1 }, { pos: [38, 1.7, -31], yaw: -1.45, pitch: 0 },
    { pos: [64, 1.6, -30], yaw: -1.2, pitch: -0.05 }, { pos: [70.5, 1.7, -6], yaw: -2.3, pitch: -0.03 },
    { pos: [52, 1.7, 13], yaw: -3.6, pitch: 0 }, { pos: [25, 1.7, 15], yaw: -4.2, pitch: -0.15 },
    { pos: [8, 1.7, 19.5], yaw: -3.6, pitch: -0.04 }, { pos: [-16, 1.7, 25], yaw: -4.6, pitch: -0.12 },
    { pos: [-27, 1.6, 15], yaw: -5.3, pitch: -0.1 }, { pos: [0, 1.7, 3], yaw: -6.28, pitch: 0.05 },
  ],
  flythroughDuration: 75,
  doors: [{ pos: [DOOR[0], 0, DOOR[1]], yaw: Math.PI, to: 'aurora-fjord' }],
  bounds: { center: [28, 0, -12], radius: 118 },
  env: {
    sunDir: MOON, sunColor: [0.27, 0.36, 0.56], fogColor: [0.027, 0.05, 0.08], fogDensity: 0.0022,
    ambientSky: [0.03, 0.05, 0.095], ambientGround: [0.016, 0.022, 0.04],
  },
  post: { exposure: 1.3, bloom: 0.22, bloomThreshold: 1.7, bloomKnee: 0.7, bloomRadius: 1, vignette: 0.3, saturation: 1.08, contrast: 1.04 },
  clearColor: [0.01, 0.016, 0.03],
  doorLight: [0.11, 0.085, 0.06],
  fov: 58,

  heightAt(x, z) { return walkH(x, z); },
  sdf(x, y, z) {
    let d = Math.min(Math.hypot(x - TREE[0], z - TREE[1]) - 0.3, Math.hypot(x - ISL[0], z - ISL[1]) - 1.55);
    const B = this.big;
    if (B && d > 0 && Math.abs(x - ISL[0]) < 16 && Math.abs(z - ISL[1]) < 16) {
      for (let i = 0; i < B.length; i += 4) d = Math.min(d, Math.hypot(x - B[i], y - B[i + 1], z - B[i + 2]) - B[i + 3]);
    }
    return d;
  },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(9117), M = ctx.mesh;
    const TEX = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;

    // ---------- baked sky dome + moon ----------
    const bc = { MX: MOON[0], MY: MOON[1], MZ: MOON[2], MR: MOON_R, PX: MW_POLE[0], PY: MW_POLE[1], PZ: MW_POLE[2] };
    const bmod = ctx.shader(BAKE, 'bake');
    const skyTex = ctx.texture(2048, 640, 'rgba16float', TEX), moonTex = ctx.texture(768, 768, 'rgba8unorm', TEX);
    {
      const enc = dev.createCommandEncoder();
      for (const [tex, fs, fmt] of [[skyTex, 'fsSky', 'rgba16float'], [moonTex, 'fsMoon', 'rgba8unorm']]) {
        const pipe = ctx.pipeline({ module: bmod, fs, format: fmt, depthFormat: null, constants: bc, cull: 'none' });
        const p = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
        p.setBindGroup(0, ctx.globalsBindGroup); p.setPipeline(pipe); p.draw(3); p.end();
      }
      dev.queue.submit([enc.finish()]);
    }
    await progress(0.15);

    // ---------- height map (r = height, g = metres inland of the island waterline) ----------
    const hh = new Uint16Array(HN * HN * 2);
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        const x = HM[0] + ((i + 0.5) / HN - 0.5) * HM[2], z = HM[1] + ((j + 0.5) / HN - 0.5) * HM[2];
        hh[(j * HN + i) * 2] = toHalf(terrain(x, z)); hh[(j * HN + i) * 2 + 1] = toHalf(Math.max(-80, Math.min(80, shoreS(x, z))));
      }
      if (j % 128 === 127) await progress(0.15 + 0.25 * j / HN);
    }
    const hTex = ctx.texture(HN, HN, 'rg16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: hTex }, hh, { bytesPerRow: HN * 4 }, [HN, HN]);

    // ---------- uniforms + common bind group ----------
    this.U = new Float32Array(80);
    this.ubuf = ctx.buffer(this.U.byteLength, 'uniform');
    const clampS = dev.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const repS = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat' });
    const L1 = ctx.layout(['uniform', 'texture', 'texture', 'texture', 'sampler', 'sampler']);
    this.bg1 = ctx.bindGroup(L1, [this.ubuf, skyTex.createView(), moonTex.createView(), hTex.createView(), clampS, repS]);
    this.L2 = ctx.layout(['texture']);
    this.U.set([MOON[0], MOON[1], MOON[2], Math.sin(MOON_R)], 0);

    // ---------- sand ----------
    const V = [], I = [];
    const th0 = Math.atan2(-ISZ, -ISX);
    sandGrid(380, 60, (u, v) => {
      const th = th0 + (u - 0.5) * 2.3, r = ISR + 12 - 130 * Math.pow(v, 1.7);
      return [ISX + Math.cos(th) * r, ISZ + Math.sin(th) * r];
    }, 1, V, I);
    for (const b of BARS) { const r = Math.max(b[2], b[3]) * 1.3; sandGrid(44, 44, (u, v) => [b[0] + (u - 0.5) * 2 * r, b[1] + (v - 0.5) * 2 * r], 0, V, I); }
    this.sand = { vb: ctx.buffer(new Float32Array(V), 'vertex'), ib: ctx.buffer(new Uint32Array(I), 'index'), n: I.length };
    await progress(0.55);

    // ---------- rocks ----------
    const rk = [], rk2 = [], big = [];
    const rock = (x, z, s, sink = 0.2) => (s > 0.33 ? rk2 : rk).push(x, terrain(x, z) + s * (0.3 - sink), z, s, R() * TAU, R(), 0.5 + R() * 0.4, 0);
    for (const [lx, lz, s] of [[1.25, 0.5, 0.2], [1.7, -0.35, 0.34], [2.5, 0.3, 0.16], [-1.3, -0.45, 0.26], [-1.75, -0.9, 0.42], [-2.7, -0.2, 0.15], [-1.15, 1.0, 0.13], [1.55, 1.3, 0.24], [0.8, 0.02, 0.24], [-0.82, -0.03, 0.27]]) rock(DOOR[0] - lx, DOOR[1] - lz, s, 0.1);
    for (const [x, z, s] of [[-9.5, -31, 0.7], [-11.5, -29.5, 0.32], [-22.5, -37.5, 0.85], [-20.5, -31.2, 0.4], [-13.5, -37.6, 0.5], [-18.8, -36.8, 0.28], [-12.3, -32.6, 0.22], [-24, -35.2, 0.3]]) rock(x, z, s);
    for (const [x, z, s] of [[5.5, -11.6, 0.45], [9.4, -13.6, 0.3], [7.2, -14.3, 0.2], [10.6, -11.9, 0.16], [-3.4, -7.2, 0.24], [-4.3, -8, 0.13], [2.6, 5.2, 0.17], [-7, 10.6, 0.22], [-5.1, 7.4, 0.12]]) rock(x, z, s);
    for (let i = 0; i < 14; i++) { const a = R() * TAU, r = 14 + R() * 42, x = Math.cos(a) * r, z = Math.sin(a) * r - 8; if (Math.hypot(x - DOOR[0], z - DOOR[1]) > 5) rock(x, z, 0.12 + R() * R() * 0.5); }
    for (let i = 0; i < 26; i++) {
      const th = th0 + (R() - 0.5) * 1.1, r = ISR - (R() * 9 - 4), x = ISX + Math.cos(th) * r, z = ISZ + Math.sin(th) * r;
      rock(x, z, 0.15 + R() * R() * 0.8);
    }
    // the islet: boulders piled around the tower, smaller stones out to the waterline
    {
      const Ri = makeRng(733);
      for (let i = 0; i < 46; i++) {
        const a = Ri() * TAU, r = 2.3 + Math.pow(Ri(), 0.8) * 10, x = ISL[0] + Math.cos(a) * r * 1.15, z = ISL[1] + Math.sin(a) * r * 0.9;
        const s = (0.3 + Ri() * Ri() * 1.7) * (r < 4 ? 0.55 : r > 9 ? 0.5 : 1);
        if (Math.abs(Math.atan2(Math.sin(a - 0.92), Math.cos(a - 0.92))) < 0.3 && s > 0.5) continue;   // keep the path to the door open
        const k = rk2.length;
        rock(x, z, s, 0.25);
        if (s > 1.0) big.push(x, rk2[k + 1] + s * 0.1, z, s * 0.8);
      }
    }
    this.big = new Float32Array(big);
    this.rockMesh = M.upload(M.rock(5, 3, 0.3)); this.rockMesh2 = M.upload(M.rock(11, 3, 0.38));
    this.rockInst = ctx.buffer(new Float32Array(rk), 'vertex'); this.nRocks = rk.length / 8;
    this.rockInst2 = ctx.buffer(new Float32Array(rk2), 'vertex'); this.nRocks2 = rk2.length / 8;

    // ---------- dune grass ----------
    const gp = [], gn = [], gu = [], gi = [];
    for (let b = 0; b < 13; b++) {
      const a = R() * TAU, h = 0.25 + R() * 0.7, lean = 0.15 + R() * 0.55, r0 = R() * 0.1, k = gp.length / 3, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= 4; j++) {
        const t = j / 4, r = r0 + lean * t * t * h, w = 0.017 * (1 - 0.92 * t);
        for (const s of [-1, 1]) { gp.push(ca * r - sa * w * s, h * t, sa * r + ca * w * s); gn.push(ca * 0.3, 0.95, sa * 0.3); gu.push(s, t); }
        if (j < 4) { const o = k + j * 2; gi.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      }
    }
    this.grass = M.upload({ pos: new Float32Array(gp), nrm: new Float32Array(gn), uv: new Float32Array(gu), idx: new Uint32Array(gi) });
    const gd = [], nG = [1500, 2800, 4200][q];
    for (let tries = 0; gd.length < nG * 8 && tries < 60000; tries++) {   // clumps: a few big tufts ringed by small ones
      const th = th0 + (R() - 0.5) * 1.5, r = ISR - 7 - R() * 75, cx = ISX + Math.cos(th) * r, cz = ISZ + Math.sin(th) * r;
      const s = shoreS(cx, cz);
      if (s < 8 || fbm2(cx * 0.05 + 11, cz * 0.05, 2) + 0.3 * ss(10, 40, s) < 0.1 + 0.45 * R()) continue;
      const n = 3 + Math.floor(R() * 9), cs = 0.6 + R() * 0.9;
      for (let i = 0; i < n; i++) {
        const g = R.gauss() * cs, g2 = R.gauss() * cs, x = cx + g, z = cz + g2, f = Math.exp(-(g * g + g2 * g2) / (2 * cs * cs));
        gd.push(x, terrain(x, z) - 0.03, z, (0.5 + 1.9 * f) * (0.7 + R() * 0.6), R() * TAU, R(), 0, 0);
      }
    }
    this.grassInst = ctx.buffer(new Float32Array(gd), 'vertex'); this.nGrass = gd.length / 8;

    // ---------- tree ----------
    const ty = terrain(TREE[0], TREE[1]);
    const tr = makeTree(M, makeRng(31));
    for (const g of [tr.wood, tr.leaves]) M.translate(g, TREE[0], ty, TREE[1]);
    this.wood = M.upload(tr.wood); this.leaves = M.upload(tr.leaves);
    const hang = [TREE[0] + tr.hang[0], ty + tr.hang[1], TREE[1] + tr.hang[2]];
    this.U[13] = ty;

    // ---------- lanterns and floaters: x, z, phase (static: glow strength), seed | mode, y, scale, bob / drift radius ----------
    // buffer order: tree lantern, sky lanterns | toro (square water lanterns) | paper boats | lotus | glow-only (lighthouse lamp)
    const nL = [34, 48, 66][q], ld = [];
    const LS = 0.78;
    ld.push(hang[0], hang[2], 1, 0.31, 1, hang[1] - 0.69 * LS, LS, 0.0);
    const lampY = terrain(ISL[0], ISL[1]) - 0.35 + 6.3;
    this.U.set([hang[0], hang[1] - 0.4, hang[2], 1.5, DOOR[0] + 2.9, 0.35, DOOR[1] + 0.9, 1.0, DOOR[0] - 2.4, 0.32, DOOR[1] + 1.3, 0.8, ISL[0], lampY, ISL[1], 2.6], 16);
    const pts = [];
    for (let tries = 0; pts.length < nL && tries < 5000; tries++) {
      const a = R() * TAU, r = Math.sqrt(R()) * LAUNCH[2], x = LAUNCH[0] + Math.cos(a) * r, z = LAUNCH[1] + Math.sin(a) * r;
      if (terrain(x, z) > -0.03 || pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 4.5)) continue;
      pts.push([x, z]);
    }
    pts.forEach(([x, z], i) => ld.push(x, z, ((i * 0.6180339887) % 1), R(), 0, 0, 0.9 + R() * 0.25, 1));
    this.nLant = ld.length / 8;
    const Rf = makeRng(4242), wetAt = (x, z) => terrain(x, z) < -0.045;
    for (const [x, z, s, sd] of [[DOOR[0] + 2.9, DOOR[1] + 0.9, 0.72, 0.77], [DOOR[0] - 2.4, DOOR[1] + 1.3, 0.64, 0.13],
      [ISL[0] + 12.5, ISL[1] + 7.5, 0.7, 0.4], [ISL[0] + 10.5, ISL[1] + 11.5, 0.6, 0.9], [ISL[0] + 15, ISL[1] + 10.5, 0.55, 0.55]]) ld.push(x, z, 1, sd, 1, 0.0, s, 1);
    this.nToro = ld.length / 8 - this.nLant;
    for (const [cx, cz, n, sp] of [[13, 10, 9, 9], [-19, 7, 5, 6], [-41, -47, 4, 5], [34, -22, 4, 6]]) {
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const x = cx + Rf.gauss() * sp * 0.5, z = cz + Rf.gauss() * sp * 0.5;
        if (!wetAt(x, z) || Math.hypot(x - DOOR[0], z - DOOR[1]) < 6) continue;
        ld.push(x, z, 0.55, Rf(), 2, 0, 0.6 + Rf() * 0.25, 1.5 + Rf() * 2.5); i++;
      }
    }
    this.nBoat = ld.length / 8 - this.nLant - this.nToro;
    const lp = [], nLo = [30, 46, 62][q];
    for (let tries = 0; lp.length < nLo && tries < 4000; tries++) {
      const a = Rf() * TAU, r = Math.pow(Rf(), 0.65) * LOTUS[2], x = LOTUS[0] + Math.cos(a) * r * 1.25, z = LOTUS[1] + Math.sin(a) * r * 0.85;
      if (!wetAt(x, z) || Math.hypot(x + 28.5, z - 27) < 3.4 || lp.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.7)) continue;
      lp.push([x, z]);
      ld.push(x, z, 0.75, Rf(), 3, 0.002, 0.2 + Rf() * 0.09, 0.22);
    }
    this.nLotus = lp.length;
    ld.push(ISL[0], ISL[1], 0.5, 0.5, 1, lampY - 0.84, 2.8, 0);
    this.nAll = ld.length / 8;
    this.lantInst = ctx.buffer(new Float32Array(ld), 'vertex');
    this.lantMesh = M.upload(M.lathe([[0.14, 0], [0.165, 0.08], [0.2, 0.2], [0.235, 0.34], [0.255, 0.47], [0.255, 0.56], [0.225, 0.64], [0.15, 0.682], [0.001, 0.69]], 26));
    // floaters carry uv.x = material (2 wood, 3 paper, 4 petal, 5 pad), uv.y = candle light on the vertex
    const tag = (g, mat, k) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = mat; g.uv[i + 1] = k(g.pos[i * 1.5], g.pos[i * 1.5 + 1], g.pos[i * 1.5 + 2]); } return g; };
    const flat = (T, mat, K) => {
      const n = T.length * 3, g = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), uv: new Float32Array(n * 2), idx: new Uint32Array(n) };
      T.forEach((t, i) => t.forEach((p, j) => { const v = i * 3 + j; g.pos.set(p, v * 3); g.uv[v * 2] = mat; g.uv[v * 2 + 1] = K(p, i, j); g.idx[v] = v; }));
      return M.computeNormals(g);
    };
    {
      // toro nagashi: a square paper shade between four posts on a float
      const bx = (w, h, d, x, y, z, mat, k) => M.translate(tag(M.box(w, h, d), mat, k), x, y, z), parts = [];
      parts.push(bx(0.56, 0.035, 0.56, 0, 0.018, 0, 2, () => 0.6), bx(0.44, 0.025, 0.44, 0, 0.56, 0, 2, () => 0));
      parts.push(bx(0.34, 0.48, 0.34, 0, 0.3, 0, 3, (x, y) => 0.95 - 0.55 * (y + 0.24) / 0.48));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(bx(0.032, 0.52, 0.032, sx * 0.178, 0.295, sz * 0.178, 2, () => 0.3));
      this.toroMesh = M.upload(M.merge(parts));
      // paper boat: a clean origami hull, a folded sail, a candle flame (material 6)
      const flame = (x, y, z, s) => M.translate(M.scale(tag(M.sphere(1, 0), 6, () => 1), s, s * 2.2, s), x, y, z);
      const S = [-0.56, 0.24, 0], B = [0.56, 0.24, 0], K1 = [-0.3, 0, 0], K2 = [0.3, 0, 0], Lf = [0, 0.17, 0.2], Rt = [0, 0.17, -0.2];
      const s0 = [-0.17, 0.13, 0.03], s1 = [0.17, 0.13, 0.03], s2 = [-0.17, 0.13, -0.03], s3 = [0.17, 0.13, -0.03], P = [0, 0.33, 0];
      this.boatMesh = M.upload(M.merge([flat([[S, K1, Lf], [K1, K2, Lf], [K2, B, Lf], [S, Rt, K1], [K1, Rt, K2], [K2, Rt, B], [s0, P, s1], [s2, s3, P]], 3,
        (p) => 0.42 * Math.exp(-Math.hypot(p[0] - 0.3, p[1] - 0.16, p[2]) * 2.4)), flame(0.31, 0.16, 0, 0.022)]));
      // lotus: three rings of narrow curved petals (smooth normals) over a paper-thin pad, a flame in the heart
      const lo = { pos: [], uv: [], idx: [] };
      const petal = (an, r0, len, wid, lift, curl) => {
        const c = Math.cos(an), s = Math.sin(an), b = lo.pos.length / 3;
        for (let j = 0; j <= 4; j++) {
          const t = j / 4, r = r0 + len * t, y = 0.04 + lift * t + curl * t * t, hw = wid * Math.sin(Math.PI * Math.pow(t, 0.75));
          for (const sd of (j === 0 || j === 4 ? [0] : [-1, 0, 1])) { lo.pos.push(c * r - s * sd * hw, y + Math.abs(sd) * hw * 0.45, s * r + c * sd * hw); lo.uv.push(4, 1 - t); }
        }
        lo.idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 10, b + 8, b + 7, b + 10, b + 9, b + 8);
        for (let j = 0; j < 2; j++) { const o = b + 1 + j * 3; lo.idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
      };
      for (const [n, r0, len, wid, lift, curl, off] of [[11, 0.1, 0.92, 0.15, 0.1, 0.16, 0], [9, 0.07, 0.7, 0.125, 0.34, 0.16, 0.3], [6, 0.04, 0.42, 0.09, 0.5, 0.14, 0.1]]) {
        for (let i = 0; i < n; i++) petal(off + i / n * TAU, r0, len, wid, lift, curl);
      }
      const pet = M.computeNormals({ pos: new Float32Array(lo.pos), nrm: new Float32Array(lo.pos.length), uv: new Float32Array(lo.uv), idx: new Uint32Array(lo.idx) });
      const pad = [];
      for (let i = 0; i < 24; i++) { const a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU; pad.push([[0, 0.012, 0], [Math.cos(a1) * 1.4, 0.012, Math.sin(a1) * 1.4], [Math.cos(a0) * 1.4, 0.012, Math.sin(a0) * 1.4]]); }
      this.lotusMesh = M.upload(M.merge([pet, flat(pad, 5, () => 0), flame(0, 0.13, 0, 0.035)]));
    }

    // ---------- the lighthouse (uv.x = material: 0 stone, 1 lamp glass, 2 dark metal) ----------
    {
      const lt = (prof, segs, mat) => { const g = M.lathe(prof, segs); for (let i = 0; i < g.uv.length; i += 2) g.uv[i] = mat; return g; };
      const g = M.merge([
        lt([[1.55, 0], [1.5, 0.35], [1.22, 0.6], [1.08, 2.6], [0.94, 5.0], [0.9, 5.55]], 28, 0),
        lt([[0.9, 5.55], [1.3, 5.68], [1.3, 5.8], [0.56, 5.8]], 28, 2),
        lt([[0.56, 5.8], [0.56, 6.8]], 16, 1),
        lt([[0.56, 6.8], [0.8, 6.78], [0.46, 7.2], [0.1, 7.55], [0.04, 7.9], [0.001, 8.0]], 20, 2),
      ]);
      const rail = M.torus(1.27, 0.022, 28, 5); for (let i = 0; i < rail.uv.length; i += 2) rail.uv[i] = 2;
      this.house = M.upload(M.translate(M.merge([g, M.translate(rail, 0, 6.2, 0)]), ISL[0], lampY - 6.3, ISL[1]));
    }

    // ---------- swimmers: home x, z, time lag, lateral offset | half length, seed, kind, pod phase ----------
    {
      const sw = [], nF = [14, 20, 26][q];
      PODS.forEach((h, pi) => { for (let i = 0; i < nF; i++) sw.push(h[0], h[1], Rf() * 16, (Rf() - 0.5) * 2.6, 0.11 + Rf() * 0.1, Rf(), 0, 0.13 + pi * 0.21); });
      sw.push(TURTLE[0], TURTLE[1], 0, 0, 0.85, 0.5, 1, TURTLE[2]);
      this.swimInst = ctx.buffer(new Float32Array(sw), 'vertex'); this.nSwim = sw.length / 8;
      // fireflies: home xyz, wander radius | seed, height range
      const ff = [], fly = (x, z, y, r, hr) => ff.push(x, terrain(x, z) + y, z, r, Rf(), hr, 0, 0);
      const k = [0.6, 1, 1.4][q];
      for (let i = 0; i < 26 * k; i++) fly(TREE[0] + Rf.gauss() * 3.5, TREE[1] + Rf.gauss() * 2.5, 0.5 + Rf() * 2.4, 1.6, 0.5);
      for (let i = 0; i < 24 * k; i++) fly(ISL[0] + Rf.gauss() * 6, ISL[1] + Rf.gauss() * 5, 0.6 + Rf() * 3, 2, 0.6);
      for (let i = 0; i < 12 * k; i++) fly(LOTUS[0] + Rf.gauss() * 7, LOTUS[1] + Rf.gauss() * 5, 0.5 + Rf() * 0.9, 2.5, 0.3);
      for (let i = 0, tries = 0; i < 110 * k && tries < 3000; tries++) {
        const th = th0 + (Rf() - 0.5) * 0.5, r = ISR - 5 - Rf() * 22, x = ISX + Math.cos(th) * r, z = ISZ + Math.sin(th) * r;
        if (shoreS(x, z) < 6) continue;
        fly(x, z, 0.5 + Rf() * 1.3, 2.2, 0.45); i++;
      }
      this.flyInst = ctx.buffer(new Float32Array(ff), 'vertex'); this.nFly = ff.length / 8;
    }

    // ---------- stars: dir, brightness | colour, phase ----------
    const nS = [3000, 5200, 8000][q], sd = new Float32Array(nS * 8);
    const A = norm(cross(MW_POLE, [0, 1, 0])), B = cross(MW_POLE, A);
    const tints = [[1, 0.7, 0.48], [1, 0.9, 0.74], [1, 0.97, 0.92], [0.86, 0.92, 1], [0.7, 0.8, 1]];
    for (let i = 0; i < nS; i++) {
      let d, mw = R() < 0.42;
      do {
        if (mw) { const a = R() * TAU, g = R.gauss() * 0.11, c = Math.cos(a), s = Math.sin(a); d = norm([A[0] * c + B[0] * s + MW_POLE[0] * g, A[1] * c + B[1] * s + MW_POLE[1] * g, A[2] * c + B[2] * s + MW_POLE[2] * g]); }
        else { const y = R(), a = R() * TAU, r = Math.sqrt(1 - y * y); d = [Math.cos(a) * r, y, Math.sin(a) * r]; }
      } while (d[1] < 0.006);
      const b = Math.min(0.036 * Math.pow(R() + 2e-4, -0.62) * (mw ? 0.8 : 1), 2.4);
      const tc = tints[Math.min(4, Math.floor(Math.pow(R(), 0.8) * 5))], k = 0.55;
      sd.set([d[0], d[1], d[2], b, mix(1, tc[0], k), mix(1, tc[1], k), mix(1, tc[2], k), R()], i * 8);
    }
    this.nStars = nS; this.starInst = ctx.buffer(sd, 'vertex');
    await progress(0.7);

    // ---------- pipelines (main + mirrored twins) ----------
    const skyM = ctx.shader(COMMON + SKY, 'sky'), scM = ctx.shader(COMMON + SCENE + LIFE, 'scene');
    const i0 = M.instanceLayout(['float32x4', 'float32x4'], 0), i3 = M.instanceLayout(['float32x4', 'float32x4'], 3);
    const mk = (mir) => {
      const c = { MIR: mir ? -1 : 1 }, layouts = [L1], cb = mir ? 'front' : 'back';
      const P = (d) => ctx.pipelineAsync({ layouts, constants: c, ...d });
      return Promise.all([
        P({ module: skyM, depthTest: false, depthWrite: false, cull: 'none' }),
        P({ module: skyM, vs: 'vsStar', fs: 'fsStar', buffers: [i0], blend: 'add', depthTest: false, depthWrite: false, cull: 'none' }),
        P({ module: scM, vs: 'vsTerr', fs: 'fsTerr', buffers: [M.layout], cull: cb }),
        P({ module: scM, vs: 'vsRock', fs: 'fsRock', buffers: [M.layout, i3], cull: cb }),
        P({ module: scM, vs: 'vsWood', fs: 'fsWood', buffers: [M.layout], cull: cb }),
        P({ module: scM, vs: 'vsLeaf', fs: 'fsLeaf', buffers: [M.layout], cull: 'none' }),
        P({ module: scM, vs: 'vsLant', fs: 'fsLant', buffers: [M.layout, i3], cull: 'none' }),
        P({ module: scM, vs: 'vsGlow', fs: 'fsGlow', buffers: [i0], blend: 'add', cull: 'none' }),
        P({ module: scM, vs: 'vsGrass', fs: 'fsGrass', buffers: [M.layout, i3], cull: 'none' }),
        P({ module: skyM, vs: 'vsMet', fs: 'fsMet', blend: 'add', depthTest: false, depthWrite: false, cull: 'none' }),
        P({ module: scM, vs: 'vsHouse', fs: 'fsHouse', buffers: [M.layout], cull: cb }),
        P({ module: scM, vs: 'vsBeam', fs: 'fsBeam', blend: 'add', cull: 'none' }),
        P({ module: scM, vs: 'vsFly', fs: 'fsFly', buffers: [i0], blend: 'add', cull: 'none' }),
        P({ module: scM, vs: 'vsWhale', fs: 'fsWhale', blend: 'premul', cull: 'none' }),
      ]);
    };
    this.pm = await mk(false);
    await progress(0.85);
    this.pr = await mk(true);
    this.pool = await ctx.pipelineAsync({ module: scM, vs: 'vsPool', fs: 'fsPool', buffers: [i0], layouts: [L1], blend: 'add', cull: 'none' });
    this.swim = await ctx.pipelineAsync({ module: scM, vs: 'vsSwim', fs: 'fsSwim', buffers: [i0], layouts: [L1], blend: 'premul', cull: 'none' });
    this.water = await ctx.pipelineAsync({ code: COMMON + WATER, layouts: [L1, this.L2], blend: 'premul', depthWrite: true, cull: 'none', label: 'water' });

    this.rs = [0.5, 0.75, 1][q];
    this.rp = {
      colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: null, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
    this.resize(ctx);

    // footsteps (ring buffer in the uniform block)
    this.si = 0; this.acc = 0; this.side = 1; this.lx = ctx.camera.pos[0]; this.lz = ctx.camera.pos[2];
    for (let i = 0; i < 12; i++) this.U[32 + i * 4 + 2] = -100;
    // a short trail behind the "look down" pose, so the still shows how the water answers to steps
    this.U.set([-6.8, 9.1, 18.6, 1, -7.6, 9.75, 17.2, 1], 32 + 40);
    this.spl = { dur: 0.34, f0: 420, f1: 1500, q: 0.8, gain: 0.02, peak: 0.18, bus: null };
    this.wh = { f0: 170, f1: 96, dur: 3.4, gain: 0.016, vib: 3, vibRate: 0.7, reverb: 0.9, pan: -0.4 }; this.we = -1;
    await progress(1);
  },

  resize(ctx) {
    if (!this.rp) return;
    if (this.rtex) { this.rtex.destroy(); this.rdepth.destroy(); }
    const w = this.rw = Math.max(2, Math.ceil(ctx.width * this.rs)), h = this.rh = Math.max(2, Math.ceil(ctx.height * this.rs));
    this.rtex = ctx.texture(w, h, ctx.hdrFormat, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT);
    this.rdepth = ctx.texture(w, h, ctx.depthFormat, GPUTextureUsage.RENDER_ATTACHMENT);
    const v = this.rtex.createView();
    this.rp.colorAttachments[0].view = v; this.rp.depthStencilAttachment.view = this.rdepth.createView();
    this.bg2 = ctx.bindGroup(this.L2, [v]);
  },

  update(ctx, dt, t, cam) {
    const we = Math.floor(t / WHALE_T);
    if (we !== this.we) {   // the far whale sings as its fluke rises
      this.we = we;
      if (ctx.audio && this.spl.bus && t - we * WHALE_T < 2) { this.wh.f0 = 150 + 50 * ctx.audio.rng(); ctx.audio.chirp(this.wh); }
    }
    const U = this.U, dx = cam.pos[0] - this.lx, dz = cam.pos[2] - this.lz, d = Math.hypot(dx, dz);
    this.lx = cam.pos[0]; this.lz = cam.pos[2];
    if (cam.frozen || ctx.movement !== 'walk' || d > 2) return;
    this.acc += d;
    if (this.acc > 0.8) {
      this.acc = 0; this.side = -this.side;
      const i = this.si = (this.si + 1) % 12, o = 32 + i * 4;
      const x = cam.pos[0] + cam.right[0] * 0.12 * this.side, z = cam.pos[2] + cam.right[2] * 0.12 * this.side;
      const dry = Math.min(1, Math.max(0, (terrain(x, z) - 0.05) * 5));
      U[o] = x; U[o + 1] = z; U[o + 2] = t; U[o + 3] = 1;
      const a = ctx.audio;
      if (a && this.spl.bus) {
        const s = this.spl;
        s.gain = 0.02 - 0.012 * dry; s.f0 = 420 - 200 * dry; s.f1 = (1300 + 500 * a.rng()) * (1 - 0.6 * dry); s.dur = 0.3 + 0.1 * a.rng();
        a.whoosh(s);
      }
    }
  },

  computeBefore(ctx, enc) {
    const U = this.U, d = ctx.doors[0], cam = ctx.camera;
    const vw = Math.max(1, Math.round(ctx.renderWidth * this.rs)), vh = Math.max(1, Math.round(ctx.renderHeight * this.rs));
    U[4] = vw / this.rw; U[5] = vh / this.rh;
    if (d) { U[8] = d.pos[0]; U[9] = d.pos[2]; U[10] = d.yaw; U[11] = d.open; U[12] = d.side || 1; }
    ctx.write(this.ubuf, U);
    // planar reflection: only the rows below the horizon can show water
    const fy = Math.min(0.999, Math.max(-0.999, cam.fwd[1]));
    const hy = 0.5 + 0.5 * (fy / Math.sqrt(1 - fy * fy)) / Math.tan(cam.fov / 2);
    const y0 = Math.min(vh, Math.max(0, Math.floor((hy - 0.04) * vh)));
    const p = enc.beginRenderPass(this.rp);
    if (y0 < vh) {
      p.setViewport(0, 0, vw, vh, 0, 1); p.setScissorRect(0, y0, vw, vh - y0);
      p.setBindGroup(0, ctx.globalsBindGroup);
      this.drawScene(p, this.pr);
      this.drawGlow(p, this.pr);
    }
    p.end();
  },

  drawScene(pass, P) {
    pass.setBindGroup(1, this.bg1);
    pass.setPipeline(P[0]); pass.draw(3);
    pass.setPipeline(P[1]); pass.setVertexBuffer(0, this.starInst); pass.draw(6, this.nStars);
    pass.setPipeline(P[9]); pass.draw(6, 8);
    pass.setPipeline(P[2]); pass.setVertexBuffer(0, this.sand.vb); pass.setIndexBuffer(this.sand.ib, 'uint32'); pass.drawIndexed(this.sand.n);
    pass.setPipeline(P[3]); pass.setVertexBuffer(0, this.rockMesh.vertexBuffer); pass.setVertexBuffer(1, this.rockInst);
    pass.setIndexBuffer(this.rockMesh.indexBuffer, this.rockMesh.indexFormat); pass.drawIndexed(this.rockMesh.indexCount, this.nRocks);
    pass.setVertexBuffer(0, this.rockMesh2.vertexBuffer); pass.setVertexBuffer(1, this.rockInst2);
    pass.setIndexBuffer(this.rockMesh2.indexBuffer, this.rockMesh2.indexFormat); pass.drawIndexed(this.rockMesh2.indexCount, this.nRocks2);
    pass.setPipeline(P[8]); pass.setVertexBuffer(0, this.grass.vertexBuffer); pass.setVertexBuffer(1, this.grassInst);
    pass.setIndexBuffer(this.grass.indexBuffer, this.grass.indexFormat); pass.drawIndexed(this.grass.indexCount, this.nGrass);
    pass.setPipeline(P[4]); this.wood.draw(pass);
    pass.setPipeline(P[10]); this.house.draw(pass);
    pass.setPipeline(P[5]); this.leaves.draw(pass);
    pass.setPipeline(P[6]); pass.setVertexBuffer(1, this.lantInst);
    let m = this.lantMesh, f = 0;
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount, this.nLant, 0, 0, f); f += this.nLant;
    m = this.toroMesh;
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount, this.nToro, 0, 0, f); f += this.nToro;
    m = this.boatMesh;
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount, this.nBoat, 0, 0, f); f += this.nBoat;
    m = this.lotusMesh;
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat); pass.drawIndexed(m.indexCount, this.nLotus, 0, 0, f);
  },
  drawGlow(pass, P) {
    pass.setBindGroup(1, this.bg1);
    pass.setPipeline(P[13]); pass.draw(6);
    pass.setPipeline(P[7]); pass.setVertexBuffer(0, this.lantInst); pass.draw(12, this.nAll);
    pass.setPipeline(P[11]); pass.draw(12);
    pass.setPipeline(P[12]); pass.setVertexBuffer(0, this.flyInst); pass.draw(6, this.nFly);
  },

  render(ctx, pass) {
    this.drawScene(pass, this.pm);
    pass.setPipeline(this.water); pass.setBindGroup(2, this.bg2); pass.draw(6);
  },

  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.bg1);
    pass.setPipeline(this.swim); pass.setVertexBuffer(0, this.swimInst); pass.draw(6, this.nSwim);
    pass.setPipeline(this.pool); pass.setVertexBuffer(0, this.lantInst); pass.draw(6, this.nAll);
    this.drawGlow(pass, this.pm);
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 5.5, damp: 0.5, wet: 0.85, predelay: 0.03 });
    a.noiseBed({ color: 'brown', freq: 240, q: 0.5, gain: 0.035, mod: 0.3, modRate: 0.03 });                       // still water bed
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 900, q: 0.7, gain: 0.006, mod: 0.5, modRate: 0.08, gainMod: 0.8 }); // tiny lapping
    const th = Math.atan2(-ISZ, -ISX);
    const surf = a.spatial({ pos: [ISX + Math.cos(th) * ISR, 0.5, ISZ + Math.sin(th) * ISR], ref: 22, rolloff: 1.1, reverb: 0.4, gain: 1 });
    a.noiseBed({ color: 'pink', freq: 520, q: 0.6, gain: 0.075, mod: 0.5, modRate: 0.09, gainMod: 0.7, bus: surf });   // distant surf
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 2600, q: 0.8, gain: 0.012, mod: 0.4, modRate: 0.11, gainMod: 0.9, bus: surf });
    a.drone({ freq: a.hz(38), partials: [1, 2, 3], amps: [1, 0.35, 0.12], gain: 0.022, cutoff: 420, detune: 5 });
    a.pad({ chords: [[50, 57, 62, 66], [45, 52, 57, 64], [47, 54, 59, 62], [43, 50, 59, 62]], gain: 0.026, attack: 7, change: [20, 34], cutoff: 900, reverb: 0.7 });
    const notes = a.scale(74, 'pentatonic', 2);
    const glass = a.bus({ gain: 1, reverb: 0.85 });
    a.every(8, 19, (when) => {
      const f = a.hz(a.rng.pick(notes));
      a.bell({ freq: f, gain: 0.014, decay: 6, ratio: 2.76, index: 0.8, when, bus: glass });
      if (a.rng() < 0.35) a.bell({ freq: f * 1.5, gain: 0.008, decay: 5, ratio: 2.76, index: 0.6, when: when + 0.35 + a.rng() * 0.4, bus: glass });
    }, { startDelay: 5 });
    this.spl.bus = a.bus({ gain: 1, reverb: 0.3 });
    // the islet: a slow bell buoy.  the lotus field: small glass notes, very quiet
    const isl = a.spatial({ pos: [ISL[0], 3, ISL[1]], ref: 16, rolloff: 1.2, reverb: 0.6, gain: 1 });
    a.every(9, 21, (when) => {
      a.bell({ freq: a.hz(57), gain: 0.03, decay: 7, ratio: 1.41, index: 1.4, when, bus: isl });
      if (a.rng() < 0.5) a.bell({ freq: a.hz(57), gain: 0.016, decay: 6, ratio: 1.41, index: 1.2, when: when + 1.1 + a.rng() * 0.5, bus: isl });
    }, { startDelay: 3 });
    const lot = a.spatial({ pos: [LOTUS[0], 0.5, LOTUS[1]], ref: 9, rolloff: 1.3, reverb: 0.7, gain: 1 });
    const hi = a.scale(81, 'pentatonic', 1);
    a.every(4, 11, (when) => { a.bell({ freq: a.hz(a.rng.pick(hi)), gain: 0.012, decay: 3.5, ratio: 3.01, index: 0.5, when, bus: lot }); }, { startDelay: 6 });
  },
};
