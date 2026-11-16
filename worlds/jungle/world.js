// Bioluminescent jungle with a waterfall lagoon. See NOTES.md.
import { fbm2, pcg, u2f } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { VLAYOUT, ILAYOUT, tree, frond, fan, spiral, lotus, pad, fish, frog, mushrooms, shrub, rosette, lantern, reed, tuft, fromCore, gmush, lemur, bird, snail, bridge, deckY } from './geo.js';
import COMMON from './common.wgsl';
import OPAQUE from './opaque.wgsl';
import FX from './fx.wgsl';

const WSIZE = 280, HN = 257, TAU = Math.PI * 2;
const LAG = [0, -36, 21, 13];                       // lagoon centre x, z and radii
const WFX = 2.5;                                     // waterfall x
const DOOR = [9.5, 17];
const PATH = [[-1, -20], [1.5, -6], [4, 6], [5.5, 18], [2.5, 31], [-2.5, 43], [-4, 56], [0.5, 70], [4, 84]];
const SPUR = [[4.9, 12.5], [9.5, 15.2]];             // stepping stones from the path to the door
// places beyond the lagoon: mushroom grove, ravine with a vine bridge (along x at z = BRZ), giant flower knoll, moon pool
const GRV = [-44, 14], POOL = [31, 35, 7, 5.5], FLW = [56, -8], BRA = 35, BRB = 45, BRZ = -4;
const RAV = [[36, -30], [39, -14], [40, -4], [42, 8], [47, 20]];
const TRAILS = [[[0, -12], [-11, -5], [-22, 3], [-31, 8.5], [-38, 12.5]], [[2.5, 31], [11, 37], [19, 37.5], [24.5, 36]], [[2.2, -3], [12, -6], [22, -5], [30, -4.3], [35, -4]], [[45, -4], [50, -5.5], [53.5, -7]]];
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function cliffInfo(x, z) {
  const dx = x - LAG[0], dz = z - LAG[1];
  const a = Math.atan2(dx, -dz), rc = Math.hypot(dx * 0.62, dz);
  const am = ss(1.45, 0.8, Math.abs(a));
  const edge = 13.4 + 1.1 * fbm2(a * 2.5, 1.3, 2);
  return [rc, am, edge, a];
}
function polyD(x, z, P) { let d = 1e9; for (let i = 0; i < P.length - 1; i++) d = Math.min(d, segD(x, z, P[i], P[i + 1])); return d; }
const poolE = (x, z) => Math.hypot((x - POOL[0]) / POOL[2], (z - POOL[1]) / POOL[3]);
const trailD = (x, z) => Math.min(polyD(x, z, TRAILS[0]), polyD(x, z, TRAILS[1]), polyD(x, z, TRAILS[2]), polyD(x, z, TRAILS[3]));
// spots the new places keep clear of the original scatter (c = clearance of the thing being placed; trees use > 3)
const dead = (x, z, c) => polyD(x, z, RAV) < 5.4 + 0.4 * c || trailD(x, z) < c || poolE(x, z) < 1.1 + 0.08 * c || Math.hypot(x - FLW[0], z - FLW[1]) < 2.2 + c ||
  (c > 3 && (Math.hypot(x - GRV[0], z - GRV[1]) < 12 || Math.hypot(x - POOL[0], z - POOL[1]) < 11 || Math.hypot(x - FLW[0], z - FLW[1]) < 9));
function terrain(x, z) {
  let h = 0.3 + 0.75 * fbm2(x * 0.03, z * 0.03, 3) + 0.2 * fbm2(x * 0.13 + 5.2, z * 0.13 - 1.7, 2);
  const r = Math.hypot(x * 0.9, z + 8);
  h += 10 * ss(24, 110, r) + 3 * ss(40, 100, r) * fbm2(x * 0.02 + 9, z * 0.02, 3);
  const ex = (x - LAG[0]) / LAG[2], ez = (z - LAG[1]) / LAG[3];
  const e = Math.hypot(ex, ez) + 0.06 * fbm2(x * 0.1, z * 0.1, 2);
  h = mix(h, -0.3 - 1.7 * ss(0.95, 0.35, e), ss(1.25, 0.93, e));
  const [rc, am, edge, a] = cliffInfo(x, z);
  const c = ss(edge, edge + 3.4, rc) * am;
  if (c > 0) {
    let top = 14.5 + 2.2 * fbm2(x * 0.05, z * 0.05, 3) + 5 * ss(20, 40, rc) - 1.5 * Math.exp(-(((x - WFX) / 3.3) ** 2)) * ss(18, 16.5, rc);
    top += c * (1 - c) * 6 * fbm2(a * 14, rc * 0.25, 2);
    h = mix(h, Math.max(h, top), c);
  }
  const dd = Math.hypot(x - DOOR[0], z - DOOR[1]);
  if (dd < 7) h = mix(h, 0.55, 1 - ss(2.5, 7, dd));
  if (x > 20) {
    const rv = polyD(x, z, RAV);
    if (rv < 8) h -= (5.2 + 1.2 * fbm2(x * 0.07, z * 0.07 + 4, 2)) * ss(4.8, 1.7, rv + 0.7 * fbm2(x * 0.16 + 3, z * 0.16, 2) * ss(2.5, 8, Math.abs(z - BRZ)));
    const pd = Math.hypot(x - POOL[0], z - POOL[1]);
    if (pd < 16) {
      h = mix(h, 0.4, ss(16, 9, pd));
      const e2 = poolE(x, z) + 0.07 * fbm2(x * 0.2, z * 0.2, 2);
      h = mix(h, -0.25 - 0.9 * ss(0.95, 0.3, e2), ss(1.2, 0.9, e2));
    }
    h += 0.8 * Math.exp(-((x - FLW[0]) ** 2 + (z - FLW[1]) ** 2) / 30);
  }
  return h;
}
const hp = (x, z, dy) => [x, Math.max(terrain(x, z), -0.55) + dy, z];
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function segD(x, z, [ax, az], [bx, bz]) {
  const vx = bx - ax, vz = bz - az, h = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - ax - vx * h, z - az - vz * h);
}
function pathDist(x, z) {
  let d = segD(x, z, SPUR[0], SPUR[1]) + 0.25;
  for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segD(x, z, PATH[i], PATH[i + 1]));
  return d;
}
const lagE = (x, z) => Math.hypot((x - LAG[0]) / LAG[2], (z - LAG[1]) / LAG[3]);
const inClearing = (x, z) => Math.hypot(x / 17, (z + 4) / 15);

function toHalf(v) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = v; const x = u[0];
  const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; const m = (x >>> 13) & 0x3ff;
  if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | m;
}

