// Mesh builders for sky-mountains. A geo is the core { pos, nrm, uv, idx }; uv carries (ao, material + sway weight).
// Materials: 0 rock, 1 vine/root, 2 bark, 3 needles, 4 grass, 5 flower, 6 bird.
import { fbm2, snoise2, ridge2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';
import { sphere, tube, computeNormals, merge } from '../../core/src/mesh.js';

const TAU = Math.PI * 2;
export const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mk = (nv, ni) => ({ pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), idx: new Uint32Array(ni) });
const setUV = (g, ao, mat) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = typeof ao === 'function' ? ao(g.uv[i + 1]) : ao; g.uv[i + 1] = typeof mat === 'function' ? mat(g.uv[i + 1]) : mat; } return g; };

// grid wrapped in u (shared seam, smooth normals). f(u, v, o) fills o = [x, y, z, ao, mat]
export function grid(nu, nv, f, flip) {
  const g = mk(nu * (nv + 1), nu * nv * 6), o = [0, 0, 0, 1, 0];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
    const k = j * nu + i; f(i / nu, j / nv, o);
    g.pos[k * 3] = o[0]; g.pos[k * 3 + 1] = o[1]; g.pos[k * 3 + 2] = o[2]; g.uv[k * 2] = o[3]; g.uv[k * 2 + 1] = o[4];
  }
  let n = 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * nu + i, b = j * nu + (i + 1) % nu, c = a + nu, d = b + nu;
    if (flip) { g.idx[n++] = a; g.idx[n++] = b; g.idx[n++] = c; g.idx[n++] = b; g.idx[n++] = d; g.idx[n++] = c; }
    else { g.idx[n++] = a; g.idx[n++] = c; g.idx[n++] = b; g.idx[n++] = b; g.idx[n++] = c; g.idx[n++] = d; }
  }
  return computeNormals(g);
}

// ---- karst pillar: unit radius ~1, y in [-0.15, 1] (floating: [0, 1], tapered ragged bottom). Scaled per instance.
export function pillarFn(sd, fl, nv) {
  const R = makeRng(sd * 977 + 13), s1 = R() * 50, s2 = R() * 50, s3 = R() * 50, K = 5 + R() * 4, la = R() * TAU, lean = R() * 0.45,
    wob = R() * TAU, a1 = R() * TAU, a2 = R() * TAU, a3 = R() * TAU, y0 = fl ? 0 : -0.15, yc = 0.93 + R() * 0.055, d = 1 / nv, head = R() < 0.5 ? 0.25 * R() : 0, hy = 0.8 + R() * 0.1, wq = 0.15 + R() * 0.3;
  const tv = [0.3 + R() * 0.12, 0.52 + R() * 0.1, 0.7 + R() * 0.1].map((v) => Math.round(v * nv) / nv);
  return (u, v, o) => {
    const th = u * TAU, c = Math.cos(th), s = Math.sin(th);
    // terraces: one ring interval where y stays constant and the radius steps in -> a flat ledge
    let skip = 0, tr = 1;
    for (let k = 0; k < 3; k++) {
      const t = Math.min(Math.max((v - tv[k]) / d, 0), 1); skip += t * d;
      tr -= t * (0.1 + 0.2 * ss(-0.3, 0.6, Math.cos(th - [a1, a2, a3][k])));
    }
    const vb = (v - skip) / (0.9 - 3 * d);
    let y, cap = 1;
    if (vb < 1) y = y0 + (yc - y0) * vb; else { const t = Math.min((v - 0.9) / 0.1, 1) * 1.5708; y = yc + (1 - yc) * Math.sin(t); cap = Math.pow(Math.max(Math.cos(t), 0), 0.6); }
    const shape = 1 + 0.3 * fbm2(c * 0.9 + s1 + y * 1.3, s * 0.9 + s2 + y * 0.7, 2);
    const width = 1 + wq * fbm2(y * 2.6 + s3, s1, 2) + head * Math.exp(-(((y - hy) * 9) ** 2)) + (fl ? 0 : 0.4 * Math.exp(-Math.max(y, 0) * 7));
    const yy = y * K + 0.75 * fbm2(c * 0.7 + s3, s * 0.7 + y * 2, 2) + 0.5 * Math.cos(th - wob), fr = yy - Math.floor(yy), led = ss(0, 0.2, fr) * (1 - ss(0.8, 1, fr));
    const fl2 = snoise2(c * 2.3 + s2, s * 2.3 + y * 0.6);
    let r = shape * width * (0.55 + 0.45 * tr) * (1 + 0.09 * fl2 + 0.07 * (led - 0.6)) * cap, yo = y;
    if (fl) { const tb = Math.min(y / 0.34, 1), j = ridge2(c * 1.4 + s3, s * 1.4 + s1, 2); r *= Math.pow(tb, 0.6) * (1 - 0.3 * (1 - tb) * j); yo = y - 0.07 * (1 - tb) * (1 - tb) * (j - 0.5); }
    const off = lean * yo * yo + 0.07 * Math.sin(yo * 7 + wob);
    o[0] = r * c + Math.cos(la) * off; o[1] = yo; o[2] = r * s + Math.sin(la) * off;
    o[3] = Math.min(Math.max(0.6 + 0.4 * led + 0.25 * fl2, 0.35), 1) * (fl ? 0.6 + 0.4 * ss(0, 0.4, y) : 1); o[4] = 0;
  };
}
export const pillar = (sd, fl, nu, nv, nvRef) => grid(nu, nv, pillarFn(sd, fl, nvRef || nv));

