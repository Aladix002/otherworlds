// Core door: old weathered plank door in a simple wooden frame. Lit with the host world's sun/ambient/fog.
struct Door { frame: mat4x4f, leaf: mat4x4f, info: vec4f, light: vec4f };
@group(1) @binding(0) var<uniform> doors: array<Door, 4>;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) bc: vec3f, @location(3) attr: vec3f };
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f, @location(1) n: vec3f, @location(2) lpos: vec3f, @location(3) bc: vec3f,
  @location(4) @interpolate(flat) attr: vec3f, @location(5) @interpolate(flat) light: vec4f, @location(6) hgt: f32,
};

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let D = doors[ii];
  var M = D.frame;
  if (v.attr.x > 0.5) { M = D.leaf; }
  var o: VOut;
  let w = M * vec4f(v.pos, 1.0);
  o.wpos = w.xyz; o.clip = G.viewProj * w;
  o.n = normalize((M * vec4f(v.nrm, 0.0)).xyz);
  o.lpos = v.pos; o.bc = v.bc; o.attr = v.attr; o.light = D.light; o.hgt = w.y - D.frame[3].y;
  return o;
}

fn woodColor(along: f32, across: f32, depth: f32, seed: f32) -> vec3f {
  let s = seed * 7.31;
  let warp = vnoise2(vec2f(along * 1.2 + s, across * 6.0)) * 0.6 + vnoise2(vec2f(along * 5.0, across * 30.0 + s)) * 0.15;
  let rings = sin((across * 55.0 + depth * 30.0 + warp * 4.0 + s * 3.0) * 1.0) * 0.5 + 0.5;
  let streak = vnoise2(vec2f(along * 3.0 + s * 2.0, across * 180.0)) * 0.5 + 0.5;
  let base = mix(hex(0x5a3d26u), hex(0x7a5536u), hash1u(u32(seed * 13.0 + 3.0)));
  var c = base * (0.78 + 0.22 * rings) * (0.85 + 0.3 * streak);
  // weathering: silver-grey sun-bleached patches, darker damp bottom
  let wx = fbm2(vec2f(along * 1.4 + s, across * 2.5 - s), 3) * 0.5 + 0.5;
  c = mix(c, hex(0x857864) * (0.8 + 0.3 * streak), smoothstep(0.5, 0.9, wx) * 0.32);
  return c;
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n);
  if (!ff) { n = -n; }
  let mat = in.attr.y; let seed = in.attr.z;
  let a = abs(in.bc);
  // edge factor: how close to a box edge (two coordinates near +-1)
  let mx = max(a.x, max(a.y, a.z)); let mn = min(a.x, min(a.y, a.z)); let mid = a.x + a.y + a.z - mx - mn;
  let edge = smoothstep(0.82, 0.99, mid);
  var albedo: vec3f; var spec = 0.04; var shin = 16.0;
  if (mat < 1.5) {
    var along = in.lpos.y; var across = in.lpos.x;
    if (mat > 0.5) { along = in.lpos.x; across = in.lpos.y; }
    albedo = woodColor(along, across, in.lpos.z, seed);
    // groove darkening along plank sides (vertical planks) and worn lighter corners
    albedo *= mix(1.0, 0.55, smoothstep(0.9, 1.0, a.x) * step(mat, 0.5) * (1.0 - step(0.99, a.z)));
    albedo = mix(albedo, albedo * 1.35 + vec3f(0.02, 0.015, 0.01), edge * 0.6);
    // grain bump
    let gb = vnoise2(vec2f(along * 3.0, across * 160.0 + seed)) * 0.06;
    n = normalize(n + gb * vec3f(1.0, 0.0, 1.0) * (1.0 - abs(n.y)));
    albedo *= mix(0.6, 1.0, smoothstep(-0.05, 0.5, in.hgt)); // contact darkening near ground
  } else {
    // wrought iron with rust
    let r = fbm2(in.lpos.xy * 18.0 + seed, 3) * 0.5 + 0.5;
    albedo = mix(hex(0x1e1c1b), hex(0x6b3a1e), smoothstep(0.5, 0.8, r) * 0.7);
    albedo = mix(albedo, hex(0x55524e), edge * 0.5);
    spec = 0.35 * (1.0 - smoothstep(0.5, 0.8, r)); shin = 40.0;
    // rivets along straps
    let rv = (fract(in.lpos.x / 0.09) - 0.5) * 0.09;
    let rivet = 1.0 - smoothstep(0.005, 0.008, length(vec2f(rv, in.bc.y * 0.0225)));
    albedo = mix(albedo, hex(0x4a4642), rivet * step(seed, 0.5));
    n = normalize(n + rivet * step(seed, 0.5) * vec3f(0.0, sign(in.bc.y) * 0.5, 0.0));
  }
  let v = normalize(G.camPos - in.wpos);
  let sunL = G.sunColor * wrapDiffuse(n, G.sunDir, 0.15);
  let amb = hemi(n, G.ambientSky, G.ambientGround);
  let fill = in.light.rgb * (0.55 + 0.45 * max(dot(n, v), 0.0));
  var c = albedo * (sunL + amb + fill) + spec * specBlinn(n, G.sunDir, v, shin) * G.sunColor * max(dot(n, G.sunDir), 0.0);
  c = applyFog(c, in.wpos);
  return vec4f(c, 1.0);
}
