// Procedural geometry. A "geo" is { pos: Float32Array(3n), nrm: Float32Array(3n), uv: Float32Array(2n), idx: Uint32Array }.
// upload() interleaves pos/nrm/uv (32 bytes per vertex) to match `layout` (shader locations 0,1,2).
import { snoise2 } from './noise.js';

export const layout = {
  arrayStride: 32, stepMode: 'vertex',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
  ],
};
// per-instance vertex buffer layout from a list of formats, e.g. instanceLayout(['float32x4','float32x4'], 3)
const FSIZE = { float32: 4, float32x2: 8, float32x3: 12, float32x4: 16, uint32: 4, uint32x2: 8, uint32x4: 16, unorm8x4: 4, float16x4: 8, sint32: 4 };
export function instanceLayout(formats, startLocation = 3) {
  let offset = 0;
  const attributes = formats.map((format, i) => { const a = { shaderLocation: startLocation + i, offset, format }; offset += FSIZE[format]; return a; });
  return { arrayStride: offset, stepMode: 'instance', attributes };
}

function make(nv, ni) { return { pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), idx: new Uint32Array(ni) }; }

// XZ grid centered at origin, y = 0, normals +Y, uv 0..1
export function plane(w = 1, d = 1, sx = 1, sz = 1) {
  const g = make((sx + 1) * (sz + 1), sx * sz * 6);
  let v = 0;
  for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++, v++) {
    g.pos[v * 3] = (i / sx - 0.5) * w; g.pos[v * 3 + 2] = (j / sz - 0.5) * d; g.nrm[v * 3 + 1] = 1;
    g.uv[v * 2] = i / sx; g.uv[v * 2 + 1] = j / sz;
  }
  let k = 0;
  for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) {
    const a = j * (sx + 1) + i, b = a + 1, c = a + sx + 1, e = c + 1;
    g.idx[k++] = a; g.idx[k++] = c; g.idx[k++] = b; g.idx[k++] = b; g.idx[k++] = c; g.idx[k++] = e;
  }
  return g;
}

// axis-aligned box centered at origin (flat normals, 24 verts)
export function box(w = 1, h = 1, d = 1) {
  const g = make(24, 36);
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  const s = [w / 2, h / 2, d / 2];
  let v = 0, k = 0;
  for (const [n, u, t, sg] of faces) {
    for (let c = 0; c < 4; c++) {
      const cu = (c & 1) ? 1 : -1, cv = (c & 2) ? 1 : -1;
      const p = [0, 0, 0];
      p[n] = sg * s[n]; p[u] = cu * s[u] * sg; p[t] = cv * s[t];
      g.pos.set(p, v * 3); g.nrm[v * 3 + n] = sg; g.uv[v * 2] = (cu + 1) / 2; g.uv[v * 2 + 1] = (cv + 1) / 2; v++;
    }
    const b = v - 4;
    g.idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], k); k += 6;
  }
  return g;
}

// icosphere radius r, subdiv 0..5 (smooth normals, equirect-ish uv)
export function sphere(r = 1, subdiv = 2) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map(); const nf = [];
    const mid = (a, b) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (cache.has(key)) return cache.get(key);
      const p = verts[a].map((x, i) => (x + verts[b][i]) / 2); const l = Math.hypot(...p);
      verts.push(p.map((x) => x / l)); cache.set(key, verts.length - 1); return verts.length - 1;
    };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  const g = make(verts.length, faces.length * 3);
  verts.forEach((p, i) => {
    g.pos[i * 3] = p[0] * r; g.pos[i * 3 + 1] = p[1] * r; g.pos[i * 3 + 2] = p[2] * r; g.nrm.set(p, i * 3);
    g.uv[i * 2] = Math.atan2(p[2], p[0]) / (2 * Math.PI) + 0.5; g.uv[i * 2 + 1] = Math.acos(Math.max(-1, Math.min(1, p[1]))) / Math.PI;
  });
  faces.forEach((f, i) => { g.idx[i * 3] = f[0]; g.idx[i * 3 + 1] = f[1]; g.idx[i * 3 + 2] = f[2]; });
  return g;
}

