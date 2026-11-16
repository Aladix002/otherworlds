// transparent things: pool water (planar reflection + drop ripples), falling drops, moonlight shaft, soft light pools
struct Drops { d: array<vec4f, 5> };          // x, z, impact time, strength
@group(1) @binding(0) var<uniform> DR: Drops;
@group(1) @binding(1) var rtex: texture_2d<f32>;
@group(1) @binding(2) var rsmp: sampler;

struct WV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) depth: f32 };
@vertex fn vsWater(@location(0) p: vec3f) -> WV {
  var o: WV;
  o.w = vec3f(p.x + POOLC.x, WL, p.z + POOLC.y);
  o.depth = WL - floorY(o.w.xz);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
// gradient of the water height: a barely moving swell plus expanding rings from the drops
fn ripple(p: vec2f) -> vec2f {
  let t = G.time;
  var g = 0.006 * vec2f(cos(p.x * 1.3 + t * 0.4 + sin(p.y * 0.7)), cos(p.y * 1.7 - t * 0.33 + sin(p.x * 0.9)));
  g += 0.003 * vec2f(cos(p.x * 4.1 - t * 0.7 + p.y * 2.0), cos(p.y * 3.7 + t * 0.6 - p.x * 1.5));
  g += 0.002 * vec2f(cos(p.x * 11.0 + t * 0.9 - p.y * 7.0), cos(p.y * 9.0 - t * 0.8 + p.x * 6.0));
  for (var i = 0; i < 5; i++) {
    let d = DR.d[i]; let age = t - d.z;
    if (age > 0.0 && age < 11.0) {
      let v = p - d.xy; let r = length(v) + 1e-3; let x = r - age * 0.5;
      g += v / r * (cos(x * 22.0) * exp(-x * x * 6.0) * exp(-age * 0.4) * d.w * min(age * 3.0, 1.0) * 0.16 / (0.5 + r));
    }
  }
  return g;
}
// the pool does not only mirror the cave: deep down a small galaxy turns slowly
fn galaxy(q: vec2f) -> vec3f {
  let r = length(q); let a = atan2(q.y, q.x) + G.time * 0.012;
  let arm = 0.5 + 0.5 * cos(2.0 * a - 5.5 * log(r + 0.12));
  let n = fbm2(q * 3.2 + vec2f(3.0, G.time * 0.004), 3) * 0.5 + 0.5;
  let disk = exp(-r * 1.5);
  var c = vec3f(0.45, 0.22, 0.85) * arm * n * disk * 1.5 + vec3f(1.0, 0.8, 0.6) * exp(-r * r * 16.0) + vec3f(0.08, 0.35, 0.5) * n * n * exp(-r * 0.8) * 0.6;
  let g = q * 30.0; let h = hash22(floor(g)); let f = fract(g) - 0.5 - (h - 0.5) * 0.6;
  c += vec3f(0.8, 0.9, 1.0) * step(0.84, h.x) * exp(-dot(f, f) * 70.0) * (0.5 + 0.5 * sin(G.time * (0.5 + h.y) + h.y * 40.0)) * (0.5 + 1.5 * disk);
  return c;
}
@fragment fn fsWater(in: WV) -> @location(0) vec4f {
  let g = ripple(in.w.xz);
  let n = normalize(vec3f(-g.x, 1.0, -g.y));
  let V = normalize(G.camPos - in.w);
  let ndv = clamp(dot(n, V), 0.0, 1.0);
  let F = 0.2 + 0.8 * pow(1.0 - ndv, 3.0);
  let dist = distance(in.w, G.camPos);
  let uv = clamp(in.pos.xy * G.invResolution + g * vec2f(0.7, 1.2) / (1.0 + dist * 0.1), vec2f(0.002), vec2f(0.998));
  let refl = textureSampleLevel(rtex, rsmp, uv, 0.0).rgb;
  let T = exp(-max(in.depth, 0.0) * 1.6);
  let edge = smoothstep(0.0, 0.16, in.depth);
  let a = (F + (1.0 - F) * (1.0 - T) * 0.9) * edge;
  let rr = refract(-V, n, 0.75);
  let gal = galaxy((in.w.xz - POOLC) * 0.11 + rr.xz / (abs(rr.y) + 0.4) * 0.45);
  var col = (refl * F * 0.8 + (vec3f(0.006, 0.03, 0.042) + gal * 0.55) * (1.0 - F) * (1.0 - T)) * edge;
  let fa = fogAmount(dist);
  col = mix(col, G.fogColor * a, fa);
  return vec4f(col, a);
}

// drops falling from the ceiling into the pool
struct DV { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) a: f32 };
@vertex fn vsDrop(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> DV {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let d = DR.d[ii]; let tau = d.z - G.time;
  let h = tau * (2.2 + 2.3 * tau);
  let c = vec3f(d.x, WL + h, d.y);
  var o: DV;
  o.c = cs[vi];
  o.a = select(0.0, 1.0, tau > 0.0 && tau < 1.9) * (1.0 - smoothstep(1.5, 1.9, tau));
  let px = distance(c, G.camPos) * 2.0 * G.tanHalfFov / G.resolution.y;
  let wd = max(0.012, px * 1.2);
  o.pos = G.viewProj * vec4f(billboardY(c, o.c, vec2f(wd, 0.05 + 0.03 * tau)), 1.0);
  o.a *= 0.012 / wd;
  return o;
}
@fragment fn fsDrop(in: DV) -> @location(0) vec4f {
  let f = exp(-dot(in.c, in.c) * 2.5) - 0.08;
  return vec4f(vec3f(0.55, 0.75, 1.0) * max(f, 0.0) * in.a * 2.5, 0.0);
}

// moonlight shaft: analytic cylinder of fog around the chimney axis, drawn on a bounding box
struct SV { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsShaft(@location(0) p: vec3f) -> SV {
  var o: SV;
  o.w = p * vec3f(15.0, 30.0, 14.0) + vec3f(10.0, 14.6, -46.6);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsShaft(in: SV) -> @location(0) vec4f {
  let ro = G.camPos; let rd = normalize(in.w - ro);
  let uu = SHB - SHA; let al = length(uu); let u = uu / al;
  let R = 3.1;
  let oc = ro - SHA;
  let dp = rd - u * dot(rd, u); let op = oc - u * dot(oc, u);
  let a = dot(dp, dp); let b = dot(op, dp); let c = dot(op, op) - R * R;
  let disc = b * b - a * c;
  if (disc <= 0.0 || a < 1e-5) { discard; }
  let sq = sqrt(disc);
  var t0 = max((-b - sq) / a, 0.0); var t1 = (-b + sq) / a;
  // clip to the lit part of the axis (below the chimney mouth, above the floor)
  let s0 = dot(oc, u); let ds = dot(rd, u);
  let lo = 8.0; let hi = al + 0.4;
  if (abs(ds) > 1e-4) {
    let ta = (lo - s0) / ds; let tb = (hi - s0) / ds;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  }
  if (t1 <= t0) { discard; }
  let tm = 0.5 * (t0 + t1);
  let pm = ro + rd * tm;
  let s = clamp(dot(pm - SHA, u) / al, 0.0, 1.0);
  // a cone: narrow at the chimney mouth, spreading toward the floor; dense core, soft edge, thinning with depth
  let dmin = sqrt(max(dot(op, op) - b * b / a, 0.0)) / mix(1.7, 3.1, s);
  let prof = pow(max(1.0 - dmin * dmin, 0.0), 2.2);
  let q = pm - SHA;
  let e1 = normalize(cross(u, vec3f(1.0, 0.0, 0.0))); let e2 = cross(u, e1);
  let qd = normalize(vec2f(dot(q, e1), dot(q, e2)) + vec2f(1e-4, 0.0));
  let streak = 0.7 + 0.3 * vnoise3(vec3f(qd * 1.7, s * 4.0 - G.time * 0.03)) + 0.2 * vnoise3(vec3f(qd * 4.5 + 3.0, s * 11.0 + G.time * 0.02));
  let dens = (t1 - t0) / (2.0 * R) * prof * streak * mix(1.5, 0.45, s) * (1.0 - smoothstep(0.9, 1.0, s) * 0.7);
  var col = vec3f(0.5, 0.72, 1.0) * dens * 0.34 * exp(-tm * G.fogDensity);
  col += (ign(in.pos.xy) - 0.5) * 0.004 * dens;
  return vec4f(max(col, vec3f(0.0)), 0.0);
}

// soft additive light pools around crystal clusters
struct HV { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsHalo(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> HV {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let toCam = G.camPos - a.xyz; let d = length(toCam);
  let c = a.xyz + toCam / d * min(a.w * 0.6, d * 0.5);
  var o: HV;
  o.c = cs[vi];
  o.col = b.rgb * pulse(b.w) * smoothstep(1.5, 6.0, d) * exp(-d * G.fogDensity);
  o.pos = G.viewProj * vec4f(billboard(c, o.c, vec2f(a.w) * vec2f(1.0, 0.75 + 0.5 * fract(b.w * 3.7))), 1.0);
  return o;
}
@fragment fn fsHalo(in: HV) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let f = max(exp(-r2 * 3.2) - 0.0408, 0.0);
  let col = in.col * f * f * (1.0 + (ign(in.pos.xy) - 0.5) * 0.08);
  return vec4f(col, 0.0);
}

// the stream: a ribbon at the stream level; where the bed is above it the water is simply not there
struct TV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) q: vec3f };
@vertex fn vsStream(@location(0) a: vec4f) -> TV {
  var o: TV;
  o.w = vec3f(a.x, SW, a.y); o.q = vec3f(a.z, a.w, SW - floorY(a.xy));
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsStream(in: TV) -> @location(0) vec4f {
  let edge = smoothstep(0.0, 0.14, in.q.z);
  if (edge <= 0.0) { discard; }
  let t = G.time; let u = in.q.x; let s = in.q.y;
  let n1 = snoise2(vec2f(u * 1.3, s * 0.7 + t * 0.45));         // it runs toward the pond, where the waterfall climbs back up
  let n2 = snoise2(vec2f(u * 3.1 + 7.0, s * 1.9 + t * 0.8));
  // rings where the waterfall lands
  let rv = in.w.xz - G.params.xz; let rf = length(rv);
  let ring = sin(rf * 7.0 + t * 3.0) * exp(-rf * 0.6);
  let V = normalize(G.camPos - in.w);
  let g = vec2f(0.07 * n1 + 0.04 * n2, 0.05 * n2 - 0.04 * n1) + rv / (rf + 0.2) * ring * 0.12;
  let n = normalize(vec3f(g.x, 1.0, g.y));
  let F = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
  let dist = distance(in.w, G.camPos);
  let moon = 1.0 - smoothstep(1.0, 4.4, shaftRad(in.w).x);
  let env = mix(vec3f(0.03, 0.13, 0.075), vec3f(0.03, 0.05, 0.09), smoothstep(-16.0, -4.0, in.w.x)) + vec3f(0.45, 0.65, 0.95) * moon * 0.7;
  let glint = exp(-n1 * n1 * 40.0) * (0.55 + 0.45 * n2) * (1.0 - smoothstep(14.0, 30.0, dist));
  // the water carries its own faint light: glints run with the current and rings close in on the rising column
  let col = (env * (0.3 + 1.6 * F + 4.0 * glint + 3.0 * max(ring, 0.0) + 2.5 * exp(-rf * 0.9))) * edge * exp(-dist * G.fogDensity);
  return vec4f(col, edge * (0.4 + 0.5 * F));
}
// the waterfall sheet: it rises out of the pond and pours up into the spout
struct FV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) v: f32 };
@vertex fn vsFall(@location(0) a: vec4f) -> FV {
  var o: FV;
  o.w = a.xyz + vec3f(0.04 * sin(G.time * 0.9 + a.y * 1.7), 0.0, 0.04 * sin(G.time * 0.7 + a.y * 1.3)); o.v = a.w;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsFall(in: FV) -> @location(0) vec4f {
  let t = G.time;
  let u = (in.w.x + in.w.z) * 6.0;
  let s1 = vnoise2(vec2f(u, in.w.y * 1.6 - t * 1.5)) * 0.5 + 0.5;                  // the streaks run upward
  let s2 = vnoise2(vec2f(u * 2.6 + 3.0, in.w.y * 3.0 - t * 2.4)) * 0.5 + 0.5;
  let V = normalize(G.camPos - in.w);
  let rim = 1.0 - abs(dot(normalize(cross(dpdx(in.w), dpdy(in.w))), V));
  let a = (0.22 + 0.45 * s1 * s2 + 0.45 * rim * rim) * smoothstep(0.0, 0.04, in.v);
  let col = vec3f(0.05, 0.2, 0.14) + vec3f(0.4, 0.8, 0.65) * (pow(s1 * s2, 1.5) * 1.5 + 0.7 * rim * rim * rim);
  return vec4f(col * a * exp(-distance(in.w, G.camPos) * G.fogDensity), a * 0.8);
}
