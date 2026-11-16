// Shared spirit-forest WGSL: world uniforms, baked maps, lighting helpers.
struct WU {
  misc: vec4f,               // x moon strength, y mist density, z haze density, w glow gain
  shaft: array<vec4f, 6>,    // moon shafts: ground x, z, radius, intensity
  door: vec4f,               // door ground position, w = open amount
  lp: array<vec4f, 16>,      // moving lights: xyz, radius   (0-1 deer, 2-7 lanterns, 8-15 wisps)
  lc: array<vec4f, 16>,      // rgb
  deer: array<vec4f, 2>,     // xyz, yaw
  deerB: array<vec4f, 2>,    // head turn, walk phase, walk amount, brightness
  lan: array<vec4f, 6>,      // xyz, yaw
  wisp: array<vec4f, 8>,     // xyz, brightness
};
@group(1) @binding(0) var<uniform> U: WU;
@group(1) @binding(1) var hmap: texture_2d<f32>;
@group(1) @binding(2) var lmap: texture_2d<f32>;
@group(1) @binding(3) var ntex: texture_2d<f32>;
@group(1) @binding(4) var smp: sampler;
@group(1) @binding(5) var smpR: sampler;

struct VI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f };
struct VII { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f, @location(4) a: vec4f, @location(5) b: vec4f };
const WSIZE = 240.0;
const MINT = vec3f(0.1, 1.0, 0.5);
const WILLOW = vec3f(0.42, 1.0, 0.86);
const SPIRIT = vec3f(0.62, 0.9, 1.0);
const AMBER = vec3f(1.0, 0.62, 0.2);
fn wuv(p: vec2f) -> vec2f { return p / WSIZE + 0.5; }
fn terrH(p: vec2f) -> f32 { return textureSampleLevel(hmap, smp, wuv(p), 0.0).r; }
fn nz(p: vec2f) -> vec4f { return textureSampleLevel(ntex, smpR, p, 0.0); }
// slow breathing of all bioluminescence (two incommensurate fronts)
fn pulse(p: vec3f) -> f32 {
  let t = G.time;
  let a = dot(p.xz, vec2f(0.8, 0.6)) * 0.11 - t * 0.31;
  let b = dot(p.xz, vec2f(-0.55, 0.83)) * 0.07 - t * 0.19 + 1.7;
  let w = 0.5 + 0.5 * sin(a + 1.3 * sin(b));
  return 0.62 + 0.55 * w * w;
}
// baked glow (rgb) and trunk occlusion (a)
fn lmAt(p: vec2f) -> vec4f { return textureSampleLevel(lmap, smp, wuv(p), 0.0); }
// moonlight reaching the ground through the canopy (baked: soft dapples plus the shaft spots)
fn moonVis(p: vec3f) -> f32 { return textureSampleLevel(hmap, smp, wuv(p.xz - G.sunDir.xz / G.sunDir.y * p.y), 0.0).g; }
// light from the spirits (evaluated per vertex)
fn dynL(p: vec3f, n: vec3f) -> vec3f {
  var c = vec3f(0.0);
  for (var i = 0; i < 16; i++) {
    let l = U.lp[i];
    let d = l.xyz - p;
    let d2 = dot(d, d);
    let r2 = l.w * l.w;
    if (d2 < r2 * 9.0) { c += U.lc[i].rgb * exp(-d2 / r2) * (0.45 + 0.55 * max(dot(n, d) * inverseSqrt(d2 + 1e-4), 0.0)); }
  }
  return c;
}
fn shade(alb: vec3f, n: vec3f, mv: f32, ao: f32, gl: vec3f, dl: vec3f) -> vec3f {
  let amb = hemi(n, G.ambientSky, G.ambientGround);
  let moon = G.sunColor * wrapDiffuse(n, G.sunDir, 0.45) * mv;
  return alb * ((amb + moon) * ao + gl * (0.55 + 0.45 * max(n.y, 0.0) + 0.3 * max(-n.y, 0.0)) + dl);
}
// push emission into HDR: the brighter the emitter, the hotter and whiter its core (feeds the bloom)
fn glow(e: vec3f) -> vec3f { let l = max(e.r, max(e.g, e.b)); return e * (1.0 + 2.0 * l) + vec3f(l * l * l * 0.8); }
fn nearFade(base: vec3f) -> f32 { return smoothstep(0.45, 1.5, distance(base.xz, G.camPos.xz)); }
fn faceN(n: vec3f, p: vec3f) -> vec3f { let v = G.camPos - p; return select(-n, n, dot(n, v) >= 0.0); }
fn quadC(vi: u32) -> vec2f {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return cs[vi];
}
// distance haze for things drawn after the mist pass
fn fxFog(p: vec3f) -> f32 { return exp(-distance(p, G.camPos) * 0.022) * (1.0 - G.transition); }
