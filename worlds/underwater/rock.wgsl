// Instanced boulders with encrusting sponges / coralline algae; dark with faint glowing spots in the deep.
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) k: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> VO {
  let R = rotY(b.x);
  let s = vec3f(a.w, a.w * b.z, a.w * (0.8 + 0.4 * b.y));
  var o: VO;
  o.w = a.xyz + R * (p * s); o.n = normalize(R * (n / s)); o.lp = p * 2.0 + b.y * 17.0; o.k = b.yw;
  o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let wp = in.w;
  let an = abs(n);
  let q = select(select(in.lp.xy, in.lp.zy, an.x > an.z), in.lp.xz, an.y > max(an.x, an.z));
  let nz = textureSample(tNoise, sRep, q * 0.21);
  let nf = textureSample(tNoise, sRep, q * 0.9);
  let caus = causticsAt(wp);
  let deep = uss(40.0, 80.0, -wp.y);
  var alb = mix(vec3f(0.5, 0.42, 0.34), vec3f(0.62, 0.52, 0.4), nz.r) * (0.75 + 0.4 * nf.b);
  alb = mix(alb, vec3f(0.2, 0.21, 0.25) * (0.8 + 0.4 * nz.r), deep);
  // encrusting life on the upper half
  let up = smoothstep(-0.2, 0.6, n.y);
  let pal = fract(in.k.x * 3.7 + nz.a * 1.5);
  let col = select(select(vec3f(1.0, 0.4, 0.12), vec3f(0.95, 0.3, 0.45), pal > 0.4), vec3f(1.0, 0.75, 0.15), pal > 0.75);
  alb = mix(alb, col, smoothstep(0.66, 0.7, nz.g * 0.6 + nf.r * 0.6) * up * (1.0 - deep) * 0.9);
  alb = mix(alb, vec3f(0.45, 0.5, 0.25), smoothstep(0.55, 0.7, nz.b) * up * 0.35 * (1.0 - deep));
  var c = uwLit(alb, n, wp, caus, mix(0.5, 1.0, up));
  // bioluminescent speckles in the deep
  let sp = smoothstep(0.82, 0.9, nf.g) * deep;
  c += mix(vec3f(0.1, 0.8, 0.9), vec3f(0.5, 0.3, 1.0), nz.r) * sp * 0.12 * (0.6 + 0.4 * sin(G.time * 0.7 + nz.a * 20.0)) * (1.0 - fogF(distance(wp, G.camPos)));
  return vec4f(c, 1.0);
}
