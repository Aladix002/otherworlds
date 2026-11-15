// Opaque scene: terrain, houses + village dressing, spruces, window glow, water, sky, aurora.
struct TO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f };
@vertex fn vsTer(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> TO {
  var o: TO; o.w = p; o.n = n; o.m = uv; o.pos = clip(p); return o;
}
@fragment fn fsTer(in: TO) -> @location(0) vec4f {
  let wp = in.w;
  if (MIR < 0.0 && wp.y < 0.0) { discard; }
  let d = distance(wp, G.camPos);
  var n = normalize(in.n);
  let a = nl(wp.xz, 0.019, d); let b = nl(wp.xz, 0.16, d);
  let m = vmap(wp.xz);
  // rock on steep faces, broken up by noise
  let big = nl(vec2f(wp.x + wp.z * 0.3, wp.y * 2.0 + wp.z * 0.5), 0.0035, d);
  let rk = smoothstep(0.84, 0.56, n.y + (big.a - 0.5) * 0.45 + (a.a - 0.5) * 0.2 + (b.a - 0.5) * 0.1) * smoothstep(6.0, 30.0, wp.y);
  let dn = drift(n, wp, d, m.b); n = dn.xyz;
  var col = snow(n, wp, in.m.x, dn.w, m) * (1.0 - 0.16 * m.b);
  let strata = nl(vec2f(wp.x + wp.z, wp.y * 3.0), 0.02, d);
  col = mix(col, vec3f(0.05, 0.055, 0.07) * (0.3 + strata.a + 0.6 * big.r + 0.5 * b.a) * light(n, in.m.x, 1.0, 0.0, 0.0), rk);
  // far forest, painted where the tree meshes are culled
  let fo = in.m.y * smoothstep(420.0, 850.0, d) * smoothstep(0.3, 0.55, b.a + a.a * 0.4) * (1.0 - rk);
  col = mix(col, vec3f(0.005, 0.011, 0.011) + col * 0.22, fo * 0.85);
  col = mix(col, col * vec3f(0.42, 0.52, 0.68), smoothstep(0.17, 0.03, wp.y));
  return vec4f(fogged(col, wp), 1.0);
}

// ---- instanced objects. instance: a = (pos, scale), b = (yaw, colour + seed, shade, lit-window mask) ----
struct VI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f };
struct VO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec2f,
  @location(3) @interpolate(flat) k: vec3f, @location(4) l: vec3f,
};
@vertex fn vs(v: VI) -> VO {
  let R = rotY(v.b.x);
  var o: VO;
  o.w = v.a.xyz + R * (v.p * v.a.w); o.n = R * v.n; o.m = v.uv; o.k = v.b.yzw; o.l = v.p;
  o.pos = clip(o.w);
  return o;
}
fn paint(ci: f32) -> vec3f {
  if (ci < 0.5) { return vec3f(0.46, 0.05, 0.032); }       // falu red
  if (ci < 1.5) { return vec3f(0.6, 0.36, 0.06); }         // ochre
  if (ci < 2.5) { return vec3f(0.62, 0.62, 0.57); }        // white
  if (ci < 3.5) { return vec3f(0.07, 0.24, 0.38); }        // blue
  return vec3f(0.1, 0.29, 0.17);                           // green
}
fn isLit(mask: f32, id: f32) -> bool { return id > 14.5 || ((u32(mask) >> u32(id)) & 1u) == 1u; }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let wp = in.w;
  if (MIR < 0.0 && wp.y < 0.0) { discard; }
  let mat = floor(in.m.y); let fv = fract(in.m.y); let u = in.m.x;
  var n = normalize(in.n);
  let d = distance(wp, G.camPos);
  let ci = floor(in.k.x); let rnd = fract(in.k.x);
  let m = vmap(wp.xz);
  let nz = nl(wp.xz + wp.y * vec2f(0.37, 0.61), 0.5, d);
  var col: vec3f;
  if (mat == 2.0) {
    let low = smoothstep(5.0, 3.2, wp.y);
    let dn = drift(n, wp, d, m.b * low);
    col = (1.0 - 0.16 * m.b * low) * snow(dn.xyz, wp, 1.0, dn.w, vec4f(m.r * mix(0.5, 1.0, low), mix(1.0, m.g, low), 0.0, m.a * low));
  } else if (mat == 3.0) {
    let id = floor(u / 4.0 + 0.01); let uu = u - id * 4.0; let vv = fv / 0.98;
    let h = hash22(vec2f(id + 1.0, floor(rnd * 997.0)));
    let e = min(min(uu, 1.0 - uu), min(vv, 1.0 - vv));
    let pane = smoothstep(0.05, 0.065, e) * smoothstep(0.02, 0.032, min(abs(uu - 0.5), abs(vv - 0.58)));
    if (isLit(in.k.z, id)) {
      let q = vec2f(uu - 0.3 - 0.4 * h.x, (vv - 0.6) * 1.2);
      var c = mix(vec3f(1.0, 0.6, 0.26), vec3f(1.0, 0.42, 0.12), h.y) * (0.75 + 3.4 * exp(-dot(q, q) * 5.0)) * (0.7 + 0.5 * h.x);
      let cur = smoothstep(0.27, 0.22, min(uu, 1.0 - uu)) * step(h.y, 0.75);
      c = mix(c, c * vec3f(0.8, 0.6, 0.42) * (0.3 + 0.16 * sin(uu * 110.0)), cur);
      let frost = smoothstep(0.3, 0.0, vv + (nz.a - 0.5) * 0.3 + e * 1.5);
      c = mix(c, c * 0.45 + vec3f(0.1, 0.12, 0.15), frost * 0.7);
      col = mix(vec3f(0.3, 0.16, 0.07), c, pane);
    } else {
      let v = normalize(wp - G.camPos);
      col = mix(vec3f(0.6) * light(n, 1.0, 0.8, m.r, 0.0), skyCol(reflect(v, n)) * 0.6 + vec3f(0.003, 0.005, 0.01), pane);
    }
  } else if (mat == 7.0) {
    col = vec3f(1.0, 0.6, 0.24) * (1.6 + 2.6 * fv * 12.0 / 3.2);
  } else {
    var alb = vec3f(0.68, 0.68, 0.63); var ao = 1.0;                       // 1: trim
    if (mat == 0.0) {
      let bd = u / 0.16; let g = abs(fract(bd) - 0.5);
      alb = paint(ci) * (0.5 + 0.5 * smoothstep(0.5, 0.42, g)) * (0.85 + 0.3 * hash11(floor(bd) + ci * 7.0)) * (0.85 + 0.3 * nz.a);
      alb *= 0.7 + 0.3 * smoothstep(0.0, 0.09, fv);
    } else if (mat == 4.0) {
      alb = vec3f(0.075, 0.055, 0.04) * (0.5 + nz.a) * (0.55 + 0.45 * smoothstep(0.5, 0.4, abs(fract(u / 0.21) - 0.5)));
      ao = mix(0.35, 1.0, smoothstep(-0.9, -0.1, in.l.y));
    } else if (mat == 5.0) {
      let row = fv * 12.0 / 0.22;
      let br = min(abs(fract(row) - 0.5), abs(fract(u / 0.45 + floor(row) * 0.5) - 0.5) * 2.0);
      alb = vec3f(0.17, 0.15, 0.14) * (0.5 + 0.8 * nz.a) * (0.5 + 0.5 * smoothstep(0.0, 0.08, 0.5 - br));
      ao = mix(0.45, 1.0, smoothstep(-0.9, 0.3, in.l.y));
    } else if (mat == 6.0) {
      let g = abs(fract(u / 0.19) - 0.5);
      alb = mix(vec3f(0.1, 0.17, 0.15), vec3f(0.33, 0.2, 0.09), step(0.5, rnd)) * (0.55 + 0.45 * smoothstep(0.5, 0.4, g)) * (0.7 + 0.6 * nz.a);
    } else if (mat == 8.0) {
      let st = fv / 0.98;
      alb = mix(vec3f(0.07, 0.045, 0.03) * (0.6 + 0.4 * smoothstep(0.5, 0.38, abs(fract(st * 5.0) - 0.5))), mix(vec3f(0.5, 0.07, 0.04), vec3f(0.6, 0.6, 0.55), step(0.86, st)), step(0.72, st)) * (0.7 + 0.6 * nz.a);
    }
    col = alb * light(n, 1.0, ao, m.r * 1.1, 0.0);
  }
  return vec4f(fogged(col, wp), 1.0);
}
// warm halo quads on the walls around lit windows and door lamps (additive)
@fragment fn fsGlow(in: VO) -> @location(0) vec4f {
  if (MIR < 0.0 && in.w.y < 0.0) { discard; }
  let id = floor(in.m.x / 4.0 + 0.01);
  if (!isLit(in.k.z, id)) { discard; }
  let p = (vec2f(in.m.x - id * 4.0, in.m.y / 0.98) - 0.5) * 2.0;
  let r2 = dot(p, p);
  let g = exp(-r2 * 3.5) * (1.0 - smoothstep(0.55, 1.0, r2)) * select(0.2, 0.42, id > 14.5);
  return vec4f(WARM * g * exp(-distance(in.w, G.camPos) * G.fogDensity), 0.0);
}

