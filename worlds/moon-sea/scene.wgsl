// Opaque scene: sand (shore strip + sandbars), rocks, the tree, lanterns. Additive: lantern glows and light pools.
struct TO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vsTerr(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> TO {
  var o: TO; o.w = p; o.n = n; o.uv = uv; o.pos = clipW(p); return o;
}
@fragment fn fsTerr(in: TO) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let p = in.w; let s = in.uv.x; let t = G.time;
  let V = normalize(eye() - p);
  let dist = distance(p, eye());
  let nf = 1.0 - smoothstep(10.0, 45.0, dist);
  // sand ripples: warped stripes across the wind, fading with distance and on wet flats
  let wv = fbm2(p.xz * 0.21, 2);
  let ph = (p.x * 0.78 + p.z * 0.62) * 7.0 + wv * 5.0;
  let big = fbm2(p.xz * 0.9 + 4.0, 3);
  let wet = 1.0 - smoothstep(0.015, 0.2, p.y);
  let ra = (0.17 + 0.1 * big) * nf * (1.0 - 0.6 * wet);
  var n = normalize(in.n + vec3f(0.78, 0.0, 0.62) * cos(ph) * ra + vec3f(big, 0.0, vnoise2(p.xz * 5.0)) * 0.06 * nf);
  var alb = mix(vec3f(0.5, 0.47, 0.43), vec3f(0.36, 0.33, 0.3), smoothstep(-0.4, 0.5, wv + 0.3 * big));
  alb *= 0.9 + 0.1 * sin(ph) * nf;
  alb *= mix(1.0, 0.36, wet);
  let nl = wrapDiffuse(n, G.sunDir, 0.3);
  var c = alb * (G.sunColor * nl + hemi(n, G.ambientSky, G.ambientGround) + lampLight(p, n));
  // wet sheen: horizon sky + broad moon glint
  let F = fresnelSchlick(dot(n, V), 0.04);
  let R = reflect(-V, n);
  c += wet * (F * skyBase(vec3f(R.x, abs(R.y) + 0.02, R.z)) * 0.9 + G.sunColor * specBlinn(n, G.sunDir, V, 90.0) * 0.6);
  // bioluminescent swash sliding up and down the beach (s = metres inland of the mean waterline)
  if (in.uv.y > 0.5) {
    let al = snoise2(p.xz * 0.035);
    let sw = 1.4 + 1.5 * sin(t * 0.41 + al * 3.0) + 0.7 * sin(t * 0.27 + al * 5.0 + 1.3);
    let film = smoothstep(sw + 0.12, sw - 0.12, s);
    let tex = 0.55 + 0.45 * snoise2(p.xz * 2.3 + vec2f(0.0, t * 0.12));
    let v0 = voronoi2(p.xz * 11.0);
    let dots = mix(exp(-v0.x * v0.x * 30.0) * v0.z * v0.z * 7.0, 0.7, smoothstep(4.0, 22.0, dist));
    let bk = max(sw - s, 0.0);
    c += BIO * film * (exp(-bk * 5.0) * 1.3 * tex + exp(-bk * 0.9) * (dots * 0.5 + 0.12) + 0.03);
    // sparks left on the wet sand
    let v = voronoi2(p.xz * 7.0);
    let tw = pow(0.5 + 0.5 * sin(t * (0.5 + v.z) + v.z * 50.0), 3.0);
    c += BIO * exp(-v.x * v.x * 26.0) * step(0.62, v.z) * tw * smoothstep(4.6, 3.6, s) * smoothstep(-1.0, 0.5, s) * 1.3 * (1.0 - smoothstep(6.0, 30.0, dist));
    // light spill on the dune faces
    c += alb * BIO * 0.1 * exp(-max(s, 0.0) * 0.07) * (0.6 + 0.4 * sin(t * 0.41 + al * 3.0));
  }
  // footsteps wake up the plankton in wet sand
  let sg = stepGlow(p.xz) * wet;
  if (sg > 0.003) {
    let v = voronoi2(p.xz * 16.0);
    c += BIO * sg * (0.25 + 3.0 * exp(-v.x * v.x * 22.0) * step(0.3, v.z));
  }
  return vec4f(fogged(c, p), 1.0);
}

