// Spirit forest geometry. Vertex = pos3 nrm3 uv2 attr4 (48 bytes). attr.x = material id:
// 0 bark, 1 leaf spray, 2 moss beard, 3 willow strand, 4 fern, 5 mushroom, 6 shelf fungus, 7 rock, 8 tuft,
// 10 being body, 11 being leg, 12 antler, 13 lantern body, 14 lantern tail.
import { makeRng } from '../../core/src/math.js';

export const VLAYOUT = {
  arrayStride: 48, stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32x4' },
  ],
};
export const ILAYOUT = {
  arrayStride: 32, stepMode: 'instance',
  attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }, { shaderLocation: 5, offset: 16, format: 'float32x4' }],
};
const TAU = Math.PI * 2;

export class Geo {
  constructor() { this.p = []; this.u = []; this.a = []; this.i = []; this.wraps = []; }
  get nv() { return this.p.length / 3; }
  // parametric grid: f(u, v) -> [x, y, z, uvx, uvy, a0, a1, a2, a3]
  surf(nu, nv, f, wrap = false) {
    const b = this.nv;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const r = f(i / (nu - 1), j / (nv - 1));
      this.p.push(r[0], r[1], r[2]); this.u.push(r[3], r[4]); this.a.push(r[5], r[6], r[7], r[8]);
    }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = b + j * nu + i, c = a + nu;
      this.i.push(a, c, a + 1, a + 1, c, c + 1);
    }
    if (wrap) this.wraps.push([b, nu, nv]);
    return this;
  }
  // tube along path(t) with radius(t, ang); attr(t, u, centre) -> [a0..a3]
  tube(nu, nv, path, rad, attr, uvScale = [1, 1]) {
    const e = 1e-3;
    return this.surf(nu, nv, (u, v) => {
      const c = path(v), p0 = path(Math.max(0, v - e)), p1 = path(Math.min(1, v + e));
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = 0, ry = 1, rz = 0; if (Math.abs(ty) > 0.9) { rx = 1; ry = 0; }
      let nx = ry * tz - rz * ty, ny = rz * tx - rx * tz, nz = rx * ty - ry * tx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const th = u * TAU, r = rad(v, th), cs = Math.cos(th) * r, sn = Math.sin(th) * r;
      return [c[0] + nx * cs + bx * sn, c[1] + ny * cs + by * sn, c[2] + nz * cs + bz * sn, u * uvScale[0], v * uvScale[1], ...attr(v, u, c)];
    }, true);
  }
  build() {
    const n = this.nv, P = this.p, N = new Float32Array(n * 3), I = this.i;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (const [b, nu, nv] of this.wraps) for (let j = 0; j < nv; j++) {
      const a = (b + j * nu) * 3, c = (b + j * nu + nu - 1) * 3;
      for (let k = 0; k < 3; k++) { const s = N[a + k] + N[c + k]; N[a + k] = N[c + k] = s; }
    }
    const out = new Float32Array(n * 12);
    for (let v = 0; v < n; v++) {
      const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1, o = v * 12;
      out[o] = P[v * 3]; out[o + 1] = P[v * 3 + 1]; out[o + 2] = P[v * 3 + 2];
      out[o + 3] = N[v * 3] / l; out[o + 4] = N[v * 3 + 1] / l; out[o + 5] = N[v * 3 + 2] / l;
      out[o + 6] = this.u[v * 2]; out[o + 7] = this.u[v * 2 + 1];
      out[o + 8] = this.a[v * 4]; out[o + 9] = this.a[v * 4 + 1]; out[o + 10] = this.a[v * 4 + 2]; out[o + 11] = this.a[v * 4 + 3];
    }
    return { v: out, i: new Uint32Array(I) };
  }
}
export function fromCore(g, attr) {
  const n = g.pos.length / 3, v = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) { v.set(g.pos.subarray(i * 3, i * 3 + 3), i * 12); v.set(g.nrm.subarray(i * 3, i * 3 + 3), i * 12 + 3); v.set(g.uv.subarray(i * 2, i * 2 + 2), i * 12 + 6); v.set(attr, i * 12 + 8); }
  return { v, i: g.idx };
}

// leaf spray card: base b, direction d, side s, length, half-width
function spray(g, R, b, d, len, wid, droop) {
  let sx = -d[2], sz = d[0]; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  const tilt = (R() - 0.5) * 1.3, sy = Math.sin(tilt), sc = Math.cos(tilt), lr = R();
  g.surf(3, 3, (u, v) => {
    const x = u * 2 - 1, w = wid * x;
    return [b[0] + d[0] * len * v + sx * sc * w, b[1] + d[1] * len * v - droop * len * v * v + sy * w + Math.abs(x) * wid * 0.25, b[2] + d[2] * len * v + sz * sc * w, x, v, 1, v, x, lr];
  });
}

