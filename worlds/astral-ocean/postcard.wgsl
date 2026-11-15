// Astral Ocean postcard: deep indigo nebula with the warm core ahead-left, sparse soft stars and one whale of light.
fn pcAstral_seg(p: vec2f, a: vec2f, b: vec2f, r0: f32, r1: f32) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r0, r1, h);
}
fn pcAstral_whale(rd: vec3f, t: f32) -> vec3f {
  // a far whale in profile, low and left of the core, swimming left; 2D silhouette in tangent coords
  let c = normalize(vec3f(-0.5, -0.2, -1.0));
  let k = dot(rd, c);
  if (k < 0.955) { return vec3f(0.0); }
  var p = (rd.xy - c.xy * k) / k / 0.14;
  p.x += 0.1 * sin(t * 0.05);
  let s = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);             // 0 head (left) .. 1 tail
  let wv = 0.06 * sin(s * 5.0 - t * 0.6) * s * s;
  let y = p.y - wv;
  let r = 0.17 * sqrt(sin(3.14159 * pow(s, 0.55))) * (1.0 - 0.6 * s) + 0.006;
  var d = max(abs(y + 0.03 * (1.0 - s)) - r, abs(p.x) - 1.0);
  d = min(d, pcAstral_seg(p, vec2f(-0.46, -0.1), vec2f(-0.08, -0.4), 0.05, 0.008));          // flipper
  d = min(d, pcAstral_seg(vec2f(p.x, y), vec2f(0.94, 0.0), vec2f(1.13, 0.035), 0.012, 0.03)); // fluke, edge-on
  let body = smoothstep(0.012, -0.012, d);
  let rim = body * exp(d * 26.0);
  let halo = (1.0 - body) * exp(-max(d, 0.0) * 9.0) * 0.07;
  return vec3f(0.34, 0.62, 1.4) * (body * 0.03 + rim * 0.5 + halo) * smoothstep(0.955, 0.97, k);
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let core = normalize(vec3f(-0.316, 0.163, -0.935));
  let cw = max(dot(rd, core), 0.0);
  let q = rd * 2.2;
  let n = fbm3(q + vec3f(fbm3(q * 1.3, 2) * 0.6), 4) * 0.5 + 0.5;
  let band = exp(-pow(dot(rd, vec3f(0.947, 0.0, -0.32)) / 0.5, 2.0));
  let lowm = vnoise3(rd * 1.5 + 31.0) * 0.5 + 0.5;
  let dens = pow(smoothstep(0.4, 0.95, n), 1.4) * (0.26 + 0.4 * lowm + 0.8 * band + 1.2 * pow(cw, 6.0));
  let hue = vnoise3(q * 0.8 + 5.0) * 0.5 + 0.5;
  var col = mix(vec3f(0.24, 0.08, 0.55), vec3f(0.62, 0.07, 0.42), smoothstep(0.35, 0.7, hue));
  col = mix(col, vec3f(0.03, 0.34, 0.48), smoothstep(0.65, 0.9, 1.0 - hue) * 0.7);
  col = mix(col, vec3f(1.1, 0.46, 0.3), pow(cw, 6.0) * smoothstep(0.4, 0.9, n));
  var c = mix(vec3f(0.005, 0.008, 0.028), vec3f(0.02, 0.008, 0.036), lowm) + col * dens * 0.32;
  c += vec3f(1.5, 0.66, 0.42) * pow(cw, 60.0) * 0.16 + vec3f(1.7, 1.1, 0.72) * (pow(cw, 1200.0) * 0.5 + pow(cw, 6000.0) * 1.2);
  // sparse soft stars, dimmed behind gas
  let v = voronoi3(rd * 70.0);
  let m = fract(v.z * 7.13);
  c += vec3f(0.9, 0.92, 1.1) * exp(-v.x * v.x * 500.0) * step(0.86, m) * (m - 0.86) * 9.0 / (1.0 + 12.0 * dens);
  c += pcAstral_whale(rd, t);
  return c;
}
