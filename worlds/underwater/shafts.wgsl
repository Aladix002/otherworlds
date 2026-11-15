// God rays: many thin soft additive light blades along the sun direction, wrapped around the camera, slowly
// breathing, each with its own width / brightness, fading with depth.
const CELL = 64.0;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) a: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let c = vec2f(f32(vi % 2u) * 2.0 - 1.0, f32(vi / 2u) / 10.0);
  let h = hash3u(vec3u(ii, 7u, 31u));
  let g = hash3u(vec3u(ii, 3u, 77u));
  let cy = G.camPos.y;
  let D = normalize(SUN + vec3f(g.x - 0.5, 0.0, g.y - 0.5) * 0.16);
  // position at the camera's depth, wrapped into a cell around the camera
  let rel = (fract(h.xy - G.camPos.xz / CELL) - 0.5) * CELL;
  let P = vec3f(G.camPos.x + rel.x, cy, G.camPos.z + rel.y);
  let topT = (-0.5 - cy) / D.y;
  let len = topT + 22.0 + 22.0 * g.z;
  let bot = P + D * (topT - len);
  let mid = bot + D * (len * 0.5);
  let side = normalize(cross(D, G.camPos - mid));
  let wdt = 0.3 + 1.5 * h.z * h.z * h.z;
  let wp = bot + D * (len * c.y) + side * (c.x * wdt * (0.6 + 0.8 * (1.0 - c.y)));
  // intensity: slow breathing, fade with wrap distance, near-camera fade, deep fade
  let br = smoothstep(0.3, 0.85, sin(G.time * (0.05 + 0.04 * h.x) + h.y * 40.0) * 0.5 + 0.5 + (g.z - 0.5) * 0.5) * (0.35 + 0.65 * g.x) / (0.45 + wdt * 0.5);
  let edge = 1.0 - uss(CELL * 0.28, CELL * 0.48, max(abs(rel.x), abs(rel.y)));
  let ax = G.camPos - mid; let dAxis = length(ax - D * dot(ax, D));
  let near = uss(wdt, 4.0 + wdt * 2.0, dAxis);
  let axisP = bot + D * (len * c.y);
  let ground = uss(0.5, 4.0, axisP.y - terrainH(axisP.xz));
  var o: VO;
  o.c = vec2f(c.x, c.y * len);
  o.a = vec3f(br * edge * near * ground * (1.0 - G.params.z) * (0.4 + 0.6 * G.params.w), len, axisP.y);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let x = in.c.x;
  let prof = exp(-x * x * 4.0) - 0.0183;
  let fromTop = in.a.y - in.c.y;
  let ends = uss(0.0, 2.0, fromTop) * uss(0.0, in.a.y * 0.6, in.c.y) * exp(-fromTop * 0.035);
  let y = min(in.a.z, -0.5);
  let col = lightAt(y) * mix(vec3f(0.1, 0.13, 0.11), vec3f(0.16, 0.13, 0.06), G.params.w) * prof * ends * in.a.x;
  return vec4f(col, 0.0);
}
