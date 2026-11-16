// meadow seen through a door: low golden sun, pastel sky, painted flower fields with lavender rows, river mist, golden trees.
fn pcMeadow_col(i: f32) -> vec3f {
  if (i < 1.0) { return vec3f(0.15, 0.06, 0.68); }
  if (i < 2.0) { return vec3f(0.8, 0.04, 0.012); }
  if (i < 3.0) { return vec3f(0.93, 0.46, 0.01); }
  if (i < 4.0) { return vec3f(0.06, 0.32, 0.88); }
  if (i < 5.0) { return vec3f(0.72, 0.03, 0.32); }
  return vec3f(0.14, 0.32, 0.03);
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let sun = vec3f(-0.378, 0.239, -0.895);
  let s = max(dot(rd, sun), 0.0); let y = max(rd.y, 0.0);
  let hs = max(dot(normalize(vec3f(rd.x, rd.y * 0.4, rd.z)), sun), 0.0);
  let haze = mix(vec3f(0.34, 0.45, 0.8), vec3f(1.25, 0.78, 0.42), pow(hs, 5.0));
  var c = mix(vec3f(0.3, 0.5, 0.95), vec3f(0.06, 0.19, 0.62), smoothstep(0.0, 0.6, y));
  c = mix(c, vec3f(0.98, 0.62, 0.72), exp(-y * 5.0) * 0.4 * (1.0 - s));
  c = mix(c, haze, exp(-y * 8.0));
  let cl = vfbm2(rd.xz / (y + 0.2) * vec2f(0.7, 1.6) + vec2f(t * 0.004, 0.0), 3);
  c = mix(c, mix(vec3f(0.95, 0.78, 0.86), vec3f(2.0, 1.35, 0.85), pow(s, 3.0)), smoothstep(0.05, 0.6, cl) * smoothstep(0.03, 0.22, y) * 0.6);
  c += vec3f(1.0, 0.5, 0.22) * pow(s, 6.0) * 0.28 + vec3f(1.0, 0.68, 0.36) * pow(s, 48.0) * 0.4 + vec3f(1.0, 0.72, 0.38) * pow(s, 400.0) * 0.7
    + vec3f(2.5, 1.8, 1.05) * (smoothstep(0.9999, 0.99996, s) * 14.0 + pow(s, 3000.0) * 2.0);
  let az = atan2(rd.x, -rd.z);
  let hh = 0.035 + 0.018 * sin(az * 3.0 + 1.0) + 0.01 * sin(az * 7.0 + 2.0);       // far hill line
  if (rd.y < hh + 0.03) {
    let d = 5.0 / max(hh - rd.y, 0.003);                                            // pseudo distance on the meadow
    let p = normalize(rd.xz + vec2f(1e-4, 0.0)) * d;
    let n = mix(select(0.33, 0.2, p.x < -5.0 - d * 0.12 && d > 14.0), vnoise2(p * 0.014 + vec2f(3.7, 1.2)) * 0.5 + 0.5, smoothstep(45.0, 100.0, d));   // poppies at your feet, lavender rows to the left
    let id = floor(clamp(n * 1.5 - 0.25, 0.0, 0.999) * 6.0);
    var g = pcMeadow_col(id);
    let fine = vnoise2(p * 1.7);
    g = mix(g, vec3f(0.05, 0.14, 0.02), (1.0 - smoothstep(4.0, 40.0, d)) * smoothstep(-0.2, 0.3, fine) * 0.8);       // grass shows between near blooms
    g *= mix(1.0, 0.25 + 0.75 * smoothstep(-0.3, 0.4, cos(p.x * 3.08)), step(id, 0.5) * (1.0 - smoothstep(30.0, 110.0, d)));   // lavender rows
    g *= (0.45 + 0.55 * hs + 0.25 * vnoise2(p * 0.05 - t * vec2f(0.1, 0.06))) * 1.5;                                    // light and wind sheen
    let mist = exp(-pow((d - 62.0) / 16.0, 2.0)) * 0.5;                                                                // river valley
    g = mix(g, haze * 0.9 + 0.12, min(mist + 1.0 - exp(-d * 0.0016), 1.0));
    c = mix(c, g, 1.0 - smoothstep(-0.003, 0.003, rd.y - hh));
    // golden trees along the river
    let th = hh - 0.085 + 0.05 * smoothstep(0.35, 0.7, vnoise2(vec2f(az * 13.0, 1.0)) * 0.5 + 0.5);
    let tm = (1.0 - smoothstep(-0.004, 0.004, rd.y - th)) * smoothstep(-0.03, 0.0, rd.y - (hh - 0.1));
    c = mix(c, mix(vec3f(0.5, 0.2, 0.02), vec3f(1.6, 0.9, 0.12), smoothstep(-0.05, 0.02, rd.y - th) * (0.4 + 0.6 * hs)), tm * 0.85);
  }
  return c;
}
