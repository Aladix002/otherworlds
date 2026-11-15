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
fn aoStar(cid: vec2f, k: f32) -> vec3f {   // xy = position in cell space, z = 1 if present
  let h = hash33(vec3f(cid, k));
  return vec3f(cid + 0.2 + 0.6 * h.xy, select(0.0, 1.0, h.z < 0.42));
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
  let back = smoothstep(-0.06, 0.08, in.l.y);
  var e = vec3f(0.02, 0.04, 0.12) * (0.4 + 0.8 * back);
  e += vec3f(0.4, 0.7, 1.5) * (pow(fres, 4.0) * 1.1 + pow(fres, 1.5) * 0.08);
  // glowing veins: thin iso-lines of 3D noise with travelling pulses
  let vn = snoise3(lm * vec3f(0.3, 0.3, 0.12) + kf * 13.0);
  let vn2 = snoise3(lm * vec3f(0.8, 0.8, 0.35) - kf * 7.0);
  let vein = aoLine(abs(vn), 0.025, fwidth(vn) + 1e-4) + 0.45 * aoLine(abs(vn2), 0.03, fwidth(vn2) + 1e-4) * smoothstep(0.2, 0.6, vn * 0.5 + 0.5);
  let pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(G.time * 0.45 - s * 10.0 + kf), 2.0);
  e += vec3f(0.3, 0.68, 1.6) * vein * pulse * 0.75;
  // soft inner heart glow
  let body = select(0.0, 1.0, in.part.x == 0.0);
  let ang = atan2(in.l.x, -in.l.y);          // 0 = belly
  e += vec3f(0.35, 0.4, 1.3) * exp(-pow((s - 0.3) / 0.1, 2.0)) * nd * nd * 0.07 * body;
  // throat pleats along the front belly
  let q = ang * 13.0;
  let pl = aoLine(abs(fract(q) - 0.5), 0.05, fwidth(q));
  e += vec3f(0.35, 0.6, 1.4) * pl * body * smoothstep(1.1, 0.5, abs(ang)) * smoothstep(0.03, 0.08, s) * smoothstep(0.48, 0.3, s) * 0.5;
  // constellations: sparse stars on the skin joined by faint lines
  let sk = select(vec2f(lm.z, lm.x), vec2f(lm.z, ang * 0.1 * L), in.part.x == 0.0) / 2.6;
  let cid = floor(sk);
  let s0 = aoStar(cid, kf); let s1 = aoStar(cid + vec2f(1.0, 0.0), kf); let sm = aoStar(cid - vec2f(1.0, 0.0), kf);
  let fw = length(fwidth(sk)) + 1e-5;
  let r0 = 0.022;
  let sig = max(r0, fw * 0.7);
  let dd = length(sk - s0.xy);
  var c = s0.z * exp(-dd * dd / (2.0 * sig * sig)) * (r0 / sig) * (r0 / sig) * 3.0;
  let lw = 0.008;
  c += s0.z * s1.z * aoLine(aoSeg(sk, s0.xy, s1.xy), lw, fw) * 0.25;
  c += s0.z * sm.z * aoLine(aoSeg(sk, sm.xy, s0.xy), lw, fw) * 0.25;
  let tw = 0.75 + 0.25 * sin(G.time * 0.7 + dot(cid, vec2f(3.1, 1.7)));
  e += vec3f(1.0, 0.92, 1.3) * c * tw * (0.4 + 0.6 * back);
  let a = 0.06 + 0.2 * fres * fres;
  let fade = smoothstep(3.0, 14.0, dist) * mix(1.0, 0.35, smoothstep(80.0, 420.0, dist));
  return vec4f(e * fade, a * fade);
}
