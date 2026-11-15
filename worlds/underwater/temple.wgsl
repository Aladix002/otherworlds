// Marble temple / ruins / amphorae (static, world space).
// uv.x = material (0 marble, 1 terracotta, 2 marble + painted meander, 3 starfish) + baked AO * 0.9, uv.y = height above seabed.
override ARCHY: f32 = 6.74;   // architrave bottom, above the pad
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.w = p; o.n = n; o.m = uv; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
// Greek key, 7 x 6 cells per period
const KEY = array<u32, 6>(124u, 68u, 84u, 92u, 64u, 127u);
fn key(p: vec2f) -> f32 {
  let c = vec2i(floor(p));
  if (c.y == 7 || c.y == -2) { return 1.0; }
  if (c.y < 0 || c.y > 5) { return 0.0; }
  return f32((KEY[5 - c.y] >> (6u - u32(((c.x % 7) + 7) % 7))) & 1u);
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let wp = in.w;
  let n = normalize(in.n);
  let an = abs(n);
  let q = select(select(wp.xy, wp.zy, an.x > an.z), wp.xz, an.y > max(an.x, an.z));
  let nz = textureSample(tNoise, sRep, q * 0.11);
  let nm = textureSample(tNoise, sRep, q * 0.43 + 0.3);
  let nf = textureSample(tNoise, sRep, q * 1.9);
  let caus = causticsAt(wp);
  let hgt = in.m.y;
  let mt = floor(in.m.x);
  let bao = fract(in.m.x) / 0.9;
  // warm white marble with soft grey-blue veins at two scales
  var alb = vec3f(0.89, 0.865, 0.81) * (0.86 + 0.2 * nz.r) * (0.95 + 0.1 * nf.b);
  let v1 = 1.0 - smoothstep(0.0, 0.03, abs(nz.g - 0.5 + 0.12 * nm.r));
  let v2 = 1.0 - smoothstep(0.0, 0.022, abs(nm.g - 0.5 + 0.1 * nf.r));
  alb = mix(alb, vec3f(0.6, 0.63, 0.68), v1 * 0.3 + v2 * 0.26 * smoothstep(0.4, 0.6, nz.a));
  let p = vec2f(select(wp.x, wp.z, an.x > an.z), hgt - ARCHY - 0.1) * 12.0;
  let e = min(fwidth(p.x) + fwidth(p.y), 1.5) * 0.35;
  if (mt > 1.5 && mt < 2.5 && an.y < 0.5) {
    // faded painted meander band on the architrave
    let k = (key(p + vec2f(e, e)) + key(p + vec2f(-e, e)) + key(p + vec2f(e, -e)) + key(p - vec2f(e, e))) * 0.25;
    alb = mix(alb, vec3f(0.66, 0.27, 0.1), k * (0.45 + 0.4 * smoothstep(0.3, 0.6, nm.a)) * (1.0 - uss(0.6, 1.6, e)));
  }
  if (mt > 0.5 && mt < 1.5) { alb = vec3f(0.72, 0.33, 0.16) * (0.75 + 0.4 * nm.r) * (0.9 + 0.2 * nf.r);
    alb = mix(alb, vec3f(0.16, 0.09, 0.06), 0.6 * smoothstep(0.03, 0.0, abs(fract(hgt * 2.2 + nz.r * 0.3) - 0.5) - 0.07)); }
  if (mt > 2.5) { alb = mix(vec3f(0.95, 0.3, 0.1), vec3f(1.0, 0.62, 0.3), smoothstep(0.55, 0.7, nf.g)); }
  else {
    // algae film on top faces and a weathered, stained band near the seabed
    let up = smoothstep(0.45, 0.9, n.y) * smoothstep(0.42, 0.62, nz.b + 0.15 * nf.g);
    alb = mix(alb, vec3f(0.36, 0.5, 0.26) * (0.8 + 0.4 * nf.a), up * 0.6);
    let low = 1.0 - smoothstep(0.05, 1.3, hgt + (nz.a - 0.5) * 1.3 + (nm.b - 0.5) * 0.5);
    alb = mix(alb, mix(vec3f(0.3, 0.4, 0.23), vec3f(0.55, 0.52, 0.36), nm.r), low * mix(0.72, 0.22, step(0.5, mt)));
    alb *= 1.0 - 0.3 * smoothstep(0.62, 0.75, nm.a) * low;
  }
  let sh = colShadow(wp + n * 0.45);
  let ao = bao * mix(0.5, 1.0, smoothstep(-0.25, 1.0, hgt)) * mix(1.0, sh.y, smoothstep(0.3, 0.8, n.y));
  var c = uwLit(alb, n, wp, caus * sh.x, ao * mix(0.45, 1.0, sh.x));
  return vec4f(c, 1.0);
}
