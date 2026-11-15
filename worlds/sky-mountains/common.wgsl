// Shared by every sky-mountains shader: baked noise, cloud-sea height field, atmosphere and sky.
// NT: tileable 256^2 texture. r = billow noise (cloud heights), g/b = its gradient, a = detail fbm.
// SM: baked sun shadows + contact shade on the hero island (r), world xz -> uv via SMR.
@group(1) @binding(0) var NT: texture_2d<f32>;
@group(1) @binding(1) var NS: sampler;
@group(1) @binding(2) var SM: texture_2d<f32>;
const SMR = 44.0;      // shadow map half extent (m), centred on the hero island
const GK = 50.0;       // gradient decode range

// sample by metres: p (m) * f (uv per m), mip chosen from the view distance d
fn nl(p: vec2f, f: f32, d: f32) -> vec4f { return textureSampleLevel(NT, NS, p * f, log2(max(d * f * 0.6, 1.0))); }

// cloud-sea top: height (m) and d/dx, d/dz. Three scales: ranges, billows, puffs (CPU twin: cloudAt() in world.js)
fn cloudUV(p: vec2f, i: i32) -> vec2f {
  if (i == 0) { return p / 760.0 + vec2f(0.0022, 0.0008) * G.time; }
  if (i == 2) { return p / 2900.0 + vec2f(0.37, 0.61) + vec2f(0.0005, 0.0003) * G.time; }
  return p.yx / 230.0 + vec2f(-0.0035, 0.0055) * G.time;
}
fn cloudMix(a: vec4f, b: vec4f, c: vec4f) -> vec3f {
  return vec3f(34.0 * (a.r - 0.5) + 13.0 * (b.r - 0.5) + 50.0 * (c.r - 0.5),
    34.0 / 760.0 * GK * (a.g - 0.5) + 13.0 / 230.0 * GK * (b.b - 0.5) + 50.0 / 2900.0 * GK * (c.g - 0.5),
    34.0 / 760.0 * GK * (a.b - 0.5) + 13.0 / 230.0 * GK * (b.g - 0.5) + 50.0 / 2900.0 * GK * (c.b - 0.5));
}
fn cloudHG(p: vec2f) -> vec3f {
  return cloudMix(textureSampleLevel(NT, NS, cloudUV(p, 0), 0.0), textureSampleLevel(NT, NS, cloudUV(p, 1), 0.0), textureSampleLevel(NT, NS, cloudUV(p, 2), 0.0));
}

// the two large scales only (cheap shadow taps)
fn cloudH2(p: vec2f) -> f32 {
  return 34.0 * (textureSampleLevel(NT, NS, cloudUV(p, 0), 1.0).r - 0.5) + 50.0 * (textureSampleLevel(NT, NS, cloudUV(p, 2), 0.0).r - 0.5);
}
// haze colour in a view direction: lavender-blue away from the sun, peach-gold toward it
fn hazeCol(rd: vec3f) -> vec3f {
  let s = dot(normalize(vec3f(rd.x, rd.y * 0.6, rd.z)), G.sunDir) * 0.5 + 0.5;
  let s2 = s * s;
  let cool = mix(vec3f(0.62, 0.43, 0.62), vec3f(0.3, 0.4, 0.8), smoothstep(-0.05, 0.3, rd.y + s * 0.5));   // rose anti-twilight band low, opposite the sun
  return mix(cool, vec3f(1.35, 0.7, 0.33), s2 * s2 * s) + vec3f(1.5, 0.75, 0.3) * pow(s, 40.0) * 0.2;
}
// aerial perspective: thin haze everywhere + a denser layer hugging the cloud sea
fn atmoT(v: vec3f) -> f32 {
  let l = length(v);
  let d = l * l / (l + 160.0);                        // thinner in the foreground so near pillars keep their contrast
  let k = 0.014 * v.y;
  let hf = select((1.0 - exp(-k)) / k, 1.0, abs(k) < 1e-3);
  return exp(-d * (0.00028 + 0.0016 * exp(-0.014 * max(G.camPos.y, 0.0)) * hf));
}
fn atmo(col: vec3f, wp: vec3f) -> vec3f {
  let v = wp - G.camPos;
  return mix(hazeCol(normalize(v)), col, atmoT(v));
}
fn skyBase(rd: vec3f) -> vec3f {
  let y = max(rd.y, 0.0);
  let s = max(dot(rd, G.sunDir), 0.0);
  var c = mix(vec3f(0.42, 0.42, 0.86), vec3f(0.07, 0.17, 0.58), smoothstep(0.05, 0.7, y));
  c += vec3f(1.0, 0.42, 0.22) * pow(s, 4.0) * 0.55 * (1.0 - y);
  c = mix(c, vec3f(0.78, 0.5, 0.62), exp(-pow((y - 0.09) / 0.09, 2.0)) * (1.0 - smoothstep(-0.6, 0.5, dot(rd, G.sunDir))) * 0.6);
  return mix(c, hazeCol(rd), exp(-y * 7.0));
}
// colour of the cloud sea for a given sun exposure (0 shade .. 1 lit)
fn cloudShade(lit: f32, amb: f32) -> vec3f {
  return vec3f(0.34, 0.39, 0.78) * amb + vec3f(1.65, 0.95, 0.55) * lit;
}
// surface-gradient bump from a scalar height (screen-space derivatives)
fn bump(n: vec3f, wp: vec3f, h: f32, k: f32) -> vec3f {
  let dx = dpdx(wp); let dy = dpdy(wp);
  let r1 = cross(dy, n); let r2 = cross(n, dx);
  let det = dot(dx, r1);
  let g = sign(det) * (dpdx(h) * r1 + dpdy(h) * r2);
  return normalize(abs(det) * n - k * g);
}
