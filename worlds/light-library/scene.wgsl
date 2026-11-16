// Opaque and blended surfaces. One vertex format (pos, nrm, uv, col+mat), instanced with an affine 3x4 and 4 params.
struct VI { @location(0) pos: V3, @location(1) nrm: V3, @location(2) uv: V2, @location(3) col: V4,
  @location(4) m0: V4, @location(5) m1: V4, @location(6) m2: V4, @location(7) par: V4 };
struct VO { @builtin(position) @invariant pos: V4, @location(0) wp: V3, @location(1) n: V3, @location(2) uv: V2,
  @location(3) col: V3, @location(4) @interpolate(flat) mi: V4, @location(5) lp: V3 };

@vertex fn vs(in: VI) -> VO {
  var o: VO;
  let mg = i32(in.col.w + .5); let mat = mg & 31; let grp = mg >> 5;
  var p = in.pos;
  if (mat == 13) { p += in.nrm * (.014 * (.5 + .5 * sin(G.time * 1.2)) * in.uv.x); }      // the cat breathes
  let q = V4(p, 1.);
  o.wp = V3(dot(in.m0, q), dot(in.m1, q), dot(in.m2, q));
  o.n = V3(dot(in.m0.xyz, in.nrm), dot(in.m1.xyz, in.nrm), dot(in.m2.xyz, in.nrm));
  if (mat == 25) { o.wp += (G.camRight * in.uv.x + G.camUp * in.uv.y) * in.col.r; }
  o.pos = G.viewProj * V4(o.wp, 1.);
  if (grp > 0 && (u32(in.par.z) & (1u << u32(grp - 1))) != 0u) { o.pos = V4(0., 0., -1., 1.); }
  o.uv = in.uv; o.col = in.col.rgb; o.lp = in.pos;
  o.mi = V4(f32(mat), in.par.x, in.par.y, in.par.z);
  return o;
}

