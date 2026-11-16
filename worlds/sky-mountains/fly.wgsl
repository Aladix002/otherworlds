// Flyers: sky-mantas and long-tailed songbirds on slow loops (CPU twin of flyP: flyPos in life.js), butterflies.
// instance: a = (loop centre, radius), b = (phase, lateral, back, size), c = (hue or -1 for a manta, seed, loop yaw, rad/s)
struct FI { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f, @location(5) c: vec4f };
struct FO {
  @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) m: vec3f, @location(3) l: vec3f,
  @location(4) @interpolate(flat) k: vec2f,
};
fn flyP(a: vec4f, c: vec4f, ph: f32) -> vec3f {
  let q = vec3f(a.w * cos(ph), min(a.w * 0.12, 9.0) * sin(ph * 1.7 + c.y * 6.0), a.w * 0.7 * sin(ph));
  let cs = cos(c.z); let sn = sin(c.z);
  return a.xyz + vec3f(cs * q.x + sn * q.z, q.y, cs * q.z - sn * q.x);
}
@vertex fn vsFly(v: FI) -> FO {
  let mt = step(-0.5, v.c.x);                          // 0 manta, 1 bird
  let t = G.time;
  let ph = v.b.x + t * v.c.w;
  let dr = sign(v.c.w);
  let ctr = flyP(v.a, v.c, ph);
  let fw = normalize(flyP(v.a, v.c, ph + 0.03 * dr) - ctr);
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = normalize(cross(rt, fw) - rt * (dr * 0.3));
  let rt2 = cross(fw, up);
  let h = hash11(v.c.y * 17.3 + v.b.y * 3.7 + v.b.z);
  var p = v.p; var n = v.n;
  let mat = floor(v.uv.y); let wg = fract(v.uv.y);
  if (mat == 8.0) {                                     // trailing ribbons
    p.y += 0.22 * wg * sin(t - wg * 5.0 + h * 9.0);
    p.x += 0.15 * wg * sin(t * 0.63 - wg * 4.0 + h * 5.0);
  }
  // wings bend around the body axis, the wave runs out to the tips
  let sx = sign(p.x); let r = abs(p.x);
  let q = min(r * mix(1.0, 2.0, mt), 1.0);
  let env = 0.25 + 0.75 * smoothstep(-0.3, 0.4, sin(t * 0.37 + h * 40.0));
  let ang = q * mix(0.05 + 0.42 * sin(t * 0.75 + h * 20.0 - q * 1.8 - p.z * 0.5), 0.12 + 0.8 * env * sin(t * 8.0 + h * 20.0 - q), mt);
  let ca = cos(ang); let sa = sin(ang);
  p = vec3f(sx * r * ca, p.y + r * sa, p.z) * v.b.w;
  n = vec3f(n.x * ca - sx * n.y * sa, n.y * ca + sx * n.x * sa, n.z);
  let org = ctr + rt2 * v.b.y - fw * v.b.z + vec3f(0.0, mt * 0.7 * sin(t * 0.7 + h * 30.0), 0.0);
  var o: FO;
  o.w = org + rt2 * p.x + up * p.y - fw * p.z;
  o.n = rt2 * n.x + up * n.y - fw * n.z;
  o.m = vec3f(v.uv.x, mat, wg); o.l = v.p; o.k = vec2f(v.c.x, h);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsFly(in: FO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  var alb: vec3f; var em = vec3f(0.0); var tr = 0.3;
  let d = distance(in.w, G.camPos);
  if (in.k.x < -0.5) {
    let q = abs(in.l.x);
    let sp = textureSampleLevel(NT, NS, in.l.xz * vec2f(0.21, 0.33) + in.k.y, 0.0);
    let top = smoothstep(0.55, 0.9, in.m.x);
    let belly = mix(vec3f(0.2, 0.17, 0.3), vec3f(0.42, 0.33, 0.4), sp.a) * (0.8 + 0.2 * sin(in.l.x * 46.0) * (1.0 - smoothstep(0.08, 0.4, q)));
    alb = mix(belly, mix(vec3f(0.02, 0.05, 0.13), vec3f(0.06, 0.2, 0.3), sp.a), top);
    alb = mix(alb, vec3f(0.5, 0.36, 0.42), smoothstep(0.75, 1.0, q) * 0.6);
    // rows of small lights: aqua along the back, gold under the wings
    let g = fract(vec2f(in.l.x * 7.0, in.l.z * 6.0 + q * 2.0)) - 0.5;
    em = mix(vec3f(1.0, 0.6, 0.25) * 0.7, vec3f(0.3, 0.95, 1.0), top) * ((1.0 - smoothstep(0.07, 0.2, length(g))) * smoothstep(0.42, 0.58, sp.a) * (1.0 - smoothstep(120.0, 300.0, d)));
    tr = 0.25 + 0.6 * smoothstep(0.3, 1.0, q);
    if (in.m.y == 8.0) { alb = mix(vec3f(0.06, 0.2, 0.3), vec3f(0.8, 0.35, 0.3), in.m.z); em = vec3f(1.3, 0.55, 0.25) * (in.m.z * in.m.z * 0.3); tr = 0.7; }
  } else {
    let k = in.k.x;
    let base = select(select(select(vec3f(0.1, 0.28, 0.85), vec3f(0.95, 0.6, 0.08), k < 0.75), vec3f(0.03, 0.5, 0.48), k < 0.5), vec3f(0.9, 0.22, 0.14), k < 0.25);
    alb = mix(vec3f(0.03, 0.03, 0.05), mix(vec3f(luminance(base)), base, 0.65), smoothstep(0.2, 0.7, in.m.x));
    alb = mix(alb, vec3f(0.9, 0.84, 0.7), (1.0 - smoothstep(-0.03, 0.0, in.l.y)) * (1.0 - step(0.06, abs(in.l.x))));
  }
  return vec4f(shade(alb, n, in.w, 1.0, 1.0, tr) + em * atmoT(in.w - G.camPos), 1.0);
}

// ---- butterflies: two hinged quads wandering around a home point; they drift aside when the camera comes close
struct YO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
fn bflyP(a: vec4f, t: f32) -> vec3f {
  let s = a.w;
  return a.xyz + vec3f(sin(t * 0.23 + s * 40.0) * 2.2 + sin(t * 0.61 + s * 17.0) * 0.8, 0.4 * sin(t * 0.5 + s * 9.0) + 0.2 * sin(t * 1.3 + s * 31.0),
    cos(t * 0.19 + s * 23.0) * 2.2 + sin(t * 0.53 + s * 5.0) * 0.8);
}
@vertex fn vsBfly(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> YO {
  let t = G.time;
  var c = bflyP(a, t);
  let f0 = bflyP(a, t + 0.4) - c;
  let fw = normalize(vec3f(f0.x, 0.0, f0.z) + vec3f(1e-4, 0.0, 0.0));
  let dv = c - G.camPos; let d = length(dv);
  c += (dv / max(d, 0.01) + vec3f(0.0, 0.5, 0.0)) * (2.5 * (1.0 - smoothstep(1.0, 4.5, d)));
  let rt = vec3f(fw.z, 0.0, -fw.x);
  let j = vi % 6u; let sd = f32(vi / 6u) * 2.0 - 1.0;
  let x = f32(j == 1u || j == 4u || j == 5u); let z = f32(j == 2u || j == 3u || j == 5u) - 0.5;
  let th = 0.1 + 1.15 * (0.5 + 0.5 * sin(t * 10.0 + a.w * 50.0));
  let sz = (0.11 + 0.07 * fract(a.w * 7.7)) * (1.0 - smoothstep(55.0, 75.0, d));
  var o: YO;
  o.w = c + (rt * (sd * x * cos(th)) + vec3f(0.0, x * sin(th), 0.0) + fw * (z * 1.1)) * sz;
  o.uv = vec2f(x, z); o.k = a.w;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsBfly(in: YO) -> @location(0) vec4f {
  let p = vec2f(in.uv.x - 0.5, in.uv.y) * 2.0;
  let r = min(length((p - vec2f(0.05, -0.38)) / vec2f(0.95, 0.6)), length((p - vec2f(-0.2, 0.45)) / vec2f(0.75, 0.5)));
  if (r > 1.0) { discard; }
  let k = fract(in.k * 13.7);
  let base = select(select(select(vec3f(0.95, 0.3, 0.55), vec3f(0.95, 0.9, 0.8), k < 0.75), vec3f(1.0, 0.42, 0.06), k < 0.5), vec3f(0.08, 0.38, 1.0), k < 0.3);
  let col = mix(base, vec3f(0.02, 0.02, 0.04), smoothstep(0.55, 0.9, r));
  let back = max(dot(normalize(in.w - G.camPos), G.sunDir), 0.0);
  return vec4f(atmo(col * (G.ambientSky * 1.6 + G.sunColor * (0.3 + 0.5 * back * back)), in.w), 1.0);
}
