// Water (HDR pass), deferred glowing mist + moon shafts (afterScene), additive FX (afterScene, depth-tested).
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsWater(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f) -> WO {
  var o: WO; o.w = vec3f(p.x, 0.0, p.z); o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
fn skyRefl(rd: vec3f) -> vec3f {
  let h = max(rd.y, 0.0);
  var c = mix(hex(0x0a2a38) * 0.35, hex(0x140f33) * 0.3, smoothstep(0.0, 0.35, h));
  let m = max(dot(rd, G.sunDir), 0.0);
  c += vec3f(0.35, 0.4, 0.75) * (pow(m, 8.0) * 0.05 + pow(m, 64.0) * 0.12) * U.misc.x;
  return c;
}
@fragment fn fsWater(in: WO) -> @location(0) vec4f {
  let p = in.w; let t = G.time;
  let gh = terrH(p.xz);
  let depth = max(-gh, 0.0);
  let dist = distance(p, G.camPos);
  let n1 = nz(p.xz * 0.045 + vec2f(t * 0.004, t * 0.003)).xy - 0.5;
  let n2 = nz(p.xz * 0.17 - vec2f(t * 0.009, -t * 0.006)).zw - 0.5;
  let fd = 1.0 - smoothstep(10.0, 50.0, dist);
  var g = (n1 * 0.22 + n2 * 0.16 * fd);
  // ripples (frog hops, fish kisses)
  var rippleE = 0.0;
  for (var i = 0; i < 6; i++) {
    let r = U.rip[i];
    let age = t - r.z;
    if (age > 0.0 && age < 7.0) {
      let dv = p.xz - r.xy; let d = length(dv) + 1e-4;
      let front = r.w + age * 0.42;
      let x = d - front;
      let env = exp(-x * x * 6.0) * exp(-age * 0.55) * smoothstep(0.0, 0.3, age);
      let wv = sin(x * 15.0) * env;
      g += dv / d * wv * 0.35;
      rippleE += env * 0.5;
    }
  }
  // turbulence rings where the waterfall lands
  let wb = vec2f(U.wf.x, U.wf.w);
  let dw = distance(p.xz, wb);
  let tw = exp(-dw * 0.22);
  g += normalize(p.xz - wb + 1e-3) * sin(dw * 3.0 - t * 2.2) * tw * 0.25;
  let nrm = normalize(vec3f(g.x, 1.0, g.y));
  let V = normalize(G.camPos - p);
  let R = reflect(-V, nrm);
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);
  var refl = skyRefl(R);
  // reflected bioluminescence from the shores and floating plants
  let ro = p.xz + R.xz / max(R.y, 0.12) * 1.8;
  let lm = textureSampleLevel(lmap, smp, wuv(ro), 0.0);
  refl += slotCol(lm) * pulse(p) * 0.3 * U.misc.w;
  // waterfall column reflection
  let toW = vec2f(U.wf.x, U.wf.z) - p.xz;
  let dW = length(toW);
  let az = abs(R.x * toW.y - R.z * toW.x) / (length(R.xz) * dW + 1e-4) * dW;
  let elev = R.y * dW / max(length(R.xz), 1e-3);
  refl += (U.slot[0].rgb * 0.5 + vec3f(0.6, 0.8, 0.9)) * exp(-az * az * 0.15) * smoothstep(U.wf.y + 1.0, 0.0, elev) * step(0.0, dot(R.xz, toW)) * 0.35;
  // water body: dark teal, lit from below by glow
  let T = exp(-depth * 0.9);
  var body = vec3f(0.003, 0.016, 0.022) + glowAt(vec3f(p.x, gh, p.z)) * 0.18;
  let shallow = (1.0 - smoothstep(0.0, 0.35, depth)) * step(0.001, depth);
  var e = U.slot[0].rgb * shallow * 0.08 * pulse(p);
  e += U.slot[0].rgb * (rippleE * 0.25 + tw * 0.25 * (0.6 + 0.4 * sin(dw * 2.0 - t * 1.7)));
  // plankton sparkles stirred near the falls and ripples
  let sp = nz(p.xz * 1.7 + vec2f(t * 0.02, 0.0));
  e += mix(U.slot[3].rgb, U.slot[0].rgb, sp.y) * smoothstep(0.86, 0.95, sp.x) * (tw * 2.0 + rippleE + 0.12 + 0.2 * pulse(p)) * fd * 0.6;
  let col = refl * F + body * (1.0 - F) + e;
  let a = clamp(mix(1.0 - T * 0.8, 1.0, F), 0.0, 1.0);
  return vec4f(col, a);
}

