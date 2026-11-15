@group(1) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8) fn bake(@builtin(global_invocation_id) id: vec3u) {
  let S = textureDimensions(outTex).x;
  if (id.x >= S || id.y >= S) { return; }
  let uv = (vec2f(id.xy) + 0.5) / f32(S) * 2.0 - 1.0;
  var o: vec4f;
  for (var k = 0; k < 4; k++) {
    let off = vec2f(f32(k) * 17.3, f32(k) * 5.1);
    let w = uv + 0.35 * vec2f(fbm2(uv * 1.6 + off, 4), fbm2(uv * 1.6 + off + 9.0, 4));
    let r = length(w);
    let n = fbm2(w * 2.2 + off * 2.0, 4) * 0.5 + 0.5;
    let fil = pow(1.0 - abs(fbm2(w * 3.0 - off, 5)), 4.0);
    let fall = smoothstep(1.0, 0.05, r) * smoothstep(1.0, 0.55, length(uv));
    o[k] = clamp(fall * (smoothstep(0.3, 0.9, n) * 0.85 + fil * 0.18) * fall, 0.0, 1.0);
  }
  textureStore(outTex, vec2u(id.xy), o);
}
