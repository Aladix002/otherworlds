// Core door: old weathered plank door in a slim beveled wooden frame. Lit with the host world's sun/ambient/fog.
// info = (open, side, moss, shadow), light = (doorLight rgb, doorway spill intensity)
struct Door { frame: mat4x4f, leaf: mat4x4f, info: vec4f, light: vec4f };
const SPILL_COL = vec3f(1.0, 0.74, 0.46);
@group(1) @binding(0) var<uniform> doors: array<Door, 4>;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) o: vec3f, @location(3) h: vec3f, @location(4) attr: vec4f };
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f, @location(1) n: vec3f, @location(2) lpos: vec3f, @location(3) o: vec3f,
  @location(4) @interpolate(flat) h: vec3f, @location(5) @interpolate(flat) attr: vec4f,
  @location(6) @interpolate(flat) ax: vec3f, @location(7) @interpolate(flat) ay: vec3f, @location(8) @interpolate(flat) az: vec3f,
  @location(9) hgt: f32, @location(10) @interpolate(flat) light: vec3f, @location(11) @interpolate(flat) misc: vec2f,
};

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let D = doors[ii];
  var M = D.frame;
  if (v.attr.x > 0.5) { M = D.leaf; }
  var o: VOut;
  let w = M * vec4f(v.pos, 1.0);
  o.wpos = w.xyz; o.clip = G.viewProj * w;
  o.n = (M * vec4f(v.nrm, 0.0)).xyz;
  let c = cos(v.attr.w); let s = sin(v.attr.w);
  o.ax = (M * vec4f(c, s, 0.0, 0.0)).xyz; o.ay = (M * vec4f(-s, c, 0.0, 0.0)).xyz; o.az = (M * vec4f(0.0, 0.0, 1.0, 0.0)).xyz;
  o.lpos = v.pos; o.o = v.o; o.h = v.h; o.attr = v.attr; o.light = D.light.rgb; o.misc = vec2f(D.info.z, D.light.w * D.info.x);
  o.hgt = w.y - D.frame[3].y;
  return o;
}

