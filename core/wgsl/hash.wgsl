// ---- math constants & small helpers ----
const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

fn remap(x: f32, a: f32, b: f32, c: f32, d: f32) -> f32 { return c + (d - c) * clamp((x - a) / (b - a), 0.0, 1.0); }
fn rot2(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }
fn rotX(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
fn rotY(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
fn rotZ(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
fn quatRotate(q: vec4f, v: vec3f) -> vec3f { let t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
fn quatAxisAngle(axis: vec3f, a: f32) -> vec4f { return vec4f(axis * sin(a * 0.5), cos(a * 0.5)); }

// ---- hashing (integer PCG; bit-exact mirror in core/src/noise.js) ----
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn pcg3d(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
fn u2f(h: u32) -> f32 { return f32(h >> 8u) * (1.0 / 16777216.0); }     // [0,1)
fn hash2i(c: vec2i) -> u32 { return pcg(u32(c.x) + pcg(u32(c.y))); }
fn hash3i(c: vec3i) -> u32 { return pcg(u32(c.x) + pcg(u32(c.y) + pcg(u32(c.z)))); }
fn hash11(x: f32) -> f32 { return u2f(pcg(bitcast<u32>(x))); }
fn hash1u(x: u32) -> f32 { return u2f(pcg(x)); }
fn hash21(p: vec2f) -> f32 { return u2f(pcg(bitcast<u32>(p.x) + pcg(bitcast<u32>(p.y)))); }
fn hash31(p: vec3f) -> f32 { return u2f(pcg(bitcast<u32>(p.x) + pcg(bitcast<u32>(p.y) + pcg(bitcast<u32>(p.z))))); }
fn hash22(p: vec2f) -> vec2f { let h = pcg(bitcast<u32>(p.x) + pcg(bitcast<u32>(p.y))); return vec2f(u2f(h), u2f(pcg(h))); }
fn hash33(p: vec3f) -> vec3f { let h = pcg3d(bitcast<vec3u>(p)); return vec3f(h >> vec3u(8u)) * (1.0 / 16777216.0); }
fn hash3u(v: vec3u) -> vec3f { let h = pcg3d(v); return vec3f(h >> vec3u(8u)) * (1.0 / 16777216.0); }
