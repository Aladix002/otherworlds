// Soft additive glow sprites (islet under-glow, crystal halos). g = (pos, size), c = (color, 0)
struct Gl { g: vec4f, c: vec4f };
@group(1) @binding(0) var<storage, read> gl: array<Gl>;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let g = gl[ii];
  let c = aoCorner(vi);
  var o: VO;
  // pull the card toward the camera so it does not cut into nearby geometry
  let V = normalize(G.camPos - g.g.xyz);
  o.pos = G.viewProj * vec4f(billboard(g.g.xyz + V * g.g.w * 0.25, c, vec2f(g.g.w)), 1.0);
  o.c = c;
  let br = 0.85 + 0.15 * sin(G.time * 0.37 + f32(ii) * 2.0) * sin(G.time * 0.23 + f32(ii));
  o.col = g.c.rgb * br * smoothstep(0.5, 3.0, distance(G.camPos, g.g.xyz));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let a = (exp(-r2 * 4.0) * 0.7 + exp(-r2 * 12.0) * 0.6) * smoothstep(1.0, 0.8, r2);
  return vec4f(in.col * a, 0.0);
}
