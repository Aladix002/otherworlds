struct Mote { p: vec4f, v: vec4f };
@group(1) @binding(0) var<storage, read_write> motes: array<Mote>;
@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&motes)) { return; }
  var m = motes[id.x];
  let flow = curl3(m.p.xyz * 0.07 + vec3f(0.0, G.time * 0.012, m.p.w * 0.001)) * 0.22 + vec3f(0.0, -0.012, 0.0);
  m.v = vec4f(mix(m.v.xyz, flow, 1.0 - exp(-G.dt * 0.5)), m.v.w);
  var p = m.p.xyz + m.v.xyz * G.dt;
  let rel = p - G.camPos;
  p = G.camPos + rel - vec3f(30.0, 16.0, 30.0) * round(rel / vec3f(30.0, 16.0, 30.0));
  m.p = vec4f(p, m.p.w);
  motes[id.x] = m;
}
