// Jungle geometry builders. Vertex = pos3 nrm3 uv2 attr4 (48 bytes). attr.x = material / part id.
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

export class Geo {
  constructor() { this.p = []; this.u = []; this.a = []; this.i = []; this.wraps = []; }
  get nv() { return this.p.length / 3; }
  // parametric grid surface: f(u, v) -> [x, y, z, uvx, uvy, a0, a1, a2, a3]
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
  // tube along path(t) with radius(t, ang); attr(t) -> [a0..a3]
  tube(nu, nv, path, rad, attr, uvScale = [1, 1]) {
    const e = 1e-3;
    return this.surf(nu, nv, (u, v) => {
      const c = path(v), p0 = path(Math.max(0, v - e)), p1 = path(Math.min(1, v + e));
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = 0, ry = 1, rz = 0; if (Math.abs(ty) > 0.9) { rx = 1; ry = 0; }
      // N = normalize(cross(ref, T)), B = cross(T, N)
      let nx = ry * tz - rz * ty, ny = rz * tx - rx * tz, nz = rx * ty - ry * tx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const th = u * Math.PI * 2, r = rad(v, th), cs = Math.cos(th) * r, sn = Math.sin(th) * r;
      return [c[0] + nx * cs + bx * sn, c[1] + ny * cs + by * sn, c[2] + nz * cs + bz * sn, u * uvScale[0], v * uvScale[1], ...attr(v, u)];
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

const TAU = Math.PI * 2;

// giant twisted tree with buttress roots, branches, leaf clusters and hanging vines. Local y = 0 at ground.
// attr: x = 0 bark / 1 leaf / 2 vine, y = height param or leaf v, z = extra, w = random
export function tree(seed, lod) {
  const R = makeRng(seed * 7919 + 13), g = new Geo();
  const H = 19 + R() * 9, R0 = 0.85 + R() * 0.4, A = 1.2 + R() * 2.2, p1 = R() * TAU, p2 = R() * TAU;
  const C = (t) => [A * Math.sin(t * 2.2 + p1) * t, H * t - 0.4, A * Math.cos(t * 1.8 + p2) * t - A * t * Math.cos(p2)];
  const rad = (t) => R0 * (1 - 0.6 * t) + R0 * 1.1 * Math.exp(-t * 12);
  const L0 = lod === 0;
  g.tube(L0 ? 20 : 8, L0 ? 30 : 10, C, (t, th) => rad(t) * (1 + 0.11 * Math.sin(5 * th + 9 * t + p1) + 0.05 * Math.sin(11 * th - 6 * t)),
    (t) => [0, t, 0, R()], [2 * Math.PI * R0, H]);
  // buttress fins
  const K = 5 + (R() * 3 | 0);
  for (let k = 0; k < K; k++) {
    const phi = (k / K) * TAU + R() * 0.5, D = 2.6 + R() * 2.4, hf = 2.4 + R() * 2.2, ph = R() * TAU;
    const dx = Math.cos(phi), dz = Math.sin(phi);
    g.surf(L0 ? 10 : 6, L0 ? 14 : 6, (w, s) => {
      const d = R0 * 0.5 + s * D, lat = 0.5 * Math.sin(s * 3.5 + ph) * s;
      const yT = hf * Math.pow(1 - s, 1.6) + 0.08, yB = -0.5, th = 0.32 * Math.pow(1 - s, 1.1) + 0.05;
      const ang = w * TAU, xl = th * Math.cos(ang), y = yB + (yT - yB) * (0.5 + 0.5 * Math.sin(ang));
      return [dx * d - dz * (lat + xl), y, dz * d + dx * (lat + xl), w * 2, s * D + y, 0, Math.max(y, 0) / H, 1, k / K];
    }, true);
  }
  // branches + leaf clusters (a low tier of smaller ones gives the canopy depth)
  const NB = 4 + (R() * 2 | 0), clusters = [], vines = [];
  const top = C(1); clusters.push([top[0], top[1] + 0.5, top[2], 4.2]);
  for (let b = 0; b < NB; b++) {
    const low = b === 0, t0 = low ? 0.4 + R() * 0.1 : 0.55 + R() * 0.3, c0 = C(t0), psi = (b / NB) * TAU + R(), L = (low ? 3.5 : 5) + R() * 4, rise = 0.35 + R() * 0.4;
    const dx = Math.cos(psi), dz = Math.sin(psi);
    const path = (s) => [c0[0] + dx * L * s, c0[1] + L * (rise * s + 0.15 * s - 0.25 * s * s), c0[2] + dz * L * s];
    const r0 = rad(t0) * 0.55;
    g.tube(L0 ? 8 : 5, L0 ? 8 : 4, path, (s) => r0 * (1 - 0.7 * s), (s) => [0, (c0[1] + s * L * 0.3) / H, 0, R()], [1, L]);
    const e = path(1); clusters.push([e[0], e[1] + 0.3, e[2], low ? 2.2 + R() : 3 + R() * 1.4]);
    for (let v = 0; v < 3; v++) { const s = 0.3 + R() * 0.7; vines.push(path(s)); }
  }
  for (const [cx, cy, cz, cr] of clusters) {
    const n = (L0 ? 34 : 20) * (cr < 3 ? 0.6 : 1) | 0;
    for (let l = 0; l < n; l++) {
      let dx = R() * 2 - 1, dy = R() * 1.2 - 0.25, dz = R() * 2 - 1; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const bx = cx + dx * cr * 0.45, by = cy + dy * cr * 0.35, bz = cz + dz * cr * 0.45;
      const big = R(), len = 1.1 + big * big * 2.6, wid = len * (0.2 + R() * 0.1), droop = 0.3 + R() * 0.5, lr = R();
      let sx = -dz, sz = dx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const ex = dx * 0.9, ey = dy * 0.4 + 0.15, ez = dz * 0.9;
      g.surf(3, L0 ? 6 : 3, (u, v) => {
        const x = u * 2 - 1, w = wid * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.8) * x;
        const fold = Math.abs(x) * wid * 0.3;
        return [bx + ex * len * v + sx * w, by + ey * len * v - droop * len * v * v + fold, bz + ez * len * v + sz * w, x, v, 1, v, x, lr];
      });
    }
  }
  // vines: some sag between two branch points, the rest dangle with a lazy curve; small leaves along them
  const nu = L0 ? 5 : 3, nv = L0 ? 20 : 7;
  vines.forEach(([vx, vy, vz], k) => {
    const ph = R() * TAU, vr = R(), o = vines[(k + 2) % vines.length];
    let path, len, hz = (s) => len * s;
    if (k % 3 === 0 && Math.hypot(o[0] - vx, o[2] - vz) > 2) {
      const sag = 3.5 + R() * 5; len = Math.hypot(o[0] - vx, o[1] - vy, o[2] - vz) + sag;
      path = (s) => [vx + (o[0] - vx) * s, vy + (o[1] - vy) * s - sag * 4 * s * (1 - s), vz + (o[2] - vz) * s];
      hz = (s) => sag * 6 * s * (1 - s);
    } else {
      len = Math.min(vy - 1.6, 5 + R() * 11); if (len < 2) return;
      const cx = (R() - 0.5) * 2.4, cz = (R() - 0.5) * 2.4;
      path = (s) => [vx + cx * s * s + 0.35 * Math.sin(s * len * 0.9 + ph) * s, vy - len * s, vz + cz * s * s + 0.35 * Math.cos(s * len * 0.7 + ph) * s];
    }
    if (!L0 && k % 2) return;
    const r0 = 0.022 + 0.025 * vr;
    g.tube(nu, nv, path, (s) => r0 * (1 - 0.5 * s) * (1 + 0.25 * Math.sin(s * len * 2.3 + ph)), (s) => [2, s, hz(s), vr], [1, len]);
    if (L0) for (let j = 0; j < len * 0.7; j++) {
      const s = (j + R()) / (len * 0.7), c = path(s), a = R() * TAU, ll = 0.22 + R() * 0.22;
      g.surf(3, 3, (u, v) => { const x = u * 2 - 1, w = ll * 0.38 * Math.sin(Math.PI * Math.pow(v, 0.7)) * x; return [c[0] + Math.cos(a) * ll * v - Math.sin(a) * w, c[1] - ll * 0.7 * v * v, c[2] + Math.sin(a) * ll * v + Math.cos(a) * w, x, v, 3, v, hz(s), vr]; });
    }
  });
  return g.build();
}

// fern frond: params only, shaped in the vertex shader. uv.x = s along rachis, uv.y = side (-1, 0, 1); attr = (q along leaflet, edge, j rand, 0)
export function frond(nSeg) {
  const g = new Geo();
  g.surf(2, nSeg + 1, (u, v) => [0, 0, 0, v, 0, 0, u * 2 - 1, 0, 0]);
  for (let j = 2; j < nSeg; j++) {
    const s = j / nSeg;
    for (const side of [-1, 1]) g.surf(2, 4, (u, v) => [0, 0, 0, s, side, v, u * 2 - 1, j, 1]);
  }
  return g.build();
}

// fan leaf: polar grid; uv = (angle -1..1, radius 0..1); attr.x = 1 leaf / 0 stalk
export function fan() {
  const g = new Geo();
  g.surf(37, 7, (u, v) => [0, 0, 0, u * 2 - 1, v, 1, 0, 0, 0]);
  g.surf(5, 5, (u, v) => [0, 0, 0, u, v, 0, 0, 0, 0], true);
  return g.build();
}
// spiral stalk tube: uv = (around 0..1, s 0..1) shaped in the shader
export function spiral(nu, nv) { const g = new Geo(); g.surf(nu, nv, (u, v) => [0, 0, 0, u, v, 0, 0, 0, 0], true); return g.build(); }

// lotus: 4 rings of petals shaped in the vertex shader. uv = (x across, v along); attr = (ring, azimuth, len, rand).
// ring 4 = seed pod, 5 = stamens (static positions)
export function lotus() {
  const g = new Geo(), R = makeRng(77);
  [[12, 1.0], [10, 0.88], [8, 0.72], [6, 0.52]].forEach(([n, len], ri) => {
    for (let k = 0; k < n; k++) { const az = ((k + ri * 0.5) / n) * TAU, rr = R(); g.surf(7, 8, (u, v) => [0, 0, 0, u * 2 - 1, v, ri, az, len, rr]); }
  });
  g.surf(12, 5, (u, v) => { const a = u * TAU, r = 0.13 * Math.sin(Math.PI * (0.22 + v * 0.78)) + 0.015; return [Math.cos(a) * r, 0.04 + v * 0.2, Math.sin(a) * r, u, v, 4, 0, v, 0]; }, true);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + R() * 0.2, c = Math.cos(a), s = Math.sin(a), h = 0.2 + R() * 0.08;
    g.surf(2, 3, (u, v) => { const r = 0.13 + 0.1 * v, w = (u - 0.5) * 0.02; return [c * r - s * w, 0.08 + h * v, s * r + c * w, u, v, 5, 0, v, 0]; });
  }
  return g.build();
}

// Victoria-style lily pad: radius 1, thin upturned rim, small notch. attr = (0, r, angle, 0)
export function pad() {
  const g = new Geo(), rs = [0, 0.12, 0.26, 0.4, 0.54, 0.68, 0.8, 0.9, 0.955, 0.98, 0.992, 1], ys = [0, 0, 0, 0, 0, 0, 0, 0, 0.004, 0.03, 0.07, 0.1];
  g.surf(72, 12, (u, v) => {
    const a = u * TAU * 0.975 + 0.08, k = Math.round(v * 11), r = rs[k];
    return [Math.cos(a) * r, ys[k] * (1 + 0.15 * Math.sin(a * 7)) + 0.008 * Math.sin(a * 5) * r * r, Math.sin(a) * r, u, r, 0, r, a, 0];
  });
  return g.build();
}

// koi along +z (head). attr.x = 0 body / 1 fins, attr.y = z param (0 tail .. 1 head), attr.z = fin v, attr.w = fin u
export function fish() {
  const g = new Geo(), sm = (t) => { const x = Math.min(1, Math.max(0, (t + 0.25) / 0.85)); return x * x * (3 - 2 * x); };
  g.tube(14, 20, (t) => [0, 0, t - 0.5], (t, th) => {
    const r = 0.12 * sm(t) * Math.sqrt(Math.max(1 - (t > 0.6 ? ((t - 0.6) / 0.4) ** 2 : 0), 0)) + 0.012;
    return r * (1 - 0.3 * Math.cos(th) ** 2);
  }, (t) => [0, t, 0, 0]);
  g.surf(9, 6, (u, v) => { const x = u * 2 - 1, l = 0.36 * (0.7 + 0.3 * Math.abs(x)); return [0.02 * Math.sin(x * 3) * v, x * 0.12 * Math.pow(v, 0.8), -0.48 - v * l, x, v, 1, -0.25 * v, v, x]; });
  g.surf(7, 3, (u, v) => [0, 0.1 + v * 0.045 * Math.sin(Math.PI * Math.min(1, u * 1.2)), 0.25 - u * 0.4 - v * 0.05, u, v, 1, 0.75 - u * 0.4, v, u * 2 - 1]);
  for (const s of [-1, 1]) g.surf(5, 4, (u, v) => { const x = u * 2 - 1; return [s * (0.07 + v * 0.2), -0.05 - v * 0.05, 0.2 - v * 0.12 + x * 0.07 * v, u, v, 1, 0.7, v, x]; });
  return g.build();
}

// frog. attr.y = part: 0 body, 1 head, 2 legs, 3 eyes, 4 throat sac
export function frog() {
  const g = new Geo();
  const blob = (cx, cy, cz, rx, ry, rz, tag) => g.surf(12, 8, (u, v) => {
    const a = u * TAU, b = v * Math.PI;
    return [cx + Math.cos(a) * Math.sin(b) * rx, cy - Math.cos(b) * ry, cz + Math.sin(a) * Math.sin(b) * rz, u, v, 0, tag, 0, 0];
  }, true);
  blob(0, 0.06, -0.02, 0.078, 0.056, 0.105, 0);
  blob(0, 0.088, 0.075, 0.064, 0.042, 0.055, 1);
  blob(0, 0.05, 0.1, 0.045, 0.035, 0.035, 4);
  for (const s of [-1, 1]) { blob(s * 0.075, 0.03, -0.07, 0.032, 0.03, 0.065, 2); blob(s * 0.055, 0.025, 0.075, 0.016, 0.025, 0.018, 2); blob(s * 0.04, 0.122, 0.095, 0.021, 0.021, 0.021, 3); }
  return g.build();
}

// glowing mushroom cluster. attr.x = 0 stem / 1 cap / 2 gills, attr.y = param
export function mushrooms(seed) {
  const g = new Geo(), R = makeRng(seed);
  for (let k = 0; k < 6; k++) {
    const big = k === 0 ? 1.6 : 1, x = (R() - 0.5) * 0.55, z = (R() - 0.5) * 0.55, h = (0.08 + R() * 0.22) * big, cr = (0.045 + R() * 0.065) * big, lx = (R() - 0.5) * 0.2, lz = (R() - 0.5) * 0.2;
    const sr = cr * 0.2, ch = cr * (0.45 + R() * 0.35);
    g.tube(8, 6, (t) => [x + lx * t * t, t * h, z + lz * t * t], (t) => sr * (1 + 1.3 * Math.exp(-t * 7) - 0.25 * t), (t) => [0, t, 0, 0]);
    const X = x + lx, Z = z + lz;
    g.surf(16, 7, (u, v) => { const a = u * TAU, w = v * Math.PI * 0.5, r = cr * Math.pow(Math.cos(w), 0.75) * (v === 0 ? 0.97 : 1); return [X + Math.cos(a) * r, h + ch * Math.sin(w) - (v === 0 ? 0.012 * big : 0), Z + Math.sin(a) * r, u, v, 1, v, 0, 0]; }, true);
    g.surf(16, 3, (u, v) => { const a = u * TAU, r = sr * 0.8 + (cr * 0.97 - sr * 0.8) * v; return [X + Math.cos(a) * r, h - 0.012 * big - 0.25 * ch * (1 - v) * (1 - v), Z + Math.sin(a) * r, u, v, 2, v, 0, 0]; }, true);
  }
  return g.build();
}

// candelabra shrub: recursive glowing branches ending in bulbs. attr.x = 0 branch / 1 bulb, attr.y = 0..1 along the plant
export function shrub(seed) {
  const g = new Geo(), R = makeRng(seed);
  const grow = (x, y, z, dx, dy, dz, len, r, d) => {
    const ex = x + dx * len, ey = y + dy * len + Math.sin(3) * 0.04 * len, ez = z + dz * len;
    g.tube(7, 4, (t) => [x + dx * len * t, y + dy * len * t + Math.sin(t * 3) * 0.04 * len, z + dz * len * t], (t) => r * (1 - 0.4 * t) * (d === 0 ? 1 + Math.exp(-t * 8) : 1), (t) => [0, (d + t) / 4, 0, 0]);
    if (d >= 3) {
      const br = r * 1.7 + 0.02;
      g.surf(10, 7, (u, v) => { const a = u * TAU, b = v * Math.PI, k = Math.sin(b) * (1 - 0.35 * v); return [ex + Math.cos(a) * k * br, ey + br * 0.6 - Math.cos(b) * br * 1.3, ez + Math.sin(a) * k * br, u, v, 1, 1, R(), 0]; }, true);
      return;
    }
    const n = d === 0 ? 3 : 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      let nx = dx + (R() - 0.5) * 1.3, ny = dy + 0.25 + R() * 0.3, nzz = dz + (R() - 0.5) * 1.3; const l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
      grow(ex, ey, ez, nx, ny, nzz, len * (0.62 + R() * 0.15), r * 0.62, d + 1);
    }
  };
  grow(0, -0.1, 0, 0, 1, 0, 0.55, 0.045, 0);
  return g.build();
}

// broad-leaf rosette: arching taro-like leaves. attr = (0, v along, x across, rand)
export function rosette(seed) {
  const g = new Geo(), R = makeRng(seed), N = 7;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU + R() * 0.5, L = 0.65 + R() * 0.5, W = L * (0.3 + R() * 0.1), up = 0.6 + R() * 0.5, c = Math.cos(a), s = Math.sin(a), lr = R();
    g.surf(7, 10, (u, v) => {
      const x = u * 2 - 1, w = W * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55)), 0.7) * x, r = L * v * (1 - 0.15 * v);
      const y = L * (up * v - 0.75 * up * v * v) + Math.abs(x) * W * 0.3 * Math.sin(Math.PI * v) + 0.025 * Math.sin(v * 17 + k) * Math.abs(x);
      return [c * r - s * w, y, s * r + c * w, x, v, 0, v, x, lr];
    });
  }
  return g.build();
}

