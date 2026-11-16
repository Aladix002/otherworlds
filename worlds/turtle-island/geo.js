// Turtle Island meshes. uv.y = material id + 0.9 * v, uv.x = free parameter (see MAT list in scene.wgsl).
import { merge, computeNormals, sphere, lathe, tube, box, rock, translate, scale, transform } from '../../core/src/mesh.js';
import { trsY, makeRng } from '../../core/src/math.js';

const TAU = Math.PI * 2, T = new Float32Array(16);
const mk = (nv, ni) => ({ pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), idx: new Uint32Array(ni) });
// set the material (and optionally a constant uv.x) of a geo
export function mt(g, m, u) { for (let i = 0; i < g.uv.length; i += 2) { if (u !== undefined) g.uv[i] = u; g.uv[i + 1] = m + 0.9 * Math.min(Math.max(g.uv[i + 1], 0), 1); } return g; }
const yaw = (g, a, x = 0, y = 0, z = 0) => transform(g, trsY(T, x, y, z, a));
function rot(g, ax, a) {                                   // rotate about X (0) or Z (2)
  const c = Math.cos(a), s = Math.sin(a), o = ax === 0 ? 2 : 0;
  for (const A of [g.pos, g.nrm]) for (let i = 0; i < A.length; i += 3) { const p = A[i + 1], q = A[i + o]; if (ax === 0) { A[i + 1] = p * c - q * s; A[i + 2] = p * s + q * c; } else { A[i] = q * c - p * s; A[i + 1] = q * s + p * c; } }
  return g;
}
const ell = (rx, ry, rz, sub = 1) => scale(sphere(1, sub), rx, ry, rz);

// closed tube skin: f(s, a) -> [x, y, z] for s in 0..1 along, a in 0..TAU around. uv = (s, a / TAU)
export function loft(ns, nc, f) {
  const g = mk((ns + 1) * (nc + 1), ns * nc * 6); let k = 0;
  for (let j = 0; j <= ns; j++) for (let i = 0; i <= nc; i++) {
    const v = j * (nc + 1) + i, p = f(j / ns, (i % nc) / nc * TAU);
    g.pos.set(p, v * 3); g.uv[v * 2] = j / ns; g.uv[v * 2 + 1] = i / nc;
  }
  for (let j = 0; j < ns; j++) for (let i = 0; i < nc; i++) {
    const a = j * (nc + 1) + i, b = a + 1, c = a + nc + 1, d = c + 1;
    g.idx[k++] = a; g.idx[k++] = b; g.idx[k++] = c; g.idx[k++] = b; g.idx[k++] = d; g.idx[k++] = c;
  }
  computeNormals(g);
  for (let j = 0; j <= ns; j++) {                           // weld the seam normals
    const a = (j * (nc + 1)) * 3, b = (j * (nc + 1) + nc) * 3;
    for (let c = 0; c < 3; c++) { const m = g.nrm[a + c] + g.nrm[b + c]; g.nrm[a + c] = g.nrm[b + c] = m; }
  }
  for (let i = 0; i < g.nrm.length; i += 3) { const l = Math.hypot(g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]) || 1; g.nrm[i] /= l; g.nrm[i + 1] /= l; g.nrm[i + 2] /= l; }
  return g;
}

