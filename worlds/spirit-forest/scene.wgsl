// Opaque surfaces: terrain, all instanced meshes (trees, willows, ferns, fungi, logs, rocks, tufts), sky dome.
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) at: vec4f, @location(4) @interpolate(flat) b: vec4f, @location(5) dl: vec3f,
};
// soft round dots in a grid: x = mask, y = cell random
fn dotGlow(q: vec2f, dens: f32, rmax: f32) -> vec2f {
  let c = floor(q); let h = hash2i(vec2i(c)); let r = u2f(h);
  let o = vec2f(u2f(pcg(h)), u2f(pcg(h + 7u))) * 0.6 + 0.2;
  let d = length(q - c - o);
  let rad = rmax * (0.35 + 0.65 * u2f(pcg(h + 3u))) * step(1.0 - dens, r);
  let fw = fwidth(q.x) * 1.2;
  let m = smoothstep(rad + fw, -fw * 0.2, d);
  return vec2f(m * m * (0.35 + 0.65 * u2f(pcg(h + 5u))) * smoothstep(0.9, 0.25, fw / max(rad, 1e-3)), u2f(pcg(h + 11u)));
}
const MOSS_A = vec3f(0.01, 0.028, 0.008);
const MOSS_B = vec3f(0.055, 0.125, 0.022);

