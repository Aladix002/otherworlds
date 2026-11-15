// Fallback postcard: a calm dawn gradient with a soft sun and distant hills.
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let h = rd.y;
  var sky = mix(vec3f(1.05, 0.72, 0.52), vec3f(0.22, 0.32, 0.62), smoothstep(-0.02, 0.55, h));
  sky = mix(sky, vec3f(0.55, 0.42, 0.6), smoothstep(0.35, 0.9, h) * 0.4);
  let sd = normalize(vec3f(0.25, 0.08, -1.0));
  let sun = max(dot(rd, sd), 0.0);
  sky += vec3f(1.6, 1.0, 0.6) * (pow(sun, 400.0) * 6.0 + pow(sun, 12.0) * 0.35);
  let az = atan2(rd.x, -rd.z);
  let hill = 0.04 + 0.035 * fbm2(vec2f(az * 2.0, 1.3), 4);
  let hill2 = 0.015 + 0.02 * fbm2(vec2f(az * 4.0 + 7.0, 3.1), 3);
  var c = sky;
  c = mix(c, vec3f(0.42, 0.33, 0.42), smoothstep(0.002, -0.002, h - hill) * 0.85);
  c = mix(c, vec3f(0.2, 0.17, 0.24), smoothstep(0.002, -0.002, h - hill2));
  return c;
}