const SPAWN = hp(0, -9, 1.6), YA = terrain(BRA, BRZ), YB = terrain(BRB, BRZ);
export default {
  id: 'jungle',
  title: 'Bioluminiscenčná džungľa',
  movement: 'walk',
  spawn: { pos: SPAWN, yaw: 0, pitch: 0.02 },
  poses: [
    { pos: hp(-15, -15, 2.8), yaw: yawTo(-15, -15, 2.5, -50), pitch: 0.06, t: 14 },
    { pos: hp(-5, -26.2, 1.15), yaw: yawTo(-5, -26.2, -1.8, -30), pitch: -0.24, t: 31 },
    { pos: hp(-32.5, 9.3, 1.6), yaw: yawTo(-32.5, 9.3, -42.5, 14.5), pitch: 0.2, t: 22 },
    { pos: hp(33.4, -4.1, 1.7), yaw: yawTo(33.4, -4.1, 45, -4), pitch: -0.1, t: 40 },
    { pos: hp(22.6, 36.4, 1.55), yaw: yawTo(22.6, 36.4, 31, 35), pitch: -0.12, t: 52 },
    { pos: hp(47.6, -4.6, 1.6), yaw: yawTo(47.6, -4.6, FLW[0], FLW[1]), pitch: 0.02, t: 18 },
  ],
  flythrough: [
    { pos: hp(0, -9, 1.8), yaw: 0, pitch: 0 }, { pos: hp(-8, -20, 1.8), yaw: -0.3, pitch: -0.05 },
    { pos: hp(-6, -30, 1.6), yaw: -0.6, pitch: -0.15 }, { pos: hp(6, -38, 1.6), yaw: 0.2, pitch: 0.15 },
    { pos: hp(16, -34, 2), yaw: 1.2, pitch: 0.05 }, { pos: hp(21, -16, 1.8), yaw: 2.6, pitch: -0.05 },
    { pos: hp(24, -5.5, 1.8), yaw: 4.6, pitch: 0 }, { pos: hp(33, -4.2, 1.8), yaw: 4.7, pitch: -0.1 },
    { pos: [40, YA + 1.3, BRZ], yaw: 4.7, pitch: -0.2 }, { pos: hp(47, -4.4, 1.8), yaw: 4.6, pitch: 0 },
    { pos: hp(51.5, -3.5, 1.8), yaw: 4.0, pitch: 0 }, { pos: hp(52, 6, 2.2), yaw: 3.0, pitch: -0.1 },
    { pos: [45, YB + 3, 16], yaw: 2.6, pitch: -0.3 }, { pos: hp(38, 28, 2), yaw: 2.4, pitch: -0.1 },
    { pos: hp(26, 39, 1.7), yaw: 1.2, pitch: -0.1 }, { pos: hp(12, 37, 1.7), yaw: 1.5, pitch: 0 },
    { pos: hp(4, 27, 1.7), yaw: 0.6, pitch: 0 }, { pos: hp(1, 12, 1.7), yaw: 0.9, pitch: 0 },
    { pos: hp(-12, -3, 1.8), yaw: 1.2, pitch: 0.05 }, { pos: hp(-27, 6.5, 1.8), yaw: 1.2, pitch: 0.15 },
    { pos: hp(-37, 13.5, 1.8), yaw: 0.6, pitch: 0.3 }, { pos: hp(-36, 3, 1.9), yaw: -0.9, pitch: 0.1 },
    { pos: hp(-22, -8, 2), yaw: -1.5, pitch: 0 }, { pos: hp(-8, -9, 2), yaw: -0.8, pitch: 0 },
    { pos: hp(0, -9, 1.8), yaw: 0, pitch: 0 },
  ],
  flythroughDuration: 80,
  doors: [{ pos: [DOOR[0], null, DOOR[1]], yaw: Math.PI, to: 'sky-mountains' }],
  bounds: { center: [0, 0, -10], radius: 72 },
  env: {
    sunDir: [-0.45, 0.62, -0.5], sunColor: [0.16, 0.18, 0.34], fogColor: [0.016, 0.03, 0.045], fogDensity: 0,
    ambientSky: [0.042, 0.06, 0.11], ambientGround: [0.032, 0.03, 0.05],
  },
  post: { exposure: 1.3, bloom: 0.3, bloomThreshold: 1.0, bloomKnee: 0.6, vignette: 0.3, saturation: 1.1, contrast: 1.12 },
  clearColor: [0.01, 0.015, 0.03],
  doorLight: [0.15, 0.2, 0.24],
  fov: 64,

  hAt(x, z) {
    const f = (x / WSIZE + 0.5) * (HN - 1), g = (z / WSIZE + 0.5) * (HN - 1);
    const i = Math.min(HN - 2, Math.max(0, Math.floor(f))), j = Math.min(HN - 2, Math.max(0, Math.floor(g)));
    const u = Math.min(1, Math.max(0, f - i)), v = Math.min(1, Math.max(0, g - j)), H = this.hg, k = j * HN + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + HN] * (1 - u) + H[k + HN + 1] * u) * v;
  },
  heightAt(x, z) {
    let h = this.hAt(x, z);
    if (x > 28 && x < 54 && z < 27 && z > -37) {       // ravine: no wading clamp; the bridge deck carries the walker
      if (this.brOn && x > BRA - 0.4 && x < BRB + 0.4 && Math.abs(z - BRZ) < 0.9) return Math.max(h, deckY(Math.min(1, Math.max(0, (x - BRA) / (BRB - BRA))), YA, YB) + 0.03);
      return h;
    }
    const lo = -0.55, k = 0.4, dd = Math.abs(h - lo);
    h = Math.max(h, lo) + (dd < k ? (k - dd) * (k - dd) / (4 * k) : 0);
    const P = this.padsW;
    for (let i = 0; i < P.length; i += 4) {
      const d = Math.hypot(x - P[i], z - P[i + 1]), r = P[i + 2];
      if (d < r + 0.3) { const w = ss(r + 0.3, r - 0.2, d); h = Math.max(h, h + (0.1 - h) * w); }
    }
    return h;
  },
  sdf(x, y, z) {
    const [rc, am, edge] = cliffInfo(x, z);
    let d = (edge + 0.9 - rc) + (1 - am) * (30 + rc);   // only the cliff arc blocks; away from it the term stays positive at any distance
    const cx = Math.floor(x / 12) + 32, cz = Math.floor(z / 12) + 32, T = this.treeCol;
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      const cell = this.treeGrid[(a & 63) * 64 + (b & 63)];
      for (let k = 0; k < cell.length; k++) { const o = cell[k] * 3; d = Math.min(d, Math.hypot(x - T[o], z - T[o + 1]) - T[o + 2]); }
    }
    if (this.brOn && x > BRA + 0.5 && x < BRB - 0.5) d = Math.min(d, 0.72 - Math.abs(z - BRZ));   // vine rails
    return d;
  },

  async init(ctx, progress) {
    const dev = ctx.device, q = ctx.q.level, R = makeRng(4242);
    // ---------- terrain heights (CPU), textures ----------
    const hg = this.hg = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hg[j * HN + i] = terrain((i / (HN - 1) - 0.5) * WSIZE, (j / (HN - 1) - 0.5) * WSIZE);
    this.padsW = new Float32Array(0);
    await progress(0.15);
    const tv = new Float32Array(HN * HN * 12), e = WSIZE / (HN - 1);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const k = j * HN + i, o = k * 12, x = (i / (HN - 1) - 0.5) * WSIZE, z = (j / (HN - 1) - 0.5) * WSIZE;
      const hl = hg[j * HN + Math.max(0, i - 1)], hr = hg[j * HN + Math.min(HN - 1, i + 1)], hd = hg[Math.max(0, j - 1) * HN + i], hu = hg[Math.min(HN - 1, j + 1) * HN + i];
      const nx = hl - hr, nz = hd - hu, ny = 2 * e, l = Math.hypot(nx, ny, nz);
      tv[o] = x; tv[o + 1] = hg[k]; tv[o + 2] = z; tv[o + 3] = nx / l; tv[o + 4] = ny / l; tv[o + 5] = nz / l; tv[o + 6] = i / (HN - 1); tv[o + 7] = j / (HN - 1);
    }
    const ti = new Uint32Array((HN - 1) * (HN - 1) * 6); let ki = 0;
    for (let j = 0; j < HN - 1; j++) for (let i = 0; i < HN - 1; i++) { const a = j * HN + i, c = a + HN; ti.set([a, c, a + 1, a + 1, c, c + 1], ki); ki += 6; }
    this.terr = { vb: ctx.buffer(tv, 'vertex'), ib: ctx.buffer(ti, 'index'), n: ti.length };
    const TN = 256, hh = new Uint16Array(TN * TN);
    for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) hh[j * TN + i] = toHalf(this.hAt(((i + 0.5) / TN - 0.5) * WSIZE, ((j + 0.5) / TN - 0.5) * WSIZE));
    const hmap = ctx.texture(TN, TN, 'r16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: hmap }, hh, { bytesPerRow: TN * 2 }, [TN, TN]);
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
    const emit = []; // x, z, slot, strength, radius
    // hue zones: groves of cyan, violet or magenta with a neighbouring hue mixed in and lime as a rare accent
    const zs = (x, z, lime = 0.06) => {
      const n = fbm2(x * 0.022 + 3.1, z * 0.022 - 1.7, 2), r = R(), b = n < -0.12 ? 0 : n < 0.14 ? 2 : 1;
      return r < lime ? 3 : r < 0.24 ? (b === 2 ? (n < 0 ? 0 : 1) : 2) : b;
    };
    const free = (x, z, rPath, rDoor) => pathDist(x, z) > rPath && Math.hypot(x - DOOR[0], z - DOOR[1]) > rDoor && Math.hypot(x - SPAWN[0], z - SPAWN[2]) > 3 && Math.hypot(x + 15, z + 15) > 4.5;
    // trees
    const nTrees = [110, 165, 220][q], trees = [];
    const heroT = [[-24, -26, 1.35], [24, -24, 1.3], [-21, -4, 1.25], [20, 2, 1.3], [-33, 4, 1.4], [-27, 12, 1.2], [14, 30, 1.2], [-12, 24, 1.25], [36, -40, 1.3], [-38, -42, 1.3]];
    for (const [x, z, s] of heroT) trees.push([x, z, s]);
    for (let tries = 0; trees.length < nTrees && tries < 20000; tries++) {
      const ang = R() * TAU, rr = 18 + Math.sqrt(R()) * 110, x = Math.cos(ang) * rr, z = -10 + Math.sin(ang) * rr;
      if (lagE(x, z) < 1.4 || inClearing(x, z) < 1.05 || !free(x, z, 3.5, 6)) continue;
      const [rc, am, edge] = cliffInfo(x, z);
      if (am > 0.05 && rc > edge - 1 && rc < edge + 6) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 7.5)) continue;
      trees.push([x, z, 0.8 + R() * 0.45]);
    }
    const NV = 4, treeMeshes = [];
    for (let v = 0; v < NV; v++) treeMeshes.push([this.mesh(ctx, tree(v + 1, 0)), this.mesh(ctx, tree(v + 1, 1))]);
    const tInst = [[], [], [], []];
    this.treeCol = new Float32Array(trees.length * 3 + 60);
    this.treeGrid = Array.from({ length: 64 * 64 }, () => []);
    let nCol = 0;
    const addCol = (x, z, r) => { this.treeCol.set([x, z, r], nCol * 3); this.treeGrid[((Math.floor(x / 12) + 32) & 63) * 64 + ((Math.floor(z / 12) + 32) & 63)].push(nCol++); };
    trees.forEach(([x, z, s], i) => {
      const v = i % NV, y = this.hAt(x, z), slot = zs(x, z, 0.03);
      tInst[v].push(x, y, z, s, R() * TAU, slot, R(), y);
      if (!dead(x, z, 3.4)) addCol(x, z, 1.45 * s);
      emit.push(x, z, slot, 1.0 * s, 4);
    });
    this.cats = [];
    this.treeCats = tInst.map((a, v) => this.cat(ctx, treeMeshes[v][0], treeMeshes[v][1], a, 9, 130, 30, 3.4));
    await progress(0.45);

    // ground plants: ferns (instanced per frond), fans, spirals, shrubs, mushrooms, rocks
    const near = (x, z, minE) => lagE(x, z) > minE && free(x, z, 1.7, 3.5) && !trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.6 * t[2]);
    const spot = (ring) => {
      for (let k = 0; k < 60; k++) {
        let x, z;
        if (ring && R() < 0.75) { const t = trees[R() * trees.length | 0]; const a = R() * TAU, r = 2.5 + R() * 5; x = t[0] + Math.cos(a) * r; z = t[1] + Math.sin(a) * r; }
        else { const a = R() * TAU, r = Math.sqrt(R()) * 64; x = Math.cos(a) * r; z = -10 + Math.sin(a) * r; }
        if (Math.hypot(x, z + 10) > 70 || !near(x, z, 1.12)) continue;
        if (inClearing(x, z) < 0.75 && R() < 0.55) continue;
        const [rc, am, edge] = cliffInfo(x, z); if (am > 0.05 && rc > edge - 0.5) continue;
        return [x, z];
      }
      return null;
    };
    const fern = [], nFern = [150, 270, 360][q];
    for (let i = 0; i < nFern; i++) {
      const s = spot(true); if (!s) continue;
      const [x, z] = s, y = this.hAt(x, z) - 0.05, slot = zs(x, z), big = R(), sc = 0.7 + big * big * 2.2, n = 5 + (R() * 4 | 0), y0 = R() * TAU;
      for (let f = 0; f < n; f++) fern.push(x, y, z, sc * (0.75 + R() * 0.4), y0 + (f / n) * TAU + R() * 0.4, slot, R(), f === 0 && R() < 0.6 ? 0.85 + R() * 0.15 : 0);
      emit.push(x, z, slot, 0.7 * sc, 2.4);
    }
    this.fernCat = this.cat(ctx, this.mesh(ctx, frond(16)), this.mesh(ctx, frond(8)), fern, 3, 55, 16, 1.4);
    const fans = [];
    for (let i = 0; i < [50, 90, 130][q]; i++) {
      const s = spot(true); if (!s) continue;
      const [x, z] = s, y = this.hAt(x, z) - 0.05, slot = zs(x, z), big = R(), sc = 0.7 + big * big * 2, n = 2 + (R() * 3 | 0), y0 = R() * TAU;
      for (let f = 0; f < n; f++) fans.push(x + (R() - 0.5) * 0.3, y, z + (R() - 0.5) * 0.3, sc * (0.8 + R() * 0.4), y0 + (f / n) * TAU, slot, R(), 0);
      emit.push(x, z, slot, 1.1 * sc, 2.2);
    }
    const fanM = this.mesh(ctx, fan());
    this.fanCat = this.cat(ctx, fanM, fanM, fans, 2, 50, 99, 1.4);
    const spi = [];
    for (let i = 0; i < [35, 60, 85][q]; i++) {
      const s = spot(false); if (!s) continue;
      const [x, z] = s, slot = zs(x, z, 0.12), n = 3 + (R() * 4 | 0);
      for (let f = 0; f < n; f++) {
        const a = R() * TAU, r = R() * 0.9, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        spi.push(px, this.hAt(px, pz) - 0.05, pz, 0.7 + R() * 1.6, R() * TAU, slot, R(), 0.5 + R() * 0.5);
      }
      emit.push(x, z, slot, 0.9, 2.2);
    }
    this.spiCat = this.cat(ctx, this.mesh(ctx, spiral(7, 34)), this.mesh(ctx, spiral(4, 14)), spi, 2, 50, 14, 1.2);
    const shr = [];
    for (let i = 0; i < [30, 55, 80][q]; i++) {
      const s = spot(true); if (!s) continue;
      const [x, z] = s, slot = zs(x, z);
      shr.push(x, this.hAt(x, z), z, 1 + R() * 1.8, R() * TAU, slot, R(), 1); emit.push(x, z, slot, 1.2, 2.6);
    }
    // door surroundings: lantern plants and rosettes frame it, mushrooms at its posts
    const ros = [], lan = [], dz = DOOR[1], dxs = DOOR[0];
    for (const sd of [-1, 1]) {
      lan.push(dxs + sd * 1.75, this.hAt(dxs + sd * 1.75, dz + 0.5), dz + 0.5, 1.25, R() * TAU, sd < 0 ? 0 : 2, R(), 4);
      ros.push(dxs + sd * 2.5, this.hAt(dxs + sd * 2.5, dz + 1.5) - 0.03, dz + 1.5, 1.7, R() * TAU, sd < 0 ? 2 : 0, R(), 3);
      ros.push(dxs + sd * 1.3, this.hAt(dxs + sd * 1.3, dz + 2.3) - 0.03, dz + 2.3, 1.2, R() * TAU, 0.5, R(), 3);
      shr.push(dxs + sd * 3.4, this.hAt(dxs + sd * 3.4, dz + 0.2), dz + 0.2, 1.9, R() * TAU, sd < 0 ? 2 : 1, R(), 1);
      emit.push(dxs + sd * 1.75, dz + 0.5, sd < 0 ? 0 : 2, 1.6, 3, dxs + sd * 3.4, dz + 0.2, sd < 0 ? 2 : 1, 1.2, 2.6);
    }
    emit.push(dxs, dz - 1, 0, 1.2, 3);
    this.shrubCat = this.cat(ctx, this.mesh(ctx, shrub(5)), null, shr, 3, 50, 99, 1.6);
    for (let i = 0; i < [40, 70, 100][q]; i++) {
      const s = spot(true); if (!s) continue;
      const [x, z] = s, slot = zs(x, z), big = R();
      ros.push(x, this.hAt(x, z) - 0.03, z, 0.8 + big * big * 1.8, R() * TAU, slot, R(), 3); emit.push(x, z, slot, 0.8, 2.4);
    }
    const rosM = this.mesh(ctx, rosette(9));
    this.rosCat = this.cat(ctx, rosM, null, ros, 2, 55, 99, 1.5);
    for (let i = 0; i < [30, 50, 75][q]; i++) {
      const s = spot(i % 2 === 0); if (!s) continue;
      const [x, z] = s, slot = zs(x, z, 0.15);
      lan.push(x, this.hAt(x, z) - 0.02, z, 0.8 + R() * 1.1, R() * TAU, slot, R(), 4); emit.push(x, z, slot, 1.3, 2.8);
    }
    const lanM = this.mesh(ctx, lantern(3));
    this.lanCat = this.cat(ctx, lanM, null, lan, 2.5, 50, 99, 1.4);
    const reeds = [];
    for (let i = 0; i < [36, 60, 84][q]; i++) {
      const a = R() * TAU, e0 = 0.9 + R() * 0.13, x = LAG[0] + Math.cos(a) * LAG[2] * e0, z = LAG[1] + Math.sin(a) * LAG[3] * e0;
      const [rc, am, edge] = cliffInfo(x, z);
      if ((am > 0.05 && rc > edge - 3) || (Math.abs(x) < 6 && z > -27)) continue;
      const slot = R() < 0.6 ? 0 : zs(x, z, 0.25);
      reeds.push(x, Math.max(this.hAt(x, z), -0.25) - 0.05, z, 0.8 + R() * 0.7, R() * TAU, slot, R(), 5); emit.push(x, z, slot, 0.5, 2);
    }
    const reedM = this.mesh(ctx, reed(4));
    this.reedCat = this.cat(ctx, reedM, null, reeds, 2.5, 70, 99);
    // ground cover: clumps of small glowing tufts and star flowers
    const tf = [];
    for (let i = 0; i < [220, 440, 720][q]; i++) {
      let x, z;
      if (i < 8) { const a = (i / 8) * TAU; x = dxs + Math.cos(a) * (1.3 + R()); z = dz + Math.sin(a) * (1.3 + R()) + 0.3; if (Math.abs(x - dxs) < 0.8) continue; }
      else if (R() < 0.4) { const k = R() * 5 | 0, t = R(), sd = R() < 0.5 ? -1 : 1, o = 1.5 + R() * 2, [ax, az] = PATH[k], [bx, bz] = PATH[k + 1], L = Math.hypot(bx - ax, bz - az); x = ax + (bx - ax) * t - ((bz - az) / L) * sd * o; z = az + (bz - az) * t + ((bx - ax) / L) * sd * o; }
      else { const a = R() * TAU, r = R() * 58; x = Math.cos(a) * r; z = -8 + Math.sin(a) * r; }
      const [rc, am, edge] = cliffInfo(x, z);
      if (lagE(x, z) < 1.07 || pathDist(x, z) < 1.25 || (am > 0.05 && rc > edge - 0.5)) continue;
      const slot = zs(x, z, 0.14), n = 3 + (R() * 4 | 0);
      for (let k = 0; k < n; k++) { const px = x + (R() - 0.5) * 1.5, pz = z + (R() - 0.5) * 1.5; if (pathDist(px, pz) > 1.1) tf.push(px, this.hAt(px, pz) - 0.01, pz, 0.7 + R() * 1.1, R() * TAU, slot, R(), 6); }
      emit.push(x, z, slot, 0.35, 1.6);
    }
    const tuftM = this.mesh(ctx, tuft(8));
    this.tuftCat = this.cat(ctx, tuftM, null, tf, 0.4, 24, 99, 0.9);
    const mush = [];
    for (let k = 0; k < PATH.length - 1; k++) {
      const [ax, az] = PATH[k], [bx, bz] = PATH[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 2.6);
      for (let i = 0; i < n; i++) {
        const t = (i + R()) / n, sd = R() < 0.5 ? -1 : 1, off = 1.5 + R() * 0.8;
        const x = ax + (bx - ax) * t + (-(bz - az) / L) * sd * off, z = az + (bz - az) * t + ((bx - ax) / L) * sd * off;
        if (Math.hypot(x - DOOR[0], z - DOOR[1]) < 2.5 || lagE(x, z) < 1.1) continue;
        const slot = zs(x, z, 0.3);
        mush.push(x, this.hAt(x, z) - 0.02, z, 0.9 + R() * 1.3, R() * TAU, slot, R(), 2); emit.push(x, z, slot, 1.1, 1.6);
      }
    }
    for (const t of trees) for (let k = 0; k < 2; k++) { const a = R() * TAU, r = 1.2 * t[2] + R(), x = t[0] + Math.cos(a) * r, z = t[1] + Math.sin(a) * r; mush.push(x, this.hAt(x, z) - 0.02, z, 1 + R() * 1.6, R() * TAU, zs(x, z, 0.2), R(), 2); }
    for (const sd of [-1, 1]) { mush.push(DOOR[0] + sd * 1.0, this.hAt(DOOR[0] + sd, DOOR[1]) - 0.02, DOOR[1] + 0.25, 1.6, R() * TAU, sd < 0 ? 0 : 3, R(), 2); emit.push(DOOR[0] + sd, DOOR[1] + 0.25, sd < 0 ? 0 : 3, 0.7, 1.6); }
    const mushM = this.mesh(ctx, mushrooms(3));
    this.mushCat = this.cat(ctx, mushM, null, mush, 0.6, 42, 99, 1);
    const rocks = [];
    for (let i = 0; i < 26; i++) {
      const a = (R() - 0.5) * 2.6, rc = 13.6 + R() * 3.5, dz = -rc * Math.cos(a), dx = (rc * Math.sin(a)) / 0.62;
      const x = LAG[0] + dx, z = LAG[1] + dz; if (Math.abs(x - WFX) < 3.5) continue;
      rocks.push(x, this.hAt(x, z) - 0.6, z, 1.2 + R() * 2.4, R() * TAU, 0, R(), 0);
    }
    for (let i = 0; i < 24; i++) {
      const a = R() * TAU, e0 = 1.02 + R() * 0.2, x = LAG[0] + Math.cos(a) * LAG[2] * e0, z = LAG[1] + Math.sin(a) * LAG[3] * e0;
      if (!free(x, z, 1.8, 4)) continue;
      rocks.push(x, this.hAt(x, z) - 0.15, z, 0.3 + R() * 0.7, R() * TAU, R() * 4 | 0, R(), 0);
    }
    for (let i = 0; i < 150; i++) {       // small stones scattered over the clearing and along the path
      const a = R() * TAU, r = R() * 45, x = Math.cos(a) * r, z = -6 + Math.sin(a) * r;
      if (lagE(x, z) < 1.05 || pathDist(x, z) < 1.2 || Math.hypot(x - DOOR[0], z - DOOR[1]) < 2.5) continue;
      const sc = 0.08 + R() * R() * 0.4;
      rocks.push(x, this.hAt(x, z) - sc * 0.35, z, sc, R() * TAU, zs(x, z), R(), 0);
    }
    const rockG = ctx.mesh.rock(11, 2, 0.45), rockM = this.mesh(ctx, fromCore(rockG, [0, 0, 0, 0]));
    this.rockCat = this.cat(ctx, rockM, null, rocks, 1.3, 140, 99, 1);
    await progress(0.6);

    // lagoon: lily pads (some walkable), lotuses, fish
    const pads = [[-3.2, -30.5, 1.7], [-6.3, -28.6, 1.3], [-0.4, -27.2, 1.15], [0.5, -32.6, 1.4]];
    for (let tries = 0; pads.length < [16, 22, 28][q] && tries < 3000; tries++) {
      const a = R() * TAU, rr = Math.sqrt(R()) * 0.82, x = LAG[0] + Math.cos(a) * LAG[2] * rr, z = LAG[1] + Math.sin(a) * LAG[3] * rr, r = 0.8 + R() * 1.4;
      if (Math.hypot(x - WFX, z + 47) < 7 || pads.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + r + 0.5)) continue;
      pads.push([x, z, r]);
    }
    const lot = [[-1.6, -29.0, 0.95], [-5.4, -31.4, 0.8]];
    const FP = this.flythrough, segD = (x, z) => { let d = 1e9; for (let i = 0; i < FP.length - 1; i++) { const a = FP[i].pos, b = FP[i + 1].pos, vx = b[0] - a[0], vz = b[2] - a[2], h = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[2]) * vz) / (vx * vx + vz * vz + 1e-6))); d = Math.min(d, Math.hypot(x - a[0] - vx * h, z - a[2] - vz * h)); } return d; };
    for (let tries = 0; lot.length < 10 && tries < 3000; tries++) {
      const a = R() * TAU, rr = Math.sqrt(R()) * 0.8, x = LAG[0] + Math.cos(a) * LAG[2] * rr, z = LAG[1] + Math.sin(a) * LAG[3] * rr;
      if (Math.hypot(x - WFX, z + 47) < 6 || this.flythrough.some((f) => Math.hypot(f.pos[0] - x, f.pos[2] - z) < 4) || segD(x, z) < 2.5 || pads.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + 0.7) || lot.some((p) => Math.hypot(p[0] - x, p[1] - z) < 3)) continue;
      lot.push([x, z, 0.65 + R() * 0.4]);
    }
    this.padsW = new Float32Array(pads.length * 4);
    const padI = [];
    pads.forEach(([x, z, r], i) => { this.padsW.set([x, z, r, 0], i * 4); const sl = R() < 0.5 ? 0 : 3; padI.push(x, 0.03, z, r, R() * TAU, sl, R(), 0); emit.push(x, z, sl, 0.3 * r, 1.6 * r); });
    const padM = this.mesh(ctx, pad());
    this.padCat = this.cat(ctx, padM, null, padI, 2.4, 140, 99);
    const lotI = []; this.lotus = [];
    lot.forEach(([x, z, s]) => { const per = 55 + R() * 45, sd = R(); lotI.push(x, 0.02, z, s, R() * TAU, 1, sd, per); this.lotus.push(per, sd, x, z, s); emit.push(x, z, 1, 0.3, 2.5); });
    this.lotus = new Float32Array(this.lotus); this.lotusSign = new Int8Array(lot.length);
    const lotusM = this.mesh(ctx, lotus());
    this.lotusCat = this.cat(ctx, lotusM, null, lotI, 1.2, 140, 99);
    const fishI = [];
    for (let i = 0; i < 8; i++) fishI.push(LAG[0] + (R() - 0.5) * 8, LAG[1] + (R() - 0.5) * 6 + 2, 5 + R() * 7, (0.04 + R() * 0.04) * (R() < 0.5 ? -1 : 1), R() * TAU, R() * 4 | 0, R(), -0.42 - R() * 0.25);
    fishI.push(-3.4, -27.4, 2.3, 0.11, 1.2, 0, R(), -0.4, -2.2, -29, 3.1, -0.085, 4, 1, R(), -0.46);
    this.fishM = this.mesh(ctx, fish()); this.fishB = ctx.buffer(new Float32Array(fishI), 'vertex'); this.nFish = 10;
    this.frogM = this.mesh(ctx, frog());
    // frog pad trios (nearby pads)
    this.frogPads = new Int32Array(18);
    for (let f = 0; f < 6; f++) {
      const a = [[0, 2, 5, 9, 13, 17][f] % pads.length];
      while (a.length < 3) {
        const p = pads[a[a.length - 1]]; let best = -1, bd = 1e9;
        pads.forEach((o, k) => { if (a.includes(k)) return; const d = Math.hypot(o[0] - p[0], o[1] - p[1]) - o[2] - p[2]; if (d < bd) { bd = d; best = k; } });
        a.push(best);
      }
      this.frogPads.set(a, f * 3);
    }
    // waterfall: lip and base
    let lz = LAG[1], bz = LAG[1];
    for (let z = LAG[1]; z > LAG[1] - 30; z -= 0.1) { const h = terrain(WFX, z); if (h > 0 && bz === LAG[1]) bz = z; if (h > 12.5) { lz = z; break; } }
    const lipY = terrain(WFX, lz - 0.6);
    this.wf = [WFX, lipY, lz + 0.2, bz + 2.2];
    emit.push(WFX, bz + 2, 0, 1.6, 8, WFX, bz - 1, 0, 1.0, 6, WFX - 3, bz + 1, 3, 0.6, 5, WFX + 3, bz + 1, 2, 0.6, 5);
    await progress(0.7);

    // ---------- places beyond the lagoon (own RNG, so the original scatter stays as it was) ----------
    const nOld = emit.length, R2 = makeRng(977), Hh = (x, z) => this.hAt(x, z);
    const xMush = [], xRock = [], xTuft = [], xLan = [], xRos = [], xReed = [], xPad = [], xLot = [], lem = [], snl = [];
    const put = (arr, x, y, z, s, slot, ty, yaw = R2() * TAU) => arr.push(x, y, z, s, yaw, slot, R2(), ty);
    const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
    let rockTop = 0; for (let k = 0; k < rockG.pos.length; k += 3) if (Math.hypot(rockG.pos[k], rockG.pos[k + 2]) < 0.3) rockTop = Math.max(rockTop, rockG.pos[k + 1]);
    // mushroom grove: giant mushrooms with creatures on the caps, a fairy ring, lime and cyan light
    const GM = [gmush(1), gmush(2)], gmI = [[], []], caps = [];
    [[0, 0, 1.25], [6.5, 3.5, 0.9], [-5, 5.5, 1.0], [3, -6.5, 0.8], [-7, -3, 0.62], [8.5, -4, 0.7], [-0.5, 9.5, 0.75], [10.5, 0.5, 0.42]].forEach(([dx, dz, s], i) => {
      const x = GRV[0] + dx, z = GRV[1] + dz, y = Hh(x, z), m = GM[i & 1], yaw = R2() * TAU, slot = i % 3 === 1 ? 0 : 3, c = Math.cos(yaw), sn = Math.sin(yaw);
      gmI[i & 1].push(x, y, z, s, yaw, slot, R2(), 7);
      addCol(x, z, 0.4 * s + 0.2); emit.push(x, z, slot, 1.0 * s, 4.5);
      caps.push([x + (c * m.lx + sn * m.lz) * s, y + m.top * s, z + (-sn * m.lx + c * m.lz) * s, m.cr * s, m.ch * s]);
    });
    // a seat on a cap, r0 metres from its apex
    const seat = (i, r0, ang, sc, slot, yaw) => {
      const [cx, cy, cz, cr, ch] = caps[i], w = Math.acos(Math.min(1, Math.pow(r0 / cr, 1 / 0.6))), x = cx + Math.cos(ang) * r0, z = cz + Math.sin(ang) * r0;
      lem.push(x, cy + ch * Math.sin(w) - 0.05 * sc, z, sc, yaw ?? face(x, z, -36, 12), slot, R2(), 0);
    };
    // they sit near the rims that face the trail, so they can be seen from below
    const rimSeat = (i, f, da, sc, slot) => seat(i, caps[i][3] * f, Math.atan2(12 - caps[i][2], -36 - caps[i][0]) + da, sc, slot);
    rimSeat(0, 0.72, 0.1, 1.25, 2); rimSeat(2, 0.7, -0.25, 1.1, 0); rimSeat(2, 0.74, 0.2, 0.62, 2); rimSeat(4, 0.6, 0.3, 0.9, 0); rimSeat(7, 0.3, 0, 0.7, 2); rimSeat(1, 0.75, -0.4, 1, 0);
    const fr = [GRV[0] + 5.5, GRV[1] - 1.5];
    for (let k = 0; k < 13; k++) { const a = (k / 13) * TAU + R2() * 0.2, x = fr[0] + Math.cos(a) * 1.9, z = fr[1] + Math.sin(a) * 1.9; put(xMush, x, Hh(x, z) - 0.02, z, 1.2 + R2() * 0.8, 1, 2); }
    emit.push(fr[0], fr[1], 1, 1.3, 2.4);
    for (let k = 0; k < 8; k++) { const a = R2() * TAU, r = R2() * 1.3, x = fr[0] + Math.cos(a) * r, z = fr[1] + Math.sin(a) * r; put(xTuft, x, Hh(x, z) - 0.01, z, 0.8 + R2(), 1, 6); }
    for (let k = 0; k < 34; k++) {
      const a = R2() * TAU, r = 2 + Math.sqrt(R2()) * 12, x = GRV[0] + Math.cos(a) * r, z = GRV[1] + Math.sin(a) * r, slot = R2() < 0.6 ? 3 : 0;
      if (trailD(x, z) < 1.3) continue;
      put(xMush, x, Hh(x, z) - 0.02, z, 1.5 + R2() * R2() * 3.5, slot, 2); emit.push(x, z, slot, 0.9, 1.8);
    }
    put(snl, fr[0] + 0.3, Hh(fr[0] + 0.3, fr[1]) + 0.005, fr[1], 1.6, 3, 8); put(snl, GRV[0] + 3.2, Hh(GRV[0] + 3.2, GRV[1] + 2) + 0.005, GRV[1] + 2, 1.3, 0, 8);
    // ravine: glowing mushrooms along the floor, vine bridge across
    for (let k = 0; k < 30; k++) {
      const i = k % 4, t = R2(), x = mix(RAV[i][0], RAV[i + 1][0], t) + (R2() - 0.5) * 3, z = mix(RAV[i][1], RAV[i + 1][1], t) + (R2() - 0.5) * 3, slot = R2() < 0.65 ? 0 : 3;
      put(xMush, x, Hh(x, z) - 0.02, z, 2 + R2() * 2.5, slot, 2); emit.push(x, z, slot, 1.3, 2.6);
    }
    const brCat = this.cat(ctx, this.mesh(ctx, bridge(BRB - BRA, YA, YB)), null, [BRA, 0, BRZ, 1, 0, 0, 0.3, 9], 14, 150, 999);
    emit.push(BRA - 0.5, BRZ, 0, 0.9, 3, BRB + 0.5, BRZ, 3, 0.9, 3);
    lem.push(BRB + 0.25, YB + 1.58, BRZ + 0.82, 1, face(BRB, BRZ + 0.82, BRA, BRZ), 0, R2(), 0);
    put(snl, BRA + 2.6, deckY(0.26, YA, YB) + 0.03, BRZ + 0.38, 1.3, 0, 8, 1.2);
    // knoll with the giant flower (opens when you come near), lantern plants, a bird
    const fy = Hh(FLW[0], FLW[1]);
    this.flw = [FLW[0], fy + 0.85, FLW[1], 2.3];
    put(xLot, FLW[0], fy + 0.85, FLW[1], 2.3, 6, -1); put(xRos, FLW[0], fy - 0.05, FLW[1], 2.1, 2, 3);
    addCol(FLW[0], FLW[1], 1.5); emit.push(FLW[0], FLW[1], 2, 1.8, 5.5);
    const bt = [];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + 1.25, r = 4.3 + R2() * 1.4, x = FLW[0] + Math.cos(a) * r, z = FLW[1] + Math.sin(a) * r, s = 1 + R2() * 0.5;
      put(xLan, x, Hh(x, z) - 0.02, z, s, k % 2 ? 0 : 2, 4); emit.push(x, z, k % 2 ? 0 : 2, 1.3, 2.8);
      if (k < 3) { const bx = FLW[0] + Math.cos(a + 0.6) * 3.1, bz = FLW[1] + Math.sin(a + 0.6) * 3.1; bt.push(bx, fy + 2.0 + 0.3 * k, bz, face(bx, bz, FLW[0], FLW[1])); }
    }
    for (let k = 0; k < 40; k++) { const a = R2() * TAU, r = 2.6 + R2() * 5, x = FLW[0] + Math.cos(a) * r, z = FLW[1] + Math.sin(a) * r; if (trailD(x, z) > 1) put(xTuft, x, Hh(x, z) - 0.01, z, 0.8 + R2() * 1.2, R2() < 0.7 ? 2 : 0, 6); }
    // moon pool: still water, small pads and pale lotuses, reeds, rim stones with snails, a ring of blue ground cover
    const pe = (a, e) => [POOL[0] + Math.cos(a) * POOL[2] * e, POOL[1] + Math.sin(a) * POOL[3] * e];
    for (let k = 0; k < 6; k++) { const [x, z] = pe(k * 1.05 + R2() * 0.4, 0.3 + R2() * 0.4); put(xPad, x, 0.03, z, 0.5 + R2() * 0.5, 0, 0); }
    for (let k = 0; k < 3; k++) { const [x, z] = pe(k * 2.1 + 0.6, 0.2 + 0.15 * k); xLot.push(x, 0.02, z, 0.5 + R2() * 0.25, R2() * TAU, k === 1 ? 6 : 4, R2(), 40 + R2() * 30); emit.push(x, z, 0, 0.5, 2); }
    for (let k = 0; k < 10; k++) { const [x, z] = pe(k * 0.63 + R2() * 0.3 + 0.9, 0.9 + R2() * 0.1); if (Math.abs(z - 36) < 2.5 && x < POOL[0]) continue; put(xReed, x, Math.max(Hh(x, z), -0.25) - 0.05, z, 0.7 + R2() * 0.6, 0, 5); }
    for (let k = 0; k < 8; k++) {
      const a = k * 0.79 + 0.35, [x, z] = pe(a, 1.14 + R2() * 0.14), s = 0.45 + R2() * 0.55, y = Hh(x, z) - 0.15 * s;
      if (Math.abs(z - 36) < 2 && x < POOL[0]) continue;
      put(xRock, x, y, z, s, 0, 0); emit.push(x, z, 0, 1.0, 3.2);
      if (k % 2) put(snl, x, y + rockTop * s - 0.012, z, 1.2 + R2() * 0.5, k % 4 === 1 ? 0 : 2, 8);
      else if (k === 4) lem.push(x, y + rockTop * s - 0.04, z, 0.95, face(x, z, 25, 36), 2, R2(), 0);
    }
    for (let k = 0; k < 60; k++) { const [x, z] = pe(R2() * TAU, 1.16 + R2() * R2() * 0.9); if (trailD(x, z) > 1) put(xTuft, x, Hh(x, z) - 0.01, z, 0.8 + R2() * 1.1, 0, 6); }
    for (let k = 0; k < 4; k++) { const [x, z] = pe(k * 1.6 + 1.9, 1.35 + R2() * 0.2); put(k % 2 ? xLan : xRos, x, Hh(x, z) - 0.03, z, 1 + R2() * 0.6, k % 2 ? 2 : 0, k % 2 ? 4 : 3); emit.push(x, z, k % 2 ? 2 : 0, 1.0, 2.6); }
    emit.push(POOL[0], POOL[1], 2, 0.5, 6);
    // snails near the spawn too: on a lily pad and on the path stones
    put(snl, 1.1, 0.05, -32.3, 1.5, 1, 8, 2.2); put(snl, 2.5, Hh(2.5, 0.5) + 0.012, 0.5, 1.4, 0, 8); put(snl, 4.7, Hh(4.7, 10) + 0.012, 10, 1.2, 3, 8);
    this.propX = [this.cat(ctx, this.mesh(ctx, GM[0].g), null, gmI[0], 7, 150, 999), this.cat(ctx, this.mesh(ctx, GM[1].g), null, gmI[1], 7, 150, 999), brCat,
      this.cat(ctx, mushM, null, xMush, 0.6, 60, 999), this.cat(ctx, rockM, null, xRock, 1.3, 90, 999), this.cat(ctx, tuftM, null, xTuft, 0.4, 26, 999),
      this.cat(ctx, lanM, null, xLan, 2.5, 60, 999), this.cat(ctx, rosM, null, xRos, 2, 70, 999), this.cat(ctx, reedM, null, xReed, 2.5, 60, 999),
      this.cat(ctx, this.mesh(ctx, snail()), null, snl, 0.3, 22, 999)];
    this.padX = this.cat(ctx, padM, null, xPad, 2.4, 90, 999); this.lotX = this.cat(ctx, lotusM, null, xLot, 1.4, 150, 999);
    this.lemCat = this.cat(ctx, this.mesh(ctx, lemur()), null, lem, 1, 70, 999);
    this.birdM = this.mesh(ctx, bird());
    // bird hover spots (x, y, z, yaw): beside the lagoon lotuses, around the giant flower
    const bl = []; lot.forEach(([x, z, s], i) => { const a = i * 2.4, r = 0.75 * s + 0.2, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r; bl.push(bx, 0.42 * s + 0.2, bz, face(bx, bz, x, z)); });
    this.birdT = [new Float32Array(bl), new Float32Array(bt)];
    const NBF = [24, 44, 70][q], NDF = [9, 14, 20][q];
    // ---------- lightmap from all emitters ----------
    const LMN = 256, lm = new Float32Array(LMN * LMN * 4), cs = WSIZE / LMN;
    for (let k = 0; k < emit.length; k += 5) {
      const x = emit[k], z = emit[k + 1], sl = emit[k + 2] | 0, st = emit[k + 3], r = emit[k + 4];
      if (k < nOld && dead(x, z, r === 4 ? 3.4 : 1.2)) continue;
      const gi = (x / WSIZE + 0.5) * LMN - 0.5, gj = (z / WSIZE + 0.5) * LMN - 0.5, rr = Math.ceil((r * 2.2) / cs);
      for (let j = Math.max(0, Math.floor(gj) - rr); j <= Math.min(LMN - 1, Math.ceil(gj) + rr); j++)
        for (let i = Math.max(0, Math.floor(gi) - rr); i <= Math.min(LMN - 1, Math.ceil(gi) + rr); i++) {
          const d2 = ((i - gi) ** 2 + (j - gj) ** 2) * cs * cs;
          lm[(j * LMN + i) * 4 + sl] += st * Math.exp(-d2 / (r * r)) * 0.22;
        }
    }
    const lh = new Uint16Array(lm.length); for (let i = 0; i < lm.length; i++) lh[i] = toHalf(Math.min(lm[i], 4) / (1 + 0.25 * Math.min(lm[i], 4)));
    const lmap = ctx.texture(LMN, LMN, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    dev.queue.writeTexture({ texture: lmap }, lh, { bytesPerRow: LMN * 8 }, [LMN, LMN]);

    // ---------- uniforms, bind groups, pipelines ----------
    this.U = new Float32Array(196);
    this.ub = ctx.buffer(784, 'uniform');
    const shafts = [[-4, -30, 1.3, 0.8], [POOL[0] - 1, POOL[1], 1.5, 0.75], [GRV[0] + 2, GRV[1] + 1, 1.3, 0.5], [-12, -8, 0.9, 0.45], [9, -5, 0.8, 0.4], [DOOR[0] + 0.3, DOOR[1] - 0.3, 0.75, 0.9]];
    shafts.forEach((s, i) => this.U.set(s, 104 + i * 4));
    this.U.set(this.wf, 96);
    this.U.set([1, 0.028, 0.008, 1.6], 100);
    this.U.set([DOOR[0], this.hAt(DOOR[0], DOOR[1]), DOOR[1], 0], 168);
    this.U.set(this.flw, 192);
    const lin = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const rep = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
    this.cL = ctx.layout(['uniform', 'texture', 'texture', 'texture', 'sampler', 'sampler']);
    this.cBG = ctx.bindGroup(this.cL, [this.ub, hmap.createView(), lmap.createView(), ntex.createView(), lin, rep]);
    this.dL = ctx.layout(['texture-depth']);
    const trs = TRAILS.flatMap((T) => T.slice(1).map((b, i) => [...T[i], ...b]));
    const head = `const NPATH = ${PATH.length}u;\nconst PATH = array<vec2f, ${PATH.length}>(${PATH.map((p) => `vec2f(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`).join(',')});\n` +
      `const SPA = vec2f(${SPUR[0]}); const SPB = vec2f(${SPUR[1]});\nconst LAGOON = vec4f(${LAG.map((v) => v.toFixed(2)).join(',')});\nconst NSPORE = ${[600, 1200, 2200][q]}u;\n` +
      `const NTR = ${trs.length}u;\nconst TRAIL = array<vec4f, ${trs.length}>(${trs.map((v) => `vec4f(${v})`).join(',')});\nconst POOLC = vec4f(${POOL});\n` +
      `const MOTHC = array<vec4f, 3>(vec4f(0, -22, 15, 7), vec4f(${GRV}, 9, ${(this.hAt(GRV[0], GRV[1]) + 10.5).toFixed(1)}), vec4f(${POOL[0]}, ${POOL[1]}, 9, 4.5));\n` +
      `const NBF = ${NBF}u; const NMOTH = 3u; const NDF = ${NDF}u; const NDFL = ${NDF - 5}u;\n`;
    this.nWing = NBF + 3 + NDF + 2;
    this.nSpore = [600, 1200, 2200][q]; this.nFly = [50, 90, 140][q];
    const sh = (c, l) => ctx.rawShader('diagnostic(off, derivative_uniformity);\n' + ctx.wgsl.prelude + head + COMMON + c, l);
    const om = sh(OPAQUE, 'jungle-opaque'), fm = sh(FX, 'jungle-fx');
    const L = [this.cL], VB = [VLAYOUT], VBI = [VLAYOUT, ILAYOUT];
    const P = (module, vs, fs, o = {}) => ctx.pipelineAsync({ module, vs, fs, layouts: L, cull: 'none', label: vs, ...o });
    [this.pTerr, this.pTree, this.pProp, this.pFern, this.pFan, this.pSpi, this.pPad, this.pLotus, this.pFish, this.pFrog, this.pPetal, this.pSky, this.pWater, this.pMist, this.pFall, this.pSpore, this.pPuff, this.pFishGlow, this.pLemur, this.pBird, this.pWing] = await Promise.all([
      P(om, 'vsTerrain', 'fsTerrain', { buffers: VB, cull: 'back' }), P(om, 'vsTree', 'fsTree', { buffers: VBI }), P(om, 'vsProp', 'fsProp', { buffers: VBI }),
      P(om, 'vsFern', 'fsFern', { buffers: VBI }), P(om, 'vsFan', 'fsFan', { buffers: VBI }), P(om, 'vsSpiral', 'fsSpiral', { buffers: VBI }),
      P(om, 'vsPad', 'fsPad', { buffers: VBI }), P(om, 'vsLotus', 'fsLotus', { buffers: VBI }), P(om, 'vsFish', 'fsFish', { buffers: VBI }),
      P(om, 'vsFrog', 'fsFrog', { buffers: VB }), P(om, 'vsPetal', 'fsPetal'), P(om, 'vsSky', 'fsSky', { depthWrite: false }),
      P(fm, 'vsWater', 'fsWater', { buffers: VB, blend: 'alpha', depthWrite: true }),
      P(fm, 'vsMist', 'fsMist', { layouts: [this.cL, this.dL], blend: 'premul', depthFormat: null }),
      P(fm, 'vsFall', 'fsFall', { buffers: VB, blend: 'add' }), P(fm, 'vsSpore', 'fsSpore', { blend: 'add' }), P(fm, 'vsPuff', 'fsPuff', { blend: 'add' }),
      P(fm, 'vsFishGlow', 'fsPuff', { blend: 'add', buffers: [ILAYOUT] }),
      P(om, 'vsLemur', 'fsLemur', { buffers: VBI, cull: 'back' }), P(om, 'vsBird', 'fsBird', { buffers: VB }), P(fm, 'vsWing', 'fsWing', { blend: 'add' }),
    ]);
    // water surface grid and waterfall sheet
    this.waterM = this.mesh(ctx, fromCore(ctx.mesh.merge([ctx.mesh.translate(ctx.mesh.plane(LAG[2] * 2 + 6, LAG[3] * 2 + 6, 72, 48), LAG[0], 0, LAG[1]), ctx.mesh.translate(ctx.mesh.plane(19, 16, 19, 16), POOL[0], 0, POOL[1])]), [0, 0, 0, 0]));
    this.fallM = this.mesh(ctx, fromCore(ctx.mesh.plane(1, 1, 10, 36), [0, 0, 0, 0]));
    this.resize(ctx);
    await progress(1);
  },

  mesh(ctx, g) { return { vb: ctx.buffer(g.v, 'vertex'), ib: ctx.buffer(g.i, 'index'), n: g.i.length }; },
  // instance category with CPU frustum/distance culling and two LODs
  cat(ctx, m0, m1, arr, rad, maxD, lodD, clr) {
    if (clr) { const o = []; for (let k = 0; k < arr.length; k += 8) if (!dead(arr[k], arr[k + 2], clr)) for (let j = 0; j < 8; j++) o.push(arr[k + j]); arr = o; }
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
    const U = this.U;
    // palette slots rotate slowly through cyan, magenta, violet, lime
    const PAL = this.PAL || (this.PAL = new Float32Array([0.05, 0.8, 1.0, 1.0, 0.12, 0.72, 0.5, 0.22, 1.0, 0.5, 1.0, 0.14]));
    for (let i = 0; i < 4; i++) {
      const p = i + t / 210 + 0.15 * Math.sin(t / 97 + i * 1.7), k = Math.floor(p), f0 = p - k, f = f0 * f0 * f0 * (f0 * (f0 * 6 - 15) + 10);
      const a = (k & 3) * 3, b = ((k + 1) & 3) * 3;
      for (let c = 0; c < 3; c++) U[i * 4 + c] = PAL[a + c] + (PAL[b + c] - PAL[a + c]) * f;
    }
    // frogs hop between nearby pads on slow, staggered schedules
    const P = this.padsW, au = ctx.audio;
    for (let i = 0; i < 6; i++) {
      const per = 19 + 6.3 * i, off = 3 + 4.1 * i, k = Math.floor((t - off) / per), loc = t - off - k * per, kk = Math.max(k, 0);
      const pa = this.frogPads[i * 3 + (kk % 3)] * 4, pb = this.frogPads[i * 3 + ((kk + 1) % 3)] * 4;
      const angA = Math.atan2(P[pb + 1] - P[pa + 1], P[pb] - P[pa]);
      const ax = P[pa] + Math.cos(angA) * P[pa + 2] * 0.55, az = P[pa + 1] + Math.sin(angA) * P[pa + 2] * 0.55;
      const pc = this.frogPads[i * 3 + ((kk + 2) % 3)] * 4, angB = Math.atan2(P[pc + 1] - P[pb + 1], P[pc] - P[pb]);
      const bx = P[pb] + Math.cos(angB) * P[pb + 2] * 0.55, bz = P[pb + 1] + Math.sin(angB) * P[pb + 2] * 0.55;
      let x = ax, y = 0.07, z = az, hop = -1, sq = 0, yaw = Math.atan2(bx - ax, bz - az);
      if (k >= 0 && loc < 1) {
        hop = loc; const e = hop * hop * (3 - 2 * hop);
        x = ax + (bx - ax) * e; z = az + (bz - az) * e; y = 0.07 + Math.sin(Math.PI * hop) * 0.7;
      } else if (k >= 0) {
        x = bx; z = bz; yaw = Math.atan2(Math.cos(angB), Math.sin(angB));
        if (loc < 1.4) sq = 1 - (loc - 1) / 0.4;
      }
      if (loc > per - 0.5) sq = (loc - (per - 0.5)) / 0.5;
      U[48 + i * 4] = x; U[49 + i * 4] = y; U[50 + i * 4] = z; U[51 + i * 4] = yaw;
      U[72 + i * 4] = hop; U[73 + i * 4] = sq; U[74 + i * 4] = (0.5 + 0.5 * Math.sin(t * 1.1 + i * 2.3)) ** 2 * (0.5 + 0.5 * Math.sin(t * 0.13 + i));
      // ripple at landing
      U[16 + i * 4] = P[pb]; U[17 + i * 4] = P[pb + 1]; U[18 + i * 4] = off + kk * per + 0.95 + (k < 0 ? -100 : 0); U[19 + i * 4] = P[pb + 2] * 0.9;
      if (au && k >= 0 && loc > 0.95 && loc < 1.2 && this.lastPlip[i] !== k) { this.lastPlip[i] = k; this.plip(au, P[pb], P[pb + 1]); }
    }
    // fish kisses: small ripples at random lagoon spots
    for (let j = 0; j < 2; j++) {
      const per = j ? 13.3 : 9.7, k = Math.floor(t / per), h = pcg(k * 2 + j + 99), a = u2f(h) * TAU, r = Math.sqrt(u2f(pcg(h))) * 0.75;
      U[40 + j * 4] = LAG[0] + Math.cos(a) * LAG[2] * r; U[41 + j * 4] = LAG[1] + Math.sin(a) * LAG[3] * r; U[42 + j * 4] = k * per + 1; U[43 + j * 4] = 0.05;
    }
    // lotus bloom state (same curve as bloomOf in WGSL) for halos and reflections; chime when one starts to open
    U[171] = ctx.doors && ctx.doors[0] ? ctx.doors[0].open : 0;
    const L = this.lotus;
    for (let i = 0; i < this.lotusSign.length; i++) {
      const o = i * 5, sn = Math.sin(TAU * (t / L[o] + L[o + 1] * TAU)), s = sn > 0 ? 1 : -1;
      U[128 + i * 4] = L[o + 2]; U[129 + i * 4] = L[o + 3]; U[130 + i * 4] = L[o + 4];
      U[131 + i * 4] = ss(0.15, 0.85, 0.5 + 0.5 * sn + 0.06 * Math.sin(t * 0.37 + L[o + 1] * 9));
      if (au && this.lotusSign[i] === -1 && s === 1) this.chime(au, L[o + 2], L[o + 3]);
      this.lotusSign[i] = s;
    }
    // giant flower opens as the visitor comes near
    const F = this.flw, fd = Math.hypot(cam.eye[0] - F[0], cam.eye[2] - F[2]), ft = ss(18, 7, fd);
    this.fb += (ft - this.fb) * (ctx.shot ? 1 : 1 - Math.exp(-dt / 2.5));
    U[172] = this.fb;
    if (au && ft > 0.5 && !this.fOpen) this.chime(au, F[0], F[2], 60);
    if (ft > 0.5) this.fOpen = true; else if (ft < 0.05) this.fOpen = false;
    // hovering birds: wait at a flower, then glide to the next one
    for (let i = 0; i < 2; i++) {
      const T = this.birdT[i], n = T.length / 4, per = 10 + 3.7 * i, tt = t / per + i * 0.37, k = Math.floor(tt), f = tt - k;
      const a = (pcg(k * 3 + i * 101) % n) * 4, b = (pcg(k * 3 + 3 + i * 101) % n) * 4, s = ss(0.7, 1, f), o = 176 + i * 4;
      let dy = T[b + 3] - T[a + 3]; dy -= TAU * Math.round(dy / TAU);
      U[o] = T[a] + (T[b] - T[a]) * s + 0.03 * Math.sin(t * 1.1 + i * 2);
      U[o + 1] = T[a + 1] + (T[b + 1] - T[a + 1]) * s + 0.45 * Math.sin(Math.PI * s) + 0.04 * Math.sin(t * 1.7 + i);
      U[o + 2] = T[a + 2] + (T[b + 2] - T[a + 2]) * s + 0.03 * Math.cos(t * 0.9 + i);
      U[o + 3] = T[a + 3] + dy * s; U[o + 8] = Math.sin(Math.PI * s);
    }
    // vine bridge: the deck carries the walker once stepped on from either end
    const cx = cam.pos[0], cz = cam.pos[2];
    if (!(cx > BRA - 1.5 && cx < BRB + 1.5 && Math.abs(cz - BRZ) < 0.9)) this.brOn = false;
    else if (cam.pos[1] - cam.eyeHeight > deckY(Math.min(1, Math.max(0, (cx - BRA) / (BRB - BRA))), YA, YB) - 1) this.brOn = true;
    if (au) {
      if ((ctx.frame & 15) === 0) { const j = Math.hypot(cx - U[176], cz - U[178]) < Math.hypot(cx - U[180], cz - U[182]) ? 176 : 180; this.hum.setPos(U[j], U[j + 1], U[j + 2]); }
      this.creakT -= dt * cam.moving;
      if (this.brOn && this.creakT < 0) { this.creakT = 1.2 + au.rng() * 1.6; au.chirp({ f0: 150 + au.rng() * 60, f1: 110, dur: 0.22, vib: 6, vibRate: 11, gain: 0.012, bus: this.brBus }); }
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
    pass.setPipeline(this.pTerr); pass.setVertexBuffer(0, this.terr.vb); pass.setIndexBuffer(this.terr.ib, 'uint32'); pass.drawIndexed(this.terr.n);
    pass.setPipeline(this.pTree); for (let i = 0; i < this.treeCats.length; i++) this.drawCat(pass, this.treeCats[i]);
    pass.setPipeline(this.pProp); this.drawCat(pass, this.rockCat); this.drawCat(pass, this.shrubCat); this.drawCat(pass, this.mushCat);
    this.drawCat(pass, this.rosCat); this.drawCat(pass, this.lanCat); this.drawCat(pass, this.reedCat); this.drawCat(pass, this.tuftCat);
    for (let i = 0; i < this.propX.length; i++) this.drawCat(pass, this.propX[i]);
    pass.setPipeline(this.pFern); this.drawCat(pass, this.fernCat);
    pass.setPipeline(this.pFan); this.drawCat(pass, this.fanCat);
    pass.setPipeline(this.pSpi); this.drawCat(pass, this.spiCat);
    pass.setPipeline(this.pPad); this.drawCat(pass, this.padCat); this.drawCat(pass, this.padX);
    pass.setPipeline(this.pLotus); this.drawCat(pass, this.lotusCat); this.drawCat(pass, this.lotX);
    pass.setPipeline(this.pLemur); this.drawCat(pass, this.lemCat);
    pass.setPipeline(this.pBird); pass.setVertexBuffer(0, this.birdM.vb); pass.setIndexBuffer(this.birdM.ib, 'uint32'); pass.drawIndexed(this.birdM.n, 2);
    pass.setPipeline(this.pFish); pass.setVertexBuffer(0, this.fishM.vb); pass.setVertexBuffer(1, this.fishB); pass.setIndexBuffer(this.fishM.ib, 'uint32'); pass.drawIndexed(this.fishM.n, this.nFish);
    pass.setPipeline(this.pFrog); pass.setVertexBuffer(0, this.frogM.vb); pass.setIndexBuffer(this.frogM.ib, 'uint32'); pass.drawIndexed(this.frogM.n, 6);
    pass.setPipeline(this.pPetal); pass.draw(6, 36);
    pass.setPipeline(this.pSky); pass.draw(3);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.cBG);
    pass.setPipeline(this.pWater); pass.setVertexBuffer(0, this.waterM.vb); pass.setIndexBuffer(this.waterM.ib, 'uint32'); pass.drawIndexed(this.waterM.n);
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
    p.setPipeline(this.pFall); p.setVertexBuffer(0, this.fallM.vb); p.setIndexBuffer(this.fallM.ib, 'uint32'); p.drawIndexed(this.fallM.n, 2);
    p.setPipeline(this.pPuff); p.draw(6, 277);
    p.setPipeline(this.pWing); p.draw(30, this.nWing);
    p.setPipeline(this.pFishGlow); p.setVertexBuffer(0, this.fishB); p.draw(6, this.nFish);
    p.setPipeline(this.pSpore); p.draw(6, this.nSpore + this.nFly);
    p.end();
  },

  lastPlip: new Int32Array([-1, -1, -1, -1, -1, -1]),
  fb: 0, fOpen: false, brOn: false, creakT: 1,
  plip(a, x, z) {
    const s = this.sp || (this.sp = a.spatial({ pos: [x, 0, z], ref: 4, reverb: 0.5, gain: 1 }));
    s.setPos(x, 0.2, z);
    a.chirp({ f0: 900 + a.rng() * 300, f1: 380, dur: 0.07, vib: 0, gain: 0.05, bus: s });
    a.pluck({ freq: 180 + a.rng() * 40, decay: 0.5, gain: 0.02, bus: s, when: a.now() + 0.02 });
  },
  chime(a, x, z, low = 0) {
    const s = this.cs || (this.cs = a.spatial({ pos: [x, 0.5, z], ref: 8, reverb: 0.8 }));
    s.setPos(x, 0.5, z);
    const n = this.notes; const t = a.now();
    for (let i = 0; i < (low ? 5 : 3); i++) a.bell({ freq: a.hz(n[(a.rng() * n.length) | 0] - (low ? 12 : 0)), gain: 0.02, decay: 5, ratio: 2.01, index: 1.2, when: t + i * (0.25 + a.rng() * 0.3), bus: s });
  },
  audio(ctx, a) {
    this.notes = a.scale(69, 'mixolydian', 2);
    a.setReverb({ seconds: 5, damp: 0.5, wet: 0.85 });
    // night insects: high band-passed noise shimmer + soft low bed
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 5200, q: 3, gain: 0.012, mod: 0.15, modRate: 0.08, gainMod: 0.6 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 260, gain: 0.035, mod: 0.3 });
    // waterfall, rising as you approach
    const wf = a.spatial({ pos: [this.wf[0], 3, this.wf[3] - 1], ref: 9, rolloff: 1.3, reverb: 0.3 });
    a.noiseBed({ color: 'pink', filter: 'lowpass', freq: 1400, gain: 0.16, mod: 0.15, gainMod: 0.15, bus: wf });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 400, gain: 0.2, mod: 0.1, bus: wf });
    // slow pads following the colour cycle
    a.drone({ freq: a.hz(33), partials: [1, 2, 3, 5.01], gain: 0.02, cutoff: 480 });
    a.pad({ chords: [[57, 64, 69, 73], [55, 62, 67, 71], [62, 66, 69, 74], [52, 59, 64, 67]], gain: 0.016, change: [22, 38], cutoff: 1000, attack: 7 });
    // A mixolydian: a wooden marimba (3 steps) against a kalimba (4 steps) over 12 eighth-notes, soft hand drum and shaker, breathy wood flute phrases
    const r = a.rng, MX = a.scale(57, 'mixolydian', 3); // A3 B3 C#4 D4 E4 F#4 G4 A4 ...
    const TEMPO = 86, E8 = 60 / TEMPO / 2;
    const POOLS = [[0, 2, 4, 7], [0, 4, 6, 9], [3, 5, 7, 10], [-2, 0, 2, 4], [1, 4, 7, 9]];
    const ostinato = (when) => {
      const pool = r.pick(POOLS).map((d) => MX[Math.max(0, d + 3)]), cycles = 3 + r.int(4), swap = r() < 0.3;
      const mar = [0, 1, 2, 1].map((i) => pool[i]), kal = [2, 3, 1].map((i) => pool[i] + 12);
      for (let c = 0; c < cycles; c++) for (let s8 = 0; s8 < 12; s8++) {
        const t = when + (c * 12 + s8) * E8;
        if (s8 % 3 === 0 && r() > 0.22) a.marimba({ midi: mar[(c * 4 + s8 / 3) % 4] - (swap ? 12 : 0), when: t, gain: 0.045, vel: s8 === 0 ? 1 : 0.7, pan: -0.25, reverb: 0.4 });
        if (s8 % 4 === 0 && r() > 0.22) a.kalimba({ midi: kal[(c * 3 + s8 / 4) % 3], when: t, gain: 0.04, vel: 0.8, pan: 0.3, reverb: 0.5 });
        if (s8 === 0 && c % 2 === 0) a.handDrum({ when: t, gain: 0.03 });
        if (r() < 0.45 && s8 % 2 === 1) a.shaker({ when: t, gain: 0.008 + r() * 0.006, pan: 0.2 });
      }
    };
    // flute motif: E-C#-G-A with the fourth rest, answering phrases and an alternate ending
    const FM = [{ deg: 11, dur: 1 }, { deg: 9, dur: 0.5 }, { deg: 13, dur: 2 }, { rest: 1, dur: 0.5 }, { deg: 12, dur: 0.75 }, { deg: 11, dur: 0.75 }, { deg: 7, dur: 3 }];
    const fl = (when) => {
      const x = r(), sh = r.pick([0, 0, -2, 2]);
      let ns = FM.map((n) => (n.rest ? n : { ...n, deg: n.deg + sh, vel: 0.9 }));
      if (x < 0.3) ns = ns.slice(0, 3);
      else if (x < 0.55) ns = ns.slice(0, 6).concat([{ deg: 8 + sh, dur: 2.5 }]);
      else if (x < 0.7) ns = ns.slice(4);
      a.phrase({ notes: ns, inst: a.flute, opts: { preset: 'wood', gain: 0.05, reverb: 0.55, vibrato: 14 }, when, tempo: 64, scale: MX });
    };
    let lastKind = 0;
    a.every(22, 48, (when) => {
      const x = r();
      if (x < 0.4 && lastKind !== 1) { ostinato(when); lastKind = 1; if (r() < 0.4) fl(when + 16 + r() * 6); }
      else if (x < 0.8 && lastKind !== 2) { fl(when); lastKind = 2; }
      else { ostinato(when); lastKind = 1; }
    }, { startDelay: 7 });
    // frogs and crickets, sparse
    a.every(3, 9, (when) => a.chirp({ f0: 520 + a.rng() * 200, f1: 380, dur: 0.09, repeat: 2 + a.rng.int(4), gap: 0.11, vib: 20, vibRate: 30, gain: 0.012, when, pan: a.rng.range(-0.9, 0.9), reverb: 0.6 }));
    a.every(5, 14, (when) => a.chirp({ f0: 3900, f1: 4300, dur: 0.05, repeat: 3 + a.rng.int(5), gap: 0.04, gain: 0.006, when, pan: a.rng.range(-0.8, 0.8) }));
    // new places: creature calls in the grove, soft low tones under the big caps, drops at the pool, a wing hum that follows the nearest bird
    const gy = this.hAt(GRV[0], GRV[1]);
    const grove = a.spatial({ pos: [GRV[0], gy + 4, GRV[1]], ref: 9, rolloff: 1.2, reverb: 0.6 });
    a.every(9, 22, (when) => { const f = 620 + a.rng() * 260; a.chirp({ f0: f, f1: f * 1.32, dur: 0.16, repeat: 2 + a.rng.int(2), gap: 0.2, vib: 10, vibRate: 9, gain: 0.014, when, bus: grove }); }, { startDelay: 4 });
    a.every(7, 16, (when) => a.additive({ freq: a.hz(a.rng.pick([45, 49, 52, 55])), partials: [1, 0.4, 0.12], attack: 1.2, decay: 4, gain: 0.02, when, bus: grove }));
    const pool = a.spatial({ pos: [POOL[0], 0.3, POOL[1]], ref: 6, rolloff: 1.3, reverb: 0.85 });
    a.every(4, 11, (when) => a.pluck({ freq: a.hz(a.rng.pick(this.notes)), decay: 1.6, gain: 0.014, when, bus: pool }));
    this.hum = a.spatial({ pos: [0, 1, -30], ref: 2.5, rolloff: 1.6, reverb: 0.2 });
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 170, q: 5, gain: 0.05, mod: 0.2, modRate: 0.5, gainMod: 0.3, bus: this.hum });
    this.brBus = a.spatial({ pos: [(BRA + BRB) / 2, YA, BRZ], ref: 5, reverb: 0.4 });
    a.every(14, 30, (when) => a.bell({ freq: a.hz(a.rng.pick(this.notes) + 12), gain: 0.008, decay: 6, ratio: 3.01, index: 0.8, when, pan: a.rng.range(-0.7, 0.7), reverb: 0.9 }));
  },
};
