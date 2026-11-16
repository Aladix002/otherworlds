// night sky dome (baked equirect of the upper hemisphere), dusk blend inside the canyon, round star sprites
@group(1) @binding(0) var skyT: texture_2d<f32>;
@group(1) @binding(1) var skyS: sampler;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  let uv = vec2f(atan2(rd.x, -rd.z) / TAU + 0.5, 1.0 - asin(clamp(rd.y, 0.0, 1.0)) / (PI * 0.5));
  var c = textureSampleLevel(skyT, skyS, uv, 0.0).rgb;
  c = mix(c, HORIZ, smoothstep(0.0, -0.06, rd.y));
  return vec4f(mix(c, duskCol(rd), G.params.x), 1.0);
}

struct SO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsStar(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> SO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let clip = G.viewProj * vec4f(a.xyz, 0.0);
  var I = a.w * (smoothstep(0.0, 0.16, a.y) * 0.9 + 0.1 * smoothstep(0.0, 0.03, a.y)) * (1.0 - G.params.x);
  I *= 0.84 + 0.16 * sin(G.time * (0.4 + b.w * 1.5) + b.w * 61.0);
  // never smaller than ~2 px: keep the energy, lose the shimmer
  let hs = (2.0 + 1.7 * sqrt(a.w)) * max(1.0, G.resolution.y / 1080.0);
  var o: SO;
  o.pos = vec4f(clip.xy + cs[vi] * hs * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi]; o.col = b.rgb * I;
  return o;
}
@fragment fn fsStar(in: SO) -> @location(0) vec4f {
  let g = max(exp(-dot(in.c, in.c) * 4.6) - 0.0101, 0.0);
  return vec4f(in.col * g, 0.0);
}
