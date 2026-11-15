// Shared by every runtime shader of moon-sea. MIR = -1 in the planar-reflection pass: the world is mirrored about the
// water plane (y = 0) and drawn with the main camera, so the reflection texture is screen-aligned with the main view.
override MIR: f32 = 1.0;
struct MU {
  moon: vec4f,             // xyz = direction, w = sin(angular radius)
  refl: vec4f,             // xy = uv scale of the valid region of the reflection texture
  door: vec4f,             // x, z, yaw, open (0..1)
  misc: vec4f,             // x = door swing side
  lamps: array<vec4f, 3>,  // xyz, intensity (tree lantern, two door lanterns)
  steps: array<vec4f, 12>, // x, z, start time, strength
};
@group(1) @binding(0) var<uniform> U: MU;
@group(1) @binding(1) var skyT: texture_2d<f32>;
@group(1) @binding(2) var moonT: texture_2d<f32>;
@group(1) @binding(3) var hT: texture_2d<f32>;
@group(1) @binding(4) var sLin: sampler;
@group(1) @binding(5) var sRep: sampler;

const BIO = vec3f(0.04, 0.62, 1.0);
const WARM = vec3f(1.0, 0.46, 0.13);
const HMAP = vec4f(40.0, -10.0, 400.0, 0.0);   // height map centre x, z, size (keep in sync with world.js)
const ISX = 291.3; const ISZ = -106.0;         // centre of the dune island

fn eye() -> vec3f { return vec3f(G.camPos.x, G.camPos.y * MIR, G.camPos.z); }
fn clipW(w: vec3f) -> vec4f { return G.viewProj * vec4f(w.x, w.y * MIR, w.z, 1.0); }
fn fogged(c: vec3f, w: vec3f) -> vec3f { return mix(c, G.fogColor, fogAmount(distance(w, eye()))); }

// baked sky (upper hemisphere, equirect): gradient, airglow, Milky Way, cirrus, moon halo
fn skyBase(rd: vec3f) -> vec3f {
  let u = atan2(rd.x, -rd.z) / TAU + 0.5;
  let v = clamp(asin(clamp(abs(rd.y), 0.0, 1.0)) / (PI * 0.5), 0.002, 0.998);
  return textureSampleLevel(skyT, sRep, vec2f(u, v), 0.0).rgb;
}
fn meteor(rd: vec3f) -> vec3f {
  let T = 31.0; let e = floor(G.time / T); let lt = G.time - e * T - 4.0;
  let dur = 2.8;
  if (lt < 0.0 || lt > dur) { return vec3f(0.0); }
  let h = hash3u(vec3u(u32(e), 7u, 3u));
  let az = (h.x - 0.5) * 5.0; let el = 0.45 + 0.5 * h.y;
  let a = vec3f(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  let az2 = az + 0.3 * sign(h.z - 0.5); let el2 = el - 0.2;
  let b = vec3f(sin(az2) * cos(el2), sin(el2), -cos(az2) * cos(el2));
  let k = lt / dur;
  let head = normalize(mix(a, b, k)); let tv = normalize(a - b);
  let len = 0.02 + 0.1 * smoothstep(0.0, 0.35, k);
  let w = rd - head; let s = clamp(dot(w, tv), 0.0, len); let d = length(w - tv * s);
  let px = 2.0 * G.tanHalfFov * G.invResolution.y;
  let wd = max(0.0012, px * 1.3);
  let fade = sin(k * PI);
  let tail = exp(-d * d / (wd * wd)) * pow(1.0 - s / len, 2.0);
  let hd = exp(-dot(w, w) / (wd * wd * 6.0));
  return vec3f(0.75, 0.88, 1.0) * (tail * 0.9 + hd * 1.6) * fade * fade;
}
fn sky(rd0: vec3f) -> vec3f {
  let rd = vec3f(rd0.x, abs(rd0.y), rd0.z);
  var c = skyBase(rd) + meteor(rd);
  let md = U.moon.xyz;
  let cr = sqrt(1.0 - U.moon.w * U.moon.w);
  if (dot(rd, md) > cr - 0.002) {
    let r = normalize(cross(md, vec3f(0.0, 1.0, 0.0))); let up = cross(r, md);
    let q = vec2f(dot(rd, r), dot(rd, up)) / U.moon.w;
    let tx = textureSampleLevel(moonT, sLin, vec2f(0.5 + q.x * 0.49, 0.5 - q.y * 0.49), 0.0);
    c = mix(c, tx.rgb * 1.2, tx.a);
  }
  return c;
}

// lantern kinematics, closed form in time (the same in the main pass, the mirror pass, glows and light pools)
const LT = 250.0;
const WIND = vec2f(-0.82, -0.5);
struct LS { p: vec3f, a: f32, fl: f32 };
fn lanternAt(i0: vec4f, i1: vec4f) -> LS {   // i0: x, z, phase, seed.  i1: mode (1 = static), y, scale, bob
  var o: LS;
  let sd = i0.w; let t = G.time;
  o.fl = 0.92 + 0.05 * sin(t * 2.1 + sd * 40.0) + 0.03 * sin(t * 4.7 + sd * 90.0);
  if (i1.x > 0.5) {
    o.p = vec3f(i0.x, i1.y + 0.012 * sin(t * 0.7 + sd * 20.0) * i1.w, i0.y);
    o.a = 1.0;
    return o;
  }
  let age = fract(t / LT + i0.z) * LT;
  let a2 = max(age - 7.0, 0.0);
  let y = 0.42 * (a2 - 5.0 * (1.0 - exp(-a2 / 5.0)));
  let sw = vec2f(sin(age * 0.19 + sd * 30.0) + 0.5 * sin(age * 0.43 + sd * 70.0), cos(age * 0.16 + sd * 50.0) + 0.5 * sin(age * 0.37 + sd * 20.0));
  let lift = smoothstep(0.0, 6.0, y);
  let xz = i0.xy + WIND * y * 0.3 + sw * (0.2 + 0.035 * y) * lift;
  o.p = vec3f(xz.x, y + 0.015 + 0.012 * sin(t * 0.7 + sd * 20.0) * (1.0 - lift), xz.y);
  o.a = smoothstep(0.0, 4.0, age) * (1.0 - smoothstep(LT * 0.86, LT, age));
  return o;
}
fn lampLight(p: vec3f, n: vec3f) -> vec3f {
  var c = vec3f(0.0);
  for (var i = 0; i < 3; i++) {
    let L = U.lamps[i].xyz - p; let d2 = dot(L, L);
    c += WARM * U.lamps[i].w * (max(dot(n, L * inverseSqrt(d2)), 0.0) * 0.8 + 0.2) / (1.0 + d2 * 0.55);
  }
  return c;
}
fn stepGlow(p: vec2f) -> f32 {
  var g = 0.0;
  for (var i = 0; i < 12; i++) {
    let s = U.steps[i]; let age = G.time - s.z;
    if (age > 0.0 && age < 16.0) { let d = p - s.xy; g += exp(-dot(d, d) * 7.0) * exp(-age * 0.28) * s.w; }
  }
  return g;
}
