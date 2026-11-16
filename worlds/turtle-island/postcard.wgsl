// Turtle Island postcard: dusk over the sea, the turtle's head ahead, black sand below; the volcano behind.
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let sun = vec3f(-0.4225, 0.0453, -0.9053);
  let sh = clamp(dot(normalize(rd.xz + vec2f(1e-5, 0.0)), vec2f(-0.4229, -0.9062)) * 0.5 + 0.5, 0.0, 1.0);
  let hz = mix(vec3f(0.15, 0.15, 0.27), vec3f(1.1, 0.47, 0.2), pow(sh, 2.4)) + vec3f(0.22, 0.07, 0.1) * sh;
  let sd = dot(rd, sun); let s01 = clamp(sd * 0.5 + 0.5, 0.0, 1.0);
  let y = max(rd.y, 0.0);
  var c = mix(hz, mix(vec3f(0.2, 0.17, 0.4), vec3f(0.95, 0.4, 0.36), pow(sh, 1.6)), smoothstep(0.0, 0.17, y));
  c = mix(c, vec3f(0.026, 0.04, 0.125), smoothstep(0.08, 0.72, y));
  c += vec3f(1.7, 0.6, 0.16) * pow(s01, 48.0) + vec3f(0.27, 0.11, 0.06) * pow(s01, 7.0);
  let p = rd.xz / (y + 0.13);
  let n = fbm2(vec2f(p.x * 0.8 + p.y * 0.6, (p.y * 0.8 - p.x * 0.6) * 2.6) * 0.55, 4);
  c = mix(c, mix(vec3f(0.13, 0.1, 0.22), vec3f(1.5, 0.6, 0.42), 0.25 + 0.6 * pow(sh, 2.0)), smoothstep(0.0, 0.5, n + 0.1 - y * 0.35) * smoothstep(0.012, 0.09, y) * 0.8);
  let ang = acos(clamp(sd, -1.0, 1.0));
  c = mix(c, vec3f(8.0, 2.6, 0.5), smoothstep(0.052, 0.03, ang)) + vec3f(0.8, 0.25, 0.06) * exp(-ang * 9.0);
  let az = atan2(rd.x, -rd.z);
  // the volcano behind: cone, crater glow, lava threads
  let ab = abs(abs(az) - PI) ;
  let cone = 0.33 * exp(-ab * ab * 5.0) + 0.02 * sin(az * 23.0) * exp(-ab * 2.0);
  let land = smoothstep(0.012, -0.012, rd.y - cone - 0.03 * smoothstep(1.9, 1.2, abs(az)) * smoothstep(0.5, 1.2, abs(az)));
  var lc = vec3f(0.02, 0.035, 0.02) + vec3f(0.12, 0.05, 0.03) * sh;
  lc += vec3f(5.0, 1.1, 0.15) * smoothstep(0.012, 0.0, abs(ab - 0.1 - (cone - rd.y) * 0.5 - 0.03 * sin(rd.y * 40.0))) * step(rd.y, cone - 0.02) * step(0.0, rd.y);
  c = mix(c, lc, land * step(0.0, rd.y));
  c += vec3f(1.2, 0.3, 0.08) * exp(-(ab * ab + pow(rd.y - 0.36, 2.0)) * 60.0);
  // the head rising from the sea, the lifted flipper to the right
  let hq = vec2f(az, rd.y);
  let hd = length((hq - vec2f(-0.075, 0.185 + 0.004 * sin(t * 0.3))) / vec2f(0.115, 0.058 - 0.02 * smoothstep(0.0, -0.11, az + 0.075)));
  let nk = abs(az - 0.035 + (rd.y - 0.1) * 0.3) / (0.05 - rd.y * 0.06);
  let fl = length((vec2f(az + 1.35, rd.y - 0.04 - (az + 1.35) * 0.12)) / vec2f(0.38, 0.045));
  let sil = max(max(smoothstep(1.05, 0.95, hd), smoothstep(1.05, 0.95, nk) * step(rd.y, 0.2)), smoothstep(1.05, 0.9, fl)) * step(0.0, rd.y);
  c = mix(c, vec3f(0.06, 0.05, 0.05) + hz * 0.16, sil);
  if (rd.y < 0.0) {
    // sea with a glitter path, then wet black sand in the foreground
    let d = 1.7 / max(-rd.y, 1e-3);
    let q = rd.xz * d;
    let w = fbm2(q * vec2f(0.06, 0.2) + vec2f(0.0, t * 0.05), 3);
    let r = normalize(vec3f(rd.x + w * 0.05, -rd.y + 0.02 + abs(w) * 0.06, rd.z));
    let rs = max(dot(r, sun), 0.0);
    var sea = mix(vec3f(0.01, 0.035, 0.05), hz, pow(1.0 - min(-rd.y * 3.0, 1.0), 3.0) * 0.85 + 0.1);
    sea += vec3f(2.4, 0.9, 0.3) * pow(rs, 90.0) * (0.6 + 0.8 * w) + vec3f(0.4, 0.2, 0.1) * pow(rs, 12.0);
    sea = mix(sea, vec3f(0.035, 0.035, 0.05), smoothstep(1.0, 0.6, length(vec2f(az + 0.02, rd.y + 0.09) / vec2f(0.12, 0.09))) * 0.5);
    let shore = 22.0 + 3.0 * sin(q.x * 0.09) + 1.5 * sin(t * 0.4 + q.x * 0.05);
    let sandc = vec3f(0.012, 0.012, 0.015) + hz * 0.1 * smoothstep(shore - 10.0, shore, d) + vec3f(0.02) * fbm2(q * 1.5, 2);
    sea = mix(sea, vec3f(0.6, 0.5, 0.52), smoothstep(2.5, 0.0, abs(d - shore - 1.5)) * 0.6 * step(abs(az), 1.6));
    c = mix(sandc, sea, max(smoothstep(shore - 0.5, shore + 0.5, d), step(1.7, abs(az))));
  }
  return c;
}
