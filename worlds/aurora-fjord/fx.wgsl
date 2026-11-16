// Transparent effects: snowfall, chimney smoke + snow sliding off boughs, lamp halos, footprints.
struct PO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) a: vec4f, @location(2) e: f32 };
fn corner(vi: u32) -> vec2f {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return cs[vi % 6u];
}
// ---- snowfall: hashed flakes in a box wrapped around the camera (no simulation) ----
@vertex fn vsSnow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  let h = hash3u(vec3u(ii, 11u, 3u)); let h2 = hash3u(vec3u(ii, 5u, 77u));
  let far = f32(ii % 4u == 0u);
  let B = mix(22.0, 64.0, far); let t = G.time;
  var p = h * B + vec3f(0.22, -0.5 - 0.45 * h2.x, 0.13) * t + vec3f(sin(t * 0.31 + h2.y * 40.0), 0.0, cos(t * 0.27 + h2.z * 40.0)) * (0.3 + 0.4 * h2.x);
  p -= B * round((p - G.camPos) / B);
  let d = distance(p, G.camPos);
  let sz = 0.014 + 0.018 * h2.z * h2.z + 0.02 * far;
  let k = max(d * G.tanHalfFov / G.resolution.y * 7.0 / sz, 1.0);
  let c = corner(vi);
  var o: PO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(sz * k)), 1.0);
  o.c = c;
  let a = smoothstep(1.2, 4.5, d) * (1.0 - smoothstep(B * 0.36, B * 0.5, d)) * smoothstep(h2.y - 0.06, h2.y + 0.06, G.params.y) * (0.35 + 0.65 * h.z) * mix(1.0, 0.5, far) / k;
  o.a = vec4f(vec3f(0.36, 0.5, 0.82) * (0.5 + 0.2 * G.params.x) + WARM * vmap(p.xz).r * 1.2, a);
  return o;
}
@fragment fn fsSnow(in: PO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  return vec4f(in.a.rgb * (exp(-r2 * 4.0) * max(1.0 - r2, 0.0) * in.a.a), 0.0);
}
// ---- smoke (kind 0), powder falling from a bough (1), campfire flames (2) and sparks (3). instance: (pos, kind + seed) ----
@vertex fn vsSmoke(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> PO {
  let j = f32(vi / 6u); let kind = floor(a.w); let sd = fract(a.w); let t = G.time;
  let h = hash22(vec2f(j + 1.0, floor(sd * 991.0)));
  var p = a.xyz; var sz = 0.0; var al = 0.0; var col = vec3f(0.0); var em = 0.0;
  if (kind < 0.5) {
    let age = fract(t * 0.045 + j / 16.0 + sd);
    let k = floor(t * 0.045 + j / 16.0 + sd);
    let w = vec2f(sin(k * 1.7 + sd * 9.0), cos(k * 2.3)) * 0.5;
    p += vec3f(0.85 + w.x * 0.25, 0.0, 0.5 + w.y * 0.25) * (age * age * 9.0 + age * 1.2) + vec3f(w.x * age, 7.0 * (1.0 - exp(-age * 2.2)), w.y * age);
    sz = 0.45 + 3.4 * age;
    al = smoothstep(0.0, 0.05, age) * (1.0 - age) * (1.0 - age) * 0.3;
    col = (G.sunColor * 0.5 + G.ambientSky * 1.6 + AUR * 0.03 * G.params.x) * 0.55 + WARM * 0.22 * exp(-age * 9.0);
  } else if (kind < 1.5) {
    let P = 46.0 + 70.0 * sd; let lt = fract(t / P + sd * 7.0) * P; let age = lt / 5.0;
    p += vec3f((h.x - 0.5) * 1.6 + 0.4 * age, -(1.0 + 3.0 * h.y) * age - 3.0 * age * age - j * 0.25, (h.y - 0.5) * 1.6);
    sz = 0.3 + 1.1 * age;
    al = smoothstep(0.0, 0.08, age) * max(1.0 - age, 0.0) * 0.4;
    col = vec3f(0.8, 0.86, 0.96) * (G.sunColor * 0.6 + G.ambientSky * 1.5);
  } else if (kind < 2.5) {
    let age = fract(t * (0.42 + 0.25 * h.x) + j / 16.0 + h.y);
    p += vec3f((h.x - 0.5) * 0.5 * (1.0 - age) + 0.05 * sin(t * 1.7 + j), 0.1 + age * (0.65 + 0.5 * h.y), (h.y - 0.5) * 0.5 * (1.0 - age));
    sz = 0.3 * (1.0 - 0.7 * age);
    al = smoothstep(0.0, 0.2, age) * (1.0 - age) * 0.8;
    col = mix(vec3f(1.0, 0.5, 0.1), vec3f(0.9, 0.1, 0.02), age) * 1.5; em = 1.0;
  } else {
    let age = fract(t * 0.1 * (0.6 + h.x) + h.y + j / 16.0);
    p += vec3f(sin(age * 9.0 + j) * 0.25 + (h.x - 0.5) * 0.5 + age * 0.9, 0.3 + age * 3.4, cos(age * 7.0 + j * 2.0) * 0.25 + (h.y - 0.5) * 0.5 + age * 0.4);
    sz = 0.03; al = smoothstep(0.0, 0.05, age) * (1.0 - age) * (1.0 - age);
    col = vec3f(1.0, 0.45, 0.12) * 5.0; em = 1.0;
  }
  let c = corner(vi);
  var o: PO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(sz)), 1.0);
  o.c = c; o.a = vec4f(col, al * distFade(p, 300.0, 500.0)); o.e = em;
  return o;
}
@fragment fn fsSmoke(in: PO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let a = exp(-r2 * 4.5) * max(1.0 - r2, 0.0) * in.a.a;
  return vec4f(in.a.rgb * a, a * (1.0 - in.e));
}
// ---- lamp halos: small hot core, wide soft falloff ----
@vertex fn vsLamp(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> PO {
  let c = corner(vi);
  var o: PO;
  o.pos = G.viewProj * vec4f(billboard(vec3f(a.x, a.y * MIR, a.z), c, vec2f(1.5)), 1.0);
  o.c = c; o.a = vec4f(exp(-distance(a.xyz, G.camPos) * G.fogDensity));
  return o;
}
@fragment fn fsLamp(in: PO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  return vec4f(WARM * ((exp(-r2 * 50.0) * 1.2 + exp(-r2 * 8.0) * 0.16 + exp(-r2 * 2.5) * 0.03) * (1.0 - smoothstep(0.6, 1.0, r2)) * in.a.a), 0.0);
}
// ---- footprints: soft multiply decals. instance: (x, y, z, yaw; + 100 = small paw print) ----
@vertex fn vsPrint(@builtin(vertex_index) vi: u32, @location(3) a: vec4f) -> PO {
  let c = corner(vi);
  let sm = step(50.0, a.w); let k = 1.0 - 0.8 * sm;
  let w = a.xyz + rotY(a.w - 100.0 * sm) * vec3f(c.x * 0.1 * k, 0.035, c.y * 0.19 * k * (1.0 - 0.35 * sm));
  var o: PO;
  o.pos = G.viewProj * vec4f(w, 1.0);
  o.c = c; o.a = vec4f(distFade(w, 16.0, 34.0));
  return o;
}
@fragment fn fsPrint(in: PO) -> @location(0) vec4f {
  let c = in.c;
  let r = 0.5 - 0.1 * smoothstep(-0.1, 0.5, c.y);
  let d = length(vec2f(c.x, c.y - clamp(c.y, -0.45, 0.5))) / r;
  let a = smoothstep(1.15, 0.7, d) * in.a.a;
  let rim = smoothstep(0.9, 1.3, d) * smoothstep(1.9, 1.4, d) * in.a.a * c.y;
  return vec4f(mix(vec3f(1.0), vec3f(0.42, 0.5, 0.64), a) * (1.0 - 0.12 * rim), 1.0);
}
