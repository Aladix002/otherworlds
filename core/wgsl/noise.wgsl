// ---- noise. All noises return roughly [-1,1] unless stated. ----
// 2D functions marked [JS] have a numerically matching twin in ctx.noise (core/src/noise.js)
// so CPU heightAt() can match GPU terrain.

// [JS] value noise 2D, quintic fade, [-1,1]
fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i;
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let c = vec2i(i);
  let a = u2f(hash2i(c));
  let b = u2f(hash2i(c + vec2i(1, 0)));
  let d = u2f(hash2i(c + vec2i(0, 1)));
  let e = u2f(hash2i(c + vec2i(1, 1)));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y) * 2.0 - 1.0;
}

fn sgrad2(c: vec2i) -> vec2f { let a = u2f(hash2i(c)) * TAU; return vec2f(cos(a), sin(a)); }

// [JS] simplex noise 2D, [-1,1]
fn snoise2(v: vec2f) -> f32 {
  let F2 = 0.36602540378; let G2 = 0.21132486541;
  let i = floor(v + (v.x + v.y) * F2);
  let x0 = v - i + (i.x + i.y) * G2;
  let o = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  let x1 = x0 - o + G2;
  let x2 = x0 - 1.0 + 2.0 * G2;
  let c = vec2i(i);
  let w = max(vec3f(0.5) - vec3f(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3f(0.0));
  let w4 = w * w * w * w;
  let n = vec3f(dot(sgrad2(c), x0), dot(sgrad2(c + vec2i(o)), x1), dot(sgrad2(c + vec2i(1, 1)), x2));
  return 70.0 * dot(w4, n);
}

// [JS] fractal sum of snoise2 (rotated octaves, lacunarity 2, gain 0.5), normalized to ~[-1,1]
fn fbm2(p0: vec2f, octaves: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var n = 0.0;
  let m = mat2x2f(0.8, 0.6, -0.6, 0.8);
  for (var i = 0; i < octaves; i++) { s += a * snoise2(p); n += a; p = m * p * 2.0 + vec2f(17.13, 5.71); a *= 0.5; }
  return s / n;
}
// [JS] fbm of value noise (cheaper, blockier)
fn vfbm2(p0: vec2f, octaves: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var n = 0.0;
  let m = mat2x2f(0.8, 0.6, -0.6, 0.8);
  for (var i = 0; i < octaves; i++) { s += a * vnoise2(p); n += a; p = m * p * 2.0 + vec2f(17.13, 5.71); a *= 0.5; }
  return s / n;
}
// [JS] ridged multifractal, [0,1]
fn ridge2(p0: vec2f, octaves: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var n = 0.0; var w = 1.0;
  let m = mat2x2f(0.8, 0.6, -0.6, 0.8);
  for (var i = 0; i < octaves; i++) {
    var r = 1.0 - abs(snoise2(p)); r = r * r * w; w = clamp(r * 2.0, 0.0, 1.0);
    s += a * r; n += a; p = m * p * 2.0 + vec2f(17.13, 5.71); a *= 0.5;
  }
  return s / n;
}

// value noise 3D, [-1,1]
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i;
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let c = vec3i(i);
  let n000 = u2f(hash3i(c)); let n100 = u2f(hash3i(c + vec3i(1, 0, 0)));
  let n010 = u2f(hash3i(c + vec3i(0, 1, 0))); let n110 = u2f(hash3i(c + vec3i(1, 1, 0)));
  let n001 = u2f(hash3i(c + vec3i(0, 0, 1))); let n101 = u2f(hash3i(c + vec3i(1, 0, 1)));
  let n011 = u2f(hash3i(c + vec3i(0, 1, 1))); let n111 = u2f(hash3i(c + vec3i(1, 1, 1)));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 2.0 - 1.0;
}

fn sgrad3(c: vec3i) -> vec3f {
  let h = hash3i(c);
  let z = u2f(h) * 2.0 - 1.0; let a = u2f(pcg(h)) * TAU; let r = sqrt(max(1.0 - z * z, 0.0));
  return vec3f(r * cos(a), r * sin(a), z);
}

// simplex noise 3D with analytic gradient: returns vec4(dN/dx, dN/dy, dN/dz, N), N in ~[-1,1]
fn snoise3d(p: vec3f) -> vec4f {
  let s = floor(p + dot(p, vec3f(1.0 / 3.0)));
  let x = p - s + dot(s, vec3f(1.0 / 6.0));
  let g = step(x.yzx, x.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x - i1 + 1.0 / 6.0;
  let x2 = x - i2 + 1.0 / 3.0;
  let x3 = x - 0.5;
  let c = vec3i(s);
  let g0 = sgrad3(c); let g1 = sgrad3(c + vec3i(i1)); let g2 = sgrad3(c + vec3i(i2)); let g3 = sgrad3(c + vec3i(1));
  let w = max(vec4f(0.6) - vec4f(dot(x, x), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  let w2 = w * w; let w4 = w2 * w2;
  let gd = vec4f(dot(g0, x), dot(g1, x1), dot(g2, x2), dot(g3, x3));
  let t = w2 * w * gd;
  let d = -8.0 * (t.x * x + t.y * x1 + t.z * x2 + t.w * x3) + w4.x * g0 + w4.y * g1 + w4.z * g2 + w4.w * g3;
  return 32.0 * vec4f(d, dot(w4, gd));
}
fn snoise3(p: vec3f) -> f32 { return snoise3d(p).w; }

fn fbm3(p0: vec3f, octaves: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var n = 0.0;
  for (var i = 0; i < octaves; i++) { s += a * snoise3(p); n += a; p = p * 2.03 + vec3f(17.13, 5.71, -9.37); a *= 0.5; }
  return s / n;
}
fn vfbm3(p0: vec3f, octaves: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var n = 0.0;
  for (var i = 0; i < octaves; i++) { s += a * vnoise3(p); n += a; p = p * 2.03 + vec3f(17.13, 5.71, -9.37); a *= 0.5; }
  return s / n;
}

// divergence-free curl-like flow field (cross product of two noise gradients); magnitude ~0..2
fn curl3(p: vec3f) -> vec3f {
  return cross(snoise3d(p).xyz, snoise3d(p + vec3f(31.416, -47.853, 12.793)).xyz) * 0.25;
}

// domain warp helper: p displaced by a 2D fbm field
fn warp2(p: vec2f, amount: f32, octaves: i32) -> vec2f {
  return p + amount * vec2f(fbm2(p, octaves), fbm2(p + vec2f(5.2, 1.3), octaves));
}

// Worley / cellular. Returns vec3(F1, F2, cellId in [0,1)).
fn voronoi2(p: vec2f) -> vec3f {
  let n = floor(p); let f = p - n;
  var f1 = 8.0; var f2 = 8.0; var id = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let h = hash2i(vec2i(n + g));
      let r = g + vec2f(u2f(h), u2f(pcg(h))) - f;
      let d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = u2f(pcg(h + 1u)); } else if (d < f2) { f2 = d; }
    }
  }
  return vec3f(sqrt(f1), sqrt(f2), id);
}
fn voronoi3(p: vec3f) -> vec3f {
  let n = floor(p); let f = p - n;
  var f1 = 8.0; var f2 = 8.0; var id = 0.0;
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let g = vec3f(f32(i), f32(j), f32(k));
        let h = hash3i(vec3i(n + g));
        let h2 = pcg(h);
        let r = g + vec3f(u2f(h), u2f(h2), u2f(pcg(h2))) - f;
        let d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = u2f(pcg(h + 7u)); } else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec3f(sqrt(f1), sqrt(f2), id);
}