// ---- rocks ----
struct RO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) tint: f32 };
@vertex fn vsRock(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> RO {
  let R = rotY(b.x);
  let s = vec3f(a.w, a.w * b.z, a.w);
  var o: RO;
  o.w = a.xyz + R * (p * s); o.n = normalize(R * (n / s)); o.tint = b.y; o.lp = p;
  o.pos = clipW(o.w); return o;
}
@fragment fn fsRock(in: RO) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let p = in.w;
  let g = fbm3(in.lp * 3.0 + in.tint * 10.0, 3);
  let n = normalize(in.n + 0.18 * vec3f(g, fbm3(in.lp * 6.0, 2), -g) + 0.2 * vec3f(fbm3(in.lp * 13.0 + 5.0, 2), 0.0, fbm3(in.lp * 13.0 - 5.0, 2)));
  let V = normalize(eye() - p);
  let wet = 1.0 - smoothstep(0.03, 0.16, p.y);
  let g2 = fbm3(in.lp * 11.0, 3);
  var alb = mix(vec3f(0.08, 0.085, 0.1), vec3f(0.2, 0.2, 0.21), g * 0.4 + g2 * 0.3 + 0.5) * (0.7 + 0.5 * in.tint) * mix(1.0, 0.45, wet);
  var c = alb * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.15) + hemi(n, G.ambientSky, G.ambientGround) + lampLight(p, n));
  c += G.sunColor * specBlinn(n, G.sunDir, V, mix(14.0, 40.0, wet)) * mix(0.04, 0.16, wet) * max(dot(n, G.sunDir), 0.0);
  c += fresnelSchlick(dot(n, V), 0.03) * G.ambientSky * (0.5 + wet);
  c *= smoothstep(-0.02, 0.1, p.y) * 0.6 + 0.4;   // contact darkening at the waterline
  return vec4f(fogged(c, p), 1.0);
}

// ---- tree ----
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
fn sway(p: vec3f, ph: f32, amt: f32) -> vec3f {
  let t = G.time;
  let h = max(p.y - U.misc.y, 0.0);
  let g = sin(t * 0.33 + p.x * 0.2) * 0.6 + sin(t * 0.21 + 1.7) * 0.4;
  return p + vec3f(0.9, 0.0, 0.45) * (g * 0.006 * h * h + amt * 0.02 * sin(t * 1.1 + ph * 30.0) + amt * 0.012 * sin(t * 1.9 + ph * 70.0));
}
@vertex fn vsWood(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> WO {
  var o: WO; o.w = sway(p, 0.0, 0.0); o.n = n; o.uv = uv; o.pos = clipW(o.w); return o;
}
@fragment fn fsWood(in: WO) -> @location(0) vec4f {
  let p = in.w; let V = normalize(eye() - p);
  let b = fbm2(vec2f(in.uv.x * 14.0, p.y * 5.0 + in.uv.x * 3.0), 3);
  let n = normalize(in.n + 0.3 * b * vec3f(in.n.z, 0.0, -in.n.x));
  let alb = mix(vec3f(0.075, 0.06, 0.055), vec3f(0.19, 0.17, 0.16), b * 0.5 + 0.5);
  var c = alb * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.2) * 1.3 + hemi(n, G.ambientSky, G.ambientGround) + lampLight(p, n) * 1.2);
  c += G.sunColor * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12 * max(dot(n, G.sunDir) + 0.4, 0.0);
  return vec4f(fogged(c, p), 1.0);
}
@vertex fn vsLeaf(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> WO {
  var o: WO; o.w = sway(p, uv.x, 1.0); o.n = n; o.uv = uv; o.pos = clipW(o.w); return o;
}
@fragment fn fsLeaf(in: WO) -> @location(0) vec4f {
  let p = in.w; let V = normalize(eye() - p);
  var n = normalize(in.n);
  if (dot(n, V) < 0.0) { n = -n; }
  let alb = mix(vec3f(0.34, 0.3, 0.4), vec3f(0.6, 0.5, 0.58), in.uv.y);
  let back = pow(max(dot(-V, G.sunDir), 0.0), 3.0);
  var c = alb * (G.sunColor * (abs(dot(n, G.sunDir)) * 0.7 + 0.3 + 1.6 * back) + hemi(n, G.ambientSky, G.ambientGround) * 1.2 + lampLight(p, n) * 1.3);
  return vec4f(fogged(c, p), 1.0);
}

// ---- lanterns ----
struct LO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) fa: vec2f,
};
fn lanternScale(c: vec3f, s: f32) -> f32 {
  let d = distance(vec3f(c.x, c.y * MIR, c.z), G.camPos);
  return s * max(1.0, d * G.tanHalfFov * G.invResolution.y * 11.0);   // never thinner than ~3 px
}
@vertex fn vsLant(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> LO {
  let L = lanternAt(i0, i1);
  let sc = lanternScale(L.p, i1.z);
  let R = rotY(i0.w * 30.0 + G.time * 0.05 * (i0.w - 0.5));
  var o: LO;
  o.w = L.p + R * (p * sc); o.n = R * n; o.uv = uv; o.fa = vec2f(L.fl, L.a);
  o.pos = clipW(o.w);
  if (L.a < 0.004) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsLant(in: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let v = in.uv.y;
  let V = normalize(eye() - in.w);
  let ndv = abs(dot(normalize(in.n), V));
  let front = ff == (MIR > 0.0);
  let hot = exp(-v * 3.4);
  var e = mix(vec3f(1.0, 0.3, 0.055), vec3f(1.0, 0.6, 0.2), hot) * (0.75 + 5.0 * hot * hot);
  e *= 0.5 + 0.5 * ndv;
  e *= 1.0 - 0.07 * pow(abs(sin(in.uv.x * TAU * 3.0)), 10.0);          // paper seams
  e *= 1.0 - 0.3 * smoothstep(0.86, 0.97, v);                          // top cap
  e *= 0.93 + 0.07 * snoise2(vec2f(in.uv.x * 9.0, v * 5.0));            // paper mottling
  if (!front) { e = vec3f(1.0, 0.7, 0.3) * (2.0 + 7.0 * hot); }         // the lit inside, seen from below
  return vec4f(fogged(e * in.fa.x * in.fa.y, in.w), 1.0);
}

struct GO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) a: f32 };
@vertex fn vsGlow(@builtin(vertex_index) vi: u32, @location(0) i0: vec4f, @location(1) i1: vec4f) -> GO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let L = lanternAt(i0, i1);
  let sc = lanternScale(L.p, i1.z);
  let c = vec3f(L.p.x, (L.p.y + 0.3 * sc) * MIR, L.p.z);
  var o: GO;
  o.pos = G.viewProj * vec4f(billboard(c, cs[vi], vec2f(1.9 * sc)), 1.0);
  o.c = cs[vi];
  o.a = L.fl * L.a * (1.0 - fogAmount(distance(c, G.camPos)));
  if (L.a < 0.004 || (MIR < 0.0 && L.p.y < 0.0)) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsGlow(in: GO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let g = max(exp(-r2 * 3.2) - 0.0408, 0.0) * 0.16 + max(exp(-r2 * 16.0) - 0.0001, 0.0) * 0.34;
  return vec4f(WARM * g * in.a, 0.0);
}
// warm light pool on the water under low lanterns
@vertex fn vsPool(@builtin(vertex_index) vi: u32, @location(0) i0: vec4f, @location(1) i1: vec4f) -> GO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let L = lanternAt(i0, i1);
  let r = 2.2 + L.p.y * 1.1;
  let d = distance(L.p, G.camPos);
  var o: GO;
  o.pos = G.viewProj * vec4f(L.p.x + cs[vi].x * r, 0.012 + d * 0.0015, L.p.z + cs[vi].y * r, 1.0);
  o.c = cs[vi];
  o.a = L.fl * L.a / (1.0 + L.p.y * L.p.y * 0.12) * (1.0 - fogAmount(d));
  if (o.a < 0.01) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsPool(in: GO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let g = max(exp(-r2 * 3.5) - 0.0302, 0.0);
  return vec4f(WARM * g * in.a * 0.11, 0.0);
}

