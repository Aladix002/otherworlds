// Turtles, stingray, mantas, whale shark: CPU-animated instances (pos/scale, fwd/phase, up/kind), deformed in the VS.
struct Crit { p: vec4f, f: vec4f, u: vec4f };
@group(2) @binding(0) var<storage, read> crits: array<Crit>;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) k: vec2f };

fn rotAxis(v: vec3f, piv: vec3f, axis: vec3f, a: f32) -> vec3f {
  let q = quatAxisAngle(axis, a); return piv + quatRotate(q, v - piv);
}
@vertex fn vs(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let C = crits[ii];
  let kind = C.u.w; let ph = C.f.w;
  var lp = p; var n = nn;
  if (kind < 0.5) {           // turtle: slow flying strokes
    let sd = uv.y;
    if (uv.x > 1.5 && uv.x < 2.5) {
      let piv = vec3f(sd * 0.22, 0.0, 0.3);
      let a = sin(ph) * 0.55 * sd;
      lp = rotAxis(lp, piv, vec3f(0.0, 0.0, 1.0), a); n = quatRotate(quatAxisAngle(vec3f(0.0, 0.0, 1.0), a), n);
      let b = cos(ph) * 0.3 * sd;
      lp = rotAxis(lp, piv, vec3f(0.0, 1.0, 0.0), b); n = quatRotate(quatAxisAngle(vec3f(0.0, 1.0, 0.0), b), n);
    } else if (uv.x > 2.5) {
      let piv = vec3f(sd * 0.2, 0.0, -0.5);
      let a = sin(ph + 1.2) * 0.25 * sd;
      lp = rotAxis(lp, piv, vec3f(0.0, 0.0, 1.0), a);
    } else if (lp.z > 0.5) { lp.x += sin(ph * 0.5) * 0.03 * (lp.z - 0.5); }
  } else if (kind < 2.5) {    // rays: travelling wing wave (stingray) / big slow flaps (manta)
    let manta = step(1.5, kind);
    let ax = abs(lp.x);
    let k = mix(4.0, 1.0, manta);
    let amp = mix(0.07, 0.34, manta) * pow(ax, 1.6);
    let wv = sin(ph * mix(2.0, 1.0, manta) - lp.z * k - ax * manta * 1.5);
    lp.y += amp * wv + manta * (0.12 * ax - 0.12 * ax * ax * ax);
    let sl = (mix(0.07, 0.34, manta) * 1.6 * pow(ax, 0.6) * wv + manta * (0.12 - 0.36 * ax * ax)) * sign(lp.x);
    if (uv.x < 0.5 || uv.x > 2.5) { n = normalize(n + vec3f(-sl, 0.0, 0.0) * sign(n.y)); }
    if (uv.x > 0.5 && uv.x < 1.5) { lp.x += sin(ph - lp.z * 6.0) * 0.04 * (-lp.z); }
  } else {                    // whale: slow vertical fluke beats
    let amp = 0.5 * pow(max(0.12 - lp.z, 0.0), 1.7);
    lp.y += sin(ph - lp.z * 4.0) * amp;
  }
  let fw = C.f.xyz; let up = C.u.xyz; let rt = normalize(cross(fw, up));
  var o: VO;
  o.w = C.p.xyz + (rt * lp.x + up * lp.y + fw * lp.z) * C.p.w;
  o.n = normalize(rt * n.x + up * n.y + fw * n.z);
  o.lp = p; o.k = vec2f(kind, uv.x);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  var n = normalize(in.n);
  let v = normalize(in.w - G.camPos);
  if (dot(n, v) > 0.0) { n = -n; }
  let kind = in.k.x; let pt = in.k.y; let lp = in.lp;
  var alb = vec3f(0.5);
  if (kind < 0.5) {
    if (pt < 0.5) {
      let vo = voronoi2(lp.xz * vec2f(5.0, 4.0));
      alb = mix(vec3f(0.42, 0.26, 0.09), vec3f(0.78, 0.55, 0.22), smoothstep(0.5, 0.0, vo.x) * 0.8 + 0.2 * fract(vo.z * 7.0));
      alb *= smoothstep(0.0, 0.08, vo.y - vo.x) * 0.6 + 0.4;
      alb = mix(alb, vec3f(0.85, 0.78, 0.55), step(lp.y, -0.02));
    } else {
      let vo = voronoi2(lp.xz * 22.0);
      alb = mix(vec3f(0.35, 0.33, 0.22), vec3f(0.75, 0.7, 0.5), smoothstep(0.0, 0.06, vo.y - vo.x));
    }
  } else if (kind < 1.5) {
    alb = mix(vec3f(0.62, 0.52, 0.38), vec3f(0.92, 0.9, 0.85), step(lp.y, 0.0));
    alb *= 1.0 - 0.25 * step(0.75, fract(sin(dot(floor(lp.xz * 14.0), vec2f(12.9, 78.2))) * 43758.5)) * step(0.0, lp.y);
  } else if (kind < 2.5) {
    // manta: slate back with pale shoulder chevrons, white belly with grey wing margins (countershading)
    let ax = abs(lp.x);
    let back = mix(vec3f(0.07, 0.09, 0.12), vec3f(0.28, 0.32, 0.37), smoothstep(0.05, 0.0, abs(lp.z - 0.19 + ax * 0.5) - 0.012) * smoothstep(0.42, 0.28, ax) * smoothstep(0.04, 0.1, ax) * 0.7);
    var belly = mix(vec3f(0.8, 0.82, 0.82), vec3f(0.24, 0.28, 0.34), max(smoothstep(0.4, 1.0, ax), smoothstep(0.13, 0.0, lp.z + 0.42 - 0.34 * ax + 0.1 * ax * ax)) * 0.85);
    belly = mix(belly, vec3f(0.1, 0.11, 0.13), smoothstep(0.012, 0.0, abs(lp.z - 0.335 + ax * 0.2) - 0.006) * smoothstep(0.11, 0.08, ax));
    belly *= 1.0 - 0.5 * smoothstep(0.012, 0.004, abs(fract(lp.z * 16.0) - 0.5) * 0.06) * step(abs(ax - 0.11), 0.045) * step(abs(lp.z - 0.08), 0.13);
    alb = select(back, belly * (0.7 + 0.3 * abs(dot(n, v))), pt > 2.5);
    if (pt > 0.5 && pt < 2.5) { alb = mix(vec3f(0.08, 0.1, 0.13), vec3f(0.45, 0.48, 0.5), step(1.5, pt) * step(n.y, 0.0)); }
  } else {
    // whale: blue-grey back, pale throat with grooves
    let g = atan2(lp.x, -lp.y);
    alb = mix(vec3f(0.78, 0.8, 0.8) * (0.8 + 0.2 * smoothstep(0.2, 0.5, abs(fract(g * 7.0) - 0.5) * 2.0) ), vec3f(0.16, 0.2, 0.26), smoothstep(-0.045, 0.0, lp.y - 0.05 * lp.z));
    alb = mix(alb, vec3f(0.2, 0.24, 0.3), step(0.5, pt) * 0.8);
  }
  // soft rim: light scattered around the silhouette
  let rim = pow(1.0 - abs(dot(n, v)), 3.0) * step(1.5, kind);
  let c = uwLit(alb, n, in.w, causticsAt(in.w), 1.0) + lightAt(in.w.y) * 0.25 * pow(max(dot(reflect(v, n), SUN), 0.0), 20.0) * step(kind, 0.5) * step(pt, 0.5)
    + waterAt(in.w.y) * rim * 0.9 * (1.0 - fogF(distance(in.w, G.camPos)));
  return vec4f(c, 1.0);
}