// ---------------- deferred mist (fullscreen, reads depth) ----------------
@group(2) @binding(0) var depthT: texture_depth_2d;
struct FO { @builtin(position) pos: vec4f };
@vertex fn vsMist(@builtin(vertex_index) vi: u32) -> FO { var o: FO; o.pos = fsPos(vi); return o; }
fn mistDen(y: f32) -> f32 { return exp(-max(y + 0.3, 0.0) * 0.45); }
@fragment fn fsMist(in: FO) -> @location(0) vec4f {
  let d = textureLoad(depthT, vec2i(in.pos.xy), 0);
  let uv = in.pos.xy * G.invResolution;
  let rd = viewRay(uv);
  let ro = G.camPos;
  let dist = select(linearDepth(d) / max(dot(rd, G.camFwd), 0.05), 500.0, d <= 0.0);
  // analytic height mist + uniform haze
  let M = U.misc.y; let k = 0.45;
  let y0 = ro.y + 0.3;
  let ky = k * rd.y * dist;
  let mistI = M * exp(-k * max(y0, 0.0)) * dist * select((1.0 - exp(-ky)) / ky, 1.0, abs(ky) < 1e-3);
  let od = mistI + U.misc.z * select(min(dist, 260.0), 70.0, d <= 0.0);
  let T = exp(-od);
  // glow scattered by mist: three samples along the near part of the ray
  let L = min(dist, 34.0);
  var gs = vec3f(0.0);
  for (var i = 0; i < 3; i++) {
    let s = L * (f32(i) + 0.5) / 3.0;
    let q = ro + rd * s;
    let nn = nz(q.xz * 0.03 + vec2f(G.time * 0.004, -G.time * 0.003)).x;
    gs += glowAt(q) * mistDen(q.y) * (0.5 + nn);
  }
  gs *= L / 3.0 * M * 0.6;
  // moonlit veil with forward scattering
  let mu = dot(rd, G.sunDir);
  var inscat = G.fogColor * (1.0 - T) * (1.0 + 2.5 * phaseHG(mu, 0.55) * U.misc.x) + gs;
  // moon shafts: soft light columns along the moon direction
  var sh = 0.0;
  let A = -G.sunDir;
  for (var i = 0; i < 5; i++) {
    let s = U.shaft[i];
    let P0 = vec3f(s.x, 0.0, s.y);
    let w0 = ro - P0;
    let b = dot(rd, A); let dd = dot(rd, w0); let e = dot(A, w0);
    let den = max(1.0 - b * b, 0.02);
    let tr = clamp((b * e - dd) / den, 0.0, dist);
    let ta = e + b * tr;
    let cp = P0 + A * ta;
    let off = length(ro + rd * tr - cp);
    let hgt = cp.y;
    let fall = smoothstep(-1.0, 3.0, hgt) * (1.0 - smoothstep(14.0, 26.0, hgt));
    let dust = 0.6 + 0.8 * nz(vec2f(dot(cp.xz, vec2f(0.3, 0.2)) + G.time * 0.01, hgt * 0.05)).y;
    sh += exp(-off * off / (s.z * s.z)) * s.w * fall * dust / sqrt(den) * smoothstep(1.5, 6.0, tr);
  }
  inscat += vec3f(0.42, 0.5, 0.95) * sh * 0.032 * U.misc.x;
  let k2 = 1.0 - G.transition;
  return vec4f(inscat * k2, (1.0 - T) * k2);
}

// ---------------- waterfall sheet ----------------
struct XO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
fn fallPos(u: f32, v: f32, layer: f32) -> vec3f {
  let lip = U.wf.xyz; let bz = U.wf.w;
  let wdt = mix(3.6, 5.2, layer) * (1.0 + 0.35 * v);
  let x = lip.x + (u - 0.5) * wdt + sin(v * 5.0 + u * 3.0) * 0.12;
  let y = lip.y * (1.0 - v) - 0.3 * v;
  let z = lip.z + (bz - lip.z) * sqrt(v) + layer * 0.4 * v + sin(u * 9.0 + v * 3.0) * 0.08;
  return vec3f(x, y, z);
}
@vertex fn vsFall(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f, @builtin(instance_index) ii: u32) -> XO {
  let layer = f32(ii);
  let w = fallPos(uv.x, uv.y, layer);
  var o: XO; o.uv = uv; o.w = w; o.k = layer; o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
@fragment fn fsFall(in: XO) -> @location(0) vec4f {
  let u = in.uv.x; let v = in.uv.y; let t = G.time;
  let s1 = nz(vec2f(u * 1.3 + in.k * 0.37, v * 0.22 - t * 0.21)).x;
  let s2 = nz(vec2f(u * 2.9 + 0.5, v * 0.5 - t * 0.37)).y;
  let s3 = nz(vec2f(u * 0.6, v * 0.1 - t * 0.09)).z;
  var str = smoothstep(0.5, 0.8, s1 * 0.6 + s2 * 0.5 + s3 * 0.3 - 0.1);
  let edge = smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u);
  let ends = smoothstep(0.0, 0.04, v) * (1.0 - smoothstep(0.93, 1.0, v));
  let foam = smoothstep(0.75, 1.0, v);
  str = (str * (0.9 - 0.4 * in.k) + 0.05 + foam * 0.45) * edge * ends;
  let col = mix(vec3f(0.55, 0.85, 1.0), U.slot[0].rgb, 0.35) + vec3f(0.3) * foam;
  let fogA = exp(-distance(in.w, G.camPos) * 0.012);
  return vec4f(col * str * 0.7 * fogA, 0.0);
}

