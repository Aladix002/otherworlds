alias V2 = vec2f; alias V3 = vec3f; alias V4 = vec4f;
fn ss(a: f32, b: f32, x: f32) -> f32 { return smoothstep(a, b, x); }
// Shared: stained glass, sun through the windows, window emission along a ray, lamps, sky, fog.
const GP = 7.3;                        // glass plane distance from the hall axis
const SUNI = 5.;
const SUNC = V3(1., .9, .74);
const FOGC = V3(.34, .2, .085);
const CDIR = V3(.099, .993, -.069);          // light of the court falls almost straight down through its oculus
struct Light { p: V4, c: V4 };   // p.w = radius
struct U { l: array<Light, 8> };
@group(1) @binding(0) var<uniform> UB: U;

fn ign(p: V2) -> f32 { return fract(52.9829189 * fract(dot(p, V2(.06711056, .00583715)))); }
fn jewel(h: f32) -> V3 {
  var c = array<V3, 8>(V3(.9, .03, .05), V3(1., .5, .04), V3(.03, .6, .18), V3(.04, .15, .95),
    V3(.45, .07, .85), V3(1., .86, .5), V3(0., .6, .72), V3(1., .2, .42));
  return c[u32(h * 8.) & 7u];
}
// window opening (negative inside): 3.4 m wide, 2.9 m straight part, round top
fn archD(f: f32, v: f32) -> f32 {
  return min(max(abs(f) - 1.7, max(-v, v - 2.9)), length(V2(f, v - 2.9)) - 1.7);
}
// palette of an arm: 0 (and the roses) all jewels, 1 sea greens and blues, 2 ambers and reds, 3 teal to indigo; all keep some gold
fn pcol(arm: i32, h: f32) -> V3 {
  if (arm == 0 || arm == 4) { return jewel(h); }
  if (h > .86) { return V3(1., .8, .4); }
  var hue = .34 + .3 * h;
  if (arm == 2) { hue = .97 + .17 * h; }
  if (arm == 3) { hue = .48 + .27 * h; }
  return hsv2rgb(V3(fract(hue), .88, .55 + .45 * fract(h * 7.)));
}
// radial fan (arch heads and the roses): w = position from the centre in units of the radius
fn fan(w: V2, sect: f32, arm: i32, k: f32, det: f32, e: f32) -> V3 {
  let r = length(w); let an = atan2(w.y, w.x) / TAU * sect;
  let ring = step(.34, r) + step(.68, r);
  var c = pcol(arm, hash21(V2(floor(an) + ring * 13., k + ring * 3.)));
  c = mix(V3(1., .8, .35), c, min(ring, 1.));
  let la = (.5 - abs(fract(an) - .5)) * r * TAU / sect;
  let lr = min(abs(r - .34), abs(r - .68));
  let lead = 1. - ss(.012, .012 + e, min(la + (1. - min(ring, 1.)), lr));
  return c * (1. - det * lead * .92);
}
// pane colour (transmittance) at window coordinates f (across), v (up from the sill); k = bay.
// det = 0: soft colour only (air, reflections); 1: the geometric lattice with its lead lines.
// Lattices: 0 diamonds with inner squares, 1 roundels, 2 eight-pointed stars, 3 small nested diamonds.
fn pane(arm: i32, k: f32, f: f32, v: f32, det: f32, e0: f32) -> V3 {
  var c: V3; var lead = 0.;
  let e = max(e0, .008);
  if (det < .5) {
    let w = .5 + .5 * sin(k * 2.1 + f * 1.3 + v * .9);
    c = mix(pcol(arm, w * .85), hsv2rgb(V3(fract(k * .37 + f * .25 + v * .17), .85, 1.)), f32(arm == 0));
  } else if (v < 2.9) {
    var q = V2(f, v) / select(.42, .5, arm == 2);
    if (arm == 0 || arm == 3) { q = V2(f + v, f - v) / select(.46, .36, arm == 3); }
    q += k * 3.;
    let id = floor(q); let l = abs(fract(q) - .5); let mx = max(l.x, l.y); let eq = e * 3.;
    var m = mx; var th = .23;
    if (arm == 1) { m = length(l); th = .36; }
    if (arm == 2) { m = min(mx, (l.x + l.y) * .707); th = .3; }
    c = mix(pcol(arm, hash21(id + k * 17.)), pcol(arm, hash21(id * 1.7 + 5.)), ss(th + eq, th - eq, m));
    if (arm == 3) { c = mix(c, pcol(3, hash21(id * 2.3 + 1.)), ss(.1 + eq, .1 - eq, mx)); }
    lead = max(ss(.47 - eq, .47 + eq, mx), 1. - ss(.015 + .012 * hash21(id), .02 + eq, abs(m - th)));
  } else { c = fan(V2(f, v - 2.9) / 1.7, 18., arm, k, det, e / 1.7); }
  let d = archD(f, v);
  c = mix(c, V3(1., .9, .62), ss(-.15 - e, -.15 + e, d) * .85);
  lead = max(lead, 1. - ss(.012, .012 + e, abs(d + .15)));
  return c * (1. - det * lead * .92);
}
// a = distance along the arm from the crossing edge
fn glass(arm: i32, a: f32, y: f32, det: f32, e: f32) -> V3 {
  let n = select(144., select(42., 30., arm == 2), arm > 1);
  if (a < 0. || a > n) { return V3(0.); }
  let k = floor(a / 6.); let f = a - k * 6. - 3.; let v = y - 10.7;
  let m = ss(e, -e, archD(f, v));
  if (m < .002) { return V3(0.); }
  return pane(arm, k, f, v, det, e) * m;
}
fn rose(w: V2, det: f32, e: f32) -> V3 {
  let r = length(w);
  if (r > 2.8 + e) { return V3(0.); }
  return fan(w / 2.8, 16., 4, 3., det, e / 2.8) * ss(2.8 + e, 2.8 - e, r);
}
// coloured sunlight arriving at p (0 when the way to the sun is not through a window): nave, transept, court
fn sunN(p: V3, det: f32) -> V3 {
  let s = G.sunDir;
  let t = (GP * sign(s.x) - p.x) / s.x; let h = p + s * t;
  return glass(select(1, 0, h.z > 0.), abs(h.z) - 7., h.y, det, .02 + t * .012);
}
fn sunT(p: V3, det: f32) -> V3 {
  let s = G.sunDir;
  let t = (GP * sign(s.z) - p.z) / s.z; let h = p + s * t;
  let t2 = (37. - p.x) / s.x; let h2 = p + s * t2;
  return glass(select(3, 2, h.x > 0.), abs(h.x) - 7., h.y, det, .02 + t * .012) + rose(V2(h2.z, h2.y - 16.), det, .03 + t2 * .012);
}
fn sunC(p: V3, det: f32) -> V3 { let t = (13. - p.y) / CDIR.y; return rose(((p + CDIR * t).xz - V2(47., 0.)) * .5, det, .03 + t * .008) * step(37.6, p.x) * .55; }
fn sunAt(p: V3, det: f32) -> V3 {
  var c = V3(0.);
  if (abs(p.x) < GP) { c = sunN(p, det); }
  if (abs(p.z) < GP && p.x < 37. && p.x > -49.) { c += sunT(p, det); }
  if (p.x > 37.6) { c += sunC(p, det); }
  return c;
}
// stained glass seen along direction d from p (reflections, gold)
fn winEmit(p: V3, d: V3, det: f32) -> V3 {
  let s = G.sunDir; var c = V3(0.);
  if (abs(p.x) < GP && abs(d.x) > .03) {
    let sg = sign(d.x); let t = (GP * sg - p.x) / d.x; let h = p + d * t;
    let tb = (sg * 4.5 - p.x) / d.x;      // the bookcase block and gallery hide low reflections
    c = glass(select(1, 0, h.z > 0.), abs(h.z) - 7., h.y, det, .06 + t * .02) * select(.4, 2.2, sg == sign(s.x)) * select(ss(6., 10., p.y + d.y * tb), 1., tb < 0.);
  }
  if (abs(p.z) < GP && abs(d.z) > .03 && abs(p.x) > 6. && p.x < 37. && p.x > -49.) {
    let sg = sign(d.z); let t = (GP * sg - p.z) / d.z; let h = p + d * t;
    let tb = (sg * 4.5 - p.z) / d.z;
    c += glass(select(3, 2, h.x > 0.), abs(h.x) - 7., h.y, det, .06 + t * .02) * select(.4, 2.2, sg == sign(s.z)) * select(ss(6., 10., p.y + d.y * tb), 1., tb < 0. || p.x < -37.);
  }
  return c;
}
fn pl(p: V3, n: V3, L: V3, R2: f32) -> f32 {
  let d = L - p; let r2 = dot(d, d); let w = max(1. - r2 / R2, 0.);
  return w * w * (.3 + .7 * max(dot(n, d) * inverseSqrt(r2), 0.)) / (.5 + r2);
}
// wall sconces on every pilaster (two levels), plus the 8 free lights
fn lamps(p: V3, n: V3) -> V3 {
  let ax = abs(p.x); let az = abs(p.z); let up = p.y > 4.85;
  let ly = select(3.3, 8.3, up); let lo = select(4.08, 6.6, up);
  var s = 0.;
  if (az > 7. && ax < 7.4) {
    let b = floor((az - 7.) / 6.) * 6. + 7.; let sz = sign(p.z); let sx = sign(p.x);
    s = pl(p, n, V3(sx * lo, ly, sz * b), 17.) + pl(p, n, V3(sx * lo, ly, sz * (b + 6.)), 17.);
  } else if (ax > 7. && az < 7.4 && p.x < 37. && p.x > select(-37., -49., up)) {
    let b = floor((ax - 7.) / 6.) * 6. + 7.; let sz = sign(p.z); let sx = sign(p.x);
    s = pl(p, n, V3(sx * b, ly, sz * lo), 17.) + pl(p, n, V3(sx * (b + 6.), ly, sz * lo), 17.);
  }
  var c = V3(1., .6, .26) * s * 2.6;
  for (var i = 0; i < 8; i++) {
    let L = UB.l[i]; let d = L.p.xyz - p; let r2 = dot(d, d); let w = max(1. - r2 / (L.p.w * L.p.w), 0.);
    let fl = select(1., .88 + .12 * sin(G.time * 4.3) * sin(G.time * 2.9 + 1.), i == 3);      // the hearth breathes
    c += L.c.rgb * (fl * w * w * (.3 + .7 * max(dot(n, d) * inverseSqrt(r2), 0.)) / (.5 + r2));
  }
  return c;
}
// deep space outside: a tilted spiral galaxy toward the west (warm core, blue arms, dust lanes), nebulae, stars
fn sky(rd: V3) -> V3 {
  let gc = normalize(V3(-.9, .34, -.26)); let t1 = normalize(cross(gc, V3(0., 1., 0.))); let t2 = cross(t1, gc);
  let cz = dot(rd, gc); let n1 = fbm3(rd * 5. + 2., 4);
  var c = V3(.004, .006, .016); var disc = 0.;
  if (cz > .15) {
    var p = rot2(.45) * (V2(dot(rd, t1), dot(rd, t2)) / cz); p.y *= 2.4;
    let r = length(p) + .002; let sw = atan2(p.y, p.x) * 2. - 6.5 * log(r) + n1 * 1.3;
    let arm = .5 + .5 * cos(sw); let lane = ss(.35, .95, .5 + .5 * cos(sw + 1.7 + n1));
    disc = exp(-r * 2.6) * ss(.15, .4, cz);
    c += disc * (V3(.16, .3, .95) * (.15 + 1.9 * arm * arm) * (.6 + .6 * n1) + V3(.9, .25, .4) * pow(arm, 6.) * ss(-.1, .5, fbm3(rd * 17., 2)) * .7) * (1. - .8 * lane);
    c += V3(1., .68, .38) * (exp(-r * r * 70.) * 1.1 + exp(-r * 9.) * .45) * (1. - .5 * lane * ss(.05, .3, r));
  }
  c += V3(.5, .05, .3) * ss(.25, .9, fbm3(rd * 2.3 + 7., 3)) * .16 + V3(.02, .25, .35) * ss(.3, .9, n1 * .7 - rd.x * .6) * .1;
  for (var i = 0; i < 2; i++) {
    let sc = 70. + f32(i) * 90.; let q = rd * sc; let id = floor(q); let hh = hash33(id);
    let d = length(fract(q) - .5 - (hh - .5) * .6);
    c += mix(V3(.7, .8, 1.), V3(1., .8, .6), hh.y) * (pow(hh.z, 9.) * 5. * (1. + disc * 5.) * ss(.12, 0., d));
  }
  return c;
}
fn haze(c: V3, wp: V3) -> V3 {
  let d = distance(wp, G.camPos) * select(.0085, .004, wp.x > 37.6);
  return mix(c, FOGC, 1. - exp(-d * d));
}
