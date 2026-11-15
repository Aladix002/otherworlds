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
  var d = 1e4;
  for (var i = 0u; i < NPATH - 1u; i++) {
    let a = PATH[i]; let b = PATH[i + 1u];
    let ba = b - a; let h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(p - a - ba * h));
  }
  return d;
}
fn dotGlow(q: vec2f, dens: f32, rmax: f32) -> vec2f {   // x = glow mask, y = cell random
  let c = floor(q); let h = hash2i(vec2i(c)); let r = u2f(h);
  let o = vec2f(u2f(pcg(h)), u2f(pcg(h + 7u))) * 0.6 + 0.2;
  let d = length(q - c - o);
  let rad = rmax * (0.35 + 0.65 * u2f(pcg(h + 3u))) * step(1.0 - dens, r);
  let fw = fwidth(q.x) * 1.2;
  return vec2f(smoothstep(rad + fw, rad * 0.3 - fw * 0.2, d) * smoothstep(0.9, 0.25, fw / max(rad, 1e-3)), u2f(pcg(h + 11u)));
}

// ---------------- terrain ----------------
@vertex fn vsTerrain(v: VI) -> VO { return outV(v.p, v.n, v.uv, v.at, vec4f(0.0)); }
@fragment fn fsTerrain(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = normalize(in.n);
  let N1 = nz(p.xz * 0.021); let N2 = nz(p.xz * 0.13 + 0.3);
  let slope = 1.0 - n.y;
  var alb = mix(hex(0x14231c), hex(0x243824), N1.x) * (0.7 + 0.5 * N2.y);
  alb = mix(alb, hex(0x2a1f2c), smoothstep(0.55, 0.75, N1.y + N2.x * 0.2) * 0.6);
  let rockM = smoothstep(0.38, 0.62, slope + (N2.z - 0.5) * 0.3);
  alb = mix(alb, mix(hex(0x221e2a), hex(0x34303a), N2.w), rockM);
  let wet = 1.0 - smoothstep(-0.1, 0.6, p.y);
  alb *= 1.0 - 0.45 * wet;
  let pd = pathDist(p.xz);
  let pm = 1.0 - smoothstep(0.75, 1.35, pd + (N2.x - 0.5) * 0.5);
  alb = mix(alb, mix(hex(0x3a3446), hex(0x4a4250), N2.y), pm * 0.75 * (1.0 - rockM));
  let dist = distance(p, G.camPos);
  let pl = pulse(p);
  // glowing moss specks, denser where plants glow
  let lm = textureSampleLevel(lmap, smp, wuv(p.xz), 0.0);
  let lsum = lm.x + lm.y + lm.z + lm.w;
  let dg = dotGlow(p.xz * 3.1, 0.03 + 0.2 * smoothstep(0.2, 1.4, lsum), 0.13) * (1.0 - rockM) * smoothstep(0.8, 0.93, n.y) * smoothstep(0.05, 0.35, p.y) * (1.0 - smoothstep(12.0, 30.0, dist));
  var e = slotOf(floor(lm.y * 2.0 + dg.y * 1.6) + 0.0) * dg.x * 0.55;
  // path border: a soft ribbon of luminous moss
  let edge = exp(-pow((pd - 1.3 - (N2.w - 0.5) * 0.4) / 0.13, 2.0)) * smoothstep(0.45, 0.75, N2.z + 0.1 * N1.x) * (1.0 - rockM);
  e += slotOf(2.5 + 1.5 * N1.z) * edge * 0.12;
  // lichen streaks on the cliff
  let lich = smoothstep(0.74, 0.8, nz(vec2f((p.x + p.z) * 0.2, p.y * 0.03)).x) * smoothstep(0.4, 0.7, N2.y) * rockM * smoothstep(1.0, 4.0, p.y);
  e += U.slot[0].rgb * lich * 0.1;
  e *= pl * (1.0 + 0.6 * touch(p));
  let c = shadeJ(alb, n, p, 1.0 - 0.3 * rockM);
  return vec4f(c + e, 1.0);
}

