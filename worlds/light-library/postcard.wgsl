// Sanctuary of Light and Books: the spawn view down the nave (analytic hall section fading into golden haze).
fn pcLib_win(z: f32, y: f32, g: f32) -> vec3f {
  let a = abs(z) - 7.; let k = floor(a / 6.); let f = a - k * 6. - 3.; let v = y - 10.7;
  let d = min(max(abs(f) - 1.7, max(-v, v - 2.9)), length(vec2f(f, v - 2.9)) - 1.7);
  let h = mix(.5 + .13 * sin(k * .83 + v * .42), hash21(floor(vec2f(f + v, f - v) / .46) + k) * .9 + .9, step(.0, z));
  return hsv2rgb(vec3f(fract(h), .9, .9)) * smoothstep(.03, -.03, d) * step(.0, a) * g;
}
fn pcLib_books(z: f32, y: f32) -> vec3f {
  let b = hash21(floor(vec2f(z / .045, y / .39)));
  let l = abs(fract((abs(z) - 7.) / 6. + .5) - .5);
  return mix(mix(vec3f(.2, .09, .05), vec3f(.3, .2, .1), b) * (.25 + .3 * fract(y / .39)), vec3f(.55, .47, .4) * .34, step(l, .06))
    + vec3f(1., .6, .26) * .5 * exp(-(l * l * 36. + (y - 3.3) * (y - 3.3)) * 1.2);
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let o = vec3f(.0, 1.6, 25.);
  var c = vec3f(.3, .27, .23); var tt = 1e5;
  let ix = 1. / (abs(rd.x) + 1e-4);
  if (rd.y < -1e-3) {       // floor with the coloured light lying on its west half
    let tf = o.y / -rd.y; let p = o + rd * tf;
    if (abs(p.x) < 4.5) {
      tt = tf;
      let q = floor(vec2f(p.x + p.z, p.x - p.z) / .85); let e = exp(-tf * .05);
      c = mix(vec3f(.72, .66, .56), vec3f(.46, .34, .3), fract((q.x + q.y) * .5) * 2. * e + .5 * (1. - e)) * .3;
      let pz = p.z - 7.6;
      let m = smoothstep(1.7, 1.2, abs(fract(pz / 6.) * 6. - 3.)) * smoothstep(-4.6, -4.2, p.x) * smoothstep(-1.9, -2.4, p.x) * step(8., abs(p.z + 1.));
      c += hsv2rgb(vec3f(fract(hash21(floor(vec2f(p.x * 3. + pz * 2., pz * 3. - p.x * 2.))) * .9 + select(.45, .9, p.z > .0)), .85, 1.)) * m * 1.4;
    }
  }
  let t1 = 4.5 * ix; let p1 = o + rd * t1;           // lower shelves
  if (t1 < tt && p1.y < 5. && p1.y > .0 && abs(p1.z) > 7.) { tt = t1; c = pcLib_books(p1.z, p1.y); }
  let t2 = 7. * ix; let p2 = o + rd * t2;            // upper shelves, clerestory windows
  if (t2 < tt && p2.y >= 4.7 && p2.y < 15.4 && abs(p2.z) > 7.) {
    tt = t2;
    c = mix(pcLib_books(p2.z, p2.y - 5.), vec3f(.26, .23, .2), step(9.3, p2.y));
    let w = pcLib_win(p2.z, p2.y, mix(.4, 2.1, step(.0, rd.x)));
    c = mix(c, w, step(.01, w.r + w.g + w.b));
  }
  let oy = o.y - 15.4; let A = rd.x * rd.x + rd.y * rd.y; let B = oy * rd.y;      // frescoed vault, the dome over the crossing
  let t3 = (-B + sqrt(max(B * B - A * (oy * oy - 49.), .0))) / max(A, 1e-5); let p3 = o + rd * t3;
  if (t3 < tt && p3.y >= 15.4) {
    tt = t3;
    let u = atan2(p3.y - 15.4, p3.x) / PI; let vz = fract((abs(p3.z) - 7.) / 6.);
    c = mix(mix(vec3f(.22, .42, .78), vec3f(1., .66, .5), smoothstep(.1, .5, abs(u - .5) + abs(vz - .5) * .5)), vec3f(1., .93, .8), smoothstep(.0, .4, fbm2(vec2f(u * 6.5, p3.z * .35), 3))) * .42;
    c = mix(c, vec3f(.5, .42, .3), step(.44, abs(vz - .5)));
    if (abs(p3.z) < 7.) { c = vec3f(.03, .06, .2); }
  }
  let d = tt * .0105;
  c = mix(c, vec3f(.5, .33, .15), 1. - exp(-d * d));
  let oc = max(dot(rd, normalize(vec3f(.0, 9., .0) - o)), .0);                  // the orrery
  return c + vec3f(1., .55, .16) * (pow(oc, 9000.) * 6. + pow(oc, 300.) * .5 + pow(oc, 30.) * .08 * (.9 + .1 * sin(t * .3)));
}
