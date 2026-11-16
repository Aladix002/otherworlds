// Deterministic terrain + village layout for aurora-fjord (pure JS, no GPU).
import { fbm2, ridge2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { HOUSE } from './geo.js';

const TAU = Math.PI * 2;
export const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export const ZH = 6, KP = 26;                       // head of the cove (z), parabola width
export const DOOR = [9, 0, 37], DOOR_YAW = 0.18;
export const PIER = [2, 12.5, -17, 1.02];            // x, z land end, z sea end, deck height
export const SPAWN = [-1.5, 0, 21];
export const MOON = (() => { const v = [-0.55, 0.5, 0.62], l = Math.hypot(...v); return v.map((c) => c / l); })();
export const VC = [0, -20], VR = 80, VN = 1024;      // village map centre, half extent (m), resolution
export const KNOLL = [42, 50], CLR = [-50, 30], ICE = [-65.3, 33], HERD = [50, 15];   // view hill, forest clearing, frozen fall, reindeer
const CA = [-74, 6], CB = [-72, 56];                 // spine of the rock rib behind the clearing
// signed distance to the rock rib (m): < 0 inside
export function cliffD(x, z) {
  if (x > -50 || z < -14 || z > 76) return 9;
  const vx = CB[0] - CA[0], vz = CB[1] - CA[1], h = Math.min(1, Math.max(0, ((x - CA[0]) * vx + (z - CA[1]) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - CA[0] - vx * h, z - CA[1] - vz * h) - 10 + 2.2 * fbm2(x * 0.07, z * 0.07, 2);
}

const cxAt = (z) => { const u = Math.max(0, -(z + 40)), w = u * u / (u + 200); return 120 * Math.sin(w * 0.003); };
// distance-like shore function (m): > 0 land, < 0 water. Twin: shoreD() in common.wgsl
export function shore(x, z) { const xx = x - cxAt(z), g = 2 * xx / KP; return (z - ZH + xx * xx / KP) / Math.sqrt(1 + g * g); }
function mtn(x, z, s) {
  const r = ss(18, 640, s), b = fbm2(x * 0.0004 + 9, z * 0.0004 + 4, 2) * 0.5 + 0.5;
  const a = ridge2(x * 0.00095 + 3.1, z * 0.00095 - 1.7, 3);
  const e = (x + 60) / 330, val = 1 - 0.8 * Math.exp(-e * e) * ss(-200, 100, z);
  return Math.pow(r, 1.5) * val * (Math.pow(a, 1.6) * (330 + 500 * b) + 70 * b + 30 * fbm2(x * 0.007, z * 0.007, 3) * (0.25 + a));
}
export function height(x, z) {
  const s = shore(x, z);
  if (s <= 0) return 0.25 - 5 * (1 - Math.exp(s / 28));
  let h = 0.25 + 2.2 * (1 - Math.exp(-s / 14)) + 0.02 * s;
  h += (0.14 * fbm2(x * 0.13, z * 0.13, 2) * ss(0, 5, s) + 0.7 * fbm2(x * 0.021 + 5, z * 0.021, 3) * ss(6, 40, s)) * ss(2.5, 7, Math.hypot(x - DOOR[0], z - DOOR[2]));
  if (s > 18) h += mtn(x, z, s);
  const kr = (x - KNOLL[0]) ** 2 + (z - KNOLL[1]) ** 2;
  if (kr < 3600) h += 9 * Math.exp(-kr / 340);
  const cd = cliffD(x, z);
  if (cd < 1.5) h += 15 * ss(1.5, -3.5, cd) * (1 + 0.25 * fbm2(x * 0.05 + 3, z * 0.05, 2)) * (1 - 0.14 * Math.exp(-((z - ICE[1]) ** 2) / 6)) + 1.5 * fbm2(x * 0.3, z * 0.3, 3) * ss(1.5, -2, cd);
  return h;
}
const yawOf = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const slopeAt = (x, z) => Math.hypot(height(x + 3, z) - height(x - 3, z), height(x, z + 3) - height(x, z - 3)) / 6;
// forest density 0..1 (also painted on far slopes by the terrain shader)
export function forest(x, z, s, h) {
  return ss(24, 60, s) * ss(250, 150, h + 60 * fbm2(x * 0.004, z * 0.004, 2)) * ss(-0.08, 0.16, fbm2(x * 0.011 + 2, z * 0.011, 2));
}

// ---- village ----
// [z along the arm, side, distance inland, variant, colour, lit window mask]
const HS = [
  [-2, -1, 1.2, 0, 0, 0b0111], [-13, -1, 0.8, 1, 1, 0b111011], [-26, -1, 1.0, 0, 2, 0b0101], [-40, -1, 0.6, 3, 0, 0b01], [-56, -1, 0.9, 1, 3, 0b101110], [-74, -1, 0.8, 0, 1, 0b1011],
  [-4, 1, 1.0, 1, 1, 0b110111], [-16, 1, 0.9, 0, 0, 0b1110], [-29, 1, 0.7, 1, 2, 0b011101], [-44, 1, 1.0, 0, 4, 0b0111], [-60, 1, 0.6, 3, 1, 0b00], [-78, 1, 0.9, 1, 0, 0b111010],
  [-9, -1, 19, 2, 2, 0b1011011101], [-33, -1, 17, 0, 1, 0b1101], [-49, -1, 18, 1, 0, 0b110110], [-67, -1, 16, 0, 3, 0b0110],
  [-10, 1, 17, 0, 3, 0b1011], [-36, 1, 19, 2, 0, 0b0111101011], [-53, 1, 17, 0, 2, 0b1110], [-70, 1, 18, 1, 1, 0b011011],
  [27, 0, -20, 1, 0, 0b101101], [23, 0, 25, 0, 1, 0b0111],
  [-48, -1, 0.8, 4, 5, 0b1111],                       // the sauna
];
export const LAMPS = [[PIER[0] + 0.95, PIER[2] + 0.6], [13, 29.5], [-18.5, 8.5], [23, -1], [-35, -30], [38, -33], [KNOLL[0] - 4.2, KNOLL[1] - 1.2]];
const PATHS = [
  [[SPAWN[0], SPAWN[2]], [1.5, 16], [PIER[0], 12], [PIER[0], PIER[2] + 1.5]],
  [[SPAWN[0], SPAWN[2]], [2.5, 26], [6.5, 32], [DOOR[0] + 0.6 * Math.sin(DOOR_YAW), DOOR[2] + 0.6 * Math.cos(DOOR_YAW)]],
  [[SPAWN[0], SPAWN[2]], [-9, 15], [-20, 5], [-29, -12], [-37, -32], [-44, -55], [-50, -74]],
  [[1.5, 16], [11, 13], [22, 3], [31, -14], [39, -34], [46, -56], [52, -76]],
  [[-20, 5], [-30, 12], [-40, 22], [CLR[0] + 3.5, CLR[1] - 1]],
  [[6.5, 32], [15, 35.5], [22, 37.5], [27, 35.8], [33, 40], [38, 46], [KNOLL[0] - 0.5, KNOLL[1] - 0.5]],
];
// the fox's round (closed loop) and things random scatter must stay away from: [x, z, r]
const FOXP = [[19, 19], [9, 17], [-2, 15], [-9, 18.5], [-11.5, 23], [-10, 28], [-5, 31.5], [3, 33], [9, 33.2], [15, 33], [21, 28]];
const SNOWMEN = [[-12.3, 7.1, 0.96, 1.1], [17.5, 9.5, -1.2, 0.8], [20.5, 33, 0.5, 0.65]];
const KEEP = [[CLR[0], CLR[1], 8], [KNOLL[0], KNOLL[1], 4.5], [HERD[0], HERD[1], 12], [-60.5, ICE[1], 4], [CLR[0] + 10.5, CLR[1] - 7, 6.5]];
// closed Catmull-Rom loop sampled to [x, z, arc length] * (n + 1)
export function loopPath(P, n = 360) {
  const o = new Float32Array((n + 1) * 3), m = P.length;
  for (let i = 0; i <= n; i++) {
    const u = i / n * m, k = Math.floor(u) % m, t = u - Math.floor(u), a = P[(k + m - 1) % m], b = P[k], c = P[(k + 1) % m], d = P[(k + 2) % m];
    for (let j = 0; j < 2; j++) o[i * 3 + j] = 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t);
    o[i * 3 + 2] = i ? o[i * 3 - 1] + Math.hypot(o[i * 3] - o[i * 3 - 3], o[i * 3 + 1] - o[i * 3 - 2]) : 0;
  }
  return o;
}
const HERO_TREES = [[25, 32, 1.25], [29, 39, 1.0], [-9, 48, 1.35], [17, 50, 1.1], [-11, 37, 0.95], [-16, 43, 1.3], [3, 52, 1.2], [27, 45, 1.4], [-27, 17, 1.0], [30, 12, 1.15], [-30, 34, 1.3], [33, 27, 0.9]];

export function buildLayout(q) {
  const R = makeRng(4242), R2 = makeRng(977), L = { houses: HOUSE.map(() => []), pools: [[CLR[0], CLR[1], 1.5]], chim: [], col: [], wins: [], foot: [], rocks: [], posts: [], shad: [], trees: [], lamps: [], prints: [], paths: PATHS, puffs: [] };
  const cot = Math.hypot(MOON[0], MOON[2]) / MOON[1], ml = Math.hypot(MOON[0], MOON[2]), mx = -MOON[0] / ml, mz = -MOON[2] / ml;
  for (const [zz, sg, off, v, ci, mask] of HS) {
    const sx = sg ? cxAt(zz) + sg * Math.sqrt(KP * (ZH - zz)) : off;
    let nx = shore(sx + 0.5, zz) - shore(sx - 0.5, zz), nz = shore(sx, zz + 0.5) - shore(sx, zz - 0.5); const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const d = sg ? off - shore(sx, zz) : 0, x = sx + nx * d, z = zz + nz * d, yaw = Math.atan2(nx, nz) + (R() - 0.5) * 0.16;
    const H = HOUSE[v], y = sg && off < 5 ? 1.3 : height(x, z) + 0.55, c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (p) => [x + c * p[0] + s * p[2], y + p[1], z - s * p[0] + c * p[2]];
    L.houses[v].push(x, y, z, 1, yaw, ci + R() * 0.98, 1, mask);
    if (H.chim) L.chim.push(W(H.chim));
    if (v === 4) { L.chim.push(W([0.3, 1.2, -H.l / 2 - 0.5]), W([-0.4, 0.6, -H.l / 2 - 1.2]), W([0, -1, -H.l / 2 - 4.4]), W([0.2, 2, 0])); L.hole = W([0, 0, -H.l / 2 - 4.6]); }     // sauna steam, hole in the ice
    L.col.push(x, z, H.w / 2 + 0.25, H.l / 2 + 0.25, c, s);
    L.foot.push([x, z, H.w / 2, H.l / 2, c, s]);
    for (const w of H.wins) if (mask >> w.id & 1) { const p = W(w.p); L.wins.push([p[0], p[2], c * w.n[0] + s * w.n[1], -s * w.n[0] + c * w.n[1], p[1] - height(p[0], p[2]) < 3.5 ? 1 : 0.5]); }
    if (H.lamp) { const p = W(H.lamp); L.wins.push([p[0], p[2], c * H.lamp[3] + s * H.lamp[4], -s * H.lamp[3] + c * H.lamp[4], 0.8]); }
    const hh = H.h * cot * 0.9;
    L.shad.push([x, z, x + mx * hh, z + mz * hh, H.w * 0.55, H.w * 0.45, 1.6, 0.8]);
  }
  for (const [x, z] of LAMPS) { L.lamps.push([x, height(x, z) < 0.4 ? PIER[3] + 0.1 : height(x, z), z]); L.col.push(x, z, 0.22, 0.22, 1, 0); }
  // trees: [x, y, z, scale, yaw, seed, 1, 1]
  const clear = (x, z, m) => {
    for (let i = 0; i < L.col.length; i += 6) if (Math.hypot(x - L.col[i], z - L.col[i + 1]) < Math.max(L.col[i + 2], L.col[i + 3]) + m) return 0;
    for (const p of PATHS) for (let k = 0; k < p.length - 1; k++) {
      const ax = p[k][0], az = p[k][1], vx = p[k + 1][0] - ax, vz = p[k + 1][1] - az, h = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      if (Math.hypot(x - ax - vx * h, z - az - vz * h) < m + 1.2) return 0;
    }
    for (const [kx, kz, kr] of KEEP) if (Math.hypot(x - kx, z - kz) < kr + m * 0.5) return 0;
    return Math.hypot(x - DOOR[0], z - DOOR[2]) > 6 + m;
  };
  // cabins on ice floes that hang in the air over the fjord: [x, y, z, yaw]
  L.floes = [[13, 11, -26, 0.5], [-15, 17, -44, 2.2], [9, 24, -66, 4]];
  for (const [x, y, z, a] of L.floes) L.houses[4].push(x, y, z, 0.8, a, 5.3, 1, 15);
  // ---- new places and life ----
  const fox = L.fox = loopPath(FOXP);
  for (let i = 0; i < 360; i += 6) KEEP.push([fox[i * 3], fox[i * 3 + 1], 1.3]);
  for (let s = 0.2, i = 0, side = 1; s < fox[1080 + 2]; s += 0.2, side = -side) {
    while (fox[i * 3 + 5] < s) i++;
    const dx = fox[i * 3 + 3] - fox[i * 3], dz = fox[i * 3 + 4] - fox[i * 3 + 1], l = Math.hypot(dx, dz);
    L.prints.push(fox[i * 3] + dz / l * 0.015 * side, fox[i * 3 + 1] - dx / l * 0.015 * side, Math.atan2(-dx, -dz) + 100);
  }
  L.snowmen = SNOWMEN.map(([x, z, a, sc]) => { L.col.push(x, z, 0.5, 0.5, 1, 0); KEEP.push([x, z, 2.2]); return [x, height(x, z), z, a, sc]; });
  const at = (x, z, up = 0) => [x, height(x, z) + up, z];
  const ky = yawOf(KNOLL[0], KNOLL[1], 8, -60);
  L.bench = [...at(KNOLL[0] - 1.2, KNOLL[1] - 2.2), ky + Math.PI - 0.75];
  L.cairn = at(KNOLL[0] + 3.4, KNOLL[1] - 3.4);
  L.signs = [at(29.5, 40.5)]; L.col.push(29.5, 40.5, 0.3, 0.3, 1, 0, 33.5, 40, 1, 1, 1, 0); KEEP.push([31.5, 40.5, 4]);
  L.camp = at(CLR[0], CLR[1]);
  L.lean = [...at(CLR[0] - 1.6, CLR[1] + 5.4), yawOf(CLR[0] - 1.6, CLR[1] + 5.4, CLR[0], CLR[1]) + Math.PI];
  L.col.push(L.bench[0], L.bench[2], 0.9, 0.9, 1, 0, L.cairn[0], L.cairn[2], 0.6, 0.6, 1, 0, CLR[0], CLR[1], 0.75, 0.75, 1, 0, L.lean[0], L.lean[2], 1.9, 1.9, 1, 0);
  // creatures: [x, y, z, scale, yaw, seed, kind, phase]. kind 1 reindeer, 2 seal, 3 owl (0 = the fox, moved every frame)
  L.life = [[], [], [], []];
  L.owlPosts = [[6.3, 34.5, 2.6, 0.37], [CLR[0] + 5.5, CLR[1] - 8.2, 0.6, 0.71]].map(([x, z, a, sd]) => {
    L.life[3].push(...at(x, z, 1.38), 1.05, a, sd, 3, 0); L.col.push(x, z, 0.15, 0.15, 1, 0); return at(x, z);
  });
  for (const [x, a, sc] of [[6.6, 0.7, 1], [8.8, 2.4, 0.8], [-9.5, -1.9, 1.1], [10.2, 0.2, 0.62]]) {
    let z0 = -30, z1 = 8;
    for (let i = 0; i < 24; i++) { const zm = (z0 + z1) / 2; if (shore(x, zm) < -3.1) z0 = zm; else z1 = zm; }
    L.life[2].push(x, 0.0, z0, sc, a, R2(), 2, 0);
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4 + R2(), r = i ? 3.5 + 6.5 * R2() : 0, x = HERD[0] + Math.cos(a) * r, z = HERD[1] + Math.sin(a) * r * 0.8, sc = i === 3 ? 0.62 : 0.9 + 0.2 * R2();
    L.life[1].push(x, height(x, z) + 0.02, z, sc, R2() * TAU, R2(), 1, 0); L.col.push(x, z, 0.55, 0.55, 1, 0);
  }
  const tree = (x, z, sc) => {
    L.trees.push(x, height(x, z) - 0.25 * sc, z, sc, R() * TAU, R(), 1, 1);
    if (Math.hypot(x, z + 20) < 110) { L.col.push(x, z, 0.4 * sc, 0.4 * sc, 1, 0); L.shad.push([x, z, x + mx * 8 * sc * cot, z + mz * 8 * sc * cot, 0.5 * sc, 1.9 * sc, 1.4, 0.6]); L.puffs.push([x, height(x, z) + 6.5 * sc, z]); }
  };
  for (const [x, z, sc] of HERO_TREES) tree(x, z, sc);
  // the grove around the clearing
  for (let i = 0; i < 150; i++) {
    const a = R2() * TAU, rad = 10 + 26 * R2(), x = CLR[0] + Math.cos(a) * rad, z = CLR[1] + Math.sin(a) * rad;
    if (cliffD(x, z) > 2.5 && clear(x, z, 3) && shore(x, z) > 14) tree(x, z, 0.7 + 0.75 * R2());
  }
  // half-buried boulders and a few marker posts along the paths give the snow foreground something to hold on to
  for (let i = 0, t = 0; i < 70 && t < 4000; t++) {
    const a = R() * TAU, rad = 6 + 70 * R(), x = Math.cos(a) * rad, z = Math.sin(a) * rad + 8, s = shore(x, z);
    if (s < 0.5 || !clear(x, z, 0.8)) continue;
    const sc = 0.22 + 0.75 * R() * R();
    L.rocks.push(x, height(x, z) - 0.3 * sc, z, sc, R() * TAU, R(), 1, 0); i++;
    if (sc > 0.6) L.col.push(x, z, sc * 0.6, sc * 0.6, 1, 0);
  }
  for (const [x, z] of [[4.5, 19], [5.6, 27.5], [-0.6, 26.5], [-12, 13], [14, 11.5], [-23, 1], [25, -2], [9.5, 31]]) { L.posts.push([x, height(x, z), z]); L.col.push(x, z, 0.12, 0.12, 1, 0); }
  const NT = [2200, 4000, 5500][q];
  for (let i = 0, t = 0; i < NT && t < 60000; t++) {
    const a = R() * TAU, rad = 34 + 950 * Math.pow(R(), 1.5), x = Math.cos(a) * rad, z = Math.sin(a) * rad - 15, s = shore(x, z);
    if (s < 22) continue;
    const h = height(x, z);
    if (R() > forest(x, z, s, h) || slopeAt(x, z) > 0.85 || !clear(x, z, 3.5)) continue;
    tree(x, z, 0.75 + 0.8 * R() * R() + ss(100, 500, rad) * 0.25); i++;
  }
  // baked footprints along the first two paths: [x, z, yaw]
  for (const p of PATHS.slice(0, 2)) for (let k = 0, side = 1, carry = 0.5; k < p.length - 1; k++) {
    const ax = p[k][0], az = p[k][1], dx = p[k + 1][0] - ax, dz = p[k + 1][1] - az, len = Math.hypot(dx, dz), yaw = Math.atan2(-dx, -dz);
    for (; carry < len; carry += 0.66 + R() * 0.08, side = -side) L.prints.push(ax + dx / len * carry + dz / len * 0.12 * side, az + dz / len * carry - dx / len * 0.12 * side, yaw + (R() - 0.5) * 0.2 - side * 0.12);
    carry -= len;
  }
  return L;
}

// ---- collision + walking ----
export function heightAt(x, z) {
  let h = Math.max(height(x, z), 0.03);
  if (z < PIER[1] && z > PIER[2] - 0.3) h = Math.max(h, (PIER[3] + 0.12) * ss(1.5, 1.2, Math.abs(x - PIER[0])));
  return h;
}
export function makeSdf(col) {
  const C = Float32Array.from(col), n = C.length / 6;
  return (x, y, z) => {
    // water is closed (except the pier)
    const px = Math.abs(x - PIER[0]) - 1.05, pz = Math.max(z - PIER[1], PIER[2] + 0.4 - z);
    let d = Math.max(shore(x, z) + 1.9, -Math.max(px, pz));
    for (let i = 0; i < n; i++) {
      const k = i * 6, dx = x - C[k], dz = z - C[k + 1];
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
      const lx = Math.abs(C[k + 4] * dx - C[k + 5] * dz) - C[k + 2], lz = Math.abs(C[k + 5] * dx + C[k + 4] * dz) - C[k + 3];
      const e = lx > 0 && lz > 0 ? Math.hypot(lx, lz) : Math.max(lx, lz);
      if (e < d) d = e;
    }
    return Math.min(d, cliffD(x, z) - 1.3);
  };
}

// ---- terrain meshes: 4 nested grids (1, 4, 16, 64 m cells), each { pos, nrm, uv (moon shadow, forest), idx } ----
export function buildTerrain(L) {
  const NL = [192, 192, 192, 384], cells = [1, 4, 16, 32], Hs = [], out = [], Sh = [];
  for (let l = 0; l < 4; l++) {
    const c = cells[l], N = NL[l], M = N + 3, H = new Float32Array(M * M), half = c * N / 2;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) H[j * M + i] = height(VC[0] - half + (i - 1) * c, VC[1] - half + (j - 1) * c);
    Hs.push(H);
  }
  const hs = (x, z) => {                                 // coarse bilinear height (levels 2, 3)
    for (let l = 2; l < 4; l++) {
      const c = cells[l], N = NL[l], M = N + 3, u = (x - VC[0]) / c + N / 2 + 1, v = (z - VC[1]) / c + N / 2 + 1;
      if (u < 0 || v < 0 || u >= M - 1 || v >= M - 1) continue;
      const i = u | 0, j = v | 0, fu = u - i, fv = v - j, H = Hs[l], k = j * M + i;
      return (H[k] * (1 - fu) + H[k + 1] * fu) * (1 - fv) + (H[k + M] * (1 - fu) + H[k + M + 1] * fu) * fv;
    }
    return 0;
  };
  const ml = Math.hypot(MOON[0], MOON[2]), mx = MOON[0] / ml, mz = MOON[2] / ml, tan = MOON[1] / ml;
  for (let l = 0; l < 4; l++) {
    const c = cells[l], N = NL[l], M = N + 3, half = c * N / 2, H = Hs[l], n1 = N + 1, nv = n1 * n1 + (l < 3 ? 4 * n1 : 0), inner = l ? cells[l - 1] * NL[l - 1] / 2 + 1e-3 : -1;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [], inn = new Uint8Array(n1 * n1);
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const v = j * n1 + i, k = (j + 1) * M + i + 1, x = VC[0] - half + i * c, z = VC[1] - half + j * c, y = H[k];
      const gx = (H[k + 1] - H[k - 1]) / (2 * c), gz = (H[k + M] - H[k - M]) / (2 * c), nl = Math.hypot(gx, 1, gz);
      inn[v] = Math.abs(x - VC[0]) < inner && Math.abs(z - VC[1]) < inner;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nrm[v * 3] = -gx / nl; nrm[v * 3 + 1] = 1 / nl; nrm[v * 3 + 2] = -gz / nl;
      let oc = 0;
      if (y > -0.5) for (let s = 0, t = 14; s < 20; s++, t *= 1.32) oc = Math.max(oc, (hs(x + mx * t, z + mz * t) - y - tan * t) / (0.06 * t + 2));
      const sm = 1 - ss(0, 1, oc); let sh = sm;
      if (l < 2) for (const [ax, az, bx, bz, r0, r1, soft, dark] of L.shad) {
        const vx = bx - ax, vz = bz - az, h = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        const d = Math.hypot(x - ax - vx * h, z - az - vz * h) - (r0 + (r1 - r0) * h), sf = soft * (0.4 + 0.6 * h) + c * 0.5;
        if (d < sf) sh *= 1 - dark * (1 - ss(-sf, sf, d));
      }
      sh = sm + (sh - sm) * ss(3.5, 8, Math.hypot(x - DOOR[0], z - DOOR[2]));
      uv[v * 2] = sh; uv[v * 2 + 1] = forest(x, z, shore(x, z), y);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * n1 + i, b = a + 1, d = a + n1, e = d + 1;
      if (inn[a] && inn[b] && inn[d] && inn[e]) continue;
      idx.push(a, d, b, b, d, e);
    }
    if (l < 3) {                                           // skirt hides the T-junctions against the coarser level
      let v = n1 * n1;
      const edge = (f) => { for (let i = 0; i < n1; i++, v++) { const s = f(i); pos.set(pos.subarray(s * 3, s * 3 + 3), v * 3); pos[v * 3 + 1] -= c * 2; nrm.set(nrm.subarray(s * 3, s * 3 + 3), v * 3); uv.set(uv.subarray(s * 2, s * 2 + 2), v * 2); if (i) { const p = f(i - 1); idx.push(p, s, v - 1, s, v, v - 1, p, v - 1, s, s, v - 1, v); } } };
      edge((i) => i); edge((i) => N * n1 + i); edge((i) => i * n1); edge((i) => i * n1 + N);
    }
    out.push({ pos, nrm, uv, idx: Uint32Array.from(idx) }); Sh.push(uv);
  }
  // moon shadow of the mountains at a point (levels 2 / 3, no object shadows)
  const shadowAt = (x, z) => {
    for (let l = 2; l < 4; l++) {
      const c = cells[l], N = NL[l], u = (x - VC[0]) / c + N / 2, v = (z - VC[1]) / c + N / 2;
      if (u >= 0 && v >= 0 && u < N && v < N) return Sh[l][((v | 0) * (N + 1) + (u | 0)) * 2];
    }
    return 1;
  };
  return { geos: out, shadowAt };
}

