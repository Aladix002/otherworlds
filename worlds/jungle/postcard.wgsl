// Jungle postcard: the spawn view. Night lagoon ahead with the glowing waterfall under a dark cliff, canopy overhead with a
// moon gap, glowing trunks at the sides. Everything is soft (no hard quads or line patterns); reflections only on the lagoon.
fn pcJungle_up(d: vec3f, t: f32) -> vec3f {
  let hl = max(length(d.xz), 1e-3);
  let h = d.y / hl;                       // tan(elevation)
  let az = atan2(d.x, -d.z);
  let aa = abs(az);
  // night sky with moon glow (seen only through canopy gaps)
  let m = max(dot(d, vec3f(-0.492, 0.678, -0.546)), 0.0);
  var c = mix(vec3f(0.02, 0.045, 0.07), vec3f(0.02, 0.018, 0.06), smoothstep(0.0, 0.8, h));
  c += vec3f(0.3, 0.36, 0.7) * (pow(m, 6.0) * 0.1 + pow(m, 60.0) * 0.25);
  // distant fogged forest behind the cliff
  let far = 0.52 + 0.1 * fbm2(vec2f(az * 7.0, 2.0), 3);
  c = mix(c, vec3f(0.018, 0.032, 0.05), smoothstep(far + 0.06, far - 0.06, h));
  // canopy: dark leaf masses closing overhead, a few gaps near the moon
  let q = d.xz / (max(d.y, 0.0) + 0.45);
  let lf = fbm2(q * 2.3 + 3.0, 3);
  let can = smoothstep(0.3, 0.75, h + 0.45 * lf + 0.3 * smoothstep(0.5, 1.4, aa)) * (1.0 - 0.75 * pow(m, 5.0) * smoothstep(-0.25, 0.3, lf));
  c = mix(c, vec3f(0.006, 0.014, 0.02) + vec3f(0.02, 0.05, 0.06) * smoothstep(0.1, 0.5, fbm2(q * 6.0, 2)) * 0.25, can);
  // cliff ahead, forest wall rising at the sides
  let side = smoothstep(0.5, 1.2, aa);
  let sil = 0.26 + 0.03 * fbm2(vec2f(az * 5.0, 1.0), 3) + side * 0.9;
  let inS = smoothstep(0.012, -0.012, h - sil);
  var w = vec3f(0.008, 0.014, 0.022) + vec3f(0.01, 0.022, 0.03) * smoothstep(0.0, 0.5, h / max(sil, 0.05));
  // glowing trunks (irregular spacing from noise, soft veins)
  let tn = vnoise2(vec2f(az * 8.0, 7.3));
  let trunk = smoothstep(0.1, 0.4, tn) * smoothstep(0.35, 0.9, aa);
  let vn = abs(snoise2(vec2f(az * 16.0 + 0.6 * snoise2(vec2f(h * 3.0, az * 2.0)), h * 4.0)));
  let pul = 0.55 + 0.45 * sin(az * 4.0 - h * 3.0 - t * 0.45);
  let zone = smoothstep(-0.3, 0.3, snoise2(vec2f(az * 1.3, 0.5)));
  let vc = mix(vec3f(0.08, 0.75, 1.0), vec3f(0.85, 0.2, 0.9), zone);
  w += vc * (exp(-vn * 22.0) * 0.32 + exp(-vn * 5.0) * 0.07) * trunk * pul * smoothstep(1.3, 0.1, h);
  // understory glow near the ground at the sides
  let ug = smoothstep(0.1, 0.6, fbm2(vec2f(az * 11.0, h * 30.0), 2));
  w += mix(vc, vec3f(0.5, 1.0, 0.25), smoothstep(0.55, 0.7, vnoise2(vec2f(az * 23.0, 1.0)))) * ug * exp(-h * 14.0) * (0.1 + 0.25 * side) * pul;
  // lichen on the cliff
  w += vec3f(0.05, 0.5, 0.6) * smoothstep(0.35, 0.8, fbm2(vec2f(az * 30.0, h * 9.0), 2)) * 0.03 * (1.0 - side);
  c = mix(c, w, inS);
  // waterfall: soft streaked column with mist at its foot
  let wx = az - 0.025;
  let col = exp(-wx * wx / 0.0022) * smoothstep(0.27, 0.2, h) * smoothstep(-0.08, -0.03, h);
  let st = 0.45 + 0.55 * smoothstep(-0.5, 0.6, fbm2(vec2f(az * 150.0, h * 5.0 + t * 1.2), 2));
  c += vec3f(0.38, 0.72, 0.9) * col * st * 0.85;
  c += vec3f(0.12, 0.32, 0.42) * exp(-wx * wx / 0.03) * exp(-abs(h - 0.02) * 9.0) * 0.55;
  // low mist
  c += vec3f(0.03, 0.06, 0.08) * exp(-abs(h) * 7.0);
  return c;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let d = normalize(rd);
  // fireflies: sparse soft dots
  let fq = vec2f(atan2(d.x, -d.z) * 9.0 + sin(t * 0.1) * 0.2, d.y * 9.0 + t * 0.02);
  let fv = voronoi2(fq);
  let fly = vec3f(0.8, 1.2, 0.3) * exp(-fv.x * fv.x * 900.0) * step(0.8, fv.z) * (0.5 + 0.5 * sin(t * 0.7 + fv.z * 40.0)) * smoothstep(0.6, 0.0, abs(d.y - 0.05));
  if (d.y >= -0.004) { return pcJungle_up(d, t) + fly; }
  // ground plane under the spawn eye (1.9 m), lagoon ellipse ahead
  let k = 1.9 / -d.y;
  let p = vec2f(d.x * k, d.z * k - 9.0);
  let dist = length(d.xz) * k;
  let e = length(vec2f(p.x / 21.0, (p.y + 36.0) / 13.0)) + 0.05 * snoise2(p * 0.12);
  let wat = smoothstep(1.0, 0.96, e);
  // shore / forest floor: dark moss with soft glow pools
  let g1 = fbm2(p * 0.22, 2); let g2 = vnoise2(p * 1.9);
  var gr = vec3f(0.007, 0.016, 0.014) * (1.0 + 0.5 * g1);
  let gz = smoothstep(-0.3, 0.3, snoise2(p * 0.045));
  gr += mix(vec3f(0.06, 0.6, 0.8), vec3f(0.7, 0.18, 0.75), gz) * (smoothstep(0.25, 0.8, g1) * 0.035 + smoothstep(0.5, 1.0, g2) * 0.05 * smoothstep(0.0, 0.5, g1)) * exp(-dist * 0.03);
  // lagoon: reflection + dark teal body, lotus glows, pads
  let rp = vec2f(snoise2(p * 0.9 + vec2f(t * 0.07, 0.0)), snoise2(p * 0.9 + vec2f(5.0, t * 0.06))) * 0.012;
  let F = 0.03 + 0.97 * pow(1.0 - min(-d.y * 1.0, 1.0), 5.0);
  var wc = pcJungle_up(normalize(vec3f(d.x + rp.x, -d.y + abs(rp.y), d.z)), t) * F * 0.6 + vec3f(0.002, 0.014, 0.018);
  let cell = voronoi2(p * 0.24 + 2.0);
  let pad = smoothstep(0.34, 0.28, cell.x) * step(cell.z, 0.55);
  wc = mix(wc, vec3f(0.006, 0.03, 0.022) + vec3f(0.05, 0.5, 0.45) * 0.05 * smoothstep(0.1, 0.3, cell.x), pad);
  let lot = exp(-cell.x * cell.x * 30.0) * step(0.72, cell.z);
  wc += vec3f(1.0, 0.4, 0.75) * (lot * 0.9 + exp(-cell.x * cell.x * 4.0) * step(0.72, cell.z) * 0.06);
  var c = mix(gr, wc, wat);
  // mist toward the horizon blends into the upper half
  let mist = smoothstep(0.07, 0.0, -d.y);
  c = mix(c, pcJungle_up(vec3f(d.x, -d.y, d.z), t), mist * mist);
  return c + fly;
}