// Gnarled laurel (kind 0) or weeping willow (kind 1). Local y = 0 at the ground.
export function laurel(seed, lod, kind = 0) {
  const R = makeRng(seed * 7919 + 13 + kind * 101), g = new Geo(), L0 = lod === 0, wil = kind === 1;
  const H = wil ? 9 + R() * 2 : 7.5 + R() * 2.5, R0 = wil ? 0.75 + R() * 0.2 : 0.8 + R() * 0.45, p1 = R() * TAU, p2 = R() * TAU;
  const lx = (R() - 0.5) * (wil ? 2 : 6), lz = (R() - 0.5) * (wil ? 2 : 6), gn = wil ? 0.25 : 0.5 + R() * 0.4;
  const C = (t) => [lx * t * t + gn * Math.sin(t * 6 + p1) * t, H * (wil ? t : t - 0.28 * t * t) - 0.4, lz * t * t + gn * Math.cos(t * 5 + p2) * t];
  const rad = (t) => R0 * Math.pow(1 - t, 0.75) * (0.82 + 0.1 * Math.sin(t * 17 + p1)) + R0 * 0.75 * Math.exp(-t * 9) + 0.04;
  const knob = (t, th, k) => 1 + k * (Math.sin(3 * th + 8 * t + p1) + 0.5 * Math.sin(7 * th - 11 * t + p2) + 0.6 * Math.sin(2 * th + 23 * t));
  const bark = (moss) => (t, u, c) => [0, c[1], moss, R()];
  g.tube(L0 ? 18 : 8, L0 ? 26 : 9, C, (t, th) => rad(t) * knob(t, th, 0.11), bark(0), [TAU * R0, H]);
  // roots snaking over the ground
  const K = L0 ? 6 + (R() * 3 | 0) : 4;
  for (let k = 0; k < K; k++) {
    const phi = (k / K) * TAU + R() * 0.6, D = 2.6 + R() * 3, ph = R() * TAU, rr = 0.2 + R() * 0.14, wv = 0.5 + R() * 0.6;
    const dx = Math.cos(phi), dz = Math.sin(phi);
    g.tube(L0 ? 7 : 5, L0 ? 12 : 5, (s) => {
      const d = R0 * 0.45 + s * D, lat = wv * Math.sin(s * 4 + ph) * s;
      return [dx * d - dz * lat, 0.75 * Math.pow(1 - s, 2.2) + 0.16 * Math.sin(s * 9 + ph) * (1 - s) - 0.1 - 0.25 * s, dz * d + dx * lat];
    }, (s) => rr * (1 - 0.8 * s) * (1 + 0.6 * Math.exp(-s * 8)), bark(0.15), [1, D]);
  }
  // limbs and sub-branches
  const NB = wil ? 6 : 4 + (R() * 2 | 0), tips = [], hang = [];
  const limb = (c0, psi, L, rise, r0, sub) => {
    const dx = Math.cos(psi), dz = Math.sin(psi), cv = (R() - 0.5) * 0.9, bp = R() * TAU, b2 = R() * TAU;
    const path = (s) => {
      const w = L * (cv * s * s + 0.1 * Math.sin(s * 6 + bp) * s + 0.035 * Math.sin(s * 14 + b2));
      const y = wil ? L * (rise * s - 0.62 * rise * s * s) : L * (0.12 * s + rise * s * s + 0.06 * Math.sin(s * 7.5 + b2) * s);
      return [c0[0] + dx * L * s - dz * w, c0[1] + y, c0[2] + dz * L * s + dx * w];
    };
    g.tube(L0 ? (sub ? 6 : 9) : 4, L0 ? (sub ? 8 : 16) : 5, path, (s, th) => (r0 * (1 - 0.93 * Math.pow(s, 0.8)) + 0.025) * knob(s, th, sub ? 0.05 : 0.09), bark(sub ? 0.1 : 0.25), [TAU * r0, L]);
    const n = sub ? 3 : 6;
    for (let i = 0; i < n; i++) { const s = 0.4 + 0.6 * (i + R()) / n; tips.push([path(s), psi + (R() - 0.5) * 2.5, sub ? 0.8 : 1]); }
    tips.push([path(1), psi, 1.2]);
    for (let i = 0; i < (wil ? (sub ? 18 : 30) : (sub ? 2 : 5)); i++) { const h = path(0.3 + 0.7 * R()); if (wil) { h[0] += (R() - 0.5) * 0.8; h[2] += (R() - 0.5) * 0.8; } hang.push(h); }
    return path;
  };
  for (let b = 0; b < NB; b++) {
    const t0 = (wil ? 0.5 : 0.22) + 0.4 * (b / NB) + R() * 0.08, c0 = C(t0), psi = (b / NB) * TAU * 1.31 + R() * 0.7 + p1, L = wil ? 5 + R() * 3 : 5.5 + R() * 4.5;
    const rise = wil ? 0.75 + R() * 0.3 : 0.28 + R() * 0.5, r0 = rad(t0) * 0.62;
    const path = limb(c0, psi, L, rise, r0, false);
    for (let k = 0; k < (L0 ? 3 : 2); k++) {
      const s0 = 0.3 + R() * 0.45, q = path(s0);
      limb(q, psi + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.8), L * (0.35 + R() * 0.25), wil ? rise : 0.3 + R() * 0.6, r0 * (1 - 0.9 * Math.pow(s0, 0.8)) * 0.8 + 0.02, true);
    }
  }
  const top = C(1); tips.push([top, p1, 1.3], [C(0.8), p2, 1]);
  // leaf sprays around every tip
  const per = (L0 ? 4 : 2) * (wil ? 0.5 : 1);
  for (const [c, psi, sc] of tips) for (let l = 0; l < per; l++) {
    if (!wil && c[1] < 3.6) c[1] = 3.6 + R() * 2.5;
    const a = psi + (R() - 0.5) * 3.6, el = (R() - 0.35) * 0.9, ce = Math.cos(el);
    const d = [Math.cos(a) * ce, Math.sin(el), Math.sin(a) * ce], o = R() * 0.5;
    const len = (1.5 + R() * 1.5) * sc * (L0 ? 1 : 1.5);
    spray(g, R, [c[0] + d[0] * o, c[1] + 0.3 + R() * 1.6 * sc, c[2] + d[2] * o], d, len, len * (0.42 + R() * 0.16), 0.25 + R() * 0.3);
  }
  hang.forEach(([x, y, z], k) => {
    if (!L0 && k % 2) return;
    if (wil) {
      // glowing strands: ribbons collapsed on their centre line, widened toward the camera in the vertex shader
      const len = Math.min(y - 0.6 - R() * 1.3, 3.5 + R() * 6); if (len < 1.5) return;
      const ox = (R() - 0.5) * 0.3, oz = (R() - 0.5) * 0.3, lr = R();
      g.surf(2, L0 ? 9 : 5, (u, s) => [x + ox * s * s, y - len * s, z + oz * s * s, u * 2 - 1, s * len, 3, s, len, lr]);
    } else {
      // hanging moss beards
      const len = 0.5 + R() * R() * 1.6, w = 0.22 + R() * 0.3, a = R() * TAU, cx = Math.cos(a) * w, cz = Math.sin(a) * w, lr = R();
      g.surf(2, 3, (u, s) => [x + cx * (u * 2 - 1), y - 0.08 - len * s, z + cz * (u * 2 - 1), u * 2 - 1, s, 2, s, len, lr]);
    }
  });
  return g.build();
}

