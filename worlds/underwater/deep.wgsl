// The deep: siphonophore chains (swimming bells, glowing beads with halos, a curtain of fine tentacles, a slow light
// pulse running along) and comb jellies (translucent bodies, rainbow waves travelling along the comb rows).
@group(2) @binding(0) var<storage, read> jel: array<vec4f>;    // comb jellies: pos, scale
override NBD: u32 = 70u;
const CH = array<vec4f, 5>(vec4f(-5.4, -92.4, -271.0, 0.0), vec4f(14.0, -87.0, -292.0, 1.0), vec4f(-30.0, -78.0, -238.0, 2.0),
                           vec4f(35.0, -99.0, -262.0, 0.0), vec4f(6.0, -56.0, -172.0, 1.0));
fn chainP(c: u32, fk: f32) -> vec3f {
  let C = CH[c]; let f = f32(c) * 1.7; let t = G.time - fk * 0.85;
  return C.xyz + vec3f(9.0 * sin(t * 0.021 + f), 2.5 * sin(t * 0.033 + f * 2.0), 7.0 * sin(t * 0.017 + f * 0.7 + 1.0))
    + vec3f(0.12 * sin(G.time * 0.5 + fk * 0.4), -0.0002 * fk * fk, 0.0);
}
fn hue(c: f32) -> vec3f {
  return select(select(vec3f(0.15, 0.85, 1.0), vec3f(0.6, 0.4, 1.0), c > 0.5), vec3f(0.25, 1.0, 0.55), c > 1.5);
}
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) kind: f32 };
@vertex fn vsChain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = ii / NBD; let k = ii % NBD; let fk = f32(k);
  let t = G.time;
  let p = chainP(c, fk);
  let cc = cs[vi % 6u];
  var o: VO;
  o.c = cc;
  let d = distance(p, G.camPos);
  let fade = (1.0 - fogF(d) * 0.85) * uss(0.4, 1.8, d);
  let pulse = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * 0.7 - fk * 0.18 + f32(c)), 4.0);
  let col = hue(CH[c].w);
  let hk = hash1u(ii * 7u + 3u);
  let bell = step(fk, 6.5);
  if (vi < 6u) {
    // swimming bells at the head, then beads with a soft halo
    let sz = mix(select(0.16, 0.3, k % 3u == 0u), 0.24 - fk * 0.012, bell);
    o.pos = G.viewProj * vec4f(billboard(p, cc, vec2f(sz + d * 0.002)), 1.0);
    o.col = mix(col * pulse * select(0.9, 1.5, k % 3u == 0u), col * 0.45 + vec3f(0.08), bell) * fade;
    o.kind = bell;
  } else if (vi < 12u) {
    // stem segment to the previous bead
    let seg = chainP(c, fk - 1.0) - p;
    let side = normalize(cross(seg, G.camPos - p) + vec3f(1e-5, 0.0, 0.0)) * (0.016 + d * 0.0012);
    o.pos = G.viewProj * vec4f(p + seg * (cc.y * 0.5 + 0.5) + side * cc.x, 1.0);
    o.col = col * 0.45 * pulse * fade * step(0.5, fk);
    o.kind = 2.0;
  } else {
    // fine tentacle hanging from the bead, trailing behind and swaying
    let len = (0.5 + 1.9 * hk * hk) * (1.0 - bell) * smoothstep(70.0, 50.0, fk);
    let y = cc.y * 0.5 + 0.5;
    let sw = vec3f(sin(t * 0.4 + fk * 0.7), 0.0, cos(t * 0.33 + fk * 0.9)) * 0.14 * y * y * len;
    let q = p + vec3f(0.0, -len * y, 0.0) + (chainP(c, fk + 3.0) - p) * (y * y * 0.5) + sw;
    let side = normalize(cross(vec3f(0.0, 1.0, 0.0), G.camPos - q)) * (0.011 + d * 0.0011);
    o.pos = G.viewProj * vec4f(q + side * cc.x, 1.0);
    o.c = vec2f(cc.x, y * len * 7.0 + hk * 9.0 - t * 0.12);
    o.col = mix(col, vec3f(0.7, 0.8, 1.0), 0.25) * (0.5 * pulse * fade * (1.0 - y * 0.75));
    o.kind = 3.0;
  }
  return o;
}
@fragment fn fsGlow(in: VO) -> @location(0) vec4f {
  var a: f32;
  let x2 = 1.0 - in.c.x * in.c.x;
  if (in.kind > 2.5) { a = x2 * (0.3 + 0.7 * smoothstep(0.25, 0.0, abs(fract(in.c.y) - 0.5))); }
  else if (in.kind > 1.5) { a = x2; }
  else {
    let r2 = dot(in.c, in.c);
    if (in.kind > 0.5) {
      // translucent bell: soft rim, faint dome, bright core
      let r = sqrt(r2);
      a = smoothstep(1.0, 0.72, r) * (0.1 + 0.5 * smoothstep(0.25, 0.85, r)) + exp(-r2 * 30.0) * 0.5;
    } else { a = exp(-r2 * 6.0) * 0.22 + exp(-r2 * 90.0) * 1.2; }
    a *= smoothstep(1.0, 0.8, r2);
  }
  return vec4f(in.col * a, 0.0);
}

