override WHICH: u32 = 0u;
@group(1) @binding(0) var outTex: texture_storage_2d_array<rgba16float, write>;
@group(1) @binding(1) var<uniform> FACE: vec4u;
@compute @workgroup_size(8, 8) fn bake(@builtin(global_invocation_id) id: vec3u) {
  let S = textureDimensions(outTex).x;
  if (id.x >= S || id.y >= S) { return; }
  let uv = (vec2f(id.xy) + 0.5) / f32(S) * 2.0 - 1.0;
  let d = aoFaceDir(FACE.x, uv);
  var o: vec4f;
  if (WHICH == 0u) { o = vec4f(aoFar(d), 1.0); } else { o = aoWisp(d); }
  textureStore(outTex, vec2u(id.xy), FACE.x, o);
}

