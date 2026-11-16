// Opaque scene: sky, terrain, flora (two-pose flowers and grass), trees / woodwork / wisteria, river.
struct SO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SO { var o: SO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fsSky(in: SO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  var c = skyCol(rd);
  let y = max(rd.y, 0.0); let s = max(dot(rd, G.sunDir), 0.0);
  let q = rd.xz / (y + 0.2);
  let cl = textureSampleLevel(NT, NS, q * vec2f(0.045, 0.1) + vec2f(G.time * 0.0005, 0.0), 0.0).r * 0.62 + textureSampleLevel(NT, NS, q * vec2f(0.17, 0.3) + vec2f(0.3, G.time * 0.0004), 1.0).g * 0.38;
  let cm = smoothstep(0.5, 0.85, cl) * smoothstep(0.03, 0.22, y);
  c = mix(c, mix(vec3f(0.95, 0.78, 0.86), vec3f(2.0, 1.35, 0.85), pow(s, 3.0)), cm * 0.62);
  c += G.sunColor * (smoothstep(0.9999, 0.99996, s) * 14.0 + pow(s, 3000.0) * 2.0) + vec3f(1.0, 0.72, 0.38) * pow(s, 400.0) * 0.7;
  return vec4f(c, 1.0);
}

// ---- terrain ----
struct TO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f };
@vertex fn vsTer(@location(0) p: vec3f, @location(1) n: vec3f) -> TO { var o: TO; o.w = p; o.n = n; o.pos = G.viewProj * vec4f(p, 1.0); return o; }
@fragment fn fsTer(in: TO) -> @location(0) vec4f {
  let p = in.w.xz; let d = distance(in.w, G.camPos);
  let m = mapA(p); let zb = mapB(p);
  let f1 = textureSample(NT, NS, p * 0.37);
  let f2 = textureSample(NT, NS, p * 0.047);
  let f3 = textureSample(NT, NS, p * 0.0063);
  let far = smoothstep(10.0, 60.0, d);
  var grass = mix(vec3f(0.022, 0.065, 0.014), vec3f(0.11, 0.2, 0.035), f2.r * 0.55 + f3.g * 0.45) * (0.6 + 0.8 * f1.a);
  grass = mix(grass, vec3f(0.2, 0.19, 0.05), smoothstep(0.55, 0.9, f3.r) * 0.35);
  let field = zb.rgb * (0.72 + 0.56 * f2.g);
  var cov = m.g * mix(0.03 + 0.3 * smoothstep(0.5, 0.7, f1.b), 0.88, far);
  // lavender rows: stripes that melt into the field colour with distance
  let st = smoothstep(-0.35, 0.5, cos((p.x - 0.51) * 3.08));
  let rk = zb.a * (1.0 - smoothstep(0.5, 2.4, fwidth(p.x) * 3.08));
  cov *= mix(1.0, mix(0.1, 1.2, st), rk);
  grass = mix(grass, vec3f(0.1, 0.075, 0.045) * (0.6 + 0.8 * f1.r), rk * (1.0 - st) * 0.65);
  cov = min(cov, 1.0);
  var alb = mix(grass, field, cov);
  let path = smoothstep(0.2, 0.75, -m.b + (f1.g - 0.5) * 0.35 + (f2.a - 0.5) * 0.25);
  let soil = mix(vec3f(0.19, 0.12, 0.07), vec3f(0.45, 0.34, 0.21), f1.r * 0.6 + f2.g * 0.4) * (0.7 + 0.6 * f1.a);
  alb = mix(alb, soil, path);
  alb = mix(alb, vec3f(0.06, 0.06, 0.04) * (0.5 + f1.r), smoothstep(0.1, 0.8, m.b));
  alb *= 0.84 + 0.4 * gust(p) * (0.25 + 0.75 * far) * (1.0 - path);
  let n = normalize(in.n + vec3f(f2.r - 0.5, 0.0, f2.a - 0.5) * 0.3 + vec3f(f1.r - 0.5, 0.0, f1.g - 0.5) * 0.45 * (1.0 - far));
  let v = normalize(G.camPos - in.w);
  let back = pow(max(dot(-v, G.sunDir), 0.0), 2.0);
  // petals stand up into the low sun: a field glows more than the flat ground under it
  let fuzz = cov * (1.0 - path) * (0.25 + 0.55 * back) * far;
  let ao = mix(0.65 + 0.35 * path, 1.0, far);
  let c = alb * (G.sunColor * (m.a * (max(dot(n, G.sunDir), 0.0) * 1.15 + fuzz)) + hemi(n, G.ambientSky, G.ambientGround) * ao * (0.6 + 0.4 * m.a));
  return vec4f(atmo(c, in.w), 1.0);
}