// surface of revolution around Y. profile = [[radius, y], ...] bottom to top. uv.x = angle, uv.y = profile index / (n-1)
export function lathe(profile, segs = 16) {
  const n = profile.length;
  const g = make(n * (segs + 1), (n - 1) * segs * 6);
  for (let j = 0; j < n; j++) {
    const [r, y] = profile[j];
    const a = profile[Math.max(0, j - 1)], b = profile[Math.min(n - 1, j + 1)];
    let dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l; // tangent
    for (let i = 0; i <= segs; i++) {
      const v = j * (segs + 1) + i, th = (i / segs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      g.pos[v * 3] = r * c; g.pos[v * 3 + 1] = y; g.pos[v * 3 + 2] = r * s;
      g.nrm[v * 3] = dy * c; g.nrm[v * 3 + 1] = -dr; g.nrm[v * 3 + 2] = dy * s;
      g.uv[v * 2] = i / segs; g.uv[v * 2 + 1] = j / (n - 1);
    }
  }
  let k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    g.idx[k++] = a; g.idx[k++] = c; g.idx[k++] = b; g.idx[k++] = b; g.idx[k++] = c; g.idx[k++] = d;
  }
  return g;
}
export function cylinder(rBottom = 0.5, rTop = 0.5, h = 1, segs = 16, rings = 1) {
  const prof = []; for (let j = 0; j <= rings; j++) prof.push([rBottom + (rTop - rBottom) * (j / rings), h * (j / rings)]);
  return lathe(prof, segs);
}
export const cone = (r = 0.5, h = 1, segs = 16) => lathe([[r, 0], [r * 0.5, h * 0.5], [0.0001, h]], segs);

export function torus(R = 1, r = 0.25, segs = 24, ring = 12) {
  const g = make((segs + 1) * (ring + 1), segs * ring * 6);
  for (let j = 0; j <= ring; j++) for (let i = 0; i <= segs; i++) {
    const v = j * (segs + 1) + i, u = (i / segs) * Math.PI * 2, w = (j / ring) * Math.PI * 2;
    const cx = Math.cos(u), sx = Math.sin(u), cw = Math.cos(w), sw = Math.sin(w);
    g.pos[v * 3] = (R + r * cw) * cx; g.pos[v * 3 + 1] = r * sw; g.pos[v * 3 + 2] = (R + r * cw) * sx;
    g.nrm[v * 3] = cw * cx; g.nrm[v * 3 + 1] = sw; g.nrm[v * 3 + 2] = cw * sx; g.uv[v * 2] = i / segs; g.uv[v * 2 + 1] = j / ring;
  }
  let k = 0;
  for (let j = 0; j < ring; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    g.idx[k++] = a; g.idx[k++] = c; g.idx[k++] = b; g.idx[k++] = b; g.idx[k++] = c; g.idx[k++] = d;
  }
  return g;
}

// tube along a polyline path [[x,y,z],...] with radius (number or fn(t)), uv.y = t along path
export function tube(path, radius = 0.1, segs = 8) {
  const n = path.length, g = make(n * (segs + 1), (n - 1) * segs * 6);
  let px = 0, py = 0, pz = 1; // reference normal, parallel-transported
  for (let j = 0; j < n; j++) {
    const a = path[Math.max(0, j - 1)], b = path[Math.min(n - 1, j + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    if (j === 0) { if (Math.abs(ty) < 0.9) { px = 0; py = 1; pz = 0; } else { px = 1; py = 0; pz = 0; } }
    const d = px * tx + py * ty + pz * tz; px -= d * tx; py -= d * ty; pz -= d * tz; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const bx = ty * pz - tz * py, by = tz * px - tx * pz, bz = tx * py - ty * px;
    const t = j / (n - 1), r = typeof radius === 'function' ? radius(t) : radius;
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), v = j * (segs + 1) + i;
      const nx = px * c + bx * s, ny = py * c + by * s, nz = pz * c + bz * s;
      g.pos[v * 3] = path[j][0] + nx * r; g.pos[v * 3 + 1] = path[j][1] + ny * r; g.pos[v * 3 + 2] = path[j][2] + nz * r;
      g.nrm[v * 3] = nx; g.nrm[v * 3 + 1] = ny; g.nrm[v * 3 + 2] = nz; g.uv[v * 2] = i / segs; g.uv[v * 2 + 1] = t;
    }
  }
  let k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    g.idx[k++] = a; g.idx[k++] = b; g.idx[k++] = c; g.idx[k++] = b; g.idx[k++] = d; g.idx[k++] = c;
  }
  return g;
}

