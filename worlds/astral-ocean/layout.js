// Pure layout: creature paths, jelly groups, poses and fly-through. Shared by world.js (and offline checks).
export const DOOR = [0, -2, 26];
export const CORE = [-0.316, 0.163, -0.935];
// paths: [cx, cy, cz, R, e, h, yaw, phase, speed, u0, dir, L]  (0-2 whales, 3-4 fish shoals). WGSL twin in common.wgsl
export const PATHS = [
  [-5, 28, -178, 112, 0.72, 5, 0.3, 0, 2.6, 2.088, -1, 58],
  [34, -25, -22, 60, 0.85, 3, -0.6, 1.3, 2.8, 5.682, -1, 42],
  [0, 96, -30, 150, 0.7, 6, 1.9, 2.2, 4.0, 4.15, 1, 75],
  [8, 3, -12, 16, 0.7, 2, 0.3, 0.5, 2.0, 0, 1, 0],
  [8, -6, -68, 12, 0.8, 2, -0.5, 1.9, 2.0, 2, -1, 0],
  [34, -25, -22, 60, 0.85, 3, -0.6, 1.3, 2.8, 5.682, -1, 11],     // escort shoal: whale 1's path, slot 11 = side offset
  [-40, 2, -92, 36, 0.8, 2, 0.4, 0.7, 1.5, 0, 1, 26],             // 6: nursery mother
  [-40, 5.2, -92, 29.5, 0.8, 2, 0.4, 0.7, 1.5 * 29.5 / 36, 0, 1, 10],   // 7: her calf (same angular speed, tucked beside her back)
  [50, -6, -26, 24, 0.8, 3, 0.9, 0.3, 2.4, 0, -1, 0],             // 8: ray pod around the reef
  [5, -140, -20, 75, 0.75, 4, 0.2, 1.1, 1.6, 0, 1, 0],            // 9: the giant ray of the deep
];
// regions: rose-gold nursery (toward the core), teal reef field, the crystal ring behind the islet, the quiet deep
export const NURSERY = [-40, 2, -92], REEF = [50, -8, -26], RING = [-28, -3, 36], RAXIS = [0.2, 0.96, 0.18];
// reef asteroids: [dx, dy, dz, radius] around REEF
export const ROCKS = [[0, 0, 0, 5.5], [11, 2.5, -6, 3.2], [-9, -2, 7, 3.6], [4, 4.5, 12, 2.4], [-13, 3, -9, 2.2], [15, -4, 8, 2.8], [-3, -6, -13, 2]];
// plankton clouds: [x, y, z, radius, palette]
export const CLOUDS = [[-40, 4, -92, 8, 0], [-22, -2, -66, 6, 1], [50, -3, -26, 9, 2], [-7, 1, -15, 4.5, 3], [-8, -56, -14, 9, 4]];
// jelly groups: [x, bottomY, z, radius, count, H, hueLo, hueHi, size multiplier]: 3 = nursery babies, 4 = giants of the deep
export const JGROUPS = [[-14, -8, -45, 8, 20, 26, 0.0, 0.6], [45, -2, 2, 9, 14, 26, 0.3, 1.0], [-28, -16, 36, 7, 10, 22, 0.0, 0.85],
  [-40, -7, -92, 8, 12, 18, 0.0, 0.3, 0.5], [-8, -80, -14, 15, 5, 38, 0.55, 1.0, 2.6]];

export function pathPos(p, u, o) {
  const lx = p[3] * Math.cos(u), lz = p[4] * p[3] * Math.sin(u), ly = p[5] * (Math.sin(0.5 * u + p[7]) + 0.35 * Math.sin(1.37 * u + 2 * p[7]));
  const c = Math.cos(p[6]), s = Math.sin(p[6]);
  o[0] = p[0] + c * lx + s * lz; o[1] = p[1] + ly; o[2] = p[2] - s * lx + c * lz; return o;
}
const _a = [0, 0, 0], _b = [0, 0, 0];
// spine frame at time t, body fraction s -> { p, f, r, u }
export function frame(p, t, s) {
  const uh = p[9] + p[10] * p[8] * t / p[3];
  pathPos(p, uh + 0.002, _a); pathPos(p, uh - 0.002, _b);
  const sp = Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]) * 250;
  const us = uh - p[10] * s * p[11] / sp;
  const P = pathPos(p, us, [0, 0, 0]);
  pathPos(p, us + 0.002, _a); pathPos(p, us - 0.002, _b);
  let f = [(_a[0] - _b[0]) * p[10], (_a[1] - _b[1]) * p[10], (_a[2] - _b[2]) * p[10]];
  const fl = Math.hypot(...f); f = f.map((x) => x / fl);
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map((x) => x / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { p: P, f, r, u };
}
// allocation-free spine position (for the collision sdf)
export function spine(p, t, s, o) {
  const uh = p[9] + p[10] * p[8] * t / p[3];
  pathPos(p, uh + 0.002, _a); pathPos(p, uh - 0.002, _b);
  const sp = Math.hypot(_a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]) * 250;
  return pathPos(p, uh - p[10] * s * p[11] / sp, o);
}
export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const lookAt = (pos, tgt) => { const d = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], l = Math.hypot(...d); return { pos, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(d[1] / l) }; };

// critic poses (eye positions used verbatim): spawn, close whale, nursery, reef, the deep, islet + crystal ring
export const POSES = [{ pos: [0, 0, 0], yaw: 0, pitch: 0.12 }, {}, {}, {}, {}, {}];
export const FLY = [];
export const FLY_DUR = 60;

