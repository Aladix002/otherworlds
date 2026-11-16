// Water (HDR pass), deferred glowing mist + moon shafts (afterScene), additive FX (afterScene, depth-tested).
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsWater(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f) -> WO {
  var o: WO; o.w = vec3f(p.x, 0.0, p.z); o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
fn skyRefl(rd: vec3f) -> vec3f {
  let h = max(rd.y, 0.0);
  var c = mix(hex(0x0a2a38) * 0.3, hex(0x140f33) * 0.22, smoothstep(0.0, 0.35, h));
  c = mix(c, vec3f(0.004, 0.008, 0.012), smoothstep(0.3, 0.8, h));        // canopy overhead
  let m = max(dot(rd, G.sunDir), 0.0);
  c += vec3f(0.35, 0.45, 0.8) * (pow(m, 8.0) * 0.04 + pow(m, 64.0) * 0.12 + pow(m, 260.0) * 1.6) * U.misc.x;
  return c;
}
@fragment fn fsWater(in: WO) -> @location(0) vec4f {
  let p = in.w; let t = G.time;
  let gh = terrH(p.xz);
  let depth = max(-gh, 0.0);
  let dist = distance(p, G.camPos);
  let fd = 1.0 - smoothstep(10.0, 50.0, dist);
  let fd2 = 1.0 - smoothstep(3.0, 20.0, dist);
  // layered ripple normals: slow swell + fine wind ripples near the camera
  let n1 = nz(p.xz * 0.045 + vec2f(t * 0.004, t * 0.003)).xy - 0.5;
  let n2 = nz(p.xz * 0.17 - vec2f(t * 0.009, -t * 0.006)).zw - 0.5;
  let n3 = nz(p.xz * 0.53 + vec2f(t * 0.019, t * 0.012)).xy - 0.5;
  let n4 = nz(p.xz * 1.37 - vec2f(t * 0.031, -t * 0.036)).zw - 0.5;
  var g = n1 * 0.16 + n2 * 0.15 * fd + (n3 * 0.12 + n4 * 0.09) * fd2;
  // ripples (frog hops, fish kisses)
  var rippleE = 0.0;
  for (var i = 0; i < 8; i++) {
    let r = U.rip[i];
    let age = t - r.z;
    if (age > 0.0 && age < 7.0) {
      let dv = p.xz - r.xy; let d = length(dv) + 1e-4;
      let x = d - (r.w + age * 0.42);
      let env = exp(-x * x * 6.0) * exp(-age * 0.55) * smoothstep(0.0, 0.3, age);
      g += dv / d * sin(x * 15.0) * env * 0.35;
      rippleE += env * 0.5;
    }
  }
  // rings and churn where the waterfall lands
  let wb = vec2f(U.wf.x, U.wf.w);
  let dw = distance(p.xz, wb);
  let tw = exp(-dw * 0.22);
  g += normalize(p.xz - wb + 1e-3) * sin(dw * 3.0 - t * 2.2) * tw * 0.3;
  let churn = smoothstep(0.45, 0.8, nz(p.xz * 0.33 + vec2f(0.0, t * 0.05)).x) * exp(-dw * 0.45);
  let nrm = normalize(vec3f(g.x, 1.0, g.y));
  let V = normalize(G.camPos - p);
  var R = reflect(-V, nrm); R.y = abs(R.y) + 0.01;
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);
  var refl = skyRefl(R);
  let pl = pulse(p);
  // soft reflection of the glowing shores
  let rl = length(R.xz) + 1e-3; let Rh = R.xz / rl;
  let lm = textureSampleLevel(lmap, smp, wuv(p.xz + Rh * (2.0 + 4.0 * rl / (R.y + 0.15))), 0.0);
  refl += slotCol(lm) * pl * 0.22 * U.misc.w;
  // waterfall column
  let toW = vec2f(U.wf.x, U.wf.z) - p.xz;
  let aw = dot(toW, Rh); let pw = toW.x * Rh.y - toW.y * Rh.x;
  refl += (U.slot[0].rgb * 0.4 + vec3f(0.5, 0.75, 0.9)) * exp(-pw * pw * 0.14) * smoothstep(U.wf.y + 1.0, 0.0, R.y / rl * aw) * step(0.0, aw) * 0.3;
  // lotus flowers: wobbling reflections and a faint pink sheen on the water around them
  var sheen = vec3f(0.0);
  for (var i = 0; i < 10; i++) {
    let L = U.lotus[i];
    let dv = L.xy - p.xz;
    let al = dot(dv, Rh); let pe = dv.x * Rh.y - dv.y * Rh.x;
    let w = 0.3 * L.z + 0.03 * al;
    refl += LOTUSC * exp(-pe * pe / (w * w)) * smoothstep(0.75 * L.z, 0.0, R.y / rl * al) * step(0.0, al) * (0.25 + 0.75 * L.w) * 0.7;
    sheen += LOTUSC * exp(-dot(dv, dv) / (1.6 * L.z * L.z)) * (0.3 + 0.7 * L.w);
  }
  // water body: deep teal, faintly lit by the glow on the bed and near the shore
  let T = exp(-depth * 0.9);
  let shallow = (1.0 - smoothstep(0.0, 0.4, depth)) * step(0.001, depth);
  var body = vec3f(0.002, 0.013, 0.018) + vec3f(0.0, 0.016, 0.016) * shallow + glowAt(vec3f(p.x, gh, p.z)) * 0.07 + sheen * 0.035;
  var e = U.slot[0].rgb * shallow * 0.05 * pl;
  e += U.slot[0].rgb * (rippleE * 0.22 + tw * 0.14 * (0.6 + 0.4 * sin(dw * 2.0 - t * 1.7)));
  let ringF = exp(-pow((dw - 2.2) / 1.1, 2.0)) * smoothstep(0.35, 0.7, nz(p.xz * 0.9 + vec2f(t * 0.03, -t * 0.07)).y);
  e += (vec3f(0.5, 0.7, 0.8) + U.slot[0].rgb * 0.3) * (churn * 0.35 + ringF * 0.5);
  // plankton sparkles stirred near the falls and ripples
  let sp = nz(p.xz * 1.7 + vec2f(t * 0.02, 0.0));
  e += mix(U.slot[3].rgb, U.slot[0].rgb, sp.y) * smoothstep(0.86, 0.95, sp.x) * (tw * 2.0 + rippleE + 0.12 + 0.2 * pl) * fd * 0.6;
  let col = refl * F + body * (1.0 - F) + e;
  let a = clamp(mix(0.66 + 0.24 * (1.0 - T), 1.0, F), 0.0, 1.0) * smoothstep(0.0, 0.09, depth);   // soft shoreline, no stair-steps against the terrain grid
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
  let M = U.misc.y * mix(0.4, 1.0, smoothstep(0.4, 2.4, ro.y)) * (0.75 + 0.5 * nz((ro.xz + rd.xz * min(dist, 22.0)) * 0.011 + vec2f(G.time * 0.002, 0.0)).z); let k = 0.45;
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
  var inscat = G.fogColor * (1.0 - T) * (1.0 + 1.0 * phaseHG(mu, 0.55) * U.misc.x) + gs;
  // moon shafts: soft light columns along the moon direction
  var sh = 0.0;
  let A = -G.sunDir;
  for (var i = 0; i < 6; i++) {
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
    let fall = smoothstep(-1.0, 4.0, hgt) * (1.0 - smoothstep(12.0, 24.0, hgt));
    let dust = 0.7 + 0.6 * nz(cp.xz * 0.004 + vec2f(G.time * 0.003, hgt * 0.002)).x;
    sh += exp(-off * off / (s.z * s.z)) * s.w * fall * dust / sqrt(den) * smoothstep(1.5, 6.0, tr);
  }
  inscat += vec3f(0.42, 0.52, 0.95) * sh * 0.016 * U.misc.x;
  let k2 = 1.0 - G.transition;
  return vec4f(inscat * k2, (1.0 - T) * k2);
}

