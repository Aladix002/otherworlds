// One-time bakes: the sky dome (equirect, upper hemisphere) and the moon disc.
override MX: f32 = 0.0; override MY: f32 = 0.3; override MZ: f32 = -0.95; override MR: f32 = 0.16;
override PX: f32 = 0.0; override PY: f32 = 1.0; override PZ: f32 = 0.0;   // Milky Way pole
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }

@fragment fn fsSky(in: VO) -> @location(0) vec4f {
  let az = (in.uv.x - 0.5) * TAU; let el = in.uv.y * PI * 0.5;
  let rd = vec3f(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  let md = normalize(vec3f(MX, MY, MZ));
  let ang = acos(clamp(dot(rd, md), -1.0, 1.0));
  let sy = sin(el);
  // gradient + airglow
  var c = mix(vec3f(0.017, 0.032, 0.062), vec3f(0.004, 0.007, 0.02), pow(sy, 0.42));
  c += vec3f(0.008, 0.028, 0.025) * exp(-el * 8.0) + vec3f(0.01, 0.014, 0.026) * exp(-el * 30.0);
  // Milky Way
  let P = normalize(vec3f(PX, PY, PZ));
  let A = normalize(cross(P, vec3f(0.0, 1.0, 0.0))); let B = cross(P, A);
  let d = dot(rd, P);
  let lon = atan2(dot(rd, B), dot(rd, A));
  let wq = rd * 3.2 + 0.35 * vec3f(fbm3(rd * 2.1 + 4.0, 3), fbm3(rd * 2.1 + 9.0, 3), fbm3(rd * 2.1 - 5.0, 3));
  let n1 = fbm3(wq * 1.6, 6) * 0.5 + 0.5;
  let n2 = fbm3(wq * 3.4 + 17.0, 6) * 0.5 + 0.5;
  let dl0 = abs(lon - 1.9); let dlw = min(dl0, TAU - dl0);
  let core = exp(-pow(dlw / 0.9, 2.0));
  let wdt = 0.1 + 0.07 * core + 0.05 * (n1 - 0.5);
  let band = exp(-d * d / (2.0 * wdt * wdt));
  var mw = band * (0.25 + 0.9 * n1 * n1) * (0.55 + 0.9 * core);
  let rift = smoothstep(0.42, 0.7, n2) * exp(-pow((d + 0.02 * (n1 - 0.5)) / 0.06, 2.0));
  mw *= 1.0 - 0.8 * rift;
  var mc = mix(vec3f(0.5, 0.62, 1.0), vec3f(1.0, 0.84, 0.66), clamp(core * 0.8 + band * 0.3 - 0.2 + 0.4 * (n2 - 0.5), 0.0, 1.0));
  mc += vec3f(0.6, 0.1, 0.3) * smoothstep(0.62, 0.9, fbm3(rd * 7.0 + 31.0, 4) * 0.5 + 0.5) * 0.9;
  c += mc * mw * 0.17 * smoothstep(0.0, 0.3, sy);
  // faint diffuse star dust everywhere
  c += vec3f(0.5, 0.6, 0.9) * 0.004 * (fbm3(rd * 9.0, 4) * 0.5 + 0.5) * smoothstep(0.0, 0.3, sy);
  // moon halo
  let ha = max(ang - MR, 0.0);
  c += vec3f(0.36, 0.47, 0.72) * (0.26 * exp(-ha * 45.0) + 0.32 * exp(-ha * 13.0) + 0.1 * exp(-ha * 3.6) + 0.014 * exp(-ha * 1.1));
  // thin moonlit cirrus low over the horizon
  let cq = vec2f(az * 2.6, el * 17.0);
  let cn = fbm2(cq + 0.6 * vec2f(fbm2(cq * 0.7 + 3.0, 3), fbm2(cq * 0.7 - 7.0, 3)), 6);
  let cm = smoothstep(-0.05, 0.6, cn) * exp(-pow((el - 0.14) / 0.085, 2.0));
  c = mix(c, c * 0.75 + vec3f(0.11, 0.14, 0.2) * (0.14 + 1.2 * exp(-ang * 2.6)), cm * 0.5);
  return vec4f(c, 1.0);
}

// crater height: bowl + raised rim, radius varies strongly per cell
fn craH(p: vec3f, s: f32, th: f32) -> f32 {
  let v = voronoi3(p * s + s * 1.7);
  let h = fract(v.z * 43.7); let h2 = fract(v.z * 97.3 + 0.37);
  let r0 = 0.09 + 0.33 * h2 * h2;
  let dd = v.x / r0;
  return step(th, h) * (exp(-pow((dd - 1.0) * 4.5, 2.0)) - 0.9 * smoothstep(1.0, 0.35, dd)) * r0 / s;
}
fn moonH(p: vec3f) -> f32 {
  return craH(p, 6.0, 0.8) + craH(p, 12.0, 0.55) + craH(p, 24.0, 0.45) + craH(p, 47.0, 0.4) + craH(p, 90.0, 0.45)
    + 0.004 * fbm3(p * 14.0, 4);
}
// small bright young craters with a soft ejecta blanket
fn craB(p: vec3f, s: f32, th: f32) -> f32 {
  let v = voronoi3(p * s + s * 3.1);
  let h = fract(v.z * 61.7);
  return step(th, h) * (exp(-v.x * v.x * 90.0) + 0.35 * exp(-v.x * v.x * 9.0)) * (0.4 + 0.6 * fract(v.z * 17.3));
}
@fragment fn fsMoon(in: VO) -> @location(0) vec4f {
  let q = vec2f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0) / 0.98;
  let r2 = dot(q, q);
  if (r2 > 1.0) { return vec4f(0.0); }
  let n = vec3f(q, sqrt(1.0 - r2));
  let M = rotY(0.7) * rotX(-0.35);
  let p = M * n;
  // maria: warped basins with ragged, layered shores and uneven floors
  let wp = p + 0.22 * vec3f(fbm3(p * 2.3 + 11.0, 4), fbm3(p * 2.3 - 7.0, 4), fbm3(p * 2.3 + 23.0, 4));
  let m = fbm3(wp * 1.25 + vec3f(3.1, 0.7, 1.9), 6);
  let m2 = fbm3(wp * 3.1 + m * 1.5, 6);
  let m3 = fbm3(p * 9.0 + 5.0, 5);
  let ms = m + 0.3 * m2 + 0.07 * m3 + 0.12 * p.y - 0.1 * p.x;
  let mar = smoothstep(-0.03, 0.26, ms + 0.04 * fbm3(p * 24.0, 3));
  let deep = smoothstep(0.12, 0.5, ms);
  let hi = fbm3(p * 2.2 - 4.0, 5);
  let lg = fbm3(p * 0.9 + 17.0, 3);                              // broad albedo provinces
  var alb = mix(0.86 + 0.09 * hi + 0.07 * lg, 0.33 - 0.11 * deep + 0.07 * m2 + 0.06 * lg, mar);
  // regolith mottling at every scale
  alb *= 0.88 + 0.1 * fbm3(p * 6.0, 5) + 0.08 * fbm3(p * 21.0, 4) + 0.06 * fbm3(p * 70.0, 3) + 0.035 * fbm3(p * 190.0, 2);
  // a full moon is lit head-on: relief is faint, craters read mostly as brightness
  let L = M * normalize(vec3f(-0.6, 0.55, 0.0));
  let e = 0.003;
  let h0 = moonH(p);
  let rel = (moonH(normalize(p + L * e)) - moonH(normalize(p - L * e))) / (2.0 * e);
  alb *= 1.0 + clamp(rel * 0.55, -0.16, 0.2) * mix(1.0, 0.5, mar);
  alb += clamp(h0, -0.02, 0.03) * 1.3 * mix(1.0, 0.4, mar);
  alb += (craB(p, 9.0, 0.86) * 0.2 + craB(p, 21.0, 0.8) * 0.16 + craB(p, 48.0, 0.8) * 0.1) * mix(0.75, 1.0, mar);
  // three young ray craters: a bright core and long feathered rays
  for (var i = 0; i < 3; i++) {
    var c0 = vec3f(0.3, -0.62, 0.72);
    if (i == 1) { c0 = vec3f(-0.42, 0.2, 0.88); }
    if (i == 2) { c0 = vec3f(-0.66, 0.45, 0.6); }
    c0 = normalize(c0);
    let dv = p - c0; let dl = length(dv);
    let t1 = normalize(cross(c0, vec3f(0.0, 1.0, 0.3))); let t2 = cross(c0, t1);
    let a = atan2(dot(dv, t2), dot(dv, t1));
    let cs = vec2f(cos(a), sin(a));
    let ray = pow(smoothstep(-0.2, 0.9, fbm2(cs * 3.4 + f32(i) * 9.0, 3)), 2.0) * (0.6 + 0.4 * fbm2(cs * 11.0 + dl * 3.0, 2));
    let k = select(1.0, 0.5, i > 0);
    alb += k * (0.42 * ray * exp(-dl * select(4.5, 1.7, i == 0)) * smoothstep(0.015, 0.07, dl) + 0.16 * exp(-dl * dl * 260.0) + 0.25 * exp(-dl * dl * 2600.0));
  }
  alb *= mix(0.42, 1.0, pow(n.z, 0.55));
  let col = mix(vec3f(1.0, 0.97, 0.91), vec3f(0.84, 0.9, 1.0), mar * 0.8) * clamp(alb, 0.0, 1.05) * 0.95;
  return vec4f(col, smoothstep(1.0, 0.972, sqrt(r2)));
}
