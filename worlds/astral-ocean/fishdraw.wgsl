struct Fish { d: vec4f, v: vec4f, p: vec4f, f: vec4f };
@group(1) @binding(1) var<storage, read> fish: array<Fish>;
override NHALF: u32 = 1024u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let f = fish[ii];
  let p = f.p.xyz;
  let V = G.camPos - p;
  let d = length(V);
  let ax = normalize(f.f.xyz - V * dot(f.f.xyz, V) / (d * d) + vec3f(1e-5));
  let ay = normalize(cross(ax, V));
  let px = aoPix(d);
  let len = 0.11; let wid = 0.03;
  let ls = max(len, px * 2.2); let ws = max(wid, px * 1.3);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(p + ax * c.x * ls + ay * c.y * ws, 1.0);
  o.c = c;
  let shoal = select(0.0, 1.0, ii >= NHALF);
  let col = mix(vec3f(0.3, 1.35, 1.15), vec3f(1.55, 1.0, 0.35), shoal);
  let sh = 0.65 + 0.35 * sin(G.time * (1.1 + f.d.w * 0.01) + f.d.w * 7.0);
  o.col = col * sh * (len * wid) / (ls * ws) * 1.6 * smoothstep(0.4, 1.5, d) * mix(1.0, 0.3, smoothstep(30.0, 160.0, d));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let x = in.c.x; let y = in.c.y;
  let a = exp(-y * y * 3.0 - x * x * 2.2) * (0.55 + 0.45 * x) - 0.012;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
