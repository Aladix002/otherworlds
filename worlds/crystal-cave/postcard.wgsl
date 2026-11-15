// Crystal cave postcard: the spawn view. A violet hall crossed by milky selenite beams, amethyst clusters glowing at the
// floor line and the cyan mouth of the pool chamber ahead.
fn pcCave_bar(p: vec2f, a: vec2f, b: vec2f, w: f32) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  let d = length(pa - ba * h) / w;
  return (1.0 - smoothstep(0.75, 1.0, d)) * (0.45 + 0.55 * (1.0 - d * d));
}
fn pcCave_spikes(p: vec2f, c: vec2f, s: f32, seed: f32) -> f32 {
  var m = 0.0;
  for (var i = 0; i < 5; i++) {
    let fi = f32(i);
    let a = (fi - 2.0) * 0.3 + 0.2 * sin(seed * 7.0 + fi * 2.3);
    let hgt = 0.55 + 0.45 * fract(sin(seed * 31.0 + fi * 12.7) * 43.7);
    let q = rot2(a) * ((p - c) / s) + vec2f((fi - 2.0) * -0.12, 0.0);
    let w = 0.11 * hgt + 0.03;
    let k = abs(q.x) + max(q.y - 0.7 * hgt, 0.0) * w / (0.3 * hgt);
    m = max(m, (1.0 - smoothstep(w * 0.7, w, k)) * step(0.0, q.y) * (0.25 + 1.3 * exp(-q.y * 3.5) + 0.3 * (1.0 - smoothstep(0.0, w, abs(abs(q.x) - w * 0.5)))));
  }
  return m;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let az = atan2(rd.x, -rd.z);
  let el = asin(clamp(rd.y, -1.0, 1.0));
  let p = vec2f(az, el);
  let pm = vec2f(abs(az) - 1.9, el);                     // mirrored copies fill the sides and the back
  let breathe = 0.9 + 0.1 * sin(t * 0.31);
  // rock: violet walls, darker floor and ceiling, soft light pools
  let n = fbm2(p * vec2f(3.0, 4.0) + 2.0, 3);
  var c = mix(vec3f(0.045, 0.03, 0.095), vec3f(0.075, 0.045, 0.16), smoothstep(-0.5, 0.5, n)) * (1.0 - 0.55 * smoothstep(0.25, 1.2, abs(el)));
  let fl = smoothstep(-0.16, -0.24, el + 0.03 * sin(az * 3.0));
  c = mix(c, vec3f(0.035, 0.028, 0.075) * (1.0 + 0.5 * n), fl);
  c += vec3f(0.3, 0.1, 0.6) * (exp(-dot(p - vec2f(0.6, 0.08), p - vec2f(0.6, 0.08)) * 14.0) + exp(-dot(p - vec2f(-0.3, 0.24), p - vec2f(-0.3, 0.24)) * 30.0)
    + exp(-dot(pm - vec2f(0.3, 0.1), pm - vec2f(0.3, 0.1)) * 8.0)) * 0.3 * breathe;
  c += vec3f(0.2, 0.25, 0.4) * exp(-dot(p - vec2f(-0.1, 0.1), p - vec2f(-0.1, 0.1)) * 18.0) * 0.25;
  // mouth of the pool chamber
  let d = (p - vec2f(-0.17, -0.15)) / vec2f(0.12, 0.1);
  c = mix(c, vec3f(0.02, 0.2, 0.3) * (0.6 + 0.5 * n), (1.0 - smoothstep(0.7, 1.0, length(d))) * (1.0 - fl));
  // amethyst clusters
  let s = pcCave_spikes(p, vec2f(-0.74, -0.27), 0.3, 1.0) + pcCave_spikes(p, vec2f(-0.27, -0.2), 0.11, 2.0) + pcCave_spikes(p, vec2f(0.5, -0.21), 0.15, 3.0)
    + pcCave_spikes(pm, vec2f(0.2, -0.25), 0.22, 4.0);
  c = mix(c, vec3f(0.5, 0.2, 1.0) * s * breathe, clamp(s * 3.0, 0.0, 1.0));
  // selenite beams
  let b = max(max(pcCave_bar(p, vec2f(-1.0, 0.5), vec2f(0.1, 0.43), 0.05), pcCave_bar(p, vec2f(-0.05, 0.9), vec2f(0.39, -0.26), 0.04)),
    max(max(pcCave_bar(p, vec2f(-0.44, 0.42), vec2f(-1.0, -0.27), 0.036), pcCave_bar(p, vec2f(0.15, 0.12), vec2f(-0.06, -0.26), 0.026)),
    max(pcCave_bar(pm, vec2f(-0.4, 0.9), vec2f(0.1, -0.28), 0.05), pcCave_bar(pm, vec2f(0.9, 0.7), vec2f(0.45, -0.28), 0.04))));
  let bb = b * smoothstep(-0.3, -0.19, el);
  c = mix(c, vec3f(0.42, 0.5, 0.68) * (0.35 + 0.75 * bb), clamp(bb * 2.5, 0.0, 1.0));
  return c * vec3f(0.62, 0.6, 0.66);
}
