// living things: moths, light orbs, rising spores, blind fish (one instanced quad pipeline), glowing mushrooms, the sleeping salamander
const QC = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
struct LV { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) k: vec2f };
// a = home xyz + range | b = colour + kind (0 moth, 1 orb, 2 riser, 3 fish, 4 crystal jellyfish, 5 nebula) | c = seed, size, speed, rise height
@vertex fn vsLife(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> LV {
  var qc = QC; let q = qc[vi]; let sd = c.x; let t = G.time * c.z; let kind = b.w;
  var o: LV; o.c = q; o.k = vec2f(kind, G.time * 3.0 + sd * 20.0);
  var p = a.xyz; var fade = 1.0; var sz = vec2f(c.y);
  // wandering: incommensurate sines per axis
  let w = vec3f(sin(t * 0.37 + sd * 6.1) + 0.5 * sin(t * 0.83 + sd * 2.3), 0.5 * sin(t * 0.29 + sd * 4.7) + 0.3 * sin(t * 0.71 + sd),
    sin(t * 0.41 + sd * 3.3 + 1.7) + 0.5 * sin(t * 0.67 + sd * 5.9)) * a.w * 0.6;
  if (kind == 3.0) {
    // blind fish circle under the surface and drift away from your feet
    let r = a.w * (0.8 + 0.2 * sin(G.time * 0.13 + sd * 4.0));
    let ang = sd * 6.283 + G.time * 0.3 * c.z / a.w + 0.5 * sin(G.time * 0.21 + sd * 9.0);
    let cs = vec2f(cos(ang), sin(ang));
    var cc = p.xz + cs * r;
    let v = cc - G.camPos.xz; let d = length(v) + 1e-3;
    cc += v / d * 2.2 * (1.0 - smoothstep(0.5, 4.0, d));
    let h = vec2f(-cs.y, cs.x) * sign(c.z);
    let l = cc + (h * q.x + vec2f(-h.y, h.x) * q.y * 0.5) * c.y;
    p = vec3f(l.x, p.y, l.y);
    fade = 0.4;
    o.pos = G.viewProj * vec4f(p, 1.0);
  } else {
    if (kind == 2.0) {
      let f = fract(t * 0.05 + sd);
      p += vec3f(w.x * 0.4, f * c.w, w.z * 0.4);
      fade = smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.6, 1.0, f));
    } else if (kind >= 4.0) {
      // jellyfish swim with a slow pulse of the bell; the little nebula just hangs in the heart of the geode
      let pu = sin(G.time * 1.1 + sd * 10.0) * step(kind, 4.5);
      p += w * step(kind, 4.5) + vec3f(0.0, 0.25 * pu, 0.0);
      sz *= vec2f(1.0 - 0.1 * pu, 1.0 + 0.08 * pu);
      fade = mix(0.5, 1.0, kind - 4.0);
    } else {
      p += w;
      // moths and orbs come a little way toward you
      let tc = G.camPos - p; let d = length(tc);
      p += tc * mix(0.22, 0.4, kind) * (1.0 - smoothstep(4.0, 11.0, d)) * smoothstep(1.0, 4.0, d);
      if (kind == 0.0) { sz.x *= 0.2 + 0.8 * abs(sin(G.time * (11.0 + 4.0 * fract(sd * 7.0)) + sd * 40.0)); fade = 0.55; }
    }
    let d = distance(p, G.camPos);
    let px = d * 2.0 * G.tanHalfFov / G.resolution.y * 1.2;
    let s2 = max(sz, vec2f(px));
    fade *= sz.x * sz.y / (s2.x * s2.y) * smoothstep(0.4, 1.5 + 2.5 * step(abs(kind - 1.0), 0.1), d) * (1.0 - smoothstep(40.0, 60.0, d)) * exp(-d * G.fogDensity);
    o.pos = G.viewProj * vec4f(billboard(p, q, s2), 1.0);
  }
  o.col = b.rgb * fade * (0.8 + 0.2 * sin(G.time * 0.7 + sd * 30.0));
  return o;
}
@fragment fn fsLife(in: LV) -> @location(0) vec4f {
  let c = in.c; let r2 = dot(c, c); var m = 0.0;
  if (in.k.x == 0.0) {
    let q = vec2f(abs(c.x), c.y);
    let up = 1.0 - smoothstep(0.55, 1.0, length((q - vec2f(0.48, 0.22)) / vec2f(0.5, 0.55)));
    let lo = 1.0 - smoothstep(0.55, 1.0, length((q - vec2f(0.33, -0.42)) / vec2f(0.34, 0.4)));
    m = max(up, lo) * 0.7 + exp(-q.x * q.x * 90.0 - c.y * c.y * 5.0) * 1.5 + max(exp(-r2 * 2.5) - 0.08, 0.0) * 0.25;
  } else if (in.k.x == 1.0) {
    m = exp(-r2 * 22.0) * 1.6 + max(exp(-r2 * 3.0) - 0.05, 0.0) * 0.3;
  } else if (in.k.x == 2.0) {
    m = max(exp(-r2 * 4.0) - 0.02, 0.0);
  } else {
    // fish from above: head at +x, the tail swings
    let x = c.x; let yo = 0.3 * sin(x * 2.4 - in.k.y) * (1.0 - x) * 0.5;
    let y = abs(c.y - yo);
    let bw = select(0.1 + 0.75 * (-0.4 - x), 0.5 * sqrt(max(1.0 - pow((x - 0.25) / 0.72, 2.0), 0.0)), x > -0.4);
    m = (1.0 - smoothstep(bw * 0.45, bw + 0.02, y)) * smoothstep(-1.0, -0.9, x) * (0.6 + 0.4 * smoothstep(-0.4, 0.3, x));
  }
  var tv = vec3f(1.0);
  if (in.k.x == 4.0) {
    // crystal jellyfish: a faceted bell with a bright rim, a heart of light and four swaying threads
    let q = vec2f(c.x, c.y - 0.3); let d = length(q / vec2f(0.78, 0.6));
    let ribs = pow(abs(cos(asin(clamp(c.x / 0.8, -1.0, 1.0)) * 4.0)), 10.0);
    m = (1.0 - smoothstep(0.9, 1.0, d)) * smoothstep(-0.1, -0.02, q.y) * (0.16 + 0.7 * exp(-pow((d - 0.9) * 8.0, 2.0)) + 0.3 * ribs) + exp(-dot(q, q) * 14.0) * 0.6;
    for (var i = 0; i < 4; i++) {
      let x0 = -0.45 + 0.3 * f32(i) + 0.07 * sin(c.y * 6.0 + in.k.y * 0.3 + f32(i) * 1.7) * (0.3 - c.y);
      m += exp(-pow((c.x - x0) * 26.0, 2.0)) * smoothstep(-1.0, -0.5, c.y) * (1.0 - smoothstep(0.1, 0.3, c.y)) * 0.45;
    }
    tv = 0.55 + 0.45 * spectrum(c.y * 0.35 + in.k.y * 0.011);
  } else if (in.k.x == 5.0) {
    // a tiny nebula: two swirled noise layers, a pale core and a few stars
    let r = sqrt(r2); let t = in.k.y * 0.33; let a = atan2(c.y, c.x) + r * 2.6 - t * 0.04;
    let s = vec2f(cos(a), sin(a)) * r;
    let n = fbm2(s * 2.3 + in.k.y * 0.0 + vec2f(in.col.r * 40.0, 3.0), 3) * 0.5 + 0.5; let n2 = fbm2(s * 4.5 + 7.0, 2) * 0.5 + 0.5;
    let g = c * 13.0; let h = hash22(floor(g)); let f = fract(g) - 0.5 - (h - 0.5) * 0.6;
    m = (n * n * 1.8 * (1.0 - smoothstep(0.25, 1.0, r)) + exp(-r2 * 26.0) * 0.3) * (0.8 + 0.2 * sin(t * 0.5));
    tv = mix(vec3f(1.0, 0.25, 0.6), vec3f(0.15, 0.55, 1.0), smoothstep(0.3, 0.7, n2)) + vec3f(1.0, 0.8, 0.5) * exp(-r2 * 40.0) * 0.6
      + vec3f(3.0) * step(0.8, h.x) * exp(-dot(f, f) * 90.0) * (1.0 - smoothstep(0.4, 0.9, r)) / max(m, 0.2);
    return vec4f(tv * m * 0.65 * smoothstep(0.0, 1.0, in.col.g), 0.0);
  }
  return vec4f(in.col * m * tv, 0.0);
}

