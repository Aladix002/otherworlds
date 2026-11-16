// Small life: drifting seeds and pollen (transparent); falling leaves, wisteria petals, bees and butterflies (opaque cut-outs).
const QC = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
struct PO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) c: vec4f, @location(2) w: vec3f };
@vertex fn vsSeed(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  let h = hash3u(vec3u(ii, 7u, 13u)); let g = hash3u(vec3u(ii, 3u, 5u));
  let B = vec3f(40.0, 1.0, 40.0);
  let ctr = G.camPos + vec3f(G.camFwd.x, 0.0, G.camFwd.z) * 14.0;
  let p = h * B + vec3f(WD.x, 0.0, WD.y) * (G.time * (0.3 + 0.35 * g.x)) + vec3f(sin(G.time * 0.21 + g.y * 30.0), 0.0, cos(G.time * 0.19 + g.x * 30.0)) * 0.9;
  let r = (fract((p - ctr) / B + 0.5) - 0.5) * B;
  var w = ctr + r;
  let big = step(0.7, g.z);
  let m = mapA(w.xz);
  w.y = m.r + 0.7 + h.y * h.y * 6.0 + sin(G.time * 0.17 + g.z * 30.0) * 0.4;
  let d = distance(w, G.camPos);
  var o: PO;
  o.uv = QC[vi];
  o.w = billboard(w, o.uv, vec2f(mix(0.016, 0.06, big)));
  o.c = vec4f(big, g.x, smoothstep(0.7, 2.5, d) * (1.0 - smoothstep(0.36, 0.5, max(abs(r.x), abs(r.z)) / 40.0)), m.a);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsSeed(in: PO) -> @location(0) vec4f {
  let r2 = dot(in.uv, in.uv);
  let fil = pow(abs(cos(atan2(in.uv.y, in.uv.x) * 5.0 + in.c.y * 6.0)), 8.0) * max(1.0 - r2, 0.0);
  let core = exp(-r2 * 6.0);
  let a = mix(core * 0.7, min(exp(-r2 * 40.0) + fil * 0.5, 1.0), in.c.x) * in.c.z;
  let back = pow(max(dot(normalize(in.w - G.camPos), G.sunDir), 0.0), 4.0);
  let col = (G.ambientSky * 1.3 + G.sunColor * (0.3 + 1.2 * back) * in.c.w) * vec3f(1.0, 0.97, 0.88);
  return vec4f(atmo(col, in.w) * a, a);
}

// instance: (anchor, kind + seed). kind 0 golden leaf, 1 wisteria petal, 2 bee
struct LO {
  @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) c: vec4f,
  @location(2) w: vec3f, @location(3) n: vec3f, @location(4) @interpolate(flat) sh: f32,
};
@vertex fn vsLeaf(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> LO {
  let kind = floor(a.w); let sd = fract(a.w);
  let h = vec3f(fract(sd * 17.3), fract(sd * 43.7), fract(sd * 7.9));
  var o: LO;
  o.uv = QC[vi];
  var ctr = a.xyz; var e1 = G.camRight; var e2 = G.camUp; var sz = 0.024;
  if (kind < 1.5) {                                  // fall, flutter, drift with the wind, rest a moment on the ground
    let ph = fract(G.time / (mix(9.0, 16.0, h.x) * mix(1.0, 0.75, kind)) + h.y);
    ctr += vec3f(WD.x, 0.0, WD.y) * (ph * mix(3.0, 0.5, kind)) + vec3f(sin(ph * 9.0 + sd * 50.0) * 0.5, -ph * mix(7.0, 3.6, kind), cos(ph * 7.0 + sd * 70.0) * 0.5);
    let gy = mapA(ctr.xz).r + 0.04;
    let rest = step(ctr.y, gy);
    ctr.y = max(ctr.y, gy);
    sz = mix(0.08, 0.038, kind) * smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.93, 1.0, ph));
    let A = mix(G.time * (0.9 + h.z) + sd * 100.0, sd * 100.0, rest); let B = mix(G.time * 0.7 + sd * 37.0, 1.5708, rest);
    e1 = vec3f(cos(A), 0.0, sin(A));
    e2 = vec3f(-sin(A) * cos(B), sin(B) * (1.0 - rest), cos(A) * cos(B));
    e2 = normalize(e2 + vec3f(0.0, 1e-3, 0.0));
    let g = fract(sd * 3.3);
    o.c = vec4f(mix(mix(vec3f(1.0, 0.6, 0.08), vec3f(0.9, 0.3, 0.04), g), mix(vec3f(0.55, 0.38, 1.0), vec3f(1.0, 0.8, 0.95), g), kind), kind);
  } else {                                           // bee: slow hover loops over its patch
    let t = G.time * 0.33 + sd * 40.0;
    ctr += vec3f(sin(t) * 1.7 + sin(t * 2.7) * 0.3, 0.0, sin(t * 1.3 + 1.0) * 1.5);
    ctr.y = mapA(ctr.xz).r + 0.85 + 0.22 * sin(t * 1.9);
    o.c = vec4f(1.0, 0.75, 0.1, 2.0);
  }
  o.w = ctr + (e1 * o.uv.x + e2 * o.uv.y) * sz;
  o.n = cross(e1, e2);
  o.sh = mapA(ctr.xz).a;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
