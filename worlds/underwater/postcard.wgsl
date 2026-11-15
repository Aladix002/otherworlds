// Podmorský svet postcard: the spawn view. Turquoise water, rippling bright surface overhead, white sand with caustics,
// the sunken temple facade ~25 m ahead, soft light shafts. No raymarching: plane hits + 2D facade SDF.
fn pcUw_water(rd: vec3f) -> vec3f {
  let w = vec3f(0.035, 0.42, 0.55);
  var c = w * (1.0 + 0.9 * max(rd.y, 0.0) - 0.45 * max(-rd.y, 0.0));
  let sun = normalize(vec3f(0.24, 0.92, -0.3));
  let mu = max(dot(rd, sun), 0.0);
  c += w * (0.8 * mu * mu * mu * mu + 1.5 * pow(mu, 24.0));
  return c;
}
fn pcUw_caus(p: vec2f, t: f32) -> f32 {
  let a = voronoi2(p * 0.55 + vec2f(t * 0.05, 0.0));
  let b = voronoi2(p * 0.43 - vec2f(0.0, t * 0.04) + 3.1);
  return exp(-(a.y - a.x) * 9.0) * exp(-(b.y - b.x) * 6.0) * 2.5;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  var c = pcUw_water(rd);
  let fogK = 0.016;
  // light streaks around the sun direction
  let sun = normalize(vec3f(0.24, 0.92, -0.3));
  let mu = dot(rd, sun);
  let pr = rd - sun * mu;
  let ang = atan2(pr.x, pr.z);
  c += vec3f(0.05, 0.25, 0.25) * smoothstep(0.55, 0.95, vnoise2(vec2f(ang * 9.0, t * 0.05)) * 0.5 + 0.5) * pow(max(mu, 0.0), 3.0);
  if (rd.y > 0.02) {
    // surface overhead: Snell's window + ripple web
    let tt = 6.5 / rd.y;
    let q = rd.xz * tt;
    let rip = pcUw_caus(q * 1.8, t * 2.0);
    let win = smoothstep(0.58, 0.72, rd.y);
    var s = mix(vec3f(0.06, 0.5, 0.6), vec3f(1.6, 2.2, 2.3), win) * (0.8 + 0.3 * rip);
    s += vec3f(3.0, 2.8, 2.2) * pow(max(mu, 0.0), 80.0) * 4.0;
    c = mix(s, c, 1.0 - exp(-fogK * tt * 0.85));
  } else if (rd.y < -0.01) {
    // sand floor 2.8 m below
    let tt = 2.8 / -rd.y;
    let q = rd.xz * tt;
    let ca = pcUw_caus(q, t);
    var sand = vec3f(0.95, 0.88, 0.72) * (vec3f(0.9, 1.3, 1.3) * 0.5 + vec3f(1.0, 1.4, 1.4) * ca * 0.35) + vec3f(0.02, 0.18, 0.22);
    sand *= 0.92 + 0.12 * sin(dot(q, vec2f(3.0, 2.2)) + vnoise2(q * 0.3) * 4.0);
    c = mix(sand, c, max(1.0 - exp(-fogK * tt), smoothstep(50.0, 95.0, tt)));
  }
  // temple facade on a plane 25 m ahead (camera 2 m right of its axis)
  if (rd.z < -0.2) {
    let P = rd.xy / -rd.z * 25.0 + vec2f(2.0, 0.0);
    let X = abs(P.x); let Y = P.y;
    var d = 1e3;
    let cx = abs(fract(P.x / 2.5) - 0.5) * 2.5;
    if (X < 7.0) { d = min(d, max(cx - 0.44 + 0.012 * Y, max(-5.7 - Y, Y))); }
    d = min(d, max(X - 8.0, max(-6.6 - Y, Y + 5.7)));
    d = min(d, max(X - 7.0, max(-Y, Y - 1.5)));
    d = min(d, max(Y - 1.5 - 1.65 * (1.0 - X / 7.1), max(1.5 - Y, X - 7.1)));
    let a = smoothstep(0.06, -0.06, d);
    let shade = 0.85 + 0.15 * smoothstep(-0.3, 0.0, Y - 1.4) + 0.2 * step(cx, 0.15) * step(Y, 0.0);
    let marble = vec3f(0.55, 0.95, 0.95) * shade;
    let f = 1.0 - exp(-fogK * 26.0);
    c = mix(c, mix(marble, pcUw_water(rd), f), a);
  }
  return c;
}