// ---------------------------------------------------------------------------------------- mushrooms
struct MV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) k: vec2f };
@vertex fn vsMush(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> MV {
  let seed = i1.z; let cap = smoothstep(0.6, 0.68, p.y);
  let cr = mix(0.6, 1.5, fract(seed * 7.31)); let ch = mix(0.6, 2.6, fract(seed * 3.77));
  let l = vec3f(p.x * mix(1.0, cr, cap), min(p.y, 0.68) + max(p.y - 0.68, 0.0) * ch, p.z * mix(1.0, cr, cap));
  var w = i0.xyz + l * i0.w;
  let lean = i1.xy + 0.025 * vec2f(sin(G.time * 0.43 + seed * 20.0), sin(G.time * 0.37 + seed * 33.0));
  w = vec3f(w.x + lean.x * l.y * l.y * i0.w, w.y, w.z + lean.y * l.y * l.y * i0.w);
  var o: MV;
  o.w = w; o.n = normalize(vec3f(n.x, n.y * mix(1.0, cr / ch, cap * step(0.0, n.y)), n.z)); o.lp = l; o.k = vec2f(seed, i1.w);
  o.pos = G.viewProj * vec4f(w, 1.0);
  return o;
}
@fragment fn fsMush(in: MV) -> @location(0) vec4f {
  let n = normalize(in.n); let V = normalize(G.camPos - in.w); let seed = in.k.x;
  let c = select(select(vec3f(0.75, 0.3, 1.0), vec3f(1.0, 0.5, 0.12), in.k.y < 1.5), vec3f(0.1, 0.95, 0.5), in.k.y < 0.5);
  let near = 1.0 - smoothstep(2.0, 8.0, distance(in.w, G.camPos));
  let pl = pulse(seed * 6.283) * (0.8 + 0.6 * near);
  let rn = length(in.lp.xz) / (0.44 * mix(0.6, 1.5, fract(seed * 7.31)));
  let F = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  var col: vec3f;
  let rr = length(in.lp.xz);
  if (in.lp.y < 0.66) {
    // stem: pale, lit from the gills above
    let hgt = in.lp.y / 0.66;
    col = mix(c, vec3f(0.8, 0.9, 0.85), 0.5) * (0.035 + 0.3 * hgt * hgt * hgt) * pl;
  } else if (n.y < -0.15) {
    // gills: the brightest part
    let g = 0.55 + 0.45 * cos(atan2(in.lp.z, in.lp.x) * 44.0);
    col = mix(c, vec3f(1.0), 0.2) * (0.35 + 1.0 * g) * pl * smoothstep(0.05, 0.2, rr);
  } else {
    // cap: dark and saturated with glowing spots and a translucent rim
    let q = in.lp.xz * 9.0; let id = floor(q); let f = fract(q) - 0.5 - (hash22(id + seed * 50.0) - 0.5) * 0.5;
    let spot = (1.0 - smoothstep(0.08, 0.3, length(f))) * step(0.35, hash21(id + seed * 9.0));
    col = c * (0.025 + 0.06 * F + 0.28 * pow(min(rn, 1.0), 5.0) * pl) + mix(c, vec3f(1.0), 0.4) * spot * 0.9 * pl;
  }
  return vec4f(applyFog(col, in.w), 1.0);
}

// ---------------------------------------------------------------------------------------- the sleeper
struct AV { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vsSal(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> AV {
  var o: AV;
  // slow breathing swells the trunk
  let br = sin(G.time * 0.75) * smoothstep(0.1, 0.3, uv.y) * (1.0 - smoothstep(0.42, 0.7, uv.y));
  o.w = p + n * 0.035 * br; o.n = n; o.uv = uv;
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsSal(in: AV) -> @location(0) vec4f {
  let V = normalize(G.camPos - in.w);
  var nf = normalize(cross(dpdx(in.w), dpdy(in.w)));
  nf *= sign(dot(nf, V));
  let n = normalize(mix(normalize(in.n), nf, 0.3));
  let ndv = clamp(dot(n, V), 0.0, 1.0); let F = pow(1.0 - ndv, 3.0);
  let v = in.uv.y;
  let near = 1.0 - smoothstep(2.5, 9.0, distance(in.w, G.camPos));
  let br = 0.72 + 0.28 * sin(G.time * 0.75 - v * 2.5);
  let amber = vec3f(1.0, 0.5, 0.11); let deep = vec3f(0.45, 0.1, 0.03);
  var col: vec3f;
  if (v > 2.5) {
    // sleepy eye: a glowing slit that opens a little when you come close
    let lid = 1.0 - smoothstep(0.03 + 0.2 * near, 0.08 + 0.26 * near, abs(in.uv.x - 0.1));
    col = vec3f(0.8, 0.25, 0.05) * (0.06 + 0.2 * ndv) + vec3f(0.55, 1.0, 0.85) * lid * (0.5 + 1.0 * near);
  } else {
    // carved-gem body: every facet carries its own share of the inner light
    let tb = abs(in.uv.x - 0.5) * 2.0;                       // 1 on the back, 0 on the belly
    let sc = 0.8 + 0.4 * hash21(floor(vec2f(in.uv.x * 24.0, v * 170.0)) + 3.0);
    let base = mix(vec3f(1.0, 0.6, 0.22), vec3f(0.8, 0.2, 0.04), max(smoothstep(0.15, 0.8, tb), step(1.5, v)));
    col = deep * 0.05 + base * (0.07 + 0.55 * br * (0.3 + 0.7 * ndv) * sc) * (1.0 + 0.6 * near);
    // two rows of slow running lights along the back
    if (v < 1.5) {
      let du = min(abs(in.uv.x - 0.11), abs(in.uv.x - 0.89));
      let dv = fract(v * 40.0) - 0.5;
      col += vec3f(0.5, 1.0, 0.85) * exp(-du * du * 1500.0 - dv * dv * 60.0) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(G.time * 0.6 - v * 14.0), 2.0)) * 1.4 * smoothstep(0.08, 0.14, v) * (1.0 - smoothstep(0.75, 0.95, v));
    }
    col += vec3f(1.0, 0.75, 0.4) * F * 0.22 * br;
  }
  return vec4f(applyFog(col, in.w), 1.0);
}
