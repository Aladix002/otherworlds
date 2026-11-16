// Turtle Island terrain: analytic height -> grid (walk + mesh), lava paths, baked mask texture. See NOTES.md.
import { fbm2 } from '../../core/src/noise.js';

export const SA = 128, SB = 160, VOL = [8, 22], HEX = 15, MS = 400, MN = 1024, GN = 448, CELL = MS / GN;
export const DOOR = [-6, -98], SPAWN = [4, -124], NEST = [7.5, -121.5], COLS = [-70, -97], HUT = [9, -83], SHRINE = [14, 112];
export const HOT = [[-52, -62, 3.2], [-59.5, -54, 2.2], [-45, -70, 1.8]];
export const TIDE = [[99, -58, 2.4], [104, -47, 1.7], [95, -67, 1.5], [106, -38, 2.0]];
const LAVA = [[-2.25, -121, -38, 0], [2.25, -88, 118, 0], [-0.62, -44, -56, 1]];   // start azimuth on the rim, target x/z, tube
const FLATS = [[DOOR[0], DOOR[1], 3, 8, 0], [HUT[0], HUT[1], 3, 7, 0], [SHRINE[0], SHRINE[1], 3, 7, 0.4], [NEST[0], NEST[1], 1.2, 3, -0.12],
  ...HOT.map((p) => [p[0], p[1], p[2] + 0.6, p[2] + 4, -0.1]), ...TIDE.map((p) => [p[0], p[1], p[2] + 0.3, p[2] + 2.5, -0.3])];

export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function hexE(x, z) {                      // distance to the seam of a unit hex lattice: 0 at the seam, 0.5 at a centre
  const s = 1.7320508;
  const ax = x - Math.round(x), ay = z - s * Math.round(z / s);
  const bx = x - 0.5 - Math.round(x - 0.5), by = z - s * 0.5 - s * Math.round(z / s - 0.5);
  const a = ax * ax + ay * ay < bx * bx + by * by, gx = Math.abs(a ? ax : bx), gy = Math.abs(a ? ay : by);
  return 0.5 - Math.max(gx, gx * 0.5 + gy * 0.8660254);
}
export function beach(x, z) {
  const e = Math.hypot(x / SA, z / SB), th = Math.atan2(x, -z);
  return Math.max(ss(0.95, 0.6, Math.abs(th)), ss(0.42, 0.2, Math.abs(th - 1.8))) * ss(0.5, 0.64, e);
}
let _shell = 0, _dC = 0;
function raw(x, z) {
  const e = Math.hypot(x / SA, z / SB), b = beach(x, z);
  const n1 = fbm2(x * 0.011 + 3.1, z * 0.011 - 1.7, 3), n2 = fbm2(x * 0.045 + 9, z * 0.045, 4);
  const o = Math.max(e - 0.86, 0), o2 = Math.max(e - 0.94, 0);
  const ys = 1.35 - 0.5 * e * e - 2.8 * b - 230 * o * o + 0.5 * ss(0, 0.3, hexE(x / HEX, z / HEX));
  const dC = (0.8 + 0.05 * n1 - e) * 140;
  const rock = dC < 0 ? dC : 4.2 * ss(0, 7, dC) + 0.025 * dC + (2.2 * n2 + 1) * ss(3, 16, dC);
  const sand = (0.915 - e) * 10.5 - 320 * o2 * o2 + 0.25 * n2 * ss(0.9, 0.7, e);
  let land = mix(rock, sand, b) + 7.5 * Math.exp(-(Math.pow(x - COLS[0] - 5.5, 2) + Math.pow(z - COLS[1] - 7.5, 2)) / 60);
  const dx = x - VOL[0], dz = z - VOL[1], dv = Math.hypot(dx, dz);
  let c = 62 * Math.pow(Math.max(1 - dv / 90, 0), 1.55) * (1 + 0.1 * Math.sin(Math.atan2(dx, dz) * 7 + n1 * 5) * ss(8, 40, dv) + 0.1 * n2);
  if (c > 50) c = 50 + 3 * (1 - Math.exp(-(c - 50) / 3));
  c -= 9.5 * ss(14, 4, dv) + 5.5 * Math.exp(-Math.pow(Math.atan2(dx, -dz) + 0.52, 2) / 0.5) * ss(5, 12, dv) * ss(32, 16, dv);
  land += c * ss(-2, 14, dC) * (1 - 0.6 * b);
  const d = ys - land;
  _shell = ss(-0.5, 0.4, d) * (1 - b); _dC = dC;
  return 0.5 * (ys + land + Math.sqrt(d * d + 1.2));
}

