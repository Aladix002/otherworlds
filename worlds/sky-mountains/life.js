// Life and discoveries for sky-mountains: sky-mantas, songbirds, shrine, rope bridge, nest, flag lines, puff-globe plants, butterfly homes.
import { snoise2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { sphere, tube, lathe, torus, box, computeNormals, merge } from '../../core/src/mesh.js';
import { grid, setUV, mk, islandRR } from './geo.js';
import { ISL, HERO, topY, pillarTop } from './layout.js';

const TAU = Math.PI * 2;
const ell = (sx, sy, sz, x, y, z, sub, ao, mat) => { const g = sphere(1, sub); for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] = g.pos[i] * sx + x; g.pos[i + 1] = g.pos[i + 1] * sy + y; g.pos[i + 2] = g.pos[i + 2] * sz + z; } return setUV(computeNormals(g), ao, mat); };
// flat ribbon trailing toward +z; material 8 + distance along (waved in the vertex shader)
const rib = (x, z, L, w, ao) => grid(4, 12, (u, v, o) => {
  const a = u * TAU, ww = w * Math.pow(Math.sin(Math.PI * Math.min(v * 0.9 + 0.1, 1)), 0.6);
  o[0] = x + Math.cos(a) * ww; o[1] = Math.sin(a) * 0.006; o[2] = z + v * L; o[3] = ao; o[4] = 8 + 0.98 * v;
});

// ---- sky-manta: half-span 1, nose toward -z. uv.x: 1 back, 0.4 belly. Wings bend by |x| in the vertex shader.
export function manta() {
  const parts = [grid(10, 28, (u, v, o) => {
    const s = 2 * v - 1, q = Math.abs(s), a = u * TAU, c = 0.08 + 0.72 * Math.pow(1 - q, 0.75), th = 0.17 * Math.exp(-14 * q * q) + 0.016 * (1 - q) + 0.004, sn = Math.sin(a);
    o[0] = s; o[1] = sn * th * (sn > 0 ? 1.3 : 0.8); o[2] = -0.45 + 0.55 * Math.pow(q, 1.5) + c * (0.5 + 0.5 * Math.cos(a));
    o[3] = sn > 0 ? 1 : 0.4; o[4] = 7;
  })];
  for (const sg of [-1, 1]) {
    parts.push(setUV(tube([[sg * 0.11, 0, -0.38], [sg * 0.15, -0.02, -0.52], [sg * 0.13, -0.05, -0.64]], (t) => 0.045 - 0.035 * t, 5), 0.7, 7));
    parts.push(rib(sg * 0.06, 0.25, 1.6, 0.05, 0.7), rib(sg * 0.985, 0.1, 0.55, 0.025, 0.7));
  }
  return merge(parts);
}
// ---- long-tailed songbird: wingspan 1
export function songbird() {
  const parts = [ell(0.055, 0.05, 0.17, 0, 0, 0, 1, 1, 9), ell(0.042, 0.04, 0.05, 0, 0.025, -0.17, 1, 1, 9),
    setUV(tube([[0, 0.02, -0.2], [0, 0.012, -0.27]], (t) => 0.014 - 0.012 * t, 4), 0.2, 9)];
  for (const sg of [-1, 1]) {
    parts.push(grid(6, 6, (u, v, o) => {
      const a = u * TAU; o[0] = sg * (0.03 + 0.47 * v); o[1] = 0.012 + Math.sin(a) * 0.012 * (1 - 0.7 * v);
      o[2] = Math.cos(a) * (0.13 * (1 - 0.85 * v * v) + 0.015) + 0.1 * v * v; o[3] = v > 0.7 ? 0.25 : 1; o[4] = 9;
    }, sg < 0));
  }
  parts.push(ell(0.035, 0.006, 0.1, 0, 0.005, 0.22, 1, 0.5, 9));
  return merge(parts);
}

