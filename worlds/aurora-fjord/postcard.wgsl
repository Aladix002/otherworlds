// aurora-fjord seen through a door: night fjord between snowy peaks, green aurora curtains, warm windows on the shore.
fn pcFjord_ridge(a: f32, f: f32, sd: f32) -> f32 {
  let x = a * f + sd; let i = floor(x); let u = fract(x);
  let h0 = hash11(i + sd * 3.1); let h1 = hash11(i + 1.0 + sd * 3.1);
  return mix(h0, h1, u) * 0.6 + 0.4 * (1.0 - abs(2.0 * u - 1.0)) * mix(h0, h1, 0.5);
}
fn pcFjord_sky(rd: vec3f, t: f32) -> vec3f {
  let y = max(rd.y, 0.0);
  var c = mix(vec3f(0.02, 0.04, 0.075), vec3f(0.0035, 0.007, 0.02), pow(y, 0.45));
  c += vec3f(0.012, 0.035, 0.05) * exp(-y * 9.0) * (0.6 - 0.4 * rd.z);
  // three curtains: arcs across the sky, rays from stretched noise, soft lower edge
  let az = atan2(rd.x, -rd.z);
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let e0 = 0.62 - 0.2 * fi + 0.07 * sin(az * 2.3 + fi * 2.0 + t * 0.03) + 0.03 * sin(az * 7.0 - t * 0.05 + fi) - az * az * 0.05;
    let v = (y - e0) / (0.5 - 0.1 * fi);
    let rays = vnoise2(vec2f(az * (26.0 + 9.0 * fi) + t * 0.02, fi * 7.0)) * 0.5 + 0.5;
    let env = smoothstep(-0.5, 0.4, vnoise2(vec2f(az * 1.7 + fi * 5.0 + t * 0.01, fi)));
    let I = smoothstep(0.0, 0.1, v) * exp(-max(v, 0.0) * 3.5) * (0.3 + 0.9 * rays * rays) * env * step(0.0, rd.y) * step(rd.z, 0.3);
    c += mix(vec3f(0.08, 1.0, 0.42), vec3f(0.22, 0.25, 0.95), smoothstep(0.2, 0.9, v)) * I * 1.1;
  }
  return c;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  var r = rd; let wet = rd.y < 0.0;
  if (wet) { r.y = -r.y; r.x += 0.012 * sin(rd.y * 90.0 + t * 0.7) * (1.0 + rd.y); }
  var c = pcFjord_sky(r, t);
  let az = atan2(r.x, -r.z);
  // snowy peaks flanking the fjord: two layers, open water down the middle
  for (var i = 0; i < 2; i++) {
    let fi = f32(i);
    let gap = smoothstep(0.1 + 0.08 * fi, 0.45 + 0.2 * fi, abs(az + 0.02));
    let h = (0.05 + 0.27 * pcFjord_ridge(az, 7.0 - 2.0 * fi, 3.0 + fi * 9.0)) * gap * (0.55 + 0.6 * fi) + 0.012;
    let m = smoothstep(0.004, -0.004, r.y - h);
    let sn = smoothstep(0.35, 0.6, vnoise2(vec2f(az * 30.0, r.y * 40.0 + fi)) * 0.5 + 0.5 + (r.y / h - 0.6));
    let rock = mix(vec3f(0.012, 0.016, 0.024), vec3f(0.07, 0.1, 0.16), sn);
    c = mix(c, mix(vec3f(0.02, 0.04, 0.07), rock, 0.55 + 0.45 * fi), m);
  }
  // warm windows along both shores
  let side = abs(az) - 0.42;
  let cell = floor(az * 16.0);
  let wy = 0.02 + 0.012 * hash11(cell);
  let w = exp(-pow((fract(az * 16.0) - 0.5) * 9.0, 2.0) - pow((r.y - wy) * 130.0, 2.0)) * step(0.0, side) * step(side, 0.75) * step(hash11(cell + 9.0), 0.75);
  c += vec3f(1.0, 0.56, 0.2) * w * 3.0;
  if (wet) { c = c * 0.75 + vec3f(0.002, 0.005, 0.011); }
  // snowy foreground shore below the water band
  let shore = smoothstep(-0.16, -0.22, rd.y + 0.03 * cos(az * 1.5));
  c = mix(c, vec3f(0.085, 0.115, 0.17) * (0.8 + 0.2 * vnoise2(rd.xz * 14.0 / (0.2 - rd.y))), shore);
  return c;
}
