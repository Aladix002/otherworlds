// Giant kelp: one indexed "parameter mesh" (stipe rings + blades) instanced per plant, shaped and swayed in the VS.
// vertex: p = (angle, s along the stipe, side -1|0|1), uv.x = 0 stipe | 1 + t blade, uv.y = per-blade random
struct Kelp { a: vec4f, b: vec4f };   // a = (x, yBase, z, stipe length), b = (phase, bladeLen, tint, _)
@group(2) @binding(0) var<storage, read> kelps: array<Kelp>;
@group(2) @binding(1) var<storage, read> vis: array<u32>;

const CUR = vec3f(0.8, 0.0, 0.6);
// stipe centre line: S-bends, slow sway, and - when longer than the water column - a canopy trailing under the surface
fn stipe(s: f32, K: Kelp) -> vec3f {
  let H = K.a.w; let ph = K.b.x; let t = G.time;
  let h = s * H;
  let up = max(-0.9 - K.a.y, 2.0);
  let y = -1.5 * log(exp(-h / 1.5) + exp(-up / 1.5));
  let run = h - y;
  let c3 = cos(ph * 3.0); let s3 = sin(ph * 3.0);
  let bend = (vec3f(c3, 0.0, s3) * sin(s * 4.6 + ph) + vec3f(-s3, 0.0, c3) * sin(s * 7.1 + ph * 1.7) * 0.6) * (0.3 + 0.035 * H) * smoothstep(0.0, 0.14, s);
  let a = sin(t * 0.31 + ph + s * 1.7) * 0.6 + sin(t * 0.19 + ph * 1.7 + s * 2.9) * 0.4;
  let b = sin(t * 0.27 + ph * 2.3 + s * 2.2);
  let sway = (CUR * (a * 0.05 + 0.06) + vec3f(-0.6, 0.0, 0.8) * b * 0.03) * min(H, up) * s * s;
  return vec3f(K.a.x, K.a.y + y + 0.22 * sin(run * 0.6 + t * 0.4 + ph) * min(run * 0.3, 1.0), K.a.z) + CUR * run + bend + sway;
}

struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) k: vec3f, @location(3) sd: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let K = kelps[vis[ii]];
  let s = p.y;
  let base = stipe(s, K);
  let dist = distance(base, G.camPos);
  let px = dist * 2.0 * G.tanHalfFov * G.invResolution.y;
  var w: vec3f; var n: vec3f; var cov = 1.0;
  if (uv.x < 0.5) {
    let T = normalize(stipe(s + 0.02, K) - base);
    let bx = normalize(cross(vec3f(0.0, 0.0, 1.0), T)); let by = cross(T, bx);
    let r0 = 0.042 * (1.25 - 0.6 * s);
    let r = max(r0, px * 0.9);
    cov = pow(r0 / r, 1.6);
    n = bx * cos(p.x) + by * sin(p.x);
    w = base + n * r;
  } else {
    let t = uv.x - 1.0; let rnd = uv.y; let ph = K.b.x;
    let rad = vec3f(cos(p.x), 0.0, sin(p.x));
    let dir = normalize(rad + CUR * 0.6 + vec3f(0.0, 0.55 - 0.6 * rnd, 0.0));
    let L = K.b.y * (0.55 + 0.75 * rnd);
    let fl = sin(G.time * 0.8 + t * 3.5 + p.x * 3.0 + ph) * 0.1 * L * t;
    let droop = 0.75 + 0.4 * sin(p.x * 7.0);
    let along = dir * (L * t) + vec3f(0.0, -droop * L * t * t * 0.5 + fl, 0.0) + CUR * (0.22 * L * t * t);
    let dal = normalize(dir + vec3f(0.0, -droop * t, 0.0) + CUR * (0.44 * t));
    let across = normalize(cross(dal, vec3f(0.0, 1.0, 0.0) + rad * 0.35));
    let nb = cross(across, dal);
    let wd0 = 0.14 * pow(sin(PI * pow(max(t, 0.0), 0.6)), 0.8) * (0.7 + 0.5 * rnd) + 0.012;
    let wd = max(wd0, px * 0.7);
    cov = wd0 / wd;
    let rp = t * 15.0 + rnd * 20.0 + p.z * 1.4 + G.time * 0.5;   // ruffled edges
    let az = abs(p.z);
    w = base + rad * 0.04 + along + across * (p.z * wd) + nb * (sin(rp) * 0.32 * wd0 * az);
    n = normalize(nb + across * (p.z * 0.6) - dal * (cos(rp) * 0.55 * az));
  }
  var o: VO;
  o.w = w; o.n = n; o.k = vec3f(s, uv.x, K.b.z); o.sd = vec2f(p.z, max(cov, 0.2) * mix(1.0, 0.3, uss(30.0, 65.0, dist)));
  o.pos = G.viewProj * vec4f(w, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let wp = in.w;
  let blade = step(0.5, in.k.y);
  let t = in.k.y - 1.0;
  let vv = wp - G.camPos; let d = length(vv); let v = vv / max(d, 1e-4);
  var n = normalize(in.n);
  if (dot(n, v) > 0.0) { n = -n; }
  let nz = textureSample(tNoise, sRep, wp.xz * 0.13 + wp.y * 0.09 + G.time * vec2f(0.006, 0.004));
  let sd = abs(in.sd.x);
  // olive-gold lamina, darker at the base, fine slanted veins and a pale midrib
  var alb = mix(vec3f(0.3, 0.19, 0.04), vec3f(0.6, 0.38, 0.06), blade);
  alb *= mix(1.0, (0.6 + 0.5 * t) * (0.86 + 0.14 * sin(t * 90.0 - sd * 9.0)), blade);
  alb = mix(alb, vec3f(0.82, 0.62, 0.22), blade * smoothstep(0.16, 0.02, sd) * 0.45);
  alb *= mix(vec3f(1.0), vec3f(1.15, 0.84, 0.6), in.k.z);
  let L = lightAt(wp.y);
  let w = waterAt(wp.y);
  let ao = mix(0.4, 1.0, smoothstep(0.0, 0.5, in.k.x));
  let dap = 0.5 + 1.0 * nz.r;   // drifting light dapple under the canopy
  let ndl = dot(n, SUN);
  let mu = max(dot(v, SUN), 0.0);
  // light coming through the thin blade from behind: saturated amber
  let trans = (max(-ndl, 0.0) * 1.2 + 1.8 * mu * mu * mu + 0.12) * blade * (0.5 + 0.5 * sd);
  var c = alb * (L * (max(ndl, 0.0) * 0.6 + 0.22) * dap * ao + w * mix(0.35, 0.9, n.y * 0.5 + 0.5) * (0.4 + 0.6 * ao))
        + alb * vec3f(1.6, 0.95, 0.3) * L * (trans * dap * ao);
  // fog; sub-pixel-thin parts fade into the water instead of aliasing
  let f = 1.0 - (1.0 - fogF(d)) * in.sd.y;
  if (1.0 - f < 0.45 * fract(52.98 * fract(dot(in.pos.xy, vec2f(0.0671, 0.00584))))) { discard; }
  c = mix(c * exp(-d * vec3f(0.014, 0.004, 0.003)), uwFogCol(v, d), f);
  return vec4f(c, 1.0);
}
