// Large creatures: meshes (built once) + CPU-animated slow paths written into a small instance buffer each frame.
import { mat } from './temple.js';

const part = (g, id, side = 0) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = id; g.uv[i + 1] = side; } return g; };
const ell = (M, rx, ry, rz, x, y, z, sub = 2) => M.translate(M.scale(M.sphere(1, sub), rx, ry, rz), x, y, z);

// turtle, nose +z. parts: 0 shell, 1 skin, 2 front flipper, 3 rear flipper (uv.y = side)
export function turtleGeo(M) {
  const g = [part(ell(M, 0.48, 0.21, 0.62, 0, 0.04, 0, 3), 0), part(ell(M, 0.45, 0.1, 0.58, 0, -0.04, 0), 1),
    part(ell(M, 0.12, 0.1, 0.16, 0, 0.04, 0.76), 1), part(ell(M, 0.1, 0.075, 0.14, 0, 0.0, 0.6), 1)];
  for (const s of [-1, 1]) {
    g.push(part(M.transform(ell(M, 0.38, 0.028, 0.1, 0, 0, 0), mat(0, -0.75 * s, 0.25 * s, s * 0.6, -0.06, 0.12)), 2, s));
    g.push(part(M.transform(ell(M, 0.15, 0.025, 0.09, 0, 0, 0), mat(0, 0.6 * s, 0, s * 0.3, -0.03, -0.58)), 3, s));
  }
  return M.merge(g);
}
// flat lifting body (top + bottom skins meeting in a sharp edge): planform from le(a) / te(a), a = |u| along the half-span.
// uv = (0 top | 3 belly, u)
function wing(M, NX, NZ, half, le, te, th) {
  const pos = [], uv = [], idx = [];
  for (const top of [1, -1]) {
    const b = pos.length / 3;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const u = i / NX * 2 - 1, a = Math.abs(u), v = 0.5 - 0.5 * Math.cos(Math.PI * j / NZ);
      pos.push(u * half, th(a) * Math.sin(Math.PI * v) ** 0.6 * (1.25 - 0.5 * v) * top, te(a) + (le(a) - te(a)) * v); uv.push(top > 0 ? 0 : 3, u);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const p = b + j * (NX + 1) + i, c = p + NX + 1;
      if (top > 0) idx.push(p, c, p + 1, p + 1, c, c + 1); else idx.push(p, p + 1, c, p + 1, c + 1, c);
    }
  }
  return M.computeNormals({ pos: new Float32Array(pos), nrm: new Float32Array(pos.length), uv: new Float32Array(uv), idx: new Uint32Array(idx) });
}
// stingray (round disc) / manta (swept triangular wings, cephalic lobes). parts: 0 top, 3 belly, 1 tail, 2 lobes
export function rayGeo(M, manta) {
  const body = manta
    ? wing(M, 32, 12, 1, (a) => 0.34 - 0.62 * a * a + 0.1 * a ** 3, (a) => -0.42 + 0.34 * a - 0.1 * a * a, (a) => 0.012 + 0.13 * Math.exp(-((a / 0.24) ** 2)) + 0.045 * (1 - a) ** 2)
    : wing(M, 20, 12, 0.62, (a) => 0.5 - 0.75 * a ** 1.7, (a) => -0.45 + 0.19 * a * a, (a) => 0.008 + 0.06 * (1 - a) ** 1.6);
  const parts = [body, part(M.transform(M.cylinder(0.017, 0.002, manta ? 0.62 : 0.9, 6, 4), mat(-Math.PI / 2, 0, 0, 0, 0, -0.33)), 1)];
  if (manta) for (const s of [-1, 1]) parts.push(part(M.transform(ell(M, 0.03, 0.014, 0.11, 0, 0, 0, 2), mat(0.15, -0.3 * s, 0, s * 0.13, -0.03, 0.38)), 2));
  return M.merge(parts);
}
// humpback-like whale, nose +z, length 1. parts 0 body, 1 fins / flukes
export function whaleGeo(M) {
  const body = M.lathe([[0.001, -0.37], [0.016, -0.345], [0.026, -0.27], [0.046, -0.15], [0.074, -0.02], [0.094, 0.1], [0.102, 0.2], [0.098, 0.3],
    [0.084, 0.38], [0.062, 0.44], [0.034, 0.482], [0.001, 0.5]], 20);
  M.transform(body, mat(Math.PI / 2, 0, 0, 0, 0, 0)); M.scale(body, 1.05, 0.95, 1);
  const fluke = wing(M, 16, 4, 0.17, (a) => -0.345 - 0.115 * a ** 1.4, (a) => -0.4 - 0.065 * a ** 0.7, () => 0.007);
  const pec = wing(M, 16, 4, 0.33, (a) => 0.27 - 0.17 * a, (a) => 0.2 - 0.105 * a, () => 0.008);
  for (let i = 0; i < pec.pos.length; i += 3) pec.pos[i + 1] -= 0.035 + 0.32 * Math.abs(pec.pos[i]);
  M.computeNormals(pec);
  const d = { pos: new Float32Array([0, 0.08, -0.08, 0, 0.115, -0.16, 0, 0.07, -0.2]), nrm: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]), uv: new Float32Array(6), idx: new Uint32Array([0, 1, 2]) };
  return M.merge([part(body, 0), part(fluke, 1), part(pec, 1), part(d, 1)]);
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
// D: Float32Array(7*12). H = heightAt
export function animate(D, t, H) {
  // turtles: slow loops around the temple (one glides close past the hero view) / over the spawn sand
  for (let i = 0; i < 2; i++) {
    const w = i ? -0.03 : 0.021, th = t * w + (i ? 2 : 0.769), th2 = th + 0.5 * Math.sign(w);
    const cx = i ? 12 : 0, cz = i ? 78 : 46, rx = i ? 14 : 13, rz = i ? 10 : 19.5, cy = i ? -5.8 : -9;
    const x = cx + rx * Math.cos(th), z = cz + rz * Math.sin(th), y = Math.max(cy + 0.8 * Math.sin(t * 0.037 + i * 2), H(x, z) + 1.4);
    const x2 = cx + rx * Math.cos(th2), z2 = cz + rz * Math.sin(th2), y2 = Math.max(cy + 0.8 * Math.sin((t + 20) * 0.037 + i * 2), H(x2, z2) + 1.4);
    put(D, i, x, y, z, i ? 1 : 1.25, x2 - x, (y2 - y) * 0.5, z2 - z, t * 0.9 + i, 0, (i ? 0.18 : -0.15));
  }
  // stingray: glides a loop low over the sand in front of the temple steps, slows down and settles, then lifts off again
  {
    const P = 70, A = 0.35, w = 2 * Math.PI / P, tt = t + 25, s = A * (tt - Math.sin(w * tt) / w), sp = (1 - Math.cos(w * tt)) / 2;
    const ang = s / 9 - 2.126, x = -2 + 9 * Math.cos(ang), z = 63 + 3.5 * Math.sin(ang);
    const fx = -9 * Math.sin(ang), fz = 3.5 * Math.cos(ang);
    const h = H(x, z) + 0.1 + 0.9 * Math.min(1, Math.max(0, (sp - 0.08) / 0.45)) ** 2;
    put(D, 2, x, h, z, 1.5, fx, (H(x + fx * 0.1, z + fz * 0.1) - H(x, z)) * 10, fz, s * 3 + t * 0.4, 1, 0.1 * sp);
  }
  // manta pair: slow tilted loops in the kelp clearing
  for (let i = 0; i < 2; i++) {
    const th = t * 0.065 + i * 2.6 + 1.1, ph = 0.3 + t * 0.008 + i * 0.7;
    const ax = Math.cos(ph), az = Math.sin(ph), bx = -Math.sin(ph) * 0.83, by = 0.55, bz = Math.cos(ph) * 0.83;
    const R = 9 + i * 1.5, cx = 10, cy = -15.5, cz = -68;
    const x = cx + R * (ax * Math.cos(th) + bx * Math.sin(th)), y = cy + R * by * Math.sin(th), z = cz + R * (az * Math.cos(th) + bz * Math.sin(th));
    const fx = -ax * Math.sin(th) + bx * Math.cos(th), fy = by * Math.cos(th), fz = -az * Math.sin(th) + bz * Math.cos(th);
    put(D, 3 + i, x, y, z, 2.3 + 0.4 * i, fx, fy, fz, t * 0.8 + i * 1.7, 2, 0.35);
  }
  // a whale and her calf circling slowly between the drop-off and the open water above the deep floor
  for (let i = 0; i < 2; i++) {
    const a = Math.PI - 0.25 + (t - 49.5) * 0.0195 - i * 0.1, r = 1 - i * 0.06, c = Math.cos(a), s = Math.sin(a);
    put(D, 5 + i, 2 + 50 * r * s, -67 + 17 * c - i * 3 + 1.2 * Math.sin(t * 0.05 + i), -234 + 62 * r * c, i ? 5.5 : 13,
      50 * c, -17 * s * 0.8, -62 * s, t * (0.45 + 0.25 * i) + i, 3, 0.12);
  }
}