fn woodColor(along: f32, across: f32, depth: f32, seed: f32) -> vec3f {
  let s = seed * 7.31;
  let warp = vnoise2(vec2f(along * 1.1 + s, across * 5.0)) * 0.7 + vnoise2(vec2f(along * 4.0, across * 25.0 + s)) * 0.2;
  let rings = sin(across * 70.0 + depth * 40.0 + warp * 5.0 + s * 3.0) * 0.5 + 0.5;
  let streak = vnoise2(vec2f(along * 2.5 + s * 2.0, across * 220.0)) * 0.5 + 0.5;
  // old unpainted wood: grey-brown heart, most of the surface weathered to silver-grey along the grain
  let base = mix(hex(0x54483du), hex(0x6c6257u), hash1u(u32(seed * 13.0 + 3.0)));
  var c = base * (0.6 + 0.4 * rings) * (0.8 + 0.4 * streak);
  let wx = fbm2(vec2f(along * 0.9 + s, across * 7.0 - s), 3) * 0.5 + 0.5;
  c = mix(c, hex(0x93918au) * (0.68 + 0.45 * streak), smoothstep(0.3, 0.72, wx) * 0.72);
  // fine dark weather checks along the grain
  c *= 1.0 - 0.4 * smoothstep(0.3, 0.42, vnoise2(vec2f(along * 1.3 + s, across * 130.0)));
  // knots
  let k = voronoi2(vec2f(along * 2.2 + s, across * 9.0));
  c *= mix(0.55, 1.0, min(1.0, smoothstep(0.03, 0.09, k.x) + step(k.z, 0.85)));
  return c;
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n);
  if (!ff) { n = -n; }
  let mat = in.attr.y; let seed = in.attr.z; let isLeaf = in.attr.x > 0.5;
  // distance to the box edges per axis (meters); the face axis has e ~ 0
  let e = in.h - abs(in.o);
  let fa = select(select(2, 1, e.y < e.z), 0, e.x < e.y && e.x < e.z);
  var bev = select(0.007, 0.012, !isLeaf);
  if (mat > 1.5) { bev = 0.003; }
  var edge = 0.0;
  var tilt = vec3f(0.0);
  if (fa != 0) { let k = 1.0 - smoothstep(0.0, bev, e.x); tilt += normalize(in.ax) * sign(in.o.x) * k; edge = max(edge, k); }
  if (fa != 1) { let k = 1.0 - smoothstep(0.0, bev, e.y); tilt += normalize(in.ay) * sign(in.o.y) * k; edge = max(edge, k); }
  if (fa != 2) { let k = 1.0 - smoothstep(0.0, bev, e.z); tilt += normalize(in.az) * sign(in.o.z) * k; edge = max(edge, k); }
  n = normalize(n + tilt * 0.75);

  var albedo: vec3f; var spec = 0.02; var shin = 12.0; var ao = 1.0; var spill = 0.0;
  if (mat < 1.5) {
    var along = in.lpos.y; var across = in.lpos.x;
    if (mat > 0.5) { along = in.lpos.x; across = in.lpos.y; }
    albedo = woodColor(along, across, in.lpos.z, seed);
    // worn, lighter bevels
    albedo = mix(albedo, albedo * 1.35 + vec3f(0.02), edge * 0.5);
    // grain relief
    let gb = vnoise2(vec2f(along * 2.5, across * 200.0 + seed)) * 0.08;
    n = normalize(n + gb * normalize(select(in.ax, in.ay, mat > 0.5)));
    // plank grooves read dark: AO toward each plank's long sides and on the recessed backing board
    if (isLeaf && mat < 0.5) { ao *= mix(0.55, 1.0, smoothstep(0.0, 0.012, e.x)); }
    if (isLeaf && seed > 5.5 && seed < 6.5) { albedo *= 0.25; }
    // AO where the leaf meets the frame (closed) and in the inner corners of the frame
    if (isLeaf) {
      let lw = 0.954;
      ao *= mix(0.6, 1.0, smoothstep(0.0, 0.06, min(in.lpos.x, lw - in.lpos.x)) * smoothstep(0.0, 0.06, min(in.lpos.y, 2.04 - in.lpos.y)));
    } else {
      let dx = abs(abs(in.lpos.x) - 0.48); let dy = abs(in.lpos.y - 2.05);
      ao *= mix(0.55, 1.0, smoothstep(0.0, 0.07, min(dx, dy) + step(0.065, abs(in.lpos.z)) * 0.1));
    }
    // grime and damp rising from the ground, a little moss in the damp patches (amount is world-tunable: doorMoss)
    if (in.hgt < 1.1) {
      let m = fbm2(in.lpos.xy * vec2f(9.0, 5.0) + seed * 3.1, 3) * 0.5 + 0.5;
      let grime = 1.0 - smoothstep(0.0, 0.95, in.hgt + (m - 0.5) * 0.35);
      albedo = mix(albedo, albedo * vec3f(0.36, 0.34, 0.32), grime * 0.85);
      let moss = in.misc.x;
      let low = 1.0 - smoothstep(0.02, 0.2 + 0.3 * moss, in.hgt + m * 0.15);
      albedo = mix(albedo, hex(0x46502eu) * (0.6 + 0.6 * m), low * smoothstep(0.68 - 0.36 * moss, 0.78, m) * min(1.0, moss * 1.6));
    }
    // light from the open doorway on the inner faces of the frame and on the threshold
    if (!isLeaf) {
      let inner = max(max(smoothstep(0.5, 0.484, abs(in.lpos.x)), smoothstep(2.064, 2.052, in.lpos.y) * step(1.9, in.lpos.y)), step(in.lpos.y, 0.02));
      spill = inner * smoothstep(0.1, 0.0, abs(in.lpos.z));
    }
  } else {
    // dark wrought iron with a little rust: matte, only a faint sheen (a strong highlight blooms white under HDR suns)
    let r = fbm2(in.lpos.xy * 22.0 + seed, 3) * 0.5 + 0.5;
    albedo = mix(hex(0x121211u), hex(0x3a2417u), smoothstep(0.58, 0.85, r) * 0.5);
    albedo = mix(albedo, hex(0x2b2a28u), edge * 0.5);
    spec = 0.1 * (1.0 - smoothstep(0.55, 0.85, r)); shin = 18.0;
    n = normalize(n + (vnoise2(in.lpos.xy * 90.0) * 0.1) * normalize(in.ay));
    // rivets along the straps
    if (seed < 0.5) {
      let rv = (fract(in.lpos.x / 0.1) - 0.5) * 0.1;
      let rivet = 1.0 - smoothstep(0.005, 0.008, length(vec2f(rv, in.o.y)));
      n = normalize(n + rivet * (normalize(in.ax) * sign(rv) * 0.45 + normalize(in.ay) * sign(in.o.y) * 0.45));
    }
  }
  let v = normalize(G.camPos - in.wpos);
  let ndl = dot(n, G.sunDir);
  let ndv = max(dot(n, v), 0.0);
  let sunL = G.sunColor * wrapDiffuse(n, G.sunDir, 0.15);
  let amb = hemi(n, G.ambientSky, G.ambientGround) * ao;
  // the world's air: fog/horizon color as soft wrap-around ambient plus a rim, so the door sits in the scene's palette
  let env = mix(G.ambientSky, G.fogColor, 0.5) * (0.26 + 0.6 * pow(1.0 - ndv, 3.0)) * ao;
  let fill = in.light * (0.5 + 0.5 * ndv) * ao;
  let fres = fresnelSchlick(ndv, 0.04);
  var c = albedo * (sunL * mix(0.25, 1.0, ao * ao) + amb + env + fill + SPILL_COL * (spill * in.misc.y * 0.4))
        + spec * min(specBlinn(n, G.sunDir, v, shin), 1.0) * G.sunColor * max(ndl, 0.0)
        + spec * fres * hemi(reflect(-v, n), G.ambientSky, G.ambientGround) * 0.5 * ao;
  c = applyFog(c, in.wpos);
  return vec4f(c, 1.0);
}

