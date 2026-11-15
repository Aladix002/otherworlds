// Glowing fish shoals: each fish follows a lagged point of its shoal's path (one continuous flowing ribbon) plus a
// damped deviation state that parts around the camera and the whales and wanders on curl noise.
struct Fish { d: vec4f, v: vec4f, p: vec4f, f: vec4f };   // d = deviation + seed, v = velocity + lag, p = world pos, f = dir
@group(1) @binding(1) var<storage, read_write> fish: array<Fish>;
override NA: u32 = 1024u;
override NB: u32 = 2048u;

fn aoTarget(i: u32, lag: f32, t: f32) -> vec3f {
  let P = paths[select(select(5u, 4u, i < NB), 3u, i < NA)];
  let h = hash3u(vec3u(i, 3u, 1u));
  let F = aoFrame(P, t - lag, 0.0);
  let env = sin(3.14159 * clamp(lag / 10.0, 0.0, 1.0));
  let w = (0.5 + 2.0 * env) * (0.8 + 0.25 * sin(t * 0.17 + lag * 0.6));
  let an = lag * 0.55 + t * 0.1;                         // slowly twisting band
  let gr = sqrt(-2.0 * log(max(h.x, 1e-4)));
  let b = gr * cos(h.y * TAU) * w * 0.5;
  let th = gr * sin(h.y * TAU) * 0.2 * (0.5 + 0.5 * w);
  let ax = F.r * cos(an) + F.u * sin(an);
  let ay = F.u * cos(an) - F.r * sin(an);
  let wave = F.u * sin(lag * 0.8 - t * 0.45) * 1.6 + F.r * sin(lag * 0.5 - t * 0.3 + 1.0) * 1.2;
  // escort shoals (d.w = side offset) swim alongside their whale
  return F.p + ax * b + ay * th + wave + (F.r - 0.35 * F.u) * P.d.w;
}

@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&fish)) { return; }
  var f = fish[i];
  let t = G.time;
  let dt = min(G.dt, 0.05);
  let tg = aoTarget(i, f.v.w, t);
  var dev = f.d.xyz; var vel = f.v.xyz;
  let pos = tg + dev;
  let rel = pos - G.camPos;
  let dl = max(length(rel), 1e-3);
  var avoid = rel / dl * smoothstep(7.0, 1.5, dl) * 3.0;
  for (var k = 0u; k < 3u; k++) {          // keep clear of the whales' bodies and flippers
    let W = paths[k];
    for (var j = 0; j < 5; j++) {
      let sp = aoFrame(W, t, f32(j) * 0.22).p;
      let r = pos - sp;
      let d = max(length(r), 1e-3);
      let R = W.d.w * 0.2 + 4.0;
      avoid += r / d * smoothstep(R, R * 0.5, d) * 5.0;
    }
  }
  let nz = curl3(pos * 0.09 + vec3f(0.0, t * 0.03, f.d.w)) * 0.55;
  let acc = -0.65 * dev - 1.3 * vel + avoid + nz;
  vel += acc * dt;
  dev += vel * dt;
  let dlen = length(dev);
  if (dlen > 9.0) { dev *= 9.0 / dlen; }
  let p = tg + dev;
  let ahead = aoTarget(i, f.v.w, t + 0.25) + dev + vel * 0.25;
  f.d = vec4f(dev, f.d.w); f.v = vec4f(vel, f.v.w);
  f.f = vec4f(normalize(ahead - p + vec3f(0.0, 1e-4, 0.0)), 0.0);
  f.p = vec4f(p, 1.0);
  fish[i] = f;
}