// ---------------- terrain ----------------
@vertex fn vsTerrain(v: VI) -> VO {
  var o: VO; o.w = v.p; o.n = v.n; o.uv = v.uv; o.at = v.at; o.b = vec4f(0.0); o.dl = dynL(v.p, v.n);
  o.pos = G.viewProj * vec4f(v.p, 1.0); return o;
}
@fragment fn fsTerrain(in: VO) -> @location(0) vec4f {
  let p = in.w; let n0 = normalize(in.n);
  let dist = distance(p, G.camPos);
  let near = 1.0 - smoothstep(10.0, 34.0, dist);
  let fine = 1.0 - smoothstep(3.0, 11.0, dist);
  let N1 = nz(p.xz * 0.019); let N2 = nz(p.xz * 0.11 + 0.3); let N3 = nz(rot2(0.3) * p.xz * 0.43); let N4 = nz(rot2(-0.4) * p.xz * 1.9 + 0.11);
  var N5 = vec4f(0.5); if (dist < 14.0) { N5 = nz(rot2(0.6) * p.xz * 5.3 + 0.37); }
  let fine2 = 1.0 - smoothstep(1.5, 5.5, dist);
  var N6 = vec4f(0.5); if (dist < 5.5) { N6 = nz(rot2(-0.9) * p.xz * 14.0 + 0.71); }
  var bump = (N3.xy - 0.5) * 0.55 + (N4.xy - 0.5) * 0.6 * near + (N5.xy - 0.5) * 0.85 * fine + (N6.xy - 0.5) * 0.9 * fine2;
  // moss carpet with lighter cushions
  let cush = smoothstep(0.42, 0.7, N3.x * 0.7 + N4.z * 0.35);
  var alb = mix(MOSS_A, MOSS_B, N2.y * 0.55 + N3.z * 0.3 + 0.3 * cush) * (0.6 + 0.8 * N4.x) * (1.0 + (N5.z - 0.5) * 1.1 * fine) * (1.0 + (N6.z - 0.5) * 1.2 * fine2);
  alb = mix(alb, vec3f(0.1, 0.16, 0.03) * (0.5 + N4.w), cush * smoothstep(0.55, 0.8, N1.x) * 0.5);
  var mossA = 1.0;
  // leaf litter under the trees
  let lit = smoothstep(0.5, 0.68, N2.x * 0.6 + N3.w * 0.45 + 0.25 * N1.z);
  let leaf = smoothstep(0.5, 0.62, N4.y * 0.5 + N5.x * 0.55 * fine + 0.25 * (1.0 - fine));
  alb = mix(alb, mix(vec3f(0.022, 0.016, 0.009), vec3f(0.06, 0.04, 0.016), N5.w * fine + 0.3) * (0.5 + N4.w), lit * leaf * 0.7);
  mossA -= lit * leaf * 0.8;
  // meandering earth path: damp soil, pebbles, moss creeping in from the edges
  let pd = in.at.x + (N2.x - 0.5) * 1.0 + (N3.w - 0.5) * 0.35;
  let pm = 1.0 - smoothstep(0.55, 1.35, pd);
  var sheen = 0.0;
  if (pm > 0.0) {
    alb = mix(alb, mix(vec3f(0.022, 0.016, 0.011), vec3f(0.075, 0.055, 0.036), N3.y) * (0.55 + 0.8 * N4.y) * (1.0 + (N5.w - 0.5) * 0.8 * fine), pm * 0.92);
    let pb = dotGlow(p.xz * 3.1 + 7.0, 0.3, 0.3);
    alb = mix(alb, mix(vec3f(0.05, 0.055, 0.06), vec3f(0.15, 0.16, 0.16), pb.y) * (0.5 + 0.6 * pb.x), pb.x * pm * near);
    bump += (vec2f(pb.y, fract(pb.y * 7.3)) - 0.5) * pb.x * pm * 0.8;
    sheen = pm * (0.3 + 0.7 * smoothstep(0.45, 0.7, N3.z));
    mossA *= 1.0 - pm;
  }
  let lm = lmAt(p.xz);
  let lsum = lm.r + lm.g + lm.b;
  let pl = pulse(p);
  var e = vec3f(0.0);
  // foxfire: specks of glowing moss, denser where fungi grow
  if (dist < 30.0) {
    let dg = dotGlow(p.xz * 4.9, 0.012 + 0.22 * smoothstep(0.1, 1.0, lsum), 0.16);
    e += mix(MINT, vec3f(0.5, 1.0, 0.3), dg.y) * dg.x * 0.5 * mossA * (1.0 - smoothstep(14.0, 30.0, dist));
  }
  // door: moss ring and stones at the threshold, contact shadow, warm light from the open doorway
  let dv = p.xz - U.door.xz;
  let dd = length(dv);
  if (dd < 4.5) {
    let ring = exp(-(dd - 1.7) * (dd - 1.7) / 0.81);
    let db = dotGlow(p.xz * 9.0 + 3.0, ring * 0.3, 0.3);
    e += mix(MINT, WILLOW, db.y) * db.x * 0.6;
    alb = mix(alb, MOSS_B * (0.7 + N4.z), ring * 0.6 + (1.0 - smoothstep(0.3, 1.0, dd)) * 0.5);
    alb *= 1.0 - 0.6 * exp(-(dv.x * dv.x * 0.9 + dv.y * dv.y * 9.0));
    e += vec3f(1.0, 0.72, 0.45) * exp(-dd * dd * 0.5) * 0.09 * U.door.w / pl;
  }
  e *= pl;
  let n = normalize(n0 + vec3f(bump.x, 0.0, bump.y) * 0.6);
  let gl = lm.rgb * pl * U.misc.w;
  let ao = 1.0 - 0.6 * min(lm.a, 1.0);
  var c = shade(alb, n, p, ao, gl, in.dl) + alb * gl * 1.2;
  let V = normalize(G.camPos - p);
  let fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  let mv = moonVis(p) * U.misc.x;
  // velvet rim on moss, wet glint on the path
  c += (G.sunColor * mv + G.ambientSky + gl * 0.5 + in.dl * 0.5) * alb * fr * (1.2 * mossA + 0.6) * ao;
  c += (G.sunColor * mv * pow(max(dot(reflect(-V, n), G.sunDir), 0.0), 20.0) * 0.6 + (gl + in.dl) * fr * 0.25) * sheen;
  return vec4f(c + glow(e), 1.0);
}