// ---- ground decal: soft contact shadow under the frame + warm light spilling out of the open doorway ----
struct DOut {
  @builtin(position) clip: vec4f, @location(0) p: vec3f, @location(1) wpos: vec3f, @location(2) @interpolate(flat) k: vec2f,
};
@vertex fn vs_decal(@location(0) lp: vec3f, @builtin(instance_index) ii: u32) -> DOut {
  let D = doors[ii];
  var o: DOut;
  let w = D.frame * vec4f(lp.x, lp.y + 0.015, lp.z, 1.0);
  o.clip = G.viewProj * w;
  // depth as if 2% closer to the camera: survives small ground bumps without visibly floating
  let cb = G.viewProj * vec4f(mix(w.xyz, G.camPos, 0.02), 1.0);
  o.clip.z = cb.z / cb.w * o.clip.w;
  o.wpos = w.xyz;
  o.p = vec3f(lp.x, lp.z, 1.0 - smoothstep(0.4, 0.65, abs(lp.y)));
  o.k = vec2f(D.info.w, D.light.w * D.info.x);
  return o;
}
@fragment fn fs_decal(in: DOut) -> @location(0) vec4f {
  let ax = abs(in.p.x); let az = abs(in.p.y);
  let d = length(vec2f(max(ax - 0.58, 0.0), max(az - 0.06, 0.0)));
  let ao = (0.42 * exp(-d * 9.0) + 0.2 * exp(-d * 2.6)) * in.k.x;
  let wd = 0.42 + az * 0.5;
  let sp = smoothstep(wd + 0.32, wd - 0.18, ax) * exp(-az * 1.15) * smoothstep(0.02, 0.22, az);
  let f = (1.0 - smoothstep(1.05, 1.4, ax)) * (1.0 - smoothstep(1.7, 2.1, az)) * in.p.z * (1.0 - fogAmount(distance(in.wpos, G.camPos)));
  return vec4f(SPILL_COL * (sp * in.k.y * 0.3 * f), ao * f);
}