// ---------------- trees ----------------
struct VII { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) at: vec4f, @location(4) a: vec4f, @location(5) b: vec4f };
@vertex fn vsTree(v: VII) -> VO {
  let R = rotY(v.b.x);
  var lp = v.p * v.a.w;
  let t = G.time; let sd = v.b.z * 17.0;
  if (v.at.x > 0.5 && v.at.x < 1.5) {
    let k = smoothstep(8.0, 30.0, lp.y);
    lp += vec3f(sin(t * 0.37 + sd + lp.y * 0.05), sin(t * 0.53 + sd * 1.3) * 0.4, cos(t * 0.29 + sd * 0.7)) * 0.22 * k;
  } else if (v.at.x > 1.5) {
    let h = v.at.z;
    lp += vec3f(sin(t * 0.41 + sd + v.at.w * 6.0 + h * 0.2), 0.0, cos(t * 0.33 + sd * 1.1 + h * 0.15)) * 0.025 * h;
  }
  var o = outV(v.a.xyz + R * lp, R * v.n, v.uv, v.at, v.b);
  return o;
}
@fragment fn fsTree(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let m = in.at.x; let sl = slotOf(in.b.y); let pl = pulse(p);
  var alb: vec3f; var e = vec3f(0.0); var ao = 1.0;
  let dist = distance(p, G.camPos);
  if (m < 0.5) {
    let q = in.uv;
    let N = nz(q * vec2f(0.35, 0.06));
    alb = mix(hex(0x1e1620), hex(0x3a2c2a), N.x) * (0.75 + 0.5 * nz(q * vec2f(1.3, 0.25)).y);
    alb = mix(alb, hex(0x1f3a26), smoothstep(0.25, 0.7, n.y + N.z * 0.4) * 0.8);
    // spiral vein network flowing up the trunk and along the buttress fins
    let w1 = abs(fract((q.x + q.y * 0.42) / 1.7 + N.y * 0.5) - 0.5);
    let w2 = abs(fract((q.x - q.y * 0.3) / 2.3 + N.w * 0.6) - 0.5);
    let fw = max(fwidth(q.x) + fwidth(q.y), 1e-4) * 0.35;
    let line = max(smoothstep(0.05 + fw, 0.0, w1), smoothstep(0.035 + fw, 0.0, w2) * 0.7) * smoothstep(1.2, 0.35, fw * 10.0);
    let hy = p.y - in.b.w;
    let wave = pow(0.5 + 0.5 * sin(hy * 0.55 - G.time * 1.05 + in.b.z * 9.0), 3.0);
    let hm = 1.0 - smoothstep(3.0, 13.0, hy);
    e = sl * line * (0.35 + 1.5 * wave) * hm * 0.9;
    // luminous lichen spots
    let ls = smoothstep(0.74, 0.86, nz(q * vec2f(0.6, 0.18) + 0.5).z) * hm;
    e += slotOf(in.b.y + 1.0) * ls * 0.25;
    ao = 0.55 + 0.45 * smoothstep(-0.2, 2.0, hy);
  } else if (m < 1.5) {
    let x = in.at.z; let vv = in.at.y;
    alb = mix(hex(0x0b2420), hex(0x1d4a32), vv * 0.6 + in.at.w * 0.4);
    let rib = smoothstep(0.08, 0.0, abs(x)) ;
    let side = smoothstep(0.1, 0.0, abs(fract(vv * 7.0 - abs(x) * 1.8) - 0.5) - 0.38) * 0.4;
    let glowy = step(0.45, fract(in.b.z * 7.3));
    e = sl * (rib * 0.55 + side * 0.3) * glowy * (1.0 - smoothstep(25.0, 60.0, dist));
    e += sl * 0.07 * smoothstep(0.85, 1.0, vv) * glowy;
    alb *= 1.0 + 0.6 * max(dot(-n, G.sunDir), 0.0);
  } else {
    alb = hex(0x1a2a1c);
    let bead = smoothstep(0.32, 0.05, abs(fract(in.at.z / 0.55) - 0.5)) ;
    e = slotOf(in.b.y + 2.0) * (0.12 + bead * 1.1) * (1.0 - smoothstep(18.0, 45.0, dist));
  }
  e *= pl * (1.0 + 0.8 * touch(p));
  return vec4f(shadeJ(alb, n, p, ao) + e, 1.0);
}

