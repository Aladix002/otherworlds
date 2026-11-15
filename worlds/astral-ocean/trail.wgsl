// Stateless stardust shed from the whales' fluke edge, flipper tips and tail stock: particle i was born at time
// t - age at its emitter, then drifts on a curl flow, spreads and fades. Deterministic in time.
override NT: u32 = 800u;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let k = ii / NT;
  let P = paths[k];
  let L = P.d.w;
  let ph = f32(k) * 2.1;
  let h = hash3u(vec3u(ii, 17u, 3u));
  let h2 = hash3u(vec3u(ii, 5u, 9u));
  let life = 16.0 + 10.0 * h2.x;
  let age = fract(G.time / life + h.x) * life;
  let tb = G.time - age;
  // emitter in whale-local L = 1 coords (x, y, s)
  var lp: vec3f;
  let e = h.y;
  if (e < 0.6) { let x = fract(e * 37.0) * 2.0 - 1.0; lp = vec3f(x * 0.16, 0.0, 0.985 + 0.05 * x * x); }
  else if (e < 0.85) {
    let fl = sin(tb * 0.5 + ph) * 0.6 + sin(tb * 0.29 + ph * 1.7) * 0.4;
    lp = vec3f(select(-0.21, 0.21, e < 0.725), -0.125 + 0.055 * fl, 0.45);
  }
  else { lp = vec3f(0.0, 0.0, 0.55 + 0.4 * fract(e * 10.0)); }
  let F = aoFrame(P, tb, lp.z);
  let jit = (h2 - 0.5) * (0.3 + 0.2 * age);
  var p = F.p + (F.r * lp.x + F.u * (lp.y + aoWave(lp.z, tb, ph))) * L + jit;
  p += curl3(p * 0.03 + h2.zxy * 3.0) * age * 0.14 + vec3f(0.0, 0.03, 0.0) * age;
  let d = distance(p, G.camPos);
  let px = aoPix(d);
  let r = 0.05 + 0.11 * h2.z * h2.z * h2.z;
  let rs = max(r, px * 2.4);
  let c = aoCorner(vi);
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(p, c, vec2f(rs)), 1.0);
  o.c = c;
  let env = smoothstep(0.0, 1.2, age) * pow(1.0 - age / life, 2.0);
  let tw = 0.65 + 0.35 * sin(G.time * (0.5 + 0.8 * h2.y) + h.x * 60.0);
  let tint = mix(vec3f(0.5, 0.8, 1.6), vec3f(1.5, 1.1, 0.7), step(0.72, h2.x));
  o.col = tint * env * tw * (r / rs) * (r / rs) * 2.2 * smoothstep(1.0, 4.0, d) * exp(-d * 0.004);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r2 = dot(in.c, in.c);
  let a = exp(-r2 * 5.0) - 0.0067 * r2;
  return vec4f(in.col * max(a, 0.0), 0.0);
}