struct BK { c: V3, ao: f32, tilt: f32, gold: f32 };
fn leather(h: f32) -> V3 {
  var c = array<V3, 8>(V3(.3, .035, .03), V3(.2, .09, .04), V3(.42, .27, .13), V3(.04, .13, .07),
    V3(.035, .06, .17), V3(.6, .52, .36), V3(.035, .03, .03), V3(.24, .03, .09));
  return c[u32(h * 8.) & 7u];
}
// a wall of book spines: variable widths and heights, sets of volumes, leaning groups, gaps
fn books(uv: V2, seed: f32, fw: f32, fv: f32) -> BK {
  var o: BK; o.tilt = 0.; o.gold = 0.; o.ao = 1.;
  let RH = .39; let row = floor(uv.y / RH); let ry = uv.y - row * RH; let sd = seed + row * 7.;
  let gx = floor(uv.x / .9); let gh = hash21(V2(gx, sd));
  let lean = select(0., (gh - .88) * 2., gh > .88);
  let x = (uv.x + lean * (ry - .03)) / .043; let i = floor(x);
  let n = select(i - 1., i, x >= i + .55 * hash21(V2(i, sd)));
  let l = n + .55 * hash21(V2(n, sd)); let r = n + 1. + .55 * hash21(V2(n + 1., sd));
  let fx = (x - l) / (r - l);
  let h = hash22(V2(n, sd + 3.));
  let sh = hash22(V2(floor(n / 7.), sd + 9.)); let inset = sh.x > .6;
  let hc = select(h.x, sh.y, inset); let hh = select(h.y, fract(sh.y * 7.3), inset);
  let top = .03 + .2 + .12 * hh + .015 * (r - l);
  let empty = !inset && fract(h.x * 31.) < .035;
  let df = 1. - ss(.004, .016, fw);
  let avg = V3(.17, .085, .045) * (.75 + .5 * gh);
  var c = leather(hc) * (.75 + .5 * fract(h.y * 5.));
  let t = (ry - .03) / (top - .03);
  let lab = step(.58, t) * step(t, .78) * step(.1, fx) * step(fx, .9) * step(.4, fract(hc * 9.));
  c = mix(c, mix(V3(.55, .45, .28), V3(.25, .02, .02), step(.6, fract(hc * 17.))), lab);
  let band = max(step(abs(t - .115), .016), step(abs(t - .875), .016)) + lab * step(abs(fract(t * 28.) - .5), .1) * step(.2, fx) * step(fx, .8);
  o.gold = clamp(band, 0., 1.) * df * step(.25, fract(hc * 3.));
  c = mix(c, V3(.85, .6, .2), o.gold);
  c *= 1. - .3 * step(abs(fract(t * 5. + .5) - .5), .06) * step(t, .56);
  let e = min(fx, 1. - fx) * (r - l) * .043;
  o.ao = mix(.25, 1., ss(0., .007, e));
  o.tilt = (fx - .5) * 1.4 * df;
  if (ry > top || empty) { c = V3(.012, .008, .006); o.ao = 1.; o.tilt = 0.; o.gold = 0.; }
  let fc = V2(floor(uv.x / .13), sd);
  let far = mix(avg, leather(hash21(fc + 1.)), .6) * (.55 + .9 * hash21(fc)) * ss(.38, .24 + .1 * hash21(fc + 2.), ry);
  c = mix(far, c * o.ao, df); o.ao = mix(.8, 1., df);
  o.ao *= mix(.4, 1., ss(RH, RH - .11, ry));
  if (ry < .03) { c = V3(.26, .14, .065) * (.7 + .6 * ss(.012, .03, ry)); o.ao = 1.; o.tilt = 0.; o.gold = 0.; }
  o.c = mix(c, avg * .8, ss(.08, .3, fv));
  return o;
}
fn lines(x: f32, w: f32, e: f32) -> f32 { return 1. - ss(w, w + e, abs(fract(x) - .5)); }   // line at half-integers
// soft contact shadows of the hall section (a = across distance from the axis)
fn hallAO(p: V3) -> f32 {
  let ax = abs(p.x); let az = abs(p.z);
  if ((ax < 7. && az < 7.) || p.x > 37. || p.x < -37.) { return 1.; }
  let a = select(az, ax, az > 7.);
  var o = mix(.5, 1., ss(0., 1.1, length(V2(4.5 - a, p.y))));
  o *= mix(.55, 1., ss(0., 1., length(V2(7. - a, p.y - 5.)) + step(p.y, 4.9) * 9.));
  o *= mix(.6, 1., ss(0., .7, abs(4.7 - p.y) + step(4.6, a) + step(4.7, p.y)));
  o *= mix(.6, 1., ss(0., .8, abs(9.8 - p.y) + step(9.8, p.y)));
  return o;
}

