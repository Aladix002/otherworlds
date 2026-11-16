// Turtles, rays, whales, dolphins, lantern fish, octopus, seahorses, moray: CPU-animated instances (pos/scale, fwd/phase, up/kind), deformed in the VS.
struct Crit { p: vec4f, f: vec4f, u: vec4f };
@group(2) @binding(0) var<storage, read> crits: array<Crit>;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) k: vec4f };

fn rotAxis(v: vec3f, piv: vec3f, axis: vec3f, a: f32) -> vec3f {
  let q = quatAxisAngle(axis, a); return piv + quatRotate(q, v - piv);
}
@vertex fn vs(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let C = crits[ii];
  let kind = floor(C.u.w + 0.01); let ph = C.f.w;
  var lp = p; var n = nn;
  if (kind < 0.5) {           // turtle: slow flying strokes
    let sd = uv.y;
    if (uv.x > 1.5 && uv.x < 2.5) {
      let piv = vec3f(sd * 0.22, 0.0, 0.3);
      let a = sin(ph) * 0.38 * sd;
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
    // mantas: the wings bend progressively toward the tips, which lag behind the stroke and curl
    let A = mix(0.07, 0.46, manta);
    let wa = ph * mix(2.0, 1.0, manta) - lp.z * k - ax * manta * 2.4;
    let wv = sin(wa);
    lp.y += A * pow(ax, 1.6) * wv + manta * (0.12 * ax - 0.12 * ax * ax * ax + 0.1 * ax * ax * ax * sin(wa - 1.3));
    lp.x *= 1.0 - manta * 0.2 * ax * wv * wv;
    let sl = (A * (1.6 * pow(ax, 0.6) * wv - 2.4 * manta * pow(ax, 1.6) * cos(wa)) + manta * (0.12 - 0.36 * ax * ax)) * sign(lp.x);
    if (uv.x < 0.5 || uv.x > 2.5) { n = normalize(n + vec3f(-sl, 0.0, 0.0) * sign(n.y)); }
    if (uv.x > 0.5 && uv.x < 1.5) { lp.x += sin(ph - lp.z * 6.0) * 0.04 * (-lp.z); }
  } else if (kind < 4.5) {    // whale, dolphin: slow vertical fluke beats
    let amp = 0.5 * pow(max(0.12 - lp.z, 0.0), 1.7);
    lp.y += sin(ph - lp.z * 4.0) * amp;
  } else if (kind < 5.5) {    // lantern fish: tail wiggle, bobbing lure
    lp.x += sin(ph - lp.z * 4.0) * 0.5 * pow(max(-0.05 - lp.z, 0.0), 1.5);
    lp.z += sin(ph * 0.6) * 0.15 * max(lp.y - 0.33, 0.0);
  } else if (kind < 6.5) {    // octopus: arms curl and uncurl, the mantle breathes
    let r = length(lp.xz);
    if (uv.x > 0.5 && uv.x < 1.5) {
      let q = rot2(0.45 * sin(ph * 0.5 + uv.y * 1.7 + r * 3.0) * r) * lp.xz;
      // the front arms drape down the temple steps
      lp = vec3f(q.x, lp.y + 0.03 * r * r * (1.0 + sin(ph * 0.4 + uv.y * 2.3)) - 0.15 * (smoothstep(0.08, 0.14, q.y) + smoothstep(0.3, 0.36, q.y) + smoothstep(0.52, 0.58, q.y)), q.y);
    } else if (lp.z < -0.06) { lp = vec3f(0.0, 0.2, -0.1) + (lp - vec3f(0.0, 0.2, -0.1)) * (1.0 + 0.06 * sin(ph * 0.9)); }
  } else if (kind > 7.5) {    // moray: ph = how far it reaches out of its pot
    lp.z = (lp.z + 0.6) * (0.25 + 0.75 * ph) - 0.6;
    let o = max(lp.z + 0.3, 0.0);
    lp.x += sin(G.time * 0.7 - lp.z * 2.5) * 0.12 * o;
    lp.y += 0.3 * o * o + sin(G.time * 0.45) * 0.05 * o;
  }
  let fw = C.f.xyz; let up = C.u.xyz; let rt = normalize(cross(fw, up));
  var o: VO;
  o.w = C.p.xyz + (rt * lp.x + up * lp.y + fw * lp.z) * C.p.w;
  o.n = normalize(rt * n.x + up * n.y + fw * n.z);
  o.lp = p; o.k = vec4f(kind, uv.x, fract(C.u.w) / 0.45, ph);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  var n = normalize(in.n);
  let v = normalize(in.w - G.camPos);
  if (dot(n, v) > 0.0) { n = -n; }
  let kind = in.k.x; let pt = in.k.y; let lp = in.lp; let gl = in.k.z;
  var alb = vec3f(0.5); var em = vec3f(0.0);
  if (kind < 0.5) {
    if (pt < 0.5) {
      let vo = voronoi2(lp.xz * vec2f(5.0, 4.0));
      alb = mix(vec3f(0.16, 0.13, 0.06), vec3f(0.44, 0.36, 0.15), smoothstep(0.5, 0.0, vo.x) * 0.8 + 0.2 * fract(vo.z * 7.0)) * (0.6 + 0.8 * fract(vo.z * 13.0));
      alb *= smoothstep(0.0, 0.08, vo.y - vo.x) * 0.6 + 0.4;
      alb = mix(alb, vec3f(0.7, 0.64, 0.42), step(lp.y, -0.02));
    } else {
      let vo = voronoi2(lp.xz * 13.0);
      alb = mix(vec3f(0.42, 0.4, 0.24), vec3f(0.2, 0.22, 0.12), smoothstep(0.02, 0.1, vo.y - vo.x)) * (1.0 - step(3.5, pt));
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
  } else if (kind < 4.5) {
    // whale: blue-grey back, pale throat with grooves. dolphin: lighter grey, smooth
    let g = atan2(lp.x, -lp.y); let dol = step(3.5, kind);
    alb = mix(vec3f(0.78, 0.8, 0.8) * (0.8 + 0.2 * max(dol, smoothstep(0.2, 0.5, abs(fract(g * 7.0) - 0.5) * 2.0))), mix(vec3f(0.16, 0.2, 0.26), vec3f(0.3, 0.36, 0.42), dol), smoothstep(-0.045, 0.0, lp.y - 0.05 * lp.z + dol * 0.02));
    alb = mix(alb, vec3f(0.2, 0.24, 0.3), step(0.5, pt) * 0.8);
  } else if (kind < 5.5) {
    // lantern fish: a near-black body lit only by its own lure, small glowing eyes, rows of cyan dots
    let vo = voronoi2(lp.zy * 9.0);
    alb = vec3f(0.035, 0.03, 0.07);
    let lu = vec3f(0.0, 0.54, 0.7) - lp;
    em = vec3f(0.1, 0.9, 1.0) * smoothstep(0.16, 0.06, vo.x) * step(abs(lp.y + 0.03), 0.17) * step(pt, 0.5) * step(lp.z, 0.2) * (0.25 + 0.2 * sin(G.time * 0.8 + vo.z * 20.0))
      + vec3f(1.0, 0.72, 0.3) * (step(2.5, pt) * (1.0 + 4.0 * gl) + pow(max(dot(normalize(lp / vec3f(0.09, 0.11, 0.18)), normalize(lu)), 0.0), 2.0) * (0.03 + 0.14 * gl) / (0.1 + 6.0 * dot(lu, lu)));
    if (pt > 1.5 && pt < 2.5) {
      let ec = vec3f(sign(lp.x) * 0.2, 0.1, 0.27);
      em = vec3f(0.5, 0.9, 1.0) * 0.14 * (1.0 - smoothstep(0.72, 0.8, dot(normalize(lp - ec), normalize(vec3f(sign(lp.x) * 0.7, 0.05, 0.7)))));
    }
  } else if (kind < 6.5) {
    // octopus: slow waves of colour wash over the skin (coral, violet, teal, marble-pale), ringed with pale spots
    let nz = textureSampleLevel(tNoise, sRep, lp.xz * 0.9 + G.time * 0.004, 0.0);
    let q = fract(G.time * 0.045 + 0.45 + nz.r * 0.35 + length(lp.xz) * 0.3 + gl * (0.25 + 0.1 * sin(G.time * 0.9))) * 4.0;
    let OC = array<vec3f, 5>(vec3f(0.75, 0.26, 0.1), vec3f(0.9, 0.45, 0.2), vec3f(0.5, 0.16, 0.24), vec3f(0.78, 0.6, 0.42), vec3f(0.75, 0.26, 0.1));
    alb = mix(OC[u32(q)], OC[u32(q) + 1u], smoothstep(0.2, 0.8, fract(q))) * (0.7 + 0.5 * nz.g);
    let vo = voronoi2(lp.xz * 13.0 + lp.y * 9.0);
    alb = mix(alb, vec3f(1.0, 0.95, 0.85), smoothstep(0.03, 0.0, abs(vo.x - 0.24) - 0.035) * 0.5);
    if (pt > 1.5) { alb = mix(vec3f(0.95, 0.8, 0.35), vec3f(0.02), step(abs(lp.y - 0.2), 0.012)); }
  } else if (kind < 7.5) {
    // seahorses: yellow, orange or pink with fine rings
    let hv = fract(in.k.w * 3.7);
    alb = select(select(vec3f(1.0, 0.8, 0.15), vec3f(1.0, 0.42, 0.1), hv > 0.35), vec3f(1.0, 0.45, 0.6), hv > 0.7) * (0.75 + 0.25 * sin(lp.y * 110.0)) * (1.0 - 0.9 * step(1.5, pt));
  } else {
    // moray: golden with dark freckles, pale belly, round dark eyes
    let vo = voronoi2(lp.zy * vec2f(16.0, 30.0));
    alb = mix(vec3f(0.85, 0.66, 0.16) * (1.0 - 0.6 * smoothstep(0.3, 0.15, vo.x)), vec3f(0.95, 0.9, 0.7), smoothstep(0.0, -0.035, lp.y)) * (1.0 - 0.95 * step(1.5, pt));
  }
  // soft rim: light scattered around the silhouette
  let rim = pow(1.0 - abs(dot(n, v)), 3.0) * step(1.5, kind) * step(kind, 5.5);
  let c = uwLit(alb, n, in.w, causticsAt(in.w), 1.0) + lightAt(in.w.y) * 0.6 * pow(max(dot(reflect(v, n), SUN), 0.0), 40.0) * step(kind, 0.5) * step(pt, 0.5)
    + (waterAt(in.w.y) * rim * 0.9 + em) * (1.0 - fogF(distance(in.w, G.camPos)));
  return vec4f(c, 1.0);
}