export function fern(seed) {
  const R = makeRng(seed * 31 + 5), g = new Geo(), n = 8;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * TAU + R() * 0.5, len = 0.75 + R() * 0.55, up = 0.75 + R() * 0.5, dx = Math.cos(a), dz = Math.sin(a), lr = R(), tw = (R() - 0.5) * 0.5;
    g.surf(3, 7, (u, v) => {
      const x = u * 2 - 1, w = 0.17 * len * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55) * 0.97), 0.7) * x;
      const d = len * v * (1 - 0.25 * v), y = len * (up * v - (0.55 + 0.4 * up) * v * v) + 0.03 - Math.abs(x) * 0.03 + tw * w;
      return [dx * d - dz * w, y, dz * d + dx * w, x, v, 4, v, x, lr];
    });
  }
  return g.build();
}

export function mushrooms(seed) {
  const R = makeRng(seed * 53 + 7), g = new Geo(), n = 6 + (R() * 4 | 0);
  for (let k = 0; k < n; k++) {
    const a = R() * TAU, r = Math.sqrt(R()) * 0.22, bx = Math.cos(a) * r, bz = Math.sin(a) * r, big = R(), h = 0.06 + big * 0.2, cr = 0.022 + big * 0.04, lr = R();
    const lx = (R() - 0.5) * 0.12, lz = (R() - 0.5) * 0.12;
    const P = (s) => [bx + lx * s * s, h * s - 0.02, bz + lz * s * s];
    g.tube(5, 4, P, () => 0.009 + cr * 0.12, (s) => [5, 0, s, lr]);
    const t = P(1), ch = cr * (0.7 + R() * 0.5);
    g.surf(13, 6, (u, w) => {
      const th = u * TAU, rr = cr * Math.pow(Math.sin(w * Math.PI * 0.5), 0.75);
      return [t[0] + Math.cos(th) * rr, t[1] + ch * (0.55 - Math.pow(w, 2.6)), t[2] + Math.sin(th) * rr, u, w, 5, 1, w, lr];
    }, true);
  }
  return g.build();
}

