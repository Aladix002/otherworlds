// shared helpers. world.js prepends: NB, BF, BD (beam floor points / directions), BLEN, DOORP.
const BR0 = 1.15;                    // beam radius at the floor
const BR1 = 0.75;                    // ... and up in the chimney
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
fn beamF(i: i32) -> vec3f { var a = BF; return a[i]; }
fn beamD(i: i32) -> vec3f { var a = BD; return a[i]; }
// the canyon light ramp: deep violet shade -> magenta -> hot pink -> orange -> gold
fn ramp(L: f32) -> vec3f {
  var c = mix(vec3f(0.018, 0.006, 0.06), vec3f(0.16, 0.012, 0.2), smoothstep(0.0, 0.2, L));
  c = mix(c, vec3f(0.62, 0.035, 0.16), smoothstep(0.14, 0.4, L));
  c = mix(c, vec3f(1.35, 0.3, 0.03), smoothstep(0.36, 0.66, L));
  c = mix(c, vec3f(2.4, 1.15, 0.3), smoothstep(0.62, 1.0, L));
  return c * (1.0 + max(L - 1.0, 0.0) * 1.4);
}
// light of the beams landing on a surface point: soft discs around each axis
fn beamSpot(p: vec3f) -> f32 {
  var s = 0.0;
  for (var i = 0; i < NB; i++) {
    let q = p - beamF(i); let d = beamD(i); let h = dot(q, d);
    let R = mix(BR0, BR1, clamp(h / BLEN, 0.0, 1.0));
    s += exp(-(dot(q, q) - h * h) / (R * R) * 2.2) * step(-1.5, h);
  }
  return s;
}
// night sky colours shared by the sky pass and the fog
fn duskCol(rd: vec3f) -> vec3f {
  let y = max(rd.y, 0.0);
  let c = mix(vec3f(0.8, 0.16, 0.42), vec3f(1.7, 0.6, 0.3), smoothstep(0.0, 0.5, y));
  return mix(c, vec3f(2.6, 1.4, 0.6), smoothstep(0.35, 1.0, y));
}
