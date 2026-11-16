// The floating door islet. uv.x = material: 0 rock, 1 crystal (uv.y = hue), 2 drifting debris (uv.y = phase),
// 3 glowing root (uv.y = t along), 5 curled tendril (uv.y = t), 6 grass blade (uv.y = t), 7 worked stone step (uv.y = seed).
// `CL` (crystal cluster lights, xyz + hue) is prepended by world.js.
override DX: f32 = 0.0;
override DY: f32 = -2.0;
override DZ: f32 = 26.0;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) o: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO;
  var w = p;
  let t = G.time;
  var nn = n;
  if (uv.x > 7.5) {                    // crystal ring: turns slowly about its axis, every shard bobbing on its own
    let q = quatAxisAngle(RA, t * 0.02);
    w = RC + quatRotate(q, p - RC) + RA * 0.3 * sin(t * 0.3 + uv.y * 90.0);
    nn = quatRotate(q, n);
  }
  if (uv.x > 1.5 && uv.x < 2.5) { w.y += 0.3 * sin(t * 0.31 + uv.y) + 0.15 * sin(t * 0.17 + uv.y * 2.3); }
  if (uv.x > 4.5 && uv.x < 6.5) {      // tendrils and grass breathe in a slow current
    let k = uv.y * uv.y * select(0.05, 0.025, uv.x < 5.5);
    w.x += (sin(t * 0.7 + p.x * 3.0 + p.z * 2.0) + 0.5 * sin(t * 0.43 + p.z * 5.0)) * k;
    w.z += cos(t * 0.53 + p.z * 3.3 + p.x) * k;
  }
  o.w = w; o.n = nn; o.uv = uv; o.o = p; o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
fn aoGlowCol(h: f32) -> vec3f { return mix(vec3f(0.25, 0.75, 1.4), vec3f(0.95, 0.4, 1.4), h); }

fn aoBox2(p: vec2f, b: vec2f) -> f32 { let q = abs(p) - b; return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0); }

