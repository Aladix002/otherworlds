// The floating door islet: dark violet stone with mossy top, glowing mineral veins, cool nebula rim light,
// emissive crystals and sprouts (uv.x = 1), bobbing debris (uv.x = 2).
override DX: f32 = 0.0;
override DY: f32 = -2.0;
override DZ: f32 = 26.0;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO;
  var w = p;
  if (uv.x > 1.5) { w.y += 0.3 * sin(G.time * 0.31 + uv.y) + 0.15 * sin(G.time * 0.17 + uv.y * 2.3); }
  o.w = w; o.n = n; o.uv = uv; o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let V = normalize(G.camPos - in.w);
  let fr = 1.0 - abs(dot(n, V));
  let fres = fr * fr * fr;
  let q = in.w * 0.9;
  let g = fbm3(q * vec3f(1.0, 2.2, 1.0), 4) * 0.5 + 0.5;
  var alb = mix(vec3f(0.03, 0.022, 0.05), vec3f(0.1, 0.075, 0.15), g);
  let top = smoothstep(0.55, 0.9, n.y);
  let mossN = fbm3(q * 1.7 + 4.0, 3) * 0.5 + 0.5;
  let moss = top * smoothstep(0.42, 0.62, mossN);
  alb = mix(alb, vec3f(0.035, 0.09, 0.075) * (0.7 + 0.6 * g), moss);
  // contact shadow around the door base
  let dq = abs(in.w.xz - vec2f(DX, DZ)) - vec2f(0.72, 0.14);
  let db = length(max(dq, vec2f(0.0))) + min(max(dq.x, dq.y), 0.0);
  let ao = mix(0.3, 1.0, smoothstep(0.0, 0.9, db)) * mix(1.0, 0.7, smoothstep(-0.5, -3.0, in.w.y - DY));
  var c = litSpec(alb, n, in.w, 16.0, 0.06) * vec3f(0.7, 0.78, 1.0) * ao;
  let vn = fbm3(q * 0.7 + 3.0, 4);
  let fw = fwidth(vn) + 1e-4;
  let vein = (1.0 - smoothstep(0.0, 0.018 + fw, abs(vn))) * 0.018 / (0.018 + fw) * smoothstep(-0.1, 0.4, fbm3(q * 0.4 - 2.0, 2));
  let under = smoothstep(0.2, -0.6, n.y);
  c += vec3f(0.3, 0.75, 1.5) * vein * (0.2 + 0.8 * under) * (0.75 + 0.25 * sin(G.time * 0.6 + in.w.y * 1.5)) * (1.0 - moss);
  // tiny glowing spores in the moss
  let sp = in.w.xz * 9.0;
  let sh = hash22(floor(sp));
  let sd = length(fract(sp) - 0.25 - 0.5 * sh);
  c += vec3f(0.2, 0.7, 0.6) * moss * step(0.8, sh.x) * smoothstep(0.12, 0.0, sd) * 0.5;
  c += vec3f(0.3, 0.45, 1.1) * fres * 0.45 * (1.0 - smoothstep(0.3, 0.7, n.y));   // cool nebula rim (not on the flat top)
  c += vec3f(0.15, 0.25, 0.6) * under * 0.04;
  let base = mix(vec3f(0.25, 0.7, 1.4), vec3f(0.9, 0.4, 1.4), in.uv.y);
  let cr = base * (0.3 + 1.3 * fres + 0.2 * fr) + litSpec(vec3f(0.04), n, in.w, 60.0, 1.0);
  let isC = in.uv.x > 0.5 && in.uv.x < 1.5;
  return vec4f(select(c, cr, isC), 1.0);
}
