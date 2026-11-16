// Dream desert: layout, ground heightfield, rock SDF (mesa with the slot canyon, lone arch), surface-nets mesher,
// vertex light bakes, terrain mesh and the rock detail texture. All CPU, at load time.
import { hash3i, u2f, fbm2, snoise2 } from '../../core/src/noise.js';

export const HM = 17;                                   // mesa height
export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

export function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); fz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = u2f(hash3i(ix, iy, iz)), b = u2f(hash3i(ix + 1, iy, iz)), c = u2f(hash3i(ix, iy + 1, iz)), d = u2f(hash3i(ix + 1, iy + 1, iz));
  const e = u2f(hash3i(ix, iy, iz + 1)), f = u2f(hash3i(ix + 1, iy, iz + 1)), g = u2f(hash3i(ix, iy + 1, iz + 1)), h = u2f(hash3i(ix + 1, iy + 1, iz + 1));
  const m0 = a + (b - a) * fx, m1 = c + (d - c) * fx, m2 = e + (f - e) * fx, m3 = g + (h - g) * fx;
  const n0 = m0 + (m1 - m0) * fy, n1 = m2 + (m3 - m2) * fy;
  return (n0 + (n1 - n0) * fz) * 2 - 1;
}

// ---------------------------------------------------------------- canyon layout
// the slot runs along z through the mesa: centreline x = cx(z), south mouth z = +37, north mouth z = -37
export const cx = (z) => 6 * Math.sin(z * 0.085 + 0.6) + 2.2 * Math.sin(z * 0.23 + 2);
const dcx = (z) => 0.51 * Math.cos(z * 0.085 + 0.6) + 0.506 * Math.cos(z * 0.23 + 2);
export const BZ = [10, -7, -23];                        // light-beam chambers
const chamber = (z) => Math.exp(-((z - 10) ** 2) / 14) + Math.exp(-((z + 7) ** 2) / 14) + Math.exp(-((z + 23) ** 2) / 14);
export function hw(z) {                                 // half width at the floor
  const m = Math.abs(z) - 29;
  return 1.65 + 0.35 * Math.sin(z * 0.31 + 1) + 1.5 * chamber(z) + (m > 0 ? m * m * 0.06 : 0);
}
const mesa2 = (x, z) => { const qx = Math.abs(x) - 16, qz = Math.abs(z) - 22; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 14; };
// 1 deep in the canyon (dusk light), 0 out on the night dunes
export const warm = (x, z) => { const w = hw(z), d = Math.abs(x - cx(z)); return ss(43, 30, Math.abs(z)) * ss(w + 6, w + 3.5, d); };
export const dusk = (x, z) => ss(34, 24, Math.abs(z)) * ss(8, 4, Math.abs(x - cx(z)) - hw(z));

export const DOOR = [-4, 0, 56];
export const ARCH = [24, 0, -88, 0.5];
// beams: floor point f, unit direction d (pointing up the beam)
export const BEAMS = BZ.map((z, i) => { const d = [[0.16, 1, 0.1], [-0.2, 1, -0.06], [0.1, 1, 0.2]][i], l = Math.hypot(d[0], d[1], d[2]); return { f: [cx(z) + [0.3, -0.2, 0.2][i], 0, z], d: [d[0] / l, d[1] / l, d[2] / l] }; });
export const BLEN = 24;

