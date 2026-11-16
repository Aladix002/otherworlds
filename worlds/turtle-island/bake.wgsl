// One-time bake of the dusk dome into skyT (2048x512): u = azimuth, v = sqrt(dir.y).
fn bkCloud(p: vec2f) -> f32 { return fbm2(p + 0.35 * vec2f(fbm2(p * 0.7 + 3.1, 3), fbm2(p * 0.7 - 5.2, 3)), 6); }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f { return fsPos(vi); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(2048.0, 512.0);
  let az = (uv.x - 0.5) * TAU; let y = uv.y * uv.y; let c = sqrt(1.0 - y * y);
  let d = vec3f(sin(az) * c, y, -cos(az) * c);
  let sd = dot(d, SUNV); let s01 = clamp(sd * 0.5 + 0.5, 0.0, 1.0);
  let sh = clamp(dot(normalize(d.xz + vec2f(1e-5, 0.0)), SUNH) * 0.5 + 0.5, 0.0, 1.0);
  let mid = mix(vec3f(0.2, 0.16, 0.42), vec3f(0.95, 0.33, 0.27), pow(sh, 1.7));
  var col = mix(haze(d), mid, smoothstep(0.0, 0.17, y));
  col = mix(col, vec3f(0.03, 0.04, 0.13), smoothstep(0.06, 0.66, y));
  col += vec3f(0.3, 0.09, 0.14) * exp(-(y - 0.11) * (y - 0.11) / 0.0049) * (1.0 - sh);            // belt of Venus
  col += vec3f(1.7, 0.6, 0.16) * pow(s01, 48.0) + vec3f(0.9, 0.36, 0.2) * pow(s01, 7.0) * 0.3;
  // clouds: long streaks low in the sky, lit from beneath by the sun that has just gone
  let p = d.xz / (y + 0.13);
  let q = vec2f(p.x * 0.8 + p.y * 0.6, (p.y * 0.8 - p.x * 0.6) * 2.6) * 0.55;
  let n = bkCloud(q); let n2 = bkCloud(q + SUNH * 0.22 + vec2f(0.0, 0.06));
  let cov = smoothstep(0.02, 0.5, n + 0.04 - y * 0.3) * smoothstep(0.012, 0.09, y);
  let lit = smoothstep(-0.12, 0.3, n - n2) * (0.35 + 0.65 * sh) + 0.3 * pow(s01, 6.0);
  let cc = mix(vec3f(0.085, 0.065, 0.17), mix(vec3f(0.95, 0.3, 0.36), vec3f(2.2, 0.85, 0.28), pow(sh, 5.0)), clamp(lit, 0.0, 1.0));
  col = mix(col, cc, cov * 0.88);
  // thin high cirrus catching the last pink
  let ci = smoothstep(0.1, 0.7, fbm2(vec2f(p.x * 0.3 + p.y * 0.25, (p.y - p.x) * 1.9) * 0.7 + 11.0, 5)) * smoothstep(0.2, 0.5, y);
  col = mix(col, vec3f(0.75, 0.36, 0.5) * (0.5 + sh), ci * 0.35);
  // the sun: big, soft, sinking into the haze
  let ang = acos(clamp(sd, -1.0, 1.0));
  let disc = smoothstep(0.052, 0.03, ang);
  let sc = mix(vec3f(5.0, 0.9, 0.12), vec3f(9.0, 3.6, 0.8), smoothstep(-0.01, 0.08, y)) * (0.6 + 0.4 * smoothstep(0.052, 0.0, ang));
  col = mix(col, sc, disc * (1.0 - cov * 0.6)) + vec3f(1.6, 0.5, 0.12) * exp(-ang * 9.0) * 0.5;
  return vec4f(col, 1.0);
}
