// Deterministic layout for sky-mountains (pure JS, no GPU): islands, pillars, trees, ground cover, birds, falls, collision.
import { fbm2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { ss, pillarFn, islandTop, islandRR } from './geo.js';

const TAU = Math.PI * 2;
export const SUN = (() => { const v = [-0.5, 0.135, -0.84], l = Math.hypot(...v); return v.map((c) => c / l); })();
export const CLOUD_FLOOR = 9;

// floating islands (world units). The first one is the hero island with the door.
export const ISL = [
  { x: 0, y: 70, z: 0, rx: 19, rz: 27, dep: 34, sd: 1.7, amp: 0.7, mound: 1.1, flat: [0, 15, 3.4, 0.9], trees: 0, vines: 46 },
  { x: 66, y: 84, z: -150, rx: 38, rz: 30, dep: 62, sd: 4.2, amp: 1.6, mound: 5, trees: 26, vines: 60 },
  { x: -150, y: 122, z: -330, rx: 60, rz: 48, dep: 95, sd: 7.9, amp: 2.5, mound: 9, trees: 44, vines: 60 },
  { x: 140, y: 58, z: 112, rx: 26, rz: 22, dep: 40, sd: 2.9, amp: 1.2, mound: 3, trees: 16, vines: 36 },
  { x: -108, y: 50, z: 52, rx: 20, rz: 24, dep: 32, sd: 5.5, amp: 1.0, mound: 3, trees: 12, vines: 32 },
  { x: 50, y: 158, z: -450, rx: 72, rz: 56, dep: 110, sd: 9.3, amp: 3, mound: 12, trees: 50, vines: 50 },
  { x: -62, y: 104, z: -112, rx: 13, rz: 11, dep: 24, sd: 3.3, amp: 0.6, mound: 2, trees: 6, vines: 24 },
  { x: 215, y: 110, z: -260, rx: 30, rz: 34, dep: 55, sd: 6.1, amp: 1.5, mound: 5, trees: 20, vines: 36 },
];
export const HERO = ISL[0];
export const topY = (I, x, z) => I.y + islandTop(I, x - I.x, z - I.z);
const rim = (I, th, k = 1) => {
  let lo = 0, hi = 3; const c = Math.cos(th), s = Math.sin(th);
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (islandRR(I, c * I.rx * m, s * I.rz * m) < k) lo = m; else hi = m; }
  return [I.x + c * I.rx * lo, I.z + s * I.rz * lo];
};
export const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

export const DOOR = [0, topY(HERO, 0, 15), 15];
export const SPAWN = [0, topY(HERO, 0, -7) + 1.7, -7];

// bird loops: [cx, cy, cz, radius, count, size]
export const LOOPS = [[-50, 128, -210, 165, 9, 1], [110, 74, 30, 120, 7, 1], [30, 112, -70, 62, 1, 2.4]];

