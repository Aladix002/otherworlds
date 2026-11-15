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
  const C = (t) => [A * Math.sin(t * 2.2 + p1) * t - A * 0 , H * t - 0.4, A * Math.cos(t * 1.8 + p2) * t - A * t * Math.cos(p2)];
  const rad = (t) => R0 * (1 - 0.6 * t) + R0 * 1.1 * Math.exp(-t * 12);
  const L0 = lod === 0;
  g.tube(L0 ? 18 : 8, L0 ? 30 : 10, C, (t, th) => rad(t) * (1 + 0.11 * Math.sin(5 * th + 9 * t + p1) + 0.05 * Math.sin(11 * th - 6 * t)),
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
  // branches + leaf clusters
  const NB = 3 + (R() * 2 | 0), clusters = [], vines = [];
  const top = C(1); clusters.push([top[0], top[1] + 0.5, top[2], 4.2]);
  for (let b = 0; b < NB; b++) {
    const t0 = 0.55 + R() * 0.3, c0 = C(t0), psi = (b / NB) * TAU + R(), L = 5 + R() * 4, rise = 0.35 + R() * 0.4;
    const dx = Math.cos(psi), dz = Math.sin(psi);
    const path = (s) => [c0[0] + dx * L * s, c0[1] + L * (rise * s + 0.15 * s - 0.25 * s * s) , c0[2] + dz * L * s];
    const r0 = rad(t0) * 0.55;
    g.tube(L0 ? 8 : 5, L0 ? 8 : 4, path, (s) => r0 * (1 - 0.7 * s), (s) => [0, (c0[1] + s * L * 0.3) / H, 0, R()], [1, L]);
    const e = path(1); clusters.push([e[0], e[1] + 0.3, e[2], 3 + R() * 1.4]);
    for (let v = 0; v < 3; v++) { const s = 0.3 + R() * 0.7; vines.push(path(s)); }
  }
  for (const [cx, cy, cz, cr] of clusters) {
    const n = L0 ? 34 : 22;
    for (let l = 0; l < n; l++) {
      let dx = R() * 2 - 1, dy = R() * 1.2 - 0.25, dz = R() * 2 - 1; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const bx = cx + dx * cr * 0.45, by = cy + dy * cr * 0.35, bz = cz + dz * cr * 0.45;
      const len = 1.7 + R() * 1.4, wid = 0.45 + R() * 0.35, droop = 0.3 + R() * 0.5, lr = R();
      let sx = -dz, sz = dx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const ex = dx * 0.9, ey = dy * 0.4 + 0.15, ez = dz * 0.9;
      g.surf(3, L0 ? 5 : 3, (u, v) => {
        const x = u * 2 - 1, w = wid * Math.sin(Math.PI * Math.pow(v, 0.7)) * x;
        const fold = Math.abs(x) * wid * 0.25;
        return [bx + ex * len * v + sx * w, by + ey * len * v - droop * len * v * v + fold, bz + ez * len * v + sz * w, x, v, 1, v, x, lr];
      });
    }
  }
  if (L0) for (const [vx, vy, vz] of vines) {
    const len = Math.min(vy - 1.8, 6 + R() * 9), ph = R() * TAU, vr = R();
    if (len < 2) continue;
    g.tube(4, 16, (s) => [vx + 0.35 * Math.sin(s * 3 + ph) * s, vy - len * s, vz + 0.35 * Math.cos(s * 2.3 + ph) * s], () => 0.035,
      (s) => [2, s, len * s, vr], [1, len]);
  }
  return g.build();
}

// hanging vine strands for the canopy over the clearing are part of trees; here: small plant meshes.
// fern frond: params only, shaped in the vertex shader. uv.x = s along rachis, uv.y = side (-1, 0, 1); attr = (q along leaflet, edge, j rand, 0)
export function frond(nSeg) {
  const g = new Geo();
  // rachis strip
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
  g.surf(25, 6, (u, v) => [0, 0, 0, u * 2 - 1, v, 1, 0, 0, 0]);
  g.surf(4, 5, (u, v) => [0, 0, 0, u, v, 0, 0, 0, 0]);
  return g.build();
}
// spiral stalk tube: uv = (around 0..1, s 0..1) shaped in the shader
export function spiral(nu, nv) { const g = new Geo(); g.surf(nu, nv, (u, v) => [0, 0, 0, u, v, 0, 0, 0, 0], true); return g.build(); }

// lotus: 3 rings of petals in petal-local space (base at origin, length along +y). attr = (ring, azimuth, v, rand); core = ring 3
export function lotus() {
  const g = new Geo(), R = makeRng(77), rings = [[9, 1.0, 0], [8, 0.85, 0.2], [6, 0.65, 0.5]];
  rings.forEach(([n, len, off], ri) => {
    for (let k = 0; k < n; k++) {
      const az = ((k + off) / n) * TAU, rr = R();
      g.surf(5, 6, (u, v) => {
        const x = u * 2 - 1, w = 0.32 * len * Math.sin(Math.PI * Math.pow(v, 0.62)) * x;
        const cup = (1 - x * x) * 0.09 * len * Math.sin(Math.PI * v);
        return [w, v * len, -cup + 0.12 * len * v * v, x, v, ri, az, v, rr];
      });
    }
  });
  // seed pod core + stamens ring
  g.surf(10, 4, (u, v) => { const a = u * TAU, r = 0.16 * Math.sin(Math.PI * (0.25 + v * 0.75)) + 0.02; return [Math.cos(a) * r, 0.05 + v * 0.22, Math.sin(a) * r, u, v, 3, 0, v, 0]; }, true);
  return g.build();
}

