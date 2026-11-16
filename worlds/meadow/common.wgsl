// Shared by all meadow shaders.
// NT: tileable 256^2 noise (r, g: fbm at two scales, b: round speckles, a: fine fbm).
// TA: baked map over +-MS m (r height, g flower cover, b water (+) / path (-), a sun visibility).
// TB: colour fields over +-ZS m (rgb sqrt-encoded, a lavender rows).
@group(1) @binding(0) var NT: texture_2d<f32>;
@group(1) @binding(1) var NS: sampler;
@group(1) @binding(2) var TA: texture_2d<f32>;
@group(1) @binding(3) var TB: texture_2d<f32>;
@group(1) @binding(4) var LS: sampler;
const MS = 140.0; const ZS = 560.0;
const WD = vec2f(-0.86, -0.5);                     // wind direction
fn mapA(p: vec2f) -> vec4f {
  let m = textureSampleLevel(TA, LS, p / (2.0 * MS) + 0.5, 0.0);
  let k = 1.0 - smoothstep(MS - 8.0, MS - 1.0, max(abs(p.x), abs(p.y)));
  return vec4f(m.r, mix(0.9, m.g, k), m.b * k, mix(1.0, m.a, k));
}
fn mapB(p: vec2f) -> vec4f { let c = textureSampleLevel(TB, LS, p / (2.0 * ZS) + 0.5, 0.0); return vec4f(c.rgb * c.rgb, c.a * c.a); }
// rolling wind waves, 0..1
fn gust(p: vec2f) -> f32 {
  let a = textureSampleLevel(NT, NS, p * 0.0045 - WD * 0.022 * G.time, 0.0).r;
  let b = textureSampleLevel(NT, NS, p * 0.019 - WD * 0.06 * G.time, 0.0).g;
  return smoothstep(0.3, 0.85, a * 0.72 + b * 0.28);
}
fn hazeCol(rd: vec3f) -> vec3f {
  let s = max(dot(normalize(vec3f(rd.x, rd.y * 0.4, rd.z)), G.sunDir), 0.0);
  let s2 = s * s;
  return mix(vec3f(0.34, 0.45, 0.8), vec3f(1.5, 0.8, 0.32), s2 * s2);
}
fn skyCol(rd: vec3f) -> vec3f {
  let y = max(rd.y, 0.0); let s = max(dot(rd, G.sunDir), 0.0);
  var c = mix(vec3f(0.3, 0.5, 0.95), vec3f(0.06, 0.19, 0.62), smoothstep(0.0, 0.6, y));
  c = mix(c, vec3f(0.98, 0.62, 0.72), exp(-y * 5.0) * 0.4 * (1.0 - s));
  c = mix(c, hazeCol(rd), exp(-y * 8.0));
  return c + vec3f(1.0, 0.42, 0.12) * pow(s, 5.0) * 0.42 + vec3f(1.0, 0.6, 0.25) * pow(s, 40.0) * 0.5;
}
// aerial haze + morning mist pooled in the river valley (exponential in height)
fn atmo(col: vec3f, wp: vec3f) -> vec3f {
  let v = wp - G.camPos; let l = length(v); let rd = v / l;
  let a = 0.5 * v.y;
  let hf = select((1.0 - exp(-a)) / a, 1.0 - a * 0.5, abs(a) < 0.01);
  let mist = 1.0 - exp(-min(0.02 * exp(-0.5 * max(G.camPos.y, 0.0)) * hf * l, 8.0));
  let hz = hazeCol(rd);
  let c = mix(col, hz * 0.9 + vec3f(0.12, 0.11, 0.13), mist);
  return mix(hz, c, exp(-l * 0.0014));
}
fn shade(alb: vec3f, n: vec3f, wp: vec3f, ao: f32, sh: f32, tr: f32, glow: f32) -> vec3f {
  let v = normalize(G.camPos - wp);
  let ndl = dot(n, G.sunDir);
  let back = pow(max(dot(-v, G.sunDir), 0.0), 2.0);
  let lit = min(smoothstep(-0.3, 0.9, ndl) + tr * (smoothstep(0.3, -0.7, ndl) * 0.5 + back * 0.8), 1.3);
  return atmo(alb * (G.sunColor * (lit * sh * ao) + hemi(n, G.ambientSky, G.ambientGround) * ao + glow), wp);
}