// giant flipper: unit length along +x, chord along z (leading edge -z thick, trailing edge +z thin), swept back at the tip
export const flipper = () => loft(34, 18, (s, a) => {
  const c = Math.cos(a), sn = Math.sin(a);
  const w = 0.105 * Math.pow(Math.sin(Math.PI * Math.pow(0.05 + 0.94 * s, 0.6)), 0.7) * (0.45 + 0.55 * ss(0, 0.16, s));
  const th = (0.05 * (1 - 0.8 * s) + 0.022 * Math.exp(-Math.pow((s - 0.27) / 0.09, 2))) * Math.sqrt(Math.sin(Math.PI * Math.min(1, 0.03 + s * 0.97)) + 0.02);
  return [s, sn * th * (0.6 - 0.4 * c) - 0.06 * s * s * s, 0.1 * s + 0.32 * s * s * s + 0.04 * ss(0.2, 0.4, s) + c * w * (c > 0 ? 1.2 : 0.8)];
});
// head + neck, unit length: the neck climbs from the origin toward -z, the head levels out. Returns the geo plus the
// eye, neck pivot and nostril points (mesh space) for the shaders.
export function head() {
  const ns = 56, C = [[0, 0, 0]], TH = [];
  for (let j = 0; j <= ns; j++) {
    const th = 0.78 * ss(0.8, 0.25, j / ns) - 0.12; TH.push(th);
    if (j) { const p = C[j - 1], m = (TH[j - 1] + th) / 2; C.push([0, p[1] + Math.sin(m) / ns, p[2] - Math.cos(m) / ns]); }
  }
  const f = (s, a) => {
    const j = Math.round(s * ns), th = TH[j], c = C[j], k = Math.max(s - 0.83, 0) / 0.17, sn = Math.sin(a), cs = Math.cos(a);
    const r = 0.064 + 0.08 * Math.exp(-s * 3) + 0.06 * Math.exp(-Math.pow((s - 0.78) / 0.15, 2));
    const end = Math.pow(Math.max(1 - Math.pow(k, 2.4), 0), 0.42);
    const mouth = 1 - 0.07 * Math.exp(-Math.pow((sn + 0.3) / 0.09, 2)) * ss(0.7, 0.88, s);                 // jaw line
    const wr = 1 + 0.022 * Math.sin(s * 140 + 2 * sn) * ss(0.66, 0.52, s) * ss(0.04, 0.2, s);               // neck folds
    const brow = 0.004 * Math.exp(-Math.pow((s - 0.815) / 0.045, 2)) * Math.exp(-Math.pow((sn - 0.55) / 0.3, 2));
    const lx = cs * (r * (1 - 0.34 * k * k) * end * mouth * wr + brow + 0.003);
    const ly = sn * (r * (sn > 0 ? 0.84 : 0.66) * (1 - 0.3 * k) * end * mouth * wr + 0.003) + brow * 0.6 - 0.018 * k * k;   // blunt snout, beak tip dipping gently
    return [lx, c[1] + ly * Math.cos(th), c[2] + ly * Math.sin(th)];
  };
  const g = loft(ns, 28, f);
  g.eye = f(0.85, 0.16); g.pivot = C[Math.round(0.6 * ns)]; g.nose = f(0.975, 0.9);
  return g;
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a leaf blade pointing +z from the origin: 3 verts across (ridge raised), uv = (across 0..1, along)
function frond(len, w, segs, lift, droop) {
  const g = mk((segs + 1) * 3, segs * 12); let y = 0, z = 0, k = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, an = lift - droop * Math.pow(t, 1.4), hw = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.55);
    for (let c = 0; c < 3; c++) { const v = i * 3 + c; g.pos.set([(c - 1) * hw, y - (c !== 1 ? hw * 0.45 : 0), z], v * 3); g.uv[v * 2] = c / 2; g.uv[v * 2 + 1] = t; }
    y += Math.sin(an) * len / segs; z += Math.cos(an) * len / segs;
    if (i < segs) for (let c = 0; c < 2; c++) { const a = i * 3 + c, b = a + 1, d = a + 3, e = d + 1; g.idx.set([a, b, d, b, e, d], k); k += 6; }
  }
  return computeNormals(g);
}
export function palm(seed) {
  const R = makeRng(seed), h = R.range(6.5, 9), lean = R.range(0.8, 2.6), parts = [], path = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([lean * t * t, h * t, 0]); }
  parts.push(mt(tube(path, (t) => 0.2 - 0.09 * t + 0.1 * Math.exp(-t * 14), 7), 0));
  for (let i = 0; i < 13; i++) {
    const f = frond(R.range(2.7, 3.5), 0.55, 7, R.range(-0.25, 1.05), R.range(1.5, 2.1));
    parts.push(yaw(mt(f, 1), i * 2.4 + R.range(-0.3, 0.3), lean, h - 0.05, 0));
  }
  for (let i = 0; i < 3; i++) parts.push(translate(mt(ell(0.15, 0.17, 0.15), 0, 0.5), lean + Math.cos(i * 2.1) * 0.2, h - 0.3, Math.sin(i * 2.1) * 0.2));
  return merge(parts);
}
export function fern(seed) {
  const R = makeRng(seed), parts = [];
  for (let i = 0; i < 7; i++) parts.push(yaw(mt(frond(R.range(0.9, 1.5), 0.2, 5, R.range(0.5, 1.15), R.range(1.5, 2.3)), 1), i * 0.9 + R.range(-0.2, 0.2)));
  return merge(parts);
}
export function tree(seed) {
  const R = makeRng(seed), parts = [mt(tube([[0, -0.5, 0], [0.15, 1.6, 0.1], [0.1, 3.4, -0.1], [0.3, 4.6, 0]], (t) => 0.3 - 0.14 * t, 6), 0)];
  for (let i = 0; i < 4; i++) {
    const s = R.range(1.5, 2.3), a = i * 1.7;
    parts.push(translate(mt(scale(rock(seed * 7 + i, 2, 0.3), s, s * 0.72, s), 2), i ? Math.cos(a) * 1.5 : 0.2, 4.6 + (i ? R.range(-0.5, 0.5) : 1), i ? Math.sin(a) * 1.5 : 0));
  }
  return merge(parts);
}
export const column = () => mt(lathe([[1, 0], [1, 1], [0.86, 1.012], [0.001, 1.02]], 6), 3);
export const boulder = (seed, sub = 2) => mt(rock(seed, sub, 0.42), 4);