// ---- floating island (world units, centre top = origin). I = { rx, rz, dep, sd, amp, mound, flat: [x, z, r, h] }
const outl = (I, th) => 1 + 0.13 * Math.sin(th * 2 + I.sd) + 0.09 * Math.sin(th * 3 + I.sd * 2.3) + 0.05 * Math.sin(th * 5 + I.sd * 4.1) + 0.03 * Math.sin(th * 9 + I.sd);
export function islandRR(I, x, z) { return Math.hypot(x / I.rx, z / I.rz) / outl(I, Math.atan2(z / I.rz, x / I.rx)); }
export function islandTop(I, x, z) {
  const rr = islandRR(I, x, z);
  let h = I.amp * fbm2(x * 0.045 + I.sd, z * 0.045, 3) + I.mound * (1 - rr * rr);
  if (I.flat) h += (I.flat[3] - h) * (1 - ss(I.flat[2], I.flat[2] * 2.6, Math.hypot(x - I.flat[0], z - I.flat[1])));
  return h - 2.6 * ss(0.8, 1, rr) ** 2;
}
function islandFn(I) {
  return (u, v, o) => {
    const th = u * TAU, c = Math.cos(th), s = Math.sin(th), ol = outl(I, th);
    const rr = v <= 0.5 ? Math.pow(v * 2, 0.75) : 1 - Math.pow((v - 0.5) * 2, 1.15);
    const x = rr * ol * I.rx * c, z = rr * ol * I.rz * s;
    let y = islandTop(I, x, z), ao = 1;
    if (v > 0.5) {
      const q = 1 - rr, n = fbm2(x * 0.06 + I.sd * 3, z * 0.06, 2), sp = ridge2(x * 0.09 + I.sd, z * 0.09, 2);
      y = islandTop(I, ol * I.rx * c * 0.999, ol * I.rz * s * 0.999) - 1.2 - I.dep * Math.pow(q, 0.62) * (0.75 + 0.45 * n) - I.dep * 0.5 * sp * sp * sp * Math.pow(q, 0.4);
      ao = 0.82 - 0.2 * sp;
    }
    o[0] = x; o[1] = y; o[2] = z; o[3] = ao; o[4] = 0;
  };
}
export function island(I, nu, nv, nVines) {
  const f = islandFn(I), R = makeRng(I.sd * 131 + 7), parts = [grid(nu, nv, f, true)], o = [0, 0, 0, 0, 0];
  for (let i = 0; i < nVines; i++) {
    const root = i % 4 === 0;                              // every 4th is a thick dangling root from deeper under the island
    f(R(), root ? 0.62 + R() * 0.2 : 0.515 + R() * 0.07, o);
    const L = (root ? 0.25 + R() * 0.3 : 0.12 + R() * 0.35) * I.dep + 2, r0 = (root ? 0.3 + R() * 0.3 : 0.12 + R() * 0.1) * Math.sqrt(I.rx / 20);
    const p1 = R() * TAU, p2 = R() * TAU, w = root ? 2.2 : 1.3, path = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; path.push([o[0] + w * t * Math.sin(t * 4 + p1), o[1] + 0.6 - L * t, o[2] + w * t * Math.sin(t * 3.3 + p2)]); }
    parts.push(setUV(tube(path, (t) => r0 * (1 - 0.8 * t) + 0.015, root ? 6 : 4), 0.8, (t) => 1 + 0.98 * t * t * (root ? 0.4 : 1)));
  }
  return merge(parts);
}

