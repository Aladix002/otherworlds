// Opaque jungle surfaces. Prepended with common.wgsl and the PATH constant from world.js.
struct VI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f };
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) at: vec4f, @location(4) @interpolate(flat) b: vec4f, @location(5) e: vec3f,
};
fn outV(w: vec3f, n: vec3f, uv: vec2f, at: vec4f, b: vec4f) -> VO {
  var o: VO; o.w = w; o.n = n; o.uv = uv; o.at = at; o.b = b; o.e = vec3f(0.0); o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
fn pathDist(p: vec2f) -> f32 {
  var d = segD(p, SPA, SPB) + 0.25;
  for (var i = 0u; i < NPATH - 1u; i++) { d = min(d, segD(p, PATH[i], PATH[i + 1u])); }
  return d;
}
fn dotGlow(q: vec2f, dens: f32, rmax: f32) -> vec2f {   // x = glow mask, y = cell random
  let c = floor(q); let h = hash2i(vec2i(c)); let r = u2f(h);
  let o = vec2f(u2f(pcg(h)), u2f(pcg(h + 7u))) * 0.6 + 0.2;
  let d = length(q - c - o);
  let rad = rmax * (0.35 + 0.65 * u2f(pcg(h + 3u))) * step(1.0 - dens, r);
  let fw = fwidth(q.x) * 1.2;
  let m = smoothstep(rad + fw, -fw * 0.2, d);
  return vec2f(m * m * (0.35 + 0.65 * u2f(pcg(h + 5u))) * smoothstep(0.9, 0.25, fw / max(rad, 1e-3)), u2f(pcg(h + 11u)));
}

// ---------------- terrain ----------------
@vertex fn vsTerrain(v: VI) -> VO { return outV(v.p, v.n, v.uv, v.at, vec4f(0.0)); }
@fragment fn fsTerrain(in: VO) -> @location(0) vec4f {
  let p = in.w; let n0 = normalize(in.n);
  let dist = distance(p, G.camPos);
  let near = 1.0 - smoothstep(12.0, 38.0, dist);
  let N1 = nz(p.xz * 0.021); let N2 = nz(p.xz * 0.13 + 0.3); let N3 = nz(p.xz * 0.47); let N4 = nz(p.xz * 1.7 + 0.11);
  let slope = 1.0 - n0.y;
  let rockM = smoothstep(0.38, 0.62, slope + (N2.z - 0.5) * 0.3);
  let soil = 1.0 - rockM;
  let fine = 1.0 - smoothstep(3.0, 10.0, dist);
  var N5 = vec4f(0.5); if (dist < 16.0) { N5 = nz(p.xz * 7.3 + 0.37); }
  var bump = (N3.xy - 0.5) * 0.6 + (N4.xy - 0.5) * 0.55 * near + (N5.xy - 0.5) * 0.7 * fine;
  // moss carpet, leaf litter, bare earth, rock
  let mossM = smoothstep(0.35, 0.65, N2.y * 0.6 + N3.z * 0.5);
  var alb = mix(hex(0x16261d), hex(0x2c4a2a), N1.x) * (0.7 + 0.5 * N3.x);
  alb = mix(alb, hex(0x35602e) * (0.55 + 0.9 * N4.z), mossM * 0.65);
  alb = mix(alb, hex(0x3a2a22), smoothstep(0.6, 0.75, N3.y) * 0.6);
  alb *= 1.0 + (N5.z - 0.5) * 0.9 * fine;
  // leaf litter and clover flecks
  alb = mix(alb, hex(0x4a3020) * (0.5 + N5.w), smoothstep(0.62, 0.7, N4.w * 0.6 + N5.x * 0.5) * 0.4 * fine);
  alb = mix(alb, hex(0x4a8a3a), smoothstep(0.66, 0.72, N4.y * 0.5 + N5.y * 0.6) * mossM * 0.6 * fine);
  alb = mix(alb, hex(0x2a1f2c), smoothstep(0.55, 0.75, N1.y + N2.x * 0.2) * 0.5);
  alb = mix(alb, mix(hex(0x221e2a), hex(0x3a3642), N2.w) * (0.65 + 0.7 * N4.w), rockM);
  if (dist < 36.0) {
    let pb = dotGlow(p.xz * 2.3 + 7.0, 0.32, 0.3);
    alb = mix(alb, mix(hex(0x35323e), hex(0x5a5866), pb.y) * (0.6 + 0.6 * pb.x), pb.x * near * soil);
  }
  let wet = 1.0 - smoothstep(-0.1, 0.6, p.y);
  alb *= 1.0 - 0.45 * wet;
  let pl = pulse(p);
  let lm = textureSampleLevel(lmap, smp, wuv(p.xz), 0.0);
  let lsum = lm.x + lm.y + lm.z + lm.w;
  let hue = mix(U.slot[0].rgb, slotCol(lm) / max(lsum, 0.05), smoothstep(0.04, 0.25, lsum));
  var e = vec3f(0.0);
  var sheen = 0.0;
  // path: stepping stones in worn earth, luminous moss in the joints and beaded along the borders
  let pd = pathDist(p.xz);
  if (pd < 2.6) {
    let wob = (N2.x - 0.5) * 0.7 + (N3.w - 0.5) * 0.25;
    let pm = (1.0 - smoothstep(0.8, 1.3, pd + wob)) * soil;
    alb = mix(alb, hex(0x2a2226) * (0.55 + 0.8 * N4.y), pm * 0.85);
    let vo = voronoi2(p.xz * 1.9 + (N3.xy - 0.5) * 0.9);
    let edge = vo.y - vo.x + (N4.z - 0.5) * 0.08;
    let st = smoothstep(0.08, 0.2, edge) * pm * step(0.3, fract(vo.z * 7.13));
    alb = mix(alb, mix(hex(0x3c3a4c), hex(0x625e74), fract(vo.z * 13.7)) * (0.7 + 0.6 * N4.x), st);
    bump = mix(bump, (vec2f(fract(vo.z * 3.1), fract(vo.z * 5.3)) - 0.5) * 0.4 + (N4.xy - 0.5) * 0.2, st);
    sheen = st;
    alb *= 1.0 + st * (smoothstep(0.3, 0.12, edge) * 0.45 - smoothstep(0.14, 0.08, edge) * 0.5);   // bevel: light shoulder, dark seam
    let joint = smoothstep(0.15, 0.02, edge) * pm;
    e += mix(U.slot[0].rgb, U.slot[3].rgb, 0.2 + 0.4 * N1.z) * joint * (0.015 + 0.22 * smoothstep(0.45, 0.8, N2.z) * (0.4 + N4.w));
    let band = exp(-pow((pd + wob - 1.4) / 0.3, 2.0)) * soil;
    let bd = dotGlow(p.xz * 8.0, band * (0.2 + 0.7 * N2.w), 0.3);
    e += mix(U.slot[3].rgb, U.slot[0].rgb, bd.y) * (bd.x * 0.7 + band * N3.z * 0.03);
    alb = mix(alb, hex(0x35602e) * (0.5 + N4.z), band * 0.6);
  }
  // glowing moss: sparse bright specks, soft carpets where plants glow
  let flat = soil * smoothstep(0.8, 0.93, n0.y) * smoothstep(0.05, 0.35, p.y);
  if (dist < 32.0) {
    let dg = dotGlow(p.xz * 5.3, 0.03 + 0.2 * smoothstep(0.15, 1.2, lsum), 0.17);
    e += mix(hue, slotOf(dg.y * 4.0), 0.2) * dg.x * 0.55 * flat * (1.0 - smoothstep(14.0, 32.0, dist));
  }
  e += hue * smoothstep(0.5, 0.8, N3.z * 0.6 + N2.z * 0.5) * mossM * (0.25 + 0.75 * N4.z) * 0.05 * flat * (0.3 + lsum);
  // moss ring at the foot of the door
  let dd = distance(p.xz, U.door.xz);
  if (dd < 4.0) {
    let dr = exp(-pow((dd - 1.5) / 0.8, 2.0));
    let db = dotGlow(p.xz * 11.0 + 3.0, dr * 0.35, 0.3);
    e += mix(U.slot[0].rgb, U.slot[2].rgb, db.y) * (db.x * 0.7 + dr * N3.z * 0.04);
  }
  // lichen streaks on the cliff
  // wet glowing moss on the cliff, brightest near the fall
  let wfd = exp(-distance(p.xz, vec2f(U.wf.x, U.wf.z)) * 0.12);
  e += mix(U.slot[0].rgb, U.slot[3].rgb, N3.x) * smoothstep(0.5, 0.85, N2.y * 0.6 + N3.z * 0.5) * (0.4 + N4.z) * rockM * smoothstep(0.5, 3.0, p.y) * (0.03 + 0.14 * wfd);
  // door: soft contact shadow, warm light spilling from the open portal
  alb *= 1.0 - 0.55 * exp(-dd * dd * 1.6);
  e += vec3f(1.0, 0.72, 0.45) * exp(-dd * dd * 0.55) * 0.085 * U.door.w / max(pl, 0.3);
  e *= pl * (1.0 + 0.6 * touch(p));
  let n = normalize(n0 + vec3f(bump.x, 0.0, bump.y) * (0.55 + 0.5 * rockM));
  let gl = slotCol(lm) * pl * exp(-max(p.y - terrH(p.xz), 0.0) * 0.22) * U.misc.w;
  var c = shadeG(alb, n, gl, 1.0 - 0.3 * rockM) + alb * gl * 1.5;
  let V = normalize(G.camPos - p);
  c += (gl * 0.5 + G.sunColor * 0.5) * pow(1.0 - max(dot(n, V), 0.0), 4.0) * (0.05 + 0.3 * sheen + 0.2 * wet + 0.35 * rockM);
  c += G.sunColor * pow(max(dot(reflect(-V, n), G.sunDir), 0.0), 24.0) * (0.5 * sheen + 0.25 * rockM);
  return vec4f(c + glow(e), 1.0);
}

// ---------------- trees ----------------
struct VII { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f, @location(4) a: vec4f, @location(5) b: vec4f };
@vertex fn vsTree(v: VII) -> VO {
  let R = rotY(v.b.x);
  let gi = 0.75 + 0.6 * fract(v.b.z * 11.3);
  var lp = v.p * v.a.w * vec3f(gi, 1.0, gi);
  lp += vec3f(fract(v.b.z * 5.7) - 0.5, 0.0, fract(v.b.z * 8.9) - 0.5) * lp.y * lp.y * 0.012;
  let t = G.time; let sd = v.b.z * 17.0;
  if (v.at.x > 0.5 && v.at.x < 1.5) {
    let k = smoothstep(8.0, 30.0, lp.y);
    lp += vec3f(sin(t * 0.37 + sd + lp.y * 0.05), sin(t * 0.53 + sd * 1.3) * 0.4, cos(t * 0.29 + sd * 0.7)) * 0.22 * k;
  } else if (v.at.x > 1.5) {
    let h = v.at.z;
    lp += vec3f(sin(t * 0.41 + sd + v.at.w * 6.0 + h * 0.2), 0.0, cos(t * 0.33 + sd * 1.1 + h * 0.15)) * 0.03 * h;
    // keep thin vines at least a few pixels wide in the distance
    if (v.at.x < 2.5) { lp += v.n * distance(v.a.xyz + R * lp, G.camPos) * 0.0007; }
  }
  return outV(v.a.xyz + R * lp, R * v.n, v.uv, v.at, v.b);
}
@fragment fn fsTree(in: VO) -> @location(0) vec4f {
  let p = in.w; var n = faceN(normalize(in.n), p);
  let m = in.at.x; let sl = slotOf(in.b.y); let pl = pulse(p);
  var alb: vec3f; var e = vec3f(0.0); var ao = 1.0; var extra = vec3f(0.0);
  let dist = distance(p, G.camPos);
  let gl = glowAt(p);
  let V = normalize(G.camPos - p);
  if (m < 0.5) {
    let q = in.uv;
    let N = nz(q * vec2f(0.35, 0.06));
    let Nb = nz(q * vec2f(1.3, 0.25));
    let fis = nz(vec2f(q.x * 0.8 + N.y * 0.25, q.y * 0.03)).z;      // vertical bark fissures
    var Nf = vec4f(0.5); if (dist < 45.0) { Nf = nz(q * vec2f(3.7, 1.1)); }
    alb = mix(hex(0x1e1620), hex(0x42322c), N.x) * (0.45 + 1.1 * fis) * (0.8 + 0.4 * Nb.y) * (0.75 + 0.5 * Nf.x);
    alb = mix(alb, hex(0x1f3a26) * (0.7 + 0.6 * Nb.w), smoothstep(0.25, 0.7, n.y + N.z * 0.4) * 0.8);
    let nf = 1.0 - smoothstep(20.0, 60.0, dist);
    n = normalize(n + ((Nb.xyz - 0.5) * 0.7 + (Nf.yzw - 0.5) * 0.5 + (vec3f(fis, N.x, N.w) - 0.5) * 0.5) * nf);
    // spiral vein network flowing up the trunk and along the buttress fins: bright core, soft halo
    let Nw = nz(q * vec2f(0.11, 0.025));
    let u1 = (q.x + q.y * 0.42) / 1.7 + (Nw.y - 0.5) * 0.9 + (N.y - 0.5) * 0.12;
    let u2 = (q.x - q.y * 0.3) / 2.3 + (Nw.w - 0.5) * 1.1;
    let w1 = abs(fract(u1) - 0.5); let w2 = abs(fract(u2) - 0.5);
    let f1 = fwidth(u1) * 0.8 + 1e-4; let f2 = fwidth(u2) * 0.8 + 1e-4;
    let k1 = smoothstep(0.35, 0.1, f1); let k2 = smoothstep(0.35, 0.1, f2);
    let core = max(smoothstep(0.016 + f1, 0.004 - f1, w1) * k1, smoothstep(0.012 + f2, 0.003 - f2, w2) * 0.7 * k2);
    let halo = max(exp(-w1 * w1 * 500.0) * k1, exp(-w2 * w2 * 700.0) * 0.7 * k2);
    let hy = p.y - in.b.w;
    let wave = pow(0.5 + 0.5 * sin(hy * 0.55 - G.time * 1.05 + in.b.z * 9.0), 3.0);
    let hm = 1.0 - smoothstep(3.0, 14.0, hy);
    e = sl * (core * (0.5 + 1.7 * wave) + halo * (0.1 + 0.3 * wave)) * hm;
    e += (sl * 0.5 + 0.5) * core * wave * hm * 0.35;
    if (dist < 40.0) {
      let ls = dotGlow(q * vec2f(4.5, 3.3), 0.16, 0.22).x * hm;
      e += slotOf(in.b.y + 1.0) * ls * ls * 0.4;
    }
    ao = 0.5 + 0.5 * smoothstep(-0.2, 2.5, hy);
    // moonlit / glow-lit rim
    let rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    extra = (G.sunColor * (0.5 + 1.2 * max(dot(n, G.sunDir) + 0.3, 0.0)) * U.misc.x + gl * 0.4) * rim * 0.5;
  } else if (m < 1.5 || m > 2.5) {
    let x = in.uv.x; let ax = abs(x); let vv = in.uv.y; let rnd = in.at.w;
    alb = mix(hex(0x0b2420), hex(0x1f5236), vv * 0.6 + rnd * 0.4);
    let kind = fract(in.b.z * 7.3 + rnd * 3.37);
    let glowy = smoothstep(0.52, 0.6, kind);
    let side = smoothstep(0.14, 0.0, 0.5 - abs(fract(vv * 7.0 - ax * 1.8) - 0.5)) * (1.0 - 0.7 * ax);
    let df = 1.0 - smoothstep(25.0, 60.0, dist);
    e = sl * ((exp(-ax * ax * 120.0) * 0.8 + exp(-ax * ax * 10.0) * 0.16 + side * 0.28) * (1.0 - 0.65 * vv) * glowy + smoothstep(0.55, 1.0, ax) * 0.1 * step(kind, 0.22)) * df;
    if (m > 2.5) { e = slotOf(in.b.y + 2.0) * (0.08 + 0.4 * exp(-ax * ax * 30.0)) * (1.0 - 0.5 * vv) * (1.0 - smoothstep(8.0, 20.0, dist)); }
    // moonlight through the leaf, plus a faint tint of the tree's own glow
    let back = max(dot(-n, G.sunDir), 0.0);
    extra = alb * (G.sunColor * (2.2 * back + 0.5 * pow(1.0 - abs(dot(n, V)), 2.0)) * U.misc.x + sl * 0.05);
  } else {
    alb = hex(0x1a2a1c);
    let h = in.at.z;
    let trav = pow(0.5 + 0.5 * sin(h * 0.8 - G.time * 0.7 + in.at.w * 20.0), 8.0);
    let bead = smoothstep(0.4, 0.0, abs(fract(h / 0.8) - 0.5)) * (1.0 - smoothstep(10.0, 30.0, dist));
    let df = 1.0 - 0.85 * smoothstep(15.0, 70.0, dist);
    e = slotOf(in.b.y + 2.0) * (0.05 + 0.1 * bead + 1.1 * trav) * df * (0.35 + 0.65 * max(dot(n, V), 0.0));
  }
  e *= pl * (1.0 + 0.8 * touch(p));
  return vec4f(shadeG(alb, n, gl, ao) + extra + glow(e), 1.0);
}

// ---------------- generic props: 0 rock, 1 candelabra shrub, 2 mushrooms, 3 rosette, 4 lantern, 5 reed, 6 tuft ----------------
@vertex fn vsProp(v: VII) -> VO {
  let R = rotY(v.b.x);
  var lp = v.p * v.a.w;
  if (v.b.w > 0.5) { lp *= nearFade(v.a.xyz); }
  if (v.b.w > 0.5 && (v.b.w < 1.5 || v.b.w > 2.5)) {
    let sd = v.b.z * 29.0; let t = G.time;
    let k = lp.y * lp.y / max(v.a.w, 0.3) * 0.07 * (1.0 + 0.8 * touch(v.a.xyz));
    lp += vec3f(sin(t * 0.43 + sd) + 0.5 * sin(t * 0.71 + sd * 1.7 + lp.x * 3.0), 0.0, cos(t * 0.37 + sd * 1.3) + 0.5 * cos(t * 0.63 + sd + lp.z * 3.0)) * k;
  }
  var o = outV(v.a.xyz + R * lp, R * v.n, v.uv, v.at, v.b);
  o.e = vec3f(touch(v.a.xyz), 0.0, 0.0);
  return o;
}
@fragment fn fsProp(in: VO) -> @location(0) vec4f {
  let p = in.w; var n = faceN(normalize(in.n), p);
  let ty = in.b.w; let sl = slotOf(in.b.y); let pl = pulse(p) * (1.0 + 0.9 * in.e.x);
  let V = normalize(G.camPos - p); let ndv = max(dot(n, V), 0.0);
  let part = in.at.x; let g = in.at.y;
  var alb: vec3f; var e = vec3f(0.0);
  if (ty < 0.5) {
    let N = nz(p.xz * 0.2 + p.y * 0.13); let Nb = nz(p.xz * 0.9 + p.y * 0.7);
    alb = mix(hex(0x221e28), hex(0x3e3a46), N.x) * (0.7 + 0.6 * Nb.w);
    n = normalize(n + (Nb.xyz - 0.5) * 0.6);
    alb = mix(alb, hex(0x1d3a22) * (0.7 + 0.6 * Nb.y), smoothstep(0.35, 0.8, n.y + N.y * 0.3));
    let lq = select(vec2f(p.x + p.z, p.y), p.xz, abs(n.y) > 0.7) * 3.0;
    let lich = dotGlow(lq, 0.22, 0.18);
    e = slotOf(in.b.y + lich.y * 1.2) * lich.x * 0.6 * smoothstep(0.2, 0.6, n.y + 0.4);
    e += (glowAt(p) * 0.4 + G.sunColor * 0.5) * pow(1.0 - ndv, 3.0) * 0.12 * max(n.y + 0.4, 0.0);
  } else if (ty < 1.5) {
    if (part > 0.5) {
      // bulb: bright core seen through a dimmer skin
      alb = sl * 0.2;
      e = sl * (0.2 + 0.5 * ndv * ndv) + vec3f(1.0, 0.95, 0.9) * pow(ndv, 6.0) * 0.12;
    } else {
      let sp = dotGlow(in.uv * vec2f(5.0, 9.0) + g * 37.0, 0.45, 0.3).x;
      alb = mix(hex(0x1a1420), hex(0x3a2c4a), g) * (0.7 + 0.6 * nz(in.uv * vec2f(0.7, 1.9) + g * 5.0).x);
      e = sl * (0.02 + 0.4 * pow(g, 2.5) + sp * 0.35 * g + 0.5 * pow(1.0 - ndv, 2.5) * (0.2 + g));
    }
  } else if (ty < 2.5) {
    if (part < 0.5) {
      alb = mix(hex(0x2a2430), hex(0x80788c), smoothstep(0.0, 0.5, g));
      e = sl * (0.03 + 0.5 * g * g * g);
    } else if (part < 1.5) {
      // cap: darker crown with pale spots, glowing translucent rim
      let sp = dotGlow(in.uv * vec2f(9.0, 3.0) + in.b.z * 7.0, 0.5, 0.3).x * smoothstep(0.15, 0.6, g);
      alb = mix(sl * 0.35 + 0.05, hex(0x3a2c48), smoothstep(0.1, 0.9, g)) + sp * 0.3;
      e = sl * (0.16 + 0.55 * pow(1.0 - g, 2.5) + 0.3 * pow(1.0 - ndv, 2.0) + sp * 0.4) * (0.6 + 0.4 * ndv);
    } else {
      let gill = 0.55 + 0.45 * cos(in.uv.x * 6.2832 * 20.0);
      alb = sl * 0.3;
      e = (sl * 1.0 + 0.1) * gill * (0.4 + 0.6 * g);
    }
  } else if (ty < 3.5) {
    // rosette leaf: glowing midrib and side veins, brighter toward the heart of the plant
    let x = in.at.z; let ax = abs(x);
    alb = mix(hex(0x0c2a24), hex(0x1f5a3a), g * 0.7 + in.at.w * 0.3);
    let side = smoothstep(0.16, 0.0, 0.5 - abs(fract(g * 6.0 - ax * 1.4) - 0.5)) * (1.0 - 0.6 * ax);
    let ret = nz(vec2f(x * 1.3, g * 2.6) + in.at.w * 9.0);
    let fine = smoothstep(0.1, 0.0, abs(ret.x - 0.5)) * 0.5 + smoothstep(0.06, 0.0, abs(ret.y - 0.5)) * 0.3;   // net of small veins
    e = sl * ((exp(-ax * ax * 150.0) * 1.0 + exp(-ax * ax * 9.0) * 0.14 + side * 0.3 + fine * 0.12) * (1.0 - 0.7 * g) + smoothstep(0.75, 1.0, ax) * 0.12);
    alb *= (0.7 + 0.6 * ret.z) * (1.0 + 1.5 * max(dot(-n, G.sunDir), 0.0));
    e += alb * sl * (0.35 * (1.0 - g) + 0.5 * pow(1.0 - ndv, 2.0));
  } else if (ty < 4.5) {
    if (part > 0.5) {
      // lantern pod: warm core glowing through ribbed skin, brightest at the open mouth
      let rib = 0.75 + 0.25 * cos(in.uv.x * 6.2832 * 7.0);
      let warm = mix(sl, vec3f(1.0, 0.8, 0.5), 0.45);
      alb = warm * 0.25;
      e = warm * rib * (0.12 + 0.85 * g * g) * (0.4 + 0.6 * ndv) + vec3f(1.0, 0.85, 0.6) * pow(g, 6.0) * 0.3;
    } else { alb = mix(hex(0x18241e), hex(0x2c4a3a), g); e = sl * (0.02 + 0.35 * g * g); }
  } else if (ty < 5.5) {
    alb = mix(hex(0x10261c), hex(0x2a5a38), g);
    e = sl * 0.5 * pow(g, 3.0);
    if (part > 0.5) { alb = sl * 0.2; e = (sl + 0.1) * (0.25 + 0.45 * ndv * ndv); }
  } else {
    alb = mix(hex(0x12301e), hex(0x2f6a36), g);
    e = sl * 0.45 * g * g;
    if (part > 0.5) { alb = sl * 0.3; e = mix(vec3f(1.0, 0.95, 0.8), sl, smoothstep(0.1, 0.6, g)) * (0.8 - 0.5 * g); }
    e *= 1.0 - smoothstep(9.0, 22.0, distance(p, G.camPos));
  }
  return vec4f(shadeJ(alb, n, p, 1.0) + glow(e * pl), 1.0);
}

// ---------------- fern fronds (shape built in the vertex shader) ----------------
fn rachis(s: f32, L: f32, phi0: f32, bend: f32, curl: f32) -> vec3f {
  var q = vec2f(0.0); let ds = s * L / 8.0;
  for (var i = 0; i < 8; i++) {
    let si = (f32(i) + 0.5) / 8.0 * s;
    let a = phi0 - bend * si - curl * 11.0 * si * si * si;
    q += vec2f(cos(a), sin(a)) * ds;
  }
  return vec3f(q, phi0 - bend * s - curl * 11.0 * s * s * s);
}
@vertex fn vsFern(v: VII) -> VO {
  let base = v.a.xyz; let L = v.a.w * nearFade(v.a.xyz);
  let tch = touch(base);
  let sd = v.b.z * 31.0;
  let curl = v.b.w * (1.0 - 0.85 * tch);
  let breathe = 0.05 * sin(G.time * 0.31 + sd) + 0.03 * sin(G.time * 0.53 + sd * 1.7);
  let phi0 = 1.05 + 0.25 * fract(v.b.z * 5.1) + breathe + 0.22 * tch * (1.0 - v.b.w);
  let bend = 1.5 + 0.6 * fract(v.b.z * 3.7);
  let s = v.uv.x;
  let r = rachis(s, L, phi0, bend, curl);
  let ca = cos(r.z); let sa = sin(r.z);
  let fw = vec3f(sin(-v.b.x), 0.0, -cos(v.b.x));   // forward from yaw
  let sideA = vec3f(-fw.z, 0.0, fw.x);
  let T = fw * ca + vec3f(0.0, sa, 0.0);
  let Nn = -fw * sa + vec3f(0.0, ca, 0.0);
  var wp = base + fw * r.x + vec3f(0.0, r.y, 0.0);
  var nrm = Nn;
  if (v.uv.y == 0.0) {
    wp += sideA * v.at.y * 0.012 * L;
  } else {
    let q = v.at.x; let side = v.uv.y;
    let ll = 0.3 * L * pow(sin(3.14159 * min(s * 1.05, 1.0)), 0.6) * (1.0 - 0.75 * v.b.w * (1.0 - 0.85 * tch)) ;
    let droop = 0.35 + 0.3 * s;
    let dir = normalize(sideA * side + T * 0.55 - Nn * droop * q);
    let lw = ll * 0.17 * sin(3.14159 * (0.15 + 0.85 * q)) * (1.0 + distance(base, G.camPos) * 0.06);
    wp += dir * ll * q + T * lw * v.at.y;
    nrm = normalize(cross(dir, T)) * side;
  }
  var o = outV(wp, nrm, v.uv, v.at, v.b);
  o.e = vec3f(tch, s, 0.0);
  return o;
}
@fragment fn fsFern(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let s = in.e.y;
  var alb = mix(hex(0x0d2a1e), hex(0x2a5a2c), s * 0.6 + in.at.x * 0.3);
  var e = vec3f(0.0);
  let sl = slotOf(in.b.y);
  let df = 1.0 / (1.0 + distance(p, G.camPos) * 0.035);
  if (in.uv.y == 0.0) { e = (sl * 1.2 + 0.15) * (1.0 - 0.6 * abs(in.at.y)) * (0.5 + 0.5 * s); }
  else {
    let ay = abs(in.at.y); let q = in.at.x;
    let mid = exp(-ay * ay * 14.0);
    e = sl * (mid * (1.0 - 0.8 * q) * 0.8 + smoothstep(0.7, 1.0, q) * 0.55 + 0.04) * (0.35 + 0.65 * s) * df;
  }
  e *= pulse(p) * (0.8 + 0.7 * in.e.x);
  alb *= 1.0 + 1.2 * max(dot(-n, G.sunDir), 0.0);
  alb += sl * 0.03;
  return vec4f(shadeJ(alb, n, p, 0.8 + 0.2 * s) + glow(e), 1.0);
}

// ---------------- fan plants ----------------
@vertex fn vsFan(v: VII) -> VO {
  let base = v.a.xyz; let S = v.a.w * nearFade(v.a.xyz); let tch = touch(base);
  let sd = v.b.z * 23.0;
  let R = rotY(v.b.x);
  let hs = (0.4 + 0.4 * fract(v.b.z * 6.3)) * S;
  let nr = 4.0 + floor(fract(v.b.z * 13.7) * 5.0);
  var lp: vec3f; var ln: vec3f;
  if (v.at.x > 0.5) {
    let open = 0.45 + 0.3 * fract(v.b.z * 17.9) + 0.1 * sin(G.time * 0.23 + sd) + 0.07 * sin(G.time * 0.41 + sd * 0.6) + 0.28 * tch;
    let th = v.uv.x * open * 1.45;
    let r = v.uv.y * S * 0.75;
    let pleat = cos(v.uv.x * 2.0 * nr * 3.14159);
    var q = vec3f(sin(th) * r, cos(th) * r, pleat * 0.045 * r - (fract(v.b.z * 27.1) - 0.3) * 0.6 * r * r / S);
    let tilt = -0.15 - 0.6 * fract(v.b.z * 9.1) + 0.12 * sin(G.time * 0.19 + sd);
    q = rotX(tilt) * q;
    lp = q + vec3f(0.0, hs, 0.0);
    ln = rotX(tilt) * vec3f(0.0, 0.0, 1.0);
  } else {
    let a = v.uv.x * 6.2832;
    lp = vec3f(cos(a) * 0.018 * S, v.uv.y * hs, sin(a) * 0.018 * S);
    ln = vec3f(cos(a), 0.0, sin(a));
  }
  var o = outV(base + R * lp, R * ln, v.uv, v.at, v.b);
  o.e = vec3f(tch, nr, 0.0);
  return o;
}
@fragment fn fsFan(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let sl = slotOf(in.b.y);
  var alb = hex(0x1a2e2a); var e = vec3f(0.0);
  if (in.at.x > 0.5) {
    let r = in.uv.y;
    let fx = in.uv.x * in.e.y * 0.5;
    let fold = abs(fract(fx) - 0.5);
    let fw = fwidth(fx);
    let far = smoothstep(0.04, 0.2, fw);
    let rib = mix((smoothstep(0.05 + fw, 0.0, fold) + exp(-fold * fold * 60.0) * 0.3), 0.3, far) * smoothstep(0.02, 0.2, r);
    let rim = smoothstep(0.8, 1.0, r);
    alb = mix(hex(0x17302c), hex(0x2c2a48), r);
    e = sl * (rib * (0.9 - 0.6 * r) + rim * rim * 0.8 + 0.05 * (1.0 - r)) + alb * sl * 0.3;
    alb *= 1.0 + 1.2 * max(dot(-n, G.sunDir), 0.0);
  } else { e = sl * 0.1; }
  e *= pulse(p) * (0.8 + 0.7 * in.e.x);
  return vec4f(shadeJ(alb, n, p, 1.0) + glow(e), 1.0);
}

// ---------------- spiral stalks ----------------
@vertex fn vsSpiral(v: VII) -> VO {
  let base = v.a.xyz; let Hh = v.a.w * nearFade(v.a.xyz); let tch = touch(base);
  let sd = v.b.z * 41.0;
  let coil = v.b.w * (1.0 - 0.55 * tch) * (1.0 + 0.06 * sin(G.time * 0.27 + sd));
  let s = v.uv.y;
  var q = vec2f(0.0); let ds = s * Hh / 10.0;
  for (var i = 0; i < 10; i++) {
    let si = (f32(i) + 0.5) / 10.0 * s;
    let a = 1.5708 - 0.25 * si - coil * 14.0 * pow(si, 4.0);
    q += vec2f(cos(a), sin(a)) * ds;
  }
  let a = 1.5708 - 0.25 * s - coil * 14.0 * pow(s, 4.0);
  let fw = vec3f(sin(-v.b.x), 0.0, -cos(v.b.x));
  let sideA = vec3f(-fw.z, 0.0, fw.x);
  let T = fw * cos(a) + vec3f(0.0, sin(a), 0.0);
  let Nn = -fw * sin(a) + vec3f(0.0, cos(a), 0.0);
  let ang = v.uv.x * 6.2832;
  let rr = 0.03 * Hh * (1.0 - 0.7 * s) + 0.004;
  let nrm = Nn * cos(ang) + sideA * sin(ang);
  let sway = vec3f(sin(G.time * 0.4 + sd), 0.0, cos(G.time * 0.31 + sd)) * 0.05 * s * Hh;
  var o = outV(base + fw * q.x + vec3f(0.0, q.y, 0.0) + nrm * rr + sway * s, nrm, v.uv, v.at, v.b);
  o.e = vec3f(tch, s, 0.0);
  return o;
}
@fragment fn fsSpiral(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let s = in.e.y; let sl = slotOf(in.b.y);
  let ring = pow(0.5 + 0.5 * sin(s * 11.0 - G.time * 0.7 + in.b.z * 19.0), 3.0);
  let ndv = max(dot(n, normalize(G.camPos - p)), 0.0);
  let alb = mix(hex(0x1c2a24), hex(0x2a1c36), s);
  let e = sl * ((0.1 + ring * 0.6 * smoothstep(0.1, 0.6, s)) * (0.4 + 0.6 * ndv) + 0.25 * pow(1.0 - ndv, 2.0) + smoothstep(0.8, 1.0, s) * 1.0) * pulse(p) * (0.8 + 0.7 * in.e.x);
  return vec4f(shadeJ(alb, n, p, 1.0) + glow(e), 1.0);
}

// ---------------- lily pads ----------------
@vertex fn vsPad(v: VII) -> VO {
  let sd = v.b.z * 13.0;
  let R = rotY(v.b.x);
  var lp = v.p * vec3f(v.a.w, 1.0, v.a.w);
  let tilt = vec2f(sin(G.time * 0.37 + sd), cos(G.time * 0.29 + sd * 1.3)) * 0.008;
  lp.y += lp.x * tilt.x + lp.z * tilt.y + 0.012 * sin(G.time * 0.5 + sd);
  return outV(v.a.xyz + R * lp, R * v.n, v.uv, v.at, v.b);
}
@fragment fn fsPad(in: VO) -> @location(0) vec4f {
  let p = in.w; var n = normalize(in.n);
  let up = dot(n, G.camPos - p) > 0.0;
  n = faceN(n, p);
  let r = in.at.y; let a = in.at.z;
  let sl = slotOf(in.b.y);
  // radial veins that fork half way out, fine concentric cross veins; all fade toward the edge
  let nv = 9.0 + floor(fract(in.b.z * 7.7) * 9.0);
  let d1 = abs(fract(a * nv / 6.2832) - 0.5) * 6.2832 / nv * r;
  let d2 = abs(fract(a * nv / 3.1416 + 0.5) - 0.5) * 3.1416 / nv * r;
  let fw = fwidth(r) + 1e-4;
  let k = smoothstep(0.03, 0.008, fw);
  let v1 = (smoothstep(0.012 + fw, 0.002, d1) + exp(-d1 * d1 * 900.0) * 0.3) * smoothstep(0.02, 0.1, r);
  let v2 = smoothstep(0.008 + fw, 0.001, d2) * smoothstep(0.4, 0.6, r) * 0.6;
  let cr = abs(fract(r * 9.0 + 0.05 * sin(a * 14.0)) - 0.5);
  let v3 = smoothstep(0.06 + fw * 9.0, 0.0, cr) * 0.14 * k;
  let fade = mix(1.0, 0.1, smoothstep(0.1, 0.93, r));
  let wave = 0.55 + 0.45 * sin(r * 6.0 - G.time * 0.6 + in.b.z * 20.0);
  let N = nz(p.xz * 0.9);
  var alb = mix(hex(0x0f3626), hex(0x2a5a34), smoothstep(0.1, 0.9, r)) * (0.75 + 0.5 * N.x);
  let rimM = smoothstep(0.96, 0.985, r);
  alb = mix(alb, mix(hex(0x4a1832), hex(0x1c3a2c), fract(in.b.z * 3.9)) * (0.5 + 0.5 * N.y), rimM);
  var e = mix(sl, slotOf(in.b.y + 1.0), fract(in.b.z * 5.3) * 0.6) * ((v1 + v2 * step(0.4, fract(in.b.z * 9.1)) + v3) * fade * wave * 0.9 + exp(-r * r * 90.0) * 0.5) * (1.0 - rimM);
  e += slotOf(in.b.y + 1.0) * smoothstep(0.99, 1.0, r) * 0.12;
  if (!up || n.y < 0.2) { e *= 0.25; }
  e *= pulse(p) * (1.0 + 0.8 * touch(p));
  let V = normalize(G.camPos - p);
  let F = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  let spec = pow(max(dot(reflect(-V, n), G.sunDir), 0.0), 60.0) * 0.3;
  return vec4f(shadeJ(alb, n, p, 1.0) + glow(e) + G.sunColor * spec + (glowAt(p) * 0.3 + G.ambientSky * 0.6) * F * (1.0 - rimM), 1.0);
}

// ---------------- lotus (petals shaped here: closed bud <-> open bloom) ----------------
fn bloomOf(b: vec4f) -> f32 {
  let ph = G.time / b.w + b.z * 6.2832;
  let c = 0.5 + 0.5 * sin(ph * 6.2832) + 0.06 * sin(G.time * 0.37 + b.z * 9.0);
  return smoothstep(0.15, 0.85, c);
}
@vertex fn vsLotus(v: VII) -> VO {
  let bl = bloomOf(v.b);
  let ring = v.at.x;
  var lp = v.p; var ln = v.n;
  if (ring < 3.5) {
    let x = v.uv.x; let vv = v.uv.y; let len = v.at.z;
    let wig = 0.05 * sin(G.time * 0.6 + v.at.w * 6.0);
    let a0 = mix(0.5 - 0.06 * ring, 1.42 - 0.34 * ring, bl) + wig;
    let bb = mix(-0.95 + 0.06 * ring, -0.5 - 0.1 * ring, bl) + (v.at.w - 0.5) * 0.15;
    let th = a0 + bb * vv;
    let cr = (cos(a0) - cos(th)) / bb * len + 0.04 * len;
    let cy = (sin(th) - sin(a0)) / bb * len;
    let wv = pow(sin(3.14159 * pow(vv, 0.55)), 0.7);
    let wid = 0.3 * len * wv * mix(0.75, 1.0, bl);
    let cup = 0.11 * len * wv;
    let rh = vec3f(sin(v.at.y), 0.0, cos(v.at.y)); let th2 = vec3f(rh.z, 0.0, -rh.x);
    let N = rh * cos(th) - vec3f(0.0, sin(th), 0.0);
    lp = rh * cr + vec3f(0.0, cy + 0.02, 0.0) + th2 * x * wid - N * cup * x * x;
    ln = normalize(-N * max(wid, 0.02) - th2 * 2.0 * cup * x);
  } else if (ring > 4.5) {
    lp = vec3f(lp.x * mix(0.4, 1.0, bl), lp.y, lp.z * mix(0.4, 1.0, bl));
  }
  let R = rotY(v.b.x);
  var o = outV(v.a.xyz + R * (lp * v.a.w) + vec3f(0.0, 0.01 * sin(G.time * 0.45 + v.b.z * 9.0), 0.0), R * ln, v.uv, v.at, v.b);
  o.e = vec3f(bl, 0.0, 0.0);
  return o;
}
@fragment fn fsLotus(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let bl = in.e.x; let vv = in.uv.y; let ring = in.at.x;
  let V = normalize(G.camPos - p); let ndv = max(dot(n, V), 0.0);
  var alb: vec3f; var e: vec3f;
  if (ring > 4.5) {
    alb = vec3f(0.5, 0.4, 0.1);
    e = vec3f(1.7, 1.15, 0.35) * (0.3 + 0.9 * vv) * (0.5 + bl);
  } else if (ring > 3.5) {
    alb = hex(0x8a9a30);
    e = vec3f(1.2, 1.0, 0.3) * (0.3 + 0.8 * bl) * (0.5 + 0.5 * ndv);
  } else {
    // warm heart -> pink -> magenta tip; light bleeds through the thin petal edges
    let x = in.uv.x;
    var col = mix(vec3f(1.0, 0.78, 0.5), vec3f(1.0, 0.5, 0.74), smoothstep(0.0, 0.55, vv));
    col = mix(col, vec3f(0.95, 0.22, 0.62), smoothstep(0.6, 1.0, vv));
    col = mix(col, slotOf(in.b.y), 0.12);
    alb = col * 0.45;
    let vein = 0.5 + 0.5 * cos(x * 16.0);
    let heart = pow(1.0 - vv, 2.0) * (0.3 + 0.9 * bl);
    e = col * (0.14 + 0.8 * heart + 0.1 * vein * (1.0 - vv) + 0.3 * pow(1.0 - ndv, 2.0) + 0.12 * smoothstep(0.75, 1.0, vv)) * (1.0 - 0.07 * ring);
  }
  e *= (0.8 + 0.4 * pulse(p)) * (1.0 + 0.7 * touch(p));
  return vec4f(shadeJ(alb, n, p, 1.0) + e, 1.0);
}

// ---------------- koi (under water) ----------------
@vertex fn vsFish(v: VII) -> VO {
  let t = G.time; let b = v.b;
  let f = fishPos(v.a, b);
  var lp = v.p * 1.3 * (0.8 + 0.4 * fract(b.z * 3.3));
  let zt = 1.0 - v.at.y;
  lp.x += sin(t * 2.6 + lp.z * 5.0 + b.z * 9.0) * 0.06 * zt * zt;
  // refraction-style shimmer from the rippling surface above
  lp += vec3f(sin(t * 1.9 + f.x * 5.0 + lp.z * 9.0), 0.0, cos(t * 1.6 + f.z * 5.0 + lp.x * 9.0)) * 0.012;
  if (v.at.x > 0.5 && v.at.y > 0.6) { lp.y += sin(t * 2.6 - 2.0 + b.z * 9.0) * 0.04 * v.at.z; }
  let yaw = f.w;
  let R = mat3x3f(cos(yaw), 0.0, -sin(yaw), 0.0, 1.0, 0.0, sin(yaw), 0.0, cos(yaw));
  return outV(f.xyz + R * lp, R * v.n, v.uv, v.at, b);
}
@fragment fn fsFish(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let z = in.at.y;
  let sl = slotOf(in.b.y);
  let V = normalize(G.camPos - p); let ndv = max(dot(n, V), 0.0);
  // koi pattern: soft orange / white patches over a dim body, luminous along the back
  let N = nz(vec2f(in.uv.x * 0.5 + in.b.z * 3.0, in.uv.y * 0.9 + in.b.z));
  let ptc = smoothstep(0.44, 0.54, N.x + (nz(in.uv * vec2f(2.0, 3.5) + in.b.z).z - 0.5) * 0.25);
  let orange = vec3f(1.6, 0.48, 0.1); let white = vec3f(1.25, 1.15, 1.05);
  var e = mix(orange, white, smoothstep(0.4, 0.65, N.y)) * (0.08 + 0.6 * ptc) * (0.5 + 0.5 * max(n.y, 0.0));
  e += sl * 0.2 * (1.0 - ptc) + vec3f(0.9, 0.95, 1.0) * pow(max(n.y, 0.0), 6.0) * 0.25;   // sheen along the back
  e *= 0.45 + 0.55 * ndv;
  e = mix(e, e * vec3f(1.0, 0.55, 0.35), smoothstep(0.8, 1.0, z) * 0.6);   // darker head
  if (in.at.x > 0.5) {
    // fins: translucent veils fading to the edge
    let fv = in.at.z; let fu = abs(in.at.w);
    let ray = 0.7 + 0.3 * cos(in.at.w * 14.0);
    e = mix(orange, white, 0.2 + 0.6 * fv) * (0.85 - 0.6 * fv) * (1.0 - 0.4 * fu * fu) * ray * 0.45;
  }
  if (in.at.x > 1.5) { e = vec3f(0.01) + vec3f(1.0, 0.9, 0.6) * pow(1.0 - ndv, 3.0) * 0.5; }
  // tint by the water above
  let d = max(-p.y, 0.0);
  e = e * exp(-d * vec3f(1.9, 0.7, 0.6)) + vec3f(0.0, 0.03, 0.035) * (1.0 - exp(-d * 2.0));
  return vec4f(e * (0.85 + 0.3 * pulse(p)), 1.0);
}

// ---------------- frogs (state from U.frog) ----------------
@vertex fn vsFrog(v: VI, @builtin(instance_index) ii: u32) -> VO {
  let f = U.frog[ii]; let fb = U.frogB[ii];
  let R = rotY(f.w);
  var lp = v.p;
  let croak = pow(0.5 + 0.5 * sin(G.time * 1.1 + f32(ii) * 2.3), 2.0) * (0.5 + 0.5 * sin(G.time * 0.13 + f32(ii)));
  if (v.at.y > 3.5) { let c = vec3f(0.0, 0.05, 0.085); lp = c + (lp - c) * (0.75 + 0.7 * croak); }
  lp *= 2.3;
  lp.y *= 1.0 - 0.25 * fb.y;
  if (v.at.y > 1.5 && v.at.y < 2.5) { lp += vec3f(0.0, -0.05, -0.12) * fb.y * step(lp.z, 0.0); }
  return outV(f.xyz + R * lp, R * v.n, v.uv, v.at, vec4f(f.w, croak, f32(ii), 0.0));
}
@fragment fn fsFrog(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let tag = in.at.y;
  let V = normalize(G.camPos - p); let ndv = max(dot(n, V), 0.0);
  var alb = mix(hex(0x0f2a1a), hex(0x2a6a34), smoothstep(-0.2, 0.9, n.y));
  let sp = dotGlow(in.uv * vec2f(10.0, 6.0), 0.55, 0.3);
  let lime = mix(U.slot[3].rgb, U.slot[0].rgb, 0.35);
  var e = lime * sp.x * 0.7 * step(tag, 1.5) * smoothstep(0.0, 0.5, n.y) + lime * 0.06;
  if (tag > 3.5) { alb = lime * 0.3; e = (lime * 1.2 + 0.2) * (0.25 + 1.3 * in.b.y) * (0.4 + 0.6 * ndv); }
  else if (tag > 2.5) { alb = vec3f(0.25, 0.22, 0.08); e = vec3f(0.5, 0.42, 0.14) * (0.3 + 0.7 * ndv * ndv) * step(0.5, ndv + in.uv.y * 0.6); }
  else if (tag < 1.5) { let st = smoothstep(0.25, 0.1, abs(fract(in.uv.x * 2.0 + 0.25) - 0.5)) * smoothstep(0.35, 0.7, in.uv.y); alb = mix(alb, hex(0x7ac05a), st * 0.7); e += lime * st * 0.25; }
  e += (glowAt(p) * 0.4 + G.sunColor * 0.5) * pow(1.0 - ndv, 3.0) * 0.5;
  return vec4f(shadeJ(alb, n, p, 1.0) + e * (0.8 + 0.3 * pulse(p)), 1.0);
}

// ---------------- petals drifting on the water ----------------
struct PO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vsPetal(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = cs[vi];
  let h = hash1u(ii * 7u + 1u); let h2 = hash1u(ii * 13u + 5u); let h3 = hash1u(ii * 3u + 9u);
  let t = G.time;
  let ang = h * 6.2832 + t * (0.012 + 0.01 * h2);
  let rr = 0.25 + 0.6 * sqrt(h2);
  var q = vec2f(LAGOON.x + cos(ang) * rr * LAGOON.z * 0.95, LAGOON.y + sin(ang) * rr * LAGOON.w * 0.95);
  q += vec2f(sin(t * 0.07 + h3 * 20.0), cos(t * 0.05 + h * 20.0)) * 1.2;
  let rot = h3 * 6.2832 + t * 0.05 * (h - 0.5);
  let cr = vec2f(c.x * 0.09, c.y * 0.045) * (0.7 + 0.6 * h);
  let rc = vec2f(cr.x * cos(rot) - cr.y * sin(rot), cr.x * sin(rot) + cr.y * cos(rot));
  let wp = vec3f(q.x + rc.x, 0.015 + 0.005 * sin(t + h * 9.0), q.y + rc.y);
  var o: PO; o.pos = G.viewProj * vec4f(wp, 1.0); o.c = c;
  o.col = mix(vec3f(1.0, 0.45, 0.8), vec3f(1.0, 0.85, 0.95), h3) * 0.45;
  return o;
}
@fragment fn fsPetal(in: PO) -> @location(0) vec4f {
  if (dot(in.c, in.c) > 1.0) { discard; }
  return vec4f(in.col * (1.0 - 0.5 * dot(in.c, in.c)), 1.0);
}

// ---------------- sky (drawn last, only where nothing else wrote depth) ----------------
struct SO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SO { var o: SO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
fn skyCol(rd: vec3f, stars: bool) -> vec3f {
  let h = rd.y;
  var c = mix(hex(0x0a2a38) * 0.35, hex(0x140f33) * 0.3, smoothstep(-0.05, 0.35, h));
  c = mix(c, hex(0x05061a) * 0.25, smoothstep(0.3, 0.95, h));
  let m = max(dot(rd, G.sunDir), 0.0);
  c += vec3f(0.35, 0.4, 0.75) * (pow(m, 8.0) * 0.05 + pow(m, 64.0) * 0.12 + smoothstep(0.99955, 0.9998, m) * 5.0) * U.misc.x;
  if (stars && h > 0.0) {
    let q = rd.xz / (h + 0.35) * 70.0;
    let d = dotGlow(q, 0.12, 0.09);
    let tw = 0.6 + 0.4 * sin(G.time * (0.4 + d.y) + d.y * 40.0);
    c += mix(vec3f(0.7, 0.8, 1.2), vec3f(1.2, 0.8, 1.1), d.y) * d.x * tw * 0.5 * smoothstep(0.05, 0.3, h);
    let neb = nz(rd.xz / (h + 0.5) * 0.25 + vec2f(0.1, G.time * 0.0007));
    c += slotCol(vec4f(neb.x, 0.0, neb.y, 0.0)) * 0.025 * smoothstep(0.4, 0.8, neb.z) * smoothstep(0.1, 0.5, h);
    // dark canopy closing the sky overhead, open around the moon; moonlit leaf edges
    let q2 = rd.xz / (h + 0.4);
    let lf = nz(q2 * 0.31).x * 0.6 + nz(q2 * 1.7 + 0.3).y * 0.4 + 0.3 * smoothstep(0.05, 0.6, h) - 0.5 * pow(m, 7.0);
    let can = smoothstep(0.4, 0.5, lf) * smoothstep(0.0, 0.2, h);
    c = mix(c, vec3f(0.004, 0.011, 0.013) + G.sunColor * 0.12 * smoothstep(0.56, 0.42, lf) * pow(m, 3.0), can);
  }
  return c;
}
@fragment fn fsSky(in: SO) -> @location(0) vec4f { return vec4f(skyCol(viewRay(in.uv), true), 1.0); }
