// All static geometry, built once on the CPU. Vertex = pos3 nrm3 uv2 col3 mat1 (mat + 32 * hide-group).
import { STAIR, TURN, GY, NAVE, EAST, WEST } from './layout.js';

export const PL = 0, GOLD = 1, WOOD = 2, FLOOR = 3, BOOKS = 4, FRESCO = 5, GLASS = 6, EMIT = 7, CLEAR = 8, PAPER = 9, VELVET = 10, RUG = 11,
  LEAF = 12, CAT = 13, SPH = 14, STONE = 15, DOME = 16, WRITE = 17, FIRE = 18, RIB = 19, ROSE = 21, RAIL = 24, HALO = 25, WATER = 26;
const C = { pl: [0.78, 0.72, 0.62], pil: [0.7, 0.58, 0.52], gold: [0.85, 0.58, 0.18], wood: [0.2, 0.1, 0.05], woodL: [0.36, 0.22, 0.11],
  lamp: [1, 0.68, 0.34], stone: [0.6, 0.5, 0.39], leaf: [0.1, 0.3, 0.07], w: [1, 1, 1] };
const UP = [0, 1, 0], PI = Math.PI;
const LEATHER = [[0.3, 0.035, 0.03], [0.2, 0.09, 0.04], [0.42, 0.27, 0.13], [0.04, 0.13, 0.07], [0.035, 0.06, 0.17], [0.24, 0.03, 0.09]];

