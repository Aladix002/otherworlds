// Large creatures: meshes (built once) + CPU-animated slow paths written into a small instance buffer each frame.
import { mat } from './temple.js';

const part = (g, id, side = 0) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = id; g.uv[i + 1] = side; } return g; };
const ell = (M, rx, ry, rz, x, y, z, sub = 2) => M.translate(M.scale(M.sphere(1, sub), rx, ry, rz), x, y, z);

// turtle, nose +z. parts: 0 shell (domed carapace, flat plastron), 1 skin, 2 front flippers, 3 rear flippers (uv.y = side), 4 eyes
export function turtleGeo(M) {
  const sh = M.sphere(1, 3), P = sh.pos;
  for (let i = 0; i < P.length; i += 3) {
    const z = P[i + 2], y = P[i + 1];
    P[i] *= 0.46 * (1 - 0.3 * Math.max(-z, 0) ** 2) * (1 - 0.12 * Math.max(z, 0) ** 3); P[i + 1] = y > 0 ? y * 0.25 * (1 + 0.12 * Math.cos(z * 2)) : y * 0.07; P[i + 2] = z * 0.6;
  }
  const fl = (g, id) => { for (let i = 0; i < g.uv.length; i += 2) { g.uv[i] = id; g.uv[i + 1] = Math.sign(g.pos[i / 2 * 3]); } return M.translate(g, 0, -0.02, 0); };
  const le = (a) => 0.42 - 0.55 * a ** 1.8, lr = (a) => -0.3 - 0.45 * a;
  return M.merge([part(M.computeNormals(sh), 0), part(ell(M, 0.1, 0.085, 0.14, 0, 0.03, 0.75), 1), part(ell(M, 0.085, 0.07, 0.16, 0, 0.01, 0.6), 1),
    part(ell(M, 0.022, 0.022, 0.022, 0.085, 0.055, 0.8, 1), 4), part(ell(M, 0.022, 0.022, 0.022, -0.085, 0.055, 0.8, 1), 4),
    fl(wing(M, 16, 3, 0.98, le, (a) => le(a) - 0.04 - 0.22 * Math.sqrt(a) * (1 - a) ** 0.6, () => 0.02), 2),
    fl(wing(M, 8, 3, 0.6, lr, (a) => lr(a) - 0.04 - 0.16 * Math.sqrt(a) * (1 - a) ** 0.5, () => 0.018), 3)]);
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
// whale / dolphin, nose +z, length 1. parts 0 body, 1 fins / flukes
function cet(M, prof, fh, fz, ph, pz, pd, dor) {
  const body = M.lathe(prof, 20);
  M.transform(body, mat(Math.PI / 2, 0, 0, 0, 0, 0)); M.scale(body, 1.05, 0.95, 1);
  const fluke = wing(M, 16, 4, fh, (a) => fz - 0.68 * fh * a ** 1.4, (a) => fz - 0.32 * fh - 0.38 * fh * a ** 0.7, () => 0.007);
  const pec = wing(M, 16, 4, ph, (a) => pz - 0.515 * ph * a, (a) => pz - 0.07 - 0.32 * ph * a, () => 0.008);
  for (let i = 0; i < pec.pos.length; i += 3) pec.pos[i + 1] -= 0.035 + pd * Math.abs(pec.pos[i]);
  M.computeNormals(pec);
  const d = { pos: new Float32Array(dor), nrm: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]), uv: new Float32Array(6), idx: new Uint32Array([0, 1, 2]) };
  return M.merge([part(body, 0), part(fluke, 1), part(pec, 1), part(d, 1)]);
}
export const whaleGeo = (M) => cet(M, [[0.001, -0.37], [0.016, -0.345], [0.026, -0.27], [0.046, -0.15], [0.074, -0.02], [0.094, 0.1], [0.102, 0.2], [0.098, 0.3],
  [0.084, 0.38], [0.062, 0.44], [0.034, 0.482], [0.001, 0.5]], 0.17, -0.345, 0.33, 0.27, 0.32, [0, 0.08, -0.08, 0, 0.115, -0.16, 0, 0.07, -0.2]);
export const dolphinGeo = (M) => cet(M, [[0.001, -0.43], [0.018, -0.4], [0.032, -0.3], [0.066, -0.1], [0.092, 0.08], [0.095, 0.2], [0.08, 0.31], [0.052, 0.37], [0.03, 0.4],
  [0.023, 0.45], [0.014, 0.495], [0.001, 0.505]], 0.14, -0.4, 0.2, 0.2, 0.6, [0, 0.085, 0.03, 0, 0.2, -0.1, 0, 0.08, -0.14]);
