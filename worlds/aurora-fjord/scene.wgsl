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
  let big2 = nl(wp.xz, 0.0011, d);
  // far slopes: crags from the noise gradient, so the coarse far mesh does not shade as flat facets
  let mid = nl(wp.xz, 0.0043, d);
  n = normalize(n + (vec3f(big2.g - 0.5, 0.0, big2.b - 0.5) * 1.3 + vec3f(mid.g - 0.5, 0.0, mid.b - 0.5) * 0.7) * smoothstep(200.0, 800.0, d) * smoothstep(20.0, 120.0, wp.y));
  let rk = smoothstep(0.74, 0.5, n.y + (big.a - 0.5) * 0.5 + (big2.a - 0.5) * 0.5 + (a.a - 0.5) * 0.2 + (b.a - 0.5) * 0.1 + 0.3 * smoothstep(180.0, 520.0, wp.y) + (nl(vec2f(wp.x * 0.3 + wp.z, wp.y * 5.0), 0.03, d).a - 0.5) * 0.6 * smoothstep(45.0, 20.0, wp.y)) * smoothstep(4.0, 9.0, wp.y);
  let dn = drift(n, wp, d, m.b); n = dn.xyz;
  var col = snow(n, wp, in.m.x, dn.w, m) * (1.0 - 0.28 * m.b);
  // rock: triplanar grain + cracks, lifted by sky and aurora fill so the walls are not flat navy
  let g0 = in.n * in.n; let tw = g0 / (g0.x + g0.y + g0.z);
  let rt = nl(wp.zy, 0.011, d) * tw.x + nl(wp.xz, 0.011, d) * tw.y + nl(wp.xy, 0.011, d) * tw.z;
  let rf = nl(wp.zy, 0.07, d) * tw.x + nl(wp.xz, 0.07, d) * tw.y + nl(wp.xy, 0.07, d) * tw.z;
  let rn = normalize(n + (vec3f(rt.g, rt.a, rt.b) - 0.5) * 0.7 + (vec3f(rf.g, rf.a, rf.b) - 0.5) * 0.35 * (1.0 - smoothstep(60.0, 400.0, d)));
  let rock = vec3f(0.1, 0.105, 0.125) * (0.45 + 0.8 * rt.a + 0.4 * rf.a) * mix(0.55, 1.0, smoothstep(0.3, 0.55, rt.r));
  col = mix(col, rock * (light(rn, in.m.x, 1.0, m.r * 1.5, 0.0) + G.ambientSky * (0.6 + 1.2 * smoothstep(45.0, 20.0, wp.y))), rk);
  // far forest, painted where the tree meshes are culled
  let fo = in.m.y * smoothstep(420.0, 850.0, d) * smoothstep(0.3, 0.55, b.a + a.a * 0.4) * (1.0 - rk);
  col = mix(col, vec3f(0.005, 0.011, 0.011) + col * 0.22, fo * 0.85);
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
  if (ci > 4.5) { return vec3f(0.2, 0.105, 0.045); }       // oiled logs (the sauna)
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
      alb = paint(ci) * mix(0.5 + 0.5 * smoothstep(0.5, 0.42, g), 0.93, smoothstep(14.0, 45.0, d)) * (0.85 + 0.3 * hash11(floor(bd) + ci * 7.0)) * (0.85 + 0.3 * nz.a);
      alb *= 0.7 + 0.3 * smoothstep(0.0, 0.09, fv);
    } else if (mat == 4.0) {
      alb = vec3f(0.075, 0.055, 0.04) * (0.5 + nz.a) * (0.55 + 0.45 * smoothstep(0.5, 0.4, abs(fract(u / 0.21) - 0.5)));
      ao = mix(0.35, 1.0, smoothstep(-0.9, -0.1, in.l.y));
      alb *= 1.0 + 2.5 * smoothstep(-0.2, -0.8, n.y) * step(1.0, in.l.y);
    } else if (mat == 5.0) {
      let row = fv * 12.0 / 0.22;
      let br = min(abs(fract(row) - 0.5), abs(fract(u / 0.45 + floor(row) * 0.5) - 0.5) * 2.0);
      alb = vec3f(0.17, 0.15, 0.14) * (0.5 + 0.8 * nz.a) * (0.5 + 0.5 * smoothstep(0.0, 0.08, 0.5 - br));
      ao = mix(0.45, 1.0, smoothstep(-0.9, 0.3, in.l.y));
    } else if (mat == 6.0) {
      let g = abs(fract(u / 0.19) - 0.5);
      alb = mix(vec3f(0.1, 0.17, 0.15), vec3f(0.33, 0.2, 0.09), step(0.5, rnd)) * (0.55 + 0.45 * smoothstep(0.5, 0.4, g)) * (0.7 + 0.6 * nz.a);
    } else if (mat == 9.0) {
      alb = vec3f(0.12, 0.12, 0.13) * (0.5 + 0.9 * nz.a);
      let cap = smoothstep(0.25, 0.6, n.y + (nz.r - 0.5) * 0.5);
      let dn = drift(n, wp, d, 0.0);
      col = mix(alb * light(n, 1.0, 0.8, m.r, 0.0), snow(dn.xyz, wp, 1.0, dn.w, m), cap);
      return vec4f(fogged(col, wp), 1.0);
    } else if (mat == 12.0) {
      // ice: vertical organ-pipe streaks, sky and aurora in the glaze
      let v = normalize(wp - G.camPos);
      let st = nl(vec2f(wp.z * 1.7, wp.y * 0.12), 1.0, d);
      let ni = normalize(n + (st.gbg - 0.5) * 0.45);
      let F = pow(1.0 - max(dot(-v, ni), 0.0), 3.0);
      col = vec3f(0.19, 0.3, 0.36) * (0.75 + 0.4 * st.a) * (light(ni, 1.0, 1.0, m.r * 2.0, 0.0) + G.ambientSky * 0.9 + AURL * (0.2 * G.params.x))
        + (skyCol(reflect(v, ni)) * 1.5 + AUR * (0.1 * G.params.x)) * F + G.sunColor * (pow(max(dot(ni, normalize(G.sunDir - v)), 0.0), 60.0) * 1.2);
      col = mix(col, snow(n, wp, 1.0, 1.0, m), smoothstep(0.7, 0.92, n.y + (st.a - 0.5) * 0.3));
      return vec4f(fogged(col, wp), 1.0);
    } else if (mat == 13.0) {
      // fur, feathers, cloth: palette index in the fraction
      let pi = u32(fv * 12.0);
      var pal = array<vec3f, 12>(vec3f(0.62, 0.2, 0.04), vec3f(0.6, 0.56, 0.5), vec3f(0.03, 0.018, 0.012), vec3f(0.17, 0.125, 0.09), vec3f(0.5, 0.47, 0.42), vec3f(0.42, 0.36, 0.27),
        vec3f(0.2, 0.21, 0.23), vec3f(0.62, 0.62, 0.6), vec3f(1.0, 0.7, 0.1), vec3f(0.03, 0.06, 0.14), vec3f(0.5, 0.04, 0.03), vec3f(0.5, 0.3, 0.2));
      let fz = nl(in.l.xz * 3.0 + in.l.y * 1.7, 1.0, d);
      alb = pal[pi] * (0.75 + 0.5 * fz.a) * 1.25;
      if (pi == 6u) { alb = pal[6] * (1.5 - 1.6 * in.l.y) * (1.0 - 0.4 * smoothstep(0.62, 0.7, nl(in.l.xz + in.l.y, 7.0, d).a)); }
      if (pi == 7u) { alb = pal[7] * (0.55 + 0.6 * smoothstep(0.1, 0.3, abs(fract(in.l.y * 17.0 + in.l.x * 3.0) - 0.5) + step(0.33, in.l.y))); }
      if (pi == 8u) { return vec4f(fogged(alb * 0.3, wp), 1.0); }
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
  // every tree its own girth and droop
  let r2 = dot(v.p.xz, v.p.xz); let sq = 0.82 + 0.4 * fract(v.b.y * 13.7);
  var w = v.a.xyz + R * (vec3f(v.p.x * sq, v.p.y - (fract(v.b.y * 7.1) - 0.35) * 0.1 * r2, v.p.z * sq) * s);
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
// ---- creatures: head turns to the visitor, legs trot, tails sway. instance b = (yaw, seed + 15 * walk, kind, gait phase) ----
@vertex fn vsLife(v: VI) -> VO {
  let kind = v.b.z; let sd = fract(v.b.y); let walk = floor(v.b.y) / 15.0; let ph = v.b.w; let part = v.uv.x; let t = G.time;
  let R = rotY(v.b.x);
  var p = v.p; var n = v.n;
  // per kind: neck pivot (y, z), hip height, reach of the look, idle look, attention radius, tail root
  var piv = vec2f(0.36, -0.22); var hip = 0.3; var mx = 1.1; var idle = 0.25; var rad = 8.0; var tz = 0.28;
  if (kind == 1.0) { piv = vec2f(1.0, -0.42); hip = 0.9; mx = 0.7; idle = 0.0; rad = 15.0; tz = 0.6; }
  else if (kind == 2.0) { piv = vec2f(0.15, -0.2); mx = 0.9; idle = 0.3; rad = 13.0; tz = 0.9; }
  else if (kind == 3.0) { piv = vec2f(0.33, 0.0); mx = 2.5; idle = 0.9; rad = 13.0; tz = 9.0; }
  let lc = (G.camPos - v.a.xyz) * R;                    // the visitor in the creature's frame
  let near = 1.0 - smoothstep(rad * 0.5, rad, length(lc));
  let slow = sin(t * 0.11 + sd * 40.0) + 0.6 * sin(t * 0.047 + sd * 90.0);
  let ang = atan2(-lc.x, -lc.z);
  let look = mix(slow * idle, clamp(ang, -mx, mx) * (1.0 - smoothstep(2.4, 3.1, abs(ang))), near);
  var pitch = 0.0;
  if (kind == 1.0) { pitch = 1.3 * smoothstep(-0.5, 0.1, slow) * (1.0 - near); }             // grazing, lifts the head when you come close
  if (kind == 2.0) { pitch = -0.3 - 0.35 * max(near, smoothstep(0.8, 1.3, slow)); }
  if (kind == 0.0) { pitch = 0.07 * sin(ph * 2.0) * walk; }
  if (part == 1.0) {
    let o = vec3f(0.0, piv.x, piv.y); let cp = cos(pitch); let sp = sin(pitch); let ca = cos(look); let sa = sin(look);
    var q = p - o;
    q = vec3f(q.x, q.z * sp + q.y * cp, q.z * cp - q.y * sp); q = vec3f(q.x * ca + q.z * sa, q.y, q.z * ca - q.x * sa);
    n = vec3f(n.x, n.z * sp + n.y * cp, n.z * cp - n.y * sp); n = vec3f(n.x * ca + n.z * sa, n.y, n.z * ca - n.x * sa);
    p = q + o;
  } else if (part > 5.5) {
    p.x += sin(t * 0.7 + sd * 20.0) * 0.3 * max(p.z - tz, 0.0);
  } else if (part > 1.5) {
    let lp = ph + (part - 2.0) * PI + step(3.5, part) * 1.57;
    let k = clamp((hip - p.y) / hip, 0.0, 1.0) * walk * hip;
    p.z += sin(lp) * 0.5 * k; p.y += max(-cos(lp), 0.0) * 0.14 * k;
  } else {
    p.y *= 1.0 + 0.015 * sin(t * 1.1 + sd * 30.0);
  }
  p.y += 0.012 * sin(ph * 2.0) * walk;
  var o: VO;
  o.w = v.a.xyz + R * (p * v.a.w); o.n = R * n; o.m = v.uv; o.k = vec3f(0.0, 1.0, 0.0); o.l = p;
  o.pos = clip(o.w);
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
  // near trees: the bough tips break up into a ragged needle fringe instead of straight polygon edges
  let q = (1.0 - in.m.x) / 0.7;
  let tip = smoothstep(0.7, 1.0, q) * step(-0.3, in.n.y);
  if (in.m.y < 11.0 && q > 0.8 && d < 48.0 && in.n.y > -0.3) {
    let fr = nl(vec2f(atan2(in.l.z, in.l.x) * 7.0 + in.l.y, in.l.y * 0.8 + length(in.l.xz) * 0.6), 1.1, d * 0.15).a;
    if (fr < (q - 0.8) * 4.5 * (1.0 - d / 48.0)) { discard; }
  }
  n = normalize(n + vec3f(nz.g - 0.5, 0.0, nz.b - 0.5) * 0.6);
  let ao = mix(0.62, 1.0, clamp(length(in.l.xz) / (2.5 * (1.0 - in.l.y / 9.0) + 0.5), 0.0, 1.0));
  var col = vec3f(0.05, 0.035, 0.028) * (0.5 + nz.a) * (light(n, in.k.y, 0.6, m.r * 2.0, 0.0) + G.ambientSky * 0.3);
  if (in.m.y < 11.0) {
    // soft snow mask (none on the needle tips); undersides keep a dark green floor and a sky / aurora rim
    let sn = smoothstep(0.12, 0.9, n.y * 0.7 + in.m.x * 0.5 + (nz.a - 0.5) * 0.9 + (nz.r - 0.5) * 0.5 - 0.6 * tip - 0.2 * smoothstep(50.0, 260.0, d));
    let rim = pow(1.0 - abs(dot(n, normalize(G.camPos - wp))), 3.0);
    let gr = vec3f(0.022, 0.05, 0.034) * (0.5 + nz.r) * (0.75 + 0.5 * fract(in.k.x * 7.3)) * (light(n, in.k.y, ao, m.r, 0.0) + G.ambientSky * 0.5)
      + vec3f(0.004, 0.011, 0.008) + (AURL * (0.025 * G.params.x) + G.ambientSky * 0.2) * rim;
    col = mix(gr, snow(n, wp, in.k.y, ao, vec4f(m.r * 0.5, 1.0, 0.0, 0.0)), sn);
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
  let mr = length(normalize(vec3f(vd.x + g.x * 0.06, -vd.y, vd.z + g.y * 0.06)) - vec3f(0.158, 0.069, -0.985));
  col += vec3f(1.0, 0.62, 0.6) * ((smoothstep(0.105, 0.09, mr) * (0.25 + 0.4 * r2.r) + 0.08 * exp(-mr * 9.0)) * F);
  let wI = 2.0 + 5.5 * ic2.a;
  let ice = smoothstep(-wI, -wI + 0.9, s + (ic.a - 0.5) * 1.2) * smoothstep(0.9, 1.2, distance(wp.xz, G.params2.xy) + ic.a * 0.3);
  if (ice > 0.0) {
    let m = vmap(wp.xz);
    let dust = smoothstep(0.3, 0.75, ic.r * 0.8 + ic2.r * 0.3 + 0.5 * smoothstep(-2.5, 0.0, s));
    let nI = normalize(vec3f((ic.g - 0.5) * 0.3, 1.0, (ic.b - 0.5) * 0.3));
    let bare = vec3f(0.1, 0.15, 0.2) * light(nI, 1.0, 1.0, m.r * 2.0, 0.0) + refl * 0.3;
    let dn = drift(vec3f(0.0, 1.0, 0.0), wp, d, 0.0);
    col = mix(col, mix(bare, snow(dn.xyz, wp, 1.0, dn.w, m), dust), ice);
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
  // power-law brightness: most cells are empty, a few stars are bright and a little larger
  let m = max(h2.x - 0.87, 0.0) * 7.7; let b0 = m * m;
  let r = max(K * px * (2.0 + 1.6 * b0), 0.03);
  let b = b0 * (0.8 + 0.2 * sin(G.time * (0.7 + 1.6 * h2.y) + h2.z * 40.0));
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
  c += (stars(rd, 36.0, px) * 3.4 + stars(rd, 80.0, px) * 1.5 * (1.0 + mw)) * ext;
  let mr = length(rd - G.sunDir);
  let mare = textureSampleLevel(NT, NS, (rd.xy - G.sunDir.xy) * 9.0 + 0.3, 1.0).a;
  c += vec3f(0.85, 0.92, 1.0) * ((1.0 - smoothstep(0.016, 0.016 + px * 3.0, mr)) * (1.5 + 0.9 * mare) + 0.05 * exp(-mr * 22.0) + 0.012 * exp(-mr * 5.0));
  return vec4f(c, 1.0);
}

// ---- aurora: tall folding curtains (one strip per ribbon), additive ----
struct AO { @builtin(position) pos: vec4f, @location(0) q: vec3f, @location(1) @interpolate(flat) r: f32 };
fn aurP(u: f32, r: f32) -> vec3f {
  let t = G.time;
  if (r > 4.5) {     // the sixth ribbon came down: a river of light from the shore out along the fjord
    let z = 34.0 - 110.0 * (u + 1.0);
    return vec3f(-5.5 + 3.2 * sin(z * 0.16 + t * 0.05) + 4.0 * sin(z * 0.023 - t * 0.04) * smoothstep(10.0, -30.0, z), 0.5 + 2.4 * (1.0 - exp(-max(z - 6.0, 0.0) / 14.0)), z);
  }
  let x = 17000.0 * (0.3 * u + 0.7 * u * u * u); let xk = x * 0.001;
  let k = 1.0 + 0.27 * r - 0.11 * r * r * 0.5;                     // every band folds at its own scale
  let env = 0.65 + 0.35 * sin(xk * 0.31 * k + r * 1.9 + t * 0.011);
  let a2 = xk * 2.6 * k - t * 0.043 + r * 4.3;
  let z = 900.0 - 1900.0 * pow(r, 1.5) - 0.00002 * x * x + 700.0 * sin(xk * 0.85 / k + t * 0.019 + r * 2.7) + 280.0 * env * sin(a2) + 70.0 * sin(xk * 7.3 * k + t * 0.08 + r * 1.3) + 260.0 * sin(xk * 1.2 * k + t * 0.013 + r * 5.1);
  return vec3f(x + 190.0 * env * cos(a2), 3200.0 + 350.0 * sin(xk * 0.6 + r * 5.0 + t * 0.027), z);
}
@vertex fn vsAur(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AO {
  let c = vi % 6u; let cx = f32(c == 1u || c == 4u || c == 5u); let cy = f32(c == 2u || c == 3u || c == 5u);
  let r = f32(ii);
  let u = (f32(vi / 6u) + cx) / 320.0 * 2.0 - 1.0;
  let p = aurP(u, r);
  let tg = aurP(u + 0.004, r) - p;
  let riv = step(4.5, r);
  let hgt = mix(3600.0 + 900.0 * sin(p.x * 0.0004 + r * 3.0), 3.0, riv);
  let w = p + vec3f(0.0, hgt, hgt * 0.28) * cy;
  var o: AO;
  o.pos = clip(w);
  // sheets seen edge-on are brighter (longer path through the glow); fade toward the ribbon ends
  // ...but fade where a sheet is exactly edge-on or right overhead, so no crease shows
  // angle between the view and the (tilted) sheet
  let vd = normalize(w - G.camPos);
  let sn = abs(dot(vd, normalize(cross(tg, vec3f(0.0, 1.0, 0.28)))));
  let up = vd.y;
  o.q = vec3f(mix(p.x * 0.001 * (1.0 + 0.19 * r), u * 30.0 - G.time * 0.03, riv), cy, (1.0 - 0.25 * riv) * min(1.0 / max(sn, 0.42), 2.4) * 0.42 * smoothstep(0.04, 0.5, sn) * (1.0 - 0.75 * smoothstep(0.8, 0.98, up)) * smoothstep(1.0, 0.7, abs(u)));
  o.r = r;
  return o;
}
@fragment fn fsAur(in: AO) -> @location(0) vec4f {
  let xk = in.q.x; let v = in.q.y; let r = in.r; let t = G.time;
  let ray = textureSample(NT, NS, vec2f(xk * 0.8 + t * 0.004 * (r - 2.5), r * 0.37 + v * 0.015)).a;
  let fine = textureSample(NT, NS, vec2f(xk * 3.1 - t * 0.011, r * 0.61 + v * 0.02)).a;
  let env = textureSample(NT, NS, vec2f(xk * 0.045 + t * 0.0016 + r * 0.21, r * 0.13 + t * 0.0006)).r;
  let rays = ray * 0.65 + fine * 0.35;
  let vb = v - 0.03 * env - 0.012 * ray;
  let prof = smoothstep(0.0, 0.13, vb) * (exp(-vb * 4.5) + 0.22 * (1.0 - v)) * pow(1.0 - v, 0.6);
  let pulse = 0.8 + 0.2 * sin(t * 0.07 + r * 2.4 + xk * 0.2);
  var I = smoothstep(0.33, 0.78, env) * (0.25 + 1.1 * rays * rays) * prof * in.q.z * G.params.x * pulse * 2.4;
  I = 2.4 * (1.0 - exp(-I / 2.4));
  var col = mix(AUR, mix(vec3f(1.0, 0.18, 0.52), vec3f(0.6, 0.2, 1.0), smoothstep(0.0, 0.2, vb)) * 1.3, (1.0 - smoothstep(0.02, 0.24, vb)) * (0.5 + 0.5 * fine));
  col = mix(col, vec3f(0.5, 0.2, 1.0) * 1.3, smoothstep(0.16, 0.7, v));
  return vec4f(col * I, 0.0);
}

// ---- light as matter: the whale that swims across the sky (instance w = 0) and the fish the chimney smoke turns into ----
struct HO { @builtin(position) pos: vec4f, @location(0) n: vec3f, @location(1) w: vec3f, @location(2) c: vec4f };
@vertex fn vsWh(@location(0) p0: vec3f, @location(1) n: vec3f, @location(3) a: vec4f) -> HO {
  let t = G.time; var p = p0; var c: vec3f; var vel: vec2f; var S = 240.0; var al = 0.75; var sp = 0.5; var tint = 0.0;
  if (a.w < 0.5) {
    let ang = t * 0.012 + 0.206;
    c = vec3f(sin(ang) * 800.0, 430.0 + 40.0 * sin(t * 0.05), -1000.0 - cos(ang) * 500.0); vel = vec2f(cos(ang) * 8.0, sin(ang) * 5.0);
  } else {
    let sd = fract(a.w); let age = fract(t / (34.0 + 30.0 * sd) + sd * 5.0); let dir = sd * 40.0 + age * 2.5;
    c = a.xyz + vec3f(sin(dir) * age * 16.0 + age * 6.0, 0.6 + age * 14.0 + sin(age * 9.0) * 0.8, cos(dir) * age * 16.0 + age * 4.0);
    vel = vec2f(sin(dir) + 2.5 * age * cos(dir), cos(dir) - 2.5 * age * sin(dir));
    S = 0.2 + 0.5 * smoothstep(0.0, 0.3, age); al = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age)) * 0.9; sp = 3.0; tint = 1.0 - age;
  }
  let k = (p.z + 0.7) * (p.z + 0.7);
  p.y += sin(p.z * 2.5 - t * sp + a.w * 9.0) * 0.07 * k;
  let R = rotY(atan2(-vel.x, -vel.y));
  var o: HO;
  o.w = c + R * (p * S); o.n = R * n; o.pos = clip(o.w);
  o.c = vec4f(mix(mix(AUR, vec3f(0.55, 0.3, 1.0), 0.5 + 0.5 * n.y), vec3f(1.0, 0.5, 0.25), tint), al);
  return o;
}
@fragment fn fsWh(in: HO) -> @location(0) vec4f {
  let rim = pow(1.0 - abs(dot(normalize(in.n), normalize(G.camPos - in.w))), 1.5);
  return vec4f(in.c.rgb * ((0.2 + 0.8 * rim) * in.c.a), 0.0);
}
