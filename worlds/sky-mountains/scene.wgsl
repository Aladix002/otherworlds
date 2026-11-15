// Opaque scene: sky, instanced rock (pillars, islands, stones), vegetation (pines, grass, flowers), cloud sea, birds.
struct VI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f };
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f,
  @location(3) @interpolate(flat) sd: vec2f,
};
// instance: a = (pos, scale xz), b = (yaw, seed, scale y / scale xz, extra: > 0 drift amplitude, < 0 hero-island shadow flag)
@vertex fn vs(v: VI) -> VO {
  let mat = floor(v.uv.y); let wgt = fract(v.uv.y);
  let bob = max(v.b.w, 0.0);
  let R = rotY(v.b.x + G.time * 0.05 * bob * (v.b.y - 0.5));
  let s = vec3f(v.a.w, v.a.w * v.b.z, v.a.w);
  var w = v.a.xyz + R * (v.p * s);
  w.y += sin(G.time * 0.17 + v.b.y * 40.0) * bob * 0.6;
  let ph = G.time * 0.8 + w.x * 0.13 + w.z * 0.11;
  let gust = sin(ph) + 0.5 * sin(ph * 2.3 + 1.7) + 0.6 * sin(G.time * 0.31 + w.z * 0.04);
  let amp = select(select(select(0.05, 0.07, mat == 4.0), 0.045, mat == 3.0), 0.5, mat == 1.0);
  w += vec3f(0.8, 0.0, 0.55) * (gust * wgt * amp * v.a.w);
  var o: VO;
  o.w = w; o.n = normalize(R * (v.n / s)); o.m = vec2f(v.uv.x, mat + wgt * 0.5); o.sd = v.b.yw;
  o.pos = G.viewProj * vec4f(w, 1.0);
  return o;
}

fn shadowAt(p: vec2f) -> f32 { return textureSampleLevel(SM, NS, p / (2.0 * SMR) + 0.5, 0.0).r; }
// soft sunrise lighting shared by rock and vegetation
fn shade(alb: vec3f, n: vec3f, wp: vec3f, ao: f32, sh: f32, trans: f32) -> vec3f {
  let v = normalize(G.camPos - wp);
  let ndl = dot(n, G.sunDir);
  let dif = smoothstep(-0.2, 0.75, ndl) * sh;
  let back = max(dot(-v, G.sunDir), 0.0);
  let rim = pow(1.0 - max(dot(n, v), 0.0), 5.0) * (0.15 + 0.85 * back * back) * sh;
  var c = alb * (G.sunColor * (dif * ao * ao + rim * 0.35) + hemi(n, G.ambientSky, G.ambientGround) * ao * (0.55 + 0.45 * sh));
  c += alb * G.sunColor * vec3f(1.0, 0.9, 0.35) * (trans * back * back * sh * 0.8);
  // mist where things sink into the cloud sea
  if (wp.y < 70.0) {
    let hg = cloudHG(wp.xz);
    let m = smoothstep(hg.x + 20.0, hg.x - 2.0, wp.y);
    let crest = smoothstep(-22.0, 20.0, hg.x);
    let cl = smoothstep(-0.1, 0.5, dot(normalize(vec3f(-hg.y, 1.0, -hg.z)), G.sunDir)) * 0.55;
    c = mix(c, cloudShade(cl * (0.3 + 0.7 * crest), 0.28 + 0.72 * crest), m * m);
  }
  return atmo(c, wp);
}

