// Stateless stardust trails shed by the whales: particle i was born at time t - age on the whale's skin,
// then drifts on a curl flow and fades. Fully deterministic in time.
override NT: u32 = 600u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let k = ii / NT;
  let P = paths[k];
  let L = P.d.w;
  let h = hash3u(vec3u(ii, 17u, 3u));
  let h2 = hash3u(vec3u(ii, 5u, 9u));
  let life = 16.0 + 8.0 * h2.x;
  let age = fract(G.time / life + h.x) * life;
  let tb = G.time - age;
  let s = 0.3 + 0.72 * sqrt(h.y);
  let F = aoFrame(P, tb, s);
  let a = h.z * TAU;
  let rr = (0.06 * smoothstep(1.0, 0.6, s) + 0.02) * L * (0.8 + 0.5 * h2.y);
  var p = F.p + (F.r * cos(a) + F.u * sin(a)) * rr + F.u * aoWave(s, tb, f32(k) * 2.1) * L;
  p += curl3(p * 0.035 + h2 * 3.0) * age * 0.22 + vec3f(0.0, 0.04, 0.0) * age - F.f * age * 0.15;
  let d = distance(p, G.camPos);
  let px = aoPix(d);
  let r = 0.05 + 0.12 * h2.z;
  let rs = max(r, px * 1.6);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(rs)), 1.0);
  o.c = c;
  let env = smoothstep(0.0, 1.5, age) * pow(1.0 - age / life, 1.5);
  let tw = 0.55 + 0.45 * sin(G.time * (0.8 + 1.2 * h2.y) + h.x * 60.0);
  let tint = mix(vec3f(0.55, 0.8, 1.6), vec3f(1.5, 1.15, 0.7), step(0.7, h2.x));
  o.col = tint * env * tw * (r / rs) * (r / rs) * 1.4 * smoothstep(0.5, 2.0, d) * mix(1.0, 0.3, smoothstep(60.0, 300.0, d));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let a = exp(-r2 * 5.0) - 0.0067;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