// ---- dune grass: instanced tufts of thin blades, never thinner than ~1.5 px ----
struct BO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) uv: vec2f, @location(2) @interpolate(flat) tint: f32 };
@vertex fn vsGrass(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> BO {
  let t = G.time;
  var w = a.xyz + rotY(b.x) * (p * a.w);
  let k = uv.y * uv.y * a.w;
  w += vec3f(0.85, 0.0, 0.5) * k * (0.07 * sin(t * 0.8 + a.x * 0.25 + a.z * 0.17) + 0.035 * sin(t * 1.9 + b.y * 20.0) + 0.05);
  let m = vec3f(w.x, w.y * MIR, w.z);
  let d = distance(m, G.camPos);
  let wm = m + G.camRight * uv.x * d * G.tanHalfFov * G.invResolution.y * 1.6 * (1.0 - 0.7 * uv.y);
  var o: BO;
  o.pos = G.viewProj * vec4f(mix(vec3f(a.x, a.y * MIR, a.z), wm, 1.0 - smoothstep(110.0, 160.0, d)), 1.0);
  o.w = w; o.uv = uv; o.tint = b.y;
  return o;
}
@fragment fn fsGrass(in: BO) -> @location(0) vec4f {
  let alb = mix(vec3f(0.07, 0.09, 0.075), vec3f(0.2, 0.22, 0.17), in.uv.y * (0.6 + 0.4 * in.tint));
  let V = normalize(eye() - in.w);
  let back = pow(max(dot(-V, G.sunDir), 0.0), 3.0);
  let c = alb * (G.sunColor * (0.55 + 0.45 * in.uv.y + 1.2 * back) + G.ambientSky + BIO * 0.05);
  return vec4f(fogged(c, in.w), 1.0);
}
