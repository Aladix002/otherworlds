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
const FP = vec3f(84.0, -4.5, -108.0);   // front flipper shoulder (x mirrored)
const FL = 96.0;
const HB = vec3f(0.0, -12.0, -178.0);   // neck base
const HL = 112.0;

const MOON = vec3f(-0.0976, 0.3584, -0.9285);
// the second moon: colossal, pale, ringed, very close. rgb = light to add, a = how much of the sky behind it is hidden
fn moon(d: vec3f, ns: f32) -> vec4f {
  if (dot(d, MOON) < 0.8) { return vec4f(0.0); }
  let rt = normalize(vec3f(-MOON.z, 0.0, MOON.x));
  let q = vec2f(dot(d, rt), dot(d, cross(rt, MOON))) / 0.16;
  let r = length(q);
  let n = vec3f(q, sqrt(max(1.0 - r * r, 0.0)));
  let lit = smoothstep(-0.25, 0.6, dot(n, vec3f(-0.55, -0.78, 0.3)));
  let disc = smoothstep(1.0, 0.985, r);
  let surf = mix(vec3f(0.62, 0.5, 0.8), vec3f(1.2, 1.02, 0.95), smoothstep(0.36, 0.62, ns)) * (0.7 + 0.3 * n.z);
  var c = (surf * (0.05 + lit) + vec3f(0.03, 0.06, 0.1) * (1.0 - lit)) * disc;
  var a = disc * (0.16 + 0.8 * lit);
  let qr = rot2(0.4) * q;
  let e = length(vec2f(qr.x, qr.y / 0.2));
  let band = smoothstep(1.4, 1.5, e) * smoothstep(2.0, 1.85, e) * (0.6 + 0.4 * sin(e * 38.0)) * (1.0 - disc * step(0.0, qr.y));
  c += vec3f(1.0, 0.72, 0.8) * band * 0.55 + vec3f(0.5, 0.4, 0.6) * exp(-max(r - 1.0, 0.0) * 4.0) * 0.1 * (1.0 - disc);
  a = max(a, band * 0.35);
  return vec4f(c, a);
}
fn haze(d: vec3f) -> vec3f {
  let sh = clamp(dot(normalize(d.xz + vec2f(1e-5, 0.0)), SUNH) * 0.5 + 0.5, 0.0, 1.0);
  return mix(vec3f(0.15, 0.14, 0.29), vec3f(0.95, 0.36, 0.13), pow(sh, 2.6)) + vec3f(0.2, 0.055, 0.09) * sh;
}
fn sky(d: vec3f) -> vec3f {
  let uv = vec2f(atan2(d.x, -d.z) / TAU + 0.5, clamp(sqrt(max(d.y, 0.0)), 0.002, 0.998));
  return textureSampleLevel(skyT, sR, uv, 0.0).rgb;
}
fn fog(c: vec3f, w: vec3f) -> vec3f {
  let v = w - G.camPos; let d = length(v);
  let f = max(1.0 - exp(-d * G.fogDensity), smoothstep(1200.0, 5000.0, d));
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
  let psi = mix(0.15 - 0.8 * cos(ph), 1.2 + 0.14 * cos(ph), rear);
  let phi = mix(0.09 - 0.25 * sin(ph), -0.04 + 0.04 * sin(ph), rear);
  return rotY(-psi) * rotZ(phi) * rotX(mix(0.35 - 0.25 * sin(ph), 0.15, rear));
}
fn flipW(p: vec3f, side: f32, rear: f32) -> vec3f {
  let q = flipM(rear) * (p * mix(FL, FL * 0.55, rear));
  return vec3f(side * (mix(FP.x, 76.0, rear) + q.x), FP.y + q.y, mix(FP.z, 122.0, rear) + q.z);
}
// head + neck: unit mesh, neck rising from the origin toward -z, s = position along it. The head turns on the neck.
fn headA(s: f32) -> f32 { return G.params.w * (0.35 + 1.5 * smoothstep(0.05, 0.9, s)); }      // the whole neck sweeps round in an arc
fn headR(s: f32) -> mat3x3f { return rotX(0.12 * (G.params.z - 1.0)) * rotY(headA(s)); }
fn headW(p: vec3f, s: f32) -> vec3f {
  return HB + vec3f(0.0, -48.0 * (1.0 - G.params.z), 0.0) + headR(s) * p * HL;
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
