// Spirit forest postcard: the spawn view. An earth path through deep moss toward a glowing willow, dark gnarled trunks
// and low limbs at the sides, closed canopy, a wisp waiting on the path, fireflies and mint fungi.
fn pcSpirit_trunk(az: f32, h: f32, c: f32, w: f32) -> f32 {
  let x = abs(az - c - 0.05 * sin(h * 6.0 + c * 9.0) - 0.12 * h * sign(c));
  return smoothstep(0.03, -0.03, x - w * (0.55 + 0.9 * exp(-h * 9.0) + 0.5 * h));
}
fn pcSpirit_up(d: vec3f, az: f32, h: f32, t: f32) -> vec3f {
  // darkness between the trees with a thin teal mist near the ground
  var c = mix(vec3f(0.012, 0.034, 0.038), vec3f(0.004, 0.011, 0.013), smoothstep(0.0, 0.45, h));
  // far trunks as soft darker columns
  c *= 1.0 - 0.55 * smoothstep(0.1, 0.5, snoise2(vec2f(az * 7.0, 3.1))) * smoothstep(0.9, 0.1, h);
  // glowing willow: a dome of fine hanging strands straight ahead
  let wx = (az + 0.1) / 0.16; let wy = (h - 0.015) / 0.2;
  let dome = smoothstep(1.0, 0.5, wx * wx + wy * wy * max(wy, 0.0)) * smoothstep(-0.02, 0.03, h);
  let sn = 0.5 + 0.5 * snoise2(vec2f(az * 170.0, h * 2.0));
  c += vec3f(0.3, 1.0, 0.75) * dome * (0.05 + 0.5 * sn * sn * (0.65 + 0.35 * sin(h * 45.0 - t * 0.6 + sn * 9.0))) * (0.35 + 0.65 * smoothstep(0.2, 0.02, h));
  // near trunks at the sides with low limbs arching over the path
  let la = abs(az + 0.05);
  let lh = h - 0.1 - 0.26 * (0.85 - la) - 0.025 * snoise2(vec2f(az * 5.0, 4.0));
  let limb = smoothstep(0.012, -0.012, abs(lh) - 0.006 - 0.035 * la) * step(la, 0.85) * smoothstep(0.2, 0.3, la);
  let sil = max(max(pcSpirit_trunk(az, h, -0.82, 0.13), pcSpirit_trunk(az, h, 0.7, 0.11)), max(limb, pcSpirit_trunk(az, h, 1.9, 0.2)));
  let moss = 0.5 + 0.5 * snoise2(vec2f(az * 9.0, h * 9.0));
  c = mix(c, vec3f(0.004, 0.012, 0.006) + vec3f(0.012, 0.04, 0.01) * moss * smoothstep(0.5, 0.0, h), sil);
  c = mix(c, vec3f(0.024, 0.064, 0.068), exp(-h * 16.0) * 0.85);
  // canopy closing overhead
  let q = d.xz / (max(d.y, 0.0) + 0.4);
  let lf = fbm2(q * 2.3 + 3.0, 3);
  let can = smoothstep(0.26, 0.44, h + 0.16 * lf);
  c = mix(c, vec3f(0.004, 0.012, 0.008) * (1.0 + 1.5 * smoothstep(0.0, 0.5, lf)), can);
  return c;
}
fn postcard(rd: vec3f, t: f32) -> vec3f {
  let d = normalize(rd);
  let az = atan2(d.x, -d.z);
  let h = d.y / max(length(d.xz), 1e-3);
  // fireflies: sparse soft dots, slowly flashing
  let fv = voronoi2(vec2f(az * 9.0 + sin(t * 0.1) * 0.2, h * 9.0 + t * 0.015));
  let fl = max(sin(t * 0.9 + fv.z * 40.0), 0.0);
  var add = vec3f(0.9, 0.9, 0.2) * exp(-fv.x * fv.x * 1100.0) * step(0.6, fv.z) * fl * fl * 1.3 * smoothstep(0.55, 0.0, abs(h - 0.02));
  // the wisp waiting on the path
  let wv = vec2f(az + 0.03, h + 0.035 - 0.006 * sin(t * 0.5));
  add += vec3f(0.62, 0.9, 1.0) * (exp(-dot(wv, wv) * 6000.0) * 2.0 + exp(-dot(wv, wv) * 250.0) * 0.12);
  var c: vec3f;
  if (d.y >= 0.0) { c = pcSpirit_up(d, az, h, t); }
  else {
    // moss floor under the spawn eye, the path winding to the willow, fungi glow, mist with distance
    let k = 1.6 / -d.y;
    let p = d.xz * k;
    let n1 = fbm2(p * 0.4, 3); let n2 = vnoise2(p * 3.1 + 5.0);
    var g = mix(vec3f(0.006, 0.02, 0.005), vec3f(0.03, 0.085, 0.014), 0.5 + 0.5 * n1) * (0.8 + 0.4 * n2);
    let px = p.x - 0.1 * p.y - 1.3 * sin(p.y * 0.11) + 0.5 * n1;
    g = mix(g, vec3f(0.007, 0.007, 0.006) * (0.8 + 0.6 * n2), smoothstep(1.5, 0.6, abs(px)));
    let mv = voronoi2(p * 0.55 + 2.0);
    let ms = step(0.72, mv.z) * smoothstep(1.2, 3.0, abs(px));
    g += vec3f(0.1, 1.0, 0.5) * ms * (exp(-mv.x * mv.x * 260.0) * 0.9 + exp(-mv.x * mv.x * 14.0) * 0.03);
    let wl = p - vec2f(-3.0, -27.0);
    g += g * vec3f(0.42, 1.0, 0.86) * 5.0 * exp(-dot(wl, wl) / 70.0);
    c = mix(g, vec3f(0.024, 0.064, 0.068), 1.0 - exp(-length(p) * 0.028));
  }
  return (c + add) * 1.4;
}