// ---- static props (world space, one mesh, drawn with the vegetation shader). Material 7 = paint (index in the weight), 8 = flag cloth.
const P = (k) => 7 + (k + 0.5) / 8 * 0.98;   // 0 red lacquer, 1 roof, 2 gold, 3 pale stone, 4 dark wood, 5 egg, 6 lantern, 7 plank
const put = (g, x, y, z, yaw, ao, mat) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < g.pos.length; i += 3) {
    const px = g.pos[i], pz = g.pos[i + 2], nx = g.nrm[i], nz = g.nrm[i + 2];
    g.pos[i] = c * px + s * pz + x; g.pos[i + 1] += y; g.pos[i + 2] = -s * px + c * pz + z; g.nrm[i] = c * nx + s * nz; g.nrm[i + 2] = -s * nx + c * nz;
  }
  return ao === undefined ? g : setUV(g, ao, mat);
};
const pole = (parts, x, y, z, h) => parts.push(setUV(tube([[x, y - 0.4, z], [x, y + h, z]], 0.055, 5), 0.7, P(4)));
function pagoda(parts, x, y, z) {
  const add = (g, yy, ao, k) => parts.push(put(g, x, y + yy, z, 0.52, ao, P(k)));
  add(lathe([[4.6, -1.6], [4.5, 0.22], [3.9, 0.24], [3.85, 0.5], [3.3, 0.52], [3.25, 0.8], [0.01, 0.81]], 6), 0, 0.9, 3);   // stepped stone plinth
  let yy = 0.8;
  for (let i = 0; i < 3; i++) {
    const w = 2.3 - 0.5 * i, h = 2.3 - 0.25 * i;
    add(lathe([[w * 0.86, 0], [w * 0.86, h]], 6), yy, (t) => 0.85 - 0.45 * t, 3);                    // plaster wall behind the pillars
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU, c = Math.cos(a), s = Math.sin(a), m = Math.cos(a + TAU / 12) * w * 0.76, n = Math.sin(a + TAU / 12) * w * 0.76;
      add(tube([[c * w, 0, s * w], [c * w, h, s * w]], 0.13, 6), yy, 0.9, 0);
      add(tube([[c * w * 1.75, h - 0.02, s * w * 1.75], [c * w * 1.75, h - 0.45, s * w * 1.75]], 0.012, 3), yy, 0.4, 4);   // lantern hanging under the eave
      add(ell(0.13, 0.19, 0.13, c * w * 1.75, h - 0.6, s * w * 1.75, 1), yy, 1, 6);
      if (!i && k % 3 === 0) add(ell(0.5, 0.85, 0.1, m, 0.85, n, 1), yy, 1, 6);                          // doorways glowing from inside
      else add(ell(0.3, 0.45, 0.06, m, h * 0.55, n, 1), yy, 0.5, 4);
    }
    add(lathe([[w * 1.03, h * 0.86], [w * 1.03, h]], 6), yy, 0.8, 0);
    add(lathe([[w * 2.05, h + 0.42], [w * 1.9, h + 0.16], [w * 1.6, h + 0.12], [w * 1.2, h + 0.3], [w * 0.8, h + 0.66], [w * 0.55, h + 0.95]], 6), yy, 0.95, 1);   // upturned eave
    add(lathe([[w * 1.9, h + 0.16], [w * 0.9, h - 0.04]], 6), yy, 0.4, 4);
    yy += h + 0.95;
  }
  add(lathe([[0.8, 0], [0.22, 0.45], [0.09, 2.2], [0.01, 2.7]], 6), yy, 1, 2); add(sphere(0.26, 1), yy + 1.3, 1, 2);
  return y + yy + 2.3;
}
function flagLine(parts, A, B, sag) {
  const dx = B[0] - A[0], dz = B[2] - A[2], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, n = Math.hypot(dx, B[1] - A[1], dz) / 0.36 | 0, path = [];
  const at = (t) => [A[0] + dx * t, A[1] + (B[1] - A[1]) * t - 4 * sag * t * (1 - t), A[2] + dz * t];
  for (let j = 0; j <= 16; j++) path.push(at(j / 16));
  parts.push(setUV(tube(path, 0.016, 3), 0.5, P(4)));
  const g = mk(n * 4, n * 6);
  for (let i = 0; i < n; i++) {
    const p = at((i + 1) / (n + 1));
    for (let c = 0; c < 4; c++) {
      const k = i * 4 + c, sx = (c & 1 ? 1 : -1) * (c < 2 ? 0.13 : 0.1);
      g.pos[k * 3] = p[0] + ux * sx; g.pos[k * 3 + 1] = p[1] - (c < 2 ? 0 : 0.32); g.pos[k * 3 + 2] = p[2] + uz * sx;
      g.nrm[k * 3] = -uz; g.nrm[k * 3 + 1] = 0.3; g.nrm[k * 3 + 2] = ux; g.uv[k * 2] = (i % 5 + 0.5) / 5; g.uv[k * 2 + 1] = c < 2 ? 8 : 8.95;
    }
    g.idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  parts.push(g);
}
function bridge(parts, A, B, sag) {
  const dx = B[0] - A[0], dz = B[2] - A[2], l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l, n = l / 0.5 | 0, yaw = Math.atan2(-dx, -dz);
  const at = (t, o, h) => [A[0] + dx * t + px * o, A[1] + (B[1] - A[1]) * t - 4 * sag * t * (1 - t) + h, A[2] + dz * t + pz * o];
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n, 0, 0);
    parts.push(put(box(1.2, 0.06, 0.38), p[0], p[1], p[2], yaw, 0.85, P(7)));
    if (i % 3 === 1) for (const sd of [-0.62, 0.62]) parts.push(setUV(tube([at((i + 0.5) / n, sd, -0.05), at((i + 0.5) / n, sd, 0.95)], 0.018, 3), 0.6, P(4)));
  }
  for (const sd of [-0.62, 0.62]) for (const h of [-0.04, 0.95]) {
    const path = []; for (let j = 0; j <= 24; j++) path.push(at(j / 24, sd, h));
    parts.push(setUV(tube(path, 0.045, 4), 0.6, P(4)));
  }
  parts.push(grid(4, 24, (u, v, o) => { const a = u * TAU + 0.785, p = at(v, Math.cos(a) * 0.8, Math.sin(a) * 0.2 - 0.17); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = 0.6; o[4] = P(4); }));
  for (const E of [A, B]) for (const sd of [-0.62, 0.62]) pole(parts, E[0] + px * sd, E[1], E[2] + pz * sd, 1.5);
}
function nest(parts, x, y, z, R) {
  for (const [rr, r, h] of [[3.3, 0.9, 0.35], [3.7, 0.6, 0.95], [2.9, 0.5, 1.0]]) {
    const g = torus(rr, r, 22, 7);
    for (let i = 0; i < g.pos.length; i += 3) { const d = 1 + 0.22 * snoise2(g.pos[i] * 1.3 + h * 9, g.pos[i + 2] * 1.3 + g.pos[i + 1] * 2); g.pos[i] *= d; g.pos[i + 1] *= 0.75 * d; g.pos[i + 2] *= d; }
    parts.push(put(computeNormals(g), x, y + h, z, h * 3, 0.5 + 0.3 * h, 2));
  }
  parts.push(put(lathe([[0.01, 0.0], [2.4, 0.1], [3.4, 0.6]], 12), x, y, z, 0, 0.5, 2));
  for (let i = 0; i < 60; i++) {                            // woven branches: long chords around the rim
    const a = R() * TAU, b = a + 0.5 + R() * 0.9, r = 3 + R() * 1.1, h = 0.3 + R() * 1.1, m = (a + b) / 2;
    parts.push(setUV(tube([[x + Math.cos(a) * r, y + h, z + Math.sin(a) * r], [x + Math.cos(m) * r * 1.04, y + h + 0.25, z + Math.sin(m) * r * 1.04], [x + Math.cos(b) * (r + R()), y + h + R() * 0.7, z + Math.sin(b) * (r + R())]], (t) => 0.075 - 0.045 * t, 4), 0.75, 2));
  }
  for (const [ex, ez, s] of [[-0.9, 0.15, 1], [0.8, 0.7, 0.9], [0.4, -0.95, 0.82]]) parts.push(ell(0.8 * s, 1.08 * s, 0.8 * s, x + ex, y + 0.95 * s, z + ez, 2, 1, P(5)));
}

