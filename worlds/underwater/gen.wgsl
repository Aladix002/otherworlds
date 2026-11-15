// Load-time texture generation: tileable caustic network (rgb = chromatic offsets) and tileable fbm noise (4 channels).
@group(1) @binding(0) var dst: texture_storage_2d<rgba8unorm, write>;
override MODE: u32 = 0u;
override RES: f32 = 512.0;

fn phash(c: vec2i, per: i32, s: u32) -> vec2f {
  let w = ((c % vec2i(per)) + vec2i(per)) % vec2i(per);
  let h = pcg(hash2i(w) + s);
  return vec2f(u2f(h), u2f(pcg(h)));
}
fn pvn(p: vec2f, per: i32, s: u32) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f); let c = vec2i(i);
  return mix(mix(phash(c, per, s).x, phash(c + vec2i(1, 0), per, s).x, u.x),
             mix(phash(c + vec2i(0, 1), per, s).x, phash(c + vec2i(1, 1), per, s).x, u.x), u.y);
}
fn pfbm(p: vec2f, per: i32, s: u32) -> f32 {
  var a = 0.5; var r = 0.0; var q = p; var pp = per;
  for (var i = 0u; i < 4u; i++) { r += a * pvn(q, pp, s + i * 7u); q *= 2.0; pp *= 2; a *= 0.5; }
  return r / 0.9375;
}
// F2 - F1 of a periodic jittered grid
fn pvor(p: vec2f, per: i32) -> f32 {
  let c = vec2i(floor(p)); let f = p - floor(p);
  var d1 = 9.0; var d2 = 9.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let o = vec2i(i, j);
      let r = vec2f(o) + phash(c + o, per, 3u) * 0.8 + 0.1 - f;
      let d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
fn caus(uv: vec2f) -> f32 {
  let w = vec2f(pfbm(uv * 3.0, 3, 11u), pfbm(uv * 3.0 + vec2f(0.31, 0.77), 3, 23u)) - 0.5;
  let e = pvor(uv * 7.0 + w * 2.2, 7);
  let e2 = pvor(uv * 11.0 - w * 1.6 + vec2f(0.5, 0.2), 11);
  return clamp(exp(-e * e * 28.0) * 0.85 + exp(-e2 * e2 * 60.0) * 0.3, 0.0, 1.0);
}

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= RES || f32(id.y) >= RES) { return; }
  let uv = (vec2f(id.xy) + 0.5) / RES;
  var c: vec4f;
  if (MODE == 0u) {
    let o = 0.0022;
    c = vec4f(caus(uv - vec2f(o, o * 0.5)), caus(uv), caus(uv + vec2f(o, o * 0.5)), 1.0);
  } else {
    c = vec4f(pfbm(uv * 8.0, 8, 1u), pfbm(uv * 8.0, 8, 101u), pfbm(uv * 16.0, 16, 201u), pfbm(uv * 4.0, 4, 301u));
  }
  textureStore(dst, vec2i(id.xy), c);
}

// mip chain: 2x2 box downsample
@group(1) @binding(0) var msrc: texture_2d<f32>;
@group(1) @binding(1) var mdst: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8) fn mip(@builtin(global_invocation_id) id: vec3u) {
  let s = textureDimensions(mdst);
  if (id.x >= s.x || id.y >= s.y) { return; }
  let p = vec2i(id.xy) * 2;
  let c = textureLoad(msrc, p, 0) + textureLoad(msrc, p + vec2i(1, 0), 0) + textureLoad(msrc, p + vec2i(0, 1), 0) + textureLoad(msrc, p + vec2i(1, 1), 0);
  textureStore(mdst, vec2i(id.xy), c * 0.25);
}
