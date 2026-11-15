// Crystal cave: layout, SDF, surface-nets mesher, crystal placement and vertex light bake. All CPU, at load time.
import { hash3i, u2f, fbm2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';

export const WL = -0.55, POOL = [40, -14], DOOR = [-42, 0.3, -10];
// moonlight shaft axis: top (inside the chimney) -> floor
export const SHAFT = [12.33, 44, -48.5, 7.4, 0, -44.8];
// air chambers (ellipsoids cx,cy,cz, rx,ry,rz): 0 hall, 1 pool, 2 geode alcove, 3 shaft, 4 door
export const CH = [[0, 8, 0, 27, 12, 21], [40, 5, -14, 17, 9, 15], [-6, 3.5, 30, 8, 5.5, 7.5], [6, 8, -44, 13, 11, 12], [-40, 4.5, -10, 11, 7, 10.5]];
// tunnels (capsules ax,ay,az, bx,by,bz, r); the last one is the chimney
const TU = [[22, 2.5, -6, 30, 2.5, -10, 4.2], [-3, 2.5, 17, -5, 2.5, 26, 3.4], [3, 3, -16, 5, 3, -36, 3.8], [-22, 3, -5, -32, 3, -9, 3.7],
  [30, 3, -24, 16, 3, -40, 3.3], [9, 14, -46, 13, 50, -49, 3.3]];
const COLS = [[9, -10, 1.0, 9, 10], [14, 12, 0.8, 8, 9], [-16, 9, 0.85, 8, 9], [33, -23, 0.6, 5, 7]];   // x, z, r, ymid, halfH
const STAL = [];                                                                                  // x, ytip, z, slope
const CAPS = [];                                                                                  // crystal collision capsules

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); fz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = u2f(hash3i(ix, iy, iz)), b = u2f(hash3i(ix + 1, iy, iz)), c = u2f(hash3i(ix, iy + 1, iz)), d = u2f(hash3i(ix + 1, iy + 1, iz));
  const e = u2f(hash3i(ix, iy, iz + 1)), f = u2f(hash3i(ix + 1, iy, iz + 1)), g = u2f(hash3i(ix, iy + 1, iz + 1)), h = u2f(hash3i(ix + 1, iy + 1, iz + 1));
  const m0 = a + (b - a) * fx, m1 = c + (d - c) * fx, m2 = e + (f - e) * fx, m3 = g + (h - g) * fx;
  const n0 = m0 + (m1 - m0) * fy, n1 = m2 + (m3 - m2) * fy;
  return (n0 + (n1 - n0) * fz) * 2 - 1;
}

// floor heightfield (WGSL twin in common.wgsl)
export function floorY(x, z) {
  let h = 0.2 + 0.75 * fbm2(x * 0.045, z * 0.045, 3);
  const dp = Math.hypot(x - POOL[0], z - POOL[1]);
  h += (0.1 - h) * 0.7 * (1 - ss(9, 15, dp));
  h += -1.2 * (1 - ss(4, 10.5, dp)) + 0.3 * ss(8, 11.5, dp) * (1 - ss(11.5, 15, dp));
  const dd = Math.hypot(x - DOOR[0], z - DOOR[2]);
  return h + (DOOR[1] - h) * (1 - ss(2.6, 5.5, dd));
}