@fragment fn fsRock(in: VO) -> @location(0) vec4f {
  var n = normalize(in.n);
  let wp = in.w; let d = distance(wp, G.camPos);
  let wx = n.x * n.x / (n.x * n.x + n.z * n.z + 1e-4);
  let top = nl(wp.xz, 0.11, d);
  let strata = nl(vec2f((wp.x + wp.z) * 0.07 + in.sd.x * 31.0, wp.y), 0.045, d);
  let stA = nl(vec2f(wp.z * 9.0, wp.y), 0.0065, d * 9.0); let stB = nl(vec2f(wp.x * 9.0, wp.y), 0.0065, d * 9.0);
  let streak = mix(stB.a, stA.a, wx);
  let wy = smoothstep(0.45, 0.8, abs(n.y));
  let fine = mix(mix(nl(wp.xy, 0.16, d), nl(wp.zy, 0.16, d), wx), nl(wp.xz, 0.21, d), wy);
  let mic = nl(wp.xz + wp.y * vec2f(0.7, -0.6), 0.55, d);
  let up = smoothstep(0.32, 0.66, n.y + (top.a - 0.5) * 0.3);
  var alb = mix(vec3f(0.30, 0.27, 0.26), vec3f(0.56, 0.47, 0.38), smoothstep(0.2, 0.8, mix(strata.a, fine.a, wy)));
  alb *= 0.72 + 0.5 * mix(streak, top.a, wy);
  alb = mix(alb, vec3f(0.13, 0.12, 0.13), smoothstep(0.5, 0.85, mix(stB.r, stA.r, wx)) * 0.45 * (1.0 - wy));
  // shrubs clinging to ledges, moss and meadow on anything that faces up
  let cling = smoothstep(0.52, 0.7, strata.r + (fine.a - 0.5) * 0.4) * smoothstep(0.0, 0.3, n.y);
  alb = mix(alb, mix(vec3f(0.06, 0.12, 0.05), vec3f(0.16, 0.24, 0.07), fine.a), cling * 0.85);
  let meadow = mix(mix(vec3f(0.07, 0.15, 0.045), vec3f(0.2, 0.3, 0.07), top.a), vec3f(0.36, 0.34, 0.1), smoothstep(0.55, 0.85, top.r) * 0.6);
  alb = mix(alb, meadow * (0.85 + 0.3 * mic.a), up * select(1.0, 0.3, in.sd.y < -1.5));
  alb *= 0.8 + 0.4 * mic.a;
  let near = 1.0 - smoothstep(20.0, 110.0, d);
  n = bump(n, wp, (mix(strata.a, top.a, wy) * 1.6 + fine.a * 0.9 + streak * 0.6 * (1.0 - wy)) * (1.0 - up) + mic.a * 0.2 * (1.0 - up), 0.5 * near * (1.0 - up));
  // flat ground: analytic gradients from the noise texture (smooth, no derivative blocks)
  n = normalize(n + vec3f(top.g - 0.5 + (mic.g - 0.5) * 0.8, 0.0, top.b - 0.5 + (mic.b - 0.5) * 0.8) * (0.8 * up));
  var sh = 1.0;
  if (in.sd.y < -0.5) { sh = shadowAt(wp.xz); }
  alb *= 1.0 - 0.35 * smoothstep(0.2, 0.7, -n.y);
  let ao = in.m.x * (0.72 + 0.28 * fine.a);
  return vec4f(shade(alb, n, wp, ao, sh, up * 0.15), 1.0);
}

@fragment fn fsVeg(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let wp = in.w; let d = distance(wp, G.camPos);
  let mat = floor(in.m.y + 0.01); let wgt = fract(in.m.y) * 2.0;
  let nz = nl(wp.xz + wp.y * 0.7, 0.33, d);
  let ao = in.m.x;
  var alb = mix(vec3f(0.11, 0.065, 0.045), vec3f(0.3, 0.19, 0.13), nz.a);            // bark (2), roots and vines (1)
  var tr = 0.0; var sh = 1.0;
  if (mat == 1.0) { alb = mix(alb, vec3f(0.1, 0.17, 0.05), smoothstep(0.3, 0.6, nz.r + wgt * 0.4)); }
  if (mat == 3.0) {
    let nf = nl(vec2f(wp.x + wp.y * 0.7, wp.z - wp.y * 0.4), 1.1, d).a * 0.6 + nl(vec2f(wp.z - wp.y * 0.5, -wp.x), 2.1, d).a * 0.4;
    let tuft = smoothstep(0.25, 0.75, nf);
    alb = mix(vec3f(0.005, 0.024, 0.018), vec3f(0.04, 0.105, 0.03), ao * (0.3 + 0.7 * nz.a)) * (0.35 + 1.0 * tuft);
    alb = mix(alb, vec3f(0.15, 0.24, 0.06), smoothstep(0.55, 1.0, wgt) * 0.5) * (0.8 + 0.4 * in.sd.x);
    tr = 0.25 + 0.75 * wgt;
  }
  if (mat == 4.0) {
    alb = mix(vec3f(0.03, 0.085, 0.022), vec3f(0.2, 0.3, 0.07), wgt * (0.5 + 0.6 * nz.r)) * (0.7 + 0.5 * in.sd.x);
    tr = 0.8 * wgt; sh = shadowAt(wp.xz);
  }
  if (mat == 5.0) {
    let k = fract(in.sd.x * 7.31);
    alb = select(select(vec3f(0.95, 0.74, 0.16), vec3f(0.9, 0.86, 0.8), k < 0.66), vec3f(0.9, 0.36, 0.5), k < 0.33) * (0.6 + 0.4 * ao);
    tr = 0.5; sh = shadowAt(wp.xz);
  }
  return vec4f(shade(alb, n, wp, 0.35 + 0.65 * ao, sh, tr), 1.0);
}