// ---- Huangshan pine: S-curved leaning trunk, long cantilevered limbs, tiers of clustered needle tufts (tilted, lobed, thick).
function pad(R, c, ang, sx, sy, sz, sub, nNeedle) {
  const g = sphere(1, sub), o1 = R() * 40, o2 = R() * 40, ca = Math.cos(ang), sa = Math.sin(ang), parts = [g], P = [0, 0, 0], tx = (R() - 0.5) * 0.6, tz = (R() - 0.5) * 0.6;
  const shp = (x, y, z) => {
    const h = Math.hypot(x, z) || 1, d = 1 + 0.42 * snoise2(x / h * 1.2 + o1, z / h * 1.2 + o2) + 0.13 * snoise2(x * 3.1 + o2, z * 3.1 + o1);
    const lx = x * d * sx, lz = z * d * sz;
    P[0] = c[0] + lx * ca - lz * sa; P[2] = c[2] + lx * sa + lz * ca;
    P[1] = c[1] + (y < 0 ? y * 0.35 : y * (0.75 + 0.55 * snoise2(x * 2.2 + o2, z * 2.2 - o1))) * sy + lx * tx + lz * tz;
  };
  for (let i = 0; i < g.pos.length; i += 3) {
    const y = g.pos[i + 1]; shp(g.pos[i], y, g.pos[i + 2]); g.pos.set(P, i);
    g.uv[i / 3 * 2] = 0.1 + 0.9 * ss(-0.45, 0.7, y); g.uv[i / 3 * 2 + 1] = 3.25;
  }
  computeNormals(g);
  if (nNeedle) {
    const NB = 6, n = mk(nNeedle * NB * 3, nNeedle * NB * 3); let k = 0;
    for (let i = 0; i < nNeedle; i++) {
      const a = R() * TAU, b = 1.8 - 1.6 * R() * R(), dx = Math.cos(a) * Math.sin(b), dy = Math.cos(b), dz = Math.sin(a) * Math.sin(b);
      shp(dx, dy, dz);
      const bx = P[0], by = P[1], bz = P[2];
      let nx = (dx * ca - dz * sa), ny = dy * 0.8 + 0.1, nz = (dx * sa + dz * ca); const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      for (let j = 0; j < NB; j++) {
        let ex = nx + (R() - 0.5) * 1.6, ey = ny + (R() - 0.5) * 1.2, ez = nz + (R() - 0.5) * 1.6; const l = (0.06 + R() * 0.09) / Math.hypot(ex, ey, ez);
        ex *= l; ey *= l; ez *= l;
        let px = ey * nz - ez * ny, py = ez * nx - ex * nz, pz = ex * ny - ey * nx; const pl = 0.012 / (Math.hypot(px, py, pz) || 1); px *= pl; py *= pl; pz *= pl;
        const Q = [[bx - px, by - py, bz - pz], [bx + px, by + py, bz + pz], [bx + ex, by + ey, bz + ez]];
        for (let q = 0; q < 3; q++) {
          n.pos.set(Q[q], k * 3); n.nrm[k * 3] = nx * 0.6; n.nrm[k * 3 + 1] = ny * 0.6 + 0.4; n.nrm[k * 3 + 2] = nz * 0.6;
          n.uv[k * 2] = (q === 2 ? 0.9 : 0.5) * (0.3 + 0.7 * ss(-0.3, 0.6, dy)); n.uv[k * 2 + 1] = q === 2 ? 3.6 : 3.3; n.idx[k] = k; k++;
        }
      }
    }
    parts.push(n);
  }
  return merge(parts);
}
function cluster(R, c, ang, r, lod, parts) {
  const nb = [4, 3, 2, 1][lod], k = [1, 1.05, 1.15, 1.45][lod];
  for (let i = 0; i < nb; i++) {
    const a = ang + i * 2.2 + R() * 1.2, d = i ? r * (0.45 + 0.3 * R()) : 0, rr = (i ? r * (0.42 + 0.25 * R()) : r * 0.72) * k;
    parts.push(pad(R, [c[0] + Math.cos(a) * d, c[1] + (i ? (R() - 0.4) * 0.3 : 0), c[2] + Math.sin(a) * d], a, rr, rr * (0.36 + 0.2 * R()), rr * (0.62 + 0.25 * R()), lod || i > 1 ? 1 : 2, lod ? 0 : 34));
  }
}
export function pine(sd, lod) {
  const R = makeRng(sd * 31 + 3), H = 5.4 + R() * 2.2, la = R() * TAU, lean = 0.22 + R() * 0.3, p1 = R() * TAU, p2 = R() * TAU;
  const at = (t) => {                                        // S-curve: leans out, then recovers toward the light
    const o = lean * H * (Math.pow(t, 1.4) - 0.55 * t * t * t) * 1.6, w = 0.7 * Math.sin(t * 4.4 + p1) * t * (1 - 0.4 * t);
    return [Math.cos(la) * o - Math.sin(la) * w, -0.5 + (H + 0.5) * t - 0.25 * lean * H * t * t, Math.sin(la) * o + Math.cos(la) * w + 0.2 * Math.sin(t * 6 + p2) * t];
  };
  const path = []; for (let j = 0; j <= 10; j++) path.push(at(j / 10));
  const parts = [setUV(tube(path, (t) => 0.25 * Math.pow(1 - t, 0.8) + 0.035 + (t < 0.1 ? 0.16 * (1 - t / 0.1) ** 2 : 0), [9, 6, 5, 3][lod]), (t) => 0.55 + 0.45 * ss(0.5, 0.2, t), 2)];
  const n = lod === 3 ? 4 : 6 + (R() * 2 | 0);
  for (let k = 0; k < n; k++) {
    const tk = 0.4 + 0.6 * k / (n - 1), p = at(tk), top = k === n - 1, limb = !top && (k === 1 || k === 4);
    const ang = la + (limb ? 0 : Math.PI * 0.7) + k * 2.4 + R() * 0.9, L = top ? 0.3 : (1.3 + R() * 1.0) * (1 - 0.4 * tk) * (limb ? 1.9 : 1);
    const c = [p[0] + Math.cos(ang) * L, p[1] + (top ? 0.2 : 0.16 * L - 0.1 - (limb ? 0.12 * L : 0)), p[2] + Math.sin(ang) * L], r = top ? 1.3 + R() * 0.3 : limb ? 1.05 + R() * 0.3 : L * 0.7;
    if (lod < 3 && !top) {
      const m = [(p[0] + c[0]) / 2 + (R() - 0.5) * 0.3, p[1] + (limb ? 0.22 * L : 0.02 * L), (p[2] + c[2]) / 2 + (R() - 0.5) * 0.3];
      parts.push(setUV(tube([p, [(p[0] + m[0]) / 2, (p[1] + m[1]) / 2 + 0.05 * L, (p[2] + m[2]) / 2], m, [(m[0] + c[0]) / 2, (m[1] + c[1]) / 2 + 0.04 * L, (m[2] + c[2]) / 2], c],
        (t) => (limb ? 0.13 : 0.075) * (1 - 0.7 * t), lod ? 4 : 6), 0.6, 2));
      if (limb && lod < 2) cluster(R, [m[0], m[1] + 0.15, m[2]], ang + 1, 0.7, Math.max(lod, 1), parts);
    }
    cluster(R, c, ang, r, lod, parts);
  }
  return merge(parts);
}

