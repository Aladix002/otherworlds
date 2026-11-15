// Podmorský svet postcard: the spawn view as a soft impression. Turquoise water, bright rippling surface overhead,
// warm white sand with caustics, light shafts and a pale, hazy hint of the sunken temple ahead. No raymarching.
fn pcUw_water(rd: vec3f) -> vec3f {
  let w = vec3f(0.035, 0.4, 0.52);
  var c = w * (1.0 + 0.9 * max(rd.y, 0.0) - 0.45 * max(-rd.y, 0.0));
  let mu = max(dot(rd, vec3f(0.42, 0.88, 0.22)), 0.0);
  c += w * (0.7 * mu * mu * mu * mu + 1.2 * pow(mu, 24.0));
  return c;
}
fn pcUw_caus(p: vec2f, t: f32) -> f32 {
  let a = voronoi2(p * 0.55 + vec2f(t * 0.05, 0.0));
  let b = voronoi2(p * 0.43 - vec2f(0.0, t * 0.04) + 3.1);
  return exp(-(a.y - a.x) * 9.0) * exp(-(b.y - b.x) * 6.0) * 2.5;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let water = pcUw_water(rd);
  var c = water;
  let fogK = 0.014;
  // light streaks around the sun direction
  let sun = vec3f(0.42, 0.88, 0.22);
  let mu = dot(rd, sun);
  let pr = rd - sun * mu;
  let ang = atan2(pr.x, pr.z);
  c += vec3f(0.05, 0.22, 0.22) * smoothstep(0.5, 0.95, vnoise2(vec2f(ang * 9.0, t * 0.05)) * 0.5 + 0.5) * pow(max(mu, 0.0), 3.0);
  if (rd.y > 0.02) {
    // surface overhead: Snell's window + ripple web
    let tt = 6.5 / rd.y;
    let rip = pcUw_caus(rd.xz * tt * 1.8, t * 2.0);
    let win = smoothstep(0.5, 0.78, rd.y);
    var s = mix(vec3f(0.05, 0.42, 0.52), vec3f(0.8, 1.3, 1.4), win) * (0.8 + 0.3 * rip);
    s += vec3f(1.4, 1.3, 1.0) * pow(max(mu, 0.0), 40.0);
    c = mix(s, c, 1.0 - exp(-fogK * tt * 0.85));
  } else if (rd.y < -0.01) {
    // sand floor 3.5 m below
    let tt = 3.5 / -rd.y;
    let q = rd.xz * tt;
    var sand = vec3f(0.8, 0.74, 0.6) * (vec3f(0.75, 0.9, 0.85) * 0.75 + vec3f(1.1, 1.2, 1.1) * pcUw_caus(q, t) * 0.3);
    sand *= 0.92 + 0.1 * sin(dot(q, vec2f(3.0, 2.2)) + vnoise2(q * 0.3) * 4.0);
    c = mix(sand, c, max(1.0 - exp(-fogK * tt), smoothstep(45.0, 90.0, tt)));
  }
  // the temple, far ahead: only a pale blurred mass with a hint of columns (the real one resolves out of it)
  if (rd.z < -0.2) {
    let P = rd.xy / -rd.z * 25.0 + vec2f(2.0, 0.0);
    let X = abs(P.x); let Y = P.y;
    let d = min(max(X - 7.6, max(-6.2 - Y, Y - 1.7)), max(Y - 1.7 - 1.7 * (1.0 - X / 7.2), max(1.7 - Y, X - 7.2)));
    let col = 0.75 + 0.25 * smoothstep(0.9, 0.2, abs(fract(P.x / 2.5) - 0.5) * 2.0) * step(Y, 0.3);
    c = mix(c, mix(vec3f(0.85, 0.95, 0.9), water, 0.45), smoothstep(1.6, -1.2, d) * 0.4 * col);
  }
  return c;
}
