// Space whale: L = 1 mesh (x right, y up, z = body fraction s), bent along its path, vertical body wave.
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) l: vec3f,
  @location(3) @interpolate(flat) k: u32, @location(4) part: vec2f,
};
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) k: u32) -> VO {
  let P = paths[k];
  let L = P.d.w;
  let t = G.time;
  let ph = f32(k) * 2.1;
  var lp = p;
  if (abs(uv.x) > 0.5 && abs(uv.x) < 1.5) {          // pectoral flippers: slow flap growing toward the tip
    let fl = sin(t * 0.5 + ph) * 0.6 + sin(t * 0.29 + ph * 1.7) * 0.4;
    lp.y += pow(uv.y, 1.6) * 0.05 * fl;
  }
  let s = lp.z;
  let F = aoFrame(P, t, s);
  let wv = aoWave(s, t, ph);
  let slope = (aoWave(s + 0.01, t, ph) - wv) * 100.0;
  var o: VO;
  o.w = F.p + (F.r * lp.x + F.u * (lp.y + wv)) * L;
  let nl = vec3f(n.x, n.y, n.z - slope * n.y);
  o.n = F.r * nl.x + F.u * nl.y - F.f * nl.z;
  o.l = lp; o.k = k; o.part = uv;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}

fn aoLine(d: f32, w: f32, fw: f32) -> f32 { return (1.0 - smoothstep(0.0, w + fw, d)) * w / (w + fw); }
const WRM = 0.095;
fn aoStar(cid: vec2f, k: f32) -> vec3f {   // xy = position in cell space, z = 1 if present
  let h = hash33(vec3f(cid, k));
  return vec3f(cid + 0.2 + 0.6 * h.xy, select(0.0, 1.0, h.z < 0.3));
}
fn aoSeg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let V = normalize(G.camPos - in.w);
  let n = normalize(in.n);
  let dist = length(G.camPos - in.w);
  let nd = abs(dot(n, V));
  let fres = 1.0 - nd;
  let L = paths[in.k].d.w;
  let kf = f32(in.k);
  let s = in.l.z;
  let lm = in.l * L;
  let body = select(0.0, 1.0, in.part.x == 0.0);
  let back = smoothstep(-0.04, 0.06, in.l.y);
  // light shell: strong rim, nearly clear centre
  var e = vec3f(0.012, 0.025, 0.07) * (0.5 + back);
  e += vec3f(0.35, 0.62, 1.5) * (pow(fres, 3.0) * 1.35 + pow(fres, 7.0) * 0.8);
  let ang = atan2(in.l.x, -in.l.y);          // 0 = belly, +-pi = back
  // a few slow pulsing lines: lateral lines and the spine line, with light travelling toward the tail
  let dl = min(min(abs(ang - 1.75), abs(ang + 1.75)), 3.14159 - abs(ang));
  let ln = aoLine(dl, 0.03, fwidth(dl) + 1e-4) * body * smoothstep(0.06, 0.16, s) * smoothstep(0.92, 0.75, s);
  let tr = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(G.time * 0.55 - s * 13.0 + kf * 2.0), 8.0);
  e += vec3f(0.4, 0.75, 1.6) * ln * tr * 0.9;
  // fin leading-edge line
  e += vec3f(0.4, 0.75, 1.6) * (1.0 - body) * pow(fres, 2.0) * 0.25;
  // throat pleats, faint
  let q = ang * 13.0;
  let pl = aoLine(abs(fract(q) - 0.5), 0.05, fwidth(q));
  e += vec3f(0.35, 0.6, 1.4) * pl * body * smoothstep(1.0, 0.5, abs(ang)) * smoothstep(0.03, 0.08, s) * smoothstep(0.45, 0.3, s) * 0.22;
  // sparse constellations joined by faint lines
  let sk = select(vec2f(lm.z, lm.x), vec2f(lm.z, ang * WRM * L), in.part.x == 0.0) / 2.8;
  let cid = floor(sk);
  let s0 = aoStar(cid, kf); let s1 = aoStar(cid + vec2f(1.0, 0.0), kf); let sm = aoStar(cid - vec2f(1.0, 0.0), kf);
  let fw = length(fwidth(sk)) + 1e-5;
  let r0 = 0.03;
  let sig = max(r0, fw * 0.7);
  let dd = length(sk - s0.xy);
  var c = s0.z * exp(-dd * dd / (2.0 * sig * sig)) * (r0 / sig) * (r0 / sig) * 4.0;
  let lw = 0.007;
  c += s0.z * s1.z * aoLine(aoSeg(sk, s0.xy, s1.xy), lw, fw) * 0.3;
  c += s0.z * sm.z * aoLine(aoSeg(sk, sm.xy, s0.xy), lw, fw) * 0.3;
  let tw = 0.7 + 0.3 * sin(G.time * 0.6 + dot(cid, vec2f(3.1, 1.7)));
  e += vec3f(1.0, 0.92, 1.3) * c * tw;
  let a = 0.02 + 0.3 * fres * fres;
  let fade = smoothstep(3.0, 14.0, dist) * mix(1.0, 0.4, smoothstep(80.0, 420.0, dist));
  return vec4f(e * fade, a * fade);
}