export class Geo {
  constructor(M) { this.M = M; this.v = []; this.i = []; this.sx = 1; this.g = 0; this.at(0, 0, 0); }
  at(x, y, z, yaw = 0) { this.t = [x, y, z]; this.cs = Math.cos(yaw); this.sn = Math.sin(yaw); return this; }
  vert(p, n, u, v, c, m) {
    const x = p[0] * this.sx, nx = n[0] * this.sx, { cs, sn, t } = this;
    this.v.push(x * cs + p[2] * sn + t[0], p[1] + t[1], -x * sn + p[2] * cs + t[2], nx * cs + n[2] * sn, n[1], -nx * sn + n[2] * cs, u, v, c[0], c[1], c[2], m + 32 * this.g);
  }
  tris(s, idx) { for (let k = 0; k < idx.length; k += 3) this.sx > 0 ? this.i.push(s + idx[k], s + idx[k + 1], s + idx[k + 2]) : this.i.push(s + idx[k], s + idx[k + 2], s + idx[k + 1]); }
  // quad a,b,c,d; `face` (optional) = direction the front must look at; ns = optional per-corner normals
  quad(a, b, c, d, m, col, uv = [0, 0, 1, 0, 1, 1, 0, 1], face, ns) {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    const flip = face && n[0] * face[0] + n[1] * face[1] + n[2] * face[2] < 0;
    if (flip) n = [-n[0], -n[1], -n[2]];
    const s = this.v.length / 12, P = [a, b, c, d];
    for (let k = 0; k < 4; k++) this.vert(P[k], ns ? ns[k] : n, uv[k * 2], uv[k * 2 + 1], col, m);
    this.tris(s, flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  }
  // faces bits: 1 -x, 2 +x, 4 -y, 8 +y, 16 -z, 32 +z
  box(x0, y0, z0, x1, y1, z1, m, col, f = 63) {
    const q = (a, b, c, d) => this.quad(a, b, c, d, m, col);
    if (f & 1) q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (f & 2) q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (f & 4) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (f & 8) q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (f & 16) q([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    if (f & 32) q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }
  // a ctx.mesh geo, placed at (x, y, z) in the current frame
  add(g, m, col, x = 0, y = 0, z = 0, uvx) {
    const s = this.v.length / 12, n = g.pos.length / 3;
    for (let k = 0; k < n; k++) this.vert([g.pos[k * 3] + x, g.pos[k * 3 + 1] + y, g.pos[k * 3 + 2] + z], [g.nrm[k * 3], g.nrm[k * 3 + 1], g.nrm[k * 3 + 2]], uvx ?? g.uv[k * 2], g.uv[k * 2 + 1], col, m);
    this.tris(s, g.idx);
  }
  halo(x, y, z, size, inten) {
    const s = this.v.length / 12;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.vert([x, y, z], UP, u, v, [size, inten, 0], HALO);
    this.i.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  done() { return { verts: new Float32Array(this.v), idx: new Uint32Array(this.i) }; }
}
// rotate a ctx.mesh geo about X (pitch) in place
const pitch = (g, a) => { const c = Math.cos(a), s = Math.sin(a); for (const A of [g.pos, g.nrm]) for (let i = 0; i < A.length; i += 3) { const y = A[i + 1], z = A[i + 2]; A[i + 1] = y * c - z * s; A[i + 2] = y * s + z * c; } return g; };

function sconce(B, T, x, y) {
  B.box(x - 0.2, y - 0.13, -0.025, x, y - 0.09, 0.025, GOLD, C.gold);
  B.add(B.M.lathe([[0.02, -0.09], [0.07, -0.06], [0.09, 0]], 8), GOLD, C.gold, x - 0.2, y - 0.02, 0);
  B.add(B.M.sphere(0.1, 1), EMIT, C.lamp, x - 0.2, y + 0.06, 0);
  T.halo(x - 0.2, y + 0.06, 0, 1.1, 1);
}
function pilasters(B, T, lower, upper = true) {
  if (lower) {
    B.box(4.3, 0.5, -0.35, 4.5, 4.05, 0.35, PL, C.pil, 49);
    B.box(4.26, 0, -0.4, 4.5, 0.5, 0.4, PL, C.pil, 57);
    B.box(4.24, 4.05, -0.4, 4.5, 4.4, 0.4, GOLD, C.gold, 61);
    B.box(4.3, 4.4, -0.35, 4.5, 4.7, 0.35, PL, C.pl, 49);
    sconce(B, T, 4.3, 3.3);
  }
  if (upper) {
    B.box(6.8, 5, -0.35, 7, 8.9, 0.35, PL, C.pil, 49);
    B.box(6.74, 8.9, -0.4, 7, 9.25, 0.4, GOLD, C.gold, 61);
    B.box(6.8, 9.25, -0.35, 7, 9.8, 0.35, PL, C.pl, 49);
    sconce(B, T, 6.8, 8.3);
  }
}
function rail(B, T, a, b) {      // gallery railing from a to b (points [x, z]) at y = GY
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  T.quad([a[0], GY, a[1]], [b[0], GY, b[1]], [b[0], GY + 0.92, b[1]], [a[0], GY + 0.92, a[1]], RAIL, C.w, [0, 0, len, 0, len, 0.92, 0, 0.92]);
  B.box(Math.min(a[0], b[0]) - 0.05, GY + 0.92, Math.min(a[1], b[1]) - 0.05, Math.max(a[0], b[0]) + 0.05, GY + 1, Math.max(a[1], b[1]) + 0.05, WOOD, C.wood);
}
function newel(B, x, z) {
  B.box(x - 0.07, GY, z - 0.07, x + 0.07, GY + 1.1, z + 0.07, PL, C.pl, 59);
  B.add(B.M.sphere(0.085, 1), GOLD, C.gold, x, GY + 1.17, z);
}
function shelf(B, x, y, z0, z1, o, rows = 10) {      // wall of books at plane x facing -x
  B.quad([x, y, z0], [x, y, z1], [x, y + rows * 0.39, z1], [x, y + rows * 0.39, z0], BOOKS, C.w, [z0 + o, 0, z1 + o, 0, z1 + o, rows * 0.39, z0 + o, rows * 0.39]);
}

function baySide(B, T, s) {
  B.sx = T.sx = s;
  B.g = T.g = 1;
  B.box(4.4, 0, 0.35, 4.5, 0.5, 5.65, WOOD, C.wood, 9);
  shelf(B, 4.5, 0.5, 0.4, 5.6, s > 0 ? 10 : 30);
  B.box(4.44, 0.5, 0.35, 4.5, 4.4, 0.4, WOOD, C.wood, 33); B.box(4.44, 0.5, 5.6, 4.5, 4.4, 5.65, WOOD, C.wood, 17);
  B.box(4.36, 4.4, 0.35, 4.5, 4.7, 5.65, WOOD, C.wood, 5);
  B.box(4.345, 4.5, 0.35, 4.36, 4.56, 5.65, GOLD, C.gold, 13);
  B.box(4.25, 4.7, 0, 7, 5, 6, PL, C.pl, 5);
  B.quad([4.25, 5, 0], [4.25, 5, 6], [7, 5, 6], [7, 5, 0], WOOD, C.woodL);
  B.box(4.225, 4.8, 0, 4.25, 4.88, 6, GOLD, C.gold, 13);
  pilasters(B, T, true, false);
  newel(B, 4.32, 0);
  [[0.07, 2.3], [2.3, 3.7], [3.7, 5.93]].forEach(([a, b], j) => { B.g = T.g = s < 0 && j === 1 ? 2 : 1; rail(B, T, [4.32, a], [4.32, b]); });
  B.g = T.g = 0;
  B.box(6.9, 5, 0.35, 7, 5.35, 5.65, WOOD, C.wood, 9);
  shelf(B, 7, 5.35, 0.4, 5.6, s > 0 ? 50 : 70);
  B.box(6.94, 5.35, 0.35, 7, 9.25, 0.4, WOOD, C.wood, 33); B.box(6.94, 5.35, 5.6, 7, 9.25, 5.65, WOOD, C.wood, 17);
  B.box(6.86, 9.25, 0.35, 7, 9.8, 5.65, WOOD, C.wood, 5);
  B.box(6.845, 9.4, 0.35, 6.86, 9.46, 5.65, GOLD, C.gold, 13);
  pilasters(B, T, false);
  B.box(6.62, 9.8, 0, 7, 9.95, 6, PL, C.pl, 5); B.box(6.5, 9.95, 0, 7, 10.12, 6, PL, C.pl, 13);
  B.box(6.47, 10, 0, 6.5, 10.07, 6, GOLD, C.gold, 13);
  // clerestory wall with the arched opening, its reveal and the glass
  const F = [-1, 0, 0], w = (z0, y0, z1, y1) => B.quad([7, y0, z0], [7, y0, z1], [7, y1, z1], [7, y1, z0], PL, C.pl, undefined, F);
  w(0, 10.12, 1.3, 15.4); w(4.7, 10.12, 6, 15.4); w(1.3, 10.12, 4.7, 10.7);
  const N = 12, ip = (t) => [3 + 1.7 * Math.cos(t), 13.6 + 1.7 * Math.sin(t)], op = (t) => { const k = Math.min(1.7 / Math.abs(Math.cos(t) || 1e-9), 1.8 / (Math.sin(t) || 1e-9)); return [3 + k * Math.cos(t), 13.6 + k * Math.sin(t)]; };
  for (let i = 0; i < N; i++) {
    const a = ip(PI * i / N), b = ip(PI * (i + 1) / N), c = op(PI * i / N), d = op(PI * (i + 1) / N), tm = PI * (i + 0.5) / N;
    B.quad([7, a[1], a[0]], [7, c[1], c[0]], [7, d[1], d[0]], [7, b[1], b[0]], PL, C.pl, undefined, F);
    B.quad([7, a[1], a[0]], [7.3, a[1], a[0]], [7.3, b[1], b[0]], [7, b[1], b[0]], PL, C.gold, undefined, [0, -Math.sin(tm), -Math.cos(tm)]);
  }
  B.quad([7, 10.7, 1.3], [7.3, 10.7, 1.3], [7.3, 13.6, 1.3], [7, 13.6, 1.3], PL, C.gold, undefined, [0, 0, 1]);
  B.quad([7, 10.7, 4.7], [7.3, 10.7, 4.7], [7.3, 13.6, 4.7], [7, 13.6, 4.7], PL, C.gold, undefined, [0, 0, -1]);
  B.quad([7, 10.7, 1.3], [7.3, 10.7, 1.3], [7.3, 10.7, 4.7], [7, 10.7, 4.7], PL, C.pl, undefined, UP);
  B.quad([7.3, 10.7, 1.3], [7.3, 10.7, 4.7], [7.3, 15.3, 4.7], [7.3, 15.3, 1.3], GLASS, C.w, [-1.7, 0, 1.7, 0, 1.7, 4.6, -1.7, 4.6], F);
}
function vault(B, z0, z1, r, mat, u0 = 0, N = 20) {       // barrel section; uv.x across the arc, uv.y along
  for (let i = 0; i < N; i++) {
    const a = PI * i / N, b = PI * (i + 1) / N, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const A = [r * ca, 15.4 + r * sa], Bp = [r * cb, 15.4 + r * sb], na = [-ca, -sa, 0], nb = [-cb, -sb, 0];
    const uv = mat === RIB ? [0, a * r, 1, a * r, 1, b * r, 0, b * r] : [i / N, 0, i / N, 1, (i + 1) / N, 1, (i + 1) / N, 0];
    B.quad([A[0], A[1], z0], [A[0], A[1], z1], [Bp[0], Bp[1], z1], [Bp[0], Bp[1], z0], mat, C.pl, uv, na, [na, na, nb, nb]);
    if (mat === RIB) for (const [z, f] of [[z0, -1], [z1, 1]]) B.quad([A[0], A[1], z], [7 * ca, 15.4 + 7 * sa, z], [7 * cb, 15.4 + 7 * sb, z], [Bp[0], Bp[1], z], PL, C.pl, undefined, [0, 0, f]);
  }
}
export function buildBay(M) {
  const B = new Geo(M), T = new Geo(M);
  B.quad([-4.5, 0, 0], [-4.5, 0, 6], [4.5, 0, 6], [4.5, 0, 0], FLOOR, C.w);
  baySide(B, T, 1); baySide(B, T, -1);
  B.sx = T.sx = 1;
  vault(B, 0, 6, 7, FRESCO); vault(B, -0.3, 0.3, 6.72, RIB);
  return [B.done(), T.done()];
}

// wall across a hall at local z with an arched opening; outer edge = the vault section or a W x H rectangle
function archWall(B, z, hw, sill, spring, face, W = 7, H = 0, depth = 0, mat = PL, col = C.pl) {
  const F = [0, 0, face], q = (a, b, c, d) => B.quad([a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z], [d[0], d[1], z], mat, col, undefined, F);
  const top = H || 15.4, N = 16;
  for (const s of [1, -1]) q([s * hw, sill], [s * W, 0], [s * W, top], [s * hw, spring]);
  if (sill > 0) q([-hw, sill], [hw, sill], [W, 0], [-W, 0]);
  for (let i = 0; i < N; i++) {
    const a = PI * i / N, b = PI * (i + 1) / N, tm = (a + b) / 2;
    const ip = (t) => [hw * Math.cos(t), spring + hw * Math.sin(t)], op = (t) => H ? [W * Math.cos(t), H] : [7 * Math.cos(t), 15.4 + 7 * Math.sin(t)];
    q(ip(a), op(a), op(b), ip(b));
    if (depth) { const A = ip(a), Bp = ip(b); B.quad([A[0], A[1], z], [A[0], A[1], z + depth], [Bp[0], Bp[1], z + depth], [Bp[0], Bp[1], z], mat, col, undefined, [-Math.cos(tm), -Math.sin(tm), 0]); }
  }
  if (depth) for (const s of [1, -1]) B.quad([s * hw, sill, z], [s * hw, sill, z + depth], [s * hw, spring, z + depth], [s * hw, spring, z], mat, col, undefined, [-s, 0, 0]);
}

function desk(B, T, x, z, yaw, o = {}) {
  B.at(x, 0, z, yaw);
  B.box(-0.5, 0.74, -1.2, 0.5, 0.82, 1.2, WOOD, C.wood);
  for (const sx of [-0.42, 0.42]) for (const sz of [-1.1, 1.1]) B.box(sx - 0.04, 0, sz - 0.04, sx + 0.04, 0.74, sz + 0.04, WOOD, C.wood, 51);
  B.box(-0.46, 0.6, -1.16, 0.46, 0.74, 1.16, WOOD, C.wood, 51);
  // open book
  const bz = o.bz ?? 0.1, m = o.write ? WRITE : PAPER;
  B.box(-0.17, 0.82, bz - 0.25, 0.17, 0.835, bz + 0.25, VELVET, LEATHER[o.c ?? 0]);
  B.quad([-0.15, 0.85, bz], [-0.15, 0.85, bz + 0.23], [0.15, 0.862, bz + 0.23], [0.15, 0.845, bz], m, C.w, [0, 1, 1, 1, 1, 0, 0, 0], UP);
  B.quad([-0.15, 0.85, bz], [-0.15, 0.85, bz - 0.23], [0.15, 0.862, bz - 0.23], [0.15, 0.845, bz], PAPER, C.w, [0, 1, 1, 1, 1, 0, 0, 0], UP);
  pile(B, x, 0.82, z, yaw, 0.1, -0.75, 4, x * 7 + z);
  if (o.lamp) {
    B.add(B.M.lathe([[0.1, 0], [0.02, 0.03], [0.015, 0.4], [0.05, 0.42]], 8), GOLD, C.gold, 0.25, 0.82, 0.8);
    B.add(B.M.sphere(0.085, 2), EMIT, C.lamp, 0.25, 1.3, 0.8); T.halo(x + 0.25 * B.cs + 0.8 * B.sn, 1.3, z - 0.25 * B.sn + 0.8 * B.cs, 0.9, 0.8);
  }
  B.at(0, 0, 0);
}
function pile(B, x, y, z, yaw, lx, lz, n, seed) {
  const r = (k) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const c = Math.cos(yaw), s = Math.sin(yaw), wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
  for (let k = 0; k < n; k++) {
    const h = 0.035 + 0.03 * r(k);
    B.at(wx, y, wz, yaw + (r(k + 9) - 0.5) * 0.9);
    B.box(-0.11, 0, -0.15, 0.11, h, 0.15, VELVET, LEATHER[Math.floor(r(k + 3) * 6)]);
    B.box(-0.1, 0.006, -0.155, 0.115, h - 0.006, 0.155, PAPER, C.w, 34 | 16);
    y += h;
  }
  B.at(x, 0, z, yaw);
}
function candelabra(B, T, x, z) {
  B.at(x, 0, z);
  B.add(B.M.lathe([[0.24, 0], [0.07, 0.08], [0.035, 0.3], [0.06, 0.8], [0.03, 0.9], [0.03, 1.5], [0.07, 1.56], [0.02, 1.6]], 10), GOLD, C.gold);
  for (const [dx, dz, h] of [[0, 0, 1.78], [0.2, 0, 1.66], [-0.2, 0, 1.66], [0, 0.2, 1.66], [0, -0.2, 1.66]]) {
    if (h < 1.7) B.box(dx * 0.1 - 0.012, 1.5, dz * 0.1 - 0.012, dx + 0.012, 1.53, dz + 0.012, GOLD, C.gold);
    B.add(B.M.cylinder(0.02, 0.02, h - 1.52, 6), VELVET, [0.8, 0.74, 0.6], dx, 1.52, dz);
    B.add(B.M.scale(B.M.sphere(0.03, 1), 1, 2, 1), EMIT, C.lamp, dx, h + 0.06, dz);
  }
  T.halo(x, 1.82, z, 1.5, 1.4);
  B.at(0, 0, 0);
}
function armchair(B, x, z, yaw, col) {
  B.at(x, 0, z, yaw);
  B.box(-0.42, 0.12, -0.4, 0.42, 0.48, 0.42, VELVET, col); B.box(-0.42, 0.48, 0.28, 0.42, 1.2, 0.5, VELVET, col);
  for (const s of [-1, 1]) { B.box(s * 0.42 - 0.09, 0.12, -0.4, s * 0.42 + 0.09, 0.72, 0.5, VELVET, col); B.box(s * 0.4 - 0.04, 0, -0.36, s * 0.4 + 0.04, 0.12, -0.28, WOOD, C.wood); B.box(s * 0.4 - 0.04, 0, 0.38, s * 0.4 + 0.04, 0.12, 0.46, WOOD, C.wood); }
  B.at(0, 0, 0);
}
function globeStand(B, x, z, r, y) {
  const M = B.M; B.at(x, 0, z);
  B.add(M.lathe([[r * 0.75, 0], [r * 0.7, 0.06], [0.06, 0.12], [0.045, y - r - 0.08], [0.1, y - r - 0.04]], 10), WOOD, C.wood);
  const t = M.torus(r + 0.045, 0.022 + r * 0.012, 28, 6); pitch(t, PI / 2); B.add(t, GOLD, C.gold, 0, y, 0);
  B.add(M.torus(r + 0.1, 0.02 + r * 0.02, 28, 6), GOLD, C.gold, 0, y, 0);
  B.at(0, 0, 0);
}
function tree(B, x, z) {
  const M = B.M; B.at(x, 0, z);
  B.add(M.lathe([[0.6, 0], [0.78, 0.7], [0.7, 0.72], [0.62, 0.6], [0.001, 0.6]], 12), STONE, C.stone);
  B.add(M.cylinder(0.15, 0.09, 2.6, 8), WOOD, [0.16, 0.1, 0.06], 0, 0.6, 0);
  [[0, 3.7, 0, 1.3], [0.8, 3.3, 0.3, 0.9], [-0.7, 3.4, 0.5, 0.95], [0.2, 3.2, -0.8, 0.9], [-0.4, 4.4, -0.3, 0.9], [0.5, 4.3, 0.5, 0.75]].forEach(([a, b, c, r]) => B.add(M.sphere(r, 2), LEAF, C.leaf, a, b, c));
  B.add(M.sphere(0.5, 1), LEAF, [0.08, 0.22, 0.05], 0.3, 0.75, 0.3);
  B.at(0, 0, 0);
}
function cat(B, x, y, z, yaw) {
  const M = B.M, col = [0.55, 0.3, 0.12]; B.at(x, y, z, yaw);
  B.add(M.scale(M.sphere(1, 2), 0.27, 0.13, 0.19), CAT, col, 0, 0.12, 0, 1);
  B.add(M.scale(M.sphere(1, 2), 0.095, 0.085, 0.09), CAT, col, 0.2, 0.1, 0.12, 0.25);
  for (const s of [-1, 1]) B.add(M.cone(0.03, 0.06, 5), CAT, col, 0.2 + s * 0.045, 0.165, 0.12 + s * 0.03, 0);
  const path = []; for (let i = 0; i <= 10; i++) { const a = -0.4 + i * 0.26; path.push([-0.05 + 0.28 * Math.cos(a + 2.2), 0.04, 0.22 * Math.sin(a + 2.2) + 0.04]); }
  B.add(M.tube(path, (t) => 0.035 - 0.012 * t, 6), CAT, col, 0, 0, 0, 0);
  B.at(0, 0, 0);
}

export function buildStatic(M) {
  const B = new Geo(M), T = new Geo(M);
  // ---- crossing: floor, four bookcase piers with the gallery corners, sail vault, lantern
  B.quad([-7, 0, -7], [-7, 0, 7], [7, 0, 7], [7, 0, -7], FLOOR, C.w);
  for (let k = 0; k < 4; k++) {
    B.at(0, 0, 0, k * PI / 2); T.at(0, 0, 0, k * PI / 2);
    B.box(4.5, 0.5, 4.5, 7, 4.7, 7, PL, C.pl, 17); B.box(4.44, 0, 4.44, 7, 0.5, 7, PL, C.pil, 25);
    B.box(4.47, 4.3, 4.47, 7, 4.38, 7, GOLD, C.gold, 29);
    shelf(B, 4.495, 0.5, 4.8, 6.4, 90 + k * 10);
    B.box(4.25, 4.7, 4.25, 7, 5, 7, PL, C.pl, 21); B.quad([4.25, 5, 4.25], [4.25, 5, 7], [7, 5, 7], [7, 5, 4.25], WOOD, C.woodL);
    rail(B, T, [4.32, 4.39], [4.32, 7]); rail(B, T, [4.39, 4.32], [7, 4.32]); newel(B, 4.32, 4.32);
  }
  B.at(0, 0, 0); T.at(0, 0, 0);
  const R2 = 98, yv = (x, z) => 15.4 + Math.sqrt(Math.max(R2 - x * x - z * z, 0));
  for (let i = 0; i < 48; i++) for (let j = 0; j < 6; j++) {
    const P = (ii, jj) => { const a = ii / 48 * 2 * PI, rm = 7 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))), r = 3 + (rm - 3) * jj / 6, x = r * Math.cos(a), z = r * Math.sin(a); return [x, yv(x, z), z]; };
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1), nn = (p) => [-p[0] / 9.9, -(p[1] - 15.4) / 9.9, -p[2] / 9.9];
    B.quad(a, b, c, d, DOME, C.w, [a[0] / 7, a[2] / 7, b[0] / 7, b[2] / 7, c[0] / 7, c[2] / 7, d[0] / 7, d[2] / 7], [0, -1, 0], [nn(a), nn(b), nn(c), nn(d)]);
  }
  const y0 = yv(3, 0);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * 2 * PI, b = (i + 1) / 24 * 2 * PI, A = [3 * Math.cos(a), 3 * Math.sin(a)], Bp = [3 * Math.cos(b), 3 * Math.sin(b)];
    B.quad([A[0], y0, A[1]], [Bp[0], y0, Bp[1]], [Bp[0], y0 + 2.6, Bp[1]], [A[0], y0 + 2.6, A[1]], PL, C.pl, undefined, [-A[0], 0, -A[1]]);
  }
  B.add(M.torus(3, 0.14, 40, 8), GOLD, C.gold, 0, y0, 0); B.add(M.torus(2.95, 0.1, 40, 8), GOLD, C.gold, 0, y0 + 2.5, 0);
  B.quad([-3, y0 + 2.6, -3], [3, y0 + 2.6, -3], [3, y0 + 2.6, 3], [-3, y0 + 2.6, 3], CLEAR, [2, 0, 0], [-3, -3, 3, -3, 3, 3, -3, 3], [0, -1, 0]);
  B.add(M.cylinder(0.035, 0.035, y0 + 2.6 - 9.6, 6), GOLD, C.gold, 0, 9.6, 0);

  // ---- spiral stair
  {
    const [cx, cz, R] = STAIR, n = 30, a0 = 0.3, a1 = TURN - 0.3, st = GY / n;
    B.at(cx, 0, cz); T.at(cx, 0, cz);
    B.add(M.cylinder(0.2, 0.2, GY + 1.1, 12), GOLD, C.gold); B.add(M.sphere(0.26, 1), GOLD, C.gold, 0, GY + 1.2, 0);
    const P = (a, r, y) => [r * Math.cos(a), y, r * Math.sin(a)];
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n, h = st * (i + 1);
      B.quad(P(a, 0.2, h), P(a, R, h), P(b, R, h), P(b, 0.2, h), WOOD, C.woodL, undefined, UP);
      B.quad(P(a, 0.2, h - st), P(a, R, h - st), P(a, R, h), P(a, 0.2, h), WOOD, C.wood, undefined, [Math.sin(a), 0, -Math.cos(a)]);
      B.quad(P(a, 0.2, h - st - 0.06), P(a, R, h - st - 0.06), P(b, R, h - 0.06), P(b, 0.2, h - 0.06), WOOD, C.wood, undefined, [0, -1, 0]);
    }
    B.quad(P(a1, 0.2, GY), P(a1, R + 0.2, GY), P(TURN + 0.42, R + 0.2, GY), P(TURN + 0.42, 0.2, GY), WOOD, C.woodL, undefined, UP);
    B.quad(P(a1, 0.2, GY - 0.3), P(a1, R + 0.2, GY - 0.3), P(TURN + 0.42, R + 0.2, GY - 0.3), P(TURN + 0.42, 0.2, GY - 0.3), WOOD, C.wood, undefined, [0, -1, 0]);
    const hy = (a) => GY * Math.min(Math.max((a - 0.3) / (TURN - 0.6), 0), 1), S = 60, A0 = 0.8, A1 = TURN - 0.46, path = [];
    for (let i = 0; i <= S; i++) {
      const a = A0 + (A1 - A0) * i / S, b = A0 + (A1 - A0) * (i + 1) / S, ya = hy(a), yb = hy(b);
      path.push(P(a, R, ya + 1));
      if (i === S) break;
      for (const f of [1, -1]) B.quad(P(a, R, ya - 0.3), P(b, R, yb - 0.3), P(b, R, yb + 0.06), P(a, R, ya + 0.06), WOOD, C.wood, undefined, [f * Math.cos(a), 0, f * Math.sin(a)]);
      T.quad(P(a, R, ya + 0.06), P(b, R, yb + 0.06), P(b, R, yb + 0.98), P(a, R, ya + 0.98), RAIL, C.w, [a * R, 0, b * R, 0, b * R, 0.92, a * R, 0.92]);
    }
    B.add(M.tube(path, 0.045, 6), GOLD, C.gold);
    B.at(0, 0, 0); T.at(0, 0, 0);
  }

  // ---- east end: wall with the archway to the court and the rose window
  B.at(7, 0, 0, PI / 2); T.at(7, 0, 0, PI / 2);
  archWall(B, 30, 4.5, 0, 6.5, -1, 7, 0, 0.6);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * 2 * PI, b = (i + 1) / 24 * 2 * PI, p = (t, r) => [r * Math.cos(t), 16 + r * Math.sin(t), 29.93];
    B.quad(p(a, 0.02), p(a, 2.8), p(b, 2.8), p(b, 0.02), ROSE, C.w, [0, 0, 2.8 * Math.cos(a), 2.8 * Math.sin(a), 2.8 * Math.cos(b), 2.8 * Math.sin(b), 0, 0], [0, 0, -1]);
  }
  { const t = M.torus(2.85, 0.12, 40, 8); pitch(t, PI / 2); B.add(t, GOLD, C.gold, 0, 16, 29.95); }
  for (const s of [1, -1]) { B.sx = T.sx = s; B.at(37, 0, 0, PI / 2); T.at(37, 0, 0, PI / 2); pilasters(B, T, true); }
  B.sx = T.sx = 1;
  B.at(7, 0, 0, PI / 2);
  archWall(B, 30.6, 4.5, 0, 6.5, 1, 10, 13, 0, STONE, C.stone);
  B.at(0, 0, 0); T.at(0, 0, 0);
  // ---- fountain court
  B.quad([37, 0, -10], [37, 0, 10], [57, 0, 10], [57, 0, -10], STONE, C.stone);
  B.quad([37.6, 0, -10], [57, 0, -10], [57, 13, -10], [37.6, 13, -10], STONE, C.stone, undefined, [0, 0, 1]);
  B.quad([37.6, 0, 10], [57, 0, 10], [57, 13, 10], [37.6, 13, 10], STONE, C.stone, undefined, [0, 0, -1]);
  B.quad([57, 0, -10], [57, 0, 10], [57, 13, 10], [57, 13, -10], STONE, C.stone, undefined, [-1, 0, 0]);
  B.quad([37.6, 13, -10], [57, 13, -10], [57, 13, 10], [37.6, 13, 10], CLEAR, [1, 0, 0], [37.6, -10, 57, -10, 57, 10, 37.6, 10], [0, -1, 0]);
  const colm = M.lathe([[0.36, 0], [0.36, 0.25], [0.27, 0.35], [0.22, 4.5], [0.3, 4.7], [0.38, 4.85]], 12);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) B.add(colm, STONE, C.stone, 39.6 + i * 3.2, 0, s * 8.7);
  for (let i = 0; i < 4; i++) B.add(colm, STONE, C.stone, 55.6, 0, -5.4 + i * 3.6);
  for (const s of [-1, 1]) B.box(37.6, 4.85, s * 8.7 - 0.35, 57, 5.35, s * 8.7 + 0.35, STONE, C.stone);
  B.box(55.25, 4.85, -8.35, 55.95, 5.35, 8.35, STONE, C.stone);
  B.add(M.lathe([[3.15, 0], [3.2, 0.5], [3.1, 0.58], [2.9, 0.58], [2.86, 0.2], [0.001, 0.2]], 32), STONE, C.stone, 47, 0, 0);
  B.add(M.lathe([[0.55, 0.2], [0.4, 0.5], [0.3, 1.2], [0.5, 1.42], [1.35, 1.62], [1.38, 1.67], [1.3, 1.64], [0.35, 1.5], [0.2, 1.55], [0.16, 2.2], [0.3, 2.42], [0.62, 2.55], [0.64, 2.6], [0.57, 2.57], [0.16, 2.48], [0.1, 2.55], [0.13, 2.78], [0.001, 2.92]], 24), STONE, [0.62, 0.56, 0.48], 47, 0, 0);
  for (const [r, y] of [[2.88, 0.46], [1.31, 1.6], [0.58, 2.55]]) T.add(M.lathe([[0.001, 0], [r, 0]], 28), WATER, C.w, 47, y, 0);
  for (const [x, z] of [[41.5, 6.6], [41.5, -6.6], [52.5, 6.6], [52.5, -6.6]]) tree(B, x, z);
  for (const s of [-1, 1]) { B.box(45.5, 0, s * 6.2 - 0.25, 48.5, 0.42, s * 6.2 + 0.25, STONE, C.stone); B.add(M.sphere(0.45, 1), LEAF, C.leaf, 44.6, 0.3, s * 6.3); B.add(M.sphere(0.5, 1), LEAF, C.leaf, 49.5, 0.3, s * 6.2); }

  // ---- west end: the reading nook under the great window
  B.at(-7, 0, 0, -PI / 2); T.at(-7, 0, 0, -PI / 2);
  archWall(B, 42, 4, 1.2, 9, -1, 7, 0, 0.35);
  B.quad([-4, 1.2, 42.35], [4, 1.2, 42.35], [4, 13, 42.35], [-4, 13, 42.35], CLEAR, [0, 0, 0], [-4, 0, 4, 0, 4, 11.8, -4, 11.8], [0, 0, -1]);
  B.box(-4, 0, 41.2, 4, 0.5, 42, WOOD, C.wood, 24); B.box(-3.95, 0.5, 41.25, 3.95, 0.62, 42, VELVET, [0.3, 0.04, 0.05], 24);
  B.quad([-3.4, 0.012, 32.6], [-3.4, 0.012, 39.4], [3.4, 0.012, 39.4], [3.4, 0.012, 32.6], RUG, C.w, [-1, -1, -1, 1, 1, 1, 1, -1]);
  for (const s of [1, -1]) {
    B.sx = T.sx = s;
    B.quad([4.5, 0, 30], [4.5, 0, 42], [7, 0, 42], [7, 0, 30], WOOD, C.woodL);
    B.quad([4.5, 0, 30], [7, 0, 30], [7, 4.7, 30], [4.5, 4.7, 30], PL, C.pl, undefined, [0, 0, 1]);
    B.box(4.25, 4.7, 29.9, 7, 5, 30, PL, C.pl, 37); rail(B, T, [4.32, 29.95], [7, 29.95]);
    B.box(6.9, 0, 30, 7, 1.1, 42, WOOD, C.wood, 9);
    B.box(6.7, 4.7, 30, 7, 5, 42, PL, C.pl, 5); B.box(6.67, 4.8, 30, 6.7, 4.88, 42, GOLD, C.gold, 13);
    if (s > 0) { shelf(B, 7, 1.1, 30.4, 41.6, 130, 9); B.box(6.9, 4.61, 30, 7, 4.7, 42, WOOD, C.wood, 5); }
    else {
      B.quad([7, 1.1, 30], [7, 1.1, 42], [7, 4.7, 42], [7, 4.7, 30], PL, C.pl);
      B.box(6.45, 0, 34.9, 7, 1.7, 35.3, STONE, C.stone); B.box(6.45, 0, 36.7, 7, 1.7, 37.1, STONE, C.stone);
      B.box(6.4, 1.7, 34.8, 7, 2.0, 37.2, STONE, C.stone); B.box(6.35, 2.0, 34.7, 7, 2.08, 37.3, WOOD, C.wood);
      B.quad([6.9, 0, 35.3], [6.9, 0, 36.7], [6.9, 1.7, 36.7], [6.9, 1.7, 35.3], FIRE, C.w, [0, 0, 1, 0, 1, 1.4, 0, 1.4]);
      B.box(6.4, 0, 35.3, 6.9, 0.05, 36.7, STONE, [0.2, 0.18, 0.16], 9);
      B.box(6.93, 2.5, 35.0, 7, 4.2, 37.0, GOLD, C.gold, 49 | 12); B.quad([6.92, 2.62, 35.12], [6.92, 2.62, 36.88], [6.92, 4.08, 36.88], [6.92, 4.08, 35.12], FRESCO, C.w, [0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7]);
    }
    B.at(-37, 0, 0, -PI / 2); T.at(-37, 0, 0, -PI / 2); pilasters(B, T, true, false);
    B.at(-49, 0, 0, -PI / 2); T.at(-49, 0, 0, -PI / 2); B.g = 0; pilasters(B, T, false);
    B.at(-7, 0, 0, -PI / 2); T.at(-7, 0, 0, -PI / 2);
  }
  B.sx = T.sx = 1; B.at(0, 0, 0); T.at(0, 0, 0);
  desk(B, T, -45.1, 3.4, PI / 2, { lamp: 1, c: 3 });
  cat(B, -45.9, 0.82, 3.35, 0.5);
  armchair(B, -41.6, -4.3, PI + 0.25, [0.05, 0.16, 0.1]); armchair(B, -44.4, -4.3, PI - 0.25, [0.3, 0.04, 0.06]);
  pile(B, -43, 0, -3.2, 0.4, 0, 0, 7, 3); pile(B, -42.6, 0, -3.5, 1.3, 0, 0, 4, 5); pile(B, -47.2, 0.62, -2, 0.2, 0, 0, 3, 8);
  globeStand(B, -47.6, 4.6, 0.45, 1.25);
  B.at(0, 0, 0);

  // ---- things along the halls
  B.quad([-2.4, 0.012, 41.6], [-2.4, 0.012, 46.4], [2.4, 0.012, 46.4], [2.4, 0.012, 41.6], RUG, C.w, [-1, -1, -1, 1, 1, 1, 1, -1]);
  candelabra(B, T, 1.7, 44); candelabra(B, T, -1.7, 44);
  desk(B, T, 3.1, 28.6, 0, { lamp: 1, write: 1, c: 0 }); desk(B, T, -3.1, 34.6, 0, { c: 4, bz: -0.3 });
  desk(B, T, -3.1, -18, 0, { lamp: 1, c: 1 }); desk(B, T, 3.1, -36.6, 0, { c: 2 }); desk(B, T, -20.6, 3.1, PI / 2, { lamp: 1, c: 5 });
  globeStand(B, 3.2, 21, 0.45, 1.25);
  B.at(0, 0, -28);
  B.add(M.lathe([[1.1, 0], [1.0, 0.22], [0.3, 0.36], [0.22, 0.62], [0.4, 0.7]], 16), WOOD, C.wood);
  { const t = M.torus(1.34, 0.045, 40, 6); pitch(t, PI / 2); B.add(t, GOLD, C.gold, 0, 1.95, 0); B.add(M.torus(1.42, 0.06, 40, 6), GOLD, C.gold, 0, 1.95, 0); }
  B.at(0, 0, 0);
  for (const [x, z] of [[16, 3.4], [16, -3.4], [28, 3.4], [28, -3.4]]) {
    B.add(M.lathe([[0.3, 0], [0.34, 0.1], [0.2, 0.25], [0.36, 0.7], [0.42, 0.95], [0.3, 1.0], [0.001, 0.98]], 12), PL, C.pil, x, 0, z);
    B.add(M.sphere(0.55, 2), LEAF, C.leaf, x, 1.35, z); B.add(M.sphere(0.35, 1), LEAF, C.leaf, x + 0.3, 1.75, z - 0.2);
  }
  return [B.done(), T.done()];
}

