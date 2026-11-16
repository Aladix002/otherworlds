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

// shooting stars: a lone one every 31 s (instance 0) and a shower from one radiant every 127 s (instances 1..7)
struct MO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) a: f32 };
@vertex fn vsMet(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MO {
  var cs = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
  let sh = ii > 0u;
  let T = select(31.0, 127.0, sh);
  let e = floor(G.time / T);
  let h = hash3u(vec3u(u32(e), 7u, select(3u, 9u, sh)));
  let hi = hash3u(vec3u(u32(e), ii, 5u));
  let dur = select(2.8, 1.5 + 1.4 * hi.z, sh);
  let lt = G.time - e * T - select(4.0, 6.0 + f32(ii) * 2.1 + hi.x * 2.0, sh);
  var az = (h.x - 0.5) * 5.0; var el = 0.45 + 0.5 * h.y;
  var dz = 0.3 * sign(h.z - 0.5);
  if (sh) { az += (hi.x - 0.5) * 1.3; el = clamp(el + (hi.y - 0.5) * 0.5, 0.3, 1.15); dz *= 0.8 + 0.6 * hi.y; }
  let a = vec3f(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  let b = vec3f(sin(az + dz) * cos(el - 0.2), sin(el - 0.2), -cos(az + dz) * cos(el - 0.2));
  let k = lt / dur;
  let head = normalize(mix(a, b, k));
  let len = 0.02 + 0.1 * smoothstep(0.0, 0.35, k);
  let tail = normalize(head + normalize(a - b) * len);
  let c0 = G.viewProj * vec4f(head.x, head.y * MIR, head.z, 0.0);
  let c1 = G.viewProj * vec4f(tail.x, tail.y * MIR, tail.z, 0.0);
  var o: MO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0); o.c = cs[vi]; o.a = 0.0;
  if (k > 0.0 && k < 1.0 && c0.w > 0.01 && c1.w > 0.01) {
    let n0 = c0.xy / c0.w; let n1 = c1.xy / c1.w;
    let dv = (n1 - n0) * G.resolution;
    let dn = dv / (length(dv) + 1e-4);
    let px = max(2.6, G.resolution.y / 420.0);
    let q = mix(n0, n1, cs[vi].x) + (vec2f(-dn.y, dn.x) * cs[vi].y - dn * (1.0 - cs[vi].x) * 1.5) * px * 2.0 * G.invResolution;
    o.pos = vec4f(q, 0.0, 1.0);
    let f = sin(k * PI);
    o.a = f * f * select(1.0, 0.75, sh) * smoothstep(0.03, 0.2, head.y);
  }
  return o;
}
@fragment fn fsMet(in: MO) -> @location(0) vec4f {
  let s = in.c.x; let y = in.c.y;
  let g = exp(-y * y * 5.0) * pow(1.0 - s, 2.0) * 0.8 + exp(-(y * y + s * s * 900.0) * 3.0) * 1.5;
  return vec4f(vec3f(0.75, 0.88, 1.0) * max(g - 0.006, 0.0) * in.a, 0.0);
}
