// Sky dome (fullscreen) and star sprites. Both are drawn in the main pass and in the mirror pass.
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fs(in: VO) -> @location(0) vec4f { return vec4f(sky(viewRay(in.uv)), 1.0); }

struct SO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsStar(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> SO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let clip = G.viewProj * vec4f(a.x, a.y * MIR, a.z, 0.0);
  let ang = acos(clamp(dot(a.xyz, U.moon.xyz), -1.0, 1.0));
  let R = asin(U.moon.w);
  var I = a.w * step(R * 1.04, ang) * mix(0.12, 1.0, smoothstep(R, R * 3.2, ang));
  I *= smoothstep(0.004, 0.14, a.y) * 0.9 + 0.1 * smoothstep(0.004, 0.03, a.y);
  I *= 0.86 + 0.14 * sin(G.time * (0.4 + b.w * 1.5) + b.w * 61.0);
  // never smaller than ~2 px: keep the energy, lose the shimmer
  let hs = (2.1 + 1.5 * sqrt(a.w)) * max(1.0, G.resolution.y / 1080.0);
  var o: SO;
  o.pos = vec4f(clip.xy + cs[vi] * hs * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi];
  o.col = b.rgb * I;
  return o;
}
@fragment fn fsStar(in: SO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let g = max(exp(-r2 * 4.6) - 0.0101, 0.0);
  return vec4f(in.col * g, 0.0);
}
