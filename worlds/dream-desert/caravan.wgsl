// star caravan: stardust bodies pinned to animated bones, trail, soft round star sprites (nebula blobs, dust) and constellation lines with a minimum pixel width.
// Both are additive screen-space quads with gaussian falloff, so nothing has a hard edge and nothing aliases.
struct CP { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) col: vec4f };
@vertex fn vsPt(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> CP {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let clip = G.viewProj * vec4f(a.xyz, 1.0);
  var o: CP;
  if (clip.w < 1.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.c = vec2f(0.0); o.col = vec4f(0.0); return o; }
  let k = G.proj[1][1] * G.resolution.y * 0.5 / clip.w;                  // px per metre
  let blob = a.w < 0.0;
  let sc = max(1.0, G.resolution.y / 1080.0);
  let rpx = select(max(abs(a.w) * k, 3.0 * sc), abs(a.w) * k, blob);
  let tw = 0.82 + 0.18 * sin(G.time * (0.45 + fract(b.w * 3.7) * 1.1) + b.w * 53.0);
  o.pos = vec4f(clip.xy + cs[vi] * rpx * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi];
  o.col = vec4f(b.rgb * tw * (1.0 - G.params.x), select(0.0, 1.0, blob));
  return o;
}
@fragment fn fsPt(in: CP) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let core = max(exp(-r2 * 5.2) - 0.0055, 0.0) + 0.9 * exp(-r2 * 38.0) * (1.0 - r2);
  let blob = max(exp(-r2 * 3.4) - 0.033, 0.0);
  return vec4f(in.col.rgb * select(core, blob, in.col.a > 0.5) * 0.7, 0.0);
}


// ---- stardust bodies: particles pinned to capsule bones (storage: 2 vec4 per bone, then trail emitters)
@group(1) @binding(0) var<storage, read> BN: array<vec4f>;
const MAXB = 20u; const NANI = 6u; const NE = 6u;
const GOLDC = vec3f(1.0, 0.8, 0.42); const TEALC = vec3f(0.22, 0.86, 0.78); const ROSEC = vec3f(1.0, 0.45, 0.68);
fn projPx(clip: vec4f) -> f32 { return G.proj[1][1] * G.resolution.y * 0.5 / clip.w; }
@vertex fn vsBody(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> CP {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let bi = u32(a.x + 0.5);
  let A = BN[bi * 2u]; let B = BN[bi * 2u + 1u];
  var o: CP;
  let r = mix(A.w, B.w, a.y);
  if (r <= 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.c = vec2f(0.0); o.col = vec4f(0.0); return o; }
  let fox = b.w < 0.0;
  let seed = a.w; let t = G.time;
  var d = b.xyz;
  let ax = mix(A.xyz, B.xyz, a.y);
  // gentle shimmer and drift in place
  let sh = vec3f(sin(t * 0.6 + seed * 40.0), sin(t * 0.47 + seed * 71.0), sin(t * 0.53 + seed * 23.0)) * 0.09;
  let wp = ax + (d * a.z + sh * (1.0 - 0.5 * a.z)) * r;
  let clip = G.viewProj * vec4f(wp, 1.0);
  if (clip.w < 1.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.c = vec2f(0.0); o.col = vec4f(0.0); return o; }
  let V = normalize(G.camPos - wp);
  let rim = pow(1.0 - abs(dot(d, V)), 2.0);
  let k = projPx(clip);
  let sc = max(1.0, G.resolution.y / 1080.0);
  let rpx = max((1.7 + 1.3 * fract(seed * 9.1)) * abs(b.w) * sc, 0.006 * r * k * 0.0);
  // colour: teal underside, gold on top, a little rose; foxes lean teal
  let hy = clamp(d.y * 0.5 + 0.5 + (fract(seed * 7.3) - 0.5) * 0.6 - select(0.0, 0.25, fox), 0.0, 1.0);
  var col = mix(TEALC, GOLDC, smoothstep(0.35, 0.75, hy));
  col = mix(col, ROSEC, smoothstep(0.88, 0.97, fract(seed * 13.1)) * 0.8);
  col = mix(col, vec3f(1.0, 0.95, 0.85), smoothstep(0.96, 1.0, fract(seed * 3.7)) * 0.7);
  let tw = 0.75 + 0.25 * sin(t * (0.5 + fract(seed * 5.3)) + seed * 90.0);
  let inten = (0.06 + 0.4 * rim) * (0.3 + 0.7 * a.z * a.z) * tw * (1.0 - G.params.x);
  o.pos = vec4f(clip.xy + cs[vi] * rpx * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi];
  o.col = vec4f(col * inten, 0.0);
  return o;
}
// stardust shed from feet, tail and back: stateless, drifts back along the path and sinks, fading
@vertex fn vsTrail(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> CP {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let E = BN[NANI * MAXB * 2u + u32(a.x + 0.5) * NE + u32(a.y + 0.5)];
  var o: CP;
  if (E.w <= 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.c = vec2f(0.0); o.col = vec4f(0.0); return o; }
  let T = 22.0; let t = G.time;
  let u = fract(t / T * (0.7 + 0.6 * a.w) + a.z);
  let S = E.w;
  let hh = hash33(vec3f(a.z * 91.0, a.w * 57.0, a.y));
  var p = E.xyz;
  p.x -= 1.4 * u * T / (0.7 + 0.6 * a.w);
  p += (hh - 0.5) * vec3f(0.06, 0.09, 0.12) * S * (0.4 + 2.5 * u);
  p.y -= u * u * 0.7 * S;
  p.z += sin(t * 0.2 + a.z * 30.0 + u * 4.0) * 0.07 * S * u;
  let clip = G.viewProj * vec4f(p, 1.0);
  if (clip.w < 1.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.c = vec2f(0.0); o.col = vec4f(0.0); return o; }
  let sc = max(1.0, G.resolution.y / 1080.0);
  let rpx = (1.5 + 1.2 * hh.x) * sc;
  let teal = fract(a.z * 17.0) < 0.5;
  let col = select(GOLDC, TEALC, teal) * 0.9;
  let big = select(1.0, 1.6, a.y > 3.5);
  let tw = 0.7 + 0.3 * sin(t * (0.6 + hh.y) + a.z * 80.0);
  o.pos = vec4f(clip.xy + cs[vi] * rpx * 2.0 * G.invResolution * clip.w, 0.0, clip.w);
  o.c = cs[vi];
  o.col = vec4f(col * 0.7 * big * tw * pow(sin(PI * u), 1.5) * (1.0 - u * 0.4) * (1.0 - G.params.x), 0.0);
  return o;
}
@fragment fn fsPart(in: CP) -> @location(0) vec4f {
  let g = max(exp(-dot(in.c, in.c) * 4.4) - 0.0123, 0.0);
  return vec4f(in.col.rgb * g, 0.0);
}
