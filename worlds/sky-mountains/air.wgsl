// Drifting puff seeds, puff globes on stalks and rainbows in the waterfall mist (appended to fx.wgsl).
struct EO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: vec3f };
const QC = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
// seeds: hashed positions wrapped around the camera, carried by the wind
@vertex fn vsSeed(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> EO {
  let h = hash3u(vec3u(ii, 41u, 7u)); let h2 = hash3u(vec3u(ii, 9u, 23u));
  let t = G.time;
  var p = h * 80.0 + vec3f(0.8, 0.0, 0.55) * (t * (0.5 + 0.4 * h2.x))
    + vec3f(sin(t * 0.3 + h2.z * 30.0) * 0.5, 1.2 * sin(t * 0.13 + h2.y * 30.0) + 0.3 * sin(t * 0.41 + h2.x * 30.0), cos(t * 0.27 + h2.y * 30.0) * 0.5);
  p = p - 80.0 * round((p - G.camPos) / 80.0);
  let d = distance(p, G.camPos);
  let sz = 0.05 + 0.07 * h2.z;
  var o: EO;
  o.c = QC[vi]; o.w = billboard(p, o.c, vec2f(sz));
  o.k = vec3f(smoothstep(1.5, 5.0, d) * (1.0 - smoothstep(26.0, 40.0, d)), h.x, sz);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
// instance a = (position, radius); a negative radius marks a rainbow card (no sway)
@vertex fn vsGlobe(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> EO {
  var p = a.xyz;
  if (a.w > 0.0) { p += vec3f(0.8, 0.0, 0.55) * (gustAt(p) * 0.175); }
  var o: EO;
  o.c = QC[vi]; o.w = billboard(p, o.c, vec2f(abs(a.w)));
  o.k = vec3f(1.0 - smoothstep(260.0, 420.0, distance(p, G.camPos)), fract(a.x * 0.37 + a.z * 0.11), abs(a.w));
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsSeed(in: EO) -> @location(0) vec4f {
  let r = length(in.c);
  let d = distance(in.w, G.camPos);
  let det = smoothstep(0.004, 0.014, in.k.z / d);
  let spk = 0.5 + 0.5 * sin(atan2(in.c.y, in.c.x) * 26.0 + in.k.y * 20.0);
  let f = max(1.0 - r, 0.0);
  var a = f * (0.55 + 0.15 * f) + det * (spk * 0.07 * smoothstep(0.1, 0.4, r) * (1.0 - smoothstep(0.8, 1.0, r)) + 0.13 * (1.0 - smoothstep(0.02, 0.12, abs(r - 0.84))));
  let core = 1.0 - smoothstep(0.05, 0.13, r);
  a = min(max(a, core * 0.9), 1.0) * in.k.x;
  let back = max(dot(normalize(in.w - G.camPos), G.sunDir), 0.0);
  let col = (G.ambientSky * 1.7 + G.sunColor * (0.2 + 0.12 * f + 0.6 * back * back)) * mix(vec3f(1.0), vec3f(0.3, 0.22, 0.12), core);
  return vec4f(atmo(col, in.w) * a, a);
}
// a real bow: colour by the angle to the antisolar point, so it only shows from the sunny side of the mist
@fragment fn fsBow(in: EO) -> @location(0) vec4f {
  let v = in.w - G.camPos; let d = length(v);
  let x = (acos(clamp(dot(v / d, -G.sunDir), -1.0, 1.0)) - 0.67) / 0.075;
  let band = smoothstep(0.0, 0.3, x) * (1.0 - smoothstep(0.7, 1.0, x));
  let f = max(1.0 - dot(in.c, in.c), 0.0);
  let a = band * f * f * 0.5 * smoothstep(12.0, 40.0, d) * in.k.x;
  return vec4f(hsv2rgb(vec3f(0.78 * (1.0 - x), 0.8, 1.0)) * a, 0.0);
}
