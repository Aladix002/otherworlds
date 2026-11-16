// Sky, terrain (sand / rock / jungle floor / shell scutes / lava / pools), ocean, the turtle, instanced objects.

// ---------------- sky ----------------
struct SV { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SV { var o: SV; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fsSky(in: SV) -> @location(0) vec4f {
  let d = viewRay(in.uv);
  var c = mix(haze(d), sky(d), smoothstep(-0.004, 0.004, d.y));
  // the first stars, high and away from the afterglow
  let g = d.xz / (1.0 + max(d.y, 0.0)) * 46.0;
  let cell = floor(g); let h = hash22(cell);
  let dd = length(g - cell - 0.25 - 0.5 * h);
  let b = pow(fract(h.x * 7.31 + h.y), 12.0) * smoothstep(0.22, 0.6, d.y) * smoothstep(0.75, 0.2, dot(d, SUNV) * 0.5 + 0.5);
  c += vec3f(1.0, 0.92, 0.82) * exp(-dd * dd * 900.0) * b * 5.0 * (0.8 + 0.2 * sin(G.time * (0.6 + h.x) + h.y * 40.0));
  return vec4f(c, 1.0);
}

// warm light pooled around the hut lantern and the shrine's stone lantern
fn lamps(w: vec3f, n: vec3f) -> vec3f {
  let a = HUTL - w; let b = SHRL - w;
  return vec3f(1.0, 0.5, 0.16) * (max(dot(n, normalize(a)), 0.0) * 16.0 / (1.0 + dot(a, a) * 0.3) + max(dot(n, normalize(b)), 0.0) * 9.0 / (1.0 + dot(b, b) * 0.5));
}

// ---------------- terrain ----------------
struct TV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec4f };
@vertex fn vsTerr(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) m: vec4f) -> TV {
  var o: TV; o.w = p; o.n = n; o.m = m; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
fn lavaCol(ld: f32, al: f32, w: vec2f) -> vec3f {            // emissive of the flow at edge distance ld (negative inside)
  let lake = step(al, 0.01);
  let fl = mix(vec2f(al * 0.07 - G.time * 0.035, ld * 0.16) + w * 0.02, w * 0.045 + vec2f(G.time * 0.004, 0.0), lake);
  let cr = textureSampleLevel(detT, sR, fl, 0.0);
  let cr2 = textureSampleLevel(detT, sR, fl * 2.7 + vec2f(G.time * 0.01, 0.3), 0.0);
  let heat = smoothstep(0.1, -0.45, ld) * (1.0 - 0.45 * lake);
  let plate = smoothstep(0.5, 0.68, cr.b * 0.7 + mix(cr2.a, cr.b, lake) * 0.5 + (1.0 - heat) * 0.35);
  let hot = mix(vec3f(7.0, 1.5, 0.16), vec3f(13.0, 5.5, 1.3), heat * cr2.b) * (0.75 + 0.25 * sin(G.time * 0.7 + al * 0.4));
  return mix(hot, vec3f(0.5, 0.05, 0.01) * (0.4 + cr.a), plate) * smoothstep(0.12, -0.05, ld);
}
@fragment fn fsTerr(in: TV) -> @location(0) vec4f {
  let w = in.w; var n = normalize(in.n);
  let m = msk(w.xz);
  let t1 = textureSample(detT, sR, w.xz * 0.31);
  let t2 = textureSample(detT, sR, w.xz * 0.043 + vec2f(0.37, 0.11));
  let tf = textureSample(detT, sR, w.xz * 1.9 + vec2f(0.21, 0.63));
  let zx = step(abs(n.x), abs(n.z));
  let ts = mix(textureSample(detT, sR, w.zy * 0.23), textureSample(detT, sR, w.xy * 0.23), zx);
  let steep = smoothstep(0.22, 0.55, 1.0 - n.y);
  let ao = in.m.x; let shell = smoothstep(0.3, 0.7, in.m.y + (t2.b - 0.5) * 0.3);
  let sand = in.m.z * (1.0 - steep) * (1.0 - shell);
  let veg = smoothstep(0.3, 0.6, in.m.w + (t2.b - 0.5) * 0.6) * (1.0 - steep * 0.7);
  let V = normalize(G.camPos - w);

  // albedo
  var alb = mix(vec3f(0.028, 0.025, 0.026), vec3f(0.085, 0.07, 0.062), ts.b * 0.7 + t2.b * 0.3);
  alb = mix(alb, mix(vec3f(0.035, 0.026, 0.026), vec3f(0.1, 0.05, 0.036), t2.b) * (0.4 + 0.7 * t1.b + 0.6 * tf.b), smoothstep(22.0, 34.0, w.y + t2.b * 6.0));
  let ra = dot(w.xz, vec2f(0.6, 2.9)) * 2.4 + t2.b * 16.0 + t1.b * 3.0; let rip = sin(ra);
  alb = mix(alb, vec3f(0.036, 0.035, 0.04) * (0.62 + 0.2 * t1.b + 0.55 * tf.b * tf.a + 0.07 * rip), sand);
  // hatchling tracks from the nest to the water
  let tr = w.xz - NESTP; let ta = dot(tr, vec2f(0.12, -0.993)); let tl = dot(tr, vec2f(0.993, 0.12));
  let tk = clamp(round(tl / (0.55 * smoothstep(0.0, 4.0, ta) + 0.01)), -3.0, 3.0);
  let td = abs(tl - tk * 0.55 * smoothstep(0.0, 4.0, ta) - 0.3 * sin(ta * 0.6 + (tk + 3.0) * 2.0));
  let trk = smoothstep(0.05, 0.02, abs(td - 0.075)) * smoothstep(-0.2, 0.3, sin(ta * 34.0)) * step(0.3, ta) * step(ta, 30.0) * sand;
  alb *= 1.0 - 0.45 * trk;
  alb = mix(alb, mix(vec3f(0.012, 0.04, 0.01), vec3f(0.06, 0.1, 0.02), t2.b) * (0.4 + 0.6 * t1.b + 0.7 * tf.a), veg);
  // shell scutes: horn-brown plates with growth rings and a paler areola, dark wet seams, barnacle crust
  let hx = hexd(w.xz / HEX);
  let t3 = textureSample(detT, sR, w.xz * 0.13 + vec2f(0.7, 0.2));
  let rp0 = hx.z * 120.0 + (t3.b - 0.5) * 9.0;
  let ring = 0.5 + 0.5 * sin(rp0);
  var sc = mix(vec3f(0.032, 0.02, 0.012), vec3f(0.17, 0.095, 0.035), ring * 0.3 + t3.b * 0.45 + hx.w * 0.25) * (0.55 + 0.9 * smoothstep(0.1, 0.45, hx.z)) * (0.6 + 0.8 * t1.b);
  sc = mix(sc, vec3f(0.035, 0.06, 0.03), smoothstep(0.5, 0.75, t2.b) * 0.5);
  sc = mix(sc, vec3f(0.3, 0.28, 0.24), smoothstep(0.2, 0.1, t1.a) * smoothstep(0.55, 0.7, t3.a));
  let seam = smoothstep(0.03, 0.008, hx.z);
  alb = mix(alb, sc * (1.0 - 0.6 * seam), shell);

  // detail normal
  let dT = (t1.rg - 0.5) * 1.1 + (t2.rg - 0.5) * 0.9 + (tf.rg - 0.5) * 0.7;
  let dS = (ts.rg - 0.5) * 2.2;
  var dn = (vec3f(dT.x, 0.0, dT.y) + vec3f(0.04, 0.0, 0.2) * cos(ra) * sand * smoothstep(0.3, 0.7, t2.a + 0.2)) * (1.0 - steep) + mix(vec3f(0.0, dS.y, dS.x), vec3f(dS.x, dS.y, 0.0), zx) * steep + vec3f(dT.x, 0.0, dT.y) * smoothstep(20.0, 30.0, w.y);
  let hd = normalize(hx.xy + 1e-4);
  dn += vec3f(hd.x, 0.0, hd.y) * (1.6 * smoothstep(0.08, 0.0, hx.z) + 0.3 * cos(rp0)) * shell;
  n = normalize(n + dn * mix(1.0, 0.45, veg));

  // pools: hot springs (milky turquoise, sinter rim) and tide pools (clear, dark)
  let pool = smoothstep(0.12, -0.12, m.b);
  let hotp = step(m.g, -0.5);
  let rim = smoothstep(0.9, 0.1, abs(m.b - 0.35)) * step(-0.2, m.b);
  alb = mix(alb, mix(vec3f(0.05, 0.07, 0.05), vec3f(0.42, 0.4, 0.34), hotp), rim * (0.5 + 0.5 * t1.b));
  let pd = clamp(-m.b, 0.0, 2.0);
  let pcol = mix(mix(alb * 0.6, vec3f(0.006, 0.02, 0.022), smoothstep(0.0, 1.2, pd)), mix(vec3f(0.1, 0.42, 0.4), vec3f(0.03, 0.2, 0.26), smoothstep(0.0, 1.6, pd)), hotp);

  // wetness near the waterline: darker, mirror-like
  let wet = max(smoothstep(0.95, 0.1, w.y + t2.b * 0.35) * (1.0 - veg), pool);
  alb = mix(alb, alb * 0.55, wet * (1.0 - pool));
  var col = shade(mix(alb, pcol, pool), mix(n, vec3f(0.0, 1.0, 0.0), pool), mix(ao, 1.0, pool * 0.5)) + alb * lamps(w, n);
  // glints of the afterglow in the sand, sheen on the shell
  let hv = normalize(G.sunDir + V);
  col += G.sunColor * (pow(max(dot(n, hv), 0.0), 40.0) * (shell * 0.12 + wet * 0.4) + sand * 3.0 * smoothstep(0.86, 1.0, tf.a) * smoothstep(0.55, 0.9, tf.b + t1.b * 0.3) * pow(max(dot(n, hv), 0.0), 6.0));
  let rp = textureSample(detT, sR, w.xz * 0.9 + vec2f(G.time * 0.02, G.time * 0.013)).rg - 0.5;
  let nr = normalize(mix(n, vec3f(rp.x * 0.25, 1.0, rp.y * 0.25), max(pool, wet * 0.6)));
  var R = reflect(-V, nr); R.y = abs(R.y) + 0.02;
  let fr = fresnelSchlick(dot(nr, V), 0.03);
  col = mix(col, sky(normalize(R)), fr * max(max(pool, wet * 0.85), shell * 0.35));

  // lava: hot core, drifting crust plates, light pooled on the ground around it
  let glow = exp(-max(m.r, 0.0) * 0.8) + 0.3 * pow(max(1.0 - m.r / 10.0, 0.0), 2.0);
  col += vec3f(1.8, 0.42, 0.06) * glow * (alb * 5.0 + 0.01) * (0.85 + 0.15 * sin(G.time * 0.9 + m.g * 0.3)) * max(dot(n, vec3f(0.0, 1.0, 0.0)), 0.3);
  col = mix(col, lavaCol(m.r, m.g, w.xz), smoothstep(0.12, -0.05, m.r));
  // underwater: the sea swallows light with depth
  col *= exp(min(w.y, 0.0) * vec3f(0.5, 0.3, 0.25));
  return vec4f(fog(col, w), 1.0);
}

// ---------------- ocean ----------------
struct WV { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsWater(@location(0) p: vec3f) -> WV {
  var o: WV; var w = p;
  let depth = -msk(w.xz).a;
  w.y = swell(w.xz).x * clamp(depth * 0.3, 0.3, 1.0) * smoothstep(3000.0, 600.0, length(w.xz));
  o.w = w; o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
@fragment fn fsWater(in: WV) -> @location(0) vec4f {
  let w = in.w; let p = w.xz;
  let m = msk(p);
  let depth = w.y - m.a;
  let q = p - vec2f(0.0, G.params.x);
  let t = G.time;
  let V0 = G.camPos - w; let dist = length(V0); let V = V0 / dist;
  let d3 = textureSample(detT, sR, mat2x2f(0.47, -0.88, 0.88, 0.47) * q * 0.0113 + vec2f(0.4, t * 0.002));
  let wq = q + (d3.rg - 0.5) * 9.0;                        // warp the finer layers so their tiling never lines up
  let d1 = textureSample(detT, sR, wq * 0.19 + vec2f(t * 0.012, t * 0.02));
  let d2 = textureSample(detT, sR, mat2x2f(0.8, 0.6, -0.6, 0.8) * wq * 0.053 + vec2f(-t * 0.006, t * 0.009));
  let sw = swell(p);
  let calm = clamp(depth * 0.3, 0.3, 1.0);
  var g = sw.yz * calm + ((d1.rg - 0.5) * 0.4 + (d2.rg - 0.5) * 0.5 + (d3.rg - 0.5) * 0.45) / (1.0 + dist * 0.0018);                      // calm the far field: no shimmer at the horizon
  let n = normalize(vec3f(-g.x, 1.0, -g.y));
  var R = reflect(-V, n); R.y = abs(R.y) + 0.015; R = normalize(R);
  let fr = fresnelSchlick(max(dot(n, V), 0.0), 0.025);
  var refl = sky(R);
  // soft dark reflection of the turtle's head on the water
  let hc = headW(vec3f(0.0, EYE.y, EYE.z), 0.83);
  let oc = hc - w; let tc = dot(oc, R); let miss = length(oc - R * tc);
  refl *= 1.0 - 0.75 * smoothstep(21.0, 9.0, miss) * step(0.0, tc) * smoothstep(-6.0, 6.0, hc.y);
  // body colour: deep indigo-teal, lighter over the shallows
  let scat = vec3f(0.006, 0.03, 0.045) + vec3f(0.02, 0.08, 0.075) * exp(-max(depth, 0.0) * 0.35);
  var col = mix(scat, refl * 0.9, fr);
  // long glitter path of the afterglow
  let sp = max(dot(R, SUNV), 0.0);
  col += vec3f(2.4, 0.9, 0.3) * (pow(sp, 500.0) * 4.0 + pow(sp, 60.0) * 0.35) * smoothstep(0.0, 0.5, d1.b + d2.b - 0.4);

  // foam: swash at the shore, streaks carried past by the flow, the wake behind, churn where the flippers work
  let fn1 = textureSample(detT, sR, wq * 0.11 + vec2f(0.0, t * 0.01));
  let fn2 = textureSample(detT, sR, mat2x2f(0.9, -0.44, 0.44, 0.9) * q * 0.027);
  let web = 1.0 - abs(fn1.b - d1.b) * 3.5;                 // thin foam webbing where two drifting fields meet
  let lace = smoothstep(0.55, 0.95, web);
  let shore = smoothstep(1.1, 0.0, depth) * smoothstep(0.3, 0.9, web + 0.35 * sin(depth * 7.0 - t * 0.6 + fn2.b * 6.0) - depth * 0.3)
            + smoothstep(0.1, 0.01, depth);
  let e = length(p / vec2f(128.0, 160.0));
  let hull = smoothstep(1.35, 1.0, e) * smoothstep(0.9, 1.05, e) * lace * smoothstep(0.35, 0.7, fn2.b + 0.3 * smoothstep(-0.2, 1.0, p.y / 160.0));
  let zb = p.y - 120.0;
  let arm = abs(abs(p.x) - (96.0 + zb * 0.36));
  let wake = smoothstep(-30.0, 60.0, zb) * exp(-max(zb, 0.0) / 700.0)
           * (smoothstep(26.0 + zb * 0.06, 0.0, arm) * 0.9 + smoothstep(100.0 + zb * 0.3, 20.0, abs(p.x)) * 0.5) * max(lace, smoothstep(0.55, 0.8, fn2.b));
  let fc = flipW(vec3f(0.6, 0.0, 0.1), 1.0, 0.0);
  let fd = length(vec2f(abs(p.x), p.y) - fc.xz);
  let churn = smoothstep(62.0, 12.0, fd) * smoothstep(16.0, 2.0, abs(fc.y)) * max(lace, smoothstep(0.45, 0.75, fn2.b));
  let foam = clamp(max(max(shore, hull * 0.25), max(wake, churn)), 0.0, 1.0);
  let fcol = (G.ambientSky * 1.6 + G.sunColor * 0.5 + haze(-V) * 0.35) * (0.55 + 0.45 * fn1.b);
  col = mix(col, fcol, foam * 0.9);
  // lava entering the sea: the water glows from below
  let lg = exp(-max(m.r, 0.0) * 0.45) * smoothstep(-0.3, 0.3, depth);
  col += vec3f(3.5, 0.8, 0.1) * lg * (0.6 + 0.4 * fn1.b) * (1.0 - foam * 0.6);

  let a = clamp(max(max(1.0 - exp(-depth * 1.4), fr), foam), 0.0, 1.0) * smoothstep(0.0, 0.05, depth);
  return vec4f(fog(col, w), a);
}

// ---------------- the turtle: flippers (4 instances) and head ----------------
struct UV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) l: vec3f, @location(4) k: f32 };
@vertex fn vsFlip(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> UV {
  let side = 1.0 - 2.0 * f32(ii & 1u); let rear = f32(ii >> 1u);
  var o: UV; o.w = flipW(p, side, rear);
  let nn = flipM(rear) * n; o.n = vec3f(nn.x * side, nn.y, nn.z);
  o.uv = uv * vec2f(26.0, 20.0) * mix(1.0, 0.6, rear); o.l = p; o.k = 0.0;
  o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
@vertex fn vsHead(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> UV {
  var o: UV; o.w = headW(p, uv.x); o.n = headR(uv.x) * n; o.uv = uv * vec2f(22.0, 26.0); o.l = p; o.k = 1.0;
  o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
@fragment fn fsSkin(in: UV) -> @location(0) vec4f {
  var n = normalize(in.n);
  let V = normalize(G.camPos - in.w);
  // plated skin: dark olive scales with pale seams; cream underside
  let vo = voronoi2(in.uv);
  let seam = smoothstep(0.2, 0.03, vo.y - vo.x);
  let under = smoothstep(0.1, -0.5, normalize(in.n).y) * (1.0 - in.k * 0.5);
  var alb = mix(vec3f(0.014, 0.024, 0.018), vec3f(0.05, 0.06, 0.03), vo.z) * (0.6 + 0.6 * smoothstep(0.0, 0.5, vo.x));
  alb = mix(alb, vec3f(0.13, 0.125, 0.075), seam * 0.6);
  alb = mix(alb, alb * 1.6 + vec3f(0.03, 0.028, 0.018), under);
  n = normalize(n + (textureSample(detT, sR, in.uv * 0.6).rgg - 0.5) * 0.5);
  // the eye: a calm dark globe with a slow blink
  var gl = 0.5;
  if (in.k > 0.5) {
    let ep = vec3f(abs(in.l.x), in.l.y, in.l.z) - EYE;
    let ed = length(ep * vec3f(0.45, 1.0, 1.0)) / 0.026;
    let lid = smoothstep(0.985, 1.0, sin(G.time * 0.35 + 1.0)) * 2.4 - 1.2;
    let eye = smoothstep(1.0, 0.85, ed) * smoothstep(lid - 0.1, lid + 0.1, -ep.y / 0.026);
    alb = mix(alb, vec3f(0.22, 0.2, 0.12), smoothstep(1.7, 1.0, ed) * 0.7);
    alb = mix(alb, mix(vec3f(0.006, 0.005, 0.004), vec3f(0.1, 0.055, 0.02), smoothstep(0.45, 0.9, ed)), eye);
    gl = mix(gl, 1.0, eye);
  }
  let wetl = smoothstep(26.0, 0.0, in.w.y);                 // freshly out of the water
  var col = shade(alb * mix(1.0, 0.7, wetl), n, 0.55 + 0.45 * smoothstep(-2.0, 14.0, in.w.y));
  var R = reflect(-V, n); R.y = abs(R.y) + 0.03;
  let fr = fresnelSchlick(max(dot(n, V), 0.0), 0.04);
  col = mix(col, sky(normalize(R)), fr * gl * (0.15 + 0.35 * wetl));
  col += G.sunColor * pow(max(dot(n, normalize(G.sunDir + V)), 0.0), mix(40.0, 300.0, gl - 0.5)) * gl * 0.9;
  return vec4f(fog(col, in.w), 1.0);
}

// ---------------- instanced objects ----------------
// materials: 0 wood, 1 frond, 2 canopy, 3 basalt column, 4 boulder, 5 hut wall, 6 thatch, 7 warm light, 8 cloth,
//            9 bird, 10 crab, 11 starfish, 12 baby turtle, 13 dolphin / whale, 14 red lacquer, 15 stone
struct OV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
            @location(3) l: vec3f, @location(4) @interpolate(flat) ti: vec3f };
@vertex fn vsObj(@location(0) p0: vec3f, @location(1) n0: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> OV {
  let mat = floor(uv.y); let al = fract(uv.y) / 0.9;
  var p = p0; var n = n0;
  let creature = mat > 8.5 && mat < 13.5;
  let ph = b.w;
  if (mat == 9.0) {                       // wings: slow flap + glide dihedral
    let s = abs(uv.x);
    p.y += s * (0.12 + sin(ph) * 0.42 * (0.4 + 0.6 * s)) * 1.15; p.z += s * s * cos(ph) * 0.05;
  } else if (mat == 10.0) { p.y += abs(uv.x) * 0.012 * sin(ph * 9.0 + uv.x * 1.6) * step(0.9, abs(uv.x)); }
  else if (mat == 12.0) {
    let s = sign(uv.x) * step(0.9, abs(uv.x));
    p.z += s * sign(p.x) * 0.02 * sin(ph); p.y += abs(s) * 0.008 * max(cos(ph + s), 0.0);
  } else if (mat == 13.0) { p.y += 0.1 * sin(ph + p.z * 0.9) * p.z * step(p.z, 2.0) * step(0.2, abs(p.z)) * 0.4; }
  var R = rotY(b.x);
  var s3 = vec3f(a.w);
  if (creature) { R = R * rotX(b.z); } else { s3.y *= b.z; }
  var w = a.xyz + R * (p * s3);
  if (mat == 1.0) {                       // fronds sway in the breeze
    let k = al * al * a.w;
    w += vec3f(0.12, -0.03, 0.2) * k * (sin(G.time * 0.8 + a.x * 0.7 + al * 2.0) + 0.5 * sin(G.time * 1.9 + a.z + al * 5.0));
  } else if (mat == 8.0) { w += vec3f(0.1, 0.0, 0.05) * uv.x * sin(G.time * 0.7) ; w.y += 0.03 * uv.x * sin(G.time * 1.3); }
  var o: OV; o.w = w; o.n = R * normalize(n / s3); o.uv = uv; o.l = p * s3;
  o.ti = vec3f(b.y, exp(-max(msk(a.xz).r, 0.0) * 0.45), b.w);
  o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
@fragment fn fsObj(in: OV, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let mat = i32(floor(in.uv.y)); let al = fract(in.uv.y) / 0.9; let u = in.uv.x; let tint = in.ti.x;
  var n = normalize(in.n);
  let w = in.w; let V = normalize(G.camPos - w);
  let tp = textureSample(detT, sR, in.l.xz * 0.6 + in.l.y * vec2f(0.37, 0.53) + tint * 7.0);
  let fw = fwidth(al);
  let side = textureSample(detT, sR, vec2f(in.l.x + in.l.z, in.l.y) * 0.45 + tint * 3.0);
  var fc = normalize(cross(dpdy(w), dpdx(w))); fc = fc * sign(dot(fc, V) + 1e-6);
  var alb = vec3f(0.1); var ao = 1.0; var emis = vec3f(0.0); var spec = 0.0; var wrap = 0.0;
  if (mat == 1) {
    let x = abs(u - 0.5) * 2.0;
    let comb = abs(fract(al * 26.0 + x * 1.3) - 0.5) * 2.0;
    if (x > 0.16 && comb > mix(0.62, 0.25, smoothstep(0.02, 0.05, fw * 26.0)) && fw < 0.03) { discard; }
    n = n * select(-1.0, 1.0, ff);
    alb = mix(vec3f(0.022, 0.055, 0.014), vec3f(0.075, 0.115, 0.025), tint) * (0.55 + 0.6 * al) * mix(1.0, 0.75, x);
    ao = 0.45 + 0.55 * al; wrap = 0.5;
  } else if (mat == 2) {
    alb = mix(vec3f(0.01, 0.035, 0.012), vec3f(0.05, 0.095, 0.02), tp.b * 0.7 + tint * 0.3) * (0.4 + 1.2 * tp.a);
    n = normalize(n + vec3f(tp.r - 0.5, 0.0, tp.g - 0.5) * 1.6);
    ao = 0.25 + 0.75 * smoothstep(-0.7, 0.8, normalize(in.n).y); wrap = 0.6;
    if (abs(dot(normalize(in.n), V)) < 0.2 + 0.5 * tp.a && tp.b > 0.42) { discard; }
  } else if (mat == 3 || mat == 4 || mat == 15) {
    if (mat == 3) { n = fc; }
    let top = smoothstep(0.5, 0.8, n.y);
    alb = mix(vec3f(0.03, 0.028, 0.03), vec3f(0.095, 0.085, 0.08), mix(side.b, tp.b, top)) * (0.7 + 0.5 * tint);
    if (mat == 4 && u > 0.5) { alb = vec3f(0.024, 0.024, 0.028) * (0.6 + 0.8 * tp.b); }
    if (mat == 15) { alb = mix(vec3f(0.13, 0.125, 0.115), vec3f(0.05, 0.085, 0.035), smoothstep(0.45, 0.75, tp.b + n.y * 0.2)); }
    n = normalize(n + vec3f(side.r - 0.5, (tp.g - 0.5) * 0.5, side.g - 0.5) * 1.1);
    alb = mix(alb, vec3f(0.045, 0.075, 0.03), top * smoothstep(0.5, 0.75, tp.a) * 0.6 * f32(mat == 3));
    ao = mix(0.55, 1.0, smoothstep(0.0, 1.2, in.l.y)); spec = 0.25;
    if (mat == 3) { ao = 0.3 + 0.7 * smoothstep(in.ti.z - 2.2, in.ti.z, in.l.y); alb *= 0.8 + 0.25 * sin(in.l.y * 2.3 + tint * 20.0); }
  } else if (mat == 0) {
    alb = mix(vec3f(0.05, 0.036, 0.026), vec3f(0.14, 0.105, 0.07), tp.b * 0.6 + u * 0.4) * (0.8 + 0.4 * tp.a);
  } else if (mat == 5) {
    alb = vec3f(0.13, 0.095, 0.06) * (0.6 + 0.4 * step(0.25, fract(w.y * 5.0))) * (0.7 + 0.6 * tp.b);
  } else if (mat == 6) {
    alb = mix(vec3f(0.1, 0.075, 0.04), vec3f(0.24, 0.19, 0.1), tp.b) * (0.65 + 0.35 * sin(w.y * 40.0 + tp.a * 9.0)); wrap = 0.3;
  } else if (mat == 7) {
    emis = vec3f(5.0, 2.3, 0.6) * (0.85 + 0.15 * sin(G.time * 2.3 + w.x) * sin(G.time * 3.7)) * mix(0.6, 1.3, u);
  } else if (mat == 8) {
    alb = mix(vec3f(0.45, 0.38, 0.28), vec3f(0.5, 0.16, 0.1), step(0.5, fract(al * 9.0)) * step(u, 2.0) * f32(u > 0.001));
    n = n * select(-1.0, 1.0, ff); wrap = 0.5;
  } else if (mat == 9) {
    alb = mix(vec3f(0.5, 0.48, 0.46), vec3f(0.035, 0.035, 0.04), smoothstep(0.55, 0.8, abs(u)));
    n = n * select(-1.0, 1.0, ff); wrap = 0.4;
  } else if (mat == 10) {
    alb = mix(vec3f(0.5, 0.11, 0.035), vec3f(0.7, 0.3, 0.1), tp.b) * select(1.0, 0.1, abs(u - 0.5) < 0.01); spec = 0.5;
  } else if (mat == 11) {
    alb = mix(vec3f(0.6, 0.2, 0.05), vec3f(0.42, 0.12, 0.3), tint) * (0.6 + 0.6 * tp.a);
  } else if (mat == 12) {
    let hx = hexd(in.l.xz * 26.0);
    alb = mix(vec3f(0.035, 0.05, 0.04), vec3f(0.11, 0.1, 0.06), smoothstep(0.0, 0.2, hx.z)) * mix(1.0, 0.8, f32(abs(u) > 0.1)); spec = 0.3;
  } else if (mat == 13) {
    alb = mix(vec3f(0.3, 0.3, 0.3), vec3f(0.035, 0.05, 0.07), smoothstep(-0.5, 0.3, n.y)); spec = 1.0;
  } else if (mat == 14) {
    alb = vec3f(0.42, 0.045, 0.025) * (0.7 + 0.5 * tp.b);
  }
  var col = alb * (G.sunColor * wrapDiffuse(n, G.sunDir, 0.4 + wrap) * mix(0.5, 1.0, ao) + (hemi(n, G.ambientSky, G.ambientGround) + vec3f(0.1, 0.07, 0.16) * (0.5 - 0.5 * dot(n.xz, SUNH))) * ao);
  col += alb * (vec3f(4.0, 0.9, 0.12) * in.ti.y * (0.8 + 0.5 * max(-n.y, 0.0)) + lamps(w, n));
  if (spec > 0.0) {
    var R = reflect(-V, n); R.y = abs(R.y) + 0.03;
    col = mix(col, sky(normalize(R)), fresnelSchlick(max(dot(n, V), 0.0), 0.04) * spec * 0.6);
    col += G.sunColor * pow(max(dot(n, normalize(G.sunDir + V)), 0.0), 80.0) * spec * 0.6;
  }
  return vec4f(fog(col + emis, w), 1.0);
}
