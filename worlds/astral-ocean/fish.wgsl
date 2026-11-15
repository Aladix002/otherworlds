// Glowing fish shoals: each fish follows a lagged point of the shoal's path (a flowing ribbon) plus a damped
// deviation state that parts around the camera and wanders on curl noise.
struct Fish { d: vec4f, v: vec4f, p: vec4f, f: vec4f };   // d = deviation + seed, v = velocity + lag, p = world pos, f = dir
@group(1) @binding(1) var<storage, read_write> fish: array<Fish>;
override NHALF: u32 = 1024u;

fn aoTarget(i: u32, lag: f32, t: f32) -> vec3f {
  let P = paths[select(3u, 4u, i >= NHALF)];
  let F = aoFrame(P, t - lag, 0.0);
  let h = hash3u(vec3u(i, 3u, 1u));
  let w = (0.9 + 1.7 * sin(3.14159 * clamp(lag / 9.0, 0.0, 1.0))) * (0.8 + 0.25 * sin(t * 0.21 + lag * 0.7));
  let an = h.x * TAU + lag * 0.5 + t * 0.08;
  let rho = sqrt(h.y) * w;
  return F.p + F.r * cos(an) * rho * 1.7 + F.u * sin(an) * rho * 0.6;
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
  let avoid = rel / dl * smoothstep(6.5, 1.0, dl) * 3.0;
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