function blob(x, y, z) {                                   // negative inside the air volume
  let d = 1e9;
  for (let i = 0; i < CH.length; i++) {
    const c = CH[i], px = (x - c[0]) / c[3], py = (y - c[1]) / c[4], pz = (z - c[2]) / c[5];
    const k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / c[3], qy = py / c[4], qz = pz / c[5], k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    d = smin(d, k1 < 1e-6 ? -c[4] : k0 * (k0 - 1) / k1, 3);
  }
  for (let i = 0; i < TU.length; i++) {
    const c = TU[i], bx = c[3] - c[0], by = c[4] - c[1], bz = c[5] - c[2], ax = x - c[0], ay = y - c[1], az = z - c[2];
    const h = Math.min(1, Math.max(0, (ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz)));
    d = smin(d, Math.hypot(ax - bx * h, ay - by * h, az - bz * h) - c[6], 2.5);
  }
  return d;
}
function solids(x, y, z) {
  let s = 1e9;
  for (let i = 0; i < COLS.length; i++) {
    const c = COLS[i], t = (y - c[3]) / c[4];
    s = Math.min(s, Math.hypot(x - c[0], z - c[1]) - c[2] * (1 + 1.6 * t * t));
  }
  if (y > 4) for (let i = 0; i < STAL.length; i++) {
    const c = STAL[i], dx = x - c[0], dz = z - c[2], dy = y - c[1];
    s = Math.min(s, dy > 0 ? (Math.hypot(dx, dz) - dy * c[3] - 0.07) * 0.97 : Math.hypot(dx, dy, dz) - 0.07);
  }
  return s;
}
// distance to rock, positive in air
export function sdfCave(x, y, z) {
  let d = blob(x, y, z);
  if (d > -5 && d < 5) d += 1.1 * vn3(x * 0.11, y * 0.11, z * 0.11) + 0.45 * vn3(x * 0.31 + 7, y * 0.31, z * 0.31) + 0.16 * vn3(x * 0.87, y * 0.87 + 3, z * 0.87);
  return smin(smin(-d, solids(x, y, z), 0.8), y - floorY(x, z), 0.9);
}
const sdfFast = (x, y, z) => -blob(x, y, z);
export function sdfWorld(x, y, z) {
  let d = sdfCave(x, y, z);
  for (let i = 0; i < CAPS.length; i += 7) {
    const bx = CAPS[i + 3] - CAPS[i], by = CAPS[i + 4] - CAPS[i + 1], bz = CAPS[i + 5] - CAPS[i + 2], ax = x - CAPS[i], ay = y - CAPS[i + 1], az = z - CAPS[i + 2];
    const h = Math.min(1, Math.max(0, (ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz)));
    d = Math.min(d, Math.hypot(ax - bx * h, ay - by * h, az - bz * h) - CAPS[i + 6]);
  }
  return d;
}