// ---- village map (VN^2 rgba8): r = warm light pools, g = contact shade, b = trodden paths, a = door light spill ----
export function buildMap(L) {
  const n = VN, r = new Float32Array(n * n), g = new Float32Array(n * n).fill(1), b = new Float32Array(n * n), a = new Float32Array(n * n);
  const T = (v) => Math.floor((v + VR) / (2 * VR) * n);
  // capsule stamp: f(d, h) -> value written through op
  const seg = (ch, ax, az, bx, bz, m, f) => {
    ax -= VC[0]; bx -= VC[0]; az -= VC[1]; bz -= VC[1];
    const i0 = Math.max(0, T(Math.min(ax, bx) - m)), i1 = Math.min(n - 1, T(Math.max(ax, bx) + m)), j0 = Math.max(0, T(Math.min(az, bz) - m)), j1 = Math.min(n - 1, T(Math.max(az, bz) + m));
    const vx = bx - ax, vz = bz - az, vv = vx * vx + vz * vz || 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / n * 2 * VR - VR, z = (j + 0.5) / n * 2 * VR - VR, h = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / vv));
      ch[j * n + i] = f(ch[j * n + i], Math.hypot(x - ax - vx * h, z - az - vz * h), h, x + VC[0], z + VC[1]);
    }
  };
  for (const [x, z, nx, nz, k] of L.wins) seg(r, x + nx * 0.3, z + nz * 0.3, x + nx * 4.2, z + nz * 4.2, 5, (v, d, h) => v + k * 0.75 * Math.exp(-d * d / (0.5 + 3.5 * h)) * (1 - 0.65 * h));
  for (const [x, , z] of L.lamps) seg(r, x, z, x, z, 11, (v, d) => v + 1.0 / (1 + d * d / 3.2) * ss(11, 3, d));
  for (const [x, z, k] of L.pools) seg(r, x, z, x, z, 24, (v, d) => v + k / (1 + d * d / 16) * ss(24, 5, d));
  for (const [x, z, hw, hl, c, s] of L.foot) seg(g, x, z, x, z, 9, (v, d, h, px, pz) => {
    const lx = Math.abs(c * (px - x) - s * (pz - z)) - hw, lz = Math.abs(s * (px - x) + c * (pz - z)) - hl, e = lx > 0 && lz > 0 ? Math.hypot(lx, lz) : Math.max(lx, lz);
    return v * (0.3 + 0.7 * ss(-0.3, 1.5, e));
  });
  for (let i = 0; i < L.col.length; i += 6) if (L.col[i + 2] < 0.9) seg(g, L.col[i], L.col[i + 1], L.col[i], L.col[i + 1], 1.5, (v, d) => v * (0.45 + 0.55 * ss(0.1, 1.3, d)));
  for (const p of L.paths) for (let k = 0; k < p.length - 1; k++) seg(b, p[k][0], p[k][1], p[k + 1][0], p[k + 1][1], 1.6, (v, d, h, px, pz) => Math.max(v, ss(0.75, 0.2, d + 0.3 * fbm2(px * 0.9, pz * 0.9, 2))));
  const dc = Math.cos(DOOR_YAW), ds = Math.sin(DOOR_YAW);
  seg(g, DOOR[0] - dc * 0.6, DOOR[2] + ds * 0.6, DOOR[0] + dc * 0.6, DOOR[2] - ds * 0.6, 1.2, (v, d) => v * (0.4 + 0.6 * ss(0.05, 0.9, d)));
  for (const sg of [1, -1]) seg(a, DOOR[0] + sg * ds * 0.15, DOOR[2] + sg * dc * 0.15, DOOR[0] + sg * ds * 4.5, DOOR[2] + sg * dc * 4.5, 3, (v, d, h) => Math.max(v, Math.exp(-d * d / (0.16 + 1.6 * h * h)) * (1 - h) * (1 - h)));
  const o = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { o[i * 4] = Math.min(r[i] / 2, 1) * 255; o[i * 4 + 1] = g[i] * 255; o[i * 4 + 2] = b[i] * 255; o[i * 4 + 3] = Math.min(a[i], 1) * 255; }
  return o;
}