export function bird() {                                    // faces -z, wings along x, uv.x = signed span (0 on the body)
  const body = mt(loft(8, 8, (s, a) => { const r = 0.085 * Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * s)), 0.7); return [Math.cos(a) * r, Math.sin(a) * r * 0.9, 0.34 - s * 0.72]; }), 9, 0);
  const parts = [body];
  for (const sd of [-1, 1]) {
    const g = mk(12, 30); let k = 0;
    for (let i = 0; i < 6; i++) {
      const t = i / 5, x = sd * (0.04 + t * 1.15), ch = 0.24 * (1 - 0.8 * t * t), zc = 0.02 + 0.3 * t * t;
      g.pos.set([x, 0.02, zc - ch * 0.5], i * 6); g.pos.set([x, 0.02, zc + ch * 0.5], i * 6 + 3);
      g.uv.set([sd * t, 0.2 + 0.7 * t, sd * t, 0.2 + 0.7 * t], i * 4);
      if (i < 5) { const a = i * 2; g.idx.set(sd > 0 ? [a, a + 1, a + 2, a + 1, a + 3, a + 2] : [a, a + 2, a + 1, a + 1, a + 2, a + 3], k); k += 6; }
    }
    computeNormals(g); g.uv.forEach((v, i) => { if (i & 1) g.uv[i] = 9 + 0.9 * v; }); parts.push(g);
  }
  return merge(parts);
}
export function babyTurtle() {                              // ~0.2 m, faces -z; flippers uv.x = +-1 (stroke phase)
  const parts = [mt(translate(ell(0.085, 0.045, 0.105, 2), 0, 0.035, 0), 12, 0), mt(translate(ell(0.032, 0.028, 0.045), 0, 0.04, -0.125), 12, 0.2)];
  for (const [x, z, a, s] of [[0.1, -0.06, -0.5, 1], [-0.1, -0.06, 0.5, 1], [0.085, 0.085, 0.6, 0.6], [-0.085, 0.085, -0.6, 0.6]])
    parts.push(translate(yaw(mt(ell(0.07 * s, 0.01, 0.028 * s), 12, x > 0 ? 1 : -1), a), x, 0.018, z));
  return merge(parts);
}
export function crab() {                                    // ~0.16 m wide; legs uv.x = +-1
  const parts = [mt(translate(ell(0.08, 0.035, 0.055, 2), 0, 0.05, 0), 10, 0)];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -0.035 + i * 0.024, x = sd * 0.07;
      parts.push(mt(tube([[x, 0.05, z], [x + sd * 0.05, 0.075, z * 1.3], [x + sd * 0.085, 0, z * 1.7]], 0.008, 4), 10, sd * (i & 1 ? 1 : -1)));
    }
    parts.push(mt(translate(ell(0.028, 0.018, 0.02), sd * 0.075, 0.05, -0.07), 10, 0));
    parts.push(mt(translate(ell(0.008, 0.012, 0.008), sd * 0.03, 0.09, -0.045), 10, 0.5));
  }
  return merge(parts);
}
export function starfish() {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(yaw(mt(loft(5, 6, (s, a) => { const r = 0.034 * (1 - 0.82 * s) + 0.004; return [Math.cos(a) * r, Math.max(Math.sin(a), -0.2) * r * 0.5 + 0.012, s * 0.13]; }), 11), i * TAU / 5));
  return merge(parts);
}
export function dolphin() {                                 // 2.6 m, faces -z; uv.x = position along the body (bend)
  const body = mt(loft(14, 10, (s, a) => {
    const r = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(0.02 + 0.96 * s, 0.75)), 0.8) * (s < 0.1 ? 0.55 + 4.5 * s : 1);
    return [Math.cos(a) * r * 0.9, Math.sin(a) * r, -1.3 + s * 2.6];
  }), 13);
  const fin = translate(rot(mt(scale(sphere(1, 1), 0.035, 0.26, 0.2), 13, 0.45), 0, 0.5), 0, 0.3, -0.05);
  const fluke = translate(mt(ell(0.36, 0.03, 0.14), 13, 1), 0, 0, 1.32);
  const pecs = [-1, 1].map((sd) => translate(rot(mt(ell(0.22, 0.025, 0.09), 13, 0.3), 2, -sd * 0.6), sd * 0.3, -0.16, -0.55));
  return merge([body, fin, fluke, ...pecs]);
}
export const whale = () => mt(loft(10, 10, (s, a) => { const r = Math.pow(Math.sin(Math.PI * (0.02 + 0.96 * s)), 0.6); return [Math.cos(a) * r * 2.6, Math.sin(a) * r * 1.9, -9 + s * 18]; }), 13, 0.5);