fn shade(in: VO, front: bool, fw3: V3) -> V4 {
  let fwu = fw3.x;
  let mat = i32(in.mi.x + .5);
  var n = normalize(in.n + V3(0., 1e-6, 0.)); if (!front) { n = -n; }
  let wp = in.wp; let vv = G.camPos - wp; let dist = length(vv); let v = vv / dist;
  let fwp = dist * G.tanHalfFov * 2. * G.invResolution.y;
  let near = 1. - ss(14., 30., dist);
  var alb = in.col; var emit = V3(0.); var ao = 1.; var spec = 0.; var shin = 24.; var refl = 0.; var metal = 0.;
  var amb = 1.; var alpha = 1.;
  let uv = in.uv; let k = in.mi.y; let arm = i32(in.mi.z + .5);
  switch mat {
    case 0, 15: {      // plaster, stone
      let g = snoise3d(wp * select(19., 11., mat == 15));
      n = normalize(n + g.xyz * (.02 + .03 * f32(mat == 15)) * near);
      alb *= .92 + .08 * g.w + .06 * vnoise3(wp * .7);
      if (mat == 15) {
        if (n.y > .8) { let q = wp.xz / V2(1.4, .9) + V2(0., .5 * floor(wp.x / 1.4)); alb *= (.8 + .3 * hash21(floor(q))) * (1. - .45 * lines(q.x + .5, .012, fwp) - .45 * lines(q.y + .5, .02, fwp)); }
        else if (wp.x > 38. && abs(n.y) < .5) {       // ashlar courses, ivy creeping down the court walls
          let w = V2(wp.x + wp.z, wp.y);
          let q = V2(w.x / 1.3 + .5 * floor(w.y / .55), w.y / .55);
          alb *= (.82 + .3 * hash21(floor(q))) * (1. - .5 * near * max(lines(q.x + .5, .012, fwp), lines(q.y + .5, .03, fwp * 2.)));
          let iv = fbm2(w * .3, 3) * .8 + (wp.y - 6.) * .1;
          let lf = snoise3d(wp * 26.);
          let m = ss(-.25, .15, lf.w * .6 + iv * 2.);
          alb = mix(alb, V3(.035, .16, .03) * (.6 + .9 * vnoise3(wp * 60.)) * (.7 + .6 * ss(-.5, .6, lf.w)), m); n = normalize(n + lf.xyz * .7 * m);
        }
      }
      ao = hallAO(wp);
    }
    case 1: {          // gold
      n = normalize(n + (hash33(floor(wp * 60.)) - .5) * .08 * near);
      metal = 1.; spec = 1.; shin = 50.; refl = .45;
    }
    case 2: {          // polished walnut
      let w = vnoise3(wp * V3(1.3, 1.3, 1.3)) * 7. + vnoise3(wp * 40.) * .25;
      alb *= .72 + .4 * abs(fract(w) - .5) + .1 * vnoise3(wp * 11.);
      if (n.y > .9) { let q = V2(wp.x + wp.z, wp.x - wp.z) * .707; let pk = V2(q.x / .13, q.y / .8 + .37 * floor(q.x / .13));
        alb *= (.8 + .4 * hash21(floor(pk))) * (1. - .5 * near * max(lines(pk.x + .5, .03, fwp * 8.), lines(pk.y + .5, .006, fwp * 1.3))); }
      spec = .35; shin = 60.; refl = .12; ao = hallAO(wp);
    }
    case 3: {          // marble floor
      let q = V2(wp.x + wp.z, wp.x - wp.z) / .85; let id = floor(q); let l = abs(fract(q) - .5);
      let par = mix(step(.25, fract((id.x + id.y) * .5)), .5, ss(.12, .4, fwp * 4.));
      alb = mix(V3(.72, .66, .56), V3(.46, .34, .3), par);
      let vn = snoise2(wp.xz * .8 + id * 3.1);
      alb *= .88 + .14 * vnoise2(wp.xz * 2.3 + id * 1.7) - .2 * (1. - ss(0., .06, abs(vn))) * near;
      alb *= 1. - .45 * ss(.48 - fwp * 2., .5, max(l.x, l.y)) * near;
      let ax = abs(wp.x); let az = abs(wp.z);
      let a = select(select(az, ax, az > 7.), 0., (ax < 7. && az < 7.) || ax > 37.);
      alb = mix(alb, V3(.1, .075, .065) * (.9 + .3 * vn), ss(3.84, 3.86 + fwp, a));
      var gd = 1. - ss(.035, .035 + fwp, abs(a - 3.82));
      let r = length(wp.xz);
      if (r < 6.2) {     // compass rose under the orrery
        let an = atan2(wp.z, wp.x) * 8. / PI; let fa = fract(an) - .5; let big = step(.5, fract(an * .5));
        let rs = mix(1.2, mix(3.4, 5., big), pow(1. - abs(fa) * 2., 1.6));
        let st = ss(rs + fwp, rs - fwp, r);
        alb = mix(alb, mix(V3(.09, .07, .07), V3(.8, .72, .58), step(0., fa)), st);
        gd = max(gd, max(1. - ss(.05, .05 + fwp, abs(r - 5.6)), 1. - ss(.03, .03 + fwp, abs(r - 1.2))));
      }
      alb = mix(alb, V3(.85, .58, .18), gd); metal = gd * .6;
      n = normalize(n + V3(vn, 0., vnoise2(wp.xz * 3.)) * .004);
      spec = .25; shin = 90.; refl = .7; ao = hallAO(wp);
    }
    case 4: {          // bookshelves
      let b = books(uv, floor(uv.x / 10.) * 13. + k * 37. + f32(arm) * 101., fw3.y, fw3.z);
      let t = normalize(cross(V3(0., 1., 0.), n));
      n = normalize(n + t * b.tilt);
      alb = b.c; ao = b.ao; spec = .12 + b.gold * .9; shin = 30.; metal = b.gold * .5;
    }
    case 5: {          // frescoed vault panel: clouds in a painted sky, gilded stucco frame
      let c2 = V2(uv.x - .5, uv.y - .5);
      let ed = min(.5 - abs(c2.x) - .045, (.5 - abs(c2.y)) * .28 - .02);
      let sd = k * 3.7 + f32(arm) * 11.;
      let q = V2(uv.x * 5., uv.y * 1.6) + sd;
      let cl = fbm2(q * 1.3, 4); let c3 = fbm2(q * .6 + 7., 2);
      var za = array<V3, 4>(V3(.22, .42, .78), V3(.16, .45, .72), V3(.34, .26, .6), V3(.1, .13, .4)); let zen = za[arm & 3];
      var ha = array<V3, 4>(V3(1., .66, .5), V3(.8, .86, .8), V3(1., .5, .25), V3(.6, .36, .6)); let hor = ha[arm & 3];
      var c = mix(zen, hor, ss(.1, .52, length(c2 * V2(1., .8)) + c3 * .15));
      c = mix(c, mix(V3(.62, .5, .62), V3(1., .93, .8), ss(-.2, .5, cl + c3)), ss(-.05, .4, cl));
      c += V3(1., .75, .4) * exp(-dot(c2, c2) * 22.) * .35;
      c *= .9 + .1 * vnoise2(uv * V2(260., 80.));
      let fr = ss(0., .004, -ed); let gl = ss(.03, .026, abs(ed + .018));
      alb = mix(c, mix(V3(.78, .72, .62), V3(.85, .58, .18), gl), fr);
      metal = fr * gl * .7; spec = metal; amb = 1.5; ao = mix(.8, 1., ss(0., .05, ed));
    }
    case 6, 21: {      // stained glass
      var c: V3;
      if (mat == 21) { c = fan(uv / 2.8, 16., 3., 1., fwu / 2.8) * ss(2.8, 2.78, length(uv)); }
      else { c = pane(arm, k, uv.x, uv.y, 1., fwu); }
      let sunny = dot(n, G.sunDir) < 0.;
      let hot = pow(max(dot(-v, G.sunDir), 0.), 60.);
      emit = c * select(.4 + 2. * luminance(sky(-v)), 2.1 + 9. * hot, sunny);
      alb = V3(.02); spec = .3; shin = 80.;
    }
    case 7: {          // lamp glass: hot core, softer rim
      let f = max(dot(n, v), 0.);
      emit = alb * (1.5 + 7. * f * f) * (1. + .05 * sin(G.time * 1.7 + wp.x * 3. + wp.z));
      alb = V3(0.);
    }
    case 8: {          // clear glass: the galaxy outside, gold tracery
      var ln = 0.; let ty = in.col.r;
      if (ty < .5) {
        ln = max(lines(uv.x + .5, .03, fwu), lines(uv.y / 1.6 + .5, .02, fwu));
        let w = V2(uv.x, uv.y - 7.8);
        if (w.y > 0.) { let an = atan2(w.y, w.x) / PI * 8.; ln = max(max(lines(an + .5, .04 / max(length(w), .3), fwu * .4), lines(length(w) / 1.4 + .5, .025, fwu)), step(length(w), .5)); }
      } else if (ty < 1.5) { ln = max(lines(uv.x / 1.25 + .5, .045, fwu), lines(uv.y / 1.25 + .5, .045, fwu)); }
      else { let an = atan2(uv.y, uv.x) / PI * 6.; ln = max(lines(an + .5, .03 / max(length(uv), .3), fwu), lines(length(uv) / 1.05 + .5, .03, fwu)); }
      emit = sky(-v) * (1. - ln) * 1.25;
      alb = V3(.85, .58, .18) * ln; metal = ln; spec = ln; refl = ln * .3;
    }
    case 9, 17: {      // pages (17: being written right now)
      let rw = floor(uv.y * 19.); let fy = fract(uv.y * 19.);
      let word = step(.22, hash21(V2(floor(uv.x * 13. + rw * 3.), rw + k)));
      var ink = step(.3, fy) * step(fy, .62) * word * step(.1, uv.x) * step(uv.x, .9) * step(1., rw) * step(rw, 17.);
      ink *= .5 + .5 * step(.35, hash21(floor(uv * V2(90., 19.))));
      if (mat == 17) {
        let pr = fract(G.time / 120.) * 17.; let cur = (17. - rw) + (uv.x - .1) / .8 - pr;
        ink *= step(cur, 0.);
        emit = V3(1., .6, .15) * ink * 3. * exp(cur * 4.);
      }
      alb = V3(.74, .68, .54) * (.9 + .1 * vnoise2(uv * 30.)) * (1. - .85 * ink * (1. - ss(.01, .04, fwu)));
      alb *= .6 + .4 * ss(0., .12, uv.x);
    }
    case 10: {         // velvet
      alb *= .8 + .3 * vnoise3(wp * 30.);
      emit = alb * pow(1. - max(dot(n, v), 0.), 2.5) * .35;
    }
    case 11: {         // carpet (uv -1..1)
      let r = length(uv); let an = atan2(uv.y, uv.x);
      let pet = .5 + .5 * cos(an * 12.);
      var c = mix(V3(.3, .025, .03), V3(.03, .05, .2), ss(.02, 0., abs(r - .45 - .07 * pet) - .06));
      c = mix(c, V3(.6, .42, .16), ss(.02, 0., abs(r - .2 - .05 * pet) - .012) + ss(.012, 0., abs(abs(r - .86) - .05) - .008));
      c = mix(c, V3(.5, .36, .2), step(.25, hash21(floor(uv * 40.))) * step(.72, r) * step(r, .8) * (.5 + .5 * cos(an * 48.)));
      alb = c * (.5 + .3 * hash21(floor(uv * 300.)));
    }
    case 12: {         // foliage
      let g = snoise3d(wp * 17.); let g2 = vnoise3(wp * 70.);
      n = normalize(n + g.xyz * 1.1);
      alb *= (.55 + .5 * g2) * mix(.35, 1.2, ss(-.6, .5, g.w));
      let fl = step(.99, hash31(floor(wp * 24.))) * near;
      alb = mix(alb, V3(.9, .4, .5), fl);
      spec = .15; amb = 1.3;
    }
    case 13: {         // the cat
      let s = sin(in.lp.x * 38. + vnoise3(in.lp * 14.) * 5.);
      alb *= .7 + .3 * ss(-.4, .4, s) + .15 * vnoise3(in.lp * 160.);
      emit = alb * pow(1. - max(dot(n, v), 0.), 2.) * .5;
    }
    case 14: {         // spheres: 0 old globe, 1 planet, 2 the orrery sun, 3 celestial globe
      let d = normalize(in.lp); let ty = arm; let la = asin(clamp(d.y, -1., 1.)); let lo = atan2(d.z, d.x);
      let grat = max(lines(la * 12. / PI + .5, .03, fwp * 6.), lines(lo * 12. / PI + .5, .03 / max(cos(la), .2), fwp * 6.));
      if (ty == 0) {
        let land = ss(.02, .08, fbm3(d * 2.1 + k, 4));
        alb = mix(V3(.2, .34, .33), V3(.62, .48, .25) * (.75 + .4 * vnoise3(d * 9.)), land) * (1. - .5 * grat);
        spec = .5; shin = 70.; refl = .1;
      } else if (ty == 1) {
        let b = sin(la * (6. + k) + 1.2 * vnoise3(d * V3(2., 7., 2.) + k));
        alb = hsv2rgb(V3(fract(in.mi.w + .04 * b), .55, .75 + .2 * b));
        spec = .2; amb = 1.6;
      } else if (ty == 2) {
        let f = max(dot(n, v), 0.);
        emit = V3(1., .55, .16) * (2. + 8. * f * f) * (.85 + .25 * fbm3(d * 4. + G.time * .05, 3)); alb = V3(0.);
      } else {
        let q = d * 6.; let id = floor(q); let hh = hash33(id);
        let st = ss(.08, .03, length(fract(q) - .5 - (hh - .5) * .5)) * step(.6, hh.z);
        alb = V3(.02, .045, .16) * (.8 + .4 * vnoise3(d * 3.));
        let gd = max(grat, st); alb = mix(alb, V3(.85, .58, .18), gd); emit = V3(1., .7, .3) * st * .6 + V3(.03, .08, .25);
        metal = gd; spec = .7; shin = 80.; refl = .2;
      }
    }
    case 16: {         // the dome: a night-blue star chart
      let r = length(uv);
      alb = mix(V3(.035, .07, .24), V3(.012, .025, .11), ss(.3, 1.2, r)) * (.85 + .3 * vnoise2(uv * 9.));
      let q = uv * 11.; let id = floor(q); let hh = hash22(id); let c = fract(q) - .5 - (hh - .5) * .6;
      let st = ss(.07 + .08 * hh.x, 0., length(c) + .6 * min(abs(c.x), abs(c.y)) * step(.6, hh.y)) * step(.35, hh.x);
      let an = atan2(uv.y, uv.x) / PI * 8.;
      let gd = max(max(st, lines(an + .5, .012 / max(r, .2), fwu)), max(lines(r * 2.2 + .5, .012, fwu * 2.2), ss(.455, .445, r)));
      alb = mix(alb, V3(.85, .58, .18), gd); emit = V3(1., .7, .3) * st * .8;
      metal = gd * .8; spec = gd; amb = 1.7;
    }
    case 18: {         // embers
      let f = fbm3(V3(wp.x * 4., wp.y * 3. - G.time * .25, G.time * .12), 3) * .5 + .5;
      let hgt = ss(1.1, 0., uv.y) * ss(.5, .2, abs(uv.x - .5));
      emit = V3(1., .33, .06) * pow(f * hgt * 1.7, 2.5) * 5. + V3(.25, .03, 0.) * hgt; alb = V3(.01);
    }
    case 19: {         // vault ribs: cream with gilded edges and rosettes
      let e = abs(uv.x - .5);
      let ro = length(V2(e * .6, fract(uv.y / 1.1) - .5) * V2(1., 1.1));
      let gd = max(ss(.36, .38, e) * ss(.47, .45, e), ss(.1, .09, ro) * step(.045, ro) + ss(.03, .025, ro));
      alb = mix(alb, V3(.85, .58, .18), gd * near + .3 * (1. - near)); metal = gd * near; spec = metal; amb = 1.3;
    }
    case 20: {         // floating book cover
      alb = leather(in.mi.w) * 1.4; spec = .3;
      let b = max(abs(uv.x - .5), abs(uv.y - .5));
      let gd = ss(.015, 0., abs(b - .42)) + ss(.02, 0., abs(length(uv - .5) - .16));
      alb = mix(alb, V3(.85, .58, .18), gd); metal = gd; spec += gd;
    }
    case 24: {         // gilded railing lattice (blended)
      let q = V2(uv.x + uv.y, uv.x - uv.y) / .21; let l = abs(fract(q) - .5);
      let e = fwu / .21 * 1.5;
      var a = max(ss(.43 - e, .43 + e, max(l.x, l.y)), ss(.17 + e, .17 - e, length(l)) * ss(.1 - e, .1 + e, length(l)));
      a = max(a, ss(.035 + fwu, .035, min(uv.y, .92 - uv.y)));
      alpha = mix(a, .42, ss(.03, .1, fwu));
      alb = V3(.85, .58, .18); metal = 1.; spec = .8; shin = 40.; refl = .3;
    }
    case 26: {         // fountain water (blended)
      let w = wp.xz * 3.; let t = G.time * .5;
      let g = V2(snoise2(w + V2(t, .3 * t)) + .5 * snoise2(w * 2.3 - t), snoise2(w.yx - V2(.4 * t, t)) + .5 * snoise2(w.yx * 2.3 + t));
      n = normalize(V3(g.x * .09, 1., g.y * .09));
      let f = .04 + .96 * pow(1. - max(dot(n, v), 0.), 5.);
      let r = reflect(-v, n);
      emit = (sky(r) * 1.3 + roofLight((wp + r * (13. - wp.y) / max(r.y, .05)).xz, .1) * .9) * f + V3(.01, .07, .08);
      alb = V3(.02, .1, .1); alpha = .55 + .45 * f; spec = 1.; shin = 200.;
    }
    default: {}
  }
  // light
  let sun = sunAt(wp, 1.) * (SUNC * SUNI);
  let s = G.sunDir;
  let lam = lamps(wp, n);
  let tint = mix(V3(1.), mix(mix(V3(1., .86, .72), V3(.72, .95, .92), step(wp.z, 0.)), mix(V3(1., .8, .58), V3(.84, .76, 1.), step(wp.x, 0.)), step(abs(wp.z), 7.)), ss(5., 16., max(abs(wp.x), abs(wp.z))));
  var L = mix(V3(.15, .12, .095), V3(.27, .245, .21), n.y * .5 + .5) * tint * (amb * ao);
  if (wp.x > 37.6) { L += V3(.08, .1, .13) * (.5 + .5 * n.y) * ao; }
  L += sun * wrapDiffuse(n, s, .25) + lam * mix(ao, 1., .5);
  var c = alb * L * (1. - metal * .75) + emit;
  let r = reflect(-v, n);
  if (spec > 0.) {
    let sc = mix(V3(1.), alb, metal);
    c += sc * spec * (sun * specBlinn(n, s, v, shin) * .4 + lamps(wp, r) * 1.2 * mix(1., 2.5, metal));
    c += sc * metal * mix(V3(.035, .025, .015), V3(.42, .36, .27) * tint, ss(-.4, .9, r.y)) * ao;
  }
  if (refl > 0.) {
    let f = mix(.035 + .965 * pow(1. - max(dot(n, v), 0.), 5.), 1., metal);
    c += winEmit(wp, r, 0.) * mix(V3(1.), alb, metal) * (f * refl * .8);
  }
  return V4(haze(c, wp) * alpha, alpha);
}
@fragment fn fsPre() -> @location(0) V4 { return V4(0.); }
fn fwOf(uv: V2) -> V3 { let a = dpdx(uv); let b = dpdy(uv); return V3(max(length(a), length(b)), length(V2(a.x, b.x)), length(V2(a.y, b.y))); }
@fragment fn fs(in: VO, @builtin(front_facing) ff: bool) -> @location(0) V4 { return shade(in, ff, fwOf(in.uv)); }
// blended surfaces: railings, water (premultiplied) and lamp halos (additive)
@fragment fn fsT(in: VO, @builtin(front_facing) ff: bool) -> @location(0) V4 {
  let fw = fwOf(in.uv);
  if (i32(in.mi.x + .5) == 25) {
    let d = length(in.uv); let g = exp(-d * d * 5.) * .5 + exp(-d * d * 40.) * 1.2;
    let f = 1. - exp(-pow(distance(in.wp, G.camPos) * .0105, 2.));
    return V4(V3(1., .55, .2) * (g * ss(1., .6, d) * in.col.g * (1. - f)), 0.);
  }
  return shade(in, ff, fw);
}

