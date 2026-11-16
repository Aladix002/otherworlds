// Crystal cave: layout, SDF, surface-nets mesher, crystal placement and vertex light bake. All CPU, at load time.
import { hash3i, u2f, fbm2 } from '../../core/src/noise.js';
import { makeRng } from '../../core/src/math.js';

export const WL = -0.55, POOL = [40, -14], DOOR = [-42, 0.3, -10];
// moonlight shaft axis: top (inside the chimney) -> floor
export const SHAFT = [12.33, 44, -48.5, 7.4, 0, -44.8];
// stream water level, pond under the waterfall, rift centre, sleeping salamander, stream polyline (pond -> under the south wall)
export const SW = -0.4, POND = [-28.5, -34], RIFT = [31, 18], SAL = [46.5, 22.5], SALY = 0.25;
export const STREAM = [[-28.5, -34], [-22, -36], [-13, -37.5], [-5, -41], [3, -45.5], [9, -47.5], [15, -50], [23, -54]];
export const FALL = [POND[0], 12, POND[1]], FLOWERS = [];      // the waterfall rises from the pond into a chimney in the ceiling
export const OC = [10, 10.5, -2];                          // the floating heart of the hall: crystals orbit it in mid-air
// air chambers (ellipsoids cx,cy,cz, rx,ry,rz): 0 hall, 1 pool, 2 geode alcove, 3 shaft, 4 door, 5 mushroom grotto, 6 rift, 7 citrine chamber
export const CH = [[0, 8, 0, 27, 12, 21], [40, 5, -14, 17, 9, 15], [-6, 3.5, 30, 8, 5.5, 7.5], [6, 8, -44, 13, 11, 12], [-40, 4.5, -10, 11, 7, 10.5],
  [-22, 4, -34, 10, 6, 9], [31, 2, 18, 6, 11, 9], [45, 4.5, 21, 9, 6.5, 8.5]];
// tunnels (capsules ax,ay,az, bx,by,bz, r); the last one is the chimney
const TU = [[22, 2.5, -6, 30, 2.5, -10, 4.2], [-3, 2.5, 17, -5, 2.5, 26, 3.4], [3, 3, -16, 5, 3, -36, 3.8], [-22, 3, -5, -32, 3, -9, 3.7],
  [30, 3, -24, 16, 3, -40, 3.3], [9, 14, -46, 13, 50, -49, 3.3],
  [-11, 2.5, -16, -17, 2.5, -27, 2.8], [-13, 2.5, -37, -5, 2.5, -41, 3.0], [17.5, 2.5, 14, 26, 2.5, 17.5, 2.6], [35, 2.5, 18.5, 38, 2.5, 19.5, 2.6],
  [POND[0], 7, POND[1], POND[0], 16, POND[1], 1.15], [14, -0.2, -49.5, 24, -0.5, -54.5, 1.3]];     // ..., waterfall spout, stream sink
const COLS = [[9, -10, 1.0, 9, 10], [14, 12, 0.8, 8, 9], [-16, 9, 0.85, 8, 9], [33, -23, 0.6, 5, 7]];   // x, z, r, ymid, halfH
const STAL = [];                                                                                  // x, ytip, z, slope
const CAPS = [];                                                                                  // crystal collision capsules
const SOCK = [];                                                                                  // rock sockets under wall clusters (x, y, z, r)

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

export const riftW = (z) => 0.8 * Math.sin((z - 18) * 0.35);
export function streamDist(x, z) {
  let d = 1e9;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const a = STREAM[i], b = STREAM[i + 1], bx = b[0] - a[0], bz = b[1] - a[1], qx = x - a[0], qz = z - a[1];
    const h = Math.min(1, Math.max(0, (qx * bx + qz * bz) / (bx * bx + bz * bz)));
    d = Math.min(d, Math.hypot(qx - bx * h, qz - bz * h));
  }
  return d;
}
// sleeping salamander: body radius and spine point for u = 0 (snout) .. 1 (tail tip); the body lies curled around SAL
export const salR = (u) => Math.max((0.34 + 0.18 * ss(0.1, 0.28, u)) * (1 - 0.95 * Math.pow(ss(0.42, 1, u), 0.8)), 0.42 * Math.exp(-(((u - 0.05) / 0.04) ** 2))) * Math.min(1, Math.sqrt(u / 0.03));
export function spine(u, o) {
  const a = 3.6 + u * 4.9, R = 1.95 - 1.15 * Math.pow(u, 1.4);
  o[0] = SAL[0] + Math.cos(a) * R; o[1] = SALY + 0.8 * salR(u); o[2] = SAL[1] + Math.sin(a) * R; o[3] = a;
  return o;
}
// floor heightfield (WGSL twin in common.wgsl)
export function floorY(x, z) {
  let h = 0.2 + 0.75 * fbm2(x * 0.045, z * 0.045, 3);
  const dp = Math.hypot(x - POOL[0], z - POOL[1]);
  h += (0.1 - h) * 0.7 * (1 - ss(9, 15, dp));
  h += -1.2 * (1 - ss(4, 10.5, dp)) + 0.3 * ss(8, 11.5, dp) * (1 - ss(11.5, 15, dp));
  if (x < 28 && z < -27) {                                 // stream bed and pond (WGSL twin)
    const d = streamDist(x, z), dq = Math.hypot(x - POND[0], z - POND[1]);
    h += (Math.max(h, -0.15) - h) * Math.max(1 - ss(2, 4.5, d), 1 - ss(4, 6.5, dq));
    h += (SW - 0.45 - h) * Math.max(1 - ss(0.6, 1.9, d), 1 - ss(2, 4.2, dq));
  }
  if (x > 20 && z > 5) {                                   // rift and citrine chamber (JS only: no water there)
    h += (0.3 - h) * (1 - ss(5, 9, Math.hypot(x - RIFT[0], z - RIFT[1])));
    h += (SALY - h) * (1 - ss(4, 8, Math.hypot(x - SAL[0], z - SAL[1])));
    h += (-7.5 - h) * (1 - ss(1.5, 2.6, Math.abs(x - 31 - riftW(z)))) * (1 - ss(11, 13, Math.abs(z - 18)));
  }
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
    const dc = Math.hypot(x - c[0], z - c[1]);
    s = Math.min(s, dc - c[2] * (1 + 1.6 * t * t) - (dc < 5 ? 0.3 * vn3(x * 0.9, y * 0.45, z * 0.9) + 0.25 * Math.sin(y * 1.1 + c[0]) : 0));
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
  // the rift cannot be entered, except along the beam that bridges it
  if (x > 26 && x < 36 && z > 5 && z < 31) d = Math.min(d, Math.max(Math.abs(x - 31 - riftW(z)) - 2.1, 0.75 - Math.abs(z - 18)));
  return d;
}

