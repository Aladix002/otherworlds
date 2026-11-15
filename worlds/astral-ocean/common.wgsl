// Shared by whales, trails and fish. Path k = 3 vec4: (c.xyz, R), (e, h, yaw, phase), (speed, u0, dir, L)
// JS twin: pathPos() in world.js. Keep in sync.
struct Path { a: vec4f, b: vec4f, d: vec4f };
@group(1) @binding(0) var<storage, read> paths: array<Path>;

fn aoPathPos(P: Path, u: f32) -> vec3f {
  let lx = P.a.w * cos(u);
  let lz = P.b.x * P.a.w * sin(u);
  let ly = P.b.y * (sin(0.5 * u + P.b.w) + 0.35 * sin(1.37 * u + 2.0 * P.b.w));
  let cy = cos(P.b.z); let sy = sin(P.b.z);
  return P.a.xyz + vec3f(cy * lx + sy * lz, ly, -sy * lx + cy * lz);
}
fn aoPathU(P: Path, t: f32) -> f32 { return P.d.y + P.d.z * P.d.x * t / P.a.w; }
fn aoPathD(P: Path, u: f32) -> vec3f { return (aoPathPos(P, u + 0.002) - aoPathPos(P, u - 0.002)) * 250.0; }

// spine frame of a creature at body fraction s (0 = head, 1 = tail; the body follows the head along the path)
struct Frame { p: vec3f, f: vec3f, r: vec3f, u: vec3f };
fn aoFrame(P: Path, t: f32, s: f32) -> Frame {
  let uh = aoPathU(P, t);
  let us = uh - P.d.z * s * P.d.w / length(aoPathD(P, uh));
  var F: Frame;
  F.p = aoPathPos(P, us);
  F.f = normalize(aoPathD(P, us)) * P.d.z;
  F.r = normalize(cross(F.f, vec3f(0.0, 1.0, 0.0)));
  F.u = cross(F.r, F.f);
  return F;
}

// whale body radius profile (L = 1 units), mirrored in world.js mesh builder
fn aoWave(s: f32, t: f32, ph: f32) -> f32 {
  let a = 0.004 + 0.05 * pow(smoothstep(0.2, 1.0, s), 1.6);
  return a * sin(6.0 * s - t * 0.85 + ph);
}