// ---- crane: slim body, long neck forward (-z), trailing legs, thick tapered wings (flapped in the vertex shader)
export function crane() {
  const ell = (sx, sy, sz, x, y, z, sub) => { const g = sphere(1, sub); for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] = g.pos[i] * sx + x; g.pos[i + 1] = g.pos[i + 1] * sy + y; g.pos[i + 2] = g.pos[i + 2] * sz + z; } return setUV(computeNormals(g), 1, 6); };
  const parts = [ell(0.15, 0.13, 0.46, 0, 0, 0, 1), ell(0.05, 0.05, 0.07, 0, 0.1, -1.06, 0),
    setUV(tube([[0, 0.02, -0.38], [0, 0.07, -0.7], [0, 0.1, -1.03]], (t) => 0.05 - 0.02 * t, 5), 1, 6),
    setUV(tube([[0, 0.1, -1.1], [0, 0.09, -1.3]], (t) => 0.025 - 0.02 * t, 4), 0.3, 6),
    setUV(tube([[0.03, -0.05, 0.35], [0.03, -0.04, 1.2]], 0.014, 4), 0.3, 6), setUV(tube([[-0.03, -0.05, 0.35], [-0.03, -0.04, 1.2]], 0.014, 4), 0.3, 6)];
  for (const sg of [-1, 1]) parts.push(grid(6, 9, (u, v, o) => {
    const a = u * TAU, ch = 0.24 * (1 - 0.8 * v * v) + 0.03, sp = 0.1 + v * 1.3;
    o[0] = sg * sp; o[1] = 0.03 + Math.sin(a) * 0.028 * (1 - 0.7 * v); o[2] = Math.cos(a) * ch - 0.02 + 0.22 * v * v;
    o[3] = v > 0.7 || Math.cos(a) < -0.55 && v > 0.25 ? 0.12 : 1; o[4] = 6.01 + 0.98 * v;
  }, sg < 0));
  return merge(parts);
}

