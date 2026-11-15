// Allocation-free math on Float32Array / plain arrays. Column-major mat4 (WGSL layout).
export const v3 = () => new Float32Array(3);
export const m4 = () => new Float32Array(16);
export const DEG = Math.PI / 180;

export function set3(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function copy3(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function add3(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function sub3(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function scale3(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
export function addScaled3(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; }
export function lerp3(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function norm3(o, a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o; }
export function cross3(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  o[0] = x; o[1] = y; o[2] = z; return o;
}
// forward vector for yaw/pitch (yaw 0 looks toward -Z, positive yaw turns left)
export function fwdFromYawPitch(o, yaw, pitch) {
  const cp = Math.cos(pitch);
  o[0] = -Math.sin(yaw) * cp; o[1] = Math.sin(pitch); o[2] = -Math.cos(yaw) * cp; return o;
}

export function identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
export function mul4(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    const r0 = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    const r1 = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    const r2 = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    const r3 = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    o[c * 4] = r0; o[c * 4 + 1] = r1; o[c * 4 + 2] = r2; o[c * 4 + 3] = r3;
  }
  return o;
}
// reverse-Z, infinite far plane, depth range [0,1]: near -> 1, infinity -> 0
export function perspectiveRevZ(o, fovY, aspect, near) {
  const f = 1 / Math.tan(fovY / 2);
  o.fill(0); o[0] = f / aspect; o[5] = f; o[11] = -1; o[14] = near; return o;
}
// view matrix from eye position and orthonormal basis (right, up, fwd)
export function viewFromBasis(o, eye, r, u, f) {
  o[0] = r[0]; o[4] = r[1]; o[8] = r[2]; o[12] = -dot3(r, eye);
  o[1] = u[0]; o[5] = u[1]; o[9] = u[2]; o[13] = -dot3(u, eye);
  o[2] = -f[0]; o[6] = -f[1]; o[10] = -f[2]; o[14] = dot3(f, eye);
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1; return o;
}
export function invert4(o, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(o);
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
// model matrix: translation + yaw rotation about Y + uniform scale
export function trsY(o, x, y, z, yaw, s = 1) {
  const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s;
  o.fill(0); o[0] = c; o[2] = -n; o[5] = s; o[8] = n; o[10] = c; o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
}
// exponential smoothing factor for time constant tau (seconds)
export const damp = (tau, dt) => 1 - Math.exp(-dt / Math.max(tau, 1e-5));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// wrap angle to [-PI, PI]
export const wrapAngle = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

// seeded RNG (mulberry32). rng() -> [0,1)
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.gauss = () => { let u = 0, v = 0; while (!u) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
  rng.seed = (v) => { s = v >>> 0; };
  return rng;
}