// ---------------------------------------------------------------- crystals + lights
const COLORS = [[0.52, 0.2, 1.0], [0.12, 0.72, 1.0], [0.5, 0.74, 1.0], [0.95, 0.4, 0.85], [0.42, 0.3, 1.0],    // violet, cyan, white, rose, indigo
  [0.15, 1.0, 0.5], [1.0, 0.62, 0.14], [1.0, 0.36, 0.1]];                                                         // emerald, citrine, amber
const MCOL = [[0.2, 1.0, 0.55], [1.0, 0.55, 0.15], [0.75, 0.35, 1.0]];                                           // mushroom glow
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
  const rng = makeRng(90210), lights = [], orb = [];
  let inst = [];
  let cid = 0;
  // stalactites first (they are part of the SDF)
  for (let i = 0; i < 46; i++) {
    const ci = [0, 0, 0, 0, 1, 1, 3, 4][rng.int(8)], c = CH[ci], a = rng() * 6.283, u = Math.sqrt(rng()) * 0.8;
    const x = c[0] + Math.cos(a) * u * c[3], z = c[2] + Math.sin(a) * u * c[5], top = c[1] + c[4] * Math.sqrt(1 - u * u);
    if (Math.hypot(x - 9, z + 46) < 6.5) continue;
    STAL.push([x, top - rng.range(1.2, ci ? 3 : 5.5), z, rng.range(0.12, 0.2)]);
  }
  const add = (px, py, pz, ax, ay, az, len, rad, col, glow, type, flat, id, wx, wy, wz) => {
    let qx = az, qy = 0, qz = -ax, qw = 1 + ay;
    if (qw < 1e-4) { qx = 1; qz = 0; qw = 0; }
    const l = Math.hypot(qx, qz, qw); qx /= l; qz /= l; qw /= l;
    let r = rng() * 6.283;
    if (wx !== undefined) {                                   // roll so that the flattened side (local z) faces w
      const x0 = 1 - 2 * qz * qz, x1 = 2 * qw * qz, x2 = -2 * qx * qz, z0 = 2 * qx * qz, z1 = -2 * qw * qx, z2 = 1 - 2 * qx * qx;
      r = Math.atan2(wx * x0 + wy * x1 + wz * x2, wx * z0 + wy * z1 + wz * z2);
    }
    const s = Math.sin(r / 2), c = Math.cos(r / 2);          // roll about local Y: q * (0, s, 0, c)
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
  const cluster = (px, py, pz, nx, ny, nz, size, n, ci, spread, I, fat = 1, ring = 0) => {
    cid++;
    const col = COLORS[ci], ph = rng() * 6.283;
    // tangent frame
    let tx = ny, ty = -nx, tz = 0; if (Math.abs(nz) > 0.9) { tx = 0; ty = nz; tz = -ny; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    for (let i = 0, m = ring ? n + 9 : n; i < m; i++) {      // the last 9 are a druse of small points on the rim of the socket
      const hero = i === 0, rim = i >= n, k = hero ? 1 : rim ? rng.range(0.1, 0.22) : 0.3 + 0.6 * Math.pow(rng(), 1.4), len = size * k;
      const d = jitter(nx, ny, nz, hero ? spread * 0.3 : spread), a = rng() * 6.283, o = hero ? 0 : rim ? ring * rng.range(0.8, 1.2) : size * 0.38 * fat * Math.sqrt(rng());
      const lift = rim ? ring * 0.5 - 0.03 : -0.05;
      const ox = (tx * Math.cos(a) + bx * Math.sin(a)) * o, oy = (ty * Math.cos(a) + by * Math.sin(a)) * o, oz = (tz * Math.cos(a) + bz * Math.sin(a)) * o;
      // lean outward from the cluster centre
      let ax = d[0] + ox / size * 1.1, ay = d[1] + oy / size * 1.1, az = d[2] + oz / size * 1.1; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      const rad = len * rng.range(0.1, 0.16) * fat + 0.015;
      add(px + ox - ax * len * 0.18 + nx * lift, py + oy - ay * len * 0.18 + ny * lift, pz + oz - az * len * 0.18 + nz * lift, ax, ay, az, len * 1.18, rad,
        col, rng.range(0.75, 1.25) * (ci === 2 ? 0.75 : 1), 0, rng() < 0.3 ? rng.range(0.38, 0.6) : rng.range(0.8, 1), cid);
    }
    // citrine throws a deeper ember light than its own colour: gold on grey rock would turn to mud
    if (I > 0) light(px + nx * size * 0.55, py + ny * size * 0.55, pz + nz * size * 0.55, 0.6 + size * 0.6, ci > 5 ? [1, 0.45, 0.1] : col, I, 7 + size * 6, 0, ph);
  };
  // a cluster sitting in a socket hollowed out of the rock (carved into the voxel field by buildMesh)
  const socketed = (px, py, pz, nx, ny, nz, size, n, ci, spread, I) => {
    const rs = Math.max(0.65, size * 0.3);
    SOCK.push(px + nx * rs * 0.2, py + ny * rs * 0.2, pz + nz * rs * 0.2, rs);
    cluster(px - nx * rs * 0.45, py - ny * rs * 0.45, pz - nz * rs * 0.45, nx, ny, nz, size, n, ci, spread, I, 1, rs);
  };
  const wallCluster = (ox, oy, oz, dx, dy, dz, size, ci, I) => {
    const l = Math.hypot(dx, dy, dz), t = march(ox, oy, oz, dx / l, dy / l, dz / l, 14);
    if (t < 0) return;
    const px = ox + dx / l * t, py = oy + dy / l * t, pz = oz + dz / l * t, g = grad(px, py, pz);
    socketed(px, py, pz, g[0], g[1], g[2], size, 5 + rng.int(5), ci, 0.7, I);
  };
  const scatter = (ci, n, s0, s1, pal, oj, k = 1) => {
    const c = CH[ci];
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const a = rng() * 6.283, dy = rng.range(-0.38, 0.85), h = Math.sqrt(1 - dy * dy);
      const ox = c[0] + rng.range(-oj, oj), oz = c[2] + rng.range(-oj, oj), oy = c[1] - 1, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      const t = march(ox, oy, oz, dx, dy, dz, 45);
      if (t < 0) continue;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      if (Math.hypot(px - DOOR[0], pz - DOOR[2]) < 4.5 || py > 22 || Math.hypot(px - 9, pz + 46) < 4 && py > 12) continue;
      if (-blob(px, py, pz) > 2.2) continue;                               // on a stalactite or column: skip
      if (py < 1.6 && Math.hypot(px - SAL[0], pz - SAL[1]) < 3.6 || py < 0.3 && streamDist(px, pz) < 2) continue;
      const g = grad(px, py, pz), size = rng.range(s0, s1) * (0.6 + 0.4 * rng());
      socketed(px, py, pz, g[0], g[1], g[2], size, 5 + rng.int(7), pal[rng.int(pal.length)], 0.75, (1.3 + size * 0.5) * k);
      i++;
    }
  };
  scatter(0, 26, 2.0, 5.0, [0, 0, 0, 4, 2, 1, 0, 3], 9);
  scatter(1, 16, 0.9, 2.6, [1, 1, 1, 2, 0, 1], 5);
  scatter(3, 9, 0.9, 2.4, [2, 1, 2, 4], 4);
  scatter(4, 14, 0.8, 2.2, [0, 3, 0, 4], 3);
  scatter(7, 26, 0.8, 2.8, [6, 6, 6, 7, 6], 4, 0.4);
  scatter(6, 8, 0.6, 1.6, [6, 7, 6], 1.2, 0.4);
  scatter(5, 6, 0.6, 1.5, [5, 5, 1], 4);
  // citrine glowing down in the rift, and two small clusters that leak gold light into the hall from the hidden passage
  for (let i = 0; i < 16; i++) {
    const z = rng.range(9.5, 26.5);
    wallCluster(31 + riftW(z), rng.range(-6.5, -1.2), z, i & 1 ? 1 : -1, rng.range(-0.3, 0.2), rng.range(-0.3, 0.3), rng.range(0.5, 1.3), rng() < 0.3 ? 7 : 6, 0.8);
  }
  cid++; light(31, -5.5, 18, 3, COLORS[6], 1.4, 14, 0);
  wallCluster(20.5, 2.2, 15, 0.2, 0.5, 1, 0.9, 6, 0.8); wallCluster(23, 2.2, 16, 0.3, 0.3, -1, 0.7, 6, 0.6);

  // hero amethysts standing on the hall floor, off the walkways
  for (const h of [[10, 9.5, 0, 3.2], [3, -11.5, 0, 2.7], [17, -8.5, 4, 2.8], [-2, 11.5, 3, 2.1], [-15, -2.5, 0, 2.3], [-6, -10, 4, 1.8]])
    socketed(h[0], floorY(h[0], h[1]), h[1], 0, 1, 0, h[3], 8 + rng.int(4), h[2], 0.6, 3.4);
  // big cyan / white clusters standing around the pool rim (they double in the water)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + rng.range(-0.3, 0.3) + 0.4, r = rng.range(7.6, 9.2), x = POOL[0] + Math.cos(a) * r, z = POOL[1] + Math.sin(a) * r;
    cluster(x, floorY(x, z), z, 0, 1, 0, rng.range(1.1, 2.4), 6 + rng.int(5), i % 3 === 2 ? 2 : 1, 0.6, 1.8);
  }
  // geode alcove: a shell packed with amethyst, from a druse carpet to a few hero points, all leaning toward the centre
  const g0 = inst.length;
  {
    const c = CH[2], n = [1100, 1700, 2300][level];
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, dy = rng.range(-0.6, 0.97), h = Math.sqrt(1 - dy * dy), dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      const t = march(c[0], c[1] - 0.5, c[2], dx, dy, dz, 14);
      if (t < 0) continue;
      const px = c[0] + dx * t, py = c[1] - 0.5 + dy * t, pz = c[2] + dz * t;
      if (pz < 25 || (py < 1.1 && Math.hypot(px - c[0], pz - c[2]) < 4.2) || (pz < 27 && py < 3.2 && Math.abs(px + 4.5) < 3)) continue;
      const g = grad(px, py, pz), u = rng(), size = u < 0.35 ? rng.range(0.25, 0.45) : u < 0.93 ? rng.range(0.5, 1.0) : rng.range(1.3, 2.2);
      let nx = g[0] * 0.6 - dx * 0.7, ny = g[1] * 0.6 - dy * 0.7, nz = g[2] * 0.6 - dz * 0.7; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const lit = i % 12 === 0;
      cluster(px, py, pz, nx, ny, nz, size, 6 + rng.int(4), rng() < 0.88 ? 0 : 4, 0.3, lit ? 0.9 : 0, 1.7);
      if (lit) lights[lights.length - 5] = 6;
    }
  }
  { // draw the geode front to back as seen from its mouth (early depth rejection where the overdraw is worst)
    const m = (inst.length - g0) / 21, ord = Array.from({ length: m }, (_, i) => i), src = inst.slice(g0);
    const key = (i) => (src[i * 21] + 5) ** 2 + (src[i * 21 + 1] - 2) ** 2 + (src[i * 21 + 2] - 25) ** 2;
    ord.sort((a, b) => key(a) - key(b));
    ord.forEach((s, i) => { for (let k = 0; k < 21; k++) inst[g0 + i * 21 + k] = src[s * 21 + k]; });
  }
  // door dressing: small crystals at the base of the frame (door yaw = PI/2, its lateral axis is z)
  for (const s of [-1, 1]) {
    const x = DOOR[0] - 0.25, z = DOOR[2] + s * 1.2;
    cluster(x, floorY(x, z) + 0.02, z, 0, 1, 0, 0.55, 7, s < 0 ? 0 : 1, 0.9, 1.3);
    cluster(x + 0.75, floorY(x + 0.75, z + s * 0.5) + 0.02, z + s * 0.5, 0, 1, 0, 0.28, 4, s < 0 ? 4 : 0, 1.0, 0);
  }
  // giant selenite beams: [base x, z, dir x, y, z, radius, free-length factor (0 = span to the rock)]
  const BEAMS = [[-14, -9, 0.8, 0.55, 0.3, 1.1, 0], [12, -13, -0.5, 0.6, 0.62, 0.9, 0], [14.5, 7.5, -0.75, 0.5, -0.42, 1.3, 0], [-10, 12.5, 0.55, 0.75, -0.35, 0.8, 0.7],
    [2, -15, 0.15, 0.9, 0.4, 0.7, 0], [20, -3, -0.3, 0.8, 0.5, 1.0, 0.6], [-19, 3, 0.6, 0.45, -0.65, 0.9, 0], [7, 14, 0.9, 0.3, -0.33, 0.75, 0],
    [49, -25, -0.6, 0.55, 0.55, 0.8, 0], [47, -3, -0.4, 0.5, -0.75, 0.6, 0.75], [-2, -51, 0.3, 0.75, 0.5, 0.7, 0]];
  const white = [0.66, 0.82, 1.0], bl = [0.5, 0.58, 1.0], BS = [];
  // does the beam pass through one that already stands? (points near the other beam's root are fine: they grow from one base)
  const crosses = (x, y, z, dx, dy, dz, len, rad) => {
    for (let j = 0; j < BS.length; j += 7) {
      const bx = BS[j + 3] - BS[j], by = BS[j + 4] - BS[j + 1], bz = BS[j + 5] - BS[j + 2], bb = bx * bx + by * by + bz * bz, R = BS[j + 6];
      for (let s = 0.15; s <= 1; s += 0.025) {
        const qx = x + dx * len * s - BS[j], qy = y + dy * len * s - BS[j + 1], qz = z + dz * len * s - BS[j + 2];
        if (Math.hypot(qx + BS[j] - OC[0], qy + BS[j + 1] - OC[1], qz + BS[j + 2] - OC[2]) < 6.6 + rad) return true;      // keep the orbit of the floating crystals free
        if (Math.hypot(qx, qy, qz) < R * 3 + 1) continue;
        const h = Math.min(1, Math.max(0, (qx * bx + qy * by + qz * bz) / bb));
        if (Math.hypot(qx - bx * h, qy - by * h, qz - bz * h) < R + rad + 0.15) return true;
      }
    }
    return false;
  };
  for (const b of BEAMS) {
    cid++;
    const l0 = Math.hypot(b[2], b[3], b[4]), dx = b[2] / l0, dy = b[3] / l0, dz = b[4] / l0, by = floorY(b[0], b[1]) - 0.8;
    const beam = (dx, dy, dz, rad, free, ox, oz) => {
      const x = b[0] + ox, z = b[1] + oz, by = floorY(x, z) - 0.8;
      let t = march(x + dx * 3, by + dy * 3, z + dz * 3, dx, dy, dz, 40);
      t = t < 0 ? 30 : t + 3;
      let len = free ? Math.min(t * free, t - 1.5) : t + rad * 1.5;
      const l0 = len;
      while (crosses(x, by, z, dx, dy, dz, len, rad)) { len *= 0.9; if (len < l0 * 0.3) { if (ox || oz) return; break; } }
      BS.push(x, by, z, x + dx * len, by + dy * len, z + dz * len, rad);
      add(x, by, z, dx, dy, dz, len, rad, white, rng.range(0.5, 0.7), 1, rng.range(0.55, 0.85), cid);
      if (rad > 0.4) for (let s = 0.12; s < 0.95; s += 4.5 / len) light(x + dx * len * s, by + dy * len * s + 0.3, z + dz * len * s, rad * 2.0, bl, 0.75 * rad, 11 + rad * 5, 1);
    };
    beam(dx, dy, dz, b[5], b[6], 0, 0);
    // satellites: a ring of short stubby crystals and a glow pool root the beam in the floor
    for (let i = 0, m = 5 + rng.int(4); i < m; i++) {
      const a = rng() * 6.283, o = b[5] * rng.range(1.1, 2.2), x = b[0] + Math.cos(a) * o + dx * 1.2, z = b[1] + Math.sin(a) * o + dz * 1.2;
      const d = jitter(dx * 0.4 + Math.cos(a) * 0.5, 1, dz * 0.4 + Math.sin(a) * 0.5, 0.3), r = b[5] * rng.range(0.16, 0.34);
      add(x, floorY(x, z) - 0.3, z, d[0], d[1], d[2], r * rng.range(3, 7) + 0.3, r, white, rng.range(0.55, 0.8), 1, rng.range(0.6, 0.9), cid);
    }
    light(b[0] + dx * 1.5, by + 1.6, b[1] + dz * 1.5, 1.2 + b[5], bl, 1.1 + b[5], 9, 1);
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const d = jitter(dx, dy + 0.25, dz, 0.75); d[1] = Math.abs(d[1]) + 0.45;
      const l = Math.hypot(d[0], d[1], d[2]);
      beam(d[0] / l, d[1] / l, d[2] / l, b[5] * rng.range(0.22, 0.5), rng.range(0.12, 0.4), rng.range(-1, 1) * b[5] * 1.6, rng.range(-1, 1) * b[5] * 1.6);
    }
  }
  // the bridge: a fallen selenite beam across the rift, flat side up
  cid++;
  add(26.2, -0.2, 18, 1, 0, 0, 9.8, 1.25, white, 0.75, 1, 0.6, cid, 0, 1, 0); CAPS.length -= 7;
  for (let s = 0.2; s < 0.9; s += 0.3) light(26.2 + 9.8 * s, 0.5, 18, 2.4, bl, 0.9, 11, 1);
  for (const b of [[28.3, -4.5, 12.5, 0.75, 0.6, 0.25, 0.45], [33.6, -5, 23.5, -0.7, 0.65, -0.3, 0.4], [28.6, -6, 21.5, 0.8, 0.45, 0.35, 0.3]]) {
    const l = Math.hypot(b[3], b[4], b[5]);
    add(b[0] + riftW(b[2]), b[1], b[2], b[3] / l, b[4] / l, b[5] / l, 5.5, b[6], white, 0.7, 1, 0.7, cid);
  }
  // crystal flowers: a rosette of flat petals around a white heart (glow >= 8 marks them for the shader: they light up when you come close)
  const flower = (x, z, ci) => {
    cid++;
    const y = floorY(x, z) - 0.03, col = COLORS[ci], wh = [0.85, 0.9, 1];
    for (let ring = 0; ring < 2; ring++) for (let i = 0, m = ring ? 5 : 8; i < m; i++) {
      const a = (i + ring * 0.5) / m * 6.283 + rng() * 0.2, up = ring ? 1.1 : 0.4, l = Math.hypot(1, up), ax = Math.cos(a) / l, ay = up / l, az = Math.sin(a) / l;
      add(x + ax * 0.06, y, z + az * 0.06, ax, ay, az, (ring ? 0.3 : 0.45) * rng.range(0.9, 1.1), ring ? 0.06 : 0.09, ring ? wh : col, ring ? 8.8 : 8.5, 0, 0.32, cid, -ax * ay, 1 - ay * ay, -az * ay);
    }
    add(x, y, z, 0, 1, 0, 0.24, 0.04, wh, 9.1, 0, 1, cid);
    light(x, y + 0.4, z, 0.6, col, 0.5, 4, 4);
    FLOWERS.push(x, y + 0.3, z);
  };
  for (const f of [[-1, -3, 3], [5, 3.5, 2], [12, 4.5, 3], [17.8, 14.6, 2], [27, -8, 1], [31, -10.5, 2], [1.5, -38, 2], [-18, -30.5, 3], [-34, -7, 3], [-4, 20, 0], [41, 24.5, 3], [38.5, 17.5, 2]]) flower(f[0], f[1], f[2]);
  // the sleeper: a crest of citrine plates along the back and rose gill-stalks behind the head; a warm light above it
  {
    cid++;
    const p = [0, 0, 0, 0];
    for (let u = 0.11; u < 0.87; u += 0.017) {
      spine(u, p);
      const b = salR(u), ca = Math.cos(p[3]), sa = Math.sin(p[3]), j = rng.range(-0.12, 0.12), l = Math.hypot(0.5, 1, j);
      add(p[0], SALY + 1.6 * b - 0.05, p[2], (-sa * 0.5 + ca * j) / l, 1 / l, (ca * 0.5 + sa * j) / l, 0.12 + b * rng.range(0.4, 0.75), 0.035 + 0.05 * b, COLORS[rng() < 0.6 ? 6 : 7], 1.3, 0, 0.4, cid, ca, 0, sa);
    }
    spine(0.095, p);
    const ca = Math.cos(p[3]), sa = Math.sin(p[3]), b = salR(0.095);
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
      const ax = ca * s * 0.8 - sa * 0.7, ay = 0.15 + 0.35 * j, az = sa * s * 0.8 + ca * 0.7, l = Math.hypot(ax, ay, az);
      add(p[0] + ca * s * b * 0.7, p[1] + 0.08 * j, p[2] + sa * s * b * 0.7, ax / l, ay / l, az / l, 0.34 + 0.1 * j, 0.045, COLORS[3], 1.5, 0, 0.35, cid, 0, 1, 0);
    }
    for (let u = 0.03; u < 0.75; u += 0.09) { spine(u, p); const x = p[0], y = p[1], z = p[2]; spine(u + 0.09, p); CAPS.push(x, y, z, p[0], p[1], p[2], salR(u + 0.045) * 0.9); }
    light(SAL[0], 1.7, SAL[1], 1.8, COLORS[6], 2.6, 11, 4, 0);
  }
  // glowing mushrooms: the grotto, a trail of small patches along the stream and one at the mouth of the passage in the hall
  const sh = [];
  const patch = (cx, cz, n, big, hue) => {
    const cy = floorY(cx, cz);
    if (cy < SW + 0.1 || sdfCave(cx, cy + 0.6, cz) < 0.3) return 0;
    cid++;
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, r = i ? (0.3 + 1.3 * Math.sqrt(rng())) * (0.6 + big * 0.5) : 0, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = floorY(x, z);
      if (y < SW + 0.08 || sdfCave(x, y + 0.5, z) < 0.3) continue;
      sh.push(x, y - 0.04, z, i ? big * rng.range(0.12, 0.42) * (rng() < 0.15 ? 1.6 : 1) : big, rng.gauss() * 0.1, rng.gauss() * 0.1, rng(), hue);
    }
    light(cx, cy + big * 0.8 + 0.25, cz, 0.8 + big * 0.5, MCOL[hue], 0.25 + big * 0.3, 5 + big * 4, 3);
    return 1;
  };
  for (let i = 0, k = 0; i < 26 && k < 200; k++) {
    const a = rng() * 6.283, u = Math.sqrt(rng()) * 0.85;
    i += patch(CH[5][0] + Math.cos(a) * u * 10, CH[5][2] + Math.sin(a) * u * 9, 8 + rng.int(10), rng.range(0.5, 1.4), rng() < 0.68 ? 0 : rng() < 0.6 ? 1 : 2);
  }
  for (const m of [[-25, -28, 3.1, 0], [-17, -40.2, 2.6, 1], [-30, -38.6, 2.3, 0], [-9, -36.6, 0.6, 0], [-1, -41.5, 0.7, 2], [-2.5, -46, 0.5, 0], [13, -52, 0.8, 0], [-12.6, -19, 0.7, 1], [-14.5, -23.5, 0.9, 0]])
    patch(m[0], m[1], 9 + rng.int(6), m[2], m[3]);
  // the surreal heart of the hall: a burst of pale crystals hanging in the air and a slow ring of double-pointed shards orbiting it
  // (positions are relative to nothing special: the vertex shader turns them about OC, each pair with its own phase and speed)
  {
    cid++;
    const main = inst; inst = orb;
    const pair = (x, y, z, ax, ay, az, len, rad, col, glow, ph) => {
      const wx = ay, wy = -ax, wz = 0.001;
      add(x, y, z, ax, ay, az, len, rad, col, glow, 0, 0.8, cid, wx, wy, wz); orb[orb.length - 6] = ph;
      add(x, y, z, -ax, -ay, -az, len * rng.range(0.6, 1), rad, col, glow, 0, 0.8, cid, wx, wy, wz); orb[orb.length - 6] = ph;
    };
    for (let i = 0; i < 11; i++) { const d = jitter(0, 0, 0, 1); pair(OC[0], OC[1], OC[2], d[0], d[1], d[2], rng.range(1.2, 2.5), rng.range(0.17, 0.27), i % 3 ? [0.85, 0.8, 1] : COLORS[3], 1.7, 0); }
    for (let i = 0; i < 64; i++) {
      const a = rng() * 6.283, r = rng.range(3.2, 6.2), d = jitter(0, 0.4, 0, 1), ph = 1 + rng() * 5;
      pair(OC[0] + Math.cos(a) * r, OC[1] + rng.gauss() * 0.9, OC[2] + Math.sin(a) * r, d[0], d[1], d[2], rng.range(0.4, 1.3), rng.range(0.08, 0.24), COLORS[[0, 2, 1, 3, 4, 0, 2][rng.int(7)]], rng.range(0.9, 1.4), ph);
    }
    inst = main;
    light(OC[0], OC[1], OC[2], 2.2, [0.8, 0.7, 1], 2.6, 19, 0, 0);
  }
  // moonlight: one strong cold light high in the chimney (the SDF visibility shapes its pool on the floor)
  cid++;
  light(SHAFT[0], SHAFT[1], SHAFT[2], 30, [0.55, 0.75, 1.0], 3.6, 62, 2, 0);

  const L = new Float32Array(lights);
  return { ...pack(inst, L), orb: pack(orb, L), lights: L, shrooms: new Float32Array(sh) };
}
// 21 floats per crystal -> 20: the cluster id makes way for the environment colour picked up from the other clusters' lights
function pack(inst, L) {
  const I = new Float32Array(inst), n = I.length / 21, out = new Float32Array(n * 20);
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
  return { inst: out, n };
}