// ---- grass tuft (curved tapered blades) and a small alpine flower
export function tuft(sd, nb) {
  const R = makeRng(sd), g = mk(nb * 7, nb * 15); let k = 0, n = 0;
  for (let b = 0; b < nb; b++) {
    const a = R() * TAU, r0 = R() * 0.22, h = 0.12 + R() * 0.2, ln = 0.06 + R() * 0.2, fa = a + (R() - 0.5) * 2, w = 0.012 + R() * 0.01;
    const dx = Math.cos(fa), dz = Math.sin(fa), bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    for (let j = 0; j < 4; j++) {
      const t = j / 3, ox = bx + dx * ln * t * t, oz = bz + dz * ln * t * t, ww = w * (1 - t * 0.85);
      for (const sg of j === 3 ? [0] : [-1, 1]) {
        g.pos[k * 3] = ox - dz * ww * sg; g.pos[k * 3 + 1] = h * t - 0.03; g.pos[k * 3 + 2] = oz + dx * ww * sg;
        g.nrm[k * 3] = dx * 0.5 - dz * 0.3 * sg; g.nrm[k * 3 + 1] = 0.8; g.nrm[k * 3 + 2] = dz * 0.5 + dx * 0.3 * sg;
        g.uv[k * 2] = 0.35 + 0.65 * t; g.uv[k * 2 + 1] = 4 + 0.98 * t * t; k++;
      }
    }
    const v = b * 7;
    for (const q of [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]) g.idx[n++] = v + q;
  }
  return g;
}
export function flower(sd) {
  const R = makeRng(sd), parts = [];
  for (let i = 0; i < 3; i++) {
    const x = (R() - 0.5) * 0.3, z = (R() - 0.5) * 0.3, h = 0.25 + R() * 0.2, bx = x + (R() - 0.5) * 0.12, bz = z + (R() - 0.5) * 0.12;
    parts.push(setUV(tube([[x, -0.03, z], [(x + bx) / 2, h * 0.6, (z + bz) / 2], [bx, h, bz]], 0.008, 3), (t) => 0.5 + 0.5 * t, (t) => 4 + 0.9 * t));
    const g = sphere(1, 1);
    for (let k = 0; k < g.pos.length; k += 3) {
      const px = g.pos[k], py = g.pos[k + 1], pz = g.pos[k + 2], pet = 0.75 + 0.25 * Math.cos(Math.atan2(pz, px) * 5);
      g.pos[k] = bx + px * 0.06 * pet; g.pos[k + 1] = h + py * 0.022 + 0.03 * (px * px + pz * pz); g.pos[k + 2] = bz + pz * 0.06 * pet;
      g.uv[k / 3 * 2] = 0.55 + 0.45 * Math.hypot(px, pz); g.uv[k / 3 * 2 + 1] = 5.9;
    }
    parts.push(computeNormals(g));
  }
  return merge(parts);
}
export function stone(sd, sub) {
  const g = sphere(1, sub), o = sd * 9.7;
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    const d = 1 + 0.3 * snoise2(x * 1.1 + o, z * 1.1 + y * 0.8 - o) + 0.06 * snoise2(y * 2.3 + o, x * 2.3 - z * 2.1);
    g.pos[i] = x * d; g.pos[i + 1] = y * d * 0.72; g.pos[i + 2] = z * d; g.uv[i / 3 * 2] = 0.6 + 0.4 * ss(-0.8, 0.2, y); g.uv[i / 3 * 2 + 1] = 0;
  }
  return computeNormals(g);
}
