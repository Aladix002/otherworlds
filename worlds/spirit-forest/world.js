// Spirit forest of fireflies: a mossy laurel cloud forest at night. See NOTES.md.
import { fbm2, pcg, u2f } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { VLAYOUT, ILAYOUT, laurel, fern, mushrooms, shelf, log, tuft, deer, lantern, fromCore } from './geo.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';

const WSIZE = 240, HN = 257, TAU = Math.PI * 2;
const DOOR = [8, 22];
const PATH = [[10, 40], [6.2, 26], [3.5, 12], [0, 0], [-3, -12], [-1, -24], [4, -36], [2, -50], [-6, -62], [-10, -80]];
const POND = [25, 7], RING = [-20, -36], ELDER = [-21, 17, 2.3];        // mirror pond, standing-stone ring, giant elder
const SPUR = [[5.7, 20.4], [8, 20.2], [8, 22.4]];                       // worn track from the path to the door
const WIL = [[-8, -28, 1.15], [33, -10, 1.0], [-29, 24, 1.05]];        // glowing willows: x, z, scale
const LOOPS = [[18, -37, 11, 8, 0.6], [-32, -6, 10, 9, 2.0]];            // deer loops: cx, cz, rx, rz, phase
const HLOG = [4.6, -8.2, 0.5];                                           // hero log: x, z, yaw
const DSPEED = 0.42;
const SHAFTS = [[DOOR[0] + 0.2, DOOR[1] - 1.2, 0.9, 1.2], [1.2, 2.5, 1.0, 1.1], [LOOPS[0][0] - 3, LOOPS[0][1] + 2, 1.5, 1.0], [POND[0] - 2, POND[1] + 1, 1.3, 1.0], [-2, -15, 0.8, 0.9], [RING[0], RING[1], 1.6, 1.2]];
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const wrapA = (a) => a - TAU * Math.round(a / TAU);

function segD(x, z, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1], h = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - a[0] - vx * h, z - a[1] - vz * h);
}
function pathDist(x, z) {
  let d = Math.min(segD(x, z, SPUR[0], SPUR[1]), segD(x, z, SPUR[1], SPUR[2])) + 0.3;
  for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segD(x, z, PATH[i], PATH[i + 1]));
  return d;
}
const base = (x, z) => 1.6 * fbm2(x * 0.022, z * 0.022, 3) + 0.3 * fbm2(x * 0.1 + 5.2, z * 0.1 - 1.7, 2) + 0.7 * fbm2(x * 0.047 + 9, z * 0.047 + 4, 2);
const pondD = (x, z) => Math.hypot((x - POND[0]) / 1.25, z - POND[1]);
const PH = base(POND[0], POND[1]), WY = PH - 0.3;
function terrain(x, z) {
  let h = base(x, z);
  const r = Math.hypot(x, z + 10), dp = pondD(x, z);
  if (dp < 13) h = mix(h, PH, 1 - ss(6.5, 13, dp)) - 1.1 * ss(6.2, 2.5, dp);
  h += 7 * ss(75, 125, r);
  h -= 0.14 * ss(1.8, 0.5, pathDist(x, z));
  const dd = Math.hypot(x - DOOR[0], z - DOOR[1]);
  if (dd < 7) h = mix(h, terrain0, 1 - ss(2.5, 7, dd));
  return h;
}
let terrain0 = 0; terrain0 = base(DOOR[0], DOOR[1]);
const hp = (x, z, dy) => [x, terrain(x, z) + dy, z];
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function loopPos(i, s, out) {
  const L = LOOPS[i], a = s / 9.5 + L[4];
  out[0] = L[0] + Math.cos(a) * L[2] * (1 + 0.18 * Math.sin(3 * a)); out[1] = L[1] + Math.sin(a) * L[3] * (1 + 0.15 * Math.cos(2 * a));
  return out;
}
function toHalf(v) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = v; const x = u[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; const m = (x >>> 13) & 0x3ff;
  if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | m;
}
// critic pose 4: beside the deer where it stands at t = 30
const DP = loopPos(0, DSPEED * 30, [0, 0]), DCAM = [DP[0] - 4.6, DP[1] + 4.6];
const WCAM = [15.5, 12.5], RCAM = [RING[0] - 4.5, RING[1] + 8];
// fly-through: path -> willow -> stone ring -> deer glade -> pond -> door -> elder -> spawn (yaw follows the route)
const FLY = [[0, 0], [-2, -11], [-3, -22], [-12, -31], [-14.5, -39.5], [-9, -45], [3, -42], [9, -38], [14, -27], [12, -14], [15, -3], [16.5, 6],
  [13.5, 14.5], [6, 17], [3, 25], [-8, 23], [-15, 13], [-11, 1], [0, 0]];
FLY.forEach((p, i) => { const n = FLY[Math.min(i + 1, FLY.length - 1)], y = i < FLY.length - 1 ? yawTo(p[0], p[1], n[0], n[1]) : 0, q = i ? FLY[i - 1][2] : 0; p[2] = q + wrapA(y - q); });