// ---------------- waterfall sheet ----------------
struct XO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
fn fallPos(u: f32, v: f32, layer: f32) -> vec3f {
  let lip = U.wf.xyz; let bz = U.wf.w;
  let wdt = mix(5.4, 7.4, layer) * (1.0 + 0.3 * v);
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
  str = (str * (0.9 - 0.4 * in.k) + 0.05 + foam * 0.2) * edge * ends;
  let col = mix(vec3f(0.55, 0.85, 1.0), U.slot[0].rgb, 0.35) + vec3f(0.3) * foam;
  let fogA = exp(-distance(in.w, G.camPos) * 0.012);
  return vec4f(col * str * 0.48 * fogA * (1.0 - G.transition), 0.0);
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
    size = 0.03 + 0.05 * h2.x * h2.x;
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
  a *= smoothstep(1.5, 5.0, d) * (1.0 - smoothstep(16.0, 21.0, d));
  let sz = size + d * 0.0028;
  o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz * (1.0 + 1.5 * o.soft))), 1.0);
  o.col = col * a * min(1.0, pow(size * 1.3 / sz, 2.0)) * (1.0 - G.transition);
  return o;
}
@fragment fn fsSpore(in: BO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let core = select(exp(-r2 * 5.0) * max(1.0 - r2, 0.0), exp(-r2 * 30.0), in.soft > 0.5);
  let halo = exp(-r2 * 5.0) * 0.1 * in.soft;
  return vec4f(in.col * (core + halo), 0.0);
}
@vertex fn vsPuff(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BO {
  let c = quadC(vi);
  let h = hash3u(vec3u(ii, 71u, 13u));
  let t = G.time;
  var o: BO; o.c = c; o.soft = 1.0;
  let base = vec3f(U.wf.x, 0.0, U.wf.w);
  var wp: vec3f; var sz: f32; var col: vec3f;
  if (ii < 40u) {
    // layered mist billows drifting up and out from the foot of the fall
    let life = fract(h.z + t * (0.03 + 0.03 * h.x));
    wp = base + vec3f((h.x - 0.5) * 8.0 * (0.4 + life), 0.3 + life * (2.0 + 4.0 * h.y), (h.y - 0.5) * 4.0 + life * 3.0);
    sz = (1.0 + 2.2 * h.y) * (0.7 + life * 1.6);
    col = mix(vec3f(0.4, 0.55, 0.7), U.slot[0].rgb, 0.35) * sin(3.14159 * life) * 0.02;
  } else if (ii < 260u) {
    let life = fract(h.z + t * (0.35 + 0.3 * h.x));
    let dir = normalize(vec3f(h.x - 0.5, 0.0, h.y - 0.2));
    wp = base + dir * life * (2.0 + 3.0 * h.y) + vec3f(0.0, 0.2 + life * (3.5 - 4.5 * life) * (0.6 + h.x), 0.0);
    sz = 0.035;
    col = mix(vec3f(0.7, 1.0, 1.2), U.slot[3].rgb, h.y * 0.5) * 1.3 * (1.0 - life);
    o.soft = 0.0;
  } else if (ii < 270u) {
    let L = U.lotus[ii - 260u];
    sz = 1.9 * L.z;
    wp = vec3f(L.x, 0.5 * sz, L.y);
    o.soft = 2.0;
    col = LOTUSC * (0.025 + 0.06 * L.w) * (0.8 + 0.3 * pulse(wp));
  } else if (ii > 275u) {
    sz = 2.3 * U.flower.w;
    wp = U.flower.xyz + vec3f(0.0, 0.3 * sz, 0.0);
    o.soft = 2.0;
    col = mix(U.slot[2].rgb, U.slot[0].rgb, 0.4) * (0.012 + 0.05 * U.fx.x) * (0.8 + 0.3 * pulse(wp));
  } else {
    let f = U.frog[ii - 270u];
    sz = 0.55;
    wp = f.xyz + vec3f(0.0, 0.5 * sz - 0.05, 0.0);
    o.soft = 2.0;
    col = mix(U.slot[3].rgb, U.slot[0].rgb, 0.35) * (0.05 + 0.12 * U.frogB[ii - 270u].z);
  }
  let fogA = exp(-distance(wp, G.camPos) * 0.012) * (1.0 - G.transition);
  o.pos = G.viewProj * vec4f(billboard(wp, c, vec2f(sz)), 1.0);
  o.col = col * fogA;
  return o;
}
// soft glow on the water above each koi (instance = fish buffer)
@vertex fn vsFishGlow(@builtin(vertex_index) vi: u32, @location(4) a: vec4f, @location(5) b: vec4f) -> BO {
  let c = quadC(vi);
  let f = fishPos(a, b);
  var o: BO; o.c = c; o.soft = 1.0;
  let fw = vec2f(sin(f.w), cos(f.w));
  let q = (c.x * vec2f(fw.y, -fw.x) * 0.6 + c.y * fw) * 1.1;
  let wp = vec3f(f.x + q.x, 0.012, f.z + q.y);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.col = mix(vec3f(1.0, 0.4, 0.12), slotOf(b.y), 0.3) * 0.11 * exp(f.y * 1.5) * (1.0 - G.transition) * smoothstep(1.5, 5.0, distance(f.xyz, G.camPos));
  return o;
}
@fragment fn fsPuff(in: BO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let s = max(1.0 - r2, 0.0);
  var k = select(exp(-r2 * 12.0), s * s * exp(-r2 * 1.2), in.soft > 0.5);
  if (in.soft > 1.5) { k = max(1.0 - dot(in.c - vec2f(0.0, -0.25), in.c - vec2f(0.0, -0.25)) * 1.8, 0.0); k = k * k * smoothstep(-0.5, -0.2, in.c.y); }
  return vec4f(in.col * k, 0.0);
}


// ---------------- flyers: butterflies, moon moths, dragonflies, bird wings (5 additive quads each: body glow + 4 wings) ----------------
struct WG { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) k: f32 };
fn bfPos(ii: u32, t: f32) -> vec3f {
  let h = hash3u(vec3u(ii, 29u, 7u)); let h2 = hash3u(vec3u(ii, 3u, 57u));
  let S = 38.0;
  var q = h.xy * S + vec2f(sin(t * 0.13 + h2.x * 30.0) + 0.6 * sin(t * 0.31 + h.z * 9.0), cos(t * 0.11 + h2.y * 30.0) + 0.6 * cos(t * 0.27 + h.x * 9.0)) * 3.0;
  q = wrapAround(q, G.camPos.xz, S);
  return vec3f(q.x, max(terrH(q), 0.0) + 0.5 + 1.6 * h2.z + 0.35 * sin(t * 0.5 + h.z * 20.0) + 0.1 * sin(t * 2.3 + h.x * 11.0), q.y);
}
fn dfWp(j: u32, k: f32) -> vec3f {   // dragonfly waypoints near a home spot over the lagoon or the pool
  let h0 = hash3u(vec3u(j, 41u, 9u));
  var c = LAGOON; if (j >= NDFL) { c = POOLC; }
  let a0 = h0.x * 6.2832;
  let home = c.xy + vec2f(cos(a0) * c.z, sin(a0) * c.w) * sqrt(h0.y) * 0.7;
  let h = hash3u(vec3u(j, u32(k), 77u));
  return vec3f(home.x + (h.x - 0.5) * 5.0, 0.3 + 0.9 * h.z, home.y + (h.y - 0.5) * 5.0);
}
@vertex fn vsWing(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> WG {
  let qi = vi / 6u; let c = quadC(vi % 6u); let t = G.time;
  let h = hash3u(vec3u(ii, 13u, 31u));
  var o: WG; o.c = c;
  var pos: vec3f; var f: vec3f; var L: f32; var W: f32; var phi: f32; var col: vec3f;
  var kind = 1.0; var a = 1.0; var hind = 0.75; var sweep = 0.35; var bl = 0.5; var sep = 0.28;
  if (ii < NBF) {
    pos = bfPos(ii, t); f = bfPos(ii, t + 0.4) - pos;
    L = 0.1 + 0.07 * h.x; W = L * 0.55; phi = 0.3 + 0.95 * sin(t * (8.0 + 3.0 * h.y) + h.z * 40.0);
    col = mix(slotOf(h.z * 4.0), vec3f(0.8, 0.9, 1.0), 0.25 * h.y) * 1.5;
    let d = distance(pos, G.camPos); a = smoothstep(1.2, 3.5, d) * (1.0 - smoothstep(14.0, 18.0, d));
  } else if (ii < NBF + NMOTH) {
    let m = MOTHC[ii - NBF]; let sg = 1.0 - 2.0 * f32((ii - NBF) & 1u);
    let th = t * 0.06 * sg + h.x * 6.2832;
    pos = vec3f(m.x + cos(th) * m.z, m.w + sin(th * 1.7 + h.y * 6.0), m.y + sin(th) * m.z * 0.7);
    f = vec3f(-sin(th), 0.0, cos(th) * 0.7) * sg;
    L = 0.62; W = L * 0.55; phi = 0.2 + 0.6 * sin(t * 2.1 + h.z * 9.0); kind = 2.0;
    col = mix(U.slot[2].rgb, vec3f(0.7, 0.9, 1.0), 0.45) * 0.8;
    let d = distance(pos, G.camPos); a = smoothstep(2.0, 5.0, d) * (1.0 - smoothstep(60.0, 80.0, d));
  } else if (ii < NBF + NMOTH + NDF) {
    let j = ii - NBF - NMOTH;
    let tt = t * (0.17 + 0.07 * h.x) + h.y * 10.0 + 100.0; let k = floor(tt); let fr = tt - k;
    let p0 = dfWp(j, k - 1.0); let p1 = dfWp(j, k); let p2 = dfWp(j, k + 1.0);
    pos = mix(p1, p2, smoothstep(0.62, 1.0, fr)) + vec3f(sin(t * 0.9 + h.z * 9.0), 0.6 * sin(t * 1.3 + h.x * 7.0), cos(t * 0.7 + h.y * 5.0)) * 0.06;
    f = mix(p1 - p0, p2 - p1, smoothstep(0.1, 0.55, fr));
    L = 0.24; W = 0.045; phi = 0.1 + 0.05 * sin(t * 23.0 + h.z * 30.0); hind = 0.9; sweep = 0.0; bl = 1.3; kind = 3.0; sep = 0.12;
    col = mix(U.slot[0].rgb, U.slot[3].rgb, h.z) * 2.6;
    let d = distance(pos, G.camPos); a = smoothstep(1.2, 3.0, d) * (1.0 - smoothstep(40.0, 55.0, d));
  } else {
    let b = U.bird[ii - NBF - NMOTH - NDF];
    pos = b.xyz + vec3f(0.0, 0.04, 0.0); f = vec3f(sin(b.w), 0.0, cos(b.w));
    L = 0.27; W = 0.12; phi = 0.15 + 0.3 * sin(t * 5.0 + f32(ii)); kind = 4.0; sweep = -0.2; sep = 0.0;
    col = mix(U.slot[0].rgb, vec3f(0.8, 0.9, 1.0), 0.4) * 0.5;
    a = 1.0 - smoothstep(30.0, 45.0, distance(pos, G.camPos));
  }
  f = normalize(vec3f(f.x, 0.0, f.z) + vec3f(1e-4, 0.0, 0.0));
  let r = vec3f(f.z, 0.0, -f.x);
  var wp: vec3f;
  if (qi == 0u) {
    let s = normalize(cross(f, G.camPos - pos));
    wp = pos + f * L * (c.y * (0.3 + 0.45 * bl) - 0.4 * bl) + s * c.x * L * 0.14;
    o.k = 0.0;
    if (kind > 3.5) { a = 0.0; }
  } else {
    let side = f32((qi - 1u) & 1u) * 2.0 - 1.0; let pair = f32((qi - 1u) / 2u);
    if (pair > 0.5 && kind > 3.5) { a = 0.0; }
    let ph = phi - pair * 0.2;
    let sdv = r * side * cos(ph) + vec3f(0.0, sin(ph), 0.0);
    let Lp = L * mix(1.0, hind, pair); let ax = c.x * 0.5 + 0.5;
    wp = pos + f * (mix(sep, -sep, pair) * L + c.y * W + mix(sweep, -sweep, pair) * ax * Lp) + sdv * ax * Lp;
    o.k = kind;
  }
  o.pos = G.viewProj * vec4f(wp, 1.0);
  if (a < 0.002) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  o.col = col * a * (1.0 - G.transition);
  return o;
}
@fragment fn fsWing(in: WG) -> @location(0) vec4f {
  let ax = in.c.x * 0.5 + 0.5; let b = in.c.y; let kind = in.k; var m = 0.0;
  if (kind < 0.5) { m = exp(-in.c.x * in.c.x * 5.0) * max(1.0 - b * b, 0.0); m = m * m * 0.9; }
  else if (kind < 2.5) {
    // butterfly / moth wing: teardrop outline, veins, bright edge band, eye spot on the big moths
    let w = pow(sin(3.14159 * pow(ax, 0.62)), 0.8); let d = w - abs(b);
    let vein = 0.5 + 0.5 * cos(b / max(w, 0.05) * 7.0);
    let spot = exp(-(pow(ax - 0.62, 2.0) * 60.0 + b * b * 9.0)) * step(1.5, kind);
    m = smoothstep(0.0, 0.07, d) * (0.1 + 0.22 * vein * ax + 0.65 * smoothstep(0.3, 0.03, d) * (0.3 + 0.7 * ax) + spot * 0.9);
  } else if (kind < 3.5) {
    let w = 0.95 * pow(sin(3.14159 * pow(ax, 0.8)), 0.45); let d = w - abs(b);
    m = smoothstep(0.0, 0.15, d) * (0.1 + 0.4 * smoothstep(0.5, 0.0, d) + 0.25 * (0.5 + 0.5 * cos(ax * 40.0)) * ax);
  } else { m = smoothstep(0.0, 0.25, ax) * smoothstep(1.0, 0.5, ax) * max(1.0 - b * b, 0.0) * 0.35; }
  return vec4f(in.col * m, 0.0);
}
