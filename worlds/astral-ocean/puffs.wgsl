// Local gas puffs: big soft camera-facing cards sampling a baked 4-variant density texture (one channel each).
// p = (pos, halfSize), q = (color, variant + rotation seed)
struct Puff { p: vec4f, q: vec4f };
@group(1) @binding(0) var<storage, read> puffs: array<Puff>;
@group(1) @binding(1) var ptex: texture_2d<f32>;
@group(1) @binding(2) var psamp: sampler;
@group(1) @binding(3) var farTex: texture_cube<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) ch: u32, @location(3) a: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let P = puffs[ii];
  let c = aoCorner(vi);
  let d = distance(P.p.xyz, G.camPos);
  let ang = P.q.w * 1.7 + G.time * 0.006 * (fract(P.q.w * 3.3) - 0.5);
  let rc = rot2(ang) * c;
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(P.p.xyz, rc, vec2f(P.p.w)), 1.0);
  o.uv = c * 0.5 + 0.5;
  o.ch = u32(P.q.w) % 4u;
  o.a = smoothstep(P.p.w * 0.6, P.p.w * 1.8, d) * (1.0 - smoothstep(300.0, 420.0, d));
  // take most of the colour from the backdrop behind, so a puff is a thickening of the nebula, not a sticker
  let bc = textureSampleLevel(farTex, psamp, normalize(P.p.xyz - G.camPos), 0.0).rgb;
  o.col = mix(P.q.rgb, bc * 1.8 + vec3f(0.012, 0.008, 0.02), 0.65);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let s = textureSampleLevel(ptex, psamp, in.uv, 0.0);
  var dn = s.r;
  if (in.ch == 1u) { dn = s.g; } else if (in.ch == 2u) { dn = s.b; } else if (in.ch == 3u) { dn = s.a; }
  dn *= in.a;
  dn = dn * dn * (3.0 - 2.0 * dn) * 0.5;
  return vec4f(in.col * dn, dn * 0.08);
}