// ---------------- generic props: rocks (0), shrubs (1), mushrooms (2) ----------------
@vertex fn vsProp(v: VII) -> VO {
  let R = rotY(v.b.x);
  var o = outV(v.a.xyz + R * (v.p * v.a.w), R * v.n, v.uv, v.at, v.b);
  return o;
}
@fragment fn fsProp(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let ty = in.b.w; let sl = slotOf(in.b.y); let pl = pulse(p) * (1.0 + 0.9 * touch(p));
  var alb: vec3f; var e = vec3f(0.0);
  if (ty < 0.5) {
    let N = nz(p.xz * 0.2 + p.y * 0.13);
    alb = mix(hex(0x221e28), hex(0x3a3640), N.x);
    alb = mix(alb, hex(0x1d3a22), smoothstep(0.35, 0.8, n.y + N.y * 0.3));
    let lq = select(vec2f(p.x + p.z, p.y), p.xz, abs(n.y) > 0.7) * 3.0;
    let lich = dotGlow(lq, 0.22, 0.16);
    e = slotOf(in.b.y + lich.y * 2.0) * lich.x * 0.6 * smoothstep(0.2, 0.6, n.y + 0.4);
  } else if (ty < 1.5) {
    alb = hex(0x1c1626);
    if (in.at.x > 0.5) { e = sl * (0.45 + 0.5 * in.at.z); alb = sl * 0.15; }
    else { e = sl * 0.12 * in.at.y; }
  } else {
    if (in.at.x > 0.5) { alb = hex(0x40304a); e = sl * (0.25 + 1.4 * (1.0 - in.at.y)); }
    else { alb = hex(0x50485a); e = sl * 0.25; }
  }
  return vec4f(shadeJ(alb, n, p, 1.0) + e * pl, 1.0);
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
  let base = v.a.xyz; let L = v.a.w;
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
    let lw = ll * 0.17 * sin(3.14159 * (0.15 + 0.85 * q));
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
  if (in.uv.y == 0.0) { e = sl * 1.1; }
  else {
    let mid = smoothstep(0.22, 0.0, abs(in.at.y));
    let tip = smoothstep(0.75, 1.0, in.at.x);
    e = sl * (mid * 0.75 + tip * 0.9) * (0.4 + 0.6 * s);
  }
  e *= pulse(p) * (0.8 + 0.7 * in.e.x);
  alb *= 1.0 + 0.5 * max(dot(-n, G.sunDir), 0.0);
  return vec4f(shadeJ(alb, n, p, 0.8 + 0.2 * s) + e, 1.0);
}

