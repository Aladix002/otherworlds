// Meadow layout: terrain function, river, paths, colour fields, trees, tunnel, bridges and the baked maps.
import { fbm2, snoise2, hash2i } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';

export const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export const MS = 140, MN = 512, ZS = 560, HW = 3.6;       // map half extent (m), map resolution, colour-field half extent, river half width
const sl = Math.hypot(0.38, 0.17, 0.9);
export const SUN = [-0.38 / sl, 0.17 / sl, -0.9 / sl];
export const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
export const DOOR = [-7, 46], RING = [-30, -10], BIGTREE = [-15, 35], WARREN = [[2.2, -30.6], [-19, 30.5]], FLOCK = [4, -17];

export const riverZ = (x) => -46 + 9 * Math.sin(x * 0.035 + 0.6) + 4 * Math.sin(x * 0.083 + 2);
const riverD = (x) => 0.315 * Math.cos(x * 0.035 + 0.6) + 0.332 * Math.cos(x * 0.083 + 2);
export const riverT = (x, z) => Math.abs(z - riverZ(x)) / Math.hypot(1, riverD(x)) - HW;   // distance to the water edge

function hRaw(x, z) {
  const t = riverT(x, z), r = Math.hypot(x, z + 10);
  const base = 5.2 + 4.6 * fbm2(x * 0.011 + 3.1, z * 0.011 - 1.7, 3) + 36 * ss(150, 520, r) * (0.6 + 0.4 * snoise2(x * 0.0035, z * 0.0035));
  return base * (1 - Math.exp(-Math.max(t, 0) / 20)) + 0.3 * ss(-0.3, 1.5, t) - 0.9 * ss(0.3, -2.2, t);
}
const HD = hRaw(DOOR[0], DOOR[1]);
export function hAt(x, z) {
  const d = Math.hypot(x - DOOR[0], z - DOOR[1]), h = hRaw(x, z);
  return d < 7 ? h + (HD - h) * ss(7, 2.6, d) : h;
}

// bridges: centre x, built across the river along its normal
export const BRIDGES = [9, 60].map((x) => {
  const z = riverZ(x), D = riverD(x), l = Math.hypot(1, D), nx = -D / l, nz = 1 / l, L = 12.4;
  const y0 = Math.max(hAt(x + nx * L / 2, z + nz * L / 2), hAt(x - nx * L / 2, z - nz * L / 2)) - 0.05;
  return { x, z, nx, nz, L, y0 };
});
export const deckY = (b, s) => b.y0 + 0.75 * (1 - (2 * s / b.L) ** 2);
export function bridgeAt(x, z) {                                   // deck height or -1e9
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z, s = dx * b.nx + dz * b.nz, l = dx * b.nz - dz * b.nx;
    if (Math.abs(l) < 1.0 && Math.abs(s) < b.L / 2) return deckY(b, s);
  }
  return -1e9;
}
const be = (i, k) => { const b = BRIDGES[i]; return [b.x + b.nx * k, b.z + b.nz * k]; };

