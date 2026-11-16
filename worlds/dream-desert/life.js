// Dream desert life: glowing lizards and snakes (CPU skeletons -> spline tubes built in the vertex shader), their fading
// footprints and trails, and the strange plants. Everything is an analytic function of time (deterministic shots).
import { ground, DOOR, ARCH, ss } from './geo.js';
import { makeRng } from '../../core/src/math.js';

export const NLZ = 5, NSN = 4, NPR = 14, NL = 13;
const LP = 18, GP = 5, SP = 28, TP = 36, PI = Math.PI;
export const RINGS = [44, 10, 72, 16];                  // bodies, legs, trails, plants
// loop centre x, z, radii x, z, wobble, wobble phase, start angle, speed (m/s), hue, size
const C = [
  [-4, -60, 13, 8, 1.3, 0.5, 2.2, 0.34, 0.48, 1.15],
  [30, -62, 10, 9, 1.0, 2.1, 0.4, 0.3, 0.86, 0.95],
  [-28, -88, 12, 9, 1.2, 4.0, 3.3, 0.36, 0.1, 1.05],
  [44, -100, 12, 10, 1.2, 1.2, 5.1, 0.32, 0.62, 1.25],
  [24, 64, 10, 7, 0.9, 3.0, 1.0, 0.3, 0.3, 0.9],
  [-32, -58, 9, 7, 0.9, 1.0, 0.7, 0.26, 0.92, 1],       // snakes
  [4, -84, 9, 6, 0.8, 2.6, 4.2, 0.24, 0.55, 1.1],
  [-6, -112, 14, 8, 1.4, 0.2, 2.9, 0.28, 0.16, 1.2],
  [-30, 60, 9, 6, 0.8, 5.0, 1.7, 0.25, 0.4, 0.95],
];
const o = new Float64Array(5);                          // x, z, tangent x, z, metres per unit u
function path(c, u) {
  const a = u / c[2] + c[6], p = c[5];
  const dx = -c[2] * Math.sin(a) - 2 * c[4] * Math.sin(2 * a + p), dz = c[3] * Math.cos(a) + 3 * c[4] * Math.cos(3 * a + p), g = Math.hypot(dx, dz);
  o[0] = c[0] + c[2] * Math.cos(a) + c[4] * Math.cos(2 * a + p); o[1] = c[1] + c[3] * Math.sin(a) + c[4] * Math.sin(3 * a + p);
  o[2] = dx / g; o[3] = dz / g; o[4] = g / c[2];
}
// distance travelled: slow, with long near-pauses
const uAt = (c, t, i) => { const w = 0.11 + 0.013 * i, T = t + 40 + i * 17; return c[7] * (T - 0.7 / w * Math.sin(w * T + i)); };
const hue = (h, k, out, q) => { for (let j = 0; j < 3; j++) out[q + j] = k * Math.min(1, Math.max(0, Math.abs(((h + (3 - j) % 3 / 3) % 1 + 1) % 1 * 6 - 3) - 1)); };

// lizard spine: arc position (m), radius, clearance above the sand
const LS = [0, 0.04, 0.1, 0.17, 0.25, 0.33, 0.43, 0.55, 0.68, 0.8, 0.92, 1.03, 1.16, 1.32, 1.5, 1.7, 1.92, 2.15];
const LR = [0.014, 0.042, 0.06, 0.064, 0.05, 0.044, 0.062, 0.082, 0.092, 0.094, 0.086, 0.07, 0.052, 0.04, 0.03, 0.021, 0.013, 0.004];
const LC = [0.15, 0.15, 0.145, 0.14, 0.125, 0.115, 0.105, 0.1, 0.098, 0.096, 0.094, 0.09, 0.075, 0.06, 0.04, 0.028, 0.018, 0.008];

// where lizard i's head is at time t: [x, y, z, heading x, z]
export function lizardAt(i, t) { const c = C[i]; path(c, uAt(c, t, i)); return [o[0], ground(o[0], o[1]), o[1], o[2], o[3]]; }
export function snakeAt(i, t) { return lizardAt(NLZ + i, t); }

