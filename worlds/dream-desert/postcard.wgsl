// Dream desert postcard: the spawn view. Looking down the slot canyon: flowing banded walls lit from gold (top) to
// violet (floor), a strip of dusk sky, rippled sand and a light beam with dancing dust landing ahead. No raymarching.
fn pcDes_ramp(L: f32) -> vec3f {
  var c = mix(vec3f(0.018, 0.006, 0.06), vec3f(0.16, 0.012, 0.2), smoothstep(0.0, 0.2, L));
  c = mix(c, vec3f(0.62, 0.035, 0.16), smoothstep(0.14, 0.4, L));
  c = mix(c, vec3f(1.35, 0.3, 0.03), smoothstep(0.36, 0.66, L));
  return mix(c, vec3f(2.4, 1.15, 0.3), smoothstep(0.62, 1.0, L));
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let den = abs(rd.x) + 0.09 * rd.y;
  let s = select(1e3, 1.756 / den, den > 1e-3);                 // inward-leaning walls
  let sf = select(1e3, -1.6 / rd.y, rd.y < -1e-3);              // sand floor
  let sd = sign(rd.x);
  var col: vec3f;
  if (sf < s) {
    let p = rd * sf;
    let rip = sin(p.z * 26.0 + p.x * 19.0 + 2.0 * sin(p.x * 2.0 + p.z));
    let pool = exp(-(pow(p.x + 0.2, 2.0) + pow(p.z + 12.0, 2.0)) / 2.2);
    col = mix(pcDes_ramp((0.24 + 0.06 * rip + 0.3 * exp(-abs(p.z + 12.0) * 0.2)) + pool), vec3f(0.3, 0.05, 0.1), 1.0 - exp(-sf * 0.02));
  } else {
    let p = rd * s; let y = p.y + 1.6;
    let fold = sin(p.z * 0.7 + 1.5 * sin(y * 0.9 + sd) + sd * 2.0);
    let sy = y + 0.5 * sin(p.z * 0.35 + sd) + 0.35 * fold;
    let band = 0.5 * sin(sy * 5.1) + 0.3 * sin(sy * 13.7 + 1.3);
    let L = (0.1 + 0.9 * exp(-max(17.0 - y, 0.0) / 9.0)) * (0.5 + 0.35 * fold + 0.25 * band) + 0.5 / (1.0 + (pow(p.z + 12.0, 2.0) + y * y) / 10.0);
    col = mix(pcDes_ramp(L), vec3f(0.3, 0.05, 0.1), 1.0 - exp(-s * 0.02));
    col = mix(col, vec3f(2.6, 1.4, 0.6), smoothstep(15.0, 18.0, y));
  }
  // the beam ahead and its dust
  let k = 12.0 / max(-rd.z, 0.05);
  let bx = rd.x * k + 0.2 - 0.14 * rd.y * k; let by = rd.y * k;
  let g = exp(-bx * bx * 1.3) * smoothstep(-1.75, -1.3, by) * step(0.0, -rd.z) * step(12.0, min(s, sf) + 3.0);
  let v = voronoi2(vec2f(bx * 7.0 + 0.6 * sin(by * 1.5 + t * 0.2), by * 7.0 + t * 0.05));
  col += vec3f(1.0, 0.5, 0.2) * g * 0.7 + vec3f(1.0, 0.8, 0.5) * exp(-v.x * v.x * 90.0) * g * (0.8 + 0.6 * sin(t * (0.5 + v.z) + v.z * 40.0));
  return col;
}