// bay instances: 3x4 affine rows + (bay index, arm, hide mask, 0)
export function bayInstances() {
  const out = [];
  const put = (c, s, tx, tz, k, arm, mask) => out.push(c, 0, s, tx, 0, 1, 0, 0, -s, 0, c, tz, k, arm, mask, 0);
  for (let k = 0; k < NAVE; k++) { put(1, 0, 0, 7 + 6 * k, k, 0, k === 1 ? 2 : 0); put(-1, 0, 0, -7 - 6 * k, k, 1, 0); }
  for (let k = 0; k < EAST; k++) put(0, 1, 7 + 6 * k, 0, k, 2, 0);
  for (let k = 0; k < WEST; k++) put(0, -1, -7 - 6 * k, 0, k, 3, k > 4 ? 3 : 0);
  return new Float32Array(out);
}

// floating book: halves hinge at the spine. uv = (side, part: 0 cover, 1 pages, 2 turning page)
export function bookMesh() {
  const v = [], idx = [];
  const box = (x0, y0, z0, x1, y1, z1, side, part) => {
    const F = [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]]];
    for (const f of F) { const s = v.length / 8; for (let k = 0; k < 4; k++) v.push(...f[k], ...f[4], side, part); idx.push(s, s + 1, s + 2, s, s + 2, s + 3); }
  };
  for (const s of [-1, 1]) { box(-0.004, -0.026, -0.15, 0.2, -0.02, 0.15, s, 0); box(-0.004, -0.026, -0.15, 0, 0, 0.15, s, 0); box(0.004, -0.02, -0.14, 0.19, 0, 0.14, s, 1); }
  box(0.004, 0.001, -0.14, 0.19, 0.002, 0.14, 1, 2);
  return { verts: new Float32Array(v), idx: new Uint16Array(idx) };
}
// quill (generic vertex format): tip at the origin, feather up +y
export function quillMesh(M) {
  const B = new Geo(M), n = 8;
  for (let i = 0; i < n; i++) {
    const w = (t) => 0.035 * Math.sin(Math.min(t * 1.15, 1) * PI) ** 0.7, a = i / n, b = (i + 1) / n, y0 = 0.07 + a * 0.3, y1 = 0.07 + b * 0.3;
    for (const f of [1, -1]) B.quad([-w(a), y0, 0.02 * a * a], [w(a), y0, 0.02 * a * a], [w(b), y1, 0.02 * b * b], [-w(b), y1, 0.02 * b * b], VELVET, [0.9, 0.88, 0.8], undefined, [0, 0, f]);
  }
  B.box(-0.004, 0, -0.004, 0.004, 0.37, 0.004, VELVET, [0.7, 0.62, 0.45]);
  return B.done();
}