// ---- spruces: sway in travelling gusts, boughs nod ----
@vertex fn vsTree(v: VI) -> VO {
  let R = rotY(v.b.x); let s = v.a.w; let t = G.time;
  var w = v.a.xyz + R * (v.p * s);
  let hg = v.p.y / 9.0;
  let ph = t * 0.5 + w.x * 0.043 + w.z * 0.031;
  let gust = sin(ph) + 0.5 * sin(ph * 2.3 + 1.7 + v.b.y * 6.0) + 0.6 * sin(t * 0.21 + w.z * 0.012) + 0.25 * sin(t * 1.25 + v.b.y * 40.0);
  let amp = 0.3 * s * (1.0 + min(distance(v.a.xyz, G.camPos) / 180.0, 2.0));
  w += vec3f(0.85, 0.0, 0.5) * ((gust * 0.6 + 0.5) * hg * hg * amp);
  w.y += sin(t * 0.9 + v.b.y * 50.0 + v.p.y * 0.7) * 0.03 * length(v.p.xz) * s;
  var o: VO;
  o.w = w; o.n = R * v.n; o.m = v.uv; o.k = v.b.yzw; o.l = v.p;
  o.pos = clip(w);
  return o;
}
@fragment fn fsTree(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let wp = in.w;
  if (MIR < 0.0 && wp.y < 0.0) { discard; }
  var n = normalize(in.n);
  if (ff == (MIR < 0.0)) { n = -n; }
  let d = distance(wp, G.camPos);
  let nz = nl(vec2f(atan2(in.l.z, in.l.x) * 2.3 + in.k.x * 9.0, length(in.l.xz) * 0.1 + in.l.y * 0.35), 0.16, d * 0.3);
  let m = vmap(wp.xz);
  n = normalize(n + vec3f(nz.g - 0.5, 0.0, nz.b - 0.5) * 0.6);
  let ao = mix(0.4, 1.0, clamp(length(in.l.xz) / (2.5 * (1.0 - in.l.y / 9.0) + 0.5), 0.0, 1.0));
  var col = vec3f(0.05, 0.035, 0.028) * (0.5 + nz.a) * light(n, in.k.y, 0.6, m.r, 0.0);
  if (in.m.y < 11.0) {
    let sn = smoothstep(0.36, 0.6, in.m.x + (nz.a - 0.5) * 0.75 + n.y * 0.1 - 0.22 * smoothstep(50.0, 260.0, d));
    col = mix(vec3f(0.016, 0.042, 0.028) * (0.5 + nz.r) * light(n, in.k.y, ao, m.r, 0.0), snow(n, wp, in.k.y, ao, vec4f(m.r * 0.5, 1.0, 0.0, 0.0)), sn);
  }
  return vec4f(fogged(col, wp), 1.0);
}