// ---- pillars: [x, y, z, sxz, yaw, seed, sy / sxz, 0] ; variant = index into PV / FV lists
export const NVAR = 6, NFVAR = 3;
export function buildLayout(q) {
  const R = makeRng(90210), L = { pil: [], fpil: [], col: [] };
  for (let v = 0; v < NVAR; v++) L.pil.push([]);
  for (let v = 0; v < NFVAR; v++) L.fpil.push([]);
  const placed = [];
  const ok = (x, z, r, top) => {
    for (const I of ISL) { const m = Math.max(I.rx, I.rz) * 1.2 + r + (I === HERO ? 26 : 10); if (Math.hypot(x - I.x, z - I.z) < m) return 0; }
    for (const p of placed) if (Math.hypot(x - p[0], z - p[1]) < (r + p[2]) * 1.35 + 5) return 0;
    for (const lp of LOOPS) if (Math.abs(Math.hypot(x - lp[0], (z - lp[2]) / 0.72) - lp[3]) < r * 1.5 + 14 && top > lp[1] - 24) return 0;
    return 1;
  };
  const add = (x, z, r, top, fl, base) => {
    const v = R.int(fl ? NFVAR : NVAR), y = fl ? base : -26, sy = top - y;
    (fl ? L.fpil : L.pil)[v].push(x, y, z, r, R() * TAU, R(), sy / r, 0);
    placed.push([x, z, r]);
    L.col.push(x, z, r * 1.25, top, fl ? base + sy * 0.12 : -1e3);
  };
  // hero pillars composed around the spawn view (looking -z, sun to the left)
  for (const [x, z, r, top] of [[-58, -96, 13, 132], [-92, -60, 9, 96], [34, -88, 8, 64], [-28, -168, 16, 176], [118, -70, 15, 150], [70, 30, 10, 118],
    [-66, 96, 14, 140], [22, 88, 9, 58], [-150, -150, 22, 215], [150, -210, 19, 190], [-20, -260, 12, 120], [96, 150, 17, 170], [-36, 60, 6, 44]]) if (ok(x, z, r, top)) add(x, z, r, top);
  // floating pillar chunks
  for (const [x, z, r, base, top] of [[-34, -70, 6, 78, 112], [90, -112, 8, 104, 150], [-120, -40, 9, 60, 104], [20, -210, 10, 120, 172], [-190, -230, 12, 150, 215],
    [170, -60, 7, 70, 104], [60, 190, 9, 90, 136], [-60, 170, 8, 70, 110], [250, -380, 14, 130, 200], [-300, -420, 16, 160, 250], [-230, 60, 11, 96, 150]]) if (ok(x, z, r, top)) add(x, z, r, top, 1, base);
  const N = [380, 600, 760][q];
  for (let i = 0, tries = 0; i < N && tries < 30000; tries++) {
    const near = i < N * 0.3, rad = near ? 70 + 400 * Math.sqrt(R()) : 430 + 1700 * Math.pow(R(), 0.8), a = R() * TAU;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad - 60, n = fbm2(x * 0.0019 + 3.3, z * 0.0019 - 8.1, 3);
    if (n < -0.12 + 0.3 * R()) continue;
    const big = Math.pow(R(), 2.2), r = (7 + 20 * big) * (near ? 1 : 1.25), top = (46 + 190 * Math.pow(R(), 1.5) + 70 * n) * (0.75 + 0.5 * big) + (near ? 0 : 30);
    if (top < 34 || !ok(x, z, r, top)) continue;
    add(x, z, r, top); i++;
  }
  return L;
}

// trees on a pillar: sample its surface function where the world normal faces up
const PF = [], o = [0, 0, 0, 0, 0];
export function pillarTrees(inst, k, variant, fl, R, out, max) {
  const f = PF[variant + (fl ? 100 : 0)] || (PF[variant + (fl ? 100 : 0)] = pillarFn(variant + (fl ? 21 : 1), fl, 64));
  const x0 = inst[k], y0 = inst[k + 1], z0 = inst[k + 2], sx = inst[k + 3], yaw = inst[k + 4], sy = sx * inst[k + 6], c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u, v, w) => { f(u, v, o); w[0] = x0 + (c * o[0] + s * o[2]) * sx; w[1] = y0 + o[1] * sy; w[2] = z0 + (-s * o[0] + c * o[2]) * sx; };
  const a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0], got = [];
  for (let t = 0; t < max * 14 && got.length < max; t++) {
    const u = R(), v = 0.25 + 0.75 * Math.pow(R(), 0.6);
    if (v > 0.985) continue;
    P(u, v, a); P(u + 0.004, v, b); P(u, v + 0.004, d);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
    if (Math.abs(ny) / nl < 0.8 || a[1] < 34) continue;
    const sc = (0.75 + 0.8 * R()) * Math.min(1.4, 0.75 + sx / 26);
    let bad = 0; for (const g of got) if (Math.hypot(g[0] - a[0], g[1] - a[1], g[2] - a[2]) < 4.2 * sc) bad = 1;
    if (bad) continue;
    got.push([a[0], a[1], a[2]]);
    out.push(a[0], a[1] - 0.25 * sc, a[2], sc, R() * TAU, R(), 1, 0);
  }
}

