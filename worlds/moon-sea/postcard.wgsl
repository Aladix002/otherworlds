// Moon mirror sea postcard: the spawn view. A huge moon over a perfect mirror, soft round stars, lanterns rising on the
// right, the lone tree on its sandbar to the left, a thread of cyan surf far right. No raymarching.
fn pcMoon_up(d: vec3f, t: f32) -> vec3f {
  let el = asin(clamp(d.y, 0.0, 1.0));
  let az = atan2(d.x, -d.z);
  var c = mix(vec3f(0.017, 0.032, 0.062), vec3f(0.004, 0.007, 0.02), pow(max(d.y, 0.0), 0.42));
  c += vec3f(0.008, 0.028, 0.025) * exp(-el * 8.0) + vec3f(0.01, 0.014, 0.026) * exp(-el * 30.0);
  let md = vec3f(0.0, 0.3051, -0.9523);
  let ang = acos(clamp(dot(d, md), -1.0, 1.0));
  let ha = max(ang - 0.165, 0.0);
  c += vec3f(0.36, 0.47, 0.72) * (0.3 * exp(-ha * 13.0) + 0.09 * exp(-ha * 3.6) + 0.012 * exp(-ha * 1.1));
  // Milky Way climbing to the upper left
  let P = vec3f(0.7697, 0.5729, 0.2802);
  let b = dot(d, P);
  let mw = exp(-b * b / 0.03) * (0.5 + 0.5 * fbm2(vec2f(az * 3.0, el * 5.0), 3));
  c += vec3f(0.6, 0.7, 1.0) * mw * 0.045 * smoothstep(0.0, 0.3, d.y);
  // stars: soft round dots, power-law brightness, dimmed by the moon glow
  let sq = d.xz / (1.0 + d.y) * 64.0;
  let sv = voronoi2(sq);
  let sb = (pow(sv.z, 14.0) * 3.0 + 0.07) * step(0.5, sv.z);
  c += mix(vec3f(1.0, 0.86, 0.7), vec3f(0.75, 0.86, 1.0), fract(sv.z * 17.0)) * exp(-sv.x * sv.x * 210.0) * sb
     * smoothstep(0.17, 0.5, ang) * smoothstep(0.0, 0.12, d.y) * (0.85 + 0.15 * sin(t * (0.5 + sv.z) + sv.z * 60.0));
  // the moon
  if (ang < 0.17) {
    let r = normalize(cross(md, vec3f(0.0, 1.0, 0.0))); let u = cross(r, md);
    let q = vec2f(dot(d, r), dot(d, u)) / 0.1643;
    let m = fbm2(q * 1.5 + vec2f(3.1, 0.7), 4);
    let mar = smoothstep(-0.05, 0.3, m + 0.12 * q.y - 0.1 * q.x);
    let alb = mix(0.62, 0.25, mar) * (0.9 + 0.12 * fbm2(q * 9.0, 2)) * mix(0.55, 1.0, pow(max(1.0 - dot(q, q), 0.0), 0.25));
    c = mix(c, mix(vec3f(1.0, 0.96, 0.9), vec3f(0.82, 0.9, 1.0), mar) * alb * 1.25, smoothstep(1.0, 0.97, length(q)));
  }
  // lanterns: a slow sparse stream right of the moon
  for (var i = 0; i < 9; i++) {
    let f = f32(i);
    let k = fract(f * 0.618 + t * 0.0035);
    let la = 0.16 + 0.42 * fract(f * 0.377) - 0.3 * k + 0.02 * sin(t * 0.2 + f * 2.0);
    let le = 0.02 + 0.62 * k * k;
    let ld = vec3f(sin(la) * cos(le), sin(le), -cos(la) * cos(le));
    let dd = max(1.0 - dot(d, ld), 0.0);
    let sz = mix(1.0, 3.5, k);
    c += vec3f(1.0, 0.46, 0.13) * (exp(-dd * 90000.0 * sz) * 2.6 + exp(-dd * 5000.0 * sz) * 0.22) * sin(k * 3.1416);
  }
  // far dunes and the glowing surf on the right
  let sh = smoothstep(0.36, 0.6, az) * smoothstep(2.1, 1.4, az);
  let dune = (0.012 + 0.014 * (0.5 + 0.5 * sin(az * 9.0 + 1.0)) * smoothstep(0.4, 0.9, az)) * sh;
  c = mix(c, vec3f(0.035, 0.05, 0.075), smoothstep(dune, dune - 0.003, el) * sh);
  c += vec3f(0.04, 0.62, 1.0) * exp(-el * 520.0) * sh * (0.55 + 0.45 * sin(az * 37.0 + t * 0.5)) * 0.9;
  // the lone tree with its lantern, on a pale sandbar
  let ta = az + 0.45;
  let cr = length(vec2f(ta * 1.1, (el - 0.064) * 1.6));
  let tree = smoothstep(0.03, 0.022, cr + 0.006 * sin(ta * 300.0) * sin(el * 260.0)) + smoothstep(0.003, 0.0015, abs(ta - (el - 0.03) * 0.15)) * step(el, 0.06);
  c = mix(c, vec3f(0.05, 0.06, 0.08), clamp(tree, 0.0, 1.0));
  c = mix(c, vec3f(0.1, 0.11, 0.13), smoothstep(0.006, 0.003, el) * smoothstep(0.12, 0.08, abs(ta)));
  let tl = vec2f(ta - 0.012, el - 0.036);
  c += vec3f(1.0, 0.46, 0.13) * (exp(-dot(tl, tl) * 60000.0) * 2.0 + exp(-dot(tl, tl) * 4000.0) * 0.2);
  return c;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let d = normalize(rd);
  if (d.y >= 0.0) { return pcMoon_up(d, t); }
  // the mirror: a faint slow ripple, slightly darker and bluer than the sky it copies
  let k = 1.6 / max(-d.y, 1e-3);
  let p = d.xz * k;
  let w = vec2f(snoise2(p * 0.35 + vec2f(t * 0.05, 0.0)), snoise2(p * 0.35 + vec2f(7.0, t * 0.04))) * 0.006 * smoothstep(60.0, 3.0, k);
  let m = normalize(vec3f(d.x + w.x, -d.y + abs(w.y) + 1e-4, d.z));
  return pcMoon_up(m, t) * vec3f(0.86, 0.92, 1.0) * mix(0.85, 1.0, pow(1.0 + d.y, 3.0));
}
