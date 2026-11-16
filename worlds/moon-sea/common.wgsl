// Shared by every runtime shader of moon-sea. MIR = -1 in the planar-reflection pass: the world is mirrored about the
// water plane (y = 0) and drawn with the main camera, so the reflection texture is screen-aligned with the main view.
override MIR: f32 = 1.0;
struct MU {
  moon: vec4f,             // xyz = direction, w = sin(angular radius)
  refl: vec4f,             // xy = uv scale of the valid region of the reflection texture
  door: vec4f,             // x, z, yaw, open (0..1)
  misc: vec4f,             // x = door swing side
  lamps: array<vec4f, 4>,  // xyz, intensity (tree lantern, two door lanterns, the lighthouse lamp)
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
fn sky(rd0: vec3f) -> vec3f {
  let rd = vec3f(rd0.x, abs(rd0.y), rd0.z);
  var c = skyBase(rd);
  // the moon is drawn as a disc that stays round on screen (a true angular disc turns into an egg off-axis)
  let fl = select(1.0, -1.0, rd0.y < 0.0);
  let md = vec3f(U.moon.x, U.moon.y * fl, U.moon.z);
  let mz = dot(md, G.camFwd); let rz = dot(rd0, G.camFwd);
  if (mz > 0.15 && rz > 0.02) {
    let pm = vec2f(dot(md, G.camRight), dot(md, G.camUp)) / mz;
    let pr = vec2f(dot(rd0, G.camRight), dot(rd0, G.camUp)) / rz;
    var q = (pr - pm) * mz * sqrt(1.0 - U.moon.w * U.moon.w) / U.moon.w;
    if (dot(q, q) < 1.06) {
      q.y *= fl;
      let tx = textureSampleLevel(moonT, sLin, vec2f(0.5 + q.x * 0.49, 0.5 - q.y * 0.49), 0.0);
      c = mix(c, tx.rgb * 1.3, tx.a);
    }
  }
  return c;
}

// lantern kinematics, closed form in time (the same in the main pass, the mirror pass, glows and light pools)
const LT = 250.0;
const WIND = vec2f(-0.82, -0.5);
struct LS { p: vec3f, a: f32, fl: f32 };
fn lanternAt(i0: vec4f, i1: vec4f) -> LS {   // i0: x, z, phase (static: glow strength), seed.  i1: mode (0 sky, 1 static), y, scale, bob
  var o: LS;
  let sd = i0.w; let t = G.time;
  o.fl = 0.92 + 0.05 * sin(t * 2.1 + sd * 40.0) + 0.03 * sin(t * 4.7 + sd * 90.0);
  if (i1.x > 1.5) {   // drifting floaters (2 = paper boat, 3 = lotus): a slow wander around home, radius i1.w
    let a = t * 0.021 * (0.6 + sd) + sd * 40.0;
    let xz = i0.xy + i1.w * vec2f(sin(a) + 0.4 * sin(a * 2.3 + sd * 9.0), cos(a * 0.83 + sd * 5.0) + 0.4 * sin(a * 1.7));
    o.p = vec3f(xz.x, i1.y + 0.005 * sin(t * 0.9 + sd * 20.0), xz.y);
    o.a = i0.z;
    if (i1.x > 2.5) { o.a *= 0.3 + 0.7 * smoothstep(12.0, 4.5, distance(xz, G.camPos.xz)); }   // lotus candles brighten as you come close
    return o;
  }
  if (i1.x > 0.5) {
    o.p = vec3f(i0.x, i1.y + 0.012 * sin(t * 0.7 + sd * 20.0) * i1.w, i0.y);
    o.a = i0.z;
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
  for (var i = 0; i < 4; i++) {
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
