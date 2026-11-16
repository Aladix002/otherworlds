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
  let nn = 1.0 - smoothstep(3.0, 14.0, dist);
  // sand ripples across the wind (two scales) + grain; they fade with distance and on wet flats
  let wv = fbm2(p.xz * 0.21, 2);
  let ph = (p.x * 0.78 + p.z * 0.62) * 7.0 + wv * 5.0;
  let big = fbm2(p.xz * 0.9 + 4.0, 3);
  let wet = 1.0 - smoothstep(0.008, 0.075, p.y);
  let dry = 1.0 - 0.7 * wet;
  let ph2 = ph * 3.3 + big * 4.0;
  let gr = vec2f(snoise2(p.xz * 17.0), snoise2(p.xz * 17.0 + 37.0)) * dry;
  let fl = smoothstep(0.55, 0.9, in.n.y);   // ripples flatten out on steep faces instead of stretching
  var n = normalize(in.n + vec3f(0.78, 0.0, 0.62) * (cos(ph) * (0.1 + 0.03 * big) * nf + cos(ph2) * 0.07 * nn) * dry * fl
    + vec3f(big, 0.0, vnoise2(p.xz * 5.0)) * 0.03 * nf + vec3f(gr.x, 0.0, gr.y) * 0.13 * nn);
  var alb = mix(vec3f(0.48, 0.455, 0.42), vec3f(0.4, 0.375, 0.345), smoothstep(-0.5, 0.6, wv + 0.2 * big));
  alb *= (0.94 + 0.06 * sin(ph) * nf) * (0.94 + 0.06 * gr.x * nn);
  alb *= mix(1.0, 0.5, wet);
  let nl = wrapDiffuse(n, G.sunDir, 0.1);
  let ndv = max(dot(n, V), 0.0);
  var c = alb * (G.sunColor * nl * 1.35 + hemi(n, G.ambientSky, G.ambientGround) * 0.8 + lampLight(p, in.n) * 0.6);
  // moon rim on the crests, sparse glints of grain, a thin clean sheen on the wet strip
  c += alb * G.sunColor * pow(1.0 - ndv, 3.0) * 0.7 * max(dot(n, G.sunDir) + 0.4, 0.0);
  let R = reflect(-V, n);
  let gl = step(0.99, hash21(floor(p.xz * 85.0))) * pow(max(dot(R, G.sunDir), 0.0), 5.0);
  c += G.sunColor * gl * 1.5 * (1.0 - smoothstep(3.0, 16.0, dist)) * dry;
  c += wet * (fresnelSchlick(ndv, 0.04) * G.fogColor * 1.4 + G.sunColor * specBlinn(n, G.sunDir, V, 60.0) * 0.25);
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
    c += alb * BIO * (0.16 * exp(-max(s, 0.0) * 0.06) + 0.3 * exp(-max(s - sw, 0.0) * 0.5)) * (0.6 + 0.4 * sin(t * 0.41 + al * 3.0));
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
  let p = in.w; let lp = in.lp + in.tint * 10.0;
  let dist = distance(p, eye());
  let nf = 1.0 - smoothstep(12.0, 50.0, dist);
  // fractured stone: broad chipped facets, bedding strata, cracks along cell borders, fine grain
  let v = voronoi3(lp * 2.3);
  let g = fbm3(lp * 3.0, 3);
  let g2 = fbm3(lp * 17.0, 2);
  let fac = normalize(hash33(vec3f(v.z * 91.0, v.z * 37.0, 1.0)) - 0.5);
  let cm = smoothstep(-0.2, 0.4, g);          // cracks come in patches
  let crack = smoothstep(0.035, 0.0, v.y - v.x) * nf * cm * 0.8;
  let strata = sin((lp.y + 0.25 * g) * 34.0);
  var n = normalize(in.n + (fac * 0.4 + vec3f(g2, strata * 0.25, -g2) * 0.22) * nf + 0.12 * vec3f(g, 0.0, -g));
  let V = normalize(eye() - p);
  let wet = 1.0 - smoothstep(0.03, 0.16, p.y);
  var alb = mix(vec3f(0.1, 0.105, 0.12), vec3f(0.3, 0.29, 0.28), clamp(0.45 + 0.35 * g + 0.2 * g2 + 0.25 * (v.z - 0.5) + 0.06 * strata, 0.0, 1.0));
  alb = mix(alb, vec3f(0.3, 0.31, 0.27), smoothstep(0.25, 0.6, fbm3(lp * 1.4 + 9.0, 2)) * smoothstep(0.2, 0.8, in.n.y) * 0.55);   // pale lichen on top
  alb *= (0.7 + 0.5 * in.tint) * mix(1.0, 0.45, wet) * (1.0 - 0.75 * crack);
  let ao = 0.55 + 0.45 * smoothstep(-0.35, 0.5, in.lp.y);
  var c = alb * ao * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.1) * 1.3 + hemi(n, G.ambientSky, G.ambientGround) + lampLight(p, n));
  c += G.sunColor * specBlinn(n, G.sunDir, V, mix(14.0, 40.0, wet)) * mix(0.05, 0.16, wet) * max(dot(n, G.sunDir), 0.0);
  c += alb * G.sunColor * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.5 * max(dot(in.n, G.sunDir) + 0.5, 0.0);
  c += fresnelSchlick(dot(n, V), 0.03) * G.ambientSky * (0.4 + wet);
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
  var alb = mix(vec3f(0.075, 0.06, 0.055), vec3f(0.19, 0.17, 0.16), b * 0.5 + 0.5);
  alb = mix(alb, vec3f(0.36, 0.3, 0.37), smoothstep(1.7, 2.7, p.y - U.misc.y) * 0.8);   // twigs in the crown take the blossom tone
  var c = alb * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.2) * 1.3 + hemi(n, G.ambientSky, G.ambientGround) + lampLight(p, n) * 1.2);
  c += G.sunColor * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12 * max(dot(n, G.sunDir) + 0.4, 0.0);
  return vec4f(fogged(c, p), 1.0);
}
// blossoms: quad cards cut to a five-petal flower (uv.x = corner index + phase, uv.y = tone)
struct BLO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) q: vec2f, @location(3) @interpolate(flat) tone: f32 };
@vertex fn vsLeaf(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> BLO {
  let ci = floor(uv.x);
  var o: BLO; o.w = sway(p, fract(uv.x), 1.0); o.n = n; o.tone = uv.y;
  o.q = vec2f(ci - 2.0 * floor(ci * 0.5), floor(ci * 0.5)) * 2.0 - 1.0;
  o.pos = clipW(o.w); return o;
}
@fragment fn fsLeaf(in: BLO) -> @location(0) vec4f {
  let p = in.w; let V = normalize(eye() - p);
  let dist = distance(p, eye());
  let far = smoothstep(5.0, 20.0, dist);
  let r = length(in.q); let a = atan2(in.q.y, in.q.x) + in.tone * 40.0;
  let pet = abs(cos(a * 2.5));
  let R = mix(0.46 + 0.54 * pow(pet, 0.55), 0.9, far);
  if (r > R) { discard; }
  var n = normalize(in.n);
  if (dot(n, V) < 0.0) { n = -n; }
  // cupped petals: the normal leans outward, each petal has a crease and a paler rim
  let T = normalize(cross(n, vec3f(0.31, 0.9, 0.3))); let B = cross(n, T);
  n = normalize(n + (T * in.q.x + B * in.q.y) * 0.75 * (1.0 - far));
  let rr = r / R;
  let hue = fract(in.tone * 7.31);
  var tip = mix(vec3f(0.5, 0.42, 0.58), vec3f(0.84, 0.72, 0.76), in.tone);
  tip = mix(tip, vec3f(0.82, 0.5, 0.62), smoothstep(0.6, 1.0, hue) * 0.7);
  tip = mix(tip, vec3f(0.9, 0.88, 0.92), smoothstep(0.3, 0.0, hue) * 0.6);
  var alb = mix(vec3f(0.62, 0.3, 0.42), tip, smoothstep(0.1, 0.75, rr));
  alb *= 0.8 + 0.2 * pet;
  alb = mix(alb, vec3f(0.9, 0.7, 0.3), smoothstep(0.2, 0.1, r) * (1.0 - far));     // stamens
  let back = pow(max(dot(-V, G.sunDir), 0.0), 3.0);
  let hg = clamp((p.y - U.misc.y - 1.6) * 0.45, 0.0, 1.0);
  var c = alb * (0.5 + 0.6 * hg) * (G.sunColor * (max(dot(n, G.sunDir), 0.0) * 0.75 + 0.3 + 2.4 * back * (0.4 + 0.6 * rr)) + hemi(n, G.ambientSky, G.ambientGround) * 1.2 + lampLight(p, n) * 1.3);
  c += alb * G.sunColor * pow(1.0 - abs(dot(normalize(in.n), V)), 2.0) * 0.35 * max(dot(-V, G.sunDir) + 0.6, 0.0);   // moon rim
  c = mix(c, c * 0.65, smoothstep(14.0, 50.0, dist));
  return vec4f(fogged(c, p), 1.0);
}

// ---- lanterns ----
struct LO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) fa: vec2f, @location(4) lp: vec3f,
};
fn lanternScale(c: vec3f, s: f32) -> f32 {
  let d = distance(vec3f(c.x, c.y * MIR, c.z), G.camPos);
  return s * max(1.0, d * G.tanHalfFov * G.invResolution.y * 11.0);   // never thinner than ~3 px
}
// One vertex stage for every lit paper thing. Sky lanterns: lathe uv. Floaters (toro, boats, lotus) carry
// uv.x = material (2 wood, 3 paper, 4 petal, 5 pad) and uv.y = how much candle light the vertex gets.
@vertex fn vsLant(@location(0) p0: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> LO {
  let L = lanternAt(i0, i1);
  var sc = i1.z;
  var p = p0;
  if (i1.x < 1.5) { sc = lanternScale(L.p, i1.z); }
  else { sc *= max(1.0, distance(vec3f(L.p.x, L.p.y * MIR, L.p.z), G.camPos) * G.tanHalfFov * G.invResolution.y * 5.0); }
  if (uv.x > 3.5 && uv.x < 4.5) {   // lotus petals fold into a bud when nobody is near
    let cl = 1.0 - smoothstep(0.3, 1.0, L.a / max(i0.z, 0.01));
    let r = length(p.xz);
    p = vec3f(p.x * mix(1.0, 0.4, cl), p.y + cl * r * 0.62, p.z * mix(1.0, 0.4, cl));
  }
  let R = rotY(i0.w * 30.0 + G.time * 0.05 * (i0.w - 0.5));
  var o: LO;
  o.w = L.p + R * (p * sc); o.n = R * n; o.uv = uv; o.fa = vec2f(L.fl, L.a); o.lp = p0;
  o.pos = clipW(o.w);
  if (L.a < 0.004) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsLant(in: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let v = in.uv.y;
  let V = normalize(eye() - in.w);
  var n = normalize(in.n);
  let ndv = abs(dot(n, V));
  if (in.uv.x > 1.5) {
    if (dot(n, V) < 0.0) { n = -n; }
    let m = in.uv.x; let lit = in.fa.x * in.fa.y;
    if (m > 5.5) { return vec4f(fogged(vec3f(1.0, 0.8, 0.42) * 5.5 * lit, in.w), 1.0); }           // candle flame
    var alb = vec3f(0.09, 0.065, 0.045);
    var em = WARM * 0.12 * v;
    var sp = vec3f(0.0);
    if (m > 4.5) {
      // lily pad: flush with the water (never in the mirror), a notch, radial veins, moon sheen
      if (MIR < 0.0) { discard; }
      let r = length(in.lp.xz) / 1.4; let ang = atan2(in.lp.z, in.lp.x);
      if (r > 0.955 + 0.04 * sin(ang * 5.0 + in.lp.x) || (abs(ang) < 0.1 && r > 0.16)) { discard; }
      let vn = sin(ang * 9.0);
      let vein = smoothstep(0.92, 1.0, abs(cos(ang * 9.0))) * smoothstep(0.08, 0.4, r) + smoothstep(0.05, 0.0, abs(r - 0.93));
      n = normalize(vec3f(-sin(ang), 0.0, cos(ang)) * vn * 0.09 * smoothstep(0.05, 0.5, r) + vec3f(0.0, 1.0, 0.0));
      alb = mix(vec3f(0.022, 0.07, 0.04), vec3f(0.05, 0.13, 0.07), vein) * (0.8 + 0.2 * snoise2(in.lp.xz * 4.0));
      em = WARM * 0.22 * exp(-r * r * 7.0);
      sp = G.sunColor * specBlinn(n, G.sunDir, V, 50.0) * 0.14 + fresnelSchlick(max(dot(n, V), 0.0), 0.05) * G.ambientSky * 0.9;
    } else if (m > 3.5) {
      // petals: pale tips, a warm translucent heart lit by the candle, moonlight through the edges
      alb = mix(vec3f(0.8, 0.42, 0.58), vec3f(0.95, 0.87, 0.86), smoothstep(0.0, 0.8, v));
      em = mix(vec3f(1.0, 0.32, 0.25), vec3f(1.0, 0.66, 0.34), v) * pow(v, 1.6) * 1.5;
      sp = alb * G.sunColor * (pow(max(dot(-V, G.sunDir), 0.0), 2.0) * 0.6 + pow(1.0 - ndv, 2.0) * 0.25);
    } else if (m > 2.5) {
      alb = vec3f(0.66, 0.64, 0.6);
      em = mix(vec3f(1.0, 0.33, 0.07), vec3f(1.0, 0.62, 0.22), v) * (0.06 + 2.4 * v * v) * (0.8 + 0.2 * ndv);
    }
    let c = alb * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.3) * 1.2 + hemi(n, G.ambientSky, G.ambientGround)) + sp + em * lit;
    return vec4f(fogged(c, in.w), 1.0);
  }
  let front = ff == (MIR > 0.0);
  let hot = exp(-v * 3.4);
  var e = mix(vec3f(1.0, 0.3, 0.055), vec3f(1.0, 0.62, 0.22), hot) * (0.7 + 6.0 * hot * hot * hot);
  e *= 0.78 + 0.22 * ndv;
  e *= 1.0 - 0.07 * pow(abs(sin(in.uv.x * TAU * 3.0)), 10.0);          // paper seams
  e *= 1.0 - 0.3 * smoothstep(0.86, 0.97, v);                          // top cap
  if (!front) { e = vec3f(1.0, 0.7, 0.3) * (2.0 + 7.0 * hot); }         // the lit inside, seen from below
  return vec4f(fogged(e * in.fa.x * in.fa.y, in.w), 1.0);
}

