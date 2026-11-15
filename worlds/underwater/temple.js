// Sunken Doric temple + gateway ruins, amphorae and statues, merged into one static mesh (built once at load).
// uv.x = material (0 marble, 1 terracotta), uv.y = height above the seabed (AO / algae).
const TAU = Math.PI * 2;

// column-major mat4 from Euler (X then Y then Z applied as Rz*Ry*Rx), translation and uniform scale
export function mat(rx, ry, rz, tx, ty, tz, s = 1) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  return [r00 * s, r10 * s, r20 * s, 0, r01 * s, r11 * s, r21 * s, 0, r02 * s, r12 * s, r22 * s, 0, tx, ty, tz, 1];
}

export function buildTemple(M, heightAt, PADY, door, rng) {
  const parts = [], cols = [], boxes = [];
  const add = (g, m, mat_ = 0) => { if (m) M.transform(g, m); for (let i = 0; i < g.uv.length; i += 2) g.uv[i] = mat_; parts.push(g); return g; };
  const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0, solid = true) => {
    add(M.box(w, h, d), mat(rx, ry, rz, x, y, z));
    if (solid) boxes.push([x, y, z, w / 2, h / 2, d / 2, ry]);
  };
  // fluted shaft (Doric, 20 flutes, entasis). top = jagged break when broken
  const shaft = (r0, r1, h, broken, seed) => {
    const prof = [[0.001, 0], [r0, 0], [r0, 0]];
    const rings = Math.max(2, Math.round(h / 0.9));
    for (let j = 0; j <= rings; j++) { const f = j / rings; prof.push([r0 + (r1 - r0) * f + 0.025 * Math.sin(Math.PI * f), h * f]); }
    prof.push([r1, h], [0.001, h]);
    const g = M.lathe(prof, 80), n = prof.length;
    for (let v = 0; v < g.pos.length / 3; v++) {
      const th = g.uv[v * 2] * TAU, row = Math.floor(v / 81);
      const u = (th * 20 / TAU) % 1, k = 1 - 0.055 * Math.sin(Math.PI * u);
      g.pos[v * 3] *= k; g.pos[v * 3 + 2] *= k;
      if (broken && row >= n - 3) g.pos[v * 3 + 1] += row === n - 1 ? -0.05 : 0.16 * Math.sin(3 * th + seed) + 0.1 * Math.cos(th * 7 + seed * 2);
    }
    return M.computeNormals(g);
  };
  const capital = (r) => M.merge([
    M.lathe([[r, 0], [r * 1.04, 0.06], [r * 1.3, 0.24], [r * 1.42, 0.32], [0.001, 0.32]], 32),
    M.translate(M.box(r * 3.0, 0.22, r * 3.0), 0, 0.43, 0),
  ]);
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
  const X = [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25], Zs = [8.75, 6.25, 3.75, 1.25, -1.25, -3.75, -6.25, -8.75];
  for (const x of X) column(x, TY, TZ + 11.25, -1);
  const left = [-1, -1, 2.6, 0, 1.1, -1, -1, 3.6], right = [-1, -1, -1, 4.2, 0, 1.8, -1, -1], back = [-1, 0, 2.3, -1, 0, 0.9];
  Zs.forEach((z, i) => { if (left[i]) column(-6.25, TY, TZ + z, left[i]); if (right[i]) column(6.25, TY, TZ + z, right[i]); });
  X.forEach((x, i) => { if (back[i]) column(x, TY, TZ - 11.25, back[i]); });
  // front entablature + pediment
  const ET = TY + H + CAPH;
  box(13.6, 0.7, 1.05, 0, ET + 0.35, TZ + 11.25);
  box(13.6, 0.62, 0.95, 0, ET + 1.01, TZ + 11.25, 0, 0, 0, false);
  for (let i = 0; i < 11; i++) box(0.38, 0.6, 0.12, -6.25 + i * 1.25, ET + 1.01, TZ + 11.78, 0, 0, 0, false); // triglyphs
  box(14.6, 0.2, 1.5, 0, ET + 1.42, TZ + 11.3);
  // pediment: triangular prism
  {
    const w = 7.1, h = 1.65, z0 = TZ + 10.75, z1 = TZ + 11.85, y0 = ET + 1.52;
    const P = [[-w, y0, z1], [w, y0, z1], [0, y0 + h, z1], [-w, y0, z0], [w, y0, z0], [0, y0 + h, z0]];
    const faces = [[0, 1, 2], [4, 3, 5], [1, 4, 5, 2], [3, 0, 2, 5], [3, 4, 1, 0]];
    for (const f of faces) {
      const g = { pos: new Float32Array(f.length * 3), nrm: new Float32Array(f.length * 3), uv: new Float32Array(f.length * 2), idx: new Uint32Array(f.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]) };
      f.forEach((p, i) => g.pos.set(P[p], i * 3));
      M.computeNormals(g); add(g);
    }
    box(14.2, 0.14, 1.3, 0, y0 + 0.05, TZ + 11.3, 0, 0, 0, false);
    // raking cornice
    const sl = Math.atan2(h, w), L = Math.hypot(w, h) + 0.2;
    box(L, 0.2, 1.45, -w / 2, y0 + h / 2 + 0.12, TZ + 11.3, 0, 0, sl, false);
    box(L, 0.2, 1.45, w / 2, y0 + h / 2 + 0.12, TZ + 11.3, 0, 0, -sl, false);
    boxes.push([0, y0 + h * 0.4, TZ + 11.3, w * 0.8, h * 0.45, 0.7, 0]);
  }
  // side entablature over the two front side columns
  for (const s of [-1, 1]) box(1.05, 1.32, 7.2, 6.25 * s, ET + 0.66, TZ + 8.0);
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
  }
  // fallen blocks
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, rr = 9 + rng() * 6, x = Math.cos(a) * rr * 0.8, z = TZ + Math.sin(a) * rr * 1.2;
    const w = 0.8 + rng() * 1.6;
    box(w, 0.6 + rng() * 0.4, 0.9, x, heightAt(x, z) + 0.15, z, rng() * TAU, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
  }

  // ---- statues (kouros, arms broken off) ----
  const statue = (m, pedestal, head) => {
    const g = [];
    const ell = (rx, ry, rz, x, y, z) => g.push(M.translate(M.scale(M.sphere(1, 2), rx, ry, rz), x, y, z));
    for (const s of [-1, 1]) g.push(M.translate(M.cylinder(0.075, 0.115, 0.85, 10, 2), 0.11 * s, 0.05, s * 0.04));
    for (const s of [-1, 1]) g.push(M.translate(M.cylinder(0.11, 0.13, 0.08, 10), 0.11 * s, 0.0, 0.08 * s + 0.04));
    ell(0.22, 0.2, 0.15, 0, 0.98, 0); ell(0.24, 0.32, 0.15, 0, 1.3, 0); ell(0.27, 0.12, 0.16, 0, 1.55, 0);
    for (const s of [-1, 1]) ell(0.075, 0.12, 0.075, 0.27 * s, 1.5, 0);
    g.push(M.translate(M.cylinder(0.06, 0.055, head ? 0.14 : 0.07, 10), 0, 1.62, 0));
    if (head) ell(0.11, 0.14, 0.12, 0, 1.86, 0.01);
    if (pedestal) g.push(M.translate(M.box(0.8, 0.9, 0.8), 0, -0.45, 0));
    const s = M.merge(g); M.computeNormals(s);
    return add(s, m);
  };
  const sx = 9.4, sz = TZ + 15.5, sy = heightAt(sx, sz) + 0.75;
  statue(mat(0, -0.4, 0, sx, sy, sz, 1.35), true, false);
  boxes.push([sx, sy, sz, 0.5, 1.5, 0.5, 0]);
  const fx = -10.5, fz = TZ + 13;
  statue(mat(-Math.PI / 2 + 0.08, 2.2, 0.1, fx, heightAt(fx, fz) + 0.18, fz, 1.3), false, true);

  // ---- amphorae ----
  const amph = () => {
    const body = M.lathe([[0.001, 0], [0.06, 0.01], [0.13, 0.1], [0.21, 0.32], [0.2, 0.52], [0.12, 0.7], [0.065, 0.77], [0.06, 0.88], [0.085, 0.9], [0.06, 0.92], [0.001, 0.9]], 18);
    const hs = [-1, 1].map((s) => M.transform(M.torus(0.085, 0.017, 10, 6), mat(Math.PI / 2, 0, 0, 0.1 * s, 0.8, 0)));
    return M.merge([body, ...hs]);
  };
  const amphora = (x, z, lying, yaw) => {
    const y = heightAt(x, z);
    add(amph(), lying ? mat(0, yaw, Math.PI / 2 - 0.15, x, y + 0.12, z, 1.1) : mat(0.12 * (rng() - 0.5), yaw, 0.15 * (rng() - 0.5), x, y - 0.12, z, 1.1), 1);
  };
  [[7.4, TZ + 14.5, 1], [8.2, TZ + 13.6, 0], [-8.5, TZ + 16, 1], [-9.2, TZ - 5, 0], [10.5, TZ + 5, 1], [-3.5, TZ + 19, 1],
    [door[0] + 2.2, door[1] - 2.8, 1], [door[0] - 3.0, door[1] - 1.5, 0], [door[0] - 3.6, door[1] - 0.6, 1], [4, TZ + 24, 0]]
    .forEach(([x, z, l]) => amphora(x, z, l, rng() * TAU));
  for (const [x, z] of [[-1.0, TZ + 4.5], [2.2, TZ - 4]]) add(amph(), mat(0, rng() * TAU, Math.PI / 2 - 0.1, x, TY + 0.13, z, 1.1), 1);

  // ---- gateway ruins around the door ----
  const [dx, dy, dz] = door;
  for (const [s, h] of [[-1, 3.3], [1, 2.1]]) {
    const x = dx + 2.7 * s;
    box(1.4, 0.5, 1.4, x, dy + 0.1, dz);
    column(x, dy + 0.35, dz, h);
  }
  add(shaft(R0, R0, 1.3, true, 3), mat(0, 1.1, Math.PI / 2, dx + 4.8, heightAt(dx + 4.8, dz - 2.5) + 0.38, dz - 2.5));

  const geo = M.merge(parts);
  // uv.y = height above the seabed
  for (let v = 0; v < geo.pos.length / 3; v++) geo.uv[v * 2 + 1] = geo.pos[v * 3 + 1] - heightAt(geo.pos[v * 3], geo.pos[v * 3 + 2]);
  return { geo, cols, boxes };
}