// ---- fjord: still dark water mirroring the scene, an ice shelf with snow along the shore ----
struct WO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsWater(@builtin(vertex_index) vi: u32) -> WO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
  var o: WO;
  o.w = vec3f(G.camPos.x + cs[vi].x * 40000.0, 0.0, G.camPos.z + cs[vi].y * 40000.0);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsWater(in: WO) -> @location(0) vec4f {
  // world position from the view ray (interpolating the huge quad is too coarse)
  let vd = viewRay(in.pos.xy * G.invResolution); let d = -G.camPos.y / min(vd.y, -1e-4); let wp = G.camPos + vd * d; let t = G.time;
  let s = shoreD(wp.xz) + 1.44;                       // 0 at the waterline, negative out on the water
  let de = d / max(abs(vd.y), 0.02) * 0.6;           // footprint along the view at grazing angles
  let r1 = nl(wp.xz + vec2f(t * 0.1, t * 0.06), 0.031, de); let r2 = nl(wp.zx - vec2f(t * 0.05, -t * 0.08), 0.13, de);
  let ic = nl(wp.xz, 0.05, d); let ic2 = nl(wp.zx, 0.021, d);
  let g = (r1.gb - 0.5) + (r2.gb - 0.5) * 0.5;
  let uv = in.pos.xy * G.invResolution;
  let off = g * vec2f(0.005, 0.016) * min(1.0 / (abs(vd.y) + 0.1), 6.0) * smoothstep(0.0, 6.0, -s + 2.0);
  let refl = (textureSampleLevel(RT, LS, uv + off, 0.0).rgb + textureSampleLevel(RT, LS, uv - off * 0.55, 0.0).rgb) * 0.5;
  let F = mix(0.55, 1.0, pow(1.0 - abs(vd.y), 5.0));
  var col = vec3f(0.002, 0.005, 0.011) + refl * F * 0.92;
  let wI = 2.0 + 5.5 * ic2.a;
  let ice = smoothstep(-wI, -wI + 0.9, s + (ic.a - 0.5) * 1.2);
  if (ice > 0.0) {
    let m = vmap(wp.xz);
    let dust = smoothstep(0.3, 0.75, ic.r * 0.8 + ic2.r * 0.3 + 0.5 * smoothstep(-2.5, 0.0, s));
    let nI = normalize(vec3f((ic.g - 0.5) * 0.3, 1.0, (ic.b - 0.5) * 0.3));
    let bare = vec3f(0.1, 0.15, 0.2) * light(nI, 1.0, 1.0, m.r * 2.0, 0.0) + refl * 0.3;
    col = mix(col, mix(bare, snow(nI, wp, 1.0, 1.0, m), dust), ice);
  }
  return vec4f(fogged(col, wp), 1.0);
}

