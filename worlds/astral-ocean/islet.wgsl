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
  if (uv.x > 1.5 && uv.x < 2.5) { w.y += 0.3 * sin(t * 0.31 + uv.y) + 0.15 * sin(t * 0.17 + uv.y * 2.3); }
  if (uv.x > 4.5 && uv.x < 6.5) {      // tendrils and grass breathe in a slow current
    let k = uv.y * uv.y * select(0.05, 0.025, uv.x < 5.5);
    w.x += (sin(t * 0.7 + p.x * 3.0 + p.z * 2.0) + 0.5 * sin(t * 0.43 + p.z * 5.0)) * k;
    w.z += cos(t * 0.53 + p.z * 3.3 + p.x) * k;
  }
  o.w = w; o.n = n; o.uv = uv; o.o = p; o.pos = G.viewProj * vec4f(w, 1.0); return o;
}
fn aoGlowCol(h: f32) -> vec3f { return mix(vec3f(0.25, 0.75, 1.4), vec3f(0.95, 0.4, 1.4), h); }

@fragment fn fs(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let ty = in.uv.x;
  let t = G.time;
  var n = normalize(in.n);
  let Vv = G.camPos - in.w;
  let dist = length(Vv);
  let V = Vv / dist;
  let fr = 1.0 - abs(dot(n, V));
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

  if (ty > 0.5 && ty < 1.5) {          // crystal
    let base = aoGlowCol(in.uv.y);
    let c = base * (0.3 + 1.3 * fres + 0.2 * fr) + litSpec(vec3f(0.04), n, in.w, 60.0, 1.0);
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
  if (ty > 2.5 && ty < 3.5) {          // roots: dark bark, light pulsing along thin veins toward the tip
    let tt = in.uv.y;
    let bark = vec3f(0.035, 0.028, 0.045) * (0.6 + 0.6 * vnoise3(in.o * vec3f(14.0, 5.0, 14.0)));
    var c = litSpec(bark, n, in.w, 12.0, 0.05) * cao + bark * spill * 4.0;
    // soft pulses of light travel along the root
    let pul = pow(0.5 + 0.5 * sin(tt * 11.0 - t * 0.6 + in.o.y * 3.0), 6.0);
    c += vec3f(0.22, 0.8, 1.1) * pul * (0.15 + 0.85 * tt) * 0.16;
    c += vec3f(0.22, 0.8, 1.1) * smoothstep(0.85, 1.0, tt) * 0.1 + vec3f(0.3, 0.45, 1.1) * fres * 0.05;
    return vec4f(applyFog(c, in.w), 1.0);
  }

  // ---- stone ----
  var q = in.o;
  let step7 = ty > 6.5;
  let g1 = snoise3d(q * 1.7 + 3.0);
  let g2 = snoise3d(q * 5.3 + 11.0);
  let g3 = snoise3(q * 19.0);
  let hv = g1.w * 0.55 + g2.w * 0.33 + g3 * 0.12;
  let gr = g1.xyz * 0.9 + g2.xyz * 1.7;
  let geoUp = n.y;
  n = normalize(n - select(0.11, 0.07, step7) * (gr - n * dot(gr, n)));
  let side = 1.0 - abs(geoUp);
  let strata = sin(q.y * 9.0 + g1.w * 2.5);
  var alb = mix(vec3f(0.022, 0.02, 0.04), vec3f(0.15, 0.125, 0.18), smoothstep(-0.5, 0.6, hv)) * (0.8 + 0.4 * g3);
  alb *= 0.82 + 0.18 * strata * side;
  // cracks
  let edge = abs(snoise3(q * vec3f(1.0, 1.7, 1.0) + g1.w * 0.3 + 20.0));   // zero-crossings of a warped noise = crack lines
  let crack = 1.0 - smoothstep(0.0, 0.08, edge);
  alb *= 1.0 - 0.6 * crack;
  if (step7) { alb = mix(alb, vec3f(0.15, 0.13, 0.185) * (0.75 + 0.5 * in.uv.y), 0.65) * (1.0 - 0.35 * crack); }
  // moss and lichen settle in the hollows of up-facing rock
  let top = smoothstep(0.45, 0.85, geoUp);
  let moss = top * smoothstep(0.12, -0.2, hv + g3 * 0.25) * select(1.0, 0.35, step7);
  alb = mix(alb, vec3f(0.018, 0.07, 0.055) * (0.6 + 0.8 * (g3 * 0.5 + 0.5)), moss);
  // occlusion: hollows, the door base, the foot of the steps, crystal sockets
  let dq = abs(loc.xz) - vec2f(0.68, 0.16);
  let db = length(max(dq, vec2f(0.0))) + min(max(dq.x, dq.y), 0.0);
  var ao = (0.55 + 0.45 * smoothstep(-0.7, 0.35, hv)) * cao;
  ao *= mix(0.35, 1.0, smoothstep(0.0, 0.6, db + max(loc.y, 0.0)));
  let sq = abs(loc.xz) - vec2f(1.75, 1.25);
  let dstep = length(max(sq, vec2f(0.0))) + min(max(sq.x, sq.y), 0.0);
  ao *= mix(0.55, 1.0, smoothstep(0.0, 0.5, dstep + max(loc.y + 0.3, 0.0) * 3.0 + select(0.0, 1.0, step7)));
  ao *= mix(1.0, 0.7, smoothstep(-0.8, -3.5, loc.y));
  var c = litSpec(alb, n, in.w, 20.0, 0.1) * vec3f(0.75, 0.8, 1.0) * ao + alb * spill * 5.0;
  // light seeping through cracks: strong underneath, sparse on top
  let under = smoothstep(0.2, -0.6, geoUp);
  let vm = smoothstep(-0.1, 0.4, g1.w);
  let vein = (1.0 - smoothstep(0.0, 0.02 + dist * 0.002, edge)) * vm;
  c += vec3f(0.25, 0.75, 1.5) * vein * (0.12 + 0.88 * under) * (0.7 + 0.3 * sin(t * 0.6 + in.w.y * 1.5)) * (1.0 - moss) * select(1.0, 0.0, step7);
  // tiny glowing lichen specks
  let sp = q.xz * 13.0;
  let sh = hash22(floor(sp));
  let sd = length(fract(sp) - 0.25 - 0.5 * sh);
  c += vec3f(0.2, 0.8, 0.65) * moss * step(0.72, sh.x) * smoothstep(0.16, 0.0, sd) * 0.6;
  // a thin line of light inlaid around the threshold
  let rq = abs(loc.xz) - vec2f(1.02, 0.52);
  let rd = abs(length(max(rq, vec2f(0.0))) + min(max(rq.x, rq.y), 0.0));
  let onTop = select(0.0, 1.0, step7) * smoothstep(0.8, 0.95, geoUp) * smoothstep(-0.03, -0.01, loc.y);
  c += vec3f(0.25, 0.8, 1.3) * onTop * ((1.0 - smoothstep(0.008, 0.016 + dist * 0.0015, rd)) * 0.9 + exp(-rd * 16.0) * 0.07) * (0.75 + 0.25 * sin(t * 0.4));
  c += vec3f(0.3, 0.45, 1.1) * fres * 0.14 * (1.0 - smoothstep(0.3, 0.7, geoUp));   // cool nebula rim
  c += vec3f(0.15, 0.25, 0.6) * under * 0.04;
  return vec4f(c, 1.0);
}
