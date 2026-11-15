// _test postcard: the same rolling hills at golden dusk, with a low sun and drifting motes.
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let h = rd.y;
  var c = mix(vec3f(1.25, 0.62, 0.34), vec3f(0.18, 0.22, 0.48), smoothstep(-0.03, 0.5, h));
  let sd = normalize(vec3f(-0.3, 0.06, -1.0));
  let s = max(dot(rd, sd), 0.0);
  c += vec3f(2.2, 1.3, 0.6) * (pow(s, 600.0) * 8.0 + pow(s, 10.0) * 0.4);
  let az = atan2(rd.x, -rd.z);
  let far = 0.05 + 0.04 * fbm2(vec2f(az * 1.5, 0.7), 4);
  let near = 0.0 + 0.05 * fbm2(vec2f(az * 3.0 + 4.0, 2.2), 4);
  c = mix(c, vec3f(0.55, 0.36, 0.38), smoothstep(0.003, -0.003, h - far) * 0.8);
  c = mix(c, vec3f(0.16, 0.13, 0.16) + vec3f(0.3, 0.15, 0.05) * pow(s, 3.0), smoothstep(0.003, -0.003, h - near));
  // motes
  let g = rd.xy / max(0.2, -rd.z + 0.6) * 9.0 + vec2f(t * 0.05, sin(t * 0.1) * 0.2);
  let v = voronoi2(g);
  c += vec3f(1.6, 1.1, 0.5) * (1.0 - smoothstep(0.0, 0.05, v.x)) * step(0.8, v.z) * 0.8;
  return c;
}
