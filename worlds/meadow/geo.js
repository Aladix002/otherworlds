// Meadow geometry. Flora meshes carry two poses per vertex (closed bud / open bloom) that the vertex shader blends.
import { makeRng } from '../../core/src/math.js';
import { rock, tube, box, sphere, merge, computeNormals, scale, translate } from '../../core/src/mesh.js';

const TAU = Math.PI * 2, Z2 = [[0, 0, 0], [0, 0, 0]];
const L = (v, o) => (typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * o);
const mk = () => ({ a: [], b: [], uv: [], idx: [] });      // a = closed pose, b = open pose

// petal / leaf / blade: a strip grown from O at azimuth ph. th = pitch from vertical, k = curl over its length,
// w = width with profile sin(pi (s e)^a), cup = cross curvature, r = start radius, tilt = head tilt. [closed, open] pairs animate.
function petal(g, P) {
  const nl = P.nl || 4, nw = P.nw || 2, v0 = g.uv.length / 2, cs = Math.cos(P.ph), sn = Math.sin(P.ph);
  for (let o = 0; o < 2; o++) {
    const A = o ? g.b : g.a, th0 = L(P.th, o), len = L(P.len, o), w = L(P.w, o), k = L(P.k || 0, o), cp = L(P.cup || 0, o), O = (P.o || Z2)[o];
    const tl = L(P.tilt || 0, o), ct = Math.cos(tl), st = Math.sin(tl);
    let r = L(P.r || 0, o), y = 0;
    for (let i = 0; i <= nl; i++) {
      const s = i / nl, th = th0 + k * s;
      if (i) { const tm = th0 + k * (s - 0.5 / nl); r += Math.sin(tm) * len / nl; y += Math.cos(tm) * len / nl; }
      const ws = w * 0.5 * Math.sin(Math.PI * Math.pow(s * (P.e || 0.9), P.a || 0.7));
      for (let j = 0; j <= nw; j++) {
        const u = j / nw * 2 - 1, c = P.x ? u * ws : cp * u * u * ws, rr = r - Math.cos(th) * c, yy = y + Math.sin(th) * c, t = P.x ? 0 : u * ws;
        const x = cs * rr - sn * t, z = sn * rr + cs * t;
        A.push(O[0] + ct * x + st * yy, O[1] + ct * yy - st * x, O[2] + z);
        if (o) g.uv.push(P.mat + s * 0.98, u);
      }
    }
  }
  for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) { const a = v0 + i * (nw + 1) + j, b = a + nw + 1; g.idx.push(a, b, a + 1, a + 1, b, b + 1); }
}
// three-sided stem along f(s, o) -> [x, y] in a vertical plane at azimuth az. Returns s -> [closed point, open point]
function stem(g, f, rad, n, az = 0) {
  const v0 = g.uv.length / 2, ca = Math.cos(az), sa = Math.sin(az);
  for (let o = 0; o < 2; o++) {
    const A = o ? g.b : g.a;
    for (let i = 0; i <= n; i++) {
      const s = i / n, p = f(s, o), p2 = f(s + 0.01, o), dx = p2[0] - p[0], dy = p2[1] - p[1], l = Math.hypot(dx, dy) || 1, r = rad * (1 - 0.5 * s);
      for (let j = 0; j < 3; j++) {
        const a = j * TAU / 3, c = Math.cos(a) * r, z = Math.sin(a) * r, x = p[0] + dy / l * c;
        A.push(ca * x - sa * z, p[1] - dx / l * c, sa * x + ca * z);
        if (o) g.uv.push(s * 0.98, 0);
      }
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const a = v0 + i * 3 + j, b = v0 + i * 3 + (j + 1) % 3; g.idx.push(a, b, a + 3, b, b + 3, a + 3); }
  return (s) => [0, 1].map((o) => { const p = f(s, o); return [ca * p[0], p[1], sa * p[0]]; });
}
function dome(g, O, r, h, n, mat) {
  const v0 = g.uv.length / 2;
  for (let o = 0; o < 2; o++) {
    const A = o ? g.b : g.a, c = O[o], rr = L(r, o);
    A.push(c[0], c[1] + L(h, o), c[2]); if (o) g.uv.push(mat, 0);
    for (let j = 0; j < n; j++) { const a = j * TAU / n; A.push(c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr); if (o) g.uv.push(mat + 0.98, 0); }
  }
  for (let j = 0; j < n; j++) g.idx.push(v0, v0 + 1 + (j + 1) % n, v0 + 1 + j);
}
function add(g, h, dx, dz, s, yaw) {
  const v0 = g.uv.length / 2, c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s;
  for (const k of ['a', 'b']) for (let i = 0; i < h[k].length; i += 3) g[k].push(dx + c * h[k][i] + sn * h[k][i + 2], h[k][i + 1] * s, dz - sn * h[k][i] + c * h[k][i + 2]);
  g.uv.push(...h.uv); for (const i of h.idx) g.idx.push(i + v0);
}

// species: 0 poppy, 1 lavender, 2 star, 3 bells, 4 spiral, 5 puffball, 6 lantern, 7 daisy. lod 0 near, 1 mid, 2 far
export function flower(sp, lod, sd) {
  const g = mk(), R = makeRng(sd * 31 + sp * 7 + 1), hi = lod < 1, far = lod > 1, nl = [5, 2, 1][lod], nw = far ? 1 : hi ? 4 : 2, sr = 0.0075 * (1 + lod * 1.2);
  const lean = 0.03 + 0.08 * R(), tilt = [0.05, 0.25 + 0.3 * R()];
  const up = (H) => stem(g, (s, o) => [lean * s * s * (0.4 + 0.6 * o), L(H, o) * s], sr, hi ? 4 : far ? 1 : 2)(1);
  const arch = (H) => stem(g, (s, o) => { const h = L(H, o); return [h * (0.25 + 0.3 * o) * Math.pow(s, 2.5), h * (1.6 * s - 0.65 * s * s)]; }, sr, hi ? 6 : far ? 2 : 3);
  const leaves = (n, len, w) => { for (let i = 0; i < (far ? Math.min(n, 2) : n); i++) petal(g, { ph: R() * TAU, th: [0.2, 0.55 + 0.5 * R()], len: [len * 0.5, len * (0.8 + 0.4 * R())], w: w * (far ? 2.2 : 1), k: [0.3, 1.1], cup: 0.3, mat: 0, nl: far ? 1 : lod ? 2 : 3, nw: far ? 1 : 2, a: 0.6, e: 1 }); };
  const fs = far ? 1.6 : 1, big = (v) => (typeof v === 'number' ? v * fs : [v[0] * fs, v[1] * fs]);
  const ring = (O, n, P) => { for (let i = 0; i < n; i++) petal(g, { nl, nw, tilt, ...P, len: big(P.len), w: big(P.w), ph: (P.p0 || 0) + i * TAU / n + (R() - 0.5) * 0.15, o: O }); };
  let top;
  if (sp === 0) {
    top = up([0.26, 0.62]); leaves(3, 0.28, 0.06);
    ring(top, 4, { th: [0.1, 1.0], len: [0.1, 0.15], w: [0.11, 0.2], k: [0.25, -0.75], cup: 0.35, a: 1.5, e: 0.82, mat: 1 });
    ring(top, 4, { p0: 0.78, th: [0.16, 1.25], len: [0.11, 0.16], w: [0.12, 0.21], k: [0.2, -0.6], cup: 0.3, a: 1.5, e: 0.82, mat: 1 });
    dome(g, top, [0.012, 0.03], 0.022, 6, 2);
  } else if (sp === 1) {
    if (far) { for (let i = 0; i < 30; i++) petal(g, { ph: i * 2.4, r: 0.1 * R(), th: [0.1, 0.06 + 0.95 * Math.sqrt((i + 0.5) / 30)], len: [0.25, 0.44 + 0.2 * R()], w: 0.1, a: 1.4, e: 0.9, mat: 7, nl: 1, nw: 1 }); return g; }
    for (let k = 0; k < (hi ? 7 : 5); k++) {
      const tl = 0.06 + 0.4 * R(), hs = 0.8 + 0.4 * R(), az = R() * TAU, H = [0.3 * hs, 0.64 * hs];
      const O = stem(g, (s, o) => { const h = L(H, o); return [Math.sin(tl) * h * s * (0.5 + 0.5 * s), Math.cos(tl) * h * s]; }, sr * 0.7, hi ? 3 : 2, az)(0.74);
      const P = { ph: az, o: O, th: tl * 1.25, len: [H[0] * 0.24, H[1] * 0.28], w: [0.018, 0.04], a: 0.7, e: 0.95, mat: 5, nl: 2, nw: 1 };
      if (!hi) { petal(g, P); petal(g, { ...P, x: 1 }); }
      else for (let i = 0; i < 18; i++) { const s = (i + 0.3) / 17.5, q = Math.sin(tl * 1.25), c = Math.cos(tl * 1.25); petal(g, { ph: i * 2.4, o: O.map((p, o) => [p[0] + Math.cos(az) * q * L(P.len, o) * s, p[1] + c * L(P.len, o) * s, p[2] + Math.sin(az) * q * L(P.len, o) * s]), th: [0.3, 0.75 + 0.3 * R()], len: [0.012, 0.03 * (1.15 - 0.5 * s)], w: 0.03, a: 0.9, e: 0.7, cup: 0.4, mat: 5, nl: 2, nw: 1 }); }
    }
    leaves(hi ? 6 : 3, 0.2, 0.02);
  } else if (sp === 2) {
    top = up([0.22, 0.5]); leaves(3, 0.22, 0.035);
    ring(top, 6, { th: [0.1, 1.3], len: [0.09, 0.17], w: [0.04, 0.078], k: [0.1, 0.35], cup: 0.25, a: 0.75, e: 1, mat: 4 });
    dome(g, top, [0.008, 0.022], 0.016, 5, 2);
  } else if (sp === 3 || sp === 6) {
    const pt = arch(sp === 3 ? [0.3, 0.62] : [0.28, 0.56]);
    for (const s of sp === 3 ? (far ? [0.7, 1] : [0.58, 0.74, 0.88, 1]) : (far ? [1] : [0.72, 1])) {
      const O = pt(s);
      if (sp === 3) ring(O, 5, { tilt: 0, th: [2.95, 2.7], len: [0.04, 0.09], w: [0.03, 0.066], k: [0, -1.0], a: 1.2, e: 0.8, cup: 0.5, mat: 1, nl: far ? 1 : lod ? 2 : 3 });
      else ring(O, 5, { tilt: 0, th: [2.4, 2.0], len: [0.05, 0.14], w: [0.03, 0.09], k: [1.3, 1.9], a: 0.9, e: 1, cup: 0.3, mat: 3, nl: far ? 2 : lod ? 3 : 4 });
    }
    leaves(3, 0.28, 0.055);
  } else if (sp === 4) {
    top = stem(g, (s, o) => [0, L([0.28, 0.58], o) * s], sr, hi ? 4 : 1)(1); leaves(3, 0.26, 0.05);
    const n = [15, 11, 6][lod];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      petal(g, { ph: i * 2.39996, o: top, th: [0.08 + 0.25 * f, 0.2 + 1.2 * f], len: [0.05 + 0.03 * f, 0.06 + 0.09 * f], w: [0.05, 0.07 + 0.06 * f], k: [0.3, -0.5 + 0.2 * f], cup: 0.4, a: 1.3, e: 0.85, mat: 6, r: 0.004 + 0.012 * f, nl, nw });
    }
  } else if (sp === 5) {
    top = up([0.32, 0.78]); leaves(3, 0.3, 0.045);
    const n = [36, 20, 9][lod], O = top.map((p) => [p[0], p[1] + 0.03, p[2]]);
    for (let i = 0; i < n; i++) petal(g, { ph: i * 2.39996, o: O, th: [Math.acos(1 - (i + 0.5) / n * 1.8) * 0.5, Math.acos(1 - (i + 0.5) / n * 1.8)], len: [0.03, 0.1], w: [0.012, far ? 0.055 : 0.036], a: 1.5, e: 0.8, mat: 4, nl: 1, nw: 1 });
  } else {
    top = up([0.25, 0.55]); leaves(3, 0.2, 0.03);
    ring(top, [12, 12, 7][lod], { th: [0.15, 1.42], len: [0.06, 0.125], w: [0.02, far ? 0.07 : 0.042], k: [0, 0.15], a: 1.2, e: 0.86, cup: 0.15, mat: 4, nl: hi ? 2 : 1, nw: 1 });
    dome(g, top, [0.012, 0.038], 0.02, 7, 2);
  }
  return g;
}
export function clump(sp, sd) {
  if (sp === 1) return flower(1, 2, sd);
  const g = mk(), R = makeRng(sd * 13 + sp);
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + R(), r = 0.14 + 0.26 * R(); add(g, flower(sp, 2, sd + k * 3), Math.cos(a) * r, Math.sin(a) * r, 0.9 + 0.35 * R(), R() * TAU); }
  for (let i = 0; i < 6; i++) petal(g, { ph: R() * TAU, r: 0.08 + 0.34 * R(), th: [0.1, 0.12 + 0.5 * R()], len: [0.15, 0.24 + 0.2 * R()], w: 0.075, k: [0.1, 0.7], mat: 0, nl: 2, nw: 1, a: 0.45, e: 1 });
  return g;
}
export function tuft(lod, sd) {
  const g = mk(), R = makeRng(sd + 99), n = lod ? 4 : 7;
  for (let i = 0; i < n; i++) petal(g, { ph: R() * TAU, r: 0.02 + 0.06 * R(), th: [0.1, 0.12 + 0.6 * R()], len: [0.14, 0.28 + 0.25 * R()], w: lod ? 0.045 : 0.03, k: [0.1, 0.4 + 0.9 * R()], mat: 0, nl: lod ? 2 : 3, nw: 1, a: 0.45, e: 1 });
  return g;
}
// interleave: open pos, closed pos, normal (open pose), uv -> 11 floats per vertex
export function pack(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.uv.length / 2; ni += g.idx.length; }
  const v = new Float32Array(nv * 11), idx = new Uint32Array(ni), info = []; let v0 = 0, i0 = 0;
  for (const g of list) {
    const n = g.uv.length / 2, nrm = new Float32Array(n * 3);
    computeNormals({ pos: g.b, nrm, idx: g.idx });
    for (let i = 0; i < n; i++) { const k = (v0 + i) * 11; for (let c = 0; c < 3; c++) { v[k + c] = g.b[i * 3 + c]; v[k + 3 + c] = g.a[i * 3 + c]; v[k + 6 + c] = nrm[i * 3 + c]; } v[k + 9] = g.uv[i * 2]; v[k + 10] = g.uv[i * 2 + 1]; }
    idx.set(g.idx, i0); info.push([g.idx.length, i0, v0]); v0 += n; i0 += g.idx.length;
  }
  return { v, idx, info };
}

