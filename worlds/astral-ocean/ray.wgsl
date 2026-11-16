// Rays: one sheet mesh (x = span -1..1, z = chord 0..1; uv.x = 1 marks the tail strip) shaped and flapped here.
// Instance 0 is the giant of the deep (path 9): a dark silhouette with a faint edge. The others are the small
// luminous pod that glides in arcs over the reef (path 8), strung along the same curve.
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) z: vec2f, @location(2) l: vec3f,
  @location(3) @interpolate(flat) k: u32,
};
fn aoRayO(i: u32, t: f32) -> vec3f {
  if (i == 0u) { return aoPathPos(paths[9], aoPathU(paths[9], t)); }
  let h = hash3u(vec3u(i, 9u, 2u));
  let tt = t - f32(i) * 2.1 - h.x * 1.6;
  return aoPathPos(paths[8], aoPathU(paths[8], tt)) + vec3f((h.y - 0.5) * 9.0, (h.z - 0.5) * 5.0 + 2.4 * sin(tt * 0.33 + h.x * 6.3), (h.x - 0.5) * 9.0);
}
fn aoRayP(x: f32, v: f32, ph: f32, amp: f32) -> vec3f {
  let ax = abs(x);
  let zl = -0.5 + 0.62 * pow(ax, 1.35) - 0.13 * exp(-pow((ax - 0.17) / 0.09, 2.0));   // swept leading edge + two head lobes
  let zt = 0.42 - 0.2 * ax - 0.13 * sin(ax * 3.14159);                                  // concave trailing edge
  let fl = sin(ph - ax * 1.7 - v * 0.7);                                                // the stroke travels root -> tip
  let y = amp * pow(ax, 1.5) * (fl + 0.35) + 0.2 * exp(-ax * ax * 14.0) * sin(v * 3.14159) * (1.0 - 0.3 * v);
  let tip = sqrt(max(1.0 - pow(ax, 8.0), 0.0));          // the chord closes to a rounded tip
  return vec3f(x * (1.0 - 0.1 * amp * ax * (1.0 + fl)), y, mix(zl, zt, 0.5 + (v - 0.5) * tip));
}
@vertex fn vs(@location(0) p: vec3f, @location(2) uv: vec2f, @builtin(instance_index) i: u32) -> VO {
  let t = G.time;
  let h = hash3u(vec3u(i, 4u, 7u));
  let big = i == 0u;
  let ph = t * select(1.1 + 0.4 * h.x, 0.32, big) + h.y * 6.3;
  let amp = select(0.3, 0.2, big);
  let O = aoRayO(i, t);
  let S = select(1.7 + 1.2 * h.z, 64.0, big);
  var lp = aoRayP(p.x, p.z, ph, amp);
  let tail = uv.x > 0.5;
  let s = p.z - 1.0;
  var f = normalize(aoRayO(i, t + 0.3) - aoRayO(i, t - 0.3));
  if (tail) {                  // tail: a tapering whip that lags behind the turn and carries the body wave
    lp = vec3f(0.08 * s * s * sin(ph * 0.5 - s * 1.5), 0.06 * s * sin(ph - 2.0 - s * 2.5) - 0.05 * s * s, 0.36 + s * 0.95);
    f = normalize(mix(f, normalize(aoRayO(i, t - 1.6) - aoRayO(i, t - 2.2)), s * 0.8));
  }
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  let u = cross(r, f);
  var o: VO;
  o.w = O + (r * lp.x + u * lp.y - f * lp.z) * S;
  if (tail) {                  // camera-facing ribbon, never thinner than ~2 px
    let V = o.w - G.camPos;
    o.w += normalize(cross(f, V)) * sign(p.x) * max(0.02 * S * (1.0 - 0.9 * s), aoPix(length(V)) * 1.0);
  }
  o.l = vec3f(p.x, p.z, uv.x); o.k = i; o.z = vec2f(lp.z, s);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn aoRl(d: f32, w: f32) -> f32 { let fw = fwidth(d) + 1e-4; return (1.0 - smoothstep(0.0, w + fw, d)) * w / (w + fw); }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let Vv = G.camPos - in.w;
  let dist = length(Vv);
  let big = in.k == 0u;
  let t = G.time;
  let ax = abs(in.l.x); let v = in.l.y;
  let tail = in.l.z > 0.5;
  let kf = f32(in.k);
  // distance to the outline (in half-spans), for the edge light
  let ch = 0.92 - 0.82 * ax;
  let ed = select(min(min(v, 1.0 - v) * ch, (1.0 - ax) * 0.8), 0.0, tail);
  let rim = exp(-ed * select(26.0, 60.0, big));
  // wing ribs fanning from the spine, a pulse of light running out along them; spine line; pale spots on the back
  let ribs = aoRl(abs(fract(v * 5.0 + ax * 1.5) - 0.5), 0.06) * smoothstep(0.08, 0.3, ax) * smoothstep(0.0, 0.12, ed);
  let pul = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(ax * 7.0 - t * select(0.9, 0.25, big) + kf), 4.0);
  let spine = aoRl(ax, 0.012);
  let sq = vec2f(in.l.x, in.z.x) * select(7.0, 14.0, big);     // planform space, so the spots stay round
  let sc = floor(sq);
  let sh = hash22(sc + kf * 5.0);
  let sd = length(sq - sc - 0.25 - 0.5 * sh);
  let spot = smoothstep(0.16, 0.02, sd) * step(sh.x, select(0.5, 0.22, big)) * smoothstep(0.0, 0.08, ed) * (0.6 + 0.4 * sin(t * 0.5 + sh.y * 30.0));
  let hue = hash11(kf * 3.7);
  let col = mix(vec3f(0.2, 1.05, 0.85), vec3f(0.3, 0.7, 1.5), hue);
  var e: vec3f; var a: f32;
  if (big) {
    let lod = smoothstep(400.0, 90.0, dist);
    e = vec3f(0.05, 0.2, 0.34) * (rim * 0.9 + (ribs * pul * 0.5 + spine * 0.4) * lod) + vec3f(0.5, 0.75, 1.0) * spot * 0.5 * lod + vec3f(0.002, 0.004, 0.012);
    e *= select(1.0, 0.25, tail);
    a = 0.9 * smoothstep(0.0, 0.012, ed + select(0.0, 1.0, tail));
  } else {
    let heart = exp(-ax * ax * 9.0) * sin(v * 3.14159);          // the body glows from within; the wings are clear glass
    e = col * (rim * 1.3 + ribs * pul * 0.6 + spine * 0.7 + heart * 0.3 + 0.03) + vec3f(1.4, 1.1, 0.7) * spot * 1.3;
    e *= select(1.0, 0.6, tail) * exp(-dist * 0.012);
    a = 0.1 + 0.25 * rim + 0.25 * heart;
  }
  let fade = smoothstep(2.0, 8.0, dist) * select(1.0, 1.0 - in.z.y, tail);
  return vec4f(e * fade, a * fade);
}
