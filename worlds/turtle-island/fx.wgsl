// Stateless billboards: steam, crater plume, turtle breath, whale spout, fireflies, embers, flipper mist.
// a = (origin, type), b = (seed, size, life seconds, extra). Premultiplied output; k.x = 1 for additive sparks.
struct PV { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec4f, @location(2) k: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> PV {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = cs[vi]; let ty = i32(a.w); let sd = b.x; let t = G.time;
  let age = fract(t / b.z + sd);
  let h3 = hash33(vec3f(sd * 91.7, floor(t / b.z + sd), a.w)) - 0.5;
  let wind = vec3f(0.22, 0.0, 1.0);                       // apparent wind: the island swims toward -z
  var p = a.xyz; var size = b.y; var col = vec4f(0.0); var add = 0.0;
  let pink = vec3f(0.6, 0.47, 0.52);
  if (ty == 0) {                                          // steam
    p += vec3f(h3.x, 0.0, h3.z) * b.y + vec3f(0.0, 1.0, 0.0) * age * b.z * 0.8 + wind * age * age * b.z * 0.9 + vec3f(sin(t * 0.3 + sd * 30.0), 0.0, cos(t * 0.23 + sd * 17.0)) * age * 1.2;
    size = b.y * (0.5 + 2.2 * age);
    col = vec4f(mix(vec3f(3.0, 0.9, 0.25), pink, smoothstep(0.0, mix(0.02, 0.4, b.w), age)), smoothstep(0.0, 0.12, age) * pow(1.0 - age, 1.4) * 0.42);
  } else if (ty == 1) {                                   // crater plume, trailing behind the moving island
    p += vec3f(h3.x, 0.0, h3.z) * (3.0 + 30.0 * age) + vec3f(0.0, 1.0, 0.0) * (age * b.z * (0.7 + 0.9 * fract(sd * 9.7)) + 8.0 * sqrt(age)) + wind * pow(age, 1.6) * b.z * 2.6;
    size = b.y * (0.35 + 4.5 * age);
    let lit = 0.5 + 0.5 * dot(normalize(vec3f(c.x * G.camRight.x - 0.0, c.y, c.x * G.camRight.z)), normalize(vec3f(SUNH.x, 0.5, SUNH.y)));
    col = vec4f(mix(vec3f(1.3, 0.34, 0.1), mix(vec3f(0.1, 0.085, 0.14), vec3f(0.5, 0.27, 0.27), lit), smoothstep(0.0, 0.2, age)), smoothstep(0.0, 0.25, age) * pow(1.0 - age, 1.2) * 0.2);
  } else if (ty == 2) {                                   // the turtle breathes out
    let ag = clamp(G.params2.x * 1.7 - sd * 0.7, 0.0, 1.0);
    p = headW(NOS + vec3f(h3.x * 0.03, 0.0, 0.0), 1.0) + headR(1.0) * vec3f(h3.x * 14.0, 16.0 + h3.y * 8.0, -9.0) * ag + wind * ag * ag * 14.0;
    size = b.y * (0.4 + 2.4 * ag);
    col = vec4f(pink * 1.15, sin(ag * PI) * 0.4);
  } else if (ty == 3) {                                   // a whale spouts far away
    let ag = clamp(age * 4.0 - sd * 0.5, 0.0, 1.0);
    p = vec3f(G.params2.z + h3.x * 2.0, 0.5 + ag * (9.0 + h3.y * 4.0), G.params2.w + h3.z * 2.0) + wind * ag * 5.0;
    size = b.y * (0.4 + 1.6 * ag);
    col = vec4f(pink * 1.2, sin(ag * PI) * 0.45);
  } else if (ty == 4) {                                   // fireflies
    p += vec3f(sin(t * 0.31 + sd * 40.0) * 1.6 + sin(t * 0.13 + sd * 9.0), sin(t * 0.23 + sd * 17.0) * 0.6, cos(t * 0.27 + sd * 29.0) * 1.6 + cos(t * 0.11 + sd * 5.0));
    let bl = smoothstep(0.1, 0.9, sin(t * (0.7 + sd) + sd * 50.0));
    col = vec4f(vec3f(1.1, 1.5, 0.3) * bl * 6.0, 1.0); add = 1.0;
    size = b.y * (1.0 + 0.03 * distance(p, G.camPos));
  } else if (ty == 5) {                                   // embers drifting up from the lava
    p += vec3f(h3.x, 0.0, h3.z) * 1.2 + vec3f(sin(t * 0.9 + sd * 20.0) * 0.3, age * b.z * 0.55, 0.0) + wind * age * age * b.z * 0.4;
    col = vec4f(vec3f(6.0, 1.6, 0.25) * (1.0 - age) * smoothstep(0.0, 0.1, age), 1.0); add = 1.0;
    size = b.y * (1.0 + 0.01 * distance(p, G.camPos));
  } else {                                                // water streaming off a rising flipper
    let o = flipW(vec3f(0.25 + 0.7 * fract(sd * 7.13), -0.01, 0.34 * fract(sd * 7.13) * fract(sd * 7.13) + 0.12 * (fract(sd * 3.7) - 0.3)), a.x, 0.0);
    let lift = smoothstep(1.0, 9.0, o.y) * smoothstep(-0.2, 0.2, cos(G.params.y + 0.4));
    p = o + vec3f(h3.x * 3.0, -age * age * 22.0 * min(1.0, o.y / 14.0 + 0.3), h3.z * 3.0);
    p.y = max(p.y, 0.3);
    size = b.y * (0.7 + 1.5 * age);
    col = vec4f(pink * 1.1 + vec3f(0.25, 0.1, 0.03), lift * smoothstep(0.0, 0.1, age) * (1.0 - age) * 0.5);
  }
  let v = p - G.camPos; let d = length(v);
  let f = 1.0 - exp(-d * G.fogDensity);
  col = vec4f(mix(col.rgb, haze(v / d), max(f, 0.45) * (1.0 - add)), col.a * smoothstep(0.6, 3.0 + size, d) * mix(1.0, 1.0 - f, add));
  var o: PV; o.c = c; o.col = col; o.k = vec3f(add, sd * 13.0, age);
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(size)), 1.0);
  return o;
}
@fragment fn fs(in: PV) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let n = textureSample(detT, sR, in.c * 0.21 + vec2f(in.k.y, in.k.y * 1.7) + vec2f(0.0, in.k.z * 0.15));
  if (in.k.x > 0.5) {
    let s = exp(-r2 * 22.0) + 0.12 * exp(-r2 * 3.5) * (1.0 - r2);
    return vec4f(in.col.rgb * max(s, 0.0) * in.col.a, 0.0);
  }
  let r = sqrt(r2);
  let s = smoothstep(1.0, 0.25, r) * smoothstep(0.3, 0.75, n.b * 0.9 + n.a * 0.3 + (0.55 - r) * 0.7);
  let a = in.col.a * s;
  return vec4f(in.col.rgb * (0.8 + 0.4 * n.b) * a, a);
}