// ---- standard-layout meshes (uv.x = material + shade, uv.y = free) ----
const mat = (g, m, f) => { for (let i = 0; i < g.uv.length / 2; i++) g.uv[i * 2] = m + 0.98 * Math.min(Math.max(f ? f(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], i) : 0.7, 0), 1); return g; };
// leaf mass: a dark lumpy core wrapped in a shell of real leaves (lod 0: many small, lod 1: few large, lod 2: core only).
// uv.x = material + shade, uv.y = per-leaf hue. ctr / sh give the crown centre and a shade function for soft crown lighting.
function leafMass(parts, R, sd, c, s, lod, m, ctr, sh) {
  const b = rock(sd, lod === 0 ? 2 : 1, 0.42), k = lod < 2 ? 0.72 : 0.85;
  const soft = (px, py, pz, n, i, w) => { const nx = px - ctr[0], ny = (py - ctr[1]) * 1.3, nz = pz - ctr[2], l = Math.hypot(nx, ny, nz) || 1; n[i] = n[i] * (1 - w) + nx / l * w; n[i + 1] = n[i + 1] * (1 - w) + ny / l * w; n[i + 2] = n[i + 2] * (1 - w) + nz / l * w; };
  for (let i = 0; i < b.pos.length; i += 3) {
    const px = b.pos[i] * s * k + c[0], py = b.pos[i + 1] * s * k * 0.8 + c[1], pz = b.pos[i + 2] * s * k + c[2];
    soft(px, py, pz, b.nrm, i, 0.55); b.pos[i] = px; b.pos[i + 1] = py; b.pos[i + 2] = pz;
    b.uv[i / 3 * 2] = m + 0.98 * Math.min(Math.max(sh(px, py, pz) * 0.3, 0), 1); b.uv[i / 3 * 2 + 1] = 0.4;
  }
  if (m !== 3) parts.push(b);
  const n = [170, 40, 14][lod], nv = lod ? 4 : 6, g = { pos: new Float32Array(n * nv * 3), nrm: new Float32Array(n * nv * 3), uv: new Float32Array(n * nv * 2), idx: new Uint32Array(n * (nv - 2) * 3) };
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 1.7, r = Math.sqrt(1 - y * y), ph = i * 2.39996 + R(), rr = s * (0.74 + 0.36 * R()), a = [0.23, 0.52, 0.95][lod] * (0.75 + 0.5 * R()) * Math.min(s, 1.2);
    const d = [r * Math.cos(ph), y, r * Math.sin(ph)], p = [c[0] + d[0] * rr, c[1] + d[1] * rr * 0.8, c[2] + d[2] * rr];
    let nx = d[0] + R() - 0.5, ny = d[1] + 0.3 + R() - 0.5, nz = d[2] + R() - 0.5, l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    let tx = R() - 0.5, ty = -0.4 - R() * 0.5, tz = R() - 0.5; const dt = tx * nx + ty * ny + tz * nz; tx -= nx * dt; ty -= ny * dt; tz -= nz * dt; l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx, hue = R(), shd = sh(p[0], p[1], p[2]);
    const V = lod ? [[-0.5, 0], [0, 0.34], [0.5, 0], [0, -0.34]] : [[-0.5, 0], [-0.15, 0.3], [0.2, 0.29], [0.5, 0], [0.2, -0.29], [-0.15, -0.3]];
    for (let j = 0; j < nv; j++) {
      const v = i * nv + j, f = V[j][1] ? -0.07 : 0.05;
      g.pos.set([p[0] + (tx * V[j][0] + bx * V[j][1] + nx * f) * a, p[1] + (ty * V[j][0] + by * V[j][1] + ny * f) * a, p[2] + (tz * V[j][0] + bz * V[j][1] + nz * f) * a], v * 3);
      g.nrm.set([nx, ny, nz], v * 3); soft(p[0], p[1], p[2], g.nrm, v * 3, 0.5);
      g.uv[v * 2] = m + 0.98 * Math.min(Math.max(shd, 0), 1); g.uv[v * 2 + 1] = hue;
      if (j > 1) g.idx.set([i * nv, v - 1, v], (i * (nv - 2) + j - 2) * 3);
    }
  }
  parts.push(g);
}
// golden tree: trunk (mat 0), a few limbs, crown of leaf masses (mat 1)
export function tree(sd, lod) {
  const R = makeRng(sd * 77 + 5), parts = [], nb = [16, 9, 4][lod], tp = [];
  let x = 0, z = 0;
  for (let i = 0; i <= 5; i++) { tp.push([x, i * 0.78 - 0.4, z]); x += (R() - 0.5) * 0.36; z += (R() - 0.5) * 0.36; }
  parts.push(mat(tube(tp, (t) => 0.25 * (1 - 0.62 * t) + 0.16 * Math.max(0, 1 - t * 5) ** 2, lod ? 5 : 8), 0, (px, py) => 0.35 + py * 0.2));
  for (let i = 0; i < nb; i++) {
    const a = i * 2.4 + R(), rr = Math.sqrt((i + 0.5) / nb) * 2.5, c = [x + Math.cos(a) * rr, 4.9 + (R() - 0.35) * 2.0 - rr * 0.5, z + Math.sin(a) * rr], s = (0.85 + 0.55 * R()) * [1, 1.35, 1.9][lod];
    leafMass(parts, R, sd * 13 + i, c, s, lod, 1, [x, 4.3, z], (px, py, pz) => 0.12 + 0.5 * (py - 2.6) / 4.2 + 0.38 * Math.hypot(px - x, pz - z) / 3.4);
    if (lod < 2 && i % 2 === 0) parts.push(mat(tube([[x, 3.3, z], [(x + c[0]) / 2, c[1] * 0.75 + 0.6, (z + c[2]) / 2], c], (t) => 0.09 - 0.05 * t, 4), 0, () => 0.3));
  }
  return merge(parts);
}
// hanging wisteria cluster, unit length downward from the origin (mat 2): many small rounded petals around a tapering
// spindle, big at the top, buds at the tip. uv.x = material + position down the cluster, uv.y = per-petal tone
export function raceme(lod, sd) {
  const R = makeRng(sd + 3), n = lod ? 18 : 66, g = { pos: new Float32Array(n * 18), nrm: new Float32Array(n * 18), uv: new Float32Array(n * 12), idx: new Uint32Array(n * 12) };
  for (let i = 0; i < n; i++) {
    const s = 0.03 + 0.97 * Math.pow(i / (n - 1), 0.8), ph = i * 2.39996 + R(), r = (0.02 + 0.13 * Math.sin(Math.PI * Math.pow(s, 0.55)) * (1 - 0.35 * s)) * (0.3 + 0.7 * Math.sqrt(R())), a = (lod ? 0.1 : 0.052) * (1 - 0.62 * s) * (0.8 + 0.4 * R());
    const ox = Math.cos(ph), oz = Math.sin(ph), tone = R();
    for (let k = 0; k < 6; k++) {
      const v = i * 6 + k, c = Math.cos(k * 1.0472) * a * 0.8, d = Math.sin(k * 1.0472) * a;
      g.pos.set([ox * (r + d * 0.55) - oz * c, -s - d * 0.8, oz * (r + d * 0.55) + ox * c], v * 3); g.nrm.set([ox * 0.9, 0.35, oz * 0.9], v * 3);
      g.uv[v * 2] = 2 + 0.98 * s; g.uv[v * 2 + 1] = tone;
      if (k > 1) g.idx.set([i * 6, v - 1, v], (i * 4 + k - 2) * 3);
    }
  }
  return g;
}
// leafy / blossom mass for the tunnel roof (mat 3)
export function leafBlob(sd, lod) { const parts = []; leafMass(parts, makeRng(sd), sd, [0, 0, 0], 1, lod, 3, [0, -0.6, 0], (x, y) => 0.5 + 0.45 * y); return merge(parts); }

