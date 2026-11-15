// ---- signed distance functions & operators (iq conventions) ----
fn sdSphere(p: vec3f, r: f32) -> f32 { return length(p) - r; }
fn sdBox(p: vec3f, b: vec3f) -> f32 { let q = abs(p) - b; return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0); }
fn sdRoundBox(p: vec3f, b: vec3f, r: f32) -> f32 { return sdBox(p, b - r) - r; }
fn sdBox2(p: vec2f, b: vec2f) -> f32 { let q = abs(p) - b; return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0); }
fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 { let pa = p - a; let ba = b - a; let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
fn sdCylinder(p: vec3f, h: f32, r: f32) -> f32 { let d = abs(vec2f(length(p.xz), p.y)) - vec2f(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0))); }
fn sdTorus(p: vec3f, R: f32, r: f32) -> f32 { return length(vec2f(length(p.xz) - R, p.y)) - r; }
fn sdPlane(p: vec3f, n: vec3f, h: f32) -> f32 { return dot(p, n) + h; }
fn sdEllipsoid(p: vec3f, r: vec3f) -> f32 { let k0 = length(p / r); let k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
// capped cone centered at origin: half-height h, radius r1 at y=-h, r2 at y=+h
fn sdCappedCone(p: vec3f, h: f32, r1: f32, r2: f32) -> f32 {
  let q = vec2f(length(p.xz), p.y);
  let k1 = vec2f(r2, h); let k2 = vec2f(r2 - r1, 2.0 * h);
  let ca = vec2f(q.x - min(q.x, select(r2, r1, q.y < 0.0)), abs(q.y) - h);
  let cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  let s = select(1.0, -1.0, cb.x < 0.0 && ca.y < 0.0);
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
fn opU(a: f32, b: f32) -> f32 { return min(a, b); }
fn opS(a: f32, b: f32) -> f32 { return max(a, -b); }   // a minus b
fn opI(a: f32, b: f32) -> f32 { return max(a, b); }
fn smin(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
fn smax(a: f32, b: f32, k: f32) -> f32 { return -smin(-a, -b, k); }
fn opRep(p: vec3f, c: vec3f) -> vec3f { return p - c * round(p / c); }
fn opRep2(p: vec2f, c: vec2f) -> vec2f { return p - c * round(p / c); }
