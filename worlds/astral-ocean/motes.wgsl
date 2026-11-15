// Stateless stardust motes wrapped in a box around the camera (faded before the wrap), for near parallax.
const BOX = 34.0;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let h = hash3u(vec3u(ii, 11u, 23u));
  let h2 = hash3u(vec3u(ii, 2u, 41u));
  let t = G.time;
  var p = h * BOX + vec3f(0.06, 0.025, 0.04) * t + 0.5 * vec3f(sin(t * 0.13 + h2.x * 30.0), sin(t * 0.11 + h2.y * 30.0), sin(t * 0.09 + h2.z * 30.0));
  var rel = p - G.camPos;
  rel -= BOX * round(rel / BOX);
  p = G.camPos + rel;
  let d = length(rel);
  let px = aoPix(d);
  let r = 0.018 + 0.03 * h2.x * h2.x;
  let rs = max(r, px * 1.4);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(rs)), 1.0);
  o.c = c;
  let tint = mix(mix(vec3f(0.6, 0.75, 1.5), vec3f(1.5, 0.6, 1.2), step(0.6, h2.y)), vec3f(1.5, 1.1, 0.6), step(0.85, h2.y));
  let tw = 0.6 + 0.4 * sin(t * (0.5 + h2.z) + h.x * 50.0);
  o.col = tint * tw * (r / rs) * (r / rs) * 1.8 * smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(BOX * 0.3, BOX * 0.48, d));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let a = exp(-dot(in.c, in.c) * 5.0) - 0.0067;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