// ---------------- fan plants ----------------
@vertex fn vsFan(v: VII) -> VO {
  let base = v.a.xyz; let S = v.a.w; let tch = touch(base);
  let sd = v.b.z * 23.0;
  let R = rotY(v.b.x);
  let hs = 0.55 * S;
  var lp: vec3f; var ln: vec3f;
  if (v.at.x > 0.5) {
    let open = 0.62 + 0.1 * sin(G.time * 0.23 + sd) + 0.07 * sin(G.time * 0.41 + sd * 0.6) + 0.28 * tch;
    let th = v.uv.x * open * 1.45;
    let r = v.uv.y * S * 0.75;
    let pleat = cos(v.uv.x * 12.0 * 3.14159);
    var q = vec3f(sin(th) * r, cos(th) * r, pleat * 0.045 * r);
    let tilt = -0.35 - 0.3 * fract(v.b.z * 9.1) + 0.12 * sin(G.time * 0.19 + sd);
    q = rotX(tilt) * q;
    lp = q + vec3f(0.0, hs, 0.0);
    ln = rotX(tilt) * vec3f(0.0, 0.0, 1.0);
  } else {
    let a = v.uv.x * 6.2832;
    lp = vec3f(cos(a) * 0.018 * S, v.uv.y * hs, sin(a) * 0.018 * S);
    ln = vec3f(cos(a), 0.0, sin(a));
  }
  var o = outV(base + R * lp, R * ln, v.uv, v.at, v.b);
  o.e = vec3f(tch, 0.0, 0.0);
  return o;
}
@fragment fn fsFan(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let sl = slotOf(in.b.y);
  var alb = hex(0x1a2e2a); var e = vec3f(0.0);
  if (in.at.x > 0.5) {
    let r = in.uv.y;
    let fold = abs(fract(in.uv.x * 6.0) - 0.5);
    let fw = fwidth(in.uv.x * 6.0);
    let rib = smoothstep(0.06 + fw, 0.0, fold) * smoothstep(0.1, 0.3, r);
    let rim = smoothstep(0.9, 0.99, r);
    alb = mix(hex(0x17302c), hex(0x2c2a48), r);
    e = sl * (rib * 0.55 + rim * 0.9 + 0.02 * r);
    alb *= 1.0 + 0.6 * max(dot(-n, G.sunDir), 0.0);
  } else { e = sl * 0.1; }
  e *= pulse(p) * (0.8 + 0.7 * in.e.x);
  return vec4f(shadeJ(alb, n, p, 1.0) + e, 1.0);
}

// ---------------- spiral stalks ----------------
@vertex fn vsSpiral(v: VII) -> VO {
  let base = v.a.xyz; let Hh = v.a.w; let tch = touch(base);
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
  let ring = smoothstep(0.3, 0.0, abs(fract(s * 16.0 - G.time * 0.25 + in.b.z * 3.0) - 0.5) - 0.1);
  let alb = mix(hex(0x1c2a24), hex(0x2a1c36), s);
  let e = sl * (0.15 + ring * 0.9 * smoothstep(0.2, 0.6, s) + smoothstep(0.85, 1.0, s) * 2.0) * pulse(p) * (0.8 + 0.7 * in.e.x);
  return vec4f(shadeJ(alb, n, p, 1.0) + e, 1.0);
}

// ---------------- lily pads ----------------
@vertex fn vsPad(v: VII) -> VO {
  let sd = v.b.z * 13.0;
  let R = rotY(v.b.x);
  var lp = v.p * vec3f(v.a.w, 1.0, v.a.w);
  let tilt = vec2f(sin(G.time * 0.37 + sd), cos(G.time * 0.29 + sd * 1.3)) * 0.008;
  lp.y += lp.x * tilt.x + lp.z * tilt.y + 0.012 * sin(G.time * 0.5 + sd);
  var o = outV(v.a.xyz + R * lp, R * v.n, v.uv, v.at, v.b);
  return o;
}
@fragment fn fsPad(in: VO) -> @location(0) vec4f {
  let p = in.w; var n = normalize(in.n);
  let up = dot(n, G.camPos - p) > 0.0 && n.y > 0.0;
  n = faceN(n, p);
  let r = in.at.y; let a = in.at.z;
  let sl = slotOf(in.b.y);
  let fa = fract(a * 18.0 / 6.2832 + r * 0.6);
  let fwA = fwidth(a * 18.0 / 6.2832) + 1e-4;
  let vein = smoothstep(0.05 + fwA, 0.0, abs(fa - 0.5) - 0.0) * smoothstep(0.05, 0.25, r) * (1.0 - smoothstep(0.85, 0.9, r));
  let ringV = smoothstep(0.03, 0.0, abs(fract(r * 5.0) - 0.5) - 0.02) * 0.4;
  var alb = mix(hex(0x123a2a), hex(0x2c5a34), smoothstep(0.2, 0.9, r)) * (0.8 + 0.3 * nz(p.xz * 0.6).x);
  let rimM = smoothstep(0.91, 0.97, r);
  alb = mix(alb, hex(0x5a1f3e), rimM);
  var e = sl * (vein * 0.45 + ringV * 0.2) + slotOf(in.b.y + 1.0) * rimM * 0.1;
  if (!up) { e *= 0.4; }
  e *= pulse(p) * (1.0 + 0.8 * touch(p));
  let v = normalize(G.camPos - p);
  let spec = pow(max(dot(reflect(-v, n), G.sunDir), 0.0), 40.0) * 0.15;
  return vec4f(shadeJ(alb, n, p, 1.0) + e + G.sunColor * spec, 1.0);
}

