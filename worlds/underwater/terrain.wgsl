// Seabed: generated on the GPU at load (gen entry), shaded with sand ripples, caustics and zone materials.
override SEGX: u32 = 256u;
override SEGZ: u32 = 384u;
override SX: f32 = 320.0;
override SZ: f32 = 480.0;
override CZ: f32 = -90.0;
@group(2) @binding(0) var<storage, read_write> verts: array<f32>;
@compute @workgroup_size(64) fn gen(@builtin(global_invocation_id) id: vec3u) {
  let nx = SEGX + 1u;
  if (id.x >= nx * (SEGZ + 1u)) { return; }
  let uv = vec2f(f32(id.x % nx) / f32(SEGX), f32(id.x / nx) / f32(SEGZ));
  let p = (uv - 0.5) * vec2f(SX, SZ) + vec2f(0.0, CZ);
  let e = 0.5;
  let h = terrainH(p);
  let n = normalize(vec3f(terrainH(p - vec2f(e, 0.0)) - terrainH(p + vec2f(e, 0.0)), 2.0 * e,
                          terrainH(p - vec2f(0.0, e)) - terrainH(p + vec2f(0.0, e))));
  let o = id.x * 8u;
  verts[o] = p.x; verts[o + 1u] = h; verts[o + 2u] = p.y;
  verts[o + 3u] = n.x; verts[o + 4u] = n.y; verts[o + 5u] = n.z; verts[o + 6u] = uv.x; verts[o + 7u] = uv.y;
}

struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.w = p; o.n = n; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let wp = in.w;
  var n = normalize(in.n);
  let d = -wp.y;
  let kelp = uss(16.0, 24.0, d) * (1.0 - uss(40.0, 60.0, d));
  let deep = uss(40.0, 80.0, d);
  let nb = textureSample(tNoise, sRep, wp.xz * 0.021);
  let nf = textureSample(tNoise, sRep, wp.xz * 0.37);
  let caus = causticsAt(wp);
  // sand ripples (normal only), faded before they alias
  let dir = normalize(vec2f(0.8, 0.6) + (nb.xy - 0.5) * 0.5);
  let freq = 4.4;
  let ph = dot(wp.xz, dir) * freq + nb.z * 5.0;
  let fw = length(fwidth(wp.xz)) * freq;
  let rip = (1.0 - uss(0.5, 1.6, fw)) * (1.0 - 0.7 * kelp) * (1.0 - deep) * smoothstep(0.6, 0.9, n.y);
  let s = sin(ph); let rs = sign(s) * pow(abs(s), 0.6);
  n = normalize(n + vec3f(dir.x, 0.0, dir.y) * rs * 0.42 * rip + vec3f(nf.x - 0.5, 0.0, nf.y - 0.5) * 0.25 * (1.0 - uss(0.4, 1.2, fw * 0.3)));
  // materials: white sand -> golden kelp sand with pebbles -> dark silt
  let m = nb.w;
  var alb = mix(vec3f(0.66, 0.61, 0.5), vec3f(0.8, 0.75, 0.63), smoothstep(0.35, 0.7, m));
  alb *= (0.9 + 0.2 * nf.z) * (1.0 - 0.1 * rip * (0.5 - 0.5 * s));
  let kel = mix(vec3f(0.56, 0.4, 0.22), vec3f(0.42, 0.31, 0.2), smoothstep(0.4, 0.7, nf.w + m * 0.4));
  // kelp floor: patches of olive turf, pale shell grit and scattered pebbles
  let kf = mix(mix(kel, vec3f(0.34, 0.36, 0.17), smoothstep(0.5, 0.7, nb.y) * 0.4), vec3f(0.8, 0.74, 0.62), smoothstep(0.74, 0.82, nf.x) * 0.35);
  alb = mix(alb, kf * (0.75 + 0.5 * nf.y), kelp);
  alb = mix(alb, vec3f(0.26, 0.28, 0.32) * (0.8 + 0.4 * nf.z), deep);
  let rock = smoothstep(0.55, 0.35, n.y);
  alb = mix(alb, vec3f(0.42, 0.4, 0.38) * (0.7 + 0.5 * nf.x), rock);
  // greenish algae film in shallow patches
  alb = mix(alb, vec3f(0.42, 0.55, 0.32), smoothstep(0.62, 0.8, nb.z) * 0.35 * (1.0 - deep));
  // kelp canopy dapple
  let dap = mix(1.0, 0.45 + 1.1 * textureSample(tNoise, sRep, wp.xz * 0.045 + G.time * vec2f(0.004, 0.002)).r, kelp);
  let sh = colShadow(wp);
  let sa = sandAO(wp.xz) * sh.y;
  // deep floor: soft patches of faint blue-green glow instead of bare silt
  var c = uwLit(alb * mix(0.72, 1.0, sa), n, wp, caus * dap * sh.x, dap * mix(0.5, 1.0, sh.x) * sa);
  c += vec3f(0.02, 0.1, 0.12) * smoothstep(0.55, 0.85, nb.r) * deep * (1.0 - fogF(distance(wp, G.camPos))) * 0.35;
  // a rift in the seabed of the kelp clearing: another sky drifts below it
  let rp = rot2(0.5) * (wp.xz - vec2f(8.0, -70.0));
  let e = abs(rp.y) / 5.0 + rp.x * rp.x * 0.006 + (nf.x - 0.5) * 0.08 + (textureSample(tNoise, sRep, wp.xz * 0.09).g - 0.5) * 0.35;
  if (e < 1.5) {
    let rd = normalize(wp - G.camPos);
    let q = wp.xz + rd.xz * (9.0 / max(-rd.y, 0.25));
    let cl = textureSampleLevel(tNoise, sRep, q * 0.011 + G.time * vec2f(0.003, 0.001), 0.0).r * 0.65 + textureSampleLevel(tNoise, sRep, q * 0.037 - G.time * vec2f(0.002, 0.004), 1.0).g * 0.35;
    let sky = mix(mix(vec3f(0.16, 0.42, 1.0), vec3f(1.1, 0.7, 0.75), uss(0.6, 0.1, -rd.y)), vec3f(1.5, 1.3, 1.35), uss(0.5, 0.72, cl));
    c = mix(c * (1.0 - 0.6 * uss(1.3, 1.0, e)) + vec3f(1.0, 0.7, 0.55) * uss(1.5, 1.0, e) * 0.2, sky, uss(1.0, 0.96, e));
  }
  return vec4f(c, 1.0);
}