// lantern plant: arching stalks with hanging glowing pods. attr.x = 0 stalk / 1 pod, attr.y = along
export function lantern(seed) {
  const g = new Geo(), R = makeRng(seed);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + R(), H = 0.8 + R() * 0.6, D = 0.35 + R() * 0.3, c = Math.cos(a), s = Math.sin(a);
    const path = (t) => { const r = D * t * t * (1 + 0.5 * t); return [c * r, H * Math.sin(t * 2.1) / 0.863, s * r]; };
    g.tube(6, 10, path, (t) => 0.02 * (1 - 0.6 * t) + 0.004, (t) => [0, t, 0, 0]);
    const e = path(1), pl = 0.2 + R() * 0.08, pr = 0.07 + R() * 0.025, rr = R();
    g.surf(12, 8, (u, v) => { const b = u * TAU, r = pr * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62) * 0.93), 0.8) + 0.004; return [e[0] + Math.cos(b) * r, e[1] - pl * v, e[2] + Math.sin(b) * r, u, v, 1, v, rr, 0]; }, true);
  }
  return g.build();
}

// reeds with glowing tips. attr.x = 0 blade / 1 tip, attr.y = along
export function reed(seed) {
  const g = new Geo(), R = makeRng(seed);
  for (let k = 0; k < 9; k++) {
    const a = R() * TAU, r0 = R() * 0.22, H = 0.9 + R() * 1.3, lean = 0.1 + R() * 0.35, c = Math.cos(a), s = Math.sin(a), rr = R();
    const path = (t) => [c * (r0 + lean * t * t * H), H * t, s * (r0 + lean * t * t * H)];
    g.tube(4, 7, path, (t) => 0.012 * (1 - 0.6 * t) + 0.003, (t) => [0, t, 0, rr]);
    if (k % 2 === 0) { const e = path(1); g.surf(7, 5, (u, v) => { const b = u * TAU, q = Math.sin(v * Math.PI) * 0.022; return [e[0] + Math.cos(b) * q, e[1] - 0.06 + v * 0.16, e[2] + Math.sin(b) * q, u, v, 1, v, rr, 0]; }, true); }
  }
  return g.build();
}

