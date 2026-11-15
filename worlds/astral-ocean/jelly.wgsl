// Jellyfish: per-jelly static params in storage; pose, pulse and drift are pure functions of time.
// a = (x, columnBottomY, z, size), b = (period, hue, seedA, seedB), c = (columnH, brightness, bellHeight, 0),
// d = offset written by the CPU every frame: jellies drift out of the whales' way
struct J { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(1) @binding(0) var<storage, read> jel: array<J>;
override NSEG: u32 = 14u;
const NM = 10u;   // marginal tentacles
const NT = 14u;   // + 4 oral arms

struct JS { p: vec3f, contr: f32, sz: f32, f: f32, fade: f32, r: vec3f, u: vec3f, fw: vec3f, col: vec3f };
fn aoPulse(f: f32) -> f32 { return select(1.0 - smoothstep(0.2, 1.0, f), smoothstep(0.0, 0.2, f), f < 0.2); }
fn aoJel(j: J, t: f32) -> JS {
  var s: JS;
  let ph = t / j.b.x + j.b.z;
  s.f = fract(ph);
  s.contr = aoPulse(s.f);
  let prog = floor(ph) + smoothstep(0.03, 0.55, s.f);
  let H = j.c.x;
  let y = fract((j.b.w * H + prog * 0.3 * j.a.w + t * 0.05) / H) * H;
  s.p = vec3f(j.a.x + 0.45 * sin(t * 0.071 + 6.0 * j.b.z), j.a.y + y, j.a.z + 0.45 * cos(t * 0.063 + 5.0 * j.b.w)) + j.d.xyz;
  s.fade = smoothstep(0.0, 6.0, y) * smoothstep(H, H - 6.0, y);
  s.sz = j.a.w * (0.25 + 0.75 * sqrt(s.fade));
  s.u = normalize(vec3f(0.09 * sin(t * 0.09 + j.b.z * 7.0), 1.0, 0.09 * cos(t * 0.083 + j.b.w * 9.0)));
  s.r = normalize(cross(s.u, vec3f(0.0, 0.0, 1.0)));
  s.fw = cross(s.r, s.u);
  // pink -> peach -> violet -> cyan -> teal
  var c = mix(vec3f(1.5, 0.32, 0.8), vec3f(1.5, 0.62, 0.42), smoothstep(0.12, 0.26, j.b.y));
  c = mix(c, vec3f(0.75, 0.38, 1.6), smoothstep(0.32, 0.46, j.b.y));
  c = mix(c, vec3f(0.25, 0.85, 1.5), smoothstep(0.55, 0.7, j.b.y));
  c = mix(c, vec3f(0.2, 1.15, 0.85), smoothstep(0.8, 0.92, j.b.y));
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
  let lp = vec3f(p.x * rs, p.y * ys * j.c.z - 0.1 * S.contr * v * v, p.z * rs);
  var o: VO;
  o.w = S.p + (S.r * lp.x + S.u * lp.y + S.fw * lp.z) * S.sz;
  o.n = S.r * (n.x / rs) + S.u * (n.y / (ys * j.c.z)) + S.fw * (n.z / rs);
  o.l = vec3f(p.x, v, p.z);
  o.col = S.col * S.fade;
  o.m = vec2f(S.contr, S.sz);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn aoLn(d: f32, w: f32, fw: f32) -> f32 { return (1.0 - smoothstep(0.0, w + fw, d)) * w / (w + fw); }
fn aoHaze(c: vec3f, d: f32) -> vec3f {      // distance haze: dimmer, cooler, less saturated
  let k = 1.0 - exp(-d * 0.011);
  return mix(c, vec3f(0.3, 0.3, 0.6) * dot(c, vec3f(0.3, 0.5, 0.2)), k * 0.7) * (1.0 - 0.7 * k);
}
@fragment fn fs(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let V = normalize(G.camPos - in.w);
  let n = normalize(in.n);
  let nd = abs(dot(n, V));
  let fres = 1.0 - nd;
  let v = in.l.y;
  let th = atan2(in.l.z, in.l.x);
  let lr = length(in.l.xz);
  var e = 0.05 + 0.8 * pow(fres, 2.2);
  // four gonads (clover) near the top
  let gon = pow(0.5 + 0.5 * cos(4.0 * th), 4.0) * exp(-pow((lr - 0.3) / 0.09, 2.0)) * smoothstep(0.7, 0.3, v);
  // radial canals
  let q = th * 16.0 / TAU;
  let can = aoLn(abs(fract(q) - 0.5), 0.1, fwidth(q)) * smoothstep(0.15, 0.5, v);
  // glowing rim with bead lights
  let rim = exp(-pow((v - 0.975) / 0.022, 2.0)) * (0.6 + 0.6 * pow(0.5 + 0.5 * cos(th * 24.0), 4.0));
  e += can * 0.1 + rim * 0.9;
  // light held inside the bell, swelling with every pulse
  let inner = nd * nd * smoothstep(1.0, 0.25, v) * (0.1 + 0.5 * in.m.x);
  let glow = 0.5 + 0.9 * in.m.x;
  var c = (in.col * e * glow + (in.col * 0.7 + vec3f(0.25, 0.2, 0.15)) * (gon * 0.35 * glow + inner)) * select(0.45, 1.0, ff);
  let d = distance(in.w, G.camPos);
  c = aoHaze(c, d) * smoothstep(0.6, 2.5, d);
  return vec4f(c * 0.55, 0.0);
}

// ---------------- tentacles (procedural ribbons) ----------------
fn aoTent(S: JS, j: J, tj: u32, u: f32, t: f32) -> vec3f {
  let h = hash3u(vec3u(tj, u32(j.b.z * 1000.0), 7u));
  let oral = tj >= NM;
  let th = select(f32(tj) / f32(NM) * TAU + h.x * 0.45, f32(tj - NM) * 1.5708 + 0.4, oral);
  let Lt = select(3.2 + 4.2 * h.y, 1.7 + 1.1 * h.y, oral);
  let r0 = select(0.92, 0.15, oral);
  let rimPull = 1.0 - 0.3 * aoPulse(fract(S.f - u * 0.18 + 1.0)) * (1.0 - u);
  // strands hang from the rim, gather under the bell and trail
  var r = r0 * (1.0 - 0.5 * smoothstep(0.0, 0.55, u)) * rimPull;
  let ph = f32(tj) * 1.7 + j.b.z * 20.0;
  // travelling sinusoidal sway (two incommensurate waves) + a slow shared current, both growing toward the tip
  let a1 = sin(u * 5.0 - t * 0.7 + ph) * 0.6 + sin(u * 8.5 - t * 0.45 + ph * 1.9) * 0.4;
  let b1 = cos(u * 4.2 - t * 0.6 + ph * 0.7) * 0.6 + cos(u * 9.3 - t * 0.5 + ph * 1.3) * 0.4;
  let cur = vec3f(sin(t * 0.05 + j.b.w * 6.0), 0.0, cos(t * 0.043 + j.b.z * 6.0));
  var off = (vec3f(a1, 0.0, b1) * pow(u, 1.2) * 0.17 + cur * u * u * 0.26) * Lt;
  if (oral) {     // frilly oral arms: a loose spiral
    r += 0.1 * u;
    off = off * 0.5 + vec3f(cos(u * 11.0 + ph + t * 0.3), 0.0, sin(u * 11.0 + ph + t * 0.3)) * 0.2 * u;
  }
  // the pulse runs down the strand: it stretches after the bell jumps ahead, then catches up
  let st = 1.0 - 0.1 * aoPulse(fract(S.f - 0.1 - u * 0.4 + 1.0)) * u;
  let lp = vec3f(cos(th) * r, -0.05 - u * Lt * st, sin(th) * r) + off;
  return S.p + (S.r * lp.x + S.u * lp.y + S.fw * lp.z) * S.sz;
}
struct TO { @builtin(position) pos: vec4f, @location(0) a: f32, @location(1) col: vec3f, @location(2) uo: vec2f };
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
  let oral = tj >= NM;
  // tapered width, never thinner than ~1.6 px (energy conserving)
  let w = select(0.022 * (1.0 - 0.7 * u), 0.2 * (0.35 + 0.65 * sin(3.14159 * pow(u, 0.7))), oral) * S.sz;
  let ws = max(w, aoPix(d) * 1.7);
  var o: TO;
  o.pos = G.viewProj * vec4f(p + side * c.x * ws, 1.0);
  o.a = c.x;
  o.uo = vec2f(u, select(0.0, 1.0, oral));
  let bead = exp(-pow((u - (S.f * 1.5 - 0.1)) * 5.0, 2.0));
  let k = pow(1.0 - u, 1.3) * (0.4 + 0.9 * bead) * (w / ws) * select(1.0, 0.5, oral);
  o.col = aoHaze(S.col * S.fade * k, d) * smoothstep(0.6, 2.5, d);
  return o;
}
@fragment fn fst(in: TO) -> @location(0) vec4f {
  // oral arms: ruffled edges brighter than the membrane
  let fr = 0.55 + 0.45 * sin(in.uo.x * 52.0 + in.a * 2.5);
  let aa = abs(in.a);
  let ruf = (0.25 + 0.75 * smoothstep(0.35, 0.8, aa) * fr) * smoothstep(1.0, 0.8, aa);
  let a = mix(exp(-in.a * in.a * 2.5), ruf, in.uo.y);
  return vec4f(in.col * a * 0.5, 0.0);
}

// ---------------- soft halo around each bell ----------------
struct GO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsg(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GO {
  let j = jel[ii];
  let S = aoJel(j, G.time);
  let c = aoCorner(vi);
  let p = S.p + S.u * 0.25 * S.sz;
  let d = distance(p, G.camPos);
  var o: GO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(S.sz * 2.6)), 1.0);
  o.c = c;
  o.col = aoHaze(S.col * S.fade * (0.022 + 0.05 * S.contr), d) * smoothstep(2.0, 6.0, d);
  return o;
}
@fragment fn fsg(in: GO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  return vec4f(in.col * max(exp(-r2 * 3.2) - 0.0408 * r2, 0.0), 0.0);
}
