// opaque scene: cave rock (surface-nets mesh with baked crystal light) and instanced crystals
@group(1) @binding(0) var dtex: texture_2d<f32>;
@group(1) @binding(1) var dsmp: sampler;

struct RV { @builtin(position) @invariant pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) l: vec4f, @location(3) d: vec4f, @location(4) m: vec2f };
@vertex fn vsRock(@location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @location(3) d: vec4f) -> RV {
  var o: RV;
  o.w = mir(a.xyz); o.n = mirN(b.xyz); o.l = c; o.d = vec4f(mirN(d.xyz), d.w); o.m = vec2f(a.w, b.w);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}

// refraction caustics near crystals and above the pool: two soft layers, lines of varying width, faint colour fringe
fn caustic(p: vec3f) -> vec3f {
  let q = p * 0.9 + vec3f(0.0, G.time * 0.02, 0.0);
  let n = snoise3(q + 0.5 * sin(q.yzx * 1.3 + G.time * 0.05));
  let n2 = snoise3(q.zxy * 2.3 + vec3f(5.0, -G.time * 0.03, 1.0));
  let k = mix(25.0, 110.0, n2 * 0.5 + 0.5); let d = 0.02;
  let w = 0.35 + 0.65 * smoothstep(-0.4, 0.5, n2);
  return vec3f(exp(-(n - d) * (n - d) * k), exp(-n * n * k), exp(-(n + d) * (n + d) * k)) * w;
}