// ---------------------------------------------------------------- crystals + lights
const COLORS = [[0.52, 0.2, 1.0], [0.12, 0.72, 1.0], [0.5, 0.74, 1.0], [0.95, 0.4, 0.85], [0.42, 0.3, 1.0]];   // violet, cyan, white, rose, indigo
const g3 = [0, 0, 0];
function grad(x, y, z) {
  const e = 0.2, gx = sdfCave(x + e, y, z) - sdfCave(x - e, y, z), gy = sdfCave(x, y + e, z) - sdfCave(x, y - e, z), gz = sdfCave(x, y, z + e) - sdfCave(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1; g3[0] = gx / l; g3[1] = gy / l; g3[2] = gz / l; return g3;
}
function march(ox, oy, oz, dx, dy, dz, maxT) {             // -> t of the first rock hit or -1
  let t = 0;
  for (let i = 0; i < 160 && t < maxT; i++) {
    const s = sdfCave(ox + dx * t, oy + dy * t, oz + dz * t);
    if (s < 0.04) return t;
    t += Math.max(s * 0.6, 0.06);
  }
  return -1;
}

export function placeCrystals(level) {
  const rng = makeRng(90210), inst = [], lights = [];
  let cid = 0;
  // stalactites first (they are part of the SDF)
  for (let i = 0; i < 46; i++) {
    const ci = [0, 0, 0, 0, 1, 1, 3, 4][rng.int(8)], c = CH[ci], a = rng() * 6.283, u = Math.sqrt(rng()) * 0.8;
    const x = c[0] + Math.cos(a) * u * c[3], z = c[2] + Math.sin(a) * u * c[5], top = c[1] + c[4] * Math.sqrt(1 - u * u);
    if (Math.hypot(x - 9, z + 46) < 6.5) continue;
    STAL.push([x, top - rng.range(1.2, ci ? 3 : 5.5), z, rng.range(0.12, 0.2)]);
  }
  const add = (px, py, pz, ax, ay, az, len, rad, col, glow, type, flat, id) => {
    let qx = az, qy = 0, qz = -ax, qw = 1 + ay;
    if (qw < 1e-4) { qx = 1; qz = 0; qw = 0; }
    const l = Math.hypot(qx, qz, qw); qx /= l; qz /= l; qw /= l;
    const r = rng() * 6.283, s = Math.sin(r / 2), c = Math.cos(r / 2);          // roll about local Y: q * (0, s, 0, c)
    inst.push(px, py, pz, len, qx * c - qz * s, qw * s + qy * c, qz * c + qx * s, qw * c - qy * s,
      col[0], col[1], col[2], glow, rad, rng(), type, rng() * 6.283, 0, 0, 0, flat, id);
    if (rad > 0.28) CAPS.push(px, py, pz, px + ax * len, py + ay * len, pz + az * len, rad * 0.85);
  };
  const light = (x, y, z, r, col, I, range, kind, ph) => lights.push(x, y, z, r, col[0] * I, col[1] * I, col[2] * I, range, ph ?? rng() * 6.283, cid, kind, 0);
  const dir = [0, 0, 0];
  const jitter = (nx, ny, nz, s) => {
    let x = nx + s * rng.gauss() * 0.6, y = ny + s * rng.gauss() * 0.6, z = nz + s * rng.gauss() * 0.6;
    const l = Math.hypot(x, y, z) || 1; dir[0] = x / l; dir[1] = y / l; dir[2] = z / l; return dir;
  };
  // a cluster of crystal points radiating from a surface point
  const cluster = (px, py, pz, nx, ny, nz, size, n, ci, spread, I) => {
    cid++;
    const col = COLORS[ci], ph = rng() * 6.283;
    // tangent frame
    let tx = ny, ty = -nx, tz = 0; if (Math.abs(nz) > 0.9) { tx = 0; ty = nz; tz = -ny; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    for (let i = 0; i < n; i++) {
      const hero = i === 0, k = hero ? 1 : 0.3 + 0.6 * Math.pow(rng(), 1.4), len = size * k;
      const d = jitter(nx, ny, nz, hero ? spread * 0.3 : spread), a = rng() * 6.283, o = hero ? 0 : size * 0.38 * Math.sqrt(rng());
      const ox = (tx * Math.cos(a) + bx * Math.sin(a)) * o, oy = (ty * Math.cos(a) + by * Math.sin(a)) * o, oz = (tz * Math.cos(a) + bz * Math.sin(a)) * o;
      // lean outward from the cluster centre
      let ax = d[0] + ox / size * 1.1, ay = d[1] + oy / size * 1.1, az = d[2] + oz / size * 1.1; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      const rad = len * rng.range(0.1, 0.16) + 0.015;
      add(px + ox - ax * len * 0.18 - nx * 0.05, py + oy - ay * len * 0.18 - ny * 0.05, pz + oz - az * len * 0.18 - nz * 0.05, ax, ay, az, len * 1.18, rad,
        col, rng.range(0.75, 1.25) * (ci === 2 ? 0.75 : 1), 0, rng.range(0.8, 1), cid);
    }
    if (I > 0) light(px + nx * size * 0.55, py + ny * size * 0.55, pz + nz * size * 0.55, 0.6 + size * 0.6, col, I, 7 + size * 6, 0, ph);
  };
  const scatter = (ci, n, s0, s1, pal, oj) => {
    const c = CH[ci];
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const a = rng() * 6.283, dy = rng.range(-0.38, 0.85), h = Math.sqrt(1 - dy * dy);
      const ox = c[0] + rng.range(-oj, oj), oz = c[2] + rng.range(-oj, oj), oy = c[1] - 1, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      const t = march(ox, oy, oz, dx, dy, dz, 45);
      if (t < 0) continue;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      if (Math.hypot(px - DOOR[0], pz - DOOR[2]) < 4.5 || py > 22 || Math.hypot(px - 9, pz + 46) < 4 && py > 12) continue;
      if (-blob(px, py, pz) > 2.2) continue;                               // on a stalactite or column: skip
      const g = grad(px, py, pz), size = rng.range(s0, s1) * (0.6 + 0.4 * rng());
      cluster(px, py, pz, g[0], g[1], g[2], size, 5 + rng.int(7), pal[rng.int(pal.length)], 0.75, 1.3 + size * 0.5);
      i++;
    }
  };
  scatter(0, 26, 2.0, 5.0, [0, 0, 0, 4, 2, 1, 0, 3], 9);
  scatter(1, 16, 0.9, 2.6, [1, 1, 1, 2, 0, 1], 5);
  scatter(3, 9, 0.9, 2.4, [2, 1, 2, 4], 4);
  scatter(4, 9, 0.8, 2.2, [0, 3, 0, 4], 3);

  // hero amethysts standing on the hall floor, off the walkways
  for (const h of [[10, 9.5, 0, 3.2], [3, -11.5, 0, 2.7], [17, -8.5, 4, 2.8], [-2, 11.5, 3, 2.1], [-15, -2.5, 0, 2.3], [-6, -10, 4, 1.8]])
    cluster(h[0], floorY(h[0], h[1]), h[1], 0, 1, 0, h[3], 8 + rng.int(4), h[2], 0.6, 2.4);
  // big cyan / white clusters standing around the pool rim (they double in the water)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + rng.range(-0.3, 0.3) + 0.4, r = rng.range(7.6, 9.2), x = POOL[0] + Math.cos(a) * r, z = POOL[1] + Math.sin(a) * r;
    cluster(x, floorY(x, z), z, 0, 1, 0, rng.range(1.1, 2.4), 6 + rng.int(5), i % 3 === 2 ? 2 : 1, 0.6, 1.8);
  }
  // geode alcove: dense amethyst lining
  {
    const c = CH[2], n = [420, 700, 900][level];
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, dy = rng.range(-0.42, 0.95), h = Math.sqrt(1 - dy * dy), dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      const t = march(c[0], c[1] - 0.5, c[2], dx, dy, dz, 14);
      if (t < 0) continue;
      const px = c[0] + dx * t, py = c[1] - 0.5 + dy * t, pz = c[2] + dz * t;
      if (pz < 24.8 || py < 0.75) continue;
      const g = grad(px, py, pz), size = rng.range(0.55, 1.5) * (py > 5 ? 1.25 : 1);
      const lit = i % 9 === 0;
      cluster(px, py, pz, g[0], g[1], g[2], size, 4 + rng.int(4), rng() < 0.8 ? 0 : rng() < 0.5 ? 4 : 3, 0.4, lit ? 0.65 : 0);
      if (lit) lights[lights.length - 5] = 5.5;
    }
  }
  // door dressing: small crystals at the base of the frame (door yaw = PI/2, its lateral axis is z)
  for (const s of [-1, 1]) {
    const x = DOOR[0] - 0.25, z = DOOR[2] + s * 1.2;
    cluster(x, floorY(x, z) + 0.02, z, 0, 1, 0, 0.55, 7, s < 0 ? 0 : 1, 0.9, 1.3);
    cluster(x + 0.75, floorY(x + 0.75, z + s * 0.5) + 0.02, z + s * 0.5, 0, 1, 0, 0.28, 4, s < 0 ? 4 : 0, 1.0, 0);
  }
  // giant selenite beams: [base x, z, dir x, y, z, radius, free-length factor (0 = span to the rock)]
  const BEAMS = [[-14, -9, 0.8, 0.55, 0.3, 1.1, 0], [12, -13, -0.5, 0.6, 0.62, 0.9, 0], [17, 10, -0.75, 0.5, -0.42, 1.3, 0], [-10, 12.5, 0.55, 0.75, -0.35, 0.8, 0.7],
    [2, -15, 0.15, 0.9, 0.4, 0.7, 0], [20, -3, -0.3, 0.8, 0.5, 1.0, 0.6], [-19, 3, 0.6, 0.45, -0.65, 0.9, 0], [7, 14, 0.9, 0.3, -0.33, 0.75, 0],
    [49, -25, -0.6, 0.55, 0.55, 0.8, 0], [47, -3, -0.4, 0.5, -0.75, 0.6, 0.75], [-2, -51, 0.3, 0.75, 0.5, 0.7, 0], [-47, -4, 0.5, 0.75, -0.4, 0.45, 0.8]];
  const white = [0.66, 0.82, 1.0], bl = [0.5, 0.58, 1.0];
  for (const b of BEAMS) {
    cid++;
    const l0 = Math.hypot(b[2], b[3], b[4]), dx = b[2] / l0, dy = b[3] / l0, dz = b[4] / l0, by = floorY(b[0], b[1]) - 0.8;
    const beam = (dx, dy, dz, rad, free, ox, oz) => {
      const x = b[0] + ox, z = b[1] + oz;
      let t = march(x + dx * 3, by + dy * 3, z + dz * 3, dx, dy, dz, 40);
      t = t < 0 ? 30 : t + 3;
      const len = free ? Math.min(t * free, t - 1.5) : t + rad * 1.5;
      add(x, by, z, dx, dy, dz, len, rad, white, rng.range(0.5, 0.7), 1, rng.range(0.55, 0.85), cid);
      if (rad > 0.4) for (let s = 0.12; s < 0.95; s += 4.5 / len) light(x + dx * len * s, by + dy * len * s + 0.3, z + dz * len * s, rad * 2.0, bl, 0.75 * rad, 11 + rad * 5, 1);
    };
    beam(dx, dy, dz, b[5], b[6], 0, 0);
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const d = jitter(dx, dy + 0.25, dz, 0.75); d[1] = Math.abs(d[1]) + 0.15;
      const l = Math.hypot(d[0], d[1], d[2]);
      beam(d[0] / l, d[1] / l, d[2] / l, b[5] * rng.range(0.22, 0.5), rng.range(0.12, 0.4), rng.range(-1, 1) * b[5] * 1.6, rng.range(-1, 1) * b[5] * 1.6);
    }
  }
  // moonlight: one strong cold light high in the chimney (the SDF visibility shapes its pool on the floor)
  cid++;
  light(SHAFT[0], SHAFT[1], SHAFT[2], 30, [0.55, 0.75, 1.0], 5.5, 62, 2, 0);

  const I = new Float32Array(inst), L = new Float32Array(lights), n = I.length / 21, out = new Float32Array(n * 20);
  // environment colour picked up by each crystal from the other clusters' lights
  for (let i = 0; i < n; i++) {
    const o = i * 21, len = I[o + 3], q = o + 4;
    // axis = rotate (0,1,0) by q
    const ax = 2 * (I[q] * I[q + 1] - I[q + 3] * I[q + 2]), ay = 1 - 2 * (I[q] * I[q] + I[q + 2] * I[q + 2]), az = 2 * (I[q + 1] * I[q + 2] + I[q + 3] * I[q]);
    const mx = I[o] + ax * len * 0.6, my = I[o + 1] + ay * len * 0.6, mz = I[o + 2] + az * len * 0.6;
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < L.length; j += 12) {
      if (L[j + 9] === I[o + 20] || L[j + 10] === 2) continue;
      const d2 = (L[j] - mx) ** 2 + (L[j + 1] - my) ** 2 + (L[j + 2] - mz) ** 2, R = L[j + 7];
      if (d2 > R * R) continue;
      const w = (1 - d2 / (R * R)) ** 2 / (1 + d2 / (L[j + 3] * L[j + 3]));
      r += L[j + 4] * w; g += L[j + 5] * w; b += L[j + 6] * w;
    }
    out.set(I.subarray(o, o + 20), i * 20);
    const k = 0.4 / Math.max(1, (r + g + b) * 0.25);
    out[i * 20 + 16] = r * k; out[i * 20 + 17] = g * k; out[i * 20 + 18] = b * k;
  }
  return { inst: out, n, lights: L };
}

