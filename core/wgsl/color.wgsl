// ---- color helpers (all lighting math is in linear space) ----
fn srgbToLinear(c: vec3f) -> vec3f { return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045)); }
fn linearToSrgb(c: vec3f) -> vec3f { return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308)); }
fn hex(h: u32) -> vec3f { return srgbToLinear(vec3f(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0); }
fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn saturation(c: vec3f, s: f32) -> vec3f { return mix(vec3f(luminance(c)), c, s); }
fn hsv2rgb(c: vec3f) -> vec3f { let k = clamp(abs(fract(c.x + vec3f(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0)); return c.z * mix(vec3f(1.0), k, c.y); }
fn rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.bg, K.wz), vec4f(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4f(p.xyw, c.r), vec4f(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
// iq cosine palette: a + b*cos(TAU*(c*t+d))
fn palette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f { return a + b * cos(TAU * (c * t + d)); }
// approximate blackbody color (linear, normalized) for 1000..40000 K
fn blackbody(k: f32) -> vec3f {
  let t = k / 100.0;
  var r = 1.0; var g = 0.0; var b = 1.0;
  if (t <= 66.0) { g = 0.39008 * log(t) - 0.63184; } else { r = 1.29294 * pow(t - 60.0, -0.1332); g = 1.12989 * pow(t - 60.0, -0.0755); }
  if (t <= 19.0) { b = 0.0; } else if (t < 66.0) { b = 0.54321 * log(t - 10.0) - 1.19625; }
  return srgbToLinear(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0)));
}