@fragment fn fsRock(in: RV) -> @location(0) vec4f {
  let ng = normalize(in.n);
  let p = in.w;
  var tw = pow(abs(ng), vec3f(4.0)); tw /= (tw.x + tw.y + tw.z);
  let s1 = 0.23; let s2 = 1.37;
  let ax = textureSample(dtex, dsmp, p.zy * s1); let ay = textureSample(dtex, dsmp, p.xz * s1); let az = textureSample(dtex, dsmp, p.xy * s1);
  let bx = textureSample(dtex, dsmp, p.zy * s2 + 0.37); let by = textureSample(dtex, dsmp, p.xz * s2 + 0.37); let bz = textureSample(dtex, dsmp, p.xy * s2 + 0.37);
  let h1 = dot(tw, vec3f(ax.r, ay.r, az.r)); let h2 = dot(tw, vec3f(bx.r, by.r, bz.r));
  let ga = (vec3f(0.0, ax.b, ax.g) * 2.0 - vec3f(0.0, 1.0, 1.0)) * tw.x + (vec3f(ay.g, 0.0, ay.b) * 2.0 - vec3f(1.0, 0.0, 1.0)) * tw.y + (vec3f(az.g, az.b, 0.0) * 2.0 - vec3f(1.0, 1.0, 0.0)) * tw.z;
  let gb = (vec3f(0.0, bx.b, bx.g) * 2.0 - vec3f(0.0, 1.0, 1.0)) * tw.x + (vec3f(by.g, 0.0, by.b) * 2.0 - vec3f(1.0, 0.0, 1.0)) * tw.y + (vec3f(bz.g, bz.b, 0.0) * 2.0 - vec3f(1.0, 1.0, 0.0)) * tw.z;
  let dist = distance(p, G.camPos);
  let nd = normalize(ng - ga * 1.7 - gb * (0.9 * (1.0 - smoothstep(10.0, 40.0, dist))));
  let speck = dot(tw, vec3f(bx.a, by.a, bz.a));

  let strata = 0.5 + 0.5 * sin(p.y * 0.9 + h1 * 3.0 + p.x * 0.05 + p.z * 0.04);
  var alb = mix(vec3f(0.05, 0.056, 0.072), vec3f(0.16, 0.172, 0.2), h1 * 0.6 + h2 * 0.2 + strata * 0.2);
  alb = mix(alb, vec3f(0.15, 0.155, 0.17), smoothstep(0.75, 0.95, ng.y) * 0.5);   // dusty floors
  alb *= 0.75 + 0.5 * h2;
  // the geode: dark basalt rind with pale agate banding showing between the crystals
  let gq = (p - vec3f(-6.0, 3.5, 30.0)) / vec3f(8.0, 5.5, 7.5);
  let gm = (1.0 - smoothstep(0.9, 1.3, length(gq))) * smoothstep(23.5, 25.5, p.z);
  let ag = 1.0 - smoothstep(0.05, 0.16, abs(fract(length(gq) * 7.0 + h1 * 1.6) - 0.5));
  alb = mix(alb, mix(vec3f(0.05, 0.045, 0.065), vec3f(0.3, 0.26, 0.36), ag * 0.5), gm);
  // the mushroom grotto: damp moss on everything that faces up
  let moss = (1.0 - smoothstep(9.0, 14.0, distance(p.xz, vec2f(-22.0, -34.0)))) * smoothstep(0.35, 0.8, ng.y) * smoothstep(0.25, 0.6, h1 + 0.3 * h2);
  alb = mix(alb, vec3f(0.035, 0.1, 0.055) * (0.6 + 0.8 * h2), moss * 0.8);

  let V = normalize(G.camPos - p);
  let px = prox(p);
  let L0 = in.l.rgb * pulse(in.m.x) * (1.0 + 0.45 * px);
  let L = mix(vec3f(luminance(L0)), L0, 0.72);
  let ld = normalize(in.d.xyz + vec3f(0.0, 1e-3, 0.0));
  let k = clamp(wrapDiffuse(nd, ld, 0.45) / max(wrapDiffuse(ng, ld, 0.45), 0.25), 0.0, 2.2);
  let ao = in.l.a * (0.75 + 0.25 * h2);
  // coloured ambient keeps the shadows readable (never crushed)
  let amb = mix(vec3f(0.017, 0.016, 0.032), vec3f(0.028, 0.04, 0.066), nd.y * 0.5 + 0.5) * (1.0 + 0.6 * px);
  var col = alb * (L * k + amb * ao);
  let hv = normalize(ld + V);
  let nh = max(dot(nd, hv), 0.0);
  let wet = in.d.w;
  col += L * (pow(nh, 60.0) * wet * 0.5 + pow(nh, 22.0) * 0.07 * h2 + pow(nh, 12.0) * smoothstep(0.3, 0.9, speck) * 1.2 * (1.0 - smoothstep(8.0, 22.0, dist)));
  let cw = in.m.y;
  if (cw > 0.015) { col += alb * caustic(p) * cw * (0.3 + 1.1 * luminance(L)) * (1.0 - smoothstep(18.0, 34.0, dist)); }
  if (p.y < WL) { col *= exp((p.y - WL) * vec3f(2.2, 1.0, 0.8)); }
  // slow rings of colour: two breathe out of the floating heart of the hall, one answers the crystal flower you woke (G.params2)
  let dc = distance(p, OC); let df = distance(p, G.params2.xyz); let age = G.time - G.params2.w;
  var rg = vec3f(0.0);
  for (var i = 0; i < 2; i++) {
    let ph = fract(G.time / 18.0 + 0.5 * f32(i)); let x = dc - 3.0 - ph * 34.0;
    rg += spectrum(0.6 + 0.35 * f32(i) + floor(G.time / 18.0 + 0.5 * f32(i)) * 0.21) * exp(-x * x * 0.7) * smoothstep(0.0, 0.1, ph) * (1.0 - ph) * (1.0 - ph);
  }
  let xf = df - age * 1.7;
  rg += spectrum(df * 0.12 + G.params2.w * 0.37) * exp(-xf * xf * 3.0) * exp(-age * 0.4) * step(0.0, age) * 0.9;
  col += (alb * 2.5 + 0.012) * rg * 0.9;
  return vec4f(applyFog(col, p), 1.0);
}
// cheap version for the reflection pass
@fragment fn fsRockRef(in: RV) -> @location(0) vec4f {
  if (in.w.y > WL) { discard; }
  let L = in.l.rgb * pulse(in.m.x);
  let amb = vec3f(0.02, 0.022, 0.043);
  var col = vec3f(0.135, 0.125, 0.15) * (L + amb * in.l.a);
  if (in.m.y > 0.015) { col += 0.135 * caustic(in.w * vec3f(1.0, -1.0, 1.0)) * in.m.y * 0.4; }
  return vec4f(applyFog(col, in.w), 1.0);
}

