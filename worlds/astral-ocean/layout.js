// Pure layout: creature paths, jelly groups, poses and fly-through. Shared by world.js (and offline checks).
export const DOOR = [0, -2, 26];
export const CORE = [-0.316, 0.163, -0.935];
// paths: [cx, cy, cz, R, e, h, yaw, phase, speed, u0, dir, L]  (0-2 whales, 3-4 fish shoals). WGSL twin in common.wgsl
export const PATHS = [
  [-5, 28, -138, 75, 0.7, 5, 0.3, 0, 3.2, 1.9, 1, 58],
  [32, -32, -18, 48, 0.8, 4, -0.6, 1.3, 2.8, 4.4, -1, 42],
  [0, 96, -30, 150, 0.7, 6, 1.9, 2.2, 4.0, 0.9, 1, 75],
  [8, 3, -12, 16, 0.7, 2, 0.3, 0.5, 2.0, 0, 1, 0],
  [8, -6, -68, 12, 0.8, 2, -0.5, 1.9, 2.0, 2, -1, 0],
];
// jelly groups: [x, bottomY, z, radius, count, H, hueLo, hueHi]
export const JGROUPS = [[-14, -8, -45, 8, 20, 26, 0.0, 0.6], [45, -2, 2, 9, 14, 26, 0.3, 1.0], [-28, -16, 36, 7, 10, 22, 0.0, 0.85]];

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
export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const lookAt = (pos, tgt) => { const d = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]], l = Math.hypot(...d); return { pos, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(d[1] / l) }; };

// critic poses (eye positions used verbatim)
export const POSES = [{ pos: [0, 0, 0], yaw: 0, pitch: 0.12 }, {}, {}, {}, {}, {}];
// fly-through: one slow continuous loop; times are proportional to path length, so creature-relative waypoints are
// solved iteratively for the time the camera will actually reach them.
export const FLY = [];
export const FLY_DUR = 60;

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const G0c = [JGROUPS[0][0], JGROUPS[0][1] + JGROUPS[0][5] * 0.55, JGROUPS[0][2]];
// fly-through: a compact slow loop (spawn -> past jelly group 0 -> down toward the deep whale -> back). Times follow
// the core rule (proportional to length + 2 x yaw change). Creature phases are then solved so life is in frame at the
// motion-clip times (0.15, 0.5, 0.82 of the duration) and in the spawn view.
const WP = [
  [[0, 0, 0], [0, 2, -30]], [[4, 1.5, -8], [8, 3, -20]], [[10, 3, -18], [-6, 4, -30]], [[18, 9, -28], [-6, 6, -40]], [[8, 7, -36], G0c],
  [[-1, 5, -33], G0c], [[-4, 1, -56], G0c], [[14, -6, -48], [32, -30, -20]],
  [[24, -12, -20], [32, -32, -18]], [[12, -4, 6], [0, 0, -20]], [[0, 0, 0], [0, 2, -30]],
];
function buildFly() {
  FLY.length = 0;
  const pts = WP.map(([p, l]) => { const L = lookAt(p, l); return { pos: p, yaw: L.yaw, pitch: Math.max(-0.7, Math.min(0.7, L.pitch)) }; });
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1].yaw; let b = pts[i].yaw; while (b - a > Math.PI) b -= 2 * Math.PI; while (b - a < -Math.PI) b += 2 * Math.PI; pts[i].yaw = b; }
  FLY.push(...pts);
}
buildFly();
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
// choose path phase u0 so that creature k at body fraction s is closest to target(t) at time t
function solvePhase(k, t, s, target) {
  let best = 1e9, bu = 0;
  for (let u = 0; u < 6.2832; u += 0.004) { PATHS[k][9] = u; const d = Math.hypot(...frame(PATHS[k], t, s).p.map((x, j) => x - target[j])); if (d < best) { best = d; bu = u; } }
  PATHS[k][9] = bu; return best;
}
{
  let M = [32, -26, -20];
  for (let it = 0; it < 4; it++) {      // deep whale passing below/in front for the last clip; look at it
    WP[8][1] = M; WP[9][1] = add(M, [-8, 4, 0]); buildFly();
    const c = flyCam(49.2);
    let best = 1e9, bu = 0;
    for (let u = 0; u < 6.2832; u += 0.004) { PATHS[1][9] = u; const p = frame(PATHS[1], 49.2, 0.45).p; const d = Math.hypot(p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]); if (d < best) { best = d; bu = u; } }
    PATHS[1][9] = bu; M = frame(PATHS[1], 49.2, 0.45).p;
  }
  const c9 = flyCam(9), c30 = flyCam(30);
  solvePhase(3, 9 - 3, 0, add(c9.pos, c9.fwd, 7));
  solvePhase(0, 10, 0.45, add([0, 0, 0], norm([0.3, 0.2, -1]), 95));
  solvePhase(4, 30 - 3, 0, add(c30.pos, c30.fwd, 8));
}
{
  const P = POSES;
  const W1 = frame(PATHS[1], 40, 0.5);
  Object.assign(P[1], lookAt(add(add(W1.p, W1.r, 36), W1.u, 6), add(W1.p, W1.f, 2)), { t: 40 });
  Object.assign(P[2], lookAt(add(G0c, CORE, -24), add(G0c, [0, 2, 0])), { t: 14 });
  const c3 = flyCam(9.4);
  Object.assign(P[3], lookAt(c3.pos, add(c3.pos, c3.fwd)), { t: 9.4 });
  Object.assign(P[4], lookAt([-30, -16, -30], [-12, 30, -50]), { t: 70 });
  Object.assign(P[5], lookAt([-7.5, 0.6, 12.5], [0.6, -2.6, 26]), { t: 26 });
}