// ---- build everything: returns { H, at(x,z), mat(x,z,k), verts, idx, mask (Uint16 rgba16f), paths } ----
const F = new Float32Array(1), U = new Uint32Array(F.buffer);
function half(v) { F[0] = v; const x = U[0], e = (x >> 23) & 255, s = (x >> 16) & 0x8000; return e < 113 ? s : e > 142 ? s | 0x7c00 : s | ((e - 112) << 10) | ((x & 0x7fffff) >> 13); }

export function buildTerrain() {
  const N = GN + 1, H = new Float32Array(N * N), M = new Float32Array(N * N * 4);   // M: ao, shell, sand, veg
  const gx = (i) => (i / GN - 0.5) * MS;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = gx(i), z = gx(j);
    H[k] = raw(x, z); M[k * 4 + 1] = _shell; M[k * 4 + 2] = beach(x, z); M[k * 4 + 3] = _dC;
  }
  for (const f of FLATS) {
    const hc = raw(f[0], f[1]) + f[4], r = Math.ceil(f[3] / CELL), ci = Math.round((f[0] / MS + 0.5) * GN), cj = Math.round((f[1] / MS + 0.5) * GN);
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      const k = j * N + i; H[k] = mix(H[k], hc, ss(f[3], f[2], Math.hypot(gx(i) - f[0], gx(j) - f[1])));
    }
  }
  const at = (x, z) => {
    let u = (x / MS + 0.5) * GN, v = (z / MS + 0.5) * GN;
    u = u < 0 ? 0 : u > GN - 0.001 ? GN - 0.001 : u; v = v < 0 ? 0 : v > GN - 0.001 ? GN - 0.001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * N + i;
    return (H[k] * (1 - fu) + H[k + 1] * fu) * (1 - fv) + (H[k + N] * (1 - fu) + H[k + N + 1] * fu) * fv;
  };
  const mat = (x, z, c) => M[(Math.round((z / MS + 0.5) * GN) * N + Math.round((x / MS + 0.5) * GN)) * 4 + c];

  // lava: guided descent from the crater rim, splatted as a distance field (r = metres to the lava edge, g = metres along)
  const LD = new Float32Array(MN * MN).fill(10), LA = new Float32Array(MN * MN).fill(0), PD = new Float32Array(MN * MN).fill(4);
  const tx = (x) => (x / MS + 0.5) * MN - 0.5;
  const splat = (x, z, w, al, R) => {
    const ci = Math.round(tx(x)), cj = Math.round(tx(z)), r = Math.ceil(R * MN / MS);
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      const d = Math.hypot((i - tx(x)), (j - tx(z))) * MS / MN - w, k = j * MN + i;
      if (d < LD[k]) { LD[k] = d; LA[k] = al; }
    }
  };
  splat(VOL[0], VOL[1], 6, 0, 10);
  const paths = [];
  LAVA.forEach((L, pi) => {
    let x = VOL[0] + Math.sin(L[0]) * 14, z = VOL[1] - Math.cos(L[0]) * 14, dx = Math.sin(L[0]), dz = -Math.cos(L[0]);
    const pts = [];
    for (let i = 0; i < 520; i++) {
      const h = at(x, z), tl = Math.hypot(L[1] - x, L[2] - z);
      if (tl < 2.5 || h < -2.2) break;
      let gx_ = at(x - 1.5, z) - at(x + 1.5, z), gz_ = at(x, z - 1.5) - at(x, z + 1.5); const gl = Math.hypot(gx_, gz_) + 0.02;
      const me = 0.5 * Math.sin(i * 0.045 + pi * 2.1) + 0.3 * Math.sin(i * 0.11 + pi);
      const tX = (L[1] - x) / tl, tZ = (L[2] - z) / tl;
      let nx = 0.5 * gx_ / gl + 0.5 * tX - tZ * me * 0.5, nz = 0.5 * gz_ / gl + 0.5 * tZ + tX * me * 0.5;
      nx = dx * 0.8 + nx * 0.2; nz = dz * 0.8 + nz * 0.2; const nl = Math.hypot(nx, nz); dx = nx / nl; dz = nz / nl;
      x += dx * 0.5; z += dz * 0.5; pts.push([x, h, z]);
    }
    const n = pts.length;
    pts.forEach((p, i) => {
      const al = i * 0.5, rem = (n - i) * 0.5;
      let w = 0.5 + 0.22 * Math.sin(i * 0.06 + pi * 3) + 0.5 * ss(8, 0, al);
      if (L[3]) { if (al > 34) w = rem < 5 ? 1.5 * ss(0, 3, rem) * ss(-1, 2, 5 - rem) + 0.6 : (al % 16 < 1.4 ? 0.3 : -0.7); }
      else w += 1.6 * ss(14, 0, rem);
      p[3] = w; splat(p[0], p[2], w, al, 10);
    });
    paths.push(pts);
  });
  for (const [list, hot] of [[HOT, 1], [TIDE, 0]]) for (const p of list) {
    const ci = Math.round(tx(p[0])), cj = Math.round(tx(p[1])), r = Math.ceil((p[2] + 4.5) * MN / MS);
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      const ox = i - tx(p[0]), oz = j - tx(p[1]), a = Math.atan2(ox, oz), k = j * MN + i;
      const d = Math.hypot(ox, oz) * MS / MN - p[2] * (1 + 0.16 * Math.sin(a * 3 + p[0]) + 0.08 * Math.sin(a * 5 + p[1]));
      if (d < PD[k]) { PD[k] = d; if (hot && LD[k] > 3) LA[k] = -1; }
    }
  }
  const mask = new Uint16Array(MN * MN * 4);
  for (let j = 0, k = 0; j < MN; j++) for (let i = 0; i < MN; i++, k++) {
    mask[k * 4] = half(LD[k]); mask[k * 4 + 1] = half(LA[k]); mask[k * 4 + 2] = half(PD[k]);
    mask[k * 4 + 3] = half(at((i + 0.5) / MN * MS - MS / 2, (j + 0.5) / MN * MS - MS / 2));
  }
  const lavaD = (x, z) => LD[Math.round(tx(z)) * MN + Math.round(tx(x))];

  // vertices: pos3 nrm3 mat4 (ao, shell, sand, veg)
  const verts = new Float32Array(N * N * 10), idx = new Uint32Array(GN * GN * 6);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, o = k * 10, x = gx(i), z = gx(j), h = H[k];
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, GN), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, GN);
    let nx = H[j * N + i0] - H[j * N + i1], nz = H[j0 * N + i] - H[j1 * N + i], ny = 2 * CELL; const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const a = 3, c = (H[j * N + Math.max(i - a, 0)] + H[j * N + Math.min(i + a, GN)] + H[Math.max(j - a, 0) * N + i] + H[Math.min(j + a, GN) * N + i]) / 4 - h;
    const dC = M[k * 4 + 3], b = M[k * 4 + 2];
    const veg = ss(4, 11, dC) * (1 - b) * ss(46, 32, h) * ss(0.42, 0.22, 1 - ny) * ss(1.2, 5, lavaD(x, z)) * (0.75 + 0.5 * fbm2(x * 0.03 + 40, z * 0.03, 2));
    const ao = Math.min(1, Math.max(0.35, 1 - 0.3 * c));
    verts[o] = x; verts[o + 1] = h; verts[o + 2] = z; verts[o + 3] = nx; verts[o + 4] = ny; verts[o + 5] = nz;
    verts[o + 6] = ao; verts[o + 7] = M[k * 4 + 1]; verts[o + 8] = b * ss(6, 4, h); verts[o + 9] = M[k * 4 + 3] = veg;
  }
  let ni = 0;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    if (Math.max(H[a], H[b], H[c], H[d]) < -9) continue;
    idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = b; idx[ni++] = c; idx[ni++] = d;
  }
  return { at, mat, lavaD, verts, idx: idx.subarray(0, ni), mask, paths };
}
