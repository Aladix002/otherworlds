// Giant kelp: one indexed "parameter mesh" (stipe rings + blades) instanced per plant, shaped and swayed in the VS.
// vertex: p = (angle, yN, side), uv.x = 0 stipe | 1 + t blade, uv.y = per-blade random
struct Kelp { a: vec4f, b: vec4f };   // a = (x, yBase, z, height), b = (phase, bladeLen, tint, _)
@group(2) @binding(0) var<storage, read> kelps: array<Kelp>;
@group(2) @binding(1) var<storage, read> vis: array<u32>;

const CUR = vec3f(0.8, 0.0, 0.6);
fn kelpOff(s: f32, H: f32, ph: f32) -> vec3f {
  let t = G.time;
  let a = sin(t * 0.31 + ph + s * 1.7) * 0.6 + sin(t * 0.19 + ph * 1.7 + s * 2.9) * 0.4;
  let b = sin(t * 0.27 + ph * 2.3 + s * 2.2);
  return (CUR * (a * 0.055 + 0.07) + vec3f(-0.6, 0.0, 0.8) * b * 0.03) * H * s * s;
}

struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) k: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let K = kelps[vis[ii]];
  let H = K.a.w;
  let s = p.y;
  let base = vec3f(K.a.x, K.a.y + s * H, K.a.z) + kelpOff(s, H, K.b.x);
  let dist = distance(base, G.camPos);
  let px = dist * 2.0 * G.tanHalfFov * G.invResolution.y;
  var w: vec3f; var n: vec3f;
  if (uv.x < 0.5) {
    let r = max(0.035 * (1.3 - 0.5 * s), px * 0.8);
    n = vec3f(cos(p.x), 0.0, sin(p.x));
    w = base + n * r;
  } else {
    let t = uv.x - 1.0;
    var dir = vec3f(cos(p.x), 0.0, sin(p.x));
    dir = normalize(dir + CUR * 0.7 + vec3f(0.0, 0.35, 0.0));
    let L = K.b.y * (0.75 + 0.5 * uv.y);
    let fl = sin(G.time * 0.9 + t * 4.0 + p.x * 3.0 + K.b.x) * 0.1;
    let along = dir * (0.03 + L * t) + vec3f(0.0, -0.45 * L * t * t + fl * t, 0.0);
    let dal = dir * L + vec3f(0.0, -0.9 * L * t + fl, 0.0);
    let across = normalize(vec3f(-dir.z, 0.7 * sin(p.x * 5.0 + uv.y * 9.0), dir.x));
    let wd = max(0.16 * sin(PI * pow(max(t, 0.001), 0.6)) * (0.8 + 0.4 * uv.y) + 0.008, px * 0.7);
    w = base + along + across * (p.z * wd);
    n = normalize(cross(dal, across));
  }
  var o: VO;
  o.w = w; o.n = n; o.k = vec3f(s, uv.x, K.b.z);
  o.pos = G.viewProj * vec4f(w, 1.0);
  return o;
}
@fragment fn fs(in: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let wp = in.w;
  let blade = step(0.5, in.k.y);
  var n = normalize(in.n);
  let v = normalize(wp - G.camPos);
  if (blade > 0.5 && dot(n, v) > 0.0) { n = -n; }
  let tint = in.k.z;
  var alb = mix(vec3f(0.6, 0.36, 0.08), vec3f(1.0, 0.62, 0.1), blade);
  alb *= mix(vec3f(1.0), vec3f(1.1, 0.85, 0.65), tint);
  let t = in.k.y - 1.0;
  alb *= mix(1.0, 0.75 + 0.35 * t, blade);
  let L = lightAt(wp.y);
  let w = waterAt(wp.y);
  let ao = mix(0.35, 1.0, smoothstep(0.0, 0.7, in.k.x));
  let mu = max(dot(v, SUN), 0.0);
  let trans = (0.3 + 3.0 * mu * mu * mu + 0.6 * max(-n.y * sign(dot(v, SUN)), 0.0)) * blade;
  let dif = wrapDiffuse(n, SUN, 0.5);
  let c = alb * (L * (dif * 0.4 + trans * 0.55) * ao + w * mix(0.3, 0.9, n.y * 0.5 + 0.5) * (0.4 + 0.6 * ao)) + vec3f(0.1, 0.05, 0.0) * L * trans * ao;
  return vec4f(uwFog(c, wp), 1.0);
}
