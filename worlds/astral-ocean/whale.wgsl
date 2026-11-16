// Space whale: L = 1 mesh (x right, y up, z = body fraction s), bent along its path, vertical body wave.
// uv.x = part (0 body, +-1 flippers, 2 fluke, 3 dorsal), uv.y = span fraction of the fin.
// Drawn as: aura sprites (vsh/fsh) -> depth prepass (vs only) -> colour at depth 'equal' (premul), so a whale is a
// single clean shell of light (no far flipper showing through) and correctly hides what swims behind it.
@group(1) @binding(1) var farTex: texture_cube<f32>;
@group(1) @binding(2) var fsamp: sampler;
struct VO {
  @invariant @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) l: vec3f,
  @location(3) @interpolate(flat) k: u32, @location(4) part: vec2f,
};
fn aoWk(k: u32) -> u32 { return k + select(0u, 3u, k > 2u); }   // instances 3, 4 = nursery mother and calf (paths 6, 7)
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ki: u32) -> VO {
  let k = aoWk(ki);
  let P = paths[k];
  let L = P.d.w;
  let t = G.time;
  let ph = f32(k) * 2.1;
  var lp = p;
  if (abs(uv.x) > 0.5 && abs(uv.x) < 1.5) {          // pectoral flippers: slow flap + fore-aft sweep growing to the tip
    let fl = sin(t * 0.5 + ph) * 0.6 + sin(t * 0.29 + ph * 1.7) * 0.4;
    let sw = sin(t * 0.37 + ph * 0.6 + 1.0);
    lp.y += pow(uv.y, 1.6) * 0.055 * fl;
    lp.z += pow(uv.y, 1.3) * 0.03 * sw;
    lp.x *= 1.0 - 0.06 * uv.y * fl;
  }
  let s = lp.z;
  let F = aoFrame(P, t, s);
  let wv = aoWave(s, t, ph);
  let slope = (aoWave(s + 0.01, t, ph) - wv) * 100.0;
  if (abs(uv.x - 2.0) < 0.4) { lp.y += (lp.z - 0.9) * slope * 1.6; }   // the fluke pitches with the stroke, showing its blade
  var o: VO;
  o.w = F.p + (F.r * lp.x + F.u * (lp.y + wv)) * L;
  let nl = vec3f(n.x, n.y, n.z - slope * n.y);
  o.n = F.r * nl.x + F.u * nl.y - F.f * nl.z;
  o.l = lp; o.k = k; o.part = uv;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}

