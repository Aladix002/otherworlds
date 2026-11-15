// Marble temple / ruins / amphorae (static, world space). uv.x = material, uv.y = height above seabed.
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.w = p; o.n = n; o.m = uv; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let wp = in.w;
  let n = normalize(in.n);
  let an = abs(n);
  let q = select(select(wp.xy, wp.zy, an.x > an.z), wp.xz, an.y > max(an.x, an.z));
  let nz = textureSample(tNoise, sRep, q * 0.11);
  let nf = textureSample(tNoise, sRep, q * 0.83);
  let caus = causticsAt(wp);
  let hgt = in.m.y;
  var alb = vec3f(0.9, 0.88, 0.83) * (0.84 + 0.22 * nz.r) * (0.94 + 0.12 * nf.b);
  alb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.035, abs(nz.g - 0.5 + 0.1 * nf.r)));
  alb = mix(alb, vec3f(0.62, 0.3, 0.17) * (0.8 + 0.35 * nf.r), step(0.5, in.m.x));
  // algae / sponge growth on top faces and near the seabed
  let up = smoothstep(0.45, 0.9, n.y) * smoothstep(0.42, 0.62, nz.b + 0.15 * nf.g);
  alb = mix(alb, vec3f(0.36, 0.5, 0.26) * (0.8 + 0.4 * nf.a), up * 0.75);
  let low = (1.0 - smoothstep(0.0, 1.4, hgt + (nz.a - 0.5) * 1.2));
  alb = mix(alb, vec3f(0.52, 0.55, 0.42), low * 0.6);
  alb = mix(alb, vec3f(0.75, 0.42, 0.5), smoothstep(0.78, 0.86, nf.w) * smoothstep(0.3, 0.6, nz.b) * 0.7); // pink coralline spots
  let ao = mix(0.4, 1.0, smoothstep(-0.3, 2.2, hgt));
  return vec4f(uwLit(alb, n, wp, caus, ao), 1.0);
}