// ground-cover tuft: short blades and a few tiny star flowers. attr.x = 0 blade / 1 flower, attr.y = along / radius
export function tuft(seed) {
  const g = new Geo(), R = makeRng(seed);
  for (let k = 0; k < 7; k++) {
    const a = R() * TAU, H = 0.1 + R() * 0.22, lean = 0.05 + R() * 0.12, c = Math.cos(a), s = Math.sin(a), x0 = (R() - 0.5) * 0.2, z0 = (R() - 0.5) * 0.2, rr = R();
    g.surf(2, 4, (u, v) => { const w = (u - 0.5) * 0.028 * (1 - 0.8 * v), l = lean * v * v; return [x0 + c * l - s * w, H * v, z0 + s * l + c * w, u, v, 0, v, rr, 0]; });
  }
  for (let k = 0; k < 3; k++) {
    const x0 = (R() - 0.5) * 0.3, z0 = (R() - 0.5) * 0.3, H = 0.08 + R() * 0.12, rr = R(), ph = R() * TAU;
    g.surf(11, 2, (u, v) => { const a = u * TAU + ph, r = v * 0.04 * (0.65 + 0.35 * Math.cos(a * 5 - ph * 5)); return [x0 + Math.cos(a) * r, H + v * 0.012, z0 + Math.sin(a) * r, u, v, 1, v, rr, 0]; }, true);
  }
  return g.build();
}

// convert a core geo (pos/nrm/uv/idx) into the jungle vertex format with a constant attr
export function fromCore(c, attr) {
  const n = c.pos.length / 3, v = new Float32Array(n * 12);
  for (let k = 0; k < n; k++) {
    v.set([c.pos[k * 3], c.pos[k * 3 + 1], c.pos[k * 3 + 2], c.nrm[k * 3], c.nrm[k * 3 + 1], c.nrm[k * 3 + 2], c.uv[k * 2], c.uv[k * 2 + 1], ...attr], k * 12);
  }
  return { v, i: c.idx };
}