// lumpy rock: icosphere displaced by noise, flattened bottom. Deterministic per seed.
export function rock(seed = 1, subdiv = 2, roughness = 0.35) {
  const g = sphere(1, subdiv);
  const ox = seed * 13.17, oy = seed * 7.31;
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    let d = 1 + roughness * (0.6 * snoise2(x * 1.3 + ox, z * 1.3 + y * 0.7 + oy) + 0.3 * snoise2(y * 2.7 + oy, x * 2.7 - z + ox) + 0.12 * snoise2(z * 5.1, y * 5.1 + x));
    let ny = y * d; if (ny < -0.35) ny = -0.35 + (ny + 0.35) * 0.25;
    g.pos[i] = x * d; g.pos[i + 1] = ny; g.pos[i + 2] = z * d;
  }
  return computeNormals(g);
}

export function computeNormals(g) {
  const n = g.nrm; n.fill(0);
  const p = g.pos, idx = g.idx;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return g;
}
// apply a column-major mat4 (e.g. from ctx.math.trsY) to a geo, in place
export function transform(g, m) {
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    g.pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; g.pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; g.pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const a = g.nrm[i], b = g.nrm[i + 1], c = g.nrm[i + 2];
    const nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1; g.nrm[i] = nx / l; g.nrm[i + 1] = ny / l; g.nrm[i + 2] = nz / l;
  }
  return g;
}
export function translate(g, x, y, z) { for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += x; g.pos[i + 1] += y; g.pos[i + 2] += z; } return g; }
export function scale(g, sx, sy = sx, sz = sx) {
  for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] *= sx; g.pos[i + 1] *= sy; g.pos[i + 2] *= sz; }
  if (sx !== sy || sy !== sz) for (let i = 0; i < g.nrm.length; i += 3) {
    const a = g.nrm[i] / sx, b = g.nrm[i + 1] / sy, c = g.nrm[i + 2] / sz, l = Math.hypot(a, b, c) || 1; g.nrm[i] = a / l; g.nrm[i + 1] = b / l; g.nrm[i + 2] = c / l;
  }
  return g;
}
export function merge(geos) {
  let nv = 0, ni = 0; for (const g of geos) { nv += g.pos.length / 3; ni += g.idx.length; }
  const o = make(nv, ni); let v = 0, k = 0;
  for (const g of geos) {
    o.pos.set(g.pos, v * 3); o.nrm.set(g.nrm, v * 3); o.uv.set(g.uv, v * 2);
    for (let i = 0; i < g.idx.length; i++) o.idx[k++] = g.idx[i] + v;
    v += g.pos.length / 3;
  }
  return o;
}
export function interleave(g) {
  const n = g.pos.length / 3, out = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) { out.set(g.pos.subarray(i * 3, i * 3 + 3), i * 8); out.set(g.nrm.subarray(i * 3, i * 3 + 3), i * 8 + 3); out.set(g.uv.subarray(i * 2, i * 2 + 2), i * 8 + 6); }
  return out;
}
// -> { vertexBuffer, indexBuffer, indexCount, indexFormat, draw(pass, instances=1, firstInstance=0) }
export function upload(ctx, g, label) {
  const vertexBuffer = ctx.buffer(interleave(g), 'vertex', label);
  const small = g.pos.length / 3 < 65536;
  const idx = small ? Uint16Array.from(g.idx) : g.idx;
  const pad = small && idx.length % 2 ? Uint16Array.from([...idx, 0]) : idx;
  const indexBuffer = ctx.buffer(pad, 'index', label);
  const m = { vertexBuffer, indexBuffer, indexCount: g.idx.length, indexFormat: small ? 'uint16' : 'uint32' };
  m.draw = (pass, instances = 1, firstInstance = 0) => {
    pass.setVertexBuffer(0, m.vertexBuffer); pass.setIndexBuffer(m.indexBuffer, m.indexFormat);
    pass.drawIndexed(m.indexCount, instances, 0, 0, firstInstance);
  };
  return m;
}