// ---------------------------------------------------------------- ground
function crest(s) {                                     // asymmetric dune profile, 0..1, C1
  const f = s - Math.floor(s), a = 0.68;
  const c = f < a ? 0.5 - 0.5 * Math.cos(Math.PI * f / a) : 0.5 + 0.5 * Math.cos(Math.PI * (f - a) / (1 - a));
  return 1 - Math.pow(1 - c, 0.62);
}
function ground0(x, z) {
  const dm = mesa2(x, z), m = ss(3, 34, dm);
  const dl = Math.abs(x - cx(z)), w = hw(z);
  let h = 0.1 * fbm2(x * 0.09, z * 0.09, 2);
  if (dm < 4) h += 0.45 * ss(w - 1.5, w + 0.4, dl);                         // sand banked against the canyon walls
  if (dm > -3) h += 1.5 * Math.exp(-Math.max(dm, 0) / 4.5) * ss(-3, 0, dm) * (0.55 + 0.45 * snoise2(x * 0.06, z * 0.06)) * ss(5, 12, dl);   // drifts at the mesa foot
  if (m > 0) {
    const wx = x + 28 * snoise2(x * 0.004 + 3.1, z * 0.004), wz = z + 28 * snoise2(x * 0.004 - 7.3, z * 0.004 + 2.2);
    const A = (3.6 + 7 * ss(20, 170, dm)) * (0.7 + 0.3 * snoise2(x * 0.003 + 9, z * 0.003 + 5));
    h += m * (A * (crest((wx * 0.8 + wz * 0.6) * 0.0088) - 0.45) + 2.2 * Math.sin((wz * 0.94 - wx * 0.35) * 0.021 + 1.3)
      + 0.7 * crest((wx * 0.5 - wz * 0.86) * 0.027 + 0.3) + 0.4 * fbm2(x * 0.021, z * 0.021, 3) + 1.2);
  }
  const dd = Math.hypot(x - DOOR[0], z - DOOR[2]);
  return h + 1.5 * Math.exp(-dd * dd / 160);                               // the door stands on a low knoll
}
DOOR[1] = ground0(DOOR[0], DOOR[2]);
export const OASIS = [-66, 0, -30];                     // hidden pool; y = water level
OASIS[1] = ground0(OASIS[0], OASIS[2]) - 1.25;
export function ground(x, z) {
  const lx = Math.abs(x - DOOR[0]), lz = z - DOOR[2], dd = Math.hypot(lx, lz), od = Math.hypot(x - OASIS[0], z - OASIS[2]);
  let h = ground0(x, z);
  if (od < 16) h += (OASIS[1] + 0.25 - 0.9 * Math.max(0, 1 - od * od / 36) - h) * ss(16, 6, od);     // the oasis bowl
  if (dd < 7) h = DOOR[1] + (h - DOOR[1]) * ss(2.6, 7, dd) + 0.17 * Math.exp(-((lx - 1.05) ** 2) / 0.1 - lz * lz / 0.45);   // flat sill, drifts by the posts
  return h;
}
for (const b of BEAMS) b.f[1] = ground(b.f[0], b.f[2]);
ARCH[1] = ground(ARCH[0], ARCH[2]) - 0.9;
// dancing sand spirals out on the dunes
export const DEVILS = [[14, -50], [-46, -76], [17, 50]].map((p) => [p[0], ground(p[0], p[1]), p[1]]);