// ---------------- lotus ----------------
fn bloomOf(b: vec4f) -> f32 {
  let ph = G.time / b.w + b.z * 6.2832;
  let c = 0.5 + 0.5 * sin(ph * 6.2832) + 0.06 * sin(G.time * 0.37 + b.z * 9.0);
  return smoothstep(0.15, 0.85, c);
}
@vertex fn vsLotus(v: VII) -> VO {
  let bl = bloomOf(v.b);
  let ring = v.at.x;
  var lp = v.p; var ln = v.n;
  if (ring < 2.5) {
    let tc = select(select(-0.32, -0.18, ring < 1.5), 0.02, ring < 0.5);
    let to = select(select(0.5, 0.95, ring < 1.5), 1.38, ring < 0.5);
    let tilt = mix(tc, to, bl) + 0.04 * sin(G.time * 0.6 + v.at.w * 6.0);
    let rx = rotX(-tilt);
    lp = rx * lp; ln = rx * ln;
    let ry = rotY(v.at.y);
    lp = ry * lp; ln = ry * ln;
  }
  let S = v.a.w;
  let R = rotY(v.b.x);
  var o = outV(v.a.xyz + R * (lp * S) + vec3f(0.0, 0.01 * sin(G.time * 0.45 + v.b.z * 9.0), 0.0), R * ln, v.uv, v.at, v.b);
  o.e = vec3f(bl, 0.0, 0.0);
  return o;
}
@fragment fn fsLotus(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let bl = in.e.x; let vv = in.at.z;
  let sl = slotOf(in.b.y);
  var alb: vec3f; var e: vec3f;
  if (in.at.x > 2.5) {
    alb = hex(0x8a9a30);
    e = mix(vec3f(1.6, 1.3, 0.35), sl, 0.25) * (0.8 + 1.4 * bl);
  } else {
    let pink = mix(vec3f(1.0, 0.82, 0.92), vec3f(1.0, 0.3, 0.72), smoothstep(0.2, 1.0, vv));
    alb = pink * 0.5;
    let vein = smoothstep(0.15, 0.0, abs(fract(in.at.y * 0.0 + in.uv.x * 3.5) - 0.5) - 0.3);
    e = mix(pink, sl, 0.35) * (0.22 + 0.55 * (1.0 - vv) * (0.4 + bl) + vein * 0.1 + smoothstep(0.8, 1.0, vv) * 0.4);
  }
  e *= (0.8 + 0.4 * pulse(p)) * (1.0 + 0.7 * touch(p));
  return vec4f(shadeJ(alb, n, p, 1.0) + e, 1.0);
}