// tunnel frame + bridges, in world space (mat 0 wood)
export function woodwork(TUN, BRIDGES, hAt, deckY) {
  const parts = [], rails = [[], [], [], [], []];
  const frame = (i) => { const p = TUN[i], q = TUN[Math.min(i + 1, TUN.length - 1)], o = TUN[Math.max(i - 1, 0)], l = Math.hypot(q[0] - o[0], q[1] - o[1]); return [p[0], p[1], -(q[1] - o[1]) / l, (q[0] - o[0]) / l]; };
  for (let i = 0; i < TUN.length; i += 2) {
    const [x, z, nx, nz] = frame(i), y = hAt(x, z);
    if (i % 8 === 0) { const P = []; for (let k = 0; k <= 14; k++) { const a = (k / 14 - 0.5) * Math.PI; P.push([x + nx * 1.75 * Math.sin(a), y + 3.35 * Math.cos(a) - (k % 14 ? 0 : 0.5), z + nz * 1.75 * Math.sin(a)]); } parts.push(tube(P, 0.05, 6)); }
    rails.forEach((r, k) => { const a = (k - 2) * 0.62 + 0.16 * Math.sin(i * 0.11 + k * 2); r.push([x + nx * 1.75 * Math.sin(a), y + 3.35 * Math.cos(a), z + nz * 1.75 * Math.sin(a)]); });
  }
  for (const r of rails) parts.push(tube(r, 0.03, 4));
  for (const b of BRIDGES) {
    const W = (s, l, y) => [b.x + b.nx * s + b.nz * l, y, b.z + b.nz * s - b.nx * l], yaw = Math.atan2(b.nx, b.nz);
    const put = (g, s, l, y, pitch = 0) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), c = W(s, l, y);
      for (const A of [g.pos, g.nrm]) for (let i = 0; i < A.length; i += 3) {
        const X = A[i], Y = A[i + 1] * cp - A[i + 2] * sp, Zz = A[i + 1] * sp + A[i + 2] * cp, t = A === g.pos ? 1 : 0;
        A[i] = cy * X + sy * Zz + c[0] * t; A[i + 1] = Y + c[1] * t; A[i + 2] = -sy * X + cy * Zz + c[2] * t;
      }
      parts.push(g);
    };
    for (let k = 0; k < 31; k++) { const s = (k / 30 - 0.5) * b.L; put(box(2.0, 0.06, 0.37), s, 0, deckY(b, s) - 0.03, 1.5 * 4 * s / (b.L * b.L)); }
    for (const sd of [-1, 1]) {
      const beam = [], rail = [];
      for (let k = 0; k <= 16; k++) { const s = (k / 16 - 0.5) * b.L; beam.push(W(s, sd * 0.9, deckY(b, s) - 0.14)); rail.push(W(s, sd * 0.97, deckY(b, s) + 0.95)); }
      parts.push(tube(beam, 0.09, 5), tube(rail, 0.06, 6));
      for (let k = 0; k <= 6; k++) { const s = (k / 6 - 0.5) * (b.L - 0.3); parts.push(tube([W(s, sd * 0.97, deckY(b, s) - (k % 6 ? 0.2 : 1.2)), W(s, sd * 0.97, deckY(b, s) + (k % 6 ? 0.95 : 1.08))], k % 6 ? 0.035 : 0.065, 5)); }
    }
  }
  return mat(merge(parts), 0, () => 0.6);
}

