// creatures and plants: spline tubes built in the vertex shader from CPU control points (xyz + radius)
struct Tube { a: vec4f, b: vec4f, c: vec4f };   // start, count, rings, kind | hue, seed, length, flatten | frame reference, glow
@group(1) @binding(0) var<storage, read> PT: array<vec4f>;
@group(1) @binding(1) var<storage, read> TB: array<Tube>;
const SEG = 10u;
struct TV {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) st: vec3f,   // st = arc (m), angle, 0..1
  @location(3) @interpolate(flat) k: vec4f,                                                              // kind, hue, seed, glow
};
@vertex fn vsTube(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TV {
  var cs = array<vec2u, 6>(vec2u(0, 0), vec2u(1, 0), vec2u(0, 1), vec2u(0, 1), vec2u(1, 0), vec2u(1, 1));
  let T = TB[ii];
  let rings = u32(T.a.z); let q = vi / 6u; let c = cs[vi % 6u];
  let t = f32(q / SEG + c.x) / f32(rings);
  let th = f32(q % SEG + c.y) / f32(SEG) * TAU;
  let n = i32(T.a.y); let base = i32(T.a.x);
  let f = t * f32(n - 1); let i = min(i32(f), n - 2); let u = f - f32(i);
  let p0 = PT[base + max(i - 1, 0)]; let p1 = PT[base + i]; let p2 = PT[base + i + 1]; let p3 = PT[base + min(i + 2, n - 1)];
  let c1 = p2 - p0; let c2 = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3; let c3 = 3.0 * (p1 - p2) + p3 - p0;
  var P = 0.5 * (2.0 * p1 + c1 * u + c2 * u * u + c3 * u * u * u);
  let tg = normalize((c1 + 2.0 * c2 * u + 3.0 * c3 * u * u).xyz + vec3f(0.0, 1e-5, 0.0));
  let kind = T.a.w;
  if (kind > 2.5 && kind < 4.5) {                          // plants sway a little in the night wind
    let s = t * t * T.b.z * 0.045;
    P = vec4f(P.x + s * sin(G.time * 0.7 + T.b.y * 40.0), P.y, P.z + s * sin(G.time * 0.53 + T.b.y * 70.0), P.w);
  }
  let B = normalize(cross(T.c.xyz, tg)); let N = cross(tg, B);
  let sn = sin(th); let fl = T.b.w * select(0.8, 1.0, sn > 0.0 || (kind > 0.5 && kind < 1.5));
  let r = max(P.w, 0.0);
  var o: TV;
  o.w = P.xyz + (B * cos(th) + N * sn * fl) * r;
  o.n = normalize(B * cos(th) + N * sn / max(fl, 0.2));
  o.st = vec3f(t * T.b.z, th, t);
  o.k = vec4f(kind, T.b.x, T.b.y, T.c.w);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  if (kind > 4.5) { o.pos.z *= 1.02; }                     // trails hug the sand
  return o;
}

@fragment fn fsTube(in: TV) -> @location(0) vec4f {
  let kind = i32(in.k.x + 0.5); let hue = in.k.y; let seed = in.k.z;
  let s = in.st.x; let t = in.st.z;
  let n = normalize(in.n);
  let dist = distance(in.w, G.camPos);
  let V = (G.camPos - in.w) / dist;
  // 0 on the spine, 1 on the belly
  let a = abs(atan2(sin(in.st.y - PI * 0.5), cos(in.st.y - PI * 0.5))) / PI;
  let time = G.time;
  var e = 0.0;                                             // emissive pattern
  var ec = hsv2rgb(vec3f(hue, 0.85, 1.0));
  var skin = mix(vec3f(0.02, 0.012, 0.06), vec3f(0.05, 0.09, 0.11), smoothstep(0.45, 0.95, a));
  var eye = 0.0;
  if (kind == 0 || kind == 2 || kind == 1) {
    // diamond scales
    let sq = vec2f(s * 52.0, in.st.y * 3.5);
    let cell = abs(fract(vec2f(sq.x + sq.y, sq.x - sq.y)) - 0.5);
    skin *= 0.55 + 0.45 * smoothstep(0.5, 0.3, max(cell.x, cell.y)) * (1.0 - smoothstep(4.0, 14.0, dist)) + 0.45 * smoothstep(4.0, 14.0, dist);
  }
  if (kind == 0) {                                         // lizard: dorsal line, flank spots, tail rings, rainbow down the body
    ec = hsv2rgb(vec3f(hue + s * 0.2 + 0.05 * sin(time * 0.21 + seed), 0.85, 1.0));
    e = exp(-pow(a / 0.05, 2.0)) * (0.55 + 0.45 * sin(s * 34.0 - time * 1.1));
    let c1 = fract(s * 8.0) - 0.5;
    e += smoothstep(0.1, 0.03, c1 * c1 + pow((a - 0.3) * 3.4, 2.0)) * smoothstep(0.1, 0.25, t);
    let c2 = fract(s * 8.0 + 0.5) - 0.5;
    e += 0.7 * smoothstep(0.05, 0.01, c2 * c2 + pow((a - 0.52) * 4.0, 2.0)) * smoothstep(0.1, 0.25, t) * smoothstep(0.75, 0.5, t);
    e += smoothstep(0.52, 0.6, t) * smoothstep(0.35, 0.45, abs(fract(s * 6.0) - 0.5)) * 0.9 * smoothstep(0.75, 0.5, a);
    eye = smoothstep(0.0003, 0.0001, pow((t - 0.04) * 2.3, 2.0) + pow((a - 0.4) * 0.17, 2.0));
  } else if (kind == 2) {                                  // snake: chain of neon diamonds, flowing rainbow
    ec = hsv2rgb(vec3f(hue + s * 0.11 - time * 0.015, 0.85, 1.0));
    let dd = abs(fract(s * 3.4) - 0.5) * 2.0 + a * 4.2;
    e = exp(-pow((dd - 0.95) / 0.1, 2.0)) + 0.8 * exp(-dd * dd * 26.0);
    e += 0.6 * exp(-pow((a - 0.6) / 0.035, 2.0)) * (0.5 + 0.5 * sin(s * 20.0 + time * 0.8));
    e *= smoothstep(0.02, 0.06, t);
    eye = smoothstep(0.0003, 0.0001, pow((t - 0.034) * 3.3, 2.0) + pow((a - 0.42) * 0.15, 2.0));
  } else if (kind == 1) {                                  // legs: glowing bands and toes
    e = smoothstep(0.3, 0.45, abs(fract(t * 3.5 + 0.2) - 0.5)) * 0.7 * smoothstep(0.2, 0.35, t) + smoothstep(0.8, 0.95, t) * 0.9;
  } else if (kind == 3) {                                  // whip stalk: dark stem, nodes, bulb glowing from within
    skin = mix(vec3f(0.03, 0.05, 0.06), vec3f(0.08, 0.05, 0.1), t);
    let bulb = smoothstep(0.84, 0.93, t);
    e = bulb * (1.6 + 1.2 * pow(max(dot(n, V), 0.0), 2.0)) + 0.5 * smoothstep(0.4, 0.84, t) * smoothstep(0.42, 0.48, abs(fract(t * 14.0) - 0.5));
  } else {                                                 // lantern cactus: glowing ribs, bright head
    skin = vec3f(0.035, 0.07, 0.075);
    let rib = pow(0.5 + 0.5 * cos(in.st.y * 9.0), 10.0);
    let head = smoothstep(0.78, 0.9, t);
    e = rib * (0.25 + 0.75 * t) * (0.7 + 0.3 * sin(t * 30.0 - time * 0.6)) + head * (1.3 + 1.0 * pow(max(dot(n, V), 0.0), 2.0));
    ec = hsv2rgb(vec3f(hue + 0.08 * t, 0.8, 1.0));
  }
  let breath = 0.82 + 0.18 * sin(time * 0.5 + seed * 20.0);
  let fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  var col = skin * (hemi(n, G.ambientSky, G.ambientGround) * 3.0 + G.sunColor * wrapDiffuse(n, G.sunDir, 0.3) * 1.5);
  col += hsv2rgb(vec3f(hue + 0.3 + fr * 0.35 + s * 0.1, 0.7, 1.0)) * fr * 0.16;      // iridescent sheen
  col += ec * skin * 2.0 * (0.4 + 0.6 * max(n.y, 0.0));                             // own light spilling over the skin
  col += ec * e * 6.0 * breath + vec3f(3.5, 3.0, 2.2) * eye;
  return vec4f(applyFog(col, in.w), 1.0);
}

// glowing trail a snake leaves in the sand (additive ribbon, fading with age)
@fragment fn fsTrail(in: TV) -> @location(0) vec4f {
  let x = cos(in.st.y); let t = in.st.z;
  let prof = pow(max(1.0 - x * x, 0.0), 2.0) * step(0.0, sin(in.st.y));
  let fade = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.03, t);
  let sp = 0.6 + 0.8 * smoothstep(0.2, 0.9, vnoise2(in.w.xz * 55.0));
  let col = hsv2rgb(vec3f(in.k.y + in.w.x * 0.02 + in.w.z * 0.013, 0.8, 1.0));
  return vec4f(col * prof * fade * sp * 0.6 * (1.0 - fogAmount(distance(in.w, G.camPos))), 0.0);
}