// ---------------------------------------------------------------- rock SDF (positive in air)
const AC = Math.cos(ARCH[3]), AS = Math.sin(ARCH[3]);
export function sdRock(x, y, z) {
  const ax = x - ARCH[0], az = z - ARCH[2];
  if (ax * ax + az * az < 260) {                         // the lone arch
    const lx = ax * AC + az * AS, lz = az * AC - ax * AS, yy = y - ARCH[1];
    const q = Math.hypot(lx * (1 + 0.07 * lx / 6), yy * 1.12) - 6.3;
    const r = 1.2 + 0.5 * vn3(x * 0.3, y * 0.3, z * 0.3) + 0.22 * vn3(x * 0.9, y * 0.9, z * 0.9) + 1.1 * ss(3.5, -1, yy) + 0.25 * Math.sin(yy * 1.5 + lx);
    return (Math.hypot(q, lz * 0.8) - r) * 0.75;
  }
  const d2 = mesa2(x, z);
  if (d2 > 9) return d2 - 4;
  const top = HM + 1.6 * vn3(x * 0.05, 0.5, z * 0.05);
  let dm = d2 - (HM - y) * 0.1 + 2.4 * vn3(x * 0.055, y * 0.07, z * 0.055) + 0.22 * Math.sin(y * 1.1 + 2.5 * vn3(x * 0.1, y * 0.1, z * 0.1));
  dm = smax(dm, y - top, 2);
  const c = cx(z);
  if (Math.abs(x - c) > 13) return dm;
  const dl = Math.abs(x - c - 1.5 * Math.sin(y * 0.4 + z * 0.11) * ss(1.5, 7, y)) / Math.sqrt(1 + dcx(z) ** 2);
  const w = hw(z) * (1 - 0.78 * ss(0.12, 1, y / HM)) + 0.3;
  const fl = 0.75 * vn3(x * 0.2, y * 0.33, z * 0.2) + 0.3 * Math.sin(y * 2.1 + 3.2 * vn3(x * 0.13 + 5, y * 0.1, z * 0.13)) + 0.2 * vn3(x * 0.55, y * 0.9, z * 0.55);
  let da = w + fl * (0.3 + 0.7 * ss(0.3, 3, y)) - dl;
  for (let i = 0; i < 3; i++) {                           // skylight chimneys along the beams
    const b = BEAMS[i], px = x - b.f[0], py = y - b.f[1], pz = z - b.f[2];
    if (px * px + pz * pz > 90) continue;
    const h = Math.min(BLEN, Math.max(2.5, px * b.d[0] + py * b.d[1] + pz * b.d[2]));
    da = smax(da, 1.35 - Math.hypot(px - b.d[0] * h, py - b.d[1] * h, pz - b.d[2] * h), 1.2);
  }
  return smax(dm, da, 0.9);
}