export function buildLife(L) {
  const R = makeRng(4242), parts = [], globes = [], bfly = [], S = ISL[6], G3 = ISL[3];
  // shrine island: pagoda, four flag lines to rim poles
  const px = S.x + 1, pz = S.z + 1, py = topY(S, px, pz) - 0.1, spire = pagoda(parts, px, py, pz);
  for (let k = 0; k < 4; k++) {
    const a = 0.5 + k * TAU / 4, x = S.x + Math.cos(a) * S.rx * 0.74, z = S.z + Math.sin(a) * S.rz * 0.74, y = topY(S, x, z);
    pole(parts, x, y, z, 2.6); flagLine(parts, [px, spire - 1.2, pz], [x, y + 2.55, z], 0.7);
  }
  // nest on the pillar top next to it, joined by a rope bridge
  const N = pillarTop(L, -92, -60), ny = N[1] - 0.45;
  nest(parts, N[0], ny, N[2], R);
  const bx = N[0] - S.x, bz = N[2] - S.z, bl = Math.hypot(bx, bz), ax = S.x + bx / bl * S.rx * 0.8, az = S.z + bz / bl * S.rz * 0.8;
  bridge(parts, [ax, topY(S, ax, az) + 0.2, az], [N[0] - bx / bl * 5.2, ny - 0.7, N[2] - bz / bl * 5.2], 2.4);
  // hero island: flag gate over the path to the door
  for (const sx of [-3.4, 3.4]) pole(parts, sx, topY(HERO, sx, 7.6), 7.6, 3.1);
  flagLine(parts, [-3.4, topY(HERO, -3.4, 7.6) + 3.05, 7.6], [3.4, topY(HERO, 3.4, 7.6) + 3.05, 7.6], 0.45);
  // puff-globe plants: a grove on the meadow island, a few on the hero island
  const stalk = (x, z, I, h) => {
    const y = topY(I, x, z), a = R() * TAU, b = (0.15 + R() * 0.35) * h, w = R() * TAU, path = [];
    for (let j = 0; j <= 7; j++) { const t = j / 7, o = b * t * t + 0.12 * h * Math.sin(t * 4 + w) * t; path.push([x + Math.cos(a) * o, y - 0.3 + (h + 0.3) * t * (1 - 0.12 * t), z + Math.sin(a) * o]); }
    parts.push(setUV(tube(path, (t) => 0.02 + 0.012 * h * (1 - t), 5), 0.8, (t) => 1 + 0.35 * t * t));
    globes.push(path[7][0], path[7][1], path[7][2], 0.32 + 0.1 * h);
  };
  for (let i = 0, t = 0; i < 26 && t < 900; t++) {
    const x = (R() * 2 - 1) * G3.rx, z = (R() * 2 - 1) * G3.rz;
    if (islandRR(G3, x, z) > 0.8) continue;
    stalk(G3.x + x, G3.z + z, G3, 2.2 + 4.6 * R() * R()); i++;
  }
  for (const [x, z, h] of [[5.5, -21, 2.2], [12, 15.5, 3], [10.6, 17, 1.9], [-12, 13, 2.4]]) stalk(x, z, HERO, h);
  for (let i = 0; i < 13; i++) { const a = R() * TAU, r = 0.5 + 3.6 * Math.sqrt(R()); stalk(-10.5 + Math.cos(a) * r, -10.5 + Math.sin(a) * r * 1.5, HERO, 1.1 + 2.6 * R()); }
  // butterfly homes over the island meadows: [x, y, z, seed]
  for (const [i, n] of [[0, 90], [1, 60], [3, 70], [4, 30], [6, 30]]) for (let k = 0, t = 0; k < n && t < 2000; t++) {
    const I = ISL[i], x = (R() * 2 - 1) * I.rx, z = (R() * 2 - 1) * I.rz;
    if (islandRR(I, x, z) > 0.8) continue;
    bfly.push(I.x + x, topY(I, I.x + x, I.z + z) + 0.5 + 1.3 * R(), I.z + z, R()); k++;
  }
  const cover = [1, 3, 6].map((i) => {
    const I = ISL[i], tufts = [], flowers = [];
    for (let k = 0; k < I.rx * 50; k++) {
      const x = (R() * 2 - 1) * I.rx * 1.3, z = (R() * 2 - 1) * I.rz * 1.3, f = R() < 0.1;
      if (islandRR(I, x, z) < 0.93) (f ? flowers : tufts).push(I.x + x, topY(I, I.x + x, I.z + z), I.z + z, f ? 0.6 + R() * 0.5 : 0.6 + R() * 0.7, R() * TAU, R(), 1, 0);
    }
    return { tufts, flowers, bs: [I.x, I.y, I.z, I.rx + 70] };
  });
  return { geo: merge(parts), globes, bfly, cover, nest: [N[0], ny + 1, N[2]], shrine: [px, py + 5, pz], keep: [[px, pz, 6.5], [N[0], N[2], 7], [ax, az, 2.5]] };
}