struct GO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) a: f32 };
// Halo sprites. A light at the waterline gets one disc: the part above the water is an upright billboard, the part
// below is slid along the view rays onto the water surface (same pixels, no depth cut, no seam). Lights high above the
// water keep a plain billboard here and a mirrored one in the reflection pass; `wl` blends between the two.
struct HGO { @builtin(position) pos: vec4f, @location(0) @interpolate(linear) c: vec2f, @location(1) @interpolate(flat) a: f32 };
@vertex fn vsGlow(@builtin(vertex_index) vi: u32, @location(0) i0: vec4f, @location(1) i1: vec4f) -> HGO {
  let L = lanternAt(i0, i1);
  var sc = select(i1.z, lanternScale(L.p, i1.z), i1.x < 1.5);
  if (i1.x > 1.5 && i1.x < 2.5) { sc *= 0.6; }
  let r = 1.9 * sc; let hc = L.p.y + 0.3 * sc;
  let wl = smoothstep(0.7, 0.2, L.p.y);
  let q = QC[vi % 6u];
  let low = vi >= 6u;
  let rt = normalize(vec3f(G.camRight.x, 0.0, G.camRight.z));
  var o: HGO;
  o.a = L.fl * L.a * (1.0 - fogAmount(distance(vec3f(L.p.x, hc, L.p.z), G.camPos)));
  var kill = L.a < 0.004;
  if (MIR < 0.0) {
    o.c = q; o.a *= 1.0 - wl; kill = kill || low;
    o.pos = G.viewProj * vec4f(vec3f(L.p.x, -hc, L.p.z) + rt * q.x * r + vec3f(0.0, q.y * r, 0.0), 1.0);
  } else {
    let ylo = clamp(-hc / r, -1.0, 1.0);
    let qy = select(mix(ylo, 1.0, q.y * 0.5 + 0.5), mix(-1.0, ylo, q.y * 0.5 + 0.5), low);
    var p = vec3f(L.p.x, hc, L.p.z) + rt * q.x * r + vec3f(0.0, qy * r, 0.0);
    if (low) {
      let yw = 0.012 + distance(p, G.camPos) * 0.0015;
      p = G.camPos + (p - G.camPos) * ((G.camPos.y - yw) / max(G.camPos.y - p.y, 1e-3));
      o.a *= wl; kill = kill || ylo < -0.999 || wl < 0.004;
    }
    o.c = vec2f(q.x, qy);
    o.pos = G.viewProj * vec4f(p, 1.0);
  }
  if (kill) { o.pos = vec4f(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsGlow(in: HGO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let g = (exp(-r2 * 3.6) * 0.15 + exp(-r2 * 16.0) * 0.34) * smoothstep(1.0, 0.45, r2);
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
  o.a = L.fl * L.a / (1.0 + L.p.y * L.p.y * 0.12) * (1.0 - fogAmount(d)) * smoothstep(0.5, 3.0, L.p.y);
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
  let c = alb * (G.sunColor * (0.5 + 0.9 * in.uv.y + 1.6 * back) + G.ambientSky * (0.4 + 0.6 * in.uv.y) + BIO * 0.06);
  return vec4f(fogged(c, in.w), 1.0);
}
