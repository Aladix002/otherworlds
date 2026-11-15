// Procedural meshes for aurora-fjord. uv.x = free parameter, uv.y = material id + fraction (see scene.wgsl):
// 0 painted boards, 1 white trim, 2 snow, 3 window, 4 dark wood, 5 stone, 6 door, 7 lamp, 8 boat hull, 10 spruce, 11 bark.
import { box, sphere, cylinder, merge, transform, computeNormals } from '../../core/src/mesh.js';
import { snoise2, pcg, u2f } from '../../core/src/noise.js';

const mk = (nv, ni) => ({ pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), idx: new Uint32Array(ni) });
const h1 = (n) => u2f(pcg(n >>> 0));
const rz = (g, a, x = 0, y = 0, z = 0) => transform(g, [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, x, y, z, 1]);
export const ry = (g, a, x = 0, y = 0, z = 0) => transform(g, [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, x, y, z, 1]);
const rx = (g, a, x = 0, y = 0, z = 0) => transform(g, [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, x, y, z, 1]);
const mv = (g, x, y, z) => { for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += x; g.pos[i + 1] += y; g.pos[i + 2] += z; } return g; };
const mirX = (g) => {
  for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] *= -1; g.nrm[i] *= -1; }
  for (let i = 0; i < g.idx.length; i += 3) { const t = g.idx[i + 1]; g.idx[i + 1] = g.idx[i + 2]; g.idx[i + 2] = t; }
  return g;
};
const setMat = (g, mat, u) => { for (let i = 0; i < g.uv.length; i += 2) { if (u !== undefined) g.uv[i] = u; g.uv[i + 1] = mat + 0.5; } return g; };
// box with its base centre at (x, y, z). uv.x = metres along the face, uv.y = mat + height / 12
function bx(w, h, d, mat, x = 0, y = 0, z = 0, tz = 0) {
  const g = box(w, h, d);
  for (let i = 0; i < 24; i++) {
    const p = g.pos, k = i * 3;
    g.uv[i * 2] = Math.abs(g.nrm[k]) > 0.5 || (tz && Math.abs(g.nrm[k + 1]) > 0.5) ? p[k + 2] : p[k];
    g.uv[i * 2 + 1] = mat + Math.min((p[k + 1] + h / 2) / 12, 0.99);
    p[k] += x; p[k + 1] += y + h / 2; p[k + 2] += z;
  }
  return g;
}
// quad in the XY plane facing +z, centre-bottom at the origin
function quad(w, h, u0, v0, z = 0) {
  const g = mk(4, 6);
  g.pos.set([-w / 2, 0, z, w / 2, 0, z, -w / 2, h, z, w / 2, h, z]); g.nrm.set([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  g.uv.set([u0, v0, u0 + 1, v0, u0, v0 + 0.98, u0 + 1, v0 + 0.98]); g.idx.set([0, 1, 2, 2, 1, 3]);
  return g;
}
// height-field patch over coordinate lists (x from xs, z from zs)
function grid(xs, zs, f, mat = 2) {
  const nx = xs.length, nz = zs.length, g = mk(nx * nz, (nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const v = j * nx + i; g.pos[v * 3] = xs[i]; g.pos[v * 3 + 1] = f(xs[i], zs[j], i, j); g.pos[v * 3 + 2] = zs[j]; g.uv[v * 2] = xs[i]; g.uv[v * 2 + 1] = mat + 0.5;
    if (i < nx - 1 && j < nz - 1) { g.idx[k++] = v; g.idx[k++] = v + nx; g.idx[k++] = v + 1; g.idx[k++] = v + 1; g.idx[k++] = v + nx; g.idx[k++] = v + nx + 1; }
  }
  return computeNormals(g);
}
// rounded snow slab: x in [0, w], z in [-d/2, d/2], thickness t, edge radius r. open = full thickness at x = 0
export function blanket(w, d, t, r, seed = 1, open = 0, sub = 0.7) {
  const axis = (len, o) => {
    const a = o ? [0] : [0, r * 0.3], x0 = o ? 0 : r, n = Math.max(1, Math.ceil((len - r - x0) / sub));
    for (let i = o ? 1 : 0; i <= n; i++) a.push(x0 + (len - r - x0) * i / n);
    a.push(len - r * 0.3, len); return a;
  };
  const zs = axis(d, 0).map((z) => z - d / 2);
  return grid(axis(w, open), zs, (x, z) => {
    const e = Math.min(open ? 1e9 : x, w - x, z + d / 2, d / 2 - z) / r;
    return t * (e >= 1 ? 1 : Math.sqrt(Math.max(1 - (1 - e) * (1 - e), 0))) * (1 + 0.3 * snoise2(x * 0.9 + seed * 7.1, z * 0.9 - seed * 3.3));
  });
}
const cap = (w, d, t, x, y, z, seed) => mv(blanket(w, d, t, Math.min(w, d) * 0.45, seed, 0, 0.3), x - w / 2, y, z);

// ---- houses ----
function house(o, sd) {
  const { w, l, hw, p, sw = 1, rows = 1, deck = 0, chimney = 1, naust = 0 } = o, rh = w / 2 * Math.tan(p), P = [], G = [], wins = [];
  let wid = 0, lamp = null;
  P.push(bx(w, hw, l, 0), bx(w + 0.08, 0.3, l + 0.08, 4, 0, -0.3));
  for (const sg of [1, -1]) {
    const g = mk(3, 3), z = sg * l / 2;
    g.pos.set([-w / 2, hw, z, w / 2, hw, z, 0, hw + rh, z]); g.nrm.set([0, 0, sg, 0, 0, sg, 0, 0, sg]);
    g.uv.set([-w / 2, hw / 12, w / 2, hw / 12, 0, (hw + rh) / 12]); g.idx.set(sg > 0 ? [0, 1, 2] : [0, 2, 1]);
    P.push(g);
    for (const sx of [1, -1]) P.push(bx(0.17, hw, 0.17, 1, sx * w / 2, 0, z));
    // roof side: slab, snow blanket, white barge boards
    const L = (w / 2 + 0.45) / Math.cos(p), r = merge([bx(L, 0.1, l + 0.8, 4, L / 2), mv(blanket(L + 0.1, l + 1.0, 0.27, 0.3, sd + sg, 1), 0, 0.1, 0),
      bx(L, 0.2, 0.07, 1, L / 2, -0.13, l / 2 + 0.4), bx(L, 0.2, 0.07, 1, L / 2, -0.13, -l / 2 - 0.4)]);
    rz(r, -p, 0, hw + rh + 0.02, 0);
    P.push(sg < 0 ? mirX(r) : r);
  }
  P.push(mv(blanket(0.8, l + 1.0, 0.2, 0.36, sd + 5), -0.4, hw + rh + 0.27 * Math.cos(p) - 0.06, 0));
  let chim = null;
  if (chimney) {
    const cx = w * 0.17, cz = l * 0.18, top = hw + rh - cx * Math.tan(p) + 1.15;
    P.push(bx(0.55, 1.5, 0.55, 5, cx, top - 1.5, cz), bx(0.65, 0.1, 0.65, 5, cx, top - 0.12, cz), cap(0.7, 0.7, 0.13, cx, top - 0.02, cz, sd));
    chim = [cx, top + 0.1, cz];
  }
  const place = (parts, glow, x, y, z, a) => { P.push(ry(merge(parts), a, x, y, z)); if (glow) G.push(ry(glow, a, x, y, z)); };
  const win = (x, y, z, a, ww = 0.95, wh = 1.15) => {
    const id = wid++;
    place([quad(ww, wh, id * 4, 3, 0.02), bx(ww + 0.22, 0.1, 0.08, 1, 0, -0.1, 0.04), bx(ww + 0.22, 0.1, 0.08, 1, 0, wh, 0.04), bx(0.1, wh, 0.08, 1, ww / 2 + 0.05, 0, 0.04), bx(0.1, wh, 0.08, 1, -ww / 2 - 0.05, 0, 0.04),
      mv(blanket(ww + 0.3, 0.24, 0.085, 0.1, id, 0, 0.3), -ww / 2 - 0.15, 0, 0.1)], mv(quad(ww * 3.4, wh * 2.8, id * 4, 0, 0.1), 0, -wh * 0.9, 0), x, y, z, a);
    wins.push({ p: [x, y + wh / 2, z], n: [Math.sin(a), Math.cos(a)], id });
  };
  const door = (x, z, a, dw = 0.92) => {
    place([bx(dw, 1.98, 0.06, 6, 0, 0, 0.02), bx(dw + 0.22, 0.11, 0.08, 1, 0, 1.98, 0.04), bx(0.11, 1.98, 0.08, 1, dw / 2 + 0.055, 0, 0.04), bx(0.11, 1.98, 0.08, 1, -dw / 2 - 0.055, 0, 0.04),
      bx(dw + 0.5, 0.18, 0.75, 4, 0, -0.2, 0.42), mv(blanket(dw + 0.5, 0.75, 0.09, 0.14, 3, 0, 0.3), -dw / 2 - 0.25, -0.03, 0.42),
      bx(0.14, 0.18, 0.14, 7, dw / 2 + 0.34, 1.86, 0.1), bx(0.2, 0.04, 0.2, 4, dw / 2 + 0.34, 2.04, 0.1)], mv(quad(3.4, 3.4, 60, 0, 0.09), dw / 2 + 0.34, 0.25, 0), x, 0, z, a);
    const c = Math.cos(a), s = Math.sin(a), lx = dw / 2 + 0.34;
    lamp = [x + c * lx + s * 0.4, 1.9, z - s * lx + c * 0.4, s, c];
  };
  for (let r = 0; r < rows; r++) {
    const y = 0.95 + r * 2.35;
    for (let i = 0; i < sw; i++) for (const sx of [1, -1]) win(sx * w / 2, y, -l / 2 + l * (i + 0.5) / sw + (sw === 1 ? sx * 0.6 : 0), sx * Math.PI / 2);
    if (r) { win(-w * 0.22, y, -l / 2, Math.PI); win(w * 0.22, y, l / 2, 0); }
  }
  if (naust) { door(0, -l / 2, Math.PI, 2.3); win(w / 2, 1.0, 0.8, Math.PI / 2, 0.7, 0.7); }
  else if (deck) { door(-w * 0.2, -l / 2, Math.PI); win(w * 0.2, 0.95, -l / 2, Math.PI); win(0, 0.95, l / 2, 0); }
  else { door(w * 0.18, l / 2, 0); win(-w * 0.22, 0.95, l / 2, 0); win(0, 0.95, -l / 2, Math.PI, 1.3); }
  if (rh > 1.7 && !naust) win(0, hw + 0.25, -l / 2, Math.PI, 0.62, 0.62);
  const z0 = -l / 2 - (deck ? 1.7 : -0.15);
  if (deck) {
    P.push(bx(w + 0.8, 0.14, 1.8, 4, 0, -0.16, -l / 2 - 0.9), mv(blanket(w + 0.8, 1.8, 0.1, 0.16, sd + 9), -w / 2 - 0.4, -0.03, -l / 2 - 0.9));
    P.push(mv(setMat(cylinder(0.3, 0.3, 0.85, 10), 4), w / 2 - 0.1, -0.02, -l / 2 - 1.15), cap(0.64, 0.64, 0.14, w / 2 - 0.1, 0.82, -l / 2 - 1.15, sd));
  }
  for (let z = z0, n = Math.ceil((l / 2 - 0.15 - z0) / 2.5), i = 0; i <= n; i++, z = z0 + (l / 2 - 0.15 - z0) * i / n) {
    for (const sx of [1, -1]) P.push(bx(0.2, 3.6, 0.2, 4, sx * (w / 2 - 0.12), -3.8, z));
    P.push(bx(w, 0.2, 0.18, 4, 0, -0.5, z));
  }
  P.push(bx(w - 0.3, 2.6, l * 0.42, 5, 0, -2.9, l * 0.27));
  return { geo: merge(P), glow: merge(G), w, l, h: hw + rh, chim, wins, lamp };
}
export const HOUSE = [
  house({ w: 4.4, l: 6.2, hw: 2.45, p: 0.72, sw: 1, deck: 1 }, 1),
  house({ w: 5.0, l: 8.4, hw: 2.55, p: 0.68, sw: 2, deck: 1 }, 2),
  house({ w: 6.0, l: 8.6, hw: 4.9, p: 0.62, sw: 2, rows: 2 }, 3),
  house({ w: 4.0, l: 6.4, hw: 2.2, p: 0.76, naust: 1, chimney: 0 }, 4),
];

// ---- boat: double-ended Nordic rowing boat, filled with snow. Along x, keel at y = 0 ----
function boat(len = 5.4, B = 0.82) {
  const n = 16, m = 6, xs = [...Array(n + 1).keys()].map((i) => (i / n * 2 - 1) * len / 2), js = [...Array(2 * m + 1).keys()].map((j) => j - m);
  const sec = (x) => { const t = Math.abs(x) / (len / 2); return [B * Math.pow(Math.max(1 - Math.pow(t, 2.4), 0), 0.75) + 0.02, 0.52 + 0.4 * t * t, 0.32 * t * t * t]; };
  const hull = grid(xs, js, (x, j) => { const [, ys, yk] = sec(x), th = Math.abs(j) / m * Math.PI / 2; return yk + (ys - yk) * Math.pow(1 - Math.cos(th), 0.8); }, 8);
  for (let v = 0; v < hull.pos.length / 3; v++) {
    const x = hull.pos[v * 3], j = hull.pos[v * 3 + 2], [b] = sec(x);
    hull.pos[v * 3 + 2] = Math.sign(j) * b * Math.pow(Math.sin(Math.abs(j) / m * Math.PI / 2), 0.85); hull.uv[v * 2 + 1] = 8 + Math.abs(j) / m * 0.98;
  }
  for (let i = 0; i < hull.idx.length; i += 3) { const t = hull.idx[i + 1]; hull.idx[i + 1] = hull.idx[i + 2]; hull.idx[i + 2] = t; }
  computeNormals(hull);
  const fill = grid(xs, [-1, -0.6, 0, 0.6, 1], (x, j) => { const [, ys] = sec(x); return ys - 0.1 + 0.13 * Math.cos(j * 1.5) * (1 + 0.4 * snoise2(x * 1.3, j)); });
  for (let v = 0; v < fill.pos.length / 3; v++) fill.pos[v * 3 + 2] *= sec(fill.pos[v * 3])[0];
  computeNormals(fill);
  return merge([hull, fill, bx(0.09, 0.5, 0.12, 4, len / 2 - 0.02, 0.6), bx(0.09, 0.5, 0.12, 4, -len / 2 + 0.02, 0.6)]);
}

// ---- static village dressing in world space: pier, lamp posts, boats, drying rack, snow drifts at the door ----
export function village(pier, lamps, hAt, door, dyaw) {
  const P = [], [px, z1, z0, ph] = pier, len = z1 - z0, zc = (z0 + z1) / 2, bulbs = [];
  P.push(bx(2.5, 0.16, len, 4, px, ph - 0.16, zc, 1), mv(blanket(2.16, len - 0.1, 0.11, 0.13, 3), px - 1.08, ph - 0.01, zc));
  for (const sx of [1, -1]) {
    P.push(bx(0.17, 0.17, len, 4, px + sx * 1.17, ph - 0.03, zc), mv(blanket(0.21, len, 0.07, 0.09, sx + 4, 0, 1.5), px + sx * 1.17 - 0.105, ph + 0.13, zc));
    for (let z = z0 + 0.4; z < z1 - 4; z += 3.3) P.push(bx(0.27, 4.4, 0.27, 4, px + sx * 1.02, ph - 4.5, z));
    P.push(mv(setMat(cylinder(0.13, 0.11, 0.6, 8), 4), px + sx * 0.85, ph, z0 + 0.7), cap(0.3, 0.3, 0.1, px + sx * 0.85, ph + 0.58, z0 + 0.7, sx));
  }
  for (const [x, y, z] of lamps) {
    const a = Math.atan2(-x, -(z + 12));
    P.push(ry(merge([bx(0.13, 3.3, 0.13, 4), bx(0.07, 0.07, 0.55, 4, 0, 3.2, -0.27), bx(0.24, 0.28, 0.24, 7, 0, 2.86, -0.5), bx(0.36, 0.05, 0.36, 4, 0, 3.14, -0.5), cap(0.4, 0.4, 0.1, 0, 3.18, -0.5, 2)]), a, x, y, z));
    bulbs.push(x - Math.sin(a) * 0.5, y + 3.0, z - Math.cos(a) * 0.5);
  }
  const b = boat();
  P.push(ry(boat(), 1.5, px - 2.35, -0.14, -7), ry(boat(5.0, 0.78), 1.62, px + 2.3, -0.13, -11.5), ry(rx(b, 0.3), 0.6, -8.5, hAt(-8.5, 10.5) - 0.05, 10.5));
  // drying rack (hjell): A-frames + rails, snow on the top rails
  const R = [];
  for (let i = 0; i < 4; i++) for (const sg of [1, -1]) R.push(rz(bx(0.17, 6.7, 0.17, 4, sg * 2.25, -0.4), sg * 0.36, 0, 0, i * 3.6 - 5.4));
  for (const [x, y] of [[0, 5.75], [0.75, 3.9], [-0.75, 3.9], [1.42, 2.15], [-1.42, 2.15]]) R.push(bx(0.14, 0.14, 12.4, 4, x, y, 0), mv(blanket(0.2, 12.4, 0.09, 0.09, x, 0, 1.3), x - 0.1, y + 0.13, 0));
  P.push(ry(merge(R), 0.25, -16, hAt(-16, 24) - 0.6, 24));
  // snow drifted against the door frame
  for (const sg of [1, -1]) {
    const xs = [], zs = [];
    for (let i = 0; i <= 12; i++) { xs.push(sg * (0.46 + i * 0.17)); zs.push((i / 6 - 1) * 1.5); }
    P.push(ry(grid(xs, zs, (x, z) => { const u = Math.abs(x) - 0.78, k = 1 + 0.3 * snoise2(x * 2.1, z * 2.1 + sg); return 0.24 * k * Math.exp(-u * u / (u < 0 ? 0.07 : 0.4) - z * z / 0.3) + 0.012; }), dyaw, door[0], door[1], door[2]));
    if (sg < 0) { const g = P[P.length - 1]; for (let i = 0; i < g.idx.length; i += 3) { const t = g.idx[i + 1]; g.idx[i + 1] = g.idx[i + 2]; g.idx[i + 2] = t; } computeNormals(g); }
  }
  return { geo: merge(P), bulbs };
}

// ---- spruce: drooping tiers heavy with snow. uv.x = snow weight, height 9 at scale 1 ----
export function spruce(lod, seed) {
  const tiers = [8, 5, 3][lod], segs = [14, 9, 6][lod], H = 9, P = [setMat(cylinder(0.19, 0.05, H * 0.95, [6, 5, 4][lod], 1), 11, 0)];
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1), y0 = 1.25 + f * (H - 3.1), r = 2.25 * Math.pow(1 - f, 0.8) + 0.4, th = (H - 1.2) / tiers * 1.8 + 0.5;
    const rings = [[0.03, y0 + th, 0.95], [r * 0.5, y0 + th * 0.4, 0.8], [r, y0 - 0.22 * r, 0.42]];
    if (lod < 2) rings.push([r * 0.3, y0 + 0.15, 0]);
    const nr = rings.length, g = mk(nr * segs, (nr - 1) * segs * 6), a0 = h1(seed * 31 + k) * 6;
    let n = 0;
    for (let j = 0; j < nr; j++) for (let i = 0; i < segs; i++) {
      const v = j * segs + i, a = a0 + i / segs * 6.2832, jt = j === 2 ? 0.74 + 0.5 * h1(seed * 977 + k * 37 + i) : 1, rr = rings[j][0] * jt;
      g.pos[v * 3] = Math.cos(a) * rr; g.pos[v * 3 + 1] = rings[j][1] - (j === 2 ? (jt - 1) * 0.5 * r : 0); g.pos[v * 3 + 2] = Math.sin(a) * rr;
      g.uv[v * 2] = rings[j][2] + (j === 2 ? (jt - 1) * 0.5 : 0); g.uv[v * 2 + 1] = 10.5;
      if (j < nr - 1) { const b = j * segs + (i + 1) % segs; g.idx[n++] = v; g.idx[n++] = b; g.idx[n++] = v + segs; g.idx[n++] = b; g.idx[n++] = b + segs; g.idx[n++] = v + segs; }
    }
    P.push(computeNormals(g));
  }
  return merge(P);
}