// ---------------------------------------------------------------- surface nets over a box
export async function meshBox(X0, Y0, Z0, X1, Y1, Z1, H, tick) {
  const NX = Math.ceil((X1 - X0) / H) + 1, NY = Math.ceil((Y1 - Y0) / H) + 1, NZ = Math.ceil((Z1 - Z0) / H) + 1, NXY = NX * NY, B = 8;
  const V = new Float32Array(NX * NY * NZ);
  const nbx = Math.ceil((NX - 1) / B), nby = Math.ceil((NY - 1) / B), nbz = Math.ceil((NZ - 1) / B);
  const thr = B * H * 0.87 * 2.2;
  for (let bk = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
      const d = sdRock(X0 + (bi * B + B / 2) * H, Y0 + (bj * B + B / 2) * H, Z0 + (bk * B + B / 2) * H);
      const i1 = Math.min(bi * B + B, NX - 1), j1 = Math.min(bj * B + B, NY - 1), k1 = Math.min(bk * B + B, NZ - 1), far = Math.abs(d) > thr;
      for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) {
        const o = (k * NY + j) * NX;
        if (far) { for (let i = bi * B; i <= i1; i++) if (V[o + i] === 0) V[o + i] = d > 0 ? 9 : -9; }
        else for (let i = bi * B; i <= i1; i++) if (V[o + i] === 0 || Math.abs(V[o + i]) === 9) V[o + i] = sdRock(X0 + i * H, Y0 + j * H, Z0 + k * H);
      }
    }
    if (tick && bk % 4 === 3) await tick(bk / nbz);
  }
  const cell = new Int32Array(NX * NY * NZ).fill(-1);
  let cap = 120000, P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), nv = 0;
  const cv = new Float32Array(8), off = [0, 1, NX, NX + 1, NXY, NXY + 1, NXY + NX, NXY + NX + 1];
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0, o = (k * NY + j) * NX; i < NX - 1; i++, o++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const v = V[o + off[c]]; cv[c] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = E[e], b = E[e + 1], va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; n++;
    }
    if (nv === cap) { cap *= 2; const p2 = new Float32Array(cap * 3), n2 = new Float32Array(cap * 3); p2.set(P); n2.set(N); P = p2; N = n2; }
    P[nv * 3] = X0 + (i + sx / n) * H; P[nv * 3 + 1] = Y0 + (j + sy / n) * H; P[nv * 3 + 2] = Z0 + (k + sz / n) * H;
    const gx = cv[1] + cv[3] + cv[5] + cv[7] - cv[0] - cv[2] - cv[4] - cv[6], gy = cv[2] + cv[3] + cv[6] + cv[7] - cv[0] - cv[1] - cv[4] - cv[5],
      gz = cv[4] + cv[5] + cv[6] + cv[7] - cv[0] - cv[1] - cv[2] - cv[3], gl = Math.hypot(gx, gy, gz) || 1;
    N[nv * 3] = gx / gl; N[nv * 3 + 1] = gy / gl; N[nv * 3 + 2] = gz / gl;
    cell[o] = nv++;
  }
  let idx = new Uint32Array(nv * 7), ni = 0;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ni + 6 > idx.length) { const i2 = new Uint32Array(idx.length * 2); i2.set(idx); idx = i2; }
    if (flip) { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
  };
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1, o = (k * NY + j) * NX + 1; i < NX - 1; i++, o++) {
    const s0 = V[o] < 0;
    if (s0 !== (V[o + 1] < 0)) quad(cell[o - NX - NXY], cell[o - NXY], cell[o], cell[o - NX], !s0);
    if (s0 !== (V[o + NX] < 0)) quad(cell[o - 1 - NXY], cell[o - 1], cell[o], cell[o - NXY], !s0);
    if (s0 !== (V[o + NXY] < 0)) quad(cell[o - 1 - NX], cell[o - NX], cell[o], cell[o - 1], !s0);
  }
  // bake -> 12 floats: pos + light | normal + ao | warm, glow rgb (terrain only)
  const out = new Float32Array(nv * 12);
  for (let v = 0; v < nv; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    const a1 = sdRock(px + nx * 0.8, py + ny * 0.8, pz + nz * 0.8) / 0.8, a2 = sdRock(px + nx * 2.6, py + ny * 2.6, pz + nz * 2.6) / 2.6;
    const ao = Math.min(1, Math.max(0.2, 0.25 + 0.75 * a1)) * Math.min(1, Math.max(0.4, 0.5 + 0.5 * a2));
    out.set([px, py, pz, canyonLight(px, py, pz), nx, ny, nz, ao, warm(px, pz) * ss(1, -4, mesa2(px, pz)), 0, 0, 0], v * 12);
  }
  return { verts: out, idx: idx.slice(0, ni) };
}
// how much of the sky light reaches a point in the slot: decays with depth below the rim, more in the open chambers
export function canyonLight(x, y, z) {
  let L = 0.1 + 0.9 * Math.exp(-Math.max(HM - y, 0) / (8 + 6 * chamber(z)));
  for (const b of BEAMS) { const d2 = (x - b.f[0]) ** 2 + (y - b.f[1] - 0.6) ** 2 + (z - b.f[2]) ** 2; L += 0.5 / (1 + d2 / 10); }
  return L;
}