const bx = (w, h, d, x, y, z, m, u) => translate(mt(box(w, h, d), m, u), x, y, z);
// hut on stilts, hammock, shrine with a torii and stone lantern, driftwood. World-space, one draw. g = ground height fn
export function props(g, HUT, SHRINE, HAM, NEST) {
  const P = [];
  { const [x, z] = HUT, y = g(x, z) + 0.9;                  // hut (front faces +x, the sea)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [2.4, -1], [2.4, 1]]) P.push(bx(0.14, 2.2, 0.14, x + sx * 1.35, y - 1.0, z + sz * 1.25, 0, 0.3));
    P.push(bx(4.6, 0.12, 3.1, x + 0.75, y, z, 0, 0.8));
    P.push(bx(2.9, 1.9, 2.7, x, y + 1.0, z, 5, 0.2));
    P.push(translate(yaw(mt(lathe([[2.75, 0], [1.3, 1.05], [0.02, 1.9]], 4), 6), Math.PI / 4), x + 0.2, y + 1.9, z));
    P.push(bx(0.03, 0.75, 0.8, x + 1.47, y + 1.15, z + 0.55, 7, 0)); P.push(bx(0.04, 1.5, 0.7, x + 1.47, y + 0.8, z - 0.6, 0, 0.1));
    P.push(bx(0.8, 0.75, 0.03, x - 0.3, y + 1.15, z + 1.37, 7, 0)); P.push(bx(0.9, 0.75, 0.03, x + 0.3, y + 1.15, z - 1.37, 7, 0)); P.push(bx(0.03, 0.7, 0.7, x - 1.47, y + 1.15, z - 0.3, 7, 0));
    P.push(translate(mt(ell(0.11, 0.14, 0.11), 7, 1), x - 0.9, y + 1.55, z - 1.8)); P.push(bx(0.015, 0.3, 0.015, x - 0.9, y + 1.8, z - 1.8, 0, 0));
    for (let i = 0; i < 4; i++) P.push(bx(0.5, 0.05, 0.16, x + 3.2 + i * 0.24, y - 0.2 - i * 0.24, z - 0.6, 0, 0.6));
    P.push(translate(mt(ell(0.1, 0.13, 0.1), 7, 1), x + 2.3, y + 1.55, z + 0.9)); P.push(bx(0.015, 0.3, 0.015, x + 2.3, y + 1.8, z + 0.9, 0, 0)); }
  { const [a, b] = HAM, n = 12, gm = mk((n + 1) * 3, n * 12); let k = 0;     // hammock between two palms: uv.x = sag weight
    for (let i = 0; i <= n; i++) {
      const t = i / n, sg = Math.sin(Math.PI * t), w = 0.08 + 0.42 * sg;
      const px = a[0] + (b[0] - a[0]) * t, pz = a[2] + (b[2] - a[2]) * t, py = a[1] + (b[1] - a[1]) * t - 0.75 * sg;
      const ox = -(b[2] - a[2]), oz = b[0] - a[0], ol = Math.hypot(ox, oz);
      for (let c = 0; c < 3; c++) { const v = i * 3 + c, s = (c - 1) * w; gm.pos.set([px + ox / ol * s, py + (c !== 1 ? 0.16 * sg : 0), pz + oz / ol * s], v * 3); gm.uv[v * 2] = sg; gm.uv[v * 2 + 1] = 8 + 0.9 * t; }
      if (i < n) for (let c = 0; c < 2; c++) { const q = i * 3 + c; gm.idx.set([q, q + 1, q + 3, q + 1, q + 4, q + 3], k); k += 6; }
    }
    P.push(computeNormals(gm)); }
  { const [x, z] = SHRINE, y = g(x, z);                    // torii facing +z (the wake) + stone lantern + steps
    for (const sd of [-1, 1]) P.push(translate(mt(lathe([[0.13, 0], [0.11, 2.6]], 8), 14), x + sd * 1.05, y - 0.1, z + 2.2));
    P.push(bx(3.1, 0.16, 0.2, x, y + 2.62, z + 2.2, 14, 0)); P.push(bx(3.4, 0.1, 0.3, x, y + 2.76, z + 2.2, 0, 0.1)); P.push(bx(2.3, 0.11, 0.12, x, y + 2.15, z + 2.2, 14, 0));
    for (const [lx, lz] of [[-1.6, -0.4], [-1.9, 3.6], [1.9, 3.6]]) {                 // stone lanterns
      const X = x + lx, Z = z + lz, Y = g(X, Z);
      P.push(translate(mt(lathe([[0.42, 0], [0.36, 0.14], [0.13, 0.2], [0.11, 0.95], [0.3, 1.02], [0.3, 1.08]], 6), 15), X, Y - 0.05, Z));
      P.push(translate(mt(lathe([[0.2, 0], [0.2, 0.34]], 6), 7, 0.6), X, Y + 1.03, Z));
      P.push(translate(mt(lathe([[0.46, 0], [0.2, 0.2], [0.07, 0.26], [0.09, 0.36], [0.001, 0.42]], 6), 15), X, Y + 1.37, Z));
    }
    for (let i = 0; i < 7; i++) P.push(bx(1.7 - i * 0.05, 0.16, 0.5, x, g(x, z + 3.2 + i * 0.5) - 0.06, z + 3.2 + i * 0.5, 15, 0));
    P.push(translate(mt(scale(rock(31, 2, 0.3), 0.7, 0.5, 0.6), 15), x + 1.4, y + 0.1, z - 0.6)); }
  { const [x, z] = NEST;                                     // nest: a ring of sand lumps and egg shells
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.75 + (i % 3) * 0.07; P.push(translate(mt(ell(0.3, 0.12, 0.26), 4, 1), x + Math.cos(a) * r, g(x + Math.cos(a) * r, z + Math.sin(a) * r) + 0.02, z + Math.sin(a) * r)); }
    for (let i = 0; i < 5; i++) P.push(translate(mt(ell(0.045, 0.04, 0.045), 8, 0), x + Math.cos(i * 2.2) * 0.3, g(x, z) + 0.05, z + Math.sin(i * 2.2) * 0.3)); }
  return merge(P);
}
