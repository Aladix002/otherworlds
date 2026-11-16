// opaque scene: sandstone (mesa, slot canyon, arch: surface-nets mesh with baked canyon light) and the sand
@group(1) @binding(0) var dtex: texture_2d<f32>;
@group(1) @binding(1) var dsmp: sampler;
struct Lights { l: array<vec4f, 50> };
@group(1) @binding(2) var<uniform> LU: Lights;

// l = canyon light, ao, warm (1 = inside the canyon) | g = static glow (terrain)
struct RV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) l: vec3f, @location(3) g: vec3f };
@vertex fn vs(@location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> RV {
  var o: RV;
  o.w = a.xyz; o.n = b.xyz; o.l = vec3f(a.w, b.w, c.x); o.g = c.yzw;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn nightLight(n: vec3f, ao: f32) -> vec3f {
  return (hemi(n, G.ambientSky, G.ambientGround) + G.sunColor * wrapDiffuse(n, G.sunDir, 0.2)) * ao;
}
fn farFog(col: vec3f, p: vec3f, dist: f32) -> vec3f {
  return mix(applyFog(col, p), G.fogColor, smoothstep(280.0, 425.0, dist));
}

@fragment fn fsRock(in: RV) -> @location(0) vec4f {
  let ng = normalize(in.n);
  let p = in.w;
  let dist = distance(p, G.camPos);
  var tw = pow(abs(ng), vec3f(4.0)); tw /= (tw.x + tw.y + tw.z);
  let s1 = 0.19; let s2 = 1.13;
  let ax = textureSample(dtex, dsmp, p.zy * s1); let ay = textureSample(dtex, dsmp, p.xz * s1); let az = textureSample(dtex, dsmp, p.xy * s1);
  let bx = textureSample(dtex, dsmp, p.zy * s2 + 0.37); let by = textureSample(dtex, dsmp, p.xz * s2 + 0.37); let bz = textureSample(dtex, dsmp, p.xy * s2 + 0.37);
  let h1 = dot(tw, vec3f(ax.r, ay.r, az.r)); let h2 = dot(tw, vec3f(bx.r, by.r, bz.r));
  let ga = (vec3f(0.0, ax.b, ax.g) * 2.0 - vec3f(0.0, 1.0, 1.0)) * tw.x + (vec3f(ay.g, 0.0, ay.b) * 2.0 - vec3f(1.0, 0.0, 1.0)) * tw.y + (vec3f(az.g, az.b, 0.0) * 2.0 - vec3f(1.0, 1.0, 0.0)) * tw.z;
  let gb = (vec3f(0.0, bx.b, bx.g) * 2.0 - vec3f(0.0, 1.0, 1.0)) * tw.x + (vec3f(by.g, 0.0, by.b) * 2.0 - vec3f(1.0, 0.0, 1.0)) * tw.y + (vec3f(bz.g, bz.b, 0.0) * 2.0 - vec3f(1.0, 1.0, 0.0)) * tw.z;
  // bedding: thin sandstone laminae on gently warped, tilted planes; the carved wall cuts them into flowing lines
  let sy = p.y + 0.1 * p.x + 0.06 * p.z + 0.55 * sin(p.x * 0.13 + p.z * 0.09) + (h1 - 0.5) * 0.3;
  let f1 = sy * 5.1; let f2 = sy * 13.7 + 1.3; let f3 = sy * 41.0;
  let k2 = 1.0 - smoothstep(25.0, 90.0, dist); let k3 = (1.0 - smoothstep(6.0, 24.0, dist)) * in.l.z;
  let band = 0.5 * sin(f1) + 0.3 * sin(f2) * k2 + 0.28 * sin(f3 + 2.0 * sin(f2)) * k3;
  let dband = 2.5 * cos(f1) + 4.1 * cos(f2) * k2 + 6.0 * cos(f3 + 2.0 * sin(f2)) * k3;
  let wk = 0.12 + 0.88 * in.l.z;                           // calmer relief on the night side
  var nd = ng - ga * 0.9 * wk - gb * (0.85 * wk * (1.0 - smoothstep(8.0, 30.0, dist)));
  nd.y -= dband * 0.028 * (1.0 - ng.y * ng.y) * (0.25 + 0.75 * in.l.z);
  nd = normalize(nd);
  let ao = in.l.y * (0.8 + 0.2 * h2);

  // canyon: brightness picks the hue (gold where the sky reaches, magenta and violet in the shade)
  let bent = normalize(ng + vec3f(0.0, 0.9, 0.0));
  let lam = smoothstep(0.55, 0.95, sin(f1 * 0.37 + 1.0)) * 0.2 - smoothstep(0.7, 0.98, sin(f2 * 0.53)) * 0.25 * k2;
  var Lw = in.l.x * ao * ao * (0.06 + 1.1 * smoothstep(-0.4, 0.95, dot(nd, bent))) * (0.95 + 0.3 * band + lam + 0.14 * (h2 - 0.5));
  Lw += beamSpot(p) * 0.6 * (0.35 + 0.65 * max(nd.y, 0.0));
  var warm = ramp(Lw);
  warm *= mix(vec3f(1.0), vec3f(1.12, 0.84, 1.25), smoothstep(-0.2, 0.6, sin(sy * 1.7 + 0.5)));

  // night side: red sandstone under the Milky Way
  var alb = mix(vec3f(0.4, 0.15, 0.2), vec3f(0.75, 0.36, 0.34), 0.5 + 0.5 * band) * (0.85 + 0.3 * h2);
  let V = (G.camPos - p) / dist;
  var night = alb * nightLight(nd, ao);
  night += alb * (G.ambientSky * 5.0 + vec3f(0.05, 0.01, 0.06)) * pow(1.0 - max(dot(nd, V), 0.0), 3.0) * ao;

  // carvings on the lone arch: rings, strokes and dots that wake as you come near
  let aq = p - ARCHP.xyz;
  if (dot(aq, aq) < 220.0) {
    let ca = cos(ARCHP.w); let sa = sin(ARCHP.w); let u = aq.x * ca + aq.z * sa; let yy = aq.y - 2.5;
    // one band of glyphs running up the piers and around the curve
    let top = yy > 0.0;
    let g = vec2f(select(aq.y, 2.5 + atan2(yy, abs(u)) * 4.6, top) * 1.15, (select(abs(u), length(vec2f(u, yy)), top) - 4.6) * 1.15 + 0.5);
    let id = floor(g) + vec2f(sign(u) * 40.0, 0.0); let f = fract(g) - 0.5; let hs = hash22(id + 7.0); let r = length(f);
    let ty = floor(hs.x * 4.0); let l1 = abs(f.x * cos(hs.y * TAU) + f.y * sin(hs.y * TAU)); let l2 = abs(f.y * cos(hs.y * TAU) - f.x * sin(hs.y * TAU));
    let ring = smoothstep(0.05, 0.02, abs(r - 0.3)); let st = smoothstep(0.045, 0.015, l1) * step(r, 0.3); let st2 = smoothstep(0.045, 0.015, l2) * step(r, 0.3);
    var gl = select(select(select(ring, ring + st, ty == 1.0), st + st2 + smoothstep(0.05, 0.02, abs(r - 0.36)) * step(l1, 0.2), ty == 2.0), smoothstep(0.05, 0.02, abs(r - 0.14)) + smoothstep(0.045, 0.02, abs(l2 - 0.3)) * step(l1, 0.25), ty == 3.0);
    gl *= step(abs(g.y - 0.5), 0.5) * smoothstep(0.45, 0.8, abs(ng.z * ca - ng.x * sa)) * (1.0 - smoothstep(30.0, 70.0, dist));
    night += hsv2rgb(vec3f(0.47 + 0.12 * hs.y, 0.75, 1.0)) * gl * (0.8 + 3.0 * G.params.y * (0.7 + 0.3 * sin(G.time * 0.8 + hs.y * 20.0)));
  }
  return vec4f(farFog(mix(night, warm, in.l.z), p, dist), 1.0);
}

@fragment fn fsTer(in: RV) -> @location(0) vec4f {
  let p = in.w;
  let ng = normalize(in.n);
  let dist = distance(p, G.camPos);
  let V = (G.camPos - p) / dist;
  let t0 = textureSample(dtex, dsmp, p.xz * 0.0113);
  let t1 = textureSample(dtex, dsmp, p.xz * 0.047 + 0.31);
  let t2 = textureSample(dtex, dsmp, p.xz * 0.93);
  // wind ripples at two scales, forked by a slow warp, faded out where they would alias
  let ph = dot(p.xz, vec2f(0.8, 0.6)) * 36.0 + t1.r * 15.0;
  let wind = dot(ng.xz, vec2f(0.8, 0.6));                  // ripples stand tallest on windward slopes
  let fa = (1.0 - smoothstep(0.3, 1.0, fwidth(ph))) * (0.55 + 1.6 * clamp(-wind, 0.0, 0.3));
  let r1 = sin(ph) + 0.25 * sin(2.0 * ph + 1.0);
  let d1 = (cos(ph) + 0.5 * cos(2.0 * ph + 1.0)) * fa;
  let ph2 = dot(p.xz, vec2f(0.6, 0.8)) * 3.1 + t0.r * 22.0 + t1.r * 5.0;
  let fb = (1.0 - smoothstep(0.2, 0.7, fwidth(ph2))) * smoothstep(0.35, 0.6, t0.g);
  let d2 = (cos(ph2) + 0.5 * cos(2.0 * ph2 + 1.0)) * fb;
  let gf = 1.0 - smoothstep(4.0, 18.0, dist);
  var nd = ng;
  nd = normalize(vec3f(nd.x, nd.y, nd.z) - vec3f(0.8, 0.0, 0.6) * d1 * 0.11 - vec3f(0.6, 0.0, 0.8) * d2 * 0.06 * (0.4 + t0.r)
    - vec3f(t2.g - 0.5, 0.0, t2.b - 0.5) * 0.5 * gf - vec3f(t1.g - 0.5, 0.0, t1.b - 0.5) * 0.25);
  let shade = 0.9 + 0.12 * r1 * fa + 0.08 * sin(ph2) * fb + 0.1 * (t2.r - 0.5) * gf;

  // night dunes: rose and violet sand, cool key light, sky sheen at grazing angles, stardust glitter
  var alb = mix(vec3f(0.62, 0.24, 0.36), vec3f(0.27, 0.2, 0.6), smoothstep(0.35, 0.65, t0.r));
  alb = mix(alb, vec3f(0.14, 0.42, 0.52), smoothstep(0.55, 0.75, textureSample(dtex, dsmp, p.xz * 0.0047 + 0.6).r) * 0.5) * shade;
  var lightN = nightLight(nd, 1.0);
  let fr = pow(1.0 - max(dot(nd, V), 0.0), 4.0);
  lightN += (G.ambientSky * 0.9 + vec3f(0.03, 0.005, 0.035)) * fr + vec3f(0.16, 0.1, 0.3) * fr * smoothstep(0.0, 0.25, ng.y - nd.y + 0.5 * dot(ng.xz, V.xz));   // rim on crests
  for (var i = 0; i < 25; i++) {                            // glow of the creatures and lanterns on the sand
    let lp = LU.l[2 * i]; let v = lp.xyz - p; let dd = dot(v, v);
    let w2 = lp.w * lp.w; let att = 1.0 / (1.0 + dd / w2) * smoothstep(w2 * 60.0, w2 * 6.0, dd);
    lightN += LU.l[2 * i + 1].rgb * att * (0.45 + 0.55 * max(dot(nd, v) * inverseSqrt(dd + 1e-4), 0.0)) * 0.55;
  }
  var night = alb * (lightN + in.g);
  let hv = normalize(V + G.sunDir);
  let glit = smoothstep(0.35, 0.9, t2.a) * (0.25 + 5.0 * pow(max(dot(nd, hv), 0.0), 24.0)) * (1.0 - smoothstep(2.0, 16.0, dist));
  night += hsv2rgb(vec3f(t2.r * 5.0 + t1.r, 0.6, 1.0)) * glit * (0.12 + luminance(in.g) * 2.0);

  // canyon floor: same light ramp as the walls, hot pools where the beams land
  let Lw = min(in.l.x * (0.4 + 0.3 * nd.y) * shade + beamSpot(p) * 0.6 * (0.75 + 0.5 * t1.r) * max(nd.y, 0.0), 0.86);   // warm pool, never white
  var col = mix(night, ramp(Lw) * mix(vec3f(1.0), vec3f(1.1, 0.9, 1.2), t0.r), in.l.z);

  // the oasis: wet sand and a luminous shoreline
  let od = distance(p.xz, OASP.xz);
  col = col * (1.0 - 0.5 * smoothstep(9.5, 6.4, od)) + alb * vec3f(0.02, 0.3, 0.26) * exp(-pow(od - 6.7, 2.0) * 0.8);
  // the door: contact shadow under the frame, a breath of warm light on the sill
  let q = p - DOORP;
  col *= 1.0 - 0.8 * exp(-(pow(max(abs(q.x) - 0.6, 0.0), 2.0) * 5.0 + q.z * q.z * 3.0)) * step(abs(q.y), 1.0);
  col += alb * vec3f(0.22, 0.13, 0.07) * exp(-(q.x * q.x * 0.5 + pow(abs(q.z) - 1.0, 2.0) * 0.5));
  return vec4f(farFog(col, p, dist), 1.0);
}