// ---- sky ----
struct SO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SO { var o: SO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fsSky(in: SO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  var c = skyBase(rd);
  let s = max(dot(rd, G.sunDir), 0.0);
  let y = max(rd.y, 0.0);
  // high cirrus: two stretched noise taps, lit rose-gold near the sun
  let q = rd.xz / (y + 0.22);
  let ci = textureSample(NT, NS, q * vec2f(0.11, 0.035) + vec2f(G.time * 0.0007, 0.0)).a * 0.65 + textureSample(NT, NS, q * vec2f(0.31, 0.09) + vec2f(0.3, G.time * 0.0004)).a * 0.35;
  let cm = smoothstep(0.47, 0.8, ci) * smoothstep(0.03, 0.3, y) * (1.0 - smoothstep(0.55, 0.95, y));
  c = mix(c, mix(vec3f(0.80, 0.70, 0.90), vec3f(2.1, 1.25, 0.8), pow(s, 2.5)), cm * 0.5);
  // pale day moon
  let md = normalize(vec3f(0.42, 0.52, 0.74));
  let m = dot(rd, md);
  let mr = (1.0 - m) * 900.0;
  let mare = textureSample(NT, NS, rd.xy * 6.0).a;
  c = mix(c, vec3f(0.92, 0.9, 1.0) * (0.75 + 0.35 * mare), (1.0 - smoothstep(0.82, 1.0, mr)) * smoothstep(-0.9, 0.6, dot(normalize(rd - md * m), normalize(G.sunDir - md * dot(G.sunDir, md))) + (1.0 - mr) * 0.9) * 0.55);
  // sun: small hot core in a wide soft glow
  c += G.sunColor * (smoothstep(0.99955, 0.99985, s) * 9.0 + pow(s, 900.0) * 1.4 + pow(s, 90.0) * 0.18 + pow(s, 12.0) * 0.05);
  return vec4f(c, 1.0);
}

// ---- cloud sea: camera-centred polar grid displaced by the height field; shells add translucent wisps ----
struct CO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) @interpolate(flat) k: f32 };
@vertex fn vsCloud(@location(0) p: vec2f, @builtin(instance_index) ii: u32) -> CO {
  var o: CO;
  let xz = G.camPos.xz + p;
  let k = f32(ii);
  o.w = vec3f(xz.x, cloudHG(xz).x + k * 2.3, xz.y); o.k = k;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
fn cloudCol(wp: vec3f, k: f32) -> vec4f {
  let p = wp.xz; let d = distance(wp, G.camPos);
  // soft normals: the gradient comes from a blurrier mip close to the camera
  let bias = 1.6 * (1.0 - smoothstep(100.0, 700.0, d));
  let a = textureSampleBias(NT, NS, cloudUV(p, 0), bias); let b = textureSampleBias(NT, NS, cloudUV(p, 1), bias + 0.6);
  let hg = cloudMix(a, b, textureSample(NT, NS, cloudUV(p, 2)));
  let w1 = textureSample(NT, NS, p / 190.0 + vec2f(0.004, -0.0025) * G.time);
  let w2 = textureSample(NT, NS, p.yx / 61.0 + vec2f(-0.007, 0.004) * G.time);
  let det = w1.a * 0.6 + w2.a * 0.4;
  let n = normalize(vec3f(-hg.y, 1.0, -hg.z) + vec3f(w1.g - 0.5, 0.0, w1.b - 0.5) * 0.35);
  // shadow from the billows toward the low sun (horizon taps)
  let sd = normalize(G.sunDir.xz); let tn = G.sunDir.y / length(G.sunDir.xz);
  var hz = cloudHG(p + sd * 50.0).x - hg.x - 50.0 * tn;
  if (k == 0.0) { hz = max(hz, cloudHG(p + sd * 150.0).x - hg.x - 150.0 * tn); }
  let shd = 1.0 - smoothstep(-6.0, 6.0, hz);
  let lit = smoothstep(-0.1, 0.5, dot(n, G.sunDir) + k * 0.03) * (0.1 + 0.9 * shd);
  let crest = smoothstep(-22.0, 20.0, hg.x + det * 6.0 - 3.0 + k * 2.0);
  let v = normalize(wp - G.camPos);
  let s = max(dot(v, G.sunDir), 0.0);
  var c = cloudShade(lit * (0.3 + 0.7 * crest), 0.28 + 0.72 * crest);
  c += vec3f(1.6, 0.95, 0.5) * (pow(s, 6.0) * crest * (0.3 + 0.7 * shd) * 0.5);
  return vec4f(atmo(c, wp), det);
}
@fragment fn fsCloud(in: CO) -> @location(0) vec4f { return vec4f(cloudCol(in.w, 0.0).rgb, 1.0); }
@fragment fn fsShell(in: CO) -> @location(0) vec4f {
  let c = cloudCol(in.w, in.k);
  let d = distance(in.w, G.camPos);
  let t = 0.22 + 0.09 * in.k;
  let vy = abs(in.w.y - G.camPos.y) / d;
  let a = smoothstep(t, t + 0.5, c.a) * (1.0 - smoothstep(400.0, 1100.0, d)) * smoothstep(4.0, 16.0, d) * smoothstep(0.03, 0.3, vy) * 0.42;
  return vec4f(c.rgb * a, a);
}

// ---- birds: flocks follow slow loops, wings flap from the root with a lagging tip ----
// instance: a = (loop centre, loop radius), b = (phase, lateral offset, back offset, size)
struct BO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f };
@vertex fn vsBird(@location(0) p0: vec3f, @location(1) n0: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> BO {
  let big = step(1.6, b.w);
  let ph = b.x + G.time * 7.5 / a.w * mix(1.0, 0.75, big);
  let h = hash11(b.y * 3.7 + b.z);
  let ctr = a.xyz + vec3f(a.w * cos(ph), 9.0 * sin(ph * 1.7 + b.x) + 0.5 * sin(G.time * 0.6 + h * 30.0), a.w * 0.72 * sin(ph));
  let fw = normalize(vec3f(-sin(ph), 0.07 * cos(ph * 1.7 + b.x), 0.72 * cos(ph)));
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = normalize(cross(rt, fw) - rt * mix(0.12, 0.38, big));
  let rt2 = cross(fw, up);
  // flap
  let span = fract(uv.y) * step(6.005, uv.y);
  let env = mix(0.25 + 0.75 * smoothstep(-0.2, 0.5, sin(G.time * 0.11 + h * 40.0)), 0.12, big);
  let ang = (0.12 + 0.5 * env * sin(G.time * mix(2.3, 1.1, big) + h * 20.0 - span * 1.3)) * span;
  var p = p0; var n = n0;
  let sx = sign(p.x);
  let r = abs(p.x) - 0.1;
  if (span > 0.0) { p = vec3f(sx * (0.1 + r * cos(ang)), p.y + r * sin(ang), p.z); n = vec3f(n.x * cos(ang) - sx * n.y * sin(ang), n.y * cos(ang) + sx * n.x * sin(ang), n.z); }
  p *= b.w;
  var o: BO;
  let org = ctr + rt2 * b.y - fw * b.z;
  o.w = org + rt2 * p.x + up * p.y - fw * p.z;
  o.n = rt2 * n.x + up * n.y - fw * n.z;
  o.m = vec2f(uv.x, big);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsBird(in: BO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let alb = mix(vec3f(0.035, 0.035, 0.045), mix(vec3f(0.82, 0.8, 0.78), vec3f(0.5, 0.36, 0.24), in.m.y), smoothstep(0.15, 0.6, in.m.x));
  return vec4f(shade(alb, n, in.w, 1.0, 1.0, 0.25), 1.0);
}