// butterflies: two wings (12 vertices), wandering over the flowers. instance: (anchor, seed)
@vertex fn vsFly(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> LO {
  let sd = a.w; let t = G.time * 0.2 + sd * 50.0;
  let p2 = a.xz + vec2f(sin(t) * 5.0 + sin(t * 2.3 + sd * 9.0) * 1.5, cos(t * 0.8) * 4.0 + cos(t * 1.9) * 1.6);
  let f2 = normalize(vec2f(cos(t) * 5.0 + cos(t * 2.3 + sd * 9.0) * 3.45, -sin(t * 0.8) * 3.2 - sin(t * 1.9) * 3.04));
  let m = mapA(p2);
  let ctr = vec3f(p2.x, m.r + 1.0 + 0.35 * sin(t * 3.1) + 0.12 * sin(t * 7.3), p2.y);
  let sgn = select(1.0, -1.0, vi < 6u);
  let uv = QC[vi % 6u];
  let fl = 0.15 + 1.0 * (0.5 + 0.5 * sin(G.time * (6.0 + sd * 3.0) + sd * 30.0));
  let fw = vec3f(f2.x, 0.0, f2.y); let rt = vec3f(-f2.y, 0.0, f2.x);
  let wing = rt * (cos(fl) * sgn) + vec3f(0.0, sin(fl), 0.0);
  let sz = 0.075 + 0.04 * fract(sd * 7.7);
  var o: LO;
  o.uv = vec2f(uv.x * 0.5 + 0.5, uv.y);
  o.w = ctr + fw * (uv.y * 0.75 * sz) + wing * (o.uv.x * sz);
  o.n = cross(fw, wing) * sgn;
  let k = fract(sd * 5.0);
  o.c = vec4f(select(select(vec3f(1.0, 0.5, 0.05), vec3f(0.2, 0.5, 1.0), k < 0.66), vec3f(1.0, 0.95, 0.75), k < 0.33), 3.0);
  o.sh = m.a;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsLeaf(in: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let u = in.uv; let kind = in.c.a;
  var alb = in.c.rgb; var tr = 0.8;
  if (kind < 1.5) {
    if (abs(u.x) > mix(0.62, 0.8, kind) * pow(max(1.0 - u.y * u.y, 0.0), mix(0.8, 0.45, kind))) { discard; }
    alb *= 0.75 + 0.3 * (1.0 - abs(u.x)) ;
  } else if (kind < 2.5) {
    let body = length(u * vec2f(1.1, 2.0));
    let wing = length((u - vec2f(-0.1, 0.5)) * vec2f(1.6, 2.4));
    if (body > 1.0 && wing > 1.0) { discard; }
    alb = select(vec3f(0.75, 0.8, 0.85), mix(alb, vec3f(0.03, 0.02, 0.01), step(0.0, sin(u.x * 11.0 + 1.0))), body <= 1.0);
    tr = 0.2;
  } else {
    let sh = max(1.0 - length((u - vec2f(0.5, 0.36)) / vec2f(0.56, 0.62)), 1.0 - length((u - vec2f(0.38, -0.48)) / vec2f(0.42, 0.5)));
    if (sh < 0.0) { discard; }
    alb = mix(vec3f(0.03, 0.02, 0.03), alb, smoothstep(0.08, 0.3, sh)) * (0.8 + 0.3 * smoothstep(0.4, 0.8, sh));
  }
  return vec4f(shade(alb, n, in.w, 1.0, in.sh, tr, 0.0), 1.0);
}
