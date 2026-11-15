// Nebula sky: baked at load into two cubemaps (far emission + mid "wisp" shell with alpha), composited per frame
// with parallax shells and procedural, pixel-stable stars.
const CORE = vec3f(-0.316, 0.163, -0.935);   // warm nebula core (also the "sun" direction)
const GAL = vec3f(0.545, 0.300, 0.783);      // giant spiral galaxy landmark

fn aoFaceDir(face: u32, uv: vec2f) -> vec3f {
  let u = uv.x; let v = uv.y;
  switch face {
    case 0u: { return normalize(vec3f(1.0, -v, -u)); }
    case 1u: { return normalize(vec3f(-1.0, -v, u)); }
    case 2u: { return normalize(vec3f(u, 1.0, v)); }
    case 3u: { return normalize(vec3f(u, -1.0, -v)); }
    case 4u: { return normalize(vec3f(u, -v, 1.0)); }
    default: { return normalize(vec3f(-u, -v, -1.0)); }
  }
}

fn aoBasis(n: vec3f) -> mat3x3f {
  let a = normalize(cross(n, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(n.y) > 0.9)));
  return mat3x3f(a, cross(n, a), n);
}

fn aoSpiral(d: vec3f) -> vec3f {
  let c = dot(d, GAL);
  if (c < 0.9) { return vec3f(0.0); }
  // tangent-plane coordinates, tilted disc
  let B = aoBasis(GAL);
  var p = vec2f(dot(d, B[0]), dot(d, B[1])) / c;
  let ca = cos(0.5); let sa = sin(0.5);
  p = vec2f(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
  p.y /= 0.52;
  p /= 0.2;
  let r = length(p);
  let th = atan2(p.y, p.x);
  let lr = log(max(r, 1e-3));
  let n = fbm2(p * 7.0, 4);
  let arm = pow(0.5 + 0.5 * cos(2.0 * th - 4.6 * lr + n * 0.9), 3.0);
  let arm2 = pow(0.5 + 0.5 * cos(2.0 * th - 4.6 * lr - 0.55 + n * 0.6), 6.0);
  let disc = exp(-r * 2.6) * smoothstep(1.25, 0.6, r);
  let bulge = exp(-r * r * 60.0) * 2.2 + exp(-r * 9.0) * 0.6;
  let knots = smoothstep(0.35, 0.8, fbm2(p * 22.0 + 3.0, 3)) * arm;
  var col = vec3f(1.6, 1.2, 0.75) * bulge;
  col += mix(vec3f(0.35, 0.45, 1.1), vec3f(0.7, 0.55, 1.1), r) * disc * (0.12 + arm * 1.1);
  col += vec3f(1.4, 0.45, 0.9) * knots * disc * 1.4;
  col *= 1.0 - 0.75 * arm2 * smoothstep(0.08, 0.3, r) * disc * 2.0;   // dust lanes on the inner arm edge
  return col * 0.55 * smoothstep(0.9, 0.93, c);
}

fn aoFar(d: vec3f) -> vec3f {
  var q = d * 1.7;
  q += vec3f(fbm3(q * 1.1 + 1.7, 4), fbm3(q * 1.1 + 9.2, 4), fbm3(q * 1.1 + 4.4, 4)) * 0.55;
  let n = fbm3(q, 7) * 0.5 + 0.5;
  let band = exp(-pow(dot(d, vec3f(0.947, 0.0, -0.320)) / 0.5, 2.0));
  let cw = max(dot(d, CORE), 0.0);
  let core = pow(cw, 6.0);
  let zen = pow(max(dot(d, normalize(vec3f(-0.2, 1.0, -0.3))), 0.0), 2.5);
  var dens = pow(smoothstep(0.42 - 0.12 * zen, 0.95, n), 1.4) * (0.06 + 1.0 * band + 1.2 * core + 1.3 * zen);
  let hue = fbm3(q * 0.6 + 11.0, 3) * 0.5 + 0.5;
  let viol = vec3f(0.24, 0.08, 0.55);
  let mag = vec3f(0.62, 0.07, 0.42);
  let teal = vec3f(0.03, 0.34, 0.48);
  let blue = vec3f(0.05, 0.1, 0.5);
  var col = mix(blue, viol, smoothstep(0.2, 0.5, hue));
  col = mix(col, mag, smoothstep(0.5, 0.75, hue));
  col = mix(col, teal, smoothstep(0.6, 0.9, fbm3(q * 0.8 - 5.0, 3) * 0.5 + 0.5) * 0.85);
  col = mix(col, vec3f(1.1, 0.42, 0.12), core * smoothstep(0.4, 0.9, n));
  // dark dust lanes
  let lane = 1.0 - abs(fbm3(q * 2.1 + 4.0, 5));
  dens *= 1.0 - 0.8 * smoothstep(0.82, 0.97, lane) * smoothstep(0.1, 0.5, band + core);
  var e = col * dens * 0.32;
  let cn = fbm3(d * 9.0 + 2.0, 5) * 0.5 + 0.5;
  e += vec3f(1.5, 0.62, 0.3) * pow(cw, 40.0) * 0.55 * smoothstep(0.25, 0.85, cn) * (0.3 + n) + vec3f(1.8, 1.1, 0.6) * pow(cw, 400.0) * 0.8;
  e += vec3f(0.9, 0.3, 0.55) * pow(cw, 4.0) * 0.03;
  // second, cooler glow region
  let c2 = max(dot(d, normalize(vec3f(0.7, -0.35, -0.2))), 0.0);
  e += vec3f(0.1, 0.45, 0.65) * pow(c2, 8.0) * 0.35 * (0.4 + n);
  // faint distant galaxies
  for (var i = 0; i < 14; i++) {
    let h = hash33(vec3f(f32(i), 3.1, 7.7));
    let gd = normalize(h * 2.0 - 1.0);
    let k = dot(d, gd);
    if (k > 0.995) {
      let Bg = aoBasis(gd);
      var p = vec2f(dot(d, Bg[0]), dot(d, Bg[1])) / k;
      let a = h.x * 6.28; p = vec2f(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
      p.y /= 0.25 + 0.6 * h.y;
      let rr = length(p) / (0.006 + 0.01 * h.z);
      e += mix(vec3f(1.0, 0.8, 0.6), vec3f(0.6, 0.7, 1.2), h.y) * (exp(-rr * rr * 3.0) * 0.8 + exp(-rr * 2.0) * 0.25);
    }
  }
  e += aoSpiral(d);
  return e + vec3f(0.004, 0.005, 0.018);
}

// mid-distance wisps: rgb emission, a = coverage
fn aoWisp(d: vec3f) -> vec4f {
  var q = d * 2.4 + 20.0;
  q += vec3f(fbm3(q * 0.9, 3), fbm3(q * 0.9 + 5.0, 3), fbm3(q * 0.9 + 9.0, 3)) * 0.7;
  let fil = pow(1.0 - abs(fbm3(q * 1.3, 6)), 5.0);
  let m = smoothstep(0.15, 0.75, fbm3(q * 0.7 + 3.0, 5)) * smoothstep(-0.1, 0.45, fbm3(d * 0.9 + 2.0, 3));
  let dk = smoothstep(0.25, 0.75, fbm3(q * 1.1 - 7.0, 5));
  let hue = fbm3(q * 0.5 - 2.0, 2) * 0.5 + 0.5;
  let col = mix(vec3f(0.12, 0.45, 0.75), vec3f(0.75, 0.2, 0.7), smoothstep(0.3, 0.7, hue));
  var e = col * (fil * m * 0.3 + m * 0.05) * (1.0 - 0.85 * dk);
  let a = clamp(m * 0.25 + fil * m * 0.15 + dk * m * 0.4, 0.0, 0.6);
  return vec4f(e, a);
}

