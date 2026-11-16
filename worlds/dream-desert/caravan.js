// The star caravan: camels and fennec foxes drawn as living stardust. Each animal is a skeleton of tapered capsules
// (bones) animated analytically on the CPU (a handful of joints per animal); thousands of static star particles are
// pinned to the bones (bone, t, direction, radius) and placed in the vertex shader, so the walk costs nothing per
// particle. A few bright constellation stars mark the joints, faint nebula blobs fill the bodies, and a stateless
// stardust trail sheds off feet, tail and back. Deterministic in time; zero per-frame allocation.
export const CZ = -135, CBASE = 36, CV = 1.4, CWRAP = 250;
// animals: type (0 camel, 1 fox), x offset in the line, size (m), phase, depth offset, lift
const AN = [
  [1, 80, 14.5, 0.0, -4, 4],
  [0, 50, 19, 0.2, 0, 0],
  [0, 17, 20, 0.55, 5, 2],
  [0, -16, 19, 0.85, -3, -1],
  [0, -49, 18.5, 0.4, 4, 3],
  [1, -80, 14, 0.3, 2, 6],
];
export const NANI = AN.length, MAXB = 20, NE = 6;
// bones [joint a, joint b, radius a, radius b] (radii in body lengths)
const CB = [[23, 24, 0.19, 0.18], [25, 3, 0.25, 0.17], [23, 2, 0.17, 0.1], [24, 4, 0.17, 0.1], [4, 5, 0.14, 0.1], [5, 6, 0.1, 0.08], [6, 7, 0.08, 0.075], [7, 8, 0.08, 0.05],
  [1, 0, 0.035, 0.015], [2, 1, 0.08, 0.03]];
const FB = [[25, 26, 0.1, 0.115], [26, 5, 0.115, 0.09], [5, 4, 0.09, 0.07], [4, 1, 0.07, 0.065], [1, 0, 0.06, 0.02], [1, 2, 0.04, 0.004], [1, 3, 0.04, 0.004], [25, 7, 0.1, 0.07],
  [7, 8, 0.07, 0.06], [8, 9, 0.08, 0.15], [9, 10, 0.15, 0.03]];
for (let l = 0; l < 4; l++) {
  CB.push([11 + l * 3, 12 + l * 3, 0.065, 0.05], [12 + l * 3, 13 + l * 3, 0.028, 0.026]);
  FB.push([13 + l * 3, 14 + l * 3, 0.045, 0.03], [14 + l * 3, 15 + l * 3, 0.03, 0.018]);
}
const BONES = [CB, FB];
// constellation stars: [joint, radius (m per size unit), brightness]
const CS = [[3, 0.06, 2.0], [4, 0.04, 1.3], [2, 0.04, 1.3], [7, 0.045, 1.8], [8, 0.025, 1], [0, 0.02, 0.9], [9, 0.022, 1], [10, 0.022, 1], [6, 0.022, 1],
  [12, 0.03, 1.2], [15, 0.03, 1.2], [18, 0.03, 1.2], [21, 0.03, 1.2], [13, 0.024, 1.1], [16, 0.024, 1.1], [19, 0.024, 1.1], [22, 0.024, 1.1]];
const FS = [[0, 0.03, 1.1], [1, 0.045, 1.8], [2, 0.026, 1.1], [3, 0.026, 1.1], [5, 0.04, 1.4], [7, 0.04, 1.4], [10, 0.036, 1.4], [9, 0.024, 0.9],
  [15, 0.022, 1], [18, 0.022, 1], [21, 0.022, 1], [24, 0.022, 1]];