// small discoveries: rabbit (mat 4 fur), swing hung from the origin (mat 5, swings in the shader), straw beehive (mat 4)
const ball = (rx, ry, rz, x, y, z, sh) => mat(translate(scale(sphere(1, 1), rx, ry, rz), x, y, z), 4, () => sh);
export const rabbit = () => merge([ball(0.15, 0.13, 0.21, 0, 0.13, 0, 0.45), ball(0.085, 0.085, 0.095, 0, 0.27, 0.17, 0.55), ball(0.025, 0.09, 0.04, 0.045, 0.4, 0.13, 0.6), ball(0.025, 0.09, 0.04, -0.045, 0.4, 0.13, 0.6), ball(0.05, 0.05, 0.05, 0, 0.13, -0.21, 1)]);
export const swing = (L) => mat(merge([tube([[-0.28, 0, 0], [-0.28, -L, 0]], 0.028, 4), tube([[0.28, 0, 0], [0.28, -L, 0]], 0.028, 4), translate(box(0.7, 0.045, 0.24), 0, -L, 0)]), 5, () => 0.7);
export const hive = () => merge([mat(tube([[0, 0.9, 0], [0, 0.3, 0]], 0.012, 4), 0, () => 0.5), mat(scale(rock(3, 2, 0.1), 0.42, 0.55, 0.42), 4, (x, y) => 0.6 + 0.3 * Math.sin(y * 34))]);
