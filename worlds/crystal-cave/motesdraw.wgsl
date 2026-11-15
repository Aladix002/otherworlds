struct Mote { p: vec4f, v: vec4f };
@group(1) @binding(0) var<storage, read> motes: array<Mote>;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let m = motes[ii];
  let d = distance(m.p.xyz, G.camPos);
  let px = d * 2.0 * G.tanHalfFov / G.resolution.y;
  let sz = max(0.012 + 0.01 * fract(m.p.w * 0.61), px * 1.1);
  var o: VO;
  o.c = cs[vi];
  o.pos = G.viewProj * vec4f(billboard(m.p.xyz, o.c, vec2f(sz)), 1.0);
  let tw = 0.55 + 0.45 * sin(G.time * (0.25 + 0.4 * fract(m.p.w * 0.37)) + m.p.w);
  let fade = tw * smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(9.0, 15.0, d)) * pow(0.02 / sz, 2.0) * 3.0;
  // motes catch the moonlight inside the shaft; elsewhere a faint violet/cyan shimmer
  let sr = shaftRad(m.p.xyz);
  let moon = (1.0 - smoothstep(1.6, 3.2, sr.x)) * step(0.2, sr.y) * step(sr.y, 1.0);
  let tint = mix(vec3f(0.55, 0.4, 1.0), vec3f(0.35, 0.8, 1.0), fract(m.p.w * 0.173));
  o.col = (tint * 0.16 + vec3f(0.6, 0.8, 1.0) * moon * 3.0) * fade;
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let f = max(exp(-dot(in.c, in.c) * 3.0) - 0.05, 0.0);
  return vec4f(in.col * f, 0.0);
}