// lizard footprints: glowing pad and toes pressed into the sand
struct PV { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsPrint(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> PV {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let n = b.xyz; let f = vec3f(sin(c.w), 0.0, cos(c.w));
  let T = normalize(f - n * dot(f, n)); let B = cross(T, n);
  var o: PV;
  o.uv = cs[vi];
  let w = a.xyz + (B * o.uv.x + T * o.uv.y) * a.w * 2.0 + n * 0.012;
  o.pos = G.viewProj * vec4f(w, 1.0); o.pos.z *= 1.02;
  o.col = c.rgb * b.w * (1.0 - fogAmount(distance(w, G.camPos)));
  return o;
}
@fragment fn fsPrint(in: PV) -> @location(0) vec4f {
  let p = in.uv;
  var g = 0.6 * exp(-dot(p - vec2f(0.0, -0.25), p - vec2f(0.0, -0.25)) * 9.0);
  for (var k = 0; k < 4; k++) {
    let an = (f32(k) - 1.5) * 0.5; let q = p - vec2f(sin(an), cos(an)) * 0.62 - vec2f(0.0, -0.15);
    g += exp(-dot(q, q) * 50.0);
  }
  g += 0.12 * exp(-dot(p, p) * 2.5);                       // soft pool around the print
  return vec4f(in.col * g * 0.75, 0.0);
}

// soft halos around glowing plant tips
struct HV { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsHalo(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> HV {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  var o: HV;
  o.uv = cs[vi];
  let w = billboard(a.xyz, o.uv, vec2f(a.w));
  o.pos = G.viewProj * vec4f(w, 1.0);
  o.col = b.rgb * (0.8 + 0.2 * sin(G.time * 0.5 + b.w)) * (1.0 - fogAmount(distance(a.xyz, G.camPos)));
  return o;
}
@fragment fn fsHalo(in: HV) -> @location(0) vec4f {
  let r2 = dot(in.uv, in.uv);
  let g = max(exp(-r2 * 5.0) - 0.0067, 0.0);
  return vec4f(in.col * (g * 0.22 + ign(in.pos.xy) * 0.002 * g), 0.0);
}
