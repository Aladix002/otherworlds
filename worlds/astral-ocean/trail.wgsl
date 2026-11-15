// Stateless stardust ribbons shed from the whales' fluke tips, flipper tips and tail: particle i was born at time
// t - age at its emitter, then drifts slowly on a curl flow and fades. Deterministic in time.
override NT: u32 = 800u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let k = ii / NT;
  let P = paths[k];
  let L = P.d.w;
  let ph = f32(k) * 2.1;
  let h = hash3u(vec3u(ii, 17u, 3u));
  let h2 = hash3u(vec3u(ii, 5u, 9u));
  let life = 13.0 + 7.0 * h2.x;
  let age = fract(G.time / life + h.x) * life;
  let tb = G.time - age;
  // emitter in whale-local L = 1 coords (x, y, s)
  var lp: vec3f;
  let e = h.y;
  let fl = sin(tb * 0.5 + ph) * 0.6 + sin(tb * 0.29 + ph * 1.7) * 0.4;
  if (e < 0.6) { lp = vec3f(select(-0.155, 0.155, e < 0.3), 0.0, 0.975); }
  else if (e < 0.9) { lp = vec3f(select(-0.3, 0.3, e < 0.75), -0.15 + 0.05 * fl, 0.43); }
  else { lp = vec3f(0.0, 0.0, 0.5 + 0.45 * fract(e * 10.0)); }
  let F = aoFrame(P, tb, lp.z);
  let jit = (h2 - 0.5) * (0.25 + 0.06 * age);
  var p = F.p + (F.r * lp.x + F.u * (lp.y + aoWave(lp.z, tb, ph))) * L + jit;
  p += curl3(p * 0.03 + h2.zxy * 3.0) * age * 0.12 + vec3f(0.0, 0.03, 0.0) * age;
  let d = distance(p, G.camPos);
  let px = aoPix(d);
  let r = 0.06 + 0.1 * h2.z * h2.z;
  let rs = max(r, px * 1.5);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(rs)), 1.0);
  o.c = c;
  let env = smoothstep(0.0, 0.8, age) * pow(1.0 - age / life, 1.8);
  let tw = 0.6 + 0.4 * sin(G.time * (0.7 + 1.0 * h2.y) + h.x * 60.0);
  let tint = mix(vec3f(0.55, 0.85, 1.7), vec3f(1.6, 1.2, 0.75), step(0.75, h2.x));
  o.col = tint * env * tw * (r / rs) * (r / rs) * 2.6 * smoothstep(0.5, 2.0, d) * mix(1.0, 0.35, smoothstep(60.0, 300.0, d));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let a = exp(-dot(in.c, in.c) * 5.0) - 0.0067;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
