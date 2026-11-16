// Shared: bindings, baked sky lookup, haze/fog, lighting, hex scutes, turtle kinematics.
// G.params = (flow metres, stroke phase, head rise 0..1, head yaw), G.params2 = (breath 0..1, door open, -, -)
@group(1) @binding(0) var skyT: texture_2d<f32>;   // baked dusk dome: u = azimuth, v = sqrt(dir.y)
@group(1) @binding(1) var detT: texture_2d<f32>;   // tiling detail: rg = slope, b = fbm height, a = cells
@group(1) @binding(2) var mskT: texture_2d<f32>;   // r = m to lava edge, g = m along the flow (-1 = hot spring), b = m to pool edge, a = ground height
@group(1) @binding(3) var sL: sampler;
@group(1) @binding(4) var sR: sampler;

const SUNV = vec3f(-0.4225, 0.0453, -0.9053);
const SUNH = vec2f(-0.4229, -0.9062);
const MS = 400.0;
const HEX = 15.0;
const FP = vec3f(88.0, -3.0, -110.0);   // front flipper shoulder (x mirrored)
const FL = 96.0;
const HB = vec3f(0.0, -18.0, -180.0);   // neck base
const HL = 112.0;

fn haze(d: vec3f) -> vec3f {
  let sh = clamp(dot(normalize(d.xz + vec2f(1e-5, 0.0)), SUNH) * 0.5 + 0.5, 0.0, 1.0);
  return mix(vec3f(0.1, 0.105, 0.22), vec3f(0.95, 0.36, 0.13), pow(sh, 2.6)) + vec3f(0.2, 0.055, 0.09) * sh;
}
fn sky(d: vec3f) -> vec3f {
  let uv = vec2f(atan2(d.x, -d.z) / TAU + 0.5, clamp(sqrt(max(d.y, 0.0)), 0.002, 0.998));
  return textureSampleLevel(skyT, sR, uv, 0.0).rgb;
}
fn fog(c: vec3f, w: vec3f) -> vec3f {
  let v = w - G.camPos; let d = length(v);
  let f = max(1.0 - exp(-d * G.fogDensity), smoothstep(3500.0, 8000.0, d));
  return mix(c, haze(v / d), f);
}
fn shade(a: vec3f, n: vec3f, ao: f32) -> vec3f {
  let sun = G.sunColor * wrapDiffuse(n, G.sunDir, 0.4) * mix(0.45, 1.0, ao);
  let back = vec3f(0.1, 0.07, 0.16) * wrapDiffuse(n, vec3f(-G.sunDir.x, 0.3, -G.sunDir.z), 0.6);
  return a * (sun + (hemi(n, G.ambientSky, G.ambientGround) + back) * ao);
}
fn msk(p: vec2f) -> vec4f { return textureSampleLevel(mskT, sL, p / MS + 0.5, 0.0); }

// hex lattice (unit spacing): xy = offset from the cell centre, z = distance to the seam (0..0.5), w = cell hash
fn hexd(p: vec2f) -> vec4f {
  let s = vec2f(1.0, 1.7320508);
  let a = p - s * round(p / s);
  let b = p - s * 0.5 - s * round(p / s - 0.5);
  let g = select(b, a, dot(a, a) < dot(b, b));
  let q = abs(g);
  return vec4f(g, 0.5 - max(q.x, q.x * 0.5 + q.y * 0.8660254), hash21(round((p - g) * 2.0)));
}

// flippers: unit mesh along +x; rear = 1 for the small trailing pair
fn flipM(rear: f32) -> mat3x3f {
  let ph = G.params.y - rear * 2.2;
  let psi = mix(0.12 - 0.72 * cos(ph), 1.2 + 0.14 * cos(ph), rear);
  let phi = mix(0.2 - 0.4 * sin(ph), -0.04 + 0.04 * sin(ph), rear);
  return rotY(-psi) * rotZ(phi) * rotX(mix(0.4 - 0.3 * sin(ph), 0.15, rear));
}
fn flipW(p: vec3f, side: f32, rear: f32) -> vec3f {
  let q = flipM(rear) * (p * mix(FL, FL * 0.55, rear));
  return vec3f(side * (mix(FP.x, 76.0, rear) + q.x), FP.y + q.y, mix(FP.z, 122.0, rear) + q.z);
}
// head + neck: unit mesh, neck rising from the origin toward -z, s = position along it. The head turns on the neck.
fn headR(s: f32) -> mat3x3f { return rotX(0.12 * (G.params.z - 1.0)) * rotY(G.params.w * (0.3 + 2.2 * smoothstep(0.3, 0.75, s))); }
fn headW(p: vec3f, s: f32) -> vec3f {
  let k = smoothstep(0.3, 0.75, s);
  let q = rotY(G.params.w * 0.3) * (HPV + rotY(G.params.w * 2.2 * k) * (p - HPV));
  return HB + vec3f(0.0, -48.0 * (1.0 - G.params.z), 0.0) + rotX(0.12 * (G.params.z - 1.0)) * q * HL;
}

// ocean surface height at island-space xz (swell rides the passing water + the wave trains shed by the front flippers)
fn swell(p: vec2f) -> vec3f {                 // x = height, yz = d/dx, d/dz
  let q = p - vec2f(0.0, G.params.x);
  let t = G.time;
  var h = vec3f(0.0);
  let k1 = vec2f(0.035, 0.095); let a1 = dot(k1, q) + t * 0.55; h += 0.24 * vec3f(sin(a1), cos(a1) * k1);
  let k2 = vec2f(-0.11, 0.12); let a2 = dot(k2, q) + t * 0.8; h += 0.11 * vec3f(sin(a2), cos(a2) * k2);
  let k3 = vec2f(0.21, 0.16); let a3 = dot(k3, q) + t * 1.1; h += 0.05 * vec3f(sin(a3), cos(a3) * k3);
  let c = vec2f(FP.x + 62.0, FP.z + 8.0);
  let dv = vec2f(abs(p.x), p.y) - c; let d = length(dv) + 0.01;
  let a = d * 0.1 - G.params.y + 1.2;
  let env = 0.75 * exp(-d / 110.0) * smoothstep(8.0, 40.0, d);
  h += env * vec3f(sin(a), cos(a) * 0.1 * dv / d * vec2f(sign(p.x), 1.0));
  return h;
}
