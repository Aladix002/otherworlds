// light beams (depth-aware volumetric cones, drawn after the scene) and the dust that dances in them
@group(1) @binding(0) var DT: texture_depth_2d;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsBeam(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }

fn beam(ro: vec3f, rd: vec3f, tmax: f32, i: i32, jit: f32) -> f32 {
  let F = beamF(i); let d = beamD(i);
  let oc = ro - F; let h0 = dot(oc, d); let hd = dot(rd, d);
  let rp = rd - d * hd; let op = oc - d * h0;
  let Rm = BR0 * 1.45;
  let a = dot(rp, rp); let b = dot(rp, op); let c = dot(op, op) - Rm * Rm;
  let disc = b * b - a * c;
  if (disc <= 0.0 || a < 1e-6) { return 0.0; }
  let sq = sqrt(disc);
  var t0 = max((-b - sq) / a, 0.0); var t1 = min((-b + sq) / a, tmax);
  if (abs(hd) > 1e-4) { let ta = (-0.6 - h0) / hd; let tb = (BLEN - h0) / hd; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
  if (t1 <= t0) { return 0.0; }
  let U = normalize(cross(d, vec3f(0.0, 0.0, 1.0))); let W = cross(d, U);
  let dt = (t1 - t0) / 10.0;
  var s = 0.0;
  for (var k = 0; k < 10; k++) {
    let q = oc + rd * (t0 + (f32(k) + jit) * dt);
    let h = dot(q, d); let R = mix(BR0, BR1, clamp(h / BLEN, 0.0, 1.0));
    let cq = vec2f(dot(q, U), dot(q, W)) / R;
    var dens = exp(-dot(cq, cq) * 2.5);
    dens *= 0.62 + 0.38 * vnoise2(cq * 2.7 + vec2f(G.time * 0.025, f32(i) * 7.0));          // rays: streaks along the cone
    dens *= 0.75 + 0.3 * vnoise3((q + F) * 1.2 + vec3f(0.0, G.time * 0.08, 0.0));           // slow dust
    s += dens * smoothstep(-0.6, 0.3, h);
  }
  return s * dt;
}
@fragment fn fsBeam(in: VO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  let dep = textureLoad(DT, vec2i(in.pos.xy), 0);
  let tmax = select(1e5, G.near / max(dep, 1e-7) / dot(rd, G.camFwd), dep > 0.0);
  let jit = ign(in.pos.xy);
  var s = 0.0;
  for (var i = 0; i < NB; i++) { s += beam(G.camPos, rd, tmax, i, jit); }
  if (s <= 0.0) { discard; }
  return vec4f(vec3f(1.0, 0.5, 0.2) * s * 1.0 * (1.0 - G.transition), 0.0);
}

// ---- dancing dust: every mote is an analytic function of time. Most of them gather into a slowly turning figure
// (double helix, stacked rings, torus knot, spiral funnel, little vortices), hold it, dissolve into drifting dust, reform.
const MT = 34.0;                     // seconds per figure
fn figure(k: u32, u: f32, v: f32, j: u32, tt: f32) -> vec3f {
  if (k == 0u) {
    let a = u * TAU * 2.5 + tt * 0.2 + f32(j & 1u) * PI;
    return vec3f(cos(a) * 0.5, 0.5 + u * 5.2, sin(a) * 0.5);
  } else if (k == 1u) {
    let k6 = f32(j % 6u); let a = v * TAU + tt * 0.28 * (1.0 - 2.0 * f32(j % 2u));
    let r = 0.3 + 0.36 * (0.5 + 0.5 * sin(tt * 0.21 + k6 * 1.1));
    return vec3f(cos(a) * r, 0.7 + k6 * 0.85 + sin(a) * r * 0.3 * sin(tt * 0.17 + k6 * 2.0), sin(a) * r);
  } else if (k == 2u) {
    let ph = u * TAU + tt * 0.07; let r = 0.46 + 0.22 * cos(3.0 * ph);
    return vec3f(r * cos(2.0 * ph), 2.2 + 0.6 * sin(3.0 * ph) + 0.25 * sin(tt * 0.13), r * sin(2.0 * ph));
  } else if (k == 3u) {
    let r = 0.78 * sqrt(u); let a = f32(j) * 2.39996 + tt * 0.22 * (1.4 - u);
    return vec3f(cos(a) * r, 0.9 + 2.6 * u * u, sin(a) * r);
  }
  let c = f32(j % 3u); let ca = c * 2.094 + tt * 0.06;
  let r = 0.34 * sqrt(v); let a = u * TAU * 3.0 + tt * 0.35 / (0.25 + r * 2.0);
  return vec3f(cos(ca) * 0.4 + cos(a) * r, 1.1 + c * 1.25 + 0.25 * sin(tt * 0.19 + c * 2.0) + (r - 0.17) * 0.7, sin(ca) * 0.4 + sin(a) * r);
}
struct MO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsMote(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let b = ii / PER; let j = ii % PER; let dune = b >= u32(NB); let fly = b == 6u;
  let h = hash3u(vec3u(j, b, 7u)); let h2 = hash3u(vec3u(j, b, 19u));
  let lt = G.time + f32(b) * (MT + 3.0) + 17.0;
  let cyc = floor(lt / MT); let ph = lt - cyc * MT;
  // drifting, slowly sinking cloud
  let ca = h.x * TAU + G.time * 0.03 * (h2.x - 0.5); let cr = 0.95 * sqrt(h.y);
  var cloud = vec3f(cos(ca) * cr, fract(h.z - G.time * 0.006 * (0.5 + h2.y)) * 7.5 + 0.1, sin(ca) * cr);
  cloud += 0.12 * vec3f(sin(G.time * 0.21 + h2.z * 40.0), sin(G.time * 0.17 + h2.x * 50.0), sin(G.time * 0.19 + h2.y * 60.0));
  let del = h2.z * 5.0;
  var w = smoothstep(del, del + 6.0, ph) * (1.0 - smoothstep(22.0 + del, 28.0 + del, ph)) * step(h2.x, select(0.62, 0.9, dune)) * select(1.0, 0.0, fly);
  w *= 0.8 + 0.2 * sin(G.time * 0.13 + h2.y * 9.0);                        // figures stay loose, never quite finished
  var fk = (u32(cyc) + b * 2u) % 5u;
  if (dune) { fk = (fk * 3u + 3u) % 5u; cloud = vec3f(cloud.x, cloud.y * 0.5, cloud.z); }     // sand spirals: funnel, helix, vortices
  var fig = figure(fk, h.x, h.y, j, lt) + (h2 - 0.5) * select(0.1, 0.05, dune);
  fig += 0.09 * vec3f(sin(fig.y * 2.3 + G.time * 0.31), 0.0, cos(fig.y * 1.9 + G.time * 0.27));       // the whole figure sways like smoke
  if (fly) { cloud = cloud * vec3f(8.0, 0.8, 8.0) + vec3f(0.0, 0.4, 0.0); }                             // fireflies over the oasis
  let L = mix(cloud, fig, w) * select(1.0, 1.5, dune);
  var mf = MF; let d = select(vec3f(0.0, 1.0, 0.0), beamD(i32(b) % NB), !dune); let U = normalize(cross(d, vec3f(0.0, 0.0, 1.0))); let W = cross(d, U);
  let R = mix(BR0, BR1, clamp(L.y / BLEN, 0.0, 1.0));
  let wp = mf[b] + d * L.y + (U * L.x + W * L.z) * (R / BR0);
  let rr = (L.x * L.x + L.z * L.z) / (BR0 * BR0);
  let lit = select(exp(-rr * 1.6) * 0.92 + 0.08, select(0.35, 1.0 * step(h2.y, 0.12), fly), dune);
  let tw = 0.55 + 0.45 * sin(G.time * (0.8 + h2.y * 1.7) + h.z * 50.0);
  let dist = distance(wp, G.camPos);
  let px = dist * G.tanHalfFov * 2.0 * G.invResolution.y;      // world size of a pixel at the mote
  let sz = (0.007 + 0.012 * h2.z * h2.z) * (1.0 + 0.6 * w) * select(1.0, 2.6, dune);
  let hs = max(sz, px * 1.25);
  var o: MO;
  o.c = cs[vi];
  o.pos = G.viewProj * vec4f(billboard(wp, o.c, vec2f(hs)), 1.0);
  let tint = mix(vec3f(1.0, 0.62, 0.25), hsv2rgb(vec3f(h.x * select(0.9, 0.3, dune) + lt * 0.011 + f32(b) * 0.3, 0.8, 1.0)), select(0.3 + 0.6 * w, 1.0, dune));
  o.col = tint * lit * tw * (sz * sz) / (hs * hs) * (2.2 + 3.0 * w) * smoothstep(0.25, 0.9, dist) * (1.0 - G.transition);
  return o;
}
@fragment fn fsMote(in: MO) -> @location(0) vec4f {
  let g = max(exp(-dot(in.c, in.c) * 4.6) - 0.0101, 0.0);
  return vec4f(in.col * g, 0.0);
}