const STARS = [CS, FS];
const NEBB = [[0, 2, 3, 4, 5, 6], [0, 1, 3, 9, 10]];                // bones that get a faint nebula blob
const EMIT = [[13, 16, 19, 22, 0, 3], [15, 18, 21, 24, 10, 6]];    // trail emitters: hooves, tail tip, back
export const MAXPTS = AN.length * 40 + 8;
export const caravanPts = new Float32Array(MAXPTS * 8);
export const caravanBones = new Float32Array((NANI * MAXB * 2 + NANI * NE) * 4);
export let nCaravanPts = 0;
const EM0 = NANI * MAXB * 2;
const J = new Float64Array(64 * 3);
const GOLD = [1.0, 0.8, 0.42], TEAL = [0.22, 0.86, 0.78], ROSE = [1.0, 0.45, 0.68], PALE = [1.0, 0.93, 0.78], MINT = [0.72, 1.0, 0.92];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAUF = Math.PI * 2;
export const CX0 = -30;
export const caravanX = (t) => ((CX0 + CV * t + 400) % 800 + 800) % 800 - 400;
function leg(q, hx, hy, hz, ph, A, lift, L1, Lt, bend) {          // hip, knee, hoof of one leg: 2-bone IK in the vertical plane
  const c = Math.max(0, Math.cos(ph)), fx = hx + A * Math.sin(ph), fy = hy - Lt + lift * c * c;
  const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy), h = Math.sqrt(Math.max(L1 * L1 - d * d / 4, 1e-4));
  const nx = -dy / d * bend, ny = dx / d * bend;
  J[q] = hx; J[q + 1] = hy; J[q + 2] = hz;
  J[q + 3] = hx + dx * 0.5 + nx * h; J[q + 4] = hy + dy * 0.5 + ny * h; J[q + 5] = hz;
  J[q + 6] = fx; J[q + 7] = fy; J[q + 8] = hz;
}
const set = (i, x, y, z = 0) => { J[i * 3] = x; J[i * 3 + 1] = y; J[i * 3 + 2] = z; };
function camel(ph) {
  const s = Math.sin, tail = s(ph * 0.5 - 0.5), b = 0.012 * s(2 * ph), hb = 0.03 * s(ph + 0.8), hb2 = 0.014 * s(ph * 0.5 + 2.0);
  set(0, -0.6 - 0.03 * tail, 0.5 + b, 0.03 * tail); set(1, -0.54, 0.78 + b); set(2, -0.5, 0.82 + b); set(3, -0.1, 1.1 + b); set(4, 0.3, 0.84 + b);
  set(5, 0.4, 0.93 + hb * 0.3 + b); set(6, 0.46, 1.1 + hb * 0.6 + b); set(7, 0.58 + hb2, 1.19 + hb + b); set(8, 0.82 + hb2, 1.02 + hb * 0.8 + b);
  set(23, -0.38, 0.74 + b); set(24, 0.27, 0.75 + b); set(25, -0.12, 0.88 + b);
  for (let l = 0; l < 4; l++) {
    const front = l >> 1, near = l & 1;
    leg(11 * 3 + l * 9, front ? 0.3 : -0.4, 0.58 + b, near ? 0.08 : -0.08, ph + (near ? 0 : Math.PI) + (front ? 0.55 : 0), 0.09, 0.07, 0.29, 0.56, front ? 1 : -1);
  }
}
function fox(ph) {
  const s = Math.sin, b = 0.016 * s(2 * ph), hd = 0.015 * s(ph);
  set(0, 0.52, 0.4 + hd + b); set(1, 0.4, 0.47 + hd + b); set(2, 0.35, 0.76 + 0.012 * s(ph + 1) + b, -0.04); set(3, 0.45, 0.74 + 0.012 * s(ph + 1) + b, 0.04);
  set(4, 0.27, 0.5 + b); set(5, 0.16, 0.47 + b); set(6, -0.06, 0.49 + b); set(7, -0.28, 0.46 + b);
  set(8, -0.36, 0.44 + b); set(9, -0.62, 0.43 + 0.03 * s(ph * 0.5) + b); set(10, -0.9, 0.3 + 0.05 * s(ph * 0.5 + 1.0) + b, 0.05 * s(ph * 0.5 + 0.5));
  set(11, -0.27, 0.38 + b); set(12, 0.15, 0.38 + b); set(25, -0.2, 0.45 + b); set(26, 0.1, 0.47 + b);
  for (let l = 0; l < 4; l++) {
    const front = l >> 1, near = l & 1;
    leg(13 * 3 + l * 9, front ? 0.15 : -0.27, 0.39 + b, near ? 0.05 : -0.05, ph + (front === near ? 0 : Math.PI), 0.12, 0.09, 0.21, 0.375, front ? 1 : -1);
  }
}
// static particle attributes: a = (bone slot, t, radial fraction, seed), b = (direction xyz, size; negative = fox)
export function buildParticles(level, rng) {
  const NC = [3000, 4800, 6600][level], NF = [1500, 2400, 3300][level];
  const n = AN.reduce((s, a) => s + (a[0] ? NF : NC), 0), out = new Float32Array(n * 8);
  camel(0); fox(0);
  let o = 0;
  const gauss = () => rng.gauss();
  for (let a = 0; a < AN.length; a++) {
    const T = AN[a][0], B = BONES[T], N = T ? NF : NC, w = new Float64Array(B.length);
    (T ? fox : camel)(0);
    let tot = 0;
    for (let i = 0; i < B.length; i++) {
      const e = B[i], len = Math.hypot(J[e[0] * 3] - J[e[1] * 3], J[e[0] * 3 + 1] - J[e[1] * 3 + 1], J[e[0] * 3 + 2] - J[e[1] * 3 + 2]), r = (e[2] + e[3]) / 2;
      tot += w[i] = (len + 1.4 * r) * r * (0.6 + 0.4 * Math.sqrt(r * 8));
    }
    for (let k = 0; k < N; k++, o += 8) {
      let u = rng() * tot, bi = 0;
      while (bi < B.length - 1 && u > w[bi]) u -= w[bi++];
      let x = gauss(), y = gauss(), z = gauss();
      const dorsal = rng() < 0.16 && bi < (T ? 4 : 4);
      if (dorsal) y += 1.4 + Math.abs(gauss());
      const l = Math.hypot(x, y, z) || 1;
      const surf = rng() < 0.72;
      out.set([a * MAXB + bi, rng(), surf ? 1 - 0.3 * rng() * rng() : Math.cbrt(rng()) * 0.85, rng(), x / l, y / l, z / l, (0.7 + 0.7 * rng()) * (T ? -1 : 1)], o);
    }
  }
  return { data: out, count: n };
}
// trail instances: (animal, emitter, seed, rate)
export function buildTrail(level, rng) {
  const per = [34, 56, 80][level], out = new Float32Array(AN.length * NE * per * 4 * 3);
  let o = 0, n = 0;
  for (let a = 0; a < AN.length; a++) for (let e = 0; e < NE; e++) {
    const c = e < 4 ? per : e === 4 ? per * 3 : per * 3;
    for (let k = 0; k < c; k++, o += 4, n++) out.set([a, e, rng(), rng()], o);
  }
  return { data: out.subarray(0, o), count: n };
}
const C0 = [0, 0, 0];
export function updateCaravan(t) {
  let np = 0;
  const P = caravanPts, Bn = caravanBones;
  for (let a = 0; a < AN.length; a++) {
    const A = AN[a], T = A[0], S = A[2], X = caravanX(t) + A[1];
    const Y = CBASE + A[5] + 1.2 * Math.sin(t * 0.04 + a * 1.7), Z = CZ + A[4];
    const env = ss(235, 185, Math.abs(X)), ph = TAUF * (CV * t / (S * (T ? 0.78 : 0.62)) + A[3]);
    if (T) fox(ph); else camel(ph);
    const B = BONES[T];
    let q = a * MAXB * 8;
    for (let i = 0; i < MAXB; i++, q += 8) {
      if (i >= B.length) { Bn[q + 3] = 0; Bn[q + 7] = 0; continue; }
      const e = B[i], ja = e[0] * 3, jb = e[1] * 3;
      Bn[q] = X + J[ja] * S; Bn[q + 1] = Y + J[ja + 1] * S; Bn[q + 2] = Z + J[ja + 2] * S; Bn[q + 3] = e[2] * S * env;
      Bn[q + 4] = X + J[jb] * S; Bn[q + 5] = Y + J[jb + 1] * S; Bn[q + 6] = Z + J[jb + 2] * S; Bn[q + 7] = e[3] * S * env;
    }
    q = (EM0 + a * NE) * 4;
    for (let e = 0; e < NE; e++, q += 4) { const j = EMIT[T][e] * 3; Bn[q] = X + J[j] * S; Bn[q + 1] = Y + J[j + 1] * S; Bn[q + 2] = Z + J[j + 2] * S; Bn[q + 3] = env * S; }
    const tw = a * 1.37, stars = STARS[T];
    for (let i = 0; i < stars.length; i++, np++) {
      const e = stars[i], o = np * 8, j = e[0] * 3, pale = T ? MINT : PALE;
      P[o] = X + J[j] * S; P[o + 1] = Y + J[j + 1] * S; P[o + 2] = Z + J[j + 2] * S; P[o + 3] = e[1] * S;
      P[o + 4] = pale[0] * e[2] * env; P[o + 5] = pale[1] * e[2] * env; P[o + 6] = pale[2] * e[2] * env; P[o + 7] = tw + i * 0.61;
    }
    const nb = NEBB[T];
    for (let i = 0; i < nb.length; i++, np++) {                      // faint nebula body fill
      const e = B[nb[i]], o = np * 8, ja = e[0] * 3, jb = e[1] * 3, c = (i + a) % 3 === 0 ? TEAL : (i + a) % 3 === 1 ? ROSE : GOLD;
      P[o] = X + (J[ja] + J[jb]) * 0.5 * S; P[o + 1] = Y + (J[ja + 1] + J[jb + 1]) * 0.5 * S; P[o + 2] = Z + (J[ja + 2] + J[jb + 2]) * 0.5 * S;
      P[o + 3] = -(e[2] + e[3]) * 0.5 * S * 2.0;
      const k = 0.2 * env;
      P[o + 4] = c[0] * k; P[o + 5] = c[1] * k; P[o + 6] = c[2] * k; P[o + 7] = tw + i * 0.9;
    }
  }
  nCaravanPts = np;
}
