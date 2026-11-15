// Transparent effects: waterfalls dissolving into mist, drifting motes.
struct WO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: vec4f };
const WSEG = 28.0;
// instance: a = (top, length), b = (width, seed, outward angle, kind: 0 water, 1 mist plume)
@vertex fn vsFall(@builtin(vertex_index) vi: u32, @location(3) a: vec4f, @location(4) b: vec4f) -> WO {
  let c = vi % 6u;
  let cx = f32(c == 1u || c == 4u || c == 5u); let cy = f32(c == 2u || c == 3u || c == 5u);
  let s = (f32(vi / 6u) + cy) / WSEG;
  let u = cx * 2.0 - 1.0;
  let fall = s * s * 0.85 + s * 0.15;
  let sway = 1.0 + 0.3 * sin(G.time * 0.23 + b.y * 20.0);
  var ctr = a.xyz + vec3f(cos(b.z), 0.0, sin(b.z)) * (2.5 * (1.0 - exp(-s * 6.0))) + vec3f(0.0, -a.w * fall, 0.0);
  ctr += vec3f(0.8, 0.0, 0.55) * (s * s * a.w * 0.07 * sway);
  let wd = b.x * mix(1.0 + 3.0 * pow(s, 1.4), 2.5 + 9.0 * s, b.w);
  let side = normalize(cross(vec3f(0.0, 1.0, 0.0), ctr - G.camPos));
  var o: WO;
  o.w = ctr + side * (u * wd);
  o.uv = vec2f(u, s); o.k = vec4f(a.w, wd, b.y, b.w);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsFall(in: WO) -> @location(0) vec4f {
  let u = in.uv.x; let s = in.uv.y;
  let ym = in.k.x * (s * s * 0.85 + s * 0.15);
  let e = max(1.0 - u * u, 0.0);
  let xm = u * in.k.y;
  let n1 = textureSample(NT, NS, vec2f(xm * 0.11 + in.k.z, ym * 0.008 - G.time * 0.075)).a;
  let n2 = textureSample(NT, NS, vec2f(xm * 0.031 + in.k.z * 3.0, ym * 0.0035 - G.time * 0.021)).a;
  var a = 0.0;
  if (in.k.w < 0.5) {
    let brk = smoothstep(0.18 + 0.5 * s, 0.6 + 0.4 * s, n1 * 0.7 + n2 * 0.3 + 0.25 * e);
    a = pow(e, 1.3) * brk * smoothstep(0.0, 0.015, s) * (1.0 - smoothstep(0.3, 0.9, s)) * 0.92;
  } else {
    a = e * e * smoothstep(0.05, 0.45, s) * (1.0 - smoothstep(0.6, 1.0, s)) * smoothstep(0.25, 0.7, n2 + 0.2 * n1) * 0.34;
  }
  let v = normalize(in.w - G.camPos);
  let back = max(dot(v, G.sunDir), 0.0);
  var c = G.ambientSky * 1.25 + G.sunColor * (0.2 + 0.2 * n1 + 0.9 * back * back);
  c = atmo(c, in.w);
  a *= 1.0 - smoothstep(900.0, 1500.0, distance(in.w, G.camPos));
  return vec4f(c * a, a);
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
  let sz = (0.012 + 0.03 * h2.z * h2.z) * (1.0 + d * 0.06);
  var o: MO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(sz)), 1.0);
  o.c = c;
  let back = max(dot(normalize(p - G.camPos), G.sunDir), 0.0);
  o.a = smoothstep(1.0, 4.0, d) * (1.0 - smoothstep(16.0, 27.0, d)) * (0.5 + 0.5 * sin(t * (0.4 + h.x) + h.y * 40.0)) * (0.12 + 1.6 * pow(back, 5.0));
  return o;
}
@fragment fn fsMote(in: MO) -> @location(0) vec4f {
  let r = dot(in.c, in.c);
  let a = (exp(-r * 5.0) - 0.0067) * in.a;
  return vec4f(vec3f(1.5, 1.05, 0.55) * max(a, 0.0), 0.0);
}

