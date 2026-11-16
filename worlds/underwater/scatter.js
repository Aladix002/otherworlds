// Load-time placement of rocks and blade flora (seagrass, anemones, soft corals, sea pens).
export function scatter(H, N, rng, q, padTest, keep, SEAH) {
  const rocks = [], blades = [], R = [];
  const free = (x, z, r) => { for (let i = 0; i < R.length; i += 4) if (Math.hypot(R[i] - x, R[i + 2] - z) < R[i + 3] + r) return false; return true; };
  const rock = (x, z, s, deep) => {
    const y = H(x, z) - s * 0.3, sq = 0.55 + rng() * 0.35;
    rocks.push(x, y, z, s, rng() * 6.283, rng(), sq, deep ? 1 : 0);
    R.push(x, y + s * sq * 0.2, z, s * 0.85);
  };
  // kelp-zone and deep-slope boulders
  const nr = [70, 110, 150][q];
  for (let i = 0, tries = 0; i < nr && tries < 5000; tries++) {
    const deep = i > nr * 0.55, x = rng() * 200 - 100, z = deep ? -140 - rng() * 165 : -8 - rng() * 132;
    const s = deep ? 1.5 + Math.pow(rng(), 2) * 6 : 0.7 + Math.pow(rng(), 2.5) * 3.5;
    if (Math.hypot(x - 10, z + 70) < 20 || !free(x, z, s) || keep.some((k) => Math.hypot(k[0] - x, k[2] - z) < s + 6)) continue;
    rock(x, z, s, deep); i++;
  }
  // a few rocks framing the shallows
  for (let i = 0, tries = 0; i < 18 && tries < 2000; tries++) {
    const x = (rng() < 0.5 ? -1 : 1) * (28 + rng() * 50), z = 10 + rng() * 115, s = 0.8 + rng() * 2.2;
    if (padTest(x, z) < 6 || !free(x, z, s)) continue;
    rock(x, z, s, false); i++;
  }
  // boulders along the shore behind the door, so the sand does not end in a bare horizon
  for (let i = 0, tries = 0; i < 16 && tries < 2000; tries++) {
    const x = rng() * 110 - 45, z = 117 + rng() * 16, s = 1.4 + rng() * 2.8;
    if (!free(x, z, s)) continue;
    rock(x, z, s, false); i++;
  }
  const blade = (x, y, z, yaw, h, w, ty) => blades.push(x, y, z, yaw, h, w, ty, rng() * 6.283);
  // seagrass: clumps of varied size gathered into meadows, bare sand between them
  const near = (x, z, r) => keep.some((k) => Math.hypot(k[0] - x, k[2] - z) < r);
  const ng = [5000, 11000, 18000][q];
  for (let i = 0, tries = 0; i < ng && tries < ng * 6; tries++) {
    const x = rng() * 150 - 75, z = 4 + rng() * 128;
    // (a guaranteed lush meadow where the seahorses live)
    const m = Math.max(N.fbm2(x * 0.065 + 3.3, z * 0.065 - 1.1, 3) + 0.25 * N.fbm2(x * 0.3, z * 0.3 + 5, 1), 0.75 - 0.14 * Math.hypot(x - SEAH[0], z - SEAH[1]));
    if (m < 0.16 + rng() * 0.06 || padTest(x, z) < 1.2 || !free(x, z, 0.3) || near(x, z, 2.6)) continue;
    const k = Math.min(1, (m - 0.12) * 2.4) * (0.35 + 0.65 * rng()), y = H(x, z) - 0.03, nb = 3 + Math.floor(rng() * (4 + 12 * k));
    const hh = 0.22 + 0.95 * k * k;
    for (let j = 0; j < nb; j++, i++) {
      const a = rng() * 6.283, r = rng() * (0.06 + 0.28 * k);
      blade(x + Math.cos(a) * r, y, z + Math.sin(a) * r, a + (rng() - 0.5) * 2, hh * (0.55 + 0.7 * rng()), 0.016 + 0.02 * k * rng(), 0);
    }
  }
  // anemones: a ring of long curling tentacles around shorter upright ones (shallows, temple steps area, gateway)
  const na = [16, 30, 42][q];
  for (let i = 0, tries = 0; i < na && tries < 3000; tries++) {
    const x = rng() * 60 - 30, z = 22 + rng() * 90;
    const d = padTest(x, z);
    if (d < 0.5 || d > 14 || !free(x, z, 0.3) || near(x, z, 2.2)) continue;
    const y = H(x, z), nt = 26 + Math.floor(rng() * 10), s = 0.9 + rng() * 0.9, pa = rng() * 6.283;
    for (let k = 0; k < nt + 12; k++) {
      const inner = k >= nt, a = (k / (inner ? 12 : nt)) * 6.283 + rng() * 0.25, r = (inner ? 0.02 : 0.06) * s;
      blades.push(x + Math.cos(a) * r, y - 0.02, z + Math.sin(a) * r, a, (inner ? 0.14 : 0.2 + rng() * 0.1) * s, (inner ? 0.02 : 0.016) * s, 1, pa + rng() * 0.004);
    }
    i++;
  }
  // soft corals / sea whips around kelp-zone rocks, sea pens on the deep floor
  for (let i = 0; i < rocks.length; i += 8) {
    const deep = rocks[i + 7] > 0, n = deep ? 0 : 6 + Math.floor(rng() * 10);
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.283, r = rocks[i + 3] * (0.9 + rng() * 0.8), x = rocks[i] + Math.cos(a) * r, z = rocks[i + 2] + Math.sin(a) * r;
      blade(x, H(x, z) - 0.05, z, rng() * 6.283, 0.4 + rng() * 0.8, 0.025, 2);
    }
  }
  // kelp-floor understory: clumps of colourful fronds, with barrel sponges and coral heads among them
  const nu = [1000, 2000, 2800][q];
  for (let i = 0, tries = 0; i < nu && tries < nu * 5; tries++) {
    const cx = rng() * 190 - 95, cz = -5 - rng() * 138;
    if (N.fbm2(cx * 0.05 + 1.7, cz * 0.05 + 8.2, 2) < -0.12 + 0.25 * rng() || near(cx, cz, 1.3) || !free(cx, cz, 0.2)) continue;
    const nb = 3 + Math.floor(rng() * 6), hh = 0.3 + 0.7 * rng(), col = rng();
    for (let k = 0; k < nb; k++) {
      const a = rng() * 6.283, r = 0.05 + rng() * 0.25, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      blades.push(x, H(x, z) - 0.04, z, a, hh * (0.6 + 0.6 * rng()), 0.05 + 0.07 * rng(), 4, Math.floor(col * 4) / 4 * 0.1369 + 0.004 * rng());
    }
    if (rng() < 0.16) {
      const x = cx + 0.5, s = 0.22 + 0.4 * rng() * rng();
      rocks.push(x, H(x, cz) + s * 0.25, cz, s, rng() * 6.283, rng(), 0.9 + rng() * 0.7, 2);
    }
    i++;
  }
  const np = [200, 380, 600][q];
  for (let i = 0; i < np; i++) {
    const cx = (rng() - 0.5) * 120, cz = -196 - rng() * 112;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rng() - 0.5) * 1.4, z = cz + (rng() - 0.5) * 1.4;
      blade(x, H(x, z) - 0.05, z, rng() * 6.283, 0.3 + rng() * 0.45, 0.075, 3);
    }
  }
  return { rocks: new Float32Array(rocks), blades: new Float32Array(blades), colliders: R };
}
