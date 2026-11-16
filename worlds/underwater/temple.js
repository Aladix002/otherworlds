// Sunken Doric temple + gateway ruins, amphorae and statues, merged into one static mesh (built once at load).
// uv.x = material (0 marble, 1 terracotta, 2 marble with painted meander, 3 starfish) + baked AO * 0.9,
// uv.y = height above the seabed (contact shade / algae band).
const TAU = Math.PI * 2;
const ss = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// column-major mat4 from Euler (R = Ry * Rx * Rz), translation and uniform scale
export function mat(rx, ry, rz, tx, ty, tz, s = 1) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  return [r00 * s, r10 * s, r20 * s, 0, r01 * s, r11 * s, r21 * s, 0, r02 * s, r12 * s, r22 * s, 0, tx, ty, tz, 1];
}

export function buildTemple(M, heightAt, PADY, door, rng, fg, THO, nest) {
  const parts = [], cols = [], boxes = [], shade = [], late = [];
  const add = (g, m, mat_ = 0) => { if (m) M.transform(g, m); for (let i = 0; i < g.uv.length; i += 2) g.uv[i] = mat_; parts.push(g); return g; };
  const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0, solid = true, mt = 0) => {
    add(M.box(w, h, d), mat(rx, ry, rz, x, y, z), mt);
    if (solid) boxes.push([x, y, z, w / 2, h / 2, d / 2, ry]);
  };
  const ell = (rx, ry, rz, x, y, z, sub = 2) => M.translate(M.scale(M.sphere(1, sub), rx, ry, rz), x, y, z);
  // fluted shaft (Doric, 20 flutes, entasis). broken = chunky fracture: a tilted plane with one stepped ledge
  const shaft = (r0, r1, h, broken, seed) => {
    const prof = [[0.001, 0], [r0, 0], [r0, 0]];
    const rings = Math.max(2, Math.round(h / 0.9));
    for (let j = 0; j <= rings; j++) { const f = j / rings; prof.push([r0 + (r1 - r0) * f + 0.025 * Math.sin(Math.PI * f), h * f]); }
    prof.push([r1, h], [r1 * 0.66, h], [r1 * 0.33, h], [0.001, h]);
    const S = 160, g = M.lathe(prof, S), n = prof.length;
    const ca = Math.cos(seed), sa = Math.sin(seed), cb = Math.cos(seed * 2.3 + 1), sb = Math.sin(seed * 2.3 + 1);
    for (let v = 0; v < g.pos.length / 3; v++) {
      const th = g.uv[v * 2] * TAU, row = Math.floor(v / (S + 1));
      const u = (th * 20 / TAU) % 1, k = 1 - 0.06 * Math.sin(Math.PI * u);
      if (row < n - 3) { g.pos[v * 3] *= k; g.pos[v * 3 + 2] *= k; }
      if (broken && row >= n - 5) {
        const x = g.pos[v * 3] / r1, z = g.pos[v * 3 + 2] / r1;
        g.pos[v * 3 + 1] += 0.2 * (x * ca + z * sa) + 0.11 * Math.tanh(5 * (x * cb + z * sb) + 0.8) - 0.12;
      }
    }
    return M.computeNormals(g);
  };
  const capital = (r) => {
    const p = [[r, 0], [r * 1.02, 0.05]];
    for (let i = 0; i <= 6; i++) { const f = i / 6; p.push([r * (1.05 + 0.4 * Math.sin(f * 1.4)), 0.08 + 0.24 * f]); }
    p.push([r * 1.4, 0.34], [0.001, 0.34]);
    return M.merge([M.lathe(p, 64), M.translate(M.box(r * 3.0, 0.2, r * 3.0), 0, 0.44, 0)]);
  };
  const R0 = 0.47, R1 = 0.38, H = 5.4, CAPH = 0.54;
  const column = (x, y, z, h) => {
    const full = h < 0, hh = full ? H : h;
    add(shaft(R0, full ? R1 : R0 + (R1 - R0) * hh / H, hh, !full, x * 3.1 + z), mat(0, rng() * TAU, 0, x, y, z));
    if (full) add(capital(R1), mat(0, 0, 0, x, y + H, z));
    cols.push([x, z, R0 + 0.05, y + (full ? H + CAPH : hh)]);
  };

  // ---- temple: stylobate (3 steps) ----
  const TZ = 44, TY = PADY + 0.8;
  for (let k = 0; k < 3; k++) box(16.3 - 0.9 * k, 0.3, 26.3 - 0.9 * k, 0, PADY + 0.05 + 0.3 * k, TZ, 0, 0, 0, true);
  shade.push([0, TZ, 8.15, 13.15]);
  const X = [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25], Zs = [8.75, 6.25, 3.75, 1.25, -1.25, -3.75, -6.25, -8.75];
  for (const x of X) column(x, TY, TZ + 11.25, -1);
  const left = [-1, -1, 2.6, 0, 1.1, -1, -1, 3.6], right = [-1, -1, -1, 4.2, 0, 1.8, -1, -1], back = [-1, 0, 2.3, -1, 0, 0.9];
  Zs.forEach((z, i) => { if (left[i]) column(-6.25, TY, TZ + z, left[i]); if (right[i]) column(6.25, TY, TZ + z, right[i]); });
  X.forEach((x, i) => { if (back[i]) column(x, TY, TZ - 11.25, back[i]); });
  // front entablature: architrave (meander band), frieze with triglyphs, cornice
  const ET = TY + H + CAPH;
  box(13.6, 0.7, 1.05, 0, ET + 0.35, TZ + 11.25, 0, 0, 0, true, 2);
  box(13.6, 0.62, 0.95, 0, ET + 1.01, TZ + 11.25, 0, 0, 0, false);
  for (let i = 0; i < 11; i++) for (let k = -1; k <= 1; k++) box(0.1, 0.56, 0.12, -6.25 + i * 1.25 + k * 0.14, ET + 1.01, TZ + 11.76, 0, 0, 0, false); // triglyphs
  for (let i = 0; i < 11; i++) box(0.44, 0.07, 0.14, -6.25 + i * 1.25, ET + 0.74, TZ + 11.78, 0, 0, 0, false);
  box(14.6, 0.2, 1.5, 0, ET + 1.42, TZ + 11.3);
  // pediment: recessed tympanum with a relief medallion, raking cornices, acroteria
  {
    const w = 7.1, h = 1.65, z0 = TZ + 10.75, z1 = TZ + 11.6, y0 = ET + 1.52;
    const P = [[-w, y0, z1], [w, y0, z1], [0, y0 + h, z1], [-w, y0, z0], [w, y0, z0], [0, y0 + h, z0]];
    const faces = [[0, 1, 2], [4, 3, 5], [1, 4, 5, 2], [3, 0, 2, 5], [3, 4, 1, 0]];
    for (const f of faces) {
      const g = { pos: new Float32Array(f.length * 3), nrm: new Float32Array(f.length * 3), uv: new Float32Array(f.length * 2), idx: new Uint32Array(f.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]) };
      f.forEach((p, i) => g.pos.set(P[p], i * 3));
      M.computeNormals(g); add(g);
    }
    box(14.2, 0.14, 1.3, 0, y0 + 0.05, TZ + 11.3, 0, 0, 0, false);
    const sl = Math.atan2(h, w), L = Math.hypot(w, h) + 0.2;
    for (const s of [-1, 1]) {
      box(L, 0.22, 1.5, s * w / 2, y0 + h / 2 + 0.12, TZ + 11.3, 0, 0, -s * sl, false);
      box(L - 0.5, 0.1, 1.3, s * w / 2, y0 + h / 2 - 0.05, TZ + 11.3, 0, 0, -s * sl, false);
      // corner acroteria + relief rosettes and reclining figures hinted as soft forms
      add(M.merge([ell(0.3, 0.42, 0.13, 0, 0.36, 0), ell(0.16, 0.16, 0.16, 0, 0, 0)]), mat(0, 0, -s * 0.45, s * 7.15, y0 + 0.35, TZ + 11.4));
      add(M.merge([M.torus(0.24, 0.05, 20, 8), ell(0.17, 0.06, 0.17, 0, 0, 0)]), mat(Math.PI / 2, 0, 0, s * 2.1, y0 + 0.5, z1));
      add(ell(0.75, 0.2, 0.12, 0, 0, 0), mat(0, 0, s * 0.16, s * 3.9, y0 + 0.36, z1));
      add(ell(0.17, 0.17, 0.12, 0, 0, 0), mat(0, 0, 0, s * 3.25, y0 + 0.62, z1));
    }
    add(M.merge([M.torus(0.52, 0.075, 32, 10), ell(0.4, 0.07, 0.4, 0, 0, 0, 3), ell(0.14, 0.12, 0.14, 0, 0, 0)]), mat(Math.PI / 2, 0, 0, 0, y0 + 0.78, z1));
    for (let i = 0; i < 8; i++) add(ell(0.045, 0.05, 0.14, 0, 0, 0, 1), mat(Math.PI / 2, 0, i * TAU / 8, 0.27 * Math.sin(i * TAU / 8), y0 + 0.78 + 0.27 * Math.cos(i * TAU / 8), z1 + 0.05, 1));
    add(M.merge([ell(0.44, 0.6, 0.14, 0, 0.55, 0, 3), ell(0.2, 0.2, 0.2, 0, 0, 0), M.translate(M.box(0.5, 0.2, 0.5), 0, -0.12, 0)]), mat(0, 0, 0, 0, y0 + h + 0.3, TZ + 11.3));
    boxes.push([0, y0 + h * 0.4, TZ + 11.3, w * 0.8, h * 0.45, 0.7, 0]);
  }
  // side entablature over the two front side columns
  for (const s of [-1, 1]) box(1.05, 1.32, 7.2, 6.25 * s, ET + 0.66, TZ + 8.0, 0, 0, 0, true, 2);
  // cella walls (ruined)
  const wall = (x0, x1, z0, z1, h) => box(Math.abs(x1 - x0) || 0.6, h, Math.abs(z1 - z0) || 0.6, (x0 + x1) / 2, TY + h / 2, TZ + (z0 + z1) / 2);
  wall(-3.6, -3.6, -7.5, -4, 2.4); wall(-3.6, -3.6, -4, -1, 1.2); wall(-3.6, -3.6, -1, 2, 0.5); wall(-3.6, -3.6, 2, 6.5, 1.8);
  wall(3.6, 3.6, -7.5, -3, 1.0); wall(3.6, 3.6, -3, 1, 2.8); wall(3.6, 3.6, 1, 6.5, 0.7);
  wall(-3.6, 3.6, -7.5, -7.5, 1.5); wall(-3.6, -1.2, 6.5, 6.5, 2.2); wall(1.2, 3.6, 6.5, 6.5, 0.8);
  // a fallen column across the stylobate and drums of another one on the sand
  add(shaft(R0 * 0.95, R1, 4.6, true, 7), mat(0, 0.35, Math.PI / 2 - 0.03, -1.0, TY + 0.45, TZ - 1.0));
  for (let i = 0; i < 4; i++) {
    const x = 9.2 + i * 1.45, z = TZ - 1.0 + i * 0.35 + (rng() - 0.5) * 0.4, r = R0 - i * 0.02;
    add(shaft(r, r, 1.3, false, i), mat(0, 0.25 + (rng() - 0.5) * 0.5, Math.PI / 2, x, heightAt(x, z) + r * 0.75, z));
    cols.push([x, z, 0.8, heightAt(x, z) + 1]);
    shade.push([x - 0.65, z, 0.7, 0.45]);
  }
  // fallen blocks
  const block = (x, z, w, h, d, ry) => {
    box(w, h, d, x, heightAt(x, z) + h * 0.25, z, ry, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
    shade.push([x, z, (w + d) / 4, (w + d) / 4]);
  };
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, rr = 9 + rng() * 6;
    block(Math.cos(a) * rr * 0.8, TZ + Math.sin(a) * rr * 1.2, 0.8 + rng() * 1.6, 0.6 + rng() * 0.4, 0.9, rng() * TAU);
  }

  // archaic head with a face (brow, almond eyes, nose, lips, chin, cheeks, ears, a row of curls), centred on the face, looking +z
  const head = (sub) => {
    const g = [ell(0.093, 0.12, 0.105, 0, 0, 0.012, sub), ell(0.102, 0.105, 0.108, 0, 0.038, -0.032, sub), ell(0.062, 0.062, 0.07, 0, 0.02, -0.15),
      ell(0.016, 0.034, 0.021, 0, -0.012, 0.112), ell(0.066, 0.011, 0.02, 0, 0.026, 0.098), ell(0.03, 0.02, 0.024, 0, -0.08, 0.083),
      ell(0.027, 0.007, 0.012, 0, -0.046, 0.105), ell(0.021, 0.007, 0.011, 0, -0.058, 0.1)];
    for (const s of [-1, 1]) g.push(ell(0.021, 0.0095, 0.011, s * 0.037, 0.008, 0.097), ell(0.012, 0.03, 0.02, s * 0.095, 0, -0.005));
    for (let i = -3; i <= 3; i++) g.push(ell(0.021, 0.021, 0.021, 0.093 * Math.sin(i * 0.4), 0.06, 0.008 + 0.1 * Math.cos(i * 0.4)));
    return M.merge(g);
  };
  // ---- statues: a kore (draped maiden) holding an offering bowl ----
  const kore = (m, hd, pedestal) => {
    const g = [];
    const p0 = [[0.001, 0]];
    for (let j = 0; j <= 10; j++) { const f = j / 10; p0.push([0.3 - 0.13 * Math.pow(f, 0.7), 0.02 + f * 1.0]); }
    const sk = M.lathe(p0, 72);
    for (let v = 0; v < sk.pos.length / 3; v++) {
      const th = sk.uv[v * 2] * TAU, f = sk.pos[v * 3 + 1];
      const k = 1 + 0.17 * (1 - f * 0.7) * Math.sin(9 * th + 1.5 * Math.sin(3 * th));
      sk.pos[v * 3] *= k; sk.pos[v * 3 + 2] *= k * 0.8;
    }
    g.push(M.computeNormals(sk));
    const to = M.lathe([[0.15, 0.84], [0.225, 0.86], [0.23, 0.9], [0.205, 0.98], [0.175, 1.05], [0.19, 1.16], [0.215, 1.28], [0.21, 1.38], [0.16, 1.46], [0.075, 1.5], [0.055, 1.54], [0.052, hd ? 1.63 : 1.57], [0.001, hd ? 1.63 : 1.56]], 32);
    for (let v = 0; v < to.pos.length / 3; v++) {
      const y = to.pos[v * 3 + 1], th = to.uv[v * 2] * TAU, k = 1 + 0.05 * ss(1.0, 0.86, y) * Math.sin(9 * th);
      to.pos[v * 3] *= (1 + 0.3 * ss(1.25, 1.42, y) * ss(1.52, 1.44, y)) * k; to.pos[v * 3 + 2] *= 0.72 * k;
    }
    g.push(M.computeNormals(to));
    g.push(M.tube([[0.25, 1.42, 0], [0.285, 1.2, -0.01], [0.285, 1.0, 0.03], [0.265, 0.83, 0.08]], (t) => 0.058 - 0.02 * t, 10), ell(0.035, 0.055, 0.03, 0.262, 0.8, 0.085));
    g.push(M.tube([[-0.25, 1.42, 0], [-0.285, 1.22, -0.01], [-0.27, 1.1, 0.07], [-0.21, 1.13, 0.3]], (t) => 0.058 - 0.02 * t, 10));
    g.push(M.translate(M.lathe([[0.001, 0], [0.05, 0.005], [0.105, 0.05], [0.1, 0.055], [0.001, 0.03]], 16), -0.2, 1.14, 0.37));
    if (hd) g.push(M.translate(head(3), 0, 1.73, 0), ell(0.085, 0.17, 0.05, 0, 1.57, -0.085));
    g.push(M.translate(M.box(0.74, 0.14, 0.74), 0, -0.07, 0));
    if (pedestal) g.push(M.translate(M.box(0.86, 0.86, 0.86), 0, -0.57, 0), M.translate(M.box(1.02, 0.1, 1.02), 0, -0.19, 0), M.translate(M.box(1.06, 0.14, 1.06), 0, -1.0, 0));
    return add(M.merge(g), m);
  };
  const sx = 9.4, sz = TZ + 15.5, sy = heightAt(sx, sz) + 1.2;
  kore(mat(0, 0.75, 0, sx, sy, sz, 1.4), true, true);
  late.push([sx, sy, sz, 0.55, 1.6, 0.55, 0]);
  shade.push([sx, sz, 0.74, 0.74]);
  const fx = -10.5, fz = TZ + 13;
  kore(mat(-Math.PI / 2 + 0.1, 2.2, 0.1, fx, heightAt(fx, fz) + 0.16, fz, 1.35), false, false);
  shade.push([fx - 0.6, fz + 0.9, 1.3, 0.5]);

  // ---- amphorae ----
  const amph = () => {
    const body = M.lathe([[0.001, 0], [0.06, 0.01], [0.12, 0.08], [0.185, 0.2], [0.215, 0.34], [0.21, 0.48], [0.17, 0.6], [0.11, 0.7], [0.065, 0.77], [0.058, 0.86], [0.085, 0.9], [0.09, 0.915], [0.06, 0.92], [0.05, 0.86]], 28);
    const hs = [-1, 1].map((s) => M.tube([[0.07 * s, 0.86, 0], [0.15 * s, 0.86, 0], [0.19 * s, 0.76, 0], [0.19 * s, 0.6, 0], [0.17 * s, 0.56, 0]], 0.018, 6));
    return M.merge([body, ...hs]);
  };
  const amphora = (x, z, lying, yaw, s = 1.1) => {
    const y = heightAt(x, z);
    add(amph(), lying ? mat(0, yaw, Math.PI / 2 - 0.15, x, y + 0.12 * s, z, s) : mat(0.12 * (rng() - 0.5), yaw, 0.15 * (rng() - 0.5), x, y - 0.12 * s, z, s), 1);
    shade.push(lying ? [x - Math.cos(yaw) * 0.45 * s, z + Math.sin(yaw) * 0.45 * s, 0.4 * s, 0.3 * s] : [x, z, 0.2 * s, 0.2 * s]);
  };
  const [dx, dy, dz] = door;
  [[7.4, TZ + 14.5, 1], [8.2, TZ + 13.6, 0], [-8.5, TZ + 16, 1], [-9.2, TZ - 5, 0], [10.5, TZ + 5, 1], [-3.5, TZ + 19, 1],
    [dx + 2.2, dz - 2.8, 1], [dx - 3.0, dz - 1.5, 0], [dx - 3.6, dz - 0.6, 1], [4, TZ + 24, 0], [dx + 1.6, dz - 5.2, 0], [dx - 1.9, dz - 6.5, 1], [dx + 3.9, dz + 0.9, 0]]
    .forEach(([x, z, l]) => amphora(x, z, l, rng() * TAU));
  for (const [x, z] of [[-1.0, TZ + 4.5], [2.2, TZ - 4]]) add(amph(), mat(0, rng() * TAU, Math.PI / 2 - 0.1, x, TY + 0.13, z, 1.1), 1);
  // foreground still life for the hero view: a big half-buried pithos, a small amphora and starfish
  const star = (x, z, s) => {
    const g = [ell(0.07, 0.035, 0.07, 0, 0, 0)];
    for (let k = 0; k < 5; k++) g.push(M.transform(ell(0.11, 0.028, 0.04, 0.1, 0, 0), mat(0, k * TAU / 5, 0, 0, 0, 0)));
    add(M.merge(g), mat((rng() - 0.5) * 0.2, rng() * TAU, 0, x, heightAt(x, z) + 0.02, z, s), 3);
  };
  add(amph(), mat(0.5, 0.9, 0.35, fg[0], heightAt(fg[0], fg[1]) - 0.35, fg[1], 1.55), 1);
  shade.push([fg[0], fg[1], 0.5, 0.5]);
  amphora(fg[0] + 1.9, fg[1] + 0.4, 1, 2.5, 1.0);
  star(fg[0] - 1.3, fg[1] + 1.2, 1.5); star(fg[0] + 0.6, fg[1] + 1.9, 1.1); star(6.5, TZ + 14.2, 1.3); star(-6.8, TZ + 15.2, 1.2);
  star(dx + 1.3, dz + 1.6, 1.3); star(dx - 1.5, dz - 2.6, 1.1); star(dx - 2.2, dz + 2.2, 1.0);

  // ---- gateway ruins around the door: flanking columns on plinths, flagstones, broken walls, rubble ----
  for (const [s, h] of [[-1, 3.3], [1, 2.1]]) {
    const x = dx + 2.7 * s;
    box(1.5, 0.5, 1.5, x, dy + 0.1, dz);
    box(1.25, 0.16, 1.25, x, dy + 0.42, dz, 0, 0, 0, false);
    column(x, dy + 0.45, dz, h);
    shade.push([x, dz, 0.75, 0.75]);
    // ruined wall stubs beyond the columns
    box(2.3, 1.0 + 0.5 * (s + 1), 0.7, x + 2.4 * s, dy + 0.3 + 0.2 * (s + 1), dz + 0.1 * s, 0.06 * s);
    box(1.1, 0.5, 0.66, x + 2.9 * s, dy + 1.0 + 0.45 * (s + 1), dz + 0.1 * s, 0.1 * s, 0, 0, false);
    shade.push([x + 2.4 * s, dz, 1.15, 0.35]);
  }
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    if (rng() < 0.2) continue;
    box(1.02 + rng() * 0.1, 0.12, 1.02 + rng() * 0.1, dx + i * 1.12 + (rng() - 0.5) * 0.06, dy - 0.045 + rng() * 0.012, dz + j * 1.12 + (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.05, 0, 0, false);
  }
  add(shaft(R0, R0, 1.3, true, 3), mat(0, 1.1, Math.PI / 2, dx + 4.8, heightAt(dx + 4.8, dz - 2.5) + 0.38, dz - 2.5));
  shade.push([dx + 4.5, dz - 3.1, 0.7, 0.5]);
  add(shaft(R0, R0, 1.5, true, 5), mat(0, -0.5, Math.PI / 2, dx - 4.6, heightAt(dx - 4.6, dz - 4.5) + 0.36, dz - 4.5));
  shade.push([dx - 5.2, dz - 4.8, 0.75, 0.5]);
  add(capital(R1), mat(1.2, 0.4, 0.2, dx + 2.6, heightAt(dx + 2.6, dz - 6.8) + 0.3, dz - 6.8));
  block(dx + 3.4, dz - 4.6, 1.5, 0.6, 0.8, 0.5); block(dx - 3.3, dz - 3.9, 1.1, 0.55, 0.8, 2.0); block(dx - 5.6, dz + 2.2, 1.3, 0.6, 0.9, 1.0);
  block(dx + 5.8, dz + 2.6, 0.9, 0.5, 0.8, 0.3); block(dx + 0.9, dz - 8.6, 1.7, 0.6, 0.8, 1.2); block(dx - 1.4, dz + 4.6, 1.2, 0.5, 0.8, 2.6);

  // ---- a colossal marble head resting in the kelp clearing ----
  const cx = 18.2, cz = -77.5, cy = heightAt(cx, cz) + 0.7;
  add(M.merge([head(4), M.translate(M.cylinder(0.062, 0.07, 0.1, 24, 1), 0, -0.14, -0.02)]), mat(-0.95, 0.3, 0.22, cx, cy, cz, 12));
  // ---- tholos: a round shrine on the way to the kelp. Three columns still carry their lintels; a pearl glows on the altar ----
  const hx = THO[0], hz = THO[1], hy = heightAt(hx, hz) + 0.9;
  add(M.lathe([[0.001, -3], [5.3, -3], [5.3, -0.6], [4.9, -0.6], [4.9, -0.3], [4.5, -0.3], [4.5, 0], [0.001, 0]], 48), mat(0, 0, 0, hx, hy, hz));
  cols.push([hx, hz, 4.6, hy]);
  [-1, -1, -1, 2.4, 0.9, 0, 3.4, 1.5].forEach((h, k) => {
    const a = k * TAU / 8 + 0.2, am = a + TAU / 16, x = hx + 3.42 * Math.cos(am), z = hz + 3.42 * Math.sin(am), ry = Math.atan2(-Math.cos(am), -Math.sin(am));
    if (h) column(hx + 3.7 * Math.cos(a), hy, hz + 3.7 * Math.sin(a), h);
    if (k < 2) { box(3.15, 0.62, 0.95, x, hy + H + CAPH + 0.31, z, ry); box(3.4, 0.18, 1.25, x, hy + H + CAPH + 0.71, z, ry, 0, 0, false); }
  });
  box(2.9, 0.62, 0.95, hx + 6.3, heightAt(hx + 6.3, hz - 2) + 0.15, hz - 2, 0.5, 0.2, 0.1);
  add(shaft(R0, R0, 1.4, true, 2), mat(0, 2.2, Math.PI / 2, hx - 1.5, heightAt(hx - 1.5, hz + 6.6) + 0.36, hz + 6.6));
  add(M.merge([M.lathe([[0.001, 0], [0.7, 0], [0.7, 0.1], [0.55, 0.16], [0.5, 0.8], [0.62, 0.9], [0.62, 1], [0.001, 1]], 32),
    M.lathe([[0.001, 1], [0.3, 1.02], [0.75, 1.22], [0.72, 1.25], [0.3, 1.1], [0.001, 1.08]], 32)]), mat(0, 0, 0, hx, hy, hz));
  add(M.sphere(0.2, 3), mat(0, 0, 0, hx, hy + 1.27, hz), 4);
  cols.push([hx, hz, 0.8, hy + 1.3]);
  // ---- a big broken pithos (the moray's home) ----
  const px = -4.5, pz = 68.5, yw = 1.87, py = heightAt(px, pz) + 0.22, ax = [-0.989 * Math.cos(yw), 0.149, 0.989 * Math.sin(yw)];
  add(M.lathe([[0.001, 0], [0.06, 0.01], [0.12, 0.08], [0.185, 0.2], [0.215, 0.34], [0.21, 0.48], [0.17, 0.6], [0.14, 0.66], [0.125, 0.65], [0.15, 0.56], [0.18, 0.4], [0.001, 0.25]], 28),
    mat(0, yw, Math.PI / 2 - 0.15, px, py, pz, 1.7), 1);
  const eel = [px + ax[0] * 0.87, py + ax[1] * 0.87, pz + ax[2] * 0.87, ...ax];
  // ---- turtle nest: eggs in a ring of stones ----
  for (let i = 0; i < 18; i++) {
    const a = i * 0.7 + rng(), r = i < 9 ? 0.55 + 0.1 * rng() : 0.04 + 0.03 * (i - 9) * (0.5 + rng()), x = nest[0] + r * Math.cos(a), z = nest[1] + r * Math.sin(a);
    add(i < 9 ? ell(0.13 + 0.05 * rng(), 0.07, 0.1, 0, 0, 0) : ell(0.06, 0.07, 0.06, 0, 0, 0), mat(0, a, 0, x, heightAt(x, z) + 0.03, z), i < 9 ? 0 : 5);
  }
  star(nest[0] - 1.1, nest[1] + 0.7, 1.2);

  const geo = M.merge(parts);
  // bake: uv.y = height above the seabed, uv.x += ambient occlusion from the colliders
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const c of cols) {
      const r = Math.hypot(x - c[0], z - c[1]) - c[2], dy = y - c[3];
      d = Math.min(d, dy > 0 ? Math.hypot(Math.max(r, 0), dy) : r);
    }
    for (const b of boxes) {
      const px = x - b[0], pz = z - b[2], c = Math.cos(b[6]), s = Math.sin(b[6]);
      const qx = Math.abs(c * px - s * pz) - b[3], qy = Math.abs(y - b[1]) - b[4], qz = Math.abs(s * px + c * pz) - b[5];
      d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0));
    }
    return d;
  };
  const P = geo.pos, Nn = geo.nrm;
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx = Nn[v * 3], ny = Nn[v * 3 + 1], nz = Nn[v * 3 + 2];
    geo.uv[v * 2 + 1] = y - heightAt(x, z);
    let ao = Math.min((sdf(x + nx * 0.3, y + ny * 0.3, z + nz * 0.3) + 0.1) / 0.27, (sdf(x + nx, y + ny, z + nz) + 0.15) / 0.9,
      sdf(x + nx * 0.6, y + ny * 0.6 + 1.3, z + nz * 0.6) / 0.8 + 0.35);
    ao = ao < 0.22 ? 0.22 : ao > 1 ? 1 : ao;
    geo.uv[v * 2] += ao * 0.9;
  }
  boxes.push(...late); cols.push([cx, cz, 1.3, cy + 1.1]);
  return { geo, cols, boxes, shade, eel, oct: [5, TY, TZ + 11.6], thoY: hy };
}