// Catmull-Rom polyline sampler (clamped ends), step in metres
function cr(P, step) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(i - 1, 0)], b = P[i], c = P[i + 1], d = P[Math.min(i + 2, P.length - 1)];
    const n = Math.max(1, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const TUNP = [[15, -5], [24, -10], [34, -12], [44, -17], [52, -24]];
export const TUN = cr(TUNP, 0.25);
const PATHS = [
  cr([[-7, 48.5], [-7, 43], [-4.5, 33], [-0.5, 21], [2.5, 7], [6.5, -10], [9.4, -24], be(0, 6.2), be(0, -6.2), [7, -52], [-2, -64], [-18, -76], [-40, -84], [-70, -86]], 0.3),
  cr([[2.5, 7], [8, 1], ...TUNP, [57, -29.5], be(1, 6.2), be(1, -6.2), [59, -52], [48, -62], [28, -66], [7, -52]], 0.3),
];

// colour fields: [colour, main species, main colour index (0 = field colour), accent species, accent share, accent colour index, density]
// species: 0 poppy, 1 lavender, 2 star, 3 bells, 4 spiral, 5 puffball, 6 lantern, 7 daisy
export const FIELDS = [
  [0x6a45d8, 1, 0, 1, 0, 0, 1],
  [0xee6a50, 0, 0, 7, 0.12, 1, 1],
  [0xf7b417, 5, 0, 6, 0.3, 5, 0.9],
  [0x4698f2, 2, 0, 3, 0.25, 1, 0.95],
  [0xd4589c, 4, 0, 3, 0.3, 3, 0.95],
  [0xff7a55, 7, 0, 6, 0.14, 5, 0.9],
  [0xf5a3d2, 3, 0, 2, 0.3, 1, 0.9],
  [0x5f9a30, 7, 1, 0, 0.3, 6, 0.2],
];
const FT = [0, 0, 1, 2, 2, 3, 5, 5, 6, 7, 7, 3, 4, 0, 6];
const SITES = [[-30, -6, 0], [5, 21, 1], [26, 12, 2], [-17, 31, 3], [-30, 52, 6], [20, 44, 5], [48, 8, 3], [26, -30, 6], [-8, -72, 2], [50, -70, 0], [-70, -40, 5], [80, -20, 1], [-75, 20, 2], [-20, -120, 1], [100, -100, 4]];
const DBG = typeof location !== 'undefined' && new URLSearchParams(location.search).get('z');
function zone(x, z) {
  if (DBG) return +DBG;
  const k = 1 / (1 + Math.max(0, Math.hypot(x, z) - 150) / 220);          // fields get broader toward the far hills
  const wx = (x + 13 * snoise2(x * 0.012, z * 0.012)) * k, wz = (z + 13 * snoise2(x * 0.012 + 7.7, z * 0.012 - 3.3)) * k;
  const C = 72, ci = Math.floor(wx / C), cj = Math.floor(wz / C);
  let best = 1e9, id = 0;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const h = hash2i(i + 100, j + 100), sx = (i + 0.2 + 0.6 * (h & 255) / 255) * C, sz = (j + 0.2 + 0.6 * ((h >>> 8) & 255) / 255) * C;
    const d = (sx - wx) ** 2 + (sz - wz) ** 2;
    if (d < best) { best = d; id = FT[(h >>> 16) % FT.length]; }
  }
  for (const s of SITES) { const d = ((s[0] - wx) ** 2 + (s[1] - wz) ** 2) * 1.1; if (d < best) { best = d; id = s[2]; } }
  return id;
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

export async function buildMap(progress) {
  const R = makeRng(4242), N = MN, H = new Float32Array(N * N), A = new Float32Array(N * N * 4), GR = new Uint8Array(N * N), DEN = new Uint8Array(N * N);
  const wc = (i) => (i + 0.5) / N * 2 * MS - MS, ti = (v) => Math.floor((v + MS) / (2 * MS) * N);
  // ---- colour fields (wide, coarse) ----
  const ZID = new Uint8Array(N * N), B0 = new Float32Array(N * N * 4), B = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const id = zone((i + 0.5) / N * 2 * ZS - ZS, (j + 0.5) / N * 2 * ZS - ZS), c = FIELDS[id][0], k = (j * N + i) * 4;
      ZID[j * N + i] = id;
      B0[k] = lin(c >> 16); B0[k + 1] = lin((c >> 8) & 255); B0[k + 2] = lin(c & 255); B0[k + 3] = id ? 0 : 1;
    }
    if ((j & 127) === 0) await progress(0.02 + 0.1 * j / N);
  }
  for (let pass = 0; pass < 2; pass++) {                   // soft paint edges (separable blur)
    const src = B0.slice(), st = pass ? N : 1;
    for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) for (let c = 0; c < 4; c++) {
      const k = (j * N + i) * 4 + c;
      B0[k] = (src[k - 2 * st * 4] + src[k - st * 4] + src[k] + src[k + st * 4] + src[k + 2 * st * 4]) / 5;
    }
  }
  for (let k = 0; k < B.length; k++) B[k] = Math.sqrt(B0[k]) * 255;
  // ---- height, masks ----
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = wc(i), z = wc(j), k = j * N + i, t = riverT(x, z);
    H[k] = A[k * 4] = hAt(x, z);
    A[k * 4 + 1] = ss(0.2, 1.4, t);                       // flowers allowed
    A[k * 4 + 2] = ss(0.6, -1.2, t);                      // water / wet
    A[k * 4 + 3] = 1;
  }
  await progress(0.2);
  const stamp = (x, z, r0, r1, f) => {                    // f(k4, falloff 0..1)
    const i0 = Math.max(0, ti(x - r1)), i1 = Math.min(N - 1, ti(x + r1)), j0 = Math.max(0, ti(z - r1)), j1 = Math.min(N - 1, ti(z + r1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(wc(i) - x, wc(j) - z); if (d < r1) f((j * N + i) * 4, ss(r1, r0, d)); }
  };
  const path = (x, z, r0, r1) => stamp(x, z, r0, r1, (k, f) => { A[k + 2] = Math.min(A[k + 2], -f); A[k + 1] = Math.min(A[k + 1], 1 - f); });
  for (const P of PATHS) for (const p of P) path(p[0], p[1], 0.45, 1.25);
  for (const p of TUN) path(p[0], p[1], 0.95, 1.6);
  path(DOOR[0], DOOR[1] - 1.6, 1.3, 2.3); path(DOOR[0], DOOR[1], 0.75, 0.95);
  const FM = new Float32Array(N * N).fill(1);                // no tall flowers right around the door (grass stays), except beside the posts
  stamp(DOOR[0], DOOR[1], 2.4, 3.6, (k, f) => { FM[k / 4] = 1 - f; });
  stamp(RING[0], RING[1], 3.2, 4.2, (k, f) => { FM[k / 4] = 1 - f; });
  for (const p of WARREN) stamp(p[0], p[1], 3.0, 3.8, (k, f) => { FM[k / 4] = 1 - f; });
  stamp(DOOR[0] - 1.2, DOOR[1], 0.3, 0.6, (k, f) => { FM[k / 4] = Math.max(FM[k / 4], f); });
  // ---- trees: [x, z, scale, variant] ----
  const trees = [], clear = (x, z, r) => {
    for (const P of [...PATHS, TUN]) for (let i = 0; i < P.length; i += 4) if (Math.hypot(P[i][0] - x, P[i][1] - z) < r) return false;
    for (const t of trees) if (Math.hypot(t[0] - x, t[1] - z) < 3.2) return false;
    return Math.hypot(x - DOOR[0], z - DOOR[1]) > 9 && Math.hypot(x, z - 20) > 12;
  };
  trees.push([BIGTREE[0], BIGTREE[1], 1.9, 0]);
  const tryTree = (x, z, s) => { if (clear(x, z, 4.2) && riverT(x, z) > 1.2) trees.push([x, z, s, R.int(3)]); };
  for (let i = 0; i < 150; i++) {
    const x = R.range(-330, 330), sd = R.sign(), t = HW + 1.6 + 13 * R() * R();
    tryTree(x - sd * riverD(x) * t, riverZ(x) + sd * t * Math.hypot(1, riverD(x)), R.range(0.75, 1.35));
  }
  for (const [gx, gz, n] of [[-62, 12, 6], [74, 26, 5], [-34, -98, 6], [44, -104, 5], [96, -72, 6], [-100, -42, 5],  [100, 70, 6], [-90, 90, 6], [20, 100, 5], [-150, -150, 8], [170, -160, 8], [-200, 40, 8], [190, 60, 8], [0, -210, 8], [120, 190, 7], [-110, 200, 7]])
    for (let i = 0; i < n; i++) { const a = R() * 6.283, r = n > 1 ? 2 + Math.sqrt(R()) * (6 + n) : 0; tryTree(gx + Math.cos(a) * r, gz + Math.sin(a) * r, R.range(0.85, 1.5)); }
  for (const t of trees) stamp(t[0], t[1], 0.3, 1.1, (k, f) => { A[k + 1] = Math.min(A[k + 1], 1 - f); });
  // ---- sun visibility: hills (height-field march), then soft blobs for trees, tunnel, bridges and the door ----
  const hb = (x, z) => {                                  // bilinear height
    const u = Math.min(Math.max((x + MS) / (2 * MS) * N - 0.5, 0), N - 1.001), v = Math.min(Math.max((z + MS) / (2 * MS) * N - 0.5, 0), N - 1.001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * N + i;
    return (H[k] * (1 - fu) + H[k + 1] * fu) * (1 - fv) + (H[k + N] * (1 - fu) + H[k + N + 1] * fu) * fv;
  };
  const sh = Math.hypot(SUN[0], SUN[2]), sx = SUN[0] / sh, sz = SUN[2] / sh, tan = SUN[1] / sh;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = wc(i), z = wc(j), k = j * N + i; let v = 1;
      for (let s = 2, n = 0; n < 14 && v > 0.02; n++, s *= 1.36) {
        const px = x + sx * s, pz = z + sz * s;
        if (Math.abs(px) > MS || Math.abs(pz) > MS) break;
        v = Math.min(v, (H[k] + 0.35 + s * tan - hb(px, pz)) / (s * 0.09) + 0.5);
      }
      A[k * 4 + 3] = Math.max(v, 0);
    }
    if ((j & 127) === 0) await progress(0.2 + 0.1 * j / N);
  }
  const seg = (ax, az, len, r0, r1, soft, dark) => {       // soft capsule shadow from (ax, az) away from the sun
    const bx = ax - sx * len, bz = az - sz * len, m = Math.max(r0, r1) + soft;
    const i0 = Math.max(0, ti(Math.min(ax, bx) - m)), i1 = Math.min(N - 1, ti(Math.max(ax, bx) + m)), j0 = Math.max(0, ti(Math.min(az, bz) - m)), j1 = Math.min(N - 1, ti(Math.max(az, bz) + m));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = wc(i), z = wc(j), h = len ? Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len))) : 0;
      const d = Math.hypot(x - ax - (bx - ax) * h, z - az - (bz - az) * h) - (r0 + (r1 - r0) * h), sf = soft * (0.4 + 0.6 * h);
      A[(j * N + i) * 4 + 3] *= 1 - dark * (1 - ss(-sf, sf, d));
    }
  };
  const cot = 1 / tan;
  for (const [x, z, s] of trees) {
    seg(x, z, 3.2 * s * cot, 0.35 * s, 0.3 * s, 0.5, 0.55);                                   // trunk
    seg(x - sx * 2.6 * s * cot, z - sz * 2.6 * s * cot, 4.4 * s * cot, 2.3 * s, 3.0 * s, 2.4, 0.72);   // crown
    seg(x, z, 0, 1.2 * s, 1.2 * s, 1.5, 0.35);
  }
  for (let i = 0; i < TUN.length; i += 3) { seg(TUN[i][0], TUN[i][1], 0, 1.5, 1.5, 0.7, 0.3); seg(TUN[i][0], TUN[i][1], 3.4 * cot, 1.7, 1.9, 1.6, 0.12); }
  for (const b of BRIDGES) for (let s = -6; s <= 6; s += 0.6) seg(b.x + b.nx * s, b.z + b.nz * s, 1.6 * cot, 0.9, 0.9, 0.5, 0.2);
  seg(DOOR[0], DOOR[1], 2.3 * cot, 0.6, 0.75, 0.45, 0.68);
  for (let k = -3; k <= 3; k++) seg(DOOR[0] + k * 0.2, DOOR[1], 0, 0.16, 0.16, 0.5, 0.2);     // contact shade under the frame
  // ---- CPU masks for the per-frame flower binning ----
  for (let k = 0; k < N * N; k++) {
    const x = wc(k % N), z = wc(Math.floor(k / N)), u = Math.floor((x + ZS) / (2 * ZS) * N), v = Math.floor((z + ZS) / (2 * ZS) * N);
    const fd = FIELDS[ZID[v * N + u]][6];
    GR[k] = Math.max(A[k * 4 + 1], A[k * 4 + 2] < 0 ? 0 : ss(-0.7, 0.1, riverT(x, z))) * 255;       // grass also grows down the banks, into the shallows (reeds)
    DEN[k] = A[k * 4 + 1] * FM[k] * fd * 255;
    A[k * 4 + 1] *= (0.25 + 0.75 * fd) * FM[k];
  }
  return { H, A, B, ZID, GR, DEN, trees, hb };
}