@fragment fn fs(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let ty = in.uv.x;
  let t = G.time;
  var n = normalize(in.n);
  let Vv = G.camPos - in.w;
  let dist = length(Vv);
  let V = Vv / dist;
  let nd = abs(dot(n, V));
  let fr = 1.0 - nd;
  let fres = fr * fr * fr;
  let loc = in.w - vec3f(DX, DY, DZ);

  // light spilled by the crystal clusters
  var spill = vec3f(0.0);
  var cao = 1.0;
  for (var i = 0; i < 4; i++) {
    let dv = CL[i].xyz - in.w;
    let d2 = dot(dv, dv);
    spill += aoGlowCol(CL[i].w) * (0.3 + 0.7 * max(dot(n, dv) * inverseSqrt(d2 + 1e-4), 0.0)) / (1.0 + d2 * 6.0);
    cao *= mix(0.5, 1.0, smoothstep(0.02, 0.3, d2));
  }

  if ((ty > 0.5 && ty < 1.5) || ty > 7.5) {          // crystal: light held inside, brighter toward the tip, a hard bright edge
    let base = aoGlowCol(in.uv.y);
    let band = 0.85 + 0.15 * sin(dot(in.o, vec3f(9.0, 31.0, 7.0)));
    var c = base * (0.12 + 0.85 * nd * nd * band + 0.25 * pow(nd, 8.0));
    c += mix(base, vec3f(1.0), 0.6) * (pow(fr, 2.5) * 1.5 + pow(fr, 8.0) * 2.0);
    c += litSpec(vec3f(0.03), n, in.w, 80.0, 1.2);
    return vec4f(c, 1.0);
  }
  if (ty > 4.5) {
    if (ty < 6.5) {                    // tendrils and grass: dark at the root, light at the tip
      let tt = in.uv.y;
      let hue = hash21(floor(in.o.xz * 1.3 + 40.0));
      let col = mix(vec3f(0.2, 0.95, 0.75), mix(vec3f(0.3, 0.7, 1.4), vec3f(0.95, 0.4, 1.3), step(0.75, hue)), step(0.45, hue));
      let pul = 0.8 + 0.2 * sin(t * 0.5 + hue * 30.0);
      var c = col * (0.012 + 0.75 * pow(tt, 2.4) * pul) * select(1.0, 1.4, ty < 5.5);
      c += vec3f(0.01, 0.02, 0.02) + spill * 0.03;
      c *= mix(0.35, 1.0, smoothstep(0.0, 0.3, tt));
      return vec4f(applyFog(c, in.w), 1.0);
    }
  }
  if (ty > 2.95 && ty < 3.95) {        // roots: dark bark threaded with strands of light that pulse slowly toward the door
    let tt = in.uv.y;
    let ang = (ty - 3.0) / 0.9;
    let bark = vec3f(0.012, 0.01, 0.02) * (0.6 + 0.6 * vnoise3(in.o * vec3f(16.0, 16.0, 16.0)));
    var c = litSpec(bark, n, in.w, 12.0, 0.05) * cao + bark * spill * 4.0;
    let strand = pow(0.5 + 0.5 * cos(ang * TAU * 2.0 + tt * 5.0), 5.0);
    let pul = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(tt * 7.0 - t * 0.45 + in.o.x * 1.3), 3.0);
    let gc = mix(vec3f(0.2, 0.85, 1.1), vec3f(0.6, 0.45, 1.3), 0.5 + 0.5 * sin(in.o.z * 1.7 + in.o.x));
    c += gc * strand * 0.55 * pul + gc * pow(fr, 3.0) * 0.06 * pul;
    return vec4f(applyFog(c, in.w), 1.0);
  }

  // ---- stone ----
  let q = in.o;
  let step7 = ty > 6.5;
  let g1 = snoise3d(q * 1.7 + 3.0);
  let g2 = snoise3d(q * 6.1 + 11.0);
  let g3 = snoise3d(q * 23.0);
  let lodf = smoothstep(26.0, 5.0, dist);          // finest grain only up close
  // broad tone + fine grain; the mid octave is kept low (its contours read as worm tracks up close)
  let hv = g1.w * 0.5 + g2.w * 0.18 + g3.w * 0.42 * lodf;
  let gr = g1.xyz * 0.9 + g2.xyz * 0.7 + g3.xyz * 2.6 * lodf;
  let geoUp = n.y;
  n = normalize(n - select(0.075, 0.045, step7) * (gr - n * dot(gr, n)));
  let side = 1.0 - abs(geoUp);
  let strata = sin(q.y * 11.0 + g1.w * 2.5 + g2.w);
  var alb = mix(vec3f(0.018, 0.02, 0.042), vec3f(0.105, 0.12, 0.2), smoothstep(-0.55, 0.6, hv));
  alb *= 0.8 + 0.2 * strata * side;
  // crack lines: zero-crossings of a warped noise
  let edge = abs(g1.w * 0.8 + g2.w * 0.45 - 0.08);      // reuses the octaves above
  let crack = 1.0 - smoothstep(0.0, 0.05, edge);
  alb *= 1.0 - 0.6 * crack * (1.0 - smoothstep(0.3, 0.75, geoUp));     // cracks run down the flanks, not over the top
  if (step7) { alb = mix(alb, vec3f(0.13, 0.14, 0.215) * (0.7 + 0.6 * in.uv.y), 0.7) * (0.85 + 0.3 * g3.w * lodf) * (1.0 - 0.3 * crack); }
  // moss and lichen settle in the hollows of up-facing rock
  let top = smoothstep(0.45, 0.85, geoUp);
  let moss = top * smoothstep(0.1, -0.2, hv) * select(1.0, 0.3, step7);
  alb = mix(alb, vec3f(0.016, 0.065, 0.055) * (0.6 + 0.8 * (g3.w * 0.5 + 0.5)), moss);
  // occlusion: hollows, crystal sockets, the foot of each step, and a dark contact under the threshold and jambs
  var ao = (0.5 + 0.5 * smoothstep(-0.7, 0.35, hv)) * cao;
  for (var i = 0; i < 3; i++) {
    let tb = TIERS[i];
    ao *= mix(0.4, 1.0, smoothstep(0.0, 0.3, aoBox2(loc.xz, tb.xy) + max(loc.y - tb.z + 0.04, 0.0) * 8.0));
  }
  let db = aoBox2(loc.xz, vec2f(0.66, 0.13)) + max(loc.y, 0.0);
  ao *= mix(0.08, 1.0, smoothstep(0.0, 0.3, db)) * mix(0.6, 1.0, smoothstep(0.0, 0.9, db));
  ao *= mix(1.0, 0.7, smoothstep(-0.8, -3.5, loc.y));
  var c = litSpec(alb, n, in.w, 24.0, 0.12) * vec3f(0.7, 0.8, 1.05) * ao + alb * spill * 5.0;
  // light seeping through cracks: strong underneath, sparse on top
  let under = smoothstep(0.2, -0.6, geoUp);
  let vm = smoothstep(-0.1, 0.4, g1.w);
  let vein = (1.0 - smoothstep(0.0, 0.016 + dist * 0.002, edge)) * vm;
  c += vec3f(0.25, 0.75, 1.5) * vein * (0.1 + 0.9 * under) * (0.7 + 0.3 * sin(t * 0.6 + in.w.y * 1.5)) * (1.0 - moss) * select(1.0, 0.0, step7);
  // tiny glowing lichen specks
  let sp = q.xz * 13.0;
  let sh = hash22(floor(sp));
  let sd = length(fract(sp) - 0.25 - 0.5 * sh);
  c += vec3f(0.2, 0.8, 0.65) * moss * step(0.72, sh.x) * smoothstep(0.16, 0.0, sd) * 0.6;
  // worn runes inlaid around the threshold: a broken band of glyph strokes with a soft, uneven glow
  let rd = aoBox2(loc.xz, vec2f(0.8, 0.36));
  let onTop = select(0.0, 1.0, step7) * smoothstep(0.8, 0.95, geoUp) * smoothstep(-0.03, -0.01, loc.y);
  let gq = loc.xz * 11.0;
  let gcell = floor(gq);
  let gh = hash22(gcell + 3.0);
  let gf = fract(gq) - 0.5;
  // each cell holds one short stroke in one of four directions
  let ga = floor(gh.x * 4.0) * 0.7854;
  let gd = abs(dot(gf, vec2f(-sin(ga), cos(ga))));
  let gl = abs(dot(gf, vec2f(cos(ga), sin(ga))));
  let stroke = (1.0 - smoothstep(0.03, 0.07, gd)) * (1.0 - smoothstep(0.26, 0.34, gl)) * step(gh.y, 0.62);
  let bandm = (1.0 - smoothstep(0.035, 0.075, abs(rd + 0.005))) ;
  let worn = smoothstep(-0.35, 0.3, g2.w) * (0.45 + 0.55 * smoothstep(-0.3, 0.5, g1.w));
  let rp = 0.6 + 0.4 * sin(t * 0.35 + loc.x * 2.0 + loc.z * 3.0);
  c += mix(vec3f(0.2, 0.75, 1.1), vec3f(0.6, 0.45, 1.2), gh.x) * onTop * (stroke * bandm * worn * 1.1 + exp(-abs(rd) * 9.0) * 0.035) * rp;
  c += vec3f(0.3, 0.45, 1.1) * fres * 0.14 * (1.0 - smoothstep(0.3, 0.7, geoUp));   // cool nebula rim
  c += vec3f(0.15, 0.25, 0.6) * under * 0.04;
  return vec4f(c, 1.0);
}