export function shelf(seed) {
  const R = makeRng(seed * 17 + 3), g = new Geo();
  for (let k = 0; k < 4; k++) {
    const y = k * 0.2 + R() * 0.08, rad = 0.22 + R() * 0.16, off = (R() - 0.5) * 0.35, lr = R();
    for (const top of [1, 0]) g.surf(9, 4, (u, w) => {
      const th = (u - 0.5) * Math.PI * (top ? 1 : -1), rr = rad * w * (1 + 0.07 * Math.cos(th * 7));
      return [off + Math.sin(th) * rr * 1.25, y + (top ? 0.045 * (1 - w * w) : -0.02 * (1 - w)), Math.cos(th) * rr - 0.03, u, w, 6, top, w, lr];
    });
  }
  return g.build();
}

export function log(seed) {
  const R = makeRng(seed * 91 + 1), g = new Geo(), L = 4.2 + R() * 1.6, r = 0.3 + R() * 0.08, p = R() * TAU;
  g.tube(14, 16, (s) => [(s - 0.5) * L, r * 0.72 + 0.05 * Math.sin(s * 5 + p), 0.15 * Math.sin(s * 3 + p)],
    (s, th) => r * Math.min(1, Math.min(s, 1 - s) * 40 + 0.05) * (1 - 0.2 * s) * (1 + 0.07 * Math.sin(3 * th + 9 * s + p) + 0.04 * Math.sin(5 * th - 14 * s)), (s, u, c) => [0, 1.4, 0.02, R()], [TAU * r, L]);
  // a broken branch stub
  g.tube(6, 5, (s) => [L * 0.18 + 0.25 * s, r * 0.9 + 0.75 * s, 0.1 + 0.3 * s * s], (s) => 0.09 * (1 - 0.6 * s), () => [0, 1.6, 0.3, R()], [0.5, 0.8]);
  return g.build();
}

export function tuft(seed) {
  const R = makeRng(seed * 13 + 9), g = new Geo();
  for (let k = 0; k < 9; k++) {
    const a = R() * TAU, len = 0.14 + R() * 0.22, lean = 0.3 + R() * 0.9, w = 0.012 + R() * 0.012, dx = Math.cos(a), dz = Math.sin(a), bx = (R() - 0.5) * 0.25, bz = (R() - 0.5) * 0.25, lr = R();
    g.surf(2, 4, (u, v) => { const x = (u * 2 - 1) * w * (1 - v * 0.9); return [bx + dx * lean * len * v * v - dz * x, len * v, bz + dz * lean * len * v * v + dx * x, u * 2 - 1, v, 8, v, 0, lr]; });
  }
  return g.build();
}