// ---- flora: instance = (x, z, accent index + seed, scale). Vertex: open pose, closed pose, normal, uv (material + t, cross) ----
struct FI { @location(0) b: vec3f, @location(1) a: vec3f, @location(2) n: vec3f, @location(3) uv: vec2f, @location(4) i: vec4f };
struct FO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) l: vec3f,
};
const ACC = array<vec3f, 6>(vec3f(0.95, 0.92, 0.85), vec3f(1.0, 0.85, 0.25), vec3f(1.0, 0.45, 0.68), vec3f(0.35, 0.62, 1.0), vec3f(1.0, 0.42, 0.06), vec3f(0.9, 0.1, 0.06));
@vertex fn vsFlora(v: FI) -> FO {
  let xz = v.i.xy; let sd = fract(v.i.z); let acc = floor(v.i.z);
  let h3 = vec3f(fract(sd * 13.7), fract(sd * 5.3), fract(sd * 91.1));
  let m = mapA(xz);
  let near = 1.0 - smoothstep(1.6, 5.5 + 2.5 * h3.x, distance(xz, G.params.xy));
  let o = mix(0.45 + 0.3 * h3.x, 1.0, near);
  var p = mix(v.a, v.b, o * o * (3.0 - 2.0 * o));
  let mat = floor(v.uv.x);
  if (mat == 6.0) { p = vec3f(rot2(near * (G.time * 0.3 + sd * 6.0)) * p.xz, p.y).xzy; }      // spiral blooms turn slowly while awake
  let s = v.i.w * (0.8 + 0.45 * h3.y) * (1.0 + 0.3 * near);
  let cy = cos(sd * 61.0); let sy = sin(sd * 61.0);
  var q = vec3f(cy * p.x + sy * p.z, p.y, cy * p.z - sy * p.x) * s;
  let n = vec3f(cy * v.n.x + sy * v.n.z, v.n.y, cy * v.n.z - sy * v.n.x);
  let wgt = pow(clamp(q.y / 0.55, 0.0, 1.7), 1.5);
  let gu = gust(xz);
  let fl = sin(G.time * (1.4 + sd) + sd * 40.0) * 0.012;
  var off = WD * ((gu * 0.17 + 0.02) * wgt) + vec2f(fl, -fl) * wgt;
  let tc = xz - G.camPos.xz; let dc = length(tc);                    // part around the walker
  off += tc / max(dc, 0.05) * ((1.0 - smoothstep(0.2, 1.0, dc)) * 0.5 * min(wgt, 1.0));
  q = vec3f(q.x + off.x, q.y - dot(off, off) * 0.7, q.z + off.y);
  var out: FO;
  out.w = vec3f(xz.x, m.r - 0.03, xz.y) + q;
  out.n = n; out.uv = v.uv;
  var col = mapB(xz + (h3.xz - 0.5) * 6.0).rgb;
  if (acc > 0.5) { col = ACC[u32(acc) - 1u]; }
  out.col = clamp(col * (0.78 + 0.45 * h3.z) + (vec3f(h3.y, h3.x, h3.z) - 0.5) * 0.1, vec3f(0.0), vec3f(1.2));
  out.l = vec3f(mix(0.3, 1.0, smoothstep(0.0, 0.28 * s, q.y)), m.a, near);
  out.pos = G.viewProj * vec4f(out.w, 1.0);
  return out;
}
@fragment fn fsFlora(in: FO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let mat = floor(in.uv.x); let t = fract(in.uv.x) / 0.98; let u = in.uv.y;
  let c = in.col;
  var alb = mix(c * c * 0.4, c, smoothstep(0.0, 0.6, t)) * (0.62 + 0.5 * smoothstep(0.0, 0.8, t)) * (0.92 + 0.08 * cos(u * 9.0));   // petals with a deep throat
  var tr = 0.7; var glow = 0.0;
  if (mat < 0.5) { alb = mix(vec3f(0.02, 0.06, 0.012), vec3f(0.17, 0.34, 0.05), t) * (1.0 - 0.25 * u * u); tr = 0.55; }
  else if (mat == 2.0) { alb = mix(vec3f(1.0, 0.62, 0.05), vec3f(0.2, 0.08, 0.02), t); tr = 0.1; }
  else if (mat == 3.0) { alb = mix(c, vec3f(1.0, 0.75, 0.2), 0.5 * (1.0 - t)); glow = 0.25 + 0.7 * in.l.z; tr = 0.3; }
  else if (mat == 4.0) { alb = mix(vec3f(1.0, 0.93, 0.62), c, smoothstep(0.08, 0.7, t)); }
  else if (mat == 5.0) { alb = c * mix(0.45, 1.15, t); }
  else if (mat == 7.0) { alb = mix(vec3f(0.07, 0.16, 0.06), c, smoothstep(0.3, 0.6, t)); }
  return vec4f(shade(alb * 0.8, n, in.w, in.l.x, in.l.y, tr, glow), 1.0);
}