// ---- floating books: two hinged halves and one turning page ----
struct BI { @location(0) pos: V3, @location(1) nrm: V3, @location(2) uv: V2,
  @location(3) bx: V4, @location(4) by: V4, @location(5) bz: V4, @location(6) bp: V4 };
@vertex fn vsBook(in: BI) -> VO {
  var o: VO;
  let side = in.uv.x; let part = in.uv.y; let open = in.bx.w;
  var phi = (1. - open) * 1.52; var s = side;
  if (part > 1.5) { phi = mix(phi, PI - phi, in.by.w); s = 1.; }
  let cs = cos(phi); let sn = sin(phi);
  var l = V3((in.pos.x * cs - in.pos.y * sn) * s, in.pos.x * sn + in.pos.y * cs, in.pos.z);
  if (part > 1.5) { l.y += .012 * sin(in.pos.x * 15.) * sin(in.by.w * PI); }
  let nl = V3((in.nrm.x * cs - in.nrm.y * sn) * s, in.nrm.x * sn + in.nrm.y * cs, in.nrm.z);
  o.wp = in.bp.xyz + in.bx.xyz * l.x + in.by.xyz * l.y + in.bz.xyz * l.z;
  o.n = in.bx.xyz * nl.x + in.by.xyz * nl.y + in.bz.xyz * nl.z;
  o.pos = G.viewProj * V4(o.wp, 1.);
  o.uv = V2(in.pos.x / .2, in.pos.z / .3 + .5); o.lp = in.pos;
  o.col = V3(open * in.bp.w);
  o.mi = V4(select(20., 9., part > .5), in.bz.w * 50., 0., in.bz.w);
  return o;
}
@fragment fn fsBook(in: VO, @builtin(front_facing) ff: bool) -> @location(0) V4 {
  var c = shade(in, ff, fwOf(in.uv));
  if (in.mi.x > 10.) { return c; }
  return V4(c.rgb + V3(1., .72, .36) * in.col.r * .4, 1.);      // the open pages glow
}