// ---------------------------------------------------------------- surface nets
export async function buildMesh(L, progress) {
  const X0 = -56, Y0 = -5, Z0 = -60, H = 0.5, NX = 237, NY = 105, NZ = 205, NXY = NX * NY, B = 8;
  const V = new Float32Array(NX * NY * NZ), done = new Uint8Array(NX * NY * NZ);
  const nbx = Math.ceil((NX - 1) / B), nby = Math.ceil((NY - 1) / B), nbz = Math.ceil((NZ - 1) / B), act = new Uint8Array(nbx * nby * nbz);
  for (let bk = 0, b = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++, b++) {
    const x = X0 + (bi * B + B / 2) * H, y = Y0 + (bj * B + B / 2) * H, z = Z0 + (bk * B + B / 2) * H;
    const d = Math.min(-blob(x, y, z), y - floorY(x, z));
    if (Math.abs(d) < 7.2 || solids(x, y, z) < 7.2) { act[b] = 1; continue; }
    const v = d > 0 ? 9 : -9, i1 = Math.min(bi * B + B, NX - 1), j1 = Math.min(bj * B + B, NY - 1), k1 = Math.min(bk * B + B, NZ - 1);
    for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) V.fill(v, (k * NY + j) * NX + bi * B, (k * NY + j) * NX + i1 + 1);
  }
  for (let bk = 0, b = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++, b++) {
      if (!act[b]) continue;
      const i1 = Math.min(bi * B + B, NX - 1), j1 = Math.min(bj * B + B, NY - 1), k1 = Math.min(bk * B + B, NZ - 1);
      for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) for (let i = bi * B, o = (k * NY + j) * NX + i; i <= i1; i++, o++) {
        if (done[o]) continue;
        done[o] = 1; V[o] = sdfCave(X0 + i * H, Y0 + j * H, Z0 + k * H);
      }
    }
    if (bk % 4 === 3) await progress(0.08 + 0.42 * bk / nbz);
  }
  // vertices
  const cell = new Int32Array(NX * NY * NZ).fill(-1);
  let cap = 200000, P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), nv = 0;
  const cv = new Float32Array(8), off = [0, 1, NX, NX + 1, NXY, NXY + 1, NXY + NX, NXY + NX + 1];
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0, o = (k * NY + j) * NX; i < NX - 1; i++, o++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const v = V[o + off[c]]; cv[c] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = E[e], b = E[e + 1], va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; n++;
    }
    if (nv === cap) { cap *= 2; const p2 = new Float32Array(cap * 3), n2 = new Float32Array(cap * 3); p2.set(P); n2.set(N); P = p2; N = n2; }
    P[nv * 3] = X0 + (i + sx / n) * H; P[nv * 3 + 1] = Y0 + (j + sy / n) * H; P[nv * 3 + 2] = Z0 + (k + sz / n) * H;
    let gx = cv[1] + cv[3] + cv[5] + cv[7] - cv[0] - cv[2] - cv[4] - cv[6], gy = cv[2] + cv[3] + cv[6] + cv[7] - cv[0] - cv[1] - cv[4] - cv[5],
      gz = cv[4] + cv[5] + cv[6] + cv[7] - cv[0] - cv[1] - cv[2] - cv[3];
    const gl = Math.hypot(gx, gy, gz) || 1;
    N[nv * 3] = gx / gl; N[nv * 3 + 1] = gy / gl; N[nv * 3 + 2] = gz / gl;
    cell[o] = nv++;
  }
  // quads
  let idx = new Uint32Array(nv * 7), ni = 0;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ni + 6 > idx.length) { const i2 = new Uint32Array(idx.length * 2); i2.set(idx); idx = i2; }
    if (flip) { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
  };
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1, o = (k * NY + j) * NX + 1; i < NX - 1; i++, o++) {
    const v0 = V[o], s0 = v0 < 0;
    if (s0 !== (V[o + 1] < 0)) quad(cell[o - NX - NXY], cell[o - NXY], cell[o], cell[o - NX], !s0);
    if (s0 !== (V[o + NX] < 0)) quad(cell[o - 1 - NXY], cell[o - 1], cell[o], cell[o - NXY], !s0);
    if (s0 !== (V[o + NXY] < 0)) quad(cell[o - 1 - NX], cell[o - NX], cell[o], cell[o - 1], !s0);
  }
  await progress(0.6);

  // light bake -> 16 floats per vertex: pos + pulse phase | normal + caustic weight | light rgb + ao | light dir + wetness
  const out = new Float32Array(nv * 16), nl = L.length / 12;
  for (let v = 0; v < nv; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    let r = 0, g = 0, b = 0, lx = 0, ly = 0, lz = 0, ca = 0, best = 0, ph = 0;
    for (let j = 0; j < nl; j++) {
      const o = j * 12, dx = L[o] - px, dy = L[o + 1] - py, dz = L[o + 2] - pz, d2 = dx * dx + dy * dy + dz * dz, R = L[o + 7];
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) + 1e-4, kind = L[o + 10];
      if (kind === 2 && py > 12) continue;
      const ndl = (nx * dx + ny * dy + nz * dz) / d, wrap = kind === 2 ? Math.max(ndl, 0) : Math.max((ndl + 0.45) / 1.45, 0);
      let w = (1 - d2 / (R * R)) ** 2 / (1 + d2 / (L[o + 3] * L[o + 3])) * wrap;
      if (kind === 2) w *= ss(0.985, 0.998, -(dx * (SHAFT[3] - SHAFT[0]) + dy * (SHAFT[4] - SHAFT[1]) + dz * (SHAFT[5] - SHAFT[2])) / (d * 44.4)) * 6;
      if (w < 0.004) continue;
      // soft visibility through the (noise-free) cave volume
      let vis = 1;
      const st = kind === 2 ? 9 : 4;
      for (let s = 1; s <= st && vis > 0; s++) {
        const t = s / (st + 1), m = kind === 2 ? 1.5 : 0.9;
        vis = Math.min(vis, (sdfFast(px + nx * 0.4 + dx * t, py + ny * 0.4 + dy * t, pz + nz * 0.4 + dz * t) + m) / (m + 0.6));
      }
      if (vis <= 0) continue;
      w *= Math.min(vis, 1);
      r += L[o + 4] * w; g += L[o + 5] * w; b += L[o + 6] * w;
      const lum = (L[o + 4] + L[o + 5] + L[o + 6]) * w;
      lx += dx / d * lum; ly += dy / d * lum; lz += dz / d * lum;
      if (lum > best) { best = lum; ph = L[o + 8]; }
      if (kind === 0) ca = Math.max(ca, Math.min(1, w * 1.6) * (1 - ss(R * 0.12, R * 0.4, d)));
    }
    const ll = Math.hypot(lx, ly, lz) || 1;
    const a1 = sdfCave(px + nx * 1.2, py + ny * 1.2, pz + nz * 1.2) / 1.2, a2 = sdfCave(px + nx * 3.5, py + ny * 3.5, pz + nz * 3.5) / 3.5;
    const ao = Math.min(1, Math.max(0.12, 0.2 + 0.8 * a1)) * Math.min(1, Math.max(0.35, 0.45 + 0.55 * a2));
    const dp = Math.hypot(px - POOL[0], pz - POOL[1]);
    // pool: wet rim and water caustics dancing on the rock above it
    const wet = Math.max((1 - ss(8, 12, dp)) * (1 - ss(WL + 0.15, WL + 1.3, py)), 0.35 * ss(0.3, 0.8, vn3(px * 0.25, py * 0.25, pz * 0.25)));
    ca = Math.max(ca, (1 - ss(9, 17, dp)) * ss(WL + 0.2, WL + 2.5, py) * 0.35);
    out.set([px, py, pz, ph, nx, ny, nz, ca, r, g, b, ao, lx / ll, ly / ll, lz / ll, wet], v * 16);
    if (v % 20000 === 19999) await progress(0.6 + 0.3 * v / nv);
  }
  return { verts: out, idx: idx.subarray(0, ni), nv };
}

