// ---- underwater: shared terrain + water light model (prepended to every scene shader) ----
// G.params  = (fog density, fog max distance, deepness 0..1, kelpness 0..1)  (set per frame from camera depth)

const SUN = vec3f(0.2425, 0.9216, -0.3031);   // direction toward the refracted sun (underwater)
@group(1) @binding(0) var tCaus: texture_2d<f32>;
@group(1) @binding(1) var tNoise: texture_2d<f32>;
@group(1) @binding(2) var sRep: sampler;

override PADY: f32 = -13.0;
override DOORX: f32 = -3.0;
override DOORZ: f32 = 104.0;
override DOORY: f32 = -7.3;

fn uss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

fn terrainH(p: vec2f) -> f32 {
  let zw = p.y + 8.0 * fbm2(p * 0.008 + vec2f(3.1, -1.7), 2);
  var y = -7.0 - 6.0 * uss(115.0, 15.0, zw) - 8.0 * uss(25.0, -25.0, zw) - 14.0 * uss(-20.0, -140.0, zw)
          - 40.0 * uss(-138.0, -168.0, zw) - 32.0 * uss(-160.0, -250.0, zw) - 6.0 * uss(-230.0, -320.0, zw);
  let kelp = uss(10.0, -30.0, zw) * (1.0 - uss(-125.0, -160.0, zw));
  y += fbm2(p * 0.035, 3) * (0.7 + 1.3 * kelp);
  let slope = uss(-150.0, -175.0, zw) * (1.0 - uss(-250.0, -290.0, zw));
  y += (ridge2(p * 0.022 + vec2f(5.0, 1.0), 3) - 0.45) * 10.0 * slope;
  let ax = abs(p.x + 6.0 * fbm2(p * 0.01 + vec2f(-4.0, 2.0), 2));
  y += uss(80.0, 150.0, ax) * min(24.0, -y - 3.0);
  y += uss(110.0, 160.0, p.y) * min(16.0, -y - 3.0);
  let tw = 1.0 - uss(0.0, 7.0, sdBox2(p - vec2f(0.0, 44.0), vec2f(8.5, 13.5)));
  y = mix(y, PADY, tw);
  let dw = 1.0 - uss(2.5, 7.0, distance(p, vec2f(DOORX, DOORZ)));
  return mix(y, DOORY, dw);
}

// downwelling sunlight reaching depth -y (red goes first, golden kelp band, ultramarine then black)
fn lightAt(y: f32) -> vec3f {
  let d = clamp(-y, 0.0, 150.0);
  var l = exp(-d * vec3f(0.045, 0.022, 0.02)) * 2.2 * mix(vec3f(1.18, 1.0, 0.84), vec3f(1.0), uss(0.0, 30.0, d));
  l *= mix(vec3f(1.0), vec3f(1.3, 1.05, 0.8), uss(12.0, 24.0, d) * (1.0 - uss(34.0, 55.0, d)));
  l *= exp(-max(d - 35.0, 0.0) * 0.045) * mix(vec3f(1.0), vec3f(0.4, 0.75, 1.6), uss(35.0, 80.0, d));
  return l;
}
// in-scattered water color at depth
fn waterAt(y: f32) -> vec3f { return lightAt(y) * vec3f(0.03, 0.27, 0.37); }
fn causAmt(y: f32) -> f32 { return exp(max(-y, 0.0) * -0.055) * (1.0 - uss(30.0, 50.0, -y)); }

// color of open water seen along rd over distance dist
fn uwFogCol(rd: vec3f, dist: f32) -> vec3f {
  let ym = min(G.camPos.y + rd.y * min(dist, 70.0) * 0.5, -0.5);
  let w = waterAt(ym);
  var c = w * (1.0 + 0.9 * max(rd.y, 0.0) - 0.4 * max(-rd.y, 0.0));
  let mu = max(dot(rd, SUN), 0.0);
  c += w * (0.8 * mu * mu * mu * mu + 1.5 * pow(mu, 24.0));
  return c;
}
fn fogF(d: f32) -> f32 { return max(1.0 - exp(-G.params.x * d), uss(G.params.y * 0.5, G.params.y, d)); }
fn uwFog(col: vec3f, wp: vec3f) -> vec3f {
  let v = wp - G.camPos; let d = length(v); let rd = v / max(d, 1e-4);
  let ab = exp(-d * vec3f(0.03, 0.006, 0.004));
  return mix(col * ab, uwFogCol(rd, d), fogF(d));
}
// animated caustics (mip-mapped texture, two drifting layers), projected along the sun direction
fn causticsAt(wp: vec3f) -> vec3f {
  let q = wp.xz - SUN.xz * (wp.y / SUN.y);
  let t = G.time;
  let a = textureSample(tCaus, sRep, q * 0.085 + vec2f(t * 0.013, t * 0.007)).rgb;
  let b = textureSample(tCaus, sRep, q * vec2f(-0.061, 0.066) + vec2f(t * -0.009, t * 0.012) + 0.37).rgb;
  return a * b * 3.0 + (a + b) * 0.12;
}
// standard underwater surface lighting: albedo lit by sun (diffuse + caustics) and water ambient, then fogged
fn uwLit(albedo: vec3f, n: vec3f, wp: vec3f, caus: vec3f, ao: f32) -> vec3f {
  let L = lightAt(wp.y);
  let w = waterAt(wp.y);
  let dif = wrapDiffuse(n, SUN, 0.35);
  let amb = w * mix(0.5, 1.6, n.y * 0.5 + 0.5);
  let c = albedo * (L * (dif * 0.42 + caus * causAmt(wp.y) * max(dot(n, SUN) + 0.1, 0.0)) * ao + amb * (0.4 + 0.6 * ao));
  return uwFog(c, wp);
}
