// Particles and light in the air: dust motes, glowing letters, fountain drops, orrery rings, volumetric window beams.
struct PO { @builtin(position) pos: V4, @location(0) uv: V2, @location(1) c: V4 };
fn corner(vi: u32) -> V2 { return V2(f32((0x1cu >> vi) & 1u), f32((0x32u >> vi) & 1u)) * 2. - 1.; }
fn px(d: f32) -> f32 { return d * G.tanHalfFov * 2. * G.invResolution.y; }

@vertex fn vsMote(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  let h = hash3u(vec3u(ii, 1u, 2u)); let bx = V3(26., 14., 26.); let t = G.time;
  var p = h * bx + V3(sin(t * .05 + h.y * 40.) * .8, t * .015 * (h.x - .35) + .3 * sin(t * .09 + h.z * 30.), cos(t * .04 + h.x * 50.) * .8);
  let cc = V3(G.camPos.x, max(G.camPos.y, 6.), G.camPos.z) + G.camFwd * V3(8., 0., 8.);
  p = cc + (fract((p - cc) / bx + .5) - .5) * bx;
  let d = distance(p, G.camPos);
  let lit = sunAt(p, 0.) * SUNC * 2.2 + lamps(p, normalize(G.camPos - p)) * .25 + .012;
  let r = .007 + .012 * h.z; let re = max(r, px(d) * .9);
  let c = corner(vi);
  o.pos = G.viewProj * V4(billboard(p, c, V2(re)), 1.); o.uv = c;
  o.c = V4(lit * (r * r / (re * re)) * ss(.3, 1.5, d) * (1. - ss(9., 13., d)) * (.6 + .4 * sin(t * (.5 + h.x) + h.y * 30.)), 0.);
  return o;
}
@fragment fn fsDot(in: PO) -> @location(0) V4 {
  let d = dot(in.uv, in.uv);
  return V4(in.c.rgb * exp(-d * 3.) * (1. - ss(.7, 1., d)), 0.);
}