const G0c = [JGROUPS[0][0], JGROUPS[0][1] + JGROUPS[0][5] * 0.55, JGROUPS[0][2]];
const JC = add(G0c, CORE, -15);          // jelly close-up: backlit by the nebula core
// fly-through: starts at the door on the islet (so the perf run covers it), turns to the spawn view, then fish ->
// jellies with the nursery beyond -> across to the reef and its rays. Times follow the core rule (length + 2 x yaw).
const WP = [
  [[1.2, -0.5, 22.3], [0, -1, 26]], [[3.5, -0.2, 18], [-1.5, -1.6, 27]], [[4, 0.6, 9], [-8, 7, -30]], [[3, 1.5, -1], [-36, 19, -48]],
  [[8, 3.5, -15], add(G0c, [7, 9, -6])], [[2, 6, -24], add(G0c, [5, 4, -2])],
  [add(JC, [1, 0, 0]), add(G0c, [6, 4, -2])], [add(JC, [-3, -2, -3]), add(G0c, [6, 5, -2])],
  [[0, 0, -36], [50, -5, -30]], [[15, -3, -31], [50, -7, -26]], [[29, -5, -18], [52, -7, -28]], [[36, -3, -8], [52, -9, -30]],
];
{
  const pts = WP.map(([p, l]) => { const L = lookAt(p, l); return { pos: p, yaw: L.yaw, pitch: Math.max(-0.7, Math.min(0.7, L.pitch)) }; });
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1].yaw; let b = pts[i].yaw; while (b - a > Math.PI) b -= 2 * Math.PI; while (b - a < -Math.PI) b += 2 * Math.PI; pts[i].yaw = b; }
  FLY.push(...pts);
}
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
export function flyCam(s) {   // mirror of the core spline: -> { pos, fwd }
  const n = FLY.length, ts = [0]; let acc = 0;
  for (let i = 1; i < n; i++) { const a = FLY[i - 1].pos, b = FLY[i].pos; acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + Math.abs(FLY[i].yaw - FLY[i - 1].yaw) * 2 + 0.01; ts.push(acc); }
  for (let i = 0; i < n; i++) ts[i] *= FLY_DUR / acc;
  let i = 0; while (i < n - 2 && ts[i + 1] < s) i++;
  const t = Math.min(1, Math.max(0, (s - ts[i]) / (ts[i + 1] - ts[i])));
  const i0 = Math.max(0, i - 1), i2 = Math.min(n - 1, i + 1), i3 = Math.min(n - 1, i + 2);
  const pos = [0, 1, 2].map((k) => cr(FLY[i0].pos[k], FLY[i].pos[k], FLY[i2].pos[k], FLY[i3].pos[k], t));
  const yaw = cr(FLY[i0].yaw, FLY[i].yaw, FLY[i2].yaw, FLY[i3].yaw, t), pitch = cr(FLY[i0].pitch, FLY[i].pitch, FLY[i2].pitch, FLY[i3].pitch, t);
  return { pos, fwd: [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)] };
}
// choose path phase u0 so that creature k at body fraction s is closest to target at time t. (The three old whales'
// phases are frozen above: they were tuned for the spawn view, the profile pose and the jelly clip.)
function solvePhase(k, t, s, target) {
  let best = 1e9, bu = 0;
  for (let u = 0; u < 6.2832; u += 0.006) { PATHS[k][9] = u; const d = Math.hypot(...frame(PATHS[k], t, s).p.map((x, j) => x - target[j])); if (d < best) { best = d; bu = u; } }
  PATHS[k][9] = bu;
}
export const TF = 9.2, TJ = 30, TR = 49.2;      // motion-clip times: fish, jellies, reef
{
  const P = POSES, c9 = flyCam(TF);
  solvePhase(3, TF - 5, 0, add(add(c9.pos, c9.fwd, 10), [4, -7.5, 0]));
  solvePhase(4, TJ - 5, 0, add(G0c, [9, -6, 6]));
  // 1: the close whale in profile, on a third with lead room
  const W1 = frame(PATHS[1], 40, 0.45);
  Object.assign(P[1], lookAt(add(add(W1.p, W1.r, 45), W1.u, 3), add(W1.p, W1.f, 5)), { t: 40 });
  // 2: the nursery. Mother and calf cross in front of the core; the pearl garland and baby jellies in the foreground
  solvePhase(6, 20, 0.45, add(NURSERY, [-13, 0, -30]));
  PATHS[7][9] = PATHS[6][9] - 0.26;
  Object.assign(P[2], lookAt(add(NURSERY, [7, 1.5, 15]), add(NURSERY, [-8, 4, -20])), { t: 20 });
  // 3: the reef field with the ray pod gliding over it and the comet beyond
  solvePhase(8, 30, 0, add(REEF, [-9, 6, 2]));
  Object.assign(P[3], lookAt(add(REEF, [-20, 3.5, 11]), add(REEF, [3, 1.5, -3])), { t: 30 });
  // 4: the quiet deep: giant jellies, and the great ray passing far below
  solvePhase(9, 50, 0, [12, -140, -80]);
  Object.assign(P[4], lookAt([-46, -60, 0], [4, -141, -70]), { t: 50 });
  // 5: the islet off-centre; jellies rise through the crystal ring behind it
  Object.assign(P[5], lookAt([8.6, 0.4, 20.6], [-2.6, -3.2, 28.5]), { t: 26 });
}
