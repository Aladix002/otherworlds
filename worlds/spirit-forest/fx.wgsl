// Deferred ground mist + moon shafts (afterScene), then additive FX with read-only depth:
// spirit beings, halos, wisps, fireflies.
@group(2) @binding(0) var depthT: texture_depth_2d;
struct FO { @builtin(position) pos: vec4f };
@vertex fn vsMist(@builtin(vertex_index) vi: u32) -> FO { var o: FO; o.pos = fsPos(vi); return o; }
@fragment fn fsMist(in: FO) -> @location(0) vec4f {
  let d = textureLoad(depthT, vec2i(in.pos.xy), 0);
  let uv = in.pos.xy * G.invResolution;
  let rd = viewRay(uv);
  let ro = G.camPos;
  let dist = select(linearDepth(d) / max(dot(rd, G.camFwd), 0.05), 400.0, d <= 0.0);
  let t = G.time;
  // drifting ground fog: analytic height integral, density varied by slow noise at the ray's far end
  let gy = terrH(ro.xz) ;
  let e1 = ro.xz + rd.xz * min(dist, 26.0);
  let nA = nz(e1 * 0.009 + vec2f(t * 0.0016, t * 0.0007));
  let nB = nz(e1 * 0.031 - vec2f(t * 0.003, -t * 0.002));
  let M = U.misc.y * (0.35 + 0.9 * nA.z + 0.5 * nB.x);
  let k = 0.5;
  let y0 = max(ro.y - gy + 0.4, 0.0);
  let ky = k * rd.y * dist;
  let mistI = M * exp(-k * y0) * dist * select((1.0 - exp(-ky)) / ky, 1.0, abs(ky) < 1e-3);
  let od = mistI + U.misc.z * min(dist, 240.0);
  let T = exp(-od);
  // bioluminescence scattered by the mist
  let L = min(dist, 36.0);
  var gs = vec3f(0.0);
  for (var i = 0; i < 2; i++) {
    let s = L * (f32(i) * 0.5 + 0.2);
    let q = ro + rd * s;
    let l = lmAt(q.xz).rgb;
    gs += l * exp(-max(q.y - gy + 0.3, 0.0) * 0.4);
  }
  gs *= L / 2.0 * (M + U.misc.z * 4.0) * 0.08 * U.misc.w;
  let mu = dot(rd, G.sunDir);
  var inscat = G.fogColor * (1.0 - T) * (1.0 + 1.6 * phaseHG(mu, 0.6) * U.misc.x) + gs;
  // moon shafts: soft columns of light along the moon direction
  var sh = 0.0;
  let A = -G.sunDir;
  for (var i = 0; i < 6; i++) {
    let s = U.shaft[i];
    let P0 = vec3f(s.x, 0.0, s.y);
    let w0 = ro - P0;
    let b = dot(rd, A); let dd = dot(rd, w0); let e = dot(A, w0);
    let den = max(1.0 - b * b, 0.03);
    let tr = clamp((b * e - dd) / den, 0.0, dist);
    let ta = e + b * tr;
    let cp = P0 + A * ta;
    let off = length(ro + rd * tr - cp);
    let hgt = cp.y;
    let fall = smoothstep(-2.0, 3.0, hgt) * (1.0 - smoothstep(9.0, 17.0, hgt));
    sh += exp(-off * off / (s.z * s.z)) * s.w * fall * (0.6 + 0.8 * nB.z) / sqrt(den) * smoothstep(1.5, 6.0, tr);
  }
  inscat += vec3f(0.4, 0.75, 0.8) * sh * 0.11 * U.misc.x;
  let k2 = 1.0 - G.transition;
  return vec4f(inscat * k2, (1.0 - T) * k2);
}

