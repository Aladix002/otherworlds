// Marine snow / bioluminescent plankton (compute-drifted, wrapped around the camera) + rising bubble streams.
struct Mote { p: vec4f, v: vec4f };
@group(2) @binding(0) var<storage, read_write> motes: array<Mote>;
override NM: u32 = 4096u;
const BOX = 36.0;
@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= NM) { return; }
  var m = motes[id.x];
  let flow = curl3(m.p.xyz * 0.05 + vec3f(0.0, G.time * 0.02, m.p.w * 0.0007)) * 0.25 + vec3f(0.06, -0.015, 0.045);
  m.v = vec4f(mix(m.v.xyz, flow, 1.0 - exp(-G.dt * 0.5)), m.v.w);
  var p = m.p.xyz + m.v.xyz * G.dt;
  let rel = p - G.camPos;
  p = G.camPos + rel - BOX * round(rel / BOX);
  m.p = vec4f(p, m.p.w);
  motes[id.x] = m;
}
@group(2) @binding(0) var<storage, read> motesR: array<Mote>;
struct BubbleSrc { p: vec4f };
const NB = 12u;
const BPS = 18u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) kind: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = cs[vi];
  var o: VO;
  o.c = c;
  if (ii < NM) {
    let m = motesR[ii];
    let d = distance(m.p.xyz, G.camPos);
    let h = hash1u(u32(m.p.w));
    let depth = -m.p.y;
    let glow = uss(38.0, 75.0, depth);
    let sz = min(mix(0.011 + 0.012 * h, 0.03 + 0.05 * h * h, glow) + 0.0012 * d, d * 0.014);
    o.pos = G.viewProj * vec4f(billboard(m.p.xyz, c, vec2f(sz)), 1.0);
    let fade = uss(0.8, 3.5, d) * (1.0 - uss(BOX * 0.32, BOX * 0.5, d));
    let snow = lightAt(m.p.y) * vec3f(0.5, 0.55, 0.5) * (1.0 - glow) * 0.22;
    let hue = fract(h * 3.7);
    let bio = select(select(vec3f(0.1, 0.9, 1.0), vec3f(0.3, 1.0, 0.45), hue > 0.55), vec3f(0.65, 0.35, 1.0), hue > 0.8);
    let tw = pow(0.5 + 0.5 * sin(G.time * (0.3 + h * 0.8) + h * 60.0), 3.0);
    o.col = (snow + bio * glow * (0.12 + tw) * 0.5 * step(0.5, fract(h * 13.1))) * fade / (1.0 + d * d * 0.004);
    o.kind = 0.0;
  } else if (ii >= NM + NB * BPS) {
    // big slow bubbles, each holding a tiny garden
    let k = f32(ii - NM - NB * BPS);
    let hs = hash3u(vec3u(ii, 7u, 1u));
    let p = select(vec3f(mix(-8.0, 14.0, hs.x), -9.8 + 3.5 * hs.y, mix(56.0, 100.0, hs.z)), vec3f(6.3, -9.5, 61.0), k < 0.5)
          + vec3f(sin(G.time * 0.07 + k), 0.3 * sin(G.time * 0.11 + k * 2.0), cos(G.time * 0.06 + k * 1.7)) * select(1.5, 0.2, k < 0.5);
    o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(0.3 + 0.3 * hs.y)), 1.0);
    o.col = lightAt(p.y) * 0.4 * (1.0 - fogF(distance(p, G.camPos)));
    o.kind = 2.0;
  } else {
    // bubbles rising from a few vents around the temple and gateway
    let j = ii - NM;
    let s = j / BPS; let k = j % BPS;
    let hs = hash3u(vec3u(s, 3u, 9u));
    let base = vec3f(mix(-14.0, 14.0, hs.x), 0.0, mix(30.0, 108.0, hs.y));
    let rate = 0.12 + 0.06 * hs.z;
    let age = fract(G.time * rate + f32(k) / f32(BPS) + hash1u(j * 17u) * 0.03);
    let top = -0.6;
    let y0 = PADY + 0.6 + hs.z * 2.0;
    let y = mix(y0, top, age);
    let wob = vec3f(sin(G.time * 2.3 + f32(k)) , 0.0, cos(G.time * 1.9 + f32(k) * 1.3)) * 0.06 * age;
    let p = base + vec3f(0.0, y, 0.0) + wob + vec3f(age * 0.8, 0.0, age * 0.6);
    let r = 0.012 + 0.03 * hash1u(j * 31u) * (0.6 + age);
    o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(r)), 1.0);
    let d = distance(p, G.camPos);
    o.col = lightAt(p.y) * 0.5 * (1.0 - fogF(d)) * uss(0.0, 0.05, age) * (1.0 - uss(0.9, 1.0, age));
    o.kind = 1.0;
  }
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  if (r2 > 1.0) { discard; }
  var a: f32;
  if (in.kind < 0.5) { a = (exp(-r2 * 4.0) - 0.018) * 0.6 + exp(-r2 * 40.0) * 0.6; }
  else { let r = sqrt(r2); a = smoothstep(0.65, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 0.8 + exp(-dot(in.c - vec2f(-0.35, 0.4), in.c - vec2f(-0.35, 0.4)) * 30.0) * 0.9; }
  if (in.kind > 1.5) {
    // green mound, a little trunk, a pink blossom crown
    let g = in.c;
    let gd = vec3f(0.2, 1.2, 0.3) * smoothstep(0.0, 0.04, -0.3 - g.x * g.x - g.y) + vec3f(0.7, 0.45, 0.25) * step(abs(g.x), 0.035) * step(abs(g.y + 0.12), 0.2)
           + vec3f(1.8, 0.45, 0.9) * smoothstep(0.3, 0.2, length(g - vec2f(0.0, 0.22)));
    return vec4f(in.col * (a * 0.7 + gd), 0.0);
  }
  return vec4f(in.col * a, 0.0);
}
