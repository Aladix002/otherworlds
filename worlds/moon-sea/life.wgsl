// Life and landmarks: glowing fish pods and a turtle under the mirror, fireflies, the lighthouse and its beam,
// a far whale fluke. Everything is closed-form in time (no simulation state), so the mirror pass and the shots agree.
const QC = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));

// ---- swimmers: flat sprites just above the water plane (the water is a few centimetres deep) ----
struct SWO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) k: vec3f };
fn podPath(h: vec2f, ph: f32, r: f32, a0: f32) -> vec2f {
  let a = a0 + ph * 40.0;
  return h + r * vec2f(sin(a) + 0.35 * sin(2.3 * a + ph * 5.0), cos(a * 0.77 + ph * 3.0) + 0.3 * sin(1.9 * a));
}
// a: home x, z, time lag, lateral offset.  b: half length, seed, kind (1 = turtle), pod phase
@vertex fn vsSwim(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> SWO {
  let cs = QC[vi];
  let turtle = b.z > 0.5;
  let r = select(9.0, 10.0, turtle);
  let tt = (G.time - a.z) * select(0.035, 0.02, turtle);
  var c = podPath(a.xy, b.w, r, tt);
  let f = normalize(podPath(a.xy, b.w, r, tt + 0.02) - c + vec2f(1e-6, 0.0));
  let s = vec2f(-f.y, f.x);
  c += s * (a.w + select(0.25 * sin(G.time * 0.5 + b.y * 50.0), 0.0, turtle));
  if (!turtle) {   // the pod parts softly around the walker
    let aw = c - G.camPos.xz; let d = length(aw) + 1e-3;
    c += aw / d * 1.8 * smoothstep(3.5, 0.6, d);
  }
  let d = distance(vec3f(c.x, 0.0, c.y), G.camPos);
  var off = f * cs.x * b.x + s * cs.y * b.x * select(0.7, 1.0, turtle);
  if (!turtle) {   // far fish are stretched along the view line, so they stay soft blobs instead of dashes
    let vd = normalize(c - G.camPos.xz);
    off += vd * dot(off, vd) * (clamp(d / (G.camPos.y * 1.7), 1.0, 6.0) - 1.0);
  }
  let w = c + off;
  let h = textureSampleLevel(hT, sLin, (c - HMAP.xy) / HMAP.z + 0.5, 0.0).r;
  var o: SWO;
  o.q = cs;
  o.k = vec3f(b.z, b.y, smoothstep(-0.03, -0.058, h) * (1.0 - smoothstep(24.0, 55.0, d)) * smoothstep(0.05, 0.16, G.camPos.y / d));
  o.pos = G.viewProj * vec4f(w.x, 0.004 + d * 0.0015, w.y, 1.0);
  if (o.k.z < 0.01) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
fn seg2(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
@fragment fn fsSwim(in: SWO) -> @location(0) vec4f {
  let t = G.time; let sd = in.k.y; let q = in.q;
  if (in.k.x < 0.5) {
    // fish: no outline, only light: a soft body, a brighter spine, a trail that fades behind the wagging tail
    let y = q.y + 0.2 * sin(t * (3.0 + 2.0 * sd) + sd * 40.0 + q.x * 2.5) * (0.5 - 0.5 * q.x);
    let bw = 0.3 * (0.75 + 0.25 * q.x);
    let f = (q.x - 0.25) * (q.x - 0.25) / 0.34 + y * y / (bw * bw);
    let body = exp(-f * 1.6);
    let trail = exp(-y * y * 9.0) * smoothstep(-1.0, -0.3, q.x) * smoothstep(0.5, -0.2, q.x) * 0.3;
    let edge = 1.0 - smoothstep(0.55, 1.0, max(abs(q.x), abs(q.y)));
    let gold = step(0.82, sd);
    let tint = mix(vec3f(0.12, 0.6, 0.9), vec3f(0.9, 0.78, 0.5), gold);
    let core = mix(vec3f(0.65, 0.9, 1.0), vec3f(1.0, 0.93, 0.75), gold);
    let c = (tint * (body * 0.42 + trail) + core * exp(-f * 5.0) * 0.3) * edge * (0.8 + 0.2 * sin(t * 0.9 + sd * 70.0));
    return vec4f(c * in.k.z, 0.0);
  }
  // turtle: a dark shape deep under the mirror; only the shell ridges and a dusting of plankton carry light
  let sw = sin(t * 0.8) * 0.28; let sw2 = sin(t * 0.8 - 1.2) * 0.2;
  let ay = abs(q.y);
  let p = vec2f(q.x, ay);
  let ds = (length((q - vec2f(-0.02, 0.0)) / vec2f(0.5, 0.39)) - 1.0) * 0.4;
  let dh = length((q - vec2f(0.61, 0.0)) / vec2f(1.0, 0.75)) - 0.12;
  let ft = clamp((ay - 0.28) / 0.5, 0.0, 1.0);
  let ff = seg2(p, vec2f(0.33, 0.28), vec2f(0.0 - sw * 0.6, 0.76)) - mix(0.15, 0.035, ft * ft);
  let rt = clamp((ay - 0.2) / 0.25, 0.0, 1.0);
  let fr = seg2(p, vec2f(-0.36, 0.2), vec2f(-0.66 - sw2 * 0.2, 0.4 + sw2 * 0.3)) - mix(0.1, 0.03, rt);
  let tl = seg2(q, vec2f(-0.5, 0.0), vec2f(-0.64, 0.0)) - 0.025;
  let d = smin(smin(ds, dh, 0.05), smin(min(ff, fr), tl, 0.03), 0.05);
  let body = smoothstep(0.035, -0.045, d);                      // soft, as seen through water
  let shell = smoothstep(0.01, -0.09, ds);
  let v = voronoi2(q * vec2f(4.6, 5.6) + 2.3);
  let ridge = smoothstep(0.26, 0.0, v.y - v.x) * shell;
  let dome = clamp(1.0 + ds * 2.2, 0.0, 1.0);                    // brighter toward the rim of the carapace
  let spk = voronoi2(q * 21.0 + vec2f(t * 0.05, 0.0));
  let dust = exp(-spk.x * spk.x * 60.0) * step(0.55, spk.z) * (0.5 + 0.5 * sin(t * (0.6 + spk.z) + spk.z * 40.0)) * smoothstep(0.22, 0.0, abs(d + 0.03));
  let teal = vec3f(0.2, 0.46, 0.52);
  var c = teal * (ridge * (0.1 + 0.16 * dome) + shell * 0.035 + body * (1.0 - shell) * 0.04 * (1.0 - ft)) + vec3f(0.5, 0.85, 0.9) * dust * 0.3;
  let a = body * 0.62 * in.k.z;
  return vec4f(c * in.k.z + vec3f(0.006, 0.012, 0.02) * a, a);
}

// ---- fireflies ----
struct FO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) a: f32 };
// a: home xyz, wander radius.  b: seed, height range
@vertex fn vsFly(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> FO {
  let t = G.time; let s = b.x;
  let w = vec3f(sin(t * (0.11 + 0.1 * s) + s * 50.0) + 0.5 * sin(t * 0.37 + s * 90.0),
                sin(t * (0.17 + 0.07 * s) + s * 20.0) * 0.6 + 0.4 * sin(t * 0.53 + s * 33.0),
                cos(t * (0.13 + 0.09 * s) + s * 70.0) + 0.5 * sin(t * 0.31 + s * 11.0));
  var p = a.xyz + w * vec3f(a.w, b.y, a.w);
  p.y = max(p.y, 0.06) * MIR;
  let d = distance(p, G.camPos);
  let bl = pow(max(sin(t * (0.5 + 0.5 * s) + s * 200.0), 0.0), 2.0) * (0.6 + 0.4 * sin(t * 0.13 + s * 9.0));
  let hs = max(0.075, d * G.tanHalfFov * G.invResolution.y * 4.5);
  var o: FO;
  o.pos = G.viewProj * vec4f(billboard(p, QC[vi], vec2f(hs)), 1.0);
  o.c = QC[vi];
  o.a = bl * (1.0 - fogAmount(d)) * min(1.0, 0.075 / hs * 3.0) * (1.0 - smoothstep(110.0, 170.0, d)) * smoothstep(0.7, 3.0, d);   // never a blob in the face
  if (o.a < 0.004) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsFly(in: FO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let g = max(exp(-r2 * 22.0) - 0.0001, 0.0) * 3.4 + max(exp(-r2 * 4.0) - 0.0183, 0.0) * 0.5;
  return vec4f(vec3f(0.62, 1.0, 0.3) * g * in.a, 0.0);
}

// ---- the lighthouse (world-space mesh; uv.x = material: 0 stone, 1 lamp glass, 2 dark metal) ----
struct HO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vsHouse(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> HO {
  var o: HO; o.w = p; o.n = n; o.uv = uv; o.pos = clipW(p); return o;
}
const BEAM_W = 0.21;
fn beamDir(i: f32) -> vec3f { let a = G.time * BEAM_W + i * PI; return vec3f(cos(a), -0.035, sin(a)); }
@fragment fn fsHouse(in: HO) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let p = in.w; let L = U.lamps[3].xyz;
  let lp = p - L;                       // the lamp sits 6.3 m above the base
  let V = normalize(eye() - p);
  let n = normalize(in.n);
  let ang = atan2(lp.z, lp.x); let hy = lp.y + 6.3;
  var c: vec3f;
  if (in.uv.x > 1.5) {
    c = vec3f(0.03, 0.035, 0.045) * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.2) + G.ambientSky) + WARM * 0.05 * exp(-abs(lp.y) * 1.2);
    c += G.sunColor * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.1;
  } else if (in.uv.x > 0.5) {
    // the lamp room: warm glass with mullions, brighter where a beam leaves it
    let bd = beamDir(0.0);
    let fl = pow(abs(dot(normalize(vec3f(n.x, 0.0, n.z)), normalize(vec3f(bd.x, 0.0, bd.z)))), 6.0);
    c = vec3f(1.0, 0.72, 0.36) * (1.3 + 3.5 * fl) * (1.0 - 0.75 * smoothstep(0.35, 0.47, abs(fract(ang / TAU * 8.0) - 0.5)));
    c *= 0.8 + 0.2 * sin(G.time * 1.3) * sin(G.time * 0.37);
  } else {
    // whitewashed stone: courses, weathering, a slate band, a lit window and a dark door toward the open sea
    let g = fbm3(p * 1.7, 3); let g2 = fbm3(p * 9.0, 2);
    let row = floor(hy / 0.34);
    let jx = fract(ang / TAU * 14.0 + 0.5 * row) - 0.5; let jy = fract(hy / 0.34) - 0.5;
    let joint = max(smoothstep(0.42, 0.5, abs(jy)), smoothstep(0.46, 0.5, abs(jx)) * 0.7);
    var alb = vec3f(0.5, 0.5, 0.49) * (0.72 + 0.2 * g + 0.1 * g2) * (1.0 - 0.3 * joint);
    alb = mix(alb, vec3f(0.1, 0.13, 0.19) * (0.8 + 0.3 * g2), smoothstep(0.05, 0.0, abs(hy - 3.6) - 0.5) * 0.85);
    alb *= mix(0.45, 1.0, smoothstep(0.1, 1.3, hy + 0.5 * g));                         // damp, dark foot
    let nn = normalize(n + 0.12 * vec3f(g2, joint * (jy * 2.0), -g2));
    c = alb * (G.sunColor * wrapDiffuse(nn, G.sunDir, 0.15) * 1.25 + hemi(nn, G.ambientSky, G.ambientGround) + lampLight(p, nn));
    c += alb * G.sunColor * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.35 * max(dot(n, G.sunDir) + 0.5, 0.0);
    let da = abs(atan2(sin(ang - 0.92), cos(ang - 0.92)));          // facing the spawn
    let win = smoothstep(0.02, -0.02, max(da * 1.0 - 0.13, abs(hy - 4.75) - 0.24));
    c = mix(c, vec3f(1.0, 0.6, 0.24) * (1.7 + 0.5 * g2), win);
    let dr = smoothstep(0.03, -0.03, max(da * 1.3 - 0.42, hy - 2.1 + da * da * 6.0));
    c = mix(c, vec3f(0.035, 0.022, 0.015) * (1.0 + 4.0 * G.sunColor * (0.7 + 0.3 * sin(ang * 130.0))), dr * step(hy, 2.3));
  }
  return vec4f(fogged(c, p), 1.0);
}
// two slow beams: camera-facing ribbons around the beam axis
struct BMO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) a: f32 };
@vertex fn vsBeam(@builtin(vertex_index) vi: u32) -> BMO {
  let cs = QC[vi % 6u];
  let L = U.lamps[3].xyz;
  let d = beamDir(f32(vi / 6u));
  let s = cs.x * 0.5 + 0.5;
  let ax = L + d * (0.5 + s * 85.0);
  let tc = normalize(eye() - ax);
  let side = normalize(cross(d, tc));
  let w = ax + side * cs.y * (0.3 + s * 7.0);
  var o: BMO;
  o.pos = clipW(w); o.c = vec2f(s, cs.y);
  // a beam that points along the view line is seen through its whole length
  let al = abs(dot(d, normalize(eye() - L)));
  o.a = (0.5 + 2.2 * pow(al, 10.0)) * (1.0 - fogAmount(distance(L, eye())) * 0.7);
  return o;
}
@fragment fn fsBeam(in: BMO) -> @location(0) vec4f {
  let s = in.c.x; let x = 1.0 - abs(in.c.y);
  let g = x * x * (3.0 - 2.0 * x) * pow(1.0 - s, 1.6) / (0.25 + s * 5.0);
  return vec4f(vec3f(1.0, 0.8, 0.5) * g * in.a * 0.022, 0.0);
}