// hero island dressing. Trees: [x, z, scale, variant]
export const HERO_TREES = [[-8.5, -19.5, 1.25, 0], [11.5, -14, 1.0, 1], [-14.5, -2, 1.35, 2], [14.5, 6.5, 1.15, 0], [-7.2, 20.6, 1.2, 2], [7.5, 22.5, 1.0, 0], [15.5, -4, 0.75, 1]];
// stones: [x, z, scale, flatten, sink]
export const HERO_STONES = [[0.05, 13.1, 0.5, 0.22, 0.05], [-0.3, 11.5, 0.46, 0.2, 0.05], [0.35, 9.9, 0.52, 0.2, 0.06], [-0.1, 8.2, 0.42, 0.2, 0.05], [0.3, 6.6, 0.38, 0.2, 0.05],
  [-1.75, 15.5, 0.62, 0.8, 0.2], [1.8, 15.2, 0.5, 0.7, 0.15], [-2.5, 14.4, 0.3, 0.8, 0.1], [2.4, 16.3, 0.36, 0.8, 0.1], [-1.5, 16.7, 0.28, 0.7, 0.08], [1.45, 13.9, 0.2, 0.7, 0.06],
  [-6, -15.5, 1.5, 0.75, 0.5], [-4.3, -17.2, 0.8, 0.8, 0.25], [8.5, -18.5, 1.2, 0.7, 0.4], [3.2, -3.4, 0.5, 0.6, 0.15], [-11, 6, 1.0, 0.8, 0.3], [10, 13, 0.7, 0.8, 0.2],
  [-3.8, 22.6, 0.9, 0.8, 0.3], [9, 22.5, 1.1, 0.75, 0.35], [-15, -9, 1.3, 0.7, 0.4], [4.5, 3.5, 0.3, 0.7, 0.1], [-2.6, -9.5, 0.34, 0.7, 0.1], [13, -9, 0.9, 0.8, 0.3]];
const nearDoor = (x, z) => Math.abs(x) < 0.42 && Math.abs(z - DOOR[2]) < 1.6 || Math.abs(x) < 0.8 && Math.abs(z - DOOR[2]) < 0.25;

