// Astral Ocean postcard: deep indigo nebula with the warm core ahead-left, sparse stars and a translucent whale.
fn pcAstral_whale(rd: vec3f, t: f32) -> vec3f {
  // whale seen in profile up-right of the core, swimming left; 2D shape in tangent coords
  let c = normalize(vec3f(0.05, 0.28, -1.0));
  let k = dot(rd, c);
  if (k < 0.9) { return vec3f(0.0); }
  var p = (rd.xy - c.xy * k) / k;
  p.x += 0.02 * sin(t * 0.05);
  p = p * vec2f(1.0, 1.0) / 0.22;
  let s = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);             // 0 head (left) .. 1 tail
  let r = 0.17 * pow(sin(3.14159 * pow(s, 0.75)), 0.8) + 0.004;
  let y = p.y - 0.04 * sin(s * 6.0 - t * 0.85) * s * s;
  let body = smoothstep(0.02, -0.01, abs(y) - r) * step(abs(p.x), 1.0);
  let rim = body * smoothstep(0.6, 1.0, abs(y) / max(r, 1e-3));
  let fin = smoothstep(0.02, 0.0, abs(p.x + 0.35 - (y + 0.12) * 0.8) - 0.035) * step(y, -0.05) * step(-0.65, y);
  return vec3f(0.35, 0.6, 1.3) * (body * 0.12 + rim * 0.5 + fin * 0.18);
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let core = normalize(vec3f(-0.316, 0.163, -0.935));
  let cw = max(dot(rd, core), 0.0);
  let q = rd * 2.2;
  let n = fbm3(q + vec3f(fbm3(q * 1.3, 2) * 0.6), 4) * 0.5 + 0.5;
  let band = exp(-pow(dot(rd, vec3f(0.947, 0.0, -0.32)) / 0.5, 2.0));
  let dens = pow(smoothstep(0.4, 0.95, n), 1.4) * (0.08 + band + 1.2 * pow(cw, 6.0));
  let hue = vnoise3(q * 0.8 + 5.0) * 0.5 + 0.5;
  var col = mix(vec3f(0.24, 0.08, 0.55), vec3f(0.62, 0.07, 0.42), smoothstep(0.35, 0.7, hue));
  col = mix(col, vec3f(0.03, 0.34, 0.48), smoothstep(0.65, 0.9, 1.0 - hue) * 0.7);
  col = mix(col, vec3f(1.1, 0.42, 0.12), pow(cw, 6.0) * smoothstep(0.4, 0.9, n));
  var c = vec3f(0.004, 0.005, 0.018) + col * dens * 0.32;
  c += vec3f(1.5, 0.62, 0.3) * pow(cw, 40.0) * 0.5 + vec3f(1.8, 1.1, 0.6) * pow(cw, 400.0) * 0.8;
  // stars
  let g = rd * 90.0;
  let v = voronoi3(g);
  c += vec3f(0.9, 0.9, 1.1) * (1.0 - smoothstep(0.0, 0.07, v.x)) * step(0.82, fract(v.z * 7.13)) * 0.9;
  c += pcAstral_whale(rd, t);
  return c;
}
