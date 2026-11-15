// Large creatures: meshes (built once) + CPU-animated slow paths written into a small instance buffer each frame.
import { mat } from './temple.js';

const part = (g, id, side = 0) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = id; g.uv[i + 1] = side; } return g; };
const ell = (M, rx, ry, rz, x, y, z, sub = 2) => M.translate(M.scale(M.sphere(1, sub), rx, ry, rz), x, y, z);

// turtle, nose +z. parts: 0 shell, 1 skin, 2 front flipper, 3 rear flipper (uv.y = side)
export function turtleGeo(M) {
  const g = [part(ell(M, 0.5, 0.17, 0.62, 0, 0.05, 0, 3), 0), part(ell(M, 0.46, 0.08, 0.57, 0, -0.03, 0), 1),
    part(ell(M, 0.11, 0.09, 0.15, 0, 0.03, 0.74), 1), part(ell(M, 0.1, 0.075, 0.14, 0, 0.0, 0.6), 1)];
  for (const s of [-1, 1]) {
    g.push(part(M.transform(ell(M, 0.42, 0.03, 0.11, 0, 0, 0), mat(0, -0.45 * s, 0, s * 0.62, -0.02, 0.18)), 2, s));
    g.push(part(M.transform(ell(M, 0.15, 0.025, 0.09, 0, 0, 0), mat(0, 0.6 * s, 0, s * 0.3, -0.03, -0.58)), 3, s));
  }
  return M.merge(g);
}
// flat ray body: top + bottom grids. wide = manta-like wings. uv = (0 body | 1 tail | 2 horn, u across)
export function rayGeo(M, manta) {
  const NX = 16, NZ = 12, pos = [], uv = [], idx = [];
  const hw = (v) => manta ? 1.0 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.8) * (1 - 0.35 * v) + 0.03
    : 0.62 * Math.sin(Math.PI * v) + 0.0;
  for (const top of [1, -1]) {
    const b = pos.length / 3;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const u = i / NX * 2 - 1, v = j / NZ, z = manta ? -0.45 + 0.85 * v : -0.5 + v;
      const sweep = manta ? -0.28 * u * u : 0;
      const th = (manta ? 0.09 : 0.06) * (1 - u * u) * Math.sin(Math.PI * v) ** 0.7;
      pos.push(u * hw(v), th * top + (manta ? 0 : 0.02 * (1 - u * u)), z + sweep); uv.push(0, u);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = b + j * (NX + 1) + i, c = a + NX + 1;
      if (top > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const body = { pos: new Float32Array(pos), nrm: new Float32Array(pos.length), uv: new Float32Array(uv), idx: new Uint32Array(idx) };
  M.computeNormals(body);
  const parts = [body];
  const tail = M.transform(M.cylinder(0.018, 0.002, manta ? 0.5 : 0.9, 5), mat(-Math.PI / 2, 0, 0, 0, 0, manta ? -0.42 : -0.45));
  parts.push(part(tail, 1));
  if (manta) for (const s of [-1, 1]) parts.push(part(M.transform(ell(M, 0.03, 0.025, 0.12, 0, 0, 0, 1), mat(0.3, 0.15 * s, 0, s * 0.13, -0.03, 0.44)), 2));
  return M.merge(parts);
}
// whale shark, nose +z, length 1. parts 0 body, 1 fin
export function sharkGeo(M) {
  const body = M.lathe([[0.001, -0.5], [0.02, -0.42], [0.05, -0.3], [0.085, -0.12], [0.1, 0.05], [0.095, 0.25], [0.085, 0.4], [0.05, 0.48], [0.001, 0.5]], 14);
  M.transform(body, mat(Math.PI / 2, 0, 0, 0, 0, 0)); M.scale(body, 1.25, 0.85, 1);
  const tri = (P) => { const g = { pos: new Float32Array(P.flat()), nrm: new Float32Array(9), uv: new Float32Array(6), idx: new Uint32Array([0, 1, 2]) }; M.computeNormals(g); return part(g, 1); };
  return M.merge([part(body, 0),
    tri([[0, 0, -0.42], [0, 0.2, -0.58], [0, 0.02, -0.5]]), tri([[0, 0, -0.42], [0, 0.01, -0.5], [0, -0.13, -0.56]]),
    tri([[0, 0.07, 0.02], [0, 0.17, -0.1], [0, 0.07, -0.14]]),
    part(M.transform(ell(M, 0.16, 0.012, 0.05, 0, 0, 0, 1), mat(0, 0, 0.25, 0.17, -0.05, 0.12)), 1),
    part(M.transform(ell(M, 0.16, 0.012, 0.05, 0, 0, 0, 1), mat(0, 0, -0.25, -0.17, -0.05, 0.12)), 1)]);
}

// instance layout: p (pos, scale), f (fwd, phase), u (up, kind) -> 12 floats
function put(D, k, x, y, z, s, fx, fy, fz, ph, kind, bank) {
  const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
  // up = world up tilted by bank around fwd, orthogonalized
  const rx = -fz, rz = fx, rl = Math.hypot(rx, rz) || 1;
  let ux = rx / rl * bank, uy = 1, uz = rz / rl * bank;
  const d = ux * fx + uy * fy + uz * fz; ux -= d * fx; uy -= d * fy; uz -= d * fz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const o = k * 12;
  D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = s; D[o + 4] = fx; D[o + 5] = fy; D[o + 6] = fz; D[o + 7] = ph;
  D[o + 8] = ux / ul; D[o + 9] = uy / ul; D[o + 10] = uz / ul; D[o + 11] = kind;
}
// D: Float32Array(6*12). H = heightAt
export function animate(D, t, H) {
  // turtles: slow loops around the temple / over the spawn sand
  for (let i = 0; i < 2; i++) {
    const w = i ? -0.03 : 0.021, th = t * w + (i ? 2 : 0), th2 = th + 0.5 * Math.sign(w);
    const cx = i ? 12 : 0, cz = i ? 76 : 44, rx = i ? 14 : 20, rz = i ? 10 : 26, cy = i ? -5.8 : -7;
    const x = cx + rx * Math.cos(th), z = cz + rz * Math.sin(th), y = cy + 0.8 * Math.sin(t * 0.037 + i * 2);
    const x2 = cx + rx * Math.cos(th2), z2 = cz + rz * Math.sin(th2), y2 = cy + 0.8 * Math.sin((t + 20) * 0.037 + i * 2);
    put(D, i, x, y, z, 1, x2 - x, (y2 - y) * 0.5, z2 - z, t * 0.9 + i, 0, (i ? 0.18 : -0.15));
  }
  // stingray: glides a loop, slows down and settles on the sand, then lifts off again
  {
    const P = 70, A = 0.35, w = 2 * Math.PI / P, s = A * (t - Math.sin(w * t) / w), sp = (1 - Math.cos(w * t)) / 2;
    const ang = s / 9, x = -6 + 9 * Math.cos(ang), z = 74 + 6 * Math.sin(ang * 1.0);
    const fx = -9 * Math.sin(ang), fz = 6 * Math.cos(ang);
    const h = H(x, z) + 0.1 + 1.1 * Math.min(1, Math.max(0, (sp - 0.08) / 0.45)) ** 2;
    put(D, 2, x, h, z, 1.3, fx, 0, fz, s * 3 + t * 0.4, 1, 0.1 * sp);
  }
  // manta pair: slow tilted loops in the kelp clearing
  for (let i = 0; i < 2; i++) {
    const th = t * 0.065 + i * Math.PI, ph = 0.3 + t * 0.008 + i * 0.7;
    const ax = Math.cos(ph), az = Math.sin(ph), bx = -Math.sin(ph) * 0.83, by = 0.55, bz = Math.cos(ph) * 0.83;
    const R = 8.5 + i, cx = 10, cy = -16.5, cz = -70;
    const x = cx + R * (ax * Math.cos(th) + bx * Math.sin(th)), y = cy + R * by * Math.sin(th), z = cz + R * (az * Math.cos(th) + bz * Math.sin(th));
    const fx = -ax * Math.sin(th) + bx * Math.cos(th), fy = by * Math.cos(th), fz = -az * Math.sin(th) + bz * Math.cos(th);
    put(D, 3 + i, x, y, z, 2.0, fx, fy, fz, t * 0.8 + i * 1.7, 2, 0.35);
  }
  // whale shark passing far away in the blue above the deep floor
  {
    const x = -280 + ((t * 0.9 + 270) % 560), y = -66 + 2 * Math.sin(t * 0.03);
    put(D, 5, x, y, -318, 11, 1, 0.02 * Math.cos(t * 0.03), 0.04 * Math.sin(t * 0.05), t * 0.5, 3, 0);
  }
}