// ---------------- spirit beings (additive shells) ----------------
struct BV {
  @invariant @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) at: vec4f, @location(4) @interpolate(flat) k: f32, @location(5) @interpolate(flat) gy: f32,
};
@vertex fn vsDeer(v: VI, @builtin(instance_index) ii: u32) -> BV {
  let D = U.deer[ii]; let B = U.deerB[ii];
  var lp = v.p; var n = v.n;
  // legs swing from the hip, body breathes
  if (v.at.x > 10.5 && v.at.x < 11.5) { lp.z += sin(TAU * (B.y + v.at.w)) * 0.42 * v.at.y * B.z + sin(G.time * 0.5 + v.at.w * 9.0) * 0.03 * v.at.y; lp.y += max(sin(TAU * (B.y + v.at.w) + 1.3), 0.0) * 0.1 * v.at.y * B.z; }
  lp.y += sin(TAU * B.y * 2.0) * 0.02 * B.z + sin(G.time * 0.7 + f32(ii)) * 0.012;
  // head and neck turn toward the visitor
  let piv = vec3f(0.0, 2.4, -0.8);
  let a = B.x * v.at.z;
  let Rh = rotY(a);
  lp = piv + Rh * (lp - piv); n = Rh * n;
  lp.y -= v.at.z * 0.1 * abs(B.x);
  let R = rotY(D.w);
  var o: BV; o.w = D.xyz + R * (lp * 1.08); o.n = R * n; o.uv = v.uv; o.at = v.at; o.k = B.w; o.gy = D.y;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@vertex fn vsLan(v: VI, @builtin(instance_index) ii: u32) -> BV {
  let Lr = U.lan[ii];
  var lp = v.p; let t = G.time; let ph = f32(ii) * 2.1;
  if (v.at.x > 13.5) { lp += vec3f(sin(t * 1.1 + v.at.y * 4.0 + v.at.z * 6.0 + ph), 0.0, cos(t * 0.9 + v.at.y * 3.0 + ph)) * 0.07 * v.at.y; }
  let tilt = rotZ(sin(t * 0.6 + ph) * 0.12);
  let R = rotY(Lr.w);
  var o: BV; o.w = Lr.xyz + R * (tilt * lp) * 1.25; o.n = R * (tilt * v.n); o.uv = v.uv; o.at = v.at; o.k = 1.0; o.gy = Lr.y;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
// depth-only layer so the additive shell shows just its nearest surface (legs, tails and ribbons stay see-through)
@fragment fn fsBeingZ(in: BV) -> @location(0) vec4f {
  if ((in.at.x > 10.5 && in.at.x < 11.5 && in.at.y > 0.3) || in.at.x > 13.5 || (in.at.x < 10.5 && in.at.w > 0.5)) { discard; }
  return vec4f(0.0);
}
@fragment fn fsBeing(in: BV, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let V = normalize(G.camPos - in.w);
  let l2 = dot(in.n, in.n);
  let n = select(V, in.n * inverseSqrt(max(l2, 1e-12)), l2 > 1e-8);
  let ndv = min(abs(dot(n, V)), 1.0);
  let fr = pow(1.0 - ndv, 1.4);
  let m = in.at.x;
  var c: vec3f;
  if (m < 11.5) {
    // translucent body: bright rim, faint fill, drifting motes inside; legs dissolve into the mist
    let q = in.uv * vec2f(30.0, 40.0) + vec2f(0.0, G.time * 0.1);
    let hsh = hash2i(vec2i(floor(q)));
    let mote = exp(-dot(fract(q) - 0.5, fract(q) - 0.5) * 40.0) * step(0.93, u2f(hsh)) * (0.5 + 0.5 * sin(G.time * 0.8 + u2f(pcg(hsh)) * 40.0));
    let hv = (in.at.y - 0.78) / 0.25;
    let heart = exp(-hv * hv) * step(m, 10.5) * step(in.at.z, 0.001);
    c = SPIRIT * (0.11 + 0.03 * fr + 0.1 * smoothstep(1.2, 3.6, in.w.y - in.gy)) + vec3f(0.8, 1.0, 0.9) * mote * 0.1;
    // a soft warm eye on each side of the head
    if (in.at.z > 0.99 && in.at.y > 1.5 && in.at.w < 0.5) {
      let du = abs(fract(in.uv.x + 0.25) - 0.5) - 0.22;
      c += vec3f(1.0, 0.85, 0.55) * exp(-((in.uv.y - 0.32) * (in.uv.y - 0.32) * 900.0 + du * du * 1400.0)) * 0.9;
    }
    if (m > 10.5) { c *= smoothstep(1.25, 0.45, in.at.y); }
  } else if (m < 12.5) {
    // antlers: pale gold, hot at the tips
    let tip = in.at.w;
    c = mix(SPIRIT, vec3f(1.0, 0.9, 0.6), tip) * (0.2 + 0.3 * fr + 0.8 * tip * tip);
  } else if (m < 13.5) {
    // lantern: warm paper lit from inside, ribs, dim leaf cap
    let rib = 0.8 + 0.2 * cos(in.uv.x * TAU * 7.0);
    c = AMBER * (0.25 + 0.75 * ndv * ndv) * rib * (0.5 + 0.5 * sin(PI * in.at.y)) * 0.85;
    if (in.at.z > 0.5) { c = vec3f(0.25, 0.6, 0.2) * (0.06 + 0.25 * fr); }
  } else {
    c = mix(AMBER, vec3f(1.0, 0.9, 0.6), in.at.y) * (1.0 - in.at.y) * 0.25 * (1.0 - in.uv.x * in.uv.x);
  }
  return vec4f(glow(max(c, vec3f(0.0)) * in.k) * (1.0 - G.transition), 0.0);
}

// ---------------- soft billboards: halos, wisps ----------------
struct BO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) k: vec4f };
@vertex fn vsHalo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  let c = quadC(vi);
  var o: BO; o.c = c; o.k = vec4f(0.0);
  var wp: vec3f; var sz: f32; var col: vec3f;
  if (ii < 2u) {
    let D = U.deer[ii];
    wp = D.xyz + vec3f(0.0, 2.5, 0.0); sz = 3.4; col = SPIRIT * 0.035 * U.deerB[ii].w;
  } else if (ii < 8u) {
    wp = U.lan[ii - 2u].xyz; sz = 1.0; col = AMBER * 0.1;
  } else if (ii < 11u) {
    let W = WIL[ii - 8u];
    wp = vec3f(W.x, W.y + 4.5 * W.w, W.z); sz = 9.5 * W.w; col = WILLOW * 0.022 * (0.8 + 0.25 * pulse(wp));
  } else {
    // motes rising around the deer's feet
    let k = ii - 11u; let D = U.deer[k & 1u];
    let h = hash3u(vec3u(k, 7u, 19u));
    let life = fract(h.z + G.time * (0.06 + 0.05 * h.x));
    let a = h.x * TAU + G.time * 0.1;
    wp = D.xyz + vec3f(cos(a) * (0.3 + 1.1 * h.y), 0.05 + life * 1.5, sin(a) * (0.3 + 1.1 * h.y));
    sz = 0.05 + 0.04 * h.y; col = SPIRIT * 1.5 * sin(PI * life);
    o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz)), 1.0);
    o.col = col * fxFog(wp);
    return o;
  }
  o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz)), 1.0);
  o.col = col * fxFog(wp) * smoothstep(sz * 0.5, sz * 1.5, distance(wp, G.camPos));
  return o;
}
@fragment fn fsHalo(in: BO) -> @location(0) vec4f {
  let s = max(1.0 - dot(in.c, in.c), 0.0);
  return vec4f(in.col * s * s * s * s, 0.0);
}
// wisps: small friendly ghost lights with a wavering tail
@vertex fn vsWisp(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  let c = quadC(vi);
  let W = U.wisp[ii];
  var o: BO; o.c = c; o.k = vec4f(f32(ii) * 1.7, distance(W.xyz, G.camPos), 0.0, 0.0);
  let d = o.k.y;
  let sz = 0.8 + d * 0.016;
  o.pos = G.viewProj * vec4f(billboard(W.xyz, c, vec2f(sz)), 1.0);
  o.col = mix(SPIRIT, vec3f(0.85, 1.0, 0.8), fract(f32(ii) * 0.37)) * W.w * fxFog(W.xyz);
  return o;
}
@fragment fn fsWisp(in: BO) -> @location(0) vec4f {
  let t = G.time; let ph = in.k.x;
  var q = in.c;
  let hd = q - vec2f(0.0, 0.22);
  // tail tapering downward, swaying
  let ty = clamp((0.22 - q.y) / 1.0, 0.0, 1.0);
  let tx = q.x - sin(ty * 5.0 + t * 1.3 + ph) * 0.13 * ty;
  let tw = 0.2 * (1.0 - ty) * (1.0 - ty) + 0.012;
  let tail = exp(-tx * tx / (tw * tw)) * (1.0 - ty) * step(q.y, 0.22) * smoothstep(1.0, 0.75, ty);
  let r2 = dot(hd, hd);
  let head = exp(-r2 * 26.0);
  // two soft eyes, visible only when close
  let ex = abs(hd.x) - 0.075;
  let eye = exp(-(ex * ex + (hd.y - 0.02) * (hd.y - 0.02) * 0.6) * 700.0) * smoothstep(22.0, 9.0, in.k.y);
  let halo = pow(max(1.0 - dot(q, q), 0.0), 3.0) * 0.2;
  let body = (head * 0.62 + tail * 0.4) * (1.0 - 0.9 * eye);
  return vec4f(glow(in.col * body) + in.col * halo, 0.0);
}