// Deer spirit: tall and slender, long neck, lyre antlers with glowing tines, a tail of trailing ribbons. Faces -Z.
// attr = [part, v, head-turn weight, extra]
export function deer() {
  const g = new Geo(), gs = (s, c, w) => Math.exp(-(((s - c) / w) ** 2));
  g.tube(16, 18, (s) => [0, 2.0 + 0.12 * s + 0.05 * Math.sin(Math.PI * s), 0.95 - 1.8 * s],
    (s, th) => (0.08 + 0.22 * gs(s, 0.2, 0.28) + 0.27 * gs(s, 0.8, 0.25)) * Math.pow(Math.sin(Math.PI * (0.02 + 0.96 * s)), 0.45) * (1 - 0.2 * Math.cos(2 * th)), (s) => [10, s, 0, 0]);
  g.tube(12, 12, (s) => [0, 2.2 + 1.24 * s, -0.7 - 0.38 * Math.sin(s * 2.2) + 0.1 * s], (s, th) => (0.15 * Math.pow(1 - s, 1.5) + 0.1) * (1 - 0.12 * Math.cos(2 * th)), (s) => [10, 2, s, 0]);
  g.tube(12, 10, (s) => [0, 3.46 - 0.27 * s - 0.05 * s * s, -0.9 - 0.74 * s], (s, th) => (0.045 + 0.095 * Math.pow(1 - s, 0.8)) * Math.min(1, 0.35 + s * 6) * (s > 0.96 ? 0.6 : 1) * (1 - 0.14 * Math.cos(2 * th)), (s) => [10, 2, 1, 0]);
  for (let k = 0; k < 3; k++) g.surf(2, 9, (u, s) => [(k - 1) * 0.07 * (1 + 2 * s) + (u - 0.5) * 0.07 * (1 - 0.8 * s), 2.12 - 0.25 * s - 0.75 * s * s + 0.06 * Math.sin(s * 5 + k), 0.92 + 0.75 * s + 0.1 * Math.sin(s * 4 + k * 2), u, s, 11, 0.25 + 0.75 * s, 0, 0.3 + 0.1 * k]);
  for (const sd of [-1, 1]) {
    g.surf(3, 5, (u, v) => { const x = (u * 2 - 1) * 0.065 * Math.sin(Math.PI * Math.pow(v, 0.6)); return [sd * (0.09 + 0.27 * v), 3.47 + 0.16 * v + Math.abs(x) * 0.5, -0.88 + 0.16 * v + x, u, v, 10, 2, 1, 0]; });
    const beam = (s) => [sd * (0.06 + 0.25 * s + 0.75 * s * s), 3.52 + 1.6 * s - 0.4 * s * s, -0.93 + 0.6 * s - 0.55 * s * s];
    g.tube(5, 14, beam, (s) => 0.038 * (1 - 0.8 * s) + 0.007, (s) => [12, s, 1, s * s]);
    [0.16, 0.34, 0.52, 0.7, 0.86].forEach((s0, i) => {
      const b = beam(s0), L = 0.62 - 0.07 * i;
      const tine = (s) => [b[0] + sd * (0.22 * s - 0.3 * s * s) * L, b[1] + L * (0.85 * s + 0.2 * s * s), b[2] - L * (0.55 * s + 0.1 * s * s)];
      g.tube(4, 7, tine, (s) => 0.024 * (1 - 0.8 * s) + 0.005, (s) => [12, s0, 1, 0.25 + 0.75 * s]);
      if (i < 3) { const f = tine(0.5); g.tube(4, 4, (s) => [f[0] - sd * 0.16 * s * L, f[1] + 0.3 * s * L, f[2] + 0.12 * s * L], (s) => 0.014 * (1 - 0.7 * s) + 0.004, (s) => [12, s0, 1, 0.5 + 0.5 * s]); }
    });
    [[-0.58, 0], [0.7, 0.5]].forEach(([hz, ph], i) => {
      g.tube(8, 14, (s) => [sd * (0.12 + 0.015 * s), 2.02 - 2.02 * s, hz + (i ? -0.13 * Math.sin(5.3 * s) * (1 - 0.3 * s) : -0.05 * Math.sin(Math.PI * s))],
        (s) => 0.085 * Math.exp(-s * 5) + 0.04 * (1 - s) + 0.02 + 0.014 * gs(s, i ? 0.55 : 0.5, 0.06), (s) => [11, s, 0, sd > 0 ? ph : ph + 0.5]);
    });
  }
  return g.build();
}

// Lantern creature: ribbed paper-lantern body, leaf cap with a curled stalk, three trailing ribbons. Centre at origin.
export function lantern() {
  const g = new Geo();
  g.tube(14, 10, (s) => [0, -0.2 + 0.4 * s, 0], (s, th) => (0.16 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * s)), 0.7)) * (1 + 0.05 * Math.cos(7 * th)), (s) => [13, s, 0, 0]);
  g.surf(10, 4, (u, w) => { const th = u * TAU, r = 0.13 * w * (1 + 0.12 * Math.cos(th * 5)); return [Math.cos(th) * r, 0.27 - 0.09 * w * w, Math.sin(th) * r, u, w, 13, 1, 1, 1]; }, true);
  g.tube(5, 7, (s) => [0.07 * Math.sin(s * 3.5), 0.26 + 0.16 * s - 0.05 * s * s, 0.06 * (1 - Math.cos(s * 3.5))], (s) => 0.012 * (1 - 0.6 * s), () => [13, 1, 1, 1]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5, dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05;
    g.surf(2, 7, (u, s) => [dx + (u - 0.5) * 0.035 * (1 - s), -0.19 - 0.5 * s, dz, u * 2 - 1, s, 14, s, k / 3, 0]);
  }
  return g.build();
}