fn aoLine(d: f32, w: f32, fw: f32) -> f32 { return (1.0 - smoothstep(0.0, w + fw, d)) * w / (w + fw); }
const WRM = 0.108;
fn aoStar(cid: vec2f, k: f32) -> vec3f {   // xy = position in cell space, z = 1 if present
  let h = hash33(vec3f(cid, k));
  return vec3f(cid + 0.2 + 0.6 * h.xy, select(0.0, 1.0, h.z < 0.42));
}
fn aoSeg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let Vv = G.camPos - in.w;
  let dist = length(Vv);
  let V = Vv / dist;
  let n = normalize(in.n);
  let nd = abs(dot(n, V));
  let fres = 1.0 - nd;
  let L = paths[in.k].d.w;
  let kf = f32(in.k);
  let s = in.l.z;
  let lm = in.l * L;
  let t = G.time;
  let part = round(in.part.x);
  let cx = (in.part.x - part) / 0.3;         // fins: chordwise position, -1 leading edge .. 1 trailing edge
  let isBody = part == 0.0;
  let body = select(0.0, 1.0, isBody);
  let ang = atan2(in.l.x, -in.l.y);          // 0 = belly, +-pi = back
  let aa = abs(ang);
  let lod = smoothstep(420.0, 120.0, dist);  // fine line work fades with distance
  let ICE = mix(vec3f(0.34, 0.62, 1.5), vec3f(1.15, 0.6, 0.95), select(0.0, 0.5, in.k > 5u));   // the nursery pair is rosier

  // faint volume: cool top light + a warm kiss from the nebula core, so head-on views keep their form
  let up = n.y * 0.5 + 0.5;
  let sun = pow(clamp(dot(n, G.sunDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  var e = vec3f(0.004, 0.009, 0.03) * (0.3 + 0.7 * up) + vec3f(0.05, 0.022, 0.032) * sun * 0.45;
  // nebula drifting inside the body
  let q = lm * 0.17 + vec3f(kf * 7.0, 0.0, t * 0.015);
  let nb = fbm3(q, 3);
  let nh = vnoise3(q * 0.55 + 4.0);
  e += mix(vec3f(0.015, 0.085, 0.13), vec3f(0.1, 0.03, 0.15), smoothstep(-0.35, 0.35, nh)) * smoothstep(-0.15, 0.6, nb) * nd * 0.75 * (0.35 + 0.65 * body);
  // rim of light; fins grow out of the body glow instead of meeting it at a seam
  let root = select(smoothstep(0.0, 0.22, in.part.y), 1.0, isBody || part == 2.0);
  e += ICE * (pow(fres, 2.4) * 0.3 * body + pow(fres, 5.0) * 1.3) * (0.25 + 0.75 * root);

  // flowing lines: spine + lateral lines with light travelling toward the tail
  let tr = 0.22 + 0.78 * pow(0.5 + 0.5 * sin(t * 0.5 - s * 11.0 + kf * 2.0), 6.0);
  let dl = min(abs(aa - 1.78), 3.14159 - aa);
  let ln = aoLine(dl, 0.022, fwidth(dl) + 1e-4) * smoothstep(0.24, 0.34, s) * smoothstep(0.93, 0.78, s);
  // mouth line curving down to the eye
  let am = 2.0 - 0.55 * smoothstep(0.0, 0.2, s);
  let dmo = abs(aa - am);
  let mo = aoLine(dmo, 0.025, fwidth(dmo) + 1e-4) * smoothstep(0.004, 0.03, s) * smoothstep(0.205, 0.17, s);
  // ventral pleats from chin to navel, a slow pulse running along them
  let qp = ang * 8.5;
  let fq = fwidth(qp);
  let pm = smoothstep(1.3, 0.9, aa) * smoothstep(0.015, 0.07, s) * smoothstep(0.54, 0.36, s);
  let pl = aoLine(abs(fract(qp) - 0.5), 0.07, fq) * smoothstep(0.5, 0.18, fq) * pm;
  let pp = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * 0.4 - s * 9.0 + kf), 3.0);
  e += ICE * body * lod * (ln * tr * 1.1 + mo * 0.75 + pl * pp * 0.5);
  // eye
  let ev = vec2f((s - 0.215) * L, (aa - 1.52) * WRM * L);
  let er = 0.0045 * L;
  let ed = length(ev) / er;
  e += vec3f(1.5, 1.25, 0.9) * body * (exp(-ed * ed) * 1.6 + exp(-ed * ed * 0.08) * 0.12) * lod;
  // head tubercles: rows of small light points on the rostrum and along the jaw
  let tq = vec2f(s * 46.0, aa * 4.2);
  let tc = floor(tq);
  let th = hash22(tc + kf * 7.0);
  let tv = (tq - tc - 0.3 - 0.4 * th) * vec2f(L / 46.0, WRM * L / 4.2);
  let tr2 = dot(tv, tv) / (0.000016 * L * L);
  e += vec3f(0.9, 1.1, 1.5) * body * lod * exp(-tr2) * step(th.x, 0.7) * smoothstep(0.012, 0.03, s) * smoothstep(0.17, 0.12, s) * smoothstep(1.45, 1.75, aa) * 1.3;

  // constellations: warm points joined by faint lines
  let sk = select(vec2f(lm.z, lm.x), vec2f(lm.z, ang * WRM * L), isBody) / 3.4;
  let cid = floor(sk);
  let s0 = aoStar(cid, kf);
  let fw = length(fwidth(sk)) + 1e-5;
  let hs = hash22(cid + kf * 13.0);
  let r0 = 0.016 + 0.022 * hs.x * hs.x;
  let sig = max(r0, fw * 0.8);
  let dd = length(sk - s0.xy);
  let g2 = dd * dd / (sig * sig);
  var c = s0.z * (exp(-g2 * 0.5) * 3.5 + exp(-g2 * 0.1) * 0.25) * (r0 / sig) * (r0 / sig);
  // links: every star may reach its right and upper-right neighbour (irregular chains, no grid)
  var cl = 0.0;
  for (var i = 0; i < 6; i++) {
    var oa = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 0.0), vec2f(-1.0, -1.0), vec2f(-1.0, 0.0), vec2f(0.0, -1.0));
    let ca = cid + oa[i];
    let dg = i >= 2;
    let A = aoStar(ca, kf); let B = aoStar(ca + vec2f(1.0, select(0.0, 1.0, dg)), kf);
    let hl = hash22(ca + kf * 13.0 + 5.0);
    cl += A.z * B.z * select(step(hl.x, 0.6), step(hl.y, 0.4), dg) * aoLine(aoSeg(sk, A.xy, B.xy), 0.008, fw);
  }
  let tw = 0.75 + 0.25 * sin(t * 0.6 + dot(cid, vec2f(3.1, 1.7)));
  e += (mix(vec3f(1.5, 1.0, 0.55), vec3f(1.3, 1.15, 1.0), hs.y) * c * tw + vec3f(1.0, 0.8, 0.6) * cl * 0.45) * lod;

  // fins are lenses of glass, not cards: bright rounded edges (leading edge strongest), a clear middle, and on the
  // flippers three finger-bones of light converging on the tip
  let ec = cx * cx;
  let fin = (1.0 - body) * root;
  let dbn = min(abs(cx + 0.4), min(abs(cx), abs(cx - 0.42)));
  let bone = aoLine(dbn, 0.05, fwidth(dbn) + 1e-4) * select(0.0, 1.0, abs(part) == 1.0) * smoothstep(0.02, 0.2, in.part.y) * smoothstep(1.0, 0.7, in.part.y);
  e += ICE * fin * (ec * ec * (0.2 - 0.09 * cx) + 0.012 + bone * lod * (0.1 + 0.35 * tr));
  var a = 0.13 + 0.42 * fres + (0.04 + 0.2 * ec) * (1.0 - body);
  // depth haze: far whales sink into the nebula
  let hz = 1.0 - exp(-dist * 0.0032);
  let bg = textureSampleLevel(farTex, fsamp, -V, 0.0).rgb;   // haze takes the colour of the nebula behind
  e = e * (1.0 - 0.72 * hz) + (bg * 0.9 + vec3f(0.012, 0.008, 0.028)) * hz * (0.25 + a);
  a *= 1.0 - 0.35 * hz;
  let fade = smoothstep(3.0, 12.0, dist);
  return vec4f(e * fade, a * fade);
}

// ---------------- aura: a few big soft sprites along the spine ----------------
const NH = 7u;
struct HO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsh(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> HO {
  let k = aoWk(ii / NH);
  let P = paths[k];
  let L = P.d.w;
  let s = (f32(ii % NH) + 0.5) / f32(NH) * 0.92;
  let F = aoFrame(P, G.time, s);
  let p = F.p + F.u * aoWave(s, G.time, f32(k) * 2.1) * L;
  let r = L * (0.1 + 0.2 * sin(3.14159 * pow(s, 0.8)));
  let c = aoCorner(vi);
  let d = distance(p, G.camPos);
  var o: HO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(r)), 1.0);
  o.c = c;
  o.col = vec3f(0.012, 0.03, 0.085) * smoothstep(6.0, 30.0, d) * exp(-d * 0.0015);
  return o;
}
@fragment fn fsh(in: HO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let a = exp(-r2 * 3.2) - 0.0408 * r2;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
@fragment fn fsd() -> @location(0) vec4f { return vec4f(0.0); }   // depth prepass (colour writes masked off)