export function heroCover(q, R) {
  const tufts = [], flowers = [], I = HERO;
  const NT = [2400, 3800, 8000][q], NF = [200, 380, 560][q];
  const clear = (x, z, m) => { for (const s of HERO_STONES) if (Math.hypot(x - s[0], z - s[1]) < s[2] * 0.9 + m) return 0; return !nearDoor(x, z); };
  for (let i = 0, t = 0; i < NT && t < NT * 6; t++) {
    let x = (R() * 2 - 1) * I.rx * 1.3, z = (R() * 2 - 1) * I.rz * 1.3;
    if (t % 4 === 0) { const a = R() * TAU, r = 0.6 + 4 * R() * R(); x = Math.cos(a) * r; z = DOOR[2] + Math.sin(a) * r; }   // lusher around the door
    if (islandRR(I, x, z) > 0.94 || !clear(x, z, 0.02)) continue;
    const n = fbm2(x * 0.13 + 4, z * 0.13, 2);
    if (n < -0.1 && R() < 0.85) continue;
    tufts.push(x, topY(I, x, z), z, 0.42 + R() * 0.5 + 0.3 * n, R() * TAU, R(), 0.8 + R() * 0.6, 0); i++;
  }
  for (let i = 0, t = 0; i < NF && t < NF * 20; t++) {
    const x = (R() * 2 - 1) * I.rx * 1.2, z = (R() * 2 - 1) * I.rz * 1.2;
    if (islandRR(I, x, z) > 0.9 || !clear(x, z, 0.1) || fbm2(x * 0.09 - 7, z * 0.09 + 2, 2) < 0.0) continue;
    flowers.push(x, topY(I, x, z), z, 0.5 + R() * 0.45, R() * TAU, fbm2(x * 0.05, z * 0.05 + 9, 1) * 0.5 + 0.5 + R() * 0.2, 1, 0); i++;
  }
  return { tufts, flowers };
}
export function islandTrees(I, R, out) {
  for (let i = 0, t = 0; i < I.trees && t < 2000; t++) {
    const x = (R() * 2 - 1) * I.rx * 1.2, z = (R() * 2 - 1) * I.rz * 1.2;
    if (islandRR(I, x, z) > 0.86) continue;
    const sc = (0.8 + 0.9 * R()) * Math.min(1.5, 0.8 + I.rx / 70);
    out.push(I.x + x, topY(I, I.x + x, I.z + z) - 0.3 * sc, I.z + z, sc, R() * TAU, R(), 1, 0); i++;
  }
}
// drifting rock fragments around the undersides: [x, y, z, s, yaw, seed, flatten, drift]
export function fragments(R, out) {
  for (const I of ISL) {
    const n = 8 + I.rx / 2.5 | 0;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, k = 0.5 + 0.9 * R(), dy = -3 - R() * I.dep * 0.9, s = (0.35 + 2.6 * Math.pow(R(), 2.5)) * Math.sqrt(I.rx / 20);
      const m = dy > -I.dep * 0.35 ? Math.max(k, 1.15 + s * 0.06) : k;
      out.push(I.x + Math.cos(a) * I.rx * m, I.y + dy, I.z + Math.sin(a) * I.rz * m, s, R() * TAU, R(), 0.6 + R() * 0.5, 0.5 + R());
    }
  }
}
// waterfalls: [x, y, z, length, width, seed, outward angle, kind]
export function falls() {
  const out = [];
  for (const [i, th, w] of [[1, 1.72, 1.5], [1, 2.55, 0.9], [0, 3.35, 0.7], [2, 0.9, 2.4], [5, 1.3, 3.0], [5, 2.2, 2.0], [7, 2.6, 1.3], [3, 4.4, 1.0]]) {
    const I = ISL[i], p = rim(I, th, 0.985), y = topY(I, p[0], p[1]) + 0.1, a = Math.atan2(Math.sin(th) * I.rz, Math.cos(th) * I.rx);
    out.push([p[0], y, p[1], y - 20, w, out.length * 0.37, a]);
  }
  return out;
}

// ---- collision ----
export function makeSdf(col) {
  const C = Float32Array.from(col), n = C.length / 5;
  return (x, y, z) => {
    let d = 1e3;
    for (let i = 0; i < n; i++) {
      const k = i * 5, dx = x - C[k], dz = z - C[k + 1];
      if (Math.abs(dx) > 80 || Math.abs(dz) > 80) continue;
      const e = Math.hypot(dx, dz) - C[k + 2], t = Math.max(y - C[k + 3], C[k + 4] - y), dd = e > 0 && t > 0 ? Math.hypot(e, t) : Math.max(e, t);
      if (dd < d) d = dd;
    }
    for (let i = 0; i < ISL.length; i++) {
      const I = ISL[i], dx = x - I.x, dz = z - I.z;
      if (Math.abs(dx) > I.rx * 1.5 + 30 || Math.abs(dz) > I.rz * 1.5 + 30 || y > I.y + 40 || y < I.y - I.dep * 1.5 - 30) continue;
      const rr = islandRR(I, dx, dz), q = Math.min(rr, 1), sc = Math.min(I.rx, I.rz);
      const top = I.y + islandTop(I, dx / Math.max(rr, 1), dz / Math.max(rr, 1)) + 0.3, bot = I.y - 3.5 - I.dep * Math.pow(1 - q, 0.62) * 0.95;
      const t = Math.max(y - top, bot - y), e = (rr - 1) * sc, dd = e > 0 ? (t > 0 ? Math.hypot(e, t) : e) : t;
      if (dd < d) d = dd;
    }
    return d;
  };
}