const tri = (p, id) => part({ pos: new Float32Array(p), nrm: new Float32Array(p.map((_, i) => +(i % 3 === 0))), uv: new Float32Array(p.length / 3 * 2), idx: new Uint32Array(p.length === 9 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]) }, id);
// lantern fish (a round, friendly angler): parts 0 body, 1 fins + lure stalk, 2 eyes, 3 lure
export function lanternGeo(M) {
  const g = [part(ell(M, 0.3, 0.33, 0.42, 0, 0, 0, 3), 0), tri([0, 0, -0.36, 0, 0.22, -0.68, 0, 0, -0.58, 0, -0.22, -0.68], 1),
    part(M.tube([[0, 0.3, 0.16], [0, 0.52, 0.3], [0, 0.62, 0.5], [0, 0.57, 0.66]], 0.014, 6), 1), part(ell(M, 0.055, 0.055, 0.055, 0, 0.54, 0.7), 3)];
  for (const s of [-1, 1]) g.push(part(ell(M, 0.085, 0.085, 0.085, s * 0.2, 0.1, 0.26), 2), part(M.transform(ell(M, 0.015, 0.08, 0.12, 0, 0, 0, 1), mat(0, 0, s * 0.9, s * 0.31, -0.06, -0.02)), 1));
  return M.merge(g);
}
// octopus sitting on the ground, eyes toward +z: parts 0 mantle + head, 1 arms (uv.y = arm), 2 eyes
export function octoGeo(M) {
  const g = [part(ell(M, 0.2, 0.17, 0.28, 0, 0.24, -0.26, 3), 0), part(ell(M, 0.15, 0.12, 0.15, 0, 0.13, 0, 3), 0)];
  for (const s of [-1, 1]) g.push(part(ell(M, 0.045, 0.045, 0.045, s * 0.11, 0.2, 0.07), 2));
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * 0.7854, p = [];
    for (let j = 0; j <= 8; j++) { const f = j / 8, b = a + 1.5 * f ** 3 * (k % 2 ? 1 : -1), r = 0.08 + 0.78 * f; p.push([r * Math.cos(b), 0.075 - 0.045 * f, r * Math.sin(b)]); }
    g.push(part(M.tube(p, (t) => 0.05 * (1 - t) ** 1.2 + 0.008, 6), 1, k));
  }
  return M.merge(g);
}
// seahorse, upright, snout +z: parts 0 body, 1 fin, 2 eyes
export function seahorseGeo(M) {
  const R = [0.008, 0.011, 0.014, 0.018, 0.028, 0.046, 0.05, 0.036, 0.028, 0.036, 0.042, 0.03, 0.013];
  const g = [part(M.tube([[0, -0.03, 0.05], [0, -0.06, 0], [0, -0.03, -0.05], [0, 0.03, -0.05], [0, 0.1, -0.01], [0, 0.19, 0.035], [0, 0.29, 0.03], [0, 0.37, -0.005], [0, 0.43, -0.01],
    [0, 0.475, 0.02], [0, 0.48, 0.07], [0, 0.455, 0.12], [0, 0.43, 0.19]], (t) => R[Math.round(t * 12)], 8), 0), part(ell(M, 0.012, 0.028, 0.012, 0, 0.52, 0.03, 1), 0),
    tri([0, 0.33, -0.01, 0, 0.27, -0.1, 0, 0.2, 0.0], 1)];
  for (const s of [-1, 1]) g.push(part(ell(M, 0.012, 0.012, 0.012, s * 0.034, 0.478, 0.075, 1), 2));
  return M.merge(g);
}
// little moray: parts 0 body, 2 eyes
export function eelGeo(M) {
  const R = [0.06, 0.066, 0.064, 0.06, 0.07, 0.052, 0.012];
  const g = M.tube([[0, 0, -0.6], [0, 0, -0.35], [0, 0, -0.1], [0, 0, 0.15], [0, 0.01, 0.36], [0, 0.01, 0.46], [0, 0, 0.5]], (t) => R[Math.round(t * 6)], 10);
  return M.merge([part(M.scale(g, 0.8, 1, 1), 0), part(ell(M, 0.016, 0.016, 0.016, 0.042, 0.04, 0.4, 1), 2), part(ell(M, 0.016, 0.016, 0.016, -0.042, 0.04, 0.4, 1), 2)]);
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
// D: Float32Array(25*12). H = heightAt, E = camera eye, W = { eel: [x,y,z, ax,ay,az], oct: [x,y,z] }
// 0-1 turtles, 2 sleeping turtle, 3-6 hatchlings, 7 stingray, 8-9 mantas, 10-11 whales, 12-14 dolphins, 15-17 lantern fish,
// 18 octopus, 19-23 seahorses, 24 eel
const sst = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export const NEST = [22, 74], SEAH = [-20, 72], LAN = [2.2, -96.3, -259, -18, -88, -282, 20, -100, -240];
export function animate(D, t, H, E, W) {
  // turtles: slow loops around the temple (one glides close past the hero view) / over the spawn sand
  for (let i = 0; i < 2; i++) {
    const w = i ? -0.03 : 0.021, th = t * w + (i ? 2 : 0.769), th2 = th + 0.5 * Math.sign(w);
    const cx = i ? 12 : 0, cz = i ? 78 : 46, rx = i ? 14 : 13, rz = i ? 10 : 19.5, cy = i ? -5.8 : -9;
    const x = cx + rx * Math.cos(th), z = cz + rz * Math.sin(th), y = Math.max(cy + 0.8 * Math.sin(t * 0.037 + i * 2), H(x, z) + 1.4);
    const x2 = cx + rx * Math.cos(th2), z2 = cz + rz * Math.sin(th2), y2 = Math.max(cy + 0.8 * Math.sin((t + 20) * 0.037 + i * 2), H(x2, z2) + 1.4);
    put(D, i, x, y, z, i ? 1 : 1.25, x2 - x, (y2 - y) * 0.5, z2 - z, t * 0.9 + i, 0, (i ? 0.18 : -0.15));
  }
  // a turtle asleep beside her nest, and hatchlings paddling from it up toward the light, one after another
  put(D, 2, NEST[0] + 1.3, H(NEST[0] + 1.3, NEST[1] + 0.5) + 0.1, NEST[1] + 0.5, 1.1, 0.75, 0.04, 0.6, 0.25 * Math.sin(t * 0.3), 0, 0);
  for (let i = 0; i < 4; i++) {
    const s = (t * 0.011 + i * 0.25 + 0.1) % 1, x = NEST[0] + 12 * s + 0.6 * Math.sin(s * 20 + i), z = NEST[1] - 32 * s + 0.6 * Math.cos(s * 17 + i);
    put(D, 3 + i, x, Math.min(H(x, z) + 0.12 + 7 * s ** 1.4, -1.6), z, 0.17 * sst(0, 0.04, s) * sst(1, 0.92, s), 0.35 + 0.3 * Math.cos(s * 20 + i), 0.3 * sst(0.02, 0.2, s), -0.94, t * 5 + i, 0, 0);
  }
  // stingray: glides a loop low over the sand in front of the temple steps, slows down and settles, then lifts off again
  {
    const P = 70, A = 0.35, w = 2 * Math.PI / P, tt = t + 25, s = A * (tt - Math.sin(w * tt) / w), sp = (1 - Math.cos(w * tt)) / 2;
    const ang = s / 9 - 2.126, x = -2 + 9 * Math.cos(ang), z = 63 + 3.5 * Math.sin(ang);
    const fx = -9 * Math.sin(ang), fz = 3.5 * Math.cos(ang);
    const h = H(x, z) + 0.1 + 0.9 * Math.min(1, Math.max(0, (sp - 0.08) / 0.45)) ** 2;
    put(D, 7, x, h, z, 1.5, fx, (H(x + fx * 0.1, z + fz * 0.1) - H(x, z)) * 10, fz, s * 3 + t * 0.4, 1, 0.1 * sp);
  }
  // manta pair: slow tilted loops in the kelp clearing
  for (let i = 0; i < 2; i++) {
    const th = t * 0.065 + i * 2.6 + 1.1, ph = 0.3 + t * 0.008 + i * 0.7;
    const ax = Math.cos(ph), az = Math.sin(ph), bx = -Math.sin(ph) * 0.83, by = 0.55, bz = Math.cos(ph) * 0.83;
    const R = 9 + i * 1.5, cx = 10, cy = -15.5, cz = -68;
    const x = cx + R * (ax * Math.cos(th) + bx * Math.sin(th)), y = cy + R * by * Math.sin(th), z = cz + R * (az * Math.cos(th) + bz * Math.sin(th));
    const fx = -ax * Math.sin(th) + bx * Math.cos(th), fy = by * Math.cos(th), fz = -az * Math.sin(th) + bz * Math.cos(th);
    put(D, 8 + i, x, y, z, 2.3 + 0.4 * i, fx, fy, fz, t * 0.9 + i * 1.7, 2, 0.35);
  }
  // a whale and her calf circling slowly between the drop-off and the open water above the deep floor
  for (let i = 0; i < 2; i++) {
    const a = Math.PI - 0.25 + (t - 49.5) * 0.0195 - i * 0.1, r = 1 - i * 0.06, c = Math.cos(a), s = Math.sin(a);
    put(D, 10 + i, 2 + 50 * r * s, -67 + 17 * c - i * 3 + 1.2 * Math.sin(t * 0.05 + i), -234 + 62 * r * c, i ? 5.5 : 13,
      50 * c, -17 * s * 0.8, -62 * s, t * (0.45 + 0.25 * i) + i, 3, 0.12);
  }
  // dolphins: a small pod rolling along just under the surface, in a wide loop over the temple and the spawn sand
  for (let i = 0; i < 3; i++) {
    const th = t * 0.07 + 3.3 - i * 0.12, b = t * 0.45 + i * 1.3, c = Math.cos(th), s = Math.sin(th);
    put(D, 12 + i, -2 + (30 - i * 2.5) * c, -3.3 - i * 0.5 + 0.9 * Math.sin(b), 62 + (26 - i * 2.5) * s, i > 1 ? 1.6 : 2.4 - i * 0.2, -2.1 * s, 0.4 * Math.cos(b), 1.82 * c, t * 2.2 + i * 2, 4, 0.2);
  }
  // lantern fish: hover around their homes in the deep; turn to the swimmer and brighten the lure when approached
  for (let i = 0; i < 3; i++) {
    const a = t * 0.07 + i * 2, b = t * 0.05 + i * 1.3 + 1, x = LAN[i * 3] + 2.5 * Math.sin(a), z = LAN[i * 3 + 2] + 2 * Math.sin(b);
    const y = Math.max(LAN[i * 3 + 1] + 0.6 * Math.sin(t * 0.11 + i), H(x, z) + 2);
    const dx = E[0] - x, dy = E[1] - y, dz = E[2] - z, dl = Math.hypot(dx, dy, dz) || 1, p = sst(9, 3, dl), q = (1 - p) / 0.2;
    put(D, 15 + i, x, y, z, 0.9 - i * 0.12, 0.175 * Math.cos(a) * q + dx / dl * p, dy / dl * p * 0.6, 0.1 * Math.cos(b) * q + dz / dl * p, t * 1.6 + i, 5 + 0.45 * (0.25 + 0.75 * p), 0);
  }
  // octopus on the temple steps (flushes through its colours faster when the swimmer is near)
  put(D, 18, W.oct[0], W.oct[1], W.oct[2], 0.85, 0.3, 0, 1, t, 6 + 0.45 * sst(8, 2.5, Math.hypot(E[0] - W.oct[0], E[1] - W.oct[1], E[2] - W.oct[2])), 0);
  // seahorses holding on in the seagrass
  for (let i = 0; i < 5; i++) {
    const x = SEAH[0] + 1.5 * Math.cos(i * 2.4) * (0.4 + 0.15 * i), z = SEAH[1] + 1.5 * Math.sin(i * 2.4) * (0.4 + 0.15 * i), a = i * 1.9 + 0.5 * Math.sin(t * 0.1 + i);
    put(D, 19 + i, x, H(x, z) + 0.3 + 0.09 * i + 0.05 * Math.sin(t * 0.6 + i * 2), z, 0.7 + 0.08 * i, Math.sin(a), 0, Math.cos(a), i * 0.21, 7, 0.1 * Math.sin(t * 0.5 + i));
  }
  // moray peeking from the broken pithos: stretches out now and then, shrinks back when the swimmer comes close
  {
    const e = W.eel, d = Math.hypot(E[0] - e[0], E[1] - e[1], E[2] - e[2]);
    put(D, 24, e[0], e[1], e[2], 1.3, e[3], e[4], e[5], (0.66 + 0.34 * Math.sin(t * 0.17)) * (0.3 + 0.7 * sst(2.2, 5.5, d)), 8, 0);
  }
}