// ---- trees, woodwork, wisteria. instance: a = (pos, scale), b = (yaw, seed, y scale, wisteria colour) ----
struct VI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f };
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) sd: vec3f };
@vertex fn vsObj(v: VI) -> VO {
  let mat = floor(v.uv.x);
  let R = rotY(v.b.x);
  let s = vec3f(v.a.w, v.a.w * v.b.z, v.a.w);
  var q = R * (v.p * s);
  let gu = gust(v.a.xz);
  var sp = v.a.xz + normalize(G.sunDir.xz) * 3.0 * v.a.w;
  if (mat == 2.0) {                                  // hanging cluster swings from its top
    let sw = (gu * 0.2 + 0.05 * sin(G.time * 0.9 + v.b.y * 40.0)) * pow(max(-v.p.y, 0.0), 1.4) * s.y;
    q += vec3f(WD.x * sw, abs(sw) * 0.2, WD.y * sw);
    sp = v.a.xz;
  } else if (mat == 1.0 || mat == 3.0) {
    let ph = G.time * 1.1 + dot(q, vec3f(1.7, 2.3, 1.1));
    q += vec3f(WD.x, 0.0, WD.y) * ((gu * 0.14 + 0.03) * v.a.w) + vec3f(sin(ph), cos(ph * 1.3), sin(ph * 0.7)) * (0.02 * (0.3 + gu));
  }
  var o: VO;
  o.w = v.a.xyz + q; o.n = normalize(R * (v.n / s)); o.uv = v.uv;
  o.sd = vec3f(v.b.y, v.b.w, mapA(sp).a);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsObj(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let mat = floor(in.uv.x); let t = fract(in.uv.x) / 0.98;
  let wp = in.w; let v = normalize(G.camPos - wp);
  // triplanar noise: b = round speckles (leaves, florets), a = fine grain, r/g = slow variation
  let ls = select(1.1, 2.4, mat == 2.0);
  let bw = n * n;
  let tp = textureSample(NT, NS, wp.zy * ls) * bw.x + textureSample(NT, NS, wp.xz * ls + 0.37) * bw.y + textureSample(NT, NS, wp.xy * ls + 0.71) * bw.z;
  let ndv = abs(dot(n, v));
  var alb: vec3f; var tr = 0.0; var ao = 1.0; var glow = 0.0;
  if (mat == 0.0) {
    alb = mix(vec3f(0.045, 0.032, 0.028), vec3f(0.3, 0.22, 0.16), tp.a * 0.6 + tp.r * 0.4);
    ao = 0.35 + 0.65 * t;
    n = normalize(n + vec3f(tp.r - 0.5, 0.0, tp.g - 0.5) * 0.8);
  } else if (mat == 2.0) {
    let k = in.sd.y;
    let base = mix(mix(vec3f(0.4, 0.22, 0.95), vec3f(0.93, 0.88, 1.0), saturate(k)), vec3f(1.0, 0.42, 0.7), saturate(k - 1.0));
    let body = step(in.uv.y, 0.3);
    if (body * (0.5 - tp.b) > ndv * 0.9 - 0.1) { discard; }
    alb = mix(base, base * base * vec3f(0.6, 0.4, 0.85), saturate(smoothstep(0.3, 1.0, t) + body * (0.6 - tp.b * 0.8))) * (0.7 + 0.4 * in.uv.y);
    tr = 0.9; glow = 0.22;
  } else {
    if (tp.b < 0.5 - ndv * 1.1) { discard; }
    let lf = smoothstep(0.3, 0.75, tp.b);
    ao = (0.2 + 0.8 * t) * (0.4 + 0.6 * lf);
    n = normalize(n + (vec3f(tp.r, tp.g, tp.a) - 0.5) * 0.9);
    let hue = saturate(t * 0.55 + tp.r * 0.6 + (tp.a - 0.5) * 0.4);
    if (mat == 1.0) {
      alb = mix(vec3f(0.4, 0.11, 0.01), vec3f(1.0, 0.62, 0.05), hue);
      alb = mix(alb, alb * vec3f(1.05, 0.6, 0.35), smoothstep(0.55, 0.9, in.sd.x));
    } else { alb = mix(vec3f(0.015, 0.05, 0.012), vec3f(0.2, 0.36, 0.06), hue); }
    tr = 0.8;
  }
  return vec4f(shade(alb, n, wp, ao, in.sd.z, tr, glow), 1.0);
}

// ---- river ----
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) u: f32 };
@vertex fn vsWater(@location(0) p: vec3f) -> WO { var o: WO; o.w = vec3f(p.x, 0.0, p.z); o.u = p.y; o.pos = G.viewProj * vec4f(o.w, 1.0); return o; }
@fragment fn fsWater(in: WO) -> @location(0) vec4f {
  let p = in.w.xz;
  let fl = vec2f(G.time * 0.03, 0.0);
  let a = textureSample(NT, NS, p * vec2f(0.05, 0.11) - fl);
  let b = textureSample(NT, NS, p * vec2f(0.13, 0.27) - fl * 2.3 + 0.37);
  let n = normalize(vec3f((a.r + b.g - 1.0) * 0.14, 1.0, (a.g + b.r - 1.0) * 0.14));
  let v = normalize(in.w - G.camPos);
  var r = reflect(v, n); r.y = abs(r.y);
  let m = mapA(p);
  var refl = mix(mix(vec3f(0.05, 0.07, 0.04), vec3f(0.6, 0.36, 0.05), smoothstep(0.4, 0.75, a.r)), skyCol(r), smoothstep(0.02, 0.2, r.y + (b.a - 0.5) * 0.1));
  let bank = smoothstep(0.3, 1.0, abs(in.u) + (a.a - 0.5) * 0.35);
  refl = mix(refl, vec3f(0.1, 0.09, 0.03) + vec3f(0.5, 0.3, 0.04) * b.a * b.a, bank * 0.8);
  let fr = 0.05 + 0.95 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  let deep = mix(vec3f(0.015, 0.05, 0.045), vec3f(0.05, 0.09, 0.05), a.a);
  var c = mix(deep, refl, saturate(fr + 0.2));
  c += G.sunColor * pow(max(dot(r, G.sunDir), 0.0), 500.0) * 2.5 * m.a;
  return vec4f(atmo(c, in.w), 1.0);
}