// ---------------------------------------------------------------------------------------- crystals
struct CV {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) @interpolate(flat) n: vec3f, @location(2) lp: vec3f,
  @location(3) @interpolate(flat) base: vec4f, @location(4) @interpolate(flat) q: vec4f, @location(5) @interpolate(flat) col: vec4f,
  @location(6) @interpolate(flat) misc: vec4f, @location(7) @interpolate(flat) env: vec4f, @location(8) @interpolate(flat) fl: f32,
};
@vertex fn vsCry(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) i0: vec4f, @location(4) q0: vec4f,
@location(5) i2: vec4f, @location(6) i3: vec4f, @location(7) i4: vec4f) -> CV {
  let len = i0.w; let r = i3.x; let seed = i3.y; let ty = i3.z;
  var q = q0; var ip = i0.xyz;
  if (ORBIT > 0.5) {
    // phase 0 = the heart (turns in place), others drift around it at their own pace and bob a little
    let ph = i3.w; let a = G.time * (0.035 + 0.03 * sin(ph * 7.0)) * step(0.5, ph) + G.time * 0.05 * (1.0 - step(0.5, ph));
    let s = sin(a * 0.5); let c = cos(a * 0.5);
    q = vec4f(c * q0.x + s * q0.z, c * q0.y + s * q0.w, c * q0.z - s * q0.x, c * q0.w - s * q0.y);
    let rel = ip - OC;
    ip = OC + vec3f(rel.x * cos(a) + rel.z * sin(a), rel.y + 0.35 * sin(G.time * 0.21 + ph * 3.0) * step(0.5, ph), rel.z * cos(a) - rel.x * sin(a));
  }
  let axis = quatRotate(q, vec3f(0.0, 1.0, 0.0));
  // never thinner than ~1.3 px: widen and dim instead of breaking into dotted aliasing
  let px = distance(ip + axis * len * 0.5, G.camPos) * 2.0 * G.tanHalfFov / G.resolution.y;
  let r2 = max(r, px * 1.3);
  let tf = fract(seed * 7.3);
  let tipL = min(r * mix(mix(0.3, 2.3, tf * tf), mix(0.25, 1.7, tf), ty), len * 0.45);
  // selenite: irregular cross-section, every corner at its own radius
  let cs = 1.0 + ty * (hash21(vec2f(round(atan2(p.z, p.x) * 0.9549297) + 9.0, seed * 31.0 + 1.0)) - 0.5) * 0.55;
  let tt = max(p.y - 0.7, 0.0) / 0.3;
  let sh = ty * 0.7 * (fract(seed * 3.1) - 0.35);
  let l = vec3f(r2 * (p.x * cs + sh * tt), min(p.y, 0.7) / 0.7 * (len - tipL) + tt * tipL, r2 * i4.w * p.z * cs);
  var nl = vec3f(n.x / r2, 0.0, n.z / (r2 * i4.w));
  if (n.y > 0.01) { nl.y = (0.3 * n.y - sh * n.x) / tipL; }
  var o: CV;
  o.w = mir(ip + quatRotate(q, l));
  o.n = mirN(normalize(quatRotate(q, nl)));
  o.lp = p;
  o.base = vec4f(mir(ip), r2);
  o.q = q;
  o.col = i2;
  o.misc = vec4f(seed, ty, i3.w, r / r2);
  o.env = vec4f(i4.xyz, len);
  o.fl = i4.w;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}