// comb jellies (mesh: unit ovoid, additive)
struct JO { @builtin(position) pos: vec4f, @location(0) lp: vec3f, @location(1) n: vec3f, @location(2) w: vec3f, @location(3) @interpolate(flat) id: f32 };
@vertex fn vsJelly(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> JO {
  let J = jel[ii]; let t = G.time; let f = f32(ii) * 2.1;
  let c = J.xyz + vec3f(1.2 * sin(t * 0.05 + f), 0.6 * sin(t * 0.09 + f * 1.3), 1.0 * sin(t * 0.04 + f * 0.7));
  let R = rotY(t * 0.05 + f) * rotX(0.35 * sin(t * 0.07 + f) + 0.25);
  let br = 1.0 + 0.05 * sin(t * 0.9 + f + p.y * 2.0);
  var o: JO;
  o.w = c + R * (p * vec3f(br, 1.0, br) * J.w); o.n = R * n; o.lp = p; o.id = f32(ii);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsJelly(in: JO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let v = normalize(G.camPos - in.w);
  let nv = abs(dot(normalize(in.n), v));
  let fres = pow(1.0 - nv, 2.0);
  let ang = atan2(in.lp.z, in.lp.x) / TAU * 8.0;
  let rid = floor(ang);
  let row = abs(fract(ang) - 0.5);
  let y = in.lp.y;
  // comb plates along 8 meridians; rainbow diffraction waves run down each row
  let plate = 0.45 + 0.55 * smoothstep(0.15, 0.6, abs(fract(y * 16.0) - 0.5) * 2.0);
  let mask = smoothstep(0.075, 0.02, row) * smoothstep(0.98, 0.6, abs(y)) * plate;
  let ph = y * 5.0 + G.time * 1.3 + rid * 0.9 + in.id * 1.7;
  let wave = pow(0.5 + 0.5 * sin(ph), 3.0);
  let rb = hsv2rgb(vec3f(fract(y * 0.8 + G.time * 0.16 + rid * 0.11 + in.id * 0.37), 0.75, 1.0));
  let d = distance(in.w, G.camPos);
  let fade = (1.0 - fogF(d) * 0.8) * uss(0.3, 1.2, d);
  // glassy body: fresnel rim, faint inner organs (pharynx + canals), brighter front shell
  let core = exp(-dot(in.lp.xz, in.lp.xz) * 14.0) * smoothstep(0.9, -0.2, y);
  var body = vec3f(0.07, 0.2, 0.3) * (fres * 1.3 + 0.07) + vec3f(0.22, 0.1, 0.3) * core * 0.6 * nv;
  let fr = select(0.45, 1.0, ff);
  return vec4f((body + rb * mask * (0.12 + 1.5 * wave)) * fade * fr, 0.0);
}