// ---------------- billboard particles: spores, fireflies, mist puffs, spray ----------------
struct BO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) soft: f32 };
fn quadC(vi: u32) -> vec2f {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return cs[vi];
}
fn wrapAround(p: vec2f, c: vec2f, size: f32) -> vec2f { return c + (p - c) - size * round((p - c) / size); }
@vertex fn vsSpore(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  let c = quadC(vi);
  let h = hash3u(vec3u(ii, 17u, 3u)); let h2 = hash3u(vec3u(ii, 5u, 91u));
  let t = G.time;
  var o: BO; o.c = c; o.soft = 0.0;
  var wp: vec3f; var size: f32; var col: vec3f; var a: f32;
  if (ii < NSPORE) {
    let S = 44.0;
    let life = fract(h.z + t * (0.012 + 0.02 * h2.x));
    var q = vec2f(h.x, h.y) * S + vec2f(sin(t * 0.09 + h2.y * 30.0), cos(t * 0.07 + h2.z * 30.0)) * 2.0 + vec2f(0.3, 0.2) * life * 6.0;
    q = wrapAround(q, G.camPos.xz, S);
    let gy = terrH(q);
    wp = vec3f(q.x, max(gy, 0.0) + 0.2 + life * 18.0, q.y);
    size = 0.022 + 0.03 * h2.x;
    col = slotOf(h2.z * 4.0) * 1.7;
    a = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.7, 1.0, life));
  } else {
    let S = 34.0;
    var q = vec2f(h.x, h.y) * S + vec2f(sin(t * 0.11 + h2.y * 30.0) + 0.5 * sin(t * 0.23 + h.z * 9.0), cos(t * 0.09 + h2.z * 30.0) + 0.5 * cos(t * 0.19 + h.x * 9.0)) * 2.5;
    q = wrapAround(q, G.camPos.xz, S);
    let gy = terrH(q);
    wp = vec3f(q.x, max(gy, 0.0) + 0.5 + 3.0 * h2.x + sin(t * 0.17 + h.z * 20.0) * 0.6, q.y);
    size = 0.05;
    col = mix(vec3f(1.2, 1.6, 0.35), vec3f(0.5, 1.5, 0.9), h2.y) * 2.2;
    let bl = 0.5 + 0.5 * sin(t * (0.5 + 0.4 * h2.z) + h.z * 40.0) * sin(t * 0.21 + h2.x * 17.0);
    a = smoothstep(0.25, 0.85, bl);
    o.soft = 1.0;
  }
  let d = distance(wp, G.camPos);
  a *= smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(16.0, 21.0, d));
  let sz = size + d * 0.0016;
  o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz * (1.0 + 1.5 * o.soft))), 1.0);
  o.col = col * a * min(1.0, pow(size * 1.3 / sz, 2.0));
  return o;
}
@fragment fn fsSpore(in: BO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let core = exp(-r2 * select(9.0, 30.0, in.soft > 0.5));
  let halo = exp(-r2 * 5.0) * 0.1 * in.soft;
  return vec4f(in.col * (core + halo), 0.0);
}
@vertex fn vsPuff(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  let c = quadC(vi);
  let h = hash3u(vec3u(ii, 71u, 13u));
  let t = G.time;
  var o: BO; o.c = c; o.soft = 0.0;
  let base = vec3f(U.wf.x, 0.0, U.wf.w);
  var wp: vec3f; var sz: f32; var col: vec3f;
  if (ii < 28u) {
    let life = fract(h.z + t * 0.05);
    wp = base + vec3f((h.x - 0.5) * 7.0 * (0.5 + life), 0.4 + life * 4.5 + h.y, (h.y - 0.5) * 4.0 + life * 2.5);
    sz = 1.6 + life * 3.0;
    col = mix(vec3f(0.45, 0.6, 0.75), U.slot[0].rgb, 0.4) * sin(3.14159 * life) * 0.05;
    o.soft = 1.0;
  } else {
    let life = fract(h.z + t * (0.35 + 0.3 * h.x));
    let dir = normalize(vec3f(h.x - 0.5, 0.0, h.y - 0.2));
    wp = base + dir * life * (2.0 + 3.0 * h.y) + vec3f(0.0, 0.2 + life * (3.5 - 4.5 * life) * (0.6 + h.x), 0.0);
    sz = 0.035;
    col = mix(vec3f(0.7, 1.0, 1.2), U.slot[3].rgb, h.y * 0.5) * 1.6 * (1.0 - life);
  }
  let fogA = exp(-distance(wp, G.camPos) * 0.012);
  o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz)), 1.0);
  o.col = col * fogA;
  return o;
}
@fragment fn fsPuff(in: BO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let k = select(exp(-r2 * 12.0), exp(-r2 * 2.5) * (1.0 - r2 * 0.5), in.soft > 0.5);
  return vec4f(in.col * max(k, 0.0), 0.0);
}