@fragment fn fsCry(in: CV) -> @location(0) vec4f {
  if (MIRROR > 0.5 && in.w.y > WL) { discard; }
  let V = normalize(G.camPos - in.w);
  let ax = mirN(quatRotate(in.q, vec3f(0.0, 1.0, 0.0)));
  let ex = mirN(quatRotate(in.q, vec3f(1.0, 0.0, 0.0)));
  let ez = mirN(quatRotate(in.q, vec3f(0.0, 0.0, 1.0)));
  let R = in.base.w; let seed = in.misc.x; let ty = in.misc.y;
  let rel = in.w - in.base.xyz;
  let along = dot(rel, ax);
  let hh = clamp(along / in.env.w, 0.0, 1.0);
  let radial = normalize(rel - ax * along + ax * 1e-4);
  // position across the hexagonal facet: 1 at the edges between facets
  let sec = atan2(in.lp.z, in.lp.x) * 0.9549297 + 6.0;
  let sa = fract(sec);
  let e = abs(sa - 0.5) * 2.0;
  let dist = distance(in.w, G.camPos);
  let pxw = dist * G.tanHalfFov / G.resolution.y / R;           // one pixel in units of the crystal radius
  let bev = smoothstep(0.84 - pxw * 2.0, 1.0, e);
  let nf = normalize(in.n);
  let tang = normalize(cross(ax, nf) + vec3f(1e-5, 0.0, 0.0));
  // faceted, with rounded bevels on the edges and fine growth striations on the selenite
  let stri = ty * 0.018 * sin(sa * 46.0 + seed * 40.0) * (1.0 - smoothstep(0.01, 0.04, pxw));
  let n = normalize(nf + radial * bev * 0.35 + tang * stri);
  let ndv = clamp(dot(n, V), 0.0, 1.0);
  let F = pow(1.0 - ndv, 3.5);
  // refract the view ray into the crystal and follow it through the hexagonal cross-section to the back facet it leaves by
  let r = refract(-V, n, 0.68);
  let tt = clamp((in.lp.y - 0.7) / 0.3, 0.0, 0.95);
  let ap = 0.866 * (1.0 - tt);
  let p2 = in.lp.xz * 0.985;
  let d2 = vec2f(dot(r, ex), dot(r, ez) / in.fl);
  var tb = 1e9; var kb = 0.0; var ub = 0.0;
  for (var j = 0; j < 3; j++) {
    let a = 0.5236 + 1.0472 * f32(j);
    let m = vec2f(cos(a), sin(a));
    let s = dot(d2, m);
    let sg = select(-1.0, 1.0, s > 0.0);
    let t = (ap * sg - dot(p2, m)) / (abs(s) + 1e-4) * sg;
    if (t < tb) { tb = t; kb = f32(j) + 1.5 + 1.5 * sg; let pe = p2 + d2 * t; ub = abs(dot(pe, vec2f(-m.y, m.x))) / (ap * 0.5774); }
  }
  let thick = clamp(tb * 0.5, 0.0, 1.0);
  let backEdge = smoothstep(0.72, 0.98, ub) * (1.0 - smoothstep(0.02, 0.08, pxw));
  let fh = hash21(vec2f(kb + 1.0, seed * 57.0 + 2.0));
  let facet = mix(0.15 + 1.9 * fh * fh, 0.55 + 0.8 * fh, ty);
  // how close the ray passes to the glowing core
  let cr = cross(r, ax);
  let dl = abs(dot(rel, cr)) / max(length(cr), 0.08);
  let core = mix(exp(-pow(dl / (R * 0.6), 2.0)), 1.0, 0.35 * (1.0 - ty));
  // silky veils inside, stretched along the growth axis, sampled along the refracted ray (parallax)
  let wi = rel + r * (R * (0.4 + thick));
  let veil = mix(0.7, 0.55, ty) + mix(0.3, 0.45, ty) * vnoise3(vec3f(dot(wi, ex), dot(wi, ax) * mix(0.45, 0.12, ty), dot(wi, ez)) * (1.5 / max(R, 0.07)) + seed * 17.0);
  let tint = in.col.rgb;
  // crystal flowers (glow >= 8) wake up when you stand next to them
  let fw = step(8.0, in.col.a);
  let glow = (in.col.a - 8.0 * fw) * pulse(in.misc.z) * mix(1.0 + 0.8 * prox(in.base.xyz), 0.6 + 1.5 * (1.0 - smoothstep(2.0, 6.5, distance(in.base.xyz, G.camPos))), fw);
  let milk = mix(tint, vec3f(1.0), 0.55);
  let deep = tint * tint * vec3f(0.9, 0.8, 1.0);
  // a dim saturated body with the light living inside it: hot milky core near the base, deep colour in the point
  let axial = 0.5 + 0.9 * smoothstep(0.0, 0.45, hh) - 0.75 * smoothstep(0.55, 1.0, hh);
  let e0 = glow * core * core * thick * axial * veil * facet;
  let body = mix(deep, tint * vec3f(0.4, 0.6, 1.0), ty);
  var col = body * (0.03 + 0.2 * thick * facet * veil) * (0.5 + 0.5 * glow) + mix(deep, tint, 0.6) * e0 * 1.5 + milk * pow(min(e0, 2.0), 3.0) * 0.12;
  // selenite: translucent. Light scatters inside: thin edges and tips glow, the thick core is milky, fractures catch light,
  // and the whole beam takes the colour of the crystals around it
  let lt = tint * 0.4 + in.env.rgb * 1.5;
  let thin = 1.0 - thick;
  let ws = vec3f(dot(wi, ex), dot(wi, ax), dot(wi, ez)) / max(R, 0.07);
  let frac = pow(1.0 - abs(sin(ws.x * 2.3 + ws.y * 0.55 + ws.z * 1.1 + veil * 2.0 + seed * 9.0)), 14.0);
  let grad = mix(1.3, 0.6, hh) * (0.85 + 0.15 * sin(along * 0.45 + in.misc.z));
  let sel = lt * glow * grad * (0.14 + 0.55 * thin * thin + 0.5 * veil * veil * thick * facet + 0.25 * frac * thick) * 1.35 + (lt * 0.7 + 0.12) * F * 0.8;
  // amethyst and citrine: every face carries its own depth of colour, pale near the root and darkest in the point
  let fid = floor(sec) + step(0.7, in.lp.y) * 7.0;
  col *= (0.35 + 1.1 * hash21(vec2f(fid + 3.0, seed * 77.0))) * mix(1.25, 0.45, smoothstep(0.2, 1.0, hh));
  col = mix(col, sel, ty);
  // back edges seen through the crystal, split into colours
  col += (spectrum(kb * 0.17 + ub * 0.5 + seed * 3.0) * 0.5 + 0.5) * tint * backEdge * (0.35 + 0.5 * thick) * glow * mix(0.35, 0.1, ty);
  // fresnel rim, facet reflections of a soft cave "environment", dispersion fringes on the bevels
  let rf = reflect(-V, n);
  col += mix(tint, vec3f(1.0), 0.15) * F * (0.03 + 0.12 * glow) * (1.0 - ty);
  col += (vec3f(0.012, 0.018, 0.035) + in.env.rgb * 0.25) * (0.1 + 0.9 * smoothstep(-0.3, 0.9, rf.y)) * (0.1 + F);
  let dsp = spectrum(dot(r, ax) * 1.2 + e * 0.6 + seed * 5.0);
  col += dsp * bev * ndv * 0.13 * (0.15 + 0.6 * glow) * mix(1.0, 0.4, ty);
  // facet flashes: a whole face lights up when its reflection lines up with a per-face direction
  let sd = normalize(hash33(vec3f(seed * 91.0 + 1.0, fid, 3.0)) * 2.0 - 1.0);
  col += mix(tint, vec3f(1.0), mix(0.4, 0.7, ty)) * pow(abs(dot(rf, sd)), mix(80.0, 28.0, ty)) * 1.6 * glow * (1.0 - smoothstep(20.0, 55.0, dist));
  // light picked up from neighbouring crystals
  col += in.env.rgb * (0.03 + 0.4 * veil * core * thick * facet) * 0.5 + tint * 0.008;
  col = mix(vec3f(luminance(col)), col, 1.3 - 0.3 * ty);
  return vec4f(applyFog(max(col, vec3f(0.0)), in.w) * in.misc.w, 1.0);
}
@fragment fn fsPre() -> @location(0) vec4f { return vec4f(0.0); }