export function makeLife(level) {
  const rng = makeRng(4242);
  // ---------------- plants (static tubes)
  const samples = [];
  for (const c of C) for (let k = 0; k < 90; k++) { path(c, k / 90 * 2 * PI * c[2]); samples.push(o[0], o[1]); }
  const spots = [[5, -47, 0], [-14, -47, 1], [-11, 51, 0], [4, 63, 1], [16, -76, 0], [-16, -70, 1], [33, -84, 1]];
  const np = [9, 14, 20][level];
  for (let tries = 0; spots.length < np && tries < 900; tries++) {
    const a = rng() * 2 * PI, r = rng.range(52, 125), x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 - 14;
    if (Math.abs(x) < 46 && Math.abs(z) < 50 || Math.hypot(x - DOOR[0], z - DOOR[2]) < 9 || Math.hypot(x - ARCH[0], z - ARCH[2]) < 13) continue;
    let ok = true;
    for (let k = 0; k < samples.length && ok; k += 2) ok = (samples[k] - x) ** 2 + (samples[k + 1] - z) ** 2 > 16;
    for (const s of spots) ok = ok && Math.hypot(s[0] - x, s[1] - z) > 12;
    if (ok) spots.push([x, z, rng() < 0.4 ? 1 : 0]);
  }
  const sp = [], sh = [], glows = [], halos = [];         // static points, static tube headers, terrain glows, tip halos
  const col = [0, 0, 0];
  for (const s of spots) {
    const x0 = s[0], z0 = s[1], y0 = ground(x0, z0), h = [0.5, 0.86, 0.08, 0.62, 0.33, 0.93][rng.int(6)] + rng.range(-0.03, 0.03), size = rng.range(0.8, 1.3);
    hue(h, 1, col, 0);
    glows.push(x0, y0, z0, 1.5 * size, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0);
    const halo = (x, y, z, r) => halos.push(x, y, z, r, col[0], col[1], col[2], rng() * 6.283);
    if (s[2]) {                                          // lantern cactus: one fat ribbed bottle with a glowing head
      const H = 1.5 * size, st = sp.length / 4;
      for (const [f, r] of [[-0.08, 0.1], [0.14, 0.2], [0.4, 0.235], [0.64, 0.17], [0.8, 0.075], [0.91, 0.15], [1, 0.08], [1.03, 0]]) sp.push(x0 + 0.05 * f * H, y0 + f * H, z0, r * size);
      sh.push(st, 8, RINGS[3], 4, h, rng(), H, 1, 1, 0, 0, 1);
      halo(x0 + 0.045 * H, y0 + 0.92 * H, z0, 0.55 * size);
    } else {                                             // fiddlehead whips curling into glowing bulbs
      for (let k = 0, n = 5 + rng.int(3); k < n; k++) {
        const a = k / n * 6.283 + rng.range(-0.4, 0.4), ox = Math.cos(a), oz = Math.sin(a), Lh = rng.range(0.25, 0.6) * size, Hh = rng.range(0.7, 1.5) * size, rc = rng.range(0.09, 0.14) * size;
        const st = sp.length / 4, bx = x0 + ox * 0.07, bz = z0 + oz * 0.07;
        for (let q = 0; q < 6; q++) { const f = q / 5, d = Lh * f ** 1.6; sp.push(bx + ox * d, y0 - 0.06 + Hh * f + 0.06, bz + oz * d, (0.042 - 0.028 * f) * size); }
        const ex = bx + ox * Lh, ey = y0 + Hh, ez = bz + oz * Lh;
        const hk = [[0.9, 0.45, 0.014], [1.65, 0.1, 0.013], [1.8, -0.9, 0.052], [1.8, -1.35, 0]];
        for (const [d, up, r] of hk) sp.push(ex + ox * d * rc, ey + up * rc, ez + oz * d * rc, r * size);
        halo(ex + ox * 1.8 * rc, ey - 0.9 * rc, ez + oz * 1.8 * rc, 0.26 * size);
        sh.push(st, 10, RINGS[3], 3, h + rng.range(-0.04, 0.04), rng(), Hh, 1, 0, 0, 1, 1);
      }
    }
  }

  // ---------------- buffers
  const nDynPts = NLZ * (LP + 4 * GP) + NSN * (SP + TP), nDynTubes = NLZ * 5 + NSN * 2;
  const pts = new Float32Array(nDynPts * 4 + sp.length), tubes = new Float32Array(nDynTubes * 12 + sh.length);
  pts.set(sp, nDynPts * 4);
  for (let k = 0; k < sh.length; k += 12) sh[k] += nDynPts;
  tubes.set(sh, nDynTubes * 12);
  const tube = (k, start, count, rings, kind, c, len, flat) => tubes.set([start, count, rings, kind, c[8], c[6], len, flat, 0, 1, 0, 1], k * 12);
  for (let i = 0; i < NLZ; i++) {
    const c = C[i];
    tube(i, i * 38, LP, RINGS[0], 0, c, 2.15 * c[9], 0.78);
    for (let l = 0; l < 4; l++) tube(NLZ + NSN + i * 4 + l, i * 38 + LP + l * GP, GP, RINGS[1], 1, c, 0.45, 1);
  }
  for (let i = 0; i < NSN; i++) {
    const c = C[NLZ + i], st = NLZ * 38 + i * (SP + TP);
    tube(NLZ + i, st, SP, RINGS[0], 2, c, 3.2 * c[9], 0.86);
    tube(NLZ + NSN + NLZ * 4 + i, st + SP, TP, RINGS[2], 5, c, TP * 0.3, 0.1);
  }
  const prints = new Float32Array(NLZ * 4 * NPR * 12), PK = new Int32Array(NLZ * 4 * NPR).fill(-1e9), lights = new Float32Array(NL * 8);
  const F = new Float64Array(3);

  // footprint k of leg l of lizard i (cached): fills F with its position
  function plant(i, l, k, S, lat) {
    const s = (i * 4 + l) * NPR + ((k % NPR) + NPR) % NPR, q = s * 12;
    if (PK[s] !== k) {
      const c = C[i];
      path(c, (k - (l === 0 || l === 3 ? 0 : 0.5) + 0.33) * S);
      const sg = l & 1 ? 1 : -1, x = o[0] - o[3] * sg * lat, z = o[1] + o[2] * sg * lat, e = 0.12, y = ground(x, z);
      const nx = ground(x - e, z) - ground(x + e, z), nz = ground(x, z - e) - ground(x, z + e), nl = Math.hypot(nx, 2 * e, nz);
      PK[s] = k;
      prints[q] = x; prints[q + 1] = y; prints[q + 2] = z; prints[q + 3] = 0.055 * c[9] * (l < 2 ? 0.9 : 1.1);
      prints[q + 4] = nx / nl; prints[q + 5] = 2 * e / nl; prints[q + 6] = nz / nl;
      hue(c[8] + 0.06 * Math.sin(k * 0.7), 1, prints, q + 8);
      prints[q + 11] = Math.atan2(o[2] - o[3] * sg * 0.35, o[3] + o[2] * sg * 0.35);
    }
    F[0] = prints[q]; F[1] = prints[q + 1]; F[2] = prints[q + 2];
  }

  function lizard(i, t) {
    const c = C[i], sc = c[9], u = uAt(c, t, i), S = 0.5 * sc;
    path(c, u);
    const g = o[4], turn = 0.2 * Math.sin(t * 0.23 + i * 2) + 0.1 * Math.sin(t * 0.41 + i);
    let q = i * 38 * 4;
    for (let j = 0; j < LP; j++, q += 4) {
      const uj = u - LS[j] * sc / g;
      path(c, uj);
      const sw = (j < 6 ? 0.01 : j < 12 ? 0.03 : 0.03 + (j - 11) * 0.02) * sc * Math.sin(2 * PI * uj / S + i - j * 0.25) + (j < 5 ? turn * (LS[5] - LS[j]) * sc : 0);
      const x = o[0] - o[3] * sw, z = o[1] + o[2] * sw;
      pts[q] = x; pts[q + 1] = ground(x, z) + LC[j] * sc + (j < 4 ? 0.02 * sc * Math.sin(t * 0.3 + i) : 0); pts[q + 2] = z; pts[q + 3] = LR[j] * sc;
      if (j === 8) { const li = i * 8; lights[li] = x; lights[li + 1] = pts[q + 1] + 0.12; lights[li + 2] = z; lights[li + 3] = 0.8 * sc; }
    }
    for (let l = 0; l < 4; l++, q += 20) {
      const front = l < 2, sg = l & 1 ? 1 : -1, uh = u - (front ? 0.47 : 1.03) * sc / g, lat = (front ? 0.3 : 0.33) * sc;
      const cyc = uh / S + (l === 0 || l === 3 ? 0 : 0.5), k = Math.floor(cyc), f = cyc - k;
      for (let m = 0; m < NPR - 1; m++) plant(i, l, k - m, S, lat);
      plant(i, l, k, S, lat);
      let fx = F[0], fy = F[1], fz = F[2];
      if (f > 0.66) {
        let a = (f - 0.66) / 0.34; const lift = Math.sin(PI * a); a = a * a * (3 - 2 * a);
        plant(i, l, k + 1, S, lat);
        fx += (F[0] - fx) * a; fy += (F[1] - fy) * a + 0.07 * sc * lift; fz += (F[2] - fz) * a;
      }
      // print brightness: fresh ones fade in as the foot lifts, old ones fade out
      for (let m = 0, s = (i * 4 + l) * NPR; m < NPR; m++, s++) {
        const age = cyc - PK[s] - 0.5;
        prints[s * 12 + 7] = age < 0 || age > NPR - 2 ? 0 : Math.min(1, age * 3) * (1 - age / (NPR - 2)) ** 1.6;
      }
      path(c, uh);
      const tx = o[2], tz = o[3], ox = -tz * sg, oz = tx * sg;
      const hx = o[0] + ox * 0.06 * sc, hz = o[1] + oz * 0.06 * sc, hy = ground(o[0], o[1]) + (front ? 0.11 : 0.095) * sc;
      fy += 0.035 * sc;
      let ex = fx - hx, ey = fy - hy, ez = fz - hz, d = Math.hypot(ex, ey, ez);
      const L1 = 0.175 * sc, kf = front ? -0.35 : 0.35;
      let bx = ox * 0.5 + tx * kf, by = 0.8, bz = oz * 0.5 + tz * kf;
      const pr = (bx * ex + by * ey + bz * ez) / (d * d);
      bx -= ex * pr; by -= ey * pr; bz -= ez * pr;
      const kn = Math.sqrt(Math.max(L1 * L1 - d * d / 4, 0.0009)) / Math.hypot(bx, by, bz);
      pts[q] = hx; pts[q + 1] = hy; pts[q + 2] = hz; pts[q + 3] = 0.036 * sc;
      pts[q + 4] = hx + ex * 0.5 + bx * kn; pts[q + 5] = hy + ey * 0.5 + by * kn; pts[q + 6] = hz + ez * 0.5 + bz * kn; pts[q + 7] = 0.024 * sc;
      pts[q + 8] = fx; pts[q + 9] = fy; pts[q + 10] = fz; pts[q + 11] = 0.017 * sc;
      const ax = (tx * 0.07 + ox * 0.03) * sc, az = (tz * 0.07 + oz * 0.03) * sc;
      pts[q + 12] = fx + ax; pts[q + 13] = fy - 0.02 * sc; pts[q + 14] = fz + az; pts[q + 15] = 0.022 * sc;
      pts[q + 16] = fx + ax * 1.7; pts[q + 17] = fy - 0.03 * sc; pts[q + 18] = fz + az * 1.7; pts[q + 19] = 0.003;
      const hq = (NLZ + NSN + i * 4 + l) * 12 + 8;
      tubes[hq] = tx; tubes[hq + 1] = 0; tubes[hq + 2] = tz;
    }
    hue(c[8], 1, lights, i * 8 + 4);
  }

  function snake(i, t) {
    const n = NLZ + i, c = C[n], sc = c[9], len = 3.2 * sc, u = uAt(c, t, n);
    path(c, u);
    const g = o[4];
    let q = (NLZ * 38 + i * (SP + TP)) * 4;
    for (let j = 0; j < SP + TP; j++, q += 4) {
      const tr = j >= SP, m = j - SP;
      const s = tr ? len : j / (SP - 1) * len;
      const uj = tr ? (m === 0 ? u - len / g : (Math.floor((u - len / g) / 0.3) - m + 1) * 0.3) : u - s / g;
      path(c, uj);
      const sw = (0.04 + 0.2 * ss(0, 0.9, s)) * sc * Math.sin(2 * PI * uj / 1.5 + n);
      const x = o[0] - o[3] * sw, z = o[1] + o[2] * sw, f = s / len;
      const r = tr ? 0.075 * sc : j === 0 ? 0.012 : j === 1 ? 0.05 * sc : j === 2 ? 0.043 * sc : (0.062 * Math.pow(Math.max(1 - Math.pow(f, 2.6), 0), 0.62) + 0.004) * sc;
      pts[q] = x; pts[q + 1] = ground(x, z) + (tr ? 0.03 : r * 0.8 + 0.09 * sc * ss(0.45, 0, s)); pts[q + 2] = z; pts[q + 3] = r;
      if (j === 5 || j === 17) { const li = (NLZ + i * 2 + (j === 5 ? 0 : 1)) * 8; lights[li] = x; lights[li + 1] = pts[q + 1] + 0.15; lights[li + 2] = z; lights[li + 3] = 0.7 * sc; hue(c[8] + (j === 5 ? 0 : 0.14), 0.8, lights, li + 4); }
    }
  }

  return {
    pts, tubes, prints, lights, glows, halos: new Float32Array(halos), nDynPts, nDynTubes, nPlantTubes: sh.length / 12, nPrints: NLZ * 4 * NPR,
    update(t) { for (let i = 0; i < NLZ; i++) lizard(i, t); for (let i = 0; i < NSN; i++) snake(i, t); },
  };
}
