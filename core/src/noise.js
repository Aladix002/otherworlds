// CPU twins of the [JS]-marked WGSL noise functions (core/wgsl/noise.wgsl).
// Same integer hashing, so heightAt() in JS matches GPU terrain to ~1e-5.
const TAU = 6.28318530717959;
const fr = Math.fround;

export function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
export const u2f = (h) => (h >>> 8) * (1 / 16777216);
export const hash2i = (x, y) => pcg(((x >>> 0) + pcg(y >>> 0)) >>> 0);
export const hash3i = (x, y, z) => pcg(((x >>> 0) + pcg(((y >>> 0) + pcg(z >>> 0)) >>> 0)) >>> 0);

export function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = u2f(hash2i(ix, iy)), b = u2f(hash2i(ix + 1, iy));
  const d = u2f(hash2i(ix, iy + 1)), e = u2f(hash2i(ix + 1, iy + 1));
  const m0 = a + (b - a) * ux, m1 = d + (e - d) * ux;
  return (m0 + (m1 - m0) * uy) * 2 - 1;
}

const F2 = 0.36602540378, G2 = 0.21132486541;
function gdot(cx, cy, x, y) { const a = u2f(hash2i(cx, cy)) * TAU; return Math.cos(a) * x + Math.sin(a) * y; }
export function snoise2(vx, vy) {
  const s = (vx + vy) * F2;
  const ix = Math.floor(vx + s), iy = Math.floor(vy + s);
  const t = (ix + iy) * G2;
  const x0 = vx - ix + t, y0 = vy - iy + t;
  const ox = x0 > y0 ? 1 : 0, oy = 1 - ox;
  const x1 = x0 - ox + G2, y1 = y0 - oy + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  let n = 0, w;
  w = 0.5 - x0 * x0 - y0 * y0; if (w > 0) { w *= w; n += w * w * gdot(ix, iy, x0, y0); }
  w = 0.5 - x1 * x1 - y1 * y1; if (w > 0) { w *= w; n += w * w * gdot(ix + ox, iy + oy, x1, y1); }
  w = 0.5 - x2 * x2 - y2 * y2; if (w > 0) { w *= w; n += w * w * gdot(ix + 1, iy + 1, x2, y2); }
  return 70 * n;
}

function fractal(fn, x, y, octaves) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * fn(x, y); n += a;
    const nx = (0.8 * x - 0.6 * y) * 2 + 17.13, ny = (0.6 * x + 0.8 * y) * 2 + 5.71;
    x = fr(nx); y = fr(ny); a *= 0.5;
  }
  return s / n;
}
export const fbm2 = (x, y, octaves) => fractal(snoise2, x, y, octaves);
export const vfbm2 = (x, y, octaves) => fractal(vnoise2, x, y, octaves);
export function ridge2(x, y, octaves) {
  let a = 0.5, s = 0, n = 0, w = 1;
  for (let i = 0; i < octaves; i++) {
    let r = 1 - Math.abs(snoise2(x, y)); r = r * r * w; w = Math.min(Math.max(r * 2, 0), 1);
    s += a * r; n += a;
    const nx = (0.8 * x - 0.6 * y) * 2 + 17.13, ny = (0.6 * x + 0.8 * y) * 2 + 5.71;
    x = fr(nx); y = fr(ny); a *= 0.5;
  }
  return s / n;
}
export const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