export default {
  id: 'spirit-forest',
  title: 'Duchovný les svetlušiek',
  movement: 'walk',
  spawn: { pos: hp(0, 0, 1.6), yaw: 0.17, pitch: 0.04 },
  poses: [
    { pos: hp(3.2, 10.5, 1.6), yaw: yawTo(3.2, 10.5, -1, -8), pitch: -0.03, t: 14 },
    { pos: hp(1.5, -17.5, 1.7), yaw: yawTo(1.5, -17.5, -8.5, -28), pitch: 0.16, t: 22 },
    { pos: hp(RCAM[0], RCAM[1], 1.5), yaw: yawTo(RCAM[0], RCAM[1], RING[0], RING[1]), pitch: 0.04, t: 75 },
    { pos: hp(WCAM[0], WCAM[1], 1.35), yaw: yawTo(WCAM[0], WCAM[1], POND[0] + 1, POND[1] - 1), pitch: -0.1, t: 40 },
    { pos: hp(DCAM[0], DCAM[1], 1.7), yaw: yawTo(DCAM[0], DCAM[1], DP[0], DP[1]), pitch: 0.16, t: 30 },
    { pos: hp(5.2, 16.4, 1.6), yaw: yawTo(5.2, 16.4, DOOR[0] + 0.5, DOOR[1]), pitch: -0.03, t: 18 },
  ],
  flythrough: FLY.map(([x, z, yaw]) => ({ pos: hp(x, z, 1.75), yaw, pitch: -0.02 })),
  flythroughDuration: 60,
  doors: [{ pos: [DOOR[0], null, DOOR[1]], yaw: Math.PI, to: 'meadow' }],
  bounds: { center: [0, 0, -10], radius: 78 },
  env: {
    sunDir: [-0.35, 0.8, -0.48], sunColor: [0.16, 0.3, 0.44], fogColor: [0.012, 0.028, 0.042], fogDensity: 0,
    ambientSky: [0.022, 0.046, 0.08], ambientGround: [0.013, 0.025, 0.034],
  },
  post: { exposure: 1.55, bloom: 0.36, bloomThreshold: 0.9, bloomKnee: 0.6, vignette: 0.32, saturation: 1.08, contrast: 1.08 },
  clearColor: [0.006, 0.015, 0.018],
  doorLight: [0.05, 0.085, 0.08],
  fov: 64,

  hAt(x, z) {
    const f = (x / WSIZE + 0.5) * (HN - 1), g = (z / WSIZE + 0.5) * (HN - 1);
    const i = Math.min(HN - 2, Math.max(0, Math.floor(f))), j = Math.min(HN - 2, Math.max(0, Math.floor(g)));
    const u = Math.min(1, Math.max(0, f - i)), v = Math.min(1, Math.max(0, g - j)), H = this.hg, k = j * HN + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + HN] * (1 - u) + H[k + HN + 1] * u) * v;
  },
  heightAt(x, z) { const h = this.hAt(x, z); return pondD(x, z) < 7 ? Math.max(h, WY - 0.3) : h; },
  sdf(x, y, z) {
    let d = 1e9;
    const cx = Math.floor(x / 12) + 32, cz = Math.floor(z / 12) + 32, T = this.treeCol;
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      const cell = this.treeGrid[(a & 63) * 64 + (b & 63)];
      for (let k = 0; k < cell.length; k++) { const o = cell[k] * 3; d = Math.min(d, Math.hypot(x - T[o], z - T[o + 1]) - T[o + 2]); }
    }
    const L = this.logCol;
    for (let k = 0; k < L.length; k += 4) {
      const vx = L[k + 2] - L[k], vz = L[k + 3] - L[k + 1], h = Math.min(1, Math.max(0, ((x - L[k]) * vx + (z - L[k + 1]) * vz) / (vx * vx + vz * vz)));
      d = Math.min(d, Math.hypot(x - L[k] - vx * h, z - L[k + 1] - vz * h) - 0.4);
    }
    return d;
  },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(9091);
    // ---------- terrain ----------
    const hg = this.hg = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hg[j * HN + i] = terrain((i / (HN - 1) - 0.5) * WSIZE, (j / (HN - 1) - 0.5) * WSIZE);
    await progress(0.15);
    const tv = new Float32Array(HN * HN * 12), e = WSIZE / (HN - 1);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const k = j * HN + i, o = k * 12, x = (i / (HN - 1) - 0.5) * WSIZE, z = (j / (HN - 1) - 0.5) * WSIZE;
      const hl = hg[j * HN + Math.max(0, i - 1)], hr = hg[j * HN + Math.min(HN - 1, i + 1)], hd = hg[Math.max(0, j - 1) * HN + i], hu = hg[Math.min(HN - 1, j + 1) * HN + i];
      const nx = hl - hr, nz = hd - hu, ny = 2 * e, l = Math.hypot(nx, ny, nz);
      tv[o] = x; tv[o + 1] = hg[k]; tv[o + 2] = z; tv[o + 3] = nx / l; tv[o + 4] = ny / l; tv[o + 5] = nz / l; tv[o + 8] = pathDist(x, z);
    }
    const ti = new Uint32Array((HN - 1) * (HN - 1) * 6); let ki = 0;
    for (let j = 0; j < HN - 1; j++) for (let i = 0; i < HN - 1; i++) { const a = j * HN + i, c = a + HN; ti.set([a, c, a + 1, a + 1, c, c + 1], ki); ki += 6; }
    this.terr = { vb: ctx.buffer(tv, 'vertex'), ib: ctx.buffer(ti, 'index'), n: ti.length };
    // height map; g = moonlight reaching the ground (canopy dapples + shaft spots)
    const TN = 256, hh = new Uint16Array(TN * TN * 2);
    for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
      const x = ((i + 0.5) / TN - 0.5) * WSIZE, z = ((j + 0.5) / TN - 0.5) * WSIZE;
      let m = 0.4 + 0.75 * ss(0.0, 0.55, fbm2(x * 0.04 + 3, z * 0.04, 2)) + 0.55 * ss(3, 0.6, pathDist(x, z));
      for (const s of SHAFTS) m += Math.exp(-((x - s[0]) ** 2 + (z - s[1]) ** 2) / (s[2] * s[2] * 2.5)) * s[3] * 1.6;
      hh[(j * TN + i) * 2] = toHalf(this.hAt(x, z)); hh[(j * TN + i) * 2 + 1] = toHalf(m);
    }
    const hmap = ctx.texture(TN, TN, 'rg16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: hmap }, hh, { bytesPerRow: TN * 4 }, [TN, TN]);
    // tileable noise texture (4 independent value-noise fbm channels)
    const NN = 128, nd = new Uint8Array(NN * NN * 4);
    const pv = (x, y, P, s) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const hsh = (a, b) => u2f(pcg((((a % P) + P) % P) + pcg((((b % P) + P) % P) + s * 7919)));
      return mix(mix(hsh(ix, iy), hsh(ix + 1, iy), ux), mix(hsh(ix, iy + 1), hsh(ix + 1, iy + 1), ux), uy);
    };
    for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) for (let c = 0; c < 4; c++) {
      const F = [4, 8, 8, 16][c]; let v = 0, a = 0.55, f = F;
      for (let o = 0; o < 3; o++) { v += a * pv((i / NN) * f, (j / NN) * f, f, c * 3 + o); a *= 0.5; f *= 2; }
      nd[(j * NN + i) * 4 + c] = Math.max(0, Math.min(255, Math.round(((v / 0.9625 - 0.5) * 1.25 + 0.5) * 255)));
    }
    const ntex = ctx.texture(NN, NN, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: ntex }, nd, { bytesPerRow: NN * 4 }, [NN, NN]);
    await progress(0.3);

    // ---------- placement ----------
    const emit = [];   // x, z, r, g, b, radius   (b < 0: trunk occlusion into alpha)
    const HUES = [[0.1, 1.0, 0.5], [1.0, 0.6, 0.15], [0.6, 0.42, 1.0]], MINT = HUES[0], WILC = [0.42, 1.0, 0.86];
    const dist2 = (x, z, p) => Math.hypot(x - p[0], z - p[1]);
    const keep = [];   // camera spots and routes that must stay clear of trunks
    for (const p of this.poses) keep.push([p.pos[0], p.pos[2], 5.5]);
    for (let i = 0; i < FLY.length - 1; i++) for (let k = 0; k < 8; k++) keep.push([mix(FLY[i][0], FLY[i + 1][0], k / 8), mix(FLY[i][1], FLY[i + 1][1], k / 8), 4.6]);
    const tmp = [0, 0];
    for (let i = 0; i < 2; i++) for (let k = 0; k < 64; k++) { loopPos(i, (k / 64) * TAU * 9.5, tmp); keep.push([tmp[0], tmp[1], 6]); }
    for (let k = 1; k < 9; k++) keep.push([mix(0, WIL[0][0], k / 9), mix(0, WIL[0][1], k / 9), 5], [mix(DCAM[0], DP[0], k / 8), mix(DCAM[1], DP[1], k / 8), 9]);
    const clearOf = (x, z, r) => !keep.some((k) => Math.hypot(k[0] - x, k[1] - z) < (r > 3 ? Math.max(r, k[2] || 0) : r));
    const dDoor = (x, z) => Math.hypot(x - DOOR[0], z - DOOR[1]);
    const dWil = (x, z) => Math.min(...WIL.map((w) => Math.hypot(x - w[0], z - w[1])));
    const inst = (x, z, s, flag, dy = 0, yaw = R() * TAU) => [x, this.hAt(x, z) + dy, z, s, yaw, 0, R(), flag];
    // trees
    const nTrees = [100, 150, 200][q], trees = [];
    for (const [x, z, s] of [[-5.5, 5, 1.1], [6.5, -3.5, 1.15], [-8.5, -5.5, 1.0], [8.5, -21, 1.2], [-14, -15, 1.05], [10.5, 9, 1.2], [-3.5, 17.5, 1.1], [14.5, 20, 1.1], [1.5, 29.5, 1.15], [6, -48.5, 1.0], ELDER]) trees.push([x, z, s]);
    for (let tries = 0; trees.length < nTrees && tries < 30000; tries++) {
      const ang = R() * TAU, rr = 6 + Math.sqrt(R()) * 108, x = Math.cos(ang) * rr, z = -10 + Math.sin(ang) * rr;
      const sap = trees.length > nTrees * 0.8, s = sap ? 0.35 + R() * 0.25 : R() < 0.12 ? 1.4 + R() * 0.3 : 0.8 + R() * 0.5;
      if (pathDist(x, z) < 2.6 + s || dDoor(x, z) < 6.5 || dWil(x, z) < 9 || !clearOf(x, z, 3.2) || dist2(x, z, HLOG) < 4 || pondD(x, z) < 10 || dist2(x, z, RING) < 9 || dist2(x, z, ELDER) < 11) continue;
      if (!sap && fbm2(x * 0.03 + 7, z * 0.03, 2) < -0.2 && R() < 0.85) continue;
      if ((s > 1.3 && !clearOf(x, z, 17)) || (sap && !clearOf(x, z, 7.5))) continue;                                      // giants stay off the routes      // groves and open glades
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.7 * (s + t[2]))) continue;
      trees.push([x, z, s]);
    }
    this.cats = [];
    const NV = 4, tInst = [[], [], [], []];
    this.treeCol = new Float32Array((trees.length + WIL.length + 7) * 3);
    this.treeGrid = Array.from({ length: 64 * 64 }, () => []);
    const addCol = (x, z, r, i) => { this.treeCol.set([x, z, r], i * 3); this.treeGrid[((Math.floor(x / 12) + 32) & 63) * 64 + ((Math.floor(z / 12) + 32) & 63)].push(i); };
    trees.forEach(([x, z, s], i) => {
      tInst[i % NV].push(...inst(x, z, s, 1, -0.1));
      addCol(x, z, 1.0 * s, i);
      emit.push(x, z, 0, 0, -1, 2.4 * s);
    });
    this.treeCats = tInst.map((a, v) => this.cat(ctx, this.mesh(ctx, laurel(v + 1, 0)), this.mesh(ctx, laurel(v + 1, 1)), a, 12, 105, 30));
    await progress(0.45);
    const wInst = [];
    WIL.forEach(([x, z, s], i) => {
      wInst.push(...inst(x, z, s, 1, -0.1));
      addCol(x, z, 0.9 * s, trees.length + i);
      emit.push(x, z, 0, 0, -1, 2.2 * s, x, z, WILC[0] * 0.22, WILC[1] * 0.22, WILC[2] * 0.22, 6.5 * s, x, z, WILC[0] * 0.3, WILC[1] * 0.3, WILC[2] * 0.3, 3 * s);
    });
    this.wilCat = this.cat(ctx, this.mesh(ctx, laurel(7, 0, 1)), this.mesh(ctx, laurel(7, 1, 1)), wInst, 12, 130, 40);
    this.strM = [this.mesh(ctx, laurel(7, 0, 2)), this.mesh(ctx, laurel(7, 1, 2))];
    await progress(0.55);

    // logs with mushrooms, shelf fungi on trunks, mushrooms at roots
    const logs = [[HLOG[0], HLOG[1], HLOG[2]], [DOOR[0] - 3.6, DOOR[1] + 1.2, 1.9], [-4.5, -19.5, 2.4], [7.5, 7, 1.2]];
    for (let tries = 0; logs.length < [10, 16, 22][q] && tries < 3000; tries++) {
      const a = R() * TAU, r = 8 + Math.sqrt(R()) * 55, x = Math.cos(a) * r, z = -8 + Math.sin(a) * r;
      if (pathDist(x, z) < 3 || dDoor(x, z) < 5 || !clearOf(x, z, 3.5) || trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.5) || logs.some((l) => Math.hypot(l[0] - x, l[1] - z) < 9)) continue;
      logs.push([x, z, R() * TAU]);
    }
    const logI = [], mush = [], shf = [], ferns = [], tf = [], rocks = [];
    this.logCol = new Float32Array(logs.length * 4);
    const addMush = (x, z, s, dy = 0, st = 1, hue = R() < 0.1 ? 1 + (R() * 2 | 0) : 0) => { if (this.poses.some((q, i) => i < 5 && Math.hypot(q.pos[0] - x, q.pos[2] - z) < 3.2)) return; const c = HUES[hue]; mush.push(...inst(x, z, s, 2, dy - 0.01)); mush[mush.length - 3] = hue; emit.push(x, z, c[0] * 0.8 * st, c[1] * 0.8 * st, c[2] * 0.8 * st, 1.0 + 0.45 * s); };
    logs.forEach(([x, z, yaw], i) => {
      logI.push(...inst(x, z, 1, 0, -0.06, yaw));
      const cx = Math.cos(yaw), sz = -Math.sin(yaw);       // rotY(yaw) maps local +X to (cos, 0, -sin)
      this.logCol.set([x - cx * 2, z - sz * 2, x + cx * 2, z + sz * 2], i * 4);
      const n = i === 0 ? 7 : 3 + (R() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.2 + R() * 0.6) / n * 4 - 2, top = R() < 0.6, o = top ? (R() - 0.5) * 0.2 : (R() < 0.5 ? -1 : 1) * (0.33 + R() * 0.2);
        addMush(x + cx * u - sz * o, z + sz * u + cx * o, (top ? 0.8 : 1.1) + R() * 0.9, top ? 0.5 : 0, i === 0 ? 1.3 : 1, 0);
      }
      emit.push(x, z, 0, 0, -0.5, 1.6);
    });
    this.logCat = this.cat(ctx, this.mesh(ctx, log(1)), null, logI, 3.5, 70, 99);
    trees.forEach(([x, z, s], i) => {
      const near = Math.hypot(x, z + 10) < 60;
      for (let k = 0; k < (near ? 2 : 1); k++) { const a = R() * TAU, r = (1.1 + R() * 1.6) * s; if (pathDist(x + Math.cos(a) * r, z + Math.sin(a) * r) > 1.3) addMush(x + Math.cos(a) * r, z + Math.sin(a) * r, 1 + R() * 1.4); }
      if (i % 3 !== 2 && s > 0.7 && s < 2) {
        const a = R() * TAU, gi = 0.8 + 0.5 * ((tInst[i % NV][((i / NV) | 0) * 8 + 6] * 11.3) % 1), r = 0.85 * s * gi, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
        shf.push(sx, this.hAt(x, z) + 0.7 + R() * 0.9, sz, 0.9 + R() * 0.8, Math.atan2(Math.cos(a), Math.sin(a)), 0, R(), 0);
        emit.push(sx, sz, MINT[0] * 0.3, MINT[1] * 0.3, MINT[2] * 0.3, 1.5);
      }
    });
    // along the path: mushrooms, ferns and tufts hugging the edges
    for (let k = 0; k < PATH.length - 1; k++) {
      const [ax, az] = PATH[k], [bx, bz] = PATH[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 1.1);
      for (let i = 0; i < n; i++) {
        const t = (i + R()) / n, sd = R() < 0.5 ? -1 : 1, off = 1.45 + R() * 1.6;
        const x = ax + (bx - ax) * t + (-(bz - az) / L) * sd * off, z = az + (bz - az) * t + ((bx - ax) / L) * sd * off;
        if (dDoor(x, z) < 1.6 || !clearOf(x, z, 0.9)) continue;
        const r = R();
        if (r < 0.22) addMush(x, z, 0.9 + R() * 1.3);
        else if (r < 0.7) ferns.push(...inst(x, z, 0.6 + R() * 0.9, 2, -0.04));
        else for (let j = 0; j < 4; j++) { const px = x + (R() - 0.5), pz = z + (R() - 0.5); tf.push(...inst(px, pz, 0.5 + R() * 0.6, 2)); }
      }
    }
    // door: fungi and stones at its foot, ferns framing it
    for (const sd of [-1, 1]) {
      addMush(DOOR[0] + sd * 1.35, DOOR[1] + 0.45, 1.2, 0, 1.3); addMush(DOOR[0] + sd * 1.9, DOOR[1] - 0.9, 0.9);
      ferns.push(...inst(DOOR[0] + sd * 1.7, DOOR[1] + 0.5, 1.5, 2, -0.04), ...inst(DOOR[0] + sd * 2.4, DOOR[1] - 0.6, 1.2, 2, -0.04));
      rocks.push(...inst(DOOR[0] + sd * 0.98, DOOR[1] + 0.05, 0.34, 0, -0.06), ...inst(DOOR[0] + sd * 1.45, DOOR[1] - 0.35, 0.24, 0, -0.04), ...inst(DOOR[0] + sd * (2.6 + sd * 0.3), DOOR[1] + 0.9, 0.55, 0, -0.2));
    }
    // --- landmarks ---
    const flower = (x, z) => { tf.push(...inst(x, z, 0.6 + R() * 0.7, 2)); tf[tf.length - 3] = 1; };
    // standing-stone ring in a moon shaft, with a fairy ring of violet fungi and star flowers inside
    const men = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3, x = RING[0] + Math.cos(a) * 4.3, z = RING[1] + Math.sin(a) * 4.3;
      men.push(x, this.hAt(x, z) - 0.25, z, 0.9 + R() * 0.7, Math.atan2(Math.cos(a), Math.sin(a)) + (R() - 0.5) * 0.5, 0, R(), 0);
      addCol(x, z, 0.6, trees.length + WIL.length + k); emit.push(x, z, 0, 0, -0.7, 1.2);
    }
    this.menCat = this.cat(ctx, this.mesh(ctx, fromCore(ctx.mesh.scale(ctx.mesh.rock(5, 2, 0.22), 0.5, 1.7, 0.36), [7, 0, 0, 0.5])), null, men, 3, 110, 99);
    for (let k = 0; k < 11; k++) { const a = (k / 11) * TAU; addMush(RING[0] + Math.cos(a) * 1.9, RING[1] + Math.sin(a) * 1.9, 0.9 + R() * 0.7, 0, 1, 2); }
    for (let k = 0; k < 26; k++) { const a = R() * TAU, r = Math.sqrt(R()) * 3.4; flower(RING[0] + Math.cos(a) * r, RING[1] + Math.sin(a) * r); }
    // giant elder: amber fungi among its roots (the lantern creatures live here)
    for (let k = 0; k < 9; k++) { const a = R() * TAU, r = 3 + R() * 2.5; addMush(ELDER[0] + Math.cos(a) * r, ELDER[1] + Math.sin(a) * r, 1.2 + R(), 0, 1.2, 1); }
    // mirror pond: stones, ferns and star flowers on the shore
    for (let k = 0; k < 46; k++) {
      const a = R() * TAU, e = 6.3 + R() * 1.6, x = POND[0] + Math.cos(a) * e * 1.25, z = POND[1] + Math.sin(a) * e;
      if (k < 14) { const sc = 0.25 + R() * 0.6; rocks.push(x, this.hAt(x, z) - sc * 0.3, z, sc, R() * TAU, 0, R(), 0); }
      else if (k < 22) ferns.push(...inst(x, z, 0.6 + R() * 0.6, 2, -0.04));
      else flower(x, z);
    }
    addMush(POND[0] - 9, POND[1] + 2.5, 1.4, 0, 1.2, 0); addMush(POND[0] + 6, POND[1] - 6.5, 1.2, 0, 1.2, 2);
    // undergrowth: ferns around trunks and stones, tufts, mossy rocks
    const okSpot = (x, z, rp) => pathDist(x, z) > rp && dDoor(x, z) > 1.8 && clearOf(x, z, 0.9) && Math.hypot(x, z + 10) < 76 && pondD(x, z) > 6.6 && dist2(x, z, RING) > 2.6;
    for (let i = 0; i < [260, 520, 740][q]; i++) {
      let x, z;
      if (R() < 0.6) { const t = trees[R() * trees.length | 0], a = R() * TAU, r = (1.2 + R() * 4.5) * t[2]; x = t[0] + Math.cos(a) * r; z = t[1] + Math.sin(a) * r; }
      else { const a = R() * TAU, r = Math.sqrt(R()) * 60; x = Math.cos(a) * r; z = -8 + Math.sin(a) * r; }
      if (!okSpot(x, z, 1.5)) continue;
      // ferns grow in clumps of a few sizes
      for (let j = 0, n = 1 + (R() * 4 | 0); j < n; j++) {
        const big = R(), px = x + (R() - 0.5) * 1.5 * (j > 0), pz = z + (R() - 0.5) * 1.5 * (j > 0);
        if (okSpot(px, pz, 1.4)) ferns.push(...inst(px, pz, 0.4 + big * big * big * 1.4, 2, -0.04));
      }
    }
    this.fernCat = this.cat(ctx, this.mesh(ctx, fern(1)), null, ferns, 1.4, 46, 99);
    for (let i = 0; i < [500, 1000, 1500][q]; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 40, x = Math.cos(a) * r + this.spawn.pos[0], z = -6 + Math.sin(a) * r;
      if (!okSpot(x, z, 1.3)) continue;
      for (let j = 0; j < 2; j++) { const px = x + (R() - 0.5) * 0.9, pz = z + (R() - 0.5) * 0.9; tf.push(...inst(px, pz, 0.45 + R() * 0.7, 2)); if (i % 9 === 0) tf[tf.length - 3] = 1; }
    }
    this.tuftCat = this.cat(ctx, this.mesh(ctx, tuft(2)), null, tf, 0.5, 22, 99);
    for (let i = 0; i < [220, 420, 600][q]; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 70, x = Math.cos(a) * r, z = -8 + Math.sin(a) * r;
      if (!okSpot(x, z, 1.6)) continue;
      const big = R(), sc = 0.07 + big * big * big * big * 1.35;
      if (sc > 0.5 && !clearOf(x, z, 3)) continue;
      rocks.push(x, this.hAt(x, z) - sc * 0.4, z, sc, R() * TAU, 0, R(), 0);
      if (sc > 0.6) { emit.push(x, z, 0, 0, -0.5, sc * 1.5); if (R() < 0.6) addMush(x + sc * 0.9, z + (R() - 0.5), 1 + R()); }
    }
    this.rockCat = this.cat(ctx, this.mesh(ctx, fromCore(ctx.mesh.scale(ctx.mesh.rock(11, 2, 0.4), 1, 0.7, 1), [7, 0, 0, 0.5])), null, rocks, 1.3, 90, 99);
    this.mushCat = this.cat(ctx, this.mesh(ctx, mushrooms(3)), null, mush, 0.7, 42, 99);
    this.shelfCat = this.cat(ctx, this.mesh(ctx, shelf(2)), null, shf, 1, 50, 99);
    await progress(0.7);

    // ---------- lightmap: rgb = baked glow, a = contact occlusion ----------
    const LMN = 256, lm = new Float32Array(LMN * LMN * 4), cs = WSIZE / LMN;
    for (let k = 0; k < emit.length; k += 6) {
      const x = emit[k], z = emit[k + 1], r = emit[k + 5], occ = emit[k + 4] < 0;
      const gi = (x / WSIZE + 0.5) * LMN - 0.5, gj = (z / WSIZE + 0.5) * LMN - 0.5, rr = Math.ceil((r * 2.2) / cs);
      for (let j = Math.max(0, Math.floor(gj) - rr); j <= Math.min(LMN - 1, Math.ceil(gj) + rr); j++)
        for (let i = Math.max(0, Math.floor(gi) - rr); i <= Math.min(LMN - 1, Math.ceil(gi) + rr); i++) {
          const w = Math.exp(-(((i - gi) ** 2 + (j - gj) ** 2) * cs * cs) / (r * r)), o = (j * LMN + i) * 4;
          if (occ) lm[o + 3] += w * -emit[k + 4];
          else { lm[o] += emit[k + 2] * w; lm[o + 1] += emit[k + 3] * w; lm[o + 2] += emit[k + 4] * w; }
        }
    }
    const lh = new Uint16Array(lm.length); for (let i = 0; i < lm.length; i++) lh[i] = toHalf(i % 4 === 3 ? Math.min(lm[i], 3) : lm[i] / (1 + 1.4 * lm[i]));
    const lmap = ctx.texture(LMN, LMN, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: lmap }, lh, { bytesPerRow: LMN * 8 }, [LMN, LMN]);

    // ---------- spirits ----------
    this.deerM = this.mesh(ctx, deer()); this.lanM = this.mesh(ctx, lantern());
    this.lanHome = new Float32Array([13, -15, 15.5, -17, 12, -18.5, ELDER[0] + 3.6, ELDER[1] + 1, ELDER[0] - 1, ELDER[1] + 3.8, ELDER[0] + 1.5, ELDER[1] - 3.6]);
    this.wispHome = new Float32Array(16);
    [[0, 0], [-32, 1], [-29, -9], [-37, -5], [POND[0] + 1, POND[1] - 2], [POND[0] + 5, POND[1] + 3], [-12, -58], [34, -24]].forEach((w, i) => this.wispHome.set(w, i * 2));
    this.plen = new Float32Array(PATH.length);
    for (let i = 1; i < PATH.length; i++) this.plen[i] = this.plen[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]);
    this.pathF = new Float32Array(PATH.flat());
    this.guide = new Float32Array([0, 0, 0]);
    this.dst = new Float32Array(8);     // per deer: lag, look, head turn, chimed
    this.t2 = new Float32Array(2); this.t3 = new Float32Array(2);

    // ---------- uniforms, bind groups, pipelines ----------
    this.U = new Float32Array(232);
    this.ub = ctx.buffer(928, 'uniform');
    const U = this.U;
    U.set([1, 0.045, 0.0075, 1.15], 0);
    SHAFTS.forEach((s, i) => U.set(s, 4 + i * 4));
    U.set([DOOR[0], this.hAt(DOOR[0], DOOR[1]), DOOR[1], 0], 28);
    for (let i = 0; i < 16; i++) { U[32 + i * 4 + 3] = i < 2 ? 3.6 : i < 8 ? 2.6 : 3.6; U.set(i < 2 ? [0.8, 1.15, 1.25] : i < 8 ? [1.0, 0.6, 0.2] : [0.3, 0.42, 0.48], 96 + i * 4); }
    const lin = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const rep = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
    this.cL = ctx.layout(['uniform', 'texture', 'texture', 'texture', 'sampler', 'sampler']);
    this.cBG = ctx.bindGroup(this.cL, [this.ub, hmap.createView(), lmap.createView(), ntex.createView(), lin, rep]);
    this.dL = ctx.layout(['texture-depth']);
    const head = `const WIL = array<vec4f, 3>(${WIL.map((w) => `vec4f(${w[0]}, ${this.hAt(w[0], w[1]).toFixed(2)}, ${w[1]}, ${w[2]})`)
      .join(',')});\nconst WY = ${WY.toFixed(3)};\n`;
    this.nFly = [900, 1600, 2600][q];
    const sh = (c, l) => ctx.rawShader('diagnostic(off, derivative_uniformity);\n' + ctx.wgsl.prelude + head + COMMON + c, l);
    const om = sh(SCENE, 'spirit-scene'), fm = sh(FX, 'spirit-fx');
    const L = [this.cL], VB = [VLAYOUT], VBI = [VLAYOUT, ILAYOUT];
    const P = (module, vs, fs, o = {}) => ctx.pipelineAsync({ module, vs, fs, layouts: L, cull: 'none', label: vs, ...o });
    [this.pTerr, this.pObj, this.pSky, this.pMist, this.pDeer, this.pLan, this.pHalo, this.pWisp, this.pFly, this.pDeerZ, this.pLanZ, this.pStr, this.pWat] = await Promise.all([
      P(om, 'vsTerrain', 'fsTerrain', { buffers: VB, cull: 'back' }), P(om, 'vsObj', 'fsObj', { buffers: VBI }), P(om, 'vsSky', 'fsSky', { depthWrite: false }),
      P(fm, 'vsMist', 'fsMist', { layouts: [this.cL, this.dL], blend: 'premul', depthFormat: null }),
      P(fm, 'vsDeer', 'fsBeing', { buffers: VB, blend: 'add', cull: 'back' }), P(fm, 'vsLan', 'fsBeing', { buffers: VB, blend: 'add' }),
      P(fm, 'vsHalo', 'fsHalo', { blend: 'add' }), P(fm, 'vsWisp', 'fsWisp', { blend: 'add' }), P(fm, 'vsFly', 'fsFly', { blend: 'add' }),
      P(fm, 'vsDeer', 'fsBeingZ', { buffers: VB, blend: 'add', depthWrite: true, cull: 'back' }), P(fm, 'vsLan', 'fsBeingZ', { buffers: VB, blend: 'add', depthWrite: true }),
      P(om, 'vsObj', 'fsStrand', { buffers: VBI, blend: 'add' }), P(om, 'vsTerrain', 'fsWater', { buffers: VB }),
    ]);
    this.watM = this.mesh(ctx, fromCore(ctx.mesh.translate(ctx.mesh.plane(19, 15, 1, 1), POND[0], WY, POND[1]), [0, 0, 0, 0]));
    this.resize(ctx);
    await progress(1);
  },

  mesh(ctx, g) { return { vb: ctx.buffer(g.v, 'vertex'), ib: ctx.buffer(g.i, 'index'), n: g.i.length }; },
  // instance category with CPU frustum/distance culling and two LODs
  cat(ctx, m0, m1, arr, rad, maxD, lodD) {
    const src = new Float32Array(arr), n = src.length / 8;
    const c = { m0, m1: m1 || m0, src, n, rad, maxD, lodD, out0: new Float32Array(src.length), out1: new Float32Array(src.length), n0: 0, n1: 0,
      b0: ctx.buffer(Math.max(32, src.byteLength), 'vertex'), b1: ctx.buffer(Math.max(32, src.byteLength), 'vertex') };
    this.cats.push(c);
    return c;
  },
  cull(ctx, cam) {
    const px = cam.eye[0], py = cam.eye[1], pz = cam.eye[2], f = cam.fwd;
    const th = Math.tan(cam.fov / 2), cosA = Math.cos(Math.atan(th * Math.sqrt(1 + (ctx.width / ctx.height) ** 2))), sinA = Math.sqrt(1 - cosA * cosA);
    for (let ci = 0; ci < this.cats.length; ci++) {
      const c = this.cats[ci], s = c.src, o0 = c.out0, o1 = c.out1;
      let n0 = 0, n1 = 0;
      for (let i = 0; i < c.n; i++) {
        const k = i * 8, dx = s[k] - px, dy = s[k + 1] + c.rad * s[k + 3] * 0.5 - py, dz = s[k + 2] - pz, r = c.rad * s[k + 3] + 1;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > c.maxD + r) continue;
        if (d > r) { const along = dx * f[0] + dy * f[1] + dz * f[2]; if (Math.sqrt(Math.max(0, d * d - along * along)) * cosA - along * sinA > r) continue; }
        if (d < c.lodD) { for (let j = 0; j < 8; j++) o0[n0 * 8 + j] = s[k + j]; n0++; }
        else { for (let j = 0; j < 8; j++) o1[n1 * 8 + j] = s[k + j]; n1++; }
      }
      c.n0 = n0; c.n1 = n1;
      if (n0) ctx.queue.writeBuffer(c.b0, 0, o0.buffer, 0, n0 * 32);
      if (n1) ctx.queue.writeBuffer(c.b1, 0, o1.buffer, 0, n1 * 32);
    }
  },
  resize(ctx) {
    if (!ctx.depthView || !this.dL) return;
    this.dv = ctx.depthView;
    this.mistBG = ctx.bindGroup(this.dL, [ctx.depthView]);
    this.passA = { colorAttachments: [{ view: ctx.hdrView, loadOp: 'load', storeOp: 'store' }] };
    this.passB = { colorAttachments: [{ view: ctx.hdrView, loadOp: 'load', storeOp: 'store' }], depthStencilAttachment: { view: ctx.depthView, depthReadOnly: true } };
  },

  update(ctx, dt, t, cam) {
    const U = this.U, cx = cam.eye[0], cz = cam.eye[2], au = ctx.audio, S = this.dst, A = this.t2, B = this.t3;
    U[31] = ctx.doors && ctx.doors[0] ? ctx.doors[0].open : 0;
    // deer spirits: wander their loops; when the visitor comes near they stop, look, then walk on
    for (let i = 0; i < 2; i++) {
      const o = i * 4, s = DSPEED * t - S[o];
      loopPos(i, s, A); loopPos(i, s + 0.4, B);
      const x = A[0], z = A[1], yaw = Math.atan2(-(B[0] - x), -(B[1] - z)), d = Math.hypot(cx - x, cz - z);
      const want = ss(19, 11, d) * (0.55 + 0.45 * Math.sin(t * 0.07 + i * 2));      // attention comes and goes
      const k = 1 - Math.exp(-dt / 1.6);
      S[o + 1] += (Math.max(want, 0) - S[o + 1]) * k;
      S[o] += DSPEED * 0.94 * S[o + 1] * dt;
      const rel = Math.max(-1.7, Math.min(1.7, wrapA(yawTo(x, z, cx, cz) - yaw)));
      S[o + 2] += (rel * Math.min(1, S[o + 1] * 1.6) - S[o + 2]) * (1 - Math.exp(-dt / 0.9));
      const y = this.hAt(x, z);
      U[160 + o] = x; U[161 + o] = y - 0.02; U[162 + o] = z; U[163 + o] = yaw;
      U[168 + o] = S[o + 2]; U[169 + o] = s / 1.7; U[170 + o] = 1 - 0.94 * S[o + 1]; U[171 + o] = 0.85 + 0.15 * Math.sin(t * 0.5 + i) + 0.35 * S[o + 1];
      U[32 + o] = x; U[33 + o] = y + 0.7; U[34 + o] = z;
      if (au && S[o + 1] > 0.5 && S[o + 3] === 0) { S[o + 3] = 1; this.chime(au, x, y + 2.5, z); }
      if (S[o + 1] < 0.15) S[o + 3] = 0;
    }
    // lantern creatures: drift in small groups, turn toward the visitor
    for (let i = 0; i < 6; i++) {
      const hx = this.lanHome[i * 2], hz = this.lanHome[i * 2 + 1], a = t * (0.05 + 0.011 * i) + i * 2.4, b = t * (0.037 + 0.007 * i) + i * 1.3, w = i < 3 ? 2.6 : 1;
      const x = hx + Math.sin(a) * w + Math.sin(b * 2.3) * 0.8, z = hz + Math.cos(b) * w + Math.cos(a * 1.7) * 0.8;
      const y = this.hAt(x, z) + 0.95 + 0.4 * (i % 3) + 0.14 * Math.sin(t * 0.8 + i * 1.9);
      const o = 176 + i * 4, d = Math.hypot(cx - x, cz - z);
      U[o] = x; U[o + 1] = y; U[o + 2] = z;
      U[o + 3] = a + wrapA(yawTo(x, z, cx, cz) - a) * ss(14, 6, d);
      U[40 + i * 4] = x; U[41 + i * 4] = y - 0.2; U[42 + i * 4] = z;
    }
    // wisps: hover far off, recede when approached; wisp 0 waits a little ahead on the path
    const PF = this.pathF, PL = this.plen, n = PL.length;
    let best = 1e9, arc = 0;
    for (let i = 0; i < n - 1; i++) {
      const ax = PF[i * 2], az = PF[i * 2 + 1], vx = PF[i * 2 + 2] - ax, vz = PF[i * 2 + 3] - az;
      const h = Math.min(1, Math.max(0, ((cx - ax) * vx + (cz - az) * vz) / (vx * vx + vz * vz))), d = Math.hypot(cx - ax - vx * h, cz - az - vz * h);
      if (d < best) { best = d; arc = PL[i] + h * (PL[i + 1] - PL[i]); }
    }
    const G = this.guide;
    if (best < 9 || G[2] === 0) {
      const ta = Math.min(arc + 15, PL[n - 1] - 2);
      let i = 0; while (i < n - 2 && PL[i + 1] < ta) i++;
      const h = (ta - PL[i]) / (PL[i + 1] - PL[i]), tx = mix(PF[i * 2], PF[i * 2 + 2], h), tz = mix(PF[i * 2 + 1], PF[i * 2 + 3], h);
      const k = G[2] === 0 || ctx.shot ? 1 : 1 - Math.exp(-dt / 3.5);
      G[0] += (tx - G[0]) * k; G[1] += (tz - G[1]) * k; G[2] = 1;
    }
    for (let i = 0; i < 8; i++) {
      let x = i ? this.wispHome[i * 2] : G[0], z = i ? this.wispHome[i * 2 + 1] : G[1];
      x += Math.sin(t * 0.11 + i * 1.9) * (i ? 3 : 0.6) + Math.sin(t * 0.31 + i) * 0.5; z += Math.cos(t * 0.09 + i * 2.7) * (i ? 3 : 0.6) + Math.cos(t * 0.27 + i * 3) * 0.5;
      const vx = x - cx, vz = z - cz, d = Math.hypot(vx, vz) + 1e-3, push = i ? ss(17, 5, d) * 9 : ss(7, 2, d) * 5;
      x += (vx / d) * push; z += (vz / d) * push;
      const y = Math.max(this.hAt(x, z), i === 4 || i === 5 ? WY : -99) + 1.35 + 0.35 * Math.sin(t * 0.43 + i * 2.2) + 0.25 * (i % 3);
      const o = 200 + i * 4, br = (0.7 + 0.3 * Math.sin(t * 0.6 + i * 1.3)) * ss(2.5, 6, d + push);
      U[o] = x; U[o + 1] = y; U[o + 2] = z; U[o + 3] = br;
      const l = 64 + i * 4; U[l] = x; U[l + 1] = y; U[l + 2] = z;
      U[96 + 32 + i * 4] = 0.3 * br; U[97 + 32 + i * 4] = 0.42 * br; U[98 + 32 + i * 4] = 0.48 * br;
    }
    ctx.write(this.ub, U);
    this.cull(ctx, cam);
  },

  drawCat(pass, c) {
    if (c.n0) { pass.setVertexBuffer(0, c.m0.vb); pass.setVertexBuffer(1, c.b0); pass.setIndexBuffer(c.m0.ib, 'uint32'); pass.drawIndexed(c.m0.n, c.n0); }
    if (c.n1) { pass.setVertexBuffer(0, c.m1.vb); pass.setVertexBuffer(1, c.b1); pass.setIndexBuffer(c.m1.ib, 'uint32'); pass.drawIndexed(c.m1.n, c.n1); }
  },
  render(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    pass.setPipeline(this.pObj);
    for (let i = 0; i < this.cats.length; i++) this.drawCat(pass, this.cats[i]);
    pass.setPipeline(this.pTerr); pass.setVertexBuffer(0, this.terr.vb); pass.setIndexBuffer(this.terr.ib, 'uint32'); pass.drawIndexed(this.terr.n);
    pass.setPipeline(this.pWat); pass.setVertexBuffer(0, this.watM.vb); pass.setIndexBuffer(this.watM.ib, 'uint32'); pass.drawIndexed(this.watM.n);
    pass.setPipeline(this.pSky); pass.draw(3);
  },
  renderTransparent(ctx, p) {
    p.setBindGroup(1, this.cBG);
    p.setVertexBuffer(0, this.deerM.vb); p.setIndexBuffer(this.deerM.ib, 'uint32');
    p.setPipeline(this.pDeerZ); p.drawIndexed(this.deerM.n, 2);
    p.setPipeline(this.pDeer); p.drawIndexed(this.deerM.n, 2);
    p.setVertexBuffer(0, this.lanM.vb); p.setIndexBuffer(this.lanM.ib, 'uint32');
    p.setPipeline(this.pLanZ); p.drawIndexed(this.lanM.n, 6);
    p.setPipeline(this.pLan); p.drawIndexed(this.lanM.n, 6);
  },
  afterScene(ctx, enc) {
    if (this.dv !== ctx.depthView) this.resize(ctx);
    const w = ctx.renderWidth, h = ctx.renderHeight;
    let p = enc.beginRenderPass(this.passA);
    p.setViewport(0, 0, w, h, 0, 1); p.setScissorRect(0, 0, w, h);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.cBG); p.setBindGroup(2, this.mistBG);
    p.setPipeline(this.pMist); p.draw(3); p.end();
    p = enc.beginRenderPass(this.passB);
    p.setViewport(0, 0, w, h, 0, 1); p.setScissorRect(0, 0, w, h);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.cBG);
    const wc = this.wilCat, sm = this.strM;
    p.setPipeline(this.pStr);
    if (wc.n0) { p.setVertexBuffer(0, sm[0].vb); p.setVertexBuffer(1, wc.b0); p.setIndexBuffer(sm[0].ib, 'uint32'); p.drawIndexed(sm[0].n, wc.n0); }
    if (wc.n1) { p.setVertexBuffer(0, sm[1].vb); p.setVertexBuffer(1, wc.b1); p.setIndexBuffer(sm[1].ib, 'uint32'); p.drawIndexed(sm[1].n, wc.n1); }
    p.setPipeline(this.pHalo); p.draw(6, 101);
    p.setPipeline(this.pWisp); p.draw(6, 8);
    p.setPipeline(this.pFly); p.draw(6, this.nFly);
    p.end();
  },

  chime(a, x, y, z) {
    const s = this.cs || (this.cs = a.spatial({ pos: [x, y, z], ref: 9, reverb: 0.85 }));
    s.setPos(x, y, z);
    const n = this.notes, t = a.now();
    for (let i = 0; i < 3; i++) a.bell({ freq: a.hz(n[(a.rng() * n.length) | 0]), gain: 0.022, decay: 6, ratio: 2.01, index: 1.1, when: t + i * (0.35 + a.rng() * 0.4), bus: s });
  },
  audio(ctx, a) {
    this.notes = a.scale(69, 'pentatonic', 2);
    a.setReverb({ seconds: 5.5, damp: 0.6, wet: 0.85 });
    // night bed: low air, a soft shimmer of crickets, wind moving through the crowns
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 240, gain: 0.04, mod: 0.3 });
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 4700, q: 4, gain: 0.009, mod: 0.12, modRate: 0.09, gainMod: 0.6 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 520, q: 0.7, gain: 0.05, mod: 0.55, modRate: 0.045, gainMod: 0.6 });
    a.noiseBed({ color: 'pink', filter: 'highpass', freq: 2400, gain: 0.006, mod: 0.4, modRate: 0.07, gainMod: 0.8 });
    // airy pad
    a.drone({ freq: a.hz(33), partials: [1, 2, 3.01, 4.98], gain: 0.02, cutoff: 420 });
    a.pad({ chords: [[57, 64, 69, 72, 76], [53, 60, 65, 69, 72], [55, 62, 67, 71, 74], [52, 59, 64, 67, 71]], gain: 0.026, change: [20, 36], cutoff: 950, attack: 8, type: 'sine', reverb: 0.8 });
    // crickets, sparse and soft
    a.every(4, 11, (when) => a.chirp({ f0: 4100 + a.rng() * 500, f1: 4300, dur: 0.045, repeat: 3 + a.rng.int(5), gap: 0.05, gain: 0.005, when, pan: a.rng.range(-0.9, 0.9), reverb: 0.4 }));
    // a distant owl
    a.every(35, 80, (when) => {
      const f = 300 + a.rng() * 40, pan = a.rng.range(-0.8, 0.8);
      a.chirp({ f0: f, f1: f * 0.93, dur: 0.32, repeat: 1, vib: 3, vibRate: 5, gain: 0.011, when, pan, reverb: 0.9 });
      a.chirp({ f0: f * 0.97, f1: f * 0.88, dur: 0.5, repeat: 1, vib: 3, vibRate: 5, gain: 0.012, when: when + 0.55, pan, reverb: 0.9 });
    }, { startDelay: 18 });
    // the pond: a drop now and then; the stone ring: a low, far bell
    const ps = a.spatial({ pos: [POND[0], WY, POND[1]], ref: 6, reverb: 0.6 }), rs = a.spatial({ pos: [RING[0], 1, RING[1]], ref: 8, reverb: 0.9 });
    a.every(5, 14, (when) => a.chirp({ f0: 1100 + a.rng() * 500, f1: 520, dur: 0.06, repeat: 1, vib: 0, gain: 0.02, when, bus: ps }));
    a.every(22, 50, (when) => a.bell({ freq: a.hz(45 + a.rng.int(3) * 5), gain: 0.03, decay: 9, ratio: 1.5, index: 0.6, when, bus: rs }));
    // rare spirit chimes
    a.every(16, 38, (when) => {
      const n = a.rng.pick(this.notes);
      a.bell({ freq: a.hz(n + 12), gain: 0.009, decay: 7, ratio: 3.01, index: 0.7, when, pan: a.rng.range(-0.7, 0.7), reverb: 0.95 });
      if (a.rng() < 0.5) a.bell({ freq: a.hz(n + 19), gain: 0.006, decay: 7, ratio: 3.01, index: 0.6, when: when + 0.6 + a.rng() * 0.5, pan: a.rng.range(-0.7, 0.7), reverb: 0.95 });
    }, { startDelay: 8 });
  },
};
