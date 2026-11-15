// Shared jungle WGSL: world uniforms, baked maps, palette slots, pulse waves, lighting.
struct WU {
  slot: array<vec4f, 4>,   // rgb = current color of each palette slot
  rip: array<vec4f, 8>,    // ripples: x, z, start time, amplitude
  frog: array<vec4f, 6>,   // x, y, z, yaw
  frogB: array<vec4f, 6>,  // x = hop phase (0..1, <0 idle), y = squash
  wf: vec4f,               // waterfall: lip x, lip y, lip z, base z
  misc: vec4f,             // x moon, y mist density, z haze density, w global glow gain
  shaft: array<vec4f, 6>,  // light shafts: ground x, z, radius, intensity
  lotus: array<vec4f, 10>, // x, z, scale, bloom 0..1
  door: vec4f,             // door ground position
};
@group(1) @binding(0) var<uniform> U: WU;
@group(1) @binding(1) var hmap: texture_2d<f32>;
@group(1) @binding(2) var lmap: texture_2d<f32>;
@group(1) @binding(3) var ntex: texture_2d<f32>;
@group(1) @binding(4) var smp: sampler;
@group(1) @binding(5) var smpR: sampler;

const WSIZE = 280.0;
const LOTUSC = vec3f(1.0, 0.36, 0.72);
fn wuv(p: vec2f) -> vec2f { return p / WSIZE + 0.5; }
fn terrH(p: vec2f) -> f32 { return textureSampleLevel(hmap, smp, wuv(p), 0.0).r; }
fn nz(p: vec2f) -> vec4f { return textureSampleLevel(ntex, smpR, p, 0.0); }
fn slotCol(w: vec4f) -> vec3f { return U.slot[0].rgb * w.x + U.slot[1].rgb * w.y + U.slot[2].rgb * w.z + U.slot[3].rgb * w.w; }
fn slotOf(s: f32) -> vec3f {
  let i = u32(s) & 3u;
  let f = fract(s);
  return mix(U.slot[i].rgb, U.slot[(i + 1u) & 3u].rgb, f);
}
// slow traveling waves of light that flow across the forest (two incommensurate fronts)
fn pulse(p: vec3f) -> f32 {
  let t = G.time;
  let a = dot(p.xz, vec2f(0.8, 0.6)) * 0.16 - t * 0.43 + p.y * 0.05;
  let b = dot(p.xz, vec2f(-0.55, 0.83)) * 0.09 - t * 0.27 + 1.7;
  let w = 0.5 + 0.5 * sin(a + 1.3 * sin(b));
  let w2 = 0.5 + 0.5 * sin(b * 1.7 + t * 0.05);
  return 0.38 + 0.95 * w * w * (0.75 + 0.25 * w2);
}
fn touch(p: vec3f) -> f32 { return 1.0 - smoothstep(0.8, 4.0, distance(p.xz, G.camPos.xz)); }
// bioluminescent light reaching point p (baked emitter map, attenuated with height above ground)
fn glowAt(p: vec3f) -> vec3f {
  let l = textureSampleLevel(lmap, smp, wuv(p.xz), 0.0);
  let h = max(p.y - terrH(p.xz), 0.0);
  return slotCol(l) * pulse(p) * exp(-h * 0.22) * U.misc.w;
}
// ambient + moon + local glow. Fog is applied later in the deferred mist pass.
fn shadeJ(alb: vec3f, n: vec3f, p: vec3f, ao: f32) -> vec3f {
  let amb = hemi(n, G.ambientSky, G.ambientGround);
  let moon = G.sunColor * wrapDiffuse(n, G.sunDir, 0.4) * U.misc.x;
  let gl = glowAt(p) * (0.55 + 0.45 * max(n.y, 0.0) + 0.3 * max(-n.y, 0.0));
  return alb * ((amb + moon) * ao + gl);
}
fn faceN(n: vec3f, p: vec3f) -> vec3f { let v = G.camPos - p; return select(-n, n, dot(n, v) >= 0.0); }
fn segD(p: vec2f, a: vec2f, b: vec2f) -> f32 { let ba = b - a; return length(p - a - ba * clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0)); }
// koi swim path (instance a = cx, cz, radius, angular speed; b = phase, slot, seed, depth) -> xyz, w = yaw
fn fishPos(a: vec4f, b: vec4f) -> vec4f {
  let t = G.time;
  let th = b.x + t * a.w;
  let wob = vec2f(sin(t * 0.13 + b.z * 7.0), cos(t * 0.11 + b.z * 5.0)) * 0.25 * a.z;
  let c = a.xy + vec2f(cos(th) * a.z, sin(th) * a.z * 0.65) + wob;
  let dc = vec2f(-sin(th) * a.z, cos(th) * a.z * 0.65) * sign(a.w);
  return vec4f(c.x, b.w + 0.04 * sin(t * 0.3 + b.z * 4.0), c.y, atan2(dc.x, dc.y));
}
