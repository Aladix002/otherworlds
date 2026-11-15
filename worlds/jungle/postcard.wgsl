// Jungle postcard: night lagoon seen from the spawn shore. Glowing waterfall straight ahead under a dark cliff,
// forest silhouettes with luminous veins on both sides, lotus glows on the mirror water, teal-violet sky with stars.
fn pcJungle_scene(d: vec3f, t: f32, refl: bool) -> vec3f {
  let h = d.y;
  let az = atan2(d.x, -d.z);
  var c = mix(vec3f(0.03, 0.07, 0.09), vec3f(0.035, 0.025, 0.08), smoothstep(0.0, 0.4, h));
  c = mix(c, vec3f(0.006, 0.008, 0.025), smoothstep(0.4, 1.0, h));
  let m = max(dot(d, normalize(vec3f(-0.45, 0.62, -0.5))), 0.0);
  c += vec3f(0.3, 0.35, 0.7) * (pow(m, 8.0) * 0.06 + pow(m, 80.0) * 0.15);
  let sv = voronoi2(d.xz / (h + 0.4) * 40.0);
  c += vec3f(0.8, 0.85, 1.2) * (1.0 - smoothstep(0.0, 0.05, sv.x)) * step(0.9, sv.z) * smoothstep(0.1, 0.4, h) * 0.6;
  // silhouettes: cliff in the middle, forest rising at the sides
  let side = smoothstep(0.35, 1.1, abs(az));
  let sil = 0.29 + 0.03 * fbm2(vec2f(az * 6.0, 1.0), 3) + side * (0.35 + 0.15 * fbm2(vec2f(az * 9.0, 4.0), 3)) - smoothstep(0.08, 0.0, abs(az - 0.06)) * 0.02;
  let inSil = smoothstep(0.004, -0.004, h - sil);
  let pul = 0.6 + 0.4 * sin(az * 5.0 - t * 0.45);
  let vn = voronoi2(vec2f(az * 30.0, h * 30.0));
  let vein = (1.0 - smoothstep(0.0, 0.06, vn.y - vn.x)) * side * smoothstep(sil, sil - 0.3, h);
  let vc = mix(vec3f(1.0, 0.15, 0.7), vec3f(0.1, 0.85, 1.0), step(0.5, fract(vn.z * 3.7)));
  c = mix(c, vec3f(0.008, 0.012, 0.02) + vc * vein * 0.6 * pul, inSil);
  // waterfall
  let wx = abs(az - 0.06);
  let fall = smoothstep(0.045, 0.02, wx) * step(h, 0.3) * step(0.0, h);
  let st = 0.6 + 0.4 * fbm2(vec2f(az * 120.0, h * 6.0 + t * 1.5 * select(1.0, -1.0, refl)), 2);
  c += mix(vec3f(0.5, 0.85, 1.0), vec3f(0.1, 0.8, 1.0), 0.4) * fall * st * 1.4;
  c += vec3f(0.1, 0.35, 0.45) * exp(-wx * 12.0) * exp(-abs(h) * 8.0) * 0.5;
  return c;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  if (rd.y >= 0.0) { return pcJungle_scene(rd, t, false); }
  // mirror lagoon with ripples, lotus glows and shore
  let w = vec2f(rd.x, rd.z) / max(-rd.y, 0.02);
  let rp = fbm2(w * 0.6 + vec2f(t * 0.05, 0.0), 2) * 0.02;
  var c = pcJungle_scene(vec3f(rd.x + rp, -rd.y, rd.z), t, true) * 0.55;
  let g = voronoi2(w * 0.35);
  c += vec3f(1.0, 0.35, 0.75) * (1.0 - smoothstep(0.0, 0.12, g.x)) * step(0.82, g.z) * smoothstep(-0.02, -0.1, rd.y) * 0.8;
  c += vec3f(0.05, 0.6, 0.6) * (1.0 - smoothstep(0.0, 0.06, g.y - g.x)) * 0.05;
  let shore = smoothstep(-0.22, -0.32, rd.y);
  c = mix(c, vec3f(0.01, 0.02, 0.018) + vec3f(0.1, 0.8, 0.9) * step(0.93, g.z) * (1.0 - smoothstep(0.0, 0.1, g.x)) * 0.5, shore);
  return c;
}
