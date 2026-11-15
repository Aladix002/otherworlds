// sky-mountains seen through a door: sunrise over a sea of clouds, layered karst pillars, a floating island with a waterfall.
fn pcSky_cols(a: f32, f: f32, sd: f32) -> f32 {     // silhouette height of a row of pillars along azimuth a
  let x = a * f + sd;
  let i = floor(x); let e = abs(fract(x) - 0.5);
  let h = hash11(i + sd * 7.0); let w = 0.1 + 0.3 * hash11(i * 1.7 + 3.0 + sd);
  return select(-1.0, h * h * 0.85 + 0.15 - 0.05 * pow(e / w, 4.0), e < w && h > 0.45);
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let sun = normalize(vec3f(-0.5, 0.135, -0.84));
  let s = max(dot(rd, sun), 0.0);
  let sh = dot(normalize(vec3f(rd.x, rd.y * 0.6, rd.z)), sun) * 0.5 + 0.5;
  let haze = mix(mix(vec3f(0.62, 0.43, 0.62), vec3f(0.3, 0.4, 0.8), smoothstep(-0.05, 0.3, rd.y + sh * 0.5)), vec3f(1.35, 0.7, 0.33), pow(sh, 5.0));
  let y = max(rd.y, 0.0);
  var c = mix(vec3f(0.42, 0.42, 0.86), vec3f(0.07, 0.17, 0.58), smoothstep(0.05, 0.7, y)) + vec3f(1.0, 0.42, 0.22) * pow(s, 4.0) * 0.55 * (1.0 - y);
  c = mix(c, haze, exp(-y * 7.0));
  let ci = vfbm2(rd.xz / (y + 0.22) * vec2f(1.6, 0.5) + vec2f(t * 0.004, 0.0), 3);
  c = mix(c, mix(vec3f(0.8, 0.7, 0.9), vec3f(2.1, 1.25, 0.8), pow(s, 2.5)), smoothstep(0.05, 0.5, ci) * smoothstep(0.03, 0.3, y) * (1.0 - smoothstep(0.55, 0.95, y)) * 0.45);
  c += vec3f(4.3, 2.15, 0.8) * (smoothstep(0.99975, 0.99992, s) * 14.0 + pow(s, 2500.0) * 2.0) + vec3f(1.0, 0.62, 0.22) * pow(s, 260.0) * 1.1
    + vec3f(1.0, 0.45, 0.25) * pow(s, 40.0) * 0.5 + vec3f(0.9, 0.35, 0.4) * pow(s, 7.0) * 0.2;
  // cloud sea below the horizon: soft billows by perspective-projected noise
  if (rd.y < 0.02) {
    let q = rd.xz / max(0.03 - rd.y, 0.012) * 0.07;
    let n = vfbm2(q * 4.0 + vec2f(t * 0.01, 0.0), 3);
    let far = exp(-max(-rd.y, 0.0) * 9.0);
    let cl = vec3f(0.33, 0.4, 0.76) * (0.75 + 0.3 * n) + vec3f(1.6, 0.98, 0.6) * (0.3 + 0.5 * smoothstep(-0.1, 0.5, n)) * (0.4 + 0.6 * pow(sh, 3.0));
    c = mix(c, mix(cl, haze, far * 0.92), (1.0 - smoothstep(-0.01, 0.02, rd.y)));
  }
  // three rows of pillars, nearer rows taller, darker and less hazy
  let az = atan2(rd.x, -rd.z);
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let h = pcSky_cols(az, 34.0 - fi * 11.0, fi * 31.7) * (0.08 + 0.11 * fi) - 0.03 * fi;
    let m = (1.0 - smoothstep(-0.004, 0.004, rd.y - h)) * smoothstep(-0.02 - 0.05 * fi, 0.0, rd.y + 0.06 * fi);
    let rock = mix(vec3f(0.2, 0.2, 0.34), vec3f(0.9, 0.55, 0.36), pow(sh, 3.0) * 0.6) * (0.9 - 0.2 * fi) + vec3f(0.05, 0.12, 0.02) * (1.0 - smoothstep(0.0, 0.03, h - rd.y));
    c = mix(c, mix(haze, rock, 0.22 + 0.26 * fi), m);
  }
  // a floating island with a thin waterfall, right of centre
  let p = vec2f(az - 0.42, rd.y - 0.075);
  let top = (1.0 - smoothstep(0.0, 0.012, p.y - 0.01 * cos(p.x * 9.0))) ;
  let body = (1.0 - smoothstep(-0.004, 0.004, abs(p.x) - (0.16 + 0.012 * sin(p.y * 160.0 + p.x * 40.0)) * pow(clamp(1.0 + p.y / 0.24, 0.0, 1.0), 1.25))) * top * step(-0.24, p.y);
  c = mix(c, mix(haze, mix(vec3f(0.22, 0.2, 0.3), vec3f(0.12, 0.2, 0.06), smoothstep(-0.02, 0.0, p.y)), 0.62), body);
  let fl = exp(-pow((p.x + 0.09) / 0.007, 2.0)) * (1.0 - smoothstep(-0.02, 0.0, p.y)) * smoothstep(-0.3, -0.08, p.y);
  c += vec3f(0.9, 0.8, 0.75) * fl * 0.5;
  return c;
}