// ---------------- instanced meshes ----------------
@vertex fn vsObj(v: VII) -> VO {
  let R = rotY(v.b.x);
  let m = v.at.x; let t = G.time; let sd = v.b.z * 17.0;
  var lp = v.p * v.a.w;
  var n = v.n;
  var o: VO; o.uv = v.uv; o.at = v.at; o.b = v.b;
  if (v.b.w > 0.5 && v.b.w < 1.5) {
    // trees: per-instance girth and lean; crowns sway a little
    let gi = 0.8 + 0.5 * fract(v.b.z * 11.3);
    lp *= vec3f(gi, 1.0, gi);
    lp += vec3f(fract(v.b.z * 5.7) - 0.5, 0.0, fract(v.b.z * 8.9) - 0.5) * lp.y * lp.y * 0.02;
    let k = smoothstep(3.0, 12.0, lp.y);
    lp += vec3f(sin(t * 0.31 + sd + lp.y * 0.07), 0.0, cos(t * 0.23 + sd * 0.7 + lp.x * 0.1)) * 0.07 * k;
    if (m > 0.5 && m < 2.5) { lp += vec3f(sin(t * 0.7 + lp.x * 0.8 + sd), sin(t * 0.9 + lp.z + sd) * 0.5, cos(t * 0.6 + lp.z * 0.7)) * 0.035 * (0.4 + v.at.y); }
  } else if (v.b.w > 1.5) {
    lp *= nearFade(v.a.xyz);
    if ((m > 3.5 && m < 4.5) || m > 7.5) { lp += vec3f(sin(t * 0.8 + sd + lp.y * 2.0), 0.0, cos(t * 0.63 + sd * 1.3)) * 0.03 * v.at.y * v.a.w; }
  }
  var w = v.a.xyz + R * lp;
  n = R * n;
  if (m > 2.5 && m < 3.5) {
    // willow strand: sways from its anchor, stays at least ~2 px wide, faces the camera
    let s = v.at.y; let len = v.at.z; let ph = v.at.w * 40.0 + sd;
    let amp = s * s * len * 0.055;
    w += vec3f(sin(t * 0.43 + ph) + 0.4 * sin(t * 1.1 + ph * 1.7 + s * 3.0), 0.0, cos(t * 0.37 + ph * 1.3) + 0.4 * cos(t * 0.9 + ph + s * 4.0)) * amp;
    let tv = G.camPos - w; let d = length(tv);
    let hw = max(0.03, d * 0.0013);
    w += normalize(cross(vec3f(0.0, 1.0, 0.0), tv)) * v.uv.x * hw;
    n = tv / d;
    o.at.w = 0.03 / hw;
    o.b.y = v.at.w;
  }
  o.w = w; o.n = n; o.dl = dynL(w, n);
  o.pos = G.viewProj * vec4f(w, 1.0);
  return o;
}
@fragment fn fsObj(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let p = in.w; let m = in.at.x;
  var n = normalize(in.n); if (!ff) { n = -n; }
  let dist = distance(p, G.camPos);
  if (m > 0.5 && m < 1.5) {
    // laurel foliage card: small leaves scattered in two layers, filled in with distance (tested before any lighting)
    let x = in.uv.x; let v = in.uv.y; let rnd = in.at.w;
    let ov = max(v * 2.0 - 1.0, -0.7);
    let outl = 1.0 - (x * x + ov * ov * 0.9) + 0.3 * sin(x * 8.0 + rnd * 20.0) * sin(v * 10.0 + rnd * 7.0);
    if (outl < 0.0) { discard; }
    let fill = smoothstep(6.0, 16.0, dist);
    var lf = -9.0;
    for (var i = 0; i < 2; i++) {
      let q = vec2f(x * 4.6 + rnd * 7.0, v * 9.0 + rnd * 3.0) + f32(i) * vec2f(0.5, 0.37);
      let hh = hash2i(vec2i(floor(q)) + vec2i(i * 57));
      let fr = rot2((u2f(hh) - 0.5) * 2.6) * (fract(q) - 0.5);
      if (u2f(pcg(hh)) < 0.88) { lf = max(lf, 1.0 - (fr.x * fr.x / 0.04 + fr.y * fr.y / 0.21)); }
    }
    if (lf < -fill * 10.0) { discard; }
    let la = mix(vec3f(0.006, 0.02, 0.008), vec3f(0.028, 0.065, 0.018), rnd * 0.5 + 0.5 * clamp(lf, 0.0, 1.0));
    let mvl = moonVis(p) * U.misc.x;
    let lit = hemi(n, G.ambientSky, G.ambientGround) * 0.7 + G.sunColor * mvl * (wrapDiffuse(n, G.sunDir, 0.45) + 2.0 * max(dot(-n, G.sunDir), 0.0)) + in.dl;
    return vec4f(la * lit, 1.0);
  }
  let V = normalize(G.camPos - p);
  let ndv = max(dot(n, V), 0.0);
  let pl = pulse(p);
  let gl = glowAt(p);
  let mv = moonVis(p) * U.misc.x;
  var alb = vec3f(0.0); var e = vec3f(0.0); var ao = 1.0; var extra = vec3f(0.0);
  if (m < 0.5 || (m > 6.5 && m < 7.5)) {
    // bark / stone with thick moss
    var q = in.uv; var mossB = in.at.z; var h = in.at.y;
    if (m > 6.0) { q = p.xz * 0.8 + p.yy * vec2f(0.5, 0.3); mossB = 0.3; h = 1.0; }
    let N = nz(q * vec2f(0.31, 0.085));
    let Nb = nz(q * vec2f(1.15, 0.37));
    var Nf = vec4f(0.5); if (dist < 28.0) { Nf = nz(q * vec2f(3.3, 1.4)); }
    let fis = nz(vec2f(q.x * 0.75 + N.y * 0.3, q.y * 0.045)).z;
    var Ng = vec4f(0.5); if (dist < 6.0) { Ng = nz(q * vec2f(11.0, 6.0)); }
    let fg = 1.0 - smoothstep(2.0, 6.0, dist);
    alb = mix(vec3f(0.02, 0.016, 0.013), vec3f(0.1, 0.08, 0.06), N.x) * (0.4 + 1.2 * fis) * (0.75 + 0.5 * Nf.x);
    if (m > 6.0) { alb = mix(vec3f(0.035, 0.04, 0.045), vec3f(0.12, 0.13, 0.13), N.x) * (0.6 + 0.8 * Nb.x); }
    let mm = smoothstep(0.1, 0.5, n.y * 0.55 + N.z * 0.9 + Nb.w * 0.35 - 0.7 + mossB + 0.35 * exp(-max(h, 0.0) * 0.5));
    let mc = mix(MOSS_A, MOSS_B, Nb.y * 0.7 + 0.5 * Nf.z) * (0.7 + 0.6 * Nf.w);
    alb = mix(alb, mc, mm) * (1.0 + (Ng.x - 0.5) * 1.1 * fg);
    let nf = 1.0 - smoothstep(16.0, 50.0, dist);
    n = normalize(n + ((Nb.xyz - 0.5) * 0.8 + (Nf.yzw - 0.5) * 0.6 + (Ng.yzw - 0.5) * 0.7 * fg + (vec3f(fis, N.x, N.w) - 0.5) * 0.6 * (1.0 - mm)) * nf);
    ao = 0.4 + 0.6 * smoothstep(-0.3, 2.2, h);
    // foxfire freckles low on trunks, roots and logs
    if (dist < 30.0 && h < 2.5) {
      let ls = dotGlow(q * vec2f(5.0, 4.0), 0.07 + 0.25 * smoothstep(0.15, 0.8, gl.g), 0.2).x * smoothstep(2.5, 0.3, h);
      e = MINT * ls * ls * 0.55;
    }
    let rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    extra = (G.sunColor * mv * (0.6 + max(dot(n, G.sunDir) + 0.3, 0.0)) + G.ambientSky + gl * 0.5 + in.dl * 0.5) * rim * mix(alb, mc * 2.5, mm) * ao;
  } else if (m < 2.5) {
    // moss beard: ragged hanging strands
    let x = in.uv.x; let s = in.uv.y;
    let st = nz(vec2f(x * 0.35 + in.at.w * 7.0, in.at.w * 3.0));
    let lenK = 0.35 + 0.65 * st.x;
    if (s > lenK * (1.0 - 0.5 * abs(x)) || (abs(fract(x * 2.5 + st.y) - 0.5) > 0.36 && s > 0.18 && dist < 22.0)) { discard; }
    alb = mix(MOSS_A, MOSS_B * 1.3, s / lenK * 0.8 + 0.2 * st.z);
    extra = alb * (G.sunColor * mv + G.ambientSky) * 1.2;
    ao = 0.8;
  } else if (m < 3.5) {
    // glowing willow strand: beads of light travelling down, brighter toward the tips
    let s = in.at.y; let h = in.uv.y; let x = in.uv.x;
    let trav = pow(0.5 + 0.5 * sin(h * 0.9 - G.time * 0.5 + in.b.y * 37.0), 8.0);
    let bq = h * 2.3 + in.b.y * 9.0;
    let tw = 0.5 + 0.5 * sin(G.time * 0.6 + hash11(floor(bq) + in.b.y * 71.0) * 40.0);
    let bead = smoothstep(0.45, 0.1, abs(fract(bq) - 0.5)) * smoothstep(60.0, 20.0, dist) + 0.3 * smoothstep(20.0, 60.0, dist);
    // a chain of narrow leaves up close, a plain soft thread far away
    let lw = mix(0.2 + 0.8 * pow(abs(sin(bq * PI * 1.5 + 0.7 * sign(x))), 1.5), 1.0, smoothstep(0.9, 0.4, in.at.w));
    if (abs(x) > lw) { discard; }
    let prof = 1.0 - x * x * 0.7 / (lw * lw);
    let wk = pow(in.at.w, 0.7) * mix(0.55, 1.0, smoothstep(0.9, 0.4, in.at.w));
    alb = vec3f(0.01, 0.03, 0.02);
    e = mix(vec3f(0.12, 1.0, 0.7), vec3f(0.55, 1.0, 0.45), s * s) * (0.07 + 0.1 * s + bead * (0.05 + 0.22 * tw * tw) * (0.35 + 0.65 * s) + 0.45 * trav * (0.3 + 0.7 * s)) * prof * wk * (0.75 + 0.25 * pl);
    ao = 0.6;
  } else if (m < 4.5) {
    // fern frond: pinnae along the rachis
    let x = in.uv.x; let ax = abs(x); let v = in.uv.y;
    let pin = abs(fract(v * 15.0 - ax * 1.2) - 0.5);
    let fill = smoothstep(9.0, 24.0, dist);
    if (pin > 0.36 * (1.0 - 0.8 * ax * ax) + fill && ax > 0.06) { discard; }
    alb = mix(vec3f(0.016, 0.05, 0.014), vec3f(0.06, 0.15, 0.03), v * 0.6 + in.at.w * 0.4) * (1.0 - 0.3 * smoothstep(0.05, 0.3, pin) * (1.0 - fill)) * (0.55 + 0.45 * smoothstep(0.0, 0.3, v));
    extra = alb * (G.sunColor * mv * (1.5 * max(dot(-n, G.sunDir), 0.0) + 0.8 * pow(1.0 - ndv, 2.0)) + (gl + in.dl) * 0.6);
    ao = 0.55 + 0.45 * v;
  } else if (m < 5.5) {
    // mycena: translucent stem, bell cap glowing from the gills outward
    let w = in.at.z; let k = 0.6 + 0.8 * in.at.w;
    if (in.at.y < 0.5) {
      alb = vec3f(0.06, 0.1, 0.07);
      e = MINT * (0.03 + 0.3 * w * w * w) * k;
    } else {
      let gill = 0.5 + 0.5 * cos(in.uv.x * TAU * 16.0);
      alb = vec3f(0.02, 0.06, 0.04);
      // translucent cap: dim crown, light gathering toward the rim; hot gills underneath
      e = mix(vec3f(0.0, 0.45, 0.25), vec3f(0.1, 1.0, 0.5), w) * (0.25 + 0.75 * w * w + 0.8 * smoothstep(0.86, 1.0, w) + 0.3 * pow(1.0 - ndv, 2.0)) * k;
      if (ff) { e = vec3f(0.2, 1.0, 0.55) * (1.0 + 1.2 * gill) * k; }
    }
    e *= 0.5 * (0.8 + 0.3 * pl);
    e *= 1.0 + 1.6 * max(e.g - 0.5, 0.0);
    return vec4f(shade(alb, n, p, 1.0, gl, in.dl) + e, 1.0);
  } else if (m < 6.5) {
    // shelf fungus: banded top, glowing pore surface and rim
    let w = in.at.z;
    let band = 0.5 + 0.5 * sin(w * 22.0 + in.at.w * 20.0);
    alb = mix(vec3f(0.05, 0.03, 0.018), vec3f(0.2, 0.12, 0.05), band) * (0.4 + 0.6 * w);
    e = MINT * (smoothstep(0.8, 1.0, w) * 0.2 + (1.0 - in.at.y) * (0.1 + 0.3 * w)) * (0.7 + 0.3 * pl);
    alb = mix(alb, MOSS_B, (1.0 - smoothstep(0.1, 0.5, w)) * in.at.y * 0.7);
  } else {
    // grass / moss tuft
    alb = mix(MOSS_A * 2.0, vec3f(0.1, 0.2, 0.04), in.at.y) * (0.7 + 0.6 * in.at.w);
    extra = alb * (G.sunColor * mv + G.ambientSky) * 0.8 * in.at.y;
    ao = 0.7 + 0.3 * in.at.y;
  }
  ao *= 1.0 - 0.35 * min(lmAt(p.xz).a, 1.0) * exp(-max(p.y - terrH(p.xz), 0.0) * 0.8);
  return vec4f(shade(alb, n, p, ao, gl, in.dl) + extra + glow(e), 1.0);
}