// Victoria-style lily pad: radius 1, upturned rim, small notch. attr = (0 top, r, angle, 0)
export function pad() {
  const g = new Geo();
  g.surf(56, 9, (u, v) => {
    const a = u * TAU * 0.985 + 0.05, r = Math.pow(v, 0.8);
    const rim = Math.max(0, (r - 0.9) / 0.1);
    const y = 0.13 * rim * rim + 0.012 * Math.sin(a * 13) * r;
    const rr = r - 0.03 * rim;
    return [Math.cos(a) * rr, y, Math.sin(a) * rr, u, r, 0, r, a, 0];
  });
  return g.build();
}

// koi-like fish along +z (head) ; attr.x = 0 body / 1 fins, attr.y = z param (0 tail .. 1 head)
export function fish() {
  const g = new Geo();
  g.tube(10, 14, (t) => [0, 0, t * 0.9 - 0.45], (t, th) => {
    const r = 0.11 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 1.05)) ** 0.8 + 0.008;
    return r * (1 - 0.2 * Math.sin(th) ** 2);
  }, (t) => [0, t, 0, 0]);
  g.surf(3, 5, (u, v) => { const x = (u * 2 - 1); return [x * 0.22 * v, 0.02 * v, -0.45 - v * 0.32 + Math.abs(x) * 0.08 * v, x, v, 1, -v * 0.3, 0, 0]; });
  for (const s of [-1, 1]) g.surf(2, 3, (u, v) => [s * (0.08 + v * 0.17), -0.03 - v * 0.03, 0.12 - u * 0.14 - v * 0.08, u, v, 1, 0.65, 0, 0]);
  return g.build();
}

// frog: body + head + legs as small blobs. attr.y = spot param
export function frog() {
  const g = new Geo();
  const blob = (cx, cy, cz, rx, ry, rz, tag) => g.surf(10, 7, (u, v) => {
    const a = u * TAU, b = v * Math.PI;
    return [cx + Math.cos(a) * Math.sin(b) * rx, cy - Math.cos(b) * ry, cz + Math.sin(a) * Math.sin(b) * rz, u, v, 0, tag, 0, 0];
  }, true);
  blob(0, 0.06, -0.02, 0.075, 0.055, 0.1, 0);
  blob(0, 0.09, 0.07, 0.06, 0.04, 0.05, 1);
  for (const s of [-1, 1]) { blob(s * 0.07, 0.03, -0.07, 0.03, 0.03, 0.06, 2); blob(s * 0.05, 0.025, 0.07, 0.015, 0.025, 0.015, 2); blob(s * 0.035, 0.115, 0.095, 0.015, 0.015, 0.015, 3); }
  return g.build();
}

// glowing mushroom cluster for the path edges. attr.x = 0 stem / 1 cap
export function mushrooms(seed) {
  const g = new Geo(), R = makeRng(seed);
  for (let k = 0; k < 5; k++) {
    const x = (R() - 0.5) * 0.5, z = (R() - 0.5) * 0.5, h = 0.08 + R() * 0.22, cr = 0.04 + R() * 0.07, lean = (R() - 0.5) * 0.15;
    g.tube(6, 3, (t) => [x + lean * t, t * h, z], () => cr * 0.22, () => [0, 0, 0, 0]);
    g.surf(10, 4, (u, v) => { const a = u * TAU, r = cr * Math.sin(v * Math.PI * 0.5); return [x + lean + Math.cos(a) * r, h + cr * 0.5 * Math.cos(v * Math.PI * 0.5) - 0.01, z + Math.sin(a) * r, u, v, 1, v, 0, 0]; }, true);
  }
  return g.build();
}

// fractal shrub: recursive glowing branches, tips flagged. attr.x = 0 branch / 1 tip bulb, attr.y = depth
export function shrub(seed) {
  const g = new Geo(), R = makeRng(seed);
  const grow = (x, y, z, dx, dy, dz, len, r, d) => {
    const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
    g.tube(5, 3, (t) => [x + dx * len * t, y + dy * len * t + Math.sin(t * 3) * 0.04 * len, z + dz * len * t], (t) => r * (1 - 0.4 * t), () => [0, d, 0, 0]);
    if (d >= 3) {
      g.surf(8, 5, (u, v) => { const a = u * TAU, b = v * Math.PI, br = r * 1.5 + 0.018; return [ex + Math.cos(a) * Math.sin(b) * br, ey - Math.cos(b) * br, ez + Math.sin(a) * Math.sin(b) * br, u, v, 1, d, R(), 0]; }, true);
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

// convert a core geo (pos/nrm/uv/idx) into the jungle vertex format with a constant attr
export function fromCore(c, attr) {
  const n = c.pos.length / 3, v = new Float32Array(n * 12);
  for (let k = 0; k < n; k++) {
    v.set([c.pos[k * 3], c.pos[k * 3 + 1], c.pos[k * 3 + 2], c.nrm[k * 3], c.nrm[k * 3 + 1], c.nrm[k * 3 + 2], c.uv[k * 2], c.uv[k * 2 + 1], ...attr], k * 12);
  }
  return { v, i: c.idx };
}