// ---------------- koi (under water) ----------------
@vertex fn vsFish(v: VII) -> VO {
  let t = G.time; let a = v.a; let b = v.b;
  let th = b.x + t * a.w;
  let wob = vec2f(sin(t * 0.13 + b.z * 7.0), cos(t * 0.11 + b.z * 5.0)) * 2.0;
  let c = vec2f(a.x, a.y) + vec2f(cos(th) * a.z, sin(th) * a.z * 0.65) + wob;
  let dc = vec2f(-sin(th) * a.z, cos(th) * a.z * 0.65) * sign(a.w);
  let yaw = atan2(dc.x, dc.y);
  var lp = v.p * (0.8 + 0.4 * fract(b.z * 3.3));
  let zt = 1.0 - v.at.y;
  lp.x += sin(t * 3.1 + lp.z * 7.0 + b.z * 9.0) * 0.06 * zt * zt + select(0.0, sin(t * 3.1 - 2.0) * 0.06, v.at.x > 0.5 && v.at.y > 0.5);
  let R = mat3x3f(cos(yaw), 0.0, -sin(yaw), 0.0, 1.0, 0.0, sin(yaw), 0.0, cos(yaw));
  let w = vec3f(c.x, b.w + 0.05 * sin(t * 0.3 + b.z * 4.0), c.y) + R * lp;
  var o = outV(w, R * v.n, v.uv, v.at, b);
  return o;
}
@fragment fn fsFish(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let z = in.at.y;
  let sl = slotOf(in.b.y);
  let spots = smoothstep(0.55, 0.7, nz(in.uv * vec2f(1.0, 2.0) + in.b.z).x);
  var e = mix(vec3f(1.4, 0.55, 0.3), vec3f(1.2, 1.1, 1.15), spots) * (0.35 + 0.4 * z);
  e = mix(e, sl * 1.3, 0.3);
  if (in.at.x > 0.5) { e = sl * 0.8 + vec3f(0.3); }
  let rim = pow(1.0 - abs(dot(n, normalize(G.camPos - p))), 2.0);
  return vec4f(e * (0.6 + 0.6 * rim) * (0.85 + 0.3 * pulse(p)), 1.0);
}

// ---------------- frogs (state from U.frog) ----------------
@vertex fn vsFrog(v: VI, @builtin(instance_index) ii: u32) -> VO {
  let f = U.frog[ii]; let fb = U.frogB[ii];
  let R = rotY(f.w);
  var lp = v.p * 1.6;
  lp.y *= 1.0 - 0.25 * fb.y;
  if (v.at.y > 1.5 && v.at.y < 2.5) { lp += vec3f(0.0, -0.05, -0.12) * fb.y * step(lp.z, 0.0); }
  var o = outV(f.xyz + R * lp, R * v.n, v.uv, v.at, vec4f(f.w, 0.0, f32(ii), 0.0));
  return o;
}
@fragment fn fsFrog(in: VO) -> @location(0) vec4f {
  let p = in.w; let n = faceN(normalize(in.n), p);
  let tag = in.at.y;
  var alb = hex(0x13301c);
  let sp = dotGlow(in.uv * vec2f(9.0, 5.0), 0.5, 0.25);
  var e = U.slot[0].rgb * sp.x * 0.6 * step(tag, 0.5);
  if (tag > 2.5) { e = vec3f(1.6, 1.3, 0.4); alb = vec3f(0.3, 0.25, 0.05); }
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
  c += vec3f(0.35, 0.4, 0.75) * (pow(m, 8.0) * 0.05 + pow(m, 64.0) * 0.12 + pow(m, 900.0) * 0.6) * U.misc.x;
  if (stars && h > 0.0) {
    let q = rd.xz / (h + 0.35) * 70.0;
    let d = dotGlow(q, 0.12, 0.09);
    let tw = 0.6 + 0.4 * sin(G.time * (0.4 + d.y) + d.y * 40.0);
    c += mix(vec3f(0.7, 0.8, 1.2), vec3f(1.2, 0.8, 1.1), d.y) * d.x * tw * 0.5 * smoothstep(0.05, 0.3, h);
    let neb = nz(rd.xz / (h + 0.5) * 0.25 + vec2f(0.1, G.time * 0.0007));
    c += slotCol(vec4f(neb.x, 0.0, neb.y, 0.0)) * 0.025 * smoothstep(0.4, 0.8, neb.z) * smoothstep(0.1, 0.5, h);
  }
  return c;
}
@fragment fn fsSky(in: SO) -> @location(0) vec4f { return vec4f(skyCol(viewRay(in.uv), true), 1.0); }
