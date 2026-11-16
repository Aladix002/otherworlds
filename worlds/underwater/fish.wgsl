// Fish schools: boids around slowly wandering anchors (ping-pong buffers), drawn as instanced wiggling fish.
struct Fish { p: vec4f, v: vec4f };          // p.w = school, v.w = tail phase
struct School { c: vec4f, r: vec4f, m: vec4f };   // c = (center, speed), r = (wander radius, size), m = (start, count, species, seed)
@group(2) @binding(0) var<storage, read> fin: array<Fish>;
@group(2) @binding(1) var<storage, read_write> fout: array<Fish>;
@group(2) @binding(2) var<storage, read> schools: array<School>;
@group(2) @binding(3) var<storage, read> cols: array<vec4f>;
override NF: u32 = 256u;

fn anchor(S: School, t: f32) -> vec3f {
  let w = S.c.w / max(length(S.r.xz), 1.0) * 0.5;
  let ph = S.m.w;
  // species 6 (jacks) circle their centre
  if (S.m.z > 5.5) { return S.c.xyz + S.r.xyz * vec3f(sin(t * w * 2.0), sin(t * w * 0.71 + ph), cos(t * w * 2.0)); }
  return S.c.xyz + S.r.xyz * vec3f(sin(t * w + ph), sin(t * w * 0.71 + ph * 2.0), sin(t * w * 0.83 + ph * 1.3 + 1.0));
}

@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= NF) { return; }
  var F = fin[i];
  let S = schools[u32(F.p.w)];
  let p = F.p.xyz; let v = F.v.xyz;
  let sp = S.c.w; let size = S.r.w;
  let sard = step(3.5, S.m.z) * step(S.m.z, 4.5) + step(5.5, S.m.z);
  let A = anchor(S, G.time + f32(i % 7u) * mix(2.5, 0.3, sard));
  var sep = vec3f(0.0); var ali = vec3f(0.0); var coh = vec3f(0.0); var n = 0.0;
  let st = u32(S.m.x); let cnt = u32(S.m.y);
  for (var j = st; j < st + cnt; j++) {
    if (j == i) { continue; }
    let q = fin[j].p.xyz; let d = q - p; let dl = length(d);
    if (dl < 2.2) {
      ali += fin[j].v.xyz; coh += q; n += 1.0;
      if (dl < size * 3.5) { sep -= d / max(dl * dl, 0.004) * size; }
    }
  }
  let ta = A - p;
  var des = ta / max(length(ta), 1e-3) * sp * min(1.0, length(ta) / 5.0 + 0.25);
  if (n > 0.0) { des += (ali / n) * mix(0.1, 0.55, sard) + (coh / n - p) * mix(0.12, 0.35, sard); }
  des += sep * 1.4 + curl3(p * 0.12 + vec3f(0.0, G.time * 0.03, f32(u32(F.p.w)) * 3.0 + f32(i) * 0.37 * (1.0 - sard))) * sp * mix(1.1, 0.4, sard);
  // obstacles: seabed, surface, temple footprint, columns, the swimmer
  var floor = terrainH(p.xz) + 0.9;
  let inT = step(abs(p.x), 8.4) * step(abs(p.z - 44.0), 13.4);
  floor = max(floor, mix(floor, PADY + 3.4, inT));
  des.y += max(floor - p.y, 0.0) * 3.0;
  des.y -= max(p.y + 1.6, 0.0) * 3.0;
  if (inT > 0.5 && p.z > 51.0) { des.y -= max(p.y - (PADY + 6.2), 0.0) * 4.0; }
  for (var c = 0u; c < arrayLength(&cols); c++) {
    let C = cols[c];
    let d2 = p.xz - C.xy; let dl = length(d2);
    if (dl < C.z + 1.0 && p.y < C.w + 0.6) { des += vec3f(d2.x, 0.0, d2.y) / max(dl, 1e-3) * (C.z + 1.0 - dl) * 5.0; }
  }
  let dc = p - G.camPos; let dcl = length(dc);
  if (dcl < 3.5) { des += dc / max(dcl, 1e-3) * (3.5 - dcl) * 1.5 * sp; }
  var nv = mix(v, des, 1.0 - exp(-G.dt * 1.3));
  let s = length(nv);
  nv = nv / max(s, 1e-4) * clamp(s, sp * 0.3, sp * 1.7);
  nv.y *= 0.6;
  var np = p + nv * G.dt;
  np.y = max(np.y, terrainH(np.xz) + 0.25);
  F.p = vec4f(np, F.p.w);
  F.v = vec4f(nv, F.v.w + G.dt * (2.5 + length(nv) / size * 0.9));
  fout[i] = F;
}