// letters rising from the open floating books
struct Bk { bx: V4, by: V4, bz: V4, bp: V4 };
@group(2) @binding(0) var<storage, read> BKS: array<Bk>;
@vertex fn vsGlyph(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  let b = BKS[ii / 8u]; let j = f32(ii % 8u); let h = hash3u(vec3u(ii, 9u, 4u));
  let cyc = G.time * .07 + j / 8. + h.x; let age = fract(cyc); let sd = floor(cyc) + f32(ii) * 3.;
  let p = b.bp.xyz + b.bx.xyz * ((h.y - .5) * .3) + b.bz.xyz * ((h.z - .5) * .2)
    + V3(sin(age * 5. + sd) * .12, .08 + age * 1.3, cos(age * 4. + sd * 1.3) * .12);
  let c = corner(vi);
  o.pos = G.viewProj * V4(billboard(p, c, V2(.05 + .04 * age)), 1.); o.uv = c;
  o.c = V4(sin(age * PI) * b.bx.w * b.bp.w, sd, 0., 0.);
  return o;
}
fn seg(p: V2, a: V2, b: V2) -> f32 { let pa = p - a; let ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
@fragment fn fsGlyph(in: PO) -> @location(0) V4 {
  var d = 9.; let s = in.c.y;
  for (var i = 0; i < 3; i++) {
    let a = floor(hash22(V2(s, f32(i))) * 3.) - 1.; let b = floor(hash22(V2(s + 7., f32(i))) * 3.) - 1.;
    d = min(d, seg(in.uv, a * .55, b * .55 + .01));
  }
  let g = ss(.14, .04, d) + exp(-d * 5.) * .25;
  return V4(V3(1., .62, .2) * g * in.c.x * 4. * (1. - ss(.75, 1., length(in.uv))), 0.);
}

// fountain drops on two tiers of parabolas
@vertex fn vsDrop(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  let h = hash3u(vec3u(ii, 5u, 6u)); let low = (ii & 1u) == 1u;
  let jets = select(8., 14., low); let a = (floor(h.x * jets) + .5) / jets * TAU;
  let T = select(.68, .5, low); let u = fract(G.time / T * .8 + h.y); let tt = u * T;
  let r = select(.12 + .9 * tt, 1.32 + .8 * tt, low) + (h.z - .5) * .04;
  let y = select(2.78 + 1.6 * tt, 1.52 + .3 * tt, low) - 4.9 * tt * tt;
  let p = V3(47. + cos(a) * r, y, sin(a) * r);
  let c = corner(vi); let d = distance(p, G.camPos);
  o.pos = G.viewProj * V4(billboard(p, c, V2(max(.02, px(d)), max(.045, px(d)))), 1.); o.uv = c;
  o.c = V4((V3(.5, .75, .8) * .5 + sunC(p) * .8) * (1. - ss(30., 50., d)), 0.);
  return o;
}

// orrery orbit rings: tubes that never get thinner than a pixel (alpha takes over)
struct RI { @location(0) pos: V3, @location(1) nrm: V3, @location(3) a: V4, @location(4) b: V4 };
struct RO { @builtin(position) pos: V4, @location(0) n: V3, @location(1) wp: V3, @location(2) al: f32 };
@vertex fn vsRing(in: RI) -> RO {
  var o: RO;
  let m = rotZ(in.a.z) * rotX(in.a.y);
  let c = in.b.xyz + m * (in.pos * in.a.x); let n = m * in.nrm;
  let re = max(in.a.w, px(distance(c, G.camPos)) * 1.1);
  o.wp = c + n * re; o.n = n; o.al = in.a.w / re;
  o.pos = G.viewProj * V4(o.wp, 1.);
  return o;
}
@fragment fn fsRing(in: RO) -> @location(0) V4 {
  let n = normalize(in.n); let v = normalize(G.camPos - in.wp); let r = reflect(-v, n);
  let g = V3(.85, .58, .18);
  let c = g * (lamps(in.wp, n) * .5 + lamps(in.wp, r) * 2. + mix(V3(.03), V3(.4, .34, .26), ss(-.4, .9, r.y)) + sunAt(in.wp, 0.) * 1.5);
  return V4(haze(c, in.wp) * in.al, in.al);
}

// ---- volumetric beams: half-res march through the slabs of air the windows can light ----
@group(2) @binding(0) var DT: texture_depth_2d;
struct FO { @builtin(position) pos: V4, @location(0) uv: V2 };
@vertex fn vsFs(@builtin(vertex_index) vi: u32) -> FO { var o: FO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
// t-interval where a0 + a1 * t lies in [lo, hi], clipped to r
fn clip(r: V2, a0: f32, a1: f32, lo: f32, hi: f32) -> V2 {
  let d = select(a1, 1e-5, abs(a1) < 1e-5);
  let t0 = (lo - a0) / d; let t1 = (hi - a0) / d;
  return V2(max(r.x, min(t0, t1)), min(r.y, max(t0, t1)));
}
@fragment fn fsVol(in: FO) -> @location(0) V4 {
  let rd = viewRay(in.uv); let ro = G.camPos; let s = G.sunDir;
  let dp = textureLoad(DT, min(vec2i(in.uv * G.resolution), vec2i(G.resolution) - 1), 0);
  let tm = min(G.near / max(dp, 1e-6) / max(dot(rd, G.camFwd), .1), 85.);
  let j = ign(in.pos.xy);
  var acc = V3(0.);
  // nave: |x| < GP and the sunward window band
  let gx = GP * sign(s.x); let kx = s.y / s.x;
  var r = clip(clip(V2(0., tm), ro.x, rd.x, -GP, GP), ro.y + kx * (gx - ro.x), rd.y - kx * rd.x, 10.7, 15.3);
  if (r.y > r.x) {
    let dt = (r.y - r.x) / 9.;
    for (var i = 0; i < 9; i++) { let t = r.x + (f32(i) + j) * dt; acc += sunN(ro + rd * t, 0.) * (dt * exp(-t * t * .00011)); }
  }
  // transept (and the rose, whose band is wider)
  let gz = GP * sign(s.z); let kz = s.y / s.z;
  r = clip(clip(clip(V2(0., tm), ro.z, rd.z, -GP, GP), ro.x, rd.x, -49., 37.), ro.y + kz * (gz - ro.z), rd.y - kz * rd.z, 10.7, 19.);
  if (r.y > r.x) {
    let dt = (r.y - r.x) / 8.;
    for (var i = 0; i < 8; i++) { let t = r.x + (f32(i) + j) * dt; acc += sunT(ro + rd * t, 0.) * (dt * exp(-t * t * .00011)); }
  }
  // court
  r = clip(clip(V2(0., tm), ro.x, rd.x, 37.6, 57.), ro.y, rd.y, 0., 13.);
  if (r.y > r.x) {
    let dt = (r.y - r.x) / 5.;
    for (var i = 0; i < 5; i++) { let t = r.x + (f32(i) + j) * dt; acc += sunC(ro + rd * t) * (dt * .45 * exp(-t * t * .00011)); }
  }
  let ph = .55 + 1.5 * pow(max(dot(rd, s), 0.), 3.);
  return V4(acc * SUNC * (.034 * ph), 1.);
}
@group(3) @binding(0) var VT: texture_2d<f32>;
@group(3) @binding(1) var VS: sampler;
@fragment fn fsMix(in: FO) -> @location(0) V4 {
  let tx = 1. / V2(textureDimensions(VT)); let uv = in.uv * G.uvScale;
  let o = (ign(in.pos.xy) - .5) * tx;
  let c = textureSampleLevel(VT, VS, uv + tx * V2(1.2, .4) + o, 0.) + textureSampleLevel(VT, VS, uv + tx * V2(-.4, 1.2) + o, 0.)
    + textureSampleLevel(VT, VS, uv + tx * V2(-1.2, -.4) + o, 0.) + textureSampleLevel(VT, VS, uv + tx * V2(.4, -1.2) + o, 0.);
  return V4(c.rgb * .25, 0.);
}
