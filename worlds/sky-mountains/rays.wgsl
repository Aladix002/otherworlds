// ---- sun shafts: 1) quarter-res radial march of sky visibility toward the sun, 2) additive composite ----
@group(1) @binding(0) var DT: texture_depth_2d;
struct RO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) sun: vec2f };
@vertex fn vsRay(@builtin(vertex_index) vi: u32) -> RO {
  var o: RO; o.pos = fsPos(vi); o.uv = fsUV(vi);
  let c = G.viewProj * vec4f(G.camPos + G.sunDir * 1000.0, 1.0);
  o.sun = vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5);
  return o;
}
@fragment fn fsRay(in: RO) -> @location(0) vec4f {
  var dl = in.sun - in.uv;
  dl = dl * min(1.0, 0.75 / max(length(dl * vec2f(G.aspect, 1.0)), 1e-3)) / 20.0;
  let j = fract(52.9829189 * fract(dot(in.pos.xy, vec2f(0.06711056, 0.00583715))));
  var uv = in.uv + dl * j;
  var acc = 0.0; var wt = 0.0; var w = 1.0;
  let mx = vec2i(G.resolution) - vec2i(1);
  for (var i = 0; i < 20; i++) {
    let q = clamp(vec2i(uv * G.resolution), vec2i(0), mx);
    let inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    acc += w * mix(0.6, step(textureLoad(DT, q, 0), 0.0), inside);
    wt += w; w *= 0.94; uv += dl;
  }
  return vec4f(acc / wt, 0.0, 0.0, 1.0);
}
@group(2) @binding(0) var RT: texture_2d<f32>;
@group(2) @binding(1) var RS: sampler;
@fragment fn fsRayMix(in: RO) -> @location(0) vec4f {
  let px = 1.0 / vec2f(textureDimensions(RT));
  let v = (textureSample(RT, RS, in.uv + px * vec2f(0.75, 0.25)).r + textureSample(RT, RS, in.uv + px * vec2f(-0.25, 0.75)).r
    + textureSample(RT, RS, in.uv + px * vec2f(-0.75, -0.25)).r + textureSample(RT, RS, in.uv + px * vec2f(0.25, -0.75)).r) * 0.25;
  let rd = viewRay(in.uv);
  let s = max(dot(rd, G.sunDir), 0.0);
  // in-scatter grows with the depth of air in front of the surface
  let dist = G.near / max(textureLoad(DT, vec2i(in.pos.xy), 0), 1e-6);
  let air = 1.0 - exp(-dist * 0.0018);
  let glow = pow(s, 5.0) * 0.4 + pow(s, 24.0) * 0.1;
  return vec4f(G.sunColor * vec3f(1.0, 0.82, 0.6) * (v * v * glow * air * G.params.x * 0.26), 0.0);
}
