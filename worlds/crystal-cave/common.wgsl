// shared constants and helpers (the JS twins live in cave.js)
override MIRROR: f32 = 0.0;          // 1 = planar reflection pass (geometry mirrored about the water level)
const WL = -0.55;
const POOLC = vec2f(40.0, -14.0);
const DOORC = vec3f(-42.0, 0.3, -10.0);
const SHA = vec3f(12.33, 44.0, -48.5);
const SHB = vec3f(7.4, 0.0, -44.8);

fn floorY(p: vec2f) -> f32 {
  var h = 0.2 + 0.75 * fbm2(p * 0.045, 3);
  let dp = distance(p, POOLC);
  h += (0.1 - h) * 0.7 * (1.0 - smoothstep(9.0, 15.0, dp));
  h += -1.2 * (1.0 - smoothstep(4.0, 10.5, dp)) + 0.3 * smoothstep(8.0, 11.5, dp) * (1.0 - smoothstep(11.5, 15.0, dp));
  return h + (DOORC.y - h) * (1.0 - smoothstep(2.6, 5.5, distance(p, DOORC.xz)));
}
fn mir(p: vec3f) -> vec3f { return vec3f(p.x, mix(p.y, 2.0 * WL - p.y, MIRROR), p.z); }
fn mirN(n: vec3f) -> vec3f { return vec3f(n.x, n.y * (1.0 - 2.0 * MIRROR), n.z); }
// very slow breathing of the crystal light, two incommensurate rates
fn pulse(ph: f32) -> f32 { return 1.0 + 0.11 * sin(G.time * 0.31 + ph) + 0.06 * sin(G.time * 0.173 + ph * 2.7); }
// things brighten gently as you come close
fn prox(w: vec3f) -> f32 { return 1.0 - smoothstep(3.0, 17.0, distance(w, G.camPos)); }
fn spectrum(t: f32) -> vec3f { return 0.5 + 0.5 * cos(TAU * (t + vec3f(0.0, 0.33, 0.67))); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// distance from p to the moonlight shaft axis, and the axial coordinate (0 top .. 1 floor)
fn shaftRad(p: vec3f) -> vec2f {
  let u = SHB - SHA; let l = length(u); let d = u / l; let s = dot(p - SHA, d);
  return vec2f(length(p - SHA - d * s), s / l);
}
