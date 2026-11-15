// Jellyfish: per-jelly static params in storage; pose, pulse and drift are pure functions of time.
// a = (x, columnBottomY, z, size), b = (period, hue, seedA, seedB), c = (columnH, brightness, 0, 0)
struct J { a: vec4f, b: vec4f, c: vec4f };
@group(1) @binding(0) var<storage, read> jel: array<J>;
override NSEG: u32 = 14u;
const NT = 16u;   // 12 marginal tentacles + 4 oral arms

struct JS { p: vec3f, contr: f32, f: f32, fade: f32, r: vec3f, u: vec3f, fw: vec3f, col: vec3f };
fn aoPulse(f: f32) -> f32 { return select(1.0 - smoothstep(0.2, 1.0, f), smoothstep(0.0, 0.2, f), f < 0.2); }
fn aoJel(j: J, t: f32) -> JS {
  var s: JS;
  let ph = t / j.b.x + j.b.z;
  s.f = fract(ph);
  s.contr = aoPulse(s.f);
  let prog = floor(ph) + smoothstep(0.03, 0.55, s.f);
  let H = j.c.x;
  let y = fract((j.b.w * H + prog * 0.3 * j.a.w + t * 0.05) / H) * H;
  s.p = vec3f(j.a.x + 0.9 * sin(t * 0.071 + 6.0 * j.b.z), j.a.y + y, j.a.z + 0.9 * cos(t * 0.063 + 5.0 * j.b.w));
  s.fade = smoothstep(0.0, 5.0, y) * smoothstep(H, H - 5.0, y);
  s.u = normalize(vec3f(0.22 * sin(t * 0.09 + j.b.z * 7.0), 1.0, 0.22 * cos(t * 0.083 + j.b.w * 9.0)));
  s.r = normalize(cross(s.u, vec3f(0.0, 0.0, 1.0)));
  s.fw = cross(s.r, s.u);
  let pink = vec3f(1.5, 0.32, 0.8); let cyan = vec3f(0.25, 0.9, 1.5); let vio = vec3f(0.75, 0.38, 1.6); let gold = vec3f(1.5, 0.75, 0.3);
  var c = mix(pink, vio, smoothstep(0.25, 0.5, j.b.y));
  c = mix(c, cyan, smoothstep(0.55, 0.8, j.b.y));
  c = mix(c, gold, smoothstep(0.92, 0.98, j.b.y));
  s.col = c * j.c.y;
  return s;
}

// ---------------- bell ----------------
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) l: vec3f, @location(3) col: vec3f, @location(4) m: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let j = jel[ii];
  let S = aoJel(j, G.time);
  let v = 1.0 - uv.y;                         // 0 = top of the bell, 1 = rim
  let rs = 1.0 - 0.3 * S.contr * (0.25 + 0.75 * v * v);
  let ys = 1.0 + 0.16 * S.contr;
  let lp = vec3f(p.x * rs, p.y * ys - 0.1 * S.contr * v * v, p.z * rs);
  let sz = j.a.w;
  var o: VO;
  o.w = S.p + (S.r * lp.x + S.u * lp.y + S.fw * lp.z) * sz;
  o.n = S.r * (n.x / rs) + S.u * (n.y / ys) + S.fw * (n.z / rs);
  o.l = vec3f(p.x, v, p.z);
  o.col = S.col * S.fade;
  o.m = vec2f(S.contr, sz);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn aoLn(d: f32, w: f32, fw: f32) -> f32 { return (1.0 - smoothstep(0.0, w + fw, d)) * w / (w + fw); }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let V = normalize(G.camPos - in.w);
  let n = normalize(in.n);
  let fres = 1.0 - abs(dot(n, V));
  let v = in.l.y;
  let th = atan2(in.l.z, in.l.x);
  let lr = length(in.l.xz);
  var e = 0.05 + 0.8 * pow(fres, 2.2);
  // four gonads (clover) near the top
  let gon = pow(0.5 + 0.5 * cos(4.0 * th), 3.0) * exp(-pow((lr - 0.32) / 0.12, 2.0)) * smoothstep(0.75, 0.3, v);
  // radial canals
  let q = th * 16.0 / TAU;
  let can = aoLn(abs(fract(q) - 0.5), 0.04, fwidth(q)) * smoothstep(0.15, 0.5, v);
  // glowing rim with bead lights
  let rim = exp(-pow((v - 0.97) / 0.035, 2.0)) * (0.7 + 0.6 * pow(0.5 + 0.5 * cos(th * 24.0), 4.0));
  e += can * 0.35 + rim * 1.6;
  let glow = 0.55 + 0.7 * in.m.x;
  var c = in.col * e * glow + vec3f(1.4, 0.9, 0.6) * gon * 0.9 * glow * length(in.col) * 0.5;
  let d = distance(in.w, G.camPos);
  c *= smoothstep(0.6, 2.5, d) * mix(1.0, 0.25, smoothstep(40.0, 220.0, d));
  return vec4f(c * 0.55, 0.0);
}

