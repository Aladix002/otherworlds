// Small stateless life, one draw: plankton clouds, reef darters, the nursery pearl garland, the far comet, and the
// star-sprites (the only ones with CPU state). LD = [0..5] sprite pos + excitement, [6..10] cloud centre + radius,
// [11..15] cloud (swirl angle, glow, palette), [16..] reef rocks (centre + radius).
@group(1) @binding(0) var<storage, read> LD: array<vec4f>;
override NP: u32 = 2000u;
override ND: u32 = 160u;
override NE: u32 = 84u;
override NC: u32 = 500u;
override NR: u32 = 7u;
const CORE = vec3f(-0.316, 0.163, -0.935);
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) k: u32 };

fn aoDart(i: u32, h: vec3f, t: f32) -> vec3f {
  let A = LD[16u + i % NR];
  let w = 0.1 + 0.16 * h.x;
  let d = normalize(vec3f(sin(t * w + h.y * 40.0), 0.25 + 0.6 * sin(t * w * 1.37 + h.z * 40.0), cos(t * w * 0.83 + h.x * 40.0)));
  return A.xyz + d * A.w * (1.05 + 0.5 * h.z + 0.1 * sin(t * 0.4 + h.y * 9.0));
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let t = G.time;
  let h = hash3u(vec3u(ii, 7u, 1u));
  let h2 = hash3u(vec3u(ii, 3u, 9u));
  var p: vec3f; var r = 0.03; var col = vec3f(0.0); var k = 0u;
  var ax = vec3f(0.0);         // streak half-axis (zero = round)
  var near = 2.5;
  var i = ii;
  if (i < NP) {                // ---- plankton ----
    let ci = i % 5u;
    let C = LD[6u + ci]; let S = LD[11u + ci];
    var o = (h + h2.yzx + hash3u(vec3u(i, 5u, 2u)) - 1.5) * C.w * vec3f(1.5, 0.9, 1.5);
    o += 0.5 * sin(t * vec3f(0.11, 0.09, 0.13) + h2 * 40.0);
    let rr = dot(o, o) / (C.w * C.w);
    o = vec3f(rot2(S.x * exp(-rr * 0.6) + 0.3 * rr) * o.xz, o.y + 0.06 * S.x * C.w * exp(-rr)).xzy;   // winds up into a slow whirl as you pass
    p = C.xyz + o;
    var pc = mix(vec3f(1.5, 0.45, 0.75), vec3f(1.5, 1.0, 0.45), step(0.5, S.z));
    pc = mix(pc, vec3f(0.2, 1.2, 0.9), step(1.5, S.z));
    pc = mix(pc, vec3f(0.6, 0.55, 1.5), step(2.5, S.z));
    pc = mix(pc, vec3f(0.2, 0.5, 1.5), step(3.5, S.z));
    col = mix(pc, pc.zxy * 0.6 + 0.5, step(0.86, h2.x)) * (0.45 + 1.3 * S.y) * (0.6 + 0.4 * sin(t * (0.5 + h.z) + h.x * 50.0)) * exp(-rr * 0.5);
    r = 0.025 + 0.05 * h2.y * h2.y;
  } else {
    i -= NP;
    if (i < ND) {              // ---- darters: tiny lights circling the reef rocks ----
      p = aoDart(i, h, t);
      ax = (p - aoDart(i, h, t - 0.2)) * 0.5;
      p -= ax;
      col = mix(vec3f(0.3, 1.2, 0.8), vec3f(1.5, 0.8, 0.3), step(0.8, h2.x)) * (0.5 + 0.5 * h2.y);
      r = 0.028; near = 1.2;
    } else {
      i -= ND;
      if (i < NE) {            // ---- pearl garland: a double helix of soft eggs at the heart of the nursery ----
        let s = f32(i / 2u) / f32(NE / 2u);
        let a = s * 15.0 + t * 0.04 + f32(i % 2u) * 3.14159;
        let R = 3.6 + 1.2 * sin(s * 7.0 + t * 0.1);
        p = LD[6].xyz + vec3f(cos(a) * R, (s - 0.5) * 17.0 + 0.3 * sin(t * 0.3 + h.x * 20.0) - 2.0, sin(a) * R);
        col = mix(vec3f(1.5, 0.8, 0.4), vec3f(1.5, 0.5, 0.7), h.y) * (0.25 + 0.75 * pow(0.5 + 0.5 * sin(s * 14.0 - t * 0.5), 3.0)) * (0.5 + LD[11].y) * sin(s * 3.14159);
        r = 0.16 + 0.12 * h.z; k = 2u; near = 1.0;
      } else {
        i -= NE;
        if (i < NC) {          // ---- comet: circles the core far out; the tail streams away from it ----
          let a = 0.12 + t * 0.004;
          let e1 = vec3f(0.947, 0.0, -0.32); let e2 = vec3f(0.052, 0.986, 0.154);
          let hd = (e1 * cos(a) + e2 * sin(a)) * 330.0;
          let ag = fract(h.x + t * 0.012);
          p = hd - CORE * ag * 170.0 * (0.5 + 0.5 * h2.z) + (h2 - 0.5) * (1.5 + 13.0 * ag) + (e1 * sin(a) - e2 * cos(a)) * ag * ag * 40.0 * h.y;
          col = mix(vec3f(1.3, 1.0, 0.65), vec3f(0.4, 0.75, 1.5), h.y) * (1.0 - ag) * (1.0 - ag) * 0.4;
          r = 0.35 + 0.8 * h.z;
          if (i % 6u == 1u) { r = 5.0 + 14.0 * ag; col *= 0.035; }     // soft body of the tail under the sparks
          if (i == 0u) { p = hd; r = 13.0; col = vec3f(0.9, 1.0, 1.25); k = 1u; }
        } else {               // ---- star-sprites: a flare and a few orbiting sparks each ----
          i -= NC;
          let S = LD[i / 9u];
          let m = i % 9u;
          let hs = hash3u(vec3u(i / 9u, 2u, 2u));
          let sc = mix(vec3f(1.5, 1.2, 0.7), mix(vec3f(0.6, 1.1, 1.5), vec3f(1.5, 0.7, 1.2), step(0.5, hs.y)), step(0.4, hs.x));
          if (m == 0u) { p = S.xyz; r = 0.3 + 0.1 * S.w; col = sc * (0.8 + 0.25 * sin(t * 1.3 + hs.z * 9.0) + 0.5 * S.w); k = 1u; near = 1.0; }
          else {
            let w = t * (0.5 + 0.6 * h.x) + h.y * 40.0;
            p = S.xyz + vec3f(sin(w), sin(w * 1.31 + 2.0), cos(w)) * (0.18 + 0.35 * h.z);
            r = 0.016; col = sc * 0.8; near = 0.6;
          }
        }
      }
    }
  }
  var rel = p - G.camPos;
  var d = length(rel);
  if (ii < NP) {               // plankton parts softly around you
    p += rel / d * smoothstep(3.0, 0.4, d) * 1.2;
    rel = p - G.camPos; d = length(rel);
  }
  let rs = max(r, aoPix(d) * select(2.2, 1.6, k == 0u && r > 0.3));
  let c = aoCorner(vi);
  let rgt = normalize(cross(rel, vec3f(0.0, 1.0, 0.0)));
  let al = length(ax);
  let xa = select(rgt * rs, ax + ax / max(al, 1e-4) * rs, al > 1e-4);
  let ya = normalize(cross(xa, rel)) * rs;
  var o: VO;
  o.pos = G.viewProj * vec4f(p + xa * c.x + ya * c.y, 1.0);
  o.c = c; o.k = k;
  o.col = col * (r / rs) * (r / rs) * 2.2 * smoothstep(near * 0.4, near, d);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  var a = exp(-r2 * 5.0) - 0.0067 * r2;
  if (in.k == 1u) {            // flare: bright heart, wide halo, a thin four-point glint
    let g = exp(-in.c.y * in.c.y * 700.0) * exp(-abs(in.c.x) * 5.0) + exp(-in.c.x * in.c.x * 700.0) * exp(-abs(in.c.y) * 5.0);
    a = (exp(-r2 * 60.0) * 2.5 + exp(-r2 * 6.0) * 0.22 + g * 0.7) * (1.0 - r2);
  }
  if (in.k == 2u) { a = exp(-r2 * 16.0) * 1.3 + exp(-r2 * 3.0) * 0.16 - 0.008 * r2; }
  return vec4f(in.col * max(a, 0.0), 0.0);
}
