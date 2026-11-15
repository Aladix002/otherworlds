// Load-time placement of rocks and blade flora (seagrass, anemones, soft corals, sea pens).
export function scatter(H, N, rng, q, padTest) {
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
    if (Math.hypot(x - 10, z + 70) < 20 || !free(x, z, s)) continue;
    rock(x, z, s, deep); i++;
  }
  // a few rocks framing the shallows
  for (let i = 0, tries = 0; i < 18 && tries < 2000; tries++) {
    const x = (rng() < 0.5 ? -1 : 1) * (28 + rng() * 50), z = 10 + rng() * 115, s = 0.8 + rng() * 2.2;
    if (padTest(x, z) < 6 || !free(x, z, s)) continue;
    rock(x, z, s, false); i++;
  }
  const blade = (x, y, z, yaw, h, w, ty) => blades.push(x, y, z, yaw, h, w, ty, rng() * 6.283);
  // seagrass meadows in the shallows
  const ng = [5000, 11000, 18000][q];
  for (let i = 0, tries = 0; i < ng && tries < ng * 8; tries++) {
    const x = rng() * 150 - 75, z = 4 + rng() * 128;
    const m = N.fbm2(x * 0.04 + 3.3, z * 0.04 - 1.1, 3);
    if (m < 0.08 + rng() * 0.12 || padTest(x, z) < 1.5 || !free(x, z, 0.3)) continue;
    const k = Math.min(1, (m - 0.05) * 3), y = H(x, z) - 0.03;
    for (let j = 0; j < 7; j++, i++) {
      const a = rng() * 6.283, r = rng() * 0.12;
      blade(x + Math.cos(a) * r, y, z + Math.sin(a) * r, a + (rng() - 0.5), 0.3 + (0.25 + rng() * 0.45) * k, 0.02 + rng() * 0.012, 0);
    }
  }
  // anemones: rings of tentacles (shallows, temple steps area, gateway)
  const na = [18, 34, 48][q];
  for (let i = 0, tries = 0; i < na && tries < 3000; tries++) {
    const x = rng() * 60 - 30, z = 22 + rng() * 90;
    const d = padTest(x, z);
    if (d < 0.5 || d > 14 || !free(x, z, 0.3)) continue;
    const y = H(x, z), nt = 22 + Math.floor(rng() * 10), s = 0.7 + rng() * 0.6;
    for (let k = 0; k < nt; k++) {
      const a = (k / nt) * 6.283 + rng() * 0.2, r = 0.05 * s;
      blade(x + Math.cos(a) * r, y - 0.02, z + Math.sin(a) * r, a, (0.18 + rng() * 0.1) * s, 0.018 * s, 1);
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
  const np = [250, 500, 800][q];
  for (let i = 0; i < np; i++) {
    const cx = (rng() - 0.5) * 120, cz = -200 - rng() * 105;
    for (let k = 0; k < 4; k++) {
      const x = cx + (rng() - 0.5) * 3, z = cz + (rng() - 0.5) * 3;
      blade(x, H(x, z) - 0.05, z, rng() * 6.283, 0.35 + rng() * 0.5, 0.04, 3);
    }
  }
  return { rocks: new Float32Array(rocks), blades: new Float32Array(blades), colliders: R };
}