// ---- paper birds: folded pages gliding through the halls ----
struct BO { @builtin(position) pos: V4, @location(0) uv: V2, @location(1) c: V3, @location(2) wp: V3 };
fn birdPos(i: u32, t: f32) -> V3 {
  let h = hash3u(vec3u(i, 7u, 3u)); let f = i % 3u;
  let a = t * (.035 + .02 * h.x) + h.y * 40. + f32(i) * .21;
  var p: V3;
  if (f == 0u) { p = V3(2.8 * sin(a * 2.3 + h.z * 6.), 10.5 + 2.6 * sin(a * 1.7 + h.x * 9.), 46. * sin(a)); }
  else if (f == 1u) { let r = 4.2 + 2.2 * sin(a * 1.3 + h.z * 6.); p = V3(r * cos(a * 3.), 13.5 + 3.5 * sin(a * 1.1 + h.x * 5.), r * sin(a * 3.)); }
  else { let r = 3.5 + 3. * sin(a * 2.1 + h.z * 6.); p = V3(47. + r * cos(a * 4.), 5.5 + 2.5 * sin(a * 2.7 + h.x * 5.), r * sin(a * 4.)); }
  return p + (h - .5) * V3(1.6, 1.4, 1.6);
}
@vertex fn vsBird(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  var o: BO;
  let p0 = birdPos(ii, G.time); let fw = normalize(birdPos(ii, G.time + .4) - p0);
  let rt = normalize(cross(fw, V3(0., 1., 0.))); let up = cross(rt, fw);
  let tri = vi / 3u; let c = vi % 3u; let sd = select(-1., 1., tri < 2u); let tip = (tri & 1u) == 1u;
  // corners: 0 nose, 1 tail, 2 wing mid, 3 wing tip
  var id = c; if (tip) { id = select(c + 1u, 0u, c == 0u); if (c == 1u) { id = 2u; } if (c == 2u) { id = 3u; } }
  let hh = hash1u(ii * 31u + 5u);
  let fl = sin(G.time * (5. + 2. * hh) + hh * 40.) * (.35 + .35 * sin(G.time * .31 + hh * 20.)) + .25;
  var l = V3(0., 0., .17); var u = V2(0., 0.);
  if (id == 1u) { l = V3(0., 0., -.15); u = V2(0., 1.); }
  if (id == 2u) { l = V3(.15 * cos(fl), .15 * sin(fl), -.03); u = V2(.5, .6); }
  if (id == 3u) { l = V3(.15 * cos(fl) + .17 * cos(fl * 1.7), .15 * sin(fl) + .17 * sin(fl * 1.7), -.12); u = V2(1., 1.); }
  o.wp = p0 + (rt * (l.x * sd) + up * l.y + fw * l.z) * 1.25;
  o.pos = G.viewProj * V4(o.wp, 1.); o.uv = u;
  o.c = sunAt(p0, 0.) * 2. + lamps(p0, up) * .6;
  return o;
}
@fragment fn fsBird(in: BO) -> @location(0) V4 {
  let ink = step(.5, fract(in.uv.y * 9.)) * step(.15, in.uv.x) * .25;
  let c = V3(.9, .78, .55) * (.4 + in.c) * (1. - ink) + V3(1., .62, .28) * (.2 + .5 * in.uv.x);
  return V4(haze(c, in.wp), 1.);
}
