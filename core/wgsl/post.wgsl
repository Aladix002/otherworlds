// Core post stack: bloom (13-tap down / tent up), exposure, AgX or ACES tonemap, grading, vignette, FXAA-lite, blue-noise dither.
struct PostParams {
  exposure: f32, bloom: f32, threshold: f32, knee: f32,
  vignette: f32, saturation: f32, contrast: f32, tonemap: f32,
  uvScale: vec2f, uvMax: vec2f,
  tint: vec3f, frame: f32,
  radius: f32, aa: f32, invLevels: f32, dither: f32,
  lift: vec3f, fade: f32,
  hdrTexel: vec2f, _q: vec2f,
};
@group(0) @binding(0) var<uniform> P: PostParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var blueNoise: texture_2d<f32>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VO; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y); return o;
}
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

override FIRST: bool = false;
fn tap(uv: vec2f) -> vec3f {
  var u = uv;
  if (FIRST) { u = min(u, P.uvMax); }
  return textureSampleLevel(src, samp, u, 0.0).rgb;
}
@fragment fn down(in: VO) -> @location(0) vec4f {
  var ts = 1.0 / vec2f(textureDimensions(src));
  var uv = in.uv;
  if (FIRST) { uv = uv * P.uvScale; ts *= P._q.x * P.uvScale.x; }
  let a = tap(uv + ts * vec2f(-2.0, -2.0)); let b = tap(uv + ts * vec2f(0.0, -2.0)); let c = tap(uv + ts * vec2f(2.0, -2.0));
  let d = tap(uv + ts * vec2f(-2.0, 0.0));  let e = tap(uv);                          let f = tap(uv + ts * vec2f(2.0, 0.0));
  let g = tap(uv + ts * vec2f(-2.0, 2.0));  let h = tap(uv + ts * vec2f(0.0, 2.0));   let i = tap(uv + ts * vec2f(2.0, 2.0));
  let j = tap(uv + ts * vec2f(-1.0, -1.0)); let k = tap(uv + ts * vec2f(1.0, -1.0));
  let l = tap(uv + ts * vec2f(-1.0, 1.0));  let m = tap(uv + ts * vec2f(1.0, 1.0));
  var col: vec3f;
  if (FIRST) {
    let g0 = (a + b + d + e) * 0.25; let g1 = (b + c + e + f) * 0.25; let g2 = (d + e + g + h) * 0.25; let g3 = (e + f + h + i) * 0.25; let g4 = (j + k + l + m) * 0.25;
    let w0 = 0.125 / (1.0 + lum(g0) * P.exposure); let w1 = 0.125 / (1.0 + lum(g1) * P.exposure); let w2 = 0.125 / (1.0 + lum(g2) * P.exposure);
    let w3 = 0.125 / (1.0 + lum(g3) * P.exposure); let w4 = 0.5 / (1.0 + lum(g4) * P.exposure);
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4) * P.exposure;
    let br = max(col.r, max(col.g, col.b));
    var rq = clamp(br - P.threshold + P.knee, 0.0, 2.0 * P.knee); rq = rq * rq / (4.0 * P.knee + 1e-4);
    col *= max(rq, br - P.threshold) / max(br, 1e-4);
    col = min(col, vec3f(64.0));
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  return vec4f(col, 1.0);
}
@fragment fn up(in: VO) -> @location(0) vec4f {
  let ts = P.radius / vec2f(textureDimensions(src));
  let uv = in.uv;
  var c = textureSampleLevel(src, samp, uv, 0.0).rgb * 4.0;
  c += (textureSampleLevel(src, samp, uv + vec2f(-ts.x, 0.0), 0.0).rgb + textureSampleLevel(src, samp, uv + vec2f(ts.x, 0.0), 0.0).rgb
      + textureSampleLevel(src, samp, uv + vec2f(0.0, -ts.y), 0.0).rgb + textureSampleLevel(src, samp, uv + vec2f(0.0, ts.y), 0.0).rgb) * 2.0;
  c += textureSampleLevel(src, samp, uv - ts, 0.0).rgb + textureSampleLevel(src, samp, uv + ts, 0.0).rgb
     + textureSampleLevel(src, samp, uv + vec2f(ts.x, -ts.y), 0.0).rgb + textureSampleLevel(src, samp, uv + vec2f(-ts.x, ts.y), 0.0).rgb;
  return vec4f(c / 16.0, 1.0);
}