// ---------------- sky: night haze seen through a closed canopy with a bright gap near the hidden moon ----------------
struct SO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SO { var o: SO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fsSky(in: SO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  let h = rd.y;
  let m = max(dot(rd, G.sunDir), 0.0);
  var c = mix(G.fogColor * 1.5, vec3f(0.012, 0.03, 0.05), smoothstep(-0.05, 0.45, h));
  c += vec3f(0.4, 0.62, 0.75) * (pow(m, 5.0) * 0.1 + pow(m, 30.0) * 0.35 + pow(m, 300.0) * 1.2) * U.misc.x;
  if (h > -0.05) {
    let q = rd.xz / (max(h, 0.0) + 0.35);
    let st = dotGlow(q * 60.0, 0.1, 0.1);
    c += vec3f(0.7, 0.85, 1.0) * st.x * 0.35 * smoothstep(0.1, 0.4, h);
    let a = nz(q * 0.23); let b = nz(q * 1.3 + 0.3); let d = nz(q * 5.1);
    let lf = a.x * 0.55 + b.y * 0.35 + d.z * 0.14 + 0.32 * smoothstep(0.0, 0.5, h) - 0.6 * pow(m, 7.0);
    let can = smoothstep(0.4, 0.5, lf) * smoothstep(-0.05, 0.1, h);
    let edge = smoothstep(0.6, 0.42, lf);
    c = mix(c, vec3f(0.004, 0.011, 0.008) * (0.6 + 0.8 * d.x) + G.sunColor * (0.05 + 0.5 * pow(m, 4.0)) * edge * (0.4 + d.y), can);
  }
  return vec4f(c, 1.0);
}
