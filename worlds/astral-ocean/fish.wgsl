// Glowing fish shoals: each fish follows a lagged point of the shoal's path (a flowing ribbon) plus a damped
// deviation state that parts around the camera and wanders on curl noise.
struct Fish { d: vec4f, v: vec4f, p: vec4f, f: vec4f };   // d = deviation + seed, v = velocity + lag, p = world pos, f = dir
@group(1) @binding(1) var<storage, read_write> fish: array<Fish>;
override NHALF: u32 = 1024u;

fn aoTarget(i: u32, lag0: f32, t: f32) -> vec3f {
  let P = paths[select(3u, 4u, i >= NHALF)];
  let h = hash3u(vec3u(i, 3u, 1u));
  let h2 = hash3u(vec3u(i, 8u, 5u));
  // clumps along the ribbon
  let lag = 10.0 * (floor(lag0 / 10.0 * 7.0) + 0.5 + 0.42 * (h2.x - 0.5) + 0.25 * (h2.y - 0.5)) / 7.0;
  let F = aoFrame(P, t - lag, 0.0);
  let w = (0.6 + 2.2 * sin(3.14159 * clamp(lag / 10.0, 0.0, 1.0))) * (0.75 + 0.3 * sin(t * 0.17 + lag * 0.6));
  let an = lag * 0.7 + t * 0.12;                         // twisting band
  let gr = sqrt(-2.0 * log(max(h.x, 1e-4)));
  let b = gr * cos(h.y * TAU) * w * 0.42;
  let th = gr * sin(h.y * TAU) * 0.22 * (0.5 + 0.5 * w);
  let ax = F.r * cos(an) + F.u * sin(an);
  let ay = F.u * cos(an) - F.r * sin(an);
  let wave = F.u * sin(lag * 0.8 - t * 0.45) * 1.6 + F.r * sin(lag * 0.5 - t * 0.3 + 1.0) * 1.2;
  return F.p + ax * b + ay * th + wave;
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
  var avoid = rel / dl * smoothstep(6.5, 1.0, dl) * 3.0;
  for (var k = 0u; k < 3u; k++) {          // keep clear of the whales' bodies
    let W = paths[k];
    for (var j = 0; j < 5; j++) {
      let sp = aoFrame(W, t, f32(j) * 0.22).p;
      let r = pos - sp;
      let d = max(length(r), 1e-3);
      let R = W.d.w * 0.2 + 5.0;
      avoid += r / d * smoothstep(R, R * 0.4, d) * 4.0;
    }
  }
  let nz = curl3(pos * 0.09 + vec3f(0.0, t * 0.03, f.d.w)) * 0.55;
  let acc = -0.65 * dev - 1.3 * vel + avoid + nz;
  vel += acc * dt;
  dev += vel * dt;
  let dlen = length(dev);
  if (dlen > 7.0) { dev *= 7.0 / dlen; }
  let p = tg + dev;
  let ahead = aoTarget(i, f.v.w, t + 0.25) + dev + vel * 0.25;
  f.d = vec4f(dev, f.d.w); f.v = vec4f(vel, f.v.w);
  f.f = vec4f(normalize(ahead - p + vec3f(0.0, 1e-4, 0.0)), 0.0);
  f.p = vec4f(p, 1.0);
  fish[i] = f;
}

