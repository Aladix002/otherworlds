// The floating door islet: dark violet stone with glowing mineral veins, plus emissive crystals (uv.x = 1).
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.w = p; o.n = n; o.uv = uv; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let V = normalize(G.camPos - in.w);
  let fres = pow(1.0 - abs(dot(n, V)), 3.0);
  let q = in.w * 0.9;
  let g = fbm3(q * vec3f(1.0, 2.2, 1.0), 4) * 0.5 + 0.5;
  var alb = mix(vec3f(0.035, 0.025, 0.06), vec3f(0.11, 0.08, 0.16), g);
  let top = smoothstep(0.6, 0.9, n.y);
  alb = mix(alb, vec3f(0.09, 0.08, 0.15) * (0.6 + 0.8 * g), top * 0.6);
  var c = litSpec(alb, n, in.w, 16.0, 0.08) * vec3f(0.75, 0.8, 1.0);
  let vn = fbm3(q * 0.7 + 3.0, 4);
  let fw = fwidth(vn) + 1e-4;
  let vein = (1.0 - smoothstep(0.0, 0.018 + fw, abs(vn))) * 0.018 / (0.018 + fw) * smoothstep(-0.1, 0.4, fbm3(q * 0.4 - 2.0, 2));
  let under = smoothstep(0.2, -0.6, n.y);
  c += vec3f(0.3, 0.75, 1.5) * vein * (0.25 + 0.9 * under) * (0.75 + 0.25 * sin(G.time * 0.6 + in.w.y * 1.5));
  c += vec3f(0.45, 0.3, 0.9) * fres * 0.25;
  c += vec3f(0.25, 0.4, 0.9) * under * 0.05;
  let base = mix(vec3f(0.25, 0.7, 1.4), vec3f(0.9, 0.4, 1.4), in.uv.y);
  let cr = base * (0.35 + 1.4 * fres) + litSpec(vec3f(0.05), n, in.w, 60.0, 1.0);
  return vec4f(select(c, cr, in.uv.x > 0.5), 1.0);
}