// ---------------------------------------------------------------- surface nets
export async function buildMesh(L, progress) {
  const X0 = -56, Y0 = -9, Z0 = -60, H = 0.5, NX = 237, NY = 113, NZ = 205, NXY = NX * NY, B = 8;
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
  // hollow the sockets of the wall clusters out of the rock
  for (let s = 0; s < SOCK.length; s += 4) {
    const r = SOCK[s + 3], e = r + 0.7, cl = (v, n) => Math.min(n - 1, Math.max(0, v));
    const i0 = cl(Math.floor((SOCK[s] - e - X0) / H), NX), i1 = cl(Math.ceil((SOCK[s] + e - X0) / H), NX), j0 = cl(Math.floor((SOCK[s + 1] - e - Y0) / H), NY), j1 = cl(Math.ceil((SOCK[s + 1] + e - Y0) / H), NY),
      k0 = cl(Math.floor((SOCK[s + 2] - e - Z0) / H), NZ), k1 = cl(Math.ceil((SOCK[s + 2] + e - Z0) / H), NZ);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = (k * NY + j) * NX + i, v = r - Math.hypot(X0 + i * H - SOCK[s], Y0 + j * H - SOCK[s + 1], Z0 + k * H - SOCK[s + 2]);
      if (v > -0.7) V[o] = -smin(-V[o], -v, 0.45);
    }
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
      const ndl = (nx * dx + ny * dy + nz * dz) / d, wrap = kind === 2 ? Math.max(ndl, 0) : Math.max((ndl + 0.45) / 1.45, 0);
      let w = (1 - d2 / (R * R)) ** 2 / (1 + d2 / (L[o + 3] * L[o + 3])) * wrap;
      if (kind === 2) w *= py > 13 ? 0.35 * ss(13, 18, py) : ss(0.985, 0.998, -(dx * (SHAFT[3] - SHAFT[0]) + dy * (SHAFT[4] - SHAFT[1]) + dz * (SHAFT[5] - SHAFT[2])) / (d * 44.4)) * 6;
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
      if (kind === 0) ca = Math.max(ca, Math.min(1, w * 1.6) * (1 - ss(R * 0.1, R * 0.3, d)));
    }
    const ll = Math.hypot(lx, ly, lz) || 1;
    const a1 = sdfCave(px + nx * 1.2, py + ny * 1.2, pz + nz * 1.2) / 1.2, a2 = sdfCave(px + nx * 3.5, py + ny * 3.5, pz + nz * 3.5) / 3.5;
    const ao = Math.min(1, Math.max(0.12, 0.2 + 0.8 * a1)) * Math.min(1, Math.max(0.35, 0.45 + 0.55 * a2));
    const dp = Math.hypot(px - POOL[0], pz - POOL[1]);
    // pool: wet rim and water caustics dancing on the rock above it
    let wet = Math.max((1 - ss(8, 12, dp)) * (1 - ss(WL + 0.15, WL + 1.3, py)), 0.35 * ss(0.3, 0.8, vn3(px * 0.25, py * 0.25, pz * 0.25)));
    if (px < 28 && pz < -26 && py < 1.5) wet = Math.max(wet, (1 - ss(1.3, 3.2, Math.min(streamDist(px, pz), Math.hypot(px - POND[0], pz - POND[1]) - 2.5))) * (1 - ss(0.2, 1.4, py)));
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

