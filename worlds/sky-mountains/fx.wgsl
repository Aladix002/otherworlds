// Transparent effects: waterfalls dissolving into mist, drifting motes.
// instance: a = (lip position, length), b = (width, seed, outward angle, puff index)
fn fallCtr(a: vec4f, b: vec4f, s: f32) -> vec3f {
  let sway = 1.0 + 0.3 * sin(G.time * 0.23 + b.y * 20.0);
  return a.xyz + vec3f(cos(b.z), 0.0, sin(b.z)) * (1.1 * (1.0 - exp(-s * 5.0))) + vec3f(0.0, -a.w * (s * s * 0.85 + s * 0.15), 0.0)
    + vec3f(0.8, 0.0, 0.55) * (s * s * a.w * 0.07 * sway);
}
struct WO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: vec4f };
const WSEG = 28.0;
// thin strands: one ribbon each, facing the camera around the vertical (one side vector per strand, so no zig-zag)
@vertex fn vsFall(@builtin(vertex_index) vi: u32, @location(3) a: vec4f, @location(4) b: vec4f) -> WO {
  let c = vi % 6u;
  let cx = f32(c == 1u || c == 4u || c == 5u); let cy = f32(c == 2u || c == 3u || c == 5u);
  let s = (f32(vi / 6u) + cy) / WSEG;
  let u = cx * 2.0 - 1.0;
  let wd = b.x * (1.0 + 2.6 * s);
  let side = normalize(cross(vec3f(0.0, 1.0, 0.0), a.xyz - vec3f(0.0, a.w * 0.4, 0.0) - G.camPos));
  var o: WO;
  o.w = fallCtr(a, b, s) + side * (u * wd);
  o.uv = vec2f(u, s); o.k = vec4f(a.w, wd, b.y, 0.0);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn fallLight(wp: vec3f, n: f32) -> vec3f {
  let back = max(dot(normalize(wp - G.camPos), G.sunDir), 0.0);
  return atmo(G.ambientSky * 1.5 + G.sunColor * (0.16 + 0.14 * n + 0.6 * back * back), wp);
}
@fragment fn fsFall(in: WO) -> @location(0) vec4f {
  let u = in.uv.x; let s = in.uv.y;
  let ym = in.k.x * (s * s * 0.85 + s * 0.15);
  let e = max(1.0 - u * u, 0.0);
  let xm = u * in.k.y;
  let n1 = textureSample(NT, NS, vec2f(xm * 0.22 + in.k.z, ym * 0.006 - G.time * 0.06)).a;
  let n2 = textureSample(NT, NS, vec2f(xm * 0.07 + in.k.z * 3.0, ym * 0.021 - G.time * 0.09)).a;
  let n = n1 * 0.6 + n2 * 0.4;
  let thr = mix(0.1, 0.66, s);                       // the strand erodes into droplets as it falls
  var a = pow(e, 1.6) * smoothstep(thr, thr + 0.32, n + 0.28 * e) * smoothstep(0.0, 0.012, s) * (1.0 - smoothstep(0.5, 1.0, s)) * 0.85;
  a *= 1.0 - smoothstep(900.0, 1500.0, distance(in.w, G.camPos));
  return vec4f(fallLight(in.w, n1) * a, a);
}
// soft round mist puffs sinking through the lower part of each fall
struct PO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: vec2f };
@vertex fn vsPuff(@builtin(vertex_index) vi: u32, @location(3) a: vec4f, @location(4) b: vec4f) -> PO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let ph = fract(G.time * 0.022 + b.w * 0.2 + b.y * 3.7);
  let s = 0.38 + 0.6 * ph;
  let sz = (1.6 + 6.5 * ph) * (0.7 + 0.5 * b.x) * (0.8 + 0.4 * fract(b.w * 0.618 + b.y));
  let ctr = fallCtr(a, b, s) + vec3f(cos(b.z), 0.0, sin(b.z)) * (sz * 0.5);
  var o: PO;
  o.c = cs[vi]; o.w = billboard(ctr, o.c, vec2f(sz));
  o.k = vec2f(sin(ph * PI) * 0.2, b.y * 7.0 + b.w);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsPuff(in: PO) -> @location(0) vec4f {
  let r = min(dot(in.c, in.c), 1.0);
  let n = textureSample(NT, NS, in.c * 0.11 + vec2f(in.k.y * 0.37, G.time * 0.004 + in.k.y)).a;
  let f = 1.0 - r;
  var a = f * f * smoothstep(0.25, 0.85, n + 0.45 * f) * in.k.x;
  a *= (1.0 - smoothstep(700.0, 1300.0, distance(in.w, G.camPos))) * smoothstep(8.0, 34.0, distance(in.w, G.camPos));
  return vec4f(fallLight(in.w, n) * a, a);
}

// ---- motes: soft round pollen sparks around the camera, positions hashed and wrapped (no simulation) ----
struct MO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) a: f32 };
@vertex fn vsMote(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let h = hash3u(vec3u(ii, 17u, 5u)); let h2 = hash3u(vec3u(ii, 3u, 91u));
  let t = G.time;
  var p = h * 56.0 + vec3f(0.35, 0.05, 0.22) * t * (0.5 + h2.x) + vec3f(sin(t * 0.21 + h2.y * 30.0), sin(t * 0.17 + h2.z * 30.0), cos(t * 0.19 + h2.x * 30.0)) * 0.7;
  let rel = p - G.camPos;
  p = p - 56.0 * round(rel / 56.0);
  let d = distance(p, G.camPos);
  let c = cs[vi];
  let sz = (0.03 + 0.05 * h2.z * h2.z) * (1.0 + d * 0.06);
  var o: MO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(sz)), 1.0);
  o.c = c;
  let back = max(dot(normalize(p - G.camPos), G.sunDir), 0.0);
  o.a = smoothstep(1.0, 4.0, d) * (1.0 - smoothstep(16.0, 27.0, d)) * (0.5 + 0.5 * sin(t * (0.4 + h.x) + h.y * 40.0)) * (0.05 + 0.9 * pow(back, 5.0));
  return o;
}
@fragment fn fsMote(in: MO) -> @location(0) vec4f {
  let r = dot(in.c, in.c);
  let a = (exp(-r * 4.0) - 0.0183) * in.a;
  return vec4f(vec3f(1.5, 0.95, 0.4) * max(a, 0.0), 0.0);
}