// ---------------- fireflies with short light trails ----------------
fn flyPos(h: vec3f, h2: vec3f, t: f32) -> vec3f {
  let S = 60.0;
  var q = vec2f(h.x, h.y) * S + vec2f(sin(t * 0.07 + h2.y * 30.0) + 0.45 * sin(t * 0.23 + h.z * 9.0), cos(t * 0.06 + h2.z * 30.0) + 0.45 * cos(t * 0.19 + h.x * 9.0)) * 2.6
    + vec2f(sin(t * 0.83 + h2.x * 50.0), cos(t * 0.71 + h.y * 50.0)) * 0.3;
  q = G.camPos.xz + (q - G.camPos.xz) - S * round((q - G.camPos.xz) / S);
  let y = terrH(q) + 0.25 + 3.6 * pow(h2.x, 1.7) + sin(t * 0.21 + h.z * 20.0) * 0.3 + 0.12 * sin(t * 0.9 + h2.y * 60.0);
  return vec3f(q.x, y, q.y);
}
struct FV { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) k: vec4f, @location(3) @interpolate(flat) s: f32 };
@vertex fn vsFly(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> FV {
  let c = quadC(vi);
  let h = hash3u(vec3u(ii, 17u, 3u)); let h2 = hash3u(vec3u(ii, 5u, 91u));
  let t = G.time;
  let TR = 0.28;
  let B = flyPos(h, h2, t); let A = flyPos(h, h2, t - TR);
  let d = distance(B, G.camPos);
  let size = 0.028 + 0.03 * h2.z * h2.z;
  let sz = (size + d * 0.0022) * 3.0;
  var ax = B - A;
  if (dot(ax, ax) > 9.0) { ax = vec3f(0.0); }       // wrapped around the tile during the trail
  let L = length(ax);
  let dir = select(vec3f(0.0, 1.0, 0.0), ax / max(L, 1e-4), L > 1e-3);
  let side = normalize(cross(dir, B - G.camPos));
  let wp = mix(A, B, c.y * 0.5 + 0.5) + side * c.x * sz + dir * c.y * sz;
  // organic flashing: each fly has its own period; now and then a slow synchronised wave passes through
  let per = 2.4 + 3.5 * h.z;
  let env = 0.25 + 0.75 * smoothstep(-0.3, 0.5, sin(t * 0.13 + h2.y * 40.0));
  let sync = pow(0.5 + 0.5 * sin(t * 0.043), 6.0);
  var o: FV; o.c = c;
  o.k = vec4f(L / sz, t / per + h.x * 7.0, TR / per, t * 0.22 - dot(B.xz, vec2f(0.6, 0.8)) * 0.035);
  o.s = sync;
  let a = smoothstep(2.0, 6.0, d) * (1.0 - smoothstep(24.0, 30.0, d)) * env * min(1.0, pow(size * 3.2 / sz, 1.5)) * mix(1.0, 1.6, sync);
  o.col = mix(vec3f(1.0, 0.62, 0.14), vec3f(0.6, 1.0, 0.25), smoothstep(0.1, 0.8, h2.y)) * 2.4 * a * fxFog(B);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  return o;
}
fn flash(ph: f32) -> f32 { let f = fract(ph); return smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.16, 0.55, f)); }
@fragment fn fsFly(in: FV) -> @location(0) vec4f {
  let L = in.k.x;
  let Y = in.c.y * (L * 0.5 + 1.0);
  let u = clamp((Y + L * 0.5) / max(L, 1e-3), 0.0, 1.0);
  let dy = max(abs(Y) - L * 0.5, 0.0);
  let d2 = in.c.x * in.c.x + dy * dy;
  let hd = vec2f(in.c.x, Y - L * 0.5);
  var ph = in.k.y - (1.0 - u) * in.k.z;
  var b0 = flash(in.k.y); var bt = flash(ph);
  let s = 0.5 + 0.5 * sin(in.k.w * TAU); let s3 = s * s * s;
  b0 = mix(b0, max(b0 * 0.4, s3), in.s); bt = mix(bt, max(bt * 0.4, s3), in.s);
  let r2 = dot(hd, hd);
  let core = exp(-r2 * 28.0) + exp(-r2 * 5.0) * 0.12 * max(1.0 - r2, 0.0);
  let trail = exp(-d2 * 30.0) * u * u * 0.1 * step(1e-3, L);
  return vec4f(in.col * (core * b0 + trail * bt), 0.0);
}
