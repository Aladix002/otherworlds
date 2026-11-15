const CORE = vec3f(-0.316, 0.163, -0.935);
// ---------------- per-frame sky pass ----------------
@group(1) @binding(0) var farTex: texture_cube<f32>;
@group(1) @binding(1) var wispTex: texture_cube<f32>;
@group(1) @binding(2) var samp: sampler;

fn aoShell(ro: vec3f, rd: vec3f, R: f32) -> vec3f {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - R * R;
  let t = -b + sqrt(max(b * b - c, 0.0));
  return normalize(ro + rd * t);
}

fn aoStars(rd: vec3f, cells: f32, dens: f32, bright: f32, pa: f32, grow: f32) -> vec3f {
  let a = abs(rd);
  var uv: vec2f; var f: f32;
  if (a.x > a.y && a.x > a.z) { uv = rd.yz / a.x; f = sign(rd.x); }
  else if (a.y > a.z) { uv = rd.xz / a.y; f = 2.0 + sign(rd.y); }
  else { uv = rd.xy / a.z; f = 4.0 + sign(rd.z); }
  let g = (uv * 0.5 + 0.5) * cells;
  let cid = floor(g);
  let h = hash33(vec3f(cid, f * 17.0 + cells));
  if (h.z > dens) { return vec3f(0.0); }
  let sp = cid + 0.25 + 0.5 * h.xy;
  let dc = length(g - sp);
  let dpx = dc * (2.0 / cells) / pa * max(max(a.x, a.y), a.z) * 0.9;
  // power-law magnitudes: many faint points, few bright ones; brighter stars are larger and softer
  let mag = pow(1.0 - h.z / dens, 10.0);
  let sig = 0.85 + grow * sqrt(mag);
  let tw = 0.88 + 0.12 * sin(G.time * (0.4 + 0.9 * h.x) + h.y * 40.0);
  let tint = mix(mix(vec3f(0.65, 0.8, 1.3), vec3f(1.0, 0.97, 0.95), smoothstep(0.2, 0.5, h.x)), vec3f(1.3, 0.9, 0.62), smoothstep(0.7, 0.95, h.x));
  let gs = exp(-dpx * dpx / (2.0 * sig * sig));
  return tint * gs * smoothstep(0.25, 0.1, dc) * bright * (0.07 + 1.9 * mag) * tw;
}

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  let pa = 2.0 * G.tanHalfFov / G.resolution.y;
  let t = G.time;
  var col = textureSampleLevel(farTex, samp, rotY(t * 0.0015) * rd, 0.0).rgb;
  // stars sink behind dense gas
  let sd = 1.0 / (1.0 + 16.0 * dot(col, vec3f(0.3, 0.5, 0.2)));
  col += (aoStars(rd, 56.0, 0.16, 1.15, pa, 0.45) + aoStars(rd, 150.0, 0.08, 0.36, pa, 0.2)) * sd;
  // mid shell (r = 420), drifting slowly
  let d1 = aoShell(G.camPos - vec3f(0.0, 0.0, -40.0), rd, 420.0);
  let w1 = textureSampleLevel(wispTex, samp, rotY(t * 0.004) * d1, 0.0);
  col = col * (1.0 - w1.a) + w1.rgb;
  // near shell (r = 210), same bake seen from another angle and tinted
  let d2 = aoShell(G.camPos, rd, 210.0);
  let w2 = textureSampleLevel(wispTex, samp, rotX(1.9 + t * 0.003) * d2.zxy, 0.0);
  col = col * (1.0 - w2.a * 0.6) + w2.rgb * vec3f(1.15, 0.6, 1.05) * 0.5;
  return vec4f(col, 1.0);
}