// ---- loops for the flyers. Instance (12 floats): centre xyz, radius | phase, lateral, back, size | kind / hue, seed, loop yaw, rad/s
export function flyPos(F, k, t, o) {
  const r = F[k + 3], ph = F[k + 4] + t * F[k + 11], qx = r * Math.cos(ph), qz = r * 0.7 * Math.sin(ph), c = Math.cos(F[k + 10]), s = Math.sin(F[k + 10]);
  o[0] = F[k] + c * qx + s * qz; o[1] = F[k + 1] + Math.min(r * 0.12, 9) * Math.sin(ph * 1.7 + F[k + 9] * 6); o[2] = F[k + 2] + c * qz - s * qx;
  return o;
}
// jitter a wanted loop until the whole path keeps `clear` metres from rock
export function fitLoop(R, sdf, d, clear, F) {
  const o = [0, 0, 0];
  for (let t = 0; t < 500; t++) {
    const j = t * 0.4, k = 1 + (R() - 0.5) * Math.min(t * 0.004, 0.5);
    F[0] = d[0] + (R() - 0.5) * j; F[1] = d[1] + (R() - 0.5) * j * 0.3; F[2] = d[2] + (R() - 0.5) * j; F[3] = d[3] * k;
    F[4] = R() * TAU; F[9] = R(); F[10] = R() * TAU; F[11] = 0;
    let ok = 1;
    const amp = Math.min(F[3] * 0.12, 9);
    for (let i = 0; i < 48 && ok; i++) {
      F[4] = i / 48 * TAU; flyPos(F, 0, 0, o);
      if (F[1] - amp < 58 || sdf(o[0], F[1] - amp, o[2]) < clear || sdf(o[0], F[1], o[2]) < clear || sdf(o[0], F[1] + amp, o[2]) < clear) ok = 0;
    }
    if (ok) return 1;
  }
  return 0;
}
