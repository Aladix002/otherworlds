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
  // a slow aurora-like veil over the southern dunes
  let az = atan2(rd.x, rd.z); let el = asin(clamp(rd.y, 0.0, 1.0));
  let x = az * 2.2 + 0.35 * sin(el * 7.0 + G.time * 0.04);
  let curt = pow(0.5 + 0.5 * vnoise2(vec2f(x * 2.6, G.time * 0.025)), 4.0) * (0.5 + 0.5 * vnoise2(vec2f(x * 30.0, G.time * 0.07)));
  c += mix(vec3f(0.05, 0.9, 0.55), vec3f(0.7, 0.15, 1.0), clamp(el * 2.2, 0.0, 1.0)) * curt * smoothstep(0.05, 0.14, el) * exp(-el * 5.5) * pow(0.5 + 0.5 * cos(az), 2.0) * 0.5;
  return vec4f(mix(c, duskCol(rd), G.params.x * smoothstep(0.2, 0.6, rd.y)), 1.0);     // dusk only overhead, through the slot
}

struct SO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsStar(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> SO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let clip = G.viewProj * vec4f(a.xyz, 0.0);
  var I = a.w * (smoothstep(0.0, 0.16, a.y) * 0.9 + 0.1 * smoothstep(0.0, 0.03, a.y)) * (1.0 - G.params.x * smoothstep(0.2, 0.6, a.y));
  I *= 0.84 + 0.16 * sin(G.time * (0.4 + b.w * 1.5) + b.w * 61.0);
  // never smaller than ~2 px: keep the energy, lose the shimmer
  let hs = (2.8 + 1.8 * sqrt(a.w)) * max(1.0, G.resolution.y / 1080.0);
  var o: SO;
  o.pos = vec4f(clip.xy + cs[vi] * hs * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi]; o.col = b.rgb * I;
  return o;
}
@fragment fn fsStar(in: SO) -> @location(0) vec4f {
  let g = max(exp(-dot(in.c, in.c) * 4.6) - 0.0101, 0.0);
  return vec4f(in.col * g * 0.6, 0.0);
}

// the oasis pool: a still mirror of the night sky with slow rings and a luminous shore
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsWater(@builtin(vertex_index) vi: u32) -> WO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
  var o: WO; o.w = OASP + vec3f(cs[vi].x, 0.0, cs[vi].y) * 7.5; o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
@fragment fn fsWater(in: WO) -> @location(0) vec4f {
  let V = normalize(in.w - G.camPos); let q = in.w.xz - OASP.xz; let d = length(q);
  let rip = vec2f(sin(in.w.x * 3.1 + G.time * 0.6) + sin(in.w.z * 4.3 - G.time * 0.45), sin(in.w.z * 2.7 + G.time * 0.5) + sin(in.w.x * 5.1 + G.time * 0.37)) * 0.008
    + q / max(d, 0.1) * sin(d * 5.0 - G.time * 0.9) * 0.012;
  var r = reflect(V, normalize(vec3f(rip.x, 1.0, rip.y))); r.y = abs(r.y);
  let uv = vec2f(atan2(r.x, -r.z) / TAU + 0.5, 1.0 - asin(clamp(r.y, 0.0, 1.0)) / (PI * 0.5));
  let fres = 0.3 + 0.7 * pow(1.0 - max(-V.y, 0.0), 4.0);
  var c = textureSampleLevel(skyT, skyS, uv, 0.0).rgb * fres * 1.5 + vec3f(0.0, 0.02, 0.035) * (1.0 - fres);
  var r0 = reflect(V, vec3f(0.0, 1.0, 0.0)); r0.y = abs(r0.y);
  let sv = voronoi2(r0.xz / (1.0 + r0.y) * 26.0 + rip * 6.0);                       // mirrored stars
  c += vec3f(0.8, 0.9, 1.0) * exp(-sv.x * sv.x * 300.0) * step(0.5, sv.z) * 1.2;
  c += vec3f(0.02, 0.3, 0.26) * exp(-pow(d - 6.2, 2.0) * 1.2) * (0.6 + 0.4 * sin(atan2(q.y, q.x) * 9.0 + G.time * 0.5));
  return vec4f(applyFog(c, in.w), smoothstep(6.6, 5.7, d));
}