// the sleeping salamander: a faceted tube along the spine, four short legs and two eye bumps. uv.y: 0..1 body, 2 legs, 3 eyes
export function salGeo(M) {
  const path = [], o = [0, 0, 0, 0], parts = [];
  for (let i = 0; i < 70; i++) { spine(i / 69, o); path.push([o[0], o[1], o[2]]); }
  const body = M.tube(path, salR, 10);
  for (let v = 0; v < body.pos.length / 3; v++) {                // flatten the body, widen and flatten the head
    const j = Math.floor(v / 11), c = path[j], u = j / 69, hd = Math.exp(-(((u - 0.05) / 0.05) ** 2));
    spine(u, o);
    const rx = Math.cos(o[3]), rz = Math.sin(o[3]), d = ((body.pos[v * 3] - c[0]) * rx + (body.pos[v * 3 + 2] - c[2]) * rz) * 0.45 * hd;
    body.pos[v * 3] += rx * d; body.pos[v * 3 + 2] += rz * d;
    body.pos[v * 3 + 1] = c[1] + (body.pos[v * 3 + 1] - c[1]) * (0.8 - 0.2 * hd) - 0.1 * hd;
  }
  parts.push(body);
  for (const u of [0.17, 0.46]) for (const s of [-1, 1]) {
    spine(u, o);
    const rx = Math.cos(o[3]) * s, rz = Math.sin(o[3]) * s, tx = -Math.sin(o[3]), tz = Math.cos(o[3]), b = salR(u), x = o[0], z = o[2];
    const leg = M.tube([[x + rx * b * 0.5, SALY + 0.5 * b, z + rz * b * 0.5], [x + rx * (b + 0.1), SALY + 0.24, z + rz * (b + 0.1)],
      [x + rx * (b + 0.24) - tx * 0.06, SALY + 0.08, z + rz * (b + 0.24) - tz * 0.06], [x + rx * (b + 0.3) - tx * 0.3, SALY + 0.04, z + rz * (b + 0.3) - tz * 0.3]], (t) => 0.14 - 0.1 * t * t, 6);
    for (let i = 1; i < leg.uv.length; i += 2) leg.uv[i] = 2;
    parts.push(leg);
  }
  spine(0.05, o);
  for (const s of [-1, 1]) {
    const e = M.sphere(0.11, 1);
    for (let i = 0; i < e.uv.length / 2; i++) { e.uv[i * 2] = e.pos[i * 3 + 1] / 0.11; e.uv[i * 2 + 1] = 3; }
    parts.push(M.translate(e, o[0] + Math.cos(o[3]) * s * 0.36, o[1] + 0.06, o[2] + Math.sin(o[3]) * s * 0.36));
  }
  return M.merge(parts);
}
// stream water: a ribbon along the polyline (x, z, across, along); wide over the pond
export function streamGeo() {
  const P = [[-34.5, -34], ...STREAM], pts = [], v = [], idx = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6);
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 4, 0)], b = pts[Math.min(i + 4, pts.length - 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    const s = i * 0.6, hw = 1.9 + 2.6 * (1 - ss(7, 11, s));
    for (let k = 0; k < 9; k++) { const u = (k / 4 - 1) * hw; v.push(pts[i][0] - tz * u, pts[i][1] + tx * u, u, s); }
    if (i) for (let k = 0; k < 8; k++) { const o = (i - 1) * 9 + k; idx.push(o, o + 9, o + 1, o + 1, o + 9, o + 10); }
  }
  return { v: new Float32Array(v), idx: new Uint32Array(idx) };
}
// the waterfall that falls upward: a column of water gathered from the pond, rising into the chimney (x, y, z, along)
export function fallGeo() {
  const v = [], idx = [], N = 26, S = 10;
  for (let j = 0; j <= N; j++) {
    const t = j / N, y = SW - 0.35 + (FALL[1] - SW) * t, r = 0.3 + 1.1 * Math.pow(1 - t, 7) + 0.25 * t * t;
    const cx = FALL[0] + 0.14 * Math.sin(y * 1.1), cz = FALL[2] + 0.14 * Math.cos(y * 0.8);
    for (let i = 0; i <= S; i++) { const a = i / S * 6.283 + y * 0.5; v.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r * 0.75, t); }
    if (j) for (let i = 0; i < S; i++) { const o = (j - 1) * (S + 1) + i; idx.push(o, o + S + 1, o + 1, o + 1, o + S + 1, o + S + 2); }
  }
  return { v: new Float32Array(v), idx: new Uint32Array(idx) };
}