// ---- draw ----
@group(2) @binding(0) var<storage, read> fishR: array<Fish>;
@group(2) @binding(1) var<storage, read> schoolsR: array<School>;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) @interpolate(flat) sp: vec2f };
@vertex fn vs(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let F = fishR[ii];
  let S = schoolsR[u32(F.p.w)];
  let hv = hash1u(ii * 13u + 5u);
  let size = S.r.w * (0.7 + 0.65 * hv); let spc = S.m.z;
  var lp = p;
  var shape = vec3f(1.0);
  if (spc < 0.5) { shape = vec3f(1.0, 1.35, 1.0); }
  else if (spc < 1.5) { shape = vec3f(1.0, 1.5, 0.9); }
  else if (spc > 3.5 && spc < 4.5) { shape = vec3f(0.85, 0.7, 1.1); }
  else if (spc > 5.5) { shape = vec3f(0.9, 1.3, 1.0); }
  lp *= shape;
  let amp = 0.16 * pow(max(0.4 - p.z, 0.0), 1.5);
  lp.x += sin(F.v.w - p.z * 6.0) * amp;
  let fw = normalize(F.v.xyz + vec3f(0.0, 0.0, 1e-5));
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fw);
  var o: VO;
  o.w = F.p.xyz + (rt * lp.x + up * lp.y + fw * lp.z) * size;
  o.n = normalize(rt * nn.x / shape.x + up * nn.y / shape.y + fw * nn.z / shape.z);
  o.lp = vec3f(p.xy, p.z); o.sp = vec2f(spc + uv.y * 10.0, hv);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  var n = normalize(in.n);
  let v = normalize(in.w - G.camPos);
  if (dot(n, v) > 0.0) { n = -n; }
  let fin = step(9.5, in.sp.x);
  let spc = in.sp.x - fin * 10.0;
  let hv = in.sp.y;
  let z = in.lp.z; let y = in.lp.y;
  var alb = vec3f(0.8);
  var spec = 0.2;
  if (spc < 0.5) {            // blue tang
    alb = mix(vec3f(0.04, 0.16, 0.85), vec3f(1.0, 0.8, 0.05), max(fin * step(z, -0.25), smoothstep(-0.3, -0.36, z)));
    alb = mix(alb, vec3f(0.02, 0.03, 0.12), smoothstep(0.02, 0.0, abs(y - 0.05 - 0.15 * sin(z * 4.0)) - 0.025) * 0.8);
  } else if (spc < 1.5) {     // yellow butterflyfish
    alb = mix(vec3f(1.0, 0.8, 0.08), vec3f(1.0, 0.55, 0.05), hv);
    alb = mix(alb, vec3f(0.05), smoothstep(0.03, 0.0, abs(z - 0.3) - 0.03));
    alb = mix(alb, vec3f(1.0, 1.0, 0.9), step(y, -0.06) * 0.6);
  } else if (spc < 2.5) {     // anthias
    alb = mix(mix(vec3f(1.0, 0.3, 0.4), vec3f(1.0, 0.5, 0.12), hv), vec3f(1.0, 0.75, 0.2), fin);
  } else if (spc < 3.5) {     // sergeant major
    alb = mix(vec3f(1.0, 0.42, 0.08), vec3f(1.0, 0.25, 0.12), hv);   // clownfish-like: coral orange, white bands
    let bd = smoothstep(0.045, 0.03, min(abs(z - 0.2), abs(z + 0.12)));
    alb = mix(alb, vec3f(1.0, 0.97, 0.92), bd * (1.0 - fin));
  } else if (spc < 4.5) {     // sardine
    alb = mix(vec3f(0.85, 0.9, 0.95), vec3f(0.08, 0.25, 0.38), smoothstep(-0.02, 0.06, y));
    spec = 1.4;
  } else if (spc < 5.5) {     // garibaldi
    alb = vec3f(1.0, 0.36, 0.04);
  } else {                    // jack: silver, dark back, yellow fins
    alb = mix(mix(vec3f(0.8, 0.85, 0.88), vec3f(0.2, 0.34, 0.4), smoothstep(0.0, 0.1, y)), vec3f(1.0, 0.8, 0.1), fin);
    spec = 1.0;
  }
  alb = mix(alb, vec3f(0.02), smoothstep(0.03, 0.015, length(vec2f(z - 0.36, y - 0.03))) * (1.0 - fin));
  var c = uwLit(alb, n, in.w, causticsAt(in.w), 1.0);
  let L = lightAt(in.w.y);
  c += L * spec * 0.5 * pow(max(dot(reflect(v, n), SUN), 0.0), 12.0) * (1.0 - fogF(distance(in.w, G.camPos)));
  // species 7: fish of gold-leaf light
  if (spc > 6.5) { c = mix(c, vec3f(1.9, 1.0, 0.2) * (0.5 + pow(1.0 - abs(dot(n, v)), 2.0)), 0.85 * (1.0 - fogF(distance(in.w, G.camPos)))); }
  return vec4f(c, 1.0);
}