// unit crystal: hexagonal prism (y 0..0.7) with a six-sided point (apex at y = 1), flat normals
export function crystalGeo() {
  const pos = [], nrm = [], uv = [], idx = [];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const mx = a[0] + b[0] + c[0], mz = a[2] + b[2] + c[2], flip = nx * mx + nz * mz < 0, o = pos.length / 3;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    for (const p of flip ? [a, c, b] : [a, b, c]) { pos.push(p[0], p[1], p[2]); nrm.push(nx, ny, nz); uv.push(0, p[1]); }
    idx.push(o, o + 1, o + 2);
  };
  for (let k = 0; k < 6; k++) {
    const a0 = k * Math.PI / 3, a1 = a0 + Math.PI / 3, c0 = [Math.cos(a0), 0, Math.sin(a0)], c1 = [Math.cos(a1), 0, Math.sin(a1)];
    const d0 = [c0[0], 0.7, c0[2]], d1 = [c1[0], 0.7, c1[2]];
    tri(c0, c1, d1); tri(c0, d1, d0); tri(d0, d1, [0, 1, 0]);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: new Uint32Array(idx) };
}

// tileable rock detail: r = height, gb = gradient, a = sparse mineral specks. Returns mip chain (rgba8).
export function detailMips(N) {
  const h = new Float32Array(N * N);
  const lat = (x, y, per, s) => u2f(hash3i(((x % per) + per) % per, ((y % per) + per) % per, s));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < 5; o++) {
      const per = 4 << o, fx = x / N * per, fy = y / N * per, ix = Math.floor(fx), iy = Math.floor(fy);
      let u = fx - ix, v = fy - iy; u = u * u * u * (u * (u * 6 - 15) + 10); v = v * v * v * (v * (v * 6 - 15) + 10);
      const p = lat(ix, iy, per, o), q = lat(ix + 1, iy, per, o), r = lat(ix, iy + 1, per, o), t = lat(ix + 1, iy + 1, per, o);
      let val = p + (q - p) * u + (r - p + (p - q - r + t) * u) * v;
      if (o === 1 || o === 2) val = 1 - Math.abs(2 * val - 1);          // ridged mid octaves read as fractures
      s += a * val; n += a; a *= 0.55;
    }
    h[y * N + x] = s / n;
  }
  let data = new Uint8Array(N * N * 4), gmax = 0;
  const g = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = y * N + x, gx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], gy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    g[o * 2] = gx; g[o * 2 + 1] = gy; gmax = Math.max(gmax, Math.abs(gx), Math.abs(gy));
  }
  for (let o = 0; o < N * N; o++) {
    data[o * 4] = h[o] * 255; data[o * 4 + 1] = 127.5 + 127 * g[o * 2] / gmax; data[o * 4 + 2] = 127.5 + 127 * g[o * 2 + 1] / gmax;
    data[o * 4 + 3] = u2f(hash3i(o, 7, 3)) > 0.988 ? 255 : 0;
  }
  const mips = [data];
  for (let n = N; n > 1; n >>= 1) {
    const m = n >> 1, d = new Uint8Array(m * m * 4);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) for (let c = 0; c < 4; c++) {
      const a = data[(y * 2 * n + x * 2) * 4 + c] + data[(y * 2 * n + x * 2 + 1) * 4 + c] + data[((y * 2 + 1) * n + x * 2) * 4 + c] + data[((y * 2 + 1) * n + x * 2 + 1) * 4 + c];
      d[(y * m + x) * 4 + c] = c === 3 ? Math.min(255, a * 0.6) : a / 4;
    }
    mips.push(d); data = d;
  }
  return mips;
}