// ---- tonemapping ----
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x; let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
fn agx(c: vec3f) -> vec3f {
  let m = mat3x3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                  0.0784335999999992, 0.878468636469772, 0.0784336,
                  0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let mi = mat3x3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                   -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                   -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  let minEv = -12.47393; let maxEv = 4.026069;
  var v = m * max(c, vec3f(1e-10));
  v = clamp(log2(v), vec3f(minEv), vec3f(maxEv));
  v = (v - minEv) / (maxEv - minEv);
  v = agxContrast(v);
  return clamp(mi * v, vec3f(0.0), vec3f(1.0)); // display-encoded (≈sRGB)
}
fn aces(c: vec3f) -> vec3f { // Narkowicz fit, returns display-encoded
  let x = c * 0.6;
  let t = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(t, vec3f(1.0 / 2.4)) - 0.055, t * 12.92, t <= vec3f(0.0031308));
}

fn hdrAt(uv: vec2f) -> vec3f { return textureSampleLevel(src, samp, min(uv, P.uvMax), 0.0).rgb; }
fn aaLuma(c: vec3f) -> f32 { let x = c * P.exposure; return sqrt(lum(x / (1.0 + x))); }

@fragment fn composite(in: VO) -> @location(0) vec4f {
  let uv = in.uv * P.uvScale;
  var c = hdrAt(uv);
  if (P.aa > 0.5) {
    let t = P.hdrTexel;
    let lM = aaLuma(c);
    let lNW = aaLuma(hdrAt(uv + t * vec2f(-1.0, -1.0))); let lNE = aaLuma(hdrAt(uv + t * vec2f(1.0, -1.0)));
    let lSW = aaLuma(hdrAt(uv + t * vec2f(-1.0, 1.0)));  let lSE = aaLuma(hdrAt(uv + t * vec2f(1.0, 1.0)));
    let lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    let lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin > max(0.04, lMax * 0.12)) {
      var dir = vec2f(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      let red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2f(-6.0), vec2f(6.0)) * t;
      let a = 0.5 * (hdrAt(uv + dir * (-1.0 / 6.0)) + hdrAt(uv + dir * (1.0 / 6.0)));
      let b = a * 0.5 + 0.25 * (hdrAt(uv - dir * 0.5) + hdrAt(uv + dir * 0.5));
      let lB = aaLuma(b);
      c = select(b, a, lB < lMin || lB > lMax);
    }
  }
  c = c * P.exposure;
  let bl = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb * P.invLevels;
  c = mix(c, bl, P.bloom) * P.tint + P.lift;
  var d: vec3f;
  if (P.tonemap < 0.5) { d = agx(c); } else { d = aces(c); }
  let l = lum(d);
  d = max(mix(vec3f(l), d, P.saturation), vec3f(0.0));
  d = clamp((d - 0.5) * P.contrast + 0.5, vec3f(0.0), vec3f(1.0));
  let q = in.uv - 0.5;
  d *= mix(1.0, 1.0 - smoothstep(0.2, 0.85, length(q * vec2f(1.0, 0.8))), P.vignette);
  d *= 1.0 - P.fade;
  // triangular blue-noise dither, +-1 LSB of 8-bit output
  let bn = textureLoad(blueNoise, vec2u(in.pos.xy) & vec2u(63u), 0).r;
  let r = fract(bn + P.frame * 0.61803398875) * 2.0 - 1.0;
  let tri = sign(r) * (1.0 - sqrt(1.0 - abs(r)));
  d += vec3f(tri * P.dither / 255.0);
  return vec4f(d, 1.0);
}