// ---------------- tentacles (procedural ribbons) ----------------
fn aoTent(S: JS, j: J, tj: u32, u: f32, t: f32) -> vec3f {
  let h = hash3u(vec3u(tj, u32(j.b.z * 1000.0), 7u));
  let oral = tj >= 12u;
  let th = select(f32(tj) / 12.0 * TAU + h.x * 0.3, f32(tj - 12u) * 1.5708 + 0.4, oral);
  let Lt = select(4.0 + 3.5 * h.y, 1.6 + 0.9 * h.y, oral);
  let r0 = select(0.9, 0.14, oral);
  let rimPull = 1.0 - 0.3 * aoPulse(fract(S.f - u * 0.18 + 1.0)) * (1.0 - u);
  let r = r0 * (1.0 - 0.45 * u) * rimPull + select(0.0, 0.12 * sin(u * 9.0 + t * 0.8 + h.z * 6.0) * u, oral);
  let sway = vec3f(sin(t * 0.55 + f32(tj) * 1.3 + j.b.z * 20.0 - u * 3.3), 0.0, cos(t * 0.43 + f32(tj) * 0.7 + j.b.w * 9.0 - u * 2.7));
  let lp = vec3f(cos(th) * r, -0.05 - u * Lt, sin(th) * r) + sway * pow(u, 1.4) * Lt * 0.18;
  return S.p + (S.r * lp.x + S.u * lp.y + S.fw * lp.z) * j.a.w;
}
struct TO { @builtin(position) pos: vec4f, @location(0) a: f32, @location(1) col: vec3f };
@vertex fn vst(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TO {
  let j = jel[ii];
  let t = G.time;
  let S = aoJel(j, t);
  let tj = vi / (6u * NSEG);
  let seg = (vi / 6u) % NSEG;
  let c = aoCorner(vi);
  let u = (f32(seg) + c.y * 0.5 + 0.5) / f32(NSEG);
  let du = 0.5 / f32(NSEG);
  let p = aoTent(S, j, tj, u, t);
  let tg = aoTent(S, j, tj, u + du, t) - aoTent(S, j, tj, u - du, t);
  let V = G.camPos - p;
  let side = normalize(cross(tg, V));
  let d = length(V);
  let oral = tj >= 12u;
  let w = select(0.012, 0.07, oral) * j.a.w;
  let ws = max(w, aoPix(d) * 1.2);
  var o: TO;
  o.pos = G.viewProj * vec4f(p + side * c.x * ws, 1.0);
  o.a = c.x;
  let bead = exp(-pow((u - (S.f * 1.5 - 0.1)) * 5.0, 2.0));
  let k = pow(1.0 - u, 0.8) * (0.35 + 0.9 * bead) * (w / ws) * select(1.0, 0.6, oral);
  o.col = S.col * S.fade * k * smoothstep(0.6, 2.5, d) * mix(1.0, 0.25, smoothstep(40.0, 220.0, d));
  return o;
}
@fragment fn fst(in: TO) -> @location(0) vec4f {
  return vec4f(in.col * exp(-in.a * in.a * 2.5) * 0.5, 0.0);
}
