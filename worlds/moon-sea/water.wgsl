// The mirror: a plane at y = 0 that samples the planar reflection with a rippled normal.
@group(2) @binding(0) var reflT: texture_2d<f32>;

struct VO { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
  var o: VO;
  o.pos = G.viewProj * vec4f(G.camPos.x + cs[vi].x * 30000.0, 0.0, G.camPos.z + cs[vi].y * 30000.0, 1.0);
  return o;
}
// expanding ring: slope along the radius
fn ring(dv: vec2f, rad: f32, amp: f32, k: f32) -> vec2f {
  let d = length(dv) + 1e-4;
  let x = d - rad + 0.035 * snoise2(dv * 2.3 + rad);
  return dv / d * sin(x * k) * exp(-x * x * 26.0) * amp;
}
fn boxHit(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f) -> vec4f {   // xyz = normal, w = t (or -1)
  let inv = 1.0 / rd;
  let t0 = (c - h - ro) * inv; let t1 = (c + h - ro) * inv;
  let a = min(t0, t1); let b = max(t0, t1);
  let tn = max(max(a.x, a.y), a.z); let tf = min(min(b.x, b.y), b.z);
  if (tn > tf || tf < 0.0) { return vec4f(0.0, 0.0, 0.0, -1.0); }
  let n = -sign(rd) * step(vec3f(tn), a);
  return vec4f(n, max(tn, 0.0));
}
// mirrored door (the core draws the door, so its reflection is traced analytically: posts, lintel, leaf)
fn doorRefl(p: vec3f, r: vec3f, col: vec3f) -> vec3f {
  let cy = cos(U.door.z); let sy = sin(U.door.z);
  let q = p.xz - U.door.xy;
  let ro = vec3f(cy * q.x - sy * q.y, 0.0, sy * q.x + cy * q.y);
  let rd = vec3f(cy * r.x - sy * r.z, r.y, sy * r.x + cy * r.z) + vec3f(1e-5);
  var best = vec4f(0.0, 0.0, 0.0, 1e9);
  var h = boxHit(ro, rd, vec3f(-0.55, 1.08, 0.0), vec3f(0.07, 1.17, 0.08)); if (h.w >= 0.0 && h.w < best.w) { best = h; }
  h = boxHit(ro, rd, vec3f(0.55, 1.08, 0.0), vec3f(0.07, 1.17, 0.08)); if (h.w >= 0.0 && h.w < best.w) { best = h; }
  h = boxHit(ro, rd, vec3f(0.0, 2.15, 0.0), vec3f(0.72, 0.115, 0.11)); if (h.w >= 0.0 && h.w < best.w) { best = h; }
  // leaf, swung around the hinge at x = -0.48
  let ang = -U.misc.x * U.door.w * 1.745;
  let ca = cos(ang); let sa = sin(ang);
  let lo = ro - vec3f(-0.48, 0.0, 0.0);
  let lro = vec3f(ca * lo.x - sa * lo.z, lo.y, sa * lo.x + ca * lo.z);
  let lrd = vec3f(ca * rd.x - sa * rd.z, rd.y, sa * rd.x + ca * rd.z);
  h = boxHit(lro, lrd, vec3f(0.477, 1.03, 0.0), vec3f(0.477, 1.02, 0.024));
  if (h.w >= 0.0 && h.w < best.w) { best = vec4f(ca * h.x + sa * h.z, h.y, -sa * h.x + ca * h.z, h.w); }
  var c = col;
  // the open doorway glows with the next world
  if (U.door.w > 0.01) {
    let tz = -ro.z / rd.z; let hp = ro + rd * tz;
    if (tz > 0.0 && tz < best.w && abs(hp.x) < 0.48 && hp.y < 2.05) { c = mix(c, mix(vec3f(0.02, 0.05, 0.1), vec3f(0.05, 0.1, 0.14), hp.y * 0.5), smoothstep(0.0, 0.3, U.door.w)); best.w = min(best.w, 1e8); }
  }
  if (best.w < 1e7) {
    let n = vec3f(cy * best.x + sy * best.z, best.y, -sy * best.x + cy * best.z);
    let hp = p + r * best.w;
    let lh = ro + rd * best.w;
    let wood = vec3f(0.15, 0.1, 0.064) * (0.86 + 0.14 * sin(lh.x * 33.0));
    c = wood * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.2) + hemi(n, G.ambientSky, G.ambientGround) + lampLight(hp, n) + vec3f(0.07, 0.05, 0.035));
  }
  return c;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let uv = in.pos.xy * G.invResolution;
  let rd = viewRay(uv);
  if (rd.y > -1e-5) { discard; }
  let t = G.time;
  let dist = G.camPos.y / -rd.y;
  let p = G.camPos.xz + rd.xz * dist;
  let huv = (p - HMAP.xy) / HMAP.z + 0.5;
  var ht = vec2f(-0.075, -80.0);
  if (all(abs(huv - 0.5) < vec2f(0.5))) { ht = textureSampleLevel(hT, sLin, huv, 0.0).rg; }
  let depth = -ht.x;
  let alpha = smoothstep(0.0, 0.028, depth);
  if (alpha < 0.002) { discard; }

  // ---- surface slopes ----
  let breeze = 0.3 + 0.7 * smoothstep(-0.3, 0.6, snoise2(p * 0.021 + vec2f(t * 0.012, -t * 0.008)));
  let fa = 1.0 - smoothstep(2.5, 11.0, dist);
  let fb = 1.0 - smoothstep(8.0, 45.0, dist);
  let fc = 1.0 - smoothstep(60.0, 320.0, dist);
  // a slope shifts the mirror image by twice its angle; at grazing angles a wave covers very few pixels, so the
  // amplitude of each octave is limited to a fraction of its on-screen wavelength (no shredded reflections)
  let lim = 0.03 * G.camPos.y / (dist * dist);
  var sl = vec2f(0.0);
  if (fa > 0.0) { sl += snoise3d(vec3f(p * 1.9, t * 0.17)).xy * min(0.0011, lim * 0.5) * fa; }
  if (fb > 0.0) { sl += snoise3d(vec3f(p * 0.43 + 7.0, t * 0.11)).xy * min(0.0016, lim * 2.3) * fb; }
  sl += snoise3d(vec3f(p * vec2f(0.045, 0.11) - 3.0, t * 0.07)).xy * min(0.002, lim * 9.0) * fc;
  sl *= breeze;
  var rs = vec2f(0.0);   // rings: footsteps, soft random rings, the door posts
  // footsteps
  for (var i = 0; i < 12; i++) {
    let s = U.steps[i]; let age = t - s.z;
    if (age > 0.0 && age < 9.0) {
      rs += ring(p - s.xy, 0.12 + age * 0.5, min(0.003, lim * 0.18) * s.w * exp(-age * 0.55) * smoothstep(0.0, 0.25, age), 64.0);
    }
  }
  // rare soft rings, as if something small touched the surface from below
  {
    let cell = floor(p / 9.0);
    let h = hash3u(vec3u(vec2u(vec2i(cell) + 4096), 11u));
    let per = 14.0 + 12.0 * h.z;
    let age = fract(t / per + h.x * 7.0) * per;
    if (age < 7.0) {
      let c = (cell + 0.3 + 0.4 * h.xy) * 9.0;
      rs += ring(p - c, 0.1 + age * 0.42, min(0.003, lim * 0.22) * exp(-age * 0.45) * smoothstep(0.0, 0.3, age), 58.0) * (1.0 - smoothstep(20.0, 60.0, dist));
    }
  }
  // the door posts shed slow rings; its base darkens the water
  let cy = cos(U.door.z); let sy = sin(U.door.z);
  let dq = p - U.door.xy;
  let dl = vec2f(cy * dq.x - sy * dq.y, sy * dq.x + cy * dq.y);
  var contact = 1.0;
  let nearDoor = dot(dq, dq) < 400.0;
  if (nearDoor) {
    // one soft wave train leaves the whole threshold (a single source: no interference plaid)
    let pv = vec2f(sign(dl.x) * max(abs(dl.x) - 0.62, 0.0), dl.y);
    let d = length(pv) + 1e-4;
    let wd = vec2f(cy * pv.x + sy * pv.y, -sy * pv.x + cy * pv.y) / d;
    rs += wd * sin(d * 30.0 - t * 2.0 + 1.6 * snoise2(p * 1.7)) * min(0.0022, lim * 0.3) * exp(-d * 1.3) * smoothstep(0.03, 0.25, d);
    let bd = max(abs(dl.x) - 0.62, 0.0); let bz = max(abs(dl.y) - 0.1, 0.0);
    contact = (1.0 - 0.45 * exp(-(bd * bd + bz * bz) * 14.0)) * (1.0 - 0.6 * exp(-(bd * bd + bz * bz) * 260.0));
  }
  sl += rs;
  // shore swell: glowing crests roll in
  let s = ht.y;
  var bio = vec3f(0.0);
  if (s > -42.0) {
    let sd = normalize(p - vec2f(ISX, ISZ));
    let env = smoothstep(-36.0, -5.0, s) * smoothstep(1.2, -0.5, s);
    let al = snoise2(p * 0.03);
    // one crest every ~9 m, rolling shoreward: steep glowing front, long fading tail
    let x = fract(s * 0.11 - t * 0.075 + al * 0.4);
    let cr = select(exp(-(0.8 - x) * 13.0), exp(-(x - 0.8) * 50.0), x > 0.8);
    sl += sd * cr * min(0.02, lim * 6.0) * env;
    // plankton: sparks near the camera, a smooth sheen far away
    let v = voronoi2(p * 11.0);
    let sm = 0.5 + 0.4 * snoise2(p * 0.9 + vec2f(t * 0.1, 0.0));
    let tex = mix(exp(-v.x * v.x * 30.0) * v.z * v.z * 7.0 + 0.3 * sm, sm, smoothstep(4.0, 22.0, dist));
    let pat = 0.35 + 0.65 * smoothstep(-0.5, 0.4, snoise2(p * 0.05 + vec2f(0.0, t * 0.01)));
    bio = BIO * env * pat * (cr * (0.4 + 1.5 * smoothstep(-24.0, -1.0, s)) * (0.12 + tex) + 0.012);
    bio += BIO * smoothstep(0.03, 0.0, depth) * smoothstep(-2.0, 0.0, s) * 0.5 * tex;
  }
  let n = normalize(vec3f(-sl.x, 1.0, -sl.y));

  // ---- reflection ----
  var r = reflect(rd, n); r.y = abs(r.y) + 1e-4;
  let cl = G.viewProj * vec4f(r.x, -r.y, r.z, 0.0);
  var ruv = uv;
  if (cl.w > 1e-4) { ruv = vec2f(0.5 + 0.5 * cl.x / cl.w, 0.5 - 0.5 * cl.y / cl.w); }
  // keep the lookup on screen without a visible seam: the offset fades toward the borders
  let ed = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  ruv = mix(uv, ruv, smoothstep(0.0, 0.04, ed));
  var refl = textureSampleLevel(reflT, sLin, clamp(ruv, vec2f(0.001), vec2f(0.999)) * U.refl.xy, 0.0).rgb;
  if (nearDoor) { refl = doorRefl(vec3f(p.x, 0.0, p.y), r, refl); }

  // ---- shading ----
  let cosv = -rd.y;
  var F = mix(0.88, 1.0, pow(1.0 - cosv, 3.0));
  let shallow = smoothstep(0.06, 0.0, depth);
  F *= 1.0 - 0.55 * shallow;
  // the sand under a few centimetres of water
  let wv = fbm2(p * 0.21, 2);
  let ph2 = (p.x * 0.78 + p.y * 0.62) * 7.0 + wv * 5.0;
  let nf = 1.0 - smoothstep(6.0, 30.0, dist);
  var bed = vec3f(0.5, 0.47, 0.42) * 0.36 * (1.0 + 0.22 * sin(ph2) * nf) * (G.sunColor * 0.8 + G.ambientSky + 0.25 * lampLight(vec3f(p.x, 0.0, p.y), vec3f(0.0, 1.0, 0.0)));
  let sg = stepGlow(p);
  bed += BIO * sg * 0.5;
  var c = refl * F * vec3f(0.9, 0.95, 1.0) + bed * (1.0 - F);
  c *= contact;
  // moonlight catches the slopes that face the moon: rings and breeze ripples read as thin silver lines
  c += vec3f(0.42, 0.52, 0.75) * clamp(dot(rs, normalize(U.moon.xz)) * 16.0, -0.008, 0.1) * (1.0 - smoothstep(10.0, 40.0, dist));
  // moon glitter on the far, deeper water
  let md = normalize(U.moon.xz);
  let hd = normalize(rd.xz);
  let da = hd.x * md.y - hd.y * md.x;
  let fwd = step(0.0, dot(hd, md));
  let gl = exp(-da * da / (0.012 + 0.00002 * dist)) * fwd * smoothstep(35.0, 160.0, dist);
  let gn = snoise2(p * vec2f(0.5, 0.09) + vec2f(t * 0.25, t * 0.05)) * 0.5 + 0.5;
  let gn2 = snoise2(p * vec2f(0.19, 0.035) - vec2f(t * 0.11, 0.0)) * 0.5 + 0.5;
  c += vec3f(0.62, 0.74, 1.0) * gl * (0.05 + 0.75 * pow(gn, 3.0) * (0.3 + 0.7 * gn2)) * 0.55 * (1.0 - fc * 0.5);
  c += bio;
  // far water dissolves into the horizon glow of the sky right above it
  let fogc = skyBase(vec3f(hd.x, 0.0, hd.y));
  c = mix(c, fogc, 1.0 - exp(-dist * G.fogDensity * 0.8));
  return vec4f(c * alpha, alpha);
}
