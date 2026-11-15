// Appended after a world's postcard.wgsl. Renders the postcard either into the doorway quad or full screen.
struct PcU { frame: mat4x4f, a: vec4f, b: vec4f };  // a = (yaw, alpha, mode, _), b = (exposureInv, time, fog, _)
@group(1) @binding(0) var<uniform> PCU: PcU;
struct PcOut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f };

@vertex fn pc_vs_quad(@builtin(vertex_index) vi: u32) -> PcOut {
  // doorway opening x in [-0.48, 0.48], y in [0, 2.05], z = 0 (door-local)
  var c = array<vec2f, 6>(vec2f(-0.48, 0.0), vec2f(0.48, 0.0), vec2f(-0.48, 2.05), vec2f(-0.48, 2.05), vec2f(0.48, 0.0), vec2f(0.48, 2.05));
  var o: PcOut;
  let w = PCU.frame * vec4f(c[vi], 0.0, 1.0);
  o.wpos = w.xyz; o.pos = G.viewProj * w;
  return o;
}
@vertex fn pc_vs_full(@builtin(vertex_index) vi: u32) -> PcOut {
  var o: PcOut;
  o.pos = fsPos(vi);
  let ndc = o.pos.xy; // unnormalized ray is linear in screen space, so it interpolates exactly
  o.wpos = G.camPos + G.camFwd + ndc.x * G.tanHalfFov * G.aspect * G.camRight + ndc.y * G.tanHalfFov * G.camUp;
  return o;
}
@fragment fn pc_fs(in: PcOut) -> @location(0) vec4f {
  let rw = normalize(in.wpos - G.camPos);
  let cy = cos(PCU.a.x); let sy = sin(PCU.a.x);
  // world -> postcard space (inverse yaw rotation): looking straight through the door = (0,0,-1)
  let rd = normalize(vec3f(cy * rw.x - sy * rw.z, rw.y, sy * rw.x + cy * rw.z));
  var c = max(postcard(rd, PCU.b.y), vec3f(0.0)) * PCU.b.x;
  if (PCU.a.z < 0.5) { c = mix(c, G.fogColor, fogAmount(distance(in.wpos, G.camPos)) * PCU.b.z); }
  return vec4f(c, PCU.a.y);
}