// ---- a whale fluke rising far away, now and then ----
const WHALE_T = 83.0;
struct WHO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
@vertex fn vsWhale(@builtin(vertex_index) vi: u32) -> WHO {
  let e = floor(G.time / WHALE_T); let lt = G.time - e * WHALE_T;
  let az = 0.98 + 0.95 * fract(e * 0.618 + 0.2); let ds = 300.0 + 80.0 * fract(e * 0.37);   // well left of the lighthouse bearing
  let c = vec3f(-sin(az), 0.0, -cos(az)) * ds;
  let r = normalize(vec3f(c.z, 0.0, -c.x));
  let cs = QC[vi];
  var o: WHO;
  o.q = vec2f(cs.x * 17.0, cs.y * 13.0 + 13.0);
  o.w = c + r * o.q.x + vec3f(0.0, o.q.y, 0.0);
  o.k = lt / 20.0;
  o.pos = clipW(o.w);
  if (o.k > 1.0) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsWhale(in: WHO) -> @location(0) vec4f {
  let k = in.k;
  // up, a slow tilt, down
  let rise = -27.0 + 26.0 * pow(sin(PI * smoothstep(0.0, 1.0, k)), 0.7);
  let ca = cos(0.5 - k * 0.9); let sa = sin(0.5 - k * 0.9);
  var p = in.q - vec2f(0.0, rise);
  p = vec2f(ca * p.x - sa * (p.y - 8.0), sa * p.x + ca * (p.y - 8.0) + 8.0);
  let ax = abs(p.x);
  // peduncle: a tapering stalk; flukes: two swept lobes with a notch
  let st = ax - mix(3.6, 1.1, smoothstep(-6.0, 15.0, p.y)) - 0.0;
  let stalk = max(st, p.y - 17.0);
  let lp = vec2f(ax, p.y) - vec2f(0.0, 16.0);
  let sw = lp.y - 0.26 * lp.x - 2.2 * sin(lp.x * 0.19);           // lobe centre line rises then droops at the tip
  let th = 2.5 * pow(max(1.0 - lp.x / 12.5, 0.0), 0.6) + 0.2;
  let lobe = max(abs(sw) - th, lp.x - 12.5);
  let notch = length(vec2f(ax, p.y) - vec2f(0.0, 20.2)) - 1.5;
  let d = max(smin(stalk, lobe, 1.2), -notch);
  let m = smoothstep(0.12, -0.12, d) * smoothstep(0.0, 0.25, in.q.y);
  // an opaque silhouette, a little darker than the horizon haze behind it, with a thin moonlit edge
  let hz = skyBase(normalize(vec3f(in.w.x, 0.0, in.w.z)));
  var c = mix(vec3f(0.006, 0.009, 0.016), hz, 0.42) + vec3f(0.3, 0.4, 0.62) * exp(d * 1.1) * 0.07 * smoothstep(-0.4, 0.6, p.x * 0.05 + 0.3);
  // soft glowing mist where it breaks the surface
  let wk = BIO * exp(-in.q.y * 0.4) * exp(-in.q.x * in.q.x / (40.0 + 70.0 * k)) * sin(PI * k) * 0.2;
  return vec4f(c * m + wk * (1.0 - m) * (1.0 - fogAmount(distance(in.w, eye()))), m);
}
