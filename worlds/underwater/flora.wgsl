// Instanced blades (triangle strip, 10 verts): 0 seagrass, 1 anemone tentacle, 2 soft coral / sea whip, 3 glowing sea pen
struct Blade { a: vec4f, b: vec4f };   // a = (x, y, z, yaw), b = (height, width, type, phase)
@group(2) @binding(0) var<storage, read> blades: array<Blade>;

struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) k: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let B = blades[ii];
  let ty = B.b.z;
  let t = f32(vi / 2u) / 4.0;
  let sd = f32(vi % 2u) * 2.0 - 1.0;
  let base = B.a.xyz;
  let dist = distance(base, G.camPos);
  let px = dist * 2.0 * G.tanHalfFov * G.invResolution.y;
  let fade = 1.0 - uss(G.params.y * 0.55, G.params.y * 0.8, dist);
  let dir = vec3f(cos(B.a.w), 0.0, sin(B.a.w));
  let across = vec3f(-dir.z, 0.0, dir.x);
  let ph = B.b.w;
  let tm = G.time;
  var bend = 0.08 + 0.5 * fract(ph * 3.3); var curl = 0.0;
  if (ty > 0.5 && ty < 1.5) { bend = 0.75; curl = 0.6; }
  if (ty > 1.5) { bend = 0.08; }
  let pp = ph + B.a.w * 2.0 * step(0.5, ty);
  let sw = sin(tm * 0.7 + pp + base.x * 0.13) * 0.6 + sin(tm * 0.43 + pp * 1.7 + base.z * 0.11) * 0.4;
  let h = B.b.x * fade;
  let lean = dir * (bend + sw * 0.2) + vec3f(0.48, 0.0, 0.36) * (0.14 + 0.16 * sw) * step(ty, 0.5);
  let a = t * (1.0 - curl * t * 0.5);
  var p = base + vec3f(0.0, h * a, 0.0) + lean * h * t * t * 1.2 - vec3f(0.0, h * curl * t * t * t * 0.5, 0.0);
  var wd = B.b.y * select(1.0 - t * t, 1.0 - 0.35 * t, ty > 0.5);
  if (ty > 2.5) { wd = B.b.y * (0.2 + sin(PI * pow(t, 0.7))); }
  wd = max(wd, px * 0.6) * fade;
  // face the blade toward the camera a bit for thin round things (tentacles, whips, pens)
  var ax = across;
  if (ty > 0.5) { ax = normalize(cross(vec3f(0.0, 1.0, 0.0), G.camPos - base) + vec3f(0.0, 1e-4, 0.0)); }
  p += ax * sd * wd;
  var o: VO;
  o.w = p; o.n = normalize(dir * (0.3 - t) + vec3f(0.0, 0.5, 0.0) + cross(ax, vec3f(0.0, 1.0, 0.0)) * 0.6);
  o.k = vec4f(t, ty, sd, ph);
  o.pos = G.viewProj * vec4f(p, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let t = in.k.x; let ty = in.k.y; let ph = in.k.w;
  var n = normalize(in.n);
  let v = normalize(in.w - G.camPos);
  if (dot(n, v) > 0.0) { n = -n; }
  let hv = fract(ph * 7.31);
  var alb = mix(vec3f(0.18, 0.42, 0.12), vec3f(0.42, 0.55, 0.16), hv) * (0.55 + 0.6 * t);
  var em = vec3f(0.0);
  if (ty > 0.5 && ty < 1.5) {
    // anemone: warm coral / peach / rose bodies with pale glowing tips
    let tip = smoothstep(0.55, 1.0, t);
    let body = select(select(vec3f(1.0, 0.45, 0.3), vec3f(0.95, 0.28, 0.42), hv > 0.35), vec3f(1.0, 0.66, 0.25), hv > 0.7);
    alb = mix(body * (0.5 + 0.6 * t), vec3f(1.0, 0.92, 0.8), tip * 0.75) * (0.85 + 0.3 * in.k.z * in.k.z);
    em = body * tip * 0.06;
  } else if (ty > 1.5 && ty < 2.5) {
    alb = mix(vec3f(0.95, 0.45, 0.12), vec3f(0.95, 0.75, 0.2), hv) * (0.7 + 0.4 * t);
  } else if (ty > 2.5) {
    // deep-floor sea pens: soft glowing feathers
    alb = vec3f(0.3, 0.32, 0.4);
    let pulse = 0.55 + 0.45 * sin(G.time * (0.4 + hv * 0.3) + ph * 6.0 - t * 2.0);
    em = mix(vec3f(0.1, 0.9, 1.0), vec3f(0.6, 0.35, 1.0), hv) * (0.15 + 0.85 * t * t) * pulse * 0.3 * (1.0 - 0.6 * in.k.z * in.k.z);
  } else {
    alb *= 0.8 + 0.4 * smoothstep(0.5, 0.0, abs(in.k.z));   // lighter midrib
  }
  let ao = mix(0.45, 1.0, t);
  var c = uwLit(alb, n, in.w, causticsAt(in.w), ao);
  c += em * (1.0 - fogF(distance(in.w, G.camPos)));
  return vec4f(c, 1.0);
}
