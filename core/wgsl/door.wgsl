// Core door: old weathered plank door in a beveled wooden frame. Lit with the host world's sun/ambient/fog.
struct Door { frame: mat4x4f, leaf: mat4x4f, info: vec4f, light: vec4f };
@group(1) @binding(0) var<uniform> doors: array<Door, 4>;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) o: vec3f, @location(3) h: vec3f, @location(4) attr: vec4f };
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f, @location(1) n: vec3f, @location(2) lpos: vec3f, @location(3) o: vec3f,
  @location(4) @interpolate(flat) h: vec3f, @location(5) @interpolate(flat) attr: vec4f,
  @location(6) @interpolate(flat) ax: vec3f, @location(7) @interpolate(flat) ay: vec3f, @location(8) @interpolate(flat) az: vec3f,
  @location(9) hgt: f32, @location(10) @interpolate(flat) light: vec3f,
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
  o.lpos = v.pos; o.o = v.o; o.h = v.h; o.attr = v.attr; o.light = D.light.rgb;
  o.hgt = w.y - D.frame[3].y;
  return o;
}

fn woodColor(along: f32, across: f32, depth: f32, seed: f32) -> vec3f {
  let s = seed * 7.31;
  let warp = vnoise2(vec2f(along * 1.1 + s, across * 5.0)) * 0.7 + vnoise2(vec2f(along * 4.0, across * 25.0 + s)) * 0.2;
  let rings = sin(across * 70.0 + depth * 40.0 + warp * 5.0 + s * 3.0) * 0.5 + 0.5;
  let streak = vnoise2(vec2f(along * 2.5 + s * 2.0, across * 220.0)) * 0.5 + 0.5;
  let base = mix(hex(0x4a3222u), hex(0x6e4a2eu), hash1u(u32(seed * 13.0 + 3.0)));
  var c = base * (0.68 + 0.32 * rings) * (0.82 + 0.36 * streak);
  // sun-bleached grey weathering in streaks along the grain
  let wx = fbm2(vec2f(along * 0.9 + s, across * 7.0 - s), 3) * 0.5 + 0.5;
  c = mix(c, hex(0x7d7264) * (0.75 + 0.4 * streak), smoothstep(0.5, 0.9, wx) * 0.4);
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

  var albedo: vec3f; var spec = 0.03; var shin = 12.0; var ao = 1.0;
  if (mat < 1.5) {
    var along = in.lpos.y; var across = in.lpos.x;
    if (mat > 0.5) { along = in.lpos.x; across = in.lpos.y; }
    albedo = woodColor(along, across, in.lpos.z, seed);
    // worn, lighter bevels
    albedo = mix(albedo, albedo * 1.4 + vec3f(0.025, 0.018, 0.01), edge * 0.5);
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
      ao *= mix(0.55, 1.0, smoothstep(0.0, 0.07, min(dx, dy) + step(0.09, abs(in.lpos.z)) * 0.1));
    }
    // moss and damp near the ground
    if (in.hgt < 0.6) {
      let m = fbm2(in.lpos.xy * vec2f(9.0, 5.0) + seed * 3.1, 3) * 0.5 + 0.5;
      let low = 1.0 - smoothstep(0.02, 0.45, in.hgt + m * 0.15);
      albedo = mix(albedo, hex(0x3e5426) * (0.7 + 0.6 * m), low * smoothstep(0.35, 0.65, m) * 0.85);
    }
    albedo *= mix(0.72, 1.0, smoothstep(-0.05, 0.3, in.hgt));
  } else {
    // black wrought iron with a little rust, specular on the hammered surface
    let r = fbm2(in.lpos.xy * 22.0 + seed, 3) * 0.5 + 0.5;
    albedo = mix(hex(0x111010), hex(0x4a2814), smoothstep(0.58, 0.85, r) * 0.6);
    albedo = mix(albedo, hex(0x3c3a37), edge * 0.6);
    spec = 0.9 * (1.0 - smoothstep(0.55, 0.85, r)); shin = 48.0;
    n = normalize(n + (vnoise2(in.lpos.xy * 90.0) * 0.12) * normalize(in.ay));
    // rivets along the straps
    if (seed < 0.5) {
      let rv = (fract(in.lpos.x / 0.1) - 0.5) * 0.1;
      let rivet = 1.0 - smoothstep(0.005, 0.008, length(vec2f(rv, in.o.y)));
      n = normalize(n + rivet * (normalize(in.ax) * sign(rv) * 0.6 + normalize(in.ay) * sign(in.o.y) * 0.6));
    }
  }
  let v = normalize(G.camPos - in.wpos);
  let ndl = dot(n, G.sunDir);
  let sunL = G.sunColor * wrapDiffuse(n, G.sunDir, 0.15);
  let amb = hemi(n, G.ambientSky, G.ambientGround) * ao;
  let fill = in.light * (0.5 + 0.5 * max(dot(n, v), 0.0)) * ao;
  let fres = fresnelSchlick(dot(n, v), 0.04);
  var c = albedo * (sunL * mix(0.25, 1.0, ao * ao) + amb + fill)
        + spec * specBlinn(n, G.sunDir, v, shin) * G.sunColor * max(ndl, 0.0)
        + spec * fres * hemi(reflect(-v, n), G.ambientSky, G.ambientGround) * 0.5 * ao;
  c = applyFog(c, in.wpos);
  return vec4f(c, 1.0);
}