// ---- sky: gradient, round soft stars, the moon ----
struct SO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SO { var o: SO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
fn stars(rd: vec3f, K: f32, px: f32) -> vec3f {
  let p = rd * K; let ip = floor(p);
  let h = hash33(ip); let h2 = hash33(ip + 31.7);
  let q = p - (ip + 0.3 + 0.4 * h);
  let r = max(K * px * (0.8 + 0.5 * h2.y), 0.03);
  let b = pow(h2.x, 30.0) * (0.75 + 0.25 * sin(G.time * (0.7 + 1.6 * h2.y) + h2.z * 40.0));
  return mix(vec3f(0.7, 0.8, 1.0), vec3f(1.0, 0.85, 0.7), h2.z * h2.z) * (exp(-dot(q, q) / (r * r)) * b);
}
@fragment fn fsSky(in: SO) -> @location(0) vec4f {
  var rd = viewRay(in.uv); rd.y = abs(rd.y);
  var c = skyCol(rd);
  let px = 2.0 * G.tanHalfFov / G.resolution.y;
  let ext = smoothstep(0.0, 0.22, rd.y);
  // milky way: a soft band of unresolved light
  let mw = exp(-pow(dot(rd, normalize(vec3f(0.6, 0.35, 0.72))) * 3.2, 2.0)) * textureSampleLevel(NT, NS, rd.xz * 1.3 + rd.y, 2.0).a;
  c += vec3f(0.02, 0.024, 0.036) * mw * ext;
  c += (stars(rd, 50.0, px) * 10.0 + stars(rd, 110.0, px) * 6.0 * (1.0 + mw)) * ext;
  let mr = length(rd - G.sunDir);
  let mare = textureSampleLevel(NT, NS, (rd.xy - G.sunDir.xy) * 9.0 + 0.3, 1.0).a;
  c += vec3f(0.85, 0.92, 1.0) * ((1.0 - smoothstep(0.017, 0.017 + px * 2.0, mr)) * (1.3 + 1.4 * mare) + 0.05 * exp(-mr * 22.0) + 0.012 * exp(-mr * 5.0));
  return vec4f(c, 1.0);
}

// ---- aurora: tall folding curtains (one strip per ribbon), additive ----
struct AO { @builtin(position) pos: vec4f, @location(0) q: vec3f, @location(1) @interpolate(flat) r: f32 };
fn aurP(u: f32, r: f32) -> vec3f {
  let t = G.time;
  let x = 17000.0 * (0.3 * u + 0.7 * u * u * u); let xk = x * 0.001;
  let env = 0.65 + 0.35 * sin(xk * 0.31 + r * 1.9 + t * 0.011);
  let a2 = xk * 2.6 - t * 0.043 + r * 4.3;
  let z = 900.0 - 1900.0 * pow(r, 1.5) - 0.00002 * x * x + 700.0 * sin(xk * 0.85 + t * 0.019 + r * 2.1) + 280.0 * env * sin(a2) + 70.0 * sin(xk * 7.3 + t * 0.08 + r);
  return vec3f(x + 340.0 * env * cos(a2), 3200.0 + 350.0 * sin(xk * 0.6 + r * 5.0 + t * 0.027), z);
}
@vertex fn vsAur(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AO {
  let c = vi % 6u; let cx = f32(c == 1u || c == 4u || c == 5u); let cy = f32(c == 2u || c == 3u || c == 5u);
  let r = f32(ii);
  let u = (f32(vi / 6u) + cx) / 320.0 * 2.0 - 1.0;
  let p = aurP(u, r);
  let tg = normalize((aurP(u + 0.004, r) - p).xz);
  let hgt = 3600.0 + 900.0 * sin(p.x * 0.0004 + r * 3.0);
  let w = p + vec3f(0.0, hgt, hgt * 0.28) * cy;
  let vh = normalize((w - G.camPos).xz);
  var o: AO;
  o.pos = clip(w);
  // sheets seen edge-on are brighter (longer path through the glow); fade toward the ribbon ends
  o.q = vec3f(p.x * 0.001, cy, min(1.0 / max(abs(vh.x * tg.y - vh.y * tg.x), 0.16), 6.0) * 0.22 * (1.0 - pow(abs(u), 6.0)));
  o.r = r;
  return o;
}
@fragment fn fsAur(in: AO) -> @location(0) vec4f {
  let xk = in.q.x; let v = in.q.y; let r = in.r; let t = G.time;
  let ray = textureSample(NT, NS, vec2f(xk * 0.8 + t * 0.004 * (r - 2.5), r * 0.37 + v * 0.015)).a;
  let fine = textureSample(NT, NS, vec2f(xk * 3.1 - t * 0.011, r * 0.61 + v * 0.02)).a;
  let env = textureSample(NT, NS, vec2f(xk * 0.045 + t * 0.0016 + r * 0.21, r * 0.13 + t * 0.0006)).r;
  let rays = ray * 0.65 + fine * 0.35;
  let vb = v - 0.05 * rays - 0.01;
  let prof = smoothstep(0.0, 0.06, vb) * (exp(-vb * 4.5) + 0.12) * pow(1.0 - v, 0.7);
  let pulse = 0.8 + 0.2 * sin(t * 0.07 + r * 2.4 + xk * 0.2);
  var I = smoothstep(0.33, 0.78, env) * (0.25 + 1.1 * rays * rays) * prof * in.q.z * G.params.x * pulse * 2.4;
  I = 2.4 * (1.0 - exp(-I / 2.4));
  var col = mix(mix(AUR, vec3f(1.0, 0.2, 0.6), 0.55 * fine), AUR, smoothstep(0.0, 0.1, vb));
  col = mix(col, vec3f(0.22, 0.25, 0.95), smoothstep(0.2, 0.85, v) * 0.85);
  return vec4f(col * I, 0.0);
}
