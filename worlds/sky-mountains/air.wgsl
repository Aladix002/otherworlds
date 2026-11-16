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
  let sz = 0.07 + 0.09 * h2.z;
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
  if (a.w < 0.0) { o.k = vec3f(p.xz, 0.0); }
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
// a ball of seed tufts: the pattern sits on the sphere in world space, so it turns as you move around it
@fragment fn fsSeed(in: EO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  if (r2 > 1.0) { discard; }
  let r = sqrt(r2);
  let N = G.camRight * in.c.x + G.camUp * in.c.y - G.camFwd * sqrt(1.0 - r2);
  let v = in.w - G.camPos; let d = length(v);
  let det = smoothstep(0.004, 0.014, in.k.z / d);
  let o = in.k.y * 9.0;                               // seed heads on the near and the far side of the ball
  let tuft = 1.0 - smoothstep(0.1, 0.42, voronoi3(N * 5.5 + o).x) + 0.5 * (1.0 - smoothstep(0.1, 0.42, voronoi3(reflect(N, G.camFwd) * 5.5 + o).x));
  let rim = smoothstep(0.5, 1.0, r);
  let core = 1.0 - smoothstep(0.1, 0.2, r);
  let a = max(mix(0.6 * (1.0 - r), min(0.22 + 0.6 * tuft, 1.0) * (1.0 - smoothstep(0.8, 1.0, r)), det), core * det) * in.k.x;
  let back = max(dot(v / d, G.sunDir), 0.0);
  let col = (G.ambientSky * 1.6 + G.sunColor * (0.12 + 0.3 * smoothstep(-0.3, 0.8, dot(N, G.sunDir)) + (0.3 + rim) * back * back)) * mix(vec3f(1.0), vec3f(0.25, 0.18, 0.1), core * det);
  return vec4f(atmo(col, in.w) * a, a);
}
// a real bow: colour by the angle to the antisolar point, so it only shows from the sunny side, inside the mist column of the fall
@fragment fn fsBow(in: EO) -> @location(0) vec4f {
  let v = in.w - G.camPos; let d = length(v);
  let x = (acos(clamp(dot(v / d, -G.sunDir), -1.0, 1.0)) - 0.66) / 0.1;
  let band = smoothstep(0.0, 0.45, x) * (1.0 - smoothstep(0.55, 1.0, x));
  let hd = distance(in.w.xz, in.k.xy);
  let a = band * max(1.0 - dot(in.c, in.c), 0.0) * exp(-hd * hd / 700.0) * 0.26 * smoothstep(15.0, 50.0, d) * (1.0 - smoothstep(300.0, 450.0, d));
  return vec4f(mix(vec3f(1.0), hsv2rgb(vec3f(0.75 * (1.0 - x), 1.0, 1.0)), 0.6) * a, 0.0);
}
