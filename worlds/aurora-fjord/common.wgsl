// Shared by every aurora-fjord shader.
// NT: tileable 256^2 noise. r = billow fbm, g/b = its gradient, a = detail fbm.
// VM: village map. r = warm light pools, g = contact shade, b = trodden paths, a = door light spill.
// RT: planar reflection of the scene (mirrored pass), sampled by the water.
@group(1) @binding(0) var NT: texture_2d<f32>;
@group(1) @binding(1) var NS: sampler;
@group(1) @binding(2) var VM: texture_2d<f32>;
@group(1) @binding(3) var LS: sampler;
@group(1) @binding(4) var RT: texture_2d<f32>;
override MIR: f32 = 1.0;                 // -1 in the reflection pass (scene mirrored about y = 0)
const WARM = vec3f(1.0, 0.56, 0.2);
const AUR = vec3f(0.08, 1.0, 0.42);

fn nl(p: vec2f, f: f32, d: f32) -> vec4f { return textureSampleLevel(NT, NS, p * f, log2(max(d * f * 0.55, 1.0))); }
fn clip(w: vec3f) -> vec4f { return G.viewProj * vec4f(w.x, w.y * MIR, w.z, 1.0); }

// night sky without stars: deep blue zenith, a cold glow low in the north, green aurora haze
fn skyCol(rd: vec3f) -> vec3f {
  let y = max(rd.y, 0.0);
  var c = mix(vec3f(0.020, 0.040, 0.075), vec3f(0.0035, 0.007, 0.02), pow(y, 0.45));
  c += vec3f(0.012, 0.035, 0.05) * exp(-y * 9.0) * (0.6 - 0.4 * rd.z);
  c += AUR * (0.022 * G.params.x * smoothstep(-0.3, 0.9, y - rd.z * 0.5) * (1.0 - y * 0.6));
  return c;
}
fn fogged(c: vec3f, w: vec3f) -> vec3f {
  let v = w - G.camPos; let d = length(v);
  return mix(skyCol(normalize(vec3f(v.x, max(v.y, 0.0) * 0.3 + 0.02 * d, v.z))), c, exp(-d * G.fogDensity));
}
// village map lookup: xy = uv, returns (pool, contact, path, door spill); neutral outside
fn vmap(p: vec2f) -> vec4f {
  let uv = (p - vec2f(0.0, -20.0)) / 160.0 + 0.5;
  let m = textureSampleLevel(VM, LS, uv, 0.0);
  let e = abs(uv - 0.5);
  return mix(m, vec4f(0.0, 1.0, 0.0, 0.0), smoothstep(0.47, 0.5, max(e.x, e.y)));
}
// light arriving at a surface: moon (shadowed), sky, aurora from above/north, warm pools
fn light(n: vec3f, sh: f32, ao: f32, pool: f32, spill: f32) -> vec3f {
  let moon = G.sunColor * (sh * max((dot(n, G.sunDir) + 0.25) / 1.25, 0.0));
  let aur = AUR * (G.params.x * 0.085 * max(dot(n, vec3f(0.0, 0.8, -0.6)) * 0.6 + 0.4, 0.0));
  return moon + (hemi(n, G.ambientSky, G.ambientGround) + aur) * ao + WARM * (pool * (0.45 + 0.55 * ao)) + vec3f(1.0, 0.72, 0.42) * (spill * G.params.z * 0.9);
}
// snow: bluish, soft, with a little forward-scatter rim so drifts read at night
fn snow(n: vec3f, w: vec3f, sh: f32, ao: f32, m: vec4f) -> vec3f {
  let v = normalize(G.camPos - w);
  var c = vec3f(0.80, 0.86, 0.96) * light(n, sh, ao * m.g, m.r * 2.0, m.a);
  let h = normalize(G.sunDir + v);
  c += G.sunColor * (pow(max(dot(n, h), 0.0), 40.0) * 0.5 * sh + pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.12 * (0.3 + 0.7 * sh));
  return c;
}
// shore function twin of terrain.js shore(): > 0 land, < 0 water (m)
fn shoreD(p: vec2f) -> f32 {
  let u = max(0.0, -(p.y + 40.0)); let w = u * u / (u + 200.0);
  let xx = p.x - 120.0 * sin(w * 0.003); let g = 2.0 * xx / 26.0;
  return (p.y - 6.0 + xx * xx / 26.0) / sqrt(1.0 + g * g);
}