// ---------------------------------------------------------------- terrain mesh (warped grid, dense near the mesa)
// glows: flat list of static light pools [x, y, z, radius, r, g, b, 0]
export function terrain(n, glows) {
  const R = 430, a = 0.16, V = new Float32Array(n * n * 12), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  const map = (i) => { const u = i / (n - 1) * 2 - 1; return R * (a * u + (1 - a) * u * u * u); };
  for (let j = 0, o = 0; j < n; j++) for (let i = 0; i < n; i++, o += 12) {
    const x = map(i), z = map(j) - 10;
    V[o] = x; V[o + 1] = ground(x, z); V[o + 2] = z; V[o + 8] = warm(x, z); V[o + 7] = 1;
    V[o + 3] = V[o + 8] > 0 ? canyonLight(x, V[o + 1], z) : 0;
    for (let g = 0; g < glows.length; g += 8) {
      const d2 = (x - glows[g]) ** 2 + (z - glows[g + 2]) ** 2;
      if (d2 > 90) continue;
      const k = (1 - d2 / 90) ** 2 / (1 + d2 / (glows[g + 3] * glows[g + 3]));
      V[o + 9] += glows[g + 4] * k; V[o + 10] += glows[g + 5] * k; V[o + 11] += glows[g + 6] * k;
    }
  }
  for (let j = 0, o = 0, q = 0; j < n; j++) for (let i = 0; i < n; i++, o += 12) {
    const l = o - (i > 0 ? 12 : 0), r = o + (i < n - 1 ? 12 : 0), u = o - (j > 0 ? n * 12 : 0), d = o + (j < n - 1 ? n * 12 : 0);
    const ax = V[r] - V[l], ay = V[r + 1] - V[l + 1], bz = V[d + 2] - V[u + 2], by = V[d + 1] - V[u + 1];
    const nx = -ay * bz, ny = ax * bz, nz = -ax * by, nl = Math.hypot(nx, ny, nz);
    V[o + 4] = nx / nl; V[o + 5] = ny / nl; V[o + 6] = nz / nl;
    if (i < n - 1 && j < n - 1) { const v = j * n + i; idx[q++] = v; idx[q++] = v + n; idx[q++] = v + 1; idx[q++] = v + 1; idx[q++] = v + n; idx[q++] = v + n + 1; }
  }
  return { verts: V, idx };
}

// ---------------------------------------------------------------- tileable detail texture
// r = height, gb = gradient, a = sparse specks. Returns the mip chain (rgba8).
export function detailMips(N) {
  const h = new Float32Array(N * N);
  const lat = (x, y, per, s) => u2f(hash3i(((x % per) + per) % per, ((y % per) + per) % per, s));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < 5; o++) {
      const per = 4 << o, fx = x / N * per, fy = y / N * per, ix = Math.floor(fx), iy = Math.floor(fy);
      let u = fx - ix, v = fy - iy; u = u * u * u * (u * (u * 6 - 15) + 10); v = v * v * v * (v * (v * 6 - 15) + 10);
      const p = lat(ix, iy, per, o), q = lat(ix + 1, iy, per, o), r = lat(ix, iy + 1, per, o), t = lat(ix + 1, iy + 1, per, o);
      s += a * (p + (q - p) * u + (r - p + (p - q - r + t) * u) * v); n += a; a *= 0.6;
    }
    h[y * N + x] = s / n;
  }
  let data = new Uint8Array(N * N * 4), gmax = 0;
  const g = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = y * N + x, gx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], gy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    g[o * 2] = gx; g[o * 2 + 1] = gy; gmax = Math.max(gmax, Math.abs(gx), Math.abs(gy));
  }
  for (let o = 0; o < N * N; o++) {
    data[o * 4] = h[o] * 255; data[o * 4 + 1] = 127.5 + 127 * g[o * 2] / gmax; data[o * 4 + 2] = 127.5 + 127 * g[o * 2 + 1] / gmax;
    data[o * 4 + 3] = u2f(hash3i(o, 7, 3)) > 0.985 ? 255 : 0;
  }
  const mips = [data];
  for (let n = N; n > 1; n >>= 1) {
    const m = n >> 1, d = new Uint8Array(m * m * 4);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) for (let c = 0; c < 4; c++) {
      const s = data[(y * 2 * n + x * 2) * 4 + c] + data[(y * 2 * n + x * 2 + 1) * 4 + c] + data[((y * 2 + 1) * n + x * 2) * 4 + c] + data[((y * 2 + 1) * n + x * 2 + 1) * 4 + c];
      d[(y * m + x) * 4 + c] = c === 3 ? Math.min(255, s * 0.5) : s / 4;
    }
    mips.push(d); data = d;
  }
  return mips;
}
