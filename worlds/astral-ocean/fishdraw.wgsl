// Fish as small additive lights: a bright head, a soft body and a tail that fades out behind. Size is capped on
// screen and they dissolve near the camera, so a fish is never a big flat shape.
struct Fish { d: vec4f, v: vec4f, p: vec4f, f: vec4f };
@group(1) @binding(1) var<storage, read> fish: array<Fish>;
override NA: u32 = 1024u;
override NB: u32 = 2048u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) wig: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let f = fish[ii];
  let p = f.p.xyz;
  let V = G.camPos - p;
  let d = length(V);
  let ax = normalize(f.f.xyz - V * dot(f.f.xyz, V) / (d * d) + vec3f(1e-5));
  let ay = normalize(cross(ax, V));
  let px = aoPix(d);
  let h = hash3u(vec3u(ii, 21u, 4u));
  let sz = 0.65 + 0.9 * h.x * h.x;
  let len = 0.14 * sz; let wid = 0.05 * sz;
  let ls = clamp(len, px * 3.5, px * 11.0); let ws = clamp(wid, px * 2.0, px * 4.0);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(p + ax * c.x * ls + ay * c.y * ws, 1.0);
  o.c = c;
  // teal -> cyan -> violet, soft; a few warm gold ones
  let hue = clamp(h.y * 0.5 + select(select(0.2, 0.5, ii < NB), 0.0, ii < NA), 0.0, 1.0);
  var col = mix(vec3f(0.3, 1.0, 0.78), vec3f(0.3, 0.75, 1.3), smoothstep(0.0, 0.45, hue));
  col = mix(col, vec3f(0.72, 0.5, 1.35), smoothstep(0.45, 0.85, hue));
  col = mix(col, vec3f(1.0, 0.8, 1.2), step(0.95, h.z));
  let sh = 0.7 + 0.3 * sin(G.time * (0.8 + h.z) + f.d.w * 7.0);
  let en = min(1.0, (len * wid) / (ls * ws));
  o.col = col * sh * (0.3 + 0.7 * h.z * h.z) * en * 0.95 * smoothstep(2.0, 7.0, d) * exp(-d * 0.012);
  o.wig = sin(G.time * (2.2 + h.x) + f.d.w * 11.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let x = in.c.x;
  let y = in.c.y - in.wig * 0.3 * smoothstep(0.2, -1.0, x);
  let hx = x - 0.5;
  let head = exp(-(hx * hx * 14.0 + y * y * 8.0));
  let tw = mix(0.08, 0.36, smoothstep(-1.0, 0.45, x));
  let tail = exp(-y * y / (tw * tw)) * smoothstep(-1.0, -0.1, x) * smoothstep(0.95, 0.4, x);
  let a = (head * 1.3 + tail * 0.3) * smoothstep(1.0, 0.75, abs(in.c.y)) * smoothstep(1.0, 0.85, x);
  return vec4f(in.col * a + vec3f(1.2) * dot(in.col, vec3f(0.33)) * head * head * head, 0.0);
}
